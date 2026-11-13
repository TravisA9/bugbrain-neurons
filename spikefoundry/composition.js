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
function chain(modules) {
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
    if (neurons.length > 4096 || edges.length > 32768 || tail > 1024) throw new Error('Composition exceeds simulator limits');
  }
  return { neurons, edges, inputs, outputs, tail };
}

function parallel(modules) {
  const result = { neurons: [], edges: [], inputs: [], outputs: [], tail: 0 };
  for (const module of modules) {
    const offset = result.neurons.length;
    for (const neuron of module.neurons) result.neurons.push({ ...neuron });
    for (const e of module.edges) result.edges.push(edge(e.from + offset, e.to + offset, e.weight, e.delay));
    for (const input of module.inputs) result.inputs.push(input + offset);
    for (const output of module.outputs) result.outputs.push(output + offset);
    result.tail = Math.max(result.tail, module.tail || 0);
    if (result.neurons.length > 4096 || result.edges.length > 32768) throw new Error('Composition exceeds simulator limits');
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

module.exports = { chain, parallel, dualSequenceCases, scoreComposition, verify, sequenceLatch, relay, compositionCheck };
