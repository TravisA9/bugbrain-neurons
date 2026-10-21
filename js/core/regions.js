/* =====================================================================
 * regions.js (v21, round 22) — MULTI-REGION BRAINS: several tissues (regions), each grown by its own gene program,
 * linked by long-range TRACTS.
 *
 * A region genome is { kind: 'regions', label, regions: [...], tracts: [...] }:
 *   region = { name, color, g: <cell genome>, inputs: [rule...], outputs: true|false }
 *     input rules build the region's own sensory surface (its local IO spec):
 *       { env: '<env input group>', tag? }   the env's channels of that group, address tag remapped (tag) or kept
 *       { tract: '<name>', like: '<env group>', tag }   one placeholder channel per channel of that env group (same
 *             positions / column labels): the arrival zone of a tract from another region
 *     outputs: true = this region carries the env's outputs (motor / prediction region); one region per brain.
 *   tract  = { name, from: { region, cls }, map: 'topo' | 'claw', to: ... }
 *     'topo' (to: { region, tract: name }): every neuron of class cls (address-tag class) in the source region projects,
 *             column by column (its topographic label), to the cells that the placeholder channel with the same
 *             label contacted during growth; the placeholder's synapse weight is shared by the source cells.
 *     'all' (to: { region, wTot }, plastic): every source cell -> every excitatory plastic receiver of the target region
 *             (parallel fibres), each pair with probability p (default 1), total weight ~wTot per target, plastic synapses.
 *     'claw' (to: { region, mix: true, w }): every MIXING cell of the target region keeps the axons of ONE source column
 *             (balanced over columns, random order), total weight w: a long-range input to the association layer.
 * Growth: each region grows on its own tissue (its own morphogens, bands and cell types; its own juvenile phase); the
 * tracts are then laid between the grown regions (axon pathfinding between tissues is not simulated cell by cell:
 * the tract rule says which population projects where, and the map says how the axons choose their targets).
 * The result is one ordinary network (one SpikingNet; env inputs and outputs keep their indices) with a region id per
 * neuron (g.region) for the viewer. Plasticity genes / dopamine channels: those of the output region.
 * ===================================================================== */
'use strict';
function regionSpec(envSpec, R) {
  const E = envSpec.inputs, ins = [], map = [];          // map[local input] = env input index, or { tract, label }
  for (const rule of R.inputs) {
    if (rule.env) E.forEach((c, i) => { if (c.group === rule.env) { ins.push(Object.assign({}, c, rule.tag != null ? { tag: rule.tag } : {})); map.push(i); } });
    else if (rule.tract) E.forEach((c, i) => { if (c.group === rule.like) { ins.push(Object.assign({}, c, { name: rule.tract + '_' + c.name, group: rule.tract, tag: rule.tag })); map.push({ tract: rule.tract, label: c.topo }); } });
  }
  const J = envSpec.juvenile, loc = i => map.indexOf(i);
  const waves = ins.map((c, i) => i).filter(i => ins[i].cue || ins[i].topo != null);
  const juvenile = { waves: [waves], waveGain: J.waveGain, tonic: (J.tonic || []).map(([i, v]) => [loc(i), v]).filter(t => t[0] >= 0),
                     kicks: J.kicks ? Object.assign({}, J.kicks, { chans: ins.map((c, i) => i).filter(i => !ins[i].tonic && ins[i].diffuse) }) : null };
  if (juvenile.kicks && !juvenile.kicks.chans.length) juvenile.kicks = null;
  const spec = makeSpec({ inputs: ins, outputs: (R.outputs || R.vote) ? envSpec.outputs : [], classes: envSpec.classes, tagNames: envSpec.tagNames, juvenile });
  spec.key += '|region ' + R.name; return { spec, map };
}
/* R66 SPARSE MERGE: the merged brain's synapses are collected as contributions (pre, post, weight, plastic flag, channel) and
 * merged in (pre, post) order, contributions to one pair summed in their original order with float32 rounding: exactly the values
 * the dense N x N matrices held (G.W[q] += w), without allocating them (4xS: 0.84 GB). G.sp = { pre, post, w, p, c } (sorted,
 * non-zero weights); G.W / G.P / G.C stay readable: the dense matrices are built on first access (viewer, export, need-growth). */
class SynAcc {
  constructor(n) { this.n = 0; this.a = new Int32Array(n); this.b = new Int32Array(n); this.w = new Float64Array(n); this.p = new Uint8Array(n); this.c = new Uint8Array(n); }
  grow() { const m = this.a.length * 2; for (const k of ['a', 'b', 'w', 'p', 'c']) { const o = this[k], x = new o.constructor(m); x.set(o); this[k] = x; } }
  add(a, b, w, p, c) { if (this.n === this.a.length) this.grow(); const k = this.n++; this.a[k] = a; this.b[k] = b; this.w[k] = w; this.p[k] = p; this.c[k] = c; }
  finish(N, wMax) {                         // stable LSD radix (by post, then by pre) -> merge equal pairs in insertion order
    const n = this.n, A = this.a, B = this.b, cnt = new Int32Array(N + 1), t = new Int32Array(n), o = new Int32Array(n);
    for (let k = 0; k < n; k++) cnt[B[k] + 1]++; for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
    for (let k = 0; k < n; k++) t[cnt[B[k]]++] = k;
    cnt.fill(0); for (let k = 0; k < n; k++) cnt[A[k] + 1]++; for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
    for (let q = 0; q < n; q++) { const k = t[q]; o[cnt[A[k]]++] = k; }
    const pre = new Int32Array(n), post = new Int32Array(n), w = new Float32Array(n), p = new Uint8Array(n), c = new Uint8Array(n), f = Math.fround, wM = f(wMax);
    let m = 0;
    for (let q = 0; q < n;) { const k0 = o[q], a = A[k0], b = B[k0]; let x = 0, pl = 0, ch = 0;
      for (; q < n && A[o[q]] === a && B[o[q]] === b; q++) { const k = o[q]; x = f(x + this.w[k]); if (this.p[k]) pl = 1; if (this.c[k]) ch = this.c[k]; }
      if (x > wMax) x = wM;
      if (x !== 0) { pre[m] = a; post[m] = b; w[m] = x; p[m] = pl; c[m] = ch; m++; } }
    return { pre: pre.slice(0, m), post: post.slice(0, m), w: w.slice(0, m), p: p.slice(0, m), c: c.slice(0, m) };
  }
}
function gcHint() { const B = globalThis.Bun; if (B && B.gc) B.gc(true); else if (typeof globalThis.gc === 'function') globalThis.gc(); }   // R66: collect growth garbage between regions (lower peak RSS; results unaffected)
function attachSparse(G, sp) {              // G.W / P / C: dense on first read (or null once dropped)
  Object.defineProperty(G, 'sp', { value: sp, writable: true, configurable: true, enumerable: false });
  const M = { W: null, P: null, C: null, done: false };
  const mat = () => { if (M.done) return; M.done = true; const S = G.sp; if (!S) return; const N = G.N;
    M.W = new Float32Array(N * N); M.P = new Uint8Array(N * N); M.C = new Uint8Array(N * N);
    for (let k = 0; k < S.pre.length; k++) { const q = S.pre[k] * N + S.post[k]; M.W[q] = S.w[k]; M.P[q] = S.p[k]; M.C[q] = S.c[k]; } };
  for (const key of ['W', 'P', 'C']) Object.defineProperty(G, key, { enumerable: true, configurable: true,
    get() { mat(); return M[key]; }, set(v) { M.done = true; M[key] = v; if (v === null) G.sp = null; } });
  return G;
}
function granuleLayer(G, parts, outPart, node, acc, nG, gOff, nIn, nHid, seed) {
  const oi = parts.indexOf(outPart), og = outPart.g, K = Math.max(1, Math.min(3, Math.round(params.granK || 2))), W = params.granW > 0 ? params.granW : 80;
  let mi = -1; for (let i = og.nIn; i < og.nIn + og.nHid; i++) if (og.mix && og.mix[i]) { mi = i; break; }
  const th = params.granThr > 0 ? params.granThr : mi >= 0 ? og.thresh[mi] : 20, lk = mi >= 0 ? og.leak[mi] : 0.9;
  const other = parts.find(p => p !== outPart), srcs = [[outPart, params.granC0 >= 0 ? params.granC0 : 0], [outPart, 2], [other, 2]].slice(0, K);
  const colsOf = ([p, c]) => { const m = new Map(); for (let i = p.g.nIn; i < p.g.nIn + p.g.nHid; i++) if (p.g.cellType[i] === N_FIXED + c && p.g.topo && !isNaN(p.g.topo[i])) { const k = Math.round(p.g.topo[i] * 1e4); if (!m.has(k)) m.set(k, []); m.get(k).push(node(p, i)); } return m; };
  const C = srcs.map(colsOf), r = mulberry32((seed ^ 0x6a7a11) >>> 0);
  G.gran = new Uint8Array(G.N);
  for (let j = 0; j < nG; j++) { const b = gOff + j; G.gran[b] = 1; G.pos[b] = [3 + 0.5 * Math.cos(j), 0.5 + 0.5 * Math.sin(j * 1.7)]; G.cellType[b] = N_FIXED + 15; G.region[b] = oi; G.thresh[b] = th; G.leak[b] = lk;
    for (const m of C) { const keys = [...m.keys()]; if (!keys.length) continue; const S = m.get(keys[(r() * keys.length) | 0]), ws = W / K / S.length; for (const A of S) acc.add(A, b, ws, 0, 0); } }
  // taught prediction cells: cells of the output region with plastic inputs that an env input contacts
  const pl = new Uint8Array(G.N), ins = new Uint8Array(G.N);
  for (let k = 0; k < acc.n; k++) { const b = acc.b[k]; if (b < nIn || b >= nIn + nHid || G.region[b] !== oi) continue; if (acc.p[k]) pl[b] = 1; if (acc.a[k] < nIn && acc.w[k] > 0) ins[b] = 1; }
  const P = []; for (let b = nIn; b < nIn + nHid; b++) if (pl[b] && ins[b] && !G.gran[b]) P.push(b);
  const wo = params.granOut > 0 ? params.granOut : 0.1;
  for (let j = 0; j < nG; j++) for (const b of P) acc.add(gOff + j, b, wo, 1, 0);
  G.granStats = { cells: nG, K, thr: th, pred: P.length };
}
const inhib = (g, i) => { const n = g.N; for (let b = 0; b < n; b++) if (g.W[i * n + b] < 0) return true; return false; };   // a cell with an inhibitory synapse
function growRegions(d, opts) {
  opts = opts || {};
  if (d.areal && !opts.noAreal) return growAreal(d, opts);
  const t0 = nowMs(), envSpec = opts.spec || currentEnv().spec, seed = opts.seed != null ? opts.seed : (d.seed || 1);
  const parts = d.regions.map((R, k) => { const { spec, map } = regionSpec(envSpec, R);
    const g = growCell(R.g, { spec, seed: (seed + 7919 * k) >>> 0, record: !!opts.record }); gcHint(); return { R, spec, map, g }; });
  const nIn = envSpec.nIn, nOut = envSpec.nOut, outPart = parts.find(p => p.R.outputs) || parts[0];
  let off = nIn; for (const p of parts) { p.off = off; off += p.g.nHid; }
  // R80 thinF (global param, bitmask, 0/undefined = off, bit-identical off and at sizeF <= 1; I98): a projection from a region grown f x keeps
  // each synapse at its 1x strength and thins the connections ~1/f, so receivers get a 1x-like afferent count and synapse strength
  // (instead of f x more synapses each f x weaker). bit 1: 'all' tracts (cortex mixing / M2 / M3 -> striatum): pair probability p / f_src;
  // bit 2: claw / topo tracts (context columns -> mixing, M2 -> context): each target keeps ~S / f of the column's cells at f x weight;
  // bit 4: plastic synapses inside a sized region (C / mixing -> prediction) kept with probability 1 / f at f x strength.
  const thF = params.thinF | 0, hash01 = (a, b, s) => { let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x632be5ab, 0x85ebca6b) ^ (s | 0)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // R83 GRANULE LAYER (global param granN, 0/undefined = off, bit-identical off): a dedicated combination population of granN cells
  // (cerebellar-granule-like), appended after the grown hidden cells. Each granule cell takes a sparse claw: ONE letter column from each of
  // granK sources (the output region's current-symbol memory cells cls 0 = t at read time (granC0), its M2 cells cls 2 = t-1, the first other region's cls 2 = t-2),
  // total weight granW, threshold / leak of a mixing cell (needs the coincidence), its own feedforward inhibition (granInh mV per granule
  // spike onto every granule cell, net.js), and plastic synapses onto every taught prediction cell (normalised like the other plastic inputs).
  const nG = params.granN > 0 && parts.length > 1 && !envSpec.outcome ? Math.round(params.granN) : 0, gOff = off;   // (outcome tasks: no granule layer, like the outcome-repressed context areas)
  const nHid = off - nIn + nG, G = createNetGenome(nIn, nHid, nOut, true), N = G.N, acc = new SynAcc(1 << 16);
  const node = (p, i) => i < p.g.nIn ? (typeof p.map[i] === 'number' ? p.map[i] : -1) : i < p.g.nIn + p.g.nHid ? p.off + i - p.g.nIn : ((p === outPart || p.R.vote) ? nIn + nHid + i - p.g.nIn - p.g.nHid : -1);   // R43 (I53) vote: a module's own output copy sums onto the shared outputs
  G.pos = new Array(N); G.cellType = new Int16Array(N); G.region = new Uint8Array(N); G.topo = new Float32Array(N).fill(NaN);
  for (let i = 0; i < nIn; i++) { G.pos[i] = envSpec.inputs[i].pos; G.cellType[i] = envSpec.inputs[i].cls; G.region[i] = 255; }
  for (let m = 0; m < nOut; m++) { const i = nIn + nHid + m; G.pos[i] = envSpec.outputs[m].pos; G.cellType[i] = envSpec.outputs[m].cls; G.region[i] = parts.indexOf(outPart); }
  parts.forEach((p, k) => { const g = p.g, n = g.N, dx = (k - parts.indexOf(outPart)) * 2.3;   // display: regions side by side
    for (let i = g.nIn; i < g.nIn + g.nHid; i++) { const b = node(p, i); G.pos[b] = [g.pos[i][0] + dx, g.pos[i][1]]; G.cellType[b] = g.cellType[i]; G.region[b] = k;
      G.thresh[b] = g.thresh[i]; G.leak[b] = g.leak[i]; if (g.topo) G.topo[b] = g.topo[i];
      if (g.slow && g.slow[i]) { G.slow = G.slow || new Uint8Array(N); G.slow[b] = 1; } if (g.mix && g.mix[i]) { G.mix = G.mix || new Uint8Array(N); G.mix[b] = 1; } }
    if (p === outPart) for (let m = 0; m < nOut; m++) { const b = nIn + nHid + m, i = g.nIn + g.nHid + m; G.thresh[b] = g.thresh[i]; G.leak[b] = g.leak[i]; }
    const pF = p.R.g && p.R.g.sc ? +p.R.g.sc.sizeF || 1 : 1;
    for (let a = 0; a < n; a++) { const A = node(p, a), tr = a < g.nIn && typeof p.map[a] !== 'number' ? p.map[a] : null;
      for (let b = 0; b < n; b++) { const w = g.W[a * n + b]; if (!w) continue; const B = node(p, b); if (B < 0) continue;
        if (tr) { (p.arrivals = p.arrivals || []).push([tr.tract, tr.label, B, w]); continue; }
        if (A < 0) continue; let wv = w;
        if (thF & 4 && pF > 1 && g.P[a * n + b] && w > 0) { if (hash01(A, B, seed) >= 1 / pF) continue; wv = w * pF; }   // R80 thinF bit 4: plastic in-region synapses of a sized region kept with p 1/f at f x strength
        acc.add(A, B, (p.R.vote && B >= nIn + nHid) ? wv * (p.R.voteScale || 1) : wv, g.P[a * n + b] ? 1 : 0, g.C[a * n + b]); } } });
  // tracts
  const tractStats = [];
  for (const T of d.tracts || []) {
    const src = parts[T.from.region], dst = parts[T.to.region], cols = new Map();
    for (let i = src.g.nIn; i < src.g.nIn + src.g.nHid; i++) if ((T.from.mix ? !!(src.g.mix && src.g.mix[i]) : src.g.cellType[i] === N_FIXED + T.from.cls) && !(T.map === 'all' && inhib(src.g, i))) {   // v30: from.mix = the sparse conjunctive (mixing) cells   // 'all': excitatory sources only
 const b = node(src, i), l = src.g.topo ? src.g.topo[i] : NaN; if (isNaN(l)) { if (T.map !== 'all') continue; l = 0; }
      const key = Math.round(l * 1e4); if (!cols.has(key)) cols.set(key, []); cols.get(key).push(b); }
    let nSyn = 0;
    if (T.map === 'topo') {
      const fT = (thF & 2) && src.R.g && src.R.g.sc && src.R.g.sc.sizeF > 1 ? src.R.g.sc.sizeF : 1;
      for (const [name, label, B, w] of dst.arrivals || []) { if (name !== T.to.tract) continue; const S0 = cols.get(Math.round(label * 1e4)); if (!S0 || !S0.length) continue;
        let S = S0; if (fT > 1) { S = S0.filter(A => hash01(A, B, seed ^ 0x5d) < 1 / fT); if (!S.length) S = [S0[0]]; }
        const ws = w * (T.gain || 1) / S.length; for (const A of S) { acc.add(A, B, ws, 0, 0); nSyn++; } }
    } else if (T.map === 'claw') {
      const r = mulberry32((seed ^ 0x51ed27 ^ (T.salt || 0)) >>> 0), keys = [...cols.keys()].sort((a, b) => a - b), tg = [];
      for (let i = dst.g.nIn; i < dst.g.nIn + dst.g.nHid; i++) if (T.to.mix ? dst.g.mix && dst.g.mix[i] : dst.g.cellType[i] === N_FIXED + T.to.cls) tg.push(node(dst, i));
      let order = []; if (keys.length) for (const B of tg) { if (!order.length) { order = keys.slice(); for (let k = order.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [order[k], order[j]] = [order[j], order[k]]; } }
        const S0 = cols.get(order.pop()), fS = (thF & 2) && src.R.g && src.R.g.sc && src.R.g.sc.sizeF > 1 ? src.R.g.sc.sizeF : 1, S = fS > 1 ? S0.filter(A => hash01(A, B, seed ^ 0x3c) < 1 / fS) : S0; if (!S.length) S.push(S0[0]);
        const cK = T.to.mix && params.clawKeep > 0 && params.clawKeep < 1 ? params.clawKeep : 0;   // R82 clawKeep (global param, 0/undefined = off, bit-identical off): each mixing cell keeps each context claw with probability clawKeep (lower-order conjunctions: fewer delays per mixing cell)
        if (cK && hash01(B, (T.salt || 0) + 7, seed ^ 0x82c1) >= cK) continue;
        const ws = T.to.w * (T.to.mix && params.clawWF > 0 ? params.clawWF : 1) / S.length; for (const A of S) { acc.add(A, B, ws, 0, 0); nSyn++; } }   // R82 clawWF (global, 0/undefined = off): context-claw weight onto mixing cells x clawWF. v25: a mutant whose source region grew no cells of the class gets no tract (it used to throw)
    } else if (T.map === 'all') {   // parallel fibres: every source cell -> every excitatory receiver of the target region, plastic (P = 1)
      const tg = []; for (let i = dst.g.nIn; i < dst.g.nIn + dst.g.nHid; i++) if (dst.g.recv && dst.g.recv[i]) tg.push(node(dst, i));
      // R72 allMax (global param, 0/undefined = off): convergence limit. Each target receives from at most ~allMax source cells (the pair
      // probability falls to allMax / sources when p x sources > allMax), with the weight per synapse of that count: fan-in no longer grows with the source size.
      const src0 = [].concat(...cols.values()), aM = params.allMax > 0 ? params.allMax : 0, fA = (thF & 1) && parts[T.from.region].R.g && parts[T.from.region].R.g.sc && parts[T.from.region].R.g.sc.sizeF > 1 ? parts[T.from.region].R.g.sc.sizeF : 1, pc = (1 / fA) * (aM && (T.p || 1) * src0.length > aM ? aM / src0.length : (T.p || 1)), src = src0, ws = T.to.wTot / Math.max(1, pc * src.length), r = mulberry32((seed ^ 0x2c1b3c6d ^ (T.salt || 0)) >>> 0);   // total weight ~wTot per target
      for (const A of src) for (const B of tg) { if (pc < 1 && r() >= pc) continue; acc.add(A, B, ws, T.plastic ? 1 : 0, 0); nSyn++; }   // p < 1: each pair connects with probability p
    }
    else if (T.map === 'outReset') {   // R43 (I55): the output (prediction) cell named T.from.out inhibits every cell of class T.to.cls of the target region (a predicted word boundary resets it)
      const m = envSpec.outputs.findIndex(o => o.name === T.from.out); if (m >= 0) { const A = nIn + nHid + m;
        for (let i = dst.g.nIn; i < dst.g.nIn + dst.g.nHid; i++) if (dst.g.cellType[i] === N_FIXED + T.to.cls) { acc.add(A, node(dst, i), -T.to.w, 0, 0); nSyn++; } }
    }
    tractStats.push({ name: T.name, from: src.R.name, to: dst.R.name, columns: cols.size, synapses: nSyn });
  }
  if (nG) granuleLayer(G, parts, outPart, node, acc, nG, gOff, nIn, nHid, seed);
  attachSparse(G, acc.finish(N, params.wMax));   // (+ the wMax cap of the old dense merge)
  gcHint();
  const og = outPart.g; G.pl = og.pl; G.nCh = og.nCh; G.ch = og.ch.map(c => Object.assign({}, c));
  G.typeInfo = og.typeInfo; G.fixedNames = og.fixedNames; G.specKey = envSpec.key; G.kind = 'direct'; G.grownFrom = d;
  G.regions = parts.map((p, k) => ({ name: p.R.name, color: p.R.color || ['#6aa9ff', '#f0a050', '#7fd18b', '#d17fd1'][k % 4], nHid: p.g.nHid, off: p.off, outputs: p === outPart, devStats: p.g.devStats }));
  parts.forEach((p, k) => { const f = p.R.g && p.R.g.sc ? p.R.g.sc.sizeF : 0; if (f > 1) G.regions[k].sizeF = f; });   // R73: region size factor kept on the phenotype (trophic scaling)
  G.outRegion = parts.indexOf(outPart);
  { const bn = new Float32Array(N).fill(-1); parts.forEach(p => { if (p.g.born) for (let i = p.g.nIn; i < p.g.nIn + p.g.nHid; i++) bn[node(p, i)] = p.g.born[i]; }); Object.defineProperty(G, 'born', { value: bn, writable: true, configurable: true, enumerable: false }); }   // R65 birth steps (staged maturation)
  G.tracts = tractStats;
  const sum = k => parts.reduce((s, p) => s + (p.g.devStats[k] || 0), 0);
  G.devStats = { cells: sum('cells'), neurons: sum('neurons'), apoptosis: sum('apoptosis'), trophicDeaths: sum('trophicDeaths'), survivors: nHid, orphanOut: outPart.g.devStats.orphanOut, nOut,
                 silentIn: outPart.g.devStats.silentIn, nInUsed: outPart.g.devStats.nInUsed, hungerSyn: 0, demandSyn: outPart.g.devStats.demandSyn || 0, outCov: outPart.g.devStats.outCov, outInMean: outPart.g.devStats.outInMean, cones: outPart.g.devStats.cones, synapses: countSynapses(G), refinePruned: sum('refinePruned'),
                 regions: parts.length, tracts: tractStats, ms: nowMs() - t0 };
  // the viewer: every region's own grown brain + local spec (+ its growth recording with record: true); not enumerable (never saved)
  Object.defineProperty(G, 'regionParts', { value: parts.map((p, k) => ({ name: G.regions[k].name, color: G.regions[k].color, off: p.off, outputs: p === outPart, brain: p.g, spec: p.spec, map: p.map })), enumerable: false });
  return G;
}
/* v29 (R30) AREALIZATION: one genome, the task's I/O decides which areas develop.
 * Two morphogen sources are read off the environment's sensory/modulatory surface:
 *   A ("FGF8-like", anterior): the phase-clock channels (groups go2/go3, a multi-phase rhythmic input that a
 *     sequence task brings): A = share of clock channels per GO channel (0..1);
 *   O ("dopamine source", ventral): the env delivers outcomes (spec.outcome: reward / punishment).
 * Every region carries area receptor genes area = { a, o, b }: its expression e = sigmoid(a*A + o*O + b) (an
 * Emx2/Pax6-like transcription-factor gradient). An area whose expression stays below 0.5 does not develop (its
 * progenitors take another fate); tracts to or from it are not laid. The developing area with the highest expression
 * that can carry outputs owns the env outputs. An area marked whole reads the full sensory sheet: if it develops alone it
 * grows exactly as a single tissue (growCell). The receptor genes mutate with the rest of the genome. */
function arealSignals(spec) {
  const I = spec.inputs, nGo = I.filter(c => c.group === 'go').length, nPh = I.filter(c => c.group === 'go2' || c.group === 'go3').length;
  return { A: nGo ? Math.min(1, nPh / nGo) : (nPh ? 1 : 0), O: spec.outcome ? 1 : 0 };
}
function areaExpr(R, S) { const a = R.area || { a: 0, o: 0, b: 5 }; return 1 / (1 + Math.exp(-(a.a * S.A + a.o * S.O + a.b))); }
function growAreal(d, opts) {
  const envSpec = opts.spec || currentEnv().spec, S = arealSignals(envSpec), e = d.regions.map(R => areaExpr(R, S));
  // v30 (R31) graded arealization (d.graded): an area develops once its expression reaches gMin (gene, default 0.15) and its
  // progenitor pool (maxCells) scales with the expression: size = min(1, e / 0.9) of the full area (fully expressed areas unchanged).
  const gMin = d.graded ? (d.gMin != null ? d.gMin : 0.15) : 0.5;
  let on = d.regions.map((R, k) => e[k] >= gMin); if (!on.some(x => x)) on = e.map(x => x === Math.max(...e));
  const scaled = (R, k) => { if (!d.graded) return R; const f = Math.min(1, e[k] / 0.9); if (f >= 1) return R;
    const g = Object.assign({}, R.g, { sc: Object.assign({}, R.g.sc) }); if (g.sc.maxCells) g.sc.maxCells = Math.max(8, Math.round(g.sc.maxCells * f)); return Object.assign({}, R, { g }); };
  let own = -1; d.regions.forEach((R, k) => { if (on[k] && R.outputs && (own < 0 || e[k] > e[own])) own = k; });
  const idx = []; d.regions.forEach((R, k) => { if (on[k]) idx.push(k); });
  const areas = d.regions.map((R, k) => ({ name: R.name, expr: +e[k].toFixed(3), on: on[k], size: d.graded ? +Math.min(1, e[k] / 0.9).toFixed(3) : 1 }));
  let G;
  if (idx.length === 1 && d.regions[idx[0]].whole) {
    G = growCell(scaled(d.regions[idx[0]], idx[0]).g, opts);
  } else {
    const sub = { kind: 'regions', label: d.label, seed: d.seed,
      regions: idx.map(k => Object.assign({}, scaled(d.regions[k], k), { outputs: k === own })),
      tracts: (d.tracts || []).filter(T => on[T.from.region] && on[T.to.region]).map(T => { const t = JSON.parse(JSON.stringify(T)); t.from.region = idx.indexOf(T.from.region); t.to.region = idx.indexOf(T.to.region); return t; }) };
    G = growRegions(sub, Object.assign({}, opts, { noAreal: true }));
  }
  G.grownFrom = d; G.areas = areas; G.devStats.areas = areas.filter(a => a.on).map(a => a.name).join('+');
  return G;
}
function cloneRegions(d) {
  return { kind: 'regions', label: d.label || '', seed: d.seed, fitness: null, tracts: JSON.parse(JSON.stringify(d.tracts || [])),
           regions: d.regions.map(R => Object.assign({ name: R.name, color: R.color, inputs: JSON.parse(JSON.stringify(R.inputs)), outputs: !!R.outputs, g: cloneCell(R.g) }, R.area ? { area: Object.assign({}, R.area) } : {}, R.whole ? { whole: true } : {})),
           ...(d.areal ? { areal: 1 } : {}), ...(d.graded ? { graded: 1, gMin: d.gMin } : {}) };
}
function regionsOf(d) { return d && d.kind === 'regions' ? d.regions : null; }
Object.assign(SpikingArena, { SynAcc, attachSparse, arealSignals, areaExpr, growAreal, cloneRegions, growRegions, regionSpec, regionsOf });
