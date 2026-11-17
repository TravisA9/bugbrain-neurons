// which non-granule cells are dense and why: regrow the same brain, map hidden index -> region/type, per-symbol selectivity, inputs
process.chdir('/workspace/bb/run'); const L = require('/workspace/bb/run/lib.js'), SA = L.SA, fs = require('fs');
const k = +process.argv[2], b0 = process.argv[3], variant = fs.readFileSync('/workspace/v47.txt', 'utf8').trim();
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.replace(/^,/, '').split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = isNaN(+v) ? v : +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), env = L.setupTask({ name: 'x', env: 'seq', params: { source: 'book', nSyms: 1000 } }), b = SA.growCell(L.deserialize(gc).g, { seed: p.growSeeds[k], spec: env.spec });
const M = JSON.parse(fs.readFileSync(b0 + '.json')), rd = (f, T) => { const B = fs.readFileSync(f); return new T(B.buffer.slice(B.byteOffset, B.byteOffset + B.length)); };
const off = rd(b0 + '.off', Uint32Array), ix = rd(b0 + '.ix', Uint16Array), { nH, K, seq } = M, nS = off.length - 1, nIn = b.nIn;
const rate = new Float64Array(nH), bySym = new Float64Array(nH * K), symN = new Float64Array(K);
for (let t = 0; t < nS; t++) { const y = seq[t]; symN[y]++; for (let q = off[t]; q < off[t + 1]; q++) { rate[ix[q]]++; bySym[ix[q] * K + y]++; } }
const grp = i => { const n = nIn + i; return b.regions[b.region[n]].name + '/' + b.typeInfo[b.cellType[n] - 16].label.replace(/^tag | cells$/g, '') + (b.slow && b.slow[n] ? '/slow' : ''); };
// incoming synapses by source group
const inSrc = i => { const n = nIn + i, m = {}; if (b.W && b.P) { } return m; };
const R = {}; for (let i = 0; i < nH; i++) { if (b.gran[nIn + i]) continue; const g = grp(i), r = rate[i] / nS; if (r <= 0.5) continue; let mn = 1, mx = 0; for (let y = 0; y < K; y++) if (symN[y] > 50) { const c = bySym[i * K + y] / symN[y]; mn = Math.min(mn, c); mx = Math.max(mx, c); }
  const e = R[g] || (R[g] = { n: 0, rate: 0, minSym: 0, maxSym: 0, thr: 0, leak: 0 }); e.n++; e.rate += r; e.minSym += mn; e.maxSym += mx; e.thr += b.thresh[nIn + i]; e.leak += b.leak[nIn + i]; }
for (const e of Object.values(R)) for (const f of ['rate', 'minSym', 'maxSym', 'thr', 'leak']) e[f] = +(e[f] / e.n).toFixed(3);
// healthy comparison: same group, rate <= 0.5
const H = {}; for (let i = 0; i < nH; i++) { if (b.gran[nIn + i]) continue; const g = grp(i); if (!R[g] || rate[i] / nS > 0.5) continue; const e = H[g] || (H[g] = { n: 0, rate: 0, thr: 0 }); e.n++; e.rate += rate[i] / nS; e.thr += b.thresh[nIn + i]; }
for (const e of Object.values(H)) { e.rate = +(e.rate / e.n).toFixed(3); e.thr = +(e.thr / e.n).toFixed(2); }
console.log(JSON.stringify({ k, dense: R, sameGroupSparse: H, keys: Object.keys(b).filter(x => /^[WPC]$|syn|pre|post/i.test(x)) }));
