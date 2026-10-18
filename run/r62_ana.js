// R61 offline analysis of a recorded book life (run/r61_rec.js): node run/r61_ana.js <prefix> [trainSlots=20000] [epochs=4]
// (1) the brain's own accuracy: late train part vs held-out; (2) data-matched n-gram counters (fit on this life's TRAIN symbols, tested on
// its held-out part); (3) ORACLE linear readouts: softmax regression on the recorded hidden-cell states (binary: spiked in the slot), fit on
// the last trainSlots train slots, tested on the held-out slots, for target = next symbol and probes = current / 1 back / 2 back symbol,
// per cell group (all hidden, cortex non-mixing, mixing, context chain); (4) capacity: distinct mixing-cell codes vs letter pairs.
const fs = require('fs'), [pre, TS = 20000, EP = 4] = process.argv.slice(2), M = JSON.parse(fs.readFileSync(pre + '.json')), B = fs.readFileSync(pre + '.bin');
const K = M.K, seq = M.seq, nH = M.nHid, S = [], OC = []; let o = 0;
while (o < B.length) { const na = B.readUInt16LE(o); o += 2; const c = new Uint16Array(na); for (let j = 0; j < na; j++) { c[j] = B.readUInt16LE(o); o += 3; } OC.push(B.subarray(o, o + 24)); o += 24; S.push(c); }
const T = S.length, hf = M.heldFrom, held = [], tr = []; for (let t = 2; t < T - 1; t++) (t >= hf ? held : tr).push(t);
const trL = tr.slice(-TS), acc = (xs, f) => xs.filter(f).length / xs.length, R = {};
R.slots = T; R.meanActive = S.reduce((s, c) => s + c.length, 0) / T;
R.brainHeld = acc(held, t => M.hits[t]); R.brainTrainLast2k = acc(tr.slice(-2000), t => M.hits[t]); R.brainTrainFirst2k = acc(tr.slice(0, 2000), t => M.hits[t]);
// (2) n-gram counters on this life's train symbols (contexts ending at t predict seq[t+1]); backoff to the longest seen context
for (const n of [0, 1, 2, 3, 4]) { const tab = new Map(); const key = (t) => seq.slice(t - n + 1, t + 1).join(',');
  for (const t of tr) { if (t - n + 1 < 0) continue; const k = key(t); if (!tab.has(k)) tab.set(k, new Float64Array(K)); tab.get(k)[seq[t + 1]]++; }
  const lower = R['tabs'] || (R.tabs = []); lower[n] = tab;
  const pred = t => { for (let m = n; m >= 0; m--) { const k = seq.slice(t - m + 1, t + 1).join(','), r = R.tabs[m].get(k); if (r) { let b = 0; for (let j = 1; j < K; j++) if (r[j] > r[b]) b = j; return b; } } return 0; };
  R['ngram' + n + '_held'] = acc(held, t => pred(t) === seq[t + 1]); }
delete R.tabs;
// brain's own predictions (argmax of the read-window output counts, ties -> lowest index, as Dec.wta): what does it predict?
{ if (!M.pred) { console.error('no recorded predictions (old recording): skipping prediction analysis'); } const pr = M.pred ? (t => M.pred[t]) : (t => { const c = OC[t]; let b = 0; for (let k = 1; k < K; k++) if (c[k] > c[b]) b = k; return b; }), AL = ' .abcdefghiklmnoprstuvwy';
  const big = new Map(); for (const t of tr) { const k = seq[t]; if (!big.has(k)) big.set(k, new Float64Array(K)); big.get(k)[seq[t + 1]]++; }
  const bp = t => { const r = big.get(seq[t]); if (!r) return 0; let b = 0; for (let k = 1; k < K; k++) if (r[k] > r[b]) b = k; return b; };
  const hist = new Map(), th = new Map(); for (const t of held) { const p = pr(t); hist.set(p, (hist.get(p) || 0) + 1); th.set(seq[t + 1], (th.get(seq[t + 1]) || 0) + 1); }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => JSON.stringify(AL[k]) + ':' + (v / held.length).toFixed(2)).join(' ');
  R.brainPredTop = top(hist); R.truthTop = top(th); R.distinctPred = hist.size; R.silentHeld = acc(held, t => { let s = 0; for (let k = 0; k < K; k++) s += OC[t][k]; return s === 0; });
  R.agreeWithBigram = acc(held, t => pr(t) === bp(t)); R.brainAccWhenBigramRight = acc(held.filter(t => bp(t) === seq[t + 1]), t => pr(t) === seq[t + 1]);
  R.outCountAccHeld = acc(held, t => pr(t) === seq[t + 1]);
  if (M.rc) { const rc = M.rc, mx = t => Math.max(...rc[t]), tied = t => { const m = mx(t); return m === 0 || rc[t].filter(x => x === m).length > 1; };
    R.noAnswerHeld = acc(held, t => pr(t) < 0); R.silentReadHeld = acc(held, t => mx(t) === 0); R.tiedReadHeld = acc(held, t => mx(t) > 0 && tied(t));
    R.meanReadSpikes = held.reduce((s, t) => s + rc[t].reduce((a, b) => a + b, 0), 0) / held.length;
    const big1 = t => { const r = big.get(seq[t]); return r || new Float64Array(K); };
    // tie-break by the life's own bigram counts (an oracle prior) and pure bigram where silent: how much is lost in the decision
    R.accTieBreakBigram = acc(held, t => { const m = mx(t), r = big1(t); let b = -1, bv = -1; for (let k = 0; k < K; k++) if (rc[t][k] === m && r[k] > bv) { bv = r[k]; b = k; } return b === seq[t + 1]; });
    R.accTieBreakRandomUpper = acc(held, t => { const m = mx(t); if (m === 0) return false; const c = rc[t].map((x, k) => x === m ? k : -1).filter(k => k >= 0); return c.includes(seq[t + 1]); });
    R.accTieBreakRandomExpected = held.reduce((s, t) => { const m = mx(t); if (m === 0) return s; const c = rc[t].map((x, k) => x === m ? k : -1).filter(k => k >= 0); return s + (c.includes(seq[t + 1]) ? 1 / c.length : 0); }, 0) / held.length; } }

// (3) softmax readouts on sparse binary states
const tag = i => M.cellType[i] - 16, isMix = i => !!(M.mix && M.mix[i]), ctx0 = i => M.region[i] === 0 && !isMix(i);
// cortex tag 7 = current-symbol columns (plastic pre), mixing = conjunctions (plastic pre), tag 1 = taught prediction cells (plastic post, drive the outputs)
const groups = { readoutInputs: i => (ctx0(i) && tag(i) === 7) || isMix(i), cur7: i => ctx0(i) && tag(i) === 7, mixing: isMix, predCells: i => ctx0(i) && tag(i) === 1,
  context: i => /^context/.test(M.regions[M.region[i]] || ''), all: () => true };
const fit = (sel, target) => { const W = new Float32Array(nH * K), G2 = new Float32Array(nH * K).fill(1e-6), b = new Float32Array(K), z = new Float32Array(K), lr = 0.5;
  for (let ep = 0; ep < +EP; ep++) for (let q = 0; q < trL.length; q++) { const t = trL[(q * 7919 + ep * 104729) % trL.length], c = S[t], y = target(t); if (y < 0) continue;
    z.set(b); for (const i of c) if (sel(i)) { const r = i * K; for (let k = 0; k < K; k++) z[k] += W[r + k]; }
    let m = -1e9; for (let k = 0; k < K; k++) if (z[k] > m) m = z[k]; let s = 0; for (let k = 0; k < K; k++) { z[k] = Math.exp(z[k] - m); s += z[k]; }
    for (let k = 0; k < K; k++) { const gk = z[k] / s - (k === y ? 1 : 0); b[k] -= 0.05 * gk; z[k] = gk; }
    for (const i of c) if (sel(i)) { const r = i * K; for (let k = 0; k < K; k++) { const g = z[k] + 1e-4 * W[r + k]; G2[r + k] += g * g; W[r + k] -= lr * g / Math.sqrt(G2[r + k]); } } }
  const pr = t => { z.set(b); for (const i of S[t]) if (sel(i)) { const r = i * K; for (let k = 0; k < K; k++) z[k] += W[r + k]; } let bk = 0; for (let k = 1; k < K; k++) if (z[k] > z[bk]) bk = k; return bk; };
  return { held: +acc(held, t => pr(t) === target(t)).toFixed(3), train: +acc(trL.slice(-2000), t => pr(t) === target(t)).toFixed(3) }; };
const tg = { next: t => seq[t + 1], cur: t => seq[t], back1: t => seq[t - 1], back2: t => seq[t - 2] };
R.readout = {}; for (const gname of Object.keys(groups)) { const sel = groups[gname], ng = M.region.filter((r, i) => sel(i)).length; R.readout[gname] = { cells: ng };
  for (const tn of (gname === 'all' || gname === 'readoutInputs' ? ['next', 'cur', 'back1', 'back2'] : ['next', 'cur', 'back1'])) R.readout[gname][tn] = fit(sel, tg[tn]); }
// (4) capacity of the mixing layer: distinct binary codes vs (back1, cur) pairs over the train slots
if (M.mix) { const codes = new Map(), pairs = new Map(), joint = new Map(); for (const t of tr) { const c = Array.from(S[t]).filter(i => M.mix[i]).join(','), p = seq[t - 1] + ',' + seq[t];
    codes.set(c, (codes.get(c) || 0) + 1); pairs.set(p, (pairs.get(p) || 0) + 1); joint.set(c + '|' + p, (joint.get(c + '|' + p) || 0) + 1); }
  const H = m => { let n = 0, h = 0; for (const v of m.values()) n += v; for (const v of m.values()) h -= v / n * Math.log2(v / n); return h; };
  const mixActive = tr.reduce((s, t) => s + Array.from(S[t]).filter(i => M.mix[i]).length, 0) / tr.length;
  R.mixCapacity = { mixCells: M.mix.filter(x => x).length, meanActiveMix: +mixActive.toFixed(1), distinctCodes: codes.size, distinctPairs: pairs.size, H_pair: +H(pairs).toFixed(3), H_pair_given_code: +(H(joint) - H(codes)).toFixed(3), H_code_given_pair: +(H(joint) - H(pairs)).toFixed(3), emptyCodeShare: +((codes.get('') || 0) / tr.length).toFixed(3) }; }
R.ckpt = M.ckpt.filter((c, i) => i % 4 === 0 || i === M.ckpt.length - 1).map(c => ({ pos: c.pos, fracHi: +c.fracHi.toFixed(3), fracLo: +c.fracLo.toFixed(3), meanW: +c.meanW.toFixed(3), mixThr: c.mixThr ? +c.mixThr.mean.toFixed(2) : null, silentOut: +c.silentOut.toFixed(3), recentAcc: +c.recentAcc.toFixed(3) }));
for (const k in R) if (typeof R[k] === 'number') R[k] = +R[k].toFixed(3);
console.log(JSON.stringify(R, null, 1));
