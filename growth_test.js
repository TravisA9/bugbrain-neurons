// Growth reliability: how many independently grown brains of one genome actually work?
//   [ENV=cue|recall] [K=4] [DELAY=20] [PLAN=memory|memoryK|...] [NG=100] [NE=2] [MIRROR=1] [SC='{"hunger":1}'] node growth_test.js [brain.json ...]
// SC overrides cell parameters of the genome (e.g. switch on hunger / request / normE). Also reports orphan outputs
// (no excitatory input at all) and silent inputs (no target).
// Each genome is grown NG times with fresh noise seeds and run for NE episodes. A growth FAILS if its
// pass rate is below 0.9 (score-based environments: below 90% of the best growth). For failed vs working
// growths it compares generic structure measures, to show what goes wrong:
//   hidden cells; per input channel: hidden cells it reaches (min over channels); per output: hidden cells
//   driving it (min over outputs); imbalance of the two sides (|L-R|/(L+R) of hidden cells);
//   recurrent (hidden->hidden) excitation and inhibition; cones that made no synapse; trophic deaths.
'use strict';
const fs = require('fs'), path = require('path');
const NG = +(process.env.NG || 100), NE = +(process.env.NE || 2);
function test(file) {
  const SA = require('./js/node_load.js')(); let d, name, envId = process.env.ENV || 'cue', envP = {};
  if (file) { const r = SA.brainFromFile(fs.readFileSync(file, 'utf8')); d = r.genome; envId = process.env.ENV || r.env; envP = r.envParams || {}; name = path.basename(file); }
  SA.setEnv(envId, envP);
  const ov = {}; if (process.env.DELAY) ov.delay = +process.env.DELAY; if (process.env.K) ov.K = +process.env.K; if (process.env.TASK) ov.task = process.env.TASK;
  const env = SA.setEnv(envId, ov);
  if (process.env.MIRROR) SA.params.cellMirror = true;
  if (!d) { const pl = SA.planFor(process.env.PLAN || 'env', env); d = pl.make(); name = 'plan ' + pl.id; }
  if (process.env.SC) Object.assign(d.sc, JSON.parse(process.env.SC));
  const rows = [];
  for (let k = 0; k < NG; k++) {
    const b = SA.growCell(d, { seed: 100000 + k * 7919, spec: env.spec }), N = b.N, h0 = b.nIn, h1 = h0 + b.nHid, o0 = h1;
    let pass = 0, sil = 0, wr = 0, sc = 0, n = 0;
    for (let e = 0; e < NE; e++) { const a = SA.runEpisode(d, 555000 + e, b, env), st = a.task.stats ? a.task.stats() : {};
      sc += a.task.score() / NE; if (st.pass != null) { pass += st.correct; sil += st.silent; wr += st.wrong; n += st.trials; } }
    const inReach = env.spec.inputs.map((c, i) => { let m = 0; for (let j = h0; j < h1; j++) if (b.W[i * N + j]) m++; return m; }).filter((m, i) => !env.spec.inputs[i].tonic && env.spec.inputs[i].group !== 'go');
    const outSup = b.nOut ? Array.from({ length: b.nOut }, (_, m) => { let s = 0; for (let i = h0; i < h1; i++) if (b.W[i * N + o0 + m] > 0) s++; return s; }) : [0];
    let L = 0, R = 0, ex = 0, inh = 0; for (let i = h0; i < h1; i++) { if (b.pos[i][0] < 0) L++; else R++; for (let j = h0; j < h1; j++) { const w = b.W[i * N + j]; if (w > 0) ex += w; else inh -= w; } }
    const cs = b.devStats.cones || {};
    rows.push({ pass: n ? pass / n : null, sil: n ? sil / n : 0, wr: n ? wr / n : 0, score: sc, hid: b.nHid, inMin: Math.min(...inReach), outMin: Math.min(...outSup),
                side: Math.abs(L - R) / Math.max(1, L + R), ex, inh, noSyn: (cs.mainFail || 0) + (cs.collFail || 0), troph: b.devStats.trophicDeaths,
                orph: b.devStats.orphanOut / Math.max(1, b.devStats.nOut), silIn: b.devStats.silentIn / Math.max(1, b.devStats.nInUsed), hungerSyn: b.devStats.hungerSyn });
  }
  const best = Math.max(...rows.map(r => r.score)), failed = r => r.pass != null ? r.pass < 0.9 : r.score < 0.9 * best;
  const F = rows.filter(failed), O = rows.filter(r => !failed(r)), m = (a, f) => a.length ? a.reduce((s, r) => s + f(r), 0) / a.length : NaN;
  const P = env.P;
  console.log(`${name} in '${env.def.name}'${P.K ? ' K=' + P.K : ''}${P.delay != null ? ' delay ' + P.delay : ''}${SA.params.cellMirror ? ' (imposed mirror)' : ''}: ${NG} growths x ${NE} episodes`);
  console.log(`  FAILED growths: ${F.length}/${NG} = ${(100 * F.length / NG).toFixed(0)}%   mean pass ${rows[0].pass != null ? m(rows, r => r.pass).toFixed(3) : '-'}   mean score ${m(rows, r => r.score).toFixed(2)}` +
    (rows[0].pass != null ? `   failures: mostly silent ${F.filter(r => r.sil >= r.wr).length}, mostly wrong ${F.filter(r => r.wr > r.sil).length}` : ''));
  const f = (k, fn, dg) => console.log(`  ${k.padEnd(34)} failed ${m(F, fn).toFixed(dg).padStart(8)}   working ${m(O, fn).toFixed(dg).padStart(8)}`);
  f('hidden cells', r => r.hid, 0); f('min hidden cells reached by an input', r => r.inMin, 1); f('min hidden cells driving an output', r => r.outMin, 1);
  f('left/right imbalance of hidden cells', r => r.side, 2); f('recurrent excitation (sum mV)', r => r.ex, 0); f('recurrent inhibition (sum mV)', r => r.inh, 0);
  console.log(`  orphan outputs (no excitatory input) ${(100 * m(rows, r => r.orph)).toFixed(1)}%   silent inputs (no target) ${(100 * m(rows, r => r.silIn)).toFixed(1)}%   synapses made through hunger/request ${m(rows, r => r.hungerSyn).toFixed(1)}`);
  f('axon branches without any synapse', r => r.noSyn, 1); f('trophic deaths', r => r.troph, 1);
}
const files = process.argv.slice(2); if (!files.length) test(null); else for (const f of files) test(f);
