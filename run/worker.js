'use strict';
/* run/worker.js (v25): worker thread of the runner / benchmark. Receives { init: { engine } } once, then jobs
 * { id, genome (compact), tasks, plan } and answers { id, result } (see lib.evaluateGenome). */
const { parentPort } = require('worker_threads');
const L = require('./lib.js');
parentPort.on('message', m => {
  if (m.init) { L.applyEngine(m.init.engine); parentPort.postMessage({ ready: true }); return; }
  let result; try { result = L.evaluateGenome(m.genome, m.tasks, m.plan); } catch (e) { result = { tasks: m.tasks.map(() => ({ fit: 0, mean: 0, sd: 0, min: 0, stats: {} })), brain: { hidden: 0, synapses: 0 }, ticks: 0, ms: 0, error: String(e && e.stack || e) }; }
  parentPort.postMessage({ id: m.id, result });
});
