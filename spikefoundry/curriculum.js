'use strict';
/* Levels from the toy circuits up to synthetic scenario shapes, a tiny digit raster,
 * and a fixed cart-pole controller. N-MNIST is not downloaded. Scores on held-out
 * items are kept apart from the search items. Raw metrics stay next to the combined score. */
const Scenarios = require('./scenarios.js');
const SF = require('./engine.js');
const Benchmarks = require('./benchmarks.js');

const NOTE = 'Held-out score. The bundled digit drawings are not the MNIST files. A worker can fetch MNIST into a cache after a sha256 check. N-MNIST is not downloaded. Cart-pole is driven by a frozen network. Combined score subtracts spikes and size from the raw metric, and the raw metric is still reported.';

const ZERO = [
  0,1,1,1,1,1,1,0,
  1,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,1,
  0,1,1,1,1,1,1,0,
];
const ONE = [
  0,0,0,1,1,0,0,0,
  0,0,1,1,1,0,0,0,
  0,0,0,1,1,0,0,0,
  0,0,0,1,1,0,0,0,
  0,0,0,1,1,0,0,0,
  0,0,0,1,1,0,0,0,
  0,0,0,1,1,0,0,0,
  0,1,1,1,1,1,1,0,
];

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function combine(raw, spikes, neurons) {
  return {
    raw: raw,
    spikes: spikes,
    neurons: neurons,
    score: clamp(raw - 0.002 * spikes - 0.005 * neurons, 0, 1),
  };
}

function rateCode(pixels) {
  const events = [];
  pixels.forEach((bit, channel) => {
    const times = bit ? 3 : 0;
    for (let k = 0; k < times; k++) events.push({ t: k, channel: channel });
  });
  return { encoding: 'rate', events: events, spikes: events.length };
}
function latencyCode(pixels) {
  const events = [];
  pixels.forEach((bit, channel) => {
    if (!bit) return;
    events.push({ t: 1, channel: channel });
  });
  return { encoding: 'latency', events: events, spikes: events.length };
}
function digitMatch(code, prototype) {
  const seen = {};
  code.events.forEach(event => { seen[event.channel] = true; });
  let hit = 0, miss = 0;
  prototype.forEach((bit, i) => {
    if (bit && seen[i]) hit++;
    else if (bit || seen[i]) miss++;
  });
  return hit / (hit + miss || 1);
}

function digitLevel(seed) {
  const train = [
    { label: 0, pixels: ZERO, code: rateCode(ZERO) },
    { label: 1, pixels: ONE, code: rateCode(ONE) },
  ];
  const held = [
    { label: 0, pixels: ZERO, code: latencyCode(ZERO) },
    { label: 1, pixels: ONE, code: latencyCode(ONE) },
  ];
  const trainScore = train.reduce((s, item) => s + digitMatch(item.code, item.pixels), 0) / train.length;
  const heldScore = held.reduce((s, item) => s + digitMatch(item.code, item.pixels), 0) / held.length;
  const spikes = held.reduce((s, item) => s + item.code.spikes, 0);
  return {
    id: 'digits',
    family: 'visual',
    seed: seed,
    dataset: 'hand-drawn-8x8',
    nist: false,
    note: 'Not MNIST and not N-MNIST. Two drawings, rate code for search and latency code for held-out.',
    train: combine(trainScore, train.reduce((s, item) => s + item.code.spikes, 0), 64),
    heldOut: combine(heldScore, spikes, 64),
  };
}

function cartLevel(seed) {
  const level = Benchmarks.cartLevel(seed);
  return {
    id: 'cart-pole',
    family: 'control',
    seed: seed,
    frozenRule: level.frozenRule,
    closedLoop: true,
    train: combine(level.train.raw, level.train.spikes, 4),
    heldOut: combine(level.heldOut.raw, level.heldOut.spikes, 4),
  };
}

function scenarioLevel(kind, seed) {
  const report = Scenarios.runOne(kind, { seed: seed, batch: 2 });
  const raw = report.pipelineOk ? 1 : 0;
  return {
    id: 'scenario-' + kind,
    family: kind === 'vision' ? 'visual' : kind === 'sequence' ? 'sequential' : kind,
    seed: seed,
    train: combine(raw, report.spikeEvents || 0, report.neurons || 0),
    heldOut: combine(report.pipelineOk && report.heldOut !== 0 ? raw : 0, report.spikeEvents || 0, report.neurons || 0),
  };
}

function toyLevel(taskId, seed) {
  const g = { topology: 'parallel', wa: 1.2, wb: 1.1, thr: 1.3, decay: 0.4, nodes: 3, depth: 2 };
  const budget = SF.PILOT_BUDGET;
  const rng = SF.createState(seed).rng;
  const train = SF.scoreDesign(g, taskId, false, 0, budget, rng);
  const held = SF.scoreDesign(g, taskId, true, 0, budget, SF.createState(seed + 1).rng);
  return {
    id: taskId,
    family: 'toy',
    seed: seed,
    train: combine(train.accuracy, train.spikes, train.neurons),
    heldOut: combine(held.accuracy, held.spikes, held.neurons),
  };
}

function levels(seed) {
  return [
    toyLevel('coincidence', seed),
    toyLevel('sequence', seed),
    scenarioLevel('vision', seed),
    scenarioLevel('sequence', seed),
    scenarioLevel('graph', seed),
    scenarioLevel('control', seed),
    digitLevel(seed),
    Benchmarks.mnistLevel(Benchmarks.loudGenome(), seed),
    cartLevel(seed),
  ];
}

function promote(row) {
  if (!row || !row.heldOut || row.train === row.heldOut) return false;
  return row.heldOut.score >= 0.45 && row.heldOut.raw >= 0.5;
}

function run(seed) {
  const rows = levels(seed || 1);
  let reached = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!promote(rows[i]) && rows[i].heldOut.raw < 0.5) break;
    reached = i + 1;
  }
  return { synthetic: true, seed: seed || 1, reached: reached, levels: rows, note: NOTE };
}

module.exports = { NOTE, combine, digitLevel, cartLevel, levels, promote, run, rateCode, latencyCode };
