'use strict';
/* ---------------- evolve.js: Evolution (robust-growth fitness) ----------------
 * One generation =
 *   (a) every genome is GROWN `growths` times with different developmental-noise
 *       seeds (shared by the whole generation, fresh every generation), and each
 *       grown brain lives `episodes` episodes of the current environment. All genomes
 *       see the same seeds and episodes (fair comparison).
 *       fitness = mean over growths - robustW x std over growths
 *       (growths = 1: grown once with the genome's own seed, the old behaviour).
 *   (b) VALIDATION: the top `valTopK` genomes + the current champion are regrown
 *       with `valGrowths` FIXED held-out noise seeds and scored on FIXED held-out
 *       arenas (valArenas in total). Same robust formula. The best becomes/stays the
 *       CHAMPION; its regrowth spread (min / mean / max) is kept for the UI.
 *   (c) breed: elites (incl. the champion) copied unchanged, the rest are
 *       tournament-selected parents (+ optional crossover) + mutation.          */
const VAL_SEED = 900001, VAL_GROW_SEED = 700001;
function newRandomGenome(r) {
  r = r || Math.random;
  return params.cellStart === 'random' ? createRandomCellGenome(r) : mutateCell(planFor(params.cellStart).make(), r);
}
function mutate(g, r) { return mutateCell(g, r); }
function crossover(a, b, r) { return crossCell(a, b, r); }
function cloneGenome(g) { return cloneCell(g); }
// Combine per-growth mean scores into one fitness.
function robustScore(xs) {
  const n = xs.length, mean = xs.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const min = Math.min(...xs), base = mean - (n > 1 ? params.robustW * sd : 0), w = n > 1 ? params.worstW || 0 : 0;
  return { fit: (1 - w) * base + w * min, mean, sd, min, max: Math.max(...xs) };
}
class Evolution {
  constructor(seed, blank) {
    this.rng = mulberry32(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
    this.gen = 0; this.history = []; this.champion = null;   // champion = { genome, val, gen, spread }
    this.latestBest = null;                                  // best (by training fitness) of the latest generation
    this.pop = [];
    if (!blank) for (let i = 0; i < params.popSize; i++) this.pop.push(newRandomGenome(this.rng));
    this.ticksDone = 0; this.restartGeneration();
  }
  // the environment is fixed for a whole generation (settings changed meanwhile apply from the next one)
  restartGeneration() { this.env = currentEnv(); this.phase = 'pop'; this.idx = 0; this.unit = 0; this.scores = []; this.acc = 0; this.sim = null; this.brain = null; this.valQueue = []; }
  seedWith(g) {
    this.pop = [g]; while (this.pop.length < params.popSize) this.pop.push(mutate(cloneGenome(g), this.rng));
    this.restartGeneration();
  }
  // evaluation plan for the current phase
  plan(val) {
    const G = Math.max(1, val ? params.valGrowths : params.growths) | 0;
    const A = Math.max(1, val ? Math.ceil(params.valArenas / G) : params.episodes) | 0;
    return { G, A };
  }
  growSeed(g, k, val) {
    const G = this.plan(val).G;
    if (G === 1) return g.seed;                          // single growth: the genome's own noise seed
    return val ? VAL_GROW_SEED + k : hashSeed(this.gen + 1, k);
  }
  arenaSeed(k, e, val) { const A = this.plan(val).A; return val ? VAL_SEED + k * A + e : 1000 * this.gen + k * A + e + 1; }
  // Grown brain of genome g with noise seed s (validation growths are cached on the genome).
  grow(g, s, val) {
    const spec = this.env.spec;
    if (g.kind !== 'cell' && g.kind !== 'regions') return phenotype(g, spec);
    if (s === g.seed) return phenotype(g, spec);
    if (!val) return growCell(g, { seed: s, spec });
    if (!g._vg) Object.defineProperty(g, '_vg', { value: {}, writable: true, configurable: true, enumerable: false });
    const key = spec.key.length + ':' + hashStr(spec.key) + ':' + s;
    return g._vg[key] || (g._vg[key] = growCell(g, { seed: s, spec }));
  }
  run(n) {
    let finished = false;
    while (n-- > 0 && !finished) {
      const val = this.phase === 'val', g = val ? this.valQueue[this.idx] : this.pop[this.idx];
      const { G, A } = this.plan(val), k = (this.unit / A) | 0, e = this.unit % A;
      if (!this.sim) {
        if (e === 0) this.brain = this.grow(g, this.growSeed(g, k, val), val);
        this.sim = new Agent(g, this.arenaSeed(k, e, val), this.brain, this.env);
      }
      this.sim.tick(); this.ticksDone++;
      if (!this.sim.done) continue;
      this.acc += this.sim.fitness; this.sim = null; this.unit++;
      if (this.unit % A === 0) { this.scores.push(this.acc / A); this.acc = 0; this.brain = null; }
      if (this.unit < G * A) continue;
      const rs = robustScore(this.scores);
      if (val) { g.val = rs.fit; g.valSpread = { min: rs.min, mean: rs.mean, max: rs.max, sd: rs.sd, n: G }; }
      else { g.fitness = rs.fit; g.fitMean = rs.mean; }
      this.scores = []; this.unit = 0; this.idx++;
      if (!val && this.idx >= this.pop.length) this.startValidation();
      else if (val && this.idx >= this.valQueue.length) { this.finishGeneration(); finished = true; }
    }
    return finished;
  }
  runGeneration() { while (!this.run(10000)); }
  startValidation() {
    const sorted = this.pop.slice().sort((a, b) => b.fitness - a.fitness);
    const q = sorted.slice(0, params.valTopK);
    if (this.champion && !q.includes(this.champion.genome)) q.push(this.champion.genome);  // re-check (params may have changed)
    this.valQueue = q; this.phase = 'val'; this.idx = 0; this.unit = 0; this.scores = []; this.acc = 0; this.sim = null;
  }
  finishGeneration() {
    const r = this.rng, pop = this.pop.slice().sort((a, b) => b.fitness - a.fitness);
    const avg = pop.reduce((s, g) => s + g.fitness, 0) / pop.length;
    this.latestBest = pop[0];
    if (this.champion) { this.champion.val = this.champion.genome.val; this.champion.spread = this.champion.genome.valSpread; }
    for (const g of this.valQueue)
      if (!this.champion || g.val > this.champion.val) this.champion = { genome: g, val: g.val, gen: this.gen, spread: g.valSpread };
    const sp = this.champion.spread || {};
    const hist = { gen: this.gen, best: pop[0].fitness, avg, champ: this.champion.val, cMin: sp.min, cMax: sp.max };
    // environment hook (e.g. a curriculum that lengthens the delay once the champion is good enough)
    if (this.env.def.onGeneration) { const info = this.env.def.onGeneration(this, this.env.P); if (info) hist.env = info; }
    this.history.push(hist);
    const size = params.popSize, nElite = Math.max(1, Math.round(size * params.eliteFrac));
    const tour = () => { let b = pop[(r() * pop.length) | 0]; for (let i = 0; i < 2; i++) { const c = pop[(r() * pop.length) | 0]; if (c.fitness > b.fitness) b = c; } return b; };
    const next = pop.slice(0, Math.min(nElite, pop.length));           // elites: same objects, never mutated
    if (!next.includes(this.champion.genome)) next.unshift(this.champion.genome);
    for (const g of pop) if (g !== this.champion.genome && !next.includes(g) && g._vg) g._vg = null;   // free cached growths
    while (next.length < size) {
      const p = tour();
      const child = (r() < params.crossoverRate) ? crossover(p, tour(), r) : cloneGenome(p);
      next.push(mutate(child, r));
    }
    this.pop = next; this.gen++; this.restartGeneration();
  }
  progress() {
    const P = this.plan(false), V = this.plan(true);
    const popWork = this.pop.length * P.G * P.A, valWork = (params.valTopK + 1) * V.G * V.A;
    const done = this.phase === 'pop' ? this.idx * P.G * P.A + this.unit : popWork + this.idx * V.G * V.A + this.unit;
    return Math.min(1, done / (popWork + valWork));
  }
  /* ----- save / restore a whole session (population + champion + history) ----- */
  toJSON() {
    const env = currentEnv();
    return { format: 'spiking-arena-session/v7', appVersion: SpikingArena.APP_VERSION, defaultsVersion: SpikingArena.DEFAULTS_VERSION, defaultPlan: SpikingArena.defaultPlanId(env), savedAt: new Date().toISOString(), gen: this.gen,
      env: env.id, envParams: Object.assign({}, env.P), params: Object.assign({}, params), history: this.history,
      champion: this.champion ? { val: this.champion.val, gen: this.champion.gen, spread: this.champion.spread || null, genome: genomeToCompact(this.champion.genome) } : null,
      population: this.pop.filter(g => !this.champion || g !== this.champion.genome).map(genomeToCompact) };
  }
  // Accepts v7 sessions, v5/v6 sessions (bug arena) and v1-v4 sessions whose genomes are cellular.
  // Anything else (direct / recipe / mushroom-body genomes) throws LEGACY_MSG.
  static fromJSON(obj, restoreParams) {
    if (typeof obj === 'string') obj = JSON.parse(obj);
    if (!obj || !/^spiking-arena-session\/v[1-7]$/.test(obj.format)) throw new Error('not a spiking-arena session file');
    const all = (obj.population || []).concat(obj.champion ? [obj.champion.genome] : []);
    if (!all.length || all.some(o => !o || (o.kind !== 'cell' && o.kind !== 'regions'))) throw new Error(LEGACY_MSG);
    const v7 = /v7$/.test(obj.format), envId = v7 && ENVS[obj.env] ? obj.env : 'bug';
    if (restoreParams && obj.params) {
      for (const k in obj.params) if (k in params && k !== 'env') params[k] = obj.params[k];
      const ep = v7 ? migrateEnvParams(envId, Object.assign({}, obj.envParams || {})) : migrateBugParams(obj.params);
      if (!/v[567]$/.test(obj.format)) {                // old cellular session: keep its world
        ep.task = 'normal'; params.growths = 1; params.valGrowths = 1; params.episodes = obj.params.episodes || 3;
      }
      setEnv(envId, ep);
    } else if (restoreParams) setEnv(envId);
    const e = new Evolution(null, true);
    e.gen = obj.gen || 0; e.history = obj.history || [];
    e.pop = (obj.population || []).map(genomeFromCompact);
    if (obj.champion) { const g = genomeFromCompact(obj.champion.genome); e.champion = { genome: g, val: obj.champion.val, gen: obj.champion.gen, spread: obj.champion.spread || null }; e.pop.unshift(g); }
    while (e.pop.length < params.popSize) e.pop.push(e.champion ? mutate(cloneGenome(e.champion.genome), e.rng) : newRandomGenome(e.rng));
    e.restartGeneration();
    return e;
  }
}
function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }
Object.assign(SpikingArena, { VAL_SEED, VAL_GROW_SEED, newRandomGenome, mutate, crossover, cloneGenome, robustScore, Evolution });
