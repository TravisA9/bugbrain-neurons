// node sw/scarm.js <k> <variant> <tag>: grow (seqchoice order2, as r42 k); per output arm: striatal presyn cells (index in striatum order) and weights -> sw/out/sa_<tag>_<k>.json
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag] = process.argv.slice(2), k = +k0;
const task = { name: 'r42', env: 'seqchoice', params: { source: 'order2', nSyms: 1000 } };
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { if (!kv) continue; const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const nV = Math.max(64, k + 1), p = L.seedPlan({ valGrowths: nV, valArenas: nV }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const b = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], b, env), net = a.net, N = net.N;
const names = (b.regions || []).map(r => r.name), h1 = b.nIn + b.nHid, isStr = q => q >= b.nIn && q < h1 && names[b.region[q]] === 'striatum';
const sIdx = new Map(); let n = 0; for (let q = 0; q < N; q++) if (isStr(q)) sIdx.set(q, n++);
const arms = Array.from({ length: N - h1 }, () => ({ pre: [], w: [], other: 0 }));
for (let s2 = 0; s2 < net.posts.length; s2++) { const po = net.posts[s2], pr = net.pres[s2]; if (po >= h1) { if (sIdx.has(pr)) { arms[po - h1].pre.push(sIdx.get(pr)); arms[po - h1].w.push(net.ws[s2]); } else arms[po - h1].other += net.ws[s2]; } }
const inS = new Map(); for (let s2 = 0; s2 < net.posts.length; s2++) { const po = net.posts[s2]; if (!sIdx.has(po)) continue; const pr = net.pres[s2], w = net.ws[s2]; let e = inS.get(po); if (!e) inS.set(po, e = { sE: 0, sI: 0, sEw: 0, sIw: 0, cx: 0, cxw: 0, oth: 0 }); if (sIdx.has(pr)) { if (w < 0) { e.sI++; e.sIw += w; } else { e.sE++; e.sEw += w; } } else if (pr >= b.nIn && pr < h1) { e.cx++; e.cxw += w; } else e.oth += w; }
const inv = new Map([...sIdx].map(([q, i]) => [i, q])); for (const A of arms) { const z = { sE: 0, sI: 0, sEw: 0, sIw: 0, cx: 0, cxw: 0, oth: 0 }; for (const i of A.pre) { const e = inS.get(inv.get(i)) || {}; for (const kk in z) z[kk] += (e[kk] || 0) / A.pre.length; } A.in = z; }
const all = { sE: 0, sI: 0, sEw: 0, sIw: 0, cx: 0, cxw: 0, oth: 0 }; for (const e of inS.values()) for (const kk in all) all[kk] += e[kk] / inS.size;
console.log('ALL', JSON.stringify(Object.fromEntries(Object.entries(all).map(([a2, v]) => [a2, +v.toFixed(1)]))));
for (const A of arms) console.log('ARM', A.pre.length, JSON.stringify(Object.fromEntries(Object.entries(A.in).map(([a2, v]) => [a2, +v.toFixed(1)]))));
const map = a.task.map; fs.writeFileSync(`sw/out/sa_${tag}_${k}.json`, JSON.stringify({ arms, map, thresh: Array.from({ length: N - h1 }, (_, m) => b.thresh ? b.thresh[h1 + m] : null) }));
console.log(tag, k, arms.map(A => `${A.pre.length}:${A.w.reduce((x, y) => x + y, 0).toFixed(0)}`).join(' '));
