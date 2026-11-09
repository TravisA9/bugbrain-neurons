'use strict';
/* Desk: read a queue-branch folder and change pending work without taking a running job away.
 * Writes the same files workers already obey (worker-config.json, jobs/<id>.json).
 * Does not delete a job, does not bump forceVersion, and does not drop an active claim. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const WC = require('./wconfig.js');
const TM = require('./templates.js');
const STALE_MS = 45 * 60 * 1000;

const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const listJson = dir => { try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { return []; } };
function writeAtomic(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, p);
}
function blankConfig() { return { version: 1, forceVersion: 0, defaults: { mode: 'run', pollMinutes: 10 }, types: {}, workers: {}, jobs: {} }; }
function loadConfig(dir) { return readJson(path.join(dir, 'worker-config.json')) || blankConfig(); }
function saveConfig(dir, cfg) { writeAtomic(path.join(dir, 'worker-config.json'), cfg); }

function load(dir) {
  const config = loadConfig(dir);
  const jobs = listJson(path.join(dir, 'jobs')).map(f => readJson(path.join(dir, 'jobs', f))).filter(Boolean);
  const workers = listJson(path.join(dir, 'workers')).map(f => readJson(path.join(dir, 'workers', f))).filter(Boolean);
  const claims = {};
  for (const f of listJson(path.join(dir, 'claims'))) { const c = readJson(path.join(dir, 'claims', f)); if (c && c.id) claims[c.id] = c; else if (c) claims[f.slice(0, -5)] = c; }
  const done = {};
  for (const f of listJson(path.join(dir, 'done'))) { const d = readJson(path.join(dir, 'done', f)); if (d) done[d.id || f.slice(0, -5)] = d; }
  const meta = readJson(path.join(dir, 'meta.json'));
  return { dir, config, jobs, workers, claims, done, meta };
}

function agePhrase(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'at an unknown time';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 48) return h + ' h ago';
  return Math.round(h / 24) + ' days ago';
}

function decorateWorker(w, cfg, now) {
  const age = now - Date.parse(w.at);
  const connected = Number.isFinite(age) && age >= 0 && age <= STALE_MS;
  const resolved = WC.resolve(cfg, w.worker, w.type || 'linux');
  const mode = resolved.mode;
  let activity, label, pauseNote = '';
  if (!connected) { activity = 'offline'; label = 'Offline'; }
  else if (w.state === 'running' && w.job) {
    activity = 'busy'; label = 'Busy';
    if (mode === 'pause') pauseNote = 'New work is paused. This test is still running and was not stopped.';
  }
  else if (mode === 'pause' || w.state === 'paused') { activity = 'paused'; label = 'Paused'; }
  else if (w.state === 'power-pause') { activity = 'paused'; label = 'Paused (power)'; }
  else if (w.state === 'yielding') { activity = 'idle'; label = 'Idle'; }
  else if (w.state === 'idle' || w.state === 'running') { activity = 'idle'; label = 'Idle'; }
  else { activity = 'error'; label = 'Error'; }
  let staleNote = '';
  if (!connected && (w.state === 'running' || w.state === 'idle' || w.state === 'paused')) {
    staleNote = 'Last message ' + agePhrase(age) + ' said "' + w.state + (w.job ? ' ' + w.job : '') + '". Nothing newer has arrived, so that is not treated as live.';
  }
  if (!connected && mode === 'observe') staleNote = 'Observe mode does not publish a heartbeat. Offline and observe look the same from here.';
  return {
    name: w.worker, type: w.type || 'linux', host: w.host || '', platform: w.platform || '',
    connected, activity, label, enabled: mode === 'run' || mode === 'observe', mode,
    state: w.state || '', job: connected ? (w.job || null) : null, pauseNote,
    reportedJob: w.job || null, staleNote, lastSeen: w.at || null,
    ageMs: Number.isFinite(age) ? age : null, code: w.code || '', configVersion: w.configVersion || '',
    yielding: connected && w.state === 'yielding',
  };
}

function activeClaim(c, now) { return !!(c && Date.parse(c.until) > now); }

function decorateJob(j, q, now, exists) {
  const viewed = WC.jobView(q.config, j);
  const done = q.done[j.id] || null;
  const claim = q.claims[j.id] || null;
  const active = activeClaim(claim, now);
  const holder = active ? q.workers.find(w => w.worker === claim.worker) : null;
  const holderFresh = holder && (now - Date.parse(holder.at)) <= STALE_MS && (now - Date.parse(holder.at)) >= 0;
  let phase, parkReason = null;
  if (done && done.status === 'failed') phase = 'failed';
  else if (done) phase = 'finished';
  else if (j.kind === 'blocked') { phase = 'parked'; parkReason = 'file'; }
  else if (!viewed) { phase = 'parked'; parkReason = 'config'; }
  else if (active && holderFresh && holder.state === 'running' && holder.job === j.id) phase = 'working';
  else if (active && holderFresh) phase = 'leased';
  else if (active) phase = 'held';
  else phase = 'waiting';
  const names = new Set(q.workers.map(w => w.worker));
  if (viewed && viewed.assign) names.add(viewed.assign);
  const ctx = {
    done: new Set(Object.keys(q.done)),
    claimed: new Set(Object.keys(q.claims).filter(id => activeClaim(q.claims[id], now))),
    exists: exists || (() => true),
    passed: id => (q.done[id] || {}).pass === true,
  };
  const runnableBy = [];
  if (phase === 'waiting') {
    for (const name of names) {
      const type = (q.workers.find(w => w.worker === name) || {}).type || 'linux';
      if (WC.selectJobs(q.config, name, type, [j], ctx).length) runnableBy.push(name);
    }
  }
  const pri = viewed && viewed.priority != null ? +viewed.priority : +j.priority || 0;
  return {
    id: j.id, title: j.title || j.id, question: j.question || '', kind: j.kind || '',
    priority: +j.priority || 0, effectivePriority: pri,
    assign: viewed && viewed.assign || null,
    estHours: j.estHours || (j.budget && j.budget.hours) || null,
    memGB: j.memGB == null ? null : +j.memGB,
    runs: (j.runs || []).length,
    phase, parkReason, runnableBy,
    claim: active ? { worker: claim.worker, until: claim.until, at: claim.at } : null,
    done: done ? { status: done.status, pass: done.pass == null ? null : done.pass, worker: done.worker || null, finishedAt: done.finishedAt || null, summary: done.summary || null } : null,
  };
}

function explain(jobs, workers) {
  const lines = [];
  const fresh = workers.filter(w => w.connected);
  const waiting = jobs.filter(j => j.phase === 'waiting');
  const working = jobs.filter(j => j.phase === 'working');
  const held = jobs.filter(j => j.phase === 'held');
  const parkedFile = jobs.filter(j => j.parkReason === 'file');
  const parkedCfg = jobs.filter(j => j.parkReason === 'config');
  if (!fresh.length) lines.push('No computer has sent a heartbeat in the last 45 minutes. This page only knows what was published to the queue, not whether a machine is switched on.');
  else {
    const idle = fresh.filter(w => w.activity === 'idle').map(w => w.name);
    const busy = fresh.filter(w => w.activity === 'busy').map(w => w.name);
    const paused = fresh.filter(w => w.activity === 'paused').map(w => w.name);
    if (idle.length && !waiting.length && !working.length) lines.push(idle.join(', ') + (idle.length > 1 ? ' are' : ' is') + ' connected and idle. Nothing is waiting that they are allowed to pick up.');
    else if (idle.length) lines.push(idle.join(', ') + (idle.length > 1 ? ' are' : ' is') + ' connected and idle.');
    if (busy.length) lines.push(busy.join(', ') + (busy.length > 1 ? ' are' : ' is') + ' busy.');
    if (paused.length) lines.push(paused.join(', ') + (paused.length > 1 ? ' are' : ' is') + ' paused, so they will finish the current test and not take another.');
  }
  if (parkedFile.length || parkedCfg.length) {
    const bits = [];
    if (parkedFile.length) bits.push(parkedFile.length + ' parked in the test file');
    if (parkedCfg.length) bits.push(parkedCfg.length + ' held back in worker settings');
    lines.push('Not waiting to run: ' + bits.join(', ') + '.');
  }
  const stuck = waiting.filter(j => !j.runnableBy.length);
  if (stuck.length) lines.push(stuck.length + ' waiting ' + (stuck.length > 1 ? 'tests are' : 'test is') + ' not eligible for any listed computer (assignment, memory limit, or skip list).');
  const leased = jobs.filter(j => j.phase === 'leased');
  if (leased.length) lines.push(leased.map(j => j.id).join(', ') + ' still ' + (leased.length > 1 ? 'have' : 'has') + ' a lease from a computer that is not reporting ' + (leased.length > 1 ? 'them' : 'it') + ' as running. The lease is kept so the test cannot start twice.');
  if (held.length) lines.push(held.map(j => j.id).join(', ') + ' still ' + (held.length > 1 ? 'have' : 'has') + ' a lease from a computer that is not sending heartbeats. They are not handed to someone else before the lease ends, so the test cannot run twice.');
  const finished = jobs.filter(j => j.phase === 'finished' && j.done && j.done.finishedAt).sort((a, b) => Date.parse(b.done.finishedAt) - Date.parse(a.done.finishedAt));
  if (!waiting.length && !working.length && finished[0]) lines.push('Newest finished test in this copy: ' + finished[0].id + ' at ' + finished[0].done.finishedAt + '.');
  return lines;
}

function view(dir, now, extra) {
  extra = extra || {};
  const q = load(dir);
  const workers = q.workers.map(w => decorateWorker(w, q.config, now)).sort((a, b) => a.name.localeCompare(b.name));
  const jobs = q.jobs.map(j => decorateJob(j, q, now, extra.exists)).sort((a, b) => b.effectivePriority - a.effectivePriority || (a.id < b.id ? -1 : 1));
  return {
    now: new Date(now).toISOString(),
    staleMinutes: STALE_MS / 60000,
    publishArmed: !!extra.publishArmed,
    liveSwitch: !!extra.liveSwitch,
    localName: extra.localName || '',
    banner: q.meta && q.meta.banner || '',
    source: q.meta && q.meta.source || '',
    workers, jobs, whyIdle: explain(jobs, workers),
    templates: TM.listTemplates(),
    workerNames: workers.map(w => w.name),
  };
}

function fail(msg, code) { const e = new Error(msg); e.code = code || 'desk'; return e; }

function exactOverride(cfg, id) {
  const v = cfg.jobs && cfg.jobs[id];
  if (v === 'block') return { block: true };
  if (v && typeof v === 'object') return Object.assign({}, v);
  return {};
}
function writeOverride(cfg, id, o) {
  cfg.jobs = cfg.jobs || {};
  if (Object.prototype.hasOwnProperty.call(cfg.jobs, id)) delete cfg.jobs[id];
  const out = {};
  if (o.block) out.block = true;
  if (o.priority != null) out.priority = o.priority;
  if (o.assign) out.assign = o.assign;
  if (!out.block && out.priority == null && !out.assign) return;
  cfg.jobs[id] = out.block && out.priority == null && !out.assign ? 'block' : out;
}

function requireJob(q, id) {
  const j = q.jobs.find(x => x.id === id);
  if (!j) throw fail('No test named ' + id + ' is in this queue.', 'missing');
  return j;
}

function setMode(dir, name, mode) {
  if (!/^[a-z0-9._-]+$/.test(name || '')) throw fail('Unknown computer name.', 'name');
  if (!['run', 'pause', 'observe'].includes(mode)) throw fail('Mode must be run, pause, or observe.', 'mode');
  const cfg = loadConfig(dir);
  const prev = cfg.workers && cfg.workers[name] && typeof cfg.workers[name] === 'object' ? cfg.workers[name] : {};
  cfg.workers = cfg.workers || {};
  cfg.workers[name] = Object.assign({}, prev, { mode });
  if (cfg.forceVersion != null) { /* leave forceVersion untouched so a pause does not kill a running test */ }
  saveConfig(dir, cfg);
  return { ok: true, name, mode, effect: mode === 'pause' ? 'No new test will start on ' + name + '. A test already running there finishes. Nothing is deleted.' : 'This computer may take tests again. A test already running is left alone.' };
}

function setPriority(dir, id, priority, now) {
  const n = +priority;
  if (!Number.isFinite(n) || n < 0 || n > 5) throw fail('Priority must be a number from 0 to 5. Higher runs first.', 'priority');
  const q = load(dir);
  requireJob(q, id);
  const cfg = q.config;
  const o = exactOverride(cfg, id);
  o.priority = Math.round(n * 1000) / 1000;
  writeOverride(cfg, id, o);
  saveConfig(dir, cfg);
  const claim = q.claims[id];
  const running = activeClaim(claim, now || Date.now());
  return { ok: true, id, priority: o.priority, note: running ? 'Saved. This test is already leased, so the new priority applies only if it returns to the queue. The run is not stopped.' : 'Saved. Higher priority is taken first. A test already running somewhere else is not moved.' };
}

function assignJob(dir, id, worker, now) {
  const q = load(dir);
  const j = requireJob(q, id);
  if (j.kind === 'blocked') throw fail('This test is parked in its file. The desk will not assign it.', 'parked');
  const claim = q.claims[id];
  if (activeClaim(claim, now || Date.now())) throw fail('This test is leased to ' + claim.worker + ' until ' + claim.until + '. It was not reassigned, and the run was not stopped.', 'leased');
  if (worker != null && worker !== '' && !/^[a-z0-9._-]+$/.test(worker)) throw fail('Unknown computer name.', 'name');
  const cfg = q.config;
  if (WC.jobView(cfg, j) == null) throw fail('This test is held back in worker settings. Allow it before assigning it.', 'parked');
  const o = exactOverride(cfg, id);
  if (!worker) delete o.assign; else o.assign = worker;
  writeOverride(cfg, id, o);
  saveConfig(dir, cfg);
  return { ok: true, id, assign: worker || null, note: worker ? 'Only ' + worker + ' will take this once that computer is running this version of the worker. Other computers skip it. A running test is not moved.' : 'Any eligible computer may take this test.' };
}

function setBlock(dir, id, blocked, now) {
  const q = load(dir);
  const j = requireJob(q, id);
  if (j.kind === 'blocked') throw fail('This test is parked in its file. The desk does not rewrite that file, so it stays parked.', 'parked');
  if (blocked && activeClaim(q.claims[id], now || Date.now())) throw fail('This test is already running. Holding it would not stop that run, so nothing was changed. Pause that computer to stop taking new work.', 'leased');
  const cfg = q.config;
  const o = exactOverride(cfg, id);
  o.block = !!blocked;
  if (!o.block) delete o.block;
  writeOverride(cfg, id, o);
  saveConfig(dir, cfg);
  return { ok: true, id, blocked: !!blocked, note: blocked ? 'Held. No computer will start it. A test already running is left alone.' : 'Allowed again. It can be picked up if a computer is on and eligible.' };
}

function submit(dir, templateId, seed) {
  const job = TM.buildTemplate(templateId, seed);
  const dest = path.join(dir, 'jobs', job.id + '.json');
  if (fs.existsSync(dest) || fs.existsSync(path.join(dir, 'done', job.id + '.json'))) throw fail('Growth ' + seed + ' is already in the queue as ' + job.id + '. Pick another number.', 'exists');
  writeAtomic(dest, job);
  return { ok: true, id: job.id, title: job.title, note: 'Added on this computer. A Windows or Linux worker runs it after the queue is sent. A phone or a browser will not run it.' };
}

function readText(p, max) {
  try { const t = fs.readFileSync(p, 'utf8'); return t.length > max ? t.slice(0, max) + '\n…' : t; } catch (e) { return ''; }
}

function jobDetail(dir, id, now) {
  const q = load(dir);
  const j = requireJob(q, id);
  const card = decorateJob(j, q, now || Date.now());
  const log = readText(path.join(dir, 'results', id, 'QUEUE_LOG.md'), 20000);
  let state = null;
  const st = readJson(path.join(dir, 'results', id, 'queue_state.json'));
  if (st && st.jobs && st.jobs[id]) {
    const s = st.jobs[id];
    const n = s.results ? Object.keys(s.results).length : 0;
    state = { status: s.status || '', error: s.error || '', progressDone: n, progressTotal: (j.runs || []).length, pass: s.pass == null ? null : s.pass };
  }
  return { job: card, log, state };
}

const LIVE_RE = /github\.com[:/]+TravisA9\/bugbrain-neurons(?:\.git)?(?:$|[/?#])/i;
function assertCanPublish(url, env) {
  env = env || process.env;
  if (LIVE_RE.test(String(url || '')) && env.BB_CONSOLE_PUBLISH_LIVE !== '1') {
    throw fail('This folder points at the live BugBrain queue. Sending is off so a click cannot change the jobs the computers share. Set BB_CONSOLE_PUBLISH_LIVE=1 only when you mean to send.', 'live-queue');
  }
}
function git(dir, args) {
  return cp.execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }) }).trim();
}
function publish(dir, env) {
  let url = '';
  try { url = git(dir, ['remote', 'get-url', 'origin']); } catch (e) { throw fail('This folder is not a queue checkout, so there is nowhere to send changes.', 'publish'); }
  assertCanPublish(url, env);
  let br = '';
  try { br = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']); } catch (e) { throw fail('Could not read the git branch.', 'publish'); }
  if (br !== 'queue') throw fail('Refusing to send. This folder is on "' + br + '", not the queue branch.', 'branch');
  const paths = ['worker-config.json', 'jobs', 'claims'].filter(p => fs.existsSync(path.join(dir, p)));
  if (!paths.length) throw fail('Nothing to send.', 'publish');
  git(dir, ['add', '-A', '--'].concat(paths));
  const dirty = git(dir, ['status', '--porcelain', '--'].concat(paths));
  if (!dirty) return { ok: true, pushed: false, note: 'Nothing new to send.' };
  git(dir, ['-c', 'user.name=bugbrain-desk', '-c', 'user.email=bugbrain-desk@users.noreply.github.com', 'commit', '-q', '-m', 'desk: update queue control']);
  git(dir, ['push', '-q', 'origin', 'HEAD:queue']);
  return { ok: true, pushed: true, note: 'Sent to the queue branch. Workers see it on their next sync.' };
}

module.exports = {
  STALE_MS, load, view, explain, setMode, setPriority, assignJob, setBlock, submit, jobDetail,
  assertCanPublish, publish, agePhrase, activeClaim, LIVE_RE,
};
