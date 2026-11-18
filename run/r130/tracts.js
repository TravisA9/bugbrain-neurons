const L = require('../run/lib.js'), SA = L.SA;
const [k0, variant, tag, tj0] = process.argv.slice(2), k = +k0, tj = JSON.parse(tj0 || '{"env":"seqchoice","params":{"source":"order2","nSyms":1000}}');
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { if (!kv) continue; const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const nV = Math.max(64, k + 1), p = L.seedPlan({ valGrowths: nV, valArenas: nV }, 0, true), g = L.deserialize(gc).g, env = L.setupTask({ name: 'x', env: tj.env, params: tj.params });
const b = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }); console.log(tag, k, JSON.stringify(b.tracts));
