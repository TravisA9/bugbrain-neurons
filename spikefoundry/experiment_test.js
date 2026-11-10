'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sampleSets, canonicalCircuit, validCircuit } = require('./experiment');
const { compositionCheck } = require('./composition');
const Genome = require('./genome_v2');
const Runner = require('./run');

const seen = new Set();
const suites = [sampleSets(123, seen), sampleSets(456, seen)];
assert.equal(seen.size, 320);
for (const suite of suites) {
  for (const cases of Object.values(suite)) {
    assert.equal(cases.filter(row => row.label[0]).length, cases.length / 2);
    for (const { seq, label } of cases) {
      const firstA = seq.findIndex(row => row[0]);
      assert.equal(label[0], Number(seq.some((row, i) => row[1] && i > firstA)));
    }
  }
}
const genome = Genome.blank(2, 1);
const circuit = canonicalCircuit(Genome.compile(genome));
genome.modules[1].motif = 'delay-line';
assert.deepEqual(canonicalCircuit(Genome.compile(genome)), circuit);
assert.equal(validCircuit(circuit), true);
assert.equal(validCircuit({ ...circuit, edges: [] }), false);

const composed = compositionCheck(suites[0].shifted, 64);
assert.deepEqual(composed, { depth: 64, neurons: 131, synapses: 131, delayModule: true, routingModule: true, composed: true });

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sequence-experiment-test-'));
try {
  const job = { kind: 'spikefoundry', mode: 'sequence-experiment', seed: 1729, experiment: { rounds: 3, cpuBudgetMs: 200, cap: 500 } };
  const summary = Runner.execute(job, out);
  assert.equal(summary.research.rounds.length, 3);
  assert.ok(summary.research.rounds.slice(1).some(round => round.testedCheckpoint));
  for (const round of summary.research.rounds.filter(round => round.testedCheckpoint)) {
    assert.ok(fs.existsSync(path.join(out, 'checkpoints', round.testedCheckpoint + '.json')));
  }
  assert.ok(Buffer.byteLength(JSON.stringify(summary.research)) < 32768);
  const journal = fs.readFileSync(path.join(out, 'evaluations.jsonl'), 'utf8');
  const keys = journal.trim().split('\n').map(line => JSON.parse(line)[0]);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(Runner.execute(job, out).research, summary.research);
  assert.equal(fs.readFileSync(path.join(out, 'evaluations.jsonl'), 'utf8'), journal);
  assert.throws(() => Runner.execute({ ...job, seed: 1730 }, out), /configuration changed/);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
console.log('Sequence experiment checks passed');
