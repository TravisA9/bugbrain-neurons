// node sw/streamdump.js <k> <nSyms> -> sw/out/stream_<k>_<nSyms>.txt : the exact book letter stream xray.js / bookdiag see for seed k (no life run)
'use strict';
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, nS] = process.argv.slice(2), k = +k0;
const tj = { env: 'seq', params: { source: 'book', nSyms: +nS, evalSyms: 2000 } }, task = Object.assign({ name: 'r42' }, tj);
const gc = L.serialize(L.startGenome('deepURSx3'));
for (const kv of fs.readFileSync('/workspace/xray-notes/r144.txt', 'utf8').trim().split(',')) { const [kk, v] = kv.split('='), [kq] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], brain, env), T = a.task, AL = SA.book.ALPHA;
fs.writeFileSync(`sw/out/stream_${k}_${nS}.txt`, Array.from(T.seq.slice(0, T.P.nSyms + 1), i => AL[i]).join('') + '\n' + JSON.stringify({ heldFrom: T.heldFrom, nSyms: T.P.nSyms }));
console.log('ok', T.seq.length, T.heldFrom);
