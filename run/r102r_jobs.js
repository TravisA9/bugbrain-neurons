// R102r (Oct 29 2026, evening queue review; the "R102" code commit 91501d6 = granDemand I105 is a separate change). Findings behind these jobs (RESULTS R102r):
//  y206 (k 2536-2543, n 8): granule step schedule on 16000 cells. sched100k = granLr 0.1 to 100k then 0.05: identical at 100k (by construction), book300k 0.4122
//   (+0.0036 vs fixed 0.1 5/3, +0.0011 vs fixed 0.05 4/2) = best 1x at 300k. sched30k: book100k +0.0021 vs 0.1 (6/2), +0.0035 vs 0.05 (7/1); 300k ties fixed 0.05.
//   smooth30k: 100k +0.0005, 300k = fixed 0.05. Only 8 growths -> held-out on fresh growths (y219a on y210's growths, y219b fresh) before any adoption.
//  y209 (32 fresh): v45 tie-break passes (fables4000 -0.0002 16/16; pooled with y198 48 growths -0.0007 19/27 t -1.2); v45 waits only for y210 (length leg).
// usage: node run/r102r_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r102r'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js', 'run/r100_jobs.js', 'run/r102r_jobs.js'];
const sq = p => ({ env: 'seq', params: p });
// [task, label, wall s per run per slot on linux-pc for a 1x 8000-cell granule brain (as r101_jobs.js); 16000 cells x3, 8000 cells x1.8]
const T = { b100: [sq({ source: 'book', nSyms: 100000, evalSyms: 2000 }), 'book100k', 365], b300: [sq({ source: 'book', nSyms: 300000, evalSyms: 2000 }), 'book300k', 1100],
  b1M: [sq({ source: 'book', nSyms: 1000000, evalSyms: 2000 }), 'book1M', 3670] };
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1, seeds = o.seeds] of o.arms) for (const t of tasks) for (const g of seeds) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', JSON.stringify(T[t][0]), '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += T[t][2] * f; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 2, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const W60 = 'P.granW=60', KM = ['P.granKmin=3', 'P.granK=4', W60];
const L = (lr, ...x) => [`pl.lr@cortex=${lr}`].concat(x, ['P.fastEngine=1']).join(',');
const N16 = ['P.granN=16000', 'P.granKmin=3', 'P.granK=4', W60];
const SCH = (T, late = 0.05, shape) => [`P.granLrT=${T}`, `P.granLrLate=${late}`].concat(shape ? [`P.granLrShape=${shape}`] : []);
J.push(job('y219a_1x_sched_heldout_y210g', { q: 'Q42', pri: 0.955, seeds: K(2728, 8),
  title: 'granule step schedule held-out (part a): on y210 growths k 2728-2735 (refs v44, N16000, N16000 granLr0.05 at 100k / 300k in y210): N16000 sched100k and sched30k at 300k, sched30k at 100k, and v44 (8000 cells) + sched100k at 300k',
  note: 'y206 (k 2536-2543, n 8): sched100k 300k 0.4122 (+0.0036 vs 0.1, +0.0011 vs 0.05); sched30k 100k +0.0021 vs 0.1, 300k = 0.05. Pool with y219b (16 fresh growths). A schedule becomes the length rule if, on 16 fresh growths, it beats fixed granLr 0.1 at 300k and is not worse than 0.1 at 100k nor than 0.05 at 300k (losses not > 60%, t > -2). sched100k is bit-identical below 100k symbols, so short tasks cannot move. The v44 + sched100k arm asks whether the 8000-cell default also gains.',
  arms: [['v44 N16000 sched100k', L(0.2, ...N16, ...SCH(100000)), ['b300'], 3], ['v44 N16000 sched30k', L(0.2, ...N16, ...SCH(30000)), ['b100', 'b300'], 3],
    ['v44 sched100k', L(0.2, 'P.granN=8000', ...KM, ...SCH(100000)), ['b300'], 1.8]] }));
J.push(job('y219b_1x_sched_heldout_fresh', { q: 'Q42', pri: 0.95, seeds: K(2808, 8),
  title: 'granule step schedule held-out (part b): fresh k 2808-2815, 16000 cells at book300k: fixed granLr 0.1 vs fixed 0.05 vs sched100k vs sched30k',
  note: 'Second half of the 16-growth held-out for the schedule (pool with y219a / y210). Same acceptance as y219a.',
  arms: [['v44 N16000', L(0.2, ...N16), ['b300'], 3], ['v44 N16000 granLr0.05', L(0.2, ...N16, 'P.granLr=0.05'), ['b300'], 3],
    ['v44 N16000 sched100k', L(0.2, ...N16, ...SCH(100000)), ['b300'], 3], ['v44 N16000 sched30k', L(0.2, ...N16, ...SCH(30000)), ['b300'], 3]] }));
J.push(job('y221_1x_N16k_sched_book1M', { q: 'Q42', pri: 0.9, seeds: K(2536, 4),
  title: 'does the plateau come back past 300k? 16000 cells at book1M on k 2536-2539 (300k refs in y193 / y201 / y206): sched100k (late 0.05) vs sched100k late 0.025 vs smooth30k',
  note: 'Everything so far stops at 300k. If 1M > 300k for sched100k, more text keeps paying with the step lowered once; if late 0.025 beats 0.05 at 1M, the step should keep falling (a decaying schedule, not one switch); if 1M <= 300k, the plateau is capacity, not the step (-> 32000 cells, y207).',
  arms: [['v44 N16000 sched100k', L(0.2, ...N16, ...SCH(100000)), ['b1M'], 3], ['v44 N16000 sched100k late0.025', L(0.2, ...N16, ...SCH(100000, 0.025)), ['b1M'], 3],
    ['v44 N16000 smooth30k', L(0.2, ...N16, ...SCH(30000, 0.05, 1)), ['b1M'], 3]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
