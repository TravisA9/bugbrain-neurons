'use strict';

const { simulateFrozen } = require('./engine');
const { fit, forward, rankProposals, random, shuffle } = require('./inverse_designer');

const sizes = [8, 8, 8, 8];
const paired = process.argv.includes('--paired-edits');
const traceFeedback = process.argv.includes('--trace-feedback');
const feedback = traceFeedback || process.argv.includes('--repair-feedback');
const repair = feedback || process.argv.includes('--assembler-repair');
const fault = process.argv.includes('--boundary-fault');
const feasible = process.argv.includes('--feasible-planner');
const planner = feasible || process.argv.includes('--boundary-planner');
const shared = planner || fault || paired || repair || process.argv.includes('--shared-state');
const budget = 32;
const ids = Array.from({ length: 256 }, (_, i) => i);
const inputRng = random(571803);
const probes = ids.map(() => Array.from({ length: 12 }, () =>
  sizes.map(() => Number(inputRng() < 0.38))));
const encode = times => times.reduce((sum, t, i) => sum + (t === null ? 0 : (t + 1) * 17 ** i), 0) / (17 ** 4 - 1) - 1;

function circuit(genes) {
  const neurons = [], edges = [];
  const add = (kind, thr = 1) => neurons.push({ kind, thr, leak: 0 }) - 1;
  const connect = (from, to, delay = 0) => edges.push({ from, to, weight: 1, delay });
  const inputs = sizes.map(() => add('input'));
  const modules = genes.map(gene => [add('lif'), add('lif', 2), add('lif', gene < 4 ? 1 : 2), add('lif')]);
  const outputs = genes.map(() => add('output'));
  for (const [i, gene] of genes.entries()) {
    const [trace, detector, join, relay] = modules[i];
    const other = (i + 1) % modules.length;
    connect(inputs[gene & 2 ? other : i], trace);
    connect(trace, detector, gene & 1);
    connect(inputs[i], detector);
    connect(detector, join);
    if (gene >= 4) connect(modules[other][1], join);
    connect(join, relay);
    if (shared) {
      // Each output reads two independently configurable detector states.
      // The upstream join is shared by two outputs.
      connect(modules[(i + 3) % modules.length][2], relay);
      neurons[relay].thr = 2;
    }
    connect(relay, outputs[i]);
  }
  return { neurons, edges, inputs, outputs };
}

function score(actual, expected, indices) {
  let hits = 0;
  for (const i of indices) for (let k = 0; k < sizes.length; k++) {
    hits += Number(actual[i][k] === expected[i][k]);
  }
  return hits;
}

function audit(actual, expected, fresh) {
  return sizes.every((_, k) => [true, false].every(fires => {
    const cases = fresh.filter(i => (expected[i][k] !== null) === fires);
    return cases.length > 0 && cases.filter(i => actual[i][k] === expected[i][k]).length >= 0.9 * cases.length;
  }));
}

function partialAssembly(task, demos, run) {
  const starts = [[0, 0, 0, 0]];
  const stitched = starts[0].slice();
  for (const [channel, size] of sizes.entries()) {
    let top = -1;
    for (let gene = 0; gene < size / 2; gene++) {
      const child = starts[0].slice();
      child[channel] = gene;
      if (gene) starts.push(child);
      const hits = demos.filter(i => run(child)[i][channel] === task.labels[i][channel]).length;
      if (hits > top) { stitched[channel] = gene; top = hits; }
    }
  }
  return { starts, stitched };
}

function repairInput(task, demos, current, run, traces = null) {
  const actual = run(current);
  const input = ids.map(() => 0);
  current.forEach((gene, i) => { input[i] = (gene + 1) / 8; });
  demos.forEach((probe, i) => {
    input[4 + i] = encode(task.labels[probe]);
    input[68 + i] = encode(actual[probe]);
    const bits = probes[probe].flat();
    input[132 + i] = bits.reduce((sum, bit, j) => sum + bit * 2 ** j, 0) / (2 ** bits.length - 1);
  });
  if (traces) {
    const observed = traces(current);
    for (let i = 0; i < 60; i++) input[196 + i] = encode(observed[demos[i]]);
  }
  return input;
}

function feedbackRows(tasks, run, edits, traces) {
  const rng = random(62179);
  return tasks.flatMap(task => Array.from({ length: 4 }, () => {
    const order = shuffle(ids, rng);
    const demos = order.slice(0, 64), fresh = order.slice(64);
    const { stitched } = partialAssembly(task, demos, run);
    const gains = edits.map(([i, gene]) => {
      if (stitched[i] === gene) return -Infinity;
      const child = stitched.slice();
      child[i] = gene;
      return score(run(child), task.labels, fresh);
    });
    const max = Math.max(...gains);
    const weights = gains.map(gain => Math.exp((gain - max) / 16));
    const sum = weights.reduce((a, b) => a + b);
    return {
      input: repairInput(task, demos, stitched, run),
      tracedInput: traces ? repairInput(task, demos, stitched, run, traces) : null,
      targets: [weights.map(weight => weight / sum)],
    };
  }));
}

function compare(model, trials, seed, run, repairModel = null, tracedModel = null, traces = null) {
  const totals = { assembly: 0, randomSearch: 0, learned: 0 };
  const rng = random(seed);
  for (const { task, demos, fresh } of trials) {
    const search = (starts, editOrder, assemble = false, pairHeads = null, repairOrder = null) => {
      const seen = new Set();
      let best, hits = -1;
      const test = genes => {
        const key = genes.join(',');
        if (seen.has(key) || seen.size >= budget) return;
        seen.add(key);
        const value = score(run(genes), task.labels, demos);
        if (value > hits) { best = genes; hits = value; }
      };
      for (const genes of starts) test(genes);
      if (assemble) {
        const parent = starts[0];
        const stitched = parent.slice();
        for (const [channel, size] of sizes.entries()) {
          let top = -1;
          const choices = repairOrder ? repairOrder.filter(([i]) => i === channel).slice(0, 4).map(([, gene]) => gene)
            : Array.from({ length: size }, (_, gene) => gene);
          if (repairOrder && !choices.includes(parent[channel])) choices.push(parent[channel]);
          for (const gene of choices) {
            const child = parent.slice();
            child[channel] = gene;
            test(child);
            const actual = run(child);
            const hits = demos.filter(i => actual[i][channel] === task.labels[i][channel]).length;
            if (hits > top) { stitched[channel] = gene; top = hits; }
          }
        }
        test(stitched);
        if (repairOrder) {
          for (const [i, gene] of editOrder) {
            if (seen.size >= budget) break;
            const child = stitched.slice();
            child[i] = gene;
            test(child);
          }
        }
      }
      while (seen.size < budget) {
        const before = seen.size, parent = best;
        if (pairHeads) {
          const pairs = sizes.flatMap((size, i) => {
            const j = (i + 1) % sizes.length;
            return Array.from({ length: size * sizes[j] }, (_, index) => {
              const a = Math.floor(index / sizes[j]), b = index % sizes[j];
              return { i, j, a, b, rank: pairHeads[i][a] * pairHeads[j][b] };
            });
          }).filter(({ i, j, a, b }) => parent[i] !== a && parent[j] !== b)
            .sort((a, b) => b.rank - a.rank);
          const limit = Math.min(budget, seen.size + 12);
          for (const { i, j, a, b } of pairs) {
            if (seen.size >= limit) break;
            const child = parent.slice();
            child[i] = a;
            child[j] = b;
            test(child);
          }
        }
        for (const [i, gene] of editOrder) {
          const child = parent.slice();
          child[i] = gene;
          test(child);
        }
        if (seen.size === before) {
          for (let key = 0; seen.size < budget; key++) {
            test(sizes.map((size, i) => Math.floor(key / 8 ** i) % size));
          }
        }
      }
      return run(best);
    };
    const edits = sizes.flatMap((size, i) => Array.from({ length: size }, (_, gene) => [i, gene]));
    const input = ids.map(i => demos.includes(i) ? encode(task.labels[i]) : 0);
    const { heads } = forward(model, input);
    const learnedOrder = edits.slice().sort(([a, x], [b, y]) => heads[b][y] - heads[a][x]);
    totals.assembly += Number(audit(search([[0, 0, 0, 0]], edits, true), task.labels, fresh));
    totals.randomSearch += Number(audit(search(Array.from({ length: 4 }, () =>
      sizes.map(n => Math.floor(rng() * n))), shuffle(edits, rng)), task.labels, fresh));
    totals.learned += Number(audit(search(rankProposals(heads, 4), learnedOrder), task.labels, fresh));
    if (paired) totals.paired = (totals.paired ?? 0) +
      Number(audit(search(rankProposals(heads, 4), learnedOrder, false, heads), task.labels, fresh));
    if (repair) {
      // Both repair arms use the same deterministic partial assembly.
      const assemblyOrder = edits.slice().sort(([a, x], [b, y]) => x - y || a - b);
      for (const [arm, order] of [['assemblyRepair', assemblyOrder], ['learnedRepair', learnedOrder]]) {
        totals[arm] = (totals[arm] ?? 0) +
          Number(audit(search([[0, 0, 0, 0]], order, true, null, assemblyOrder), task.labels, fresh));
      }
    }
    if (repairModel) {
      const { starts, stitched } = partialAssembly(task, demos, run);
      const rankEdits = (network, input) => {
        const rank = forward(network, input).heads[0];
        return edits.map((edit, i) => ({ edit, i })).sort((a, b) => rank[b.i] - rank[a.i]).map(row => row.edit);
      };
      const arms = { feedbackRule: edits, feedbackDNN: rankEdits(repairModel, repairInput(task, demos, stitched, run)) };
      if (tracedModel) arms.traceDNN = rankEdits(tracedModel, repairInput(task, demos, stitched, run, traces));
      for (const [arm, order] of Object.entries(arms)) {
        const candidates = starts.concat([stitched], order.map(([i, gene]) => {
          const child = stitched.slice();
          child[i] = gene;
          return child;
        }));
        totals[arm] = (totals[arm] ?? 0) + Number(audit(search(candidates, order), task.labels, fresh));
      }
    }
  }
  return totals;
}

function faultExperiment(candidates, makeTask, run, traces) {
  const folds = ['1', '0,2,3', '0,1,3'];
  const mask = genes => genes.flatMap((gene, i) => gene >= 4 ? [i] : []).join(',');
  const rng = random(419607);
  const tasks = shuffle(candidates, rng).map(makeTask);
  const seen = new Set();
  const distinct = tasks.filter(task => {
    const key = JSON.stringify(task.labels);
    if (seen.has(key) || !sizes.every((_, i) => task.labels.some(row => row[i] !== null)
      && task.labels.some(row => row[i] === null))) return false;
    seen.add(key);
    return true;
  });
  const examples = (rows, seed) => {
    const sample = random(seed);
    return rows.flatMap(task => sizes.flatMap((size, module) => {
      const current = task.genes.slice();
      current[module] = (current[module] + 1 + Math.floor(sample() * (size - 1))) % size;
      const order = shuffle(ids, sample);
      const demos = order.slice(0, 64), fresh = order.slice(64);
      if (score(run(current), task.labels, demos) === demos.length * sizes.length) return [];
      const input = repairInput(task, demos, current, run);
      const expected = traces(task.genes), observed = traces(current);
      const error = sizes.map((_, i) => demos.reduce((sum, probe) =>
        sum + Number(expected[probe][i] !== observed[probe][i]), 0));
      const boundary = input.slice();
      error.forEach((count, i) => { boundary[196 + i] = count / demos.length; });
      const targets = [sizes.map((_, i) => Number(i === module))];
      return [{ task, current, demos, fresh, module, input, boundary, targets, error }];
    }));
  };
  for (const family of folds) {
    const train = examples(distinct.filter(task => mask(task.genes) !== family).slice(0, 160), 62913);
    const test = examples(distinct.filter(task => mask(task.genes) === family).slice(0, 32), 85137);
    if (!train.length || !test.length) throw Error('Empty fault split: ' + family);
    const boundaryRows = train.map(row => ({ input: row.boundary, targets: row.targets }));
    for (const seed of [4511, 4512, 4513, 4514]) {
      const outputModel = fit(train, random(seed), 40, 64, null, encode, [4]);
      const boundaryModel = fit(boundaryRows, random(seed), 40, 64, null, encode, [4]);
      const totals = {};
      const control = random(seed);
      const rank = (model, input) => forward(model, input).heads[0];
      for (const row of test) {
        const predictions = {
          random: sizes.map(() => control()),
          mismatch: row.error,
          outputDNN: rank(outputModel, row.input),
          boundaryDNN: rank(boundaryModel, row.boundary),
        };
        for (const [arm, scores] of Object.entries(predictions)) {
          const module = scores.indexOf(Math.max(...scores));
          const best = row.current.slice();
          let hits = -1;
          for (let gene = 0; gene < sizes[module]; gene++) {
            if (gene === row.current[module]) continue;
            const child = row.current.slice();
            child[module] = gene;
            const value = score(run(child), row.task.labels, row.demos);
            if (value > hits) { best[module] = gene; hits = value; }
          }
          const total = totals[arm] ??= { located: 0, repaired: 0 };
          total.located += Number(module === row.module);
          total.repaired += Number(score(run(best), row.task.labels, row.fresh) === row.fresh.length * sizes.length);
        }
      }
      console.log(JSON.stringify({ family, seed, train: train.length, trials: test.length, edits: 7, ...totals }));
    }
  }
}

function plannerExperiment(candidates, makeTask, run, traces) {
  const masks = ['0,3', '1,2,3', '0,1,2,3'];
  const mask = genes => genes.flatMap((gene, i) => gene >= 4 ? [i] : []).join(',');
  const encodeTime = time => time === null ? 0 : time + 1;
  const inputFor = (labels, demos, probe) => {
    const input = ids.map(() => 0);
    for (const [i, demo] of demos.entries()) {
      input[i] = encode(labels[demo]);
      input[64 + i] = demo / 255;
    }
    probes[probe].flat().forEach((bit, i) => { input[128 + i] = bit * 2 - 1; });
    input[176] = probe / 255;
    return input;
  };
  const makeDemos = (seed, task) => {
    const order = shuffle(ids, random(seed));
    return { task, demos: order.slice(0, 64), fresh: order.slice(64) };
  };
  // A join's signal depends only on its own detector and the next detector.
  const local = sizes.map((size, i) => Array.from({ length: size * size }, (_, key) => {
    const genes = [0, 0, 0, 0];
    genes[i] = Math.floor(key / size);
    genes[(i + 1) % sizes.length] = key % size;
    return traces(genes).map(row => encodeTime(row[i]));
  }));
  const waveforms = feasible ? sizes.map((size, i) => Array.from({ length: size * size }, (_, key) => {
    const genes = [0, 0, 0, 0];
    genes[i] = Math.floor(key / size);
    genes[(i + 1) % sizes.length] = key % size;
    return probes.map(seq => simulateFrozen(circuit(genes), seq, false, [6 + 4 * i]).nodeSpikes[0]
      .reduce((bits, tick) => bits | (1 << tick), 0));
  })) : null;
  const moduleScore = (genes, labels, demos) => {
    let matches = 0;
    for (const [i, gene] of genes.entries()) {
      const prev = (i + 3) % 4;
      const own = waveforms[i][8 * gene + genes[(i + 1) % 4]];
      const other = waveforms[prev][8 * genes[prev] + gene];
      for (const probe of demos) {
        // Both joins must spike together. Relay and output each add one tick.
        const coincident = own[probe] & other[probe] & 0x3fff;
        const tick = coincident ? 33 - Math.clz32(coincident & -coincident) : null;
        matches += Number(tick === labels[probe][i]);
      }
    }
    return matches;
  };
  for (const family of masks) {
    const eligible = task => sizes.every((_, i) => {
      const n = task.labels.filter(row => row[i] !== null).length;
      return n >= 8 && n <= 248;
    });
    const seen = new Set();
    const distinct = task => {
      const key = JSON.stringify(task.labels);
      if (seen.has(key) || !eligible(task)) return false;
      seen.add(key);
      return true;
    };
    const auditTasks = shuffle(candidates.filter(genes => mask(genes) === family), random(60991))
      .map(makeTask).filter(distinct).slice(0, 24);
    const training = shuffle(candidates.filter(genes => mask(genes) !== family), random(86131))
      .slice(0, 640).map(makeTask).filter(distinct).slice(0, 128);
    if (!auditTasks.length || !training.length) throw Error('Empty planner split: ' + family);
    const rows = training.flatMap((task, i) => {
      const { demos, fresh } = makeDemos(8371 + i, task);
      const reference = traces(task.genes);
      return fresh.slice(0, 16).map(probe => ({
        input: inputFor(task.labels, demos, probe), genes: reference[probe].map(encodeTime),
      }));
    });
    for (const seed of [4711, 4712, 4713]) {
      const model = fit(rows, random(seed), 18, 64, null, encode, sizes.map(() => 17));
      const totals = feasible ? { moduleRule: 0, moduleDNN: 0 } : { random: 0, outputOnly: 0, planned: 0, oracle: 0 };
      const trials = auditTasks.map((task, i) => makeDemos(90117 + i, task));
      for (const [index, { task, demos, fresh }] of trials.entries()) {
        const control = random(seed ^ Math.imul(index + 1, 2654435761));
        const reference = traces(task.genes);
        const planningProbes = fresh.slice(0, 16);
        const testProbes = fresh.slice(16);
        const predicted = planningProbes.map(probe => forward(model, inputFor(task.labels, demos, probe)).heads);
        const rank = (predictions) => {
          const factors = local.map((table, i) => table.map(trace => planningProbes.reduce((sum, probe, j) =>
            sum + predictions(j, i, trace[probe]), 0)));
          const value = genes => genes.reduce((sum, g, i) => sum + factors[i][8 * g + genes[(i + 1) % 4]], 0);
          return candidates.map(genes => ({ genes, score: value(genes) })).sort((a, b) => b.score - a.score)
            .slice(0, budget).map(row => row.genes);
        };
        const outputOnly = local.map((table, i) => table.map(trace => demos.reduce((sum, probe) => {
          const tick = trace[probe] === 0 || trace[probe] >= 15 ? null : trace[probe] + 1;
          return sum + Number(tick === task.labels[probe][i]);
        }, 0)));
        const assembled = candidates.map(genes => ({ genes, score: genes.reduce((sum, g, i) =>
          sum + outputOnly[i][8 * g + genes[(i + 1) % 4]], 0) }))
          .sort((a, b) => b.score - a.score).slice(0, budget).map(row => row.genes);
        let arms = {
          random: shuffle(candidates, control).slice(0, budget), outputOnly: assembled,
          planned: rank((j, i, time) => Math.log(Math.max(1e-12, predicted[j][i][time]))),
          oracle: rank((j, i, time) => Number(time === encodeTime(reference[planningProbes[j]][i]))),
        };
        if (feasible) {
          for (const genes of candidates.slice(0, 8).concat([task.genes])) {
            if (moduleScore(genes, task.labels, demos) !== score(run(genes), task.labels, demos)) {
              throw Error('Composed module timings differ from full simulation');
            }
          }
          const evidence = candidates.map(genes => ({ genes, matches: moduleScore(genes, task.labels, demos) }))
            .sort((a, b) => b.matches - a.matches);
          const shortlist = evidence.filter(row => row.matches >= evidence[budget - 1].matches);
          const prior = genes => genes.reduce((sum, g, i) => sum + planningProbes.reduce((sub, probe, j) =>
            sub + Math.log(Math.max(1e-12, predicted[j][i][local[i][8 * g + genes[(i + 1) % 4]][probe]])), 0), 0);
          arms = {
            moduleRule: evidence.slice(0, budget).map(row => row.genes),
            moduleDNN: shortlist.map(row => ({ ...row, prior: prior(row.genes) }))
              .sort((a, b) => b.matches - a.matches || b.prior - a.prior).slice(0, budget).map(row => row.genes),
          };
        }
        for (const [arm, options] of Object.entries(arms)) {
          let best, hits = -1;
          for (const genes of options) {
            const actual = run(genes);
            const value = score(actual, task.labels, demos);
            if (value > hits) { best = actual; hits = value; }
          }
          totals[arm] += Number(audit(best, task.labels, testProbes));
        }
      }
      console.log(JSON.stringify({ family, seed, training: training.length, trials: trials.length, budget, ...totals }));
    }
  }
}

function main() {
  const candidates = [];
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
    for (let c = 0; c < 8; c++) for (let d = 0; d < 8; d++) candidates.push([a, b, c, d]);
  }
  const cache = new Map();
  const run = genes => {
    const key = genes.join(',');
    if (!cache.has(key)) {
      const net = circuit(genes);
      cache.set(key, probes.map(seq => simulateFrozen(net, seq, true).firstSpike));
    }
    return cache.get(key);
  };
  const makeTask = genes => ({ genes, labels: run(genes) });
  const traceCache = new Map();
  const traces = genes => {
    const key = genes.join(',');
    if (!traceCache.has(key)) {
      const net = circuit(genes);
      const boundaries = sizes.map((_, i) => 6 + 4 * i);
      traceCache.set(key, probes.map(seq => simulateFrozen(net, seq, false, boundaries)
        .nodeSpikes.map(times => times[0] ?? null)));
    }
    return traceCache.get(key);
  };
  if (fault) return faultExperiment(candidates, makeTask, run, traces);
  if (planner) return plannerExperiment(candidates, makeTask, run, traces);
  const makeTrials = (tasks, seed) => {
    const rng = random(seed);
    return tasks.flatMap(task => Array.from({ length: 2 }, () => {
      const order = shuffle(ids, rng);
      return { task, demos: order.slice(0, 64), fresh: order.slice(64) };
    }));
  };
  const signature = task => JSON.stringify(task.labels);
  const eligible = task => sizes.every((_, k) => {
    const positives = task.labels.filter(row => row[k] !== null).length;
    return positives >= 16 && positives <= 240;
  });
  const families = traceFeedback ? [
    ['one join at output D', '3'], ['three joins missing B', '0,2,3'], ['three joins missing C', '0,1,3'],
  ].map(([name, mask]) => [name, genes =>
    genes.map((g, i) => g >= 4 ? i : -1).filter(i => i >= 0).join(',') === mask]) : paired || repair ? [
    ['one join', '1'], ['three consecutive joins', '0,1,2'], ['three wraparound joins', '0,2,3'],
  ].map(([name, mask]) => [name, genes =>
    genes.map((g, i) => g >= 4 ? i : -1).filter(i => i >= 0).join(',') === mask]) : [
    ['two adjacent joins', genes => genes.map((g, i) => g >= 4 ? i : -1).filter(i => i >= 0).join(',') === '0,1'],
    ['two alternating joins', genes => genes.map((g, i) => g >= 4 ? i : -1).filter(i => i >= 0).join(',') === '0,2'],
  ];
  for (const [family, heldOut] of families) {
    const seen = new Set();
    const distinct = task => {
      const key = signature(task);
      if (!eligible(task) || seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    const reserved = shuffle(candidates.filter(heldOut), random(60919)).map(makeTask).filter(distinct);
    const training = shuffle(candidates.filter(genes => !heldOut(genes)), random(83755)).slice(0, 500)
      .map(makeTask).filter(distinct).slice(0, 160);
    if (!training.length || !reserved.length) throw Error('No eligible circuits for ' + family);
    const trials = makeTrials(reserved.slice(0, 24), traceFeedback ? 931873 : repair ? 835719 : paired ? 704913 : 73189);
    const edits = sizes.flatMap((size, i) => Array.from({ length: size }, (_, gene) => [i, gene]));
    const rows = feedback ? feedbackRows(training, run, edits, traceFeedback ? traces : null) : null;
    const tracedRows = traceFeedback ? rows.map(row => ({ input: row.tracedInput, targets: row.targets })) : null;
    for (const seed of traceFeedback ? [4311, 4312, 4313, 4314] : repair ? [4111, 4112, 4113, 4114] : [3911, 3912, 3913, 3914]) {
      const model = fit(training, random(seed), 55, 64, null, encode, sizes);
      const repairModel = rows ? fit(rows, random(seed), 65, 64, null, encode, [edits.length]) : null;
      const tracedModel = tracedRows ? fit(tracedRows, random(seed), 65, 64, null, encode, [edits.length]) : null;
      console.log(JSON.stringify({ shared, family, seed, budget, training: training.length, trials: trials.length,
        ...compare(model, trials, seed, run, repairModel, tracedModel, traces) }));
    }
  }
}

main();
