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
  const T = Object.assign({ t7: 0, s7: 0.3, leak: 1, clen: -1.5 }, tune);
  const d = createHandCellGenomeV2(), H = CH_H, R = d.R;
  const r = (out, gene, v) => { R[out * (H + 1) + gene] = v; }, rb = (out, v) => { R[out * (H + 1) + H] = v; };
  const fate = (out, L) => { let b = 0; [2, 3, 4, 5, 8, 9].forEach((gene, j) => { r(out, gene, L[j] / 2); b += L[j] / 2; }); rb(out, b); };
  fate(CO.T + 7, [-5, -5, -5, -5, T.t7, 5]);                 // M address 'free' (X: 1)
  fate(CO.S + 7, [1.4, -5, -5, -5, T.s7, 5]);                // M seeks M: M->M strength = sigm(s7) x sigm(t7)
  fate(CO.LEAK, [-5, -5, -5, -5, T.leak, -5]);               // M: slow membrane
  fate(CO.T8, [-5, -5, -5, -5, -5, 5]);                      // X receive the turning sensors
  fate(CO.PROJ, [-5, -5, -5, -5, 5, -5]);                    // M: main axon = projection to the motors only
  fate(CO.CLEN, [-5, -5, -5, -5, T.clen, -5]);               // M collateral length
  d.label = 'hand-designed body plan v3 (slow recurrent memory + turning sensors)';
  return d;
}

registerPlan('v1', 'plan v1 (feed-forward)', createHandCellGenomeV1, 'feed-forward French-flag quadrants: sensor → hidden → motor');
registerPlan('v2', 'plan v2 (interneurons)', createHandCellGenomeV2, 'v1 + central interneurons with recurrent / lateral wiring');
registerPlan('v3', 'plan v3 (slow recurrent memory)', () => createHandCellGenome(), 'v2 + slow self-exciting memory populations, mutual inhibition, turning sensors');
// v8: plan v3 + HUNGER (need-based attraction): outputs / sensors that are under-connected attract axons and relax
// tag matching until satisfied. In v3 the speed motor is otherwise an orphan (no input) in every growth.
registerPlan('v3h', 'plan v3h (v3 + hunger)', () => { const d = createHandCellGenome(); d.sc.hunger = 2; d.label = 'plan v3 + hunger signals'; return d; },
  'v3 + hunger signals: under-connected motors / sensors attract axons until satisfied (no orphan motors)');
Object.assign(SpikingArena, { createHandCellGenomeV1, createHandCellGenomeV2, createHandCellGenome });
