// node sw/fibdiag.js <k> <variant> <tag> [nSyms]: R126 mechanism probe. Static afferent classes of context cells (after normE/normI = net.ws at birth)
// + a short book life with per-class drive, leaky-integrated drive/threshold and spike rate of context cells -> sw/out/fd_<tag>_<k>.json
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag, nS] = process.argv.slice(2), k = +k0;
const tj = { env: 'seq', params: { source: 'book', nSyms: +(nS || 1000), evalSyms: 200 } }, task = Object.assign({ name: 'r42' }, tj);
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], brain, env), net = a.net, G = net.g, N = net.N;
const nIn = G.nIn, h1 = G.nIn + G.nHid, reg = G.region, gr = G.gran, names = (brain.regions || []).map((r, i) => r.name || 'r' + i);
const colS = new Int16Array(N).fill(-1), colC = new Int32Array(N).fill(-1), src = net.gu.src;
src.forEach((S, s) => { for (let c = 0; c < S.keys.length; c++) for (let q = S.off[c]; q < S.off[c + 1]; q++) { const id = S.cells[q]; if (id >= 0 && id < N) { colS[id] = s; colC[id] = c; } } });
const keyOf = (s, c) => String(src[s].keys[c]);
const srcReg = src.map(S => { const m = {}; for (const id of S.cells) if (id >= 0) m[names[reg[id]]] = (m[names[reg[id]]] || 0) + 1; return m; });
// class of edge a -> q (q a context-region cell)
const CL = ['env', 'sameCol', 'otherColSameSrc', 'prevSrcSameLetter', 'prevSrcOtherLetter', 'otherColCell', 'inRegionNonCol', 'tractNonCol', 'gran'];
function cls(a, q) { if (a < nIn) return 'env'; if (gr && gr[a]) return 'gran'; const sa = colS[a], sq = colS[q];
  if (sa >= 0 && sq >= 0) { if (sa === sq) return colC[a] === colC[q] ? 'sameCol' : 'otherColSameSrc'; if (sa === sq - 1 || (sq === 1 && sa === 0)) return keyOf(sa, colC[a]) === keyOf(sq, colC[q]) ? 'prevSrcSameLetter' : 'prevSrcOtherLetter'; return 'otherColCell'; }
  if (sa >= 0) return 'otherColCell'; return reg[a] === reg[q] ? 'inRegionNonCol' : 'tractNonCol'; }
const isCtx = q => q >= nIn && q < h1 && !(gr && gr[q]);
const grp = q => (colS[q] > 0 ? 'lag' : colS[q] === 0 ? 'src0' : 'nonCol') + '|' + names[reg[q]];
const th = net.thr || G.thresh, leak = SA.params.leak;
// static
const st = {}, eCls = new Int8Array(net.posts.length).fill(-1);
for (let i = 0; i < N; i++) for (let e = net.start[i]; e < net.start[i + 1]; e++) { const q = net.posts[e]; if (!isCtx(q)) continue; const c = CL.indexOf(cls(i, q)); eCls[e] = c;
  const key = grp(q), o = st[key] || (st[key] = { n: 0, cls: {} }); const w = net.ws[e], z = o.cls[CL[c]] || (o.cls[CL[c]] = { nE: 0, wE: 0, nI: 0, wI: 0 }); if (w > 0) { z.nE++; z.wE += w; } else if (w < 0) { z.nI++; z.wI -= w; } }
const cnt = {}; for (let q = nIn; q < h1; q++) if (isCtx(q)) cnt[grp(q)] = (cnt[grp(q)] || 0) + 1;
for (const k2 in st) { const o = st[k2], n = cnt[k2]; o.n = n; let thS = 0, m = 0; for (let q = nIn; q < h1; q++) if (isCtx(q) && grp(q) === k2) { thS += th[q]; m++; } o.meanThrAboveRest = +(thS / m + 70).toFixed(3);
  for (const c in o.cls) { const z = o.cls[c]; o.cls[c] = { nE: +(z.nE / n).toFixed(2), wE: +(z.wE / n).toFixed(3), nI: +(z.nI / n).toFixed(2), wI: +(z.wI / n).toFixed(3), wEper: z.nE ? +(z.wE / z.nE).toFixed(3) : 0 }; } }
// edge list for pruned-set comparison (pre post w at birth, context posts only)
const edges = []; for (let i = 0; i < N; i++) for (let e = net.start[i]; e < net.start[i + 1]; e++) if (eCls[e] >= 0 && net.ws[e] !== 0) edges.push([i, net.posts[e], +net.ws[e].toFixed(4), eCls[e]]);
// life: per-class drive into context cells, leaky drive estimate u (no reset model: u resets on the cell's own spike), spikes
const D = {}, u = new Float64Array(N), pk = new Float64Array(N), nearT = new Float64Array(N), fires = new Float64Array(N); let subs = 0;
const dE = new Float64Array(N * CL.length), dI = new Float64Array(N), dX = new Float64Array(N);
const st0 = net.step.bind(net);
net.step = function () { st0(); subs++; const spk = net.spk, n = net.nSpk, ws = net.ws, posts = net.posts, start = net.start, sp = net.spiked;
  for (let s = 0; s < n; s++) { const i = spk[s]; if (isCtx(i)) { fires[i]++; } for (let e = start[i]; e < start[i + 1]; e++) { const c = eCls[e]; if (c < 0) continue; const q = posts[e], w = ws[e]; if (w > 0) dE[q * CL.length + c] += w; else dI[q] -= w; u[q] += w; } }
  for (let q = nIn; q < h1; q++) if (isCtx(q)) { const x = net.ext[q] || 0; dX[q] += x; u[q] += x; const r = u[q] / Math.max(1e-6, th[q] + 70); if (r > pk[q]) pk[q] = r; if (r > 0.5) nearT[q]++; if (sp[q]) u[q] = 0; else u[q] *= leak; } };
const CS = process.env.BB_COLSTAT ? src.map(S => Array.from(S.keys, () => ({ act: 0, frac: 0, runs: 0, runLen: 0, cur: 0 }))) : null, colN = src.map(S => Array.from(S.keys, (_, c) => S.off[c + 1] - S.off[c])), seen = new Uint8Array(N), touched = []; let nWin = 0;
if (CS) { const st1 = net.step; net.step = function () { st1(); const spk = net.spk, n = net.nSpk; for (let s = 0; s < n; s++) { const i = spk[s]; if (colS[i] >= 0 && !seen[i]) { seen[i] = 1; touched.push(i); } } }; }
const winEnd = () => { nWin++; const cnt = src.map(S => new Int32Array(S.keys.length)); for (const i of touched) { cnt[colS[i]][colC[i]]++; seen[i] = 0; } touched.length = 0;
  cnt.forEach((A, s) => A.forEach((k, c) => { const o = CS[s][c]; if (k > 0) { o.act++; o.frac += k / colN[s][c]; o.cur++; } else if (o.cur) { o.runs++; o.runLen += o.cur; o.cur = 0; } })); };
if (CS) { const r0 = net.guExactReset.bind(net); net.guExactReset = function () { winEnd(); return r0(); }; }   // window = granule read window (input onset)
const t0 = Date.now(); while (!a.done) a.tick();
if (CS) { const o = CS.map((A, s) => { let act = 0, fr = 0, runs = 0, rl = 0; A.forEach(x => { act += x.act; fr += x.frac; runs += x.runs; rl += x.runLen; }); return { cols: A.length, colSize: +(colN[s].reduce((x, y) => x + y, 0) / A.length).toFixed(1), activeColsPerWin: +(act / nWin).toFixed(3), fracCellsWhenActive: +(fr / Math.max(1, act)).toFixed(3), meanRunTicks: +(rl / Math.max(1, runs)).toFixed(2), top: A.map((x, c) => [String(src[s].keys[c]), +(x.act / nWin).toFixed(3), +(x.runLen / Math.max(1, x.runs)).toFixed(1)]).sort((u, v) => v[1] - u[1]).slice(0, 3) }; });
  const pc = {}; for (let q = nIn; q < h1; q++) if (colS[q] > 0) { const key = colS[q] + ':' + keyOf(colS[q], colC[q]), o2 = pc[key] || (pc[key] = { n: 0, rate: 0, rec: 0, I: 0 }); o2.n++; o2.rate += fires[q] / subs; o2.rec += dE[q * CL.length + 1] / subs; o2.I += dI[q] / subs; }
  for (const kk in pc) { const o2 = pc[kk]; o2.rate = +(o2.rate / o2.n).toFixed(4); o2.rec = +(o2.rec / o2.n).toFixed(3); o2.I = +(o2.I / o2.n).toFixed(4); o2.IperSpike = +(o2.I / Math.max(1e-9, o2.rate)).toFixed(2); }
  const intOf = {}; for (let i = nIn; i < h1; i++) for (let e = net.start[i]; e < net.start[i + 1]; e++) { const q = net.posts[e]; if (colS[q] > 0 && net.w0[e] < 0) { const key = colS[q] + ':' + keyOf(colS[q], colC[q]); (intOf[key] = intOf[key] || new Set()).add(i); } }
  const thr0 = G.thresh, thrN = net.thr || G.thresh; for (const kk in pc) { const S2 = [...(intOf[kk] || [])]; pc[kk].ints = S2.length; if (S2.length) { let f2 = 0, dt = 0, inE = 0; for (const i of S2) { f2 += fires[i] / subs; dt += thrN[i] - thr0[i]; } pc[kk].intRate = +(f2 / S2.length).toFixed(4); pc[kk].intThrShift = +(dt / S2.length).toFixed(2); } }
  o.forEach(x => { x.pc = {}; }); for (const kk in pc) { const s2 = +kk.split(':')[0]; if (o[s2].top.some(t => s2 + ':' + t[0] === kk) || kk.endsWith(':-4400') || kk.endsWith(':6000')) o[s2].pc[kk] = pc[kk]; }
  fs.writeFileSync(`sw/out/fc_${tag}_${k}.json`, JSON.stringify({ nWin, src: o })); console.error('COLSTAT', JSON.stringify(o)); }
const S = a.task.stats ? a.task.stats() : {}, life = {};
for (let q = nIn; q < h1; q++) if (isCtx(q)) { const key = grp(q), o = life[key] || (life[key] = { n: 0, rate: 0, pk: [], near: 0, dE: {}, dI: 0 }); o.n++; o.rate += fires[q] / subs; o.pk.push(pk[q]); o.near += nearT[q] / subs; o.dI += dI[q] / subs; o.dX = (o.dX || 0) + dX[q] / subs;
  CL.forEach((c, j) => { const x = dE[q * CL.length + j]; if (x) o.dE[c] = (o.dE[c] || 0) + x / subs; }); }
for (const k2 in life) { const o = life[k2]; o.rate = +(o.rate / o.n).toExponential(3); o.near = +(o.near / o.n).toExponential(3); o.dI = +(o.dI / o.n).toExponential(3); o.dX = +(o.dX / o.n).toExponential(3); for (const c in o.dE) o.dE[c] = +(o.dE[c] / o.n).toExponential(3);
  o.pk.sort((x, y) => x - y); const P = f => +o.pk[Math.min(o.pk.length - 1, Math.floor(f * o.pk.length))].toFixed(3); o.pk = { p10: P(.1), p50: P(.5), p90: P(.9), max: P(.999), fracOver1: +(o.pk.filter(x => x >= 1).length / o.pk.length).toFixed(3) }; }
const out = { k, tag, variant, heldAcc: S.heldAcc, N, subs, leak, Vrest: -70, srcReg, static: st, life, sec: (Date.now() - t0) / 1000 };
fs.writeFileSync(`sw/out/fd_${tag}_${k}.json`, JSON.stringify(out)); fs.writeFileSync(`sw/out/fde_${tag}_${k}.json`, JSON.stringify(edges));
console.log(JSON.stringify(out));
