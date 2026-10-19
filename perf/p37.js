'use strict';
// perf/p37.js (R65): timing breakdown (grow / net build / life) + fingerprint (final ws hash, fitness) of one held-out growth,
// the same seeds as run/r42.js. node perf/p37.js <plan> '<task json>' <k> [variant]   (BB_PROF_OUT=file appends one JSON line)
const L = require('../run/lib.js'), SA = L.SA, crypto = require('crypto');
const [plan, tj, k = 0, variant = 'base'] = process.argv.slice(2), task = Object.assign({ name: 'p37' }, JSON.parse(tj));
const gc = L.serialize(L.startGenome(plan)), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base') for (const kv of variant.split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: 64, valArenas: 64 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const H = a => crypto.createHash('sha1').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 12);
let t = performance.now(); const brain = SA.growCell(g, { seed: p.growSeeds[+k], spec: env.spec }); const growMs = performance.now() - t;
t = performance.now(); const a = new SA.Agent(g, p.arenaSeeds[+k], brain, env); const buildMs = performance.now() - t;
t = performance.now(); let n = 0; while (!a.done) { a.tick(); n++; } const lifeMs = performance.now() - t;
const st = a.task.stats ? a.task.stats() : {};
const o = { plan, task: tj, variant, k: +k, N: a.net.N, syn: a.net.ws.length, plastic: a.net.plastic.length, ticks: n, spikes: a.net.spikeCount, growMs: Math.round(growMs), buildMs: Math.round(buildMs), lifeMs: Math.round(lifeMs), fit: a.fitness, wsHash: H(a.net.ws), WHash: H(brain.W instanceof Float32Array || brain.W instanceof Float64Array ? brain.W : Float64Array.from(brain.W)), acc: st.acc, rt: typeof Bun !== 'undefined' ? 'bun' : 'node' };
if (process.env.BB_PROF_OUT) require('fs').appendFileSync(process.env.BB_PROF_OUT, JSON.stringify(o) + '\n');
console.log(JSON.stringify(o));
