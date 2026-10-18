// R63: shared-queue jobs x00-x19 (node run/r63_jobs.js <outdir>). 16 held-out growths per arm in 4-growth runs (g0 0/4/8/12, the same
// growth/arena seeds as w13 and the box R62 eval16c, so every arm is paired growth by growth with the v36 reference; run/r62_cmp.js).
// R63 finding behind x01-x03 / x16-x17: sc.grid alone does not scale a brain. coneSpeed (growth-cone steps per developmental step) and
// axonLen (axon length in grid steps) are in grid units, so on a finer grid the axons cover less of the sheet: book 1.5k (1 growth, box)
// grid 60 3.33, 85 2.67, 100 2.27, 110 0, 120 0 (silent outputs: w06 / w15 / w16 were all 0). Scaled with the grid
// (85: coneSpeed 4, axonLen 57; 120: coneSpeed 6, axonLen 80) the same brains score 3.20 and 3.43. Size is re-tested with scaled wiring.
// For seq tasks a global pl.* override equals a cortex-only one (pl.lr / preNorm / plateau / trustPow, @cortex vs global: identical
// runs), so these jobs use plain variants and run on any v36 checkout (no R63 code needed).
const fs = require('fs'), path = require('path'), out = process.argv[2] || 'jobs_r63'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
// fables / order3 / text: exactly the box R62 eval16c task strings (the v36 reference for those tasks; r62_cmp ignores readIn in the key)
const FAB4 = JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: 4000, readIn: 0.01 } }), FAB2 = JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: 2000, readIn: 0.01 } });
const ORD3 = JSON.stringify({ env: 'seq', params: { source: 'order3', K: 8, readIn: 0.01 } }), TXT = JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const MIN = { b10: 1.5, b30: 4.5, b100: 15, f4: 0.8, f2: 0.5, o3: 0.5, t1: 0.3, sc: 0.5 };   // r62 scale (est-minutes per growth at 1x); real: linux-pc ~3.7x faster, tacobell ~2.75x
const S2 = 'sc.grid=85,sc.maxCells=6800,sc.coneSpeed=4,sc.axonLen=57', S4 = 'sc.grid=120,sc.maxCells=13600,sc.coneSpeed=6,sc.axonLen=80';
const REQ = ['run/r42.js', 'js/envs/book.js', 'run/r62_cmp.js'];
function job(id, o) {   // o: {title, q, pri, note, arms: [{plan, variant, task, n, lbl, cost}], g0s, script}
  const runs = [], g0s = o.g0s || [0, 4, 8, 12]; let min = 0;
  for (const a of o.arms) for (const g0 of (a.g0s || g0s)) { runs.push({ script: o.script || 'run/r42.js', args: [a.plan || 'deepURSx3', a.task, '4', a.variant || 'base', String(g0), '--force'], label: `${a.lbl} g${g0} n4`, env: { BB_OUT: `results/phone/${id}.jsonl` } }); min += 4 * (a.cost || 1) * (MIN[a.n] || 2); }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(min / 60).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
// the 5-task adoption screen: book30k, book10k, fables4000, order3, text1000 (16 growths each), so a winner is adoption-ready at once
const screen = (variant, lbl) => [{ variant, task: book(30000), n: 'b30', lbl: lbl + ' book30k' }, { variant, task: book(10000), n: 'b10', lbl: lbl + ' book10k' },
  { variant, task: FAB4, n: 'f4', lbl: lbl + ' fables4000' }, { variant, task: ORD3, n: 'o3', lbl: lbl + ' order3' }, { variant, task: TXT, n: 't1', lbl: lbl + ' text1000' }];
const J = [];
// --- queue-native v36 reference for the non-book tasks (box eval16c is the same seeds; this checks it on the workers, cheap) ---
J.push(job('x00_v36_ref_small', { q: 'I77', pri: 0.975, title: 'v36 reference on fables4000, order3, text1000 (worker copy of box eval16c), growths 0-15', note: 'must equal box eval16c (0.330 / 0.954 / 0.753); the yardstick for the x03-x11 screens', arms: [{ task: FAB4, n: 'f4', lbl: 'v36 fables4000' }, { task: ORD3, n: 'o3', lbl: 'v36 order3' }, { task: TXT, n: 't1', lbl: 'v36 text1000' }] }));
// --- scaling with wiring scaled to the grid (I73) ---
for (const [s, g0s] of [['a', [0, 4]], ['b', [8, 12]]]) J.push(job('x01' + s + '_size4xS_book', { q: 'I73', pri: 0.97, g0s, title: `Size 4x with scaled wiring (grid 120, maxCells 13600, coneSpeed 6, axonLen 80) under v36: book 10k + 30k, growths ${g0s[0]}-${g0s[1] + 3}`, note: 'the first valid 4x point (w15/w16 were silent: wiring not scaled); vs w13 0.316 / 0.313; pays if >= +0.01', arms: [{ variant: S4, task: book(10000), n: 'b10', cost: 4, lbl: 'v36 4xS book10k' }, { variant: S4, task: book(30000), n: 'b30', cost: 4, lbl: 'v36 4xS book30k' }] }));
J.push(job('x02_size2xS_book', { q: 'I73', pri: 0.965, title: 'Size 2x with scaled wiring (grid 85, maxCells 6800, coneSpeed 4, axonLen 57) under v36: book 10k + 30k, growths 0-15', note: 'w14 (unscaled 2x) was -0.020 / -0.014 vs w13; is that the wiring?', arms: [{ variant: S2, task: book(10000), n: 'b10', cost: 2, lbl: 'v36 2xS book10k' }, { variant: S2, task: book(30000), n: 'b30', cost: 2, lbl: 'v36 2xS book30k' }] }));
// --- learning rule of the taught (cortex) cells toward the 0.40 readout ceiling (I77); every arm on the 5-task screen ---
const RULE = [
  ['x03_rule_trustPow', 0.962, 'per-cell trust weighting trustPow 4 / 0 (v36 2): reliable cells dominate the summed prediction (also a space-bias lever)', ['pl.trustPow=4', 'pl.trustPow=0']],
  ['x04_rule_lr', 0.96, 'teacher-rule rate lr 0.1 / 0.025 (v36 0.05)', ['pl.lr=0.1', 'pl.lr=0.025']],
  ['x05_rule_metaCap', 0.958, 'consolidation cap metaCap 100 / 50 (v36 200; metaN 0 gave book 0.34 but order3 0.87 in R62)', ['pl.metaCap=100', 'pl.metaCap=50']],
  ['x06_rule_preNorm', 0.955, 'presynaptic weight budget preNorm 60 / 30 (v36 45)', ['pl.preNorm=60', 'pl.preNorm=30']],
  ['x07_rule_conf_trustMax', 0.952, 'sharpness weighting confPow 2 (ref 6, max 4) / trustMax 8 (v36 4)', ['pl.confPow=2,pl.confRef=6,pl.confMax=4', 'pl.trustMax=8']],
  ['x08_rule_predErrSmall', 0.95, 'error-driven part back in small doses under the cap: predErr 0.03 / 0.01 (peMode 16, peFix 0.01; v35 0.3)', ['pl.predErr=0.03,pl.peMode=16,pl.peFix=0.01', 'pl.predErr=0.01,pl.peMode=16,pl.peFix=0.01']],
  ['x09_space_rcvRate', 0.945, 'space bias: very weak output homeostasis with a realistic target rate, rcvHomeo 0.005 rcvRate 0.1 / rcvHomeo 0.002 (w21: 0.02 / 0.05 at rate 0.02 collapsed to 0.12)', ['pl.rcvHomeo=0.005,pl.rcvRate=0.1', 'pl.rcvHomeo=0.002']],
  ['x10_rule_plateau', 0.94, 'potentiation window plateau 2 / 6 (v36 4)', ['pl.plateau=2', 'pl.plateau=6']],
  ['x11_rule_preLag', 0.935, 'credited context age preLag 4 / 12 (v36 8)', ['pl.preLag=4', 'pl.preLag=12']] ];
for (const [id, pri, what, vs] of RULE) J.push(job(id, { q: id.includes('space') ? 'I75' : 'I77', pri, title: 'Learning rule (5-task screen, 16 growths): ' + what, note: 'adoption-ready if book30k and book10k win and no task is worse (t < -2) vs w13 / box eval16c', arms: vs.flatMap(v => screen(v, 'v36 ' + v.split(',')[0].replace('pl.', ''))) }));
J.push(job('x18_rule_metaN', { q: 'I77', pri: 0.932, title: 'Learning rule (5-task screen, 16 growths): consolidation strength metaN 20 / 80 (v36 40, cap 200; metaN 0: book 0.34, order3 0.87 in R62)', note: 'adoption-ready if book30k and book10k win and no task is worse (t < -2) vs w13 / box eval16c', arms: ['pl.metaN=20', 'pl.metaN=80'].flatMap(v => screen(v, 'v36 ' + v.replace('pl.', ''))) }));
// scaled sizes on the other gate tasks (needed before any size adoption)
J.push(job('x19_sizeS_gate_tasks', { q: 'I78', pri: 0.905, title: 'Size 2xS / 4xS (scaled wiring) on fables4000, order3, text1000, growths 0-15', note: 'a size default needs no task worse; vs box eval16c / x00', arms: [[S2, '2xS', 2], [S4, '4xS', 4]].flatMap(([v, l, c]) => [{ variant: v, task: FAB4, n: 'f4', cost: c, lbl: `v36 ${l} fables4000` }, { variant: v, task: ORD3, n: 'o3', cost: c, lbl: `v36 ${l} order3` }, { variant: v, task: TXT, n: 't1', cost: c, lbl: `v36 ${l} text1000` }]) }));
// --- safety and confirmations ---
const SCO2 = JSON.stringify({ env: 'seqchoice', params: { source: 'order2', nSyms: 1000 } });
J.push(job('x12_seqchoice_order2_dissect', { q: 'Q31', pri: 0.93, title: 'seqchoice order2 (w26: v36 -0.055 vs v35, t -2.5, 6/10): 16 more growths of v36 and v35, and which v36 change does it (v36 + metaCap 0; v36 + v35 predErr)', note: 'decides whether v36 really hurts reward-coupled order2 and whether metaCap or predErr 0 is the cause', arms: [
  { task: SCO2, n: 'sc', lbl: 'v36 sc-order2', g0s: [16, 20, 24, 28] }, { plan: 'deepURSx3v35', task: SCO2, n: 'sc', lbl: 'v35 sc-order2', g0s: [16, 20, 24, 28] },
  { variant: 'pl.metaCap=0', task: SCO2, n: 'sc', lbl: 'v36 metaCap0 sc-order2' }, { variant: 'pl.predErr=0.3,pl.peMode=16,pl.peFix=0.01', task: SCO2, n: 'sc', lbl: 'v36 +predErr0.3 sc-order2' }] }));
J.push(job('x13_confirm_mixLr005', { q: 'I76', pri: 0.92, title: 'Confirm mixLr 0.005 (w23: book30k +0.003, 10/4, t 2.3; fables4000 -0.001): book10k, order3, text1000, fables2000, growths 0-15', note: 'tiny effect; adopt only if no task worse', arms: [{ variant: 'pl.mixLr=0.005', task: book(10000), n: 'b10', lbl: 'v36 mixLr0.005 book10k' }, { variant: 'pl.mixLr=0.005', task: ORD3, n: 'o3', lbl: 'v36 mixLr0.005 order3' }, { variant: 'pl.mixLr=0.005', task: TXT, n: 't1', lbl: 'v36 mixLr0.005 text1000' }, { variant: 'pl.mixLr=0.005', task: FAB2, n: 'f2', lbl: 'v36 mixLr0.005 fables2000' }] }));
// --- generation (I72) ---
J.push(job('x14_gen_4xS_book30k', { q: 'I72', pri: 0.91, script: 'run/gen.js', g0s: [0], title: 'Generation from the scaled 4x brain after a 30k life (genTemp 1 and 0.7), growths 0-3', note: 'vs w25 (1x: word rate 0.57, triBits 6.1, top char 0.41)', arms: [1, 0.7].map(t => ({ variant: S4, task: book(30000, { genSyms: 500, genTemp: t }), n: 'b30', cost: 4, lbl: `v36 4xS gen T${t} book30k` })) }));
J.push(job('x15_gen_book100k', { q: 'I72', pri: 0.9, script: 'run/gen.js', g0s: [0], title: 'Generation after a 100k life under v36 (genTemp 1 and 0.7), growths 0-3', note: 'does a longer life make samples more word-like? vs w25 (30k)', arms: [1, 0.7].map(t => ({ task: book(100000, { genSyms: 500, genTemp: t }), n: 'b100', lbl: `v36 gen T${t} book100k` })) }));
// --- size x length (long fillers) ---
for (const [s, g0s] of [['a', [0, 4]], ['b', [8, 12]]]) J.push(job('x16' + s + '_size2xS_book100k', { q: 'I73', pri: 0.89, g0s, title: `Size 2x (scaled wiring) x 100k life: growths ${g0s[0]}-${g0s[1] + 3}`, note: 'vs w18 (1x 100k 0.314): does the bigger brain pull ahead with more data?', arms: [{ variant: S2, task: book(100000), n: 'b100', cost: 2, lbl: 'v36 2xS book100k' }] }));
for (const [s, g0s] of [['a', [0, 4]], ['b', [8, 12]]]) J.push(job('x17' + s + '_size4xS_book100k', { q: 'I73', pri: 0.88, g0s, title: `Size 4x (scaled wiring) x 100k life: growths ${g0s[0]}-${g0s[1] + 3}`, note: 'vs w18 (1x 100k 0.314) and x16', arms: [{ variant: S4, task: book(100000), n: 'b100', cost: 4, lbl: 'v36 4xS book100k' }] }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} est ${j.estHours} h`).join('\n'));
console.log('total est', J.reduce((a, j) => a + j.estHours, 0).toFixed(1), 'h');
