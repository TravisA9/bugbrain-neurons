#!/usr/bin/env node
'use strict';
/* run/runner.js (v25, round 26): headless evolution for long local experiments. Node >= 18 or Bun; no npm packages.
 *
 *   node run/runner.js experiments/multitask.json [options]       (or: bun run/runner.js ...)
 *   node run/runner.js --resume results/2026-10-11_220500_multitask [options]
 * options: --gens N (stop at generation N, counted from the start of the run, also on resume; 0 = no limit)  --hours H  --workers N (default: cores - 1; 0 = in-process)  --pop N  --name NAME
 *          --force (run even if experiments/registry.jsonl has an exact or near duplicate; R38)
 *          --out DIR (default results/)  --seed N  --smoke (tiny run: pop 4, 2 generations, 1 growth, the config's "smoke" overrides)
 * Stop: Ctrl+C once = finish the current generation, write the checkpoint and stop; twice = quit now (the checkpoint of the
 *       last finished generation stays). Creating a file named STOP in the run folder also stops it after the generation.
 *
 * Modes ("mode" in the config):
 *   standard   : the app's scheme. Every genome is grown `growths` times with seeds shared by the generation, each growth lives
 *                `episodes` episodes per task; per-task fitness = mean - robustW x sd (+ worstW). Tasks are normalised against
 *                reference scores ((f - lo) / (hi - lo); "ref": "auto" = the env's default plan on the validation seeds = 1.0)
 *                and blended by weight ("combine": mean | min | {type:"softmin",tau,cap} = capped soft-minimum, so no task is traded away). The top valTopK + the champion are re-scored on fixed held-out seeds; the best is the
 *                champion. Elites + tournament selection (3) + crossover + mutation.
 *   novelty    : as standard, but selection uses (1 - w) x fitness + w x novelty (both min-max scaled per generation); novelty =
 *                mean distance to the k nearest behaviour descriptors in population + archive; the archiveAdd most novel per
 *                generation enter the archive.
 *   map-elites : a grid over 2 descriptors; every generation `population` children of random elites are evaluated and kept
 *                if their cell is empty or they beat its elite.
 * Output: results/<date>_<name>/ config.json, version.json, generations.csv, champions/gen_NNNNN.json + champion_final.json
 *         (brain files: open in index.html or viewer.html), checkpoint.json, summary.json, log.txt; one line in results/index.csv. */
const fs = require('fs'), path = require('path');
const { ROOT, codeVersion, runtime } = require('./engine.js');
const L = require('./lib.js'), SA = L.SA;
const { Pool, defaultWorkers } = require('./pool.js');
const REG = require('./registry.js');   // R38 experiment registry / dedup

const ENGINE_DEFAULTS = { growths: 3, episodes: 1, robustW: 0.5, worstW: 0, valGrowths: 10, valArenas: 10, valTopK: 3, eliteFrac: 0.1, crossoverRate: 0.3, cellMut: 0.02 };
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) { const s = argv[i]; if (s.startsWith('--')) { const k = s.slice(2); if (['smoke', 'force'].includes(k)) a[k] = true; else a[k] = argv[++i]; } else a._.push(s); }
  return a;
}
const pad = (n, w) => String(n).padStart(w, '0');
function stamp(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}_${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`; }
const median = xs => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const r4 = x => (x == null || !isFinite(x)) ? '' : +x.toFixed(4);
// write to a temp file, then rename (a crash never leaves half a checkpoint). On Windows a rename can fail for a moment while
// another program (antivirus, an editor) holds the file: retry, then fall back to a direct write instead of stopping the run.
function writeAtomic(p, text) {
  const tmp = p + '.tmp'; fs.writeFileSync(tmp, text);
  for (let i = 0; i < 5; i++) { try { fs.renameSync(tmp, p); return; } catch (e) { const t = Date.now() + 200; while (Date.now() < t); } }
  fs.writeFileSync(p, text); try { fs.unlinkSync(tmp); } catch (e) {}
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let cfg, dir, ck = null;
  if (args.resume) {
    dir = path.resolve(args.resume);
    cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
    ck = JSON.parse(fs.readFileSync(path.join(dir, 'checkpoint.json'), 'utf8'));
  } else {
    if (!args._[0]) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 30).join('\n')); process.exit(1); }
    cfg = JSON.parse(fs.readFileSync(path.resolve(args._[0]), 'utf8'));
  }
  // command-line overrides (also on resume: e.g. more generations or another worker count)
  if (args.smoke && !args.resume) { cfg.population = 4; cfg.generations = 2; cfg.engine = Object.assign({}, cfg.engine, { growths: 1, valGrowths: 1, valArenas: 1, valTopK: 1 });
    for (const t of cfg.tasks) Object.assign(t.params = t.params || {}, (cfg.smoke && cfg.smoke[t.name]) || {}); if (cfg.novelty) cfg.novelty.k = Math.min(cfg.novelty.k || 10, 3); cfg.smokeRun = true; }
  if (args.gens != null) cfg.generations = +args.gens;
  if (args.hours != null) cfg.hours = +args.hours;
  if (args.pop != null && !args.resume) cfg.population = +args.pop;
  if (args.seed != null && !args.resume) cfg.seed = +args.seed;
  if (args.name && !args.resume) cfg.name = args.name;
  if (args.workers != null) cfg.workers = +args.workers;
  cfg.mode = cfg.mode || 'standard'; cfg.name = cfg.name || 'run'; cfg.population = cfg.population || 32; cfg.seed = cfg.seed == null ? 1 : cfg.seed;
  cfg.engine = Object.assign({}, ENGINE_DEFAULTS, cfg.engine); cfg.tasks.forEach((t, i) => { t.name = t.name || t.env + i; });
  const workers = cfg.workers == null || cfg.workers === 'auto' ? defaultWorkers() : +cfg.workers;
  L.applyEngine(cfg.engine);
  // R38: dedup against experiments/registry.jsonl (fresh, non-smoke runs only); exit code 3 = skipped as a duplicate
  if (!args.resume && !cfg.smokeRun && REG.gate(REG.describeRun(cfg, SA.DEFAULTS_VERSION), { force: !!args.force }) === 'skip') process.exit(3);
  if (!dir) {
    const out = path.resolve(args.out || path.join(ROOT, 'results'));
    dir = path.join(out, stamp(new Date()) + '_' + cfg.name.replace(/[^\w.-]+/g, '_'));
    fs.mkdirSync(path.join(dir, 'champions'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg, null, 2));
    fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify(Object.assign(codeVersion(), { runtime: runtime(), platform: process.platform, workers, startedAt: new Date().toISOString() }), null, 2));
  }
  try { fs.unlinkSync(path.join(dir, 'STOP')); } catch (e) {}   // a stale STOP file from an earlier stop
  const logf = path.join(dir, 'log.txt'), log = s => { const line = `[${new Date().toLocaleString()}] ${s}`; console.log(line); fs.appendFileSync(logf, line + '\n'); };
  const pool = new Pool(workers, cfg.engine);
  const tasks = cfg.tasks.map(t => ({ name: t.name, env: t.env, params: L.taskEnvParams(t) }));   // fully resolved env params (sent to the workers)
  const descNames = cfg.mode === 'standard' ? null : L.descriptorNames(cfg);
  log(`${args.resume ? 'resuming' : 'starting'} ${cfg.name} (${cfg.mode}) in ${dir}: ${tasks.map(t => t.name + '=' + t.env).join(', ')}; population ${cfg.population}; ${workers} worker${workers === 1 ? '' : 's'}; ${runtime()}`);

  // ---- state ----
  let st;
  if (ck) {
    st = { gen: ck.gen, rng: L.makeRng(ck.rngState), pop: ck.pop.map(L.deserialize), champion: ck.champion ? Object.assign({}, ck.champion, { x: L.deserialize(ck.champion.genome) }) : null,
           archive: ck.archive || [], grid: new Map((ck.grid || []).map(c => [c.key, Object.assign({}, c, { x: L.deserialize(c.genome) })])), refs: ck.refs, elapsed: ck.elapsed || 0, evals: ck.evals || 0, ticks: ck.ticks || 0, seedsUsed: ck.seedsUsed || {} };
    // the champion is the same object as its copy in the population / grid (as in an uninterrupted run)
    if (st.champion && ck.champion.popIndex >= 0) st.champion.x = st.pop[ck.champion.popIndex];
    else if (st.champion && ck.champion.gridKey && st.grid.has(ck.champion.gridKey)) st.champion.x = st.grid.get(ck.champion.gridKey).x;
    log(`checkpoint: generation ${st.gen}, ${st.pop.length} genomes, champion ${st.champion ? st.champion.val.toFixed(4) : '-'}`);
  } else {
    const rng = L.makeRng(cfg.seed), starts = cfg.start && cfg.start.length ? cfg.start : ['env'], pop = [];
    for (let i = 0; i < cfg.population; i++) {
      const id = starts[i % starts.length], idr = id === 'env' ? SA.defaultPlanId(L.setupTask(cfg.tasks[0])) : id, x = L.startGenome(idr, cfg);
      pop.push(i < starts.length ? x : L.mutate(x, rng, cfg));   // one unmutated copy of each starting plan, the rest mutants
    }
    st = { gen: 0, rng, pop, champion: null, archive: [], grid: new Map(), refs: null, elapsed: 0, evals: 0, ticks: 0, seedsUsed: { master: cfg.seed } };
  }
  // ---- reference scores (task normalisation) ----
  if (!st.refs) {
    const vplan = L.seedPlan(cfg.engine, 0, true);
    st.refs = await Promise.all(cfg.tasks.map(async (t, i) => {
      if (t.ref && typeof t.ref === 'object') return { lo: t.ref.lo || 0, hi: t.ref.hi, plan: 'given' };
      if (t.ref === 'none') return { lo: 0, hi: 1, plan: 'none' };
      const env = L.setupTask(t), pid = (t.refPlan) || SA.defaultPlanId(env);
      const r = await pool.eval(L.serialize({ g: SA.PLANS[pid].make() }), [tasks[i]], vplan);
      const hi = r.tasks[0].fit, lo = (t.ref && t.ref.lo) || 0;
      return { lo, hi: hi > lo ? hi : lo + 1, plan: pid, raw: hi };
    }));
    log('reference scores (= 1.0 after normalisation): ' + st.refs.map((r, i) => `${tasks[i].name} ${r.plan} ${r4(r.hi)}`).join(', '));
  }
  // ---- CSV ----
  const csvPath = path.join(dir, 'generations.csv');
  const cols = ['gen', 'elapsed_s', 'gen_s', 'evals', 'ticks', 'ticks_per_s', 'best', 'mean', 'median', 'champion_val']
    .concat(...tasks.map(t => [`${t.name}_best`, `${t.name}_mean`, `${t.name}_median`, `${t.name}_norm_best`, `${t.name}_champion`]))
    .concat(['novelty_mean', 'novelty_max', 'archive', 'coverage', 'qd_score', 'errors']);
  if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, cols.join(',') + '\n');

  // ---- stop handling ----
  let stop = false, sigs = 0;
  process.on('SIGINT', () => { sigs++; if (sigs === 1) { stop = true; log('Ctrl+C: stopping after this generation (Ctrl+C again to quit now; the last checkpoint stays)'); } else { log('quit now'); process.exit(130); } });
  // R39: the budget counts ACTIVE compute time only. A 1-s ticker notices when the machine was suspended (sleep / Modern Standby:
  // the ticker sees a gap) and that gap is excluded from elapsed time and from the generation time; it is logged.
  let susp = 0, lastTick = Date.now(); const actNow = () => Date.now() - susp;
  const ticker = setInterval(() => { const n = Date.now(), gap = n - lastTick; lastTick = n; if (workers > 0 && gap > 15000) { susp += gap - 1000; log(`machine was suspended or stalled for ${(gap / 60000).toFixed(1)} min: not counted in the time budget`); } }, 1000);
  if (ticker.unref) ticker.unref();
  const t0 = actNow() - st.elapsed * 1000, maxGen = cfg.generations || 0, maxMs = (cfg.hours || 0) * 3600e3;
  const evalAll = (xs, plan) => Promise.all(xs.map(x => pool.eval(L.serialize(x), tasks, plan)));
  const score = r => L.normFit(r, cfg.tasks, st.refs, cfg.combine);
  let lastGenMs = 0, endReason = 'stopped';
  while (true) {
    if (maxGen && st.gen >= maxGen) { endReason = 'generations'; break; }
    if (maxMs && actNow() - t0 >= maxMs) { endReason = 'hours'; break; }
    if (stop || fs.existsSync(path.join(dir, 'STOP'))) { endReason = 'stopped'; break; }
    const g0 = actNow(), plan = L.seedPlan(cfg.engine, st.gen, false), vplan = L.seedPlan(cfg.engine, st.gen, true);
    // 1. the batch to evaluate
    let batch;
    if (cfg.mode === 'map-elites' && st.grid.size) {
      const elites = [...st.grid.values()]; batch = [];
      for (let i = 0; i < cfg.population; i++) { const p = elites[(st.rng() * elites.length) | 0].x;
        const child = st.rng() < cfg.engine.crossoverRate ? L.crossover(p, elites[(st.rng() * elites.length) | 0].x, st.rng) : p; batch.push(L.mutate(child, st.rng, cfg)); }
    } else batch = st.pop;
    const res = await evalAll(batch, plan);
    const inds = batch.map((x, i) => { const r = res[i], s = score(r); return { x, r, fit: s.fit, norm: s.norm, desc: descNames ? L.descriptor(r, cfg, descNames) : null }; });
    const errors = res.filter(r => r.error).length; if (errors) log(`${errors} evaluation error(s), e.g. ${res.find(r => r.error).error.split('\n')[0]}`);
    st.evals += batch.length; const genTicks = res.reduce((a, r) => a + r.ticks, 0); st.ticks += genTicks;
    // 2. novelty / grid
    let nov = null;
    if (cfg.mode === 'novelty') {
      const N = cfg.novelty || {}; nov = L.novelty(inds.map(o => o.desc), st.archive, N.k || 10); inds.forEach((o, i) => { o.nov = nov[i]; });
      const add = inds.slice().sort((a, b) => b.nov - a.nov).slice(0, N.archiveAdd == null ? 3 : N.archiveAdd);
      for (const o of add) st.archive.push(o.desc); const cap = N.archiveMax || 2000; if (st.archive.length > cap) st.archive.splice(0, st.archive.length - cap);
      const w = N.weight == null ? 0.5 : N.weight, mm = k => { const v = inds.map(o => o[k]), lo = Math.min(...v), hi = Math.max(...v); return x => (x - lo) / ((hi - lo) || 1); }, nf = mm('fit'), nn = mm('nov');
      for (const o of inds) o.sel = (1 - w) * nf(o.fit) + w * nn(o.nov);
    } else for (const o of inds) o.sel = o.fit;
    if (cfg.mode === 'map-elites') {
      const dims = cfg.map.dims;
      for (const o of inds) { const key = o.desc.map((v, j) => { const d = dims[j]; return Math.max(0, Math.min(d.bins - 1, Math.floor((v - d.lo) / (d.hi - d.lo) * d.bins))); }).join(',');
        const c = st.grid.get(key); if (!c || o.fit > c.fit) st.grid.set(key, { key, x: o.x, fit: o.fit, desc: o.desc, norm: o.norm }); }
    }
    // 3. validation -> champion
    const ranked = inds.slice().sort((a, b) => b.fit - a.fit);
    const vq = (cfg.mode === 'map-elites' ? [...st.grid.values()].sort((a, b) => b.fit - a.fit).map(c => c.x) : ranked.map(o => o.x)).slice(0, cfg.engine.valTopK);
    if (st.champion && !vq.includes(st.champion.x)) vq.push(st.champion.x);
    const vres = await evalAll(vq, vplan);
    vq.forEach((x, i) => { const s = score(vres[i]);
      if (st.champion && x === st.champion.x) { st.champion.val = s.fit; st.champion.norm = s.norm; st.champion.raw = vres[i].tasks.map(t => t.fit); }
      else if (!st.champion || s.fit > st.champion.val) st.champion = { x, val: s.fit, norm: s.norm, raw: vres[i].tasks.map(t => t.fit), gen: st.gen }; });
    st.evals += vq.length; st.ticks += vres.reduce((a, r) => a + r.ticks, 0);
    // 4. CSV + log
    const fits = inds.map(o => o.fit), now = actNow(); lastGenMs = now - g0; st.elapsed = (now - t0) / 1000;
    const row = { gen: st.gen, elapsed_s: r4(st.elapsed), gen_s: r4(lastGenMs / 1000), evals: st.evals, ticks: st.ticks, ticks_per_s: Math.round(genTicks / (lastGenMs / 1000)),
      best: r4(ranked[0].fit), mean: r4(mean(fits)), median: r4(median(fits)), champion_val: r4(st.champion.val), errors };
    tasks.forEach((t, i) => { const f = inds.map(o => o.r.tasks[i].fit); row[`${t.name}_best`] = r4(Math.max(...f)); row[`${t.name}_mean`] = r4(mean(f)); row[`${t.name}_median`] = r4(median(f));
      row[`${t.name}_norm_best`] = r4(Math.max(...inds.map(o => o.norm[i]))); row[`${t.name}_champion`] = r4(st.champion.raw[i]); });
    if (nov) { row.novelty_mean = r4(mean(nov)); row.novelty_max = r4(Math.max(...nov)); row.archive = st.archive.length; }
    if (cfg.mode === 'map-elites') { const tot = cfg.map.dims.reduce((a, d) => a * d.bins, 1); row.coverage = r4(st.grid.size / tot); row.qd_score = r4([...st.grid.values()].reduce((a, c) => a + Math.max(0, c.fit), 0)); }
    fs.appendFileSync(csvPath, cols.map(c => row[c] == null ? '' : row[c]).join(',') + '\n');
    log(`gen ${st.gen}: best ${r4(ranked[0].fit)} mean ${r4(mean(fits))} champion ${r4(st.champion.val)} [${tasks.map((t, i) => t.name + ' ' + r4(st.champion.raw[i])).join(', ')}]` +
        (nov ? ` novelty ${r4(mean(nov))} archive ${st.archive.length}` : '') + (cfg.mode === 'map-elites' ? ` cells ${st.grid.size} qd ${row.qd_score}` : '') + ` · ${(lastGenMs / 1000).toFixed(1)} s, ${row.ticks_per_s} ticks/s`);
    // 5. next population (standard / novelty)
    if (cfg.mode !== 'map-elites') {
      const r = st.rng, sorted = inds.slice().sort((a, b) => b.sel - a.sel), byFit = ranked;
      const nElite = Math.max(1, Math.round(cfg.population * cfg.engine.eliteFrac)), next = byFit.slice(0, nElite).map(o => o.x);
      if (!next.includes(st.champion.x)) next.unshift(st.champion.x);
      const tour = () => { let b = sorted[(r() * sorted.length) | 0]; for (let i = 0; i < 2; i++) { const c = sorted[(r() * sorted.length) | 0]; if (c.sel > b.sel) b = c; } return b.x; };
      while (next.length < cfg.population) { const p = tour(); const child = r() < cfg.engine.crossoverRate ? L.crossover(p, tour(), r) : p; next.push(L.mutate(child, r, cfg)); }
      st.pop = next;
    }
    st.gen++;
    // 6. champion file, checkpoint, summary
    const every = cfg.championEvery || 10;
    if (st.gen % every === 0) writeChampion(path.join(dir, 'champions', `gen_${pad(st.gen, 5)}.json`));
    saveCheckpoint(); writeSummary('running');
  }
  function brainFile() {
    const t = cfg.tasks[0], c = st.champion; L.setupTask(t);
    return { format: 'spiking-arena-net/v7', environment: t.env, envParams: L.taskEnvParams(t),
      meta: { kind: 'champion', run: cfg.name, generation: c.gen, validation: c.val, normalised: c.norm, raw: c.raw, tasks: tasks.map(x => x.name), free: c.x.free || null, appVersion: SA.APP_VERSION },
      developmental_genome: SA.genomeToCompact(c.x.g) };
  }
  function writeChampion(p) { if (st.champion) writeAtomic(p, JSON.stringify(brainFile())); }
  function saveCheckpoint() {
    writeAtomic(path.join(dir, 'checkpoint.json'), JSON.stringify({ format: 'spiking-arena-run-checkpoint/v1', gen: st.gen, rngState: st.rng.state(), pop: st.pop.map(L.serialize),
      champion: st.champion ? { genome: L.serialize(st.champion.x), popIndex: st.pop.indexOf(st.champion.x), gridKey: (([...st.grid.values()].find(c => c.x === st.champion.x)) || {}).key || null, val: st.champion.val, norm: st.champion.norm, raw: st.champion.raw, gen: st.champion.gen } : null,
      archive: st.archive, grid: [...st.grid.values()].map(c => ({ key: c.key, genome: L.serialize(c.x), fit: c.fit, desc: c.desc, norm: c.norm })), refs: st.refs, elapsed: st.elapsed, evals: st.evals, ticks: st.ticks, seedsUsed: st.seedsUsed, savedAt: new Date().toISOString() }));
  }
  function writeSummary(status) {
    const s = { name: cfg.name, dir: path.basename(dir), mode: cfg.mode, status, generations: st.gen, hours: +(st.elapsed / 3600).toFixed(4), evals: st.evals, ticks: st.ticks,
      champion: st.champion ? { val: st.champion.val, gen: st.champion.gen, raw: st.champion.raw, norm: st.champion.norm } : null, tasks: tasks.map(t => t.name), refs: st.refs,
      workers, runtime: runtime(), seed: cfg.seed, updatedAt: new Date().toISOString() };
    writeAtomic(path.join(dir, 'summary.json'), JSON.stringify(s, null, 2));
    // v30: live dashboard feed: results/current.js (a script, so dashboard.html can load it from file:// with no server)
    try { let csv = ''; try { csv = fs.readFileSync(csvPath, 'utf8'); } catch (e) {}
      writeAtomic(path.join(path.dirname(dir), 'current.js'), 'window.BB_CURRENT = ' + JSON.stringify({ summary: s, csv, config: cfg, writtenAt: s.updatedAt }) + ';\n'); } catch (e) {}
    return s;
  }
  // ---- end ----
  writeChampion(path.join(dir, 'champions', 'champion_final.json'));
  saveCheckpoint(); const s = writeSummary(endReason === 'stopped' ? 'stopped' : 'finished');
  const idx = path.join(path.dirname(dir), 'index.csv');
  if (!fs.existsSync(idx)) fs.writeFileSync(idx, 'dir,name,mode,status,generations,hours,evals,champion_val,champion_gen,tasks,champion_raw,runtime,workers,seed,ended\n');
  fs.appendFileSync(idx, [s.dir, s.name, s.mode, s.status, s.generations, s.hours, s.evals, r4(s.champion && s.champion.val), s.champion ? s.champion.gen : '', s.tasks.join(' '),
    s.champion ? s.champion.raw.map(r4).join(' ') : '', s.runtime, s.workers, s.seed, s.updatedAt].map(v => /[,"]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',') + '\n');
  if (!cfg.smokeRun) try { REG.record(REG.describeRun(cfg, SA.DEFAULTS_VERSION), { status: s.status, dir: path.basename(dir), champion: s.champion ? { val: r4(s.champion.val), gen: s.champion.gen, raw: s.champion.raw.map(r4) } : null, tasks: s.tasks, refs: (s.refs || []).map(r => r4(r.hi)), hoursRun: s.hours }); } catch (e) { log('registry write failed: ' + e.message); }
  log(`${s.status} (${endReason}) after ${st.gen} generations, ${s.hours} h; champion ${r4(s.champion && s.champion.val)}; resume with: ${typeof Bun !== "undefined" ? "bun" : "node"} run/runner.js --resume "${dir}"`);
  clearInterval(ticker);
  try { await pool.close(); } catch (e) { log('pool close: ' + e.message); }
  process.exit(0);   // R39: a finished run always exits 0 (bun on Windows could exit non-zero while tearing down the workers)
}
main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
