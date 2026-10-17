'use strict';
// perf/prof.js: fixed-seed profile + fingerprint. node perf/prof.js [task...]
const L = require('../run/lib.js'), SA = L.SA, crypto = require('crypto');
const TASKS = {
  text: { name: 'text', env: 'seq', params: { source: 'text', nSyms: 1000 } , plan: 'deepURSx3' },
  order3: { name: 'order3', env: 'seq', params: { source: 'order3', nSyms: 1000 }, plan: 'deepURSx3' },
  bandit: { name: 'bandit', env: 'bandit', params: {}, plan: null },
};
const which = process.argv.slice(2).filter(a => !a.startsWith('-')); const out = {};
for (const k of (which.length ? which : Object.keys(TASKS))) {
  const T = TASKS[k], env = L.setupTask(T), planName = T.plan || (typeof env.defaultPlan === 'function' ? env.defaultPlan(env.P || {}) : env.defaultPlan) || 'unifiedR';
  const g = SA.PLANS[planName].make();
  let t0 = performance.now(); const brain = SA.growCell(g, { seed: 11, spec: env.spec }); const growMs = performance.now() - t0;
  const a = new SA.Agent(g, 1, brain, env); t0 = performance.now(); let n = 0; while (!a.done) { a.tick(); n++; } const ms = performance.now() - t0;
  const net = a.net || a.brain || brain; const ws = net.ws || (net.net && net.net.ws);
  const h = ws ? crypto.createHash('sha1').update(Buffer.from(ws.buffer, ws.byteOffset, ws.byteLength)).digest('hex').slice(0, 12) : '-';
  out[k] = { plan: planName, N: net.N, syn: ws && ws.length, growMs: +growMs.toFixed(0), lifeMs: +ms.toFixed(0), ticks: n, fit: a.fitness, wsHash: h };
}
console.log(JSON.stringify(out, null, 1));
