// R103 (Oct 30 2026, morning queue review). v45 adopted (deepURSx3 = 16000 granule cells); every arm below pins P.granN, so it is default-independent.
//  y207 (k 2536-2543, n 8): 32000 cells at book300k 0.4161 = +0.0075 vs 16000 (8/0, t 4.6), +0.0039 vs 16000 sched100k (5/2, t 2.9); book100k -0.0018 vs 16000 (3/4).
//  y208 (16 growths): 32000 vs 16000 at book10k / 30k / fables / text all inside noise. -> capacity keeps paying at length; held-out on fresh growths next.
// usage: node run/r102r_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r103'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js', 'run/r100_jobs.js', 'run/r102r_jobs.js', 'run/r103_jobs.js'];
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
const N32 = ['P.granN=32000', 'P.granKmin=3', 'P.granK=4', W60];
J.push(job('y222_1x_N32k_heldout_length', { q: 'Q42', pri: 0.94, seeds: K(2816, 8), memGB: 4,
  title: '32000 granule cells held-out at length: fresh k 2816-2823, book100k + book300k: N32000, N32000 sched100k (300k), N16000 (v45), N16000 sched100k (300k)',
  note: 'y207 (k 2536-2543, n 8): N32000 book300k +0.0075 vs N16000 (8/0), +0.0039 vs N16000 sched100k (5/2); 100k -0.0018 (3/4). Pool with y207 (16 growths). 32000 becomes the length candidate if it beats N16000 sched100k at 300k (losses not > 60%, t > -2 and mean > 0) on 16 growths; then a short-task full-set leg (y208 already: within noise) and runtime check (~2x v45).',
  arms: [['v44 N32000', L(0.2, ...N32), ['b100', 'b300'], 5.5], ['v44 N32000 sched100k', L(0.2, ...N32, ...SCH(100000)), ['b300'], 5.5],
    ['v44 N16000', L(0.2, ...N16), ['b100', 'b300'], 3], ['v44 N16000 sched100k', L(0.2, ...N16, ...SCH(100000)), ['b300'], 3]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
