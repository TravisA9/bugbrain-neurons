'use strict';
/* Compact design-library records. The genome JSON is canonical so the hash matches PHP. */
const crypto = require('crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).sort().forEach(key => { out[key] = stable(value[key]); });
    return out;
  }
  return value;
}
function genomeJson(genome) {
  return JSON.stringify(stable(genome));
}
function genomeHash(genome) {
  return crypto.createHash('sha256').update(genomeJson(genome)).digest('hex');
}
function fromEvaluations(rows, meta) {
  meta = meta || {};
  const out = [];
  for (let i = 0; i < rows.length && out.length < 48; i++) {
    const row = rows[i];
    if (!row || !row.genome || !row.taskId) continue;
    const json = genomeJson(row.genome);
    if (json.length > 4000) continue;
    out.push({
      taskId: String(row.taskId),
      taskVersion: String(row.taskVersion || 'base-1'),
      genomeJson: json,
      genomeHash: genomeHash(row.genome),
      genomeVersion: row.genome && row.genome.v === 2 ? 2 : 1,
      metrics: Object.assign({}, row.metrics || {}, { arm: (row.metrics && row.metrics.arm) || row.arm || 'designer' }),
      neurons: row.neurons || 0,
      synapses: row.synapses || 0,
      spikes: row.spikes || 0,
      evalMs: row.evalMs || 0,
      seed: row.seed || 0,
      jobId: meta.jobId || '',
      engineVersion: meta.engineVersion || 'spikefoundry-1',
    });
  }
  return out;
}

module.exports = { stable, genomeJson, genomeHash, fromEvaluations };
