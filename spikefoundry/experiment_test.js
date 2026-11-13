'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { sampleSets, canonicalCircuit, validCircuit } = require('./experiment');
const { chain, parallel, relay, dualSequenceCases, scoreComposition, sequenceLatch, compositionCheck } = require('./composition');
const Genome = require('./genome_v2');
const Runner = require('./run');
const { runSpec } = require('../run/coord');

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
const branch = chain([sequenceLatch(), relay(), relay()]);
const dual = dualSequenceCases(suites[0].shifted, suites[1].shifted);
assert.equal(new Set(dual.map(c => c.label.join())).size, 4);
assert.deepEqual(scoreComposition(parallel([branch, branch]), dual), { accuracy: 1, recall: [1, 1] });

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sequence-experiment-test-'));
let sharedSnapshot;
let expectedReport;
try {
  const job = { kind: 'spikefoundry', mode: 'sequence-experiment', seed: 1729, experiment: { rounds: 3, cpuBudgetMs: 200, cap: 500 } };
  const summary = Runner.execute(job, out);
  assert.equal(summary.research.rounds.length, 3);
  if (!summary.research.approved) assert.equal(summary.research.transfer.status, 'awaiting-approved-checkpoint');
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
  sharedSnapshot = { completedRounds: 3, payload: gzipSync(fs.readFileSync(path.join(out, 'experiment.json'))).toString('base64') };
  expectedReport = summary.research;
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}

async function checkDonorResume() {
  const replacement = fs.mkdtempSync(path.join(os.tmpdir(), 'sequence-replacement-test-'));
  try {
    const result = await runSpec({
      id: 'sequence-test', runner: 'spikefoundry/run.js',
      spec: { seed: 1729, mode: 'sequence-experiment', experiment: { studyVersion: 2, rounds: 3, cpuBudgetMs: 200, cap: 500 } },
    }, { outDir: replacement, stdio: 'ignore', studyCheckpoint: async () => ({ snapshot: sharedSnapshot }) });
    assert.deepEqual(result.research, JSON.parse(JSON.stringify(expectedReport)));
    assert.equal(fs.existsSync(path.join(replacement, 'evaluations.jsonl')), false);
  } finally {
    fs.rmSync(replacement, { recursive: true, force: true });
  }
}

checkDonorResume().then(() => console.log('Sequence experiment checks passed'), error => {
  console.error(error);
  process.exitCode = 1;
});
