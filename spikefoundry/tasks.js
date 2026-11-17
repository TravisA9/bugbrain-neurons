'use strict';
/* Machine-readable task specs. The feature vector is fixed length so a small model can read any task. */
const SF = require('./engine.js');
const Scenarios = require('./scenarios.js');

const FEATURE_LENGTH = 24;
const FAMILIES = ['toy', 'visual', 'sequential', 'graph', 'control'];
const ENCODINGS = ['binary', 'rate', 'latency'];

function toySpec(id) {
  const t = SF.BASE_TASKS[id];
  if (!t) return null;
  const examples = [];
  for (let i = 0; i < 2; i++) {
    const sample = SF.sampleCase(id, i);
    examples.push({ input: sample.seq, output: sample.label });
  }
  return {
    id: id,
    version: 'base-1',
    family: 'toy',
    difficulty: t.phase,
    inputs: { count: t.inputs.length, encoding: 'binary' },
    outputs: { count: t.outputs.length },
    timing: { steps: t.seqLen, maxLatency: t.seqLen },
    memory: { hidden: t.requiredHidden },
    examples: examples,
  };
}

function scenarioSpec(kind) {
  const data = Scenarios.generate(kind, { seed: 1, batch: 2 });
  const family = kind === 'vision' ? 'visual' : kind === 'sequence' ? 'sequential' : kind === 'graph' ? 'graph' : 'control';
  const examples = data.examples.slice(0, 2).map(example => {
    const spikes = Scenarios.encodeSpikes(example, data.params.steps || 6);
    return { input: spikes.events.slice(0, 8), output: example.label };
  });
  const inputCount = kind === 'vision'
    ? data.params.channels * data.params.height * data.params.width
    : kind === 'sequence' ? data.params.hidden
    : kind === 'graph' ? data.params.nodes * data.params.features
    : data.params.obs;
  return {
    id: 'scenario-' + kind,
    version: 'scenario-1',
    family: family,
    difficulty: 7,
    inputs: { count: inputCount, encoding: 'latency' },
    outputs: { count: 1 },
    timing: { steps: data.params.steps, maxLatency: data.params.steps },
    memory: { hidden: Math.min(8, inputCount) },
    examples: examples,
    shape: data.shape,
    synthetic: true,
  };
}

function allSpecs() {
  const specs = Object.keys(SF.BASE_TASKS).map(toySpec);
  Scenarios.KINDS.forEach(kind => specs.push(scenarioSpec(kind)));
  return specs;
}

function specById(id) {
  if (SF.BASE_TASKS[id]) return toySpec(id);
  if (id.indexOf('scenario-') === 0) return scenarioSpec(id.slice('scenario-'.length));
  return null;
}

function featuresOf(spec) {
  const vec = Array(FEATURE_LENGTH).fill(0);
  const family = FAMILIES.indexOf(spec.family);
  if (family >= 0) vec[family] = 1;
  vec[5] = spec.difficulty / 8;
  vec[6] = Math.min(1, spec.inputs.count / 32);
  vec[7] = Math.min(1, spec.outputs.count / 8);
  vec[8] = Math.min(1, spec.timing.steps / 16);
  vec[9] = Math.min(1, spec.timing.maxLatency / 16);
  vec[10] = Math.min(1, spec.memory.hidden / 16);
  const enc = ENCODINGS.indexOf(spec.inputs.encoding);
  if (enc >= 0) vec[11 + enc] = 1;
  vec[14] = Math.min(1, spec.examples.length / 4);
  let density = 0, outs = 0, n = 0;
  spec.examples.forEach(example => {
    n++;
    outs += Array.isArray(example.output) ? example.output.reduce((s, v) => s + (v ? 1 : 0), 0) / Math.max(1, example.output.length) : (example.output ? 1 : 0);
    if (Array.isArray(example.input) && example.input.length && Array.isArray(example.input[0])) {
      const cells = example.input.length * example.input[0].length;
      const ones = example.input.reduce((s, row) => s + row.reduce((a, v) => a + (v ? 1 : 0), 0), 0);
      density += cells ? ones / cells : 0;
    } else if (Array.isArray(example.input)) {
      density += Math.min(1, example.input.length / 8);
    }
  });
  vec[15] = n ? density / n : 0;
  vec[16] = n ? outs / n : 0;
  return vec;
}

module.exports = { FEATURE_LENGTH, FAMILIES, ENCODINGS, toySpec, scenarioSpec, allSpecs, specById, featuresOf };
