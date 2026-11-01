// R106 (Oct 31 2026, evening queue review). v46 / DEFAULTS_VERSION 39 adopted: plan deepURSx3 grows 32000 granule cells (v45 = deepURSx3v45 / P.granN=16000).
// Every arm pins P.granN (and claws / granW / cortex lr), so these jobs and the pending y221 / y224 / y227 are default-independent (nothing needed pinning).
// Label note: "v44 N32000" = the v46 default settings (kept for pooling with y193-y224); "v44 N16000" = v45; "v44 N64000" = v46 with 2x cells.
// Findings behind these jobs (RESULTS R106):
//  y223 (16 fresh k 2824-2839, 8 tasks) 32000 vs 16000: book10k +0.0003 (8/8), book30k +0.0025 (11/5, t 3.2), fables4000 +0.0014 (11/4), text1000 +0.0003, K4 +0.0002,
//   order3 / seqchoice identical -> no task worse -> v46 adopted (with the y207 + y222 length bar).
//  y219b (fresh k 2808-2815): sched100k vs fixed 0.1 at 300k +0.0013 (5/3); pooled 32 growths +0.0018 (19/13, t 1.8); at 32000 cells (y222) +0.0002 (4/4) -> the step is
//   not adopted; it is only tested again at 1M (y224 + y229).
//  y226 (16 fresh k 2840-2855): cx4dT context x1 vs x4 order3 +0.121 (15/1) but K4 -0.0052 (0/15, t -9.7), text1000 -0.0044 (5/11), seqchoice cycle -0.046 (5/11);
//   context x2 is worse than both on book (book30k -0.0084 vs x4). No context size passes -> y230 looks for the other sized area behind the order3 gap.
// usage: node run/r104_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r106'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js', 'run/r100_jobs.js', 'run/r102r_jobs.js', 'run/r103_jobs.js', 'run/r104_jobs.js', 'run/r106_jobs.js'];
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
J.push(job('y229_1x_cells_x_rule_book1M', { q: 'Q42', pri: 0.92, seeds: K(2536, 4), memGB: 3,
  title: 'cells x rule at 1M symbols (2x2 with y224): 16000 fixed 0.1, 16000 sched100k, 32000 fixed 0.1 (= v46) at book1M on k 2536-2539; supersedes y221 (blocked: its smooth30k arm is rejected and it had no fixed-0.1 reference)',
  note: 'With y224 (32000 sched100k, same growths) this is a 2x2: cell effect = 32000 - 16000 at each rule, rule effect = sched100k - fixed at each size. If the cell effect at 1M is larger than at 300k (+0.0056), capacity is still the long-text limit; if sched100k only helps at 1M, write the length rule. n 4 = direction only.',
  arms: [['v44 N16000', L(0.2, ...NG(16000)), ['b1M'], 3], ['v44 N16000 sched100k', L(0.2, ...NG(16000), ...SCH(100000)), ['b1M'], 3], ['v44 N32000', L(0.2, ...NG(32000)), ['b1M'], 5.5]] }));
J.push(job('y228_1x_N64k_heldout_300k', { q: 'I101', pri: 0.915, seeds: K(2856, 8), memGB: 3, after: 'y227_1x_N64k_length',
  title: '64000 vs 32000 (v46) granule cells at book300k, fresh k 2856-2863 (pre-staged held-out leg for y227; counts only if y227 shows 64000 > 32000 at 300k)',
  note: 'Pre-registered: 64000 goes to a full-set confirmation only if y227 + y228 (16 growths) beat 32000 at 300k (mean > 0, losses not > 60%, t > -2). If y227 is flat this job still adds 8 fresh v46 length references. ~2x v46 runtime per 64000 run (~3.7 h per run on linux-pc).',
  arms: [['v44 N32000', L(0.2, ...NG(32000)), ['b300'], 6], ['v44 N64000', L(0.2, ...NG(64000)), ['b300'], 12]] }));
// --- sized order3 (cheap tasks, any heavy worker) ---
const SIZ = ['o3', 'k4', 'so2', 'scy'];
J.push(job('y230_4x_cx4dT_order3_areas', { q: 'I104', pri: 0.905, seeds: K(2864, 16), memGB: 4,
  title: 'which sized area costs order3: cx4dT N16000 context x1 (y226 best order3) vs + cortex x2 (order3 / K4 / seqchoice) vs + striatum x1 (seqchoice only: the striatum grows only with an outcome, box g2864 order3 identical), plus the 1x reference, fresh k 2864-2879',
  note: 'y226: context x1 lifts cx4dT order3 0.727 -> 0.847 but the 1x brain sits at 0.951, and K4 / seqchoice cycle drop. If striatum x1 or cortex x2 closes the remaining order3 gap without the K4 cost, the sized recipe keeps that area small. Cheap (outcome / short tasks only); 1x arm = gap on the same growths.',
  arms: [['cx4dT N16000 -ctx4', CX4DT('-sc.sizeF@context'), SIZ, 5], ['cx4dT N16000 -ctx4 -str4', CX4DT('-sc.sizeF@context', '-sc.sizeF@striatum', '-sc.trophMin@striatum'), ['so2', 'scy'], 5],
    ['cx4dT N16000 -ctx4 cx2', CX4DT('-sc.sizeF@context', '-sc.sizeF@cortex', 'sc.sizeF@cortex=2'), SIZ, 5], ['v44 N16000', L(0.2, ...NG(16000)), SIZ, 3]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
