'use strict';
/* Seeded synthetic scenarios for SpikeFoundry jobs.
 * Shapes match the usual tensor layouts (image, token, graph, observation).
 * A finite score means the generator, spike encoding, module compile, and held-out
 * event simulator all ran. It does not measure a real vision, language, graph, or RL model.
 * Defaults stay small. Nothing here writes a dataset file. */
const KINDS = ['vision', 'sequence', 'graph', 'control'];
const ORDER = KINDS.slice();
const LIMITS = {
  batch: [1, 4],
  channels: [1, 3],
  height: [2, 8],
  width: [2, 8],
  sequence: [2, 12],
  hidden: [2, 8],
  nodes: [3, 8],
  features: [1, 4],
  steps: [4, 12],
  obs: [2, 6],
};
const DEFAULTS = {
  vision: { batch: 2, channels: 1, height: 4, width: 4, steps: 6 },
  sequence: { batch: 2, sequence: 4, hidden: 4, steps: 6 },
  graph: { batch: 2, nodes: 4, features: 2, steps: 6 },
  control: { batch: 2, steps: 8, obs: 4 },
};
const NOTE = 'Synthetic scenario data. A passing pipeline only shows that generation, spike encoding, compilation, and held-out scoring ran. It is not real-world model quality.';

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clampInt(name, value, fallback) {
  const range = LIMITS[name];
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < range[0] || n > range[1]) {
    const err = new Error(name + ' must be a whole number from ' + range[0] + ' to ' + range[1] + '.');
    err.code = 'bounds';
    throw err;
  }
  return n;
}
function normalize(kind, raw) {
  if (KINDS.indexOf(kind) < 0) {
    const err = new Error('Unknown scenario. Use vision, sequence, graph, or control.');
    err.code = 'scenario';
    throw err;
  }
  const d = DEFAULTS[kind];
  const p = { kind };
  if (kind === 'vision') {
    p.batch = clampInt('batch', raw && raw.batch, d.batch);
    p.channels = clampInt('channels', raw && raw.channels, d.channels);
    p.height = clampInt('height', raw && raw.height, d.height);
    p.width = clampInt('width', raw && raw.width, d.width);
    p.steps = clampInt('steps', raw && raw.steps, d.steps);
    p.shape = [p.batch, p.channels, p.height, p.width];
  } else if (kind === 'sequence') {
    p.batch = clampInt('batch', raw && raw.batch, d.batch);
    p.sequence = clampInt('sequence', raw && raw.sequence, d.sequence);
    p.hidden = clampInt('hidden', raw && raw.hidden, d.hidden);
    p.steps = clampInt('steps', raw && raw.steps, d.steps);
    p.shape = [p.batch, p.sequence, p.hidden];
  } else if (kind === 'graph') {
    p.batch = clampInt('batch', raw && raw.batch, d.batch);
    p.nodes = clampInt('nodes', raw && raw.nodes, d.nodes);
    p.features = clampInt('features', raw && raw.features, d.features);
    p.steps = clampInt('steps', raw && raw.steps, d.steps);
    p.shape = { adjacency: [p.nodes, p.nodes], features: [p.nodes, p.features], graphs: p.batch };
  } else {
    p.batch = clampInt('batch', raw && raw.batch, d.batch);
    p.steps = clampInt('steps', raw && raw.steps, d.steps);
    p.obs = clampInt('obs', raw && raw.obs, d.obs);
    p.shape = [p.batch, p.steps, p.obs];
  }
  return p;
}

function splitCount(n) {
  const held = Math.max(1, Math.floor(n / 2));
  const train = n - held;
  if (train < 1) return { train: [0], heldOut: [] };
  return { train: Array.from({ length: train }, (_, i) => i), heldOut: Array.from({ length: held }, (_, i) => train + i) };
}

function visionExample(p, index, rng) {
  const plane = p.channels * p.height * p.width;
  const data = Array.from({ length: plane }, () => 0);
  const quadrant = index % 4;
  const h0 = quadrant < 2 ? 0 : Math.floor(p.height / 2);
  const w0 = quadrant % 2 === 0 ? 0 : Math.floor(p.width / 2);
  for (let c = 0; c < p.channels; c++) {
    for (let y = h0; y < Math.min(p.height, h0 + Math.ceil(p.height / 2)); y++) {
      for (let x = w0; x < Math.min(p.width, w0 + Math.ceil(p.width / 2)); x++) {
        const i = (c * p.height + y) * p.width + x;
        data[i] = 0.55 + rng() * 0.4;
      }
    }
  }
  return { values: data, label: quadrant, labelName: 'quadrant ' + quadrant };
}
function sequenceExample(p, index, rng) {
  const rows = [];
  let prev = index % p.hidden;
  const next = [];
  for (let t = 0; t < p.sequence; t++) {
    const row = Array.from({ length: p.hidden }, () => 0);
    const token = t === 0 ? prev : (prev + 1 + (index % 3)) % p.hidden;
    row[token] = 0.7 + rng() * 0.3;
    if (t === Math.floor(p.sequence / 2)) row[(token + 2) % p.hidden] = 0.4;
    rows.push(row);
    next.push((token + 1) % p.hidden);
    prev = token;
  }
  const context = rows[0].indexOf(Math.max(...rows[0]));
  const later = rows[rows.length - 1].indexOf(Math.max(...rows[rows.length - 1]));
  return { values: rows, label: (context + later) % 2, nextTokens: next, labelName: 'context bit ' + ((context + later) % 2) };
}
function graphExample(p, index, rng) {
  const n = p.nodes, f = p.features;
  const X = Array.from({ length: n }, (_, i) => Array.from({ length: f }, (__, k) => ((i + index + k) % 5) / 5));
  const A = Array.from({ length: n }, () => Array(n).fill(0));
  const relations = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1 + (index % (n - 1))) % n;
    if (i !== j) { A[i][j] = 1; relations.push([i, j]); }
    if (rng() < 0.25 && i !== (j + 1) % n) { const k = (i + 2) % n; if (k !== i) { A[i][k] = 1; relations.push([i, k]); } }
  }
  const agg = X.map((_, i) => {
    let s = 0, c = 0;
    for (let j = 0; j < n; j++) if (A[j][i]) { s += X[j][0]; c++; }
    return c ? s / c : 0;
  });
  return { adjacency: A, features: X, relations, label: relations.length % 2, aggregate: agg, labelName: 'relation parity ' + (relations.length % 2) };
}
function controlExample(p, index, rng) {
  const obs = [];
  const rewards = [];
  let state = index % p.obs;
  for (let t = 0; t < p.steps; t++) {
    const row = Array.from({ length: p.obs }, () => 0);
    row[state] = 0.8;
    row[(state + 1) % p.obs] = rng() * 0.2;
    obs.push(row);
    const action = state % 2;
    const delayed = t >= 3 && action === (obs[t - 3][0] > 0 ? 1 : 0) ? 1 : 0;
    rewards.push(delayed);
    state = (state + 1) % p.obs;
  }
  const ret = rewards.reduce((s, r) => s + r, 0);
  return { values: obs, rewards, label: ret > 0 ? 1 : 0, labelName: 'delayed reward ' + (ret > 0 ? 'present' : 'absent') };
}

function generate(kind, raw) {
  const p = normalize(kind, raw || {});
  const seed = raw && raw.seed != null ? (raw.seed >>> 0) : 1;
  const rng = mulberry32(seed);
  const examples = [];
  for (let i = 0; i < p.batch; i++) {
    if (kind === 'vision') examples.push(visionExample(p, i, rng));
    else if (kind === 'sequence') examples.push(sequenceExample(p, i, rng));
    else if (kind === 'graph') examples.push(graphExample(p, i, rng));
    else examples.push(controlExample(p, i, rng));
  }
  const parts = splitCount(examples.length);
  return {
    synthetic: true, kind, seed, params: p, shape: p.shape,
    train: parts.train, heldOut: parts.heldOut, examples, note: NOTE,
  };
}

function encodeSpikes(example, steps) {
  const flat = example.values ? example.values.flat(2) : example.features.flat();
  const events = [];
  flat.forEach((value, channel) => {
    const v = Math.max(0, Math.min(1, value));
    if (v < 0.35) return;
    const t = Math.min(steps - 1, Math.floor((1 - v) * (steps - 1)));
    events.push({ t, channel });
    if (v > 0.75 && t + 1 < steps) events.push({ t: t + 1, channel });
  });
  events.sort((a, b) => a.t - b.t || a.channel - b.channel);
  return { steps, channels: flat.length, events, synthetic: true };
}

function moduleSpec(kind) {
  if (kind === 'coincidence') return { id: 'coincidence', inputs: 2, outputs: 1, hidden: [{ role: 'and', threshold: 1.5 }], wires: [[0, 2, 1, 0], [1, 2, 1, 0], [2, 3, 1.2, 1]] };
  if (kind === 'sequence') return { id: 'sequence', inputs: 2, outputs: 1, hidden: [{ role: 'trace', threshold: 0.8 }, { role: 'order', threshold: 1.4 }], wires: [[0, 2, 1.2, 0], [2, 3, 1, 1], [1, 3, 1, 0], [3, 4, 1.2, 1]] };
  return { id: 'readout', inputs: 1, outputs: 1, hidden: [], wires: [[0, 1, 1, 0]] };
}
function compileModule(spec, offset) {
  offset = offset || 0;
  const neurons = [];
  for (let i = 0; i < spec.inputs; i++) neurons.push({ id: offset + neurons.length, kind: 'input', role: 'in' + i, threshold: Infinity, leak: 0, module: spec.id, partition: 0 });
  spec.hidden.forEach(h => neurons.push({ id: offset + neurons.length, kind: 'hidden', role: h.role, threshold: h.threshold, leak: 0.5, module: spec.id, partition: 1 }));
  for (let i = 0; i < spec.outputs; i++) neurons.push({ id: offset + neurons.length, kind: 'output', role: 'out' + i, threshold: 1, leak: 0.3, module: spec.id, partition: 1 });
  const byLocal = id => neurons[id].id;
  const synapses = spec.wires.map(([from, to, weight, delay]) => ({ from: byLocal(from), to: byLocal(to), weight, delay }));
  return {
    neurons, synapses,
    inputs: neurons.filter(n => n.kind === 'input').map(n => n.id),
    outputs: neurons.filter(n => n.kind === 'output').map(n => n.id),
    modules: [{ id: spec.id, inputs: neurons.filter(n => n.kind === 'input').map(n => n.id), outputs: neurons.filter(n => n.kind === 'output').map(n => n.id) }],
  };
}
function compose(graphs) {
  const neurons = [], synapses = [], modules = [];
  graphs.forEach(g => {
    neurons.push(...g.neurons);
    synapses.push(...g.synapses);
    modules.push(...g.modules);
  });
  for (let i = 0; i < graphs.length - 1; i++) {
    const a = graphs[i].outputs, b = graphs[i + 1].inputs;
    const n = Math.min(a.length, b.length);
    for (let k = 0; k < n; k++) synapses.push({ from: a[k], to: b[k], weight: 1, delay: 1 });
  }
  return { neurons, synapses, inputs: graphs[0].inputs.slice(), outputs: graphs[graphs.length - 1].outputs.slice(), modules };
}
function compileReadout(channels) {
  const neurons = [{ id: 0, kind: 'output', role: 'score', threshold: 1.25, leak: 0.4, module: 'readout', partition: 0 }];
  const synapses = [];
  for (let c = 0; c < channels; c++) {
    neurons.push({ id: c + 1, kind: 'input', role: 'ch' + c, threshold: Infinity, leak: 0, module: 'readout', partition: c % 2 });
    synapses.push({ from: c + 1, to: 0, weight: 0.45, delay: 0 });
  }
  return { neurons, synapses, inputs: neurons.filter(n => n.kind === 'input').map(n => n.id), outputs: [0], modules: [{ id: 'readout', inputs: neurons.filter(n => n.kind === 'input').map(n => n.id), outputs: [0] }] };
}

function simulateEvents(graph, events, steps) {
  const mem = {};
  const last = {};
  const out = [];
  graph.neurons.forEach(n => { mem[n.id] = 0; last[n.id] = 0; });
  const incoming = {};
  graph.synapses.forEach(s => { (incoming[s.to] = incoming[s.to] || []).push(s); });
  const byTime = Array.from({ length: steps }, () => []);
  events.forEach(e => { if (e.t >= 0 && e.t < steps) byTime[e.t].push(e); });
  const pending = Array.from({ length: steps }, () => []);
  for (let t = 0; t < steps; t++) {
    const fired = new Set();
    byTime[t].forEach(e => {
      const id = graph.inputs[e.channel % graph.inputs.length];
      if (id != null) fired.add(id);
    });
    pending[t].forEach(ev => fired.add(ev.id));
    const partitions = [...new Set(graph.neurons.map(n => n.partition))].sort((a, b) => a - b);
    partitions.forEach(part => {
      graph.neurons.filter(n => n.partition === part && n.kind !== 'input').forEach(n => {
        const inc = incoming[n.id] || [];
        let drive = 0, touched = false;
        inc.forEach(s => {
          if (fired.has(s.from)) { drive += s.weight; touched = true; }
        });
        if (!touched) return;
        const dt = t - last[n.id];
        mem[n.id] = mem[n.id] * Math.pow(n.leak, dt) + drive;
        last[n.id] = t;
        if (mem[n.id] >= n.threshold) {
          mem[n.id] = 0;
          fired.add(n.id);
          if (n.kind === 'output') out.push({ t, id: n.id });
          graph.synapses.forEach(s => {
            if (s.from === n.id && s.delay > 0 && t + s.delay < steps) pending[t + s.delay].push({ id: n.id });
          });
        }
      });
    });
  }
  return { outputSpikes: out, spikeCount: out.length, synthetic: true };
}

function scoreHeldOut(data, graph) {
  let correct = 0;
  const details = [];
  data.heldOut.forEach(index => {
    const example = data.examples[index];
    const coded = encodeSpikes(example, data.params.steps);
    const run = simulateEvents(graph, coded.events, data.params.steps);
    const predicted = run.outputSpikes.length > 0 ? 1 : 0;
    const target = example.label ? 1 : 0;
    const ok = predicted === target;
    if (ok) correct++;
    details.push({ index, target, predicted, spikes: run.spikeCount, ok });
  });
  const n = details.length || 1;
  return {
    synthetic: true,
    heldOut: data.heldOut.length,
    train: data.train.length,
    pipelineMatch: details.length ? correct / details.length : 0,
    details,
    neurons: graph.neurons.length,
    synapses: graph.synapses.length,
    note: NOTE,
    n,
  };
}

function graphFor(kind, channels) {
  const readout = compileReadout(Math.max(1, channels));
  if (kind === 'vision' || kind === 'graph') {
    const coin = compileModule(moduleSpec('coincidence'), readout.neurons.length);
    return compose([readout, coin]);
  }
  if (kind === 'sequence' || kind === 'control') {
    const seq = compileModule(moduleSpec('sequence'), readout.neurons.length);
    return compose([readout, seq]);
  }
  return readout;
}

function runOne(kind, raw) {
  const data = generate(kind, raw);
  const sample = data.examples[0];
  const coded = encodeSpikes(sample, data.params.steps);
  const graph = graphFor(kind, coded.channels);
  const score = scoreHeldOut(data, graph);
  const preview = kind === 'graph'
    ? { nodes: sample.features.length, edges: sample.relations.length, label: sample.labelName }
    : { label: sample.labelName, values: Array.isArray(sample.values[0]) ? sample.values.length : sample.values.length };
  return {
    synthetic: true,
    kind,
    seed: data.seed,
    shape: data.shape,
    train: data.train,
    heldOut: data.heldOut,
    spikeEvents: coded.events.length,
    channels: coded.channels,
    modules: graph.modules.map(m => m.id),
    neurons: graph.neurons.length,
    synapses: graph.synapses.length,
    partitions: [...new Set(graph.neurons.map(n => n.partition))],
    pipelineMatch: score.pipelineMatch,
    pipelineOk: Number.isFinite(score.pipelineMatch) && data.heldOut.length > 0 && data.train.length > 0,
    preview,
    note: NOTE,
  };
}

function stageAllowed(kind, passed) {
  const i = ORDER.indexOf(kind);
  if (i < 0) return false;
  return ORDER.slice(0, i).every(id => passed && passed[id]);
}
function runCurriculum(raw) {
  const seed = raw && raw.seed != null ? raw.seed : 1;
  const passed = {};
  const reports = [];
  for (const kind of ORDER) {
    if (!stageAllowed(kind, passed) && kind !== ORDER[0]) break;
    const report = runOne(kind, Object.assign({}, raw, { seed, kind }));
    reports.push(report);
    if (!report.pipelineOk) break;
    passed[kind] = true;
  }
  return {
    synthetic: true,
    advancedThrough: reports.filter(r => r.pipelineOk).map(r => r.kind),
    stopped: reports.length < ORDER.length,
    reports,
    note: 'Stages advance only after the pipeline runs. That is not a quality pass on the task.',
  };
}

function runJob(job) {
  const raw = Object.assign({}, job.scenarioParams || {}, { seed: job.seed });
  if (job.curriculum) return runCurriculum(raw);
  return runOne(job.scenario, raw);
}

module.exports = {
  KINDS, ORDER, LIMITS, DEFAULTS, NOTE,
  normalize, generate, encodeSpikes, moduleSpec, compileModule, compose, compileReadout,
  simulateEvents, scoreHeldOut, runOne, runCurriculum, runJob, stageAllowed,
};
