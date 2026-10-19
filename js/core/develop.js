'use strict';
/* ---------------- 2c. Cellular development (grown by local signalling) ----------------
 * A brain is GROWN in a 2D sheet of tissue (CG x CG grid; x: left -1 .. right +1,
 * y: back -1 .. front +1) by cells that all share ONE genome (like DNA). No backprop,
 * no global blueprint: every decision is local.
 *  1. MORPHOGENS (7 chemicals). Fixed sources: 0 midline, 1 anterior (front edge),
 *     2 sensor cue (emitted by the environment's cue sensors), 3 motor cue (emitted by
 *     the output cells), 6 central zone (a stripe between sensors and outputs).
 *     4 and 5 are emitted by cells themselves (amount = gene expression) and diffuse/decay
 *     on the grid. Decay lengths are genes.
 *  2. GENE REGULATORY NETWORK: each cell has an expression state s (CH_H genes).
 *     Every step: s = tanh(Wg * [local chemicals, s, developmental time, 1]);
 *     outputs o = sigmoid(R * [s, 1]) decide: divide, die, migrate, emit chem 4/5,
 *     become a neuron (and grow an axon), inhibitory?, threshold, plastic?, branching,
 *     an 8-number ADDRESS TAG T ("who I am"), an 8-number SEEK TAG S ("whom my axon
 *     looks for") and 6 guidance weights (attraction(+)/repulsion(-) per chemical).
 *  3. AXON GUIDANCE: growth cones climb the chemical mix their cell chose. Midline rule:
 *     after crossing the midline an axon's midline attraction turns into repulsion
 *     (like netrin/robo in real embryos). A synapse forms when the cone touches a neuron
 *     whose tag matches: strength = scale * dot(S_pre, T_post). Sensors and outputs are
 *     fixed cells placed from the environment's IO SPEC (io.js): every sensor channel has
 *     a tag (0..8) and its axon grows straight back into the tissue; outputs carry the
 *     seek tags 4 or 5. (Bug arena: wall/green/red eyes 0/1/2, bump 3, tonic 6, gyro 8,
 *     wheels 4, speed 5.)
 *  4. NEUROTROPHIC COMPETITION: outputs release a fixed amount of trophic factor, shared
 *     among their inputs by synaptic weight and passed back up the chain; neurons that
 *     receive too little die (no useful output = no survival).
 *  5. ACTIVITY-DEPENDENT REFINEMENT: a juvenile phase of spontaneous waves across the
 *     sensors (spec.juvenile); synapses whose pre and post fire together are strengthened, rarely
 *     co-active ones are pruned (Hebbian).
 *  6. HOMEOSTASIS: during the same phase each neuron nudges its threshold and scales its
 *     incoming synapses toward a target firing rate.
 * The result is an ordinary network (neurons + edges), so everything else (environments,
 * reward-modulated learning, export) works unchanged. Growth is deterministic for a
 * genome + noise seed; params.cellTrophic / cellRefine / cellHomeo switch 4-6 off.
 */
const CG = 24, CH_NCHEM = 7, CH_H = 10, CH_NIN = CH_NCHEM + CH_H + 2, CH_STEPS = 40;
const Y_CENTRAL = -0.65;   // the 'central zone' morphogen comes from a stripe between the sensory zone and the motors
// outputs 32-34 were added in v5: COLL = number of local axon collaterals (0-4), CLEN = their length
// (short = local, long = reaching nearby populations), G6 = guidance weight for the central-zone chemical.
// outputs 35-37 (v6): T8 / S8 = address / seek for the 'gyro' tag (turning sensors), LEAK = slow membrane
// (leak per substep from params.leak up to 0.998 when the output is above 0.1: natural memory cells).
// RECV > 0.5 (v9): the cell is RECEPTIVE to plastic input (only used when cell parameter plastRecv is on):
//   synapses from PLAST cells onto RECV cells are the plastic ones (all other synapses are fixed), and they
//   ignore topographic matching (a broad, learnable projection, like parallel fibres onto Purkinje cells).
const CO = { DIV: 0, DIE: 1, MIG: 2, EM4: 3, EM5: 4, INH: 5, THR: 6, PLAST: 7, AXON: 8, BRANCH: 9, T: 10, S: 18, G: 26, COLL: 32, CLEN: 33, G6: 34, T8: 35, S8: 36, LEAK: 37, PROJ: 38, XSYN: 39, TOPO: 40, BIF: 41, RECV: 42, BIF4: 43, CLAW: 44, MIX: 45 };
// PROJ > 0.5: the main axon is a pure PROJECTION axon (synapses only on motors); local wiring is left to the collaterals.
// XSYN > 0.5 (v7): COMMISSURAL axon: it makes no synapses before it has crossed the midline (like robo3 in
// real embryos), so crossed inhibition reaches the other side instead of being used up locally.
// (v10: on an axon with a delayed split (bifAt), XSYN means: no synapses before the split.)
// TOPO > 0.5 (v8): TOPOGRAPHIC matching. The cell carries a positional label (its x position when it became a
//   neuron; a sensor / output carries its spec 'topo' value, default its x). Synapses between two labelled
//   partners (TOPO cell -> TOPO cell or output; sensor -> TOPO cell) are scaled by exp(-((label_pre - label_post) / topoW)^2): like ephrin/Eph
//   gradient matching in retinotopic maps. Channel i -> cells under it -> output i, for any number of channels.
// BIF > 0.5 (v8): BIFURCATING axon (like cerebellar parallel fibres): the main axon splits into two branches
//   that run in opposite directions along x, so one cell reaches a whole band of tissue (e.g. shared inhibition).
// BIF4 > 0.5 (v10): a delayed-split bifurcating axon (cell parameter bifAt) that is attracted to signal A
//   (guidance G4 > 0) splits where signal A >= bifAt instead of signal B (two different target layers).
// CLAW > 0.5 (v10): CLAW DENDRITES (cerebellar granule cell): of all parallel-fibre synapses the cell received,
//   it keeps only those of ONE source column (one presynaptic topographic label, chosen at random after
//   growth, like a claw that ends up with one mossy-fibre rosette); fibre synapses onto it ignore topography.
//   With its own column's direct input this makes a sparse MIXED-SELECTIVITY (conjunctive) cell.
// MIX > 0.5 (v14): MIXING cell (Kenyon / second-layer granule cell): after growth it keeps the excitatory hidden inputs
//   of only mixK randomly chosen presynaptic cells (cell parameter; 0 = keep all), with a fast membrane (mixLeak) and
//   a fixed input budget (mixNorm), so with a high threshold it fires only for a specific combination of its inputs.
//   The network can give mixing cells feedforward (APL / Golgi-like) inhibition: plasticity gene mixInh.
const tagOut = tag => tag < 8 ? CO.T + tag : CO.T8;
const cellLeak = o => o[CO.LEAK] > 0.1 ? params.leak + (0.998 - params.leak) * (o[CO.LEAK] - 0.1) / 0.9 : 0;
const guideW = (o, k) => 2 * o[k < 6 ? CO.G + k : CO.G6] - 1;
const CH_NO = 46, CHEM_NAMES = ['midline', 'anterior', 'sensor cue', 'motor cue', 'cell signal A', 'cell signal B', 'central zone'];
const CELL_SC = { wIn: [16, 0, 30], wHid: [10, 0, 30], theta: [0.3, 0.05, 2], pDiv: [0.35, 0, 1], maxCells: [120, 4, 400],
  eyeReach: [1.6, 0.2, 2], rIn: [0.2, 0.05, 0.5], rSyn: [0.14, 0.05, 0.4], axonStart: [0.3, 0, 0.9], axonLen: [40, 2, 80],
  trophMin: [0.005, 0, 0.5], trophHid: [0, 0, 1], hebb: [0.2, 0, 1], pruneFrac: [0.1, 0, 0.8], homeoTarget: [0.05, 0.005, 0.3], homeoRate: [1, 0, 5],
  // v8 growth-reliability genes (0 / below 1 = off, so older genomes grow exactly as before):
  //  normE / normI: SYNAPTIC SCALING of total input. Every neuron (hidden and output) scales its excitatory
  //    (inhibitory) inputs from hidden neurons so that they sum to normE (normI) mV, like a fixed dendritic
  //    resource. Then a neuron's drive no longer depends on how many axons happened to find it.
  //  satisfy: GROWTH UNTIL SATISFIED. An axon or collateral that has made no synapse when it reaches its
  //    length keeps growing, up to 'satisfy' x its normal length.
  normE: [0, 0, 80], normI: [0, 0, 160], satisfy: [0, 0, 4],
  topoW: [0, 0, 1],          // width of topographic matching (gene TOPO); 0 = off
  topoSnap: [0, 0, 1],       // > 0.5: INPUT-INSTRUCTED identity: a TOPO cell takes the label of the nearest labelled input
                             //   channel (like a barrel taking the identity of its thalamic input), so columns are discrete
  branchMax: [4, 1, 40],     // synapses per axon branch = 1 + BRANCH x branchMax (v4-v7: 4)
  // v8 HUNGER (need-based attraction; 0 = off). An output (motor) cell with fewer than hungerTarget excitatory
  //   input synapses, or a sensor with fewer than hungerTarget targets, builds up a 'need' (+hungerRate per
  //   developmental step, reset once satisfied). Outputs emit it as an attractant (range hungerLam): growing
  //   excitatory axons are pulled towards needy outputs (gain 'hunger'), and tag matching is relaxed in proportion
  //   to the need (hungerRelax), so orphan outputs get wired. A needy sensor relaxes its tag matching and keeps growing.
  hunger: [0, 0, 3], hungerRate: [0.05, 0, 0.5], hungerTarget: [3, 1, 20], hungerRelax: [0.8, 0, 1], hungerLam: [0.4, 0.1, 2],
  // v8 REQUEST (activity-timed variant; 0 = off): during axon growth, sensors fire spontaneously (separate noise
  //   stream). Cells they reach get a decaying eligibility trace; reqDelay steps later the outputs paired with that
  //   sensor (spec.juvenile.pairs; without pairs: all needy outputs) emit a decaying 'request'. Axons of eligible
  //   cells are pulled towards requesting outputs, and their tag matching is relaxed (gain 'request').
  request: [0, 0, 3], reqDelay: [2, 0, 8], reqDecay: [0.6, 0, 0.95],
  // v27 DEMAND (pure local connection demand; 0 = off, older genomes unchanged). Kept separate from activity (request),
  //   prediction mismatch (teacher plateau), outcome (dopamine) and homeostasis. An output with fewer than demandTarget
  //   excitatory inputs emits an attractant proportional to its CURRENT deficit (1 - inputs/target; no time build-up),
  //   with steady-state diffusion profile exp(-d/demandLam). Excitatory axons are pulled up the gradient (gain 'demand'),
  //   tag matching is relaxed by demandRelax x deficit, and the signal vanishes once the target is satisfied.
  //   A sensor with a target deficit, or an axon with no partner yet while demand remains, keeps exploring (one extension).
  //   With demand on, request no longer falls back to 'outputs below hungerTarget' (that mixed need into the activity signal).
  // DEMAND_SC (v27 default, R28): demand 1 with demandRelax 0 = attraction only (relaxed matching admitted wrong partners early).
  demand: [0, 0, 3], demandStart: [0, 0, 1], demandTarget: [3, 1, 20], demandRelax: [0, 0, 1], demandLam: [0.4, 0.1, 2],
  // v9 (all off by default = older genomes grow exactly as before):
  //  grid: tissue resolution (grid cells per side; 24 before v9). A larger grid gives room for more columns.
  //  plastRecv > 0.5: only synapses from PLAST cells onto RECV cells are plastic (gene RECV), and they are not
  //    topographically matched (broad learnable projection).
  //  bifAt > 0: a bifurcating axon that is attracted to signal B (guidance G5 > 0) grows as a single axon and
  //    only splits into its two parallel fibres when it arrives where signal B >= bifAt (like a granule-cell
  //    axon that ascends and then forms a T in the molecular layer); each branch gets its own synapse budget.
  //    The two parallel fibres make synapses all along their way (no synapse budget).
  //  afferent > 0.5: AFFERENT-DEPENDENT SURVIVAL: RECV cells that receive no sensory (instructive) synapse die.
  grid: [24, 24, 48], plastRecv: [0, 0, 1], bifAt: [0, 0, 2], afferent: [0, 0, 1],
  // v10 (off = 0): membrane and input budget of CLAW cells (gene CLAW), like small electrotonically compact
  //   granule cells: clawLeak = their leak per substep (fast membrane, e.g. 0.5: they respond to the inputs that
  //   are active NOW), clawNorm = their total excitatory input (instead of normE). With a fast membrane a cell
  //   whose total input is split between two sources fires only when both are active: a conjunction.
  //   clawIn = their total excitatory SENSORY input (e.g. a clock gate), independent of how many sensors they reach.
  clawLeak: [0, 0, 0.95], slowLeak: [0, 0, 0.999], clawNorm: [0, 0, 80], clawIn: [0, 0, 80],
  // v11: coneSpeed = growth-cone steps per developmental step (integer, default 1). On a finer grid (e.g. 60) a cone
  //   would otherwise cover only 24/grid of the distance in the same developmental time.
  // v11: bifAt4 = split threshold of BIF4 axons (signal 4); 0 = same as bifAt.
  coneSpeed: [1, 0.5, 4], bifAt4: [0, 0, 3],
  // v14 (off = 0): MIX cells (gene MIX): mixK = how many presynaptic (hidden, excitatory) cells each keeps (random
  //   choice after growth), mixNorm = their total excitatory hidden input, mixLeak = their leak per substep.
  mixK: [0, 0, 20], mixNorm: [0, 0, 80], mixLeak: [0, 0, 0.95] };
function cellDefaults() { const o = {}; for (const k in CELL_SC) o[k] = CELL_SC[k][0]; return o; }
const sigm = x => 1 / (1 + Math.exp(-x));
// v4 / early-v5 cellular genomes (6 chemicals, 8 genes, 32 outputs) are migrated: the new genes,
// inputs and outputs are switched off, so they grow exactly the same brain as before.
function migrateCell(d) {
  if (d.Wg.length === CH_H * CH_NIN && d.R.length === CH_NO * (CH_H + 1)) return d;
  if (d.Wg.length === CH_H * CH_NIN && [35, 39, 40, 42, 43, 45].includes(d.R.length / (CH_H + 1))) {   // v5-v13 -> v14: new outputs, all off
    const R = d.R.slice(); for (let o = d.R.length / (CH_H + 1); o < CH_NO; o++) for (let k = 0; k <= CH_H; k++) R.push(k === CH_H ? -5 : 0);
    return Object.assign({}, d, { R });
  }
  const oH = 8, oNIN = 16, oNO = 32, oNC = 6;
  if (d.Wg.length !== oH * oNIN || d.R.length !== oNO * (oH + 1)) throw new Error('unknown cellular genome layout');
  const col = c => c < oNC ? c : c < oNC + oH ? c + (CH_NCHEM - oNC) : c === oNC + oH ? CH_NCHEM + CH_H : CH_NCHEM + CH_H + 1;
  const Wg = new Array(CH_H * CH_NIN).fill(0), R = new Array(CH_NO * (CH_H + 1)).fill(0);
  for (let g = 0; g < oH; g++) for (let c = 0; c < oNIN; c++) Wg[g * CH_NIN + col(c)] = d.Wg[g * oNIN + c];
  for (let o = 0; o < oNO; o++) { for (let k = 0; k < oH; k++) R[o * (CH_H + 1) + k] = d.R[o * (oH + 1) + k]; R[o * (CH_H + 1) + CH_H] = d.R[o * (oH + 1) + oH]; }
  for (const o of [CO.COLL, CO.CLEN, CO.T8, CO.S8, CO.LEAK, CO.PROJ, CO.XSYN, CO.TOPO, CO.BIF, CO.RECV, CO.BIF4, CO.CLAW, CO.MIX]) R[o * (CH_H + 1) + CH_H] = -5;   // no collaterals; G6 bias 0 = indifferent
  const s0 = d.s0.slice(); while (s0.length < CH_H) s0.push(0);
  const lam = d.lam.slice(); while (lam.length < CH_NCHEM) lam.push(0.3);
  return Object.assign({}, d, { Wg, R, s0, lam });
}
function cloneCell(d) {
  if (d.kind === 'regions') return cloneRegions(d);   // v21: multi-region genome (core/regions.js)
  d = migrateCell(d);
  return { kind: 'cell', seed: d.seed, Wg: d.Wg.slice(), R: d.R.slice(), lam: d.lam.slice(), seeds: d.seeds.map(p => p.slice()),
           s0: d.s0.slice(), sc: Object.assign(cellDefaults(), d.sc), pl: cleanPl(d.pl), nCh: d.nCh || 1,
           ch: (d.ch || [defaultChannel()]).map(c => Object.assign({}, c)), label: d.label || '', fitness: null };
}
function cellParamCount(d) { if (d.kind === 'regions') return d.regions.reduce((s, R) => s + cellParamCount(R.g), 0); return d.Wg.length + d.R.length + d.lam.length + d.seeds.length * 2 + d.s0.length + Object.keys(CELL_SC).length + Object.keys(PL_DEFAULTS).length + d.nCh * 6; }
function createRandomCellGenome(r) {
  const d = createHandCellGenome();
  for (let i = 0; i < d.Wg.length; i++) d.Wg[i] = gauss(r) * 2;
  for (let i = 0; i < d.R.length; i++) d.R[i] = gauss(r) * 2;
  d.lam = d.lam.map(() => 0.2 + r() * 0.8);
  d.seeds = [[-0.2 - r() * 0.6, r() * 1.4 - 0.7]]; d.seeds.push([-d.seeds[0][0], d.seeds[0][1]]);
  d.seed = (r() * 2 ** 31) | 0; d.label = 'random';
  return d;
}
function mutateCell(d, r) {
  if (d.kind === 'regions') { for (const R of d.regions) { mutateCell(R.g, r); if (R.area) for (const k of ['a', 'o', 'b']) if (r() < params.cellMut * 3) R.area[k] += gauss(r); } delete d._ph; delete d._vg; return d; }   // v21: every region's gene program mutates; v29: + area receptor genes
  const pm = params.cellMut, nud = (x, s) => x + gauss(r) * (s + 0.2 * Math.abs(x));
  for (let i = 0; i < d.Wg.length; i++) if (r() < pm) d.Wg[i] = nud(d.Wg[i], 0.5);
  for (let i = 0; i < d.R.length; i++) if (r() < pm) d.R[i] = nud(d.R[i], 0.5);
  for (let i = 0; i < d.lam.length; i++) if (r() < pm * 3) d.lam[i] = clamp(d.lam[i] * Math.exp(gauss(r) * 0.2), 0.05, 2);
  for (const p of d.seeds) if (r() < pm * 3) { p[0] = clamp(p[0] + gauss(r) * 0.05, -0.95, 0.95); p[1] = clamp(p[1] + gauss(r) * 0.05, -0.95, 0.95); }
  for (let i = 0; i < d.s0.length; i++) if (r() < pm) d.s0[i] = clamp(nud(d.s0[i], 0.3), -1, 1);
  for (const k in CELL_SC) if (r() < pm * 3) { const [, lo, hi] = CELL_SC[k]; d.sc[k] = clamp(d.sc[k] + gauss(r) * (hi - lo) * 0.05, lo, hi); }
  if (r() < 0.02) d.seed = (r() * 2 ** 31) | 0;           // different developmental noise
  mutatePlasticityGenes(d, r, params.mutRate);
  delete d._ph; delete d._vg;
  return d;
}
function crossCell(a, b, r) {
  if (a.kind === 'regions') { const c = cloneRegions(a); if (b.kind === 'regions' && b.regions.length === a.regions.length) c.regions.forEach((R, k) => { R.g = crossCell(a.regions[k].g, b.regions[k].g, r); }); return c; }
  if (b.kind === 'regions') return cloneCell(a);
  const c = cloneCell(a), H = CH_H;
  for (let g = 0; g < H; g++) if (r() < 0.5) for (let k = 0; k < CH_NIN; k++) c.Wg[g * CH_NIN + k] = b.Wg[g * CH_NIN + k];
  for (let o = 0; o < CH_NO; o++) if (r() < 0.5) for (let k = 0; k <= H; k++) c.R[o * (H + 1) + k] = b.R[o * (H + 1) + k];
  return c;
}
// ---- growth ----
// The network a genome produces for an IO spec (cached per spec for developmental genomes).
function phenotype(g, spec) {
  if (g.kind !== 'cell' && g.kind !== 'regions') return g;
  spec = spec || currentEnv().spec;
  if (!g._ph || g._ph.specKey !== spec.key) Object.defineProperty(g, '_ph', { value: growCell(g, { spec }), writable: true, configurable: true, enumerable: false });
  return g._ph;
}
// opts: { seed (developmental noise; default the genome's own), spec (IO spec; default current env), record }
function growCell(d, opts) {
  if (d.kind === 'regions') return growRegions(d, opts);   // v21 multi-region genome (regions.js)
  opts = opts || {};
  const spec = opts.spec || currentEnv().spec, IN = spec.inputs, OUT = spec.outputs, nIn = IN.length, nOut = OUT.length;
  const t0 = nowMs();
  // v18 (round 19): the development RECORDER (opts.record) is passive: it only copies state, never draws random numbers
  //   or changes a decision, so a recorded growth is bit-identical to an unrecorded one. It stores events / deltas
  //   (cell moves and fate changes, synapse formation and removal, deaths), quantized cell-emitted chemicals per step and
  //   int8 gene-expression histories, plus the post-growth stages (selection, trophic competition, juvenile activity, pruning).
  const rec = opts.record ? { v: 2, deaths: [], fixedChem: null, dynQ: [], dynMax: [], synA: [] } : null;
  const r = mulberry32((opts.seed != null ? opts.seed : d.seed) >>> 0), sc = Object.assign(cellDefaults(), d.sc);
  const GS = sc.grid > 24.5 ? Math.round(sc.grid) : CG, h = 2 / GS, NS = GS * GS, H = CH_H;
  const sx = i => -1 + (i + 0.5) * h, cidx = v => clamp(Math.floor((v + 1) / h), 0, GS - 1);
  // fixed morphogen fields (analytic steady state of diffusion + decay from the sources)
  const lam = d.lam, chem = Array.from({ length: CH_NCHEM }, () => new Float32Array(NS));
  const eyes = spec.cueSources, motors = OUT.map(o => o.pos);
  for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) {
    const x = sx(i), y = sx(j), q = j * GS + i;
    chem[0][q] = Math.exp(-Math.abs(x) / lam[0]);
    chem[1][q] = Math.exp(-(1 - y) / lam[1]);
    let e = 0; for (const p of eyes) e = Math.max(e, Math.exp(-Math.hypot(x - p[0], y - p[1]) / lam[2])); chem[2][q] = e;
    let m = 0; for (const p of motors) m = Math.max(m, Math.exp(-Math.hypot(x - p[0], y - p[1]) / lam[3])); chem[3][q] = m;
    chem[6][q] = Math.exp(-Math.abs(y - Y_CENTRAL) / lam[6]);
  }
  if (rec) rec.fixedChem = [0, 1, 2, 3, 6].map(k => Float32Array.from(chem[k]));
  const coneSpeed = Math.max(1, Math.round(sc.coneSpeed || 1));   // v11: growth-cone steps per developmental step (fine grids: same distances in the same time)
  const difBuf = new Float32Array(NS), srcBuf = new Float32Array(NS), Dif = 0.2, kDec = [4, 5].map(c => Dif * (h / lam[c]) ** 2);
  // cells
  const cells = [], occ = new Int32Array(NS).fill(-1); let nAliveCells = 0;   // (v11: counted, not recounted per division)
  const newCell = (i, j, s, parent) => {
    const c = { id: cells.length, i, j, s: Float32Array.from(s), o: new Float32Array(CH_NO), alive: true, neuron: false, cone: null, parent, born: -1 };
    if (rec) c.rec = { moves: [], ev: [], sH: new Int8Array(CH_STEPS * CH_H), died: -1, cause: '', neuronAt: -1, lx: NaN, ly: NaN, lk: -1, s: null, o: null };
    cells.push(c); occ[j * GS + i] = c.id; nAliveCells++; return c;
  };
  // params.cellMirror: bilateral symmetry IMPOSED (every random decision of a left cell is copied,
  // mirrored, to its right twin), otherwise the two sides develop independently (noisy).
  const mirror = !!params.cellMirror, HALF = GS / 2;
  const mi = i => GS - 1 - i;
  for (const p of d.seeds) {
    const x = mirror ? -Math.abs(p[0]) : p[0], i = cidx(x), j = cidx(p[1]);
    if (occ[j * GS + i] >= 0) continue;
    const c = newCell(i, j, d.s0, -1);
    if (mirror && occ[j * GS + mi(i)] < 0) { const t = newCell(mi(i), j, d.s0, -1); c.twin = t; t.twin = c; t.isTwin = true; }
  }
  const u = new Float32Array(CH_NIN), sNew = new Float32Array(H), Wg = d.Wg, R = d.R, nRO = Math.min(CH_NO, Math.floor(R.length / (H + 1)));   // (older genomes: missing outputs stay 0 = off)
  const express = (c, tf) => {
    const q = c.j * GS + c.i;
    for (let k = 0; k < CH_NCHEM; k++) u[k] = Math.min(2, chem[k][q]);
    for (let k = 0; k < H; k++) u[CH_NCHEM + k] = c.s[k];
    u[CH_NCHEM + H] = tf; u[CH_NCHEM + H + 1] = 1;
    for (let g = 0; g < H; g++) { let a = 0; const o = g * CH_NIN; for (let k = 0; k < CH_NIN; k++) a += Wg[o + k] * u[k]; sNew[g] = Math.tanh(a); }
    c.s.set(sNew);
    for (let o = 0; o < nRO; o++) { let a = R[o * (H + 1) + H]; const b = o * (H + 1); for (let k = 0; k < H; k++) a += R[b + k] * sNew[k]; c.o[o] = sigm(a); }
  };
  const guideAt = (q, g, crossed) => {          // guidance potential at a grid site
    let p = 0; for (let k = 0; k < CH_NCHEM; k++) { let w = g[k]; if (k === 0 && crossed) w = -Math.abs(w); p += w * chem[k][q]; } return p;
  };
  const ZERO_G = new Array(CH_NCHEM).fill(0);
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const synSet = new KeySet(), syns = [];      // {pre (cell id or 'sensor index'), post, w, plastic, t}   (R66: typed hash set, same membership as a Set)
  // sensor growth cones (fixed behaviour: grow straight back, fixed tags)
  const cones = [];
  const sensorCone = (inputIdx, x, y, tag) => cones.push({ sensor: true, pre: -1 - inputIdx, x, y, dx: 0, dy: -1, len: 0, maxLen: Math.round(sc.eyeReach / h),
    nsyn: 0, maxSyn: 1e9, tag, g: [0, -1, 0, 0, 0, 0, 0], crossed: false, side: 0, rad: sc.rIn, path: rec ? [x, y, 0] : null, done: false, started: false });
  // sensor axons start where the spec puts them (in spec.coneOrder: the order matters for the noise stream);
  // channels with ownRng draw their noise from a separate stream (added later without disturbing old genomes)
  const rgOwn = mulberry32(((opts.seed != null ? opts.seed : d.seed) ^ 0x5bd1e995) >>> 0);
  for (const i of spec.coneOrder) { const c = IN[i]; sensorCone(i, c.at[0], c.at[1], c.tag); if (c.ownRng) cones[cones.length - 1].rng = rgOwn; }
  if (mirror) {   // sensor twins (spec 'mirror'); midline sensors get no sideways noise
    const byIdx = new Map(cones.map(c => [-1 - c.pre, c]));
    IN.forEach((c, i) => { if (c.mirror != null && c.mirror > i) { const a = byIdx.get(i), b = byIdx.get(c.mirror); a.twin = b; b.isTwin = true; }
                           if (c.midline) byIdx.get(i).midline = true; });
  }
  // topographic labels (gene TOPO, width sc.topoW)
  const recvOn = sc.plastRecv > 0.5;
  const topoOn = sc.topoW > 0.005, inLabel = IN.map(c => c.topo != null ? c.topo : c.at[0]), outLabel = OUT.map(c => c.topo != null ? c.topo : c.pos[0]);
  const topoMatch = (a, b) => Math.exp(-(((a - b) / sc.topoW) ** 2));
  const snapLabels = IN.filter(c => c.topo != null).map(c => c.topo);
  // v20 plan constant topoOut (not mutated; absent = off): labels also snap to the OUTPUT labels, so action columns form under
  // every output even where no input channel sits (actor of plan rewardK: K arms, C contexts)
  if (sc.topoOut > 0.5) for (const c of OUT) if (c.topo != null && !snapLabels.includes(c.topo)) snapLabels.push(c.topo);
  const cellLabel = x => { if (sc.topoSnap <= 0.5 || !snapLabels.length) return x; let b = snapLabels[0]; for (const l of snapLabels) if (Math.abs(l - x) < Math.abs(b - x)) b = l; return b; };
  const outOrder = OUT.map((o, m) => m), outMirror = OUT.map((o, m) => o.mirror != null ? o.mirror : m);
  // hunger / request state (genes hunger, request; UI toggles params.cellHunger, params.cellRequest)
  const hungOn = sc.hunger > 0 && params.cellHunger !== false, reqOn = sc.request > 0 && params.cellRequest !== false;
  const needOut = new Float32Array(nOut), outIn = new Int32Array(nOut), needIn = new Float32Array(nIn);
  const req = new Float32Array(nOut), elig = new Map(), reqQueue = [], pairs = (spec.juvenile && spec.juvenile.pairs) || null;
  const rgReq = mulberry32(((opts.seed != null ? opts.seed : d.seed) ^ 0x3c6ef372) >>> 0);
  const reqInputs = spec.juvenile ? [].concat(...spec.juvenile.waves) : [];
  let hungerSyn = 0;
  const demOn = sc.demand > 0 && params.cellDemand !== false, dT = Math.max(1, sc.demandTarget || 3);
  let demLive = false;   // v27: demand switches on at tf >= demandStart (after tag-guided wiring had its chance)
  const defOut = m => demOn && demLive ? Math.max(0, 1 - outIn[m] / dT) : 0;
  let demandSyn = 0, defLeft = () => { for (let m = 0; m < nOut; m++) if (outIn[m] < dT) return true; return false; };
  const pullOf = (cn, m) => (hungOn ? sc.hunger * Math.min(2, needOut[m]) : 0) + (reqOn && !cn.sensor ? sc.request * (elig.get(cn.pre) || 0) * req[m] : 0);
  const motBox = [Math.min(...motors.map(p => p[0])), Math.max(...motors.map(p => p[0])), Math.min(...motors.map(p => p[1])), Math.max(...motors.map(p => p[1]))];
  const masks = new Map(), reachMask = (rad, rr) => { let m = masks.get(rad); if (m) return m;   // v11: offsets that can be within rad
    m = new Uint8Array((2 * rr + 1) ** 2); const rh = rad / h;
    for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) { const ea = Math.max(0, Math.abs(a) - 0.5), eb = Math.max(0, Math.abs(b) - 0.5);
      m[(a + rr) * (2 * rr + 1) + b + rr] = ea * ea + eb * eb <= rh * rh * 1.0001 + 1e-9 ? 1 : 0; }
    masks.set(rad, m); return m; };
  const tryTargets = (cn, t) => {
    const ci = cidx(cn.x), cj = cidx(cn.y), rr = Math.ceil(cn.rad / h), preCell = cn.sensor ? null : cells[cn.pre];
    const S = cn.sensor ? null : preCell.o;
    const topoPre = topoOn && preCell && preCell.o[CO.TOPO] > 0.5, sLab = cn.sensor ? inLabel[-1 - cn.pre] : 0;
    const rad2hi = cn.rad * cn.rad * (1 + 1e-9), rad2lo = cn.rad * cn.rad * (1 - 1e-9);
    const make = (postKey, score, postCell, needy) => {
      const key = (cn.pre + nIn) * 65536 + (typeof postKey === 'number' ? postKey : 65000 + +postKey.slice(1)); if (synSet.has(key)) return; synSet.add(key);   // numeric key (v11; was 'pre:post')
      if (needy) { score = Math.max(score, sc.theta); if (needy === 'd') demandSyn++; else hungerSyn++; }    // admitted through relaxed matching: normal strength
      let w, plastic;
      if (cn.sensor) { w = (sc.wDiffuse > 0 && IN[-1 - cn.pre].diffuse ? sc.wDiffuse : sc.wIn) * score;   // v20 plan constant wDiffuse (absent = wIn): weight of broadcast (diffuse) inputs
        plastic = postCell && !recvOn ? postCell.o[CO.PLAST] > 0.5 : false; }
      else { w = sc.wHid * score * (preCell.o[CO.INH] > 0.5 ? -1 : 1); plastic = preCell.o[CO.PLAST] > 0.5 && (!recvOn || (!!postCell && postCell.o[CO.RECV] > 0.5)); }
      syns.push(cn.fibre ? { pre: cn.pre, post: postKey, w, plastic, t, fibre: true } : { pre: cn.pre, post: postKey, w, plastic, t }); cn.nsyn++;
      if (typeof postKey === 'string' && w > 0) outIn[+postKey.slice(1)]++;
      if (rec) { syns[syns.length - 1].ri = rec.synA.length / 7; rec.synA.push(cn.pre, typeof postKey === 'number' ? postKey : -1 - +postKey.slice(1), t, cn.x, cn.y, w, plastic ? 1 : 0); }
    };
    if (!(cn.proj || (cn.xsyn && !cn.crossed)))   // (such cones make no synapses on cells; v11: the scan is skipped)
    for (let dj = -rr, mq = 0, mask = reachMask(cn.rad, rr); dj <= rr && cn.nsyn < cn.maxSyn; dj++) { mq = (dj + rr) * (2 * rr + 1);
      for (let dd = -rr; dd <= rr && cn.nsyn < cn.maxSyn; dd++) {
      if (!mask[mq + dd + rr]) continue;   // site certainly out of reach
      const di = cn.isTwin ? -dd : dd, i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= GS || j >= GS) continue;
      const id = occ[j * GS + i]; if (id < 0) continue; const c = cells[id];
      if (cn.proj || (cn.xsyn && !cn.crossed)) break;
      if (!c.neuron || (!cn.sensor && id === cn.pre)) continue;
      { const ex = sx(i) - cn.x, ey = sx(j) - cn.y, d2 = ex * ex + ey * ey;   // squared-distance prefilter; exact hypot only near the edge
        if (d2 > rad2hi || (d2 >= rad2lo && Math.hypot(ex, ey) > cn.rad)) continue; }
      let score;
      if (cn.sensor) score = c.o[tagOut(cn.tag)];
      else { const co = c.o; score = 0; for (let k = 0; k < 8; k++) score += S[CO.S + k] * co[CO.T + k];
        if (S[CO.S8] > 0.05) score += S[CO.S8] * co[CO.T8]; }
      if (topoOn && c.o[CO.TOPO] > 0.5 && ((cn.sensor && !IN[-1 - cn.pre].diffuse) || topoPre) && !(recvOn && !cn.sensor && S[CO.PLAST] > 0.5 && c.o[CO.RECV] > 0.5) && !(cn.fibre && c.o[CO.CLAW] > 0.5)) score *= topoMatch(cn.sensor ? sLab : preCell.topo, c.topo);   // both sides carry labels
      if (score > sc.theta) make(id, score, c);
      else if (cn.sensor && demOn && demLive && cn.nsyn < dT && score > sc.theta * (1 - Math.min(1, (sc.demandRelax || 0) * (1 - cn.nsyn / dT)))) make(id, score, c, 'd');
      else if (cn.sensor && hungOn && needIn[-1 - cn.pre] > 0 && score > sc.theta * (1 - Math.min(1, sc.hungerRelax * needIn[-1 - cn.pre]))) make(id, score, c, true);
    } }
    const Rm = Math.max(cn.rad, 0.2) * (1 + 1e-9);   // v11: skip the output scan when every output is certainly out of reach
    if (!cn.sensor && !cn.coll && !(cn.xsyn && !cn.crossed) && !(cn.y - motBox[3] > Rm || motBox[2] - cn.y > Rm || cn.x - motBox[1] > Rm || motBox[0] - cn.x > Rm))
    for (const m of (cn.isTwin ? outMirror : outOrder)) { if (cn.nsyn >= cn.maxSyn) break;    // fixed output targets (seek tag = output's tag)
      { const ex = motors[m][0] - cn.x, ey = motors[m][1] - cn.y, d2 = ex * ex + ey * ey, R = Math.max(cn.rad, 0.2);   // squared prefilter (v11)
        if (d2 > R * R * (1 + 1e-9) || (d2 >= R * R * (1 - 1e-9) && Math.hypot(ex, ey) > R)) continue; }
      const score = S[CO.S + OUT[m].tag] * (topoPre ? topoMatch(preCell.topo, outLabel[m]) : 1); if (score > sc.theta) { make('m' + m, score, null); continue; }
      if ((hungOn || reqOn) && S[CO.INH] <= 0.5) {                  // needy / requesting output: relaxed matching (excitatory axons only)
        const relax = Math.min(1, (hungOn ? sc.hungerRelax * needOut[m] : 0) + (reqOn ? Math.min(1, sc.request * (elig.get(cn.pre) || 0) * req[m]) : 0));
        if (relax > 0 && score > sc.theta * (1 - relax)) { make('m' + m, score, null, true); continue; }
      }
      if (demOn && S[CO.INH] <= 0.5) { const dr = Math.min(1, (sc.demandRelax || 0) * defOut(m)); if (dr > 0 && score > sc.theta * (1 - dr)) make('m' + m, score, null, 'd'); }
    }
  };
  const growCone = (cn, t, nx, ny) => {
    const ci = cidx(cn.x), cj = cidx(cn.y), q = cj * GS + ci;
    const P = (i, j) => guideAt(clamp(j, 0, GS - 1) * GS + clamp(i, 0, GS - 1), cn.g, cn.crossed);
    let gx = (P(ci + 1, cj) - P(ci - 1, cj)) / 2, gy = (P(ci, cj + 1) - P(ci, cj - 1)) / 2;
    if (ci === 0 || ci === GS - 1) gx *= 2; if (cj === 0 || cj === GS - 1) gy *= 2;
    const gn = Math.hypot(gx, gy);
    let dx = cn.dx * 0.4, dy = cn.dy * 0.4;
    if (gn > 1e-6) { dx += 0.6 * gx / gn; dy += 0.6 * gy / gn; }
    dx += nx; dy += ny;
    if (cn.bifPending && chem[cn.bifChem || 5][q] >= (cn.bifChem === 4 && sc.bifAt4 > 0 ? sc.bifAt4 : sc.bifAt)) {   // (v11: bifAt4 = own threshold for BIF4 axons)   // arrived in the target layer: T-shaped split into two parallel fibres
      cn.bifPending = false; cn.bif = -1; cn.nsyn = 0; cn.fibre = true; cn.maxSyn = 1e9; cn.maxLen = cn.len + Math.round(sc.axonLen);
      if (cn.xsyn) cn.crossed = true;   // v10: a commissural (XSYN) axon with a delayed split makes its first synapses on its fibres
      const c2 = Object.assign({}, cn, { bif: 1, path: cn.path ? [cn.x, cn.y, t] : null }); cones.push(c2);
    }
    if (cn.bif) dx += cn.bif;                    // bifurcated branch: keeps running along x
    if ((hungOn || reqOn) && !cn.sensor && !cn.coll && cells[cn.pre].o[CO.INH] <= 0.5) {   // attraction to needy / requesting outputs
      for (let m = 0; m < nOut; m++) { const a = pullOf(cn, m); if (a <= 0) continue;
        const ex = motors[m][0] - cn.x, ey = motors[m][1] - cn.y, dd = Math.hypot(ex, ey) || 1e-6, f = a * Math.exp(-dd / sc.hungerLam) / dd;
        dx += f * ex; dy += f * ey; }
    }
    if (demOn && !cn.sensor && !cn.coll && cells[cn.pre].o[CO.INH] <= 0.5) {   // v27: climb the demand attractant of under-connected outputs
      for (let m = 0; m < nOut; m++) { const a = sc.demand * defOut(m); if (a <= 0) continue;
        const ex = motors[m][0] - cn.x, ey = motors[m][1] - cn.y, dd = Math.hypot(ex, ey) || 1e-6, f = a * Math.exp(-dd / (sc.demandLam || 0.4)) / dd;
        dx += f * ex; dy += f * ey; }
    }
    const n = Math.hypot(dx, dy) || 1; cn.dx = dx / n; cn.dy = dy / n;
    const L = cn.sensor ? h : 1.5 * h;
    cn.x = clamp(cn.x + cn.dx * L, -1 + h / 2, 1 - h / 2); cn.y = clamp(cn.y + cn.dy * L, -1 + h / 2, 1 - h / 2);
    if (!cn.crossed && cn.side !== 0 && Math.sign(cn.x) === -cn.side && Math.abs(cn.x) > h / 2) cn.crossed = true;
    cn.len++; if (cn.path) cn.path.push(cn.x, cn.y, t);
    tryTargets(cn, t);
    if (cn.nsyn >= cn.maxSyn) cn.done = true;
    else if (cn.len >= cn.maxLen) {
      if (!cn.sensor && cn.nsyn === 0 && sc.satisfy >= 1 && !cn.extended) { cn.extended = true; cn.maxLen = Math.round(cn.maxLen * sc.satisfy); if (cn.len >= cn.maxLen) cn.done = true; }
      else if (demOn && !cn.extended && !cn.coll && demLive && (cn.sensor ? cn.nsyn < dT : cn.nsyn === 0 && defLeft())) { cn.extended = true; cn.maxLen += Math.round(cn.maxLen * Math.min(1, sc.demand)); }   // v27: unpartnered source keeps exploring while demand remains
      else if (cn.sensor && hungOn && cn.nsyn < sc.hungerTarget && !cn.extended) { cn.extended = true; cn.maxLen += Math.round(cn.maxLen * Math.min(1, sc.hunger)); }   // under-used sensor keeps growing
      else cn.done = true;
    }
  };
  const kill = (c, t, cause) => { if (c.alive) nAliveCells--; c.alive = false; occ[c.j * GS + c.i] = -1; if (c.cone) c.cone.done = true;
    if (rec) { rec.deaths.push({ id: c.id, t, cause, x: sx(c.i), y: sx(c.j) }); c.rec.died = t; c.rec.cause = cause; c.rec.s = Float32Array.from(c.s); c.rec.o = Float32Array.from(c.o); } };
  const T = CH_STEPS; let apoptosis = 0;
  for (let t = 0; t < T; t++) {
    const tf = t / T;
    const order = cells.filter(c => c.alive);
    for (const c of order) express(c, tf);
    const nAlive = () => nAliveCells;
    const freeSite = (i, j) => i >= 0 && j >= 0 && i < GS && j < GS && occ[j * GS + i] < 0 && (!mirror || (i < HALF && occ[j * GS + mi(i)] < 0));
    const moveTo = (c, i, j) => { occ[c.j * GS + c.i] = -1; c.i = i; c.j = j; occ[j * GS + i] = c.id; };
    for (const c of order) {
      if (!c.alive || c.neuron || c.isTwin) continue;        // twins copy their left partner's decisions
      const o = c.o, tw = mirror ? c.twin : null;
      if (o[CO.DIE] > 0.5 && r() < (o[CO.DIE] - 0.5)) { kill(c, t, 'apoptosis'); apoptosis++; if (tw && tw.alive) { kill(tw, t, 'apoptosis'); apoptosis++; } continue; }
      if (o[CO.DIV] > 0.5 && r() < sc.pDiv * (o[CO.DIV] - 0.5) * 2 && nAlive() < sc.maxCells) {
        const free = N8.map(([a, b]) => [c.i + a, c.j + b]).filter(([i, j]) => freeSite(i, j));
        if (free.length) {
          const [i, j] = free[(r() * free.length) | 0], noise = Array.from({ length: H }, (_, k) => k < 8 ? gauss(r) * 0.02 : 0);   // (8: keeps old genomes' random stream)
          const dc = newCell(i, j, c.s, c.id); dc.born = t; for (let k = 0; k < H; k++) dc.s[k] += noise[k];
          if (tw && tw.alive) { const dt = newCell(mi(i), j, tw.s, tw.id); dt.born = t; for (let k = 0; k < H; k++) dt.s[k] += noise[k]; dc.twin = dt; dt.twin = dc; dt.isTwin = true; }
        }
      } else if (o[CO.MIG] > 0.5) {
        const g = []; for (let k = 0; k < CH_NCHEM; k++) g.push(guideW(o, k));
        let best = null, bp = guideAt(c.j * GS + c.i, g, false);
        for (const [a, b] of N8) { const i = c.i + a, j = c.j + b; if (!freeSite(i, j)) continue;
          const p = guideAt(j * GS + i, g, false); if (p > bp) { bp = p; best = [i, j]; } }
        if (best) { moveTo(c, best[0], best[1]); if (tw && tw.alive) moveTo(tw, mi(best[0]), best[1]); }
      }
      if (o[CO.AXON] > 0.5) for (const n of (tw && tw.alive ? [c, tw] : [c])) {   // become a neuron (post-mitotic) and sprout an axon
        n.neuron = true;
        const x = sx(n.i), y = sx(n.j);
        n.cone = { sensor: false, proj: n.o[CO.PROJ] > 0.5, xsyn: n.o[CO.XSYN] > 0.5, pre: n.id, x, y, dx: 0, dy: 0, len: 0, maxLen: Math.round(sc.axonLen), nsyn: 0, maxSyn: 1 + Math.floor(n.o[CO.BRANCH] * sc.branchMax),
                   tag: -1, g: null, crossed: false, side: Math.sign(x) || 1, rad: sc.rSyn, path: rec ? [x, y, t] : null, done: false, isTwin: !!n.isTwin };
        cones.push(n.cone); n.topo = cellLabel(x);
        if (n.o[CO.BIF] > 0.5 && sc.bifAt > 0 && n.o[CO.BIF4] > 0.5 && guideW(n.o, 4) > 0) { n.cone.bifPending = true; n.cone.bifChem = 4; }   // splits on arrival in signal A (v10)
        else if (n.o[CO.BIF] > 0.5 && sc.bifAt > 0 && guideW(n.o, 5) > 0) n.cone.bifPending = true;   // splits on arrival (v9)
        else if (n.o[CO.BIF] > 0.5) {                            // bifurcating axon: a second branch, both run along x
          n.cone.bif = n.isTwin ? 1 : -1; n.cone2 = Object.assign({}, n.cone, { bif: -n.cone.bif, path: rec ? [x, y, t] : null }); cones.push(n.cone2);
        }
        const nColl = Math.min(4, Math.floor(n.o[CO.COLL] * 5)), cLen = 2 + Math.round(n.o[CO.CLEN] * 10);
        for (let b = 0; b < nColl; b++) {                        // local axon collaterals (random directions, no guidance)
          const a = r() * Math.PI * 2;
          cones.push({ sensor: false, coll: true, pre: n.id, x, y, dx: Math.cos(a), dy: Math.sin(a), len: 0, maxLen: cLen, nsyn: 0, maxSyn: 1 + Math.floor(n.o[CO.BRANCH] * sc.branchMax),
                       tag: -1, g: ZERO_G, crossed: false, side: Math.sign(x) || 1, rad: sc.rSyn, path: rec ? [x, y, t] : null, done: false, isTwin: false });
        }
      }
      if (tw && c.cone && tw.cone) { c.cone.twin = tw.cone; if (c.cone2 && tw.cone2) c.cone2.twin = tw.cone2; }
    }
    // cell-emitted chemicals: sources + explicit diffusion/decay
    for (let ch = 4; ch <= 5; ch++) {
      const c4 = chem[ch], src = srcBuf.fill(0), oi = ch === 4 ? CO.EM4 : CO.EM5, kd = kDec[ch - 4];
      let any = false;
      for (const c of cells) if (c.alive && c.o[oi] > 0.1) { src[c.j * GS + c.i] = c.o[oi] * 0.2; any = true; }
      if (!any) { let mx = 0; for (let q = 0; q < NS; q++) if (c4[q] > mx) mx = c4[q]; if (mx < 1e-6) continue; }   // nothing to diffuse
      for (let it = 0; it < 3; it++) {
        const nx = difBuf;
        for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) {
          const q = j * GS + i, v = c4[q];
          const lap = (i > 0 ? c4[q - 1] : v) + (i < GS - 1 ? c4[q + 1] : v) + (j > 0 ? c4[q - GS] : v) + (j < GS - 1 ? c4[q + GS] : v) - 4 * v;
          nx[q] = Math.max(0, v + Dif * lap - kd * v + src[q]);
        }
        c4.set(nx);
      }
    }
    // axon growth
    const prep = cn => { if (cn.done) return false;
      if (!cn.sensor) { const c = cells[cn.pre]; if (!c.alive) { cn.done = true; return false; }
        if (cn.coll) return true;
        const G = cn.gOwn === cn.g && cn.g ? cn.g : (cn.gOwn = cn.g = new Array(CH_NCHEM)); for (let k = 0; k < CH_NCHEM; k++) G[k] = guideW(c.o, k); if (!cn.fibre) cn.maxSyn = 1 + Math.floor(c.o[CO.BRANCH] * sc.branchMax); }
      return true; };
    if ((hungOn || reqOn) && tf >= sc.axonStart) {               // needs, spontaneous sensor events, requests
      if (hungOn) {
        for (let m = 0; m < nOut; m++) needOut[m] = outIn[m] < sc.hungerTarget ? needOut[m] + sc.hungerRate : 0;
        for (const cn of cones) if (cn.sensor) { const i = -1 - cn.pre; needIn[i] = cn.nsyn < sc.hungerTarget ? needIn[i] + sc.hungerRate : 0; }
      }
      if (reqOn) {
        for (const [k, v] of elig) { const nv = v * sc.reqDecay; if (nv < 0.01) elig.delete(k); else elig.set(k, nv); }
        for (let m = 0; m < nOut; m++) req[m] *= sc.reqDecay;
        if (reqInputs.length) {
          const i = reqInputs[(rgReq() * reqInputs.length) | 0], hit = new Set();
          for (const s of syns) if (s.pre === -1 - i && typeof s.post === 'number' && cells[s.post].alive) { hit.add(s.post); elig.set(s.post, 1); }
          for (const s of syns) if (s.pre >= 0 && hit.has(s.pre) && s.w > 0 && typeof s.post === 'number' && !hit.has(s.post)) elig.set(s.post, Math.max(elig.get(s.post) || 0, 0.5));
          reqQueue.push([t + Math.round(sc.reqDelay), i]);
        }
        while (reqQueue.length && reqQueue[0][0] <= t) { const [, i] = reqQueue.shift();
          if (pairs) { for (const [a, m] of pairs) if (a === i) req[m] += 1; }
          else for (let m = 0; m < nOut; m++) if (demOn || outIn[m] < sc.hungerTarget) req[m] += 1; }
      }
    }
    demLive = tf >= (sc.demandStart || 0);
    if (tf >= sc.axonStart) for (let cs = 0; cs < coneSpeed; cs++) for (const cn of cones) {
      if (mirror && cn.isTwin) continue;                         // grown together with its left partner
      const rr_ = cn.rng || r, nx = cn.midline ? 0 : gauss(rr_) * 0.12, ny = gauss(rr_) * 0.12;
      if (prep(cn)) growCone(cn, t, nx, ny);
      if (mirror && cn.twin && prep(cn.twin)) growCone(cn.twin, t, -nx, ny);
    }
    if (rec) {   // deltas only: a cell's position / fate is stored when it changes; expression as int8; chemicals 4 and 5 as uint8 x max
      for (const c of cells) { if (!c.alive) continue; const R = c.rec, x = sx(c.i), y = sx(c.j);
        if (R.lx !== x || R.ly !== y) { R.moves.push(t, x, y); R.lx = x; R.ly = y; }
        const cl = cellClass(c.o), ne = c.neuron ? 1 : 0, ih = c.o[CO.INH] > 0.5 ? 1 : 0, key = cl * 4 + ne * 2 + ih;
        if (R.lk !== key) { R.ev.push(t, cl, ne, ih); R.lk = key; if (ne && R.neuronAt < 0) R.neuronAt = t; }
        for (let k = 0; k < H; k++) R.sH[t * H + k] = Math.round(clamp(c.s[k], -1, 1) * 127); }
      const q = new Uint8Array(2 * NS), mx = [0, 0];
      for (let a = 0; a < 2; a++) { const f = chem[4 + a]; for (let k = 0; k < NS; k++) if (f[k] > mx[a]) mx[a] = f[k]; const sc_ = mx[a] > 0 ? 255 / mx[a] : 0; for (let k = 0; k < NS; k++) q[a * NS + k] = Math.round(f[k] * sc_); }
      rec.dynQ.push(q); rec.dynMax.push(mx);
    }
  }
  // ---- build: surviving neurons ----
  let neurons = cells.filter(c => c.alive && c.neuron);
  const synOf = s => typeof s.post === 'number' ? s.post : s.post;
  let live = syns.filter(s => (s.pre < 0 || cells[s.pre].alive) && (typeof s.post !== 'number' || cells[s.post].alive));
  // recorder: synapse ends (t = removal time, why: 1 claw selection, 2 mixing selection, 3 partner lost afferents, 4 partner lost trophic competition, 5 Hebbian pruning)
  const synEnd = rec ? new Float32Array(rec.synA.length / 7).fill(-1) : null, synWhy = rec ? new Uint8Array(rec.synA.length / 7) : null;
  const markGone = (before, after, t, why) => { if (!rec) return; const keep = new Set(after); for (const s of before) if (!keep.has(s) && s.ri != null && synEnd[s.ri] < 0) { synEnd[s.ri] = t; synWhy[s.ri] = why; } };
  // claw dendrites (v10): a CLAW cell keeps the parallel-fibre synapses of one source column only
  let clawFibreCells = null, clawFed = null;
  if (neurons.some(c => c.o[CO.CLAW] > 0.5)) {
    // (all synapses, fibre or collateral, from cells that send fibres to claw cells count: one source column survives)
    const rc = mulberry32(((opts.seed != null ? opts.seed : d.seed) ^ 0x2545f491) >>> 0), byPost = new Map();
    for (const s of live) if (s.fibre && typeof s.post === 'number' && cells[s.post].o[CO.CLAW] > 0.5) { if (!byPost.has(s.post)) byPost.set(s.post, new Set()); byPost.get(s.post).add(s.pre); }
    const keepLab = new Map();
    // balanced choice: claw cells of the same territory (own topo label) prefer the source column fewest of them took
    //   so far (competition for fibre partners), in random order; ties random
    const order = [...byPost.keys()]; for (let i = order.length - 1; i > 0; i--) { const j = (rc() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    const taken = new Map();
    for (const post of order) { const pres = byPost.get(post), labs = [...new Set([...pres].map(p => cells[p].topo))].sort((a, b) => a - b);
      const key = l => cells[post].topo + '|' + l, n = l => taken.get(key(l)) || 0, mn = Math.min(...labs.map(n)), cand = labs.filter(l => n(l) === mn);
      // v19 clawOwn (plan constant, off by default): an INHIBITORY claw cell keeps its own column's fibres when they reached it
      //   and drops the other columns' fibres (local feedback inhibition: a gated reset cell is driven by, and silences, its own column, e.g. X2 -| M2)
      if (sc.clawOwn > 0.5 && cells[post].o[CO.INH] > 0.5) { const own = cells[post].topo; taken.set(key(own), n(own) + 1); keepLab.set(post, { pres, keep: own }); continue; }
      const keep = cand[(rc() * cand.length) | 0]; taken.set(key(keep), mn + 1); keepLab.set(post, { pres, keep }); }
    clawFed = new Set(byPost.keys());
    const fibreCells = clawFibreCells = new Set(); for (const [, pres] of byPost) for (const p of pres) fibreCells.add(p);   // cells whose fibres reach claw cells
    const drop = new Set();
    for (const s of live) { const k = typeof s.post === 'number' && keepLab.get(s.post); if (k && fibreCells.has(s.pre) && cells[s.pre].topo !== k.keep) drop.add(s); }
    if (drop.size) { const b = live; live = live.filter(s => !drop.has(s)); markGone(b, live, T, 1); }
  }
  // mixing cells (v14): each keeps the excitatory hidden inputs of mixK random presynaptic cells
  if (sc.mixK > 0 && neurons.some(c => c.o[CO.MIX] > 0.5)) {
    const rm = mulberry32(((opts.seed != null ? opts.seed : d.seed) ^ 0x6d1c4b2f) >>> 0), byPost = new Map();
    for (const s of live) if (s.pre >= 0 && s.w > 0 && typeof s.post === 'number' && cells[s.post].o[CO.MIX] > 0.5) { if (!byPost.has(s.post)) byPost.set(s.post, new Set()); byPost.get(s.post).add(s.pre); }
    const keep = new Map();
    for (const post of [...byPost.keys()].sort((a, b) => a - b)) { const pres = [...byPost.get(post)].sort((a, b) => a - b);
      for (let i = pres.length - 1; i > 0; i--) { const j = (rm() * (i + 1)) | 0; [pres[i], pres[j]] = [pres[j], pres[i]]; }
      keep.set(post, new Set(pres.slice(0, sc.mixK))); }
    { const b = live; live = live.filter(s => !(s.pre >= 0 && s.w > 0 && typeof s.post === 'number' && keep.has(s.post) && !keep.get(s.post).has(s.pre))); markGone(b, live, T, 2); }
  }
  // afferent-dependent survival (v9): receptive cells without any sensory input die
  if (sc.afferent > 0.5) { const fed = new Set(); for (const s of live) if (s.pre < 0 && typeof s.post === 'number') fed.add(s.post);
    for (const c of neurons) if (c.o[CO.RECV] > 0.5 && !fed.has(c.id)) kill(c, T, 'no afferent');
    neurons = neurons.filter(c => c.alive); const b = live; live = live.filter(s => (s.pre < 0 || cells[s.pre].alive) && (typeof s.post !== 'number' || cells[s.post].alive)); markGone(b, live, T, 3); }
  // 4. neurotrophic competition
  let trophicDeaths = 0;
  if (params.cellTrophic) {
    const tro = new Map();
    for (let it = 0; it < 4; it++) {
      const supply = new Map(); for (let m = 0; m < nOut; m++) supply.set('m' + m, 1);
      for (const [id, v] of tro) supply.set(id, 0.7 * v + sc.trophHid);   // hidden targets give some factor too (gene trophHid)
      if (sc.trophHid > 0) for (const c of neurons) if (!supply.has(c.id)) supply.set(c.id, sc.trophHid);
      const inSum = new Map();
      for (const s of live) if (s.pre >= 0) inSum.set(s.post, (inSum.get(s.post) || 0) + Math.abs(s.w));
      const nt = new Map(); for (const c of neurons) nt.set(c.id, 0);
      for (const s of live) if (s.pre >= 0 && supply.has(s.post)) nt.set(s.pre, nt.get(s.pre) + supply.get(s.post) * Math.abs(s.w) / inSum.get(s.post));
      tro.clear(); for (const [k, v] of nt) tro.set(k, v);
    }
    for (const c of neurons) if (tro.get(c.id) < sc.trophMin) { kill(c, T + 1, 'trophic'); trophicDeaths++; }   // (t: recorder timeline only)
    neurons = neurons.filter(c => c.alive);
    { const b = live; live = live.filter(s => (s.pre < 0 || cells[s.pre].alive) && (typeof s.post !== 'number' || cells[s.post].alive)); markGone(b, live, T + 1, 4); }
  }
  // assemble ordinary network
  const g = createNetGenome(nIn, neurons.length, nOut), N = g.N;
  g.pl = cleanPl(d.pl); g.nCh = d.nCh || 1; g.ch = (d.ch || [defaultChannel()]).map(c => Object.assign({}, c));
  g.pos = new Array(N); g.cellType = new Int16Array(N);
  const idx = new Map(); neurons.forEach((c, k) => idx.set(c.id, nIn + k));
  { const bn = new Float32Array(N).fill(-1); neurons.forEach((c, k) => { bn[nIn + k] = c.born; }); Object.defineProperty(g, 'born', { value: bn, writable: true, configurable: true, enumerable: false }); }   // R65: birth step of each neuron (staged maturation; not saved)
  for (let i = 0; i < nIn; i++) { g.pos[i] = IN[i].pos; g.cellType[i] = IN[i].cls; }
  for (let m = 0; m < nOut; m++) { const i = g.nIn + g.nHid + m; g.pos[i] = OUT[m].pos; g.cellType[i] = OUT[m].cls; }
  neurons.forEach((c, k) => { const i = nIn + k; g.pos[i] = [sx(c.i), sx(c.j)]; g.cellType[i] = N_FIXED + cellClass(c.o); g.thresh[i] = -60 + 10 * c.o[CO.THR]; if (c.topo != null) { g.topo = g.topo || new Float32Array(N).fill(NaN); g.topo[i] = c.topo; }
    if (d.kind === 'cell' && c.o[CO.RECV] > 0.5 && c.o[CO.INH] <= 0.5) { g.recv = g.recv || new Uint8Array(N); g.recv[i] = 1; }   // v21: excitatory plastic receivers (tract targets of multi-region brains; no effect on the dynamics)
    let lk = c.o[CO.CLAW] > 0.5 && sc.clawLeak > 0 ? sc.clawLeak : c.o[CO.MIX] > 0.5 && sc.mixLeak > 0 ? sc.mixLeak : cellLeak(c.o); if (sc.slowLeak > 0 && !(c.o[CO.CLAW] > 0.5) && !(c.o[CO.MIX] > 0.5)) { lk = sc.slowLeak; }   // R47 slowLeak (plan constant, 0 = off): every non-claw, non-mixing cell of the region integrates slowly (slow context layer)
    if (lk) { g.slow = g.slow || new Uint8Array(N); g.slow[i] = 1; g.leak[i] = lk; }
    if (c.o[CO.MIX] > 0.5) { g.mix = g.mix || new Uint8Array(N); g.mix[i] = 1; } });   // v14: mixing cells (for feedforward inhibition)
  const nodeOf = key => typeof key === 'number' ? idx.get(key) : g.nIn + g.nHid + +key.slice(1);
  for (const s of live) {
    const a = s.pre < 0 ? -1 - s.pre : idx.get(s.pre), b = nodeOf(s.post);
    if (a == null || b == null || a === b) continue;
    const q = a * N + b; g.W[q] += s.w; if (s.plastic) g.P[q] = 1;
  }
  if (clawFibreCells && clawFibreCells.size && sc.clawNorm > 0) {   // cells whose fibres reach claw cells, and the claw cells they reach
    g._fib = new Set(); for (const id of clawFibreCells) if (idx.has(id)) g._fib.add(idx.get(id));
    g._fed = new Set(); for (const id of clawFed) if (idx.has(id)) g._fed.add(idx.get(id)); }
  // synaptic scaling of total hidden->X input (genes normE / normI; off below 1)
  if (sc.normE >= 1 || sc.normI >= 1 || sc.clawNorm > 0 || sc.mixNorm > 0) {
    const h0 = nIn, h1 = nIn + neurons.length, CS = colLists(g.W, N, h0, h1, h0), cS = CS.st, cA = CS.a;   // (R66: hidden inputs of each cell, ascending: the dense column scans without the zeros)
    for (let b = h0; b < N; b++) {
      let e = 0, i = 0; for (let u = cS[b], z = cS[b + 1]; u < z; u++) { const w = g.W[cA[u] * N + b]; if (w > 0) e += w; else i -= w; }
      const claw = sc.clawNorm > 0 && b < h1 && neurons[b - h0].o[CO.CLAW] > 0.5;
      if (claw && g._fib && g._fed.has(b)) {   // claw cell with parallel-fibre input: input from fibre-sending cells and the rest get half of the budget each
        let ef = 0; for (let u = cS[b], z = cS[b + 1]; u < z; u++) { const a = cA[u], q = a * N + b; if (g.W[q] > 0 && g._fib.has(a)) ef += g.W[q]; }
        if (ef > 0 && e - ef > 0) { const ff = sc.clawNorm / 2 / ef, fd = sc.clawNorm / 2 / (e - ef);
          for (let u = cS[b], z = cS[b + 1]; u < z; u++) { const a = cA[u], q = a * N + b; if (g.W[q] > 0) g.W[q] *= g._fib.has(a) ? ff : fd; } continue; }
      }
      const mixC = sc.mixNorm > 0 && b < h1 && neurons[b - h0].o[CO.MIX] > 0.5;
      const fe = claw && e > 0 ? sc.clawNorm / e : mixC && e > 0 ? sc.mixNorm / e : sc.normE >= 1 && e > 0 ? sc.normE / e : 1, fi = sc.normI >= 1 && i > 0 ? sc.normI / i : 1;
      if (fe !== 1 || fi !== 1) for (let u = cS[b], z = cS[b + 1]; u < z; u++) { const q = cA[u] * N + b; if (g.W[q] > 0) g.W[q] *= fe; else if (g.W[q] < 0) g.W[q] *= fi; }
    }
  }
  delete g._fib; delete g._fed;
  if (sc.clawIn > 0) for (let b = nIn; b < nIn + neurons.length; b++) if (neurons[b - nIn].o[CO.CLAW] > 0.5) {   // claw cells: fixed total sensory (gate) input
    let s = 0; for (let a = 0; a < nIn; a++) if (g.W[a * N + b] > 0) s += g.W[a * N + b];
    if (s > 0) for (let a = 0; a < nIn; a++) if (g.W[a * N + b] > 0) g.W[a * N + b] *= sc.clawIn / s; }
  clampW(g.W, params.wMax);
  g.typeInfo = spec.tagNames.map((n, j) => ({ label: 'tag ' + n + ' cells', inh: false }));
  g.fixedNames = spec.classes; g.specKey = spec.key;
  // 5 + 6. juvenile phase: spontaneous waves, Hebbian refinement, homeostasis
  const jrec = rec ? { spikes: [], thresh: [], pruned: [], thresh0: Float32Array.from(g.thresh), per: 0 } : null;
  const juv = (params.cellRefine || params.cellHomeo) && g.nHid > 0 ? juvenilePhase(g, sc, r, spec, jrec) : { pruned: 0 };
  g.kind = 'direct'; g.grownFrom = d;
  // axon targeting statistics (cones of surviving cells that made no synapse at all; commissural axons that never crossed)
  const cst = { sensor: 0, sensorFail: 0, main: 0, mainFail: 0, coll: 0, collFail: 0, xsyn: 0, xsynNoCross: 0 };
  for (const cn of cones) { if (!cn.sensor && !cells[cn.pre].alive) continue;
    const k = cn.sensor ? 'sensor' : cn.coll ? 'coll' : 'main'; cst[k]++; if (cn.nsyn === 0) cst[k + 'Fail']++;
    if (cn.xsyn) { cst.xsyn++; if (!cn.crossed) cst.xsynNoCross++; } }
  // I/O connectivity: outputs without any excitatory input, (non-tonic) inputs without any target
  let orphanOut = 0, silentIn = 0, nInUsed = 0;
  for (let m = 0; m < nOut; m++) { const b = g.nIn + g.nHid + m; let k = 0; for (let a = 0; a < g.nIn + g.nHid; a++) if (g.W[a * N + b] > 0) { k = 1; break; } if (!k) orphanOut++; }
  for (let i = 0; i < nIn; i++) { if (IN[i].tonic) continue; nInUsed++; let k = 0; for (let b = 0; b < N; b++) if (g.W[i * N + b] !== 0) { k = 1; break; } if (!k) silentIn++; }
  g.devStats = { cells: cells.length, orphanOut, nOut, silentIn, nInUsed, hungerSyn, demandSyn, synapses: syns.length, outInMean: nOut ? Array.from(outIn).reduce((a, b) => a + b, 0) / nOut : 0, outCov: nOut ? Array.from(outIn).filter(v => v >= dT).length / nOut : 0, neurons: cells.filter(c => c.neuron).length, apoptosis, trophicDeaths, survivors: g.nHid, cones: cst,
                 synapses: countSynapses(g), refinePruned: juv.pruned, ms: nowMs() - t0 };
  if (rec) {
    rec.cones = cones.filter(c => c.path).map(c => ({ pre: c.pre, sensor: c.sensor, coll: !!c.coll, fibre: !!(c.fibre || c.bif), tag: c.tag, nsyn: c.nsyn,
      pts: Float32Array.from(c.path), cls: c.sensor ? -1 : cellClass(cells[c.pre].o) }));
    if (jrec) { const pr = new Set(); for (let k = 0; k < jrec.pruned.length; k += 2) pr.add(jrec.pruned[k] * N + jrec.pruned[k + 1]);   // Hebbian pruning -> synapse records
      const A = rec.synA; for (let k = 0; k < synEnd.length; k++) { if (synEnd[k] >= 0) continue; const pre = A[k * 7], post = A[k * 7 + 1];
        const a = pre < 0 ? -1 - pre : idx.get(pre), b = post < 0 ? g.nIn + g.nHid + (-1 - post) : idx.get(post);
        if (a != null && b != null && pr.has(a * N + b)) { synEnd[k] = T + 6; synWhy[k] = 5; } } }
    rec.syn = { n: synEnd.length, a: Float32Array.from(rec.synA), end: synEnd, why: synWhy }; delete rec.synA;
    rec.cells = cells.map(c => { const R = c.rec; return { id: c.id, parent: c.parent, born: c.born, moves: Float32Array.from(R.moves), ev: Int16Array.from(R.ev), sH: R.sH,
      died: R.died, cause: R.cause, neuronAt: R.neuronAt, s: R.s || Float32Array.from(c.s), o: R.o || Float32Array.from(c.o), topo: c.topo, node: idx.has(c.id) ? idx.get(c.id) : -1 }; });
    rec.nodeCell = new Int32Array(N); for (let i = 0; i < N; i++) rec.nodeCell[i] = i < nIn ? -1 - i : i < nIn + g.nHid ? neurons[i - nIn].id : -1000 - (i - nIn - g.nHid);
    rec.juv = jrec; rec.T = T; rec.TT = T + 7; rec.GS = GS; rec.H = H; rec.NS = NS;
    rec.stages = [[0, 'growth: division, migration, fate, axon guidance, synapse formation'], [T, 'selection: claw / mixing-cell input choice, afferent-dependent survival'],
      [T + 1, 'neurotrophic competition: neurons without useful output die'], [T + 2, 'juvenile spontaneous activity 1/4 (waves + homeostasis)'], [T + 3, 'juvenile activity 2/4'],
      [T + 4, 'juvenile activity 3/4'], [T + 5, 'juvenile activity 4/4'], [T + 6, 'Hebbian refinement + pruning: the final brain']];
    g.devLog = rec; }
  return g;
}
// R66 growth helpers (same results as the dense loops they replace, in small functions the JIT optimises)
class KeySet {                              // set of non-negative integer keys < 2^32 (open addressing)
  constructor() { this.cap = 1 << 16; this.k = new Uint32Array(this.cap); this.has0 = false; this.n = 0; }
  slot(key) { const m = this.cap - 1, K = this.k; let i = Math.imul(key, 0x9e3779b1) >>> 0 & m; while (K[i] !== 0 && K[i] !== key) i = (i + 1) & m; return i; }
  has(key) { if (key === 0) return this.has0; if (key > 0xffffffff) return !!this.big && this.big.has(key); return this.k[this.slot(key)] === key; }
  add(key) { if (key === 0) { this.has0 = true; return; } if (key > 0xffffffff) { (this.big = this.big || new Set()).add(key); return; } const i = this.slot(key); if (this.k[i] === key) return; this.k[i] = key; if (++this.n * 2 > this.cap) this.grow(); }
  grow() { const o = this.k; this.cap *= 2; this.k = new Uint32Array(this.cap); for (let i = 0; i < o.length; i++) if (o[i] !== 0) this.k[this.slot(o[i])] = o[i]; }
}
function colLists(W, N, a0, a1, b0) {       // incoming lists (pre a in [a0, a1), non-zero W) of every cell b >= b0, ascending a
  const cnt = new Int32Array(N + 1);
  for (let a = a0; a < a1; a++) { const r = a * N; for (let b = b0; b < N; b++) if (W[r + b] !== 0) cnt[b + 1]++; }
  for (let b = 0; b < N; b++) cnt[b + 1] += cnt[b];
  const f = cnt.slice(0, N), A = new Int32Array(cnt[N]);
  for (let a = a0; a < a1; a++) { const r = a * N; for (let b = b0; b < N; b++) if (W[r + b] !== 0) A[f[b]++] = a; }
  return { st: cnt, a: A };
}
function clampW(W, wMax) { for (let q = 0; q < W.length; q++) { const w = W[q]; if (w > wMax) W[q] = wMax; else if (w < -wMax) W[q] = -wMax; } }
function cellClass(o) { let b = 0; for (let k = 1; k < 8; k++) if (o[CO.T + k] > o[CO.T + b]) b = k; return b; }
// Spontaneous activity (spec.juvenile): travelling waves along each wave line of sensors,
// tonic channels, random kicks; outputs get their bias. NB the order of random draws is fixed
// (old genomes regrow identically).
function juvenilePhase(g, sc, r, spec, jrec) {   // jrec (recorder, optional): spikes / thresholds per block, pruned edges
  const J = spec.juvenile, lines = J.waves.filter(l => l.length), kicks = J.kicks && J.kicks.chans.length ? J.kicks : null;
  const keep = g.prune; g.prune = { tick: 1e9, min: 0 };
  const net = new SpikingNet(g, { noNeed: true }); g.prune = keep;   // (v28: no lifetime need-growth during development)
  const N = g.N, E = net.ws.length, hid0 = g.nIn, hid1 = g.nIn + g.nHid, iL = hid1;
  const blocks = 4, per = 50, spk = new Float32Array(N), tot = new Float32Array(N);
  let wave = null, gap = 0;
  const inc = Array.from({ length: N }, () => []); for (let k = 0; k < E; k++) inc[net.posts[k]].push(k);
  for (let b = 0; b < blocks; b++) {
    spk.fill(0);
    for (let t = 0; t < per; t++) {
      const ext = net.ext; ext.fill(0);
      if (lines.length && params.juvMode >= 3) {   // R40 task-shaped juvenile activity: discrete symbol pulses in sequence (3) or random order (4), same count / gain
        if (t % params.juvHold === 0) { if (!wave) wave = { ch: 0, k: -1 }; const line = lines[wave.ch], n = line.length;
          if (params.juvMode === 3) { wave.k++; if (wave.k >= n) { wave.k = 0; wave.ch = (wave.ch + 1) % lines.length; } } else { wave.ch = (r() * lines.length) | 0; wave.k = (r() * lines[wave.ch].length) | 0; } }
        if (wave) ext[lines[wave.ch][wave.k]] = J.waveGain;
      } else if (lines.length) {
        if (!wave && --gap <= 0) { const c0 = r() < 0.5 ? -1 : null; wave = { c: c0, v: 0, ch: (r() * lines.length) | 0 }; if (wave.c == null) wave.c = lines[wave.ch].length; wave.v = wave.c < 0 ? 0.3 : -0.3; }
        if (wave) { const line = lines[wave.ch], n = line.length; wave.c += wave.v; for (let k = 0; k < n; k++) ext[line[k]] = J.waveGain * Math.exp(-((k - wave.c) ** 2));
          if (params.juvMode === 1) { const v = line.map(i => ext[i]); for (let k = n - 1; k > 0; k--) { const q = (r() * (k + 1)) | 0; [v[k], v[q]] = [v[q], v[k]]; } line.forEach((i, k) => { ext[i] = v[k]; }); }   // R39 shuffled control: same values, no spatial order
          else if (params.juvMode === 2) for (let k = 0; k < n; k++) ext[line[k]] = 0;
          if (wave.c < -1.5 || wave.c > n + 0.5) { wave = null; gap = 5; } }
      }
      for (const [i, I] of J.tonic) ext[i] = I;
      if (kicks && r() < kicks.p) ext[kicks.chans[(r() * kicks.chans.length) | 0]] = kicks.gain;
      for (let m = 0; m < g.nOut; m++) ext[iL + m] = spec.outputs[m].bias;
      for (let s = 0; s < params.substeps; s++) { net.step(); for (let i = 0; i < N; i++) { spk[i] += net.spiked[i]; tot[i] += net.spiked[i]; } }
    }
    if (params.cellHomeo && sc.homeoRate > 0) {                     // 6. homeostasis
      for (let i = hid0; i < hid1; i++) {
        const rate = spk[i] / (per * params.substeps), err = (rate - sc.homeoTarget) / sc.homeoTarget;
        g.thresh[i] = clamp(g.thresh[i] + sc.homeoRate * clamp(err, -1, 1), -65, -45);
        const f = rate < sc.homeoTarget * 0.2 ? 1.15 : rate > sc.homeoTarget * 3 ? 0.87 : 1;
        if (f !== 1) for (const k of inc[i]) net.ws[k] = clamp(net.ws[k] * f, -params.wMax, params.wMax);
      }
    }
    if (jrec) { jrec.spikes.push(Float32Array.from(spk)); jrec.thresh.push(Float32Array.from(g.thresh)); jrec.per = per * params.substeps; }
  }
  let pruned = 0;
  if (params.cellRefine) {                                          // 5. Hebbian refinement + pruning
    // efficacy = how reliably the post neuron fires right after this input fires
    // (co-activity per presynaptic spike). Inputs that were silent during the waves, and
    // inhibitory synapses, are left alone.
    const eff = new Float32Array(E), sum = new Float32Array(N), cnt = new Float32Array(N);
    for (let k = 0; k < E; k++) { const pr = tot[net.pres[k]]; if (pr < 3 || net.ws[k] < 0) { eff[k] = -1; continue; }   // (inhibitory synapses: not Hebbian)
      eff[k] = net.use[k] / pr; sum[net.posts[k]] += eff[k]; cnt[net.posts[k]]++; }
    for (let k = 0; k < E; k++) {
      const p = net.posts[k]; if (eff[k] < 0 || cnt[p] < 2) continue;
      const m = sum[p] / cnt[p]; if (m <= 0) continue;
      if (eff[k] < sc.pruneFrac * m) { net.ws[k] = 0; pruned++; if (jrec) jrec.pruned.push(net.pres[k], net.posts[k]); continue; }
      net.ws[k] = clamp(net.ws[k] * clamp(1 + sc.hebb * (eff[k] / m - 1), 0.5, 1.5), -params.wMax, params.wMax);
    }
  }
  g.W.fill(0); for (let k = 0; k < E; k++) if (net.ws[k] !== 0) g.W[net.pres[k] * N + net.posts[k]] = net.ws[k];
  return { pruned };
}

Object.assign(SpikingArena, { CG, CH_NCHEM, CH_H, CH_NIN, CH_STEPS, CH_NO, CO, CHEM_NAMES, CELL_SC, Y_CENTRAL, cellDefaults, migrateCell, cloneCell, cellParamCount,
  createRandomCellGenome, mutateCell, crossCell, growCell, phenotype, cellClass });
