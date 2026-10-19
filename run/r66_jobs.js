// R66: shared-queue jobs z08-z10 (node run/r66_jobs.js <outdir>): validation of the event-driven fast engine (params.fastEngine = 1,
// js/core/net.js initFastE) against the exact engine, paired by growth on FRESH growth seeds k 1100-1115 (never used before; z01-z03 use 1000-1015).
// Growth is identical in both arms (the engines differ only in the lifetime dynamics), so every pair differs by the engine alone.
// Pass rule (Travis, R66): no task worse beyond noise in the paired per-growth comparison (mean diff, win / loss, paired t) -> fastEngine 1 becomes the default.
// `requires` lists this file so a worker on older code skips these jobs until it self-updates.
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'run/r66_jobs.js'];
const out = process.argv[2] || 'jobs_r66'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
const FAB4 = JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: 4000, readIn: 0.01 } });
const ORD3 = JSON.stringify({ env: 'seq', params: { source: 'order3', K: 8, readIn: 0.01 } });
const TXT = JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
// est-minutes per growth on the r62 scale at 1x, exact engine (fast: ~0.6x of that life)
const MIN = { b10: 1.5, b30: 4.5, f4: 0.8, o3: 0.5, t1: 0.3, sc: 0.5 };
const S4 = 'sc.grid=120,sc.maxCells=13600,sc.coneSpeed=6,sc.axonLen=80', FAST = 'P.fastEngine=1';
const FRESH = [1100, 1104, 1108, 1112];
function job(id, o) {
  const runs = []; let min = 0;
  for (const a of o.arms) { const G = a.G || 4; for (const g0 of (a.g0s || o.g0s || FRESH)) { runs.push({ script: 'run/r42.js', args: [a.plan || 'deepURSx3', a.task, String(G), a.variant || 'base', String(g0), '--force'], label: `${a.lbl} g${g0} n${G}`, env: { BB_OUT: `results/phone/${id}.jsonl` } }); min += G * (a.cost || 1) * (MIN[a.n] || 2); } }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(min / 60 / 1.4).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const pair = (task, n, lbl, x) => { x = x || {}; const v = x.v ? x.v + ',' : '', c = x.cost || 1;
  return [{ task, n, cost: c, variant: x.v || 'base', lbl: `${lbl} exact` }, { task, n, cost: c * (x.fc || 0.7), variant: v + FAST, lbl: `${lbl} fast` }]; };
const J = [];
const T1 = [[book(10000), 'b10', 'book10k'], [book(30000), 'b30', 'book30k'], [FAB4, 'f4', 'fables4000'], [ORD3, 'o3', 'order3'], [TXT, 't1', 'text1000'], [SC('order2'), 'sc', 'seqchoice order2'], [SC('cycle'), 'sc', 'seqchoice cycle']];
const NOTE = 'paired by growth seed (exact vs fast engine, same grown brain): per task mean diff, win / loss, paired t over 16 growths (z08a + z08b; z09a + z09b); wallMs per run gives the speedup on the worker';
for (const [id, g0s] of [['z08a_fast_valid_1x', [1100, 1104]], ['z08b_fast_valid_1x', [1108, 1112]]])
  J.push(job(id, { q: 'I84', pri: 0.975, g0s, title: `Fast engine validation at 1x (growths k ${g0s[0]}-${g0s[1] + 3}): exact vs fast on book10k / 30k, fables4000, order3, text1000, seqchoice order2 / cycle`, note: NOTE, arms: [].concat(...T1.map(([t, n, l]) => pair(t, n, 'v37 ' + l))) }));
for (const [id, g0s] of [['z09a_fast_valid_4xS_book10k', [1100, 1104]], ['z09b_fast_valid_4xS_book10k', [1108, 1112]]])
  J.push(job(id, { q: 'I84', pri: 0.974, g0s, title: `Fast engine validation at 4xS on book10k (growths k ${g0s[0]}-${g0s[1] + 3}): exact vs fast`, note: NOTE, arms: pair(book(10000), 'b10', 'v37 4xS book10k', { v: S4, cost: 17 }) }));
J.push(job('z10_fast_valid_4xS_tasks', { q: 'I84', pri: 0.95, g0s: [1100, 1104], title: 'Fast engine at 4xS on the other tasks (growths k 1100-1107): exact vs fast on fables4000, order3, text1000, seqchoice order2 / cycle', note: 'coverage beyond book10k at 4xS (8 growths): the striatum dopamine path (seqchoice) and the small tasks under the large brain', arms: [].concat(...T1.slice(2).map(([t, n, l]) => pair(t, n, 'v37 4xS ' + l, { v: S4, cost: 17 }))) }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} est ${j.estHours} h`).join('\n'));
console.log('total est', J.reduce((a, j) => a + j.estHours, 0).toFixed(1), 'h');
