/* Explore: the BugBrain arenas (#arena and #predator). Loaded lazily after the engine bundle (/assets/bugbrain.js).
 * One bug brain lives on from round to round: when a round ends only the garden is renewed, the grown network
 * (and everything it has learned) is kept. A stats panel beside the canvas (below it on narrow screens) shows the bug's age and its food, poison
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

  /* ---- #shoot / #shoot-predator: the same flash garden and v3h brain plus one more motor output, 'fire' ----
   * All of it lives here (not in the engine bundle): a World subclass and a spec with a fourth output. #arena and
   * #predator never touch it, so they run exactly as before. Fire: the fire neuron's rate over a tick above FIRE_RATE
   * shoots one projectile straight ahead, then a cooldown; each shot costs a little (a small punishment signal).
   * A shot that hits red (the poison colour) removes it: reward. A shot that hits green (food) removes it: penalty.
   * With the predator: the #predator hunter chases the bug; a hit stuns it (frozen, drawn dimmed) and knocks it back,
   * a modest reward; being caught costs what it costs in #predator. Score = green eaten + red shot - green shot
   * (- 2 x caught with the predator). */
  const SHOOT = { cooldown: 12, cost: 0.05, speed: 9, life: 42, hitPad: 3, redReward: 1, greenPenalty: 1, fireRate: 0.12,
    stunTicks: 160, stunReward: 0.5, knock: 30 };
  function shootKit() {
    const B = SA.bug, HARD = B.HARD, ITEM_R = B.ITEM_R, PRED_R = B.PRED_R, AGENT_R = B.AGENT_R;
    class ShootWorld extends B.World {
      constructor(seed, P, layout, opts) {
        super(seed, P, layout);
        this.withPredator = !!(opts && opts.predator);
        this.shots = 0; this.redShot = 0; this.greenShot = 0; this.stuns = 0; this.cool = 0; this.bullets = []; this.muzzle = 0; this.blocked = 0; this.shotLog = [];
        if (this.withPredator) { const p = this.spawnPredator(); p.stun = 0; this.predators.push(p); }
      }
      act(out) {
        const r = super.act(out);   // drive, eat, count (the base world: flash task, no predator in its own step)
        let pos = r.pos, neg = r.neg;
        if (this.cool > 0) this.cool--;
        if (this.muzzle > 0) this.muzzle--;
        if (out.rates[3] > SHOOT.fireRate) {
          if (this.cool === 0) {
            const a = this.agent, dx = Math.cos(a.angle), dy = Math.sin(a.angle);
            this.bullets.push({ x: a.x + dx * (AGENT_R + 2), y: a.y + dy * (AGENT_R + 2), dx, dy, n: 0 });
            this.cool = SHOOT.cooldown; this.shots++; if (this.shotLog.length < 400) this.shotLog.push(this.t); this.muzzle = 4; neg += SHOOT.cost;
          } else this.blocked++;   // wanted to fire during the cooldown (counted for the tests)
        }
        const ev = this.stepBullets(); pos += ev[0]; neg += ev[1];
        if (this.withPredator) neg += this.stepPredator();
        return { pos, neg, pain: r.pain, reward: r.reward + ev[0] - ev[1] };
      }
      stepBullets() {
        let pos = 0, neg = 0;
        const keep = [];
        for (const b of this.bullets) {
          let gone = false;
          for (let h = 0; h < 2 && !gone; h++) {   // two half steps: a projectile cannot skip over an item
            b.x += b.dx * SHOOT.speed / 2; b.y += b.dy * SHOOT.speed / 2;
            if (this.nearWall(b.x, b.y, 2)) { gone = true; break; }
            for (let i = 0; i < this.items.length; i++) {
              const it = this.items[i], R = ITEM_R + SHOOT.hitPad;
              if ((it.x - b.x) ** 2 + (it.y - b.y) ** 2 >= R * R) continue;
              if ((it.type === 1) === this.greenIsFood) { this.greenShot++; neg += SHOOT.greenPenalty; } else { this.redShot++; pos += SHOOT.redReward; }
              this.items[i] = this.spawnItem(); gone = true; break;
            }
            if (gone) break;
            for (const p of this.predators) {
              if (p.stun > 0) continue;   // passes over a stunned hunter
              const R = PRED_R + SHOOT.hitPad;
              if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 >= R * R) continue;
              p.stun = SHOOT.stunTicks; this.stuns++; pos += SHOOT.stunReward;
              const kx = p.x + b.dx * SHOOT.knock, ky = p.y + b.dy * SHOOT.knock;
              if (!this.nearWall(kx, ky, PRED_R)) { p.x = kx; p.y = ky; }
              gone = true; break;
            }
          }
          if (!gone && ++b.n < SHOOT.life) keep.push(b);
        }
        this.bullets = keep;
        return [pos, neg];
      }
      // the #predator hunter (same chase rule and speeds as the core's 'hard' task), frozen while stunned
      stepPredator() {
        const a = this.agent; let neg = 0;
        for (let i = 0; i < this.predators.length; i++) {
          const p = this.predators[i];
          if (p.stun > 0) { p.stun--; continue; }
          const dx = a.x - p.x, dy = a.y - p.y, d2 = dx * dx + dy * dy, near = d2 < HARD.predRange * HARD.predRange;
          if (near) { let rel = Math.atan2(dy, dx) - p.angle; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); p.angle += Math.max(-0.08, Math.min(0.08, rel)); }
          else p.angle += (this.rng() - 0.5) * 0.3;
          const sp = near ? HARD.predSpeed : HARD.predSpeed * 0.5, nx = p.x + Math.cos(p.angle) * sp, ny = p.y + Math.sin(p.angle) * sp;
          if (this.nearWall(nx, ny, PRED_R)) p.angle += Math.PI * (0.5 + this.rng()); else { p.x = nx; p.y = ny; }
          if ((p.x - a.x) ** 2 + (p.y - a.y) ** 2 < (AGENT_R + PRED_R) ** 2) {
            this.caught++; neg += HARD.caughtCost; this.poisonLog.push(this.t); this.rewardLog.push([this.t, -HARD.caughtCost]);
            const q = this.spawnPredator(); q.stun = 0; this.predators[i] = q;
          }
        }
        return neg;
      }
      score() { return this.food + this.redShot - SHOOT.greenPenalty * this.greenShot - HARD.caughtCost * this.caught; }
      stats() { return { food: this.food, poison: this.poison, caught: this.caught, stuck: this.stuckTicks, shots: this.shots, redShot: this.redShot, greenShot: this.greenShot, stuns: this.stuns, score: this.score() }; }
      render(c, W, H, opts) {
        const all = this.predators, stunned = all.filter(p => p.stun > 0);
        this.predators = all.filter(p => !(p.stun > 0));
        super.render(c, W, H, opts);
        this.predators = all;
        for (const p of stunned) {   // frozen hunter: dimmed, with a ring that empties as it wakes up
          c.globalAlpha = 0.35; c.fillStyle = '#e04848'; c.strokeStyle = '#000'; c.lineWidth = 3;
          c.beginPath(); c.arc(p.x, p.y, PRED_R, 0, 7); c.fill(); c.stroke(); c.globalAlpha = 1;
          c.strokeStyle = '#6b7c8c'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, PRED_R + 6, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p.stun / SHOOT.stunTicks); c.stroke();
        }
        c.lineCap = 'round';
        for (const b of this.bullets) {
          c.strokeStyle = 'rgba(214,138,0,0.45)'; c.lineWidth = 3; c.beginPath(); c.moveTo(b.x - b.dx * 14, b.y - b.dy * 14); c.lineTo(b.x, b.y); c.stroke();
          c.fillStyle = '#d68a00'; c.beginPath(); c.arc(b.x, b.y, 3.5, 0, 7); c.fill();
        }
        c.lineCap = 'butt';
        if (this.muzzle > 0) { const a = this.agent; c.fillStyle = 'rgba(255,190,60,' + (0.25 * this.muzzle) + ')';
          c.beginPath(); c.arc(a.x + Math.cos(a.angle) * (AGENT_R + 4), a.y + Math.sin(a.angle) * (AGENT_R + 4), 6, 0, 7); c.fill(); }
      }
    }
    // the bug's spec plus the fire output (bias 0: it fires only when the network drives it)
    function makeShootEnv(predator) {
      const params = SA.recommendedEnvParams('bug', { task: 'flash' }, ['task']);
      SA.setEnv('bug', Object.assign({}, params, { task: 'flash' }));
      const cur = SA.currentEnv(), garden = B.GARDEN, P = Object.assign({}, cur.P), io = B.bugIO(P);
      io.outputs = io.outputs.concat([{ name: 'fire', group: 'fire', tag: 4, cls: 9, pos: [0, -0.8], bias: 0 }]);
      io.classes = io.classes.concat(['motor-fire']);
      const spec = SA.makeSpec(io);
      return Object.assign({}, cur, { P, spec, def: Object.assign({}, cur.def, { create: (s, p) => new ShootWorld(s, p, garden, { predator }) }) });
    }
    return { ShootWorld, makeShootEnv };
  }

  function genomeFor(selected) {
    const change = selected && selected.change ? selected.change : null;
    const g = SA.tunedBugGenome(change && change.tune ? change.tune : undefined);
    if (change && change.field && g.sc && g.sc[change.field] != null && isFinite(change.factor)) g.sc[change.field] *= change.factor;
    return g;
  }

  /* ---- life history: fixed number of bins; when full, neighbours merge and each bin covers twice as many steps ---- */
  // bins: [steps, food, poison, caught, stuck] (+ [shots, red shot, green shot, hunter stuns] in the shooting views)
  function newLife(nf) { return { age: 0, rounds: 0, bin: BIN0, cur: new Array(nf || 5).fill(0), hist: [] }; }
  function lifeAdd(life, d) {
    const c = life.cur, nf = c.length; for (let i = 0; i < nf; i++) c[i] += d[i];
    life.age++;
    if (c[0] >= life.bin) {
      life.hist.push(c.slice()); life.cur = new Array(nf).fill(0);
      if (life.hist.length > BINS) {
        const h = life.hist, m = [];
        for (let i = 0; i + 1 < h.length; i += 2) m.push(h[i].map((v, k) => v + h[i + 1][k]));
        if (h.length % 2) m.push(h[h.length - 1]);
        life.hist = m; life.bin *= 2;
      }
    }
  }
  function validLife(l, nf) {
    nf = nf || 5;
    return l && typeof l === 'object' && isFinite(l.age) && isFinite(l.rounds) && isFinite(l.bin) && Array.isArray(l.cur) && l.cur.length === nf &&
      Array.isArray(l.hist) && l.hist.length <= BINS + 1 && l.hist.every(b => Array.isArray(b) && b.length === nf && b.every(isFinite));
  }

  /* ---- per-step observation of one world ---- */
  function Watcher() { this.reset(); }
  Watcher.prototype.reset = function () { this.f = 0; this.p = 0; this.c = 0; this.s = [0, 0, 0, 0]; this.hx = new Float32Array(STUCK_N); this.hy = new Float32Array(STUCK_N); this.n = 0; };
  Watcher.prototype.step = function (w) {
    const a = w.agent, touching = !!(a.contact[0] || a.contact[1] || a.contact[2] || w.bumped), h = this.n % STUCK_N;
    let stuck = 0;
    if (this.n >= STUCK_N && touching) { const dx = a.x - this.hx[h], dy = a.y - this.hy[h]; stuck = dx * dx + dy * dy < STUCK_D2 ? 1 : 0; }
    this.hx[h] = a.x; this.hy[h] = a.y; this.n++;
    const d = [1, w.food - this.f, w.poison - this.p, (w.caught || 0) - this.c, stuck];
    this.f = w.food; this.p = w.poison; this.c = w.caught || 0;
    if (w.shots !== undefined) { const now = [w.shots, w.redShot, w.greenShot, w.stuns]; for (let k = 0; k < 4; k++) { d.push(now[k] - this.s[k]); this.s[k] = now[k]; } }
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

  /* ---- the stats panel beside (wide screens) or below (narrow) the canvas ---- */
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function rate(x, steps) { return steps > 0 ? (x * 1000 / steps) : 0; }
  function sumBins(bins, nf) { const s = new Array(nf || 5).fill(0); for (const b of bins) for (let i = 0; i < s.length; i++) s[i] += b[i]; return s; }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function Stats(aside, predator, shoot) {
    if (shoot) return new ShootStats(aside, predator);
    aside.innerHTML = '';
    this.predator = predator;
    this.age = el('div', 'st-age'); this.sub = el('div', 'st-sub');
    this.cv = el('canvas'); this.cv.width = 440; this.cv.height = 150; this.cv.setAttribute('aria-label', 'Food and poison per 1,000 steps over the bug\'s life');
    const rows = el('div');
    const row = (label, col) => { const r = el('div', 'st-row'), l = el('span'), k = el('i', 'st-key'), v = el('b', null, '–'); k.style.background = col; l.appendChild(k); l.appendChild(document.createTextNode(label)); r.appendChild(l); r.appendChild(v); rows.appendChild(r); return v; };
    this.food = row('Food per 1,000 steps', C.mint); this.poison = row('Poison per 1,000 steps', C.red);
    if (predator) this.caught = row('Caught per 1,000 steps', C.amber);
    this.stuck = row('Stuck on a wall', C.muted);
    this.trend = el('p', 'st-trend');
    const left = el('div'); left.appendChild(this.age); left.appendChild(this.sub); left.appendChild(this.cv);
    const right = el('div'); right.appendChild(rows); right.appendChild(this.trend);
    aside.appendChild(left); aside.appendChild(right);
    this.last = 0;
  }
  Stats.prototype.update = function (life, force) {
    const now = Date.now();
    if (!force && now - this.last < 250) return;
    this.last = now;
    const predator = this.predator, bins = life.hist.concat(life.cur[0] >= life.bin / 4 ? [life.cur] : []);
    this.age.textContent = fmt(life.age) + ' steps old';
    this.sub.textContent = life.rounds + ' round' + (life.rounds === 1 ? '' : 's') + ' finished · rates lately';
    const q = Math.max(1, Math.ceil(bins.length / 4)), recent = sumBins(bins.slice(-q)), early = sumBins(bins.slice(0, q));
    this.food.textContent = rate(recent[1], recent[0]).toFixed(1);
    this.poison.textContent = rate(recent[2], recent[0]).toFixed(1);
    if (this.caught) this.caught.textContent = rate(recent[3], recent[0]).toFixed(2);
    this.stuck.textContent = (100 * recent[4] / Math.max(1, recent[0])).toFixed(1) + '%';
    if (bins.length < 4) this.trend.textContent = 'Too early to tell whether it is improving.';
    else if (predator) {
      const a = rate(early[3], early[0]), b = rate(recent[3], recent[0]);
      this.trend.textContent = 'Caught ' + a.toFixed(2) + ' early on, ' + b.toFixed(2) + ' lately' + (b < a * 0.8 ? ': dodging better.' : b > a * 1.25 ? ': caught more often.' : ': no clear change yet.');
    } else {
      const a = early[2] / Math.max(1, early[1] + early[2]), b = recent[2] / Math.max(1, recent[1] + recent[2]);
      this.trend.textContent = 'Poison share of bites: ' + Math.round(a * 100) + '% early on, ' + Math.round(b * 100) + '% lately.';
    }
    const g = this.cv.getContext('2d'), W = this.cv.width, H = this.cv.height, pad = 6;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, H - 0.5); g.lineTo(W, H - 0.5); g.stroke();
    if (bins.length < 2) { g.fillStyle = C.muted; g.font = '22px ui-sans-serif, system-ui, sans-serif'; g.fillText('The chart starts after a few hundred steps.', 4, H / 2); return; }
    const series = [[1, C.mint], [2, C.red]].concat(predator ? [[3, C.amber]] : []);
    let top = 1; for (const b of bins) for (const [k] of series) top = Math.max(top, rate(b[k], b[0]));
    for (const [k, col] of series) {
      g.strokeStyle = col; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
      bins.forEach((b, i) => { const x = pad + (W - 2 * pad) * i / (bins.length - 1), y = H - pad - (H - 2 * pad) * rate(b[k], b[0]) / top; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
  };

  /* ---- the shooting views' panel: score, shots and the red share of hits over the bug's life ---- */
  const shootScore = (b, predator) => b[1] + b[6] - SHOOT.greenPenalty * b[7] - (predator ? 2 * b[3] : 0);
  const redShare = b => (b[6] + b[7] > 0 ? b[6] / (b[6] + b[7]) : null);
  function ShootStats(aside, predator) {
    aside.innerHTML = '';
    this.predator = predator;
    this.age = el('div', 'st-age'); this.sub = el('div', 'st-sub');
    this.cv = el('canvas'); this.cv.width = 440; this.cv.height = 150;
    this.cv.setAttribute('aria-label', 'Score and shots per 1,000 steps, and the red share of hits (full height = 100%), over the bug\'s life');
    const rows = el('div');
    const row = (label, col) => { const r = el('div', 'st-row'), l = el('span'), k = el('i', 'st-key'), v = el('b', null, '–'); k.style.background = col; l.appendChild(k); l.appendChild(document.createTextNode(label)); r.appendChild(l); r.appendChild(v); rows.appendChild(r); return v; };
    this.score = row('Score per 1,000 steps', C.mint); this.shots = row('Shots per 1,000 steps', C.amber); this.share = row('Red share of hits', C.red);
    this.food = row('Green eaten per 1,000', C.muted); this.poison = row('Red eaten per 1,000', C.muted);
    if (predator) { this.stuns = row('Hunter hits per 1,000', C.cyan); this.caught = row('Caught per 1,000', C.muted); }
    this.trend = el('p', 'st-trend');
    const left = el('div'); left.appendChild(this.age); left.appendChild(this.sub); left.appendChild(this.cv);
    const right = el('div'); right.appendChild(rows); right.appendChild(this.trend);
    aside.appendChild(left); aside.appendChild(right);
    this.last = 0;
  }
  ShootStats.prototype.update = function (life, force) {
    const now = Date.now();
    if (!force && now - this.last < 250) return;
    this.last = now;
    const P = this.predator, bins = life.hist.concat(life.cur[0] >= life.bin / 4 ? [life.cur] : []);
    this.age.textContent = fmt(life.age) + ' steps old';
    this.sub.textContent = life.rounds + ' round' + (life.rounds === 1 ? '' : 's') + ' finished · rates lately';
    const q = Math.max(1, Math.ceil(bins.length / 4)), recent = sumBins(bins.slice(-q), 9), early = sumBins(bins.slice(0, q), 9);
    this.score.textContent = rate(shootScore(recent, P), recent[0]).toFixed(1);
    this.shots.textContent = rate(recent[5], recent[0]).toFixed(1);
    const sh = redShare(recent); this.share.textContent = sh === null ? '–' : Math.round(sh * 100) + '% of ' + (recent[6] + recent[7]);
    this.food.textContent = rate(recent[1], recent[0]).toFixed(1); this.poison.textContent = rate(recent[2], recent[0]).toFixed(1);
    if (P) { this.stuns.textContent = rate(recent[8], recent[0]).toFixed(2); this.caught.textContent = rate(recent[3], recent[0]).toFixed(2); }
    if (bins.length < 4) this.trend.textContent = 'Too early to tell whether it is learning to aim.';
    else {
      const a = redShare(early), b = redShare(recent), pc = v => (v === null ? 'no hits' : Math.round(v * 100) + '%');
      this.trend.textContent = 'Red share of hits: ' + pc(a) + ' early on, ' + pc(b) + ' lately. Shots: ' + rate(early[5], early[0]).toFixed(1) + ' then ' + rate(recent[5], recent[0]).toFixed(1) + ' per 1,000 steps.';
    }
    const g = this.cv.getContext('2d'), W = this.cv.width, H = this.cv.height, pad = 6;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, H - 0.5); g.lineTo(W, H - 0.5); g.stroke();
    if (bins.length < 2) { g.fillStyle = C.muted; g.font = '22px ui-sans-serif, system-ui, sans-serif'; g.fillText('The chart starts after a few hundred steps.', 4, H / 2); return; }
    const vals = [bins.map(b => rate(shootScore(b, P), b[0])), bins.map(b => rate(b[5], b[0]))];
    let top = 1, bot = 0; for (const v of vals) for (const x of v) { top = Math.max(top, x); bot = Math.min(bot, x); }
    const X = i => pad + (W - 2 * pad) * i / (bins.length - 1), Y = v => H - pad - (H - 2 * pad) * (v - bot) / (top - bot);
    if (bot < 0) { g.strokeStyle = C.line; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke(); g.setLineDash([]); }
    [[vals[0], C.mint], [vals[1], C.amber]].forEach(([v, col]) => {
      g.strokeStyle = col; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
      v.forEach((x, i) => { if (i) g.lineTo(X(i), Y(x)); else g.moveTo(X(i), Y(x)); }); g.stroke();
    });
    g.strokeStyle = C.red; g.lineWidth = 3; g.beginPath(); let on = false;   // red share: 0..100% of the full height; gaps where there were no hits
    bins.forEach((b, i) => { const v = redShare(b); if (v === null) { on = false; return; } const y = H - pad - (H - 2 * pad) * v; if (on) g.lineTo(X(i), y); else g.moveTo(X(i), y); on = true; });
    g.stroke();
  };

  /* ---- one arena demo (a panel with its own bug, or two in compare mode) ---- */
  function makeArena(panel, demoId) {
    const q = r => panel.querySelector('[data-role="' + r + '"]');
    const canvas = q('canvas'), status = q('status'), learningBtn = q('learning'), pauseBtn = q('pause'), freshBtn = q('fresh');
    const statsEls = [q('stats'), q('base-stats')];
    const kind = canvas.dataset.task, shoot = kind === 'shoot' || kind === 'shoot-predator';
    const baseCanvas = q('baseline'), task = shoot ? kind : kind === 'hard' ? 'hard' : 'flash', predator = task === 'hard' || task === 'shoot-predator';
    const NF = shoot ? 9 : 5, kit = shoot ? shootKit() : null;
    const compare = !!baseCanvas && !shoot, key = 'computelab.bug.' + demoId + '.v' + STORE_V;
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
      return { agent, seed, label, life: newLife(NF), watch: new Watcher(), stats: null };
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
      if (!isFinite(saved.seed) || !validLife(saved.life, NF)) return false;
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
      if (shoot) return 'Round ' + (b.life.rounds + 1) + ' · Score ' + s.score + ' · Shots ' + s.shots + ' (red ' + s.redShot + ', green ' + s.greenShot + ')' +
        (predator ? ' · Hunter hit ' + s.stuns + ' · Caught ' + s.caught : '') + ' · Time ' + t.t + ' of ' + t.horizon;
      return 'Round ' + (b.life.rounds + 1) + ' · Food ' + s.food + ' · Poison ' + s.poison + (predator ? ' · Caught ' + (s.caught || 0) : '') +
        ' · Time ' + t.t + ' of ' + t.horizon + ' · ' + b.agent.brain.N + ' neurons';
    }
    function drawOne(b, cv, aside, force) {
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      b.agent.task.render(cv.getContext('2d'), W, H, { showStats: false });
      if (aside) { if (!b.stats || b.stats.aside !== aside) { b.stats = new Stats(aside, predator, shoot); b.stats.aside = aside; } b.stats.update(b.life, force); }
    }
    function draw(force) {
      if (!bugs.length) return;
      const over = roundOverAt !== null ? ' · Round over, the next one starts in a moment' : '';
      drawOne(bugs[0], canvas, statsEls[0], force);
      if (compare) {
        drawOne(bugs[1], baseCanvas, statsEls[1], force);
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
        if (now - roundOverAt >= ROUND_PAUSE) { endRound(); draw(true); }
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
        env = shoot ? kit.makeShootEnv(predator) : makeEnv(task);
        if (!restore()) fresh(note);
        applyLearning();
        pauseBtn.disabled = freshBtn.disabled = false;
        draw(true);
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
      fresh('A new bug was grown.'); save(true); draw(true);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', () => save());

    return {
      show() { visible = true; if (!started) { started = true; begin(); } else draw(true); },
      hide() { visible = false; save(); },
      // live a number of steps at once without drawing (used by the screenshot and smoke tests)
      world() { return bugs.length ? bugs[0].agent.task : null; },
      fastForward(steps) { if (!bugs.length) return 0; for (let i = 0; i < steps; i++) { if (roundDone()) endRound(); step(); } roundOverAt = null; draw(true); save(true); return bugs[0].life.age; },
    };
  }

  window.ExploreDemos = window.ExploreDemos || {};
  for (const id of ['arena', 'predator', 'shoot', 'shoot-predator']) {
    const panel = document.getElementById('demo-' + id);
    if (panel && panel.querySelector('[data-role="canvas"]')) window.ExploreDemos[id] = makeArena(panel, id);
  }
  // for tests: the history and save helpers
  window.ExploreArena = { newLife, lifeAdd, packNet, unpackNet, BINS, shootKit, SHOOT };
})();
