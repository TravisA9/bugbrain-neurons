// R71: shared-queue jobs y42-y61 (node run/r71_jobs.js <outdir>): the size-scaling genes of R71 (all off by default, bit-identical when off):
//   sc.sizeF (per-region size factor), sc.sizeNorm (fan-in-capped E/I normalisation), sc.divRep (I80: divisions per developmental step),
//   P.fanRef / P.fanRefR (fan-in-normalised learning rate of the teacher / reward rule: lr x fanRef / n for a receiver with n > fanRef plastic inputs).
// `requires` lists run/r71_jobs.js, so only workers whose checkout has the R71 code claim them.
// Box screen (growths 0-7, R71): cortex 4x + fanRef 450 at lr 0.2 order3 0.875 vs cortex 4x lr 0.2 0.756 (8/0) and lr 0.1 0.797 (8/0); 1x 0.95-0.965;
//   fanRefR 126 lifts seqchoice order2 3.19 -> 3.86 (1x 6.5); sizeNorm 4 kills seqchoice order2 (1.02).
// Time model: slot-seconds per growth as r70_jobs.js; cortex-only sizes: 4xC = 0.6 x 4xS, 4xCd (divRep 2, 7.2k cortex cells) 0.7 x, 8xC (14.5k) 1.3 x.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/develop.js', 'run/r71_jobs.js'];
const out = process.argv[2] || 'jobs_r71'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
const FAB = n => JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: n, readIn: 0.01 } });
const ORD = K => JSON.stringify({ env: 'seq', params: { source: 'order3', K, readIn: 0.01 } }), TXT = JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
const G30 = x => book(30000, Object.assign({ genSyms: 500 }, x)), G100 = x => book(100000, Object.assign({ genSyms: 500 }, x));
const T = { b10: [book(10000), 'book10k'], b30: [book(30000), 'book30k'], b100: [book(100000), 'book100k'], b300: [book(300000), 'book300k'], b1m: [book(1000000), 'book1M'],
  f4: [FAB(4000), 'fables4000'], f8: [FAB(8000), 'fables8000'], f12: [FAB(12000), 'fables12000'], o3: [ORD(8), 'order3'], o3k4: [ORD(4), 'order3 K4'], o3k16: [ORD(16), 'order3 K16'],
  t1: [TXT, 'text1000'], so2: [SC('order2'), 'seqchoice order2'], scy: [SC('cycle'), 'seqchoice cycle'],
  g30: [G30({}), 'gen30k greedy'], g30t1: [G30({ genTemp: 1 }), 'gen30k T1'], g30t7: [G30({ genTemp: 0.7 }), 'gen30k T0.7'], g100: [G100({}), 'gen100k greedy'], g100t7: [G100({ genTemp: 0.7 }), 'gen100k T0.7'] };
const SEC = { '1x': { b10: 35, b30: 81, b100: 270, b300: 810, b1m: 2700, f4: 20, f8: 40, f12: 60, o3: 8, o3k4: 6, o3k16: 12, t1: 11, so2: 11, scy: 9, g30: 85, g30t1: 85, g30t7: 85, g100: 275, g100t7: 275 },
  '2xS': { b10: 75, b30: 190, b100: 650, b300: 1950, f4: 40, f8: 80, o3: 25, t1: 33, so2: 45, scy: 40 },
  '3xS': { b10: 170, b30: 420, f4: 90, o3: 55, t1: 60, so2: 110, scy: 100 },
  '4xS': { b10: 260, b30: 650, b100: 2000, b300: 6000, f4: 136, f8: 272, f12: 408, o3: 88, o3k4: 70, o3k16: 120, t1: 95, so2: 175, scy: 152, g30: 660, g30t7: 660, g100: 2010, g100t7: 2010 } };
const S3 = 'sc.grid=104,sc.maxCells=10200,sc.coneSpeed=5,sc.axonLen=69', S4 = 'sc.grid=120,sc.maxCells=13600,sc.coneSpeed=6,sc.axonLen=80', S2 = 'sc.grid=85,sc.maxCells=6800,sc.coneSpeed=4,sc.axonLen=57';
const at = (s, sel) => s.split(',').map(kv => { const [k, v] = kv.split('='); return `${k}@${sel}=${v}`; }).join(',');
const L1 = 'pl.lr@cortex=0.1', L2 = 'pl.lr@cortex=0.2', FAST = 'P.fastEngine=1', v = (...a) => a.filter(Boolean).concat([FAST]).join(',');
const SLOTS = 6;
function job(id, o) {
  const runs = []; let sec = 0; const G = o.G || 1;
  for (const a of o.arms) for (const tk of a.tasks) for (let i = 0; i < o.seeds.length; i += G) { const g0 = o.seeds[i];
    runs.push({ script: 'run/r42.js', args: [a.plan || 'deepURSx3', T[tk][0], String(G), a.variant, String(g0), '--force'], label: `${a.lbl} ${T[tk][1]} g${g0} n${G}`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += G * SEC[a.size][tk]; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / SLOTS).toFixed(1), slotHours: +(sec / 3600).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const ALL7 = ['b10', 'b30', 'f4', 'o3', 't1', 'so2', 'scy'], FIVE = ['b10', 'b30', 'f4', 'o3', 't1'];
const J = [];
for (const [s, f] of [['4xC', 0.6], ['4xCd', 0.7], ['8xC', 1.3]]) { SEC[s] = {}; for (const k in SEC['4xS']) SEC[s][k] = SEC['4xS'][k] * f; }
const C4 = 'sc.sizeF@cortex=4', C8 = 'sc.sizeF@cortex=8,sc.divRep@cortex=2', FR = (a, b) => `P.fanRef=${a},P.fanRefR=${b}`, R = FR(450, 126);
// 1. complete the box screen arms to 16 growths (box = growths 0-7)
J.push(job('y42a_cx4_fanRef_g8', { q: 'I87', pri: 0.99, seeds: K(8, 8), title: 'cortex 4x + fanRef (450 / 840) at lr 0.2 and plain cortex 4x lr 0.2, growths 8-15, all 7 tasks', note: 'box screen R71 has growths 0-7; refs y10 (cortex 4x lr 0.1), y08 / y24 (1x)',
  arms: [{ variant: v(C4, 'P.fanRef=450', L2), tasks: ALL7, size: '4xC', lbl: 'cx4 fanRef450 lr0.2' }, { variant: v(C4, FR(840, 126), L2), tasks: ALL7, size: '4xC', lbl: 'cx4 fanRef840/R126 lr0.2' }, { variant: v(C4, L2), tasks: ALL7, size: '4xC', lbl: 'cx4 lr0.2' }] }));
J.push(job('y42b_cx4_norm_g8', { q: 'I87', pri: 0.985, seeds: K(8, 8), title: 'cortex 4x + sizeNorm 4 + fanRef 840/126 at lr 0.1, growths 8-15, all 7 tasks', note: 'the requested 4xS-cortex-only + normalisation arm (box: seqchoice order2 collapses with sizeNorm)',
  arms: [{ variant: v(C4, 'sc.sizeNorm@cortex=4', FR(840, 126), L1), tasks: ALL7, size: '4xC', lbl: 'cx4 sizeNorm fanRef840 lr0.1' }] }));
// 2. fanRef ladder at cortex 4x (lower fanRef = stronger normalisation; box: 450 > 840 on order3)
J.push(job('y43_cx4_fanRef_ladder', { q: 'I87', pri: 0.98, seeds: K(0, 16), title: 'cortex 4x lr 0.2: fanRef 450 + fanRefR 126 / fanRef 300 + R126 / fanRef 450 + R60, growths 0-15, all 7 tasks', note: 'vs y42a + box (fanRef 450 without R, 840 + R126)',
  arms: [[R, 'fanRef450/R126'], [FR(300, 126), 'fanRef300/R126'], [FR(450, 60), 'fanRef450/R60']].map(([x, l]) => ({ variant: v(C4, x, L2), tasks: ALL7, size: '4xC', lbl: 'cx4 ' + l })) }));
// 3. fresh growths for the leading arm
for (const [id, s] of [['y44a_cx4_fanRef_fresh', K(1300, 8)], ['y44b_cx4_fanRef_fresh', K(1308, 8)]])
  J.push(job(id, { q: 'I87', pri: 0.975, seeds: s, title: `cortex 4x + fanRef 450/R126 lr 0.2 and cortex 4x lr 0.1 on fresh growths k ${s[0]}-${s[7]}, all 7 tasks`, note: 'refs y23 (1x lr 0.1 / 0.2, same growths)',
    arms: [{ variant: v(C4, R, L2), tasks: ALL7, size: '4xC', lbl: 'cx4 fanRef450/R126 lr0.2' }, { variant: v(C4, L1), tasks: ALL7, size: '4xC', lbl: 'cx4 lr0.1' }] }));
// 4. whole-brain sizes with the normalisation, and per-region factors (b): striatum kept 1x / scaled by its own factor
for (const [id, s] of [['y45a_4x_regions_fanRef', K(0, 8)], ['y45b_4x_regions_fanRef', K(8, 8)]])
  J.push(job(id, { q: 'I87', pri: 0.97, seeds: s, title: `4x by region with fanRef 450/R126 lr 0.2 (growths ${s[0]}-${s[7]}): plain 4xS, sizeF 4 all but striatum, sizeF 4 everywhere (striatum 4x its own size), all 7 tasks`, note: 'refs y10 / y11 (plain 4xS lr 0.1, lr 0.2), y08 / y24 (1x)',
    arms: [{ variant: v(S4, R, L2), tasks: ALL7, size: '4xS', lbl: 'plain 4xS fanRef' }, { variant: v('sc.sizeF@!striatum=4', R, L2), tasks: ALL7, size: '4xS', lbl: 'sizeF4 !striatum fanRef' }, { variant: v('sc.sizeF=4', R, L2), tasks: ALL7, size: '4xS', lbl: 'sizeF4 all fanRef' }] }));
// 5. (c) I80: 8x cortex with divRep 2 (fills maxCells: 14.5k cortex cells vs 7.3k without), and 4x cortex divRep 2 (7.2k vs 6.0k cells)
J.push(job('y46_cx8_divRep', { q: 'I80', pri: 0.965, seeds: K(0, 8), title: 'cortex 8x divRep 2 and cortex 4x divRep 2 (fanRef 450/R126, lr 0.2), growths 0-7, all 7 tasks', note: 'vs the cortex 4x fanRef arms (box + y43): does a fully grown bigger cortex pay once the rate is normalised?',
  arms: [{ variant: v(C8, R, L2), tasks: ALL7, size: '8xC', lbl: 'cx8 divRep2 fanRef' }, { variant: v(C4, 'sc.divRep@cortex=2', R, L2), tasks: ALL7, size: '4xCd', lbl: 'cx4 divRep2 fanRef' }] }));
// 6. is fanRef neutral (or useful) at 1x? (v39 = lr 0.2)
J.push(job('y47_1x_fanRef', { q: 'I87', pri: 0.96, seeds: K(0, 16), title: '1x (v39) + fanRef 450/R126 and + fanRef 840/R126, growths 0-15, all 7 tasks', note: 'refs y24 / y08 (v39 1x); 1x predictors have ~840 plastic inputs, the striatum ~120',
  arms: [{ variant: v(R, L2), tasks: ALL7, size: '1x', lbl: '1x fanRef450/R126' }, { variant: v(FR(840, 126), L2), tasks: ALL7, size: '1x', lbl: '1x fanRef840/R126' }] }));
// 7. rate under normalisation (fanRef removes the size dependence of the rate; does a higher lr now pay?)
J.push(job('y48_cx4_fanRef_lr', { q: 'I78', pri: 0.95, seeds: K(0, 16), title: 'cortex 4x + fanRef 450/R126 at cortex lr 0.3 / 0.5, growths 0-15, 5 tasks', note: 'vs y43 (lr 0.2)',
  arms: [['pl.lr@cortex=0.3', 'lr0.3'], ['pl.lr@cortex=0.5', 'lr0.5']].map(([x, l]) => ({ variant: v(C4, R, x), tasks: FIVE, size: '4xC', lbl: 'cx4 fanRef ' + l })) }));
// 8. 2x cortex + normalisation (size curve)
J.push(job('y49_cx2_fanRef', { q: 'I78', pri: 0.94, seeds: K(0, 16), title: 'cortex 2x (sizeF 2) + fanRef 450/R126 lr 0.2 and cortex 2x lr 0.2, growths 0-15, all 7 tasks', note: 'size curve 1x / 2x / 4x / 8x cortex under fanRef',
  arms: [{ variant: v('sc.sizeF@cortex=2', R, L2), tasks: ALL7, size: '2xS', lbl: 'cx2 fanRef' }, { variant: v('sc.sizeF@cortex=2', L2), tasks: ALL7, size: '2xS', lbl: 'cx2' }] }));
// 9. long lives (the large-run question): fresh growths k 1400-1407 paired with y27 (1x) / y36 (4xS) / y40 (2xS)
for (const [id, s] of [['y50a_cx4_fanRef_long', K(1400, 4)], ['y50b_cx4_fanRef_long', K(1404, 4)]])
  J.push(job(id, { q: 'I73', pri: 0.93, seeds: s, title: `cortex 4x + fanRef 450/R126 lr 0.2 at book100k / book300k / fables12000 (growths k ${s[0]}-${s[3]})`, note: 'paired with y27 (1x), y36 (4xS), y40 (2xS): does the normalised big cortex keep improving with length?',
    arms: [{ variant: v(C4, R, L2), tasks: ['b100', 'b300', 'f12'], size: '4xC', lbl: 'cx4 fanRef' }] }));
// 10. statistical power: growths 16-31 (refs y37: 1x lr 0.1, cortex 4x lr 0.1)
for (const [id, s] of [['y51a_cx4_fanRef_g16', K(16, 8)], ['y51b_cx4_fanRef_g24', K(24, 8)]])
  J.push(job(id, { q: 'I87', pri: 0.9, seeds: s, title: `cortex 4x + fanRef 450/R126 lr 0.2 and 1x lr 0.2 (growths ${s[0]}-${s[7]}), all 7 tasks`, note: 'with y37 (same growths): 32 growths per arm',
    arms: [{ variant: v(C4, R, L2), tasks: ALL7, size: '4xC', lbl: 'cx4 fanRef' }, { variant: v(L2), tasks: ALL7, size: '1x', lbl: '1x lr0.2' }] }));
// 11. 8x cortex long (book100k) and generation after 30k
J.push(job('y52_cx8_long', { q: 'I80', pri: 0.85, seeds: K(1400, 8), title: 'cortex 8x divRep 2 + fanRef 450/R126 lr 0.2 at book100k (growths k 1400-1407)', note: 'paired with y27 / y36 / y50',
  arms: [{ variant: v(C8, R, L2), tasks: ['b100'], size: '8xC', lbl: 'cx8 fanRef' }] }));
J.push(job('y53_cx4_fanRef_gen', { q: 'I72', pri: 0.84, seeds: K(0, 16), title: 'cortex 4x + fanRef 450/R126 lr 0.2: generation after book30k (greedy / T0.7), growths 0-15', note: 'refs y18 (4xS gen), y31 (1x gen)',
  arms: [{ variant: v(C4, R, L2), tasks: ['g30', 'g30t7'], size: '4xC', lbl: 'cx4 fanRef' }] }));
// 12. lower tier (keeps both workers busy >= ~18 h; each answers a stated question)
J.push(job('y54_cx4_fanRef_book300k_g1408', { q: 'I73', pri: 0.82, seeds: K(1408, 8), title: 'cortex 4x + fanRef 450/R126 lr 0.2 at book300k (growths k 1408-1415)', note: 'with y50: 16 long lives of the normalised big cortex',
  arms: [{ variant: v(C4, R, L2), tasks: ['b300'], size: '4xC', lbl: 'cx4 fanRef' }] }));
J.push(job('y55_4xS_fanRef_long', { q: 'I73', pri: 0.8, seeds: K(1400, 8), title: 'plain 4xS + fanRef 450/R126 lr 0.2 at book100k / book300k (growths k 1400-1407)', note: 'paired with y36 (plain 4xS lr 0.1, same growths)',
  arms: [{ variant: v(S4, R, L2), tasks: ['b100', 'b300'], size: '4xS', lbl: '4xS fanRef' }] }));
J.push(job('y56_cx8_book300k', { q: 'I80', pri: 0.78, seeds: K(1400, 8), title: 'cortex 8x divRep 2 + fanRef 450/R126 lr 0.2 at book300k (growths k 1400-1407)', note: 'with y52 (100k): the 8x length curve',
  arms: [{ variant: v(C8, R, L2), tasks: ['b300'], size: '8xC', lbl: 'cx8 fanRef' }] }));
J.push(job('y57_4xS_fanRef300', { q: 'I87', pri: 0.88, seeds: K(0, 16), title: 'plain 4xS + fanRef 300/R60 lr 0.2, growths 0-15, all 7 tasks', note: 'stronger normalisation for the whole-brain size (vs y45 fanRef 450/R126)',
  arms: [{ variant: v(S4, FR(300, 60), L2), tasks: ALL7, size: '4xS', lbl: '4xS fanRef300/R60' }] }));
J.push(job('y58_cx4_fanRef_rule', { q: 'I78', pri: 0.86, seeds: K(0, 16), title: 'cortex 4x + fanRef 450/R126 lr 0.2 + plateau 6 / metaCap 400 / teachThr 15, growths 0-15, 5 tasks', note: 'rule x size under normalisation (y35 without it)',
  arms: [['pl.plateau@cortex=6', 'plateau 6'], ['pl.metaCap@cortex=400', 'metaCap 400'], ['pl.teachThr@cortex=15', 'teachThr 15']].map(([x, l]) => ({ variant: v(C4, R, L2, x), tasks: FIVE, size: '4xC', lbl: 'cx4 fanRef ' + l })) }));
J.push(job('y59_ctx4_norm', { q: 'I87', pri: 0.87, seeds: K(0, 16), title: 'context 4x (sizeF@context 4) + fanRef 450/R126 lr 0.2, with and without sizeNorm 4, growths 0-15, all 7 tasks', note: 'the context-side order3 loss (fanRef cannot touch it: predictor plastic fan-in is unchanged by context size); refs y10 context only',
  arms: [{ variant: v('sc.sizeF@context=4', R, L2), tasks: ALL7, size: '4xC', lbl: 'ctx4 fanRef' }, { variant: v('sc.sizeF@context=4,sc.sizeNorm@context=4', R, L2), tasks: ALL7, size: '4xC', lbl: 'ctx4 sizeNorm fanRef' }] }));
J.push(job('y60_1x_fanRef_long', { q: 'I73', pri: 0.83, seeds: K(1400, 8), title: '1x (v39) + fanRef 450/R126 at book100k / book300k (growths k 1400-1407)', note: 'paired with y27 (1x v39 long)',
  arms: [{ variant: v(R, L2), tasks: ['b100', 'b300'], size: '1x', lbl: '1x fanRef' }] }));
J.push(job('y61_cx8_divRep_g8', { q: 'I80', pri: 0.89, seeds: K(8, 8), title: 'y46 on growths 8-15 (cortex 8x / 4x divRep 2 + fanRef 450/R126 lr 0.2), all 7 tasks', note: 'with y46: 16 growths',
  arms: [{ variant: v(C8, R, L2), tasks: ALL7, size: '8xC', lbl: 'cx8 divRep2 fanRef' }, { variant: v(C4, 'sc.divRep@cortex=2', R, L2), tasks: ALL7, size: '4xCd', lbl: 'cx4 divRep2 fanRef' }] }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h`).join('\n'));
console.log('total slot-h', J.reduce((a, j) => a + j.slotHours, 0).toFixed(1), ' est wall h (6 slots)', J.reduce((a, j) => a + j.estHours, 0).toFixed(1));
