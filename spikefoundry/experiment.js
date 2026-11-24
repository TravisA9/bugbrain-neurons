'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const SF = require('./engine');
const Genome = require('./genome_v2');
const Designer = require('./designer');
const Tasks = require('./tasks');
const Throttle = require('./throttle');
const { chain, parallel, relay, dualSequenceCases, scoreComposition, compositionCheck } = require('./composition');

const VERSION = 'sequence-experiment-2';
const ARMS = ['current', 'evolution', 'learned'];
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cpuMs = start => { const t = process.cpuUsage(start); return (t.user + t.system) / 1000; };

function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function sampleSets(seed, seen = new Set(), shard = null) {
  const rng = random(seed);
  function balanced(count, minLength, maxLength) {
    const cases = [];
    for (let i = 0; i < count; i++) {
      const yes = i % 2 === 1;
      for (let attempt = 0; ; attempt++) {
        if (attempt === 1000) throw new Error('Could not build disjoint sequence suites');
        const length = minLength + Math.floor(rng() * (maxLength - minLength + 1));
        const first = Math.floor(rng() * (length - 1));
        const second = first + 1 + Math.floor(rng() * (length - first - 1));
        const seq = Array.from({ length }, () => [0, 0]);
        const before = yes ? 0 : 1;
        const after = 1 - before;
        seq[first][before] = seq[second][after] = 1;
        for (let t = 0; t < first; t++) if (rng() < 0.2) seq[t][before] = 1;
        for (let t = second + 1; t < length; t++) if (rng() < 0.2) seq[t][after] = 1;
        const key = hash(seq);
        if (shard !== null && parseInt(key.slice(0, 8), 16) % 3 !== shard) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        cases.push({ seq, label: [Number(yes)] });
        break;
      }
    }
    return cases;
  }
  return {
    screen: balanced(8, 6, 12),
    search: balanced(24, 6, 12),
    fresh: balanced(64, 6, 12),
    shifted: balanced(64, 13, 24),
  };
}

function canonicalCircuit(net) {
  const edges = net.edges.map(e => [e.from, e.to, e.weight, e.delay]).sort((a, b) =>
    a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  return {
    neurons: net.neurons.map(n => ({ kind: n.kind, thr: n.thr, leak: n.leak })),
    edges: edges.map(([from, to, weight, delay]) => ({ from, to, weight, delay })),
    inputs: net.inputs,
    outputs: net.outputs,
  };
}

function validCircuit(net) {
  if (net.inputs.length !== 2 || net.outputs.length !== 1) return false;
  const reachable = new Set(net.inputs);
  for (let i = 0; i < net.neurons.length; i++) {
    const size = reachable.size;
    for (const e of net.edges) if (e.weight > 0 && reachable.has(e.from) && net.neurons[e.to].kind !== 'input') reachable.add(e.to);
    if (reachable.size === size) break;
  }
  return net.outputs.every(output => reachable.has(output));
}

function measure(net, cases) {
  let correct = 0, tp = 0, positives = 0, spikes = 0;
  for (const { seq, label } of cases) {
    const result = SF.simulateFrozen(net, seq);
    const yes = Boolean(label[0]);
    const fired = result.outputs[0];
    correct += Number(yes === fired);
    tp += Number(yes && fired);
    positives += Number(yes);
    spikes += result.spikeCount;
  }
  return { accuracy: correct / cases.length, recall: tp / positives, spikes: spikes / cases.length };
}

function mutate(parent, rng) {
  const g = Genome.sanitize(parent);
  const roll = rng();
  const input = g.modules.find(m => m.kind === 'input' && m.n === 2);
  const outgoing = input ? g.wires.filter(w => w.from === input.id) : [];
  if (roll < 0.12 && input && g.modules.length < 6 && g.wires.length + outgoing.length <= 8) {
    // Separate ports let the search distinguish A from B without changing the task interface.
    const index = g.modules.indexOf(input);
    input.n = 1;
    g.modules.splice(index + 1, 0, { ...input, id: 'portb' });
    g.wires.push(...outgoing.map(w => ({ ...w, from: 'portb' })));
  } else if (roll < 0.25 && g.modules.length < 6 && g.wires.length < 8) {
    const at = Math.floor(rng() * g.wires.length);
    const wire = g.wires[at];
    const id = ['x', 'y'].find(name => !g.modules.some(m => m.id === name));
    if (wire && id) {
      g.modules.push({ id, kind: 'lif', n: 1, thr: 0.7, leak: 0.8, sign: 1 });
      g.wires.splice(at, 1, { ...wire, to: id }, { ...wire, from: id, weight: 1, delay: 0 });
    }
  } else if (roll < 0.4 && g.wires.length < 8) {
    const from = g.modules.filter(m => m.kind !== 'output');
    const to = g.modules.filter(m => m.kind !== 'input');
    g.wires.push({ from: from[Math.floor(rng() * from.length)].id, to: to[Math.floor(rng() * to.length)].id, weight: 1, delay: 0, pattern: 'one' });
  } else {
    const wire = g.wires[Math.floor(rng() * g.wires.length)];
    wire.weight = rng() * 3 - 1;
    wire.delay = Math.floor(rng() * 5);
    const hidden = g.modules.filter(m => m.kind === 'lif');
    const module = hidden[Math.floor(rng() * hidden.length)];
    module.n = 1 + Math.floor(rng() * 8);
    module.thr = 0.4 + rng() * 2.2;
    module.leak = 0.2 + rng() * 0.7;
  }
  return Genome.sanitize(g);
}

function readCache(file) {
  const entries = new Map();
  if (!fs.existsSync(file)) return entries;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines.slice(0, -1)) {
    const [key, result] = JSON.parse(line);
    entries.set(key, result);
  }
  // Discard a partial final record left by a terminated process.
  if (lines.at(-1)) fs.truncateSync(file, Buffer.byteLength(lines.slice(0, -1).join('\n') + (lines.length > 1 ? '\n' : '')));
  return entries;
}

function compare(a, b) {
  return b.score.accuracy - a.score.accuracy || b.score.recall - a.score.recall ||
    a.net.edges.length - b.net.edges.length || a.score.spikes - b.score.spikes;
}

function confirmationFloor(confirmation) {
  return confirmation ? Math.min(...Object.values(confirmation).flatMap(s => [s.accuracy, s.recall])) : 0;
}

function search(arm, seed, evaluate, checkpoint, parents, budget, cap) {
  const start = process.cpuUsage();
  const rng = random(seed);
  const features = Tasks.featuresOf(Tasks.specById('sequence'));
  const policy = Designer.makePolicy(rng);
  Designer.trainPolicy(policy, features, 3, 0.4);
  const origin = Genome.blank(2, 1);
  const tried = new Set();
  const leaders = [];
  const finalists = [];
  const examples = [];
  const telemetry = { attempts: 0, invalid: 0, duplicate: 0, screen: 0, search: 0, cacheHits: 0, screenCpuMs: 0, searchCpuMs: 0 };
  let chargedCacheMs = 0;
  let lastImprovement = 0;
  let stop = 'attempt-cap';

  function evaluateStage(net, stage) {
    const result = evaluate(net, stage);
    telemetry[stage]++;
    if (result.hit) {
      telemetry.cacheHits++;
      chargedCacheMs += result.ms;
    } else {
      telemetry[stage + 'CpuMs'] += result.ms;
    }
    return result.score;
  }

  while (telemetry.attempts < cap && cpuMs(start) + chargedCacheMs < budget) {
    if (telemetry.screen - lastImprovement >= 600) {
      stop = 'plateau';
      break;
    }
    Throttle.pace();
    telemetry.attempts++;
    const pool = leaders.length ? leaders.map(row => row.genome) : parents;
    const parent = pool.length ? pool[Math.floor(rng() * pool.length)] : origin;
    let genome;
    if (arm === 'current') {
      genome = Designer.vary(Designer.propose(features, rng, policy, origin), rng);
    } else if ((arm === 'learned' || arm === 'incumbent') && checkpoint && telemetry.attempts % 5 !== 0) {
      let best = -Infinity;
      for (let i = 0; i < 4; i++) {
        const candidate = mutate(parent, rng);
        const prediction = Designer.predict(checkpoint.model, features, candidate);
        if (prediction > best) {
          best = prediction;
          genome = candidate;
        }
      }
    } else {
      genome = mutate(parent, rng);
    }
    const net = canonicalCircuit(Genome.compile(genome));
    if (!validCircuit(net)) { telemetry.invalid++; continue; }
    const key = hash(net);
    if (tried.has(key)) { telemetry.duplicate++; continue; }
    tried.add(key);
    const quick = evaluateStage(net, 'screen');
    // Sample failures too so the model can learn to avoid them.
    if (quick.recall === 0 && telemetry.attempts % 10 !== 0) continue;
    if (cpuMs(start) + chargedCacheMs >= budget) break;
    const score = evaluateStage(net, 'search');
    examples.push({ ...Designer.exampleFromScore('sequence', genome, score.recall > 0 ? score.accuracy : 0), id: key });
    const candidate = { genome, net, score };
    if (score.recall >= 0.9 && score.accuracy >= 0.9 && finalists.length < 2) finalists.push(candidate);
    if (!leaders.length || compare(candidate, leaders[0]) < 0) lastImprovement = telemetry.screen;
    leaders.push(candidate);
    leaders.sort(compare);
    if (leaders.length > 3) leaders.pop();
  }
  if (cpuMs(start) + chargedCacheMs >= budget) stop = 'cpu-budget';
  if (leaders.length && !finalists.includes(leaders[0])) finalists.push(leaders[0]);
  return { finalists, examples, telemetry: { ...telemetry, cpuMs: cpuMs(start), chargedCacheMs, stop, lastImprovement } };
}

function atomicJson(file, value) {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

function validCheckpoint(checkpoint) {
  const model = checkpoint?.model;
  const width = Tasks.FEATURE_LENGTH + Designer.DESIGN_FEATURES;
  const weight = value => Number.isFinite(value) && Math.abs(value) <= 1000;
  const vector = (value, size) => Array.isArray(value) && value.length === size && value.every(weight);
  const parents = checkpoint?.parents ?? [];
  return Array.isArray(parents) && parents.length <= 3 && parents.every(g => g?.v === 2 && Array.isArray(g.modules) && Array.isArray(g.wires)) &&
    model?.input === width && Array.isArray(model.W1) && model.W1.length === 12 &&
    model.W1.every(row => vector(row, width)) && vector(model.b1, 12) &&
    vector(model.W2, 12) && weight(model.b2) && checkpoint.id === hash(model);
}

function retainExamples(previous, current, suite) {
  const buckets = [[], [], [], []];
  const examples = new Map(previous.map(row => [row.id, row]));
  for (const row of current) {
    const id = hash([suite, row.id]);
    examples.set(id, { ...row, id });
  }
  for (const row of examples.values()) buckets[Math.min(3, Math.floor(row.y * 4))].push(row);
  const kept = buckets.flatMap(rows => rows.sort((a, b) => a.id.localeCompare(b.id)).slice(0, 128));
  return kept.sort((a, b) => a.id.localeCompare(b.id));
}

function learnedComposition(checkpoint, parents, left, right) {
  if (!checkpoint) return { status: 'awaiting-approved-checkpoint' };
  const start = process.cpuUsage();
  const features = Tasks.featuresOf(Tasks.specById('sequence'));
  const ranked = new Map();
  for (const genome of parents) {
    const net = canonicalCircuit(Genome.compile(genome));
    const key = hash(net);
    if (!ranked.has(key) && validCircuit(net)) {
      ranked.set(key, { key, net, prediction: Designer.predict(checkpoint.model, features, genome) });
    }
  }
  const choices = [...ranked.values()].sort((a, b) => b.prediction - a.prediction).slice(0, 3);
  if (!choices.length) return { status: 'no-compatible-modules', checkpoint: checkpoint.id };
  // Freeze the module choices before looking at the transfer cases.
  const picked = [choices[0], choices[1] || choices[0]];
  const components = picked.map((choice, i) => measure(choice.net, i === 0 ? left : right));
  const net = parallel(picked.map(choice => chain([choice.net, relay(), relay()])));
  const score = scoreComposition(net, dualSequenceCases(left, right));
  const passed = Math.min(score.accuracy, ...score.recall, ...components.flatMap(c => [c.accuracy, c.recall])) >= 0.9;
  return { status: passed ? 'passed' : 'failed', checkpoint: checkpoint.id, modules: picked.map(choice => choice.key),
    components, score, neurons: net.neurons.length, synapses: net.edges.length, cpuMs: cpuMs(start) };
}

function acquireLock(file) {
  try {
    return fs.openSync(file, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(fs.readFileSync(file, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('Experiment lock has no valid owner');
    try {
      process.kill(pid, 0);
    } catch (check) {
      if (check.code !== 'ESRCH') throw check;
      fs.unlinkSync(file);
      return fs.openSync(file, 'wx');
    }
    throw new Error('This experiment is already running');
  }
}

function runExperiment(options, dir, onProgress = () => {}) {
  const { seed = 1729, rounds = 3, cpuBudgetMs = 250, cap = 2000, initialCheckpoint = null } = options;
  if (initialCheckpoint && !validCheckpoint(initialCheckpoint)) throw new Error('Invalid starting checkpoint');
  for (const [value, min, max] of [[seed, 1, 1e9], [rounds, 3, 12], [cpuBudgetMs, 10, 10000], [cap, 10, 10000]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid experiment budget or seed');
  }
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, 'experiment.lock');
  const fd = acquireLock(lock);
  try {
    fs.writeSync(fd, String(process.pid));
    const statePath = path.join(dir, 'experiment.json');
    const initialParents = (initialCheckpoint?.parents || []).slice(0, 3).map(Genome.sanitize)
      .filter(genome => validCircuit(Genome.compile(genome)));
    const config = { version: VERSION, seed, rounds, cpuBudgetMs, cap, initialId: initialCheckpoint?.id || null, initialParentsId: hash(initialParents) };
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) :
      { config, rounds: [], training: [], parents: initialParents, challenger: null, approved: initialCheckpoint, promotionStreak: 0 };
    if (hash(config) !== hash(state.config)) throw new Error('Experiment configuration changed. Use a new output directory.');
    const cachePath = path.join(dir, 'evaluations.jsonl');
    const cache = readCache(cachePath);
    const usedCases = new Set();
    const shard = seed % 3;
    const roundCases = Array.from({ length: rounds }, (_, i) => sampleSets(seed + i * 100003, usedCases, shard));
    onProgress(state.rounds.length, rounds);
    for (let round = state.rounds.length; round < rounds; round++) {
      const roundSeed = seed + round * 100003;
      const cases = roundCases[round];
      const suiteKeys = Object.fromEntries(Object.entries(cases).map(([name, rows]) => [name, hash(rows)]));
      const evaluate = (net, stage) => {
        const key = hash([VERSION, 'sequence', suiteKeys[stage], net]);
        if (cache.has(key)) return { ...cache.get(key), hit: true };
        const start = process.cpuUsage();
        const score = measure(net, cases[stage]);
        const result = { score, ms: cpuMs(start) };
        fs.appendFileSync(cachePath, JSON.stringify([key, result]) + '\n');
        cache.set(key, result);
        return { ...result, hit: false };
      };
      const reports = {};
      const training = [];
      const checkpoint = state.challenger || state.approved;
      const arms = checkpoint ? ARMS.slice() : ARMS.slice(0, 2);
      if (state.approved && state.challenger && state.approved.id !== state.challenger.id) arms.push('incumbent');
      for (const arm of arms) {
        const model = arm === 'incumbent' ? state.approved : checkpoint;
        const trainingChargeMs = model?.trainingCpuMs ?? 0;
        const result = search(arm, roundSeed, evaluate, model, state.parents, Math.max(0, cpuBudgetMs - trainingChargeMs), cap);
        training.push(...result.examples);
        reports[arm] = { telemetry: result.telemetry, trainingChargeMs, checkpoint: model?.id, finalists: result.finalists };
      }
      for (const report of Object.values(reports)) {
        report.confirmationCpuMs = 0;
        for (const finalist of report.finalists) {
          const confirmation = Object.fromEntries(['fresh', 'shifted'].map(stage => {
            const result = evaluate(finalist.net, stage);
            report.confirmationCpuMs += result.ms;
            return [stage, result.score];
          }));
          if (!report.winner || confirmationFloor(confirmation) > confirmationFloor(report.confirmation)) {
            report.winner = finalist;
            report.confirmation = confirmation;
          }
          if (confirmationFloor(confirmation) >= 0.9) {
            report.verifiedCpuMs = report.telemetry.cpuMs + report.telemetry.chargedCacheMs + report.trainingChargeMs + report.confirmationCpuMs;
            break;
          }
        }
        delete report.finalists;
      }
      const floor = row => confirmationFloor(row?.confirmation);
      const time = row => row?.verifiedCpuMs ?? Infinity;
      const controls = [reports.current, reports.evolution, reports.incumbent].filter(Boolean);
      const baseline = Math.max(...controls.map(floor));
      const baselineTime = Math.min(...controls.map(time));
      const learned = floor(reports.learned);
      const faster = Number.isFinite(baselineTime) && time(reports.learned) <= 0.8 * baselineTime && learned >= baseline;
      const passed = learned >= 0.9 && (learned >= baseline + 0.02 || faster);
      state.promotionStreak = passed ? state.promotionStreak + 1 : 0;
      const promoted = state.promotionStreak >= 2 && checkpoint.id !== state.approved?.id;
      if (promoted) state.approved = { ...checkpoint, parents: [reports.learned.winner.genome] };
      state.training = retainExamples(state.training, training, suiteKeys.search);
      const trainStart = process.cpuUsage();
      // Freeze the same challenger for independent confirmation rounds.
      if (round + 1 < rounds && state.training.length >= 16 && (!state.challenger || !passed || promoted)) {
        const fitted = Designer.fitSurrogate(state.training, roundSeed, state.approved?.model || checkpoint?.model);
        state.challenger = { id: hash(fitted.model), model: fitted.model, examples: state.training.length, trainedThroughRound: round,
          trainingCpuMs: cpuMs(trainStart) };
        state.promotionStreak = 0;
        const archive = path.join(dir, 'checkpoints');
        fs.mkdirSync(archive, { recursive: true });
        atomicJson(path.join(archive, state.challenger.id + '.json'), state.challenger);
      }
      state.parents = Object.values(reports).filter(row => row.winner).map(row => row.winner.genome);
      if (state.approved?.parents) state.parents.push(...state.approved.parents);
      state.rounds.push({ round, suiteKeys, reports, baseline, learned, passed, testedCheckpoint: checkpoint?.id, trainingCpuMs: cpuMs(trainStart) });
      atomicJson(statePath, state);
      onProgress(state.rounds.length, rounds);
    }
    if (!state.composition) {
      state.composition = compositionCheck(roundCases.at(-1).shifted, 64);
      if (state.approved) {
        const left = sampleSets(seed + 2000003, usedCases, shard).shifted;
        const right = sampleSets(seed + 3000017, usedCases, shard).shifted;
        state.transfer = learnedComposition(state.approved, state.parents, left, right);
      } else {
        state.transfer = { status: 'awaiting-approved-checkpoint' };
      }
      atomicJson(statePath, state);
    }
    if (state.approved) atomicJson(path.join(dir, 'approved-model.json'), state.approved);
    return state;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

if (require.main === module) {
  try {
    const [, , config, out] = process.argv;
    if (!config || !out) throw new Error('Usage: node spikefoundry/experiment.js config.json output-directory');
    const state = runExperiment(JSON.parse(fs.readFileSync(config, 'utf8')), out);
    console.log(JSON.stringify({ rounds: state.rounds.length, approved: state.approved?.id || null }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

function experimentReport(state) {
  return {
    version: VERSION,
    config: state.config,
    composition: state.composition,
    transfer: state.transfer,
    promoted: Boolean(state.approved && state.approved.id !== state.config.initialId),
    approved: state.approved,
    rounds: state.rounds.map(({ round, suiteKeys, reports, baseline, learned, passed, testedCheckpoint, trainingCpuMs }) => ({
      round, suiteKeys, baseline, learned, passed, testedCheckpoint, trainingCpuMs,
      arms: Object.fromEntries(Object.entries(reports).map(([arm, report]) => [arm, {
        telemetry: report.telemetry,
        confirmation: report.confirmation,
        confirmationCpuMs: report.confirmationCpuMs,
        verifiedCpuMs: report.verifiedCpuMs,
        trainingChargeMs: report.trainingChargeMs,
        checkpoint: report.checkpoint,
        circuit: report.winner ? hash(report.winner.net) : null,
        neurons: report.winner?.net.neurons.length,
        synapses: report.winner?.net.edges.length,
      }])),
    })),
  };
}

module.exports = { runExperiment, experimentReport, sampleSets, canonicalCircuit, validCircuit, measure, mutate };
