'use strict';

const { simulateFrozen } = require('./engine');

const CHANNELS = 2;
const STEPS = 4;
const PROBE_COUNT = 2 ** (CHANNELS * STEPS);
const GENES = [
  [-0.8, 0, 0.8, 1.2], // weight from A
  [-0.8, 0, 0.8, 1.2], // weight from B
  [0, 1, 2],           // delay from A
  [0, 1, 2],           // delay from B
  [0.65, 1.25],        // gate threshold
  [0, 0.65],           // gate leak
  [0, 0.4],            // recurrent weight
];

const neuron = (kind, thr = 1, leak = 0) => ({ kind, thr, leak });
const edge = (from, to, weight, delay = 0) => ({ from, to, weight, delay });

function probe(index, channels = CHANNELS, steps = STEPS) {
  return Array.from({ length: steps }, (_, t) =>
    Array.from({ length: channels }, (_, channel) => (index >> (t * channels + channel)) & 1));
}

const PROBES = Array.from({ length: PROBE_COUNT }, (_, index) => probe(index));

function probeIndex(seq) {
  if (!Array.isArray(seq) || seq.length !== STEPS ||
      !seq.every(row => Array.isArray(row) && row.length === CHANNELS && row.every(bit => bit === 0 || bit === 1))) {
    throw new Error('Each spike train must have four steps with two binary inputs per step');
  }
  return seq.flat().reduce((index, bit, i) => index | (bit << i), 0);
}

function temporalCircuit(genes) {
  if (!Array.isArray(genes) || genes.length !== GENES.length ||
      !genes.every((value, i) => Number.isInteger(value) && value >= 0 && value < GENES[i].length)) {
    throw new Error('Invalid temporal circuit genes');
  }
  const [a, b, delayA, delayB, threshold, leak, feedback] = genes.map((index, i) => GENES[i][index]);
  const edges = [edge(2, 3, 1)];
  if (a) edges.push(edge(0, 2, a, delayA));
  if (b) edges.push(edge(1, 2, b, delayB));
  if (feedback) edges.push(edge(2, 2, feedback));
  return { neurons: [neuron('input'), neuron('input'), neuron('lif', threshold, leak), neuron('output')],
    edges, inputs: [0, 1], outputs: [3] };
}

function output(circuit, seq) {
  return Number(simulateFrozen(circuit, seq).outputs[0]);
}

// A one-shot internal bias gives each detector a single opportunity to fire,
// including the detector for an input of all zeros.
function truthTableCircuit(table) {
  if (!Array.isArray(table) || table.length !== 16 || !table.every(bit => bit === 0 || bit === 1)) {
    throw new Error('A four-input truth table needs 16 binary outputs');
  }
  const inputs = [0, 1, 2, 3];
  const bias = 4;
  const out = 5;
  const neurons = inputs.map(() => neuron('input')).concat(neuron('lif', 0, 1), neuron('output', 0.5));
  const edges = [edge(bias, bias, -1)];
  table.forEach((bit, index) => {
    if (!bit) return;
    const [pattern] = probe(index, 4, 1);
    const gate = neurons.length;
    neurons.push(neuron('lif', pattern.reduce((sum, value) => sum + value, 0) + 0.5));
    edges.push(edge(bias, gate, 1), edge(gate, out, 1));
    pattern.forEach((value, input) => edges.push(edge(input, gate, value ? 1 : -1)));
  });
  return { neurons, edges, inputs, outputs: [out] };
}

function designTruthTable(examples) {
  if (!Array.isArray(examples) || examples.length !== 16) {
    throw new Error('Supply all 16 input/output pairs for a four-input truth table');
  }
  const table = Array(16).fill(null);
  for (const { x, y } of examples) {
    if (!Array.isArray(x) || x.length !== 4 || !x.every(bit => bit === 0 || bit === 1) || (y !== 0 && y !== 1)) {
      throw new Error('Each truth-table example needs four binary inputs and one binary output');
    }
    const index = x.reduce((value, bit, i) => value | (bit << i), 0);
    if (table[index] !== null) throw new Error('Duplicate truth-table input');
    table[index] = y;
  }
  return truthTableCircuit(table);
}

module.exports = { GENES, PROBES, probe, probeIndex, temporalCircuit, designTruthTable, output };
