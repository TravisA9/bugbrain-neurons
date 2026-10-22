// R88 (Oct 22 2026, 7 AM queue review; default stays v41 / DEFAULTS_VERSION 34): shared-queue jobs y139-y150 (node run/r88_jobs.js <outdir>).
// Written by the R87 run (Oct 21, 7 PM; it failed before pushing) and finished by R88. Findings behind these jobs (RESULTS R87 + R88):
//   - y133 (workers, k 2000-2015): v41 holds on its second held-out check: book10k +0.038, book30k +0.039, fables +0.010 (16/0 each), order3 / text / K4 0, seqchoice identical.
//   - granRef 1000 (v42 candidate), y134 k 2016-2031 + box R87 k 2032-2047 (32 fresh growths): book10k / book30k +0.020 (32/0), fables +0.002, order3 +0.001,
//     but text1000 -0.0008 (12/15, t -2.4; box block -0.0017, t -3.1) -> NOT adopted (no-task-worse). granRef 3000 is past the peak (book30k -0.015 vs 1000).
//     y139 = the decisive check (granRef 600 / 1000 vs v41 on 16 more fresh growths); box R87/R88 ran granRef 600 on k 2144-2159: book10k +0.017, book30k +0.021 (16/0), fables +0.002, order3 +0.002, text -0.0003 (7/8, t -0.5)
//     = no task worse on its first fresh block; y139 is its second (and the third block for 1000).
//   - y135: granules stack with size (v41 cx3 / cx4 divRep book +0.026..+0.035 over the same brains without granules; order3 still -0.13 at size).
//   - y138: granules lift book100k +0.033 and fables12000 +0.028 (8/0) but book still does not rise with length (plateau at a higher level).
//   - y137: v41 greedy generation trigram surprise 4.5 bits vs v40 6.1 (real 2.6) but greedy still loops; T0.7 5.3 vs 5.6.
// v41 = deepURSx3 at the current defaults (granRef 100); candidates are variants (P.granRef=...).
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r88_jobs.js'];
const out = process.argv[2] || 'jobs_r88'; fs.mkdirSync(out, { recursive: true });
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
  c4d: { b10: 221, b30: 560, b100: 1870, f4: 115, f12: 345, o3: 62, o3k4: 50, t1: 83, so2: 75, scy: 72 } };
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
const V42 = 'deepURSx3', GR = x => v(L2, 'P.granRef=' + x), EIGHT = ALL7.concat(['o3k4']);
const G42 = (...x) => v(L2, ...x);
// ---------- light (1x; tacobell-eligible, memGB <= 1) ----------
for (const [s, g] of [['a', K(2048, 8)], ['b', K(2056, 8)]])
  J.push(job(`y139${s}_1x_granRef_decide`, { q: 'I99', pri: 0.995, seeds: g, memGB: 1, title: `v42 decision: v41 vs granRef 600 / 1000 on fresh growths k ${g[0]}-${g[7]}, 5 seq tasks (seqchoice / K4 have no granules: identical on 16 box growths)`,
    note: 'granRef 1000 over 32 fresh growths: book +0.020 (32/0) but text1000 -0.0008 (12/15, t -2.4). granRef 600 box k 2144-2159: book +0.019 (16/0), text -0.0003 (n.s.). Adopt (v42) only the value with no task worse over all its fresh blocks (600: box R88 + this; 1000: y134 + box R87 + this)',
    arms: [{ plan: V42, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: GR(600), lbl: 'v41 granRef600', tasks: FIVE, size: 'g1x' },
      { plan: V42, variant: GR(1000), lbl: 'v41 granRef1000', tasks: FIVE, size: 'g1x' }] }));
for (const [s, g] of [['a', K(2080, 8)], ['b', K(2088, 8)]])
  J.push(job(`y141${s}_1x_v41_granRule`, { q: 'I99', pri: 0.97, seeds: g, memGB: 1, title: `granule readout rule on v41: granLr 0.05 / 0.2, granGain 0.001 / 0.01, fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'own readout ~0.39 vs granule 3-gram ceiling ~0.41: is the NLMS step (granLr 0.1) or the self-silencing gain (granGain 0.003) the limit?',
    arms: [{ plan: V42, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: G42('P.granLr=0.05'), lbl: 'v41 granLr0.05', tasks: FIVE, size: 'g1x' },
      { plan: V42, variant: G42('P.granLr=0.2'), lbl: 'v41 granLr0.2', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: G42('P.granGain=0.001'), lbl: 'v41 granGain0.001', tasks: FIVE, size: 'g1x' },
      { plan: V42, variant: G42('P.granGain=0.01'), lbl: 'v41 granGain0.01', tasks: FIVE, size: 'g1x' }] }));
for (const [s, g] of [['a', K(2096, 8)], ['b', K(2104, 8)]])
  J.push(job(`y146${s}_1x_granRefFine`, { q: 'I99', pri: 0.965, seeds: g, memGB: 1, title: `granRef curve between 300 and 1000: 450 / 750, fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'y134 / box R87: book 300 +0.014, 1000 +0.020, 3000 +0.007 over v41; text 300 0, 1000 -0.0008. Where does the text cost start? (granRef = the granule drive needed for a full prediction, i.e. the physical strength of granule -> output synapses)',
    arms: [{ plan: V42, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: GR(450), lbl: 'v41 granRef450', tasks: FIVE, size: 'g1x' },
      { plan: V42, variant: GR(750), lbl: 'v41 granRef750', tasks: FIVE, size: 'g1x' }] }));
for (const [s, g] of [['a', K(2112, 8)], ['b', K(2120, 8)]])
  J.push(job(`y147${s}_1x_v41_granCode`, { q: 'I99', pri: 0.96, seeds: g, memGB: 1, title: `granule code on v41: target rate granRate 0.00015 / 0.0006 (sparser / denser), claw weight granW 40 / 90, fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'cerebellar theory: sparser granule codes separate more contexts but each is trained less often; which side is v41 on?',
    arms: [{ plan: V42, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: G42('P.granRate=0.00015'), lbl: 'v41 granRate0.00015', tasks: FIVE, size: 'g1x' },
      { plan: V42, variant: G42('P.granRate=0.0006'), lbl: 'v41 granRate0.0006', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: G42('P.granW=40'), lbl: 'v41 granW40', tasks: FIVE, size: 'g1x' },
      { plan: V42, variant: G42('P.granW=90'), lbl: 'v41 granW90', tasks: FIVE, size: 'g1x' }] }));
for (const [s, g] of [['a', K(2128, 8)], ['b', K(2136, 8)]])
  J.push(job(`y148${s}_1x_v41_preNorm`, { q: 'Q46', pri: 0.955, seeds: g, memGB: 1, title: `output-drive normalisation with granules: v41 with cortex preNorm 45 / 65 (default 55), fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'v41 adds a second drive onto the output cells (granules); the cortex preNorm 55 was tuned without it (R77). Does the best cortex drive move?',
    arms: [{ plan: V42, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: G42('pl.preNorm@cortex=45'), lbl: 'v41 preNorm45', tasks: FIVE, size: 'g1x' },
      { plan: V42, variant: G42('pl.preNorm@cortex=65'), lbl: 'v41 preNorm65', tasks: FIVE, size: 'g1x' }] }));
J.push(job('y142_1x_v41_gen', { q: 'I72', pri: 0.93, seeds: K(0, 8), memGB: 1, title: 'generation with v41, v41 + granRef 600 / 1000, and v41 + outGate 0.2 (loop breaker), gen.js book30k greedy + T0.7, growths 0-7',
  note: 'y137: v41 greedy trigram surprise 4.5 bits (v40 6.1, real 2.6) but greedy loops ("he he he"); y106: outGate 0.2 breaks greedy loops on v40 (distinct4 0.03 -> 0.49)',
  arms: [{ plan: V42, variant: BASE, lbl: 'v41 1x', tasks: ['gG', 'g7'], size: 'g1x' }, { plan: V42, variant: GR(600), lbl: 'v41 granRef600', tasks: ['gG', 'g7'], size: 'g1x' }, { plan: V42, variant: GR(1000), lbl: 'v41 granRef1000', tasks: ['gG', 'g7'], size: 'g1x' },
    { plan: V42, variant: G42('pl.outGate=0.2', 'pl.outGateMode=1'), lbl: 'v41 1x gate0.2', tasks: ['gG', 'g7'], size: 'g1x' }] }));
// ---------- heavy (linux-pc; 'cx' / 'book100k' in the id, or memGB > 1 -> tacobell skips) ----------
J.push(job('y140_1x_v41_granCap', { q: 'I99', pri: 0.975, seeds: K(2064, 16), memGB: 1.5, title: 'granule capacity on v41: granN 4000, granK 4 (adds a t-3 claw), granN 4000 + granK 4, fresh k 2064-2079, 5 seq tasks',
  note: 'R82 diagnosis: the brain lacks letter-combination capacity; does doubling the combination cells or adding a 4th claw raise book further?',
  arms: [{ plan: V42, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: G42('P.granN=4000'), lbl: 'v41 granN4000', tasks: FIVE, size: 'g1x' },
    { plan: V42, variant: G42('P.granK=4'), lbl: 'v41 granK4', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: G42('P.granN=4000', 'P.granK=4'), lbl: 'v41 granN4000 K4', tasks: FIVE, size: 'g1x' }] }));
J.push(job('y143_cx_granRef_stack', { q: 'I95', pri: 0.985, seeds: K(1900, 16), memGB: 3, title: 'granRef 1000 at cortex 3x / 4x divRep + trophMin, growths k 1900-1915 (refs y135: v41 cx3 / cx4 on the same growths, same worker), 5 seq tasks',
  note: 'y135: v41 cx3 / cx4 book30k 0.398 / 0.397 vs v41 1x 0.376; does granRef 1000 add on top at size, or does the larger cortex already saturate the outputs?',
  arms: [{ plan: V42, variant: CDT(3, 'P.granRef=1000'), lbl: 'v41 granRef1000 cx3 divRep trophMin/3', tasks: FIVE, size: 'gc3d' }, { plan: V42, variant: CDT(4, 'P.granRef=1000'), lbl: 'v41 granRef1000 cx4 divRep trophMin/4', tasks: FIVE, size: 'gc4d' }] }));
J.push(job('y144_cx4dT_v41_allround', { q: 'I98', pri: 0.98, seeds: K(0, 16), memGB: 3, title: 'one sized brain for all tasks with granules: v41 cx4 divRep + trophMin + 4x striatum / context (cone, rb2) + thinF 5, +/- mixInhRef 850, growths 0-15, all 7 tasks (refs y136 = same without granules)',
  note: 'y136: thin5 brain book30k +0.005, seqchoice cycle 6.1, order3 0.73; + ref850 order3 0.967 (1x 0.957) but book / text -0.005..-0.009. Granules add ~+0.03 book at size: do they pay for ref850 and give one brain with every task at or above 1x except seqchoice?',
  arms: [{ plan: V42, variant: CDT(4, RX, 'P.thinF=5'), lbl: 'v41 cx4dT recv4 cone rb2 thin5', tasks: ALL7, size: 'gc4d' },
    { plan: V42, variant: CDT(4, RX, 'P.thinF=5', 'P.mixInhRef=850'), lbl: 'v41 cx4dT recv4 cone rb2 thin5 ref850', tasks: ALL7, size: 'gc4d' }] }));
J.push(job('y150_cx4dT_seqchoice_fix', { q: 'I98', pri: 0.975, seeds: K(0, 16), memGB: 3, title: 'the last size failure: seqchoice on cx4dT + 4x receivers (cone, rb2) + thinF 5 + mixInhRef 850 (y136 best brain), with thinF 8, recvBudget 1.5, or the striatum 6x, growths 0-15 (ref y136)',
  note: 'y136 ref850 brain vs 1x (same growths): book +0.030, fables +0.029 (16/0), order3 +0.007, text +0.001 -- every seq task at or above 1x; seqchoice order2 4.66 / cycle 6.07 vs 6.39 / 9.11 is the only task left below',
  arms: [{ plan: V42, variant: CDT(4, RX, 'P.thinF=8', 'P.mixInhRef=850'), lbl: 'cx4dT recv4 cone rb2 thin8 ref850', tasks: ['so2', 'scy'], size: 'c4d' },
    { plan: V42, variant: CDT(4, RX, 'P.thinF=5', 'P.mixInhRef=850', 'P.recvBudget=1.5'), lbl: 'cx4dT recv4 cone rb1.5 thin5 ref850', tasks: ['so2', 'scy'], size: 'c4d' },
    { plan: V42, variant: CDT(4, RX, 'P.thinF=5', 'P.mixInhRef=850', 'sc.sizeF@striatum=6'), lbl: 'cx4dT recv4 str6 cone rb2 thin5 ref850', tasks: ['so2', 'scy'], size: 'c4d' }] }));
J.push(job('y145_1x_granRef_book100k', { q: 'Q42', pri: 0.95, seeds: K(1400, 8), memGB: 1.5, title: 'the plateau with granRef 1000: book100k and fables12000, growths k 1400-1407 (refs y138: v40 / v41 on the same growths)',
  note: 'y138: v41 book100k 0.368 (= its book10k-30k level), fables12000 0.397; does a stronger granule drive change the slope with length?',
  arms: [{ plan: V42, variant: GR(1000), lbl: 'v41 granRef1000', tasks: ['b100', 'f12'], size: 'g1x' }] }));
J.push(job('y149_cx4dT_v41_granN', { q: 'I95', pri: 0.94, seeds: K(1900, 16), memGB: 3.5, after: 'y143_cx_granRef_stack', title: 'scale the granule layer with the cortex: v41 cx4 divRep + trophMin with granN 4000 / 8000, growths k 1900-1915 (ref y135 v41 cx4 divRep, same growths), 5 seq tasks',
  note: 'the 4x cortex keeps a 2000-cell granule layer sized for 1x; Travis scaling rule: anything that does not grow with the brain drifts. Does granN x f help at 4x?',
  arms: [{ plan: V42, variant: CDT(4, 'P.granN=4000'), lbl: 'v41 cx4 divRep trophMin/4 granN4000', tasks: FIVE, size: 'gc4d' }, { plan: V42, variant: CDT(4, 'P.granN=8000'), lbl: 'v41 cx4 divRep trophMin/4 granN8000', tasks: FIVE, size: 'gc4d' }] }));
// ---------- R88 additions ----------
for (const [s, g] of [['a', K(2160, 8)], ['b', K(2168, 8)]])
  J.push(job(`y153${s}_1x_v41_mixInh`, { q: 'Q46', pri: 0.945, seeds: g, memGB: 1, title: `v41 + mixInh 0.35 (the best 1x order3 knob, y120) and + granRef 600, fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'y120 (v40, 16 fresh): mixInh 0.35 order3 +0.011 (11/2, t 3.2), book / text 0. Does it stack with granules (and with granRef 600) without a text cost?',
    arms: [{ plan: V42, variant: BASE, lbl: 'v41 1x', tasks: FIVE, size: 'g1x' }, { plan: V42, variant: G42('pl.mixInh@cortex=0.35'), lbl: 'v41 mixInh0.35', tasks: FIVE, size: 'g1x' },
      { plan: V42, variant: G42('pl.mixInh@cortex=0.35', 'P.granRef=600'), lbl: 'v41 mixInh0.35 granRef600', tasks: FIVE, size: 'g1x' }] }));
J.push(job('y151_cx3_v41_book100k', { q: 'Q42', pri: 0.945, seeds: K(1400, 8), memGB: 3, title: 'the plateau at size with granules: v41 cx3 divRep + trophMin at book100k and fables12000, growths k 1400-1407 (refs y138 v40 / v41 1x on the same growths)',
  note: 'y138: granules lift book100k +0.033 at 1x but book100k (0.368) = the book10k-30k level; y74 / y76 / y70: cx4 without granules gains nothing at 100k-300k and ~+0.008 at 1M. Is the plateau a capacity limit (size helps at length) or a rule limit (it does not)?',
  arms: [{ plan: V42, variant: CDT(3), lbl: 'v41 cx3 divRep trophMin/3', tasks: ['b100', 'f12'], size: 'gc3d' }] }));
J.push(job('y152_cx3_v41_order3fix', { q: 'I98', pri: 0.97, seeds: K(1900, 16), memGB: 3, title: 'order3 at size with granules: v41 cx3 divRep + trophMin + mixInhRef 850 (+/- thinF 5), growths k 1900-1915 (ref y135 v41 cx3 / v41 1x, same growths), 5 seq tasks',
  note: 'y135: v41 cx3 book +0.021, fables +0.025, text +0.006 over v41 1x but order3 -0.133 (0/16); y136: mixInhRef 850 restores order3 at cx4 (+0.24) for book -0.005 / text -0.009. At cx3 with granules, is there one brain with every seq task at or above 1x?',
  arms: [{ plan: V42, variant: CDT(3, 'P.mixInhRef=850'), lbl: 'v41 cx3 divRep trophMin/3 ref850', tasks: FIVE, size: 'gc3d' },
    { plan: V42, variant: CDT(3, 'P.mixInhRef=850', 'P.thinF=5'), lbl: 'v41 cx3 divRep trophMin/3 ref850 thin5', tasks: FIVE, size: 'gc3d' }] }));
for (const j of J) console.log(j.id.padEnd(30), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', String(j.estHours).padStart(4), 'h', 'pri', j.priority, 'memGB', j.memGB || '-');
