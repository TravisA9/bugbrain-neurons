// R114 (Nov 4 2026, evening queue review). ADOPT v47 (DEFAULTS_VERSION 40): plan deepURSx3's granule layer steps its NLMS rate 0.1 -> 0.05 after 100000 teaching events
// (plan gene d.gran.lrT / lrLate; v46 = plan deepURSx3v46 or P.granLrT=0). Pending jobs y237 / y239 / y240 set P.granLrT explicitly in every arm, so their meaning is unchanged.
// Findings behind this job (RESULTS R114):
//  y238b (fresh k 2932-2935) sched100k vs fixed at 1M +0.0035 (3/1, t 2.2); pre-registered 16 fresh growths (y232a+b, y238a+b) +0.0038 (11/5, t 2.8) -> pass, adopted.
//  y236 (fresh k 2920-2927) leave-one-out on the cx1 brain (cx4dT knobs, context x1 + cortex x1, striatum x4): only removing the striatum x4 restores seqchoice
//   (order2 -0.043 4/4, cycle +0.021 4/4 vs 1x; with striatum x4: -0.249 / -0.306, 0-1/8); removing the size cone makes it far worse (-0.50 / -0.74); order3 unaffected (+0.002).
//   With y230 (cortex x2 + striatum x1 collapses seqchoice -0.25 / -0.43) the pattern is a striatum : cortex size MISMATCH, not a size per se.
//  -> y241: striatum x1 / x2 / x4 against cortex x1 / x2 (context x1), seqchoice x2 + order3 + K4, fresh k 2936-2943.
// usage: node run/r114_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r114'; fs.mkdirSync(out, { recursive: true });
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
// --- Q46 / I104: is the seqchoice collapse a striatum : cortex size mismatch? ---
const CX1 = (...x) => CX4DT('-sc.sizeF@context', '-sc.sizeF@cortex', ...x);
const SQ4 = ['so2', 'scy', 'o3', 'k4'];
J.push(job('y241_cx_striatum_ratio_seqchoice', { q: 'Q46', pri: 0.89, seeds: K(2936, 8), memGB: 2,
  title: 'seqchoice vs striatum : cortex size (cx4dT knobs, context x1): cortex x1 with striatum x1 / x2 / x4, cortex x2 with striatum x2 / x4, and the 1x reference; seqchoice order2 / cycle + order3 + K4, fresh k 2936-2943',
  note: 'y236: on the cx1 brain only removing striatum x4 restores seqchoice (order2 -0.043, cycle +0.021 vs 1x); y230: cortex x2 with striatum x1 collapses it (-0.25 / -0.43). Prediction if it is a size mismatch: cx1 str1 and cx2 str2 near 1x, cx1 str4 and cx2 str4 collapsed, cx1 str2 in between. If cx2 str2 holds seqchoice and keeps the order3 fix, the sized recipe is cortex = striatum (then full-set + book check, I98). Screen, n 8; a winner needs a fresh 16-growth check.',
  arms: [['cx1 str1', CX1('-sc.sizeF@striatum', '-sc.trophMin@striatum'), SQ4, 3], ['cx1 str2', CX1('-sc.sizeF@striatum', 'sc.sizeF@striatum=2'), SQ4, 3.5],
    ['cx1 str4', CX1(), SQ4, 4], ['cx2 str2', CX1('-sc.sizeF@striatum', 'sc.sizeF@cortex=2', 'sc.sizeF@striatum=2'), SQ4, 4],
    ['cx2 str4', CX1('sc.sizeF@cortex=2'), SQ4, 4.5], ['v44 N16000', L(0.2, ...NG(16000)), SQ4, 3]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
