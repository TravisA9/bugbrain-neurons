// Experiment runner (v7): parallel child processes, one per condition x seed, any environment.
//   node experiment.js GENS SEEDS NAME=key:val,key:val NAME2=...
// e.g. node experiment.js 40 1,2,3 memory=env:cue,cellStart:memory v1=env:cue,cellStart:v1
//      node experiment.js 40 1,2,3 robust=env:bug,task:hard,growths:3
// Keys: engine params (growths, cellStart, popSize, ...) and the chosen environment's params (task, delay, ...).
// Each condition evolves from scratch (mutants of cellStart). The champion is then REGROWN with NREG fresh
// developmental-noise seeds (never seen in training or validation), and each regrown brain is scored on
// NTEST held-out episodes with the environment's task score (bug: food - poison - 2 x caught; cue/recall:
// correct - wrong per episode, plus the pass rate; text: accuracy). Reported: mean / sd / min / max over regrowths.
//   env vars: NTEST (default 20), NREG (default 10), SAVE_DIR (write champion brain files), FROZEN=1 (also score with learning off),
//             LOG (append interim lines to this file every 10 generations)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const TEST = Array.from({ length: +(process.env.NTEST || 20) }, (_, i) => 555000 + i);
const REG = Array.from({ length: +(process.env.NREG || 10) }, (_, i) => 31337 + i * 7919);
function parse(spec) { const o = {}; for (const kv of spec.split(',').filter(Boolean)) { const [k, v] = kv.split(':'); o[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v; } return o; }
if (process.argv[2] === '--child') {
  const cfg = JSON.parse(process.argv[3]);
  const SA = require('./js/node_load.js')(), P = SA.params;
  const envId = cfg.params.env || 'bug'; SA.setEnv(envId);
  for (const k in cfg.params) { if (k === 'env') continue; if (k in SA.envParams[envId]) SA.envParams[envId][k] = cfg.params[k]; else P[k] = cfg.params[k]; }
  const t0 = Date.now(), evo = new SA.Evolution(cfg.seed), curve = [];
  for (let g = 0; g < cfg.gens; g++) {
    evo.runGeneration(); if (g % 10 === 9 || g === 0) curve.push(+evo.champion.val.toFixed(1));
    if (process.env.LOG && g % 10 === 9) fs.appendFileSync(process.env.LOG, `${new Date().toISOString()} ${cfg.name} s${cfg.seed} gen ${g + 1} champion ${evo.champion.val.toFixed(2)}\n`);
  }
  const secs = (Date.now() - t0) / 1000, champ = evo.champion.genome, env = SA.currentEnv();
  const life = (brain, learn) => { const keep = P.plasticity; P.plasticity = learn; let s = 0; const st = {};
    for (const sd of TEST) { const a = SA.runEpisode(champ, sd, brain, env); s += a.task.score();
      const x = a.task.stats ? a.task.stats() : {}; for (const k in x) if (typeof x[k] === 'number') st[k] = (st[k] || 0) + x[k] / TEST.length; }
    P.plasticity = keep; return { s: s / TEST.length, st }; };
  const regs = [], hid = [], syn = [], hh = [], depth = [], slow = [];
  for (const rs of REG) { const b = SA.growCell(champ, { seed: rs, spec: env.spec }); const ns = SA.networkStats(b);
    hid.push(b.nHid); syn.push(ns.synapses); hh.push(ns.hh); depth.push(ns.maxDepth); slow.push(ns.slow); regs.push(life(b, true)); }
  const own = life(SA.phenotype(champ, env.spec), true), frozen = process.env.FROZEN ? life(SA.phenotype(champ, env.spec), false) : null;
  if (process.env.SAVE_DIR) fs.writeFileSync(path.join(process.env.SAVE_DIR, `${cfg.name}-s${cfg.seed}.json`), JSON.stringify(SA.genomeToJSON(champ, { label: cfg.name + ' seed ' + cfg.seed, params: cfg.params }, env)));
  const xs = regs.map(r => r.s), m = a => a.reduce((x, y) => x + y, 0) / a.length;
  const stat = k => regs[0].st[k] != null ? m(regs.map(r => r.st[k])) : null;
  process.stdout.write(JSON.stringify({ name: cfg.name, seed: cfg.seed, mean: m(xs), sd: Math.sqrt(m(xs.map(x => (x - m(xs)) ** 2))), min: Math.min(...xs), max: Math.max(...xs),
    own: own.s, frozen: frozen && frozen.s, pass: stat('pass'), passMin: regs[0].st.pass != null ? Math.min(...regs.map(r => r.st.pass)) : null, fail: regs[0].st.pass != null ? regs.filter(r => r.st.pass < 0.9).length / regs.length : null, caught: stat('caught'), acc: stat('accuracy'), bpc: stat('bpc'),
    curve, secs, val: evo.champion.val, params: SA.genomeParamCount(champ), hidden: m(hid), syn: m(syn), hh: m(hh), depth: m(depth), slow: m(slow), finalEnv: Object.assign({}, env.P) }));
  process.exit(0);
}
const gens = +process.argv[2], seeds = process.argv[3].split(',').map(Number);
const conds = process.argv.slice(4).map(a => { const i = a.indexOf('='); return { name: a.slice(0, i), params: parse(a.slice(i + 1)) }; });
const jobs = []; for (const c of conds) for (const seed of seeds) jobs.push({ name: c.name, params: c.params, seed, gens });
const t0 = Date.now();
Promise.all(jobs.map(j => new Promise(res => {
  const c = cp.spawn(process.execPath, [__filename, '--child', JSON.stringify(j)]); let out = '';
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => process.stderr.write(d));
  c.on('close', () => { try { const r = JSON.parse(out); console.log('done', r.name, r.seed, r.mean.toFixed(2)); res(r); } catch (e) { console.log('FAILED', j.name, j.seed); res(null); } });
}))).then(rs => {
  rs = rs.filter(Boolean);
  const f = (x, n) => x == null ? '   -' : x.toFixed(n == null ? 2 : n);
  console.log(`${gens} generations, seeds ${seeds.join(',')}; champion regrown with ${REG.length} fresh noise seeds x ${TEST.length} held-out episodes (task score)`);
  for (const c of conds) console.log(`  ${c.name}: ${JSON.stringify(c.params)}`);
  console.log('cond         seed | regrowth mean   sd    min    max | own seed | pass (min) | hidden synapses h->h slow depth | min/run | val curve');
  for (const r of rs) console.log(`${r.name.padEnd(12)} ${String(r.seed).padStart(4)} | ${f(r.mean).padStart(6)} ${f(r.sd).padStart(5)} ${f(r.min).padStart(6)} ${f(r.max).padStart(6)} | ${f(r.own).padStart(6)}${r.frozen != null ? ' (frozen ' + f(r.frozen) + ')' : ''} | ${r.pass != null ? f(r.pass) + ' (' + f(r.passMin) + ') fail ' + (100 * r.fail).toFixed(0) + '%' : r.acc != null ? 'acc ' + f(r.acc) + ' bpc ' + f(r.bpc) : '   -'} | ${r.hidden.toFixed(0).padStart(6)} ${r.syn.toFixed(0).padStart(7)} ${r.hh.toFixed(0).padStart(5)} ${r.slow.toFixed(0).padStart(4)} ${r.depth.toFixed(1).padStart(4)} | ${(r.secs / 60).toFixed(1).padStart(5)} | ${r.curve.join(' ')}${r.finalEnv.delay != null ? ' | final delay ' + r.finalEnv.delay : ''}`);
  for (const c of conds) { const g = rs.filter(r => r.name === c.name); if (!g.length) continue; const av = fn => (g.reduce((s, r) => s + fn(r), 0) / g.length);
    console.log(`MEAN ${c.name.padEnd(12)} regrowth mean ${av(r => r.mean).toFixed(2)}  min ${av(r => r.min).toFixed(2)}  sd ${av(r => r.sd).toFixed(2)}  own-seed ${av(r => r.own).toFixed(2)}` +
      (g[0].pass != null ? `  pass ${av(r => r.pass).toFixed(2)} (worst regrowth ${av(r => r.passMin).toFixed(2)}, failed regrowths ${(100 * av(r => r.fail)).toFixed(0)}%)` : '') + (g[0].caught != null ? `  caught ${av(r => r.caught).toFixed(2)}` : '') +
      `  hidden ${av(r => r.hidden).toFixed(0)}  synapses ${av(r => r.syn).toFixed(0)}  h->h ${av(r => r.hh).toFixed(0)}  slow ${av(r => r.slow).toFixed(0)}  depth ${av(r => r.depth).toFixed(1)}  min/run ${av(r => r.secs / 60).toFixed(1)}`); }
  console.log(`(total ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
});
