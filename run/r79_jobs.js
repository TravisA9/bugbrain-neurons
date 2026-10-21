// R79 (Oct 20 2026, 7 PM queue review): shared-queue jobs y97-y110 (node run/r79_jobs.js <outdir>) + re-rank / trophMin fix of pending jobs
//   (node run/r79_jobs.js <outdir> <queue jobs dir> <queue done dir> <queue claims dir>).
// R79 findings behind these jobs (RESULTS R79):
//   - trophMin 0.005/f (Travis's opposite-varying patch) holds on 16 FRESH growths (y89, k 1700-1715): cx4 divRep K4 0.981 vs 1x 0.986 (untreated cx4 0.090);
//     8x order3 0 -> 0.766, text 0.565 -> 0.777 (y91). Book is bit-identical with or without it (pure fix of starved output-projecting cells).
//   - compensated curve (y90, growths 0-15, vs 1x): book30k cx2 +0.003, cx3 +0.025, cx4 +0.031, cx8 (n 8, book10k) +0.023; fresh cx4 (y89) +0.034 16/0.
//     Peak at 3x-4x; 8x is below 4x (fables -0.012, 0/8). order3 K8 still -0.08..-0.19 and seqchoice collapses with cortex divRep (0.1-1.7 of 9).
//   - R78 (box): the order3 K8 size loss is pooled mixing-cell feedforward inhibition (mixInh x raw presynaptic count, grows ~f); P.mixInhRef restores order3
//     at all-sizeF 4x but costs text (trade-off). R79 box census: seqchoice collapse under cortex divRep = the striatum's plastic cortex input is spread over
//     14x more, 14x weaker synapses (487 -> 6905, same total weight 1461); sc.normE@striatum does not fix it (0.33 -> 0.77-0.87 of 9.05).
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r79_jobs.js'];
const out = process.argv[2] || 'jobs_r79'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
const FAB = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'fables', nSyms: n, readIn: 0.01 }, x || {}) });
const ORD = (K, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'order3', K, readIn: 0.01 }, x || {}) });
const TXT = x => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'text', nSyms: 1000, readIn: 0.01 }, x || {}) });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
const GEN = t => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: 30000, evalSyms: 2000, genSyms: 500 }, t != null ? { genTemp: t } : {}) });
const T = { b10: [book(10000), 'book10k'], b30: [book(30000), 'book30k'], b100: [book(100000), 'book100k'], f4: [FAB(4000), 'fables4000'], o3: [ORD(8), 'order3'], o3k4: [ORD(4), 'order3 K4'],
  t1: [TXT(), 'text1000'], f8: [FAB(8000), 'fables8000'], f12: [FAB(12000), 'fables12000'], so2: [SC('order2'), 'seqchoice order2'], scy: [SC('cycle'), 'seqchoice cycle'],
  gG: [GEN(), 'gen30k greedy'], g7: [GEN(0.7), 'gen30k T0.7'], g1: [GEN(1), 'gen30k T1'],
  rb10: [book(10000, { readIn: 0.005 }), 'book10k'], rb30: [book(30000, { readIn: 0.005 }), 'book30k'], rf4: [FAB(4000, { readIn: 0.005 }), 'fables4000'], ro3: [ORD(8, { readIn: 0.005 }), 'order3'], rt1: [TXT({ readIn: 0.005 }), 'text1000'],
  Rb10: [book(10000, { readIn: 0.02 }), 'book10k'], Rb30: [book(30000, { readIn: 0.02 }), 'book30k'], Rf4: [FAB(4000, { readIn: 0.02 }), 'fables4000'], Ro3: [ORD(8, { readIn: 0.02 }), 'order3'], Rt1: [TXT({ readIn: 0.02 }), 'text1000'] };
// wall s per run per slot (linux-pc; R77 table), 2x / 3x / 6x interpolated; gen ~ book30k + 10 %
const SEC = { '1x': { f8: 40, f12: 60, b10: 35, b30: 81, b100: 270, f4: 20, o3: 8, o3k4: 6, t1: 11, so2: 11, scy: 9, gG: 90, g7: 90, g1: 90 },
  c4d: { f8: 230, f12: 345, b10: 221, b30: 560, b100: 1870, f4: 115, o3: 62, o3k4: 50, t1: 83, so2: 75, scy: 72, gG: 620, g7: 620, g1: 620 }, c8d: { b10: 577, b30: 1460, f4: 300, o3: 142, t1: 206 } };
for (const [k, m] of [['c2d', 0.45], ['c3d', 0.7], ['c6d', 1.9]]) { SEC[k] = {}; for (const t in SEC.c4d) SEC[k][t] = Math.round(SEC.c4d[t] * m); }
for (const t of Object.keys(T)) if (/^[rR]/.test(t)) for (const s in SEC) SEC[s][t] = SEC[s][t.slice(1)] || SEC[s][t.slice(1).toLowerCase()];
const FAST = 'P.fastEngine=1', L2 = 'pl.lr@cortex=0.2', PN = x => `pl.preNorm@cortex=${x}`, v = (...a) => a.filter(Boolean).concat([FAST]).join(',');
const FR = 'P.fanRef=450,P.fanRefR=126', CD = (f, d = 2) => `sc.sizeF@cortex=${f},sc.divRep@cortex=${d}`, TM = f => `sc.trophMin@cortex=${+(0.005 / f).toPrecision(4)}`;
const V40 = v(L2), CDT = (f, ...x) => v(CD(f), TM(f), FR, ...x.length ? x : [L2, PN(45)]);
const SLOTS = 6, K = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const ALL7 = ['b10', 'b30', 'f4', 'o3', 't1', 'so2', 'scy'], FIVE = ['b10', 'b30', 'f4', 'o3', 't1'];
function job(id, o) {
  const runs = []; let sec = 0;
  for (const a of o.arms) for (const tk of a.tasks) for (const g0 of (a.seeds || o.seeds)) {
    const gen = /^g/.test(tk);
    runs.push({ script: gen ? 'run/gen.js' : 'run/r42.js', args: ['deepURSx3', T[tk][0], '1', a.variant, String(g0), '--force'], label: `${a.lbl} ${T[tk][1]} g${g0} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += SEC[a.size][tk]; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ.concat(o.req || []), title: o.title, priority: o.pri, estHours: +(sec / 3600 / SLOTS).toFixed(1), slotHours: +(sec / 3600).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  if (o.memGB) j.memGB = o.memGB;
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const J = [];
// ---------- heavy (linux-pc; 'cx' / 'book100k' in the id -> tacobell skips) ----------
const MR = 'P.mixInhRef=850', MP = 'P.mixInhPow=0.5';
for (const [s, g] of [['a', K(1800, 8)], ['b', K(1808, 8)]])
  J.push(job(`y97${s}_cx4dT_mixInhRef`, { q: 'I97', pri: 0.996, seeds: g, memGB: 2.5, title: `cortex 4x divRep 2 + trophMin/4 (the best book brain) with / without R78 mixInhRef 850 (and pow 0.5), growths ${g[0]}-${g[7]}, all 7 tasks (refs: y92 v40 1x on the same growths)`,
    note: 'y89/y90: cx4 divRep trophMin/4 book +0.031-0.034 (32/0) but order3 -0.11..-0.12 and seqchoice collapsed. R78: order3 size loss = pooled mixInh; does mixInhRef restore order3 on THIS brain and what does it cost text?',
    arms: [{ variant: CDT(4), lbl: 'cx4 divRep trophMin/4', tasks: ALL7, size: 'c4d' }, { variant: CDT(4, L2, PN(45), MR), lbl: 'cx4 divRep trophMin/4 mixInhRef850', tasks: ALL7, size: 'c4d' },
      { variant: CDT(4, L2, PN(45), MR, MP), lbl: 'cx4 divRep trophMin/4 mixInhRef850 pow0.5', tasks: ALL7, size: 'c4d' }] }));
for (const [s, g] of [['a', K(1900, 8)], ['b', K(1908, 8)]])
  J.push(job(`y98${s}_cx3dT_fresh`, { q: 'I95', pri: 0.99, seeds: g, memGB: 2, title: `cortex 3x divRep 2 + trophMin/3 vs 1x v40 on FRESH growths k ${g[0]}-${g[7]}, all 7 tasks + order3 K4`,
    note: 'y90 growths 0-15: cx3 book30k +0.025, fables +0.027, text +0.017 (14/2) vs 1x, = cx4 on book and better on text at ~70 % of the cost. Fresh-seed check.',
    arms: [{ variant: V40, lbl: 'v40 1x', tasks: ALL7.concat(['o3k4']), size: '1x' }, { variant: CDT(3), lbl: 'cx3 divRep trophMin/3', tasks: ALL7.concat(['o3k4']), size: 'c3d' }] }));
J.push(job('y99a_cx6_trophMin_curve', { q: 'I95', pri: 0.985, seeds: K(0, 16), memGB: 3.6, title: 'cortex 6x divRep 2 + trophMin/6, growths 0-15, 5 tasks: where does the size curve peak (cx4 +0.031, cx8 +0.023 book vs 1x)?',
  note: 'refs y90 (cx2/3/4 trophMin, growths 0-15), y84 v39 preNorm50 1x', arms: [{ variant: CDT(6), lbl: 'cx6 divRep trophMin/6', tasks: FIVE, size: 'c6d' }] }));
{ const j = job('y99b_cx8_trophMin_g8', { q: 'I95', pri: 0.98, seeds: K(8, 8), title: 'cortex 8x divRep 2 + trophMin/8, growths 8-15 (completes 16 with y91) + book30k on growths 0-15 [memGB 4.6]',
  note: 'y91 (growths 0-7): 8x book10k +0.023, fables +0.020 vs 1x but below 4x (fables -0.012 0/8); order3 0.766',
  arms: [{ variant: CDT(8), lbl: 'cx8 divRep trophMin/8', tasks: ['o3', 't1', 'b10', 'f4', 'b30'], size: 'c8d' }, { variant: CDT(8), lbl: 'cx8 divRep trophMin/8', tasks: ['b30'], seeds: K(0, 8), size: 'c8d' }] });
  Object.assign(j, { memGB: 4.6, estHours: +(j.slotHours / 2).toFixed(1) }); fs.writeFileSync(path.join(out, j.id + '.json'), JSON.stringify(j, null, 2) + '\n'); }
J.push(job('y100_cx4dT_lr', { q: 'I95', pri: 0.97, seeds: K(0, 16), memGB: 2.5, title: 'cortex 4x divRep 2 + trophMin/4 at cortex lr 0.1 and 0.3 (vs 0.2 in y90), growths 0-15, 5 tasks',
  note: 'R70: lr 0.1 was better than 0.2 for 2x-4x grid-scaled brains; is 0.2 right for the divRep brain (plastic weight per synapse falls ~1/f)?',
  arms: [0.1, 0.3].map(x => ({ variant: CDT(4, `pl.lr@cortex=${x}`, PN(45)), lbl: `cx4 divRep trophMin/4 lr${x}`, tasks: FIVE, size: 'c4d' })) }));
J.push(job('y101_cx4dT_preNorm55', { q: 'I92', pri: 0.96, seeds: K(0, 16), memGB: 2.5, title: 'cortex 4x divRep 2 + trophMin/4 at the v40 cortex budget preNorm 55 (scaled arms pin 45), growths 0-15, 5 tasks + K4',
  note: 'R77: preNorm 55 cost order3 at cortex 4x + fanRef (y85 -0.014 0/8); is that true for the divRep + trophMin brain? if not, size arms can drop the pin',
  arms: [{ variant: CDT(4, L2, PN(55)), lbl: 'cx4 divRep trophMin/4 preNorm55', tasks: FIVE.concat(['o3k4']), size: 'c4d' }] }));
J.push(job('y102_cxdT_divRep3', { q: 'I80', pri: 0.95, seeds: K(0, 16), memGB: 2.8, title: 'cortex 3x / 4x with divRep 3 (fills the cortex further) + trophMin 0.005/f, growths 0-15, 5 tasks',
  note: 'divRep 2 vs none: book +0.020-0.025 at cx4 (y46c). Is the gain from cell count (divRep 3 > 2) or saturated?',
  arms: [3, 4].map(f => ({ variant: v(CD(f, 3), TM(f), FR, L2, PN(45)), lbl: `cx${f} divRep3 trophMin/${f}`, tasks: FIVE, size: f === 3 ? 'c3d' : 'c4d' })) }));
J.push(job('y103_cx4dT_book100k', { q: 'I93', pri: 0.94, seeds: K(0, 8), memGB: 2.5, title: 'cortex 4x divRep 2 + trophMin/4 and 1x v40 at book100k, growths 0-7: does the divRep size gain grow with text length?',
  note: 'length is flat for 1x (y27: 30k 0.329 -> 1M 0.332) and for cx4 + fanRef (y50: +0.005 / +0.008 vs 1x at 100k / 300k); divRep is the bigger, better brain',
  arms: [{ variant: V40, lbl: 'v40 1x', tasks: ['b100'], size: '1x' }, { variant: CDT(4), lbl: 'cx4 divRep trophMin/4', tasks: ['b100'], size: 'c4d' }] }));
J.push(job('y104_cx4dT_gen', { q: 'I72', pri: 0.93, seeds: K(0, 16), memGB: 2.5, req: ['run/gen.js'], title: 'generation after book30k with the best book brain (cortex 4x divRep 2 + trophMin/4): T0.7, gate 0.2 (mode 1), gate 0.2 + T0.7, growths 0-15 (run/gen.js)',
  note: 'y53 / y78 (cx4 + fanRef / fix): greedy = all spaces (top char 0.95), T0.7 word-valid 0.69-0.74; y18 4xS gate 0.2 word-valid 0.84 but 66 % spaces. Metrics in registry/<id>.jsonl (stats), not in the mean',
  arms: [{ variant: CDT(4), lbl: 'cx4 divRep trophMin/4', tasks: ['g7'], size: 'c4d' }, { variant: CDT(4, L2, PN(45), 'pl.outGate=0.2', 'pl.outGateMode=1'), lbl: 'cx4 divRep trophMin/4 gate0.2', tasks: ['gG', 'g7'], size: 'c4d' }] }));
J.push(job('y110_cx4dT_seqchoice_dissect', { q: 'I98', pri: 0.975, seeds: K(0, 16), memGB: 3.2, title: 'why cortex-only size kills seqchoice: cx4 divRep 2 + trophMin/4 with the striatum and / or context also 4x (+ sizeCone / recvBudget 2), growths 0-15, seqchoice cycle / order2 + book10k',
  note: 'y92: all-region 4x + sizeCone + recvBudget2 keeps seqchoice (cycle 7.7 vs 1x 9.1) but cortex-only divRep collapses it (2.2). R79 box g0 cycle: cx4dT 0.33 (below chance: echoes the input), + striatum 4x 1.3-1.7, + normE@striatum 0.8. Which other region has to grow with the cortex?',
  arms: [['striatum', 'sc.sizeF@striatum=4,sc.trophMin@striatum=0.00125'], ['context', 'sc.sizeF@context=4'], ['context+striatum', 'sc.sizeF@context=4,sc.sizeF@striatum=4,sc.trophMin@striatum=0.00125'],
    ['context+striatum cone rb2', 'sc.sizeF@context=4,sc.sizeF@striatum=4,sc.trophMin@striatum=0.00125,P.sizeCone=1,P.recvBudget=2,P.postCapRel=1.5']]
    .map(([n, x]) => ({ variant: CDT(4, x, L2, PN(45)), lbl: `cx4 divRep trophMin/4 + ${n} 4x`, tasks: ['scy', 'so2', 'b10'], size: 'c4d' }))
    .concat([{ variant: v('sc.sizeF=4', 'sc.divRep@cortex=2', 'P.sizeCone=1', FR, 'P.postCapRel=1.5', 'P.recvBudget=2', TM(4), L2), lbl: 'all4 divRep sizeCone recvBudget2 trophMin/4', tasks: ['scy', 'so2', 'b10', 'b30'], size: 'c4d' }]) }));
J.push(job('y111_cx4dT_fables_long', { q: 'I93', pri: 0.9, seeds: K(0, 16), memGB: 2.5, title: 'cortex 4x divRep 2 + trophMin/4 on fables 8000 / 12000, growths 0-15 (does the gap-length gain grow with the better size brain?)',
  note: 'y71 cx4 fix: fables8000 +0.011, 12000 +0.012 vs 1x (y17 growths 0-7) = the same as at 4000: no length effect so far', arms: [{ variant: CDT(4), lbl: 'cx4 divRep trophMin/4', tasks: ['f8', 'f12'], size: 'c4d' }] }));
{ const j = job('y112_cx8_trophMin_g16', { q: 'I95', pri: 0.89, seeds: K(16, 8), title: 'cortex 8x divRep 2 + trophMin/8, growths 16-23, 5 tasks [memGB 4.6] (with y91 / y99b: 24 growths for the 8x-vs-4x question)',
  note: 'is 8x really below 4x on book / fables? refs y90 / y100 cx4 on growths 0-15, y51 1x lr0.2 on 16-31', arms: [{ variant: CDT(8), lbl: 'cx8 divRep trophMin/8', tasks: FIVE, size: 'c8d' }, { variant: CDT(4), lbl: 'cx4 divRep trophMin/4', tasks: FIVE, size: 'c4d' }, { variant: V40, lbl: 'v40 1x', tasks: FIVE, size: '1x' }] });
  Object.assign(j, { memGB: 4.6, estHours: +(j.slotHours / 2).toFixed(1) }); fs.writeFileSync(path.join(out, j.id + '.json'), JSON.stringify(j, null, 2) + '\n'); J.push(j); }
// ---------- light (tacobell; 1x only, memGB <= 1, ids avoid its skip patterns) ----------
for (const [s, g] of [['a', K(1900, 8)], ['b', K(1908, 8)], ['c', K(1916, 8)], ['d', K(1924, 8)]])
  J.push(job(`y105${s}_1x_mixInh_ladder`, { q: 'I96', pri: 0.9, seeds: g, memGB: 0.6, title: `1x v40 mixInh 0.3 / 0.4 / 0.45 (default 0.5) vs v40, growths ${g[0]}-${g[7]}, all 7 tasks [light]`,
    note: 'y95a (k 1816-1823): mixInh 0.35 order3 +0.008 (5/0), text -0.004 (1/7), book / fables 0; 0.7 order3 -0.058 (0/8). Is a slightly weaker mixing inhibition a v41 candidate (needs no task worse on 16 fresh growths)?',
    arms: [{ variant: V40, lbl: 'v40 1x', tasks: ALL7, size: '1x' }].concat([0.3, 0.4, 0.45].map(x => ({ variant: v(`pl.mixInh@cortex=${x}`, L2), lbl: `1x mixInh ${x}`, tasks: ALL7, size: '1x' }))) }));
J.push(job('y106_1x_gen', { q: 'I72', pri: 0.88, seeds: K(0, 16), memGB: 0.6, req: ['run/gen.js'], title: '1x v40 generation after book30k: greedy, T0.7, T1, gate 0.2 (mode 1), gate 0.2 + T0.7, growths 0-15 (run/gen.js) [light]',
  note: 'first 1x generation metrics with run/gen.js (y31 recorded none); refs y18 / y53 / y78 / y104 at size',
  arms: [{ variant: V40, lbl: 'v40 1x', tasks: ['gG', 'g7', 'g1'], size: '1x' }, { variant: v(L2, 'pl.outGate=0.2', 'pl.outGateMode=1'), lbl: 'v40 1x gate0.2', tasks: ['gG', 'g7'], size: '1x' }] }));
for (const [s, g] of [['a', K(1900, 8)], ['b', K(1908, 8)]])
  J.push(job(`y107${s}_1x_readIn`, { q: 'Q42', pri: 0.86, seeds: g, memGB: 0.6, title: `1x v40 graded-decoder readIn 0.005 / 0.02 (default 0.01) on 5 tasks, growths ${g[0]}-${g[7]} [light] (v40 refs in y105)`,
    note: 'readout path toward the 0.40 oracle: readIn was tuned at v36; re-check at v40. book tasks get readIn explicitly',
    arms: [{ variant: V40, lbl: '1x readIn0.005', tasks: ['rb10', 'rb30', 'rf4', 'ro3', 'rt1'], size: '1x' }, { variant: V40, lbl: '1x readIn0.02', tasks: ['Rb10', 'Rb30', 'Rf4', 'Ro3', 'Rt1'], size: '1x' }] }));
for (const [s, g] of [['a', K(1900, 8)], ['b', K(1908, 8)]])
  J.push(job(`y108${s}_1x_trophMin`, { q: 'I95', pri: 0.84, seeds: g, memGB: 0.6, title: `1x v40 with a lower trophic survival threshold (trophMin@cortex 0.0025 / 0.00125, default 0.005), growths ${g[0]}-${g[7]}, all 7 tasks + K4 [light] (v40 refs in y105 / y98)`,
    note: 'does trophic death prune useful cortex cells even at 1x? (the size patch is 0.005/f; at 1x it is the default)',
    arms: [0.0025, 0.00125].map(x => ({ variant: v(`sc.trophMin@cortex=${x}`, L2), lbl: `1x trophMin ${x}`, tasks: ALL7.concat(['o3k4']), size: '1x' })) }));
J.push(job('y109_1x_metaN', { q: 'Q44', pri: 0.8, seeds: K(1900, 16), memGB: 0.6, title: '1x v40 cortex metaN 40 / 80 / 160 (consolidation) on book30k, fables, order3, text, growths 1900-1915 [light]',
  note: 'the learning plateau after ~10k symbols (length flat to 1M): does the metaplastic consolidation count move it at 1x? (y20 tests metaN 80 at 4xS)',
  arms: [40, 80, 160].map(x => ({ variant: v(`pl.metaN@cortex=${x}`, L2), lbl: `1x metaN ${x}`, tasks: ['b30', 'f4', 'o3', 't1'], size: '1x' })) }));
// ---------- re-rank / fix pending jobs ----------
const [QJ, QD, QC] = process.argv.slice(3);
const PRI = { y56_cx8_book300k: 0.6, y72_cx8_fix_all7: 0.9 };
if (QJ) { let files = 0;
  for (const f of fs.readdirSync(QJ).filter(f => f.endsWith('.json'))) {
    const id = f.replace(/\.json$/, ''); if (fs.existsSync(path.join(QD, f)) || fs.existsSync(path.join(QC, f))) continue;
    const j = JSON.parse(fs.readFileSync(path.join(QJ, f), 'utf8')); let ch = false;
    if (id === 'y72_cx8_fix_all7') { for (const r of j.runs) if (!/trophMin/.test(r.args[3])) { const a = r.args[3].split(','); a.splice(a.indexOf(FAST), 0, TM(8)); r.args[3] = a.join(','); r.label = r.label.replace('cx8 fix ', 'cx8 fix trophMin/8 '); }
      j.title = j.title + ' + trophMin/8 (R79: without it 8x outputs starve: order3 0.000)'; ch = true; }
    if (PRI[id] != null && PRI[id] !== j.priority) { j.priority = PRI[id]; ch = true; }
    if (ch) { j.r79 = 'R79: re-rank' + (id === 'y72_cx8_fix_all7' ? ' + trophMin/8 added' : ''); fs.writeFileSync(path.join(out, f), JSON.stringify(j, null, 2) + '\n'); files++; } }
  console.log(`changed ${files} pending job files`); }
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h mem ${j.memGB || '-'}`).join('\n'));
const heavy = J.filter(j => !/_1x_/.test(j.id)), light = J.filter(j => /_1x_/.test(j.id));
console.log('heavy est', heavy.reduce((a, j) => a + j.estHours, 0).toFixed(1), 'light slot-h', light.reduce((a, j) => a + j.slotHours, 0).toFixed(1));
