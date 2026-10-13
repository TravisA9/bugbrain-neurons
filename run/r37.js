// R37 screen: node run/r37.js <variant> <task> [G]
const L = require('./lib.js'), SA = L.SA;
const [v, task, G = 16] = process.argv.slice(2);
const V = { A: { ca: { a: 10, o: -4, b: -5 } }, B: { ca: { a: 10, o: -6, b: -5 } }, AL: { ca: { a: 10, o: -4, b: -5 }, lin: true }, BL: { ca: { a: 10, o: -6, b: -5 }, lin: true } }[v];
SA.registerPlan('r37' + v, 'r37', () => SA.createUnifiedC(Object.assign({ sa: { a: 0, o: 10, b: -5 } }, V)), '');
const TASKS = { cycle: { name: 'cycle', env: 'seqchoice', params: { source: 'cycle' } }, order2: { name: 'order2', env: 'seqchoice', params: { source: 'order2' } } };
const gc = L.serialize(L.startGenome('r37' + v)), p = L.seedPlan({ valGrowths: +G, valArenas: +G }, 0, true), sc = [];
for (let k = 0; k < p.G; k++) { const r = L.evaluateGenome(gc, [TASKS[task]], { G: 1, A: 1, growSeeds: [p.growSeeds[k]], arenaSeeds: [p.arenaSeeds[k]] }); if (r.error) throw new Error(r.error); sc.push(r.tasks[0].mean); }
console.log(JSON.stringify({ v, task, mean: +(sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(3), scores: sc.map(x => +(+x).toFixed(2)) }));
