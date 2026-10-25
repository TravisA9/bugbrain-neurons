// R94 (Oct 25 2026, morning queue review). Findings behind these jobs (RESULTS R94):
//  y174b held-out (linux-pc, k 2360-2367, 8 tasks): granN 8000 + Kmix34 vs v43 book10k -0.001 (4/4), book30k +0.006 (6/2), fables +0.006 (6/2), text -0.001 (2/6, t -1.0),
//    order3 / seqchoice identical, K4 -0.0003 (0/1). Pooled y174a+b (16): book30k +0.009 (14/2, t 4.8), fables +0.007 (14/2, t 5.1), book10k 0 (8/8), text -0.0003 (6/8, t -0.8)
//    -> no task worse -> v44 (DEFAULTS_VERSION 37) = deepURSx3 with 8000 granules, mixed 3/4-letter claws. granW 40 on top (16): book10k +0.006, book30k +0.008 (16/0), fables +0.020 (16/0), text -0.0007 (3/11, t -1.7).
//  y175 (48 fresh growths, text1000 only): v42 vs v41 -0.0003 (16/27, t -1.3), v43 vs v41 -0.0011 (11/33, t -2.4): the granule adoptions add up to a small, now significant text1000 cost.
//  y162a (linux-pc, k 1400-1407): granAnneal 5000 / 20000 at book100k -0.002 / +0.001, fables12000 0 / 0 -> granAnneal rejected at length too (I100).
// Every arm below pins its granule settings (V43 / V44), so the jobs mean the same before and after workers update to the v44 code.
// usage: node run/r94_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r94'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js'];   // R94 jobs pin every granule setting explicitly, so they mean the same on v43 (a83beaa) and v44 code: no worker update needed
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

const V43 = ['P.granN=4000', 'P.granK=3'], V44 = ['P.granN=8000', 'P.granKmin=3', 'P.granK=4'], SIX = ['b10', 'b30', 'f4', 'o3', 'k4', 't1'];
// --- light 1x jobs (tacobell-eligible: memGB 1, ids avoid its skip patterns) ---
for (const [s, g0] of [['a', 2448], ['b', 2456]]) J.push(job(`y179${s}_1x_v44_heldout`, { q: 'I99', pri: 0.98, seeds: K(g0, 8), title: `v44 worker confirmation + granW 40 (v45 candidate): v43 / v44 on all 8 tasks, v44 granW 40 on the 6 seq tasks (seqchoice has no granule layer), fresh k ${g0}-${g0 + 7}`,
  note: 'v44 adopted R94 on y174a+b (16 growths). Second fresh block: v44 vs v43 should repeat book30k / fables up, text1000 within noise. granW 40 vs v44: fables +0.020 (16/0), book +0.006 / +0.008 on y174 (vs v43), text -0.0007 (3/11, t -1.7). If granW 40 again shows no task worse vs v44 over y179a+b (16), it is the v45 candidate; if text1000 goes significant (t < -2 pooled with y174), it fails no-task-worse.',
  arms: [['v43 1x', V(...V43), ALL, 1.25], ['v44 1x', V(...V44), ALL, 1.8], ['v44 granW40', V(...V44, 'P.granW=40'), SIX, 1.8]] }));
J.push(job('y180a_1x_v44_textGuard', { q: 'I99', pri: 0.955, seeds: K(2464, 48), title: 'text1000 guard: does the granule pathway\'s learned gain cost short text? v43 / v44 / v44 granGain 0.001 / 0.01 on text1000, 48 fresh growths k 2464-2511',
  note: 'y175: v43 vs v41 text1000 -0.0011 (11/33, t -2.4, n 48); v44 adds -0.0003 (n.s.). The gain psi (granGain = its learning rate) should silence the granule pathway when it does not help; on 1000 symbols it may move too slowly (0.01) or overshoot (0.001). A setting that recovers >= +0.0008 on text without costing book10k / fables (y180b) is a text fix.',
  arms: [['v43 1x', V(...V43), ['t1'], 1.25], ['v44 1x', V(...V44), ['t1'], 1.8], ['v44 granGain0.001', V(...V44, 'P.granGain=0.001'), ['t1'], 1.8], ['v44 granGain0.01', V(...V44, 'P.granGain=0.01'), ['t1'], 1.8]] }));
J.push(job('y180b_1x_v44_textGuard', { q: 'I99', pri: 0.95, seeds: K(2464, 16), title: 'text1000 guard cost check: v44 / granGain 0.001 / 0.01 on book10k + fables4000, k 2464-2479 (same growths as y180a)',
  note: 'pairs with y180a: a text fix must not cost book10k / fables.',
  arms: [['v44 1x', V(...V44), ['b10', 'f4'], 1.8], ['v44 granGain0.001', V(...V44, 'P.granGain=0.001'), ['b10', 'f4'], 1.8], ['v44 granGain0.01', V(...V44, 'P.granGain=0.01'), ['b10', 'f4'], 1.8]] }));
// --- heavy (linux-pc: id contains book300k, which tacobell skips) ---
J.push(job('y181_1x_v44_book300k', { q: 'Q42', pri: 0.93, seeds: K(2512, 8), memGB: 1.5, title: 'the plateau at 300k symbols with the bigger granule layer: v43 / v44 at book300k, fresh k 2512-2519 (30k / 100k = y178)',
  note: 'v42 book100k 0.384 vs 30k ~0.39; y93 v39 flat to 1M. If v44 keeps climbing 100k -> 300k (y178 + this) while v43 is flat, the length plateau is granule capacity and the next step is sizing the layer with training length; if both are flat at 300k, the limit is the cortex / readout rule.',
  arms: [['v43 1x', V(...V43), ['b300'], 1.25], ['v44 1x', V(...V44), ['b300'], 1.8]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(32), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
