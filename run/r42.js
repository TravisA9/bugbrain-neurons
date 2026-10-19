// R42: held-out evaluation with full task stats. node run/r42.js <plan> '<task json {env,params}>' [growths] [variant k=v,...]
// prints JSON {plan, task, variant, mean, sd, scores, stats(mean over growths)}; parallel via separate processes.
const L = require('./lib.js'), SA = L.SA;
const [plan, tj, G = 16, variant = 'base', g0 = 0] = process.argv.slice(2), task = Object.assign({ name: 'r42' }, JSON.parse(tj));
const gc = L.serialize(L.startGenome(plan)), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base') for (const kv of variant.split(',')) { const [k0, v] = kv.split('='), [k, sel] = k0.split('@'), [s, f] = k.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }   // R63: s.f@sel=v targets regions by name prefix (sel 'cortex', 'context', '!striatum'); no @ = every region
if (process.env.BB_PEDBG) globalThis.__peDbg = { d: 0, p: 0, n: 0 };
const nV = Math.max(64, +g0 + +G), p = L.seedPlan({ valGrowths: nV, valArenas: nV }, 0, true)   // R65: g0 >= 64 = growth / arena seeds never used before (VAL_GROW_SEED + k, VAL_SEED + k; k < 64 unchanged), scores = [], st = {};
for (let k = +g0; k < +g0 + +G; k++) { const r = L.evaluateGenome(gc, [task], { G: 1, A: 1, growSeeds: [p.growSeeds[k]], arenaSeeds: [p.arenaSeeds[k]] }); if (r.error) throw new Error(r.error);
  scores.push(r.tasks[0].mean); for (const q in r.tasks[0].stats) st[q] = (st[q] || 0) + r.tasks[0].stats[q] / G; st.hidden = (st.hidden || 0) + r.brain.hidden / G; }
const m = scores.reduce((a, b) => a + b, 0) / scores.length, sd = Math.sqrt(scores.reduce((a, b) => a + (b - m) ** 2, 0) / scores.length);
if (globalThis.__peDbg) { st.peDep = globalThis.__peDbg.d / G; st.pePot = globalThis.__peDbg.p / G; st.peN = globalThis.__peDbg.n / G; }
for (const q in st) st[q] = +st[q].toFixed(3);
const OUT = { plan, task: tj, variant, G: +G, g0: +g0, mean: +m.toFixed(3), sd: +sd.toFixed(3), scores: scores.map(x => +x.toFixed(2)), stats: st };
// R45: BB_OUT=<file> appends the full result (per-growth scores + stats) as one JSON line (the queue keeps only mean / sd); every run is recorded in the registry
if (process.env.BB_OUT) { const fs = require('fs'), path = require('path'), f = path.resolve(process.env.BB_OUT); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, JSON.stringify(Object.assign({ at: new Date().toISOString(), defaults: SA.DEFAULTS_VERSION }, OUT)) + '\n'); }
try { const REG = require('./registry.js'); REG.record(REG.describeAblation(plan, tj, variant + '|r42 g0=' + g0, G, null, SA.DEFAULTS_VERSION), { status: 'finished', result: OUT }); } catch (e) {}
console.log(JSON.stringify(OUT));
