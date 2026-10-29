// R102 (Oct 29 2026). Demand-grown granule claws, off by default. NOT a default change (v44 / DEFAULTS_VERSION 37 stay).
// Hypothesis: demand-grown claws from repeated co-occurrence vs random sparse claws at the same N.
// v44 pre-allocates granN=8000 granules with random mixed 3/4-letter claws. P.granDemand=1 leaves that pool empty and,
// once a lag window (t .. t-k+1, k from granKmin to granK) has been seen P.granCo times (default 2) inside a capped
// recent table, assigns an unused granule those claws. The pool cannot exceed granN. P.granRecycle=1 (default when the
// mode is on) rewrites the least-used granule older than P.granHold events (0 = 32). Counts are an LRU map, not a dense
// n-gram matrix. Both arms pin P.granN=8000 so the cap matches. r42 stats granAsg / granRec / granPend are the growth
// dynamics (means over the life). Adoption rule, not applied by this round: 16 fresh growths, no task worse
// (losses not > 60%, t > -2) AND granAsg near 8000. If granAsg is far below 8000 the cell counts are not matched.
// Enable: P.granDemand=1 (optional P.granCo=2, P.granRecycle=1, P.granMap=0, P.granHold=0). Off: omit P.granDemand or set 0.
// usage: node run/r102_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r102'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'run/lib.js', 'run/mempar.js', 'js/core/base.js', 'js/core/net.js', 'js/core/regions.js', 'run/r102_jobs.js'];
const sq = p => ({ env: 'seq', params: p }), sc = s => ({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
// [task, label, wall s per run per slot on linux-pc for a 1x granule brain (R90 table, as r101_jobs.js)]
const T = { b10: [sq({ source: 'book', nSyms: 10000, evalSyms: 2000 }), 'book10k', 47],
  b30: [sq({ source: 'book', nSyms: 30000, evalSyms: 2000 }), 'book30k', 109],
  f4: [sq({ source: 'fables', nSyms: 4000, readIn: 0.01 }), 'fables4000', 27],
  o3: [sq({ source: 'order3', K: 8, readIn: 0.01 }), 'order3', 11], k4: [sq({ source: 'order3', K: 4, readIn: 0.01 }), 'K4', 11],
  t1: [sq({ source: 'text', nSyms: 1000, readIn: 0.01 }), 'text1000', 15],
  so2: [sc('order2'), 'seqchoice order2', 30], scy: [sc('cycle'), 'seqchoice cycle', 30] };
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1] of o.arms) for (const t of tasks) for (const g of o.seeds) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', JSON.stringify(T[t][0]), '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += T[t][2] * f; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 1.5, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const W60 = 'P.granW=60', KM = ['P.granKmin=3', 'P.granK=4', W60];
const L = (lr, ...x) => [`pl.lr@cortex=${lr}`].concat(x, ['P.fastEngine=1']).join(',');
const ALL = ['b10', 'b30', 'f4', 'o3', 'k4', 't1', 'so2', 'scy'];
const V44 = L(0.2, 'P.granN=8000', ...KM);
const DEM = (co, rec) => L(0.2, 'P.granN=8000', ...KM, 'P.granDemand=1', `P.granCo=${co}`, `P.granRecycle=${rec}`);
const RULE = 'Hypothesis: demand-grown claws from repeated co-occurrence vs random sparse claws at the same N. Do NOT adopt from this job. v44 / DEFAULTS_VERSION 37 stay. Read it with the 16-growth rule (no task worse: losses not > 60%, t > -2) only together with granAsg near 8000 (matched final cell count). granAsg / granRec / granPend are in the r42 stats.';
// --- light 1x (memGB 1.5, no book100k / book300k) ---
J.push(job('y217_1x_granDemand_heldout', { q: 'I105', pri: 0.905, seeds: K(2784, 16),
  title: 'demand-grown granule claws vs v44 random claws at granN 8000: book10k, book30k, fables4000, order3, K4, text1000, seqchoice order2 / cycle, fresh k 2784-2799',
  note: RULE + ' Arm is P.granDemand=1, P.granCo=2, P.granRecycle=1 (least-used granule past the grace window is rewritten when the pool is full). Seqchoice grows no granule layer; it is the unchanged-task check.',
  arms: [['v44 1x', V44, ALL, 1.8], ['v44 granDemand co2', DEM(2, 1), ALL, 2]] }));
J.push(job('y218_1x_granDemand_recycle', { q: 'I105', pri: 0.9, seeds: K(2800, 8),
  title: 'demand-grown claws, recycle on vs off, at granN 8000: book10k, book30k, fables4000, text1000, fresh k 2800-2807',
  note: RULE + ' Same co-occurrence threshold (2). granRecycle=0 stops at the cap; granRecycle=1 rewrites the least-used granule. granAsg should match across the two demand arms when the pool fills; granRec says whether later patterns replaced early ones.',
  arms: [['v44 1x', V44, ['b10', 'b30', 'f4', 't1'], 1.8], ['v44 granDemand co2', DEM(2, 1), ['b10', 'b30', 'f4', 't1'], 2], ['v44 granDemand co2 norecycle', DEM(2, 0), ['b10', 'b30', 'f4', 't1'], 2]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
