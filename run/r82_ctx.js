// R82 context diagnostic: node run/r82_ctx.js <growth k> [variant] [plan=deepURSx3] [N=10000] [R=8000] [U=2000]
// One brain learns N chars of book TRAIN; then learning is frozen and it reads R more TRAIN chars (readout fit set) and U HELD chars (test).
// Per region (and all hidden / mixing cells), oracle softmax readouts (AdaGrad, 4 epochs; read window, i.e. the brain's own decision window)
// decode the letter t-k back (k = 0..6) and the next letter; fit on R, tested on U. Baselines: n-gram counters (orders 1-4) fit on all
// TRAIN chars this brain saw (N + R), tested on U; and the brain's native accuracy on U.
const L = require('./lib.js'), SA = L.SA;
const [kS, variant = 'base', plan = 'deepURSx3', NS = 10000, RS = 8000, US = 2000] = process.argv.slice(2), k = +kS, N = +NS, RN = +RS, UN = +US;
const gc = L.serialize(L.startGenome(plan)), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base') for (const kv of variant.split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const B = SA.book, A = B.ALPHA, K = A.length, IDX = new Map(A.map((c, i) => [c, i])), TR = B.TRAIN, HE = B.HELD;
const rng = SA.mulberry32((0x82c7 ^ k * 2654435761) >>> 0), p0 = (rng() * (TR.length - N - RN - 2)) | 0, h0 = (rng() * (HE.length - UN - 2)) | 0;
const stream = TR.slice(p0, p0 + N + RN) + HE.slice(h0, h0 + UN);
const task = { name: 'r82c', env: 'seq', params: { source: 'book', nSyms: stream.length - 1, evalSyms: 0 } };
const env = L.setupTask(task), nV = Math.max(64, k + 1), sp = L.seedPlan({ valGrowths: nV, valArenas: nV }, 0, true);
const brain = SA.growCell(L.deserialize(gc).g, { seed: sp.growSeeds[k], spec: env.spec }), a = new SA.Agent(L.deserialize(gc).g, sp.arenaSeeds[k], brain, env); L.dropDense(brain);
const T = a.task; for (let i = 0; i < stream.length; i++) T.seq[i] = IDX.get(stream[i]);
const nIn = brain.nIn, nHid = brain.nHid, o0 = nIn + nHid, rg = brain.region, mix = brain.mix, names = brain.regions.map(r => r.name);
const nT = nHid + brain.nOut, cR = new Uint16Array(nT), recs = []; let lastPos = 0, on = false;
const hook = n => { if (!on || !T.inRead) return; const s = n.spk; for (let q = 0; q < n.nSpk; q++) { const i = s[q]; if (i >= nIn && i < o0 + brain.nOut) cR[i - nIn]++; } };
const was = SA.params.plasticity;
try { while (!a.done && T.pos < stream.length - 1) { if (T.pos >= N) { SA.params.plasticity = false; on = true; } a.tick(hook);
    if (T.pos !== lastPos) { if (on && lastPos >= N) { const c = []; for (let i = 0; i < nT; i++) if (cR[i]) c.push(i); recs.push({ t: lastPos, c: Int32Array.from(c) }); } cR.fill(0); lastPos = T.pos; } } }
finally { SA.params.plasticity = was; }
const seq = T.seq, trn = recs.filter(e => e.t >= N + 8 && e.t < N + RN - 1), tst = recs.filter(e => e.t >= N + RN + 8 && e.t < stream.length - 1);
function oracle(sel, tgt) { const W = new Float32Array(nT * K), G2 = new Float32Array(nT * K).fill(1e-6), b = new Float32Array(K), z = new Float32Array(K), lr = 0.5;
  const zf = c => { z.set(b); for (const i of c) if (sel[i]) { const r = i * K; for (let q = 0; q < K; q++) z[q] += W[r + q]; } };
  for (let ep = 0; ep < 4; ep++) for (let q = 0; q < trn.length; q++) { const e = trn[(q * 7919 + ep * 104729) % trn.length], y = tgt(e.t); zf(e.c);
    let m = -1e9; for (let j = 0; j < K; j++) if (z[j] > m) m = z[j]; let s = 0; for (let j = 0; j < K; j++) { z[j] = Math.exp(z[j] - m); s += z[j]; }
    for (let j = 0; j < K; j++) { const g = z[j] / s - (j === y ? 1 : 0); b[j] -= 0.05 * g; z[j] = g; }
    for (const i of e.c) if (sel[i]) { const r = i * K; for (let j = 0; j < K; j++) { const g = z[j] + 1e-4 * W[r + j]; G2[r + j] += g * g; W[r + j] -= lr * g / Math.sqrt(G2[r + j]); } } }
  let h = 0; for (const e of tst) { zf(e.c); let bk = 0; for (let j = 1; j < K; j++) if (z[j] > z[bk]) bk = j; if (bk === tgt(e.t)) h++; } return +(h / tst.length).toFixed(4); }
const R = { k, variant, plan, nHid, regions: {} };
R.native = +(tst.reduce((s, e) => s + T.hits[e.t], 0) / tst.length).toFixed(4);
for (const n of [1, 2, 3, 4]) { const tab = new Map(), key = t => seq.slice(t - n + 1, t + 1).join(','); for (let t = n; t < N + RN - 1; t++) { const kk = key(t); if (!tab.has(kk)) tab.set(kk, new Float64Array(K)); tab.get(kk)[seq[t + 1]]++; }
  (R.tabs = R.tabs || [])[n] = tab; let h = 0; for (const e of tst) { let bk = -1; for (let m = n; m >= 1 && bk < 0; m--) { const r = R.tabs[m].get(seq.slice(e.t - m + 1, e.t + 1).join(',')); if (r) { bk = 0; for (let j = 1; j < K; j++) if (r[j] > r[bk]) bk = j; } } if (bk === seq[e.t + 1]) h++; } R['gram' + (n + 1)] = +(h / tst.length).toFixed(4); }
delete R.tabs;
const gr = brain.gran, isG = i => !!(gr && gr[nIn + i]); R.granStats = brain.granStats || null;
const groups = { all: i => i < nHid, noGran: i => i < nHid && !isG(i), mixing: i => !!(mix && mix[nIn + i]) }; if (gr) groups.gran = i => i < nHid && isG(i); if (process.env.BB_CLS) { const ct = brain.cellType; for (const r of [0, 1]) for (let c = 0; c < 16; c++) groups['r' + r + 'c' + c] = i => rg[nIn + i] === r && ct[nIn + i] === 16 + c && !(mix && mix[nIn + i]) && !isG(i); }
names.forEach((nm, r) => { groups[nm] = i => i < nHid && rg[nIn + i] === r && !(mix && mix[nIn + i]) && !isG(i); });
groups.out = i => i >= nHid; groups.predOut = i => i >= nHid || (rg[nIn + i] === 0 && brain.cellType[nIn + i] === 17 && !(mix && mix[nIn + i]) && !isG(i)); groups.pred = i => i < nHid && rg[nIn + i] === 0 && brain.cellType[nIn + i] === 17 && !(mix && mix[nIn + i]) && !isG(i);
for (const g in groups) { const sel = new Uint8Array(nT); let nc = 0; for (let i = 0; i < nT; i++) if (groups[g](i)) { sel[i] = 1; nc++; } if (!nc) continue;
  const o = R.regions[g] = { cells: nc, act: +(tst.reduce((s, e) => s + e.c.reduce((x, i) => x + sel[i], 0), 0) / tst.length).toFixed(1) };
  o.next = oracle(sel, t => seq[t + 1]); for (let lag = 0; lag <= 6; lag++) o['b' + lag] = oracle(sel, t => seq[t - lag]); }
console.log(JSON.stringify(R));
