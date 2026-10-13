// Headless gene-transplant test: node run/ablate.js <plan> <task> <variant> [growths]
// variant = base | champ | key=val,key=val (sc.x / pl.x / ch) ; prints JSON {plan,task,variant,mean,sd,scores}
const L = require('./lib.js'), SA = L.SA;
const [plan, task, variant, G = 6] = process.argv.slice(2);
const CH = require(process.env.CHAMP || '../results_overnight_r26/champions/champion_final.json').developmental_genome;
const TASKS = { text: { name: 'text', env: 'seq', params: { source: 'text' } }, order3: { name: 'order3', env: 'seq', params: { source: 'order3', K: 8 } },
  bandit: { name: 'bandit', env: 'bandit', params: {} }, cueR: { name: 'cueR', env: 'cue', params: { mapping: 'random' } }, recallR: { name: 'recallR', env: 'recall', params: { mapping: 'random' } }, cycle: { name: 'cycle', env: 'seqchoice', params: { source: 'cycle' } }, order2: { name: 'order2', env: 'seqchoice', params: { source: 'order2' } }, banditH: { name: 'banditH', env: 'bandit', params: { nTrials: 400 } } };
let gc = variant === 'champ' ? JSON.parse(JSON.stringify(CH)) : L.serialize(L.startGenome(plan));
const cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base' && variant !== 'champ') for (const kv of variant.split(',')) for (const C of cells) {
  const [k, v] = kv.split('='), [s, f] = k.split('.');
  if (k === 'grn') for (const q of ['Wg', 'R', 'lam', 's0']) C[q] = CH.cell[q].slice();
  else if (k === 'ch') C.ch = JSON.parse(JSON.stringify(CH.cell.ch));
  else if (s === 'pl' || s === 'sc') { if (f === '*') Object.assign(C[s], CH.cell[s]); else C[s][f] = v == null || v === 'champ' ? CH.cell[s][f] : +v; }
  else throw new Error('bad key ' + k);
}
const p = L.seedPlan({ valGrowths: +G, valArenas: +G }, 0, true), scores = [];
for (let k = 0; k < p.G; k++) { const r = L.evaluateGenome(gc, [TASKS[task]], { G: 1, A: 1, growSeeds: [p.growSeeds[k]], arenaSeeds: [p.arenaSeeds[k]] }); if (r.error) throw new Error(r.error); scores.push(r.tasks[0].mean); }
const m = scores.reduce((a, b) => a + b, 0) / scores.length, sd = Math.sqrt(scores.reduce((a, b) => a + (b - m) ** 2, 0) / scores.length);
console.log(JSON.stringify({ plan, task, variant, mean: +m.toFixed(3), sd: +sd.toFixed(3), scores: scores.map(x => +x.toFixed(2)) }));
