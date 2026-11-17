'use strict';
/* run/verify-start.js: the last step of the Compute Lab setup files. Setup only says the worker is running after
 * this passes: the worker process is alive AND it has checked in with the coordinator (coord.js writes
 * ~/.bugbrain/coord-alive.json after the coordinator answers its check-in).
 * Usage: node run/verify-start.js --url <coordinator> --token-file <file> --since <epoch ms> [--wait <seconds>]
 * Exit 0 when verified. Otherwise prints FAIL with a plain fix, sends a "setup" diagnostics report, and exits 1. */
var fs = require('fs'), path = require('path');
var D = require('./diag.js');

function arg(name, dflt) { var i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; }
var base = arg('url', process.env.BB_COORDINATOR_URL || '');
var tokenFile = arg('token-file', process.env.BB_COORDINATOR_TOKEN_FILE || path.join(D.STATE, 'coordinator-token'));
var since = +arg('since', '0') || 0;
var waitS = +arg('wait', '150') || 150;
var aliveFile = path.join(D.STATE, 'coord-alive.json');

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function pidAlive(pid) { if (!pid) return false; try { process.kill(+pid, 0); return true; } catch (e) { return e && e.code === 'EPERM'; } }
function launcherPid() { try { return +String(fs.readFileSync(path.join(D.STATE, 'computelab.pid'), 'utf8')).trim() || 0; } catch (e) { return 0; } }

/* Pure decision, exported for tests. */
function judge(state) {
  if (state.alive && state.aliveAt >= state.since && state.coordRunning) return { ok: true };
  if (!state.launcherRunning && !state.coordRunning) {
    return { ok: false, what: 'the worker program is not running',
      fix: 'Run ' + (process.platform === 'win32' ? '%USERPROFILE%\\.bugbrain\\computelab-worker.ps1 in PowerShell' : 'sh ~/.bugbrain/computelab-worker.sh') + ' to see the error, or send the owner the lines above.' };
  }
  var why = state.status && state.status.why ? ' (' + String(state.status.why).slice(0, 160) + ')' : '';
  return { ok: false, what: 'the worker started but has not checked in with the coordinator' + why,
    fix: 'Check the internet connection and that this computer was not revoked on the Compute Lab page, then run the setup again. The worker log is ' + path.join(D.STATE, 'worker.log') + '.' };
}

function snapshot() {
  var a = readJson(aliveFile), st = readJson(path.join(D.STATE, 'status.json'));
  var at = a && a.at ? Date.parse(a.at) || 0 : 0;
  return { since: since, alive: !!a, aliveAt: at, coordRunning: !!(a && pidAlive(a.pid)), launcherRunning: pidAlive(launcherPid()), status: st };
}

function main() {
  var deadline = Date.now() + waitS * 1000, dots = 0;
  process.stdout.write('  ..    waiting for the worker to check in with the coordinator');
  (function tick() {
    var s = snapshot(), v = judge(s);
    if (v.ok) {
      console.log('');
      console.log('  OK    worker is running (process ' + readJson(aliveFile).pid + ') and checked in at ' + new Date(s.aliveAt).toLocaleTimeString());
      process.exitCode = 0; return;
    }
    if (Date.now() < deadline) { if (++dots % 5 === 0) process.stdout.write('.'); setTimeout(tick, 1000); return; }
    console.log('');
    console.log('  FAIL  ' + v.what);
    console.log('Fix: ' + v.fix);
    var log = [];
    try { log = String(fs.readFileSync(path.join(D.STATE, 'worker.log'), 'utf8')).split(/\r?\n/).filter(Boolean).slice(-20); } catch (e) {}
    var token = D.tokenFrom(tokenFile);
    var report = D.collect({ kind: 'setup', ok: false, summary: ('Setup failed: ' + v.what).slice(0, 280), hint: v.fix, log: log, checks: [{ name: 'worker running and checked in', ok: false, detail: v.what }] });
    if (!base || !token) { process.exitCode = 1; return; }
    D.post(base, token, report, function (err, code) {
      if (!err && code === 200) console.log('(This problem was also sent to the Compute Lab owner.)');
      process.exitCode = 1;
    }, { force: true });
  })();
}

if (require.main === module) main();
module.exports = { judge: judge };
