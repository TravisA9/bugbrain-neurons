'use strict';
/* run/free.js (v25): 'free' genomes. A free genome = the hand plan's STRUCTURAL constants as bounded, evolvable genes
 * (column seed counts, tissue size, band positions, wiring weights, memory on/off, number of regions, tract density ...)
 * + the cellular genome they produce. Mutation either changes 1-2 structural genes (prob. pStruct; the cellular genome is
 * then rebuilt from the plan factory, so earlier cell-level mutations are dropped) or mutates the cellular genome as usual.
 * Spaces: 'reward' (createRewardPlan / createRewardRegionsPlan: actor-critic, 1 or 2 regions) and 'predict3'
 * (createPredict3Plan: cortex + context region). [lo, hi, int?] bounds; defaults = the hand plan's values. */
const SPACES = {
  reward: {
    genes: { regions: [1, 2, 1, 1], nSeed: [5, 25, 1, 13], nSeedP: [5, 25, 1, 13], maxCells: [200, 800, 1, 420], y: [0.3, 0.55, 0, 0.42], yP: [-0.55, -0.2, 0, -0.38],
             wIn: [10, 60, 0, 30], wHid: [3, 25, 0, 10], coll: [0, 10, 1, 5], reach: [1.2, 2.4, 0, 1.7], normE: [20, 90, 0, 45], s7: [-5, 5, 0, -5], xgo: [-5, 5, 0, -5],
             wGo: [1, 12, 0, 4], lrR: [0.01, 0.2, 0, 0.05], tauElig: [30, 300, 0, 100], wTot: [15, 90, 0, 45], p: [0.1, 1, 0, 0.3] },
    make(SA, o) {
      const tune = {}; for (const k of ['nSeed', 'nSeedP', 'maxCells', 'y', 'yP', 'wIn', 'wHid', 'coll', 'reach', 'normE', 's7', 'xgo', 'wGo', 'lrR', 'tauElig']) tune[k] = o[k];
      if (o.regions >= 2) { const d = SA.createRewardRegionsPlan({ wTot: o.wTot, p: o.p, state: tune, action: Object.assign({}, tune, { wGo: o.wGo * 2 }) }); d.label = 'free reward plan (2 regions)'; return d; }
      const d = SA.createRewardPlan(tune); d.label = 'free reward plan (1 region)'; return d;
    } },
  predict3: {
    genes: { w3: [10, 60, 0, 30], gain: [0.5, 2, 0, 1], mixRate: [0.002, 0.03, 0, 0.008] },
    make(SA, o) { const d = SA.createPredict3Plan({ w3: o.w3, gain: o.gain, cortex: { mixRate: o.mixRate } }); d.label = 'free third-order plan'; return d; } },
};
function space(base) { const s = SPACES[base]; if (!s) throw new Error('unknown free genome space ' + base + ' (known: ' + Object.keys(SPACES).join(', ') + ')'); return s; }
function defaults(base) { const o = {}, g = space(base).genes; for (const k in g) o[k] = g[k][3]; return o; }
function make(SA, base, opts) { return space(base).make(SA, opts); }
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
function mutate(SA, x, r, pStruct) {
  const base = x.free.base, opts = Object.assign({}, x.free.opts), G = space(base).genes;
  if (r() < pStruct) {
    const keys = Object.keys(G), n = 1 + (r() < 0.5 ? 1 : 0);
    for (let q = 0; q < n; q++) { const k = keys[(r() * keys.length) | 0], [lo, hi, int] = G[k];
      let v = opts[k] + gauss(r) * (hi - lo) * 0.15; if (int) v = Math.round(v); opts[k] = Math.min(hi, Math.max(lo, v)); }
    return { g: make(SA, base, opts), free: { base, opts } };
  }
  return { g: SA.mutate(SA.cloneGenome(x.g), r), free: { base, opts } };
}
module.exports = { SPACES, defaults, make, mutate };
