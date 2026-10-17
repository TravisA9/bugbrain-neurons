// run/refill.js (R46): keep the queue from running dry. Called by run/queue.js before each job pick (child process, so edits apply
// without restarting the queue). If pending estimated work < --min-hours (default 3), writes new jobs experiments/queue/auto_*.json
// (auto: true) until the estimate reaches --target-hours (default 8). Ranked by payoff:
//  (a) held-out confirmations (growths 16..31) of recent near-misses: variants that beat base on growths 0..15 of the same plan/task
//  (b) +-25 % neighbourhood sweeps of deepURSx3 (v34 default) learning params on text / order3 / order2, not yet in the registry
//  (c) open ideas in experiments/ideas.json that carry a runnable "job" template
//  (d) fallback: balanced-fitness evolution of the default genome with a fresh seed
// Never changes defaults; acceptance only flags "re-evaluate before adoption". Logs to results/QUEUE_LOG.md.
// --dry: print what would be created.  --force: refill regardless of the estimate.
const fs = require('fs'), path = require('path'), os = require('os');
const REG = require('./registry.js');
const ROOT = path.resolve(__dirname, '..'), RES = process.env.BB_RESULTS || path.join(ROOT, 'results'), QDIR = process.env.BB_QUEUE_DIR || path.join(ROOT, 'experiments', 'queue');
const STATE = path.join(RES, 'queue_state.json'), LOG = path.join(RES, 'QUEUE_LOG.md');
const args = (() => { const a = {}, v = process.argv.slice(2); for (let i = 0; i < v.length; i++) { const k = v[i].replace(/^--/, ''); if (['dry', 'force'].includes(k)) a[k] = true; else a[k] = v[++i]; } return a; })();
const MIN_H = +(args['min-hours'] || 3), TARGET_H = +(args['target-hours'] || 8), WORKERS = +(args.workers || Math.max(1, os.cpus().length - 2));
const RUN_H = +(args['run-hours'] || 0.35);   // rough active hours of one 16-growth r42 run on one worker
const DEF_PLAN = 'deepURSx3';
const TASKS = [
  ['text', '{"env":"seq","params":{"source":"text","nSyms":1000}}'],
  ['order3', '{"env":"seq","params":{"source":"order3","nSyms":1000}}'],
  ['order2', '{"env":"seqchoice","params":{"source":"order2","nSyms":1000}}'],
];
const SWEEP = ['lr', 'tauElig', 'tauPre', 'tauPost', 'aMinus', 'metaN', 'teachThr', 'preNorm', 'rcvDiv', 'mixRate'];

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return { jobs: {} }; } };
const loadJobs = () => fs.readdirSync(QDIR).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(QDIR, f), 'utf8')); } catch (e) { return null; } }).filter(Boolean);
const estHours = j => j.estHours || (j.kind === 'evolve' ? ((j.budget && j.budget.hours) || 1) : j.kind === 'runs' ? Math.max(RUN_H, Math.ceil((j.runs || []).length / WORKERS) * RUN_H) : 0);
function pendingHours(jobs, S) { const st = id => (S.jobs[id] || { status: 'pending' }).status;
  return jobs.filter(j => (j.kind === 'evolve' || j.kind === 'runs') && ['pending', 'running'].includes(st(j.id)) && !(j.after && j.afterPass && S.jobs[j.after] && S.jobs[j.after].pass === false)).reduce((a, j) => a + estHours(j), 0); }

let defaultsVersion = null, genome = null;
function lib() { if (!genome) { const L = require('./lib.js'); defaultsVersion = L.SA.DEFAULTS_VERSION; const g = L.serialize(L.startGenome(DEF_PLAN)); genome = g.kind === 'regions' ? g.cell.regions[0].g : g.cell; } return genome; }
const regAll = () => REG.load().filter(e => e.status !== 'failed');
// key used by r42 when it records a run
const r42Key = (plan, tj, variant, G, g0) => REG.fingerprints(REG.describeAblation(plan, tj, variant + '|r42 g0=' + g0, G, null, defaultsVersion)).fp;
function queuedKeys(jobs) { const s = new Set(); for (const j of jobs) for (const r of j.runs || []) if (r.script === 'run/r42.js') s.add([r.args[0], r.args[1], r.args[3] || 'base', r.args[4] || '0'].join('|')); return s; }
const r42Run = (plan, tj, variant, g0, label, out) => ({ script: 'run/r42.js', args: [plan, tj, '16', variant, String(g0)], label, env: { BB_OUT: out } });

// R49: jobs on the shared queue branch (copied to experiments/queue_shared, or a .dq clone) count as queued, so refill never duplicates phone/runner work
function sharedJobs() { const o = []; for (const d of [path.join(ROOT, 'experiments', 'queue_shared'), path.join(ROOT, '.dq', 'jobs')]) { try { for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) try { o.push(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))); } catch (e) {} } catch (e) {} } return o; }
function candidates(jobs) {
  lib(); const reg = regAll(), fps = new Set(reg.map(e => e.fp)), queued = queuedKeys(jobs.concat(sharedJobs())), out = [];
  const known = (plan, tj, v, g0) => fps.has(r42Key(plan, tj, v, 16, g0)) || queued.has([plan, tj, v, String(g0)].join('|'));
  // (a) near-misses: same plan/task, defaults = current, variant mean > base mean on growths 0..15, not yet confirmed on 16..31
  const res = reg.filter(e => e.result && e.desc && e.desc.defaults === defaultsVersion && e.result.mean != null), base = {};
  for (const e of res) { const v = String(e.result.variant || ''); if (v === 'base' && (e.result.g0 || 0) === 0) base[e.result.plan + '|' + e.result.task] = e.result.mean; }
  const seen = new Set();
  for (const e of res.slice().reverse()) { const R = e.result, v = String(R.variant || ''), b = base[R.plan + '|' + R.task]; if (v === 'base' || v.includes('|') || (R.g0 || 0) !== 0 || b == null) continue;
    const gain = (R.mean - b) / Math.max(1e-6, Math.abs(b)); const k = R.plan + R.task + v; if (gain <= 0 || seen.has(k)) continue; seen.add(k);
    if (known(R.plan, R.task, v, 16)) continue;
    out.push({ tier: 'a', payoff: 3 + Math.min(1, gain * 10), title: `Held-out check of near-miss ${v} on ${R.plan} (${R.task.slice(0, 60)}), growths 16-31`, runs: [r42Run(R.plan, R.task, 'base', 16, `${R.plan} base g16`, 'results/auto/confirm.jsonl'), r42Run(R.plan, R.task, v, 16, `${R.plan} ${v} g16`, 'results/auto/confirm.jsonl')].filter(r => !known(r.args[0], r.args[1], r.args[3], 16)), meta: { gain: +gain.toFixed(4), from: R.mean, base: b } }); }
  // (b) neighbourhood sweeps around the default plan
  const G = lib(); let rank = 0;
  for (const key of SWEEP) { const v0 = G.pl && G.pl[key]; if (typeof v0 !== 'number' || v0 === 0) continue;
    for (const f of [0.75, 1.25]) { let v = v0 * f; v = Math.abs(v) >= 10 ? Math.round(v) : +v.toPrecision(3); const variant = `pl.${key}=${v}`;
      const runs = TASKS.filter(([, tj]) => !known(DEF_PLAN, tj, variant, 0)).map(([n, tj]) => r42Run(DEF_PLAN, tj, variant, 0, `${DEF_PLAN} ${variant} ${n}`, 'results/auto/sweep.jsonl'));
      if (!runs.length) continue;
      for (const [n, tj] of TASKS) if (!known(DEF_PLAN, tj, 'base', 0) && !runs.some(r => r.args[3] === 'base' && r.args[1] === tj)) { runs.unshift(r42Run(DEF_PLAN, tj, 'base', 0, `${DEF_PLAN} base ${n}`, 'results/auto/sweep.jsonl')); queued.add([DEF_PLAN, tj, 'base', '0'].join('|')); }
      out.push({ tier: 'b', payoff: 2 - 0.01 * rank++, title: `Sweep ${DEF_PLAN} ${variant} (default ${v0}, x${f}) on text/order3/order2, 16 growths`, runs }); } }
  // (c) open ideas with a runnable job template
  try { const ideas = JSON.parse(fs.readFileSync(path.join(ROOT, 'experiments', 'ideas.json'), 'utf8')).ideas || [];
    for (const i of ideas) if (['open', 'promising'].includes(i.status) && i.job && !jobs.some(j => j.idea === i.id)) out.push({ tier: 'c', payoff: 1.5 + (i.status === 'promising' ? 0.2 : 0), title: `Idea ${i.id}: ${i.title}`, idea: i.id, template: i.job }); } catch (e) {}
  // (d) fallback evolution
  out.push({ tier: 'd', payoff: 1, title: `Evolve on balanced multitask fitness (experiments/multitask.json), fresh seed (3 h)`, evolve: true });
  return out.sort((x, y) => y.payoff - x.payoff);
}

function toJob(c, stamp, n) {
  const id = `auto_${stamp}_${n}_${c.tier}`, j = { id, auto: true, title: '[auto] ' + c.title, question: 'AUTO', track: 'neuro', priority: +(0.5 + c.payoff / 10).toFixed(3), note: 'auto-generated by run/refill.js; defaults are never changed automatically, re-evaluate any winner on held-out growths before adoption' };
  if (c.idea) j.idea = c.idea;
  if (c.template) return Object.assign(j, c.template, { id, auto: true, title: j.title, priority: j.priority });
  if (c.evolve) { const seed = Date.now() % 100000; const cfgPath = `experiments/auto_evolve_${seed}.json`;
    let base = {}; try { base = JSON.parse(fs.readFileSync(path.join(ROOT, 'experiments', 'multitask.json'), 'utf8')); } catch (e) {}
    const cfg = Object.assign({}, base, { name: id, seed }); return Object.assign(j, { kind: 'evolve', config: cfgPath, budget: { hours: 3 }, accept: { championMin: 1.03 }, _cfg: [cfgPath, cfg] }); }
  return Object.assign(j, { kind: 'runs', runs: c.runs, meta: c.meta });
}

function main() {
  const S = loadState(), jobs = loadJobs(), have = pendingHours(jobs, S);
  if (have >= MIN_H && !args.force) { console.log(`refill: ${have.toFixed(1)} h pending >= ${MIN_H} h; nothing to do`); return; }
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12); let h = have, n = 0; const made = [];
  for (const c of candidates(jobs)) { if (h >= TARGET_H) break; if (c.runs && !c.runs.length) continue;
    const j = toJob(c, stamp, n++); h += estHours(j); made.push(j);
    if (c.evolve) { if (h < TARGET_H) { /* only one fallback evolve per refill */ } break; } }
  for (const j of made) { if (args.dry) { console.log(`would add ${j.id} (${estHours(j).toFixed(1)} h, prio ${j.priority}): ${j.title}`); continue; }
    if (j._cfg) { fs.writeFileSync(path.join(ROOT, j._cfg[0]), JSON.stringify(j._cfg[1], null, 2)); delete j._cfg; }
    fs.writeFileSync(path.join(QDIR, j.id + '.json'), JSON.stringify(j, null, 2)); }
  const msg = `## ${new Date().toLocaleString()} · REFILL\nPending work was ${have.toFixed(1)} h (< ${MIN_H} h); auto-added ${made.length} job(s), about ${(h - have).toFixed(1)} h:\n` + made.map(j => `- ${j.id}: ${j.title}`).join('\n');
  console.log(msg); if (!args.dry && made.length) { if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, '# Queue log (run/queue.js)\n'); fs.appendFileSync(LOG, '\n' + msg + '\n'); }
}
main();
// R51: keep the dashboard data current (results/dashdata.js); refill runs before every job pick, so this also runs after every job.
// Not inside a run/dq.js scratch queue. Child process with a timeout; never fails the refill.
if (!process.env.BB_QUEUE_DIR && !args.dry) { try { require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'dashdata.js'), '--quiet'], { cwd: ROOT, stdio: 'ignore', timeout: 90000, windowsHide: true }); } catch (e) {} }
