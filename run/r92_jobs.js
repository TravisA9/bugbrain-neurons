// R92 (Oct 24 2026, 7 AM queue review). Findings behind these jobs (RESULTS R92):
//  y160a/b v43 worker held-out (k 2272-2287, 8 tasks): book10k +0.008 (16/0), book30k +0.011 (15/1), fables 0, order3 / seqchoice identical, text1000 -0.0013 (4/9, t -2.0);
//    pooled with the box block (32 growths) text -0.00045 (9/14, t -1.0) = the same tiny text drift v42 showed -> y175 measures v41 / v42 / v43 text1000 on 48 fresh growths.
//  y161a/b granAnneal 5000 / 20000 at 10k-30k: flat (|d| <= 0.001 everywhere); 5000 min0.5 == 5000 (the floor never binds) -> rejected at 1x; y162 (100k / 300k) still decides the plateau case.
//  y163a (+ unpublished y163b partial, 135/200 runs): granN 8000 + mixed 3/4-letter claws is the only arm up on every text task (book30k +0.007, fables +0.0065 (8/0), text +0.001);
//    granN 8000 alone book30k +0.006 (15/1) but fables -0.001; granW 40 fables +0.014 (8/0) but book30k -0.002 again -> y174 = held-out on all 8 tasks for N8000+Kmix34, y176 = the capacity curve.
// usage: node run/r92_jobs.js <outdir>. Uses only existing code (requires run/r91_jobs.js like R91), so no worker update is needed.
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r92'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js'];   // R92 jobs need no new code
const sq = p => ({ env: 'seq', params: p }), sc = s => ({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
// [task, label, wall s per run per slot on linux-pc for a 1x granule brain (R90 table; seqchoice / K4 from the R91 box run)]
const T = { b10: [sq({ source: 'book', nSyms: 10000, evalSyms: 2000 }), 'book10k', 47], b30: [sq({ source: 'book', nSyms: 30000, evalSyms: 2000 }), 'book30k', 109],
  b100: [sq({ source: 'book', nSyms: 100000, evalSyms: 2000 }), 'book100k', 365], b300: [sq({ source: 'book', nSyms: 300000, evalSyms: 2000 }), 'book300k', 1100],
  f4: [sq({ source: 'fables', nSyms: 4000, readIn: 0.01 }), 'fables4000', 27], f12: [sq({ source: 'fables', nSyms: 12000, readIn: 0.01 }), 'fables12000', 81],
  o3: [sq({ source: 'order3', K: 8, readIn: 0.01 }), 'order3', 11], k4: [sq({ source: 'order3', K: 4, readIn: 0.01 }), 'K4', 11], t1: [sq({ source: 'text', nSyms: 1000, readIn: 0.01 }), 'text1000', 15],
  so2: [sc('order2'), 'seqchoice order2', 30], scy: [sc('cycle'), 'seqchoice cycle', 30] };
const FIVE = ['b10', 'b30', 'f4', 'o3', 't1'], ALL = ['b10', 'b30', 'f4', 'o3', 'k4', 't1', 'so2', 'scy'], SEVEN = ['b10', 'b30', 'f4', 'o3', 't1', 'so2', 'scy'];
const V = (...x) => ['pl.lr@cortex=0.2'].concat(x, ['P.fastEngine=1']).join(',');
const CX3 = ['sc.sizeF@cortex=3', 'sc.divRep@cortex=2', 'sc.trophMin@cortex=0.001667', 'P.fanRef=450', 'P.fanRefR=126', 'pl.lr@cortex=0.2', 'pl.preNorm@cortex=45'];
const CX4DT = ['sc.sizeF@cortex=4', 'sc.divRep@cortex=2', 'sc.trophMin@cortex=0.00125', 'P.fanRef=450', 'P.fanRefR=126', 'pl.lr@cortex=0.2', 'pl.preNorm@cortex=45',
  'sc.sizeF@context=4', 'sc.sizeF@striatum=4', 'sc.trophMin@striatum=0.00125', 'P.sizeCone=1', 'P.recvBudget=2', 'P.postCapRel=1.5', 'P.thinF=5'];
const VS = (base, ...x) => base.concat(x, ['P.fastEngine=1']).join(',');   // sized variants (base already carries the cortex rate / preNorm pins)
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1, script = 'run/r42.js', extra = {}] of o.arms) for (const t of (tasks || FIVE)) for (const g of o.seeds) {
    const task = T[t][0], tj = JSON.stringify(Object.assign({}, task, { params: Object.assign({}, task.params, extra.params || {}) }));
    runs.push({ script, args: ['deepURSx3', tj, '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: Object.assign({ BB_OUT: `results/phone/${id}.jsonl` }, extra.env || {}) });
    sec += T[t][2] * f * (o.f || 1); }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ.concat(o.req || []), title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 1, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const N2 = 'P.granN=2000', N4 = 'P.granN=4000';   // every 1x arm pins its granule count (v42 = 2000, v43 = 4000), so the jobs mean the same before / after the default change
const AN = (a, m = 0.25) => [`P.granAnneal=${a}`, `P.granAnnealMin=${m}`];

// --- light 1x jobs (tacobell-eligible: memGB 1, ids avoid its skip patterns) ---
const KM = ['P.granKmin=3', 'P.granK=4'];
for (const [s, g] of [['a', K(2352, 8)], ['b', K(2360, 8)]])
  J.push(job(`y174${s}_1x_v43_granN8kKmix`, { q: 'I99', pri: 0.985, seeds: g, title: `granule capacity III held-out: granN 8000 + mixed 3/4-letter claws vs v43 on all 8 tasks (+ granW 40 on 5 seq tasks), fresh k ${g[0]}-${g[7]}`,
    note: 'y163a/b (k 2304-2319): granN 8000 + Kmix34 book10k +0.004, book30k +0.007 (12/3), fables +0.0065 (8/0 on y163a), text +0.001, order3 0: the only arm up on every text task. Adopt as v44 only if y163b holds AND these 16 fresh growths show no task worse (incl. K4 / seqchoice). Cost ~1.45x v43 runtime. granW 40 on top asks whether the big mixed layer removes its book cost.',
    arms: [['v43 1x', V(N4), ALL, 1.25], ['v43 granN8000 Kmix34', V('P.granN=8000', ...KM), ALL, 1.8], ['v43 granN8000 Kmix34 granW40', V('P.granN=8000', ...KM, 'P.granW=40'), FIVE, 1.8]] }));
J.push(job('y175_1x_text_drift', { q: 'I99', pri: 0.98, seeds: K(2368, 48), title: 'cumulative text1000 drift across adoptions: v41 / v42 / v43 on 48 fresh growths k 2368-2415, text1000 only',
  note: 'v42 (pooled 32: text -0.0004, 11/14, t -1.0) and v43 (pooled 32: -0.00045, 9/14, t -1.0) were each adopted with a tiny non-significant text dip. Two in a row may be a real cumulative cost. 48 paired growths per step settle it (~0.0003 resolution).',
  arms: [['v41 1x', V(N2, 'P.granRef=100'), ['t1']], ['v42 1x', V(N2), ['t1']], ['v43 1x', V(N4), ['t1'], 1.25]] }));
J.push(job('y176_1x_v43_granCurve', { q: 'I99', pri: 0.95, seeds: K(2416, 8), title: 'granule capacity curve: granN 4000 / 8000 / 16000 (+ 16000 mixed claws) on book10k / book30k / fables4000, fresh k 2416-2423',
  note: 'granN 2000 -> 4000: book30k +0.011; 4000 -> 8000: about +0.006. If 16000 adds ~+0.003 the gain halves per doubling (capacity saturates near ~0.41 and the rest is the readout / rule); if it adds as much as 8000 did, capacity is still the main lever.',
  arms: [['v43 1x', V(N4), ['b10', 'b30', 'f4'], 1.25], ['v43 granN8000', V('P.granN=8000'), ['b10', 'b30', 'f4'], 1.7], ['v43 granN16000', V('P.granN=16000'), ['b10', 'b30', 'f4'], 2.6],
    ['v43 granN16000 Kmix34', V('P.granN=16000', ...KM), ['b10', 'b30', 'f4'], 2.7]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(32), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
