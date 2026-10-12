// R28 [neuro] demand-driven wiring controls. node results_v27/demand_exp.js <task> <cond> [G=16] [variant]
// cond: both | demand | activity | neither | base ; task: text | order3 | bandit | cueR (+ size variants via K)
const L = require('../run/lib.js'), SA = L.SA;
const [task, cond, G = 16, kArg] = process.argv.slice(2);
const TASKS = { text: { env: 'seq', params: { source: 'text' }, plan: 'predictK3' }, order3: { env: 'seq', params: { source: 'order3', K: 8 }, plan: 'predictK3' },
  bandit: { env: 'bandit', params: {}, plan: 'rewardE' }, cueR: { env: 'cue', params: { mapping: 'random' }, plan: 'rewardE' } };
const T = JSON.parse(JSON.stringify(TASKS[task])); if (kArg) T.params.K = +kArg;
const gc = L.serialize(L.startGenome(T.plan));
const cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
const D = +(process.env.DEMAND || 1), REQ = +(process.env.REQ || 0.15);
for (const C of cells) {
  if (cond === 'base') continue;
  const dem = cond === 'both' || cond === 'demand', act = cond === 'both' || cond === 'activity';
  C.sc.demand = dem ? D : 0; C.sc.request = act ? REQ : 0;   // activity during growth enters only through the spontaneous-event (request) channel
  if (dem && process.env.EXTRA) Object.assign(C.sc, JSON.parse(process.env.EXTRA));
}
const env = L.setupTask({ env: T.env, params: T.params }), g = L.deserialize(gc).g, rows = [];
for (let k = 0; k < +G; k++) {
  const seed = SA.VAL_GROW_SEED + 1000 + (+process.env.SEEDOFF || 0) + k;          // held-out growth seeds (not used by the runner's validation set)
  const b = SA.growCell(g, { seed, spec: env.spec }), st = b.devStats;
  let nz = 0; for (let i = 0; i < b.W.length; i++) if (b.W[i] !== 0) nz++;
  const a = new SA.Agent(g, SA.VAL_SEED + 5000 + (+process.env.SEEDOFF || 0) + k, b, env); while (!a.done) a.tick();
  rows.push({ score: a.fitness, orphan: st.orphanOut / st.nOut, silentIn: st.nInUsed ? st.silentIn / st.nInUsed : 0, cov: st.outCov, outIn: st.outInMean, syn: nz, hid: b.nHid, dsyn: st.demandSyn || 0, nOut: st.nOut });
}
const m = f => rows.reduce((s, r) => s + f(r), 0) / rows.length, sd = f => { const u = m(f); return Math.sqrt(m(r => (f(r) - u) ** 2)); };
console.log(JSON.stringify({ off: +process.env.SEEDOFF || 0, x: process.env.EXTRA || '', task, K: kArg || null, cond, G: +G, score: +m(r => r.score).toFixed(3), scoreSd: +sd(r => r.score).toFixed(3), orphan: +m(r => r.orphan).toFixed(3),
  silentIn: +m(r => r.silentIn).toFixed(3), cov: +m(r => r.cov).toFixed(3), outIn: +m(r => r.outIn).toFixed(2), syn: Math.round(m(r => r.syn)), synSd: Math.round(sd(r => r.syn)), hid: Math.round(m(r => r.hid)), dsyn: +m(r => r.dsyn).toFixed(1), nOut: rows[0].nOut }));
