// R64: shared-queue jobs y01-y05 (node run/r64_jobs.js <outdir>) and the v36 pinning of the still-pending R63 jobs
// (node run/r64_jobs.js --pin <queue jobs dir> <ids...>).
// R64 adopted v37 (deepURSx3 = v36 plan + cortex lr 0.1, DEFAULTS_VERSION 30). The pending R63 jobs x12-x19 were written for v36
// (plan 'deepURSx3' = v36 at the time) and are compared with v36 references (w13, x00, w18, w25, w26), so --pin rewrites them to the
// kept plan deepURSx3v36 (same meaning as written) and adds this file to `requires` (a worker that still runs v36 code skips them
// until it self-updates, so no pending job can silently change meaning). --pin also splits multi-growth runs of the long single-run
// jobs (x14-x17) into 1-growth runs with the same growth seeds (r42/gen use growSeeds[k], k = g0..g0+G-1: identical results, run in parallel).
// New jobs (y*) use plan deepURSx3 = v37. v37 reference on the 5-task screen = the pl.lr=0.1 arm of x04 (bit-identical to v37 on seq tasks:
// only the cortex taught cells have plastic synapses there; box check R64: order3 / text1000 / book1.5k g3 equal to x04).
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/envs/book.js', 'run/r64_jobs.js'];
if (process.argv[2] === '--pin') {
  const dir = process.argv[3], ids = process.argv.slice(4), SPLIT = /^x1[4-7]/;
  // R64 re-ranking: size pays (x01 / x02), so the size x life-length points move up; x19 (v36 sizes on the gate tasks) is mostly
  // superseded by y03 / y05 (the same question under v37) and becomes a filler.
  const PRI = { x17a_size4xS_book100k: 0.965, x17b_size4xS_book100k: 0.965, x16a_size2xS_book100k: 0.945, x16b_size2xS_book100k: 0.945, x19_sizeS_gate_tasks: 0.85 };
  for (const id of ids) { const f = path.join(dir, id + '.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.requires = Array.from(new Set((j.requires || []).concat(['run/r64_jobs.js'])));
    const runs = [];
    for (const r of j.runs) { if (r.args[0] === 'deepURSx3') r.args[0] = 'deepURSx3v36';
      const G = +r.args[2], g0 = +r.args[4];
      if (SPLIT.test(id) && G > 1) for (let k = g0; k < g0 + G; k++) { const a = r.args.slice(); a[2] = '1'; a[4] = String(k); runs.push(Object.assign({}, r, { args: a, label: r.label.replace(/ g\d+ n\d+$/, '') + ` g${k} n1` })); }
      else runs.push(r); }
    if (PRI[id] != null) j.priority = PRI[id];
    j.runs = runs; j.pinned = 'R64: plan deepURSx3v36 (v36 as written; the default became v37)';
    j.title = j.title.replace(/under v36/, 'under v36 (pinned)');
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); console.log('pinned', id, runs.length, 'runs'); }
  process.exit(0); }
const out = process.argv[2] || 'jobs_r64'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
const FAB4 = JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: 4000, readIn: 0.01 } });
const ORD3 = JSON.stringify({ env: 'seq', params: { source: 'order3', K: 8, readIn: 0.01 } }), TXT = JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });   // = w26 / x12 task strings
// est-minutes per growth on the r62 scale at 1x. R63/R64 real: 1x many-run jobs ~3x (tacobell) / ~4.4x (linux-pc) faster than this scale;
// 4xS costs ~17x a 1x growth (not 4x): x01a/b took 2.1-2.2 h for 4 runs of 4 growths (book10k + 30k) on either worker.
const MIN = { b10: 1.5, b30: 4.5, b100: 15, f4: 0.8, o3: 0.5, t1: 0.3, sc: 0.5 };
const S2 = 'sc.grid=85,sc.maxCells=6800,sc.coneSpeed=4,sc.axonLen=57', S4 = 'sc.grid=120,sc.maxCells=13600,sc.coneSpeed=6,sc.axonLen=80';
function job(id, o) {   // o: {title, q, pri, note, arms: [{plan, variant, task, n, lbl, cost, g0s, G}], g0s, script}
  const runs = [], g0s = o.g0s || [0, 4, 8, 12]; let min = 0;
  for (const a of o.arms) { const G = a.G || 4; for (const g0 of (a.g0s || g0s)) { runs.push({ script: o.script || 'run/r42.js', args: [a.plan || 'deepURSx3', a.task, String(G), a.variant || 'base', String(g0), '--force'], label: `${a.lbl} g${g0} n${G}`, env: { BB_OUT: `results/phone/${id}.jsonl` } }); min += G * (a.cost || 1) * (MIN[a.n] || 2); } }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(min / 60).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const screen = (variant, lbl, x) => [{ variant, task: book(30000), n: 'b30', lbl: lbl + ' book30k' }, { variant, task: book(10000), n: 'b10', lbl: lbl + ' book10k' },
  { variant, task: FAB4, n: 'f4', lbl: lbl + ' fables4000' }, { variant, task: ORD3, n: 'o3', lbl: lbl + ' order3' }, { variant, task: TXT, n: 't1', lbl: lbl + ' text1000' }].map(a => Object.assign(a, x || {}));
const J = [];
// (seqchoice safety of v37 was answered on the box in R64: cortex lr changes nothing there, striatum predErr 0.3 = v35 exactly; no job)
// --- does the rate keep paying above 0.1? (cortex only; on seq tasks = global) ---
J.push(job('y02_v37_lr_up', { q: 'I77', pri: 0.975, title: 'Learning rule (5-task screen, 16 growths) on v37: cortex lr 0.2 / 0.15 (v37 0.1, v36 0.05)', note: 'vs x04 pl.lr=0.1 arm (= v37); x04: 0.05 -> 0.1 won all 5 tasks, 0.025 lost all 5', arms: ['pl.lr@cortex=0.2', 'pl.lr@cortex=0.15'].flatMap(v => screen(v, 'v37 ' + v.replace('pl.', ''))) }));
// --- size x rule: the combined confirmation (v37 at 4xS on all 5 gate tasks) ---
for (const [s, g0s] of [['a', [0, 4]], ['b', [8, 12]]]) J.push(job('y03' + s + '_v37_4xS_screen', { q: 'I78', pri: 0.97, g0s, title: `v37 at size 4x (scaled wiring) on the 5-task screen, growths ${g0s[0]}-${g0s[1] + 3}`, note: 'vs v37 1x (x04 lr 0.1 arm) and v36 4xS (x01 book, x19 gate tasks): does the size gain (+0.030 / +0.036 book under v36) add to the rule gain, with no task worse?', arms: screen(S4, 'v37 4xS', { cost: 17 }) }));
// --- combinations on v37 with the two other one-sided-safe knobs of R64 ---
J.push(job('y04_v37_plateau6_metaCap100', { q: 'I77', pri: 0.955, title: 'Learning rule (5-task screen) on v37: plateau 6 (x10: +0.001..+0.006 on all 5 tasks under v36) / metaCap 100 (x05: book +0.006 / +0.008, order3 -0.005) / metaN 80 (x18: book +0.008 / +0.010, fables +0.008, order3 -0.010)', note: 'vs x04 pl.lr=0.1 arm (= v37); adoption-ready if both book tasks win and no task is worse; do the consolidation knobs still add on top of the faster rate?', arms: ['pl.plateau@cortex=6', 'pl.metaCap@cortex=100', 'pl.metaN@cortex=80'].flatMap(v => screen(v, 'v37 ' + v.replace('pl.', ''))) }));
// --- 2xS on v37 (cheap size point: 70% of the 4xS gain at ~1/6 of its cost under v36) ---
J.push(job('y05_v37_2xS_screen', { q: 'I78', pri: 0.95, title: 'v37 at size 2x (scaled wiring) on the 5-task screen, growths 0-15', note: 'vs v37 1x (x04 lr 0.1); 2xS may be the screening size for rule work if the gain carries over', arms: screen(S2, 'v37 2xS', { cost: 2.5 }) }));
// --- credited presynaptic trace of the teacher rule (tauPre 12; never screened under v36 / v37) ---
J.push(job('y07_v37_tauPre', { q: 'I77', pri: 0.93, title: 'Learning rule (5-task screen) on v37: cortex tauPre 8 / 18 (v37 12)', note: 'vs x04 pl.lr=0.1 arm (= v37); preLag 4 / 12 (x11) were neutral-to-worse', arms: ['pl.tauPre@cortex=8', 'pl.tauPre@cortex=18'].flatMap(v => screen(v, 'v37 ' + v.replace('pl.', ''))) }));
// --- life length under v37 (v36: 10k 0.316 = 30k 0.313 = 100k 0.314); a faster rate could plateau sooner or keep climbing ---
J.push(job('y06_v37_book100k', { q: 'I73', pri: 0.89, title: 'v37 1x at a 100k life, growths 0-15 (1-growth runs)', note: 'vs x04 lr 0.1 book 10k / 30k (= v37) and w18 (v36 100k 0.314)', arms: [{ task: book(100000), n: 'b100', G: 1, lbl: 'v37 book100k', g0s: Array.from({ length: 16 }, (_, k) => k) }] }));
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} est ${j.estHours} h`).join('\n'));
console.log('total est', J.reduce((a, j) => a + j.estHours, 0).toFixed(1), 'h');
