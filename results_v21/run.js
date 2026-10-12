// One lifetime per growth for a sequence plan (round 22). Prints mean stats.
//   [SRC=order3:8|text|fables] [NS=600] [PLAN=predictK3|predictK2XO] [TUNE='{...}'] [NG=4] [S0=40] [ABL=m3|m2] node results_v21/run.js
// predictK3 runs on the three-phase clock (clock3); other plans on the two-phase clock. ABL=m3 cuts the M3 -> mixing tract
// (w3 0, the context region still grows); ABL=m2 silences the cortex M2 cells (-100 mV threshold offset).
const SA = require('../js/node_load.js')();
const [src, K] = (process.env.SRC || 'order3:8').split(':'), NS = +(process.env.NS || 600), NG = +(process.env.NG || 4), S0 = +(process.env.S0 || 40);
const plan = process.env.PLAN || 'predictK3', tune = JSON.parse(process.env.TUNE || '{}'), k3 = plan === 'predictK3';
const PP = Object.assign({ source: src, nSyms: NS, clock2: true, clock3: k3 }, K ? { K: +K } : {}, JSON.parse(process.env.PP || '{}'));
const E = SA.setEnv('seq', PP); const acc = {}; let t0 = Date.now(), n = 0;
for (let s = S0; s < S0 + NG; s++) {
  const d = k3 ? SA.createPredict3Plan(Object.assign({}, tune, process.env.ABL === 'm3' ? { w3: 0 } : {})) : SA.PLANS[plan].make();
  const g = SA.growCell(d, { seed: s, spec: E.spec });
  if (process.env.ABL === 'm2') for (let i = g.nIn; i < g.nIn + g.nHid; i++) if (g.cellType[i] === 18 && (!g.region || g.region[i] === 0)) g.thresh[i] = 100;
  const st = SA.runEpisode(d, 1000 + s, g, E).task.stats(); for (const k in st) if (typeof st[k] === 'number') acc[k] = (acc[k] || 0) + st[k]; n++;
}
for (const k in acc) acc[k] = +(acc[k] / n).toFixed(3);
console.log((process.env.NAME || plan).padEnd(12), JSON.stringify({ acc: acc.accuracy, last: acc.lastQuarter, first: acc.firstQuarter, bits: acc.bitsSoft, ideal: acc.idealLast, firstOrder: acc.firstOrder }), ((Date.now() - t0) / 1000).toFixed(0) + 's');
