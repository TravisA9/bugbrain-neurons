'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const L = require('./lib');

const seed = Number(process.argv[2]);
if (!Number.isInteger(seed) || seed < 1 || seed > 16) throw Error('Invalid arena pilot seed');
const parent = L.startGenome('v3h');
const targeted = seed >= 5;
const changes = ['axonLen', 'rSyn', 'pruneFrac', 'wHid', 'theta', 'homeoTarget'];
const field = changes[Math.floor((seed - 5) / 2)];
const factor = seed % 2 ? 0.9 : 1.1;
const edit = targeted ? L.deserialize(L.serialize(parent)) : L.mutate(parent, L.makeRng(27810 + seed));
if (targeted) edit.g.sc[field] *= factor;
const plan = L.seedPlan({ valGrowths: 164, valArenas: 164 }, 0, true);
const tasks = ['flash', 'flashvis'].map(task => ({ env: 'bug', params: { task, episodeTicks: 1500 } }));

function evaluate(genome, start, count = 4) {
  const result = L.evaluateGenome(L.serialize(genome), tasks, {
    G: count, A: 1, dropDense: true, countSpikes: targeted,
    growSeeds: plan.growSeeds.slice(start, start + count),
    arenaSeeds: plan.arenaSeeds.slice(start, start + count),
  });
  if (result.error) throw Error(result.error);
  return { brain: result.brain, ticks: result.ticks, ms: result.ms,
    tasks: result.tasks.map(task => ({ scores: task.scores, food: task.stats.food, poison: task.stats.poison,
      spikesPerTick: task.stats.spikesPerTick })) };
}

function parentResults() {
  const dir = process.env.BB_STATE_DIR || path.join(os.homedir(), '.bugbrain');
  const file = path.join(dir, 'arena-targeted-1-parent.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.screen.tasks.every(task => task.scores.length === 8 && Number.isFinite(task.spikesPerTick))
      && saved.audit.tasks.every(task => task.scores.length === 16 && Number.isFinite(task.spikesPerTick))) return saved;
  } catch (error) {}
  const baseline = { screen: evaluate(parent, 128, 8), audit: evaluate(parent, 148, 16) };
  fs.mkdirSync(dir, { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(baseline));
  fs.renameSync(temp, file);
  return baseline;
}

if (targeted && !Number.isFinite(edit.g.sc[field])) throw Error('Unsupported growth parameter: ' + field);
const baseline = targeted ? parentResults() : null;
const report = targeted ? { version: 'arena-targeted-1', seed, genome: L.serialize(edit), change: { field, factor },
  screen: { parent: baseline.screen, edit: evaluate(edit, 128, 8) },
  audit: { parent: baseline.audit, edit: evaluate(edit, 148, 16) } }
  : { version: 'arena-mutation-1', seed, genome: L.serialize(edit),
  screen: { parent: evaluate(parent, 88), edit: evaluate(edit, 88) },
  audit: { parent: evaluate(parent, 92), edit: evaluate(edit, 92) } };
fs.writeFileSync(process.argv[3], JSON.stringify(report));
