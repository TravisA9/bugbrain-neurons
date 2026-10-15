// Headless gene-transplant test: node run/ablate.js <plan> <task> <variant> [growths]
// variant = base | champ | key=val,key=val (sc.x / pl.x / ch) ; prints JSON {plan,task,variant,mean,sd,scores}
const L = require('./lib.js'), SA = L.SA;
const argv = process.argv.slice(2), FORCE = argv.includes('--force') || !!process.env.FORCE, [plan, task, variant, G = 6] = argv.filter(a => a !== '--force');
const REG = require('./registry.js'), DESC = REG.describeAblation(plan, task, variant, G, variant === 'champ' || /champ|grn|ch\b|\*|region:/.test(variant) ? (process.env.CHAMP || 'results_overnight_r26') : null, SA.DEFAULTS_VERSION);   // R38 registry
{ const c = REG.check(DESC); if (REG.gate(DESC, { force: FORCE, log: m => console.error(m) }) === 'skip') { const prev = c.exact || c.near; if (prev && prev.result) console.log(JSON.stringify(prev.result)); process.exit(3); } }
// the champion file is loaded only when a variant needs it (R39: an unconditional require crashed every ablation on machines without results_overnight_r26/champions)
let CH_ = null; const CHAMP_FILE = process.env.CHAMP ? require('path').resolve(process.env.CHAMP) : require('path').join(__dirname, '..', 'results_overnight_r26', 'champions', 'champion_final.json');
const CHG = () => CH_ || (CH_ = JSON.parse(require('fs').readFileSync(CHAMP_FILE, 'utf8')).developmental_genome);
const TASKS = { text: { name: 'text', env: 'seq', params: { source: 'text' } }, order3: { name: 'order3', env: 'seq', params: { source: 'order3', K: 8 } },
  bandit: { name: 'bandit', env: 'bandit', params: {} }, cueR: { name: 'cueR', env: 'cue', params: { mapping: 'random' } }, recallR: { name: 'recallR', env: 'recall', params: { mapping: 'random' } }, cycle: { name: 'cycle', env: 'seqchoice', params: { source: 'cycle' } }, order2: { name: 'order2', env: 'seqchoice', params: { source: 'order2' } }, banditH: { name: 'banditH', env: 'bandit', params: { nTrials: 400 } } };
let gc = variant === 'champ' ? JSON.parse(JSON.stringify(CHG())) : L.serialize(L.startGenome(plan));
const regM = /^region:(\d+)$/.exec(variant);   // R39: transplant one whole region (genome + area receptor genes) from the champion
if (regM) gc.cell.regions[+regM[1]] = JSON.parse(JSON.stringify(CHG().cell.regions[+regM[1]]));
const cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base' && variant !== 'champ' && !regM) for (const kv of variant.split(',')) for (const C of cells) {
  const [k, v] = kv.split('='), [s, f] = k.split('.');
  if (k === 'grn') for (const q of ['Wg', 'R', 'lam', 's0']) C[q] = CHG().cell[q].slice();
  else if (k === 'ch') C.ch = JSON.parse(JSON.stringify(CHG().cell.ch));
  else if (s === 'P') { SA.params[f] = +v; continue; }   // R39: engine parameter (e.g. P.juvMode=1)
  else if (s === 'pl' || s === 'sc') { if (f === '*') Object.assign(C[s], CHG().cell[s]); else C[s][f] = v == null || v === 'champ' ? CHG().cell[s][f] : +v; }
  else throw new Error('bad key ' + k);
}
if (!TASKS[task] && task.trim().startsWith('{')) TASKS[task] = Object.assign({ name: 'custom' }, JSON.parse(task));   // R38: task as JSON {env, params}
const p = L.seedPlan({ valGrowths: +G, valArenas: +G }, 0, true), scores = [];
for (let k = 0; k < p.G; k++) { const r = L.evaluateGenome(gc, [TASKS[task]], { G: 1, A: 1, growSeeds: [p.growSeeds[k]], arenaSeeds: [p.arenaSeeds[k]] }); if (r.error) throw new Error(r.error); scores.push(r.tasks[0].mean); }
const m = scores.reduce((a, b) => a + b, 0) / scores.length, sd = Math.sqrt(scores.reduce((a, b) => a + (b - m) ** 2, 0) / scores.length);
const OUT = { plan, task, variant, mean: +m.toFixed(3), sd: +sd.toFixed(3), scores: scores.map(x => +x.toFixed(2)) };
REG.record(DESC, { status: 'finished', result: OUT });
console.log(JSON.stringify(OUT));
