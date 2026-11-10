'use strict';
const fs = require('fs'), path = require('path'), { EventEmitter } = require('events');
const coord = require('./coord.js');
let fail = 0, n = 0;
function check(ok, what) {
  n++;
  if (!ok) { fail++; console.error('FAIL ' + what); }
  else console.log('ok   ' + what);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fakeSpawn(ms) {
  return function spawn() {
    const child = new EventEmitter();
    child.pid = 7;
    child.exitCode = null;
    child.signalCode = null;
    const timer = setTimeout(() => {
      child.exitCode = 0;
      child.emit('close', 0, null);
    }, ms);
    child.kill = () => {
      if (child.exitCode != null || child.signalCode != null) return;
      clearTimeout(timer);
      child.signalCode = 'SIGTERM';
      child.emit('close', null, 'SIGTERM');
    };
    return child;
  };
}
const job = {
  id: 'sf-vision-1-abc',
  project: 'spikefoundry',
  title: 'Synthetic',
  runner: 'spikefoundry/run.js',
  codeHash: 'abc',
  spec: { seed: 1, batches: 1, scenario: 'vision' },
};

(async () => {
  const net = new Error('socket hang up');
  net.network = true;
  const server = new Error('Coordinator answered 503');
  server.status = 503;
  const denied = new Error('revoked');
  denied.status = 401;
  const bad = new Error('Job code hash does not match this checkout.');
  check(coord.decideRetry(net, 0).action === 'retry' && coord.decideRetry(net, 0).delay === 1000, 'a network error retries inside the loop');
  check(coord.decideRetry(server, 1000).action === 'retry' && coord.decideRetry(server, 1000).delay === 2000, 'an HTTP 500 retries with a longer wait');
  check(coord.decideRetry(denied, 1000).action === 'stop', 'a revoked token stops the worker');
  check(coord.decideRetry(bad, 1000).action === 'crash', 'a protocol mismatch is not retried as a transient error');
  let delay = 0;
  for (let i = 0; i < 20; i++) delay = coord.nextBackoff(delay);
  check(delay === 5 * 60 * 1000, 'backoff caps at about 5 minutes');

  coord.assertProtocol({ codeHash: 'abc' }, 'abc');
  let hashThrew = false;
  try { coord.assertProtocol({ codeHash: 'nope' }, 'abc'); } catch (e) { hashThrew = /code hash/.test(e.message); }
  check(hashThrew, 'the worker checks the protocol hash before running');

  const src = fs.readFileSync(path.join(__dirname, 'coord.js'), 'utf8');
  check(src.indexOf('execFileSync') === -1 && coord.ALLOWED.has('spikefoundry/run.js') && coord.ALLOWED.has('run/r42.js') && coord.ALLOWED.has('run/gen.js'), 'runners stay on the allowlist and the job process is async');

  let spawned = false;
  let allowThrew = false;
  try {
    await coord.runSpec(Object.assign({}, job, { runner: 'run/nope.js' }), { spawn: () => { spawned = true; return fakeSpawn(10)(); } });
  } catch (e) { allowThrew = /allowlist/.test(e.message); }
  check(allowThrew && !spawned, 'a runner outside the allowlist is refused before a process starts');

  const calls = [];
  const beats = coord.startLeaseHeartbeat({
    heartbeatMs: 25,
    jobId: job.id,
    heartbeat: async () => { calls.push(Date.now()); return { ok: true, jobId: job.id, paused: false }; },
  });
  await sleep(90);
  await beats.finish();
  check(calls.length >= 2, 'the heartbeat timer fires while a job is running');

  const out = path.join(require('os').tmpdir(), 'coord-test-' + process.pid);
  let ticks = 0;
  const ran = await coord.runSpec(job, {
    outDir: path.join(out, 'ok'),
    heartbeatMs: 20,
    stdio: 'ignore',
    spawn: fakeSpawn(160),
    heartbeat: async () => { ticks++; return { ok: true, jobId: job.id, paused: false }; },
  });
  check(ran.status === 'done' && ran.synthetic === true && ticks >= 2, 'a running job keeps heartbeating and can still finish');

  let killed = false;
  let lostThrew = false;
  const started = Date.now();
  try {
    await coord.runSpec(job, {
      outDir: path.join(out, 'lost'),
      heartbeatMs: 15,
      stdio: 'ignore',
      spawn: fakeSpawn(5000),
      heartbeat: async () => { killed = true; return { ok: true, jobId: null, paused: false }; },
    });
  } catch (e) { lostThrew = !!(e && e.leaseLost && !e.revoked); }
  check(lostThrew && killed && (Date.now() - started) < 1000, 'a lost lease stops the child and does not submit');

  const paused = await coord.runSpec(job, {
    outDir: path.join(out, 'pause'),
    heartbeatMs: 15,
    stdio: 'ignore',
    spawn: fakeSpawn(80),
    heartbeat: async () => ({ ok: true, jobId: job.id, paused: true }),
  });
  check(paused.status === 'done' && paused.pauseAfter === true, 'pause lets the current job finish');

  let revoked = false;
  try {
    await coord.runSpec(job, {
      outDir: path.join(out, 'revoked'),
      heartbeatMs: 15,
      stdio: 'ignore',
      spawn: fakeSpawn(5000),
      heartbeat: async () => { const err = new Error('revoked'); err.status = 401; throw err; },
    });
  } catch (e) { revoked = !!(e && e.leaseLost && e.revoked); }
  check(revoked, 'a revoked token stops the child and does not submit');

  let shaky = 0;
  const survived = await coord.runSpec(job, {
    outDir: path.join(out, 'net'),
    heartbeatMs: 15,
    stdio: 'ignore',
    spawn: fakeSpawn(70),
    heartbeat: async () => {
      shaky++;
      if (shaky === 1) { const err = new Error('down'); err.network = true; throw err; }
      return { ok: true, jobId: job.id, paused: false };
    },
  });
  check(survived.status === 'done' && shaky >= 1, 'a heartbeat network error does not drop the running job');

  check(coord.shouldWait('done') === false && coord.shouldWait('empty') === true && coord.shouldWait('error') === true && coord.shouldWait('paused') === true, 'a finished job claims again immediately and an empty queue waits');

  const batches = coord.packUploadBatches([{ a: 1 }, { a: 2 }, { a: 3 }], 2, 1000000);
  check(batches.length === 2 && batches[0].length === 2 && batches[1].length === 1, 'design uploads split after 500 records or about 1 MB');
  const wide = coord.packUploadBatches([{ blob: 'abcdef' }, { blob: 'ghijkl' }], 10, 20);
  check(wide.length === 2, 'a batch also splits when the JSON would pass about 1 MB');

  const uploadBeats = [];
  const waits = [];
  const script = [
    { status: 503 },
    { status: 429, headers: { 'retry-after': '2' } },
    { status: 200, body: { stored: 1 } },
  ];
  let step = 0;
  const file = path.join(out, 'designs.json');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ records: [{ id: 1 }], summary: { evals: 3 } }));
  const report = await coord.uploadDesigns('http://coord.test', 'abc', 'hash', file, {
    sleep: async (ms) => { waits.push(ms); },
    heartbeat: async () => { uploadBeats.push('beat'); },
    fetch: async () => {
      const item = script[Math.min(step, script.length - 1)];
      step++;
      return { ok: item.status === 200, status: item.status, headers: { get: (name) => item.headers ? item.headers[name] : '' }, json: async () => item.body || {} };
    },
  });
  check(report.ok && waits.indexOf(2000) !== -1 && uploadBeats.length >= 2, 'an upload retries 429 and 5xx, honors Retry-After, and keeps heartbeating');
  const refused = await coord.uploadDesigns('http://coord.test', 'abc', 'hash', file, {
    sleep: async () => {},
    fetch: async () => ({ ok: false, status: 400, headers: { get: () => '' }, json: async () => ({ error: 'no' }) }),
  });
  check(!refused.ok && /no/.test(refused.error), 'a rejected upload is reported instead of dropped');

  const junk = path.join(out, 'dirs');
  fs.mkdirSync(path.join(junk, 'coord-old'), { recursive: true });
  fs.mkdirSync(path.join(junk, 'coord-new'), { recursive: true });
  const oldTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  fs.utimesSync(path.join(junk, 'coord-old'), oldTime, oldTime);
  coord.cleanupStaleCoordDirs(junk, 24 * 60 * 60 * 1000, Date.now());
  coord.cleanupJobDir(path.join(junk, 'coord-new'));
  check(!fs.existsSync(path.join(junk, 'coord-old')) && !fs.existsSync(path.join(junk, 'coord-new')), 'stale coord folders and a finished job folder are removed');

  const lf = 'computelab-protocol-2\nkeep this line\n';
  check(coord.hashText(lf) === coord.hashText(lf.replace(/\n/g, '\r\n')), 'a CRLF copy of the protocol hashes the same as LF');
  const P = coord.resourcePlan;
  const off = P('off', 50, 8), full = P('full', 50, 8), half = P('allowance', 50, 8), tenth = P('allowance', 10, 8), third = P('allowance', 30, 8), one = P('allowance', 50, 1);
  check(off.slots === 0 && full.slots === 8 && full.duty === 1 && full.priority === 'normal', 'Off claims nothing and Full blast uses every core at normal priority');
  check(half.slots === 4 && half.duty === 1 && half.priority === 'low' && tenth.slots === 1 && tenth.duty === 0.8 && third.slots === 3 && third.duty === 0.8 && one.slots === 1 && one.duty === 0.5, 'Allowance caps slots to the share of cores and duty-cycles the rest at low priority');
  check(P('allowance', 95, 8).pct === 90 && P('allowance', 3, 8).pct === 10 && P('full', 0, 8, 2).slots === 2, 'the allowance stays between 10% and 90% and BB_MAX_SLOTS caps the slots');
  check(coord.settingsFrom({ paused: true, resources: { mode: 'full', allowancePct: 70 } }).mode === 'off' && coord.settingsFrom({ resources: { mode: 'allowance', allowancePct: 70 } }).pct === 70 && coord.settingsFrom({ paused: false }).mode === 'full', 'the worker reads the setting from the heartbeat, and an old coordinator means Full blast');
  check(coord.samePlan(P('allowance', 50, 8), P('allowance', 50, 8)) && !coord.samePlan(half, full), 'a changed setting is noticed');
  check(P('off', 50, 8, 8, 3).slots === 0 && P('full', 50, 8, 8, 3).slots === 3 && P('full', 50, 8, 8, 0).slots === 8 && P('full', 50, 8, 8, 20).slots === 8, 'Experiments at once: Off stays 0, Full blast runs up to the chosen number, Auto and a number above the cores mean every core');
  check(P('allowance', 50, 8, 8, 6).slots === 4 && P('allowance', 50, 8, 8, 2).slots === 2 && P('allowance', 50, 8, 8, 2).duty === 1 && P('allowance', 50, 8, 8, 0).slots === 4, 'Experiments at once under Allowance: the allowance still caps it, and a smaller number runs fewer jobs');
  check(coord.settingsFrom({ resources: { mode: 'full', allowancePct: 50, maxJobs: 3 } }).maxJobs === 3 && coord.settingsFrom({ resources: { mode: 'full' } }).maxJobs === 0 && coord.settingsFrom({ resources: { mode: 'full', maxJobs: -2 } }).maxJobs === 0, 'the worker reads Experiments at once from the heartbeat; missing means Auto');
  check(!coord.samePlan(P('full', 50, 8, 8, 0), P('full', 50, 8, 8, 8)), 'changing Experiments at once is noticed even when the slot count is the same');
  const Throttle = require('../spikefoundry/throttle.js');
  const tdir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'thr-'));
  const tfile = path.join(tdir, 'throttle.json');
  coord.writeThrottle(tfile, 0.5);
  Throttle.useFile(tfile);
  const t0 = Date.now(); let slept = 0;
  while (Date.now() - t0 < 600) { const x = Date.now(); while (Date.now() - x < 20) {} slept += Throttle.pace(); }
  Throttle.useFile('');
  check(slept >= 150 && slept <= 450, 'a job at duty 0.5 rests about half of the time (' + slept + ' ms of 600)');

  {
    const C2 = require('./coord.js');
    const crypto = require('crypto');
    const r = { summary: 'Synthetic run.', digest: crypto.createHash('sha256').update('Synthetic run.').digest('hex') };
    r.summary += ' Design upload failed: 503';
    C2.withDigest(r);
    check(r.digest === crypto.createHash('sha256').update(r.summary).digest('hex'), 'a changed summary gets a matching digest, so the result is still accepted');
    const sig = C2.timeoutSignal(50);
    let aborted = false;
    try { await fetch('http://10.255.255.1:9/', { signal: sig }); } catch (e) { aborted = true; }
    check(aborted, 'a request that never answers is given up after its timeout');
  }

  {
    const V = require('./verify-start.js');
    const t = Date.now();
    check(V.judge({ since: t, alive: true, aliveAt: t + 5, coordRunning: true, launcherRunning: true }).ok === true, 'setup says running only when the worker checked in after setup started and is alive');
    check(V.judge({ since: t, alive: true, aliveAt: t - 60000, coordRunning: true, launcherRunning: true }).ok === false, 'a check-in from before this setup does not count');
    const dead = V.judge({ since: t, alive: false, aliveAt: 0, coordRunning: false, launcherRunning: false });
    check(dead.ok === false && /not running/.test(dead.what) && dead.fix.length > 10, 'a worker that never started is a FAIL with a plain fix');
    const quiet = V.judge({ since: t, alive: false, aliveAt: 0, coordRunning: false, launcherRunning: true, status: { why: 'token refused' } });
    check(quiet.ok === false && /not checked in/.test(quiet.what) && /token refused/.test(quiet.what), 'a worker that runs but never reached the coordinator is a FAIL that says why');
  }

  console.log(n + ' checks');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
