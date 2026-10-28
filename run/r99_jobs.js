// R99 (Oct 28 2026, morning queue review). Findings behind these jobs (RESULTS R99):
//  16000 granule cells + mixed 3/4 claws (v44 N16000) at 1x: y192a+b (16 fresh growths k 2568-2583) book30k +0.0049 (13/3), book100k +0.0078 (16/0), fables12000 +0.0021 (13/3), nothing worse;
//   y189a+b (16 fresh, k 2552-2567) book30k +0.0023 (9/7), nothing worse; y193 (k 2536-2543) book100k +0.0082 (8/0), book300k +0.0083 (8/0). -> v45 candidate; full-task confirmation y198a/b.
//  All-4 claws at 16000 rejected (y192: book30k -0.009 2/14). granW 40 at 16000: fables4000 +0.012 (16/0), book10k +0.004 (13/3) but book30k -0.0022 (5/11): a length trade again.
//  Capacity carries the 30k -> 100k slope (y178: v43 -0.010, 8000 Kmix -0.0025, 16000 Kmix +0.001), but 16000 still falls 100k -> 300k (-0.0028, 3/5); only granLr 0.05 rose (+0.0043, 5/2, n 8).
//  cx3 seqchoice: cone + recvBudget 2 alone does nothing (order2 1.53 vs 1.61); + striatum x3 lifts it to 3.83 / 4.23 (16/0 both) vs 1x ~6.3 (y187).
// Jobs: y198a/b (light) v45 candidate confirmation on 8 tasks, fresh k 2632-2647; y199 (heavy) striatum dose at cx3 for seqchoice; y200 (heavy) 32000 cells at 100k / 300k;
//  y201 (heavy) 16000 cells + granLr 0.05 at 100k / 300k; y202 (heavy) cx3 all-round sized recipe held-out; y203 (heavy) cx3 8000 vs 16000 at book100k, fresh; y204a/b (light) granule step x 16000 cells x length;
//  y205 (heavy) 32000 cells below 100k on the y192 growths.
// Every arm pins its granule settings incl. P.granW, so the jobs mean the same on v44 and later code (they require this file).
// usage: node run/r98_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r99'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js', 'run/r96_jobs.js', 'run/r98_jobs.js', 'run/r99_jobs.js'];
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
const ALL = ['b10', 'b30', 'f4', 'o3', 'k4', 't1', 'so2', 'scy'];
const N16 = ['P.granN=16000', 'P.granKmin=3', 'P.granK=4', W60];
const CX3G = (n, ref, ...x) => VS(CX3, `P.granN=${n}`, 'P.granKmin=3', 'P.granK=4', `P.granRef=${ref}`, W60, ...x);
const CX3V42 = (...x) => VS(CX3, 'P.mixInhRef=850', 'P.granN=2000', 'P.granRef=600', 'P.granK=3', ...x);
const STR = k => [`sc.sizeF@striatum=${k}`, `sc.trophMin@striatum=${+(0.005 / k).toFixed(6)}`], CONE = ['P.sizeCone=1', 'P.recvBudget=2'];
// --- light 1x (tacobell-eligible) ---
for (const [s, g0] of [['a', 2632], ['b', 2640]]) J.push(job(`y198${s}_1x_v45c_N16k_confirm`, { q: 'I99', pri: 0.965, seeds: K(g0, 8),
  title: `v45 candidate confirmation: v44 vs 16000 granule cells + mixed 3/4 claws (v44 N16000) on all 8 tasks incl. order3 / K4 / seqchoice, fresh k ${g0}-${g0 + 7}`,
  note: 'y192a+b: N16000 book30k +0.0049 (13/3), book100k +0.0078 (16/0), fables12000 +0.0021 (13/3); y189a+b book30k +0.0023 (9/7); nothing worse anywhere (32 growths). Adopt as v45 if, on these 16 fresh growths, no task is worse (book10k / book30k / fables4000 / order3 / K4 / text1000 / seqchoice) and book30k is better; cost ~1.7x v44 runtime.',
  arms: [['v44 1x', L(0.2, 'P.granN=8000', ...KM), ALL, 1.8], ['v44 N16000', L(0.2, ...N16), ALL, 3]] }));
for (const [s, g0] of [['a', 2680], ['b', 2688]]) J.push(job(`y204${s}_1x_N16k_granLr_len`, { q: 'Q42', pri: 0.915, seeds: K(g0, 8),
  title: `granule step x capacity x length (light): 16000 cells +/- granLr 0.05 on book10k, book30k, fables12000, text1000, fresh k ${g0}-${g0 + 7}`,
  note: 'y185a: granLr 0.05 is the only arm that rises from 100k to 300k (+0.0043, 5/2, n 8); at 100k it is +0.0014 (10/6). With 16000 cells the capacity ceiling is higher, so a smaller granule step may pay sooner. If granLr 0.05 is not worse at 10k / 30k and better at fables12000 / 30k, a length-annealed granule step (granLr falling with symbols seen) is the next design.',
  arms: [['v44 N16000', L(0.2, ...N16), ['b10', 'b30', 'f12', 't1'], 3], ['v44 N16000 granLr0.05', L(0.2, ...N16, 'P.granLr=0.05'), ['b10', 'b30', 'f12', 't1'], 3]] }));
// --- heavy (linux-pc / chromium) ---
J.push(job('y199_3x_cx3_striatumDose', { q: 'Q46', pri: 0.945, seeds: K(1900, 16), memGB: 4,
  title: 'seqchoice at size, striatum dose: cx3 ref850 (v42 granules) with striatum x3 without cone / rb2, and cone + rb2 with striatum x2 / x4 / x5, seqchoice only, growths 1900-1915 (refs y166 cx3 ref850, y187 cone rb2 +/- str3, same growths)',
  note: 'y187: cone + recvBudget 2 alone leaves cx3 seqchoice at 1.5 / 2.0; + striatum x3 lifts it to 3.83 / 4.23 (16/0) vs 1x ~6.3; striatum x8 was worse at cx4dT (R96). Is the cone needed, and where does the striatum dose peak? If a dose reaches >= 5.5 on both seqchoice tasks, it goes into the sized all-round recipe.',
  arms: [['v42 cx3 ref850 str3', CX3V42(...STR(3)), ['so2', 'scy'], 3], ['v42 cx3 ref850 cone rb2 str2', CX3V42(...CONE, ...STR(2)), ['so2', 'scy'], 3],
    ['v42 cx3 ref850 cone rb2 str4', CX3V42(...CONE, ...STR(4)), ['so2', 'scy'], 3], ['v42 cx3 ref850 cone rb2 str5', CX3V42(...CONE, ...STR(5)), ['so2', 'scy'], 3]] }));
J.push(job('y200_1x_N32k_book300k', { q: 'Q42', pri: 0.94, seeds: K(2536, 8), memGB: 3,
  title: 'capacity at length, next step: 32000 granule cells + mixed claws at book100k / book300k on the y185b growths k 2536-2543 (refs y185b v44 1x, y193 v44 N16000, same growths)',
  note: 'y193: 16000 cells +0.008 at both 100k and 300k but still fall 100k -> 300k (-0.0028, 3/5). If 32000 adds again at 100k and its 300k is not below its 100k, capacity is still the binding limit at length; if 32000 = 16000, capacity is saturated and the rule (y201 / y197) is the lever. Also measures 32000-cell runtime / memory for the sparse-update work.',
  arms: [['v44 N32000', L(0.2, 'P.granN=32000', 'P.granKmin=3', 'P.granK=4', W60), ['b100', 'b300'], 6]] }));
J.push(job('y201_1x_N16k_granLr05_book300k', { q: 'Q42', pri: 0.94, seeds: K(2536, 8), memGB: 2,
  title: 'capacity x granule step at length: 16000 cells + granLr 0.05 at book100k / book300k on the y185b growths k 2536-2543 (refs y185b granLr0.05 / v44 1x, y193 N16000)',
  note: 'Capacity lifts the level (+0.008), the smaller granule step may fix the 100k -> 300k slope (y185a +0.0043, n 8). If they add (N16000 granLr0.05 300k > N16000 300k and >= its own 100k), the length design is more cells + an annealed granule step.',
  arms: [['v44 N16000 granLr0.05', L(0.2, ...N16, 'P.granLr=0.05'), ['b100', 'b300'], 3]] }));
J.push(job('y202_3x_cx3_N16k_allround', { q: 'I98', pri: 0.935, seeds: K(2648, 16), memGB: 4,
  title: 'one sized brain for all tasks, held-out: cx3 v44c N8000 (granRef 600) vs cx3 + 16000 cells + granRef 1800 + cone + rb2 + striatum x3, 8 tasks, fresh k 2648-2663',
  note: 'y183: cx3 16000 + ref1800 vs cx3 v42: book30k +0.022 (16/0), order3 +0.030 (15/1), fables +0.005; y187: cone rb2 str3 seqchoice 1.6 -> 3.8, text +0.005. First fresh-growth test of all the cx3 wins together; if nothing is worse than the cx3 reference, this is the base for the next sizing round (I98).',
  arms: [['v44c cx3 N8000', CX3G(8000, 600), ALL, 3], ['cx3 N16000 ref1800 cone rb2 str3', CX3G(16000, 1800, ...CONE, ...STR(3)), ALL, 4]] }));
J.push(job('y203_3x_cx3_N16k_book100k_fresh', { q: 'Q42', pri: 0.925, seeds: K(2664, 16), memGB: 4,
  title: 'capacity x length at size, held-out: cx3 granRef 1800 with 8000 vs 16000 cells + mixed claws at book100k, fresh k 2664-2679',
  note: 'y184 (growths 1400-1407): cx3 16000 Kmix ref1800 book100k 0.4285, +0.014 (8/0) over cx3 granN6000 ref1800; y183 at 30k 16000 vs 8000 +0.0037 (11/2). Does the 16000 vs 8000 gap grow from 30k to 100k on fresh growths (capacity sized with length)?',
  arms: [['v44c cx3 N8000 ref1800', CX3G(8000, 1800), ['b100'], 3], ['v44c cx3 N16000 ref1800', CX3G(16000, 1800), ['b100'], 4]] }));
J.push(job('y205_1x_N32k_short', { q: 'I99', pri: 0.92, seeds: K(2568, 16), memGB: 3,
  title: 'capacity curve below 100k: 32000 granule cells + mixed claws on book10k, book30k, fables12000, text1000 on the y192 growths k 2568-2583 (refs y192 v44 1x / v44 N16000, same growths)',
  note: 'y192: 16000 vs 8000 book10k +0.0009, book30k +0.0049, book100k +0.0078: the capacity gain grows with length. If 32000 vs 16000 is ~0 at 10k but positive at 30k, the right cell count scales with training length (a sizing rule: cells ~ symbols seen).',
  arms: [['v44 N32000', L(0.2, 'P.granN=32000', 'P.granKmin=3', 'P.granK=4', W60), ['b10', 'b30', 'f12', 't1'], 6]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(34), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
