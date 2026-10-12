'use strict';
/* run/pool.js (v25): a pool of worker threads (or in-process evaluation when workers = 0). eval() returns a promise. */
const path = require('path'), os = require('os');
const { Worker } = require('worker_threads');
function defaultWorkers() { const n = (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 2; return Math.max(1, n - 1); }
class Pool {
  constructor(n, engine) {
    this.n = n; this.engine = engine; this.queue = []; this.busy = new Map(); this.workers = []; this.nextId = 1; this.cb = new Map();
    if (n === 0) { this.L = require('./lib.js'); this.L.applyEngine(engine); return; }
    for (let i = 0; i < n; i++) {
      const w = new Worker(path.join(__dirname, 'worker.js'));
      w.on('message', m => { if (m.ready) { w.ready = true; return this.pump(); } const c = this.cb.get(m.id); this.cb.delete(m.id); this.busy.delete(w); c(m.result); this.pump(); });
      w.on('error', e => { console.error('worker error:', e); });
      w.postMessage({ init: { engine } }); this.workers.push(w);
    }
  }
  eval(genome, tasks, plan) {
    if (this.n === 0) return Promise.resolve(this.L.evaluateGenome(genome, tasks, plan));
    return new Promise(res => { const id = this.nextId++; this.cb.set(id, res); this.queue.push({ id, genome, tasks, plan }); this.pump(); });
  }
  pump() {
    for (const w of this.workers) { if (!this.queue.length) return; if (!w.ready || this.busy.has(w)) continue; const job = this.queue.shift(); this.busy.set(w, job.id); w.postMessage(job); }
  }
  // (no await on terminate(): in Bun 1.2 its promise may never settle, and the process then exits silently mid-script)
  close() { for (const w of this.workers) w.terminate(); this.workers = []; return Promise.resolve(); }
}
module.exports = { Pool, defaultWorkers };
