// R110 (Nov 2 2026, evening queue review). No adoption; DEFAULTS_VERSION stays 39 (v46 = deepURSx3 with 32000 granule cells). Every arm pins P.granN.
// Findings behind these jobs (RESULTS R110):
//  y228 (fresh k 2856-2863) 64000 vs 32000 at book300k +0.0027 (4/2, t 1.5); with y227 16 growths +0.0023 (8/5, t 2.1); 100k leg 16 growths +0.0037 (12/3, t 4.4)
//   -> both length legs of the pre-registered I101 bar met -> y235a/b full-set confirmation (8 short tasks, 16 fresh growths k 2904-2919), and y237: does capacity pay at 1M
//   with the step rule? 64000 sched100k at book1M on k 2536-2539 (refs y224 32000 sched100k, y229 16000 sched100k, same growths).
//  y232a (fresh k 2880-2883) sched100k vs fixed at 1M +0.0019 (3/1, t 1.1); y232b (k 2884-2887) still pending.
//  y234 (fresh k 2888-2903) context x1: cortex x1 fixes order3 (+0.0098 vs 1x, 8/5), but seqchoice stays collapsed even with cortex x1 + context x1
//   (order2 -0.203, cycle -0.236 vs 1x, 0-1/16) -> the seqchoice loss is not area size of cortex/context: y236 leave-one-out of the remaining cx4dT knobs on the cx1 brain.
// usage: node run/r110_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r110'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js', 'run/r100_jobs.js', 'run/r102r_jobs.js', 'run/r103_jobs.js', 'run/r104_jobs.js', 'run/r106_jobs.js', 'run/r107_jobs.js', 'run/r109_jobs.js'];  // r110_jobs.js not required: runs only need r42.js, so the queue push does not wait on the code push
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
// --- I101: 64000 cells, full-set confirmation (both length legs passed) ---
const SHORT = ['b10', 'b30', 'f4', 'o3', 'k4', 't1', 'so2', 'scy'];
for (const [s, k0] of [['a', 2904], ['b', 2912]]) J.push(job(`y235${s}_1x_N64k_fullset_confirm`, { q: 'I101', pri: s === 'a' ? 0.92 : 0.915, seeds: K(k0, 8), memGB: 3,
  title: `64000 vs 32000 granule cells (v46), full short set (book10k/30k, fables4000, order3, K4, text1000, seqchoice x2), fresh k ${k0}-${k0 + 7}`,
  note: 'I101 confirmation: 64000 passed both held-out length legs (100k +0.0037 12/3, 300k +0.0023 8/5, 16 growths each). Adopt v47 = 64000 only if no task is worse on y235a+b (16 fresh growths: losses not > 60%, t > -2) AND the runtime cost (~2x v46) is judged worth +0.002-0.004; cells did not move order3 / K4 / seqchoice at 8000-32000 (y216).',
  arms: [['v44 N32000', L(0.2, ...NG(32000)), SHORT, 5.5], ['v44 N64000', L(0.2, ...NG(64000)), SHORT, 12]] }));
// --- Q46: which cx4dT knob breaks seqchoice once cortex and context are x1 ---
const CX1 = (...x) => CX4DT('-sc.sizeF@context', '-sc.sizeF@cortex', ...x);
const SQ = ['so2', 'scy', 'o3'];
J.push(job('y236_cx1_seqchoice_knobs', { q: 'Q46', pri: 0.9, seeds: K(2920, 8), memGB: 2,
  title: 'seqchoice dissection on the cx1 brain (cx4dT recipe with context x1 + cortex x1, striatum x4): leave one knob group out, seqchoice order2 / cycle + order3, 1x reference, fresh k 2920-2927',
  note: 'y234: with cortex x1 and context x1 order3 is fixed (+0.0098 vs 1x) but seqchoice stays at 0.46 / 0.64 vs 1x 0.67 / 0.88 (0-1/16). The arm whose removal restores seqchoice to the 1x level names the culprit (screen, n 8; a winner needs a fresh 16-growth check).',
  arms: [['cx1', CX1(), SQ, 4], ['cx1 -str4', CX1('-sc.sizeF@striatum', '-sc.trophMin@striatum'), SQ, 3], ['cx1 -strTroph', CX1('-sc.trophMin@striatum'), SQ, 4],
    ['cx1 -cxDivTroph', CX1('-sc.divRep@cortex', '-sc.trophMin@cortex'), SQ, 4], ['cx1 -cone', CX1('-P.sizeCone', '-P.recvBudget', '-P.postCapRel'), SQ, 4],
    ['cx1 -thin', CX1('-P.thinF'), SQ, 4], ['cx1 -fanRef', CX1('-P.fanRef', '-P.fanRefR'), SQ, 4], ['cx1 -preNorm', CX1('-pl.preNorm@cortex'), SQ, 4],
    ['cx1 -granRef', CX1('-P.granRef'), SQ, 4], ['v44 N16000', L(0.2, ...NG(16000)), SQ, 3]] }));
// --- capacity x length at 1M with the step rule (I101 x Q42) ---
J.push(job('y237_1x_N64k_sched_book1M', { q: 'I101', pri: 0.88, seeds: K(2536, 4), memGB: 3,
  title: 'does capacity pay at 1M with the step rule? 64000 sched100k at book1M on k 2536-2539 (refs: y224 32000 sched100k 0.4213, y229 16000 sched100k 0.4176, same growths)',
  note: 'Screen (n 4, direction). y229: the cell gain shrank at 1M (32000 vs 16000 +0.0025-0.0036 vs +0.0054 at 300k). If 64000 sched100k > 32000 sched100k by > +0.003 (3/1+), capacity still pays at 1M and the plateau is capacity-bound; if flat, the 1M limit is the rule / readout, not cells.',
  arms: [['v44 N64000 sched100k', L(0.2, ...NG(64000), ...SCH(100000)), ['b1M'], 12]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
