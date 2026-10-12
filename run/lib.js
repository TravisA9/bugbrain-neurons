'use strict';
/* run/lib.js (v25): shared by the runner, its worker threads and the benchmark.
 *  - task setup (env + params), seeds (the same scheme as the app's Evolution), genome (de)serialisation incl. 'free' genomes
 *  - evaluateGenome: grow G times, live A episodes per growth and per task -> robust fitness per task + mean stats + brain size
 *  - behaviour descriptors, novelty, a seedable RNG whose state can be checkpointed */
const { loadEngine } = require('./engine.js');
const FREE = require('./free.js');
const SA = loadEngine();

// ---- RNG (mulberry32 with an explicit, saveable state; same numbers as SA.mulberry32) ----
function makeRng(state) {
  let a = state | 0;
  const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.state = () => a; return r;
}
// ---- engine params and tasks ----
function applyEngine(engine) { for (const k in engine || {}) if (k in SA.params) SA.params[k] = engine[k]; }
// env params of a task: the env's recommended settings for the given choices, then exactly the given values
function taskEnvParams(t) {
  const given = t.params || {}, o = SA.recommendedEnvParams(t.env, given, Object.keys(given));
  return Object.assign(o, given);
}
const envCache = new Map();
function setupTask(t) {
  const key = t.env + JSON.stringify(t.params || {});
  let P = envCache.get(key); if (!P) { P = taskEnvParams(t); envCache.set(key, P); }
  SA.setEnv(t.env, P); return SA.currentEnv();
}
// ---- seeds (as js/core/evolve.js) ----
function seedPlan(engine, gen, val) {
  const G = Math.max(1, (val ? engine.valGrowths : engine.growths) | 0), A = Math.max(1, val ? Math.ceil(engine.valArenas / G) : engine.episodes | 0);
  const growSeeds = [], arenaSeeds = [];
  for (let k = 0; k < G; k++) { growSeeds.push(G === 1 ? null : val ? SA.VAL_GROW_SEED + k : SA.hashSeed(gen + 1, k)); for (let e = 0; e < A; e++) arenaSeeds.push(val ? SA.VAL_SEED + k * A + e : 1000 * gen + k * A + e + 1); }
  return { G, A, growSeeds, arenaSeeds };
}
// ---- genomes: in memory { g (SA cellular genome), free? }; on the wire / disk: compact JSON ----
function serialize(x) { return x.free ? { kind: 'free', base: x.free.base, opts: Object.assign({}, x.free.opts), cell: SA.genomeToCompact(x.g) } : SA.genomeToCompact(x.g); }
function deserialize(o) { return o.kind === 'free' ? { g: SA.genomeFromCompact(o.cell), free: { base: o.base, opts: Object.assign({}, o.opts) } } : { g: SA.genomeFromCompact(o) }; }
function startGenome(id, cfg) {
  if (/^free:/.test(id)) { const base = id.slice(5); const opts = FREE.defaults(base); return { g: FREE.make(SA, base, opts), free: { base, opts } }; }
  if (id === 'random') return { g: SA.createRandomCellGenome(Math.random) };
  if (!SA.PLANS[id]) throw new Error('unknown plan ' + id + ' (known: ' + Object.keys(SA.PLANS).join(', ') + ')');
  return { g: SA.PLANS[id].make() };
}
function mutate(x, r, cfg) {
  if (x.free) return FREE.mutate(SA, x, r, (cfg.free && cfg.free.pStruct) != null ? cfg.free.pStruct : 0.25);
  return { g: SA.mutate(SA.cloneGenome(x.g), r) };
}
function crossover(a, b, r) {
  if (a.free || b.free) {
    if (a.free && b.free && a.free.base === b.free.base && JSON.stringify(a.free.opts) === JSON.stringify(b.free.opts)) return { g: SA.crossover(a.g, b.g, r), free: { base: a.free.base, opts: Object.assign({}, a.free.opts) } };
    return { g: SA.cloneGenome(a.g), free: a.free ? { base: a.free.base, opts: Object.assign({}, a.free.opts) } : undefined };
  }
  return { g: SA.crossover(a.g, b.g, r) };
}
// ---- evaluation ----
// returns { tasks: [{ fit, mean, sd, min, stats }], brain: { hidden, synapses }, ticks, ms, error? }
function evaluateGenome(gc, tasks, plan) {
  const t0 = Date.now(), g = deserialize(gc).g, out = { tasks: [], brain: null, ticks: 0 };
  for (const t of tasks) {
    try {
      const env = setupTask(t), scores = [], st = {}; let n = 0;
      for (let k = 0; k < plan.G; k++) {
        const brain = plan.growSeeds[k] == null ? SA.phenotype(g, env.spec) : SA.growCell(g, { seed: plan.growSeeds[k], spec: env.spec });
        if (!out.brain) { let s = 0; for (let i = 0; i < brain.W.length; i++) if (brain.W[i] !== 0) s++; out.brain = { hidden: brain.nHid, synapses: s }; }
        let acc = 0;
        for (let e = 0; e < plan.A; e++) {
          const a = new SA.Agent(g, plan.arenaSeeds[k * plan.A + e], brain, env);
          while (!a.done) { a.tick(); out.ticks++; }
          acc += a.fitness; n++;
          const x = a.task.stats ? a.task.stats() : {};
          if (x.silent != null && x.trials) x.silentFrac = x.silent / x.trials;
          for (const q in x) if (typeof x[q] === 'number' && isFinite(x[q])) st[q] = (st[q] || 0) + x[q];
        }
        scores.push(acc / plan.A);
      }
      for (const q in st) st[q] /= n;
      const rs = SA.robustScore(scores);
      out.tasks.push({ fit: rs.fit, mean: rs.mean, sd: rs.sd, min: rs.min, stats: st });
    } catch (e) { out.tasks.push({ fit: 0, mean: 0, sd: 0, min: 0, stats: {}, error: String(e && e.message || e) }); out.error = String(e && e.message || e); }
  }
  if (!out.brain) out.brain = { hidden: 0, synapses: 0 };
  out.ms = Date.now() - t0; return out;
}
// ---- fitness blending, descriptors, novelty ----
// combine: 'mean' (weighted average) | 'min' | 'softmin' (default for balanced runs): each task is capped at `cap`
// (gains beyond it earn nothing) and a soft minimum with temperature `tau` is taken, so one task cannot be traded away for another.
function normFit(r, tasks, refs, comb) {
  const norm = r.tasks.map((x, i) => { const ref = refs[i]; return (x.fit - ref.lo) / ((ref.hi - ref.lo) || 1); });
  const c = typeof comb === 'string' ? { type: comb } : (comb || {}), type = c.type || 'mean';
  const ws = tasks.map(t => t.weight == null ? 1 : t.weight), W = ws.reduce((a, b) => a + b, 0) || 1;
  if (type === 'min') return { fit: Math.min(...norm.map(n => Math.min(n, c.cap || Infinity))), norm };
  if (type === 'softmin') {
    const tau = c.tau || 0.25, cap = c.cap || 1.5, v = norm.map(n => Math.min(n, cap)), m = Math.min(...v);
    let s = 0; v.forEach((n, i) => { s += ws[i] / W * Math.exp(-(n - m) / tau); });
    return { fit: m - tau * Math.log(s), norm };
  }
  let s = 0; norm.forEach((n, i) => { s += ws[i] * n; }); return { fit: s / W, norm };
}
const DEFAULT_DESC = { seq: ['firstQuarter', 'lastQuarter'], bandit: ['optimal', 'lastQuarter'], cue: ['pass', 'silentFrac'], recall: ['pass', 'silentFrac'], bug: ['food', 'poison'], text: ['accuracy', 'bpc'] };
function descriptorNames(cfg) {
  const d = (cfg.novelty && cfg.novelty.descriptors) || (cfg.map && cfg.map.dims && cfg.map.dims.map(x => x.desc));
  if (d) return d;
  const out = []; for (const t of cfg.tasks) for (const f of DEFAULT_DESC[t.env] || ['fitness']) out.push(t.name + '.' + f); return out;
}
function descriptor(r, cfg, names) {
  return names.map(nm => {
    const [a, b] = nm.split('.');
    if (a === 'brain') return b === 'logSynapses' ? Math.log10(1 + r.brain.synapses) : b === 'logHidden' ? Math.log10(1 + r.brain.hidden) : r.brain[b] || 0;
    const i = cfg.tasks.findIndex(t => t.name === a); if (i < 0) throw new Error('descriptor ' + nm + ': unknown task ' + a);
    const x = r.tasks[i]; if (b === 'fitness') return x.fit; return x.stats[b] != null ? x.stats[b] : 0;
  });
}
// mean distance to the k nearest neighbours (population + archive), each dimension scaled by its observed range
function novelty(descs, archive, k) {
  const all = descs.concat(archive), D = descs[0] ? descs[0].length : 0, lo = new Array(D).fill(Infinity), hi = new Array(D).fill(-Infinity);
  for (const d of all) for (let j = 0; j < D; j++) { lo[j] = Math.min(lo[j], d[j]); hi[j] = Math.max(hi[j], d[j]); }
  const sc = lo.map((l, j) => (hi[j] - l) || 1);
  return descs.map((d, i) => {
    const ds = []; all.forEach((e, m) => { if (m === i) return; let s = 0; for (let j = 0; j < D; j++) s += ((d[j] - e[j]) / sc[j]) ** 2; ds.push(Math.sqrt(s)); });
    ds.sort((a, b) => a - b); const kk = Math.min(k, ds.length); let s = 0; for (let q = 0; q < kk; q++) s += ds[q]; return kk ? s / kk : 0;
  });
}
module.exports = { SA, makeRng, applyEngine, taskEnvParams, setupTask, seedPlan, serialize, deserialize, startGenome, mutate, crossover, evaluateGenome, normFit, descriptorNames, descriptor, novelty };
