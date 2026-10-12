// Round 24: two-region vs single-tissue actor-critic, R21c settings (8 growths, seeds 11-18). EN=bandit|cue [V='{"single":1}' | V='{"tune":{...}}'] [PER=1] node results_v23/kr.js
// full-setting runs (R21c settings, 8 growths seeds 11-18) of single vs two-region plans with optional post-growth edits
const SA = require('../js/node_load.js')();
const en = process.env.EN, V = JSON.parse(process.env.V || '{}'), mem = en === 'cue';
const E = SA.setEnv(en === 'cue' ? 'cue' : 'bandit', en === 'cue' ? { mapping: 'random', wrongCost: 0, delay: 10, nTrials: 120 } : {});
const acc = {}; for (let s = 11; s < 19; s++) { const d = V.single ? SA.PLANS[mem ? 'rewardMemK' : 'rewardK'].make() : SA.createRewardRegionsPlan(Object.assign({ mem }, V.tune || {}));
  const g = SA.growCell(d, { seed: s, spec: E.spec }), N = g.N;
  if (V.noIntra) for (let q = 0; q < N * N; q++) if (g.P[q] && g.region[Math.floor(q / N)] === 1) { g.P[q] = 0; }
  const st = SA.runEpisode(d, 1000 + s, g, E).task.stats(); if (process.env.PER) process.stdout.write(s + ":" + (st.pass != null ? st.pass : st.optimal).toFixed(2) + "/" + st.silent + " "); for (const k of ['optimal', 'lastQuarter', 'blockLate', 'silent', 'pass', 'firstQuarter']) if (st[k] != null) acc[k] = (acc[k] || 0) + st[k] / 8; }
for (const k in acc) acc[k] = +acc[k].toFixed(3); console.log((process.env.NAME || '').padEnd(14), en, JSON.stringify(acc));
