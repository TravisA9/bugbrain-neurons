const fs = require('fs'), R = [...fs.readFileSync('/workspace/hr/reg.jsonl', 'utf8').trim().split('\n'), ...fs.readFileSync('/workspace/hr2/reg.jsonl', 'utf8').trim().split('\n')].filter(Boolean).map(JSON.parse);
const arms = (process.argv[2] || 'off,old,gd').split(','), tasks = [...new Set(R.map(r => r.task))], ks = [2951, 2952, 2953];
const g = (k, a, t) => { const r = R.filter(x => x.k === k && x.arm === a && x.task === t).pop(); return r ? r.mean : null; };
for (const t of tasks) { const row = ks.map(k => arms.map(a => { const v = g(k, a, t); return v == null ? '  -  ' : v.toFixed(4); }).join('/'));
  const d = (a, b) => { const x = ks.map(k => g(k, a, t) - g(k, b, t)).filter(v => !isNaN(v)); return x.length ? (x.reduce((s, v) => s + v, 0) / x.length).toFixed(4) + ' (' + x.filter(v => v > 0).length + '+/' + x.filter(v => v < 0).length + '-)' : '-'; };
  console.log(t.padEnd(11), row.join(' | '), '|', arms.slice(1).map(a => a + '-off ' + d(a, 'off')).join('  '), arms.length > 2 ? '| ' + arms[2] + '-old ' + d(arms[2], 'old') : ''); }
