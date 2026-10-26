// R96 (Oct 26 2026, morning queue review). Findings behind these jobs (RESULTS R96):
//  y179a+b (box, fresh k 2448-2463, 8 tasks): v44 vs v43 confirmed (book30k +0.009 14/2, fables +0.005 14/2, nothing worse); granW 40 on v44 -> see RESULTS R96.
//  y162b (linux-pc, k 1400-1407): v43 1x book300k 0.394 < book100k 0.398 on the same growths: past 100k the 1x brain gets slightly WORSE, and granAnneal does not help (+0.0003).
//  y173 / y165 (cx3): granN 6000 + granRef 1800 book100k +0.014 (8/0), book30k +0.011: capacity pays more at size and length.
//  y167 / y166: seqchoice at size still broken (cx4dT 4.5 vs 1x 6.4, striatum x8 worse; cx3 recipe 1.6), granule changes never touch it.
// Every arm pins its granule settings incl. P.granW, so the jobs mean the same on v43 (a83beaa), v44 and later code.
// usage: node run/r96_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r96'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js', 'run/r96_jobs.js'];   // R94 jobs pin every granule setting explicitly, so they mean the same on v43 (a83beaa) and v44 code: no worker update needed
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
const W60 = 'P.granW=60', V44 = ['P.granN=8000', 'P.granKmin=3', 'P.granK=4', W60], N16 = ['P.granN=16000', 'P.granKmin=3', 'P.granK=4'];
const L = (lr, ...x) => [`pl.lr@cortex=${lr}`].concat(x, ['P.fastEngine=1']).join(',');   // 1x variants with an explicit cortex rate (no double pin)
// --- heavy 1x at length (book100k / book300k: tacobell skips) ---
for (const [s, g0, ref300] of [['a', 2512, false], ['b', 2536, true]]) J.push(job(`y185${s}_1x_v44_lenRule_book300k`, { q: 'Q42', pri: 0.97, seeds: K(g0, 8), memGB: 1.5,
  title: `the learning rule at length: v44 at book100k / book300k with half the cortex step (lr 0.1) or half the granule NLMS step (granLr 0.05), plus granW 40 at 100k, k ${g0}-${g0 + 7}` + (ref300 ? '' : ' (book300k refs v43 / v44 = y181, same growths)'),
  note: 'y162b: the 1x brain is slightly worse at 300k than at 100k (0.394 vs 0.398) and granAnneal does not help; if a smaller main-cortex or granule step lifts 300k above 100k, the plateau is a step-size (rule) problem and an annealed cortex step is the next design.',
  arms: [['v44 1x', L(0.2, ...V44), ref300 ? ['b100', 'b300'] : ['b100'], 1.8], ['v44 cxlr0.1', L(0.1, ...V44), ['b100', 'b300'], 1.8], ['v44 granLr0.05', L(0.2, ...V44, 'P.granLr=0.05'), ['b100', 'b300'], 1.8],
    ['v44 granW40', L(0.2, 'P.granN=8000', 'P.granKmin=3', 'P.granK=4', 'P.granW=40'), ['b100'], 1.8]] }));
// --- heavy cx3 (memGB 4: linux-pc) ---
const CX3V42 = (...x) => VS(CX3, 'P.mixInhRef=850', 'P.granN=2000', 'P.granRef=600', 'P.granK=3', ...x);
J.push(job('y187_3x_cx3_seqchoice_cone', { q: 'Q46', pri: 0.94, seeds: K(1900, 16), memGB: 4, title: 'seqchoice at size: the cx3 all-round recipe (cx3 + mixInhRef 850, v42 granules) + sizeCone + recvBudget 2 (the all2/all4 seqchoice fix), +/- striatum sized x3, growths 1900-1915 (ref = y166 v42 cx3 ref850, same growths), 7 tasks',
  note: 'y166: cx3 ref850 seqchoice order2 1.61 vs 1x ~6.3 (divRep kills it); all2 sizeCone recvBudget2 reached 6.7 (y-R72). If the cone + receive budget restores seqchoice at cx3 without costing book / order3, one sized brain for all tasks (I98) becomes possible.',
  arms: [['v42 cx3 ref850 cone rb2', CX3V42('P.sizeCone=1', 'P.recvBudget=2'), SEVEN, 3], ['v42 cx3 ref850 cone rb2 str3', CX3V42('P.sizeCone=1', 'P.recvBudget=2', 'sc.sizeF@striatum=3', 'sc.trophMin@striatum=0.001667'), SEVEN, 3]] }));
const CX3G = (n, ...x) => VS(CX3, `P.granN=${n}`, 'P.granKmin=3', 'P.granK=4', 'P.granRef=1800', W60, ...x);
J.push(job('y190_3x_cx3_granMix_book300k', { q: 'Q42', pri: 0.93, seeds: K(1400, 8), memGB: 4, title: 'the plateau at size and 300k: cx3 v42 granules vs cx3 granN 16000 + mixed claws + granRef 1800 at book300k, growths 1400-1407 (100k refs y173 / y184; 1x 300k ref y162b)',
  note: 'At 1x, 300k < 100k (y162b). Does a 3x cortex with a 16000-cell granule layer keep rising past 100k? If yes, size (not the rule) is the plateau at 1x.',
  arms: [['v42 cx3', VS(CX3, 'P.granN=2000', 'P.granRef=600', 'P.granK=3'), ['b300'], 3], ['v44c cx3 N16000 ref1800', CX3G(16000), ['b300'], 4]] }));
const CX4G = (ref) => VS(CX4DT, 'P.granN=16000', 'P.granKmin=3', 'P.granK=4', `P.granRef=${ref}`, W60);
J.push(job('y191_4x_cx4dT_granN16k', { q: 'I99', pri: 0.935, seeds: K(0, 8), memGB: 3.5, title: 'order3 / book at 4x: cx4dT with 16000 granule cells + mixed claws, granRef 600 vs 1800, growths 0-7 (refs y168 v42 cx4dT / granN8000, same growths), 7 tasks',
  note: 'y168: cx4dT granN 8000 book30k +0.010 (8/0). y165: granRef 1800 order3 +0.027 at cx3. Does the next capacity step keep paying at 4x, and does the order3 fix carry to 4x?',
  arms: [['v44c cx4dT N16000', CX4G(600), SEVEN, 6], ['v44c cx4dT N16000 ref1800', CX4G(1800), SEVEN, 6]] }));
// --- light 1x (tacobell-eligible) ---
for (const [s, g0] of [['a', 2552], ['b', 2560]]) J.push(job(`y189${s}_1x_v44_N16k`, { q: 'I99', pri: 0.95, seeds: K(g0, 8), title: `granule capacity at 1x with v44 claws: v44 / 16000 cells + mixed claws / 16000 + granW 40, 5 seq tasks, fresh k ${g0}-${g0 + 7}`,
  note: 'y176: at 1x 16000 + Kmix34 fables +0.005 (7/1), cells alone flat; y177: 16000 steepens the fables length slope. Held-out test of the next capacity step (~2x v44 runtime).',
  arms: [['v44 1x', L(0.2, ...V44), FIVE, 1.8], ['v44 N16000', L(0.2, ...N16, W60), FIVE, 3], ['v44 N16000 granW40', L(0.2, ...N16, 'P.granW=40'), FIVE, 3]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(34), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
