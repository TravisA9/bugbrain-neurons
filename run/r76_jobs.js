// (R76 copy of the R75 job helpers) R75: shared-queue jobs y83-y86 (node run/r75_jobs.js <outdir>) + the memory split of the 8x-cortex jobs (node run/r75_jobs.js <outdir> <queue jobs dir>).
// y83: preNorm@cortex 55 (y25 screen, growths 0-15: book10k +0.003 9/5, book30k +0.004 14/1, no task worse) vs v39 on FRESH growths k 1500-1515, all 7 tasks.
// y84: preNorm ladder 50 / 65 / 80 at 1x (growths 0-15) incl. seqchoice. y85: preNorm 55 / 70 at cortex 4x + fanRef 450 (growths 0-7).
// y86: order3 K4 collapses at 4xS (y30: 0.086 vs 1x 0.984): which region, and does fanRef help (16 growths)?
// 8x cortex: one book run peaks at ~4.4 GB RSS (box, R75); jobs get memGB 4.6 (run/mempar.js caps the parallel runs) and their cortex-4x arms move to separate jobs.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'run/r75_jobs.js', 'js/core/develop.js', 'run/mempar.js', 'run/r76_jobs.js'];
const out = process.argv[2] || 'jobs_r76'; fs.mkdirSync(out, { recursive: true });
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
// R76: whole-brain sizeF 2 / 4 (every region incl. striatum) with P.sizeCone (striatum growth-cone fix) and + R72 patch, fresh growths k 1600-1615
const R72 = 'P.fanRef=450,P.postCapRel=1.5,P.postN=130', L2v = 'pl.lr@cortex=0.2';
for (const [half, k0] of [['a', 1600], ['b', 1608]]) {
  const arms = [{ variant: v(L2v), tasks: ALL7, size: '1x', lbl: 'v39 1x' }];
  for (const [f, sz] of [[2, '2xS'], [4, '4xS']]) arms.push({ variant: v('sc.sizeF=' + f, L2v), tasks: ALL7, size: sz, lbl: 'all' + f }, { variant: v('sc.sizeF=' + f, 'P.sizeCone=1', L2v), tasks: ALL7, size: sz, lbl: 'all' + f + ' sizeCone' }, { variant: v('sc.sizeF=' + f, 'P.sizeCone=1', R72, L2v), tasks: ALL7, size: sz, lbl: 'all' + f + ' sizeCone R72' });
  const j = job('y87' + half + '_sizeCone_all', { q: 'I93', pri: 0.985, seeds: K(k0, 8), title: 'R76 whole-brain sizeF 2/4: v39 vs + sizeCone vs + sizeCone + R72 patch, fresh growths k ' + k0 + '-' + (k0 + 7) + ', all 7 tasks', note: 'R76 screen (growths 0-7): sizeCone fixes orphaned seqchoice outputs; adopt sizeCone for sized brains if no task worse over y87a+b', arms });
  j.memGB = 0.8; fs.writeFileSync(path.join(out, j.id + '.json'), JSON.stringify(j, null, 2) + '\n'); J.push(j); }
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h`).join('\n'));
