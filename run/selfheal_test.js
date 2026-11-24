'use strict';
/* node run/selfheal_test.js: Phase 0 self-healing worker (Nov 2026).
 * - coord.js against a local mock coordinator: an unknown HTTP 4xx on claim skips that slot only; a revoked or
 *   missing token waits as "needs re-link" (no exit, no crash loop) and exits 12 once the token file changes;
 *   a coordinator outage keeps writing coord-alive.json with ack false.
 * - supervisor.js stale-heartbeat rule, verify-start's ack rule, watchdog health (linger, may-sleep, legacy unit).
 * - worker.sh: flock single instance, Node lookup outside PATH, yielding only to a Compute Lab launcher, and the
 *   missing-Node report to the site. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', n, m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'heal-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = 'ab'.repeat(24), TOKEN2 = 'cd'.repeat(24);
const COORD = path.join(__dirname, 'coord.js');

function mock(handler) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', d => { body += d; }); req.on('end', () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch (e) {}
      const auth = String(req.headers.authorization || '').replace(/^Bearer /, '');
      seen.push({ url: req.url, body: j, auth });
      const [code, out] = handler(req.url, j, auth, seen);
      res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, seen, url: 'http://127.0.0.1:' + srv.address().port })));
}
function startCoord(url, st, tokenFile, extraEnv) {
  const env = Object.assign({}, process.env, { BB_STATE_DIR: st, BB_COORD_POLL_MS: '200', BB_COORD_CONTROL_MS: '1000', BB_MAX_SLOTS: '2', BB_RELINK_POLL_MS: '200', BB_RELINK_RECHECK_MS: '600000' }, extraEnv || {});
  delete env.BB_COORDINATOR_URL;
  const p = cp.spawn(process.execPath, [COORD, '--url', url, '--token-file', tokenFile, '--stop-file', path.join(st, 'dq.stop')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; });
  p.done = new Promise(r => p.on('exit', (code, sig) => r(code == null ? sig : code)));
  return p;
}
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); }
const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

(async () => {
  /* 1. Unknown 4xx on claim: slot 0 gets 400 forever; slot 1 keeps claiming; the worker never exits. */
  { const st = tmp(), tf = path.join(st, 'coordinator-token'); fs.writeFileSync(tf, TOKEN + '\n');
    const m = await mock((url, j) => {
      if (url.endsWith('/heartbeat')) return [200, { ok: true, resources: { mode: 'full' } }];
      if (url.endsWith('/claim')) return j.slot === 0 ? [400, { error: 'A brand-new rule the worker has never seen.' }] : [200, { job: null }];
      return [200, { ok: true }];
    });
    const p = startCoord(m.url, st, tf);
    await until(() => m.seen.filter(s => s.url.endsWith('/claim') && s.body.slot === 1).length >= 4, 8000);
    const exited = await Promise.race([p.done, sleep(300).then(() => 'running')]);
    ok(exited === 'running', 'an unknown HTTP 400 on one slot does not stop the worker');
    ok(m.seen.filter(s => s.url.endsWith('/claim') && s.body.slot === 1).length >= 4, 'the other slot keeps claiming work');
    ok(m.seen.filter(s => s.url.endsWith('/claim') && s.body.slot === 0).length === 1, 'the refused slot backs off (no tight retry loop)');
    ok(m.seen.some(s => s.url.endsWith('/diagnostics') && /skipped a request the coordinator refused \(HTTP 400\)/.test(s.body.summary || '')), 'the skip is reported to the site');
    p.kill('SIGKILL'); m.srv.close(); }

  /* 2. Revoked token: needs re-link, stays up, exits 12 when the token file changes. */
  { const st = tmp(), tf = path.join(st, 'coordinator-token'); fs.writeFileSync(tf, TOKEN + '\n');
    const m = await mock((url, j, auth) => {
      if (auth === TOKEN) return [401, { error: 'Unknown or revoked worker token.' }];
      return [200, { ok: true, resources: { mode: 'off' } }];
    });
    const p = startCoord(m.url, st, tf);
    await until(() => fs.existsSync(path.join(st, 'relink.json')), 8000);
    const r = readJ(path.join(st, 'relink.json')), s = readJ(path.join(st, 'status.json')), a = readJ(path.join(st, 'coord-alive.json'));
    ok(r && r.state === 'needs-relink' && /token/.test(r.why), 'a revoked token writes relink.json with the reason');
    ok(s && s.state === 'needs-relink', 'status.json says needs-relink');
    ok(a && a.ack === false && a.relink === true && a.pid === p.pid, 'coord-alive.json says alive but not acknowledged, so the supervisor does not kill it');
    const early = await Promise.race([p.done, sleep(800).then(() => 'running')]);
    ok(early === 'running', 'the worker waits instead of exiting into a crash loop');
    ok(!/[a-f0-9]{48}/.test(p.out), 'the token is never printed');
    fs.writeFileSync(tf, TOKEN2 + '\n');
    const code = await Promise.race([p.done, sleep(5000).then(() => 'timeout')]);
    ok(code === 12, 'a new token file makes it exit 12 (restart now, not a crash)');
    ok(!fs.existsSync(path.join(st, 'relink.json')), 'relink.json is cleared on the way out');
    m.srv.close(); }

  /* 3. Missing token file: needs re-link too, then a token appears. */
  { const st = tmp(), tf = path.join(st, 'coordinator-token');
    const m = await mock(() => [200, { ok: true }]);
    const p = startCoord(m.url, st, tf);
    await until(() => fs.existsSync(path.join(st, 'relink.json')), 5000);
    ok(/missing/.test((readJ(path.join(st, 'relink.json')) || {}).why || ''), 'a missing token file is a needs-relink wait, not a crash');
    fs.writeFileSync(tf, TOKEN + '\n');
    ok(await Promise.race([p.done, sleep(5000).then(() => 'timeout')]) === 12, 'the new token file restarts the worker (exit 12)');
    m.srv.close(); }

  /* 4. Coordinator outage after a good start: alive with ack false, no exit. */
  { const st = tmp(), tf = path.join(st, 'coordinator-token'); fs.writeFileSync(tf, TOKEN + '\n');
    let down = false;
    const m = await mock(url => {
      if (down) return [503, { error: 'maintenance' }];
      if (url.endsWith('/heartbeat')) return [200, { ok: true, resources: { mode: 'off' } }];
      return [200, { ok: true, job: null }];
    });
    const p = startCoord(m.url, st, tf);
    await until(() => (readJ(path.join(st, 'coord-alive.json')) || {}).ack === true, 5000);
    ok((readJ(path.join(st, 'coord-alive.json')) || {}).ack === true, 'a coordinator answer marks the check-in acknowledged');
    down = true;
    await until(() => (readJ(path.join(st, 'coord-alive.json')) || {}).ack === false, 5000);
    const a = readJ(path.join(st, 'coord-alive.json'));
    ok(a && a.ack === false && a.pid === p.pid, 'during an outage the worker still says it is alive (ack false)');
    ok(await Promise.race([p.done, sleep(500).then(() => 'running')]) === 'running', 'an outage does not stop the worker');
    p.kill('SIGKILL'); m.srv.close(); }

  /* 5. Supervisor stale rule and verify-start's ack rule. */
  { process.env.BB_STATE_DIR = tmp();
    const S = require('./supervisor.js'), now = Date.now(), t0 = now - 20 * 60e3;
    ok(S.staleCoordinator({ pid: 5, at: new Date(now - 6 * 60e3).toISOString() }, 5, t0, now), 'no check-in write for 6 minutes is stuck');
    ok(!S.staleCoordinator({ pid: 5, at: new Date(now - 60e3).toISOString(), ack: false }, 5, t0, now), 'a fresh write with ack false (outage) is not stuck');
    ok(!S.staleCoordinator({ pid: 5, at: new Date(t0 - 1000).toISOString() }, 5, t0, now), 'a file from before this start (still connecting) is left alone');
    ok(!S.staleCoordinator({ pid: 6, at: new Date(now - 6 * 60e3).toISOString() }, 5, t0, now), 'a file from another process is ignored');
    const V = require('./verify-start.js'), t = Date.now();
    ok(V.judge({ since: t, alive: true, aliveAt: t + 5, ack: false, coordRunning: true, launcherRunning: true }).ok === false, 'setup does not call an unacknowledged worker running');
    ok(V.judge({ since: t, alive: true, aliveAt: t + 5, coordRunning: true, launcherRunning: true }).ok === true, 'an old coord-alive.json without ack still counts (compatible)'); }

  /* 6. Watchdog health: linger, may-sleep, legacy unit. */
  { const W = require('./watchdog.js');
    ok(W.lingerState(() => 'Linger=yes\n', 'nobody-heal-test') === true && W.lingerState(() => 'Linger=no\n', 'nobody-heal-test') === false, 'linger is read from loginctl');
    ok(W.maySleepLinux((c, a) => /type$/.test(a[2]) ? "'suspend'\n" : 'uint32 1200\n') === true, 'GNOME suspend after 20 minutes on AC: may sleep');
    ok(W.maySleepLinux(() => "'nothing'\n") === false, 'GNOME set to do nothing: will not sleep');
    ok(W.maySleepLinux(() => { throw new Error('no gsettings'); }) === null, 'no GNOME: unknown');
    ok(W.maySleepWindows(() => 'Power Setting GUID: x (Sleep after)\n  Current AC Power Setting Index: 0x00000708\n  Current DC Power Setting Index: 0x00000384\n') === true, 'Windows AC sleep timer 30 min: may sleep');
    ok(W.maySleepWindows(() => 'x\n  Index: 0x00000000\n  Index: 0x00000384\n') === false, 'Windows AC sleep never: will not sleep');
    const legacy = '[Unit]\nDescription=BugBrain always-on worker\n[Service]\nExecStart=/bin/sh %h/.bugbrain/worker.sh\nRestart=always\n';
    ok(W.isLegacyUnit(legacy) && !W.isLegacyUnit(legacy + 'Environment=BB_COORDINATOR_URL=x\n') && !W.isLegacyUnit('[Service]\nExecStart=/bin/sh %h/other.sh\n'), 'only the old GitHub-token unit counts as legacy');
    const mk = (state) => { const home = tmp(), st = tmp(), d = path.join(home, '.config/systemd/user'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'bugbrain-worker.service'), legacy); const calls = []; const run = (c, a) => { calls.push(c + ' ' + a.join(' ')); if (a[1] === 'is-active') { if (state === 'active') return 'active\n'; const e = new Error('inactive'); e.stdout = state + '\n'; throw e; } return ''; }; return { home, st, d, calls, run }; };
    const dead = mk('activating'); const r1 = W.legacyCleanup(dead.st, dead.run, dead.home);
    ok(r1.legacy && !fs.existsSync(path.join(dead.d, 'bugbrain-worker.service')) && fs.existsSync(path.join(dead.st, 'legacy-bugbrain-worker.service.bak')) && dead.calls.includes('systemctl --user disable --now bugbrain-worker.service'), 'a legacy unit stuck restarting is disabled and moved to ~/.bugbrain (kept as a backup)');
    const live = mk('active'); const r2 = W.legacyCleanup(live.st, live.run, live.home);
    ok(r2.legacy && fs.existsSync(path.join(live.d, 'bugbrain-worker.service')) && !live.calls.some(c => /disable/.test(c)), 'a legacy worker that is running is left alone and only reported');
    const other = mk('failed'); fs.writeFileSync(path.join(other.d, 'bugbrain-worker.service'), '[Service]\nExecStart=/usr/bin/something\n');
    ok(W.legacyCleanup(other.st, other.run, other.home).legacy === false && fs.existsSync(path.join(other.d, 'bugbrain-worker.service')), 'a bugbrain-worker unit that is not the old worker is never touched');
    const st = tmp(); fs.writeFileSync(path.join(st, 'stop-computelab.sh'), '#!/bin/sh\n# computelab-watchdog\n[ -f "$HOME/.bugbrain/worker.pid" ] && kill "$(cat "$HOME/.bugbrain/worker.pid")"\n');
    W.ensure({ force: true, stateDir: st, home: tmp(), platform: 'linux', install: 'cron', run: (c, a) => a[0] === '-l' ? '# computelab-watchdog\n' : '', healthRun: () => { throw new Error('none'); } });
    const stop = fs.readFileSync(path.join(st, 'stop-computelab.sh'), 'utf8');
    ok(stop.indexOf(W.STOP_MARK) >= 0 && /run\/worker\.sh/.test(stop), 'old stop scripts are replaced; the new one only kills the Compute Lab launcher');
    let shOk = true; try { cp.execFileSync('sh', ['-n', path.join(st, 'stop-computelab.sh')]); } catch (e) { shOk = false; }
    ok(shOk, 'the stop script is valid sh');
    ok(W.read(st).health && 'linger' in W.read(st).health, 'health is saved to watchdog.json for the heartbeat and diagnostics'); }

  /* 7. worker.sh: flock, Node lookup outside PATH, Compute Lab yields only to a Compute Lab launcher, no-Node report. */
  if (process.platform !== 'win32') {
    const d = tmp(), origin = path.join(d, 'origin.git'), work = path.join(d, 'src'), st = path.join(d, 'st'), home = path.join(d, 'checkout'), fakeHome = path.join(d, 'home');
    fs.mkdirSync(st); const g = (cwd, ...a) => cp.execFileSync('git', a, { cwd, stdio: 'pipe' });
    g(d, 'init', '-q', '--bare', origin); fs.mkdirSync(path.join(work, 'run'), { recursive: true });
    fs.writeFileSync(path.join(work, 'run/supervisor.js'), "require('fs').writeFileSync(process.env.MARK, process.execPath); setTimeout(() => {}, 60000);\n");
    g(work, 'init', '-q', '-b', 'b1'); g(work, 'add', '.'); g(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x'); g(work, 'push', '-q', origin, 'b1');
    const nvmBin = path.join(fakeHome, '.nvm/versions/node/v20.11.1/bin'); fs.mkdirSync(nvmBin, { recursive: true }); fs.symlinkSync(process.execPath, path.join(nvmBin, 'node'));
    const binDir = path.join(d, 'bin'); fs.mkdirSync(binDir);
    for (const t of ['git', 'flock', 'sed', 'head', 'cat', 'date', 'wc', 'mv', 'rm', 'mkdir', 'chmod', 'sleep', 'dirname', 'tr', 'grep', 'uname', 'curl', 'ls']) { try { const p = cp.execFileSync('sh', ['-c', 'command -v ' + t], { encoding: 'utf8' }).trim(); if (p) fs.symlinkSync(p, path.join(binDir, t)); } catch (e) {} }
    const mark = path.join(d, 'mark');
    const env = Object.assign({}, process.env, { HOME: fakeHome, PATH: binDir, BB_STATE_DIR: st, BB_HOME: home, BB_CODE_BRANCH: 'b1', BB_REPO: origin, MARK: mark });
    delete env.BB_COORDINATOR_URL;
    const p1 = cp.spawn('/bin/sh', [path.join(__dirname, 'worker.sh')], { env, stdio: 'ignore', detached: true });
    await until(() => fs.existsSync(mark), 15000);
    ok(fs.existsSync(mark) && fs.realpathSync(fs.readFileSync(mark, 'utf8')) === fs.realpathSync(process.execPath), 'with no node on PATH the launcher finds the nvm Node and starts the supervisor');
    const second = cp.spawnSync('/bin/sh', [path.join(__dirname, 'worker.sh')], { env, encoding: 'utf8', timeout: 10000 });
    ok(second.status === 0 && /already running/.test(second.stdout), 'a second launcher exits at once (single instance)');
    fs.writeFileSync(path.join(st, 'worker.pid'), '999999\n');
    const third = cp.spawnSync('/bin/sh', [path.join(__dirname, 'worker.sh')], { env, encoding: 'utf8', timeout: 10000 });
    ok(third.status === 0 && /launcher lock/.test(third.stdout), 'a stale worker.pid does not matter: the flock still guards');
    try { process.kill(-p1.pid, 'SIGKILL'); } catch (e) {}
    await sleep(300);
    /* Compute Lab mode: an old GitHub-token launcher (~/.bugbrain/worker.sh) holding worker.pid must not block it. */
    const legacy = cp.spawn('/bin/sh', ['-c', 'exec -a "/bin/sh ' + fakeHome + '/.bugbrain/worker.sh" sleep 30'], { stdio: 'ignore', detached: true });
    await sleep(200);
    fs.writeFileSync(path.join(st, 'worker.pid'), legacy.pid + '\n'); fs.rmSync(mark, { force: true });
    const m = await mock(() => [200, { ok: true }]);
    fs.writeFileSync(path.join(st, 'coordinator-token'), TOKEN + '\n');
    const envC = Object.assign({}, env, { BB_COORDINATOR_URL: m.url, BB_COORDINATOR_TOKEN_FILE: path.join(st, 'coordinator-token') });
    const p2 = cp.spawn('/bin/sh', [path.join(__dirname, 'worker.sh')], { env: envC, stdio: 'ignore', detached: true });
    await until(() => fs.existsSync(mark), 15000);
    ok(fs.existsSync(mark), 'a Compute Lab launcher is not blocked by the old GitHub-token worker\'s pid');
    try { process.kill(-p2.pid, 'SIGKILL'); } catch (e) {} try { process.kill(-legacy.pid, 'SIGKILL'); } catch (e) {}
    await sleep(300);
    /* No Node anywhere: the launcher logs it and reports it to the site once (token in a header, not printed). */
    fs.rmSync(path.join(fakeHome, '.nvm'), { recursive: true, force: true }); fs.rmSync(mark, { force: true });
    const p3 = cp.spawn('/bin/sh', [path.join(__dirname, 'worker.sh')], { env: Object.assign({}, envC, { BB_NODE_SYSTEM_DIRS: path.join(d, 'none') }), stdio: 'ignore', detached: true });
    await until(() => m.seen.some(s => s.url.endsWith('/diagnostics')), 15000);
    const rep = m.seen.find(s => s.url.endsWith('/diagnostics'));
    ok(rep && rep.auth === TOKEN && rep.body.kind === 'error' && /Node\.js 18 or newer was not found/.test(rep.body.summary), 'no Node: the launcher reports it to the site with the existing diagnostics API');
    ok(/node \(or bun\) not found/.test(fs.readFileSync(path.join(st, 'worker.log'), 'utf8')) && fs.readFileSync(path.join(st, 'worker.log'), 'utf8').indexOf(TOKEN) < 0, 'and logs it locally without the token');
    ok(!fs.existsSync(path.join(st, '.nonode-auth')), 'the temporary auth header file is removed');
    try { process.kill(-p3.pid, 'SIGKILL'); } catch (e) {}
    m.srv.close();
  }
  console.log('selfheal_test: ' + n + ' checks passed');
  process.exit(0);
})().catch(e => { console.error('FAIL', e && e.message || e); process.exit(1); });
