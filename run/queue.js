#!/usr/bin/env node
'use strict';
/* run/queue.js (R38): autonomous experiment queue.   bun run/queue.js [--once] [--workers N] [--cpu-max P] [--include-text] [--force]
 * Jobs: experiments/queue/*.json  { id, title, question, track, priority, kind: evolve | runs | blocked | text, config (evolve: runner
 *   config path), budget: { hours }, runs (runs: [{ script, args, label, env }]), after (job id that must finish first), accept }.
 * Loop: pick the highest-priority job that is not done and whose `after` is done; check the registry (exact / near duplicates are skipped
 * unless --force); run it (evolve: run/runner.js with the worker pool; runs: scripts in parallel, `workers` at a time); write the
 * auto-summary (champion, per-task vs references, pass / fail against `accept`) to experiments/registry.jsonl and results/QUEUE_LOG.md;
 * keep results/queue.js (dashboard) and results/current.js (live feed) up to date.
 * Resumable: state in results/queue_state.json; an interrupted evolve job resumes from its run checkpoint, a runs job keeps finished runs.
 * Yielding: children run at below-normal priority. PAUSE: create a file named PAUSE in the project folder (or results/PAUSE): the queue
 * stops after the current generation (evolve: STOP file -> checkpoint) or kills unfinished runs, then waits; delete PAUSE to continue.
 * --cpu-max P (default 0 = off): before starting or resuming work, wait while total CPU use (other programs) is above P %.
 * --reset a,b: mark those jobs pending (results cleared) before starting. Laptop on battery = paused (--allow-battery to run anyway).
 * Evolve budgets count active compute time (the runner excludes suspended time). --status: print the job list and refresh results/queue.js, nothing else.
 * One instance only (results/queue.lock). --once: run at most one job, then exit. Exits when nothing is runnable (unless --wait). */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const REG = require('./registry.js');
const ROOT = path.resolve(__dirname, '..'), RES = process.env.BB_RESULTS || path.join(ROOT, 'results'), QDIR = process.env.BB_QUEUE_DIR || path.join(ROOT, 'experiments', 'queue');
const STATE = path.join(RES, 'queue_state.json'), LOG = path.join(RES, 'QUEUE_LOG.md'), QJS = path.join(RES, 'queue.js'), LOCK = path.join(RES, 'queue.lock');
const args = (() => { const a = {}, v = process.argv.slice(2); for (let i = 0; i < v.length; i++) { const k = v[i].replace(/^--/, ''); if (['once', 'include-text', 'force', 'wait', 'status', 'allow-battery', 'no-refill', 'phone'].includes(k)) a[k] = true; else a[k] = v[++i]; } return a; })();
const WORKERS = args.workers != null ? +args.workers : ((args.phone || process.env.BB_PHONE === '1') ? Math.min(2, Math.max(1, os.cpus().length - 2)) : Math.max(1, os.cpus().length - 2)), CPU_MAX = +(args['cpu-max'] || 0);
const RUNTIME = process.env.BB_BUN || process.execPath;   // R48: children use the same runtime (node or bun) as this process
const PHONE = !!args.phone || process.env.BB_PHONE === '1';   // R48: Termux phone/tablet mode (run/power.js)
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(RES, { recursive: true });
function writeAtomic(p, t) { const tmp = p + '.tmp'; fs.writeFileSync(tmp, t); for (let i = 0; i < 5; i++) { try { fs.renameSync(tmp, p); return; } catch (e) { const u = Date.now() + 200; while (Date.now() < u); } } fs.writeFileSync(p, t); }
const now = () => new Date().toLocaleString();
const say = s => console.log(`[${now()}] ${s}`);
const pauseFile = () => fs.existsSync(path.join(ROOT, 'PAUSE')) || fs.existsSync(path.join(RES, 'PAUSE'));
// R39: on a laptop running on battery the queue yields like PAUSE (battery drain -> critical battery -> sleep wasted a whole job).
let batT = 0, batV = false, phoneWhy = '';
function onBattery() {
  if (PHONE) { const p = require('./power').check(); phoneWhy = p.why; return p.pause; }
  if (args['allow-battery'] || process.platform !== 'win32') return false;
  if (Date.now() - batT < 60000) return batV; batT = Date.now();
  try { const o = cp.execFileSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Battery | Select-Object -First 1).BatteryStatus'], { encoding: 'utf8', windowsHide: true, timeout: 20000 }).trim(); batV = o === '1'; } catch (e) { batV = false; }
  return batV;
}
const paused = () => pauseFile() || onBattery();
const pauseWhy = () => pauseFile() ? 'PAUSE file present' : PHONE ? 'phone power guard: ' + phoneWhy : 'running on battery';
function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return { jobs: {} }; } }
let S = loadState(); const save = () => writeAtomic(STATE, JSON.stringify(S, null, 2));
function loadJobs() { return fs.readdirSync(QDIR).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(QDIR, f), 'utf8')); } catch (e) { say('bad job file ' + f + ': ' + e.message); return null; } }).filter(Boolean); }
const st = id => S.jobs[id] || (S.jobs[id] = { status: 'pending' });
const DONE = ['done', 'failed', 'skipped-duplicate', 'skipped'];
function runnable(jobs) {
  return jobs.filter(j => { const s = st(j.id).status; if (DONE.includes(s)) return false; if (j.kind === 'blocked') return false; if (j.kind === 'text' && !args['include-text']) return false;
    if (j.after && st(j.after).status !== 'done') return false; if (j.after && j.afterPass && st(j.after).pass !== true) { if (st(j.id).status === 'pending') { st(j.id).status = 'skipped'; st(j.id).why = 'prerequisite ' + j.after + ' did not pass'; save(); } return false; } return true; }).sort((a, b) => b.priority - a.priority);
}
function statusOf(j) { const s = st(j.id); if (j.kind === 'blocked' && s.status === 'pending') return 'blocked'; if (j.kind === 'text' && s.status === 'pending') return 'text track'; if (j.after && s.status === 'pending' && st(j.after).status !== 'done') return 'waiting'; return s.status; }
function logTail(n) { try { const t = fs.readFileSync(LOG, 'utf8').split('\n## ').slice(1); return t.slice(-n).map(x => '## ' + x.trim()); } catch (e) { return []; } }
function writeQueueJs(extra) {
  const jobs = loadJobs().sort((a, b) => b.priority - a.priority).map(j => ({ id: j.id, title: j.title, question: j.question, track: j.track, priority: j.priority, kind: j.kind, budget: j.budget || null,
    accept: j.accept || {}, needsCode: j.needsCode || null, note: j.note || null, after: j.after || null, status: statusOf(j), state: S.jobs[j.id] || null }));
  writeAtomic(QJS, 'window.BB_QUEUE = ' + JSON.stringify(Object.assign({ updatedAt: new Date().toISOString(), paused: paused(), pid: process.pid, jobs, log: logTail(12) }, extra || {})) + ';\n');
}
function appendLog(md) { if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, '# Queue log (run/queue.js)\n'); fs.appendFileSync(LOG, '\n' + md.trim() + '\n'); }
function cpuSample(ms) { const a = os.cpus(); return sleep(ms).then(() => { const b = os.cpus(); let busy = 0, tot = 0; b.forEach((c, i) => { const x = c.times, y = a[i].times; const t = (x.user + x.nice + x.sys + x.irq + x.idle) - (y.user + y.nice + y.sys + y.irq + y.idle); tot += t; busy += t - (x.idle - y.idle); }); return tot ? 100 * busy / tot : 0; }); }
async function waitForGo(running) {   // PAUSE file / busy CPU (only checked while the queue itself is not computing)
  let told = false;
  for (;;) {
    if (paused()) { if (!told) { say(pauseWhy() + ': waiting'); told = true; } writeQueueJs({ state: 'paused (' + pauseWhy() + ')' }); await sleep(15000); continue; }
    if (CPU_MAX > 0 && !running) { const c = await cpuSample(5000); if (c > CPU_MAX) { if (!told) { say(`CPU busy (${c.toFixed(0)} % > ${CPU_MAX} %): waiting`); told = true; } writeQueueJs({ state: 'waiting for idle CPU' }); await sleep(25000); continue; } }
    return;
  }
}
function lowPrio(child) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) {} }
function spawn(cmdArgs, env, onLine) {
  return new Promise(res => { const ch = cp.spawn(RUNTIME, cmdArgs, { cwd: ROOT, env: Object.assign({}, process.env, env || {}), windowsHide: true }); lowPrio(ch);
    let out = '', buf = ''; const feed = d => { const s = d.toString(); out += s; buf += s; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); onLine && onLine(l, ch); } };
    ch.stdout.on('data', feed); ch.stderr.on('data', feed); ch.on('close', code => res({ code, out, child: ch })); ch.on('error', e => res({ code: -1, out: out + String(e) })); });
}
// ---------- evolve ----------
async function runEvolve(j) {
  const s = st(j.id), hours = (j.budget && j.budget.hours) || 1;
  let a;
  if (s.dir && fs.existsSync(path.join(s.dir, 'checkpoint.json'))) { a = ['run/runner.js', '--resume', s.dir, '--hours', String(hours), '--workers', String(WORKERS)]; say(`${j.id}: resuming ${s.dir}`); }
  else { a = ['run/runner.js', j.config, '--hours', String(hours), '--workers', String(WORKERS), '--name', j.id].concat(j.extraArgs || [], process.env.BB_RESULTS ? ['--out', RES] : []); if (args.force || s.force) a.push('--force'); }
  s.status = 'running'; s.startedAt = s.startedAt || new Date().toISOString(); save(); writeQueueJs();
  let stopAsked = false;
  const watch = setInterval(() => { if (paused() && s.dir && !stopAsked) { fs.writeFileSync(path.join(s.dir, 'STOP'), 'paused by queue'); stopAsked = true; say(`${j.id}: ${pauseWhy()} -> asked the run to stop after this generation`); } }, 10000);
  const r = await spawn(a, null, l => { const m = l.match(/(?:starting|resuming) .* in (.+?): /); if (m && !s.dir) { s.dir = m[1]; save(); writeQueueJs(); } if (/gen \d+:/.test(l)) { s.lastLine = l.slice(0, 220); save(); writeQueueJs(); } });
  clearInterval(watch);
  let sum0 = null; try { sum0 = s.dir && JSON.parse(fs.readFileSync(path.join(s.dir, 'summary.json'), 'utf8')); } catch (e) {}
  if (r.code !== 0 && r.code !== 3 && sum0 && sum0.status === 'finished') { say(`${j.id}: runner exited with code ${r.code} after a finished run; using its summary`); r.code = 0; }   // R39 (q01: finished, then a non-zero exit)
  if (r.code === 3) { s.status = 'skipped-duplicate'; s.endedAt = new Date().toISOString(); save(); appendLog(`## ${now()} · ${j.id} · SKIPPED (duplicate)\n${j.title}. The registry already has this config (use --force to rerun).`); return; }
  if (r.code !== 0) { s.status = paused() ? 'running' : 'failed'; s.error = r.out.split('\n').slice(-5).join(' ').slice(0, 400); save(); if (s.status === 'failed') appendLog(`## ${now()} · ${j.id} · FAILED\n${s.error}`); return; }
  let sum = null; try { sum = JSON.parse(fs.readFileSync(path.join(s.dir, 'summary.json'), 'utf8')); } catch (e) {}
  if (sum && sum.status === 'stopped' && stopAsked) { s.status = 'running'; s.paused = true; save(); say(`${j.id}: paused at generation ${sum.generations} (resumes later)`); return; }
  s.status = 'done'; s.endedAt = new Date().toISOString(); s.summary = sum && { champion: sum.champion, tasks: sum.tasks, refs: (sum.refs || []).map(x => x.hi), generations: sum.generations, hours: sum.hours };
  const v = verdictEvolve(j, sum); s.pass = v.pass; save();
  appendLog(`## ${now()} · ${j.id} · ${v.pass == null ? 'DONE' : v.pass ? 'PASS' : 'FAIL'}\n${j.title} (question ${j.question}). Run ${path.basename(s.dir)}, ${sum ? sum.generations : '?'} generations, ${sum ? sum.hours : '?'} h.\n${v.text}`);
}
function verdictEvolve(j, sum) {
  if (!sum || !sum.champion) return { pass: false, text: 'no champion' };
  const raw = sum.champion.raw || [], refs = (sum.refs || []).map(r => r.hi), A = j.accept || {}, fails = [];
  const rows = sum.tasks.map((t, i) => `| ${t} | ${(+raw[i]).toFixed(3)} | ${refs[i] != null ? (+refs[i]).toFixed(3) : '–'} | ${refs[i] ? (raw[i] / refs[i]).toFixed(3) : '–'} |`);
  if (A.championMin != null && !(sum.champion.val >= A.championMin)) fails.push(`champion ${sum.champion.val.toFixed(3)} < ${A.championMin}`);
  for (const [t, m] of Object.entries(A.taskMin || {})) { const i = sum.tasks.indexOf(t); if (i < 0 || !(raw[i] >= m)) fails.push(`${t} ${i < 0 ? '?' : (+raw[i]).toFixed(2)} < ${m}`); }
  const has = A.championMin != null || A.taskMin;
  return { pass: has ? !fails.length : null, text: `Champion ${sum.champion.val.toFixed(4)} (gen ${sum.champion.gen}).\n\n| task | champion | reference | ratio |\n|---|---|---|---|\n${rows.join('\n')}\n\n` + (has ? (fails.length ? 'Criteria not met: ' + fails.join('; ') : 'All criteria met.') : (A.note ? 'Criteria: ' + A.note : '')) };
}
// ---------- runs (ablations / scripts) ----------
async function runRuns(j) {
  const s = st(j.id); s.status = 'running'; s.startedAt = s.startedAt || new Date().toISOString(); s.results = s.results || {}; save();
  const sub = x => String(x).replace(/\$\{dir:([\w.-]+)\}/g, (m, id) => (S.jobs[id] && S.jobs[id].dir) || m);
  const todo = j.runs.map((r, k) => Object.assign({ k }, r)).filter(r => !s.results[r.k]); let idx = 0; const live = new Set();
  writeLiveRuns(j, s);
  const one = async r => { if (paused()) return; const env = {}; for (const [k, v] of Object.entries(r.env || {})) env[k] = sub(v); const a = [r.script].concat(r.args.map(sub)); if (args.force || s.force) a.push('--force');
    const res = await spawn(a, env, (l, ch) => live.add(ch)); live.delete(res.child);
    const line = res.out.trim().split('\n').reverse().find(x => x.trim().startsWith('{'));
    if ((res.code === 0 || res.code === 3) && line) { try { const o = JSON.parse(line); s.results[r.k] = { label: r.label, mean: o.mean, sd: o.sd, n: (o.scores || []).length, dup: res.code === 3 }; } catch (e) {} }
    else if (!paused()) s.results[r.k] = { label: r.label, error: res.out.split('\n').slice(-3).join(' ').slice(0, 300) };
    save(); writeQueueJs(); writeLiveRuns(j, s); };
  const watch = setInterval(() => { if (paused()) for (const ch of live) try { ch.kill(); } catch (e) {} }, 5000);
  await Promise.all(Array.from({ length: Math.min(WORKERS, todo.length) }, async () => { while (idx < todo.length && !paused()) await one(todo[idx++]); }));
  clearInterval(watch);
  if (Object.keys(s.results).length < j.runs.length) { save(); return; }   // paused: resume later
  s.status = 'done'; s.endedAt = new Date().toISOString();
  const A = j.accept || {}, fails = []; for (const [lab, m] of Object.entries(A.meanMin || {})) { const r = Object.values(s.results).find(x => x.label === lab); if (!r || !(r.mean >= m)) fails.push(`${lab} ${r ? r.mean : '?'} < ${m}`); }
  const has = Object.keys(A.meanMin || {}).length > 0; s.pass = has ? !fails.length : null; save();
  const rows = j.runs.map((r, k) => { const x = s.results[k] || {}; return `| ${r.label} | ${x.mean != null ? x.mean : '–'} | ${x.sd != null ? x.sd : '–'} | ${x.n || '–'} | ${x.error ? 'error' : x.dup ? 'from registry' : ''} |`; });
  appendLog(`## ${now()} · ${j.id} · ${s.pass == null ? 'DONE' : s.pass ? 'PASS' : 'FAIL'}\n${j.title} (question ${j.question}).\n\n| run | mean | sd | growths | note |\n|---|---|---|---|---|\n${rows.join('\n')}\n\n` + (has ? (fails.length ? 'Criteria not met: ' + fails.join('; ') : 'All criteria met.') : (A.note ? 'Criteria: ' + A.note : '')));
  writeLiveRuns(j, s);
}
function writeLiveRuns(j, s) {   // results/current.js for a runs job (the runner writes it itself for evolve jobs)
  const done = Object.keys(s.results || {}).length, sm = { name: j.id, dir: 'queue:' + j.id, mode: 'runs', status: s.status === 'done' ? 'finished' : 'running', generations: done, hours: 0,
    champion: null, tasks: j.runs.map(r => r.label), runs: j.runs.map((r, k) => Object.assign({ label: r.label }, (s.results || {})[k] || {})), updatedAt: new Date().toISOString() };
  try { writeAtomic(path.join(RES, 'current.js'), 'window.BB_CURRENT = ' + JSON.stringify({ summary: sm, csv: '', config: { name: j.id, description: j.title, mode: 'runs', tasks: [] }, writtenAt: sm.updatedAt }) + ';\n'); } catch (e) {}
}
// ---------- main ----------
async function main() {
  if (args.status) { writeQueueJs(); const jobs = loadJobs().sort((a, b) => b.priority - a.priority); for (const j of jobs) console.log(`${String(j.priority).padEnd(5)} ${statusOf(j).padEnd(18)} ${j.id}`); return; }   // --status: list + refresh results/queue.js only
  try { const o = JSON.parse(fs.readFileSync(LOCK, 'utf8')); if (o.pid && o.pid !== process.pid) { let alive = false; try { process.kill(o.pid, 0); alive = true; } catch (e) {} if (alive) { say(`another queue is running (pid ${o.pid}); exiting`); return; } } } catch (e) {}
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const unlock = () => { try { if (JSON.parse(fs.readFileSync(LOCK, 'utf8')).pid === process.pid) fs.unlinkSync(LOCK); } catch (e) {} };
  process.on('exit', unlock); process.on('SIGINT', () => { unlock(); process.exit(130); }); process.on('SIGTERM', () => { unlock(); process.exit(143); });
  if (args.reset) { for (const id of String(args.reset).split(',')) { S.jobs[id] = { status: 'pending', resetAt: new Date().toISOString(), force: true }; say(`reset ${id}`); } save(); }   // --reset a,b: run those jobs again from scratch
  // R39 recover: evolve jobs marked failed although their run finished (summary.json status finished) -> verdict from the summary
  for (const j of loadJobs()) { const s = S.jobs[j.id]; if (j.kind !== 'evolve' || !s || s.status !== 'failed' || !s.dir) continue;
    let sum = null; try { sum = JSON.parse(fs.readFileSync(path.join(s.dir, 'summary.json'), 'utf8')); } catch (e) {} if (!sum || sum.status !== 'finished') continue;
    s.status = 'done'; s.recovered = true; s.endedAt = sum.updatedAt; delete s.error; s.summary = { champion: sum.champion, tasks: sum.tasks, refs: (sum.refs || []).map(x => x.hi), generations: sum.generations, hours: sum.hours };
    const v = verdictEvolve(j, sum); s.pass = v.pass; save(); say(`recovered ${j.id} from its finished run`);
    appendLog(`## ${now()} · ${j.id} · ${v.pass == null ? 'DONE' : v.pass ? 'PASS' : 'FAIL'} (recovered)\n${j.title} (question ${j.question}). Run ${path.basename(s.dir)}, ${sum.generations} generations, ${sum.hours} h. The runner had exited non-zero after finishing.\n${v.text}`); }
  try { cp.execFileSync(RUNTIME, ['run/registry_backfill.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  try { cp.execFileSync(RUNTIME, ['run/ideas.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  say(`queue started (pid ${process.pid}, ${WORKERS} workers, runtime ${path.basename(RUNTIME)}${CPU_MAX ? ', cpu-max ' + CPU_MAX + ' %' : ''})`);
  let n = 0;
  for (;;) {
    S = loadState(); const jobs = loadJobs(); writeQueueJs();
    const next = runnable(jobs)[0];
    if (!next) { if (args.wait) { writeQueueJs({ state: 'idle (no runnable jobs)' }); await sleep(300000); continue; } say('no runnable jobs left; exiting'); writeQueueJs({ state: 'idle (no runnable jobs)' }); break; }
    await waitForGo(false);
    say(`job ${next.id} (priority ${next.priority}, question ${next.question}): ${next.title}`);
    try { if (next.kind === 'evolve') await runEvolve(next); else if (next.kind === 'runs') await runRuns(next); else { st(next.id).status = 'skipped'; save(); } }
    catch (e) { const s = st(next.id); s.status = 'failed'; s.error = String(e && e.stack || e).slice(0, 400); save(); appendLog(`## ${now()} · ${next.id} · FAILED\n${s.error}`); }
    writeQueueJs();
    if (paused()) { await waitForGo(false); continue; }
    if (st(next.id).status === 'running') { say(`${next.id} did not finish (status running); retrying after a pause`); await sleep(60000); }
    if (args.once && ++n >= 1) break;
  }
}
main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
