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
/* Canonical design hash: the same circuit gives the same hash however its parts are listed. Object keys are
 * sorted, the module and wire lists are sorted (they are sets), and numbers are written with at most 6 decimals.
 * PHP App::designHash() writes the exact same text, so the server and the worker agree. */
const SET_LISTS = { modules: true, wires: true, neurons: true, synapses: true };
function canonNumber(x) {
  if (!isFinite(x)) return 'null';
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x === 0 ? 0 : x);
  let s = x.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
}
function canonText(value, key) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return canonNumber(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts = value.map(item => canonText(item, ''));
    if (key && SET_LISTS[key]) parts.sort();
    return '[' + parts.join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonText(value[k], k)).join(',') + '}';
}
function designHash(genome) {
  return crypto.createHash('sha256').update(canonText(genome, '')).digest('hex');
}
function fromEvaluations(rows, meta) {
  meta = meta || {};
  const out = [];
  for (let i = 0; i < rows.length && out.length < 100000; i++) {
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

module.exports = { stable, genomeJson, genomeHash, designHash, canonText, fromEvaluations };
