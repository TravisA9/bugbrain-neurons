// Reward-learning runs (round 21). One lifetime per growth; reports the env's stats averaged over growths.
//   [ENV=bandit] [PP='{...}'] [PLAN=rewardK] [TUNE='{...}'] [PL='{...}'] [NG=6] [S0=1] [FROZEN=1] [VARS='{"name":{"PL":{},"TUNE":{}}}'] node results_v20/rl.js
const SA = require('../js/node_load.js')();
const env = process.env.ENV || 'bandit', PP = JSON.parse(process.env.PP || '{}'), NG = +(process.env.NG || 6), S0 = +(process.env.S0 || 1);
const VARS = process.env.VARS ? JSON.parse(process.env.VARS) : { base: {} };
const E = SA.setEnv(env, PP);
function run(v) {
  const plan = v.PLAN || process.env.PLAN || SA.defaultPlanId(E), tune = Object.assign(JSON.parse(process.env.TUNE || '{}'), v.TUNE || {}), pl = Object.assign(JSON.parse(process.env.PL || '{}'), v.PL || {});
  SA.params.plasticity = !(v.FROZEN || process.env.FROZEN);
  const acc = {}; let n = 0, t0 = Date.now(), ticks = 0, info = '';
  for (let s = S0; s < S0 + NG; s++) {
    const d = plan === 'rewardK' && Object.keys(tune).length ? SA.createRewardPlan(tune) : SA.PLANS[plan].make(); Object.assign((d.kind === 'regions' ? d.regions.find(r => r.outputs).g : d).pl, pl);   // v21: region genomes: the output region's plasticity genes
    const g = SA.growCell(d, { seed: s, spec: E.spec });
    const a = SA.runEpisode(d, 1000 + s, g, E); ticks += a.task.t;
    const st = a.task.stats ? a.task.stats() : {}; st.fitness = a.task.fitness(); if (a.task.score) st.score = a.task.score();
    for (const k in st) if (typeof st[k] === 'number') acc[k] = (acc[k] || 0) + st[k]; n++;
    if (s === S0) info = `N ${g.N} hid ${g.nHid} plastic ${a.net.plastic.length}` + (a.net.crit ? ` critic ${a.net.crit.S.length} cells, V ${a.net.value.toFixed(2)}` : '');
  }
  for (const k in acc) acc[k] = +(acc[k] / n).toFixed(3);
  return { acc, info, sec: (Date.now() - t0) / 1000, tps: Math.round(ticks / ((Date.now() - t0) / 1000)) };
}
for (const name in VARS) { const r = run(VARS[name]); console.log(name.padEnd(14), JSON.stringify(r.acc), '|', r.info, '|', r.sec.toFixed(1) + 's', r.tps + ' ticks/s'); }
