'use strict';

const { PROBES } = require('./inverse_circuits');
const { simulateFrozen } = require('./engine');
const { fit, forward, rankProposals, random, shuffle } = require('./inverse_designer');

const sizes = [4, 2, 4, 2];
const budget = 16;
const indices = PROBES.map((_, i) => i);
const encode = times => (1 + (times[0] ?? -1) + 9 * (1 + (times[1] ?? -1))) / 41 - 1.01;

function circuit(genes) {
  const neurons = [], edges = [];
  const add = (kind, thr = 1) => neurons.push({ kind, thr, leak: 0 }) - 1;
  const connect = (from, to, delay = 0) => edges.push({ from, to, weight: 1, delay });
  add('input'); add('input');
  const tails = [0, 1].map(channel => {
    const [pattern, extra] = genes.slice(channel * 2, channel * 2 + 2);
    const trace = add('lif'), detect = add('lif', 2);
    connect(pattern < 2 ? channel : 1 - channel, trace);
    connect(trace, detect, pattern % 2);
    connect(channel, detect);
    if (!extra) return detect;
    const relay = add('lif');
    connect(detect, relay);
    return relay;
  });
  const outputs = tails.map(tail => {
    const out = add('output');
    connect(tail, out);
    return out;
  });
  return { version: 'snn-graph-1', neurons, edges, inputs: [0, 1], outputs };
}

function sequencePilot(seed) {
  const candidates = [], signatures = new Set();
  for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) {
    for (let c = 0; c < 4; c++) for (let d = 0; d < 2; d++) {
      const genes = [a, b, c, d], graph = circuit(genes);
      const labels = PROBES.map(seq => simulateFrozen(graph, seq, true).firstSpike);
      const signature = JSON.stringify(labels);
      if (signatures.has(signature) || ![0, 1].every(k => labels.some(row => row[k] !== null))) continue;
      signatures.add(signature);
      candidates.push({ genes, graph, labels });
    }
  }
  const byGenes = new Map(candidates.map(row => [row.genes.join(','), row]));
  const reserved = shuffle(candidates, random(31591)).slice(0, 12);
  const training = candidates.filter(row => !reserved.includes(row));
  const model = fit(training, random(seed), 100, 64, null, encode, sizes);
  const rng = random(77185), baselineRng = random(seed ^ 31709);
  const learned = { passed: 0, trials: reserved.length };
  const baseline = { passed: 0, trials: reserved.length };
  const discoveries = [];
  for (const target of reserved) {
    const order = shuffle(indices, rng), demos = order.slice(0, 64), fresh = order.slice(64);
    const input = indices.map(() => 0);
    for (const i of demos) input[i] = encode(target.labels[i]);
    const match = (candidate, i) => candidate.labels[i].every((time, k) => time === target.labels[i][k]);
    const select = rows => rows.map(row => ({ row, hits: demos.filter(i => match(row, i)).length }))
      .reduce((a, b) => a.hits >= b.hits ? a : b);
    const proposals = rankProposals(forward(model, input).heads, 64).map(genes => byGenes.get(genes.join(','))).filter(Boolean);
    const { row, hits } = select(proposals.slice(0, budget));
    const control = select(shuffle(candidates, baselineRng).slice(0, budget)).row;
    for (const [candidate, report] of [[row, learned], [control, baseline]]) {
      const passed = [0, 1].every(k => [true, false].every(fires => {
        const group = fresh.filter(i => (target.labels[i][k] !== null) === fires);
        return group.length && group.filter(i => candidate.labels[i][k] === target.labels[i][k]).length >= 0.9 * group.length;
      }));
      report.passed += Number(passed);
    }
    if (discoveries.some(item => item.graph === row.graph)) continue;
    const pairs = fresh.flatMap(i => target.labels[i].map((time, k) => [time, row.labels[i][k]]));
    const positives = pairs.filter(([time]) => time !== null), negatives = pairs.filter(([time]) => time === null);
    discoveries.push({ graph: row.graph, freshCount: fresh.length, demoAccuracy: hits / demos.length,
      accuracy: fresh.filter(i => match(row, i)).length / fresh.length,
      recall: positives.filter(([expected, actual]) => expected === actual).length / positives.length,
      specificity: negatives.filter(([expected, actual]) => expected === actual).length / negatives.length,
      replay: fresh.slice(0, 4).map(i => [i, target.labels[i]]),
    });
  }
  return { version: 'inverse-composition-1', seed, family: 'Two-stream sequence', budget, trainingRows: training.length,
    learned, baseline, discoveries };
}

module.exports = { sequencePilot };
