// R91 (Oct 23 2026, 7 PM queue review). Findings behind these jobs (RESULTS R91):
//  y159 granule capacity on v42 (16 fresh, k 2240-2255): granN 4000 book10k +0.008 (15/1), book30k +0.011 (14/1), fables +0.002, order3 / text 0
//  -> box full-task confirmation k 2256-2271 (RESULTS R91) -> v43 = granN 4000 (plan gene d.gran.N; deepURSx3v42 keeps 2000).
//  granK 4 fables +0.012 (16/0) but book30k -0.014 (0/16); granN 4000 + granK 4 book 0, fables +0.013: 4-letter claws need more cells.
//  y156 / y158: slower granule step granLr 0.05 loses at 10k (-0.007) but gains at 100k (+0.002, 5/1): a per-granule decaying step (P.granAnneal, new R91 code) is the plateau test.
//  y143 / y149 (size): stronger (granRef 1000) and bigger (granN 4000 / 8000) granule layers keep paying at cx3 / cx4 -> scale them with the cortex (opposite-varying patch).
//  y152: cx3 + mixInhRef 850 restores order3 (0.960) at a text cost (-0.011 vs cx3); y150: seqchoice at size, only striatum x6 hints (cycle +0.65, 11/5).
// usage: node run/r91_jobs.js <outdir>. Jobs that need the R91 code (granAnneal, BB_GEN_MEAN) require run/r91_jobs.js, so a worker without it skips them until it self-updates.
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r91'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r91_jobs.js'];
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

// --- light 1x jobs (tacobell-eligible: memGB 1, ids avoid its skip patterns) ---
for (const [s, g] of [['a', K(2272, 8)], ['b', K(2280, 8)]])
  J.push(job(`y160${s}_1x_v43_heldout`, { q: 'I99', pri: 0.99, seeds: g, title: `v43 worker held-out: granN 4000 vs 2000 (v42) on all 8 tasks, fresh k ${g[0]}-${g[7]}`,
    note: 'v43 (granN 4000) was adopted on the box (k 2256-2271, RESULTS R91) after y159 (k 2240-2255). This is the worker held-out on the full task set: v43 holds if no task is worse on these 16 fresh growths.',
    arms: [['v42 1x', V(N2), ALL], ['v43 1x', V(N4), ALL, 1.25]] }));
for (const [s, g] of [['a', K(2288, 8)], ['b', K(2296, 8)]])
  J.push(job(`y161${s}_1x_v43_granAnneal`, { q: 'Q42', pri: 0.98, seeds: g, title: `plateau / readout rule: per-granule decaying NLMS step (granAnneal 5000 / 20000, floor 0.25; 5000 floor 0.5) on v43, fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'y156 / y158: granLr 0.05 loses at 10k (-0.007, 1/15) but wins at 100k (+0.002, 5/1): the best step falls with experience. granAnneal makes each granule\'s step lr x max(min, a / (a + its use count)): rare letter combinations learn fast, common ones average finely. Win = book10k not worse AND book30k better; y162 tests 100k / 300k.',
    arms: [['v43 1x', V(N4), FIVE, 1.25], ['v43 anneal5000', V(N4, ...AN(5000)), FIVE, 1.25], ['v43 anneal20000', V(N4, ...AN(20000)), FIVE, 1.25], ['v43 anneal5000 min0.5', V(N4, ...AN(5000, 0.5)), FIVE, 1.25]] }));
for (const [s, g] of [['a', K(2304, 8)], ['b', K(2312, 8)]])
  J.push(job(`y163${s}_1x_v43_granCap2`, { q: 'I99', pri: 0.97, seeds: g, title: `granule capacity frontier on v43: granN 8000, mixed 3 / 4-letter claws (granKmin 3, granK 4) at 4000 / 8000, granW 40, fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'y159: granN 4000 book +0.008 / +0.011; granK 4 fables +0.012 but book30k -0.014; granN 4000 + granK 4 book 0, fables +0.013 -> 4-letter claws need more cells. A mixture (each granule 3 or 4 claws) at 8000 could keep book and add fables. y155: granW 40 fables +0.013 but book30k -0.003; does capacity remove its book cost?',
    arms: [['v43 1x', V(N4), FIVE, 1.25], ['v43 granN8000', V('P.granN=8000'), FIVE, 1.7], ['v43 Kmix34', V(N4, 'P.granKmin=3', 'P.granK=4'), FIVE, 1.3],
      ['v43 granN8000 Kmix34', V('P.granN=8000', 'P.granKmin=3', 'P.granK=4'), FIVE, 1.8], ['v43 granW40', V(N4, 'P.granW=40'), FIVE, 1.25]] }));
{ const GEN = (m, temp) => ({ env: { BB_GEN_MEAN: m }, params: Object.assign({ genSyms: 500 }, temp ? { genTemp: temp } : {}) }), g = K(2320, 8), arms = [];
  for (const m of ['wordValid', 'triBits']) for (const [lbl, v] of [['v42 1x', V(N2)], ['v43 1x', V(N4)], ['v43 gate0.2', V(N4, 'pl.outGate=0.2', 'pl.outGateMode=1')]])
    arms.push([`${lbl} gen ${m}`, v, ['b30'], 1.3, 'run/gen.js', GEN(m)]);
  J.push(job('y169_1x_v43_gen', { q: 'I72', pri: 0.94, seeds: g, title: 'generation on v42 / v43 (+ output gate 0.2): book30k life then 500 free-run symbols, published stat = train-vocabulary word rate / trigram bits per char (BB_GEN_MEAN), fresh k 2320-2327',
    note: 'y142 published only the teacher-forced fitness (the generation stats stayed in the worker\'s local jsonl). R91 gen.js BB_GEN_MEAN puts one generation stat in `mean`. Do more / better granules help free-running text (word rate up, trigram bits/char down towards the real-text reference)?',
    req: ['run/gen.js'], arms })); }

// --- heavy jobs (linux-pc: book100k / book300k / cx ids are on tacobell's skip list; memGB > 1) ---
J.push(job('y162a_1x_granAnneal_book100k', { q: 'Q42', pri: 0.975, seeds: K(1400, 8), memGB: 1.5, title: 'the plateau with a decaying granule step: v43 / anneal 5000 / anneal 20000 at book100k + fables12000, growths 1400-1407 (refs y158 v42 / granLr 0.05, same growths) [linux-pc]',
  note: 'y158: v42 book100k 0.384 (+0.016 over v41) but no length slope; granLr 0.05 +0.002 (5/1) at 100k. If granAnneal turns the slow step\'s late gain into a slope without the early loss, the plateau was readout step noise.',
  arms: [['v43 1x', V(N4), ['b100', 'f12'], 1.25], ['v43 anneal5000', V(N4, ...AN(5000)), ['b100', 'f12'], 1.25], ['v43 anneal20000', V(N4, ...AN(20000)), ['b100', 'f12'], 1.25]] }));
J.push(job('y162b_1x_granAnneal_book300k', { q: 'Q42', pri: 0.945, seeds: K(1400, 8), memGB: 1.5, title: 'does anything rise past 100k? v43 vs v43 anneal20000 at book300k, growths 1400-1407 [linux-pc]',
  note: 'Q42: every brain so far is flat from 30k to 1M. A count-based step is the first rule that should keep improving with data; book300k on the same growths as y162a / y158.',
  arms: [['v43 1x', V(N4), ['b300'], 1.25], ['v43 anneal20000', V(N4, ...AN(20000)), ['b300'], 1.25]] }));
J.push(job('y165_cx3_granSize', { q: 'I98', pri: 0.965, seeds: K(1900, 16), memGB: 3.5, f: 5, title: 'scale the granule layer with the cortex (opposite-varying patch): cx3 divRep trophMin/3 with granN 2000 / 6000 x granRef 600 / 1800, growths 1900-1915 (refs y135 / y143 / y152 on the same growths), 5 seq tasks [linux-pc]',
  note: 'y143: granRef 1000 at cx3 book +0.012 / +0.017 (16/0), order3 +0.029, text / fables 0; y149: granN 4000 / 8000 at cx4 book +0.008 / +0.011. Does a layer sized with the cortex (N x3, ref x3) keep the gain growing, and which of the two carries it?',
  arms: [['v42 cx3', VS(CX3, N2, 'P.granRef=600')], ['v42 cx3 granN6000', VS(CX3, 'P.granN=6000', 'P.granRef=600'), FIVE, 1.3], ['v42 cx3 granRef1800', VS(CX3, N2, 'P.granRef=1800')],
    ['v42 cx3 granN6000 granRef1800', VS(CX3, 'P.granN=6000', 'P.granRef=1800'), FIVE, 1.3]] }));
J.push(job('y166_cx3_allround', { q: 'I97', pri: 0.96, seeds: K(1900, 16), memGB: 3.5, f: 5, title: 'the all-round sized brain: cx3 + mixInhRef 850 (order3 fix) with a big strong granule layer (granN 6000, granRef 1000) vs cx3 + ref850 on v42 granules, growths 1900-1915, 5 seq tasks + seqchoice [linux-pc]',
  note: 'y152 (v41): cx3 + ref850 order3 0.960 (= 1x), book +0.019, fables +0.021 vs 1x, but text -0.011 vs cx3. y143: granule drive at cx3 adds book without text cost. Can granules pay for the ref850 text cost, giving one sized brain no worse than 1x anywhere?',
  arms: [['v42 cx3 ref850', VS(CX3, 'P.mixInhRef=850', N2, 'P.granRef=600'), SEVEN], ['v42 cx3 ref850 granN6000 granRef1000', VS(CX3, 'P.mixInhRef=850', 'P.granN=6000', 'P.granRef=1000'), SEVEN, 1.3]] }));
J.push(job('y167_cx4dT_seqchoice_str', { q: 'Q46', pri: 0.955, seeds: K(16, 16), memGB: 3, f: 2.5, title: 'seqchoice at size, replication on new growths 16-31: cx4dT recv4 cone rb2 thin5 ref850 vs + striatum x6 / x8, plus the 1x v42 reference on the same growths [linux-pc]',
  note: 'y150 (growths 0-15): striatum x6 cycle +0.645 (11/5, t 1.5), order2 -0.008; thin8 / recvBudget 1.5 worse. 1x order2 ~6.4 vs cx4 ~4.7: seqchoice is still the size failure. Replicate str6, try str8.',
  arms: [['v42 1x', V(N2), ['so2', 'scy'], 0.4], ['v42 cx4dT ref850', VS(CX4DT, 'P.mixInhRef=850', N2, 'P.granRef=600'), ['so2', 'scy']],
    ['v42 cx4dT ref850 str6', VS(CX4DT, 'P.mixInhRef=850', 'sc.sizeF@striatum=6', N2, 'P.granRef=600'), ['so2', 'scy'], 1.2], ['v42 cx4dT ref850 str8', VS(CX4DT, 'P.mixInhRef=850', 'sc.sizeF@striatum=8', N2, 'P.granRef=600'), ['so2', 'scy'], 1.4]] }));
J.push(job('y168_cx4dT_granN8000', { q: 'I99', pri: 0.95, seeds: K(0, 8), memGB: 3.5, f: 5, title: 'the best all-round cx4 brain (cx4dT recv4 cone rb2 thin5) on v42 granules: granN 2000 vs 8000, growths 0-7 (refs y136 / y144), 7 tasks [linux-pc]',
  note: 'y144 (v41): granules add book +0.025 / +0.026 at cx4dT, seqchoice identical; y149 (cx4 divRep): granN 8000 book +0.006 / +0.011 more. Does the capacity gain carry to the all-round brain at v42 strength without touching seqchoice / order3?',
  arms: [['v42 cx4dT', VS(CX4DT, N2, 'P.granRef=600'), SEVEN], ['v42 cx4dT granN8000', VS(CX4DT, 'P.granN=8000', 'P.granRef=600'), SEVEN, 1.4]] }));
for (const [s, g] of [['a', K(2328, 8)], ['b', K(2336, 8)]])
  J.push(job(`y171${s}_1x_v43_granRef`, { q: 'I99', pri: 0.93, seeds: g, title: `hygiene for the new default: does granRef need rescaling with twice the granule cells? v43 granRef 400 / 900 vs 600, fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'NLMS normalises the step by input power, but the drive d = sum w x / granRef doubles in reach with 2x cells. y146: 450-1000 flat at granN 2000. Expect flat; a clear win here would mean the v43 drive is mis-scaled.',
    arms: [['v43 1x', V(N4), FIVE, 1.25], ['v43 granRef400', V(N4, 'P.granRef=400'), FIVE, 1.25], ['v43 granRef900', V(N4, 'P.granRef=900'), FIVE, 1.25]] }));
J.push(job('y172_1x_v43_fables12k', { q: 'Q42', pri: 0.935, seeds: K(2344, 8), title: 'length on a second corpus: v42 / v43 / v43 anneal20000 at fables12000, fresh k 2344-2351',
  note: 'y158: granLr 0.05 cost fables12000 -0.003 (1/7) while helping book100k; does the decaying step avoid that cost?',
  arms: [['v42 1x', V(N2), ['f12']], ['v43 1x', V(N4), ['f12'], 1.25], ['v43 anneal20000', V(N4, ...AN(20000)), ['f12'], 1.25]] }));
J.push(job('y173_cx3_granSize_book100k', { q: 'Q42', pri: 0.94, seeds: K(1400, 8), memGB: 3.5, f: 4, title: 'the plateau at size: cx3 v42 granules vs cx3 granN 6000 + granRef 1800 at book100k, growths 1400-1407 (ref y151 cx3 v41) [linux-pc]',
  note: 'y151: cx3 v41 book100k 0.391 (+0.024 over v41 1x) but flat with length like 1x. Does a granule layer sized with the cortex lift the 100k level further?',
  arms: [['v42 cx3', VS(CX3, N2, 'P.granRef=600'), ['b100']], ['v42 cx3 granN6000 granRef1800', VS(CX3, 'P.granN=6000', 'P.granRef=1800'), ['b100'], 1.3]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(32), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
