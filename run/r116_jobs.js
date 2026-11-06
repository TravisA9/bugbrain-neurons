// R116 (Nov 5 2026, evening queue review). No adoption (v47 / DEFAULTS_VERSION 40 stays).
// Findings behind this job (RESULTS R116):
//  y240 (k 2536-2537) book3M plateau screen vs 1M refs (y229 fixed, y224 sched100k):
//    fixed 1M->3M mean d=-0.0033 (0/2 climb); sched100k mean d=-0.0057 (0/2);
//    rule gap sched-fixed mean +0.0065 at 1M -> +0.0040 at 3M (shrinks, does not grow).
//    Per accept: lift < +0.003 => plateau REAL at 32000. No second step. No adoption.
//  I101 / 64000@3M NOT queued: y237 already +0.0020 (3/1, t 1.0) at 1M for ~2x runtime and
//    the short set was nil (y235a/b); a declining 3M score is not a capacity-starvation signal.
//    Length / plateau question CLOSED; capacity stays parked.
//  Focus moves to generation readout policy (does not wait on y241/y242): greedy loops are a
//    known failure at book30k (R115 box smoke); y242 asks whether life length helps; this job
//    asks whether sampled / gated readout helps on v47 at the known failure point, with a T1
//    book300k arm so depth stays >=12h with y241 (~1h) + y242 (~8h).
// Every arm sets P.granLrT / P.granLrLate explicitly (v47 pin).
// usage: node run/r116_jobs.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'jobs_r116'; fs.mkdirSync(out, { recursive: true });
const REQ = ['run/r42.js', 'run/gen.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/lib.js'];
const gq = (n, extra) => ({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000, genSyms: 500 }, extra || {}) });
// wall s per run per slot on linux-pc for a 1x 8000-cell brain; 32000 cells x6
const T = {
  g30: [gq(30000), 'book30k', 109],
  g30t1: [gq(30000, { genTemp: 1 }), 'book30k', 109],
  g300t1: [gq(300000, { genTemp: 1 }), 'book300k', 1100],
};
const STATS = ['distinct4', 'nonSpace', 'triBits'];
function job(id, o) {
  const runs = []; let sec = 0;
  for (const [lbl, variant, tasks, f = 1, seeds = o.seeds] of o.arms) for (const t of tasks) for (const s of STATS) for (const g of seeds) {
    runs.push({ script: 'run/gen.js', args: ['deepURSx3', JSON.stringify(T[t][0]), '1', variant, String(g), '--force'],
      label: `${lbl} gen ${s} ${T[t][1]} g${g} n1`,
      env: { BB_OUT: `results/phone/${id}.jsonl`, BB_GEN_MEAN: s } });
    sec += T[t][2] * f; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri,
    estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1),
    phone: false, flag: 'text', memGB: o.memGB || 2, accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i), J = [];
const V47 = ['pl.lr@cortex=0.2', 'P.granN=32000', 'P.granKmin=3', 'P.granK=4', 'P.granW=60', 'P.granLrT=100000', 'P.granLrLate=0.05', 'P.fastEngine=1'].join(',');
const V47m = V47 + ',pl.outGate=0.2,pl.outGateMode=1';
// book30k: full policy screen (greedy / T1 / gate margin 0.2). book300k: T1 only (y242 covers greedy@300k; asks whether sampling helps once the step has fired).
J.push(job('y243_1x_v47_gen_policy', { q: 'I81', pri: 0.84, seeds: K(2952, 8), memGB: 2,
  title: 'generation readout policy on v47 (32000 cells + step pinned): greedy vs genTemp=1 vs gate margin 0.2 at book30k, plus genTemp=1 at book300k; distinct4 / nonSpace / triBits; fresh k 2952-2959',
  note: 'Plateau closed (y240): length parked, focus generation. Box smoke (R115) and historical z06: greedy loops / space-collapses at book30k; T1 and gate margin 0.2 were the useful policy levers (I81). Does either lift distinct4 / nonSpace on v47 at the known failure point (8 growths, paired)? The book300k T1 arm keeps queue depth >=12h with y241+y242 and asks whether sampling still helps after a life where the step fires (compare directionally to y242 greedy@300k on k 2944-2951). If neither policy beats greedy on distinct4 / nonSpace, generation needs a new idea (anti-repeat / larger prime), not more learning length.',
  arms: [
    ['v47 greedy', V47, ['g30'], 6],
    ['v47 T1', V47, ['g30t1'], 6],
    ['v47 gate margin0.2', V47m, ['g30'], 6],
    ['v47 T1', V47, ['g300t1'], 6],
  ] }));
let tot = 0; for (const j of J) { tot += j.slotHours; console.log(j.id.padEnd(36), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'est', j.estHours, 'pri', j.priority, 'memGB', j.memGB); }
console.log('total slot-h', tot.toFixed(1));
