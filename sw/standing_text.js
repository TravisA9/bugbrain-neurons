// node sw/standing_text.js <k> : writes standing/data_k<k>.json {train, held, ctx} = the exact letters a book100k life of seed k sees
// (same task seed as sw/bookdiag.js / sw/standing_gen.js: 98000 TRAIN letters then 2000 HELD letters). No brain is grown.
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs'), k = +process.argv[2];
const env = L.setupTask({ name: 'r42', env: 'seq', params: { source: 'book', nSyms: 100000, evalSyms: 2000 } });
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), T = env.def.create(p.arenaSeeds[k] >>> 0, env.P, env.spec), A = SA.book.ALPHA;
const s = T.seq.map(i => A[i]).join('');
fs.writeFileSync(`standing/data_k${k}.json`, JSON.stringify({ k, train: s.slice(0, 98001), held: s.slice(98001), heldStartInHELD: SA.book.HELD.indexOf(s.slice(98001)), trainStartInTRAIN: SA.book.TRAIN.indexOf(s.slice(0, 200)) }));
console.log(s.length, JSON.stringify(s.slice(98001, 98101)));
