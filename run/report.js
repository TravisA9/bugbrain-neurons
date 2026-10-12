#!/usr/bin/env node
'use strict';
/* run/report.js (v25): summary table of all runs in a results folder (reads every <run>/summary.json, so runs that were
 * killed still show up with their last finished generation).   node run/report.js [results-folder] [--csv] */
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), csv = args.includes('--csv'), dir = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'results'));
if (!fs.existsSync(dir)) { console.log('no results folder: ' + dir); process.exit(0); }
const rows = [];
for (const d of fs.readdirSync(dir).sort()) {
  const p = path.join(dir, d, 'summary.json'); if (!fs.existsSync(p)) continue;
  try {
    const s = JSON.parse(fs.readFileSync(p, 'utf8')), c = s.champion || {};
    let last = null; const g = path.join(dir, d, 'generations.csv');
    if (fs.existsSync(g)) { const lines = fs.readFileSync(g, 'utf8').trim().split(/\r?\n/); if (lines.length > 1) { const h = lines[0].split(','), v = lines[lines.length - 1].split(','); last = Object.fromEntries(h.map((k, i) => [k, v[i]])); } }
    rows.push({ run: d, mode: s.mode, status: s.status, gens: s.generations, hours: s.hours, evals: s.evals, champion: c.val != null ? c.val.toFixed(3) : '-', 'found gen': c.gen != null ? c.gen : '-',
      'per task (raw)': (s.tasks || []).map((t, i) => `${t} ${c.raw ? (+c.raw[i]).toFixed(2) : '-'}`).join(' · '), 'ticks/s': last ? last.ticks_per_s : '-', runtime: s.runtime + ' x' + s.workers });
  } catch (e) { rows.push({ run: d, status: 'unreadable: ' + e.message }); }
}
if (!rows.length) { console.log('no runs in ' + dir); process.exit(0); }
const keys = Object.keys(rows.find(r => r.mode) || rows[0]);
if (csv) { console.log(keys.join(',')); for (const r of rows) console.log(keys.map(k => JSON.stringify(r[k] == null ? '' : String(r[k]))).join(',')); process.exit(0); }
const w = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k] == null ? '' : r[k]).length)));
const line = vals => vals.map((v, i) => String(v == null ? '' : v).padEnd(w[i])).join('  ');
console.log(`${rows.length} run(s) in ${dir}\n`); console.log(line(keys)); console.log(w.map(n => '-'.repeat(n)).join('  '));
for (const r of rows) console.log(line(keys.map(k => r[k])));
