'use strict';
/* Shared SpikeFoundry engine. The browser lab and the headless worker both load this file.
 * Scores are synthetic: a small circuit is checked against generated spike patterns.
 * They are not BugBrain reading scores and not a trained research result.
 * The untouched original page is spikefoundry/original/SpikeFoundry-SNN-Design-Lab.html. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpikeFoundry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TOPOLOGIES = ['parallel', 'memory', 'routed', 'hierarchical', 'mixed', 'deep'];
  const BASE_TASKS = {
    coincidence: { name: 'Coincidence detector', short: 'A + B together → C', desc: 'Two inputs arrive together and produce one output.', inputs: ['A', 'B'], outputs: ['C'], phase: 1, rules: [{ kind: 'coincidence', a: 0, b: 1 }] },
    sequence: { name: 'A → B sequence', short: 'A then B → C', desc: 'A fading trace lets a later B produce an output.', inputs: ['A', 'B'], outputs: ['C'], phase: 1, rules: [{ kind: 'sequence', a: 0, b: 1 }] },
    vote3: { name: '3-input vote', short: 'Any 2 of 3 → C', desc: 'Any two of three inputs arriving together trigger one output.', inputs: ['A', 'B', 'D'], outputs: ['C'], phase: 2, rules: [{ kind: 'vote', inputs: [0, 1, 2] }] },
    routing: { name: 'Two-output routing', short: 'A → C · B → F', desc: 'Two input streams stay separate and reach their own outputs.', inputs: ['A', 'B'], outputs: ['C', 'F'], phase: 3, rules: [{ kind: 'direct', a: 0 }, { kind: 'direct', a: 1 }] },
    composed: { name: 'Composed 4 → 2', short: 'A+B → C · D then E → F', desc: 'A coincidence motif and a temporal motif feed separate outputs.', inputs: ['A', 'B', 'D', 'E'], outputs: ['C', 'F'], phase: 4, rules: [{ kind: 'coincidence', a: 0, b: 1 }, { kind: 'sequence', a: 2, b: 3 }] },
    context3: { name: 'Context channels', short: 'A+B → C · D→E → F · G → H', desc: 'Three pathways combine coincidence, sequence, and a context input.', inputs: ['A', 'B', 'D', 'E', 'G'], outputs: ['C', 'F', 'H'], phase: 5, rules: [{ kind: 'coincidence', a: 0, b: 1 }, { kind: 'sequence', a: 2, b: 3 }, { kind: 'context', a: 0, b: 1, c: 4 }] },
    nested: { name: 'Nested composition', short: 'AB + GH → J · DE → F', desc: 'A deeper circuit reuses subcircuits and combines their signals.', inputs: ['A', 'B', 'D', 'E', 'G', 'H'], outputs: ['C', 'F', 'J'], phase: 6, rules: [{ kind: 'coincidence', a: 0, b: 1 }, { kind: 'sequence', a: 2, b: 3 }, { kind: 'nested', a: 0, b: 1, c: 4, d: 5 }] },
  };
  function ruleDepth(rule) { return rule.kind === 'coincidence' || rule.kind === 'vote' || rule.kind === 'direct' ? 1 : rule.kind === 'nested' ? 3 : 2; }
  function ruleNodes(rule) { return rule.kind === 'nested' ? 4 : rule.kind === 'sequence' || rule.kind === 'context' ? 2 : rule.kind === 'coincidence' ? 1 : 0; }
  for (const t of Object.values(BASE_TASKS)) {
    t.seqLen = 6;
    t.requiredDepth = Math.max(1, ...t.rules.map(ruleDepth));
    t.requiredHidden = t.rules.reduce((n, r) => n + ruleNodes(r), 0);
  }
  const LAB_BUDGET = { items: 4, trainTrials: 6, valTrials: 8, variants: 1, maxPhase: 6 };
  const FULL_BUDGET = { items: 16, trainTrials: 24, valTrials: 32, variants: 3, maxPhase: 6 };
  const PILOT_BUDGET = { items: 2, trainTrials: 4, valTrials: 4, variants: 1, maxPhase: 1, tasks: ['coincidence', 'sequence'] };

  function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    const fn = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    fn.state = () => a >>> 0;
    fn.set = n => { a = (n >>> 0) || 1; };
    return fn;
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function lcg(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = (s * 48271) % 2147483647; return s / 2147483647; };
  }
  function taskList() { return Object.keys(BASE_TASKS).map(id => Object.assign({ id }, publicTask(BASE_TASKS[id]))); }
  function publicTask(t) { return { name: t.name, short: t.short, desc: t.desc, inputs: t.inputs.slice(), outputs: t.outputs.slice(), phase: t.phase }; }

  function genome(topology, wa, wb, thr, decay, nodes, depth) {
    const g = { topology, wa: clamp(wa, .25, 2.2), wb: clamp(wb, .25, 2.2), thr: clamp(thr, .5, 3.1), decay: clamp(decay, .15, .95) };
    if (nodes != null) g.nodes = clamp(Math.round(nodes), 1, 40);
    if (depth != null) g.depth = clamp(Math.round(depth), 1, 6);
    return g;
  }
  function randomGenome(taskId, rng) {
    const t = BASE_TASKS[taskId];
    const top = TOPOLOGIES[Math.floor(rng() * TOPOLOGIES.length)];
    if (t && t.rules) {
      const deep = ['deep', 'hierarchical', 'deep', 'hierarchical', 'mixed', 'memory'][Math.floor(rng() * 6)];
      return genome(deep, 1.2 + rng() * .45, 1.2 + rng() * .45, 1.55 + rng() * .35, .38 + rng() * .24, Math.max(1, t.requiredHidden - 2 + rng() * 4), 1 + rng() * t.requiredDepth);
    }
    return genome(top, .35 + rng() * 1.45, .35 + rng() * 1.45, .65 + rng() * 1.85, .25 + rng() * .63);
  }
  function mutate(g, taskId, rng) {
    const t = BASE_TASKS[taskId];
    const n = Object.assign({}, g);
    const k = Math.floor(rng() * (g.nodes ? 7 : 5));
    if (k === 0) n.topology = TOPOLOGIES[Math.floor(rng() * TOPOLOGIES.length)];
    if (k === 1) n.wa += rng() * .96 - .48;
    if (k === 2) n.wb += rng() * .96 - .48;
    if (k === 3) n.thr += rng() * .9 - .45;
    if (k === 4) n.decay += rng() * .36 - .18;
    if (k === 5) n.nodes = (g.nodes || 1) + (rng() < .5 ? -1 : 1);
    if (k === 6) n.depth = (g.depth || 1) + (rng() < .5 ? -1 : 1);
    return genome(n.topology, n.wa, n.wb, n.thr, n.decay, g.nodes ? n.nodes : null, g.nodes ? n.depth : null);
  }
  function features(g, taskId) {
    const t = BASE_TASKS[taskId];
    const motifs = [0, 0, 0, 0, 0, 0, 0];
    const idx = Object.keys(BASE_TASKS).indexOf(taskId);
    if (idx >= 0) motifs[idx] = 1;
    return TOPOLOGIES.map(x => +(g.topology === x)).concat([(g.wa - .25) / 1.95, (g.wb - .25) / 1.95, (g.thr - .5) / 2.6, (g.decay - .15) / .8, t.inputs.length / 24, t.outputs.length / 12], motifs);
  }
  function sigmoid(x) { return 1 / (1 + Math.exp(-clamp(x, -20, 20))); }
  function makeMLP(rng) {
    return {
      W1: Array.from({ length: 20 }, () => Array.from({ length: 19 }, () => rng() * .6 - .3)),
      b1: Array(20).fill(0),
      W2: Array.from({ length: 20 }, () => rng() * .5 - .25),
      b2: 0, loss: .25, n: 0,
    };
  }
  function forward(model, x) {
    const h = model.W1.map((w, i) => Math.tanh(w.reduce((s, v, j) => s + v * x[j], model.b1[i])));
    return { h, y: sigmoid(model.W2.reduce((s, w, i) => s + w * h[i], model.b2)) };
  }
  function train(model, x, target, lr) {
    lr = lr == null ? .04 : lr;
    const { h, y } = forward(model, x), err = y - target;
    model.loss = model.n ? model.loss * .94 + err * err * .06 : err * err;
    model.n++;
    const grad = err * y * (1 - y);
    for (let i = 0; i < 20; i++) {
      const d = grad * model.W2[i];
      model.W2[i] -= lr * grad * h[i];
      const z = d * (1 - h[i] * h[i]);
      for (let j = 0; j < 19; j++) model.W1[i][j] -= lr * z * x[j];
      model.b1[i] -= lr * z;
    }
    model.b2 -= lr * grad;
  }

  function syntheticSequence(taskId, index, variant, training, rng) {
    const t = BASE_TASKS[taskId];
    const rnd = training ? rng : lcg((((index + 1) * 991 + variant * 9187 + taskId.length * 271) % 2147483646) + 1);
    const len = t.seqLen, rate = [.04, .08, .14, .22][Math.floor(rnd() * 4)];
    const seq = Array.from({ length: len }, () => Array.from({ length: t.inputs.length }, () => rnd() < rate ? 1 : 0));
    const rule = t.rules[Math.floor((index + variant) % t.rules.length)], mode = (index + variant) % 4;
    const clear = ids => { for (const c of ids) for (const row of seq) row[c] = 0; };
    const at = (ch, step) => { if (step >= 0 && step < len) seq[step][ch] = 1; };
    const pos = () => Math.floor(rnd() * len);
    const gap = () => 1 + Math.floor(rnd() * Math.max(1, Math.min(4, len - 1)));
    if (rule.kind === 'coincidence') { clear([rule.a, rule.b]); const x = pos(), y = (x + gap()) % len; if (mode === 0) { at(rule.a, x); at(rule.b, x); } else { at(rule.a, x); at(rule.b, y); } }
    else if (rule.kind === 'sequence') { clear([rule.a, rule.b]); const x = pos(), y = (x + gap()) % len; if (mode === 0 || mode === 2) { at(rule.a, x); at(rule.b, y); } else { at(rule.b, x); at(rule.a, y); } }
    else if (rule.kind === 'context') { clear([rule.a, rule.b, rule.c]); const x = pos(), y = (x + gap()) % len; if (mode === 0 || mode === 2) { at(rule.a, x); at(rule.b, x); if (mode === 0) at(rule.c, y); } else { at(rule.a, x); at(rule.b, y); at(rule.c, x); } }
    else if (rule.kind === 'nested') { clear([rule.a, rule.b, rule.c, rule.d]); const x = pos(), y = (x + gap()) % len, z = (y + gap()) % len; if (mode === 0 || mode === 2) { at(rule.a, x); at(rule.b, x); at(rule.c, y); at(rule.d, z); } else if (mode === 1) { at(rule.a, x); at(rule.b, x); at(rule.d, y); at(rule.c, z); } else { at(rule.a, x); at(rule.c, y); at(rule.d, z); } }
    else if (rule.kind === 'vote') { clear(rule.inputs); const x = pos(), chosen = mode === 0 ? rule.inputs.slice(0, 2) : rule.inputs.slice(0, 1); for (const c of chosen) at(c, x); }
    else if (rule.kind === 'direct') { clear([rule.a]); if (mode !== 1) at(rule.a, pos()); }
    return seq;
  }
  function targetFor(taskId, seq) {
    const t = BASE_TASKS[taskId];
    return t.rules.map(r => {
      const present = x => seq.some(row => row[x]);
      const coinc = (a, b) => seq.some(row => row[a] && row[b]);
      const ordered = (a, b) => { let seen = false; for (const row of seq) { if (seen && row[b]) return true; if (row[a]) seen = true; } return false; };
      if (r.kind === 'coincidence') return coinc(r.a, r.b) ? 1 : 0;
      if (r.kind === 'sequence') return ordered(r.a, r.b) ? 1 : 0;
      if (r.kind === 'context') return coinc(r.a, r.b) && present(r.c) ? 1 : 0;
      if (r.kind === 'nested') return coinc(r.a, r.b) && ordered(r.c, r.d) ? 1 : 0;
      if (r.kind === 'vote') return seq.some(row => r.inputs.reduce((n, c) => n + (row[c] || 0), 0) >= 2) ? 1 : 0;
      return present(r.a) ? 1 : 0;
    });
  }
  function makeSample(taskId, index, validation, variant, rng) {
    const seq = syntheticSequence(taskId, index, variant, !validation, rng);
    let label = targetFor(taskId, seq);
    if (!validation && rng() < .12) {
      const row = Math.floor(rng() * seq.length), ch = Math.floor(rng() * seq[row].length);
      seq[row][ch] = 1 - seq[row][ch];
      label = targetFor(taskId, seq);
    }
    return { seq, label };
  }
  function compileSNN(g, taskId) {
    const t = BASE_TASKS[taskId];
    const depth = clamp(g.depth || 1, 1, Math.max(1, t.requiredDepth));
    const budget = Math.max(0, g.nodes || 0);
    const nodes = t.inputs.map((label, i) => ({ kind: 'input', label, index: i, layer: 0, threshold: Infinity }));
    const inputIds = nodes.map((_, i) => i);
    const outputIds = t.outputs.map((label, i) => { const id = nodes.length; nodes.push({ kind: 'output', label, index: i, layer: depth + 1, threshold: g.thr }); return id; });
    const edges = [];
    let used = 0;
    const addEdge = (from, to, weight, decay) => { if (from != null && to != null && Number.isFinite(weight)) edges.push({ from, to, weight, decay: decay == null ? g.decay : decay }); };
    const addHidden = (layer, role, thresholdScale) => {
      if (used >= budget || layer > depth) return null;
      const id = nodes.length;
      nodes.push({ kind: 'hidden', label: 'H' + (used + 1), index: used, layer, role, threshold: g.thr * (thresholdScale || 1) });
      used++; return id;
    };
    const direct = (r, out) => {
      const ins = r.kind === 'vote' ? r.inputs : r.kind === 'nested' ? [r.a, r.b, r.c, r.d] : r.kind === 'context' ? [r.a, r.b, r.c] : r.kind === 'sequence' ? [r.a, r.b] : [r.a];
      ins.forEach((ch, i) => addEdge(inputIds[ch], out, i % 2 ? g.wb : g.wa, .12));
    };
    t.rules.forEach((r, j) => {
      const out = outputIds[j];
      const full = g.topology === 'deep' || g.topology === 'hierarchical';
      const memory = g.topology === 'memory' && ['sequence', 'coincidence', 'direct'].includes(r.kind);
      const mixed = g.topology === 'mixed' && ['coincidence', 'sequence', 'context', 'direct'].includes(r.kind);
      if (g.topology === 'parallel' || g.topology === 'routed' || !(full || memory || mixed) || r.kind === 'vote' || r.kind === 'direct') { direct(r, out); return; }
      if (r.kind === 'coincidence') {
        const h = addHidden(1, 'coincidence'); if (h == null) { direct(r, out); return; }
        addEdge(inputIds[r.a], h, g.wa); addEdge(inputIds[r.b], h, g.wb); addEdge(h, out, Math.max(g.wa, g.wb) * 1.5);
      } else if (r.kind === 'sequence') {
        const h1 = addHidden(1, 'trace', .68), h2 = addHidden(2, 'sequence');
        if (h1 != null) addEdge(inputIds[r.a], h1, g.wa * 1.5);
        if (h2 != null && h1 != null) { addEdge(h1, h2, g.wa); addEdge(inputIds[r.b], h2, g.wb, .08); addEdge(h2, out, Math.max(g.wa, g.wb) * 1.5); }
        else if (h1 != null) addEdge(h1, out, Math.max(g.wa, g.wb) * 1.5); else direct(r, out);
      } else if (r.kind === 'context') {
        const h1 = addHidden(1, 'pair'), h2 = addHidden(2, 'context');
        if (h1 != null) { addEdge(inputIds[r.a], h1, g.wa); addEdge(inputIds[r.b], h1, g.wb); }
        if (h2 != null && h1 != null) { addEdge(h1, h2, g.wa); addEdge(inputIds[r.c], h2, g.wb); addEdge(h2, out, Math.max(g.wa, g.wb) * 1.5); }
        else if (h1 != null) addEdge(h1, out, Math.max(g.wa, g.wb) * 1.5); else direct(r, out);
      } else if (r.kind === 'nested') {
        const h1 = addHidden(1, 'pair'), h2 = addHidden(1, 'trace', .68), h3 = addHidden(2, 'ordered'), h4 = addHidden(3, 'join');
        if (h1 != null) { addEdge(inputIds[r.a], h1, g.wa); addEdge(inputIds[r.b], h1, g.wb); }
        if (h2 != null) addEdge(inputIds[r.c], h2, g.wa * 1.5);
        if (h3 != null && h2 != null) { addEdge(h2, h3, g.wa); addEdge(inputIds[r.d], h3, g.wb, .08); }
        if (h4 != null && h1 != null && h3 != null) { addEdge(h1, h4, g.wa); addEdge(h3, h4, g.wb); addEdge(h4, out, Math.max(g.wa, g.wb) * 1.5); }
        else if (h3 != null) addEdge(h3, out, Math.max(g.wa, g.wb) * 1.5);
        else if (h1 != null) addEdge(h1, out, Math.max(g.wa, g.wb) * 1.5); else direct(r, out);
      }
    });
    return { nodes, edges, inputIds, outputIds, depth, leak: g.decay, threshold: g.thr, topology: g.topology };
  }
  function simulateSNN(net, seq) {
    const count = net.nodes.length, syn = Array(net.edges.length).fill(0);
    let spikes = Array(count).fill(0), mem = Array(count).fill(0);
    const fired = Array(net.outputIds.length).fill(false), first = Array(net.outputIds.length).fill(null);
    let total = 0;
    const steps = seq.length + net.depth + 2;
    for (let t = 0; t < steps; t++) {
      for (let i = 0; i < net.inputIds.length; i++) spikes[net.inputIds[i]] = t < seq.length ? (seq[t][i] || 0) : 0;
      const drive = Array(count).fill(0);
      for (let e = 0; e < net.edges.length; e++) { const edge = net.edges[e]; syn[e] = edge.decay * syn[e] + (spikes[edge.from] ? edge.weight : 0); drive[edge.to] += syn[e]; }
      const next = Array(count).fill(0);
      for (let i = 0; i < net.inputIds.length; i++) next[net.inputIds[i]] = spikes[net.inputIds[i]];
      for (let i = 0; i < count; i++) {
        const n = net.nodes[i]; if (n.kind === 'input') continue;
        mem[i] = net.leak * mem[i] + drive[i];
        if (mem[i] >= n.threshold) { next[i] = 1; mem[i] = 0; total++; if (n.kind === 'output') { fired[n.index] = true; if (first[n.index] === null) first[n.index] = t; } }
      }
      spikes = next;
    }
    return { outputs: fired.map(Boolean), firstSpike: first, spikeCount: total };
  }
  function scoreDesign(g, taskId, validation, variant, budget, rng) {
    const n = validation ? (budget.valTrials || 8) : (budget.trainTrials || 6);
    let exact = 0, fp = 0, fn = 0, tp = 0, tn = 0, spikes = 0, latencies = 0, latencyN = 0;
    const net = compileSNN(g, taskId);
    for (let i = 0; i < n; i++) {
      const sample = makeSample(taskId, i, validation, variant || 0, rng);
      const run = simulateSNN(net, sample.seq);
      if (run.outputs.every((v, j) => v === !!sample.label[j])) exact++;
      spikes += run.spikeCount;
      for (let j = 0; j < run.outputs.length; j++) {
        if (run.outputs[j] && sample.label[j]) tp++;
        else if (run.outputs[j]) fp++;
        else if (sample.label[j]) fn++;
        else tn++;
        if (run.firstSpike[j] !== null) { latencies += run.firstSpike[j]; latencyN++; }
      }
    }
    const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1), f1 = 2 * precision * recall / (precision + recall || 1);
    const accuracy = exact / n, complexity = net.nodes.length + net.edges.length, meanSpikes = spikes / n;
    const quality = clamp(accuracy - .0015 * complexity - .00025 * meanSpikes, 0, 1);
    return { accuracy, precision, recall, f1, falseSpikes: fp, missedSpikes: fn, spikes, meanSpikes, meanLatency: latencyN ? latencies / latencyN : 0, n, complexity, neurons: net.nodes.length, synapses: net.edges.length, quality, trueNegatives: tn, synthetic: true };
  }
  function robustScore(g, taskId, budget, rng) {
    const variants = budget.variants || 1;
    const runs = [];
    for (let v = 0; v < variants; v++) runs.push(scoreDesign(g, taskId, true, v, budget, rng));
    const avg = k => runs.reduce((s, r) => s + r[k], 0) / runs.length;
    return Object.assign({}, runs[0], { accuracy: avg('accuracy'), precision: avg('precision'), recall: avg('recall'), f1: avg('f1'), meanSpikes: avg('meanSpikes'), meanLatency: avg('meanLatency'), quality: Math.min(...runs.map(r => r.quality)), n: runs.reduce((s, r) => s + r.n, 0), synthetic: true });
  }

  function blankMaps() {
    const best = {}, candidates = {}, bestByTopology = {};
    for (const id of Object.keys(BASE_TASKS)) { best[id] = null; candidates[id] = []; bestByTopology[id] = {}; }
    return { best, candidates, bestByTopology };
  }
  function createState(seed, budget) {
    const rng = mulberry32(seed == null ? 1 : seed);
    const maps = blankMaps();
    const preview = {};
    for (const id of Object.keys(BASE_TASKS)) preview[id] = randomGenome(id, rng);
    return {
      seed: seed == null ? 1 : seed >>> 0, rng, model: makeMLP(rng), batch: 0, tested: 0, examples: 0,
      activePhase: 1, selectedTask: 'coincidence', history: [], logs: [], explore: .35, preview, evaluations: [],
      best: maps.best, candidates: maps.candidates, bestByTopology: maps.bestByTopology,
      budget: Object.assign({}, LAB_BUDGET, budget || {}),
      note: 'Synthetic spike-pattern match. Not a BugBrain accuracy.',
    };
  }
  function activeTasks(state) {
    const allow = state.budget.tasks;
    return Object.keys(BASE_TASKS).filter(id => {
      const t = BASE_TASKS[id];
      if (allow && allow.indexOf(id) < 0) return false;
      return t.phase <= (state.budget.maxPhase || 6) && t.phase <= state.activePhase;
    });
  }
  function designSignature(g) { return [g.topology, g.nodes || 0, g.depth || 1, g.wa.toFixed(2), g.wb.toFixed(2), g.thr.toFixed(2), g.decay.toFixed(2)].join('|'); }
  function makeCandidate(state, taskId) {
    const parent = state.best[taskId] && state.best[taskId].g;
    if (state.rng() < state.explore || !parent) return randomGenome(taskId, state.rng);
    const proposals = Array.from({ length: 4 }, () => mutate(parent, taskId, state.rng));
    proposals.sort((a, b) => (forward(state.model, features(b, taskId)).y + state.explore * state.rng() * .32) - (forward(state.model, features(a, taskId)).y + state.explore * state.rng() * .32));
    return proposals[0];
  }
  function runBatch(state) {
    const budget = state.budget;
    const pool = activeTasks(state);
    if (!pool.length) throw new Error('No SpikeFoundry task is eligible for this budget.');
    state.batch++;
    const items = [];
    const nItems = budget.items || 4;
    for (let i = 0; i < nItems; i++) {
      const task = pool[i % pool.length];
      const g = makeCandidate(state, task);
      const x = features(g, task);
      const started = Date.now();
      const train = scoreDesign(g, task, false, 0, budget, state.rng);
      const validation = robustScore(g, task, budget, state.rng);
      const evalMs = Date.now() - started;
      items.push({ task, g, x, train, validation, evalMs });
    }
    for (const item of items) {
      train(state.model, item.x, item.train.quality);
      state.tested++; state.examples += item.train.n;
      const candidate = { id: state.batch + '-' + item.task, task: item.task, g: item.g, score: item.validation.quality, accuracy: item.validation.accuracy, f1: item.validation.f1, neurons: item.validation.neurons, synapses: item.validation.synapses, n: item.validation.n, synthetic: true, batch: state.batch };
      const list = state.candidates[item.task];
      const signature = designSignature(item.g);
      if (!list.some(old => designSignature(old.g) === signature)) { list.unshift(candidate); if (list.length > 8) list.length = 8; }
      const prevTop = state.bestByTopology[item.task][item.g.topology];
      if (!prevTop || candidate.score > prevTop.score) state.bestByTopology[item.task][item.g.topology] = candidate;
      const old = state.best[item.task];
      if (!old || item.validation.quality > old.score) state.best[item.task] = candidate;
      if (!state.evaluations) state.evaluations = [];
      state.evaluations.push({
        taskId: item.task, taskVersion: 'base-1', genome: item.g,
        metrics: { quality: item.validation.quality, accuracy: item.validation.accuracy, f1: item.validation.f1, precision: item.validation.precision, recall: item.validation.recall },
        neurons: item.validation.neurons, synapses: item.validation.synapses,
        spikes: Math.round(item.validation.spikes || 0), evalMs: item.evalMs || 0, seed: state.seed,
      });
      if (state.evaluations.length > 64) state.evaluations.shift();
    }
    const phaseTasks = pool.filter(id => BASE_TASKS[id].phase === state.activePhase);
    if (phaseTasks.length && phaseTasks.every(id => state.best[id] && state.best[id].score >= .91) && state.activePhase < (budget.maxPhase || 6)) state.activePhase++;
    const evaluated = Object.keys(state.best).filter(id => state.best[id]).map(id => state.best[id].score);
    const batchMean = items.reduce((s, item) => s + item.validation.quality, 0) / items.length;
    const bestMean = evaluated.reduce((s, v) => s + v, 0) / Math.max(1, evaluated.length);
    state.history.push({ batch: state.batch, batchMean: +(batchMean * 100).toFixed(2), bestMean: +(bestMean * 100).toFixed(2) });
    if (state.history.length > 100) state.history.shift();
    const shown = items[0];
    state.logs.push({ batch: state.batch, task: shown.task, score: Math.round(shown.validation.quality * 100), text: BASE_TASKS[shown.task].name + ' · synthetic match ' + Math.round(shown.validation.accuracy * 100) + '%' });
    if (state.logs.length > 20) state.logs.shift();
    state.lastBatch = { batch: state.batch, items: items.length, batchMean: state.history[state.history.length - 1].batchMean, synthetic: true };
    return state.lastBatch;
  }
  function checkpoint(state) {
    return {
      format: 'spikefoundry-engine-checkpoint', schemaVersion: 1, synthetic: true,
      seed: state.seed, rngState: state.rng.state(), batch: state.batch, tested: state.tested, examples: state.examples,
      activePhase: state.activePhase, selectedTask: state.selectedTask, explore: state.explore, budget: state.budget,
      history: state.history.slice(), logs: state.logs.slice(), preview: state.preview,
      best: state.best, candidates: state.candidates, bestByTopology: state.bestByTopology,
      model: { W1: state.model.W1, b1: state.model.b1, W2: state.model.W2, b2: state.model.b2, loss: state.model.loss, n: state.model.n },
      note: state.note,
    };
  }
  function restore(doc) {
    if (!doc || doc.format !== 'spikefoundry-engine-checkpoint' || doc.schemaVersion !== 1) throw new Error('Not a SpikeFoundry engine checkpoint.');
    const state = createState(doc.seed, doc.budget);
    state.rng.set(doc.rngState);
    state.batch = doc.batch; state.tested = doc.tested; state.examples = doc.examples;
    state.activePhase = doc.activePhase; state.selectedTask = doc.selectedTask; state.explore = doc.explore;
    state.history = doc.history || []; state.logs = doc.logs || []; state.preview = doc.preview || state.preview;
    state.best = doc.best; state.candidates = doc.candidates; state.bestByTopology = doc.bestByTopology;
    state.model = doc.model;
    return state;
  }
  function summary(state) {
    const rows = Object.keys(BASE_TASKS).filter(id => state.best[id]).map(id => ({
      task: id, name: BASE_TASKS[id].name, syntheticScore: state.best[id].score, syntheticMatch: state.best[id].accuracy,
      neurons: state.best[id].neurons, synapses: state.best[id].synapses, batch: state.best[id].batch,
    }));
    return { synthetic: true, batches: state.batch, tested: state.tested, phase: state.activePhase, tasks: rows, note: 'Synthetic spike-pattern match on generated examples. Not BugBrain accuracy.' };
  }
  function network(g, taskId) { return compileSNN(g, taskId); }
  function sampleCase(taskId, index) {
    const sample = makeSample(taskId, index || 0, true, 0, mulberry32(1));
    return { task: publicTask(BASE_TASKS[taskId]), seq: sample.seq, label: sample.label, synthetic: true };
  }

  return { TOPOLOGIES, LAB_BUDGET, FULL_BUDGET, PILOT_BUDGET, taskList, createState, runBatch, checkpoint, restore, summary, scoreDesign, robustScore, network, sampleCase, compileSNN, simulateSNN, BASE_TASKS };
});
