#!/usr/bin/env node
// Determinism check for the Explore "Watch a brain grow" view (explore-brain.js): growing the arena brain with the
// development recorder on (growCell(..., { record: true })) must give exactly the brain the arena grows without it.
// Loads the served engine bundle, grows plan v3h in the arena's flash-garden spec for a few seeds both ways, compares
// every field of the grown network (devLog / devStats aside), then lets both brains live 300 ticks in the same arena
// and compares what they did. Exit 0 = identical.   node tools/brain_record_check.js [--seeds 3] [--bundle path]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const bundle = opt('--bundle', path.resolve(__dirname, '../hosting/computelab/private/bugbrain.js')), nSeeds = +opt('--seeds', '3');
const ctx = vm.createContext({ console, performance, Math, Date, JSON, setTimeout });
vm.runInContext(fs.readFileSync(bundle, 'utf8'), ctx, { filename: 'bugbrain.js' });
const SA = vm.runInContext('SpikingArena', ctx);
const p = SA.recommendedEnvParams('bug', { task: 'flash' }, ['task']);
SA.setEnv('bug', Object.assign({}, p, { task: 'flash' }));
const cur = SA.currentEnv(), env = Object.assign({}, cur, { P: Object.assign({}, cur.P), def: Object.assign({}, cur.def, { create: (s, pp) => new SA.bug.World(s, pp, SA.bug.GARDEN) }) });
const norm = v => ArrayBuffer.isView(v) ? Array.from(v) : v;
let bad = 0;
for (let n = 0; n < nSeeds; n++) {
  const seed = (12345 + n * 2654435761) >>> 0;
  const a = SA.growCell(SA.tunedBugGenome(), { seed, spec: env.spec });
  const b = SA.growCell(SA.tunedBugGenome(), { seed, spec: env.spec, record: true });
  const keys = new Set(Object.keys(a).concat(Object.keys(b))); keys.delete('devLog'); keys.delete('devStats');
  const diff = [...keys].filter(k => JSON.stringify(norm(a[k])) !== JSON.stringify(norm(b[k])));
  if (!b.devLog || !b.devLog.cones || !b.devLog.syn) diff.push('(no recording)');
  SA.params.plasticity = true;
  const live = g => { const ag = new SA.Agent(SA.tunedBugGenome(), seed, g, env); for (let t = 0; t < 300; t++) ag.tick(); return JSON.stringify([ag.task.stats(), Array.from(ag.net.ws)]); };
  if (live(a) !== live(b)) diff.push('(behaviour)');
  console.log('seed ' + seed + ': ' + (diff.length ? 'DIFFERENT ' + diff.join(',') : 'identical') + ' (' + a.N + ' nodes, ' + b.devLog.syn.n + ' recorded synapses)');
  if (diff.length) bad++;
}

// Cross-load: two fresh loads of the bundle (new contexts, as two page loads) grow the page's default seed with the page's own
// traceHash and DEFAULT_SEED (read from explore-brain.js): same cell count, synapse count and growth-trace hash. A different seed
// is allowed to differ (reported only).
const pageSrc = fs.readFileSync(path.resolve(__dirname, '../hosting/computelab/private/explore-brain.js'), 'utf8');
const defSeed = +(/const DEFAULT_SEED = (\d+);/.exec(pageSrc) || [])[1];
const thSrc = (/(function traceHash\(rec\) \{[\s\S]*?\n  \})/.exec(pageSrc) || [])[1];
if (!Number.isFinite(defSeed) || !thSrc) { console.log('explore-brain.js: DEFAULT_SEED or traceHash not found'); process.exit(1); }
const freshGrow = seed => {
  const c = vm.createContext({ console, performance, Math, Date, JSON, setTimeout });
  vm.runInContext(fs.readFileSync(bundle, 'utf8'), c, { filename: 'bugbrain.js' });
  vm.runInContext(thSrc + '; this.traceHash = traceHash;', c);
  c.SEED = seed;
  return vm.runInContext(`(function () {
    const SA = SpikingArena, p = SA.recommendedEnvParams('bug', { task: 'flash' }, ['task']);
    SA.setEnv('bug', Object.assign({}, p, { task: 'flash' }));
    const g = SA.growCell(SA.tunedBugGenome(), { seed: SEED, spec: SA.currentEnv().spec, record: true });
    return { cells: g.devLog.cells.length, synapses: g.devLog.syn.n, trace: traceHash(g.devLog) };
  })()`, c);
};
const l1 = freshGrow(defSeed), l2 = freshGrow(defSeed), other = freshGrow((defSeed + 1) >>> 0);
const same = l1.cells === l2.cells && l1.synapses === l2.synapses && l1.trace === l2.trace;
console.log('cross-load seed ' + defSeed + ': ' + (same ? 'identical' : 'DIFFERENT') + ' (load 1: ' + JSON.stringify(l1) + ', load 2: ' + JSON.stringify(l2) + ')');
console.log('seed ' + ((defSeed + 1) >>> 0) + ' (may differ): ' + JSON.stringify(other) + (other.trace !== l1.trace ? ' - a different brain' : ' - same trace'));
if (!same) bad++;
process.exit(bad ? 1 : 0);
