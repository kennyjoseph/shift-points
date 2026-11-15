// Shift Points: Google Sheet sync. Paste this whole file into Extensions > Apps Script.
//
// This script is deliberately simple and should never need to change. It:
//   1. keeps a log of every change the app sends (the "Log" tab), and hands back changes a device hasn't seen;
//   2. writes whatever summary tabs the app sends (Tally, Players, Games, ...). The app decides what those
//      tabs contain, so new columns or tabs arrive with app updates, not by editing this script.
//
// Setup: change TEAM_CODE below, then Deploy > New deployment > Web app,
//        Execute as: Me, Who has access: Anyone. Send the /exec URL to whoever maintains the app.

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
    let log = ss.getSheetByName('Log');
    if (!log){
      log = ss.insertSheet('Log');
      log.getRange(1, 1, 1, 5).setValues([['Seq', 'Received', 'Coach', 'Device', 'Change']]).setFontWeight('bold');
      log.setFrozenRows(1);
    }
    const ops = Array.isArray(req.ops) ? req.ops : [];
    let last = log.getLastRow() - 1; // row 1 is the header, so seq == number of changes
    if (ops.length){
      const now = new Date();
      log.getRange(last + 2, 1, ops.length, 5).setValues(
        ops.map((op, i) => [last + 1 + i, now, String(req.coach || ''), String(req.device || ''), JSON.stringify(op)]));
      last += ops.length;
    }
    const since = Math.max(0, Math.min(last, Number(req.since) || 0));
    const out = last > since
      ? log.getRange(since + 2, 1, last - since, 5).getValues().map(r => ({ seq: r[0], device: r[3], op: JSON.parse(r[4]) }))
      : [];

    if (req.tabs && typeof req.tabs === 'object'){
      Object.keys(req.tabs).forEach(name => writeTab_(ss, name, req.tabs[name]));
    }
    return json_({ seq: last, ops: out });
  } finally {
    lock.releaseLock();
  }
}

// Replace a summary tab with the rows the app sent (first row = header).
function writeTab_(ss, name, rows){
  name = String(name).slice(0, 90);
  if (name === 'Log' || !Array.isArray(rows) || !rows.length) return;
  const width = Math.max.apply(null, rows.map(r => (Array.isArray(r) ? r.length : 0)));
  if (!width) return;
  const clean = rows.map(r => { const a = (Array.isArray(r) ? r : []).map(safe_); while (a.length < width) a.push(''); return a; });
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, clean.length, width).setValues(clean);
  sh.getRange(1, 1, 1, width).setFontWeight('bold');
  sh.setFrozenRows(1);
}
// Plain values only: never let text from the app become a formula.
function safe_(v){
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  v = v == null ? '' : String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
