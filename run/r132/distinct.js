
const L = require('../lib.js');
const k = +process.argv[2], nS = +process.argv[3];
const env = L.setupTask({ name: 'r42', env: 'seq', params: { source: 'book', nSyms: nS, evalSyms: 2000 } });
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), T = env.def.create(p.arenaSeeds[k] >>> 0, env.P, env.spec);
const s = T.seq, out = {};
for (const o of [1,2,3,4]) { const S = new Set(); for (let i = o - 1; i < nS; i++) S.add(s.slice(i - o + 1, i + 1).join(',')); out['d' + o] = S.size; }
console.log(k, nS, JSON.stringify(out));
