#!/usr/bin/env node
// Paired head-to-head of two BugBrain plans (default: bugSOTA vs v3h) in the Explore arena (garden layout),
// under the SAME physics for both. Pre-registration: hosting/computelab/BUG_AUDIT.md.
//
//   node tools/bug_audit.js [--ref e923906] [--growths 16] [--rounds 8] [--ticks 1500] [--tasks flash,hard]
//                           [--physics standard,assisted] [--plans bugSOTA,v3h] [--seed 1] [--learning on|off]
//                           [--out file.json]
//
// --ref      git commit whose js/core + js/envs are loaded (bugSOTA and the "assisted" physics exist on e923906;
//            on a core without the plan, bugSOTA = v3h + the same neuromodulator genes, and 'assisted' is refused)
// physics    standard = the arena the live demo uses (env steering off for BOTH plans, even though the bugSOTA genome
//                       normally switches it on); assisted = the env's built-in steering (sotaPhysics) on for BOTH.
// tasks      flash = the live #arena (food seen only in flashes); hard = #predator (drifting items + a chasing predator).
// Each growth seed grows one brain per plan; it then lives --rounds arenas in a row (one network, learning carried
// over, as in the long-running demo). Round r of growth g uses the same arena seed for both plans.
// Per round: food, poison, caught, score (food - poison - 2 x caught), poison share of bites, wall contact ticks,
// wall contacts (touch onsets), wall-stuck ticks (touching a wall AND moved < 10 px over the last 30 ticks),
// stuck ticks (moved < 10 px over 30 ticks anywhere, the env's own measure).
// Light: one process, single-threaded; the full default run is ~1.5 M arena ticks.
'use strict';
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), vm = require('vm');
const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ref = opt('--ref', 'e923906'), G = +opt('--growths', '16'), R = +opt('--rounds', '8'), TICKS = +opt('--ticks', '1500');
const TASKS = opt('--tasks', 'flash,hard').split(','), PHYS = opt('--physics', 'standard,assisted').split(','), PLANS = opt('--plans', 'bugSOTA,v3h').split(',');
const SEED0 = +opt('--seed', '1'), LEARN = opt('--learning', 'on') !== 'off', OUT = opt('--out', '');
const STUCK_N = 30, STUCK_D2 = 100, CAUGHT_COST = 2;

// ---- load the engine from one commit (same files as the browser bundle) ----
const FILES = ['core/base.js', 'core/io.js', 'core/develop.js', 'core/regions.js', 'core/plans.js', 'core/net.js', 'core/files.js',
  'core/agent.js', 'core/evolve.js', 'envs/bug.js'];
const sha = execFileSync('git', ['rev-parse', ref + '^{commit}'], { cwd: repo, encoding: 'utf8' }).trim();
const ctx = vm.createContext({ console, performance, Math, Date, JSON, setTimeout });
for (const f of FILES) vm.runInContext(execFileSync('git', ['show', sha + ':js/' + f], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 }), ctx, { filename: f });
const SA = vm.runInContext('SpikingArena', ctx);
const hasSotaPlan = !!(SA.PLANS && SA.PLANS.bugSOTA), hasAssisted = /sotaPhysics/.test(execFileSync('git', ['show', sha + ':js/envs/bug.js'], { cwd: repo, encoding: 'utf8' }));
if (PHYS.includes('assisted') && !hasAssisted) { console.error('physics "assisted" does not exist on ' + sha.slice(0, 8)); process.exit(2); }

function makePlan(name) {
  if (name === 'bugSOTA' && !hasSotaPlan) {   // same genes as e923906's createSotaBugGenome: v3h + neuromodulator channel
    const d = SA.tunedBugGenome(); d.ch = [Object.assign(vm.runInContext('typeof defaultChannel === "function" ? defaultChannel() : null', ctx) || {}, { gFood: 1.5, gPoison: 1.5, gWall: 0.02, tauMod: 12 })]; return d;
  }
  if (!SA.PLANS[name]) throw new Error('unknown plan ' + name);
  return SA.PLANS[name].make();
}
function makeEnv(task, physics) {
  const p = SA.recommendedEnvParams('bug', { task }, ['task']);
  SA.setEnv('bug', Object.assign({}, p, { task, episodeTicks: TICKS }));
  const cur = SA.currentEnv(), P = Object.assign({}, cur.P, { task, episodeTicks: TICKS });
  if (hasAssisted) P.sotaPhysics = physics === 'assisted';
  const sota = physics === 'assisted';
  const create = (s, pp) => { const w = new SA.bug.World(s, pp, SA.bug.GARDEN); w.sota = sota; return w; };
  return Object.assign({}, cur, { P, def: Object.assign({}, cur.def, { create }) });
}
function wallTouch(w) { const a = w.agent; return !!(a.contact[0] || a.contact[1] || a.contact[2] || w.bumped); }

// one round in a fresh arena, with the agent's network carried over
function liveRound(agent, env, seed, physics) {
  agent.task = env.def.create(seed, env.P, env.spec);
  agent.task.sota = physics === 'assisted';          // override the genome's own switch (Agent sets it for sotaBug genomes)
  const w = agent.task, hx = new Float64Array(STUCK_N), hy = new Float64Array(STUCK_N);
  let n = 0, contactTicks = 0, contacts = 0, wallStuck = 0, was = false;
  while (!w.done && n < TICKS * 2) {
    agent.tick();
    if (!!(w.sota || w.P.sotaPhysics) !== (physics === 'assisted')) throw new Error('physics switch did not hold (' + physics + ')');
    const t = wallTouch(w), a = w.agent, h = n % STUCK_N;
    if (t) contactTicks++; if (t && !was) contacts++; was = t;
    if (n >= STUCK_N && t) { const dx = a.x - hx[h], dy = a.y - hy[h]; if (dx * dx + dy * dy < STUCK_D2) wallStuck++; }
    hx[h] = a.x; hy[h] = a.y; n++;
  }
  const food = w.food, poison = w.poison, caught = w.caught || 0;
  return { ticks: n, food, poison, caught, score: food - poison - CAUGHT_COST * caught, poisonShare: food + poison ? poison / (food + poison) : null,
    contactTicks, contacts, wallStuck, stuck: w.stuckTicks };
}

const runs = [], t0 = Date.now();
SA.params.plasticity = LEARN;
for (const physics of PHYS) for (const task of TASKS) for (let g = 0; g < G; g++) {
  const gs = (SEED0 * 7919 + g * 104729) >>> 0;
  for (const plan of PLANS) {
    const env = makeEnv(task, physics), genome = makePlan(plan);
    SA.params.plasticity = LEARN;
    const agent = new SA.Agent(genome, gs, SA.growCell(genome, { seed: gs, spec: env.spec }), env);
    const rounds = [];
    for (let r = 0; r < R; r++) rounds.push(liveRound(agent, env, (gs + 1000003 * (r + 1)) >>> 0, physics));
    runs.push({ physics, task, growth: g, seed: gs, plan, neurons: agent.brain.N, rounds });
  }
}

// ---- summary: per growth, mean over rounds; paired deltas plan[0] - plan[1] ----
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
function slope(ys) { const xs = ys.map((_, i) => i), ok = ys.map((y, i) => [xs[i], y]).filter(p => p[1] != null); if (ok.length < 2) return null;
  const mx = mean(ok.map(p => p[0])), my = mean(ok.map(p => p[1])); let a = 0, b = 0; for (const [x, y] of ok) { a += (x - mx) * (y - my); b += (x - mx) ** 2; } return b ? a / b : null; }
const METRICS = ['score', 'food', 'poison', 'caught', 'poisonShare', 'contactTicks', 'contacts', 'wallStuck', 'stuck'];
const summary = [];
for (const physics of PHYS) for (const task of TASKS) {
  const row = { physics, task, plans: {}, paired: {} };
  for (const plan of PLANS) {
    const rs = runs.filter(x => x.physics === physics && x.task === task && x.plan === plan);
    row.plans[plan] = {};
    for (const m of METRICS) row.plans[plan][m] = mean(rs.map(x => mean(x.rounds.map(r => r[m]).filter(v => v != null))).filter(v => v != null));
    row.plans[plan].byRound = Array.from({ length: R }, (_, r) => ({ food: mean(rs.map(x => x.rounds[r].food)), poison: mean(rs.map(x => x.rounds[r].poison)),
      caught: mean(rs.map(x => x.rounds[r].caught)), wallStuck: mean(rs.map(x => x.rounds[r].wallStuck)) }));
    row.plans[plan].poisonShareSlope = mean(rs.map(x => slope(x.rounds.map(r => r.poisonShare))).filter(v => v != null));
  }
  if (PLANS.length === 2) for (const m of METRICS) {
    const d = [];
    for (let g = 0; g < G; g++) {
      const a = runs.find(x => x.physics === physics && x.task === task && x.growth === g && x.plan === PLANS[0]);
      const b = runs.find(x => x.physics === physics && x.task === task && x.growth === g && x.plan === PLANS[1]);
      const va = mean(a.rounds.map(r => r[m]).filter(v => v != null)), vb = mean(b.rounds.map(r => r[m]).filter(v => v != null));
      if (va != null && vb != null) d.push(va - vb);
    }
    row.paired[m] = { mean: mean(d), higher: d.filter(x => x > 0).length, lower: d.filter(x => x < 0).length, n: d.length };
  }
  summary.push(row);
}

// ---- pre-registered decision (BUG_AUDIT.md): primary = standard physics, flash; guard = standard physics, hard ----
function verdict() {
  if (PLANS[0] !== 'bugSOTA' || PLANS[1] !== 'v3h' || !PHYS.includes('standard') || !TASKS.includes('flash')) return { decided: false, why: 'not the pre-registered comparison' };
  if (G < 16 || R < 8 || TICKS !== 1500) return { decided: false, why: 'smaller than the pre-registered size (16 growths x 8 rounds x 1500 ticks): smoke only' };
  const pf = summary.find(s => s.physics === 'standard' && s.task === 'flash').paired, ph = summary.find(s => s.physics === 'standard' && s.task === 'hard');
  const rel = (m, row) => { const b = row.plans.v3h[m]; return b > 0 ? row.paired[m].mean / b : row.paired[m].mean > 0 ? Infinity : 0; };
  const flashRow = summary.find(s => s.physics === 'standard' && s.task === 'flash');
  const checks = {
    'flash score higher on average': pf.score.mean > 0,
    'flash score higher in >= 12 of 16 growths': pf.score.higher >= 12,
    'flash poison bites not up by more than 10%': rel('poison', flashRow) <= 0.10,
    'flash wall-stuck time not up by more than 10% (or by < 5 ticks per round)': rel('wallStuck', flashRow) <= 0.10 || pf.wallStuck.mean < 5,
  };
  if (ph) { checks['predator score not lower on average'] = ph.paired.score.mean >= 0; checks['predator catches not up by more than 10%'] = rel('caught', ph) <= 0.10 || ph.paired.caught.mean <= 0.05; }
  return { decided: true, pass: Object.values(checks).every(Boolean), checks };
}

const result = { tool: 'tools/bug_audit.js', version: 1, core: sha, ref, hasSotaPlan, hasAssisted, growths: G, rounds: R, ticks: TICKS, tasks: TASKS, physics: PHYS,
  plans: PLANS, learning: LEARN, seed: SEED0, stuckRule: { windowTicks: STUCK_N, minMovePx: Math.sqrt(STUCK_D2), needsWallTouch: true },
  seconds: (Date.now() - t0) / 1000, summary, verdict: verdict(), runs };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result));
for (const s of summary) {
  console.log(`\n[${s.physics} physics · ${s.task}]`);
  for (const p of PLANS) { const x = s.plans[p]; console.log(`  ${p.padEnd(8)} score ${x.score.toFixed(2)}  food ${x.food.toFixed(2)}  poison ${x.poison.toFixed(2)}  caught ${x.caught.toFixed(2)}  poison share ${x.poisonShare == null ? '-' : (100 * x.poisonShare).toFixed(0) + '%'}  wall contacts ${x.contacts.toFixed(1)}  wall-stuck ${x.wallStuck.toFixed(1)}  stuck ${x.stuck.toFixed(1)}  share slope/round ${x.poisonShareSlope == null ? '-' : x.poisonShareSlope.toFixed(3)}`); }
  if (s.paired.score) console.log(`  paired ${PLANS[0]}-${PLANS[1]}: score ${s.paired.score.mean.toFixed(2)} (higher in ${s.paired.score.higher}/${s.paired.score.n})  poison ${s.paired.poison.mean.toFixed(2)}  wall-stuck ${s.paired.wallStuck.mean.toFixed(1)}  caught ${s.paired.caught.mean.toFixed(2)}`);
}
console.log('\nverdict:', JSON.stringify(result.verdict), `\ncore ${sha.slice(0, 8)} · ${result.seconds.toFixed(1)} s`);
