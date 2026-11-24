/* bugbrain.js built by tools/build_bugbrain_bundle.js from commit b0e789cc3f15e6e358bc4b4a3b8d81633113f9f3 (b0e789cc); js/core/base.js, js/core/io.js, js/core/develop.js, js/core/regions.js, js/core/plans.js, js/core/net.js, js/core/files.js, js/core/agent.js, js/core/evolve.js, js/envs/bug.js, js/envs/memory.js, js/envs/text.js, js/envs/sequence.js, js/envs/seqchoice.js, js/envs/bandit.js, js/envs/reward_evolved.js + hosting/computelab/private/bugbrain-view.js; body sha256 ff97fbb2acd1cc3032ba3e58ab98579691ad0ce325502b25f81f0aee1a430281 */
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
  // v41 (R84/R85): granule-layer settings (used only by brains that grow a granule layer: plan gene d.gran.N, e.g. deepURSx3 = 32000 since v46 (R106); P.granN overrides; v47 (R114): plan gene d.gran.lrT / lrLate = granule step schedule, P.granLrT overrides).
  // R91 granAnneal (0 = off): per-granule NLMS step x max(granAnnealMin, granAnneal / (granAnneal + the granule's teaching-event count)).
  // Granules (t, t-1, t-2 claws) -> output cells, cerebellar NLMS rule on the read-window activity, learned self-silencing gain. Old v40 brain: plan deepURSx3v40 or P.granN=0.
  granW: 60, granRate: 0.0003, granTgt: 1, granOut: 0.01, granWin: 1, granLr: 0.1,   /* granK / granKmin: unset = plan gene d.gran.K / Kmin (v44 deepURSx3: 4 / 3; older plans 3); P.granK / P.granKmin override */ granRef: 600, granGain: 0.003,   // v42 (R89): granRef 600 (was 100; v41 = P.granRef=100)
  // R102 granDemand (0 = off, bit-identical): granules are born with no claws. A lag window (t .. t-k+1, k from granKmin to granK)
  // that has co-occurred granCo times (default 2) in a capped recent table takes an unused granule, or (granRecycle > 0) the
  // least-used granule older than granHold teaching events (0 = 32). The pool cannot exceed granN. granMap 0 = max(4096, 4*granN)
  // distinct recent patterns (LRU; not a dense n-gram matrix). Hypothesis: demand-grown claws from repeated co-occurrence vs
  // random sparse claws at the same N. Not a default — v44 stays random claws, DEFAULTS_VERSION unchanged.
  granDemand: 0, granCo: 2, granRecycle: 1, granMap: 0, granHold: 0,
  // R107 granSparse (1 = on; P.granSparse=0 = the old dense loop): the granule NLMS event visits only granules that spiked in the read window (bit-identical, faster)
  granSparse: 1,
  // I106 granFast (1 = on; P.granFast=0 = the old dense granule membrane/homeostasis loops): bit-identical active-granule bitset + lazy float32 threshold homeostasis in fastEngine mode
  granFast: 1,
  // Utility-pruned structural plasticity for granule claws (0 = off, bit-identical): starts with grown random claws and rewires lowest-utility mature claws onto unowned active lag tuples on prediction errors
  granUtility: 0,
  // Unified intensive scale-invariance (0 = off, bit-identical): when sizeF > 1, normalizes trophic survival, cone/division speed, tract fan-in, inhibitory receiver budget, mixing pool inhibition, and 1x-equivalent fan-in learning rate
  scaleInvariant: 0,
  // R123 relGrowth (0 = off, bit-identical): relative growth rules for sized regions: trophic survival vs fair share (relGrowthAlpha, default 0.5),
  //   GRN reads the fixed morphogens on the 1x lattice below 2.25x, ceil cone speed, mixing inhibition x 1x pool / pool. See develop.js / net.js.
  // R124 lagHomeo (0 = off, bit-identical): self-calibrated lag-source activity homeostat (target: one active letter column per lag source per window), see net.js
  lagHomeo: 0, lagHomeoMax: 0, lagHomeoCol: 0,
  // R125 lagWTA (0 = off, bit-identical): k-winner-take-all per lag source per read window on the lag-cell -> granule claw hits (first k columns to fire), see net.js
  lagWTA: 0,
  // R131 anSize (0 = off, bit-identical): action-channel exploration noise (pl.actNoise) x sqrt(sizeF) in a brain grown with sizeF > 1 (largest region
  //   size factor; 1x unchanged). R131: at size the arm pools start more unequal (first-trial output share max/mean 1x ~1.9-3.2, 2x up to 5.0), the same noise
  //   explores too little and arms die (never chosen, never credited); seqchoice order2 rd2rb16 4x -.53 -> +.34 vs 1x.
  anSize: 0,
  // R131 anSelf (0 = off, bit-identical): self-calibrated exploration, noise x sqrt(max/mean recent output rate) (net.js anSelfF; anSelfTau substeps, default 4000)
  anSelf: 0, anSelfTau: 4000,
  // R132 granNeg (0 = off, bit-identical): signed granule readout in granKalStep, weights in [-granNeg x wMax, wMax] (negative result on book, kept off)
  granNeg: 0,
  // R132 granKalLTD (0 = off, bit-identical): granKal's experience-weighted split for false alarms too (net.js granKalStep); negative on book30k, kept off
  granKalLTD: 0,
  // R133 granTrace (0 = off, bit-identical): fast one-shot trace on the granule readout, gated by granKal experience (net.js granTraceStep)
  granTrace: 0,
  // R134 granChunk (0 = off, bit-identical): word-context chunk detectors in the granule pool (net.js guChunkEvent / guChunkFire)
  granChunk: 0,
  granDeep: 0,   // R134: 1 = claw lag depth = delay-line length (one more source per extra region, cls 2); 0 = fixed 4 sources
  // R135: granChunkGate 1 = recruit a chunk detector only on the 2nd sighting of its key (bit sketch sized 32 x pool); granScale r = granule pool x max(1, sizeF / r); 0 = off, bit-identical
  granChunkGate: 0,
  granScale: 0,
  // R136: granPhrase 1 = second-level phrase detectors (word before last, last word, partial, letter); granGrow f > 1 = pool cap f x granN, grown on demand by the pressure gate (granChunkGate 2); 0 = off, bit-identical
  granPhrase: 0,
  granGrow: 0,
  // R137 granCat f > 0: second level of learned word categories (competitive prototypes of continuation profiles), Kmax = f x pool / 1000; 0 = off, bit-identical
  granCat: 0,
  // R138 granL2 b > 0: second-level units (granPhrase / granCat keys) get their own pool of granN x max(0, sizeF - b) / granScale cells (no claws), appended
  // after the level-1 pool, which keeps the R135 size computed with sizeF capped at b; the readout reads both. granL2N n > 0: L2 pool = n cells (overrides the
  // size rule; needs granL2 > 0). granEvGrow 1: with granGrow, a recruit that would evict a used level-1 detector adds an unborn slot instead. 0 = off, bit-identical
  granL2: 0,
  granL2N: 0,
  granEvGrow: 0,
  // R140 lagDepth D > 4: long-lag copy detectors keyed (current letter, far lag 4..D-1, letter) on a symbol-level delay register (net.js guLagEvent); lagBlur 1 = far lag blurred to octave bins. 0 = off, bit-identical
  lagDepth: 0,
  lagBlur: 0,
  lagGate: 0,   // R140: 1 = recruit copy detectors only when the key's far letter predicts the arriving letter better than the short context (net.js guLagGate)
  lagPrune: 0, lagSurp: 0,   // R140: use-time gating of copy detectors: prune when the running hit rate falls below the bigram reference / fire only when the short context is less confident (net.js guLagUse)
  lagCtx: 0,   // R140: copy keys carry the last lagCtx letters (0/1 = current letter only)
  // R126 fanInBudget (0 = off, bit-identical): sized regions keep each cell type's 1x mean in-region fan-in (strongest inputs), see develop.js
  fanInBudget: 0,
  // R127 pathBudget (0 = off, bit-identical): sized regions keep each (post type, presyn type, sign) pathway at its 1x mean in-degree, random (hash) selection, see develop.js
  pathBudget: 0,
  // R128 fateSnap (0 = off, bit-identical): with relGrowth, cell fates read the 1x-lattice morphogens at every size (R123 (b) applied only below 2.25x), see develop.js
  fateSnap: 0,
  // R128 colInh (0 = off, bit-identical; needs pathBudget): 1 = a column with no inhibitory afferents gets the nearest interneurons added (v1); 2 = dedicated reset interneurons moved from neighbouring columns (v2); 3 = v2 also for columns below half the 1x inhibitory in-degree, see develop.js
  colInh: 0,
  // R129 rgDiv (0 = off, bit-identical): with relGrowth, division reach scales with the lattice (1), plus divisions per step ~ log2 size (2), see develop.js
  rgDiv: 0,
  relGrowth: 0, relGrowthAlpha: 0, relGrowthOff: 0,   // relGrowthOff: diagnostic bitmask disabling parts (1 trophic, 2 lattice, 4 cone, 8 mixing)
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
const APP_VERSION = 'v47', DEFAULTS_VERSION = 40;   // v47 (R114): plan deepURSx3's granule layer steps its NLMS rate 0.1 -> 0.05 after 100000 teaching events (plan gene d.gran.lrT / lrLate; v46 = plan deepURSx3v46 or P.granLrT=0); 16 fresh held-out growths at book1M (y232a+b, y238a+b): +0.0038 (11/5, t 2.8); short set bit-identical (y238c); runtime unchanged.
// v46 (R106): plan deepURSx3 grows a 32000-cell granule layer (was 16000 = plan deepURSx3v45 / P.granN=16000); length bar y207 + y222 (16 growths) book300k +0.0056 vs 16000 (13/3, t 3.8), +0.0042 vs 16000 sched100k (11/4, t 2.9); full-set confirmation y223 (16 fresh growths k 2824-2839): book10k +0.0003 (8/8), book30k +0.0025 (11/5), fables4000 +0.0014 (11/4), text1000 +0.0003, K4 +0.0002, order3 / seqchoice identical (no task worse); cost ~2x v45 runtime.
// v45 (R103): plan deepURSx3 grows a 16000-cell granule layer (was 8000 = plan deepURSx3v44 / P.granN=8000); 48 fresh growths (y198a+b, y209): book10k +0.0023 (33/13), fables4000 -0.0007 (19/27, inside the pre-registered bar), text1000 +0.0002, book30k +0.0016, order3 / K4 / seqchoice not worse; y210 fresh book300k +0.0084 (8/0); cost ~1.7x v44 runtime.
// v44 (R94): plan deepURSx3 grows an 8000-cell granule layer with mixed 3- / 4-letter claws (gene d.gran K 4 / Kmin 3; was 4000 x 3 claws = plan deepURSx3v43 / P.granN=4000,P.granK=3); worker held-out y174a + y174b (fresh k 2352-2367, 16 growths, 8 tasks): book30k +0.009 (14/2), fables +0.007 (14/2), book10k 0 (8/8), text1000 -0.0003 (6/8, n.s.), order3 / K4 / seqchoice not worse; cost ~1.45x v43 runtime.
// v43 (R91): plan deepURSx3 grows a 4000-cell granule layer (was 2000 = plan deepURSx3v42 / P.granN=2000); y159 (workers, fresh k 2240-2255) + box (fresh k 2256-2271), 32 growths: book10k +0.008, book30k +0.011 (29/1), fables +0.002, text / order3 / K4 / seqchoice not worse. Worker held-out y160.
// v42 (R89): params.granRef 600 (was 100): the granule -> output synapses carry 6x the drive per unit prediction (NLMS step unchanged in prediction units); two fresh 16-growth box blocks vs v41 (k 2144-2159 R88, k 2048-2063 = y139 R89; 32 growths): book10k +0.018 / book30k +0.021 (32/0), fables +0.003 (21/11), order3 +0.002 (4/1), text1000 -0.0004 (11/14, t -1.0, n.s.), seqchoice identical; granRef 1000 not adopted (text -0.0008, t -2.4 over 32), 3000 past the peak; v41 = deepURSx3 + P.granRef=100; v41 (R84): deepURSx3 grows a 2000-cell granule layer (plan gene gran.N; claws t, t-1, t-2) projecting onto the output cells, learned by the cerebellar NLMS rule on read-window activity with a learned self-silencing gain (params granW..granGain); box 16 fresh growths k 1940-1955 vs v40: order3 +0.003 (4/3), text +0.004 (9/7), fables +0.087 (16/0), book10k +0.379 (16/0), book30k +0.381 (16/0), seqchoice identical (no granules on outcome tasks); old plan = deepURSx3v40; v40 (R77): deepURSx3's cortex preNorm 55 (was 45; y25 + y83 fresh growths k 1500-1515, no task worse; old plan = deepURSx3v39), nothing else changed; v39 (R70): deepURSx3's cortex learns at lr 0.2 (was 0.1; y02 + y08 fresh growths, no task worse; old plan = deepURSx3v37), engine and other regions unchanged; v38 (R69): params.fastEngine 1 by default (fast engine: same model and rules, float rounding differs; validated z08 1x 16 growths x 7 tasks, z09 4xS book10k 16/16 identical, z10 4xS 5 tasks 8 growths; exact engine = P.fastEngine=0), brains / plans unchanged; v37 (R64): deepURSx3's cortex learns at lr 0.1 (was 0.05) and its striatum gets v35's prediction-miss LTD back (predErr 0.3; seqchoice = v35, seq tasks unchanged); other regions unchanged; old plan = deepURSx3v36; v36 (R62): deepURSx3 without prediction-miss LTD (predErr 0) + capped metaplastic consolidation (pl.metaCap 200), seq graded decoder readIn 0.01 by default (old plan = deepURSx3v35, reproduce with readIn 0); v35 (R53): deepURSx3 learns with hybrid prediction-mismatch LTD (pl.predErr 0.3, peMode 16, peFix 0.01; old plan = deepURSx3v34); v34 (R44): deepURSx3 (unifiedR + two chained deep context areas, repressed by the outcome signal) is the default for three-phase-clock sequences/text and seqchoice; v33 (R39): unifiedR striatum = rewardE3 (q04_mixed_evolve champion's striatum, transplanted); v32 (R37): outcome present -> striatum always develops and owns the outputs, sequence areas graded and feeding it; v31 (R35): unifiedR's reward area = rewardE2 (dual-timescale eligibility, dualtag2 champion); v30 (R30 adopted): one unified genome unifiedR is the default for three-phase-clock sequences/text, bandit and random-mapping cue/recall (grows exactly predictK3 / rewardE by arealization); v27 (round 28): local connection demand (DEMAND_SC) on in predictK3 + rewardE; v26 (round 27): evolved plan rewardE is the default for bandit + random-mapping cue/recall; v25 (round 26): headless runner + dashboard; v24 (round 25): UI-only (fast mode); v23 (round 24): no default changed
const PARAM_DEFAULTS = Object.freeze(Object.assign({}, params));   // the recommended engine settings (snapshot before any UI change)
Object.assign(SpikingArena, { APP_VERSION, DEFAULTS_VERSION, PARAM_DEFAULTS, DEMAND_SC });
Object.assign(SpikingArena, { UNIFIED_PL, mulberry32, gauss, clamp, hashSeed, V_REST, V_THRESH, V_FLOOR, params, PL_DEFAULTS, PL_RANGES, NG_RANGES, CH_DEFAULTS, CH_RANGES,
  defaultPlasticity, defaultChannel, cleanPl, createNetGenome, isInput, isOutput, outputIndex, countSynapses, genomeParamCount, synapseStats, networkStats });

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
  // R71 (I87 / I80, all off by default, identical when off): sizeF > 1 scales this tissue by an AREA factor relative to its own genes:
  //   grid, coneSpeed and axonLen x sqrt(f), maxCells x f (sizeF 4 on a grid-60 region = the 4xS variant), so a region can be scaled alone;
  //   sizeNorm > 1: size-invariant synaptic scaling (see the normE / normI step); divReach > 1: daughter cells may be placed up to
  //   round(divReach) sites away (proliferation spreads as fast, in sheet units, on a finer grid).
  // R76 sizeCone (global param, 0/undefined = off, bit-identical): scale the EFFECTIVE growth-cone speed max(1, round(coneSpeed)) by sqrt(f), rounded up
  //   instead of the raw gene. A region whose gene is < 1 (striatum 0.5) moves 1 site per step at 1x; without this its scaled speed stays
  //   round(0.5 x sqrt f) = 1 site on a sqrt(f) x finer grid up to f ~ 5, so axons reach 1 / sqrt(f) as far and the output-projecting cells lose
  //   all afferents (afferent survival kills them: seqchoice outputs orphaned at striatum sizeF >= 1.5, R76).
  // R123 relGrowth (global P.relGrowth = 1; 0 / unset = off, bit-identical, no RNG change): RELATIVE growth rules for sized regions (sizeF > 1):
  //   (a) trophic survival: a neuron below the absolute sc.trophMin still survives if it gets >= relGrowthAlpha (0.5) x its FAIR share
  //       sum_t supply_t / n_t (n_t = inputs of target t), so equal-weight afferents of a big target no longer all die at once (R123 sweep: the 2.5x-4x collapse);
  //   (b) while the grid is < 1.5 x the 1x grid (sizeF < 2.25) the GRN reads the fixed morphogen fields at the centre of the 1x site each fine site
  //       lies in, so a fate stripe one 1x row thick can never fall between fine rows (R123 sweep: 1.05-1.7x unwired clock inputs, K4 1.2x 0.00);
  //       growth-cone guidance always keeps the smooth fields; at >= 1.5 rows per 1x row a stripe cannot vanish and snapping only cost (3x K8 0.80 vs 0.88);
  //   (c) growth-cone speed as sizeCone (ceil); (d) mixing feedforward inhibition per spike x 1x pool / pool (net.js, as scaleInvariant).
  //   P.relGrowthOff (diagnostic bitmask, 0 = all parts on): 1 trophic, 2 1x-lattice morphogens, 4 cone speed, 8 mixing inhibition.
  const rgOff = params.relGrowthOff | 0, rgOn = params.relGrowth > 0 && sc.sizeF > 1, rgT = rgOn && !(rgOff & 1), rgL = rgOn && !(rgOff & 2), grid1 = sc.grid > 24.5 ? Math.round(sc.grid) : CG;
  if (sc.sizeF > 1) { const q = Math.sqrt(sc.sizeF), si = params.scaleInvariant > 0 || sc.scaleInvariant > 0, rgC = params.relGrowth > 0 && !(rgOff & 4); sc.grid = (sc.grid > 24.5 ? sc.grid : CG) * q; sc.maxCells *= sc.sizeF; sc.coneSpeed = (params.sizeCone > 0 || si || rgC) ? Math.ceil(Math.max(1, Math.round(sc.coneSpeed || 1)) * q - 1e-9) : (sc.coneSpeed || 1) * q; sc.axonLen *= q; if (si) { sc.trophMin /= sc.sizeF; sc.divRep = Math.max(sc.divRep || 1, Math.ceil(Math.log2(sc.sizeF))); sc.divReach = Math.max(sc.divReach || 1, Math.ceil(q - 1e-9)); }
    if (params.rgDiv > 0 && params.relGrowth > 0) { sc.divReach = Math.max(sc.divReach || 1, Math.ceil(q - 1e-9)); if (params.rgDiv >= 2) sc.divRep = Math.max(sc.divRep || 1, Math.ceil(Math.log2(sc.sizeF))); } }   // R129 rgDiv (global, 0 = off, bit-identical): clones spread the same PHYSICAL distance per developmental step at any size (division reach ~ lattice refinement; 2: also divisions per step ~ log2 size), so late edge territory is not fated differently (R128: edge columns lost their interneurons at 4x)
  const GS = sc.grid > 24.5 ? Math.round(sc.grid) : CG, h = 2 / GS, NS = GS * GS, H = CH_H;
  const sx = i => -1 + (i + 0.5) * h, cidx = v => clamp(Math.floor((v + 1) / h), 0, GS - 1);
  // fixed morphogen fields (analytic steady state of diffusion + decay from the sources)
  const gL = grid1, snap = rgL && (GS < 1.5 * grid1 || params.fateSnap > 0), h1 = 2 / gL, s1 = v => -1 + (Math.min(gL - 1, Math.max(0, Math.floor((v + 1) / h1))) + 0.5) * h1;   // R123 relGrowth (b): centre of the nested-lattice site   // R128 fateSnap (global, 0 = off, bit-identical): (b) at every size (cell fates read the 1x-lattice morphogens; edge fate stripes, e.g. a column's interneurons, cannot fall off the region)
  const lam = d.lam, chem = Array.from({ length: CH_NCHEM }, () => new Float32Array(NS));
  const eyes = spec.cueSources, motors = OUT.map(o => o.pos);
  const fixedAt = (F, x, y, q) => {
    F[0][q] = Math.exp(-Math.abs(x) / lam[0]);
    F[1][q] = Math.exp(-(1 - y) / lam[1]);
    let e = 0; for (const p of eyes) e = Math.max(e, Math.exp(-Math.hypot(x - p[0], y - p[1]) / lam[2])); F[2][q] = e;
    let m = 0; for (const p of motors) m = Math.max(m, Math.exp(-Math.hypot(x - p[0], y - p[1]) / lam[3])); F[3][q] = m;
    F[6][q] = Math.exp(-Math.abs(y - Y_CENTRAL) / lam[6]);
  };
  for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) fixedAt(chem, sx(i), sx(j), j * GS + i);
  // R123 relGrowth (b): the GRN (fate) reads the fixed fields on the 1x lattice; growth cones keep the smooth fine fields (snapping them too
  // flattened the guidance gradients: 3x / 4x seed 11 0.81 / 0.79 vs 0.96)
  const chemG = snap ? chem.map((a, k) => [0, 1, 2, 3, 6].includes(k) ? new Float32Array(NS) : a) : chem;
  if (snap) for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) fixedAt(chemG, s1(sx(i)), s1(sx(j)), j * GS + i);
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
    for (let k = 0; k < CH_NCHEM; k++) u[k] = Math.min(2, chemG[k][q]);
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
  const DREP = sc.divRep > 1 ? Math.round(sc.divRep) : 1;   // R71 divRep (I80): divisions per dividing cell per developmental step
  const DR = sc.divReach > 1 ? Math.round(sc.divReach) : 1, NDIV = DR > 1 ? [] : N8;   // R71: division placement neighbourhood
  if (DR > 1) for (let b2 = -DR; b2 <= DR; b2++) for (let a2 = -DR; a2 <= DR; a2++) if (a2 || b2) NDIV.push([a2, b2]);
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
        for (let rep = 0; rep < DREP; rep++) {   // R71 divRep: a dividing cell may divide up to divRep times per developmental step (1 = as before)
        if (rep > 0 && !(r() < sc.pDiv * (o[CO.DIV] - 0.5) * 2 && nAlive() < sc.maxCells)) break;
        const free = NDIV.map(([a, b]) => [c.i + a, c.j + b]).filter(([i, j]) => freeSite(i, j));
        if (free.length) {
          const [i, j] = free[(r() * free.length) | 0], noise = Array.from({ length: H }, (_, k) => k < 8 ? gauss(r) * 0.02 : 0);   // (8: keeps old genomes' random stream)
          const dc = newCell(i, j, c.s, c.id); dc.born = t; for (let k = 0; k < H; k++) dc.s[k] += noise[k];
          if (tw && tw.alive) { const dt = newCell(mi(i), j, tw.s, tw.id); dt.born = t; for (let k = 0; k < H; k++) dt.s[k] += noise[k]; dc.twin = dt; dt.twin = dc; dt.isTwin = true; }
        } else break; }
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
    const tro = new Map(); let fair = null;
    for (let it = 0; it < 4; it++) {
      const supply = new Map(); for (let m = 0; m < nOut; m++) supply.set('m' + m, 1);
      for (const [id, v] of tro) supply.set(id, 0.7 * v + sc.trophHid);   // hidden targets give some factor too (gene trophHid)
      if (sc.trophHid > 0) for (const c of neurons) if (!supply.has(c.id)) supply.set(c.id, sc.trophHid);
      const inSum = new Map();
      for (const s of live) if (s.pre >= 0) inSum.set(s.post, (inSum.get(s.post) || 0) + Math.abs(s.w));
      const nt = new Map(); for (const c of neurons) nt.set(c.id, 0);
      for (const s of live) if (s.pre >= 0 && supply.has(s.post)) nt.set(s.pre, nt.get(s.pre) + supply.get(s.post) * Math.abs(s.w) / inSum.get(s.post));
      if (rgT && it === 3) { const nIn_ = new Map(); for (const s of live) if (s.pre >= 0) nIn_.set(s.post, (nIn_.get(s.post) || 0) + 1);   // R123 relGrowth (a): fair share
        fair = new Map(); for (const s of live) if (s.pre >= 0 && supply.has(s.post)) fair.set(s.pre, (fair.get(s.pre) || 0) + supply.get(s.post) / nIn_.get(s.post)); }
      tro.clear(); for (const [k, v] of nt) tro.set(k, v);
    }
    const rgA = params.relGrowthAlpha > 0 ? params.relGrowthAlpha : 0.5;
    for (const c of neurons) if (tro.get(c.id) < sc.trophMin && !(fair && tro.get(c.id) >= rgA * (fair.get(c.id) || 0) && fair.has(c.id))) { kill(c, T + 1, 'trophic'); trophicDeaths++; }   // (t: recorder timeline only)
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
  // R126 fanInBudget (global P.fanInBudget = 1; 0 / unset = off, bit-identical, no RNG; acts only on regions with sizeF > 1): a SIZE-INDEPENDENT
  //   afferent budget. A 1x reference growth of the same genome and seed (sizeF 1) gives each hidden cell type t its mean in-region fan-in B_t at this
  //   stage (synapses placed, before normE / normI and the juvenile phase). Here, if the type's mean n_t > B_t, every cell of the type keeps only its
  //   strongest (largest |w|) ceil(n_i x B_t / n_t) inputs of each sign (excitatory and inhibitory budgets separate; proportional cut: type mean ~ B_t); normE / normI then
  //   re-normalise the kept inputs. Tracts and granule claws (regions.js) are not touched. (R123 RATIOS: sheet fan-in grows ~N^1.3 otherwise.)
  if (opts.__fanRef || (params.fanInBudget > 0 && sc.sizeF > 1)) {   // (excitatory and inhibitory inputs are budgeted separately: one pooled |w| ranking dropped every inhibitory input, R126 v1)
    const h0 = nIn, h1 = nIn + neurons.length, fanE = new Int32Array(N), fanI = new Int32Array(N), byT = new Map();
    for (let b2 = h0; b2 < h1; b2++) { let ne = 0, ni = 0; for (let a2 = 0; a2 < h1; a2++) { const w = g.W[a2 * N + b2]; if (w > 0) ne++; else if (w < 0) ni++; } fanE[b2] = ne; fanI[b2] = ni;
      const t = g.cellType[b2], e = byT.get(t) || [0, 0, 0]; e[0] += ne; e[1] += ni; e[2]++; byT.set(t, e); }
    if (opts.__fanRef) opts.__fanRef.B = new Map([...byT].map(([t, e]) => [t, [e[0] / e[2], e[1] / e[2]]]));
    else { const o1 = { seed: opts.seed, spec, __fanRef: {} }; growCell(Object.assign({}, d, { sc: Object.assign({}, d.sc, { sizeF: 1 }) }), o1); const B = o1.__fanRef.B; let cut = 0;
      for (let b2 = h0; b2 < h1; b2++) { const t = g.cellType[b2], e = byT.get(t), Bt = B.get(t); if (!Bt) continue;
        for (let sg = 0; sg < 2; sg++) { const n = sg ? fanI[b2] : fanE[b2], mean = e[sg] / e[2], Bs = Bt[sg]; if (!(Bs > 0) || !(mean > Bs)) continue;
          const keep = Math.ceil(n * Bs / mean); if (keep >= n) continue; const L = [];
          for (let a2 = 0; a2 < h1; a2++) { const w = g.W[a2 * N + b2]; if (sg ? w < 0 : w > 0) L.push(a2); }
          L.sort((x, y) => Math.abs(g.W[y * N + b2]) - Math.abs(g.W[x * N + b2]) || x - y);
          for (let k = keep; k < L.length; k++) { const q = L[k] * N + b2; g.W[q] = 0; g.P[q] = 0; if (g.C) g.C[q] = 0; cut++; } } }
      g.fanCut = cut; }
  }
  // R127 pathBudget (global P.pathBudget = 1; 0 / unset = off, bit-identical, no RNG; acts only on regions with sizeF > 1): SIZE-INDEPENDENT fan-in PER
  //   AFFERENT PATHWAY. A pathway = (presynaptic hidden cell type, sign) into a postsynaptic cell type (e.g. letter column -> lag column = feed-forward,
  //   lag column -> lag column = own-column recurrence, other in-region types, inhibitory types). A 1x reference growth of the same genome and seed (sizeF 1)
  //   gives each (post type, pathway) its mean count B. Here every cell keeps ceil(n_i x B / mean) inputs of each pathway whose type mean exceeds B, chosen
  //   at RANDOM within the pathway by a deterministic hash of (seed, pre, post) (no RNG stream used; never by weight: R126b showed weights carry a fixed
  //   genome margin, so ranking by |w| deletes whole pathways). Env (sensory) inputs, tracts and granule claws are not touched. normE / normI follow.
  if (opts.__pathRef || (params.pathBudget > 0 && sc.sizeF > 1)) {
    const h0 = nIn, h1 = nIn + neurons.length, key = (a2, w) => g.cellType[a2] * 2 + (w < 0 ? 1 : 0), cnt = new Map(), byT = new Map();   // cnt: post cell -> Map(path -> n)
    for (let b2 = h0; b2 < h1; b2++) { const m = new Map(); for (let a2 = h0; a2 < h1; a2++) { const w = g.W[a2 * N + b2]; if (w !== 0) { const k = key(a2, w); m.set(k, (m.get(k) || 0) + 1); } } cnt.set(b2, m);
      const t = g.cellType[b2]; let e = byT.get(t); if (!e) byT.set(t, e = { n: 0, s: new Map() }); e.n++; for (const [k, v] of m) e.s.set(k, (e.s.get(k) || 0) + v); }
    const mean = new Map(); for (const [t, e] of byT) { const mm = new Map(); for (const [k, v] of e.s) mm.set(k, v / e.n); mean.set(t, mm); }
    if (opts.__pathRef) opts.__pathRef.B = mean;
    else { const o1 = { seed: opts.seed, spec, __pathRef: {} }; growCell(Object.assign({}, d, { sc: Object.assign({}, d.sc, { sizeF: 1 }) }), o1); const B = o1.__pathRef.B; let cut = 0;
      const sd = (opts.seed | 0) ^ 0x5bd1e995, hsh = (a2, b2) => { let h = Math.imul(sd ^ Math.imul(a2 + 1, 0x9e3779b1), 0x85ebca6b) ^ Math.imul(b2 + 1, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); return (h ^ (h >>> 13)) >>> 0; };
      const st = {};
      for (let b2 = h0; b2 < h1; b2++) { const t = g.cellType[b2], Bt = B.get(t), Mt = mean.get(t); if (!Bt) continue;
        for (const [k, n] of cnt.get(b2)) { const Bk = Bt.get(k) || 0, mk = Mt.get(k); if (!(mk > Bk) || !(Bk > 0)) continue;   // (pathways absent at 1x are left as grown)
          const keep = Math.ceil(n * Bk / mk); if (keep >= n) continue; const L = [];
          for (let a2 = h0; a2 < h1; a2++) { const w = g.W[a2 * N + b2]; if (w !== 0 && key(a2, w) === k) L.push(a2); }
          L.sort((x, y) => hsh(x, b2) - hsh(y, b2) || x - y);
          for (let q2 = keep; q2 < L.length; q2++) { const q = L[q2] * N + b2; g.W[q] = 0; g.P[q] = 0; if (g.C) g.C[q] = 0; cut++; } } }
      g.pathCut = cut;
      // R128 colInh (global P.colInh = 1, needs pathBudget; 0 = off, bit-identical, no RNG; sizeF > 1 only): every column keeps its inhibitory loop.
      //   A column = the cells of one type with one topo label. If a column of type T grew NO inhibitory afferents while T has inhibitory pathways at 1x
      //   (R127: edge columns at 4x can fall outside the interneuron stripe), its cells get the 1x mean count of each inhibitory pathway J -> T from the
      //   nearest cells of type J, and those J cells get the 1x mean count of T -> J excitatory inputs from the column (deterministic: nearest first,
      //   index tie-break); new weights = this brain's mean weight of the pathway. normE / normI follow.
      if (params.colInh > 0 && g.topo) { const cols = new Map(); let added = 0;
        for (let b2 = h0; b2 < h1; b2++) { const tp = g.topo[b2]; if (tp !== tp) continue; const k = g.cellType[b2] + ':' + Math.round(tp * 1e4); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(b2); }
        const meanW = (pre, post, neg) => { let s2 = 0, n2 = 0; for (let a2 = h0; a2 < h1; a2++) { if (g.cellType[a2] !== pre) continue; for (let b2 = h0; b2 < h1; b2++) { if (g.cellType[b2] !== post) continue; const w = g.W[a2 * N + b2]; if (neg ? w < 0 : w > 0) { s2 += w; n2++; } } } return n2 ? s2 / n2 : 0; };
        const mwC = new Map(), mw = (pre, post, neg) => { const k = pre + ',' + post + ',' + neg; if (!mwC.has(k)) mwC.set(k, meanW(pre, post, neg)); return mwC.get(k); };
        const colOf = new Map(); for (const [k, C] of cols) for (const b2 of C) colOf.set(b2, k);
        const home = (a2, T) => { const c = new Map(); for (let b3 = h0; b3 < h1; b3++) if (g.cellType[b3] === T && g.W[b3 * N + a2] > 0 && colOf.has(b3)) { const k = colOf.get(b3); c.set(k, (c.get(k) || 0) + 1); } let bk = null, bn = 0; for (const [k, n] of c) if (n > bn) { bn = n; bk = k; } return bk; };
        for (const [ck, C] of cols) { const T = g.cellType[C[0]], Bt = B.get(T); if (!Bt) continue; let nI = 0; const have = new Set(); for (const b2 of C) for (let a2 = h0; a2 < h1; a2++) if (g.W[a2 * N + b2] < 0) { nI++; have.add(a2); }
          let bI = 0; for (const [k, Bk] of Bt) if (k & 1) bI += Bk;
          if (params.colInh >= 3 ? nI >= 0.5 * bI * C.length : nI > 0) continue;   // v3: also columns with less than half the 1x inhibitory in-degree (partial orphans); existing interneurons are kept
          if (params.colInh >= 2) {   // v2: DEDICATED reset interneurons, moved from neighbouring columns (each donor keeps >= half of its own)
            let cx = 0, cy = 0; for (const b2 of C) { cx += g.pos[b2][0]; cy += g.pos[b2][1]; } cx /= C.length; cy /= C.length;
            for (const [k, Bk] of Bt) { if (!(k & 1) || !(Bk > 0)) continue; const J = k >> 1; let hJ = 0; for (const a2 of have) if (g.cellType[a2] === J) hJ++; const K = params.colInh >= 3 ? Math.max(0, Math.round(Bk) - hJ) : Math.max(1, Math.round(Bk)); if (!K) continue;
              const cand = []; for (let a2 = h0; a2 < h1; a2++) if (g.cellType[a2] === J) cand.push(a2); cand.sort((x, y) => Math.hypot(g.pos[x][0] - cx, g.pos[x][1] - cy) - Math.hypot(g.pos[y][0] - cx, g.pos[y][1] - cy) || x - y);
              const hc = new Map(); for (const a2 of cand) { const hk = home(a2, T); if (hk != null) hc.set(hk, (hc.get(hk) || 0) + 1); }
              const taken = new Map(), pick = [];
              for (const a2 of cand) { if (pick.length >= K) break; const hk = home(a2, T); if (hk == null || hk === ck || have.has(a2)) continue; const t2 = taken.get(hk) || 0; if (t2 + 1 > Math.floor((hc.get(hk) || 0) / 2)) continue; taken.set(hk, t2 + 1); pick.push(a2); }
              for (const a2 of pick) { const eW = []; for (let b3 = h0; b3 < h1; b3++) if (g.cellType[b3] === T) { const q = b3 * N + a2; if (g.W[q] > 0) { eW.push(g.W[q]); g.W[q] = 0; g.P[q] = 0; if (g.C) g.C[q] = 0; } }
                let iS = 0, iN = 0; for (let b2 = h0; b2 < h1; b2++) if (g.cellType[b2] === T) { const q = a2 * N + b2; if (g.W[q] < 0) { iS += g.W[q]; iN++; g.W[q] = 0; g.P[q] = 0; if (g.C) g.C[q] = 0; } }
                const wI = iN ? iS / iN : mw(J, T, true), wE = eW.length ? eW.reduce((u, v) => u + v, 0) / eW.length : mw(T, J, false);
                const src2 = C.slice().sort((x, y) => Math.hypot(g.pos[x][0] - g.pos[a2][0], g.pos[x][1] - g.pos[a2][1]) - Math.hypot(g.pos[y][0] - g.pos[a2][0], g.pos[y][1] - g.pos[a2][1]) || x - y).slice(0, Math.max(1, eW.length));
                for (const b3 of src2) { g.W[b3 * N + a2] = wE; added++; }
                for (const b2 of C) { g.W[a2 * N + b2] = wI; added++; } } }
            continue; }
          let cx = 0, cy = 0; for (const b2 of C) { cx += g.pos[b2][0]; cy += g.pos[b2][1]; } cx /= C.length; cy /= C.length;
          for (const [k, Bk] of Bt) { if (!(k & 1) || !(Bk > 0)) continue; const J = k >> 1, nPer = Math.max(1, Math.round(Bk)), wI = mw(J, T, true); if (!wI) continue;
            const cand = []; for (let a2 = h0; a2 < h1; a2++) if (g.cellType[a2] === J) cand.push(a2); cand.sort((x, y) => Math.hypot(g.pos[x][0] - cx, g.pos[x][1] - cy) - Math.hypot(g.pos[y][0] - cx, g.pos[y][1] - cy) || x - y);
            const S2 = cand.slice(0, nPer); if (!S2.length) continue; const BJ = B.get(J), bE = BJ ? BJ.get(T * 2) || 0 : 0, nE = Math.max(1, Math.round(bE)), wE = mw(T, J, false);
            for (const b2 of C) for (const a2 of S2) { const q = a2 * N + b2; if (g.W[q] === 0) { g.W[q] = wI; added++; } }
            if (wE > 0) for (const a2 of S2) { const src2 = C.slice().sort((x, y) => Math.hypot(g.pos[x][0] - g.pos[a2][0], g.pos[x][1] - g.pos[a2][1]) - Math.hypot(g.pos[y][0] - g.pos[a2][0], g.pos[y][1] - g.pos[a2][1]) || x - y).slice(0, nE);
              for (const b3 of src2) { const q = b3 * N + a2; if (g.W[q] === 0) { g.W[q] = wE; added++; } } } } }
        g.colInhAdded = added; } }
  }
  if (clawFibreCells && clawFibreCells.size && sc.clawNorm > 0) {   // cells whose fibres reach claw cells, and the claw cells they reach
    g._fib = new Set(); for (const id of clawFibreCells) if (idx.has(id)) g._fib.add(idx.get(id));
    g._fed = new Set(); for (const id of clawFed) if (idx.has(id)) g._fed.add(idx.get(id)); }
  // synaptic scaling of total hidden->X input (genes normE / normI; off below 1)
  if (sc.normE >= 1 || sc.normI >= 1 || sc.clawNorm > 0 || sc.mixNorm > 0) {
    const h0 = nIn, h1 = nIn + neurons.length, CS = colLists(g.W, N, h0, h1, h0), cS = CS.st, cA = CS.a;   // (R66: hidden inputs of each cell, ascending: the dense column scans without the zeros)
    for (let b = h0; b < N; b++) {
      let e = 0, i = 0, ne = 0, ni = 0; for (let u = cS[b], z = cS[b + 1]; u < z; u++) { const w = g.W[cA[u] * N + b]; if (w > 0) { e += w; ne++; } else if (w < 0) { i -= w; ni++; } }
      const claw = sc.clawNorm > 0 && b < h1 && neurons[b - h0].o[CO.CLAW] > 0.5;
      if (claw && g._fib && g._fed.has(b)) {   // claw cell with parallel-fibre input: input from fibre-sending cells and the rest get half of the budget each
        let ef = 0; for (let u = cS[b], z = cS[b + 1]; u < z; u++) { const a = cA[u], q = a * N + b; if (g.W[q] > 0 && g._fib.has(a)) ef += g.W[q]; }
        if (ef > 0 && e - ef > 0) { const ff = sc.clawNorm / 2 / ef, fd = sc.clawNorm / 2 / (e - ef);
          for (let u = cS[b], z = cS[b + 1]; u < z; u++) { const a = cA[u], q = a * N + b; if (g.W[q] > 0) g.W[q] *= g._fib.has(a) ? ff : fd; } continue; }
      }
      const mixC = sc.mixNorm > 0 && b < h1 && neurons[b - h0].o[CO.MIX] > 0.5;
      // R71 sizeNorm s > 1: the normE / normI set point becomes min(set point, n x wMax / s) for a cell with n such inputs. At 1x few-input cells
      //   are held below the set point by the wMax clamp (e.g. 3 inhibitory inputs x 30 = 90 < normI 200); a brain with s times the cells gives
      //   them s times the inputs and the full set point (inhibition doubles). With s = the area factor the total stays at its 1x value.
      const sN = sc.sizeNorm > 1 ? sc.sizeNorm : 0, tE = sN ? Math.min(sc.normE, ne * params.wMax / sN) : sc.normE, tI = sN ? Math.min(sc.normI, ni * params.wMax / sN) : sc.normI;
      const fe = claw && e > 0 ? sc.clawNorm / e : mixC && e > 0 ? sc.mixNorm / e : sc.normE >= 1 && e > 0 ? tE / e : 1, fi = sc.normI >= 1 && i > 0 ? tI / i : 1;
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
  const incS = new Int32Array(N + 1), inc = new Int32Array(E); for (let k = 0; k < E; k++) incS[net.posts[k] + 1]++; for (let i = 0; i < N; i++) incS[i + 1] += incS[i];   // incoming CSR (R66: typed, same order)
  { const f = incS.slice(0, N); for (let k = 0; k < E; k++) inc[f[net.posts[k]]++] = k; }
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
        if (f !== 1) for (let q = incS[i], q1 = incS[i + 1]; q < q1; q++) { const k = inc[q]; net.ws[k] = clamp(net.ws[k] * f, -params.wMax, params.wMax); }
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

/* =====================================================================
 * regions.js (v21, round 22) — MULTI-REGION BRAINS: several tissues (regions), each grown by its own gene program,
 * linked by long-range TRACTS.
 *
 * A region genome is { kind: 'regions', label, regions: [...], tracts: [...] }:
 *   region = { name, color, g: <cell genome>, inputs: [rule...], outputs: true|false }
 *     input rules build the region's own sensory surface (its local IO spec):
 *       { env: '<env input group>', tag? }   the env's channels of that group, address tag remapped (tag) or kept
 *       { tract: '<name>', like: '<env group>', tag }   one placeholder channel per channel of that env group (same
 *             positions / column labels): the arrival zone of a tract from another region
 *     outputs: true = this region carries the env's outputs (motor / prediction region); one region per brain.
 *   tract  = { name, from: { region, cls }, map: 'topo' | 'claw', to: ... }
 *     'topo' (to: { region, tract: name }): every neuron of class cls (address-tag class) in the source region projects,
 *             column by column (its topographic label), to the cells that the placeholder channel with the same
 *             label contacted during growth; the placeholder's synapse weight is shared by the source cells.
 *     'all' (to: { region, wTot }, plastic): every source cell -> every excitatory plastic receiver of the target region
 *             (parallel fibres), each pair with probability p (default 1), total weight ~wTot per target, plastic synapses.
 *     'claw' (to: { region, mix: true, w }): every MIXING cell of the target region keeps the axons of ONE source column
 *             (balanced over columns, random order), total weight w: a long-range input to the association layer.
 * Growth: each region grows on its own tissue (its own morphogens, bands and cell types; its own juvenile phase); the
 * tracts are then laid between the grown regions (axon pathfinding between tissues is not simulated cell by cell:
 * the tract rule says which population projects where, and the map says how the axons choose their targets).
 * The result is one ordinary network (one SpikingNet; env inputs and outputs keep their indices) with a region id per
 * neuron (g.region) for the viewer. Plasticity genes / dopamine channels: those of the output region.
 * ===================================================================== */
'use strict';
function regionSpec(envSpec, R) {
  const E = envSpec.inputs, ins = [], map = [];          // map[local input] = env input index, or { tract, label }
  for (const rule of R.inputs) {
    if (rule.env) E.forEach((c, i) => { if (c.group === rule.env) { ins.push(Object.assign({}, c, rule.tag != null ? { tag: rule.tag } : {})); map.push(i); } });
    else if (rule.tract) E.forEach((c, i) => { if (c.group === rule.like) { ins.push(Object.assign({}, c, { name: rule.tract + '_' + c.name, group: rule.tract, tag: rule.tag })); map.push({ tract: rule.tract, label: c.topo }); } });
  }
  const J = envSpec.juvenile, loc = i => map.indexOf(i);
  const waves = ins.map((c, i) => i).filter(i => ins[i].cue || ins[i].topo != null);
  const juvenile = { waves: [waves], waveGain: J.waveGain, tonic: (J.tonic || []).map(([i, v]) => [loc(i), v]).filter(t => t[0] >= 0),
                     kicks: J.kicks ? Object.assign({}, J.kicks, { chans: ins.map((c, i) => i).filter(i => !ins[i].tonic && ins[i].diffuse) }) : null };
  if (juvenile.kicks && !juvenile.kicks.chans.length) juvenile.kicks = null;
  const spec = makeSpec({ inputs: ins, outputs: (R.outputs || R.vote) ? envSpec.outputs : [], classes: envSpec.classes, tagNames: envSpec.tagNames, juvenile });
  spec.key += '|region ' + R.name; return { spec, map };
}
/* R66 SPARSE MERGE: the merged brain's synapses are collected as contributions (pre, post, weight, plastic flag, channel) and
 * merged in (pre, post) order, contributions to one pair summed in their original order with float32 rounding: exactly the values
 * the dense N x N matrices held (G.W[q] += w), without allocating them (4xS: 0.84 GB). G.sp = { pre, post, w, p, c } (sorted,
 * non-zero weights); G.W / G.P / G.C stay readable: the dense matrices are built on first access (viewer, export, need-growth). */
class SynAcc {
  constructor(n) { this.n = 0; this.a = new Int32Array(n); this.b = new Int32Array(n); this.w = new Float64Array(n); this.p = new Uint8Array(n); this.c = new Uint8Array(n); }
  grow() { const m = this.a.length * 2; for (const k of ['a', 'b', 'w', 'p', 'c']) { const o = this[k], x = new o.constructor(m); x.set(o); this[k] = x; } }
  add(a, b, w, p, c) { if (this.n === this.a.length) this.grow(); const k = this.n++; this.a[k] = a; this.b[k] = b; this.w[k] = w; this.p[k] = p; this.c[k] = c; }
  finish(N, wMax) {                         // stable LSD radix (by post, then by pre) -> merge equal pairs in insertion order
    const n = this.n, A = this.a, B = this.b, cnt = new Int32Array(N + 1), t = new Int32Array(n), o = new Int32Array(n);
    for (let k = 0; k < n; k++) cnt[B[k] + 1]++; for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
    for (let k = 0; k < n; k++) t[cnt[B[k]]++] = k;
    cnt.fill(0); for (let k = 0; k < n; k++) cnt[A[k] + 1]++; for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
    for (let q = 0; q < n; q++) { const k = t[q]; o[cnt[A[k]]++] = k; }
    const pre = new Int32Array(n), post = new Int32Array(n), w = new Float32Array(n), p = new Uint8Array(n), c = new Uint8Array(n), f = Math.fround, wM = f(wMax);
    let m = 0;
    for (let q = 0; q < n;) { const k0 = o[q], a = A[k0], b = B[k0]; let x = 0, pl = 0, ch = 0;
      for (; q < n && A[o[q]] === a && B[o[q]] === b; q++) { const k = o[q]; x = f(x + this.w[k]); if (this.p[k]) pl = 1; if (this.c[k]) ch = this.c[k]; }
      if (x > wMax) x = wM;
      if (x !== 0) { pre[m] = a; post[m] = b; w[m] = x; p[m] = pl; c[m] = ch; m++; } }
    return { pre: pre.slice(0, m), post: post.slice(0, m), w: w.slice(0, m), p: p.slice(0, m), c: c.slice(0, m) };
  }
}
function gcHint() { const B = globalThis.Bun; if (B && B.gc) B.gc(true); else if (typeof globalThis.gc === 'function') globalThis.gc(); }   // R66: collect growth garbage between regions (lower peak RSS; results unaffected)
function attachSparse(G, sp) {              // G.W / P / C: dense on first read (or null once dropped)
  Object.defineProperty(G, 'sp', { value: sp, writable: true, configurable: true, enumerable: false });
  const M = { W: null, P: null, C: null, done: false };
  const mat = () => { if (M.done) return; M.done = true; const S = G.sp; if (!S) return; const N = G.N;
    M.W = new Float32Array(N * N); M.P = new Uint8Array(N * N); M.C = new Uint8Array(N * N);
    for (let k = 0; k < S.pre.length; k++) { const q = S.pre[k] * N + S.post[k]; M.W[q] = S.w[k]; M.P[q] = S.p[k]; M.C[q] = S.c[k]; } };
  for (const key of ['W', 'P', 'C']) Object.defineProperty(G, key, { enumerable: true, configurable: true,
    get() { mat(); return M[key]; }, set(v) { M.done = true; M[key] = v; if (v === null) G.sp = null; } });
  return G;
}
function granuleLayer(G, parts, outPart, node, acc, nG, gOff, nIn, nHid, seed, gd, nL2) {
  // v44 (R94): claw counts from P.granK / P.granKmin if set, else the plan gene d.gran.K / d.gran.Kmin (deepURSx3 v44: 4 / 3), else 3 (v41-v43); P.granK without P.granKmin = all granules granK claws
  const gK = params.granK != null ? (params.granK || 2) : gd && gd.K > 0 ? gd.K : 3, gKm = params.granKmin > 0 ? params.granKmin : params.granK == null && gd && gd.Kmin > 0 ? gd.Kmin : 0;
  const oi = parts.indexOf(outPart), og = outPart.g, K = Math.max(1, Math.min(params.granDeep > 0 ? 1 + parts.length : 4, Math.round(gK))), Km = gKm > 0 ? Math.max(1, Math.min(K, Math.round(gKm))) : K, W = params.granW > 0 ? params.granW : 80;
  let mi = -1; for (let i = og.nIn; i < og.nIn + og.nHid; i++) if (og.mix && og.mix[i]) { mi = i; break; }
  const th = params.granThr > 0 ? params.granThr : mi >= 0 ? og.thresh[mi] : 20, lk = mi >= 0 ? og.leak[mi] : 0.9;
  const oth = parts.filter(p => p !== outPart), other = oth[0], srcs = [[outPart, params.granC0 >= 0 ? params.granC0 : 0], [outPart, 2], [other, 2], [oth[1] || other, 2]].concat(params.granDeep > 0 ? oth.slice(2).map(p => [p, 2]) : []).slice(0, K);   // R84: 4th source = the second context region's cls 2 (t-3)   // R134 granDeep (P.granDeep = 1; off = unchanged): lag depth = the delay-line length: one claw source per further region's cls 2 (t-4, ...), K cap 1 + #regions
  const colsOf = ([p, c]) => { const m = new Map(); for (let i = p.g.nIn; i < p.g.nIn + p.g.nHid; i++) if (p.g.cellType[i] === N_FIXED + c && p.g.topo && !isNaN(p.g.topo[i])) { const k = Math.round(p.g.topo[i] * 1e4); if (!m.has(k)) m.set(k, []); m.get(k).push(node(p, i)); } return m; };
  const C = srcs.map(colsOf), r = mulberry32((seed ^ 0x6a7a11) >>> 0);
  G.gran = new Uint8Array(G.N);
  if (gd && gd.lrT > 0) G.granSch = { T: gd.lrT, late: gd.lrLate > 0 ? gd.lrLate : 0 };   // v47 (R114): plan gene d.gran.lrT / lrLate = the granule step schedule (net.js granStep; P.granLrT overrides, P.granLrT=0 = fixed granLr)
  // R102 granDemand (P.granDemand > 0): do not draw random claws. The same granN cells stay reserved (the cap) and net.js
  // wires a claw when that lag window has co-occurred granCo times. Off: the loop below is the v41–v44 random claw, unchanged.
  const packSrc = () => C.map(m => { const keys = [...m.keys()].sort((a, b) => a - b), off = new Int32Array(keys.length + 1); let n = 0; for (const k of keys) n += m.get(k).length; const cells = new Int32Array(n); let p = 0;
    for (let i = 0; i < keys.length; i++) { off[i] = p; const S = m.get(keys[i]); for (let t = 0; t < S.length; t++) cells[p++] = S[t]; } off[keys.length] = p; return { keys: Int32Array.from(keys), off, cells }; });
  const chunkPart = gd && gd.chunkFrac > 0 ? parts.find(p => p.R && p.R.name === 'chunk context') : null;
  const Cchunk = chunkPart ? colsOf([chunkPart, 2]) : null, jChunk0 = Cchunk && Cchunk.size ? Math.floor(nG * (1 - gd.chunkFrac)) : nG;
  if (!(params.granDemand > 0)) {
    const rsv0 = params.granReserve > 0 && params.granUtility === 2 ? Math.max(0, nG - Math.round(params.granReserve)) : -1;
    const l2 = nL2 > 0 && params.granUtility === 2 ? nG - nL2 : -1, nG1 = l2 >= 0 ? l2 : nG;   // R138 granL2: cells [l2, nG) = the level-2 pool (no claws, no RNG draws)
    const nB = params.granGrow > 1 && params.granUtility === 2 ? Math.round(nG1 / params.granGrow) : -1;   // R136 granGrow: born part of the pool
    const pk = packSrc(), keyIdx = pk.map(s => { const m = new Map(); for (let i = 0; i < s.keys.length; i++) m.set(s.keys[i], i); return m; }), initKeys = new Array(nG);
  for (let j = 0; j < nG; j++) { const b = gOff + j; G.gran[b] = 1; G.pos[b] = [3 + 0.5 * Math.cos(j), 0.5 + 0.5 * Math.sin(j * 1.7)]; G.cellType[b] = N_FIXED + 15; G.region[b] = oi; G.thresh[b] = th; G.leak[b] = lk;
    if ((rsv0 >= 0 && j >= rsv0) || (nB >= 0 && j >= nB) || (l2 >= 0 && j >= l2)) { initKeys[j] = null; continue; }   // (R136 granGrow: unborn cells too, no RNG draws)   // R119 granReserve: the last granReserve granules grow no claws (recruited later by granUtility 2); no RNG draws
    const k = Km === K ? K : Km + ((r() * (K - Km + 1)) | 0);   // R84 granKmin: each granule takes k in [granKmin, granK] claws from the first k sources (lags t .. t-k+1; a mixture of n-gram orders)
    let ik = String(k);
    for (let c = 0; c < k; c++) { const useCh = j >= jChunk0 && c === k - 1, m = useCh ? Cchunk : C[c], keys = [...m.keys()]; if (!keys.length) continue; const chosen = keys[(r() * keys.length) | 0], S = m.get(chosen), ws = W / k / S.length; for (const A of S) acc.add(A, b, ws, 0, 0); ik += ',' + (useCh ? 'c' + chosen : keyIdx[c].get(chosen)); }
    initKeys[j] = ik; }
    Object.defineProperty(G, 'granSrc', { value: Object.assign(rsv0 >= 0 ? { K, Km, W, nG, gOff, src: pk, initKeys, rsv0 } : { K, Km, W, nG, gOff, src: pk, initKeys }, nB >= 0 ? { nAct0: nB } : {}, l2 >= 0 ? { l2 } : {}), writable: true, configurable: true, enumerable: false });
  } else {
    for (let j = 0; j < nG; j++) { const b = gOff + j; G.gran[b] = 1; G.pos[b] = [3 + 0.5 * Math.cos(j), 0.5 + 0.5 * Math.sin(j * 1.7)]; G.cellType[b] = N_FIXED + 15; G.region[b] = oi; G.thresh[b] = th; G.leak[b] = lk; }
    Object.defineProperty(G, 'granDemand', { value: { K, Km, W, nG, gOff, src: packSrc() }, writable: true, configurable: true, enumerable: false });
  }
  // taught prediction cells: cells of the output region with plastic inputs that an env input contacts
  const pl = new Uint8Array(G.N), ins = new Uint8Array(G.N);
  for (let k = 0; k < acc.n; k++) { const b = acc.b[k]; if (b < nIn || b >= nIn + nHid || G.region[b] !== oi) continue; if (acc.p[k]) pl[b] = 1; if (acc.a[k] < nIn && acc.w[k] > 0) ins[b] = 1; }
  const P = []; if (params.granTgt === 1) { for (let m = 0; m < G.nOut; m++) P.push(nIn + nHid + m); }   // R83c granTgt 1: granules -> the output cells (Purkinje analogue), bypassing the prediction cells
  else for (let b = nIn; b < nIn + nHid; b++) if (pl[b] && ins[b] && !G.gran[b]) P.push(b);
  const wo = params.granOut > 0 ? params.granOut : 0.1;
  for (let j = 0; j < nG; j++) for (const b of P) acc.add(gOff + j, b, wo, 1, 0);
  if (G.granDemand) G.granDemand.wo = wo;
  G.granStats = { cells: nG, K, Km, thr: th, pred: P.length, demand: G.granDemand ? 1 : 0 };
}
const inhib = (g, i) => { const n = g.N; for (let b = 0; b < n; b++) if (g.W[i * n + b] < 0) return true; return false; };   // a cell with an inhibitory synapse
function growRegions(d, opts) {
  opts = opts || {};
  if (d.areal && !opts.noAreal) return growAreal(d, opts);
  const t0 = nowMs(), envSpec = opts.spec || currentEnv().spec, seed = opts.seed != null ? opts.seed : (d.seed || 1);
  const parts = d.regions.map((R, k) => { const { spec, map } = regionSpec(envSpec, R);
    const g = growCell(R.g, { spec, seed: (seed + 7919 * k) >>> 0, record: !!opts.record }); gcHint(); return { R, spec, map, g }; });
  const nIn = envSpec.nIn, nOut = envSpec.nOut, outPart = parts.find(p => p.R.outputs) || parts[0];
  let off = nIn; for (const p of parts) { p.off = off; off += p.g.nHid; }
  // R80 thinF (global param, bitmask, 0/undefined = off, bit-identical off and at sizeF <= 1; I98): a projection from a region grown f x keeps
  // each synapse at its 1x strength and thins the connections ~1/f, so receivers get a 1x-like afferent count and synapse strength
  // (instead of f x more synapses each f x weaker). bit 1: 'all' tracts (cortex mixing / M2 / M3 -> striatum): pair probability p / f_src;
  // bit 2: claw / topo tracts (context columns -> mixing, M2 -> context): each target keeps ~S / f of the column's cells at f x weight;
  // bit 4: plastic synapses inside a sized region (C / mixing -> prediction) kept with probability 1 / f at f x strength.
  const thF = (params.thinF | 0) || (params.scaleInvariant > 0 ? 7 : 0), hash01 = (a, b, s) => { let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x632be5ab, 0x85ebca6b) ^ (s | 0)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // R83 GRANULE LAYER (global param granN, 0/undefined = off, bit-identical off): a dedicated combination population of granN cells
  // (cerebellar-granule-like), appended after the grown hidden cells. Each granule cell takes a sparse claw: ONE letter column from each of
  // granK sources (the output region's current-symbol memory cells cls 0 = t at read time (granC0), its M2 cells cls 2 = t-1, the first other region's cls 2 = t-2),
  // total weight granW, threshold / leak of a mixing cell (needs the coincidence), its own feedforward inhibition (granInh mV per granule
  // spike onto every granule cell, net.js), and plastic synapses onto every taught prediction cell (normalised like the other plastic inputs).
  const gN = params.granN != null ? params.granN : d.gran && d.gran.N > 0 ? d.gran.N : 0;   // v41: plan gene d.gran.N (deepURSx3), P.granN overrides
  const sFmax = Math.max(...parts.map(p => p.R.g && p.R.g.sc ? +p.R.g.sc.sizeF || 1 : 1)), L2b = params.granL2 > 0 ? params.granL2 : 0;
  const gF = params.granScale > 0 ? Math.max(1, (L2b > 0 ? Math.min(sFmax, L2b) : sFmax) / params.granScale) : 1;   // R135 granScale (P.granScale = r > 0; off = unchanged): pool x max(1, largest region sizeF / r)
  const gG = params.granGrow > 1 ? params.granGrow : 1;   // R136 granGrow (P.granGrow = cap factor > 1; off = unchanged): allocate gN x gF x granGrow cells, only the first gN x gF are born (claws); the rest are added on demand (net.js guRecruit)
  const nL2 = L2b > 0 && gN > 0 ? (params.granL2N > 0 ? Math.round(params.granL2N) : Math.round(gN * Math.max(0, sFmax - L2b) / (params.granScale > 0 ? params.granScale : 1))) : 0;   // R138 granL2: level-2 pool (own cells, no claws), sized by brain size above the base b
  const nG = gN > 0 && parts.length > 1 && !envSpec.outcome ? Math.round(gN * gF * gG) + nL2 : 0, gOff = off;   // (outcome tasks: no granule layer, like the outcome-repressed context areas)
  const nHid = off - nIn + nG, G = createNetGenome(nIn, nHid, nOut, true), N = G.N, acc = new SynAcc(1 << 16);
  const node = (p, i) => i < p.g.nIn ? (typeof p.map[i] === 'number' ? p.map[i] : -1) : i < p.g.nIn + p.g.nHid ? p.off + i - p.g.nIn : ((p === outPart || p.R.vote) ? nIn + nHid + i - p.g.nIn - p.g.nHid : -1);   // R43 (I53) vote: a module's own output copy sums onto the shared outputs
  G.pos = new Array(N); G.cellType = new Int16Array(N); G.region = new Uint8Array(N); G.topo = new Float32Array(N).fill(NaN);
  for (let i = 0; i < nIn; i++) { G.pos[i] = envSpec.inputs[i].pos; G.cellType[i] = envSpec.inputs[i].cls; G.region[i] = 255; }
  for (let m = 0; m < nOut; m++) { const i = nIn + nHid + m; G.pos[i] = envSpec.outputs[m].pos; G.cellType[i] = envSpec.outputs[m].cls; G.region[i] = parts.indexOf(outPart); }
  parts.forEach((p, k) => { const g = p.g, n = g.N, dx = (k - parts.indexOf(outPart)) * 2.3;   // display: regions side by side
    for (let i = g.nIn; i < g.nIn + g.nHid; i++) { const b = node(p, i); G.pos[b] = [g.pos[i][0] + dx, g.pos[i][1]]; G.cellType[b] = g.cellType[i]; G.region[b] = k;
      G.thresh[b] = g.thresh[i]; G.leak[b] = g.leak[i]; if (g.topo) G.topo[b] = g.topo[i];
      if (g.slow && g.slow[i]) { G.slow = G.slow || new Uint8Array(N); G.slow[b] = 1; } if (g.mix && g.mix[i]) { G.mix = G.mix || new Uint8Array(N); G.mix[b] = 1; } }
    if (p === outPart) for (let m = 0; m < nOut; m++) { const b = nIn + nHid + m, i = g.nIn + g.nHid + m; G.thresh[b] = g.thresh[i]; G.leak[b] = g.leak[i]; }
    const pF = p.R.g && p.R.g.sc ? +p.R.g.sc.sizeF || 1 : 1;
    for (let a = 0; a < n; a++) { const A = node(p, a), tr = a < g.nIn && typeof p.map[a] !== 'number' ? p.map[a] : null;
      for (let b = 0; b < n; b++) { const w = g.W[a * n + b]; if (!w) continue; const B = node(p, b); if (B < 0) continue;
        if (tr) { (p.arrivals = p.arrivals || []).push([tr.tract, tr.label, B, w]); continue; }
        if (A < 0) continue; let wv = w;
        if (thF & 4 && pF > 1 && g.P[a * n + b] && w > 0) { if (hash01(A, B, seed) >= 1 / pF) continue; wv = w * pF; }   // R80 thinF bit 4: plastic in-region synapses of a sized region kept with p 1/f at f x strength
        acc.add(A, B, (p.R.vote && B >= nIn + nHid) ? wv * (p.R.voteScale || 1) : wv, g.P[a * n + b] ? 1 : 0, g.C[a * n + b]); } } });
  // tracts
  const tractStats = [];
  for (const T of d.tracts || []) {
    const src = parts[T.from.region], dst = parts[T.to.region], cols = new Map();
    for (let i = src.g.nIn; i < src.g.nIn + src.g.nHid; i++) if ((T.from.mix ? !!(src.g.mix && src.g.mix[i]) : src.g.cellType[i] === N_FIXED + T.from.cls) && !(T.map === 'all' && inhib(src.g, i))) {   // v30: from.mix = the sparse conjunctive (mixing) cells   // 'all': excitatory sources only
 const b = node(src, i), l = src.g.topo ? src.g.topo[i] : NaN; if (isNaN(l)) { if (T.map !== 'all') continue; l = 0; }
      const key = Math.round(l * 1e4); if (!cols.has(key)) cols.set(key, []); cols.get(key).push(b); }
    let nSyn = 0;
    if (T.map === 'topo') {
      const fT = (thF & 2) && src.R.g && src.R.g.sc && src.R.g.sc.sizeF > 1 ? src.R.g.sc.sizeF : 1;
      for (const [name, label, B, w] of dst.arrivals || []) { if (name !== T.to.tract) continue; const S0 = cols.get(Math.round(label * 1e4)); if (!S0 || !S0.length) continue;
        let S = S0; if (fT > 1) { S = S0.filter(A => hash01(A, B, seed ^ 0x5d) < 1 / fT); if (!S.length) S = [S0[0]]; }
        const ws = w * (T.gain || 1) / S.length; for (const A of S) { acc.add(A, B, ws, 0, 0); nSyn++; } }
    } else if (T.map === 'claw') {
      const r = mulberry32((seed ^ 0x51ed27 ^ (T.salt || 0)) >>> 0), keys = [...cols.keys()].sort((a, b) => a - b), tg = [];
      for (let i = dst.g.nIn; i < dst.g.nIn + dst.g.nHid; i++) if (T.to.mix ? dst.g.mix && dst.g.mix[i] : dst.g.cellType[i] === N_FIXED + T.to.cls) tg.push(node(dst, i));
      let order = []; if (keys.length) for (const B of tg) { if (!order.length) { order = keys.slice(); for (let k = order.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [order[k], order[j]] = [order[j], order[k]]; } }
        const S0 = cols.get(order.pop()), fS = (thF & 2) && src.R.g && src.R.g.sc && src.R.g.sc.sizeF > 1 ? src.R.g.sc.sizeF : 1, S = fS > 1 ? S0.filter(A => hash01(A, B, seed ^ 0x3c) < 1 / fS) : S0; if (!S.length) S.push(S0[0]);
        const cK = T.to.mix && params.clawKeep > 0 && params.clawKeep < 1 ? params.clawKeep : 0;   // R82 clawKeep (global param, 0/undefined = off, bit-identical off): each mixing cell keeps each context claw with probability clawKeep (lower-order conjunctions: fewer delays per mixing cell)
        if (cK && hash01(B, (T.salt || 0) + 7, seed ^ 0x82c1) >= cK) continue;
        const ws = T.to.w * (T.to.mix && params.clawWF > 0 ? params.clawWF : 1) / S.length; for (const A of S) { acc.add(A, B, ws, 0, 0); nSyn++; } }   // R82 clawWF (global, 0/undefined = off): context-claw weight onto mixing cells x clawWF. v25: a mutant whose source region grew no cells of the class gets no tract (it used to throw)
    } else if (T.map === 'all') {   // parallel fibres: every source cell -> every excitatory receiver of the target region, plastic (P = 1)
      const tg = []; for (let i = dst.g.nIn; i < dst.g.nIn + dst.g.nHid; i++) if (dst.g.recv && dst.g.recv[i]) tg.push(node(dst, i));
      // R72 allMax (global param, 0/undefined = off): convergence limit. Each target receives from at most ~allMax source cells (the pair
      // probability falls to allMax / sources when p x sources > allMax), with the weight per synapse of that count: fan-in no longer grows with the source size.
      const src0 = [].concat(...cols.values()), aM = params.allMax > 0 ? params.allMax : 0, fA = (thF & 1) && parts[T.from.region].R.g && parts[T.from.region].R.g.sc && parts[T.from.region].R.g.sc.sizeF > 1 ? parts[T.from.region].R.g.sc.sizeF : 1, pc = (1 / fA) * (aM && (T.p || 1) * src0.length > aM ? aM / src0.length : (T.p || 1)), src = src0, ws = T.to.wTot / Math.max(1, pc * src.length), r = mulberry32((seed ^ 0x2c1b3c6d ^ (T.salt || 0)) >>> 0);   // total weight ~wTot per target
      for (const A of src) for (const B of tg) { if (pc < 1 && r() >= pc) continue; acc.add(A, B, ws, T.plastic ? 1 : 0, 0); nSyn++; }   // p < 1: each pair connects with probability p
    }
    else if (T.map === 'outReset') {   // R43 (I55): the output (prediction) cell named T.from.out inhibits every cell of class T.to.cls of the target region (a predicted word boundary resets it)
      const m = envSpec.outputs.findIndex(o => o.name === T.from.out); if (m >= 0) { const A = nIn + nHid + m;
        for (let i = dst.g.nIn; i < dst.g.nIn + dst.g.nHid; i++) if (dst.g.cellType[i] === N_FIXED + T.to.cls) { acc.add(A, node(dst, i), -T.to.w, 0, 0); nSyn++; } }
    } else if (T.map === 'chunkGate') {   // Two-timescale hierarchical chunking gate: pulses target region's gate cells (tract 'cgate') on chunk boundaries / high cortical prediction surprise
      const gNodes = [], gW = [], tName = (T.to && T.to.tract) || 'cgate';
      for (const [name, , B, w] of dst.arrivals || []) if (name === tName) { gNodes.push(B); gW.push(w * (T.gain || 1)); nSyn++; }
      const go2Ids = []; for (let i = 0; i < nIn; i++) if (envSpec.inputs[i] && envSpec.inputs[i].group === 'go2') go2Ids.push(i);
      if (!G.chunkGates) Object.defineProperty(G, 'chunkGates', { value: [], writable: true, configurable: true, enumerable: false });
      G.chunkGates.push({ region: T.to.region, nodes: Int32Array.from(gNodes), weights: Float32Array.from(gW), go2: Int32Array.from(go2Ids), thr: T.thr != null ? T.thr : 0.4, delimSym: T.delimSym != null ? T.delimSym : 0, maxLag: T.maxLag || 6 });
    }
    tractStats.push({ name: T.name, from: src.R.name, to: dst.R.name, columns: cols.size, synapses: nSyn });
  }
  if (nG) granuleLayer(G, parts, outPart, node, acc, nG, gOff, nIn, nHid, seed, d.gran, nL2);
  attachSparse(G, acc.finish(N, params.wMax));   // (+ the wMax cap of the old dense merge)
  gcHint();
  const og = outPart.g; G.pl = og.pl; G.nCh = og.nCh; G.ch = og.ch.map(c => Object.assign({}, c));
  G.typeInfo = og.typeInfo; G.fixedNames = og.fixedNames; G.specKey = envSpec.key; G.kind = 'direct'; G.grownFrom = d;
  G.regions = parts.map((p, k) => ({ name: p.R.name, color: p.R.color || ['#6aa9ff', '#f0a050', '#7fd18b', '#d17fd1'][k % 4], nHid: p.g.nHid, off: p.off, outputs: p === outPart, devStats: p.g.devStats }));
  parts.forEach((p, k) => { const f = p.R.g && p.R.g.sc ? p.R.g.sc.sizeF : 0; if (f > 1) G.regions[k].sizeF = f; });   // R73: region size factor kept on the phenotype (trophic scaling)
  G.outRegion = parts.indexOf(outPart);
  { const bn = new Float32Array(N).fill(-1); parts.forEach(p => { if (p.g.born) for (let i = p.g.nIn; i < p.g.nIn + p.g.nHid; i++) bn[node(p, i)] = p.g.born[i]; }); Object.defineProperty(G, 'born', { value: bn, writable: true, configurable: true, enumerable: false }); }   // R65 birth steps (staged maturation)
  G.tracts = tractStats;
  const sum = k => parts.reduce((s, p) => s + (p.g.devStats[k] || 0), 0);
  G.devStats = { cells: sum('cells'), neurons: sum('neurons'), apoptosis: sum('apoptosis'), trophicDeaths: sum('trophicDeaths'), survivors: nHid, orphanOut: outPart.g.devStats.orphanOut, nOut,
                 silentIn: outPart.g.devStats.silentIn, nInUsed: outPart.g.devStats.nInUsed, hungerSyn: 0, demandSyn: outPart.g.devStats.demandSyn || 0, outCov: outPart.g.devStats.outCov, outInMean: outPart.g.devStats.outInMean, cones: outPart.g.devStats.cones, synapses: countSynapses(G), refinePruned: sum('refinePruned'),
                 regions: parts.length, tracts: tractStats, ms: nowMs() - t0 };
  // the viewer: every region's own grown brain + local spec (+ its growth recording with record: true); not enumerable (never saved)
  Object.defineProperty(G, 'regionParts', { value: parts.map((p, k) => ({ name: G.regions[k].name, color: G.regions[k].color, off: p.off, outputs: p === outPart, brain: p.g, spec: p.spec, map: p.map })), enumerable: false });
  return G;
}
/* v29 (R30) AREALIZATION: one genome, the task's I/O decides which areas develop.
 * Two morphogen sources are read off the environment's sensory/modulatory surface:
 *   A ("FGF8-like", anterior): the phase-clock channels (groups go2/go3, a multi-phase rhythmic input that a
 *     sequence task brings): A = share of clock channels per GO channel (0..1);
 *   O ("dopamine source", ventral): the env delivers outcomes (spec.outcome: reward / punishment).
 * Every region carries area receptor genes area = { a, o, b }: its expression e = sigmoid(a*A + o*O + b) (an
 * Emx2/Pax6-like transcription-factor gradient). An area whose expression stays below 0.5 does not develop (its
 * progenitors take another fate); tracts to or from it are not laid. The developing area with the highest expression
 * that can carry outputs owns the env outputs. An area marked whole reads the full sensory sheet: if it develops alone it
 * grows exactly as a single tissue (growCell). The receptor genes mutate with the rest of the genome. */
function arealSignals(spec) {
  const I = spec.inputs, nGo = I.filter(c => c.group === 'go').length, nPh = I.filter(c => c.group === 'go2' || c.group === 'go3').length;
  return { A: nGo ? Math.min(1, nPh / nGo) : (nPh ? 1 : 0), O: spec.outcome ? 1 : 0 };
}
function areaExpr(R, S) { const a = R.area || { a: 0, o: 0, b: 5 }; return 1 / (1 + Math.exp(-(a.a * S.A + a.o * S.O + a.b))); }
function growAreal(d, opts) {
  const envSpec = opts.spec || currentEnv().spec, S = arealSignals(envSpec), e = d.regions.map(R => areaExpr(R, S));
  // v30 (R31) graded arealization (d.graded): an area develops once its expression reaches gMin (gene, default 0.15) and its
  // progenitor pool (maxCells) scales with the expression: size = min(1, e / 0.9) of the full area (fully expressed areas unchanged).
  const gMin = d.graded ? (d.gMin != null ? d.gMin : 0.15) : 0.5;
  let on = d.regions.map((R, k) => e[k] >= gMin); if (!on.some(x => x)) on = e.map(x => x === Math.max(...e));
  const scaled = (R, k) => { if (!d.graded) return R; const f = Math.min(1, e[k] / 0.9); if (f >= 1) return R;
    const g = Object.assign({}, R.g, { sc: Object.assign({}, R.g.sc) }); if (g.sc.maxCells) g.sc.maxCells = Math.max(8, Math.round(g.sc.maxCells * f)); return Object.assign({}, R, { g }); };
  let own = -1; d.regions.forEach((R, k) => { if (on[k] && R.outputs && (own < 0 || e[k] > e[own])) own = k; });
  const idx = []; d.regions.forEach((R, k) => { if (on[k]) idx.push(k); });
  const areas = d.regions.map((R, k) => ({ name: R.name, expr: +e[k].toFixed(3), on: on[k], size: d.graded ? +Math.min(1, e[k] / 0.9).toFixed(3) : 1 }));
  let G;
  if (idx.length === 1 && d.regions[idx[0]].whole) {
    G = growCell(scaled(d.regions[idx[0]], idx[0]).g, opts);
  } else {
    const sub = { kind: 'regions', label: d.label, seed: d.seed, ...(d.gran ? { gran: d.gran } : {}),
      regions: idx.map(k => Object.assign({}, scaled(d.regions[k], k), { outputs: k === own })),
      tracts: (d.tracts || []).filter(T => on[T.from.region] && on[T.to.region]).map(T => { const t = JSON.parse(JSON.stringify(T)); t.from.region = idx.indexOf(T.from.region); t.to.region = idx.indexOf(T.to.region); return t; }) };
    G = growRegions(sub, Object.assign({}, opts, { noAreal: true }));
  }
  G.grownFrom = d; G.areas = areas; G.devStats.areas = areas.filter(a => a.on).map(a => a.name).join('+');
  return G;
}
function cloneRegions(d) {
  return { kind: 'regions', label: d.label || '', seed: d.seed, fitness: null, tracts: JSON.parse(JSON.stringify(d.tracts || [])),
           regions: d.regions.map(R => Object.assign({ name: R.name, color: R.color, inputs: JSON.parse(JSON.stringify(R.inputs)), outputs: !!R.outputs, g: cloneCell(R.g) }, R.area ? { area: Object.assign({}, R.area) } : {}, R.whole ? { whole: true } : {})),
           ...(d.areal ? { areal: 1 } : {}), ...(d.graded ? { graded: 1, gMin: d.gMin } : {}), ...(d.gran ? { gran: Object.assign({}, d.gran) } : {}) };
}
function regionsOf(d) { return d && d.kind === 'regions' ? d.regions : null; }
Object.assign(SpikingArena, { SynAcc, attachSparse, arealSignals, areaExpr, growAreal, cloneRegions, growRegions, regionSpec, regionsOf });

/* =====================================================================
 * plans.js — hand-designed BODY PLANS (starting genomes). A plan is just a
 * cellular genome; it can grow in any environment, but its fates read the
 * address tags of the environment's channels. Plans v1-v3 were designed for
 * the bug arena (tags 0/1/2 = wall/green/red eyes, 3 bump, 6 tonic, 8 gyro);
 * environments may register their own plans (e.g. js/envs/cue.js 'memory').
 * ===================================================================== */
'use strict';
// HAND-DESIGNED SEED GENOME: a "French flag" body plan. Two bilateral progenitors divide
// for the first 30% of development. Each cell reads two gradients (anterior, midline) and
// so knows which quadrant of its half it sits in; that decides its fate:
//   F  anterior-medial ... receives GREEN eyes, axon crosses the midline -> opposite motor (approach)
//   P  anterior-lateral .. receives RED eyes, axon stays on its side -> same-side motor (turn away)
//   W  posterior-lateral . receives WALL eyes + bumps, same-side motor, weak (turn away)
//   Wi posterior-medial .. same inputs, INHIBITORY, crosses the midline (brakes the far wheel)
function createHandCellGenomeV1() {
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, CHM = c => c, ST = j => CH_NCHEM + j, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, 0.6, 0.3, 0.6, 0.3, 0.3];
  const yA = 0.15, xM = 0.45, tA = Math.exp(-(1 - yA) / lam[1]), tM = Math.exp(-xM / lam[0]);
  wg(0, CHM(1), 40); wg(0, BIAS, -40 * tA);            // s0: anterior?  (+1 front of yA)
  wg(1, CHM(0), 25); wg(1, BIAS, -25 * tM);            // s1: medial?    (+1 within xM of midline)
  // quadrant genes (one is +1, the others -1): F = ant&med, P = ant&lat, W = post&lat, Wi = post&med
  wg(2, ST(0), 3); wg(2, ST(1), 3); wg(2, BIAS, -3);
  wg(3, ST(0), 3); wg(3, ST(1), -3); wg(3, BIAS, -3);
  wg(4, ST(0), -3); wg(4, ST(1), -3); wg(4, BIAS, -3);
  wg(5, ST(0), -3); wg(5, ST(1), 3); wg(5, BIAS, -3);
  wg(6, TIME, -40); wg(6, BIAS, 40 * 0.14);            // s6: proliferation clock (+1 while t < 0.14)
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  // per-fate logits -> R row (exactly one fate gene is +1): coefficient L/2 each, bias = sum
  const fate = (out, L) => { let b = 0; L.forEach((l, j) => { r(out, 2 + j, l / 2); b += l / 2; }); rb(out, b); };
  r(CO.DIV, 6, 5); rb(CO.DIE, -5); rb(CO.MIG, -5); rb(CO.EM4, -5); rb(CO.EM5, -5);
  fate(CO.INH, [-5, -5, -5, 5]); rb(CO.THR, 0); fate(CO.PLAST, [5, 5, -5, -5]);
  r(CO.AXON, 6, -5); rb(CO.BRANCH, -5); rb(CO.COLL, -5); rb(CO.CLEN, -5); rb(CO.T8, -5); rb(CO.S8, -5); rb(CO.LEAK, -5); rb(CO.PROJ, -5); rb(CO.XSYN, -5);
  for (let k = 0; k < 8; k++) { rb(CO.T + k, -5); rb(CO.S + k, -5); }
  fate(CO.T + 0, [-5, -5, 5, 5]); fate(CO.T + 3, [-5, -5, 5, 5]);     // wall eyes + bumps -> W, Wi
  fate(CO.T + 1, [5, -5, -5, -5]); fate(CO.T + 2, [-5, 5, -5, -5]);   // green -> F, red -> P
  fate(CO.S + 4, [5, 5, -0.85, -0.85]);                                 // seek motors (W/Wi weaker: 0.3)
  fate(CO.G + 0, [5, 0, -5, 5]);                                        // midline: F, Wi attracted (then cross)
  rb(CO.G + 1, -5); rb(CO.G + 3, 5);                                    // all: leave the front, find motors
  return { kind: 'cell', label: 'hand-designed body plan v1 (feed-forward)', seed: 1, Wg, R, lam: lam.concat([0.3]), seeds: [[-0.45, 0.15], [0.45, 0.15]],
           s0: new Array(H).fill(0), sc: Object.assign(cellDefaults(), { pDiv: 0.9 }), pl: Object.assign(defaultPlasticity(), { aMinus: 0, lr: 0.1 }), nCh: 1, ch: [defaultChannel()], fitness: null };
}
// HAND-DESIGNED BODY PLAN v2 = v1 + a CENTRAL ZONE of interneurons with recurrent / lateral wiring.
// Two more progenitors sit in the central zone (between the sensory quadrants and the motors).
// Gene 7 reads the central-zone chemical ("I am central"); genes 8/9 = central & medial / lateral.
// In the central zone the four quadrant genes are switched off, so its cells take two new fates:
//   M  central-medial . EXCITATORY "memory" interneurons: short local collaterals onto each other
//                       (recurrent excitatory loop that can hold "food was seen") and an axon to
//                       the same-side motor. They receive the crossed axons of the green-eye F cells.
//   X  central-lateral  INHIBITORY interneurons: driven by local M collaterals, their axon crosses
//                       the midline and inhibits the M and X cells of the other side (left/right
//                       mutual inhibition -> decisive turning, winner-take-all).
// F cells also seek the 'free' tag, so on their way to the motors they excite M/X cells.
// Hidden targets now also supply some trophic factor, so interneurons that are targeted survive.
function createHandCellGenomeV2() {
  const d = createHandCellGenomeV1(), H = CH_H, Wg = d.Wg, R = d.R;
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, ST = j => CH_NCHEM + j, BIAS = CH_NCHEM + H + 1;
  const tC = Math.exp(-0.3 / d.lam[6]);
  wg(7, 6, 40); wg(7, BIAS, -40 * tC);                       // s7: central (within 0.3 of the central stripe)
  for (const g of [2, 3, 4, 5]) { wg(g, ST(7), -3); Wg[g * CH_NIN + BIAS] -= 3; }   // quadrants off in the central zone
  wg(8, ST(7), 3); wg(8, ST(1), 3); wg(8, BIAS, -3);          // s8: central & medial  -> M
  wg(9, ST(7), 3); wg(9, ST(1), -3); wg(9, BIAS, -3);         // s9: central & lateral -> X
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  // fates over genes [F=2, P=3, W=4, Wi=5, M=8, X=9]; exactly one of them is +1 in every cell
  const fate = (out, L) => { let b = 0; [2, 3, 4, 5, 8, 9].forEach((gene, j) => { r(out, gene, L[j] / 2); b += L[j] / 2; }); rb(out, b); };
  fate(CO.INH, [-5, -5, -5, 5, -5, 5]);
  fate(CO.PLAST, [5, 5, -5, -5, 5, -5]);
  fate(CO.T + 0, [-5, -5, 5, 5, -5, -5]); fate(CO.T + 3, [-5, -5, 5, 5, -5, -5]);
  fate(CO.T + 1, [5, -5, -5, -5, -5, -5]); fate(CO.T + 2, [-5, 5, -5, -5, -5, -5]);
  fate(CO.T + 7, [-5, -5, -5, -5, 0, 5]);                    // 'free' address: M half (0.5), X full
  fate(CO.S + 4, [5, 5, -0.85, -0.85, 0, -5]);                // M -> motors (0.5), X never
  fate(CO.S + 7, [1.4, -5, -5, -5, 0, 5]);                    // F, M (0.5) and X seek 'free' cells
  fate(CO.G + 0, [5, 0, -5, 5, -5, 5]);                       // midline attraction: F, Wi, X cross
  fate(CO.BRANCH, [5, -5, -5, -5, 5, 5]);                    // F, M, X: up to 4 synapses per axon branch (others 1)
  fate(CO.COLL, [-5, -5, -5, -5, 5, -5]);                     // M: 4 local collaterals
  fate(CO.CLEN, [-5, -5, -5, -5, -1.5, -5]);                  // short (about 4 steps)
  fate(CO.G6, [0, 0, 0, 0, 0, 0]);
  d.seeds.push([-0.4, Y_CENTRAL], [0.4, Y_CENTRAL]);
  d.sc.maxCells = 200; d.sc.trophHid = 0.3;
  d.label = 'hand-designed body plan v2 (central interneurons, recurrent)';
  return d;
}
// HAND-DESIGNED BODY PLAN v3 (default) = v2 tuned into a MEMORY circuit:
//   M cells get a SLOW membrane (leak ~0.99 per substep: ~30 ticks) and real self-excitation
//   (M seek and address the 'free' tag strongly, so their local collaterals connect M to M).
//   Food seen on the left -> left F cells -> cross -> right M population fires and keeps firing
//   (slow + recurrent), driving the right wheel = keeps turning toward the remembered food after
//   it has vanished. X cells (inhibitory, crossing) give left/right mutual inhibition, and the
//   TURNING SENSORS feed X: turning left excites left X, which inhibits the right M that caused
//   the turn, so the memory is used up as the bug turns (a first step toward path integration).
function createHandCellGenome(tune) {
  const T = Object.assign({ t7: 0, s7: 0.3, leak: 1, clen: -1.5, motor: 0 }, tune);
  const d = createHandCellGenomeV2(), H = CH_H, R = d.R;
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  const fate = (out, L) => { let b = 0; [2, 3, 4, 5, 8, 9].forEach((gene, j) => { r(out, gene, L[j] / 2); b += L[j] / 2; }); rb(out, b); };
  fate(CO.T + 7, [-5, -5, -5, -5, T.t7, 5]);                 // M address 'free' (X: 1)
  fate(CO.S + 7, [1.4, -5, -5, -5, T.s7, 5]);                // M seeks M: M->M strength = sigm(s7) x sigm(t7)
  fate(CO.LEAK, [-5, -5, -5, -5, T.leak, -5]);               // M: slow membrane
  fate(CO.T8, [-5, -5, -5, -5, -5, 5]);                      // X receive the turning sensors
  fate(CO.PROJ, [-5, -5, -5, -5, 5, -5]);                    // M: main axon = projection to the motors only
  fate(CO.CLEN, [-5, -5, -5, -5, T.clen, -5]);               // M collateral length
  if (T.motor !== 0) fate(CO.S + 4, [5, 5, -0.85, -0.85, T.motor, -5]);
  d.label = 'hand-designed body plan v3 (slow recurrent memory + turning sensors)';
  return d;
}

registerPlan('v1', 'plan v1 (feed-forward)', createHandCellGenomeV1, 'feed-forward French-flag quadrants: sensor → hidden → motor');
registerPlan('v2', 'plan v2 (interneurons)', createHandCellGenomeV2, 'v1 + central interneurons with recurrent / lateral wiring');
registerPlan('v3', 'plan v3 (slow recurrent memory)', () => createHandCellGenome(), 'v2 + slow self-exciting memory populations, mutual inhibition, turning sensors');
// v8: plan v3 + HUNGER (need-based attraction): outputs / sensors that are under-connected attract axons and relax
// tag matching until satisfied. In v3 the speed motor is otherwise an orphan (no input) in every growth.
function tunedBugGenome(tune) {
  const d = createHandCellGenome(tune);
  d.sc.hunger = 2;
  d.label = 'plan v3 + hunger signals';
  return d;
}
registerPlan('v3h', 'plan v3h (v3 + hunger)', () => tunedBugGenome(),
  'v3 + hunger signals: under-connected motors / sensors attract axons until satisfied (no orphan motors)');
Object.assign(SpikingArena, { createHandCellGenomeV1, createHandCellGenomeV2, createHandCellGenome, tunedBugGenome });

'use strict';
/* ---------------- SpikingNet (net.js) ----------------
 * Leaky integrate-and-fire, exactly like the FlyNeuron sketch:
 *   v += input;  v = v_rest + (v - v_rest) * leak;
 *   if v >= v_thresh: spike, v = v_rest
 * Spikes are delivered through weighted synapses on the NEXT substep.
 * Synapses are stored sparse (CSR: outgoing list per neuron).
 *
 * 3b. LIFETIME LEARNING: reward-modulated STDP (three-factor rule)
 *   Every neuron keeps two decaying spike traces: xPre (tauPre) and xPost (tauPost).
 *   Every plastic synapse pre->post keeps an ELIGIBILITY trace e (tauElig):
 *     post spikes  -> e += xPre[pre]          (pre fired shortly BEFORE post: "causal", +)
 *     pre spikes   -> e -= aMinus*xPost[post] (post fired shortly before pre: "acausal", -)
 *   Nothing changes yet: e only marks "this synapse recently took part".
 *   One global DOPAMINE signal M is kicked by food (+gFood), poison and the
 *   predator (-gPoison), wall contact (-gWall), and decays (tauMod).
 *   (The code still supports several channels M[c] for imported networks;
 *   grown brains use one.) Every tick:  w += lr * M * e
 *   Weights keep their sign and |w| <= wMax. The genome weights are the
 *   starting point of every lifetime; learning never writes back.
 * 3c. Each synapse can count pre->post coincidences (net.use); the juvenile
 *   phase of cellular development uses them for activity refinement.        */
class SpikingNet {
  constructor(g, opts) {
    g = phenotype(g);
    this.g = g; this.nSpk = 0; this.spikeCount = 0;   // (v, syn = input arriving next step, ext = sensory current, spiked/spk, trace = smoothed spike train: sized below)
    // Build CSR adjacency from dense W
    const nCh = Math.max(1, g.nCh || 1), p0 = Object.assign({}, PL_DEFAULTS, g.pl);
    const NG = p0.ng > 0 && g.nHid > 0 && !(opts && opts.noNeed) ? this.planNeed(g, p0) : null;   // v28 need-growth: reserve cells appended after the grown cells (dormant)
    const N = this.N = g.N + (NG ? NG.R : 0);
    this.v = new Float32Array(N).fill(V_REST); this.syn = new Float32Array(N); this.ext = new Float32Array(N);
    this.spiked = new Uint8Array(N); this.spk = new Int32Array(N); this.trace = new Float32Array(N);
    const start = new Int32Array(N + 1), N0 = g.N;   // R66: typed CSR built in two passes (count, fill): same synapse order as the old push loop, no large temporary JS arrays
    const S = g.sp && !NG ? g.sp : null;   // R66: sparse synapse list (merged multi-region brains), same order as the dense scan
    const GW = S ? null : g.W, GP = S ? null : g.P, GC = S ? null : g.C;
    const okD = (pre, post) => !(NG && (NG.dead[pre] || NG.dead[post]));
    let E = 0;
    if (S) { E = S.pre.length; for (let k = 0; k < E; k++) start[S.pre[k] + 1]++; for (let i = 0; i < N; i++) start[i + 1] += start[i]; }
    else { for (let pre = 0; pre < N; pre++) { start[pre] = E;
      if (pre < N0) { const b = pre * N0; for (let post = 0; post < N0; post++) if (GW[b + post] !== 0 && okD(pre, post)) E++; }
      if (NG) { const ex = NG.extra[pre]; if (ex) E += ex.length; } } start[N] = E; }
    const posts = new Int32Array(E), pres = new Int32Array(E), ws = new Float32Array(E), plast = new Uint8Array(E), chs = new Uint8Array(E);
    if (S) { for (let k = 0; k < E; k++) { posts[k] = S.post[k]; pres[k] = S.pre[k]; ws[k] = S.w[k]; plast[k] = S.p[k]; chs[k] = S.c[k] % nCh; } }
    else { let k = 0; for (let pre = 0; pre < N; pre++) {
      if (pre < N0) for (let post = 0; post < N0; post++) {
        const i = pre * N0 + post, w = GW[i];
        if (w !== 0 && okD(pre, post)) { posts[k] = post; pres[k] = pre; ws[k] = w; plast[k] = GP ? GP[i] : 1; chs[k] = GC ? GC[i] % nCh : 0; k++; }
      }
      if (NG) { const ex = NG.extra[pre]; if (ex) for (const [post, pl] of ex) { posts[k] = post; pres[k] = pre; ws[k] = pl ? 1e-6 : 0; plast[k] = pl; chs[k] = 0; k++; } }
    } }
    this.start = start; this.posts = posts; this.pres = pres;
    this.ws = ws; this.w0 = Float32Array.from(ws); this.synCh = chs;
    // R76 recvBudget (global param bitmask, 0/undefined = off, bit-identical; every factor is 1 in a brain without sized regions):
    //   bit 1: per-receiver INHIBITORY budget. preNorm budgets the plastic excitation per sender, inhibition is not budgeted, so a cell of an
    //   f x region gets ~f x the inhibitory inputs (R76: cortex E/I ~ f^-0.55). Each cell's fixed inhibitory inputs x n1x / n, n1x = their
    //   1x-equivalent count (an input from an f x region counts 1/f): the receiver's inhibitory total stays at its 1x value.
    if (((params.recvBudget & 1) || params.scaleInvariant > 0) && g.regions && g.regions.some(r => r.sizeF > 1)) { this.N = N; const t = this.trophicS(), n = new Float32Array(N), e1 = new Float32Array(N);
      for (let k = 0; k < E; k++) if (ws[k] < 0 && !plast[k]) { n[posts[k]]++; e1[posts[k]] += t[pres[k]]; }
      for (let k = 0; k < E; k++) if (ws[k] < 0 && !plast[k]) { const j = posts[k]; if (e1[j] < n[j]) { ws[k] *= e1[j] / n[j]; this.w0[k] = ws[k]; } } }
    this.pruning = g.prune && g.prune.tick > 0 ? g.prune : null; this.pruned = 0; this.tickNo = 0;
    // plastic synapse list + incoming index (by post) for STDP (all synapses if pruning)
    let nPl = 0; for (let k = 0; k < E; k++) if (plast[k]) nPl++;
    this.plastic = new Int32Array(nPl); for (let k = 0, q = 0; k < E; k++) if (plast[k]) this.plastic[q++] = k;
    this.isPlastic = plast;
    const inS = this.inStart = new Int32Array(N + 1), pr = this.pruning;
    for (let k = 0; k < E; k++) if (plast[k] || pr) inS[posts[k] + 1]++;
    for (let j = 0; j < N; j++) inS[j + 1] += inS[j];
    const fill = inS.slice(0, N), inE = this.inEdges = new Int32Array(inS[N]);
    for (let k = 0; k < E; k++) if (plast[k] || pr) inE[fill[posts[k]]++] = k;
    this.elig = new Float32Array(E);
    this.use = this.pruning ? new Float32Array(E) : null; this.prunedMask = this.pruning ? new Uint8Array(E) : null;
    this.xPre = new Float32Array(N); this.xPost = new Float32Array(N);
    // modulator channels
    this.nCh = nCh;
    this.chs = (g.ch || channelsFromLegacy(g.pl)).slice(0, nCh).map(c => Object.assign({}, CH_DEFAULTS, c));
    while (this.chs.length < nCh) this.chs.push(defaultChannel());
    this.chSrc = this.chs.map(c => Int32Array.from(c.srcList || (c.src >= 0 && c.src < g.nHid ? [g.nIn + c.src] : [])));
    this.chSpikes = new Float32Array(nCh);   // source-neuron spikes this tick
    this.mods = new Float32Array(nCh);       // modulator level per channel
    this.mod = 0;                            // channel 0 (kept for older code / display)
    this.dwSum = 0;                          // |dw| summed this tick
    const dtF = opts && opts.dt > 0 && opts.dt !== 1 ? opts.dt : 0;   // R68 coarser time step: every per-substep constant rescaled by dt (see initDt)
    if (dtF) this.initDt(dtF);
    this.setPlasticityConsts();
    if (NG) { this.thr = Float32Array.from({ length: N }, (_, i) => i < N0 ? (NG.dead[i] ? 1e9 : g.thresh[i]) : 1e9); this.ngPlan = NG; for (let k = 0; k < E; k++) if (pres[k] >= N0 && plast[k]) this.ws[k] = 0; }
    if (this.p.teach > 0 || this.p.uni > 0) this.initTeach();   // v22: the unified rule detects instructive events too
    if (this.p.rcvDiv > 0 || this.p.rcvInh > 0 || this.p.rcvNoise > 0) this.initRcv();
    if (this.p.mixInh > 0 && g.mix) {   // v14 feedforward inhibition of mixing cells: their presynaptic cells and the mixing cells
      const mp = new Uint8Array(N), ml = []; for (let i = 0; i < N; i++) if (g.mix[i]) ml.push(i);
      for (let k = 0; k < this.posts.length; k++) if (g.mix[this.posts[k]] && this.ws[k] > 0) mp[this.pres[k]] = 1;
      this.mixPre = mp; this.mixList = Int32Array.from(ml);
      // R78 mixInhRef (global param, 0/undefined = off, bit-identical): the feedforward (APL / Golgi-like) inhibition of mixing cells
      // reads the MEAN activity of its presynaptic pool, not the raw spike count: with a pool of n > mixInhRef cells each spike
      // inhibits by mixInh x mixInhRef / n. Without it the pool (and so the inhibition) grows with region size while every mixing
      // cell's excitation is normalised (mixNorm, claw w / column), so bigger brains silence the mixing layer (R78: order3 at 4x).
      let np = 0, np1x = 0; const si = (params.scaleInvariant > 0 || (params.relGrowth > 0 && !((params.relGrowthOff | 0) & 8))) && g.regions && g.regions.some(r => r.sizeF > 1) ? this.trophicS() : null;
      for (let i = 0; i < N; i++) if (mp[i]) { np++; if (si) np1x += si[i]; }
      const iR = params.mixInhRef > 0 ? params.mixInhRef : (si && np1x > 0 ? np1x : 0);
      this.mixInhD = iR && np > iR ? this.p.mixInh * Math.pow(iR / np, params.mixInhPow > 0 ? params.mixInhPow : 1) : this.p.mixInh; }   // mixInhPow (default 1 = mean field; 0.5 = inhibition grows with the square root of the pool)
      // R78b mixInhLocal = R (global param, 0/undefined = off, bit-identical off): PER-CELL feedforward inhibition. Each spike of an
      // afferent inhibits only the mixing cells it contacts, each by mixInh x R / (that cell's excitatory fan-in), so a cell's
      // inhibition tracks the mean activity of ITS OWN inputs (R = the 1x pool, ~820, gives the 1x mean of the shared pool)
      // and does not grow with region size.
      if (params.mixInhLocal > 0 && this.mixPre) { const fi = new Float64Array(N), cnt = new Int32Array(N + 1);
        for (let k = 0; k < this.posts.length; k++) { const j = this.posts[k]; if (g.mix[j] && this.ws[k] > 0) { fi[j]++; cnt[this.pres[k] + 1]++; } }
        for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i]; const P = new Int32Array(cnt[N]), D = new Float32Array(cnt[N]), f = cnt.slice();
        for (let k = 0; k < this.posts.length; k++) { const j = this.posts[k]; if (g.mix[j] && this.ws[k] > 0) { const q = f[this.pres[k]]++; P[q] = j; D[q] = this.p.mixInh * params.mixInhLocal / fi[j]; } }
        this.mlS = cnt; this.mlP = P; this.mlD = D; }
    if (g.mix && (this.p.mixLr > 0 || this.p.mixHomeo > 0)) this.initMixLearn();
    if (this.p.rpe > 0) this.initCritic();
    if (this.p.actNoise > 0 || this.p.actFb > 0 || this.p.outInh > 0) this.initActNoise();
    if (this.p.rcvHomeo > 0) { if (!this.thr) this.thr = Float32Array.from(g.thresh); const r = new Uint8Array(N); for (const k of this.plastic) if (this.w0[k] > 0) r[this.posts[k]] = 1;
      const L = []; for (let i = 0; i < N; i++) if (r[i]) L.push(i); this.rhList = Int32Array.from(L); }
    if ((this.p.thrAdd !== 0 || this.p.hidHomeo > 0 || this.p.regInh > 0) && !(opts && opts.noNeed)) this.initSparse();
    if (params.denseCeil > 0 && !(opts && opts.noNeed)) this.initDense();   // R120 dense-cell ceiling (off by default)   // R67 sparser-activity genes (off by default)
    if (NG) this.initNeed();
    this.initFast();
    if (params.fastEngine && !globalThis.__bbSlow && !(opts && opts.noNeed)) this.initFastE();   // R66 event-driven engine (selectable; see initFastE)
    if (this.p.stageF0 > 0 && this.p.stageF0 < 1 && g.nHid > 0 && !(opts && opts.noNeed)) this.initStage();   // (not in the juvenile phase of development)
    if (params.granDemand > 0 && g.granDemand) this.initGranDemand();   // R102: off unless the brain was grown with P.granDemand (no random claws)
    if ((params.granUtility > 0 || (g.grownFrom && g.grownFrom.gran && g.grownFrom.gran.utility > 0)) && g.granSrc && !this.gd) this.initGranUtility();
    if (g.chunkGates && g.chunkGates.length) this.initChunkGates();
  }
  // R65 (I82) staged maturation (see PL_DEFAULTS stageF0): immature hidden cells are silenced (threshold 1e9, synapses at weight 0, grown
  // weights kept in w0) and mature in birth order, one wave every stageTicks ticks
  initStage() {
    const g = this.g, N = this.N, h0 = g.nIn, h1 = g.nIn + g.nHid, p = this.p, born = g.born, r = mulberry32((0x57a6e ^ g.N * 2654435761) >>> 0);
    const ids = [], key = new Float64Array(N); for (let i = h0; i < h1; i++) { ids.push(i); key[i] = (born ? born[i] : 0) + 0.5 * r(); }
    ids.sort((a, b) => key[a] - key[b] || a - b);
    if (!this.thr) this.thr = Float32Array.from(g.thresh);
    const n0 = Math.max(1, Math.round(p.stageF0 * ids.length)), W = Math.max(1, Math.round(p.stageWaves));
    const st = this.stg = { order: Int32Array.from(ids), done: n0, per: Math.ceil((ids.length - n0) / W), at: Math.max(1, Math.round(p.stageTicks)), thr0: Float32Array.from(this.thr), mat: new Uint8Array(N).fill(1), log: [[0, n0]] };
    for (let q = n0; q < ids.length; q++) { const i = ids[q]; st.mat[i] = 0; this.thr[i] = 1e9; }
    const ws = this.ws, pres = this.pres, posts = this.posts; for (let k = 0; k < ws.length; k++) if (!st.mat[pres[k]] || !st.mat[posts[k]]) ws[k] = 0;
    if (this.teachTr && p.preNorm > 0) for (let i = 0; i < N; i++) if (st.mat[i]) this.normPre(i);
  }
  stageStep() {                              // called once per tick (modulate): the next maturation wave when it is due
    const st = this.stg, ord = st.order; if (st.done >= ord.length || this.tickNo % st.at !== 0) return;
    const e = Math.min(ord.length, st.done + st.per), mat = st.mat, ws = this.ws, w0 = this.w0, thr = this.thr, dirty = new Uint8Array(this.N);
    for (let q = st.done; q < e; q++) { const i = ord[q]; mat[i] = 1; thr[i] = st.thr0[i]; this.v[i] = V_REST; }
    if (!st.inS) { const N = this.N, P = this.posts, c = new Int32Array(N + 1); for (let k = 0; k < P.length; k++) c[P[k] + 1]++; for (let j = 0; j < N; j++) c[j + 1] += c[j];   // all incoming synapses by cell
      const f = c.slice(0, N), K = new Int32Array(P.length); for (let k = 0; k < P.length; k++) K[f[P[k]]++] = k; st.inS = c; st.inK = K; }
    for (let q = st.done; q < e; q++) { const i = ord[q];   // synapses between mature cells that touch a newly mature one take their grown weight (they were 0, never learned)
      for (let k = this.start[i], E = this.start[i + 1]; k < E; k++) if (mat[this.posts[k]]) { ws[k] = w0[k]; dirty[i] = 1; }
      for (let a = st.inS[i], b = st.inS[i + 1]; a < b; a++) { const k = st.inK[a], j = this.pres[k]; if (mat[j]) { ws[k] = w0[k]; dirty[j] = 1; } } }
    st.done = e; st.log.push([this.tickNo, e]);
    if (this.teachTr && this.p.preNorm > 0) for (let i = 0; i < this.N; i++) if (dirty[i]) this.normPre(i);
  }
  /* R65 ENGINE SPEED (bit-identical; globalThis.__bbSlow = true before building a net restores the old loops, for A/B checks):
   *  - teacher pass only over the cells an input neuron contacts (the only cells whose teacher drive can be non-zero: every other cell's
   *    teacher trace stays 0, it never plateaus, never disarms, never gets an AHP), when teachThr > 0;
   *  - plateau potentiation / prediction-miss depression read a per-cell list of the incoming plastic excitatory synapses with their
   *    presynaptic cells (the same synapses in the same order as the isPlastic && w0 > 0 filter; w0 only changes under need-growth -> old loop);
   *  - spike traces that no rule reads are not updated (teacher rule with a lagged pre-trace: xPre / xPost are never read). */
  initFast() {
    this.fast = !globalThis.__bbSlow; if (!this.fast) return;
    const N = this.N, nIn = this.g.nIn, teach = !!this.teachTr && !(this.uni && this.eOn);
    this.trNeedPre = !this.xLag || !teach || !!this.use || !!(this.mxStart && this.p.mixLr > 0);
    this.trNeedPost = !teach || !!this.use;
    if (this.teachTr && this.p.teachThr > 0) { const z = new Uint8Array(N);
      for (let i = 0; i < nIn; i++) for (let k = this.start[i], e = this.start[i + 1]; k < e; k++) z[this.posts[k]] = 1;
      const T = [], Z = []; for (let i = 0; i < N; i++) if (z[i]) { Z.push(i); if (i >= nIn) T.push(i); }
      this.tgtList = Int32Array.from(T); this.tgtZero = Int32Array.from(Z); }
    if (this.teachTr && !this.ng) { const inS = this.inStart, inE = this.inEdges, isP = this.isPlastic, w0 = this.w0, pres = this.pres, st = new Int32Array(N + 1), K = [];
      for (let j = 0; j < N; j++) { st[j] = K.length; for (let q = inS[j], e = inS[j + 1]; q < e; q++) { const k = inE[q]; if (isP[k] && w0[k] > 0) K.push(k); } }
      st[N] = K.length; this.ipStart = st; this.ipK = Int32Array.from(K); this.ipPre = Int32Array.from(K, k => pres[k]); }
  }
  /* R66 FAST ENGINE (params.fastEngine = 1; default 0 = the exact engine above). The same model, computed lazily / event-driven
   * (not bit-identical: float rounding differs, every rule and constant is unchanged):
   *  - membrane: a cell is updated only in substeps where it receives input (synaptic, external, AHP, pool), or when its
   *    threshold adapts below its potential; in between, its leak toward rest is applied in closed form,
   *    v = rest + (v - rest) * leak^n, when it is next touched (exact in real numbers: without input a cell only decays
   *    toward rest and cannot reach a threshold above rest);
   *  - spike traces (output rate trace, pre / post traces, the lagged pre-trace) are stored divided by one shared decay
   *    factor per trace: decaying every cell is one multiplication, a spike adds 1 / factor (renormalised when the factor gets tiny);
   *  - teacher traces: only cells with teacher drive, a plateau, a disarmed teacher or an AHP are stepped ("hot" cells);
   *    a quiet cell's trace decays in closed form (x 0.7^n) when its next drive arrives.
   * Juvenile development nets, need-growth, pruning and learned mixing (mixLr) keep the exact engine. */
  initFastE() {
    if (this.ng || this.use || (this.mxStart && this.p.mixLr > 0) || (this.teachTr && !(this.p.teachThr > 0))) return;
    const N = this.N, g = this.g, L = this.dtF ? this.L : params.leak, GL = this.dtF ? this.gl : g.leak, TP = 256;
    this.fastE = true; this.subNo = 0; this.tv = new Int32Array(N);
    const cls = new Uint16Array(N), vals = [], idx = new Map();
    for (let i = 0; i < N; i++) { const l = g.slow && g.slow[i] ? GL[i] : L; let c = idx.get(l); if (c === undefined) { c = vals.length; idx.set(l, c); vals.push(l); } cls[i] = c; }
    this.lkCls = cls; this.lkVal = Float64Array.from(vals); this.lkTP = TP; this.lkLeak = L;
    this.fDense = params.fastEngine !== 2; this.lkC = Float64Array.from(cls, c => vals[c]);   // (1: every membrane updated each substep (faster at the measured ~20% touched cells per substep); 2: only touched cells, lazy leak)
    const pw = this.lkPow = new Float64Array(vals.length * TP); vals.forEach((l, c) => { let x = 1; for (let n = 0; n < TP; n++) { pw[c * TP + n] = x; x *= l; } });
    this.mk = new Uint8Array(2 * N + 4); this.mk32 = new Uint32Array(this.mk.buffer, 0, N >> 2);
    this.trS = Float64Array.from(this.trace); this.trG = 1;
    if (this.xLag) { this.xLag = Float64Array.from(this.xLag); this.xG = 1; }
    this.xPre = Float64Array.from(this.xPre); this.xPost = Float64Array.from(this.xPost); this.pG = 1; this.qG = 1;
    this.extL = new Int32Array(N); this.nExt = 0; this.extAt = -1;
    if (this.teachTr) { this.hotL = new Int32Array(N); this.inHot = new Uint8Array(N); this.nHot = 0; this.tTs = new Int32Array(N);
      const P7 = this.p7 = new Float64Array(2048); let x = 1; const q7 = this.dtF ? this.t7 : 0.7; for (let n = 0; n < 2048; n++) { P7[n] = x; x *= q7; } }
    if (params.granFast !== 0 && g.gran && this.fDense && !this.gd && !(params.sfa > 0) && !(params.stdU > 0) && !(params.granInh > 0) && !this.hhList && !this.riId) {
      let g0 = -1, g1 = -1, ok = true;
      for (let i = 0; i < N; i++) if (g.gran[i]) { if (g0 < 0) g0 = i; else if (i !== g1) ok = false; g1 = i + 1; if (cls[i] !== cls[g0] || (this.isRcv && this.isRcv[i])) ok = false; }
       if (ok && g0 >= 0 && (g1 - g0 <= 2048 || params.granFast === 2)) {
        const h = params.granHomeo > 0 ? params.granHomeo : 0.5, r0 = params.granRate > 0 ? params.granRate : 0, d = -h * r0;
        this.gFast0 = g0; this.gFast1 = g1; this.gFastLk = vals[cls[g0]];
        this.gBits = new Uint32Array(((g1 - g0) + 31) >>> 5);
        this.gTv = new Int32Array(N); this.gThTs = new Int32Array(N); this.gThStep = 0;
        this.gD = d; this.gD0 = Math.fround(-50 + d) + 50; this.gD1 = Math.fround(-65 + d) + 65;
        this.gNextCross = r0 > 0 ? Math.max(1, Math.floor((g.thresh[g0] - V_REST) / (-this.gD0)) - 2) : 0x7fffffff;
        if (r0 > 0 && !this.thr) this.thr = Float32Array.from(g.thresh);
      }
    }
  }
  buildExt() {                               // the cells with external current this tick (ext is set once per tick by the Agent)
    const ext = this.ext, E = this.extL; let n = 0; for (let i = 0; i < this.N; i++) if (ext[i] !== 0) E[n++] = i;
    this.nExt = n; this.extAt = this.tickNo;
  }
  catchUpGranTh(T, i, target) {
    const gThTs = this.gThTs; let n = target - gThTs[i]; if (n <= 0) return;
    let x = T[i]; const d = this.gD, d0 = this.gD0, d1 = this.gD1;
    while (n > 0 && x > -32) { x = Math.fround(x + d); n--; }
    if (n > 0 && x > -64) {
      const k = Math.min(n, Math.floor((x + 64) / (-d0)));
      if (k > 0) { x = Math.fround(x + k * d0); n -= k; }
      while (n > 0 && x > -64) { x = Math.fround(x + d); n--; }
    }
    if (n > 0) x = Math.fround(x + n * d1);
    T[i] = x; gThTs[i] = target;
  }
  syncState() {                              // bring every lazily kept value up to date (display / inspection; the engine does not need it)
    if (!this.fastE) return; const N = this.N, v = this.v, t = this.subNo, cls = this.lkCls, lv = this.lkVal;
    for (let i = 0; i < N; i++) { const n = this.fDense ? 0 : t - this.tv[i]; if (n > 0) { v[i] = V_REST + (v[i] - V_REST) * Math.pow(lv[cls[i]], n); this.tv[i] = t; } this.trace[i] = this.trS[i] * this.trG; }
    if (this.gFast0 != null) {
      const g0 = this.gFast0, g1 = this.gFast1, gTv = this.gTv, glk = this.gFastLk, R = V_REST, T = this.thr || this.g.thresh, thStep = this.gThStep;
      for (let i = g0; i < g1; i++) {
        const n = t - gTv[i]; if (n > 0 && v[i] !== R) { if (n >= 96) v[i] = R; else { let vx = v[i]; for (let s = 0; s < n; s++) vx = Math.fround(R + (vx - R) * glk); v[i] = vx; } }
        gTv[i] = t; if (thStep > 0) this.catchUpGranTh(T, i, thStep);
      }
    }
  }
  neuDense(t) {                              // R66 (fastEngine 1): every cell, as the exact loop, without the per-cell trace / flag writes; I106: bit-identical sparse granule block
    const N = this.N, v = this.v, syn = this.syn, sp = this.spiked, th = this.thr || this.g.thresh, spk = this.spk, R = V_REST, FL = V_FLOOR, lk = this.lkC, trS = this.trS, trI = 1 / this.trG;
    let nSpk = 0;
    if (this.gFast0 != null) {
      const g0 = this.gFast0, g1 = this.gFast1, gB = this.gBits, gTv = this.gTv, gThTs = this.gThTs, thStep = this.gThStep, glk = this.gFastLk, d0 = this.gD0;
      if (thStep >= this.gNextCross) {
        let minTh = 1e9;
        for (let i = g0; i < g1; i++) { this.catchUpGranTh(th, i, thStep); if (th[i] < minTh) minTh = th[i]; if (th[i] <= R + 0.001) gB[(i - g0) >>> 5] |= 1 << ((i - g0) & 31); }
        this.gNextCross = thStep + Math.max(1, Math.floor((minTh - R) / (-this.gD1)) - 2);
      }
      for (let i = 0; i < g0; i++) { const x = R + (v[i] + syn[i] - R) * lk[i]; syn[i] = 0;
        if (x >= th[i]) { v[i] = R; sp[i] = 1; spk[nSpk++] = i; trS[i] += trI; } else v[i] = x < FL ? FL : x; }
      for (let w = 0, nW = gB.length; w < nW; w++) {
        let m = gB[w]; if (m === 0) continue; gB[w] = 0; const base = g0 + (w << 5);
        while (m !== 0) {
          const b = 31 - Math.clz32(m & -m); m &= m - 1; const i = base + b;
          const n = t - 1 - gTv[i]; let vx = v[i];
          if (n > 0 && vx !== R) { if (n >= 96 && glk <= 0.86) vx = R; else for (let s = 0; s < n; s++) vx = Math.fround(R + (vx - R) * glk); }
          const mTh = thStep - gThTs[i];
          if (mTh > 0) { const tx = th[i]; if (tx <= -32 && tx + mTh * d0 > -64) { th[i] = Math.fround(tx + mTh * d0); gThTs[i] = thStep; } else this.catchUpGranTh(th, i, thStep); }
          const x = R + (vx + syn[i] - R) * glk; syn[i] = 0; gTv[i] = t;
          if (x >= th[i]) { v[i] = R; sp[i] = 1; spk[nSpk++] = i; trS[i] += trI; } else v[i] = x < FL ? FL : x;
        }
      }
      for (let i = g1; i < N; i++) { const x = R + (v[i] + syn[i] - R) * lk[i]; syn[i] = 0;
        if (x >= th[i]) { v[i] = R; sp[i] = 1; spk[nSpk++] = i; trS[i] += trI; } else v[i] = x < FL ? FL : x; }
      return nSpk;
    }
    for (let i = 0; i < N; i++) { const x = R + (v[i] + syn[i] - R) * lk[i]; syn[i] = 0;
      if (x >= th[i]) { v[i] = R; sp[i] = 1; spk[nSpk++] = i; trS[i] += trI; } else v[i] = x < FL ? FL : x; }
    return nSpk;
  }
  neuFast(t) {                               // R66 (fastEngine 2): membrane update of the touched cells (ascending), returns the spike count
    const N = this.N, v = this.v, syn = this.syn, sp = this.spiked, th = this.thr || this.g.thresh, mk = this.mk, m32 = this.mk32, tv = this.tv, spk = this.spk, R = V_REST, FL = V_FLOOR;
    const cls = this.lkCls, PW = this.lkPow, TP = this.lkTP, lv = this.lkVal, trS = this.trS, trI = 1 / this.trG, nW = N >> 2;
    let nSpk = 0;
    for (let w = 0; w <= nW; w++) {
      if (w < nW && m32[w] === 0) continue;
      const b = w << 2, e = w < nW ? b + 4 : N;
      for (let i = b; i < e; i++) { if (mk[i] === 0) continue; mk[i] = 0;
        const c = cls[i], n = t - 1 - tv[i]; let x = v[i];
        if (n > 0) x = R + (x - R) * (n < TP ? PW[c * TP + n] : Math.pow(lv[c], n));   // leak of the substeps without input (closed form)
        x = R + (x + syn[i] - R) * lv[c]; syn[i] = 0; tv[i] = t;
        if (x >= th[i]) { v[i] = R; sp[i] = 1; spk[nSpk++] = i; trS[i] += trI; }
        else v[i] = x < FL ? FL : x; }
    }
    return nSpk;
  }
  renormF(a, f) { for (let i = 0; i < a.length; i++) a[i] *= f; }
  initSparse() {                             // R67: see PL_DEFAULTS thrAdd / hidHomeo / regInh
    const g = this.g, p = this.p, N = this.N, h0 = g.nIn, h1 = g.nIn + g.nHid;
    const msk = p.regMask | 0, inM = i => !msk || ((msk >> (g.region && g.region[i] !== 255 ? g.region[i] : 0)) & 1) === 1;
    if (p.thrAdd !== 0 || p.hidHomeo > 0) { if (!this.thr) this.thr = Float32Array.from(g.thresh); }
    if (p.thrAdd !== 0) for (let i = h0; i < h1; i++) if (inM(i)) this.thr[i] += p.thrAdd;
    if (p.hidHomeo > 0) { const inR = new Uint8Array(N); if (this.rhList) for (const i of this.rhList) inR[i] = 1;
      const L = []; for (let i = h0; i < h1; i++) if (!inR[i] && inM(i)) L.push(i); this.hhList = Int32Array.from(L); this.hhFloor = Float32Array.from(L, i => this.thr[i]); }
    if (p.regInh > 0) { const reg = g.region, id = new Int32Array(N).fill(-1); let R = 1;
      for (let i = h0; i < h1; i++) { const r = reg && reg[i] !== 255 ? reg[i] : 0; if (r + 1 > R) R = r + 1; id[i] = inM(i) ? r : -1; }
      const sz = new Float64Array(R); for (let i = h0; i < h1; i++) if (id[i] >= 0) sz[id[i]]++;
      this.riId = id; this.riN = R; this.riInv = Float64Array.from(sz, n => n ? 100 / n : 0); this.riCnt = new Float64Array(R); this.riP = new Float64Array(R);
      this.riD = p.regInhTau > 0 ? Math.exp(-1 / p.regInhTau) : 0; this.riH0 = h0; this.riH1 = h1; }
  }
  // R120 P.denseCeil (mV per substep, 0 = off, bit-identical off, no RNG): activity-RELATIVE ceiling homeostasis for the always-on
  // non-granule hidden cells. Each cell keeps an EMA of its own spike rate (tau 2000 substeps); a cell firing more than denseK (default 4)
  // x the mean rate of its region's cells (measured once, over the first 4000 substeps, then frozen: a running mean would chase
  // the cells it silences) gets its threshold raised (at most to twice its grown distance from rest) by denseCeil every substep; otherwise the threshold relaxes back
  // (denseCeil / 10) toward the grown threshold (never below it). Self-calibrating: no target rate, only "much busier than its
  // neighbours". Granules and the 'go' / 'tonic' tagged relays (clock / tonic drive, constant by design) are exempt. Learning phase only.
  initDense() { const g = this.g, h0 = g.nIn, h1 = g.nIn + g.nHid, ti = g.typeInfo || [], ex = new Set(); ti.forEach((t, j) => { if (/ (go|go2|go3|tonic) cells$/.test(t.label)) ex.add(16 + j); });
    if (!this.thr) this.thr = Float32Array.from(g.thresh); const L = [];
    const inh = i => { const st = this.start, w0 = this.w0; if (!st || !w0) return false; for (let k = st[i]; k < st[i + 1]; k++) if (w0[k] < 0) return true; return false; };   // inhibitory cells (the brake) are exempt
    for (let i = h0; i < h1; i++) if (!(g.gran && g.gran[i]) && !ex.has(g.cellType[i]) && !inh(i)) L.push(i);
    const reg = g.region, rid = Int32Array.from(L, i => reg && reg[i] !== 255 ? reg[i] : 0), R = rid.reduce((m, x) => Math.max(m, x + 1), 1);
    this.dc = { L: Int32Array.from(L), F: Float32Array.from(L, i => this.thr[i]), e: new Float32Array(L.length), rid, R, mr: new Float64Array(R).fill(1), n: Float64Array.from({ length: R }, (_, r) => rid.filter(x => x === r).length), t: 0, K: params.denseK > 0 ? params.denseK : 4, up: 0 }; }
  denseStep(sp, mk) { const dc = this.dc; if (!dc || !params.plasticity) return; const { L, F, e, rid, mr } = dc, h = params.denseCeil, thr = this.thr, v = this.v, R0 = V_REST, d = 1 / 2000;
    if ((++dc.t & 255) === 0 && !dc.frz) { if (dc.t > 4000) dc.frz = 1; const s = new Float64Array(dc.R); for (let q = 0; q < L.length; q++) s[rid[q]] += e[q]; for (let r = 0; r < dc.R; r++) mr[r] = dc.n[r] ? s[r] / dc.n[r] : 1; }
    const warm = dc.t > 4000, K = dc.K;
    for (let q = 0; q < L.length; q++) { const i = L[q]; e[q] += d * (sp[i] - e[q]); if (!warm) continue;
      if (e[q] > K * mr[rid[q]]) { if (thr[i] < F[q] + (F[q] - R0)) { thr[i] += h; dc.up++; } } else if (thr[i] > F[q]) { let x = thr[i] - 0.1 * h; if (x < F[q]) x = F[q]; thr[i] = x; if (mk && x <= (v[i] > R0 ? v[i] : R0)) mk[i] = 1; } } }
  denseStats() { const dc = this.dc; if (!dc) return null; let n = 0, raised = 0, mx = 0; for (let q = 0; q < dc.L.length; q++) { if (dc.e[q] > dc.K * dc.mr[dc.rid[q]]) n++; const x = this.thr[dc.L[q]] - dc.F[q]; if (x > 0.01) raised++; if (x > mx) mx = x; } return { cells: dc.L.length, over: n, raised, maxRaise: +mx.toFixed(2), ups: dc.up, regMean: Array.from(dc.mr, x => +x.toFixed(4)) }; }
  sparseStep(sp, spk, nSpk, mk) {            // R67: hidden-cell homeostasis + pooled region inhibition (mk: event-engine marks or null)
    const p = this.p, v = this.v, R0 = V_REST;
    if (this.hhList && params.plasticity) { const L = this.hhList, F = this.hhFloor, h = p.hidHomeo, r0 = p.hidRate, thr = this.thr;
      for (let q = 0; q < L.length; q++) { const i = L[q]; let x = thr[i] + h * (sp[i] - r0); if (x < F[q]) x = F[q]; thr[i] = x; if (mk && x <= (v[i] > R0 ? v[i] : R0)) mk[i] = 1; } }
    if (this.riId) { const id = this.riId, C = this.riCnt, P = this.riP, inv = this.riInv, n = this.riN, a = p.regInh, k = 100 * p.regK, d = this.riD, syn = this.syn;
      C.fill(0); for (let s = 0; s < nSpk; s++) { const r = id[spk[s]]; if (r >= 0) C[r]++; }
      let any = false; for (let r = 0; r < n; r++) { const f = C[r] * inv[r] - k; P[r] = P[r] * d + (f > 0 ? a * f : 0); if (P[r] > 1e-9) any = true; }
      if (any) for (let i = this.riH0; i < this.riH1; i++) { if (id[i] < 0) continue; const x = P[id[i]]; if (x > 1e-9) { syn[i] -= x; if (mk) mk[i] = 1; } } }
  }
  // R81 FIRING FATIGUE (global params, 0/undefined = off, bit-identical off; Travis: avoid generation loops):
  //  sfa > 0: spike-frequency adaptation. Each spike of a hidden / output cell adds sfa (mV) to its adaptation current a, which
  //   decays with sfaTau substeps (default 20) and is subtracted from the cell's input every substep. sfaOut 1 = output cells only.
  //  fatGen 1: fatigue only while plasticity is off (free-running generation / frozen eval).
  //  stdU > 0: short-term synaptic depression (Tsodyks-Markram, per presynaptic cell): a spike transmits ws x r (r = available
  //   resource, starts 1), then r -= stdU r; r recovers toward 1 with stdTau substeps (default 50). Excitatory hidden cells only.
  fatigue(spk, nSpk, syn, mk) { const N = this.N, o0 = this.g.nIn + this.g.nHid;
    if (params.sfa > 0) { if (!this.sfA) { this.sfA = new Float32Array(N); this.sfL = []; } const a = this.sfA, d = Math.exp(-1 / (params.sfaTau > 0 ? params.sfaTau : 20)), lo = params.sfaOut > 0 ? o0 : this.g.nIn;
      const L = this.sfL; let n = 0; for (let q = 0; q < L.length; q++) { const i = L[q]; a[i] *= d; if (a[i] > 1e-3) L[n++] = i; else a[i] = 0; } L.length = n;
      for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (i < lo) continue; if (a[i] === 0) L.push(i); a[i] += params.sfa; }
      for (let q = 0; q < L.length; q++) { const i = L[q]; syn[i] -= a[i]; if (mk) mk[i] = 1; } }
    if (params.stdU > 0) { if (!this.stR) { this.stR = new Float32Array(N).fill(1); this.stL = []; } const r = this.stR, U = params.stdU, dR = 1 - Math.exp(-1 / (params.stdTau > 0 ? params.stdTau : 50));
      const L = this.stL; let n = 0; for (let q = 0; q < L.length; q++) { const i = L[q]; r[i] += (1 - r[i]) * dR; if (r[i] < 0.999) L[n++] = i; else r[i] = 1; } L.length = n;
      const st = this.start, ps = this.posts, ws = this.ws, nI = this.g.nIn;
      for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (i < nI || i >= o0) continue; const lost = 1 - r[i];
        if (lost > 0) for (let k = st[i], e = st[i + 1]; k < e; k++) { const w = ws[k]; if (w > 0) { const j = ps[k]; syn[j] -= w * lost; if (mk) mk[j] = 1; } }
        if (r[i] === 1) L.push(i); r[i] -= U * r[i]; } } }
  stepFast() {
    const N = this.N, v = this.v, syn = this.syn, ext = this.ext, sp = this.spiked, th = this.thr || this.g.thresh, mk = this.mk, m32 = this.mk32, tv = this.tv;
    const spk = this.spk, t = ++this.subNo, R = V_REST, FL = V_FLOOR;
    for (let s = 0; s < this.nSpk; s++) sp[spk[s]] = 0;       // spike flags of the previous substep
    this.trG *= this.dtF ? this.td : params.traceDecay; if (this.trG < 1e-100) { this.renormF(this.trS, this.trG); this.trG = 1; }
    if (this.extAt !== this.tickNo) this.buildExt();
    if (this.cg) this.chunkGateStep(syn, this.fDense ? null : mk);
    { const E = this.extL; if (this.fDense) for (let q = 0; q < this.nExt; q++) { const i = E[q]; syn[i] += ext[i]; } else for (let q = 0; q < this.nExt; q++) { const i = E[q]; syn[i] += ext[i]; mk[i] = 1; } }
    const nSpk = this.fDense ? this.neuDense(t) : this.neuFast(t);

    this.spikeCount += nSpk; this.nSpk = nSpk;
    if ((params.sfa > 0 || params.stdU > 0) && !(params.fatGen > 0 && params.plasticity)) this.fatigue(spk, nSpk, syn, this.fDense ? null : this.mk);   // R81 firing fatigue (off by default)
    const start = this.start, posts = this.posts, ws = this.ws;
    if (this.rcv) {                          // receiver pool (as propagateRcv), touched cells marked
      const buf = this.synBuf, tg = this.synTgt, isR = this.isRcv, sP = this.synP, RL = this.rcv, p = this.p; let nR = 0;
      if (this.fDense) {
        if (this.gFast0 != null) { const g0 = this.gFast0, g1 = this.gFast1, gB = this.gBits;
          for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (isR[i]) nR++; for (let k = start[i], e = start[i + 1]; k < e; k++) { const j = tg[k], wv = ws[k]; if (wv !== 0) { buf[j] += wv; if (j >= g0 && j < g1) gB[(j - g0) >>> 5] |= 1 << ((j - g0) & 31); } } }
        } else for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (isR[i]) nR++; for (let k = start[i], e = start[i + 1]; k < e; k++) buf[tg[k]] += ws[k]; }
      }
      else for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (isR[i]) nR++; for (let k = start[i], e = start[i + 1]; k < e; k++) { const j = tg[k]; buf[j] += ws[k]; mk[j] = 1; } }
      let f = 1; if (p.rcvDiv > 0) { let S = 0; for (let q = 0; q < RL.length; q++) S += sP[RL[q]]; f = p.rcvDiv * RL.length / (p.rcvSig + S); }
      this.poolTr = this.poolTr * this.dPool + nR; const inh = p.rcvInh * this.poolTr, sd = p.rcvNoise, rng = this.rcvRng, all = inh !== 0 || sd > 0 || this.fDense;
      if (this.fDense && sd === 0) for (let q = 0; q < RL.length; q++) { const j = RL[q]; syn[j] += sP[j] * f - inh; sP[j] = 0; }   // (dense: no marks)
      else for (let q = 0; q < RL.length; q++) { const j = RL[q]; if (!mk[N + j] && !all) continue; mk[N + j] = 0;
        let x = sP[j] * f - inh; if (sd > 0) { const u = rng() || 1e-12, z = rng(); x += sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * z); }
        syn[j] += x; sP[j] = 0; mk[j] = 1; }
    } else if (this.fDense) {
      if (this.gFast0 != null) { const g0 = this.gFast0, g1 = this.gFast1, gB = this.gBits;
        for (let s = 0; s < nSpk; s++) { const i = spk[s]; for (let k = start[i], e = start[i + 1]; k < e; k++) { const j = posts[k], wv = ws[k]; if (wv !== 0) { syn[j] += wv; if (j >= g0 && j < g1) gB[(j - g0) >>> 5] |= 1 << ((j - g0) & 31); } } }
      } else for (let s = 0; s < nSpk; s++) { const i = spk[s]; for (let k = start[i], e = start[i + 1]; k < e; k++) syn[posts[k]] += ws[k]; }
    }
    else for (let s = 0; s < nSpk; s++) { const i = spk[s]; for (let k = start[i], e = start[i + 1]; k < e; k++) { const j = posts[k]; syn[j] += ws[k]; mk[j] = 1; } }
    if (this.rhList && params.plasticity) { const L = this.rhList, h = this.p.rcvHomeo, r0 = this.p.rcvRate, thr = this.thr; for (let q = 0; q < L.length; q++) { const i = L[q]; thr[i] += h * (sp[i] - r0); if (thr[i] <= (v[i] > R ? v[i] : R)) mk[i] = 1; } }
    if (this.hhList || this.riId) this.sparseStep(sp, spk, nSpk, this.fDense ? null : mk);
    if (this.dc) this.denseStep(sp, this.fDense ? null : mk);
    if (this.anList) { if (this.p.actNoise > 0) this.actNoiseStep(); if (this.p.actFb > 0 || this.p.outInh > 0) this.actLoop(sp);   // v20 action noise / feedback (as the exact engine)
      if (!this.fDense) { const A = this.anList, C = this.acList, o0 = this.g.nIn + this.g.nHid; for (let q = 0; q < A.length; q++) mk[A[q]] = 1; for (let q = 0; q < C.length; q++) mk[C[q]] = 1; for (let m = 0; m < this.g.nOut; m++) mk[o0 + m] = 1; } }
    if (this.mixPre) { let n = 0; for (let s = 0; s < nSpk; s++) n += this.mixPre[spk[s]];
      if (n && this.mlS) { const S = this.mlS, P = this.mlP, D = this.mlD; for (let s = 0; s < nSpk; s++) { const i = spk[s]; for (let k = S[i], e = S[i + 1]; k < e; k++) { syn[P[k]] -= D[k]; if (!this.fDense) mk[P[k]] = 1; } } }
      else if (n) { const d = this.mixInhD * n, ml = this.mixList; if (this.fDense) for (let q = 0; q < ml.length; q++) syn[ml[q]] -= d; else for (let q = 0; q < ml.length; q++) { syn[ml[q]] -= d; mk[ml[q]] = 1; } } }
    if (this.gd) this.granDemandDrive(spk, nSpk, syn, this.fDense ? null : mk);   // R102: demand-grown claws
    if (this.gu) this.guDrive(spk, nSpk, syn, this.fDense ? null : mk);
    if (this.g.gran) this.granInh(spk, nSpk, syn, this.fDense ? null : mk);   // R83 granule feedforward inhibition
    if (this.mxStart && params.plasticity && this.thr && !this.mixFrozen()) { const ml = this.mxList, hr = this.p.mixHomeo, r0 = this.p.mixRate, thr = this.thr;
      if (ml) { if (this.fDense) for (let q = 0; q < ml.length; q++) { const i = ml[q]; thr[i] += hr * (sp[i] - r0); }
        else for (let q = 0; q < ml.length; q++) { const i = ml[q]; thr[i] += hr * (sp[i] - r0); if (thr[i] <= (v[i] > R ? v[i] : R)) mk[i] = 1; } } }   // (a threshold that adapted down to the potential: the cell must be looked at)
    if (this.teachTr) {                      // teacher events: only hot cells are stepped
      const drv = this.drv, nIn = this.g.nIn, tT = this.teachTr, thr = this.p.teachThr, plat = this.plat, armed = this.armed, H = this.hotL, inH = this.inHot, tS = this.tTs, P7 = this.p7, iI = this.instrIn;
      let nH = this.nHot;
      for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (i >= nIn) break; if (iI && !iI[i]) continue;
        for (let k = start[i], e = start[i + 1]; k < e; k++) { if (!(ws[k] > 0)) continue; const j = posts[k]; if (j < nIn) continue;
          if (!inH[j]) { inH[j] = 1; H[nH++] = j; const n = t - 1 - tS[j]; tT[j] *= n < 2048 ? P7[n] : 0; }
          drv[j] += ws[k]; } }
      const ahp = this.ahp, dA = this.p.teachAHP, plN = this.p.plateau; let w = 0; const q7 = this.dtF ? this.t7 : 0.7;
      for (let q = 0; q < nH; q++) { const i = H[q]; tT[i] = tT[i] * q7 + drv[i]; drv[i] = 0; if (plat[i] > 0) plat[i]--;
        if (tT[i] >= thr && armed[i]) { plat[i] = plN; armed[i] = 0; if (this.trust && this.trustT < 0 && this.trustRecv[i]) this.trustT = this.p.trustDelay; }
        else if (tT[i] < thr / 2) { if (ahp && !armed[i] && this.ahpRecv[i]) ahp[i] = this.p.teachAHPDur; armed[i] = 1; }
        if (ahp && ahp[i] > 0) { syn[i] -= dA; ahp[i]--; mk[i] = 1; }
        if (armed[i] && plat[i] === 0 && !(ahp && ahp[i] > 0)) { inH[i] = 0; tS[i] = t; } else H[w++] = i; }
      this.nHot = w;
      if (this.trust && this.trustT >= 0 && this.trustT-- === 0) this.updateTrust();
    }
    for (let c = 0; c < this.nCh; c++) { const s = this.chSrc[c]; for (let q = 0; q < s.length; q++) this.chSpikes[c] += sp[s[q]]; }
    if (this.learning) this.stdp();       // (as the exact engine: traces only advance while learning)
  }
  tracesFast() {                             // (end of stdp) scaled traces: one factor update + one addition per spike
    const spk = this.spk, nSpk = this.nSpk;
    if (this.xLag) { const xL = this.xLag, P = this.p.preLag, slot = this.lagPos;
      if (!this.lagL) { this.lagL = Array.from({ length: P }, () => new Int32Array(this.N)); this.lagN = new Int32Array(P); }
      this.xG *= this.dPre; if (this.xG < 1e-100) { this.renormF(xL, this.xG); this.xG = 1; }
      const Ls = this.lagL[slot], nL = this.lagN[slot], inc = 1 / this.xG;
      for (let q = 0; q < nL; q++) xL[Ls[q]] += inc;             // spikes of preLag substeps ago enter the lagged trace
      for (let q = 0; q < nSpk; q++) Ls[q] = spk[q]; this.lagN[slot] = nSpk; this.lagPos = (slot + 1) % P; }
    if (!this.xLag || this.trNeedPre) { this.pG *= this.dPre; if (this.pG < 1e-100) { this.renormF(this.xPre, this.pG); this.pG = 1; } const a = this.xPre, inc = 1 / this.pG; for (let q = 0; q < nSpk; q++) a[spk[q]] += inc; }
    if (!this.xLag || this.trNeedPost) { this.qG *= this.dPost; if (this.qG < 1e-100) { this.renormF(this.xPost, this.qG); this.qG = 1; } const a = this.xPost, inc = 1 / this.qG; for (let q = 0; q < nSpk; q++) a[spk[q]] += inc; }
  }
  /* v28 (R29) NEED-GROWTH: learning-driven recruitment of new cells during the lifetime (adult-neurogenesis analogue).
   * Its own signal, separate from connection demand (growth), dopamine (outcome) and homeostasis (activity):
   * the LEARNING LAYER L = cells with plastic excitatory outputs (mixing / conjunctive cells; the actor columns of reward plans),
   * its RECEIVERS = the targets of those plastic synapses, its SOURCES = the excitatory inputs of L.
   * Error per event: prediction receivers (instructive input) -> mismatch at each teacher onset = 1 - share of the recent
   * receiver activity that was on the taught cell; reward receivers -> negative outcome RPE (clipped to [0, 1]).
   * The area keeps a slow average E of its error (ngTau events). E above ngThr + ngCost x (new cells alive) for ngHold events
   * (and ngRef events after the last recruit) -> one quiescent reserve cell matures: its dendrites take a claw of sources
   * chosen by their error tags (sources active just before errors), its axon forms weak plastic synapses on the receivers
   * (the existing learning rules do the rest). Trophic test after ngTrial events: a new cell whose outgoing synapses gained
   * less than ngKeep x the layer's mean gain in that window returns to quiescence (pruned). Cap: the reserve size ngRes. */
  planNeed(g, p) {
    const N0 = g.N, nIn = g.nIn, h1 = g.nIn + g.nHid, W = g.W, P = g.P, isL = new Uint8Array(N0), isRc = new Uint8Array(N0);
    for (let a = nIn; a < h1; a++) for (let b = 0; b < N0; b++) { const q = a * N0 + b; if (W[q] > 0 && (!P || P[q])) { isL[a] = 1; isRc[b] = 1; } }
    let L = []; for (let i = 0; i < N0; i++) if (isL[i]) L.push(i);
    if (!L.length) return null;
    const dead = new Uint8Array(N0), red = p.ngReduce || 0;
    if (red > 0) { const r = mulberry32((0x6e6721 ^ N0 * 2654435761 ^ L.length) >>> 0), sh = L.slice();
      for (let k = sh.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [sh[k], sh[j]] = [sh[j], sh[k]]; }
      for (let k = 0; k < Math.floor(red * sh.length); k++) dead[sh[k]] = 1; }
    const isS = new Uint8Array(N0), cnt = [], tot = [], th = [];
    for (const l of L) { if (dead[l]) continue; let c = 0, t = 0; for (let a = 0; a < N0; a++) { const w = W[a * N0 + l]; if (w > 0 && !isL[a] && !dead[a]) { isS[a] = 1; c++; t += w; } } if (c) { cnt.push(c); tot.push(t); } th.push(g.thresh[l]); }
    const med = x => { const y = x.slice().sort((a, b) => a - b); return y.length ? y[y.length >> 1] : 0; };
    const S = []; for (let i = 0; i < N0; i++) if (isS[i]) S.push(i);
    const Rc = []; for (let i = 0; i < N0; i++) if (isRc[i] && !dead[i]) Rc.push(i);
    const wOut = Rc.map(b => { let s = 0, n = 0; for (const l of L) { if (dead[l]) continue; const w = W[l * N0 + b]; if (w > 0) { s += w; n++; } } return n ? s / n : 0; });
    const R = Math.max(0, Math.round(p.ngRes)), extra = new Array(N0 + R), k = Math.max(1, p.ngClaw > 0 ? Math.round(p.ngClaw) : med(cnt));
    if (!S.length || !Rc.length) return null;
    for (const s of S) extra[s] = Array.from({ length: R }, (_, j) => [N0 + j, 0]);
    for (let j = 0; j < R; j++) extra[N0 + j] = Rc.map(b => [b, 1]);
    const sPos = new Int32Array(N0).fill(-1); S.forEach((s, q) => { sPos[s] = q; });
    const Lsrc = L.filter(l => !dead[l]).map(l => { const o = []; for (let a = 0; a < N0; a++) if (W[a * N0 + l] > 0 && sPos[a] >= 0) o.push(sPos[a]); return o; });   // R40 ngStruct: the claw of each grown layer cell
    return { R, N0, dead, L: L.filter(l => !dead[l]), Lsrc, S, Rc, wOut, k, wIn: med(tot) / k, thr0: med(th), extra, nDead: dead.reduce((a, b) => a + b, 0) };
  }
  initNeed() {
    const P = this.ngPlan, N = this.N, p = this.p, ng = this.ng = { on: [], act: [], E: 0, above: 0, since: 1e9, ev: 0, added: 0, pruned: 0, alive: 0, log: [], birth: new Float64Array(P.R).fill(-1), base: new Float64Array(P.R), baseL: new Float64Array(P.R), mature: new Uint8Array(P.R) };
    const sIdx = new Int32Array(N).fill(-1); P.S.forEach((s, q) => { sIdx[s] = q; }); ng.sIdx = sIdx; ng.sTr = new Float32Array(P.S.length); ng.tag = new Float32Array(P.S.length);
    const rcv = new Uint8Array(N); for (const b of P.Rc) rcv[b] = 1; ng.rcv = rcv; ng.tro = new Float64Array(N);
    let nInstr = 0; if (this.instrCell) for (const b of P.Rc) nInstr += this.instrCell[b];
    ng.pred = !!this.teachTr && nInstr * 2 > P.Rc.length; ng.dTr = ng.pred ? this.dPre : this.dElig;
    ng.instr = ng.pred ? P.Rc.filter(b => this.instrCell[b]) : [];
    ng.rng = mulberry32((0xbeef17 ^ N * 7919) >>> 0);
    // edge indices of each reserve cell: incoming (source -> r) and outgoing (r -> receivers)
    ng.inK = Array.from({ length: P.R }, () => []); ng.outK = Array.from({ length: P.R }, () => []);
    for (let k = 0; k < this.posts.length; k++) { const a = this.pres[k], b = this.posts[k]; if (b >= P.N0) ng.inK[b - P.N0].push(k); else if (a >= P.N0) ng.outK[a - P.N0].push(k); }
  }
  needTrace(spk, nSpk) {                       // source activity traces (the context active before an error)
    const ng = this.ng, t = ng.sTr, d = ng.dTr; for (let q = 0; q < t.length; q++) t[q] *= d;
    for (let s = 0; s < nSpk; s++) { const q = ng.sIdx[spk[s]]; if (q >= 0) t[q] += 1; }
  }
  needMiss() {                                // teacher onset (a column of receivers): mismatch = 1 - share of the recent receiver activity on the taught cells
    const tr = this.trace, I = this.ng.instr, on = this.ng.on; let sum = 0.05, hit = 0;
    for (let q = 0; q < I.length; q++) sum += tr[I[q]]; for (const i of on) hit += tr[i]; on.length = 0;
    this.needEvent(Math.max(0, 1 - hit / sum));
  }
  needEvent(err) {
    const ng = this.ng, p = this.p, P = this.ngPlan, tag = ng.tag, t = ng.sTr, a = 1 / Math.max(1, p.ngTau);
    ng.ev++; ng.since++; ng.E += a * (err - ng.E);
    for (let q = 0; q < tag.length; q++) tag[q] = tag[q] * (1 - a) + err * t[q];
    if (!params.plasticity) return;
    // trophic test of new cells at the end of their trial
    let Lm = 0; for (const l of P.L) Lm += ng.tro[l]; Lm /= Math.max(1, P.L.length);
    for (let j = 0; j < P.R; j++) if (ng.birth[j] >= 0 && !ng.mature[j] && ng.ev - ng.birth[j] >= p.ngTrial) {
      const gain = ng.tro[P.N0 + j] - ng.base[j], ref = Lm - ng.baseL[j];
      if (gain < p.ngKeep * ref) this.needPrune(j); else ng.mature[j] = 1; }
    ng.above = ng.E > p.ngThr + p.ngCost * ng.alive / Math.max(1, P.L.length) ? ng.above + 1 : 0;   // metabolic cost: the threshold rises with the new cells alive (relative to the layer)
    if (ng.above >= p.ngHold && ng.since >= p.ngRef) for (let n = 0; n < Math.max(1, p.ngBatch); n++) { const j = ng.birth.findIndex(b => b < 0); if (j < 0) break; this.needRecruit(j, Lm); }
  }
  needRecruit(j, Lm) {
    const ng = this.ng, P = this.ngPlan, r = P.N0 + j, tag = ng.tag, ws = this.ws, k = Math.min(P.k, P.S.length);
    const inK = ng.inK[j], w = Array.from(tag, x => x + 1e-6), chosen = [];
    if (this.p.ngStruct > 0 && P.Lsrc && P.Lsrc.length) {   // R40 structured recruit: bud from the grown layer cell whose claw carries the most error tag (same structured inputs)
      let best = -1, bv = -1; for (let l = 0; l < P.Lsrc.length; l++) { const c = P.Lsrc[l]; if (!c.length) continue; let v = 0; for (const q of c) v += tag[q]; v /= c.length; if (v > bv) { bv = v; best = l; } }
      if (best >= 0) for (const q of P.Lsrc[best]) if (chosen.length < k && !chosen.includes(q)) { chosen.push(q); w[q] = 0; } }
    for (let n = chosen.length; n < k; n++) { let s = 0; for (const x of w) s += x; let u = ng.rng() * s, q = 0; for (; q < w.length - 1; q++) { u -= w[q]; if (u <= 0) break; } chosen.push(q); w[q] = 0; }
    for (const q of chosen) { ws[inK[q]] = P.wIn; this.w0[inK[q]] = P.wIn; tag[q] *= 0.5; }   // (source q's edge to r: extra lists were built in source order)
    const outK = ng.outK[j]; for (let q = 0; q < outK.length; q++) { ws[outK[q]] = P.wOut[q] * this.p.ngW; }
    if (this.p.preNorm > 0 && this.npStart) this.normPre(r);
    this.thr[r] = P.thr0; ng.birth[j] = ng.ev; ng.mature[j] = 0; ng.base[j] = ng.tro[r]; ng.baseL[j] = Lm; ng.since = 0; ng.above = 0;
    ng.added++; ng.alive++; ng.act.push(r); ng.log.push([ng.ev, 1, j, chosen.length]);
  }
  needPrune(j) {
    const ng = this.ng, P = this.ngPlan, r = P.N0 + j, ws = this.ws;
    for (const k of ng.inK[j]) { ws[k] = 0; this.w0[k] = 0; } for (const k of ng.outK[j]) { ws[k] = 0; this.elig[k] = 0; }
    this.thr[r] = 1e9; this.v[r] = V_REST; ng.birth[j] = -1; ng.act.splice(ng.act.indexOf(r), 1); ng.alive--; ng.pruned++; ng.log.push([ng.ev, -1, j]);
  }
  needStats() { const ng = this.ng; if (!ng) return null; return { mode: ng.pred ? 'mismatch' : 'negRPE', E: +ng.E.toFixed(3), events: ng.ev, added: ng.added, pruned: ng.pruned, alive: ng.alive, reserve: this.ngPlan.R, layer: this.ngPlan.L.length, dead: this.ngPlan.nDead, log: ng.log }; }
  // v20 action-channel noise: channel of a cell = the output it projects to most strongly (an output without such cells: itself)
  initActNoise() {
    const N = this.N, g = this.g, o0 = g.nIn + g.nHid, nO = g.nOut, ch = new Int16Array(N).fill(-1), best = new Float32Array(N), recv = new Uint8Array(N);
    for (const k of this.plastic) if (this.w0[k] > 0) recv[this.posts[k]] = 1;
    for (let k = 0; k < this.posts.length; k++) { const i = this.pres[k], j = this.posts[k]; if (j >= o0 && recv[i] && this.ws[k] > best[i]) { best[i] = this.ws[k]; ch[i] = j - o0; } }
    for (let m = 0; m < nO; m++) if (!ch.some(c => c === m)) ch[o0 + m] = m;   // an output without an action column gets the noise itself
    const L = [], C = []; for (let i = 0; i < N; i++) if (ch[i] >= 0) { L.push(i); C.push(ch[i]); }
    this.anList = Int32Array.from(L); this.anCh = Int16Array.from(C); this.anVal = new Float32Array(nO);
    this.anA = Math.exp(-1 / Math.max(1, this.p.actNoiseTau)); this.anRng = mulberry32(0x9e3779b1 ^ g.N);
    this.anF = 1; if (params.anSize > 0 && g.regions) { let f = 1; for (const r of g.regions) if (r && r.sizeF > f) f = r.sizeF; if (f > 1) this.anF = Math.sqrt(f); }   // R131 anSize (global, 0 = off, bit-identical; 1x unchanged): exploration noise x sqrt(size factor)
    const Lr = [], Cr = []; for (let i = 0; i < o0; i++) if (ch[i] >= 0) { Lr.push(i); Cr.push(ch[i]); } this.acList = Int32Array.from(Lr); this.acCh = Int16Array.from(Cr);   // the columns (without outputs)
  }
  actLoop(sp) {                               // output spikes -> own column +actFb, other columns -actFb, other outputs -outInh
    const g = this.g, o0 = g.nIn + g.nHid, nO = g.nOut, fb = this.p.actFb, oi = this.p.outInh, syn = this.syn, L = this.acList, C = this.acCh;
    for (let m = 0; m < nO; m++) { if (!sp[o0 + m]) continue;
      if (fb > 0) for (let q = 0; q < L.length; q++) syn[L[q]] += C[q] === m ? fb : -fb;
      if (oi > 0) for (let j = 0; j < nO; j++) if (j !== m) syn[o0 + j] -= oi; }
  }
  anSelfF() {                                // R131 anSelf (global, 0 = off, bit-identical): self-calibrated exploration: noise x sqrt(B), B = max / mean of the outputs'
    const o0 = this.g.nIn + this.g.nHid, nO = this.g.nOut, sp = this.spiked;   //   recent spike rates (EMA, tau params.anSelfTau substeps; 1 = arms balanced), so a column that dominates by its wiring is explored away
    if (!this.anS) { this.anS = new Float64Array(nO); this.anSa = 1 - 1 / Math.max(1, params.anSelfTau || 4000); }
    const S = this.anS, aa = this.anSa; let mx = 0, sm = 0; for (let m = 0; m < nO; m++) { S[m] = aa * S[m] + (1 - aa) * sp[o0 + m]; sm += S[m]; if (S[m] > mx) mx = S[m]; }
    return sm > 0 ? Math.sqrt(Math.max(1, mx * nO / sm)) : 1; }
  actNoiseStep() {
    const v = this.anVal, a = this.anA, kv = this.crit && this.p.actNoiseV > 0 ? 1 / (1 + this.p.actNoiseV * Math.max(0, this.value)) : 1,   // v20: less exploration where more reward is expected
          sd = kv * this.p.actNoise * Math.sqrt(1 - a * a) * (this.anF > 1 ? this.anF : 1) * (params.anSelf > 0 ? this.anSelfF() : 1), r = this.anRng, L = this.anList, C = this.anCh, syn = this.syn;
    for (let m = 0; m < v.length; m++) { const u = r() || 1e-12, w = r(); v[m] = a * v[m] + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * w); }
    for (let q = 0; q < L.length; q++) syn[L[q]] += v[C[q]];
  }
  // v20 (round 21) critic: value V = sum u_i x_i over the state cells (see PL_DEFAULTS rpe*), TD error -> dopamine
  initCritic() {
    const N = this.N, g = this.g, h0 = g.nIn, h1 = g.nIn + g.nHid, src = this.p.rpeSrc, S = [];
    if (src === 1 && g.mix) { for (let i = h0; i < h1; i++) if (g.mix[i]) S.push(i); }
    if (!S.length && src !== 2) { const pre = new Uint8Array(N); for (const k of this.plastic) if (this.w0[k] > 0) pre[this.pres[k]] = 1; for (let i = 0; i < N; i++) if (pre[i]) S.push(i); }
    if (!S.length) for (let i = h0; i < h1; i++) S.push(i);
    this.crit = { S: Int32Array.from(S), u: new Float32Array(S.length), z: new Float32Array(S.length), xPrev: new Float32Array(S.length), Vprev: 0 };
    this.value = 0; this.delta = 0; this.lastDelta = 0; this.reward = 0;
  }
  // one critic step per tick: returns the TD error for reward r (and learns u)
  criticStep(r, outcome) {
    const c = this.crit, S = c.S, u = c.u, z = c.z, xp = c.xPrev, p = this.p, tr = this.fastE ? this.trS : this.trace, k = (1 - (this.dtF ? this.td : params.traceDecay)) * (this.fastE ? this.trG : 1);   // (R66 fast engine: scaled trace)
    let V = 0; for (let q = 0; q < S.length; q++) V += u[q] * tr[S[q]] * k;
    if (p.rpeMode === 1) {                     // outcome-only (Rescorla-Wagner) critic: dopamine = r - V at outcome events (a reward, or a trial end the task marks with ev.outcome, so an omitted reward counts), 0 otherwise
      let delta = 0;
      if (r !== 0 || outcome) { delta = r - V; this.lastDelta = delta; if (params.plasticity && p.rpeLr > 0) { let xx = 0; for (let q = 0; q < S.length; q++) { const x = tr[S[q]] * k; xx += x * x; }
        const a = p.rpeLr * delta / (p.rpeEps + xx); for (let q = 0; q < S.length; q++) u[q] += a * tr[S[q]] * k; } }
      this.value = V; this.delta = delta; this.reward = r; return delta;
    }
    const delta = r + p.rpeGamma * V - c.Vprev, gl = p.rpeGamma * p.rpeLambda;
    let zz = 0; for (let q = 0; q < S.length; q++) { z[q] = gl * z[q] + xp[q]; zz += z[q] * z[q]; }
    if (params.plasticity && p.rpeLr > 0) { const a = p.rpeLr * delta / (p.rpeEps + zz); for (let q = 0; q < S.length; q++) u[q] += a * z[q]; }
    for (let q = 0; q < S.length; q++) xp[q] = tr[S[q]] * k;
    let V2 = 0; for (let q = 0; q < S.length; q++) V2 += u[q] * xp[q];   // value of the current state after learning
    c.Vprev = V2; this.value = V2; this.delta = delta; this.lastDelta = delta; this.reward = r;
    return delta;
  }
  // v15 learned mixing: incoming excitatory hidden synapses of each mixing cell (competitive rule), adaptive thresholds
  initMixLearn() {
    const N = this.N, g = this.g, nIn = g.nIn, h1 = g.nIn + g.nHid, inL = Array.from({ length: N }, () => []);
    for (let k = 0; k < this.posts.length; k++) { const j = this.posts[k], i = this.pres[k]; if (g.mix[j] && i >= nIn && i < h1 && this.ws[k] > 0) inL[j].push(k); }
    const st = new Int32Array(N + 1), idx = []; for (let j = 0; j < N; j++) { st[j] = idx.length; for (const k of inL[j]) idx.push(k); } st[N] = idx.length;
    this.mxStart = st; this.mxIdx = Int32Array.from(idx); this.mxTot = new Float32Array(N); this.mxCnt = new Float32Array(N);
    for (let j = 0; j < N; j++) for (let q = st[j]; q < st[j + 1]; q++) this.mxTot[j] += this.ws[idx[q]];
    if (this.p.mixHomeo > 0) { if (!this.thr) this.thr = Float32Array.from(g.thresh); const ml = []; for (let i = 0; i < N; i++) if (g.mix[i]) ml.push(i); this.mxList = Int32Array.from(ml); }
  }
  mixLearn(i) {                               // mixing cell i spiked: instar step toward its input traces
    const p = this.p, st = this.mxStart, idx = this.mxIdx, ws = this.ws, pres = this.pres, x = this.xPre, a = st[i], e = st[i + 1]; if (e === a) return;
    let sx = 0, n = 0; for (let q = a; q < e; q++) { const k = idx[q]; if (ws[k] > 0) { sx += x[pres[k]]; n++; } }
    if (sx < 0.05) return;
    let eta = p.mixLr; if (p.mixN > 0) eta *= p.mixN / (p.mixN + this.mxCnt[i]); this.mxCnt[i]++;
    if (p.mixGate > 0) { if (!this.npStart) this.buildNp(); const s0 = this.npStart[i], s1 = this.npStart[i + 1]; let sw = 0, h = 0;
      let nT = 0; for (let q = s0; q < s1; q++) { const k = this.npIdx[q]; sw += ws[k]; if (this.plat && this.plat[this.posts[k]] > 0) { h += ws[k]; nT++; } }
      const r = sw > 0 && nT > 0 ? Math.min(2, h / sw * (s1 - s0) / nT) : 0;   // output weight on taught cells relative to their number
      eta *= 1 - p.mixGate + p.mixGate * r / 2; }
    if (eta <= 0) return;
    const W = this.mxTot[i]; let s = 0;
    for (let q = a; q < e; q++) { const k = idx[q]; if (ws[k] > 0) { ws[k] += eta * (W * x[pres[k]] / sx - ws[k]); s += ws[k]; } }
    if (p.mixPrune > 0) { const lim = p.mixPrune * s / n; let s2 = 0;
      for (let q = a; q < e; q++) { const k = idx[q]; if (ws[k] > 0 && ws[k] < lim && n > 1) { ws[k] = 0; n--; } else s2 += ws[k]; }
      if (s2 > 0) for (let q = a; q < e; q++) { const k = idx[q]; if (ws[k] > 0) ws[k] *= W / s2; } }
  }
  /* R82 DELTA RULE for the taught (prediction) cells, once per teaching event (pl.deltaLr > 0; off = bit-identical).
   * Receivers R = cells with plastic excitatory inputs that an (instructive) input neuron contacts. Each receiver counts its own
   * PREDICTIVE spikes: spikes while it is armed and outside a teacher plateau (teacher-driven spikes excluded). At a teaching
   * event (substep with >= 1 receiver onset, plat = plateau) every receiver i gets prediction y = min(1, count / deltaRef) and
   * target t = 1 (onset now) or 0, and each plastic excitatory input k (pre j) changes once:
   *   dw = deltaLr x lrScale_i x x_j x (t - y), x_j = the (lagged) pre-trace = eligibility of the recent input,
   * bounded to [0, wMax] (excitatory weights stay excitatory); inputs touched are re-normalised by preNorm (budget kept);
   * all counts reset. deltaKeep 1: the old per-spike plateau potentiation runs as well. */
  // R82 mixFreeze (pl.mixFreeze substeps, 0 = off, bit-identical off): the mixing cells' adaptive (homeostatic) thresholds stop
  // adapting after mixFreeze learning substeps (warm-up); every other rule, including the prediction synapses, keeps learning.
  mixFrozen() { const F = this.p.mixFreeze; if (!(F > 0)) return false; this.mfT = (this.mfT || 0) + 1; return this.mfT > F; }
  granInh(spk, nSpk, syn, mk) {              // R83: every granule spike inhibits every granule cell by granInh (shared Golgi-like pool)
    if (this.gFast0 != null) {
      if (params.granRate > 0 && params.plasticity) {
        const step = ++this.gThStep, gr = this.g.gran, h = params.granHomeo > 0 ? params.granHomeo : 0.5, r0 = params.granRate, T = this.thr || this.g.thresh, gThTs = this.gThTs;
        for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (gr[i]) { T[i] += h * (1 - r0); gThTs[i] = step; } }
      }
      return;
    }
    if (!this.granL) { const L = []; for (let i = 0; i < this.N; i++) if (this.g.gran[i]) L.push(i); this.granL = Int32Array.from(L); }
    const gr = this.g.gran; let n = 0; for (let s = 0; s < nSpk; s++) n += gr[spk[s]];
    const L = this.granL, nL = this.granLn != null ? this.granLn : L.length;   // R102: demand mode keeps granLn = assigned granules only (unset = every granule, bit-identical)
    if (params.granRate > 0 && params.plasticity) { const sp = this.spiked, h = params.granHomeo > 0 ? params.granHomeo : 0.5, r0 = params.granRate, T = this.thr || this.g.thresh;   // R83 granule homeostatic threshold
      for (let q = 0; q < nL; q++) { const i = L[q]; T[i] += h * (sp[i] - r0); if (mk) mk[i] = 1; }
      const gu = this.gu; if (gu && gu.rsv0 > 0) { const rR = params.granRecruitRate > 0 ? params.granRecruitRate : r0 / 10, kb = gu.keyBy, o = gu.gOff;   // R119 granReserve: recruited granules adapt to a sparser target rate (exact-tuple detectors); unclaimed ones stay silent (no drift)
        for (let j = gu.rsv0; j < gu.nG; j++) if (kb[j] != null) { const i = o + j; T[i] += h * (sp[i] - rR); if (mk) mk[i] = 1; } } }
    if (!(params.granInh > 0) || !n) return;
    const d = params.granInh * n; for (let q = 0; q < nL; q++) { syn[L[q]] -= d; if (mk) mk[L[q]] = 1; } }
  /* R83b CEREBELLAR READOUT (global granLr > 0; needs granN): only the granule -> prediction synapses, once per teaching event
   * (a substep with >= 1 prediction-cell onset): each prediction cell i has graded granule drive y_i = min(1, sum_k w_k x_j / granRef)
   * over its granule inputs (x_j = the granule's lagged trace); target t_i = 1 if i's teacher arrives now, else 0 (climbing fibre);
   * dw_k = granLr x x_j x (t_i - y_i), w bounded to [0, wMax]: LTP onto the correct cells until they predict, LTD onto the wrongly driven
   * ones. Granules with x < 0.01 (silent) are untouched, so on the sparse granule code each event changes only a few hundred synapses. */
  granStep(xT, xg, plat) {
    if (!this.dList) this.deltaInit();
    const oT = params.granTgt === 1, nO = this.g.nOut, o0 = this.g.nIn + this.g.nHid;
    if (oT) { const spk = this.spk; for (let s = 0; s < this.nSpk; s++) { const i = spk[s]; if (i < nO) this.gSym = i; else break; } }   // R83c: the symbol input that just arrived = the output that was right (seq tasks: output m <-> symbol m)
    const gw = oT && params.granWin > 0, gA = gw ? (this.gAcc || (this.gAcc = new Float32Array(this.N))) : null;   // R83c granWin: the presynaptic activity is each granule's spike count since the last teaching event (the window the outputs were read in), not its decayed trace at the event
    const gG = gw && params.granGain > 0, o1 = o0 + nO;   // R83d granGain: learned output gain psi of the granule pathway (ws = psi x learned weight u), see below
    const sp = gA && params.granSparse !== 0 && !(params.granAnneal > 0) && !this.gd;   // R107 granSparse (default on, bit-identical): only the granules that spiked in the read window are visited (see granSparseStep)
    if (gA) { const spk = this.spk, gr = this.g.gran; if (sp) { const aL = this.gActL || (this.gActL = new Int32Array(this.N)); let nA = this.gActN || 0; for (let s = 0; s < this.nSpk; s++) { const i = spk[s]; if (gr[i]) { if (gA[i]++ === 0) aL[nA++] = i; } else if (gG && i >= o0 && i < o1) gA[i]++; } this.gActN = nA; }
      else for (let s = 0; s < this.nSpk; s++) { const i = spk[s]; if (gr[i]) gA[i]++; else if (gG && i >= o0 && i < o1) gA[i]++; } }
    const L0 = this.dList, plN = this.p.plateau; let ev = false; for (let q = 0; q < L0.length; q++) if (plat[L0[q]] === plN) { ev = true; break; } if (!ev) return;
    const gS = this.g.granSch, lT = params.granLrT != null ? (params.granLrT > 0 ? params.granLrT : 0) : gS && gS.T > 0 ? gS.T : 0, nEv = lT ? (this.gEv = (this.gEv || 0) + 1) : 0;   // R100 granLrT (global, 0 = off, bit-identical off; v47 R114: P.granLrT unset -> the plan gene d.gran.lrT / lrLate via G.granSch, deepURSx3 = 100000 / 0.05; pin P.granLrT=0 for the fixed step): granule step schedule tied to the teaching events seen (~ symbols): granLr until granLrT events, then granLrLate (default granLr / 2); granLrShape 1 = smooth: late + (granLr - late) x T / (T + events)
    const L = oT ? (this.gOutL || (this.gOutL = Int32Array.from({ length: nO }, (_, m) => o0 + m))) : L0;
    if (!this.gIn) { const S = [0], K = []; for (let q = 0; q < L.length; q++) { const i = L[q]; for (let r = this.inStart[i], e = this.inStart[i + 1]; r < e; r++) { const k = this.inEdges[r]; if (this.g.gran[this.pres[k]] && this.isPlastic[k]) K.push(k); } S.push(K.length); } this.gIn = { S: Int32Array.from(S), K: Int32Array.from(K) }; }
    const S = this.gIn.S, K = this.gIn.K, ws = this.ws, pr = this.pres, wMax = this.gu && this.gu.xm ? params.wMax * (params.granExactW > 0 ? params.granExactW : 50) : params.wMax, lr = lT ? (() => { const a = params.granLr, b = params.granLrLate > 0 ? params.granLrLate : params.granLrT == null && gS && gS.late > 0 ? gS.late : a / 2; return params.granLrShape === 1 ? b + (a - b) * lT / (lT + nEv) : nEv > lT ? b : a; })() : params.granLr, ref = params.granRef > 0 ? params.granRef : 10, D = globalThis.__granDbg;
    let U = null; if (gG) { if (!this.gU) { this.gU = new Float32Array(K.length); for (let r = 0; r < K.length; r++) this.gU[r] = ws[K[r]]; this.gPsi = params.granGain0 > 0 ? params.granGain0 : 0; } U = this.gU; }
    const aT = params.granAnneal > 0 ? params.granAnneal : 0, aMn = params.granAnnealMin > 0 ? params.granAnnealMin : 0, gC = aT ? (this.gCnt || (this.gCnt = new Float32Array(this.N))) : null;   // R91 granAnneal: per-granule step decays with the granule's use count (a count-based / consolidating estimate: rare combinations learn fast, common ones average finely); floor granAnnealMin x granLr
    let oS = 0, dPs = 0, yTgt = 0; if (gG) for (let q = 0; q < nO; q++) oS += gA[o0 + q];
    if (sp && oT) { this.granSparseStep(L, S, K, ws, pr, wMax, lr, ref, D, U, gA, gG, oS, o0, nO); return; }
    for (let q = 0; q < L.length; q++) { const i = L[q], t = oT ? (q === this.gSym ? 1 : 0) : plat[i] === plN ? 1 : 0; let d = 0;
      let xx = 0; for (let r = S[q]; r < S[q + 1]; r++) { const k = K[r], x = gA ? gA[pr[k]] / params.granWin : xT[pr[k]] * xg; if (x >= 0.01) { d += (U ? U[r] : ws[k]) * x; xx += x * x; } }
      const y = Math.min(1, d / ref), er = t - y, g = oT ? (xx > 0 ? lr * ref / xx : 0) : lr;   // R83c output mode: normalised LMS (step / input power: stable for granLr < 1 at any granule count)
      if (t) yTgt = y;
      if (gG) { const n = oS > 0 ? gA[i] / oS : 1 / nO, c = n + this.gPsi * (y - n); dPs += (t - c) * (y - n); }   // mixture gain: d/dpsi of the squared error of (1-psi) x the outputs' own prediction (window spike share) + psi x the granule prediction
      if (D) { if (t) { D.n++; D.y += y; } else D.fa += y; } if (er === 0) continue;
      for (let r = S[q]; r < S[q + 1]; r++) { const k = K[r], x = gA ? gA[pr[k]] / params.granWin : xT[pr[k]] * xg; if (x < 0.01) continue; const ga = gC ? g * Math.max(aMn, aT / (aT + gC[pr[k]])) : g; if (U) { const u = U[r] + ga * x * er; U[r] = u < 0 ? 0 : u > wMax ? wMax : u; continue; } const w = ws[k] + ga * x * er; ws[k] = w < 0 ? 0 : w > wMax ? wMax : w; } }
    if (gG) { const ps = this.gPsi = Math.min(1, Math.max(0, this.gPsi + params.granGain * dPs)); for (let r = 0; r < K.length; r++) ws[K[r]] = ps * U[r]; if (D) { D.psi = ps; D.pn = (D.pn || 0) + 1; D.ps = (D.ps || 0) + ps; } }
    // (granGain: psi rises while the granule prediction points where the outputs under-predict the arriving symbol and falls where it adds
    //  false alarms, so the pathway self-silences when it does not reduce the outputs' error; local: one gain per granule->output projection)
    if (gC) { if (!this.granL) { const L = []; for (let i = 0; i < this.N; i++) if (this.g.gran[i]) L.push(i); this.granL = Int32Array.from(L); } const Lg = this.granL, nLg = this.granLn != null ? this.granLn : Lg.length; for (let q = 0; q < nLg; q++) { const j = Lg[q], x = gA ? gA[j] / params.granWin : xT[j] * xg; if (x >= 0.01) gC[j]++; } }   // R91: count this teaching event for every granule active in the read window
    if (gA) { gA.fill(0); this.gActN = 0; }
    this.lastSurprise = 1 - yTgt;
    if (this.gd) this.granDemandEvent();   // R102: once per teaching event, after this window's spikes have been counted
    if (this.gu) this.granUtilityEvent(yTgt);
  }
  /* R107 granSparse: the same NLMS event as granStep (output mode, read window), visiting only the granules that spiked since the last
   * teaching event instead of every granule -> output synapse. The active synapse indices are sorted, so every sum runs in the original
   * order (bit-identical). The granGain rescale (ws = psi x u) stays dense. */
  granSparseStep(L, S, K, ws, pr, wMax, lr, ref, D, U, gA, gG, oS, o0, nO) {
    if (!this.gRS) { const N = this.N, nL = L.length, c = new Int32Array(N + 1); for (let r = 0; r < K.length; r++) c[pr[K[r]] + 1]++; for (let i = 0; i < N; i++) c[i + 1] += c[i];
      const R = new Int32Array(K.length), f = c.slice(0, N); for (let r = 0; r < K.length; r++) R[f[pr[K[r]]]++] = r;
      const Q = new Int32Array(K.length); let mono = true; for (let q = 0; q < nL; q++) for (let r = S[q]; r < S[q + 1]; r++) { Q[r] = q; if (r > S[q] && pr[K[r]] < pr[K[r - 1]]) mono = false; }
      const P = Array.from({ length: K.length }, (_, r) => r).sort((x, y) => K[x] - K[y]), KS = new Int32Array(K.length), pos = new Int32Array(K.length); for (let p = 0; p < P.length; p++) { KS[p] = K[P[p]]; pos[P[p]] = p; }
      this.gRS = c; this.gRR = R; this.gRQ = Q; this.gRmono = mono; this.gRB = new Int32Array(K.length); this.gRo = new Int32Array(nL + 1); this.gRf = new Int32Array(nL);
      this.gRKS = KS; this.gRpos = pos; if (U) { const Uw = this.gRUw = new Float32Array(K.length); for (let r = 0; r < K.length; r++) Uw[pos[r]] = U[r]; } }
    const c = this.gRS, RR = this.gRR, Q = this.gRQ, aL = this.gActL, nA = this.gActN || 0, W = params.granWin, nL = L.length, B = this.gRB, off = this.gRo, pos = this.gRpos, Uw = this.gRUw;
    let Bs;
    if (this.gRmono) {   // granules ascending -> within each output the synapse indices come out ascending (= the dense loop order); counting sort by output
      const A = aL.subarray(0, nA); A.sort(); off.fill(0);
      for (let a = 0; a < nA; a++) { const j = A[a]; if (gA[j] / W < 0.01) continue; for (let p = c[j], e = c[j + 1]; p < e; p++) off[Q[RR[p]] + 1]++; }
      for (let q = 0; q < nL; q++) off[q + 1] += off[q]; const fp = this.gRf; for (let q = 0; q < nL; q++) fp[q] = off[q];
      for (let a = 0; a < nA; a++) { const j = A[a]; if (gA[j] / W < 0.01) continue; for (let p = c[j], e = c[j + 1]; p < e; p++) { const r = RR[p]; B[fp[Q[r]]++] = r; } }
      Bs = B;
    } else {             // fallback: sort the active synapse indices
      let nB = 0; for (let a = 0; a < nA; a++) { const j = aL[a]; if (gA[j] / W < 0.01) continue; for (let p = c[j], e = c[j + 1]; p < e; p++) B[nB++] = RR[p]; }
      Bs = B.subarray(0, nB); Bs.sort(); off.fill(0); for (let b = 0; b < nB; b++) off[Q[Bs[b]] + 1]++; for (let q = 0; q < nL; q++) off[q + 1] += off[q];
    }
    let dPs = 0, yTgt = 0;
    if (params.readoutRule === 1 || params.readoutRule === 'threeFactor') { yTgt = this.gran3F(L, K, ws, pr, wMax, lr, ref, D, U, gA, gG, oS, nO, Bs, off, W, pos, Uw); dPs = this.g3dPs; }
    else if (params.granKal > 0) { yTgt = this.granKalStep(L, K, ws, pr, wMax, lr, ref, D, U, gA, Bs, off, W, pos, Uw, nA, aL, gG, oS, nO); dPs = this.gKdPs; }
    else for (let q = 0; q < nL; q++) { const t = q === this.gSym ? 1 : 0; let d = 0, xx = 0;
      for (let b = off[q], e = off[q + 1]; b < e; b++) { const r = Bs[b], x = gA[pr[K[r]]] / W; d += (U ? U[r] : ws[K[r]]) * x; xx += x * x; }
      const i = L[q], y = Math.min(1, d / ref), er = t - y, g = xx > 0 ? lr * ref / xx : 0;
      if (t) yTgt = y;
      if (gG) { const n = oS > 0 ? gA[i] / oS : 1 / nO, cc = n + this.gPsi * (y - n); dPs += (t - cc) * (y - n); }
      if (D) { if (t) { D.n++; D.y += y; } else D.fa += y; } if (er === 0) continue;
      for (let b = off[q], e = off[q + 1]; b < e; b++) { const r = Bs[b], k = K[r], x = gA[pr[k]] / W; if (U) { const u = U[r] + g * x * er; U[r] = u < 0 ? 0 : u > wMax ? wMax : u; Uw[pos[r]] = U[r]; continue; } const w = ws[k] + g * x * er; ws[k] = w < 0 ? 0 : w > wMax ? wMax : w; } }
    if (gG) { const ps = this.gPsi = Math.min(1, Math.max(0, this.gPsi + params.granGain * dPs)), KS = this.gRKS; for (let p = 0; p < KS.length; p++) ws[KS[p]] = ps * Uw[p]; if (this.gFA && params.granTrace > 0) { const FA = this.gFA; for (let p = 0; p < KS.length; p++) { const k = KS[p]; if (FA[k] !== 0) ws[k] += ps * FA[k]; } } if (D) { D.psi = ps; D.pn = (D.pn || 0) + 1; D.ps = (D.ps || 0) + ps; } }   // (rescale in synapse order: same values, sequential writes)
    if (params.granOneShot === 2) { let c = 0; for (let a = 0; a < nA; a++) if (gA[aL[a]] / W >= 0.01) c++; this.gLastNA = c; }
    for (let a = 0; a < nA; a++) gA[aL[a]] = 0; this.gActN = 0; if (gG) for (let q = 0; q < nO; q++) gA[o0 + q] = 0;
    this.lastSurprise = 1 - yTgt;
    if (this.gu) this.granUtilityEvent(yTgt);
  }
  /* R121 granKal (global P.granKal = A > 0; 0 / unset = off, bit-identical, no RNG; sparse output path): EXPERIENCE-WEIGHTED NLMS. Each granule j
   * carries n_j = the teaching events it was active in since it got its current claw tuple (reset when granUtility re-assigns it) and a gain
   * a_j = max(granKalMin (default 0.02), A / (A + n_j)) (a per-feature uncertainty, as a diagonal Kalman / count estimate). The error of an
   * output is split in proportion to a_j x_j^2 instead of x_j^2: dw_j = granLr x granRef x a_j x_j x err / sum_i a_i x_i^2. A brand-new specific
   * detector active together with experienced ones takes most of the correction (one-shot, like a count model's first sighting), and the
   * experienced ones are left alone (backoff-like credit). Only for LTP (err > 0, the arriving symbol): false alarms (err < 0) keep the plain NLMS
   * split, since weights are bounded at 0 and a fresh detector has nothing to depress. With all a_j equal this is exactly the NLMS step. Local: each synapse needs only its
   * presynaptic granule's own count. */
  granKalStep(L, K, ws, pr, wMax, lr, ref, D, U, gA, Bs, off, W, pos, Uw, nA, aL, gG, oS, nO) {
    const A = params.granKal, mn = params.granKalMin > 0 ? params.granKalMin : 0.02, n = this.gKn || (this.gKn = new Float32Array(this.N)), nL = L.length; let yTgt = 0, dPs = 0;
    const av = j => { const v = A / (A + n[j]); return v < mn ? mn : v; };
    // R132 granKalLTD (global, 0 / unset = off, bit-identical): the experience-weighted split for false alarms (err < 0) too, so a recruit given a
    // one-shot weight (granOneShot) is averaged down like a count estimate instead of keeping its first-sighting weight under the plain NLMS split
    const wLo = params.granNeg > 0 ? -params.granNeg * wMax : 0;   // R132 granNeg (global, 0 / unset = off: lower bound 0, bit-identical): signed readout, weights in [-granNeg x wMax, wMax] (a specific context can veto a generic prediction, as count backoff does; biologically the granule -> basket/stellate -> Purkinje inhibitory path)
    const F = params.granTrace > 0, FA = F ? (this.gFA || (this.gFA = new Float32Array(ws.length))) : null;   // R133 granTrace: the slow (granKal) update below sees only the slow weight (U = slow when granGain is on; else take the fast part out of ws)
    if (F && !U) for (let b = 0, e = off[nL]; b < e; b++) { const k = K[Bs[b]]; if (FA[k] !== 0) { ws[k] -= FA[k]; FA[k] = 0; } }
    for (let q = 0; q < nL; q++) { const t = q === this.gSym ? 1 : 0; let d = 0, xx = 0;
      let x2 = 0; for (let b = off[q], e = off[q + 1]; b < e; b++) { const r = Bs[b], j = pr[K[r]], x = gA[j] / W; d += (U ? U[r] : ws[K[r]]) * x; xx += av(j) * x * x; x2 += x * x; }
      const y = Math.min(1, d / ref), er = t - y, kal = er > 0 || params.granKalLTD > 0, g = kal ? (xx > 0 ? lr * ref / xx : 0) : (x2 > 0 ? lr * ref / x2 : 0); if (t) yTgt = y;
      if (gG) { const i = L[q], m = oS > 0 ? gA[i] / oS : 1 / nO, cc = m + this.gPsi * (y - m); dPs += (t - cc) * (y - m); }   // (the granGain psi update, as the NLMS loop)
      if (D) { if (t) { D.n++; D.y += y; } else D.fa += y; } if (er === 0) continue;
      for (let b = off[q], e = off[q + 1]; b < e; b++) { const r = Bs[b], k = K[r], j = pr[k], x = gA[j] / W, gj = kal ? g * av(j) : g;
        if (U) { const u = U[r] + gj * x * er; U[r] = u < wLo ? wLo : u > wMax ? wMax : u; Uw[pos[r]] = U[r]; continue; } const w = ws[k] + gj * x * er; ws[k] = w < wLo ? wLo : w > wMax ? wMax : w; } }
    for (let a = 0; a < nA; a++) { const j = aL[a]; if (gA[j] / W >= 0.01) n[j]++; }
    if (F) this.granTraceStep(L, K, ws, pr, wMax, ref, gA, Bs, off, W, nA, aL, n, A, U);
    this.gKdPs = dPs; return yTgt; }
  /* R133 granTrace (global P.granTrace = 1; 0 / unset = off, bit-identical, no RNG; needs granKal, sparse path without granGain): a FAST ONE-SHOT TRACE on
   * each granule -> output synapse, separate from the slow granKal weight (a short-term / eligibility-like component that the slow weight consolidates).
   * Trace E_jq = the granule's own running frequency of each next symbol over its observations (step 1 / observations; a recruit starts with one
   * observation = the symbol it was recruited on). Effective weight = slow + g_j x E_jq x granRef / xbar, gate g_j = A / (A + n_j) (granKal's own
   * experience count n_j), xbar = the running mean granule activity per window (so the trace alone gives a full-strength vote on a context seen once).
   * With granGain on (default), ws = psi x (U + FA) at the dense rescale. Self-calibrating: the fast/slow mix is set by each granule's measured experience; no new constant. The slow update never sees the fast part. */
  granTraceStep(L, K, ws, pr, wMax, ref, gA, Bs, off, W, nA, aL, n, A, U) {
    const FA = this.gFA, FE = this.gFE || (this.gFE = new Float32Array(ws.length)), FO = this.gFo || (this.gFo = new Float32Array(this.N)), nL = L.length;
    let sx = 0, cx = 0; for (let a = 0; a < nA; a++) { const x = gA[aL[a]] / W; if (x >= 0.01) { sx += x; cx++; } }
    if (cx) { this.gFxN = (this.gFxN || 0) + 1; this.gFx = (this.gFx || 0) + (sx / cx - (this.gFx || 0)) / this.gFxN; }
    const xb = this.gFx > 0 ? this.gFx : 1;
    for (let q = 0; q < nL; q++) { const t = q === this.gSym ? 1 : 0;
      for (let b = off[q], e = off[q + 1]; b < e; b++) { const k = K[Bs[b]], j = pr[k]; FE[k] += (t - FE[k]) / (FO[j] + 1);
        const f = A / (A + n[j]) * FE[k] * ref / xb; if (U) { FA[k] = f; continue; } if (f > 0) { const w0 = ws[k], w1 = w0 + f > wMax ? wMax : w0 + f; ws[k] = w1; FA[k] = w1 - w0; } } }   // with granGain (U): FA = the fast part in u units, added as psi x FA at the dense rescale
    for (let a = 0; a < nA; a++) { const j = aL[a]; if (gA[j] / W >= 0.01) FO[j]++; } }
  /* R118 readoutRule 'threeFactor' (global params.readoutRule = 'threeFactor' or 1; unset / 0 = the R83b NLMS above, bit-identical, no RNG):
   * a three-factor local rule on the same granule -> output synapses, same teaching events and read window (sparse path only).
   *   eligibility  e_jq = x_j (presynaptic read-window activity) for the LTP term, x_j x p_q (pre x post) for the LTD term
   *   third factor M_q  = t_q - p_q: teacher-forced per-output error, p_q = softmax_q(rf3Beta x d_q / granRef) over the outputs' granule drive
   *                       (the shared normalisation = one global inhibitory-pool signal; t_q = climbing fibre of the arriving symbol)
   *   dw = g_q x x_j x M_q - lr x rf3Decay x w,  g_q = lr x granRef / sum_j x_j^2 (bounded NLMS step), w in [0, wMax]; decay on visited synapses only
   * i.e. the local form of the cross-entropy gradient (competitive across outputs) instead of independent clipped LMS targets.
   * Params: rf3Beta (default 8; tuned at book10k on held-out growth k=2950: beta 4 0.371, 8 0.392, off 0.386), rf3Decay (default 0.001), rf3Lr (step multiplier, default 1). */
  gran3F(L, K, ws, pr, wMax, lr, ref, D, U, gA, gG, oS, nO, Bs, off, W, pos, Uw) {
    const nL = L.length, dq = this.g3d || (this.g3d = new Float64Array(nL)), xq = this.g3x || (this.g3x = new Float64Array(nL)), pq = this.g3p || (this.g3p = new Float64Array(nL));
    const beta = params.rf3Beta > 0 ? params.rf3Beta : 8, lam = params.rf3Decay != null ? +params.rf3Decay : 0.001, lm = params.rf3Lr > 0 ? params.rf3Lr : 1, l = lr * lm;
    let mx = -Infinity, yTgt = 0, dPs = 0;
    for (let q = 0; q < nL; q++) { let d = 0, xx = 0; for (let b = off[q], e = off[q + 1]; b < e; b++) { const r = Bs[b], x = gA[pr[K[r]]] / W; d += (U ? U[r] : ws[K[r]]) * x; xx += x * x; }
      dq[q] = d; xq[q] = xx; const z = beta * d / ref; if (z > mx) mx = z; }
    let sm = 0; for (let q = 0; q < nL; q++) { pq[q] = Math.exp(beta * dq[q] / ref - mx); sm += pq[q]; } for (let q = 0; q < nL; q++) pq[q] /= sm;
    for (let q = 0; q < nL; q++) { const t = q === this.gSym ? 1 : 0, i = L[q], y = Math.min(1, dq[q] / ref), M = t - pq[q], xx = xq[q], g = xx > 0 ? l * ref / xx : 0, dec = l * lam;
      if (t) yTgt = y;
      if (gG) { const n = oS > 0 ? gA[i] / oS : 1 / nO, cc = n + this.gPsi * (y - n); dPs += (t - cc) * (y - n); }
      if (D) { if (t) { D.n++; D.y += y; } else D.fa += y; }
      for (let b = off[q], e = off[q + 1]; b < e; b++) { const r = Bs[b], k = K[r], x = gA[pr[k]] / W;
        if (U) { const u = U[r] + g * x * M - dec * U[r]; U[r] = u < 0 ? 0 : u > wMax ? wMax : u; Uw[pos[r]] = U[r]; continue; }
        const w = ws[k] + g * x * M - dec * ws[k]; ws[k] = w < 0 ? 0 : w > wMax ? wMax : w; } }
    this.g3dPs = dPs; return yTgt;
  }
  // R85 granIso (global param, 0/undefined = off): with granTgt 1, the granule -> output synapses do not make the output cells
  // 'receivers' of the prediction-cell machinery (teacher AHP, trust, receiver pool): the output cells keep their v40 dynamics
  granIsoK(k) { return params.granIso > 0 && params.granTgt === 1 && this.g.gran ? this.g.gran[this.pres[k]] === 1 : false; }
  /* R102 DEMAND-GROWN CLAWS (P.granDemand > 0, brain grown with it; otherwise this.gd is unset and nothing here runs).
   * Hypothesis: claws chosen from letter windows that have co-occurred at least granCo times (default 2), versus v44's random
   * sparse claws, at the same pool size granN. Play Code births a motif cell the second time a pair appears; here the motif
   * is the current lag window (t .. t-k+1, k from granKmin to granK) and the cell is one reserved granule.
   * Counts live in a capped LRU map (granMap), not a dense n-gram tensor. The granule count cannot exceed granN; when the
   * pool is full and granRecycle > 0, the least-used granule older than granHold teaching events is rewritten (weights reset).
   * Claw current is added beside the CSR (same weight split as a grown claw, W/k per column) so the synapse list never grows
   * and no N x N matrix is built. */
  initGranDemand() {
    const d = this.g.granDemand, N = this.N, nG = d.nG, src = d.src, nS = src.length;
    const colOf = new Int32Array(N).fill(-1), loc = new Int32Array(N).fill(-1), hOff = new Int32Array(nS + 1);
    let h = 0, maxC = 1;
    for (let s = 0; s < nS; s++) { hOff[s] = h; const nC = src[s].keys.length; if (nC > maxC) maxC = nC; h += nC; }
    let bits = 1; while ((1 << bits) <= maxC && bits < 20) bits++;
    const wide = bits * Math.max(1, d.K) > 50 || maxC > 65535, base = wide ? 0 : (1 << bits);
    hOff[nS] = h;
    for (let s = 0; s < nS; s++) { const off = src[s].off, cells = src[s].cells, nC = src[s].keys.length;
      for (let c = 0; c < nC; c++) for (let p = off[c]; p < off[c + 1]; p++) { const id = cells[p]; if (id >= 0 && id < N) colOf[id] = (s << 16) | c; } }
    for (let j = 0; j < nG; j++) loc[d.gOff + j] = j;
    const outS = new Int32Array(nG + 1), tmp = [], stt = this.start, isP = this.isPlastic;
    for (let j = 0; j < nG; j++) { outS[j] = tmp.length; const b = d.gOff + j; for (let k = stt[b], e = stt[b + 1]; k < e; k++) if (isP[k]) tmp.push(k); }
    outS[nG] = tmp.length;
    const free = []; for (let j = nG - 1; j >= 0; j--) free.push(j);
    if (!this.thr) this.thr = Float32Array.from(this.g.thresh);
    this.granL = new Int32Array(nG); this.granLn = 0;
    this.gd = { K: d.K, Km: d.Km, W: d.W, wo: d.wo, nG, gOff: d.gOff, src, colOf, loc, hOff, hits: new Int32Array(h), wide,
      lists: src.map(s => Array.from({ length: s.keys.length }, () => [])), gen: new Int32Array(nG), alive: new Uint8Array(nG),
      use: new Float32Array(nG), born: new Int32Array(nG), clawK: new Int32Array(nG), keyBy: new Array(nG).fill(null), inL: new Uint8Array(nG),
      owned: new Map(), pending: new Map(), free, outS, outK: Int32Array.from(tmp), win: new Int32Array(Math.max(1, d.K)), waste: 0, uAt: null,
      base, co: params.granCo > 0 ? Math.round(params.granCo) : 2, hold: params.granHold > 0 ? Math.round(params.granHold) : 32,
      cap: params.granMap > 0 ? Math.round(params.granMap) : Math.max(4096, nG * 4), thr0: this.g.thresh[d.gOff],
      st: { assigned: 0, recycled: 0, cap: nG, events: 0 } };
  }
  granDemandStats() { const gd = this.gd; if (!gd) return null; const s = gd.st; return { assigned: s.assigned, recycled: s.recycled, cap: s.cap, pending: gd.pending.size, events: s.events }; }
  granDemandDrive(spk, nSpk, syn, mk) {
    const gd = this.gd, colOf = gd.colOf, hits = gd.hits, hOff = gd.hOff, lists = gd.lists, gen = gd.gen, loc = gd.loc, alive = gd.alive, use = gd.use, gOff = gd.gOff, gB = this.gBits;
    for (let s = 0; s < nSpk; s++) { const i = spk[s], p = colOf[i];
      if (p >= 0) { const src = p >>> 16, col = p & 65535, Ls = lists[src][col]; hits[hOff[src] + col]++;
        for (let q = 0; q < Ls.length; q++) { const e = Ls[q]; if (e.gen !== gen[e.j]) continue; const b = gOff + e.j; syn[b] += e.w; if (mk) mk[b] = 1; if (gB) gB[e.j >>> 5] |= 1 << (e.j & 31); } }
      const j = loc[i]; if (j >= 0 && alive[j]) use[j]++; }
  }
  granDemandEvent() {
    const gd = this.gd, hits = gd.hits, hOff = gd.hOff, win = gd.win, K = gd.K; gd.st.events++;
    let n = 0;
    for (let s = 0; s < K; s++) { const a = hOff[s], b = hOff[s + 1]; let best = -1, bv = 0;
      for (let c = a; c < b; c++) if (hits[c] > bv) { bv = hits[c]; best = c - a; }
      if (best < 0) break; win[n++] = best; }
    hits.fill(0);
    for (let k = gd.Km; k <= n; k++) this.gdObserve(k);
  }
  gdKey(k) { const gd = this.gd, win = gd.win; if (gd.wide) { let s = String(k); for (let i = 0; i < k; i++) s += ',' + win[i]; return s; }
    let x = k; for (let i = 0; i < k; i++) x = x * gd.base + win[i]; return x; }
  gdObserve(k) {
    const gd = this.gd, key = this.gdKey(k), pend = gd.pending;
    if (gd.owned.has(key)) return;
    let n = pend.get(key) || 0; if (n) pend.delete(key); n++;
    if (n >= gd.co) { if (!this.gdAssign(key, k)) pend.set(key, n - 1); }
    else { pend.set(key, n); while (pend.size > gd.cap) pend.delete(pend.keys().next().value); }
  }
  gdClear(j) {
    const gd = this.gd, b = gd.gOff + j;
    if (gd.keyBy[j] != null) gd.owned.delete(gd.keyBy[j]);
    gd.keyBy[j] = null; gd.alive[j] = 0; gd.gen[j]++; gd.st.assigned--; gd.waste += gd.clawK[j] || 0;
    const ws = this.ws, U = this.gU, wo = gd.wo, psi = this.gPsi || 0;
    if (U && !gd.uAt && this.gIn) { const K = this.gIn.K, m = new Int32Array(ws.length).fill(-1); for (let r = 0; r < K.length; r++) m[K[r]] = r; gd.uAt = m; }
    const map = gd.uAt, Uw = this.gRUw, pos = this.gRpos;
    for (let q = gd.outS[j]; q < gd.outS[j + 1]; q++) { const e = gd.outK[q]; if (U && map && map[e] >= 0) { const r = map[e]; U[r] = wo; if (Uw && pos) Uw[pos[r]] = wo; } ws[e] = U ? psi * wo : wo; }
    if (this.thr) { this.thr[b] = gd.thr0; if (this.gLastT) this.gLastT[j] = this.gThStep; }
    this.v[b] = V_REST; if (this.gCnt) this.gCnt[b] = 0; if (this.gAcc) this.gAcc[b] = 0;
  }
  gdAssign(key, k) {
    const gd = this.gd, st = gd.st; let j;
    if (gd.free.length) j = gd.free.pop();
    else if (!(params.granRecycle > 0)) return false;
    else { const ev = st.events, hold = gd.hold; let best = -1, br = Infinity, bb = Infinity;
      for (let i = 0; i < gd.nG; i++) if (gd.alive[i] && ev - gd.born[i] >= hold) { const rate = gd.use[i] / (ev - gd.born[i]); if (rate < br || (rate === br && gd.born[i] < bb)) { best = i; br = rate; bb = gd.born[i]; } }
      if (best < 0) return false; this.gdClear(best); st.recycled++; j = best; }
    const gv = gd.gen[j], win = gd.win, W = gd.W, src = gd.src, lists = gd.lists;
    gd.alive[j] = 1; gd.use[j] = 0; gd.born[j] = st.events; gd.clawK[j] = k; gd.keyBy[j] = key; gd.owned.set(key, j); st.assigned++;
    for (let c = 0; c < k; c++) { const col = win[c], sl = src[c].off[col + 1] - src[c].off[col]; if (sl > 0) lists[c][col].push({ j, w: W / k / sl, gen: gv }); }
    if (!gd.inL[j]) { this.granL[this.granLn++] = gd.gOff + j; gd.inL[j] = 1; }
    if (gd.waste > 2048 && gd.waste > st.assigned * 4) this.gdCompact();
    return true;
  }
  gdCompact() {
    const gd = this.gd, gen = gd.gen, lists = gd.lists;
    for (let s = 0; s < lists.length; s++) for (let c = 0; c < lists[s].length; c++) { const L = lists[s][c]; let w = 0; for (let q = 0; q < L.length; q++) if (L[q].gen === gen[L[q].j]) L[w++] = L[q]; L.length = w; }
    gd.waste = 0;
  }
  // Utility-pruned structural plasticity for granule claws (params.granUtility > 0):
  // Granule cells begin with random grown claws (avoiding empty-pool starvation) and rewire low-utility
  // claws onto unowned active presynaptic lag tuples when prediction errors occur.
  initGranUtility() {
    const d = this.g && this.g.granSrc; if (!d || !(params.granUtility > 0) || this.gd) return;
    const { K, Km, W, nG, gOff, src } = d, N = this.N;
    const colOf = new Int32Array(N).fill(-1); let nCols = 0;
    const hOff = new Int32Array(K + 1);
    for (let s = 0; s < K; s++) { const { keys, off, cells } = src[s], m = keys.length; hOff[s] = nCols;
      for (let c = 0; c < m; c++) for (let q = off[c]; q < off[c + 1]; q++) colOf[cells[q]] = nCols + c;
      nCols += m; }
    hOff[K] = nCols;
    const inS = new Int32Array(nG + 1), inK = [], outS = new Int32Array(nG + 1), outK = [];
    const byGIn = Array.from({ length: nG }, () => []), byGOut = Array.from({ length: nG }, () => []);
    for (let k = 0; k < this.posts.length; k++) {
      const p = this.posts[k] - gOff; if (p >= 0 && p < nG && !this.isPlastic[k] && this.w0[k] > 0) byGIn[p].push(k);
      const j = this.pres[k] - gOff; if (j >= 0 && j < nG && this.isPlastic[k]) byGOut[j].push(k);
    }
    for (let j = 0; j < nG; j++) { inS[j] = inK.length; for (const k of byGIn[j]) inK.push(k); outS[j] = outK.length; for (const k of byGOut[j]) outK.push(k); }
    inS[nG] = inK.length; outS[nG] = outK.length;
    const wo = byGOut[0] && byGOut[0].length ? this.w0[byGOut[0][0]] : 0;
    const owned = new Map(), keyBy = new Array(nG).fill(null);
    if (d.initKeys) for (let j = 0; j < nG; j++) { const ik = d.initKeys[j]; if (ik) { keyBy[j] = ik; if (!owned.has(ik)) owned.set(ik, j); } }
    this.gu = { K, Km, W, nG, gOff, src, colOf, hOff, hits: new Int32Array(nCols), win: new Int32Array(K),
      lists: src.map(s => Array.from({ length: s.keys.length }, () => [])),
      inS, inK: Int32Array.from(inK), outS, outK: Int32Array.from(outK), wo, thr0: this.g.thresh[gOff],
      use: new Float32Array(nG), born: new Int32Array(nG), gen: new Int32Array(nG), keyBy,
      owned, pending: new Map(), rng: mulberry32((0x6775746c ^ N) >>> 0),
      co: params.granCo > 0 ? params.granCo | 0 : 2, hold: params.granHold > 0 ? params.granHold | 0 : 40,
      st: { rewired: 0, cap: nG, events: 0 } };
    if (d.nAct0 != null) { this.gu.nAct = d.nAct0; this.gu.st.nAct0 = d.nAct0; }
    if (d.l2 != null) { this.gu.l2 = d.l2; this.gu.st.l2 = nG - d.l2; }   // R138 granL2: granules [l2, nG) = the level-2 pool   // R136 granGrow: granules [nAct, nG) are unborn (no claws) until demand adds them
    if (params.granUtility === 2) { this.gu.match = new Float32Array(nG); this.gu.st.matched = 0; if (d.rsv0 >= 0 && d.rsv0 < nG) { this.gu.rsv0 = d.rsv0; this.gu.st.reserve = nG - d.rsv0; if (d.rsv0 > 0 && this.gFast0 == null) this.granLn = d.rsv0; }
      if (params.granExact > 0) this.initGranExact(); }   // granLn: the shared homeostasis loop covers the random granules only   // R119 granUtility 2: utility = exact claw-tuple matches (see granUtilityEvent)
  }
  granUtilityStats() { const gu = this.gu; if (!gu) return null; if (gu.cr && (params.granExactGuard & 2)) { const g = []; for (let s2 = 1; s2 < gu.cr.length; s2++) for (let c = 0; c < gu.cr[s2].length; c++) if (gu.cr[s2][c] > this.guColCap(s2)) g.push(s2 + ':' + c + ':' + gu.cr[s2][c].toFixed(2)); gu.st.guarded = g; gu.st.thr = +(this.guColCap(1)).toFixed(3); gu.st.crMax = gu.cr.map(a => +Math.max(...a).toFixed(3)); }
    return gu.st; }
  /* R119 granExact (needs granUtility 2): every granule becomes an EXACT coincidence detector of its claw tuple. The grown random claw
   * synapses are silenced and re-registered as claw lists; a granule fires (one injected suprathreshold input) only in a read window in
   * which every one of its claw columns has fired, and granule homeostasis is off (fixed thresholds), so the code is sparse: only the
   * granules whose letter tuple is actually present fire, instead of ~2.4% of all granules on partial matches. Granules whose tuple never
   * occurs (most random 4-claw tuples) earn no matches and are recycled by granUtility 2 onto missed 3- / 4-letter windows. */
  initGranExact() {
    const gu = this.gu, { nG, gOff, src, lists, inS, inK, keyBy } = gu, ws = this.ws;
    gu.xm = new Uint8Array(nG); gu.xn = new Uint8Array(nG); gu.xf = new Uint8Array(nG); gu.xT = new Int32Array(nG); gu.xTn = 0; gu.xF = new Int32Array(nG); gu.xFn = 0; gu.xc = new Uint32Array(nG); gu.xr = new Float32Array(nG); gu.st.capped = 0;
    if (params.granFatigue > 0) { gu.xL = new Float64Array(nG).fill(-1e12); gu.xE = new Uint32Array(nG); gu.tk = 0; gu.sps = 1e9; }   // R122 granFatigue: episode = the fires of one symbol (within sps = substeps per teaching event, measured in life, frozen in generation); xE = episodes, refractory is between episodes
    gu.cHit = src.map(S => new Uint8Array(S.keys.length)); gu.cT = []; gu.st.exact = 0; gu.cr = src.map(S => new Float32Array(S.keys.length)); gu.ban = new Set();
    for (let j = 0; j < nG; j++) { for (let q = inS[j]; q < inS[j + 1]; q++) ws[inK[q]] = 0;
      const key = keyBy[j]; if (key == null) continue; if ((params.granExactGuard & 1) && gu.owned.get(key) !== j) { keyBy[j] = null; gu.st.dedup = (gu.st.dedup || 0) + 1; continue; }   // R120 guard: one detector per tuple (grown duplicates start free)
      const a = key.split(','), n = +a[0]; if (!(n > 0) || a.length !== n + 1 || a.some((x, i) => i > 0 && !/^[0-9]+$/.test(x))) { keyBy[j] = null; continue; }
      gu.xn[j] = n; for (let c = 0; c < n; c++) lists[c][+a[c + 1]].push({ j, w: 0, gen: gu.gen[j], c }); }
    if (this.gFast0 == null) this.granLn = 0;   // fixed thresholds: no granule homeostasis
    if (params.lagHomeo > 0) this.initLagHomeo();
    // R125 lagWTA (global P.lagWTA = k > 0; 0 / unset = off, bit-identical, no RNG; needs granExact): COMPETITIVE SELECTION within each lag source
    // (s >= 1) as seen by the granules: in each read window only the first k letter columns of the source to fire count as claw hits (latency
    // k-WTA: in a leaky integrate-and-fire population the most strongly driven column reaches threshold first; equivalent to fast lateral
    // inhibition from the source's winner onto the other columns' granule synapses). The lag cells themselves keep firing for every other target.
    // Size-independent by construction (a lag source holds one letter per window; R123 bookdiag healthy brains 0.94-0.99 active columns per
    // window, hot 2x_si 2.9-6.4). Implemented on the lag-cell output to the granule claws, not as an inhibitory pool in the network dynamics.
    if (params.lagWTA > 0) { gu.wta = new Uint8Array(src.length); gu.wtaK = Math.max(1, Math.round(params.lagWTA)); }
  }
  /* R124 lagHomeo (global P.lagHomeo = eta > 0; 0 / unset = off, bit-identical, no RNG; needs granExact): SELF-CALIBRATED ACTIVITY HOMEOSTAT of the
   * lag (claw) sources. A lag source represents ONE letter per read window, so the number of its letter columns active in a window should be 1.
   * Each window, a source's summed column window rate R_s = sum_c r_sc (EMA, as the R120 guard) gives h_s += eta x (R_s - 1) (clamped +-lagHomeoMax,
   * default 1) and every cell of the source's columns gets thr = V_REST + (thr0 - V_REST) x exp(h_s): hot (letter-unspecific) sources are raised,
   * cold ones lowered. R123 bookdiag: healthy brains R_s 0.94-0.99, hot 2x_si 2.9-6.4, cold 4x_rg 0.62-0.70. No size-dependent constant.
   * P.lagHomeoCol = 1: the first (negative) variant, one offset per column with target r_sc = the same letter's source-0 rate. Starts after 500 windows. */
  initLagHomeo() {
    const gu = this.gu, src = gu.src, k0 = new Map(); for (let c = 0; c < src[0].keys.length; c++) k0.set(src[0].keys[c], c);
    if (!this.thr) this.thr = Float32Array.from(this.g.thresh);
    gu.lh = src.map((S, s) => s === 0 ? null : { c0: Int32Array.from(S.keys, k => k0.has(k) ? k0.get(k) : -1), h: new Float32Array(S.keys.length), hs: 0, t0: Float32Array.from(S.cells, b => this.thr[b]) });
    gu.lhN = 0; gu.st.lhMax = 0; }
  lagHomeoStep() {
    const gu = this.gu, cr = gu.cr, thr = this.thr, eta = params.lagHomeo, hM = params.lagHomeoMax > 0 ? params.lagHomeoMax : 1, col = params.lagHomeoCol === 1; if (++gu.lhN < 500) return;
    let mx = 0; for (let s = 1; s < cr.length; s++) { const L = gu.lh[s], S = gu.src[s], a = cr[s], a0 = cr[0];
      if (!col) { let R = 0; for (let c = 0; c < a.length; c++) R += a[c]; let h = L.hs + eta * (R - 1); h = h > hM ? hM : h < -hM ? -hM : h; L.hs = h; if (Math.abs(h) > mx) mx = Math.abs(h);
        const f = Math.exp(h), cl = S.cells, t0 = L.t0; for (let q = 0; q < cl.length; q++) thr[cl[q]] = V_REST + (t0[q] - V_REST) * f; continue; }
      for (let c = 0; c < a.length; c++) { if (L.c0[c] < 0) continue; let h = L.h[c] + eta * (a[c] - a0[L.c0[c]]); h = h > hM ? hM : h < -hM ? -hM : h; L.h[c] = h; if (Math.abs(h) > mx) mx = Math.abs(h);
        const f = Math.exp(h); for (let q = S.off[c]; q < S.off[c + 1]; q++) thr[S.cells[q]] = V_REST + (L.t0[q] - V_REST) * f; } }
    gu.st.lhMax = +mx.toFixed(3); gu.st.lhS = gu.lh.map(L => L ? +(col ? 0 : L.hs).toFixed(3) : 0); }
  guExact(i, gc, s, syn, mk, gB) {   // first hit of claw column gc (source s) in this read window: set the claw bit of every granule listening to it
    const gu = this.gu, ch = gu.cHit[s], c = gc - gu.hOff[s]; if (ch[c] >= 250) return;
    const hM = params.granExactHits > 1 ? params.granExactHits : 1; if (ch[c] === 0) gu.cT.push(s, c); ch[c]++; if (ch[c] < hM) return; ch[c] = 250; if (s === 0 && gu.ch && gu.ch.next != null) this.guChunkFire(c, syn, mk, gB); if (s === 0 && gu.lg && gu.lg.next) this.guLagFire(c, syn, mk, gB); if ((params.granExactColCap || (params.granExactGuard & 2)) && gu.cr[s][c] > this.guColCap(s)) return; if (gu.wta && s > 0) { if (gu.wta[s] >= gu.wtaK) return; gu.wta[s]++; }   // R125 lagWTA: only the first k columns of a lag source to fire in this window count (see initGranExact)   // R119 granExactColCap: a claw column active in > colCap of the windows (saturated lag cells) carries no context: it never completes a tuple   // R119 granExactHits: a claw column counts once it has fired hM spikes in this window (stale lag letters fire fewer)
    const L = gu.lists[s][c], gen = gu.gen, xm = gu.xm, xn = gu.xn, xf = gu.xf, gOff = gu.gOff, T = this.thr || this.g.thresh;
    const xL = gu.xL, fz = params.granFatigue;   // R122 granFatigue = c (off by default): a detector that fired less than c x its OWN mean inter-fire interval (symbols / its fire count) ago is refractory (self-suppression after completing its tuple; self-calibrated per detector)
    for (let r = 0, m = L.length; r < m; r++) { const e = L[r]; if (e.gen !== gen[e.j]) continue; const j = e.j, bit = 1 << e.c;
      if (!(xm[j] & bit)) { if (!xm[j]) gu.xT[gu.xTn++] = j; xm[j] |= bit; }
      if (!xf[j] && xm[j] === (1 << xn[j]) - 1) { if (xL) { const tk = gu.tk, dt = tk - xL[j]; if (dt > gu.sps) { if (gu.xE[j] > 2 && dt < fz * tk / gu.xE[j]) { gu.st.fatSkip = (gu.st.fatSkip || 0) + 1; continue; } xL[j] = tk; gu.xE[j]++; } } xf[j] = 1; gu.xF[gu.xFn++] = j; gu.xc[j]++; const b = gOff + j; syn[b] += 2 * (T[b] - V_REST) + 1; if (mk) mk[b] = 1; if (gB) gB[j >>> 5] |= 1 << (j & 31); gu.st.exact++; } }
  }
  /* R134 granChunk (global P.granChunk = 1; 0 / unset = off, bit-identical, no RNG; needs granExact): CHUNK (WORD-CONTEXT) DETECTORS in the granule pool.
   * A running chunk state: the current partial word p (letters since the last delimiter) and the previous completed word w; the delimiter is the
   * most frequent current letter seen so far (self-calibrated; the space in text). A chunk detector is a pool granule recruited (same recruit rule,
   * same pool, same one-shot / granKal / granTrace readout) on a surprising window for the key (w, p, current letter): it fires in a read window when
   * the current letter's column fires and the chunk state before it equals its key (one detector per key, like the exact tuples). The key made with
   * the delimiter as the current letter is the word-completion node; the previous word w is the slower second level held across the next word.
   * Count-model reference (R134 headroom): previous word + partial word beats every letter order 3-12 at 30k-1M letters. */
  guChunkEvent(yTgt, n) {
    const gu = this.gu; if (n < 1) return; const c0 = gu.win[0], mt = gu.match;
    const C = gu.ch || (gu.ch = { cnt: new Float64Array(gu.src[0].keys.length), delim: -1, w: '', p: '', next: null });
    C.cnt[c0]++; if (C.delim < 0 || C.cnt[c0] > C.cnt[C.delim]) C.delim = c0;
    const key = 'C' + C.w + '|' + C.p + '|' + c0, j0 = gu.owned.get(key);
    if (j0 != null && gu.keyBy[j0] === key) { if (mt) mt[j0] += 1; }
    else if (params.granChunkGate === 2) { if (C.w !== '') { const seen = this.guChunkSeen(key); if (params.plasticity && this.learning && yTgt < 0.85 && this.guRecruit(key, 0, yTgt, !seen)) gu.st.chunkRec = (gu.st.chunkRec || 0) + 1; } }   // R135 gate 2: first sighting recruits only into a free (never-matched) slot
    else if (C.w !== '' && (!(params.granChunkGate > 0) || this.guChunkSeen(key)) && params.plasticity && this.learning && yTgt < 0.85) { gu.st.chunkRec = (gu.st.chunkRec || 0) + 1; this.guRecruit(key, 0, yTgt); }
    const P = params.granPhrase > 0; if (P && C.w2 != null && C.w2 !== '') { const kP = 'P' + C.w2 + '|' + C.w + '|' + C.p + '|' + c0, jP = gu.owned.get(kP);   // R136 granPhrase: second level (see below)
      if (jP != null && gu.keyBy[jP] === kP) { if (mt) mt[jP] += 1; }
      else { const g2 = params.granPhrase === 2 ? 1 : params.granChunkGate, seen = g2 > 0 ? this.guChunkSeen(kP) : true; if ((g2 !== 1 || seen) && params.plasticity && this.learning && yTgt < 0.85 && this.guRecruit(kP, 0, yTgt, g2 === 2 && !seen, true)) gu.st.phraseRec = (gu.st.phraseRec || 0) + 1; } }
    const Q = params.granCat > 0; if (Q) { const K = C.K || this.guCatInit(C);   // R137 granCat: second level of learned word categories (see guCatInit)
      if (C.p === '' && c0 !== C.delim && C.pw) this.guCatObs(C, C.pw, c0);   // first letter of the next word = one continuation sample of the previous word
      if (C.q1 >= 0 && C.q2 >= 0) { const kQ = 'Q' + C.q2 + '|' + C.q1 + '|' + C.p + '|' + c0, jQ = gu.owned.get(kQ);
        if (jQ != null && gu.keyBy[jQ] === kQ) { if (mt) mt[jQ] += 1; }
        else { const g2 = params.granChunkGate, seen = g2 > 0 ? this.guChunkSeen(kQ) : true; if ((g2 !== 1 || seen) && params.plasticity && this.learning && yTgt < 0.85 && this.guRecruit(kQ, 0, yTgt, g2 === 2 && !seen, true)) gu.st.catRec = (gu.st.catRec || 0) + 1; } } }
    if (c0 === C.delim) { if (C.p !== '') { if (P) C.w2 = C.w; C.w = C.p; if (Q) { C.q2 = C.q1; const q = C.wc.get(C.p); C.q1 = q != null ? q : -1; C.pw = C.p; } } C.p = ''; } else C.p = C.p ? C.p + ',' + c0 : String(c0);
    C.next = 'C' + C.w + '|' + C.p + '|'; if (P) C.nextP = C.w2 ? 'P' + C.w2 + '|' + C.w + '|' + C.p + '|' : null; if (Q) C.nextQ = C.q1 >= 0 && C.q2 >= 0 ? 'Q' + C.q2 + '|' + C.q1 + '|' + C.p + '|' : null; }
  /* R140 lagDepth (P.lagDepth = D > 4; 0 / unset = off, bit-identical, no RNG; needs granExact): LONG LAGS t-4 .. t-(D-1). The grown delay line holds
   * t .. t-4 (R134 lag probes) and the claws read t .. t-3. The flag extends the delay line as a symbol-level register of the current-letter winner
   * (source 0's latency winner each window, like the granChunk state), and adds claw sources at lags 4 .. D-1 used by recruited COPY detectors:
   * key (current letter c, far lag l, letter x): fires in a read window when the current letter is c and the register holds x at lag l. Recruited by
   * the usual rule (surprising teaching event, same pool, gate and one-shot / Kalman / trace readout) for the most recent far lag l >= 4 at which
   * the arriving (target) letter occurred: "the letter seen l back comes again after c" (copy / repetition). No birth claws (the R135 random claws
   * and their RNG draws are unchanged). P.lagBlur = 1: the far lag is blurred to its octave bin b = floor(log2 l) (4-7, 8-15, 16-31, ...), key
   * (c, b, x) fires when the most recent far occurrence of x lies in bin b: one detector covers a range of delays (fewer, denser keys). */
  guLagEvent(yTgt, n) {
    const gu = this.gu; if (n < 1) return; const c0 = gu.win[0], mt = gu.match, kb = gu.keyBy, ow = gu.owned;
    const D = Math.max(5, Math.round(params.lagDepth)), L = gu.lg || (gu.lg = { D, h: new Int32Array(D).fill(-1), won: 0, next: null, blur: params.lagBlur > 0, m: Math.max(1, Math.round(params.lagCtx || 1)), cx: '' });
    const pre = L.blur ? 'B' : 'F', h = L.h;
    if ((params.lagPrune > 0 || params.lagSurp > 0) && L.next) this.guLagUse(L, pre + c0 + L.cx, c0, this.gSym);   // R140 lagPrune / lagSurp: per-detector use statistics (see guLagUse)
    if (mt && L.next) for (const sfx of L.next) { const key = pre + c0 + L.cx + sfx, j = ow.get(key); if (j != null && kb[j] === key) mt[j] += 1; }   // utility: the copy keys present in this window
    const tg = this.gSym; if (params.lagGate > 0) { if (tg != null && tg >= 0 && L.next) this.guLagGate(L, pre + c0 + L.cx, c0, tg, yTgt); }   // R140 lagGate: recruit only copy keys that predict better than the short context (see guLagGate)
    else if (tg != null && tg >= 0 && params.plasticity && this.learning && yTgt < 0.85) { let l = -1; for (let q = 4; q < D; q++) if (h[q] === tg) { l = q; break; }
      if (l >= 0) { const key = pre + c0 + L.cx + '|' + (L.blur ? Math.floor(Math.log2(l)) : l) + '|' + tg, j0 = ow.get(key);
        if (!(j0 != null && kb[j0] === key) && !gu.ban.has(key)) { const g = params.granChunkGate, seen = g > 0 ? this.guChunkSeen(key) : true;
          if ((g !== 1 || seen) && this.guRecruit(key, 0, yTgt, g === 2 && !seen)) gu.st.lagRec = (gu.st.lagRec || 0) + 1; } } }
    for (let q = D - 1; q > 1; q--) h[q] = h[q - 1]; h[1] = c0;   // shift the delay register: lags relative to the next window's current letter
    const nx = []; if (L.blur) { const sn = new Set(); for (let q = 4; q < D; q++) { const x = h[q]; if (x < 0 || sn.has(x)) continue; sn.add(x); nx.push('|' + Math.floor(Math.log2(q)) + '|' + x); } }
    else for (let q = 4; q < D; q++) if (h[q] >= 0) nx.push('|' + q + '|' + h[q]);
    L.next = nx; if (L.m > 1) { let cx = ''; for (let q = 1; q < L.m; q++) cx += ',' + h[q]; L.cx = cx; } }   // R140 lagCtx m: the key carries the last m letters (current + m-1 before), not only the current one
  /* R140 lagGate (P.lagGate = 1; 0 / unset = off): PREDICTIVE-UTILITY GATE for copy detectors (self-calibrating, no constant). Every copy key present in a
   * window keeps a count of its presences n and of the times its far letter x was the arriving letter h. A copy detector is recruited (surprising event,
   * as before) only for a present key with x = the arriving letter whose lower confidence bound p - sqrt(p (1 - p) / n) (p = h / n, n >= 3) beats BOTH the
   * short context: the net's own prediction of the arriving letter (yTgt) and the bigram rate P(x | current letter). Keys whose far letter adds nothing
   * over the current letter never get a detector, so frequent letters at far lags (the text failure of R140 D32) are filtered out by evidence. */
  guLagGate(L, kp, c0, tg, yTgt) {
    const gu = this.gu, A = gu.src[0].keys.length; if (!L.gs) { L.gs = new Map(); L.bg = new Float64Array(A * A); L.bn = new Float64Array(A); }
    const gs = L.gs; let best = null, bv = -1;
    for (const sfx of L.next) { const key = kp + sfx, x = +sfx.slice(sfx.lastIndexOf('|') + 1); let v = gs.get(key); if (!v) gs.set(key, v = [0, 0]); v[0]++; if (x === tg) v[1]++;
      if (x !== tg || v[0] < 3) continue; const p = v[1] / v[0], lb = p - Math.sqrt(p * (1 - p) / v[0]); if (lb > bv) { bv = lb; best = key; } }
    const pb = L.bn[c0] > 0 ? L.bg[c0 * A + tg] / L.bn[c0] : 0; L.bg[c0 * A + tg]++; L.bn[c0]++;
    let pr = pb; if (params.lagGate === 2) { const tk = c0 + ',' + L.h[1] + ',' + L.h[2], tm = L.tri || (L.tri = new Map()); let v = tm.get(tk); if (!v) tm.set(tk, v = new Map()); let nn = 0; for (const c of v.values()) nn += c;   // lagGate 2: reference = the short-context count rate P(x | last 3 letters) (what the exact tuples see), not only the bigram
      const pt = nn > 0 ? (v.get(tg) || 0) / nn : 0; v.set(tg, (v.get(tg) || 0) + 1); if (pt > pr) pr = pt; }
    if (!best || bv <= Math.max(yTgt, pr) || !(params.plasticity && this.learning) || yTgt >= 0.85) return;
    const j0 = gu.owned.get(best); if ((j0 != null && gu.keyBy[j0] === best) || gu.ban.has(best)) return; gu.st.lagPass = (gu.st.lagPass || 0) + 1;
    const g = params.granChunkGate, seen = g > 0 ? this.guChunkSeen(best) : true;
    if ((g !== 1 || seen) && this.guRecruit(best, 0, yTgt, g === 2 && !seen)) gu.st.lagRec = (gu.st.lagRec || 0) + 1; }
  /* R140 lagPrune (P.lagPrune = 1) / lagSurp (P.lagSurp = 1); 0 / unset = off, no RNG. Use-time gating of copy detectors (self-calibrating, no constant).
   * Each live copy detector j counts its presences n_j (its key held in a window) and hits h_j (its far letter x arrived next), and the bigram rate
   * P(x | current letter) at those presences (sum r_j). lagPrune: once the upper bound p + sqrt(p (1 - p) / n) + 1 / n (p = h / n) falls below the mean
   * reference r_j / n_j, the detector is freed and its key banned (it predicts no better than the current letter alone). lagSurp: a copy detector fires
   * only in windows where its precision (h + 1) / (n + 2) beats the confidence of the short context (the top count rate after the last 3 letters),
   * i.e. it can drive the readout only when the short-context prediction is uncertain. 0 < lagSurp < 1: softer, precision > lagSurp x confidence. lagSurp 2: the confidence is add-one smoothed over the alphabet. */
  guLagUse(L, kp, c0, tg) {
    const gu = this.gu, A = gu.src[0].keys.length, nG = gu.nG; if (!L.un) { L.un = new Float32Array(nG); L.uh = new Float32Array(nG); L.ur = new Float32Array(nG); L.ug = new Int32Array(nG).fill(-1); L.ubg = new Float64Array(A * A); L.ubn = new Float64Array(A); L.tri3 = new Map(); }
    const ok = tg != null && tg >= 0;
    for (const sfx of L.next) { const key = kp + sfx, j = gu.owned.get(key); if (j == null || gu.keyBy[j] !== key) continue; if (L.ug[j] !== gu.gen[j]) { L.ug[j] = gu.gen[j]; L.un[j] = 0; L.uh[j] = 0; L.ur[j] = 0; }
      if (!ok) continue; const x = +sfx.slice(sfx.lastIndexOf('|') + 1); L.un[j]++; if (x === tg) L.uh[j]++; L.ur[j] += L.ubn[c0] > 0 ? L.ubg[c0 * A + x] / L.ubn[c0] : 0;
      if (params.lagPrune > 0 && L.un[j] >= 3) { const n = L.un[j], p = L.uh[j] / n; if (p + Math.sqrt(p * (1 - p) / n) + 1 / n < L.ur[j] / n && gu.st.events - gu.born[j] >= gu.hold) {
        gu.ban.add(key); gu.owned.delete(key); gu.keyBy[j] = null; gu.gen[j]++; gu.xn[j] = 0; if (gu.match) gu.match[j] = 0; gu.st.lagPruned = (gu.st.lagPruned || 0) + 1; } } }
    if (ok) { L.ubg[c0 * A + tg]++; L.ubn[c0]++; const tk = c0 + ',' + L.h[1] + ',' + L.h[2]; let v = L.tri3.get(tk); if (!v) L.tri3.set(tk, v = new Map()); v.set(tg, (v.get(tg) || 0) + 1); } }
  guLagFire(c, syn, mk, gB) { const gu = this.gu, L = gu.lg; if (L.won) return; L.won = 1; const pre = L.blur ? 'B' : 'F';
    if (params.lagSurp > 0 && L.un) { let cf = 0; const v = L.tri3.get(c + ',' + L.h[1] + ',' + L.h[2]); if (v) { let t = 0, m = 0; for (const q of v.values()) { t += q; if (q > m) m = q; } cf = params.lagSurp === 2 ? (m + 1) / (t + gu.src[0].keys.length) : m / t; }   // lagSurp 2: add-one (Laplace) smoothed confidence, so rarely seen contexts do not look confident   // short-context confidence (h[1], h[2] = the 2 letters before c: the register is already shifted)
      for (const sfx of L.next) { const key = pre + c + L.cx + sfx, j = gu.owned.get(key); if (j == null || gu.keyBy[j] !== key) continue; const n = L.ug[j] === gu.gen[j] ? L.un[j] : 0, h = n ? L.uh[j] : 0;
        if ((h + 1) / (n + 2) > cf * (params.lagSurp < 1 ? params.lagSurp : 1)) this.guKeyFire(key, syn, mk, gB, 3); else gu.st.lagQuiet = (gu.st.lagQuiet || 0) + 1; } return; }
    for (const sfx of L.next) this.guKeyFire(pre + c + L.cx + sfx, syn, mk, gB, 3); }
  /* R137 granCat (P.granCat = f > 0; 0 / unset = off, bit-identical, no RNG; needs granChunk): a SECOND LEVEL OF LEARNED WORD CATEGORIES. Each completed word
   * keeps a continuation profile (counts of the first letter of the word that follows it). Categories are competitive-learning prototypes of the normalised
   * profiles, grown online: a word with >= 2 samples and no category seeds a new prototype while fewer than Kmax exist, otherwise joins the most similar
   * (cosine); its prototype moves toward it (rate 1 / min(n+1, 100)). Kmax = max(2, round(f x pool / 1000)) (pool = born granules), so a bigger pool holds
   * finer categories. Second-level detectors: key (category of the word before last, category of the last word, partial word, letter), recruited and fired
   * like the chunk detectors (same gate, pool and readout). */
  guCatInit(C) { const gu = this.gu, nB = gu.l2 != null ? gu.nG - gu.l2 : gu.nAct != null ? gu.st.nAct0 : gu.nG; C.K = Math.max(2, Math.round(params.granCat * nB / 1000)); C.A = gu.src[0].keys.length;
    C.prof = new Map(); C.wc = new Map(); C.cent = []; C.cn = []; C.q1 = -1; C.q2 = -1; C.pw = null; gu.st.catK = C.K; return C.K; }
  guCatObs(C, w, c0) { let v = C.prof.get(w); if (!v) C.prof.set(w, v = new Float64Array(C.A + 1)); v[c0]++; v[C.A]++; if (v[C.A] < 2) return;
    let z = 0; for (let i = 0; i < C.A; i++) z += v[i] * v[i]; z = Math.sqrt(z); const x = new Float64Array(C.A); for (let i = 0; i < C.A; i++) x[i] = v[i] / z;
    let b = -1, bv = -2; for (let k = 0; k < C.cent.length; k++) { const c = C.cent[k]; let d = 0; for (let i = 0; i < C.A; i++) d += c[i] * x[i]; if (d > bv) { bv = d; b = k; } }
    if (!C.wc.has(w) && C.cent.length < C.K) { b = C.cent.length; C.cent.push(Float64Array.from(x)); C.cn.push(1); this.gu.st.catN = C.cent.length; }
    else { const c = C.cent[b], r = 1 / Math.min(C.cn[b] + 1, 100); C.cn[b]++; let q = 0; for (let i = 0; i < C.A; i++) { c[i] += r * (x[i] - c[i]); q += c[i] * c[i]; } q = Math.sqrt(q) || 1; for (let i = 0; i < C.A; i++) c[i] /= q; }
    C.wc.set(w, b); }
  /* R136 granPhrase (P.granPhrase = 1; 0 / unset = off, bit-identical, no RNG; needs granChunk): SECOND LEVEL. Each completed word (chunk) becomes a symbol
   * of a slower stream; phrase detectors are recruited by the same rule (surprise, same gate, same pool and readout) on the key (word before last, last word,
   * partial word, current letter) = the chunk key extended by the previous chunk, and fire with the chunk detector in the read window.
   * granPhrase = 2: phrase detectors always use the 2nd-sighting gate (sparse level; the pool is left to chunks). */
  /* R135 granChunkGate (P.granChunkGate = 1; 0 / unset = off, bit-identical, no RNG): recruit a chunk detector only on the SECOND sighting of its key
   * (surprising and seen before). Seen-before memory = a 1-hash bit sketch (FNV-1a) of 2^ceil(log2(32 nG)) bits: sized by the pool itself, so the false
   * "seen" rate stays ~ (distinct keys) / (32 nG) (< 6% at book100k, 32000 granules). Returns true if the key was seen before; marks it seen.
   * granChunkGate = 2 (pressure gate): a first sighting still recruits, but only into a free slot (a granule with zero exact matches among the 48 sampled
   * candidates); once the pool holds no free slots, recruitment waits for the 2nd sighting. Self-calibrating: no gate while the pool has room (short text). */
  guChunkSeen(key) { const gu = this.gu; if (!gu.chS) { let b = 1; while (b < 32 * gu.nG) b <<= 1; gu.chS = new Uint32Array(b >>> 5); gu.chM = b - 1; }
    let h = 0x811c9dc5; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193); h = (h >>> 0) & gu.chM;
    const w = h >>> 5, m = 1 << (h & 31); if (gu.chS[w] & m) return true; gu.chS[w] |= m; gu.st.chunkGated = (gu.st.chunkGated || 0) + 1; return false; }
  guChunkFire(c, syn, mk, gB) {   // first hit of current-letter column c in this window: fire the chunk detector of (chunk state, c)
    const gu = this.gu; if (gu.ch.won) return; gu.ch.won = 1;   // only the first current-letter column to fire in the window (latency winner = the letter that arrived)
    this.guKeyFire(gu.ch.next + c, syn, mk, gB, 0); if (gu.ch.nextP != null) this.guKeyFire(gu.ch.nextP + c, syn, mk, gB, 1); if (gu.ch.nextQ != null) this.guKeyFire(gu.ch.nextQ + c, syn, mk, gB, 2); }
  guKeyFire(key, syn, mk, gB, ph) { const gu = this.gu, j = gu.owned.get(key); if (j == null || gu.keyBy[j] !== key || gu.xf[j]) return;
    if (!gu.xm[j]) gu.xT[gu.xTn++] = j; gu.xm[j] |= 1; gu.xf[j] = 1; gu.xF[gu.xFn++] = j; gu.xc[j]++;
    const b = gu.gOff + j, T = this.thr || this.g.thresh; syn[b] += 2 * (T[b] - V_REST) + 1; if (mk) mk[b] = 1; if (gB) gB[j >>> 5] |= 1 << (j & 31);
    if (ph === 3) gu.st.lagFired = (gu.st.lagFired || 0) + 1; else if (ph === 2) gu.st.catFired = (gu.st.catFired || 0) + 1; else if (ph) gu.st.phraseFired = (gu.st.phraseFired || 0) + 1; else gu.st.chunkFired = (gu.st.chunkFired || 0) + 1; }
  guColCap(s) { const v = params.granExactColCap;
    if (!v) { const gu = this.gu; if (s === 0 || gu.st.events < 3000) return 2; if (gu.crE0 !== gu.st.events) { gu.crE0 = gu.st.events; let m = 0; const a0 = gu.cr[0]; for (let c = 0; c < a0.length; c++) if (a0[c] > m) m = a0[c]; gu.crMax0 = Math.min(0.9, 3 * m); } return gu.crMax0; }
    // R120 granExactGuard (self-calibrating): a lag column is saturated when it is active in more windows than 3x the most frequent CURRENT letter's column (source 0) - no letter can explain that; capped at 0.9 (small alphabets)
    if (v > 0) return v; const gu = this.gu, a = gu.cr[s]; if (!gu.crM || gu.crE !== gu.st.events) { gu.crE = gu.st.events; gu.crM = gu.cr.map(x => { let t = 0; for (let c = 0; c < x.length; c++) t += x[c]; return t / x.length; }); }
    return gu.st.events < 3000 ? 2 : Math.max(-v * gu.crM[s], 0.05); }   // < 0 = self-calibrating: |v| x the source's mean column activity (a saturated column vs its alphabet)
  guExactReset() { const gu = this.gu, xm = gu.xm, xf = gu.xf, xT = gu.xT; if (gu.ch) gu.ch.won = 0; if (gu.lg) gu.lg.won = 0; for (let q = 0; q < gu.xTn; q++) { xm[xT[q]] = 0; xf[xT[q]] = 0; } gu.xTn = 0; gu.xFn = 0;
    const cT = gu.cT; if (params.granExactColCap || (params.granExactGuard & 2) || params.lagHomeo > 0) { const cr = gu.cr; for (let s2 = 0; s2 < cr.length; s2++) { const a = cr[s2]; for (let c = 0; c < a.length; c++) a[c] *= 0.999; } for (let q = 0; q < cT.length; q += 2) if (gu.cHit[cT[q]][cT[q + 1]] >= 250) cr[cT[q]][cT[q + 1]] += 0.001; }
    for (let q = 0; q < cT.length; q += 2) gu.cHit[cT[q]][cT[q + 1]] = 0; cT.length = 0; if (gu.lh) this.lagHomeoStep(); if (gu.wta) gu.wta.fill(0); }
  guDrive(spk, nSpk, syn, mk) {
    const gu = this.gu, colOf = gu.colOf, hits = gu.hits, lists = gu.lists, gOff = gu.gOff, gEnd = gOff + gu.nG, use = gu.use, gen = gu.gen, K = gu.K, hOff = gu.hOff, gB = this.gBits;
    if (gu.xm) { const inNow = nSpk > 0 && spk[0] < this.g.nIn; if (inNow && !gu.inPrev) this.guExactReset(); gu.inPrev = inNow; if (gu.xL) { gu.tk++; if (gu.st.events > 0) gu.sps = gu.tk / gu.st.events; } }   // R119: a new input symbol starts a new window (also in free-running generation, which has no teaching events)
    if (gu.xm && params.granExactHold !== 0 && gu.xFn) { const T = this.thr || this.g.thresh, F = gu.xF; for (let q = 0; q < gu.xFn; q++) { const b = gOff + F[q]; syn[b] += 2 * (T[b] - V_REST) + 1; if (mk) mk[b] = 1; } }   // R119 granExactHold (default on): a matched detector keeps firing for the rest of the read window (sustained drive like the dense code)
    for (let q = 0; q < nSpk; q++) {
      const i = spk[q]; if (i >= gOff && i < gEnd) use[i - gOff]++;
      const gc = colOf[i]; if (gc < 0) continue; hits[gc]++;
      let s = 0; while (s + 1 < K && gc >= hOff[s + 1]) s++;
      if (gu.xm) { this.guExact(i, gc, s, syn, mk, gB); continue; }
      const L = lists[s][gc - hOff[s]];
      for (let r = 0, m = L.length; r < m; r++) { const e = L[r]; if (e.gen !== gen[e.j]) continue; const b = gOff + e.j; syn[b] += e.w; if (mk) mk[b] = 1; if (gB) gB[e.j >>> 5] |= 1 << (e.j & 31); }
    }
  }
  granUtilityEvent(yTgt) {
    const gu = this.gu; if (!gu) return;
    const { K, Km, W, nG, gOff, src, hOff, hits, win, lists, inS, inK, outS, outK, use, born, gen, keyBy, owned, pending, rng, co, hold, st } = gu;
    st.events++; const mt0 = gu.match, ev0 = j => st.events - born[j] >= hold;
    let n = 0;
    for (let s = 0; s < K; s++) { const a = hOff[s], m = src[s].keys.length; let bc = -1, bh = 0;
      for (let c = 0; c < m; c++) { const h = hits[a + c]; if (h > bh) { bh = h; bc = c; } }
      if (bc >= 0) win[n++] = bc; else break; }
    if (gu.xm && params.granExactCap) { const xr = gu.xr, F = gu.xF; let sm = 0, nl = 0; for (let j = 0; j < nG; j++) { xr[j] *= 0.999; if (keyBy[j] != null) { sm += xr[j]; nl++; } } for (let q = 0; q < gu.xFn; q++) xr[F[q]] += 0.001;
      const cap = params.granExactCap > 0 ? params.granExactCap : st.events < 3000 ? 2 : Math.max(0.01, -params.granExactCap * (nl ? sm / nl : 0));   // < 0 = self-calibrating: |v| x the mean match rate of the live detectors   // R119 granExactCap: a detector matching in > cap of the windows (EMA) is too broad -> freed for recruitment
      for (let q = 0; q < gu.xFn; q++) { const j = F[q]; if (xr[j] > cap && ev0(j)) { const kb = keyBy[j]; if (kb != null) gu.ban.add(kb); if (kb != null && owned.get(kb) === j) owned.delete(kb); keyBy[j] = null; gen[j]++; gu.xn[j] = 0; xr[j] = 0; if (mt0) mt0[j] = 0; st.capped++; } } }
    hits.fill(0); if (gu.xm) this.guExactReset();
    for (let j = 0; j < nG; j++) use[j] *= 0.998;
    const mt = gu.match;   // R119 granUtility 2 (match utility): credit the granules whose whole claw tuple (lags t .. t-m+1, m = Km .. n) is this window
    if (mt) { for (let j = 0; j < nG; j++) mt[j] *= 0.998; let kk = String(Km); for (let c = 0; c < Km && c < n; c++) kk += ',' + win[c];
      for (let m = Km; m <= n; m++) { if (m > Km) kk = String(m) + kk.slice(kk.indexOf(',')) + ',' + win[m - 1]; const j = owned.get(kk); if (j != null) { mt[j] += 1; st.matched++; } } }
    if (params.lagDepth > 4 && gu.xm) this.guLagEvent(yTgt, n);   // R140 lagDepth (off by default): long-lag (copy) detectors, see guLagEvent
    if (params.granChunk > 0 && gu.xm) this.guChunkEvent(yTgt, n);   // R134 granChunk (off by default): word-context chunk detectors (before the recruit early-returns)
    if (!(params.plasticity && this.learning) || yTgt >= 0.85 || n < Km) return;
    let key = String(n); for (let c = 0; c < n; c++) key += ',' + win[c];
    if (gu.xm) { let kk = String(Km); for (let c = 0; c < Km; c++) kk += ',' + win[c];   // exact mode: recruit the shortest missing window first (3 letters, then 4)
      for (let m = Km; m <= n; m++) { if (m > Km) kk = String(m) + kk.slice(kk.indexOf(',')) + ',' + win[m - 1]; if (!owned.has(kk) && !gu.ban.has(kk)) { key = kk; n = m; break; } }
      if (gu.ban.has(key)) return; if (params.granExactColCap || (params.granExactGuard & 2)) for (let c = 0; c < n; c++) if (gu.cr[c][win[c]] > this.guColCap(c)) { st.guardSkip = (st.guardSkip || 0) + 1; return; } }
    if (owned.has(key)) return;
    this.guRecruit(key, n, yTgt);
  }
  guRecruit(key, n, yTgt, free, lv2) {   // R138: lv2 = a level-2 key (recruits only in [l2, nG) when granL2 is on; level-1 keys only below l2)   // R135: free = recruit only into a never-matched slot (granChunkGate 2); returns true when a granule was recruited   // (R134: the recruit tail of granUtilityEvent as a method, unchanged; n = 0 = a chunk detector with no claw lists)
    const gu = this.gu, { W, nG, gOff, src, win, lists, inS, inK, outS, outK, use, born, gen, keyBy, owned, pending, rng, co, hold, st } = gu, mt = gu.match;
    if (lv2 && params.granL2 > 0 && gu.l2 == null) return false;   // R138 granL2 with no level-2 pool (sizeF <= b): no second level
    const cnt = (pending.get(key) || 0) + 1;
    if (cnt < co) { pending.set(key, cnt); return; }
    pending.delete(key);
    const ev = st.events, ws = this.ws, posts = this.posts;
    let best = -1, bu = Infinity;
    for (let t = 0; t < 48; t++) {
      const L2 = gu.l2 != null, r0 = L2 && lv2 ? gu.l2 : gu.rsv0 > 0 ? gu.rsv0 : 0, j = r0 + ((rng() * ((L2 && lv2 ? nG : gu.nAct != null ? gu.nAct : L2 ? gu.l2 : nG) - r0)) | 0); if (ev - born[j] < hold) continue;   // R119 granReserve: recruit / recycle only inside the reserve (r0 = 0 = whole layer, same draw)
      let wSum = 0; for (let q = outS[j]; q < outS[j + 1]; q++) wSum += ws[outK[q]];
      const u = mt ? mt[j] : use[j] * (0.01 + wSum);   // R119: mode 2 ranks by exact-tuple matches (homeostasis keeps every granule spiking, so the spike-count utility never falls below 0.05 in v47)
      if (u < bu) { bu = u; best = j; if (u === 0) break; }
    }
    const cap1 = gu.l2 != null ? gu.l2 : nG, in2 = lv2 && gu.l2 != null;   // in2: a level-2 recruit inside the L2 pool (no growth there)
    if (params.granEvGrow > 0 && !in2 && gu.nAct < cap1 && best >= 0 && bu > 0) { best = gu.nAct++; bu = 0; st.evGrown = (st.evGrown || 0) + 1; }   // R138 granEvGrow: evicting a used level-1 detector adds a slot instead (grow on eviction)
    if (free && !in2 && gu.nAct < cap1 && (best < 0 || bu > 0)) { best = gu.nAct++; bu = 0; st.grown = (st.grown || 0) + 1; }   // R136 granGrow: a first sighting the pressure gate would refuse adds a slot instead (pool grows on demand up to the allocated cap)
    if (best < 0 || bu > 0.05) return false; if (free && bu > 0) { st.chunkFull = (st.chunkFull || 0) + 1; return false; }
    if (keyBy[best] != null && owned.get(keyBy[best]) === best) owned.delete(keyBy[best]);
    for (let q = inS[best]; q < inS[best + 1]; q++) ws[inK[q]] = 0;
    const gv = ++gen[best], b = gOff + best;
    keyBy[best] = key; if (this.gKn) this.gKn[gu.gOff + best] = 0; owned.set(key, best); born[best] = ev; use[best] = 1; if (mt) mt[best] = 1;
    if (gu.xm) { gu.xn[best] = n; for (let c = 0; c < n; c++) lists[c][win[c]].push({ j: best, w: 0, gen: gv, c }); }
    else for (let c = 0; c < n; c++) { const col = win[c], sl = src[c].off[col + 1] - src[c].off[col]; if (sl > 0) lists[c][col].push({ j: best, w: W / n / sl, gen: gv }); }
    const U = this.gU, Uw = this.gRUw, pos = this.gRpos, wo = gu.wo, psi = this.gPsi || 0;
    const o0 = this.g.nIn + this.g.nHid, tgtNode = params.granTgt === 1 && this.gSym >= 0 ? o0 + this.gSym : -1;
    // R121 granOneShot (P.granOneShot = 1; off = bit-identical): the recruit's weight onto the symbol that just arrived is the readout's own NLMS
    // step for a lone active input (granLr x granRef x (1 - y)), i.e. what the cell would have learned had it fired in the window it was recruited
    // for (one-shot, like a count model's first sighting); granOneShot 2: / (1 + granules active in that window) = its NLMS share; 0 < granOneShot < 1: that fraction of the lone-input step; instead of the token granLr x (1 - y) on a weight scale of up to wMax x granExactW.
    const os = params.granOneShot > 0 && gu.xm, wTgt = os ? Math.min(params.wMax * (params.granExactW > 0 ? params.granExactW : 50), wo + (params.granLr || 0.1) * (params.granRef > 0 ? params.granRef : 10) * Math.max(0, 1 - yTgt) * (params.granOneShot < 1 ? params.granOneShot : 1) / (params.granOneShot === 2 ? 1 + (this.gLastNA || 0) : 1)) : Math.min(params.wMax || 15, wo + (params.granLr || 0.1) * Math.max(0, 1 - yTgt));
    if (U && !gu.uAt && this.gIn) { const Ki = this.gIn.K, m = new Int32Array(ws.length).fill(-1); for (let r = 0; r < Ki.length; r++) m[Ki[r]] = r; gu.uAt = m; }
    const map = gu.uAt;
    for (let q = outS[best]; q < outS[best + 1]; q++) { const e = outK[q], uVal = posts[e] === tgtNode ? wTgt : mt && params.granRecruitW0 !== 1 ? 0 : wo;   // R119 mode 2: a recruit starts silent on the non-target outputs (wo = the untrained initial weight would add uniform drive to every output; P.granRecruitW0=1 = old)
      if (U && map && map[e] >= 0) { const r = map[e]; U[r] = uVal; if (Uw && pos) Uw[pos[r]] = uVal; }
      ws[e] = U ? psi * uVal : uVal;
      if (this.gFA) { const tg = posts[e] === tgtNode ? 1 : 0, f = tg && this.gFx > 0 ? (params.granRef > 0 ? params.granRef : 10) / this.gFx : 0, wX = params.wMax * (params.granExactW > 0 ? params.granExactW : 50), w1 = uVal + f > wX ? wX : uVal + f;   // R133 granTrace: the recruit's trace = its first observation, full vote (gate 1 at n = 0)
        this.gFE[e] = tg; if (U) { this.gFA[e] = f; ws[e] = psi * (uVal + f); } else { ws[e] = w1; this.gFA[e] = w1 - uVal; } } }
    if (this.gFA) this.gFo[b] = tgtNode >= 0 ? 1 : 0;
    if (this.thr) { this.thr[b] = gu.thr0; if (this.gLastT) this.gLastT[best] = this.gThStep; }
    this.v[b] = V_REST; if (this.gCnt) this.gCnt[b] = 0; if (this.gAcc) this.gAcc[b] = 0;
    st.rewired++; return true;
  }
  // Two-timescale event-gated chunk boundary shift (T.map === 'chunkGate'):
  // Gates higher-order context regions only on explicit chunk delimiters (e.g. space = sym 0) or high cortical surprise.
  initChunkGates() {
    const gates = this.g && this.g.chunkGates; if (!gates || !gates.length) return;
    const spec = currentEnv().spec; let go2Id = -1;
    if (spec && spec.inputs) for (let i = 0; i < spec.inputs.length; i++) if (spec.inputs[i].group === 'go2') { go2Id = i; break; }
    this.cg = { gates, go2Id, lastTick: -1, age: 0, shifts: 0 };
  }
  chunkGateStep(syn, mk) {
    const cg = this.cg; if (!cg || cg.lastTick === this.tickNo) return;
    if (cg.go2Id >= 0 && !(this.ext[cg.go2Id] > 0)) return;
    cg.lastTick = this.tickNo;
    const surprise = this.lastSurprise != null ? this.lastSurprise : 1, sym = this.gSym;
    for (let i = 0; i < cg.gates.length; i++) {
      const g = cg.gates[i], maxLag = g.maxLag || 6;
      const fire = (g.delimSym >= 0 && sym === g.delimSym) || surprise >= g.thr || cg.age >= maxLag;
      if (fire) { cg.age = 0; cg.shifts++; const nd = g.nodes, wt = g.weights; for (let q = 0; q < nd.length; q++) { const u = nd[q]; syn[u] += wt[q]; if (mk) mk[u] = 1; } }
      else cg.age++;
    }
  }
  deltaInit() {
    const N = this.N, nIn = this.g.nIn, rc = new Uint8Array(N), inS = this.inStart, inE = this.inEdges, isP = this.isPlastic, w0 = this.w0, iI = this.instrIn;
    const pl = new Uint8Array(N); for (let i = nIn; i < N; i++) for (let q = inS[i], e = inS[i + 1]; q < e; q++) { const k = inE[q]; if (isP[k] && w0[k] > 0) { pl[i] = 1; break; } }
    for (let i = 0; i < nIn; i++) { if (iI && !iI[i]) continue; for (let k = this.start[i], e = this.start[i + 1]; k < e; k++) if (this.ws[k] > 0 && pl[this.posts[k]]) rc[this.posts[k]] = 1; }
    const L = []; for (let i = 0; i < N; i++) if (rc[i]) L.push(i);
    this.dRc = rc; this.dList = Int32Array.from(L); this.dCnt = new Float32Array(N);
    if (globalThis.__deltaDbg) globalThis.__deltaDbg.nR = L.length;
    if (typeof process !== "undefined" && process.env.BB_DDBG && !globalThis.__deltaDbg) { const D = globalThis.__deltaDbg = { ev: 0, y: 0, fa: 0, nR: L.length, nev: 0 }; process.on("exit", () => console.error("deltaDbg", JSON.stringify(D), "mean y at target", (D.y / D.ev).toFixed(3), "false-alarm y per event", (D.fa / Math.max(1, D.nev)).toFixed(3))); }
  }
  deltaStep(dL, xT, xg, lF, plat, spk, nSpk) {
    if (!this.dList) this.deltaInit();
    const dM = this.p.deltaMode | 0, rc = this.dRc, cnt = this.dCnt, armed = this.armed, L = this.dList, plN = this.p.plateau, ref = this.p.deltaRef > 0 ? this.p.deltaRef : 1;
    let ev = false; if (this.p.deltaTau > 0) { const dq = this.dDec || (this.dDec = Math.exp(-1 / this.p.deltaTau)); for (let q = 0; q < L.length; q++) cnt[L[q]] *= dq; }   // deltaTau: the prediction is a decaying trace of the predictive spikes (recent = just before the input)
    if (dM & 4) { const sy = this.syn, sP = this.rcv ? this.synP : null; for (let q = 0; q < L.length; q++) { const i = L[q]; if (plat[i] <= 0 && armed[i]) { const v = sy[i] + (sP ? sP[i] : 0); if (v > 0) cnt[i] += v; } }   // deltaMode 4: graded prediction = the cell's (positive) synaptic drive, not its spikes
      for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (rc[i] && plat[i] === plN) ev = true; } }
    else for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (!rc[i]) continue; if (plat[i] === plN) ev = true; else if (plat[i] <= 0 && armed[i]) cnt[i]++; }
    if (!ev) for (let q = 0; q < L.length; q++) if (plat[L[q]] === plN) { ev = true; break; }
    if (!ev) return; if (globalThis.__deltaDbg) globalThis.__deltaDbg.nev++;
    const ws = this.ws, wMax = params.wMax, inS = this.inStart, inE = this.inEdges, isP = this.isPlastic, w0 = this.w0, pres = this.pres, nd = this.normDirty, dirty = this.dirtyList, D = globalThis.__deltaDbg;
    for (let q = 0; q < L.length; q++) { const i = L[q], t = plat[i] === plN ? 1 : 0, y = Math.min(1, cnt[i] / ref), er = t - y; cnt[i] = 0;
      if (D) { D.ev += t; D.y += t ? y : 0; D.fa += t ? 0 : y; }
      if (er === 0 || ((dM & 1) && er < 0) || ((dM & 2) && er > 0)) continue; const g = dL * er * (lF ? lF[i] : 1);   // deltaMode 1: targets only (no depression of non-targets), 2: depression only
      for (let r = inS[i], e = inS[i + 1]; r < e; r++) { const k = inE[r]; if (!isP[k] || !(w0[k] > 0)) continue; const j = pres[k], x = xT[j] * xg; if (x < 0.01) continue;
        let w = ws[k] + g * x; ws[k] = w < 0 ? 0 : w > wMax ? wMax : w;
        if (!nd[j]) { nd[j] = 1; dirty.push(j); } } }
  }
  // v9 teacher-gated plasticity: per-cell teacher trace / plateau, presynaptic weight normalisation.
  initTeach() {
    const N = this.N; this.teachTr = new Float32Array(N); this.plat = new Int16Array(N); this.armed = new Uint8Array(N).fill(1); this.drv = new Float32Array(N);
    if (this.p.uni > 0) { const sp = currentEnv().spec, nIn = this.g.nIn; this.uni = true;   // v22: only non-diffuse (topographic / cue) sensors carry instructive signals
      this.instrIn = new Uint8Array(nIn); for (let i = 0; i < nIn; i++) this.instrIn[i] = sp.inputs.length === nIn && sp.inputs[i] && !sp.inputs[i].diffuse && !sp.inputs[i].tonic ? 1 : 0;
      // a cell contacted by an instructive sensor (climbing fibre) learns from its instructive signal; every other plastic receiver
      // learns from the global dopamine through its eligibility traces (only those synapses keep traces: isE / eList)
      const ic = this.instrCell = new Uint8Array(N); for (let i = 0; i < nIn; i++) if (this.instrIn[i]) for (let k = this.start[i], e = this.start[i + 1]; k < e; k++) if (this.ws[k] > 0) ic[this.posts[k]] = 1;
      this.isE = new Uint8Array(this.posts.length); const L = []; const gE = this.g.gran && params.granLr > 0 ? this.g.gran : null; for (const k of this.plastic) if (!ic[this.posts[k]] && !(gE && gE[this.pres[k]])) { this.isE[k] = 1; L.push(k); } this.eList = Int32Array.from(L); this.eOn = L.length > 0; }
    this.normDirty = new Uint8Array(N); this.dirtyList = [];
    if (this.p.teachAHP > 0) {   // v16: receivers (cells with plastic inputs) get an afterhyperpolarisation when their teacher input ends
      this.ahp = new Int16Array(N); this.ahpRecv = new Uint8Array(N); for (let k = 0; k < this.posts.length; k++) if (this.isPlastic[k] && this.w0[k] > 0 && !this.granIsoK(k)) this.ahpRecv[this.posts[k]] = 1; }
    if (this.p.trustPow > 0) { this.trust = new Float32Array(N).fill(this.p.trust0 >= 0 ? this.p.trust0 : this.p.trustRef); this.trustW = new Float32Array(N); this.trustT = -1;
      this.trustRecv = new Uint8Array(N); for (let k = 0; k < this.posts.length; k++) if (this.isPlastic[k] && this.w0[k] > 0 && !this.granIsoK(k)) this.trustRecv[this.posts[k]] = 1; }   // cells with plastic inputs
    if (this.p.preNorm > 0 && !(this.uni && !this.instrReach())) for (let i = 0; i < N; i++) this.normPre(i);   // (v22: a brain without instructive inputs starts from its grown weights, as under the reward rule)
    if (this.p.metaN > 0) this.metaE = new Float32Array(N);   // v12 metaplasticity: potentiation received per presynaptic cell
    if (this.p.preLag > 0) { this.lagBuf = new Uint8Array(N * this.p.preLag); this.lagPos = 0; this.xLag = new Float32Array(N); }
  }
  instrReach() {                             // v22: does any instructive sensor contact a cell with plastic inputs?
    const rc = new Uint8Array(this.N); for (const k of this.plastic) rc[this.posts[k]] = 1;
    for (let i = 0; i < this.g.nIn; i++) if (this.instrIn[i]) for (let k = this.start[i], e = this.start[i + 1]; k < e; k++) if (this.ws[k] > 0 && rc[this.posts[k]]) return true;
    return false;
  }
  buildNp() {                                // v11: per-cell list of its plastic excitatory synapses (same order as before)
    const N = this.N, isP = this.isPlastic, w0 = this.w0, st = new Int32Array(N + 1), idx = [];
    for (let c = 0; c < N; c++) { st[c] = idx.length; for (let k = this.start[c], e = this.start[c + 1]; k < e; k++) if (isP[k] && w0[k] > 0) idx.push(k); }
    st[N] = idx.length; this.npStart = st; this.npIdx = Int32Array.from(idx);
  }
  trophicS() {                               // R73 trophic: per-cell 1 / (size factor of the cell's region), 1 for unscaled regions
    const N = this.N, f = new Float32Array(N).fill(1), R = this.g.regions, rg = this.g.region; if (R && rg) for (let i = 0; i < N; i++) { const r = R[rg[i]]; if (r && r.sizeF > 1) f[i] = 1 / r.sizeF; }
    return this.trF = f; }
  trophicStr() {                             // R74 trophic bit 4: the 1/f budget only for cells with a plastic output onto the striatum (reward-rule path)
    const t = this.trF || this.trophicS(), N = this.N, f = new Float32Array(N).fill(1), R = this.g.regions, rg = this.g.region, ps = this.posts, pr = this.pres, isP = this.isPlastic;
    if (R && rg) for (let k = 0; k < ps.length; k++) if (isP[k] && this.w0[k] > 0) { const r = R[rg[ps[k]]]; if (r && r.name === 'striatum') f[pr[k]] = t[pr[k]]; }
    return this.trStr = f; }
  fanEqF() {                                 // R74 trophic bit 8: step x min(1, n1x / n), n1x = the cell's 1x-equivalent plastic fan-in (an input from an f x region counts 1/f)
    const t = this.trF || this.trophicS(), N = this.N, f = new Float32Array(N).fill(1), inS = this.inStart, inE = this.inEdges, isP = this.isPlastic, w0 = this.w0, pr = this.pres;
    for (let i = this.g.nIn; i < N; i++) { let n = 0, e1 = 0; for (let q = inS[i], e = inS[i + 1]; q < e; q++) { const k = inE[q]; if (isP[k] && w0[k] > 0) { n++; e1 += t[pr[k]]; } } if (n > 0 && e1 < n) f[i] = e1 / n; }
    return this.lrF8 = f; }
  scaledRecv(st, ix) { const t = this.trophicS(), pr = this.pres, f = new Uint8Array(st.length - 1); for (let r = 0; r < f.length; r++) for (let q = st[r]; q < st[r + 1]; q++) if (t[pr[ix[q]]] < 1) { f[r] = 1; break; } return f; }
  buildPc(pl) {                              // R72 postCap: excitatory plastic inputs of this rule grouped by receiver
    const m = new Map(); for (let q = 0; q < pl.length; q++) { const k = pl[q]; if (!(this.w0[k] > 0)) continue; const i = this.posts[k]; if (!m.has(i)) m.set(i, []); m.get(i).push(k); }
    const st = [0], ix = [], c0 = []; for (const ks of m.values()) { let t = 0; for (const k of ks) { ix.push(k); t += this.w0[k]; } st.push(ix.length); c0.push(t); } this.pcStart = Int32Array.from(st); this.pcIdx = Int32Array.from(ix); this.pcW0 = Float64Array.from(c0); }
  normPre(i) {                               // plastic outgoing weights of cell i sum to preNorm
    if (this.g.gran && this.g.gran[i] && params.granLr > 0) return;   // R83b: granule outputs are outside the presynaptic budget (cerebellar rule bounds them)
    if (!this.npStart) this.buildNp();
    const ws = this.ws, wMax = params.wMax, st = this.npStart, idx = this.npIdx, a = st[i], e = st[i + 1]; let s = 0;
    for (let q = a; q < e; q++) s += ws[idx[q]];
    if (s <= 0) return; let f = this.p.preNorm * ((params.trophic & 1) ? (this.trF || this.trophicS())[i] : (params.trophic & 4) ? (this.trStr || this.trophicStr())[i] : 1) / s;   // R73 trophic bit 1: a cell of a region grown f x larger has a 1/f outgoing budget (receivers share a fixed trophic supply)
    if (this.g.gran && this.g.gran[i] && params.granBud > 0) f *= params.granBud;   // R83 granBud: granule cells' plastic output budget x granBud (gentle addition to the prediction cells' input)
    if (this.p.confPow > 0) { let s2 = 0; for (let q = a; q < e; q++) { const w = ws[idx[q]]; s2 += w * w; }   // v12 confidence gain
      f *= Math.min(this.p.confMax, Math.pow((e - a) * s2 / (s * s) / this.p.confRef, this.p.confPow)); }
    if (this.trust) f *= Math.min(this.p.trustMax, Math.pow(this.trust[i] / this.p.trustRef, this.p.trustPow));   // v12 learned trust
    for (let q = a; q < e; q++) { const k = idx[q]; ws[k] = Math.min(wMax, ws[k] * f); }
  }
  // v12: each cell with plastic outputs and a recent (lagged) pre-trace scores the share of its output weight on
  // cells now in a teacher plateau, and keeps a pre-trace weighted running mean of it (window up to trustN events).
  updateTrust() {
    if (!this.npStart) this.buildNp();
    const N = this.N, st = this.npStart, idx = this.npIdx, ws = this.ws, posts = this.posts, plat = this.plat, xT = this.xLag || this.xPre, tr = this.trust, tw = this.trustW, tN = this.p.trustN, xg = this.fastE ? (this.xLag ? this.xG : this.pG) : 1;
    for (let c = 0; c < N; c++) { const a = st[c], e = st[c + 1]; if (e === a) continue; const x = xT[c] * xg; if (x < 0.01) continue;
      let s = 0, h = 0; for (let q = a; q < e; q++) { const k = idx[q], w = ws[k]; s += w; if (plat[posts[k]] > 0) h += w; }
      if (s <= 0) continue; tw[c] += x; const r = Math.min(1, x / Math.min(tw[c], tN)); tr[c] += r * (h / s - tr[c]);
      if (this.p.preNorm > 0) this.normPre(c); }
  }
  // v13: propagation with the receiver pool: plastic input to receivers gets divisive normalisation, receiver spikes feed
  // a shared inhibitory pool, receivers get membrane noise. Non-receiver input is propagated exactly as usual.
  initRcv() {
    const N = this.N, isR = new Uint8Array(N); for (let k = 0; k < this.posts.length; k++) if (this.isPlastic[k] && this.w0[k] > 0 && !this.granIsoK(k)) isR[this.posts[k]] = 1;
    const list = []; for (let i = 0; i < N; i++) if (isR[i]) list.push(i);
    this.rcv = Int32Array.from(list); this.isRcv = isR; this.synP = new Float32Array(N); this.poolTr = 0;
    const P = this.posts, isP = this.isPlastic, toR = new Uint8Array(P.length); for (let k = 0; k < P.length; k++) toR[k] = isP[k] && isR[P[k]] ? 1 : 0;
    this.toRcv = toR;   // perf: per-synapse "plastic synapse onto a receiver" flag (isPlastic/isRcv are fixed after construction)
    if (!globalThis.__bbSlow) {   // R65: syn and synP are two halves of one buffer; each synapse's target slot precomputed (branch-free, same additions in the same order)
      const buf = new Float32Array(2 * N); buf.set(this.syn); this.syn = buf.subarray(0, N); this.synP = buf.subarray(N, 2 * N); this.synBuf = buf;
      const tg = new Int32Array(P.length); for (let k = 0; k < P.length; k++) tg[k] = toR[k] ? N + P[k] : P[k]; this.synTgt = tg; }
    this.rcvRng = mulberry32(0x5eed1 ^ this.g.N); this.dPool = this.p.rcvInhTau > 0 ? Math.exp(-1 / this.p.rcvInhTau) : 0;
  }
  propagateRcv(spk, nSpk) {
    const start = this.start, posts = this.posts, ws = this.ws, syn = this.syn, toR = this.toRcv, isR = this.isRcv, sP = this.synP, R = this.rcv, p = this.p;
    let nR = 0;
    if (this.synTgt) { const buf = this.synBuf, tg = this.synTgt; for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (isR[i]) nR++;
      for (let k = start[i], e = start[i + 1]; k < e; k++) buf[tg[k]] += ws[k]; } }
    else for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (isR[i]) nR++;
      for (let k = start[i], e = start[i + 1]; k < e; k++) { const j = posts[k]; if (toR[k]) sP[j] += ws[k]; else syn[j] += ws[k]; } }
    let f = 1;
    if (p.rcvDiv > 0) { let S = 0; for (let q = 0; q < R.length; q++) S += sP[R[q]]; f = p.rcvDiv * R.length / (p.rcvSig + S); }
    this.poolTr = this.poolTr * this.dPool + nR; const inh = p.rcvInh * this.poolTr;
    const sd = p.rcvNoise, rng = this.rcvRng;
    for (let q = 0; q < R.length; q++) { const j = R[q]; let x = sP[j] * f - inh;
      if (sd > 0) { const u = rng() || 1e-12, v = rng(); x += sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }
      syn[j] += x; sP[j] = 0; }
  }
  initDt(f) {                                // R68: a substep lasts f reference substeps: leaks / decays ^ f, time constants and durations / f
    const g = this.g; this.dtF = f; this.L = Math.pow(params.leak, f); this.td = Math.pow(params.traceDecay, f); this.t7 = Math.pow(0.7, f);
    this.gl = g.leak ? Float32Array.from(g.leak, l => Math.pow(l, f)) : null;
  }
  dtScalePl(p) {                             // (rates per substep x f, mV per substep x f, noise sd per substep x sqrt f, durations in substeps / f)
    const f = this.dtF, D = x => Math.max(1, Math.round(x / f));
    for (const k of ['tauPre', 'tauPost', 'tauElig', 'tauElig2', 'actNoiseTau']) p[k] = p[k] / f;
    for (const k of ['rcvInhTau', 'regInhTau']) if (p[k] > 0) p[k] = p[k] / f;
    for (const k of ['plateau', 'trustDelay', 'teachAHPDur']) p[k] = D(p[k]);
    if (p.preLag > 0) p.preLag = D(p.preLag);
    for (const k of ['rcvRate', 'mixRate', 'hidRate']) p[k] = p[k] * f;
    p.teachAHP *= f; p.actNoise *= Math.sqrt(f);
  }
  setPlasticityConsts() {
    const p = Object.assign({}, PL_DEFAULTS, this.g.pl); if (this.dtF) this.dtScalePl(p);
    this.p = p; this.dPre = Math.exp(-1 / p.tauPre); this.dPost = Math.exp(-1 / p.tauPost);
    this.dElig = Math.exp(-1 / p.tauElig); this.dElig2 = (p.eligMix > 0 || p.eligGate > 0) ? Math.exp(-1 / p.tauElig2) : 0;   this.dMods = this.chs.map(c => Math.exp(-1 / c.tauMod));
  }
  actClsF() { const g = this.g, N = this.N, m = new Map(), c = new Uint16Array(N);   // R78c: presynaptic class id (region x cell type; mixing cells their own class)
    for (let i = 0; i < N; i++) { const key = (g.region ? g.region[i] : 0) * 4096 + (g.mix && g.mix[i] ? 4095 : (g.cellType ? g.cellType[i] : 0)); if (!m.has(key)) m.set(key, m.size); c[i] = m.get(key); }
    this.actNC = m.size; this.actCls = c; return c; }
  fanLrF(fR) { const N = this.N, f = new Float32Array(N).fill(1), ipS = this.ipStart, inS = this.inStart, inE = this.inEdges, isP = this.isPlastic, w0 = this.w0;   // R71 fanRef
    for (let i = this.g.nIn; i < N; i++) { let n = 0; if (ipS) n = ipS[i + 1] - ipS[i]; else for (let q = inS[i], e = inS[i + 1]; q < e; q++) { const k = inE[q]; if (isP[k] && w0[k] > 0) n++; } if (n > fR) f[i] = fR / n; }
    this.lrFR = fR; return f; }
  get learning() { return params.plasticity && this.plastic.length > 0 && this.p.lr > 0; }
  // One neural sub-step. Uses this.ext as external current.
  step() {
    if (this.fastE) return this.stepFast();
    const N = this.N, v = this.v, syn = this.syn, ext = this.ext, sp = this.spiked,
          th = this.thr || this.g.thresh, tr = this.trace, td = this.dtF ? this.td : params.traceDecay;   // (v15: own thresholds if adaptive)
    if (this.cg) this.chunkGateStep(syn, null);
    const L = this.dtF ? this.L : params.leak, slow = this.g.slow, gl = this.dtF ? this.gl : this.g.leak;
    const spk = this.spk; let nSpk = 0;   // v11: list of this substep's spikes (ascending), for event-driven propagation
    for (let i = 0; i < N; i++) {
      let x = v[i] + syn[i] + ext[i];                        // receive_input
      const leak = slow && slow[i] ? gl[i] : L;              // slow-leak (memory) cells keep their own leak
      x = V_REST + (x - V_REST) * leak;                      // update_and_leak
      if (x >= th[i]) { v[i] = V_REST; sp[i] = 1; spk[nSpk++] = i; tr[i] = tr[i] * td + 1; }
      else { sp[i] = 0; v[i] = x < V_FLOOR ? V_FLOOR : x; tr[i] = tr[i] * td; }
      syn[i] = 0;
    }
    this.spikeCount += nSpk; this.nSpk = nSpk;
    if ((params.sfa > 0 || params.stdU > 0) && !(params.fatGen > 0 && params.plasticity)) this.fatigue(spk, nSpk, syn, this.fDense ? null : this.mk);   // R81 firing fatigue (off by default)
    const start = this.start, posts = this.posts, ws = this.ws;
    if (this.rcv) this.propagateRcv(spk, nSpk);   // v13 receiver-pool mechanisms (off by default)
    else for (let s = 0; s < nSpk; s++) { const i = spk[s];
      for (let k = start[i], e = start[i + 1]; k < e; k++) syn[posts[k]] += ws[k];
    }
    if (this.rhList && params.plasticity) { const L = this.rhList, h = this.p.rcvHomeo, r0 = this.p.rcvRate, thr = this.thr; for (let q = 0; q < L.length; q++) { const i = L[q]; thr[i] += h * (sp[i] - r0); } }
    if (this.hhList || this.riId) this.sparseStep(sp, spk, nSpk, null);   // R67
    if (this.dc) this.denseStep(sp, null);
    if (this.anList) { if (this.p.actNoise > 0) this.actNoiseStep(); if (this.p.actFb > 0 || this.p.outInh > 0) this.actLoop(sp); }   // v20 exploration noise of the action channels
    if (this.mixPre) { let n = 0; for (let s = 0; s < nSpk; s++) n += this.mixPre[spk[s]];   // v14: feedforward inhibition of mixing cells
      if (n) { const d = this.mixInhD * n, ml = this.mixList; if (this.mlS) { const S = this.mlS, P = this.mlP, D = this.mlD; for (let s = 0; s < nSpk; s++) { const i = spk[s]; for (let k = S[i], e = S[i + 1]; k < e; k++) syn[P[k]] -= D[k]; } } else for (let q = 0; q < ml.length; q++) syn[ml[q]] -= d;
        if (this.ng) { const A = this.ng.act; for (let q = 0; q < A.length; q++) syn[A[q]] -= d; } } }   // v28: new cells join the layer's feedforward inhibition
    if (this.ng && this.ng.act.length && params.plasticity) { const A = this.ng.act, h = this.p.mixHomeo > 0 ? this.p.mixHomeo : 0.5, r0 = this.p.mixRate || 0.008, thr = this.thr;   // v28: intrinsic homeostasis of new cells
      for (let q = 0; q < A.length; q++) { const i = A[q]; thr[i] += h * (sp[i] - r0); } }
    if (this.mxStart && params.plasticity) {   // v15 learned mixing (unsupervised competitive rule + homeostatic threshold)
      const mx = this.g.mix; if (this.p.mixLr > 0) for (let s = 0; s < nSpk; s++) if (mx[spk[s]]) this.mixLearn(spk[s]);
      if (this.thr && !this.mixFrozen()) { const ml = this.mxList, hr = this.p.mixHomeo, r0 = this.p.mixRate, thr = this.thr; for (let q = 0; q < ml.length; q++) { const i = ml[q]; thr[i] += hr * (sp[i] - r0); } } }
    if (this.gd) this.granDemandDrive(spk, nSpk, syn, null);   // R102: demand-grown claws (no-op unless P.granDemand grew this brain)
    if (this.gu) this.guDrive(spk, nSpk, syn, null);
    if (this.g.gran) this.granInh(spk, nSpk, syn, null);   // R83 granule feedforward inhibition
    if (this.ng) this.needTrace(spk, nSpk);   // v28 need-growth source traces
    if (this.teachTr) {                     // teacher events: smoothed drive from sensory (input) neurons
      const drv = this.drv, nIn = this.g.nIn, tT = this.teachTr, thr = this.p.teachThr, q7 = this.dtF ? this.t7 : 0.7;
      const TL = this.tgtList, nL = TL ? TL.length : N - nIn, plat = this.plat;
      if (TL) { const Z = this.tgtZero; for (let q = 0; q < Z.length; q++) drv[Z[q]] = 0; } else drv.fill(0);
      for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (i >= nIn) break; if (this.instrIn && !this.instrIn[i]) continue; for (let k = start[i], e = start[i + 1]; k < e; k++) if (ws[k] > 0) drv[posts[k]] += ws[k]; }
      for (let q = 0; q < nL; q++) { const i = TL ? TL[q] : nIn + q; tT[i] = tT[i] * q7 + drv[i]; if (plat[i] > 0) plat[i]--;
        if (tT[i] >= thr && this.armed[i]) { this.plat[i] = this.p.plateau; this.armed[i] = 0; if (this.ng && this.ng.pred && this.ng.rcv[i]) this.ng.on.push(i); if (this.trust && this.trustT < 0 && this.trustRecv[i]) this.trustT = this.p.trustDelay; }
        else if (tT[i] < thr / 2) { if (this.ahp && !this.armed[i] && this.ahpRecv[i]) this.ahp[i] = this.p.teachAHPDur; this.armed[i] = 1; } }
      if (this.ng && this.ng.on.length) this.needMiss();
      if (this.ahp) { const ah = this.ahp, d = this.p.teachAHP; for (let q = 0; q < nL; q++) { const i = TL ? TL[q] : nIn + q; if (ah[i] > 0) { syn[i] -= d; ah[i]--; } } }   // v16 post-teacher afterhyperpolarisation
      if (this.trust && this.trustT >= 0 && this.trustT-- === 0) this.updateTrust();
    }
    for (let c = 0; c < this.nCh; c++) { const s = this.chSrc[c]; for (let q = 0; q < s.length; q++) this.chSpikes[c] += sp[s[q]]; }
    if (this.learning || this.use) this.stdp();
  }
  buildEl(isEl) {                            // R66: outgoing / incoming eligibility synapses of every cell (CSR order), with the other end
    const N = this.N, st = this.start, P = this.posts, inS = this.inStart, inE = this.inEdges, pres = this.pres;
    const oS = new Int32Array(N + 1), oK = [], iS = new Int32Array(N + 1), iK = [];
    for (let i = 0; i < N; i++) { oS[i] = oK.length; for (let k = st[i], e = st[i + 1]; k < e; k++) if (isEl[k]) oK.push(k);
      iS[i] = iK.length; for (let q = inS[i], e = inS[i + 1]; q < e; q++) if (isEl[inE[q]]) iK.push(inE[q]); }
    oS[N] = oK.length; iS[N] = iK.length;
    this.elO = { isEl, s: oS, k: Int32Array.from(oK), p: Int32Array.from(oK, k => P[k]) }; this.elI = { s: iS, k: Int32Array.from(iK), p: Int32Array.from(iK, k => pres[k]) };
  }
  stdp() {
    const N = this.N, sp = this.spiked, xPre = this.xPre, xPost = this.xPost, el = this.elig, use = this.use;
    const learn = this.learning, pl = this.plastic, dE = this.dElig, dE2 = this.dElig2;
    if (dE2 && !this.elig2) this.elig2 = new Float32Array(el.length); const el2 = this.elig2;
    const teach = !!this.teachTr && !(this.uni && this.eOn), spk = this.spk, nSpk = this.nSpk;   // v22 unified rule: eligibility traces kept (for dopamine-learning receivers)
    const lz = this.uni && this.eOn && learn, isEl = this.uni ? this.isE : this.isPlastic;   // v22 unified rule: LAZY eligibility decay (each trace is decayed when it is touched; same values, far fewer operations)
    if (lz) { if (!this.eT) { this.eT = new Int32Array(el.length); this.eSub = 0; this.ePow = new Float32Array(8192); for (let n = 0; n < 8192; n++) this.ePow[n] = Math.pow(dE, n); if (dE2) { this.ePow2 = new Float32Array(8192); for (let n = 0; n < 8192; n++) this.ePow2[n] = Math.pow(dE2, n); } } this.eSub++; }
    const eT = this.eT, eS = this.eSub, eP = this.ePow, eP2 = this.ePow2;   // (R65: the lazy decay eAt(k) is inlined where it is used)
    if (learn && !teach && !lz) for (let q = 0; q < pl.length; q++) { el[pl[q]] *= dE; if (el2) el2[pl[q]] *= dE2; }     // eligibility decays (the teacher rule never uses it: all 0)
    const start = this.start, posts = this.posts, pres = this.pres, isP = this.isPlastic,
          inS = this.inStart, inE = this.inEdges, aM = this.p.aMinus;
    if (learn && this.teachTr) {             // teacher-gated rule: a spike during a teacher plateau potentiates
      const lr0 = this.p.lr * (this.uni ? this.p.uniI : 1), lr = lr0, ws = this.ws, wMax = params.wMax, dirty = this.dirtyList, nd = this.normDirty, xT = this.xLag || xPre, mE = this.metaE, mN = this.p.metaN, mC = this.p.metaCap || 0, tro = this.ng ? this.ng.tro : null;
      const pe = this.p.predErr || 0;   // R41 predErr (0 = off): prediction-MISMATCH depression. A taught cell that fires with no teacher plateau
      // predicted an input that did not arrive: its recently active plastic inputs are depressed by predErr*lr*x (local, cerebellar-LTD-like).
      // With the plateau potentiation this makes a sign-balanced, error-driven local delta rule: the cell learns to predict its own next input.
      // R47 peMode (bitmask, 0 = R41 rule): 1 soft-bound LTD (dw proportional to w / wMax), 2 depressed inputs are re-normalised by preNorm
      // (heterosynaptic balance: depression redistributes a fixed presynaptic budget instead of removing it), 4 one depression per
      // prediction (only the first unconfirmed spike of an armed cycle; re-armed by the next teacher plateau), 8 surprise-scaled: dw x (1 - c)
      // with c the cell's own running confirmation rate (confident cells that were usually right are barely depressed by one miss).
      // R53 peMode 16 hybrid LTD: dw = g x (peFix + (1 - peFix) w / wMax), a small fixed-size part plus a weight-proportional part (overrides bit 1)
      const pm = this.p.peMode || 0, PD = globalThis.__peDbg, pf = this.p.peFix || 0, xg = this.fastE ? (this.xLag ? this.xG : this.pG) : 1;   // (R66 fast engine: traces are stored scaled, true value = stored x factor)
      // R71 fanRef (global param, 0/undefined = off, bit-identical): fan-in-normalised learning rate. A taught cell with n > fanRef plastic
      // inputs learns at lr x fanRef / n, so the drive one teacher plateau adds stays the same when a bigger source region gives it more inputs
      // (homeostatic synaptic scaling of the plastic total; local: each cell only needs its own input count).
      const tF = (params.trophic & 2) ? (this.trF || this.trophicS()) : null;   // R73 trophic bit 2: the learning step of a synapse x 1 / (size factor of its presynaptic region)
      const fR = params.fanRef > 0 ? params.fanRef : 0; if (fR && (!this.lrF || this.lrFR !== fR)) this.lrF = this.fanLrF(fR); const lF = fR ? this.lrF : ((params.trophic & 8) || params.scaleInvariant > 0) ? (this.lrF8 || this.fanEqF()) : null;   // (R74 bit 8 when fanRef is off; enabled by scaleInvariant)
      if (pe > 0 && (pm & 4) && !this.peDone) this.peDone = new Uint8Array(N);
      if (pe > 0 && (pm & 8) && !this.peConf) this.peConf = new Float32Array(N).fill(0.5);
      const ipS = this.ipStart, ipK = this.ipK, ipP = this.ipPre, w0 = this.w0, plat = this.plat;
      const gX = this.g.gran && params.granLr > 0 ? this.g.gran : null;   // R83b: granule -> prediction synapses learn only by the cerebellar rule (granStep)
      if (gX) this.granStep(xT, xg, plat);
      if (pe > 0) for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (i < this.g.nIn) continue;
        if (this.plat[i] > 0) { if (this.peConf) this.peConf[i] += 0.02 * (1 - this.peConf[i]); if (this.peDone) this.peDone[i] = 0; continue; }
        if (!this.armed[i]) continue;
        if (this.peDone) { if (this.peDone[i]) continue; this.peDone[i] = 1; }
        let g = pe * lr * (lF ? lF[i] : 1); if (this.peConf) { g *= 1 - this.peConf[i]; this.peConf[i] *= 0.98; }
        if (ipS) { for (let q = ipS[i], e = ipS[i + 1]; q < e; q++) { const j = ipP[q], x = xT[j] * xg; if (x < 0.01) continue; const k = ipK[q];
          const d = Math.min(ws[k], g * x * ((pm & 16) ? pf + (1 - pf) * ws[k] / wMax : (pm & 1) ? ws[k] / wMax : 1)); ws[k] -= d; if (PD) { PD.d += d; PD.n++; }
          if ((pm & 2) && !nd[j]) { nd[j] = 1; dirty.push(j); } } continue; }
        for (let q = inS[i], e = inS[i + 1]; q < e; q++) { const k = inE[q]; if (!isP[k] || this.w0[k] <= 0) continue; const x = xT[pres[k]] * xg; if (x < 0.01) continue;
          const d = Math.min(ws[k], g * x * ((pm & 16) ? pf + (1 - pf) * ws[k] / wMax : (pm & 1) ? ws[k] / wMax : 1)); ws[k] -= d; if (PD) { PD.d += d; PD.n++; }
          if ((pm & 2) && !nd[pres[k]]) { nd[pres[k]] = 1; dirty.push(pres[k]); } } }
      // R78c actRef (global param, 0/undefined = off, bit-identical): per taught cell and per presynaptic class (region x cell type),
      // the step of each active input x min(1, actRef / (active inputs of that class at this plateau)): every input population adds
      // at most the drive of actRef active cells per teacher event, so a population that grows with brain size (the current-symbol
      // conjunctions C onto P) does not swamp a sparse informative one (the context-mixing cells).
      const aR = params.actRef > 0 ? params.actRef : 0, aC = aR ? (this.actCls || this.actClsF()) : null, aN = aR ? (this.actN || (this.actN = new Float32Array(this.actNC))) : null;
      const dL = this.p.deltaLr > 0 ? this.p.deltaLr : 0;   // R82 delta rule (pl.deltaLr, 0/undefined = off, bit-identical off): see deltaStep()
      if (dL) this.deltaStep(dL, xT, xg, lF, plat, spk, nSpk);
      if (dL && !this.p.deltaKeep) {}   // (delta replaces the per-spike plateau potentiation unless pl.deltaKeep=1)
      else if (ipS) for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (plat[i] <= 0) continue; const lr = lF ? lr0 * lF[i] : lr0;
        if (aR) { aN.fill(0); for (let q = ipS[i], e = ipS[i + 1]; q < e; q++) { const j = ipP[q]; if (xT[j] * xg >= 0.01) aN[aC[j]]++; } for (let c = 0; c < aN.length; c++) aN[c] = aN[c] > aR ? aR / aN[c] : 1; }
        for (let q = ipS[i], e = ipS[i + 1]; q < e; q++) { const j = ipP[q], x = xT[j] * xg; if (x < 0.01 || (gX && gX[j])) continue; const k = ipK[q];
          const lx = (tF ? lr * x * tF[j] : lr * x) * (aR ? aN[aC[j]] : 1);
          if (mE) { const d = lx; ws[k] = Math.min(wMax, ws[k] + d * mN / (mN + mE[j])); mE[j] += d; if (mC > 0 && mE[j] > mC) mE[j] = mC; }
          else ws[k] = Math.min(wMax, ws[k] + lx);
          if (PD) PD.p += lr * x;
          if (tro) tro[j] += lr * x;
          if (!nd[j]) { nd[j] = 1; dirty.push(j); } } }
      else for (let s = 0; s < nSpk; s++) { const i = spk[s]; if (this.plat[i] <= 0) continue; const lr = lF ? lr0 * lF[i] : lr0;
        if (aR) { aN.fill(0); for (let q = inS[i], e = inS[i + 1]; q < e; q++) { const k = inE[q]; if (isP[k] && this.w0[k] > 0 && xT[pres[k]] * xg >= 0.01) aN[aC[pres[k]]]++; } for (let c = 0; c < aN.length; c++) aN[c] = aN[c] > aR ? aR / aN[c] : 1; }
        for (let q = inS[i], e = inS[i + 1]; q < e; q++) { const k = inE[q]; if (!isP[k] || this.w0[k] <= 0) continue; const x = xT[pres[k]] * xg; if (x < 0.01 || (gX && gX[pres[k]])) continue;
          const lx = (tF ? lr * x * tF[pres[k]] : lr * x) * (aR ? aN[aC[pres[k]]] : 1);
          if (mE) { const j = pres[k], d = lx; ws[k] = Math.min(wMax, ws[k] + d * mN / (mN + mE[j])); mE[j] += d; if (mC > 0 && mE[j] > mC) mE[j] = mC; }   // R62 metaCap > 0: consolidation stops at metaCap (learning-rate floor lr mN / (mN + metaCap))
          else ws[k] = Math.min(wMax, ws[k] + lx);
          if (globalThis.__peDbg) globalThis.__peDbg.p += lr * x;
          if (tro) tro[pres[k]] += lr * x;
          if (!nd[pres[k]]) { nd[pres[k]] = 1; dirty.push(pres[k]); } } }
      if (this.p.preNorm > 0) for (let q = 0; q < dirty.length; q++) this.normPre(dirty[q]);
      for (let q = 0; q < dirty.length; q++) nd[dirty[q]] = 0; dirty.length = 0;
    }
    const gPr = this.fastE ? this.pG : 1, gPo = this.fastE ? this.qG : 1;
    if (learn && !teach && !use && this.fast) {   // R66 (bit-identical): the same updates over per-cell lists of the eligibility synapses only
      if (!this.elO || this.elO.isEl !== isEl) this.buildEl(isEl);
      const oS = this.elO.s, oK = this.elO.k, oP = this.elO.p, iS = this.elI.s, iK = this.elI.k, iP = this.elI.p;
      for (let s = 0; s < nSpk; s++) { const i = spk[s];
        for (let q = oS[i], e = oS[i + 1]; q < e; q++) { const k = oK[q]; if (lz) { const n = eS - eT[k]; eT[k] = eS; if (el2) el2[k] *= n < 8192 ? eP2[n] : 0; el[k] *= n < 8192 ? eP[n] : 0; }
          const d = aM * xPost[oP[q]] * gPo; el[k] -= d; if (el2) el2[k] -= d; }
        for (let q = iS[i], e = iS[i + 1]; q < e; q++) { const k = iK[q], x = xPre[iP[q]] * gPr;
          if (lz) { const n = eS - eT[k]; eT[k] = eS; if (el2) el2[k] *= n < 8192 ? eP2[n] : 0; el[k] *= n < 8192 ? eP[n] : 0; } el[k] += x; if (el2) el2[k] += x; } } }
    else if ((learn && !teach) || use) for (let s = 0; s < nSpk; s++) { const i = spk[s];   // (teacher rule without pruning: nothing to do here)
      if (learn && !teach) for (let k = start[i], e = start[i + 1]; k < e; k++)    // i is PRE: post fired earlier -> depress
        if (isEl[k]) { if (lz) { const n = eS - eT[k]; eT[k] = eS; if (el2) el2[k] *= n < 8192 ? eP2[n] : 0; el[k] *= n < 8192 ? eP[n] : 0; }   // (= eAt(k), inlined)
          const d = aM * xPost[posts[k]] * gPo; el[k] -= d; if (el2) el2[k] -= d; }
      for (let q = inS[i], e = inS[i + 1]; q < e; q++) {      // i is POST: pre fired earlier -> potentiate
        const k = inE[q], x = xPre[pres[k]] * gPr;
        if (learn && isEl[k] && !teach) { if (lz) { const n = eS - eT[k]; eT[k] = eS; if (el2) el2[k] *= n < 8192 ? eP2[n] : 0; el[k] *= n < 8192 ? eP[n] : 0; } el[k] += x; if (el2) el2[k] += x; }
        if (use) use[k] += x;
      }
    }
    const dPre = this.dPre, dPost = this.dPost;
    if (this.fastE) return this.tracesFast();
    if (this.xLag && this.fast && !this.trNeedPre && !this.trNeedPost) {   // R65: only the lagged trace is read; the lag line keeps spike LISTS
      // (exact: a cell that spiked preLag substeps ago gets x*d + 1 from its saved pre-decay value, every other cell x*d = x*d + 0, as before)
      const xL = this.xLag, P = this.p.preLag, slot = this.lagPos;
      if (!this.lagL) { this.lagL = Array.from({ length: P }, () => new Int32Array(N)); this.lagN = new Int32Array(P); this.lagSv = new Float64Array(N); }
      const Ls = this.lagL[slot], nL = this.lagN[slot], sv = this.lagSv;
      for (let q = 0; q < nL; q++) sv[q] = xL[Ls[q]];
      for (let i = 0; i < N; i++) xL[i] = xL[i] * dPre;
      for (let q = 0; q < nL; q++) xL[Ls[q]] = sv[q] * dPre + 1;
      for (let q = 0; q < nSpk; q++) Ls[q] = spk[q]; this.lagN[slot] = nSpk; this.lagPos = (slot + 1) % P; }
    else if (this.xLag) { const xL = this.xLag, lb = this.lagBuf, o = this.lagPos * N;   // pre trace of spikes older than preLag substeps (perf: fused with the pre/post trace loop, same per-element arithmetic)
      for (let i = 0; i < N; i++) { const si = sp[i]; xPre[i] = xPre[i] * dPre + si; xPost[i] = xPost[i] * dPost + si; xL[i] = xL[i] * dPre + lb[o + i]; lb[o + i] = si; } this.lagPos = (this.lagPos + 1) % this.p.preLag; }
    else for (let i = 0; i < N; i++) { xPre[i] = xPre[i] * dPre + sp[i]; xPost[i] = xPost[i] * dPost + sp[i]; }
  }
  // Called once per tick by the Agent with this tick's reward events
  // (pos = good, e.g. food / correct; neg = bad, e.g. poison / wrong; bump = small pain, e.g. wall contact).
  modulate(food, poison, bump, outcome) {
    const mods = this.mods;
    if (this.crit) {                         // v20: dopamine = reward prediction error (one global signal)
      const ch = this.chs[0], rw = ch.gFood * food - ch.gPoison * poison - ch.gWall * bump, d = this.p.rpeGain * this.criticStep(rw, outcome);
      if (this.ng && !this.ng.pred && (rw !== 0 || outcome)) this.needEvent(this.p.ngFail > 0 ? (outcome ? (rw > 0 ? 0 : 1) : (rw < 0 ? 1 : 0)) : Math.min(1, Math.max(0, -this.delta)));   // R40 ngFail: raw failure (no surprise needed)   // v28 need-growth: negative outcome RPE
      for (let c = 0; c < this.nCh; c++) { mods[c] = mods[c] * this.dMods[c] + d; this.chSpikes[c] = 0; }
    } else
    for (let c = 0; c < this.nCh; c++) {
      const ch = this.chs[c];
      mods[c] = mods[c] * this.dMods[c] + ch.gFood * food - ch.gPoison * poison - ch.gWall * bump + ch.gSpike * this.chSpikes[c];
      this.chSpikes[c] = 0;
    }
    this.mod = mods[0]; this.dwSum = 0; this.tickNo++;
    if (this.stg && params.plasticity) this.stageStep();   // R65 staged maturation
    if (this.use && this.tickNo === this.pruning.tick) this.prune();
    if (!this.learning || (this.teachTr && !(this.uni && this.eOn))) return;   // (teacher rule: the eligibility traces stay 0, so w += lr*M*0 changes nothing)
    const lr = this.p.lr, pl = this.uni ? this.eList : this.plastic, el = this.elig, ws = this.ws, w0 = this.w0, wMax = params.wMax, sc = this.synCh;
    const eT = this.eT, eS = this.eSub, eP = this.ePow, eP2 = this.ePow2, el2 = this.elig2, mx = el2 ? this.p.eligMix : 0, tro = this.ng ? this.ng.tro : null;
    const gm = el2 ? this.p.eligGate : 0; let gI = mx;
    if (gm === 2) { if (outcome) { this.oIsi = this.tickNo - (this.lastOut || 0); this.lastOut = this.tickNo; } const T = this.p.eligGateT, d = (this.oIsi || T) - T; gI = 1 / (1 + Math.exp(d / (0.2 * T + 0.5))); }   // short outcome intervals -> fast tag, long -> slow tag
    // R71 fanRefR (global param, 0/undefined = off): fan-in-normalised rate for the reward / unified rule (the teacher rule uses fanRef):
    // a receiver with n > fanRefR plastic inputs learns at lr x fanRefR / n (per receiver; n counted once over this rule's plastic list).
    const fRR = params.fanRefR > 0 ? params.fanRefR : 0; if (fRR && (!this.lrFr || this.lrFRR !== fRR)) { const f = new Float32Array(this.N), ps = this.posts; for (let q = 0; q < pl.length; q++) f[ps[pl[q]]]++; for (let i = 0; i < this.N; i++) f[i] = f[i] > fRR ? fRR / f[i] : 1; this.lrFr = f; this.lrFRR = fRR; }
    if (!fRR && ((params.trophic & 16) || params.scaleInvariant > 0) && !this.lrF16) { const t = this.trF || this.trophicS(), n = new Float32Array(this.N), e1 = new Float32Array(this.N), ps = this.posts, pr = this.pres; for (let q = 0; q < pl.length; q++) { n[ps[pl[q]]]++; e1[ps[pl[q]]] += t[pr[pl[q]]]; } for (let i = 0; i < this.N; i++) n[i] = n[i] > 0 && e1[i] < n[i] ? e1[i] / n[i] : 1; this.lrF16 = n; }   // R74 trophic bit 16: reward-rule step x min(1, 1x-equivalent fan-in / fan-in) per receiver
    const lFr = fRR ? this.lrFr : ((params.trophic & 16) || params.scaleInvariant > 0) ? this.lrF16 : null, pst = this.posts, tFr = (params.trophic & 2) ? (this.trF || this.trophicS()) : null;
    let s = 0;
    for (let q = 0; q < pl.length; q++) {
      const k = pl[q], m = mods[sc[k]]; if (m === 0) continue;
      if (this.prunedMask && this.prunedMask[k]) continue;   // pruned
      const old = ws[k];
      let e = el[k]; if (eT) { const n = eS - eT[k]; eT[k] = eS; e = el[k] = n < 8192 ? e * eP[n] : 0; if (el2) el2[k] = n < 8192 ? el2[k] * eP2[n] : 0; }   // v22 lazy eligibility decay
      if (el2) { let g = mx;   // v31 dual-timescale: slow (tauElig) and fast (tauElig2) tags, mixed
        if (gm === 1) { const a = Math.abs(e); g = a > 1e-9 ? Math.min(1, Math.abs(el2[k]) / a) : 0; }   // R35 gate 1: the synapse's own recency (fast/slow tag ratio)
        else if (gm === 2) g = gI;                                                                        // R35 gate 2: outcome timing (interval since the previous outcome)
        e = (1 - g) * e + g * el2[k]; }
      let w = old + (lFr ? lr * lFr[pst[k]] : lr) * (tFr ? tFr[this.pres[k]] : 1) * m * e;   // (R73 trophic bit 2)
      if (w0[k] > 0) w = w < 0 ? 0 : w > wMax ? wMax : w;    // sign preserved
      else w = w > 0 ? 0 : w < -wMax ? -wMax : w;
      ws[k] = w; s += Math.abs(w - old);
      if (tro && w0[k] > 0 && w > old) tro[this.pres[k]] += w - old;
    }
    // v31 (R33) eligUse (0..1, 0 = off): an outcome CONSUMES the eligibility tags it acted on (tag capture): traces shrink by
    // eligUse at every outcome event, so the credit of one choice does not spill into the next trial's outcome.
    if (outcome && this.p.eligUse > 0) { const f = 1 - this.p.eligUse;
      for (let q = 0; q < pl.length; q++) { const k = pl[q]; if (eT) { const n = eS - eT[k]; eT[k] = eS; el[k] = n < 8192 ? el[k] * eP[n] : 0; if (el2) el2[k] = n < 8192 ? el2[k] * eP2[n] : 0; } el[k] *= f; if (el2) el2[k] *= f; } }
    if (this.p.preNorm > 0 && s > 0) { if (!this.npStart) this.buildNp(); for (let i = 0; i < this.N; i++) if (this.npStart[i + 1] > this.npStart[i]) this.normPre(i); }   // v20: competition between targets
    // R72 postCap (global param, 0/undefined = off): postsynaptic scaling. preNorm gives every presynaptic cell the same outgoing budget, so a
    // receiver's plastic total grows with the number of cells projecting to it (a 4x cortex: ~5x the corticostriatal weight, R72). With postCap > 0
    // a receiver whose excitatory plastic inputs of this rule sum to more than postCap is scaled down to postCap (homeostatic synaptic scaling).
    // postCapRel > 0 instead: the cap is postCapRel x the receiver's own genome (birth) total of those inputs (scale-free).
    if ((params.postCap > 0 || params.postCapRel > 0 || params.scaleInvariant > 0) && s > 0) { if (!this.pcStart) this.buildPc(pl); const st = this.pcStart, ix = this.pcIdx, c0 = this.pcW0, rel = params.postCapRel > 0 ? params.postCapRel : params.scaleInvariant > 0 ? 1.5 : 0, pN = params.postN > 0 ? params.postN : 0;   // postN: only receivers with more than postN such inputs are capped (1x-sized receivers stay untouched)
      const rb = ((params.recvBudget & 2) || params.scaleInvariant > 0) ? (this.rbScaled || (this.rbScaled = this.scaledRecv(st, ix))) : null;   // R76 recvBudget bit 2: only receivers with inputs from a sized region are capped (replaces the postN cutoff; exactly neutral at 1x)
      for (let r = 0, R = st.length - 1; r < R; r++) { if (rb ? !rb[r] : (pN && st[r + 1] - st[r] <= pN)) continue; const cap = rel ? rel * c0[r] : params.postCap; let t = 0; for (let q = st[r]; q < st[r + 1]; q++) t += ws[ix[q]]; if (t > cap) { const f = cap / t; for (let q = st[r]; q < st[r + 1]; q++) ws[ix[q]] *= f; } } }
    this.dwSum = s;
  }
  prune() {
    const min = this.pruning.min, use = this.use, ws = this.ws; let n = 0;
    for (let k = 0; k < ws.length; k++) if (use[k] < min) { ws[k] = 0; this.prunedMask[k] = 1; n++; }
    this.pruned = n;
  }
  // Total |w - w_genome| over all synapses: how far learning has moved this brain.
  drift() { let s = 0; for (let k = 0; k < this.ws.length; k++) s += Math.abs(this.ws[k] - this.w0[k]); return s; }
  // Smoothed firing rate of a neuron in [0,1] (spikes per substep)
  rate(i) { const td = this.dtF ? this.td : params.traceDecay; return this.fastE ? this.trS[i] * this.trG * (1 - td) : this.trace[i] * (1 - td); }
}
Object.assign(SpikingArena, { SpikingNet });

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

/* =====================================================================
 * agent.js — one brain living in one environment episode.
 * Every tick:  task.sense(ext)  -> input currents (encoders)
 *              output bias       -> ext of the output cells (spec)
 *              substeps x net.step()
 *              out.rates / out.spikes -> task.act(out) (decoders) -> reward events
 *              net.modulate(pos, neg, pain)  (dopamine for lifetime learning)
 * ===================================================================== */
'use strict';
const NO_EVENTS = { pos: 0, neg: 0, pain: 0 };
class Agent {
  // brain (optional): an already grown network for this genome (e.g. grown with another noise seed)
  // env (optional): { id, def, P, spec } from currentEnv(); default = the current environment
  constructor(genome, seed, brain, env) {
    this.env = env || currentEnv(); this.seed = seed >>> 0;
    this.task = this.env.def.create(this.seed, this.env.P, this.env.spec);
    this.setBrain(genome, brain);
  }
  setBrain(genome, brain) {
    this.genome = genome; this.brain = brain || phenotype(genome, this.env.spec); const S = params.lifeSub > 0 ? params.lifeSub : params.substeps;   // R68 lifeSub: substeps per tick in the life only (growth keeps params.substeps); dtRescale 1: the dynamics rescaled to the coarser step
    this.dtF = params.dtRescale > 0 && S !== params.substeps ? params.substeps / S : 0;
    this.net = this.dtF ? new SpikingNet(this.brain, { dt: this.dtF }) : new SpikingNet(this.brain);
    const n = this.brain.nOut; this.out = { rates: new Float64Array(n), spikes: new Uint16Array(n), input: new Float64Array(n) };   // input (v13): synaptic input summed over the tick (graded decoders)
  }
  get world() { return this.task; }          // (the bug arena's World; kept for older scripts)
  get t() { return this.task.t; }
  get done() { return this.task.done; }
  get fitness() { return this.task.fitness(); }
  // onSubstep(net) is an optional hook (used by the UI for raster plots)
  tick(onSubstep) {
    const net = this.net, ext = net.ext, g = this.brain, OUT = this.env.spec.outputs, o0 = g.nIn + g.nHid, nOut = g.nOut;
    const sp = this.out.spikes, rates = this.out.rates, inp = this.out.input;
    ext.fill(0);
    this.task.sense(ext, this);
    for (let m = 0; m < nOut; m++) { ext[o0 + m] = OUT[m].bias; sp[m] = 0; inp[m] = 0; }
    if (this.dtF) { const f = this.dtF; for (let i = 0; i < ext.length; i++) ext[i] *= f; }   // (input currents are mV per substep)
    for (let s = 0, S = params.lifeSub > 0 ? params.lifeSub : params.substeps; s < S; s++) {
      net.step();
      for (let m = 0; m < nOut; m++) { sp[m] += net.spiked[o0 + m]; inp[m] += net.syn[o0 + m]; }
      if (onSubstep) onSubstep(net);
    }
    for (let m = 0; m < nOut; m++) rates[m] = net.rate(o0 + m);
    const ev = this.task.act(this.out, this) || NO_EVENTS;
    net.modulate(ev.pos || 0, ev.neg || 0, ev.pain || 0, !!ev.outcome);
    return ev.reward || 0;
  }
}
// Run one whole episode; returns the agent (task holds the stats).
function runEpisode(genome, seed, brain, env, maxTicks) {
  const a = new Agent(genome, seed, brain, env); let n = 0;
  while (!a.done && n++ < (maxTicks || 1e7)) a.tick();
  return a;
}
const Sim = Agent;   // old name
Object.assign(SpikingArena, { Agent, Sim, runEpisode });

'use strict';
/* ---------------- evolve.js: Evolution (robust-growth fitness) ----------------
 * One generation =
 *   (a) every genome is GROWN `growths` times with different developmental-noise
 *       seeds (shared by the whole generation, fresh every generation), and each
 *       grown brain lives `episodes` episodes of the current environment. All genomes
 *       see the same seeds and episodes (fair comparison).
 *       fitness = mean over growths - robustW x std over growths
 *       (growths = 1: grown once with the genome's own seed, the old behaviour).
 *   (b) VALIDATION: the top `valTopK` genomes + the current champion are regrown
 *       with `valGrowths` FIXED held-out noise seeds and scored on FIXED held-out
 *       arenas (valArenas in total). Same robust formula. The best becomes/stays the
 *       CHAMPION; its regrowth spread (min / mean / max) is kept for the UI.
 *   (c) breed: elites (incl. the champion) copied unchanged, the rest are
 *       tournament-selected parents (+ optional crossover) + mutation.          */
const VAL_SEED = 900001, VAL_GROW_SEED = 700001;
function newRandomGenome(r) {
  r = r || Math.random;
  return params.cellStart === 'random' ? createRandomCellGenome(r) : mutateCell(planFor(params.cellStart).make(), r);
}
function mutate(g, r) { return mutateCell(g, r); }
function crossover(a, b, r) { return crossCell(a, b, r); }
function cloneGenome(g) { return cloneCell(g); }
// Combine per-growth mean scores into one fitness.
function robustScore(xs) {
  const n = xs.length, mean = xs.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const min = Math.min(...xs), base = mean - (n > 1 ? params.robustW * sd : 0), w = n > 1 ? params.worstW || 0 : 0;
  return { fit: (1 - w) * base + w * min, mean, sd, min, max: Math.max(...xs) };
}
class Evolution {
  constructor(seed, blank) {
    this.rng = mulberry32(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
    this.gen = 0; this.history = []; this.champion = null;   // champion = { genome, val, gen, spread }
    this.latestBest = null;                                  // best (by training fitness) of the latest generation
    this.pop = [];
    if (!blank) for (let i = 0; i < params.popSize; i++) this.pop.push(newRandomGenome(this.rng));
    this.ticksDone = 0; this.restartGeneration();
  }
  // the environment is fixed for a whole generation (settings changed meanwhile apply from the next one)
  restartGeneration() { this.env = currentEnv(); this.phase = 'pop'; this.idx = 0; this.unit = 0; this.scores = []; this.acc = 0; this.sim = null; this.brain = null; this.valQueue = []; }
  seedWith(g) {
    this.pop = [g]; while (this.pop.length < params.popSize) this.pop.push(mutate(cloneGenome(g), this.rng));
    this.restartGeneration();
  }
  // evaluation plan for the current phase
  plan(val) {
    const G = Math.max(1, val ? params.valGrowths : params.growths) | 0;
    const A = Math.max(1, val ? Math.ceil(params.valArenas / G) : params.episodes) | 0;
    return { G, A };
  }
  growSeed(g, k, val) {
    const G = this.plan(val).G;
    if (G === 1) return g.seed;                          // single growth: the genome's own noise seed
    return val ? VAL_GROW_SEED + k : hashSeed(this.gen + 1, k);
  }
  arenaSeed(k, e, val) { const A = this.plan(val).A; return val ? VAL_SEED + k * A + e : 1000 * this.gen + k * A + e + 1; }
  // Grown brain of genome g with noise seed s (validation growths are cached on the genome).
  grow(g, s, val) {
    const spec = this.env.spec;
    if (g.kind !== 'cell' && g.kind !== 'regions') return phenotype(g, spec);
    if (s === g.seed) return phenotype(g, spec);
    if (!val) return growCell(g, { seed: s, spec });
    if (!g._vg) Object.defineProperty(g, '_vg', { value: {}, writable: true, configurable: true, enumerable: false });
    const key = spec.key.length + ':' + hashStr(spec.key) + ':' + s;
    return g._vg[key] || (g._vg[key] = growCell(g, { seed: s, spec }));
  }
  run(n) {
    let finished = false;
    while (n-- > 0 && !finished) {
      const val = this.phase === 'val', g = val ? this.valQueue[this.idx] : this.pop[this.idx];
      const { G, A } = this.plan(val), k = (this.unit / A) | 0, e = this.unit % A;
      if (!this.sim) {
        if (e === 0) this.brain = this.grow(g, this.growSeed(g, k, val), val);
        this.sim = new Agent(g, this.arenaSeed(k, e, val), this.brain, this.env);
      }
      this.sim.tick(); this.ticksDone++;
      if (!this.sim.done) continue;
      this.acc += this.sim.fitness; this.sim = null; this.unit++;
      if (this.unit % A === 0) { this.scores.push(this.acc / A); this.acc = 0; this.brain = null; }
      if (this.unit < G * A) continue;
      const rs = robustScore(this.scores);
      if (val) { g.val = rs.fit; g.valSpread = { min: rs.min, mean: rs.mean, max: rs.max, sd: rs.sd, n: G }; }
      else { g.fitness = rs.fit; g.fitMean = rs.mean; }
      this.scores = []; this.unit = 0; this.idx++;
      if (!val && this.idx >= this.pop.length) this.startValidation();
      else if (val && this.idx >= this.valQueue.length) { this.finishGeneration(); finished = true; }
    }
    return finished;
  }
  runGeneration() { while (!this.run(10000)); }
  startValidation() {
    const sorted = this.pop.slice().sort((a, b) => b.fitness - a.fitness);
    const q = sorted.slice(0, params.valTopK);
    if (this.champion && !q.includes(this.champion.genome)) q.push(this.champion.genome);  // re-check (params may have changed)
    this.valQueue = q; this.phase = 'val'; this.idx = 0; this.unit = 0; this.scores = []; this.acc = 0; this.sim = null;
  }
  finishGeneration() {
    const r = this.rng, pop = this.pop.slice().sort((a, b) => b.fitness - a.fitness);
    const avg = pop.reduce((s, g) => s + g.fitness, 0) / pop.length;
    this.latestBest = pop[0];
    if (this.champion) { this.champion.val = this.champion.genome.val; this.champion.spread = this.champion.genome.valSpread; }
    for (const g of this.valQueue)
      if (!this.champion || g.val > this.champion.val) this.champion = { genome: g, val: g.val, gen: this.gen, spread: g.valSpread };
    const sp = this.champion.spread || {};
    const hist = { gen: this.gen, best: pop[0].fitness, avg, champ: this.champion.val, cMin: sp.min, cMax: sp.max };
    // environment hook (e.g. a curriculum that lengthens the delay once the champion is good enough)
    if (this.env.def.onGeneration) { const info = this.env.def.onGeneration(this, this.env.P); if (info) hist.env = info; }
    this.history.push(hist);
    const size = params.popSize, nElite = Math.max(1, Math.round(size * params.eliteFrac));
    const tour = () => { let b = pop[(r() * pop.length) | 0]; for (let i = 0; i < 2; i++) { const c = pop[(r() * pop.length) | 0]; if (c.fitness > b.fitness) b = c; } return b; };
    const next = pop.slice(0, Math.min(nElite, pop.length));           // elites: same objects, never mutated
    if (!next.includes(this.champion.genome)) next.unshift(this.champion.genome);
    for (const g of pop) if (g !== this.champion.genome && !next.includes(g) && g._vg) g._vg = null;   // free cached growths
    while (next.length < size) {
      const p = tour();
      const child = (r() < params.crossoverRate) ? crossover(p, tour(), r) : cloneGenome(p);
      next.push(mutate(child, r));
    }
    this.pop = next; this.gen++; this.restartGeneration();
  }
  progress() {
    const P = this.plan(false), V = this.plan(true);
    const popWork = this.pop.length * P.G * P.A, valWork = (params.valTopK + 1) * V.G * V.A;
    const done = this.phase === 'pop' ? this.idx * P.G * P.A + this.unit : popWork + this.idx * V.G * V.A + this.unit;
    return Math.min(1, done / (popWork + valWork));
  }
  /* ----- save / restore a whole session (population + champion + history) ----- */
  toJSON() {
    const env = currentEnv();
    return { format: 'spiking-arena-session/v7', appVersion: SpikingArena.APP_VERSION, defaultsVersion: SpikingArena.DEFAULTS_VERSION, defaultPlan: SpikingArena.defaultPlanId(env), savedAt: new Date().toISOString(), gen: this.gen,
      env: env.id, envParams: Object.assign({}, env.P), params: Object.assign({}, params), history: this.history,
      champion: this.champion ? { val: this.champion.val, gen: this.champion.gen, spread: this.champion.spread || null, genome: genomeToCompact(this.champion.genome) } : null,
      population: this.pop.filter(g => !this.champion || g !== this.champion.genome).map(genomeToCompact) };
  }
  // Accepts v7 sessions, v5/v6 sessions (bug arena) and v1-v4 sessions whose genomes are cellular.
  // Anything else (direct / recipe / mushroom-body genomes) throws LEGACY_MSG.
  static fromJSON(obj, restoreParams) {
    if (typeof obj === 'string') obj = JSON.parse(obj);
    if (!obj || !/^spiking-arena-session\/v[1-7]$/.test(obj.format)) throw new Error('not a spiking-arena session file');
    const all = (obj.population || []).concat(obj.champion ? [obj.champion.genome] : []);
    if (!all.length || all.some(o => !o || (o.kind !== 'cell' && o.kind !== 'regions'))) throw new Error(LEGACY_MSG);
    const v7 = /v7$/.test(obj.format), envId = v7 && ENVS[obj.env] ? obj.env : 'bug';
    if (restoreParams && obj.params) {
      for (const k in obj.params) if (k in params && k !== 'env') params[k] = obj.params[k];
      const ep = v7 ? migrateEnvParams(envId, Object.assign({}, obj.envParams || {})) : migrateBugParams(obj.params);
      if (!/v[567]$/.test(obj.format)) {                // old cellular session: keep its world
        ep.task = 'normal'; params.growths = 1; params.valGrowths = 1; params.episodes = obj.params.episodes || 3;
      }
      setEnv(envId, ep);
    } else if (restoreParams) setEnv(envId);
    const e = new Evolution(null, true);
    e.gen = obj.gen || 0; e.history = obj.history || [];
    e.pop = (obj.population || []).map(genomeFromCompact);
    if (obj.champion) { const g = genomeFromCompact(obj.champion.genome); e.champion = { genome: g, val: obj.champion.val, gen: obj.champion.gen, spread: obj.champion.spread || null }; e.pop.unshift(g); }
    while (e.pop.length < params.popSize) e.pop.push(e.champion ? mutate(cloneGenome(e.champion.genome), e.rng) : newRandomGenome(e.rng));
    e.restartGeneration();
    return e;
  }
}
function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }
Object.assign(SpikingArena, { VAL_SEED, VAL_GROW_SEED, newRandomGenome, mutate, crossover, cloneGenome, robustScore, Evolution });

/* =====================================================================
 * envs/bug.js — environment 'Bug arena' (the original task family).
 * A two-wheeled bug with 9 eyes (wall / green / red per eye), 3 touch (bump)
 * sensors, a tonic neuron and 2 turning sensors; outputs: left wheel, right
 * wheel, speed. Tasks: flash (memory: food visible only in brief flashes),
 * flashvis (control: same arena, food always visible), hard (drifting items
 * + chasing predator), normal (60 still items).
 * Behaviour and sensor placement are identical to v6 (v6 champions regrow and
 * score bit-identically).
 * ===================================================================== */
(function () {
'use strict';
const NUM_EYES = 9, SENSE_TYPES = ['wall', 'food', 'poison'];
const BUMP_NAMES = ['bump_left', 'bump_front', 'bump_right'], GYRO_NAMES = ['gyro_left', 'gyro_right'], MOTOR_NAMES = ['left', 'right', 'speed'];
const TONIC = 27, BUMP0 = 28, GYRO0 = 31, N_INPUT = 33;
const FIXED_CLASSES = ['eye-wall', 'eye-green', 'eye-red', 'tonic', 'bump', 'motor-L', 'motor-R', 'motor-speed', 'gyro'];
const TAG_NAMES = ['wall-eye', 'green-eye', 'red-eye', 'bump', 'motor', 'speed', 'tonic', 'free'];
const SPEED_REF = 1 / 6;   // firing rate of a LIF neuron driven by 3 mV/substep alone (motorBias default)

// IO spec: same channel order, positions, tags and growth order as v6
function bugIO(P) {
  const inputs = [];
  for (let k = 0; k < NUM_EYES; k++) for (let t = 0; t < 3; t++) {
    const x = (k - 4) / 4 * 0.9;
    inputs.push({ name: 'eye' + k + '_' + SENSE_TYPES[t], group: 'eye-' + SENSE_TYPES[t], tag: t, cls: t, pos: [x, 1 - t * 0.03], at: [x, 1],
                  mirror: (8 - k) * 3 + t, midline: k === 4 });
  }
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.85], midline: true, tonic: true });
  for (let j = 0; j < 3; j++) inputs.push({ name: BUMP_NAMES[j], group: 'bump', tag: 3, cls: 4, pos: [(j - 1) * 0.9, 0.7], mirror: j === 1 ? undefined : BUMP0 + 2 - j, midline: j === 1 });
  for (let j = 0; j < 2; j++) inputs.push({ name: GYRO_NAMES[j], group: 'gyro', tag: 8, cls: 8, pos: [j ? 0.6 : -0.6, 0.6], ownRng: true });
  const outputs = [
    { name: 'left', group: 'wheel', tag: 4, cls: 5, pos: [-0.5, -1], bias: P.motorBias, mirror: 1 },
    { name: 'right', group: 'wheel', tag: 4, cls: 6, pos: [0.5, -1], bias: P.motorBias, mirror: 0 },
    { name: 'speed', group: 'speed', tag: 5, cls: 7, pos: [0, -1], bias: P.motorBias }];
  const coneOrder = []; for (let i = 0; i < 27; i++) coneOrder.push(i); coneOrder.push(28, 29, 30, 27, 31, 32);
  const cueSources = []; for (let k = 0; k < NUM_EYES; k++) cueSources.push([(k - 4) / 4 * 0.9, 1]);
  const waves = [0, 1, 2].map(t => Array.from({ length: NUM_EYES }, (_, k) => k * 3 + t));
  return { inputs, outputs, classes: FIXED_CLASSES, tagNames: TAG_NAMES, coneOrder, cueSources,
           juvenile: { waves, waveGain: P.inputGain, tonic: [[TONIC, P.tonicCurrent]], kicks: { chans: [28, 29, 30], p: 0.02, gain: P.bumpGain } } };
}
/* ---------------- the arena ---------------- */
const WORLD_W = 700, WORLD_H = 500, AGENT_R = 10, ITEM_R = 10, TURN_RATE = 0.12;
const EYE_ANGLES = []; for (let k = 0; k < NUM_EYES; k++) EYE_ANGLES.push((k - (NUM_EYES - 1) / 2) * 0.28);
function makeWalls() {
  const w = [], box = (x, y, bw, bh, open) => {
    w.push([x, y, x + bw, y]); w.push([x + bw, y, x + bw, y + bh]);
    w.push([x + bw, y + bh, x, y + bh]); if (!open) w.push([x, y + bh, x, y]);
  };
  box(10, 10, WORLD_W - 20, WORLD_H - 20);
  box(110, 110, 160, 280, true);     // two open boxes (like the ConvNetJS demo)
  box(430, 110, 160, 280, true);
  return w;
}
const WALLS = makeWalls();
const GARDEN = { width: 1120, height: 700, itemCount: 66, walls: [
  [10, 10, 1110, 10], [1110, 10, 1110, 690], [1110, 690, 10, 690], [10, 690, 10, 10],
  [225, 10, 225, 205], [225, 300, 225, 520], [225, 610, 225, 690],
  [535, 10, 535, 115], [535, 210, 535, 415], [535, 520, 535, 690],
  [865, 10, 865, 240], [865, 340, 865, 540], [865, 625, 865, 690],
  [10, 335, 135, 335], [315, 160, 455, 160], [325, 545, 535, 545],
  [535, 285, 705, 285], [705, 285, 705, 420], [625, 535, 780, 535],
  [955, 180, 1110, 180], [865, 465, 1015, 465], [1015, 465, 1015, 545],
] };
function pointSegDist2(px, py, s) {
  const [x1, y1, x2, y2] = s, dx = x2 - x1, dy = y2 - y1;
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy); t = clamp(t, 0, 1);
  const ex = x1 + t * dx - px, ey = y1 + t * dy - py; return ex * ex + ey * ey;
}

// The 'hard' task.
const HARD = { nItems: 30, foodFrac: 0.4, itemSpeed: 0.6, nPredators: 1, predSpeed: 1.6, predRange: 200, caughtCost: 2 };
const PRED_R = 9;
// The 'flash' memory task: food flashes visible for FLASH.on ticks every FLASH.period ticks (own phase).
const FLASH = { nItems: 30, foodFrac: 0.5, on: 8, period: 100 };
class World {
  constructor(seed, P, layout) {
    this.P = P = P || envParams.bug; const params = P;
    this.rng = mulberry32(seed >>> 0);
    this.width = layout ? layout.width : WORLD_W;
    this.height = layout ? layout.height : WORLD_H;
    this.walls = layout ? layout.walls : WALLS; this.items = [];
    this.hard = params.task === 'hard'; this.flash = params.task === 'flash' || params.task === 'flashvis'; this.flashHide = params.task === 'flash';
    this.t = 0; this.food = 0; this.poison = 0; this.caught = 0; this.bumps = 0; this.bumped = 0; this.energy = 0; this.speedSum = 0;
    this.contactTicks = 0; this.stuckTicks = 0;
    this.histX = new Float32Array(30); this.histY = new Float32Array(30);   // positions of the last 30 ticks
    // Items have a COLOUR (1 green, 2 red); eyes see colour. Normally green = food.
    // With randomValence, odd arena seeds swap it: red is food, green is poison.
    this.greenIsFood = this.greenIsFoodAtBirth = !(params.randomValence && (seed & 1));
    this.reversed = false;             // with params.reversal the colours swap halfway through life
    this.foodLog = [];                 // tick of every food (for within-lifetime learning curves)
    this.poisonLog = [];
    this.rewardLog = [];               // [tick, reward] (generic learning read-out)
    this.predators = [];
    const itemCount = layout ? layout.itemCount : this.hard ? HARD.nItems : this.flash ? FLASH.nItems : params.nItems;
    for (let i = 0; i < itemCount; i++) this.items.push(this.spawnItem());
    const a = this.agent = { x: 0, y: 0, angle: 0, wl: 0, wr: 0, speed: 1, eyes: [], contact: [0, 0, 0], stuck: false };
    do { a.x = 20 + this.rng() * (this.width - 40); a.y = 20 + this.rng() * (this.height - 40); } while (this.nearWall(a.x, a.y, 25));
    a.angle = this.rng() * Math.PI * 2;
    if (this.hard) for (let i = 0; i < HARD.nPredators; i++) this.predators.push(this.spawnPredator());
    for (let k = 0; k < NUM_EYES; k++) a.eyes.push({ dist: params.eyeRange, type: -1 });
  }
  nearWall(x, y, r) {
    const distance = r * r;
    for (const wall of this.walls) if (pointSegDist2(x, y, wall) < distance) return true;
    return false;
  }
  spawnItem() {
    let x, y; const r = this.rng;
    do { x = 20 + r() * (this.width - 40); y = 20 + r() * (this.height - 40); } while (this.nearWall(x, y, ITEM_R + 8));
    if (this.flash) { const food = r() < FLASH.foodFrac; return { x, y, type: food === this.greenIsFood ? 1 : 2, phase: (r() * FLASH.period) | 0 }; }
    if (!this.hard) return { x, y, type: r() < 0.5 ? 1 : 2 };   // type = colour: 1 = green, 2 = red
    const food = r() < HARD.foodFrac, ang = r() * Math.PI * 2, v = HARD.itemSpeed * (0.5 + r());
    return { x, y, type: food === this.greenIsFood ? 1 : 2, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v };
  }
  // Predator: placed far from the bug; it looks like poison (the colour that is currently bad).
  spawnPredator() {
    let x, y, n = 0; const r = this.rng, a = this.agent;
    do { x = 20 + r() * (this.width - 40); y = 20 + r() * (this.height - 40); n++; }
    while ((this.nearWall(x, y, PRED_R + 4) || (x - a.x) ** 2 + (y - a.y) ** 2 < 250 * 250) && n < 200);
    return { x, y, angle: r() * Math.PI * 2 };
  }
  predColor() { return this.greenIsFood ? 2 : 1; }
  // Can the eyes see this item now? (flash task: food only during its flash; poison always)
  visible(it) { return !this.flashHide || (it.type === 1) !== this.greenIsFood || (this.t + it.phase) % FLASH.period < FLASH.on; }
  // Hard task: items drift and bounce, the predator chases the bug when it is close.
  stepThings() {
    for (const it of this.items) {
      const nx = it.x + it.vx, ny = it.y + it.vy;
      if (this.nearWall(nx, ny, ITEM_R + 2)) { const ang = this.rng() * Math.PI * 2, v = Math.hypot(it.vx, it.vy); it.vx = Math.cos(ang) * v; it.vy = Math.sin(ang) * v; }
      else { it.x = nx; it.y = ny; }
    }
    const a = this.agent;
    for (const p of this.predators) {
      const dx = a.x - p.x, dy = a.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 < HARD.predRange * HARD.predRange) {                 // chase (turning rate limited)
        let rel = Math.atan2(dy, dx) - p.angle; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        p.angle += clamp(rel, -0.08, 0.08);
      } else p.angle += (this.rng() - 0.5) * 0.3;                 // wander
      const sp = d2 < HARD.predRange * HARD.predRange ? HARD.predSpeed : HARD.predSpeed * 0.5;
      const nx = p.x + Math.cos(p.angle) * sp, ny = p.y + Math.sin(p.angle) * sp;
      if (this.nearWall(nx, ny, PRED_R)) p.angle += Math.PI * (0.5 + this.rng()); else { p.x = nx; p.y = ny; }
    }
  }
  // Cast every eye ray; store nearest hit distance & type (0 wall,1 food,2 poison,-1 none)
  look() {
    const a = this.agent, EYE_RANGE = this.P.eyeRange;
    for (let k = 0; k < NUM_EYES; k++) {
      const ang = a.angle + EYE_ANGLES[k], dx = Math.cos(ang), dy = Math.sin(ang);
      let best = EYE_RANGE, type = -1, target = null;
      for (const s of this.walls) {                 // ray vs segment
        const sx = s[2] - s[0], sy = s[3] - s[1], den = dx * sy - dy * sx;
        if (Math.abs(den) < 1e-9) continue;
        const qx = s[0] - a.x, qy = s[1] - a.y;
        const t = (qx * sy - qy * sx) / den, u = (qx * dy - qy * dx) / den;
        if (t > 0 && t < best && u >= 0 && u <= 1) { best = t; type = 0; }
      }
      for (const it of this.items) {                // ray vs circle
        if (!this.visible(it)) continue;
        const fx = a.x - it.x, fy = a.y - it.y;
        if (fx * fx + fy * fy > (EYE_RANGE + ITEM_R) * (EYE_RANGE + ITEM_R)) continue;
        const b = fx * dx + fy * dy, c = fx * fx + fy * fy - ITEM_R * ITEM_R, disc = b * b - c;
        if (disc < 0) continue;
        let t = -b - Math.sqrt(disc); if (t < 0) t = 0;
        if (t < best && -b + Math.sqrt(disc) > 0) { best = t; type = it.type; target = it; }
      }
      for (const p of this.predators) {             // the predator: a bigger "poison-coloured" disc
        const fx = a.x - p.x, fy = a.y - p.y;
        const b = fx * dx + fy * dy, c = fx * fx + fy * fy - PRED_R * PRED_R, disc = b * b - c;
        if (disc < 0) continue;
        let t = -b - Math.sqrt(disc); if (t < 0) t = 0;
        if (t < best && -b + Math.sqrt(disc) > 0) { best = t; type = this.predColor(); }
      }
      a.eyes[k].dist = best; a.eyes[k].type = type; a.eyes[k].target = target;
    }
    // touch: which side of the body is against a wall (left / front / right sector)
    const c = a.contact; c[0] = c[1] = c[2] = 0; const R2 = (AGENT_R + 3) ** 2;
    for (const s of this.walls) {
      const [x1, y1, x2, y2] = s, dx = x2 - x1, dy = y2 - y1;
      let u = ((a.x - x1) * dx + (a.y - y1) * dy) / (dx * dx + dy * dy); u = clamp(u, 0, 1);
      const px = x1 + u * dx - a.x, py = y1 + u * dy - a.y;
      if (px * px + py * py > R2) continue;
      let rel = Math.atan2(py, px) - a.angle; rel = Math.atan2(Math.sin(rel), Math.cos(rel));   // wrap to [-pi, pi]
      c[rel < -0.6 ? 0 : rel > 0.6 ? 2 : 1] = 1;                // + angles are on the right (screen y down)
    }
  }
  // Differential drive. wl, wr in [-1,1] (negative = backwards). Returns reward this tick.
  move(wl, wr, speedMul) {
    if (speedMul == null) speedMul = 1; const params = this.P;
    if (params.reversal && !this.reversed && this.t >= params.episodeTicks / 2) { this.reversed = true; this.greenIsFood = !this.greenIsFood; }
    const a = this.agent; a.wl = wl; a.wr = wr; a.speed = speedMul;
    a.angle += (wl - wr) * TURN_RATE;               // left faster -> turn right
    const fwd = (wl + wr) * 0.5;
    const sp = fwd * params.maxSpeed * speedMul;
    this.energy += speedMul * speedMul * Math.abs(fwd);   // cost grows with the square of speed
    this.speedSum += speedMul;
    const nx = a.x + Math.cos(a.angle) * sp, ny = a.y + Math.sin(a.angle) * sp;
    if (!this.nearWall(nx, ny, AGENT_R)) { a.x = nx; a.y = ny; this.bumped = 0; }
    else { this.bumped = sp !== 0 ? 1 : 0; this.bumps += this.bumped; }  // blocked by walls
    // stuck = moved less than 10 px over the last 30 ticks (pinned on a wall, spinning in place...)
    const h = this.t % 30;
    if (this.t >= 30) { const ddx = a.x - this.histX[h], ddy = a.y - this.histY[h]; a.stuck = ddx * ddx + ddy * ddy < 100; if (a.stuck) this.stuckTicks++; }
    this.histX[h] = a.x; this.histY[h] = a.y;
    if (a.contact[0] || a.contact[1] || a.contact[2]) this.contactTicks++;
    let reward = 0;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i], dx = it.x - a.x, dy = it.y - a.y;
      if (dx * dx + dy * dy < (AGENT_R + ITEM_R) ** 2) {
        if ((it.type === 1) === this.greenIsFood) { this.food++; reward += 1; this.foodLog.push(this.t); this.rewardLog.push([this.t, 1]); }
        else { this.poison++; reward -= 1; this.poisonLog.push(this.t); this.rewardLog.push([this.t, -1]); }
        this.items[i] = this.spawnItem();
      }
    }
    if (this.hard) {
      this.stepThings();
      for (let i = 0; i < this.predators.length; i++) {
        const p = this.predators[i];
        if ((p.x - a.x) ** 2 + (p.y - a.y) ** 2 < (AGENT_R + PRED_R) ** 2) { this.caught++; reward -= HARD.caughtCost; this.poisonLog.push(this.t); this.rewardLog.push([this.t, -HARD.caughtCost]); this.predators[i] = this.spawnPredator(); }
      }
    }
    this.t++;
    return reward;
  }
  /* ----- environment interface ----- */
  get done() { return this.t >= this.P.episodeTicks; }
  get horizon() { return this.P.episodeTicks; }
  sense(ext) {
    const P = this.P; this.look();
    for (let k = 0; k < NUM_EYES; k++) {           // sensory encoding: current ~ proximity
      const e = this.agent.eyes[k];
      if (e.type >= 0) Enc.current(ext, k * 3 + e.type, 1 - e.dist / P.eyeRange, P.inputGain);
    }
    ext[TONIC] = P.tonicCurrent;
    if (P.bumpSensors) for (let j = 0; j < 3; j++) ext[BUMP0 + j] = this.agent.contact[j] * P.bumpGain;
    if (P.gyroSensors) { const d = this.agent.wl - this.agent.wr;     // last tick's turn: wr > wl = turning left
      ext[GYRO0] = Math.max(0, -d) * P.gyroGain; ext[GYRO0 + 1] = Math.max(0, d) * P.gyroGain; }
  }
  act(out) {
    const P = this.P, G = P.motorGain, Z = P.motorZero;
    const wl = Dec.rateToValue(out.rates[0], Z, G, -1, 1), wr = Dec.rateToValue(out.rates[1], Z, G, -1, 1);
    // speed neuron: at its resting drive (motorBias alone) it fires at SPEED_REF -> multiplier 1.0;
    // silenced -> 0.2 (crawl), driven hard -> up to 1.5 (sprint).
    const speedMul = clamp(0.2 + 0.8 * out.rates[2] / SPEED_REF, 0.2, 1.5);
    const f0 = this.food, p0 = this.poison, c0 = this.caught;
    const reward = this.move(wl, wr, speedMul);
    const a = this.agent, touching = P.wallMod && (a.contact[0] || a.contact[1] || a.contact[2] || this.bumped) ? 1 : 0;
    return { pos: this.food - f0, neg: this.poison - p0 + HARD.caughtCost * (this.caught - c0), pain: touching, reward };
  }
  score() { return worldScore(this); }
  // fitness = task score - energy cost - stuck penalty
  fitness() { return worldScore(this) - this.P.energyCost * this.energy / 1000 - this.P.stuckPenalty * this.stuckTicks / 100; }
  stats() { return { food: this.food, poison: this.poison, caught: this.caught, stuck: this.stuckTicks, score: worldScore(this) }; }
  statusLine() { return `food ${this.food} · poison ${this.poison}` + (this.hard ? ` · caught ${this.caught}` : '') + ` · score ${worldScore(this)} · t ${this.t}/${this.P.episodeTicks}`; }
  keyStats() { return `score ${worldScore(this)}`; }   // v19: shown only in the app's status line
  outputView() {      // bars for the UI: wheels -1..1, speed 0.2..1.5
    const a = this.agent; return [{ name: 'L wheel', v: a.wl, lo: -1, hi: 1 }, { name: 'R wheel', v: a.wr, lo: -1, hi: 1 }, { name: 'speed ×', v: a.speed || 1, lo: 0.2, hi: 1.5, ref: 1 }];
  }
  render(c, W, H, opts) { drawWorld(this, c, opts || {}); }
}

// Task score of one life (what the stats show): food - poison - 2 x caught by predator.
function worldScore(w) { return w.food - w.poison - HARD.caughtCost * w.caught; }

function drawWorld(w, c, opts) {
  const a = w.agent;
  c.clearRect(0, 0, w.width, w.height); c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, w.width, w.height);
  c.lineWidth = 2; c.strokeStyle = '#222'; c.beginPath();
  for (const s of w.walls) { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); } c.stroke();
  for (const it of w.items) {
    const vis = w.visible(it); if (!vis && !w.P.showHidden) continue;
    c.globalAlpha = vis ? 1 : 0.22;
    c.fillStyle = it.type === 1 ? '#3cb54a' : '#e04848';
    c.beginPath(); c.arc(it.x, it.y, ITEM_R, 0, 7); c.fill();
    if (!vis) { c.strokeStyle = '#3cb54a'; c.setLineDash([2, 2]); c.stroke(); c.setLineDash([]); }
    c.globalAlpha = 1;
  }
  for (const p of w.predators) {
    c.fillStyle = w.predColor() === 1 ? '#3cb54a' : '#e04848'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.arc(p.x, p.y, PRED_R, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(p.angle) * 14, p.y + Math.sin(p.angle) * 14); c.stroke();
  }
  c.lineWidth = 1;
  for (let k = 0; k < NUM_EYES; k++) {
    const e = a.eyes[k], ang = a.angle + EYE_ANGLES[k];
    c.strokeStyle = e.type === 1 ? '#2a9d3a' : e.type === 2 ? '#d43c3c' : e.type === 0 ? '#777' : '#bbb';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + Math.cos(ang) * e.dist, a.y + Math.sin(ang) * e.dist); c.stroke();
  }
  c.fillStyle = '#4a6cf7'; c.strokeStyle = '#1b2a8a'; c.lineWidth = 2;
  c.beginPath(); c.arc(a.x, a.y, AGENT_R, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + Math.cos(a.angle) * 14, a.y + Math.sin(a.angle) * 14); c.stroke();
  if (a.contact[0] || a.contact[1] || a.contact[2]) { c.strokeStyle = '#ff9f43'; c.lineWidth = 3; c.beginPath(); c.arc(a.x, a.y, AGENT_R + 4, 0, 7); c.stroke(); }
  if (opts.showStats === false) return;
  c.fillStyle = 'rgba(244,241,234,.85)'; c.fillRect(14, 14, 560, 40); c.fillStyle = '#222'; c.font = '13px system-ui';
  c.fillText(`food ${w.food}   poison ${w.poison}` + (w.hard ? `   caught ${w.caught}` : '') + `   t ${w.t}/${w.P.episodeTicks}   ` +
             (w.greenIsFood ? 'GREEN = food' : 'RED = food (colours swapped)'), 18, 30);
  c.fillText(`wall contact ${(100 * w.contactTicks / Math.max(1, w.t)).toFixed(0)}% of ticks · stuck ${(100 * w.stuckTicks / Math.max(1, w.t)).toFixed(0)}%` + (a.stuck ? '  ← STUCK' : ''), 18, 48);
}

registerEnv({
  id: 'bug', name: 'Bug arena', view: { width: WORLD_W, height: WORLD_H },
  description: 'A two-wheeled bug with 9 eyes, touch and turning sensors forages food and avoids poison (flash = memory task).',
  defaultPlan: 'v3h',
  params: {
    task: { value: 'flash', label: 'Task', options: [['flash', 'Memory: food only flashes visible (8 of 100 ticks)'], ['flashvis', 'Memory-task arena, food always visible (control)'],
             ['hard', 'Hard: drifting items + chasing predator'], ['normal', 'Normal: 60 still items, 50/50']] },
    episodeTicks: { value: 1500, min: 300, max: 4000, step: 100, label: 'Ticks per arena' },
    stuckPenalty: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'Stuck penalty /100 ticks', note: '0 = off' },
    energyCost: { value: 0, min: 0, max: 10, step: 0.5, label: 'Energy cost of speed', note: '0 = off' },
    reversal: { value: false, label: 'Reversal: food/poison colours swap halfway through every lifetime' },
    randomValence: { value: false, label: 'Random food/poison colours per lifetime (must LEARN which colour is good)' },
    bumpSensors: { value: true, label: 'Wall-contact (bump) sensor neurons' },
    gyroSensors: { value: true, label: 'Turning (angular velocity) sensor neurons' },
    showHidden: { value: true, label: 'Draw currently invisible food faintly (display only)' },
    nItems: { value: 60, hidden: true }, eyeRange: { value: 120, hidden: true }, maxSpeed: { value: 3.0, hidden: true },
    gyroGain: { value: 6, hidden: true }, bumpGain: { value: 10, hidden: true }, wallMod: { value: true, hidden: true },
    inputGain: { value: 10, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, motorBias: { value: 3.0, hidden: true },
    motorGain: { value: 5, hidden: true }, motorZero: { value: 0.08, hidden: true },
  },
  io: bugIO,
  create(seed, P) { return new World(seed, P); },
});
SpikingArena.bug = { World, worldScore, WORLD_W, WORLD_H, AGENT_R, ITEM_R, PRED_R, HARD, FLASH, WALLS, GARDEN, EYE_ANGLES, NUM_EYES, SENSE_TYPES, TONIC, BUMP0, GYRO0, N_INPUT,
  BUMP_NAMES, GYRO_NAMES, MOTOR_NAMES, FIXED_CLASSES, TAG_NAMES, SPEED_REF, bugIO };
})();

/* =====================================================================
 * envs/memory.js — two non-spatial MEMORY environments sharing one task:
 *
 *   'cue'    Cue-then-turn: a cue light on the LEFT or RIGHT for a few ticks,
 *            then a DELAY with no cue, then a GO signal; during the response
 *            window the agent must turn to the cued side (output 'turn_left'
 *            vs 'turn_right', winner-take-all over spike counts).
 *            Reward +1 correct, -1 wrong (no answer counts as wrong, -0.5).
 *   'recall' Symbol copy / recall: the same protocol with K symbols presented
 *            one-hot; the agent must output the same symbol (WTA over K
 *            outputs) after the delay. Groundwork for text.
 *
 * Trial = ITI (nothing) -> cue (cueTicks) -> delay -> go + response window.
 * Only the response window is read out, so a brain that cannot hold the cue
 * through the delay is at chance (or silent).
 * Curriculum (optional): after every generation the champion is tested; if its
 * pass rate >= passTarget the delay grows by delayStep (up to delayMax).
 * ===================================================================== */
(function () {
'use strict';
const VIEW_W = 700, VIEW_H = 500;

// IO spec for K symbols. K = 2: left / right cue lights and turn-left / turn-right outputs.
const goBroadcast = P => !!P.goBroadcast || P.mapping === 'random';
function recallIO(P, K, names, outNames) {
  // outputs sit under their symbols (v8); v7 recall brains keep the old output row (outLayout 'v7')
  const xs = K === 2 ? [-P.cueX, P.cueX] : spread(K, -0.8, 0.8), ox = K === 2 ? [-0.5, 0.5] : P.outLayout === 'v7' ? spread(K, -0.7, 0.7) : xs;
  // 'topo' = topographic label (used only by cells with the TOPO gene): output k matches symbol k
  const inputs = names.map((n, k) => ({ name: n, group: 'symbol', tag: 1, cls: 1, pos: [xs[k], 1], cue: true, topo: xs[k],
                                        mirror: K === 2 ? 1 - k : undefined }));
  // v20: GO as nGo diffuse copies across the tissue (as in the bandit; for the action columns of plan rewardMemK):
  // with a random answer mapping (new in v20, so no older brain is affected) or when goBroadcast is set
  if (goBroadcast(P)) spread(P.nGo, -0.9, 0.9).forEach((x, i) => inputs.push({ name: 'go' + i, group: 'go', tag: 3, cls: 4, pos: [x, 0.95], midline: true, diffuse: true }));
  else inputs.push({ name: 'go', group: 'go', tag: 3, cls: 4, pos: [0, 0.8], midline: true });
  const iTon = inputs.length;
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.9], midline: true, tonic: true });
  const outputs = outNames.map((n, k) => ({ name: n, group: 'choice', tag: 4, cls: 5 + (k % 3), pos: [ox[k], -1], bias: P.outBias, topo: xs[k],
                                            mirror: K === 2 ? 1 - k : undefined }));
  return { outcome: true, inputs, outputs, classes: ['cue', 'symbol', 'unused', 'tonic', 'go', 'out-A', 'out-B', 'out-C'],
           tagNames: ['tag 0', 'cue', 'tag 2', 'go', 'output', 'tag 5', 'tonic', 'free'],
           juvenile: { waves: [names.map((n, k) => k)], pairs: names.map((n, k) => [k, k]), waveGain: P.cueGain, tonic: [[iTon, P.tonicCurrent]], kicks: { chans: [K], p: 0.02, gain: P.cueGain } } };
}

class RecallTask {
  constructor(seed, P, spec, K) {
    this.P = P; this.K = K; this.rng = mulberry32((seed ^ 0x2545f491) >>> 0);
    this.t = 0; this.trial = 0; this.phaseT = 0; this.phase = 'iti';
    this.correct = 0; this.wrong = 0; this.silent = 0; this.shaping = 0; this.rewardLog = []; this.log = [];
    this.counts = new Float64Array(K); this.lastCounts = new Float64Array(K);
    // balanced, shuffled symbol sequence
    const n = P.nTrials; this.seq = []; for (let i = 0; i < n; i++) this.seq.push(i % K);
    for (let i = n - 1; i > 0; i--) { const j = (this.rng() * (i + 1)) | 0; [this.seq[i], this.seq[j]] = [this.seq[j], this.seq[i]]; }
    this.delays = this.seq.map(() => Math.max(0, Math.round(P.delay + (P.delayJitter ? (this.rng() * 2 - 1) * P.delayJitter : 0))));
    this.lastChoice = -1; this.lastOk = null; this.hits = [];
    // v20 (round 21): mapping 'random' = the rewarded answer for each cue is a random permutation, new every lifetime
    // (must be learned from reward alone; separate RNG stream, so the trial sequence is the same as with 'same')
    if (P.mapping === 'random') { const r2 = mulberry32(Math.imul(seed ^ 0x6a09e667, 0x85ebca6b) >>> 0), m = Array.from({ length: K }, (_, i) => i);
      for (let i = K - 1; i > 0; i--) { const j = (r2() * (i + 1)) | 0; [m[i], m[j]] = [m[j], m[i]]; } this.map = m; }
    this.horizon = this.seq.reduce((s, x, i) => s + P.iti + P.cueTicks + this.delays[i] + P.respTicks, 0);
  }
  get done() { return this.trial >= this.seq.length; }
  get symbol() { return this.seq[this.trial]; }
  phaseLen(ph) { const P = this.P; return ph === 'iti' ? P.iti : ph === 'cue' ? P.cueTicks : ph === 'delay' ? this.delays[this.trial] : P.respTicks; }
  sense(ext) {
    const P = this.P, K = this.K;
    while (this.phaseT >= this.phaseLen(this.phase)) this.nextPhase();
    if (this.phase === 'cue') ext[this.symbol] = P.cueGain;               // one-hot cue
    const nG = goBroadcast(P) ? P.nGo : 1;
    if (this.phase === 'resp') for (let i = 0; i < nG; i++) ext[K + i] = P.goGain;   // go signal
    ext[K + nG] = P.tonicCurrent;
  }
  nextPhase() { this.phaseT = 0; this.phase = { iti: 'cue', cue: 'delay', delay: 'resp', resp: 'iti' }[this.phase]; if (this.phase === 'resp') this.counts.fill(0); }
  act(out) {
    const K = this.K; let ev = null;
    if (this.phase === 'resp') {
      for (let k = 0; k < K; k++) this.counts[k] += out.spikes[k];
      if (this.phaseT === this.P.respTicks - 1) ev = this.decide();
    } else if (this.P.holdPenalty) { let s = 0; for (let k = 0; k < K; k++) s += out.spikes[k]; if (s) this.shaping -= this.P.holdPenalty * s / 100; }
    this.phaseT++; this.t++;
    return ev;
  }
  decide() {
    const K = this.K, c = this.counts, k = Dec.wta(c), target = this.map ? this.map[this.symbol] : this.symbol;
    let other = 0, tot = 0; for (let j = 0; j < K; j++) { tot += c[j]; if (j !== target) other = Math.max(other, c[j]); }
    this.shaping += 0.25 * (c[target] - other) / (tot + 2);     // small graded bonus (margin of the right answer)
    let r;
    if (k < 0) { this.silent++; r = -0.5; } else if (k === target) { this.correct++; r = 1; } else { this.wrong++; r = -(this.P.wrongCost ?? 1); }
    this.lastCounts.set(c); this.lastChoice = k; this.lastOk = k === target; this.hits.push(k === target ? 1 : 0); this.lastTarget = target;
    this.log.push({ target, choice: k }); if (this.log.length > 40) this.log.shift();
    this.rewardLog.push([this.t, r]);
    this.trial++; this.phaseT = 0; this.phase = 'iti';
    while (!this.done && this.phaseLen('iti') === 0 && false);
    return { pos: r > 0 ? 1 : 0, neg: r < 0 ? -r : 0, pain: 0, reward: r, outcome: true };
  }
  get passRate() { const n = this.correct + this.wrong + this.silent; return n ? this.correct / n : 0; }
  score() { return this.correct - this.wrong; }
  fitness() { const n = Math.max(1, this.seq.length); return (this.correct - this.wrong - 0.5 * this.silent + this.shaping) / n * 10; }
  quarter(i) { const h = this.hits, a = Math.floor(h.length * i / 4), b = Math.floor(h.length * (i + 1) / 4); let s = 0; for (let j = a; j < b; j++) s += h[j]; return b > a ? s / (b - a) : 0; }
  stats() { const o = { trials: this.trial, correct: this.correct, wrong: this.wrong, silent: this.silent, pass: this.passRate, delay: this.P.delay };
    if (this.map) Object.assign(o, { firstQuarter: this.quarter(0), lastQuarter: this.quarter(3) }); return o; }
  statusLine() { return `trial ${Math.min(this.trial + 1, this.seq.length)}/${this.seq.length} · ${this.phase} · correct ${this.correct} wrong ${this.wrong} silent ${this.silent} · pass ${(100 * this.passRate).toFixed(0)}% · delay ${this.P.delay}`; }
  get drawsOutputs() { return true; }
  keyStats() { return `pass ${(100 * this.passRate).toFixed(0)}%`; }   // v19: shown only in the app's status line
  outputView() { return Array.from(this.counts, (v, k) => ({ name: (this.names ? this.names[k] : 'out' + k) + ' spikes', v, lo: 0, hi: Math.max(8, ...this.counts) })); }
  render(c, W, H) { renderRecall(this, c, W, H); }
}

function renderRecall(T, c, W, H) {
  const K = T.K, P = T.P;
  c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#222'; c.font = '14px system-ui';
  c.fillText(`trial ${Math.min(T.trial + 1, T.seq.length)}/${T.seq.length} · ${T.phase} · correct ${T.correct} · wrong ${T.wrong} · silent ${T.silent}`, 16, 24);
  // cue lights
  const bw = Math.min(110, (W - 80) / K), x0 = W / 2 - bw * K / 2;
  for (let k = 0; k < K; k++) {
    const on = T.phase === 'cue' && T.symbol === k, x = x0 + k * bw;   // (cue lights; with a random mapping the rewarded answer is hidden)
    c.fillStyle = on ? '#ffcc33' : '#d8d3c8'; c.beginPath(); c.arc(x + bw / 2, 90, Math.min(28, bw / 2 - 6), 0, 7); c.fill();
    c.fillStyle = '#333'; c.font = '13px system-ui'; c.textAlign = 'center'; c.fillText(T.names ? T.names[k] : 'sym ' + k, x + bw / 2, 140);
  }
  // go light
  c.fillStyle = T.phase === 'resp' ? '#3cb54a' : '#d8d3c8'; c.beginPath(); c.arc(W / 2, 185, 16, 0, 7); c.fill();
  c.fillStyle = '#333'; c.fillText('GO', W / 2, 215);
  // timeline of the current trial
  const phases = ['iti', 'cue', 'delay', 'resp'], lens = phases.map(p => T.done ? 1 : T.phaseLen(p)), tot = lens.reduce((a, b) => a + b, 0) || 1;
  let x = 40; const tw = W - 80;
  phases.forEach((p, i) => { const w = lens[i] / tot * tw; c.fillStyle = p === T.phase ? '#5f8cff' : '#c9c3b6'; c.fillRect(x, 240, w - 2, 16);
    c.fillStyle = '#333'; c.font = '11px system-ui'; c.fillText(p, x + w / 2, 272); if (p === T.phase) { c.fillStyle = '#000'; c.fillRect(x + Math.min(w - 2, T.phaseT / Math.max(1, lens[i]) * w), 236, 2, 24); } x += w; });
  // response spike counts (current window) / last decision
  c.textAlign = 'left'; c.font = '13px system-ui';
  for (let k = 0; k < K; k++) {
    const v = T.phase === 'resp' ? T.counts[k] : T.lastCounts[k], mx = Math.max(10, ...(T.phase === 'resp' ? T.counts : T.lastCounts)), xx = x0 + k * bw;
    c.fillStyle = '#ddd'; c.fillRect(xx + 10, 300, bw - 20, 80); c.fillStyle = k === T.lastChoice && T.phase !== 'resp' ? (T.lastOk ? '#3cb54a' : '#e04848') : '#5f8cff';
    const h = v / mx * 80; c.fillRect(xx + 10, 380 - h, bw - 20, h);
    c.fillStyle = '#333'; c.textAlign = 'center'; c.fillText(String(v | 0), xx + bw / 2, 396);
  }
  c.textAlign = 'left'; c.fillStyle = '#555'; c.fillText(T.phase === 'resp' ? 'output spikes in the response window' : 'last decision (green = correct, red = wrong)', 40, 296);
  // recent trials
  c.fillText('recent trials:', 40, 430);
  T.log.forEach((l, i) => { c.fillStyle = l.choice < 0 ? '#999' : l.choice === l.target ? '#3cb54a' : '#e04848'; c.fillRect(140 + i * 13, 420, 10, 10); });
  if (T.map) { c.fillStyle = '#555'; c.fillText('answer mapping (hidden from the brain): ' + T.map.map((m, k) => (T.names ? T.names[k] : k) + '→' + (T.names ? T.names[m] : m)).join(' '), 40, 452); }
  c.fillStyle = '#555'; c.fillText(`cue ${P.cueTicks} · delay ${T.done ? P.delay : T.delays[T.trial]} · response ${P.respTicks} · inter-trial ${P.iti} ticks` + (P.curriculum ? ` · curriculum on (target ${(100 * P.passTarget) | 0}%)` : ''), 40, 470);
}

const COMMON = {
  nTrials: { value: 20, min: 4, max: 60, step: 2, label: 'Trials per episode' },
  delay: { value: 10, min: 0, max: 200, step: 1, label: 'Delay (ticks)', note: 'no cue, no go' },
  delayJitter: { value: 0, min: 0, max: 20, step: 1, label: 'Delay jitter ± (ticks)' },
  cueTicks: { value: 5, min: 1, max: 20, step: 1, label: 'Cue duration (ticks)' },
  respTicks: { value: 10, min: 2, max: 30, step: 1, label: 'Response window (ticks)' },
  iti: { value: 15, min: 0, max: 60, step: 1, label: 'Inter-trial interval (ticks)' },
  curriculum: { value: false, label: 'Curriculum: grow the delay when the champion passes' },
  passTarget: { value: 0.8, min: 0.5, max: 1, step: 0.05, label: 'Curriculum pass target' },
  delayStep: { value: 5, min: 1, max: 50, step: 1, label: 'Curriculum delay step' },
  delayMax: { value: 100, min: 5, max: 400, step: 5, label: 'Curriculum max delay' },
  mapping: { value: 'same', label: 'Rewarded answer', options: [['same', 'the cued side / symbol'], ['random', 'random mapping per lifetime (learn from reward alone)']] },
  holdPenalty: { value: 0, min: 0, max: 2, step: 0.1, label: 'Penalty for output spikes before GO', note: '0 = off' },
  cueGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  cueX: { value: 0.6, hidden: true }, goBroadcast: { value: false, hidden: true }, wrongCost: { value: 1, hidden: true }, nGo: { value: 9, hidden: true },
};
// curriculum hook: test the champion (2 of its validation regrowths x 1 fresh episode each);
// lengthen the delay if it passes. (Its own-seed growth is not used: it can be an unlucky growth.)
function curriculum(evo, P) {
  if (!P.curriculum || !evo.champion) return { delay: P.delay };
  const env = evo.env, g = evo.champion.genome; let c = 0, n = 0;
  for (let k = 0; k < 2; k++) { const a = runEpisode(g, 880000 + evo.gen * 7 + k, evo.grow(g, evo.growSeed(g, k, true), true), env); c += a.task.correct; n += a.task.seq.length; }
  const pass = c / n;
  if (pass >= P.passTarget && P.delay < P.delayMax) { P.delay = Math.min(P.delayMax, P.delay + P.delayStep); evo.champion.val = -Infinity; }   // harder task: champion must re-qualify
  return { delay: P.delay, pass };
}

registerEnv({
  id: 'cue', name: 'Cue-then-turn (memory)', view: { width: VIEW_W, height: VIEW_H },
  description: 'A cue on the left or right, a delay, then GO: turn to the cued side. Needs working memory.',
  defaultPlan: P => P.mapping === 'random' ? 'unifiedR' : 'memoryK',   // v26 (R27): evolved actor-critic plan for reward-only random mappings (v20: rewardMemK)
  params: Object.assign({}, COMMON),
  io: P => recallIO(P, 2, ['cue_left', 'cue_right'], ['turn_left', 'turn_right']),
  create(seed, P, spec) { const t = new RecallTask(seed, P, spec, 2); t.names = ['left', 'right']; return t; },
  onGeneration: curriculum,
});
registerEnv({
  id: 'recall', name: 'Sequence: symbol recall', view: { width: VIEW_W, height: VIEW_H },
  description: 'A symbol (one-hot) is shown, then a delay, then GO: output the same symbol (winner-take-all).',
  defaultPlan: P => P.mapping === 'random' ? 'unifiedR' : 'memoryK',   // v26 (R27): evolved actor-critic plan for reward-only random mappings (v20: rewardMemK)
  params: Object.assign({}, COMMON, { K: { value: 4, min: 2, max: 16, step: 1, label: 'Alphabet size (symbols)' }, cueX: { value: 0.8, hidden: true },
                                      outLayout: { value: 'aligned', hidden: true } }),
  io: P => { const K = P.K | 0, s = 'ABCDEFGHIJKLMNOP'.slice(0, K).split(''); return recallIO(P, K, s.map(x => 'sym_' + x), s.map(x => 'out_' + x)); },
  create(seed, P, spec) { const K = P.K | 0, t = new RecallTask(seed, P, spec, K); t.names = 'ABCDEFGHIJKLMNOP'.slice(0, K).split(''); return t; },
  onGeneration: curriculum,
});

/* ---------- hand-designed MEMORY plan (for cue-then-turn) ----------
 * One progenitor per side at (±0.5, 0.35), on the path of that side's cue axon.
 * One position gene ("lateral": farther than 0.5 from the midline) splits each clone:
 *   M  (lateral half) excitatory, SLOW membrane, receives the cue of its side (tag 1),
 *      4 short local collaterals onto other M cells (address 7: self-excitation =
 *      persistent activity) and onto X cells (address 2); main axon = PROJECTION to
 *      the same-side output (turn to that side).
 *   X  (medial half) inhibitory, driven by the cue and by local M collaterals;
 *      COMMISSURAL axon (no synapses before crossing the midline) that inhibits the
 *      other side's M (address 0).
 * A cue on one side switches that side's M population on and, through X, the other
 * side's off (a flip-flop), so the last cue is held through the delay. Strong cue
 * synapses (wIn 30) let a new cue overturn the old memory. */
function createMemoryPlan(tune) {
  const T = Object.assign({ s7: 1, t7: 1, s2: 2, leak: 1, clen: -1, xLat: 0.5, y: 0.35, x: 0.5, wHid: 10, wIn: 30, thr: 0, reach: 1.6, xcue: 5, t0: 5, sx: 5 }, tune);
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, 0.6, 0.3, 0.6, 0.3, 0.3, 0.3];
  wg(0, 0, -40); wg(0, BIAS, 40 * Math.exp(-T.xLat / lam[0]));   // s0: lateral? (+1 farther than xLat from the midline)
  wg(6, TIME, -40); wg(6, BIAS, 40 * 0.14);                      // s6: proliferation clock (+1 while t < 0.14)
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  const fate = (out, M, X) => { r(out, 0, (M - X) / 2); rb(out, (M + X) / 2); };   // gene 0 = +1 in M, -1 in X
  for (let o = 0; o < CH_NO; o++) rb(o, -5);                     // everything off unless set below
  for (let k = 0; k < 7; k++) rb(k < 6 ? CO.G + k : CO.G6, 0);   // guidance weights 0 = indifferent
  r(CO.DIV, 6, 5); rb(CO.DIV, 0); r(CO.AXON, 6, -5); rb(CO.AXON, 0);
  fate(CO.INH, -5, 5); rb(CO.THR, T.thr); fate(CO.BRANCH, 5, 5);
  fate(CO.T + 1, 5, T.xcue); fate(CO.T + 2, -5, 5); fate(CO.T + 7, T.t7, -5);
  fate(CO.T + 0, T.t0, -5);                                   // M: address for the crossed inhibition (X seek tag 0)
  fate(CO.S + 7, T.s7, -5); fate(CO.S + 0, -5, T.sx); fate(CO.S + 2, T.s2, -5); fate(CO.S + 4, 5, -5);
  fate(CO.G + 0, 0, 5); fate(CO.G + 1, -5, 0); fate(CO.G + 3, 5, 0);
  fate(CO.COLL, 5, -5); fate(CO.CLEN, T.clen, -5); fate(CO.LEAK, T.leak, -5); fate(CO.PROJ, 5, -5); fate(CO.XSYN, -5, 5);
  return { kind: 'cell', label: 'hand-designed memory plan (slow recurrent M + crossed inhibition)', seed: 1, Wg, R, lam,
           seeds: T.xX != null ? [[-T.x, T.y], [T.x, T.y], [-T.xX, T.y], [T.xX, T.y]] : [[-T.x, T.y], [T.x, T.y]], s0: new Array(H).fill(0),
           sc: Object.assign(cellDefaults(), { pDiv: 0.9, maxCells: 120, trophHid: 0.3, wHid: T.wHid, wIn: T.wIn, eyeReach: T.reach }),
           pl: Object.assign(defaultPlasticity(), { lr: 0.01, aMinus: 0.3 }), nCh: 1, ch: [defaultChannel()], fitness: null };
}
registerPlan('memory', 'memory plan (cue-then-turn)', () => createMemoryPlan(), 'central zone only: slow self-exciting M cells driven by the cue, crossed inhibitory X cells');

/* ---------- hand-designed K-WAY MEMORY plan 'memoryK' (any number of symbols) ----------
 * A generic winner-take-all working-memory motif; nothing in it depends on K.
 * A row of progenitors across the tissue makes a band of cells. Position (front/back) splits the band:
 *   M (front rows) excitatory memory cells with the TOPO gene: each cell takes the positional label of
 *      where it sits, so it receives the cue axon above it, excites only nearby M cells with the same
 *      label (self-excitation of a column = persistent activity), excites the X cells below it, and
 *      projects to the output with its label. Columns form wherever input channels are.
 *   X (back rows) inhibitory cells with BIFURCATING axons (parallel fibres) that run along the M band
 *      (they follow signal A that M cells emit) and inhibit every M cell they pass: SHARED inhibition.
 * A cue switches its column on; the column's X activity inhibits all columns, so only the most
 * strongly driven column survives (the new cue beats the old memory). SYNAPTIC SCALING (normE / normI)
 * gives every cell the same total excitation and inhibition, so the attractor does not depend on how
 * many axons happened to find a cell; GROWTH UNTIL SATISFIED gives unconnected collaterals a 2nd try. */
function createMemoryKPlan(tune) {
  const T = Object.assign({ y: 0.42, yM: 0.333, yTop: 0.583, xc: 0.17, nSeed: 13, x0: 0.9, tc: 0.3, maxCells: 260, topoW: 0.1, snap: 1, normE: 45, normI: 200, satisfy: 2,
                            wIn: 30, wHid: 10, leak: 0, clen: -2, t0: 5, sx: 5, thr: 0, xthr: 0, branchMax: 40, mBranch: -1, em4: 3, g4: 5,
                            coll: 5, reach: 1.7, homeo: 0, xgo: 5 }, tune);
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, 0.6, 0.3, 0.6, 0.15, 0.3, 0.3];
  wg(0, 1, 40); wg(0, BIAS, -40 * Math.exp(-(1 - T.yM) / lam[1]));   // s0: +1 in the front rows (M), -1 behind
  wg(1, 0, 40); wg(1, BIAS, -40 * Math.exp(-T.xc / lam[0]));          // s1: +1 near the midline (central), -1 lateral
  wg(2, 1, 40); wg(2, BIAS, -40 * Math.exp(-(1 - T.yTop) / lam[1]));  // s2: +1 in front of the band (these cells die)
  const G = k => CH_NCHEM + k;                                          // s3: +1 = inside the circuit (M band, or X region)
  wg(3, G(0), 20); wg(3, G(1), 20); wg(3, G(2), -60); wg(3, BIAS, -40);   //     = s0 + s1 - 3 s2 - 2 > 0
  wg(6, TIME, -40); wg(6, BIAS, 40 * T.tc);                          // s6: proliferation clock (+1 while t < tc)
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  // fate(out, M, X): M = front cells, X = back & central cells (AND of genes 0 and 1); back & lateral cells die
  const fate = (out, M, X) => { const lo = Math.min(M, X), hi = Math.max(M, X); r(out, 0, (M - X) / 2); rb(out, (M + X) / 2);
    if (X > M) { r(out, 1, (X - M) / 2); rb(out, (M + X) / 2 - (X - M) / 2); } };
  for (let o = 0; o < CH_NO; o++) rb(o, -5);
  for (let k = 0; k < 7; k++) rb(k < 6 ? CO.G + k : CO.G6, 0);
  r(CO.DIV, 6, 5); rb(CO.DIV, 0); r(CO.AXON, 6, -5); r(CO.AXON, 3, 5); rb(CO.AXON, -5);   // neurons after proliferation, inside the circuit only
  r(CO.DIE, 3, -10);                                                    // cells outside the circuit die (apoptosis)
  fate(CO.INH, -5, 5); fate(CO.THR, T.thr, T.xthr); fate(CO.BRANCH, T.mBranch, 5);
  fate(CO.T + 1, 5, -5); fate(CO.T + 3, -5, T.xgo); fate(CO.T + 7, 5, -5); fate(CO.T + 0, T.t0, -5);
  fate(CO.S + 7, 5, -5); fate(CO.S + 4, 5, -5); fate(CO.S + 0, -5, T.sx);
  fate(CO.TOPO, 5, -5); fate(CO.BIF, -5, 5); fate(CO.PROJ, 5, -5); fate(CO.COLL, T.coll, -5); fate(CO.CLEN, T.clen, -5);
  fate(CO.LEAK, T.leak, -5); fate(CO.EM4, T.em4, -5);
  fate(CO.G + 3, 5, 0); fate(CO.G + 1, -5, 0); fate(CO.G + 4, 0, T.g4);       // M: down to the outputs; X: along the M band
  const seeds = spread(T.nSeed, -T.x0, T.x0).map(x => [x, T.y]);
  return { kind: 'cell', label: 'hand-designed K-way memory plan (topographic columns + shared inhibition)', seed: 1, Wg, R, lam, seeds, s0: new Array(H).fill(0),
           sc: Object.assign(cellDefaults(), { pDiv: 0.9, maxCells: T.maxCells, trophHid: 0.3, wHid: T.wHid, wIn: T.wIn, eyeReach: T.reach, topoW: T.topoW, topoSnap: T.snap,
                                               normE: T.normE, normI: T.normI, satisfy: T.satisfy, branchMax: T.branchMax, homeoRate: T.homeo }),
           pl: Object.assign(defaultPlasticity(), { lr: 0.01, aMinus: 0.3 }), nCh: 1, ch: [defaultChannel()], fitness: null };
}
registerPlan('memoryK', 'K-way memory plan (any number of symbols)', () => createMemoryKPlan(), 'topographic memory columns (one per input channel) + shared inhibition by parallel-fibre interneurons');
Object.assign(SpikingArena, { RecallTask, createMemoryPlan, createMemoryKPlan });
})();

/* =====================================================================
 * envs/text.js — 'Text: next-character prediction' (skeleton / stub).
 * A tiny built-in corpus is streamed one character at a time (one-hot input,
 * charTicks ticks per character). While a character is shown, the output group
 * (one output cell per character) is read by winner-take-all = the predicted
 * NEXT character. Metrics: accuracy, bits per character (softmax over output
 * spike counts, smoothed), compared with the unigram baseline.
 * It runs end to end; it is not expected to perform well yet.
 * ===================================================================== */
(function () {
'use strict';
const CORPUS = ('the cat sat on the mat. the dog sat on the log. the cat saw the dog. ' +
  'a bird sang in the tree. the dog ran to the tree. the cat ran to the mat. ' +
  'the sun is hot. the sea is blue. the bird is in the tree. the dog is on the log. ').repeat(1);
const ALPHA = Array.from(new Set(CORPUS.split(''))).sort();
// v19 (round 20): a larger corpus for longer lifetimes: six Aesop fables retold in simple English (after the public-domain
// translations), lowercase, space and full stop only (24 symbols: no j, q, x, z, no commas). Used by the seq env (source 'fables').
const FABLES = (
  'the cat and the crow. a crow sat on a branch of a tree with a piece of cheese in her beak. a cat saw her and ' +
  'wanted the cheese. he came to the foot of the tree and said good day mistress crow. how well you look today. ' +
  'how bright your eyes are. i am sure your voice is as sweet as your feathers are fine. will you sing one song ' +
  'for me. the crow was glad to hear this. she lifted her head and began to sing but the moment she opened her ' +
  'beak the cheese fell to the ground and the cat ate it up. that is all i wanted said the cat. in return for the ' +
  'cheese i will give you a piece of good advice. do not trust those who praise you. the ant and the grasshopper. ' +
  'in a field one summer day a grasshopper was hopping about singing to its heart. an ant passed by bearing an ' +
  'ear of corn to the nest. why not come and sing with me said the grasshopper instead of working so hard. i am ' +
  'helping to lay up food for the winter said the ant and i think you should do the same. why bother about winter ' +
  'said the grasshopper. we have plenty of food at present. but the ant went on its way and carried on its work. ' +
  'when the winter came the grasshopper had no food and found itself dying of hunger while it saw the ants eating ' +
  'corn and grain from the stores they had collected in the summer. then the grasshopper knew it is best to ' +
  'prepare for the days of need. the dog and the shadow. a dog was carrying a piece of meat in his mouth to eat ' +
  'it in peace at home. on his way he had to cross a plank lying across a running brook. as he crossed he looked ' +
  'down and saw his own shadow in the water beneath. thinking it was another dog with another piece of meat he ' +
  'made up his mind to have that also. so he made a snap at the shadow in the water but as he opened his mouth ' +
  'the piece of meat fell out dropped into the water and was never seen more. beware lest you lose the substance ' +
  'by grasping at the shadow. the lion and the mouse. once when a lion was asleep a little mouse began running up ' +
  'and down upon him. this soon wakened the lion who placed his huge paw upon her and opened his big mouth to ' +
  'swallow her. pardon o king cried the little mouse. forgive me this time. i shall never forget it. who knows ' +
  'but what i may be able to do you a turn some of these days. the lion was so tickled at the idea of the mouse ' +
  'being able to help him that he lifted up his paw and let her go. some time after the lion was caught in a trap ' +
  'and the hunters who desired to carry him alive to the king tied him to a tree while they went in search of a ' +
  'wagon to carry him on. right then the little mouse happened to pass by and seeing the sad plight in which the ' +
  'lion was went up to him and soon gnawed away the ropes that bound the king of the beasts. was i not right said ' +
  'the little mouse. little friends may prove great friends. the hare and the tortoise. the hare was once ' +
  'boasting of his speed before the other animals. i have never yet been beaten said he when i put forth my full ' +
  'speed. i challenge any one here to race with me. the tortoise said calmly i accept your challenge. that is a ' +
  'fine tale said the hare. i could dance round you all the way. keep your boasting till you have beaten me ' +
  'answered the tortoise. shall we race. so a course was set and a start was made. the hare darted almost out of ' +
  'sight at once but soon stopped and to show his contempt for the tortoise lay down to have a nap. the tortoise ' +
  'plodded on and plodded on and when the hare awoke from his nap he saw the tortoise close to the winning post ' +
  'and could not run up in time to save the race. then the tortoise said slow and steady wins the race. the wind ' +
  'and the sun. the wind and the sun were disputing which was the stronger. suddenly they saw a traveller coming ' +
  'down the road and the sun said i see a way to decide our dispute. whichever of us can cause that traveller to ' +
  'take off his cloak shall be regarded as the stronger. you begin. so the sun retired behind a cloud and the ' +
  'wind began to blow as hard as it could upon the traveller. but the harder he blew the more closely did the ' +
  'traveller wrap his cloak round him till at last the wind had to give up in despair. then the sun came out and ' +
  'shone in all his glory upon the traveller who soon found it too hot to walk with his cloak on. kindness wins ' +
  'where force fails. ').trim() + ' ';
const FABLES_ALPHA = Array.from(new Set(FABLES.split(''))).sort();
const FABLES_BIGRAM = (() => { const A = FABLES_ALPHA, I = new Map(A.map((c, i) => [c, i])), n = A.map(() => new Array(A.length).fill(0)), u = new Array(A.length).fill(0), L = FABLES.length;
  for (let i = 0; i < L; i++) { n[I.get(FABLES[i])][I.get(FABLES[(i + 1) % L])]++; u[I.get(FABLES[i])]++; }
  let hit = 0, bits = 0; for (const row of n) { const t = row.reduce((a, b) => a + b, 0); if (!t) continue; hit += Math.max(...row); for (const x of row) if (x) bits -= x * Math.log2(x / t); }
  return { acc: hit / L, bpc: bits / L, uniAcc: Math.max(...u) / L, uniBpc: -u.reduce((s, x) => s + (x ? x / L * Math.log2(x / L) : 0), 0) }; })();
const A = ALPHA.length, IDX = new Map(ALPHA.map((c, i) => [c, i]));
const UNIGRAM = (() => { const n = new Array(A).fill(0); for (const c of CORPUS) n[IDX.get(c)]++; return n.map(x => x / CORPUS.length); })();
const BASE_ACC = Math.max(...UNIGRAM), BASE_BPC = -UNIGRAM.reduce((s, p) => s + (p ? p * Math.log2(p) : 0), 0);
// BIGRAM baseline (fitted on the corpus itself, so an upper bound for a 1-character memory):
// predict the most frequent follower of the current character; bits = conditional entropy H(next | current)
const BIGRAM = (() => { const n = Array.from({ length: A }, () => new Array(A).fill(0));
  for (let i = 0; i < CORPUS.length; i++) n[IDX.get(CORPUS[i])][IDX.get(CORPUS[(i + 1) % CORPUS.length])]++;
  let hit = 0, bits = 0; for (const row of n) { const t = row.reduce((a, b) => a + b, 0); if (!t) continue; hit += Math.max(...row);
    for (const x of row) if (x) bits -= x * Math.log2(x / t); }
  return { counts: n, acc: hit / CORPUS.length, bpc: bits / CORPUS.length }; })();
const label = c => c === ' ' ? '␣' : c;

function textIO(P) {
  const xs = spread(A, -0.92, 0.92), ox = spread(A, -0.92, 0.92);
  const inputs = ALPHA.map((c, k) => ({ name: 'in_' + label(c), group: 'char', tag: 1, cls: 1, pos: [xs[k], 1], cue: true }));
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.85], midline: true, tonic: true });
  const outputs = ALPHA.map((c, k) => ({ name: 'out_' + label(c), group: 'char', tag: 4, cls: 5, pos: [ox[k], -1], bias: P.outBias }));
  return { inputs, outputs, classes: ['', 'char', '', 'tonic', '', 'out'], tagNames: ['tag 0', 'char', 'tag 2', 'tag 3', 'output', 'tag 5', 'tonic', 'free'],
           juvenile: { waves: [ALPHA.map((c, k) => k)], waveGain: P.inGain, tonic: [[A, P.tonicCurrent]], kicks: null } };
}
class TextTask {
  constructor(seed, P) {
    this.P = P; const r = mulberry32((seed ^ 0x51ed270b) >>> 0);
    this.start = (r() * CORPUS.length) | 0; this.pos = 0; this.sub = 0; this.t = 0;
    this.counts = new Float64Array(A); this.correct = 0; this.n = 0; this.bits = 0; this.rewardLog = []; this.recent = [];
    this.horizon = P.nChars * P.charTicks;
  }
  ch(k) { return CORPUS[(this.start + k) % CORPUS.length]; }
  get done() { return this.pos >= this.P.nChars; }
  sense(ext) { Enc.oneHot(ext, ALPHA.map((c, k) => k), IDX.get(this.ch(this.pos)), this.P.inGain); ext[A] = this.P.tonicCurrent; }
  act(out) {
    const P = this.P; let ev = null;
    for (let k = 0; k < A; k++) this.counts[k] += out.spikes[k];
    this.sub++; this.t++;
    if (this.sub >= P.charTicks) {                       // end of this character: read the prediction of the next one
      const target = IDX.get(this.ch(this.pos + 1)), k = Dec.wta(this.counts);
      const p = Dec.softmax(this.counts, P.beta), q = (1 - 0.05) * p[target] + 0.05 / A;
      this.bits += -Math.log2(q); this.n++;
      const ok = k === target; if (ok) this.correct++;
      this.recent.push([this.ch(this.pos), k < 0 ? '·' : ALPHA[k], ok]); if (this.recent.length > 48) this.recent.shift();
      this.rewardLog.push([this.t, ok ? 1 : 0]);
      ev = { pos: ok ? 1 : 0, neg: ok ? 0 : P.wrongCost, pain: 0, reward: ok ? 1 : 0 };
      this.counts.fill(0); this.sub = 0; this.pos++;
    }
    return ev;
  }
  get accuracy() { return this.n ? this.correct / this.n : 0; }
  get bpc() { return this.n ? this.bits / this.n : Math.log2(A); }
  score() { return this.accuracy; }
  fitness() { return 10 * this.accuracy - 0.5 * (this.bpc - BASE_BPC); }
  stats() { return { chars: this.n, accuracy: this.accuracy, bpc: this.bpc, baseAcc: BASE_ACC, baseBpc: BASE_BPC, bigramAcc: BIGRAM.acc, bigramBpc: BIGRAM.bpc }; }
  statusLine() { return `char ${this.pos}/${this.P.nChars} · accuracy ${(100 * this.accuracy).toFixed(0)}% (unigram ${(100 * BASE_ACC).toFixed(0)}%, bigram ${(100 * BIGRAM.acc).toFixed(0)}%) · ${this.bpc.toFixed(2)} bits/char (unigram ${BASE_BPC.toFixed(2)}, bigram ${BIGRAM.bpc.toFixed(2)}, uniform ${Math.log2(A).toFixed(2)})`; }
  outputView() { const mx = Math.max(4, ...this.counts); const top = Array.from(this.counts).map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    return top.map(([v, k]) => ({ name: 'out ' + label(ALPHA[k]), v, lo: 0, hi: mx })); }
  render(c, W, H) {
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H); c.fillStyle = '#222'; c.font = '14px system-ui'; c.fillText(this.statusLine(), 16, 24);
    // v16: one column per step, aligned: input | the prediction made while it was shown | the character that came next
    c.font = '12px system-ui'; c.fillStyle = '#555'; c.fillText('one column per step: the input, the prediction made while it was shown, the character that came next (green = right)', 16, 52);
    const ys = [82, 108, 134], x0 = 120, dx = 14, rec = this.recent.slice(-Math.floor((W - x0 - 30) / dx));
    ['input', 'predicted next', 'actual next'].forEach((t, r) => c.fillText(t, 16, ys[r]));
    c.font = '18px ui-monospace, monospace'; c.textAlign = 'center';
    rec.forEach(([inp, pred, ok], i) => { const x = x0 + i * dx + dx / 2, nx = i + 1 < rec.length ? rec[i + 1][0] : this.ch(this.pos);
      c.fillStyle = '#222'; c.fillText(label(inp), x, ys[0]); c.fillStyle = ok ? '#2a9d3a' : '#c43c3c'; c.fillText(label(pred), x, ys[1]); c.fillText(label(nx), x, ys[2]); });
    { const x = x0 + rec.length * dx + dx / 2; c.fillStyle = '#5f8cff'; c.fillText(label(this.ch(this.pos)), x, ys[0]); c.fillStyle = '#aaa'; c.fillText('…', x, ys[1]); c.fillText('?', x, ys[2]); }
    c.textAlign = 'left';
    // output spike counts of the current character
    const bw = (W - 32) / A, mx = Math.max(4, ...this.counts);
    c.font = '11px ui-monospace, monospace';
    for (let k = 0; k < A; k++) { const h = this.counts[k] / mx * 120; c.fillStyle = '#c9c3b6'; c.fillRect(16 + k * bw, 180, bw - 2, 120); c.fillStyle = '#5f8cff'; c.fillRect(16 + k * bw, 300 - h, bw - 2, h);
      c.fillStyle = '#333'; c.fillText(label(ALPHA[k]), 16 + k * bw + bw / 2 - 3, 316); }
    c.font = '12px system-ui'; c.fillStyle = '#555'; c.fillText('output spikes while the current character is shown (winner = prediction)', 16, 340);
    c.fillText(`corpus: ${CORPUS.length} chars, alphabet ${A} symbols; ${this.P.charTicks} ticks per character`, 16, 370);
  }
}
registerEnv({
  id: 'text', name: 'Text: next-character prediction (stub)', view: { width: 700, height: 500 },
  // v17 (round 18): the stub never learns (0% right); the UI no longer offers it: choosing text opens Sequence prediction + Text corpus
  redirect: { env: 'seq', params: { source: 'text' } },
  description: 'Characters of a tiny corpus, one-hot; predict the next character (winner-take-all). Skeleton for text without lifetime learning; for learned next-character prediction use Sequence prediction with Sequence = Text corpus (plan predictKL).',
  defaultPlan: 'v1',
  params: {
    nChars: { value: 60, min: 10, max: 400, step: 10, label: 'Characters per episode' },
    charTicks: { value: 4, min: 1, max: 12, step: 1, label: 'Ticks per character' },
    wrongCost: { value: 0.2, min: 0, max: 1, step: 0.05, label: 'Dopamine dip on a wrong prediction' },
    beta: { value: 0.5, hidden: true }, inGain: { value: 10, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  },
  io: textIO,
  create(seed, P) { return new TextTask(seed, P); },
});
SpikingArena.text = { CORPUS, ALPHA, FABLES, FABLES_ALPHA, FABLES_BIGRAM, BASE_ACC, BASE_BPC, BIGRAM, TextTask };
})();

/* =====================================================================
 * envs/sequence.js — 'Sequence prediction' (v9): learn TRANSITIONS within a lifetime.
 * A stream of symbols (one-hot) is shown one at a time. Every symbol slot:
 *   on   (onTicks):   the symbol's input is on; a GO/clock pulse in the first goTicks resets working memory
 *   hold (holdTicks): nothing is shown; the outputs are read (winner-take-all over spike counts) as the
 *                     prediction of the NEXT symbol.
 * Sources (a new random sequence rule every lifetime, so it must be LEARNED, not inherited):
 *   cycle   a random order of the K symbols, repeated (deterministic; optimal accuracy 1)
 *   markov  each symbol has one preferred successor (probability det), otherwise a random other symbol
 *   order2  a repeating pattern in which the successor depends on the previous TWO symbols
 *           (A B A C ...: after A comes B or C depending on what came before A)
 *   text    the tiny text corpus (19 characters), from a random start
 * Score: accuracy of the predictions; also accuracy in the first and last quarter of the lifetime (learning
 * curve), bits per symbol, against chance (1/K) and the optimal predictor (the true rule; for text: bigram).
 * ===================================================================== */
(function () {
'use strict';
const NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TXT = () => SpikingArena.text;
const isText = P => P.source === 'text' || P.source === 'fables' || P.source === 'book';   // R60: 'book' = the real corpus (js/envs/book.js, Node only)   // v19: 'fables' = the larger corpus (24 symbols)
const BOOK = () => { if (!SpikingArena.book) throw new Error("source 'book' needs js/envs/book.js (Node runner only)"); return SpikingArena.book; };
function symbolsOf(P) { if (isText(P)) return (P.source === 'book' ? BOOK().ALPHA : P.source === 'fables' ? TXT().FABLES_ALPHA : TXT().ALPHA).map(c => c === ' ' ? '␣' : c); return NAMES.slice(0, P.K | 0).split(''); }

function seqIO(P) {
  const names = symbolsOf(P), K = names.length, w = K > 12 ? 0.92 : 0.8, xs = spread(K, -w, w);
  const inputs = names.map((n, k) => ({ name: 'in_' + n, group: 'symbol', tag: 1, cls: 1, pos: [xs[k], 1], cue: true, topo: xs[k] }));
  if (!P.clock2) inputs.push({ name: 'go', group: 'go', tag: 3, cls: 4, pos: [0, 0.8], midline: true });
  else {   // v10 two-phase clock, BROADCAST across the tissue (like a diffuse thalamic / neuromodulatory clock):
           // GO2 (tag 8), then GO1 (tag 3, also during the first tick of the symbol), before every symbol
    const xc = spread(P.nClock, -0.9, 0.9);
    xc.forEach((x, i) => inputs.push({ name: 'go' + i, group: 'go', tag: 3, cls: 4, pos: [x, 0.95], midline: true, diffuse: true }));
    xc.forEach((x, i) => inputs.push({ name: 'goB' + i, group: 'go2', tag: 8, cls: 2, pos: [x, 0.97], midline: true, diffuse: true }));
    // v21 three-phase clock (clock3): GO3 one tick before GO2 (resets the two-back memory of the context region, plan predictK3)
    if (P.clock3) xc.forEach((x, i) => inputs.push({ name: 'goC' + i, group: 'go3', tag: 9, cls: 2, pos: [x, 0.99], midline: true, diffuse: true }));
  }
  const iTon = inputs.length;
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.9], midline: true, tonic: true });
  const outputs = names.map((n, k) => ({ name: 'next_' + n, group: 'choice', tag: 4, cls: 5 + (k % 3), pos: [xs[k], -1], bias: P.outBias, topo: xs[k] }));
  return { inputs, outputs, classes: ['cue', 'symbol', 'unused', 'tonic', 'go', 'out-A', 'out-B', 'out-C'],
           tagNames: ['tag 0', 'symbol', 'tag 2', 'go', 'output', 'tag 5', 'tonic', 'free'],
           juvenile: { waves: [names.map((n, k) => k)], pairs: null, waveGain: P.inGain, tonic: [[iTon, P.tonicCurrent]],
                       kicks: { chans: P.clock2 ? Array.from({ length: 2 * P.nClock }, (_, i) => K + i) : [K], p: 0.02, gain: P.inGain } } };
}
// the sequence rule of one lifetime: next(prev2, prev1, rng) and the optimal predictor's accuracy / bits
function makeRule(P, rng) {
  const K = symbolsOf(P).length, perm = () => { const a = Array.from({ length: K }, (_, i) => i); for (let i = K - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (P.source === 'cycle') { const o = perm(), nx = new Array(K); o.forEach((s, i) => nx[s] = o[(i + 1) % K]);
    return { first: o[0], next: (a, b) => nx[b], optAcc: 1, optBits: 0, firstOrderAcc: 1, desc: 'cycle ' + o.map(i => NAMES[i]).join('') }; }
  if (P.source === 'markov') { const o = perm(), pref = new Array(K); o.forEach((s, i) => pref[s] = o[(i + 1) % K]); const d = P.det;
    const bits = -(d * Math.log2(d) + (d < 1 ? (1 - d) * Math.log2((1 - d) / (K - 1)) : 0));
    return { first: o[0], next: (a, b) => { if (rng() < d) return pref[b]; let c = (rng() * (K - 1)) | 0; if (c >= pref[b]) c++; return c; }, optAcc: Math.max(d, (1 - d) / (K - 1)), optBits: bits, firstOrderAcc: d,
             desc: `markov: preferred successor with p=${d}` }; }
  if (P.source === 'order2') {   // pattern x0 y x0 z x1 y' x1 z' ...: successor of the shared symbol depends on the one before it
    const o = perm(), half = Math.max(1, Math.floor(K / 3)), pat = [];
    for (let i = 0; i < half; i++) { const a = o[i], b = o[half + i], c = o[(2 * half + i) % K]; pat.push(a, b, a, c); }
    let pos = 0; const seqNext = () => pat[(pos++) % pat.length];
    // accuracy of the best 1st-order predictor on this pattern (counted): after a shared symbol 50%
    return { first: seqNext(), next: () => seqNext(), optAcc: 1, optBits: 0, firstOrderAcc: (pat.length - half) / pat.length, desc: 'second-order pattern ' + pat.map(i => NAMES[i]).join(''), order2: true }; }
  if (P.source === 'order3') {   // v19: segments x_i Y Z s_i: after the shared pair Y Z the successor depends on the symbol THREE back
    const o = perm(), h = Math.max(1, Math.floor((K - 2) / 2)), Y = o[2 * h], Z = o[(2 * h + 1) % K], pat = [];
    for (let i = 0; i < h; i++) pat.push(o[i], Y, Z, o[h + i]);
    const acc = k => { const tab = new Map(); for (let i = 0; i < pat.length; i++) { const key = Array.from({ length: k }, (_, j) => pat[(i - j + pat.length * 4) % pat.length]).join(','), y = pat[(i + 1) % pat.length];
      if (!tab.has(key)) tab.set(key, new Map()); const m = tab.get(key); m.set(y, (m.get(y) || 0) + 1); } let hit = 0; for (const m of tab.values()) hit += Math.max(...m.values()); return hit / pat.length; };
    let pos = 0; const seqNext = () => pat[(pos++) % pat.length];
    return { first: seqNext(), next: () => seqNext(), optAcc: 1, optBits: 0, firstOrderAcc: acc(1), secondOrderAcc: acc(2), desc: `third-order pattern ${pat.map(i => NAMES[i]).join('')} (order-2 limit ${(100 * acc(2)).toFixed(0)}%)`, order3: true }; }
  // R60 (I66) real corpus: stream TRAIN from a random start (any length; wraps only after 3.3 M symbols); with evalSyms > 0 the last
  // evalSyms symbols of the life come from HELD (book endings never in TRAIN, random start) and the fitness is the accuracy there.
  // R140 long-context probe (copy after delay): segments X f1 .. fd ? X: payload X (one of the first K/3 symbols), d random fillers
  // (d uniform in [dMin, dMax], default 4..30), the cue (last symbol), then X again, then gap (default dMax) fillers, so no other payload
  // letter lies within dMax + 5 letters of the cue (the copy is unambiguous). The letter after the cue is set by the letter d+1 back;
  // every other next letter is random (fillers, next payload). Probe accuracy = accuracy on the letter after the cue (chance 1 / #payloads).
  if (P.source === 'delaycopy') { const pay = Math.max(2, Math.floor(K / 3)), cue = K - 1, nf = K - 1 - pay, dMin = P.dMin > 0 ? P.dMin | 0 : 4, dMax = P.dMax > 0 ? P.dMax | 0 : 30, gap = P.gap >= 0 && P.gap != null ? P.gap | 0 : dMax, q = [];
    const seg = () => { const X = (rng() * pay) | 0; q.push(X); const d = dMin + ((rng() * (dMax - dMin + 1)) | 0); for (let i = 0; i < d; i++) q.push(pay + ((rng() * nf) | 0)); q.push(cue, X); for (let i = 0; i < gap; i++) q.push(pay + ((rng() * nf) | 0)); };
    const nx = () => { if (!q.length) seg(); return q.shift(); };
    return { first: nx(), next: () => nx(), optAcc: 1, optBits: 0, firstOrderAcc: 0, delaycopy: { pay, cue, dMin, dMax }, desc: `copy after delay ${dMin}-${dMax} (${pay} payloads, ${nf} fillers, cue)` }; }
  if (P.source === 'book') { const B = BOOK(), C = B.TRAIN, H = B.HELD, A = B.ALPHA, IDX = new Map(A.map((c, i) => [c, i])), bg = B.bigram();
    const nTr = P.evalSyms > 0 ? Math.max(1, P.nSyms - P.evalSyms) : Infinity; let pos = (rng() * C.length) | 0, i = 0, hp = -1;
    const next = () => { i++; if (i <= nTr) return IDX.get(C[(++pos) % C.length]); if (hp < 0) hp = (rng() * H.length) | 0; return IDX.get(H[(hp++) % H.length]); };
    return { first: IDX.get(C[pos]), next, optAcc: bg.acc, optBits: bg.bpc, firstOrderAcc: bg.acc, unigramAcc: bg.uniAcc, unigramBits: bg.uniBpc,
             heldFrom: nTr === Infinity ? -1 : nTr, desc: `book corpus (${C.length} train / ${H.length} held-out characters; corpus bigram ${(100 * bg.acc).toFixed(0)}%)` }; }
  // text
  const T = TXT();
  if (P.source === 'fables') { const C = T.FABLES, IDX = new Map(T.FABLES_ALPHA.map((c, i) => [c, i])), B = T.FABLES_BIGRAM; let pos = (rng() * C.length) | 0;
    return { first: IDX.get(C[pos]), next: () => IDX.get(C[(++pos) % C.length]), optAcc: B.acc, optBits: B.bpc, firstOrderAcc: B.acc,
             unigramAcc: B.uniAcc, unigramBits: B.uniBpc, desc: `fables corpus (${C.length} characters; corpus bigram ${(100 * B.acc).toFixed(0)}%)` }; }
  const C = T.CORPUS, IDX = new Map(T.ALPHA.map((c, i) => [c, i])); let pos = (rng() * C.length) | 0;
  return { first: IDX.get(C[pos]), next: () => IDX.get(C[(++pos) % C.length]), optAcc: T.BIGRAM.acc, optBits: T.BIGRAM.bpc, firstOrderAcc: T.BIGRAM.acc,
           unigramAcc: T.BASE_ACC, unigramBits: T.BASE_BPC, desc: 'text corpus (optimal 1-character predictor = bigram)' };
}

// v10: CALIBRATED READOUT for bits per symbol. The raw read-out (softmax with a fixed temperature) is not a
// calibrated probability. Two online calibrators turn spike counts into probabilities, learning only from the
// past (follow-the-leader over a small grid: at each symbol the setting with the lowest log loss SO FAR is used):
//   soft:  p ~ (1 - eps) softmax(beta * counts) + eps / K   (beta = inverse temperature, eps = floor)
//   count: p ~ (counts + alpha) / (sum + K alpha)           (spike counts smoothed with a uniform prior)
// The prediction (accuracy) is unchanged: these only score how well the spike counts carry probabilities.
const CAL_SOFT = []; for (const b of [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3]) for (const e of [0.01, 0.03, 0.1, 0.3]) CAL_SOFT.push([b, e]);
const CAL_COUNT = [0.03, 0.1, 0.3, 1, 3, 10];
class Calib {
  constructor(K) { this.K = K; this.ls = new Float64Array(CAL_SOFT.length); this.lc = new Float64Array(CAL_COUNT.length); this.bitsSoft = 0; this.bitsCount = 0; this.n = 0; }
  pSoft(c, target, beta, eps) { let m = -Infinity; for (const v of c) m = Math.max(m, beta * v); let z = 0; for (const v of c) z += Math.exp(beta * v - m);
    return (1 - eps) * Math.exp(beta * c[target] - m) / z + eps / this.K; }
  pCount(c, target, a) { let s = 0; for (const v of c) s += v; return (c[target] + a) / (s + this.K * a); }
  add(c, target) {
    // v11: a brain with fewer prediction columns than symbols (e.g. env switched to text under an old population) -> missing columns count 0
    if (!(target < c.length)) { const k = Math.max(c.length, target + 1, this.K); c = Array.from({ length: k }, (_, i) => c[i] || 0); }
    const amin = a => { let j = 0; for (let i = 1; i < a.length; i++) if (a[i] < a[j]) j = i; return j; };
    const bs = amin(this.ls), bc = amin(this.lc);   // best so far (past only)
    this.bitsSoft += -Math.log2(this.pSoft(c, target, ...CAL_SOFT[bs])); this.bitsCount += -Math.log2(this.pCount(c, target, CAL_COUNT[bc])); this.n++;
    CAL_SOFT.forEach(([b, e], i) => { this.ls[i] += -Math.log2(this.pSoft(c, target, b, e)); });
    CAL_COUNT.forEach((a, i) => { this.lc[i] += -Math.log2(this.pCount(c, target, a)); });
  }
}

class SeqTask {
  constructor(seed, P, spec) {
    this.P = P; this.names = symbolsOf(P); this.K = this.names.length; this.rng = mulberry32((seed ^ 0x6a09e667) >>> 0);
    this.rule = makeRule(P, this.rng);
    const n = P.nSyms; this.seq = [this.rule.first]; for (let i = 1; i <= n; i++) this.seq.push(this.rule.next(this.seq[i - 2], this.seq[i - 1]));
    // R45 (I49 analogy test, off by default): relabel > 0 -> from that fraction of the life on, every symbol is renamed by one fixed random
    // permutation (same structure, new names). Compare accuracy right after the switch (stats q2 for relabel 0.5) with a fresh brain (firstQuarter).
    if (P.relabel > 0 && P.relabel < 1) { const pm = Array.from({ length: this.K }, (_, i) => i); for (let i = this.K - 1; i > 0; i--) { const j = (this.rng() * (i + 1)) | 0; [pm[i], pm[j]] = [pm[j], pm[i]]; }
      this.relabelAt = Math.max(1, Math.floor(n * P.relabel)); for (let i = this.relabelAt; i <= n; i++) this.seq[i] = pm[this.seq[i]]; }
    this.nOut = this.K; this.bIdx = isText(P) ? this.names.indexOf('␣') : -1; this.bc = { tp: 0, fp: 0, fn: 0, itp: 0, ifp: 0, ifn: 0 };   // R42: word-boundary confusion (brain and online bigram)
    this.heldFrom = this.rule.heldFrom != null ? this.rule.heldFrom : -1; this.genSyms = P.source === 'book' && P.genSyms > 0 ? P.genSyms | 0 : 0; this.gen = [];   // R60 book: held-out eval / free-running generation
    this.t = 0; this.pos = 0; this.phaseT = 0; this.c2 = P.clock2 ? (P.clock3 ? 3 : 2) : 0; this.slot = this.c2 + P.onTicks + P.holdTicks;   // clock2: two clock ticks (GO2, GO1) before the symbol
    this.counts = new Float64Array(this.K); this.lastCounts = new Float64Array(this.K);
    this.hits = []; this.ideal = []; this.cal = new Calib(this.K); this.idealBits = 0; this.tab = Array.from({ length: this.K }, () => new Float64Array(this.K)); this.correct = 0; this.n = 0; this.bits = 0; this.rewardLog = []; this.recent = []; this.horizon = n * this.slot;
  }
  targetOf(s) { return s; }   // v30: the output that is right for next symbol s (seqchoice: a per-lifetime arm mapping)
  get done() { return this.pos >= this.P.nSyms + this.genSyms; }
  sense(ext) {
    const P = this.P, K = this.K;
    if (!this.c2 && this.phaseT < P.onTicks) ext[this.seq[this.pos]] = P.inGain;
    if (!this.c2) { if (this.phaseT < P.goTicks) ext[K] = P.goGain; ext[K + 1] = P.tonicCurrent; return; }
    // clock2 slot: [GO2: reset the previous-symbol memory] [GO1: copy memory -> previous-symbol memory, reset memory]
    //              [symbol (GO1 still on in its first goTicks)] [prediction window]
    //   (v21 clock3: one more tick first, [GO3: reset the two-back memory])
    const nc = P.nClock, c2 = this.c2, ph = this.phaseT - c2, c3 = c2 === 3;
    if (ph >= 0 && ph < P.onTicks) ext[this.seq[this.pos]] = P.inGain;
    if (this.phaseT === c2 - 1 || (ph >= 0 && ph < P.goTicks)) for (let i = 0; i < nc; i++) ext[K + i] = P.goGain;
    if (this.phaseT === c2 - 2) for (let i = 0; i < nc; i++) ext[K + nc + i] = P.goGain;
    if (c3 && this.phaseT === 0) for (let i = 0; i < nc; i++) ext[K + 2 * nc + i] = P.goGain;
    ext[K + (c3 ? 3 : 2) * nc] = P.tonicCurrent;
  }
  // R65 output gate (pl.outGate > 0): confidence of the read-out (share of the winner, or winner - runner-up margin, over the total)
  gateOf(agent) { if (this.gateThr === undefined) { const p = agent && agent.net && agent.net.p; this.gateThr = p && p.outGate > 0 ? p.outGate : 0; this.gateMode = p ? p.outGateMode | 0 : 0; this.gE = 0; this.gH = 0; this.gN = 0; } return this.gateThr; }
  confOf(c) { let tot = 0, a = 0, b = 0; for (let j = 0; j < c.length; j++) { const v = c[j]; tot += v; if (v > a) { b = a; a = v; } else if (v > b) b = v; }
    return tot > 0 ? (this.gateMode === 1 ? (a - b) / tot : a / tot) : 0; }
  act(out, agent) {
    const P = this.P, K = this.K; let ev = null;
    if (this.phaseT >= this.slot - P.readTicks) { const g = P.readIn || 0;   // v13 readIn > 0: graded decoder, adds readIn x the output cells' summed synaptic input
      const nO = Math.min(this.nOut, out.spikes.length); if (g > 0 && out.input) for (let k = 0; k < nO; k++) this.counts[k] += out.spikes[k] + g * Math.max(0, out.input[k]); else for (let k = 0; k < nO; k++) this.counts[k] += out.spikes[k]; }
    this.phaseT++; this.t++;
    if (this.phaseT >= this.slot && this.pos >= this.P.nSyms) {   // R60 free-running generation (book, genSyms): the prediction becomes the next input
      let k = Dec.wta(this.counts), tot = 0; for (let j = 0; j < K; j++) tot += this.counts[j];
      const gt = this.gateOf(agent);
      if (gt > 0) { this.ggN = (this.ggN || 0) + 1; if (tot > 0 && this.confOf(this.counts) >= gt) this.ggE = (this.ggE || 0) + 1;   // gated generation: confident -> the winner, else sample
        else if (tot > 0) { const T = this.P.genTemp > 0 ? this.P.genTemp : 1, w = new Float64Array(K); let z = 0; for (let j = 0; j < K; j++) z += (w[j] = Math.pow(this.counts[j] + 0.01, 1 / T)); let u = this.rng() * z; for (k = 0; k < K - 1 && (u -= w[k]) > 0; k++); } }
      else if (this.P.genTemp > 0 && tot > 0) { const w = new Float64Array(K); let z = 0; for (let j = 0; j < K; j++) z += (w[j] = Math.pow(this.counts[j] + 0.01, 1 / this.P.genTemp)); let u = this.rng() * z; for (k = 0; k < K - 1 && (u -= w[k]) > 0; k++); }   // genTemp > 0: sample p ~ counts^(1/T)
      this.gen.push(k); this.genConf = (this.genConf || 0) + (tot > 0 ? this.counts[k] / tot : 0); this.seq[this.pos + 1] = k;
      this.lastCounts.set(this.counts); this.counts.fill(0); this.phaseT = 0; this.pos++; return null; }
    if (this.phaseT >= this.slot) {                 // end of the slot: the prediction of the next symbol
      if (this.pos === this.heldFrom) this.h0 = { c: this.correct, n: this.n, b: this.bits, bs: this.cal.bitsSoft, bc: this.cal.bitsCount, cn: this.cal.n };   // R60: held-out part starts
      const target = this.targetOf(this.seq[this.pos + 1]), k = Dec.wta(this.counts), ok = k === target;
      // ideal online 1st-order learner on the same stream: predicts the most frequent successor seen so far
      const row = this.tab[this.seq[this.pos]]; let bi = 0; for (let j = 1; j < K; j++) if (row[j] > row[bi]) bi = j;
      this.ideal.push(row[bi] > 0 && bi === target ? 1 : 0);
      if (this.bIdx >= 0) { const b = this.bIdx, bc = this.bc, pb = k === b, ib = row[bi] > 0 && bi === b, tb = target === b;   // R42 boundary F1
        if (pb && tb) bc.tp++; else if (pb) bc.fp++; else if (tb) bc.fn++; if (ib && tb) bc.itp++; else if (ib) bc.ifp++; else if (tb) bc.ifn++; }
      { let rs = 0; for (const v of row) rs += v; this.idealBits += -Math.log2((row[target] + 0.5) / (rs + 0.5 * K)); }   // online bigram counter, add-1/2 (KT) estimate
      row[target]++; this.cal.add(this.counts, target);
      const p = Dec.softmax(this.counts, P.beta), q = (1 - 0.05) * p[target] + 0.05 / K;
      this.bits += -Math.log2(q); this.n++; if (ok) this.correct++; this.hits.push(ok ? 1 : 0);
      if (k === this.seq[this.pos]) this.nEcho = (this.nEcho || 0) + 1;   // v16 display: predictions equal to the current input
      this.recent.push([this.seq[this.pos], k, ok, target]); if (this.recent.length > 40) this.recent.shift();   // [input, predicted next, right?, actual next]
      this.rewardLog.push([this.t, ok ? 1 : 0]); this.lastCounts.set(this.counts);
      ev = { pos: ok ? 1 : 0, neg: ok ? 0 : P.wrongCost, pain: 0, reward: ok ? 1 : 0 }; if (this.outcomeEv) ev.outcome = true;
      if (this.gateOf(agent) > 0) { this.gN++; if (this.confOf(this.counts) >= this.gateThr) { this.gE++; if (ok) this.gH++; } else ev = { pos: 0, neg: 0, pain: 0, reward: 0 }; }   // R65 abstention: no outcome
      this.counts.fill(0); this.phaseT = 0; this.pos++;
    }
    return ev;
  }
  quarter(i) { const n = this.hits.length, a = Math.floor(n * i / 4), b = Math.floor(n * (i + 1) / 4); let s = 0; for (let j = a; j < b; j++) s += this.hits[j]; return b > a ? s / (b - a) : 0; }
  idealAcc(q) { const h = this.ideal, n = h.length, a = q == null ? 0 : Math.floor(n * q / 4), b = q == null ? n : Math.floor(n * (q + 1) / 4); let s = 0; for (let j = a; j < b; j++) s += h[j]; return b > a ? s / (b - a) : 0; }
  get accuracy() { return this.n ? this.correct / this.n : 0; }
  lastAcc(m) { const h = this.hits, a = Math.max(0, h.length - m); let s = 0; for (let j = a; j < h.length; j++) s += h[j]; return h.length > a ? s / (h.length - a) : 0; }   // v17: running 'last m' accuracy
  get bps() { return this.n ? this.bits / this.n : Math.log2(this.K); }
  score() { return this.accuracy; }
  fitness() { if (this.h0) return 10 * this.heldAcc; return 10 * (0.5 * this.accuracy + 0.5 * this.quarter(3)); }
  get heldAcc() { const h = this.h0; return h && this.n > h.n ? (this.correct - h.c) / (this.n - h.n) : 0; }
  f1(t, f, n) { return t ? 2 * t / (2 * t + f + n) : 0; }
  get bF1() { const c = this.bc; return this.f1(c.tp, c.fp, c.fn); }
  stats() { const c = this.bc; return { bF1: this.bF1, bP: c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0, bR: c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0, bF1bigram: this.f1(c.itp, c.ifp, c.ifn), symbols: this.n, accuracy: this.accuracy, firstQuarter: this.quarter(0), q1: this.quarter(1), q2: this.quarter(2), lastQuarter: this.quarter(3), bits: this.bps,
                     chance: 1 / this.K, optimal: this.rule.optAcc, idealOnline: this.idealAcc(), idealLast: this.idealAcc(3), optBits: this.rule.optBits, firstOrder: this.rule.firstOrderAcc, unigram: this.rule.unigramAcc,
                     bitsSoft: this.cal.n ? this.cal.bitsSoft / this.cal.n : 0, bitsCount: this.cal.n ? this.cal.bitsCount / this.cal.n : 0, idealBits: this.n ? this.idealBits / this.n : 0, unigramBits: this.rule.unigramBits, ...this.bookStats(), ...this.gateStats() }; }
  gateStats() { return this.gateThr > 0 && this.gN ? { gateCov: this.gE / this.gN, gatePrec: this.gE ? this.gH / this.gE : 0 } : {}; }
  bookStats() { const h = this.h0; if (!h) return {}; const n = this.n - h.n, cn = this.cal.n - h.cn;   // R60 held-out stats (book with evalSyms)
    return { heldAcc: this.heldAcc, heldN: n, heldBits: n ? (this.bits - h.b) / n : 0, heldBitsSoft: cn ? (this.cal.bitsSoft - h.bs) / cn : 0, heldBitsCount: cn ? (this.cal.bitsCount - h.bc) / cn : 0, trainAcc: h.n ? h.c / h.n : 0 }; }
  statusLine() { return `symbol ${Math.min(this.pos + 1, this.P.nSyms)}/${this.P.nSyms} · accuracy ${(100 * this.accuracy).toFixed(0)}% · last 100 ${(100 * this.lastAcc(100)).toFixed(0)}% (first quarter ${(100 * this.quarter(0)).toFixed(0)}%, last ${(100 * this.quarter(3)).toFixed(0)}%) · chance ${(100 / this.K).toFixed(0)}% · ideal counter ${(100 * this.idealAcc()).toFixed(0)}% · optimal ${(100 * this.rule.optAcc).toFixed(0)}% · ${this.bps.toFixed(2)} bits (calibrated ${(this.cal.n ? this.cal.bitsSoft / this.cal.n : 0).toFixed(2)})`; }
  // v16 display: the read window is the last readTicks ticks of the slot; before it, the last prediction is shown
  get inRead() { return this.phaseT >= this.slot - this.P.readTicks; }
  // v19: the key numbers for the app's status line (shown only there)
  get drawsOutputs() { return true; }
  keyStats() { return this.n ? `accuracy ${(100 * this.accuracy).toFixed(0)}% · last 100 ${(100 * this.lastAcc(100)).toFixed(0)}%` : 'accuracy –'; }
  // v19: output spike counts to display: the read window in progress once it has spikes, otherwise the last finished one
  shownCounts() { let s = 0; for (const v of this.counts) s += v; const live = this.inRead && s > 0; return { live, c: live ? this.counts : this.lastCounts }; }
  // v19: learning curve = accuracy per bin of `bin` symbols over the whole lifetime ({ i0, n, acc, partial })
  curveBin() { return Math.max(10, Math.round(this.P.nSyms / 20)); }
  curve() { const bin = this.curveBin(), h = this.hits, out = [];
    for (let a = 0; a < h.length; a += bin) { const b = Math.min(h.length, a + bin); let s = 0; for (let j = a; j < b; j++) s += h[j]; out.push({ i0: a, n: b - a, acc: s / (b - a), partial: b - a < bin }); }
    return out; }
  outputView() {
    const { live, c } = this.shownCounts(), mx = Math.max(1, ...c);
    return Array.from(c, (v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([v, k]) => ({ name: (live ? 'now ' : 'last ') + this.names[k], v, lo: 0, hi: mx }));
  }
  render(c, W, H) {
    const K = this.K, P = this.P, N = this.names, last = this.recent[this.recent.length - 1], st = this.stats();
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H); c.textAlign = 'left';
    // one line of reference numbers (the brain's own accuracy is in the status line)
    c.font = '11px system-ui'; c.fillStyle = '#666';
    c.fillText(`${this.rule.desc.replace(/ \(.*\)$/, '')} · chance ${(100 / K).toFixed(0)}%` + (isText(P) ? ` · unigram ${(100 * this.rule.unigramAcc).toFixed(0)}%` : '') +
      ` · 1st-order counter ${(100 * this.idealAcc()).toFixed(0)}% · optimal ${(100 * this.rule.optAcc).toFixed(0)}%` +
      (this.n ? ` · ${(st.bitsSoft).toFixed(2)} bits · echo ${(100 * (this.nEcho || 0) / this.n).toFixed(0)}%` : ''), 14, 18);
    // NOW panel: input being shown, the prediction for the NEXT symbol (live in the read window), the last result
    const presenting = this.phaseT < this.c2 + P.onTicks, cur = this.done ? -1 : this.seq[this.pos];
    let pk = -1; if (this.inRead) { let m = 0; for (let k = 0; k < K; k++) if (this.counts[k] > m) { m = this.counts[k]; pk = k; } }
    c.font = '12px system-ui'; c.fillStyle = '#555'; c.fillText('input now', 14, 42); c.fillText('prediction for the next symbol', 130, 42);
    c.font = 'bold 30px ui-monospace, monospace'; c.fillStyle = presenting ? '#e08a00' : '#3b6fd8'; c.fillText(cur < 0 ? '–' : N[cur], 30, 78);
    c.fillStyle = pk >= 0 ? '#3b6fd8' : '#aaa'; c.fillText(pk >= 0 ? N[pk] : '…', 170, 78);
    c.font = '11px system-ui'; c.fillStyle = '#777';
    c.fillText(this.c2 && this.phaseT < this.c2 ? 'clock' : presenting ? 'shown (teacher)' : 'gap', 14, 94);
    c.fillText(this.inRead ? `read window ${this.phaseT - (this.slot - P.readTicks) + 1}/${P.readTicks}` : 'waiting for the read window', 130, 94);
    if (last) { c.fillStyle = last[2] ? '#2a9d3a' : '#c43c3c'; c.font = 'bold 16px system-ui'; c.fillText(last[2] ? '✓ right' : '✗ wrong', 340, 64);
      c.font = '12px system-ui'; c.fillStyle = '#444'; c.fillText(`after '${N[last[0]]}': predicted '${last[1] < 0 ? '·' : N[last[1]]}', next was '${N[last[3]]}'`, 340, 84); }
    // history table (v25): two aligned rows. Column j = the input symbol of step j; under it the prediction made one step
    // earlier (for exactly that symbol): green = it matches the input above, red = it does not; the first column has none.
    // The last column is the symbol now (orange while it is shown); after it, '?' with the live prediction (blue).
    const x0 = 112, dx = 16, ncol = Math.min(this.recent.length, Math.floor((W - x0 - 46) / dx)), rec = this.recent.slice(this.recent.length - ncol), ys = [130, 154];
    const ins = rec.length ? rec.map(r => r[0]).concat([rec[rec.length - 1][3]]) : [], prd = ins.map((_, j) => j ? rec[j - 1][1] : null), grn = ins.map((s0, j) => j ? prd[j] === s0 : null);
    c.font = '12px system-ui'; c.fillStyle = '#555';
    ['input', 'prediction'].forEach((t, r) => c.fillText(t, 14, ys[r]));
    c.font = '16px ui-monospace, monospace'; c.textAlign = 'center';
    ins.forEach((s0, j) => { const x = x0 + j * dx + dx / 2, now = j === ins.length - 1 && cur >= 0;
      c.fillStyle = now && presenting ? '#e08a00' : '#222'; c.fillText(N[s0], x, ys[0]);
      if (j) { c.fillStyle = grn[j] ? '#2a9d3a' : '#c43c3c'; c.fillText(prd[j] < 0 ? '·' : N[prd[j]], x, ys[1]); if (!grn[j]) { c.fillStyle = 'rgba(196,60,60,.10)'; c.fillRect(x - dx / 2, ys[0] - 16, dx, 44); } } });
    if (cur >= 0) { const x = x0 + ins.length * dx + dx / 2; c.fillStyle = '#aaa'; c.fillText('?', x, ys[0]); c.fillStyle = '#3b6fd8'; c.fillText(pk >= 0 ? N[pk] : '…', x, ys[1]);
      c.strokeStyle = '#3b6fd8'; c.strokeRect(x - dx / 2, ys[0] - 16, dx, 44); }
    this.drawnTable = { inputs: ins.slice(), preds: prd.slice(), green: grn.slice() };   // (browser test)
    // learning curve over the whole lifetime: accuracy per bin of symbols (hollow = bin in progress)
    const bin = this.curveBin(), cv = this.curve(), gx = 44, gy = 206, gw = W - 80, gh = 110, yOf = a => gy + gh - a * gh, xOf = i => gx + i / P.nSyms * gw;
    c.textAlign = 'left'; c.font = '12px system-ui'; c.fillStyle = '#333'; c.fillText(`accuracy per ${bin} symbols over this lifetime`, gx, gy - 8);
    c.font = '10px system-ui'; c.strokeStyle = '#ddd'; c.fillStyle = '#777';
    for (const a of [0, 0.5, 1]) { c.beginPath(); c.moveTo(gx, yOf(a)); c.lineTo(gx + gw, yOf(a)); c.stroke(); c.textAlign = 'right'; c.fillText(a === 0.5 ? '50%' : (100 * a) + '%', gx - 4, yOf(a) + 3); }
    c.textAlign = 'center'; for (const i of [0, P.nSyms / 2, P.nSyms]) c.fillText(String(Math.round(i)), xOf(i), gy + gh + 12);
    c.textAlign = 'left'; c.strokeStyle = '#bbb'; c.strokeRect(gx, gy, gw, gh);
    c.setLineDash([4, 4]);
    for (const [v, col, lab] of [[1 / K, '#999', 'chance'], [this.rule.optAcc, '#2a9d3a', 'optimal']]) { c.strokeStyle = col; c.beginPath(); c.moveTo(gx, yOf(v)); c.lineTo(gx + gw, yOf(v)); c.stroke(); c.fillStyle = col; c.textAlign = 'right'; c.fillText(lab, gx + gw - 3, yOf(v) - 3); c.textAlign = 'left'; }
    c.setLineDash([]);
    c.strokeStyle = '#3b6fd8'; c.lineWidth = 2; c.beginPath(); cv.forEach((p, i) => { const x = xOf(p.i0 + p.n / 2), y = yOf(p.acc); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.lineWidth = 1;
    cv.forEach(p => { const x = xOf(p.i0 + p.n / 2), y = yOf(p.acc); c.beginPath(); c.arc(x, y, 3, 0, 7); if (p.partial) { c.fillStyle = '#f4f1ea'; c.fill(); c.strokeStyle = '#3b6fd8'; c.stroke(); } else { c.fillStyle = '#3b6fd8'; c.fill(); } });
    c.fillStyle = '#777'; c.textAlign = 'center'; c.fillText('symbols', gx + gw / 2, gy + gh + 24); c.textAlign = 'left';
    // output spikes: the read window in progress, or the last finished one (the prediction it made); green box = actual next
    const { live, c: src } = this.shownCounts(), bw = Math.min(40, (W - 60) / K), mx = Math.max(1, ...src), y0 = 382, bh = 60;
    let hiP = -1; if (live) hiP = pk; else if (last) hiP = last[1]; const hiT = !live && last ? last[3] : -1;
    c.font = '12px system-ui'; c.fillStyle = '#333';
    c.fillText(live ? `output spikes in the read window now (for the symbol after '${N[cur]}')` : last ? `output spikes of the last read window (after '${N[last[0]]}'; green box = actual next)` : 'output spikes', 30, y0 - 8);
    c.font = '10px system-ui';
    for (let k = 0; k < K; k++) { const v = src[k], h = v / mx * bh, x = 30 + k * bw; c.fillStyle = '#e2ded5'; c.fillRect(x, y0, bw - 3, bh); c.fillStyle = k === hiP ? '#3b6fd8' : '#8fa9e6'; c.fillRect(x, y0 + bh - h, bw - 3, h);
      if (v > 0) { c.fillStyle = h > bh - 12 ? '#fff' : '#333'; c.textAlign = 'center'; c.fillText(String(Math.round(v)), x + (bw - 3) / 2, h > bh - 12 ? y0 + 11 : y0 + bh - h - 2); }
      if (k === hiT) { c.strokeStyle = '#2a9d3a'; c.lineWidth = 2; c.strokeRect(x - 1, y0 - 1, bw - 1, bh + 2); c.lineWidth = 1; }
      c.fillStyle = '#333'; c.textAlign = 'center'; c.font = '12px ui-monospace, monospace'; c.fillText(N[k], x + bw / 2 - 1, y0 + bh + 14); c.font = '10px system-ui'; }
    c.textAlign = 'left';
    this.drawn = { bars: Array.from(src), live, curve: cv.length };   // (browser test)
  }
}

SpikingArena.SeqTask = SeqTask; SpikingArena.seqIO = seqIO; SpikingArena.seqSymbols = symbolsOf;   // v30: reused by envs/seqchoice.js
registerEnv({
  id: 'seq', name: 'Sequence prediction (learned transitions)', view: { width: 700, height: 480 },
  description: 'A stream of symbols with a new rule every lifetime (cycle, Markov chain, 2nd-order pattern or text): predict the next symbol. Needs lifetime learning.',
  defaultPlan: P => (P.clock2 && P.clock3) ? 'deepURSx3' : (P.clock2 ? 'predictK2' : 'predictK') + ((isText(P) || P.K > 12) ? (P.clock2 ? 'XO' : 'L') : ''),   // v19: XO (own-column M2 reset) replaces XG   // big alphabets need the 36x36 tissue; the two-phase clock -> second-order plan
  // v17 (round 18): the task choice (kept by 'Reset to recommended settings') and the recommended settings per task:
  // Text -> two-phase clock (second-order plan predictK2XG) and a 1000-character lifetime (accuracy keeps rising past 200)
  taskKeys: ['source', 'K', 'det'],
  // v21 (round 22): text, fables and order3 -> three-phase clock (two-region third-order plan predictK3, DEFAULTS_VERSION 19)
  recommend: P => P.source === 'text' ? { clock2: true, clock3: true, nSyms: 1000, readIn: 0.01 } : P.source === 'fables' ? { clock2: true, clock3: true, nSyms: 2000, readIn: 0.01 } : P.source === 'book' ? { clock2: true, clock3: true, nSyms: 10000, evalSyms: 2000, readIn: 0.01 } : P.source === 'order3' ? { clock2: true, clock3: true, readIn: 0.01 } : {},
  // v36 (R62): the three-phase-clock tasks recommend the graded decoder (readIn 0.01: ties between output counts are broken by the outputs' synaptic input; ~30% of book predictions were ties)
  params: {
    source: { value: 'cycle', label: 'Sequence', options: [['cycle', 'Cycle: a random order of the symbols, repeated'], ['markov', 'Markov chain: preferred successor with probability p'],
              ['order2', 'Second-order pattern (successor depends on two symbols)'], ['order3', 'Third-order pattern (successor depends on three symbols)'], ['text', 'Text corpus (19 characters)'], ['fables', 'Fables: larger text corpus (4270 characters, 24 symbols)']] },
    K: { value: 4, min: 2, max: 16, step: 1, label: 'Alphabet size (not for text)' },
    det: { value: 0.8, min: 0.3, max: 1, step: 0.05, label: 'Markov: probability of the preferred successor' },
    nSyms: { value: 200, min: 20, max: 5000, step: 20, label: 'Symbols per lifetime' },
    relabel: { value: 0, hidden: true },
    evalSyms: { value: 0, hidden: true },   // R60 (book): the last evalSyms symbols come from the held-out text; fitness = accuracy there
    genSyms: { value: 0, hidden: true },    // R60 (book): after the life, free-run this many symbols (prediction fed back as input; run/gen.js freezes learning)
    genTemp: { value: 0, hidden: true },    // R60 (book generation): 0 = winner-take-all, > 0 = sample the next symbol with p ~ spike counts^(1/genTemp)   // R45 (I49): rename all symbols by one random permutation from this fraction of the life on (0 = off)
    onTicks: { value: 4, min: 2, max: 12, step: 1, label: 'Symbol duration (ticks)' },
    holdTicks: { value: 4, min: 1, max: 12, step: 1, label: 'Prediction window (ticks)' },
    clock2: { value: false, label: 'Two-phase clock (GO2 then GO1 before each symbol; for the two-step memory of plan predictK2)' },
    clock3: { value: false, label: 'Three-phase clock (GO3 before GO2; with the two-phase clock: the context region of plan predictK3)' },   // v21
    wrongCost: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'Dopamine dip on a wrong prediction' },
    goTicks: { value: 1, hidden: true }, nClock: { value: 9, hidden: true }, readTicks: { value: 4, hidden: true }, readIn: { value: 0, hidden: true }, beta: { value: 0.5, hidden: true },
    inGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  },
  io: seqIO,
  create(seed, P, spec) { return new SeqTask(seed, P, spec); },
});

/* ---------- hand-designed TRANSITION-LEARNING plan 'predictK' ----------
 * memoryK (current symbol held by topographic memory columns M, reset by the GO/clock pulse through the
 * inhibitory X pool) plus a PREDICTION band P of topographic columns between the memory and the outputs:
 *   P cells receive the symbol input of their column (an instructive TEACHER input, like a climbing fibre)
 *     and project to the output of their column.
 *   M axons descend to the P band and split there into two parallel fibres (bifAt) that cross ALL P columns:
 *     a broad projection whose synapses are the only plastic ones (PLAST -> RECV), all-to-all, any K.
 * Learning (teacher-gated plasticity, pl.teach): when the next symbol arrives, its P column gets a teacher
 * event; the memory of the PREVIOUS symbol is still active (the GO pulse silences it only now and keeps the
 * new memory from starting), so M(previous) -> P(next) synapses are potentiated, and every M cell keeps the
 * sum of its plastic weights fixed (preNorm): its weights track how often each symbol followed it.
 * In the prediction window M(current) drives P(most likely next) -> its output wins. */
function createPredictPlan(tune) {
  const T = Object.assign({ y: 0.42, yP: -0.38, yPtop: -0.12, yM: 0.333, yTop: 0.583, xc: 0.17, nSeed: 13, nSeedP: 13, x0: 0.9, tc: 0.3, maxCells: 420, topoW: 0.1, snap: 1,
                            normE: 45, normI: 200, satisfy: 2, wIn: 30, wHid: 10, leak: 0, clen: -2, t0: 5, sx: 5, thr: 0, xthr: 0, pthr: 0, branchMax: 40, em4: 3, em5: 3, g4: 5,
                            coll: 5, reach: 1.7, xgo: 5, xIn: -5, pIn: 5, pGo: -5, s7: 5, bifAt: 0.3, grid: 24, rule: 'teach', lr: 0.02, preNorm: 20, teachThr: 20, plateau: 4, tauPre: 12, plastic: 1 }, tune);
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, 0.6, 0.3, 0.6, 0.15, 0.3, 0.3];
  const ant = y => Math.exp(-(1 - y) / lam[1]);
  wg(0, 1, 40); wg(0, BIAS, -40 * ant(T.yM));                         // s0: +1 front (M band)
  wg(1, 0, 40); wg(1, BIAS, -40 * Math.exp(-T.xc / lam[0]));          // s1: +1 central
  wg(2, 1, 40); wg(2, BIAS, -40 * ant(T.yTop));                       // s2: +1 in front of the band (dies)
  wg(4, 1, -150); wg(4, BIAS, 150 * ant(T.yPtop));                    // s4: +1 in the back band (P)
  const G = k => CH_NCHEM + k;                                          // s3: inside the circuit = M, X or P
  wg(3, G(0), 20); wg(3, G(1), 20); wg(3, G(2), -60); wg(3, G(4), 60); wg(3, BIAS, 20);   // = s0 + s1 - 3 s2 + 3 s4 + 1 > 0
  wg(6, TIME, -40); wg(6, BIAS, 40 * T.tc);                          // s6: proliferation clock
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  // fate(out, M, X, P): M = s0 (front), P = s4 (back band), X = the rest (back, central; lateral ones die)
  const fate = (out, M, X, P) => { const a = (M - X) / 2, d = (P - X) / 2; r(out, 0, a); r(out, 4, d); rb(out, X + a + d); };
  for (let o = 0; o < CH_NO; o++) rb(o, -5);
  for (let k = 0; k < 7; k++) rb(k < 6 ? CO.G + k : CO.G6, 0);
  r(CO.DIV, 6, 5); rb(CO.DIV, 0); r(CO.AXON, 6, -5); r(CO.AXON, 3, 5); rb(CO.AXON, -5);
  r(CO.DIE, 3, -10);
  if (T.kill === 'P') fate(CO.DIE, -5, -5, 20); else if (T.kill === 'M') fate(CO.DIE, 40, -5, -5);   // v21: one band only (regions of plan rewardKR)
  fate(CO.INH, -5, 5, -5); fate(CO.THR, T.thr, T.xthr, T.pthr); fate(CO.BRANCH, 5, 5, -5);
  fate(CO.T + 1, 5, T.xIn, T.pIn); fate(CO.T + 3, -5, T.xgo, T.pGo); fate(CO.T + 7, 5, -5, -5); fate(CO.T + 0, T.t0, -5, -5); fate(CO.T + 5, -5, -5, 5);
  fate(CO.S + 7, T.s7, -5, -5); fate(CO.S + 5, 5, -5, -5); fate(CO.S + 4, -5, -5, 5); fate(CO.S + 0, -5, T.sx, -5);
  fate(CO.TOPO, 5, -5, 5); fate(CO.BIF, 5, 5, -5); fate(CO.PROJ, -5, -5, 5); fate(CO.COLL, T.coll, -5, -5); fate(CO.CLEN, T.clen, -5, -5);
  fate(CO.LEAK, T.leak, -5, -5); fate(CO.EM4, T.em4, -5, -5); fate(CO.EM5, -5, -5, T.em5);
  fate(CO.PLAST, T.plastic ? 5 : -5, -5, -5); fate(CO.RECV, -5, -5, 5);
  fate(CO.G + 5, 5, 0, 0); fate(CO.G + 1, -5, 0, 0); fate(CO.G + 3, 0, 0, 5); fate(CO.G + 4, 0, T.g4, 0);
  const seeds = spread(T.nSeed, -T.x0, T.x0).map(x => [x, T.y]).concat(spread(T.nSeedP, -T.x0, T.x0).map(x => [x, T.yP]));
  const pl = Object.assign(defaultPlasticity(), { lr: T.lr, aMinus: 0.3, tauPre: T.tauPre });
  if (T.rule === 'teach') Object.assign(pl, { teach: 1, teachThr: T.teachThr, plateau: T.plateau, preNorm: T.preNorm });
  else Object.assign(pl, { lr: T.lrR != null ? T.lrR : 0.05, tauElig: T.tauElig || 50, preNorm: 0 });
  return { kind: 'cell', label: 'hand-designed transition-learning plan (memory columns -> plastic all-to-all -> prediction columns)', seed: 1, Wg, R, lam, seeds, s0: new Array(H).fill(0),
           sc: Object.assign(cellDefaults(), { pDiv: 0.9, maxCells: T.maxCells, trophHid: 0.3, wHid: T.wHid, wIn: T.wIn, eyeReach: T.reach, topoW: T.topoW, topoSnap: T.snap,
                                               normE: T.normE, normI: T.normI, satisfy: T.satisfy, branchMax: T.branchMax, homeoRate: 0, grid: T.grid, plastRecv: 1, bifAt: T.bifAt, afferent: 1 }),
           pl, nCh: 1, ch: [defaultChannel()], fitness: null };
}
registerPlan('predictK', 'transition-learning plan (memory -> plastic -> prediction columns)', () => createPredictPlan(),
  'memoryK columns hold the current symbol; their parallel fibres reach every prediction column through plastic synapses; the next symbol is the teacher');
// the same plan on a finer tissue (36 x 36 grid instead of 24 x 24): room for about 20 columns (text: 19 characters)
const LARGE = { grid: 36, nSeed: 19, nSeedP: 19, maxCells: 900, topoW: 0.065 };
registerPlan('predictKL', 'transition-learning plan, large tissue (up to ~20 symbols)', () => { const d = createPredictPlan(LARGE); d.label += ' (36x36 tissue)'; return d; },
  'predictK on a 36 x 36 grid: room for about 20 symbol columns (text)');

/* ---------- hand-designed SECOND-ORDER plan 'predictK2' (v10) ----------
 * predictK plus a memory of the PREVIOUS symbol and conjunctive cells. Seven bands from front to back:
 *   M   memory columns: hold the current symbol (reset by GO1 through X), as in predictK
 *   X   inhibitory stripe: GO1 -> X -| M
 *   R   copy relay (CLAW = fast compact cells, threshold high): fire only when M of their column AND the GO1
 *       clock are active (a gated copy), and drive M2 of their column
 *   M2  previous-symbol memory columns: loaded by R during GO1 (before M is reset), latched by recurrence,
 *       reset by GO2 through X2 one tick earlier. During a symbol M2 holds the symbol before it.
 *   X2  gated reset (inhibitory CLAW cells of each column): fire only when their M2 column is active AND the GO2
 *       clock arrives, and silence that column (a global reset would also hyperpolarise the column to be loaded)
 *   C   conjunctive cells (granule-like, CLAW): direct input from M of their own column + parallel fibres from
 *       ALL M2 columns, of which each keeps one random column (claw). With a fast membrane and a small input
 *       budget each fires only for its pair (previous symbol j, current symbol i): sparse mixed selectivity.
 *   P   prediction columns, as in predictK; plastic parallel fibres from M (first order) and from C (second
 *       order) cross all of them, the next symbol's input is the teacher.
 * Bands are set by staircase genes on the anterior gradient; tags: M T0 T1, X->S0, R T0 (+ weak T3 = gate),
 * M2 T2, X2 T4 (+ weak T8 = GO2 gate; M2 seeks S4) -> S2, C T7, P T1 T5. Needs the env's two-phase clock (seq: clock2). Nothing depends on K. */
function createPredict2Plan(tune) {
  const T = Object.assign({ bands: [0.667, 0.417, 0.333, 0.25, 0.083, 0, -0.417], seedY: [0.542, 0.167, -0.125, -0.292, -0.6], nSeed: 13, x0: 0.9, tc: 0.3,
                            maxCells: 560, grid: 24, topoW: 0.1, snap: 1, normE: 45, normI: 200, satisfy: 2, wIn: 30, wHid: 10, branchMax: 150, reach: 2.6,
                            em4: 3, em5: 3, bifAt: 0.8, gate: -0.2, gate2: -0.2, rBranch: -2.5, hebb: 0, preLag: 8, clawIn: 12, mBif: 1, x2coll: -5, rThr: 5, x2Thr: 4.5, cThr: -3, m2Thr: -5, clawLeak: 0.5, clawNorm: 16, leak: 0, clen: -2, coll: 5, m2coll: 0, m2leak: -5,
                            rule: 'teach', lr: 0.3, preNorm: 40, teachThr: 20, plateau: 8, tauPre: 12, plastic: 1, cPlastic: 1, mFibre: 0, lam1: 0.6, lam4: 0.1, lam5: 0.1 }, tune);
  const H = CH_H, Wg = new Array(H * CH_NIN).fill(0), R = new Array(CH_NO * (H + 1)).fill(0);
  const wg = (gene, col, v) => { Wg[gene * CH_NIN + col] = v; }, TIME = CH_NCHEM + H, BIAS = TIME + 1;
  const lam = [0.5, T.lam1, 0.3, 0.6, T.lam4, T.lam5, 0.3], GS = T.grid, h = 2 / GS;
  const ant = y => Math.exp(-(1 - y) / lam[1]);
  // staircase genes: s = +1 in front of the band boundary y_k (sharp to half a grid row)
  // v14 T.mix: a MIXING band G between C and P (bands then has 8 boundaries; the C|G boundary uses spare gene 9)
  // v15 T.gap: the same 8-boundary layout but the G band is empty (its cells die): the XM geometry without the mixing layer
  const MIX = !!T.mix, GAP = !MIX && !!T.gap, G8 = MIX || GAP, SG = G8 ? [0, 1, 2, 4, 5, 7, 9, 8] : [0, 1, 2, 4, 5, 7, 8], NB = SG.length;
  T.bands.forEach((y, k) => { const gain = 3 / (ant(y) * (h / 2) / lam[1]); wg(SG[k], 1, gain); wg(SG[k], BIAS, -gain * ant(y)); });
  wg(6, TIME, -40); wg(6, BIAS, 40 * T.tc);                                                        // s6: proliferation clock
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; }, addb = (out, v) => { R[out * (H + 1) + H] += v; };
  // band(out, [top, M, X, R, M2, X2, C, P]): output value in each band (exact for s = +-1)
  // (MIX: the G value of each output is inserted before P from the table gv, default -5 = off)
  const gv = MIX ? { [CO.AXON]: 0, [CO.THR]: T.gThr || 0, [CO.PLAST]: 5, [CO.TOPO]: 5, [CO.BIF]: 5, [CO.BRANCH]: 5, [CO.XSYN]: 5, [CO.T + 5]: 5, [CO.S + 5]: 5,
                     [CO.G + 5]: 5, [CO.G + 4]: 0, [CO.G + 3]: 0, [CO.MIX]: 5 } : GAP ? { [CO.DIE]: 5, [CO.G + 5]: 0, [CO.G + 4]: 0, [CO.G + 3]: 0 } : null;
  const band = (out, f) => { if (G8 && f.length === 8) f = [...f.slice(0, 7), gv[out] != null ? gv[out] : -5, f[7]];
    let b = f[NB]; for (let k = 0; k < NB; k++) { const d = (f[k] - f[k + 1]) / 2; r(out, SG[k], d); b += d; } rb(out, b); };
  const on = (out, ...idx) => { const f = new Array(8).fill(-5); for (const i of idx) f[i] = 5; band(out, f); };
  const val = (out, v) => band(out, v);
  const [TOP, M, X, RL, M2, X2, C, P] = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let o = 0; o < CH_NO; o++) rb(o, -5);
  for (let k = 0; k < 7; k++) rb(k < 6 ? CO.G + k : CO.G6, 0);
  if (T.front) on(CO.DIE, TOP, C, P); else on(CO.DIE, TOP);   // v21 front: only the memory front end M X R M2 X2 (context region of predictK3)
  r(CO.DIV, 6, 5); rb(CO.DIV, 0);
  val(CO.AXON, [-10, 0, 0, 0, 0, 0, 0, 0]); r(CO.AXON, 6, -5); addb(CO.AXON, 5);
  on(CO.INH, X, X2);
  val(CO.THR, [0, 0, 0, T.rThr, T.m2Thr, T.x2Thr, T.cThr, T.pThr || 0]);
  { const f = new Array(8).fill(-5); if (T.plastic) f[M] = 5; if (T.cPlastic) f[C] = 5; band(CO.PLAST, f); }
  on(CO.RECV, P); on(CO.TOPO, M, RL, M2, X2, C, P); if (T.mBif) on(CO.BIF, M, M2, C); else on(CO.BIF, M2, C); on(CO.BIF4, M2); on(CO.PROJ, P); on(CO.CLAW, RL, X2, C);
  val(CO.EM4, [-5, -5, -5, -5, -5, -5, T.em4, -5]); val(CO.EM5, [-5, -5, -5, -5, -5, -5, -5, T.em5]);
  val(CO.COLL, [-5, T.coll, -5, -5, T.m2coll, T.x2coll, -5, -5]); val(CO.CLEN, [-5, T.clen, -5, -5, T.clen, T.clen, -5, -5]);
  val(CO.LEAK, [-5, T.leak, -5, -5, T.m2leak, -5, -5, -5]);
  val(CO.BRANCH, [-5, 5, 5, T.rBranch, 5, 5, 5, -5]);   // R: a short axon whose few synapses end in M2 (not in X2 behind it)
  on(CO.XSYN, M2);   // M2 axons make no synapses on their way down: only their parallel fibres in the C band (+ local collaterals)
  // address tags
  on(CO.T + 0, M, RL); on(CO.T + 1, M, P); on(CO.T + 2, M2); on(CO.T + 4, X2); val(CO.T + 3, [-5, -5, 5, T.gate, -5, -5, -5, -5]); on(CO.T + 5, P); on(CO.T + 7, C); val(CO.T8, [-5, -5, -5, -5, -5, T.gate2, -5, -5]);
  // seek tags
  on(CO.S + 0, M, X); on(CO.S + 2, RL, M2, X2); if (T.mFibre) on(CO.S + 5, M, C); else on(CO.S + 5, C); on(CO.S + 7, M, M2); on(CO.S + 4, M2, P);
  // guidance (0 = indifferent): back = repelled by the anterior signal, forward = attracted
  val(CO.G + 1, [0, -5, 5, -5, -5, 5, -5, 0]); val(CO.G + 5, [0, 5, 0, 0, 0, 0, 5, 0]); val(CO.G + 4, [0, 0, 0, 0, 5, 0, 0, 0]); val(CO.G + 3, [0, 0, 0, 0, 0, 0, 0, 5]);
  const seeds = []; for (const y of T.seedY) for (const x of spread(T.nSeed, -T.x0, T.x0)) seeds.push([x, y]);
  const pl = Object.assign(defaultPlasticity(), { lr: T.lr, aMinus: 0.3, tauPre: T.tauPre });
  if (T.rule === 'teach') Object.assign(pl, { teach: 1, teachThr: T.teachThr, plateau: T.plateau, preNorm: T.preNorm, preLag: T.preLag });
  else Object.assign(pl, { lr: T.lrR != null ? T.lrR : 0.05, tauElig: T.tauElig || 50, preNorm: 0 });
  if (MIX) { if (!(T.mixK > 0)) T.mixK = 4; on(CO.MIX); }   // (the band table gv puts MIX on in G only)
  for (const k of ['teachAHP', 'teachAHPDur', 'mixInh', 'mixLr', 'mixN', 'mixPrune', 'mixHomeo', 'mixRate', 'mixGate', 'metaN', 'confPow', 'confRef', 'confMax', 'trustPow', 'trustRef', 'trustMax', 'trustN', 'trustDelay', 'trust0', 'rcvDiv', 'rcvSig', 'rcvInh', 'rcvInhTau', 'rcvNoise']) if (T[k] != null) pl[k] = T[k];   // v12 plasticity genes (off unless given)
  return { kind: 'cell', label: 'hand-designed second-order plan (memory + previous-symbol memory + conjunctive cells -> plastic -> prediction columns)', seed: 1, Wg, R, lam, seeds, s0: new Array(H).fill(0),
           sc: Object.assign(cellDefaults(), { pDiv: 0.9, maxCells: T.maxCells, trophHid: 0.3, wHid: T.wHid, wIn: T.wIn, eyeReach: T.reach, topoW: T.topoW, topoSnap: T.snap,
                                               normE: T.normE, normI: T.normI, satisfy: T.satisfy, branchMax: T.branchMax, homeoRate: 0, grid: T.grid, plastRecv: 1, bifAt: T.bifAt, afferent: 1,
                                               clawLeak: T.clawLeak, clawNorm: T.clawNorm, clawIn: T.clawIn, coneSpeed: T.coneSpeed || 1, bifAt4: T.bifAt4 || 0, mixK: MIX ? T.mixK : 0, mixNorm: MIX ? (T.mixNorm || 0) : 0, mixLeak: MIX ? (T.mixLeak || 0) : 0, hebb: T.hebb, pruneFrac: T.hebb ? 0.1 : 0 }, T.sc || {}),   // T.sc: extra cell-scale overrides (v11)
           pl, nCh: 1, ch: [defaultChannel()], fitness: null };
}
registerPlan('predictK2', 'second-order plan (memory + previous-symbol memory + conjunctive cells -> plastic -> prediction columns)', () => createPredict2Plan(),
  'adds a previous-symbol memory (copied from the memory on the GO1 clock, reset by GO2) and granule-like conjunctive cells; needs the two-phase clock');
// 36x36 tissue: band edges moved onto row edges (multiples of 1/18) so the one-row bands X, R, X2 stay one row.
// NOTE (R11c): at 36 rows a 16-19 symbol alphabet leaves only ~2 cells per column, too few for clean claw/M2
// columns; this plan grows but does not yet learn text (see RESULTS R11c).
const LARGE2 = { grid: 36, nSeed: 19, maxCells: 1200, topoW: 0.065, bands: [0.667, 0.444, 0.389, 0.333, 0.111, 0.056, -0.444], seedY: [0.556, 0.222, -0.111, -0.333, -0.722] };
registerPlan('predictK2L', 'second-order plan, large tissue (up to ~20 symbols)', () => { const d = createPredict2Plan(LARGE2); d.label += ' (36x36 tissue)'; return d; },
  'predictK2 on a 36 x 36 grid (text)');
// v11 (R12): 60x60 tissue for text. Faster growth cones (coneSpeed 3) so axons cross the bigger grid in 40 steps,
// M2 only 2 rows (X2 can reset them), M fibres do not split in C (mBif 0) so the bottom C row keeps M-only cells
// (a first-order path summed with the M x M2 conjunction cells), X2 collaterals keep X2 alive, deeper M2 split (bifAt4).
// Text 1000 chars, 3 growths: last quarter 0.587 (ideal first-order counter 0.585), calibrated 2.40 bits/char (RESULTS R12).
const XL2 = { grid: 60, mBif: 0, x2coll: 5, bifAt4: 1.8, coneSpeed: 3, nSeed: 31, maxCells: 3400, branchMax: 500, topoW: 0.065, bifAt: 5.5, lr: 0.03,
              bands: [-0.2, -0.333, -0.367, -0.4, -0.467, -0.5, -0.767], seedY: [-0.267, -0.433, -0.567, -0.7, -0.883], sc: { rSyn: 0.07, rIn: 0.2 } };
registerPlan('predictK2XL', 'second-order plan, 60x60 tissue (text)', () => { const d = createPredict2Plan(XL2); d.label += ' (60x60 tissue)'; return d; },
  'predictK2 on a 60 x 60 grid with a summed first-order path; reaches the first-order counter on text');
// v12 (R13): the same tissue with metaplastic learning (metaN: running-average weights instead of a recency average),
// learned per-cell trust (trustPow: cells scale their output budget by how much probability they gave the taught symbol,
// so context-specific second-order cells outvote flat first-order ones) and a lower P threshold (pThr).
// Text 1000 chars, 8 growths: last quarter 0.650 (R12 plan 0.581, corpus bigram 0.598), 2.15 bits/char calibrated (RESULTS R13).
const XT2 = Object.assign({}, XL2, { lr: 0.1, metaN: 40, trustPow: 2, pThr: -2 });
registerPlan('predictK2XT', 'second-order plan, 60x60 tissue, metaplastic + learned trust (text)', () => { const d = createPredict2Plan(XT2); d.label += ' (60x60 tissue, trust)'; return d; },
  'predictK2XL with metaplasticity and learned per-cell trust; beats the corpus bigram on text');
// v13 (R14): + divisive normalisation (gain control) of the prediction cells' plastic input (rcvDiv): the total drive
// to the prediction layer stays ~constant, so the relatively strongest (even weak) prediction still fires.
// Text 1000 chars, 8 growths: last quarter 0.67 (0.69 with the graded tie-breaking decoder readIn 0.01; RESULTS R14).
const XN2 = Object.assign({}, XT2, { rcvDiv: 0.4, rcvSig: 20 });
registerPlan('predictK2XN', 'second-order plan, 60x60 tissue, trust + gain control (text)', () => { const d = createPredict2Plan(XN2); d.label += ' (60x60 tissue, trust, gain control)'; return d; },
  'predictK2XT with divisive normalisation of the prediction layer input');
// v14 (R15): + a MIXING band G (360 Kenyon / granule-like cells between C and P, gene MIX): each keeps 4 random C inputs
// (same column, topographic), fast membrane, feedforward inhibition (mixInh); plastic parallel fibres to P like C.
// The stack is moved up 6 rows to make room. Text 1000 chars, 8 growths: last quarter 0.70 (0.71 with readIn) vs 0.67 for
// predictK2XN. (R16: paired ablation over 40 growths, G adds +0.014; the text default is now predictK2XG.)
const XM2 = Object.assign({}, XN2, { mix: 1, bands: [0, -0.133, -0.167, -0.2, -0.267, -0.3, -0.567, -0.767], seedY: [-0.067, -0.233, -0.367, -0.5, -0.667, -0.883],
                                     mixK: 4, mixLeak: 0.5, mixNorm: 80, mixInh: 0.5 });
registerPlan('predictK2XM', 'second-order plan, 60x60 tissue, trust + gain control + mixing layer (text)', () => { const d = createPredict2Plan(XM2); d.label += ' (60x60 tissue, mixing layer)'; return d; },
  'predictK2XN with a second, sparse mixing layer of granule / Kenyon-like cells');
// v15 (R16a): the XM layout without the mixing layer (the G band dies, plan knob gap). Faster, but 0.02 below XM on text
// (32 growths): the random mixing layer does add a little (paired ablation +0.014; RESULTS R16a).
const XS2 = Object.assign({}, XN2, { gap: 1, bands: XM2.bands, seedY: [-0.067, -0.233, -0.367, -0.5, -0.883] });
registerPlan('predictK2XS', 'second-order plan, 60x60 tissue, trust + gain control, XM layout without mixing (text)', () => { const d = createPredict2Plan(XS2); d.label += ' (60x60 tissue, slim)'; return d; },
  'predictK2XM without the mixing layer (faster)');
// v15 (R16b-d): XM + an intrinsic homeostatic threshold in every mixing cell (mixHomeo 0.5, target mixRate 0.002 spikes per
// substep): silent cells become excitable, promiscuous ones selective. Text 1000 chars, 32 growths: last quarter 0.72
// (XM 0.69, XS 0.67), calibrated 1.9 bits; the default for text with the two-phase clock (RESULTS R16).
const XG2 = Object.assign({}, XM2, { mixHomeo: 0.5, mixRate: 0.002 });
registerPlan('predictK2XG', 'second-order plan, 60x60 tissue, trust + gain control + homeostatic mixing layer (text)', () => { const d = createPredict2Plan(XG2); d.label += ' (60x60 tissue, homeostatic mixing layer)'; return d; },
  'predictK2XM whose mixing cells adapt their thresholds (lifetime-balanced sparse firing)');
// v19 (R20): XG with clawOwn: every gated reset cell X2 keeps its OWN column's M2 fibres (local feedback inhibition), so
// every previous-symbol column is reset on the GO2 clock. In XG, with 2-3 X2 cells per column, the balanced claw choice left
// many columns without their own reset (stuck or never loaded, about half of them with 24 symbols). Text 1000 chars:
// last quarter 0.757 vs 0.721; fables 2000 chars: 0.325 vs 0.286 (8 paired growths; RESULTS R20). The text default.
const XO2 = Object.assign({}, XG2, { sc: Object.assign({}, XG2.sc, { clawOwn: 1 }) });
registerPlan('predictK2XO', 'second-order plan, 60x60 tissue, trust + gain control + homeostatic mixing layer + own-column reset (text)', () => { const d = createPredict2Plan(XO2); d.label += ' (60x60 tissue, own-column M2 reset)'; return d; },
  'predictK2XG whose gated reset cells keep their own column: a clean previous-symbol memory for any alphabet size');
// v21 (R22): THIRD-ORDER CONTEXT by a second region. predictK3 = two tissues linked by tracts:
//   cortex  = predictK2XO (current symbol M, previous symbol M2, conjunctive C, mixing G, prediction P)
//   context = the memory front end of the same gene program on its own tissue (bands M X R M2 X2; C and P die): its M
//             columns receive the cortex's M2 (tract 'prev', column to column), its relay R copies them on GO2 into its own
//             M2 (= the symbol TWO steps back), reset by GO3 (env three-phase clock, clock3) - a shift register M -> M2 -> M3.
//   tract M3 -> mixing: every mixing cell G of the cortex keeps the axons of one context column (claw), so mixing cells
//             become conjunctions of (current, previous) C patterns with the symbol two back; their plastic fibres to P learn.
const CTX3 = Object.assign({}, XL2, { front: 1, plastic: 0, cPlastic: 0, sc: Object.assign({}, XL2.sc, { clawOwn: 1 }) });
function createPredict3Plan(tune) {
  const T = Object.assign({ w3: 30, gain: 1 }, tune);   // R22a: w3 30 and mixing target rate 0.008 (order3:8 last quarter 0.97, text 0.773)
  const cortex = createPredict2Plan(Object.assign({}, XO2, { mixRate: 0.008 }, T.cortex || {}));
  if (!T.separate) Object.assign(cortex.pl, SpikingArena.UNIFIED_PL);   // v22: the unified learning rule (instructive + dopamine); separate: the v21 teacher rule
  const ctx = createPredict2Plan(Object.assign({}, CTX3, T.ctx || {}));
  return { kind: 'regions', label: 'two-region third-order plan (cortex predictK2XO + context shift register; tracts M2 -> context, M3 -> mixing cells)', seed: 1,
    regions: [{ name: 'cortex', color: '#6aa9ff', g: cortex, outputs: true, inputs: [{ env: 'symbol' }, { env: 'go' }, { env: 'go2' }, { env: 'tonic' }] },
              { name: 'context', color: '#f0a050', g: ctx, inputs: [{ tract: 'prev', like: 'symbol', tag: 1 }, { env: 'go2', tag: 3 }, { env: 'go3', tag: 8 }, { env: 'tonic' }] }],
    tracts: [{ name: 'M2 -> context', from: { region: 0, cls: 2 }, map: 'topo', to: { region: 1, tract: 'prev' }, gain: T.gain },
             { name: 'M3 -> mixing', from: { region: 1, cls: 2 }, map: 'claw', to: { region: 0, mix: true, w: T.w3 } }] };
}
registerPlan('predictK3', 'third-order plan: cortex + context region (needs the three-phase clock)', () => { const d = createPredict3Plan(); for (const r of d.regions) Object.assign(r.g.sc, SpikingArena.DEMAND_SC); return d; },   // v27: + local connection demand
  'predictK2XO plus a context region grown by the same gene program: a shift register holding the symbol two steps back, projecting to the mixing cells');
// R42 (I52) FRACTAL MODULE TILING: the predictK3 module (cortex + context, same gene program) repeated M times by a tiling
// rule. Each copy grows on its own tissue (own seed, so its own claw/conjunction sampling); module 0's cortex owns the
// outputs. Inter-module wiring (T.inter): 'mix' = every other module's sparse mixing cells -> module 0's plastic receivers
// (parallel fibres, total weight wTot shared over the modules, connection probability p, plastic: learned by the local rule).
function createTiledK3(M, T) {
  T = Object.assign({ inter: 'mix', wTot: 45, p: 0.3, scaleW: 1 }, T); const regions = [], tracts = [];
  for (let m = 0; m < M; m++) { const d = SpikingArena.PLANS.predictK3.make(), c = regions.length;
    d.regions.forEach((R, k) => regions.push(Object.assign(R, { name: R.name + (m ? ' ' + m : ''), outputs: m === 0 && R.outputs })));
    d.tracts.forEach(t => { t.from.region += c; t.to.region += c; t.salt = 97 * m + 1; t.name += m ? ' ' + m : ''; tracts.push(t); });
    if (m && T.inter === 'mix') tracts.push({ name: 'module ' + m + ' mixing -> module 0', from: { region: c, mix: true }, to: { region: 0, wTot: T.scaleW ? T.wTot / (M - 1) : T.wTot }, map: 'all', p: T.p, plastic: T.plastic !== 0, salt: 13 * m });
  }
  return { kind: 'regions', label: 'tiled predictK3 x' + M, seed: 1, regions, tracts };
}
for (const M of [2, 4, 8]) for (const w of [10, 22]) registerPlan('tiledK3x' + M + 'w' + w, 'R42 fractal test: x' + M + ', inter-module weight ' + w, () => createTiledK3(M, { wTot: w }), 'experimental (wiring diagnosis)');
for (const M of [2, 4, 8]) for (const w of [10, 45]) registerPlan('tiledK3x' + M + 'f' + w, 'R42 fractal test: x' + M + ', FIXED (non-plastic) inter-module weight ' + w, () => createTiledK3(M, { wTot: w, plastic: 0 }), 'experimental (wiring diagnosis: plastic inter-module fibres are rescaled by preNorm)');
for (const M of [2, 4, 8]) registerPlan('tiledK3x' + M, 'R42 fractal test: predictK3 module tiled x' + M, () => createTiledK3(M), 'experimental, off by default');
SpikingArena.createTiledK3 = createTiledK3;
// R43 (I54) SPECIALISED MODULES. slowK3xM: tiled modules (fibres from their mixing cells to module 0, as tiledK3) whose
// position along the tiling axis sets a slower mixing-cell membrane (mixLeak 0.5 / 0.8 / 0.9 / 0.95: slow context layers, I48).
const SLOW_LEAK = [0.5, 0.8, 0.9, 0.95];
function createSlowK3(M, T) { const d = createTiledK3(M, T); d.label = 'specialised modules x' + M + ' (slower mixing membrane by position)';
  for (let m = 1; m < M; m++) { const g = d.regions[2 * m].g; g.sc = Object.assign({}, g.sc, { mixLeak: SLOW_LEAK[m] }); } return d; }
// deepK3xM: deeper memory by position: module m is one more context region chained to the previous one (its M receives the
// previous context's M2 -> holds the symbol m+2 steps back), each projecting to the cortex mixing cells (claw, w3).
function createDeepK3(M, w) { const d = SpikingArena.PLANS.predictK3.make(); d.label = 'deeper-memory modules x' + M;
  for (let m = 1; m < M; m++) { const ctx = createPredict2Plan(Object.assign({}, CTX3)); Object.assign(ctx.sc, SpikingArena.DEMAND_SC); const k = d.regions.length;
    d.regions.push({ name: 'context ' + (m + 1), color: '#f0d050', g: ctx, inputs: [{ tract: 'prev', like: 'symbol', tag: 1 }, { env: 'go2', tag: 3 }, { env: 'go3', tag: 8 }, { env: 'tonic' }] });
    d.tracts.push({ name: 'M' + (m + 2) + ' -> context ' + (m + 1), from: { region: k - 1 + (m === 1 ? 0 : 0), cls: 2 }, map: 'topo', to: { region: k, tract: 'prev' } },
                  { name: 'M' + (m + 3) + ' -> mixing', from: { region: k, cls: 2 }, map: 'claw', to: { region: 0, mix: true, w: w || 30 }, salt: 31 * m }); }
  return d; }
// R43 (I53) MODULE VOTING: M independent predictK3 modules, each with its OWN output copy, summed on the shared outputs.
function createVoteK3(M, sc) { const d = createTiledK3(M, { inter: 'none' }); d.label = 'module voting x' + M;
  for (let m = 1; m < M; m++) Object.assign(d.regions[2 * m], { vote: true, voteScale: sc || 1 }); return d; }
// R43 (I55) STAGE 2 WORD REGION: a slow region (context gene program, no clock reset) whose memory columns accumulate the
// letters of the current word; the cortex's own prediction of a space ('next_␣' output) inhibits them (word reset), and they
// project to the cortex mixing cells (claw). reset 0: control without the boundary reset.
function createWordK3(T) { T = Object.assign({ reset: 30, w: 30 }, T); const d = SpikingArena.PLANS.predictK3.make(); d.label = 'predictK3 + word region';
  const wg = createPredict2Plan(Object.assign({}, CTX3)); Object.assign(wg.sc, SpikingArena.DEMAND_SC); const k = d.regions.length;
  d.regions.push({ name: 'word', color: '#7fd18b', g: wg, inputs: [{ env: 'symbol', tag: 1 }, { env: 'tonic' }] });
  d.tracts.push({ name: 'word -> mixing', from: { region: k, cls: T.cls || 0 }, map: 'claw', to: { region: 0, mix: true, w: T.w }, salt: 77 });
  if (T.reset) d.tracts.push({ name: 'predicted space -| word', from: { region: 0, out: 'next_␣' }, map: 'outReset', to: { region: k, cls: T.cls || 0, w: T.reset } });
  return d; }
for (const M of [2, 4]) { registerPlan('slowK3x' + M, 'R43 I54: specialised modules x' + M + ' (slower membrane by position)', () => createSlowK3(M), 'experimental, off by default');
  registerPlan('deepK3x' + M, 'R43 I54: deeper-memory modules x' + M + ' (chained context regions)', () => createDeepK3(M), 'experimental, off by default');
  registerPlan('voteK3x' + M, 'R43 I53: module voting x' + M, () => createVoteK3(M), 'experimental, off by default'); }
registerPlan('wordK3', 'R43 I55: predictK3 + word region reset by the predicted space', () => createWordK3(), 'experimental, off by default');
registerPlan('wordK3nr', 'R43 I55 control: word region without reset', () => createWordK3({ reset: 0 }), 'experimental, off by default');
registerPlan('wordK3r10', 'R43 I55: word region, weaker claw w10', () => createWordK3({ w: 10 }), 'experimental, off by default');

Object.assign(SpikingArena, { SeqTask, createPredictPlan, createPredict3Plan, PREDICT3_CTX: CTX3, createPredict2Plan, seqIO, PREDICT_LARGE: LARGE, PREDICT2_LARGE: LARGE2, PREDICT2_XL: XL2, PREDICT2_XT: XT2, PREDICT2_XN: XN2, PREDICT2_XM: XM2, PREDICT2_XS: XS2, PREDICT2_XG: XG2, PREDICT2_XO: XO2 });
})();

/* =====================================================================
 * envs/seqchoice.js — v30 (R31) 'Sequence + choice' (mixed task): a symbol stream as in 'seq' (three-phase clock,
 * a new sequence rule every lifetime) where every prediction is an ACTION: after each symbol the brain picks one of
 * K arms, and only the arm assigned to the NEXT symbol is rewarded. The arm assignment is a new random permutation
 * every lifetime (mapping 'random'), so the symbol shown next (the teacher) does not say which arm pays: the brain needs
 * the context of the sequence (a sequence area) AND reward learning (a reward area). Each choice is an outcome event
 * (reward or omitted reward), so the env carries both areal signals: the phase clock and a dopamine source.
 * mapping 'same': arm k pays for symbol k (prediction rewarded; the teacher alone suffices).
 * ===================================================================== */
(function () {
'use strict';
const SA = SpikingArena;
class SeqChoiceTask extends SA.SeqTask {
  constructor(seed, P, spec) {
    super(seed, P, spec); this.outcomeEv = true; const K = this.K, r = mulberry32((seed ^ 0x3c6ef372) >>> 0);
    this.map = Array.from({ length: K }, (_, i) => i);
    if (P.mapping === 'random') for (let i = K - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [this.map[i], this.map[j]] = [this.map[j], this.map[i]]; }
  }
  targetOf(s) { return this.map[s]; }
}
// R42 (I51) bottom-up stage 1: WORD-BOUNDARY CHUNKER. The letter stream of the text corpus; two outputs, 'boundary'
// (a space comes next) and 'in word'. Spaces are free labels: each read-out is an outcome event (dopamine for the right
// call). Score = boundary F1 (spaces are ~20% of characters, so plain accuracy would reward 'never a boundary').
class ChunkTask extends SA.SeqTask {
  constructor(seed, P, spec) { super(seed, Object.assign({}, P, { source: 'text' }), spec); this.outcomeEv = true; this.nOut = 2; this.sp = this.names.indexOf('␣'); this.bIdx = 0; }
  targetOf(s) { return s === this.sp ? 0 : 1; }
  score() { return this.bF1; }
  fitness() { return 10 * this.bF1; }
}
SA.ChunkTask = ChunkTask;
function io(P) { const s = SA.seqIO(Object.assign({}, P, { clock2: true, clock3: true })); s.outcome = true;
  s.outputs.forEach((o, k) => { o.name = 'arm_' + (k + 1); }); return s; }
registerEnv({
  id: 'seqchoice', name: 'Sequence + choice (mixed: context and reward)', view: { width: 700, height: 480 },
  description: 'A symbol stream with a new rule every lifetime; after each symbol pick an arm. Only the arm assigned (new every lifetime) to the NEXT symbol pays. Needs sequence context and reward learning together.',
  defaultPlan: 'deepURSx3',
  taskKeys: ['source', 'K', 'mapping'],
  params: {
    source: { value: 'order2', label: 'Sequence', options: [['cycle', 'Cycle'], ['order2', 'Second-order pattern'], ['order3', 'Third-order pattern']] },
    K: { value: 6, min: 3, max: 12, step: 1, label: 'Symbols = arms' },
    mapping: { value: 'random', label: 'Which arm pays', options: [['random', 'A random arm per symbol (new every lifetime)'], ['same', 'The arm of the next symbol']] },
    nSyms: { value: 300, min: 20, max: 5000, step: 20, label: 'Symbols per lifetime' },
    onTicks: { value: 4, hidden: true }, holdTicks: { value: 4, hidden: true }, clock2: { value: true, hidden: true }, clock3: { value: true, hidden: true },
    wrongCost: { value: 0, hidden: true }, det: { value: 0.8, hidden: true },
    goTicks: { value: 1, hidden: true }, nClock: { value: 9, hidden: true }, readTicks: { value: 4, hidden: true }, readIn: { value: 0, hidden: true }, beta: { value: 0.5, hidden: true },
    inGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  },
  io,
  create(seed, P, spec) { return new SeqChoiceTask(seed, P, spec); },
});
registerEnv({
  id: 'chunk', name: 'Word-boundary chunker (text, stage 1)', view: { width: 700, height: 480 },
  description: 'R42 experimental: letters of the text corpus; call whether a word boundary (space) comes next. Spaces are the free labels. Score = boundary F1.',
  defaultPlan: 'deepURSx3', taskKeys: [],
  params: {
    nSyms: { value: 1000, min: 20, max: 5000, step: 20, label: 'Characters per lifetime' },
    source: { value: 'text', hidden: true }, K: { value: 4, hidden: true }, det: { value: 0.8, hidden: true },
    onTicks: { value: 4, hidden: true }, holdTicks: { value: 4, hidden: true }, clock2: { value: true, hidden: true }, clock3: { value: true, hidden: true },
    wrongCost: { value: 0, hidden: true }, goTicks: { value: 1, hidden: true }, nClock: { value: 9, hidden: true }, readTicks: { value: 4, hidden: true }, readIn: { value: 0, hidden: true }, beta: { value: 0.5, hidden: true },
    inGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  },
  io(P) { const s = SA.seqIO(Object.assign({}, P, { source: 'text', clock2: true, clock3: true })); s.outcome = true;
    s.outputs = [Object.assign(s.outputs[0], { name: 'boundary', pos: [-0.5, -1], topo: -0.5 }), Object.assign(s.outputs[1], { name: 'in_word', pos: [0.5, -1], topo: 0.5 })]; return s; },
  create(seed, P, spec) { return new ChunkTask(seed, P, spec); },
});
})();

/* =====================================================================
 * envs/bandit.js (v20, round 21) — REWARD-ONLY learning.
 *   'bandit'  Contextual K-armed bandit: each trial shows one of C context cues, then GO; the brain picks an arm
 *             (winner-take-all over response-window spikes). The chosen arm pays +1 with its probability (best arm of
 *             the context pHi, the others pLo); there is no teacher and no hint which arm is best. The best arm of
 *             each context is drawn anew every lifetime and again every 'switchEvery' trials (changing rewards),
 *             so it must be learned, and re-learned, from reward alone within the lifetime.
 *   Plan 'rewardK': the actor-critic body plan (see below).
 * ===================================================================== */
(function () {
'use strict';
const SA = SpikingArena, VIEW_W = 700, VIEW_H = 480;

function banditIO(P) {
  const C = P.C | 0, K = P.K | 0, xs = C === 1 ? [0] : spread(C, -0.8, 0.8), ox = spread(K, -0.8, 0.8);
  const inputs = Array.from({ length: C }, (_, c) => ({ name: 'ctx_' + 'ABCD'[c], group: 'symbol', tag: 1, cls: 1, pos: [xs[c], 1], cue: true, topo: xs[c] }));
  // GO is broadcast across the tissue (like the two-phase clock of seq): nGo diffuse copies, so every action column gets it
  spread(P.nGo, -0.9, 0.9).forEach((x, i) => inputs.push({ name: 'go' + i, group: 'go', tag: 3, cls: 4, pos: [x, 0.95], midline: true, diffuse: true }));
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.9], midline: true, tonic: true });
  const outputs = Array.from({ length: K }, (_, k) => ({ name: 'arm_' + (k + 1), group: 'choice', tag: 4, cls: 5 + (k % 3), pos: [ox[k], -1], bias: P.outBias, topo: ox[k] }));
  return { outcome: true, inputs, outputs, classes: ['cue', 'symbol', 'unused', 'tonic', 'go', 'out-A', 'out-B', 'out-C'],
           tagNames: ['tag 0', 'cue', 'tag 2', 'go', 'output', 'tag 5', 'tonic', 'free'],
           juvenile: { waves: [inputs.slice(0, C).map((x, c) => c)], pairs: [], waveGain: P.cueGain, tonic: [[C + P.nGo, P.tonicCurrent]], kicks: { chans: [C], p: 0.02, gain: P.cueGain } } };
}

class BanditTask {
  constructor(seed, P) {
    this.P = P; this.C = P.C | 0; this.K = P.K | 0; this.rng = mulberry32((seed ^ 0x1b873593) >>> 0); const r2 = this.r2 = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    this.t = 0; this.trial = 0; this.phaseT = 0; this.phase = 'iti';
    this.ctx = Array.from({ length: P.nTrials }, () => (this.rng() * this.C) | 0);
    this.best = []; this.drawBest();
    this.counts = new Float64Array(this.K); this.lastCounts = new Float64Array(this.K);
    this.hits = []; this.rewards = []; this.silent = 0; this.nRew = 0; this.log = []; this.rewardLog = []; this.lastChoice = -1; this.lastRew = null;
    // reference learner on the same trials (does not affect the brain's stream): discounted Beta-Bernoulli Thompson sampling
    this.ref = Array.from({ length: this.C }, () => Array.from({ length: this.K }, () => [1, 1])); this.refHits = []; this.refRng = mulberry32((seed ^ 0x27d4eb2f) >>> 0);
    this.horizon = P.nTrials * (P.iti + P.cueTicks + P.delay + P.respTicks);
  }
  drawBest() { for (let c = 0; c < this.C; c++) { let b; do { b = (this.r2() * this.K) | 0; } while (this.K > 1 && this.best.length === this.C && b === this.best[c] && this.trial > 0); this.best[c] = b; } }
  get done() { return this.trial >= this.ctx.length; }
  get context() { return this.ctx[this.trial]; }
  prob(c, k) { return k === this.best[c] ? this.P.pHi : this.P.pLo; }
  phaseLen(ph) { const P = this.P; return ph === 'iti' ? P.iti : ph === 'cue' ? P.cueTicks : ph === 'delay' ? P.delay : P.respTicks; }
  sense(ext) {
    const P = this.P, C = this.C;
    while (this.phaseLen(this.phase) === 0 || this.phaseT >= this.phaseLen(this.phase)) { this.phaseT = 0; this.phase = { iti: 'cue', cue: 'delay', delay: 'resp', resp: 'iti' }[this.phase]; if (this.phase === 'resp') this.counts.fill(0); }
    if (this.phase === 'cue' || (P.cueHold && this.phase !== 'iti')) ext[this.context] = P.cueGain;
    if (this.phase === 'resp') for (let i = 0; i < P.nGo; i++) ext[C + i] = P.goGain;
    ext[C + P.nGo] = P.tonicCurrent;
  }
  act(out) {
    let ev = null;
    if (this.phase === 'resp') { for (let k = 0; k < this.K; k++) this.counts[k] += out.spikes[k]; if (this.phaseT === this.P.respTicks - 1) ev = this.decide(); }
    this.phaseT++; this.t++;
    return ev;
  }
  refChoose(c) {   // Thompson sample from Beta(a, b) per arm (gamma via sums of exponentials is exact for integer shapes; use a normal approx otherwise)
    const R = this.refRng, s = this.ref[c]; let best = -1, bv = -1;
    for (let k = 0; k < this.K; k++) { const [a, b] = s[k], m = a / (a + b), v = a * b / ((a + b) * (a + b) * (a + b + 1)), x = m + Math.sqrt(v) * gauss(R); if (x > bv) { bv = x; best = k; } }
    return best;
  }
  decide() {
    const c = this.context, k = Dec.wta(this.counts), P = this.P;
    // reference learner (same context, same reward probabilities)
    const kr = this.refChoose(c), rr = this.refRng() < this.prob(c, kr) ? 1 : 0;
    for (let j = 0; j < this.K; j++) { const s = this.ref[c][j]; s[0] = 1 + (s[0] - 1) * P.refDecay; s[1] = 1 + (s[1] - 1) * P.refDecay; }
    this.ref[c][kr][rr ? 0 : 1] += 1; this.refHits.push(kr === this.best[c] ? 1 : 0);
    let r = 0, ev;
    if (k < 0) { this.silent++; r = -P.silentCost; ev = { pos: 0, neg: P.silentCost, pain: 0, reward: r, outcome: true }; }
    else { const win = this.rng() < this.prob(c, k); r = win ? 1 : -P.missCost; if (win) this.nRew++; ev = { pos: win ? 1 : 0, neg: win ? 0 : P.missCost, pain: 0, reward: r, outcome: true }; }
    this.hits.push(k === this.best[c] ? 1 : 0); this.rewards.push(r > 0 ? 1 : 0);
    this.lastCounts.set(this.counts); this.lastChoice = k; this.lastRew = r > 0; this.lastCtx = c;
    this.log.push({ c, k, best: this.best[c], r }); if (this.log.length > 40) this.log.shift();
    this.rewardLog.push([this.t, r]);
    this.trial++; this.phaseT = 0; this.phase = 'iti';
    if (P.switchEvery > 0 && this.trial % P.switchEvery === 0 && !this.done) this.drawBest();
    return ev;
  }
  frac(a, i0, i1) { let s = 0; for (let j = i0; j < i1; j++) s += a[j]; return i1 > i0 ? s / (i1 - i0) : 0; }
  quarter(i, a) { a = a || this.hits; return this.frac(a, Math.floor(a.length * i / 4), Math.floor(a.length * (i + 1) / 4)); }
  get optRate() { return this.frac(this.hits, 0, this.hits.length); }
  // after each switch: optimal-choice rate in the 2nd half of every block (learned the current best arm)
  blockLate(a) { a = a || this.hits; const B = this.P.switchEvery > 0 ? this.P.switchEvery : a.length; let s = 0, n = 0;
    for (let b0 = 0; b0 < a.length; b0 += B) { const b1 = Math.min(a.length, b0 + B), m = b0 + Math.floor((b1 - b0) / 2); for (let j = m; j < b1; j++) { s += a[j]; n++; } } return n ? s / n : 0; }
  fitness() { const n = Math.max(1, this.ctx.length); return (this.nRew - this.P.silentCost * this.silent) / n * 10; }
  score() { return this.nRew; }
  stats() { return { trials: this.trial, optimal: this.optRate, firstQuarter: this.quarter(0), lastQuarter: this.quarter(3), blockLate: this.blockLate(), rewardRate: this.frac(this.rewards, 0, this.rewards.length),
                     silent: this.silent, chance: 1 / this.K, refOptimal: this.frac(this.refHits, 0, this.refHits.length), refLate: this.blockLate(this.refHits), refLastQuarter: this.quarter(3, this.refHits) }; }
  statusLine() { return `trial ${Math.min(this.trial + 1, this.ctx.length)}/${this.ctx.length} · ${this.phase} · best arm chosen ${(100 * this.optRate).toFixed(0)}% (last quarter ${(100 * this.quarter(3)).toFixed(0)}%) · rewarded ${this.nRew} · silent ${this.silent}`; }
  keyStats() { return this.hits.length ? `best arm ${(100 * this.optRate).toFixed(0)}% · last 20 ${(100 * this.frac(this.hits, Math.max(0, this.hits.length - 20), this.hits.length)).toFixed(0)}%` : 'best arm –'; }
  get drawsOutputs() { return true; }
  render(c, W, H) {
    const C = this.C, K = this.K, P = this.P;
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H); c.textAlign = 'left'; c.font = '11px system-ui'; c.fillStyle = '#666';
    c.fillText(`${C} context${C > 1 ? 's' : ''} × ${K} arms · best arm pays ${(100 * P.pHi) | 0}%, others ${(100 * P.pLo) | 0}%` + (P.switchEvery ? ` · best arms change every ${P.switchEvery} trials` : '') +
      ` · chance ${(100 / K).toFixed(0)}% · reference learner (Thompson) ${(100 * this.frac(this.refHits, 0, this.refHits.length)).toFixed(0)}%`, 14, 18);
    c.fillStyle = '#222'; c.font = '14px system-ui'; c.fillText(`trial ${Math.min(this.trial + 1, this.ctx.length)}/${this.ctx.length} · ${this.phase}`, 14, 42);
    // context lights + GO
    const bw = 70, x0 = 40;
    for (let k = 0; k < C; k++) { const on = this.phase !== 'iti' && this.phase !== 'resp' && this.context === k; c.fillStyle = on ? '#ffcc33' : '#d8d3c8'; c.beginPath(); c.arc(x0 + k * bw + 20, 80, 18, 0, 7); c.fill();
      c.fillStyle = '#333'; c.font = '12px system-ui'; c.textAlign = 'center'; c.fillText('context ' + 'ABCD'[k], x0 + k * bw + 20, 114); }
    c.fillStyle = this.phase === 'resp' ? '#3cb54a' : '#d8d3c8'; c.beginPath(); c.arc(x0 + C * bw + 30, 80, 14, 0, 7); c.fill(); c.fillStyle = '#333'; c.fillText('GO', x0 + C * bw + 30, 114);
    // arms: spikes in the response window, the best arm of the current context (hidden from the brain) outlined
    const cx = this.done ? this.lastCtx : this.context, live = this.phase === 'resp', src = live ? this.counts : this.lastCounts, mx = Math.max(1, ...src), aw = Math.min(90, (W - 80) / K), ax = 40, ay = 140, ah = 70;
    for (let k = 0; k < K; k++) { const x = ax + k * aw, v = src[k], h = v / mx * ah;
      c.fillStyle = '#e3ded3'; c.fillRect(x, ay, aw - 10, ah);
      c.fillStyle = !live && k === this.lastChoice ? (this.lastRew ? '#3cb54a' : '#e04848') : '#5f8cff'; c.fillRect(x, ay + ah - h, aw - 10, h);
      if (cx != null && k === this.best[cx]) { c.strokeStyle = '#2a9d3a'; c.lineWidth = 2; c.strokeRect(x - 1, ay - 1, aw - 8, ah + 2); c.lineWidth = 1; }
      c.fillStyle = '#333'; c.textAlign = 'center'; c.font = '12px system-ui'; c.fillText(`arm ${k + 1} · ${v | 0}`, x + (aw - 10) / 2, ay + ah + 14); }
    c.textAlign = 'left'; c.fillStyle = '#555'; c.font = '12px system-ui';
    c.fillText(live ? 'output spikes in the response window' : 'last choice (green = rewarded, red = not); green outline = best arm now (hidden from the brain)', ax, ay - 8);
    // learning curve: best-arm rate per block of 10 trials (blue) vs the reference learner (grey), switches dashed
    const gx = 44, gy = 270, gw = W - 80, gh = 120, n = P.nTrials, bin = 10, xOf = i => gx + i / n * gw, yOf = a => gy + gh - a * gh;
    c.font = '12px system-ui'; c.fillStyle = '#333'; c.fillText(`best arm chosen per ${bin} trials over this lifetime (blue = brain, grey = reference learner)`, gx, gy - 8);
    c.strokeStyle = '#ccc'; c.strokeRect(gx, gy, gw, gh); c.fillStyle = '#888'; c.font = '10px system-ui'; c.textAlign = 'right';
    for (const a of [0, 0.5, 1]) c.fillText((a * 100) + '%', gx - 3, yOf(a) + 3);
    c.textAlign = 'center'; for (const i of [0, n / 2, n]) c.fillText(String(Math.round(i)), xOf(i), gy + gh + 12); c.fillText('trials', gx + gw / 2, gy + gh + 24);
    c.setLineDash([4, 3]); c.strokeStyle = '#999'; c.beginPath(); c.moveTo(gx, yOf(1 / K)); c.lineTo(gx + gw, yOf(1 / K)); c.stroke();
    if (P.switchEvery) { c.strokeStyle = '#d0a040'; for (let i = P.switchEvery; i < n; i += P.switchEvery) { c.beginPath(); c.moveTo(xOf(i), gy); c.lineTo(xOf(i), gy + gh); c.stroke(); } }
    c.setLineDash([]);
    const curve = (a, col) => { c.strokeStyle = col; c.fillStyle = col; c.beginPath(); let first = true;
      for (let i0 = 0; i0 < a.length; i0 += bin) { const i1 = Math.min(a.length, i0 + bin), v = this.frac(a, i0, i1), x = xOf((i0 + i1) / 2), y = yOf(v); first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; } c.stroke();
      for (let i0 = 0; i0 < a.length; i0 += bin) { const i1 = Math.min(a.length, i0 + bin); c.beginPath(); c.arc(xOf((i0 + i1) / 2), yOf(this.frac(a, i0, i1)), 2.5, 0, 7); c.fill(); } };
    curve(this.refHits, '#aaa'); curve(this.hits, '#3a6fd8');
    // recent trials
    c.textAlign = 'left'; c.fillStyle = '#555'; c.font = '12px system-ui'; c.fillText('recent trials (top: best arm chosen? bottom: rewarded?)', 40, 432);
    this.log.forEach((l, i) => { c.fillStyle = l.k < 0 ? '#999' : l.k === l.best ? '#3cb54a' : '#e04848'; c.fillRect(40 + i * 13, 440, 10, 10);
      c.fillStyle = l.r > 0 ? '#3cb54a' : '#ccc'; c.fillRect(40 + i * 13, 453, 10, 5); });
    this.drawn = { curve: Math.ceil(this.hits.length / bin) };
  }
}

registerEnv({
  id: 'bandit', name: 'Choice: contextual bandit (reward only)', view: { width: VIEW_W, height: VIEW_H },
  description: 'A context cue, then GO: pick one of K arms. Only the reward says which arm is good; the best arms are new every lifetime and change during it. Needs reward-driven lifetime learning.',
  defaultPlan: 'unifiedR',   // v30: unified genome (grows rewardE here); v26 (R27): evolved actor-critic plan (rewardK: hand plan)
  params: {
    C: { value: 2, min: 1, max: 4, step: 1, label: 'Contexts (cues)' },
    K: { value: 3, min: 2, max: 6, step: 1, label: 'Arms' },
    pHi: { value: 0.9, min: 0.1, max: 1, step: 0.05, label: 'Reward probability of the best arm' },
    pLo: { value: 0.1, min: 0, max: 1, step: 0.05, label: 'Reward probability of the other arms' },
    switchEvery: { value: 60, min: 0, max: 400, step: 10, label: 'Best arms change every (trials)', note: '0 = never' },
    nTrials: { value: 240, min: 20, max: 1000, step: 20, label: 'Trials per lifetime' },
    missCost: { value: 0, min: 0, max: 1, step: 0.1, label: 'Dopamine dip when not rewarded', note: 'raw reward only' },
    silentCost: { value: 0.5, min: 0, max: 1, step: 0.1, label: 'Penalty for no answer' },
    cueTicks: { value: 4, min: 1, max: 20, step: 1, label: 'Cue duration (ticks)' },
    delay: { value: 0, min: 0, max: 50, step: 1, label: 'Delay (ticks)' },
    respTicks: { value: 6, min: 2, max: 30, step: 1, label: 'Response window (ticks)' },
    iti: { value: 8, min: 0, max: 60, step: 1, label: 'Inter-trial interval (ticks)' },
    cueHold: { value: true, label: 'Cue stays on until the answer' },
    refDecay: { value: 0.9, hidden: true }, nGo: { value: 9, hidden: true }, cueGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0.4, hidden: true },
  },
  io: banditIO,
  create(seed, P) { return new BanditTask(seed, P); },
});

/* ---------- ACTOR-CRITIC body plans 'rewardK' and 'rewardMemK' (v20) ----------
 * The transition-learning layout (createPredictPlan) turned into a basal-ganglia-like actor:
 *   M  topographic STATE columns, one per input channel. rewardK: relays of the present cue (no self-excitation, s7 -5);
 *      rewardMemK: working memory (self-exciting columns, s7 5) that holds the cue through a delay and is reset by GO
 *      through the shared inhibitory pool X (xgo 5), as in memoryK.
 *      Their axons bifurcate into parallel fibres that cross ALL action columns: the plastic ACTOR synapses.
 *   P  ACTION columns, one under every output (sc.topoOut): no teacher (pIn -5), driven by the broadcast GO (pGo 5, weight
 *      wGo) + the plastic fibres; each projects to its output. Shared inhibition (rcvInh) = competing columns; adaptive
 *      thresholds (rcvHomeo); one slow noise source per column (actNoise) = exploration; the chosen output excites its own
 *      column and inhibits the others (actFb, outInh), so the eligibility traces mark the action actually taken.
 *   CRITIC: a value cell reads the state cells (pl.rpe); dopamine = reward prediction error r - V at each outcome (rpeMode 1)
 *      drives reward-modulated STDP with eligibility traces (three-factor) of the actor, and the critic's own synapses. */
const RK = { pIn: -5, pGo: 5, xgo: -5, s7: -5, rule: 'rstdp', lrR: 0.05, tauElig: 100, wGo: 4 };
const RK_PL = { rpe: 1, rpeMode: 1, actNoiseV: 5, rpeGamma: 0.9, rpeLambda: 0.5, rpeLr: 0.3, preNorm: 45, rcvInh: 2, rcvInhTau: 4, actNoise: 8, actNoiseTau: 20, actFb: 15, outInh: 10, rcvHomeo: 0.02, rcvRate: 0.02, aMinus: 0.3 };
const RMK = { s7: 5, xgo: 5 };                // rewardMemK: working-memory state columns (reset by GO)
function createRewardPlan(tune, pl) {
  const T = Object.assign({}, RK, tune), d = SA.createPredictPlan(T); Object.assign(d.pl, RK_PL, T.separate ? {} : SA.UNIFIED_PL, pl);   // v22: unified rule (separate: v20 reward rule)
  d.sc.topoOut = 1; if (T.tauMod) d.ch[0].tauMod = T.tauMod; d.sc.wDiffuse = T.wGo;
  d.label = 'actor-critic plan (state columns -> plastic -> competing action columns; reward-prediction-error dopamine)'; return d;
}
registerPlan('rewardK', 'actor-critic plan (RPE dopamine, exploration noise, competing action columns)', () => createRewardPlan(),
  'state columns -> plastic parallel fibres -> action columns with shared inhibition and noise; reward-modulated STDP gated by a reward-prediction-error critic');
registerPlan('rewardMemK', 'actor-critic plan with working memory (cue -> delay -> choice)', () => { const d = createRewardPlan(RMK); d.label = d.label.replace('state columns', 'memory columns'); return d; },
  'rewardK whose state columns are self-exciting memory columns reset by GO (as in memoryK): the cue is held through the delay');
/* ---------- v21 (round 22) MULTI-REGION actor-critic 'rewardKR' ----------
 * The same gene program grown as two regions (see core/regions.js):
 *   'cortex' (sensory/state region): the state columns M (+ inhibitory X) of rewardK; its action band dies (kill P).
 *   'striatum' (action region, carries the outputs): the action columns P of rewardK; its state band dies (kill M).
 *   tract 'fibres' (map 'all', plastic): every state cell -> every action cell (corticostriatal parallel fibres), the actor's
 *   plastic synapses; the critic (value cell, RPE dopamine) reads their presynaptic cells, as in rewardK. */
function createRewardRegionsPlan(tune) {
  const T = Object.assign({ wTot: 45, p: 0.3, mem: false, killState: false }, tune), st = Object.assign({}, T.mem ? RMK : {}, T.state || {});
  const state = createRewardPlan(Object.assign({ kill: T.killState ? 'P' : null }, st)),   // v23: the cortex grows its whole program (no band killed; R24a)
    act = createRewardPlan(Object.assign({ kill: 'M', wGo: 8 }, T.action || {}));   // R22c: p 0.3, striatal GO weight 8 (best of a small sweep)
  return { kind: 'regions', label: 'two-region actor-critic plan (cortex state columns -> corticostriatal tract -> striatal action columns)', seed: 1,
    regions: [{ name: 'cortex', color: '#5aa9ff', g: state, inputs: [{ env: 'symbol' }, { env: 'go' }, { env: 'tonic' }] },
              { name: 'striatum', color: '#ffb347', g: act, inputs: [{ env: 'go' }, { env: 'tonic' }], outputs: true }],
    tracts: [{ name: 'fibres', from: { region: 0, cls: 0 }, to: { region: 1, wTot: T.wTot }, map: 'all', p: T.p, plastic: true }], fitness: null };
}
registerPlan('rewardKR', 'two-region actor-critic plan (cortex -> striatum tract)', () => createRewardRegionsPlan(),
  'rewardK grown as two regions: state columns in a cortex region, action columns in a striatum region, linked by a plastic corticostriatal tract');
registerPlan('rewardMemKR', 'two-region actor-critic plan with working memory (cortex memory columns -> striatum)', () => { const d = createRewardRegionsPlan({ mem: true }); d.label = d.label.replace('state columns', 'memory columns'); return d; },
  'rewardMemK grown as two regions: self-exciting memory columns (reset by GO) in a cortex region, action columns in a striatum region');
Object.assign(SA, { BanditTask, createRewardPlan, createRewardRegionsPlan, REWARD_K: RK, REWARD_K_PL: RK_PL, REWARD_MEM_K: RMK });
})();

/* ---------- v26 (round 27) EVOLVED actor-critic plan 'rewardE' ----------
 * The body plan of rewardMemK (self-exciting memory columns reset by GO -> plastic fibres -> competing action columns, unified
 * plateau / RPE-dopamine rule) with every gene value as found by the R26 overnight multitask run (generation 318).
 * Same developmental machinery, same learning rule; only the numbers differ: its gene regulatory network, morphogen sources and
 * scalars grow the circuit differently. No single gene explains the gain (R27 transplants: each change alone is within noise;
 * the GRN + growth scalars + modulator channel together give most of it), so the genome is kept whole.
 * 16 held-out growths vs the hand plans: bandit 6.80 vs 5.28 (rewardK), cue random 9.68 vs 4.79, recall random 1.37 vs -3.25 (rewardMemK). */
(function () {
'use strict';
const SA = SpikingArena;
const G = {"kind":"cell","cell":{"kind":"cell","seed":255891574,"Wg":[-1.088401740981051,46.08927728763233,0.12949236709642187,-0.4983606381401091,0.617432267273684,0,-0.3418480959411922,1.1555940180056166,0.5427786366262759,1.2805930790314788,-0.29239407024122666,0,1.2613417891528194,0.42397363984046454,-1.1800322694966665,-1.3329903663566958,0.5833394829885009,0.018039888805829567,-15.672862753620239,56.18507235202509,0.7972779094566268,-6.690344771509528,0.16298143356621522,0.4662605123035453,0.22180738299654906,-0.16194017987864523,-0.2240716687770299,0.06004349638171674,0.2673536934695466,2.226855182908968,-0.8444414891794765,0.969117088946718,-7.924997349633754,-0.583814481702833,0.45335079857053523,0,-0.9499487984110597,-28.470812910504385,0.28770417590625874,40,0.8712535714847867,0.4323063104188687,0,0.8238518399887561,-0.3982765788111111,-0.6555179752209348,1.5396940179443472,0.8772126302280941,-0.22876174182203624,-0.27820314895564974,0.1963667290399226,0.11883942611373721,-1.2590639226856835,-0.535045477235345,1.6791807269405326,-0.40934612029017087,-19.96297791940544,0.6308387035849465,0.47534175823969066,0.18961491521941032,1.7888280208918184,-0.5221713914860238,0.9092309057665839,-0.6756722702776262,20.995788372792198,18.81460417179116,-77.87660003301087,0.04216099449081406,28.32518220864044,-0.35829592419329936,-0.4671012901929065,-0.24516542006343028,-1.12385896924497,-1.1972771641350166,0.8013198732415766,6.290951475593671,0.7869390906464975,-150,1.110438130070038,0.12661591467169897,0.14677204346533437,-0.4021041659500277,0.34919010117202176,-0.07751765232030951,0.19549227049074785,1.2504553095364743,-0.02945576566304109,-0.3609432922404023,0.5979425421661769,-0.7557934024294441,-0.8040178412833665,0.40198000500611397,-0.7140816052847796,-0.03341142928353502,21.825848338630465,-0.7041136440034534,0.07191965587517751,0.4466548181684475,0,-3.8827546764457033,-0.07631935802737153,0.8314452193886687,0.525433525053889,0,0.5910604819270314,1.0193452888886148,-0.4398048261116667,-0.48421273755338984,-1.15071548774966,1.4467200921761054,0.5996558358021711,-0.7549993211440806,-1.2710850601180765,0.010683890118479145,-0.4206359662482512,-0.08617392126468393,-0.5160825047669587,-0.6866721564066447,-0.5135471834422736,1.1288581526344705,-2.934294917070106,-0.9970187498994532,-1.44317103482734,0.024302440177333517,0.5839775362959234,0,0.797131292792813,-0.5694542120442061,0.5971257469484454,-0.17223345809811674,2.314838227187291,-49.465394042426055,12.523770016478904,1.0066645447588947,0.8767530334831721,-0.20044121974303475,0,0.22566747702240086,0,-0.5299951393972159,0,-0.3003671685321939,0.47528590063652665,-0.4016748367159061,-0.6057608167938608,0.48224921422863026,-1.2783684140638478,-0.22453649832258482,-0.5390469516024413,3.9836040800191457,0.1300106370653689,-0.043676548418812786,-0.4432837026054292,-0.7457481643511914,1.2779452019015691,-0.6130386089159076,0.26189379920256317,-0.24202337438933727,1.144654707849975,-0.08555640361753793,0.08648352064830928,0.10159958765419444,-0.6111232549049828,6.329892666244667,-0.5504969075295635,-0.5368429008699154,0.7278081445251702,-1.2608609875685035,0.8081807439592766,1.2316690526612257,-0.5218743437580243,0.8478092336058858,-1.3674548728786393,-0.4017442720461184,-0.4634144084128358,-0.28008650168806926,-0.0805946122510175,-1.1563528059293637,1.0642969277056864,0.33613852980346975,-2.4291463918066163,0.5035281142421147,0.3366214102861823,0.40644407132309934,-1.1315535719893899,0,0.9576748851801593,-0.25886340989495626,2.7422149351463823,0.24502279024515183],"R":[2.4286669565616865,-2.6672509566463525,0.10995976173292749,0.3890336399416049,-1.778110838630543,1.306424572156848,5.050917484254615,-0.5030147634906494,0.8831333932563843,0.045955357957871146,1.4169406578321868,-1.164935582889483,0.1496415497390839,-0.6956315290675162,-5.750349622837167,-0.23089152745954333,-0.13761292098659364,-0.28170764773807727,0.05633844873934454,-0.6450754298493443,-0.9832844200417827,-5.395900697304567,-0.08632290255110009,1.4077324305831251,0.36667208774355914,0,-0.8839634616881052,0.8046498433511132,-0.22851957916732593,0.6194598949215533,0.2895721911077817,-0.4558387461462879,-2.4949436742884465,0.8483968998972657,2.573635090235203,0,-0.9665571814619993,0.6597282485270246,-0.006895762891046209,0.8335442205591466,-0.854590703718539,1.0746560360938469,-1.4024801245002587,-5.128384986720061,1.3353454955983843,0.43998865998868014,-0.12754565334640722,0,7.508468833386092,0.12314035834762836,1.1308713202112224,-1.1462673077746208,1.425149236915091,1.2754100826589958,0.5624381063677222,-8.189386699369768,-0.35754423046973444,-0.21308029893907032,0.9012244224410602,-4.680851704990459,0,0.15236541814414395,-3.880699541521084,0,0,-5,0.15576986049225927,0.6827928481361277,0.6163800981667032,-0.08304705295618105,-0.5730845593849452,-0.43021769985556446,0,0.7054497820287793,0.07276790474736167,-0.042522795778053735,-1.4810940709527631,4.453973292866759,0.15587888566562397,0,-0.8158704204760486,-0.8246535407481307,-2.5503956163688377,-0.9305232961164818,0.7114656014163143,0.13976700285059787,0.0638575186126438,0,-0.973433394997198,-0.020344777929299035,0.19068690638495056,5.595782097964926,0.8511564428958321,-0.21134092545045444,-4.0708820560620165,-0.8356107054142032,0.4945604194757452,0.6913725562582018,-5.072164950317328,0.5770245270267577,0.510908147976666,-1.5999757850475973,-0.11693525333908615,-3.2060668659914784,0.8978708771158384,-0.7445545233627574,0.8121531775006328,0.22965929922220651,0.050563645169241035,-0.7815249610360244,7.817376790827656,0,1.3594563049430133,1.6725986673933737,-0.4845695446058521,0.2507757803624948,-1.6131798066565888,0,1.351379444761233,1.2274777525020708,-1.651918587709527,7.659091923737489,0.24606968592680234,0,1.0148150018130164,0.892821002493169,-0.23595382403330303,0.7624293738530321,0.20528814140097215,0.04755626362455534,-0.4004011751632732,0.1942417271059262,-1.229157904382556,-0.345252963866652,-0.841986692055114,-0.4041531042350067,-0.42497310317717074,-0.10228516988795866,0.6652276822564835,-0.10567134677238593,-0.4385801799279956,1.0449241234491882,-2.0215149351450705,-1.7934243371268237,-0.4574791370829918,0.007860164299319227,-0.5449754081192777,0.4911943726715494,0.058352151950008896,-1.258490627596205,-0.9226074770054371,-0.903730965446666,-0.044422102547319396,-0.1183722923404764,1.1543265892985954,-0.20239610450208145,2.5482627424799964,1.1879373920674545,-2.9152733284424195,-0.3575974281175454,0.7839072440461317,1.385875852143168,1.0900244341065324,-0.9522921928646276,-4.68585728472857,-0.7665280286645483,1.9628095054443275,0.5335047100560576,0.5042250801003688,5.410901375980231,0.23613854474308538,1.0266880866102701,0.057663340917984585,1.2146228437031388,-1.320269405644821,0.0788510186095435,0.11557326578819402,-0.5777266236092768,-0.1612051100233527,-1.8190718649178383,0,0.6867680420046247,0.8565719346989731,0.3030408186514624,0.12308175474109972,-0.5321962335070151,-2.970533954097683,11.238781645909613,-0.6954741692181062,1.910397557805065,0.14532231768199289,0.37943968380006093,-0.5722054608192619,-0.4240211441737518,-0.9013228162757445,0.6870093647230983,0.09481715072593849,0.18775337437317474,-5.4773018289085575,-0.20556915619406774,0,-0.8870980313081896,-5.153096647708852,0,0.557132159270019,-2.618395374290689,0.33984388769401663,-1.1048529057953516,-3.155041005995967,4.269544771407344,-0.5013053639623306,-0.5920810276662697,-1.6134376779947026,-0.5323581845534914,0.050679984128594424,-0.21333557393142133,-2.347085892045002,0.48192052520169915,0.06414838147702864,-3.1330598489832346,-0.8751287740865882,-0.542601323935203,0.6551136348113831,-0.7866561387863544,-0.2005375667828041,-1.3465032121888347,0.5576365249356995,0.8045961207296837,0.275721420232386,0.43355256107701035,-3.67476943610534,0.43744073879461876,0.5699589076530416,0.08013803387357576,0.15534123723611964,0,-0.3615082388304985,-0.23218568846721188,0,-0.45869165190850403,0.5610685581856092,-4.6769972634893,-0.11770800030151846,0.6793333145133962,-0.965306000716079,-0.20637615604726048,5.139062035996469,-0.597505650925353,0,0.522597330137315,-0.04647730094651566,0,0.38579650890278094,3.798275102460278,0.00016267278428020885,-0.6670687545278902,-1.301068182474151,-0.13588951062342192,-0.8278884849616859,-0.5973263889814411,1.6514349602722964,0.11872590026910311,-0.48265398164435375,-0.38939332813160765,-0.8444406437377103,0.4889639032716473,-0.7144190155420456,-1.9671586611969811,-0.346309428028346,0,-1.1641111751806323,1.472052778783767,-0.6029927511966411,0,-7.379097141288392,3.0361973743769277,0.0991493068979703,-1.3993612754387097,-0.15101398171479102,1.2369859009916198,-0.2759068747459773,-0.5555636916629078,-0.8634394963710306,0.18699228057732425,-0.8581420860771444,-0.23318555216790743,0.22799672112919164,0.8340344905323526,-0.12272840707448451,-0.3921617564273836,1.4490584423508224,-0.2308005963336719,-1.9871018591266831,0,-3.146477384109039,-0.7794715028463532,0.8732777415793331,-1.9765503584287916,0.5319495500413025,-0.25409962421674964,-0.5345016391561347,0.1014303829666262,0.2552333510407255,1.3402090717912416,-1.3030801168230477,0.6424441342315889,0,-1.6377344366462943,-1.6991429237461337,1.2514886714461837,-0.8469992813796673,-0.4733063921071385,-0.32935798981569386,-1.2896839219972924,-0.21462802527566538,0.5312629211670954,-0.8674912812298062,0.01993517905259845,-1.6502635166797035,0.3845395079904993,0.1640630441388623,-0.4909070525259551,0,0.4602872943937116,0.6610664172730608,2.578892906095193,0.19144475677938724,0.04860159518449923,0.04956949025111598,2.5,-2.481869520919595,-0.2098829201258763,0.3416269430452856,0,-2.075341269291008,-1.5247308940659035,0.43199798868073813,0.1803205137020178,-0.15181115883932006,-0.11995721547845634,-0.638371885455951,2.780698698430183,-0.8091676811560625,-0.7442079033313879,-0.42623674590094407,-0.21285469119569078,-0.08048296286323575,1.3357785618456655,0,0.599319454874701,-0.366945739210806,2.098042210918664,3.929273175813756,0.8736665582612494,0.21007230664347903,0.5936450946804231,-0.6834306727113723,-0.18216420397738922,0.13720217919444316,-0.13674087703312165,-0.004862345133756215,-0.21174960803204074,0.052249693419158694,2.859150543934827,-0.36992062808659265,0.4749671396418411,-0.6355161146315026,-1.1116798938373524,-0.47645688069620024,-0.261024287916983,-0.0973769893572876,-0.2211650306045371,-0.14413390349433228,-3.3566916183491355,0.10422148736760575,0.7244773333345139,0.03635965175876857,0.21789664484989385,0.409622145943847,0.11233538851014435,-0.2101608399053092,-1.743974062315778,1.06853803139596,-0.1894233196363139,-0.7872232498245267,0.5562180097916515,-1.0499284755316785,0.7280634114148322,-0.16345023165269668,0,0,-0.2247021573621513,-0.7390638868772912,0,0.4759790319112405,-5.175902129515618,-0.027385297584917756,0.4607020278624543,0.9731190815535524,-0.027201499710205912,0.19643363980294626,1.2334203095745022,0.3355441790833514,0,-0.40266137399353985,0.20878937417088766,-4.5874383180516,1.2560604793275685,0.5974530951527163,0.8981738529491483,0.34490025742872055,-0.013075400543339666,-0.5050087737225819,0,-0.5702263211719342,0.7745773996604683,-1.0438274794530158,-3.4765189691643457,-0.14810920291474902,-0.986826688064139,-0.2150925362772279,0.5073372219005036,4.198001657022948,-1.2210546850927948,-0.4807928344526083,-0.27332009332712703,0.37798971859364233,0.0687549402822707,-0.069902165261568,2.113445537534179,0.8896174024578348,0.16084276277252274,0.981417035771561,1.6640997281711316,0.09073757546056471,-4.019688745221009,-0.17518786792970814,-1.6623041299160222,0.7955704757378114,-1.0890874853625472,7.047675770467065,0.6737987317332498,0,0.5305841899196965,6.834638317734253,-0.5153917959686213,0.08947233135554214,-0.058466144149566635,0,0,3.754886482713051,3.6875425002328788,-1.0018370728504569,1.1222689253228373,-1.2849022064318523,-9.139863116689073,-0.14605711201317062,-1.971504771783181,-0.33162369907767575,0.8557645341869838,0.24199601738157547,1.65800763623491,0,-0.4939468355889133,0.5273915737418369,-0.41911130477730124,6.079460989028313,-0.3462690753384853,-1.4093194203957937,0,0,0.72150191731047,0.9238864897008219,1.7225814683128862,-1.117871176059244,-1.8310721444535125,-0.8081729809438467,-1.0482434648998322,1.4975808384220815,0.15271364880803084,1.091132498981481,0.35228976621880476,0,-5,0.12892724895590488,0,1.6016149007346083,-0.532054530679959,-0.31951033322655653,0.9768721606151425,1.491813140644287,1.976187228411706,-1.6534669632684733,-1.0804657288892834,-5.5718844092916235,0.5045784607038012,0.166681655319867,-0.17195628541794256,-0.5297101126473018,0.5881826504858872,-0.08834587984203837,-1.8234153140732152,-0.577771918899877,0.2167379914413664,0,-2.568390490384425],"lam":[0.4980577294434942,0.7072571528093389,0.585223098600722,0.9767499916818584,0.28320843986937944,0.13610105946080686,0.24782458758242665],"seeds":[[-0.8374119038233981,0.5401115182073655],[-0.8338766810186453,0.4645985254867626],[-0.6256604657943264,0.24056482023843306],[-0.4005160756790523,0.37449999753791907],[-0.38332564726986584,0.5640379025283649],[-0.18142159328370272,0.41344017801797656],[-0.19688808701768726,0.4958871595125038],[0.02382657824826117,0.16474945883706635],[0.3061173311340389,0.45886131702336186],[0.5414436472790591,0.37804885899454654],[0.6855186636292239,0.46725823646936354],[0.8960842693950478,0.34312880953728064],[0.8702172258164966,0.44719772736780755],[-0.95,-0.4228732758957027],[-0.5820210703000661,-0.3896178897081758],[-0.7737308403217249,-0.5159341765258243],[-0.322760666455214,-0.47774610241246007],[-0.21926449691706454,-0.4408368948324601],[-0.24018693352967707,-0.18311729608091815],[-0.16591390600762732,-0.33528914896978507],[0.13229965751488304,-0.4929415077043379],[0.4419743748307876,-0.3878207614765812],[0.45991301000996776,-0.4155189832360286],[0.7791008911450001,-0.4291647790953541],[0.6129141319728778,-0.36724154517520585],[0.8761104307250259,-0.3112082675339951]],"s0":[0.07816330844548303,-0.47610421824693105,-0.5631996440323002,-0.6414846134193574,-0.00045010500623897387,0.36856725470203106,0.12473466676734413,0.3447078083161401,-0.0324930418332971,-0.8274257363220743],"sc":{"wIn":29.835977567834554,"wHid":8.633234164415592,"theta":0.351645801403641,"pDiv":1,"maxCells":389.2402357490266,"eyeReach":1.586867878977656,"rIn":0.17333553374344154,"rSyn":0.17964604238002826,"axonStart":0.3861729706792735,"axonLen":56.83811000085645,"trophMin":0.00931718010266249,"trophHid":0.3660888674012057,"hebb":0.16728442904427832,"pruneFrac":0,"homeoTarget":0.04751755775660784,"homeoRate":0.43301447513067004,"normE":49.76808828907401,"normI":133.45246157435855,"satisfy":1.877223022271277,"topoW":0.02643759092877475,"topoSnap":0.9840086295831885,"branchMax":34.24132938267818,"hunger":0,"hungerRate":0.06418782674399681,"hungerTarget":4.801163646757891,"hungerRelax":0.7294964476910762,"hungerLam":0.5122157999574463,"request":0.15083720037657317,"reqDelay":2.0554488643198283,"reqDecay":0.5169426058169546,"grid":27.593109371197034,"plastRecv":0.9723782374722606,"bifAt":0.7153188816548831,"afferent":0.7163573864646005,"clawLeak":0.11432120902113382,"clawNorm":0,"clawIn":8.051532779126939,"coneSpeed":0.6460793195892509,"bifAt4":0.0892094698489059,"mixK":4.359274531599022,"mixNorm":8.493915957602903,"mixLeak":0,"topoOut":1,"wDiffuse":4},"pl":{"lr":0.03841926628725839,"tauPre":10.152631607894007,"tauPost":24.911649589068613,"aMinus":0.03513048667234164,"tauElig":25.22199097666878,"teach":0,"teachThr":20,"plateau":4,"preNorm":45,"preLag":0,"metaN":0,"confPow":0,"confRef":1,"confMax":1,"trustPow":0,"trustRef":0.5,"trustMax":4,"trustN":200,"trustDelay":2,"trust0":-1,"rcvDiv":0,"rcvSig":1,"rcvInh":2,"rcvInhTau":4,"rcvNoise":0,"mixInh":0,"mixLr":0,"mixN":0,"mixPrune":0,"mixHomeo":0,"mixRate":0.002,"mixGate":0,"teachAHP":0,"teachAHPDur":12,"actNoise":8,"actNoiseTau":20,"rcvHomeo":0.02,"rcvRate":0.02,"actFb":15,"outInh":10,"rpe":1,"rpeGamma":0.9,"rpeLambda":0.5,"rpeLr":0.3,"rpeGain":1,"rpeSrc":0,"rpeEps":1,"rpeMode":1,"actNoiseV":5,"uni":1,"uniI":0.4},"nCh":1,"ch":[{"gFood":0.577640094304668,"gPoison":0.32175471381044624,"gWall":0.74307906447964,"tauMod":2.829923854722662,"src":-1,"gSpike":0}],"label":"evolved actor-critic plan (memory columns -> plastic -> competing action columns; RPE dopamine; genes tuned by evolution, R27)"}};
SA.registerPlan('rewardE', 'evolved actor-critic plan (rewardMemK body plan, evolved genes)', () => { const d = SA.genomeFromCompact(JSON.parse(JSON.stringify(G))); Object.assign(d.sc, SA.DEMAND_SC); return d; },   // v27: + local connection demand
  'rewardMemK body plan whose gene values were found by evolution (R26 multitask run, gen 318): the default for reward-only tasks');
})();
/* v31 (R35) 'rewardE2': the reward-area genome found by the R34 dualtag2 box run (gen 60, dual-timescale eligibility:
 * eligMix 0.24, tauElig 25.2, tauElig2 8, receiver homeostasis 0.22). 16 held-out growths vs rewardE: bandit 6.70 vs 6.69,
 * cue random 10.10 vs 10.17 (both within noise), seqchoice cycle 6.40 vs 4.55, seqchoice order2 4.52 vs 3.80. */
(function () {
const SA = SpikingArena;
const G = {"kind":"cell","cell":{"kind":"cell","seed":255891574,"Wg":[-1.088401740981051,46.08927728763233,0.12949236709642187,-0.29600998610069984,0.617432267273684,0,-0.3418480959411922,1.1555940180056166,0.5427786366262759,1.2805930790314788,-0.29239407024122666,0,1.2613417891528194,0.42397363984046454,-1.1800322694966665,-1.3329903663566958,0.5833394829885009,0.018039888805829567,-15.672862753620239,56.18507235202509,0.7972779094566268,-6.690344771509528,0.16298143356621522,0.7755440489947367,-0.19818892188795972,0.5538984141654089,-0.2240716687770299,0.06004349638171674,0.3884058249936376,2.226855182908968,-1.7239108018426545,0.969117088946718,-8.404817101669575,-0.583814481702833,0.467833146348877,0,-0.9499487984110597,-28.470812910504385,0.2550980850108509,40,0.8712535714847867,0.4323063104188687,0,0.8238518399887561,-0.3982765788111111,-0.6555179752209348,1.5396940179443472,0.8772126302280941,-0.22876174182203624,-0.27820314895564974,0.1963667290399226,0.11883942611373721,-1.2590639226856835,-0.535045477235345,1.6791807269405326,-0.40934612029017087,-19.96297791940544,0.6308387035849465,0.22261889074437224,0.18961491521941032,1.7888280208918184,-0.5221713914860238,0.6280301153963207,-0.6756722702776262,20.995788372792198,18.81460417179116,-77.87660003301087,0.04216099449081406,28.32518220864044,-0.35829592419329936,-0.4671012901929065,-0.18888621358080548,-1.12385896924497,-1.6826532275667725,0.8013198732415766,6.290951475593671,0.5083344082973673,-150,1.110438130070038,0.12661591467169897,0.14677204346533437,-0.4021041659500277,0.34919010117202176,-0.5723201856202783,0.19549227049074785,1.2504553095364743,-0.02945576566304109,-0.3609432922404023,0.5979425421661769,-0.7557934024294441,-0.8040178412833665,0.40198000500611397,-0.7140816052847796,-0.03341142928353502,21.825848338630465,-0.7041136440034534,0.07191965587517751,0.4466548181684475,0,-3.8827546764457033,-0.07631935802737153,0.8314452193886687,0.525433525053889,-0.28081953996571246,0.5910604819270314,1.0193452888886148,-0.4398048261116667,-0.48421273755338984,-1.15071548774966,1.4467200921761054,0.5996558358021711,-0.7549993211440806,-1.2710850601180765,0.4508413725069985,-0.4206359662482512,-0.08617392126468393,-0.5160825047669587,-0.6866721564066447,-0.5135471834422736,1.1288581526344705,-2.934294917070106,-0.9970187498994532,-1.44317103482734,0.024302440177333517,0.5839775362959234,0,0.4548090236397729,-0.5694542120442061,0.5971257469484454,-0.17223345809811674,2.7798325725632025,-45.319437303436175,12.523770016478904,0.317998114820583,0.8767530334831721,1.59162520937854,0,0.22566747702240086,0.11235464569160186,-0.5299951393972159,-0.044678447339645766,0.4450835854050098,0.47528590063652665,-0.4016748367159061,-0.6057608167938608,0.48224921422863026,-1.2783684140638478,-0.8807291494929396,-1.264035270996026,3.9836040800191457,0.4779604860732869,-0.043676548418812786,-0.4432837026054292,-0.7457481643511914,1.2779452019015691,-0.2114354189638601,0.26189379920256317,-0.24202337438933727,1.144654707849975,-0.08555640361753793,0.08648352064830928,0.10159958765419444,-1.4330179852374014,6.329892666244667,-0.5504969075295635,-0.5368429008699154,0.7278081445251702,-1.2608609875685035,0.8081807439592766,1.2316690526612257,-0.5218743437580243,0.8478092336058858,-1.3674548728786393,-0.4017442720461184,-0.5203455259940939,-0.28008650168806926,-0.0805946122510175,-1.40276404851999,1.0642969277056864,0.33613852980346975,-2.4291463918066163,0.5035281142421147,0.3366214102861823,0.40644407132309934,-1.1315535719893899,0,2.1035832272528503,-0.25886340989495626,2.7422149351463823,0.24502279024515183],"R":[2.4286669565616865,-2.6672509566463525,0.10995976173292749,0.3890336399416049,-1.778110838630543,1.306424572156848,5.050917484254615,-1.0329160725245643,0.8831333932563843,0.009463772782230956,1.4169406578321868,-1.164935582889483,0.1496415497390839,0.15773300213114283,-5.750349622837167,-0.23089152745954333,-0.13761292098659364,-0.28170764773807727,0.05633844873934454,-0.6450754298493443,-0.9832844200417827,-7.0971155350929624,-0.08632290255110009,1.4077324305831251,0.2315117417973855,0,-0.8839634616881052,0.8046498433511132,-0.22851957916732593,0.6194598949215533,0.2895721911077817,-0.4558387461462879,-2.0383093449357506,0.8483968998972657,2.573635090235203,0,-0.9665571814619993,0.6597282485270246,-0.006895762891046209,2.057030058412677,-0.854590703718539,1.0746560360938469,-1.4024801245002587,-5.128384986720061,1.3353454955983843,0.8024886813128188,-0.12754565334640722,0,7.508468833386092,0.12314035834762836,1.1308713202112224,-1.1462673077746208,1.425149236915091,1.2754100826589958,0.5624381063677222,-8.189386699369768,-0.35754423046973444,-0.21308029893907032,0.9012244224410602,-4.680851704990459,0.14634496374951306,-0.9165725071048897,-3.880699541521084,-0.8342430718108368,0,-5,0.15576986049225927,1.8557206318487496,0.6163800981667032,-0.08304705295618105,-0.5730845593849452,-0.43021769985556446,0,0.7054497820287793,0.07276790474736167,-0.042522795778053735,-0.9169687634698361,4.453973292866759,0.15587888566562397,0,-0.8158704204760486,-0.8246535407481307,-2.5503956163688377,-0.9305232961164818,0.9534226661967686,0.13976700285059787,0.0638575186126438,0,-0.8717795613498814,-0.020344777929299035,0.19068690638495056,5.595782097964926,0.8511564428958321,-0.21134092545045444,-4.0708820560620165,-0.8356107054142032,0.4945604194757452,0.6913725562582018,-5.072164950317328,0.5770245270267577,0.510908147976666,-1.5999757850475973,-0.11693525333908615,-3.2060668659914784,0.8978708771158384,-0.878996910305058,0.8121531775006328,-0.04393444123217605,0.050563645169241035,-0.7815249610360244,7.817376790827656,0,1.3594563049430133,1.6725986673933737,-0.4845695446058521,0.2507757803624948,-1.6131798066565888,0,1.4308601824804383,1.2274777525020708,-1.651918587709527,7.659091923737489,0.24606968592680234,0,1.0148150018130164,0.892821002493169,-0.23595382403330303,0.7624293738530321,0.6063424108534242,-0.6966137971408999,-0.4004011751632732,0.1942417271059262,-1.229157904382556,-0.345252963866652,-0.841986692055114,-0.4041531042350067,-1.0887074259073375,-0.10228516988795866,0.6652276822564835,-0.10567134677238593,-0.4385801799279956,1.0449241234491882,-2.0215149351450705,-1.7934243371268237,-0.4574791370829918,0.007860164299319227,-0.5449754081192777,0.4911943726715494,0.058352151950008896,-1.258490627596205,-0.9226074770054371,-0.903730965446666,-0.044422102547319396,-0.1183722923404764,1.1543265892985954,-0.20239610450208145,2.660419197968431,1.783099898653818,-2.9152733284424195,-0.3575974281175454,0.7839072440461317,0.7836672846395698,1.0900244341065324,-0.9522921928646276,-2.196739428913495,-1.1007315029594613,1.9628095054443275,0.5335047100560576,-0.5154233942964793,5.410901375980231,0.23613854474308538,1.0266880866102701,0.057663340917984585,1.2146228437031388,-1.320269405644821,0.0788510186095435,0.11557326578819402,-0.5777266236092768,-0.1612051100233527,-1.8190718649178383,0,0.6867680420046247,0.8565719346989731,0.3030408186514624,0.16980126505559104,-1.3368446313710947,-2.5734559763927467,11.238781645909613,-0.6954741692181062,1.910397557805065,0.14532231768199289,0.37943968380006093,-0.5722054608192619,-0.4240211441737518,-0.9013228162757445,0.6870093647230983,0.09481715072593849,0.18775337437317474,-5.4773018289085575,-1.2187643338490035,0,-0.7399282563012811,-5.153096647708852,0,0.557132159270019,-2.618395374290689,0.33984388769401663,-1.1048529057953516,-3.155041005995967,4.269544771407344,-2.425427778478528,-0.5920810276662697,-0.007985045335391794,-0.5323581845534914,0.9277450976203311,-0.11858925055849948,-2.347085892045002,0.48192052520169915,0.06414838147702864,-3.1330598489832346,-0.8751287740865882,-0.542601323935203,0.6551136348113831,-1.5539883416500566,-0.2005375667828041,-1.3465032121888347,-0.24185816272962046,0.8045961207296837,0.28009086268846617,0.43355256107701035,-3.67476943610534,0.43744073879461876,0.5699589076530416,0.08013803387357576,0.15534123723611964,0,-0.3615082388304985,-0.8235944764605535,0,-0.45869165190850403,0.5610685581856092,-4.6769972634893,-0.11770800030151846,1.2456755726013897,-0.965306000716079,-0.20637615604726048,5.139062035996469,-0.597505650925353,-0.4739961172863396,0.522597330137315,-0.04647730094651566,-0.6453916412564645,0.38579650890278094,3.798275102460278,1.256131026245848,-0.5006156886426303,-1.301068182474151,-0.13588951062342192,-0.8278884849616859,-0.08427368161645232,1.6514349602722964,0.26226037663019414,-0.2357444340088739,0.35577891281619867,-0.8444406437377103,0.4889639032716473,-0.7144190155420456,-3.22752411894726,-0.4318767498997035,0,-1.3996368499144518,1.472052778783767,-0.6029927511966411,0,-7.8293627030873365,3.0361973743769277,-0.5850426206145692,-0.9126487262698567,-0.15101398171479102,0.04707395482582033,-0.2759068747459773,-0.5555636916629078,-0.8634394963710306,0.18699228057732425,-0.8581420860771444,-0.6435482778462815,0.22799672112919164,0.8340344905323526,-0.12272840707448451,-0.3921617564273836,1.4490584423508224,-0.2308005963336719,-1.9871018591266831,0,-3.146477384109039,-0.7794715028463532,0.8732777415793331,-1.3918553150823323,0.5319495500413025,-0.25409962421674964,-0.5345016391561347,0.1014303829666262,0.2552333510407255,1.3402090717912416,-1.3030801168230477,0.6424441342315889,0,-2.2394784690999936,-1.6991429237461337,1.2514886714461837,-0.8469992813796673,-0.4733063921071385,-0.32935798981569386,-1.2896839219972924,0.29980563849868547,0.5312629211670954,-0.8674912812298062,0.01993517905259845,-1.6502635166797035,0.3845395079904993,0.1640630441388623,-0.038485043056527224,0,0.4602872943937116,0.6610664172730608,2.578892906095193,0.19144475677938724,0.04860159518449923,0.04956949025111598,2.5,-2.481869520919595,-0.2098829201258763,0.3416269430452856,-1.056618499575564,-2.075341269291008,-1.5247308940659035,0.43199798868073813,0.1803205137020178,-0.15181115883932006,-0.11995721547845634,-0.5620237601623429,2.780698698430183,-0.8091676811560625,-0.7442079033313879,-0.42623674590094407,-0.21285469119569078,-0.08048296286323575,1.3357785618456655,-0.23451313893127496,0.599319454874701,-0.366945739210806,2.098042210918664,3.929273175813756,0.283445008183684,0.21007230664347903,0.5936450946804231,-0.6834306727113723,-0.18216420397738922,0.13720217919444316,-0.13674087703312165,-0.004862345133756215,-0.36083843847586483,0.2836355473577127,2.859150543934827,-0.36992062808659265,0.02773871618977647,-0.6355161146315026,-1.1116798938373524,-0.47645688069620024,-0.261024287916983,-0.0973769893572876,-0.2211650306045371,-0.14413390349433228,-3.3566916183491355,0.10422148736760575,0.7244773333345139,0.03635965175876857,0.21789664484989385,1.0227571952845635,0.11233538851014435,-0.2101608399053092,-1.743974062315778,1.06853803139596,-0.1354318075189979,-0.7872232498245267,0.5562180097916515,-1.0499284755316785,0.7280634114148322,-0.16345023165269668,0,0,-0.2247021573621513,-0.7390638868772912,0,0.4759790319112405,-5.175902129515618,-0.027385297584917756,0.4607020278624543,0.9731190815535524,-0.027201499710205912,-0.6536577093597188,1.2334203095745022,0.3355441790833514,0,-0.40266137399353985,0.20878937417088766,-4.5874383180516,1.2560604793275685,0.5974530951527163,0.8981738529491483,0.03350253098801531,0.07198955489281474,-1.1398271349801377,0.5414026881245096,-1.398037300376476,0.323518216211747,-1.0438274794530158,-4.419514738324861,-0.14810920291474902,-0.6603235574797663,-0.2150925362772279,0.5073372219005036,4.198001657022948,-1.2210546850927948,-0.4807928344526083,-0.27332009332712703,0.37798971859364233,0.0687549402822707,-1.0588064409611047,2.113445537534179,0.8896174024578348,0.16084276277252274,0.981417035771561,1.6640997281711316,0.09073757546056471,-4.019688745221009,-0.17518786792970814,-1.6623041299160222,0.7955704757378114,-1.0890874853625472,7.047675770467065,1.1822304900671006,0,0.5305841899196965,6.834638317734253,-0.8604695697147149,1.1728099806754637,-0.1176633622719141,0,-0.058360843920708644,3.8480214937464714,3.6875425002328788,-1.0018370728504569,1.1222689253228373,-1.2849022064318523,-9.139863116689073,-0.14605711201317062,-1.971504771783181,-0.7037069754444956,0.8557645341869838,0.5446519232288082,1.65800763623491,0,-0.4939468355889133,0.5273915737418369,-0.41911130477730124,5.182350368973487,-0.3462690753384853,-1.6459871852291643,0,0,0.72150191731047,0.9238864897008219,1.7225814683128862,-1.117871176059244,-1.8310721444535125,-0.8081729809438467,-1.0482434648998322,1.4975808384220815,0.15271364880803084,1.091132498981481,0.046208554215205144,0,-2.643995591205684,0.30958735688472866,0,1.6016149007346083,-0.532054530679959,-0.31951033322655653,0.9768721606151425,1.491813140644287,1.976187228411706,-1.6534669632684733,-1.0804657288892834,-5.5718844092916235,0.5045784607038012,0.166681655319867,-0.17195628541794256,-0.5297101126473018,-0.5672094039665102,-0.08834587984203837,-1.8234153140732152,-0.577771918899877,0.2167379914413664,0,-2.568390490384425],"lam":[0.4980577294434942,0.7072571528093389,0.585223098600722,0.9767499916818584,0.24170987503815738,0.14060466743063757,0.24782458758242665],"seeds":[[-0.8787084972368135,0.5569595842372324],[-0.8338766810186453,0.4645985254867626],[-0.6256604657943264,0.24056482023843306],[-0.4005160756790523,0.37449999753791907],[-0.38332564726986584,0.5640379025283649],[-0.18142159328370272,0.41344017801797656],[-0.3085666351176646,0.4821976230648926],[-0.03478979512983863,0.1885508737282408],[0.3061173311340389,0.45886131702336186],[0.5414436472790591,0.37804885899454654],[0.6855186636292239,0.46725823646936354],[0.95,0.35507982586931686],[0.8702172258164966,0.44719772736780755],[-0.95,-0.505505284562295],[-0.559665111729782,-0.3125106633822916],[-0.7737308403217249,-0.5159341765258243],[-0.25357881863490117,-0.48543128798695734],[-0.21926449691706454,-0.4408368948324601],[-0.1925461697393846,-0.23138423710461556],[-0.16591390600762732,-0.33528914896978507],[0.06846516896711496,-0.46276700655233416],[0.3846395331611038,-0.4588182444046577],[0.45991301000996776,-0.4155189832360286],[0.782267728612352,-0.4112756476781665],[0.6129141319728778,-0.36724154517520585],[0.8040975352317331,-0.4176860032861174]],"s0":[0.07816330844548303,-0.47610421824693105,-0.5631996440323002,-0.6414846134193574,-0.00045010500623897387,0.36856725470203106,-0.07296939430863952,0.3447078083161401,-0.0324930418332971,-1],"sc":{"wIn":26.359036517197325,"wHid":8.633234164415592,"theta":0.351645801403641,"pDiv":1,"maxCells":400,"eyeReach":1.586867878977656,"rIn":0.17973296476441325,"rSyn":0.18090865819810825,"axonStart":0.3861729706792735,"axonLen":56.83811000085645,"trophMin":0.00931718010266249,"trophHid":0.3660888674012057,"hebb":0.19558688420024148,"pruneFrac":0,"homeoTarget":0.04751755775660784,"homeoRate":0.2155278453476362,"normE":49.76808828907401,"normI":133.45246157435855,"satisfy":1.877223022271277,"topoW":0.02643759092877475,"topoSnap":0.9437447695892585,"branchMax":34.24132938267818,"hunger":0,"hungerRate":0.05663430218309837,"hungerTarget":4.801163646757891,"hungerRelax":0.7137040225836884,"hungerLam":0.5122157999574463,"request":0.15083720037657317,"reqDelay":2.0554488643198283,"reqDecay":0.5169426058169546,"demand":1,"demandStart":0,"demandTarget":3,"demandRelax":0,"demandLam":0.4,"grid":27.593109371197034,"plastRecv":0.9723782374722606,"bifAt":0.7153188816548831,"afferent":0.7163573864646005,"clawLeak":0.11432120902113382,"clawNorm":0,"clawIn":5.791048452733195,"coneSpeed":0.5,"bifAt4":0.0892094698489059,"mixK":4.359274531599022,"mixNorm":10.701524504481936,"mixLeak":0,"topoOut":1,"wDiffuse":4},"pl":{"lr":0.03841926628725839,"tauPre":7.064217162851448,"tauPost":24.911649589068613,"aMinus":0,"tauElig":25.22199097666878,"teach":0,"teachThr":20,"plateau":4,"preNorm":45,"preLag":0,"metaN":0,"confPow":0,"confRef":1,"confMax":1,"trustPow":0,"trustRef":0.5,"trustMax":4,"trustN":200,"trustDelay":2,"trust0":-1,"rcvDiv":0,"rcvSig":1,"rcvInh":2,"rcvInhTau":4,"rcvNoise":0,"mixInh":0,"mixLr":0,"mixN":0,"mixPrune":0,"mixHomeo":0,"mixRate":0.002,"mixGate":0,"teachAHP":0,"teachAHPDur":12,"actNoise":8,"actNoiseTau":20,"rcvHomeo":0.02,"rcvRate":0.02,"actFb":15,"outInh":10,"eligUse":0,"eligMix":0.24199473954268616,"tauElig2":8,"eligEvo":1,"rpe":1,"rpeGamma":0.9,"rpeLambda":0.5,"rpeLr":0.3,"rpeGain":1,"rpeSrc":0,"rpeEps":1,"rpeMode":1,"actNoiseV":5,"uni":1,"uniI":0.4,"ng":0,"ngRes":256,"ngBatch":8,"ngTau":20,"ngThr":0.3,"ngCost":0.3,"ngHold":20,"ngRef":5,"ngTrial":60,"ngKeep":0.3,"ngW":0.5,"ngClaw":0,"ngReduce":0},"nCh":1,"ch":[{"gFood":0.577640094304668,"gPoison":0.32175471381044624,"gWall":0.6172203274835166,"tauMod":2.829923854722662,"src":-1,"gSpike":0}],"label":"evolved actor-critic plan (memory columns -> plastic -> competing action columns; RPE dopamine; genes tuned by evolution, R27) + dual-timescale tags"}};
SA.registerPlan('rewardE2', 'evolved actor-critic plan with dual-timescale eligibility (R35)', () => SA.genomeFromCompact(JSON.parse(JSON.stringify(G))),
  'rewardE re-evolved on bandit + cue + seqchoice with a fast and a slow eligibility tag per synapse: the reward area of unifiedR');
})();
/* v29 (R30) 'unifiedR': ONE genome with three areas whose development is decided by the task's I/O (core/regions.js growAreal):
 *   cortex + context (the predictK3 programs): receptor for the phase-clock morphogen A (sequence tasks bring a multi-phase clock);
 *   striatum (the rewardE program, whole sensory sheet): receptor for the outcome/dopamine source O, repressed by A.
 * Sequence task -> cortex + context develop (= predictK3); reward task -> the striatal area develops (= rewardE). */
(function () {
const SA = SpikingArena;
function createUnifiedR0() {   // the R30 base layout (all-or-none areas); unifiedG / unifiedC build on it
  const k3 = SA.PLANS.predictK3.make(), rE = (SA.PLANS.rewardE2 || SA.PLANS.rewardE).make();   // v31 (R35): reward area = rewardE2
  k3.regions[0].area = { a: 10, o: 0, b: -5 }; k3.regions[1].area = { a: 10, o: 0, b: -5 };
  k3.regions.push({ name: 'striatum', color: '#7fd18b', g: rE, outputs: true, whole: true, area: { a: -10, o: 10, b: -5 }, inputs: [{ env: 'symbol' }, { env: 'go' }, { env: 'tonic' }] });
  k3.areal = 1; k3.label = 'unified plan: one genome, areas chosen by the task I/O (cortex + context for sequences, striatum for reward)';
  return k3;
}
// v32 (R37): when the outcome signal O is present the striatum (rewardE2) always develops fully and owns the outputs; the
// sequence areas grow graded (smaller, expression sigmoid(10A - 6O - 5)) and feed it through their mixing cells. Single-signal
// tasks grow exactly the R30 layout (clock only -> cortex + context; outcome only -> striatum alone).
function createUnifiedR() { const d = createUnifiedC({ sa: { a: 0, o: 10, b: -5 }, ca: { a: 10, o: -6, b: -5 } });
  d.label = 'unified plan: one genome, areas from the task I/O (outcome -> striatum owns the outputs; clock -> cortex + context, graded, feeding it)'; return d; }
// v33 (R39): the striatum (genome + area receptor genes) of the q04_mixed_evolve champion (PC queue, bandit 3/6 arms + seqchoice
// cycle/order2, gen 7), transplanted whole into unifiedR. 16 held-out growths vs v32: bandit 6 arms 5.11 vs 4.31 (+0.81 ± 0.31),
// bandit 6.78 vs 6.70, cycle 7.24 vs 6.78, order2 5.19 vs 5.20, cue random -0.08 ± 0.46 (40 growths), text / order3 bit-identical.
const STRIATUM_E3 = {"name":"striatum","color":"#7fd18b","inputs":[{"env":"symbol"},{"env":"go"},{"env":"tonic"}],"outputs":true,"g":{"kind":"cell","seed":255891574,"Wg":[-1.088401740981051,46.08927728763233,0.12949236709642187,-0.1888091775388341,0.617432267273684,0,-0.3418480959411922,1.1555940180056166,0.5427786366262759,1.2805930790314788,-0.29239407024122666,0,1.2613417891528194,0.42397363984046454,-1.1800322694966665,-1.3329903663566958,0.5833394829885009,0.03317229285882251,-15.672862753620239,56.18507235202509,0.7972779094566268,-6.690344771509528,0.16298143356621522,0.7755440489947367,-0.19818892188795972,0.5538984141654089,-0.2240716687770299,0.06004349638171674,0.3884058249936376,2.226855182908968,-1.7239108018426545,0.969117088946718,-8.404817101669575,-0.583814481702833,0.467833146348877,0,-0.9499487984110597,-28.470812910504385,0.2550980850108509,40,0.1515232202903174,0.4323063104188687,0,0.8238518399887561,-0.3982765788111111,-0.6555179752209348,1.5396940179443472,0.8772126302280941,-0.22876174182203624,-0.27820314895564974,0.1963667290399226,0.11883942611373721,-1.2590639226856835,-0.535045477235345,1.6791807269405326,-0.40934612029017087,-19.96297791940544,0.6308387035849465,0.22261889074437224,0.18961491521941032,1.7888280208918184,-0.5221713914860238,0.6280301153963207,-0.6756722702776262,20.995788372792198,18.81460417179116,-77.87660003301087,0.04216099449081406,28.32518220864044,-0.35829592419329936,0.3703285069064151,-0.18888621358080548,-1.12385896924497,-1.6826532275667725,0.8013198732415766,6.290951475593671,0.5083344082973673,-150,1.110438130070038,0.6185428725157288,0.14677204346533437,-0.4021041659500277,0.34919010117202176,-0.5723201856202783,0.19549227049074785,1.2504553095364743,-0.02945576566304109,-0.3609432922404023,0.5979425421661769,-0.7557934024294441,-0.8040178412833665,0.40198000500611397,-0.7140816052847796,-0.03341142928353502,21.825848338630465,-0.7041136440034534,0.07191965587517751,0.4466548181684475,0,-3.8827546764457033,-0.07631935802737153,0.8314452193886687,0.525433525053889,-0.28081953996571246,0.5910604819270314,1.0193452888886148,-0.4398048261116667,-0.48421273755338984,-1.15071548774966,1.4467200921761054,0.8962597028342836,-0.7549993211440806,-1.2710850601180765,0.4508413725069985,-0.4206359662482512,-0.08617392126468393,-0.5160825047669587,-0.6866721564066447,-0.5135471834422736,1.1288581526344705,-2.934294917070106,-1.7653809336170934,-1.44317103482734,0.4868204054935345,0.5839775362959234,0,0.4548090236397729,-0.5694542120442061,0.5971257469484454,-0.17223345809811674,1.2947186130553527,-45.319437303436175,12.523770016478904,0.317998114820583,0.8767530334831721,1.59162520937854,0,0.22566747702240086,0.11235464569160186,-0.5299951393972159,-0.044678447339645766,0.4450835854050098,0.47528590063652665,-0.4016748367159061,-0.6057608167938608,0.48224921422863026,-1.2783684140638478,-0.8807291494929396,-1.264035270996026,3.9836040800191457,0.4779604860732869,-0.043676548418812786,-0.4432837026054292,-0.7457481643511914,1.2779452019015691,-0.2114354189638601,0.26189379920256317,-0.24202337438933727,1.144654707849975,-0.08555640361753793,0.08648352064830928,0.10159958765419444,-1.4330179852374014,6.329892666244667,-0.5504969075295635,-0.5368429008699154,0.7278081445251702,-1.2608609875685035,0.8081807439592766,1.2316690526612257,-0.5218743437580243,0.8478092336058858,-1.3674548728786393,-0.4017442720461184,-0.5203455259940939,-0.5893726174670281,-0.0805946122510175,-1.40276404851999,1.0642969277056864,0.33613852980346975,-2.4291463918066163,0.5035281142421147,0.3366214102861823,0.40644407132309934,-1.1315535719893899,0,2.1035832272528503,-0.25886340989495626,2.7422149351463823,0.24502279024515183],"R":[2.4286669565616865,-2.6672509566463525,0.10995976173292749,0.3890336399416049,-0.903942946879063,1.306424572156848,5.050917484254615,-1.0329160725245643,0.8831333932563843,0.009463772782230956,0.5774190544359912,-1.164935582889483,0.1496415497390839,0.15773300213114283,-5.750349622837167,-0.23089152745954333,-0.13761292098659364,-0.28170764773807727,0.05633844873934454,-0.6450754298493443,-0.9832844200417827,-7.0971155350929624,-0.08632290255110009,1.4077324305831251,0.2315117417973855,0,-0.8839634616881052,0.8046498433511132,-0.22851957916732593,0.6194598949215533,0.2895721911077817,-0.4558387461462879,-2.0383093449357506,0.8483968998972657,2.573635090235203,0,-0.9665571814619993,0.6597282485270246,-0.006895762891046209,2.057030058412677,-1.238531375475122,1.0746560360938469,-1.4024801245002587,-6.303479991139817,1.3353454955983843,0.8024886813128188,-0.12754565334640722,0.7338858818151764,7.508468833386092,0.12314035834762836,1.1308713202112224,-1.1462673077746208,1.425149236915091,1.2754100826589958,0.5624381063677222,-8.189386699369768,-0.35754423046973444,-0.7549953273280753,0.9012244224410602,-4.680851704990459,0.14634496374951306,-0.9165725071048897,-2.6609042731601456,-0.8342430718108368,0,-5,0.15576986049225927,1.8557206318487496,0.6163800981667032,-0.08304705295618105,-0.5730845593849452,-0.43021769985556446,0,0.7054497820287793,0.07276790474736167,-0.042522795778053735,-0.9169687634698361,4.453973292866759,0.15587888566562397,0,-0.8158704204760486,-0.8246535407481307,-2.5503956163688377,-0.9305232961164818,0.9534226661967686,0.13976700285059787,0.0638575186126438,0,-0.8717795613498814,-0.020344777929299035,0.19068690638495056,5.595782097964926,0.8511564428958321,-0.21134092545045444,-4.0708820560620165,-0.8356107054142032,0.4945604194757452,0.6913725562582018,-5.072164950317328,0.5770245270267577,0.510908147976666,-1.5999757850475973,-0.11693525333908615,-3.2060668659914784,0.8978708771158384,-0.878996910305058,0.8121531775006328,-0.04393444123217605,0.050563645169241035,-0.7815249610360244,7.817376790827656,0,1.3594563049430133,1.6725986673933737,-0.4845695446058521,0.2507757803624948,-1.6131798066565888,0,1.4308601824804383,1.2274777525020708,-1.651918587709527,7.659091923737489,0.24606968592680234,0,1.0148150018130164,0.892821002493169,-0.23595382403330303,0.7624293738530321,0.6063424108534242,-0.6966137971408999,-0.4004011751632732,0.1942417271059262,-1.229157904382556,-0.345252963866652,-0.841986692055114,-0.4041531042350067,-1.0887074259073375,-0.10228516988795866,0.6652276822564835,-0.10567134677238593,-0.4385801799279956,1.0449241234491882,-2.0215149351450705,-1.7934243371268237,-0.4574791370829918,0.007860164299319227,-0.5449754081192777,0.4911943726715494,0.058352151950008896,-1.258490627596205,-0.9226074770054371,-0.903730965446666,-0.044422102547319396,-0.1183722923404764,1.1543265892985954,-0.20239610450208145,2.660419197968431,1.783099898653818,-2.9152733284424195,-0.3575974281175454,0.7839072440461317,0.7836672846395698,1.0900244341065324,-0.9522921928646276,-2.196739428913495,-1.1007315029594613,1.9628095054443275,0.5335047100560576,-0.5154233942964793,5.410901375980231,0.23613854474308538,1.0266880866102701,0.057663340917984585,1.2146228437031388,-1.320269405644821,0.0788510186095435,0.11557326578819402,-0.5777266236092768,-0.1612051100233527,-2.122993695770832,0,0.6867680420046247,0.48444666543439924,0.3030408186514624,0.16980126505559104,-1.3368446313710947,-2.5734559763927467,9.210056529591327,-0.6954741692181062,1.910397557805065,0.14532231768199289,0.37943968380006093,-0.5722054608192619,-0.4240211441737518,-0.9013228162757445,0.6870093647230983,0.09481715072593849,0.18775337437317474,-5.4773018289085575,-1.1429014497603973,0,-0.7399282563012811,-4.476897670451094,0,0.557132159270019,-1.7734933834980042,0.33984388769401663,-1.1048529057953516,-3.155041005995967,4.269544771407344,-2.425427778478528,-0.5920810276662697,-0.007985045335391794,-0.5323581845534914,1.212392816334352,0.12614297063160415,-2.347085892045002,0.48192052520169915,0.06414838147702864,-3.1330598489832346,-0.8751287740865882,-0.542601323935203,0.6551136348113831,-1.5539883416500566,-0.2005375667828041,-1.3465032121888347,-0.24185816272962046,0.8045961207296837,0.28009086268846617,0.43355256107701035,-3.67476943610534,0.43744073879461876,0.9954476767399743,0.08013803387357576,-0.133573218796755,0,-0.3615082388304985,-0.8235944764605535,0,-0.45869165190850403,0.5610685581856092,-4.6769972634893,-0.11770800030151846,1.2456755726013897,-0.965306000716079,0.9015614355964127,5.139062035996469,-0.7640101325711872,-0.4739961172863396,0.522597330137315,-0.04647730094651566,-0.6453916412564645,0.38579650890278094,3.798275102460278,1.256131026245848,-0.5006156886426303,-0.528732427954545,-0.13588951062342192,-0.8278884849616859,-0.08427368161645232,1.6514349602722964,0.26226037663019414,-0.2357444340088739,0.35577891281619867,-0.8444406437377103,0.4889639032716473,-0.7144190155420456,-3.22752411894726,-0.4318767498997035,0,-1.3996368499144518,1.472052778783767,-0.6029927511966411,0,-7.8293627030873365,3.1263517853962366,-0.5850426206145692,-0.9126487262698567,-0.15101398171479102,0.04707395482582033,-0.2759068747459773,-0.5555636916629078,-0.8634394963710306,0.18699228057732425,-1.3444390187909498,-0.6435482778462815,0.22799672112919164,0.8340344905323526,-0.12272840707448451,-0.3921617564273836,1.4490584423508224,-0.2308005963336719,-1.9871018591266831,-0.38511464313157656,-3.146477384109039,-0.7794715028463532,0.8732777415793331,-1.3918553150823323,0.5319495500413025,-0.25409962421674964,-0.5345016391561347,0.1014303829666262,0.2552333510407255,1.3402090717912416,-1.3030801168230477,0.6424441342315889,0,-2.2394784690999936,-2.2105903907409434,1.2514886714461837,-0.8469992813796673,-0.4733063921071385,-0.32935798981569386,-1.2896839219972924,0.29980563849868547,0.5312629211670954,-0.8674912812298062,0.01993517905259845,-1.6502635166797035,0.3845395079904993,0.1640630441388623,-0.038485043056527224,0,0.4602872943937116,0.6610664172730608,2.578892906095193,0.19144475677938724,0.04860159518449923,0.04956949025111598,1.8268311454991737,-2.481869520919595,-0.2098829201258763,0.3416269430452856,-1.056618499575564,-1.3517655711993823,-1.5247308940659035,0.16690764557658044,0.1803205137020178,-0.15181115883932006,-0.11995721547845634,-1.6213253604439477,2.780698698430183,-0.8091676811560625,-0.7442079033313879,-0.42623674590094407,-0.21285469119569078,-0.08048296286323575,1.3357785618456655,-0.23451313893127496,0.599319454874701,-0.366945739210806,2.098042210918664,3.929273175813756,0.283445008183684,0.21007230664347903,0.5936450946804231,-0.6834306727113723,-0.1044958240567557,0.13720217919444316,-0.13674087703312165,-0.004862345133756215,-0.36083843847586483,0.2836355473577127,2.859150543934827,-0.36992062808659265,0.02773871618977647,-0.6355161146315026,-1.1116798938373524,-0.47645688069620024,-0.261024287916983,-0.0973769893572876,-0.2211650306045371,-0.14413390349433228,-3.3566916183491355,0.10422148736760575,0.7244773333345139,0.03635965175876857,0.21789664484989385,1.0227571952845635,0.11233538851014435,-0.2101608399053092,-1.743974062315778,1.06853803139596,-0.1354318075189979,-0.7872232498245267,0.5562180097916515,-1.0499284755316785,0.7280634114148322,-0.16345023165269668,-0.6262709396247735,0,-0.2247021573621513,-0.7390638868772912,0,0.4759790319112405,-6.720213084670779,-0.027385297584917756,0.4607020278624543,0.9731190815535524,-0.027201499710205912,-0.6536577093597188,1.2334203095745022,0.3355441790833514,0,-0.40266137399353985,0.20878937417088766,-4.5874383180516,1.2560604793275685,0.5974530951527163,0.8981738529491483,0.03350253098801531,0.07198955489281474,-0.6689791153577562,0.5414026881245096,-1.398037300376476,0.323518216211747,-1.0438274794530158,-4.419514738324861,-0.017344667846543343,-0.6603235574797663,-0.2150925362772279,-0.38497040535386495,4.198001657022948,-1.2210546850927948,-0.368187800249635,-0.27332009332712703,0.37798971859364233,0.0687549402822707,-1.2888177990886585,2.456620862722014,0.8896174024578348,0.16084276277252274,0.981417035771561,1.6640997281711316,0.09073757546056471,-4.019688745221009,-0.17518786792970814,-1.6623041299160222,0.7955704757378114,-1.0890874853625472,7.047675770467065,1.1822304900671006,0,0.5305841899196965,6.834638317734253,-0.8604695697147149,1.1728099806754637,-0.1176633622719141,0,-0.058360843920708644,3.8480214937464714,3.6875425002328788,-1.0018370728504569,1.1222689253228373,-1.2849022064318523,-9.139863116689073,-0.14605711201317062,-2.571777012536576,-0.7037069754444956,0.8557645341869838,0.5446519232288082,1.65800763623491,0,-0.4939468355889133,0.5273915737418369,-0.27415817630089007,5.182350368973487,-0.3462690753384853,-1.6459871852291643,0,0,0.7471555475727208,0.9238864897008219,1.7225814683128862,-1.117871176059244,-1.8310721444535125,-0.8081729809438467,-1.0482434648998322,1.4975808384220815,0.15271364880803084,1.091132498981481,0.046208554215205144,0,-2.643995591205684,0.30958735688472866,0,1.6016149007346083,-0.532054530679959,-0.31951033322655653,0.9768721606151425,1.491813140644287,1.976187228411706,-1.6534669632684733,-1.0804657288892834,-5.5718844092916235,0.5045784607038012,0.166681655319867,-0.17195628541794256,-0.5297101126473018,-0.43880424645978033,-0.08834587984203837,-1.8234153140732152,-0.577771918899877,0.2167379914413664,0,-2.3464264687135024],"lam":[0.6008001425729633,0.7072571528093389,0.585223098600722,0.8588467938141978,0.24170987503815738,0.14060466743063757,0.24782458758242665],"seeds":[[-0.8787084972368135,0.5569595842372324],[-0.8338766810186453,0.4645985254867626],[-0.6256604657943264,0.24056482023843306],[-0.4005160756790523,0.37449999753791907],[-0.38332564726986584,0.5640379025283649],[-0.18142159328370272,0.41344017801797656],[-0.3085666351176646,0.4821976230648926],[-0.03478979512983863,0.1885508737282408],[0.3061173311340389,0.45886131702336186],[0.5612191466266856,0.3933262660845984],[0.7667893035086587,0.39863245453524576],[0.8618767313431686,0.391895132832035],[0.8702172258164966,0.44719772736780755],[-0.95,-0.505505284562295],[-0.559665111729782,-0.3125106633822916],[-0.7737308403217249,-0.5159341765258243],[-0.25357881863490117,-0.48543128798695734],[-0.18648143419362448,-0.488141699511526],[-0.2403243601362633,-0.19246009880416354],[-0.24191122001623167,-0.2482330794038221],[0.06846516896711496,-0.46276700655233416],[0.3846395331611038,-0.4588182444046577],[0.45991301000996776,-0.4155189832360286],[0.782267728612352,-0.4112756476781665],[0.6129141319728778,-0.36724154517520585],[0.8040975352317331,-0.4176860032861174]],"s0":[0.07816330844548303,-0.47610421824693105,-0.5631996440323002,-0.6414846134193574,-0.00045010500623897387,0.36856725470203106,-0.007467430732262276,0.3447078083161401,-0.0324930418332971,-1],"sc":{"wIn":26.359036517197325,"wHid":8.633234164415592,"theta":0.351645801403641,"pDiv":0.9879973560449248,"maxCells":400,"eyeReach":1.586867878977656,"rIn":0.17973296476441325,"rSyn":0.18090865819810825,"axonStart":0.3861729706792735,"axonLen":56.83811000085645,"trophMin":0.00931718010266249,"trophHid":0.3660888674012057,"hebb":0.19558688420024148,"pruneFrac":0.02317888772752634,"homeoTarget":0.04751755775660784,"homeoRate":0.2155278453476362,"normE":49.76808828907401,"normI":135.27167784542132,"satisfy":1.877223022271277,"topoW":0.02643759092877475,"topoSnap":0.9437447695892585,"branchMax":34.24132938267818,"hunger":0,"hungerRate":0.05663430218309837,"hungerTarget":5.024008729019449,"hungerRelax":0.7973542305171637,"hungerLam":0.5122157999574463,"request":0.15083720037657317,"reqDelay":2.0554488643198283,"reqDecay":0.5091783233151589,"demand":0.9080972429220875,"demandStart":0,"demandTarget":3.044688488756841,"demandRelax":0,"demandLam":0.4,"grid":27.593109371197034,"plastRecv":0.9723782374722606,"bifAt":0.994917956084826,"afferent":0.7163573864646005,"clawLeak":0.11432120902113382,"clawNorm":0,"clawIn":5.791048452733195,"coneSpeed":0.5,"bifAt4":0.0892094698489059,"mixK":4.279331257140733,"mixNorm":15.030257560986673,"mixLeak":0,"topoOut":1,"wDiffuse":4},"pl":{"lr":0.028749695303331376,"tauPre":8.347957244437797,"tauPost":16.62878548276899,"aMinus":0,"tauElig":15.627847509896718,"teach":0,"teachThr":20,"plateau":4,"preNorm":45,"preLag":0,"metaN":0,"confPow":0,"confRef":1,"confMax":1,"trustPow":0,"trustRef":0.5,"trustMax":4,"trustN":200,"trustDelay":2,"trust0":-1,"rcvDiv":0,"rcvSig":1,"rcvInh":2,"rcvInhTau":4,"rcvNoise":0,"mixInh":0,"mixLr":0,"mixN":0,"mixPrune":0,"mixHomeo":0,"mixRate":0.002,"mixGate":0,"teachAHP":0,"teachAHPDur":12,"actNoise":8,"actNoiseTau":20,"rcvHomeo":0.01800802245278132,"rcvRate":0.02,"actFb":15,"outInh":10,"eligUse":0,"eligMix":0.1264298913876014,"tauElig2":8,"eligEvo":1,"eligGate":0,"eligGateT":10,"rpe":1,"rpeGamma":0.9,"rpeLambda":0.5,"rpeLr":0.3,"rpeGain":1,"rpeSrc":0,"rpeEps":1,"rpeMode":1,"actNoiseV":5,"uni":1,"uniI":0.4,"ng":0,"ngRes":256,"ngBatch":8,"ngTau":20,"ngThr":0.3,"ngCost":0.3,"ngHold":20,"ngRef":5,"ngTrial":60,"ngKeep":0.3,"ngW":0.5,"ngClaw":0,"ngReduce":0},"nCh":1,"ch":[{"gFood":0.8284822122788407,"gPoison":0.32175471381044624,"gWall":0.6172203274835166,"tauMod":3.5120322304473417,"src":-1,"gSpike":0}],"label":"evolved actor-critic plan (memory columns -> plastic -> competing action columns; RPE dopamine; genes tuned by evolution, R27) + dual-timescale tags","fitness":null},"area":{"a":-1.108060124105546,"o":8.874758697379637,"b":-5},"whole":true};
const createUnifiedRv32 = createUnifiedR;
function createUnifiedRv33() { const c = SA.genomeToCompact(createUnifiedRv32()); c.cell.regions[2] = JSON.parse(JSON.stringify(STRIATUM_E3)); const d = SA.genomeFromCompact(c); d.label = 'unified plan: one genome, areas from the task I/O (outcome -> striatum rewardE3 owns the outputs; clock -> cortex + context, graded, feeding it)'; return d; }
SA.registerPlan('rewardE3', 'evolved reward area of unifiedR v33 (alone)', () => SA.genomeFromCompact({ kind: 'cell', cell: JSON.parse(JSON.stringify(STRIATUM_E3.g)) }), 'the striatum genome of unifiedR (v33) as a single-tissue plan (R40)');
SA.registerPlan('rewardE3ng', 'rewardE3 + failure-rate need-growth', () => { const g = SA.genomeFromCompact({ kind: 'cell', cell: JSON.parse(JSON.stringify(STRIATUM_E3.g)) }); Object.assign(g.pl, { ng: 1, ngFail: 1, ngStruct: 1 }); return g; }, 'rewardE3 with need-growth on, driven by raw failure rate, structured recruits (R40, Q03)');
SA.registerPlan('unifiedRv32', 'unified plan v32 (striatum rewardE2)', createUnifiedRv32, 'v32 unifiedR, kept for comparison');
SA.registerPlan('unifiedR', 'unified plan: areas develop from the task I/O signature', createUnifiedRv33, 'one genome: phase-clock input grows the cortex + context areas (predictK3), an outcome/dopamine source grows the striatal area (rewardE)');
SA.createUnifiedR = createUnifiedRv33;
/* v30 (R31) 'unifiedG': unifiedR with GRADED areas (size follows expression, see core/regions.js growAreal) and receptor genes
 * tuned so a task with BOTH signals (phase clock + outcome, e.g. seqchoice) grows both areas: the striatum mostly (owns the
 * outputs), cortex + context smaller; corticostriatal tracts carry the previous symbol (cortex M2) and the symbol two back
 * (context M3) to the striatal receivers as plastic parallel fibres. On single-signal tasks it grows exactly unifiedR. */
function createUnifiedG(T) {
  T = Object.assign({ wTot: 45, p: 0.3 }, T); const d = createUnifiedR0();
  d.regions[0].area = { a: 10, o: -6, b: -5 }; d.regions[1].area = { a: 10, o: -6, b: -5 }; d.regions[2].area = { a: -4, o: 10, b: -5 };
  d.tracts.push({ name: 'M2 -> striatum', from: { region: 0, cls: 2 }, to: { region: 2, wTot: T.wTot }, map: 'all', p: T.p, plastic: true },
                { name: 'M3 -> striatum', from: { region: 1, cls: 2 }, to: { region: 2, wTot: T.wTot }, map: 'all', p: T.p, plastic: true });
  d.graded = 1; d.gMin = 0.15; d.label = 'unified plan, graded areas: one genome, area sizes follow the task I/O signals; mixed tasks grow cortex + context + striatum';
  return d;
}
SA.registerPlan('unifiedG', 'unified plan with graded areas (sizes follow the task I/O signals)', () => createUnifiedG(), 'unifiedR whose areas grow in proportion to their expression; with clock + outcome both develop, linked by corticostriatal tracts');
SA.createUnifiedG = createUnifiedG;
/* v30 (R32) 'unifiedC': unifiedG whose striatum reads CONJUNCTIONS: the cortex's sparse mixing cells (claw-like
 * conjunctions of current symbol x previous symbol x symbol two back, homeostatic thresholds) project to the striatal
 * receivers as plastic corticostriatal fibres (dopamine-learned). Mixed tasks express cortex and striatum about equally. */
function createUnifiedC(T) {
  T = Object.assign({ wTot: 45, p: 0.3, ca: { a: 10, o: -4, b: -5 }, sa: { a: -4, o: 10, b: -4.9 }, lin: false }, T); const d = createUnifiedG(T);
  d.regions[0].area = Object.assign({}, T.ca); d.regions[1].area = Object.assign({}, T.ca); d.regions[2].area = Object.assign({}, T.sa);
  if (!T.lin) d.tracts = d.tracts.filter(t => !/striatum/.test(t.name));
  d.tracts.push({ name: 'mixing -> striatum', from: { region: 0, mix: true }, to: { region: 2, wTot: T.wTot }, map: 'all', p: T.p, plastic: true });
  d.label = 'unified plan, graded areas, conjunctive corticostriatal input (mixing cells -> striatum)'; return d;
}
SA.registerPlan('unifiedC', 'unified plan: graded areas + conjunctive corticostriatal input', () => createUnifiedC(), 'unifiedG whose striatum learns from the cortex mixing cells (symbol x context conjunctions)');
SA.createUnifiedC = createUnifiedC;
// v31 (R34) 'rewardED': rewardE with dual-timescale eligibility tags (slow tauElig + fast tauElig2, mix eligMix) and evolvable tag genes
SA.registerPlan('rewardED', 'rewardE with dual-timescale eligibility (evolvable)', () => { const d = SA.PLANS.rewardE.make(); Object.assign(d.pl, { eligEvo: 1, eligMix: 0.3, tauElig2: 8, eligUse: 0 }); d.label += ' + dual-timescale tags'; return d; },
  'rewardE whose synapses keep a slow and a fast eligibility tag; the mix, the fast time constant, tag capture at outcomes and receiver homeostasis evolve');
})();

/* R44 (I56) deepUR xM: unifiedR (v33) with M-1 extra chained context regions (as deepK3xM: context m holds the symbol m+2 back,
 * projecting to the cortex mixing cells by claw). Extra areas carry the cortex/context receptor genes, so they develop only with
 * the phase clock (graded with the outcome); on pure reward tasks the plan grows exactly unifiedR. Experimental, off by default. */
(function () { const SA = SpikingArena;
function createDeepUR(M, T) { T = Object.assign({ w: 30 }, T); const d = SA.createUnifiedR(); d.label = 'unifiedR + deeper-memory context chain x' + M;
  let prev = 1;
  for (let m = 1; m < M; m++) { const ctx = SA.createPredict2Plan(Object.assign({}, SA.PREDICT3_CTX)); Object.assign(ctx.sc, SA.DEMAND_SC); const k = d.regions.length;
    d.regions.push({ name: 'context ' + (m + 1), color: '#f0d050', g: ctx, area: Object.assign({}, d.regions[1].area, T.area || {}), inputs: [{ tract: 'prev', like: 'symbol', tag: 1 }, { env: 'go2', tag: 3 }, { env: 'go3', tag: 8 }, { env: 'tonic' }] });
    d.tracts.push({ name: 'M' + (m + 2) + ' -> context ' + (m + 1), from: { region: prev, cls: 2 }, map: 'topo', to: { region: k, tract: 'prev' } },
                  { name: 'M' + (m + 3) + ' -> mixing', from: { region: k, cls: 2 }, map: 'claw', to: { region: 0, mix: true, w: T.w }, salt: 31 * m });
    if (T.wordReset) d.tracts.push({ name: 'predicted space -| context ' + (m + 1), from: { region: 0, out: 'next_␣' }, map: 'outReset', to: { region: k, cls: 2, w: T.wordReset } });
    prev = k; }
  return d; }
for (const M of [2, 3, 4]) SA.registerPlan('deepURx' + M, 'R44 I56: unifiedR + deeper context chain x' + M, () => createDeepUR(M), 'experimental, off by default');
// R44 (I57) ordered in-word code: the deep chain holds letters 3..M+1 back, cleared by the cortex's own predicted space, so its
// columns encode 'letter k back WITHIN the current word' (order-preserving chained memory, empty past the word start).
for (const M of [2, 3, 4, 6, 8]) SA.registerPlan('deepURSx' + M + (M === 3 ? 'v34' : ''), 'R44 I56: deeper context chain x' + M + ', sequence-only areas (repressed by the outcome signal)' + (M === 3 ? ' (v34 default, without prediction-miss LTD)' : ''), () => createDeepUR(M, { area: { o: -20 } }), 'experimental: grows unifiedR exactly when an outcome signal is present');
// v35 (R53 adopted): the default deepURSx3 learns with hybrid prediction-mismatch LTD in every area: a taught cell that fires without
// its teacher plateau depresses its recently active inputs by predErr*lr*x*(peFix + (1 - peFix) w/wMax) (small fixed part + soft-bound part)
const DEEP_PE = { predErr: 0.3, peMode: 16, peFix: 0.01 };
SA.DEEP_PE = DEEP_PE;
SA.registerPlan('deepURSx3v35', 'v35 default (kept): unifiedR + deeper context chain x3 (outcome-repressed) + hybrid prediction-mismatch LTD (R53). Reproduce v35 numbers with the seq param readIn 0', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_PE); d.label += ' + prediction-miss LTD'; return d; },
  'old default (v35); grows unifiedR exactly when an outcome signal is present');
// v36 (R62 adopted): the prediction-miss LTD is OFF (predErr 0; peMode / peFix kept but inactive) and the metaplastic consolidation is
// capped (metaCap 200): each presynaptic cell's potentiation is scaled by metaN / (metaN + E) with E = potentiation received so far,
// capped at metaCap, so learning keeps a floor rate lr x 40 / 240 instead of fading to 0 over a long life. Together with the graded
// decoder (seq readIn 0.01, now the seq default): book 30k held-out 0.229 -> 0.313, book 10k 0.271 -> 0.316, no task worse (16 growths, R62).
const DEEP_V36 = Object.assign({}, DEEP_PE, { predErr: 0, metaCap: 200 });
SA.DEEP_V36 = DEEP_V36;
SA.registerPlan('deepURSx3v36', 'v36 default (kept): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36); d.label += ' + capped consolidation'; return d; },
  'old default (v36); grows unifiedR exactly when an outcome signal is present');
// v37 (R64 adopted under Travis's standing authorisation), two region-local changes to v36:
//  (1) the cortex (taught cells) learns at lr 0.1 instead of 0.05 (other regions keep theirs: context 0.03, striatum ~0.029). On the seq
//      tasks this equals the global variant pl.lr=0.1 of shared job x04 bit for bit (only the cortex taught cells have plastic synapses
//      there). 16 held-out growths vs v36: book10k +0.009 (16/0), book30k +0.011 (16/0), fables4000 +0.010 (16/0), order3 +0.011 (13/2),
//      text1000 +0.005 (13/3). On seqchoice the cortex rate changes nothing (cycle / order2 bit-identical to v36).
//  (2) the striatum gets v35's hybrid prediction-miss LTD back (predErr 0.3; peMode 16 / peFix 0.01 were kept). x12 + box R64: removing it
//      from the striatum was the whole seqchoice order2 loss of v36 (-0.035, t -2.45, 32 growths); v36 + striatum predErr 0.3 = v35 exactly
//      on seqchoice (order2 +0.035 / cycle +0.012 vs v36). The striatum does not grow without an outcome signal, so seq tasks are bit-identical.
const CORTEX_LR_V37 = 0.1, STRIATUM_PE_V37 = 0.3;
Object.assign(SA, { CORTEX_LR_V37, STRIATUM_PE_V37 });
SA.registerPlan('deepURSx3v37', 'v37 / v38 default (kept): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.1 + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V37 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.label += ' + capped consolidation + cortex lr 0.1 + striatum prediction-miss LTD'; return d; },
  'old default (v37 / v38); grows unifiedR exactly when an outcome signal is present');
// v39 (R70 adopted under Travis's standing authorisation): the cortex learns at lr 0.2 (v37 / v38: 0.1); nothing else changes.
//  y02 screen (growths 0-15) + y08 confirmation on FRESH growths k 1200-1215 (fast engine): book10k +0.006 (12/3, t 4.0), book30k +0.009 (15/1, 5.5),
//  fables4000 +0.007 (15/1, 5.7), order3 -0.002 (8/6, t -0.7), text1000 +0.000 (8/7), seqchoice order2 / cycle identical (cortex rate unused there).
//  lr 0.3 / 0.5 (y09) win book more but lose order3 (-0.015 t -2.5 / -0.046 0/15). At 4xS lr 0.2 is worse (y11), so scaled runs pin lr@cortex 0.1.
const CORTEX_LR_V39 = 0.2;
SA.CORTEX_LR_V39 = CORTEX_LR_V39;
SA.registerPlan('deepURSx3v39', 'v39 default (kept): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.2 (R70) + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V39 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.label += ' + capped consolidation + cortex lr 0.2 + striatum prediction-miss LTD'; return d; },
  'old default (v39); grows unifiedR exactly when an outcome signal is present');
// v40 (R77 adopted under Travis's standing authorisation): the cortex's presynaptic budget preNorm 45 -> 55 (inputs onto taught cells keep a
//  larger fixed outgoing total); nothing else changes. y25 screen (growths 0-15, vs v39): book10k +0.003 (9/5, t 2.5), book30k +0.004 (14/1, 4.6),
//  fables +0.001, order3 +0.004, text +0.002; y83a/b on FRESH growths k 1500-1515 (7 tasks): book10k +0.001 (8/7), book30k +0.001 (9/5), fables
//  +0.002 (10/6, t 1.7), order3 +0.005 (8/0, t 2.4), text +0.000, seqchoice identical (the cortex budget is unused there): no task worse.
//  y84 ladder: 65 / 80 buy book30k (+0.006 / +0.005) but lose fables vs 55 (-0.002 / -0.003, t -2.4 / -3.0); 50 < 55 on book. At cortex 4x + fanRef
//  (y85) preNorm 55 costs order3 -0.014 (0/8): scaled runs pin pl.preNorm@cortex=45 (like the cortex rate).
const CORTEX_PRENORM_V40 = 55;
SA.CORTEX_PRENORM_V40 = CORTEX_PRENORM_V40;
SA.registerPlan('deepURSx3v40', 'v40 default (kept): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.2 (R70) + cortex preNorm 55 (R77) + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V39, preNorm: CORTEX_PRENORM_V40 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.label += ' + capped consolidation + cortex lr 0.2 + cortex preNorm 55 + striatum prediction-miss LTD'; return d; },
  'old default (v40); grows unifiedR exactly when an outcome signal is present');
// v42 (R89): same plan; the global params.granRef is 600 (v41 = P.granRef=100).
// v41 (R84 adopted under Travis's authorisation): + a 2000-cell granule layer (gene d.gran.N; settings params granW..granGain in base.js).
SA.registerPlan('deepURSx3v42', 'v42 default (kept): v40 + 2000-cell granule layer onto the outputs (R84): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.2 (R70) + cortex preNorm 55 (R77) + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V39, preNorm: CORTEX_PRENORM_V40 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.gran = { N: 2000 }; d.label += ' + granule layer 2000'; d.label += ' + capped consolidation + cortex lr 0.2 + cortex preNorm 55 + striatum prediction-miss LTD'; return d; },
  'old default (v41 / v42; with params.granRef 600 = v42); grows unifiedR exactly when an outcome signal is present');
// v43 (R91): the granule layer has 4000 cells (was 2000; y159 k 2240-2255 + box k 2256-2271, 32 fresh growths: book10k +0.008, book30k +0.011, no task worse).
//   The v41 / v42 2000-cell brain stays as plan deepURSx3v42 (or P.granN=2000).
const GRAN_N_V43 = 4000; SA.GRAN_N_V43 = GRAN_N_V43;
SA.registerPlan('deepURSx3v43', 'v43 default (kept): v40 + 4000-cell granule layer (3-letter claws) onto the outputs (R84; 4000 cells R91): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.2 (R70) + cortex preNorm 55 (R77) + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V39, preNorm: CORTEX_PRENORM_V40 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.gran = { N: GRAN_N_V43, K: 3 }; d.label += ' + granule layer ' + GRAN_N_V43; d.label += ' + capped consolidation + cortex lr 0.2 + cortex preNorm 55 + striatum prediction-miss LTD'; return d; },
  'old default (v43 = P.granN=4000,P.granK=3); grows unifiedR exactly when an outcome signal is present');
// v44 (R94): the granule layer has 8000 cells with mixed 3- / 4-letter claws (gene d.gran.K 4, d.gran.Kmin 3; was 4000 cells x 3 claws = plan deepURSx3v43).
//   y174a + y174b (workers, fresh held-out k 2352-2367, 16 growths, 8 tasks) vs v43: book30k +0.009 (14/2), fables +0.007 (14/2), book10k 0, text -0.0003 (6/8, n.s.), order3 / K4 / seqchoice not worse.
//   P.granK / P.granKmin still override the gene (P.granK set without P.granKmin = every granule takes granK claws).
const GRAN_N_V44 = 8000, GRAN_K_V44 = 4, GRAN_KMIN_V44 = 3; Object.assign(SA, { GRAN_N_V44, GRAN_K_V44, GRAN_KMIN_V44 });
SA.registerPlan('deepURSx3v44', 'v44 default (kept): v40 + 8000-cell granule layer (mixed 3/4-letter claws) onto the outputs (R84; 4000 cells R91; 8000 x Kmix34 R94): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.2 (R70) + cortex preNorm 55 (R77) + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V39, preNorm: CORTEX_PRENORM_V40 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.gran = { N: GRAN_N_V44, K: GRAN_K_V44, Kmin: GRAN_KMIN_V44 }; d.label += ' + granule layer ' + GRAN_N_V44 + ' (claws 3-4)'; d.label += ' + capped consolidation + cortex lr 0.2 + cortex preNorm 55 + striatum prediction-miss LTD'; return d; },
  'old default (v44 = P.granN=8000); grows unifiedR exactly when an outcome signal is present');
// v45 (R103): the granule layer has 16000 cells (mixed 3- / 4-letter claws unchanged; v44 = plan deepURSx3v44 / P.granN=8000).
//   y198a+b + y209 (48 fresh growths) vs v44: book10k +0.0023 (33/13, t 3.1), fables4000 -0.0007 (19/27, t -1.2; pre-registered bar t > -2, losses <= 60%), text1000 +0.0002;
//   y198: book30k +0.0016, order3 / K4 not worse, seqchoice identical; y216: order3 / K4 / seqchoice bit-identical to v44; y210 fresh length: book100k +0.0029 (4/4), book300k +0.0084 (8/0). Cost ~1.7x v44 runtime.
const GRAN_N_V45 = 16000; Object.assign(SA, { GRAN_N_V45 });
SA.registerPlan('deepURSx3v45', 'v45 default (kept): v40 + 16000-cell granule layer (mixed 3/4-letter claws) onto the outputs (R84; 4000 cells R91; 8000 x Kmix34 R94; 16000 R103): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.2 (R70) + cortex preNorm 55 (R77) + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V39, preNorm: CORTEX_PRENORM_V40 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.gran = { N: GRAN_N_V45, K: GRAN_K_V44, Kmin: GRAN_KMIN_V44 }; d.label += ' + granule layer ' + GRAN_N_V45 + ' (claws 3-4)'; d.label += ' + capped consolidation + cortex lr 0.2 + cortex preNorm 55 + striatum prediction-miss LTD'; return d; },
  'old default (v45 = P.granN=16000); grows unifiedR exactly when an outcome signal is present');
// v46 (R106): the granule layer has 32000 cells (mixed 3- / 4-letter claws unchanged; v45 = plan deepURSx3v45 / P.granN=16000).
//   Length bar (y207 + y222, 16 growths, book300k): +0.0056 vs 16000 (13/3, t 3.8), +0.0042 vs 16000 sched100k (11/4, t 2.9); fresh y222 half +0.0044 (6/2).
//   Full-set confirmation y223 (16 fresh growths k 2824-2839): book10k +0.0003 (8/8), book30k +0.0025 (11/5, t 3.2), fables4000 +0.0014 (11/4, t 1.9), text1000 +0.0003 (9/5),
//   K4 +0.0002 (1/0), order3 / seqchoice order2 / cycle identical. Cost ~2x v45 runtime (runtime linear in granule cells).
const GRAN_N_V46 = 32000; Object.assign(SA, { GRAN_N_V46 });
SA.registerPlan('deepURSx3v46', 'v46 default (kept): v40 + 32000-cell granule layer (mixed 3/4-letter claws) onto the outputs (R84; 4000 cells R91; 8000 x Kmix34 R94; 16000 R103; 32000 R106): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.2 (R70) + cortex preNorm 55 (R77) + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V39, preNorm: CORTEX_PRENORM_V40 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.gran = { N: GRAN_N_V46, K: GRAN_K_V44, Kmin: GRAN_KMIN_V44 }; d.label += ' + granule layer ' + GRAN_N_V46 + ' (claws 3-4)'; d.label += ' + capped consolidation + cortex lr 0.2 + cortex preNorm 55 + striatum prediction-miss LTD'; return d; },
  'old default (v46 = 32000 cells, fixed granule step 0.1 = P.granLrT=0); grows unifiedR exactly when an outcome signal is present');
// v47 (R114): the granule layer's NLMS step follows a step schedule: granLr 0.1 until 100000 teaching events (~symbols), then 0.05 (plan gene d.gran.lrT / lrLate;
//   v46 = plan deepURSx3v46 or P.granLrT=0). Pre-registered 16 fresh held-out growths at book1M (y232a+b, y238a+b, k 2880-2887 / 2928-2935): +0.0038 (0.4404 vs 0.4366, 11/5, t 2.8);
//   short set bit-identical (y238c: the step never fires below 100000 events). Runtime unchanged.
const GRAN_LRT_V47 = 100000, GRAN_LRLATE_V47 = 0.05; Object.assign(SA, { GRAN_LRT_V47, GRAN_LRLATE_V47 });
SA.registerPlan('deepURSx3', 'v47 default: v40 + 32000-cell granule layer (mixed 3/4-letter claws) onto the outputs (R84; 4000 cells R91; 8000 x Kmix34 R94; 16000 R103; 32000 R106; granule step schedule 0.1 -> 0.05 after 100000 teaching events R114): unifiedR + deeper context chain x3 (outcome-repressed), no prediction-miss LTD, capped consolidation (metaCap 200; R62), cortex lr 0.2 (R70) + cortex preNorm 55 (R77) + striatum predErr 0.3 (R64)', () => { const d = createDeepUR(3, { area: { o: -20 } }); for (const R of d.regions) R.g.pl = Object.assign({}, R.g.pl, DEEP_V36, R.name === 'cortex' ? { lr: CORTEX_LR_V39, preNorm: CORTEX_PRENORM_V40 } : {}, R.name === 'striatum' ? { predErr: STRIATUM_PE_V37 } : {}); d.gran = { N: GRAN_N_V46, K: GRAN_K_V44, Kmin: GRAN_KMIN_V44, lrT: GRAN_LRT_V47, lrLate: GRAN_LRLATE_V47 }; d.label += ' + granule layer ' + GRAN_N_V46 + ' (claws 3-4, step 0.1 -> 0.05 at 100k)'; d.label += ' + capped consolidation + cortex lr 0.2 + cortex preNorm 55 + striatum prediction-miss LTD'; return d; },
  'default for three-phase-clock sequences/text and seqchoice; grows unifiedR exactly when an outcome signal is present');
for (const M of [3, 4]) SA.registerPlan('wordChainx' + M, 'R44 I57: deep context chain x' + M + ' reset by the predicted space (ordered in-word memory)', () => createDeepUR(M, { wordReset: 30 }), 'experimental, off by default');
SA.createDeepUR = createDeepUR; })();

/* R47 (I48 revisited) SLOW CONTEXT LAYER: deepURSx3 + one region of slowly integrating memory cells (context gene program, memory
 * leak slowLeak instead of the clock-reset short memory), driven by the current symbol only (no phase-clock reset), so its columns hold
 * an exponentially fading summary of the sequence so far; it projects to the cortex mixing cells by claw (whose competitive learning
 * picks the useful conjunctions). Sequence-only area (repressed by the outcome signal), so it grows only on clock tasks. Off by default. */
(function () { const SA = SpikingArena;
function createSlowCtx(T) { T = Object.assign({ leak: 0.995, w: 30 }, T); const d = SA.createDeepUR(3, { area: { o: -20 } }); d.label = 'deepURSx3 + slow context layer (leak ' + T.leak + ')';
  const g = SA.createPredict2Plan(Object.assign({}, SA.PREDICT3_CTX)); g.sc = Object.assign({}, g.sc, SA.DEMAND_SC, { slowLeak: T.leak }, T.wIn ? { wIn: T.wIn } : {}); const k = d.regions.length;
  d.regions.push({ name: 'slow context', color: '#9fb7ff', g, area: Object.assign({}, d.regions[1].area, { o: -20 }), inputs: [{ env: 'symbol', tag: 1 }, { env: 'tonic' }] });
  d.tracts.push({ name: 'slow context -> mixing', from: { region: k, cls: T.cls == null ? 2 : T.cls }, map: 'claw', to: { region: 0, mix: true, w: T.w }, salt: 97 });
  return d; }
for (const [n, T] of [['slowCtxA', { leak: 0.98 }], ['slowCtxB', { leak: 0.995 }], ['slowCtxC', { leak: 0.999 }], ['slowCtxB15', { leak: 0.995, w: 15 }], ['slowCtxB0', { leak: 0.995, cls: 0 }], ['slowCtxB1', { leak: 0.995, cls: 1 }], ['slowCtxN0', { leak: 0, cls: 0 }], ['slowCtxA0', { leak: 0.98, cls: 0 }], ['slowCtxC0', { leak: 0.999, cls: 0 }], ['slowCtxA1', { leak: 0.98, cls: 1 }], ['slowCtxC1', { leak: 0.999, cls: 1 }]])
  SA.registerPlan(n, 'R47 I48: deepURSx3 + slow context layer ' + JSON.stringify(T), () => createSlowCtx(T), 'experimental, off by default');
for (const lk of [0.98, 0.995, 0.999]) for (const wIn of [0.5, 1, 2, 4, 8]) { const T = { leak: lk, wIn, cls: 0 }; SA.registerPlan('slowS' + String(lk).slice(2) + 'w' + wIn, 'R47 I48: slow context layer ' + JSON.stringify(T), () => createSlowCtx(T), 'experimental, off by default'); }
SA.createSlowCtx = createSlowCtx;

/* TWO-TIMESCALE HIERARCHICAL CHUNKING (deepURSx3_chunk / createChunkUR):
 * Adds a higher-order cortical region ('chunk context') alongside the fast character-level delay chain (M1..M5).
 * Instead of shifting on every go2 phase clock tick, 'chunk context' receives its shift gate via a 'chunkGate' tract
 * that fires only on explicit delimiter symbols (sym 0 = space) or when cortical prediction surprise exceeds thr.
 * Its sustained columns project via claws to both cortex mixing cells and cerebellar granule cells. */
function createChunkUR(T) {
  T = Object.assign({ thr: 0.75, delimSym: 0, maxLag: 8, w: 0, chunkFrac: 0.2 }, T);
  const d = SA.PLANS.deepURSx3.make();
  const g = SA.createPredict2Plan(Object.assign({}, SA.PREDICT3_CTX));
  g.sc = Object.assign({}, g.sc, SA.DEMAND_SC);
  const k = d.regions.length;
  d.regions.push({
    name: 'chunk context', color: '#ffd166', g,
    area: Object.assign({}, d.regions[1].area, { o: -20 }),
    inputs: [{ tract: 'prev', like: 'symbol', tag: 1 }, { tract: 'cgate', like: 'go2', tag: 3 }, { env: 'go3', tag: 8 }, { env: 'tonic' }]
  });
  d.tracts.push(
    { name: 'M2 -> chunk context', from: { region: 1, cls: 2 }, map: 'topo', to: { region: k, tract: 'prev' }, salt: 131 },
    { name: 'cortex -> chunk gate', from: { region: 0, cls: 2 }, map: 'chunkGate', thr: T.thr, delimSym: T.delimSym, maxLag: T.maxLag, to: { region: k, tract: 'cgate', w: 50 }, salt: 132 }
  );
  if (T.w > 0) d.tracts.push({ name: 'chunk context -> mixing', from: { region: k, cls: 2 }, map: 'claw', to: { region: 0, mix: true, w: T.w }, salt: 133 });
  d.gran = Object.assign({}, d.gran, { chunkFrac: T.chunkFrac });
  d.label += ' + two-timescale event-gated chunk context';
  return d;
}
SA.registerPlan('deepURSx3_chunk', 'Two-timescale hierarchical chunking: deepURSx3 + event-gated chunk context region (shifts on delimiters or cortical surprise, feeding cortex mixing and granule claws)', () => createChunkUR(), 'hierarchical two-timescale sequence prediction');
SA.createChunkUR = createChunkUR; })();

/* Explore: the arena demos (#arena, #predator) now live in /assets/explore-arena.js, which the Explore page loads
 * after this engine bundle (lazy, so the bundle stays small). Nothing to do here; the file stays so the bundle
 * layout (engine + view) and its build script are unchanged. */
