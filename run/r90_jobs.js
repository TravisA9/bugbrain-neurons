// R90 (Oct 23 2026, 7 AM queue review; default v42 / DEFAULTS_VERSION 35 holds its worker held-out y154): light 1x jobs y155-y158 on the v42 brain.
// Findings behind them (RESULTS R90): y141 granLr / granGain: nothing beats v41 (granLr 0.05: book10k -0.005 but book30k only -0.002 -> does a slower NLMS step win with length?);
// y146 granRef 450 / 750 ~ 600 (flat 450-1000); y147 granW 40: fables +0.006 (15/1), book ~0; granRate 0.00015 ~0, 0.0006 / granW 90 worse; y148a preNorm 45: book +0.003 (n8).
// usage: node run/r90_jobs.js <outdir>. Jobs require only files already on the code branch (no new code needed by the workers).
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r90'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js'];
// [params, label, wall s per run per slot on linux-pc for a 1x granule brain (R88 SEC x 1.35)]
const T = { b10: [{ source: 'book', nSyms: 10000, evalSyms: 2000 }, 'book10k', 47], b30: [{ source: 'book', nSyms: 30000, evalSyms: 2000 }, 'book30k', 109],
  b100: [{ source: 'book', nSyms: 100000, evalSyms: 2000 }, 'book100k', 365], f4: [{ source: 'fables', nSyms: 4000, readIn: 0.01 }, 'fables4000', 27],
  f12: [{ source: 'fables', nSyms: 12000, readIn: 0.01 }, 'fables12000', 81], o3: [{ source: 'order3', K: 8, readIn: 0.01 }, 'order3', 11], t1: [{ source: 'text', nSyms: 1000, readIn: 0.01 }, 'text1000', 15] };
const FIVE = ['b10', 'b30', 'f4', 'o3', 't1'], V = (...x) => ['pl.lr@cortex=0.2'].concat(x, ['P.fastEngine=1']).join(',');
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks] of o.arms) for (const t of (tasks || FIVE)) for (const g of o.seeds) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', JSON.stringify({ env: 'seq', params: T[t][0] }), '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += T[t][2]; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 1, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const GCAPMEM = +(process.env.GCAPMEM || 1);
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
for (const [s, g] of [['a', K(2192, 8)], ['b', K(2200, 8)]])
  J.push(job(`y155${s}_1x_v42_granW`, { q: 'I99', pri: 0.97, seeds: g, title: `granule claw weight on v42: granW 40 (+/- granLr 0.2, +/- granRate 0.00015), fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'y147 (v41, 16 fresh): granW 40 fables +0.006 (15/1, t 6.6), book10k +0.001, book30k -0.002 (6/10), text 0. With v42 granRef 600 (6x the granule drive) does the weaker claw now help book too? Adopt only with no task worse on 16 + 16 fresh growths.',
    arms: [['v42 1x', V()], ['v42 granW40', V('P.granW=40')], ['v42 granW40 granLr0.2', V('P.granW=40', 'P.granLr=0.2')], ['v42 granW40 granRate0.00015', V('P.granW=40', 'P.granRate=0.00015')]] }));
for (const [s, g] of [['a', K(2208, 8)], ['b', K(2216, 8)]])
  J.push(job(`y156${s}_1x_v42_slowGranLr`, { q: 'Q42', pri: 0.965, seeds: g, title: `plateau / learning rule: does a slower granule NLMS step win with length on v42? granLr 0.05 / 0.025, book10k + book30k + fables4000 + order3 + text1000, fresh k ${g[0]}-${g[7]}`,
    note: 'y141 (v41): granLr 0.05 book10k -0.005 (2/14) but book30k only -0.002 (5/11): the slow step loses less with more data. If the deficit shrinks or flips from 10k to 30k on v42, a decaying step (anneal) is the plateau fix worth coding; if not, the readout step is not the plateau.',
    arms: [['v42 1x', V()], ['v42 granLr0.05', V('P.granLr=0.05')], ['v42 granLr0.025', V('P.granLr=0.025')]] }));
for (const [s, g] of [['a', K(2224, 8)], ['b', K(2232, 8)]])
  J.push(job(`y157${s}_1x_v42_preNorm`, { q: 'Q46', pri: 0.95, seeds: g, title: `output-drive normalisation on v42: cortex preNorm 45 / 50 (default 55), fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'y148a (v41, 8 growths): preNorm 45 book +0.003 (6/2) but text -0.002 (2/6); y148b pending. With granRef 600 the outputs get more granule drive: does less cortex drive (45 / 50) now pay without the text cost?',
    arms: [['v42 1x', V()], ['v42 preNorm45', V('pl.preNorm@cortex=45')], ['v42 preNorm50', V('pl.preNorm@cortex=50')]] }));
J.push(job('y158_1x_v42_plateau_long', { q: 'Q42', pri: 0.955, seeds: K(1400, 8), memGB: 1.5, title: 'the plateau on v42 with a slower granule step: v42 / v42 granLr 0.05 at book100k + fables12000, growths k 1400-1407 (refs y138 v40 / v41, y145 granRef 1000, same growths) [linux-pc]',
  note: 'y138: v41 book100k 0.368 = its book10k-30k level (plateau at a higher level). Does v42 (granRef 600) rise with length, and does granLr 0.05 (less step noise) rise more? Box probe: v42 book100k 1x peak RSS in RESULTS R90.',
  arms: [['v42 1x', V(), ['b100', 'f12']], ['v42 granLr0.05', V('P.granLr=0.05'), ['b100', 'f12']]] }));
for (const [s, g] of [['a', K(2240, 8)], ['b', K(2248, 8)]])
  J.push(job(`y159${s}_1x_v42_granCap`, { q: 'I99', pri: 0.975, seeds: g, memGB: GCAPMEM, title: `granule capacity on v42 (replaces v41 y140): granN 4000 / granK 4 / both, fresh k ${g[0]}-${g[7]}, 5 seq tasks`,
    note: 'Gap to the 3-gram ceiling (~0.41) is ~0.015-0.02 on book30k. 1x granule knobs (granGain, granLr, granRate, granRef 450-1000, granW) are exhausted (R90), so the next lever is capacity: more granule cells and 4-letter claws. Box probe: peak RSS in RESULTS R90.',
    arms: [['v42 1x', V()], ['v42 granN4000', V('P.granN=4000')], ['v42 granK4', V('P.granK=4')], ['v42 granN4000 granK4', V('P.granN=4000', 'P.granK=4')]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(28), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
