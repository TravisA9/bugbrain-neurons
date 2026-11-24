// R117 (Nov 16 2026). y245: book300k hybrid scaling on v47 + order3 / seqchoice regression on the same arms and growths.
// Arms (paired, k 2968-2975): ref_1x_32k (v47: 1x + 32000 granules) vs hybrid_2x_32k (sc.sizeF=2, scaleInvariant=1, granUtility=1)
//   vs hybrid_2x_64k_chunk (deepURSx3_chunk, sizeF=2, 64000 granules, same flags).
// Tasks: book300k (gate) + order3 K8 / K4 + seqchoice order2 / cycle (exact y216 / y241 task strings and label scheme).
// granFast=1 on every arm: bit-identical (test_core I106); with the net.js gFast0 gate (sparse bitset path only for <= 2048 granules
//   or granFast=2) the 32k / 64k layers use the faster sequential loop, so granFast=2 would only slow them down.
// This file is also the requires guard: workers on code without it (434a9ee and older: no scaleInvariant / granUtility / deepURSx3_chunk)
//   never claim y245.
// usage: node run/r117_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r117'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js', 'run/r117_jobs.js'];
const V47 = ['pl.lr@cortex=0.2', 'P.granKmin=3', 'P.granK=4', 'P.granW=60', 'P.granLrT=100000', 'P.granLrLate=0.05', 'P.fastEngine=1', 'P.granFast=1'].join(',');
const ARMS = [
  ['ref_1x_32k', 'deepURSx3', V47 + ',P.granN=32000,P.granUtility=0,P.scaleInvariant=0'],
  ['hybrid_2x_32k', 'deepURSx3', V47 + ',sc.sizeF=2,P.granN=32000,P.granUtility=1,P.scaleInvariant=1'],
  ['hybrid_2x_64k_chunk', 'deepURSx3_chunk', V47 + ',sc.sizeF=2,P.granN=64000,P.granUtility=1,P.scaleInvariant=1'],
];
const TASKS = [
  [{ env: 'seq', params: { source: 'book', nSyms: 300000, evalSyms: 2000 } }, 'book300k'],
  [{ env: 'seq', params: { source: 'order3', K: 8, readIn: 0.01 } }, 'order3'],
  [{ env: 'seq', params: { source: 'order3', K: 4, readIn: 0.01 } }, 'K4'],
  [{ env: 'seqchoice', params: { source: 'order2', nSyms: 1000 } }, 'seqchoice order2'],
  [{ env: 'seqchoice', params: { source: 'cycle', nSyms: 1000 } }, 'seqchoice cycle'],
];
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), SEEDS = K(2968, 8);
const id = 'y245_hybrid_2x_chunk64k_book300k', runs = [];
for (const [task, tl] of TASKS) for (const [lbl, plan, variant] of ARMS) for (const g of SEEDS)
  runs.push({ script: 'run/r42.js', args: [plan, JSON.stringify(task), '1', variant, String(g), '--force'], label: `${lbl} ${tl} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
const note = 'Paired per growth vs ref_1x_32k (k 2968-2975, same growth seed). ADOPT an arm (hybrid_2x_32k or hybrid_2x_64k_chunk) only if BOTH: (1) book300k: mean paired delta >= +0.004 AND delta > 0 on >= 6/8 growths; (2) no regression on the same 8 growths: paired mean delta on each of order3 (K8), K4, seqchoice order2, seqchoice cycle not worse than ref_1x_32k beyond its growth noise (proposed thresholds, not yet a repo convention: order3/K4 mean delta >= -0.01; seqchoice order2/cycle mean delta >= -0.02, sign of fewer than 6/8 growths worse). All arms run P.granFast=1: granFast is bit-identical (test_core I106) and with the gFast0 gate the >2048-granule layers use the faster sequential loop; P.granFast=2 would force the slower sparse-bitset path. Screen n 8; a winner needs a fresh 16-growth check before promotion in base.js.';
// 24 book300k runs ~30 slot-h (y245 original estimate); 96 short order3 / seqchoice runs ~5 slot-h (y216: 96 runs = 2 slot-h at 8k-32k, x2-3 for 2x / 64k)
const j = { id, question: 'I101 / I104 / I106', track: 'neuro', kind: 'runs', requires: REQ,
  title: 'book300k hybrid scaling + order3/seqchoice regression: 1x+32k v47 ref vs 2x grown sheet + 32k / 2x + 64k chunk (granUtility=1, scaleInvariant=1, k 2968-2975)',
  priority: 0.86, estHours: 6, slotHours: 35, phone: false, flag: 'text', memGB: 4, accept: { note }, runs };
fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n');
console.log(id.padEnd(36), String(runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB);
