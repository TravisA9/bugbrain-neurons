#!/usr/bin/env node
'use strict';
/* run/dq.js (R42): distributed, no-duplicate experiment queue coordinated through the git branch `queue` of the GitHub repo.
 *   bun run/dq.js [--worker NAME] [--hours H] [--once] [--repo URL] [--branch queue] [--dir .dq] [--lease-hours 4] [--wait] [--dry]
 * Queue branch layout:  jobs/<id>.json (same format as experiments/queue)   claims/<id>.json { worker, at, lease, until }
 *   done/<id>.json (verdict + state, written when finished)   results/<id>/ (QUEUE_LOG.md, queue_state.json, summaries)
 *   registry/<id>.jsonl (registry lines of that job; the shared registry = all registry/*.jsonl, append-only, never conflicts).
 * Claiming: commit claims/<id>.json and push. A rejected push (someone else pushed first) = lost race -> reset to origin, pick again.
 *   The winner of the race is whoever's commit reached GitHub first; the loser's commit is discarded. Expired claims (until < now,
 *   no done/<id>.json) are reclaimable. While running, the worker renews its lease every 30 min.
 * Running: the job is executed by run/queue.js --once in a private scratch folder (BB_QUEUE_DIR / BB_RESULTS / BB_REGISTRY), so the
 *   PAUSE file, battery pause, active-time accounting and registry dedup all behave exactly like the local queue, and a local
 *   run/queue.js on the same PC is not touched (separate lock + state). The scratch registry is seeded with local + shared lines.
 * --hours H: stop claiming new jobs when the job's budget (budget.hours or estHours, default 1) would not fit (GitHub Actions: 6 h cap).
 * Auth: plain git; needs push rights to the repo (PC: Travis's git credentials; Actions: GITHUB_TOKEN; elsewhere: a token in the URL
 *   or a credential helper, or BB_DQ_TOKEN env: used via a one-shot git credential helper, never written to disk). Never touches main.
 * --phone (R48, Termux): queue.js gets --phone --no-refill (<= 2 workers, pauses on battery < 30 %, not charging, or hot; run/power.js),
 *   and no new job is claimed while the power guard says pause.
 * R61 (always-on workers, see WORKERS.md): run under run/supervisor.js (started by run/worker.sh / worker.ps1) with no arguments.
 *   - worker-config.json on the queue branch is re-read after every sync: mode run / pause / observe, only / skip / minPriority,
 *     per-job priority overrides and blocks (run/wconfig.js).
 *   - code freshness is checked before every claim and while waiting (every BB_DQ_CODE_CHECK_MS, default 2 min), so jobs whose
 *     `requires` files arrive with new code are seen without a manual pull. Under the supervisor (BB_SUPERVISED=1) newer code ->
 *     exit 10 between jobs (the launcher resets the checkout and restarts); run directly -> fast-forward pull (was never called before R61).
 *   - --stop-file F: exit 0 between jobs / while waiting when F exists (graceful restart). --observe: never push; log what would be claimed.
 *   - token: BB_DQ_TOKEN, else ~/.bugbrain/token. Heartbeat: workers/<name>.json on the queue branch (state, code, config version). */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const A = (() => { const a = {}, v = process.argv.slice(2); for (let i = 0; i < v.length; i++) { const k = v[i].replace(/^--/, ''); if (['once', 'wait', 'dry', 'allow-battery', 'include-text', 'phone', 'no-update', 'observe'].includes(k)) a[k] = true; else a[k] = v[++i]; } return a; })();
const WORKER = A.worker || process.env.BB_WORKER || (os.hostname() + '-' + process.pid);
const BRANCH = A.branch || 'queue', DIR = path.resolve(A.dir || path.join(ROOT, '.dq')), LEASE_H = +(A['lease-hours'] || 4);
const REPO = A.repo || process.env.BB_DQ_REPO || 'https://github.com/TravisA9/bugbrain-neurons.git';
const T0 = Date.now(), HOURS = A.hours != null ? +A.hours : Infinity;
const RUNTIME = process.env.BB_BUN || process.execPath;   // R48: same runtime as this process (plain node works, e.g. Termux)
const PHONE = !!A.phone || process.env.BB_PHONE === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = s => console.log(`[${new Date().toLocaleString()}] [${WORKER}] ${s}`);
const WC = require('./wconfig.js'), TYPE = WC.deviceType(), SUPERVISED = process.env.BB_SUPERVISED === '1', OBSERVE = !!A.observe;
const TOKEN = WC.token(); if (TOKEN) process.env.BB_DQ_TOKEN = TOKEN;   // R61: also from ~/.bugbrain/token (the git helper reads the env var)
const CODE_BRANCH = process.env.BB_CODE_BRANCH || 'neuro/distributed-queue', EXIT_UPDATE = 10;
let CFG = null, S = WC.resolve(null, WORKER, TYPE);
function loadCfg() { CFG = rd(path.join(DIR, 'worker-config.json')); S = WC.resolve(CFG, WORKER, TYPE); return S; }
const AUTH = TOKEN ? ['-c', 'credential.helper=', '-c', 'credential.helper=!f() { echo username=x-access-token; echo password=$BB_DQ_TOKEN; }; f'] : [];
function git(args, opt) { return cp.execFileSync('git', AUTH.concat(args), Object.assign({ cwd: DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }) }, opt || {})).trim(); }
const redact = s => String(s || '').replace(/(github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, '$1***').replace(/\/\/[^\/@\s]+@/g, '//***@').split(TOKEN || '\u0000').join('***');
// R49: classify git failures: 'race' (non-fast-forward, retry), 'auth' (token refused: stop), 'other' (network etc.: back off)
function classify(out) {
  const s = String(out || '');
  if (/\b403\b|\b401\b|Permission (to .* )?denied|Authentication failed|Invalid username or (password|token)|Write access to repository not granted|could not read Username|terminal prompts disabled|Repository not found|Resource not accessible/i.test(s)) return 'auth';
  if (/non-fast-forward|fetch first|\[rejected\]|\(stale info\)|failed to update ref|cannot lock ref|updates were rejected/i.test(s)) return 'race';
  return 'other';
}
function tryGit(args) { try { return { ok: true, out: git(args) }; } catch (e) { const out = redact(String(e.stderr || e.message)); return { ok: false, out, kind: classify(out) }; } }
const AUTH_MSG = 'GitHub refused the token: check BB_DQ_TOKEN has Contents read/write on bugbrain-neurons (fine-grained token, repo TravisA9/bugbrain-neurons, not expired/deleted)';
function authFail(r) { say(AUTH_MSG); say('git said: ' + r.out.trim().split('\n').slice(-4).join(' | ')); if (!TOKEN) say('BB_DQ_TOKEN is not set in this shell, so git has no push credentials'); process.exit(3); }
let otherFails = 0;
async function handleFail(r, what) {   // returns after a suitable wait; exits on auth errors
  if (r.kind === 'auth') authFail(r);
  if (r.kind === 'race') { otherFails = 0; say(`${what}: push rejected (another worker pushed first); retrying`); await sleep(500 + Math.random() * 2500); return; }
  otherFails++; const w = Math.min(600e3, 15e3 * 2 ** Math.min(otherFails - 1, 6));
  say(`${what}: git error (not a race), backing off ${Math.round(w / 1000)} s: ` + r.out.trim().split('\n').slice(-3).join(' | '));
  await sleep(w);
}
const rd = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
function ensureClone() {
  if (!fs.existsSync(path.join(DIR, '.git'))) { fs.mkdirSync(DIR, { recursive: true }); git(['init', '-q']); git(['remote', 'add', 'origin', REPO]); }
  else if (A.repo || process.env.BB_DQ_REPO) git(['remote', 'set-url', 'origin', REPO]);
  git(['config', 'credential.interactive', 'never']);
  git(['config', 'user.name', process.env.BB_GIT_NAME || 'bugbrain-dq']); git(['config', 'user.email', process.env.BB_GIT_EMAIL || 'bugbrain-dq@users.noreply.github.com']);
  sync();
}
function sync() {   // working copy := origin/<branch>, local commits that were not pushed are dropped
  const f = tryGit(['fetch', '-q', 'origin', BRANCH]); if (!f.ok) { if (f.kind === 'auth') authFail(f); throw new Error('cannot fetch ' + BRANCH + ': ' + f.out); }
  git(['checkout', '-q', '-B', BRANCH, 'FETCH_HEAD']); git(['reset', '-q', '--hard', 'FETCH_HEAD']); git(['clean', '-qfd']); loadCfg();
}
function commitPush(msg, files) { git(['add', '--'].concat(files)); git(['commit', '-q', '-m', msg]); return tryGit(['push', '-q', 'origin', 'HEAD:' + BRANCH]); }
const ls = d => { try { return fs.readdirSync(path.join(DIR, d)); } catch (e) { return []; } };
const isDone = id => fs.existsSync(path.join(DIR, 'done', id + '.json'));
function claimOf(id) { const c = rd(path.join(DIR, 'claims', id + '.json')); return c && Date.parse(c.until) > Date.now() ? c : null; }
const estH = j => +((j.budget && j.budget.hours) || j.estHours || 1);
function candidates() {
  const left = (HOURS * 3600e3 - (Date.now() - T0)) / 3600e3;
  if (S.mode === 'pause') return [];
  return ls('jobs').filter(f => f.endsWith('.json')).map(f => rd(path.join(DIR, 'jobs', f))).filter(Boolean).map(j => WC.jobView(CFG, j)).filter(Boolean).filter(j => WC.allowed(S, j))
    .filter(j => !isDone(j.id) && !claimOf(j.id) && j.kind !== 'blocked' && (j.kind !== 'text' || A['include-text']))
    .filter(j => !(j.requires || []).some(r => !fs.existsSync(path.join(ROOT, r))))   // R49: skip jobs needing code this checkout lacks (self-update pulls it)
    .filter(j => !j.after || (isDone(j.after) && (!j.afterPass || (rd(path.join(DIR, 'done', j.after + '.json')) || {}).pass === true)))
    .filter(j => estH(j) * 1.15 + 0.1 <= left)
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
}
function writeClaim(j, prev) {
  const at = prev ? prev.at : new Date().toISOString(), until = new Date(Date.now() + Math.max(LEASE_H, estH(j) * 1.5) * 3600e3).toISOString();
  fs.mkdirSync(path.join(DIR, 'claims'), { recursive: true });
  const c = { id: j.id, worker: WORKER, at, renewed: new Date().toISOString(), until, host: os.hostname(), platform: process.platform };
  fs.writeFileSync(path.join(DIR, 'claims', j.id + '.json'), JSON.stringify(c, null, 2) + '\n'); return 'claims/' + j.id + '.json';
}
async function claimNext() {   // returns a job we own, or null
  for (let attempt = 0; attempt < 20; attempt++) {
    sync(); const c = candidates(); if (!c.length) return null;
    if (OBSERVE) { say(`observe: would claim ${c[0].id} (priority ${c[0].priority}); ${c.length} candidate(s): ${c.slice(0, 5).map(x => x.id).join(', ')}`); return null; }
    const j = c[0], r = commitPush(`claim ${j.id} by ${WORKER}`, [writeClaim(j)]);
    if (r.ok) { say(`claimed ${j.id}`); return j; }
    await handleFail(r, `claim ${j.id}`); if (r.kind === 'race') await sleep(Math.min(30e3, 250 * 2 ** attempt * Math.random()));
  }
  return null;
}
function stillMine(id) { const c = rd(path.join(DIR, 'claims', id + '.json')); return c && c.worker === WORKER; }
async function renew(j) {   // lease heartbeat; false if someone else took the job over
  for (let i = 0; i < 5; i++) { sync(); if (!stillMine(j.id) || isDone(j.id)) return false;
    const p = commitPush(`renew ${j.id} by ${WORKER}`, [writeClaim(j, rd(path.join(DIR, 'claims', j.id + '.json')))]); if (p.ok) return true;
    if (p.kind === 'auth') { say(AUTH_MSG); return true; } await sleep(2000 * (i + 1)); }
  return true;
}
function sharedRegistry() { return ls('registry').filter(f => f.endsWith('.jsonl')).map(f => fs.readFileSync(path.join(DIR, 'registry', f), 'utf8')).join(''); }
async function runJob(j) {
  const scratch = path.join(os.tmpdir(), 'bb-dq-' + j.id + '-' + process.pid), q = path.join(scratch, 'queue'), res = path.join(scratch, 'results'), reg = path.join(scratch, 'registry.jsonl');
  fs.mkdirSync(q, { recursive: true }); fs.mkdirSync(res, { recursive: true });
  fs.writeFileSync(path.join(q, j.id + '.json'), JSON.stringify(Object.assign({}, j, { after: undefined }), null, 2));
  let local = ''; try { local = fs.readFileSync(path.join(ROOT, 'experiments', 'registry.jsonl'), 'utf8'); } catch (e) {}
  const seed = (local + (local && !local.endsWith('\n') ? '\n' : '') + sharedRegistry()); fs.writeFileSync(reg, seed);
  const qargs = ['run/queue.js', '--once'].concat(A['allow-battery'] ? ['--allow-battery'] : [], A['include-text'] ? ['--include-text'] : [], A.workers ? ['--workers', String(A.workers)] : [], PHONE ? ['--phone', '--no-refill'] : []);
  say(`running ${j.id} in ${scratch}`);
  let code;
  if (A.dry) { fs.writeFileSync(path.join(res, 'queue_state.json'), JSON.stringify({ jobs: { [j.id]: { status: 'done', pass: null, dry: true } } })); fs.appendFileSync(reg, JSON.stringify({ fp: 'dry-' + j.id, desc: { dry: j.id }, status: 'finished', by: WORKER }) + '\n'); await sleep(+(process.env.BB_DQ_DRY_MS || 1500)); code = 0; }
  else code = await new Promise(r => { const ch = cp.spawn(RUNTIME, qargs, { cwd: ROOT, stdio: 'inherit', env: Object.assign({}, process.env, { BB_QUEUE_DIR: q, BB_RESULTS: res, BB_REGISTRY: reg }) }); ch.on('close', r); ch.on('error', () => r(-1)); });
  const state = (rd(path.join(res, 'queue_state.json')) || { jobs: {} }).jobs[j.id] || { status: 'unknown' };
  const newLines = fs.readFileSync(reg, 'utf8').slice(seed.length);
  return { code, state, newLines, res, scratch };
}
async function publish(j, r) {
  const files = [];
  for (let i = 0; i < 10; i++) {
    sync(); files.length = 0;
    const out = path.join(DIR, 'results', j.id); fs.mkdirSync(out, { recursive: true });
    for (const f of ['QUEUE_LOG.md', 'queue_state.json', 'queue.js']) if (fs.existsSync(path.join(r.res, f))) fs.copyFileSync(path.join(r.res, f), path.join(out, f));
    if (r.state.dir) { const sp = path.join(r.state.dir, 'summary.json'); if (fs.existsSync(sp)) fs.copyFileSync(sp, path.join(out, 'summary.json')); }
    files.push('results/' + j.id);
    if (r.newLines) { fs.mkdirSync(path.join(DIR, 'registry'), { recursive: true }); fs.writeFileSync(path.join(DIR, 'registry', j.id + '.jsonl'), r.newLines); files.push('registry/' + j.id + '.jsonl'); }
    const finished = ['done', 'skipped-duplicate', 'skipped'].includes(r.state.status);
    if (finished) { fs.mkdirSync(path.join(DIR, 'done'), { recursive: true });
      fs.writeFileSync(path.join(DIR, 'done', j.id + '.json'), JSON.stringify({ id: j.id, worker: WORKER, finishedAt: new Date().toISOString(), status: r.state.status, pass: r.state.pass == null ? null : r.state.pass, summary: r.state.summary || null }, null, 2) + '\n');
      files.push('done/' + j.id + '.json'); if (fs.existsSync(path.join(DIR, 'claims', j.id + '.json'))) files.push('claims/' + j.id + '.json'), fs.unlinkSync(path.join(DIR, 'claims', j.id + '.json')); }
    else if (fs.existsSync(path.join(DIR, 'claims', j.id + '.json')) && stillMine(j.id)) { fs.unlinkSync(path.join(DIR, 'claims', j.id + '.json')); files.push('claims/' + j.id + '.json'); }   // unfinished: release the claim
    const p = commitPush(`${finished ? 'result' : 'release'} ${j.id} by ${WORKER} (${r.state.status})`, files);
    if (p.ok) { say(`published ${j.id}: ${r.state.status}${r.state.pass != null ? ' pass=' + r.state.pass : ''}`); return true; }
    if (p.kind === 'auth') { say(AUTH_MSG + '; results stay in ' + r.scratch); authFail(p); }
    await handleFail(p, `publish ${j.id}`);
  }
  say(`could not publish ${j.id}; results stay in ${r.scratch}`); return false;
}
// R49 / R61: code freshness. Fetch CODE_BRANCH into refs/bb/code (rate-limited); if it is newer than HEAD:
//   supervised -> exit 10 (only ever called between jobs / while waiting; run/worker.sh resets the checkout and restarts),
//   direct run -> fast-forward the checkout when it is clean and on CODE_BRANCH (or detached on its history); restart when run/dq.js changed.
let lastCode = 0;
function codeCheck(force) {
  if (A['no-update'] || (!force && Date.now() - lastCode < +(process.env.BB_DQ_CODE_CHECK_MS || 120e3))) return; lastCode = Date.now();
  const g = a => cp.execFileSync('git', AUTH.concat(a), { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120e3, env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }) }).trim();
  try { if (!fs.existsSync(path.join(ROOT, '.git'))) return;
    g(['fetch', '-q', 'origin', '+refs/heads/' + CODE_BRANCH + ':refs/bb/code']);
    const head = g(['rev-parse', 'HEAD']), code = g(['rev-parse', 'refs/bb/code']); if (head === code) return;
    try { g(['merge-base', '--is-ancestor', code, head]); return; } catch (e) {}   // local checkout already contains it
    if (SUPERVISED) { say(`newer code on ${CODE_BRANCH} (${head.slice(0, 7)} -> ${code.slice(0, 7)}); exiting so the launcher updates and restarts`); process.exit(EXIT_UPDATE); }
    const br = g(['rev-parse', '--abbrev-ref', 'HEAD']); if (br !== CODE_BRANCH && br !== 'HEAD') return;
    try { g(['merge-base', '--is-ancestor', head, code]); } catch (e) { return; }
    if (g(['status', '--porcelain', '--untracked-files=no'])) { say('newer code available but the checkout has local edits; not updating'); return; }
    g(['merge', '-q', '--ff-only', code]); say('code updated ' + head.slice(0, 7) + ' -> ' + code.slice(0, 7));
    if (g(['diff', '--name-only', head, code, '--', 'run/dq.js', 'run/wconfig.js'])) { say('run/dq.js changed; restarting worker'); cp.spawn(process.execPath, process.argv.slice(1), { cwd: ROOT, stdio: 'inherit', detached: true, env: process.env }).unref(); process.exit(0); }
  } catch (e) { say('code check skipped: ' + redact(String(e.stderr || e.message)).split('\n')[0].slice(0, 160)); } }
const stopNow = () => A['stop-file'] && fs.existsSync(A['stop-file']);
function checkStop() { if (stopNow()) { say('stop requested (supervisor restart / pause); exiting between jobs'); process.exit(0); } }
async function waitIdle(ms) { const end = Date.now() + ms; while (Date.now() < end) { checkStop(); await sleep(Math.min(5000, end - Date.now())); } }
// R61 heartbeat: workers/<name>.json on the queue branch (state changes + every BB_DQ_HB_MIN minutes); never in observe mode.
let lastHb = { key: '', t: 0 };
function heartbeat(state, job) {
  if (OBSERVE || A.dry || (!SUPERVISED && !A.worker && !process.env.BB_WORKER)) return; const key = state + '|' + (job || '') + '|' + S.mode + '|' + S.version;
  if (key === lastHb.key && Date.now() - lastHb.t < +(process.env.BB_DQ_HB_MIN || 30) * 60e3) return;
  let code = ''; try { code = cp.execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) {}
  const f = path.join(DIR, 'workers', WORKER + '.json'); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ worker: WORKER, type: TYPE, state, job: job || null, mode: S.mode, configVersion: S.version, code, host: os.hostname(), platform: process.platform, supervised: SUPERVISED, at: new Date().toISOString() }, null, 2) + '\n');
  const r = commitPush(`heartbeat ${WORKER} (${state}${job ? ' ' + job : ''})`, ['workers/' + WORKER + '.json']); if (r.ok) lastHb = { key, t: Date.now() }; else { try { sync(); } catch (e) {} }
}
// R61: a supervised worker has one stable name and one dq.js, so claims it still holds at startup are from a killed run: release them.
async function releaseOwn() {
  if (!SUPERVISED || OBSERVE || A.dry) return;
  for (let i = 0; i < 5; i++) { sync(); const mine = ls('claims').filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(id => stillMine(id) && !isDone(id)); if (!mine.length) return;
    const r = commitPush(`release ${mine.join(' ')} by ${WORKER} (restarted)`, mine.map(id => { fs.unlinkSync(path.join(DIR, 'claims', id + '.json')); return 'claims/' + id + '.json'; }));
    if (r.ok) { say('released own stale claim(s): ' + mine.join(', ')); return; } await handleFail(r, 'release'); }
}
async function main() {
  ensureClone(); say(`worker on ${BRANCH} of ${REPO.replace(/\/\/[^@]*@/, '//')}${isFinite(HOURS) ? ', ' + HOURS + ' h' : ''}${SUPERVISED ? ' (supervised, ' + TYPE + ')' : ''}${OBSERVE ? ' [observe: no claims, no pushes]' : ''}`);
  const WAIT = +(process.env.BB_DQ_WAIT_MS || 180e3);
  codeCheck(true); await releaseOwn();
  let n = 0;
  for (;;) {
    checkStop(); codeCheck();   // R61: new code (and its `requires` files) before every claim
    if (S.mode === 'pause') { try { sync(); } catch (e) {} if (S.mode === 'pause') { say('paused by worker-config.json'); heartbeat('paused'); await waitIdle(WAIT); continue; } }
    if (PHONE) { const p = require('./power').check(true); if (p.pause) { say('phone power guard: ' + p.why + '; waiting'); heartbeat('power-pause'); await waitIdle(120000); continue; } }
    let j; try { j = await claimNext(); } catch (e) { otherFails++; const w = Math.min(600e3, 15e3 * 2 ** Math.min(otherFails, 6)); say('sync failed, retrying in ' + Math.round(w / 1000) + ' s: ' + redact(e.message).split('\n').slice(-2).join(' | ')); await sleep(w); continue; }
    if (!j) { if (A.wait && Date.now() - T0 < HOURS * 3600e3 - 3600e3) { heartbeat('idle'); await waitIdle(WAIT); continue; } say('nothing to claim; exiting'); break; }
    heartbeat('running', j.id);
    const hb = setInterval(() => { renew(j).then(ok => { if (!ok) say(`warning: lost the claim on ${j.id}`); }).catch(() => {}); }, +(process.env.BB_DQ_RENEW_MS || 1800e3));
    let r; try { r = await runJob(j); } finally { clearInterval(hb); }
    await publish(j, r);
    if (A.once && ++n >= 1) break;
  }
}
module.exports = { candidates };
if (require.main === module) main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
