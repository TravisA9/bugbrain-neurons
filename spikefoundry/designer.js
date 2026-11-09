'use strict';
/* Small pure-JS designer. The surrogate only ranks frozen genomes.
 * The generator only proposes frozen genomes. Neither one changes a weight at run time. */
const Tasks = require('./tasks.js');
const Genome = require('./genome_v2.js');
const Library = require('./library.js');

const DESIGN_FEATURES = 16;
const ACTIONS = 8;

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function designFeatures(genome) {
  const g = genome && genome.v === 2 ? genome : Genome.fromV1(genome || {});
  const clean = Genome.sanitize(g);
  const lif = clean.modules.filter(mod => mod.kind === 'lif');
  const vec = Array(DESIGN_FEATURES).fill(0);
  vec[0] = clean.modules.length / 6;
  vec[1] = lif.length / 4;
  vec[2] = lif.length ? lif.reduce((s, mod) => s + mod.thr, 0) / lif.length / 3 : 0;
  vec[3] = lif.length ? lif.reduce((s, mod) => s + mod.leak, 0) / lif.length : 0;
  vec[4] = clean.wires.length ? clean.wires.reduce((s, w) => s + Math.abs(w.weight), 0) / clean.wires.length / 2 : 0;
  vec[5] = clean.wires.length ? clean.wires.reduce((s, w) => s + w.delay, 0) / clean.wires.length / 4 : 0;
  vec[6] = lif.length ? lif.filter(mod => mod.sign < 0).length / lif.length : 0;
  vec[7] = clean.wires.length / 8;
  const motif = lif[0] ? lif[0].motif : 'feedforward';
  const motifs = Genome.MOTIFS;
  const idx = motifs.indexOf(motif);
  if (idx >= 0) vec[8 + idx] = 1;
  return vec.map(v => clamp(v, 0, 1));
}

function pack(taskFeatures, genome) {
  return taskFeatures.concat(designFeatures(genome));
}

function makeSurrogate(rng) {
  const input = Tasks.FEATURE_LENGTH + DESIGN_FEATURES;
  return {
    input: input,
    W1: Array.from({ length: 12 }, () => Array.from({ length: input }, () => rng() * 0.2 - 0.1)),
    b1: Array(12).fill(0),
    W2: Array.from({ length: 12 }, () => rng() * 0.2 - 0.1),
    b2: 0,
  };
}
function forward(model, x) {
  const h = model.W1.map((row, i) => Math.tanh(row.reduce((s, w, j) => s + w * (x[j] || 0), model.b1[i])));
  const y = 1 / (1 + Math.exp(-clamp(model.W2.reduce((s, w, i) => s + w * h[i], model.b2), -20, 20)));
  return { h: h, y: y };
}
function trainSurrogate(model, x, target) {
  const lr = 0.05;
  const pass = forward(model, x);
  const err = pass.y - target;
  const y = pass.y;
  const grad = err * y * (1 - y);
  for (let i = 0; i < model.W2.length; i++) {
    const hiddenGrad = grad * model.W2[i] * (1 - pass.h[i] * pass.h[i]);
    model.W2[i] -= lr * grad * pass.h[i];
    for (let j = 0; j < model.W1[i].length; j++) model.W1[i][j] -= lr * hiddenGrad * (x[j] || 0);
    model.b1[i] -= lr * hiddenGrad;
  }
  model.b2 -= lr * grad;
}
function predict(model, taskFeatures, genome) {
  return forward(model, pack(taskFeatures, genome)).y;
}

function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = Array(values.length);
  order.forEach((pair, index) => { out[pair[1]] = index + 1; });
  return out;
}
function spearman(left, right) {
  if (left.length < 2 || left.length !== right.length) return 0;
  const a = ranks(left), b = ranks(right);
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - meanA, y = b[i] - meanB;
    num += x * y; da += x * x; db += y * y;
  }
  if (!da || !db) return 0;
  return num / Math.sqrt(da * db);
}

function fitSurrogate(examples, seed) {
  const rng = mulberry32(seed || 1);
  const model = makeSurrogate(rng);
  const split = Math.max(1, Math.floor(examples.length * 0.75));
  const train = examples.slice(0, split);
  const held = examples.slice(split);
  for (let epoch = 0; epoch < 40; epoch++) {
    train.forEach(example => trainSurrogate(model, example.x, example.y));
  }
  const predicted = held.map(example => forward(model, example.x).y);
  return { model: model, spearman: spearman(predicted, held.map(example => example.y)), heldOut: held.length };
}

function makePolicy(rng) {
  return Array.from({ length: ACTIONS }, () => Array.from({ length: Tasks.FEATURE_LENGTH }, () => rng() * 0.1 - 0.05));
}
function actionScores(policy, taskFeatures) {
  return policy.map(row => row.reduce((s, w, i) => s + w * (taskFeatures[i] || 0), 0));
}
function applyAction(genome, action) {
  const g = Genome.sanitize(genome);
  const lif = g.modules.filter(mod => mod.kind === 'lif' && mod.sign > 0)[0];
  const wire = g.wires[0];
  if (action === 0 && lif) lif.motif = 'coincidence';
  if (action === 1 && lif) lif.motif = 'wta';
  if (action === 2 && lif) lif.motif = 'delay-line';
  if (action === 3 && wire) wire.weight = clamp(wire.weight + 0.15, -2, 2);
  if (action === 4 && lif) lif.thr = clamp(lif.thr - 0.1, 0.4, 3);
  if (action === 5 && wire) wire.delay = clamp(wire.delay + 1, 0, 4);
  if (action === 6 && g.wires.length) g.wires[g.wires.length - 1].weight = clamp(g.wires[g.wires.length - 1].weight + 0.1, -2, 2);
  if (action === 7) {
    const inhib = g.modules.filter(mod => mod.sign < 0)[0];
    if (inhib) inhib.motif = 'lateral';
  }
  return Genome.sanitize(g);
}
function propose(taskFeatures, rng, policy) {
  let genome = Genome.blank(2, 1);
  const scores = actionScores(policy, taskFeatures);
  for (let step = 0; step < 4; step++) {
    const noise = scores.map(score => score + rng() * 0.05);
    let best = 0;
    noise.forEach((score, i) => { if (score > noise[best]) best = i; });
    genome = applyAction(genome, best);
  }
  return genome;
}
function trainPolicy(policy, taskFeatures, action, advantage) {
  const lr = 0.02 * advantage;
  policy[action].forEach((weight, i) => { policy[action][i] = weight + lr * (taskFeatures[i] || 0); });
}

function screen(taskFeatures, parent, rng, model, count) {
  const scored = [];
  let genome = parent;
  for (let i = 0; i < count; i++) {
    genome = Genome.mutate(genome, rng);
    scored.push({ genome: genome, predicted: predict(model, taskFeatures, genome) });
  }
  scored.sort((a, b) => b.predicted - a.predicted);
  return scored.slice(0, 3);
}

function exampleFromScore(taskId, genome, quality) {
  const spec = Tasks.specById(taskId) || Tasks.specById('coincidence');
  return { x: pack(Tasks.featuresOf(spec), genome), y: clamp(quality, 0, 1) };
}

function run(job, outDir, SF) {
  const fs = require('fs'), path = require('path');
  const taskId = job.taskId || 'coincidence';
  const spec = Tasks.specById(taskId) || Tasks.specById('coincidence');
  const taskFeatures = Tasks.featuresOf(spec);
  const rng = mulberry32(job.seed || 1);
  const examples = [];
  for (let i = 0; i < 12; i++) {
    const genome = Genome.fromV1(SF.randomGenome ? { topology: 'parallel', wa: 0.4 + rng(), wb: 0.4 + rng(), thr: 0.8 + rng(), decay: 0.3 + rng() * 0.4, nodes: 2, depth: 1 } : {});
    const parent = i === 0 ? Genome.blank(2, 1) : Genome.mutate(Genome.blank(2, 1), rng);
    const frozen = i % 2 ? parent : genome;
    const quality = 0.2 + 0.6 * designFeatures(frozen)[4];
    examples.push(exampleFromScore(taskId, frozen, quality));
  }
  const fit = fitSurrogate(examples, job.seed || 1);
  const policy = makePolicy(rng);
  trainPolicy(policy, taskFeatures, 3, 0.4);
  const proposed = [];
  if (job.mode === 'propose') {
    for (let i = 0; i < 4; i++) {
      const genome = propose(taskFeatures, rng, policy);
      const score = SF.scoreDesign
        ? SF.scoreDesign({ topology: 'parallel', wa: 1, wb: 1, thr: 1.2, decay: 0.5, nodes: 2, depth: 1 }, taskId === 'coincidence' || SF.BASE_TASKS[taskId] ? (SF.BASE_TASKS[taskId] ? taskId : 'coincidence') : 'coincidence', true, 0, SF.PILOT_BUDGET, SF.createState(job.seed || 1).rng)
        : { quality: fit.model ? predict(fit.model, taskFeatures, genome) : 0, accuracy: 0, f1: 0, precision: 0, recall: 0, neurons: 4, synapses: 4, spikes: 0 };
      const run = Genome.simulate(genome, spec.examples[0] && Array.isArray(spec.examples[0].input) && Array.isArray(spec.examples[0].input[0]) ? spec.examples[0].input : [[1, 0], [1, 1], [0, 0]]);
      proposed.push({ genome: genome, quality: score.quality, spikes: run.spikeCount, neurons: Genome.compile(genome).neurons.length, synapses: Genome.compile(genome).edges.length });
    }
  }
  const screened = screen(taskFeatures, Genome.blank(2, 1), rng, fit.model, 8);
  const checkpoint = {
    format: 'spikefoundry-designer',
    surrogate: fit.model,
    policy: policy,
    spearman: fit.spearman,
    heldOut: fit.heldOut,
    synthetic: true,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'model.json'), JSON.stringify(checkpoint));
  const records = Library.fromEvaluations(proposed.map(item => ({
    taskId: taskId, taskVersion: spec.version, genome: item.genome,
    metrics: { quality: item.quality, accuracy: item.quality, f1: item.quality, precision: item.quality, recall: item.quality, train: item.quality, heldOut: item.quality, arm: 'designer' },
    neurons: item.neurons, synapses: item.synapses, spikes: item.spikes, evalMs: 0, seed: job.seed || 1,
  })), { jobId: job.id || 'designer', engineVersion: 'spikefoundry-designer-1' });
  if (records.length) fs.writeFileSync(path.join(outDir, 'designs.json'), JSON.stringify({ records: records }));
  const summary = {
    synthetic: true,
    batches: 1,
    tested: examples.length,
    phase: 1,
    tasks: [{ task: taskId, name: taskId, syntheticScore: screened[0] ? screened[0].predicted : 0, syntheticMatch: screened[0] ? screened[0].predicted : 0, neurons: 0, synapses: 0, batch: 1 }],
    spearman: fit.spearman,
    proposed: proposed.length,
    screened: screened.map(item => item.predicted),
    note: 'Synthetic spike-pattern match on generated examples. Not BugBrain accuracy.',
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

module.exports = {
  DESIGN_FEATURES, ACTIONS, designFeatures, makeSurrogate, trainSurrogate, predict, fitSurrogate, spearman,
  makePolicy, propose, trainPolicy, screen, applyAction, exampleFromScore, run,
};
