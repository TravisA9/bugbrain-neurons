// R70: shared-queue jobs y23-y40 (node run/r70_jobs.js <outdir>). Written while v38 is the default and v39 (cortex lr 0.2) is being adopted:
// EVERY arm sets pl.lr@cortex (0.1 = v38 brain, 0.2 = v39 brain) and P.fastEngine=1 explicitly, so no job changes meaning when the default flips.
// `requires` = the R69 file list (present on the workers' current code), so these jobs are claimable at once.
// Seeds: k 0-15 screening growths (paired with y09 / y10 / y11 / y16 / y21 and older refs); k 1200-1215 fresh set 1 (y08 / y15 / y22);
// k 1300-1315 FRESH set 2 (never used before R70); k 1400-1415 fresh set 3 (long lives).
// Time model: slot-seconds per growth as in r69_jobs.js (measured, fast engine); worker R69 wall was ~0.6-0.7x these estimates.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/envs/book.js', 'run/r69_jobs.js'];
const out = process.argv[2] || 'jobs_r70'; fs.mkdirSync(out, { recursive: true });
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
// 1. v39 (lr 0.2) vs v38 (lr 0.1) on a SECOND fresh seed set: 32 fresh growths in total with y08, and the 1x reference for everything on k 1300+
for (const [id, s] of [['y23a_v39_fresh2', K(1300, 8)], ['y23b_v39_fresh2', K(1308, 8)]])
  J.push(job(id, { q: 'I77', pri: 0.99, seeds: s, G: 2, title: `v39 (cortex lr 0.2) vs v38 (lr 0.1), fresh growths k ${s[0]}-${s[7]}, all 7 tasks`, note: 'with y08: 32 fresh growths; checks the v39 adoption (order3 drift) on never-used seeds',
    arms: [{ variant: v(L1), tasks: ALL7, size: '1x', lbl: 'v38 lr 0.1' }, { variant: v(L2), tasks: ALL7, size: '1x', lbl: 'v39 lr 0.2' }] }));
// 2. the rate optimum at 1x, fine grain (y09: 0.3 wins book but order3 -0.015, t -2.5)
J.push(job('y24_v39_lr_fine', { q: 'I77', pri: 0.985, seeds: K(0, 16), G: 2, title: 'cortex lr 0.25 vs 0.2 (and 0.2 base, fast engine) on the 5-task screen, growths 0-15', note: 'paired vs the lr 0.2 arm here and y09 (base / 0.3)',
  arms: [{ variant: v(L2), tasks: FIVE, size: '1x', lbl: 'lr 0.2' }, { variant: v('pl.lr@cortex=0.25'), tasks: FIVE, size: '1x', lbl: 'lr 0.25' }] }));
// 3. teacher-rule knobs at the new rate (I77): toward the 0.40 readout ceiling without the order3 cost
const RK = [['pl.teachThr@cortex=15', 'teachThr 15'], ['pl.teachThr@cortex=25', 'teachThr 25'], ['pl.plateau@cortex=5', 'plateau 5'], ['pl.metaCap@cortex=400', 'metaCap 400'],
  ['pl.trustPow@cortex=0.5', 'trustPow 0.5'], ['pl.preNorm@cortex=55', 'preNorm 55']];
J.push(job('y25_v39_rule_knobs', { q: 'I77', pri: 0.98, seeds: K(0, 16), G: 2, title: 'v39 (lr 0.2) + teacher knobs (teachThr 15 / 25, plateau 5, metaCap 400, trustPow 0.5, preNorm 55), 5-task screen, growths 0-15',
  note: 'paired vs y24 lr 0.2 arm (same growths, fast engine); screen only: winners go to fresh seeds', arms: RK.map(([x, l]) => ({ variant: v(L2, x), tasks: FIVE, size: '1x', lbl: 'v39 + ' + l })) }));
// 4. life length under v39 at 1x (y06: v37 100k = 30k): 100k on 16 growths, 300k and 1M on 8 fresh growths (does length ever pay at 1x?)
J.push(job('y26_v39_book100k', { q: 'I73', pri: 0.97, seeds: K(0, 16), title: 'v39 1x at book100k (growths 0-15, 1-growth runs)', note: 'vs y06 (v37 100k) and y24 (v39 10k / 30k)', arms: [{ variant: v(L2), tasks: ['b100'], size: '1x', lbl: 'v39' }] }));
J.push(job('y27_v39_long_1x', { q: 'I73', pri: 0.94, seeds: K(1400, 8), title: 'v39 1x long lives on fresh growths k 1400-1407: book30k, 100k, 300k, 1M (same growths)', note: 'the 1x length curve to 1M symbols: flat (saturated) or slow gain?',
  arms: [{ variant: v(L2), tasks: ['b30', 'b100', 'b300', 'b1m'], size: '1x', lbl: 'v39' }] }));
// 5. rate x size: does the best cortex rate fall with size? (y11: 4xS lr 0.2 worse on book -0.004 / -0.006 and text -0.006; lr 0.05 = 0.1)
for (const [id, s] of [['y28a_2xS_rate', K(0, 8)], ['y28b_2xS_rate', K(8, 8)]])
  J.push(job(id, { q: 'I78', pri: 0.965, seeds: s, title: `2xS x cortex lr 0.05 / 0.1 / 0.2, 5 tasks, growths ${s[0]}-${s[7]}`, note: 'rate optimum vs size (1x: 0.2-0.3, 4xS: <= 0.1)',
    arms: [['pl.lr@cortex=0.05', 'lr 0.05'], [L1, 'lr 0.1'], [L2, 'lr 0.2']].map(([x, l]) => ({ variant: v(S2, x), tasks: FIVE, size: '2xS', lbl: '2xS ' + l })) }));
for (const [id, s] of [['y29a_4xS_rate', K(0, 8)], ['y29b_4xS_rate', K(8, 8)]])
  J.push(job(id, { q: 'I78', pri: 0.955, seeds: s, title: `4xS x cortex lr 0.07 / 0.14, 5 tasks, growths ${s[0]}-${s[7]}`, note: 'vs 4xS lr 0.1 (y10 all-regions arm, y11 base) and lr 0.2 / 0.05 (y11): the 4xS rate curve',
    arms: [['pl.lr@cortex=0.07', 'lr 0.07'], ['pl.lr@cortex=0.14', 'lr 0.14']].map(([x, l]) => ({ variant: v(S4, x), tasks: FIVE, size: '4xS', lbl: '4xS ' + l })) }));
// 6. order3 memory depth x size (I87): is the scaled-brain loss a context-length problem (worse at K 16) or a capacity / noise one (all K)?
J.push(job('y30_order3_K_size', { q: 'I87', pri: 0.96, seeds: K(0, 16), title: 'order3 with K 4 / 16 at 1x and 4xS (lr 0.1), growths 0-15', note: 'K 8 refs: y09 base (1x), y10 (4xS)',
  arms: [{ variant: v(L1), tasks: ['o3k4', 'o3k16'], size: '1x', lbl: '1x' }, { variant: v(S4, L1), tasks: ['o3k4', 'o3k16'], size: '4xS', lbl: '4xS' }] }));
// 7. generation at v39 (1x) with the confidence gate (z06 = v37 1x: gate margin 0.2 word 0.70, gate 0.4 + T0.7 word 0.74)
J.push(job('y31_v39_gen_1x', { q: 'I72', pri: 0.95, seeds: K(0, 16), title: 'v39 1x generation after book30k (greedy, T1, gate margin 0.2, gate 0.4 + T0.7) and after book100k (gate margin 0.2, gate 0.4 + T0.7), growths 0-15',
  note: 'vs z06 (v37 1x 30k) and x15 (v36 100k): word rate, distinct 4-grams, trigram bits', arms: [
    { variant: v(L2), tasks: ['g30', 'g30t1'], size: '1x', lbl: 'v39' }, { variant: v(L2, 'pl.outGate=0.2,pl.outGateMode=1'), tasks: ['g30', 'g100'], size: '1x', lbl: 'v39 gate margin 0.2' },
    { variant: v(L2, 'pl.outGate=0.4'), tasks: ['g30t7', 'g100t7'], size: '1x', lbl: 'v39 gate 0.4' }] }));
J.push(job('y32_4xS_gen100k', { q: 'I72', pri: 0.9, seeds: K(0, 8), title: '4xS (lr 0.1) generation after book100k: gate margin 0.2 and gate 0.4 + T0.7, growths 0-7', note: 'vs y18 (4xS 30k) and x14 (v36 4xS): does a longer 4xS life write better?', arms: [
  { variant: v(S4, L1, 'pl.outGate=0.2,pl.outGateMode=1'), tasks: ['g100'], size: '4xS', lbl: '4xS gate margin 0.2' }, { variant: v(S4, L1, 'pl.outGate=0.4'), tasks: ['g100t7'], size: '4xS', lbl: '4xS gate 0.4' }] }));
// 8. 4xS region dissection on long text / long-gap memory (y10 has 10k / 4000 only): does scaling the context regions add anything once the life is long?
for (const [id, s] of [['y33a_4xS_regions_long', K(0, 8)], ['y33b_4xS_regions_long', K(8, 8)]])
  J.push(job(id, { q: 'I87', pri: 0.92, seeds: s, title: `4xS cortex-only / context-only / all on book30k and fables8000, growths ${s[0]}-${s[7]} (lr 0.1)`, note: 'refs: y11 4xS base book30k, y17 4xS fables8000, 1x y24 / y17',
    arms: [{ variant: v(at(S4, 'cortex'), L1), tasks: ['b30', 'f8'], size: '4xS', lbl: '4xS cortex only' }, { variant: v(at(S4, 'context'), L1), tasks: ['b30', 'f8'], size: '4xS', lbl: '4xS context only' }] }));
// 9. 2xS on fresh seeds (cheap size, all 7 tasks; pairs with y08 / y15 on k 1200-1215)
J.push(job('y34_2xS_fresh', { q: 'I78', pri: 0.9, seeds: K(1200, 16), title: '2xS (lr 0.1) on fresh growths k 1200-1215, all 7 tasks', note: 'size curve on fresh seeds: 1x (y08 base), 2xS (here), 4xS (y15)', arms: [{ variant: v(S2, L1), tasks: ALL7, size: '2xS', lbl: '2xS' }] }));
// 10. 4xS rule knobs (rule x size, I78): consolidation behaves differently at size? (y20 = plateau 6 / metaN 80)
for (const [id, s] of [['y35a_4xS_rule', K(0, 8)], ['y35b_4xS_rule', K(8, 8)]])
  J.push(job(id, { q: 'I78', pri: 0.88, seeds: s, title: `4xS (lr 0.1) + teachThr 15 / metaCap 400, 5 tasks, growths ${s[0]}-${s[7]}`, note: 'vs the 4xS base (y10 / y11); teachThr / metaCap are the two y25 knobs most likely to interact with size',
    arms: [['pl.teachThr@cortex=15', 'teachThr 15'], ['pl.metaCap@cortex=400', 'metaCap 400']].map(([x, l]) => ({ variant: v(S4, L1, x), tasks: FIVE, size: '4xS', lbl: '4xS ' + l })) }));
// 11. the large-run question directly: does 4xS improve between 100k and 300k? (x17: v36 4xS 100k = 30k) fresh growths, 1-growth runs
J.push(job('y36_4xS_book300k', { q: 'I73', pri: 0.86, seeds: K(1400, 8), title: '4xS (lr 0.1) at book100k and book300k on fresh growths k 1400-1407', note: 'paired with y27 (1x, same growths); decides whether the staged 4xS 100k -> 300k -> 1M run can pay',
  arms: [{ variant: v(S4, L1), tasks: ['b100', 'b300'], size: '4xS', lbl: '4xS' }] }));
// 12. statistical power for the size dissection: y10 on growths 16-31 (4xS all / cortex only / context only, 6 tasks)
for (const [id, s] of [['y37a_4xS_dissect_g16', K(16, 8)], ['y37b_4xS_dissect_g24', K(24, 8)]])
  J.push(job(id, { q: 'I87', pri: 0.8, seeds: s, title: `4xS dissection repeat (growths ${s[0]}-${s[7]}): all / cortex only / context only + 1x, order3, text1000, fables4000, book10k, seqchoice x2 (lr 0.1)`,
    note: 'with y10: 32 growths per arm for the code-fix decision', arms: [
      { variant: v(S4, L1), tasks: ['o3', 't1', 'f4', 'b10', 'so2', 'scy'], size: '4xS', lbl: '4xS all' }, { variant: v(at(S4, 'cortex'), L1), tasks: ['o3', 't1', 'f4', 'b10', 'so2', 'scy'], size: '4xS', lbl: '4xS cortex only' },
      { variant: v(at(S4, 'context'), L1), tasks: ['o3', 't1', 'f4', 'b10', 'so2', 'scy'], size: '4xS', lbl: '4xS context only' }, { variant: v(L1), tasks: ['o3', 't1', 'f4', 'b10', 'so2', 'scy'], size: '1x', lbl: '1x' }] }));
// 13. lower tier (keeps the workers busy until the next review; every one answers a stated question)
J.push(job('y38_v39_rule_knobs_g16', { q: 'I77', pri: 0.75, seeds: K(16, 16), G: 2, title: 'y25 repeated on growths 16-31 (v39 + teacher knobs, plus the lr 0.2 base arm)', note: 'with y25: 32 growths per knob',
  arms: [{ variant: v(L2), tasks: FIVE, size: '1x', lbl: 'lr 0.2' }].concat(RK.map(([x, l]) => ({ variant: v(L2, x), tasks: FIVE, size: '1x', lbl: 'v39 + ' + l }))) }));
for (const [id, s] of [['y39a_3xS_fresh', K(1200, 8)], ['y39b_3xS_fresh', K(1208, 8)]])
  J.push(job(id, { q: 'I78', pri: 0.78, seeds: s, title: `3xS (lr 0.1) on fresh growths k ${s[0]}-${s[7]}, all 7 tasks`, note: 'fresh-seed size curve 1x / 2xS / 3xS / 4xS (y08 / y34 / here / y15)', arms: [{ variant: v(S3, L1), tasks: ALL7, size: '3xS', lbl: '3xS' }] }));
J.push(job('y40_2xS_long', { q: 'I73', pri: 0.82, seeds: K(1400, 8), title: '2xS (lr 0.1) at book100k and book300k on fresh growths k 1400-1407', note: 'size x length curve with y27 (1x) and y36 (4xS), same growths', arms: [{ variant: v(S2, L1), tasks: ['b100', 'b300'], size: '2xS', lbl: '2xS' }] }));
J.push(job('y41_4xS_rate_book100k', { q: 'I73', pri: 0.7, seeds: K(0, 8), title: '4xS at book100k with cortex lr 0.07 / 0.14 (growths 0-7)', note: 'rate x length at size: vs x17 (v36 4xS 100k) and y19 (4xS lr 0.2 100k)',
  arms: [['pl.lr@cortex=0.07', 'lr 0.07'], ['pl.lr@cortex=0.14', 'lr 0.14']].map(([x, l]) => ({ variant: v(S4, x), tasks: ['b100'], size: '4xS', lbl: '4xS ' + l })) }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h`).join('\n'));
console.log('total slot-h', J.reduce((a, j) => a + j.slotHours, 0).toFixed(1), ' est wall h (6 slots)', J.reduce((a, j) => a + j.estHours, 0).toFixed(1));
