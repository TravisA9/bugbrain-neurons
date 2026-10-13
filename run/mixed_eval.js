// node run/mixed_eval.js <plan> <taskJSON> <growths> [k0]  -> JSON per-growth scores (held-out validation seeds)
const L = require('./lib.js');
const [plan, tj, G = 16, k0 = 0, k1] = process.argv.slice(2); const task = Object.assign({ name: 't' }, JSON.parse(tj));
if (process.env.UC) L.SA.registerPlan('ucx', 'sweep', () => L.SA.createUnifiedC(JSON.parse(process.env.UC)), '');
const gc = L.serialize(L.startGenome(process.env.UC ? 'ucx' : plan)); if (process.env.SC) for (const kv of process.env.SC.split(',')) { const [k, v] = kv.split('='); (gc.cell.areaSc = gc.cell.areaSc || {})[k] = +v; }
const p = L.seedPlan({ valGrowths: +G, valArenas: +G }, 0, true), out = [];
for (let k = +k0; k < (k1 != null ? +k1 : p.G); k++) { const r = L.evaluateGenome(gc, [task], { G: 1, A: 1, growSeeds: [p.growSeeds[k]], arenaSeeds: [p.arenaSeeds[k]] }); if (r.error) throw new Error(r.error); out.push(+r.tasks[0].mean.toFixed(3)); }
console.log(JSON.stringify({ plan, task: tj, scores: out }));
