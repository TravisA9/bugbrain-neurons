'use strict';
/* node run/channel_test.js: Phase 1 code channels (stable / canary chosen by the coordinator).
 * - codever.js: the heartbeat reply's code field is saved, cleared when absent (old coordinator), validated.
 * - codever.usable(): only commits on the worker branch that know about channels are followed (full and shallow clone).
 * - supervisor.js end to end against a mock coordinator: it follows the branch tip until the coordinator names a
 *   commit, restarts gracefully when the target changes, and on the next start switches the checkout to the target
 *   (instead of looping with the launcher, which always resets to the tip). */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
const CV = require('./codever.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', n, m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chan-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = (cwd, ...a) => cp.execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gc = (cwd, msg) => g(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', msg);
const SHA_A = 'a'.repeat(40);

(async () => {
  /* 1. Saving the coordinator's choice. */
  { const st = tmp();
    ok(CV.fromReply({ ok: true }) === null, 'a reply without code (old coordinator) says nothing');
    ok(CV.save({ code: { channel: 'stable', ref: SHA_A } }, st) && CV.wanted(st) === SHA_A && CV.read(st).channel === 'stable', 'a stable commit is saved');
    ok(!CV.save({ code: { channel: 'stable', ref: SHA_A } }, st), 'the same answer again changes nothing');
    ok(CV.save({ code: { channel: 'canary', ref: '' } }, st) && CV.wanted(st) === '' && CV.read(st).channel === 'canary', 'canary with no commit means follow the branch tip');
    ok(CV.save({ code: { channel: 'stable', ref: 'main; rm -rf /' } }, st) && CV.wanted(st) === '', 'anything but a full commit id is ignored');
    CV.save({ code: { channel: 'stable', ref: SHA_A } }, st);
    ok(CV.save({ ok: true }, st) && !fs.existsSync(CV.targetFile(st)) && CV.wanted(st) === '', 'a reply without code removes the target (fall back to the tip)'); }

  /* 2. Which commits may be followed. */
  const d = tmp(), origin = path.join(d, 'origin.git'), src = path.join(d, 'src');
  g(d, 'init', '-q', '--bare', origin); g(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  fs.mkdirSync(path.join(src, 'run'), { recursive: true });
  g(d, 'init', '-q', '-b', 'b1', src);
  fs.writeFileSync(path.join(src, 'run', 'x.txt'), 'old\n'); g(src, 'add', '.'); gc(src, 'A old');
  const A = g(src, 'rev-parse', 'HEAD');
  fs.copyFileSync(path.join(__dirname, 'codever.js'), path.join(src, 'run', 'codever.js')); g(src, 'add', '.'); gc(src, 'B channels');
  const B = g(src, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(src, 'run', 'x.txt'), 'tip\n'); g(src, 'add', '.'); gc(src, 'C tip');
  const C = g(src, 'rev-parse', 'HEAD');
  g(src, 'checkout', '-q', '-b', 'other', A); fs.writeFileSync(path.join(src, 'run', 'codever.js'), '// other\n'); g(src, 'add', '.'); gc(src, 'O other branch');
  const O = g(src, 'rev-parse', 'HEAD');
  g(src, 'push', '-q', origin, 'b1', 'other');
  for (const shallow of [false, true]) {
    const w = path.join(d, shallow ? 'shallow' : 'full');
    g(d, ...['clone', '-q', '--single-branch', '--branch', 'b1'].concat(shallow ? ['--depth', '1'] : [], ['file://' + origin, w]));
    g(w, 'fetch', '-q', 'origin', '+refs/heads/b1:refs/bb/code');
    const git = a => g(w, ...a);
    const tag = shallow ? ' (shallow clone)' : '';
    ok(CV.usable(git, B, 'refs/bb/code', shallow).ok, 'a branch commit with channel support is followed' + tag);
    ok(/older than channel support/.test(CV.usable(git, A, 'refs/bb/code', shallow).why), 'an older branch commit is refused (it could never follow the next change)' + tag);
    ok(/not on the worker branch/.test(CV.usable(git, O, 'refs/bb/code', shallow).why), 'a commit from another branch is refused' + tag);
    ok(/could not be downloaded/.test(CV.usable(git, 'f'.repeat(40), 'refs/bb/code', shallow).why), 'an unknown commit is refused' + tag);
    ok(CV.usable(git, C, 'refs/bb/code', shallow).ok, 'the tip itself is fine' + tag);
  }

  /* 3. Supervisor end to end, on a clone of this repo. */
  if (process.platform !== 'win32') {
    const repo = path.resolve(__dirname, '..'), o2 = path.join(d, 'wk.git'), work = path.join(d, 'work'), st = path.join(d, 'st');
    fs.mkdirSync(st);
    const P = g(repo, 'rev-parse', 'HEAD');
    g(d, 'init', '-q', '--bare', o2); g(o2, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    g(repo, 'push', '-q', o2, 'HEAD:refs/heads/wk');
    g(d, 'clone', '-q', '--single-branch', '--branch', 'wk', 'file://' + o2, work);
    fs.writeFileSync(path.join(work, 'TIP.txt'), 'newer tip\n'); g(work, 'add', '.'); gc(work, 'T tip'); g(work, 'push', '-q', 'origin', 'HEAD:wk');
    const T = g(work, 'rev-parse', 'HEAD');
    let reply = { code: { channel: 'stable', ref: P } };
    const beats = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', x => { b += x; }); req.on('end', () => {
      let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) {}
      if (req.url.endsWith('/heartbeat')) beats.push(j);
      const out = req.url.endsWith('/heartbeat') ? Object.assign({ ok: true, paused: false, revoked: false, resources: { mode: 'off', allowancePct: 50, maxJobs: 0 }, jobId: null }, reply) : { ok: true, job: null };
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const tf = path.join(st, 'coordinator-token'); fs.writeFileSync(tf, 'ab'.repeat(24) + '\n');
    const env = Object.assign({}, process.env, { BB_COORDINATOR_URL: 'http://127.0.0.1:' + srv.address().port, BB_COORDINATOR_TOKEN_FILE: tf, BB_STATE_DIR: st, BB_CODE_BRANCH: 'wk',
      BB_POLL_MS: '1500', BB_WATCHDOG: 'off', BB_COORD_CONTROL_MS: '400', BB_MAX_SLOTS: '1', HOME: d });
    let log = '';
    const run = () => { const p = cp.spawn(process.execPath, ['run/supervisor.js'], { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout.on('data', x => { log += x; }); p.stderr.on('data', x => { log += x; });
      p.done = new Promise(r => p.on('exit', c => r(c))); return p; };
    const launcherReset = () => { g(work, 'fetch', '-q', 'origin', '+refs/heads/wk:refs/bb/code'); g(work, 'checkout', '-q', '-B', 'wk', 'refs/bb/code'); g(work, 'reset', '-q', '--hard', 'refs/bb/code'); };
    // Run 1: on the tip; coord.js learns the stable commit, the supervisor restarts gracefully (exit 10).
    let p = run();
    const c1 = await Promise.race([p.done, sleep(40000).then(() => 'timeout')]);
    ok(c1 === 10 && CV.wanted(st) === P, 'on the tip, the coordinator\'s stable commit is saved and the supervisor restarts gracefully (exit 10)');
    ok(beats.some(b => b.runtime && b.runtime.code === T), 'the heartbeat reports the commit this computer runs');
    // Run 2: the launcher resets to the tip again; the supervisor switches to the stable commit before starting coord.js.
    launcherReset(); log = '';
    p = run();
    const t0 = Date.now(); while (Date.now() - t0 < 30000 && !beats.some(b => b.runtime && b.runtime.code === P)) await sleep(200);
    ok(g(work, 'rev-parse', 'HEAD') === P && /running code version/.test(log), 'next start: the checkout is switched to the stable commit (no launcher loop)');
    ok(beats.some(b => b.runtime && b.runtime.code === P), 'and coord.js now reports the stable commit');
    const still = await Promise.race([p.done, sleep(4000).then(() => 'running')]);
    ok(still === 'running', 'on the stable commit, the supervisor does not keep restarting');
    // Run 3: an older coordinator (no code field): back to the branch tip.
    reply = {};
    const c3 = await Promise.race([p.done, sleep(40000).then(() => 'timeout')]);
    ok(c3 === 10 && !fs.existsSync(CV.targetFile(st)), 'a coordinator without channels: the target is cleared and the worker goes back to the tip');
    srv.close();
  }
  console.log('channel_test: ' + n + ' checks passed');
  process.exit(0);
})().catch(e => { console.error('FAIL', e && e.message || e); process.exit(1); });
