// R111 (Nov 3 2026, morning queue review). No adoption; DEFAULTS_VERSION stays 39 (v46 = deepURSx3 with 32000 granule cells). Every arm pins P.granN.
// Findings behind these jobs (RESULTS R111):
//  y232b (fresh k 2884-2887) sched100k vs fixed at 1M +0.0086 (3/1, t 2.2); with y232a the 8 pre-registered fresh growths +0.0053 (6/2, t 2.2) -> candidate.
//   Adoption needs 16 fresh 1M growths: y238a/b add k 2928-2935. The step at 100k cannot fire on the short set (< 100k teaching events), so the
//   full-set check is an identity check (y238c, cheap) instead of a 16-growth run.
//  y233 (k 2536-2539) sched300k vs sched100k at 1M -0.0015 (1/3); vs fixed +0.0048 (3/1): stepping later is not better -> y239 asks whether earlier (30k)
//   or a lower late rate (0.025) helps at 1M.
//  R110 jobs y235a/b, y236, y237 were never pushed (TacoBell offline); they ride in the same queue bundle.
// usage: node run/r111_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r111'; fs.mkdirSync(out, { recursive: true });
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
// --- Q42: sched100k at 1M, second fresh half to reach 16 held-out growths ---
for (const [s, k0, pri] of [['a', 2928, 0.917], ['b', 2932, 0.912]]) J.push(job(`y238${s}_1x_N32k_sched_book1M_fresh2`, { q: 'Q42', pri, seeds: K(k0, 4), memGB: 3,
  title: `step schedule at 1M, fresh held-out growths 9-16 (part ${s}): 32000 fixed 0.1 (v46) vs 32000 sched100k at book1M, k ${k0}-${k0 + 3}`,
  note: 'Pre-registered (R109): adopt sched100k as the length rule only after 16 fresh 1M growths (mean > 0, losses not > 60%, t > -2 on the 16; y232a/b gave 8: +0.0053, 6/2, t 2.2) and the short set not worse (y238c identity check).',
  arms: [['v44 N32000', L(0.2, ...NG(32000)), ['b1M'], 5.5], ['v44 N32000 sched100k', L(0.2, ...NG(32000), ...SCH(100000)), ['b1M'], 5.5]] }));
J.push(job('y238c_1x_N32k_sched_short_identity', { q: 'Q42', pri: 0.93, seeds: K(2904, 2), memGB: 2,
  title: 'short-set identity check for the step rule: 32000 sched100k on book10k/30k, fables4000, order3, K4, text1000, seqchoice x2, k 2904-2905 (ref: y235a 32000 arm, same growths)',
  note: 'The step fires after 100000 teaching events, so every short task should be bit-identical to v46 (y235a 32000 arm on k 2904-2905). Any difference = the event counter is not what we think -> no adoption until explained.',
  arms: [['v44 N32000 sched100k', L(0.2, ...NG(32000), ...SCH(100000)), ALL, 5.5]] }));
// --- Q42: when / how far to step at 1M (y233: later is not better) ---
J.push(job('y239_1x_N32k_schedEarly_book1M', { q: 'Q42', pri: 0.87, seeds: K(2536, 4), memGB: 3,
  title: 'step time / late rate at 1M: 32000 sched30k (late 0.05) and sched100k late 0.025 at book1M on k 2536-2539 (refs: y229 fixed, y224 sched100k, y233 sched300k, same growths)',
  note: 'Screen (n 4, direction). y233: sched300k -0.0015 vs sched100k (1/3). If sched30k >= sched100k, the step time is not length-bound (anneal early); if late 0.025 > 0.05 by > +0.003, the late rate is the lever. Neither replaces sched100k without its own 16 fresh growths.',
  arms: [['v44 N32000 sched30k', L(0.2, ...NG(32000), ...SCH(30000)), ['b1M'], 5.5], ['v44 N32000 sched100k late025', L(0.2, ...NG(32000), ...SCH(100000, 0.025)), ['b1M'], 5.5]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
