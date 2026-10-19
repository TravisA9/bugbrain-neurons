// R65: shared-queue jobs z01-z09 (node run/r65_jobs.js <outdir>).
// Needs R65 code: r42.js accepts g0 >= 64 (fresh seeds), reports wallMs and drops the dense growth matrices; the output gate gene
// (pl.outGate / outGateMode) and staged maturation (pl.stageF0 / stageWaves / stageTicks) exist. `requires` lists this file so a worker on
// older code skips these jobs until it self-updates.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/envs/book.js', 'run/r65_jobs.js'];
const out = process.argv[2] || 'jobs_r65'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
const FAB4 = x => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'fables', nSyms: 4000, readIn: 0.01 }, x || {}) });
const ORD3 = x => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'order3', K: 8, readIn: 0.01 }, x || {}) });
const TXT = x => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'text', nSyms: 1000, readIn: 0.01 }, x || {}) });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
// est-minutes per growth on the r62 scale at 1x (real workers ~3-4x faster; R65 engine ~1.4x (1x) / ~1.8x (4xS life) faster again)
const MIN = { b10: 1.5, b30: 4.5, b100: 15, f4: 0.8, o3: 0.5, t1: 0.3, sc: 0.5, gen30: 5 };
const S4 = 'sc.grid=120,sc.maxCells=13600,sc.coneSpeed=6,sc.axonLen=80';
const FRESH = [1000, 1004, 1008, 1012];   // growth / arena seeds VAL_GROW_SEED + k, VAL_SEED + k, k = 1000..1015: never used by any earlier eval (all of 0..63 were)
function job(id, o) {
  const runs = [], g0s = o.g0s || [0, 4, 8, 12]; let min = 0;
  for (const a of o.arms) { const G = a.G || 4; for (const g0 of (a.g0s || g0s)) { runs.push({ script: a.script || o.script || 'run/r42.js', args: [a.plan || 'deepURSx3', a.task, String(G), a.variant || 'base', String(g0), '--force'], label: `${a.lbl} g${g0} n${G}`, env: { BB_OUT: `results/phone/${id}.jsonl` } }); min += G * (a.cost || 1) * (MIN[a.n] || 2); } }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(min / 60 / 1.4).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const J = [];
// ---- (4) cumulative check: v34 / v36 / v37 on brand-new growth seeds ----
const cumul = (plan, lbl, v34) => { const ri = v34 ? { readIn: 0 } : {};   // v34 had no graded decoder (readIn 0); v36 / v37 use the seq default 0.01
  return [{ plan, task: book(10000, ri), n: 'b10', lbl: lbl + ' book10k' }, { plan, task: book(30000, ri), n: 'b30', lbl: lbl + ' book30k' }, { plan, task: FAB4(ri), n: 'f4', lbl: lbl + ' fables4000' },
    { plan, task: ORD3(ri), n: 'o3', lbl: lbl + ' order3' }, { plan, task: TXT(ri), n: 't1', lbl: lbl + ' text1000' }, { plan, task: SC('order2'), n: 'sc', lbl: lbl + ' seqchoice order2' }, { plan, task: SC('cycle'), n: 'sc', lbl: lbl + ' seqchoice cycle' }]; };
for (const [id, plan, lbl, v34] of [['z01_cumul_v37', 'deepURSx3', 'v37', false], ['z02_cumul_v36', 'deepURSx3v36', 'v36', false], ['z03_cumul_v34', 'deepURSx3v34', 'v34', true]])
  J.push(job(id, { q: 'Q38', pri: 0.968, g0s: FRESH, title: `Cumulative check on FRESH growth seeds (k 1000-1015, never used before): ${lbl} on book10k / 30k, fables4000, order3, text1000, seqchoice order2 / cycle`, note: 'z01-z03 together: are the stacked v34 -> v36 -> v37 gains real on growths no decision ever saw? paired by growth seed across the three jobs', arms: cumul(plan, lbl, v34) }));
// ---- (3) staged maturation toward 4xS vs 4xS from scratch (book30k; scratch 16-growth accuracy is y03a/b; timing reference here) ----
const STA = 'pl.stageF0=0.33,pl.stageWaves=2,pl.stageTicks=110000', STB = 'pl.stageF0=0.25,pl.stageWaves=3,pl.stageTicks=66000';
J.push(job('z04_staged4xS_book30k', { q: 'I82', pri: 0.958, title: 'Staged maturation at 4xS on book30k: 1/3 of the neurons mature at birth, +1/3 at 10k and 20k chars (A) / 1/4, +1/4 every 6k chars (B), growths 0-15', note: 'vs y03a/b v37 4xS book30k (from scratch, same growths) and x04 1x; wall time (registry wallMs) vs the scratch arm of z05', arms: [{ variant: S4 + ',' + STA, task: book(30000), n: 'b30', cost: 12, lbl: 'v37 4xS staged A book30k' }, { variant: S4 + ',' + STB, task: book(30000), n: 'b30', cost: 12, lbl: 'v37 4xS staged B book30k' }] }));
J.push(job('z05_staged_timing_ref', { q: 'I82', pri: 0.957, g0s: [0], title: 'Timing reference for z04 on the same worker: v37 4xS book30k from scratch (growths 0-3) + staged A (growths 0-3)', note: 'wallMs per run (registry): staged vs scratch on one machine; scores must equal y03a (scratch) and z04 (staged) exactly', arms: [{ variant: S4, task: book(30000), n: 'b30', cost: 17, lbl: 'v37 4xS scratch book30k' }, { variant: S4 + ',' + STA, task: book(30000), n: 'b30', cost: 12, lbl: 'v37 4xS staged A book30k' }] }));
// ---- (2) confidence gate: generation + teacher-forced coverage / precision (filled in after the box screen; see RESULTS R65) ----
const GEN = (x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: 30000, evalSyms: 2000, genSyms: 500 }, x || {}) });
J.push(job('z06_gate_gen_book30k', { q: 'I81', pri: 0.952, script: 'run/gen.js', title: 'Confidence-gated generation after a 30k life (1x, 16 growths): greedy / sampled T1 / gate share 0.5 / gate margin 0.2 / gate 0.4 + T0.7', note: 'gen quality: wordValid, distinct4, topCharFrac, nonSpace, triBits; teacher-forced gateCov / gatePrec. Learning is identical in every arm (1x book: no dopamine-learning synapses), so heldAcc must be equal across arms',
  arms: [{ task: GEN(), n: 'gen30', lbl: 'v37 gen greedy' }, { task: GEN({ genTemp: 1 }), n: 'gen30', lbl: 'v37 gen T1' }, { task: GEN(), variant: 'pl.outGate=0.5', n: 'gen30', lbl: 'v37 gen gate0.5' }, { task: GEN(), variant: 'pl.outGate=0.2,pl.outGateMode=1', n: 'gen30', lbl: 'v37 gen gate margin0.2' }, { task: GEN({ genTemp: 0.7 }), variant: 'pl.outGate=0.4', n: 'gen30', lbl: 'v37 gen gate0.4 T0.7' }] }));
J.push(job('z07_gate_4xS_book30k', { q: 'I81', pri: 0.951, g0s: [0, 4], title: 'Output gate on the 4xS brain (striatum dopamine learning present at 4xS: abstentions change its outcome signal): book30k, gate 0.5 / margin 0.2, growths 0-7', note: 'vs y03a v37 4xS book30k: does abstaining (no reward / punishment when unconfident) change held-out accuracy? plus gateCov / gatePrec', arms: [{ variant: S4 + ',pl.outGate=0.5', task: book(30000), n: 'b30', cost: 17, lbl: 'v37 4xS gate0.5 book30k' }, { variant: S4 + ',pl.outGate=0.2,pl.outGateMode=1', task: book(30000), n: 'b30', cost: 17, lbl: 'v37 4xS gate margin0.2 book30k' }] }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} est ${j.estHours} h`).join('\n'));
console.log('total est', J.reduce((a, j) => a + j.estHours, 0).toFixed(1), 'h');
