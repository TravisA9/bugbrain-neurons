// Server-defined experiment run (Compute Lab, experiment protocol 1; the server side is hosting/computelab/private/src/Experiments.php).
// node [--max-old-space-size=N] run/exp.js --job <job.json> --out <dir>
// job.json = the job's spec.experiment: { version 'bb-exp-1', protocol, id, arm, task, phase, plan, tj {env, params}, variant, k, metric, strictFlags }.
// Runs ONE growth k of plan + variant on task tj, exactly as run/r42.js does (same seeds: growth / arena seed k of seedPlan), and writes
// <out>/result.json = { version, id, arm, task, k, variant, metric, metrics {fitness + every numeric task stat}, engine, hidden, wallMs }.
// strictFlags: every P.<name> must be an engine parameter and every s.<field> must exist on the selected cells, so an engine that lacks a
// flag fails loudly instead of silently running the champion without it (an old worker would otherwise report a wrong-but-plausible score).
const fs = require('fs'), path = require('path');
const PROTOCOL = 1, VERSION = 'bb-exp-1';
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
function fail(msg, code) { process.stderr.write('exp.js: ' + msg + '\n'); process.exit(code || 2); }
function parseVariant(v) {
  if (v === '' || v === 'base') return [];
  if (/[\n\r;&|`$\s]/.test(v)) throw new Error('variant has characters the worker will not pass through');
  return v.split(',').map(kv => { const p = kv.split('='); if (p.length !== 2 || !/^-?[0-9.]+(e[+-]?[0-9]+)?$/i.test(p[1])) throw new Error('bad variant item ' + kv.slice(0, 60));
    const [k, sel] = p[0].split('@'), [s, f] = k.split('.'); if (!s || !f) throw new Error('bad variant key ' + p[0]); return { s, f, sel, v: +p[1], key: p[0] }; });
}
function validateJob(job) {
  if (!job || job.version !== VERSION) throw new Error('not a ' + VERSION + ' job');
  if (!(job.protocol >= 1 && job.protocol <= PROTOCOL)) throw new Error('job needs experiment protocol ' + job.protocol + ', this worker has ' + PROTOCOL);
  if (!/^[A-Za-z0-9_]{1,40}$/.test(String(job.plan))) throw new Error('bad plan');
  if (!job.tj || typeof job.tj !== 'object' || typeof job.tj.env !== 'string') throw new Error('bad task');
  if (/[\n\r;&|`$]/.test(JSON.stringify(job.tj))) throw new Error('task has characters the worker will not pass through');
  if (!Number.isInteger(job.k) || job.k < 0 || job.k > 1000000) throw new Error('bad growth seed k');
  if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(String(job.metric))) throw new Error('bad metric name');
  return parseVariant(String(job.variant || 'base'));
}
// Names the engine can read: most flags are read as P.name || default and are not in PARAM_DEFAULTS, so "known" means the name is
// a default or appears as a property in the engine source (js/core, js/envs, run/lib.js). A flag added after this engine
// (e.g. P.wSlow on an R144 engine) or a typo is then refused.
let NAMES = null;
function engineNames(SA) {
  if (NAMES) return NAMES;
  NAMES = new Set(Object.keys(SA.PARAM_DEFAULTS || SA.params || {}));
  const root = path.join(__dirname, '..'), files = [path.join(root, 'run', 'lib.js')];
  for (const d of ['js/core', 'js/envs']) for (const f of fs.readdirSync(path.join(root, d))) if (f.endsWith('.js') && f !== 'book.js') files.push(path.join(root, d, f));
  for (const f of files) { const t = fs.readFileSync(f, 'utf8'); let m; const re = /[.]([A-Za-z_][A-Za-z0-9_]*)|\b([A-Za-z_][A-Za-z0-9_]*)\s*:/g; while ((m = re.exec(t))) NAMES.add(m[1] || m[2]); }
  return NAMES;
}
// Apply the variant like run/r42.js; with strict, refuse names the engine does not know. Returns the number of settings applied.
function applyVariant(L, gc, items, strict) {
  const SA = L.SA, cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell], known = strict ? engineNames(SA) : null;
  for (const it of items) {
    if (strict && !known.has(it.f)) throw new Error((it.s === 'P' ? 'unknown engine flag P.' : 'unknown genome field ' + it.s + '.') + it.f + ' (this worker\'s engine does not read it)');
    if (it.s === 'P') {
      if (it.sel) throw new Error('P.' + it.f + ' takes no region selector');
      SA.params[it.f] = it.v;
    } else {
      for (const C of L.selCells(gc, cells, it.sel)) {
        if (!C[it.s] || typeof C[it.s] !== 'object') throw new Error('unknown genome group ' + it.s);
        C[it.s][it.f] = it.v;
      }
    }
  }
  return items.length;
}
function run(job) {
  const T0 = Date.now(), items = validateJob(job), L = require('./lib.js'), SA = L.SA;
  const task = Object.assign({ name: 'r42' }, job.tj), gc = L.serialize(L.startGenome(job.plan));
  const applied = applyVariant(L, gc, items, job.strictFlags !== false);
  const k = job.k, nV = Math.max(64, k + 1), p = L.seedPlan({ valGrowths: nV, valArenas: nV }, 0, true);
  const r = L.evaluateGenome(gc, [task], { G: 1, A: 1, growSeeds: [p.growSeeds[k]], arenaSeeds: [p.arenaSeeds[k]], dropDense: true });
  if (r.error) throw new Error(String(r.error).slice(0, 300));
  const t = r.tasks[0], metrics = { fitness: +(+t.mean).toFixed(6) };
  for (const q of Object.keys(t.stats || {}).slice(0, 60)) { const v = t.stats[q]; if (typeof v === 'number' && isFinite(v)) metrics[q] = +v.toFixed(6); }
  if (!(job.metric in metrics)) throw new Error('task reported no ' + job.metric);
  return { version: VERSION, id: job.id, arm: job.arm, task: job.task, k, variant: String(job.variant || 'base'), metric: job.metric, metrics,
    engine: { app: SA.APP_VERSION || null, defaults: SA.DEFAULTS_VERSION, applied, node: process.version, heapMB: Math.round(require('v8').getHeapStatistics().heap_size_limit / 1048576) },
    hidden: r.brain ? r.brain.hidden : null, wallMs: Date.now() - T0 };
}
if (require.main === module) {
  const jf = arg('--job'), out = arg('--out');
  if (!jf || !out) fail('usage: node run/exp.js --job <job.json> --out <dir>');
  let job; try { job = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { fail('cannot read job: ' + e.message); }
  let res; try { res = run(job); } catch (e) { fail(e.message, 3); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(res));
  console.log(JSON.stringify(res));
}
module.exports = { PROTOCOL, VERSION, parseVariant, validateJob, applyVariant, run };
