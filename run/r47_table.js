// node run/r47_table.js <jsonl> [basePlan:baseVariant] : paired per-growth deltas vs base (mean delta, paired t, wins)
const fs = require('fs'); const [f, bk = 'deepURSx3:base', f2] = process.argv.slice(2);
const rows = fs.readFileSync(f, 'utf8').trim().split('\n').concat(f2 ? fs.readFileSync(f2, 'utf8').trim().split('\n') : []).map(JSON.parse);
const S = {}; for (const r of rows) { const t = JSON.parse(r.task).params, tn = t.source + (t.nSyms || ''), key = r.plan + ':' + r.variant; ((S[key] = S[key] || {})[tn] = S[key][tn] || {}); r.scores.forEach((s, i) => S[key][tn][r.g0 + i] = s); }
const tasks = process.env.BB_TT ? process.env.BB_TT.split(',') : ['fables2000', 'text3000', 'order3', 'text1000'], B = S[bk];
console.log('| variant | ' + tasks.join(' | ') + ' |\n|---|' + tasks.map(() => '---|').join(''));
console.log('| ' + bk + ' (mean) | ' + tasks.map(t => { const v = Object.values(B[t] || {}); return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) + ' (n' + v.length + ')'; }).join(' | ') + ' |');
for (const k in S) { if (k === bk) continue; console.log('| ' + k + ' | ' + tasks.map(t => { const d = []; for (const g in (S[k][t] || {})) if (B[t] && g in B[t]) d.push(S[k][t][g] - B[t][g]); if (!d.length) return '-';
  const m = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1)), tt = sd > 0 ? m / (sd / Math.sqrt(d.length)) : 0;
  return (m >= 0 ? '+' : '') + m.toFixed(3) + ' (t ' + tt.toFixed(1) + ', ' + d.filter(x => x > 0).length + '/' + d.length + ')'; }).join(' | ') + ' |'); }
