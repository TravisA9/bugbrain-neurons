'use strict';

// Local experiment. No coordinator jobs or production checkpoints are written.
const { GENES, PROBES, temporalCircuit } = require('./inverse_circuits');
const { simulateFrozen } = require('./engine');
const { fit, forward, proposals, random, rankProposals, shuffle } = require('./inverse_designer');

const indices = PROBES.map((_, i) => i);
const steps = PROBES[0].length + 4;
const timingInput = time => time === null ? -1 : 1 - time / steps;
const timingLoss = (actual, expected) => actual === expected ? 0
  : actual === null || expected === null ? 1 : Math.min(1, Math.abs(actual - expected) / 4);
const exactLoss = (actual, expected) => Number(actual !== expected);
const headSizes = GENES.map(options => options.length);

function circuitFamily(genes) {
  const signs = genes.slice(0, 2).map((gene, i) => Math.sign(GENES[i][gene]));
  if (signs.every(sign => sign === 1)) return 'two excitatory inputs';
  if (signs.includes(-1)) return 'excitatory and inhibitory inputs';
  return 'one active input';
}

function buildCorpus() {
  const cache = new Map();
  const wirings = new Map();
  const behavior = new Map();
  let genotypes = [[]];
  for (const options of GENES) genotypes = genotypes.flatMap(genes => options.map((_, i) => genes.concat(i)));
  for (const genes of genotypes) {
    const circuit = temporalCircuit(genes);
    const key = JSON.stringify(circuit);
    if (!wirings.has(key)) {
      const labels = PROBES.map(seq => simulateFrozen(circuit, seq, true).firstSpike[0]);
      wirings.set(key, { genes, labels, family: circuitFamily(genes), edgeCount: circuit.edges.length });
    }
    const candidate = wirings.get(key);
    cache.set(genes.join(','), candidate.labels);
    const positive = candidate.labels.filter(time => time !== null).length;
    if (positive < 16 || positive > PROBES.length - 16) continue;
    const signature = candidate.labels.map(time => time ?? '-').join(',');
    if (!behavior.has(signature)) behavior.set(signature, []);
    const equivalent = behavior.get(signature);
    if (!equivalent.includes(candidate)) equivalent.push(candidate);
  }
  return { cache, behavior };
}

function balancedLoss(actual, expected, probes, loss) {
  let fired = 0, silent = 0, positives = 0, negatives = 0;
  for (const i of probes) {
    const error = loss(actual[i], expected[i]);
    if (expected[i] === null) {
      silent += error;
      negatives++;
    } else {
      fired += error;
      positives++;
    }
  }
  return positives && negatives ? (fired / positives + silent / negatives) / 2
    : (fired + silent) / probes.length;
}

function simulatorTargets(task, candidates, loss) {
  const targets = GENES.map(options => options.map(() => 0));
  const ranked = candidates.map(candidate => ({ candidate, cost: balancedLoss(candidate.labels, task.labels, indices, loss) }))
    .sort((a, b) => a.cost - b.cost);
  const cutoff = ranked[Math.min(15, ranked.length - 1)].cost;
  let total = 0;
  for (const { candidate, cost } of ranked) {
    if (cost > cutoff) break;
    const weight = Math.exp(-20 * cost);
    candidate.genes.forEach((gene, i) => { targets[i][gene] += weight; });
    total += weight;
  }
  return targets.map(head => head.map(weight => weight / total));
}

function evaluate(trials, select) {
  let exact = 0, close = 0, passed = 0;
  for (const [index, { labels, demos, fresh }] of trials.entries()) {
    const best = select(labels, demos, index);
    const error = balancedLoss(best, labels, fresh, exactLoss);
    exact += 1 - error;
    close += 1 - balancedLoss(best, labels, fresh, timingLoss);
    const positive = fresh.filter(i => labels[i] !== null);
    const negative = fresh.filter(i => labels[i] === null);
    passed += Number(positive.length > 0 && negative.length > 0 &&
      [positive, negative].every(group => group.filter(i => best[i] === labels[i]).length >= 0.9 * group.length));
  }
  return { passed, trials: trials.length, exact: exact / trials.length, close: close / trials.length };
}

function bestOnDemos(candidates, labels, demos) {
  let best, bestLoss = Infinity;
  for (const times of candidates) {
    const loss = balancedLoss(times, labels, demos, timingLoss);
    if (loss < bestLoss) {
      best = times;
      bestLoss = loss;
    }
  }
  return best;
}

function modelInput(labels, demos) {
  const input = PROBES.map(() => 0);
  for (const i of demos) input[i] = timingInput(labels[i]);
  return input;
}

function revise(starts, priority, cache, labels, demos, budget, sizes = headSizes, excluded = null) {
  const startQueue = starts.values();
  const tried = new Set();
  const frontier = new Map();
  const seeds = Math.max(2, Math.floor(budget / 8));
  let best, bestLoss = Infinity;
  while (tried.size < budget) {
    let genes;
    if (priority && tried.size >= seeds && tried.size % 4 !== 0) {
      let next;
      for (const entry of frontier.values()) {
        if (!next || entry.loss < next.loss || (entry.loss === next.loss && entry.prior > next.prior)) next = entry;
      }
      if (next) {
        frontier.delete(next.key);
        genes = next.genes;
      }
    }
    if (!genes) genes = startQueue.next().value;
    if (!genes) throw Error('Search did not supply enough distinct circuit wirings');
    const times = cache.get(genes.join(','));
    if (tried.has(times) || excluded?.has(times)) continue;
    tried.add(times);
    const loss = balancedLoss(times, labels, demos, timingLoss);
    if (loss < bestLoss) {
      best = { genes, times };
      bestLoss = loss;
    }
    if (!priority || tried.size === budget) continue;
    frontier.delete(times);
    for (let i = 0; i < sizes.length; i++) {
      for (let j = 0; j < sizes[i]; j++) {
        if (j === genes[i]) continue;
        const edited = genes.slice();
        edited[i] = j;
        const key = cache.get(edited.join(','));
        if (!key || tried.has(key) || excluded?.has(key)) continue;
        const prior = priority(edited);
        const previous = frontier.get(key);
        if (!previous || loss < previous.loss || (loss === previous.loss && prior > previous.prior)) {
          frontier.set(key, { key, genes: edited, loss, prior });
        }
      }
    }
  }
  return { ...best, loss: bestLoss, tried };
}

function randomPrior(seed) {
  const rng = random(seed ^ 0x517cc1b7);
  const priorities = new Map();
  return genes => {
    const key = genes.join(',');
    if (!priorities.has(key)) priorities.set(key, rng());
    return priorities.get(key);
  };
}

function wiringPool(cache) {
  const byWiring = new Map();
  for (const [key, trace] of cache) {
    if (!byWiring.has(trace)) byWiring.set(trace, key.split(',').map(Number));
  }
  return [...byWiring.values()];
}

function compareStarts(model, cache, randomPool, trials, seed, budget) {
  const results = {};
  const arms = {
    beam: [false, 'none'],
    guided: [false, 'dnn'],
    randomOnly: [true, 'none'],
    randomStart: [true, 'dnn'],
    randomGuided: [true, 'random'],
  };
  for (const [arm, [randomStart, edits]] of Object.entries(arms)) {
    results[arm + budget] = evaluate(trials, (labels, demos, index) => {
      const trialSeed = seed ^ Math.imul(index + 1, 2654435761);
      const heads = !randomStart || edits === 'dnn' ? forward(model, modelInput(labels, demos)).heads : null;
      const starts = randomStart ? shuffle(randomPool, random(trialSeed)) : rankProposals(heads, budget * 4);
      let priority = null;
      if (edits === 'dnn') {
        const logHeads = heads.map(head => head.map(Math.log));
        priority = genes => genes.reduce((score, gene, head) => score + logHeads[head][gene], 0);
      } else if (edits === 'random') {
        priority = randomPrior(trialSeed);
      }
      return revise(starts, priority, cache, labels, demos, budget).times;
    });
  }
  return results;
}

function excitatorySubfamily(genes) {
  if (circuitFamily(genes) !== 'two excitatory inputs') return null;
  return Math.sign(genes[2] - genes[3]);
}

function makeTrials(tasks, seed = 972341) {
  const rng = random(seed);
  return tasks.flatMap(({ labels }) => Array.from({ length: 3 }, () => {
    const order = shuffle(indices, rng);
    return { labels, demos: order.slice(0, 64), fresh: order.slice(64) };
  }));
}

function recoverTrainingExamples(tasks, cache) {
  const rng = random(130718);
  const pool = wiringPool(cache);
  const recovered = [], references = [];
  let evaluations = 0;
  for (const task of tasks) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const seed = Math.floor(rng() * 2 ** 32);
      const demos = shuffle(indices, rng).slice(0, 64);
      const result = revise(shuffle(pool, random(seed)), randomPrior(seed), cache, task.labels, demos, 32);
      evaluations += 32;
      if (!result.times.every((time, i) => time === task.labels[i])) continue;
      recovered.push({ genes: result.genes, labels: result.times });
      references.push(task);
      break;
    }
  }
  return { recovered, references, evaluations };
}

function compareAugmentation(cache, behavior, seeds) {
  const randomPool = wiringPool(cache);
  for (const heldOut of [-1, 0, 1]) {
    const base = [], targets = [], audit = [];
    for (const equivalent of behavior.values()) {
      const ordinary = equivalent.find(task => excitatorySubfamily(task.genes) === null);
      const novel = equivalent.find(task => excitatorySubfamily(task.genes) !== heldOut);
      if (ordinary) base.push(ordinary);
      else if (novel) targets.push(novel);
      else audit.push(equivalent[0]);
    }
    const trainingCache = new Map([...cache].filter(([key]) => excitatorySubfamily(key.split(',').map(Number)) !== heldOut));
    const { recovered, references, evaluations } = recoverTrainingExamples(targets, trainingCache);
    if (!recovered.length || !audit.length) throw Error('Empty augmentation or audit split: ' + heldOut);
    const trials = makeTrials(audit);
    const arms = {
      replay: base.concat(shuffle(base, random(3617)).slice(0, recovered.length)),
      recovered: base.concat(recovered),
      reference: base.concat(references),
    };
    if (arms.replay.length !== arms.recovered.length) throw Error('Unmatched training budgets');
    console.log(JSON.stringify({ heldOut, base: base.length, attempted: targets.length, recovered: recovered.length,
      differentWiring: recovered.filter((row, i) => row.genes.join(',') !== references[i].genes.join(',')).length,
      generationEvaluations: evaluations, auditBehaviors: audit.length, updatesPerArm: arms.replay.length * 120 }));
    for (let seed = 1811; seed < 1811 + seeds; seed++) {
      const randomBaseline = evaluate(trials, (labels, demos, index) => {
        const trialSeed = seed ^ Math.imul(index + 1, 2654435761);
        return revise(shuffle(randomPool, random(trialSeed)), randomPrior(trialSeed), cache, labels, demos, 32).times;
      });
      const metrics = {};
      for (const [arm, tasks] of Object.entries(arms)) {
        const model = fit(tasks, random(seed), 120, 64, null, timingInput);
        metrics[arm] = evaluate(trials, (labels, demos) => {
          const { heads } = forward(model, modelInput(labels, demos));
          const logHeads = heads.map(head => head.map(Math.log));
          const priority = genes => genes.reduce((sum, gene, i) => sum + logHeads[i][gene], 0);
          return revise(rankProposals(heads, 128), priority, cache, labels, demos, 32).times;
        });
      }
      console.log(JSON.stringify({ heldOut, seed, randomBaseline, ...metrics }));
    }
  }
}

function main() {
  const seeds = Number(process.argv[2] ?? 8);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 32) throw Error('Supply between 1 and 32 seeds');
  const compareSearch = process.argv[3] === 'search';
  const start = process.cpuUsage();
  const { cache, behavior } = buildCorpus();
  if (process.argv[3] === 'augment') {
    compareAugmentation(cache, behavior, seeds);
    const cpu = process.cpuUsage(start);
    console.log(JSON.stringify({ cpuSeconds: (cpu.user + cpu.system) / 1e6 }));
    return;
  }
  const exhaustiveCandidates = [...new Set(cache.values())];
  const randomPool = wiringPool(cache);
  const families = ['two excitatory inputs', 'excitatory and inhibitory inputs', 'one active input'];
  for (const family of families) {
    const training = [], audit = [], candidates = [];
    for (const equivalent of behavior.values()) {
      const available = equivalent.filter(candidate => candidate.family !== family);
      if (available.length) {
        candidates.push(...available);
        training.push(available.reduce((a, b) => a.edgeCount <= b.edgeCount ? a : b));
      } else {
        audit.push(equivalent[0]);
      }
    }
    const trials = makeTrials(audit);
    if (!training.length || !trials.length) throw Error('Empty family split: ' + family);
    const targetStart = process.cpuUsage();
    const arms = { reference: training };
    if (!compareSearch) {
      arms.exact = training.map(task => ({ ...task, targets: simulatorTargets(task, candidates, exactLoss) }));
      arms.timing = training.map(task => ({ ...task, targets: simulatorTargets(task, candidates, timingLoss) }));
    }
    const targetCpu = process.cpuUsage(targetStart);
    console.log(JSON.stringify({ family, trainBehaviors: training.length, auditBehaviors: audit.length,
      updatesPerArm: training.length * 120, targetCpuMs: (targetCpu.user + targetCpu.system) / 1000,
      exhaustive: evaluate(trials, (labels, demos) => bestOnDemos(exhaustiveCandidates, labels, demos)) }));
    for (let seed = 1729; seed < 1729 + seeds; seed++) {
      const metrics = {};
      for (const [arm, tasks] of Object.entries(arms)) {
        const model = fit(tasks, random(seed), 120, 64, null, timingInput);
        if (compareSearch) {
          for (const budget of [8, 32]) Object.assign(metrics, compareStarts(model, cache, randomPool, trials, seed, budget));
        } else {
          metrics[arm] = evaluate(trials, (labels, demos) => bestOnDemos(
            proposals(model, modelInput(labels, demos), 8).map(genes => cache.get(genes.join(','))), labels, demos));
        }
      }
      console.log(JSON.stringify({ family, seed, ...metrics }));
    }
  }
  const cpu = process.cpuUsage(start);
  console.log(JSON.stringify({ cpuSeconds: (cpu.user + cpu.system) / 1e6 }));
}

if (require.main === module) main();
module.exports = { timingLoss, timingInput, modelInput, evaluate, makeTrials, revise, randomPrior, wiringPool };
