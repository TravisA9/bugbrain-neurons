'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { gzipSync, gunzipSync } = require('node:zlib');
const Throttle = require('./throttle');
const { GENES, PROBES, probe, probeIndex, temporalCircuit, designTruthTable, output } = require('./inverse_circuits');

const VERSION = 'inverse-designer-1';
const TARGETS = GENES.reduce((sum, values) => sum + values.length, 0);
const accuracy = (predicted, expected) => predicted.reduce((sum, bit, i) => sum + Number(bit === expected[i]), 0) / expected.length;

function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function shuffle(values, rng) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function circuitCorpus() {
  const byBehavior = new Map();
  const simulated = new Set();
  let candidates = [[]];
  for (const values of GENES) candidates = candidates.flatMap(genes => values.map((_, i) => genes.concat(i)));
  for (const genes of candidates) {
    Throttle.pace();
    const circuit = temporalCircuit(genes);
    const wiring = JSON.stringify(circuit);
    if (simulated.has(wiring)) continue;
    simulated.add(wiring);
    const labels = PROBES.map(seq => output(circuit, seq));
    const positives = labels.reduce((sum, bit) => sum + bit, 0);
    if (positives < 16 || positives > PROBES.length - 16) continue;
    const key = labels.join('');
    const previous = byBehavior.get(key);
    if (!previous || circuit.edges.length < previous.edgeCount) {
      byBehavior.set(key, { genes, labels, edgeCount: circuit.edges.length });
    }
  }
  return [...byBehavior.values()];
}

function encode(examples) {
  if (!Array.isArray(examples) || examples.length === 0 || examples.length > PROBES.length) {
    throw new Error('Supply between 1 and 256 spike-train examples');
  }
  const input = Array(PROBES.length).fill(0);
  for (const { x, y } of examples) {
    if (y !== 0 && y !== 1) throw new Error('Each example needs a binary output');
    const index = probeIndex(x);
    const value = y ? 1 : -1;
    if (input[index] && input[index] !== value) throw new Error('Conflicting outputs for the same spike train');
    input[index] = value;
  }
  return input;
}

function layer(input, width, rng) {
  const scale = Math.sqrt(6 / (input + width));
  return { w: Array.from({ length: width }, () => Array.from({ length: input }, () => (2 * rng() - 1) * scale)),
    b: Array(width).fill(0) };
}

function forwardLayer(input, layer, activation) {
  return layer.w.map((weights, i) => {
    let sum = layer.b[i];
    for (let j = 0; j < input.length; j++) sum += weights[j] * input[j];
    return activation(sum);
  });
}

function probabilities(logits) {
  let offset = 0;
  return GENES.map(values => {
    const slice = logits.slice(offset, offset + values.length);
    offset += values.length;
    const max = Math.max(...slice);
    const exps = slice.map(value => Math.exp(value - max));
    const total = exps.reduce((sum, value) => sum + value, 0);
    return exps.map(value => value / total);
  });
}

function forward(model, input) {
  const hidden = forwardLayer(input, model.first, Math.tanh);
  const embedding = forwardLayer(hidden, model.second, Math.tanh);
  const heads = probabilities(forwardLayer(embedding, model.out, value => value));
  return { hidden, embedding, heads };
}

function backprop(layer, input, gradient, rate) {
  const prior = Array(input.length).fill(0);
  for (let i = 0; i < gradient.length; i++) {
    const weights = layer.w[i];
    const step = rate * gradient[i];
    layer.b[i] -= step;
    for (let j = 0; j < input.length; j++) {
      prior[j] += gradient[i] * weights[j];
      weights[j] -= step * input[j];
    }
  }
  return prior;
}

function fit(tasks, rng, epochs, demoCount) {
  const model = { version: VERSION, first: layer(PROBES.length, 32, rng), second: layer(32, 24, rng), out: layer(24, TARGETS, rng) };
  const indices = PROBES.map((_, i) => i);
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const task of shuffle(tasks, rng)) {
      Throttle.pace();
      const input = Array(PROBES.length).fill(0);
      for (const index of shuffle(indices, rng).slice(0, demoCount)) input[index] = task.labels[index] ? 1 : -1;
      const { hidden, embedding, heads } = forward(model, input);
      const gradient = heads.flatMap((head, i) => head.map((p, j) => (p - Number(j === task.genes[i])) / GENES.length));
      const rate = 0.12 / (1 + epoch / 120);
      const secondGradient = backprop(model.out, embedding, gradient, rate).map((g, i) => g * (1 - embedding[i] ** 2));
      const firstGradient = backprop(model.second, hidden, secondGradient, rate).map((g, i) => g * (1 - hidden[i] ** 2));
      backprop(model.first, input, firstGradient, rate);
    }
  }
  for (const layer of [model.first, model.second, model.out]) {
    layer.w = layer.w.map(row => row.map(Math.fround));
    layer.b = layer.b.map(Math.fround);
  }
  return model;
}

function packModel(model) {
  const values = [model.first, model.second, model.out].flatMap(layer => [...layer.w.flat(), ...layer.b]);
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => bytes.writeFloatLE(value, i * 4));
  return { version: VERSION, encoding: 'f32le-gzip', payload: gzipSync(bytes).toString('base64') };
}

function unpackModel(checkpoint) {
  if (checkpoint.version !== VERSION || checkpoint.encoding !== 'f32le-gzip') throw new Error('Unsupported inverse checkpoint');
  const shapes = [[PROBES.length, 32], [32, 24], [24, TARGETS]];
  const size = shapes.reduce((total, [input, width]) => total + 4 * (input + 1) * width, 0);
  const bytes = gunzipSync(Buffer.from(checkpoint.payload, 'base64'), { maxOutputLength: size });
  if (bytes.length !== size) throw new Error('Invalid inverse checkpoint size');
  let offset = 0;
  const read = () => { const value = bytes.readFloatLE(offset); offset += 4; return value; };
  const [first, second, out] = shapes.map(([input, width]) => ({
    w: Array.from({ length: width }, () => Array.from({ length: input }, read)), b: Array.from({ length: width }, read),
  }));
  return { version: VERSION, first, second, out };
}

function proposals(model, input, count) {
  if (model?.version !== VERSION) throw new Error('Incompatible designer checkpoint');
  const { heads } = forward(model, input);
  let beam = [{ genes: [], logp: 0 }];
  for (const head of heads) {
    beam = beam.flatMap(candidate => head.map((p, i) => ({
      genes: candidate.genes.concat(i), logp: candidate.logp + Math.log(Math.max(1e-30, p)),
    }))).sort((a, b) => b.logp - a.logp).slice(0, count);
  }
  return beam.map(candidate => candidate.genes);
}

function choose(genesList, examples) {
  let best;
  const simulated = new Set();
  const expected = examples.map(({ y }) => y);
  for (const genes of genesList) {
    const circuit = temporalCircuit(genes);
    const wiring = JSON.stringify(circuit);
    if (simulated.has(wiring)) continue;
    simulated.add(wiring);
    const agreement = accuracy(examples.map(({ x }) => output(circuit, x)), expected);
    if (!best || agreement > best.demoAccuracy) best = { genes, circuit, demoAccuracy: agreement };
  }
  return best;
}

function design(model, examples, count = 8) {
  if (!Number.isInteger(count) || count < 1 || count > 32) throw new Error('Choose 1–32 proposals');
  return choose(proposals(model.encoding ? unpackModel(model) : model, encode(examples), count), examples);
}

function cpuMs(start) {
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1000;
}

function score(circuit, task, indices) {
  let hits = 0, misses = 0, positives = 0, negatives = 0;
  for (const i of indices) {
    const actual = output(circuit, PROBES[i]);
    if (task.labels[i]) {
      positives++;
      hits += actual;
    } else {
      negatives++;
      misses += 1 - actual;
    }
  }
  const recall = positives ? hits / positives : null;
  const specificity = negatives ? misses / negatives : null;
  const accuracy = (hits + misses) / indices.length;
  return { accuracy, recall, specificity, verified: recall !== null && specificity !== null && Math.min(accuracy, recall, specificity) >= 0.9 };
}

function study({ seed = 1729, epochs = 120, demoCount = 64, count = 8 } = {}) {
  for (const [value, min, max] of [[seed, 1, 1e9], [epochs, 1, 240], [demoCount, 8, 128], [count, 1, 32]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid study options');
  }
  const rng = random(seed);
  const corpusStart = process.cpuUsage();
  const corpus = shuffle(circuitCorpus(), rng);
  const corpusCpuMs = cpuMs(corpusStart);
  const split = Math.floor(corpus.length * 0.8);
  const train = corpus.slice(0, split);
  const test = corpus.slice(split);
  const start = process.cpuUsage();
  const model = fit(train, rng, epochs, demoCount);
  const trainingCpuMs = cpuMs(start);
  const indices = PROBES.map((_, i) => i);
  const results = test.map(task => {
    const shuffled = shuffle(indices, rng);
    const examples = shuffled.slice(0, demoCount).map(i => ({ x: PROBES[i], y: task.labels[i] }));
    const fresh = shuffled.slice(demoCount);
    const modelStart = process.cpuUsage();
    const learnedGenes = proposals(model, encode(examples), count);
    const learned = choose(learnedGenes, examples);
    const learnedCpuMs = cpuMs(modelStart);
    const controlStart = process.cpuUsage();
    const randomGenes = Array.from({ length: count }, () => GENES.map(values => Math.floor(rng() * values.length)));
    const control = choose(randomGenes, examples);
    const controlCpuMs = cpuMs(controlStart);
    const libraryStart = process.cpuUsage();
    const observed = shuffled.slice(0, demoCount);
    let neighbor = train[0];
    let nearestMatches = -1;
    for (const candidate of train) {
      const matches = observed.reduce((sum, i) => sum + Number(candidate.labels[i] === task.labels[i]), 0);
      if (matches > nearestMatches) {
        nearestMatches = matches;
        neighbor = candidate;
      }
    }
    const libraryCpuMs = cpuMs(libraryStart);
    return {
      sourceGenes: task.genes, examples, freshCount: fresh.length,
      direct: score(temporalCircuit(learnedGenes[0]), task, fresh),
      learned: { ...score(learned.circuit, task, fresh), genes: learned.genes, demoAccuracy: learned.demoAccuracy, cpuMs: learnedCpuMs },
      random: { ...score(control.circuit, task, fresh), genes: control.genes, demoAccuracy: control.demoAccuracy, cpuMs: controlCpuMs },
      library: { ...score(temporalCircuit(neighbor.genes), task, fresh), genes: neighbor.genes,
        demoAccuracy: nearestMatches / demoCount, cpuMs: libraryCpuMs },
    };
  });
  const exactTables = Array.from({ length: 32 }, () => Array.from({ length: 16 }, () => Number(rng() >= 0.5)));
  const exact = exactTables.filter(table => {
    const circuit = designTruthTable(table.map((y, i) => ({ x: probe(i, 4, 1)[0], y })));
    return table.every((bit, i) => output(circuit, probe(i, 4, 1)) === bit);
  }).length;
  const metrics = Object.fromEntries(['direct', 'learned', 'random', 'library'].map(arm => [arm, {
    meanAccuracy: results.reduce((sum, row) => sum + row[arm].accuracy, 0) / results.length,
    verified: results.filter(row => row[arm].verified).length,
  }]));
  return { model, report: { version: VERSION, seed, epochs, demoCount, proposals: count, trainTasks: train.length,
    testTasks: test.length, corpusCpuMs, trainingCpuMs, truthTables: { exact, tested: exactTables.length }, metrics, results } };
}

if (require.main === module) {
  try {
    const [mode, first, second] = process.argv.slice(2);
    if (mode === 'study' && first) {
      const { model, report } = study(second ? JSON.parse(fs.readFileSync(second, 'utf8')) : {});
      fs.mkdirSync(first, { recursive: true });
      fs.writeFileSync(path.join(first, 'model.json'), JSON.stringify(model));
      fs.writeFileSync(path.join(first, 'report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ ...report, results: undefined }));
    } else if (mode === 'design' && first && second) {
      console.log(JSON.stringify(design(JSON.parse(fs.readFileSync(first, 'utf8')), JSON.parse(fs.readFileSync(second, 'utf8'))), null, 2));
    } else if (mode === 'table' && first) {
      console.log(JSON.stringify(designTruthTable(JSON.parse(fs.readFileSync(first, 'utf8'))), null, 2));
    } else {
      throw new Error('Use study OUTPUT_DIR [OPTIONS_JSON], design MODEL_JSON EXAMPLES_JSON, or table EXAMPLES_JSON');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { encode, design, study, packModel };
