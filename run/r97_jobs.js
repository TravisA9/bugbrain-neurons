// R97 (Oct 26 2026, evening queue review). Findings behind these jobs (RESULTS R97):
//  y182a (box, fresh k 2520-2527, 5 seq tasks): claws vs cells at 1x. v43 + mixed 3/4 claws (4000 cells) carries the whole fables gain of v44
//  (+0.0045 8/0 vs v44 +0.0047 7/1) but none of the book30k gain (-0.003 4/4 vs v44 +0.005 6/1; Kmix@4000 vs v44 -0.008 1/7).
//  With y159 (all-4 claws at 2000 / 4000: fables +0.012, book30k -0.014 / 0) and y176 (8000 / 16000 cells with 3 claws: flat), the gain is an
//  interaction: 4-letter claws help short text, but cost long text unless the layer has enough cells to cover the rarer 4-letter combinations.
//  Prediction: at 16000 cells the best claw mix shifts toward 4 claws, and the extra capacity pays most at length.
// Every arm pins its granule settings incl. P.granW, so the jobs mean the same on v44 and later code (they require this file, so a83beaa workers skip them).
// usage: node run/r97_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r97'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js', 'run/r96_jobs.js', 'run/r97_jobs.js'];
const sq = p => ({ env: 'seq', params: p });
// [task, label, wall s per run per slot on linux-pc for a 1x granule brain (R90 table, as r96_jobs.js)]
const T = { b10: [sq({ source: 'book', nSyms: 10000, evalSyms: 2000 }), 'book10k', 47], b30: [sq({ source: 'book', nSyms: 30000, evalSyms: 2000 }), 'book30k', 109],
  b100: [sq({ source: 'book', nSyms: 100000, evalSyms: 2000 }), 'book100k', 365], b300: [sq({ source: 'book', nSyms: 300000, evalSyms: 2000 }), 'book300k', 1100],
  f4: [sq({ source: 'fables', nSyms: 4000, readIn: 0.01 }), 'fables4000', 27], f12: [sq({ source: 'fables', nSyms: 12000, readIn: 0.01 }), 'fables12000', 81],
  o3: [sq({ source: 'order3', K: 8, readIn: 0.01 }), 'order3', 11], t1: [sq({ source: 'text', nSyms: 1000, readIn: 0.01 }), 'text1000', 15] };
const SIX = ['b10', 'b30', 'b100', 'f4', 'f12', 'o3', 't1'];
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1] of o.arms) for (const t of tasks) for (const g of o.seeds) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', JSON.stringify(T[t][0]), '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += T[t][2] * f; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 1, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const W60 = 'P.granW=60', V44 = ['P.granN=8000', 'P.granKmin=3', 'P.granK=4', W60];
const L = (...x) => ['pl.lr@cortex=0.2'].concat(x, ['P.fastEngine=1']).join(',');
// --- y192a/b: claw mix x capacity at 1x (book100k included: heavy for tacobell) ---
for (const [s, g0] of [['a', 2568], ['b', 2576]]) J.push(job(`y192${s}_1x_N16k_clawMix`, { q: 'I99', pri: 0.958, seeds: K(g0, 8), memGB: 1.5,
  title: `claws x cells at 1x: v44 / 16000 cells + mixed 3/4 claws / 16000 cells all 4-letter claws, 7 seq tasks incl. book100k and fables12000, fresh k ${g0}-${g0 + 7}`,
  note: 'y182a: mixed claws at 4000 cells give the fables gain but not the book30k gain; v44 (8000) gives both. y159: all-4 claws at 2000 fables +0.012, book30k -0.014. If at 16000 cells all-4 claws beat the 3/4 mix on book30k / book100k without a fables or text cost, the claw length should grow with the cell count (a sizing rule, not a constant).',
  arms: [['v44 1x', L(...V44), SIX, 1.8], ['v44 N16000', L('P.granN=16000', 'P.granKmin=3', 'P.granK=4', W60), SIX, 3], ['v44 N16000 K4only', L('P.granN=16000', 'P.granKmin=4', 'P.granK=4', W60), SIX, 3]] }));
// --- y193: capacity vs rule at length, same growths as y185b (k 2536-2543; its v44 1x / cxlr0.1 / granLr0.05 book100k + book300k arms are the references) ---
J.push(job('y193_1x_N16k_book300k', { q: 'Q42', pri: 0.965, seeds: K(2536, 8), memGB: 2,
  title: '1x capacity at length: 16000 granule cells + mixed 3/4 claws at book100k / book300k on the y185b growths k 2536-2543 (refs: y185b v44 1x, cxlr0.1, granLr0.05, same growths)',
  note: 'y162b: the 1x brain is worse at 300k than at 100k. y185b tests the step sizes; this tests capacity on the same growths. If 16000 cells rise past 100k while v44 does not, the 1x plateau is capacity, not the rule.',
  arms: [['v44 N16000', L('P.granN=16000', 'P.granKmin=3', 'P.granK=4', W60), ['b100', 'b300'], 3]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(34), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
