// Does a brain USE memory? Scores a genome with memory knocked out, in any environment.
//   [ENV=cue|recall|bug|text] [PLAN=memory|memoryK|v1|v2|v3] [DELAY=20] [K=4] [TASK=flash] node memory_test.js [brain.json ...]
// A brain file brings its own environment + settings (ENV / DELAY / TASK override them).
// Each genome is grown with NREG noise seeds (default 5) x NTEST held-out episodes (default 6). Conditions:
//   intact | no recurrent excitation (excitatory hidden->hidden) | no inhibition | no hidden->hidden synapses |
//   slow cells at normal leak | memoryless (all hidden voltages and
//   pending inputs cleared every tick).  Score = the environment's task score (cue/recall: correct - wrong per 20 trials).
'use strict';
const fs = require('fs'), path = require('path');
const REG = Array.from({ length: +(process.env.NREG || 5) }, (_, i) => 31337 + i * 7919), TEST = Array.from({ length: +(process.env.NTEST || 6) }, (_, i) => 555000 + i);
const conds = {
  'intact': b => ({ b }),
  'no recurrent excitation': b => { const k = Object.assign({}, b, { W: Float32Array.from(b.W) }), h0 = b.nIn, h1 = b.nIn + b.nHid; for (let a = h0; a < h1; a++) for (let c = h0; c < h1; c++) if (k.W[a * b.N + c] > 0) k.W[a * b.N + c] = 0; return { b: k }; },
  'no inhibition': b => { const k = Object.assign({}, b, { W: Float32Array.from(b.W) }), N = b.N; for (let a = b.nIn; a < b.nIn + b.nHid; a++) for (let c = 0; c < N; c++) if (k.W[a * N + c] < 0) k.W[a * N + c] = 0; return { b: k }; },
  'no hidden->hidden': b => { const k = Object.assign({}, b, { W: Float32Array.from(b.W) }), h0 = b.nIn, h1 = b.nIn + b.nHid; for (let a = h0; a < h1; a++) for (let c = h0; c < h1; c++) k.W[a * b.N + c] = 0; return { b: k }; },
  'slow cells -> normal leak': b => ({ b: Object.assign({}, b, { slow: null }) }),
  'memoryless (reset each tick)': b => ({ b, reset: true }),
};
function test(file) {
  const SA = require('./js/node_load.js')(); let d, name, envId = 'cue', envP = null;
  if (file) { const r = SA.brainFromFile(fs.readFileSync(file, 'utf8')); d = r.genome; envId = r.env; envP = r.envParams; name = path.basename(file); }
  if (process.env.ENV) envId = process.env.ENV;
  SA.setEnv(envId, envP || {});
  const ov = {}; if (process.env.DELAY) ov.delay = +process.env.DELAY; if (process.env.K) ov.K = +process.env.K; if (process.env.TASK) ov.task = process.env.TASK; SA.setEnv(envId, ov);
  const env = SA.currentEnv();
  if (!d) { const pl = SA.planFor(process.env.PLAN || 'env', env); d = pl.make(); name = 'hand plan ' + pl.id; }
  const res = {}, pass = {}; let hid = 0, hh = 0, slow = 0;
  for (const rs of REG) {
    const b = SA.growCell(d, { seed: rs, spec: env.spec }); const ns = SA.networkStats(b); hid += b.nHid / REG.length; hh += ns.hh / REG.length; slow += ns.slow / REG.length;
    for (const [cn, f] of Object.entries(conds)) {
      const c = f(b); let s = 0, p = 0;
      for (const sd of TEST) {
        const a = new SA.Agent(d, sd, c.b, env), h0 = c.b.nIn, h1 = c.b.nIn + c.b.nHid;
        while (!a.done) { a.tick(); if (c.reset) for (let i = h0; i < h1; i++) { a.net.v[i] = SA.V_REST; a.net.syn[i] = 0; } }
        s += a.task.score(); const st = a.task.stats ? a.task.stats() : {}; p += (st.pass != null ? st.pass : st.accuracy != null ? st.accuracy : NaN);
      }
      (res[cn] = res[cn] || []).push(s / TEST.length); (pass[cn] = pass[cn] || []).push(p / TEST.length);
    }
  }
  const m = a => a.reduce((x, y) => x + y, 0) / a.length, P = env.P;
  console.log(`${name} in '${env.def.name}'${P.delay != null ? ' (delay ' + P.delay + ')' : ''}${P.task ? ' (task ' + P.task + ')' : ''}: ${REG.length} growths x ${TEST.length} episodes; hidden ${hid.toFixed(0)}, hidden->hidden ${hh.toFixed(0)}, slow cells ${slow.toFixed(0)}`);
  for (const [cn, xs] of Object.entries(res)) console.log(`  ${cn.padEnd(30)} score ${m(xs).toFixed(2).padStart(6)}${isNaN(m(pass[cn])) ? '' : '  pass ' + m(pass[cn]).toFixed(2)}   (per growth ${xs.map(x => x.toFixed(1)).join(' ')})`);
}
const files = process.argv.slice(2); if (!files.length) test(null); else for (const f of files) test(f);
