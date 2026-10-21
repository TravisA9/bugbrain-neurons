// R82 forgetting / readout / representation diagnostic on the book corpus (frozen tests).
//   node run/r82_fx.js <arm AB|ABr|ABc|AA> <growth k> [variant k=v,...] [N=10000] [M=1500]
// One brain (deepURSx3) learns passage A (N chars of TRAIN), then a frozen test block (plasticity off): A-test (M chars from inside A),
// B-test (M chars of passage B), U (M unseen HELD chars), then phase 2 (AB: B, N chars; ABr: B with a 10-char A snippet after every
// 100 B chars = 1 replayed per 10 new; ABc: B, 1.1 N chars = equal-compute control; AA: A again), then the same frozen tests.
// After phase 2 also a frozen readout block: R (frozen pass over 4000 chars of the trained text = readout TRAIN) and U2 (M unseen):
// readouts fit on R only, tested on U2: native output, a local delta-rule readout (one pass, w += lr x (t - y)) and an oracle softmax
// regression (AdaGrad, 4 epochs, as r62_ana), on cell groups (all hidden / mixing / pred cells), observation window = read window or slot.
// Representation (frozen U2): mixing-code Jaccard within the same (prev, cur) context vs between contexts, empty-code share, silent mixing cells.
const L = require('./lib.js'), SA = L.SA;
const [arm, kS, variant = 'base', NS = 10000, MS = 1500] = process.argv.slice(2), k = +kS, N = +NS, M = +MS, plan = 'deepURSx3';
const gc = L.serialize(L.startGenome(plan)), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base') for (const kv of variant.split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const B = SA.book, A = B.ALPHA, IDX = new Map(A.map((c, i) => [c, i])), TR = B.TRAIN, HE = B.HELD;
const rng = SA.mulberry32((0x82f0 ^ k * 2654435761) >>> 0), pick = (S, n) => { const p = (rng() * (S.length - n - 1)) | 0; return S.slice(p, p + n); };
const sA = pick(TR, N); let sB = pick(TR, Math.ceil(1.1 * N)); const sU = pick(HE, M), sU2 = pick(HE, M), aTest = sA.slice((N - M) >> 1, ((N - M) >> 1) + M), bTest = sB.slice(0, M);
let ph2 = arm === 'AA' ? sA : arm === 'ABc' ? sB : sB.slice(0, N);
if (arm === 'ABr') { let s = ''; for (let i = 0; i < N; i += 100) { s += sB.slice(i, i + 100); const p = (rng() * (N - 10)) | 0; s += sA.slice(p, p + 10); } ph2 = s; }
const tr2 = arm === 'AA' ? sA : ph2; const RS = +(process.env.BB_RS || 4000), rText = (tr2 + sB + sA).slice(0, Math.max(RS, 0)).length >= RS && RS > tr2.length ? (tr2 + sA).slice(0, RS) : tr2.slice(Math.max(0, tr2.length - RS));
const phases = [['A', sA, 1], ['tA1', aTest, 0], ['tB1', bTest, 0], ['tU1', sU, 0], ['P2', ph2, 1], ['tA2', aTest, 0], ['tB2', bTest, 0], ['tU2', sU, 0], ['R', rText, 0], ['U2', sU2, 0]];
const stream = phases.map(p => p[1]).join(''), bounds = []; { let o = 0; for (const p of phases) { bounds.push([p[0], o, o + p[1].length, p[2]]); o += p[1].length; } }
const task = { name: 'r82', env: 'seq', params: { source: 'book', nSyms: stream.length - 1, evalSyms: 0 } };
const env = L.setupTask(task), nV = Math.max(64, k + 1), sp = L.seedPlan({ valGrowths: nV, valArenas: nV }, 0, true);
const brain = SA.growCell(L.deserialize(gc).g, { seed: sp.growSeeds[k], spec: env.spec }), a = new SA.Agent(L.deserialize(gc).g, sp.arenaSeeds[k], brain, env); L.dropDense(brain);
const T = a.task; for (let i = 0; i < stream.length; i++) T.seq[i] = IDX.get(stream[i]);
const nIn = brain.nIn, nHid = brain.nHid, o0 = nIn + nHid, mix = brain.mix, ct = brain.cellType, rg = brain.region;
const isMix = i => !!(mix && mix[nIn + i]), isPred = i => rg[nIn + i] === 0 && !isMix(i) && ct[nIn + i] - 16 === 1;
const cS = new Uint16Array(nHid), cR = new Uint16Array(nHid), rec = { R: [], U2: [] }; let cur = null, steps = 0, lastPos = 0;
const hook = n => { steps++; if (!cur) return; const s = n.spk, inR = T.inRead; for (let q = 0; q < n.nSpk; q++) { const i = s[q]; if (i >= nIn && i < o0) { cS[i - nIn]++; if (inR) cR[i - nIn]++; } } };
const was = SA.params.plasticity, R = { arm, k, variant, N, M, nHid };
try { for (const [nm, b0, b1, learn] of bounds) { SA.params.plasticity = !!learn; cur = rec[nm] || null;
    while (!a.done && T.pos < b1 && T.pos < stream.length - 1) { a.tick(hook);
      if (T.pos !== lastPos) { if (cur) { const sl = [], rd = []; for (let i = 0; i < nHid; i++) { if (cS[i]) sl.push(i); if (cR[i]) rd.push(i); } cur.push({ t: lastPos, sl, rd }); cS.fill(0); cR.fill(0); } lastPos = T.pos; } }
    const h = T.hits.slice(b0, Math.min(b1, T.hits.length) - 1); R[nm] = +(h.reduce((x, y) => x + y, 0) / Math.max(1, h.length)).toFixed(4); } }
finally { SA.params.plasticity = was; }
R.stepsPerSym = +(steps / Math.max(1, T.pos)).toFixed(2);
const seq = T.seq, K = A.length, nat = t => T.hits[t];
// readouts
const groups = { all: () => true, mixing: isMix, pred: isPred };
function oracle(trn, tst, sel, win) { const W = new Float32Array(nHid * K), G2 = new Float32Array(nHid * K).fill(1e-6), b = new Float32Array(K), z = new Float32Array(K), lr = 0.5;
  const zf = c => { z.set(b); for (const i of c) if (sel(i)) { const r = i * K; for (let q = 0; q < K; q++) z[q] += W[r + q]; } };
  for (let ep = 0; ep < 4; ep++) for (let q = 0; q < trn.length; q++) { const e = trn[(q * 7919 + ep * 104729) % trn.length], c = e[win], y = seq[e.t + 1]; zf(c);
    let m = -1e9; for (let j = 0; j < K; j++) if (z[j] > m) m = z[j]; let s = 0; for (let j = 0; j < K; j++) { z[j] = Math.exp(z[j] - m); s += z[j]; }
    for (let j = 0; j < K; j++) { const g = z[j] / s - (j === y ? 1 : 0); b[j] -= 0.05 * g; z[j] = g; }
    for (const i of c) if (sel(i)) { const r = i * K; for (let j = 0; j < K; j++) { const g = z[j] + 1e-4 * W[r + j]; G2[r + j] += g * g; W[r + j] -= lr * g / Math.sqrt(G2[r + j]); } } }
  let h = 0; for (const e of tst) { zf(e[win]); let bk = 0; for (let j = 1; j < K; j++) if (z[j] > z[bk]) bk = j; if (bk === seq[e.t + 1]) h++; } return +(h / tst.length).toFixed(4); }
function local(trn, tst, sel, win) { // one online pass, local delta rule on binary activity: w_ik += lr (t_k - y_k), y = clipped linear prediction; prediction = argmax
  const W = new Float32Array(nHid * K), z = new Float32Array(K), lr = 0.5;   // (normalised LMS: step lr / active inputs)
  const zf = c => { z.fill(0); for (const i of c) if (sel(i)) { const r = i * K; for (let q = 0; q < K; q++) z[q] += W[r + q]; } };
  for (const e of trn) { const c = e[win], y = seq[e.t + 1]; zf(c); let nA = 0; for (const i of c) if (sel(i)) nA++; const st = lr / Math.max(1, nA); for (const i of c) if (sel(i)) { const r = i * K; for (let j = 0; j < K; j++) { const yj = Math.min(1, Math.max(0, z[j])); W[r + j] += st * ((j === y ? 1 : 0) - yj); } } }
  let h = 0; for (const e of tst) { zf(e[win]); let bk = 0; for (let j = 1; j < K; j++) if (z[j] > z[bk]) bk = j; if (bk === seq[e.t + 1]) h++; } return +(h / tst.length).toFixed(4); }
const trn = rec.R.slice(2), tst = rec.U2.slice(2);
R.readout = { native_U2: +(tst.reduce((s, e) => s + nat(e.t), 0) / tst.length).toFixed(4) };
{ const tb = new Map(); for (const e of trn) { const key = seq[e.t]; if (!tb.has(key)) tb.set(key, new Float64Array(K)); tb.get(key)[seq[e.t + 1]]++; }
  let h = 0; for (const e of tst) { const r = tb.get(seq[e.t]); let bk = 0; if (r) for (let j = 1; j < K; j++) if (r[j] > r[bk]) bk = j; if (bk === seq[e.t + 1]) h++; } R.readout.bigramR_U2 = +(h / tst.length).toFixed(4); }
for (const g in groups) for (const w of ['rd', 'sl']) { R.readout[`oracle_${g}_${w}`] = oracle(trn, tst, groups[g], w); R.readout[`local_${g}_${w}`] = local(trn, tst, groups[g], w); }
// representation on U2 (slot window, mixing cells)
{ const codes = tst.map(e => ({ c: new Set(e.sl.filter(isMix)), key: seq[e.t - 1] + ',' + seq[e.t] })), J = (x, y) => { if (!x.size && !y.size) return 1; let n = 0; for (const v of x) if (y.has(v)) n++; return n / (x.size + y.size - n); };
  let ws = 0, wn = 0, bs = 0, bn = 0; for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < Math.min(codes.length, i + 400); j++) { const s = J(codes[i].c, codes[j].c); if (codes[i].key === codes[j].key) { ws += s; wn++; } else { bs += s; bn++; } }
  const nMix = mix ? Array.from({ length: nHid }, (_, i) => isMix(i)).filter(Boolean).length : 0, ever = new Set(); for (const c of codes) for (const v of c.c) ever.add(v);
  R.rep = { jWithin: +(ws / Math.max(1, wn)).toFixed(4), jBetween: +(bs / Math.max(1, bn)).toFixed(4), sep: +((ws / Math.max(1, wn)) - (bs / Math.max(1, bn))).toFixed(4), emptyShare: +(codes.filter(c => !c.c.size).length / codes.length).toFixed(4), meanActiveMix: +(codes.reduce((s, c) => s + c.c.size, 0) / codes.length).toFixed(2), silentMixFrac: nMix ? +(1 - ever.size / nMix).toFixed(4) : null, nMix }; }
console.log(JSON.stringify(R));
