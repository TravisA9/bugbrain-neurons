'use strict';
/* Frozen genome v2. Weights, delays, thresholds, and wiring are fixed.
 * Nothing here changes a weight while the network runs. */
const SF = require('./engine.js');

const MOTIFS = ['feedforward', 'lateral', 'wta', 'delay-line', 'coincidence'];
const PATTERNS = ['all', 'one', 'lateral', 'feedforward'];

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function round4(x) { return Math.round(x * 10000) / 10000; }

function blank(inputN, outputN) {
  return {
    v: 2,
    modules: [
      { id: 'in', kind: 'input', n: inputN },
      { id: 'e', kind: 'lif', n: 3, sign: 1, thr: 1.2, leak: 0.8, motif: 'coincidence' },
      { id: 'i', kind: 'lif', n: 2, sign: -1, thr: 1.0, leak: 0.75, motif: 'wta' },
      { id: 'out', kind: 'output', n: outputN },
    ],
    wires: [
      { from: 'in', to: 'e', pattern: 'all', weight: 0.8, delay: 0 },
      { from: 'e', to: 'i', pattern: 'one', weight: 0.6, delay: 1 },
      { from: 'i', to: 'e', pattern: 'lateral', weight: 0.35, delay: 0 },
      { from: 'e', to: 'out', pattern: 'feedforward', weight: 1.0, delay: 0 },
    ],
  };
}

function fromV1(g) {
  const hidden = clamp(Math.round(g.nodes || 2), 1, 8);
  const motif = g.topology === 'memory' ? 'delay-line' : g.topology === 'routed' ? 'wta' : 'coincidence';
  return {
    v: 2,
    modules: [
      { id: 'in', kind: 'input', n: 2 },
      { id: 'e', kind: 'lif', n: hidden, sign: 1, thr: round4(g.thr || 1.2), leak: round4(g.decay || 0.5), motif: motif },
      { id: 'i', kind: 'lif', n: 1, sign: -1, thr: round4(g.thr || 1.2), leak: round4(g.decay || 0.5), motif: 'lateral' },
      { id: 'out', kind: 'output', n: 1 },
    ],
    wires: [
      { from: 'in', to: 'e', pattern: 'all', weight: round4(g.wa || 1), delay: 0 },
      { from: 'e', to: 'i', pattern: 'one', weight: round4((g.wb || 1) * 0.5), delay: g.topology === 'memory' ? 1 : 0 },
      { from: 'i', to: 'e', pattern: 'lateral', weight: 0.3, delay: 0 },
      { from: 'e', to: 'out', pattern: 'feedforward', weight: round4(Math.max(g.wa || 1, g.wb || 1)), delay: 0 },
    ],
  };
}

function sanitize(g) {
  const modules = (g.modules || []).slice(0, 6).map(mod => ({
    id: String(mod.id || 'm').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'm',
    kind: mod.kind === 'input' || mod.kind === 'output' ? mod.kind : 'lif',
    n: clamp(Math.round(mod.n || 1), 1, 8),
    sign: mod.sign < 0 ? -1 : 1,
    thr: round4(clamp(mod.thr == null ? 1 : mod.thr, 0.4, 3)),
    leak: round4(clamp(mod.leak == null ? 0.8 : mod.leak, 0.1, 0.95)),
    motif: MOTIFS.indexOf(mod.motif) >= 0 ? mod.motif : 'feedforward',
  }));
  const ids = {};
  modules.forEach(mod => { ids[mod.id] = true; });
  const wires = (g.wires || []).slice(0, 8).filter(w => ids[w.from] && ids[w.to]).map(w => ({
    from: w.from,
    to: w.to,
    pattern: PATTERNS.indexOf(w.pattern) >= 0 ? w.pattern : 'one',
    weight: round4(clamp(w.weight == null ? 0.5 : w.weight, -2, 2)),
    delay: clamp(Math.round(w.delay || 0), 0, 4),
  }));
  return { v: 2, modules: modules, wires: wires };
}

function compile(genome) {
  const g = sanitize(genome);
  const neurons = [];
  const range = {};
  g.modules.forEach(mod => {
    const start = neurons.length;
    for (let i = 0; i < mod.n; i++) {
      neurons.push({
        kind: mod.kind,
        thr: mod.thr,
        leak: mod.leak,
        sign: mod.sign,
      });
    }
    range[mod.id] = { start: start, n: mod.n, sign: mod.sign };
  });
  const edges = [];
  g.wires.forEach(wire => {
    const a = range[wire.from], b = range[wire.to];
    if (!a || !b) return;
    const sign = a.sign < 0 ? -1 : 1;
    const weight = round4(wire.weight * (wire.from === 'in' || a.sign > 0 ? 1 : sign));
    for (let i = 0; i < a.n; i++) {
      let targets = [];
      if (wire.pattern === 'all') {
        for (let j = 0; j < b.n && targets.length < 3; j++) targets.push(j);
      } else if (wire.pattern === 'feedforward') {
        targets.push(i % b.n);
        if (b.n > 1) targets.push((i + 1) % b.n);
      } else if (wire.pattern === 'lateral') {
        targets.push((i + 1) % b.n);
      } else {
        targets.push(i % b.n);
      }
      targets.forEach(j => {
        if (edges.length < 64) edges.push({ from: a.start + i, to: b.start + j, weight: weight, delay: wire.delay });
      });
    }
  });
  return {
    neurons: neurons,
    edges: edges,
    inputs: neurons.map((neuron, i) => neuron.kind === 'input' ? i : -1).filter(i => i >= 0),
    outputs: neurons.map((neuron, i) => neuron.kind === 'output' ? i : -1).filter(i => i >= 0),
  };
}

function simulate(genome, seq) {
  const net = compile(genome);
  const before = net.edges.map(edge => edge.weight);
  const run = SF.simulateFrozen(net, seq);
  const changed = net.edges.some((edge, i) => edge.weight !== before[i]);
  if (changed) throw new Error('A frozen network changed a weight.');
  return run;
}

function mutate(genome, rng) {
  const g = sanitize(genome);
  const roll = rng();
  if (roll < 0.5 && g.wires.length) {
    const wire = g.wires[Math.floor(rng() * g.wires.length)];
    wire.weight = round4(clamp(wire.weight + rng() * 0.4 - 0.2, -2, 2));
    if (rng() < 0.3) wire.delay = clamp(wire.delay + (rng() < 0.5 ? -1 : 1), 0, 4);
  } else {
    const lif = g.modules.filter(mod => mod.kind === 'lif');
    if (lif.length) {
      const mod = lif[Math.floor(rng() * lif.length)];
      mod.thr = round4(clamp(mod.thr + rng() * 0.3 - 0.15, 0.4, 3));
      mod.leak = round4(clamp(mod.leak + rng() * 0.1 - 0.05, 0.1, 0.95));
      mod.motif = MOTIFS[Math.floor(rng() * MOTIFS.length)];
    }
  }
  return sanitize(g);
}

function crossover(a, b, rng) {
  const left = sanitize(a), right = sanitize(b);
  const modules = left.modules.map(mod => {
    const twin = right.modules.filter(other => other.id === mod.id)[0];
    if (twin && rng() < 0.5 && mod.kind === 'lif') {
      return Object.assign({}, mod, { thr: twin.thr, leak: twin.leak, motif: twin.motif, n: twin.n });
    }
    return Object.assign({}, mod);
  });
  const wires = (rng() < 0.5 ? left.wires : right.wires).map(wire => Object.assign({}, wire));
  return sanitize({ v: 2, modules: modules, wires: wires });
}

module.exports = { MOTIFS, PATTERNS, blank, fromV1, sanitize, compile, simulate, mutate, crossover };
