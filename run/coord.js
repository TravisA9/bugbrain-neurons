#!/usr/bin/env node
'use strict';
/* Poll a Compute Lab coordinator over HTTPS. No GitHub token and no owner password.
 *   node run/coord.js --url http://127.0.0.1:8091/computelab --token-file ~/.bugbrain/coordinator-token --once
 * Outbound polling works from a home network. The git queue remains the path when this URL is unset. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');

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
function tokenFrom(file) {
  const t = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{32,128}$/.test(t)) throw new Error('Worker token file is not a coordinator token.');
  return t;
}
async function api(base, token, route, body) {
  const res = await fetch(base.replace(/\/$/, '') + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || ('Coordinator answered ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}
function runSpec(job) {
  if (!ALLOWED.has(job.runner)) throw new Error('Runner is not on the allowlist: ' + job.runner);
  const spec = job.spec || {};
  const out = path.join(require('os').tmpdir(), 'coord-' + job.id);
  fs.mkdirSync(out, { recursive: true });
  if (job.runner === 'spikefoundry/run.js') {
    const file = path.join(out, 'job.json');
    fs.writeFileSync(file, JSON.stringify(Object.assign({ id: job.id, kind: 'spikefoundry', project: 'spikefoundry', seed: spec.seed || 1, batches: spec.batches || 1, scenario: spec.scenario, scenarioParams: spec.scenarioParams, title: job.title })));
    cp.execFileSync(process.execPath, [path.join(ROOT, 'spikefoundry', 'run.js'), '--job', file, '--out', out], { cwd: ROOT, stdio: 'inherit' });
    const summary = fs.existsSync(path.join(out, 'summary.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')) : {};
    const text = summary.note || 'Synthetic SpikeFoundry run.';
    return { status: 'done', summary: String(text).slice(0, 500), synthetic: true, digest: require('crypto').createHash('sha256').update(String(text).slice(0, 500)).digest('hex') };
  }
  const task = spec.task;
  if (!task || typeof task !== 'object') throw new Error('BugBrain template is missing a task object.');
  const variant = String(spec.variant || 'base');
  if (/[\n\r;&|`$]/.test(variant) || /[\n\r;&|`$]/.test(String(spec.plan || ''))) throw new Error('Template text has characters the worker will not pass through.');
  const growths = String(Math.max(1, Math.min(4, +spec.growths || 1)));
  const seed = String(Math.max(0, Math.min(1000000, +spec.seed || 0)));
  cp.execFileSync(process.execPath, [path.join(ROOT, job.runner), String(spec.plan || 'deepURSx3'), JSON.stringify(task), growths, variant, seed], { cwd: ROOT, stdio: 'inherit' });
  return { status: 'done', summary: 'Template ' + job.runner + ' finished.', synthetic: false, digest: require('crypto').createHash('sha256').update('Template ' + job.runner + ' finished.').digest('hex') };
}

async function main() {
  const a = args(process.argv);
  const base = a.url || process.env.BB_COORDINATOR_URL;
  const tokenFile = a['token-file'] || process.env.BB_COORDINATOR_TOKEN_FILE;
  if (!base || !tokenFile) throw new Error('Need --url and --token-file (or BB_COORDINATOR_URL and BB_COORDINATOR_TOKEN_FILE).');
  const token = tokenFrom(tokenFile);
  const hash = protocolHash();
  const wait = () => new Promise(r => setTimeout(r, +(process.env.BB_COORD_POLL_MS || 15000)));
  for (;;) {
    const beat = await api(base, token, '/api/v1/heartbeat', { codeHash: hash });
    if (beat.paused) {
      console.log(JSON.stringify({ ok: true, paused: true }));
      if (a.once) return;
      await wait();
      continue;
    }
    const claimed = await api(base, token, '/api/v1/claim', { codeHash: hash });
    if (!claimed.job) {
      console.log(JSON.stringify({ ok: true, job: null }));
      if (a.once) return;
      await wait();
      continue;
    }
    if (claimed.job.codeHash !== hash) throw new Error('Job code hash does not match this checkout.');
    let result;
    try { result = runSpec(claimed.job); }
    catch (e) { result = { status: 'error', summary: String(e.message || e).slice(0, 500), synthetic: claimed.job.project === 'spikefoundry' }; }
    await api(base, token, '/api/v1/result', { jobId: claimed.job.id, result });
    console.log(JSON.stringify({ ok: true, job: claimed.job.id, status: result.status }));
    if (a.once) return;
    await wait();
  }
}
if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });
module.exports = { ALLOWED, protocolHash, runSpec };
