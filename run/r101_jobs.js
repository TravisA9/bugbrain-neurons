// R101 (Oct 29 2026, morning queue review). Findings behind these jobs (RESULTS R101):
//  y195a+b (16 fresh growths k 2600-2615): cortex lr 0.15 vs v44 book10k +0.0014 (10/6), book30k +0.0008 (11/5), fables12000 +0.0011 (12/4, t 3.4), text1000 -0.0003 (9/7):
//   nothing worse on 16 held-out growths -> full-task confirmation y214 (rule). cortex lr 0.1: text1000 -0.0036 (5/11) -> rejected at 1x.
//  y194a+b (16 growths): 4000 cells fall behind past 10k (book30k -0.0079, 2/14); 16000 vs 8000 is only +0.001 below 30k -> capacity pays mainly at 100k+.
//  y203 (16 fresh, k 2664-2679): cx3 16000 cells vs 8000 cells (both ref1800) at book100k +0.0063 (14/1, t 5.8; 0.4327) -> sized brains also want more granule cells at length.
//  y205 crashed again (pre-R100 code, Out of memory) because R100 was never pushed. R100 jobs y206-y213 and these need run/r100_jobs.js on the worker.
// usage: node run/r101_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r101'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js', 'run/r96_jobs.js', 'run/r98_jobs.js', 'run/r99_jobs.js', 'run/r100_jobs.js'];
const sq = p => ({ env: 'seq', params: p }), sc = s => ({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
// [task, label, wall s per run per slot on linux-pc for a 1x granule brain (R90 table, as r96_jobs.js; book5k / book20k interpolated)]
const T = { b5: [sq({ source: 'book', nSyms: 5000, evalSyms: 2000 }), 'book5k', 26], b10: [sq({ source: 'book', nSyms: 10000, evalSyms: 2000 }), 'book10k', 47],
  b20: [sq({ source: 'book', nSyms: 20000, evalSyms: 2000 }), 'book20k', 80], b30: [sq({ source: 'book', nSyms: 30000, evalSyms: 2000 }), 'book30k', 109],
  b100: [sq({ source: 'book', nSyms: 100000, evalSyms: 2000 }), 'book100k', 365], b300: [sq({ source: 'book', nSyms: 300000, evalSyms: 2000 }), 'book300k', 1100],
  f4: [sq({ source: 'fables', nSyms: 4000, readIn: 0.01 }), 'fables4000', 27], f12: [sq({ source: 'fables', nSyms: 12000, readIn: 0.01 }), 'fables12000', 81],
  o3: [sq({ source: 'order3', K: 8, readIn: 0.01 }), 'order3', 11], k4: [sq({ source: 'order3', K: 4, readIn: 0.01 }), 'K4', 11], t1: [sq({ source: 'text', nSyms: 1000, readIn: 0.01 }), 'text1000', 15],
  so2: [sc('order2'), 'seqchoice order2', 30], scy: [sc('cycle'), 'seqchoice cycle', 30] };
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1] of o.arms) for (const t of tasks) for (const g of o.seeds) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', JSON.stringify(T[t][0]), '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += T[t][2] * f; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 1, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const W60 = 'P.granW=60', KM = ['P.granKmin=3', 'P.granK=4', W60];
const L = (lr, ...x) => [`pl.lr@cortex=${lr}`].concat(x, ['P.fastEngine=1']).join(',');
const CX3 = ['sc.sizeF@cortex=3', 'sc.divRep@cortex=2', 'sc.trophMin@cortex=0.001667', 'P.fanRef=450', 'P.fanRefR=126', 'pl.lr@cortex=0.2', 'pl.preNorm@cortex=45'];
const VS = (base, ...x) => base.concat(x, ['P.fastEngine=1']).join(',');
const ALL = ['b10', 'b30', 'f4', 'o3', 'k4', 't1', 'so2', 'scy'];
const N16 = ['P.granN=16000', 'P.granKmin=3', 'P.granK=4', W60];
const CX3G = (n, ref, ...x) => VS(CX3, `P.granN=${n}`, 'P.granKmin=3', 'P.granK=4', `P.granRef=${ref}`, W60, ...x);
const CX3V42 = (...x) => VS(CX3, 'P.mixInhRef=850', 'P.granN=2000', 'P.granRef=600', 'P.granK=3', ...x);
const STR = k => [`sc.sizeF@striatum=${k}`, `sc.trophMin@striatum=${+(0.005 / k).toFixed(6)}`], CONE = ['P.sizeCone=1', 'P.recvBudget=2'];
const SCH = (T, late = 0.05, shape) => [`P.granLrT=${T}`, `P.granLrLate=${late}`].concat(shape ? [`P.granLrShape=${shape}`] : []);
const N32 = ['P.granN=32000', 'P.granKmin=3', 'P.granK=4', W60];
const CX4DT = (...x) => ['sc.sizeF@cortex=4', 'sc.divRep@cortex=2', 'sc.trophMin@cortex=0.00125', 'P.fanRef=450', 'P.fanRefR=126', 'pl.lr@cortex=0.2', 'pl.preNorm@cortex=45',
  'sc.sizeF@context=4', 'sc.sizeF@striatum=4', 'sc.trophMin@striatum=0.00125', 'P.sizeCone=1', 'P.recvBudget=2', 'P.postCapRel=1.5', 'P.thinF=5', 'P.granN=16000', 'P.granKmin=3', 'P.granK=4', 'P.granRef=600', W60]
  .filter(s => !x.some(d => d.startsWith('-') && s.startsWith(d.slice(1) + '='))).concat(x.filter(d => !d.startsWith('-')), ['P.fastEngine=1']).join(',');
// --- light 1x (tacobell-eligible: memGB 1, no book100k / book300k) ---
J.push(job('y214_1x_cxlr015_allround', { q: 'Q42', pri: 0.925, seeds: K(2752, 16),
  title: 'cortex lr 0.15 full-task confirmation: v44 vs v44 cortex lr 0.15 on book10k, book30k, fables4000, order3, K4, text1000, seqchoice order2 / cycle, fresh k 2752-2767',
  note: 'y195a+b (16 held-out growths): cxlr0.15 nothing worse (book10k +0.0014 10/6, book30k +0.0008, fables12000 +0.0011 12/4 t 3.4, text1000 -0.0003 9/7); at length y197 100k -0.0011 (2/6), 300k +0.0019 (5/3). Adopt as v44 cortex step only if no task is worse here (losses not > 60%, t > -2) and the gain is consistent.',
  arms: [['v44 1x', L(0.2, 'P.granN=8000', ...KM), ALL, 1.8], ['v44 cxlr0.15', L(0.15, 'P.granN=8000', ...KM), ALL, 1.8]] }));
J.push(job('y215_1x_N16k_smoothSched_short', { q: 'Q42', pri: 0.91, seeds: K(2768, 8),
  title: 'short-task safety of the smooth granule step schedule: 16000 cells vs 16000 cells + smooth schedule (T 30k, late 0.05) on book10k, book30k, fables4000, text1000, fresh k 2768-2775',
  note: 'A step at 30k / 100k is identical to granLr 0.1 below the switch, but the smooth shape already lowers the step before 30k. If y206 favours the smooth shape, this says whether it costs short texts.',
  arms: [['v44 N16000', L(0.2, ...N16), ['b10', 'b30', 'f4', 't1'], 3], ['v44 N16000 smooth30k', L(0.2, ...N16, ...SCH(30000, 0.05, 1)), ['b10', 'b30', 'f4', 't1'], 3]] }));
// --- heavy (linux-pc / chromium) ---
J.push(job('y216_1x_N32k_order3_seqchoice', { q: 'Q46', pri: 0.915, seeds: K(2776, 8), memGB: 3,
  title: 'order3 and seqchoice at large granule counts: v44 vs 16000 vs 32000 cells on order3, K4, seqchoice order2 / cycle, fresh k 2776-2783',
  note: 'Capacity has only been measured on text. If 32000 cells cost order3 / seqchoice (as size costs order3 at cx4dT), cell count must be tied to the task; if not, the 1x line can keep growing.',
  arms: [['v44 1x', L(0.2, 'P.granN=8000', ...KM), ['o3', 'k4', 'so2', 'scy'], 1.8], ['v44 N16000', L(0.2, ...N16), ['o3', 'k4', 'so2', 'scy'], 3], ['v44 N32000', L(0.2, ...N32), ['o3', 'k4', 'so2', 'scy'], 6]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
