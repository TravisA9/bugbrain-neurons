/* =====================================================================
 * ui/devview.js (v18, round 19): GROWTH / WIRING VISUALIZER (browser only, no dependencies).
 * Used by viewer.html (full viewer) and by the Development tab of index.html (compact).
 *
 *   const model = SA.DevModel(brain, spec)      // brain = growCell(genome, { record: true }) (passive recorder)
 *   const tv = new SA.TissueView(canvas, opts)  // timeline renderer of the tissue: morphogens, cells, axons,
 *   tv.setModel(model); tv.setFrame(f);         //   growth cones, synapses (formed / pruned), deaths, labels
 *   const wv = new SA.WiringView(canvas, opts)  // population graph: sensors left, motors right
 *
 * Coordinates: tissue x (left -1..right +1), y (back -1..front +1). On screen the FRONT (sensors) is at the left,
 * the BACK (outputs) at the right and the body midline (x = 0) horizontal: world u = (1 - y) / 2, v = (x + 1) / 2.
 * Rendering: hi-DPI canvas; the morphogen field is a GS x GS image scaled up; synapses are plotted into an
 * offscreen pixel buffer; axons are culled by bounding box and decimated (points closer than ~1.5 px skipped);
 * nothing is redrawn unless the frame, the view, the layers, the selection or the hover changes.
 * ===================================================================== */
(function () {
'use strict';
const SA = window.SpikingArena;
const TAG_COLORS = ['#b8a8e0', '#4cd964', '#ff5a5a', '#ff9f43', '#ffd34d', '#f7f06d', '#ffffff', '#4dd2ff'];
const POP_COLORS = ['#5fb3ff', '#ff9f43', '#4cd964', '#ff5a8a', '#c88cff', '#ffd34d', '#4dd2ff', '#ff6b6b', '#9be37a', '#e0a8ff', '#f7f06d', '#7aa2ff',
  '#ffb38a', '#6ee7c8', '#d0d0d0', '#ff8fd0', '#b0e0ff', '#c8b400', '#8affc1', '#ffa0a0'];
const WHY = ['', 'claw selection (kept one source column)', 'mixing-cell selection (kept mixK inputs)', 'partner died: no sensory afferent', 'partner died: trophic competition', 'Hebbian pruning (juvenile activity)'];
// fate traits read from a cell's final gene outputs (o): [key, label, CO index, threshold, colour]
const TRAITS = [['inh', 'inhibitory', 'INH', 0.5, '#ff5a5a'], ['mix', 'mixing cell', 'MIX', 0.5, '#ff5ad2'], ['claw', 'claw (conjunctive) cell', 'CLAW', 0.5, '#4dd2ff'],
  ['recv', 'receptive (plastic input)', 'RECV', 0.5, '#4cd964'], ['plast', 'plastic axon', 'PLAST', 0.5, '#ffd34d'], ['slow', 'slow membrane (memory)', 'LEAK', 0.1, '#5f8cff'],
  ['topo', 'topographic', 'TOPO', 0.5, null], ['bif', 'bifurcating axon (parallel fibre)', 'BIF', 0.5, null], ['proj', 'projection axon', 'PROJ', 0.5, '#ff9f43'], ['xsyn', 'commissural', 'XSYN', 0.5, null]];
const GENE_OUT = [['divide', 'DIV'], ['die', 'DIE'], ['migrate', 'MIG'], ['axon', 'AXON'], ['emit A', 'EM4'], ['emit B', 'EM5'], ['inhib.', 'INH'], ['threshold', 'THR'], ['plastic', 'PLAST'],
  ['receptive', 'RECV'], ['slow', 'LEAK'], ['topo', 'TOPO'], ['bifurc.', 'BIF'], ['claw', 'CLAW'], ['mix', 'MIX'], ['project.', 'PROJ'], ['commiss.', 'XSYN'], ['branch', 'BRANCH']];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ---------------- model: everything derived from the recorder ---------------- */
function DevModel(brain, spec) {
  if (brain.regionParts) return RegionModel(brain, spec);
  const L = brain.devLog; if (!L || L.v !== 2) throw new Error('no development recording');
  const CO = SA.CO, g = brain, N = g.N, nIn = g.nIn, nHid = g.nHid, nOut = g.nOut;
  const m = { L, brain: g, spec, T: L.T, TT: L.TT, GS: L.GS, H: L.H, cells: L.cells, cones: L.cones, syn: L.syn, stages: L.stages, N, nIn, nHid, nOut };
  const traitsOf = o => TRAITS.filter(t => o[CO[t[2]]] > t[3]).map(t => t[0]);
  for (const c of L.cells) {
    c.from = c.moves.length ? c.moves[0] : 0; c.to = c.died >= 0 ? c.died : Infinity;
    c.traits = traitsOf(c.o); c.cls = SA.cellClass(c.o);
    c.lineage = []; for (let p = c.parent, n = 0; p >= 0 && n < 60; p = L.cells[p].parent, n++) c.lineage.push(p);
  }
  // populations: sensors by group, outputs by group, hidden neurons by fate (tag class + traits); optional column split
  const tagName = k => (spec.tagNames && spec.tagNames[k]) || 'tag ' + k;
  m.popOfNode = new Int32Array(N).fill(-1); m.pops = [];
  const add = (key, name, kind) => { let p = m.pops.find(q => q.key === key); if (!p) { p = { key, name, kind, nodes: [], id: m.pops.length }; m.pops.push(p); } return p; };
  for (let i = 0; i < nIn; i++) { const c = spec.inputs[i], p = add('in:' + c.group, 'sensors ' + c.group, 'in'); p.nodes.push(i); m.popOfNode[i] = p.id; }
  const cellOfNode = i => L.cells[L.nodeCell[i]];
  for (let i = nIn; i < nIn + nHid; i++) { const c = cellOfNode(i), tr = c.traits.filter(t => t !== 'topo' && t !== 'xsyn' && t !== 'bif');
    const p = add('h:' + c.cls + ':' + tr.join(','), tagName(c.cls) + (tr.length ? ' · ' + tr.join(' ') : ''), 'hid'); p.nodes.push(i); m.popOfNode[i] = p.id; c.pop = p.id; }
  for (let k = 0; k < nOut; k++) { const i = nIn + nHid + k, c = spec.outputs[k], p = add('out:' + c.group, 'outputs ' + c.group, 'out'); p.nodes.push(i); m.popOfNode[i] = p.id; }
  // name hidden populations by size order: A, B, C ... (+ description)
  let letter = 0; for (const p of m.pops.filter(p => p.kind === 'hid').sort((a, b) => b.nodes.length - a.nodes.length)) p.short = String.fromCharCode(65 + (letter++ % 26)) + (letter > 26 ? letter : '');
  for (const p of m.pops) { if (!p.short) p.short = p.kind === 'in' ? 'in ' + p.key.slice(3) : 'out ' + p.key.slice(4); p.color = p.kind === 'in' ? '#7fb2ff' : p.kind === 'out' ? '#ffc83c' : POP_COLORS[p.id % POP_COLORS.length];
    let su = 0, sv = 0; for (const i of p.nodes) { const [x, y] = g.pos[i]; su += (1 - y) / 2; sv += (x + 1) / 2; } p.u = su / p.nodes.length; p.v = sv / p.nodes.length; }
  popEdges(m, g);
  // synapse records per cell (pre / post), for the inspector and the highlight
  const S = L.syn, A = S.a; m.synOut = new Map(); m.synIn = new Map();
  for (let k = 0; k < S.n; k++) { const pre = A[k * 7], post = A[k * 7 + 1];
    (m.synOut.get(pre) || m.synOut.set(pre, []).get(pre)).push(k); (m.synIn.get(post) || m.synIn.set(post, []).get(post)).push(k); }
  m.tagName = tagName; m.nodeOfCell = c => c.node;
  m.stageAt = f => { let s = m.stages[0][1]; for (const [t, n] of m.stages) if (f >= t) s = n; return s; };
  return m;
}
// final connectivity per node (W, P): counts for the inspector, population edges for the wiring view
function popEdges(m, g) {
  const N = m.N; m.inCnt = new Int32Array(N); m.outCnt = new Int32Array(N); const pe = new Map(), W = g.W, Pm = g.P;
  for (let a = 0; a < N; a++) { const pa = m.popOfNode[a], r = a * N;
    for (let b = 0; b < N; b++) { const w = W[r + b]; if (w === 0) continue; m.outCnt[a]++; m.inCnt[b]++;
      const key = pa * 4096 + m.popOfNode[b]; let e = pe.get(key); if (!e) { e = { a: pa, b: m.popOfNode[b], n: 0, exc: 0, inh: 0, plast: 0, sw: 0 }; pe.set(key, e); }
      e.n++; e.sw += w; if (w > 0) e.exc++; else e.inh++; if (Pm && Pm[r + b]) e.plast++; } }
  m.popEdges = [...pe.values()];
}
// v21 (round 22) MULTI-REGION brain (core/regions.js): one model per region (its own tissue + growth recording: m.sub[k]) and a
// merged wiring model whose hidden populations are those of the regions (named and grouped by region; tracts = edges between regions)
function RegionModel(g, spec) {
  const R = g.regionParts, sub = R.map(r => DevModel(r.brain, r.spec)), N = g.N, nIn = g.nIn, nHid = g.nHid, nOut = g.nOut;
  const m = { brain: g, spec, N, nIn, nHid, nOut, regions: R, sub, outRegion: g.outRegion, pops: [], popOfNode: new Int32Array(N).fill(-1) };
  const add = (key, name, kind, extra) => { let p = m.pops.find(q => q.key === key); if (!p) { p = Object.assign({ key, name, kind, nodes: [], id: m.pops.length }, extra); m.pops.push(p); } return p; };
  for (let i = 0; i < nIn; i++) { const c = spec.inputs[i], p = add('in:' + c.group, 'sensors ' + c.group, 'in', { short: 'in ' + c.group, color: '#7fb2ff' }); p.nodes.push(i); m.popOfNode[i] = p.id; }
  R.forEach((r, k) => { const s = sub[k], L = s.L, tag = r.name[0].toUpperCase();
    // local node -> merged node: hidden cells shift by the region offset; local outputs are the env outputs (output region only)
    r.local = new Int32Array(s.N).fill(-1); for (let i = 0; i < s.nIn; i++) if (typeof r.map[i] === 'number') r.local[i] = r.map[i];
    for (let i = s.nIn; i < s.nIn + s.nHid; i++) r.local[i] = r.off + i - s.nIn; if (r.outputs) for (let j = 0; j < s.nOut; j++) r.local[s.nIn + s.nHid + j] = nIn + nHid + j;
    for (const sp of s.pops.filter(p => p.kind === 'hid')) { const p = add('r' + k + ':' + sp.key, r.name + ' · ' + sp.name, 'hid', { short: tag + sp.short, color: sp.color, region: k });
      for (const i of sp.nodes) { const b = r.local[i]; p.nodes.push(b); m.popOfNode[b] = p.id; } }
    void L; });
  for (let k = 0; k < nOut; k++) { const i = nIn + nHid + k, c = spec.outputs[k], p = add('out:' + c.group, 'outputs ' + c.group, 'out', { short: 'out ' + c.group, color: '#ffc83c' }); p.nodes.push(i); m.popOfNode[i] = p.id; }
  for (const p of m.pops) { let su = 0, sv = 0; for (const i of p.nodes) { const [x, y] = g.pos[i]; su += (1 - y) / 2; sv += (x + 1) / 2; } p.u = su / p.nodes.length; p.v = sv / p.nodes.length; }
  popEdges(m, g); m.tagName = sub[0].tagName;
  return m;
}
// position / state of a recorded cell at frame f
function cellPos(c, f) { const M = c.moves; let k = 0; while (k + 3 < M.length && M[k + 3] <= f) k += 3; return [M[k + 1], M[k + 2]]; }
function cellState(c, f) { const E = c.ev; let k = 0; while (k + 4 < E.length && E[k + 4] <= f) k += 4; return E.length ? [E[k + 1], E[k + 2], E[k + 3]] : [c.cls, 0, 0]; }
const isAlive = (c, f) => c.moves.length && f >= c.from && f < c.to;

/* ---------------- shared pan / zoom canvas ---------------- */
class PanZoom {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.k = 1; this.ox = 0; this.oy = 0; this.dpr = 1; this.W = 0; this.H = 0; this.dirty = true; this.listeners = {};
    this.world = [0, 0, 1, 1];
    let drag = null;
    canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0015);
      this.zoomAt(mx, my, f); }, { passive: false });
    canvas.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, moved: false }; });
    window.addEventListener('mousemove', e => { if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.moved) { this.ox = drag.ox + dx; this.oy = drag.oy + dy; this.dirty = true; } } });
    window.addEventListener('mouseup', e => { if (drag && !drag.moved && e.target === canvas) { const r = canvas.getBoundingClientRect(); this.emit('click', e.clientX - r.left, e.clientY - r.top, e); } drag = null; });
    canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); if (!drag || !drag.moved) this.emit('hover', e.clientX - r.left, e.clientY - r.top, e); });
    canvas.addEventListener('mouseleave', () => this.emit('hover', -1, -1));
    canvas.addEventListener('dblclick', () => this.fit());
  }
  on(ev, f) { this.listeners[ev] = f; return this; }
  emit(ev, ...a) { if (this.listeners[ev]) this.listeners[ev](...a); }
  zoomAt(mx, my, f) { const k2 = Math.max(0.2 * this.fitK, Math.min(60 * this.fitK, this.k * f)); f = k2 / this.k; this.ox = mx - (mx - this.ox) * f; this.oy = my - (my - this.oy) * f; this.k = k2; this.dirty = true; }
  resize() {   // hi-DPI: backing store = CSS size x devicePixelRatio
    const r = this.cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(50, Math.round(r.width)), h = Math.max(50, Math.round(r.height));
    if (w !== this.W || h !== this.H || dpr !== this.dpr) { const first = !this.W; this.W = w; this.H = h; this.dpr = dpr; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.dirty = true; if (this.m && this.layout) this.layout(); if (first || !this.userView) this.fit(); }
  }
  fit() { const [u0, v0, u1, v1] = this.world, pad = 28, k = Math.min((this.W - 2 * pad) / (u1 - u0), (this.H - 2 * pad) / (v1 - v0));
    this.fitK = k; this.k = k; this.ox = (this.W - k * (u1 + u0)) / 2; this.oy = (this.H - k * (v1 + v0)) / 2; this.dirty = true; }
  sx(u) { return this.ox + u * this.k; } sy(v) { return this.oy + v * this.k; }
  ux(px) { return (px - this.ox) / this.k; } vy(py) { return (py - this.oy) / this.k; }
}

/* ---------------- tissue view ---------------- */
class TissueView extends PanZoom {
  constructor(canvas, opts) {
    super(canvas); this.opts = opts || {}; this.m = null; this.f = 0; this.sel = null; this.hover = null; this.act = null;
    this.layers = Object.assign({ chem: 1, cells: true, axons: true, cones: true, synapses: true, pruned: false, deaths: true, labels: true, sensors: true, colorBy: 'tag' }, this.opts.layers || {});
    this.chemCv = document.createElement('canvas'); this.synCv = document.createElement('canvas'); this.chemKey = '';
    this.on('hover', (x, y) => { const h = x < 0 ? null : this.pick(x, y); if ((h && h.key) !== (this.hover && this.hover.key)) { this.hover = h; this.dirty = true; } if (this.opts.onHover) this.opts.onHover(h, x, y); });
    this.on('click', (x, y) => { const h = this.pick(x, y); this.select(h); });
  }
  setModel(m) { this.m = m; this.sel = null; this.hover = null; this.chemKey = ''; this.baseKey = null; this.f = Math.min(this.f, m.TT - 1); this.world = [0, 0, 1, 1]; this.fit(); }
  setFrame(f) { f = Math.max(0, Math.min(this.m ? this.m.TT - 1 : 0, f)); if (Math.floor(f) !== Math.floor(this.f)) this.dirty = true; this.f = f; }
  setLayer(k, v) { this.layers[k] = v; this.dirty = true; }
  select(h) { this.sel = h; this.dirty = true; if (this.opts.onSelect) this.opts.onSelect(h); }
  selectCell(id) { const c = this.m.cells[id]; this.select(c ? { kind: 'cell', id, key: 'c' + id } : null); }
  selectNode(i) { const m = this.m, cid = m.L.nodeCell[i]; if (i < m.nIn) this.select({ kind: 'in', i, key: 'i' + i }); else if (i >= m.nIn + m.nHid) this.select({ kind: 'out', i: i - m.nIn - m.nHid, key: 'o' + (i - m.nIn - m.nHid) }); else this.selectCell(cid); }
  // world position of a synapse partner code at frame f (cell id >= 0, sensor -1-i, output -1-m for posts)
  prePos(code, f) { if (code >= 0) { const [x, y] = cellPos(this.m.cells[code], f); return [(1 - y) / 2, (x + 1) / 2]; } const c = this.m.spec.inputs[-1 - code]; return [(1 - c.at[1]) / 2, (c.at[0] + 1) / 2]; }
  postPos(code, f) { if (code >= 0) return this.prePos(code, f); const o = this.m.spec.outputs[-1 - code]; return [(1 - o.pos[1]) / 2, (o.pos[0] + 1) / 2]; }
  pick(px, py) {
    const m = this.m; if (!m) return null; const u = this.ux(px), v = this.vy(py), f = Math.floor(this.f), rpx = 9 / this.k;
    let best = null, bd = Infinity;
    const test = (uu, vv, h, r) => { const d = Math.hypot(uu - u, vv - v); if (d < r && d < bd) { bd = d; best = h; } };
    m.spec.inputs.forEach((c, i) => test((1 - c.at[1]) / 2, (c.at[0] + 1) / 2, { kind: 'in', i, key: 'i' + i }, rpx));
    m.spec.outputs.forEach((o, i) => test((1 - o.pos[1]) / 2, (o.pos[0] + 1) / 2, { kind: 'out', i, key: 'o' + i }, rpx));
    const rc = Math.max(0.6 / m.GS, 7 / this.k);
    for (const c of m.cells) { if (!isAlive(c, f) && !(this.layers.deaths && c.died >= 0 && c.died <= f)) continue; const [x, y] = isAlive(c, f) ? cellPos(c, f) : cellPos(c, c.died);
      test((1 - y) / 2, (x + 1) / 2, { kind: 'cell', id: c.id, key: 'c' + c.id }, rc); }
    return best;
  }
  cellColor(c, st) {
    const L = this.layers; if (!st[1]) return '#5b636d';
    if (L.colorBy === 'pop') return c.pop != null ? this.m.pops[c.pop].color : '#8a919c';
    if (L.colorBy === 'fate') { for (const t of TRAITS) if (t[4] && c.traits.includes(t[0])) return t[4]; return '#b8a8e0'; }
    return TAG_COLORS[st[0] % TAG_COLORS.length];
  }
  draw(force) {
    this.resize(); if (!this.dirty && !force) return false; this.dirty = false;
    const c = this.ctx, m = this.m, W = this.W, H = this.H, k = this.k, dpr = this.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#0d1014'; c.fillRect(0, 0, W, H);
    if (!m) { c.fillStyle = '#8a919c'; c.font = '13px system-ui'; c.fillText(this.opts.empty || 'No cellular genome to show.', 20, 30); return true; }
    const f = Math.floor(this.f), GS = m.GS, L = this.layers, T = m.T, sel = this.sel, U0 = this.ux(0), U1 = this.ux(W), V0 = this.vy(0), V1 = this.vy(H);
    const X = u => this.ox + u * k, Y = v => this.oy + v * k;
    // base-layer cache: when only the hover changed, blit the cached picture and draw the hover ring on top
    const baseKey = [f, k, this.ox, this.oy, W, H, dpr, JSON.stringify(L), sel && sel.key, this.act ? this.actVer : -1].join('|');
    if (!this.baseCv) this.baseCv = document.createElement('canvas');
    if (baseKey === this.baseKey) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.baseCv, 0, 0); c.restore(); this.drawHover(f); return true; }
    // 1. morphogen heat map (GS x GS image, scaled; cell signals A/B are per-step and quantized)
    if (L.chem >= 0) {
      const key = L.chem + ':' + (L.chem === 4 || L.chem === 5 ? Math.min(f, T - 1) : 'fixed');
      if (key !== this.chemKey) { this.chemKey = key; const cv = this.chemCv; cv.width = GS; cv.height = GS; const cx = cv.getContext('2d'), img = cx.createImageData(GS, GS), NS = GS * GS;
        let get, mx = 1e-9;
        if (L.chem === 4 || L.chem === 5) { const q = m.L.dynQ[Math.min(f, T - 1)], o = (L.chem - 4) * NS; get = i => q[o + i] / 255; mx = 1; }
        else { const fld = m.L.fixedChem[[0, 1, 2, 3, -1, -1, 4][L.chem]]; for (const v of fld) mx = Math.max(mx, v); get = i => fld[i] / mx; mx = 1; }
        for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) { const v = get(j * GS + i), p = (i * GS + (GS - 1 - j)) * 4;   // row = x index (i), column = reversed y index (j)
          img.data[p] = 40 + 60 * v; img.data[p + 1] = 70 + 110 * v; img.data[p + 2] = 120 + 135 * v; img.data[p + 3] = Math.round(220 * v); }
        cx.putImageData(img, 0, 0); }
      c.imageSmoothingEnabled = true; c.drawImage(this.chemCv, X(0), Y(0), k, k);
    }
    c.strokeStyle = '#2a3038'; c.lineWidth = 1; c.strokeRect(X(0), Y(0), k, k);
    c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(X(0), Y(0.5)); c.lineTo(X(1), Y(0.5)); c.stroke(); c.setLineDash([]);
    const selCell = sel && sel.kind === 'cell' ? sel.id : null, dimOthers = sel != null;
    // 2 + 3. axons and synapses. Small brains: vector strokes (anti-aliased). Large brains (> 30k axon points, e.g. 60x60):
    //   axons are rasterized in software into ONE reusable offscreen pixel buffer together with the synapses
    //   (one putImageData + one drawImage per redraw), which is ~10x faster than stroking 100k+ segments.
    const many = (m.nPts || (m.nPts = m.cones.reduce((a, cn) => a + cn.pts.length / 3, 0))) > 30000, CWp = Math.round(W * dpr), CHp = Math.round(H * dpr);
    let pix = null;
    if ((L.axons && many) || L.synapses || L.pruned) {
      if (!this.pix || this.pix.w !== CWp || this.pix.h !== CHp) { const cv = this.synCv; cv.width = CWp; cv.height = CHp; const x = cv.getContext('2d'); this.pix = { w: CWp, h: CHp, cv, x, img: x.createImageData(CWp, CHp) }; }
      pix = this.pix; pix.img.data.fill(0);
    }
    const D = pix && pix.img.data, rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const line = (x0, y0, x1, y1, r, g, b, a) => {   // DDA line, alpha-blended into the pixel buffer (device px)
      x0 *= dpr; y0 *= dpr; x1 *= dpr; y1 *= dpr; const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1, sx_ = (x1 - x0) / n, sy_ = (y1 - y0) / n;
      for (let i = 0; i <= n; i++) { const x = (x0 + sx_ * i) | 0, y = (y0 + sy_ * i) | 0; if (x < 0 || y < 0 || x >= CWp || y >= CHp) continue; const p = (y * CWp + x) * 4, q = 1 - a;
        D[p] = D[p] * q + r * a; D[p + 1] = D[p + 1] * q + g * a; D[p + 2] = D[p + 2] * q + b * a; D[p + 3] = Math.min(255, D[p + 3] + 255 * a); } };
    if (L.axons) {
      const minD = 1.5 / k, groups = new Map(), tips = [];
      for (const cn of m.cones) { const P = cn.pts; if (P.length < 6 || P[5] > f) continue;
        if (!cn.bb) { let a = 1, b = 1, cc = 0, d = 0; for (let q = 0; q < P.length; q += 3) { const u = (1 - P[q + 1]) / 2, v = (P[q] + 1) / 2; a = Math.min(a, u); cc = Math.max(cc, u); b = Math.min(b, v); d = Math.max(d, v); } cn.bb = [a, b, cc, d]; }
        const bb = cn.bb; if (bb[2] < U0 || bb[0] > U1 || bb[3] < V0 || bb[1] > V1) continue;
        const mine = selCell != null && cn.pre === selCell || sel && sel.kind === 'in' && cn.pre === -1 - sel.i;
        const col = mine ? '#ffffff' : cn.sensor ? '#7fb2ff' : L.colorBy === 'pop' && m.cells[cn.pre].pop != null ? m.pops[m.cells[cn.pre].pop].color : L.colorBy === 'fate' ? this.cellColor(m.cells[cn.pre], [0, 1]) : TAG_COLORS[cn.cls];
        const alpha = mine ? 0.95 : (dimOthers ? 0.25 : 1) * (cn.sensor ? 0.3 : cn.coll ? 0.45 : 0.7);
        let lu = (1 - P[1]) / 2, lv = (P[0] + 1) / 2, q = 3;
        if (many && !mine) { const [r, g, b] = cn.rgb || (cn.rgb = rgb(col)); if (cn.rgbCol !== col) { cn.rgbCol = col; [cn.rgb[0], cn.rgb[1], cn.rgb[2]] = rgb(col); }
          for (; q < P.length && P[q + 2] <= f; q += 3) { const u = (1 - P[q + 1]) / 2, v = (P[q] + 1) / 2; if (Math.abs(u - lu) + Math.abs(v - lv) < minD && q + 3 < P.length && P[q + 5] <= f) continue; line(X(lu), Y(lv), X(u), Y(v), cn.rgb[0], cn.rgb[1], cn.rgb[2], alpha); lu = u; lv = v; }
        } else {
          const gk = col + (mine ? 'S' : cn.sensor ? 's' : cn.coll ? 'c' : 'm'); let gr = groups.get(gk); if (!gr) { gr = { col, mine, alpha, w: mine ? 2 : cn.sensor || cn.coll ? 0.8 : 1.2, path: new Path2D() }; groups.set(gk, gr); }
          gr.path.moveTo(X(lu), Y(lv));
          for (; q < P.length && P[q + 2] <= f; q += 3) { const u = (1 - P[q + 1]) / 2, v = (P[q] + 1) / 2; if (Math.abs(u - lu) + Math.abs(v - lv) < minD && q + 3 < P.length && P[q + 5] <= f) continue; gr.path.lineTo(X(u), Y(v)); lu = u; lv = v; }
        }
        if (L.cones && q < P.length) tips.push([lu, lv, col]);
      }
      this._axonGroups = groups; this._tips = tips;
    }
    if (L.synapses || L.pruned) {   // synapses: exc white, inh red, plastic yellow; pruned magenta
      const S = m.syn, A = S.a, sz = Math.max(1, Math.round((k / GS > 18 ? 2 : 1) * dpr)), a8 = dimOthers ? 90 : 210;
      const put = (px, py, r, g, b, a) => { px = Math.round(px * dpr); py = Math.round(py * dpr); for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) { const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= CWp || y >= CHp) continue; const p = (y * CWp + x) * 4; D[p] = r; D[p + 1] = g; D[p + 2] = b; D[p + 3] = Math.max(D[p + 3], a); } };
      for (let s = 0; s < S.n; s++) { const t = A[s * 7 + 2]; if (t > f) continue; const e = S.end[s], gone = e >= 0 && e <= f; if (gone ? !L.pruned : !L.synapses) continue;
        const u = (1 - A[s * 7 + 4]) / 2, v = (A[s * 7 + 3] + 1) / 2; if (u < U0 || u > U1 || v < V0 || v > V1) continue;
        if (gone) put(X(u), Y(v), 230, 80, 230, 160); else if (A[s * 7 + 6]) put(X(u), Y(v), 255, 214, 77, a8); else if (A[s * 7 + 5] < 0) put(X(u), Y(v), 255, 96, 96, a8); else put(X(u), Y(v), 235, 240, 245, a8); }
    }
    if (L.axons) for (const gr of this._axonGroups.values()) if (!gr.mine) { c.strokeStyle = gr.col; c.globalAlpha = gr.alpha; c.lineWidth = gr.w; c.stroke(gr.path); }
    c.globalAlpha = 1;
    if (pix) { pix.x.putImageData(pix.img, 0, 0); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(pix.cv, 0, 0); c.restore(); }
    if (L.axons) { for (const gr of this._axonGroups.values()) if (gr.mine) { c.strokeStyle = gr.col; c.globalAlpha = gr.alpha; c.lineWidth = gr.w; c.stroke(gr.path); } c.globalAlpha = 1;
      if (L.cones && f < T) for (const [u, v, col] of this._tips) { c.fillStyle = col; c.beginPath(); c.arc(X(u), Y(v), Math.max(2, Math.min(4, k / GS * 0.25)), 0, 7); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 0.6; c.stroke(); } }
    // 4. fixed sensor / output cells
    const sp = m.spec;
    if (L.sensors) {
      sp.inputs.forEach((ch, i) => { const u = (1 - ch.at[1]) / 2, v = (ch.at[0] + 1) / 2; c.fillStyle = TAG_COLORS[ch.tag % TAG_COLORS.length]; c.globalAlpha = 0.9; const s = Math.max(4, Math.min(9, k / GS * 0.5)); c.fillRect(X(u) - s, Y(v) - s / 2, s, s); });
      c.globalAlpha = 1;
      sp.outputs.forEach((o, i) => { const u = (1 - o.pos[1]) / 2, v = (o.pos[0] + 1) / 2, r = Math.max(4, Math.min(8, k / GS * 0.45)); c.fillStyle = '#ffc83c'; c.beginPath(); c.arc(X(u) + r, Y(v), r, 0, 7); c.fill(); });
    }
    // 5. cells (progenitors grey, neurons by colour mode, inhibitory ring), activity overlay, deaths
    const rr = Math.max(1.5, Math.min(0.3 * k / GS, 12)), act = this.act;
    if (L.cells) for (const cl of m.cells) { if (!isAlive(cl, f)) continue; const [x, y] = cellPos(cl, f), u = (1 - y) / 2, v = (x + 1) / 2; if (u < U0 - 0.05 || u > U1 + 0.05 || v < V0 - 0.05 || v > V1 + 0.05) continue;
      const st = cellState(cl, f), px = X(u), py = Y(v);
      c.globalAlpha = dimOthers && cl.id !== selCell ? 0.45 : 1; c.fillStyle = this.cellColor(cl, st); c.beginPath(); c.arc(px, py, st[1] ? rr : rr * 0.7, 0, 7); c.fill();
      if (st[2] && st[1] && rr > 2.5) { c.strokeStyle = '#ff5a5a'; c.lineWidth = 1.2; c.stroke(); }
      if (act && cl.node >= 0 && act[cl.node] > 0.05) { c.globalAlpha = Math.min(1, act[cl.node]); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(px, py, rr * 1.25, 0, 7); c.fill(); }
    }
    c.globalAlpha = 1;
    if (L.deaths) { c.lineWidth = 1.3; for (const cl of m.cells) { if (cl.died < 0 || cl.died > f) continue; const [x, y] = cellPos(cl, cl.died), u = (1 - y) / 2, v = (x + 1) / 2, s = Math.max(2, rr * 0.8);
      c.strokeStyle = cl.cause === 'apoptosis' ? 'rgba(255,90,90,0.55)' : 'rgba(255,160,60,0.9)'; c.beginPath(); c.moveTo(X(u) - s, Y(v) - s); c.lineTo(X(u) + s, Y(v) + s); c.moveTo(X(u) + s, Y(v) - s); c.lineTo(X(u) - s, Y(v) + s); c.stroke(); } }
    // 6. selection: its synapses formed so far (outgoing orange, incoming cyan), lineage
    if (sel) {
      const ring = (u, v, col, r) => { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(X(u), Y(v), r, 0, 7); c.stroke(); };
      const code = sel.kind === 'cell' ? sel.id : sel.kind === 'in' ? -1 - sel.i : -1 - sel.i, here = sel.kind === 'out' ? this.postPos(code, f) : this.prePos(code, f);
      const S = m.syn, A = S.a, outs = sel.kind === 'out' ? [] : m.synOut.get(code) || [], ins = sel.kind === 'in' ? [] : m.synIn.get(code) || [];
      c.lineWidth = 1; let n = 0;
      for (const s of outs) { if (A[s * 7 + 2] > f || (S.end[s] >= 0 && S.end[s] <= f) || n++ > 600) continue; const p = this.postPos(A[s * 7 + 1], f); c.strokeStyle = A[s * 7 + 5] < 0 ? 'rgba(255,110,110,0.7)' : 'rgba(255,170,60,0.7)'; c.beginPath(); c.moveTo(X(here[0]), Y(here[1])); c.lineTo(X(p[0]), Y(p[1])); c.stroke(); }
      n = 0;
      for (const s of ins) { if (A[s * 7 + 2] > f || (S.end[s] >= 0 && S.end[s] <= f) || n++ > 600) continue; const p = this.prePos(A[s * 7], f); c.strokeStyle = A[s * 7 + 5] < 0 ? 'rgba(255,110,110,0.7)' : 'rgba(80,220,255,0.7)'; c.beginPath(); c.moveTo(X(p[0]), Y(p[1])); c.lineTo(X(here[0]), Y(here[1])); c.stroke(); }
      ring(here[0], here[1], '#ffffff', rr + 4);
      if (sel.kind === 'cell') { const cl = m.cells[sel.id]; c.setLineDash([3, 3]); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); let prev = here;
        for (const pid of cl.lineage) { const pc = m.cells[pid], t = Math.min(f, pc.died >= 0 ? pc.died : f), [x, y] = cellPos(pc, Math.max(pc.from, t)), p = [(1 - y) / 2, (x + 1) / 2]; c.moveTo(X(prev[0]), Y(prev[1])); c.lineTo(X(p[0]), Y(p[1])); prev = p; } c.stroke(); c.setLineDash([]); }
    }
    // 7. labels: sensor / output groups, column labels, orientation
    if (L.labels) {
      c.font = '11px system-ui'; c.fillStyle = '#c9d1d9'; c.textAlign = 'right';
      const groups = (list, posOf) => { const gm = new Map(); list.forEach((ch, i) => { const p = posOf(ch); const gr = gm.get(ch.group) || gm.set(ch.group, { n: 0, u: 0, v0: 1, v1: 0, names: [] }).get(ch.group); gr.n++; gr.u += p[0]; gr.v0 = Math.min(gr.v0, p[1]); gr.v1 = Math.max(gr.v1, p[1]); gr.names.push([ch.name, p]); }); return gm; };
      const ig = groups(sp.inputs, ch => [(1 - ch.at[1]) / 2, (ch.at[0] + 1) / 2]), og = groups(sp.outputs, o => [(1 - o.pos[1]) / 2, (o.pos[0] + 1) / 2]);
      const each = (gm, right) => { for (const [name, gr] of gm) { const u = gr.u / gr.n;
        if (gr.n <= 24 && (gr.v1 - gr.v0) * k / gr.n > 11) { const at = new Map();   // channels at the same place share one label
          for (const [nm, p] of gr.names) { const key = Math.round(X(p[0]) / 12) + ':' + Math.round(Y(p[1]) / 12); const a = at.get(key) || at.set(key, { p, n: [] }).get(key); a.n.push(nm.replace(/^(in_|out_)/, '')); }
          for (const { p, n } of at.values()) { c.fillStyle = right ? '#ffd88a' : '#a9c8ff'; c.fillText(n.length > 3 ? n[0] + ' +' + (n.length - 1) : n.join('/'), right ? X(p[0]) + 22 : X(p[0]) - 10, Y(p[1]) + 4); } }
        else { c.fillStyle = right ? '#ffd88a' : '#a9c8ff'; c.fillText(name + ' ×' + gr.n, right ? X(u) + 22 : X(u) - 10, Y((gr.v0 + gr.v1) / 2) + 4); } } };
      c.textAlign = 'right'; each(ig, false); c.textAlign = 'left'; each(og, true);
      c.textAlign = 'left'; c.fillStyle = '#8a919c'; c.fillText('front: sensors', X(0), Y(1) + 15); c.textAlign = 'right'; c.fillText('back: outputs', X(1), Y(1) + 15); c.textAlign = 'left';
    }
    // header: frame and stage
    c.fillStyle = 'rgba(13,16,20,0.75)'; c.fillRect(0, 0, W, 20); c.fillStyle = '#c9d1d9'; c.font = '12px system-ui';
    c.fillText(f < T ? `development step ${f + 1}/${T} · ${m.stageAt(f)}` : `stage ${f - T + 1}/${m.TT - T} after growth · ${m.stageAt(f)}`, 8, 14);
    const B = this.baseCv; if (B.width !== this.cv.width || B.height !== this.cv.height) { B.width = this.cv.width; B.height = this.cv.height; }
    const bx = B.getContext('2d'); bx.clearRect(0, 0, B.width, B.height); bx.drawImage(this.cv, 0, 0); this.baseKey = baseKey;
    this.drawHover(f);
    return true;
  }
  drawHover(f) {
    const c = this.ctx, m = this.m, sel = this.sel, k = this.k, X = u => this.ox + u * k, Y = v => this.oy + v * k, rr = Math.max(1.5, Math.min(0.3 * k / m.GS, 12));
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.hover && (!sel || this.hover.key !== sel.key)) { const h = this.hover, p = h.kind === 'cell' ? (() => { const cl = m.cells[h.id]; const [x, y] = cellPos(cl, isAlive(cl, f) ? f : cl.died); return [(1 - y) / 2, (x + 1) / 2]; })() : h.kind === 'in' ? this.prePos(-1 - h.i, f) : this.postPos(-1 - h.i, f);
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(X(p[0]), Y(p[1]), rr + 3, 0, 7); c.stroke(); }
  }
}

/* ---------------- wiring diagram (population graph) ---------------- */
class WiringView extends PanZoom {
  constructor(canvas, opts) {
    super(canvas); this.opts = opts || {}; this.m = null; this.sel = null; this.hover = null; this.rates = null; this.minSyn = 1;
    this.on('hover', (x, y) => { const h = x < 0 ? null : this.pick(x, y); if (h !== this.hover) { this.hover = h; this.dirty = true; } if (this.opts.onHover) this.opts.onHover(h, x, y); });
    this.on('click', (x, y) => { this.sel = this.pick(x, y); this.dirty = true; if (this.opts.onSelect) this.opts.onSelect(this.sel); });
  }
  setModel(m) { this.m = m; this.sel = null; this.resize(); this.layout(); this.fit(); }
  layout() {   // columns: shortest synaptic distance from the sensors (BFS over excitatory + inhibitory edges); outputs last
    const m = this.m, P = m.pops, depth = new Array(P.length).fill(-1), adj = P.map(() => []);
    for (const e of m.popEdges) if (e.a !== e.b) adj[e.a].push(e.b);
    let q = P.filter(p => p.kind === 'in').map(p => p.id); for (const i of q) depth[i] = 0;
    while (q.length) { const nq = []; for (const a of q) for (const b of adj[a]) if (depth[b] < 0 && P[b].kind === 'hid') { depth[b] = depth[a] + 1; nq.push(b); } q = nq; }
    let mx = 1; for (let i = 0; i < P.length; i++) if (P[i].kind === 'hid') { if (depth[i] < 0) depth[i] = 1; mx = Math.max(mx, depth[i]); }
    for (const p of P) if (p.kind === 'out') depth[p.id] = mx + 1;
    const cols = new Map(); P.forEach((p, i) => { (cols.get(depth[i]) || cols.set(depth[i], []).get(depth[i])).push(p); });
    const nc = mx + 2; let maxN = 1; for (const [, l] of cols) maxN = Math.max(maxN, l.length);
    const ratio = Math.max(0.4, Math.min(1.6, this.W > 60 && this.H > 60 ? this.H / this.W : maxN / nc));   // fill the canvas
    // v21: within a column, populations are grouped by region (multi-region brains)
    for (const [d, l] of cols) { l.sort((a, b) => (a.region != null ? a.region : -1) - (b.region != null ? b.region : -1) || a.v - b.v || b.nodes.length - a.nodes.length); l.forEach((p, j) => { p.wx = (d + 0.5) / nc; p.wy = (j + 0.5) / l.length * ratio; p.depth = d; }); }
    let total = 0; for (const p of P) total += p.nodes.length;
    for (const p of P) p.r = Math.max(0.012, Math.min(0.06, 0.012 + 0.05 * Math.sqrt(p.nodes.length / total)));
    this.world = [0, 0, 1, ratio];
  }
  pick(px, py) { const m = this.m; if (!m) return null; const u = this.ux(px), v = this.vy(py); let best = null, bd = Infinity;
    for (const p of m.pops) { const d = Math.hypot(p.wx - u, p.wy - v); if (d < Math.max(p.r, 8 / this.k) && d < bd) { bd = d; best = p.id; } } return best; }
  draw(force) {
    this.resize(); if (!this.dirty && !force) return false; this.dirty = false;
    const c = this.ctx, m = this.m, W = this.W, H = this.H, k = this.k; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.fillStyle = '#0d1014'; c.fillRect(0, 0, W, H);
    if (!m) return true;
    const X = u => this.ox + u * k, Y = v => this.oy + v * k, P = m.pops, sel = this.sel != null ? this.sel : null, hov = this.hover;
    let maxE = 1; for (const e of m.popEdges) maxE = Math.max(maxE, e.n);
    const edges = m.popEdges.filter(e => e.n >= this.minSyn).sort((a, b) => a.n - b.n);
    for (const e of edges) { const a = P[e.a], b = P[e.b], on = sel == null || e.a === sel || e.b === sel, hot = sel != null && on;
      const inh = e.inh > e.exc, pl = e.plast > e.n / 2, w = 0.6 + 5.5 * Math.log1p(e.n) / Math.log1p(maxE);
      c.strokeStyle = inh ? '#ff5a5a' : pl ? '#ffd34d' : '#4cd964'; c.globalAlpha = on ? (hot ? 0.85 : 0.5) : 0.06; c.lineWidth = w; c.setLineDash(pl ? [6, 4] : []);
      c.beginPath();
      if (e.a === e.b) { const r = a.r * k; c.arc(X(a.wx), Y(a.wy) - r * 1.2, r * 0.7, 0, 7); }
      else { const x1 = X(a.wx), y1 = Y(a.wy), x2 = X(b.wx), y2 = Y(b.wy), dx = x2 - x1, dy = y2 - y1, bend = b.depth <= a.depth ? 0.35 : 0.12;
        const cx = (x1 + x2) / 2 - dy * bend, cy = (y1 + y2) / 2 + dx * bend; c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2);
        // arrow head at 85 % of the curve
        c.stroke(); const t = 0.8, qx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2, qy = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2, tx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx), ty = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy), an = Math.atan2(ty, tx), s = 4 + w;
        c.setLineDash([]); c.beginPath(); c.moveTo(qx + Math.cos(an) * s, qy + Math.sin(an) * s); c.lineTo(qx + Math.cos(an + 2.5) * s, qy + Math.sin(an + 2.5) * s); c.lineTo(qx + Math.cos(an - 2.5) * s, qy + Math.sin(an - 2.5) * s); c.closePath(); c.fillStyle = c.strokeStyle; c.fill(); continue; }
      c.stroke(); }
    c.globalAlpha = 1; c.setLineDash([]);
    c.font = '11px system-ui'; c.textAlign = 'center';
    for (const p of P) { const x = X(p.wx), y = Y(p.wy), r = Math.max(5, p.r * k), on = sel == null || sel === p.id || m.popEdges.some(e => (e.a === sel && e.b === p.id) || (e.b === sel && e.a === p.id));
      c.globalAlpha = on ? 1 : 0.3; c.fillStyle = p.color; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      if (p.region != null && m.regions) { c.strokeStyle = m.regions[p.region].color; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r + 1.5, 0, 7); c.stroke(); }   // v21: territory (region) ring
      if (this.rates) { const v = Math.min(1, this.rates[p.id] * 8); if (v > 0.01) { c.fillStyle = `rgba(255,255,255,${(0.85 * v).toFixed(3)})`; c.beginPath(); c.arc(x, y, r * 0.75, 0, 7); c.fill(); } }
      if (sel === p.id || hov === p.id) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 3, 0, 7); c.stroke(); }
      c.fillStyle = '#0d1014'; c.font = 'bold 11px system-ui'; if (p.kind === 'hid' && r > 9) c.fillText(p.short, x, y + 4);
      c.fillStyle = '#c9d1d9'; c.font = '11px system-ui'; c.fillText(p.kind === 'hid' ? `${p.short}: ${p.name} (${p.nodes.length})` : `${p.name} (${p.nodes.length})`, x, y + r + 13); }
    c.globalAlpha = 1; c.textAlign = 'left';
    c.fillStyle = 'rgba(13,16,20,0.75)'; c.fillRect(0, 0, W, 20); c.fillStyle = '#c9d1d9'; c.font = '12px system-ui';
    c.fillText(`wiring diagram of the final brain: ${P.length} populations, ${m.popEdges.length} population links · sensors left → outputs right (columns = synaptic distance from the sensors)`, 8, 14);
    return true;
  }
}

/* ---------------- HTML helpers for inspectors / tooltips ---------------- */
function bars(vals, labels, lo, hi, col) {
  return '<div class="ins-bars">' + vals.map((v, i) => { const f = (v - lo) / (hi - lo), z = (0 - lo) / (hi - lo), a = Math.min(f, z), b = Math.max(f, z);
    return `<div class="ins-bar" title="${esc(labels[i])}: ${(+v).toFixed(2)}"><span class="lb">${esc(labels[i])}</span><span class="tr"><i style="left:${(100 * a).toFixed(1)}%;width:${(100 * (b - a)).toFixed(1)}%;background:${col}"></i></span><span class="vv">${(+v).toFixed(2)}</span></div>`; }).join('') + '</div>';
}
function describe(m, h, f) {   // short one-line description (tooltip)
  if (!h) return '';
  if (h.kind === 'in') { const c = m.spec.inputs[h.i]; return `<b>sensor ${esc(c.name)}</b> · group ${esc(c.group)} · tag ${esc(m.tagName(c.tag))} · ${m.outCnt[h.i]} synapses out`; }
  if (h.kind === 'out') { const o = m.spec.outputs[h.i], node = m.nIn + m.nHid + h.i; return `<b>output ${esc(o.name)}</b> · group ${esc(o.group)} · ${m.inCnt[node]} synapses in`; }
  const c = m.cells[h.id], st = cellState(c, Math.min(f, c.to - 1));
  return `<b>cell #${c.id}</b> ${st[1] ? 'neuron' : 'progenitor'} · ${esc(m.tagName(st[0]))}${c.traits.length ? ' · ' + c.traits.join(', ') : ''}` +
    (c.pop != null ? ` · pop. <b>${esc(m.pops[c.pop].short)}</b>` : '') + (c.died >= 0 ? ` · <span style="color:#ff8a5a">died step ${c.died + 1} (${esc(c.cause)})</span>` : '') + (c.node >= 0 ? ` · ${m.inCnt[c.node]} in / ${m.outCnt[c.node]} out` : '');
}
function partnerList(m, list, isIn, max) {
  const items = [...list.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, max);
  return items.map(([node, w]) => { const nm = nodeName(m, node); return `<a href="#" data-node="${node}" class="ins-link">${esc(nm)}</a> <span style="color:${w < 0 ? '#ff7a7a' : '#8fd18f'}">${w.toFixed(1)}</span>`; }).join(' · ') + (list.size > max ? ` · … ${list.size - max} more` : '');
}
function nodeName(m, i) { if (i < m.nIn) return 'sensor ' + m.spec.inputs[i].name; if (i >= m.nIn + m.nHid) return 'output ' + m.spec.outputs[i - m.nIn - m.nHid].name; const c = m.cells[m.L.nodeCell[i]]; return '#' + c.id + (c.pop != null ? ' (' + m.pops[c.pop].short + ')' : ''); }
function inspectHTML(m, h, f) {
  if (!h) return '<span class="dim">Click a cell, sensor or output (tissue view) or a population (wiring view).</span>';
  const g = m.brain, N = m.N, W = g.W, CO = SA.CO;
  const partners = node => { const ins = new Map(), outs = new Map(); for (let a = 0; a < N; a++) { const w = W[a * N + node]; if (w) ins.set(a, w); } for (let b = 0; b < N; b++) { const w = W[node * N + b]; if (w) outs.set(b, w); } return { ins, outs }; };
  if (h.kind === 'in' || h.kind === 'out') {
    const node = h.kind === 'in' ? h.i : m.nIn + m.nHid + h.i, ch = h.kind === 'in' ? m.spec.inputs[h.i] : m.spec.outputs[h.i], pr = partners(node);
    return `<h3>${h.kind === 'in' ? 'Sensor' : 'Output'} ${esc(ch.name)}</h3><div class="kv">group <b>${esc(ch.group)}</b> · tag <b>${esc(m.tagName(ch.tag))}</b>${h.kind === 'out' && ch.bias ? ' · bias ' + ch.bias : ''}<br>` +
      `threshold ${g.thresh[node].toFixed(1)} mV · population ${esc(m.pops[m.popOfNode[node]].name)}</div>` +
      (h.kind === 'in' ? `<div class="kv"><b>${pr.outs.size}</b> targets: ${partnerList(m, pr.outs, false, 14)}</div>` : `<div class="kv"><b>${pr.ins.size}</b> inputs: ${partnerList(m, pr.ins, true, 14)}</div>`) +
      `<div class="kv dim">Fixed cell placed by the environment's I/O spec; its axon / target tag is set by the spec.</div>`;
  }
  const c = m.cells[h.id], st = cellState(c, Math.min(f, c.to - 1)), node = c.node, so = m.synOut.get(c.id) || [], si = m.synIn.get(c.id) || [];
  const S = m.syn, gone = l => l.filter(s => S.end[s] >= 0).length;
  let html = `<h3>Cell #${c.id} ${st[1] || c.neuronAt >= 0 ? 'neuron' : 'progenitor'}${c.died >= 0 ? ' <span style="color:#ff8a5a">(died)</span>' : ''}</h3>`;
  html += `<div class="kv">address tag <b style="color:${TAG_COLORS[c.cls]}">${esc(m.tagName(c.cls))}</b>` + (c.pop != null ? ` · population <b style="color:${m.pops[c.pop].color}">${esc(m.pops[c.pop].short)}</b> ${esc(m.pops[c.pop].name)}` : '') + `<br>` +
    `fate: ${c.traits.length ? c.traits.map(t => TRAITS.find(x => x[0] === t)[1]).join(', ') : 'plain excitatory'}${c.topo != null ? ` · column label ${(+c.topo).toFixed(2)}` : ''}</div>`;
  html += `<div class="kv">born step ${c.born < 0 ? '0 (seed cell)' : c.born + 1}` + (c.neuronAt >= 0 ? ` · neuron from step ${c.neuronAt + 1}` : '') + (c.died >= 0 ? ` · <span style="color:#ff8a5a">died at ${c.died < m.T ? 'step ' + (c.died + 1) : 'stage ' + esc(m.stageAt(c.died))} (${esc(c.cause)})</span>` : '') +
    `<br>lineage: ${c.lineage.length ? c.lineage.slice(0, 12).map(p => `<a href="#" data-cell="${p}" class="ins-link">#${p}</a>`).join(' ← ') + (c.lineage.length > 12 ? ' ← …' : '') + ' (seed)' : 'seed cell'} · moved ${c.moves.length / 3 - 1}×</div>`;
  if (node >= 0) { const g = m.brain, pr = partners(node), J = m.L.juv, k0 = node;
    html += `<div class="kv">threshold <b>${g.thresh[k0].toFixed(1)}</b> mV${J ? ` (before juvenile homeostasis ${J.thresh0[k0].toFixed(1)})` : ''} · leak ${(g.leak && g.leak[k0] ? g.leak[k0] : SA.params.leak).toFixed(3)}${g.slow && g.slow[k0] ? ' (slow)' : ''}<br>` +
      `final synapses: <b>${pr.ins.size}</b> in · <b>${pr.outs.size}</b> out` + (J && J.spikes.length ? ` · juvenile spikes per block ${J.spikes.map(s => s[k0]).join(' / ')}` : '') + `</div>` +
      `<div class="kv">inputs: ${partnerList(m, pr.ins, true, 10) || '–'}</div><div class="kv">outputs: ${partnerList(m, pr.outs, false, 10) || '–'}</div>`; }
  else html += `<div class="kv dim">Not in the final network${c.neuronAt < 0 ? ' (never became a neuron)' : ''}.</div>`;
  html += `<div class="kv">growth record: ${so.length} synapses made (${gone(so)} removed later), ${si.length} received (${gone(si)} removed)</div>`;
  html += `<div class="sub">gene expression state s (final, ${m.H} genes)</div>` + bars(Array.from(c.s), Array.from({ length: m.H }, (_, i) => 'g' + i), -1, 1, '#7aa2ff');
  html += `<div class="sub">expression over development (rows = genes, columns = steps; blue −, orange +)</div><canvas class="ins-heat" data-cell="${c.id}" width="${m.T * 6}" height="${m.H * 6}"></canvas>`;
  html += `<div class="sub">decisions (gene outputs o, final)</div>` + bars(GENE_OUT.map(([, k]) => c.o[CO[k]]), GENE_OUT.map(([n]) => n), 0, 1, '#ffb35f');
  return html;
}
function drawHeat(cv, m) { const c = m.cells[+cv.dataset.cell], x = cv.getContext('2d'), H = m.H, T = m.T;
  for (let t = 0; t < T; t++) for (let gI = 0; gI < H; gI++) { const alive = t >= c.from && t < c.to, v = c.sH[t * H + gI] / 127;
    x.fillStyle = !alive ? '#1a1d22' : v >= 0 ? `rgb(${40 + 215 * v | 0},${40 + 120 * v | 0},40)` : `rgb(40,${40 + 90 * -v | 0},${40 + 215 * -v | 0})`; x.fillRect(t * 6, gI * 6, 6, 6); } }
function popHTML(m, id) {
  if (id == null) return '';
  const p = m.pops[id], ins = m.popEdges.filter(e => e.b === id && e.a !== id).sort((a, b) => b.n - a.n), outs = m.popEdges.filter(e => e.a === id && e.b !== id).sort((a, b) => b.n - a.n), self = m.popEdges.find(e => e.a === id && e.b === id);
  const ed = (e, other) => `<a href="#" data-pop="${other.id}" class="ins-link" style="color:${other.color}">${esc(other.kind === 'hid' ? other.short : other.name)}</a> ${e.n}${e.inh > e.exc ? ' inh' : ''}${e.plast ? ` (${e.plast} plastic)` : ''}`;
  let thr = 0, nN = 0; for (const i of p.nodes) { thr += m.brain.thresh[i]; nN++; }
  return `<h3 style="color:${p.color}">Population ${esc(p.kind === 'hid' ? p.short + ': ' : '')}${esc(p.name)}</h3><div class="kv"><b>${p.nodes.length}</b> ${p.kind === 'hid' ? 'neurons' : 'channels'} · mean threshold ${(thr / nN).toFixed(1)} mV</div>` +
    (self ? `<div class="kv">recurrent: ${self.n} synapses within${self.inh > self.exc ? ' (inhibitory)' : ''}</div>` : '') +
    `<div class="kv">inputs from: ${ins.map(e => ed(e, m.pops[e.a])).join(' · ') || '–'}</div><div class="kv">outputs to: ${outs.map(e => ed(e, m.pops[e.b])).join(' · ') || '–'}</div>`;
}

Object.assign(SA, { DevModel, TissueView, WiringView, devInspectHTML: inspectHTML, devDescribe: describe, devPopHTML: popHTML, devDrawHeat: drawHeat, DEV_TRAITS: TRAITS, DEV_WHY: WHY, TAG_COLORS_DEV: TAG_COLORS, devCellPos: cellPos, devCellState: cellState });
})();
