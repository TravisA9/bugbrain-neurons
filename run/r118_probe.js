// R118 (I107): brain held-out accuracy vs an offline linear probe of the brain's OWN hidden states, in one life, same split.
//   node run/r118_probe.js <plan> '<task json: seq/book with evalSyms (+ genSyms)>' <k> [variant k=v,...] [trainSlots=20000] [epochs=4]
// Life, seeds and variant parsing exactly as run/gen.js / run/r42.js (growth k = VAL_GROW_SEED + k, arena VAL_SEED + k).
// During the teacher-forced life the hidden cells' spikes are recorded per symbol slot (binary: spiked in the slot). After the life:
//   brainHeld   = the brain's own accuracy on the held-out slots (t >= heldFrom; = task heldAcc up to the boundary slot)
//   probe.<grp> = softmax regression (AdaGrad, L2 1e-4, as run/r62_ana.js) on the binary states of a cell group, fit on the last
//                 trainSlots TRAIN slots, scored on the SAME held-out slots; target = next symbol.
// With genSyms > 0 the brain then free-runs (learning frozen) and gen.js' sample stats are reported (distinct4, wordValid, triBits, ...).
// BB_DUMP=<base>: also writes <base>.off/.ix/.json (per-slot active hidden cells, seq, hits, granule mask) for run/r118_sweep.js.
const L = require('./lib.js'), SA = L.SA;
const [plan, tj, kS, variant = 'base', TS = 20000, EP = 4] = process.argv.slice(2), k = +kS, task = Object.assign({ name: 'r118' }, JSON.parse(tj));
const gc = L.serialize(L.startGenome(plan)), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base') for (const kv of variant.split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = isNaN(+v) ? v : +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const B = SA.book, A = B.ALPHA, KA = A.length, IDX = new Map(A.map((c, i) => [c, i])), TR = B.TRAIN;
const tri = new Float64Array(KA * KA * KA), bi = new Float64Array(KA * KA);
for (let i = 2; i < TR.length; i++) { const a = IDX.get(TR[i - 2]), b = IDX.get(TR[i - 1]), c = IDX.get(TR[i]); tri[(a * KA + b) * KA + c]++; bi[a * KA + b]++; }
const triBits = s => { let bits = 0, n = 0; for (let i = 2; i < s.length; i++) { const a = IDX.get(s[i - 2]), b = IDX.get(s[i - 1]), c = IDX.get(s[i]); bits -= Math.log2((tri[(a * KA + b) * KA + c] + 0.5) / (bi[a * KA + b] + 0.5 * KA)); n++; } return n ? bits / n : 0; };
const vocab = new Set(TR.split(/[ .]+/).filter(Boolean));
function metrics(s) { const words = s.split(/[ .]+/).slice(1, -1).filter(Boolean), wv = words.length ? words.filter(w => vocab.has(w)).length / words.length : 0;
  const g4 = []; for (let i = 0; i + 4 <= s.length; i++) g4.push(s.slice(i, i + 4));
  const sp = A.indexOf(' '); let ns = 0; for (const c of s) if (c !== ' ') ns++;
  return { wordValid: wv, words: words.length, distinct4: g4.length ? new Set(g4).size / g4.length : 0, triBits: triBits(s), nonSpace: s.length ? ns / s.length : 0 }; }
const T0 = Date.now(), p = L.seedPlan({ valGrowths: Math.max(64, k + 1), valArenas: Math.max(64, k + 1) }, 0, true), env = L.setupTask(task), nS = env.P.nSyms;
const g = L.deserialize(gc).g, brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(L.deserialize(gc).g, p.arenaSeeds[k], brain, env); L.dropDense(brain);
// R120 BB_ABL='<preType>><postType>:<scale>[:region]' (box diagnostic, not a core flag): scale the grown weights of every synapse from hidden cells of
// cellType preType to hidden cells of cellType postType (same region, optional region index) before the life, e.g. 21>17:0 = cut tag-5 -> symbol cells.
const ABL = { n: 0, w: 0 }; if (process.env.BB_ABL) { const [pp, sc, rg] = process.env.BB_ABL.split(':'), [ta, tb] = pp.split('>').map(Number), n = a.net, R = brain.region;
  for (let i = brain.nIn; i < brain.nIn + brain.nHid; i++) { if (brain.cellType[i] !== ta || (rg != null && R[i] !== +rg)) continue; for (let q = n.start[i]; q < n.start[i + 1]; q++) { const j = n.posts[q]; if (j < brain.nIn + brain.nHid && brain.cellType[j] === tb && R[j] === R[i]) { ABL.n++; ABL.w += n.ws[q]; n.ws[q] *= +sc; n.w0[q] *= +sc; } } } }
const nIn = brain.nIn, nH = brain.nHid, o0 = nIn + nH, T = a.task, cnt = new Uint8Array(nH), S = [];
const hook = n => { const sp = n.spk; for (let s = 0; s < n.nSpk; s++) { const i = sp[s]; if (i >= nIn && i < o0) cnt[i - nIn] = 1; } };
let lastPos = T.pos; const tGrow = Date.now() - T0;
const was = SA.params.plasticity;
try { while (!a.done && T.pos < nS) { a.tick(hook); if (T.pos !== lastPos) { lastPos = T.pos; let na = 0; for (let i = 0; i < nH; i++) if (cnt[i]) na++; const c = new Int32Array(na); let q = 0; for (let i = 0; i < nH; i++) if (cnt[i]) c[q++] = i; S.push(c); cnt.fill(0); } }
  if (!process.env.BB_GEN_LEARN) SA.params.plasticity = false; while (!a.done) a.tick(); } finally { SA.params.plasticity = was; }
const tLife = Date.now() - T0 - tGrow, seq = T.seq, hits = T.hits, hf = T.heldFrom, held = [], tr = [];
for (let t = 2; t < Math.min(S.length, nS) - 1; t++) (t >= hf ? held : tr).push(t);
function gran0() { const gg = new Uint8Array(nH); for (let i = 0; i < nH; i++) if (brain.gran && brain.gran[nIn + i]) gg[i] = 1; return gg; }
const trL = tr.slice(-+TS), acc = (xs, f) => xs.filter(f).length / xs.length, K = T.K;
const fit = sel => { const W = new Float32Array(nH * K), G2 = new Float32Array(nH * K).fill(1e-6), b = new Float32Array(K), z = new Float32Array(K), lr = 0.5;
  for (let ep = 0; ep < +EP; ep++) for (let q = 0; q < trL.length; q++) { const t = trL[(q * 7919 + ep * 104729) % trL.length], c = S[t], y = seq[t + 1];
    z.set(b); for (const i of c) if (sel[i]) { const r = i * K; for (let j = 0; j < K; j++) z[j] += W[r + j]; }
    let m = -1e9; for (let j = 0; j < K; j++) if (z[j] > m) m = z[j]; let s = 0; for (let j = 0; j < K; j++) { z[j] = Math.exp(z[j] - m); s += z[j]; }
    for (let j = 0; j < K; j++) { const gk = z[j] / s - (j === y ? 1 : 0); b[j] -= 0.05 * gk; z[j] = gk; }
    for (const i of c) if (sel[i]) { const r = i * K; for (let j = 0; j < K; j++) { const gg = z[j] + 1e-4 * W[r + j]; G2[r + j] += gg * gg; W[r + j] -= lr * gg / Math.sqrt(G2[r + j]); } } }
  const pr = t => { z.set(b); for (const i of S[t]) if (sel[i]) { const r = i * K; for (let j = 0; j < K; j++) z[j] += W[r + j]; } let bk = 0; for (let j = 1; j < K; j++) if (z[j] > z[bk]) bk = j; return bk; };
  return { held: +acc(held, t => pr(t) === seq[t + 1]).toFixed(4), trainLast2k: +acc(tr.slice(-2000), t => pr(t) === seq[t + 1]).toFixed(4), cells: sel.reduce((x, y) => x + y, 0) }; };
if (process.env.BB_DUMP) { const fs = require('fs'), tot = S.reduce((x, c) => x + c.length, 0), off = new Uint32Array(S.length + 1), ix = new Uint16Array(tot); let o = 0; S.forEach((c, t) => { off[t] = o; ix.set(c, o); o += c.length; }); off[S.length] = o;
  fs.writeFileSync(process.env.BB_DUMP + '.off', Buffer.from(off.buffer)); fs.writeFileSync(process.env.BB_DUMP + '.ix', Buffer.from(ix.buffer));
  fs.writeFileSync(process.env.BB_DUMP + '.json', JSON.stringify({ nH, K, hf, nS, seq: Array.from(seq.slice(0, S.length + 1)), hits: Array.from(hits.slice(0, S.length)), gran: Array.from(gran0()) })); }
const gran = new Uint8Array(nH), all = new Uint8Array(nH).fill(1), nonGran = new Uint8Array(nH); for (let i = 0; i < nH; i++) { if (brain.gran && brain.gran[nIn + i]) gran[i] = 1; else nonGran[i] = 1; }
const probe = { all: fit(all), granules: fit(gran), nonGranule: fit(nonGran) };
const rate = new Float64Array(nH); for (const c of S) for (const i of c) rate[i]++; for (let i = 0; i < nH; i++) rate[i] /= S.length || 1;
const dense = {}; for (let i = 0; i < nH; i++) { if (gran[i]) continue; const n = nIn + i, rg = brain.regions && brain.regions[brain.region[n]] ? brain.regions[brain.region[n]].name : brain.region[n], ty = brain.typeInfo && brain.typeInfo[brain.cellType[n]] ? brain.typeInfo[brain.cellType[n]].label.replace(/^tag | cells$/g, '') : brain.cellType[n];
  const key = rg + '/' + ty + (brain.slow && brain.slow[n] ? '/slow' : ''), d = dense[key] || (dense[key] = { n: 0, gt50: 0, mean: 0 }); d.n++; if (rate[i] > 0.5) d.gt50++; d.mean += rate[i]; }
for (const d of Object.values(dense)) d.mean = +(d.mean / d.n).toFixed(3);
const text = T.gen.map(i => A[i]).join(''), st = T.stats();
const OUT = { plan, task: tj, variant, k, heldAcc: +st.heldAcc.toFixed(4), brainHeld: +acc(held, t => hits[t]).toFixed(4), trainAcc: +(st.trainAcc || 0).toFixed(4), heldSlots: held.length, probeTrainSlots: trL.length,
  probe, gen: text.length ? Object.assign(metrics(text), { sample: text.slice(0, 160) }) : null, nHid: nH, meanActive: +(S.reduce((x, c) => x + c.length, 0) / S.length).toFixed(1),
  growS: +(tGrow / 1000).toFixed(1), lifeS: +(tLife / 1000).toFixed(1), totalS: +((Date.now() - T0) / 1000).toFixed(1), rssMB: Math.round(process.memoryUsage().rss / 1e6), dense, abl: process.env.BB_ABL ? Object.assign({ spec: process.env.BB_ABL }, ABL) : undefined, denseCeil: a.net && a.net.denseStats ? a.net.denseStats() : null, gu: a.net && a.net.granUtilityStats ? a.net.granUtilityStats() : null, hot: a.net && a.net.gu && a.net.gu.xc ? Array.from(a.net.gu.xc, (n, j) => [j, n]).sort((x, y) => y[1] - x[1]).slice(0, 20).map(([j, n]) => ({ j, n, key: a.net.gu.keyBy[j] })) : null };
console.log(JSON.stringify(OUT));
