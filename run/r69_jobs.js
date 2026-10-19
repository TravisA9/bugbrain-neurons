// R69: shared-queue jobs y08-y20 + z10b (node run/r69_jobs.js <outdir>). Defaults: v38 (DEFAULTS_VERSION 31) = v37 brains + fast engine
// (params.fastEngine 1). Every arm sets P.fastEngine explicitly (=1 here, =0 for the exact arm of z10b), so no job changes meaning if the
// engine default changes again. `requires` lists this file, so a worker on pre-v38 code skips these jobs until it self-updates.
// Seeds: k 0-15 = the screening growths (paired with x04 / y02-y07 / y03 / y05), k 1200-1215 = FRESH growth seeds (never used before;
// z01-z03 used 1000-1015, z08-z10 1100-1115), used for the adoption confirmation y08 and the 4xS replication y15.
// Time model: measured worker slot-seconds per growth (contended wallMs of R64-R66 runs, fast engine), linux-pc ~8 slots, tacobell ~4.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/envs/book.js', 'run/r69_jobs.js'];
const out = process.argv[2] || 'jobs_r69'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
const FAB = n => JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: n, readIn: 0.01 } });
const ORD3 = JSON.stringify({ env: 'seq', params: { source: 'order3', K: 8, readIn: 0.01 } }), TXT = JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
const T = { b10: [book(10000), 'book10k'], b30: [book(30000), 'book30k'], b100: [book(100000), 'book100k'], f4: [FAB(4000), 'fables4000'], f8: [FAB(8000), 'fables8000'], f12: [FAB(12000), 'fables12000'],
  o3: [ORD3, 'order3'], t1: [TXT, 'text1000'], so2: [SC('order2'), 'seqchoice order2'], scy: [SC('cycle'), 'seqchoice cycle'] };
// slot-seconds per growth, fast engine (1x: z08; 4xS: z09 / z10; 2xS: y05 exact / ~2 on book; exact 4xS: z10 / y03)
const SEC = { '1x': { b10: 35, b30: 81, b100: 270, f4: 20, f8: 40, f12: 60, o3: 8, t1: 11, so2: 11, scy: 9 },
  '2xS': { b10: 75, b30: 190, f4: 40, o3: 25, t1: 33, so2: 45, scy: 40 },
  '4xS': { b10: 260, b30: 650, b100: 2000, f4: 136, f8: 272, f12: 408, o3: 88, t1: 95, so2: 175, scy: 152 },
  '3xS': { b10: 170, b30: 420, f4: 90, o3: 55, t1: 60, so2: 110, scy: 100 },
  '4xSexact': { b10: 400, b30: 1022, f4: 257, o3: 73, t1: 105, so2: 183, scy: 173 } };
const S3 = 'sc.grid=104,sc.maxCells=10200,sc.coneSpeed=5,sc.axonLen=69', S4 = 'sc.grid=120,sc.maxCells=13600,sc.coneSpeed=6,sc.axonLen=80', S2 = 'sc.grid=85,sc.maxCells=6800,sc.coneSpeed=4,sc.axonLen=57';
const at = (s, sel) => s.split(',').map(kv => { const [k, v] = kv.split('='); return `${k}@${sel}=${v}`; }).join(',');
const FAST = 'P.fastEngine=1', EXACT = 'P.fastEngine=0', v = (...a) => a.filter(Boolean).concat([FAST]).join(',');
const SLOTS = 6;   // average of the two workers, for estHours (wall)
function job(id, o) {   // arms: {variant, tasks: [keys], size, lbl}; seeds: list of k; G per run
  const runs = []; let sec = 0; const G = o.G || 1;
  for (const a of o.arms) for (const tk of a.tasks) for (let i = 0; i < o.seeds.length; i += G) { const g0 = o.seeds[i];
    runs.push({ script: 'run/r42.js', args: [a.plan || 'deepURSx3', T[tk][0], String(G), a.variant, String(g0), '--force'], label: `${a.lbl} ${T[tk][1]} g${g0} n${G}`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += G * SEC[a.size][tk]; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / SLOTS).toFixed(1), slotHours: +(sec / 3600).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const ALL7 = ['b10', 'b30', 'f4', 'o3', 't1', 'so2', 'scy'], FIVE = ['b10', 'b30', 'f4', 'o3', 't1'];
const J = [];
// 1. adoption confirmation of the y02 winner (cortex lr 0.2: book +0.008 / +0.009, fables +0.007, order3 -0.007 ns, text +0.001) on fresh seeds, full task set
for (const [id, s] of [['y08a_v38_lr02_confirm', K(1200, 8)], ['y08b_v38_lr02_confirm', K(1208, 8)]])
  J.push(job(id, { q: 'I77', pri: 0.98, seeds: s, G: 2, title: `v38 cortex lr 0.2 (and lr 0.2 + plateau 6) confirmation on FRESH growths k ${s[0]}-${s[7]}: book10k / 30k, fables4000, order3, text1000, seqchoice order2 / cycle, paired with the v38 base arm`,
    note: 'adoption rule: 16 fresh growths (y08a + y08b), paired vs the base arm, no task worse at t < -2 -> new default (v39)', arms: [
      { variant: v(), tasks: ALL7, size: '1x', lbl: 'v38 base' }, { variant: v('pl.lr@cortex=0.2'), tasks: ALL7, size: '1x', lbl: 'lr 0.2' }, { variant: v('pl.lr@cortex=0.2,pl.plateau@cortex=6'), tasks: ALL7, size: '1x', lbl: 'lr 0.2 + plateau 6' }] }));
// 2. does the rate keep paying above 0.2 (0.1 -> 0.15 -> 0.2 = +0.005 -> +0.009 on book, order3 -0.002 -> -0.007)
J.push(job('y09_v38_lr_ladder', { q: 'I77', pri: 0.975, seeds: K(0, 16), G: 2, title: 'v38 cortex lr 0.3 / 0.5 on the 5-task screen (growths 0-15), with a v38 base arm (fast engine)',
  note: 'paired vs the base arm (and vs y02 lr 0.2); where does the rate gain stop and does order3 fall?', arms: [
    { variant: v(), tasks: FIVE, size: '1x', lbl: 'v38 base' }, { variant: v('pl.lr@cortex=0.3'), tasks: FIVE, size: '1x', lbl: 'lr 0.3' }, { variant: v('pl.lr@cortex=0.5'), tasks: FIVE, size: '1x', lbl: 'lr 0.5' }] }));
// 3. which scaled region breaks order3 / seqchoice at 4xS and which one carries the book / fables gain (R69 box: order3 4xS 7.28, cortex-only 7.9, context-only 7.7, 1x 9.67; seqchoice all-scaled 0.01-2.5, striatum unscaled 2.5-6.4)
for (const [id, s] of [['y10a_size4xS_dissect', K(0, 8)], ['y10b_size4xS_dissect', K(8, 8)]])
  J.push(job(id, { q: 'I87', pri: 0.97, seeds: s, title: `4xS dissection (growths ${s[0]}-${s[7]}): all regions vs cortex only vs context regions only vs all but the striatum; order3, text1000, fables4000, book10k, seqchoice order2 / cycle`,
    note: 'paired by growth vs the all-regions 4xS arm and vs 1x (y09 / y08 base arms, x04): locates the order3 / seqchoice loss of scaled brains', arms: [
      { variant: v(S4), tasks: ['o3', 't1', 'f4', 'b10', 'so2', 'scy'], size: '4xS', lbl: '4xS all' },
      { variant: v(at(S4, 'cortex')), tasks: ['o3', 't1', 'f4', 'b10', 'so2', 'scy'], size: '4xS', lbl: '4xS cortex only' },
      { variant: v(at(S4, 'context')), tasks: ['o3', 't1', 'f4', 'b10', 'so2', 'scy'], size: '4xS', lbl: '4xS context only' },
      { variant: v(at(S4, '!striatum')), tasks: ['so2', 'scy'], size: '4xS', lbl: '4xS no striatum' },
      { variant: v(), tasks: ['so2', 'scy'], size: '1x', lbl: '1x' }] }));
// 4. rule x size: does the faster rate add to the 4xS gain, and does a slower rate rescue order3 at 4xS?
for (const [id, s] of [['y11a_4xS_lr', K(0, 8)], ['y11b_4xS_lr', K(8, 8)]])
  J.push(job(id, { q: 'I78', pri: 0.965, seeds: s, title: `4xS x cortex lr (growths ${s[0]}-${s[7]}): lr 0.2 on 5 tasks, lr 0.05 on order3 / text1000 / book10k, 4xS base on book30k (the other refs are y10's 4xS all arm)`,
    note: 'paired vs the 4xS base (y10 all-regions arm, this job on book30k) and vs y03 (exact engine, bit-near)', arms: [
      { variant: v(S4, 'pl.lr@cortex=0.2'), tasks: FIVE, size: '4xS', lbl: '4xS lr 0.2' }, { variant: v(S4, 'pl.lr@cortex=0.05'), tasks: ['o3', 't1', 'b10'], size: '4xS', lbl: '4xS lr 0.05' },
      { variant: v(S4), tasks: ['b30'], size: '4xS', lbl: '4xS base' }] }));
// 5. post-adoption completion of the fast-engine check at 4xS (z10 had growths 1100-1107): exact arm pinned to the exact engine
J.push(job('z10b_fast_valid_4xS_tasks', { q: 'I84', pri: 0.95, seeds: K(1108, 8), title: 'Fast engine at 4xS, other tasks, growths k 1108-1115 (completes z10 to 16): exact (P.fastEngine=0) vs fast (=1)',
  note: 'paired with z10 (k 1100-1107): 16 growths; if a task is worse at t < -2, revert the v38 engine default', arms: [].concat(...['f4', 'o3', 't1', 'so2', 'scy'].map(tk => [
    { variant: `${S4},${EXACT}`, tasks: [tk], size: '4xSexact', lbl: '4xS exact' }, { variant: `${S4},${FAST}`, tasks: [tk], size: '4xS', lbl: '4xS fast' }])) }));
// 6. independent replication of the size effect on fresh seeds (all 7 tasks; 1x refs = y08 base arm, same seeds)
for (const [id, s] of [['y15a_4xS_fresh', K(1200, 8)], ['y15b_4xS_fresh', K(1208, 8)]])
  J.push(job(id, { q: 'I78', pri: 0.93, seeds: s, title: `v38 4xS on fresh growths k ${s[0]}-${s[7]}, all 7 tasks (1x refs: y08 base arm, same seeds)`,
    note: 'replicates the size gains (book / fables) and losses (order3 / seqchoice) on never-used growth seeds', arms: [{ variant: v(S4), tasks: ALL7, size: '4xS', lbl: 'v38 4xS' }] }));
// 7. 2xS dissection (cheaper size; y05 lost order3 -0.15 and text1000 -0.017) + 2xS on seqchoice
J.push(job('y16_size2xS_dissect', { q: 'I87', pri: 0.92, seeds: K(0, 16), G: 2, title: '2xS dissection (growths 0-15): cortex only / context only on 5 tasks + seqchoice, all regions on seqchoice',
  note: 'paired vs y05 (2xS all, exact) and the 1x base arms', arms: [
    { variant: v(at(S2, 'cortex')), tasks: FIVE.concat(['so2', 'scy']), size: '2xS', lbl: '2xS cortex only' }, { variant: v(at(S2, 'context')), tasks: FIVE.concat(['so2', 'scy']), size: '2xS', lbl: '2xS context only' },
    { variant: v(S2), tasks: ['so2', 'scy'], size: '2xS', lbl: '2xS all' }] }));
// 8. long-gap memory x size: fables 8000 / 12000 (second / third pass) at 4xS vs 1x
J.push(job('y17_fables_long_4xS', { q: 'I87', pri: 0.9, seeds: K(0, 8), title: 'Long-gap memory x size: fables8000 / 12000 at 4xS vs 1x (growths 0-7)', note: 'does size help or hurt the second / third pass (order3 says sequence memory suffers)', arms: [
  { variant: v(S4), tasks: ['f8', 'f12'], size: '4xS', lbl: '4xS' }, { variant: v(), tasks: ['f8', 'f12'], size: '1x', lbl: '1x' }] }));
// 9. generation at 4xS under v38 with the output confidence gate (I81 / I72; z06 = 1x)
J.push(job('y18_gen_gate_4xS', { q: 'I72', pri: 0.88, seeds: K(0, 8), title: 'Generation after book30k at 4xS (growths 0-7): T 1, gate margin 0.2, gate 0.4 + T 0.7', note: 'word rate, distinct 4-grams, trigram bits, copying vs z06 (1x) and x14 (v36 4xS)', arms: [
  { variant: v(S4), tasks: ['b30'], size: '4xS', lbl: '4xS T1', task: 'gen' }] }));
// (y18's arms are written below with generation task strings)
const G30 = x => book(30000, Object.assign({ genSyms: 500 }, x));
{ const id = 'y18_gen_gate_4xS', runs = []; let sec = 0;
  const arms = [[G30({ genTemp: 1 }), v(S4), '4xS T1'], [G30({}), v(S4, 'pl.outGate=0.2,pl.outGateMode=1'), '4xS gate margin 0.2'], [G30({ genTemp: 0.7 }), v(S4, 'pl.outGate=0.4'), '4xS gate 0.4 + T0.7']];
  for (const [t, va, l] of arms) for (const k of K(0, 8)) { runs.push({ script: 'run/r42.js', args: ['deepURSx3', t, '1', va, String(k), '--force'], label: `${l} gen book30k g${k} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } }); sec += SEC['4xS'].b30; }
  const j = JSON.parse(fs.readFileSync(path.join(out, id + '.json'), 'utf8')); j.runs = runs; j.estHours = +(sec / 3600 / SLOTS).toFixed(1); j.slotHours = +(sec / 3600).toFixed(1);
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); J[J.length - 1] = j; }
// 10. size x length under the faster rate: 4xS lr 0.2 at 100k (x17: v36 4xS 100k = 30k)
J.push(job('y19_4xS_lr02_book100k', { q: 'I73', pri: 0.86, seeds: K(0, 16), title: '4xS + cortex lr 0.2 at book100k (growths 0-15, 1-growth runs)', note: 'vs y11 (4xS lr 0.2 at 30k / 10k) and x17 (v36 4xS 100k): does a faster rate turn length into accuracy at size?', arms: [
  { variant: v(S4, 'pl.lr@cortex=0.2'), tasks: ['b100'], size: '4xS', lbl: '4xS lr 0.2' }] }));
// 11. consolidation knobs at size (at 1x they buy book / fables but cost order3): plateau 6, metaN 80 at 4xS book30k / order3
J.push(job('y20_4xS_consolidation', { q: 'I77', pri: 0.84, seeds: K(0, 16), title: '4xS + plateau 6 / metaN 80 (cortex) on book30k and order3 (growths 0-15)', note: 'vs the 4xS base (y10 / y11); low priority filler on the rule x size question', arms: [
  { variant: v(S4, 'pl.plateau@cortex=6'), tasks: ['b30', 'o3'], size: '4xS', lbl: '4xS plateau 6' }, { variant: v(S4, 'pl.metaN@cortex=80'), tasks: ['b30', 'o3'], size: '4xS', lbl: '4xS metaN 80' }] }));
// 12. the size curve between 2xS and 4xS (3xS: grid 104 = 60 x sqrt 3, maxCells 10200, coneSpeed 5, axonLen 69): log-linear gain or saturation? where does order3 break?
J.push(job('y21_size3xS_screen', { q: 'I78', pri: 0.87, seeds: K(0, 16), title: 'v38 3xS on 5 tasks + seqchoice (growths 0-15): the size curve 1x / 2xS / 3xS / 4xS', note: 'paired vs 1x (y09 base), 2xS (y05), 4xS (y03 / y10)', arms: [
  { variant: v(S3), tasks: FIVE.concat(['so2', 'scy']), size: '3xS', lbl: '3xS' }] }));
// 13. the candidate large-run configuration on fresh seeds: 4xS + cortex lr 0.2, all 7 tasks (pairs with y15 4xS and y08 1x on k 1200-1215)
for (const [id, s] of [['y22a_4xS_lr02_fresh', K(1200, 8)], ['y22b_4xS_lr02_fresh', K(1208, 8)]])
  J.push(job(id, { q: 'I78', pri: 0.83, seeds: s, title: `4xS + cortex lr 0.2 on fresh growths k ${s[0]}-${s[7]}, all 7 tasks`, note: 'vs y15 (4xS, same seeds) and y08 (1x base / lr 0.2, same seeds)', arms: [
    { variant: v(S4, 'pl.lr@cortex=0.2'), tasks: ALL7, size: '4xS', lbl: '4xS lr 0.2' }] }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h`).join('\n'));
console.log('total slot-h', J.reduce((a, j) => a + j.slotHours, 0).toFixed(1), ' est wall h (6 slots)', J.reduce((a, j) => a + j.estHours, 0).toFixed(1));
