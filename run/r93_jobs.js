// R93 (Oct 24 2026, 7 PM queue review). Findings behind these jobs (RESULTS R93):
//  y163b published (k 2312-2319); pooled y163a+b (16): granN 8000 + Kmix34 vs v43 book10k +0.0037 (9/6), book30k +0.0063 (12/4), fables +0.0064 (16/0), text +0.0007 (7/6), order3 0.
//  y174a held-out (k 2352-2359, 8 tasks): granN 8000 + Kmix34 book10k +0.002 (4/4), book30k +0.012 (8/0), fables +0.009 (8/0), text 0 (4/2), order3 / K4 / seqchoice identical.
//    + granW 40: book10k +0.006, book30k +0.011 (8/0), fables +0.021 (8/0), text -0.0006 (1/5). y174b (the other 8 held-out growths) not yet published.
//  Length: the bigger mixed granule layer gains more from 10k -> 30k symbols (book30k - book10k: v43 +0.011, granN 8000 (+Kmix34) +0.016, n 24 paired) -> part of the
//    "plateau after 10k" is granule capacity, not the rule. y177 / y178 ask whether that slope keeps growing at fables12k / book100k and with 16000 cells.
// usage: node run/r93_jobs.js <outdir>. Uses only existing code (requires run/r91_jobs.js like R91 / R92), so no worker update is needed.
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r93'; fs.mkdirSync(out, { recursive: true });
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

// --- light 1x job (tacobell-eligible: memGB 1, id avoids its skip patterns) ---
const KM = ['P.granKmin=3', 'P.granK=4'];
J.push(job('y177_1x_v43_granLen_f12', { q: 'Q42', pri: 0.97, seeds: K(2424, 16), title: 'plateau x granule capacity: v43 / granN 8000 Kmix34 (+ granW 40) / granN 16000 Kmix34 on fables4000 and fables12000, fresh k 2424-2439',
  note: 'y163 + y174a: granN 8000 + Kmix34 gains more from 10k -> 30k book symbols (+0.016 vs +0.011 for v43, n 24). If the fables4000 -> 12000 gain also grows with the granule count, the length plateau is (partly) granule capacity / interference and v44+ should size the granule layer with the training length; if not, the plateau is the cortex rule (Q42).',
  arms: [['v43 1x', V(N4), ['f4', 'f12'], 1.25], ['v43 granN8000 Kmix34', V('P.granN=8000', ...KM), ['f4', 'f12'], 1.8], ['v43 granN8000 Kmix34 granW40', V('P.granN=8000', ...KM, 'P.granW=40'), ['f4', 'f12'], 1.8],
    ['v43 granN16000 Kmix34', V('P.granN=16000', ...KM), ['f4', 'f12'], 2.7]] }));
// --- heavy (linux-pc: id contains book100k, which tacobell skips) ---
J.push(job('y178_1x_v43_granLen_book100k', { q: 'Q42', pri: 0.972, seeds: K(2440, 8), memGB: 1.5, title: 'plateau x granule capacity at length: v43 / granN 8000 Kmix34 / granN 16000 Kmix34 on book30k and book100k, fresh k 2440-2447',
  note: 'v42 book100k 0.384 vs book30k ~0.39: flat past 30k. If granN 8000 / 16000 + Kmix34 keep climbing from 30k to 100k (slope > v43 slope by > 0.005), the plateau is granule capacity; if all three flatten, it is the rule (and granAnneal y162 is the other half of that test).',
  arms: [['v43 1x', V(N4), ['b30', 'b100'], 1.25], ['v43 granN8000 Kmix34', V('P.granN=8000', ...KM), ['b30', 'b100'], 1.8], ['v43 granN16000 Kmix34', V('P.granN=16000', ...KM), ['b30', 'b100'], 2.7]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(32), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
