#!/usr/bin/env node
// Headless check for the Explore shooting views (#shoot, #shoot-predator in hosting/computelab/private/explore-arena.js).
// Loads the served engine bundle and the view script (with a stub page, no browser) and checks:
//   1. a red hit pays, a green hit costs, a shot costs a little, projectiles stop at walls;
//   2. the cooldown: holding the fire neuron on fires exactly once per cooldown, and attempts in between are refused;
//   3. the hunter: a hit stuns it (frozen, knocked back, small reward), it wakes up and chases again; being caught costs 2;
//   4. the grown v3h brain (4 outputs: wheels, speed, fire) lives several rounds in both views with learning on, fires,
//      never fires faster than the cooldown, and throws nothing.
// The engine itself is untouched: #arena / #predator run the same code as before (see EXPLORE.md).
//   node tools/shoot_check.js [--ticks 6000]        exit 0 = all good
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2), TICKS = +(args[args.indexOf('--ticks') + 1] || 6000) || 6000;
const dir = path.resolve(__dirname, '../hosting/computelab/private');
const ctx = vm.createContext({ console, performance, Math, Date, JSON, setTimeout, setInterval, clearInterval });
vm.runInContext(fs.readFileSync(path.join(dir, 'bugbrain.js'), 'utf8'), ctx, { filename: 'bugbrain.js' });
ctx.window = { SpikingArena: vm.runInContext('SpikingArena', ctx) };
ctx.document = { getElementById: () => null, addEventListener() {} };
vm.runInContext(fs.readFileSync(path.join(dir, 'explore-arena.js'), 'utf8'), ctx, { filename: 'explore-arena.js' });
const SA = ctx.window.SpikingArena, X = ctx.window.ExploreArena, S = X.SHOOT, K = X.shootKit();
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const out = (fire, l = 0.1, r = 0.1, sp = 1 / 6) => ({ rates: [l, r, sp, fire] });

// a world with the bug parked in open ground, facing +x, nothing else around
function bare(predator) {
  const env = K.makeShootEnv(predator), w = env.def.create(4242, env.P, env.spec);
  w.items = []; w.predators = []; const a = w.agent; a.x = 600; a.y = 620; a.angle = 0;
  return { env, w };
}
{ // 1. hits
  const { w } = bare(false); w.items.push({ x: 660, y: 622, type: w.greenIsFood ? 2 : 1, phase: 0 });   // red, 60 px ahead
  let pos = 0, neg = 0; for (let t = 0; t < 12; t++) { const e = w.act(out(t === 0 ? 1 : 0, 0.08, 0.08, 0)); pos += e.pos; neg += e.neg; }
  check(w.shots === 1 && w.redShot === 1 && w.greenShot === 0 && pos >= S.redReward && Math.abs(neg - S.cost) < 1e-9, 'a shot that hits red removes it and pays; the shot itself costs ' + S.cost);
  const g = bare(false).w; g.items.push({ x: 660, y: 620, type: g.greenIsFood ? 1 : 2, phase: 0 });   // green
  let n2 = 0; for (let t = 0; t < 12; t++) n2 += g.act(out(t === 0 ? 1 : 0, 0.08, 0.08, 0)).neg;
  check(g.greenShot === 1 && g.redShot === 0 && Math.abs(n2 - S.cost - S.greenPenalty) < 1e-9 && g.score() === -S.greenPenalty, 'a shot that hits green removes it and is penalised (score = green eaten + red shot - green shot)');
  const wl = bare(false).w; wl.agent.x = 1080; wl.act(out(1, 0.08, 0.08, 0)); for (let t = 0; t < 8; t++) wl.act(out(0, 0.08, 0.08, 0));
  check(wl.bullets.length === 0, 'projectiles stop at walls');
}
{ // 2. cooldown
  const { w } = bare(false); for (let t = 0; t < 200; t++) w.act(out(1, 0.08, 0.08, 0));
  const gaps = w.shotLog.slice(1).map((v, k) => v - w.shotLog[k]);
  check(w.shots === Math.ceil(200 / S.cooldown) && gaps.every(d => d === S.cooldown) && w.blocked === 200 - w.shots,
    'holding fire on shoots exactly every ' + S.cooldown + ' steps (' + w.shots + ' shots in 200 steps, ' + w.blocked + ' refused)');
}
{ // 3. hunter
  const { w } = bare(true); const p = { x: 720, y: 620, angle: Math.PI, stun: 0 }; w.predators.push(p);
  let pos = 0; for (let t = 0; t < 14 && !w.stuns; t++) pos += w.act(out(t === 0 ? 1 : 0, 0, 0, 0)).pos;
  const at = [p.x, p.y];
  check(w.stuns === 1 && p.stun > 0 && p.x > 720 && pos >= S.stunReward, 'a hit stuns the hunter, knocks it back and gives a small reward');
  for (let t = 0; t < 20; t++) w.act(out(0, 0, 0, 0));
  check(p.x === at[0] && p.y === at[1], 'a stunned hunter stays frozen');
  for (let t = 0; t < S.stunTicks; t++) w.act(out(0, 0, 0, 0));
  check(p.stun === 0 && (p.x !== at[0] || p.y !== at[1]), 'it wakes up after ' + S.stunTicks + ' steps and chases again');
  const c = bare(true).w; c.predators.push({ x: c.agent.x + 5, y: c.agent.y, angle: 0, stun: 0 });
  const e = c.act(out(0, 0, 0, 0));
  check(c.caught === 1 && e.neg >= SA.bug.HARD.caughtCost && c.score() === -SA.bug.HARD.caughtCost, 'being caught costs ' + SA.bug.HARD.caughtCost + ', as in #predator');
}
// 4. the real brain, both views
for (const predator of [false, true]) {
  const name = predator ? '#shoot-predator' : '#shoot', env = K.makeShootEnv(predator), genome = SA.tunedBugGenome(), seed = 20261123;
  SA.params.plasticity = true;
  let err = null, tot = { shots: 0, red: 0, green: 0, stuns: 0, caught: 0 }, minGap = Infinity, rounds = 0, nOut = 0;
  try {
    const brain = SA.growCell(genome, { seed, spec: env.spec }); nOut = brain.nOut;
    const ag = new SA.Agent(genome, seed, brain, env); ag.task = env.def.create(seed + 1, env.P, env.spec);
    const close = w => { tot.shots += w.shots; tot.red += w.redShot; tot.green += w.greenShot; tot.stuns += w.stuns; tot.caught += w.caught;
      for (let k = 1; k < w.shotLog.length; k++) minGap = Math.min(minGap, w.shotLog[k] - w.shotLog[k - 1]);
      if (!Object.values(w.stats()).every(Number.isFinite)) throw new Error('non-finite stats'); };
    for (let t = 0; t < TICKS; t++) { if (ag.done) { close(ag.task); rounds++; ag.task = env.def.create(seed + 1 + rounds, env.P, env.spec); } ag.tick(); }
    close(ag.task);
  } catch (e) { err = e; }
  check(!err && nOut === 4, name + ': v3h grows with 4 outputs (left, right, speed, fire) and lives ' + TICKS + ' steps with learning on' + (err ? ' - ' + err.message : ''));
  check(tot.shots > 0 && minGap >= S.cooldown, name + ': it fires (' + tot.shots + ' shots: ' + tot.red + ' red, ' + tot.green + ' green hits' +
    (predator ? ', ' + tot.stuns + ' hunter hits, caught ' + tot.caught : '') + ') and never faster than the cooldown (closest ' + minGap + ' steps)');
}
console.log(fails ? fails + ' FAILED' : 'shoot checks passed');
process.exit(fails ? 1 : 0);
