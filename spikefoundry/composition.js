'use strict';

const SF = require('./engine');

const cell = (kind, thr = 0.5, leak = 0) => ({ kind, thr, leak });
const edge = (from, to, weight = 1, delay = 0) => ({ from, to, weight, delay });

function run(net, sequence) {
  const tail = net.tail || 0;
  const silence = Array.from({ length: tail }, () => Array(net.inputs.length).fill(0));
  return SF.simulateFrozen(net, sequence.concat(silence)).outputs;
}

function verify(net, cases) {
  return cases.length > 0 && cases.every(({ seq, label }) =>
    label.length === net.outputs.length && run(net, seq).every((fired, i) => fired === Boolean(label[i])));
}

// Each module has explicit input/output port lists. Internal inputs become relays.
function chain(modules, opts = {}) {
  const maxN = opts.maxNeurons || 262144, maxE = opts.maxEdges || 4194304, maxT = opts.maxTail || 8192;
  if (!modules.length) throw new Error('Composition needs a module');
  const neurons = [], edges = [];
  let inputs, outputs, tail = 0;
  for (const [index, module] of modules.entries()) {
    if (outputs && outputs.length !== module.inputs.length) throw new Error('Module port counts do not match');
    const offset = neurons.length;
    const incoming = module.inputs.map(i => i + offset);
    for (const [i, neuron] of module.neurons.entries()) {
      if (index > 0 && module.inputs.includes(i)) neurons.push(cell('lif'));
      else if (index < modules.length - 1 && module.outputs.includes(i)) neurons.push({ ...neuron, kind: 'lif' });
      else neurons.push({ ...neuron });
    }
    edges.push(...module.edges.map(e => edge(e.from + offset, e.to + offset, e.weight, e.delay)));
    if (outputs) edges.push(...outputs.map((from, i) => edge(from, incoming[i])));
    else inputs = incoming;
    outputs = module.outputs.map(i => i + offset);
    tail += (module.tail || 0) + (index ? 2 : 0);
    if (neurons.length > maxN || edges.length > maxE || tail > maxT) throw new Error('Composition exceeds simulator limits');
  }
  return { neurons, edges, inputs, outputs, tail };
}

function parallel(modules, opts = {}) {
  const maxN = opts.maxNeurons || 262144, maxE = opts.maxEdges || 4194304;  
  const result = { neurons: [], edges: [], inputs: [], outputs: [], tail: 0 };
  for (const module of modules) {
    const offset = result.neurons.length;
    for (const neuron of module.neurons) result.neurons.push({ ...neuron });
    for (const e of module.edges) result.edges.push(edge(e.from + offset, e.to + offset, e.weight, e.delay));
    for (const input of module.inputs) result.inputs.push(input + offset);
    for (const output of module.outputs) result.outputs.push(output + offset);
    result.tail = Math.max(result.tail, module.tail || 0);
if (result.neurons.length > maxN || result.edges.length > maxE) throw new Error('Composition exceeds simulator limits');
  }
  return result;
}

function dualSequenceCases(left, right) {
  if (left.length !== right.length || left.length % 4 !== 0) throw new Error('Dual-sequence suites must be paired and balanced');
  return left.map((a, i) => {
    const b = right[i ^ ((i >> 1) & 1)];
    return {
      seq: Array.from({ length: Math.max(a.seq.length, b.seq.length) }, (_, t) =>
        (a.seq[t] || [0, 0]).concat(b.seq[t] || [0, 0])),
      label: [a.label[0], b.label[0]],
    };
  });
}

function scoreComposition(net, cases) {
  let exact = 0;
  const positives = net.outputs.map(() => 0);
  const hits = net.outputs.map(() => 0);
  for (const { seq, label } of cases) {
    const fired = run(net, seq);
    if (fired.every((value, i) => value === Boolean(label[i]))) exact++;
    label.forEach((want, i) => {
      positives[i] += Number(want);
      hits[i] += Number(want && fired[i]);
    });
  }
  return { accuracy: exact / cases.length, recall: hits.map((n, i) => n / positives[i]) };
}

function sequenceLatch() {
  return {
    neurons: [cell('input'), cell('input'), cell('lif'), cell('lif', 1), cell('output')],
    edges: [edge(0, 2), edge(2, 2), edge(2, 3, 0.6), edge(1, 3, 0.6), edge(3, 4)],
    inputs: [0, 1],
    outputs: [4],
  };
}

function relay() {
  return { neurons: [cell('input'), cell('output')], edges: [edge(0, 1)], inputs: [0], outputs: [1] };
}

function compositionCheck(cases, depth = 2) {
  if (!Number.isInteger(depth) || depth < 2 || depth > 128) throw new Error('Composition depth must be 2–128');
  const sequence = sequenceLatch();
  const route = relay();
  const relayCases = [{ seq: [[0], [1], [0]], label: [1] }, { seq: [[0], [0]], label: [0] }];
  const net = chain([sequence, ...Array.from({ length: depth - 1 }, () => route)]);
  return {
    depth,
    neurons: net.neurons.length,
    synapses: net.edges.length,
    delayModule: verify(sequence, cases),
    routingModule: verify(route, relayCases),
    composed: verify(net, cases),
  };
}

// Canonical micro-circuit motif 1: Working-Memory Latch with Reset & Readout Gate
// Inputs: [set, reset, gate], Outputs: [readout]
function workingMemoryLatchMotif() {
  return {
    neurons: [
      cell('input'),       // 0: set
      cell('input'),       // 1: reset
      cell('input'),       // 2: readout gate
      cell('lif', 0.5, 0), // 3: bistable reverberating memory cell
      cell('output', 1.0, 0), // 4: gated readout
    ],
    edges: [
      edge(0, 3, 1.0, 0),   // set -> memory
      edge(3, 3, 0.8, 0),   // self-sustaining recurrent loop
      edge(1, 3, -1.5, 0),  // reset -> quenches memory
      edge(3, 4, 0.6, 0),   // memory -> readout (subthreshold alone)
      edge(2, 4, 0.6, 1),   // gate -> readout (aligned with memory latency)
    ],
    inputs: [0, 1, 2],
    outputs: [4],
  };
}

// Canonical micro-circuit motif 2: Predictive Surprise / Boundary Detector
// Inputs: [sensory, prediction], Outputs: [surprise]
// Fires iff sensory arrives without a matching prediction.
function surpriseBoundaryMotif() {
  return {
    neurons: [
      cell('input'),          // 0: sensory event
      cell('input'),          // 1: top-down prediction
      cell('output', 0.8, 0), // 2: surprise detector
    ],
    edges: [
      edge(0, 2, 1.0, 0),     // sensory excitation
      edge(1, 2, -1.2, 0),    // predictive cancellation
    ],
    inputs: [0, 1],
    outputs: [2],
  };
}

// Canonical micro-circuit motif 3: Role-Filler Coincidence Binding Matrix
// Inputs: [role0, role1, filler0, filler1], Outputs: [b00, b01, b10, b11]
function roleFillerBindMotif(plastic = false) {
  const mkEdge = (u, v, w) => ({ from: u, to: v, weight: w, delay: 0, plastic: Boolean(plastic) });
  return {
    neurons: [
      cell('input'), cell('input'), cell('input'), cell('input'),
      cell('output', 1.0, 0), cell('output', 1.0, 0), cell('output', 1.0, 0), cell('output', 1.0, 0),
    ],
    edges: [
      mkEdge(0, 4, 0.6), mkEdge(2, 4, 0.6),
      mkEdge(0, 5, 0.6), mkEdge(3, 5, 0.6),
      mkEdge(1, 6, 0.6), mkEdge(2, 6, 0.6),
      mkEdge(1, 7, 0.6), mkEdge(3, 7, 0.6),
    ],
    inputs: [0, 1, 2, 3],
    outputs: [4, 5, 6, 7],
  };
}

// Canonical micro-circuit motif 4 (evolved in Step 2): Composite Chunk-Gated Working Memory + Surprise Detector
// Champion genes: [wLatch=0.8, wGate=0.6, wCancel=-1.2, delayGate=0, leakMem=0.0]
// Inputs: [cueA, cueB, distractor, boundaryGate], Outputs: [predAfterBoundary, surpriseSignal]
function evolvedChunkGateMotif(genes = [0.8, 0.6, -1.2, 0, 0]) {
  const [wLatch, wGate, wCancel, delayGate, leakMem] = genes;
  return {
    neurons: [
      cell('input'),
      cell('input'),
      cell('input'),
      cell('input'),
      cell('lif', 0.5, leakMem),
      cell('output', 1.0, 0),
      cell('output', 0.8, 0),
    ],
    edges: [
      edge(0, 4, 1.0, 0),
      edge(4, 4, wLatch, 0),
      edge(2, 4, -0.05, 0),
      edge(4, 5, wGate, 0),
      edge(3, 5, wGate, delayGate),
      edge(1, 6, 1.0, 0),
      edge(0, 6, wCancel, 0),
    ],
    inputs: [0, 1, 2, 3],
    outputs: [5, 6],
  };
}

// Compiles a SpikeFoundry snn-graph-1 circuit into a BugBrain 'direct' genome
// whose sub-step dynamics in SpikingArena.SpikingNet match simulateFrozen.
function compileToBugBrain(circuit, opts = {}) {
  const V_REST = opts.vRest != null ? opts.vRest : -70;
  const zeroLeak = opts.zeroLeak != null ? opts.zeroLeak : 0.001;
  const inSet = new Set(circuit.inputs);
  const outSet = new Set(circuit.outputs);
  const hidOrig = [];
  for (let i = 0; i < circuit.neurons.length; i++) {
    if (!inSet.has(i) && !outSet.has(i)) hidOrig.push(i);
  }
  const expandedEdges = [];
  const relayNeurons = [];
  for (const e of circuit.edges) {
    const d = Math.max(0, e.delay | 0);
    if (d === 0) {
      expandedEdges.push({ from: e.from, to: e.to, weight: e.weight, plastic: Boolean(e.plastic) });
    } else {
      let prev = e.from;
      for (let step = 0; step < d; step++) {
        const rIdx = circuit.neurons.length + relayNeurons.length;
        relayNeurons.push({ kind: 'lif', thr: 0.5, leak: 0 });
        expandedEdges.push({ from: prev, to: rIdx, weight: 1.0, plastic: false });
        prev = rIdx;
      }
      expandedEdges.push({ from: prev, to: e.to, weight: e.weight, plastic: Boolean(e.plastic) });
    }
  }
  const allNeurons = circuit.neurons.concat(relayNeurons);
  const nIn = circuit.inputs.length;
  const nOut = circuit.outputs.length;
  const hidList = hidOrig.concat(relayNeurons.map((_, k) => circuit.neurons.length + k));
  const nHid = hidList.length;
  const N = nIn + nHid + nOut;
  const oldToNew = new Int32Array(allNeurons.length).fill(-1);
  circuit.inputs.forEach((orig, idx) => { oldToNew[orig] = idx; });
  hidList.forEach((orig, idx) => { oldToNew[orig] = nIn + idx; });
  circuit.outputs.forEach((orig, idx) => { oldToNew[orig] = nIn + nHid + idx; });

  const thresh = new Float32Array(N);
  const leak = new Float32Array(N);
  const slow = new Uint8Array(N);
  const effLeak = new Float64Array(N);
  for (let orig = 0; orig < allNeurons.length; orig++) {
    const u = oldToNew[orig];
    if (u < 0) continue;
    const n = allNeurons[orig];
    if (u < nIn) {
      slow[u] = 1;
      leak[u] = 0.85;
      effLeak[u] = 0.85;
      thresh[u] = V_REST + 20;
    } else {
      const lk = n.leak > 0 ? n.leak : zeroLeak;
      const th = n.thr != null ? n.thr : 0.5;
      slow[u] = 1;
      leak[u] = lk;
      effLeak[u] = lk;
      thresh[u] = V_REST + th;
    }
  }
  const W = new Float32Array(N * N);
  const P = new Uint8Array(N * N);
  const C = new Uint8Array(N * N);
  for (const e of expandedEdges) {
    const u = oldToNew[e.from], v = oldToNew[e.to];
    if (u < 0 || v < 0) continue;
    const idx = u * N + v;
    W[idx] += e.weight / effLeak[v];
    if (e.plastic) P[idx] = 1;
  }
  const pos = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    pos[2 * i] = i < nIn ? 0.1 : i >= nIn + nHid ? 0.9 : 0.5;
    pos[2 * i + 1] = (i + 0.5) / N;
  }
  return {
    kind: 'direct',
    nIn, nHid, nOut, N,
    W, P, C, thresh, leak, slow, pos,
    pl: Object.assign({ lr: 0.1, tauPre: 4, tauPost: 4, tauElig: 8, aMinus: 0.5 }, opts.pl),
  };
}

// Splices a SpikeFoundry circuit motif into an existing BugBrain 'direct' genome.
function graftMotifIntoGenome(bgGenome, circuit, mapOpts = {}) {
  const motif = compileToBugBrain(circuit, mapOpts);
  const nIn1 = bgGenome.nIn, nHid1 = bgGenome.nHid, nOut1 = bgGenome.nOut, N1 = bgGenome.N;
  const mActive = motif.nHid + motif.nOut;
  const nHid = nHid1 + mActive;
  const N = nIn1 + nHid + nOut1;
  const map1 = i => (i < nIn1 + nHid1 ? i : i + mActive);
  const mapM = j => nIn1 + nHid1 + (j - motif.nIn);

  const W = new Float32Array(N * N);
  const P = new Uint8Array(N * N);
  const C = new Uint8Array(N * N);
  const thresh = new Float32Array(N);
  const leak = new Float32Array(N);
  const slow = new Uint8Array(N);
  const pos = new Float32Array(N * 2);

  for (let i = 0; i < N1; i++) {
    const u = map1(i);
    thresh[u] = bgGenome.thresh[i];
    if (bgGenome.leak) leak[u] = bgGenome.leak[i];
    if (bgGenome.slow) slow[u] = bgGenome.slow[i];
    if (bgGenome.pos) { pos[2 * u] = bgGenome.pos[2 * i]; pos[2 * u + 1] = bgGenome.pos[2 * i + 1]; }
    for (let j = 0; j < N1; j++) {
      const v = map1(j), k1 = i * N1 + j, k = u * N + v;
      W[k] = bgGenome.W[k1]; P[k] = bgGenome.P[k1]; if (bgGenome.C) C[k] = bgGenome.C[k1];
    }
  }
  for (let i = motif.nIn; i < motif.N; i++) {
    const u = mapM(i);
    thresh[u] = motif.thresh[i]; leak[u] = motif.leak[i]; slow[u] = motif.slow[i];
    pos[2 * u] = motif.pos[2 * i]; pos[2 * u + 1] = motif.pos[2 * i + 1];
    for (let j = motif.nIn; j < motif.N; j++) {
      const v = mapM(j), km = i * motif.N + j, k = u * N + v;
      W[k] = motif.W[km]; P[k] = motif.P[km]; C[k] = motif.C[km];
    }
  }
  const inSources = mapOpts.inputSources || [];
  for (let mIn = 0; mIn < motif.nIn && mIn < inSources.length; mIn++) {
    const src = map1(inSources[mIn]);
    for (let j = motif.nIn; j < motif.N; j++) {
      const w = motif.W[mIn * motif.N + j];
      if (w !== 0) {
        const dst = mapM(j);
        W[src * N + dst] += w;
        if (motif.P[mIn * motif.N + j]) P[src * N + dst] = 1;
      }
    }
  }
  const outTargets = mapOpts.outputTargets || [];
  const outWeight = mapOpts.outputWeight != null ? mapOpts.outputWeight : 35;
  for (let mOut = 0; mOut < motif.nOut && mOut < outTargets.length; mOut++) {
    const src = mapM(motif.nIn + motif.nHid + mOut);
    const dst = map1(outTargets[mOut]);
    W[src * N + dst] += outWeight;
    if (mapOpts.plasticOutputs) P[src * N + dst] = 1;
  }
  return Object.assign({}, bgGenome, { nHid, N, W, P, C, thresh, leak, slow, pos });
}

// Executes a compiled SpikeFoundry circuit directly inside BugBrain's SpikingNet engine.
function runInBugBrain(circuit, seq, SpikingNet) {
  const bg = circuit.kind === 'direct' ? circuit : compileToBugBrain(circuit);
  const net = new SpikingNet(bg);
  const fired = new Array(bg.nOut).fill(false);
  const horizon = seq.length + 4;
  for (let t = 0; t < horizon; t++) {
    net.ext.fill(0);
    if (t < seq.length) for (let i = 0; i < bg.nIn; i++) if (seq[t][i]) net.ext[i] = 100;
    net.extAt = -1;
    net.step();
    for (let o = 0; o < bg.nOut; o++) if (net.spiked[bg.nIn + bg.nHid + o]) fired[o] = true;
  }
  return fired;
}

module.exports = {
  chain, parallel, dualSequenceCases, scoreComposition, verify, sequenceLatch, relay, compositionCheck,
  workingMemoryLatchMotif, surpriseBoundaryMotif, roleFillerBindMotif, evolvedChunkGateMotif,
  compileToBugBrain, graftMotifIntoGenome, runInBugBrain,
};
