// R73: shared-queue jobs y79-y80 (node run/r73_jobs.js <outdir>): trophic (region-size) normalization vs the R72 fix.
// P.trophic: bit 1 = the preNorm budget of a presynaptic cell in a region grown f x larger is preNorm / f (fixed trophic supply shared by f x more cells,
// exactly neutral at 1x, no cutoff); bit 2 = learning step x 1/f of the presynaptic region. Box (8 growths, cortex 4x, lr 0.2): trophic 3 seqchoice
// order2 / cycle 5.62 / 8.16 (R72 fix 5.76 / 7.83), but order3 0.771 / text 0.733 (fix 0.875 / 0.749); trophic 1 + fanRef 450 order3 0.809.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'run/r73_jobs.js'];
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
const PC = x => `P.postCapRel=${x},P.postN=130`, SCH = ['so2', 'scy'];
const FIX = v(C4, R, PC(1.5), L2), T3 = v(C4, 'P.trophic=3', L2), T1F = v(C4, 'P.trophic=1', R, L2);
J.push(job('y79_trophic_g8', { q: 'I91', pri: 0.97, seeds: K(8, 8), title: 'cortex 4x + P.trophic 3 / trophic 1 + fanRef 450, all 7 tasks, growths 8-15 (+ R72 fix on seqchoice)', note: 'box R73 has growths 0-7; fix seq tasks = y42/y43',
  arms: [{ variant: T3, tasks: ALL7, size: '4xC', lbl: 'cx4 trophic 3' }, { variant: T1F, tasks: ALL7, size: '4xC', lbl: 'cx4 trophic 1 + fanRef' }, { variant: FIX, tasks: SCH, size: '4xC', lbl: 'cx4 fix' }] }));
J.push(job('y80_trophic_fresh', { q: 'I91', pri: 0.965, seeds: K(1300, 16), title: 'cortex 4x + P.trophic 3 / trophic 1 + fanRef 450 on fresh growths k 1300-1315, all 7 tasks', note: 'refs y63 (fix, seqchoice), y44 (cx4 fanRef), y23 (1x)',
  arms: [{ variant: T3, tasks: ALL7, size: '4xC', lbl: 'cx4 trophic 3' }, { variant: T1F, tasks: ALL7, size: '4xC', lbl: 'cx4 trophic 1 + fanRef' }] }));
// R74 combo (P.trophic 28 = bit 4 striatal-path budget + bit 8 cortex teacher step + bit 16 reward step, each x min(1, 1x-equivalent fan-in / fan-in)): 1x-identical, no cutoff
const C28 = v(C4, 'P.trophic=28', L2);
J.push(job('y81_combo28_g8', { q: 'I91', pri: 0.968, seeds: K(8, 8), title: 'cortex 4x + P.trophic 28 (cutoff-free combo), all 7 tasks, growths 8-15', note: 'box R74 has growths 0-7; refs y62 / y42-y43 (R72 fix)', arms: [{ variant: C28, tasks: ALL7, size: '4xC', lbl: 'cx4 trophic 28' }] }));
J.push(job('y82_combo28_fresh', { q: 'I91', pri: 0.963, seeds: K(1300, 16), title: 'cortex 4x + P.trophic 28 on fresh growths k 1300-1315, all 7 tasks', note: 'refs y63 (fix seqchoice), y44, y23', arms: [{ variant: C28, tasks: ALL7, size: '4xC', lbl: 'cx4 trophic 28' }] }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h`).join('\n'));
console.log('total slot-h', J.reduce((a, j) => a + j.slotHours, 0).toFixed(1), ' est wall h (6 slots)', J.reduce((a, j) => a + j.estHours, 0).toFixed(1));
