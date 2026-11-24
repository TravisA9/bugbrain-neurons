'use strict';

const L = require('./lib');

const edits = [
  ['leak', 0.25], ['leak', 1.75], ['s7', -0.35], ['s7', 0.95],
  ['motor', -0.65], ['motor', 0.65], ['clen', -0.75], ['homeoTarget', 0.9],
];

function watchFood(world) {
  let last, follow, lost = 0, approached = 0, collected = 0, blocked = 0;
  const distance = item => Math.hypot(item.x - world.agent.x, item.y - world.agent.y);
  return {
    tick() {
      const seen = world.agent.eyes.filter(eye => eye.target
        && (eye.target.type === 1) === world.greenIsFood && world.items.includes(eye.target))
        .sort((a, b) => a.dist - b.dist)[0]?.target;
      if (last && !seen && world.items.includes(last) && !world.visible(last)) {
        lost++;
        follow = { item: last, range: distance(last), ticks: 0, blocked: false };
      }
      last = seen;
      if (!follow) return;
      follow.ticks++;
      follow.blocked ||= Boolean(world.bumped);
      const eaten = !world.items.includes(follow.item);
      if (eaten || seen === follow.item || follow.ticks >= 12) {
        collected += Number(eaten);
        approached += Number(eaten || distance(follow.item) < follow.range - 5);
        blocked += Number(follow.blocked);
        follow = null;
      }
    },
    stats: () => ({ foodDisappearances: lost, approachedAfterLoss: approached, collectedAfterLoss: collected, blockedAfterLoss: blocked }),
  };
}

function arenaMemory(seed) {
  const index = seed - 17;
  const [field, value] = edits[index % edits.length];
  const lowRate = index >= edits.length;
  const parent = L.startGenome('v3h');
  if (lowRate) parent.g.sc.homeoTarget *= 0.9;
  const edit = field === 'homeoTarget' ? L.startGenome('v3h') : { g: L.SA.tunedBugGenome({ [field]: value }) };
  if (lowRate) edit.g.sc.homeoTarget *= 0.9;
  if (field === 'homeoTarget') edit.g.sc.homeoTarget *= lowRate ? 1 / value : value;
  const plan = L.seedPlan({ valGrowths: 233, valArenas: 233 }, 0, true);
  const tasks = [
    { env: 'bug', params: { task: 'flash', episodeTicks: 1500 } },
    { env: 'bug', params: { task: 'flashvis', episodeTicks: 1500 } },
    { env: 'bug', garden: true, params: { task: 'flash', episodeTicks: 1500 } },
  ];
  function evaluate(genome, start, count, taskCount) {
    const result = L.evaluateGenome(L.serialize(genome), tasks.slice(0, taskCount), { G: count, A: 1, dropDense: true,
      countSpikes: true, observe: watchFood, growSeeds: plan.growSeeds.slice(start, start + count),
      arenaSeeds: plan.arenaSeeds.slice(start, start + count) });
    if (result.error) throw Error(result.error);
    return { brain: result.brain, ticks: result.ticks, ms: result.ms,
      tasks: result.tasks.map(task => ({ scores: task.scores, ...task.stats })) };
  }
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const dir = process.env.BB_STATE_DIR || path.join(os.homedir(), '.bugbrain');
  const file = path.join(dir, 'arena-memory-1-parent-' + Number(lowRate) + '.json');
  let saved;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {}
  if (!saved) {
    saved = { screen: evaluate(parent, 180, 6, 2), audit: evaluate(parent, 221, 12, 3) };
    fs.mkdirSync(dir, { recursive: true });
    const temp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(saved));
    fs.renameSync(temp, file);
  }
  return { version: 'arena-memory-1', seed, parent: lowRate ? 'low-rate' : 'v3h', change: { field, value },
    genome: L.serialize(edit), screen: { parent: saved.screen, edit: evaluate(edit, 180, 6, 2) },
    audit: { parent: saved.audit, edit: evaluate(edit, 221, 12, 3) } };
}

module.exports = { arenaMemory };
