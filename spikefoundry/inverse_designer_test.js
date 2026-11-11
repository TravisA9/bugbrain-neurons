'use strict';

const assert = require('node:assert/strict');
const { encode, design, study, packModel, sharedStudy } = require('./inverse_designer');
const { designTruthTable, output, probe, temporalCircuit } = require('./inverse_circuits');

for (const value of [0, 1]) {
  const table = Array.from({ length: 16 }, (_, i) => ({ x: probe(i, 4, 1)[0], y: i === 0 ? 1 - value : value }));
  const circuit = designTruthTable(table.slice().reverse());
  assert.deepEqual(table.map(({ x }) => output(circuit, [x])), table.map(({ y }) => y));
  assert.throws(() => designTruthTable([...table.slice(1), table[1]]), /Duplicate/);
}

const example = { x: probe(5), y: 1 };
const other = { x: probe(12), y: 0 };
const encoded = encode([example, other]);
assert.deepEqual(encoded, encode([other, example]));
assert.equal(encoded[5], 1);
assert.equal(encoded[12], -1);
assert.equal(encoded[0], 0);
assert.throws(() => encode([example, { ...example, y: 0 }]), /Conflicting/);

const { model, report } = study({ seed: 123, epochs: 2, demoCount: 32, count: 3 });
assert.equal(report.truthTables.exact, report.truthTables.tested);
assert.ok(report.trainTasks > 0 && report.testTasks > 0);
const test = report.results[0];
assert.equal(test.freshCount, 224);
const prediction = design(JSON.parse(JSON.stringify(model)), test.examples, 3);
assert.deepEqual(prediction.genes, test.learned.genes);
assert.deepEqual(prediction.circuit, temporalCircuit(prediction.genes));
assert.equal(prediction.demoAccuracy, test.learned.demoAccuracy);
const packed = packModel(model);
assert.ok(packed.payload.length < 58000);
assert.deepEqual(design(packed, test.examples, 3), prediction);
const first = sharedStudy(1729, { benchmark: 'inverse-shared-1', generation: 0, checkpoint: null });
const next = sharedStudy(1730, { benchmark: 'inverse-shared-1', generation: 1, checkpoint: packModel(first.model) });
assert.equal(first.report.promotion.candidate.length, 36);
assert.equal(next.report.promotion.auditTrials, 36);
assert.deepEqual(next.report.promotion.incumbent, first.report.promotion.candidate);
assert.equal(next.report.promotion.incumbentAuditPassed, first.report.promotion.auditPassed);
assert.equal(next.report.epochs, 60);
console.log('Inverse designer checks passed');
