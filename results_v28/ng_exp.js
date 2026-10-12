// R29 [neuro] need-growth comparison. bun results_v28/ng_exp.js <task> <cond> [G=16] [K]
// cond: a = default | b = reduced start, need-growth off | c = reduced start + need-growth | d = default + need-growth
// env: RED (reduced fraction, default 0.5), EXTRA (JSON pl overrides when need-growth is on), SEEDOFF
const L = require('../run/lib.js'), SA = L.SA;
const [task, cond, G = 16, kArg] = process.argv.slice(2);
const TASKS = { text: { env: 'seq', params: { source: 'text' }, plan: 'predictK3' }, order3: { env: 'seq', params: { source: 'order3', K: 8 }, plan: 'predictK3' },
  fables: { env: 'seq', params: { source: 'fables' }, plan: 'predictK3' },
  bandit: { env: 'bandit', params: {}, plan: 'rewardE' }, cueR: { env: 'cue', params: { mapping: 'random' }, plan: 'rewardE' } };
const T = JSON.parse(JSON.stringify(TASKS[task])); if (kArg) T.params.K = +kArg;
if (process.env.PARAMS) Object.assign(T.params, JSON.parse(process.env.PARAMS));
const gc = L.serialize(L.startGenome(T.plan));
const pl = gc.kind === 'regions' ? null : gc.cell.pl;
const red = cond === 'b' || cond === 'c' ? +(process.env.RED || 0.5) : 0, on = cond === 'c' || cond === 'd';
const env = L.setupTask({ env: T.env, params: T.params }), g = L.deserialize(gc).g, rows = [];
const setPl = q => { if (red > 0 || on) { q.ng = 1; q.ngRes = on ? q.ngRes : 0; q.ngReduce = red; if (on && process.env.EXTRA) Object.assign(q, JSON.parse(process.env.EXTRA)); } };
const off = +process.env.SEEDOFF || 0;
for (let k = 0; k < +G; k++) {
  const seed = SA.VAL_GROW_SEED + 3000 + off + k;
  const b = SA.growCell(g, { seed, spec: env.spec }); b.pl = Object.assign({}, SA.PL_DEFAULTS, b.pl); setPl(b.pl);
  const a = new SA.Agent(g, SA.VAL_SEED + 7000 + off + k, b, env); while (!a.done) a.tick();
  const s = a.net.needStats() || { added: 0, pruned: 0, alive: 0, dead: 0, layer: 0, E: 0 };
  rows.push({ score: a.fitness, added: s.added, pruned: s.pruned, alive: s.alive, dead: s.dead, layer: s.layer, E: s.E, size: b.nHid - s.dead + s.alive, ev: s.events || 0 });
}
const m = f => rows.reduce((s, r) => s + f(r), 0) / rows.length, sd = f => { const u = m(f); return Math.sqrt(m(r => (f(r) - u) ** 2)); };
console.log(JSON.stringify({ task, K: kArg || null, cond, G: +G, off, x: process.env.EXTRA || '', score: +m(r => r.score).toFixed(3), sd: +sd(r => r.score).toFixed(3),
  added: +m(r => r.added).toFixed(2), pruned: +m(r => r.pruned).toFixed(2), alive: +m(r => r.alive).toFixed(2), aliveSd: +sd(r => r.alive).toFixed(2), dead: +m(r => r.dead).toFixed(1), layer: +m(r => r.layer).toFixed(1),
  size: Math.round(m(r => r.size)), sizeSd: +sd(r => r.size).toFixed(1), E: +m(r => r.E).toFixed(3), ev: Math.round(m(r => r.ev)) }));
