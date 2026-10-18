'use strict';
/* ---------------- files.js: network JSON import / export, compact genomes ----------------
 * HOW TO LOAD A FLYWIRE SUBCIRCUIT
 * FlyWire (https://codex.flywire.ai) lets you download neurons
 * (root_id, cell type, neurotransmitter prediction) and connections
 * (pre_root_id, post_root_id, syn_count, nt_type). Pick a small
 * subcircuit (e.g. some visual projection neurons -> central complex ->
 * descending neurons), then convert it to this JSON:
 *
 * {
 *   "format": "spiking-arena-net/v1",
 *   "neurons": [
 *     { "id": "720575940612345678", "role": "input",  "channel": "eye4_food" },
 *     { "id": "720575940600000001", "role": "hidden", "label": "EPG", "v_thresh": -55, "leak": 0.95 },
 *     { "id": "720575940699999999", "role": "output", "motor": "left" }
 *   ],
 *   "edges": [
 *     { "pre": "720575940612345678", "post": "720575940600000001", "syn_count": 12, "nt": "ACH" },
 *     { "pre": "720575940600000001", "post": "720575940699999999", "weight": -6.5 }
 *   ],
 *   "weight_per_synapse": 0.5,   // optional: mV per synapse when "weight" is absent
 *   "plasticity": { "lr": 0.03, ... },  // optional lifetime-learning genes (see section 2)
 *   "modulators": [ { "gFood": 1, "gPoison": 1, "gWall": 0.05, "tauMod": 5, "src": -1, "gSpike": 0 }, ... ],
 *   (edges may carry "ch": modulator channel index; neurons may carry "pos": [x, y])
 *   (each edge may carry "plastic": true/false; if absent, edges are plastic only when
 *    the file has a "plasticity" block, so plain connectome files load as fixed wiring)
 *   "lock_topology": true        // optional: evolution may tune weights but not rewire
 * }
 *
 *  - role: "input" | "hidden" | "output". Input "channel" and output "motor" are
 *    channel NAMES of the environment's IO spec (bug arena: eye0..eye8 x
 *    _wall/_food/_poison, "tonic", "bump_left/front/right", "gyro_left/right";
 *    outputs "left", "right", "speed"). Inputs without a valid channel become
 *    hidden; missing outputs are added unconnected.
 *  - v7 files carry "environment": the id of the environment they were made for.
 *  - edge weight: explicit "weight" (mV per spike), else
 *    syn_count * weight_per_synapse * sign, where sign = -1 for
 *    nt in {GABA, GLUT} (inhibitory in the fly), +1 otherwise (ACH...).
 *  - Unassigned input channels / motors simply stay unconnected.
 * Saved genomes use this same format, so files round-trip.            */
const INHIB_NT = { GABA: 1, GLUT: 1, GLU: 1, GLUTAMATE: 1 };
function genomeFromJSON(obj, spec) {
  if (typeof obj === 'string') obj = JSON.parse(obj);
  spec = spec || currentEnv(obj.environment && ENVS[obj.environment] ? obj.environment : null).spec;
  const inName = new Map(spec.inputs.map((c, i) => [c.name, i])), outName = new Map(spec.outputs.map((c, i) => [c.name, i]));
  if (!obj || !Array.isArray(obj.neurons) || !Array.isArray(obj.edges)) throw new Error('JSON needs "neurons" and "edges" arrays');
  const idx = new Map(); const hidden = [];
  const inputSlot = new Array(spec.nIn).fill(null), outSlot = new Array(spec.nOut).fill(null);
  for (const n of obj.neurons) {
    const id = String(n.id), ci = inName.get(n.channel), co = outName.get(n.motor != null ? n.motor : n.channel);
    if (n.role === 'input' && ci != null && !inputSlot[ci]) inputSlot[ci] = n;
    else if (n.role === 'output' && co != null && !outSlot[co]) outSlot[co] = n;
    else hidden.push(n);
    if (idx.has(id)) throw new Error('duplicate neuron id ' + id);
    idx.set(id, -1);
  }
  const g = createNetGenome(spec.nIn, hidden.length, spec.nOut);
  g.labels = new Array(g.N).fill(''); g.ids = new Array(g.N).fill(null);
  const place = (n, i) => {
    idx.set(String(n.id), i); g.ids[i] = String(n.id); g.labels[i] = n.label || '';
    if (n.v_thresh != null) g.thresh[i] = +n.v_thresh;
    if (n.leak != null) { g.leak[i] = +n.leak; if (Math.abs(n.leak - params.leak) > 1e-4) { g.slow = g.slow || new Uint8Array(g.N); g.slow[i] = 1; } }
    if (Array.isArray(n.pos)) { g.pos = g.pos || new Array(g.N).fill(null); g.pos[i] = [+n.pos[0], +n.pos[1]]; }
    if (n.cell_type != null) { g.cellType = g.cellType || new Int16Array(g.N).fill(-1); g.cellType[i] = +n.cell_type; }
    if (n.mix) { g.mix = g.mix || new Uint8Array(g.N); g.mix[i] = 1; }   // v14 mixing cell (feedforward inhibition)
  };
  inputSlot.forEach((n, i) => { if (n) place(n, i); else g.labels[i] = ''; });
  hidden.forEach((n, j) => place(n, spec.nIn + j));
  outSlot.forEach((n, j) => { if (n) place(n, g.nIn + g.nHid + j); });
  const wps = obj.weight_per_synapse != null ? +obj.weight_per_synapse : 0.5;
  let skipped = 0;
  for (const e of obj.edges) {
    const a = idx.get(String(e.pre)), b = idx.get(String(e.post));
    if (a == null || b == null || a < 0 || b < 0) { skipped++; continue; }
    let w;
    if (e.weight != null) w = +e.weight;
    else {
      const sign = INHIB_NT[String(e.nt || e.nt_type || '').toUpperCase()] ? -1 : 1;
      w = sign * (+e.syn_count || 1) * wps;
    }
    g.W[a * g.N + b] += w;
    // plastic if the edge says so; otherwise plastic only in files that carry plasticity
    // genes (older files / plain connectome exports load as fixed synapses)
    g.P[a * g.N + b] = (e.plastic != null ? !!e.plastic : !!obj.plasticity) ? 1 : 0;
    g.C[a * g.N + b] = e.ch != null ? +e.ch : 0;
  }
  g.pl = cleanPl(obj.plasticity);                                     // older files: defaults
  // v3 files list modulator channels; v2 files kept one global modulator inside "plasticity"
  g.ch = Array.isArray(obj.modulators) && obj.modulators.length ? obj.modulators.map(c => Object.assign(defaultChannel(), c)) : channelsFromLegacy(obj.plasticity);
  g.nCh = g.ch.length;
  if (g.pos && g.pos.some(p => !p)) g.pos = null;
  if (obj.prune) g.prune = obj.prune;
  g.locked = !!obj.lock_topology;
  g.skippedEdges = skipped;
  return g;
}
function cellTypeName(g, c) { return c < N_FIXED ? ((g.fixedNames && g.fixedNames[c]) || 'fixed ' + c) : (g.typeInfo && g.typeInfo[c - N_FIXED] ? g.typeInfo[c - N_FIXED].label : 'type ' + (c - N_FIXED)); }
// Any genome -> neurons + edges JSON (developmental genomes are exported as the
// grown network, with the compact recipe attached as "developmental_genome").
function genomeToJSON(g0, meta, env) {
  env = env || currentEnv(); const spec = env.spec;
  const g = phenotype(g0, spec), N = g.N, neurons = [], edges = [];
  const id = i => (g.ids && g.ids[i]) || ('n' + i);
  for (let i = 0; i < N; i++) {
    const n = { id: id(i) };
    if (isInput(g, i)) { n.role = 'input'; n.channel = spec.inputs[i].name; }
    else if (isOutput(g, i)) { n.role = 'output'; n.motor = spec.outputs[i - g.nIn - g.nHid].name; }
    else n.role = 'hidden';
    if (g.labels && g.labels[i]) n.label = g.labels[i];
    if (g.pos) n.pos = g.pos[i];
    if (g.cellType) { n.cell_type = g.cellType[i]; if (!n.label) n.label = cellTypeName(g, g.cellType[i]); }
    n.v_thresh = g.thresh[i];      // full float32 precision so files reload bit-exact
    n.leak = g.leak[i];
    if (g.mix && g.mix[i]) n.mix = 1;
    neurons.push(n);
  }
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const i = a * N + b, w = g.W[i]; if (w !== 0) edges.push({ pre: id(a), post: id(b), weight: w, plastic: !!g.P[i], ch: g.C ? g.C[i] % (g.nCh || 1) : 0 });
  }
  const out = { format: 'spiking-arena-net/v7', environment: env.id, envParams: Object.assign({}, env.P), meta: meta || {}, lock_topology: !!g.locked,
           plasticity: cleanPl(g.pl), modulators: (g.ch || []).slice(0, g.nCh || 1).map(c => { const o = Object.assign({}, c); delete o.srcList; return o; }),
           neurons, edges };
  if (g.prune) out.prune = g.prune;
  if (g0.kind === 'cell' || g0.kind === 'regions') out.developmental_genome = genomeToCompact(g0);
  return out;
}
const LEGACY_MSG = 'This file contains a legacy (non-cellular) brain: direct, recipe-developmental or mushroom-body genomes ' +
  'are no longer supported here. Open it in legacy/index_v4_legacy.html instead.';
// Compact genome encoding for sessions: cellular genomes are stored as their DNA.
function genomeToCompact(g) {
  if (g.kind !== 'cell' && g.kind !== 'regions') throw new Error(LEGACY_MSG);
  const d = cloneCell(g); delete d.fitness; return { kind: g.kind, cell: d };   // v21: 'regions' = multi-region genome
}
function genomeFromCompact(o) {
  if (!o || (o.kind !== 'cell' && o.kind !== 'regions')) throw new Error(LEGACY_MSG);
  return cloneCell(o.cell);
}
// Brain file (v4-v7) -> cellular genome (+ the environment it was made for, if the file says).
function brainFromFile(obj) {
  if (typeof obj === 'string') obj = JSON.parse(obj);
  if (!obj.developmental_genome || (obj.developmental_genome.kind !== 'cell' && obj.developmental_genome.kind !== 'regions')) throw new Error(LEGACY_MSG);
  const env = obj.environment || 'bug';                         // v4-v6 brains were all bug-arena brains
  let envP = obj.envParams || null;
  if (!obj.environment && obj.meta && obj.meta.params) envP = migrateBugParams(obj.meta.params);
  envP = migrateEnvParams(env, envP);
  return { genome: genomeFromCompact(obj.developmental_genome), env, envParams: envP };
}
// v1-v6 sessions kept the bug arena's settings among the engine params.
const BUG_PARAM_KEYS = ['task', 'episodeTicks', 'reversal', 'randomValence', 'nItems', 'eyeRange', 'maxSpeed', 'bumpSensors', 'gyroSensors', 'gyroGain', 'bumpGain',
  'wallMod', 'stuckPenalty', 'energyCost', 'inputGain', 'tonicCurrent', 'motorBias', 'motorGain', 'motorZero'];
// v7 recall brains/sessions: outputs stayed on the old row (v8 puts each output under its symbol)
function migrateEnvParams(env, p) { if (env === 'recall' && p && p.outLayout == null) p = Object.assign({}, p, { outLayout: 'v7' }); return p; }
function migrateBugParams(p) { const o = {}; for (const k of BUG_PARAM_KEYS) if (p && p[k] != null) o[k] = p[k]; return o; }
Object.assign(SpikingArena, { genomeFromJSON, genomeToJSON, cellTypeName, LEGACY_MSG, genomeToCompact, genomeFromCompact, brainFromFile, migrateBugParams, migrateEnvParams, BUG_PARAM_KEYS });
