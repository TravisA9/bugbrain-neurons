'use strict';

const fs = require('node:fs');
const { fit, forward, random } = require('../spikefoundry/inverse_designer');

const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const delta = (row, phase, i, key = 'scores') => {
  const a = row[phase].edit.tasks[i][key], b = row[phase].parent.tasks[i][key];
  return Array.isArray(a) ? mean(a) - mean(b) : a - b;
};
const qualified = row => [delta(row, 'audit', 0) >= 1, delta(row, 'audit', 1) >= 0, delta(row, 'audit', 2) >= 0].every(Boolean)
  && row.audit.edit.tasks[0].scores.filter((score, i) => score > row.audit.parent.tasks[0].scores[i]).length >= 10;
const objective = row => Math.min(delta(row, 'audit', 0) - 1, delta(row, 'audit', 1), delta(row, 'audit', 2));

function features(row) {
  const metrics = ['food', 'poison', 'foodDisappearances', 'approachedAfterLoss', 'blockedAfterLoss', 'spikesPerTick'];
  const values = [
    row.parent === 'low-rate' ? 1 : -1,
    ...[0, 1].flatMap(i => [delta(row, 'screen', i), ...metrics.map(key => delta(row, 'screen', i, key))]),
  ];
  return Array.from({ length: 256 }, (_, i) => Math.tanh(values[i] ?? 0));
}

function rankReport(reports) {
  const rows = reports.filter(row => row.version === 'arena-memory-1');
  if (new Set(rows.map(row => row.seed)).size !== 16) throw Error('The comparison requires all 16 distinct memory-pilot results');
  const groups = [['leak'], ['s7'], ['motor'], ['clen', 'homeoTarget']];
  return groups.map((group, fold) => {
    const heldOut = rows.filter(row => group.includes(row.change.field));
    const train = rows.filter(row => !group.includes(row.change.field)).map(row => {
      const p = 1 / (1 + Math.exp(-objective(row) / 3));
      return { labels: features(row), targets: [[1 - p, p]] };
    });
    const models = [711, 712, 713].map(seed => fit(train, random(seed + fold), 120, 256, null, x => x, [2]));
    const best = fn => heldOut.slice().sort((a, b) => fn(b) - fn(a) || a.seed - b.seed)[0];
    const rule = best(row => Math.min(delta(row, 'screen', 0), delta(row, 'screen', 1)));
    const dnn = best(row => mean(models.map(model => forward(model, features(row)).heads[0][1])));
    const report = row => ({ seed: row.seed, qualified: qualified(row),
      audit: [0, 1, 2].map(i => delta(row, 'audit', i)) });
    return { heldOut: group, auditBudget: 1, rule: report(rule), dnn: report(dnn) };
  });
}

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
  console.log(JSON.stringify(rankReport(data.results ?? data), null, 2));
}
