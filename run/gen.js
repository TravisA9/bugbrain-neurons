// R60 (priority e, I72): free-running generation on the book corpus.
//   node run/gen.js <plan> '<task json: seq/book with genSyms>' [growths] [variant k=v,...] [g0]
// Each growth lives the task's life (nSyms symbols of TRAIN, the last evalSyms of them from HELD = teacher-forced held-out accuracy),
// then learning is frozen (params.plasticity = false) and the brain free-runs genSyms symbols: its predicted next character is fed
// back as the next input. Sample quality: train-vocabulary word rate, distinct 4-grams, copying (share of sample 8 / 16-grams found
// verbatim in TRAIN, longest copied run), and bits/char of the sample under a trigram model of TRAIN (vs real HELD text of the same length).
// BB_GEN_LEARN=1 keeps learning on while free-running; task param genTemp > 0 samples instead of winner-take-all.
// Prints one JSON line like run/r42.js (mean = teacher-forced held-out fitness) plus gen stats and the samples; recorded in the registry.
const L = require('./lib.js'), SA = L.SA;
const [plan, tj, G = 4, variant = 'base', g0 = 0] = process.argv.slice(2), task = Object.assign({ name: 'gen' }, JSON.parse(tj));
if (task.params.source !== 'book' || !(task.params.genSyms > 0)) throw new Error('gen.js needs a seq task with source book and genSyms > 0');
const gc = L.serialize(L.startGenome(plan)), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base') for (const kv of variant.split(',')) { const [k0, v] = kv.split('='), [k, sel] = k0.split('@'), [s, f] = k.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }   // R63: s.f@sel=v targets regions by name prefix (sel 'cortex', 'context', '!striatum'); no @ = every region
const B = SA.book, A = B.ALPHA, K = A.length, IDX = new Map(A.map((c, i) => [c, i])), TR = B.TRAIN;
const tri = new Float64Array(K * K * K), bi = new Float64Array(K * K);
for (let i = 2; i < TR.length; i++) { const a = IDX.get(TR[i - 2]), b = IDX.get(TR[i - 1]), c = IDX.get(TR[i]); tri[(a * K + b) * K + c]++; bi[a * K + b]++; }
const triBits = s => { let bits = 0, n = 0; for (let i = 2; i < s.length; i++) { const a = IDX.get(s[i - 2]), b = IDX.get(s[i - 1]), c = IDX.get(s[i]); bits -= Math.log2((tri[(a * K + b) * K + c] + 0.5) / (bi[a * K + b] + 0.5 * K)); n++; } return n ? bits / n : 0; };
const vocab = new Set(TR.split(/[ .]+/).filter(Boolean));
function metrics(s) {
  const words = s.split(/[ .]+/).slice(1, -1).filter(Boolean), wv = words.length ? words.filter(w => vocab.has(w)).length / words.length : 0;
  const ng = n => { const a = []; for (let i = 0; i + n <= s.length; i++) a.push(s.slice(i, i + n)); return a; };
  const g4 = ng(4), d4 = g4.length ? new Set(g4).size / g4.length : 0;
  const cp = n => { const a = ng(n); return a.length ? a.filter(x => TR.includes(x)).length / a.length : 0; };
  let longest = 0; for (let i = 0; i < s.length; i++) while (i + longest + 1 <= s.length && TR.includes(s.slice(i, i + longest + 1))) longest++;
  const top = Math.max(...A.map(c => s.split(c).length - 1)) / Math.max(1, s.length);
  return { wordValid: wv, words: words.length, distinct4: d4, copy8: cp(8), copy16: cp(16), longestCopy: longest, triBits: triBits(s), topCharFrac: top };
}
const p = L.seedPlan({ valGrowths: 64, valArenas: 64 }, 0, true), scores = [], st = {}, samples = [];
const env = L.setupTask(task), nS = env.P.nSyms, nG = env.P.genSyms;
for (let k = +g0; k < +g0 + +G; k++) {
  const brain = SA.growCell(L.deserialize(gc).g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(L.deserialize(gc).g, p.arenaSeeds[k], brain, env);
  const was = SA.params.plasticity;
  try { while (!a.done && a.task.pos < nS) a.tick(); if (!process.env.BB_GEN_LEARN) SA.params.plasticity = false; while (!a.done) a.tick(); } finally { SA.params.plasticity = was; }
  const T = a.task, text = T.gen.map(i => A[i]).join(''), prime = T.seq.slice(Math.max(0, nS - 80), nS + 1).map(i => A[i]).join('');
  const hp = (k * 7919 * 13) % (B.HELD.length - nG), ref = B.HELD.slice(hp, hp + nG);
  const m = Object.assign(metrics(text), { refTriBits: triBits(ref), refWordValid: metrics(ref).wordValid, genConf: T.gen.length ? T.genConf / T.gen.length : 0 });
  const s0 = T.stats(); for (const q of ['heldAcc', 'heldBitsCount', 'trainAcc', 'idealOnline']) m[q] = s0[q];
  scores.push(a.fitness); for (const q in m) st[q] = (st[q] || 0) + m[q] / G; st.hidden = (st.hidden || 0) + brain.nHid / G;
  samples.push({ g: k, prime, text: text.slice(0, 600) }); }
const mean = scores.reduce((x, y) => x + y, 0) / scores.length, sd = Math.sqrt(scores.reduce((x, y) => x + (y - mean) ** 2, 0) / scores.length);
for (const q in st) st[q] = +st[q].toFixed(4);
const OUT = { plan, task: tj, variant, G: +G, g0: +g0, mean: +mean.toFixed(3), sd: +sd.toFixed(3), scores: scores.map(x => +x.toFixed(2)), stats: st, samples };
if (process.env.BB_OUT) { const fs = require('fs'), path = require('path'), f = path.resolve(process.env.BB_OUT); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, JSON.stringify(Object.assign({ at: new Date().toISOString(), defaults: SA.DEFAULTS_VERSION }, OUT)) + '\n'); }
try { const REG = require('./registry.js'); REG.record(REG.describeAblation(plan, tj, variant + '|gen g0=' + g0, G, null, SA.DEFAULTS_VERSION), { status: 'finished', result: OUT }); } catch (e) {}
console.log(JSON.stringify(OUT));
