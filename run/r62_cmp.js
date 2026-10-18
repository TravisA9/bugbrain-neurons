// R61 paired comparison per task: node run/r61_cmp.js <base.jsonl> <baseVariant> <cand.jsonl> <candVariant>; task keys ignore readIn; scores /10
const fs = require('fs'), [fb, vb, fc, vc] = process.argv.slice(2);
const load = (f, v) => { const m = {}; for (const l of fs.readFileSync(f, 'utf8').trim().split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.variant !== v) continue; const p = JSON.parse(r.task).params; delete p.readIn; const k = p.source + (p.nSyms || '') + (p.clock2 && p.source !== 'book' ? 'c' : '');
  r.scores.forEach((s, i) => { (m[k] = m[k] || {})[r.g0 + i] = s / 10; }); } return m; };
const B = load(fb, vb), C = load(fc, vc);
for (const k of Object.keys(B)) { if (!C[k]) continue; const g = Object.keys(B[k]).filter(i => i in C[k]); const d = g.map(i => C[k][i] - B[k][i]), n = d.length, md = d.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(d.reduce((a, b) => a + (b - md) ** 2, 0) / Math.max(1, n - 1));
  const mb = g.reduce((a, i) => a + B[k][i], 0) / n, mc = g.reduce((a, i) => a + C[k][i], 0) / n;
  console.log(k.padEnd(14), 'n', n, 'base', mb.toFixed(3), 'cand', mc.toFixed(3), 'diff', (md >= 0 ? '+' : '') + md.toFixed(3), 'se', (sd / Math.sqrt(n)).toFixed(3), 'wins', d.filter(x => x > 0).length + '/' + d.filter(x => x < 0).length); }
