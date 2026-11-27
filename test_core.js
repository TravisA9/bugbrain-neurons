// Headless test of the engine + all environments (about 2 min unloaded):  node test_core.js
// Loads the same js/ files as index.html (js/node_load.js). Also checks v6 compatibility against legacy/v6/index_v6.html.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const load = require('./js/node_load.js');
let SA = load(), P = SA.params;
console.log('environments: ' + SA.envList().map(e => e.id).join(', ') + ' | plans: ' + Object.keys(SA.PLANS).join(', '));
// 1. every environment: grow its default plan, run an episode, 2 generations, session + brain round trips
// deepURSx3 envs (seqchoice, chunk) grow a 1600+ neuron brain; use pop=1 + granN=0 to keep the loop under 2 min.
// seq and bandit use pop=2 with a small episode cap. All other envs keep the original pop=6 settings.
for (const env of SA.envList()) {
  SA = load(); P = SA.params; const E = SA.setEnv(env.id);
  const quick = { bug: { episodeTicks: 300 }, cue: { nTrials: 4 }, recall: { nTrials: 4 }, text: { nChars: 60 },
                  seq: { nSyms: 20 }, seqchoice: { nSyms: 20 }, chunk: { nSyms: 20 }, bandit: { nTrials: 8 } }[env.id] || {};
  SA.setEnv(env.id, quick);
  const deepEnv = SA.planFor('env').id === 'deepURSx3';
  if (deepEnv) P.granN = 0;
  const popSize = deepEnv ? 1 : ['seq', 'bandit'].includes(env.id) ? 2 : 6;
  const valArenas = deepEnv ? 1 : 2, valGrowths = deepEnv ? 1 : 2, growths = deepEnv ? 1 : 2;
  const d = SA.planFor('env').make(), b = SA.phenotype(d, SA.currentEnv().spec);
  assert.strictEqual(b.nIn, SA.currentEnv().spec.inputs.length); assert.strictEqual(b.nOut, SA.currentEnv().spec.outputs.length);
  const a = SA.runEpisode(d, 5, null, SA.currentEnv(), 20000); assert.ok(a.done, env.id + ' episode did not end');
  Object.assign(P, { popSize, valArenas, valGrowths, growths, episodes: 1 });
  const e = new SA.Evolution(1); e.runGeneration(); e.runGeneration();
  const s = JSON.stringify(e.toJSON()); const SB = load(); const e2 = SB.Evolution.fromJSON(s, true);
  assert.strictEqual(SB.params.env, env.id); assert.strictEqual(e2.pop.length, popSize); assert.deepStrictEqual(Object.assign({}, SB.envParams[env.id]), Object.assign({}, SA.envParams[env.id]));
  const j = SA.genomeToJSON(e.champion.genome, { label: 'test' }, SA.currentEnv()); const r = SB.brainFromFile(JSON.stringify(j));
  assert.strictEqual(r.env, env.id); assert.strictEqual(SA.countSynapses(SB.phenotype(r.genome, SB.setEnv(r.env, r.envParams).spec)), SA.countSynapses(SA.phenotype(e.champion.genome, SA.currentEnv().spec)));
  const gj = SA.genomeFromJSON(j); assert.strictEqual(SA.countSynapses(gj), SA.countSynapses(SA.phenotype(e.champion.genome, SA.currentEnv().spec)));   // generic neurons+edges loader
  const st = a.task.stats ? a.task.stats() : {};
  console.log(`${env.id.padEnd(9)} plan ${SA.planFor('env').id}: ${b.nIn} in / ${b.nHid} hidden / ${b.nOut} out, ${SA.countSynapses(b)} synapses; episode ${a.t} ticks score ${a.task.score().toFixed(2)} ` +
    `${JSON.stringify(st)}; 2 generations pop=${popSize}, champion ${e.champion.val.toFixed(2)}; session + brain round trips ok`);
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
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v42.make(), O = S.PLANS.deepURSx3v40.make(); assert.ok(D.gran && D.gran.N === 2000 && !O.gran && S.params.granTgt === 1 && /^v4[1-9]$/.test(S.APP_VERSION) && S.DEFAULTS_VERSION >= 34, 'v41 (R84): the 2000-cell granule layer (kept as deepURSx3v42); deepURSx3v40 kept'); console.log('v41 deepURSx3 granule layer: ok'); }
{ const S = require('./js/node_load.js')(); assert.ok(/^v4[2-9]$/.test(S.APP_VERSION) && S.DEFAULTS_VERSION >= 35 && S.params.granRef === 600, 'v42 (R89): granRef 600 by default (v41 = P.granRef=100)'); console.log('v42 granRef 600: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v43.make(), O = S.PLANS.deepURSx3v42.make(); assert.ok(/^v4[3-9]$/.test(S.APP_VERSION) && S.DEFAULTS_VERSION >= 36 && D.gran.N === 4000 && D.gran.K === 3 && O.gran.N === 2000 && JSON.stringify(D.regions) === JSON.stringify(O.regions) && !(S.params.granAnneal > 0), 'v43 (R91): deepURSx3 grows a 4000-cell granule layer (v42 = deepURSx3v42); granAnneal off'); console.log('v43 granule layer 4000: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v44.make(), O = S.PLANS.deepURSx3v43.make(); assert.ok(/^v4[4-9]$/.test(S.APP_VERSION) && S.DEFAULTS_VERSION >= 37 && D.gran.N === 8000 && D.gran.K === 4 && D.gran.Kmin === 3 && JSON.stringify(D.regions) === JSON.stringify(O.regions) && S.params.granK == null && S.params.granKmin == null, 'v44 (R94): deepURSx3 grows an 8000-cell granule layer with mixed 3/4-letter claws (v43 = deepURSx3v43)'); console.log('v44 granule layer 8000 Kmix34: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v45.make(), O = S.PLANS.deepURSx3v44.make(); assert.ok(/^v4[5-9]$/.test(S.APP_VERSION) && S.DEFAULTS_VERSION >= 38 && D.gran.N === 16000 && D.gran.K === 4 && D.gran.Kmin === 3 && JSON.stringify(D.regions) === JSON.stringify(O.regions), 'v45 (R103): deepURSx3 grows a 16000-cell granule layer (v44 = deepURSx3v44)'); console.log('v45 granule layer 16000: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v46.make(), O = S.PLANS.deepURSx3v45.make(); assert.ok(/^v4[6-9]$/.test(S.APP_VERSION) && S.DEFAULTS_VERSION >= 39 && !(D.gran.lrT > 0) && D.gran.N === 32000 && O.gran.N === 16000 && D.gran.K === 4 && D.gran.Kmin === 3 && JSON.stringify(D.regions) === JSON.stringify(O.regions), 'v46 (R106): deepURSx3 grows a 32000-cell granule layer (v45 = deepURSx3v45)'); console.log('v46 granule layer 32000: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3.make(), O = S.PLANS.deepURSx3v46.make(); assert.ok(S.APP_VERSION === 'v47' && S.DEFAULTS_VERSION === 40 && D.gran.N === 32000 && D.gran.lrT === 100000 && D.gran.lrLate === 0.05 && S.params.granLrT == null && JSON.stringify(D.regions) === JSON.stringify(O.regions) && JSON.stringify(Object.assign({}, D.gran, { lrT: undefined, lrLate: undefined })) === JSON.stringify(O.gran), 'v47 (R114): deepURSx3 = v46 + granule step schedule 0.1 -> 0.05 at 100000 events (v46 = deepURSx3v46)'); console.log('v47 granule step schedule: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v39.make(), O = S.PLANS.deepURSx3v37.make();
  assert.ok(D.regions.length === O.regions.length && D.regions.every((R, i) => JSON.stringify(Object.assign({}, R.g.pl, { lr: 0 })) === JSON.stringify(Object.assign({}, O.regions[i].g.pl, { lr: 0 }))
    && R.g.pl.lr === (R.name === 'cortex' ? 0.2 : O.regions[i].g.pl.lr)) && O.regions[0].name === 'cortex' && O.regions[0].g.pl.lr === 0.1
    && S.DEFAULTS_VERSION >= 32, 'v39 (R70, kept as deepURSx3v39): v37 plan with cortex lr 0.2 (other regions unchanged)');
  console.log('v39 deepURSx3v39 = v37 + cortex lr 0.2: ok'); }
{ const S = require('./js/node_load.js')(), D = S.PLANS.deepURSx3v40.make(), O = S.PLANS.deepURSx3v39.make();
  assert.ok(D.regions.length === O.regions.length && D.regions.every((R, i) => JSON.stringify(Object.assign({}, R.g.pl, { preNorm: 0 })) === JSON.stringify(Object.assign({}, O.regions[i].g.pl, { preNorm: 0 }))
    && R.g.pl.preNorm === (R.name === 'cortex' ? 55 : O.regions[i].g.pl.preNorm) && JSON.stringify(R.g.sc) === JSON.stringify(O.regions[i].g.sc)) && O.regions[0].name === 'cortex' && O.regions[0].g.pl.preNorm === 45
    && S.DEFAULTS_VERSION >= 33, 'v40 (R77, kept as deepURSx3v40): v39 plan with cortex preNorm 55 (other regions unchanged)');
  console.log('v40 deepURSx3 = v39 + cortex preNorm 55: ok'); }
{ const S = require('./js/node_load.js')(), E = S.setEnv('seq', S.recommendedEnvParams('seq', { source: 'order3', K: 8 }, ['source'])), D = S.PLANS.deepURSx3.make(), D1 = JSON.parse(JSON.stringify(D));
  D1.regions.forEach(R => Object.assign(R.g.sc, { sizeF: 1, sizeNorm: 1, divReach: 1, divRep: 1 }));   // R71 size-scaling genes at their neutral values
  const h = b => { let s = 0, n = 0; for (const k of Object.keys(b)) { if (b.sp && (k === 'W' || k === 'P' || k === 'C')) continue; const v = b[k]; if (ArrayBuffer.isView(v)) for (let i = 0; i < v.length; i++) { s = (s * 31 + (v[i] * 1000 | 0)) | 0; n++; } } if (b.sp) for (const v of [b.sp.pre, b.sp.post, b.sp.w, b.sp.p, b.sp.c]) for (let i = 0; i < v.length; i++) { s = (s * 31 + (v[i] * 1000 | 0)) | 0; n++; } return s + ':' + n + ':' + b.N; };
  assert.ok(D.regions.every(R => !(R.g.sc.sizeF > 1) && !(R.g.sc.sizeNorm > 1) && !(R.g.sc.divReach > 1) && !(R.g.sc.divRep > 1)) && !(S.params.fanRef > 0) && !(S.params.fanRefR > 0) && h(S.growCell(D, { seed: 5, spec: E.spec })) === h(S.growCell(D1, { seed: 5, spec: E.spec })), 'R71 size genes (sizeF, sizeNorm, divReach, divRep, fanRef, fanRefR) off by default and neutral when 1');
  console.log('R71 size-scaling genes off by default, neutral values bit-identical: ok'); }
{ const S = require('./js/node_load.js')(); assert.ok(!(S.params.postCap > 0) && !(S.params.postCapRel > 0) && !(S.params.allMax > 0) && !(S.params.postN > 0) && !(S.params.trophic > 0), 'R72 / R73 genes (postCap, postCapRel, postN, allMax, trophic) off by default');
  console.log('R72 postsynaptic cap / convergence limit off by default: ok'); }
// R102: demand-grown granule claws (off by default). Repeated letter windows take claws; the pool cannot exceed granN.
{ const S = require('./js/node_load.js')();
  assert.ok(/^v4[4-9]$/.test(S.APP_VERSION) && S.DEFAULTS_VERSION >= 37 && !(S.params.granDemand > 0) && S.params.granCo === 2, 'R102 granDemand off; v44 / DEFAULTS_VERSION unchanged');
  const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'text' }, ['source']), { nSyms: 160 });
  const E = S.setEnv('seq', envP), plan = () => S.PLANS.deepURSx3.make();
  assert.ok(plan().gran.N === 32000 && plan().gran.K === 4 && plan().gran.Kmin === 3, 'demand mode does not change the v46/v47 granule gene');
  const clawIn = b => { const sp = b.sp, g = b.gran; let n = 0; for (let k = 0; k < sp.pre.length; k++) if (g[sp.post[k]] && !g[sp.pre[k]]) n++; return n; };
  S.params.granN = 48;
  const b0 = S.growCell(plan(), { seed: 5, spec: E.spec }), b1 = S.growCell(plan(), { seed: 5, spec: E.spec });
  assert.ok(!b0.granDemand && b0.granStats.demand === 0 && clawIn(b0) > 0 && clawIn(b0) === clawIn(b1) && b0.sp.w.length === b1.sp.w.length, 'granDemand off: random claws, repeatable, no demand table');
  S.params.granDemand = 0; const bZ = S.growCell(plan(), { seed: 5, spec: E.spec });
  assert.ok(bZ.sp.w.length === b0.sp.w.length && bZ.sp.w.every((w, i) => w === b0.sp.w[i]), 'P.granDemand=0 matches the unset default (bit-identical claws)');
  S.params.granDemand = 1; S.params.granN = 12; S.params.granMap = 64; S.params.granHold = 4;
  const D = plan(), bD = S.growCell(D, { seed: 5, spec: E.spec });
  assert.ok(bD.granDemand && bD.granStats.demand === 1 && bD.granStats.cells === 12 && clawIn(bD) === 0 && !Object.keys(bD).includes('granDemand'), 'granDemand on: cap granN, no random claws, table not enumerable');
  const desc = Object.getOwnPropertyDescriptor(bD, 'W'); assert.ok(desc && desc.get && bD.sp && bD.sp.pre, 'demand growth keeps the sparse synapse list (no dense N x N read)');
  const a = S.runEpisode(D, 7, bD, E);
  const st = a.net.granDemandStats(), use = a.net.gd.use.reduce((s, v) => s + v, 0);
  assert.ok(st && st.assigned > 0 && st.assigned <= 12 && st.pending <= 64 && use > 0, 'repeated windows birth claws inside the cap and those granules fire: ' + JSON.stringify(st) + ' use ' + use);
  S.params.granN = 3; S.params.granHold = 2; S.params.granMap = 48;
  const bR = S.growCell(plan(), { seed: 9, spec: E.spec }), aR = S.runEpisode(plan(), 9, bR, E), stR = aR.net.granDemandStats();
  assert.ok(stR.assigned <= 3 && stR.recycled > 0 && stR.pending <= 48, 'full pool recycles the least-used granule and the pattern table stays capped: ' + JSON.stringify(stR));
  console.log(`R102 granDemand (off by default): born ${st.assigned}/${st.cap} (fired ${use}), recycle ${stR.recycled} at cap ${stR.cap}: ok`); }
// 1. I106 Bit-identical sparse granule forward & lazy threshold homeostasis (granFast = 1 vs granFast = 0)
{ const S = require('./js/node_load.js')();
  assert.ok(S.params.granFast === 1 && S.params.granUtility === 0 && S.params.scaleInvariant === 0, 'granFast=1 by default; granUtility and scaleInvariant opt-in (0)');
  const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'text' }, ['source']), { nSyms: 160 });
  const E = S.setEnv('seq', envP); S.params.granN = 512;
  const D = S.PLANS.deepURSx3.make(), bFast = S.growCell(D, { seed: 5, spec: E.spec }), bSlow = S.growCell(D, { seed: 5, spec: E.spec });
  S.params.granFast = 1; const aFast = S.runEpisode(D, 7, bFast, E); aFast.net.syncState();
  S.params.granFast = 0; const aSlow = S.runEpisode(D, 7, bSlow, E); aSlow.net.syncState();
  const sameW = aFast.net.ws.length === aSlow.net.ws.length && aFast.net.ws.every((w, i) => w === aSlow.net.ws[i]);
  const sameTh = aFast.net.thr.length === aSlow.net.thr.length && aFast.net.thr.every((t, i) => t === aSlow.net.thr[i]);
  assert.ok(aFast.task.score() === aSlow.task.score() && aFast.net.spikeCount === aSlow.net.spikeCount && sameW && sameTh,
    `I106 granFast=1 is 100% bit-identical to granFast=0 (score ${aFast.task.score()} vs ${aSlow.task.score()}, spikes ${aFast.net.spikeCount} vs ${aSlow.net.spikeCount}, sameW=${sameW}, sameTh=${sameTh})`);
  console.log('I106 bit-identical event-driven granule forward & lazy threshold homeostasis: ok'); }
// 2. Unified scale-invariant developmental & plasticity equations (params.scaleInvariant = 1)
{ const S = require('./js/node_load.js')(); S.params.scaleInvariant = 1; S.params.granN = 128;
  const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'order3', K: 8 }, ['source']), { nSyms: 160 });
  const E = S.setEnv('seq', envP);
  const mkSized = f => { const D = S.PLANS.deepURSx3.make(); D.regions.forEach(R => { R.g.sc.sizeF = f; }); return D; };
  const D1 = mkSized(1), D2 = mkSized(2), D4 = mkSized(4);
  const b1 = S.growCell(D1, { seed: 5, spec: E.spec }), b2 = S.growCell(D2, { seed: 5, spec: E.spec }), b4 = S.growCell(D4, { seed: 5, spec: E.spec });
  const a1 = S.runEpisode(D1, 7, b1, E), a2 = S.runEpisode(D2, 7, b2, E), a4 = S.runEpisode(D4, 7, b4, E);
  const s1 = a1.task.score(), s2 = a2.task.score(), s4 = a4.task.score();
  assert.ok(b2.N > b1.N * 1.4 && b4.N > b2.N * 1.4 && a2.net.lrF8 && a4.net.lrF8 && s1 > 0.15 && s2 > 0.15 && s4 > 0.15,
    `scaleInvariant=1 scales tissue and keeps learning stable across 1x (${b1.N} cells, ${s1.toFixed(3)}), 2x (${b2.N} cells, ${s2.toFixed(3)}), 4x (${b4.N} cells, ${s4.toFixed(3)})`);
  console.log(`scaleInvariant=1 across 1x/2x/4x (N=${b1.N}/${b2.N}/${b4.N}, score=${s1.toFixed(3)}/${s2.toFixed(3)}/${s4.toFixed(3)}): ok`); }
// 2b. R123 relative (share-based) growth for scaled brains (params.relGrowth = 1, default off)
{ const S = require('./js/node_load.js')(); S.params.granN = 128;
  assert.ok(S.params.relGrowth === 0, 'relGrowth opt-in (0 by default)');
  const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'order3', K: 8 }, ['source']), { nSyms: 160 });
  const E = S.setEnv('seq', envP);
  const mkSized = f => { const D = S.PLANS.deepURSx3.make(); D.regions.forEach(R => { R.g.sc.sizeF = f; }); return D; };
  const run = (f, rg) => { S.params.relGrowth = rg; const D = mkSized(f), b = S.growCell(D, { seed: 5, spec: E.spec }), a = S.runEpisode(D, 7, b, E); a.net.syncState(); S.params.relGrowth = 0; return { b, a, s: a.task.score() }; };
  const o1 = run(1, 0), r1 = run(1, 1);
  const same = o1.s === r1.s && o1.a.net.spikeCount === r1.a.net.spikeCount && o1.a.net.ws.length === r1.a.net.ws.length && o1.a.net.ws.every((w, i) => w === r1.a.net.ws[i]);
  assert.ok(same, `relGrowth=1 is bit-identical at 1x (score ${o1.s} vs ${r1.s})`);
  const r12 = run(1.2, 1), silent = r12.b.regions.reduce((t, R) => t + ((R.devStats && R.devStats.silentIn) | 0), 0);
  assert.ok(r12.s > 0.5 && silent === 0, `relGrowth=1 wires every input at an awkward 1.2x size (score ${r12.s.toFixed(3)}, silent inputs ${silent})`);
  console.log(`R123 relGrowth: bit-identical at 1x, 1.2x score ${r12.s.toFixed(3)} with 0 silent inputs: ok`); }
// 2c. R126 size-independent afferent budget (params.fanInBudget = 1, default off): 1x untouched; at 2x in-region fan-in stays at the 1x level
{ const S = require('./js/node_load.js')(); S.params.granN = 128;
  assert.ok(S.params.fanInBudget === 0, 'fanInBudget opt-in (0 by default)');
  const E = S.setEnv('seq', Object.assign({}, S.recommendedEnvParams('seq', { source: 'order3', K: 8 }, ['source']), { nSyms: 160 }));
  const grow = (f, fb) => { S.params.relGrowth = 1; S.params.fanInBudget = fb; const D = S.PLANS.deepURSx3.make(); D.regions.forEach(R => { R.g.sc.sizeF = f; }); const b = S.growCell(D, { seed: 5, spec: E.spec }); S.params.relGrowth = 0; S.params.fanInBudget = 0; return b; };
  const ctxFan = b => { const sp = b.sp, n = new Float64Array(b.N), h1 = b.nIn + b.nHid; let s = 0, c = 0; for (let k = 0; k < sp.pre.length; k++) { const a = sp.pre[k], q = sp.post[k]; if (q >= b.nIn && q < h1 && !(b.gran && (b.gran[q] || b.gran[a])) && (a < b.nIn || b.region[a] === b.region[q])) n[q]++; }
    for (let q = b.nIn; q < h1; q++) if (!(b.gran && b.gran[q]) && b.regions[b.region[q]].name === 'context') { s += n[q]; c++; } return s / c; };
  const a0 = grow(1, 0), a1 = grow(1, 1);
  assert.ok(a0.sp.pre.length === a1.sp.pre.length && a0.sp.w.every((w, i) => w === a1.sp.w[i] && a0.sp.pre[i] === a1.sp.pre[i]), 'fanInBudget is a no-op at 1x');
  const f1 = ctxFan(a0), f2 = ctxFan(grow(2, 0)), f2b = ctxFan(grow(2, 1));
  assert.ok(f2 > 1.4 * f1 && Math.abs(f2b - f1) < 0.15 * f1, `fanInBudget keeps context in-region fan-in at 1x (${f1.toFixed(1)}; 2x ${f2.toFixed(1)} -> ${f2b.toFixed(1)})`);
  console.log(`R126 fanInBudget: no-op at 1x, context in-region fan-in 1x ${f1.toFixed(1)}, 2x ${f2.toFixed(1)} -> ${f2b.toFixed(1)}: ok`); }
// 2d. R127 per-pathway afferent budget (params.pathBudget = 1, default off): 1x untouched; at 2x each (post type, presyn type, sign) pathway keeps ~its 1x mean in-degree
{ const S = require('./js/node_load.js')(); S.params.granN = 128;
  assert.ok(S.params.pathBudget === 0, 'pathBudget opt-in (0 by default)');
  const E = S.setEnv('seq', Object.assign({}, S.recommendedEnvParams('seq', { source: 'order3', K: 8 }, ['source']), { nSyms: 160 }));
  const grow = (f, pb) => { S.params.relGrowth = 1; S.params.pathBudget = pb; const D = S.PLANS.deepURSx3.make(); D.regions.forEach(R => { R.g.sc.sizeF = f; }); const b = S.growCell(D, { seed: 5, spec: E.spec }); S.params.relGrowth = 0; S.params.pathBudget = 0; return b; };
  const paths = b => { const sp = b.sp, h1 = b.nIn + b.nHid, ct = b.cellType, n = new Map(), nc = new Map();   // mean in-region hidden in-degree per (region, post type, pre type, sign)
    for (let q = b.nIn; q < h1; q++) if (!(b.gran && b.gran[q])) { const k = b.region[q] + ':' + ct[q]; nc.set(k, (nc.get(k) || 0) + 1); }
    for (let k = 0; k < sp.pre.length; k++) { const a = sp.pre[k], q = sp.post[k]; if (a < b.nIn || q >= h1 || q < b.nIn || (b.gran && (b.gran[q] || b.gran[a])) || b.region[a] !== b.region[q]) continue;
      const key = b.region[q] + ':' + ct[q] + '|' + ct[a] + (sp.w[k] < 0 ? '-' : '+'); n.set(key, (n.get(key) || 0) + 1); }
    const o = new Map(); for (const [k, v] of n) o.set(k, v / nc.get(k.split('|')[0])); return o; };
  const a0 = grow(1, 0), a1 = grow(1, 1);
  assert.ok(a0.sp.pre.length === a1.sp.pre.length && a0.sp.w.every((w, i) => w === a1.sp.w[i] && a0.sp.pre[i] === a1.sp.pre[i]), 'pathBudget is a no-op at 1x');
  const p1 = paths(a0), p2 = paths(grow(2, 0)), p2b = paths(grow(2, 1)); let big = 0, wr = 0, wb = 0, m = 0;
  for (const [k, v] of p1) if (v >= 2) { big++; const r = p2.get(k) || 0, x = p2b.get(k) || 0; wr = Math.max(wr, r / v); wb = Math.max(wb, x / v); m++; }
  assert.ok(m > 5 && wr > 1.4 && wb < 1.5, `pathBudget keeps every 1x pathway (>= 2 inputs) within 1.5x of 1x (max ratio off ${wr.toFixed(2)}, on ${wb.toFixed(2)}, ${m} pathways)`);
  console.log(`R127 pathBudget: no-op at 1x, ${m} pathways, max in-degree ratio 2x/1x off ${wr.toFixed(2)} -> on ${wb.toFixed(2)}: ok`); }
// 2e. R128 fateSnap (negative) and colInh (dedicated reset interneurons for columns that grew none): off by default, no-ops at 1x; at 2x colInh=3 leaves no column without inhibition
{ const S = require('./js/node_load.js')(); S.params.granN = 128;
  assert.ok(S.params.fateSnap === 0 && S.params.colInh === 0, 'fateSnap / colInh opt-in (0 by default)');
  const E = S.setEnv('seq', Object.assign({}, S.recommendedEnvParams('seq', { source: 'order3', K: 8 }, ['source']), { nSyms: 160 }));
  const grow = (f, ex) => { Object.assign(S.params, { relGrowth: 1, pathBudget: 1 }, ex); const D = S.PLANS.deepURSx3.make(); D.regions.forEach(R => { R.g.sc.sizeF = f; }); const b = S.growCell(D, { seed: 5, spec: E.spec }); Object.assign(S.params, { relGrowth: 0, pathBudget: 0, fateSnap: 0, colInh: 0, rgDiv: 0 }); return b; };
  const same = (x, y) => x.sp.pre.length === y.sp.pre.length && x.sp.w.every((w, i) => w === y.sp.w[i] && x.sp.pre[i] === y.sp.pre[i]);
  assert.ok(same(grow(1, {}), grow(1, { fateSnap: 1, colInh: 3 })), 'fateSnap / colInh are no-ops at 1x');
  const orphans = b => { const h1 = b.nIn + b.nHid, nI = new Map(), cols = new Set(); for (let q = b.nIn; q < h1; q++) { const t = b.topo ? b.topo[q] : NaN; if (t === t && !(b.gran && b.gran[q]) && b.cellType[q] === 18) cols.add(b.region[q] + ':' + b.cellType[q] + ':' + Math.round(t * 1e4)); }
    for (let k = 0; k < b.sp.pre.length; k++) { const q = b.sp.post[k], a = b.sp.pre[k], t = b.topo ? b.topo[q] : NaN; if (t === t && b.cellType[q] === 18 && b.sp.w[k] < 0 && a >= b.nIn && b.region[a] === b.region[q]) { const key = b.region[q] + ':' + b.cellType[q] + ':' + Math.round(t * 1e4); nI.set(key, (nI.get(key) || 0) + 1); } }
    let o = 0; for (const c of cols) if (!nI.get(c)) o++; return { o, n: cols.size }; };
  const o0 = orphans(grow(2, {})), o3 = orphans(grow(2, { colInh: 3 }));
  assert.ok(o3.o === 0 && o0.n >= 10, `colInh=3 leaves no column without inhibition at 2x (off ${o0.o}/${o0.n}, on ${o3.o}/${o3.n})`);
  console.log(`R128 fateSnap/colInh: no-ops at 1x; columns without inhibition at 2x off ${o0.o}/${o0.n} -> colInh=3 ${o3.o}/${o3.n}: ok`);
  assert.ok(S.params.rgDiv === 0 && same(grow(1, {}), grow(1, { rgDiv: 2 })), 'rgDiv opt-in and a no-op at 1x');
  const oR = orphans(grow(2, { rgDiv: 1 }));
  assert.ok(oR.o === 0, `rgDiv=1 grows no column without inhibition at 2x (${oR.o}/${oR.n})`);
  console.log(`R129 rgDiv: no-op at 1x; columns without inhibition at 2x ${oR.o}/${oR.n}: ok`); }
// 3. Utility-pruned structural plasticity for granule claws (params.granUtility = 1)
{ const S = require('./js/node_load.js')(); S.params.granUtility = 1; S.params.granN = 32; S.params.granHold = 4; S.params.granCo = 1;
  const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'text' }, ['source']), { nSyms: 240 });
  const E = S.setEnv('seq', envP), D = S.PLANS.deepURSx3.make();
  const bU = S.growCell(D, { seed: 5, spec: E.spec });
  const clawIn = b => { const sp = b.sp, g = b.gran; let n = 0; for (let k = 0; k < sp.pre.length; k++) if (g[sp.post[k]] && !g[sp.pre[k]]) n++; return n; };
  assert.ok(bU.granSrc && clawIn(bU) > 0 && !Object.keys(bU).includes('granSrc'), 'granUtility starts with grown random claws (no empty-pool starvation) and non-enumerable granSrc');
  const aU = S.runEpisode(D, 7, bU, E), stU = aU.net.granUtilityStats();
  assert.ok(stU && stU.rewired > 0 && stU.events > 50, 'granUtility rewires low-utility mature claws onto active lag tuples: ' + JSON.stringify(stU));
  console.log(`granUtility=1 (grown claws=${clawIn(bU)}, rewired=${stU.rewired}/${stU.cap} over ${stU.events} events): ok`); }
// 4. Two-timescale hierarchical event-gated chunking (deepURSx3_chunk)
{ const S = require('./js/node_load.js')(); S.params.granN = 128;
  const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'text' }, ['source']), { nSyms: 200 });
  const E = S.setEnv('seq', envP), D = S.PLANS.deepURSx3_chunk.make();
  const bC = S.growCell(D, { seed: 5, spec: E.spec });
  assert.ok(bC.regions.some(r => r.name === 'chunk context') && bC.chunkGates && bC.chunkGates.length === 1, 'deepURSx3_chunk grows chunk context region and chunkGates tract');
  const aC = S.runEpisode(D, 7, bC, E), sC = aC.task.score();
  assert.ok(aC.net.cg && aC.net.cg.shifts > 0 && aC.net.cg.shifts < aC.net.tickNo && sC > 0.15,
    `deepURSx3_chunk gates chunk shifts selectively (${aC.net.cg.shifts} shifts in ${aC.net.tickNo} ticks, score=${sC.toFixed(3)})`);
  console.log(`deepURSx3_chunk two-timescale gating (${aC.net.cg.shifts} shifts, score ${sC.toFixed(3)}): ok`); }
// 5. R118 three-factor readout (params.readoutRule = 'threeFactor'; unset = the R83b NLMS, bit-identical, no extra RNG)
{ const run = rr => { const S = require('./js/node_load.js')(); S.params.granN = 128; if (rr !== undefined) S.params.readoutRule = rr;
    const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'order3', K: 8 }, ['source']), { nSyms: 240 });
    const E = S.setEnv('seq', envP), D = S.PLANS.deepURSx3.make(), b = S.growCell(D, { seed: 5, spec: E.spec }), a = S.runEpisode(D, 7, b, E);
    return { s: a.task.score(), spk: a.net.spikeCount, w: Array.from(a.net.ws), K: a.task.K }; };
  const u = run(), z = run(0), f = run('threeFactor');
  assert.ok(u.s === z.s && u.spk === z.spk && u.w.length === z.w.length && u.w.every((x, i) => x === z.w[i]), 'readoutRule=0 is bit-identical to unset');
  assert.ok(f.w.some((x, i) => x !== u.w[i]) && f.s > 1 / f.K + 0.3, `readoutRule=threeFactor changes the readout weights and learns (score ${f.s.toFixed(3)}, chance ${(1 / f.K).toFixed(3)})`);
  console.log(`R118 readoutRule: off bit-identical (score ${u.s.toFixed(3)}, ${u.spk} spikes), threeFactor learns (score ${f.s.toFixed(3)}): ok`); }
// 6. R119 exact-coincidence granules (params.granExact = 1 with granUtility = 2; off = bit-identical, no RNG)
{ const run = ex => { const S = require('./js/node_load.js')(); S.params.granN = 256; if (ex) Object.assign(S.params, ex);
    const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'text' }, ['source']), { nSyms: 240 });
    const E = S.setEnv('seq', envP), D = S.PLANS.deepURSx3.make(), b = S.growCell(D, { seed: 5, spec: E.spec }), a = S.runEpisode(D, 7, b, E);
    return { s: a.task.score(), spk: a.net.spikeCount, w: Array.from(a.net.ws), st: a.net.granUtilityStats(), K: a.task.K }; };
  const u = run(), z = run({ granUtility: 0, granExact: 0, granReserve: 0 }), x = run({ granUtility: 2, granExact: 1, granCo: 1 });
  assert.ok(u.s === z.s && u.spk === z.spk && u.w.every((v, i) => v === z.w[i]), 'granUtility/granExact/granReserve 0 are bit-identical to unset');
  assert.ok(x.st && x.st.exact > 0 && x.st.rewired > 0 && x.s > 1 / x.K, `granExact: exact detectors fire and are recycled (${JSON.stringify(x.st)}, score ${x.s.toFixed(3)})`);
  console.log(`R119 granExact: off bit-identical (score ${u.s.toFixed(3)}), on: ${x.st.exact} exact spikes, ${x.st.rewired} recruits, score ${x.s.toFixed(3)}: ok`); }
// 7. R120 saturation guard (granExactGuard bit 1 = dedup grown duplicate tuples, bit 2 = self-calibrating lag-column guard) and denseCeil
{ const run = ex => { const S = require('./js/node_load.js')(); S.params.granN = 256; if (ex) Object.assign(S.params, ex);
    const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'text' }, ['source']), { nSyms: 240 });
    const E = S.setEnv('seq', envP), D = S.PLANS.deepURSx3.make(), b = S.growCell(D, { seed: 5, spec: E.spec }), a = S.runEpisode(D, 7, b, E);
    return { s: a.task.score(), spk: a.net.spikeCount, w: Array.from(a.net.ws), st: a.net.granUtilityStats(), K: a.task.K, dc: a.net.denseStats ? a.net.denseStats() : null }; };
  const same = (u, z) => u.s === z.s && u.spk === z.spk && u.w.every((v, i) => v === z.w[i]);
  const u = run(), z = run({ granExactGuard: 0, denseCeil: 0 }), X = { granUtility: 2, granExact: 1, granCo: 1 }, x = run(X), x2 = run(Object.assign({ granExactGuard: 2 }, X)), x3 = run(Object.assign({ granExactGuard: 3 }, X)), d = run({ denseCeil: 0.1, denseK: 12 });
  assert.ok(same(u, z), 'granExactGuard / denseCeil 0 are bit-identical to unset');
  assert.ok(same(x, x2), 'granExactGuard 2 (column guard) does not trigger on a healthy short run: identical to granExact');
  assert.ok((x3.st.dedup || 0) >= 0 && x3.st.exact > 0 && x3.s > 1 / x3.K, `granExactGuard 3: runs, exact detectors fire (${x3.st.exact}, dedup ${x3.st.dedup || 0}, score ${x3.s.toFixed(3)})`);
  assert.ok(d.dc && d.dc.cells > 0 && d.s > 0, 'denseCeil: list built, runs');
  console.log(`R120 granExactGuard: off bit-identical, guard-only = granExact (no trigger), guard 3 score ${x3.s.toFixed(3)} (dedup ${x3.st.dedup || 0}); denseCeil on: ${d.dc.cells} cells, ${d.dc.raised} raised, score ${d.s.toFixed(3)}: ok`); }
// 8. R121 granKal (experience-weighted NLMS readout; off = bit-identical, no RNG)
{ const run = ex => { const S = require('./js/node_load.js')(); S.params.granN = 256; Object.assign(S.params, { granUtility: 2, granExact: 1, granCo: 1 }, ex || {});
    const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'text' }, ['source']), { nSyms: 240 });
    const E = S.setEnv('seq', envP), D = S.PLANS.deepURSx3.make(), b = S.growCell(D, { seed: 5, spec: E.spec }), a = S.runEpisode(D, 7, b, E);
    return { s: a.task.score(), spk: a.net.spikeCount, w: Array.from(a.net.ws), K: a.task.K, kn: a.net.gKn, ck: a.net.gu && a.net.gu.st ? a.net.gu.st.chunkRec : 0, gK: b.granStats ? b.granStats.K : a.net.g.granStats && a.net.g.granStats.K, gt: a.net.gu && a.net.gu.st ? a.net.gu.st.chunkGated : 0, nG: a.net.gu ? a.net.gu.nG : 0, st: a.net.gu ? a.net.gu.st : {}, nAct: a.net.gu ? a.net.gu.nAct : 0, kb: a.net.gu ? a.net.gu.keyBy : null, l2: a.net.gu ? a.net.gu.l2 : null }; };
  const u = run(), z = run({ granKal: 0 }), x = run({ granKal: 1 });
  assert.ok(u.s === z.s && u.spk === z.spk && u.w.every((v, i) => v === z.w[i]), 'granKal 0 is bit-identical to unset');
  assert.ok(x.kn && x.kn.some(v => v > 0) && x.s > 1 / x.K, `granKal 1: experience counts kept, score ${x.s.toFixed(3)} above chance`);
  console.log(`R121 granKal: off bit-identical (score ${u.s.toFixed(3)}), on: score ${x.s.toFixed(3)}: ok`);
  const zo = run({ granOneShot: 0 }), o = run({ granKal: 1, granOneShot: 0.05 });
  assert.ok(u.s === zo.s && u.spk === zo.spk && u.w.every((v, i) => v === zo.w[i]), 'granOneShot 0 is bit-identical to unset');
  assert.ok(o.s > 1 / o.K && o.w.some((v, i) => v !== x.w[i]), `granOneShot 0.05: recruit weights differ from granKal alone, score ${o.s.toFixed(3)} above chance`);
  console.log(`R121 granOneShot: off bit-identical, 0.05+kal score ${o.s.toFixed(3)}: ok`);
  const zf = run({ granFatigue: 0 }); assert.ok(u.s === zf.s && u.spk === zf.spk && u.w.every((v, i) => v === zf.w[i]), 'granFatigue 0 is bit-identical to unset'); console.log('R122 granFatigue: off bit-identical: ok');
  const zl = run({ lagHomeo: 0 }), lw = run({ lagHomeo: 0.02 }); assert.ok(u.s === zl.s && u.spk === zl.spk && u.w.every((v, i) => v === zl.w[i]), 'lagHomeo 0 is bit-identical to unset'); assert.ok(lw.s > 1 / lw.K, 'lagHomeo 0.02 runs (score above chance)'); console.log(`R124 lagHomeo (negative, kept off): off bit-identical, on score ${lw.s.toFixed(3)}: ok`);
  const zw = run({ lagWTA: 0 }), xw = run({ lagWTA: 1 }); assert.ok(u.s === zw.s && u.spk === zw.spk && u.w.every((v, i) => v === zw.w[i]), 'lagWTA 0 is bit-identical to unset');
  assert.ok(xw.s > 1 / xw.K, `lagWTA 1 learns (score ${xw.s.toFixed(3)} above chance)`); console.log(`R125 lagWTA: off bit-identical, on score ${xw.s.toFixed(3)}: ok`);
  const zn = run({ granKal: 1, granNeg: 0 }), xn = run({ granKal: 1, granNeg: 1 }); assert.ok(x.s === zn.s && x.spk === zn.spk && x.w.every((v, i) => v === zn.w[i]), 'granNeg 0 is bit-identical to unset (granKal on)');
  assert.ok(xn.s > 1 / xn.K && xn.w.some(v => v < 0), `granNeg 1: signed readout weights appear, learns (score ${xn.s.toFixed(3)})`); console.log(`R132 granNeg: off bit-identical, on: ${xn.w.filter(v => v < 0).length} negative weights, score ${xn.s.toFixed(3)}: ok`);
  const zk = run({ granKal: 1, granKalLTD: 0 }), xk = run({ granKal: 1, granKalLTD: 1, granOneShot: 1 }); assert.ok(x.s === zk.s && x.spk === zk.spk && x.w.every((v, i) => v === zk.w[i]), 'granKalLTD 0 is bit-identical to unset (granKal on)');
  assert.ok(xk.s > 1 / xk.K && xk.w.some((v, i) => v !== x.w[i]), `granKalLTD 1 (+granOneShot 1) changes the readout, learns (score ${xk.s.toFixed(3)})`); console.log(`R132 granKalLTD: off bit-identical, on (+oneShot 1) score ${xk.s.toFixed(3)}: ok`);
  const zf2 = run({ granKal: 1, granTrace: 0 }), xf = run({ granKal: 1, granTrace: 1 }); assert.ok(x.s === zf2.s && x.spk === zf2.spk && x.w.every((v, i) => v === zf2.w[i]), 'granTrace 0 is bit-identical to unset (granKal on)');
  assert.ok(xf.s > 1 / xf.K && xf.w.some((v, i) => v !== x.w[i]), `granTrace 1 changes the readout, learns (score ${xf.s.toFixed(3)})`); console.log(`R133 granTrace: off bit-identical, on score ${xf.s.toFixed(3)}: ok`);
  { const GS = { granKal: 1, granTrace: 1, granOneShot: 0.03 }, same = (p, q) => p.s === q.s && p.spk === q.spk && p.w.every((v, i) => v === q.w[i]), b0 = run(GS), z0 = run(Object.assign({ wSlow: 0, wSlowPull: 0, wSlowRead: 0 }, GS)), id1 = run(Object.assign({ wSlow: 1, wSlowPull: 0.5, wSlowRead: 0.5 }, GS)), zp = run(Object.assign({ wSlowPull: 0.5, wSlowRead: 1 }, GS));
    const cp = run(Object.assign({ wSlow: 0.05, wSlowPull: 0.1 }, GS)), rd = run(Object.assign({ wSlow: 0.05, wSlowRead: 1 }, GS));
    assert.ok(same(b0, z0) && same(b0, zp), 'R145 wSlow 0 (with or without wSlowPull / wSlowRead) is bit-identical to unset');
    assert.ok(same(b0, id1), 'R145 wSlow 1 (slow weight = learned weight at every visit) is bit-identical to off');
    assert.ok(!same(b0, cp) && cp.s > 1 / cp.K && !same(b0, rd) && rd.s > 1 / rd.K && !same(cp, rd), `R145 wSlow 0.05 + pull 0.1 / + read 1 change the readout and learn (${cp.s.toFixed(3)} / ${rd.s.toFixed(3)})`);
    console.log(`R145 wSlow (B2): off bit-identical, wSlow 1 = off, pull 0.1 score ${cp.s.toFixed(3)}, read-slow score ${rd.s.toFixed(3)} (off ${b0.s.toFixed(3)}): ok`); }
  const zc = run({ granKal: 1, granChunk: 0 }), xc = run({ granKal: 1, granChunk: 1 }); assert.ok(x.s === zc.s && x.spk === zc.spk && x.w.every((v, i) => v === zc.w[i]), 'granChunk 0 is bit-identical to unset (granKal on)');
  assert.ok(xc.s > 1 / xc.K && (xc.ck || 0) > 0 && xc.w.some((v, i) => v !== x.w[i]), `granChunk 1 recruits chunk detectors and learns (score ${xc.s.toFixed(3)})`); console.log(`R134 granChunk: off bit-identical, on: ${xc.ck} chunk recruits, score ${xc.s.toFixed(3)}: ok`);
  const zd = run({ granKal: 1, granDeep: 0 }), xd = run({ granKal: 1, granDeep: 1, granK: 5 }); assert.ok(x.s === zd.s && x.spk === zd.spk && x.w.every((v, i) => v === zd.w[i]), 'granDeep 0 is bit-identical to unset (granKal on)');
  assert.ok(xd.gK === 5 && xd.s > 1 / xd.K, `granDeep 1 + granK 5: 5 claw sources (K ${xd.gK}), learns (score ${xd.s.toFixed(3)})`); console.log(`R134 granDeep: off bit-identical, on K ${xd.gK}, score ${xd.s.toFixed(3)}: ok`);
  const zg = run({ granKal: 1, granChunk: 1, granChunkGate: 0, granScale: 0 }), xg = run({ granKal: 1, granChunk: 1, granChunkGate: 1 }), xs = run({ granKal: 1, granScale: 0.5 }); assert.ok(xc.s === zg.s && xc.spk === zg.spk && xc.w.every((v, i) => v === zg.w[i]), 'granChunkGate / granScale 0 are bit-identical to unset (granChunk on)');
  assert.ok(xg.gt > 0 && xg.ck < xc.ck && xg.s > 1 / xg.K, `granChunkGate 1: first sightings gated (${xg.gt}), fewer recruits (${xg.ck} < ${xc.ck}), learns`); assert.ok(xs.nG === 2 * x.nG, `granScale 0.5 at 1x doubles the pool (${xs.nG})`);
  console.log(`R135 granChunkGate: off bit-identical, on ${xg.gt} gated, ${xg.ck} recruits, score ${xg.s.toFixed(3)}; granScale pool ${x.nG} -> ${xs.nG}: ok`);
  const G2 = { granKal: 1, granChunk: 1, granChunkGate: 2 }, zp = run(Object.assign({ granPhrase: 0, granGrow: 0 }, G2)), x2 = run(G2), xp = run(Object.assign({ granPhrase: 1, granGrow: 3 }, G2)); assert.ok(x2.s === zp.s && x2.spk === zp.spk && x2.w.every((v, i) => v === zp.w[i]), 'granPhrase / granGrow 0 are bit-identical to unset (granChunk + gate 2 on)');
  assert.ok((xp.st.phraseRec || 0) > 0 && xp.nG === 3 * x.nG && xp.nAct >= x.nG && xp.s > 1 / xp.K, `granPhrase 1 + granGrow 3: phrase detectors recruited (${xp.st.phraseRec}), pool born ${x.nG} grown to ${xp.nAct} of ${xp.nG}, learns`);
  console.log(`R136 granPhrase/granGrow: off bit-identical, on ${xp.st.phraseRec} phrase recruits, pool ${x.nG} -> ${xp.nAct} (cap ${xp.nG}), score ${xp.s.toFixed(3)}: ok`);
  const zq = run(Object.assign({ granCat: 0 }, G2)), xq = run(Object.assign({ granCat: 20 }, G2)); assert.ok(x2.s === zq.s && x2.spk === zq.spk && x2.w.every((v, i) => v === zq.w[i]), 'granCat 0 is bit-identical to unset (granChunk + gate 2 on)');
  assert.ok(xq.st.catN > 0 && xq.st.catN <= xq.st.catK && (xq.st.catRec || 0) > 0 && xq.s > 1 / xq.K, `granCat 20: ${xq.st.catN} of ${xq.st.catK} categories, ${xq.st.catRec} category detectors, learns`);
  console.log(`R137 granCat: off bit-identical, on ${xq.st.catN}/${xq.st.catK} categories, ${xq.st.catRec} detectors, score ${xq.s.toFixed(3)}: ok`);
  const zl2 = run(Object.assign({ granL2: 0, granL2N: 0, granEvGrow: 0 }, G2)); assert.ok(x2.s === zl2.s && x2.spk === zl2.spk && x2.w.every((v, i) => v === zl2.w[i]), 'granL2 / granL2N / granEvGrow 0 are bit-identical to unset (granChunk + gate 2 on)');
  const l0 = run(Object.assign({ granL2: 1, granPhrase: 1 }, G2)), l1 = run(Object.assign({ granL2: 1, granL2N: 128, granPhrase: 1 }, G2));
  assert.ok(l0.nG === x.nG && !(l0.st.phraseRec > 0), `granL2 1 at 1x: no level-2 pool, no phrase detectors (${l0.st.phraseRec || 0})`);
  const pIdx = l1.kb.map((k, j) => k != null && k[0] === 'P' ? j : -1).filter(j => j >= 0), cIdx = l1.kb.map((k, j) => k != null && k[0] !== 'P' && k[0] !== 'Q' ? j : -1).filter(j => j >= 0);
  assert.ok(l1.nG === x.nG + 128 && l1.l2 === x.nG && pIdx.length > 0 && pIdx.every(j => j >= l1.l2) && cIdx.every(j => j < l1.l2) && l1.s > 1 / l1.K, `granL2N 128: pool ${l1.nG}, ${pIdx.length} phrase detectors all in [${l1.l2}, ${l1.nG}), level-1 detectors below, learns`);
  const eg = run(Object.assign({ granGrow: 3, granEvGrow: 1 }, G2)); assert.ok((eg.st.evGrown || 0) > 0 && eg.nAct > x.nG && eg.s > 1 / eg.K, `granEvGrow 1 + granGrow 3: ${eg.st.evGrown} eviction growths, pool ${eg.nAct}`);
  console.log(`R138 granL2: off bit-identical, 1x no L2 pool -> no phrases; L2N 128: ${pIdx.length} phrase detectors in the L2 pool, score ${l1.s.toFixed(3)}; granEvGrow: ${eg.st.evGrown} growths, pool ${x.nG} -> ${eg.nAct}: ok`);
  { const zd = run(Object.assign({ lagDepth: 0, lagBlur: 0 }, G2)), z4 = run(Object.assign({ lagDepth: 4, lagBlur: 1 }, G2)); assert.ok([zd, z4].every(z => x2.s === z.s && x2.spk === z.spk && x2.w.every((v, i) => v === z.w[i])), 'lagDepth 0 / 4 and lagBlur are bit-identical to unset (granChunk + gate 2 on)');
    const ld = run(Object.assign({ lagDepth: 16 }, G2)), lc = run(Object.assign({ lagDepth: 16, lagCtx: 3 }, G2)), lg = run(Object.assign({ lagDepth: 16, lagBlur: 1, lagGate: 1 }, G2)), lg2 = run(Object.assign({ lagDepth: 16, lagBlur: 1, lagGate: 2 }, G2)), lpz = run(Object.assign({ lagDepth: 16, lagBlur: 1, lagPrune: 0, lagSurp: 0 }, G2)), lps = run(Object.assign({ lagDepth: 16, lagBlur: 1, lagPrune: 1, lagSurp: 1 }, G2)), lps2 = run(Object.assign({ lagDepth: 16, lagBlur: 1, lagSurp: 2 }, G2)), lpsh = run(Object.assign({ lagDepth: 16, lagBlur: 1, lagSurp: 0.5 }, G2)), z1 = run(Object.assign({ lagDepth: 16, lagCtx: 1 }, G2)), lb = run(Object.assign({ lagDepth: 16, lagBlur: 1 }, G2)), fk = r => r.kb.filter(k => k != null && (k[0] === 'F' || k[0] === 'B')).length;
    assert.ok(ld.st.lagRec > 0 && fk(ld) > 0 && ld.st.lagFired > 0 && ld.s > 1 / ld.K && lb.st.lagRec > 0 && lb.kb.some(k => k != null && k[0] === 'B') && lb.s > 1 / lb.K && z1.s === ld.s && z1.spk === ld.spk && lc.kb.some(k => k != null && k[0] === 'F' && k.split('|')[0].split(',').length === 3) && lc.s > 1 / lc.K && (lg.st.lagRec || 0) <= (lg.st.lagPass || 0) && (lg.st.lagRec || 0) < lb.st.lagRec && lg.s > 1 / lg.K && (lg2.st.lagRec || 0) <= (lg.st.lagRec || 0) && lg2.s > 1 / lg2.K && lpz.s === lb.s && lpz.spk === lb.spk && lps.s > 1 / lps.K && ((lps.st.lagQuiet || 0) > 0 || (lps.st.lagPruned || 0) > 0) && lps2.s > 1 / lps2.K && lpsh.s > 1 / lpsh.K, `lagDepth 16 (prune+surp: ${lps.st.lagPruned || 0} pruned, ${lps.st.lagQuiet || 0} quiet) (lagGate 2: ${lg2.st.lagRec || 0}) (lagGate: ${lg.st.lagRec || 0} gated recruits vs ${lb.st.lagRec}) (lagCtx 1 = unset, lagCtx 3 keys carry 3 letters): ${ld.st.lagRec} copy recruits, ${ld.st.lagFired} fires; blur ${lb.st.lagRec} / ${lb.st.lagFired}`);
    { const S2 = Object.assign({ lagDepth: 16, lagBlur: 1, lagGate: 1, lagSurp: 2 }, G2), e0 = run(S2), ez = run(Object.assign({ lagEvid: 0 }, S2)), e1 = run(Object.assign({ lagEvid: 1 }, S2)), eh = run(Object.assign({ lagEvid: 0.5 }, S2)), e2 = run(Object.assign({ lagEvid: 2 }, S2)), e3 = run(Object.assign({ lagEvid: 3 }, S2));
      assert.ok(e0.s === ez.s && e0.spk === ez.spk && e0.w.every((v, i) => v === ez.w[i]) && [e1, eh, e2, e3].every(e => e.s > 1 / e.K) && (e1.st.lagFired || 0) <= (e0.st.lagFired || 0) && !(e3.st.lagFired > 0) && ((e2.st.lagWeak || 0) > 0) === ((e1.st.lagWeak0 || 0) > 0) && ((e1.st.lagWeak0 || 0) > 0 || (eh.st.lagWeak || 0) > 0 || (e2.st.lagWeak || 0) > 0 || (e0.st.lagFired || 0) === 0), `R142 lagEvid: 0 bit-identical to unset; 1: ${e1.st.lagWeak0 || 0} weak detectors silenced (fires ${e1.st.lagFired || 0} vs ${e0.st.lagFired || 0}); 0.5: ${eh.st.lagWeak || 0} weighted; 2: ${e2.st.lagWeak || 0} weighted`);
      console.log(`R142 lagEvid: off bit-identical; 1 silences ${e1.st.lagWeak0 || 0} (fires ${e1.st.lagFired || 0} vs ${e0.st.lagFired || 0}), 0.5 weights ${eh.st.lagWeak || 0}, 2 weights ${e2.st.lagWeak || 0}, 3 fires ${e3.st.lagFired || 0}: ok`); }
    { const S2 = Object.assign({ lagDepth: 16, lagBlur: 1, lagGate: 1, lagSurp: 2 }, G2), e0 = run(S2), mz = run(Object.assign({ lagMarg: 0 }, S2)), m1 = run(Object.assign({ lagMarg: 1 }, S2)), m2 = run(Object.assign({ lagMarg: 2 }, S2)), m3 = run(Object.assign({ lagMarg: 3, granChunk: 1 }, S2)), m4 = run(Object.assign({ lagMarg: 4, granChunk: 1 }, S2));
      assert.ok(e0.s === mz.s && e0.spk === mz.spk && e0.w.every((v, i) => v === mz.w[i]) && [m1, m2].every(e => e.s > 1 / e.K && (e.st.lagFired || 0) <= (e0.st.lagFired || 0)) && (m2.st.lagNoFlip || 0) <= (m1.st.lagNoFlip || 0) && m3.s > 1 / m3.K && m4.s > 1 / m4.K && (m4.st.lagFired || 0) <= (e0.st.lagFired || 0), `R142b lagMarg: 0 bit-identical to unset; 1 blocks ${m1.st.lagNoFlip || 0} (fires ${m1.st.lagFired || 0} vs ${e0.st.lagFired || 0}); 2 blocks ${m2.st.lagNoFlip || 0}`);
      console.log(`R142b lagMarg: off bit-identical; 1 blocks ${m1.st.lagNoFlip || 0} (fires ${m1.st.lagFired || 0} vs ${e0.st.lagFired || 0}), 2 blocks ${m2.st.lagNoFlip || 0}, 3 defers ${m3.st.lagDefer || 0}, 4 defers ${m4.st.lagDefer || 0}: ok`); }
    { const w0 = run(Object.assign({ granWord: 0 }, G2)), w1 = run(Object.assign({ granWord: 1 }, G2));
      assert.ok(x2.s === w0.s && x2.spk === w0.spk && x2.w.every((v, i) => v === w0.w[i]) && (w1.st.wordRec || 0) > 0 && w1.kb.some(k => k != null && k[0] === 'W') && w1.s > 1 / w1.K, `R143 granWord: 0 bit-identical to unset; 1: ${w1.st.wordRec || 0} word-start recruits, ${w1.st.wordFired || 0} fires`);
      console.log(`R143 granWord: off bit-identical; on ${w1.st.wordRec || 0} word-start recruits, ${w1.st.wordFired || 0} fires, score ${w1.s.toFixed(3)}: ok`);
      const w2 = run(Object.assign({ granWord: 2 }, G2));   // wordunit: word keys replace the previous-word chunk keys
      assert.ok(!w2.kb.some(k => k != null && k[0] === 'C') && w2.kb.some(k => k != null && k[0] === 'W') && !(w2.st.chunkRec > 0) && w2.s > 1 / w2.K, `wordunit granWord 2: C keys ${w2.kb.filter(k => k != null && k[0] === 'C').length}, W keys ${w2.kb.filter(k => k != null && k[0] === 'W').length}`);
      console.log(`wordunit granWord 2: no chunk keys, ${w2.kb.filter(k => k != null && k[0] === 'W').length} word keys, ${w2.st.wordFired || 0} fires, score ${w2.s.toFixed(3)}: ok`); }
    console.log(`R140 lagDepth: off bit-identical; D16 ${ld.st.lagRec} recruits ${ld.st.lagFired} fires score ${ld.s.toFixed(3)}; blur ${lb.st.lagRec} recruits ${lb.st.lagFired} fires score ${lb.s.toFixed(3)}: ok`); } }
// 9. R131 anSize (exploration noise x sqrt(sizeF); off = bit-identical, 1x unchanged)
{ const run = (ex, f) => { const S = require('./js/node_load.js')(); Object.assign(S.params, ex || {});
    const envP = Object.assign({}, S.recommendedEnvParams('seqchoice', { source: 'order2' }, ['source']), { nSyms: 120 });
    const E = S.setEnv('seqchoice', envP), D = S.PLANS.deepURSx3.make(); if (f) D.regions.forEach(r => { r.g.sc.sizeF = f; });
    const b = S.growCell(D, { seed: 5, spec: E.spec }), a = S.runEpisode(D, 7, b, E);
    return { s: a.task.score(), spk: a.net.spikeCount, w: Array.from(a.net.ws), anF: a.net.anF, K: a.task.K }; };
  const same = (u, z) => u.s === z.s && u.spk === z.spk && u.w.every((v, i) => v === z.w[i]);
  const u = run(), z = run({ anSize: 0 }), o = run({ anSize: 1 });
  assert.ok(same(u, z), 'anSize 0 is bit-identical to unset'); assert.ok(same(u, o), 'anSize 1 is a no-op at 1x');
  const r = { relGrowth: 1, rgDiv: 2 }, v0 = run(r, 2), v1 = run(Object.assign({ anSize: 1 }, r), 2);
  assert.ok(Math.abs(v1.anF - Math.SQRT2) < 1e-9 && !same(v0, v1), `anSize 1 at 2x: noise x ${v1.anF}, life differs`);
  console.log(`R131 anSize: off bit-identical, 1x no-op, 2x noise x ${v1.anF.toFixed(3)} (score ${v0.s.toFixed(3)} -> ${v1.s.toFixed(3)}): ok`);
  const zs = run({ anSelf: 0 }), xs = run({ anSelf: 1 }); assert.ok(same(u, zs), 'anSelf 0 is bit-identical to unset'); assert.ok(!same(u, xs) && xs.s > 1 / xs.K, `anSelf 1 changes exploration, learns (score ${xs.s.toFixed(3)})`);
  console.log(`R131 anSelf: off bit-identical, on score ${xs.s.toFixed(3)}: ok`); }
console.log('ALL OK');
