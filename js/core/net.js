'use strict';
/* ---------------- SpikingNet (net.js) ----------------
 * Leaky integrate-and-fire, exactly like the FlyNeuron sketch:
 *   v += input;  v = v_rest + (v - v_rest) * leak;
 *   if v >= v_thresh: spike, v = v_rest
 * Spikes are delivered through weighted synapses on the NEXT substep.
 * Synapses are stored sparse (CSR: outgoing list per neuron).
 *
 * 3b. LIFETIME LEARNING: reward-modulated STDP (three-factor rule)
 *   Every neuron keeps two decaying spike traces: xPre (tauPre) and xPost (tauPost).
 *   Every plastic synapse pre->post keeps an ELIGIBILITY trace e (tauElig):
 *     post spikes  -> e += xPre[pre]          (pre fired shortly BEFORE post: "causal", +)
 *     pre spikes   -> e -= aMinus*xPost[post] (post fired shortly before pre: "acausal", -)
 *   Nothing changes yet: e only marks "this synapse recently took part".
 *   One global DOPAMINE signal M is kicked by food (+gFood), poison and the
 *   predator (-gPoison), wall contact (-gWall), and decays (tauMod).
 *   (The code still supports several channels M[c] for imported networks;
 *   grown brains use one.) Every tick:  w += lr * M * e
 *   Weights keep their sign and |w| <= wMax. The genome weights are the
 *   starting point of every lifetime; learning never writes back.
 * 3c. Each synapse can count pre->post coincidences (net.use); the juvenile
 *   phase of cellular development uses them for activity refinement.        */
class SpikingNet {
  constructor(g, opts) {
    g = phenotype(g);
    this.g = g; this.nSpk = 0; this.spikeCount = 0;   // (v, syn = input arriving next step, ext = sensory current, spiked/spk, trace = smoothed spike train: sized below)
    // Build CSR adjacency from dense W
    const nCh = Math.max(1, g.nCh || 1), p0 = Object.assign({}, PL_DEFAULTS, g.pl);
    const NG = p0.ng > 0 && g.nHid > 0 && !(opts && opts.noNeed) ? this.planNeed(g, p0) : null;   // v28 need-growth: reserve cells appended after the grown cells (dormant)
    const N = this.N = g.N + (NG ? NG.R : 0);
    this.v = new Float32Array(N).fill(V_REST); this.syn = new Float32Array(N); this.ext = new Float32Array(N);
    this.spiked = new Uint8Array(N); this.spk = new Int32Array(N); this.trace = new Float32Array(N);
    const start = new Int32Array(N + 1), posts = [], pres = [], ws = [], plast = [], chs = [], N0 = g.N;
    for (let pre = 0; pre < N; pre++) {
      start[pre] = posts.length;
      if (pre < N0) for (let post = 0; post < N0; post++) {
        const i = pre * N0 + post, w = g.W[i];
        if (w !== 0 && !(NG && (NG.dead[pre] || NG.dead[post]))) { posts.push(post); pres.push(pre); ws.push(w); plast.push(g.P ? g.P[i] : 1); chs.push(g.C ? g.C[i] % nCh : 0); }
      }
      if (NG) { const ex = NG.extra[pre]; if (ex) for (const [post, pl] of ex) { posts.push(post); pres.push(pre); ws.push(pl ? 1e-6 : 0); plast.push(pl); chs.push(0); } }
    }
    start[N] = posts.length;
    const E = posts.length;
    this.start = start; this.posts = Int32Array.from(posts); this.pres = Int32Array.from(pres);
    this.ws = Float32Array.from(ws); this.w0 = Float32Array.from(ws); this.synCh = Uint8Array.from(chs);
    this.pruning = g.prune && g.prune.tick > 0 ? g.prune : null; this.pruned = 0; this.tickNo = 0;
    // plastic synapse list + incoming index (by post) for STDP (all synapses if pruning)
    const pl = []; for (let k = 0; k < E; k++) if (plast[k]) pl.push(k);
    this.plastic = Int32Array.from(pl); this.isPlastic = Uint8Array.from(plast);
    const inLists = Array.from({ length: N }, () => []);
    for (let k = 0; k < E; k++) if (plast[k] || this.pruning) inLists[posts[k]].push(k);
    this.inStart = new Int32Array(N + 1); const inE = [];
    for (let j = 0; j < N; j++) { this.inStart[j] = inE.length; for (const k of inLists[j]) inE.push(k); }
    this.inStart[N] = inE.length; this.inEdges = Int32Array.from(inE);
    this.elig = new Float32Array(E);
    this.use = this.pruning ? new Float32Array(E) : null; this.prunedMask = this.pruning ? new Uint8Array(E) : null;
    this.xPre = new Float32Array(N); this.xPost = new Float32Array(N);
    // modulator channels
    this.nCh = nCh;
    this.chs = (g.ch || channelsFromLegacy(g.pl)).slice(0, nCh).map(c => Object.assign({}, CH_DEFAULTS, c));
    while (this.chs.length < nCh) this.chs.push(defaultChannel());
    this.chSrc = this.chs.map(c => Int32Array.from(c.srcList || (c.src >= 0 && c.src < g.nHid ? [g.nIn + c.src] : [])));
    this.chSpikes = new Float32Array(nCh);   // source-neuron spikes this tick
    this.mods = new Float32Array(nCh);       // modulator level per channel
    this.mod = 0;                            // channel 0 (kept for older code / display)
    this.dwSum = 0;                          // |dw| summed this tick
    this.setPlasticityConsts();
    if (NG) { this.thr = Float32Array.from({ length: N }, (_, i) => i < N0 ? (NG.dead[i] ? 1e9 : g.thresh[i]) : 1e9); this.ngPlan = NG; for (let k = 0; k < E; k++) if (pres[k] >= N0 && plast[k]) this.ws[k] = 0; }
    if (this.p.teach > 0 || this.p.uni > 0) this.initTeach();   // v22: the unified rule detects instructive events too
    if (this.p.rcvDiv > 0 || this.p.rcvInh > 0 || this.p.rcvNoise > 0) this.initRcv();
    if (this.p.mixInh > 0 && g.mix) {   // v14 feedforward inhibition of mixing cells: their presynaptic cells and the mixing cells
      const mp = new Uint8Array(N), ml = []; for (let i = 0; i < N; i++) if (g.mix[i]) ml.push(i);
      for (let k = 0; k < this.posts.length; k++) if (g.mix[this.posts[k]] && this.ws[k] > 0) mp[this.pres[k]] = 1;
      this.mixPre = mp; this.mixList = Int32Array.from(ml); }
    if (g.mix && (this.p.mixLr > 0 || this.p.mixHomeo > 0)) this.initMixLearn();
    if (this.p.rpe > 0) this.initCritic();
    if (this.p.actNoise > 0 || this.p.actFb > 0 || this.p.outInh > 0) this.initActNoise();
    if (this.p.rcvHomeo > 0) { if (!this.thr) this.thr = Float32Array.from(g.thresh); const r = new Uint8Array(N); for (const k of this.plastic) if (this.w0[k] > 0) r[this.posts[k]] = 1;
      const L = []; for (let i = 0; i < N; i++) if (r[i]) L.push(i); this.rhList = Int32Array.from(L); }
    if (NG) this.initNeed();
  }
  /* v28 (R29) NEED-GROWTH: learning-driven recruitment of new cells during the lifetime (adult-neurogenesis analogue).
   * Its own signal, separate from connection demand (growth), dopamine (outcome) and homeostasis (activity):
   * the LEARNING LAYER L = cells with plastic excitatory outputs (mixing / conjunctive cells; the actor columns of reward plans),
   * its RECEIVERS = the targets of those plastic synapses, its SOURCES = the excitatory inputs of L.
   * Error per event: prediction receivers (instructive input) -> mismatch at each teacher onset = 1 - share of the recent
   * receiver activity that was on the taught cell; reward receivers -> negative outcome RPE (clipped to [0, 1]).
   * The area keeps a slow average E of its error (ngTau events). E above ngThr + ngCost x (new cells alive) for ngHold events
   * (and ngRef events after the last recruit) -> one quiescent reserve cell matures: its dendrites take a claw of sources
   * chosen by their error tags (sources active just before errors), its axon forms weak plastic synapses on the receivers
   * (the existing learning rules do the rest). Trophic test after ngTrial events: a new cell whose outgoing synapses gained
   * less than ngKeep x the layer's mean gain in that window returns to quiescence (pruned). Cap: the reserve size ngRes. */
  planNeed(g, p) {
    const N0 = g.N, nIn = g.nIn, h1 = g.nIn + g.nHid, W = g.W, P = g.P, isL = new Uint8Array(N0), isRc = new Uint8Array(N0);
    for (let a = nIn; a < h1; a++) for (let b = 0; b < N0; b++) { const q = a * N0 + b; if (W[q] > 0 && (!P || P[q])) { isL[a] = 1; isRc[b] = 1; } }
    let L = []; for (let i = 0; i < N0; i++) if (isL[i]) L.push(i);
    if (!L.length) return null;
    const dead = new Uint8Array(N0), red = p.ngReduce || 0;
    if (red > 0) { const r = mulberry32((0x6e6721 ^ N0 * 2654435761 ^ L.length) >>> 0), sh = L.slice();
      for (let k = sh.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [sh[k], sh[j]] = [sh[j], sh[k]]; }
      for (let k = 0; k < Math.floor(red * sh.length); k++) dead[sh[k]] = 1; }
    const isS = new Uint8Array(N0), cnt = [], tot = [], th = [];
    for (const l of L) { if (dead[l]) continue; let c = 0, t = 0; for (let a = 0; a < N0; a++) { const w = W[a * N0 + l]; if (w > 0 && !isL[a] && !dead[a]) { isS[a] = 1; c++; t += w; } } if (c) { cnt.push(c); tot.push(t); } th.push(g.thresh[l]); }
    const med = x => { const y = x.slice().sort((a, b) => a - b); return y.length ? y[y.length >> 1] : 0; };
    const S = []; for (let i = 0; i < N0; i++) if (isS[i]) S.push(i);
    const Rc = []; for (let i = 0; i < N0; i++) if (isRc[i] && !dead[i]) Rc.push(i);
    const wOut = Rc.map(b => { let s = 0, n = 0; for (const l of L) { if (dead[l]) continue; const w = W[l * N0 + b]; if (w > 0) { s += w; n++; } } return n ? s / n : 0; });
    const R = Math.max(0, Math.round(p.ngRes)), extra = new Array(N0 + R), k = Math.max(1, p.ngClaw > 0 ? Math.round(p.ngClaw) : med(cnt));
    if (!S.length || !Rc.length) return null;
    for (const s of S) extra[s] = Array.from({ length: R }, (_, j) => [N0 + j, 0]);
    for (let j = 0; j < R; j++) extra[N0 + j] = Rc.map(b => [b, 1]);
    return { R, N0, dead, L: L.filter(l => !dead[l]), S, Rc, wOut, k, wIn: med(tot) / k, thr0: med(th), extra, nDead: dead.reduce((a, b) => a + b, 0) };
  }
  initNeed() {
    const P = this.ngPlan, N = this.N, p = this.p, ng = this.ng = { on: [], act: [], E: 0, above: 0, since: 1e9, ev: 0, added: 0, pruned: 0, alive: 0, log: [], birth: new Float64Array(P.R).fill(-1), base: new Float64Array(P.R), baseL: new Float64Array(P.R), mature: new Uint8Array(P.R) };
    const sIdx = new Int32Array(N).fill(-1); P.S.forEach((s, q) => { sIdx[s] = q; }); ng.sIdx = sIdx; ng.sTr = new Float32Array(P.S.length); ng.tag = new Float32Array(P.S.length);
    const rcv = new Uint8Array(N); for (const b of P.Rc) rcv[b] = 1; ng.rcv = rcv; ng.tro = new Float64Array(N);
    let nInstr = 0; if (this.instrCell) for (const b of P.Rc) nInstr += this.instrCell[b];
    ng.pred = !!this.teachTr && nInstr * 2 > P.Rc.length; ng.dTr = ng.pred ? this.dPre : this.dElig;
    ng.instr = ng.pred ? P.Rc.filter(b => this.instrCell[b]) : [];
    ng.rng = mulberry32((0xbeef17 ^ N * 7919) >>> 0);
    // edge indices of each reserve cell: incoming (source -> r) and outgoing (r -> receivers)
    ng.inK = Array.from({ length: P.R }, () => []); ng.outK = Array.from({ length: P.R }, () => []);
    for (let k = 0; k < this.posts.length; k++) { const a = this.pres[k], b = this.posts[k]; if (b >= P.N0) ng.inK[b - P.N0].push(k); else if (a >= P.N0) ng.outK[a - P.N0].push(k); }
  }
  needTrace(spk, nSpk) {                       // source activity traces (the context active before an error)
    const ng = this.ng, t = ng.sTr, d = ng.dTr; for (let q = 0; q < t.length; q++) t[q] *= d;
    for (let s = 0; s < nSpk; s++) { const q = ng.sIdx[spk[s]]; if (q >= 0) t[q] += 1; }
  }
  needMiss() {                                // teacher onset (a column of receivers): mismatch = 1 - share of the recent receiver activity on the taught cells
    const tr = this.trace, I = this.ng.instr, on = this.ng.on; let sum = 0.05, hit = 0;
    for (let q = 0; q < I.length; q++) sum += tr[I[q]]; for (const i of on) hit += tr[i]; on.length = 0;
    this.needEvent(Math.max(0, 1 - hit / sum));
  }
  needEvent(err) {
    const ng = this.ng, p = this.p, P = this.ngPlan, tag = ng.tag, t = ng.sTr, a = 1 / Math.max(1, p.ngTau);
    ng.ev++; ng.since++; ng.E += a * (err - ng.E);
    for (let q = 0; q < tag.length; q++) tag[q] = tag[q] * (1 - a) + err * t[q];
    if (!params.plasticity) return;
    // trophic test of new cells at the end of their trial
    let Lm = 0; for (const l of P.L) Lm += ng.tro[l]; Lm /= Math.max(1, P.L.length);
    for (let j = 0; j < P.R; j++) if (ng.birth[j] >= 0 && !ng.mature[j] && ng.ev - ng.birth[j] >= p.ngTrial) {
      const gain = ng.tro[P.N0 + j] - ng.base[j], ref = Lm - ng.baseL[j];
      if (gain < p.ngKeep * ref) this.needPrune(j); else ng.mature[j] = 1; }
    ng.above = ng.E > p.ngThr + p.ngCost * ng.alive / Math.max(1, P.L.length) ? ng.above + 1 : 0;   // metabolic cost: the threshold rises with the new cells alive (relative to the layer)
    if (ng.above >= p.ngHold && ng.since >= p.ngRef) for (let n = 0; n < Math.max(1, p.ngBatch); n++) { const j = ng.birth.findIndex(b => b < 0); if (j < 0) break; this.needRecruit(j, Lm); }
  }
  needRecruit(j, Lm) {
    const ng = this.ng, P = this.ngPlan, r = P.N0 + j, tag = ng.tag, ws = this.ws, k = Math.min(P.k, P.S.length);
    const inK = ng.inK[j], w = Array.from(tag, x => x + 1e-6), chosen = [];
    for (let n = 0; n < k; n++) { let s = 0; for (const x of w) s += x; let u = ng.rng() * s, q = 0; for (; q < w.length - 1; q++) { u -= w[q]; if (u <= 0) break; } chosen.push(q); w[q] = 0; }
    for (const q of chosen) { ws[inK[q]] = P.wIn; this.w0[inK[q]] = P.wIn; tag[q] *= 0.5; }   // (source q's edge to r: extra lists were built in source order)
    const outK = ng.outK[j]; for (let q = 0; q < outK.length; q++) { ws[outK[q]] = P.wOut[q] * this.p.ngW; }
    if (this.p.preNorm > 0 && this.npStart) this.normPre(r);
    this.thr[r] = P.thr0; ng.birth[j] = ng.ev; ng.mature[j] = 0; ng.base[j] = ng.tro[r]; ng.baseL[j] = Lm; ng.since = 0; ng.above = 0;
    ng.added++; ng.alive++; ng.act.push(r); ng.log.push([ng.ev, 1, j, chosen.length]);
  }
  needPrune(j) {
    const ng = this.ng, P = this.ngPlan, r = P.N0 + j, ws = this.ws;
    for (const k of ng.inK[j]) { ws[k] = 0; this.w0[k] = 0; } for (const k of ng.outK[j]) { ws[k] = 0; this.elig[k] = 0; }
    this.thr[r] = 1e9; this.v[r] = V_REST; ng.birth[j] = -1; ng.act.splice(ng.act.indexOf(r), 1); ng.alive--; ng.pruned++; ng.log.push([ng.ev, -1, j]);
  }
  needStats() { const ng = this.ng; if (!ng) return null; return { mode: ng.pred ? 'mismatch' : 'negRPE', E: +ng.E.toFixed(3), events: ng.ev, added: ng.added, pruned: ng.pruned, alive: ng.alive, reserve: this.ngPlan.R, layer: this.ngPlan.L.length, dead: this.ngPlan.nDead, log: ng.log }; }
  // v20 action-channel noise: channel of a cell = the output it projects to most strongly (an output without such cells: itself)
  initActNoise() {
    const N = this.N, g = this.g, o0 = g.nIn + g.nHid, nO = g.nOut, ch = new Int16Array(N).fill(-1), best = new Float32Array(N), recv = new Uint8Array(N);
    for (const k of this.plastic) if (this.w0[k] > 0) recv[this.posts[k]] = 1;
    for (let k = 0; k < this.posts.length; k++) { const i = this.pres[k], j = this.posts[k]; if (j >= o0 && recv[i] && this.ws[k] > best[i]) { best[i] = this.ws[k]; ch[i] = j - o0; } }
    for (let m = 0; m < nO; m++) if (!ch.some(c => c === m)) ch[o0 + m] = m;   // an output without an action column gets the noise itself
    const L = [], C = []; for (let i = 0; i < N; i++) if (ch[i] >= 0) { L.push(i); C.push(ch[i]); }
    this.anList = Int32Array.from(L); this.anCh = Int16Array.from(C); this.anVal = new Float32Array(nO);
    this.anA = Math.exp(-1 / Math.max(1, this.p.actNoiseTau)); this.anRng = mulberry32(0x9e3779b1 ^ g.N);
    const Lr = [], Cr = []; for (let i = 0; i < o0; i++) if (ch[i] >= 0) { Lr.push(i); Cr.push(ch[i]); } this.acList = Int32Array.from(Lr); this.acCh = Int16Array.from(Cr);   // the columns (without outputs)
  }
  actLoop(sp) {                               // output spikes -> own column +actFb, other columns -actFb, other outputs -outInh
    const g = this.g, o0 = g.nIn + g.nHid, nO = g.nOut, fb = this.p.actFb, oi = this.p.outInh, syn = this.syn, L = this.acList, C = this.acCh;
    for (let m = 0; m < nO; m++) { if (!sp[o0 + m]) continue;
      if (fb > 0) for (let q = 0; q < L.length; q++) syn[L[q]] += C[q] === m ? fb : -fb;
      if (oi > 0) for (let j = 0; j < nO; j++) if (j !== m) syn[o0 + j] -= oi; }
  }
  actNoiseStep() {
    const v = this.anVal, a = this.anA, kv = this.crit && this.p.actNoiseV > 0 ? 1 / (1 + this.p.actNoiseV * Math.max(0, this.value)) : 1,   // v20: less exploration where more reward is expected
          sd = kv * this.p.actNoise * Math.sqrt(1 - a * a), r = this.anRng, L = this.anList, C = this.anCh, syn = this.syn;
    for (let m = 0; m < v.length; m++) { const u = r() || 1e-12, w = r(); v[m] = a * v[m] + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * w); }
    for (let q = 0; q < L.length; q++) syn[L[q]] += v[C[q]];
  }
  // v20 (round 21) critic: value V = sum u_i x_i over the state cells (see PL_DEFAULTS rpe*), TD error -> dopamine
  initCritic() {
    const N = this.N, g = this.g, h0 = g.nIn, h1 = g.nIn + g.nHid, src = this.p.rpeSrc, S = [];
    if (src === 1 && g.mix) { for (let i = h0; i < h1; i++) if (g.mix[i]) S.push(i); }
    if (!S.length && src !== 2) { const pre = new Uint8Array(N); for (const k of this.plastic) if (this.w0[k] > 0) pre[this.pres[k]] = 1; for (let i = 0; i < N; i++) if (pre[i]) S.push(i); }
    if (!S.length) for (let i = h0; i < h1; i++) S.push(i);
    this.crit = { S: Int32Array.from(S), u: new Float32Array(S.length), z: new Float32Array(S.length), xPrev: new Float32Array(S.length), Vprev: 0 };
    this.value = 0; this.delta = 0; this.lastDelta = 0; this.reward = 0;
  }
  // one critic step per tick: returns the TD error for reward r (and learns u)
  criticStep(r, outcome) {
    const c = this.crit, S = c.S, u = c.u, z = c.z, xp = c.xPrev, p = this.p, tr = this.trace, k = 1 - params.traceDecay;
    let V = 0; for (let q = 0; q < S.length; q++) V += u[q] * tr[S[q]] * k;
    if (p.rpeMode === 1) {                     // outcome-only (Rescorla-Wagner) critic: dopamine = r - V at outcome events (a reward, or a trial end the task marks with ev.outcome, so an omitted reward counts), 0 otherwise
      let delta = 0;
      if (r !== 0 || outcome) { delta = r - V; this.lastDelta = delta; if (params.plasticity && p.rpeLr > 0) { let xx = 0; for (let q = 0; q < S.length; q++) { const x = tr[S[q]] * k; xx += x * x; }
        const a = p.rpeLr * delta / (p.rpeEps + xx); for (let q = 0; q < S.length; q++) u[q] += a * tr[S[q]] * k; } }
      this.value = V; this.delta = delta; this.reward = r; return delta;
    }
    const delta = r + p.rpeGamma * V - c.Vprev, gl = p.rpeGamma * p.rpeLambda;
    let zz = 0; for (let q = 0; q < S.length; q++) { z[q] = gl * z[q] + xp[q]; zz += z[q] * z[q]; }
    if (params.plasticity && p.rpeLr > 0) { const a = p.rpeLr * delta / (p.rpeEps + zz); for (let q = 0; q < S.length; q++) u[q] += a * z[q]; }
    for (let q = 0; q < S.length; q++) xp[q] = tr[S[q]] * k;
    let V2 = 0; for (let q = 0; q < S.length; q++) V2 += u[q] * xp[q];   // value of the current state after learning
    c.Vprev = V2; this.value = V2; this.delta = delta; this.lastDelta = delta; this.reward = r;
    return delta;
  }
  // v15 learned mixing: incoming excitatory hidden synapses of each mixing cell (competitive rule), adaptive thresholds
  initMixLearn() {
    const N = this.N, g = this.g, nIn = g.nIn, h1 = g.nIn + g.nHid, inL = Array.from({ length: N }, () => []);
    for (let k = 0; k < this.posts.length; k++) { const j = this.posts[k], i = this.pres[k]; if (g.mix[j] && i >= nIn && i < h1 && this.ws[k] > 0) inL[j].push(k); }
    const st = new Int32Array(N + 1), idx = []; for (let j = 0; j < N; j++) { st[j] = idx.length; for (const k of inL[j]) idx.push(k); } st[N] = idx.length;
    this.mxStart = st; this.mxIdx = Int32Array.from(idx); this.mxTot = new Float32Array(N); this.mxCnt = new Float32Array(N);
    for (let j = 0; j < N; j++) for (let q = st[j]; q < st[j + 1]; q++) this.mxTot[j] += this.ws[idx[q]];
    if (this.p.mixHomeo > 0) { if (!this.thr) this.thr = Float32Array.from(g.thresh); const ml = []; for (let i = 0; i < N; i++) if (g.mix[i]) ml.push(i); this.mxList = Int32Array.from(ml); }
  }
  mixLearn(i) {                               // mixing cell i spiked: instar step toward its input traces
    const p = this.p, st = this.mxStart, idx = this.mxIdx, ws = this.ws, pres = this.pres, x = this.xPre, a = st[i], e = st[i + 1]; if (e === a) return;
    let sx = 0, n = 0; for (let q = a; q < e; q++) { const k = idx[q]; if (ws[k] > 0) { sx += x[pres[k]]; n++; } }
    if (sx < 0.05) return;
    let eta = p.mixLr; if (p.mixN > 0) eta *= p.mixN / (p.mixN + this.mxCnt[i]); this.mxCnt[i]++;
    if (p.mixGate > 0) { if (!this.npStart) this.buildNp(); const s0 = this.npStart[i], s1 = this.npStart[i + 1]; let sw = 0, h = 0;
      let nT = 0; for (let q = s0; q < s1; q++) { const k = this.npIdx[q]; sw += ws[k]; if (this.plat && this.plat[this.posts[k]] > 0) { h += ws[k]; nT++; } }
      const r = sw > 0 && nT > 0 ? Math.min(2, h / sw * (s1 - s0) / nT) : 0;   // output weight on taught cells relative to their number
      eta *= 1 - p.mixGate + p.mixGate * r / 2; }
    if (eta <= 0) return;
    const W = this.mxTot[i]; let s = 0;
    for (let q = a; q < e; q++) { const k = idx[q]; if (ws[k] > 0) { ws[k] += eta * (W * x[pres[k]] / sx - ws[k]); s += ws[k]; } }
    if (p.mixPrune > 0) { const lim = p.mixPrune * s / n; let s2 = 0;
      for (let q = a; q < e; q++) { const k = idx[q]; if (ws[k] > 0 && ws[k] < lim && n > 1) { ws[k] = 0; n--; } else s2 += ws[k]; }
      if (s2 > 0) for (let q = a; q < e; q++) { const k = idx[q]; if (ws[k] > 0) ws[k] *= W / s2; } }
  }
  // v9 teacher-gated plasticity: per-cell teacher trace / plateau, presynaptic weight normalisation.
  initTeach() {
    const N = this.N; this.teachTr = new Float32Array(N); this.plat = new Int16Array(N); this.armed = new Uint8Array(N).fill(1); this.drv = new Float32Array(N);
    if (this.p.uni > 0) { const sp = currentEnv().spec, nIn = this.g.nIn; this.uni = true;   // v22: only non-diffuse (topographic / cue) sensors carry instructive signals
      this.instrIn = new Uint8Array(nIn); for (let i = 0; i < nIn; i++) this.instrIn[i] = sp.inputs.length === nIn && sp.inputs[i] && !sp.inputs[i].diffuse && !sp.inputs[i].tonic ? 1 : 0;
      // a cell contacted by an instructive sensor (climbing fibre) learns from its instructive signal; every other plastic receiver
      // learns from the global dopamine through its eligibility traces (only those synapses keep traces: isE / eList)
      const ic = this.instrCell = new Uint8Array(N); for (let i = 0; i < nIn; i++) if (this.instrIn[i]) for (let k = this.start[i], e = this.start[i + 1]; k < e; k++) if (this.ws[k] > 0) ic[this.posts[k]] = 1;
      this.isE = new Uint8Array(this.posts.length); const L = []; for (const k of this.plastic) if (!ic[this.posts[k]]) { this.isE[k] = 1; L.push(k); } this.eList = Int32Array.from(L); this.eOn = L.length > 0; }
    this.normDirty = new Uint8Array(N); this.dirtyList = [];
    if (this.p.teachAHP > 0) {   // v16: receivers (cells with plastic inputs) get an afterhyperpolarisation when their teacher input ends
      this.ahp = new Int16Array(N); this.ahpRecv = new Uint8Array(N); for (let k = 0; k < this.posts.length; k++) if (this.isPlastic[k] && this.w0[k] > 0) this.ahpRecv[this.posts[k]] = 1; }
    if (this.p.trustPow > 0) { this.trust = new Float32Array(N).fill(this.p.trust0 >= 0 ? this.p.trust0 : this.p.trustRef); this.trustW = new Float32Array(N); this.trustT = -1;
      this.trustRecv = new Uint8Array(N); for (let k = 0; k < this.posts.length; k++) if (this.isPlastic[k] && this.w0[k] > 0) this.trustRecv[this.posts[k]] = 1; }   // cells with plastic inputs
    if (this.p.preNorm > 0 && !(this.uni && !this.instrReach())) for (let i = 0; i < N; i++) this.normPre(i);   // (v22: a brain without instructive inputs starts from its grown weights, as under the reward rule)
    if (this.p.metaN > 0) this.metaE = new Float32Array(N);   // v12 metaplasticity: potentiation received per presynaptic cell
    if (this.p.preLag > 0) { this.lagBuf = new Uint8Array(N * this.p.preLag); this.lagPos = 0; this.xLag = new Float32Array(N); }
  }
  instrReach() {                             // v22: does any instructive sensor contact a cell with plastic inputs?
    const rc = new Uint8Array(this.N); for (const k of this.plastic) rc[this.posts[k]] = 1;
    for (let i = 0; i < this.g.nIn; i++) if (this.instrIn[i]) for (let k = this.start[i], e = this.start[i + 1]; k < e; k++) if (this.ws[k] > 0 && rc[this.posts[k]]) return true;
    return false;
  }
  buildNp() {                                // v11: per-cell list of its plastic excitatory synapses (same order as before)
    const N = this.N, isP = this.isPlastic, w0 = this.w0, st = new Int32Array(N + 1), idx = [];
    for (let c = 0; c < N; c++) { st[c] = idx.length; for (let k = this.start[c], e = this.start[c + 1]; k < e; k++) if (isP[k] && w0[k] > 0) idx.push(k); }
    st[N] = idx.length; this.npStart = st; this.npIdx = Int32Array.from(idx);
  }
  normPre(i) {                               // plastic outgoing weights of cell i sum to preNorm
    if (!this.npStart) this.buildNp();
    const ws = this.ws, wMax = params.wMax, st = this.npStart, idx = this.npIdx, a = st[i], e = st[i + 1]; let s = 0;
    for (let q = a; q < e; q++) s += ws[idx[q]];
    if (s <= 0) return; let f = this.p.preNorm / s;
    if (this.p.confPow > 0) { let s2 = 0; for (let q = a; q < e; q++) { const w = ws[idx[q]]; s2 += w * w; }   // v12 confidence gain
      f *= Math.min(this.p.confMax, Math.pow((e - a) * s2 / (s * s) / this.p.confRef, this.p.confPow)); }
    if (this.trust) f *= Math.min(this.p.trustMax, Math.pow(this.trust[i] / this.p.trustRef, this.p.trustPow));   // v12 learned trust
    for (let q = a; q < e; q++) { const k = idx[q]; ws[k] = Math.min(wMax, ws[k] * f); }
  }
  // v12: each cell with plastic outputs and a recent (lagged) pre-trace scores the share of its output weight on
  // cells now in a teacher plateau, and keeps a pre-trace weighted running mean of it (window up to trustN events).
  updateTrust() {
    if (!this.npStart) this.buildNp();
    const N = this.N, st = this.npStart, idx = this.npIdx, ws = this.ws, posts = this.posts, plat = this.plat, xT = this.xLag || this.xPre, tr = this.trust, tw = this.trustW, tN = this.p.trustN;
    for (let c = 0; c < N; c++) { const a = st[c], e = st[c + 1]; if (e === a) continue; const x = xT[c]; if (x < 0.01) continue;
      let s = 0, h = 0; for (let q = a; q < e; q++) { const k = idx[q], w = ws[k]; s += w; if (plat[posts[k]] > 0) h += w; }
      if (s <= 0) continue; tw[c] += x; const r = Math.min(1, x / Math.min(tw[c], tN)); tr[c] += r * (h / s - tr[c]);
      if (this.p.preNorm > 0) this.normPre(c); }
  }
  // v13: propagation with the receiver pool: plastic input to receivers gets divisive normalisation, receiver spikes feed
  // a shared inhibitory pool, receivers get membrane noise. Non-receiver input is propagated exactly as usual.
  initRcv() {
    const N = this.N, isR = new Uint8Array(N); for (let k = 0; k < this.posts.length; k++) if (this.isPlastic[k] && this.w0[k] > 0) isR[this.posts[k]] = 1;
    const list = []; for (let i = 0; i < N; i++) if (isR[i]) list.push(i);
    this.rcv = Int32Array.from(list); this.isRcv = isR; this.synP = new Float32Array(N); this.poolTr = 0;
    this.rcvRng = mulberry32(0x5eed1 ^ this.g.N); this.dPool = this.p.rcvInhTau > 0 ? Math.exp(-1 / this.p.rcvInhTau) : 0;
  }
  propagateRcv(spk, nSpk) {
    const start = this.start, posts = this.posts, ws = this.ws, syn = this.syn, isP = this.isPlastic, isR = this.isRcv, sP = this.synP, R = this.rcv, p = this.p;
    let nR = 0;
    for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (isR[i]) nR++;
      for (let k = start[i], e = start[i + 1]; k < e; k++) { const j = posts[k]; if (isP[k] && isR[j]) sP[j] += ws[k]; else syn[j] += ws[k]; } }
    let f = 1;
    if (p.rcvDiv > 0) { let S = 0; for (let q = 0; q < R.length; q++) S += sP[R[q]]; f = p.rcvDiv * R.length / (p.rcvSig + S); }
    this.poolTr = this.poolTr * this.dPool + nR; const inh = p.rcvInh * this.poolTr;
    const sd = p.rcvNoise, rng = this.rcvRng;
    for (let q = 0; q < R.length; q++) { const j = R[q]; let x = sP[j] * f - inh;
      if (sd > 0) { const u = rng() || 1e-12, v = rng(); x += sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }
      syn[j] += x; sP[j] = 0; }
  }
  setPlasticityConsts() {
    const p = Object.assign({}, PL_DEFAULTS, this.g.pl);
    this.p = p; this.dPre = Math.exp(-1 / p.tauPre); this.dPost = Math.exp(-1 / p.tauPost);
    this.dElig = Math.exp(-1 / p.tauElig); this.dMods = this.chs.map(c => Math.exp(-1 / c.tauMod));
  }
  get learning() { return params.plasticity && this.plastic.length > 0 && this.p.lr > 0; }
  // One neural sub-step. Uses this.ext as external current.
  step() {
    const N = this.N, v = this.v, syn = this.syn, ext = this.ext, sp = this.spiked,
          th = this.thr || this.g.thresh, tr = this.trace, td = params.traceDecay;   // (v15: own thresholds if adaptive)
    const L = params.leak, slow = this.g.slow, gl = this.g.leak;
    const spk = this.spk; let nSpk = 0;   // v11: list of this substep's spikes (ascending), for event-driven propagation
    for (let i = 0; i < N; i++) {
      let x = v[i] + syn[i] + ext[i];                        // receive_input
      const leak = slow && slow[i] ? gl[i] : L;              // slow-leak (memory) cells keep their own leak
      x = V_REST + (x - V_REST) * leak;                      // update_and_leak
      if (x >= th[i]) { x = V_REST; sp[i] = 1; spk[nSpk++] = i; } else sp[i] = 0;
      v[i] = x < V_FLOOR ? V_FLOOR : x;
      syn[i] = 0;
      tr[i] = tr[i] * td + sp[i];
    }
    this.spikeCount += nSpk; this.nSpk = nSpk;
    const start = this.start, posts = this.posts, ws = this.ws;
    if (this.rcv) this.propagateRcv(spk, nSpk);   // v13 receiver-pool mechanisms (off by default)
    else for (let s = 0; s < nSpk; s++) { const i = spk[s];
      for (let k = start[i], e = start[i + 1]; k < e; k++) syn[posts[k]] += ws[k];
    }
    if (this.rhList && params.plasticity) { const L = this.rhList, h = this.p.rcvHomeo, r0 = this.p.rcvRate, thr = this.thr; for (let q = 0; q < L.length; q++) { const i = L[q]; thr[i] += h * (sp[i] - r0); } }
    if (this.anList) { if (this.p.actNoise > 0) this.actNoiseStep(); if (this.p.actFb > 0 || this.p.outInh > 0) this.actLoop(sp); }   // v20 exploration noise of the action channels
    if (this.mixPre) { let n = 0; for (let s = 0; s < nSpk; s++) n += this.mixPre[spk[s]];   // v14: feedforward inhibition of mixing cells
      if (n) { const d = this.p.mixInh * n, ml = this.mixList; for (let q = 0; q < ml.length; q++) syn[ml[q]] -= d;
        if (this.ng) { const A = this.ng.act; for (let q = 0; q < A.length; q++) syn[A[q]] -= d; } } }   // v28: new cells join the layer's feedforward inhibition
    if (this.ng && this.ng.act.length && params.plasticity) { const A = this.ng.act, h = this.p.mixHomeo > 0 ? this.p.mixHomeo : 0.5, r0 = this.p.mixRate || 0.008, thr = this.thr;   // v28: intrinsic homeostasis of new cells
      for (let q = 0; q < A.length; q++) { const i = A[q]; thr[i] += h * (sp[i] - r0); } }
    if (this.mxStart && params.plasticity) {   // v15 learned mixing (unsupervised competitive rule + homeostatic threshold)
      const mx = this.g.mix; if (this.p.mixLr > 0) for (let s = 0; s < nSpk; s++) if (mx[spk[s]]) this.mixLearn(spk[s]);
      if (this.thr) { const ml = this.mxList, hr = this.p.mixHomeo, r0 = this.p.mixRate, thr = this.thr; for (let q = 0; q < ml.length; q++) { const i = ml[q]; thr[i] += hr * (sp[i] - r0); } } }
    if (this.ng) this.needTrace(spk, nSpk);   // v28 need-growth source traces
    if (this.teachTr) {                     // teacher events: smoothed drive from sensory (input) neurons
      const drv = this.drv, nIn = this.g.nIn, tT = this.teachTr, thr = this.p.teachThr;
      drv.fill(0); for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (i >= nIn) break; if (this.instrIn && !this.instrIn[i]) continue; for (let k = start[i], e = start[i + 1]; k < e; k++) if (ws[k] > 0) drv[posts[k]] += ws[k]; }
      for (let i = nIn; i < N; i++) { tT[i] = tT[i] * 0.7 + drv[i]; if (this.plat[i] > 0) this.plat[i]--;
        if (tT[i] >= thr && this.armed[i]) { this.plat[i] = this.p.plateau; this.armed[i] = 0; if (this.ng && this.ng.pred && this.ng.rcv[i]) this.ng.on.push(i); if (this.trust && this.trustT < 0 && this.trustRecv[i]) this.trustT = this.p.trustDelay; }
        else if (tT[i] < thr / 2) { if (this.ahp && !this.armed[i] && this.ahpRecv[i]) this.ahp[i] = this.p.teachAHPDur; this.armed[i] = 1; } }
      if (this.ng && this.ng.on.length) this.needMiss();
      if (this.ahp) { const ah = this.ahp, d = this.p.teachAHP; for (let i = nIn; i < N; i++) if (ah[i] > 0) { syn[i] -= d; ah[i]--; } }   // v16 post-teacher afterhyperpolarisation
      if (this.trust && this.trustT >= 0 && this.trustT-- === 0) this.updateTrust();
    }
    for (let c = 0; c < this.nCh; c++) { const s = this.chSrc[c]; for (let q = 0; q < s.length; q++) this.chSpikes[c] += sp[s[q]]; }
    if (this.learning || this.use) this.stdp();
  }
  stdp() {
    const N = this.N, sp = this.spiked, xPre = this.xPre, xPost = this.xPost, el = this.elig, use = this.use;
    const learn = this.learning, pl = this.plastic, dE = this.dElig;
    const teach = !!this.teachTr && !(this.uni && this.eOn), spk = this.spk, nSpk = this.nSpk;   // v22 unified rule: eligibility traces kept (for dopamine-learning receivers)
    const lz = this.uni && this.eOn && learn, isEl = this.uni ? this.isE : this.isPlastic;   // v22 unified rule: LAZY eligibility decay (each trace is decayed when it is touched; same values, far fewer operations)
    if (lz) { if (!this.eT) { this.eT = new Int32Array(el.length); this.eSub = 0; this.ePow = new Float32Array(8192); for (let n = 0; n < 8192; n++) this.ePow[n] = Math.pow(dE, n); } this.eSub++; }
    const eT = this.eT, eS = this.eSub, eP = this.ePow, eAt = k => { const n = eS - eT[k]; eT[k] = eS; return el[k] *= n < 8192 ? eP[n] : 0; };
    if (learn && !teach && !lz) for (let q = 0; q < pl.length; q++) el[pl[q]] *= dE;     // eligibility decays (the teacher rule never uses it: all 0)
    const start = this.start, posts = this.posts, pres = this.pres, isP = this.isPlastic,
          inS = this.inStart, inE = this.inEdges, aM = this.p.aMinus;
    if (learn && this.teachTr) {             // teacher-gated rule: a spike during a teacher plateau potentiates
      const lr = this.p.lr * (this.uni ? this.p.uniI : 1), ws = this.ws, wMax = params.wMax, dirty = this.dirtyList, nd = this.normDirty, xT = this.xLag || xPre, mE = this.metaE, mN = this.p.metaN, tro = this.ng ? this.ng.tro : null;
      for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (this.plat[i] <= 0) continue;
        for (let q = inS[i], e = inS[i + 1]; q < e; q++) { const k = inE[q]; if (!isP[k] || this.w0[k] <= 0) continue; const x = xT[pres[k]]; if (x < 0.01) continue;
          if (mE) { const j = pres[k], d = lr * x; ws[k] = Math.min(wMax, ws[k] + d * mN / (mN + mE[j])); mE[j] += d; }
          else ws[k] = Math.min(wMax, ws[k] + lr * x);
          if (tro) tro[pres[k]] += lr * x;
          if (!nd[pres[k]]) { nd[pres[k]] = 1; dirty.push(pres[k]); } } }
      if (this.p.preNorm > 0) for (const i of dirty) this.normPre(i);
      for (const i of dirty) nd[i] = 0; dirty.length = 0;
    }
    if ((learn && !teach) || use) for (let s = 0; s < nSpk; s++) { const i = spk[s];   // (teacher rule without pruning: nothing to do here)
      if (learn && !teach) for (let k = start[i], e = start[i + 1]; k < e; k++)    // i is PRE: post fired earlier -> depress
        if (isEl[k]) { if (lz) eAt(k); el[k] -= aM * xPost[posts[k]]; }
      for (let q = inS[i], e = inS[i + 1]; q < e; q++) {      // i is POST: pre fired earlier -> potentiate
        const k = inE[q], x = xPre[pres[k]];
        if (learn && isEl[k] && !teach) { if (lz) eAt(k); el[k] += x; }
        if (use) use[k] += x;
      }
    }
    const dPre = this.dPre, dPost = this.dPost;
    for (let i = 0; i < N; i++) { xPre[i] = xPre[i] * dPre + sp[i]; xPost[i] = xPost[i] * dPost + sp[i]; }
    if (this.xLag) { const xL = this.xLag, lb = this.lagBuf, o = this.lagPos * N;   // pre trace of spikes older than preLag substeps
      for (let i = 0; i < N; i++) { xL[i] = xL[i] * dPre + lb[o + i]; lb[o + i] = sp[i]; } this.lagPos = (this.lagPos + 1) % this.p.preLag; }
  }
  // Called once per tick by the Agent with this tick's reward events
  // (pos = good, e.g. food / correct; neg = bad, e.g. poison / wrong; bump = small pain, e.g. wall contact).
  modulate(food, poison, bump, outcome) {
    const mods = this.mods;
    if (this.crit) {                         // v20: dopamine = reward prediction error (one global signal)
      const ch = this.chs[0], rw = ch.gFood * food - ch.gPoison * poison - ch.gWall * bump, d = this.p.rpeGain * this.criticStep(rw, outcome);
      if (this.ng && !this.ng.pred && (rw !== 0 || outcome)) this.needEvent(Math.min(1, Math.max(0, -this.delta)));   // v28 need-growth: negative outcome RPE
      for (let c = 0; c < this.nCh; c++) { mods[c] = mods[c] * this.dMods[c] + d; this.chSpikes[c] = 0; }
    } else
    for (let c = 0; c < this.nCh; c++) {
      const ch = this.chs[c];
      mods[c] = mods[c] * this.dMods[c] + ch.gFood * food - ch.gPoison * poison - ch.gWall * bump + ch.gSpike * this.chSpikes[c];
      this.chSpikes[c] = 0;
    }
    this.mod = mods[0]; this.dwSum = 0; this.tickNo++;
    if (this.use && this.tickNo === this.pruning.tick) this.prune();
    if (!this.learning || (this.teachTr && !(this.uni && this.eOn))) return;   // (teacher rule: the eligibility traces stay 0, so w += lr*M*0 changes nothing)
    const lr = this.p.lr, pl = this.uni ? this.eList : this.plastic, el = this.elig, ws = this.ws, w0 = this.w0, wMax = params.wMax, sc = this.synCh;
    const eT = this.eT, eS = this.eSub, eP = this.ePow, tro = this.ng ? this.ng.tro : null;
    let s = 0;
    for (let q = 0; q < pl.length; q++) {
      const k = pl[q], m = mods[sc[k]]; if (m === 0) continue;
      if (this.prunedMask && this.prunedMask[k]) continue;   // pruned
      const old = ws[k];
      let e = el[k]; if (eT) { const n = eS - eT[k]; eT[k] = eS; e = el[k] = n < 8192 ? e * eP[n] : 0; }   // v22 lazy eligibility decay
      let w = old + lr * m * e;
      if (w0[k] > 0) w = w < 0 ? 0 : w > wMax ? wMax : w;    // sign preserved
      else w = w > 0 ? 0 : w < -wMax ? -wMax : w;
      ws[k] = w; s += Math.abs(w - old);
      if (tro && w0[k] > 0 && w > old) tro[this.pres[k]] += w - old;
    }
    // v31 (R33) eligUse (0..1, 0 = off): an outcome CONSUMES the eligibility tags it acted on (tag capture): traces shrink by
    // eligUse at every outcome event, so the credit of one choice does not spill into the next trial's outcome.
    if (outcome && this.p.eligUse > 0) { const f = 1 - this.p.eligUse;
      for (let q = 0; q < pl.length; q++) { const k = pl[q]; if (eT) { const n = eS - eT[k]; eT[k] = eS; el[k] = n < 8192 ? el[k] * eP[n] : 0; } el[k] *= f; } }
    if (this.p.preNorm > 0 && s > 0) { if (!this.npStart) this.buildNp(); for (let i = 0; i < this.N; i++) if (this.npStart[i + 1] > this.npStart[i]) this.normPre(i); }   // v20: competition between targets
    this.dwSum = s;
  }
  prune() {
    const min = this.pruning.min, use = this.use, ws = this.ws; let n = 0;
    for (let k = 0; k < ws.length; k++) if (use[k] < min) { ws[k] = 0; this.prunedMask[k] = 1; n++; }
    this.pruned = n;
  }
  // Total |w - w_genome| over all synapses: how far learning has moved this brain.
  drift() { let s = 0; for (let k = 0; k < this.ws.length; k++) s += Math.abs(this.ws[k] - this.w0[k]); return s; }
  // Smoothed firing rate of a neuron in [0,1] (spikes per substep)
  rate(i) { return this.trace[i] * (1 - params.traceDecay); }
}
Object.assign(SpikingArena, { SpikingNet });
