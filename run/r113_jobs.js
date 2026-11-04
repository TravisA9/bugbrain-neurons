// R113 (Nov 4 2026, morning queue review). No adoption; DEFAULTS_VERSION stays 39 (v46 = deepURSx3 with 32000 granule cells). Every arm pins P.granN,
// and the fixed arm pins P.granLrT=0 so the job means the same thing if sched100k becomes the default at R114.
// Findings behind this job (RESULTS R113):
//  y238a (fresh k 2928-2931) sched100k vs fixed at 1M +0.0012 (2/2); pooled 12 fresh growths +0.0039 (8/4, t 2.2). y238b (k 2932-2935) decides at R114.
//  y238c: 32000 sched100k on the 8 short tasks is bit-identical to y235a's 32000 arm (k 2904-2905) on the workers -> short-set part of the bar met.
//  y235a/b: 64000 vs 32000 on the full short set (16 fresh growths) is nil: book10k +0.0010, book30k +0.0003, fables4000 +0.0008, text1000 -0.0001,
//   order3 -0.0008 (0/3), K4 / seqchoice x2 identical. Capacity past 32000 only shows at 100k+ symbols, so the open capacity question is the length one.
//  -> y240: does book1M -> book3M still climb (the learning plateau), and does the step rule's gain keep growing with length? (corpus has 3.29M train chars)
// usage: node run/r113_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r113'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js', 'run/r100_jobs.js', 'run/r102r_jobs.js', 'run/r103_jobs.js', 'run/r104_jobs.js', 'run/r106_jobs.js', 'run/r107_jobs.js', 'run/r109_jobs.js'];  // r110+ job files not required: runs only need r42.js, so the queue push does not wait on the code push
const sq = p => ({ env: 'seq', params: p }), sc = s => ({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
// [task, label, wall s per run per slot on linux-pc for a 1x 8000-cell granule brain (R90 table as r101_jobs.js); 16000 cells x3, 32000 x5.5-6, 64000 x12]
const T = { b10: [sq({ source: 'book', nSyms: 10000, evalSyms: 2000 }), 'book10k', 47], b30: [sq({ source: 'book', nSyms: 30000, evalSyms: 2000 }), 'book30k', 109],
  b100: [sq({ source: 'book', nSyms: 100000, evalSyms: 2000 }), 'book100k', 365], b300: [sq({ source: 'book', nSyms: 300000, evalSyms: 2000 }), 'book300k', 1100],
  b1M: [sq({ source: 'book', nSyms: 1000000, evalSyms: 2000 }), 'book1M', 3670],
  b3M: [sq({ source: 'book', nSyms: 3000000, evalSyms: 2000 }), 'book3M', 11010],
  f4: [sq({ source: 'fables', nSyms: 4000, readIn: 0.01 }), 'fables4000', 27], o3: [sq({ source: 'order3', K: 8, readIn: 0.01 }), 'order3', 11],
  k4: [sq({ source: 'order3', K: 4, readIn: 0.01 }), 'K4', 11], t1: [sq({ source: 'text', nSyms: 1000, readIn: 0.01 }), 'text1000', 15],
  so2: [sc('order2'), 'seqchoice order2', 30], scy: [sc('cycle'), 'seqchoice cycle', 30] };
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1, seeds = o.seeds] of o.arms) for (const t of tasks) for (const g of seeds) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', JSON.stringify(T[t][0]), '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += T[t][2] * f; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 2, accept: { note: o.note }, runs };
  if (o.after) j.after = o.after;
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const W60 = 'P.granW=60';
const L = (lr, ...x) => [`pl.lr@cortex=${lr}`].concat(x, ['P.fastEngine=1']).join(',');
const NG = n => [`P.granN=${n}`, 'P.granKmin=3', 'P.granK=4', W60];
const SCH = (T, late = 0.05) => [`P.granLrT=${T}`, `P.granLrLate=${late}`];
const ALL = ['b10', 'b30', 'f4', 'o3', 'k4', 't1', 'so2', 'scy'];
const CX4DT = (...x) => ['sc.sizeF@cortex=4', 'sc.divRep@cortex=2', 'sc.trophMin@cortex=0.00125', 'P.fanRef=450', 'P.fanRefR=126', 'pl.lr@cortex=0.2', 'pl.preNorm@cortex=45',
  'sc.sizeF@context=4', 'sc.sizeF@striatum=4', 'sc.trophMin@striatum=0.00125', 'P.sizeCone=1', 'P.recvBudget=2', 'P.postCapRel=1.5', 'P.thinF=5', 'P.granN=16000', 'P.granKmin=3', 'P.granK=4', 'P.granRef=600', W60]
  .filter(s => !x.some(d => d.startsWith('-') && s.startsWith(d.slice(1) + '='))).concat(x.filter(d => !d.startsWith('-')), ['P.fastEngine=1']).join(',');
// --- Q42 / I101: the learning plateau past 1M (and the step rule at 3x length) ---
J.push(job('y240_1x_N32k_book3M_plateau', { q: 'Q42', pri: 0.86, seeds: K(2536, 2), memGB: 3,
  title: 'learning plateau at 3M symbols: 32000 fixed 0.1 (pinned granLrT=0) vs 32000 sched100k at book3M, k 2536-2537 (refs at 1M: y229 fixed, y224 sched100k; 300k: y222/y228 arms on other growths)',
  note: 'Scaling screen (n 2, direction only; ~17 h per run). Question 1: does 1M -> 3M still lift (300k -> 1M gave +0.010-0.016 on every arm)? Question 2: does sched100k vs fixed grow past +0.006 at 3M (it grew 300k +0.000 -> 1M +0.006)? If 3M lifts < +0.003 the plateau is real at 32000 and capacity / a second step is next; if the rule gap grows, a second step (e.g. 0.025 at 1M) is the next schedule test.',
  arms: [['v44 N32000 fixed', L(0.2, ...NG(32000), 'P.granLrT=0'), ['b3M'], 5.5], ['v44 N32000 sched100k', L(0.2, ...NG(32000), ...SCH(100000)), ['b3M'], 5.5]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
