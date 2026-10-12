// Bug arena with random food/poison colours (round 21): does lifetime learning flip the colour preference?
//   [FILES=champions/v8/bug-v3h-s1.json,...] [NA=16] [TICKS=1500] [VARS='{"name":{"PL":{},"FROZEN":1}}'] node results_v20/bug.js
// Each brain (an evolved champion of the fixed-colour flash task, or a plan) lives in NA arenas; odd arena seeds swap the colours.
// Reports score (food - poison) separately for normal and swapped arenas.
const fs = require('fs'), path = require('path'), SA = require('../js/node_load.js')();
const files = (process.env.FILES || 'champions/v8/bug-v3h-s1.json,champions/v8/bug-v3h-s2.json,champions/v8/bug-v3h-s3.json').split(',');
const NA = +(process.env.NA || 16), TICKS = +(process.env.TICKS || 1500), A0 = +(process.env.A0 || 2001);
const VARS = process.env.VARS ? JSON.parse(process.env.VARS) : { global: {}, frozen: { FROZEN: 1 } };
function brains() { return files.map(f => { if (!f.endsWith('.json')) return { name: f, genome: SA.PLANS[f].make(), envParams: {} };
  const b = SA.brainFromFile(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')); return { name: path.basename(f, '.json'), genome: b.genome, envParams: b.envParams || {} }; }); }
for (const vn in VARS) { const v = VARS[vn], t0 = Date.now(); const res = { normal: [], swapped: [] };
  for (const b of brains()) { const g0 = JSON.parse(JSON.stringify(b.genome)); Object.assign(g0.pl, v.PL || {}); if (v.CH) Object.assign(g0.ch[0], v.CH);
    const E = SA.setEnv('bug', Object.assign({}, b.envParams, { randomValence: true, episodeTicks: TICKS }));
    SA.params.plasticity = !v.FROZEN;
    for (let a = A0; a < A0 + NA; a++) { const g = SA.growCell(g0, { seed: 1, spec: E.spec }); const ag = SA.runEpisode(g0, a, g, E, TICKS); const st = ag.task.stats ? ag.task.stats() : {};
      (a & 1 ? res.swapped : res.normal).push(st.score != null ? st.score : (st.food - st.poison)); } }
  const m = x => x.reduce((s, y) => s + y, 0) / x.length;
  console.log(vn.padEnd(14), 'normal', m(res.normal).toFixed(2), ' swapped', m(res.swapped).toFixed(2), ' all', m(res.normal.concat(res.swapped)).toFixed(2), ' |', ((Date.now() - t0) / 1000).toFixed(1) + 's'); }
