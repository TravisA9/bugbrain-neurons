// R95 (Oct 25 2026, evening queue review). Findings behind these jobs (RESULTS R95):
//  y176 (k 2416-2423, 1x): granN 8000 with 3-letter claws ~= 4000 (book30k +0.001, fables -0.003); 16000 +Kmix34 fables +0.005 (7/1) -> at 1x the v44 gain may be the mixed claws, not the cell count.
//  y165 / y173 (cx3): granN 6000 book30k +0.011 (15/1), book100k +0.014 (8/0); granRef 1800 order3 +0.027 (14/1) -> capacity pays more at size and at length.
//  y171a/b: granRef 400 worse (book -0.003..-0.005), 900 flat -> granRef stays 600.  y172: v43 > v42 at fables12000 +0.006 (8/0); anneal adds nothing.
//  y169: output gate 0.2 halves the train-vocabulary word rate (0.052 vs 0.098, 0/8) -> rejected.  y167: striatum x8 hurts seqchoice at cx4dT, x6 flat.
// usage: node run/r95_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r95'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js', 'run/r94_jobs.js'];   // R94 jobs pin every granule setting explicitly, so they mean the same on v43 (a83beaa) and v44 code: no worker update needed
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

const V43 = ['P.granN=4000', 'P.granK=3'], V44 = ['P.granN=8000', 'P.granKmin=3', 'P.granK=4'], V43MIX = ['P.granN=4000', 'P.granKmin=3', 'P.granK=4'];
// --- light 1x (tacobell-eligible) ---
for (const [s, g0] of [['a', 2520], ['b', 2528]]) J.push(job(`y182${s}_1x_v44_KmixSplit`, { q: 'I99', pri: 0.965, seeds: K(g0, 8), title: `which half of v44 carries the gain: v43 / v43 + mixed 3/4 claws (4000 cells) / v44 (8000 cells + mixed claws), 5 seq tasks, fresh k ${g0}-${g0 + 7}`,
  note: 'y176: at 1x, granN 8000 with 3-letter claws ~= 4000 (book30k +0.001, fables -0.003) while 16000 + Kmix34 fables +0.005 (7/1). If 4000 + Kmix34 matches v44 on 16 growths (no task worse), the cheaper brain (~1.45x faster) should replace v44 at 1x and the cell count should scale with cortex size / training length instead.',
  arms: [['v43 1x', V(...V43), FIVE, 1.25], ['v43 Kmix34', V(...V43MIX), FIVE, 1.3], ['v44 1x', V(...V44), FIVE, 1.8]] }));
// --- heavy cx3 (linux-pc: memGB > tacobell maxMemGB; ids carry 3x / book100k) ---
const CX3G = (n, ...x) => VS(CX3, `P.granN=${n}`, 'P.granKmin=3', 'P.granK=4', 'P.granRef=1800', ...x);
J.push(job('y183_3x_cx3_granMix', { q: 'I99', pri: 0.96, seeds: K(1900, 16), memGB: 4, f: 1, title: 'granules sized with the cortex, v44 claws: cx3 granRef 1800 with granN 8000 / 16000 + mixed 3/4 claws, growths 1900-1915 (ref = y165 cx3 granN6000 granRef1800, same growths), 5 seq tasks',
  note: 'y165: cx3 granN 6000 + granRef 1800 vs cx3: book10k +0.010, book30k +0.011, order3 +0.028, fables -0.002, text -0.001. Does the capacity gain keep growing past 6000 at cx3 (unlike 1x, y176), and do mixed claws add on top?',
  arms: [['v44c cx3 N8000 ref1800', CX3G(8000), FIVE, 3], ['v44c cx3 N16000 ref1800', CX3G(16000), FIVE, 4]] }));
J.push(job('y184_3x_cx3_granMix_book100k', { q: 'Q42', pri: 0.955, seeds: K(1400, 8), memGB: 4, title: 'the plateau at size: cx3 granN 16000 + mixed claws + granRef 1800 at book100k, growths 1400-1407 (refs y173: cx3 v42 0.401, cx3 granN6000 granRef1800 0.415)',
  note: 'y173: a 3x-wider granule layer at cx3 gains +0.014 (8/0) at book100k vs +0.011 at 30k: capacity matters more with length. If 16000 + Kmix adds again, the next big-brain text run should size the granule layer with the training length.',
  arms: [['v44c cx3 N16000 ref1800', CX3G(16000), ['b100'], 4]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(32), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
