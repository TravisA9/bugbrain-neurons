// Headless test of the engine + all environments (about 45 s unloaded):  node test_core.js
// Loads the same js/ files as index.html (js/node_load.js). Also checks v6 compatibility against legacy/v6/index_v6.html.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const load = require('./js/node_load.js');
let SA = load(), P = SA.params;
console.log('environments: ' + SA.envList().map(e => e.id).join(', ') + ' | plans: ' + Object.keys(SA.PLANS).join(', '));
// 1. every environment: grow its default plan, run an episode, 2 generations, session + brain round trips
for (const env of SA.envList()) {
  SA = load(); P = SA.params; const E = SA.setEnv(env.id);
  const quick = { bug: { episodeTicks: 300 }, cue: { nTrials: 4 }, recall: { nTrials: 4 }, text: { nChars: 60 } }[env.id] || {};
  SA.setEnv(env.id, quick);
  const d = SA.planFor('env').make(), b = SA.phenotype(d, SA.currentEnv().spec);
  assert.strictEqual(b.nIn, SA.currentEnv().spec.inputs.length); assert.strictEqual(b.nOut, SA.currentEnv().spec.outputs.length);
  const a = SA.runEpisode(d, 5, null, SA.currentEnv(), 20000); assert.ok(a.done, env.id + ' episode did not end');
  Object.assign(P, { popSize: 6, valArenas: 2, valGrowths: 2, growths: 2, episodes: 1 });
  const e = new SA.Evolution(1); e.runGeneration(); e.runGeneration();
  const s = JSON.stringify(e.toJSON()); const SB = load(); const e2 = SB.Evolution.fromJSON(s, true);
  assert.strictEqual(SB.params.env, env.id); assert.strictEqual(e2.pop.length, 6); assert.deepStrictEqual(Object.assign({}, SB.envParams[env.id]), Object.assign({}, SA.envParams[env.id]));
  const j = SA.genomeToJSON(e.champion.genome, { label: 'test' }, SA.currentEnv()); const r = SB.brainFromFile(JSON.stringify(j));
  assert.strictEqual(r.env, env.id); assert.strictEqual(SA.countSynapses(SB.phenotype(r.genome, SB.setEnv(r.env, r.envParams).spec)), SA.countSynapses(SA.phenotype(e.champion.genome, SA.currentEnv().spec)));
  const gj = SA.genomeFromJSON(j); assert.strictEqual(SA.countSynapses(gj), SA.countSynapses(SA.phenotype(e.champion.genome, SA.currentEnv().spec)));   // generic neurons+edges loader
  const st = a.task.stats ? a.task.stats() : {};
  console.log(`${env.id.padEnd(7)} plan ${SA.planFor('env').id}: ${b.nIn} in / ${b.nHid} hidden / ${b.nOut} out, ${SA.countSynapses(b)} synapses; episode ${a.t} ticks score ${a.task.score().toFixed(2)} ` +
    `${JSON.stringify(st)}; 2 generations, champion ${e.champion.val.toFixed(2)}; session + brain round trips ok`);
}
// 2. legacy rejection
SA = load();
assert.throws(() => SA.Evolution.fromJSON({ format: 'spiking-arena-session/v3', population: [{ nIn: 31, nHid: 0, edges5: [] }] }), /legacy/);
assert.throws(() => SA.brainFromFile({ format: 'spiking-arena-net/v3', neurons: [] }), /legacy/);
console.log('legacy (non-cellular) session / brain rejected: ok');
// 3. v6 compatibility: the same genome grows the same brain and scores the same in the ported bug arena
const OLDF = path.join(__dirname, 'legacy/v6/index_v6.html');
if (fs.existsSync(OLDF)) {
  const h = fs.readFileSync(OLDF, 'utf8'), ctx = { console, performance, Math }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(h.slice(h.indexOf('// ==CORE START=='), h.indexOf('// ==CORE END==')), ctx); const OLD = ctx.SpikingArena;
  SA = load(); SA.setEnv('bug'); let n = 0;
  const pairs = [['hand v3', OLD.createHandCellGenome(), SA.createHandCellGenome()], ['hand v1', OLD.createHandCellGenomeV1(), SA.createHandCellGenomeV1()]];
  const c6 = path.join(__dirname, 'champions/v6'); if (fs.existsSync(c6)) for (const f of fs.readdirSync(c6).slice(0, 2)) { const o = JSON.parse(fs.readFileSync(path.join(c6, f), 'utf8')); pairs.push([f, OLD.genomeFromCompact(o.developmental_genome), SA.brainFromFile(o).genome]); }
  for (const [name, a, b] of pairs) {
    const ga = OLD.growCell(a, { seed: 4242 }), gb = SA.growCell(b, { seed: 4242, spec: SA.currentEnv().spec });
    assert.strictEqual(ga.N, gb.N, name); for (let i = 0; i < ga.W.length; i++) assert.ok(ga.W[i] === gb.W[i], name + ' weights differ');
    for (const task of ['flash', 'hard']) { OLD.params.task = task; SA.envParams.bug.task = task;
      const s1 = new OLD.Sim(a, 7, ga), s2 = new SA.Agent(b, 7, gb); for (let t = 0; t < 600; t++) { s1.tick(); s2.tick(); }
      assert.strictEqual(s1.fitness, s2.fitness, name + ' ' + task + ' fitness differs'); n++; }
  }
  // a real v6 session opens as a bug-arena session
  Object.assign(OLD.params, { popSize: 4, episodeTicks: 100, valArenas: 1, valGrowths: 1, growths: 1, task: 'hard' });
  const oe = new OLD.Evolution(1); oe.runGeneration(); const sess = JSON.stringify(oe.toJSON());
  const SB = load(), e6 = SB.Evolution.fromJSON(sess, true); assert.strictEqual(SB.params.env, 'bug'); assert.strictEqual(SB.envParams.bug.task, 'hard'); assert.strictEqual(e6.pop.length, 4);
  console.log(`v6 compatibility: ${pairs.length} genomes grow bit-identical brains; ${n} bug-arena episodes score identically; v6 session opens as bug arena: ok`);
} else console.log('(legacy/v6 not found: v6 compatibility check skipped)');
// 4. v7 compatibility: v7 genomes (cue / recall / text / bug) grow identical brains and score the same as in legacy/v7
const V7 = path.join(__dirname, 'legacy/v7/js/node_load.js');
if (fs.existsSync(V7)) {
  const O = require(V7)(), N7 = load(); let n = 0;
  const cases = [['cue', () => [O.PLANS.memory.make(), N7.PLANS.memory.make()], {}], ['text', () => [O.PLANS.v1.make(), N7.PLANS.v1.make()], {}]];
  const c7 = path.join(__dirname, 'champions/v7');
  if (fs.existsSync(c7)) for (const f of fs.readdirSync(c7).filter(f => /cue-memory-s1|recall-memory-s1/.test(f))) { const o = fs.readFileSync(path.join(c7, f), 'utf8');
    const a = O.brainFromFile(o), b = N7.brainFromFile(o); cases.push([a.env, () => [a.genome, b.genome], a.envParams, b.envParams]); }
  for (const [env, mk, epo, epn] of cases) {
    O.setEnv(env, epo || {}); N7.setEnv(env, epn || epo || {}); const [a, b] = mk(), eo = O.currentEnv(), en = N7.currentEnv();
    const ga = O.growCell(a, { seed: 4242, spec: eo.spec }), gb = N7.growCell(b, { seed: 4242, spec: en.spec });
    assert.strictEqual(ga.N, gb.N, env); for (let i = 0; i < ga.W.length; i++) assert.ok(ga.W[i] === gb.W[i], env + ' weights differ');
    assert.strictEqual(O.runEpisode(a, 7, ga, eo, 3000).task.fitness(), N7.runEpisode(b, 7, gb, en, 3000).task.fitness(), env + ' score differs'); n++;
  }
  console.log(`v7 compatibility: ${n} genomes (plans + v7 champions, incl. a recall brain on its old output row) grow identical brains and score identically: ok`);
} else console.log('(legacy/v7 not found: v7 compatibility check skipped)');
// 5. the K-way memory plan holds K = 2 / 4 / 8 symbols (2 growths each)
{ const S5 = load();
  for (const [env, K] of [['cue', 2], ['recall', 4], ['recall', 8]]) { const E = S5.setEnv(env, env === 'recall' ? { K, delay: 20, nTrials: 16 } : { delay: 20, nTrials: 16 }), d = S5.PLANS.memoryK.make(); let c = 0, n = 0;
    for (const sd of [1, 2]) { const a = S5.runEpisode(d, 9, S5.growCell(d, { seed: sd, spec: E.spec }), E); c += a.task.correct; n += a.task.seq.length; }
    assert.ok(c / n >= 0.85, `memoryK ${env} K=${K} pass ${c / n}`); console.log(`memoryK ${env} K=${K}: pass ${(c / n).toFixed(2)}`); } }
// 6. hunger signals: plan v3 leaves the speed motor without input; v3h (v3 + hunger) wires every motor
{ const S6 = load(), E = S6.setEnv('bug', {}); const orph = d => [1, 2, 3].reduce((s, sd) => s + S6.growCell(d, { seed: sd, spec: E.spec }).devStats.orphanOut, 0);
  const o3 = orph(S6.PLANS.v3.make()), o3h = orph(S6.PLANS.v3h.make());
  assert.ok(o3 > 0 && o3h === 0, `orphan motors v3 ${o3} v3h ${o3h}`); console.log(`hunger: orphan motors in 3 growths: v3 ${o3}, v3h ${o3h}: ok`); }
// 7. v8 compatibility: v8 (and older) champions and plans grow identical brains and score identically (legacy/v8)
const V8 = path.join(__dirname, 'legacy/v8/js/node_load.js');
if (fs.existsSync(V8)) { const O = require(V8)(), N8 = load(); let n = 0;
  const fl = ['champions/v8/k8-memoryK-s2.json', 'champions/v8/bug-v3h-s1.json', 'champions/v7/cue-memory-s1.json'].map(f => path.join(__dirname, f)).filter(f => fs.existsSync(f));
  for (const f of fl) { const t = fs.readFileSync(f, 'utf8'), a = O.brainFromFile(t), b = N8.brainFromFile(t); O.setEnv(a.env, a.envParams || {}); N8.setEnv(b.env, b.envParams || {});
    const ga = O.growCell(a.genome, { seed: 3, spec: O.currentEnv().spec }), gb = N8.growCell(b.genome, { seed: 3, spec: N8.currentEnv().spec });
    assert.strictEqual(ga.N, gb.N, f); for (let i = 0; i < ga.W.length; i++) assert.ok(ga.W[i] === gb.W[i], f + ' weights differ');
    assert.strictEqual(O.runEpisode(a.genome, 9, ga, O.currentEnv(), 2000).task.fitness(), N8.runEpisode(b.genome, 9, gb, N8.currentEnv(), 2000).task.fitness(), f + ' score differs'); n++; }
  for (const [pl, e] of [['memoryK', 'cue'], ['v3h', 'bug']]) { O.setEnv(e, {}); N8.setEnv(e, {}); const da = O.PLANS[pl].make(), db = N8.PLANS[pl].make();
    const ga = O.growCell(da, { seed: 5, spec: O.currentEnv().spec }), gb = N8.growCell(db, { seed: 5, spec: N8.currentEnv().spec });
    for (let i = 0; i < ga.W.length; i++) assert.ok(ga.W[i] === gb.W[i], pl + ' weights differ'); n++; }
  console.log(`v8 compatibility: ${n} genomes grow identical brains (and champions score identically): ok`);
} else console.log('(legacy/v8 not found: v8 compatibility check skipped)');
// 8. sequence prediction: the transition-learning plan learns a cycle within a lifetime; without plasticity it cannot
//    (K = 6: with K = 4 a fixed random mapping of an untrained brain often matches the cycle by luck)
{ const S8 = load(), E = S8.setEnv('seq', { source: 'cycle', K: 6, nSyms: 120 }), d = S8.PLANS.predictK.make(); let last = 0, off = 0;
  for (const sd of [1, 2]) { last += S8.runEpisode(d, 7 + sd, S8.growCell(d, { seed: sd, spec: E.spec }), E).task.quarter(3) / 2; }
  S8.params.plasticity = false; for (const sd of [1, 2]) off += S8.runEpisode(d, 7 + sd, S8.growCell(d, { seed: sd, spec: E.spec }), E).task.accuracy / 2; S8.params.plasticity = true;
  assert.ok(last >= 0.85 && off < 0.4, `seq cycle K=6: last quarter ${last}, no plasticity ${off}`); console.log(`seq cycle K=6: last-quarter accuracy ${last.toFixed(2)} (plasticity off: ${off.toFixed(2)}): ok`); }
// 9. second-order context (v10, plan predictK2 + two-phase clock): order2 K=6 goes past the first-order limit 0.75
{ const S9 = load(), E = S9.setEnv('seq', { source: 'order2', K: 6, nSyms: 160, clock2: true }), d = S9.PLANS.predictK2.make(); let last = 0;
  for (const sd of [1, 2]) last += S9.runEpisode(d, 7 + sd, S9.growCell(d, { seed: sd, spec: E.spec }), E).task.quarter(3) / 2;
  assert.ok(last > 0.8, `seq order2 K=6 (predictK2): last quarter ${last}`); console.log(`seq order2 K=6 (predictK2): last-quarter accuracy ${last.toFixed(2)} (first-order limit 0.75): ok`); }
// 10. v12/v13 plasticity genes (metaplasticity, learned trust, gain control of the prediction layer): plan predictK2XN
//     learns text past the unigram baseline, and the trust values stay in [0, 1]
{ const S10 = load(), E = S10.setEnv('seq', { source: 'text', nSyms: 300, clock2: true }), d = S10.PLANS.predictK2XN.make();
  assert.ok(S10.defaultPlanId(E) === 'predictK2XO', 'text + two-phase clock -> predictK2XO');
  const r = S10.runEpisode(d, 8, S10.growCell(d, { seed: 1, spec: E.spec }), E), st = r.task.stats();
  assert.ok(r.net.trust && r.net.metaE && r.net.rcv && r.net.rcv.length > 0 && Array.from(r.net.trust).every(x => x >= 0 && x <= 1), 'trust / metaplasticity state');
  assert.ok(st.lastQuarter > 0.45, `predictK2XN text: last quarter ${st.lastQuarter}`);
  console.log(`seq text (predictK2XN, 300 chars): last-quarter accuracy ${st.lastQuarter.toFixed(2)} (unigram ${st.unigram.toFixed(2)}), calibrated ${st.bitsSoft.toFixed(2)} bits: ok`); }
// 11. v14 mixing layer (gene MIX, plan predictK2XM): sparse granule-like cells with few inputs and feedforward inhibition
{ const S11 = load(), E = S11.setEnv('seq', { source: 'text', nSyms: 300, clock2: true }), d = S11.PLANS.predictK2XM.make();
  const b = S11.growCell(d, { seed: 1, spec: E.spec }), nMix = b.mix ? Array.from(b.mix).filter(x => x).length : 0;
  assert.ok(nMix > 100, `predictK2XM grows mixing cells (${nMix})`);
  const r = S11.runEpisode(d, 8, b, E), st = r.task.stats();
  assert.ok(r.net.mixPre && r.net.mixList && r.net.mixList.length === nMix, 'mixing inhibition wired');
  assert.ok(st.lastQuarter > 0.45, `predictK2XM text: last quarter ${st.lastQuarter}`);
  console.log(`seq text (predictK2XM, 300 chars): ${nMix} mixing cells, last-quarter accuracy ${st.lastQuarter.toFixed(2)}: ok`); }
// 12. v15 homeostatic mixing cells (mixHomeo, plan predictK2XG; the text default) and the slim layout (gap, plan predictK2XS)
{ const S12 = load(), E = S12.setEnv('seq', { source: 'text', nSyms: 300, clock2: true }), d = S12.PLANS.predictK2XG.make();
  const b = S12.growCell(d, { seed: 1, spec: E.spec }), th0 = Float32Array.from(b.thresh), r = S12.runEpisode(d, 8, b, E), st = r.task.stats();
  assert.ok(r.net.thr && r.net.thr !== b.thresh && b.mix.some((m, i) => m && r.net.thr[i] !== b.thresh[i]), 'mixing thresholds adapt (genome untouched)');
  assert.ok(Array.from(b.thresh).every((t, i) => t === th0[i]) && st.lastQuarter > 0.45, `predictK2XG text: last quarter ${st.lastQuarter}`);
  const ds = S12.PLANS.predictK2XS.make(), bs = S12.growCell(ds, { seed: 1, spec: E.spec });
  assert.ok(!bs.mix && bs.N < b.N - 200, `predictK2XS: no mixing cells (N ${bs.N} vs ${b.N})`);
  console.log(`seq text (predictK2XG, 300 chars): last-quarter accuracy ${st.lastQuarter.toFixed(2)}; predictK2XS grows ${bs.N} cells, no mixing layer: ok`); }
// 13. v16: post-teacher afterhyperpolarisation (teachAHP, off by default) silences the taught column; the seq display renders
{ const S13 = load(), E = S13.setEnv('seq', { source: 'text', nSyms: 120, clock2: true }), d = S13.createPredict2Plan(Object.assign({}, S13.PREDICT2_XG, { teachAHP: 3 }));
  const b = S13.growCell(d, { seed: 1, spec: E.spec }), a = new S13.Agent(d, 8, b, E), T = a.task, ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
  let echo = 0; while (!a.done) { const pos = T.pos; a.tick(); if (T.pos !== pos) { const r = T.recent[T.recent.length - 1]; if (r[1] === r[0]) echo++; assert.ok(r[3] === T.seq[pos + 1], 'recent: actual next'); if (pos % 7 === 0) { T.render(ctx, 700, 480); T.outputView(); } } }
  assert.ok(a.net.ahp && echo <= 2, `teachAHP: echo ${echo}`); assert.ok(!S13.PLANS.predictK2XG.make().pl.teachAHP, 'teachAHP off in the default plan');
  console.log(`seq teachAHP: ${echo} echo predictions in 120 symbols; display renders: ok`); }
// 14. v18 growth recorder (growCell opts.record, for viewer.html) is passive: same brain with and without it; devLog structure
{ const S14 = load(); let n = 0; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'js/ui/devview.js'), 'utf8'), { window: { SpikingArena: S14 }, Math, console });
  for (const [env, ep, pid] of [['bug', {}, 'v3h'], ['cue', {}, 'memoryK'], ['recall', {}, 'memoryK'], ['seq', { source: 'text', nSyms: 120, clock2: true }, 'predictK2XO']]) {
    const E = S14.setEnv(env, ep), d = S14.PLANS[pid].make(), a = S14.growCell(d, { seed: 3, spec: E.spec }), b = S14.growCell(d, { seed: 3, spec: E.spec, record: true });
    assert.ok(!a.devLog && b.devLog && b.devLog.v === 2 && b.devLog.TT === b.devLog.T + 7 && b.devLog.cells.length > 0 && b.devLog.syn.n > 0, `${pid}: devLog`);
    assert.ok(a.N === b.N && ['W', 'thresh', 'leak'].every(k => a[k].length === b[k].length && a[k].every((x, i) => Object.is(x, b[k][i]))), `${env}/${pid}: recording changed growth`);
    const m = new S14.DevModel(b, E.spec); assert.ok(m && m.pops && m.pops.length > 0, `${pid}: DevModel`); n++; }
  console.log(`growth recorder passive (identical W / thresh / leak with and without recording) for ${n} default plans; DevModel builds: ok`); }
// 15. v19: clawOwn (plan predictK2XO, the text default): every gated reset cell X2 keeps its own column, so each previous-symbol
//     column is active exactly when its symbol came before (24-symbol cycle); fables corpus and order3 source run
{ const S15 = load(), E = S15.setEnv('seq', { source: 'cycle', K: 24, nSyms: 120, clock2: true }), K = 24;
  const T = S15.PREDICT2_XO, b = S15.growCell(S15.createPredict2Plan(T), { seed: 20, spec: E.spec, record: true }), xs = E.spec.inputs.slice(0, K).map(c => c.pos[0]);
  const lab = new Map(); for (const c of b.devLog.cells) if (c.node >= 0) lab.set(c.node, c.topo);
  const m2 = []; for (let i = b.nIn; i < b.nIn + b.nHid; i++) { const y = b.pos[i][1]; if (y < T.bands[3] && y >= T.bands[4]) m2.push(i); }
  const col = i => { let bi = 0; for (let k = 1; k < K; k++) if (Math.abs(xs[k] - lab.get(i)) < Math.abs(xs[bi] - lab.get(i))) bi = k; return bi; };
  const a = new S15.Agent(S15.PLANS.predictK2XO.make(), 5, b, E), T2 = a.task, sp = new Float32Array(b.N); let ok = 0, n = 0, extra = 0;
  while (!a.done) { const pos = T2.pos, ph = T2.phaseT; a.tick(nn => { if (ph >= 6) for (const i of m2) sp[i] += nn.spiked[i]; });
    if (T2.pos !== pos && pos > 4) { const on = new Set(m2.filter(i => sp[i] > 0).map(col)); n++; if (on.has(T2.seq[pos - 1])) ok++; extra += on.size - (on.has(T2.seq[pos - 1]) ? 1 : 0); } if (T2.pos !== pos) sp.fill(0); }
  assert.ok(ok / n > 0.95 && extra / n < 0.2, `XO: M2 holds the previous symbol (${ok}/${n}, extra columns ${(extra / n).toFixed(2)})`);
  const F = S15.setEnv('seq', { source: 'fables', nSyms: 40, clock2: true }); assert.ok(F.spec.outputs.length === 24 && S15.defaultPlanId(F) === 'predictK2XO', 'fables: 24 symbols, XO');
  const O = S15.setEnv('seq', { source: 'order3', K: 8, nSyms: 40, clock2: true }), t3 = O.def.create(1, O.P, O.spec); assert.ok(t3.rule.secondOrderAcc < 1 && t3.seq.length === 41, 'order3 source');
  console.log(`XO (clawOwn): previous-symbol memory right in ${ok}/${n} slots (24 symbols); fables + order3 sources: ok`); }
// v20 (round 21): reward-only learning with the actor-critic plans (RPE dopamine, exploration noise, competing action columns)
{ const S20 = require('./js/node_load.js')();
  const run = (env, PP, plan, frozen) => { const E = S20.setEnv(env, PP); S20.params.plasticity = !frozen; const q = [];
    for (const s of [1, 2, 3]) { const d = S20.PLANS[plan].make(), g = S20.growCell(d, { seed: s, spec: E.spec }); q.push(S20.runEpisode(d, 1000 + s, g, E).task.stats().lastQuarter); }
    S20.params.plasticity = true; return q.reduce((a, b) => a + b, 0) / q.length; };
  const B = { switchEvery: 0, nTrials: 120 }, b = run('bandit', B, 'rewardK', 0), bf = run('bandit', B, 'rewardK', 1);
  assert.ok(b > 0.6 && b > bf + 0.25, `bandit: rewardK learns the best arm from reward alone (last quarter ${b.toFixed(2)}, frozen ${bf.toFixed(2)})`);
  const C = { mapping: 'random', wrongCost: 0, nTrials: 80 }, Ec = S20.setEnv('cue', C);
  assert.ok(S20.defaultPlanId(Ec) === 'unifiedR' && Ec.spec.inputs.length === 12 && S20.defaultPlanId(S20.setEnv('cue', { mapping: 'same', wrongCost: 1, nTrials: 60 })) === 'memoryK', 'cue: random mapping -> rewardE (v26) + broadcast GO; same mapping -> memoryK');
  const c = run('cue', C, 'rewardMemK', 0), cf = run('cue', C, 'rewardMemK', 1);
  assert.ok(c > 0.6 && c > cf + 0.25, `cue random mapping, reward only: rewardMemK learns (last quarter ${c.toFixed(2)}, frozen ${cf.toFixed(2)})`);
  const n0 = new S20.Agent(S20.PLANS.v3h.make(), 1).net; assert.ok(!n0.crit && !n0.anList, 'new genes off: no critic, no action noise in old plans');
  { const be = run('bandit', B, 'rewardE', 0), ce = run('cue', { mapping: 'random', wrongCost: 1, nTrials: 80 }, 'rewardE', 0);   // default wrongCost (1): rewardE was evolved with punishment; with wrongCost 0 it is weaker than rewardMemK (R27)
    assert.ok(be > 0.6 && ce > 0.6 && S20.defaultPlanId(S20.setEnv('bandit', B)) === 'unifiedR', `v26 rewardE (default): bandit last quarter ${be.toFixed(2)} (rewardK ${b.toFixed(2)}), cue random ${ce.toFixed(2)} (rewardMemK ${c.toFixed(2)})`);
    console.log(`rewardE (v26): bandit ${be.toFixed(2)}, cue random ${ce.toFixed(2)}: ok`); }
  console.log(`reward learning (v20): bandit last quarter ${b.toFixed(2)} (frozen ${bf.toFixed(2)}), cue random mapping ${c.toFixed(2)} (frozen ${cf.toFixed(2)}): ok`); }
// v21 (round 22): context cascade (predictK3: cortex + context region on the three-phase clock) and multi-region brains
{ const S21 = require('./js/node_load.js')();
  const T = S21.setEnv('seq', S21.recommendedEnvParams('seq', { source: 'text' }, ['source'])); assert.ok(T.P.clock3 && ['unifiedR','deepURSx3'].includes(S21.defaultPlanId(T)) && S21.DEFAULTS_VERSION >= 19, 'text default: three-phase clock -> predictK3');
  const E = S21.setEnv('seq', { source: 'order3', K: 8, nSyms: 400, clock2: true, clock3: true }), q = w3 => { let s = 0; for (const sd of [40, 41]) { const d = S21.createPredict3Plan(w3 != null ? { w3 } : {}), g = S21.growCell(d, { seed: sd, spec: E.spec }); s += S21.runEpisode(d, 1000 + sd, g, E).task.stats().lastQuarter; } return s / 2; };
  const k3 = q(), cut = q(0); assert.ok(k3 > 0.85 && k3 > cut + 0.1, `order3: predictK3 beats the 2nd-order limit and needs its M3 tract (last quarter ${k3.toFixed(2)}, tract cut ${cut.toFixed(2)})`);
  const g = S21.growCell(S21.PLANS.predictK3.make(), { seed: 1, spec: E.spec, record: true }); assert.ok(g.regions.length === 2 && g.tracts.every(t => t.synapses > 0) && g.regionParts.length === 2 && !Object.keys(g).includes('regionParts'), 'regions: 2 regions, tracts laid, parts not saved');
  const B = S21.setEnv('bandit', { switchEvery: 0, nTrials: 120 }), d = S21.PLANS.rewardKR.make(), c = S21.genomeFromCompact(JSON.parse(JSON.stringify(S21.genomeToCompact(d))));
  const ga = S21.growCell(d, { seed: 2, spec: B.spec }), gb = S21.growCell(c, { seed: 2, spec: B.spec }); let same = ga.N === gb.N; for (let i = 0; i < ga.W.length && same; i++) same = ga.W[i] === gb.W[i];
  const m = S21.mutateCell(S21.cloneCell(d), S21.mulberry32(3)), x = S21.crossCell(d, m, S21.mulberry32(4)); assert.ok(same && m.kind === 'regions' && x.kind === 'regions' && S21.growCell(x, { seed: 1, spec: B.spec }).nHid > 100, 'regions genome: compact round trip, mutation, crossover');
  let r = 0; for (const sd of [1, 2]) { const dd = S21.PLANS.rewardKR.make(); r += S21.runEpisode(dd, 1000 + sd, S21.growCell(dd, { seed: sd, spec: B.spec }), B).task.stats().lastQuarter / 2; }
  assert.ok(r > 0.45, `bandit: two-region actor-critic (cortex -> striatum tract) learns (last quarter ${r.toFixed(2)})`);
  console.log(`v21: predictK3 order3 last quarter ${k3.toFixed(2)} (M3 tract cut ${cut.toFixed(2)}), regions grow / save / mutate, rewardKR bandit ${r.toFixed(2)}: ok`); }
// v22 (round 23): ONE learning rule (UNIFIED_PL) in the default teacher and reward plans
{ const S22 = require('./js/node_load.js')(), U = S22.UNIFIED_PL, same = pl => Object.keys(U).every(k => pl[k] === U[k]);
  const k3 = S22.PLANS.predictK3.make(), rk = S22.PLANS.rewardK.make(), rm = S22.PLANS.rewardMemK.make();
  assert.ok(same(k3.regions[0].g.pl) && same(rk.pl) && same(rm.pl) && S22.DEFAULTS_VERSION >= 21, 'predictK3, rewardK, rewardMemK share the unified rule set');
  const E = S22.setEnv('seq', { source: 'order3', K: 8, nSyms: 300, clock2: true, clock3: true }), g = S22.growCell(k3, { seed: 40, spec: E.spec }), a = S22.runEpisode(k3, 1040, g, E);
  assert.ok(a.net.uni && !a.net.eOn && a.task.stats().lastQuarter > 0.8, `seq: every receiver has an instructive input (teacher), no dopamine traces needed (last quarter ${a.task.stats().lastQuarter.toFixed(2)})`);
  const B = S22.setEnv('bandit', { switchEvery: 0, nTrials: 120 }), b = S22.runEpisode(rk, 1001, S22.growCell(rk, { seed: 1, spec: B.spec }), B);
  assert.ok(b.net.uni && b.net.eOn && b.net.eList.length === b.net.plastic.length && b.net.crit, 'bandit: no instructive input, every receiver learns from the dopamine RPE');
  console.log(`v22 unified rule: seq order3 last quarter ${a.task.stats().lastQuarter.toFixed(2)} (instructive), bandit last quarter ${b.task.stats().lastQuarter.toFixed(2)} (RPE): ok`); }
// v27 (round 28): local connection demand, default on in predictK3 / rewardE; off (bit-identical) when the gene is 0
{ const S = require('./js/node_load.js')(), E = S.PLANS.rewardE.make(), K3 = S.PLANS.predictK3.make();
  assert.ok(E.sc.demand === 1 && E.sc.demandRelax === 0 && K3.regions.every(r => r.g.sc.demand === 1) && S.DEFAULTS_VERSION >= 23, 'demand on in the default plans');
  const B = S.setEnv('bandit', { K: 6 }); let cOn = 0, cOff = 0; const off = S.cloneCell(E); off.sc.demand = 0;
  for (const sd of [11, 12, 13, 14]) { cOn += S.growCell(E, { seed: sd, spec: B.spec }).devStats.outCov / 4; cOff += S.growCell(off, { seed: sd, spec: B.spec }).devStats.outCov / 4; }
  assert.ok(cOn > cOff, `demand raises output coverage (6 arms: ${cOff.toFixed(2)} -> ${cOn.toFixed(2)})`);
  const g0 = S.cloneCell(off), w1 = S.growCell(off, { seed: 3, spec: B.spec }).W; S.params.cellDemand = false; const w2 = S.growCell(E, { seed: 3, spec: B.spec }).W; S.params.cellDemand = true;
  assert.ok(w1.length === w2.length && w1.every((v, i) => v === w2[i]), 'demand 0 == demand switched off (no side effects)');
  console.log(`v27 demand: 6-arm output coverage ${cOff.toFixed(2)} -> ${cOn.toFixed(2)}, off-switch bit-identical: ok`); }
// v28 (round 29, experimental, off by default): need-growth recruits reserve cells only where errors persist, capped by the reserve
{ const S = require('./js/node_load.js')(), Sq = S.setEnv('seq', { source: 'text', nSyms: 300 }), d = S.PLANS.predictK3.make();
  assert.ok(d.regions.every(r => !(r.g.pl.ng > 0)), 'need-growth off in the default plans');
  const b = S.growCell(d, { seed: 4, spec: Sq.spec }); b.pl = Object.assign({}, S.PL_DEFAULTS, b.pl, { ng: 1, ngReduce: 0.5, ngRes: 64 });
  const a = new S.Agent(d, 4, b, Sq); while (!a.done) a.tick(); const st = a.net.needStats();
  assert.ok(st.mode === 'mismatch' && st.added > 0 && st.alive <= 64 && st.dead > 0, 'need-growth recruits in a reduced brain: ' + JSON.stringify(st).slice(0, 200));
  console.log(`v28 need-growth (reduced text brain): ${st.dead} layer cells removed, ${st.added} recruited, ${st.pruned} pruned, ${st.alive} alive (cap 64), error ${st.E}: ok`); }
{ const S = require('./js/node_load.js')(), U = S.PLANS.unifiedRv32.make(), E2 = S.PLANS.rewardE2.make(); assert.ok(JSON.stringify(U.regions[2].g) === JSON.stringify(E2) && E2.pl.eligMix > 0.2 && S.PL_DEFAULTS.eligGate === 0 && S.DEFAULTS_VERSION >= 24, 'v31 (R35): unifiedR striatum = rewardE2; eligGate off by default'); console.log('v31 unifiedR reward area = rewardE2: ok'); }
{ const S = require('./js/node_load.js')(), U = S.PLANS.unifiedRv32.make(), sig = (R, A, O) => S.areaExpr(R, { A, O }); assert.ok(U.areal && U.graded && sig(U.regions[2], 1, 1) > 0.99 && sig(U.regions[2], 1, 0) < 0.15 && sig(U.regions[0], 1, 0) > 0.99 && sig(U.regions[0], 0, 1) < 0.15 && sig(U.regions[0], 1, 1) > 0.15 && sig(U.regions[0], 1, 1) < sig(U.regions[2], 1, 1) && S.DEFAULTS_VERSION >= 25, 'v32 (R37): outcome -> striatum full + owns outputs; clock + outcome -> graded cortex feeding it'); console.log('v32 unifiedR mixed-task areal rule: ok'); }
{ const S = require('./js/node_load.js')(), U = S.PLANS.unifiedR.make(), O = S.PLANS.unifiedRv32.make(); const cu = S.genomeToCompact(U).cell.regions, co = S.genomeToCompact(O).cell.regions; assert.ok(JSON.stringify(cu[0]) === JSON.stringify(co[0]) && JSON.stringify(cu[1]) === JSON.stringify(co[1]) && JSON.stringify(cu[2]) !== JSON.stringify(co[2]) && S.params.juvMode === 0 && S.DEFAULTS_VERSION >= 26, 'v33 (R39): striatum rewardE3, cortex unchanged, juvMode off'); console.log('v33 unifiedR striatum = rewardE3: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3.make(), sig = (R, A, O) => S.areaExpr(R, { A, O }), T = S.setEnv('seq', S.recommendedEnvParams('seq', { source: 'text' }, ['source']));
  assert.ok(D.regions.length === 5 && sig(D.regions[3], 1, 0) > 0.99 && sig(D.regions[4], 1, 0) > 0.99 && sig(D.regions[3], 1, 1) < 0.01 && sig(D.regions[4], 0, 1) < 0.01 && S.defaultPlanId(T) === 'deepURSx3' && S.defaultPlanId(S.setEnv('seqchoice', { source: 'cycle' })) === 'deepURSx3' && S.DEFAULTS_VERSION >= 27, 'v34 (R44): deepURSx3 default; deep context areas grow with the clock, repressed by the outcome');
  console.log('v34 deepURSx3 default (deep context, outcome-repressed): ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v35.make(), O = S.PLANS.deepURSx3v34.make();
  assert.ok(D.regions.every(R => R.g.pl.predErr === 0.3 && R.g.pl.peMode === 16 && R.g.pl.peFix === 0.01 && !R.g.pl.metaCap) && O.regions.every(R => !R.g.pl.predErr) && D.regions.length === O.regions.length, 'v35 (R53, kept as deepURSx3v35): v34 plan + hybrid prediction-miss LTD in every area');
  console.log('v35 deepURSx3v35 + hybrid prediction-miss LTD (predErr 0.3, peMode 16, peFix 0.01): ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v36.make(), O = S.PLANS.deepURSx3v35.make();
  assert.ok(D.regions.every((R, i) => R.g.pl.predErr === 0 && R.g.pl.metaCap === 200 && R.g.pl.peMode === 16 && R.g.pl.peFix === 0.01 && R.g.pl.metaN === O.regions[i].g.pl.metaN && R.g.pl.lr === O.regions[i].g.pl.lr) && D.regions.length === O.regions.length && S.PARAM_DEFAULTS && S.DEFAULTS_VERSION >= 29, 'v36 (R62, kept as deepURSx3v36): v35 plan with predErr 0 + metaCap 200');
  const E = S.setEnv('seq', S.recommendedEnvParams('seq', { source: 'text' }, ['source'])); assert.ok(S.defaultPlanId(E) === 'deepURSx3' && E.P.readIn === 0.01, 'v36 text default plan + graded decoder');
  console.log('v36 deepURSx3v36 (predErr 0, metaCap 200) + seq graded decoder readIn 0.01: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v37.make(), O = S.PLANS.deepURSx3v36.make();
  assert.ok(D.regions.every((R, i) => JSON.stringify(Object.assign({}, R.g.pl, { lr: 0, predErr: 0 })) === JSON.stringify(Object.assign({}, O.regions[i].g.pl, { lr: 0, predErr: 0 })) && R.g.pl.lr === (R.name === 'cortex' ? 0.1 : O.regions[i].g.pl.lr) && R.g.pl.predErr === (R.name === 'striatum' ? 0.3 : 0) && R.g.pl.peMode === 16)
    && D.regions[0].name === 'cortex' && D.regions[2].name === 'striatum' && O.regions[0].g.pl.lr === 0.05 && S.DEFAULTS_VERSION >= 30, 'v37 (R64): deepURSx3 = v36 plan with cortex lr 0.1 + striatum predErr 0.3 (other regions unchanged)');
  console.log('v37 deepURSx3 = v36 + cortex lr 0.1 + striatum predErr 0.3: ok'); }
{ const S = require('./js/node_load.js')(); assert.ok(S.PARAM_DEFAULTS && S.params.fastEngine === 1 && S.DEFAULTS_VERSION >= 31, 'v38 (R69): fast engine (params.fastEngine 1) is the default');
  console.log('v38 fast engine default: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3.make(), O = S.PLANS.deepURSx3v37.make();
  assert.ok(D.regions.length === O.regions.length && D.regions.every((R, i) => JSON.stringify(Object.assign({}, R.g.pl, { lr: 0 })) === JSON.stringify(Object.assign({}, O.regions[i].g.pl, { lr: 0 }))
    && R.g.pl.lr === (R.name === 'cortex' ? 0.2 : O.regions[i].g.pl.lr)) && O.regions[0].name === 'cortex' && O.regions[0].g.pl.lr === 0.1
    && S.DEFAULTS_VERSION === 32 && S.APP_VERSION === 'v39', 'v39 (R70): deepURSx3 = v37 plan with cortex lr 0.2 (other regions unchanged)');
  console.log('v39 deepURSx3 = v37 + cortex lr 0.2: ok'); }
console.log('ALL OK');
