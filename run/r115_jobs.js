// R115 (Nov 5 2026, morning queue review). No adoption (v47 / DEFAULTS_VERSION 40 stays).
// Findings behind this job (RESULTS R115):
//  y237 (k 2536-2539) 64000 cells + sched100k at 1M vs 32000 sched100k: +0.0020 (3/1, t 1.0) at ~2x runtime -> capacity past 32000 still not worth it at 1M (park I101 until y240).
//  y239 (k 2536-2539) sched30k -0.0016 (1/2), sched100k late 0.025 -0.0006 (1/3) vs sched100k late 0.05 -> the adopted step (100k, 0.05) stays; step timing closed at 1M.
//  Generation loops are unblocked (length rule settled): does a longer life (book300k, step fires) reduce greedy free-running loops vs book30k on v47?
// Every arm sets P.granLrT / P.granLrLate explicitly, so it means v47 even on workers still on pre-v47 code (70daae6).
// usage: node run/r115_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r115'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'run/gen.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js'];
const gq = n => ({ env: 'seq', params: { source: 'book', nSyms: n, evalSyms: 2000, genSyms: 500 } });
// [task, label, wall s per run per slot on linux-pc for a 1x 8000-cell brain; 32000 cells x6]
const T = { g30: [gq(30000), 'book30k', 109], g300: [gq(300000), 'book300k', 1100] };
const STATS = ['distinct4', 'nonSpace', 'triBits'];
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1, seeds = o.seeds] of o.arms) for (const t of tasks) for (const s of STATS) for (const g of seeds) {
    runs.push({ script: 'run/gen.js', args: ['deepURSx3', JSON.stringify(T[t][0]), '1', variant, String(g), '--force'], label: `${lbl} gen ${s} ${T[t][1]} g${g} n1`,
      env: { BB_OUT: `results/phone/${id}.jsonl`, BB_GEN_MEAN: s } });
    sec += T[t][2] * f; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 2, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const V47 = ['pl.lr@cortex=0.2', 'P.granN=32000', 'P.granKmin=3', 'P.granK=4', 'P.granW=60', 'P.granLrT=100000', 'P.granLrLate=0.05', 'P.fastEngine=1'].join(',');
J.push(job('y242_1x_v47_gen_length', { q: 'I72', pri: 0.85, seeds: K(2944, 8), memGB: 2,
  title: 'generation loops vs life length on v47 (32000 cells, granule step at 100k): book30k vs book300k life, then 500 greedy free-run symbols; published stats distinct4 (loops), nonSpace (space collapse), triBits (vs real text ~2.6); fresh k 2944-2951',
  note: 'Box smoke (book3k, g2944): greedy collapses to spaces (nonSpace 0.035, distinct4 0.076, triBits 5.78). y169 (v43, book30k): word rate ~0.10. Question: does a 10x longer life (where the step fires) cut the greedy loops, i.e. is looping a capacity / learning problem or a readout-policy problem? If book300k is not clearly better on distinct4 / nonSpace (paired, 8 growths), loops are a policy problem -> next: sampled / anti-repeat readout, not more learning. Each stat is a separate run on the same growth (queue keeps one mean per run); teacher-forced fitness is in fitMean.',
  arms: [['v47', V47, ['g30', 'g300'], 6]] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
