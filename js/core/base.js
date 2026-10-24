/* =====================================================================
 * SPIKING ARENA ENGINE — base.js (no DOM, no task knowledge)
 * Utilities, engine parameters, the network container ("direct genome")
 * and plasticity genes. All engine files are plain classic scripts that
 * share one global scope (browser <script src> or js/node_load.js in Node),
 * and publish their public names on the SpikingArena object.
 * Load order: base, io, develop, net, files, agent, evolve, then js/envs/*.
 * ===================================================================== */
'use strict';
var SpikingArena = (typeof globalThis !== 'undefined' ? globalThis : window).SpikingArena || {};
(typeof globalThis !== 'undefined' ? globalThis : window).SpikingArena = SpikingArena;

/* ---------------- Utilities ---------------- */
function mulberry32(a) {           // small fast seeded RNG -> [0,1)
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {                // standard normal via Box-Muller
  let u = 0; while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
function hashSeed(a, b) { let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0; h ^= h >>> 15; return Math.imul(h, 0x27d4eb2d) >>> 0; }
const nowMs = () => (typeof performance !== 'undefined' ? performance : Date).now();

/* ---------------- Engine constants / tunable parameters ----------------
 * Only task-independent settings live here. Every environment has its own
 * parameter object (see io.js: envParams). */
const V_REST = -70, V_THRESH = -55, V_FLOOR = -90;  // mV
const params = {
  juvMode: 0,          // R39 (Q05): juvenile activity 0 = travelling waves (default), 1 = the same wave energy spatially shuffled each tick (rate-matched control), 2 = no waves;
                       // R40: 3 = task-shaped symbol sequence (one sensor at a time, stepping k -> k+1 like a cycle, juvHold ticks each), 4 = the same pulses in random order (matched)
  juvHold: 4,
  env: 'cue',          // id of the current environment (see js/envs/)
  popSize: 50,
  mutRate: 0.05,       // per-gene mutation probability (plasticity genes)
  leak: 0.95,          // leak factor of every normal neuron (per substep)
  substeps: 4,         // neural sub-steps per environment tick
  lifeSub: 0,          // R68: sub-steps per tick during the life only (0 = substeps; growth always uses substeps)
  dtRescale: 0,        // R68: 1 = with lifeSub != substeps, rescale every per-substep constant (leaks, decays, time constants, durations, rates, input currents) so the dynamics follow the same biological time
  episodes: 1,         // episodes per GROWTH per generation
  growths: 3,          // ROBUST FITNESS: each genome is grown this many times (fresh developmental-noise
                       //   seeds every generation); 1 = grown once with its own seed
  robustW: 0.5,        // fitness = mean over growths - robustW x std over growths ...
  worstW: 0,           // ... blended with the WORST growth: (1 - worstW) x (mean - robustW x std) + worstW x min (v8)
  valGrowths: 10,      // champion validation: regrow with this many fixed held-out noise seeds (v4-v7: 5) ...
  valArenas: 10,       // ... on this many fixed held-out episodes in total (split over the growths)
  valTopK: 3,          // how many of each generation's best get validated
  eliteFrac: 0.1,
  crossoverRate: 0.3,
  traceDecay: 0.9,     // output spike-rate smoothing (per substep)
  fastEngine: 1,       // R66: 1 = fast engine (same model computed more cheaply, not bit-identical; net.js initFastE), 0 = exact engine; v38 (R69): default 1 after z08 / z09 / z10 (no task worse); pin P.fastEngine=0 for exact-engine A/B or fingerprints
  // v41 (R84/R85): granule-layer settings (used only by brains that grow a granule layer: plan gene d.gran.N, e.g. deepURSx3 = 4000 since v43 (R91); P.granN overrides).
  // R91 granAnneal (0 = off): per-granule NLMS step x max(granAnnealMin, granAnneal / (granAnneal + the granule's teaching-event count)).
  // Granules (t, t-1, t-2 claws) -> output cells, cerebellar NLMS rule on the read-window activity, learned self-silencing gain. Old v40 brain: plan deepURSx3v40 or P.granN=0.
  granW: 60, granRate: 0.0003, granTgt: 1, granOut: 0.01, granWin: 1, granK: 3, granLr: 0.1, granRef: 600, granGain: 0.003,   // v42 (R89): granRef 600 (was 100; v41 = P.granRef=100)
  plasticity: true,    // lifetime learning (reward-modulated STDP); false = frozen genome weights
  cellStart: 'env',    // a new population starts from mutants of this body plan ('env' = the environment's default)
  cellMut: 0.02,       // chance per genome number to mutate
  cellTrophic: true,   // development: neurotrophic competition (neurons without useful outputs die)
  cellRefine: true,    // development: juvenile spontaneous activity + Hebbian refinement/pruning
  cellHomeo: true,     // development: homeostatic thresholds / synaptic scaling
  cellHunger: true,    // development: allow need-based attraction (genes hunger*; off in old genomes)
  cellRequest: true,   // development: allow activity-timed requests (genes request/req*; off in old genomes)
  cellDemand: true,    // development: allow the local connection-demand attractant (genes demand*; v27, off in old genomes)
  cellMirror: false,   // development: impose bilateral symmetry
  wMax: 30,            // |weight| cap (mV) for plastic synapses
};

/* ---------------- Networks, plasticity genes ----------------
 * A grown brain is an ordinary network: N = nIn sensors + nHid hidden + nOut outputs,
 * dense weight matrix W[pre*N+post] (0 = no synapse), plastic flags P, channel C
 * (always 0: one global dopamine signal), threshold and leak per neuron.        */
const PL_DEFAULTS = { lr: 0.03, tauPre: 10, tauPost: 10, aMinus: 0.3, tauElig: 50,
  // v9 TEACHER-GATED rule (teach > 0; default 0 = reward-modulated STDP as before). Not mutated by evolution.
  //   teachThr: sensory drive (mV, smoothed) that marks a TEACHER event at a cell (instructive input, like a
  //   climbing fibre); plateau: substeps after the event's onset during which the cell's spikes potentiate its
  //   plastic inputs by lr x pre-trace; preNorm: every presynaptic cell keeps the sum of its plastic outgoing
  //   weights at preNorm (heterosynaptic competition), so its weights track how often each target followed it.
  //   preLag (v10, 0 = off): the teacher rule uses a pre-trace of spikes at least preLag substeps old, so the
  //   context active BEFORE the teacher event is credited, not the one the event itself (re)creates.
  //   v12 (all 0 = off): metaN: metaplasticity, the teacher-rule step of a presynaptic cell shrinks as
  //   metaN / (metaN + E), E = the potentiation that cell has already received (lr x pre-trace summed), so its
  //   normalised weights become running averages (counts) instead of a fixed-rate recency average.
  //   confPow: confidence gain, the cell's preNorm budget is scaled by min(confMax, (n S2 / confRef)^confPow),
  //   S2 = sum(w^2) / sum(w)^2 over its n plastic weights (n S2 = 1 when flat, n when all on one target), so cells whose
  //   outputs are sharp (a reliable context) dominate the summed prediction and flat ones back off.
  //   trustPow: learned per-cell trust. At every teacher event (trustDelay substeps after its onset), each cell with
  //   a recent pre-trace measures the share of its plastic output weight that lands on cells now in a teacher plateau
  //   (= the probability it gave the event that happened) and keeps a running mean of it (pre-trace weighted, window
  //   up to trustN events). Its preNorm budget is scaled by min(trustMax, (trust / trustRef)^trustPow), so reliable
  //   (context-specific) cells dominate the prediction and unreliable ones back off. Local: pre-cell + its synapses.
  teach: 0, teachThr: 20, plateau: 4, preNorm: 0, preLag: 0, metaN: 0, confPow: 0, confRef: 1, confMax: 1,
  trustPow: 0, trustRef: 0.5, trustMax: 4, trustN: 200, trustDelay: 2, trust0: -1,
  //   v13 RECEIVER POOL (cells that receive plastic synapses, e.g. prediction cells; all 0 = off):
  //   rcvDiv: divisive normalisation (gain control) of their plastic input: each one's plastic input is multiplied by
  //   rcvDiv * nReceivers / (rcvSig + total plastic input to the pool), so the pool's total drive is ~constant and the
  //   relative differences decide who fires. rcvInh: shared inhibitory pool, every receiver spike inhibits all receivers
  //   by rcvInh mV (rcvInhTau > 0: through a pool trace with that time constant in substeps): soft winner-take-all.
  //   rcvNoise: Gaussian membrane noise (sd, mV per substep) in the receivers, so weak inputs give graded rates.
  rcvDiv: 0, rcvSig: 1, rcvInh: 0, rcvInhTau: 0, rcvNoise: 0,
  //   v14 mixInh (0 = off): FEEDFORWARD INHIBITION of mixing cells (gene MIX; like the APL / Golgi cell): every spike of a
  //   cell that projects onto mixing cells inhibits all mixing cells by mixInh mV, so they need a combination of
  //   inputs that stands out from the overall input activity (keeps the layer sparse).
  mixInh: 0,
  //   v15 LEARNED MIXING (all 0 = off): the excitatory hidden inputs of mixing cells learn by a local, unsupervised
  //   competitive (instar) rule. When a mixing cell spikes, each input weight moves toward the cell's budget times
  //   that input's share of the presynaptic traces: w += eta (Wtot x / sum x - w), so the total input stays Wtot
  //   (heterosynaptic normalisation) and the cell becomes selective for the combination that drives it.
  //   mixLr = eta, mixN = consolidation (eta * mixN / (mixN + n spikes so far); 0 = constant), mixPrune = an input
  //   whose weight falls below mixPrune x the mean is removed for good (structural pruning).
  //   mixHomeo / mixRate: intrinsic homeostatic threshold, thr += mixHomeo (spike - mixRate) every substep, so each
  //   mixing cell fires on average mixRate spikes per substep (sparse, lifetime-balanced).
  //   mixGate > 0: dopamine / teacher gating (mushroom-body like): the step is scaled by 1 - mixGate + mixGate x r / 2,
  //   r = the cell's plastic output weight on cells now in a teacher plateau relative to their number (capped at 2;
  //   0 without a teacher), so inputs are reinforced when the cell's output already points at the taught symbol.
  mixLr: 0, mixN: 0, mixPrune: 0, mixHomeo: 0, mixRate: 0.002, mixGate: 0,
  //   v16 teachAHP (0 = off): POST-TEACHER AFTERHYPERPOLARISATION. When a receiver's teacher drive ends (its teacher trace
  //   falls below half the threshold after a plateau), it gets -teachAHP mV per substep for teachAHPDur substeps (like
  //   the pause after a Purkinje cell's climbing-fibre complex spike), so the just-taught column stops echoing the
  //   current symbol into the prediction window.
  teachAHP: 0, teachAHPDur: 12,
  //   v20 (round 21) REWARD-PREDICTION-ERROR DOPAMINE (rpe 0 = off: dopamine = the raw reward events as before).
  //   rpe 1: a CRITIC (value cell: graded, like a mushroom-body output neuron or a striatal cell summing its input) reads the
  //   STATE CELLS (rpeSrc 0: the cells with plastic outgoing synapses, i.e. what the actor learns from; 1: mixing cells
  //   (gene MIX) when the brain has them; 2: all hidden cells) through its own plastic synapses u:  V = sum_i u_i x_i,
  //   x_i = the cell's smoothed rate. Every tick the dopamine cells compute the TD error
  //   delta = r + rpeGamma V(now) - V(previous tick), r = the reward events weighted by the channel gains, and broadcast
  //   rpeGain x delta instead of r (it drives the same three-factor rule of the actor: w += lr M e).
  //   The critic learns with the same signal (TD(lambda)): z = rpeGamma rpeLambda z + x(previous), u += rpeLr delta z / (rpeEps + z.z)
  //   (normalised: the value of the traced states moves by at most rpeLr x delta, whatever the number of active cells).
  //   (rpeGamma 0: delta = r - V(previous), the simple reward-minus-expectation form.)
  //   rpeMode 1: OUTCOME-ONLY critic (Rescorla-Wagner): dopamine = r - V(now) at outcome events (reward, or a trial end the task marks
  //   with ev.outcome: an omitted reward is an outcome too) and 0 between them; V learns
  //   only at outcomes (no TD ramps when the state representation fades before the outcome, no discount drift).
  //   actNoise (sd, mV per substep; 0 = off): EXPLORATION NOISE OF ACTION CHANNELS. Every output has one slow noise source
  //   (Ornstein-Uhlenbeck, correlation time actNoiseTau substeps) that drives the output and all cells with plastic inputs that
  //   project to it (its action column), so a whole column fluctuates together and choices are sampled, not averaged away.
  //   actNoiseV (0 = off): VALUE-DEPENDENT EXPLORATION: the noise amplitude is divided by (1 + actNoiseV x V), V = the critic's
  //   value of the present state (rpe on): explore where little reward is expected, exploit where much is.
  //   With preNorm > 0 and the reward rule (teach 0), every presynaptic cell keeps the sum of its plastic weights (competition
  //   between actions: potentiating one target depresses the others).
  actNoise: 0, actNoiseTau: 20,
  //   rcvHomeo (0 = off): intrinsic homeostatic thresholds of the cells with plastic inputs (action columns), as mixHomeo for
  //   mixing cells: thr += rcvHomeo (spike - rcvRate) every substep, so no column dominates just because it grew bigger.
  rcvHomeo: 0, rcvRate: 0.02,
  //   actFb / outInh (mV; 0 = off): ACTION-SELECTION LOOP (basal ganglia - thalamus - cortex like). Every output spike excites
  //   its own action column by actFb and inhibits the other columns by actFb (efference copy of the selected action, so the
  //   column that drove the choice is the one that stays active and becomes eligible), and inhibits the other outputs by
  //   outInh (competition between actions, winner-take-all).
  actFb: 0, outInh: 0, eligUse: 0, eligMix: 0, tauElig2: 8, eligEvo: 0, eligGate: 0, eligGateT: 10, ngFail: 0, ngStruct: 0, predErr: 0, peMode: 0, peFix: 0, metaCap: 0, deltaLr: 0, deltaRef: 1, deltaKeep: 0, deltaTau: 0, deltaMode: 0, mixFreeze: 0,
  rpe: 0, rpeGamma: 0.9, rpeLambda: 0.5, rpeLr: 0.3, rpeGain: 1, rpeSrc: 0, rpeEps: 1, rpeMode: 0, actNoiseV: 0,
  // v22 (round 23) UNIFIED THREE-FACTOR RULE (uni 1; 0 = off): every plastic synapse keeps its eligibility trace (STDP), and
  //   dw = lr * M_post * e, with ONE modulator per target cell M_post = uniI * I_post + D:
  //   I_post = local INSTRUCTIVE signal (climbing-fibre-like plateau: strong topographic sensory drive to that cell, teachThr /
  //   plateau; diffuse inputs such as GO broadcasts do not count); it is brief, so it acts on the fresh eligibility (the
  //   pre-trace at the cell's own spikes during the plateau); D = global dopamine (reward prediction error with the critic),
  //   which acts on the slow trace (tauElig). Teacher tasks get instructive signals and an RPE from right / wrong predictions;
  //   reward tasks get only the RPE.
  uni: 0, uniI: 0.4,
  // v28 (R29) need-growth (net.js planNeed/initNeed): ng 1 = on; ngRes reserve cells; ngBatch cells per recruit; ngTau error-average window (events); ngThr / ngCost
  // threshold and its rise when the new cells alive equal the layer in number (metabolic cost); ngHold events above before a recruit, ngRef events between recruits;
  // ngTrial / ngKeep trophic test; ngW start weight of a new cell's axon (x the layer's mean); ngClaw dendrite size (0 = the layer's median);
  // ngReduce: experiment only, fraction of the learning layer removed at birth (the reduced start).
  ng: 0, ngRes: 256, ngBatch: 8, ngTau: 20, ngThr: 0.3, ngCost: 0.3, ngHold: 20, ngRef: 5, ngTrial: 60, ngKeep: 0.3, ngW: 0.5, ngClaw: 0, ngReduce: 0,
  // R65 (I81, Travis's passive learner) OUTPUT GATE (0 = off): a basal-ganglia-like gate on the read-out. The brain keeps learning from every
  // teacher event (silent internal next-symbol prediction); its prediction is EMITTED only when the read-out is confident: confidence =
  // share of the winning column in the read window (outGateMode 0) or margin of the winner over the runner-up / total (mode 1) >= outGate.
  // Teacher-forced tasks: an unemitted prediction is an abstention (no reward / punishment event; stats gateCov = share emitted,
  // gatePrec = accuracy of the emitted ones; accuracy still scores every prediction). Free-running generation: a confident step emits the
  // winner, an unconfident one samples p ~ counts^(1/T) (T = genTemp, or 1). Read by the env from the output region's pl. Not mutated.
  outGate: 0, outGateMode: 0,
  // R65 (I82) STAGED MATURATION (stageF0 = 0 = off): the brain is grown at full size, but only the earliest-born stageF0 share of its hidden
  // neurons is mature at birth; the rest mature in stageWaves waves, one every stageTicks ticks, in birth order (ties: seeded random), like
  // late-born neurons that integrate during the juvenile period. An immature neuron cannot fire and its synapses carry no weight; when it
  // matures its synapses take their grown weights (learned weights of the mature network are kept) and the presynaptic budgets are re-normalised.
  stageF0: 0, stageWaves: 2, stageTicks: 110000,
  // R67 SPARSER ACTIVITY (all 0 = off): thrAdd: +mV on every hidden cell's grown firing threshold at birth.
  //   hidHomeo / hidRate: intrinsic homeostatic thresholds of all hidden cells (those without rcvHomeo):
  //   thr += hidHomeo (spike - hidRate) every substep, never below the grown threshold (+ thrAdd), so busy cells are pushed down
  //   to ~hidRate spikes per substep while quiet cells keep their threshold.
  //   regInh / regInhTau / regK: POOLED FEEDBACK INHIBITION per region (basket / chandelier-like interneuron pool, k-winners-take-all
  //   style): every hidden cell of a region gets -P mV, P = P e^(-1/regInhTau) + regInh x 100 x max(0, f - regK), f = the region's
  //   fraction of hidden cells spiking this substep (regInh mV per 1 % active above regK).
  //   regMask (0 = every region): bit r restricts thrAdd / hidHomeo / regInh to region r of the brain (1 = cortex, 2 = context, 4 = context 2, ...).
  thrAdd: 0, hidHomeo: 0, hidRate: 0.01, regInh: 0, regInhTau: 0, regK: 0, regMask: 0 };   // trust0: starting trust (-1 = trustRef)
// v22 (round 23): the ONE learning-rule set of the default plans predictK3, rewardK, rewardMemK (and the region plans):
// unified three-factor rule, instructive gain, eligibility, critic (outcome RPE), synaptic scaling setpoint (RESULTS R23)
const UNIFIED_PL = { uni: 1, lr: 0.05, uniI: 0.4, tauElig: 100, aMinus: 0.3, rpe: 1, rpeMode: 1, rpeLr: 0.3, preNorm: 45, teachThr: 20, plateau: 4 };
const NG_RANGES = { ngRes: [8, 512, true], ngBatch: [1, 32, true], ngTau: [5, 200, true], ngThr: [0.05, 0.9, false], ngCost: [0, 2, false], ngHold: [2, 200, true], ngRef: [1, 100, true], ngTrial: [10, 500, true], ngKeep: [0, 1, false] };
const EL_RANGES = { tauElig2: [2, 50, true], eligMix: [0, 1, false], eligUse: [0, 1, false], rcvHomeo: [0.005, 1, true] };   // v31 (R34)
const PL_RANGES = { lr: [1e-4, 0.3, true], tauPre: [2, 50, true], tauPost: [2, 50, true], aMinus: [0, 2, false], tauElig: [10, 2000, true] };
// gFood / gPoison / gWall = gains of the three reward events every environment reports
// (positive reward, negative reward, small "pain" such as wall contact).
const CH_DEFAULTS = { gFood: 1, gPoison: 1, gWall: 0.05, tauMod: 5, src: -1, gSpike: 0 };
const CH_RANGES = { gFood: [-3, 3, false], gPoison: [-3, 3, false], gWall: [-1, 1, false], tauMod: [1, 200, true], gSpike: [-1, 1, false] };
function defaultPlasticity() { return Object.assign({}, PL_DEFAULTS); }
function defaultChannel() { return Object.assign({}, CH_DEFAULTS); }
function channelsFromLegacy(pl) {
  const c = defaultChannel();
  if (pl) for (const k of ['gFood', 'gPoison', 'gWall', 'tauMod']) if (pl[k] != null) c[k] = +pl[k];
  return [c];
}
function cleanPl(pl) { const p = defaultPlasticity(); if (pl) for (const k in PL_DEFAULTS) if (pl[k] != null) p[k] = +pl[k]; return p; }
// Empty network with nIn sensors, nHid hidden neurons, nOut outputs.
function createNetGenome(nIn, nHid, nOut, noDense) {   // (R66 noDense: no W / P / C; the caller attaches a sparse synapse list, regions.js)
  const N = nIn + nHid + nOut;
  return { kind: 'direct', nIn, nHid, nOut, N, W: noDense ? null : new Float32Array(N * N), P: noDense ? null : new Uint8Array(N * N), C: noDense ? null : new Uint8Array(N * N),
           thresh: new Float32Array(N).fill(V_THRESH), leak: new Float32Array(N).fill(params.leak), pl: defaultPlasticity(), nCh: 1, ch: [defaultChannel()],
           locked: false, labels: null, ids: null, fitness: null };
}
function isInput(g, i) { return i < g.nIn; }
function isOutput(g, i) { return i >= g.nIn + g.nHid; }
function outputIndex(g, m) { return g.nIn + g.nHid + m; }
function countSynapses(g) { g = phenotype(g); if (g.sp) return g.sp.w.length; let c = 0; for (let i = 0; i < g.W.length; i++) if (g.W[i] !== 0) c++; return c; }
function genomeParamCount(g) { return g.kind === 'cell' || g.kind === 'regions' ? cellParamCount(g) : countSynapses(g) * 3 + g.N * 2; }
// Learning-rule genes + the gains of the single global dopamine channel.
function mutatePlasticityGenes(g, r, m) {
  for (const k in PL_RANGES) {
    if (r() > Math.max(0.1, m * 3)) continue;
    const [lo, hi, lg] = PL_RANGES[k];
    g.pl[k] = lg ? clamp(g.pl[k] * Math.exp(gauss(r) * 0.3), lo, hi) : clamp(g.pl[k] + gauss(r) * (hi - lo) * 0.05, lo, hi);
  }
  if (g.pl.eligEvo > 0) for (const k in EL_RANGES) {   // v31 (R34): dual-timescale tag genes evolve only in genomes that carry them (others draw no extra numbers)
    if (r() > Math.max(0.1, m * 3)) continue;
    const [lo, hi, lg] = EL_RANGES[k], v = g.pl[k] != null ? g.pl[k] : PL_DEFAULTS[k];
    g.pl[k] = lg ? clamp(Math.max(v, lo) * Math.exp(gauss(r) * 0.3), lo, hi) : clamp(v + gauss(r) * (hi - lo) * 0.05, lo, hi);
  }
  if (g.pl.ng > 0) for (const k in NG_RANGES) {   // v28: need-growth genes evolve only in genomes that use need-growth (other genomes draw no extra numbers)
    if (r() > Math.max(0.1, m * 3)) continue;
    const [lo, hi, lg] = NG_RANGES[k], v = g.pl[k] != null ? g.pl[k] : PL_DEFAULTS[k];
    g.pl[k] = lg ? clamp(v * Math.exp(gauss(r) * 0.3), lo, hi) : clamp(v + gauss(r) * (hi - lo) * 0.05, lo, hi);
  }
  g.nCh = 1; g.ch.length = 1; const c = g.ch[0]; c.src = -1;
  for (const k in CH_RANGES) {
    if (k === 'gSpike' || r() > Math.max(0.1, m * 3)) continue;
    const [lo, hi, lg] = CH_RANGES[k];
    c[k] = lg ? clamp(c[k] * Math.exp(gauss(r) * 0.3), lo, hi) : clamp(c[k] + gauss(r) * (hi - lo) * 0.05, lo, hi);
  }
}

// Count edges by pathway (UI / ablation reports)
function synapseStats(g) {
  g = phenotype(g); const N = g.N, h0 = g.nIn, h1 = g.nIn + g.nHid; let direct = 0, toHidden = 0, recurrent = 0, toMotor = 0;
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    if (!g.W[a * N + b]) continue;
    if (a < h0 && b >= h1) direct++; else if (a < h0) toHidden++; else if (a < h1 && b < h1) recurrent++; else toMotor++;
  }
  return { total: direct + toHidden + recurrent + toMotor, direct, toHidden, recurrent, hiddenToMotor: toMotor };
}
// Wiring statistics of a (grown) network: hidden->hidden synapses, recurrence, depth.
function networkStats(g) {
  g = phenotype(g); const N = g.N, h0 = g.nIn, h1 = g.nIn + g.nHid, out = Array.from({ length: N }, () => []);
  let hh = 0, total = 0, hhInh = 0;
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) { const w = g.W[a * N + b]; if (!w) continue; total++; out[a].push(b);
    if (a >= h0 && a < h1 && b >= h0 && b < h1) { hh++; if (w < 0) hhInh++; } }
  const dist = new Int32Array(N).fill(-1), q = [];
  for (let i = 0; i < h0; i++) { dist[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) for (const b of out[q[k]]) if (dist[b] < 0) { dist[b] = dist[q[k]] + 1; q.push(b); }
  let motorDepth = 0, maxDepth = 0; for (let i = h0; i < N; i++) { if (dist[i] > maxDepth) maxDepth = dist[i]; if (i >= h1 && dist[i] > motorDepth) motorDepth = dist[i]; }
  let index = 0; const idx = new Int32Array(N).fill(-1), low = new Int32Array(N), on = new Uint8Array(N), st = []; let inLoops = 0;
  const strong = v => { idx[v] = low[v] = index++; st.push(v); on[v] = 1;
    for (const w of out[v]) { if (w < h0 || w >= h1) continue; if (idx[w] < 0) { strong(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], idx[w]); }
    if (low[v] === idx[v]) { let n = 0, w; do { w = st.pop(); on[w] = 0; n++; } while (w !== v); if (n > 1) inLoops += n; } };
  for (let v = h0; v < h1; v++) if (idx[v] < 0) strong(v);
  let slow = 0; if (g.slow) for (let i = h0; i < h1; i++) slow += g.slow[i];
  return { hidden: g.nHid, synapses: total, hh, hhInh, recFrac: total ? hh / total : 0, motorDepth, maxDepth, inLoops, slow };
}

// v17 (round 18): version stamps written into every saved session. A save made with an older DEFAULTS_VERSION
// is NOT restored silently on load (its settings / population predate the current recommended defaults).
// v18 (round 19, growth viewer) changed no default. v19 (round 20): the text default plan is predictK2XO -> DEFAULTS_VERSION 18.
// v20 (round 21, reward learning): no existing default changed (new env bandit -> rewardK; new option mapping 'random' -> rewardMemK) -> DEFAULTS_VERSION stays 18.
// v21 (round 22, context cascade + regions): text/fables/order3 recommend the three-phase clock -> default plan predictK3 -> DEFAULTS_VERSION 19.
// v22 (round 23): the default plans predictK3 / rewardK / rewardMemK learn with ONE rule set (UNIFIED_PL) -> DEFAULTS_VERSION 20.
// v27 (round 28, neuro): pure local connection-demand attractant (attraction only, no relaxed matching), default on in the default plans
const DEMAND_SC = { demand: 1, demandRelax: 0 };
const APP_VERSION = 'v43', DEFAULTS_VERSION = 36;   // v43 (R91): plan deepURSx3 grows a 4000-cell granule layer (was 2000 = plan deepURSx3v42 / P.granN=2000); y159 (workers, fresh k 2240-2255) + box (fresh k 2256-2271), 32 growths: book10k +0.008, book30k +0.011 (29/1), fables +0.002, text / order3 / K4 / seqchoice not worse. Worker held-out y160.
// v42 (R89): params.granRef 600 (was 100): the granule -> output synapses carry 6x the drive per unit prediction (NLMS step unchanged in prediction units); two fresh 16-growth box blocks vs v41 (k 2144-2159 R88, k 2048-2063 = y139 R89; 32 growths): book10k +0.018 / book30k +0.021 (32/0), fables +0.003 (21/11), order3 +0.002 (4/1), text1000 -0.0004 (11/14, t -1.0, n.s.), seqchoice identical; granRef 1000 not adopted (text -0.0008, t -2.4 over 32), 3000 past the peak; v41 = deepURSx3 + P.granRef=100; v41 (R84): deepURSx3 grows a 2000-cell granule layer (plan gene gran.N; claws t, t-1, t-2) projecting onto the output cells, learned by the cerebellar NLMS rule on read-window activity with a learned self-silencing gain (params granW..granGain); box 16 fresh growths k 1940-1955 vs v40: order3 +0.003 (4/3), text +0.004 (9/7), fables +0.087 (16/0), book10k +0.379 (16/0), book30k +0.381 (16/0), seqchoice identical (no granules on outcome tasks); old plan = deepURSx3v40; v40 (R77): deepURSx3's cortex preNorm 55 (was 45; y25 + y83 fresh growths k 1500-1515, no task worse; old plan = deepURSx3v39), nothing else changed; v39 (R70): deepURSx3's cortex learns at lr 0.2 (was 0.1; y02 + y08 fresh growths, no task worse; old plan = deepURSx3v37), engine and other regions unchanged; v38 (R69): params.fastEngine 1 by default (fast engine: same model and rules, float rounding differs; validated z08 1x 16 growths x 7 tasks, z09 4xS book10k 16/16 identical, z10 4xS 5 tasks 8 growths; exact engine = P.fastEngine=0), brains / plans unchanged; v37 (R64): deepURSx3's cortex learns at lr 0.1 (was 0.05) and its striatum gets v35's prediction-miss LTD back (predErr 0.3; seqchoice = v35, seq tasks unchanged); other regions unchanged; old plan = deepURSx3v36; v36 (R62): deepURSx3 without prediction-miss LTD (predErr 0) + capped metaplastic consolidation (pl.metaCap 200), seq graded decoder readIn 0.01 by default (old plan = deepURSx3v35, reproduce with readIn 0); v35 (R53): deepURSx3 learns with hybrid prediction-mismatch LTD (pl.predErr 0.3, peMode 16, peFix 0.01; old plan = deepURSx3v34); v34 (R44): deepURSx3 (unifiedR + two chained deep context areas, repressed by the outcome signal) is the default for three-phase-clock sequences/text and seqchoice; v33 (R39): unifiedR striatum = rewardE3 (q04_mixed_evolve champion's striatum, transplanted); v32 (R37): outcome present -> striatum always develops and owns the outputs, sequence areas graded and feeding it; v31 (R35): unifiedR's reward area = rewardE2 (dual-timescale eligibility, dualtag2 champion); v30 (R30 adopted): one unified genome unifiedR is the default for three-phase-clock sequences/text, bandit and random-mapping cue/recall (grows exactly predictK3 / rewardE by arealization); v27 (round 28): local connection demand (DEMAND_SC) on in predictK3 + rewardE; v26 (round 27): evolved plan rewardE is the default for bandit + random-mapping cue/recall; v25 (round 26): headless runner + dashboard; v24 (round 25): UI-only (fast mode); v23 (round 24): no default changed
const PARAM_DEFAULTS = Object.freeze(Object.assign({}, params));   // the recommended engine settings (snapshot before any UI change)
Object.assign(SpikingArena, { APP_VERSION, DEFAULTS_VERSION, PARAM_DEFAULTS, DEMAND_SC });
Object.assign(SpikingArena, { UNIFIED_PL, mulberry32, gauss, clamp, hashSeed, V_REST, V_THRESH, V_FLOOR, params, PL_DEFAULTS, PL_RANGES, NG_RANGES, CH_DEFAULTS, CH_RANGES,
  defaultPlasticity, defaultChannel, cleanPl, createNetGenome, isInput, isOutput, outputIndex, countSynapses, genomeParamCount, synapseStats, networkStats });
