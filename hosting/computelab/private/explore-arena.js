/* Explore: the BugBrain arenas (#arena and #predator). Loaded lazily after the engine bundle (/assets/bugbrain.js).
 * One bug brain lives on from round to round: when a round ends only the garden is renewed, the grown network
 * (and everything it has learned) is kept. A small panel on the canvas shows the bug's age and its food, poison
 * (and, with the predator, "caught") rates over its whole life as sparklines.
 * The learned state is saved in localStorage (about 80 KB) so a reload continues the same bug; "Start fresh" grows a new one.
 * Long sessions: the history is a fixed number of bins (pairs merge when full, so memory never grows), and while the
 * browser tab is hidden the bug keeps living at a slow pace without drawing.
 * Brain: plan v3h plus the audited champion edit from /explore/bugbrain-champion.json ({id, change: {field, factor} | {tune}}).
 * #arena = the flash task (food seen only in brief flashes); #predator = the core's 'hard' task (drifting items + a chasing predator).
 * "Stuck on a wall" uses the audit's definition (tools/bug_audit.js): touching a wall and moved less than 10 px over the last 30 steps. */
(() => {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const SA = window.SpikingArena;
  if (!SA || !SA.bug) return;
  const W = 1120, H = 700, MS_PER_TICK = 22, HIDDEN_MS = 1000, HIDDEN_TICKS = 15, SAVE_MS = 30000, ROUND_PAUSE = 1500;
  const BINS = 96, BIN0 = 300, STUCK_N = 30, STUCK_D2 = 100, STORE_V = 1, MAX_SAVE = 1500000;
  const C = { mint: '#69e2b1', red: '#ff818a', amber: '#ffca76', cyan: '#65c7f2', muted: '#8b9baa', line: '#202d39', text: '#e6edf3', panel: 'rgba(13,21,29,0.88)' };
  const site = window.ExploreSite || {};

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

  /* ---- life history: fixed number of bins; when full, neighbours merge and each bin covers twice as many steps ---- */
  function newLife() { return { age: 0, rounds: 0, bin: BIN0, cur: [0, 0, 0, 0, 0], hist: [] }; }   // [steps, food, poison, caught, stuck]
  function lifeAdd(life, d) {
    const c = life.cur; for (let i = 0; i < 5; i++) c[i] += d[i];
    life.age++;
    if (c[0] >= life.bin) {
      life.hist.push(c.slice()); life.cur = [0, 0, 0, 0, 0];
      if (life.hist.length > BINS) {
        const h = life.hist, m = [];
        for (let i = 0; i + 1 < h.length; i += 2) m.push(h[i].map((v, k) => v + h[i + 1][k]));
        if (h.length % 2) m.push(h[h.length - 1]);
        life.hist = m; life.bin *= 2;
      }
    }
  }
  function validLife(l) {
    return l && typeof l === 'object' && isFinite(l.age) && isFinite(l.rounds) && isFinite(l.bin) && Array.isArray(l.cur) && l.cur.length === 5 &&
      Array.isArray(l.hist) && l.hist.length <= BINS + 1 && l.hist.every(b => Array.isArray(b) && b.length === 5 && b.every(isFinite));
  }

  /* ---- per-step observation of one world ---- */
  function Watcher() { this.reset(); }
  Watcher.prototype.reset = function () { this.f = 0; this.p = 0; this.c = 0; this.hx = new Float32Array(STUCK_N); this.hy = new Float32Array(STUCK_N); this.n = 0; };
  Watcher.prototype.step = function (w) {
    const a = w.agent, touching = !!(a.contact[0] || a.contact[1] || a.contact[2] || w.bumped), h = this.n % STUCK_N;
    let stuck = 0;
    if (this.n >= STUCK_N && touching) { const dx = a.x - this.hx[h], dy = a.y - this.hy[h]; stuck = dx * dx + dy * dy < STUCK_D2 ? 1 : 0; }
    this.hx[h] = a.x; this.hy[h] = a.y; this.n++;
    const d = [1, w.food - this.f, w.poison - this.p, (w.caught || 0) - this.c, stuck];
    this.f = w.food; this.p = w.poison; this.c = w.caught || 0;
    return d;
  };

  /* ---- saving the learned network: every typed array and number the SpikingNet owns ---- */
  function b64(view) {
    const u = new Uint8Array(view.buffer, view.byteOffset, view.byteLength); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function packNet(net) {
    const out = {};
    for (const k of Object.keys(net)) {
      const v = net[k];
      if (ArrayBuffer.isView(v) && !(v instanceof DataView)) out[k] = [v.constructor.name, v.length, b64(v)];
      else if ((typeof v === 'number' && isFinite(v)) || typeof v === 'boolean') out[k] = v;
    }
    return out;
  }
  function unpackNet(net, data) {
    if (!data || !Array.isArray(data.ws)) return false;
    const plan = [];
    for (const k of Object.keys(data)) {
      const v = data[k], cur = net[k];
      if (Array.isArray(v)) {
        if (!cur || !ArrayBuffer.isView(cur) || cur.constructor.name !== v[0] || cur.length !== v[1]) return false;
        const bin = atob(String(v[2]));
        if (bin.length !== cur.byteLength) return false;
        plan.push([cur, bin]);
      } else if (typeof cur === typeof v && typeof v !== 'object') plan.push([k, v]);
    }
    for (const [a, b] of plan) {
      if (typeof a === 'string') { net[a] = b; continue; }
      const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    }
    return true;
  }

  /* ---- the on-canvas panel ---- */
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function rate(x, steps) { return steps > 0 ? (x * 1000 / steps) : 0; }
  function sumBins(bins) { const s = [0, 0, 0, 0, 0]; for (const b of bins) for (let i = 0; i < 5; i++) s[i] += b[i]; return s; }
  function drawPanel(g, life, predator, label) {
    const bins = life.hist.concat(life.cur[0] >= life.bin / 4 ? [life.cur] : []);
    const pw = 330, ph = 150, x0 = 14, y0 = 14;
    g.save();
    g.fillStyle = C.panel; g.strokeStyle = C.line; g.lineWidth = 1;
    g.beginPath(); if (g.roundRect) g.roundRect(x0, y0, pw, ph, 10); else g.rect(x0, y0, pw, ph); g.fill(); g.stroke();
    g.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace'; g.fillStyle = C.text; g.textBaseline = 'top';
    g.fillText((label ? label + ' · ' : '') + 'Age ' + fmt(life.age) + ' steps · ' + life.rounds + ' round' + (life.rounds === 1 ? '' : 's'), x0 + 12, y0 + 10);
    // sparkline: food (green), poison (red), caught (amber) per 1,000 steps, oldest at the left
    const sx = x0 + 12, sy = y0 + 32, sw = pw - 24, sh = 58;
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(sx, sy + sh + 0.5); g.lineTo(sx + sw, sy + sh + 0.5); g.stroke();
    if (bins.length >= 2) {
      const series = [[1, C.mint], [2, C.red]].concat(predator ? [[3, C.amber]] : []);
      let top = 1; for (const b of bins) for (const [k] of series) top = Math.max(top, rate(b[k], b[0]));
      for (const [k, col] of series) {
        g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
        bins.forEach((b, i) => { const x = sx + sw * i / (bins.length - 1), y = sy + sh - sh * rate(b[k], b[0]) / top; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      g.lineWidth = 1;
    } else { g.fillStyle = C.muted; g.font = '12px ui-sans-serif, system-ui, sans-serif'; g.fillText('The chart starts after a few hundred steps.', sx, sy + 22); }
    g.font = '12px ui-sans-serif, system-ui, sans-serif';
    const all = sumBins(bins), recent = sumBins(bins.slice(-Math.max(1, Math.ceil(bins.length / 4)))), early = sumBins(bins.slice(0, Math.max(1, Math.ceil(bins.length / 4))));
    let lx = sx;
    const legend = [['Food ' + rate(recent[1], recent[0]).toFixed(1), C.mint], ['Poison ' + rate(recent[2], recent[0]).toFixed(1), C.red]].concat(predator ? [['Caught ' + rate(recent[3], recent[0]).toFixed(1), C.amber]] : []);
    for (const [t, col] of legend) { g.fillStyle = col; g.fillRect(lx, sy + sh + 9, 9, 9); g.fillStyle = C.text; g.fillText(t, lx + 13, sy + sh + 7); lx += g.measureText(t).width + 26; }
    g.fillStyle = C.muted; g.fillText('per 1,000 steps, lately', lx - 8, sy + sh + 7);
    let trend;
    if (bins.length < 4) trend = 'Too early to tell whether it is improving.';
    else if (predator) {
      const a = rate(early[3], early[0]), b = rate(recent[3], recent[0]);
      trend = 'Caught: ' + a.toFixed(1) + ' early on, ' + b.toFixed(1) + ' lately' + (b < a * 0.8 ? ' · dodging better' : b > a * 1.25 ? ' · getting caught more' : ' · no clear change yet');
    } else {
      const a = early[2] / Math.max(1, early[1] + early[2]), b = recent[2] / Math.max(1, recent[1] + recent[2]);
      trend = 'Poison share of bites: ' + Math.round(a * 100) + '% early on, ' + Math.round(b * 100) + '% lately';
    }
    g.fillStyle = C.text; g.fillText(trend, sx, sy + sh + 26);
    g.fillStyle = C.muted; g.fillText('Stuck on a wall ' + (all[0] ? (100 * recent[4] / Math.max(1, recent[0])).toFixed(1) : '0.0') + '% of the time lately', sx, sy + sh + 43);
    g.restore();
  }

  /* ---- one arena demo (a panel with its own bug, or two in compare mode) ---- */
  function makeArena(panel, demoId) {
    const q = r => panel.querySelector('[data-role="' + r + '"]');
    const canvas = q('canvas'), status = q('status'), learningBtn = q('learning'), pauseBtn = q('pause'), freshBtn = q('fresh');
    const baseCanvas = q('baseline'), task = canvas.dataset.task === 'hard' ? 'hard' : 'flash', predator = task === 'hard';
    const compare = !!baseCanvas, key = 'computelab.bug.' + demoId + '.v' + STORE_V;
    let env = null, selected = { id: 'v3h', change: null }, bugs = [], learningOn = true, playing = true, visible = false, started = false;
    let frame = 0, previous = 0, elapsed = 0, roundOverAt = null, lastSave = 0, dirty = false, hiddenTimer = 0, freshArmed = 0, note = '';

    async function loadChampion() {
      try {
        const r = await fetch(canvas.dataset.champion, { cache: 'no-store' });
        if (r.ok) { const d = await r.json(); if (d && typeof d.id === 'string') selected = d; }
      } catch (e) { /* keep v3h */ }
    }
    const champKey = () => JSON.stringify({ id: selected.id, change: selected.change || null, task, engine: site.engine || '' });

    function grow(genome, seed, label) {
      const agent = new SA.Agent(genome, seed, SA.growCell(genome, { seed, spec: env.spec }), env);
      return { agent, seed, label, life: newLife(), watch: new Watcher() };
    }
    function newRound() {
      const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      for (const b of bugs) { b.agent.task = env.def.create(seed, env.P, env.spec); b.watch.reset(); }
      roundOverAt = null;
    }
    function fresh(reason) {
      const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      bugs = [grow(genomeFor(selected), seed, compare ? 'Current' : '')];
      if (compare) bugs.push(grow(SA.PLANS.v3h.make(), seed, 'Original'));
      newRound(); note = reason || ''; dirty = true;
    }
    function restore() {
      if (compare) return false;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { saved = null; }
      if (!saved || saved.v !== STORE_V) return false;
      if (saved.champ !== champKey()) { note = 'The arena brain was updated, so a new bug was grown.'; return false; }
      if (!isFinite(saved.seed) || !validLife(saved.life)) return false;
      const b = grow(genomeFor(selected), saved.seed >>> 0, '');
      if (!unpackNet(b.agent.net, saved.net)) return false;
      b.life = saved.life; learningOn = saved.learning !== false;
      bugs = [b]; newRound(); note = 'Welcome back: this bug kept what it learned before.';
      return true;
    }
    function save(force) {
      if (compare || !bugs.length || (!dirty && !force)) return;
      const b = bugs[0];
      try {
        const text = JSON.stringify({ v: STORE_V, champ: champKey(), seed: b.seed, learning: learningOn, life: b.life, net: packNet(b.agent.net), saved: Date.now() });
        if (text.length <= MAX_SAVE) localStorage.setItem(key, text);
      } catch (e) { /* storage full or blocked: keep running without saving */ }
      dirty = false; lastSave = Date.now();
    }

    function applyLearning() {
      SA.params.plasticity = learningOn;
      learningBtn.textContent = 'Learning: ' + (learningOn ? 'On' : 'Off');
      learningBtn.setAttribute('aria-pressed', learningOn ? 'true' : 'false');
      learningBtn.classList.toggle('is-learning-on', learningOn);
      learningBtn.classList.toggle('is-learning-off', !learningOn);
    }

    function step() {
      SA.params.plasticity = learningOn;
      for (const b of bugs) {
        if (b.agent.done) continue;
        b.agent.tick();
        lifeAdd(b.life, b.watch.step(b.agent.task));
      }
      dirty = true;
    }
    function roundDone() { return bugs.every(b => b.agent.done); }
    function endRound() { for (const b of bugs) b.life.rounds++; newRound(); }

    function statusText(b) {
      const t = b.agent.task, s = t.stats();
      return 'Round ' + (b.life.rounds + 1) + ' · Food ' + s.food + ' · Poison ' + s.poison + (predator ? ' · Caught ' + (s.caught || 0) : '') +
        ' · Time ' + t.t + ' of ' + t.horizon + ' · ' + b.agent.brain.N + ' neurons';
    }
    function drawOne(b, cv) {
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const g = cv.getContext('2d');
      b.agent.task.render(g, W, H, { showStats: false });
      drawPanel(g, b.life, predator, b.label);
    }
    function draw() {
      if (!bugs.length) return;
      const over = roundOverAt !== null ? ' · Round over, the next one starts in a moment' : '';
      drawOne(bugs[0], canvas);
      if (compare) {
        drawOne(bugs[1], baseCanvas);
        const cs = q('champ-score'), bs = q('base-score');
        if (cs) cs.textContent = statusText(bugs[0]);
        if (bs) bs.textContent = statusText(bugs[1]);
        status.textContent = 'Same gardens for both, and both keep learning' + (selected.id !== 'v3h' ? ' · current brain = original + one tested change' :
          ' · no tested change has beaten the original yet, so both are the same brain') + over;
      } else status.textContent = (learningOn ? 'Learning on · ' : 'Learning off · ') + statusText(bugs[0]) + over + (note ? ' · ' + note : '');
    }

    function loop(now) {
      frame = requestAnimationFrame(loop);
      const delta = Math.min(50, now - previous); previous = now;
      if (!playing || !visible || document.hidden || !bugs.length) { elapsed = 0; return; }
      if (roundDone()) {
        if (roundOverAt === null) { roundOverAt = now; draw(); }
        if (now - roundOverAt >= ROUND_PAUSE) { endRound(); draw(); }
        return;
      }
      elapsed += delta;
      if (elapsed < MS_PER_TICK) return;
      while (elapsed >= MS_PER_TICK && !roundDone()) { elapsed -= MS_PER_TICK; step(); }
      if (note && bugs[0].life.age % 3000 === 0) note = '';
      draw();
      if (Date.now() - lastSave > SAVE_MS) save();
    }
    // While the browser tab is hidden: a slow pace, no drawing (browsers also slow timers in hidden tabs).
    function hiddenStep() {
      if (!document.hidden || !visible || !playing || !bugs.length) return;
      for (let i = 0; i < HIDDEN_TICKS; i++) { if (roundDone()) endRound(); step(); }
      if (Date.now() - lastSave > SAVE_MS) save();
    }

    async function begin() {
      try {
        await loadChampion();
        env = makeEnv(task);
        if (!restore()) fresh(note);
        applyLearning();
        pauseBtn.disabled = freshBtn.disabled = false;
        draw();
        if (!frame) frame = requestAnimationFrame(loop);
        if (!hiddenTimer) hiddenTimer = setInterval(hiddenStep, HIDDEN_MS);
      } catch (error) {
        if (window.console) console.error('arena:', error);
        status.textContent = 'The arena could not load. Refresh the page to try again.';
      }
    }

    learningBtn.addEventListener('click', () => { learningOn = !learningOn; applyLearning(); dirty = true; draw(); });
    pauseBtn.addEventListener('click', () => { playing = !playing; pauseBtn.textContent = playing ? 'Pause' : 'Resume'; });
    freshBtn.addEventListener('click', () => {
      if (!env) return;
      if (!compare && Date.now() - freshArmed > 4000 && bugs.length && bugs[0].life.age > 3000) {
        freshArmed = Date.now(); freshBtn.textContent = 'Click again to forget it';
        setTimeout(() => { freshBtn.textContent = 'Start fresh'; }, 4000);
        return;
      }
      freshArmed = 0; freshBtn.textContent = 'Start fresh';
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
      fresh('A new bug was grown.'); save(true); draw();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', () => save());

    return {
      show() { visible = true; if (!started) { started = true; begin(); } else draw(); },
      hide() { visible = false; save(); },
      // live a number of steps at once without drawing (used by the screenshot and smoke tests)
      world() { return bugs.length ? bugs[0].agent.task : null; },
      fastForward(steps) { if (!bugs.length) return 0; for (let i = 0; i < steps; i++) { if (roundDone()) endRound(); step(); } roundOverAt = null; draw(); save(true); return bugs[0].life.age; },
    };
  }

  window.ExploreDemos = window.ExploreDemos || {};
  for (const id of ['arena', 'predator']) {
    const panel = document.getElementById('demo-' + id);
    if (panel && panel.querySelector('[data-role="canvas"]')) window.ExploreDemos[id] = makeArena(panel, id);
  }
  // for tests: the history and save helpers
  window.ExploreArena = { newLife, lifeAdd, packNet, unpackNet, BINS };
})();
