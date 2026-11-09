'use strict';
/* run/wconfig.js (R61): shared helpers for the always-on worker (run/supervisor.js + run/dq.js).
 * Remote control file: worker-config.json at the root of the `queue` branch (edit + push = all workers follow within minutes).
 *   {
 *     "version": 1,            bump -> every worker restarts dq.js gracefully (after its current job) and re-pulls code
 *     "forceVersion": 0,       bump -> every worker kills its current job now and restarts (claim is released on restart)
 *     "defaults": { "mode": "run", "pollMinutes": 10 },
 *     "types":   { "phone": { "phone": true }, "linux": {}, "windows": {}, "mac": {} },
 *     "workers": { "linux-pc": { "hours": null }, "pixel-7": { "mode": "pause" } },
 *     "jobs":    { "w08_*": { "priority": 0.2 }, "v09_markov_more": "block" }
 *   }
 * Settings (later layers win: built-in < defaults < types[type] < workers[name]):
 *   mode: "run" | "pause" (claim nothing new; the running job finishes) | "observe" (log what would be claimed, never push)
 *   hours, phone, workers (parallel workers inside queue.js), allowBattery, includeText,
 *   cpuMax: claim a job only while total CPU use is below this % (yields to other work on a shared laptop, e.g. the local run/queue.js),
 *   maxMemGB: claim only jobs whose declared memGB per run is <= this (jobs without memGB pass),
 *   only / skip: job-id patterns (* wildcard), minPriority, pollMinutes (supervisor check interval), version / forceVersion (per type / worker).
 * jobs: per-job overrides for every worker: "block" or { "priority": x, "block": true, "assign": "worker-name" }; patterns allowed; later keys win.
 *   assign (desk): only that worker may claim the job. A claim already held is not stolen. Workers that have not
 *   updated to this code ignore assign (the claim push still stops two machines running it). */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const STATE = process.env.BB_STATE_DIR || path.join(os.homedir(), '.bugbrain');
const BUILTIN = { mode: 'run', hours: null, phone: false, workers: null, allowBattery: false, includeText: false, only: null, skip: null, minPriority: null, cpuMax: null, maxMemGB: null, pollMinutes: 10 };
const glob = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const matchAny = (pats, id) => [].concat(pats || []).some(p => glob(p).test(id));
const isTermux = () => !!(process.env.TERMUX_VERSION || /com\.termux/.test(process.env.PREFIX || ''));
function deviceType() { return process.env.BB_DEVICE_TYPE || (isTermux() ? 'phone' : process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'); }
const readTxt = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { return ''; } };
function legacyEnv(key) {   // R48 phones keep BB_DQ_TOKEN / BB_WORKER in ~/.bugbrain_env
  const m = readTxt(path.join(os.homedir(), '.bugbrain_env')).match(new RegExp('^export ' + key + "='([^']*)'", 'm')); return m ? m[1] : '';
}
// Token: BB_DQ_TOKEN env, else ~/.bugbrain/token (chmod 600), else the old ~/.bugbrain_env. Never logged.
function token() { return process.env.BB_DQ_TOKEN || readTxt(path.join(STATE, 'token')) || legacyEnv('BB_DQ_TOKEN'); }
function tokenWarn() {   // returns a warning string (no secret) when the token file is readable by others
  const f = path.join(STATE, 'token'); if (process.platform === 'win32' || !fs.existsSync(f)) return '';
  try { const m = fs.statSync(f).mode & 0o077; if (m) { fs.chmodSync(f, 0o600); return 'token file was readable by others; fixed to chmod 600'; } } catch (e) {} return '';
}
// Worker name: ~/.bugbrain/worker-name (override: edit it), else BB_WORKER / old phone name, else derived from the device; saved on first run.
function workerName() {
  const f = path.join(STATE, 'worker-name'); let n = readTxt(f);
  if (!n) { n = process.env.BB_WORKER || legacyEnv('BB_WORKER');
    if (!n && isTermux()) { let m = ''; try { m = cp.execFileSync('getprop', ['ro.product.model'], { encoding: 'utf8', timeout: 5000 }).trim(); } catch (e) {} n = 'phone-' + (m || 'android'); }
    if (!n) n = os.hostname();
    n = n.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'worker';
    try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(f, n + '\n'); } catch (e) {} }
  return n;
}
function resolve(cfg, name, type) {
  cfg = cfg || {}; const T = (cfg.types || {})[type] || {}, W = (cfg.workers || {})[name] || {};
  const s = Object.assign({}, BUILTIN, type === 'phone' ? { phone: true } : {}, cfg.defaults || {}, T, W);
  s.name = name;
  s.version = [cfg.version || 0, T.version || 0, W.version || 0].join('.');
  s.forceVersion = [cfg.forceVersion || 0, T.forceVersion || 0, W.forceVersion || 0].join('.');
  if (!['run', 'pause', 'observe'].includes(s.mode)) s.mode = 'run';
  return s;
}
function jobView(cfg, j) {   // apply the config's per-job overrides; returns a copy (or null when blocked)
  let o = {}; for (const [k, v] of Object.entries((cfg && cfg.jobs) || {})) if (glob(k).test(j.id)) o = Object.assign(o, v === 'block' ? { block: true } : v);
  if (o.block) return null;
  const out = Object.assign({}, j);
  if (o.priority != null) out.priority = +o.priority;
  if (o.assign) out.assign = String(o.assign);   // desk: only this worker may claim (workers on this code)
  return out;
}
function allowed(s, j) {
  if (j.assign && j.assign !== s.name) return false;
  return (!s.only || matchAny(s.only, j.id)) && !matchAny(s.skip, j.id) && (s.minPriority == null || (j.priority || 0) >= s.minPriority);
}
// Same ordering and filters run/dq.js used inline. Pause claims nothing. An expired claim is not "claimed".
function selectJobs(cfg, name, type, jobs, ctx) {
  ctx = ctx || {};
  const s = resolve(cfg, name, type);
  if (s.mode === 'pause') return [];
  const done = ctx.done || new Set(), claimed = ctx.claimed || new Set(), skip = ctx.skip || new Set();
  const exists = ctx.exists || (() => true), passed = ctx.passed || (() => false);
  const left = ctx.leftHours == null ? Infinity : +ctx.leftHours;
  const out = [];
  for (const j0 of jobs || []) {
    const j = jobView(cfg, j0);
    if (!j || !allowed(s, j)) continue;
    if (skip.has(j.id) || done.has(j.id) || claimed.has(j.id)) continue;
    if (j.kind === 'blocked' || (j.kind === 'text' && !ctx.includeText)) continue;
    if ((j.requires || []).some(r => !exists(r))) continue;
    if (j.after && !done.has(j.after)) continue;
    if (j.after && j.afterPass && passed(j.after) !== true) continue;
    const est = +((j.budget && j.budget.hours) || j.estHours || 1);
    if (est * 1.15 + 0.1 > left) continue;
    if (s.maxMemGB != null && (+j.memGB || 0) > +s.maxMemGB) continue;
    out.push(j);
  }
  out.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  return out;
}
function dqArgs(s, name) {
  return ['--worker', name, '--wait'].concat(s.hours ? ['--hours', String(s.hours)] : [], s.phone ? ['--phone'] : [], s.workers ? ['--workers', String(s.workers)] : [],
    s.allowBattery ? ['--allow-battery'] : [], s.includeText ? ['--include-text'] : [], s.cpuMax ? ['--cpu-max', String(s.cpuMax)] : [], s.mode === 'observe' ? ['--observe'] : []);
}
module.exports = { STATE, deviceType, token, tokenWarn, workerName, resolve, jobView, allowed, selectJobs, dqArgs, matchAny, isTermux };
