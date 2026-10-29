// R100 (Oct 28 2026, evening queue review). Findings behind these jobs (RESULTS R100):
//  v45 candidate (16000 granule cells + mixed claws) on 16 fresh growths (y198a+b, k 2632-2647): book10k +0.0028 (10/5), book30k +0.0016 (10/5), order3 / K4 / text1000 not worse,
//   seqchoice identical, but fables4000 -0.0015 (3/11, t -1.9) -> NOT adopted (rule: no task worse). Pooled 48 growths (y189 + y192 + y198) fables4000 -0.0005 (21/25, t -1.0). Tie-break y209.
//  Length: 16000 cells + granLr 0.05 (y201) at book300k 0.4111 = +0.0107 over v44 (8/0) and +0.0024 over 16000 alone (5/3), but -0.0014 at 100k (2/5): smaller step costs early,
//   pays late -> a granule step schedule tied to symbols seen (new code: P.granLrT / granLrLate / granLrShape, net.js granStep; bit-identical off) y206; fresh-growth length block y210.
//  y200 (32000 cells) failed all 16 runs with Out of memory: run/lib.js counted synapses through brain.W, which builds the dense N x N matrix. Fixed in R100 (sparse count,
//   bit-identical, peak RSS at 16000 cells 550 -> 238 MB). Requeued as y207 (length) and y208 (short, was y205 -> y205 blocked).
//  cx3: granRef 1800 at 8000 cells passes held-out (y196 order3 +0.018 11/2, nothing worse); 16000 + ref1800 + cone rb2 str3 (y202) book +0.0045 (12-13/3), seqchoice 3.9 / 4.1 vs 1.6 / 2.1,
//   but K4 / text1000 / fables slightly down (n.s.); striatum dose plateau above x2, x5 best (n.s.) (y199) -> y211 (str5 recipe vs the ref1800 reference), y212 (cx3 granule step at length).
//  cx4dT order3 stuck at ~0.726 whatever the granule settings (1x 0.959, cx3 0.85-0.88) -> y213 cheap ablation of the cx4dT extras on order3 / K4.
// usage: node run/r100_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r100'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js', 'run/r96_jobs.js', 'run/r98_jobs.js', 'run/r99_jobs.js', 'run/r100_jobs.js'];
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
const SCH = (T, late = 0.05, shape) => [`P.granLrT=${T}`, `P.granLrLate=${late}`].concat(shape ? [`P.granLrShape=${shape}`] : []);
const N32 = ['P.granN=32000', 'P.granKmin=3', 'P.granK=4', W60];
const CX4DT = (...x) => ['sc.sizeF@cortex=4', 'sc.divRep@cortex=2', 'sc.trophMin@cortex=0.00125', 'P.fanRef=450', 'P.fanRefR=126', 'pl.lr@cortex=0.2', 'pl.preNorm@cortex=45',
  'sc.sizeF@context=4', 'sc.sizeF@striatum=4', 'sc.trophMin@striatum=0.00125', 'P.sizeCone=1', 'P.recvBudget=2', 'P.postCapRel=1.5', 'P.thinF=5', 'P.granN=16000', 'P.granKmin=3', 'P.granK=4', 'P.granRef=600', W60]
  .filter(s => !x.some(d => d.startsWith('-') && s.startsWith(d.slice(1) + '='))).concat(x.filter(d => !d.startsWith('-')), ['P.fastEngine=1']).join(',');
// --- light 1x (tacobell-eligible: memGB 1, no book100k / book300k) ---
J.push(job('y209_1x_N16k_fablesTiebreak', { q: 'I99', pri: 0.95, seeds: K(2696, 32),
  title: 'v45 tie-break: v44 vs 16000 granule cells + mixed claws (v44 N16000) on fables4000, book10k, text1000, 32 fresh growths k 2696-2727',
  note: 'y198a+b fables4000 -0.0015 (3/11, t -1.9) blocked v45; pooled 48 growths -0.0005 (21/25). Adopt v45 if, pooling y198 + y209 (48 fresh growths), fables4000 is not worse (t > -2 and losses not > 60%), book10k / text1000 not worse, with y210 confirming length.',
  arms: [['v44 1x', L(0.2, 'P.granN=8000', ...KM), ['f4', 'b10', 't1'], 1.8], ['v44 N16000', L(0.2, ...N16), ['f4', 'b10', 't1'], 3]] }));
// --- heavy (linux-pc / chromium) ---
J.push(job('y206_1x_N16k_granLrSched_book300k', { q: 'Q42', pri: 0.96, seeds: K(2536, 8), memGB: 2,
  title: 'granule step schedule at length: 16000 cells with granLr 0.1 -> 0.05 after 30k or 100k symbols (step) or smoothly (T 30k), book100k / book300k on k 2536-2543 (refs y193 N16000, y201 N16000 granLr0.05, same growths)',
  note: 'y201: granLr 0.05 on 16000 cells -0.0014 at 100k (2/5) but +0.0024 at 300k (5/3): annealing signature. A schedule should keep the 100k level of granLr 0.1 and the 300k level of 0.05 or better. If a schedule beats both fixed steps at 300k and ties 0.1 at 100k, it is the length rule (P.granLrT, new in R100).',
  arms: [['v44 N16000 sched30k', L(0.2, ...N16, ...SCH(30000)), ['b100', 'b300'], 3], ['v44 N16000 sched100k', L(0.2, ...N16, ...SCH(100000)), ['b100', 'b300'], 3],
    ['v44 N16000 smooth30k', L(0.2, ...N16, ...SCH(30000, 0.05, 1)), ['b100', 'b300'], 3]] }));
J.push(job('y207_1x_N32k_book300k_fix', { q: 'Q42', pri: 0.95, seeds: K(2536, 8), memGB: 3,
  title: 'capacity at length (requeue of y200 on the R100 memory fix): 32000 granule cells + mixed claws at book100k / book300k on k 2536-2543 (refs y185b v44 1x, y193 N16000, same growths)',
  note: 'y200 crashed (Out of memory in run/lib.js synapse count). y193: 16000 cells +0.008 at 100k and 300k but still fall 100k -> 300k (-0.0028). If 32000 adds again at 100k and does not fall to 300k, capacity is still the binding limit at length.',
  arms: [['v44 N32000', L(0.2, ...N32), ['b100', 'b300'], 6]] }));
J.push(job('y210_1x_len_fresh_book300k', { q: 'Q42', pri: 0.94, seeds: K(2728, 8), memGB: 2,
  title: 'length on fresh growths: v44 vs 16000 cells vs 16000 cells + granLr 0.05 at book100k / book300k, k 2728-2735',
  note: 'All length evidence so far is on k 2536-2543 (y185b / y193 / y201: 16000 + granLr 0.05 = 0.4111 at 300k, +0.0107 8/0 over v44). Fresh growths check it is not a property of those 8 brains; also the length leg of the v45 decision.',
  arms: [['v44 1x', L(0.2, 'P.granN=8000', ...KM), ['b100', 'b300'], 1.8], ['v44 N16000', L(0.2, ...N16), ['b100', 'b300'], 3], ['v44 N16000 granLr0.05', L(0.2, ...N16, 'P.granLr=0.05'), ['b100', 'b300'], 3]] }));
J.push(job('y211_3x_cx3_str5_allround', { q: 'I98', pri: 0.93, seeds: K(2736, 16), memGB: 4,
  title: 'cx3 sized recipe, held-out: cx3 8000 cells granRef 1800 (y196 winner) vs cx3 16000 cells + ref1800 + cone + rb2 + striatum x5, 8 tasks, fresh k 2736-2751',
  note: 'y196: ref1800 order3 +0.018 (11/2), nothing worse; y202: 16000 + ref1800 + cone rb2 str3 book +0.0045, seqchoice 3.9 / 4.1 vs 1.6 / 2.1 but K4 -0.0047, text -0.0028 (n.s.); y199: str5 best dose (n.s.). If nothing is worse than the ref1800 reference, this is the cx3 base.',
  arms: [['v44c cx3 N8000 ref1800', CX3G(8000, 1800), ALL, 3], ['cx3 N16000 ref1800 cone rb2 str5', CX3G(16000, 1800, ...CONE, ...STR(5)), ALL, 4.2]] }));
J.push(job('y212_3x_cx3_granLr05_book300k', { q: 'Q42', pri: 0.935, seeds: K(1400, 8), memGB: 4,
  title: 'granule step at length at size: cx3 16000 cells ref1800 + granLr 0.05 at book100k / book300k on growths 1400-1407 (refs y184 / y190 cx3 N16000 ref1800, same growths)',
  note: 'y184 -> y190: cx3 16000 ref1800 falls 100k 0.4285 -> 300k 0.4254 (3/5), like the 1x brain. If granLr 0.05 turns the cx3 slope positive as it does at 1x (+0.0025), the length rule carries to sized brains.',
  arms: [['v44c cx3 N16000 ref1800 granLr0.05', CX3G(16000, 1800, 'P.granLr=0.05'), ['b100', 'b300'], 4]] }));
J.push(job('y208_1x_N32k_short_fix', { q: 'I99', pri: 0.93, seeds: K(2568, 16), memGB: 3,
  title: 'capacity curve below 100k (requeue of y205 on the R100 memory fix): 32000 granule cells on book10k, book30k, fables12000, text1000, k 2568-2583 (refs y192 v44 1x / N16000)',
  note: 'y205 would hit the y200 Out of memory on pre-R100 code. If 32000 vs 16000 is ~0 at 10k but positive at 30k, cell count should scale with symbols seen.',
  arms: [['v44 N32000', L(0.2, ...N32), ['b10', 'b30', 'f12', 't1'], 6]] }));
J.push(job('y213_4x_cx4dT_order3_ablate', { q: 'Q46', pri: 0.92, seeds: K(0, 8), memGB: 4,
  title: 'why cx4dT order3 is stuck at ~0.726: drop one cx4dT extra at a time (thinF, postCapRel, context x4, striatum x4, cone + rb2), order3 + K4, growths 0-7 (ref y191 cx4dT N16000, same growths)',
  note: 'order3: 1x 0.959, cx3 0.85-0.88, cx4dT 0.726 and untouched by granule count or granRef (y191). If one extra explains the gap, fix that piece for sized brains; if none does, the loss is the size itself (cortex x4).',
  arms: [['cx4dT N16000 -thinF', CX4DT('-P.thinF'), ['o3', 'k4'], 5], ['cx4dT N16000 -postCap', CX4DT('-P.postCapRel'), ['o3', 'k4'], 5],
    ['cx4dT N16000 -ctx4', CX4DT('-sc.sizeF@context'), ['o3', 'k4'], 5], ['cx4dT N16000 -str4', CX4DT('-sc.sizeF@striatum', '-sc.trophMin@striatum'), ['o3', 'k4'], 5],
    ['cx4dT N16000 -cone', CX4DT('-P.sizeCone', '-P.recvBudget'), ['o3', 'k4'], 5]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
