'use strict';
/* Small pure-JS designer. The surrogate only ranks frozen genomes.
 * The generator only proposes frozen genomes. Neither one changes a weight at run time. */
const Tasks = require('./tasks.js');
const Genome = require('./genome_v2.js');
const Library = require('./library.js');
const Throttle = require('./throttle.js');

const DESIGN_FEATURES = 16;
const ACTIONS = 8;
const DESIGNER_VERSION = 'spikefoundry-designer-3';
// Jobs stop on their targetSeconds clock. This cap is only a safety net: at ~2,800
// evaluations a second a 3600-second job still stays under it.
const EVAL_CAP = 20000000;
// Retention is bounded (top-N, random reservoir, thinned curve), so heap use stays flat.
// The guard stops a job early if the heap still grows past this many megabytes.
const HEAP_GUARD_MB = 768;

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
function propose(taskFeatures, rng, policy, parent) {
  let genome = parent ? Genome.sanitize(parent) : Genome.blank(2, 1);
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

function vary(genome, rng) {
  const g = Genome.sanitize(genome);
  if (g.wires.length) {
    const wire = g.wires[Math.floor(rng() * g.wires.length)];
    wire.weight = Math.round((rng() * 3 - 1) * 10000) / 10000;
    wire.delay = Math.floor(rng() * 4);
  }
  const lif = g.modules.filter(mod => mod.kind === 'lif');
  if (lif.length) {
    const mod = lif[Math.floor(rng() * lif.length)];
    mod.thr = Math.round((0.4 + rng() * 2.2) * 10000) / 10000;
    mod.leak = Math.round((0.2 + rng() * 0.7) * 10000) / 10000;
    mod.n = clamp(Math.round(1 + rng() * 7), 1, 8);
  }
  const input = g.modules.filter(mod => mod.kind === 'input')[0];
  if (input && rng() < 0.7) input.n = clamp(Math.round(1 + rng() * 5), 1, 8);
  const output = g.modules.filter(mod => mod.kind === 'output')[0];
  if (output && rng() < 0.7) output.n = clamp(Math.round(1 + rng() * 3), 1, 4);
  return Genome.sanitize(g);
}

function blankFor(taskId) {
  const spec = Tasks.specById(taskId) || Tasks.specById('coincidence');
  const inputs = Math.max(1, Math.min(8, (spec.inputs && spec.inputs.count) || 2));
  const outputs = Math.max(1, Math.min(8, (spec.outputs && spec.outputs.count) || 1));
  return Genome.blank(inputs, outputs);
}

function scoreSet(genome, samples) {
  let exact = 0, tp = 0, fp = 0, fn = 0, spikes = 0, neurons = 0, synapses = 0;
  samples.forEach(sample => {
    const run = Genome.simulate(genome, sample.seq);
    neurons = run.neurons;
    synapses = run.synapses;
    const label = (sample.label || []).map(value => !!value);
    const outs = run.outputs || [];
    let match = outs.length === label.length && label.length > 0;
    const n = Math.max(outs.length, label.length);
    for (let j = 0; j < n; j++) {
      const fired = !!outs[j];
      const want = !!label[j];
      if (fired !== want) match = false;
      if (fired && want) tp++;
      else if (fired) fp++;
      else if (want) fn++;
    }
    if (match) exact++;
    spikes += run.spikeCount || 0;
  });
  const n = Math.max(1, samples.length);
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = 2 * precision * recall / (precision + recall || 1);
  const accuracy = samples.length ? exact / samples.length : 0;
  const meanSpikes = spikes / n;
  const quality = clamp(accuracy - 0.0015 * (neurons + synapses) - 0.00025 * meanSpikes, 0, 1);
  return { accuracy: accuracy, precision: precision, recall: recall, f1: f1, quality: quality, spikes: spikes, neurons: neurons, synapses: synapses };
}

function scoreGenome(genome, taskId, seed, trials) {
  const trainN = Math.max(1, Math.min(32, (trials && trials.train) || 4));
  const heldN = Math.max(1, Math.min(32, (trials && trials.held) || 4));
  const SF = require('./engine.js');
  const base = (seed || 1) >>> 0;
  let trainSamples = SF.taskSamples ? SF.taskSamples(taskId, trainN, false, base) : [];
  let heldSamples = SF.taskSamples ? SF.taskSamples(taskId, heldN, true, (base + 17) >>> 0) : [];
  if (!trainSamples.length || !heldSamples.length) {
    const spec = Tasks.specById(taskId) || Tasks.specById('coincidence');
    const examples = (spec.examples || []).filter(example => Array.isArray(example.input) && example.input.length && Array.isArray(example.input[0]));
    const asSample = example => ({ seq: example.input, label: Array.isArray(example.output) ? example.output : [example.output ? 1 : 0] });
    const mid = Math.max(1, Math.floor(examples.length / 2));
    trainSamples = examples.slice(0, mid).map(asSample);
    heldSamples = examples.slice(mid).map(asSample);
    if (!heldSamples.length) heldSamples = trainSamples.slice();
  }
  const started = Date.now();
  const train = scoreSet(genome, trainSamples);
  const held = scoreSet(genome, heldSamples);
  return {
    quality: held.quality,
    accuracy: held.accuracy,
    f1: held.f1,
    precision: held.precision,
    recall: held.recall,
    train: train.quality,
    heldOut: held.quality,
    neurons: held.neurons,
    synapses: held.synapses,
    spikes: held.spikes,
    evalMs: Date.now() - started,
  };
}

function exampleFromScore(taskId, genome, quality) {
  const spec = Tasks.specById(taskId) || Tasks.specById('coincidence');
  return { x: pack(Tasks.featuresOf(spec), genome), y: clamp(quality, 0, 1) };
}

function thinCurve(points, max) {
  if (!points || points.length <= max) return points ? points.slice() : [];
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * (points.length - 1) / (max - 1))]);
  return out;
}

function run(job, outDir, SF) {
  const fs = require('fs'), path = require('path');
  fs.mkdirSync(outDir, { recursive: true });
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
  const requested = +job.evals;
  const evalCap = requested > 0 ? Math.max(1, Math.min(EVAL_CAP, requested)) : EVAL_CAP;
  const budgetMs = Math.max(1, Math.min(3600, +job.targetSeconds || +job.target_seconds || 180)) * 1000;
  const keepTop = Math.max(1, Math.min(200, +job.keepTop || +job.keep_top || 50));
  const keepRandom = Math.max(0, Math.min(2000, job.keepRandom != null ? +job.keepRandom : (job.keep_random != null ? +job.keep_random : 500)));
  const heapLimit = Math.max(1, Math.min(4096, +job.heapGuardMb || HEAP_GUARD_MB)) * 1024 * 1024;
  let stopReason = 'cap';
  const started = Date.now();
  const top = [];
  const topAt = new Map();
  const randoms = [];
  let randomSeen = 0;
  const sampleRng = mulberry32(((job.seed || 1) ^ 0xA5A5A5A5) >>> 0);
  const histogram = Array(10).fill(0);
  const curve = [];
  let evals = 0;
  let designerEvals = 0;
  let randomEvals = 0;
  let designerSum = 0;
  let randomSum = 0;
  let bestHeld = 0;
  let bestTrain = 0;
  let spentMs = 0;
  let lastProgress = 0;
  // Designs the library already holds for this task (short canonical hashes from the server) and designs this job
  // already scored: a repeat is varied a few times, and skipped if it still repeats, so no evaluation is spent twice.
  const known = new Set(Array.isArray(job.knownHashes) ? job.knownHashes.filter(h => /^[a-f0-9]{16}$/.test(h)) : []);
  const tried = new Set();
  let repeatsSkipped = 0;
  let repeatsVaried = 0;
  if (job.mode === 'propose') {
    const origin = blankFor(taskId);
    while (evals < evalCap) {
      Throttle.pace();
      const randomArm = evals % 10 === 9;
      let genome = origin;
      if (randomArm) {
        for (let step = 0; step < 3; step++) genome = vary(genome, rng);
      } else {
        genome = vary(propose(taskFeatures, rng, policy, origin), rng);
        let key = Library.designHash(genome).slice(0, 16);
        for (let again = 0; again < 4 && (known.has(key) || tried.has(key)); again++) {
          genome = vary(genome, rng);
          key = Library.designHash(genome).slice(0, 16);
          repeatsVaried++;
        }
        if (known.has(key) || tried.has(key)) {
          repeatsSkipped++;
          if (repeatsSkipped > evalCap || Date.now() - started >= budgetMs) { stopReason = 'repeats'; break; }
          continue;
        }
        if (tried.size < 300000) tried.add(key);
      }
      const score = scoreGenome(genome, taskId, job.seed || 1);
      const item = {
        genome: genome,
        arm: randomArm ? 'random' : 'designer',
        quality: score.quality,
        accuracy: score.accuracy,
        f1: score.f1,
        precision: score.precision,
        recall: score.recall,
        train: score.train,
        heldOut: score.heldOut,
        spikes: score.spikes,
        neurons: score.neurons,
        synapses: score.synapses,
        evalMs: score.evalMs,
      };
      evals++;
      spentMs += score.evalMs || 0;
      const held = score.heldOut;
      const train = score.train;
      if (held > bestHeld) bestHeld = held;
      if (train > bestTrain) bestTrain = train;
      const bin = held >= 1 ? 9 : Math.max(0, Math.min(9, Math.floor(held * 10)));
      histogram[bin]++;
      if (randomArm) {
        randomEvals++;
        randomSum += held;
        randomSeen++;
        if (randoms.length < keepRandom) randoms.push(item);
        else {
          const slot = Math.floor(sampleRng() * randomSeen);
          if (slot < keepRandom) randoms[slot] = item;
        }
      } else {
        designerEvals++;
        designerSum += held;
        const hash = Library.genomeHash(genome);
        if (topAt.has(hash)) {
          const at = topAt.get(hash);
          if (held > top[at].heldOut) top[at] = item;
        } else if (top.length < keepTop) {
          topAt.set(hash, top.length);
          top.push(item);
        } else {
          let worst = 0;
          for (let i = 1; i < top.length; i++) if (top[i].heldOut < top[worst].heldOut) worst = i;
          if (held > top[worst].heldOut) {
            topAt.delete(Library.genomeHash(top[worst].genome));
            top[worst] = item;
            topAt.set(hash, worst);
          }
        }
      }
      curve.push({ n: evals, held: held, train: train, bestHeld: bestHeld, bestTrain: bestTrain });
      if (curve.length > 400) {
        const kept = [];
        for (let i = 0; i < curve.length; i += 2) kept.push(curve[i]);
        curve.length = 0;
        kept.forEach(point => curve.push(point));
      }
      const now = Date.now();
      if (now - lastProgress > 500 || evals === evalCap) {
        lastProgress = now;
        const byTime = Math.round(100 * (now - started) / budgetMs);
        const byCount = Math.round(100 * evals / evalCap);
        fs.writeFileSync(path.join(outDir, 'progress.json'), JSON.stringify({
          synthetic: true,
          batchesDone: Math.max(byTime, byCount),
          batchesTotal: 100,
          status: 'running',
          seed: job.seed || 1,
          evals: evals,
        }));
      }
      if (now - started >= budgetMs) { stopReason = 'time'; break; }
      if (evals % 2000 === 0 && process.memoryUsage().heapUsed > heapLimit) { stopReason = 'memory'; break; }
    }
    fs.writeFileSync(path.join(outDir, 'progress.json'), JSON.stringify({
      synthetic: true,
      batchesDone: 100,
      batchesTotal: 100,
      status: 'done',
      seed: job.seed || 1,
      evals: evals,
    }));
  }
  const chosen = top.slice();
  const seen = new Set(top.map(item => Library.genomeHash(item.genome)));
  randoms.forEach(item => {
    const hash = Library.genomeHash(item.genome);
    if (seen.has(hash)) return;
    seen.add(hash);
    chosen.push(item);
  });
  const curveOut = thinCurve(curve, 100);
  const screened = screen(taskFeatures, Genome.blank(2, 1), rng, fit.model, 8);
  const checkpoint = {
    format: 'spikefoundry-designer',
    surrogate: fit.model,
    policy: policy,
    spearman: fit.spearman,
    heldOut: fit.heldOut,
    designerVersion: DESIGNER_VERSION,
    synthetic: true,
  };
  fs.writeFileSync(path.join(outDir, 'model.json'), JSON.stringify(checkpoint));
  const records = Library.fromEvaluations(chosen.map(item => ({
    taskId: taskId, taskVersion: spec.version, genome: item.genome,
    metrics: { quality: item.quality, accuracy: item.accuracy, f1: item.f1, precision: item.precision, recall: item.recall, train: item.train, heldOut: item.heldOut, arm: item.arm || 'designer' },
    neurons: item.neurons, synapses: item.synapses, spikes: item.spikes, evalMs: item.evalMs || 0, seed: job.seed || 1,
  })), { jobId: job.id || 'designer', engineVersion: DESIGNER_VERSION });
  const aggregate = {
    taskId: taskId,
    taskVersion: spec.version,
    evals: evals,
    designerEvals: designerEvals,
    randomEvals: randomEvals,
    evalMs: spentMs,
    bestHeld: bestHeld,
    bestTrain: bestTrain,
    designerMean: designerEvals ? designerSum / designerEvals : 0,
    randomMean: randomEvals ? randomSum / randomEvals : 0,
    histogram: histogram,
    curve: curveOut,
    keepTop: keepTop,
    keepRandom: keepRandom,
    stopReason: job.mode === 'propose' ? stopReason : 'none',
    repeatsSkipped: repeatsSkipped,
    repeatsVaried: repeatsVaried,
    wallMs: Date.now() - started,
    engineVersion: DESIGNER_VERSION,
    jobId: job.id || 'designer',
  };
  if (records.length || evals) fs.writeFileSync(path.join(outDir, 'designs.json'), JSON.stringify({ records: records, summary: aggregate }));
  const summary = {
    synthetic: true,
    batches: 1,
    tested: examples.length,
    phase: 1,
    tasks: [{ task: taskId, name: taskId, syntheticScore: screened[0] ? screened[0].predicted : 0, syntheticMatch: screened[0] ? screened[0].predicted : 0, neurons: 0, synapses: 0, batch: 1 }],
    spearman: fit.spearman,
    proposed: evals,
    screened: screened.map(item => item.predicted),
    note: 'Synthetic spike-pattern match on generated examples. Not BugBrain accuracy.',
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

module.exports = {
  EVAL_CAP, HEAP_GUARD_MB, DESIGN_FEATURES, ACTIONS, DESIGNER_VERSION, designFeatures, makeSurrogate, trainSurrogate, predict, fitSurrogate, spearman,
  makePolicy, propose, trainPolicy, screen, applyAction, exampleFromScore, scoreGenome, blankFor, run,
};
