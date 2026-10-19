// R72: shared-queue jobs y62-y78 (node run/r72_jobs.js <outdir>): the seqchoice collapse at size and its fix.
// R72 box diagnosis (seqchoice order2, growths 0-1): the striatum still sees the needed state (the cortex mixing cells decode the paying arm at 1.0 at 1x
// and cortex 4x), but preNorm gives every presynaptic cell the same outgoing budget, so with ~10x the mixing cells a striatal receiver's plastic
// total grows to 665-963 (1x 162-202), its drive from active inputs 4x, its own arm code falls (decoding 0.76 -> 0.34), output margins 0.33 -> 0.12.
// Fix: P.postCapRel (cap of each receiver's reward-rule plastic total at postCapRel x its birth total) with P.postN 130 (only receivers with > 130 such inputs
// are capped: 1x-sized receivers, e.g. the cue / bandit striatum, are untouched; without postN the cap costs cue -2). Off by default. Box (8 growths): cortex 4x
// seqchoice order2 3.23 -> 5.76, cycle 3.97 -> 7.83 (postCapRel 1.5 + fanRef 450 / R126; 1x 6.48 / 9.23); without postN 6.11 / 8.81 (postCapRel 2).
// Sequence-only tasks never use the reward rule (no striatum without an outcome signal), so the postCap genes cannot change them:
// the seq-task numbers of 'cortex 4x + fanRef 450 / R126 + postCapRel' are those of y42 / y43 / y44 'cortex 4x fanRef450/R126'. Most jobs run seqchoice only.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'run/r72_jobs.js'];
const out = process.argv[2] || 'jobs_r72'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
const FAB = n => JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: n, readIn: 0.01 } });
const ORD = K => JSON.stringify({ env: 'seq', params: { source: 'order3', K, readIn: 0.01 } }), TXT = JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
const G30 = x => book(30000, Object.assign({ genSyms: 500 }, x)), G100 = x => book(100000, Object.assign({ genSyms: 500 }, x));
const T = { b10: [book(10000), 'book10k'], b30: [book(30000), 'book30k'], b100: [book(100000), 'book100k'], b300: [book(300000), 'book300k'], b1m: [book(1000000), 'book1M'],
  f4: [FAB(4000), 'fables4000'], f8: [FAB(8000), 'fables8000'], f12: [FAB(12000), 'fables12000'], o3: [ORD(8), 'order3'], o3k4: [ORD(4), 'order3 K4'], o3k16: [ORD(16), 'order3 K16'],
  t1: [TXT, 'text1000'], so2: [SC('order2'), 'seqchoice order2'], scy: [SC('cycle'), 'seqchoice cycle'], so3: [SC('order3'), 'seqchoice order3'], so2L: [JSON.stringify({ env: 'seqchoice', params: { source: 'order2', nSyms: 3000 } }), 'seqchoice order2 3000'],
  ban: [JSON.stringify({ env: 'bandit', params: { K: 6, C: 3, switchEvery: 40 } }), 'bandit 6x3'], cue: [JSON.stringify({ env: 'cue', params: { mapping: 'random', delay: 40 } }), 'cue random'],
  g30: [G30({}), 'gen30k greedy'], g30t1: [G30({ genTemp: 1 }), 'gen30k T1'], g30t7: [G30({ genTemp: 0.7 }), 'gen30k T0.7'], g100: [G100({}), 'gen100k greedy'], g100t7: [G100({ genTemp: 0.7 }), 'gen100k T0.7'] };
const SEC = { '1x': { so3: 13, so2L: 33, ban: 4, cue: 4, b10: 35, b30: 81, b100: 270, b300: 810, b1m: 2700, f4: 20, f8: 40, f12: 60, o3: 8, o3k4: 6, o3k16: 12, t1: 11, so2: 11, scy: 9, g30: 85, g30t1: 85, g30t7: 85, g100: 275, g100t7: 275 },
  '2xS': { b10: 75, b30: 190, b100: 650, b300: 1950, f4: 40, f8: 80, o3: 25, t1: 33, so2: 45, scy: 40 },
  '3xS': { b10: 170, b30: 420, f4: 90, o3: 55, t1: 60, so2: 110, scy: 100 },
  '4xS': { so3: 200, so2L: 525, b1m: 20000, b10: 260, b30: 650, b100: 2000, b300: 6000, f4: 136, f8: 272, f12: 408, o3: 88, o3k4: 70, o3k16: 120, t1: 95, so2: 175, scy: 152, g30: 660, g30t7: 660, g100: 2010, g100t7: 2010 } };
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

const PC = x => `P.postCapRel=${x},P.postN=130`, PCX = x => `P.postCapRel=${x}`, SCH = ['so2', 'scy'];
const FIX = v(C4, R, PC(1.5), L2);   // the combined fix: cortex 4x + fanRef 450 / R126 + postCapRel 2.5, lr 0.2
// 1. complete the box screen to 16 growths (box = growths 0-7)
J.push(job('y62_cx4_postCap_g8', { q: 'I90', pri: 0.995, seeds: K(8, 8), title: 'seqchoice: cortex 4x + postCapRel 1.5 (postN 130) with / without fanRef 450/R126, postCapRel 1 / 2 / 3 with fanRef, growths 8-15', note: 'box R72 has growths 0-7',
  arms: [[FIX, 'cx4 fix (fanRef + postCap 1.5 / postN 130)'], [v(C4, PC(1.5), L2), 'cx4 postCap 1.5'], [v(C4, R, PC(1), L2), 'cx4 fanRef postCap 1'], [v(C4, R, PC(2), L2), 'cx4 fanRef postCap 2'], [v(C4, R, PC(3), L2), 'cx4 fanRef postCap 3']].map(([x, l]) => ({ variant: x, tasks: SCH, size: '4xC', lbl: l })) }));
// 2. fresh growths (paired with y44 cortex 4x fanRef and y23 1x)
J.push(job('y63_cx4_postCap_fresh', { q: 'I90', pri: 0.99, seeds: K(1300, 16), title: 'seqchoice on fresh growths k 1300-1315: cortex 4x fix, 1x + postCapRel 2 (postN 130, must equal 1x)', note: 'refs y44 (cortex 4x fanRef, no postCap), y23 (1x)',
  arms: [{ variant: FIX, tasks: SCH, size: '4xC', lbl: 'cx4 fix' }, { variant: v(PC(2), L2), tasks: SCH, size: '1x', lbl: '1x postCap 2 postN 130' }] }));
// 3. 1x: is postCap neutral or useful (seqchoice, bandit, cue)?
J.push(job('y64_1x_postCap', { q: 'I90', pri: 0.985, seeds: K(0, 16), title: '1x (v39) + postCapRel 2.5 / 4 / 6 without postN (cap binds at 1x) and postCapRel 2 with postN 130 (inert), on seqchoice x2, bandit 6x3, cue random, growths 0-15', note: 'box: without postN the cap costs cue -2 (8.67 -> 6.6) and seqchoice order2 -0.1..-0.5; with postN 130 it is bit-identical to 1x',
  arms: [{ variant: v(L2), tasks: ['ban', 'cue'], size: '1x', lbl: '1x' }].concat([[PCX(2.5), '1x postCap 2.5 (no postN)'], [PCX(4), '1x postCap 4 (no postN)'], [PCX(6), '1x postCap 6 (no postN)'], [PC(2), '1x postCap 2 postN 130']].map(([x, l]) => ({ variant: v(x, L2), tasks: SCH.concat(['ban', 'cue']), size: '1x', lbl: l }))) }));
// 4. whole brain with the striatum kept 1x (+ fix), all 7 tasks
for (const [id, s] of [['y65a_ns4_fix', K(0, 8)], ['y65b_ns4_fix', K(8, 8)]])
  J.push(job(id, { q: 'I87', pri: 0.98, seeds: s, title: `sizeF 4 on cortex + context (striatum 1x) + fanRef 450/R126 + postCapRel 2.5, lr 0.2 (growths ${s[0]}-${s[7]}), all 7 tasks`, note: 'vs y45 (same without postCap) and the cortex-only fix',
    arms: [{ variant: v('sc.sizeF@!striatum=4', R, PC(1.5), L2), tasks: ALL7, size: '4xS', lbl: 'ns4 fix' }] }));
// 5. sizes: 8x / 2x / 3x cortex with the fix (seqchoice; seq tasks in y46 / y49)
J.push(job('y66_sizes_postCap', { q: 'I90', pri: 0.975, seeds: K(0, 16), title: 'seqchoice: cortex 8x (divRep 2) / 3x / 2x + fanRef 450/R126 + postCapRel 2.5, growths 0-15', note: 'size curve of the fixed striatum path',
  arms: [[v(C8, R, PC(1.5), L2), 'cx8 fix', '8xC'], [v('sc.sizeF@cortex=3', R, PC(1.5), L2), 'cx3 fix', '3xS'], [v('sc.sizeF@cortex=2', R, PC(1.5), L2), 'cx2 fix', '2xS']].map(([x, l, z]) => ({ variant: x, tasks: SCH, size: z, lbl: l })) }));
// 6. growths 16-31 (power) and harder / longer seqchoice
J.push(job('y67_cx4_fix_g16', { q: 'I90', pri: 0.96, seeds: K(16, 16), title: 'seqchoice: cortex 4x fix vs 1x (growths 16-31)', note: 'with y62 + box: 32 growths', arms: [{ variant: FIX, tasks: SCH, size: '4xC', lbl: 'cx4 fix' }, { variant: v(L2), tasks: SCH, size: '1x', lbl: '1x' }] }));
J.push(job('y68_seqchoice_hard', { q: 'I90', pri: 0.95, seeds: K(0, 16), title: 'seqchoice order3 and order2 3000-symbol lives: 1x, 1x postCap 4, cortex 4x fix, cortex 4x plain (growths 0-15)', note: 'does the fix hold where the task needs more context / a longer life?',
  arms: [[v(L2), '1x', '1x'], [v(PC(2), L2), '1x postCap 2 postN 130', '1x'], [FIX, 'cx4 fix', '4xC'], [v(C4, L2), 'cx4', '4xC']].map(([x, l, z]) => ({ variant: x, tasks: ['so3', 'so2L'], size: z, lbl: l })) }));
// 7. power for the fixed brain on all tasks: a new growth set k 32-47
for (const [id, s] of [['y69a_fix_all7_g32', K(32, 8)], ['y69b_fix_all7_g40', K(40, 8)]])
  J.push(job(id, { q: 'I90', pri: 0.9, seeds: s, title: `cortex 4x fix vs 1x v39 (growths ${s[0]}-${s[7]}), all 7 tasks`, note: 'new growth set for the adoption-style check',
    arms: [{ variant: FIX, tasks: ALL7, size: '4xC', lbl: 'cx4 fix' }, { variant: v(L2), tasks: ALL7, size: '1x', lbl: '1x v39' }] }));
// 8. long lives and generation for the fixed cortex (seq tasks: postCap inert, kept in the variant for one brain definition)
J.push(job('y70_fix_book1M', { q: 'I73', pri: 0.85, seeds: K(1400, 4), title: 'cortex 4x fix at book1M (growths k 1400-1403)', note: 'paired with y27 (1x v39 to 1M)', arms: [{ variant: FIX, tasks: ['b1m'], size: '4xC', lbl: 'cx4 fix' }] }));
J.push(job('y71_fix_long_text', { q: 'I73', pri: 0.83, seeds: K(0, 16), title: 'cortex 4x fix at fables8000 / 12000 and gen100k greedy (growths 0-15)', note: 'refs y17 (fables x size), y32 (4xS gen100k)', arms: [{ variant: FIX, tasks: ['f8', 'f12', 'g100'], size: '4xC', lbl: 'cx4 fix' }] }));
J.push(job('y72_cx8_fix_all7', { q: 'I80', pri: 0.82, seeds: K(16, 8), title: 'cortex 8x divRep 2 fix (growths 16-23), all 7 tasks', note: 'with y46 / y61 / y66', arms: [{ variant: v(C8, R, PC(1.5), L2), tasks: ALL7, size: '8xC', lbl: 'cx8 fix' }] }));
J.push(job('y73_cx3_fix_all7', { q: 'I78', pri: 0.8, seeds: K(0, 16), title: 'cortex 3x fix (growths 0-15), all 7 tasks', note: 'size curve 1x / 2x / 3x / 4x / 8x of the fixed brain', arms: [{ variant: v('sc.sizeF@cortex=3', R, PC(1.5), L2), tasks: ALL7, size: '3xS', lbl: 'cx3 fix' }] }));
J.push(job('y74_fix_book300k_g1416', { q: 'I73', pri: 0.78, seeds: K(1416, 8), title: 'cortex 4x fix vs 1x v39 at book100k / book300k (growths k 1416-1423)', note: 'more long-life pairs (y50 / y54 have k 1400-1415)',
  arms: [{ variant: FIX, tasks: ['b100', 'b300'], size: '4xC', lbl: 'cx4 fix' }, { variant: v(L2), tasks: ['b100', 'b300'], size: '1x', lbl: '1x v39' }] }));
// 9. lower tier: more long lives (both workers >= ~24 h)
J.push(job('y75_fix_book1M_g1404', { q: 'I73', pri: 0.76, seeds: K(1404, 4), title: 'cortex 4x fix at book1M (growths k 1404-1407)', note: 'with y70: 8 lives to 1M, paired with y27', arms: [{ variant: FIX, tasks: ['b1m'], size: '4xC', lbl: 'cx4 fix' }] }));
J.push(job('y76_fix_book300k_g1424', { q: 'I73', pri: 0.74, seeds: K(1424, 8), title: 'cortex 4x fix vs 1x v39 at book100k / book300k (growths k 1424-1431)', note: 'with y74', arms: [{ variant: FIX, tasks: ['b100', 'b300'], size: '4xC', lbl: 'cx4 fix' }, { variant: v(L2), tasks: ['b100', 'b300'], size: '1x', lbl: '1x v39' }] }));
J.push(job('y77_cx8_fix_book100k', { q: 'I80', pri: 0.72, seeds: K(1408, 8), title: 'cortex 8x divRep 2 fix at book100k (growths k 1408-1415)', note: 'with y52', arms: [{ variant: v(C8, R, PC(1.5), L2), tasks: ['b100'], size: '8xC', lbl: 'cx8 fix' }] }));
J.push(job('y78_fix_gen30k_g16', { q: 'I72', pri: 0.7, seeds: K(16, 16), title: 'cortex 4x fix: generation after book30k greedy / T0.7 (growths 16-31)', note: 'with y53', arms: [{ variant: FIX, tasks: ['g30', 'g30t7'], size: '4xC', lbl: 'cx4 fix' }] }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h`).join('\n'));
console.log('total slot-h', J.reduce((a, j) => a + j.slotHours, 0).toFixed(1), ' est wall h (6 slots)', J.reduce((a, j) => a + j.estHours, 0).toFixed(1));
