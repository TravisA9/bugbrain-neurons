// count distinct initial claw tuples (duplicate detectors) for a growth
process.chdir('/workspace/bb/run'); const L = require('/workspace/bb/run/lib.js'), SA = L.SA, fs = require('fs');
const k = +process.argv[2], variant = fs.readFileSync('/workspace/v47.txt', 'utf8').trim(), task = { name: 'x', env: 'seq', params: { source: 'book', nSyms: 1000 } };
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.replace(/^,/, '').split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = isNaN(+v) ? v : +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), env = L.setupTask(task), b = SA.growCell(L.deserialize(gc).g, { seed: p.growSeeds[k], spec: env.spec });
const gs = b.granSrc, ks = gs.initKeys.filter(Boolean), cnt = new Map(); for (const x of ks) cnt.set(x, (cnt.get(x) || 0) + 1);
const byK = {}; for (const x of ks) { const n = x.split(',')[0]; byK[n] = (byK[n] || 0) + 1; }
console.log(JSON.stringify({ k, nG: gs.nG, keys: ks.length, distinct: cnt.size, byK, cols: gs.src.map(s => s.keys.length), top: [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 5) }));
