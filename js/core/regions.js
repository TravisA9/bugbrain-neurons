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
  const spec = makeSpec({ inputs: ins, outputs: R.outputs ? envSpec.outputs : [], classes: envSpec.classes, tagNames: envSpec.tagNames, juvenile });
  spec.key += '|region ' + R.name; return { spec, map };
}
const inhib = (g, i) => { const n = g.N; for (let b = 0; b < n; b++) if (g.W[i * n + b] < 0) return true; return false; };   // a cell with an inhibitory synapse
function growRegions(d, opts) {
  opts = opts || {};
  if (d.areal && !opts.noAreal) return growAreal(d, opts);
  const t0 = nowMs(), envSpec = opts.spec || currentEnv().spec, seed = opts.seed != null ? opts.seed : (d.seed || 1);
  const parts = d.regions.map((R, k) => { const { spec, map } = regionSpec(envSpec, R);
    const g = growCell(R.g, { spec, seed: (seed + 7919 * k) >>> 0, record: !!opts.record }); return { R, spec, map, g }; });
  const nIn = envSpec.nIn, nOut = envSpec.nOut, outPart = parts.find(p => p.R.outputs) || parts[0];
  let off = nIn; for (const p of parts) { p.off = off; off += p.g.nHid; }
  const nHid = off - nIn, G = createNetGenome(nIn, nHid, nOut), N = G.N;
  const node = (p, i) => i < p.g.nIn ? (typeof p.map[i] === 'number' ? p.map[i] : -1) : i < p.g.nIn + p.g.nHid ? p.off + i - p.g.nIn : (p === outPart ? nIn + nHid + i - p.g.nIn - p.g.nHid : -1);
  G.pos = new Array(N); G.cellType = new Int16Array(N); G.region = new Uint8Array(N); G.topo = new Float32Array(N).fill(NaN);
  for (let i = 0; i < nIn; i++) { G.pos[i] = envSpec.inputs[i].pos; G.cellType[i] = envSpec.inputs[i].cls; G.region[i] = 255; }
  for (let m = 0; m < nOut; m++) { const i = nIn + nHid + m; G.pos[i] = envSpec.outputs[m].pos; G.cellType[i] = envSpec.outputs[m].cls; G.region[i] = parts.indexOf(outPart); }
  parts.forEach((p, k) => { const g = p.g, n = g.N, dx = (k - parts.indexOf(outPart)) * 2.3;   // display: regions side by side
    for (let i = g.nIn; i < g.nIn + g.nHid; i++) { const b = node(p, i); G.pos[b] = [g.pos[i][0] + dx, g.pos[i][1]]; G.cellType[b] = g.cellType[i]; G.region[b] = k;
      G.thresh[b] = g.thresh[i]; G.leak[b] = g.leak[i]; if (g.topo) G.topo[b] = g.topo[i];
      if (g.slow && g.slow[i]) { G.slow = G.slow || new Uint8Array(N); G.slow[b] = 1; } if (g.mix && g.mix[i]) { G.mix = G.mix || new Uint8Array(N); G.mix[b] = 1; } }
    if (p === outPart) for (let m = 0; m < nOut; m++) { const b = nIn + nHid + m, i = g.nIn + g.nHid + m; G.thresh[b] = g.thresh[i]; G.leak[b] = g.leak[i]; }
    for (let a = 0; a < n; a++) { const A = node(p, a), tr = a < g.nIn && typeof p.map[a] !== 'number' ? p.map[a] : null;
      for (let b = 0; b < n; b++) { const w = g.W[a * n + b]; if (!w) continue; const B = node(p, b); if (B < 0) continue;
        if (tr) { (p.arrivals = p.arrivals || []).push([tr.tract, tr.label, B, w]); continue; }
        if (A < 0) continue; const q = A * N + B; G.W[q] += w; if (g.P[a * n + b]) G.P[q] = 1; if (g.C[a * n + b]) G.C[q] = g.C[a * n + b]; } } });
  // tracts
  const tractStats = [];
  for (const T of d.tracts || []) {
    const src = parts[T.from.region], dst = parts[T.to.region], cols = new Map();
    for (let i = src.g.nIn; i < src.g.nIn + src.g.nHid; i++) if (src.g.cellType[i] === N_FIXED + T.from.cls && !(T.map === 'all' && inhib(src.g, i))) {   // 'all': excitatory sources only
 const b = node(src, i), l = src.g.topo ? src.g.topo[i] : NaN; if (isNaN(l)) { if (T.map !== 'all') continue; l = 0; }
      const key = Math.round(l * 1e4); if (!cols.has(key)) cols.set(key, []); cols.get(key).push(b); }
    let nSyn = 0;
    if (T.map === 'topo') {
      for (const [name, label, B, w] of dst.arrivals || []) { if (name !== T.to.tract) continue; const S = cols.get(Math.round(label * 1e4)); if (!S || !S.length) continue;
        const ws = w * (T.gain || 1) / S.length; for (const A of S) { G.W[A * N + B] += ws; nSyn++; } }
    } else if (T.map === 'claw') {
      const r = mulberry32((seed ^ 0x51ed27 ^ (T.salt || 0)) >>> 0), keys = [...cols.keys()].sort((a, b) => a - b), tg = [];
      for (let i = dst.g.nIn; i < dst.g.nIn + dst.g.nHid; i++) if (T.to.mix ? dst.g.mix && dst.g.mix[i] : dst.g.cellType[i] === N_FIXED + T.to.cls) tg.push(node(dst, i));
      let order = []; if (keys.length) for (const B of tg) { if (!order.length) { order = keys.slice(); for (let k = order.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [order[k], order[j]] = [order[j], order[k]]; } }
        const S = cols.get(order.pop()); const ws = T.to.w / S.length; for (const A of S) { G.W[A * N + B] += ws; nSyn++; } }   // v25: a mutant whose source region grew no cells of the class gets no tract (it used to throw)
    } else if (T.map === 'all') {   // parallel fibres: every source cell -> every excitatory receiver of the target region, plastic (P = 1)
      const tg = []; for (let i = dst.g.nIn; i < dst.g.nIn + dst.g.nHid; i++) if (dst.g.recv && dst.g.recv[i]) tg.push(node(dst, i));
      const src = [].concat(...cols.values()), pc = T.p || 1, ws = T.to.wTot / Math.max(1, pc * src.length), r = mulberry32((seed ^ 0x2c1b3c6d ^ (T.salt || 0)) >>> 0);   // total weight ~wTot per target
      for (const A of src) for (const B of tg) { if (pc < 1 && r() >= pc) continue; const q = A * N + B; G.W[q] += ws; if (T.plastic) G.P[q] = 1; nSyn++; }   // p < 1: each pair connects with probability p
    }
    tractStats.push({ name: T.name, from: src.R.name, to: dst.R.name, columns: cols.size, synapses: nSyn });
  }
  for (let q = 0; q < G.W.length; q++) if (G.W[q] > params.wMax) G.W[q] = params.wMax;
  const og = outPart.g; G.pl = og.pl; G.nCh = og.nCh; G.ch = og.ch.map(c => Object.assign({}, c));
  G.typeInfo = og.typeInfo; G.fixedNames = og.fixedNames; G.specKey = envSpec.key; G.kind = 'direct'; G.grownFrom = d;
  G.regions = parts.map((p, k) => ({ name: p.R.name, color: p.R.color || ['#6aa9ff', '#f0a050', '#7fd18b', '#d17fd1'][k % 4], nHid: p.g.nHid, off: p.off, outputs: p === outPart, devStats: p.g.devStats }));
  G.outRegion = parts.indexOf(outPart);
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
  let on = d.regions.map((R, k) => e[k] >= 0.5); if (!on.some(x => x)) on = e.map(x => x === Math.max(...e));
  let own = -1; d.regions.forEach((R, k) => { if (on[k] && R.outputs && (own < 0 || e[k] > e[own])) own = k; });
  const idx = []; d.regions.forEach((R, k) => { if (on[k]) idx.push(k); });
  const areas = d.regions.map((R, k) => ({ name: R.name, expr: +e[k].toFixed(3), on: on[k] }));
  let G;
  if (idx.length === 1 && d.regions[idx[0]].whole) {
    G = growCell(d.regions[idx[0]].g, opts);
  } else {
    const sub = { kind: 'regions', label: d.label, seed: d.seed,
      regions: idx.map(k => Object.assign({}, d.regions[k], { outputs: k === own })),
      tracts: (d.tracts || []).filter(T => on[T.from.region] && on[T.to.region]).map(T => { const t = JSON.parse(JSON.stringify(T)); t.from.region = idx.indexOf(T.from.region); t.to.region = idx.indexOf(T.to.region); return t; }) };
    G = growRegions(sub, Object.assign({}, opts, { noAreal: true }));
  }
  G.grownFrom = d; G.areas = areas; G.devStats.areas = areas.filter(a => a.on).map(a => a.name).join('+');
  return G;
}
function cloneRegions(d) {
  return { kind: 'regions', label: d.label || '', seed: d.seed, fitness: null, tracts: JSON.parse(JSON.stringify(d.tracts || [])),
           regions: d.regions.map(R => Object.assign({ name: R.name, color: R.color, inputs: JSON.parse(JSON.stringify(R.inputs)), outputs: !!R.outputs, g: cloneCell(R.g) }, R.area ? { area: Object.assign({}, R.area) } : {}, R.whole ? { whole: true } : {})),
           ...(d.areal ? { areal: 1 } : {}) };
}
function regionsOf(d) { return d && d.kind === 'regions' ? d.regions : null; }
Object.assign(SpikingArena, { arealSignals, areaExpr, growAreal, cloneRegions, growRegions, regionSpec, regionsOf });
