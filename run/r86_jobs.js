// R86 (Oct 21 2026, 7 AM queue review, after v41 = granule layer adopted): shared-queue jobs y133-y138 (node run/r86_jobs.js <outdir>).
// Findings behind these jobs (RESULTS R86):
//   - v41 (deepURSx3 + 2000-cell granule layer, claws t / t-1 / t-2, cerebellar NLMS rule onto the outputs) passed 16 fresh growths on the BOX (k 1940-1955):
//     book10k / book30k +0.038 accuracy (16/0), fables +0.009 (16/0), order3 / text unchanged, seqchoice identical by construction. y133 repeats it on the
//     workers (other hardware, other seeds k 2000-2015, all 7 tasks + order3 K4).
//   - IR1k (granRef 1000 + granIso) is stronger on book (+0.011 over v41) but text -0.0008 (3/11) -> y134 decides v42 between granRef 300 / 1000 / 1000+iso.
//   - size: cortex 3x-4x divRep + trophMin is the best book brain (+0.03 fresh) but order3 -0.13 and seqchoice collapses; y110: a 4x striatum + context with
//     sizeCone + recvBudget 2 brings seqchoice cycle back to 6.0 (1x 9.1); y121: I98 thinning (thinF 5) helps every task at all-4x.
//     y135: do granules stack with size?  y136: cx4dT + sized receivers + thinning (+ mixInhRef) on all 7 tasks.  y138: granules vs the ~10k plateau.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r86_jobs.js'];
const out = process.argv[2] || 'jobs_r86'; fs.mkdirSync(out, { recursive: true });
const book = n => JSON.stringify({ env: 'seq', params: { source: 'book', nSyms: n, evalSyms: 2000 } });
const FAB = n => JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: n, readIn: 0.01 } });
const ORD = K => JSON.stringify({ env: 'seq', params: { source: 'order3', K, readIn: 0.01 } });
const TXT = () => JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
const GEN = t => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: 30000, evalSyms: 2000, genSyms: 500 }, t != null ? { genTemp: t } : {}) });
const T = { b10: [book(10000), 'book10k'], b30: [book(30000), 'book30k'], b100: [book(100000), 'book100k'], f4: [FAB(4000), 'fables4000'], f12: [FAB(12000), 'fables12000'],
  o3: [ORD(8), 'order3'], o3k4: [ORD(4), 'order3 K4'], t1: [TXT(), 'text1000'], so2: [SC('order2'), 'seqchoice order2'], scy: [SC('cycle'), 'seqchoice cycle'],
  gG: [GEN(), 'gen30k greedy'], g7: [GEN(0.7), 'gen30k T0.7'] };
// wall s per run per slot (linux-pc; R77/R79 tables); granule brains (g*) ~ +35 % on seq tasks (box R85: b30 66 s -> ~90 s), seqchoice unchanged
const SEC = { '1x': { b10: 35, b30: 81, b100: 270, f4: 20, f12: 60, o3: 8, o3k4: 6, t1: 11, so2: 11, scy: 9, gG: 90, g7: 90 },
  c4d: { b10: 221, b30: 560, b100: 1870, f4: 115, o3: 62, o3k4: 50, t1: 83, so2: 75, scy: 72 } };
SEC.c3d = {}; for (const t in SEC.c4d) SEC.c3d[t] = Math.round(SEC.c4d[t] * 0.7);
for (const s of Object.keys(SEC)) { SEC['g' + s] = {}; for (const t in SEC[s]) SEC['g' + s][t] = /^s/.test(t) ? SEC[s][t] : Math.round(SEC[s][t] * 1.35); }
const FAST = 'P.fastEngine=1', L2 = 'pl.lr@cortex=0.2', PN45 = 'pl.preNorm@cortex=45', v = (...a) => a.filter(Boolean).concat([FAST]).join(',');
const FR = 'P.fanRef=450,P.fanRefR=126', CD = f => `sc.sizeF@cortex=${f},sc.divRep@cortex=2`, TM = f => `sc.trophMin@cortex=${+(0.005 / f).toPrecision(4)}`;
const BASE = v(L2), CDT = (f, ...x) => v(CD(f), TM(f), FR, L2, PN45, ...x);
const RX = 'sc.sizeF@context=4,sc.sizeF@striatum=4,sc.trophMin@striatum=0.00125,P.sizeCone=1,P.recvBudget=2,P.postCapRel=1.5';   // y110 'context+striatum cone rb2 4x'
const SLOTS = 6, K = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const ALL7 = ['b10', 'b30', 'f4', 'o3', 't1', 'so2', 'scy'], FIVE = ['b10', 'b30', 'f4', 'o3', 't1'];
const V41 = 'deepURSx3', V40 = 'deepURSx3v40';
function job(id, o) {
  const runs = []; let sec = 0;
  for (const a of o.arms) for (const tk of a.tasks) for (const g0 of (a.seeds || o.seeds)) {
    const gen = /^g/.test(tk);
    runs.push({ script: gen ? 'run/gen.js' : 'run/r42.js', args: [a.plan, T[tk][0], '1', a.variant, String(g0), '--force'], label: `${a.lbl} ${T[tk][1]} g${g0} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += SEC[a.size][tk]; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ.concat(o.req || []), title: o.title, priority: o.pri, estHours: +(sec / 3600 / SLOTS).toFixed(1), slotHours: +(sec / 3600).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  if (o.memGB) j.memGB = o.memGB;
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const J = [];
// ---------- light (1x; tacobell-eligible, memGB <= 1) ----------
for (const [s, g] of [['a', K(2000, 8)], ['b', K(2008, 8)]])
  J.push(job(`y133${s}_1x_v41_heldout`, { q: 'I99', pri: 0.995, seeds: g, memGB: 1, title: `v41 (granule layer) vs v40 on fresh growths k ${g[0]}-${g[7]}, all 7 tasks + order3 K4 (second held-out check, on the workers)`,
    note: 'box k 1940-1955: v41 book10k / book30k +0.038 (16/0), fables +0.009 (16/0), order3 +0.0003, text +0.0004; must hold on other seeds and hardware',
    arms: [{ plan: V40, variant: BASE, lbl: 'v40 1x', tasks: ALL7.concat(['o3k4']), size: '1x' }, { plan: V41, variant: BASE, lbl: 'v41 1x', tasks: ALL7.concat(['o3k4']), size: 'g1x' }] }));
for (const [s, g] of [['a', K(2016, 8)], ['b', K(2024, 8)]])
  J.push(job(`y134${s}_1x_v42_granRef`, { q: 'I99', pri: 0.99, seeds: g, memGB: 1, title: `v42 candidates on v41: granRef 300, granRef 1000, granRef 1000 + granIso, fresh growths k ${g[0]}-${g[7]}, 5 seq tasks (seqchoice has no granules)`,
    note: 'R85 box (8g / 16g vs v40): granRef 1000 book +0.06 over v41 but text -0.003 (8g); + granIso text -0.0008 (3/11, 16g). Which keeps text and the book gain?',
    arms: [{ plan: V41, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V41, variant: v(L2, 'P.granRef=300'), lbl: 'v41 granRef300', tasks: FIVE, size: 'g1x' },
      { plan: V41, variant: v(L2, 'P.granRef=1000'), lbl: 'v41 granRef1000', tasks: FIVE, size: 'g1x' }, { plan: V41, variant: v(L2, 'P.granRef=1000', 'P.granIso=1'), lbl: 'v41 granRef1000 iso', tasks: FIVE, size: 'g1x' }] }));
J.push(job('y137_1x_v41_gen', { q: 'I72', pri: 0.9, seeds: K(0, 8), memGB: 1, title: 'generation with v41 vs v40 (gen.js, book30k, greedy + T0.7), growths 0-7',
  note: 'R79: v40 greedy ~95 % spaces, T0.7 ~70 % valid words, trigram surprise 6 bits vs real 2.4. Do granule (t, t-1, t-2) codes make generated text more trigram-like?',
  arms: [{ plan: V40, variant: BASE, lbl: 'v40 1x', tasks: ['gG', 'g7'], size: '1x' }, { plan: V41, variant: BASE, lbl: 'v41 1x', tasks: ['gG', 'g7'], size: 'g1x' }] }));
// ---------- heavy (linux-pc; 'cx' / 'book100k' in the id -> tacobell skips) ----------
J.push(job('y135_cx_granule_stack', { q: 'I99', pri: 0.985, seeds: K(1900, 16), memGB: 3, title: 'do granules stack with size? cortex 3x / 4x divRep + trophMin with and without the v41 granule layer, + v41 1x, growths k 1900-1915 (refs y98: v40 1x, cx3 v40), 5 seq tasks',
  note: 'v41 1x: book +0.038; cx3/cx4 divRep v40: book +0.028-0.031. Additive (~+0.07), sub-additive (same conjunction capacity) or worse (granule claws wired for a 1x cortex)?',
  arms: [{ plan: V41, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V41, variant: CDT(3), lbl: 'v41 cx3 divRep trophMin/3', tasks: FIVE, size: 'gc3d' },
    { plan: V40, variant: CDT(4), lbl: 'cx4 divRep trophMin/4', tasks: FIVE, size: 'c4d' }, { plan: V41, variant: CDT(4), lbl: 'v41 cx4 divRep trophMin/4', tasks: FIVE, size: 'gc4d' }] }));
J.push(job('y136_cx4dT_receivers_thin', { q: 'I98', pri: 0.96, seeds: K(0, 16), memGB: 3, title: 'cx4 divRep + trophMin with a 4x striatum + context (sizeCone, recvBudget 2) +/- I98 thinF 5 +/- mixInhRef 850, growths 0-15, all 7 tasks (v40 brain)',
  note: 'y110: receivers 4x + cone + rb2 -> seqchoice cycle 6.0 (cx4dT 0.29, 1x 9.1); y121 all4: thin5 +1.1 / +1.7 seqchoice, book +0.015; y97: mixInhRef restores order3 (+0.14) for text -0.012. Can one brain keep book +0.03, order3 and seqchoice?',
    arms: [{ plan: V40, variant: CDT(4, RX), lbl: 'cx4dT recv4 cone rb2', tasks: ['b30', 'f4', 'o3', 't1'], size: 'c4d' }, { plan: V40, variant: CDT(4, RX, 'P.thinF=5'), lbl: 'cx4dT recv4 cone rb2 thin5', tasks: ALL7, size: 'c4d' },
      { plan: V40, variant: CDT(4, RX, 'P.thinF=5', 'P.mixInhRef=850'), lbl: 'cx4dT recv4 cone rb2 thin5 ref850', tasks: ALL7, size: 'c4d' }] }));
J.push(job('y138_1x_v41_book100k', { q: 'Q42', pri: 0.975, seeds: K(1400, 8), memGB: 1.5, title: 'the ~10k plateau with granules: v41 vs v40 at book100k and fables12000, growths k 1400-1407 (refs y27 / y36 at book100k / 300k)',
  note: 'book accuracy has been flat from 10k to 1M at every size (learning-rule plateau). The granule NLMS readout is a different rule: does its gain grow with text length?',
  arms: [{ plan: V40, variant: BASE, lbl: 'v40 1x', tasks: ['b100', 'f12'], size: '1x' }, { plan: V41, variant: BASE, lbl: 'v41 1x', tasks: ['b100', 'f12'], size: 'g1x' }] }));
for (const j of J) console.log(j.id.padEnd(30), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', String(j.estHours).padStart(4), 'h', 'pri', j.priority, 'memGB', j.memGB || '-');
