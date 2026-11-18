// node sw/scfan.js <k> <variant> <tag> [tj]: grow only on seqchoice order2; per receiver group (region / outputs): cells, E in-degree and E weight by sender region
const L = require('../run/lib.js'), SA = L.SA;
const [k0, variant, tag, tj0] = process.argv.slice(2), k = +k0;
const tj = JSON.parse(tj0 || '{"env":"seqchoice","params":{"source":"order2","nSyms":1000}}');
const task = { name: 'sc', env: tj.env, params: tj.params };
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { if (!kv) continue; const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const b = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec });
const names = (b.regions || []).map(r => r.name), h1 = b.nIn + b.nHid;
const grp = q => q < b.nIn ? 'in' : q >= h1 ? 'OUT' : (b.gran && b.gran[q]) ? 'gran' : names[b.region[q]] || ('r' + b.region[q]);
const cnt = {}, ed = {}; for (let q = 0; q < b.region.length || q < h1 + 64; q++) { if (q >= b.nIn && q < h1 || q >= h1) { if (q >= (b.N || b.region.length)) break; const G2 = grp(q); cnt[G2] = (cnt[G2] || 0) + 1; } }
for (let i = 0; i < b.sp.pre.length; i++) { const q = b.sp.post[i], a = b.sp.pre[i], w = b.sp.w[i]; const key = grp(q) + ' <- ' + grp(a) + (w < 0 ? ' I' : ''); const e = ed[key] || (ed[key] = [0, 0]); e[0]++; e[1] += w; }
const rows = Object.entries(ed).filter(([key]) => /^(striatum|OUT)/.test(key)).map(([key, [n, w]]) => `${key}: deg ${(n / cnt[key.split(' <- ')[0]]).toFixed(1)} w ${(w / cnt[key.split(' <- ')[0]]).toFixed(1)}`);
console.log(tag, k, 'cells', JSON.stringify(cnt)); rows.sort().forEach(r => console.log('  ', r));
