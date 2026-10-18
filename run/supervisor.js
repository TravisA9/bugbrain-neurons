#!/usr/bin/env node
'use strict';
/* run/supervisor.js (R61): keeps one run/dq.js alive on this device, following the remote worker-config.json (queue branch).
 * Started (and restarted) by the stable launcher run/worker.sh / run/worker.ps1, which resets the checkout to the latest
 * neuro/distributed-queue before every start. No arguments. Exit codes for the launcher: 10 = update + restart now, 3 = token refused.
 * Every pollMinutes (default 10; env BB_POLL_MS overrides) it fetches the code branch and the queue branch:
 *   - newer code, a new config version, or changed dq settings -> graceful restart: dq.js exits after its current job (stop file), then exit 10
 *   - new forceVersion -> kill dq.js and its job now, exit 10 (the restarted dq.js releases the claim)
 *   - mode pause -> dq.js stops after its current job; this process stays and keeps polling
 *   - dq.js crash -> restart with backoff (15 s doubling, max 10 min); dq.js exit 10 (it saw new code itself) -> exit 10.
 * Token: BB_DQ_TOKEN or ~/.bugbrain/token (never printed). Name: ~/.bugbrain/worker-name (created on first run). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const WC = require('./wconfig.js');
const ROOT = path.resolve(__dirname, '..'), ST = WC.STATE, CODE = process.env.BB_CODE_BRANCH || 'neuro/distributed-queue', QB = process.env.BB_QUEUE_BRANCH || 'queue';
fs.mkdirSync(ST, { recursive: true });
const NAME = WC.workerName(), TYPE = WC.deviceType(), TOKEN = WC.token(), STOP = path.join(ST, 'dq.stop');
const say = s => console.log(`[${new Date().toLocaleString()}] [supervisor ${NAME}] ${s}`);
const AUTH = TOKEN ? ['-c', 'credential.helper=', '-c', 'credential.helper=!f() { echo username=x-access-token; echo password=$BB_DQ_TOKEN; }; f'] : [];
const ENV = Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', BB_SUPERVISED: '1', BB_DEVICE_TYPE: TYPE }, TOKEN ? { BB_DQ_TOKEN: TOKEN } : {});
const redact = s => String(s || '').split(TOKEN || '\u0000').join('***').replace(/(github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, '$1***');
const git = a => cp.execFileSync('git', AUTH.concat(a), { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ENV, timeout: 120e3 }).trim();
const RUNTIME = process.env.BB_BUN || process.execPath;
function fetchAll() {
  try { git(['fetch', '-q', '--no-tags', 'origin', `+refs/heads/${CODE}:refs/bb/code`, `+refs/heads/${QB}:refs/bb/queue`]); return true; }
  catch (e) { say('fetch failed (will retry): ' + redact(e.stderr || e.message).trim().split('\n').slice(-1)[0].slice(0, 160)); return false; }
}
function readCfg() {
  const cache = path.join(ST, 'worker-config.cache.json');
  try { const t = git(['show', 'refs/bb/queue:worker-config.json']); const c = JSON.parse(t); fs.writeFileSync(cache, t); return c; }
  catch (e) { try { return JSON.parse(fs.readFileSync(cache, 'utf8')); } catch (e2) { return {}; } }
}
function newerCode() {
  try { const h = git(['rev-parse', 'HEAD']), c = git(['rev-parse', 'refs/bb/code']); if (h === c) return null;
    try { git(['merge-base', '--is-ancestor', c, h]); return null; } catch (e) { return h.slice(0, 7) + ' -> ' + c.slice(0, 7); } } catch (e) { return null; }
}
const keyOf = s => JSON.stringify([s.version, WC.dqArgs(s, NAME), s.mode]);
let child = null, childStart = 0, fails = 0, restartWhy = '', backoffTimer = null, S, KEY, FORCE;
function startDq() {
  backoffTimer = null; if (child || S.mode === 'pause') return;
  try { fs.unlinkSync(STOP); } catch (e) {}
  const args = ['run/dq.js'].concat(WC.dqArgs(S, NAME), ['--stop-file', STOP]);
  say(`starting dq.js ${args.slice(1).join(' ')} (code ${git(['rev-parse', '--short', 'HEAD'])}, config ${S.version}, ${TYPE})`);
  childStart = Date.now();
  child = cp.spawn(RUNTIME, args, { cwd: ROOT, stdio: 'inherit', env: ENV, detached: process.platform !== 'win32' });
  child.on('error', e => say('cannot start dq.js: ' + e.message));
  const pg = child.pid;
  child.on('exit', (code, sig) => {
    child = null; const ran = Date.now() - childStart;
    if (process.platform !== 'win32') try { process.kill(-pg, 'SIGTERM'); } catch (e) {}   // no orphaned queue.js / job processes after a crash
    else killOrphans(pg);
    if (restartWhy) { say(`dq.js stopped (${code ?? sig}); restarting for: ${restartWhy}`); process.exit(10); }
    if (code === 10) { say('dq.js saw newer code; restarting via launcher'); process.exit(10); }
    if (code === 3) { say('GitHub refused the token (exit 3). Put a valid fine-grained token (Contents read/write on TravisA9/bugbrain-neurons) in ' + path.join(ST, 'token')); process.exit(3); }
    if (S.mode === 'pause') { say('dq.js stopped for pause; idle until worker-config.json resumes this worker'); return; }
    if (ran > 600e3) fails = 0; fails++;
    const w = Math.min(600e3, 15e3 * 2 ** Math.min(fails - 1, 6));
    say(`dq.js exited (${code ?? sig}) after ${Math.round(ran / 1000)} s; restarting in ${Math.round(w / 1000)} s`);
    backoffTimer = setTimeout(startDq, w);
  });
}
// R61b (Windows): dq.js kills its job tree on exit, but a hard kill (taskkill /F, crash in native code) skips that.
// Then its queue.js is orphaned; find node/bun processes whose parent was the dead dq.js and kill their trees.
function killOrphans(pg) {
  try { const out = cp.execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${+pg}" | Where-Object { $_.Name -match '^(node|bun)' -and $_.CommandLine -match 'queue\\.js' } | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    for (const pid of out.split(/\s+/).filter(x => /^\d+$/.test(x))) { say('killing orphaned job process tree ' + pid); try { cp.execFileSync('taskkill', ['/T', '/F', '/PID', pid], { stdio: 'ignore', windowsHide: true }); } catch (e) {} }
  } catch (e) {}
}
function killTree() {
  if (!child) return; const pid = child.pid;
  if (process.platform === 'win32') try { cp.execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' }); } catch (e) {}
  try { if (process.platform !== 'win32') process.kill(-pid, 'SIGTERM'); } catch (e) {}
  setTimeout(() => { try { if (process.platform !== 'win32') process.kill(-pid, 'SIGKILL'); } catch (e) {} }, 20e3).unref();
}
function gracefulRestart(why) {
  if (restartWhy) return; restartWhy = why;
  if (!child) { say('restarting for: ' + why); process.exit(10); }
  say(`${why}: dq.js will stop after its current job, then restart`); fs.writeFileSync(STOP, why + '\n');
}
function poll() {
  if (!fetchAll()) return; const s2 = WC.resolve(readCfg(), NAME, TYPE);
  if (s2.forceVersion !== FORCE) { say(`forceVersion ${FORCE} -> ${s2.forceVersion}: killing dq.js and its job now`); restartWhy = 'forced restart'; if (child) killTree(); else process.exit(10); return; }
  const nc = newerCode(); if (nc) return gracefulRestart('new code ' + nc);
  if (keyOf(s2) !== KEY) return gracefulRestart(`config changed (version ${S.version} -> ${s2.version}, mode ${S.mode} -> ${s2.mode})`);
  if (!child && !backoffTimer && s2.mode !== 'pause') startDq();
}
function main() {
  process.on('SIGTERM', () => { killTree(); process.exit(0); }); process.on('SIGINT', () => { killTree(); process.exit(0); });
  const w = WC.tokenWarn(); if (w) say(w);
  if (!TOKEN) say('no token (BB_DQ_TOKEN or ' + path.join(ST, 'token') + '): fetches work, but claiming/publishing will fail with exit 3');
  fetchAll(); S = WC.resolve(readCfg(), NAME, TYPE); KEY = keyOf(S); FORCE = S.forceVersion;
  const nc = newerCode(); if (nc) { say('code is behind (' + nc + '); restarting via launcher'); process.exit(10); }
  say(`worker ${NAME} (${TYPE}), mode ${S.mode}, config version ${S.version}, polling every ${process.env.BB_POLL_MS ? process.env.BB_POLL_MS + ' ms' : S.pollMinutes + ' min'}`);
  if (S.mode === 'pause') say('paused by worker-config.json; polling');
  startDq();
  const every = +(process.env.BB_POLL_MS || Math.max(1, +S.pollMinutes || 10) * 60e3);
  setInterval(poll, every);
}
main();
