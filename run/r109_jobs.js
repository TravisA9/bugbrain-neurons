// R109 (Nov 2 2026, morning queue review). No adoption; DEFAULTS_VERSION stays 39 (v46 = deepURSx3 with 32000 granule cells). Every arm pins P.granN.
// Findings behind these jobs (RESULTS R109):
//  1M 2x2 (y229 + y224, k 2536-2539, n 4): sched100k vs fixed 0.1 at 1M +0.0051 (16000, 3/1) and +0.0063 (32000, 4/0, t 2.7); at 300k it was +0.0015 / ~0.
//   Cells 32000 vs 16000 at 1M +0.0025 (fixed) / +0.0036 (sched) vs +0.0054 at 300k on the same growths -> at 1M the step rule, not capacity, is the bigger lever.
//   -> y232a/b: pre-registered fresh held-out at 1M (32000 fixed vs 32000 sched100k, k 2880-2887); y233: step time screen (granLrT 300k) on k 2536-2539.
//  y231 (fresh k 2856-2863) 64000 vs 32000 at 100k +0.0027 (5/3, t 2.2); with y227 16 growths +0.0037 (12/3, t 4.4). y228 (300k) still running.
//  y230 (fresh k 2864-2879) cx4dT context x1 + cortex x2 vs context x1: order3 +0.087 (14/1) -> 0.911 (1x 0.953), K4 +0.0025 (12/2), seqchoice order2 +0.047 (14/2), cycle flat;
//   striatum x1 collapses seqchoice (cycle -0.43, order2 -0.25, 0/16). -> y234: cortex x1 / x2 with context x1 on fresh growths, full set incl. text vs 1x.
// usage: node run/r109_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r109'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js', 'run/r100_jobs.js', 'run/r102r_jobs.js', 'run/r103_jobs.js', 'run/r104_jobs.js', 'run/r106_jobs.js', 'run/r107_jobs.js', 'run/r109_jobs.js'];
const sq = p => ({ env: 'seq', params: p }), sc = s => ({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
// [task, label, wall s per run per slot on linux-pc for a 1x 8000-cell granule brain (R90 table as r101_jobs.js); 16000 cells x3, 32000 x5.5-6, 64000 x12]
const T = { b10: [sq({ source: 'book', nSyms: 10000, evalSyms: 2000 }), 'book10k', 47], b30: [sq({ source: 'book', nSyms: 30000, evalSyms: 2000 }), 'book30k', 109],
  b100: [sq({ source: 'book', nSyms: 100000, evalSyms: 2000 }), 'book100k', 365], b300: [sq({ source: 'book', nSyms: 300000, evalSyms: 2000 }), 'book300k', 1100],
  b1M: [sq({ source: 'book', nSyms: 1000000, evalSyms: 2000 }), 'book1M', 3670],
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
// --- heavy: rule at length (Q42 / I102) ---
J.push(job('y232a_1x_N32k_sched_book1M_fresh', { q: 'Q42', pri: 0.93, seeds: K(2880, 4), memGB: 3,
  title: 'step schedule at 1M, fresh held-out (part a): 32000 fixed 0.1 (v46) vs 32000 sched100k at book1M, k 2880-2883',
  note: 'Pre-registered with y232b (8 fresh growths): sched100k is a length-rule candidate if mean > 0 at 1M with losses not > 60% and t > -2 on y232a+b; adoption additionally needs 16 fresh 1M growths and the full short set (book10k/30k, fables4000, order3, text1000, seqchoice) not worse. Short tasks are unaffected below 100k symbols by construction (step at 100k).',
  arms: [['v44 N32000', L(0.2, ...NG(32000)), ['b1M'], 5.5], ['v44 N32000 sched100k', L(0.2, ...NG(32000), ...SCH(100000)), ['b1M'], 5.5]] }));
J.push(job('y232b_1x_N32k_sched_book1M_fresh', { q: 'Q42', pri: 0.925, seeds: K(2884, 4), memGB: 3,
  title: 'step schedule at 1M, fresh held-out (part b): 32000 fixed 0.1 (v46) vs 32000 sched100k at book1M, k 2884-2887',
  note: 'Second half of y232 (split so two heavy workers can share it). Same bar as y232a.',
  arms: [['v44 N32000', L(0.2, ...NG(32000)), ['b1M'], 5.5], ['v44 N32000 sched100k', L(0.2, ...NG(32000), ...SCH(100000)), ['b1M'], 5.5]] }));
J.push(job('y233_1x_N32k_sched300k_book1M', { q: 'Q42', pri: 0.89, seeds: K(2536, 4), memGB: 3,
  title: 'when to step at 1M: 32000 sched300k (granLrT 300000, late 0.05) at book1M on k 2536-2539 (refs: y229 32000 fixed, y224 32000 sched100k, same growths)',
  note: 'Screen (n 4, direction only): if the step at 300k beats sched100k at 1M, the rule scales with text length (anneal later for longer text); if it is worse, early annealing is the lever.',
  arms: [['v44 N32000 sched300k', L(0.2, ...NG(32000), ...SCH(300000)), ['b1M'], 5.5]] }));
// --- sized order3 (I104 / Q46) ---
const SIZ = ['o3', 'k4', 'so2', 'scy'];
J.push(job('y234_4x_cx4dT_cortex_size', { q: 'I104', pri: 0.9, seeds: K(2888, 16), memGB: 4,
  title: 'sized cortex with context x1: cx4dT N16000 context x1 + cortex x4 (as y230) / x2 / x1 and the 1x reference, full set (cortex x1 on order3 / K4 / seqchoice only), fresh k 2888-2903',
  note: 'y230: cortex x2 (context x1) lifts order3 +0.087 (0.911 vs 1x 0.953), K4 +0.0025, seqchoice order2 +0.047, but seqchoice cycle stays ~0.63 vs 1x 0.92; striatum must stay x4 (x1 collapses seqchoice). Question: does cortex x2 keep the cx4 text gains (book / fables / text1000) while fixing order3, and does cortex x1 close the rest? A sized recipe passes only if no task is worse than the 1x brain (losses not > 60%, t > -2).',
  arms: [['cx4dT N16000 -ctx4', CX4DT('-sc.sizeF@context'), ALL, 5], ['cx4dT N16000 -ctx4 cx2', CX4DT('-sc.sizeF@context', '-sc.sizeF@cortex', 'sc.sizeF@cortex=2'), ALL, 5],
    ['cx4dT N16000 -ctx4 cx1', CX4DT('-sc.sizeF@context', '-sc.sizeF@cortex'), SIZ, 5], ['v44 N16000', L(0.2, ...NG(16000)), ALL, 3]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
