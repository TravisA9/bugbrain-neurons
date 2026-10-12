// Cellular development tests in any environment: a body plan's robustness to developmental noise,
// mechanism ablations, growth time, genome size vs grown brain size.
//   [ENV=cue|recall|bug|text] [PLAN=memory|v1|v2|v3] [TASK=hard] [DELAY=20] node cell_test.js [brain.json]
//   (default plan = the environment's default plan; a brain file brings its own environment + settings)
'use strict';
const fs = require('fs');
const SA = require('./js/node_load.js')(), P = SA.params;
let d = null, envId = process.env.ENV || 'cue', envP = {};
if (process.argv[2]) { const r = SA.brainFromFile(fs.readFileSync(process.argv[2], 'utf8')); d = r.genome; envId = process.env.ENV || r.env; envP = r.envParams || {}; }
SA.setEnv(envId, envP);
const ov = {}; if (process.env.TASK) ov.task = process.env.TASK; if (process.env.DELAY) ov.delay = +process.env.DELAY; const env = SA.setEnv(envId, ov);
if (!d) d = SA.planFor(process.env.PLAN || 'env', env).make();
const NT = +(process.env.NTEST || 8), TEST = Array.from({ length: NT }, (_, i) => 555000 + i), NSEEDS = +(process.env.NSEEDS || 10);
const score = b => { let s = 0; for (const sd of TEST) s += SA.runEpisode(d, sd, b, env).task.score(); return s / NT; };
function row(name, setup) {
  const keep = { cellTrophic: P.cellTrophic, cellRefine: P.cellRefine, cellHomeo: P.cellHomeo, cellMirror: P.cellMirror }; Object.assign(P, setup);
  const sc = [], hid = [], syn = []; let ms = 0;
  for (let k = 0; k < NSEEDS; k++) { const b = SA.growCell(d, { seed: (d.seed || 1) + k * 7919, spec: env.spec }); ms += b.devStats ? b.devStats.ms : 0; hid.push(b.nHid); syn.push(SA.countSynapses(b)); sc.push(score(b)); }
  Object.assign(P, keep);
  const m = a => a.reduce((x, y) => x + y, 0) / a.length, sd = a => Math.sqrt(m(a.map(x => (x - m(a)) ** 2)));
  console.log(`${name.padEnd(28)} | ${m(sc).toFixed(2).padStart(6)} ± ${sd(sc).toFixed(2).padEnd(5)} | min ${Math.min(...sc).toFixed(2).padStart(6)} max ${Math.max(...sc).toFixed(2).padStart(6)} | hidden ${m(hid).toFixed(0).padStart(4)} | synapses ${m(syn).toFixed(0).padStart(5)} | ${(ms / NSEEDS).toFixed(0)} ms/growth`);
}
console.log(`genome: ${process.argv[2] || d.label || 'cellular'}; ${SA.genomeParamCount(d)} genome numbers; ${NSEEDS} developmental-noise seeds x ${NT} held-out episodes in '${env.def.name}' (task score)`);
console.log('condition                    |  mean ± sd (over growth seeds) | worst/best grown brain | grown size');
row('all mechanisms', {});
row('no trophic competition', { cellTrophic: false });
row('no activity refinement', { cellRefine: false });
row('no homeostasis', { cellHomeo: false });
row('none of 4-6', { cellTrophic: false, cellRefine: false, cellHomeo: false });
row('imposed bilateral symmetry', { cellMirror: true });
