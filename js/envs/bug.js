/* =====================================================================
 * envs/bug.js — environment 'Bug arena' (the original task family).
 * A two-wheeled bug with 9 eyes (wall / green / red per eye), 3 touch (bump)
 * sensors, a tonic neuron and 2 turning sensors; outputs: left wheel, right
 * wheel, speed. Tasks: flash (memory: food visible only in brief flashes),
 * flashvis (control: same arena, food always visible), hard (drifting items
 * + chasing predator), normal (60 still items).
 * Behaviour and sensor placement are identical to v6 (v6 champions regrow and
 * score bit-identically).
 * ===================================================================== */
(function () {
'use strict';
const NUM_EYES = 9, SENSE_TYPES = ['wall', 'food', 'poison'];
const BUMP_NAMES = ['bump_left', 'bump_front', 'bump_right'], GYRO_NAMES = ['gyro_left', 'gyro_right'], MOTOR_NAMES = ['left', 'right', 'speed'];
const TONIC = 27, BUMP0 = 28, GYRO0 = 31, N_INPUT = 33;
const FIXED_CLASSES = ['eye-wall', 'eye-green', 'eye-red', 'tonic', 'bump', 'motor-L', 'motor-R', 'motor-speed', 'gyro'];
const TAG_NAMES = ['wall-eye', 'green-eye', 'red-eye', 'bump', 'motor', 'speed', 'tonic', 'free'];
const SPEED_REF = 1 / 6;   // firing rate of a LIF neuron driven by 3 mV/substep alone (motorBias default)

// IO spec: same channel order, positions, tags and growth order as v6
function bugIO(P) {
  const inputs = [];
  for (let k = 0; k < NUM_EYES; k++) for (let t = 0; t < 3; t++) {
    const x = (k - 4) / 4 * 0.9;
    inputs.push({ name: 'eye' + k + '_' + SENSE_TYPES[t], group: 'eye-' + SENSE_TYPES[t], tag: t, cls: t, pos: [x, 1 - t * 0.03], at: [x, 1],
                  mirror: (8 - k) * 3 + t, midline: k === 4 });
  }
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.85], midline: true, tonic: true });
  for (let j = 0; j < 3; j++) inputs.push({ name: BUMP_NAMES[j], group: 'bump', tag: 3, cls: 4, pos: [(j - 1) * 0.9, 0.7], mirror: j === 1 ? undefined : BUMP0 + 2 - j, midline: j === 1 });
  for (let j = 0; j < 2; j++) inputs.push({ name: GYRO_NAMES[j], group: 'gyro', tag: 8, cls: 8, pos: [j ? 0.6 : -0.6, 0.6], ownRng: true });
  const outputs = [
    { name: 'left', group: 'wheel', tag: 4, cls: 5, pos: [-0.5, -1], bias: P.motorBias, mirror: 1 },
    { name: 'right', group: 'wheel', tag: 4, cls: 6, pos: [0.5, -1], bias: P.motorBias, mirror: 0 },
    { name: 'speed', group: 'speed', tag: 5, cls: 7, pos: [0, -1], bias: P.motorBias }];
  const coneOrder = []; for (let i = 0; i < 27; i++) coneOrder.push(i); coneOrder.push(28, 29, 30, 27, 31, 32);
  const cueSources = []; for (let k = 0; k < NUM_EYES; k++) cueSources.push([(k - 4) / 4 * 0.9, 1]);
  const waves = [0, 1, 2].map(t => Array.from({ length: NUM_EYES }, (_, k) => k * 3 + t));
  return { inputs, outputs, classes: FIXED_CLASSES, tagNames: TAG_NAMES, coneOrder, cueSources,
           juvenile: { waves, waveGain: P.inputGain, tonic: [[TONIC, P.tonicCurrent]], kicks: { chans: [28, 29, 30], p: 0.02, gain: P.bumpGain } } };
}
/* ---------------- the arena ---------------- */
const WORLD_W = 700, WORLD_H = 500, AGENT_R = 10, ITEM_R = 10, TURN_RATE = 0.12;
const EYE_ANGLES = []; for (let k = 0; k < NUM_EYES; k++) EYE_ANGLES.push((k - (NUM_EYES - 1) / 2) * 0.28);
function makeWalls() {
  const w = [], box = (x, y, bw, bh, open) => {
    w.push([x, y, x + bw, y]); w.push([x + bw, y, x + bw, y + bh]);
    w.push([x + bw, y + bh, x, y + bh]); if (!open) w.push([x, y + bh, x, y]);
  };
  box(10, 10, WORLD_W - 20, WORLD_H - 20);
  box(110, 110, 160, 280, true);     // two open boxes (like the ConvNetJS demo)
  box(430, 110, 160, 280, true);
  return w;
}
const WALLS = makeWalls();
function pointSegDist2(px, py, s) {
  const [x1, y1, x2, y2] = s, dx = x2 - x1, dy = y2 - y1;
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy); t = clamp(t, 0, 1);
  const ex = x1 + t * dx - px, ey = y1 + t * dy - py; return ex * ex + ey * ey;
}
function nearWall(x, y, r) { for (const s of WALLS) if (pointSegDist2(x, y, s) < r * r) return true; return false; }

// The 'hard' task.
const HARD = { nItems: 30, foodFrac: 0.4, itemSpeed: 0.6, nPredators: 1, predSpeed: 1.6, predRange: 200, caughtCost: 2 };
const PRED_R = 9;
// The 'flash' memory task: food flashes visible for FLASH.on ticks every FLASH.period ticks (own phase).
const FLASH = { nItems: 30, foodFrac: 0.5, on: 8, period: 100 };
class World {
  constructor(seed, P) {
    this.P = P = P || envParams.bug; const params = P;
    this.rng = mulberry32(seed >>> 0);
    this.walls = WALLS; this.items = [];
    this.hard = params.task === 'hard'; this.flash = params.task === 'flash' || params.task === 'flashvis'; this.flashHide = params.task === 'flash';
    this.t = 0; this.food = 0; this.poison = 0; this.caught = 0; this.bumps = 0; this.bumped = 0; this.energy = 0; this.speedSum = 0;
    this.contactTicks = 0; this.stuckTicks = 0;
    this.histX = new Float32Array(30); this.histY = new Float32Array(30);   // positions of the last 30 ticks
    // Items have a COLOUR (1 green, 2 red); eyes see colour. Normally green = food.
    // With randomValence, odd arena seeds swap it: red is food, green is poison.
    this.greenIsFood = this.greenIsFoodAtBirth = !(params.randomValence && (seed & 1));
    this.reversed = false;             // with params.reversal the colours swap halfway through life
    this.foodLog = [];                 // tick of every food (for within-lifetime learning curves)
    this.poisonLog = [];
    this.rewardLog = [];               // [tick, reward] (generic learning read-out)
    this.predators = [];
    for (let i = 0; i < (this.hard ? HARD.nItems : this.flash ? FLASH.nItems : params.nItems); i++) this.items.push(this.spawnItem());
    const a = this.agent = { x: 0, y: 0, angle: 0, wl: 0, wr: 0, speed: 1, eyes: [], contact: [0, 0, 0], stuck: false };
    do { a.x = 20 + this.rng() * (WORLD_W - 40); a.y = 20 + this.rng() * (WORLD_H - 40); } while (nearWall(a.x, a.y, 25));
    a.angle = this.rng() * Math.PI * 2;
    if (this.hard) for (let i = 0; i < HARD.nPredators; i++) this.predators.push(this.spawnPredator());
    for (let k = 0; k < NUM_EYES; k++) a.eyes.push({ dist: params.eyeRange, type: -1 });
  }
  spawnItem() {
    let x, y; const r = this.rng;
    do { x = 20 + r() * (WORLD_W - 40); y = 20 + r() * (WORLD_H - 40); } while (nearWall(x, y, ITEM_R + 8));
    if (this.flash) { const food = r() < FLASH.foodFrac; return { x, y, type: food === this.greenIsFood ? 1 : 2, phase: (r() * FLASH.period) | 0 }; }
    if (!this.hard) return { x, y, type: r() < 0.5 ? 1 : 2 };   // type = colour: 1 = green, 2 = red
    const food = r() < HARD.foodFrac, ang = r() * Math.PI * 2, v = HARD.itemSpeed * (0.5 + r());
    return { x, y, type: food === this.greenIsFood ? 1 : 2, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v };
  }
  // Predator: placed far from the bug; it looks like poison (the colour that is currently bad).
  spawnPredator() {
    let x, y, n = 0; const r = this.rng, a = this.agent;
    do { x = 20 + r() * (WORLD_W - 40); y = 20 + r() * (WORLD_H - 40); n++; }
    while ((nearWall(x, y, PRED_R + 4) || (x - a.x) ** 2 + (y - a.y) ** 2 < 250 * 250) && n < 200);
    return { x, y, angle: r() * Math.PI * 2 };
  }
  predColor() { return this.greenIsFood ? 2 : 1; }
  // Can the eyes see this item now? (flash task: food only during its flash; poison always)
  visible(it) { return !this.flashHide || (it.type === 1) !== this.greenIsFood || (this.t + it.phase) % FLASH.period < FLASH.on; }
  // Hard task: items drift and bounce, the predator chases the bug when it is close.
  stepThings() {
    for (const it of this.items) {
      const nx = it.x + it.vx, ny = it.y + it.vy;
      if (nearWall(nx, ny, ITEM_R + 2)) { const ang = this.rng() * Math.PI * 2, v = Math.hypot(it.vx, it.vy); it.vx = Math.cos(ang) * v; it.vy = Math.sin(ang) * v; }
      else { it.x = nx; it.y = ny; }
    }
    const a = this.agent;
    for (const p of this.predators) {
      const dx = a.x - p.x, dy = a.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 < HARD.predRange * HARD.predRange) {                 // chase (turning rate limited)
        let rel = Math.atan2(dy, dx) - p.angle; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        p.angle += clamp(rel, -0.08, 0.08);
      } else p.angle += (this.rng() - 0.5) * 0.3;                 // wander
      const sp = d2 < HARD.predRange * HARD.predRange ? HARD.predSpeed : HARD.predSpeed * 0.5;
      const nx = p.x + Math.cos(p.angle) * sp, ny = p.y + Math.sin(p.angle) * sp;
      if (nearWall(nx, ny, PRED_R)) p.angle += Math.PI * (0.5 + this.rng()); else { p.x = nx; p.y = ny; }
    }
  }
  // Cast every eye ray; store nearest hit distance & type (0 wall,1 food,2 poison,-1 none)
  look() {
    const a = this.agent, EYE_RANGE = this.P.eyeRange;
    for (let k = 0; k < NUM_EYES; k++) {
      const ang = a.angle + EYE_ANGLES[k], dx = Math.cos(ang), dy = Math.sin(ang);
      let best = EYE_RANGE, type = -1;
      for (const s of this.walls) {                 // ray vs segment
        const sx = s[2] - s[0], sy = s[3] - s[1], den = dx * sy - dy * sx;
        if (Math.abs(den) < 1e-9) continue;
        const qx = s[0] - a.x, qy = s[1] - a.y;
        const t = (qx * sy - qy * sx) / den, u = (qx * dy - qy * dx) / den;
        if (t > 0 && t < best && u >= 0 && u <= 1) { best = t; type = 0; }
      }
      for (const it of this.items) {                // ray vs circle
        if (!this.visible(it)) continue;
        const fx = a.x - it.x, fy = a.y - it.y;
        if (fx * fx + fy * fy > (EYE_RANGE + ITEM_R) * (EYE_RANGE + ITEM_R)) continue;
        const b = fx * dx + fy * dy, c = fx * fx + fy * fy - ITEM_R * ITEM_R, disc = b * b - c;
        if (disc < 0) continue;
        let t = -b - Math.sqrt(disc); if (t < 0) t = 0;
        if (t < best && -b + Math.sqrt(disc) > 0) { best = t; type = it.type; }
      }
      for (const p of this.predators) {             // the predator: a bigger "poison-coloured" disc
        const fx = a.x - p.x, fy = a.y - p.y;
        const b = fx * dx + fy * dy, c = fx * fx + fy * fy - PRED_R * PRED_R, disc = b * b - c;
        if (disc < 0) continue;
        let t = -b - Math.sqrt(disc); if (t < 0) t = 0;
        if (t < best && -b + Math.sqrt(disc) > 0) { best = t; type = this.predColor(); }
      }
      a.eyes[k].dist = best; a.eyes[k].type = type;
    }
    // touch: which side of the body is against a wall (left / front / right sector)
    const c = a.contact; c[0] = c[1] = c[2] = 0; const R2 = (AGENT_R + 3) ** 2;
    for (const s of this.walls) {
      const [x1, y1, x2, y2] = s, dx = x2 - x1, dy = y2 - y1;
      let u = ((a.x - x1) * dx + (a.y - y1) * dy) / (dx * dx + dy * dy); u = clamp(u, 0, 1);
      const px = x1 + u * dx - a.x, py = y1 + u * dy - a.y;
      if (px * px + py * py > R2) continue;
      let rel = Math.atan2(py, px) - a.angle; rel = Math.atan2(Math.sin(rel), Math.cos(rel));   // wrap to [-pi, pi]
      c[rel < -0.6 ? 0 : rel > 0.6 ? 2 : 1] = 1;                // + angles are on the right (screen y down)
    }
  }
  // Differential drive. wl, wr in [-1,1] (negative = backwards). Returns reward this tick.
  move(wl, wr, speedMul) {
    if (speedMul == null) speedMul = 1; const params = this.P;
    if (params.reversal && !this.reversed && this.t >= params.episodeTicks / 2) { this.reversed = true; this.greenIsFood = !this.greenIsFood; }
    const a = this.agent; a.wl = wl; a.wr = wr; a.speed = speedMul;
    a.angle += (wl - wr) * TURN_RATE;               // left faster -> turn right
    const fwd = (wl + wr) * 0.5;
    const sp = fwd * params.maxSpeed * speedMul;
    this.energy += speedMul * speedMul * Math.abs(fwd);   // cost grows with the square of speed
    this.speedSum += speedMul;
    const nx = a.x + Math.cos(a.angle) * sp, ny = a.y + Math.sin(a.angle) * sp;
    if (!nearWall(nx, ny, AGENT_R)) { a.x = nx; a.y = ny; this.bumped = 0; }
    else { this.bumped = sp !== 0 ? 1 : 0; this.bumps += this.bumped; }  // blocked by walls
    // stuck = moved less than 10 px over the last 30 ticks (pinned on a wall, spinning in place...)
    const h = this.t % 30;
    if (this.t >= 30) { const ddx = a.x - this.histX[h], ddy = a.y - this.histY[h]; a.stuck = ddx * ddx + ddy * ddy < 100; if (a.stuck) this.stuckTicks++; }
    this.histX[h] = a.x; this.histY[h] = a.y;
    if (a.contact[0] || a.contact[1] || a.contact[2]) this.contactTicks++;
    let reward = 0;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i], dx = it.x - a.x, dy = it.y - a.y;
      if (dx * dx + dy * dy < (AGENT_R + ITEM_R) ** 2) {
        if ((it.type === 1) === this.greenIsFood) { this.food++; reward += 1; this.foodLog.push(this.t); this.rewardLog.push([this.t, 1]); }
        else { this.poison++; reward -= 1; this.poisonLog.push(this.t); this.rewardLog.push([this.t, -1]); }
        this.items[i] = this.spawnItem();
      }
    }
    if (this.hard) {
      this.stepThings();
      for (let i = 0; i < this.predators.length; i++) {
        const p = this.predators[i];
        if ((p.x - a.x) ** 2 + (p.y - a.y) ** 2 < (AGENT_R + PRED_R) ** 2) { this.caught++; reward -= HARD.caughtCost; this.poisonLog.push(this.t); this.rewardLog.push([this.t, -HARD.caughtCost]); this.predators[i] = this.spawnPredator(); }
      }
    }
    this.t++;
    return reward;
  }
  /* ----- environment interface ----- */
  get done() { return this.t >= this.P.episodeTicks; }
  get horizon() { return this.P.episodeTicks; }
  sense(ext) {
    const P = this.P; this.look();
    for (let k = 0; k < NUM_EYES; k++) {           // sensory encoding: current ~ proximity
      const e = this.agent.eyes[k];
      if (e.type >= 0) Enc.current(ext, k * 3 + e.type, 1 - e.dist / P.eyeRange, P.inputGain);
    }
    ext[TONIC] = P.tonicCurrent;
    if (P.bumpSensors) for (let j = 0; j < 3; j++) ext[BUMP0 + j] = this.agent.contact[j] * P.bumpGain;
    if (P.gyroSensors) { const d = this.agent.wl - this.agent.wr;     // last tick's turn: wr > wl = turning left
      ext[GYRO0] = Math.max(0, -d) * P.gyroGain; ext[GYRO0 + 1] = Math.max(0, d) * P.gyroGain; }
  }
  act(out) {
    const P = this.P, G = P.motorGain, Z = P.motorZero;
    const wl = Dec.rateToValue(out.rates[0], Z, G, -1, 1), wr = Dec.rateToValue(out.rates[1], Z, G, -1, 1);
    // speed neuron: at its resting drive (motorBias alone) it fires at SPEED_REF -> multiplier 1.0;
    // silenced -> 0.2 (crawl), driven hard -> up to 1.5 (sprint).
    const speedMul = clamp(0.2 + 0.8 * out.rates[2] / SPEED_REF, 0.2, 1.5);
    const f0 = this.food, p0 = this.poison, c0 = this.caught;
    const reward = this.move(wl, wr, speedMul);
    const a = this.agent, touching = P.wallMod && (a.contact[0] || a.contact[1] || a.contact[2] || this.bumped) ? 1 : 0;
    return { pos: this.food - f0, neg: this.poison - p0 + HARD.caughtCost * (this.caught - c0), pain: touching, reward };
  }
  score() { return worldScore(this); }
  // fitness = task score - energy cost - stuck penalty
  fitness() { return worldScore(this) - this.P.energyCost * this.energy / 1000 - this.P.stuckPenalty * this.stuckTicks / 100; }
  stats() { return { food: this.food, poison: this.poison, caught: this.caught, stuck: this.stuckTicks, score: worldScore(this) }; }
  statusLine() { return `food ${this.food} · poison ${this.poison}` + (this.hard ? ` · caught ${this.caught}` : '') + ` · score ${worldScore(this)} · t ${this.t}/${this.P.episodeTicks}`; }
  keyStats() { return `score ${worldScore(this)}`; }   // v19: shown only in the app's status line
  outputView() {      // bars for the UI: wheels -1..1, speed 0.2..1.5
    const a = this.agent; return [{ name: 'L wheel', v: a.wl, lo: -1, hi: 1 }, { name: 'R wheel', v: a.wr, lo: -1, hi: 1 }, { name: 'speed ×', v: a.speed || 1, lo: 0.2, hi: 1.5, ref: 1 }];
  }
  render(c, W, H, opts) { drawWorld(this, c, opts || {}); }
}

// Task score of one life (what the stats show): food - poison - 2 x caught by predator.
function worldScore(w) { return w.food - w.poison - HARD.caughtCost * w.caught; }

function drawWorld(w, c, opts) {
  const a = w.agent;
  c.clearRect(0, 0, WORLD_W, WORLD_H); c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, WORLD_W, WORLD_H);
  c.lineWidth = 2; c.strokeStyle = '#222'; c.beginPath();
  for (const s of w.walls) { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); } c.stroke();
  for (const it of w.items) {
    const vis = w.visible(it); if (!vis && !w.P.showHidden) continue;
    c.globalAlpha = vis ? 1 : 0.22;
    c.fillStyle = it.type === 1 ? '#3cb54a' : '#e04848';
    c.beginPath(); c.arc(it.x, it.y, ITEM_R, 0, 7); c.fill();
    if (!vis) { c.strokeStyle = '#3cb54a'; c.setLineDash([2, 2]); c.stroke(); c.setLineDash([]); }
    c.globalAlpha = 1;
  }
  for (const p of w.predators) {
    c.fillStyle = w.predColor() === 1 ? '#3cb54a' : '#e04848'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.arc(p.x, p.y, PRED_R, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(p.angle) * 14, p.y + Math.sin(p.angle) * 14); c.stroke();
  }
  c.lineWidth = 1;
  for (let k = 0; k < NUM_EYES; k++) {
    const e = a.eyes[k], ang = a.angle + EYE_ANGLES[k];
    c.strokeStyle = e.type === 1 ? '#2a9d3a' : e.type === 2 ? '#d43c3c' : e.type === 0 ? '#777' : '#bbb';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + Math.cos(ang) * e.dist, a.y + Math.sin(ang) * e.dist); c.stroke();
  }
  c.fillStyle = '#4a6cf7'; c.strokeStyle = '#1b2a8a'; c.lineWidth = 2;
  c.beginPath(); c.arc(a.x, a.y, AGENT_R, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + Math.cos(a.angle) * 14, a.y + Math.sin(a.angle) * 14); c.stroke();
  if (a.contact[0] || a.contact[1] || a.contact[2]) { c.strokeStyle = '#ff9f43'; c.lineWidth = 3; c.beginPath(); c.arc(a.x, a.y, AGENT_R + 4, 0, 7); c.stroke(); }
  c.fillStyle = 'rgba(244,241,234,.85)'; c.fillRect(14, 14, 560, 40); c.fillStyle = '#222'; c.font = '13px system-ui';
  c.fillText(`food ${w.food}   poison ${w.poison}` + (w.hard ? `   caught ${w.caught}` : '') + `   t ${w.t}/${w.P.episodeTicks}   ` +
             (w.greenIsFood ? 'GREEN = food' : 'RED = food (colours swapped)'), 18, 30);
  c.fillText(`wall contact ${(100 * w.contactTicks / Math.max(1, w.t)).toFixed(0)}% of ticks · stuck ${(100 * w.stuckTicks / Math.max(1, w.t)).toFixed(0)}%` + (a.stuck ? '  ← STUCK' : ''), 18, 48);
}

registerEnv({
  id: 'bug', name: 'Bug arena', view: { width: WORLD_W, height: WORLD_H },
  description: 'A two-wheeled bug with 9 eyes, touch and turning sensors forages food and avoids poison (flash = memory task).',
  defaultPlan: 'v3h',
  params: {
    task: { value: 'flash', label: 'Task', options: [['flash', 'Memory: food only flashes visible (8 of 100 ticks)'], ['flashvis', 'Memory-task arena, food always visible (control)'],
             ['hard', 'Hard: drifting items + chasing predator'], ['normal', 'Normal: 60 still items, 50/50']] },
    episodeTicks: { value: 1500, min: 300, max: 4000, step: 100, label: 'Ticks per arena' },
    stuckPenalty: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'Stuck penalty /100 ticks', note: '0 = off' },
    energyCost: { value: 0, min: 0, max: 10, step: 0.5, label: 'Energy cost of speed', note: '0 = off' },
    reversal: { value: false, label: 'Reversal: food/poison colours swap halfway through every lifetime' },
    randomValence: { value: false, label: 'Random food/poison colours per lifetime (must LEARN which colour is good)' },
    bumpSensors: { value: true, label: 'Wall-contact (bump) sensor neurons' },
    gyroSensors: { value: true, label: 'Turning (angular velocity) sensor neurons' },
    showHidden: { value: true, label: 'Draw currently invisible food faintly (display only)' },
    nItems: { value: 60, hidden: true }, eyeRange: { value: 120, hidden: true }, maxSpeed: { value: 3.0, hidden: true },
    gyroGain: { value: 6, hidden: true }, bumpGain: { value: 10, hidden: true }, wallMod: { value: true, hidden: true },
    inputGain: { value: 10, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, motorBias: { value: 3.0, hidden: true },
    motorGain: { value: 5, hidden: true }, motorZero: { value: 0.08, hidden: true },
  },
  io: bugIO,
  create(seed, P) { return new World(seed, P); },
});
SpikingArena.bug = { World, worldScore, WORLD_W, WORLD_H, AGENT_R, ITEM_R, PRED_R, HARD, FLASH, WALLS, EYE_ANGLES, NUM_EYES, SENSE_TYPES, TONIC, BUMP0, GYRO0, N_INPUT,
  BUMP_NAMES, GYRO_NAMES, MOTOR_NAMES, FIXED_CLASSES, TAG_NAMES, SPEED_REF, bugIO };
})();
