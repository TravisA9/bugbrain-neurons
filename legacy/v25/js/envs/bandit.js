/* =====================================================================
 * envs/bandit.js (v20, round 21) — REWARD-ONLY learning.
 *   'bandit'  Contextual K-armed bandit: each trial shows one of C context cues, then GO; the brain picks an arm
 *             (winner-take-all over response-window spikes). The chosen arm pays +1 with its probability (best arm of
 *             the context pHi, the others pLo); there is no teacher and no hint which arm is best. The best arm of
 *             each context is drawn anew every lifetime and again every 'switchEvery' trials (changing rewards),
 *             so it must be learned, and re-learned, from reward alone within the lifetime.
 *   Plan 'rewardK': the actor-critic body plan (see below).
 * ===================================================================== */
(function () {
'use strict';
const SA = SpikingArena, VIEW_W = 700, VIEW_H = 480;

function banditIO(P) {
  const C = P.C | 0, K = P.K | 0, xs = C === 1 ? [0] : spread(C, -0.8, 0.8), ox = spread(K, -0.8, 0.8);
  const inputs = Array.from({ length: C }, (_, c) => ({ name: 'ctx_' + 'ABCD'[c], group: 'symbol', tag: 1, cls: 1, pos: [xs[c], 1], cue: true, topo: xs[c] }));
  // GO is broadcast across the tissue (like the two-phase clock of seq): nGo diffuse copies, so every action column gets it
  spread(P.nGo, -0.9, 0.9).forEach((x, i) => inputs.push({ name: 'go' + i, group: 'go', tag: 3, cls: 4, pos: [x, 0.95], midline: true, diffuse: true }));
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.9], midline: true, tonic: true });
  const outputs = Array.from({ length: K }, (_, k) => ({ name: 'arm_' + (k + 1), group: 'choice', tag: 4, cls: 5 + (k % 3), pos: [ox[k], -1], bias: P.outBias, topo: ox[k] }));
  return { inputs, outputs, classes: ['cue', 'symbol', 'unused', 'tonic', 'go', 'out-A', 'out-B', 'out-C'],
           tagNames: ['tag 0', 'cue', 'tag 2', 'go', 'output', 'tag 5', 'tonic', 'free'],
           juvenile: { waves: [inputs.slice(0, C).map((x, c) => c)], pairs: [], waveGain: P.cueGain, tonic: [[C + P.nGo, P.tonicCurrent]], kicks: { chans: [C], p: 0.02, gain: P.cueGain } } };
}

class BanditTask {
  constructor(seed, P) {
    this.P = P; this.C = P.C | 0; this.K = P.K | 0; this.rng = mulberry32((seed ^ 0x1b873593) >>> 0); const r2 = this.r2 = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    this.t = 0; this.trial = 0; this.phaseT = 0; this.phase = 'iti';
    this.ctx = Array.from({ length: P.nTrials }, () => (this.rng() * this.C) | 0);
    this.best = []; this.drawBest();
    this.counts = new Float64Array(this.K); this.lastCounts = new Float64Array(this.K);
    this.hits = []; this.rewards = []; this.silent = 0; this.nRew = 0; this.log = []; this.rewardLog = []; this.lastChoice = -1; this.lastRew = null;
    // reference learner on the same trials (does not affect the brain's stream): discounted Beta-Bernoulli Thompson sampling
    this.ref = Array.from({ length: this.C }, () => Array.from({ length: this.K }, () => [1, 1])); this.refHits = []; this.refRng = mulberry32((seed ^ 0x27d4eb2f) >>> 0);
    this.horizon = P.nTrials * (P.iti + P.cueTicks + P.delay + P.respTicks);
  }
  drawBest() { for (let c = 0; c < this.C; c++) { let b; do { b = (this.r2() * this.K) | 0; } while (this.K > 1 && this.best.length === this.C && b === this.best[c] && this.trial > 0); this.best[c] = b; } }
  get done() { return this.trial >= this.ctx.length; }
  get context() { return this.ctx[this.trial]; }
  prob(c, k) { return k === this.best[c] ? this.P.pHi : this.P.pLo; }
  phaseLen(ph) { const P = this.P; return ph === 'iti' ? P.iti : ph === 'cue' ? P.cueTicks : ph === 'delay' ? P.delay : P.respTicks; }
  sense(ext) {
    const P = this.P, C = this.C;
    while (this.phaseLen(this.phase) === 0 || this.phaseT >= this.phaseLen(this.phase)) { this.phaseT = 0; this.phase = { iti: 'cue', cue: 'delay', delay: 'resp', resp: 'iti' }[this.phase]; if (this.phase === 'resp') this.counts.fill(0); }
    if (this.phase === 'cue' || (P.cueHold && this.phase !== 'iti')) ext[this.context] = P.cueGain;
    if (this.phase === 'resp') for (let i = 0; i < P.nGo; i++) ext[C + i] = P.goGain;
    ext[C + P.nGo] = P.tonicCurrent;
  }
  act(out) {
    let ev = null;
    if (this.phase === 'resp') { for (let k = 0; k < this.K; k++) this.counts[k] += out.spikes[k]; if (this.phaseT === this.P.respTicks - 1) ev = this.decide(); }
    this.phaseT++; this.t++;
    return ev;
  }
  refChoose(c) {   // Thompson sample from Beta(a, b) per arm (gamma via sums of exponentials is exact for integer shapes; use a normal approx otherwise)
    const R = this.refRng, s = this.ref[c]; let best = -1, bv = -1;
    for (let k = 0; k < this.K; k++) { const [a, b] = s[k], m = a / (a + b), v = a * b / ((a + b) * (a + b) * (a + b + 1)), x = m + Math.sqrt(v) * gauss(R); if (x > bv) { bv = x; best = k; } }
    return best;
  }
  decide() {
    const c = this.context, k = Dec.wta(this.counts), P = this.P;
    // reference learner (same context, same reward probabilities)
    const kr = this.refChoose(c), rr = this.refRng() < this.prob(c, kr) ? 1 : 0;
    for (let j = 0; j < this.K; j++) { const s = this.ref[c][j]; s[0] = 1 + (s[0] - 1) * P.refDecay; s[1] = 1 + (s[1] - 1) * P.refDecay; }
    this.ref[c][kr][rr ? 0 : 1] += 1; this.refHits.push(kr === this.best[c] ? 1 : 0);
    let r = 0, ev;
    if (k < 0) { this.silent++; r = -P.silentCost; ev = { pos: 0, neg: P.silentCost, pain: 0, reward: r, outcome: true }; }
    else { const win = this.rng() < this.prob(c, k); r = win ? 1 : -P.missCost; if (win) this.nRew++; ev = { pos: win ? 1 : 0, neg: win ? 0 : P.missCost, pain: 0, reward: r, outcome: true }; }
    this.hits.push(k === this.best[c] ? 1 : 0); this.rewards.push(r > 0 ? 1 : 0);
    this.lastCounts.set(this.counts); this.lastChoice = k; this.lastRew = r > 0; this.lastCtx = c;
    this.log.push({ c, k, best: this.best[c], r }); if (this.log.length > 40) this.log.shift();
    this.rewardLog.push([this.t, r]);
    this.trial++; this.phaseT = 0; this.phase = 'iti';
    if (P.switchEvery > 0 && this.trial % P.switchEvery === 0 && !this.done) this.drawBest();
    return ev;
  }
  frac(a, i0, i1) { let s = 0; for (let j = i0; j < i1; j++) s += a[j]; return i1 > i0 ? s / (i1 - i0) : 0; }
  quarter(i, a) { a = a || this.hits; return this.frac(a, Math.floor(a.length * i / 4), Math.floor(a.length * (i + 1) / 4)); }
  get optRate() { return this.frac(this.hits, 0, this.hits.length); }
  // after each switch: optimal-choice rate in the 2nd half of every block (learned the current best arm)
  blockLate(a) { a = a || this.hits; const B = this.P.switchEvery > 0 ? this.P.switchEvery : a.length; let s = 0, n = 0;
    for (let b0 = 0; b0 < a.length; b0 += B) { const b1 = Math.min(a.length, b0 + B), m = b0 + Math.floor((b1 - b0) / 2); for (let j = m; j < b1; j++) { s += a[j]; n++; } } return n ? s / n : 0; }
  fitness() { const n = Math.max(1, this.ctx.length); return (this.nRew - this.P.silentCost * this.silent) / n * 10; }
  score() { return this.nRew; }
  stats() { return { trials: this.trial, optimal: this.optRate, firstQuarter: this.quarter(0), lastQuarter: this.quarter(3), blockLate: this.blockLate(), rewardRate: this.frac(this.rewards, 0, this.rewards.length),
                     silent: this.silent, chance: 1 / this.K, refOptimal: this.frac(this.refHits, 0, this.refHits.length), refLate: this.blockLate(this.refHits), refLastQuarter: this.quarter(3, this.refHits) }; }
  statusLine() { return `trial ${Math.min(this.trial + 1, this.ctx.length)}/${this.ctx.length} · ${this.phase} · best arm chosen ${(100 * this.optRate).toFixed(0)}% (last quarter ${(100 * this.quarter(3)).toFixed(0)}%) · rewarded ${this.nRew} · silent ${this.silent}`; }
  keyStats() { return this.hits.length ? `best arm ${(100 * this.optRate).toFixed(0)}% · last 20 ${(100 * this.frac(this.hits, Math.max(0, this.hits.length - 20), this.hits.length)).toFixed(0)}%` : 'best arm –'; }
  get drawsOutputs() { return true; }
  render(c, W, H) {
    const C = this.C, K = this.K, P = this.P;
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H); c.textAlign = 'left'; c.font = '11px system-ui'; c.fillStyle = '#666';
    c.fillText(`${C} context${C > 1 ? 's' : ''} × ${K} arms · best arm pays ${(100 * P.pHi) | 0}%, others ${(100 * P.pLo) | 0}%` + (P.switchEvery ? ` · best arms change every ${P.switchEvery} trials` : '') +
      ` · chance ${(100 / K).toFixed(0)}% · reference learner (Thompson) ${(100 * this.frac(this.refHits, 0, this.refHits.length)).toFixed(0)}%`, 14, 18);
    c.fillStyle = '#222'; c.font = '14px system-ui'; c.fillText(`trial ${Math.min(this.trial + 1, this.ctx.length)}/${this.ctx.length} · ${this.phase}`, 14, 42);
    // context lights + GO
    const bw = 70, x0 = 40;
    for (let k = 0; k < C; k++) { const on = this.phase !== 'iti' && this.phase !== 'resp' && this.context === k; c.fillStyle = on ? '#ffcc33' : '#d8d3c8'; c.beginPath(); c.arc(x0 + k * bw + 20, 80, 18, 0, 7); c.fill();
      c.fillStyle = '#333'; c.font = '12px system-ui'; c.textAlign = 'center'; c.fillText('context ' + 'ABCD'[k], x0 + k * bw + 20, 114); }
    c.fillStyle = this.phase === 'resp' ? '#3cb54a' : '#d8d3c8'; c.beginPath(); c.arc(x0 + C * bw + 30, 80, 14, 0, 7); c.fill(); c.fillStyle = '#333'; c.fillText('GO', x0 + C * bw + 30, 114);
    // arms: spikes in the response window, the best arm of the current context (hidden from the brain) outlined
    const cx = this.done ? this.lastCtx : this.context, live = this.phase === 'resp', src = live ? this.counts : this.lastCounts, mx = Math.max(1, ...src), aw = Math.min(90, (W - 80) / K), ax = 40, ay = 140, ah = 70;
    for (let k = 0; k < K; k++) { const x = ax + k * aw, v = src[k], h = v / mx * ah;
      c.fillStyle = '#e3ded3'; c.fillRect(x, ay, aw - 10, ah);
      c.fillStyle = !live && k === this.lastChoice ? (this.lastRew ? '#3cb54a' : '#e04848') : '#5f8cff'; c.fillRect(x, ay + ah - h, aw - 10, h);
      if (cx != null && k === this.best[cx]) { c.strokeStyle = '#2a9d3a'; c.lineWidth = 2; c.strokeRect(x - 1, ay - 1, aw - 8, ah + 2); c.lineWidth = 1; }
      c.fillStyle = '#333'; c.textAlign = 'center'; c.font = '12px system-ui'; c.fillText(`arm ${k + 1} · ${v | 0}`, x + (aw - 10) / 2, ay + ah + 14); }
    c.textAlign = 'left'; c.fillStyle = '#555'; c.font = '12px system-ui';
    c.fillText(live ? 'output spikes in the response window' : 'last choice (green = rewarded, red = not); green outline = best arm now (hidden from the brain)', ax, ay - 8);
    // learning curve: best-arm rate per block of 10 trials (blue) vs the reference learner (grey), switches dashed
    const gx = 44, gy = 270, gw = W - 80, gh = 120, n = P.nTrials, bin = 10, xOf = i => gx + i / n * gw, yOf = a => gy + gh - a * gh;
    c.font = '12px system-ui'; c.fillStyle = '#333'; c.fillText(`best arm chosen per ${bin} trials over this lifetime (blue = brain, grey = reference learner)`, gx, gy - 8);
    c.strokeStyle = '#ccc'; c.strokeRect(gx, gy, gw, gh); c.fillStyle = '#888'; c.font = '10px system-ui'; c.textAlign = 'right';
    for (const a of [0, 0.5, 1]) c.fillText((a * 100) + '%', gx - 3, yOf(a) + 3);
    c.textAlign = 'center'; for (const i of [0, n / 2, n]) c.fillText(String(Math.round(i)), xOf(i), gy + gh + 12); c.fillText('trials', gx + gw / 2, gy + gh + 24);
    c.setLineDash([4, 3]); c.strokeStyle = '#999'; c.beginPath(); c.moveTo(gx, yOf(1 / K)); c.lineTo(gx + gw, yOf(1 / K)); c.stroke();
    if (P.switchEvery) { c.strokeStyle = '#d0a040'; for (let i = P.switchEvery; i < n; i += P.switchEvery) { c.beginPath(); c.moveTo(xOf(i), gy); c.lineTo(xOf(i), gy + gh); c.stroke(); } }
    c.setLineDash([]);
    const curve = (a, col) => { c.strokeStyle = col; c.fillStyle = col; c.beginPath(); let first = true;
      for (let i0 = 0; i0 < a.length; i0 += bin) { const i1 = Math.min(a.length, i0 + bin), v = this.frac(a, i0, i1), x = xOf((i0 + i1) / 2), y = yOf(v); first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; } c.stroke();
      for (let i0 = 0; i0 < a.length; i0 += bin) { const i1 = Math.min(a.length, i0 + bin); c.beginPath(); c.arc(xOf((i0 + i1) / 2), yOf(this.frac(a, i0, i1)), 2.5, 0, 7); c.fill(); } };
    curve(this.refHits, '#aaa'); curve(this.hits, '#3a6fd8');
    // recent trials
    c.textAlign = 'left'; c.fillStyle = '#555'; c.font = '12px system-ui'; c.fillText('recent trials (top: best arm chosen? bottom: rewarded?)', 40, 432);
    this.log.forEach((l, i) => { c.fillStyle = l.k < 0 ? '#999' : l.k === l.best ? '#3cb54a' : '#e04848'; c.fillRect(40 + i * 13, 440, 10, 10);
      c.fillStyle = l.r > 0 ? '#3cb54a' : '#ccc'; c.fillRect(40 + i * 13, 453, 10, 5); });
    this.drawn = { curve: Math.ceil(this.hits.length / bin) };
  }
}

registerEnv({
  id: 'bandit', name: 'Choice: contextual bandit (reward only)', view: { width: VIEW_W, height: VIEW_H },
  description: 'A context cue, then GO: pick one of K arms. Only the reward says which arm is good; the best arms are new every lifetime and change during it. Needs reward-driven lifetime learning.',
  defaultPlan: 'rewardK',
  params: {
    C: { value: 2, min: 1, max: 4, step: 1, label: 'Contexts (cues)' },
    K: { value: 3, min: 2, max: 6, step: 1, label: 'Arms' },
    pHi: { value: 0.9, min: 0.1, max: 1, step: 0.05, label: 'Reward probability of the best arm' },
    pLo: { value: 0.1, min: 0, max: 1, step: 0.05, label: 'Reward probability of the other arms' },
    switchEvery: { value: 60, min: 0, max: 400, step: 10, label: 'Best arms change every (trials)', note: '0 = never' },
    nTrials: { value: 240, min: 20, max: 1000, step: 20, label: 'Trials per lifetime' },
    missCost: { value: 0, min: 0, max: 1, step: 0.1, label: 'Dopamine dip when not rewarded', note: 'raw reward only' },
    silentCost: { value: 0.5, min: 0, max: 1, step: 0.1, label: 'Penalty for no answer' },
    cueTicks: { value: 4, min: 1, max: 20, step: 1, label: 'Cue duration (ticks)' },
    delay: { value: 0, min: 0, max: 50, step: 1, label: 'Delay (ticks)' },
    respTicks: { value: 6, min: 2, max: 30, step: 1, label: 'Response window (ticks)' },
    iti: { value: 8, min: 0, max: 60, step: 1, label: 'Inter-trial interval (ticks)' },
    cueHold: { value: true, label: 'Cue stays on until the answer' },
    refDecay: { value: 0.9, hidden: true }, nGo: { value: 9, hidden: true }, cueGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0.4, hidden: true },
  },
  io: banditIO,
  create(seed, P) { return new BanditTask(seed, P); },
});

/* ---------- ACTOR-CRITIC body plans 'rewardK' and 'rewardMemK' (v20) ----------
 * The transition-learning layout (createPredictPlan) turned into a basal-ganglia-like actor:
 *   M  topographic STATE columns, one per input channel. rewardK: relays of the present cue (no self-excitation, s7 -5);
 *      rewardMemK: working memory (self-exciting columns, s7 5) that holds the cue through a delay and is reset by GO
 *      through the shared inhibitory pool X (xgo 5), as in memoryK.
 *      Their axons bifurcate into parallel fibres that cross ALL action columns: the plastic ACTOR synapses.
 *   P  ACTION columns, one under every output (sc.topoOut): no teacher (pIn -5), driven by the broadcast GO (pGo 5, weight
 *      wGo) + the plastic fibres; each projects to its output. Shared inhibition (rcvInh) = competing columns; adaptive
 *      thresholds (rcvHomeo); one slow noise source per column (actNoise) = exploration; the chosen output excites its own
 *      column and inhibits the others (actFb, outInh), so the eligibility traces mark the action actually taken.
 *   CRITIC: a value cell reads the state cells (pl.rpe); dopamine = reward prediction error r - V at each outcome (rpeMode 1)
 *      drives reward-modulated STDP with eligibility traces (three-factor) of the actor, and the critic's own synapses. */
const RK = { pIn: -5, pGo: 5, xgo: -5, s7: -5, rule: 'rstdp', lrR: 0.05, tauElig: 100, wGo: 4 };
const RK_PL = { rpe: 1, rpeMode: 1, actNoiseV: 5, rpeGamma: 0.9, rpeLambda: 0.5, rpeLr: 0.3, preNorm: 45, rcvInh: 2, rcvInhTau: 4, actNoise: 8, actNoiseTau: 20, actFb: 15, outInh: 10, rcvHomeo: 0.02, rcvRate: 0.02, aMinus: 0.3 };
const RMK = { s7: 5, xgo: 5 };                // rewardMemK: working-memory state columns (reset by GO)
function createRewardPlan(tune, pl) {
  const T = Object.assign({}, RK, tune), d = SA.createPredictPlan(T); Object.assign(d.pl, RK_PL, T.separate ? {} : SA.UNIFIED_PL, pl);   // v22: unified rule (separate: v20 reward rule)
  d.sc.topoOut = 1; if (T.tauMod) d.ch[0].tauMod = T.tauMod; d.sc.wDiffuse = T.wGo;
  d.label = 'actor-critic plan (state columns -> plastic -> competing action columns; reward-prediction-error dopamine)'; return d;
}
registerPlan('rewardK', 'actor-critic plan (RPE dopamine, exploration noise, competing action columns)', () => createRewardPlan(),
  'state columns -> plastic parallel fibres -> action columns with shared inhibition and noise; reward-modulated STDP gated by a reward-prediction-error critic');
registerPlan('rewardMemK', 'actor-critic plan with working memory (cue -> delay -> choice)', () => { const d = createRewardPlan(RMK); d.label = d.label.replace('state columns', 'memory columns'); return d; },
  'rewardK whose state columns are self-exciting memory columns reset by GO (as in memoryK): the cue is held through the delay');
/* ---------- v21 (round 22) MULTI-REGION actor-critic 'rewardKR' ----------
 * The same gene program grown as two regions (see core/regions.js):
 *   'cortex' (sensory/state region): the state columns M (+ inhibitory X) of rewardK; its action band dies (kill P).
 *   'striatum' (action region, carries the outputs): the action columns P of rewardK; its state band dies (kill M).
 *   tract 'fibres' (map 'all', plastic): every state cell -> every action cell (corticostriatal parallel fibres), the actor's
 *   plastic synapses; the critic (value cell, RPE dopamine) reads their presynaptic cells, as in rewardK. */
function createRewardRegionsPlan(tune) {
  const T = Object.assign({ wTot: 45, p: 0.3, mem: false, killState: false }, tune), st = Object.assign({}, T.mem ? RMK : {}, T.state || {});
  const state = createRewardPlan(Object.assign({ kill: T.killState ? 'P' : null }, st)),   // v23: the cortex grows its whole program (no band killed; R24a)
    act = createRewardPlan(Object.assign({ kill: 'M', wGo: 8 }, T.action || {}));   // R22c: p 0.3, striatal GO weight 8 (best of a small sweep)
  return { kind: 'regions', label: 'two-region actor-critic plan (cortex state columns -> corticostriatal tract -> striatal action columns)', seed: 1,
    regions: [{ name: 'cortex', color: '#5aa9ff', g: state, inputs: [{ env: 'symbol' }, { env: 'go' }, { env: 'tonic' }] },
              { name: 'striatum', color: '#ffb347', g: act, inputs: [{ env: 'go' }, { env: 'tonic' }], outputs: true }],
    tracts: [{ name: 'fibres', from: { region: 0, cls: 0 }, to: { region: 1, wTot: T.wTot }, map: 'all', p: T.p, plastic: true }], fitness: null };
}
registerPlan('rewardKR', 'two-region actor-critic plan (cortex -> striatum tract)', () => createRewardRegionsPlan(),
  'rewardK grown as two regions: state columns in a cortex region, action columns in a striatum region, linked by a plastic corticostriatal tract');
registerPlan('rewardMemKR', 'two-region actor-critic plan with working memory (cortex memory columns -> striatum)', () => { const d = createRewardRegionsPlan({ mem: true }); d.label = d.label.replace('state columns', 'memory columns'); return d; },
  'rewardMemK grown as two regions: self-exciting memory columns (reset by GO) in a cortex region, action columns in a striatum region');
Object.assign(SA, { BanditTask, createRewardPlan, createRewardRegionsPlan, REWARD_K: RK, REWARD_K_PL: RK_PL, REWARD_MEM_K: RMK });
})();
