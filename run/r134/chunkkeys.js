// node sw/chunkkeys.js <k> <nSyms>: distinct granChunk keys (prev word | partial word | letter) and 4-letter tuples in the book stream; pool-pressure check
const L = require('../run/lib.js'); const k = +process.argv[2], nS = +(process.argv[3] || 30000);
const env = L.setupTask({ name: 'r42', env: 'seq', params: { source: 'book', nSyms: nS, evalSyms: 2000 } });
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), T = env.def.create(p.arenaSeeds[k] >>> 0, env.P, env.spec), s = T.seq.slice(0, nS);
const cnt = new Map(); for (const x of s) cnt.set(x, (cnt.get(x) || 0) + 1); const delim = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
const ck = new Map(), t4 = new Map(), t3 = new Map(); let w = '', pp = '';
for (let i = 0; i < s.length; i++) { const c = s[i]; if (w !== '') { const key = w + '|' + pp + '|' + c; ck.set(key, (ck.get(key) || 0) + 1); }
  if (c === delim) { if (pp !== '') w = pp; pp = ''; } else pp = pp ? pp + ',' + c : String(c);
  if (i >= 3) { const q = s.slice(i - 3, i + 1).join(','); t4.set(q, (t4.get(q) || 0) + 1); } if (i >= 2) { const q = s.slice(i - 2, i + 1).join(','); t3.set(q, (t3.get(q) || 0) + 1); } }
const ge2 = m => [...m.values()].filter(v => v >= 2).length;
console.log(JSON.stringify({ k, nS, chunkKeys: ck.size, chunkKeys2: ge2(ck), tup4: t4.size, tup4_2: ge2(t4), tup3: t3.size, tup3_2: ge2(t3) }));
