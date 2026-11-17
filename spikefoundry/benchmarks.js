'use strict';
/* Real-shaped benchmarks for frozen networks.
 * MNIST can be fetched and checked by sha256. Tests use a tiny built-in subset and never download.
 * N-MNIST is left as a verified-cache hook: the public archive is about a gigabyte and is not fetched here.
 * Cart-pole is closed loop: the frozen network chooses the push. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Genome = require('./genome_v2.js');

const MNIST_FILES = {
  'train-images-idx3-ubyte.gz': {
    url: 'https://storage.googleapis.com/cvdf-datasets/mnist/train-images-idx3-ubyte.gz',
    sha256: '440fcabf73cc546fa21475e81ea370265605f56be210a4024d2ca8f203523609',
  },
  'train-labels-idx1-ubyte.gz': {
    url: 'https://storage.googleapis.com/cvdf-datasets/mnist/train-labels-idx1-ubyte.gz',
    sha256: '3552534a0a558bbed6aed32b30c495cca23d567ec52cac8be1a0730e8010255c',
  },
  't10k-images-idx3-ubyte.gz': {
    url: 'https://storage.googleapis.com/cvdf-datasets/mnist/t10k-images-idx3-ubyte.gz',
    sha256: '8d422c7b0a1c1c79245a5bcf07fe86e33eeafee792b84584aec276f5a2dbc4e6',
  },
  't10k-labels-idx1-ubyte.gz': {
    url: 'https://storage.googleapis.com/cvdf-datasets/mnist/t10k-labels-idx1-ubyte.gz',
    sha256: 'f7ae60f92e00ec6debd23a6088c31dbd2371eca3ffa0defaefb259924204aec6',
  },
};

const N_MNIST_NOTE = 'N-MNIST is a large event-camera archive (about 1 GB) from https://www.garrickorchard.com/datasets/n-mnist. It is not downloaded automatically. Place n-mnist.zip in the cache and a sidecar n-mnist.zip.sha256 to verify it.';

const ZERO = [
  0,1,1,1,1,1,1,0, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1,
  1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 0,1,1,1,1,1,1,0,
];
const ONE = [
  0,0,1,1,0,0,0,0, 0,0,0,1,1,0,0,0, 0,0,0,1,1,0,0,0, 0,0,0,1,1,0,0,0,
  0,0,0,1,1,0,0,0, 0,0,0,1,1,0,0,0, 0,0,0,1,1,0,0,0, 0,1,1,1,1,1,1,0,
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function pool(pixels) {
  const out = [];
  for (let y = 0; y < 8; y += 2) {
    for (let x = 0; x < 8; x += 2) {
      let s = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += pixels[(y + dy) * 8 + (x + dx)] || 0;
      out.push(s / 4);
    }
  }
  return out;
}
function spikeImage(pixels, encoding) {
  const values = pool(pixels);
  const steps = 6;
  const seq = Array.from({ length: steps }, () => Array(values.length).fill(0));
  values.forEach((value, channel) => {
    if (value <= 0) return;
    if (encoding === 'latency') {
      const t = Math.max(0, Math.min(steps - 1, Math.round((1 - value) * (steps - 1))));
      seq[t][channel] = 1;
    } else {
      const times = Math.max(1, Math.round(value * 3));
      for (let k = 0; k < times && k < steps; k++) seq[k][channel] = 1;
    }
  });
  return seq;
}
function predictDigit(genome, pixels, encoding) {
  const run = Genome.simulate(genome, spikeImage(pixels, encoding));
  return { label: run.outputs[0] ? 1 : 0, spikes: run.spikeCount };
}
function digitSubset(seed) {
  const train = [
    { pixels: ZERO, label: 0 },
    { pixels: ONE, label: 1 },
  ];
  const held = [
    { pixels: ZERO.slice().reverse(), label: 0 },
    { pixels: ONE.slice().reverse(), label: 1 },
  ];
  return { seed: seed, source: 'subset', train: train, heldOut: held, note: 'Deterministic 8x8 drawings for tests. A fetched MNIST cache replaces this subset.' };
}
function scoreDigits(genome, rows, encoding) {
  if (!rows.length) return { raw: 0, spikes: 0 };
  let correct = 0;
  let spikes = 0;
  rows.forEach(row => {
    const pred = predictDigit(genome, row.pixels, encoding);
    spikes += pred.spikes;
    if (pred.label === row.label) correct++;
  });
  return { raw: correct / rows.length, spikes: spikes };
}
function mnistLevel(genome, seed) {
  const data = digitSubset(seed);
  const train = scoreDigits(genome, data.train, 'rate');
  const held = scoreDigits(genome, data.heldOut, 'latency');
  return {
    id: 'mnist',
    family: 'visual',
    seed: seed,
    source: data.source,
    nist: false,
    note: data.note,
    train: { raw: train.raw, spikes: train.spikes, neurons: 16, score: Math.max(0, train.raw - 0.002 * train.spikes) },
    heldOut: { raw: held.raw, spikes: held.spikes, neurons: 16, score: Math.max(0, held.raw - 0.002 * held.spikes) },
  };
}

function verifySha256(buf, expected) {
  return sha256(buf) === expected;
}
function fetchMnist(dir, download, files) {
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  const table = files || MNIST_FILES;
  Object.keys(table).forEach(name => {
    const spec = table[name];
    const dest = path.join(dir, name);
    if (fs.existsSync(dest) && verifySha256(fs.readFileSync(dest), spec.sha256)) {
      saved.push(name);
      return;
    }
    if (typeof download !== 'function') {
      const err = new Error('MNIST file ' + name + ' is not in the cache.');
      err.code = 'mnist-missing';
      throw err;
    }
    const bytes = download(spec.url);
    if (!verifySha256(bytes, spec.sha256)) {
      const err = new Error('MNIST file ' + name + ' failed the sha256 check.');
      err.code = 'mnist-hash';
      throw err;
    }
    fs.writeFileSync(dest, bytes);
    saved.push(name);
  });
  return { ok: true, source: 'mnist', files: saved };
}
function parseIdxLabels(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 2049) {
    throw new Error('Not an IDX label file.');
  }
  const n = buf.readUInt32BE(4);
  const labels = [];
  for (let i = 0; i < n && 8 + i < buf.length; i++) labels.push(buf[8 + i]);
  return labels;
}

function fetchNmnist(dir) {
  const file = path.join(dir, 'n-mnist.zip');
  const side = path.join(dir, 'n-mnist.zip.sha256');
  if (!fs.existsSync(file) || !fs.existsSync(side)) {
    return { available: false, reason: N_MNIST_NOTE };
  }
  const expected = fs.readFileSync(side, 'utf8').trim().split(/\s+/)[0];
  const actual = sha256(fs.readFileSync(file));
  if (actual !== expected) {
    return { available: false, reason: 'N-MNIST archive did not match n-mnist.zip.sha256.' };
  }
  return { available: true, reason: 'Verified local N-MNIST archive. Event parsing is not wired yet.', sha256: actual };
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
function observe(state) {
  const scale = [state[0] / 2.4, state[1] / 2, state[2] / 0.25, state[3] / 2];
  const seq = [Array(4).fill(0), Array(4).fill(0)];
  scale.forEach((value, i) => {
    if (value > 0) seq[0][i] = 1;
    if (Math.abs(value) > 0.2) seq[1][i] = 1;
  });
  return seq;
}
function pushFromNetwork(genome, state) {
  const run = Genome.simulate(genome, observe(state));
  if (run.outputs.length > 1 && run.outputs[1] && !run.outputs[0]) return -1;
  return run.outputs[0] ? 1 : -1;
}
function rollout(genome, th0) {
  let state = [0, 0, th0, 0];
  let balanced = 0;
  let spikes = 0;
  const forces = [];
  for (let t = 0; t < 20; t++) {
    const force = pushFromNetwork(genome, state);
    forces.push(force);
    const stepSpikes = Genome.simulate(genome, observe(state)).spikeCount;
    spikes += stepSpikes;
    state = cartStep(state, force);
    if (Math.abs(state[2]) < 0.3 && Math.abs(state[0]) < 2.4) balanced++;
    else break;
  }
  return { balanced: balanced / 20, spikes: spikes, forces: forces };
}
function silentGenome() {
  const g = Genome.blank(4, 1);
  g.modules.forEach(mod => { if (mod.kind === 'lif' || mod.kind === 'output') mod.thr = 3; });
  g.wires.forEach(wire => { wire.weight = 0; });
  return Genome.sanitize(g);
}
function loudGenome() {
  const g = Genome.blank(4, 1);
  g.modules.forEach(mod => { if (mod.kind === 'lif' || mod.kind === 'output') { mod.thr = 0.4; mod.leak = 0.2; } });
  g.wires.forEach(wire => { wire.weight = 1.5; wire.delay = 0; });
  return Genome.sanitize(g);
}
function cartLevel(seed, genome) {
  const controller = genome || loudGenome();
  const train = [0.02, -0.02].map(th => rollout(controller, th));
  const held = [0.06 + (seed % 2) * 0.01, -0.05].map(th => rollout(controller, th));
  const mean = rows => rows.reduce((s, row) => s + row.balanced, 0) / rows.length;
  const spikes = rows => rows.reduce((s, row) => s + row.spikes, 0);
  return {
    id: 'cart-pole',
    family: 'control',
    seed: seed,
    frozenRule: 'frozen SNN controller',
    closedLoop: true,
    train: { raw: mean(train), spikes: spikes(train), neurons: 4, score: Math.max(0, mean(train)) },
    heldOut: { raw: mean(held), spikes: spikes(held), neurons: 4, score: Math.max(0, mean(held)) },
    sampleForces: train[0].forces,
  };
}

module.exports = {
  MNIST_FILES, N_MNIST_NOTE, ZERO, ONE, sha256, verifySha256, pool, spikeImage, digitSubset, mnistLevel,
  fetchMnist, parseIdxLabels, fetchNmnist, cartStep, rollout, cartLevel, silentGenome, loudGenome, pushFromNetwork,
};
