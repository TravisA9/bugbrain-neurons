/* =====================================================================
 * envs/memory.js — two non-spatial MEMORY environments sharing one task:
 *
 *   'cue'    Cue-then-turn: a cue light on the LEFT or RIGHT for a few ticks,
 *            then a DELAY with no cue, then a GO signal; during the response
 *            window the agent must turn to the cued side (output 'turn_left'
 *            vs 'turn_right', winner-take-all over spike counts).
 *            Reward +1 correct, -1 wrong (no answer counts as wrong, -0.5).
 *   'recall' Symbol copy / recall: the same protocol with K symbols presented
 *            one-hot; the agent must output the same symbol (WTA over K
 *            outputs) after the delay. Groundwork for text.
 *
 * Trial = ITI (nothing) -> cue (cueTicks) -> delay -> go + response window.
 * Only the response window is read out, so a brain that cannot hold the cue
 * through the delay is at chance (or silent).
 * Curriculum (optional): after every generation the champion is tested; if its
 * pass rate >= passTarget the delay grows by delayStep (up to delayMax).
 * ===================================================================== */
(function () {
'use strict';
const VIEW_W = 700, VIEW_H = 500;

// IO spec for K symbols. K = 2: left / right cue lights and turn-left / turn-right outputs.
const goBroadcast = P => !!P.goBroadcast || P.mapping === 'random';
function recallIO(P, K, names, outNames) {
  // outputs sit under their symbols (v8); v7 recall brains keep the old output row (outLayout 'v7')
  const xs = K === 2 ? [-P.cueX, P.cueX] : spread(K, -0.8, 0.8), ox = K === 2 ? [-0.5, 0.5] : P.outLayout === 'v7' ? spread(K, -0.7, 0.7) : xs;
  // 'topo' = topographic label (used only by cells with the TOPO gene): output k matches symbol k
  const inputs = names.map((n, k) => ({ name: n, group: 'symbol', tag: 1, cls: 1, pos: [xs[k], 1], cue: true, topo: xs[k],
                                        mirror: K === 2 ? 1 - k : undefined }));
  // v20: GO as nGo diffuse copies across the tissue (as in the bandit; for the action columns of plan rewardMemK):
  // with a random answer mapping (new in v20, so no older brain is affected) or when goBroadcast is set
  if (goBroadcast(P)) spread(P.nGo, -0.9, 0.9).forEach((x, i) => inputs.push({ name: 'go' + i, group: 'go', tag: 3, cls: 4, pos: [x, 0.95], midline: true, diffuse: true }));
  else inputs.push({ name: 'go', group: 'go', tag: 3, cls: 4, pos: [0, 0.8], midline: true });
  const iTon = inputs.length;
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.9], midline: true, tonic: true });
  const outputs = outNames.map((n, k) => ({ name: n, group: 'choice', tag: 4, cls: 5 + (k % 3), pos: [ox[k], -1], bias: P.outBias, topo: xs[k],
                                            mirror: K === 2 ? 1 - k : undefined }));
  return { inputs, outputs, classes: ['cue', 'symbol', 'unused', 'tonic', 'go', 'out-A', 'out-B', 'out-C'],
           tagNames: ['tag 0', 'cue', 'tag 2', 'go', 'output', 'tag 5', 'tonic', 'free'],
           juvenile: { waves: [names.map((n, k) => k)], pairs: names.map((n, k) => [k, k]), waveGain: P.cueGain, tonic: [[iTon, P.tonicCurrent]], kicks: { chans: [K], p: 0.02, gain: P.cueGain } } };
}

class RecallTask {
  constructor(seed, P, spec, K) {
    this.P = P; this.K = K; this.rng = mulberry32((seed ^ 0x2545f491) >>> 0);
    this.t = 0; this.trial = 0; this.phaseT = 0; this.phase = 'iti';
    this.correct = 0; this.wrong = 0; this.silent = 0; this.shaping = 0; this.rewardLog = []; this.log = [];
    this.counts = new Float64Array(K); this.lastCounts = new Float64Array(K);
    // balanced, shuffled symbol sequence
    const n = P.nTrials; this.seq = []; for (let i = 0; i < n; i++) this.seq.push(i % K);
    for (let i = n - 1; i > 0; i--) { const j = (this.rng() * (i + 1)) | 0; [this.seq[i], this.seq[j]] = [this.seq[j], this.seq[i]]; }
    this.delays = this.seq.map(() => Math.max(0, Math.round(P.delay + (P.delayJitter ? (this.rng() * 2 - 1) * P.delayJitter : 0))));
    this.lastChoice = -1; this.lastOk = null; this.hits = [];
    // v20 (round 21): mapping 'random' = the rewarded answer for each cue is a random permutation, new every lifetime
    // (must be learned from reward alone; separate RNG stream, so the trial sequence is the same as with 'same')
    if (P.mapping === 'random') { const r2 = mulberry32(Math.imul(seed ^ 0x6a09e667, 0x85ebca6b) >>> 0), m = Array.from({ length: K }, (_, i) => i);
      for (let i = K - 1; i > 0; i--) { const j = (r2() * (i + 1)) | 0; [m[i], m[j]] = [m[j], m[i]]; } this.map = m; }
    this.horizon = this.seq.reduce((s, x, i) => s + P.iti + P.cueTicks + this.delays[i] + P.respTicks, 0);
  }
  get done() { return this.trial >= this.seq.length; }
  get symbol() { return this.seq[this.trial]; }
  phaseLen(ph) { const P = this.P; return ph === 'iti' ? P.iti : ph === 'cue' ? P.cueTicks : ph === 'delay' ? this.delays[this.trial] : P.respTicks; }
  sense(ext) {
    const P = this.P, K = this.K;
    while (this.phaseT >= this.phaseLen(this.phase)) this.nextPhase();
    if (this.phase === 'cue') ext[this.symbol] = P.cueGain;               // one-hot cue
    const nG = goBroadcast(P) ? P.nGo : 1;
    if (this.phase === 'resp') for (let i = 0; i < nG; i++) ext[K + i] = P.goGain;   // go signal
    ext[K + nG] = P.tonicCurrent;
  }
  nextPhase() { this.phaseT = 0; this.phase = { iti: 'cue', cue: 'delay', delay: 'resp', resp: 'iti' }[this.phase]; if (this.phase === 'resp') this.counts.fill(0); }
  act(out) {
    const K = this.K; let ev = null;
    if (this.phase === 'resp') {
      for (let k = 0; k < K; k++) this.counts[k] += out.spikes[k];
      if (this.phaseT === this.P.respTicks - 1) ev = this.decide();
    } else if (this.P.holdPenalty) { let s = 0; for (let k = 0; k < K; k++) s += out.spikes[k]; if (s) this.shaping -= this.P.holdPenalty * s / 100; }
    this.phaseT++; this.t++;
    return ev;
  }
  decide() {
    const K = this.K, c = this.counts, k = Dec.wta(c), target = this.map ? this.map[this.symbol] : this.symbol;
    let other = 0, tot = 0; for (let j = 0; j < K; j++) { tot += c[j]; if (j !== target) other = Math.max(other, c[j]); }
    this.shaping += 0.25 * (c[target] - other) / (tot + 2);     // small graded bonus (margin of the right answer)
    let r;
    if (k < 0) { this.silent++; r = -0.5; } else if (k === target) { this.correct++; r = 1; } else { this.wrong++; r = -(this.P.wrongCost ?? 1); }
    this.lastCounts.set(c); this.lastChoice = k; this.lastOk = k === target; this.hits.push(k === target ? 1 : 0); this.lastTarget = target;
    this.log.push({ target, choice: k }); if (this.log.length > 40) this.log.shift();
    this.rewardLog.push([this.t, r]);
    this.trial++; this.phaseT = 0; this.phase = 'iti';
    while (!this.done && this.phaseLen('iti') === 0 && false);
    return { pos: r > 0 ? 1 : 0, neg: r < 0 ? -r : 0, pain: 0, reward: r, outcome: true };
  }
  get passRate() { const n = this.correct + this.wrong + this.silent; return n ? this.correct / n : 0; }
  score() { return this.correct - this.wrong; }
  fitness() { const n = Math.max(1, this.seq.length); return (this.correct - this.wrong - 0.5 * this.silent + this.shaping) / n * 10; }
  quarter(i) { const h = this.hits, a = Math.floor(h.length * i / 4), b = Math.floor(h.length * (i + 1) / 4); let s = 0; for (let j = a; j < b; j++) s += h[j]; return b > a ? s / (b - a) : 0; }
  stats() { const o = { trials: this.trial, correct: this.correct, wrong: this.wrong, silent: this.silent, pass: this.passRate, delay: this.P.delay };
    if (this.map) Object.assign(o, { firstQuarter: this.quarter(0), lastQuarter: this.quarter(3) }); return o; }
  statusLine() { return `trial ${Math.min(this.trial + 1, this.seq.length)}/${this.seq.length} · ${this.phase} · correct ${this.correct} wrong ${this.wrong} silent ${this.silent} · pass ${(100 * this.passRate).toFixed(0)}% · delay ${this.P.delay}`; }
  get drawsOutputs() { return true; }
  keyStats() { return `pass ${(100 * this.passRate).toFixed(0)}%`; }   // v19: shown only in the app's status line
  outputView() { return Array.from(this.counts, (v, k) => ({ name: (this.names ? this.names[k] : 'out' + k) + ' spikes', v, lo: 0, hi: Math.max(8, ...this.counts) })); }
  render(c, W, H) { renderRecall(this, c, W, H); }
}

function renderRecall(T, c, W, H) {
  const K = T.K, P = T.P;
  c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#222'; c.font = '14px system-ui';
  c.fillText(`trial ${Math.min(T.trial + 1, T.seq.length)}/${T.seq.length} · ${T.phase} · correct ${T.correct} · wrong ${T.wrong} · silent ${T.silent}`, 16, 24);
  // cue lights
  const bw = Math.min(110, (W - 80) / K), x0 = W / 2 - bw * K / 2;
  for (let k = 0; k < K; k++) {
    const on = T.phase === 'cue' && T.symbol === k, x = x0 + k * bw;   // (cue lights; with a random mapping the rewarded answer is hidden)
    c.fillStyle = on ? '#ffcc33' : '#d8d3c8'; c.beginPath(); c.arc(x + bw / 2, 90, Math.min(28, bw / 2 - 6), 0, 7); c.fill();
    c.fillStyle = '#333'; c.font = '13px system-ui'; c.textAlign = 'center'; c.fillText(T.names ? T.names[k] : 'sym ' + k, x + bw / 2, 140);
  }
  // go light
  c.fillStyle = T.phase === 'resp' ? '#3cb54a' : '#d8d3c8'; c.beginPath(); c.arc(W / 2, 185, 16, 0, 7); c.fill();
  c.fillStyle = '#333'; c.fillText('GO', W / 2, 215);
  // timeline of the current trial
  const phases = ['iti', 'cue', 'delay', 'resp'], lens = phases.map(p => T.done ? 1 : T.phaseLen(p)), tot = lens.reduce((a, b) => a + b, 0) || 1;
  let x = 40; const tw = W - 80;
  phases.forEach((p, i) => { const w = lens[i] / tot * tw; c.fillStyle = p === T.phase ? '#5f8cff' : '#c9c3b6'; c.fillRect(x, 240, w - 2, 16);
    c.fillStyle = '#333'; c.font = '11px system-ui'; c.fillText(p, x + w / 2, 272); if (p === T.phase) { c.fillStyle = '#000'; c.fillRect(x + Math.min(w - 2, T.phaseT / Math.max(1, lens[i]) * w), 236, 2, 24); } x += w; });
  // response spike counts (current window) / last decision
  c.textAlign = 'left'; c.font = '13px system-ui';
  for (let k = 0; k < K; k++) {
    const v = T.phase === 'resp' ? T.counts[k] : T.lastCounts[k], mx = Math.max(10, ...(T.phase === 'resp' ? T.counts : T.lastCounts)), xx = x0 + k * bw;
    c.fillStyle = '#ddd'; c.fillRect(xx + 10, 300, bw - 20, 80); c.fillStyle = k === T.lastChoice && T.phase !== 'resp' ? (T.lastOk ? '#3cb54a' : '#e04848') : '#5f8cff';
    const h = v / mx * 80; c.fillRect(xx + 10, 380 - h, bw - 20, h);
    c.fillStyle = '#333'; c.textAlign = 'center'; c.fillText(String(v | 0), xx + bw / 2, 396);
  }
  c.textAlign = 'left'; c.fillStyle = '#555'; c.fillText(T.phase === 'resp' ? 'output spikes in the response window' : 'last decision (green = correct, red = wrong)', 40, 296);
  // recent trials
  c.fillText('recent trials:', 40, 430);
  T.log.forEach((l, i) => { c.fillStyle = l.choice < 0 ? '#999' : l.choice === l.target ? '#3cb54a' : '#e04848'; c.fillRect(140 + i * 13, 420, 10, 10); });
  if (T.map) { c.fillStyle = '#555'; c.fillText('answer mapping (hidden from the brain): ' + T.map.map((m, k) => (T.names ? T.names[k] : k) + '→' + (T.names ? T.names[m] : m)).join(' '), 40, 452); }
  c.fillStyle = '#555'; c.fillText(`cue ${P.cueTicks} · delay ${T.done ? P.delay : T.delays[T.trial]} · response ${P.respTicks} · inter-trial ${P.iti} ticks` + (P.curriculum ? ` · curriculum on (target ${(100 * P.passTarget) | 0}%)` : ''), 40, 470);
}

const COMMON = {
  nTrials: { value: 20, min: 4, max: 60, step: 2, label: 'Trials per episode' },
  delay: { value: 10, min: 0, max: 200, step: 1, label: 'Delay (ticks)', note: 'no cue, no go' },
  delayJitter: { value: 0, min: 0, max: 20, step: 1, label: 'Delay jitter ± (ticks)' },
  cueTicks: { value: 5, min: 1, max: 20, step: 1, label: 'Cue duration (ticks)' },
  respTicks: { value: 10, min: 2, max: 30, step: 1, label: 'Response window (ticks)' },
  iti: { value: 15, min: 0, max: 60, step: 1, label: 'Inter-trial interval (ticks)' },
  curriculum: { value: false, label: 'Curriculum: grow the delay when the champion passes' },
  passTarget: { value: 0.8, min: 0.5, max: 1, step: 0.05, label: 'Curriculum pass target' },
  delayStep: { value: 5, min: 1, max: 50, step: 1, label: 'Curriculum delay step' },
  delayMax: { value: 100, min: 5, max: 400, step: 5, label: 'Curriculum max delay' },
  mapping: { value: 'same', label: 'Rewarded answer', options: [['same', 'the cued side / symbol'], ['random', 'random mapping per lifetime (learn from reward alone)']] },
  holdPenalty: { value: 0, min: 0, max: 2, step: 0.1, label: 'Penalty for output spikes before GO', note: '0 = off' },
  cueGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  cueX: { value: 0.6, hidden: true }, goBroadcast: { value: false, hidden: true }, wrongCost: { value: 1, hidden: true }, nGo: { value: 9, hidden: true },
};
// curriculum hook: test the champion (2 of its validation regrowths x 1 fresh episode each);
// lengthen the delay if it passes. (Its own-seed growth is not used: it can be an unlucky growth.)
function curriculum(evo, P) {
  if (!P.curriculum || !evo.champion) return { delay: P.delay };
  const env = evo.env, g = evo.champion.genome; let c = 0, n = 0;
  for (let k = 0; k < 2; k++) { const a = runEpisode(g, 880000 + evo.gen * 7 + k, evo.grow(g, evo.growSeed(g, k, true), true), env); c += a.task.correct; n += a.task.seq.length; }
  const pass = c / n;
  if (pass >= P.passTarget && P.delay < P.delayMax) { P.delay = Math.min(P.delayMax, P.delay + P.delayStep); evo.champion.val = -Infinity; }   // harder task: champion must re-qualify
  return { delay: P.delay, pass };
}

registerEnv({
  id: 'cue', name: 'Cue-then-turn (memory)', view: { width: VIEW_W, height: VIEW_H },
  description: 'A cue on the left or right, a delay, then GO: turn to the cued side. Needs working memory.',
  defaultPlan: P => P.mapping === 'random' ? 'rewardMemK' : 'memoryK',   // v20: reward-only learning of a random mapping needs the actor-critic plan
  params: Object.assign({}, COMMON),
  io: P => recallIO(P, 2, ['cue_left', 'cue_right'], ['turn_left', 'turn_right']),
  create(seed, P, spec) { const t = new RecallTask(seed, P, spec, 2); t.names = ['left', 'right']; return t; },
  onGeneration: curriculum,
});
registerEnv({
  id: 'recall', name: 'Sequence: symbol recall', view: { width: VIEW_W, height: VIEW_H },
  description: 'A symbol (one-hot) is shown, then a delay, then GO: output the same symbol (winner-take-all).',
  defaultPlan: P => P.mapping === 'random' ? 'rewardMemK' : 'memoryK',   // v20: reward-only learning of a random mapping needs the actor-critic plan
  params: Object.assign({}, COMMON, { K: { value: 4, min: 2, max: 16, step: 1, label: 'Alphabet size (symbols)' }, cueX: { value: 0.8, hidden: true },
                                      outLayout: { value: 'aligned', hidden: true } }),
  io: P => { const K = P.K | 0, s = 'ABCDEFGHIJKLMNOP'.slice(0, K).split(''); return recallIO(P, K, s.map(x => 'sym_' + x), s.map(x => 'out_' + x)); },
  create(seed, P, spec) { const K = P.K | 0, t = new RecallTask(seed, P, spec, K); t.names = 'ABCDEFGHIJKLMNOP'.slice(0, K).split(''); return t; },
  onGeneration: curriculum,
});

/* ---------- hand-designed MEMORY plan (for cue-then-turn) ----------
 * One progenitor per side at (±0.5, 0.35), on the path of that side's cue axon.
 * One position gene ("lateral": farther than 0.5 from the midline) splits each clone:
 *   M  (lateral half) excitatory, SLOW membrane, receives the cue of its side (tag 1),
 *      4 short local collaterals onto other M cells (address 7: self-excitation =
 *      persistent activity) and onto X cells (address 2); main axon = PROJECTION to
 *      the same-side output (turn to that side).
 *   X  (medial half) inhibitory, driven by the cue and by local M collaterals;
 *      COMMISSURAL axon (no synapses before crossing the midline) that inhibits the
 *      other side's M (address 0).
 * A cue on one side switches that side's M population on and, through X, the other
 * side's off (a flip-flop), so the last cue is held through the delay. Strong cue
 * synapses (wIn 30) let a new cue overturn the old memory. */
function createMemoryPlan(tune) {
  const T = Object.assign({ s7: 1, t7: 1, s2: 2, leak: 1, clen: -1, xLat: 0.5, y: 0.35, x: 0.5, wHid: 10, wIn: 30, thr: 0, reach: 1.6, xcue: 5, t0: 5, sx: 5 }, tune);
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, 0.6, 0.3, 0.6, 0.3, 0.3, 0.3];
  wg(0, 0, -40); wg(0, BIAS, 40 * Math.exp(-T.xLat / lam[0]));   // s0: lateral? (+1 farther than xLat from the midline)
  wg(6, TIME, -40); wg(6, BIAS, 40 * 0.14);                      // s6: proliferation clock (+1 while t < 0.14)
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  const fate = (out, M, X) => { r(out, 0, (M - X) / 2); rb(out, (M + X) / 2); };   // gene 0 = +1 in M, -1 in X
  for (let o = 0; o < CH_NO; o++) rb(o, -5);                     // everything off unless set below
  for (let k = 0; k < 7; k++) rb(k < 6 ? CO.G + k : CO.G6, 0);   // guidance weights 0 = indifferent
  r(CO.DIV, 6, 5); rb(CO.DIV, 0); r(CO.AXON, 6, -5); rb(CO.AXON, 0);
  fate(CO.INH, -5, 5); rb(CO.THR, T.thr); fate(CO.BRANCH, 5, 5);
  fate(CO.T + 1, 5, T.xcue); fate(CO.T + 2, -5, 5); fate(CO.T + 7, T.t7, -5);
  fate(CO.T + 0, T.t0, -5);                                   // M: address for the crossed inhibition (X seek tag 0)
  fate(CO.S + 7, T.s7, -5); fate(CO.S + 0, -5, T.sx); fate(CO.S + 2, T.s2, -5); fate(CO.S + 4, 5, -5);
  fate(CO.G + 0, 0, 5); fate(CO.G + 1, -5, 0); fate(CO.G + 3, 5, 0);
  fate(CO.COLL, 5, -5); fate(CO.CLEN, T.clen, -5); fate(CO.LEAK, T.leak, -5); fate(CO.PROJ, 5, -5); fate(CO.XSYN, -5, 5);
  return { kind: 'cell', label: 'hand-designed memory plan (slow recurrent M + crossed inhibition)', seed: 1, Wg, R, lam,
           seeds: T.xX != null ? [[-T.x, T.y], [T.x, T.y], [-T.xX, T.y], [T.xX, T.y]] : [[-T.x, T.y], [T.x, T.y]], s0: new Array(H).fill(0),
           sc: Object.assign(cellDefaults(), { pDiv: 0.9, maxCells: 120, trophHid: 0.3, wHid: T.wHid, wIn: T.wIn, eyeReach: T.reach }),
           pl: Object.assign(defaultPlasticity(), { lr: 0.01, aMinus: 0.3 }), nCh: 1, ch: [defaultChannel()], fitness: null };
}
registerPlan('memory', 'memory plan (cue-then-turn)', () => createMemoryPlan(), 'central zone only: slow self-exciting M cells driven by the cue, crossed inhibitory X cells');

/* ---------- hand-designed K-WAY MEMORY plan 'memoryK' (any number of symbols) ----------
 * A generic winner-take-all working-memory motif; nothing in it depends on K.
 * A row of progenitors across the tissue makes a band of cells. Position (front/back) splits the band:
 *   M (front rows) excitatory memory cells with the TOPO gene: each cell takes the positional label of
 *      where it sits, so it receives the cue axon above it, excites only nearby M cells with the same
 *      label (self-excitation of a column = persistent activity), excites the X cells below it, and
 *      projects to the output with its label. Columns form wherever input channels are.
 *   X (back rows) inhibitory cells with BIFURCATING axons (parallel fibres) that run along the M band
 *      (they follow signal A that M cells emit) and inhibit every M cell they pass: SHARED inhibition.
 * A cue switches its column on; the column's X activity inhibits all columns, so only the most
 * strongly driven column survives (the new cue beats the old memory). SYNAPTIC SCALING (normE / normI)
 * gives every cell the same total excitation and inhibition, so the attractor does not depend on how
 * many axons happened to find a cell; GROWTH UNTIL SATISFIED gives unconnected collaterals a 2nd try. */
function createMemoryKPlan(tune) {
  const T = Object.assign({ y: 0.42, yM: 0.333, yTop: 0.583, xc: 0.17, nSeed: 13, x0: 0.9, tc: 0.3, maxCells: 260, topoW: 0.1, snap: 1, normE: 45, normI: 200, satisfy: 2,
                            wIn: 30, wHid: 10, leak: 0, clen: -2, t0: 5, sx: 5, thr: 0, xthr: 0, branchMax: 40, mBranch: -1, em4: 3, g4: 5,
                            coll: 5, reach: 1.7, homeo: 0, xgo: 5 }, tune);
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, 0.6, 0.3, 0.6, 0.15, 0.3, 0.3];
  wg(0, 1, 40); wg(0, BIAS, -40 * Math.exp(-(1 - T.yM) / lam[1]));   // s0: +1 in the front rows (M), -1 behind
  wg(1, 0, 40); wg(1, BIAS, -40 * Math.exp(-T.xc / lam[0]));          // s1: +1 near the midline (central), -1 lateral
  wg(2, 1, 40); wg(2, BIAS, -40 * Math.exp(-(1 - T.yTop) / lam[1]));  // s2: +1 in front of the band (these cells die)
  const G = k => CH_NCHEM + k;                                          // s3: +1 = inside the circuit (M band, or X region)
  wg(3, G(0), 20); wg(3, G(1), 20); wg(3, G(2), -60); wg(3, BIAS, -40);   //     = s0 + s1 - 3 s2 - 2 > 0
  wg(6, TIME, -40); wg(6, BIAS, 40 * T.tc);                          // s6: proliferation clock (+1 while t < tc)
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  // fate(out, M, X): M = front cells, X = back & central cells (AND of genes 0 and 1); back & lateral cells die
  const fate = (out, M, X) => { const lo = Math.min(M, X), hi = Math.max(M, X); r(out, 0, (M - X) / 2); rb(out, (M + X) / 2);
    if (X > M) { r(out, 1, (X - M) / 2); rb(out, (M + X) / 2 - (X - M) / 2); } };
  for (let o = 0; o < CH_NO; o++) rb(o, -5);
  for (let k = 0; k < 7; k++) rb(k < 6 ? CO.G + k : CO.G6, 0);
  r(CO.DIV, 6, 5); rb(CO.DIV, 0); r(CO.AXON, 6, -5); r(CO.AXON, 3, 5); rb(CO.AXON, -5);   // neurons after proliferation, inside the circuit only
  r(CO.DIE, 3, -10);                                                    // cells outside the circuit die (apoptosis)
  fate(CO.INH, -5, 5); fate(CO.THR, T.thr, T.xthr); fate(CO.BRANCH, T.mBranch, 5);
  fate(CO.T + 1, 5, -5); fate(CO.T + 3, -5, T.xgo); fate(CO.T + 7, 5, -5); fate(CO.T + 0, T.t0, -5);
  fate(CO.S + 7, 5, -5); fate(CO.S + 4, 5, -5); fate(CO.S + 0, -5, T.sx);
  fate(CO.TOPO, 5, -5); fate(CO.BIF, -5, 5); fate(CO.PROJ, 5, -5); fate(CO.COLL, T.coll, -5); fate(CO.CLEN, T.clen, -5);
  fate(CO.LEAK, T.leak, -5); fate(CO.EM4, T.em4, -5);
  fate(CO.G + 3, 5, 0); fate(CO.G + 1, -5, 0); fate(CO.G + 4, 0, T.g4);       // M: down to the outputs; X: along the M band
  const seeds = spread(T.nSeed, -T.x0, T.x0).map(x => [x, T.y]);
  return { kind: 'cell', label: 'hand-designed K-way memory plan (topographic columns + shared inhibition)', seed: 1, Wg, R, lam, seeds, s0: new Array(H).fill(0),
           sc: Object.assign(cellDefaults(), { pDiv: 0.9, maxCells: T.maxCells, trophHid: 0.3, wHid: T.wHid, wIn: T.wIn, eyeReach: T.reach, topoW: T.topoW, topoSnap: T.snap,
                                               normE: T.normE, normI: T.normI, satisfy: T.satisfy, branchMax: T.branchMax, homeoRate: T.homeo }),
           pl: Object.assign(defaultPlasticity(), { lr: 0.01, aMinus: 0.3 }), nCh: 1, ch: [defaultChannel()], fitness: null };
}
registerPlan('memoryK', 'K-way memory plan (any number of symbols)', () => createMemoryKPlan(), 'topographic memory columns (one per input channel) + shared inhibition by parallel-fibre interneurons');
Object.assign(SpikingArena, { RecallTask, createMemoryPlan, createMemoryKPlan });
})();
