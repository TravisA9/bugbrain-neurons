// R98 (Oct 27 2026, evening queue review). Findings behind these jobs (RESULTS R98):
//  y180a (box, 48 fresh growths k 2464-2511, text1000): the granule gain-rate guard does not help short text. granGain 0.001 vs v44 -0.0004 (16/26, t -0.9),
//  granGain 0.01 vs v44 -0.0003 (17/24, t -1.0); v44 itself vs v43 +0.0007 (24/19, t 2.0): v44 already recovers most of the v43 text dip. y180b dropped (partial).
//  y185b (box, partial, k 2536-2543, book100k only so far): cxlr0.1 vs v44 +0.0019 (6/2, t 1.4), granLr0.05 +0.0009 (4/4), granW40 -0.0013 (3/5); book300k arms running.
// Jobs: y194a/b (light) granule capacity x training length below 30k (the ~10k plateau), y195a/b (light) cortex step x length at book30k / fables12000,
//  y196 (heavy) held-out order3 / seqchoice at cx3 for granRef 1800, y197 (heavy) cortex step 0.15 at book100k / 300k on the y185b growths (dose curve 0.1 / 0.15 / 0.2).
// Every arm pins its granule settings incl. P.granW, so the jobs mean the same on v44 and later code (they require this file).
// usage: node run/r98_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r98'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js', 'run/r96_jobs.js', 'run/r98_jobs.js'];
const sq = p => ({ env: 'seq', params: p }), sc = s => ({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
// [task, label, wall s per run per slot on linux-pc for a 1x granule brain (R90 table, as r96_jobs.js; book5k / book20k interpolated)]
const T = { b5: [sq({ source: 'book', nSyms: 5000, evalSyms: 2000 }), 'book5k', 26], b10: [sq({ source: 'book', nSyms: 10000, evalSyms: 2000 }), 'book10k', 47],
  b20: [sq({ source: 'book', nSyms: 20000, evalSyms: 2000 }), 'book20k', 80], b30: [sq({ source: 'book', nSyms: 30000, evalSyms: 2000 }), 'book30k', 109],
  b100: [sq({ source: 'book', nSyms: 100000, evalSyms: 2000 }), 'book100k', 365], b300: [sq({ source: 'book', nSyms: 300000, evalSyms: 2000 }), 'book300k', 1100],
  f4: [sq({ source: 'fables', nSyms: 4000, readIn: 0.01 }), 'fables4000', 27], f12: [sq({ source: 'fables', nSyms: 12000, readIn: 0.01 }), 'fables12000', 81],
  o3: [sq({ source: 'order3', K: 8, readIn: 0.01 }), 'order3', 11], k4: [sq({ source: 'order3', K: 4, readIn: 0.01 }), 'K4', 11], t1: [sq({ source: 'text', nSyms: 1000, readIn: 0.01 }), 'text1000', 15],
  so2: [sc('order2'), 'seqchoice order2', 30], scy: [sc('cycle'), 'seqchoice cycle', 30] };
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1] of o.arms) for (const t of tasks) for (const g of o.seeds) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', JSON.stringify(T[t][0]), '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += T[t][2] * f; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 1, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const W60 = 'P.granW=60', KM = ['P.granKmin=3', 'P.granK=4', W60];
const L = (lr, ...x) => [`pl.lr@cortex=${lr}`].concat(x, ['P.fastEngine=1']).join(',');
const CX3 = ['sc.sizeF@cortex=3', 'sc.divRep@cortex=2', 'sc.trophMin@cortex=0.001667', 'P.fanRef=450', 'P.fanRefR=126', 'pl.lr@cortex=0.2', 'pl.preNorm@cortex=45'];
const VS = (base, ...x) => base.concat(x, ['P.fastEngine=1']).join(',');
// --- light 1x (tacobell-eligible; priority below the heavy pool so linux-pc takes heavy jobs first) ---
for (const [s, g0] of [['a', 2584], ['b', 2592]]) J.push(job(`y194${s}_1x_granLenCurve`, { q: 'I99', pri: 0.925, seeds: K(g0, 8),
  title: `granule capacity x training length below 30k (the ~10k plateau): 4000 / 8000 (v44) / 16000 cells, all mixed 3/4 claws, book 5k / 10k / 20k / 30k, fresh k ${g0}-${g0 + 7}`,
  note: 'y182: cells carry the book30k gain, claws the fables gain; R93: 8000 cells gain more from 10k -> 30k than 4000. If the held-out curve flattens after ~10k at 4000 but keeps rising at 16000, the plateau is capacity (more cells per symbol seen); if all three flatten at the same length, it is the rule.',
  arms: [['N4000 Kmix', L(0.2, 'P.granN=4000', ...KM), ['b5', 'b10', 'b20', 'b30'], 1.4], ['v44 1x', L(0.2, 'P.granN=8000', ...KM), ['b5', 'b10', 'b20', 'b30'], 1.8],
    ['N16000 Kmix', L(0.2, 'P.granN=16000', ...KM), ['b5', 'b10', 'b20', 'b30'], 3]] }));
for (const [s, g0] of [['a', 2600], ['b', 2608]]) J.push(job(`y195${s}_1x_v44_cxStep_len`, { q: 'Q42', pri: 0.92, seeds: K(g0, 8),
  title: `cortex step x length at 1x (light): v44 / cortex lr 0.15 / 0.1 on book10k, book30k, fables12000, text1000, fresh k ${g0}-${g0 + 7}`,
  note: 'R70 chose lr 0.2 on short tasks; y185b (partial) lr 0.1 at book100k +0.0019 (6/2). If the gap of the smaller step vs 0.2 rises from book10k to book30k / fables12000 on 16 growths, the best step falls with length -> an annealed cortex step (new code) is the next design; if it stays negative, the 100k effect is noise.',
  arms: [['v44 1x', L(0.2, 'P.granN=8000', ...KM), ['b10', 'b30', 'f12', 't1'], 1.8], ['v44 cxlr0.15', L(0.15, 'P.granN=8000', ...KM), ['b10', 'b30', 'f12', 't1'], 1.8],
    ['v44 cxlr0.1', L(0.1, 'P.granN=8000', ...KM), ['b10', 'b30', 'f12', 't1'], 1.8]] }));
// --- heavy (linux-pc) ---
const CX3G = (ref) => VS(CX3, 'P.granN=8000', 'P.granKmin=3', 'P.granK=4', `P.granRef=${ref}`, W60);
J.push(job('y196_3x_cx3_granRef_heldout', { q: 'I99', pri: 0.945, seeds: K(2616, 16), memGB: 4,
  title: 'order3 / seqchoice at size, held-out: cx3 with 8000 granule cells + mixed claws, granRef 600 vs 1800, 8 tasks, fresh k 2616-2631',
  note: 'y165 (growths 1900-1915): granRef 1800 at cx3 order3 +0.027 (14/1) but fables -0.002. First fresh-growth test of the order3 fix at size, with seqchoice and K4 so a sized recipe can be judged on every task.',
  arms: [['v44c cx3 N8000', CX3G(600), ['b10', 'b30', 'f4', 'o3', 'k4', 't1', 'so2', 'scy'], 3], ['v44c cx3 N8000 ref1800', CX3G(1800), ['b10', 'b30', 'f4', 'o3', 'k4', 't1', 'so2', 'scy'], 3]] }));
J.push(job('y197_1x_v44_cxlr015_book300k', { q: 'Q42', pri: 0.93, seeds: K(2536, 8), memGB: 1.5,
  title: 'the learning rule at length, dose: v44 with cortex lr 0.15 at book100k / book300k on the y185b growths k 2536-2543 (refs y185b v44 1x / cxlr0.1, same growths)',
  note: 'Completes the cortex-step dose curve 0.2 / 0.15 / 0.1 at 100k and 300k on the same growths; a monotone curve that favours smaller steps at 300k but not at 10k (y195) argues for an annealed step.',
  arms: [['v44 cxlr0.15', L(0.15, 'P.granN=8000', ...KM), ['b100', 'b300'], 1.8]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(34), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
