/* Explore: "Watch a brain grow" (#brain). Loaded lazily after the engine bundle (/assets/bugbrain.js).
 * Grows the arena champion (plan v3h + the audited edit from /explore/bugbrain-champion.json) with the bundle's own
 * growCell and its built-in development recorder (opts.record: passive, it never draws a random number or changes a
 * decision, so the recorded brain is bit-identical to the arena's brain for the same seed; tools/brain_record_check.js).
 * Then replays the recording: cells dividing, moving and choosing a type; the chemical guidance fields; axon growth
 * cones with their trails; synapses forming and being removed; the juvenile activity and pruning stages.
 * Afterwards the bug lives in the arena OFF-SCREEN and the brain is shown live: spikes travel along connections,
 * sensors on the left, motors on the right, each with an activity bar; eating food / poison flashes the learning signal.
 * Fields shown are exactly those the growth code computes: the five fixed morphogens (develop.js fixedAt), the two
 * cell-made signals (chemicals 4 and 5, recorded per step), and the motors' hunger attractant, rebuilt from the
 * recorded synapses with the same rule as develop.js (need grows by hungerRate per step while an output has fewer
 * than hungerTarget excitatory inputs; pull = hunger x min(2, need) x exp(-distance / hungerLam)). */
(() => {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const SA = window.SpikingArena;
  if (!SA || !SA.growCell || !SA.bug) return;
  const W = 1120, H = 700, LM = 250, RM = 150, X0 = LM, X1 = W - RM, Y0 = 24, Y1 = H - 24;
  const C = { mint: '#69e2b1', red: '#ff818a', amber: '#ffca76', cyan: '#65c7f2', purple: '#b5a4ff', muted: '#8b9baa', line: '#202d39', text: '#e6edf3', bg: '#0b1218' };
  const CLASS_COL = ['#9aa7b4', '#69e2b1', '#ff818a', '#ffca76', '#65c7f2', '#b5a4ff', '#f0e68c', '#7fd3c3'];
  const CLASS_NAME = ['wall-eye cell', 'green-eye cell', 'red-eye cell', 'touch cell', 'motor cell', 'speed cell', 'tonic cell', 'free cell'];
  const FIELDS = [   // [key, plain name, colour, on by default]
    ['c2', 'Eye signal (from the eyes)', [101, 199, 242], true],
    ['c3', 'Motor signal (from the wheels)', [255, 202, 118], true],
    ['c4', 'Cell signal A (made by cells)', [105, 226, 177], true],
    ['c5', 'Cell signal B (made by cells)', [181, 164, 255], true],
    ['hunger', 'Hunger: motors still missing inputs', [255, 129, 138], true],
    ['c0', 'Midline signal', [200, 200, 200], false],
    ['c1', 'Front signal (sensor edge)', [240, 230, 140], false],
    ['c6', 'Central band signal', [127, 211, 195], false],
  ];
  const STAGES = (T, axon) => [[0, 'Cells divide, move and choose what to become'], [axon, 'Axons follow the chemical signals and form synapses'],
    [T, 'Selection: cells keep the inputs they need'], [T + 1, 'Competition: neurons without a useful output die'],
    [T + 2, 'Practice: waves of spontaneous activity'], [T + 6, 'Pruning: weak, unused synapses are removed'], [T + 7, 'Living: the bug forages, the brain keeps learning']];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sxOf = y => X0 + (1 - y) / 2 * (X1 - X0), syOf = x => Y0 + (x + 1) / 2 * (Y1 - Y0);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function makeEnv(task) {
    const params = SA.recommendedEnvParams('bug', { task }, ['task']);
    SA.setEnv('bug', Object.assign({}, params, { task }));
    const cur = SA.currentEnv(), garden = SA.bug.GARDEN;
    return Object.assign({}, cur, { P: Object.assign({}, cur.P), def: Object.assign({}, cur.def, { create: (s, p) => new SA.bug.World(s, p, garden) }) });
  }

  function genomeFor(selected) {
    const change = selected && selected.change ? selected.change : null;
    const g = SA.tunedBugGenome(change && change.tune ? change.tune : undefined);
    if (change && change.field && g.sc && g.sc[change.field] != null && isFinite(change.factor)) g.sc[change.field] *= change.factor;
    return g;
  }

  function Brain(panel) {
    const q = r => panel.querySelector('[data-role="' + r + '"]');
    this.panel = panel; this.canvas = q('canvas'); this.g = this.canvas.getContext('2d'); this.aside = q('stats'); this.tip = q('tip');
    this.playBtn = q('play'); this.speedIn = q('speed'); this.speedOut = q('speed-label'); this.restartBtn = q('restart');
    this.playing = true; this.visible = false; this.speed = 1; this.frame = 0; this.last = 0; this.on = {};
    for (const f of FIELDS) this.on[f[0]] = f[3];
    this.canvas.width = W; this.canvas.height = H;
  }
  const B = Brain.prototype;

  B.load = async function () {
    let selected = { id: 'v3h', change: null };
    try { const r = await fetch(this.canvas.dataset.champion, { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (d && typeof d.id === 'string') selected = d; } } catch (e) { /* v3h */ }
    this.selected = selected; this.env = makeEnv('flash');
    this.seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    this.genome = genomeFor(selected);
    this.brain = SA.growCell(this.genome, { seed: this.seed, spec: this.env.spec, record: true });
    this.prepare();
  };

  /* ---- precompute everything the replay needs from the recording ---- */
  B.prepare = function () {
    const g = this.brain, rec = g.devLog, sc = this.genome.sc || {}, CO = SA.CO, GS = rec.GS, NS = GS * GS;
    this.rec = rec; this.T = rec.T; this.TT = rec.T + 7; this.axonT = Math.round((sc.axonStart || 0) * rec.T);
    this.stages = STAGES(this.T, this.axonT);
    // field images (GS x GS, rotated: tissue y runs left -> right, x top -> bottom)
    const img = (vals, rgb, amax) => { const c = document.createElement('canvas'); c.width = GS; c.height = GS; const cx = c.getContext('2d'), id = cx.createImageData(GS, GS);
      for (let py = 0; py < GS; py++) for (let px = 0; px < GS; px++) { const v = Math.sqrt(clamp(vals[(GS - 1 - px) * GS + py], 0, 1)), o = (py * GS + px) * 4;
        id.data[o] = rgb[0]; id.data[o + 1] = rgb[1]; id.data[o + 2] = rgb[2]; id.data[o + 3] = Math.round(255 * amax * v); }
      cx.putImageData(id, 0, 0); return c; };
    this.img = img; this.GS = GS;
    const fixIdx = [0, 1, 2, 3, 6];
    this.fixed = {};
    fixIdx.forEach((k, n) => { const f = FIELDS.find(x => x[0] === 'c' + k); this.fixed['c' + k] = img(rec.fixedChem[n], f[2], k === 0 || k === 1 || k === 6 ? 0.3 : 0.5); });
    this.dynCache = new Map();
    this.dynAny = [0, 1].map(a => rec.dynMax.some(m => m[a] > 0));   // v3h makes neither cell signal: the legend says so
    // hunger: rebuilt per step from the recorded synapses (same rule as develop.js)
    const A = rec.syn.a, nS = rec.syn.n, OUT = this.env.spec.outputs, nOut = OUT.length;
    this.hungerOn = (sc.hunger || 0) > 0;
    this.hungerA = [];
    if (this.hungerOn) {
      const need = new Float64Array(nOut), cnt = new Int32Array(nOut), byT = [];
      for (let k = 0; k < nS; k++) { const post = A[k * 7 + 1], w = A[k * 7 + 5]; if (post < 0 && w > 0) (byT[A[k * 7 + 2]] = byT[A[k * 7 + 2]] || []).push(-1 - post); }
      for (let t = 0; t < this.T; t++) {
        if (t / this.T >= (sc.axonStart || 0)) for (let m = 0; m < nOut; m++) need[m] = cnt[m] < sc.hungerTarget ? need[m] + sc.hungerRate : 0;
        this.hungerA.push(Array.from(need, v => sc.hunger * Math.min(2, v)));
        for (const m of byT[t] || []) cnt[m]++;
      }
      this.hungerMax = Math.max(1e-9, ...this.hungerA.map(a => Math.max(...a)));
    }
    this.motorPos = OUT.map(o => o.pos);
    // which fields steer axons, and how strongly: mean |guidance weight| of the cells that became neurons
    const pull = new Float64Array(7); let nN = 0;
    for (const c of rec.cells) if (c.node >= 0 && c.o) { nN++; for (let k = 0; k < 7; k++) pull[k] += Math.abs(2 * c.o[k < 6 ? CO.G + k : CO.G6] - 1); }
    this.pull = Array.from(pull, v => nN ? v / nN : 0);
    // cells: timeline arrays
    this.cells = rec.cells.map(c => ({ id: c.id, parent: c.parent, born: c.born < 0 ? 0 : c.born, died: c.died, cause: c.cause, moves: c.moves, ev: c.ev, node: c.node, neuronAt: c.neuronAt }));
    this.cones = rec.cones.map(c => ({ pts: c.pts, t0: c.pts[2], t1: c.pts[c.pts.length - 1], col: c.sensor ? CLASS_COL[this.env.spec.inputs[-1 - c.pre].tag] || C.muted : CLASS_COL[c.cls] || C.muted }));
    this.syn = []; for (let k = 0; k < nS; k++) this.syn.push({ t: A[k * 7 + 2], x: A[k * 7 + 3], y: A[k * 7 + 4], w: A[k * 7 + 5], end: rec.syn.end[k], why: rec.syn.why[k] });
    // juvenile spikes per cell
    this.juv = rec.juv ? rec.juv.spikes.map(sp => { let mx = 1e-9; for (const v of sp) mx = Math.max(mx, v); return { sp, mx }; }) : [];
    // final network for the living phase
    const N = g.N; this.N = N; this.nIn = g.nIn; this.nOut = g.nOut;
    this.NX = new Float32Array(N); this.NY = new Float32Array(N);
    for (let i = 0; i < N; i++) { const p = g.pos[i]; this.NX[i] = sxOf(p[1]); this.NY[i] = syOf(p[0]); }
    this.nodeCol = []; this.nodeInh = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (i < g.nIn) this.nodeCol.push(CLASS_COL[this.env.spec.inputs[i].tag] || C.muted);
      else if (i >= g.nIn + g.nHid) this.nodeCol.push(C.cyan);
      else { const ct = g.cellType ? g.cellType[i] : 7, ti = g.typeInfo && g.typeInfo[ct]; this.nodeCol.push(CLASS_COL[ct % 8] || C.muted); this.nodeInh[i] = ti && ti.inh ? 1 : 0; }
    }
    this.layoutLabels();
    this.restart();
    this.buildStats();
  };

  B.layoutLabels = function () {
    const IN = this.env.spec.inputs, rows = [];
    for (let k = 0; k < 9; k++) rows.push({ kind: 'eye', k, label: 'Eye ' + (k + 1) + (k === 0 ? ' (left)' : k === 8 ? ' (right)' : k === 4 ? ' (front)' : ''), idx: [k * 3, k * 3 + 1, k * 3 + 2], y: syOf(IN[k * 3].at[0]) });
    const names = { tonic: 'Steady drive', bump_left: 'Touch left', bump_front: 'Touch front', bump_right: 'Touch right', gyro_left: 'Turning left', gyro_right: 'Turning right' };
    const other = [];
    IN.forEach((c, i) => { if (i >= 27) other.push({ kind: 'in', label: names[c.name] || c.name, idx: [i], y: syOf(c.at[0]) }); });
    other.sort((a, b) => a.y - b.y);
    for (let i = 1; i < other.length; i++) if (other[i].y - other[i - 1].y < 26) other[i].y = other[i - 1].y + 26;
    this.inRows = rows; this.otherRows = other;
    const ON = { left: 'Left wheel', right: 'Right wheel', speed: 'Speed' };
    this.outRows = this.env.spec.outputs.map((o, m) => ({ label: ON[o.name] || o.name, m, y: syOf(o.pos[0]) }));
  };

  B.restart = function () {
    this.tau = 0; this.phase = 'grow'; this.live = null; this.pulses = []; this.flash = new Float32Array(this.N); this.act = new Float32Array(this.N);
    this.outAct = new Float32Array(this.nOut); this.glow = null; this.tickAcc = 0; this.ticks = 0; this.food = 0; this.poison = 0; this.rounds = 0; this.edgeLayer = null;
  };

  /* ---- the living phase: the grown brain drives the bug in an off-screen arena ---- */
  B.startLife = function () {
    const ag = new SA.Agent(this.genome, this.seed, this.brain, this.env);
    SA.params.plasticity = true;
    this.live = ag; this.phase = 'live'; this.spk = new Uint16Array(ag.net.N);
    const net = ag.net, layer = document.createElement('canvas'); layer.width = W; layer.height = H; const lg = layer.getContext('2d');
    lg.lineWidth = 1;
    for (let i = 0; i < Math.min(this.N, net.N); i++) for (let k = net.start[i]; k < net.start[i + 1]; k++) { const j = net.posts[k], w = net.ws[k]; if (!w || j >= this.N) continue;
      lg.strokeStyle = w > 0 ? 'rgba(105,226,177,0.10)' : 'rgba(181,164,255,0.13)'; lg.beginPath(); lg.moveTo(this.NX[i], this.NY[i]); lg.lineTo(this.NX[j], this.NY[j]); lg.stroke(); }
    this.edgeLayer = layer;
  };
  B.lifeTick = function () {
    const ag = this.live, spk = this.spk; spk.fill(0);
    const f0 = ag.task.food, p0 = ag.task.poison;
    ag.tick(net => { const s = net.spiked; for (let i = 0; i < s.length; i++) if (s[i]) spk[i]++; });
    const S = SA.params.lifeSub > 0 ? SA.params.lifeSub : SA.params.substeps, net = ag.net, now = performance.now();
    for (let i = 0; i < this.N; i++) {
      this.act[i] = this.act[i] * 0.7 + 0.3 * spk[i] / S;
      if (spk[i]) { this.flash[i] = 1;
        let n = 0; const a = net.start[i], b = net.start[i + 1];
        for (let tries = 0; tries < 6 && n < 2 && b > a; tries++) { const k = a + Math.floor(Math.random() * (b - a)); if (net.ws[k] && net.posts[k] < this.N) { this.pulses.push({ i, j: net.posts[k], t0: now, inh: net.ws[k] < 0 }); n++; } } }
    }
    if (this.pulses.length > 500) this.pulses.splice(0, this.pulses.length - 500);
    for (let m = 0; m < this.nOut; m++) this.outAct[m] = this.outAct[m] * 0.6 + 0.4 * clamp(ag.out.rates[m] / 0.5, 0, 1);
    if (ag.task.food > f0) { this.food++; this.glow = { col: [105, 226, 177], t0: now, text: 'Ate food: reward signal' }; }
    if (ag.task.poison > p0) { this.poison++; this.glow = { col: [255, 129, 138], t0: now, text: 'Ate poison: punishment signal' }; }
    this.ticks++;
    if (ag.done) { this.rounds++; ag.task = this.env.def.create((this.seed + 7919 * this.rounds) >>> 0, this.env.P, this.env.spec); }
  };

  /* ---- drawing ---- */
  B.fieldAt = function (key, step) {
    if (this.fixed[key]) return this.fixed[key];
    const ck = key + ':' + step; if (this.dynCache.has(ck)) return this.dynCache.get(ck);
    const GS = this.GS, NS = GS * GS, vals = new Float32Array(NS), f = FIELDS.find(x => x[0] === key);
    if (key === 'c4' || key === 'c5') { const Q = this.rec.dynQ[clamp(step, 0, this.rec.dynQ.length - 1)], a = key === 'c4' ? 0 : 1; for (let k = 0; k < NS; k++) vals[k] = Q[a * NS + k] / 255; }
    else if (key === 'hunger') {
      const A = this.hungerA[clamp(step, 0, this.hungerA.length - 1)], lam = this.genome.sc.hungerLam || 0.4, h = 2 / GS;
      for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) { const x = -1 + (i + 0.5) * h, y = -1 + (j + 0.5) * h; let v = 0;
        for (let m = 0; m < A.length; m++) if (A[m] > 0) v += A[m] * Math.exp(-Math.hypot(x - this.motorPos[m][0], y - this.motorPos[m][1]) / lam);
        vals[j * GS + i] = v / this.hungerMax; }
    }
    const c = this.img(vals, f[2], 0.62);
    if (this.dynCache.size > 160) this.dynCache.clear();
    this.dynCache.set(ck, c); return c;
  };
  B.cellState = function (c, tau) {
    if (tau < c.born) return null;
    if (c.died >= 0 && tau >= c.died + 1) return null;
    const mv = c.moves; let x = mv[1], y = mv[2], px = x, py = y, tm = mv[0];
    for (let k = 0; k < mv.length; k += 3) { if (mv[k] > tau) break; px = x; py = y; x = mv[k + 1]; y = mv[k + 2]; tm = mv[k]; }
    const f = clamp(tau - tm, 0, 1); x = px + (x - px) * Math.min(1, f * 2); y = py + (y - py) * Math.min(1, f * 2);
    if (tau - c.born < 1 && c.parent >= 0) { const p = this.cells[c.parent]; if (p) { const pm = p.moves; let ax = pm[1], ay = pm[2]; for (let k = 0; k < pm.length; k += 3) { if (pm[k] > c.born) break; ax = pm[k + 1]; ay = pm[k + 2]; }
      const e = clamp((tau - c.born) * 1.5, 0, 1); x = ax + (x - ax) * e; y = ay + (y - ay) * e; } }
    let cls = 7, ne = 0, ih = 0; const ev = c.ev; for (let k = 0; k < ev.length; k += 4) { if (ev[k] > tau) break; cls = ev[k + 1]; ne = ev[k + 2]; ih = ev[k + 3]; }
    const dying = c.died >= 0 && tau >= c.died ? 1 - (tau - c.died) : 1;
    return { x: sxOf(y), y: syOf(x), cls, ne, ih, alpha: dying };
  };

  B.drawLabels = function (g) {
    g.save(); g.font = '12px ui-sans-serif, system-ui, sans-serif'; g.textBaseline = 'middle';
    const live = this.phase === 'live', bar = (x, y, v, col) => { g.fillStyle = '#16212b'; g.fillRect(x, y - 3, 44, 6); g.fillStyle = col; g.fillRect(x, y - 3, 44 * clamp(v, 0, 1), 6); };
    g.fillStyle = C.muted; g.font = '600 11px ui-sans-serif, system-ui, sans-serif'; g.fillText('SENSORS', 10, 12); g.fillText('MOTORS', X1 + 16, 12);
    g.font = '12px ui-sans-serif, system-ui, sans-serif';
    for (const r of this.inRows) {
      g.fillStyle = C.text; g.fillText(r.label, 10, r.y - 9);
      const cols = [CLASS_COL[0], C.mint, C.red];
      r.idx.forEach((i, n) => bar(10 + n * 48, r.y + 6, live ? this.act[i] * 3 : 0, cols[n]));
      g.strokeStyle = 'rgba(139,155,170,0.18)'; g.beginPath(); g.moveTo(152, r.y); g.lineTo(this.NX[r.idx[0]], this.NY[r.idx[0]]); g.stroke();
    }
    for (const r of this.otherRows) {
      const i = r.idx[0]; g.fillStyle = C.muted; g.fillText(r.label, 160, r.y - 7); bar(160, r.y + 7, live ? this.act[i] * 3 : 0, CLASS_COL[this.env.spec.inputs[i].tag] || C.muted);
    }
    for (const r of this.outRows) {
      const i = this.nIn + this.brain.nHid + r.m;
      g.fillStyle = C.text; g.fillText(r.label, X1 + 22, r.y - 9); bar(X1 + 22, r.y + 6, live ? this.outAct[r.m] : 0, C.cyan);
      g.strokeStyle = 'rgba(101,199,242,0.25)'; g.beginPath(); g.moveTo(this.NX[i], this.NY[i]); g.lineTo(X1 + 18, r.y); g.stroke();
    }
    g.restore();
  };

  B.draw = function () {
    const g = this.g, tau = this.tau, now = performance.now(), live = this.phase === 'live';
    g.globalCompositeOperation = 'source-over'; g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0e1820'; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    // chemical fields (soft: a 24 x 24 grid scaled up with smoothing); they fade out while the brain lives
    const step = Math.min(Math.floor(tau), this.T - 1), fa = live ? 0.25 : tau > this.T ? Math.max(0.35, 1 - (tau - this.T) / 7) : 1;
    g.imageSmoothingEnabled = true; g.globalCompositeOperation = 'lighter'; g.globalAlpha = fa;
    for (const f of FIELDS) { if (!this.on[f[0]]) continue; if (f[0] === 'hunger' && !this.hungerOn) continue; if ((f[0] === 'c4' || f[0] === 'c5' || f[0] === 'hunger') && live) continue;
      g.drawImage(this.fieldAt(f[0], step), X0, Y0, X1 - X0, Y1 - Y0); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (!live) {
      // axon growth cones: trails up to now, bright head while growing
      g.lineWidth = 1.3;
      for (const cn of this.cones) {
        if (tau < cn.t0) continue; const p = cn.pts; g.strokeStyle = cn.col; g.globalAlpha = tau > this.T ? 0.25 : 0.45; g.beginPath();
        let hx = sxOf(p[1]), hy = syOf(p[0]); g.moveTo(hx, hy);
        for (let k = 3; k < p.length; k += 3) { if (p[k + 2] > tau) { const pt = p[k - 1], f = clamp((tau - pt) / Math.max(1e-6, p[k + 2] - pt), 0, 1); hx = hx + (sxOf(p[k + 1]) - hx) * f; hy = hy + (syOf(p[k]) - hy) * f; g.lineTo(hx, hy); break; }
          hx = sxOf(p[k + 1]); hy = syOf(p[k]); g.lineTo(hx, hy); }
        g.stroke();
        if (tau <= cn.t1 + 0.5 && tau < this.T) { g.globalAlpha = 1; g.fillStyle = cn.col; g.beginPath(); g.arc(hx, hy, 2.6, 0, 7); g.fill(); }
      }
      g.globalAlpha = 1;
      // synapses: a ring when one forms, a red cross when one is removed
      for (const s of this.syn) {
        if (tau < s.t) continue; const x = sxOf(s.y), y = syOf(s.x);
        if (s.end >= 0 && tau >= s.end + 1) continue;
        if (s.end >= 0 && tau >= s.end) { const a = 1 - (tau - s.end); g.strokeStyle = 'rgba(255,129,138,' + a.toFixed(2) + ')'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); continue; }
        g.fillStyle = s.w > 0 ? 'rgba(105,226,177,0.85)' : 'rgba(181,164,255,0.9)'; g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
        const age = tau - s.t; if (age < 1) { g.strokeStyle = 'rgba(230,237,243,' + (1 - age).toFixed(2) + ')'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 3 + 7 * age, 0, 7); g.stroke(); }
      }
      // cells (squares: progenitors; circles: neurons; purple ring: inhibitory); juvenile activity flashes
      const jb = tau >= this.T + 2 && tau < this.T + 6 ? this.juv[Math.floor(tau - this.T - 2)] : null;
      for (const c of this.cells) {
        const st = this.cellState(c, tau); if (!st) continue;
        g.globalAlpha = clamp(st.alpha, 0, 1); g.fillStyle = CLASS_COL[st.cls] || C.muted;
        if (st.ne) { g.beginPath(); g.arc(st.x, st.y, 4.2, 0, 7); g.fill(); if (st.ih) { g.strokeStyle = C.purple; g.lineWidth = 1.5; g.stroke(); } }
        else { g.globalAlpha *= 0.75; g.fillRect(st.x - 4, st.y - 4, 8, 8); }
        if (jb && c.node >= 0 && jb.sp[c.node] > 0) { const v = jb.sp[c.node] / jb.mx * (1 - (tau % 1)); g.globalAlpha = clamp(v, 0, 1); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(st.x, st.y, 7, 0, 7); g.fill(); }
      }
      g.globalAlpha = 1;
      // sensor and motor anchors
      for (let i = 0; i < this.nIn; i++) { g.fillStyle = this.nodeCol[i]; g.beginPath(); g.arc(this.NX[i], this.NY[i], 3, 0, 7); g.fill(); }
      for (let m = 0; m < this.nOut; m++) { const i = this.nIn + this.brain.nHid + m; g.fillStyle = C.cyan; g.beginPath(); g.arc(this.NX[i], this.NY[i], 7, 0, 7); g.fill(); }
    } else {
      if (this.glow) { const a = 1 - (now - this.glow.t0) / (1600 / Math.sqrt(this.speed)); if (a > 0) { const [r, gg, b] = this.glow.col;
        const grd = g.createRadialGradient((X0 + X1) / 2, (Y0 + Y1) / 2, 40, (X0 + X1) / 2, (Y0 + Y1) / 2, (X1 - X0) * 0.65); grd.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',' + (0.30 * a).toFixed(3) + ')'); grd.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
        g.fillStyle = grd; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0); g.fillStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + a.toFixed(2) + ')'; g.font = '600 15px ui-sans-serif, system-ui, sans-serif'; g.fillText(this.glow.text, X0 + 14, Y1 - 14); } else this.glow = null; }
      if (this.edgeLayer) g.drawImage(this.edgeLayer, 0, 0);
      const dur = clamp(1000 / (10 * this.speed), 90, 1800);
      for (let k = this.pulses.length - 1; k >= 0; k--) { const p = this.pulses[k], f = (now - p.t0) / dur; if (f >= 1) { this.pulses.splice(k, 1); continue; }
        const x = this.NX[p.i] + (this.NX[p.j] - this.NX[p.i]) * f, y = this.NY[p.i] + (this.NY[p.j] - this.NY[p.i]) * f;
        g.fillStyle = p.inh ? C.purple : C.mint; g.globalAlpha = 0.9 * (1 - f * 0.5); g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      const fd = Math.exp(-(now - (this.lastDraw || now)) / (250 / Math.sqrt(this.speed)));
      for (let i = 0; i < this.N; i++) {
        this.flash[i] *= fd; const out = i >= this.nIn + this.brain.nHid, r = out ? 7 : i < this.nIn ? 3 : 4;
        g.fillStyle = this.nodeCol[i]; g.globalAlpha = 0.55 + 0.45 * this.flash[i]; g.beginPath(); g.arc(this.NX[i], this.NY[i], r, 0, 7); g.fill();
        if (this.nodeInh[i]) { g.strokeStyle = C.purple; g.lineWidth = 1.5; g.stroke(); }
        if (this.flash[i] > 0.05) { g.globalAlpha = this.flash[i] * 0.8; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(this.NX[i], this.NY[i], r + 3 * this.flash[i], 0, 7); g.fill(); }
      }
      g.globalAlpha = 1;
    }
    this.lastDraw = now;
    this.drawLabels(g);
  };

  /* ---- the panel beside the canvas ---- */
  B.buildStats = function () {
    const a = this.aside; a.innerHTML = '';
    const top = el('div'); this.sPhase = el('div', 'st-age'); this.sStep = el('div', 'st-sub'); this.sStage = el('p', 'st-trend');
    top.appendChild(this.sPhase); top.appendChild(this.sStep); top.appendChild(this.sStage);
    const rows = el('div'); const row = (label) => { const r = el('div', 'st-row'), l = el('span', null, label), v = el('b', null, '–'); r.appendChild(l); r.appendChild(v); rows.appendChild(r); return v; };
    this.sCells = row('Cells'); this.sNeur = row('Neurons'); this.sCones = row('Growing axons'); this.sSyn = row('Synapses'); this.sGone = row('Synapses removed');
    this.sFood = row('Food / poison eaten');
    top.appendChild(rows);
    const lg = el('div', 'br-legend'); lg.appendChild(el('p', 'br-lh', 'Chemical signals (click to show or hide)'));
    const mx = Math.max(1e-9, ...this.pull);
    for (const f of FIELDS) {
      if (f[0] === 'hunger' && !this.hungerOn) continue;
      const none = (f[0] === 'c4' || f[0] === 'c5') && !this.dynAny[f[0] === 'c4' ? 0 : 1];
      if (none) { this.on[f[0]] = false; const b = el('button', 'br-field'); b.type = 'button'; b.disabled = true; const sw = el('i'); sw.style.background = 'rgb(' + f[2].join(',') + ')'; b.appendChild(sw); b.appendChild(el('span', null, f[1])); b.appendChild(el('em', null, 'this brain makes none')); lg.appendChild(b); continue; }
      const b = el('button', 'br-field' + (this.on[f[0]] ? ' is-on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', this.on[f[0]] ? 'true' : 'false');
      const sw = el('i'); sw.style.background = 'rgb(' + f[2].join(',') + ')'; b.appendChild(sw); b.appendChild(el('span', null, f[1]));
      const k = f[0][0] === 'c' ? +f[0].slice(1) : -1;
      const pl = el('em', null, k >= 0 ? (this.pull[k] / mx > 0.66 ? 'steers axons: strong' : this.pull[k] / mx > 0.33 ? 'steers axons: some' : 'steers axons: weak') : 'pulls axons to needy motors');
      b.appendChild(pl);
      b.addEventListener('click', () => { this.on[f[0]] = !this.on[f[0]]; b.classList.toggle('is-on', this.on[f[0]]); b.setAttribute('aria-pressed', this.on[f[0]] ? 'true' : 'false'); if (!this.playing) this.draw(); });
      lg.appendChild(b);
    }
    const key = el('p', 'br-key'); key.innerHTML = 'Squares: young cells · dots: neurons (colour = type, purple ring = inhibitory) · lines with a bright tip: growing axons · '
      + 'rings: new synapses · red crosses: removed synapses. Living: dots travelling along lines are spikes; a green / red glow is the reward / punishment signal.';
    const seed = el('p', 'br-seed', 'Brain ' + this.selected.id + ' · seed ' + this.seed + ' (the arena grows this same brain from this seed)');
    a.appendChild(top); a.appendChild(lg); a.appendChild(key); a.appendChild(seed);
    this.updateStats(true);
  };
  B.updateStats = function (force) {
    const now = performance.now(); if (!force && now - (this.lastStats || 0) < 250) return; this.lastStats = now;
    const tau = this.tau, live = this.phase === 'live';
    this.sPhase.textContent = live ? 'Living' : 'Growing';
    this.sStep.textContent = live ? 'tick ' + this.ticks.toLocaleString('en-US') + ' · round ' + (this.rounds + 1) : 'step ' + Math.min(this.TT, Math.floor(tau) + 1) + ' of ' + this.TT;
    let st = this.stages[0][1]; for (const [t, s] of this.stages) if ((live ? this.TT : tau) >= t) st = s; this.sStage.textContent = st;
    let cells = 0, neur = 0; for (const c of this.cells) { if (tau < c.born || (c.died >= 0 && tau >= c.died)) continue; cells++; if (c.neuronAt >= 0 && tau >= c.neuronAt) neur++; }
    let cones = 0; for (const cn of this.cones) if (tau >= cn.t0 && tau <= cn.t1 && tau < this.T) cones++;
    let syn = 0, gone = 0; for (const s of this.syn) { if (tau < s.t) continue; if (s.end >= 0 && tau >= s.end) gone++; else syn++; }
    this.sCells.textContent = live ? this.brain.nHid : cells; this.sNeur.textContent = live ? this.brain.nHid : neur; this.sCones.textContent = live ? 0 : cones;
    this.sSyn.textContent = syn; this.sGone.textContent = gone; this.sFood.textContent = live ? this.food + ' / ' + this.poison : '–';
  };

  /* ---- loop, controls, tooltip ---- */
  B.loop = function (now) {
    this.frame = requestAnimationFrame(t => this.loop(t));
    const dt = Math.min(100, now - (this.last || now)); this.last = now;
    if (!this.visible || document.hidden || !this.rec) return;
    if (this.playing) {
      if (this.phase === 'grow') { this.tau += dt / 1000 * 2 * this.speed; if (this.tau >= this.TT + 1) { this.tau = this.TT; this.startLife(); } }
      else { this.tickAcc += dt / 1000 * 10 * this.speed; let n = 0; while (this.tickAcc >= 1 && n < 40) { this.tickAcc -= 1; this.lifeTick(); n++; } if (n >= 40) this.tickAcc = 0; }
    }
    this.draw(); this.updateStats(false);
  };
  B.setSpeed = function () {
    const v = +this.speedIn.value; this.speed = 0.05 * Math.pow(160, v / 100);
    this.speedOut.textContent = (this.speed < 0.995 ? this.speed.toFixed(2) : this.speed.toFixed(1)) + '×';
  };
  B.pick = function (ev) {
    const r = this.canvas.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width, y = (ev.clientY - r.top) * H / r.height;
    let best = null, bd = 14 * 14;
    if (this.phase === 'live') { for (let i = 0; i < this.N; i++) { const d = (this.NX[i] - x) ** 2 + (this.NY[i] - y) ** 2; if (d < bd) { bd = d; best = { node: i }; } } }
    else for (const c of this.cells) { const st = this.cellState(c, this.tau); if (!st) continue; const d = (st.x - x) ** 2 + (st.y - y) ** 2; if (d < bd) { bd = d; best = { cell: c, st }; } }
    if (!best) { this.tip.hidden = true; return; }
    const g = this.brain, lines = [];
    let node = best.node != null ? best.node : best.cell.node;
    if (best.cell && node < 0) { lines.push('Cell ' + best.cell.id + ': ' + (best.st.ne ? 'neuron, ' : 'young cell, ') + CLASS_NAME[best.st.cls]);
      lines.push('Born at step ' + (best.cell.born + 1) + (best.cell.parent >= 0 ? ' from cell ' + best.cell.parent : ' (a founder cell)'));
      if (best.cell.died >= 0) lines.push('Dies at step ' + (best.cell.died + 1) + ' (' + (best.cell.cause === 'trophic' ? 'no useful output' : best.cell.cause) + ')'); }
    else {
      const N = g.N, IN = this.env.spec.inputs; let nIn = 0, nOut = 0, inh = false;
      for (let a = 0; a < N; a++) if (g.W[a * N + node]) nIn++;
      for (let b = 0; b < N; b++) { const w = g.W[node * N + b]; if (w) { nOut++; if (w < 0) inh = true; } }
      if (node < g.nIn) lines.push('Sensor: ' + IN[node].name.replace(/_/g, ' '));
      else if (node >= g.nIn + g.nHid) lines.push('Motor: ' + this.outRows[node - g.nIn - g.nHid].label);
      else { const ct = g.cellType ? g.cellType[node] : 7; lines.push('Neuron: ' + CLASS_NAME[ct % 8] + (inh || this.nodeInh[node] ? ' (inhibitory)' : ' (excitatory)')); }
      lines.push('Inputs from ' + nIn + ' · outputs to ' + nOut);
      const cell = this.cells.find(c => c.node === node); if (cell) lines.push('Born at step ' + (cell.born + 1) + ', became a neuron at step ' + (cell.neuronAt + 1));
    }
    this.tip.textContent = ''; lines.forEach((t, k) => { const p = el(k ? 'span' : 'b', null, t); this.tip.appendChild(p); });
    this.tip.style.left = Math.min(r.width - 230, Math.max(0, ev.clientX - r.left + 12)) + 'px'; this.tip.style.top = Math.max(0, ev.clientY - r.top + 12) + 'px'; this.tip.hidden = false;
  };
  B.init = async function () {
    this.playBtn.addEventListener('click', () => { this.playing = !this.playing; this.playBtn.textContent = this.playing ? 'Pause' : 'Play'; });
    this.speedIn.addEventListener('input', () => this.setSpeed()); this.setSpeed();
    this.restartBtn.addEventListener('click', () => { this.restart(); this.playing = true; this.playBtn.textContent = 'Pause'; this.tip.hidden = true; });
    this.canvas.addEventListener('click', ev => this.pick(ev));
    try { await this.load(); this.playBtn.disabled = this.restartBtn.disabled = false; }
    catch (e) { if (window.console) console.error('brain:', e); this.aside.textContent = 'The brain could not grow in this browser. Refresh the page to try again.'; return; }
    this.frame = requestAnimationFrame(t => this.loop(t));
  };

  window.ExploreDemos = window.ExploreDemos || {};
  const panel = document.getElementById('demo-brain');
  if (panel && panel.querySelector('[data-role="canvas"]')) {
    const b = new Brain(panel); let started = false;
    window.ExploreDemos.brain = {
      show() { b.visible = true; if (!started) { started = true; b.init(); } },
      hide() { b.visible = false; },
      // for the screenshot / smoke tests: jump to a growth step, or live a number of ticks at once
      seek(tau) { if (!b.rec) return; b.restart(); if (tau > b.TT) { b.tau = b.TT; b.startLife(); for (let i = 0; i < tau - b.TT; i++) b.lifeTick(); } else b.tau = tau; b.draw(); b.updateStats(true); },
      state() { return b.rec ? { phase: b.phase, tau: b.tau, ticks: b.ticks, seed: b.seed, N: b.N, T: b.T, TT: b.TT, food: b.food, poison: b.poison, speed: b.speed } : null; },
      pause() { b.playing = false; b.playBtn.textContent = 'Play'; },
    };
  }
})();
