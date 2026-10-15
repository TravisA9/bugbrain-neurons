// R37 screen: node run/r37.js <variant> <task> [G]
const L = require('./lib.js'), SA = L.SA;
const argv = process.argv.slice(2), FORCE = argv.includes('--force'), [v, task, G = 16] = argv.filter(a => a !== '--force');
const REG = require('./registry.js'), DESC = REG.describeAblation('r37:' + v, task, 'base', G, null, SA.DEFAULTS_VERSION);   // R38 registry
{ const c = REG.check(DESC); if (REG.gate(DESC, { force: FORCE, log: m => console.error(m) }) === 'skip') { const prev = c.exact || c.near; if (prev && prev.result) console.log(JSON.stringify(prev.result)); process.exit(3); } }
const V = { A: { ca: { a: 10, o: -4, b: -5 } }, B: { ca: { a: 10, o: -6, b: -5 } }, AL: { ca: { a: 10, o: -4, b: -5 }, lin: true }, BL: { ca: { a: 10, o: -6, b: -5 }, lin: true } }[v] || (/^o=/.test(v) ? { ca: { a: 10, o: +v.slice(2), b: -5 } } : null); if (!V) throw new Error('variant: A B AL BL or o=<value>');
SA.registerPlan('r37' + v.replace(/\W/g, '_'), 'r37', () => SA.createUnifiedC(Object.assign({ sa: { a: 0, o: 10, b: -5 } }, V)), '');
const TASKS = { cycle1000: { name: 'cycle1000', env: 'seqchoice', params: { source: 'cycle', nSyms: 1000 } }, order2_1000: { name: 'order2_1000', env: 'seqchoice', params: { source: 'order2', nSyms: 1000 } }, cycle: { name: 'cycle', env: 'seqchoice', params: { source: 'cycle' } }, order2: { name: 'order2', env: 'seqchoice', params: { source: 'order2' } } };
const gc = L.serialize(L.startGenome('r37' + v.replace(/\W/g, '_'))), p = L.seedPlan({ valGrowths: +G, valArenas: +G }, 0, true), sc = [];
for (let k = 0; k < p.G; k++) { const r = L.evaluateGenome(gc, [TASKS[task]], { G: 1, A: 1, growSeeds: [p.growSeeds[k]], arenaSeeds: [p.arenaSeeds[k]] }); if (r.error) throw new Error(r.error); sc.push(r.tasks[0].mean); }
const OUT = ({ v, task, mean: +(sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(3), scores: sc.map(x => +(+x).toFixed(2)) }); REG.record(DESC, { status: 'finished', result: OUT }); console.log(JSON.stringify(OUT));
