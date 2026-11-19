// node sw/diag8x.js <k> <nSyms> bdA.json bdB.json : held-out hits of two bookdiag runs split by target letter, by context-4 seen bin,
// and by position in word (first letter of a word vs inside); prints per-split accuracy A, B and B-A
const L = require('../run/lib.js');
const k = +process.argv[2], nS = +process.argv[3];
const env = L.setupTask({ name: 'r42', env: 'seq', params: { source: 'book', nSyms: nS, evalSyms: 2000 } });
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), T = env.def.create(p.arenaSeeds[k] >>> 0, env.P, env.spec);
const s = T.seq, h0 = T.heldFrom, fs = require('fs'), D = process.argv.slice(4).map(f => JSON.parse(fs.readFileSync(f)));
const cnt = new Map(); for (let i = 0; i < nS; i++) cnt.set(s[i], (cnt.get(s[i]) || 0) + 1); const delim = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
const t4 = new Map(), acc = {}; let j = 0;
const add = (g, x, a, b) => { const A = acc[g] || (acc[g] = {}); const B = A[x] || (A[x] = [0, 0, 0]); B[0] += a; B[1] += b; B[2]++; };
for (let i = 0; i < nS; i++) { const key = s.slice(Math.max(0, i - 3), i + 1).join(','), seen = t4.get(key) || 0;
  if (i >= h0) { const a = +D[0].hits[j], b = +D[1].hits[j]; j++;
    add('bin', seen === 0 ? '0' : seen === 1 ? '1' : seen < 5 ? '2-4' : '5+', a, b);
    add('pos', s[i] === delim ? 'wordStart' : s[i + 1] === delim ? 'wordEnd' : 'inside', a, b);
    add('tgt', s[i + 1] === delim ? 'delim' : String(s[i + 1]), a, b); }
  t4.set(key, seen + 1); }
const out = { k, A: D[0].tag, B: D[1].tag, n: j };
for (const g in acc) out[g] = Object.fromEntries(Object.entries(acc[g]).filter(([, v]) => v[2] >= 40).sort((x, y) => y[1][2] - x[1][2]).map(([x, v]) => [x, { n: v[2], A: +(v[0] / v[2]).toFixed(3), B: +(v[1] / v[2]).toFixed(3), d: +((v[1] - v[0]) / v[2]).toFixed(3) }]));
console.log(JSON.stringify(out));
