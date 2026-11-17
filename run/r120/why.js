// why are the dense cortex symbol cells dense? incoming grown weight by source class, dense vs sparse cells of the same group
process.chdir('/workspace/bb/run'); const L = require('/workspace/bb/run/lib.js'), SA = L.SA, fs = require('fs');
const k = +process.argv[2], b0 = process.argv[3], variant = fs.readFileSync('/workspace/v47.txt', 'utf8').trim() + ',P.granUtility=2,P.granExact=1,P.granCo=1';
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.replace(/^,/, '').split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = isNaN(+v) ? v : +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const task = { name: 'x', env: 'seq', params: { source: 'book', nSyms: 10000, evalSyms: 1000 } };
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), env = L.setupTask(task), b = SA.growCell(L.deserialize(gc).g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(L.deserialize(gc).g, p.arenaSeeds[k], b, env);
const LIFE = +(process.env.LIFE || 0); if (LIFE) { const T = a.task; while (!a.done && T.pos < LIFE) a.tick(); }
const n = a.net, nIn = b.nIn, nH = b.nHid, M = JSON.parse(fs.readFileSync(b0 + '.json')), rd = (f, T) => { const B = fs.readFileSync(f); return new T(B.buffer.slice(B.byteOffset, B.byteOffset + B.length)); };
const off = rd(b0 + '.off', Uint32Array), ix = rd(b0 + '.ix', Uint16Array), nS = off.length - 1, rate = new Float64Array(nH); for (let q = 0; q < ix.length; q++) rate[ix[q]]++; for (let i = 0; i < nH; i++) rate[i] /= nS;
const lab = i => { if (i < nIn) return 'in:' + (env.spec.inputs[i] ? env.spec.inputs[i].group : '?'); if (i >= nIn + nH) return 'out'; if (b.gran[i]) return 'gran'; const r = b.regions[b.region[i]].name, t = b.typeInfo[b.cellType[i] - 16].label.replace(/^tag | cells$/g, ''); return r + '/' + t; };
const inh = new Uint8Array(n.N); for (let i = 0; i < n.N; i++) for (let q = n.start[i]; q < n.start[i + 1]; q++) if (n.w0[q] < 0) { inh[i] = 1; break; }
const tgtIds = new Set();
const acc = {}; const add = (grp, j, w) => { const key = lab(j) + (inh[j] ? '(inh)' : ''); const e = acc[grp] || (acc[grp] = { cells: new Set(), src: {} }); e.src[key] = (e.src[key] || 0) + w; };
const tgt = i => { const h = i - nIn; if (h < 0 || h >= nH || b.gran[i]) return null; const l = lab(i); if (l !== 'cortex/symbol') return null; return rate[h] > 0.5 ? 'dense' : 'sparse'; };
for (let i = 0; i < n.N; i++) for (let q = n.start[i]; q < n.start[i + 1]; q++) { const j = n.posts[q], g = tgt(j); if (g) { add(g, i, process.env.WS ? n.ws[q] : n.w0[q]); acc[g].cells.add(j); } }
const out = {}; for (const [g, e] of Object.entries(acc)) { const c = e.cells.size; out[g] = { cells: c, inh: [...e.cells].filter(j => inh[j]).length, thr: +([...e.cells].reduce((s, j) => s + b.thresh[j], 0) / c).toFixed(2), perCell: Object.fromEntries(Object.entries(e.src).map(([s, w]) => [s, +(w / c).toFixed(2)]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 10)) }; }
console.log(JSON.stringify(out, null, 1));
