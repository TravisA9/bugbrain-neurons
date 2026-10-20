// R75: shared-queue jobs y83-y86 (node run/r75_jobs.js <outdir>) + the memory split of the 8x-cortex jobs (node run/r75_jobs.js <outdir> <queue jobs dir>).
// y83: preNorm@cortex 55 (y25 screen, growths 0-15: book10k +0.003 9/5, book30k +0.004 14/1, no task worse) vs v39 on FRESH growths k 1500-1515, all 7 tasks.
// y84: preNorm ladder 50 / 65 / 80 at 1x (growths 0-15) incl. seqchoice. y85: preNorm 55 / 70 at cortex 4x + fanRef 450 (growths 0-7).
// y86: order3 K4 collapses at 4xS (y30: 0.086 vs 1x 0.984): which region, and does fanRef help (16 growths)?
// 8x cortex: one book run peaks at ~4.4 GB RSS (box, R75); jobs get memGB 4.6 (run/mempar.js caps the parallel runs) and their cortex-4x arms move to separate jobs.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'run/r75_jobs.js'];
const out = process.argv[2] || 'jobs_r75'; fs.mkdirSync(out, { recursive: true });
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
const PC = x => `P.postCapRel=${x},P.postN=130`, SCH = ['so2', 'scy'];
const FIX = v(C4, R, PC(1.5), L2), T3 = v(C4, 'P.trophic=3', L2), T1F = v(C4, 'P.trophic=1', R, L2);
const PN = x => `pl.preNorm@cortex=${x}`, BASE = v(L2);
J.push(job('y83a_preNorm55_fresh', { q: 'I92', pri: 0.99, seeds: K(1500, 8), title: 'v39 + preNorm@cortex 55 vs v39 on fresh growths k 1500-1507, all 7 tasks (adoption confirmation)', note: 'adopt as v40 if no task worse over y83a+b (16 fresh growths)',
  arms: [{ variant: BASE, tasks: ALL7, size: '1x', lbl: 'v39' }, { variant: v(L2, PN(55)), tasks: ALL7, size: '1x', lbl: 'v39 preNorm55' }] }));
J.push(job('y83b_preNorm55_fresh', { q: 'I92', pri: 0.99, seeds: K(1508, 8), title: 'v39 + preNorm@cortex 55 vs v39 on fresh growths k 1508-1515, all 7 tasks (adoption confirmation)', note: 'adopt as v40 if no task worse over y83a+b (16 fresh growths)',
  arms: [{ variant: BASE, tasks: ALL7, size: '1x', lbl: 'v39' }, { variant: v(L2, PN(55)), tasks: ALL7, size: '1x', lbl: 'v39 preNorm55' }] }));
J.push(job('y84_preNorm_ladder', { q: 'I92', pri: 0.97, seeds: K(0, 16), title: 'v39 + preNorm@cortex 50 / 65 / 80, growths 0-15, 5 tasks + seqchoice', note: 'refs y24 lr0.2 arm (v39), y25 preNorm 55, y10 1x (seqchoice)',
  arms: [50, 65, 80].map(x => ({ variant: v(L2, PN(x)), tasks: ALL7, size: '1x', lbl: 'v39 preNorm' + x })) }));
J.push(job('y85_cx4_preNorm', { q: 'I92', pri: 0.96, seeds: K(0, 8), title: 'cortex 4x + fanRef 450/R126 + preNorm@cortex 55 / 70, growths 0-7, 5 tasks', note: 'ref y43 cx4 fanRef450/R126 growths 0-7',
  arms: [55, 70].map(x => ({ variant: v(C4, R, L2, PN(x)), tasks: FIVE, size: '4xC', lbl: 'cx4 fanRef preNorm' + x })) }));
J.push(job('y86_order3K4_size', { q: 'I87', pri: 0.955, seeds: K(0, 16), title: 'order3 K4 (and K16) at size: 1x v39, cortex 4x + fanRef, context 4x only, all 4x + fanRef (16 growths)', note: 'y30: 4xS K4 0.086 vs 1x 0.984; which region breaks the short-context cycle?',
  arms: [{ variant: BASE, tasks: ['o3k4', 'o3k16'], size: '1x', lbl: 'v39' }, { variant: v(C4, R, L2), tasks: ['o3k4', 'o3k16'], size: '4xC', lbl: 'cx4 fanRef' },
    { variant: v('sc.sizeF@context=4', L2), tasks: ['o3k4'], size: '4xC', lbl: 'ctx4' }, { variant: v(S4, R, L1), tasks: ['o3k4'], size: '4xS', lbl: '4xS fanRef' }] }));
// memory split of the 8x-cortex jobs (needs the queue's jobs dir as argv[3]): cortex-8x seq runs keep the id + memGB 4.6; cortex-4x runs -> y46c_cx4_divRep / y61c_cx4_divRep_g8 (no 'cx8' in the id: tacobell skips *cx8*); 8x seqchoice dropped (y66)
const QJ = process.argv[3];
if (QJ) {
  const rd = id => JSON.parse(fs.readFileSync(path.join(QJ, id + '.json'), 'utf8')), wr = j => { fs.writeFileSync(path.join(out, j.id + '.json'), JSON.stringify(j, null, 2) + '\n'); J.push(j); };
  const mem = (j, why) => Object.assign(j, { memGB: 4.6, requires: [...new Set((j.requires || []).concat(['run/mempar.js', 'run/r75_jobs.js']))], r75: why });
  const est = (j, sec, par) => Object.assign(j, { slotHours: +(sec / 3600).toFixed(1), estHours: +(sec / 3600 / par).toFixed(1) });
  for (const id of ['y46_cx8_divRep', 'y61_cx8_divRep_g8']) {
    const j = rd(id), cid = id.replace(/^(y\d+)_cx8/, '$1c_cx4'), c8 = j.runs.filter(r => /cortex=8/.test(r.args[3]) && !/seqchoice/.test(r.args[1])), c4 = j.runs.filter(r => /cortex=4/.test(r.args[3]));
    const sec8 = c8.length * 2.2 * 250, sec4 = c4.reduce((a, r) => a + 0.7 * 150, 0);
    wr(est(mem(Object.assign({}, j, { runs: c8, title: j.title.replace('cortex 8x divRep 2 and cortex 4x divRep 2', 'cortex 8x divRep 2').replace('cortex 8x / 4x', 'cortex 8x') + ' [R75: 8x seq tasks only, memGB 4.6]' }), 'R75 split: cortex-4x runs -> ' + cid + ', 8x seqchoice dropped (y66 measured it)'), sec8, 2));
    wr(est(Object.assign({}, j, { id: cid, runs: c4.map(r => Object.assign({}, r, { env: { BB_OUT: `results/phone/${cid}.jsonl` } })), requires: [...new Set(j.requires.concat(['run/r75_jobs.js']))], title: j.title.replace(/cortex 8x divRep 2 and |cortex 8x \/ /, '') + ' [R75: cortex-4x part of ' + id + ']' }), sec4, SLOTS));
  }
  for (const id of ['y52_cx8_long', 'y77_cx8_fix_book100k']) { const j = rd(id); wr(est(mem(j, 'R75: memGB 4.6'), j.slotHours * 3600, 2)); }
  for (const id of ['y56_cx8_book300k', 'y72_cx8_fix_all7']) wr(Object.assign(mem(rd(id), 'R75: memGB 4.6'), { kind: 'blocked', blockedWhy: id === 'y56_cx8_book300k' ? 'R75: parked until y52 shows an 8x cortex still improving at 100k (length is flat at every size so far); ~9 h at 2 parallel runs' : 'R75: parked: its seq-task arms equal y46/y61 (postCap cannot change seq tasks) and y66 already measured cx8 + fix on seqchoice (2.1 / 2.2)' }));
}
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h`).join('\n'));
console.log('total slot-h', J.reduce((a, j) => a + j.slotHours, 0).toFixed(1), ' est wall h (6 slots)', J.reduce((a, j) => a + j.estHours, 0).toFixed(1));
