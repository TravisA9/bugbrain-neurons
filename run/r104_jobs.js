// R104 (Oct 30 2026, evening queue review). v45 / DEFAULTS_VERSION 38 unchanged. Every arm pins P.granN, so jobs are default-independent.
// Label note: "v44 N16000" = the v45 default settings (kept for pooling with y193-y222); "v44 N32000" / "v44 N64000" = v45 with more granule cells.
// Findings behind these jobs (RESULTS R104):
//  y217 + y218 (24 fresh growths): demand-grown claws (I105) book10k -0.046 (0/24), book30k -0.031 (0/24), fables4000 -0.022 (0/24); recycle on = off
//   because the pool never fills (box check: granAsg 2972 of 8000 at book10k) -> rejected as built.
//  y219a (y210 growths, n 8): N16000 sched100k vs fixed 0.1 at 300k +0.0029 (6/2), vs fixed 0.05 +0.0005 (5/3); sched30k at 100k = 0.1 (4/4). Waits for y219b.
//  y215 (n 8): smooth30k costs short texts (book10k -0.0029 1/6, book30k -0.0027 1/6) -> the smooth shape is out; only a step that is bit-identical below the switch stays.
//  Box timing (3000 symbols): 16000 / 32000 / 64000 cells = 37 / 73 / 144 s -> runtime ~linear in cells; 64000 peak RSS ~490 MB.
// usage: node run/r104_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r104'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js', 'run/r100_jobs.js', 'run/r102r_jobs.js', 'run/r103_jobs.js', 'run/r104_jobs.js'];
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
// --- heavy (linux-pc / chromium) ---
J.push(job('y223_1x_N32k_fullset_confirm', { q: 'I101', pri: 0.935, seeds: K(2824, 16), memGB: 3, after: 'y222_1x_N32k_heldout_length',
  title: '32000 granule cells full-set confirmation (pre-staged; counts only if y222 passes): v45 (16000) vs 32000 on book10k, book30k, fables4000, order3, K4, text1000, seqchoice order2 / cycle, fresh k 2824-2839',
  note: 'Adopt 32000 cells (v46) only if y222 + y207 (16 growths) beat 16000 sched100k at 300k AND here no task is worse (losses not > 60%, t > -2). y208 / y216 already saw no short-task effect on other growths. Runtime ~2x v45 is the cost to weigh.',
  arms: [['v44 N16000', L(0.2, ...NG(16000)), ALL, 3], ['v44 N32000', L(0.2, ...NG(32000)), ALL, 6]] }));
J.push(job('y226_4x_cx4dT_ctx_fullset', { q: 'I104', pri: 0.93, seeds: K(2840, 16), memGB: 4,
  title: 'sized order3 fix on the full set: cx4dT N16000 with context x4 (as built) vs x2 vs x1, 8 tasks, fresh k 2840-2855',
  note: 'y213 (growths 0-7): dropping the 4x context chain lifts cx4dT order3 by +0.184 (8/0). Question: does a 1x / 2x context chain keep the cx4dT gains elsewhere (book, seqchoice) while fixing order3? The sized plan should use the smallest context that loses nothing (16-growth rule: losses not > 60%, t > -2).',
  arms: [['cx4dT N16000', CX4DT(), ALL, 5], ['cx4dT N16000 ctx2', CX4DT('-sc.sizeF@context', 'sc.sizeF@context=2'), ALL, 5], ['cx4dT N16000 -ctx4', CX4DT('-sc.sizeF@context'), ALL, 5]] }));
J.push(job('y227_1x_N64k_length', { q: 'I101', pri: 0.925, seeds: K(2536, 8), memGB: 3,
  title: 'capacity curve at length: 64000 granule cells at book100k / book300k on k 2536-2543 (refs y193 / y207 N16000 / N32000, y206 sched100k, same growths)',
  note: 'y207: 32000 +0.0075 over 16000 at 300k (8/0). If 64000 adds again at 300k, the text plateau is still a cell-count limit and the sparse granule path becomes mandatory; if it is flat, 32000 is the knee. 100k tells whether the extra cells cost the middle range (32000 was -0.0018 at 100k). ~4x v45 runtime per run.',
  arms: [['v44 N64000', L(0.2, ...NG(64000)), ['b100', 'b300'], 12]] }));
J.push(job('y224_1x_N32k_sched_book1M', { q: 'Q42', pri: 0.91, seeds: K(2536, 4), memGB: 3,
  title: 'capacity vs rule at 1M symbols: 32000 cells + sched100k at book1M on k 2536-2539 (16000-cell 1M arms in y221, same growths)',
  note: 'Pairs with y221: if 32000 sched100k beats 16000 sched100k at 1M by more than at 300k, capacity is the long-text limit; if equal, the step rule is. Runs are long (~5.6 h each on linux-pc).',
  arms: [['v44 N32000 sched100k', L(0.2, ...NG(32000), ...SCH(100000)), ['b1M'], 5.5]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
