'use strict';
/* Fine-time Feature–Time runner on the frozen Toy graph (no new cells).
 *
 * Axons: a spike at time t arrives at t + delay * sub, where `delay` is the
 * export's delay in characters and `sub` is how many bins that character lasts.
 * Spike times are kept (a later spike does not erase an earlier one). Delays of
 * 64 characters or more are ignored, the same horizon as the discrete ring.
 * Each character is msPerChar milliseconds (default 25), so a delay of 4 is 100 ms.
 *
 * Coincidence window: a tap contributes its charge (15 mV, scaled by w/w0 after
 * learning) while its axonal arrival lies in the last `window` bins. Hard fire
 * is every tap inside that window; soft fire is the export's soft count, a
 * delay-0 tap inside the window, and at least 3 taps. window = 1 is one bin, so
 * it is the discrete boolean. A wider window lets arrivals that miss the
 * character boundary still coincide. The cell then refracts for `window` bins.
 *
 * Plasticity (only when asked; the synapse list never grows or shrinks):
 *   BugBrain's three-factor shape. Each tap keeps a pre trace and an eligibility e.
 *   A presynaptic arrival (after the axonal delay) depresses e by aMinus * xPost;
 *   a postsynaptic spike potentiates e by xPre. At the end of the character the
 *   next input is the teacher, per cell: if that cell fired and its vote equals
 *   the next character, M = +1, otherwise M = -1, and w += lr * M * e.
 *   Then each cell's taps are projected back into a band around 1/nTaps and
 *   rescaled so they still sum to 1. A missing partner therefore always drops
 *   the hard-path charge below threshold, and the heaviest (need-1) taps stay
 *   short of the soft threshold. Optional readout smoothing (readoutLearn)
 *   mixes the cell's vote toward the same teacher; it is off unless it helps.
 *
 *   node experiments/toy-port/continuous.js [model.snn.json] [sample.txt]
 * Exit 0 when the no-memory settings still match the discrete runner at >= 99%.
 */
const fs = require('fs'), path = require('path');
const { FeatureTimeNet, loadFeatureTime, readout, V_REST, SPIKE_MV } = require('./toy_net');

const LR = 0.03, TAU_PRE = 10, TAU_POST = 10, TAU_ELIG = 50, A_MINUS = 0.3; // js/core/base.js PL_DEFAULTS

class ContinuousToy {
  constructor(net, opts) {
    opts = opts || {};
    this.sub = opts.sub | 0;
    this.window = opts.window | 0;
    if (this.sub < 1) throw new Error('sub must be >= 1');
    if (this.window < 1) throw new Error('window must be >= 1');
    this.plasticity = !!opts.plasticity;
    this.readoutLearn = !!opts.readoutLearn;
    this.voteLr = opts.voteLr != null ? opts.voteLr : 0.01;
    this.lr = opts.lr != null ? opts.lr : LR;
    this.aMinus = opts.aMinus != null ? opts.aMinus : A_MINUS;
    this.tauPre = opts.tauPre || TAU_PRE;
    this.tauPost = opts.tauPost || TAU_POST;
    this.tauElig = opts.tauElig || TAU_ELIG;
    this.dPre = Math.exp(-1 / this.tauPre);
    this.dPost = Math.exp(-1 / this.tauPost);
    this.dElig = Math.exp(-1 / this.tauElig);
    this.msPerChar = opts.msPerChar || 25;
    this.frac = net.frac;
    this.cfg = net.cfg;
    this.outIndex = net.outIndex;
    this.outputs = net.outputs;
    this.cells = net.cells;
    const N = net.cells.length;
    this.N = N;
    this.xPost = new Float64Array(N);
    this.refUntil = new Int32Array(N);
    this.hardAt = Array.from({ length: N }, () => []);
    this.softAt = Array.from({ length: N }, () => []);
    this.taps = [];
    this.groups = new Array(N);
    for (let i = 0; i < N; i++) {
      const c = net.cells[i];
      const n = c.taps.length;
      const w0 = n ? 1 / n : 0;
      const list = [];
      for (const tp of c.taps) {
        const tap = {
          letter: tp.letter, ch: tp.ch, pre: tp.i, delay: tp.delay,
          w0, w: w0, amp: SPIKE_MV, e: 0, xPre: 0,
          cell: i, id: c.id,
        };
        list.push(tap);
        this.taps.push(tap);
      }
      this.groups[i] = list;
    }
    this.readoutState = net.cells.map(c => {
      if (!c.vote) return null;
      const counts = new Map();
      let total = 0;
      for (const [ch, n] of c.votes) { counts.set(ch, n); total += n; }
      return { counts, total: total || 1, vote: { char: c.vote.char, conf: c.vote.conf, total: c.vote.total } };
    });
    this.pred = null;
    this.hardTrace = null;
    this.resetDynamics();
  }

  _installVotes() {
    if (!this.readoutLearn) return;
    if (!this._voteSnap) this._voteSnap = this.cells.map(c => c.vote);
    for (let i = 0; i < this.cells.length; i++) if (this.readoutState[i]) this.cells[i].vote = this.readoutState[i].vote;
  }

  _restoreVotes() {
    if (!this._voteSnap) return;
    for (let i = 0; i < this.cells.length; i++) this.cells[i].vote = this._voteSnap[i];
  }

  resetDynamics() {
    this.xPost.fill(0);
    this.refUntil.fill(0);
    for (let i = 0; i < this.N; i++) { this.hardAt[i].length = 0; this.softAt[i].length = 0; }
    for (const tp of this.taps) { tp.e = 0; tp.xPre = 0; }
    this.pred = null;
  }

  resetWeights() {
    for (const tp of this.taps) { tp.w = tp.w0; tp.amp = SPIKE_MV; tp.e = 0; tp.xPre = 0; }
    this.xPost.fill(0);
  }

  weightDrift() {
    let abs = 0, n = 0, max = 0, changed = 0;
    const top = [];
    for (const tp of this.taps) {
      const d = Math.abs(tp.w - tp.w0);
      abs += d; n++;
      if (d > max) max = d;
      if (d > 1e-12) changed++;
      if (d > 0) top.push(tp);
    }
    top.sort((a, b) => Math.abs(b.w - b.w0) - Math.abs(a.w - a.w0));
    return {
      synapses: n,
      changed,
      meanAbsDw: n ? abs / n : 0,
      maxAbsDw: max,
      largest: top.slice(0, 6).map(tp => ({
        cell: tp.id, delay: tp.delay, letter: tp.letter, w0: +tp.w0.toFixed(4), w: +tp.w.toFixed(4),
      })),
    };
  }

  // One pass. Plasticity, if on, updates weights online after each character's prediction.
  run(text, opts) {
    if (typeof text !== 'string') throw new Error('text must be a string');
    this.resetDynamics();
    this._installVotes();
    try { return this._run(text, opts); }
    finally { this._restoreVotes(); }
  }

  _run(text, opts) {
    const trace = opts && opts.trace;
    const sub = this.sub, win = this.window, frac = this.frac, learn = this.plasticity;
    const N = this.N;
    const xPost = this.xPost, refUntil = this.refUntil, hardAt = this.hardAt, softAt = this.softAt;
    const inWin = (times, lo, hi) => {
      for (let k = times.length - 1; k >= 0; k--) {
        const st = times[k];
        if (st < lo) return false;
        if (st <= hi) return true;
      }
      return false;
    };
    const dPre = this.dPre, dPost = this.dPost, dE = this.dElig, aM = this.aMinus;
    const preds = new Array(text.length);
    const hardTrace = trace ? [] : null;
    const seen = new Uint8Array(N);
    const fired = new Uint8Array(N);
    let hist = '';
    for (let i = 0; i < text.length; i++) {
      hist += text[i];
      const active = [], softA = [], context = [], hardIds = [];
      seen.fill(0); fired.fill(0);
      for (let s = 0; s < sub; s++) {
        const t = i * sub + s;
        for (let ci = 0; ci < N; ci++) {
          const c = this.cells[ci];
          const taps = this.groups[ci];
          const n = taps.length;
          if (!n) continue;
          if (learn) xPost[ci] *= dPost;
          const quiet = t < refUntil[ci];
          let gH = 0, gS = 0, trig = false;
          for (const tp of taps) {
            if (learn) { tp.e *= dE; tp.xPre *= dPre; }
            let hardArr = false, softArr = false, hardNow = false, softNow = false;
            if (tp.letter) {
              const lo = t - win + 1;
              for (let arr = t - (t % sub); arr >= lo && arr >= 0; arr -= sub) {
                const pos = arr / sub - tp.delay;
                if (pos >= 0 && pos < hist.length && hist[pos] === tp.ch) { hardArr = softArr = true; break; }
              }
              if (t % sub === 0) {
                const pos = t / sub - tp.delay;
                if (pos >= 0 && pos < hist.length && hist[pos] === tp.ch) hardNow = softNow = true;
              }
            } else if (tp.pre !== undefined && tp.delay < 64) {
              const hi = t - tp.delay * sub;
              if (hi >= 0) {
                hardArr = inWin(hardAt[tp.pre], hi - win + 1, hi);
                softArr = inWin(softAt[tp.pre], hi - win + 1, hi);
                hardNow = inWin(hardAt[tp.pre], hi, hi);
                softNow = inWin(softAt[tp.pre], hi, hi);
              }
            }
            if (hardArr) gH += tp.amp;
            if (hardArr || softArr) {
              gS += tp.amp;
              if (tp.delay === 0) trig = true;
            }
            // One presynaptic event per axonal arrival, not once per bin of the window.
            if (learn && (hardNow || softNow)) { tp.e -= aM * xPost[ci]; tp.xPre += 1; }
          }
          if (quiet) continue;
          const hardTh = V_REST + n * SPIKE_MV;
          const softTh = V_REST + c.threshold * SPIKE_MV;
          // 1e-6 keeps a full coincidence that sums to 1 from missing the threshold on float dust.
          let kind = 0;
          if (V_REST + gH >= hardTh - 1e-6) kind = 1;
          else if (frac < 1 && trig && n >= 3 && V_REST + gS >= softTh - 1e-6) kind = 2;
          if (!kind) continue;
          refUntil[ci] = t + win;
          if (learn) { xPost[ci] += 1; for (const tp of taps) tp.e += tp.xPre; }
          if (kind === 1) {
            hardAt[ci].push(t);
            if (!seen[ci]) {
              seen[ci] = 1; fired[ci] = 1; hardIds.push(c.id);
              if (c.abstract) context.push(c);
              else { const p = active[c.span - 1]; if (!p || c.count > p.count) active[c.span - 1] = c; }
            }
          } else {
            softAt[ci].push(t);
            if (!seen[ci]) {
              seen[ci] = 1; fired[ci] = 1;
              const p = softA[c.span - 1]; if (!p || c.count > p.count) softA[c.span - 1] = c;
            }
          }
        }
      }
      const pred = readout(active, softA.filter(Boolean), context, this.cfg);
      preds[i] = pred;
      if (hardTrace) hardTrace.push(hardIds);
      if (learn && i + 1 < text.length) this._teach(text[i + 1], fired);
    }
    this.pred = preds.length ? preds[preds.length - 1] : null;
    this.hardTrace = hardTrace;
    return preds;
  }

  // Band relative to w0 = 1/n. sMax stays under need/(need-1), so the heaviest
  // (need-1) taps cannot meet the soft threshold. sMin keeps every partner alive.
  // After the step the taps are mixed back onto the simplex sum(w) = 1, so a
  // missing spike always drops the hard-path charge below n * 15 mV.
  _band(n, need) {
    const sMin = 0.5;
    const raw = need > 1 ? need / (need - 1) : 1;
    const sMax = 1 + 0.9 * (raw - 1);
    return { sMin, sMax };
  }

  _project(taps, need) {
    const n = taps.length;
    if (n <= 1) {
      for (const tp of taps) { tp.w = tp.w0; tp.amp = SPIKE_MV; }
      return;
    }
    const { sMin, sMax } = this._band(n, need);
    for (const tp of taps) {
      const lo = sMin * tp.w0, hi = sMax * tp.w0;
      if (tp.w < lo) tp.w = lo;
      else if (tp.w > hi) tp.w = hi;
    }
    let s = 0;
    for (const tp of taps) s += tp.w;
    if (!(s > 0)) s = 1;
    const scaled = taps.map(tp => tp.w / s);
    const inside = alpha => {
      for (let i = 0; i < n; i++) {
        const w = (1 - alpha) * scaled[i] + alpha * taps[i].w0;
        if (w < sMin * taps[i].w0 - 1e-12 || w > sMax * taps[i].w0 + 1e-12) return false;
      }
      return true;
    };
    let alpha = 0;
    if (!inside(0)) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (inside(mid)) hi = mid; else lo = mid;
      }
      alpha = hi;
    }
    for (let i = 0; i < n; i++) {
      const tp = taps[i];
      tp.w = (1 - alpha) * scaled[i] + alpha * tp.w0;
      tp.amp = Math.abs(tp.w - tp.w0) < 1e-12 ? SPIKE_MV : SPIKE_MV * (tp.w / tp.w0);
    }
  }

  _nudgeVote(ci, next) {
    const st = this.readoutState[ci];
    if (!st) return;
    const keep = 1 - this.voteLr;
    for (const [ch, n] of st.counts) st.counts.set(ch, n * keep);
    st.counts.set(next, (st.counts.get(next) || 0) + this.voteLr * st.total);
    let best = st.vote.char, bv = -1;
    for (const [ch, n] of st.counts) if (n > bv) { bv = n; best = ch; }
    st.vote.char = best;
    st.vote.conf = st.total ? bv / st.total : 0;
  }

  // True when no cell can hard-fire without one of its taps, and the heaviest
  // (need-1) taps stay under the soft threshold.
  partnersHold() {
    for (let ci = 0; ci < this.cells.length; ci++) {
      const taps = this.groups[ci];
      const n = taps.length;
      if (n < 2) continue;
      const need = this.cells[ci].threshold;
      const { sMin } = this._band(n, need);
      let sumW = 0, minW = Infinity;
      const ws = [];
      for (const tp of taps) {
        sumW += tp.w; ws.push(tp.w);
        if (tp.w < minW) minW = tp.w;
        if (tp.w < sMin * tp.w0 - 1e-8) return false;
      }
      if (Math.abs(sumW - 1) > 1e-6) return false;
      if (minW <= 0) return false;
      const without = n * SPIKE_MV * (sumW - minW);
      if (without >= n * SPIKE_MV - 1e-6) return false;
      if (n >= 3 && need > 1) {
        ws.sort((a, b) => b - a);
        let top = 0;
        for (let i = 0; i < need - 1 && i < ws.length; i++) top += ws[i];
        if (n * SPIKE_MV * top >= need * SPIKE_MV - 1e-6) return false;
      }
    }
    return true;
  }

  _teach(next, fired) {
    const lr = this.lr;
    for (let ci = 0; ci < this.cells.length; ci++) {
      if (!fired[ci]) continue;
      const vote = this.cells[ci].vote;
      if (!vote) continue;
      const M = vote.char === next ? 1 : -1;
      for (const tp of this.groups[ci]) tp.w += lr * M * tp.e;
      this._project(this.groups[ci], this.cells[ci].threshold);
      if (this.readoutLearn) this._nudgeVote(ci, next);
    }
  }
}

function pct(n, d) { return d ? +(100 * n / d).toFixed(2) : 0; }
function samePreds(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function sameTrace(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.length !== y.length) return false;
    for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return false;
  }
  return true;
}
function setAgree(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.length !== y.length) continue;
    let ok = true;
    const s = new Set(y);
    for (const id of x) if (!s.has(id)) { ok = false; break; }
    if (ok) n++;
  }
  return n;
}
function nextPct(preds, text) {
  let hit = 0;
  for (let i = 0; i + 1 < text.length; i++) if (preds[i] === text[i + 1]) hit++;
  return pct(hit, text.length - 1);
}
function firstMiss(a, b, text, limit) {
  const out = [];
  for (let i = 0; i < a.length && out.length < limit; i++) {
    if (a[i] !== b[i]) out.push({ at: i, ctx: text.slice(Math.max(0, i - 16), i + 1), a: a[i], b: b[i] });
  }
  return out;
}

function tinyDoc() {
  return {
    neuronModel: { softFire: 0.75 },
    ftConfig: { softOutrank: true, outrankConf: 0.8 },
    neurons: [
      { id: 'in:61', type: 'input', char: 'a' },
      { id: 'in:62', type: 'input', char: 'b' },
      { id: 'out:63', type: 'output', char: 'c' },
      { id: 'h1', type: 'cell', span: 2, count: 5, abstract: false, nTaps: 2, threshold: 2, role: 'motif' },
    ],
    synapses: [
      { pre: 'in:61', post: 'h1', delay: 1, weight: 0.5 },
      { pre: 'in:62', post: 'h1', delay: 0, weight: 0.5 },
    ],
    readout: [{ pre: 'h1', post: 'out:63', char: 'c', votes: 5, weight: 1 }],
  };
}

function assertTiny() {
  const net = new FeatureTimeNet(tinyDoc());
  const text = 'ab';
  const disc = net.predict(text);
  const match = new ContinuousToy(net, { sub: 1, window: 1, plasticity: false }).run(text);
  if (!samePreds(disc, match)) throw new Error('tiny match failed ' + JSON.stringify({ disc, match }));
  const held = new ContinuousToy(net, { sub: 4, window: 1, plasticity: false }).run(text);
  if (!samePreds(disc, held)) throw new Error('tiny fine grid failed ' + JSON.stringify({ disc, held }));
}

function main() {
  assertTiny();
  const modelPath = process.argv[2] || path.join(__dirname, 'baseline-frozen.snn.json');
  const samplePath = process.argv[3] || path.join(__dirname, 'sample-dialogue.txt');
  const text = fs.readFileSync(samplePath, 'utf8');
  const t0 = Date.now();
  const discNet = loadFeatureTime(modelPath);
  const discrete = discNet.predict(text, { trace: true });
  const dTrace = discNet.hardTrace;

  const matchNet = new ContinuousToy(discNet, { sub: 1, window: 1, plasticity: false });
  const matched = matchNet.run(text, { trace: true });
  const matchPred = pct(matched.filter((p, i) => p === discrete[i]).length, text.length);
  const matchSpike = sameTrace(matchNet.hardTrace, dTrace) ? 100 : pct(setAgree(matchNet.hardTrace, dTrace), text.length);

  const fineNet = new ContinuousToy(discNet, { sub: 8, window: 1, plasticity: false });
  const tFine = Date.now();
  const fine = fineNet.run(text, { trace: true });
  const finePred = pct(fine.filter((p, i) => p === discrete[i]).length, text.length);
  const fineSpike = pct(setAgree(fineNet.hardTrace, dTrace), text.length);
  const fineSecs = +((Date.now() - tFine) / 1000).toFixed(2);

  function vsDiscrete(opts) {
    const t1 = Date.now();
    const sim = new ContinuousToy(discNet, opts);
    const preds = sim.run(text, { trace: true });
    return {
      sub: opts.sub, window: opts.window, dtMs: +(25 / opts.sub).toFixed(3),
      windowMs: +(opts.window * 25 / opts.sub).toFixed(2),
      agreePct: pct(preds.filter((p, i) => p === discrete[i]).length, text.length),
      nextPct: nextPct(preds, text),
      spikeSetAgreePct: pct(setAgree(sim.hardTrace, dTrace), text.length),
      secs: +((Date.now() - t1) / 1000).toFixed(2),
      misses: firstMiss(preds, discrete, text, 6),
      preds,
    };
  }
  const narrow = vsDiscrete({ sub: 8, window: 4, plasticity: false });
  const wide = vsDiscrete({ sub: 8, window: 12, plasticity: false });
  const widePreds = wide.preds;
  delete narrow.preds; delete wide.preds;

  function learnPass(readoutLearn) {
    const sim = new ContinuousToy(discNet, { sub: 8, window: 12, plasticity: true, readoutLearn, msPerChar: 25 });
    const t1 = Date.now();
    const online = sim.run(text);
    const drift = sim.weightDrift();
    const held = sim.partnersHold();
    sim.plasticity = false;
    const replay = sim.run(text);
    return {
      readoutLearn, voteLr: readoutLearn ? sim.voteLr : 0,
      partnersHold: held,
      onlineNextPct: nextPct(online, text),
      replayNextPct: nextPct(replay, text),
      replayAgreeVsWidePct: pct(replay.filter((p, i) => p === widePreds[i]).length, text.length),
      replayAgreeVsDiscretePct: pct(replay.filter((p, i) => p === discrete[i]).length, text.length),
      onlineAgreeVsDiscretePct: pct(online.filter((p, i) => p === discrete[i]).length, text.length),
      drift, secs: +((Date.now() - t1) / 1000).toFixed(2),
    };
  }
  const tapsOnly = learnPass(false);
  const withVotes = learnPass(true);
  const near = r => r.partnersHold && r.replayNextPct >= wide.nextPct - 2;
  const chosen = near(withVotes) && withVotes.replayNextPct > tapsOnly.replayNextPct + 0.3 ? withVotes : tapsOnly;

  const again = new ContinuousToy(discNet, { sub: 1, window: 1, plasticity: false }).run(text);
  const deterministic = samePreds(again, matched);

  const ok = matchPred >= 99 && matchSpike >= 99 && finePred >= 99 && fineSpike >= 99 && deterministic
    && chosen.drift.changed > 0 && chosen.partnersHold && chosen.replayNextPct >= wide.nextPct - 2 && chosen.replayNextPct > 60;
  const report = {
    sample: path.basename(samplePath),
    chars: text.length,
    msPerChar: 25,
    discreteNextPct: nextPct(discrete, text),
    match: {
      sub: 1, window: 1, note: 'window of one bin; same boolean as the discrete runner',
      agreePct: matchPred, spikeAgreePct: matchSpike,
      misses: matchPred === 100 ? [] : firstMiss(matched, discrete, text, 6),
    },
    fineGrid: {
      sub: 8, window: 1, dtMs: +(25 / 8).toFixed(3),
      note: 'axonal delays on a 3.125 ms grid; window is still one bin',
      agreePct: finePred, spikeSetAgreePct: fineSpike, secs: fineSecs,
    },
    narrowWindow: {
      note: '12.5 ms window, shorter than one character, so phase-locked taps still meet on one bin',
      ...narrow, misses: narrow.agreePct === 100 ? [] : narrow.misses,
    },
    wideWindow: {
      note: '37.5 ms window, longer than one character: a tap from the previous character can still coincide',
      ...wide,
    },
    plasticity: {
      rule: 'three-factor eligibility, then project taps onto sum=1 inside a partner-preserving band',
      lr: LR, tauPre: TAU_PRE, tauPost: TAU_POST, tauElig: TAU_ELIG, aMinus: A_MINUS,
      sub: 8, window: 12,
      prePlasticNextPct: wide.nextPct,
      chosen: chosen.readoutLearn ? 'taps+readout' : 'taps',
      tapsOnly, withVotes,
    },
    deterministic,
    secs: +((Date.now() - t0) / 1000).toFixed(2),
    pass: ok,
  };
  fs.writeFileSync(path.join(__dirname, 'continuous-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log(ok
    ? `CONTINUOUS PORT PASS (discrete match >= 99%, replay ${chosen.replayNextPct}% vs pre-plastic ${wide.nextPct}%)`
    : 'CONTINUOUS PORT FAIL');
  process.exitCode = ok ? 0 : 1;
}

module.exports = { ContinuousToy };
if (require.main === module) main();
