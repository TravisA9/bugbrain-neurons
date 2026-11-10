#!/usr/bin/env node
'use strict';
/* Poll a Compute Lab coordinator over HTTPS. No GitHub token and no owner password.
 *   node run/coord.js --url http://127.0.0.1:8091/computelab --token-file ~/.bugbrain/coordinator-token --once
 * Outbound polling works from a home network. The git queue remains the path when this URL is unset.
 * A running job heartbeats so work longer than the lease stays with this computer. */
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const BACKOFF_START_MS = 1000;
const BACKOFF_CAP_MS = 5 * 60 * 1000;

function args(argv) {
  const a = {}; const v = argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    const k = v[i].replace(/^--/, '');
    if (k === 'once') a.once = true;
    else if (k === 'single') a.single = true;
    else a[k] = v[++i];
  }
  return a;
}
const ALLOWED = new Set(['spikefoundry/run.js', 'run/r42.js', 'run/gen.js']);

function normalizeProtocol(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
function hashText(text) {
  return require('crypto').createHash('sha256').update(normalizeProtocol(text)).digest('hex');
}
function protocolHash() {
  const p = path.join(ROOT, 'hosting', 'computelab', 'PROTOCOL.txt');
  return hashText(fs.readFileSync(p));
}
function assertProtocol(job, hash) {
  if (!job || job.codeHash !== hash) throw new Error('Job code hash does not match this checkout.');
}
function tokenFrom(file) {
  const t = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{32,128}$/.test(t)) throw new Error('Worker token file is not a coordinator token.');
  return t;
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function nextBackoff(current) {
  const now = +current || 0;
  if (now < BACKOFF_START_MS) return BACKOFF_START_MS;
  return Math.min(BACKOFF_CAP_MS, now * 2);
}
function isRetryable(err) {
  if (!err) return false;
  if (err.network) return true;
  return typeof err.status === 'number' && err.status >= 500 && err.status <= 599;
}
function decideRetry(err, delay) {
  if (err && err.status === 401) return { action: 'stop', delay: 0 };
  if (!isRetryable(err)) return { action: 'crash', delay: 0 };
  return { action: 'retry', delay: nextBackoff(delay) };
}
/* Setup waits for this file before it says the worker is running: it is written only after the
 * coordinator answered a check-in from this process. */
function markAlive(extra) {
  try {
    const dir = process.env.BB_STATE_DIR || path.join(require('os').homedir(), '.bugbrain');
    fs.writeFileSync(path.join(dir, 'coord-alive.json'), JSON.stringify(Object.assign({ at: new Date().toISOString(), pid: process.pid }, extra || {})) + '\n');
  } catch (e) {}
}
/* A request that never answers must not hold a job slot forever. */
function timeoutSignal(ms) {
  try { return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined; } catch (e) { return undefined; }
}
/* The coordinator checks that the digest matches the summary, so any change to the summary needs a new digest. */
function withDigest(result) {
  if (result && typeof result.summary === 'string' && result.digest) {
    result.digest = require('crypto').createHash('sha256').update(result.summary).digest('hex');
  }
  return result;
}
async function api(base, token, route, body) {
  let res;
  try {
    res = await fetch(base.replace(/\/$/, '') + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body || {}),
      signal: timeoutSignal(+process.env.BB_COORD_TIMEOUT_MS || 60000),
    });
  } catch (e) {
    const err = new Error((e && e.message) || 'Coordinator request failed.');
    err.network = true;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || ('Coordinator answered ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}
function stopChild(child) {
  if (!child || child.exitCode != null || child.signalCode != null || child._coordStop) return;
  child._coordStop = true;
  try {
    if (process.platform === 'win32' && child.pid) {
      cp.execFile('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true }, () => {});
    } else if (typeof child.kill === 'function') {
      child.kill('SIGTERM');
    }
  } catch (e) {}
}
function childDone(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    child.on('error', err => finish(reject, err));
    child.on('close', (code, signal) => finish(resolve, { code: code == null ? 1 : code, signal: signal || null }));
  });
}
function startLeaseHeartbeat(opts) {
  const every = Math.max(5, +opts.heartbeatMs || 60000);
  const state = { pauseAfter: false, lost: false, revoked: false, ticks: 0 };
  let stopped = false;
  let chain = Promise.resolve();
  const lose = (revoked) => {
    const was = state.lost;
    state.lost = true;
    if (revoked) state.revoked = true;
    if (!was && opts.onLost) opts.onLost(state);
  };
  const tick = () => {
    if (stopped) return chain;
    chain = chain.then(() => opts.heartbeat()).then(res => {
      if (!res) return;
      state.ticks++;
      if (res.paused) state.pauseAfter = true;
      const missing = Object.prototype.hasOwnProperty.call(res, 'jobId') && res.jobId !== opts.jobId;
      if (res.revoked || res.leaseLost || missing) lose(!!res.revoked);
    }).catch(err => {
      if (err && (err.revoked || err.status === 401)) lose(true);
    });
    return chain;
  };
  const timer = setInterval(() => { tick(); }, every);
  return {
    state,
    finish() {
      stopped = true;
      clearInterval(timer);
      return chain;
    },
  };
}
function runnerArgs(job, out) {
  if (!ALLOWED.has(job.runner)) throw new Error('Runner is not on the allowlist: ' + job.runner);
  const spec = job.spec || {};
  if (job.runner === 'spikefoundry/run.js') {
    const file = path.join(out, 'job.json');
    fs.writeFileSync(file, JSON.stringify(Object.assign({
      id: job.id,
      kind: 'spikefoundry',
      project: 'spikefoundry',
      seed: spec.seed || 1,
      batches: spec.batches || 1,
      scenario: spec.scenario,
      scenarioParams: spec.scenarioParams,
      mode: spec.mode,
      taskId: spec.taskId,
      seedGenomes: spec.seedGenomes,
      knownHashes: spec.knownHashes,
      evals: spec.evals,
      targetSeconds: spec.targetSeconds,
      keepTop: spec.keepTop,
      keepRandom: spec.keepRandom,
      title: job.title,
    })));
    return [path.join(ROOT, 'spikefoundry', 'run.js'), '--job', file, '--out', out];
  }
  const task = spec.task;
  if (!task || typeof task !== 'object') throw new Error('BugBrain template is missing a task object.');
  const variant = String(spec.variant || 'base');
  if (/[\n\r;&|`$]/.test(variant) || /[\n\r;&|`$]/.test(String(spec.plan || ''))) throw new Error('Template text has characters the worker will not pass through.');
  const growths = String(Math.max(1, Math.min(4, +spec.growths || 1)));
  const seed = String(Math.max(0, Math.min(1000000, +spec.seed || 0)));
  return [path.join(ROOT, job.runner), String(spec.plan || 'deepURSx3'), JSON.stringify(task), growths, variant, seed];
}
async function runSpec(job, opts) {
  opts = opts || {};
  const out = opts.outDir || path.join(require('os').tmpdir(), 'coord-' + String(job.id).replace(/[^a-z0-9._-]/gi, ''));
  fs.mkdirSync(out, { recursive: true });
  const spawn = opts.spawn || cp.spawn;
  const spawnOpts = { cwd: ROOT, stdio: opts.stdio || 'inherit' };
  if (opts.throttle != null) {
    const tf = path.join(out, 'throttle.json');
    writeThrottle(tf, opts.throttle);
    spawnOpts.env = Object.assign({}, process.env, { SF_THROTTLE_FILE: tf });
  }
  const child = spawn(process.execPath, runnerArgs(job, out), spawnOpts);
  if (opts.onSpawn) { try { opts.onSpawn(child, out); } catch (e) {} }
  const innerBeat = opts.heartbeat || (() => Promise.resolve({ ok: true, jobId: job.id, paused: false }));
  const beats = startLeaseHeartbeat({
    heartbeatMs: opts.heartbeatMs != null ? opts.heartbeatMs : +(process.env.BB_COORD_HEARTBEAT_MS || 60000),
    jobId: job.id,
    heartbeat: () => Promise.resolve().then(() => innerBeat(readProgress(out))),
    onLost: () => stopChild(child),
  });
  let done;
  try {
    done = await childDone(child);
  } finally {
    await beats.finish();
  }
  if (beats.state.lost) {
    const err = new Error(beats.state.revoked ? 'Worker was revoked.' : 'Lease is gone.');
    err.leaseLost = true;
    err.revoked = !!beats.state.revoked;
    err.pauseAfter = !!beats.state.pauseAfter;
    throw err;
  }
  if (!done || done.code !== 0) {
    throw new Error('Runner exited with ' + ((done && done.code) != null ? done.code : 'no status'));
  }
  let result;
  if (job.runner === 'spikefoundry/run.js') {
    const summaryPath = path.join(out, 'summary.json');
    const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : {};
    const text = String(summary.note || 'Synthetic SpikeFoundry run.').slice(0, 500);
    result = { status: 'done', summary: text, synthetic: true, digest: require('crypto').createHash('sha256').update(text).digest('hex') };
  } else {
    const text = 'Template ' + job.runner + ' finished.';
    result = { status: 'done', summary: text, synthetic: false, digest: require('crypto').createHash('sha256').update(text).digest('hex') };
  }
  result.pauseAfter = !!beats.state.pauseAfter;
  result.outDir = out;
  const designPath = path.join(out, 'designs.json');
  if (fs.existsSync(designPath)) result.designPath = designPath;
  const modelPath = path.join(out, 'model.json');
  if (fs.existsSync(modelPath)) result.modelPath = modelPath;
  return result;
}
async function uploadModel(base, token, jobId, modelPath) {
  if (!modelPath || !fs.existsSync(modelPath)) return;
  let model;
  try { model = JSON.parse(fs.readFileSync(modelPath, 'utf8')); }
  catch (e) { return; }
  try {
    await api(base, token, '/api/v1/model', { jobId: jobId, model: model, metrics: { spearman: model.spearman || 0, heldOut: model.heldOut || 0 } });
  } catch (e) {}
}
function packUploadBatches(records, maxCount, maxBytes) {
  const out = [];
  let cur = [];
  let bytes = 2;
  const countCap = Math.max(1, maxCount || 500);
  const byteCap = maxBytes > 0 ? maxBytes : 900000;
  (records || []).forEach(rec => {
    const size = Buffer.byteLength(JSON.stringify(rec));
    if (cur.length && (cur.length >= countCap || bytes + size + 1 > byteCap)) {
      out.push(cur);
      cur = [];
      bytes = 2;
    }
    cur.push(rec);
    bytes += size + 1;
  });
  if (cur.length) out.push(cur);
  return out;
}
function retryAfterMs(res, fallback) {
  let header = '';
  try { header = res && res.headers && res.headers.get ? String(res.headers.get('retry-after') || '') : ''; }
  catch (e) { header = ''; }
  if (/^\d+$/.test(header.trim())) return Math.min(120000, (+header.trim()) * 1000);
  return fallback;
}
async function uploadDesigns(base, token, hash, designPath, opts) {
  opts = opts || {};
  if (!designPath || !fs.existsSync(designPath)) return { ok: true, error: '', batches: 0 };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(designPath, 'utf8')); }
  catch (e) { return { ok: false, error: 'Design file could not be read.', batches: 0 }; }
  const records = parsed.records || [];
  const summary = parsed.summary || null;
  if (!records.length && !summary) return { ok: true, error: '', batches: 0 };
  const groups = records.length ? packUploadBatches(records, opts.maxCount || 500, opts.maxBytes || 900000) : [[]];
  const wait = opts.sleep || sleep;
  const doFetch = opts.fetch || fetch;
  const beat = opts.heartbeat || (async () => {});
  let failed = '';
  for (let i = 0; i < groups.length; i++) {
    const body = { codeHash: hash, records: groups[i] };
    if (i === 0 && summary) body.summary = summary;
    const gz = require('zlib').gzipSync(Buffer.from(JSON.stringify(body)));
    let delay = 1000;
    let sent = false;
    for (let attempt = 0; attempt < 6 && !sent; attempt++) {
      await beat();
      let res;
      try {
        res = await doFetch(base.replace(/\/$/, '') + '/api/v1/designs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', Authorization: 'Bearer ' + token },
          body: gz,
          signal: timeoutSignal(+process.env.BB_COORD_UPLOAD_TIMEOUT_MS || 180000),
        });
      } catch (e) {
        await wait(delay);
        delay = nextBackoff(delay);
        continue;
      }
      if (res.ok) { sent = true; break; }
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        try { await res.arrayBuffer(); } catch (e) {}
        await beat();
        await wait(retryAfterMs(res, delay));
        delay = nextBackoff(Math.max(delay, retryAfterMs(res, delay)));
        continue;
      }
      const data = await res.json().catch(() => ({}));
      failed = data.error || ('Upload answered ' + res.status);
      break;
    }
    if (!sent) {
      failed = failed || 'Design upload failed after retries.';
      break;
    }
  }
  return { ok: !failed, error: failed, batches: groups.length };
}
function cleanupJobDir(dir) {
  if (!dir || path.basename(dir).indexOf('coord-') !== 0) return;
  fs.rmSync(dir, { recursive: true, force: true });
}
function cleanupStaleCoordDirs(dir, maxAgeMs, now) {
  const root = dir || require('os').tmpdir();
  const age = maxAgeMs == null ? 24 * 60 * 60 * 1000 : maxAgeMs;
  const clock = now == null ? Date.now() : now;
  let names = [];
  try { names = fs.readdirSync(root); } catch (e) { return; }
  names.forEach(name => {
    if (name.indexOf('coord-') !== 0) return;
    const folder = path.join(root, name);
    let st;
    try { st = fs.statSync(folder); } catch (e) { return; }
    if (!st.isDirectory()) return;
    if (clock - st.mtimeMs >= age) fs.rmSync(folder, { recursive: true, force: true });
  });
}
function shouldWait(reason) {
  return reason === 'empty' || reason === 'paused' || reason === 'error' || reason === 'retry';
}
function readProgress(out) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(out, 'progress.json'), 'utf8'));
    const total = +raw.batchesTotal;
    const done = +raw.batchesDone;
    if (!(total > 0) || !isFinite(done)) return null;
    return Math.max(0, Math.min(100, Math.round((100 * done) / total)));
  } catch (e) {
    return null;
  }
}
async function workerHeartbeat(base, token, hash, jobId, progress, slot) {
  const body = { codeHash: hash, jobId: jobId };
  if (slot != null) body.slot = slot;
  if (typeof progress === 'number' && isFinite(progress)) body.progress = Math.max(0, Math.min(100, Math.round(progress)));
  try {
    return await api(base, token, '/api/v1/heartbeat', body);
  } catch (e) {
    if (e && e.status === 401) {
      e.revoked = true;
      throw e;
    }
    if (isRetryable(e)) return { ok: true, jobId: jobId, paused: false, degraded: true };
    throw e;
  }
}
/* Remote diagnostics (run/diag.js): one report at startup and one per kind of error (rate-limited, scrubbed). */
function sendDiag(base, token, kind, ok, summary, extra) {
  return new Promise(resolve => {
    try {
      const D = require('./diag.js');
      const rep = D.collect(Object.assign({ kind: kind, ok: ok, summary: String(summary).slice(0, 280), log: D.logTail() }, extra || {}));
      D.post(base, token, rep, () => resolve());
    } catch (e) { resolve(); }
  });
}
function diagFor(e) {
  const D = require('./diag.js');
  const status = e && e.status;
  const x = { lastError: D.errorInfo(e) };
  if (status === 409) { x.protocolMatch = false; x.hint = 'The worker updates itself within minutes; if this stays, run the setup command again.'; }
  else if (!status) { x.reach = false; x.hint = 'Check the internet connection or firewall on this computer.'; }
  return x;
}
/* Resource control. The owner of the computer picks one of three modes on the website:
 *   off       claim nothing new; a running job finishes; stay registered.
 *   allowance use about pct% of the logical cores: ceil(share) job slots, each duty-cycled so
 *             the total is close to the share, at low OS priority.
 *   full      one job per logical core at normal priority. */
function logicalCores() {
  try { if (typeof os.availableParallelism === 'function') return Math.max(1, os.availableParallelism()); } catch (e) {}
  return Math.max(1, (os.cpus() || []).length || 1);
}
function resourcePlan(mode, pct, cores, maxSlots) {
  const n = Math.max(1, Math.floor(+cores || 1));
  const cap = Math.max(1, Math.min(64, Math.floor(+maxSlots || n)));
  if (mode === 'off') return { mode: 'off', pct: 0, slots: 0, duty: 1, priority: 'low', cores: n };
  if (mode === 'full') return { mode: 'full', pct: 100, slots: Math.min(cap, n), duty: 1, priority: 'normal', cores: n };
  let p = Math.round((+pct || 50) / 10) * 10;
  p = Math.max(10, Math.min(90, p));
  const share = (p / 100) * n;
  const slots = Math.min(cap, Math.max(1, Math.ceil(share - 1e-9)));
  const duty = Math.max(0.05, Math.min(1, Math.round((share / slots) * 1000) / 1000));
  return { mode: 'allowance', pct: p, slots: slots, duty: duty, priority: 'low', cores: n };
}
function samePlan(a, b) {
  return !!a && !!b && a.mode === b.mode && a.slots === b.slots && a.duty === b.duty && a.priority === b.priority;
}
function osPriority(priority) {
  const P = (os.constants && os.constants.priority) || {};
  return priority === 'normal' ? (P.PRIORITY_NORMAL != null ? P.PRIORITY_NORMAL : 0) : (P.PRIORITY_LOW != null ? P.PRIORITY_LOW : 19);
}
function applyPriority(pid, priority) {
  if (!pid) return false;
  try { os.setPriority(pid, osPriority(priority)); return true; } catch (e) { return false; }
}
function writeThrottle(file, duty) {
  try { fs.writeFileSync(file, JSON.stringify({ duty: Math.max(0.05, Math.min(1, +duty || 1)) })); } catch (e) {}
}
function settingsFrom(beat) {
  const r = (beat && beat.resources) || {};
  let mode = r.mode === 'off' || r.mode === 'allowance' || r.mode === 'full' ? r.mode : (beat && beat.paused ? 'off' : 'full');
  if (beat && beat.paused) mode = 'off';
  return { mode: mode, pct: +r.allowancePct || 50 };
}

/* Several job slots, one claim per slot. A control check-in every BB_COORD_CONTROL_MS
 * (default 20 s) reads the setting and reports what this computer is doing, so a change on
 * the website applies within about half a minute without a restart. */
async function multi(a, base, token, hash) {
  const cores = logicalCores();
  const maxSlots = Math.max(1, Math.min(64, +(process.env.BB_MAX_SLOTS || cores)));
  const poll = +(process.env.BB_COORD_POLL_MS || 15000);
  const heartbeatMs = +(process.env.BB_COORD_HEARTBEAT_MS || 60000);
  const controlMs = Math.max(1000, +(process.env.BB_COORD_CONTROL_MS || 20000));
  const stopFile = a['stop-file'] || process.env.BB_STOP_FILE || path.join(process.env.BB_STATE_DIR || path.join(os.homedir(), '.bugbrain'), 'dq.stop');
  const jobLimit = a.jobs ? Math.max(1, +a.jobs) : 0;
  const running = new Map();
  let plan = resourcePlan('off', 0, cores, maxSlots);
  let finished = 0, stopping = false, fatal = null, firstControl = true;
  /* Uploads from this computer go one at a time, so several slots finishing together do not
   * pile onto the coordinator and fail together. */
  let uploadChain = Promise.resolve();
  const oneAtATime = fn => { const p = uploadChain.then(fn, fn); uploadChain = p.catch(() => {}); return p; };
  const say = obj => console.log(JSON.stringify(obj));
  const runtime = () => ({ cores: cores, slots: plan.slots, running: running.size, duty: plan.duty, mode: plan.mode, pct: plan.pct, priority: plan.priority, platform: process.platform });
  const adopt = next => {
    if (samePlan(plan, next)) return;
    plan = next;
    say({ ok: true, resources: plan.mode, pct: plan.pct, slots: plan.slots, duty: plan.duty, priority: plan.priority, cores: cores });
    running.forEach(r => { applyPriority(r.pid, plan.priority); if (r.throttle) writeThrottle(r.throttle, plan.duty); });
  };
  const control = async () => {
    const beat = await api(base, token, '/api/v1/heartbeat', { codeHash: hash, control: true, reset: firstControl, runtime: runtime() });
    firstControl = false;
    if (beat.revoked) { fatal = new Error('Worker token was revoked.'); fatal.status = 401; return; }
    const s = settingsFrom(beat);
    adopt(resourcePlan(s.mode, s.pct, cores, maxSlots));
    markAlive({ mode: s.mode });
  };
  let delay = 0;
  for (;;) {
    try { await control(); break; }
    catch (e) {
      const d = decideRetry(e, delay);
      if (d.action !== 'retry') {
        if (d.action === 'crash') await sendDiag(base, token, 'error', false, 'Worker stopped: ' + String((e && e.message) || e), diagFor(e));
        throw e;
      }
      delay = d.delay; console.error((e && e.message) || e);
      await sendDiag(base, token, 'error', false, (e && e.status === 409 ? 'Protocol mismatch, needs update: ' : '') + String((e && e.message) || e), diagFor(e));
      await sleep(delay);
    }
  }
  if (fatal) throw fatal;
  await sendDiag(base, token, 'startup', true, 'Worker started · ' + plan.mode + (plan.mode === 'allowance' ? ' ' + plan.pct + '%' : '') + ' · ' + plan.slots + ' of ' + cores + ' cores', { protocolMatch: true, runtime: runtime() });
  const timer = setInterval(() => {
    if (stopFile && !stopping && fs.existsSync(stopFile)) { stopping = true; say({ ok: true, stopping: 'stop file' }); }
    control().catch(e => { if (e && e.status === 401) fatal = e; });
  }, controlMs);
  const done = () => stopping || fatal || (jobLimit && finished >= jobLimit);
  async function slotLoop(slot) {
    let wait = 0;
    while (!done()) {
      if (slot >= plan.slots) { await sleep(Math.min(3000, controlMs)); continue; }
      let claimed;
      try {
        claimed = await api(base, token, '/api/v1/claim', { codeHash: hash, slot: slot });
        wait = 0;
      } catch (e) {
        const d = decideRetry(e, wait);
        if (d.action === 'stop') { fatal = e; return; }
        if (d.action === 'crash') { fatal = e; await sendDiag(base, token, 'error', false, 'Worker stopped: ' + String((e && e.message) || e), diagFor(e)); return; }
        wait = d.delay; console.error((e && e.message) || e);
        await sendDiag(base, token, 'error', false, (e && e.status === 409 ? 'Protocol mismatch, needs update: ' : '') + String((e && e.message) || e), diagFor(e));
        await sleep(wait); continue;
      }
      if (!claimed.job) { await sleep(poll + Math.floor(Math.random() * 3000)); continue; }
      if (done()) return;
      const job = claimed.job;
      assertProtocol(job, hash);
      const entry = { pid: 0, throttle: '' };
      running.set(slot, entry);
      let result;
      try {
        result = await runSpec(job, {
          heartbeatMs: heartbeatMs,
          heartbeat: progress => workerHeartbeat(base, token, hash, job.id, progress, slot),
          throttle: plan.duty,
          onSpawn: (child, out) => { entry.pid = child.pid; entry.throttle = path.join(out, 'throttle.json'); applyPriority(child.pid, plan.priority); writeThrottle(entry.throttle, plan.duty); },
        });
      } catch (e) {
        running.delete(slot);
        if (e && e.leaseLost) {
          say({ ok: false, job: job.id, slot: slot, submit: false, reason: e.revoked ? 'revoked' : 'lease-lost' });
          if (e.revoked) { fatal = e; return; }
          continue;
        }
        result = { status: 'error', summary: String((e && e.message) || e).slice(0, 500), synthetic: job.project === 'spikefoundry' };
      }
      running.delete(slot);
      const designPath = result.designPath, modelPath = result.modelPath, outDir = result.outDir;
      delete result.designPath; delete result.modelPath; delete result.outDir; delete result.pauseAfter;
      try {
        const uploaded = await oneAtATime(async () => {
          await uploadModel(base, token, job.id, modelPath);
          return uploadDesigns(base, token, hash, designPath, { heartbeat: () => workerHeartbeat(base, token, hash, job.id, 100, slot) });
        });
        if (!uploaded.ok) {
          result.summary = (String(result.summary || '') + ' Design upload failed: ' + uploaded.error).slice(0, 500);
          withDigest(result);
          await sendDiag(base, token, 'error', false, 'Design upload failed for ' + job.id + ': ' + uploaded.error, { hint: 'The job result is still sent; its designs were not stored.' });
        }
        await api(base, token, '/api/v1/result', { jobId: job.id, result: result });
        if (uploaded.ok && result.status === 'done') cleanupJobDir(outDir);
        say({ ok: true, job: job.id, slot: slot, status: result.status });
      } catch (e) {
        console.error('Could not submit ' + job.id + ': ' + ((e && e.message) || e));
        if (e && e.status === 401) { fatal = e; return; }
      }
      finished++;
      if (result.status !== 'done') await sleep(poll);
    }
  }
  await Promise.all(Array.from({ length: maxSlots }, (_, i) => slotLoop(i)));
  clearInterval(timer);
  if (fatal) {
    if (fatal.status === 401 || fatal.revoked) { console.error('Worker token was revoked.'); process.exitCode = 1; return; }
    throw fatal;
  }
}

async function main() {
  const a = args(process.argv);
  try { require('./diag.js').capture(); } catch (e) {}
  const base = a.url || process.env.BB_COORDINATOR_URL;
  const tokenFile = a['token-file'] || process.env.BB_COORDINATOR_TOKEN_FILE;
  if (!base || !tokenFile) throw new Error('Need --url and --token-file (or BB_COORDINATOR_URL and BB_COORDINATOR_TOKEN_FILE).');
  const token = tokenFrom(tokenFile);
  const hash = protocolHash();
  cleanupStaleCoordDirs();
  if (!a.once && !a.single) return multi(a, base, token, hash);
  const poll = +(process.env.BB_COORD_POLL_MS || 15000);
  const heartbeatMs = +(process.env.BB_COORD_HEARTBEAT_MS || 60000);
  let delay = 0, started = false;
  for (;;) {
    try {
      const beat = await api(base, token, '/api/v1/heartbeat', { codeHash: hash });
      delay = 0;
      if (!started) {
        started = true;
        await sendDiag(base, token, 'startup', true, 'Worker started' + (beat.paused ? ' (paused)' : ''), { protocolMatch: true });
      }
      if (beat.revoked) {
        console.error('Worker token was revoked.');
        process.exitCode = 1;
        return;
      }
      if (beat.paused) {
        console.log(JSON.stringify({ ok: true, paused: true }));
        if (a.once) return;
        await sleep(poll);
        continue;
      }
      const claimed = await api(base, token, '/api/v1/claim', { codeHash: hash });
      if (!claimed.job) {
        console.log(JSON.stringify({ ok: true, job: null }));
        if (a.once) return;
        await sleep(poll);
        continue;
      }
      assertProtocol(claimed.job, hash);
      let result;
      try {
        result = await runSpec(claimed.job, {
          heartbeatMs: heartbeatMs,
          heartbeat: (progress) => workerHeartbeat(base, token, hash, claimed.job.id, progress),
        });
      } catch (e) {
        if (e && e.leaseLost) {
          console.log(JSON.stringify({ ok: false, job: claimed.job.id, submit: false, reason: e.revoked ? 'revoked' : 'lease-lost' }));
          if (e.revoked) {
            process.exitCode = 1;
            return;
          }
          if (a.once) return;
          continue;
        }
        result = { status: 'error', summary: String((e && e.message) || e).slice(0, 500), synthetic: claimed.job.project === 'spikefoundry' };
      }
      const designPath = result.designPath;
      const modelPath = result.modelPath;
      const outDir = result.outDir;
      delete result.designPath;
      delete result.modelPath;
      delete result.outDir;
      delete result.pauseAfter;
      await uploadModel(base, token, claimed.job.id, modelPath);
      const uploaded = await uploadDesigns(base, token, hash, designPath, {
        heartbeat: () => workerHeartbeat(base, token, hash, claimed.job.id, 100),
      });
      if (!uploaded.ok) {
        result.summary = (String(result.summary || '') + ' Design upload failed: ' + uploaded.error).slice(0, 500);
        withDigest(result);
      }
      await api(base, token, '/api/v1/result', { jobId: claimed.job.id, result: result });
      if (uploaded.ok && result.status === 'done') cleanupJobDir(outDir);
      console.log(JSON.stringify({ ok: true, job: claimed.job.id, status: result.status }));
      if (a.once) return;
      if (shouldWait(result.status === 'done' ? 'done' : 'error')) await sleep(poll);
    } catch (e) {
      const decision = decideRetry(e, delay);
      if (decision.action === 'stop') {
        console.error((e && e.message) || 'Worker token was revoked.');
        process.exitCode = 1;
        return;
      }
      if (decision.action === 'crash') {
        await sendDiag(base, token, 'error', false, 'Worker stopped: ' + String((e && e.message) || e), diagFor(e));
        throw e;
      }
      delay = decision.delay;
      console.error((e && e.message) || e);
      await sendDiag(base, token, 'error', false, (e && e.status === 409 ? 'Protocol mismatch, needs update: ' : '') + String((e && e.message) || e), diagFor(e));
      await sleep(a.once ? Math.min(delay, 1000) : delay);
      if (a.once) throw e;
    }
  }
}
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
module.exports = { withDigest, timeoutSignal, resourcePlan, samePlan, settingsFrom, applyPriority, osPriority, logicalCores, writeThrottle, ALLOWED, protocolHash, hashText, assertProtocol, runSpec, startLeaseHeartbeat, nextBackoff, isRetryable, decideRetry, stopChild, readProgress, shouldWait, packUploadBatches, uploadDesigns, cleanupJobDir, cleanupStaleCoordDirs, retryAfterMs };
