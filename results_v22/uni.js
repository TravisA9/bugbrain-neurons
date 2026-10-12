// Round 23: one learning rule for teacher and reward tasks. Runs one task with its default plan under a PL override.
//   TASK=order3|text|bandit|cue  [PL='{...}'] [NG] [S0] [NAME] node results_v22/uni.js
const SA = require('../js/node_load.js')();
const TASKS = { order3: ['seq', { source: 'order3', K: 8, nSyms: 600, clock2: true, clock3: true }, 'predictK3', 4, 40, s => s.lastQuarter],
  text: ['seq', { source: 'text', nSyms: 1000, clock2: true, clock3: true }, 'predictK3', 4, 40, s => s.lastQuarter],
  bandit: ['bandit', {}, 'rewardK', 8, 11, s => s.optimal], cue: ['cue', { mapping: 'random', wrongCost: 0, delay: 10, nTrials: 120 }, 'rewardMemK', 8, 11, s => s.pass] };
const [env, PP, plan, ng, s0, metric] = TASKS[process.env.TASK], NG = +(process.env.NG || ng), S0 = +(process.env.S0 || s0), PL = JSON.parse(process.env.PL || '{}');
const E = SA.setEnv(env, PP); let m = 0, lq = 0, t0 = Date.now();
for (let s = S0; s < S0 + NG; s++) {
  const d = SA.PLANS[process.env.PLAN || plan].make(), tgt = d.kind === 'regions' ? d.regions.find(r => r.outputs).g : d; Object.assign(tgt.pl, typeof SA.UNIFIED_PL === 'object' && process.env.U ? SA.UNIFIED_PL : {}, PL);
  const st = SA.runEpisode(d, 1000 + s, SA.growCell(d, { seed: s, spec: E.spec }), E).task.stats(); m += metric(st) / NG; lq += (st.lastQuarter || 0) / NG;
}
console.log((process.env.NAME || process.env.TASK).padEnd(16), 'metric', m.toFixed(3), 'lastQ', lq.toFixed(3), ((Date.now() - t0) / 1000).toFixed(0) + 's');
