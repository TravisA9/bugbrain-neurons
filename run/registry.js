'use strict';
/* run/registry.js (R38): experiment registry + dedup check. experiments/registry.jsonl, one JSON line per finished run / ablation.
 * fingerprint = normalized config (plan or start plans, gene overrides, tasks with resolved params, engine settings, seeds).
 * exact = same fingerprint; near = same config ignoring seed, budget (hours / generations / growth counts) and names. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), REG = process.env.BB_REGISTRY || path.join(ROOT, 'experiments', 'registry.jsonl');
const round = v => typeof v === 'number' ? +v.toPrecision(4) : v;
function norm(o) {   // sorted keys, rounded numbers, no undefined
  if (Array.isArray(o)) return o.map(norm);
  if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o).sort()) if (o[k] !== undefined) r[k] = norm(o[k]); return r; }
  return round(o);
}
const hash = o => crypto.createHash('sha1').update(JSON.stringify(norm(o))).digest('hex').slice(0, 16);
const DROP_NEAR = ['seed', 'hours', 'generations', 'growths', 'valGrowths', 'valArenas', 'G'];
function strip(o, keys) { if (Array.isArray(o)) return o.map(x => strip(x, keys)); if (o && typeof o === 'object') { const r = {}; for (const k in o) if (!keys.includes(k)) r[k] = strip(o[k], keys); return r; } return o; }
// a runner config -> canonical description
function describeRun(cfg, defaults) {
  return { kind: 'evolve', defaults: defaults == null ? null : defaults, mode: cfg.mode || 'standard', start: cfg.start || ['env'], startPl: cfg.startPl || null, startSc: cfg.startSc || null,
    tasks: (cfg.tasks || []).map(t => ({ env: t.env, params: t.params || {}, weight: t.weight == null ? 1 : t.weight, ref: t.refPlan || t.ref || 'auto' })),
    combine: cfg.combine || 'mean', population: cfg.population || 32, engine: cfg.engine || {}, novelty: cfg.novelty || null, map: cfg.map || null,
    seed: cfg.seed == null ? 1 : cfg.seed, hours: cfg.hours || 0, generations: cfg.generations || 0 };
}
function describeAblation(plan, task, variant, G, champ, defaults) { return { kind: 'ablate', defaults: defaults == null ? null : defaults, plan, task, variant, champ: champ ? path.basename(champ) : null, G: +G, seed: 0 }; }
function fingerprints(desc) { return { fp: hash(desc), near: hash(strip(desc, DROP_NEAR)) }; }
function load() { try { return fs.readFileSync(REG, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } }
// returns { exact: entry|null, near: entry|null }
function check(desc) { const f = fingerprints(desc), all = load().filter(e => e.status !== 'failed'); return { fp: f.fp, near_fp: f.near, exact: all.find(e => e.fp === f.fp) || null, near: all.find(e => e.near === f.near && e.fp !== f.fp) || null }; }
function record(desc, extra) { const f = fingerprints(desc); const e = Object.assign({ fp: f.fp, near: f.near, at: new Date().toISOString(), desc: norm(desc) }, extra); fs.mkdirSync(path.dirname(REG), { recursive: true }); fs.appendFileSync(REG, JSON.stringify(e) + '\n'); return e; }
// for the runner / ablate: warn + decide. Near duplicates are skipped only when strict (the queue); exact ones always unless forced.
function gate(desc, { force = false, strictNear = true, log = console.log } = {}) {
  const c = check(desc);
  if (c.exact) { log(`registry: EXACT duplicate of ${c.exact.at} (${c.exact.dir || c.exact.fp})${force ? ' — running anyway (--force)' : ' — skipping (use --force to run again)'}`); return force ? 'run' : 'skip'; }
  const budget = d => (d.G || 0) + (d.hours || 0) * 1000 + (d.generations || 0) + (d.engine ? (d.engine.growths || 0) * 0.01 : 0);
  if (c.near && budget(c.near.desc || {}) < budget(norm(desc))) { log(`registry: near duplicate of ${c.near.at} with a SMALLER budget — running (bigger budget)`); return 'run'; }
  if (c.near) { log(`registry: NEAR duplicate of ${c.near.at} (${c.near.dir || c.near.fp}; differs only in seed / budget)${force || !strictNear ? ' — running' : ' — skipping (use --force)'}`); return force || !strictNear ? 'run' : 'skip'; }
  return 'run';
}
module.exports = { REG, norm, hash, describeRun, describeAblation, fingerprints, load, check, record, gate };
