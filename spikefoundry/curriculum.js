'use strict';
/* Levels from the toy circuits up to synthetic scenario shapes, a tiny digit raster,
 * and a fixed cart-pole controller. N-MNIST is not downloaded. Scores on held-out
 * items are kept apart from the search items. Raw metrics stay next to the combined score. */
const Scenarios = require('./scenarios.js');
const SF = require('./engine.js');

const NOTE = 'Held-out score. The digit rasters are 8 by 8 drawings, not MNIST and not N-MNIST. Cart-pole uses a frozen push rule. Combined score subtracts spikes and size from the raw metric, and the raw metric is still reported.';

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

function cartStep(state, force) {
  const x = state[0], dx = state[1], th = state[2], dth = state[3];
  const gravity = 9.8, pole = 0.1, cart = 1, length = 0.5, dt = 0.02;
  const sine = Math.sin(th), cosine = Math.cos(th);
  const temp = (force + pole * length * dth * dth * sine) / (cart + pole);
  const thAcc = (gravity * sine - cosine * temp) / (length * (4 / 3 - pole * cosine * cosine / (cart + pole)));
  const xAcc = temp - pole * length * thAcc * cosine / (cart + pole);
  return [x + dx * dt, dx + xAcc * dt, th + dth * dt, dth + thAcc * dt];
}
function cartRollout(th0) {
  let state = [0, 0, th0, 0];
  let balanced = 0;
  let spikes = 0;
  for (let t = 0; t < 30; t++) {
    const force = state[2] > 0 ? 1 : -1;
    spikes += 1;
    state = cartStep(state, force);
    if (Math.abs(state[2]) < 0.25 && Math.abs(state[0]) < 2.4) balanced++;
    else break;
  }
  return { balanced: balanced / 30, spikes: spikes };
}
function cartLevel(seed) {
  const trainAngles = [0.02, -0.02];
  const heldAngles = [0.05 + (seed % 3) * 0.005, -0.04];
  const train = trainAngles.map(cartRollout);
  const held = heldAngles.map(cartRollout);
  const mean = rows => rows.reduce((s, row) => s + row.balanced, 0) / rows.length;
  const spikes = held.reduce((s, row) => s + row.spikes, 0);
  return {
    id: 'cart-pole',
    family: 'control',
    seed: seed,
    frozenRule: 'push against the lean',
    train: combine(mean(train), train.reduce((s, row) => s + row.spikes, 0), 4),
    heldOut: combine(mean(held), spikes, 4),
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
