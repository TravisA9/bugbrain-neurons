'use strict';
/* run/selftest.js (v25): quick checks of the runner's building blocks (Node or Bun, ~1 min).
 *  1. lib.evaluateGenome gives exactly the app's Evolution fitness (same seeds, same robust formula)
 *  2. the checkpointable RNG equals SA.mulberry32
 *  3. 'free' genomes (structural genes) build and grow in the bandit and cue environments, 1 and 2 regions */
const L = require('./lib.js'), SA = L.SA, FREE = require('./free.js');
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const task = { name: 'bandit', env: 'bandit', params: { nTrials: 40 } };
L.applyEngine({ growths: 2, episodes: 1, robustW: 0.5, popSize: 2 });
const rt = { name: task.name, env: task.env, params: L.taskEnvParams(task) };
L.setupTask(task);
const g1 = SA.PLANS.rewardK.make(), g2 = SA.mutate(SA.cloneGenome(g1), SA.mulberry32(5));
const evo = new SA.Evolution(1, true); evo.pop = [g1, g2]; evo.restartGeneration();
while (evo.phase === 'pop') evo.run(1);
const plan = L.seedPlan({ growths: 2, episodes: 1 }, 0, false);
const mine = [g1, g2].map(g => L.evaluateGenome(L.serialize({ g }), [rt], plan).tasks[0].fit);
check(mine[0] === g1.fitness && mine[1] === g2.fitness, `runner fitness = app Evolution fitness (${mine.map(x => x.toFixed(6)).join(', ')} vs ${[g1.fitness, g2.fitness].map(x => x.toFixed(6)).join(', ')})`);
const a = L.makeRng(12345), b = SA.mulberry32(12345); let same = true; for (let i = 0; i < 1000; i++) if (a() !== b()) same = false;
const c = L.makeRng(a.state()); check(same && c() === a(), 'checkpointable RNG = mulberry32 and resumes from its saved state');
const r = L.makeRng(3), errs = [];
let two = 0;
for (let i = 0; i < 6; i++) {
  let x = L.startGenome('free:reward'); for (let m = 0; m < 3; m++) x = FREE.mutate(SA, x, r, 1);
  if (i === 0) { x.free.opts.regions = 2; x = { g: FREE.make(SA, 'reward', x.free.opts), free: x.free }; }
  if (x.free.opts.regions >= 2) two++;
  for (const t of [rt, { name: 'cueR', env: 'cue', params: L.taskEnvParams({ env: 'cue', params: { mapping: 'random', nTrials: 4 } }) }]) {
    const res = L.evaluateGenome(L.serialize(x), [t], L.seedPlan({ growths: 1, episodes: 1 }, 0, false));
    if (res.error) errs.push(res.error); else if (!(res.brain.hidden > 0)) errs.push('no hidden cells: ' + JSON.stringify(x.free.opts));
  }
}
check(!errs.length && two > 0, `free genomes build and grow (6 structural mutants incl. ${two} with 2 regions, bandit + cue)` + (errs.length ? ': ' + errs[0] : ''));
const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(L.startGenome('free:reward')))));
check(back.free && back.free.base === 'reward' && back.g.kind === 'cell', 'free genome serialises and deserialises');
{ const T = [{}, {}, {}, {}], R = T.map(() => ({ lo: 0, hi: 1 })), mk = a => ({ tasks: a.map(f => ({ fit: f })) });
  const lop = mk([0.2, 0.55, 1.63, 2.34]), bal = mk([1.0, 1.0, 1.0, 1.0]), sm = { type: 'softmin', tau: 0.25, cap: 1.5 };
  const a1 = L.normFit(lop, T, R).fit, b1 = L.normFit(bal, T, R).fit, a2 = L.normFit(lop, T, R, sm).fit, b2 = L.normFit(bal, T, R, sm).fit;
  check(a1 > b1 && b2 > a2 && Math.abs(b2 - 1) < 1e-9 && a2 < 0.6 && L.normFit(lop, T, R, 'min').fit === 0.2, `balanced fitness: lopsided genome wins under mean (${a1.toFixed(2)} vs ${b1}) but loses under softmin (${a2.toFixed(2)} vs ${b2.toFixed(2)})`); }
console.log(fails ? fails + ' FAILED' : 'RUNNER SELFTEST: ALL OK'); process.exit(fails ? 1 : 0);
