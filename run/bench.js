#!/usr/bin/env node
'use strict';
/* run/bench.js (v25): throughput of this machine for the runner, Node vs Bun.
 *   node run/bench.js            benchmark Node AND Bun (if found: BUN env var, `bun` on PATH or ~/.bun/bin/bun) and recommend one
 *   node run/bench.js --self     only the current runtime          options: --workers N (default cores - 1)  --quick
 * Workloads: seq text + predictK3 (2448-neuron two-region brain, 1000-character lifetime) and bandit + rewardK (345 neurons, 240 trials).
 *  - single thread: simulation ticks/s of one grown brain (growth excluded), and growth time
 *  - multi-worker: evaluations/s with all workers (growth + lifetime), converted to generations/hour for population 32,
 *    3 growths, 3 + 1 validated genomes x 5 held-out growths (the text_baseline settings) */
const path = require('path'), os = require('os'), fs = require('fs'), cp = require('child_process');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const quick = args.includes('--quick');
const WORK = [{ name: 'text predictK3', task: { name: 'text', env: 'seq', params: Object.assign({ source: 'text' }, quick ? { nSyms: 300 } : {}) }, plan: 'predictK3', n: quick ? 7 : 14 },
              { name: 'bandit rewardK', task: { name: 'bandit', env: 'bandit', params: {} }, plan: 'rewardK', n: quick ? 14 : 42 }];
async function self() {
  const { runtime } = require('./engine.js'), L = require('./lib.js'), SA = L.SA, { Pool, defaultWorkers } = require('./pool.js');
  const workers = opt('workers') != null ? +opt('workers') : defaultWorkers(), out = { runtime: runtime(), workers, cpus: os.cpus().length, cpu: (os.cpus()[0] || {}).model, work: {} };
  for (const w of WORK) {
    const t = { name: w.task.name, env: w.task.env, params: L.taskEnvParams(w.task) }, env = L.setupTask(w.task), g = SA.PLANS[w.plan].make();
    let t0 = Date.now(); const brain = SA.growCell(g, { seed: 11, spec: env.spec }); const growMs = Date.now() - t0;
    const a = new SA.Agent(g, 1, brain, env); t0 = Date.now(); let n = 0; while (!a.done) { a.tick(); n++; } const ms = Date.now() - t0;
    // multi-worker: n evaluations (1 growth + 1 lifetime each, different growth seeds)
    const pool = new Pool(workers, { growths: 3 }), gc = L.serialize({ g }); t0 = Date.now();
    const res = await Promise.all(Array.from({ length: w.n }, (_, k) => pool.eval(gc, [t], { G: 1, A: 1, growSeeds: [1000 + k], arenaSeeds: [k + 1] })));
    const evMs = (Date.now() - t0) / w.n; await pool.close();
    const evalsPerGen = 32 * 3 + 4 * 5, gph = 3600e3 / (evMs * evalsPerGen);
    out.work[w.name] = { ticksPerS: Math.round(n / (ms / 1000)), ticks: n, growMs, score: a.fitness, evalMsParallel: Math.round(evMs), gensPerHour: +gph.toFixed(1), check: res.map(r => r.tasks[0].fit).reduce((x, y) => x + y, 0) };
  }
  return out;
}
function findBun() {
  const c = [process.env.BUN, 'bun', path.join(os.homedir(), '.bun', 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun')].filter(Boolean);
  for (const b of c) { try { const r = cp.spawnSync(b, ['--version'], { encoding: 'utf8' }); if (r.status === 0) return b; } catch (e) {} } return null;
}
function findNode() { if (typeof Bun === 'undefined') return process.execPath; try { const r = cp.spawnSync('node', ['--version'], { encoding: 'utf8' }); if (r.status === 0) return 'node'; } catch (e) {} return null; }
function print(r) {
  console.log(`\n${r.runtime} · ${r.workers} workers · ${r.cpus} logical CPUs (${r.cpu})`);
  for (const [k, v] of Object.entries(r.work)) console.log(`  ${k.padEnd(15)} single thread ${String(v.ticksPerS).padStart(6)} ticks/s (growth ${v.growMs} ms) · parallel ${v.evalMsParallel} ms/evaluation -> ${v.gensPerHour} generations/hour`);
}
(async () => {
  if (args.includes('--child') || args.includes('--self')) { const r = await self(); if (args.includes('--child')) process.stdout.write('\n@@' + JSON.stringify(r)); else print(r); return; }
  const rest = args.filter(a => a !== '--both'), results = [];
  for (const [name, bin] of [['node', findNode()], ['bun', findBun()]]) {
    if (!bin) { console.log(`${name}: not found, skipped`); continue; }
    console.log(`running the benchmark with ${name} (${bin}) ...`);
    const r = cp.spawnSync(bin, [path.join(__dirname, 'bench.js'), '--child', ...rest], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const m = /@@(.*)$/s.exec(r.stdout || ''); if (!m) { console.log(`${name} failed:\n${r.stderr || r.stdout}`); continue; }
    const o = JSON.parse(m[1]); results.push(o); print(o);
  }
  if (results.length === 2) {
    const [n, b] = results; console.log('\nBun / Node speed ratio:');
    let sum = 0;
    for (const k of Object.keys(n.work)) { const s1 = b.work[k].ticksPerS / n.work[k].ticksPerS, s2 = b.work[k].gensPerHour / n.work[k].gensPerHour; sum += s2;
      console.log(`  ${k.padEnd(15)} single thread x${s1.toFixed(2)} · parallel generations/hour x${s2.toFixed(2)} · same results: ${n.work[k].score === b.work[k].score && n.work[k].check === b.work[k].check ? 'yes' : 'NO (floating-point differences between engines)'}`); }
    const avg = sum / Object.keys(n.work).length;
    console.log(`\nRecommendation: use ${avg > 1.05 ? 'bun' : avg < 0.95 ? 'node' : 'either (within 5%)'} for long runs (average parallel speed ratio bun/node ${avg.toFixed(2)}).` +
      ' A run should stay with one runtime: results are reproducible within a runtime; across runtimes they matched here only if "same results" says yes.');
  }
})();
