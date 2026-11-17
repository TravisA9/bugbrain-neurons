'use strict';

const { performance } = require('node:perf_hooks');
const { simulateFrozen } = require('./engine');
const { fit, forward, random, shuffle } = require('./inverse_designer');

const large = process.argv.includes('--large');
const cross = large || process.argv.includes('--cross-links');
const streams = large ? 32 : cross ? 16 : 8, options = 8, beamWidth = 24, steps = 20;
const channels = Array.from({ length: streams }, (_, i) => i);
const choices = Array.from({ length: options }, (_, i) => i);
const rng = random(589231);
const probes = Array.from({ length: 128 }, () =>
  Array.from({ length: steps }, () => channels.map(() => Number(rng() < (large ? 0.68 : 0.55)))));
const demos = probes.slice(0, large ? 32 : 256 / streams), fresh = probes.slice(demos.length);
let layout = 'ring';
const upstream = i => (i + streams - (cross && i % 2 === 0 ? (layout === 'mixed' ? [5, 9, 13][i % 3] : 7) : 1)) % streams;

function circuit(genes) {
  const neurons = [], edges = [];
  const add = (kind, thr = 1) => neurons.push({ kind, thr, leak: 0 }) - 1;
  const connect = (from, to, delay = 0) => edges.push({ from, to, weight: 1, delay });
  const inputs = channels.map(() => add('input'));
  const modules = genes.map(gene => [add('lif'), add('lif', 2), add('lif', gene >= 4 ? 2 : 1), add('lif', 2)]);
  const outputs = channels.map(() => add('output'));
  for (const i of channels) {
    const gene = genes[i], next = (i + 1) % streams, prev = upstream(i);
    const [trace, detector, join, relay] = modules[i];
    connect(inputs[gene & 2 ? next : i], trace);
    connect(trace, detector, gene & 1);
    connect(inputs[i], detector);
    connect(detector, join);
    if (gene >= 4) connect(modules[next][1], join);
    connect(join, relay);
    connect(modules[prev][2], relay);
    connect(relay, outputs[i]);
  }
  return { neurons, edges, inputs, outputs };
}

function simulate(genes, cases) {
  const net = circuit(genes);
  return cases.map(seq => simulateFrozen(net, seq, true).firstSpike);
}

function encode(labels) {
  if (large) {
    return channels.flatMap(i => Array.from({ length: 8 }, (_, bin) =>
      labels.filter(row => (row[i] === null ? 0 : 1 + Math.floor(row[i] / 4)) === bin).length / labels.length));
  }
  return labels.flat().map(time => time === null ? -1 : 1 - time / (steps + 4));
}

function moduleTables() {
  return channels.map(i => choices.flatMap(own => choices.map(next => {
    const genes = channels.map(() => 0);
    genes[i] = own;
    genes[(i + 1) % streams] = next;
    const net = circuit(genes);
    return demos.map(seq => simulateFrozen(net, seq, false, [streams + 4 * i + 2])
      .nodeSpikes[0].reduce((bits, tick) => bits | (1 << tick), 0));
  })));
}

function factors(tables, labels) {
  return channels.map(i => {
    const prev = upstream(i), afterPrev = (prev + 1) % streams, after = (i + 1) % streams;
    if (cross) {
      const scope = [...new Set([prev, afterPrev, i, after])];
      const positions = [prev, afterPrev, i, after].map(j => scope.indexOf(j));
      const values = Array.from({ length: options ** scope.length }, (_, key) => {
        const genes = scope.map((_, j) => Math.floor(key / options ** j) % options);
        const [a, b, c, d] = positions.map(j => genes[j]);
        return coincidenceHits(tables[prev][a * options + b], tables[i][c * options + d], labels, i);
      });
      const ordered = scope.slice().sort((a, b) => a - b);
      const prefixes = ordered.map((_, k) => new Float64Array(options ** (k + 1)).fill(-Infinity));
      for (const [key, value] of values.entries()) {
        let prefix = 0;
        for (const [k, channel] of ordered.entries()) {
          prefix += (Math.floor(key / options ** scope.indexOf(channel)) % options) * options ** k;
          prefixes[k][prefix] = Math.max(prefixes[k][prefix], value);
        }
      }
      return { scope, values, ordered, prefixes };
    }
    return choices.flatMap(a => choices.flatMap(b => choices.map(c => {
      const left = tables[prev][a * options + b], right = tables[i][b * options + c];
      return labels.reduce((hits, row, j) => {
        const common = left[j] & right[j] & ((1 << (steps + 2)) - 1);
        const tick = common ? 33 - Math.clz32(common & -common) : null;
        return hits + Number(tick === row[i]);
      }, 0);
    })));
  });
}

function coincidenceHits(left, right, labels, i) {
  return labels.reduce((hits, row, j) => {
    const common = left[j] & right[j] & ((1 << (steps + 2)) - 1);
    const tick = common ? 33 - Math.clz32(common & -common) : null;
    return hits + Number(tick === row[i]);
  }, 0);
}

function crossSearch(evidence, heads, width = beamWidth, bounded = false) {
  const ready = channels.map(i => evidence.filter(f => Math.max(...f.scope) === i));
  let beam = [{ genes: [], score: 0, prior: 0 }];
  for (const i of channels) {
    beam = beam.flatMap(parent => choices.map(gene => {
      const genes = parent.genes.concat(gene);
      const score = bounded ? evidence.reduce((sum, f) => {
        let key = 0, k = 0;
        for (const channel of f.ordered) {
          if (channel > i) break;
          key += genes[channel] * options ** k++;
        }
        return sum + (k ? f.prefixes[k - 1][key] : 0);
      }, 0) : ready[i].reduce((sum, f) => sum + f.values[f.scope.reduce(
        (key, j, k) => key + genes[j] * options ** k, 0)], parent.score);
      return { genes, score, prior: parent.prior + (heads ? Math.log(heads[i][gene]) : 0) };
    })).sort((a, b) => b.score - a.score || b.prior - a.prior).slice(0, width);
  }
  return beam.slice(0, 8).map(row => row.genes);
}

function shortlist(evidence, heads) {
  if (cross) return crossSearch(evidence, heads);
  const factor = (i, a, b, c) => evidence[i][(a * options + b) * options + c];
  let beam = [{ genes: [], score: 0, prior: 0 }];
  for (const i of channels) {
    beam = beam.flatMap(parent => choices.map(gene => {
      const genes = parent.genes.concat(gene);
      let score = parent.score;
      if (i >= 2) score += factor(i - 1, genes[i - 2], genes[i - 1], gene);
      if (i === streams - 1) {
        score += factor(i, genes[i - 1], gene, genes[0]) + factor(0, gene, genes[0], genes[1]);
      }
      return { genes, score, prior: parent.prior + (heads ? Math.log(heads[i][gene]) : 0) };
    })).sort((a, b) => b.score - a.score || b.prior - a.prior).slice(0, beamWidth);
  }
  return beam.slice(0, 8).map(row => row.genes);
}

function exactBest(evidence) {
  const factor = (i, a, b, c) => evidence[i][(a * options + b) * options + c];
  let best = { score: -1 };
  for (const first of choices) for (const second of choices) {
    let states = [{ genes: [first, second], score: 0 }];
    for (let i = 2; i < streams; i++) {
      const next = Array(options ** 2);
      for (const state of states) for (const gene of choices) {
        const a = state.genes[i - 2], b = state.genes[i - 1];
        const key = b * options + gene;
        const score = state.score + factor(i - 1, a, b, gene);
        if (!next[key] || score > next[key].score) next[key] = { genes: state.genes.concat(gene), score };
      }
      states = next.filter(Boolean);
    }
    for (const state of states) {
      const last = state.genes.at(-1), previous = state.genes.at(-2);
      const score = state.score + factor(streams - 1, previous, last, first) + factor(0, last, first, second);
      if (score > best.score) best = { genes: state.genes, score };
    }
  }
  return best.genes;
}

const match = (a, b) => a.reduce((hits, row, i) =>
  hits + row.filter((time, j) => time === b[i][j]).length, 0);

function passes(actual, expected) {
  return channels.every(k => [false, true].every(firing => {
    const cases = expected.map((row, i) => (row[k] !== null) === firing ? i : -1).filter(i => i >= 0);
    return (large || cases.length) && cases.filter(i => actual[i][k] === expected[i][k]).length >= 0.9 * cases.length;
  }));
}

function main() {
  const setup = performance.now();
  const tables = moduleTables();
  console.log(JSON.stringify({ layout, hidden: 4 * streams, beamWidth, cacheMs: performance.now() - setup }));
  const held = cross ? [[0, 2], [1, 3, 9], [0, 3, 5, 11]] : [[0, 2], [1, 3], [0, 3, 5]];
  const mask = genes => genes.flatMap((gene, i) => gene >= 4 ? [i] : []).join(',');
  const reserved = new Set(held.map(row => row.join(',')));
  const training = [], signatures = new Set();
  const audit = held.map(() => []);
  const trainCount = large ? 256 : 512, auditCount = large ? 10 : 24;
  for (let attempt = 0; attempt < 30000 && (training.length < trainCount || audit.some(rows => rows.length < auditCount)); attempt++) {
    const family = attempt % 4 - 1;
    if (family < 0 ? training.length >= trainCount : audit[family].length >= auditCount) continue;
    const genes = family < 0 ? channels.map(() => Math.floor(rng() * options))
      : channels.map(i => Math.floor(rng() * 4) + (held[family].includes(i) ? 4 : 0));
    if (family < 0 && reserved.has(mask(genes))) continue;
    const labels = simulate(genes, demos);
    if (!large && !channels.every(i => labels.some(row => row[i] !== null) && (cross || labels.some(row => row[i] === null)))) continue;
    const key = JSON.stringify(labels);
    if (signatures.has(key)) continue;
    signatures.add(key);
    if (family < 0) training.push({ genes, input: encode(labels) });
    else {
      const expected = simulate(genes, fresh);
      const mixedOutputs = channels.filter(i => expected.some(row => row[i] === null) && expected.some(row => row[i] !== null)).length;
      if (mixedOutputs < (large ? 24 : streams)) continue;
      const evidenceStart = performance.now();
      const evidence = factors(tables, labels);
      if (cross && evidence.some(({ scope, values }) => values[scope.reduce(
        (key, j, k) => key + genes[j] * options ** k, 0)] !== demos.length)) {
        throw Error('Module table disagrees with full simulation');
      }
      audit[family].push({ labels, expected, evidence, genes, mixedOutputs, evidenceMs: performance.now() - evidenceStart });
    }
  }
  if (training.length !== trainCount || audit.some(rows => rows.length !== auditCount)) throw Error('Incomplete benchmark');
  if (large) console.log(JSON.stringify({ layout, minMixedOutputs: Math.min(...audit.flat().map(row => row.mixedOutputs)),
    evidenceMsPerTask: audit.flat().reduce((sum, row) => sum + row.evidenceMs, 0) / (held.length * auditCount) }));
  for (const [family, tasks] of (cross ? [] : audit).entries()) {
    let passed = 0, ms = 0;
    for (const task of tasks) {
      const start = performance.now();
      const genes = exactBest(task.evidence);
      simulate(genes, demos);
      ms += performance.now() - start;
      passed += Number(passes(simulate(genes, fresh), task.expected));
    }
    console.log(JSON.stringify({ exact: true, family: held[family], tasks: tasks.length, passed, ms }));
  }
  for (const seed of large ? [6111, 6112] : [5111, 5112, 5113]) {
    const start = performance.now();
    const model = fit(training, random(seed), large ? 35 : 50, demos.length, null, null, channels.map(() => options));
    console.log(JSON.stringify({ seed, trainingMs: performance.now() - start }));
    for (const [family, tasks] of audit.entries()) {
      const totals = {};
      for (const [index, task] of shuffle(tasks, random(seed)).entries()) {
        const arms = large ? ['boundedRule', 'boundedDNN'] : cross ? ['rule', 'dnn', 'boundedRule', 'boundedDNN'] : ['rule', 'dnn'];
        if (index % 2) arms.reverse();
        for (const arm of arms) {
          const result = totals[arm] ??= { passes: [0, 0, 0], ms: [0, 0, 0] };
          const start = performance.now();
          const heads = /dnn/i.test(arm) ? forward(model, encode(task.labels)).heads : null;
          const list = arm.startsWith('bounded') ? crossSearch(task.evidence, heads, beamWidth, true) : shortlist(task.evidence, heads);
          let best, score = -1;
          let auditMs = 0;
          for (const [i, genes] of list.entries()) {
            const hit = match(simulate(genes, demos), task.labels);
            if (hit > score) { best = genes; score = hit; }
            const slot = [1, 4, 8].indexOf(i + 1);
            if (slot < 0) continue;
            result.ms[slot] += performance.now() - start - auditMs;
            const auditStart = performance.now();
            result.passes[slot] += Number(passes(simulate(best, fresh), task.expected));
            auditMs += performance.now() - auditStart;
          }
        }
      }
      console.log(JSON.stringify({ layout, seed, family: held[family], tasks: tasks.length, ...totals }));
    }
  }
}

if (large) {
  for (const wiring of ['offset seven', 'mixed']) {
    layout = wiring;
    main();
  }
} else main();
