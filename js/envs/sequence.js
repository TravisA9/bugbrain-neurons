/* =====================================================================
 * envs/sequence.js — 'Sequence prediction' (v9): learn TRANSITIONS within a lifetime.
 * A stream of symbols (one-hot) is shown one at a time. Every symbol slot:
 *   on   (onTicks):   the symbol's input is on; a GO/clock pulse in the first goTicks resets working memory
 *   hold (holdTicks): nothing is shown; the outputs are read (winner-take-all over spike counts) as the
 *                     prediction of the NEXT symbol.
 * Sources (a new random sequence rule every lifetime, so it must be LEARNED, not inherited):
 *   cycle   a random order of the K symbols, repeated (deterministic; optimal accuracy 1)
 *   markov  each symbol has one preferred successor (probability det), otherwise a random other symbol
 *   order2  a repeating pattern in which the successor depends on the previous TWO symbols
 *           (A B A C ...: after A comes B or C depending on what came before A)
 *   text    the tiny text corpus (19 characters), from a random start
 * Score: accuracy of the predictions; also accuracy in the first and last quarter of the lifetime (learning
 * curve), bits per symbol, against chance (1/K) and the optimal predictor (the true rule; for text: bigram).
 * ===================================================================== */
(function () {
'use strict';
const NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TXT = () => SpikingArena.text;
const isText = P => P.source === 'text' || P.source === 'fables';   // v19: 'fables' = the larger corpus (24 symbols)
function symbolsOf(P) { if (isText(P)) return (P.source === 'fables' ? TXT().FABLES_ALPHA : TXT().ALPHA).map(c => c === ' ' ? '␣' : c); return NAMES.slice(0, P.K | 0).split(''); }

function seqIO(P) {
  const names = symbolsOf(P), K = names.length, w = K > 12 ? 0.92 : 0.8, xs = spread(K, -w, w);
  const inputs = names.map((n, k) => ({ name: 'in_' + n, group: 'symbol', tag: 1, cls: 1, pos: [xs[k], 1], cue: true, topo: xs[k] }));
  if (!P.clock2) inputs.push({ name: 'go', group: 'go', tag: 3, cls: 4, pos: [0, 0.8], midline: true });
  else {   // v10 two-phase clock, BROADCAST across the tissue (like a diffuse thalamic / neuromodulatory clock):
           // GO2 (tag 8), then GO1 (tag 3, also during the first tick of the symbol), before every symbol
    const xc = spread(P.nClock, -0.9, 0.9);
    xc.forEach((x, i) => inputs.push({ name: 'go' + i, group: 'go', tag: 3, cls: 4, pos: [x, 0.95], midline: true, diffuse: true }));
    xc.forEach((x, i) => inputs.push({ name: 'goB' + i, group: 'go2', tag: 8, cls: 2, pos: [x, 0.97], midline: true, diffuse: true }));
    // v21 three-phase clock (clock3): GO3 one tick before GO2 (resets the two-back memory of the context region, plan predictK3)
    if (P.clock3) xc.forEach((x, i) => inputs.push({ name: 'goC' + i, group: 'go3', tag: 9, cls: 2, pos: [x, 0.99], midline: true, diffuse: true }));
  }
  const iTon = inputs.length;
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.9], midline: true, tonic: true });
  const outputs = names.map((n, k) => ({ name: 'next_' + n, group: 'choice', tag: 4, cls: 5 + (k % 3), pos: [xs[k], -1], bias: P.outBias, topo: xs[k] }));
  return { inputs, outputs, classes: ['cue', 'symbol', 'unused', 'tonic', 'go', 'out-A', 'out-B', 'out-C'],
           tagNames: ['tag 0', 'symbol', 'tag 2', 'go', 'output', 'tag 5', 'tonic', 'free'],
           juvenile: { waves: [names.map((n, k) => k)], pairs: null, waveGain: P.inGain, tonic: [[iTon, P.tonicCurrent]],
                       kicks: { chans: P.clock2 ? Array.from({ length: 2 * P.nClock }, (_, i) => K + i) : [K], p: 0.02, gain: P.inGain } } };
}
// the sequence rule of one lifetime: next(prev2, prev1, rng) and the optimal predictor's accuracy / bits
function makeRule(P, rng) {
  const K = symbolsOf(P).length, perm = () => { const a = Array.from({ length: K }, (_, i) => i); for (let i = K - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (P.source === 'cycle') { const o = perm(), nx = new Array(K); o.forEach((s, i) => nx[s] = o[(i + 1) % K]);
    return { first: o[0], next: (a, b) => nx[b], optAcc: 1, optBits: 0, firstOrderAcc: 1, desc: 'cycle ' + o.map(i => NAMES[i]).join('') }; }
  if (P.source === 'markov') { const o = perm(), pref = new Array(K); o.forEach((s, i) => pref[s] = o[(i + 1) % K]); const d = P.det;
    const bits = -(d * Math.log2(d) + (d < 1 ? (1 - d) * Math.log2((1 - d) / (K - 1)) : 0));
    return { first: o[0], next: (a, b) => { if (rng() < d) return pref[b]; let c = (rng() * (K - 1)) | 0; if (c >= pref[b]) c++; return c; }, optAcc: Math.max(d, (1 - d) / (K - 1)), optBits: bits, firstOrderAcc: d,
             desc: `markov: preferred successor with p=${d}` }; }
  if (P.source === 'order2') {   // pattern x0 y x0 z x1 y' x1 z' ...: successor of the shared symbol depends on the one before it
    const o = perm(), half = Math.max(1, Math.floor(K / 3)), pat = [];
    for (let i = 0; i < half; i++) { const a = o[i], b = o[half + i], c = o[(2 * half + i) % K]; pat.push(a, b, a, c); }
    let pos = 0; const seqNext = () => pat[(pos++) % pat.length];
    // accuracy of the best 1st-order predictor on this pattern (counted): after a shared symbol 50%
    return { first: seqNext(), next: () => seqNext(), optAcc: 1, optBits: 0, firstOrderAcc: (pat.length - half) / pat.length, desc: 'second-order pattern ' + pat.map(i => NAMES[i]).join(''), order2: true }; }
  if (P.source === 'order3') {   // v19: segments x_i Y Z s_i: after the shared pair Y Z the successor depends on the symbol THREE back
    const o = perm(), h = Math.max(1, Math.floor((K - 2) / 2)), Y = o[2 * h], Z = o[(2 * h + 1) % K], pat = [];
    for (let i = 0; i < h; i++) pat.push(o[i], Y, Z, o[h + i]);
    const acc = k => { const tab = new Map(); for (let i = 0; i < pat.length; i++) { const key = Array.from({ length: k }, (_, j) => pat[(i - j + pat.length * 4) % pat.length]).join(','), y = pat[(i + 1) % pat.length];
      if (!tab.has(key)) tab.set(key, new Map()); const m = tab.get(key); m.set(y, (m.get(y) || 0) + 1); } let hit = 0; for (const m of tab.values()) hit += Math.max(...m.values()); return hit / pat.length; };
    let pos = 0; const seqNext = () => pat[(pos++) % pat.length];
    return { first: seqNext(), next: () => seqNext(), optAcc: 1, optBits: 0, firstOrderAcc: acc(1), secondOrderAcc: acc(2), desc: `third-order pattern ${pat.map(i => NAMES[i]).join('')} (order-2 limit ${(100 * acc(2)).toFixed(0)}%)`, order3: true }; }
  // text
  const T = TXT();
  if (P.source === 'fables') { const C = T.FABLES, IDX = new Map(T.FABLES_ALPHA.map((c, i) => [c, i])), B = T.FABLES_BIGRAM; let pos = (rng() * C.length) | 0;
    return { first: IDX.get(C[pos]), next: () => IDX.get(C[(++pos) % C.length]), optAcc: B.acc, optBits: B.bpc, firstOrderAcc: B.acc,
             unigramAcc: B.uniAcc, unigramBits: B.uniBpc, desc: `fables corpus (${C.length} characters; corpus bigram ${(100 * B.acc).toFixed(0)}%)` }; }
  const C = T.CORPUS, IDX = new Map(T.ALPHA.map((c, i) => [c, i])); let pos = (rng() * C.length) | 0;
  return { first: IDX.get(C[pos]), next: () => IDX.get(C[(++pos) % C.length]), optAcc: T.BIGRAM.acc, optBits: T.BIGRAM.bpc, firstOrderAcc: T.BIGRAM.acc,
           unigramAcc: T.BASE_ACC, unigramBits: T.BASE_BPC, desc: 'text corpus (optimal 1-character predictor = bigram)' };
}

// v10: CALIBRATED READOUT for bits per symbol. The raw read-out (softmax with a fixed temperature) is not a
// calibrated probability. Two online calibrators turn spike counts into probabilities, learning only from the
// past (follow-the-leader over a small grid: at each symbol the setting with the lowest log loss SO FAR is used):
//   soft:  p ~ (1 - eps) softmax(beta * counts) + eps / K   (beta = inverse temperature, eps = floor)
//   count: p ~ (counts + alpha) / (sum + K alpha)           (spike counts smoothed with a uniform prior)
// The prediction (accuracy) is unchanged: these only score how well the spike counts carry probabilities.
const CAL_SOFT = []; for (const b of [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3]) for (const e of [0.01, 0.03, 0.1, 0.3]) CAL_SOFT.push([b, e]);
const CAL_COUNT = [0.03, 0.1, 0.3, 1, 3, 10];
class Calib {
  constructor(K) { this.K = K; this.ls = new Float64Array(CAL_SOFT.length); this.lc = new Float64Array(CAL_COUNT.length); this.bitsSoft = 0; this.bitsCount = 0; this.n = 0; }
  pSoft(c, target, beta, eps) { let m = -Infinity; for (const v of c) m = Math.max(m, beta * v); let z = 0; for (const v of c) z += Math.exp(beta * v - m);
    return (1 - eps) * Math.exp(beta * c[target] - m) / z + eps / this.K; }
  pCount(c, target, a) { let s = 0; for (const v of c) s += v; return (c[target] + a) / (s + this.K * a); }
  add(c, target) {
    // v11: a brain with fewer prediction columns than symbols (e.g. env switched to text under an old population) -> missing columns count 0
    if (!(target < c.length)) { const k = Math.max(c.length, target + 1, this.K); c = Array.from({ length: k }, (_, i) => c[i] || 0); }
    const amin = a => { let j = 0; for (let i = 1; i < a.length; i++) if (a[i] < a[j]) j = i; return j; };
    const bs = amin(this.ls), bc = amin(this.lc);   // best so far (past only)
    this.bitsSoft += -Math.log2(this.pSoft(c, target, ...CAL_SOFT[bs])); this.bitsCount += -Math.log2(this.pCount(c, target, CAL_COUNT[bc])); this.n++;
    CAL_SOFT.forEach(([b, e], i) => { this.ls[i] += -Math.log2(this.pSoft(c, target, b, e)); });
    CAL_COUNT.forEach((a, i) => { this.lc[i] += -Math.log2(this.pCount(c, target, a)); });
  }
}

class SeqTask {
  constructor(seed, P, spec) {
    this.P = P; this.names = symbolsOf(P); this.K = this.names.length; this.rng = mulberry32((seed ^ 0x6a09e667) >>> 0);
    this.rule = makeRule(P, this.rng);
    const n = P.nSyms; this.seq = [this.rule.first]; for (let i = 1; i <= n; i++) this.seq.push(this.rule.next(this.seq[i - 2], this.seq[i - 1]));
    this.t = 0; this.pos = 0; this.phaseT = 0; this.c2 = P.clock2 ? (P.clock3 ? 3 : 2) : 0; this.slot = this.c2 + P.onTicks + P.holdTicks;   // clock2: two clock ticks (GO2, GO1) before the symbol
    this.counts = new Float64Array(this.K); this.lastCounts = new Float64Array(this.K);
    this.hits = []; this.ideal = []; this.cal = new Calib(this.K); this.idealBits = 0; this.tab = Array.from({ length: this.K }, () => new Float64Array(this.K)); this.correct = 0; this.n = 0; this.bits = 0; this.rewardLog = []; this.recent = []; this.horizon = n * this.slot;
  }
  get done() { return this.pos >= this.P.nSyms; }
  sense(ext) {
    const P = this.P, K = this.K;
    if (!this.c2 && this.phaseT < P.onTicks) ext[this.seq[this.pos]] = P.inGain;
    if (!this.c2) { if (this.phaseT < P.goTicks) ext[K] = P.goGain; ext[K + 1] = P.tonicCurrent; return; }
    // clock2 slot: [GO2: reset the previous-symbol memory] [GO1: copy memory -> previous-symbol memory, reset memory]
    //              [symbol (GO1 still on in its first goTicks)] [prediction window]
    //   (v21 clock3: one more tick first, [GO3: reset the two-back memory])
    const nc = P.nClock, c2 = this.c2, ph = this.phaseT - c2, c3 = c2 === 3;
    if (ph >= 0 && ph < P.onTicks) ext[this.seq[this.pos]] = P.inGain;
    if (this.phaseT === c2 - 1 || (ph >= 0 && ph < P.goTicks)) for (let i = 0; i < nc; i++) ext[K + i] = P.goGain;
    if (this.phaseT === c2 - 2) for (let i = 0; i < nc; i++) ext[K + nc + i] = P.goGain;
    if (c3 && this.phaseT === 0) for (let i = 0; i < nc; i++) ext[K + 2 * nc + i] = P.goGain;
    ext[K + (c3 ? 3 : 2) * nc] = P.tonicCurrent;
  }
  act(out) {
    const P = this.P, K = this.K; let ev = null;
    if (this.phaseT >= this.slot - P.readTicks) { const g = P.readIn || 0;   // v13 readIn > 0: graded decoder, adds readIn x the output cells' summed synaptic input
      if (g > 0 && out.input) for (let k = 0; k < K; k++) this.counts[k] += out.spikes[k] + g * Math.max(0, out.input[k]); else for (let k = 0; k < K; k++) this.counts[k] += out.spikes[k]; }
    this.phaseT++; this.t++;
    if (this.phaseT >= this.slot) {                 // end of the slot: the prediction of the next symbol
      const target = this.seq[this.pos + 1], k = Dec.wta(this.counts), ok = k === target;
      // ideal online 1st-order learner on the same stream: predicts the most frequent successor seen so far
      const row = this.tab[this.seq[this.pos]]; let bi = 0; for (let j = 1; j < K; j++) if (row[j] > row[bi]) bi = j;
      this.ideal.push(row[bi] > 0 && bi === target ? 1 : 0);
      { let rs = 0; for (const v of row) rs += v; this.idealBits += -Math.log2((row[target] + 0.5) / (rs + 0.5 * K)); }   // online bigram counter, add-1/2 (KT) estimate
      row[target]++; this.cal.add(this.counts, target);
      const p = Dec.softmax(this.counts, P.beta), q = (1 - 0.05) * p[target] + 0.05 / K;
      this.bits += -Math.log2(q); this.n++; if (ok) this.correct++; this.hits.push(ok ? 1 : 0);
      if (k === this.seq[this.pos]) this.nEcho = (this.nEcho || 0) + 1;   // v16 display: predictions equal to the current input
      this.recent.push([this.seq[this.pos], k, ok, target]); if (this.recent.length > 40) this.recent.shift();   // [input, predicted next, right?, actual next]
      this.rewardLog.push([this.t, ok ? 1 : 0]); this.lastCounts.set(this.counts);
      ev = { pos: ok ? 1 : 0, neg: ok ? 0 : P.wrongCost, pain: 0, reward: ok ? 1 : 0 };
      this.counts.fill(0); this.phaseT = 0; this.pos++;
    }
    return ev;
  }
  quarter(i) { const n = this.hits.length, a = Math.floor(n * i / 4), b = Math.floor(n * (i + 1) / 4); let s = 0; for (let j = a; j < b; j++) s += this.hits[j]; return b > a ? s / (b - a) : 0; }
  idealAcc(q) { const h = this.ideal, n = h.length, a = q == null ? 0 : Math.floor(n * q / 4), b = q == null ? n : Math.floor(n * (q + 1) / 4); let s = 0; for (let j = a; j < b; j++) s += h[j]; return b > a ? s / (b - a) : 0; }
  get accuracy() { return this.n ? this.correct / this.n : 0; }
  lastAcc(m) { const h = this.hits, a = Math.max(0, h.length - m); let s = 0; for (let j = a; j < h.length; j++) s += h[j]; return h.length > a ? s / (h.length - a) : 0; }   // v17: running 'last m' accuracy
  get bps() { return this.n ? this.bits / this.n : Math.log2(this.K); }
  score() { return this.accuracy; }
  fitness() { return 10 * (0.5 * this.accuracy + 0.5 * this.quarter(3)); }
  stats() { return { symbols: this.n, accuracy: this.accuracy, firstQuarter: this.quarter(0), lastQuarter: this.quarter(3), bits: this.bps,
                     chance: 1 / this.K, optimal: this.rule.optAcc, idealOnline: this.idealAcc(), idealLast: this.idealAcc(3), optBits: this.rule.optBits, firstOrder: this.rule.firstOrderAcc, unigram: this.rule.unigramAcc,
                     bitsSoft: this.cal.n ? this.cal.bitsSoft / this.cal.n : 0, bitsCount: this.cal.n ? this.cal.bitsCount / this.cal.n : 0, idealBits: this.n ? this.idealBits / this.n : 0, unigramBits: this.rule.unigramBits }; }
  statusLine() { return `symbol ${Math.min(this.pos + 1, this.P.nSyms)}/${this.P.nSyms} · accuracy ${(100 * this.accuracy).toFixed(0)}% · last 100 ${(100 * this.lastAcc(100)).toFixed(0)}% (first quarter ${(100 * this.quarter(0)).toFixed(0)}%, last ${(100 * this.quarter(3)).toFixed(0)}%) · chance ${(100 / this.K).toFixed(0)}% · ideal counter ${(100 * this.idealAcc()).toFixed(0)}% · optimal ${(100 * this.rule.optAcc).toFixed(0)}% · ${this.bps.toFixed(2)} bits (calibrated ${(this.cal.n ? this.cal.bitsSoft / this.cal.n : 0).toFixed(2)})`; }
  // v16 display: the read window is the last readTicks ticks of the slot; before it, the last prediction is shown
  get inRead() { return this.phaseT >= this.slot - this.P.readTicks; }
  // v19: the key numbers for the app's status line (shown only there)
  get drawsOutputs() { return true; }
  keyStats() { return this.n ? `accuracy ${(100 * this.accuracy).toFixed(0)}% · last 100 ${(100 * this.lastAcc(100)).toFixed(0)}%` : 'accuracy –'; }
  // v19: output spike counts to display: the read window in progress once it has spikes, otherwise the last finished one
  shownCounts() { let s = 0; for (const v of this.counts) s += v; const live = this.inRead && s > 0; return { live, c: live ? this.counts : this.lastCounts }; }
  // v19: learning curve = accuracy per bin of `bin` symbols over the whole lifetime ({ i0, n, acc, partial })
  curveBin() { return Math.max(10, Math.round(this.P.nSyms / 20)); }
  curve() { const bin = this.curveBin(), h = this.hits, out = [];
    for (let a = 0; a < h.length; a += bin) { const b = Math.min(h.length, a + bin); let s = 0; for (let j = a; j < b; j++) s += h[j]; out.push({ i0: a, n: b - a, acc: s / (b - a), partial: b - a < bin }); }
    return out; }
  outputView() {
    const { live, c } = this.shownCounts(), mx = Math.max(1, ...c);
    return Array.from(c, (v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([v, k]) => ({ name: (live ? 'now ' : 'last ') + this.names[k], v, lo: 0, hi: mx }));
  }
  render(c, W, H) {
    const K = this.K, P = this.P, N = this.names, last = this.recent[this.recent.length - 1], st = this.stats();
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H); c.textAlign = 'left';
    // one line of reference numbers (the brain's own accuracy is in the status line)
    c.font = '11px system-ui'; c.fillStyle = '#666';
    c.fillText(`${this.rule.desc.replace(/ \(.*\)$/, '')} · chance ${(100 / K).toFixed(0)}%` + (isText(P) ? ` · unigram ${(100 * this.rule.unigramAcc).toFixed(0)}%` : '') +
      ` · 1st-order counter ${(100 * this.idealAcc()).toFixed(0)}% · optimal ${(100 * this.rule.optAcc).toFixed(0)}%` +
      (this.n ? ` · ${(st.bitsSoft).toFixed(2)} bits · echo ${(100 * (this.nEcho || 0) / this.n).toFixed(0)}%` : ''), 14, 18);
    // NOW panel: input being shown, the prediction for the NEXT symbol (live in the read window), the last result
    const presenting = this.phaseT < this.c2 + P.onTicks, cur = this.done ? -1 : this.seq[this.pos];
    let pk = -1; if (this.inRead) { let m = 0; for (let k = 0; k < K; k++) if (this.counts[k] > m) { m = this.counts[k]; pk = k; } }
    c.font = '12px system-ui'; c.fillStyle = '#555'; c.fillText('input now', 14, 42); c.fillText('prediction for the next symbol', 130, 42);
    c.font = 'bold 30px ui-monospace, monospace'; c.fillStyle = presenting ? '#e08a00' : '#3b6fd8'; c.fillText(cur < 0 ? '–' : N[cur], 30, 78);
    c.fillStyle = pk >= 0 ? '#3b6fd8' : '#aaa'; c.fillText(pk >= 0 ? N[pk] : '…', 170, 78);
    c.font = '11px system-ui'; c.fillStyle = '#777';
    c.fillText(this.c2 && this.phaseT < this.c2 ? 'clock' : presenting ? 'shown (teacher)' : 'gap', 14, 94);
    c.fillText(this.inRead ? `read window ${this.phaseT - (this.slot - P.readTicks) + 1}/${P.readTicks}` : 'waiting for the read window', 130, 94);
    if (last) { c.fillStyle = last[2] ? '#2a9d3a' : '#c43c3c'; c.font = 'bold 16px system-ui'; c.fillText(last[2] ? '✓ right' : '✗ wrong', 340, 64);
      c.font = '12px system-ui'; c.fillStyle = '#444'; c.fillText(`after '${N[last[0]]}': predicted '${last[1] < 0 ? '·' : N[last[1]]}', next was '${N[last[3]]}'`, 340, 84); }
    // history table (v25): two aligned rows. Column j = the input symbol of step j; under it the prediction made one step
    // earlier (for exactly that symbol): green = it matches the input above, red = it does not; the first column has none.
    // The last column is the symbol now (orange while it is shown); after it, '?' with the live prediction (blue).
    const x0 = 112, dx = 16, ncol = Math.min(this.recent.length, Math.floor((W - x0 - 46) / dx)), rec = this.recent.slice(this.recent.length - ncol), ys = [130, 154];
    const ins = rec.length ? rec.map(r => r[0]).concat([rec[rec.length - 1][3]]) : [], prd = ins.map((_, j) => j ? rec[j - 1][1] : null), grn = ins.map((s0, j) => j ? prd[j] === s0 : null);
    c.font = '12px system-ui'; c.fillStyle = '#555';
    ['input', 'prediction'].forEach((t, r) => c.fillText(t, 14, ys[r]));
    c.font = '16px ui-monospace, monospace'; c.textAlign = 'center';
    ins.forEach((s0, j) => { const x = x0 + j * dx + dx / 2, now = j === ins.length - 1 && cur >= 0;
      c.fillStyle = now && presenting ? '#e08a00' : '#222'; c.fillText(N[s0], x, ys[0]);
      if (j) { c.fillStyle = grn[j] ? '#2a9d3a' : '#c43c3c'; c.fillText(prd[j] < 0 ? '·' : N[prd[j]], x, ys[1]); if (!grn[j]) { c.fillStyle = 'rgba(196,60,60,.10)'; c.fillRect(x - dx / 2, ys[0] - 16, dx, 44); } } });
    if (cur >= 0) { const x = x0 + ins.length * dx + dx / 2; c.fillStyle = '#aaa'; c.fillText('?', x, ys[0]); c.fillStyle = '#3b6fd8'; c.fillText(pk >= 0 ? N[pk] : '…', x, ys[1]);
      c.strokeStyle = '#3b6fd8'; c.strokeRect(x - dx / 2, ys[0] - 16, dx, 44); }
    this.drawnTable = { inputs: ins.slice(), preds: prd.slice(), green: grn.slice() };   // (browser test)
    // learning curve over the whole lifetime: accuracy per bin of symbols (hollow = bin in progress)
    const bin = this.curveBin(), cv = this.curve(), gx = 44, gy = 206, gw = W - 80, gh = 110, yOf = a => gy + gh - a * gh, xOf = i => gx + i / P.nSyms * gw;
    c.textAlign = 'left'; c.font = '12px system-ui'; c.fillStyle = '#333'; c.fillText(`accuracy per ${bin} symbols over this lifetime`, gx, gy - 8);
    c.font = '10px system-ui'; c.strokeStyle = '#ddd'; c.fillStyle = '#777';
    for (const a of [0, 0.5, 1]) { c.beginPath(); c.moveTo(gx, yOf(a)); c.lineTo(gx + gw, yOf(a)); c.stroke(); c.textAlign = 'right'; c.fillText(a === 0.5 ? '50%' : (100 * a) + '%', gx - 4, yOf(a) + 3); }
    c.textAlign = 'center'; for (const i of [0, P.nSyms / 2, P.nSyms]) c.fillText(String(Math.round(i)), xOf(i), gy + gh + 12);
    c.textAlign = 'left'; c.strokeStyle = '#bbb'; c.strokeRect(gx, gy, gw, gh);
    c.setLineDash([4, 4]);
    for (const [v, col, lab] of [[1 / K, '#999', 'chance'], [this.rule.optAcc, '#2a9d3a', 'optimal']]) { c.strokeStyle = col; c.beginPath(); c.moveTo(gx, yOf(v)); c.lineTo(gx + gw, yOf(v)); c.stroke(); c.fillStyle = col; c.textAlign = 'right'; c.fillText(lab, gx + gw - 3, yOf(v) - 3); c.textAlign = 'left'; }
    c.setLineDash([]);
    c.strokeStyle = '#3b6fd8'; c.lineWidth = 2; c.beginPath(); cv.forEach((p, i) => { const x = xOf(p.i0 + p.n / 2), y = yOf(p.acc); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.lineWidth = 1;
    cv.forEach(p => { const x = xOf(p.i0 + p.n / 2), y = yOf(p.acc); c.beginPath(); c.arc(x, y, 3, 0, 7); if (p.partial) { c.fillStyle = '#f4f1ea'; c.fill(); c.strokeStyle = '#3b6fd8'; c.stroke(); } else { c.fillStyle = '#3b6fd8'; c.fill(); } });
    c.fillStyle = '#777'; c.textAlign = 'center'; c.fillText('symbols', gx + gw / 2, gy + gh + 24); c.textAlign = 'left';
    // output spikes: the read window in progress, or the last finished one (the prediction it made); green box = actual next
    const { live, c: src } = this.shownCounts(), bw = Math.min(40, (W - 60) / K), mx = Math.max(1, ...src), y0 = 382, bh = 60;
    let hiP = -1; if (live) hiP = pk; else if (last) hiP = last[1]; const hiT = !live && last ? last[3] : -1;
    c.font = '12px system-ui'; c.fillStyle = '#333';
    c.fillText(live ? `output spikes in the read window now (for the symbol after '${N[cur]}')` : last ? `output spikes of the last read window (after '${N[last[0]]}'; green box = actual next)` : 'output spikes', 30, y0 - 8);
    c.font = '10px system-ui';
    for (let k = 0; k < K; k++) { const v = src[k], h = v / mx * bh, x = 30 + k * bw; c.fillStyle = '#e2ded5'; c.fillRect(x, y0, bw - 3, bh); c.fillStyle = k === hiP ? '#3b6fd8' : '#8fa9e6'; c.fillRect(x, y0 + bh - h, bw - 3, h);
      if (v > 0) { c.fillStyle = h > bh - 12 ? '#fff' : '#333'; c.textAlign = 'center'; c.fillText(String(Math.round(v)), x + (bw - 3) / 2, h > bh - 12 ? y0 + 11 : y0 + bh - h - 2); }
      if (k === hiT) { c.strokeStyle = '#2a9d3a'; c.lineWidth = 2; c.strokeRect(x - 1, y0 - 1, bw - 1, bh + 2); c.lineWidth = 1; }
      c.fillStyle = '#333'; c.textAlign = 'center'; c.font = '12px ui-monospace, monospace'; c.fillText(N[k], x + bw / 2 - 1, y0 + bh + 14); c.font = '10px system-ui'; }
    c.textAlign = 'left';
    this.drawn = { bars: Array.from(src), live, curve: cv.length };   // (browser test)
  }
}

registerEnv({
  id: 'seq', name: 'Sequence prediction (learned transitions)', view: { width: 700, height: 480 },
  description: 'A stream of symbols with a new rule every lifetime (cycle, Markov chain, 2nd-order pattern or text): predict the next symbol. Needs lifetime learning.',
  defaultPlan: P => (P.clock2 && P.clock3) ? 'predictK3' : (P.clock2 ? 'predictK2' : 'predictK') + ((isText(P) || P.K > 12) ? (P.clock2 ? 'XO' : 'L') : ''),   // v19: XO (own-column M2 reset) replaces XG   // big alphabets need the 36x36 tissue; the two-phase clock -> second-order plan
  // v17 (round 18): the task choice (kept by 'Reset to recommended settings') and the recommended settings per task:
  // Text -> two-phase clock (second-order plan predictK2XG) and a 1000-character lifetime (accuracy keeps rising past 200)
  taskKeys: ['source', 'K', 'det'],
  // v21 (round 22): text, fables and order3 -> three-phase clock (two-region third-order plan predictK3, DEFAULTS_VERSION 19)
  recommend: P => P.source === 'text' ? { clock2: true, clock3: true, nSyms: 1000 } : P.source === 'fables' ? { clock2: true, clock3: true, nSyms: 2000 } : P.source === 'order3' ? { clock2: true, clock3: true } : {},
  params: {
    source: { value: 'cycle', label: 'Sequence', options: [['cycle', 'Cycle: a random order of the symbols, repeated'], ['markov', 'Markov chain: preferred successor with probability p'],
              ['order2', 'Second-order pattern (successor depends on two symbols)'], ['order3', 'Third-order pattern (successor depends on three symbols)'], ['text', 'Text corpus (19 characters)'], ['fables', 'Fables: larger text corpus (4270 characters, 24 symbols)']] },
    K: { value: 4, min: 2, max: 16, step: 1, label: 'Alphabet size (not for text)' },
    det: { value: 0.8, min: 0.3, max: 1, step: 0.05, label: 'Markov: probability of the preferred successor' },
    nSyms: { value: 200, min: 20, max: 5000, step: 20, label: 'Symbols per lifetime' },
    onTicks: { value: 4, min: 2, max: 12, step: 1, label: 'Symbol duration (ticks)' },
    holdTicks: { value: 4, min: 1, max: 12, step: 1, label: 'Prediction window (ticks)' },
    clock2: { value: false, label: 'Two-phase clock (GO2 then GO1 before each symbol; for the two-step memory of plan predictK2)' },
    clock3: { value: false, label: 'Three-phase clock (GO3 before GO2; with the two-phase clock: the context region of plan predictK3)' },   // v21
    wrongCost: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'Dopamine dip on a wrong prediction' },
    goTicks: { value: 1, hidden: true }, nClock: { value: 9, hidden: true }, readTicks: { value: 4, hidden: true }, readIn: { value: 0, hidden: true }, beta: { value: 0.5, hidden: true },
    inGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  },
  io: seqIO,
  create(seed, P, spec) { return new SeqTask(seed, P, spec); },
});

/* ---------- hand-designed TRANSITION-LEARNING plan 'predictK' ----------
 * memoryK (current symbol held by topographic memory columns M, reset by the GO/clock pulse through the
 * inhibitory X pool) plus a PREDICTION band P of topographic columns between the memory and the outputs:
 *   P cells receive the symbol input of their column (an instructive TEACHER input, like a climbing fibre)
 *     and project to the output of their column.
 *   M axons descend to the P band and split there into two parallel fibres (bifAt) that cross ALL P columns:
 *     a broad projection whose synapses are the only plastic ones (PLAST -> RECV), all-to-all, any K.
 * Learning (teacher-gated plasticity, pl.teach): when the next symbol arrives, its P column gets a teacher
 * event; the memory of the PREVIOUS symbol is still active (the GO pulse silences it only now and keeps the
 * new memory from starting), so M(previous) -> P(next) synapses are potentiated, and every M cell keeps the
 * sum of its plastic weights fixed (preNorm): its weights track how often each symbol followed it.
 * In the prediction window M(current) drives P(most likely next) -> its output wins. */
function createPredictPlan(tune) {
  const T = Object.assign({ y: 0.42, yP: -0.38, yPtop: -0.12, yM: 0.333, yTop: 0.583, xc: 0.17, nSeed: 13, nSeedP: 13, x0: 0.9, tc: 0.3, maxCells: 420, topoW: 0.1, snap: 1,
                            normE: 45, normI: 200, satisfy: 2, wIn: 30, wHid: 10, leak: 0, clen: -2, t0: 5, sx: 5, thr: 0, xthr: 0, pthr: 0, branchMax: 40, em4: 3, em5: 3, g4: 5,
                            coll: 5, reach: 1.7, xgo: 5, xIn: -5, pIn: 5, pGo: -5, s7: 5, bifAt: 0.3, grid: 24, rule: 'teach', lr: 0.02, preNorm: 20, teachThr: 20, plateau: 4, tauPre: 12, plastic: 1 }, tune);
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, 0.6, 0.3, 0.6, 0.15, 0.3, 0.3];
  const ant = y => Math.exp(-(1 - y) / lam[1]);
  wg(0, 1, 40); wg(0, BIAS, -40 * ant(T.yM));                         // s0: +1 front (M band)
  wg(1, 0, 40); wg(1, BIAS, -40 * Math.exp(-T.xc / lam[0]));          // s1: +1 central
  wg(2, 1, 40); wg(2, BIAS, -40 * ant(T.yTop));                       // s2: +1 in front of the band (dies)
  wg(4, 1, -150); wg(4, BIAS, 150 * ant(T.yPtop));                    // s4: +1 in the back band (P)
  const G = k => CH_NCHEM + k;                                          // s3: inside the circuit = M, X or P
  wg(3, G(0), 20); wg(3, G(1), 20); wg(3, G(2), -60); wg(3, G(4), 60); wg(3, BIAS, 20);   // = s0 + s1 - 3 s2 + 3 s4 + 1 > 0
  wg(6, TIME, -40); wg(6, BIAS, 40 * T.tc);                          // s6: proliferation clock
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  // fate(out, M, X, P): M = s0 (front), P = s4 (back band), X = the rest (back, central; lateral ones die)
  const fate = (out, M, X, P) => { const a = (M - X) / 2, d = (P - X) / 2; r(out, 0, a); r(out, 4, d); rb(out, X + a + d); };
  for (let o = 0; o < CH_NO; o++) rb(o, -5);
  for (let k = 0; k < 7; k++) rb(k < 6 ? CO.G + k : CO.G6, 0);
  r(CO.DIV, 6, 5); rb(CO.DIV, 0); r(CO.AXON, 6, -5); r(CO.AXON, 3, 5); rb(CO.AXON, -5);
  r(CO.DIE, 3, -10);
  if (T.kill === 'P') fate(CO.DIE, -5, -5, 20); else if (T.kill === 'M') fate(CO.DIE, 40, -5, -5);   // v21: one band only (regions of plan rewardKR)
  fate(CO.INH, -5, 5, -5); fate(CO.THR, T.thr, T.xthr, T.pthr); fate(CO.BRANCH, 5, 5, -5);
  fate(CO.T + 1, 5, T.xIn, T.pIn); fate(CO.T + 3, -5, T.xgo, T.pGo); fate(CO.T + 7, 5, -5, -5); fate(CO.T + 0, T.t0, -5, -5); fate(CO.T + 5, -5, -5, 5);
  fate(CO.S + 7, T.s7, -5, -5); fate(CO.S + 5, 5, -5, -5); fate(CO.S + 4, -5, -5, 5); fate(CO.S + 0, -5, T.sx, -5);
  fate(CO.TOPO, 5, -5, 5); fate(CO.BIF, 5, 5, -5); fate(CO.PROJ, -5, -5, 5); fate(CO.COLL, T.coll, -5, -5); fate(CO.CLEN, T.clen, -5, -5);
  fate(CO.LEAK, T.leak, -5, -5); fate(CO.EM4, T.em4, -5, -5); fate(CO.EM5, -5, -5, T.em5);
  fate(CO.PLAST, T.plastic ? 5 : -5, -5, -5); fate(CO.RECV, -5, -5, 5);
  fate(CO.G + 5, 5, 0, 0); fate(CO.G + 1, -5, 0, 0); fate(CO.G + 3, 0, 0, 5); fate(CO.G + 4, 0, T.g4, 0);
  const seeds = spread(T.nSeed, -T.x0, T.x0).map(x => [x, T.y]).concat(spread(T.nSeedP, -T.x0, T.x0).map(x => [x, T.yP]));
  const pl = Object.assign(defaultPlasticity(), { lr: T.lr, aMinus: 0.3, tauPre: T.tauPre });
  if (T.rule === 'teach') Object.assign(pl, { teach: 1, teachThr: T.teachThr, plateau: T.plateau, preNorm: T.preNorm });
  else Object.assign(pl, { lr: T.lrR != null ? T.lrR : 0.05, tauElig: T.tauElig || 50, preNorm: 0 });
  return { kind: 'cell', label: 'hand-designed transition-learning plan (memory columns -> plastic all-to-all -> prediction columns)', seed: 1, Wg, R, lam, seeds, s0: new Array(H).fill(0),
           sc: Object.assign(cellDefaults(), { pDiv: 0.9, maxCells: T.maxCells, trophHid: 0.3, wHid: T.wHid, wIn: T.wIn, eyeReach: T.reach, topoW: T.topoW, topoSnap: T.snap,
                                               normE: T.normE, normI: T.normI, satisfy: T.satisfy, branchMax: T.branchMax, homeoRate: 0, grid: T.grid, plastRecv: 1, bifAt: T.bifAt, afferent: 1 }),
           pl, nCh: 1, ch: [defaultChannel()], fitness: null };
}
registerPlan('predictK', 'transition-learning plan (memory -> plastic -> prediction columns)', () => createPredictPlan(),
  'memoryK columns hold the current symbol; their parallel fibres reach every prediction column through plastic synapses; the next symbol is the teacher');
// the same plan on a finer tissue (36 x 36 grid instead of 24 x 24): room for about 20 columns (text: 19 characters)
const LARGE = { grid: 36, nSeed: 19, nSeedP: 19, maxCells: 900, topoW: 0.065 };
registerPlan('predictKL', 'transition-learning plan, large tissue (up to ~20 symbols)', () => { const d = createPredictPlan(LARGE); d.label += ' (36x36 tissue)'; return d; },
  'predictK on a 36 x 36 grid: room for about 20 symbol columns (text)');

/* ---------- hand-designed SECOND-ORDER plan 'predictK2' (v10) ----------
 * predictK plus a memory of the PREVIOUS symbol and conjunctive cells. Seven bands from front to back:
 *   M   memory columns: hold the current symbol (reset by GO1 through X), as in predictK
 *   X   inhibitory stripe: GO1 -> X -| M
 *   R   copy relay (CLAW = fast compact cells, threshold high): fire only when M of their column AND the GO1
 *       clock are active (a gated copy), and drive M2 of their column
 *   M2  previous-symbol memory columns: loaded by R during GO1 (before M is reset), latched by recurrence,
 *       reset by GO2 through X2 one tick earlier. During a symbol M2 holds the symbol before it.
 *   X2  gated reset (inhibitory CLAW cells of each column): fire only when their M2 column is active AND the GO2
 *       clock arrives, and silence that column (a global reset would also hyperpolarise the column to be loaded)
 *   C   conjunctive cells (granule-like, CLAW): direct input from M of their own column + parallel fibres from
 *       ALL M2 columns, of which each keeps one random column (claw). With a fast membrane and a small input
 *       budget each fires only for its pair (previous symbol j, current symbol i): sparse mixed selectivity.
 *   P   prediction columns, as in predictK; plastic parallel fibres from M (first order) and from C (second
 *       order) cross all of them, the next symbol's input is the teacher.
 * Bands are set by staircase genes on the anterior gradient; tags: M T0 T1, X->S0, R T0 (+ weak T3 = gate),
 * M2 T2, X2 T4 (+ weak T8 = GO2 gate; M2 seeks S4) -> S2, C T7, P T1 T5. Needs the env's two-phase clock (seq: clock2). Nothing depends on K. */
function createPredict2Plan(tune) {
  const T = Object.assign({ bands: [0.667, 0.417, 0.333, 0.25, 0.083, 0, -0.417], seedY: [0.542, 0.167, -0.125, -0.292, -0.6], nSeed: 13, x0: 0.9, tc: 0.3,
                            maxCells: 560, grid: 24, topoW: 0.1, snap: 1, normE: 45, normI: 200, satisfy: 2, wIn: 30, wHid: 10, branchMax: 150, reach: 2.6,
                            em4: 3, em5: 3, bifAt: 0.8, gate: -0.2, gate2: -0.2, rBranch: -2.5, hebb: 0, preLag: 8, clawIn: 12, mBif: 1, x2coll: -5, rThr: 5, x2Thr: 4.5, cThr: -3, m2Thr: -5, clawLeak: 0.5, clawNorm: 16, leak: 0, clen: -2, coll: 5, m2coll: 0, m2leak: -5,
                            rule: 'teach', lr: 0.3, preNorm: 40, teachThr: 20, plateau: 8, tauPre: 12, plastic: 1, cPlastic: 1, mFibre: 0, lam1: 0.6, lam4: 0.1, lam5: 0.1 }, tune);
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, T.lam1, 0.3, 0.6, T.lam4, T.lam5, 0.3], GS = T.grid, h = 2 / GS;
  const ant = y => Math.exp(-(1 - y) / lam[1]);
  // staircase genes: s = +1 in front of the band boundary y_k (sharp to half a grid row)
  // v14 T.mix: a MIXING band G between C and P (bands then has 8 boundaries; the C|G boundary uses spare gene 9)
  // v15 T.gap: the same 8-boundary layout but the G band is empty (its cells die): the XM geometry without the mixing layer
  const MIX = !!T.mix, GAP = !MIX && !!T.gap, G8 = MIX || GAP, SG = G8 ? [0, 1, 2, 4, 5, 7, 9, 8] : [0, 1, 2, 4, 5, 7, 8], NB = SG.length;
  T.bands.forEach((y, k) => { const gain = 3 / (ant(y) * (h / 2) / lam[1]); wg(SG[k], 1, gain); wg(SG[k], BIAS, -gain * ant(y)); });
  wg(6, TIME, -40); wg(6, BIAS, 40 * T.tc);                                                        // s6: proliferation clock
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; }, addb = (out, v) => { R[out * (H + 1) + H] += v; };
  // band(out, [top, M, X, R, M2, X2, C, P]): output value in each band (exact for s = +-1)
  // (MIX: the G value of each output is inserted before P from the table gv, default -5 = off)
  const gv = MIX ? { [CO.AXON]: 0, [CO.THR]: T.gThr || 0, [CO.PLAST]: 5, [CO.TOPO]: 5, [CO.BIF]: 5, [CO.BRANCH]: 5, [CO.XSYN]: 5, [CO.T + 5]: 5, [CO.S + 5]: 5,
                     [CO.G + 5]: 5, [CO.G + 4]: 0, [CO.G + 3]: 0, [CO.MIX]: 5 } : GAP ? { [CO.DIE]: 5, [CO.G + 5]: 0, [CO.G + 4]: 0, [CO.G + 3]: 0 } : null;
  const band = (out, f) => { if (G8 && f.length === 8) f = [...f.slice(0, 7), gv[out] != null ? gv[out] : -5, f[7]];
    let b = f[NB]; for (let k = 0; k < NB; k++) { const d = (f[k] - f[k + 1]) / 2; r(out, SG[k], d); b += d; } rb(out, b); };
  const on = (out, ...idx) => { const f = new Array(8).fill(-5); for (const i of idx) f[i] = 5; band(out, f); };
  const val = (out, v) => band(out, v);
  const [TOP, M, X, RL, M2, X2, C, P] = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let o = 0; o < CH_NO; o++) rb(o, -5);
  for (let k = 0; k < 7; k++) rb(k < 6 ? CO.G + k : CO.G6, 0);
  if (T.front) on(CO.DIE, TOP, C, P); else on(CO.DIE, TOP);   // v21 front: only the memory front end M X R M2 X2 (context region of predictK3)
  r(CO.DIV, 6, 5); rb(CO.DIV, 0);
  val(CO.AXON, [-10, 0, 0, 0, 0, 0, 0, 0]); r(CO.AXON, 6, -5); addb(CO.AXON, 5);
  on(CO.INH, X, X2);
  val(CO.THR, [0, 0, 0, T.rThr, T.m2Thr, T.x2Thr, T.cThr, T.pThr || 0]);
  { const f = new Array(8).fill(-5); if (T.plastic) f[M] = 5; if (T.cPlastic) f[C] = 5; band(CO.PLAST, f); }
  on(CO.RECV, P); on(CO.TOPO, M, RL, M2, X2, C, P); if (T.mBif) on(CO.BIF, M, M2, C); else on(CO.BIF, M2, C); on(CO.BIF4, M2); on(CO.PROJ, P); on(CO.CLAW, RL, X2, C);
  val(CO.EM4, [-5, -5, -5, -5, -5, -5, T.em4, -5]); val(CO.EM5, [-5, -5, -5, -5, -5, -5, -5, T.em5]);
  val(CO.COLL, [-5, T.coll, -5, -5, T.m2coll, T.x2coll, -5, -5]); val(CO.CLEN, [-5, T.clen, -5, -5, T.clen, T.clen, -5, -5]);
  val(CO.LEAK, [-5, T.leak, -5, -5, T.m2leak, -5, -5, -5]);
  val(CO.BRANCH, [-5, 5, 5, T.rBranch, 5, 5, 5, -5]);   // R: a short axon whose few synapses end in M2 (not in X2 behind it)
  on(CO.XSYN, M2);   // M2 axons make no synapses on their way down: only their parallel fibres in the C band (+ local collaterals)
  // address tags
  on(CO.T + 0, M, RL); on(CO.T + 1, M, P); on(CO.T + 2, M2); on(CO.T + 4, X2); val(CO.T + 3, [-5, -5, 5, T.gate, -5, -5, -5, -5]); on(CO.T + 5, P); on(CO.T + 7, C); val(CO.T8, [-5, -5, -5, -5, -5, T.gate2, -5, -5]);
  // seek tags
  on(CO.S + 0, M, X); on(CO.S + 2, RL, M2, X2); if (T.mFibre) on(CO.S + 5, M, C); else on(CO.S + 5, C); on(CO.S + 7, M, M2); on(CO.S + 4, M2, P);
  // guidance (0 = indifferent): back = repelled by the anterior signal, forward = attracted
  val(CO.G + 1, [0, -5, 5, -5, -5, 5, -5, 0]); val(CO.G + 5, [0, 5, 0, 0, 0, 0, 5, 0]); val(CO.G + 4, [0, 0, 0, 0, 5, 0, 0, 0]); val(CO.G + 3, [0, 0, 0, 0, 0, 0, 0, 5]);
  const seeds = []; for (const y of T.seedY) for (const x of spread(T.nSeed, -T.x0, T.x0)) seeds.push([x, y]);
  const pl = Object.assign(defaultPlasticity(), { lr: T.lr, aMinus: 0.3, tauPre: T.tauPre });
  if (T.rule === 'teach') Object.assign(pl, { teach: 1, teachThr: T.teachThr, plateau: T.plateau, preNorm: T.preNorm, preLag: T.preLag });
  else Object.assign(pl, { lr: T.lrR != null ? T.lrR : 0.05, tauElig: T.tauElig || 50, preNorm: 0 });
  if (MIX) { if (!(T.mixK > 0)) T.mixK = 4; on(CO.MIX); }   // (the band table gv puts MIX on in G only)
  for (const k of ['teachAHP', 'teachAHPDur', 'mixInh', 'mixLr', 'mixN', 'mixPrune', 'mixHomeo', 'mixRate', 'mixGate', 'metaN', 'confPow', 'confRef', 'confMax', 'trustPow', 'trustRef', 'trustMax', 'trustN', 'trustDelay', 'trust0', 'rcvDiv', 'rcvSig', 'rcvInh', 'rcvInhTau', 'rcvNoise']) if (T[k] != null) pl[k] = T[k];   // v12 plasticity genes (off unless given)
  return { kind: 'cell', label: 'hand-designed second-order plan (memory + previous-symbol memory + conjunctive cells -> plastic -> prediction columns)', seed: 1, Wg, R, lam, seeds, s0: new Array(H).fill(0),
           sc: Object.assign(cellDefaults(), { pDiv: 0.9, maxCells: T.maxCells, trophHid: 0.3, wHid: T.wHid, wIn: T.wIn, eyeReach: T.reach, topoW: T.topoW, topoSnap: T.snap,
                                               normE: T.normE, normI: T.normI, satisfy: T.satisfy, branchMax: T.branchMax, homeoRate: 0, grid: T.grid, plastRecv: 1, bifAt: T.bifAt, afferent: 1,
                                               clawLeak: T.clawLeak, clawNorm: T.clawNorm, clawIn: T.clawIn, coneSpeed: T.coneSpeed || 1, bifAt4: T.bifAt4 || 0, mixK: MIX ? T.mixK : 0, mixNorm: MIX ? (T.mixNorm || 0) : 0, mixLeak: MIX ? (T.mixLeak || 0) : 0, hebb: T.hebb, pruneFrac: T.hebb ? 0.1 : 0 }, T.sc || {}),   // T.sc: extra cell-scale overrides (v11)
           pl, nCh: 1, ch: [defaultChannel()], fitness: null };
}
registerPlan('predictK2', 'second-order plan (memory + previous-symbol memory + conjunctive cells -> plastic -> prediction columns)', () => createPredict2Plan(),
  'adds a previous-symbol memory (copied from the memory on the GO1 clock, reset by GO2) and granule-like conjunctive cells; needs the two-phase clock');
// 36x36 tissue: band edges moved onto row edges (multiples of 1/18) so the one-row bands X, R, X2 stay one row.
// NOTE (R11c): at 36 rows a 16-19 symbol alphabet leaves only ~2 cells per column, too few for clean claw/M2
// columns; this plan grows but does not yet learn text (see RESULTS R11c).
const LARGE2 = { grid: 36, nSeed: 19, maxCells: 1200, topoW: 0.065, bands: [0.667, 0.444, 0.389, 0.333, 0.111, 0.056, -0.444], seedY: [0.556, 0.222, -0.111, -0.333, -0.722] };
registerPlan('predictK2L', 'second-order plan, large tissue (up to ~20 symbols)', () => { const d = createPredict2Plan(LARGE2); d.label += ' (36x36 tissue)'; return d; },
  'predictK2 on a 36 x 36 grid (text)');
// v11 (R12): 60x60 tissue for text. Faster growth cones (coneSpeed 3) so axons cross the bigger grid in 40 steps,
// M2 only 2 rows (X2 can reset them), M fibres do not split in C (mBif 0) so the bottom C row keeps M-only cells
// (a first-order path summed with the M x M2 conjunction cells), X2 collaterals keep X2 alive, deeper M2 split (bifAt4).
// Text 1000 chars, 3 growths: last quarter 0.587 (ideal first-order counter 0.585), calibrated 2.40 bits/char (RESULTS R12).
const XL2 = { grid: 60, mBif: 0, x2coll: 5, bifAt4: 1.8, coneSpeed: 3, nSeed: 31, maxCells: 3400, branchMax: 500, topoW: 0.065, bifAt: 5.5, lr: 0.03,
              bands: [-0.2, -0.333, -0.367, -0.4, -0.467, -0.5, -0.767], seedY: [-0.267, -0.433, -0.567, -0.7, -0.883], sc: { rSyn: 0.07, rIn: 0.2 } };
registerPlan('predictK2XL', 'second-order plan, 60x60 tissue (text)', () => { const d = createPredict2Plan(XL2); d.label += ' (60x60 tissue)'; return d; },
  'predictK2 on a 60 x 60 grid with a summed first-order path; reaches the first-order counter on text');
// v12 (R13): the same tissue with metaplastic learning (metaN: running-average weights instead of a recency average),
// learned per-cell trust (trustPow: cells scale their output budget by how much probability they gave the taught symbol,
// so context-specific second-order cells outvote flat first-order ones) and a lower P threshold (pThr).
// Text 1000 chars, 8 growths: last quarter 0.650 (R12 plan 0.581, corpus bigram 0.598), 2.15 bits/char calibrated (RESULTS R13).
const XT2 = Object.assign({}, XL2, { lr: 0.1, metaN: 40, trustPow: 2, pThr: -2 });
registerPlan('predictK2XT', 'second-order plan, 60x60 tissue, metaplastic + learned trust (text)', () => { const d = createPredict2Plan(XT2); d.label += ' (60x60 tissue, trust)'; return d; },
  'predictK2XL with metaplasticity and learned per-cell trust; beats the corpus bigram on text');
// v13 (R14): + divisive normalisation (gain control) of the prediction cells' plastic input (rcvDiv): the total drive
// to the prediction layer stays ~constant, so the relatively strongest (even weak) prediction still fires.
// Text 1000 chars, 8 growths: last quarter 0.67 (0.69 with the graded tie-breaking decoder readIn 0.01; RESULTS R14).
const XN2 = Object.assign({}, XT2, { rcvDiv: 0.4, rcvSig: 20 });
registerPlan('predictK2XN', 'second-order plan, 60x60 tissue, trust + gain control (text)', () => { const d = createPredict2Plan(XN2); d.label += ' (60x60 tissue, trust, gain control)'; return d; },
  'predictK2XT with divisive normalisation of the prediction layer input');
// v14 (R15): + a MIXING band G (360 Kenyon / granule-like cells between C and P, gene MIX): each keeps 4 random C inputs
// (same column, topographic), fast membrane, feedforward inhibition (mixInh); plastic parallel fibres to P like C.
// The stack is moved up 6 rows to make room. Text 1000 chars, 8 growths: last quarter 0.70 (0.71 with readIn) vs 0.67 for
// predictK2XN. (R16: paired ablation over 40 growths, G adds +0.014; the text default is now predictK2XG.)
const XM2 = Object.assign({}, XN2, { mix: 1, bands: [0, -0.133, -0.167, -0.2, -0.267, -0.3, -0.567, -0.767], seedY: [-0.067, -0.233, -0.367, -0.5, -0.667, -0.883],
                                     mixK: 4, mixLeak: 0.5, mixNorm: 80, mixInh: 0.5 });
registerPlan('predictK2XM', 'second-order plan, 60x60 tissue, trust + gain control + mixing layer (text)', () => { const d = createPredict2Plan(XM2); d.label += ' (60x60 tissue, mixing layer)'; return d; },
  'predictK2XN with a second, sparse mixing layer of granule / Kenyon-like cells');
// v15 (R16a): the XM layout without the mixing layer (the G band dies, plan knob gap). Faster, but 0.02 below XM on text
// (32 growths): the random mixing layer does add a little (paired ablation +0.014; RESULTS R16a).
const XS2 = Object.assign({}, XN2, { gap: 1, bands: XM2.bands, seedY: [-0.067, -0.233, -0.367, -0.5, -0.883] });
registerPlan('predictK2XS', 'second-order plan, 60x60 tissue, trust + gain control, XM layout without mixing (text)', () => { const d = createPredict2Plan(XS2); d.label += ' (60x60 tissue, slim)'; return d; },
  'predictK2XM without the mixing layer (faster)');
// v15 (R16b-d): XM + an intrinsic homeostatic threshold in every mixing cell (mixHomeo 0.5, target mixRate 0.002 spikes per
// substep): silent cells become excitable, promiscuous ones selective. Text 1000 chars, 32 growths: last quarter 0.72
// (XM 0.69, XS 0.67), calibrated 1.9 bits; the default for text with the two-phase clock (RESULTS R16).
const XG2 = Object.assign({}, XM2, { mixHomeo: 0.5, mixRate: 0.002 });
registerPlan('predictK2XG', 'second-order plan, 60x60 tissue, trust + gain control + homeostatic mixing layer (text)', () => { const d = createPredict2Plan(XG2); d.label += ' (60x60 tissue, homeostatic mixing layer)'; return d; },
  'predictK2XM whose mixing cells adapt their thresholds (lifetime-balanced sparse firing)');
// v19 (R20): XG with clawOwn: every gated reset cell X2 keeps its OWN column's M2 fibres (local feedback inhibition), so
// every previous-symbol column is reset on the GO2 clock. In XG, with 2-3 X2 cells per column, the balanced claw choice left
// many columns without their own reset (stuck or never loaded, about half of them with 24 symbols). Text 1000 chars:
// last quarter 0.757 vs 0.721; fables 2000 chars: 0.325 vs 0.286 (8 paired growths; RESULTS R20). The text default.
const XO2 = Object.assign({}, XG2, { sc: Object.assign({}, XG2.sc, { clawOwn: 1 }) });
registerPlan('predictK2XO', 'second-order plan, 60x60 tissue, trust + gain control + homeostatic mixing layer + own-column reset (text)', () => { const d = createPredict2Plan(XO2); d.label += ' (60x60 tissue, own-column M2 reset)'; return d; },
  'predictK2XG whose gated reset cells keep their own column: a clean previous-symbol memory for any alphabet size');
// v21 (R22): THIRD-ORDER CONTEXT by a second region. predictK3 = two tissues linked by tracts:
//   cortex  = predictK2XO (current symbol M, previous symbol M2, conjunctive C, mixing G, prediction P)
//   context = the memory front end of the same gene program on its own tissue (bands M X R M2 X2; C and P die): its M
//             columns receive the cortex's M2 (tract 'prev', column to column), its relay R copies them on GO2 into its own
//             M2 (= the symbol TWO steps back), reset by GO3 (env three-phase clock, clock3) - a shift register M -> M2 -> M3.
//   tract M3 -> mixing: every mixing cell G of the cortex keeps the axons of one context column (claw), so mixing cells
//             become conjunctions of (current, previous) C patterns with the symbol two back; their plastic fibres to P learn.
const CTX3 = Object.assign({}, XL2, { front: 1, plastic: 0, cPlastic: 0, sc: Object.assign({}, XL2.sc, { clawOwn: 1 }) });
function createPredict3Plan(tune) {
  const T = Object.assign({ w3: 30, gain: 1 }, tune);   // R22a: w3 30 and mixing target rate 0.008 (order3:8 last quarter 0.97, text 0.773)
  const cortex = createPredict2Plan(Object.assign({}, XO2, { mixRate: 0.008 }, T.cortex || {}));
  if (!T.separate) Object.assign(cortex.pl, SpikingArena.UNIFIED_PL);   // v22: the unified learning rule (instructive + dopamine); separate: the v21 teacher rule
  const ctx = createPredict2Plan(Object.assign({}, CTX3, T.ctx || {}));
  return { kind: 'regions', label: 'two-region third-order plan (cortex predictK2XO + context shift register; tracts M2 -> context, M3 -> mixing cells)', seed: 1,
    regions: [{ name: 'cortex', color: '#6aa9ff', g: cortex, outputs: true, inputs: [{ env: 'symbol' }, { env: 'go' }, { env: 'go2' }, { env: 'tonic' }] },
              { name: 'context', color: '#f0a050', g: ctx, inputs: [{ tract: 'prev', like: 'symbol', tag: 1 }, { env: 'go2', tag: 3 }, { env: 'go3', tag: 8 }, { env: 'tonic' }] }],
    tracts: [{ name: 'M2 -> context', from: { region: 0, cls: 2 }, map: 'topo', to: { region: 1, tract: 'prev' }, gain: T.gain },
             { name: 'M3 -> mixing', from: { region: 1, cls: 2 }, map: 'claw', to: { region: 0, mix: true, w: T.w3 } }] };
}
registerPlan('predictK3', 'third-order plan: cortex + context region (needs the three-phase clock)', () => { const d = createPredict3Plan(); for (const r of d.regions) Object.assign(r.g.sc, SpikingArena.DEMAND_SC); return d; },   // v27: + local connection demand
  'predictK2XO plus a context region grown by the same gene program: a shift register holding the symbol two steps back, projecting to the mixing cells');
Object.assign(SpikingArena, { SeqTask, createPredictPlan, createPredict3Plan, PREDICT3_CTX: CTX3, createPredict2Plan, seqIO, PREDICT_LARGE: LARGE, PREDICT2_LARGE: LARGE2, PREDICT2_XL: XL2, PREDICT2_XT: XT2, PREDICT2_XN: XN2, PREDICT2_XM: XM2, PREDICT2_XS: XS2, PREDICT2_XG: XG2, PREDICT2_XO: XO2 });
})();
