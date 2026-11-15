// The app's change log (used by index.html). The Google Sheet just stores these ops in order.
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
