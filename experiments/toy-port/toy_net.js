'use strict';
/* Feature–Time port of a frozen Play Code Toy export (experiments/toy-port).
 *
 * The Toy builds one cell per motif. Each cell has a handful of taps. A tap is a
 * synapse with its own delay, counted in characters. The cell fires at step t when
 * those taps land together. This runner plays that frozen anatomy. It does not grow
 * cells and it does not learn.
 *
 * Why this is not SpikingNet (js/core/net.js), checked against that file:
 *   - A SpikingNet spike is added to the postsynaptic current and consumed on the
 *     NEXT substep. There is no per-synapse delay.
 *   - preLag is a ring of old spikes, but only the teacher rule reads it (the
 *     presynaptic trace). It does not deliver current.
 *   - CLAW / mixing coincidence is "enough input on this substep": a fast leak and
 *     a high threshold. The taps here are staggered by 0..31 characters, and a
 *     delay of 0 must be visible in the SAME character (the delay-0 graph is a
 *     chain, depth about 10). One substep cannot express that.
 *   - The sequence plans' M → M2 → M3 register delays a whole symbol by one clocked
 *     stage. It is not an axonal delay per tap.
 * So the delay line lives here. The membrane numbers are BugBrain's: rest -70 mV,
 * threshold -55 mV, so one tap is a 15 mV quantum (V_THRESH - V_REST in base.js).
 * verify.js checks those two constants still match the engine.
 *
 * What is discrete, on purpose:
 *   - One tick is one character. Finer substeps (predictFine) only insert idle
 *     time between characters; delays scale, the membrane does not carry, and the
 *     predictions match the character clock.
 *   - No leak across characters. Firing and silent cells both start the next
 *     character at rest. History sits in the delay line, not in the voltage.
 *   - Hard fire is a strict AND of the taps (every tap's spike, not a soft spike).
 *     The export's `threshold` is the SOFT count, ceil(softFire * nTaps), with
 *     softFire 0.75. Soft spikes are a second event: they can complete a later
 *     tap, and they need a delay-0 tap in the same step and at least 3 taps.
 *     Exported weights are 1/nTaps rounded to 4 decimals (0.3333 * 3 = 0.9999),
 *     so the quantum is one tap, not the rounded weight.
 *   - The readout is the Toy's lateral inhibition, not a sum of readout weights:
 *     within a span the most-used cell wins; across spans the longest cell with a
 *     vote wins; a longer, more confident soft or abstract cell can outrank a
 *     short winner below outrankConf. The winning character is then a one-hot
 *     output spike, which Dec.wta reads back.
 *   - Learning is off. No STDP, no dopamine, no cell birth.
 *
 * snn-sim.cjs is the behavioral oracle (unmodified). This file is the discrete port.
 * continuous.js is the fine-time membrane on the same frozen graph: axonal delays,
 * a leaky coincidence window, and three-factor plasticity on the existing synapses.
 * With one bin per character and no membrane memory it matches this discrete runner.
 */
const fs = require('fs');

// js/core/base.js. verify.js asserts these against SpikingArena.
const V_REST = -70, V_THRESH = -55;
const SPIKE_MV = V_THRESH - V_REST;   // 15 mV, one coincident tap
const RING = 64;                      // same horizon as snn-sim: a cell tap with delay >= RING never arrives

// Longest cell with a vote wins. A short, unsure winner can lose to a longer
// cell that fired only softly (or only as abstract context) when that longer
// cell is confident. That is the Toy's soft-outrank rule, implemented here as
// the competition, not as extra synapses.
function readout(active, soft, context, cfg) {
  const outrankConf = cfg.outrankConf ?? 0.8;
  let exact = null;
  for (let d = active.length - 1; d >= 1 && !exact; d--) {
    const c = active[d];
    if (c && c.vote) exact = { char: c.vote.char, conf: c.vote.conf, total: c.vote.total, cell: c };
  }
  if (exact && cfg.softOutrank !== false && exact.conf < outrankConf) {
    let best = null;
    for (const list of [context, soft]) for (const c of list) {
      const v = c.vote;
      if (c.span <= exact.cell.span || !v || v.total < 4 || v.conf < outrankConf || v.conf < exact.conf + 0.1) continue;
      if (!best || v.conf > best.conf || (v.conf === best.conf && c.span > best.cell.span)) best = { char: v.char, conf: v.conf, total: v.total, cell: c };
    }
    if (best) return best.char;
  }
  if (exact) return exact.char;
  for (const list of [context, soft]) for (let i = list.length - 1; i >= 0; i--) if (list[i].vote) return list[i].vote.char;
  return null;
}

class FeatureTimeNet {
  constructor(doc) {
    if (!doc || !Array.isArray(doc.neurons) || !Array.isArray(doc.synapses) || !Array.isArray(doc.readout))
      throw new Error('Feature–Time export is missing neurons, synapses, or readout');
    const model = doc.neuronModel || {};
    if (typeof model.softFire !== 'number') throw new Error('Feature–Time export has no neuronModel.softFire');
    this.frac = model.softFire;
    this.cfg = doc.ftConfig || {};

    const inputs = new Map();
    const outputs = [];
    const cells = [];
    for (const n of doc.neurons) {
      if (n.type === 'input') inputs.set(n.id, n.char);
      else if (n.type === 'output') outputs.push({ id: n.id, char: n.char });
      else if (n.type === 'cell') cells.push({
        id: n.id, span: n.span, count: n.count, abstract: !!n.abstract,
        nTaps: n.nTaps, threshold: n.threshold, taps: [], votes: [],
      });
    }
    const byId = new Map(cells.map(c => [c.id, c]));
    let maxDelay = 0;
    for (const s of doc.synapses) {
      const c = byId.get(s.post);
      if (!c) throw new Error('synapse post is not a cell: ' + s.post);
      if (s.delay > maxDelay) maxDelay = s.delay;
      if (inputs.has(s.pre)) c.taps.push({ letter: true, ch: inputs.get(s.pre), delay: s.delay });
      else c.taps.push({ letter: false, id: s.pre, delay: s.delay });
    }
    if (maxDelay >= RING) throw new Error('delay ' + maxDelay + ' does not fit the ' + RING + '-step ring');
    for (const r of doc.readout) {
      const c = byId.get(r.pre);
      if (!c) throw new Error('readout pre is not a cell: ' + r.pre);
      c.votes.push([r.char, r.votes]);
    }

    // Same delay-0 order as snn-sim: a cell is evaluated after the cells it reads
    // at delay 0. A back-edge sees a provisional 0, which is what the oracle does.
    const order = new Map();
    const ord = c => {
      if (order.has(c.id)) return order.get(c.id);
      order.set(c.id, 0);
      let o = 0;
      for (const t of c.taps) if (!t.letter && t.delay === 0 && byId.has(t.id)) o = Math.max(o, 1 + ord(byId.get(t.id)));
      order.set(c.id, o);
      return o;
    };
    let depth = 0;
    for (const c of cells) depth = Math.max(depth, ord(c));
    cells.sort((a, b) => order.get(a.id) - order.get(b.id));

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      c.idx = i;
      if (c.taps.length !== c.nTaps) throw new Error(c.id + ' nTaps does not match its synapses');
      const need = Math.ceil(this.frac * c.taps.length);
      if (need !== c.threshold) throw new Error(c.id + ' threshold ' + c.threshold + ' != ceil(softFire * nTaps) ' + need);
      // Majority character among votes >= 2. Ties keep readout-file order (stable sort).
      // The denominator is every vote, including the ones below 2.
      const ranked = c.votes.filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
      const total = c.votes.reduce((s, [, n]) => s + n, 0);
      c.vote = ranked.length ? { char: ranked[0][0], conf: ranked[0][1] / total, total } : null;
    }
    const idxOf = new Map(cells.map(c => [c.id, c.idx]));
    for (const c of cells) for (const t of c.taps) if (!t.letter) t.i = idxOf.get(t.id);

    this.cells = cells;
    this.inputs = inputs;
    this.outputs = outputs;
    this.outIndex = new Map(outputs.map((o, i) => [o.char, i]));
    this.depth = depth;
    this.maxDelay = maxDelay;
    this.nSyn = doc.synapses.length;
    const N = cells.length;
    this.hard = Array.from({ length: RING }, () => new Uint8Array(N));
    this.soft = Array.from({ length: RING }, () => new Uint8Array(N));
    this.spiked = new Uint8Array(N);       // hard spikes of the latest tick
    this.softSpiked = new Uint8Array(N);
    this.v = new Float32Array(N);          // decision potential; rest after a spike, else the hard-path sum
    this.outSpikes = new Uint8Array(outputs.length);
    this.pred = null;
    this.t = 0;
    this.hist = '';
    this.reset();
  }

  summary() {
    return {
      cells: this.cells.length, inputs: this.inputs.size, outputs: this.outputs.length,
      synapses: this.nSyn, maxDelay: this.maxDelay, delay0Depth: this.depth,
      softFire: this.frac, ring: RING, spikeMv: SPIKE_MV, rest: V_REST, thresh: V_THRESH,
    };
  }

  reset() {
    this.t = 0; this.hist = ''; this.pred = null;
    for (let i = 0; i < RING; i++) { this.hard[i].fill(0); this.soft[i].fill(0); }
    this.spiked.fill(0); this.softSpiked.fill(0); this.v.fill(V_REST); this.outSpikes.fill(0);
  }

  // One character tick on the streaming rings. `ch` is one UTF-16 code unit, matching the oracle's text[t].
  step(ch) {
    this.hist += ch;
    const rec = this._fire(this.t, this.hist, this.hard, this.soft, RING, 1);
    this.t += 1;
    return rec.pred;
  }

  // Whole string. Resets first. Returns one prediction per input character (the guess for the character after it).
  predict(text, opts) {
    if (typeof text !== 'string') throw new Error('text must be a string');
    this.reset();
    const trace = opts && opts.trace ? [] : null;
    const outTrace = opts && opts.outTrace ? [] : null;
    const preds = new Array(text.length);
    for (let i = 0; i < text.length; i++) {
      this.hist += text[i];
      const rec = this._fire(i, this.hist, this.hard, this.soft, RING, 1);
      preds[i] = rec.pred;
      if (trace) trace.push(rec.hardIds);
      if (outTrace) outTrace.push(Uint8Array.from(this.outSpikes));
    }
    this.t = text.length;
    this.hardTrace = trace;
    this.outTrace = outTrace;
    return preds;
  }

  // `sub` neural steps per character. Delays scale by `sub`. Input is present only on
  // the first substep; the membrane is recomputed from the delay line and then reset,
  // so the idle substeps do not move the prediction. sub === 1 is predict().
  predictFine(text, sub) {
    if (typeof text !== 'string') throw new Error('text must be a string');
    sub = sub | 0;
    if (sub < 1) throw new Error('substeps must be >= 1');
    if (sub === 1) return this.predict(text);
    const R = RING * sub, N = this.cells.length;
    const hard = Array.from({ length: R }, () => new Uint8Array(N));
    const soft = Array.from({ length: R }, () => new Uint8Array(N));
    let hist = '', idle = 0, tau = 0;
    const preds = new Array(text.length);
    for (let i = 0; i < text.length; i++) {
      for (let s = 0; s < sub; s++, tau++) {
        if (s === 0) hist += text[i];
        const rec = this._fire(tau, hist, hard, soft, R, sub);
        if (s === 0) preds[i] = rec.pred;
        else idle += rec.nHard + rec.nSoft;
      }
    }
    this.idleSpikes = idle;
    return preds;
  }

  // Integrate every cell from the delay rings and compete for one output spike.
  // `sub` scales tap delays into substeps. Phase 0 of each character is the input event.
  _fire(t, hist, hard, soft, R, sub) {
    const phaseIn = t % sub === 0;
    const h = hard[t % R], s = soft[t % R];
    h.fill(0); s.fill(0);
    this.spiked.fill(0); this.softSpiked.fill(0); this.v.fill(V_REST);
    const H = hist.length, frac = this.frac;
    const at = (arr, dChar, i) => {
      if (i === undefined) return false;
      const d = dChar * sub;
      return d <= t && d < R && arr[(t - d) % R][i] === 1;
    };
    const active = [], softA = [], context = [], hardIds = [];
    let nHard = 0, nSoft = 0;
    for (const c of this.cells) {
      const n = c.taps.length;
      if (!n) continue;
      let exact = 0, loose = 0, trig = false;
      for (const tp of c.taps) {
        const ok = tp.letter ? (phaseIn && tp.delay < H && hist[H - 1 - tp.delay] === tp.ch) : at(hard, tp.delay, tp.i);
        const near = ok || (!tp.letter && frac < 1 && at(soft, tp.delay, tp.i));
        if (ok) exact++;
        if (near) { loose++; if (tp.delay === 0) trig = true; }
      }
      // Hard path: every tap's own spike. Compared in mV, exact for these integers.
      const pot = V_REST + exact * SPIKE_MV;
      this.v[c.idx] = pot;
      if (pot >= V_REST + n * SPIKE_MV) {
        this.v[c.idx] = V_REST;
        h[c.idx] = 1; this.spiked[c.idx] = 1; hardIds.push(c.id); nHard++;
        if (c.abstract) { context.push(c); continue; }
        const p = active[c.span - 1];
        if (!p || c.count > p.count) active[c.span - 1] = c;
        continue;
      }
      // Soft path: enough near taps (hard or soft), a delay-0 tap among them, and n >= 3.
      const need = c.threshold;
      if (frac < 1 && trig && n >= 3 && V_REST + loose * SPIKE_MV >= V_REST + need * SPIKE_MV) {
        this.v[c.idx] = V_REST;
        s[c.idx] = 1; this.softSpiked[c.idx] = 1; nSoft++;
        const p = softA[c.span - 1];
        if (!p || c.count > p.count) softA[c.span - 1] = c;
      }
    }
    const pred = readout(active, softA.filter(Boolean), context, this.cfg);
    this.outSpikes.fill(0);
    if (pred != null) { const oi = this.outIndex.get(pred); if (oi !== undefined) this.outSpikes[oi] = 1; }
    this.pred = pred;
    return { pred, hardIds, nHard, nSoft };
  }
}

function loadFeatureTime(file) {
  return new FeatureTimeNet(JSON.parse(fs.readFileSync(file, 'utf8')));
}

module.exports = { FeatureTimeNet, loadFeatureTime, readout, V_REST, V_THRESH, SPIKE_MV, RING };
