'use strict';

const { PROBES } = require('./inverse_circuits');
const { simulateFrozen } = require('./engine');
const Throttle = require('./throttle');
const { fit, forward, random, rankProposals, shuffle } = require('./inverse_designer');
const { timingInput, modelInput, evaluate, makeTrials, revise, randomPrior, wiringPool } = require('./inverse_timing_experiment');

// Each detector lists input weights, input delays, threshold, and leak.
const detectors = [
  [1, 0, 0, 0, 0.75, 0],
  [0, 1, 0, 0, 0.75, 0],
  [1, 0, 2, 0, 0.75, 0],
  [0, 1, 0, 2, 0.75, 0],
  [1, 1, 0, 0, 1.5, 0],
  [1, 1, 1, 0, 1.5, 0.4],
  [1, 1, 0, 1, 1.5, 0.4],
  [1, -1, 0, 0, 0.75, 0],
  [-1, 1, 0, 0, 0.75, 0],
];
const originalDetectorCount = detectors.length;
const diverseMode = require.main !== module || process.argv[3] === 'diverse';
if (diverseMode) detectors.push(
  [1, 1, 1, 1, 1.5, 0],
  [1, 1, 2, 2, 1.5, 0],
  [1, -1, 0, 1, 0.75, 0.35],
  [-1, 1, 1, 0, 0.75, 0.35],
  [1, 1, 2, 0, 1.25, 0.55],
);
const families = ['parallel any', 'parallel coincidence', 'serial cascade'];
const absent = detectors.length;
const threeHidden = [absent, absent, absent, families.length];
const twoHidden = [absent, absent, 1, families.length];
const headSizes = [absent, absent, absent + 1, families.length];
const epochs = 80;
const budget = 32;
const signatureOf = labels => labels.map(time => time ?? '-').join(',');
const originalTask = task => task.genes.slice(0, 3).every(gene => gene === absent || gene < originalDetectorCount);

function circuitFor(genes) {
  const mode = genes[3];
  const selected = genes.slice(0, 3).filter(gene => gene !== absent);
  if (mode !== 2) selected.sort((a, b) => a - b);
  const neurons = Array.from({ length: 2 }, () => ({ kind: 'input', thr: 1, leak: 0 }));
  const edges = [];
  selected.forEach((detector, i) => {
    const [a, b, delayA, delayB, thr, leak] = detectors[detector];
    const id = neurons.length;
    const chained = mode === 2 && i > 0;
    neurons.push({ kind: 'lif', thr: thr + (chained ? 0.75 : 0), leak });
    if (a) edges.push({ from: 0, to: id, weight: a, delay: delayA });
    if (b) edges.push({ from: 1, to: id, weight: b, delay: delayB });
    if (chained) edges.push({ from: id - 1, to: id, weight: 1, delay: 0 });
  });
  const out = neurons.length;
  neurons.push({ kind: 'output', thr: mode === 1 ? selected.length - 0.5 : 0.5, leak: 0 });
  for (let from = mode === 2 ? out - 1 : 2; from < out; from++) edges.push({ from, to: out, weight: 1, delay: 0 });
  return { neurons, edges, inputs: [0, 1], outputs: [out] };
}

function buildCompositionCorpus() {
  let genotypes = [[]];
  for (const size of headSizes) genotypes = genotypes.flatMap(genes =>
    Array.from({ length: size }, (_, gene) => genes.concat(gene)));
  const byWiring = new Map();
  const behavior = new Map();
  const searchCache = new Map();
  const validationCache = new Map();
  for (const genes of genotypes) {
    Throttle.pace();
    const circuit = circuitFor(genes);
    const key = JSON.stringify(circuit);
    if (!byWiring.has(key)) {
      const labels = PROBES.map(seq => simulateFrozen(circuit, seq, true).firstSpike[0]);
      const positive = labels.filter(time => time !== null).length;
      const task = { genes, labels, hidden: circuit.neurons.length - 3, family: genes[3] };
      byWiring.set(key, task);
      if (positive >= 16 && positive <= PROBES.length - 16) {
        const signature = signatureOf(labels);
        if (!behavior.has(signature)) behavior.set(signature, []);
        behavior.get(signature).push(task);
      }
    }
    const task = byWiring.get(key);
    if (task.hidden === 3) searchCache.set(genes.join(','), task.labels);
    else validationCache.set([genes[0], genes[1], 0, genes[3]].join(','), task.labels);
  }
  return { behavior, searchCache, validationCache };
}

function modelSearch(model, labels, demos, cache, count, sizes) {
  const { heads } = forward(model, modelInput(labels, demos));
  heads[2] = sizes === twoHidden ? [1] : heads[2].slice(0, absent);
  const logHeads = heads.map(head => head.map(Math.log));
  const priority = genes => genes.reduce((score, gene, i) => score + logHeads[i][gene], 0);
  const starts = rankProposals(heads, budget * 8);
  return revise(starts, priority, cache, labels, demos, count, sizes);
}

function evaluateModel(model, trials, cache, randomPool = null, seed = 0, sizes = threeHidden) {
  return evaluate(trials, (labels, demos, index) => {
    const dnn = modelSearch(model, labels, demos, cache, randomPool ? budget / 2 : budget, sizes);
    if (!randomPool) return dnn.times;
    const trialSeed = seed ^ Math.imul(index + 1, 2654435761);
    const other = revise(shuffle(randomPool, random(trialSeed)), randomPrior(trialSeed),
      cache, labels, demos, budget / 2, threeHidden, dnn.tried);
    return other.loss < dnn.loss ? other.times : dnn.times;
  });
}

function compositionPilot(seed) {
  const { behavior, searchCache } = buildCompositionCorpus();
  const family = seed % families.length;
  const small = [], larger = [], reserved = [];
  for (const equivalent of behavior.values()) {
    const two = equivalent.find(task => task.hidden === 2);
    const three = equivalent.find(task => task.hidden === 3 && task.family !== family);
    if (two) small.push(two);
    else if (three) larger.push(three);
    else reserved.push(equivalent[0]);
  }
  const training = balancedRows(familyGroups(small, 5601), 96)
    .concat(balancedRows(familyGroups(larger, 5783), 96));
  const model = fit(training, random(seed), epochs, 64, null, timingInput, headSizes);
  const trials = makeTrials(shuffle(reserved, random(761773)).slice(0, 12), 473810);
  const discoveries = [];
  const seen = new Set();
  const learned = evaluate(trials, (labels, demos, i) => {
    const result = modelSearch(model, labels, demos, searchCache, budget, threeHidden);
    const { fresh } = trials[i];
    const positive = fresh.filter(j => labels[j] !== null);
    const negative = fresh.filter(j => labels[j] === null);
    const key = signatureOf(result.times);
    if (!seen.has(key) && positive.length && negative.length && positive.some(j => result.times[j] !== null)) {
      seen.add(key);
      const matches = j => (labels[j] !== null) === (result.times[j] !== null);
      discoveries.push({
        graph: { version: 'snn-graph-1', ...circuitFor(result.genes) },
        accuracy: fresh.filter(matches).length / fresh.length,
        recall: positive.filter(matches).length / positive.length,
        specificity: negative.filter(matches).length / negative.length,
        demoAccuracy: demos.filter(matches).length / demos.length,
        replay: [...positive.slice(0, 2), ...negative.slice(0, 2)].map(j => [j, Number(labels[j] !== null)]),
        freshCount: fresh.length,
      });
    }
    return result.times;
  });
  const baseline = randomSearch(trials, searchCache, wiringPool(searchCache), seed);
  return { version: 'inverse-composition-1', seed, family: families[family],
    budget, trainingRows: training.length, learned, baseline, discoveries: discoveries.slice(0, 12) };
}

function randomSearch(trials, cache, pool, seed) {
  return evaluate(trials, (labels, demos, index) => {
    const trialSeed = seed ^ Math.imul(index + 1, 2654435761);
    return revise(shuffle(pool, random(trialSeed)), randomPrior(trialSeed),
      cache, labels, demos, budget, threeHidden).times;
  });
}

function familyGroups(tasks, seed) {
  const rng = random(seed);
  return families.map((_, i) => shuffle(tasks.filter(task => task.family === i), rng));
}

function balancedRows(groups, count) {
  const active = groups.filter(group => group.length);
  return Array.from({ length: count }, (_, i) => {
    const group = active[i % active.length];
    return group[Math.floor(i / active.length) % group.length];
  });
}

function replaceRepeats(tasks, novel, seed) {
  const pools = [2, 3].map(hidden => familyGroups(novel.filter(task => task.hidden === hidden), seed));
  const seen = new Set();
  return tasks.map(task => {
    if (!seen.has(task)) {
      seen.add(task);
      return task;
    }
    return pools[task.hidden - 2][task.family].pop() ?? task;
  });
}

function validationRank(scores) {
  const passes = scores.map(score => score.passed / score.trials);
  return [Math.min(...passes), passes.reduce((sum, rate) => sum + rate, 0),
    scores.reduce((sum, score) => sum + score.exact, 0)];
}

function wins(candidate, incumbent) {
  if (!incumbent) return true;
  const difference = candidate.findIndex((value, i) => value !== incumbent[i]);
  return difference >= 0 && candidate[difference] > incumbent[difference];
}

function compareBalanced(name, base, available, audit, searchCache, validationCache, pool, seeds, novel = null) {
  const groups = familyGroups(base, 5601);
  const validationGroups = groups.map(group => group.splice(0, Math.min(8, Math.floor(group.length / 3))));
  if (validationGroups.some(group => !group.length)) throw Error('Empty validation family: ' + name);
  const validation = validationGroups.map(group => makeTrials(group, 358101));
  const small = shuffle(groups.flat(), random(1357)).slice(0, 96);
  const additions = shuffle(available, random(5783)).slice(0, 96);
  const replay = Array.from({ length: additions.length }, (_, i) => small[i % small.length]);
  const arms = {
    replay: small.concat(replay),
    unbalanced: small.concat(additions),
    balanced: balancedRows(groups, small.length).concat(
      balancedRows(familyGroups(available, 5783), additions.length)),
  };
  if (novel) {
    arms.diverse = replaceRepeats(arms.balanced, novel, 7079);
    delete arms.unbalanced;
  }
  const order = shuffle(audit, random(8172));
  const trials = makeTrials(novel ? order.slice(0, 32)
    : order.length >= 96 ? order.slice(64, 96) : order.slice(0, 32), novel ? 719027 : 981457);
  const checkpoints = {};
  const randomResults = [];
  console.log(JSON.stringify({ family: name, validationBehaviors: validationGroups.map(group => group.length),
    auditBehaviors: trials.length / 3, updatesPerArm: epochs * arms.replay.length,
    generated: novel?.length,
    mix: Object.fromEntries(Object.entries(arms).map(([arm, tasks]) => [arm, {
      rows: families.map((_, i) => tasks.filter(task => task.family === i).length),
      distinct: new Set(tasks).size,
      newBehaviors: novel ? tasks.filter(task => !originalTask(task)).length : undefined,
    }])) }));
  const firstSeed = novel ? 3311 : 3011;
  for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
    randomResults.push(randomSearch(trials, searchCache, pool, seed));
    const scores = {};
    for (const [arm, tasks] of Object.entries(arms)) {
      const model = fit(tasks, random(seed), epochs, 64, null, timingInput, headSizes);
      const perFamily = validation.map(group => evaluateModel(model, group, validationCache, null, 0, twoHidden));
      const rank = validationRank(perFamily);
      if (wins(rank, checkpoints[arm]?.rank)) checkpoints[arm] = { model, seed, rank, perFamily };
      scores[arm] = perFamily.map(({ passed, trials }) => [passed, trials]);
    }
    console.log(JSON.stringify({ family: name, seed, validation: scores }));
  }
  const selected = {};
  for (const [arm, { model, seed, perFamily }] of Object.entries(checkpoints)) {
    selected[arm] = { seed, validation: perFamily.map(({ passed, trials }) => [passed, trials]),
      audit: evaluateModel(model, trials, searchCache) };
  }
  console.log(JSON.stringify({ family: name, selected, randomResults }));
}

function main() {
  const seeds = Number(process.argv[2] ?? 4);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 16) throw Error('Supply between 1 and 16 seeds');
  const hybrid = process.argv[3] === 'hybrid';
  const balanced = process.argv[3] === 'balanced';
  const started = process.cpuUsage();
  const { behavior, searchCache, validationCache } = buildCompositionCorpus();
  const randomPool = wiringPool(searchCache);
  for (const [family, name] of families.entries()) {
    const base = [], available = [], audit = [], novel = [];
    for (const equivalent of behavior.values()) {
      const small = equivalent.find(task => task.hidden === 2);
      const nearby = equivalent.find(task => task.hidden === 3 && task.family !== family);
      if (diverseMode) {
        const original = equivalent.filter(originalTask);
        const originalSmall = original.find(task => task.hidden === 2);
        const originalNearby = original.find(task => task.hidden === 3 && task.family !== family);
        if (originalSmall) base.push(originalSmall);
        else if (originalNearby) available.push(originalNearby);
        else if (!original.length && (small || nearby)) novel.push(small ?? nearby);
        if (!small && !nearby) audit.push(equivalent[0]);
      } else if (small) base.push(small);
      else if (nearby) available.push(nearby);
      else audit.push(equivalent[0]);
    }
    const additions = shuffle(available, random(5783)).slice(0, 96);
    const baseline = shuffle(base, random(1357)).slice(0, 96);
    if (!baseline.length || !additions.length || !audit.length) throw Error('Empty composition split: ' + name);
    if (balanced || diverseMode) {
      compareBalanced(name, base, available, audit, searchCache, validationCache, randomPool, seeds,
        diverseMode ? novel : null);
      continue;
    }
    const auditOrder = shuffle(audit, random(8172));
    const reserved = hybrid && auditOrder.length >= 64 ? auditOrder.slice(32, 64) : auditOrder.slice(0, 32);
    const trials = makeTrials(reserved, hybrid ? 817903 : 972341);
    const replay = Array.from({ length: additions.length }, (_, i) => baseline[i % baseline.length]);
    const arms = { replay: baseline.concat(replay), expanded: baseline.concat(additions) };
    console.log(JSON.stringify({ family: name, baseBehaviors: baseline.length, newBehaviors: additions.length,
      availableAuditBehaviors: audit.length, testedBehaviors: trials.length / 3, updatesPerArm: epochs * arms.replay.length }));
    const firstSeed = hybrid ? 2711 : 2311;
    for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
      const metrics = { randomSearch: randomSearch(trials, searchCache, randomPool, seed) };
      for (const [arm, tasks] of Object.entries(arms)) {
        const model = fit(tasks, random(seed), epochs, 64, null, timingInput, headSizes);
        metrics[arm] = evaluateModel(model, trials, searchCache);
        if (hybrid) metrics[arm + 'Hybrid'] = evaluateModel(model, trials, searchCache, randomPool, seed);
      }
      console.log(JSON.stringify({ family: name, seed, ...metrics }));
    }
  }
  const cpu = process.cpuUsage(started);
  console.log(JSON.stringify({ cpuSeconds: (cpu.user + cpu.system) / 1e6 }));
}

if (require.main === module) main();
module.exports = { compositionPilot };
