/* =====================================================================
 * io.js — the I/O INTERFACE between the engine and any environment.
 *
 * An environment declares an IO SPEC: its sensor channels (inputs) and its
 * motor / output channels. Development places those fixed cells on the edge
 * of the tissue from the spec, so the same genome type grows brains for any
 * environment. Genes never refer to "eye 3"; they refer to ADDRESS TAGS
 * (0..8) that the environment assigns to its channel groups, and to
 * morphogens whose sources come from the channel positions.
 *
 *   input  = { name, group, tag, pos:[x,y],      // display + growth position (x: -1 left .. 1 right,
 *              at?:[x,y],                         //   y: -1 back .. +1 front); 'at' = where its axon starts
 *              cls?, mirror?, midline?, ownRng?,  // display class; bilateral twin index; no sideways noise;
 *              cue? }                             //   own RNG stream; emits the 'sensor cue' morphogen
 *   output = { name, group, tag, pos, bias?, mirror? }   // tag 4 or 5 (the "motor" seek tags); bias = mV/substep
 *   spec   = { inputs, outputs, classes?, tagNames?, coneOrder?, cueSources?, juvenile? }
 *   juvenile = { waves:[[input idx...], ...], waveGain, tonic:[[idx, mV]], kicks:{ chans, p, gain } }
 *       (spontaneous activity used during development for refinement / homeostasis)
 *
 * ENCODERS turn values into input currents; DECODERS turn output spikes into
 * actions / symbols. ENVIRONMENT REGISTRY: registerEnv(def), see README.
 * ===================================================================== */
'use strict';

/* ---------------- spec helpers ---------------- */
const N_FIXED = 16;                 // cellType ids 0..15 = fixed (sensor / output) display classes; hidden = 16 + tag class
const DEFAULT_TAG_NAMES = ['tag 0', 'tag 1', 'tag 2', 'tag 3', 'motor', 'tag 5', 'tag 6', 'free'];
// n positions spread evenly on [x0, x1]
function spread(n, x0, x1) { const a = []; for (let k = 0; k < n; k++) a.push(n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * k / (n - 1)); return a; }
// Validate an environment's spec, fill defaults and compute its identity key (brains are cached per key).
function makeSpec(s) {
  const inputs = s.inputs.map((c, i) => Object.assign({ group: 'in', tag: 0, cls: 0 }, c, { at: c.at || c.pos }));
  const outputs = s.outputs.map((c, i) => Object.assign({ group: 'out', tag: 4, bias: 0, cls: 8 }, c));
  const nIn = inputs.length, nOut = outputs.length;
  const names = new Set(); for (const c of inputs.concat(outputs)) { if (names.has(c.name)) throw new Error('duplicate channel name ' + c.name); names.add(c.name); }
  let cueSources = s.cueSources;
  if (!cueSources) { const f = inputs.filter(c => c.cue); cueSources = (f.length ? f : inputs).map(c => c.at); }
  const juv = Object.assign({ waves: [inputs.map((c, i) => i).filter(i => !inputs[i].tonic)], waveGain: 10, tonic: [], kicks: null }, s.juvenile || {});
  const spec = { inputs, outputs, nIn, nOut, classes: s.classes || [], tagNames: s.tagNames || DEFAULT_TAG_NAMES,
                 coneOrder: s.coneOrder || inputs.map((c, i) => i), cueSources, juvenile: juv, outcome: !!s.outcome };   // v29: outcome = the env delivers reward/punishment (a dopamine source); not part of the key
  spec.key = JSON.stringify([inputs, outputs, spec.coneOrder, cueSources, juv]);
  return spec;
}
const inputIndex = (spec, name) => spec.inputs.findIndex(c => c.name === name);
const outputIndexByName = (spec, name) => spec.outputs.findIndex(c => c.name === name);
const groupIndices = (list, group) => list.map((c, i) => c.group === group ? i : -1).filter(i => i >= 0);

/* ---------------- encoders (value -> input current, mV per substep) ---------------- */
const Enc = {
  // rate / current coding of a scalar: current proportional to the value
  current(ext, i, value, gain) { ext[i] = value * gain; },
  // one-hot (categorical symbol): only the symbol's channel gets current
  oneHot(ext, idxs, k, gain) { for (let j = 0; j < idxs.length; j++) ext[idxs[j]] = j === k ? gain : 0; },
  // population code of a scalar in [lo, hi]: gaussian bumps over the group
  population(ext, idxs, x, lo, hi, gain, width) {
    const n = idxs.length, c = (clamp(x, lo, hi) - lo) / (hi - lo || 1) * (n - 1), w = width || 1;
    for (let j = 0; j < n; j++) ext[idxs[j]] = gain * Math.exp(-((j - c) ** 2) / (2 * w * w));
  },
  // Poisson coding: with probability rate per tick the channel gets a strong pulse
  poisson(ext, i, rate, gain, rng) { ext[i] = rng() < rate ? gain : 0; },
};
/* ---------------- decoders (output spikes -> actions) ---------------- */
const Dec = {
  // smoothed firing rate -> continuous value (e.g. a wheel): clamp((rate - zero) * gain, lo, hi)
  rateToValue(rate, zero, gain, lo, hi) { return clamp((rate - zero) * gain, lo == null ? -1 : lo, hi == null ? 1 : hi); },
  // winner-take-all over a group of spike counts: index of the max, -1 if silent or tied
  wta(counts, idxs) {
    idxs = idxs || Array.from(counts, (_, i) => i);
    let best = -1, bv = 0, tie = false;
    for (const i of idxs) { const v = counts[i]; if (v > bv) { bv = v; best = i; tie = false; } else if (v === bv && v > 0) tie = true; }
    return tie ? -1 : best;
  },
  // softmax over spike counts (for probabilistic read-out, e.g. bits per character)
  softmax(counts, beta, idxs) {
    idxs = idxs || Array.from(counts, (_, i) => i);
    const b = beta == null ? 1 : beta; let mx = -Infinity; for (const i of idxs) mx = Math.max(mx, counts[i] * b);
    const p = idxs.map(i => Math.exp(counts[i] * b - mx)), s = p.reduce((a, x) => a + x, 0);
    return p.map(x => x / s);
  },
};

/* ---------------- environment registry ----------------
 * def = { id, name, description, params:{ key:{ value, min, max, step, label, note, options } },
 *         io(P) -> spec, create(seed, P, spec) -> task, defaultPlan, plans? }
 * task = { t, done, sense(ext), act(out) -> {pos, neg, pain}, fitness(), score()?, stats()?, render(ctx, W, H, opts)? }
 *   out = { rates: Float64Array(nOut) (smoothed spike rates), spikes: Uint16Array(nOut) (spikes this tick) } */
const ENVS = {}, envParams = {};
function registerEnv(def) {
  ENVS[def.id] = def;
  if (!envParams[def.id]) { const o = {}; for (const k in def.params || {}) o[k] = def.params[k].value; envParams[def.id] = o; }
}
function envList() { return Object.values(ENVS); }
// v17: the declared defaults of an env's params, and its RECOMMENDED params: defaults + def.recommend(P) (which may
// depend on the task choice, e.g. seq with Text -> two-phase clock + 1000 symbols). keep = keys copied from 'from'.
function envDefaults(id) { const o = {}, d = ENVS[id].params || {}; for (const k in d) o[k] = d[k].value; return o; }
function recommendedEnvParams(id, from, keep) {
  const o = envDefaults(id), def = ENVS[id];
  if (from) for (const k of keep || def.taskKeys || []) if (k in from) o[k] = from[k];
  return Object.assign(o, def.recommend ? def.recommend(o) : {});
}
let _specCache = { id: null, json: null, spec: null };
// The current environment: { id, def, P (its parameters), spec }
function currentEnv(id) {
  id = id || params.env; const def = ENVS[id]; if (!def) throw new Error('unknown environment ' + id);
  const P = envParams[id], json = JSON.stringify(P);
  if (_specCache.id !== id || _specCache.json !== json) _specCache = { id, json, spec: makeSpec(def.io(P)) };
  return { id, def, P, spec: _specCache.spec };
}
function setEnv(id, overrides) {
  if (!ENVS[id]) throw new Error('unknown environment ' + id);
  params.env = id; if (overrides) for (const k in overrides) if (k in envParams[id]) envParams[id][k] = overrides[k];
  return currentEnv(id);
}

/* ---------------- body plans (starting genomes) ---------------- */
const PLANS = {};      // id -> { id, label, note, make() }
function registerPlan(id, label, make, note) { PLANS[id] = { id, label, make, note: note || '' }; }
const PLAN_ALIASES = { hand: 'v3', hand2: 'v2', hand1: 'v1' };   // names used by v6 sessions
function planFor(name, env) {
  env = env || currentEnv();
  let id = PLAN_ALIASES[name] || name;
  if (!id || id === 'env' || !PLANS[id]) id = defaultPlanId(env);
  return PLANS[id];
}
// defaultPlan may be a plan id or a function of the env params (v9: seq picks the large tissue for big alphabets)
function defaultPlanId(env) { const d = env.def.defaultPlan; const id = typeof d === 'function' ? d(env.P) : d; return PLANS[id] ? id : 'v1'; }

Object.assign(SpikingArena, { N_FIXED, spread, makeSpec, inputIndex, outputIndexByName, groupIndices, Enc, Dec, ENVS, envParams, registerEnv, envList, envDefaults, recommendedEnvParams,
  currentEnv, setEnv, PLANS, registerPlan, planFor, defaultPlanId, PLAN_ALIASES });
