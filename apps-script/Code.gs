// AUTO-BUILT from ../ops.js + server code: paste this whole file into Extensions > Apps Script.

// Shared by the app (index.html) and the Google Apps Script (apps-script/Code.gs).
// Every change is an "op". Applying the same op twice is harmless, so a coach's phone can
// safely resend after a dropped connection, and every device that replays the ops in the
// Sheet's order ends up with the same data.
//
// Op shapes:
//   {t:'upsert', c:'players'|'groups'|'goals'|'trackers', v:item}   add or replace an item
//   {t:'del',    c:'players'|'groups'|'goals'|'trackers', id}  delete an item
//   {t:'order',  c:'players'|'groups'|'goals', ids:[...]} reorder a list
//   {t:'game',    v:{id,name,date,period,ended,present,lines,goalIds}}  add or update a game + its lineup
//   {t:'gamedel', id}
//   {t:'ev',      g:gameId, v:event}                      a points award
//   {t:'evdel',   id}
//   {t:'potg',    v:{id,trackerId,playerId,gameId,gameName,date,ts}} a tracker mark (POTG, started, ...)
//   {t:'potgdel', id}

// Trackers are things counted across games ("Player of the Game", "Started the game").
// The two defaults have fixed ids so every device agrees on them.
const DEFAULT_TRACKERS = [{ id: 'potg', name: 'Player of the Game', icon: '★' }, { id: 'start', name: 'Started the Game', icon: '🥅' }];
function blankState(){ return { players: [], groups: [], goals: [], trackers: [], games: [], potg: [], dead: {} }; }

function applyOp(st, op){
  st.dead = st.dead || {}; st.potg = st.potg || []; st.trackers = st.trackers || [];
  const v = op.v, copy = () => JSON.parse(JSON.stringify(v));
  switch (op.t){
    case 'upsert': {
      if (st.dead[v.id]) return;
      const a = st[op.c], i = a.findIndex(x => x.id === v.id);
      if (i >= 0) a[i] = copy(); else a.push(copy());
      return;
    }
    case 'del':
      st.dead[op.id] = 1;
      st[op.c] = st[op.c].filter(x => x.id !== op.id);
      if (op.c === 'players') st.groups.forEach(g => g.members = g.members.filter(m => m !== op.id));
      return;
    case 'order': {
      const pos = {}; op.ids.forEach((id, i) => pos[id] = i);
      const at = id => (id in pos ? pos[id] : 1e9);
      st[op.c].sort((x, y) => at(x.id) - at(y.id));
      return;
    }
    case 'game': {
      if (st.dead[v.id]) return;
      let g = st.games.find(x => x.id === v.id);
      if (!g){ g = { events: [] }; st.games.push(g); }
      const events = g.events; Object.assign(g, copy()); g.events = events;
      return;
    }
    case 'gamedel':
      st.dead[op.id] = 1;
      st.games = st.games.filter(x => x.id !== op.id);
      return;
    case 'ev': {
      if (st.dead[op.g] || st.dead[v.id]) return;
      let g = st.games.find(x => x.id === op.g);
      if (!g){ g = { id: op.g, name: 'Game', date: '', period: '1', ended: false, events: [] }; st.games.push(g); }
      if (!g.events.some(e => e.id === v.id)) g.events.push(copy());
      return;
    }
    case 'evdel':
      st.dead[op.id] = 1;
      st.games.forEach(g => g.events = g.events.filter(e => e.id !== op.id));
      return;
    case 'potg':
      if (st.dead[v.id]) return;
      if (!st.potg.some(x => x.id === v.id)) st.potg.push(copy());
      return;
    case 'potgdel':
      st.dead[op.id] = 1;
      st.potg = st.potg.filter(x => x.id !== op.id);
      return;
  }
}

// Every op needed to recreate a whole state (used when a device first connects to an empty Sheet).
function snapshotOps(st){
  const ops = [];
  ['players', 'groups', 'goals', 'trackers'].forEach(c => {
    (st[c] || []).forEach(v => ops.push({ t: 'upsert', c, v }));
    ops.push({ t: 'order', c, ids: (st[c] || []).map(x => x.id) });
  });
  st.games.forEach(g => {
    const meta = JSON.parse(JSON.stringify(g)); delete meta.events; meta.ended = !!meta.ended;
    ops.push({ t: 'game', v: meta });
    g.events.forEach(e => ops.push({ t: 'ev', g: g.id, v: e }));
  });
  (st.potg || []).forEach(v => ops.push({ t: 'potg', v }));
  return ops;
}

// ===================== Shift Points: Google Sheet sync =====================
// 1. Change TEAM_CODE below to something only your coaches know.
// 2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
// 3. Paste the web app URL (ends in /exec) and the team code into the app (tap "Sync off").

const TEAM_CODE = 'change-me';

function doGet(){ return json_({ ok: true, app: 'shift-points' }); }

function doPost(e){
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err){ return json_({ error: 'Bad request' }); }
  if (String(req.code || '') !== TEAM_CODE) return json_({ error: 'Wrong team code' });

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const log = tab_(ss, 'Log', ['Seq', 'Received', 'Coach', 'Device', 'Change']);
    const ops = Array.isArray(req.ops) ? req.ops : [];
    let last = log.getLastRow() - 1; // row 1 is the header, so seq == number of changes
    if (ops.length){
      const now = new Date();
      log.getRange(last + 2, 1, ops.length, 5).setValues(
        ops.map((op, i) => [last + 1 + i, now, String(req.coach || ''), String(req.device || ''), JSON.stringify(op)]));
      last += ops.length;
    }
    const since = Math.max(0, Math.min(last, Number(req.since) || 0));
    let out = [];
    if (last > since){
      out = log.getRange(since + 2, 1, last - since, 5).getValues()
        .map(r => ({ seq: r[0], device: r[3], op: JSON.parse(r[4]) }));
    }
    if (ops.length) rebuild_(ss, log, last);
    return json_({ seq: last, ops: out });
  } finally {
    lock.releaseLock();
  }
}

// Replays every change and rewrites the human-readable tabs.
function rebuild_(ss, log, last){
  const st = blankState();
  if (last > 0) log.getRange(2, 5, last, 1).getValues().forEach(r => applyOp(st, JSON.parse(r[0])));
  const pl = id => st.players.find(p => p.id === id);
  const nm = p => p ? (p.number ? '#' + p.number + ' ' : '') + p.name : '(removed)';
  const games = st.games.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const present = g => g.present || st.players.map(p => p.id);
  const lines = g => g.lines || st.groups;
  const goalIds = g => g.goalIds || st.goals.map(x => x.id);
  const allEv = games.reduce((a, g) => a.concat(g.events.map(e => ({ g: g, e: e }))), []);
  const goalOf = id => st.goals.find(x => x.id === id);
  // Overall score uses each goal's CURRENT points, so changing a goal's points re-scores every game.
  const w = e => { const x = goalOf(e.goalId); return x ? (Number(x.points) || 0) : (e.points || 0); };
  const sum = list => list.reduce((a, x) => a + w(x.e), 0);
  const scopeName = { individual: 'Individual', group: 'Line / Group', team: 'Whole Team' };

  const trackers = st.trackers.length ? st.trackers : DEFAULT_TRACKERS;
  const marks = (tid, pid) => st.potg.filter(x => (x.trackerId || 'potg') === tid && x.playerId === pid);
  write_(ss, 'Trackers', ['Player'].concat(trackers.map(t => t.name)),
    st.players.map(p => [nm(p)].concat(trackers.map(t => marks(t.id, p.id).length))));
  write_(ss, 'Tracker Log', ['Tracker', 'Player', 'Date', 'Game', 'Game ID'],
    st.potg.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(x => {
      const t = trackers.find(t => t.id === (x.trackerId || 'potg'));
      return [t ? t.name : '(deleted)', nm(pl(x.playerId)), x.date || '', x.gameName || '', x.gameId || ''];
    }));

  write_(ss, 'Players', ['Player', 'Games Here', 'Own Points', 'Line Points', 'Team Points', 'Player of the Game'],
    st.players.map(p => {
      const own = allEv.filter(x => x.e.targetType === 'player' && x.e.targetId === p.id);
      const line = allEv.filter(x => x.e.targetType === 'group' && (x.e.members || []).indexOf(p.id) >= 0);
      const team = allEv.filter(x => x.e.targetType === 'team' && (x.e.members || []).indexOf(p.id) >= 0);
      return [nm(p), games.filter(g => present(g).indexOf(p.id) >= 0).length, sum(own), sum(line), sum(team),
              marks('potg', p.id).length];
    }));

  write_(ss, 'Games', ['Game ID', 'Date', 'Game', 'Status', 'Players Here', 'Out', 'Awards', 'Points', 'Player of the Game', 'Started'],
    games.map(g => {
      const here = present(g);
      return [g.id, g.date, g.name, g.ended ? 'Final' : (g.events.length ? 'Live' : 'Upcoming'),
        here.map(id => nm(pl(id))).join(', '),
        st.players.filter(p => here.indexOf(p.id) < 0).map(nm).join(', '),
        g.events.length, g.events.reduce((a, e) => a + w(e), 0),
        st.potg.filter(x => x.gameId === g.id && (x.trackerId || 'potg') === 'potg').map(x => nm(pl(x.playerId))).join(', '),
        st.potg.filter(x => x.gameId === g.id && x.trackerId === 'start').map(x => nm(pl(x.playerId))).join(', ')];
    }));

  const lineRows = [];
  games.forEach(g => lines(g).forEach(l => lineRows.push([g.id, g.date, g.name, l.name,
    l.members.filter(m => present(g).indexOf(m) >= 0).map(m => nm(pl(m))).join(', '),
    g.events.filter(e => e.targetType === 'group' && e.targetId === l.id).reduce((a, e) => a + w(e), 0)])));
  write_(ss, 'Lines', ['Game ID', 'Date', 'Game', 'Line', 'Players', 'Line Points'], lineRows);

  write_(ss, 'Awards', ['Game ID', 'Date', 'Game', 'Period', 'Time', 'Type', 'Who', 'Goal', 'Points', 'Players', 'Coach'],
    allEv.map(x => [x.g.id, x.g.date, x.g.name, x.e.period, new Date(x.e.ts), x.e.targetType, x.e.targetName,
      x.e.goalName, w(x.e), (x.e.members || []).map(id => nm(pl(id))).join(', '), x.e.coach || '']));

  // Tally: one row per game x goal x who, ready for a pivot table or chart.
  const tally = {};
  allEv.forEach(x => {
    const k = [x.g.id, x.e.goalId, x.e.targetType, x.e.targetType === 'group' ? x.e.targetName : x.e.targetId].join('|');
    if (!tally[k]){ const gl = goalOf(x.e.goalId);
      tally[k] = [x.g.id, x.g.date, x.g.name, gl ? gl.name : x.e.goalName, scopeName[gl ? gl.scope : ''] || x.e.targetType,
                  x.e.targetType === 'player' ? nm(pl(x.e.targetId)) : x.e.targetName, 0, w(x.e), 0]; }
    tally[k][6]++; tally[k][8] += w(x.e);
  });
  write_(ss, 'Tally', ['Game ID', 'Date', 'Game', 'Goal', 'Level', 'Who', 'Times', 'Points Each', 'Points'], Object.keys(tally).map(k => tally[k]));

  write_(ss, 'Goals', ['Goal', 'Icon', 'Who Earns It', 'Points', 'Times Awarded', 'Games Used'],
    st.goals.map(x => [x.name, x.icon || '', scopeName[x.scope] || x.scope, x.points,
      allEv.filter(a => a.e.goalId === x.id).length, games.filter(g => goalIds(g).indexOf(x.id) >= 0).length]));

  write_(ss, 'Roster', ['Number', 'Player', 'Default Lines'],
    st.players.map(p => [p.number || '', p.name, st.groups.filter(g => g.members.indexOf(p.id) >= 0).map(g => g.name).join(', ')]));

  ss.setActiveSheet(ss.getSheetByName('Trackers'));
}

function tab_(ss, name, header){
  let sh = ss.getSheetByName(name);
  if (!sh){
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function write_(ss, name, header, rows){
  const sh = tab_(ss, name, header);
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
