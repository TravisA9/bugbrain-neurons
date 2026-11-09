#!/usr/bin/env node
'use strict';
/* Poll a Compute Lab coordinator over HTTPS. No GitHub token and no owner password.
 *   node run/coord.js --url http://127.0.0.1:8091/computelab --token-file ~/.bugbrain/coordinator-token --once
 * Outbound polling works from a home network. The git queue remains the path when this URL is unset.
 * A running job heartbeats so work longer than the lease stays with this computer. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const BACKOFF_START_MS = 1000;
const BACKOFF_CAP_MS = 5 * 60 * 1000;

function args(argv) {
  const a = {}; const v = argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    const k = v[i].replace(/^--/, '');
    if (k === 'once') a.once = true;
    else a[k] = v[++i];
  }
  return a;
}
const ALLOWED = new Set(['spikefoundry/run.js', 'run/r42.js', 'run/gen.js']);

function protocolHash() {
  const p = path.join(ROOT, 'hosting', 'computelab', 'PROTOCOL.txt');
  return require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
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
async function api(base, token, route, body) {
  let res;
  try {
    res = await fetch(base.replace(/\/$/, '') + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body || {}),
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
  const child = spawn(process.execPath, runnerArgs(job, out), { cwd: ROOT, stdio: opts.stdio || 'inherit' });
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
async function uploadDesigns(base, token, hash, designPath) {
  if (!designPath || !fs.existsSync(designPath)) return;
  let records;
  try { records = JSON.parse(fs.readFileSync(designPath, 'utf8')).records || []; }
  catch (e) { return; }
  if (!records.length) return;
  const payload = Buffer.from(JSON.stringify({ codeHash: hash, records: records.slice(0, 24) }));
  const gz = require('zlib').gzipSync(payload);
  try {
    await fetch(base.replace(/\/$/, '') + '/api/v1/designs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', Authorization: 'Bearer ' + token },
      body: gz,
    });
  } catch (e) {}
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
async function workerHeartbeat(base, token, hash, jobId, progress) {
  const body = { codeHash: hash };
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
async function main() {
  const a = args(process.argv);
  const base = a.url || process.env.BB_COORDINATOR_URL;
  const tokenFile = a['token-file'] || process.env.BB_COORDINATOR_TOKEN_FILE;
  if (!base || !tokenFile) throw new Error('Need --url and --token-file (or BB_COORDINATOR_URL and BB_COORDINATOR_TOKEN_FILE).');
  const token = tokenFrom(tokenFile);
  const hash = protocolHash();
  const poll = +(process.env.BB_COORD_POLL_MS || 15000);
  const heartbeatMs = +(process.env.BB_COORD_HEARTBEAT_MS || 60000);
  let delay = 0;
  for (;;) {
    try {
      const beat = await api(base, token, '/api/v1/heartbeat', { codeHash: hash });
      delay = 0;
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
      delete result.designPath;
      delete result.modelPath;
      delete result.pauseAfter;
      await uploadModel(base, token, claimed.job.id, modelPath);
      await api(base, token, '/api/v1/result', { jobId: claimed.job.id, result: result });
      await uploadDesigns(base, token, hash, designPath);
      console.log(JSON.stringify({ ok: true, job: claimed.job.id, status: result.status }));
      if (a.once) return;
      await sleep(poll);
    } catch (e) {
      const decision = decideRetry(e, delay);
      if (decision.action === 'stop') {
        console.error((e && e.message) || 'Worker token was revoked.');
        process.exitCode = 1;
        return;
      }
      if (decision.action === 'crash') throw e;
      delay = decision.delay;
      console.error((e && e.message) || e);
      await sleep(a.once ? Math.min(delay, 1000) : delay);
      if (a.once) throw e;
    }
  }
}
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
module.exports = { ALLOWED, protocolHash, assertProtocol, runSpec, startLeaseHeartbeat, nextBackoff, isRetryable, decideRetry, stopChild, readProgress };
