'use strict';

const fs = require('node:fs');
const L = require('./lib');

const seed = Number(process.argv[2]);
if (!Number.isInteger(seed) || seed < 1 || seed > 16) throw Error('Invalid arena pilot seed');
const parent = L.startGenome('v3h');
const edit = L.mutate(parent, L.makeRng(27810 + seed));
const plan = L.seedPlan({ valGrowths: 96, valArenas: 96 }, 0, true);
const tasks = ['flash', 'flashvis'].map(task => ({ env: 'bug', params: { task, episodeTicks: 1500 } }));

function evaluate(genome, start) {
  const result = L.evaluateGenome(L.serialize(genome), tasks, {
    G: 4, A: 1, dropDense: true,
    growSeeds: plan.growSeeds.slice(start, start + 4),
    arenaSeeds: plan.arenaSeeds.slice(start, start + 4),
  });
  if (result.error) throw Error(result.error);
  return { brain: result.brain, ticks: result.ticks, ms: result.ms,
    tasks: result.tasks.map(task => ({ scores: task.scores, food: task.stats.food, poison: task.stats.poison })) };
}

const report = { version: 'arena-mutation-1', seed, genome: L.serialize(edit),
  screen: { parent: evaluate(parent, 88), edit: evaluate(edit, 88) },
  audit: { parent: evaluate(parent, 92), edit: evaluate(edit, 92) } };
fs.writeFileSync(process.argv[3], JSON.stringify(report));
