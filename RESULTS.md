# Round 4 results (final)

All numbers: champion (best on 10 validation arenas) tested on 60 held-out arenas, score = food − poison.
"frozen" = same champion with lifetime learning switched off. Means over seeds 1,2,3 unless noted.

## A. Global vs compartmental dopamine (80 generations, 4 arenas/brain)
| task | condition | score | frozen | channels used |
|---|---|---|---|---|
| random colours | global (1 channel) | **2.61** (3.05 / 2.80 / 1.98) | 0.84 | 1 |
| random colours | compartments (max 4) | 1.76 (1.60 / 1.45 / 2.23) | 0.48 | 2–3 |
| random colours | mushroom-body preset (2 ch) | 0.47 (0.67 / −0.28 / 1.02) | 1.06 | 1–2 |
| reversal mid-life | global | −0.12 (0.17 / 0.03 / −0.55) | −0.07 | 1 |
| reversal mid-life | compartments | 0.04 (0.45 / −0.70 / 0.37) | 0.18 | 4 |
| reversal mid-life | mushroom-body preset | 0.27 (0.48 / 0.17 / 0.15) | 0.39 | 1–2 |

Verdict: no benefit from compartments in 80 generations; reversal is not solved by any variant (all ≈ 0).
Default stays at 1 channel (global).

## B. Direct vs developmental genome, normal task
| condition | gens | score | frozen | genome numbers | hidden | synapses |
|---|---|---|---|---|---|---|
| direct | 80 | **11.23** (14.23 / 10.63 / 8.83) | 9.82 | 890 | 30 | 250 |
| developmental (final version) | 80 | 3.86 (5.40 / 4.87 / 1.30) | 3.14 | 143 | 30 | 152 |
| developmental (first version, weak init weights) | 80 | 2.54 | 2.44 | 170 | 37 | 193 |
| direct (2 seeds) | 40 | 7.43 | 7.26 | 868 | 30 | 243 |
| developmental (2 seeds) | 40 | 3.69 | 3.38 | 139 | 29 | 174 |

A hand-written 5-type / 19-rule developmental genome (≈220 numbers, push-pull wiring via an
inhibitory cell type) scores ≈11 on 20 arenas, so the encoding *can* express good brains;
evolution from random recipes just doesn't find them within 80 generations.

## B2. Scaling (40 generations, seeds 1,2, normal task)
| condition | score | frozen | genome numbers | hidden | synapses | min/run |
|---|---|---|---|---|---|---|
| direct, 30 hidden | **7.43** | 7.26 | 868 | 30 | 243 | 3.4 |
| direct, 120 hidden | 4.39 | 2.84 | 6,292 | 120 | 1,991 | 8.4 |
| direct, 300 hidden | 7.18 | 3.58 | 29,115 | 300 | 9,479 | 37.1 |
| developmental ×1 | 3.69 | 3.38 | 139 | 29 | 174 | 3.5 |
| developmental ×4 | 2.32 | 3.57 | 163 | 142 | 470 | 6.0 |
| developmental ×10 | 2.50 | 2.25 | 214 | 420 | 1,842 | 13.3 |

- Genome size: direct grows with the square of the brain (868 → 29,115 numbers); developmental stays at ~140–210 numbers from 30 to 420 hidden neurons.
- Score: developmental brains do not get better or worse with size (≈2.3–3.7). Direct brains beat them at every size here.
- Time: grown brains at ×10 run about 3× faster than direct 300-hidden brains, because they have far fewer synapses.

## Checks
- Old round-3 (v2) champion: same score in the new code (0.443 → 0.443, learning on). v1 sessions and v1 brain files load; a migrated session continues evolving.
- Developmental genome → JSON → re-import grows an identical network (all weights equal, same score). A session with developmental genomes saves and restores.
- Headless Chrome: no JS errors with direct and developmental (×1, ×2, ×4) populations, the mushroom-body preset, an old v1 session in localStorage, all buttons, export → re-import, and reload.

---
# Round 5: cellular development (interim, updated as runs finish)

## C1. Hand-designed body plan (`node cell_test.js`, 10 developmental-noise seeds × 60 held-out arenas)
Genome: 460 numbers (gene network 8×16 + read-out 32×9 + chemistry, seeds, growth constants, learning genes).
| condition | mean ± sd over growth seeds | worst / best grown brain | hidden | synapses | ms/growth |
|---|---|---|---|---|---|
| all mechanisms | 6.49 ± 2.50 | 3.10 / 10.85 | 73 | 215 | 45* |
| no trophic competition | 6.49 ± 2.50 | 3.10 / 10.85 | 76 | 220 | 24 |
| no activity refinement | 6.77 ± 2.70 | 3.48 / 12.53 | 73 | 215 | 15 |
| no homeostasis | 7.25 ± 2.50 | 3.60 / 10.98 | 73 | 215 | 13 |
(*first row includes JIT warm-up.) Reference: hand-wired direct circuit `example_circuit.json` ≈ 12.4.
Growth noise matters a lot (3.1 … 10.9 from the same DNA): mostly left/right imbalance of the two progenitor clones.

### C1b. Same, 2nd run with imposed symmetry option and fixed refinement (10 growth seeds × 60 arenas)
| condition | mean ± sd | worst / best | hidden | synapses |
|---|---|---|---|---|
| all mechanisms, imposed symmetry | 5.70 ± 2.30 | 2.17 / 10.02 | 77 | 220 |
| no trophic competition | 5.70 ± 2.30 | 2.17 / 10.02 | 79 | 224 |
| no activity refinement | 5.47 ± 2.57 | 1.52 / 9.58 | 77 | 220 |
| no homeostasis | 6.20 ± 3.11 | 1.00 / 11.50 | 77 | 220 |
| none of 4–6 | 5.66 ± 2.71 | 1.23 / 11.15 | 79 | 224 |
| **no imposed symmetry** (now the default) | **6.78 ± 2.81** | 3.08 / 11.38 | 73 | 216 |
| no symmetry, none of 4–6 | 6.77 ± 2.08 | 3.98 / 10.25 | 76 | 221 |
Imposed symmetry did not make growth more reliable, so it is off by default. For the hand plan, the three
mechanisms change the score by less than the noise between growth seeds (± 0.8 standard error).

## C2. Evolution, 40 generations, 3 seeds (normal task; before the symmetry option existed)
| start | held-out score | frozen | genome numbers | hidden | synapses | min/run |
|---|---|---|---|---|---|---|
| hand-designed body plan | **13.44** (13.95 / 12.98 / 13.40) | 12.28 | 460 | 69 | 184 | 2.7 |
| random cellular genomes | 2.94 (4.37 / 3.63 / 0.82) | 2.78 | 460 | 4 | 27 | 1.6 |
| (direct genome, round 4, 40 gens, 2 seeds) | 7.43 | 7.26 | 868 | 30 | 243 | 3.4 |
| (direct genome, round 4, 80 gens) | 11.23 | 9.82 | 890 | 30 | 250 | 5.9 |
Evolving from the hand-designed plan gives the best brains so far in this project; random cellular
genomes mostly grow almost no neurons (1–7 survive) and stay poor.

## C3. Evolution, 60 generations, 3 seeds, held-out 60 arenas (normal task, symmetry not imposed)
| condition | score (seeds 1/2/3) | mean | frozen | hidden | synapses | min/run |
|---|---|---|---|---|---|---|
| cellular, from hand plan (all mechanisms) | 13.43 / 12.82 / 14.72 | **13.66** | 13.29 | 88 | 261 | 9.4 |
| cellular, from random genomes | 3.92 / 4.72 / 2.88 | 3.84 | 3.86 | 5 | 28 | 4.8 |
| from hand, no trophic competition | 17.25 / 14.33 / 15.07 | **15.55** | 14.83 | 84 | 258 | 9.3 |
| from hand, no activity refinement | 13.73 / 13.20 / 14.38 | 13.77 | 13.19 | 56 | 160 | 9.2 |
| from hand, no homeostasis | 16.73 / 16.45 / 14.10 | **15.76** | 15.27 | 82 | 286 | 8.6 |
| direct genome (same 60 gens) | 13.32 / 8.55 / 8.83 | 10.23 | 9.61 | 30 | 251 | 6.4 |
Genome size: cellular 460 numbers for 56–98 hidden neurons / 160–300 synapses; direct ≈ 900 numbers for 30 hidden.
Champions are saved in `champions/` (brain files with the genome attached; load them in the UI).
Mechanism ablations: switching off trophic competition or homeostasis evolved slightly BETTER brains
(about +2 points, roughly 2 standard errors with only 3 seeds); switching off refinement made no difference
to the score (its evolved brains happened to be smaller, 56 vs 88 hidden). On this simple task these three
mechanisms do not help yet; they may matter for harder tasks or bigger brains (not tested).

## C4. Robustness: do evolved genomes grow working brains under other developmental noise?
Each 60-generation champion (from the hand plan) was regrown with 10 noise seeds (its own + 9 new),
each brain scored on 60 held-out arenas (`node cell_test.js champions/hand-sN.json`).
| genome | score with its own growth seed | mean ± sd over 10 growth seeds | worst / best |
|---|---|---|---|
| hand-designed plan | – | 6.78 ± 2.81 | 3.08 / 11.38 |
| evolved, seed 1 | 13.43 | 10.79 ± 2.68 | 5.28 / 14.75 |
| evolved, seed 2 | 12.82 | 9.53 ± 3.16 | 4.15 / 13.22 |
| evolved, seed 3 | 14.72 | 11.59 ± 3.32 | 4.43 / 14.83 |
Evolution made the DNA much better in general (6.8 → ~10.6 averaged over unseen growth noise), but part of
each champion's score comes from its lucky growth seed (≈ 3 points), and a few regrowths are still poor (≈ 4–5).
Ablating trophic competition / refinement / homeostasis on these evolved genomes changed the mean by
−2.4 … +1.2, mostly within noise (only champion 2 lost clearly without homeostasis: 9.53 → 7.11).

## Growth time
About 24 ms per brain without the juvenile phase and about 36 ms with it, on an idle CPU, averaged over 20 growths (≈ 75 neurons, ≈ 220 synapses). It was 45–65 ms while 8+ evolution runs shared the CPU. The grown network is cached per genome, so each genome grows once per generation.

# Round 6 (v5): robust-growth fitness, hard task, ablations
Hard task: 30 drifting items (60% poison) + 1 chasing predator; score = food − poison − 2·caught.
All runs: 40 generations, population 50, mutants of the hand plan, seeds 1–3, 3 arenas per genome per generation
(K=3 growths × 1 arena, or 1 growth × 3 arenas). Evaluation: the champion is regrown with **10 fresh
developmental-noise seeds** (never used in training/validation), each grown brain scored on 20 held-out arenas.
Hand-designed plan (not evolved) on the hard task: ~0.6–1.6 (3–20 growths); on the normal task 7.5.

## R6a. Robust fitness (K=3, λ=0.5, validation on 5 regrowths) vs single growth (K=1, own seed)
| condition | regrowth mean | regrowth min | sd over regrowths | own-seed score | hidden | synapses |
|---|---|---|---|---|---|---|
| robust (s1/s2/s3) | 1.74 / 3.56 / 4.21 → **3.17** | 0.10 / 2.65 / 3.45 → **2.07** | 0.68 | 3.13 | 97 | 356 |
| single (s1/s2/s3) | 3.80 / 1.62 / 2.73 → **2.71** | 2.35 / 0.10 / 1.05 → **1.17** | 0.90 | **4.78** | 79 | 229 |

Single-growth champions score 4.78 with their own (lucky) noise seed but only 2.71 when regrown: a 2-point
"lucky growth" gap. Robust champions score the same either way (3.13 vs 3.17), have a better worst case
(min 2.07 vs 1.17) and smaller spread. With 3 seeds the mean difference is within noise; the gap closing is clear.
Cost: robust runs took 17.4 min vs 9.0 min (3 growths per genome per generation; 15 runs in parallel on 8 cores).

## R6b. Mechanism ablations on the hard task (all robust settings; "all" = robust row above)
| condition | regrowth mean | regrowth min | sd | hidden | synapses |
|---|---|---|---|---|---|
| all mechanisms | 3.17 | 2.07 | 0.68 | 97 | 356 |
| no trophic competition | 3.64 | 2.27 | 0.74 | 108 | 339 |
| no activity refinement | 3.88 | 2.70 | 0.70 | 127 | 420 |
| no homeostasis | 3.42 | 1.33 | 1.04 | 115 | 340 |

None of the mechanisms helps measurably on the hard task either (seed-to-seed spread ≈ ±1.2, so all four are
statistically indistinguishable). Homeostasis is the only one whose removal worsens the worst case/spread (min 1.33,
sd 1.04), a weak hint that it buffers developmental noise.

## R6c. Sizes
Genome: 460 numbers in every condition (fixed-size GRN). Grown brains: 45–142 hidden neurons, 164–543 synapses.
Hidden→hidden synapses: ~0 (wiring is strictly sensory → hidden → motor; addressed in round 6b below).

# Round 6b: interneurons and recurrent wiring (hand plan v2)
New growth features (all genes, off for older genomes, which regrow bit-identically):
local axon collaterals (gene outputs: count 0–4 and length = local vs longer reach), a fixed **central-zone** morphogen
(stripe between sensory zone and motors), trophic support from hidden targets (gene `trophHid`), maxCells up to 400.
Hand plan v2 = v1 + 2 central progenitors: medial **M** cells (excitatory, 4 short collaterals onto each other =
recurrent "memory" loop, receive crossed green-eye F axons, drive the same-side motor) and lateral **X** cells
(inhibitory, cross the midline, inhibit the other side's M/X = left/right mutual inhibition).

Unevolved plans, hard task, 6 growths × 10 arenas: v1 1.03 (74 hidden, 0 h→h) · v2 −0.17 (140 hidden, 474 h→h);
growth time v1 ≈ 40 ms, v2 ≈ 85 ms.

## R6d. Evolution from plan v1 vs plan v2 (hard task, robust fitness, 40 gens, 3 seeds, 10 fresh regrowths × 20 arenas)
| start | regrowth mean (s1/s2/s3) | mean | min | hidden | synapses | h→h synapses | h→h removed* | min/run |
|---|---|---|---|---|---|---|---|---|
| plan v1 | 2.88 / 2.31 / 3.82 | **3.00** | 1.17 | 70 | 213 | 0 / 0 / 0 | no change | 4.3 |
| plan v2 | 3.04 / 3.96 / 3.31 | **3.44** | 1.15 | 193 | 922 | 1379 / 36 / 19 | s1 3.08→3.08, s2 3.80→3.07, s3 4.18→4.18 | 8.4 |

*Knock-out test: the champion's grown brains (5 regrowths × 12 arenas) scored intact and with every hidden→hidden
synapse deleted. Neuron counts: v2 champions keep 170–240 hidden neurons (v1: 34–109); recurrent loops: s1 57 neurons, s3 7, s2 0.
Reading: v2 is slightly ahead (+0.44) but within seed noise. Evolution mostly **pruned** the recurrent wiring
(474 → 36 and 19 h→h synapses in two runs); in the run that kept 1379 h→h synapses, deleting them changes nothing
(the loop stays silent). Only seed 2 actually uses its (mostly inhibitory) lateral connections (−0.7 when removed).
On this task, more interneurons and recurrence are tolerated but not yet exploited.

# Round 7 (v6): memory task (interim, updated as runs finish)
Memory task `flash`: 30 still items, half food; food is visible only 8 of every 100 ticks (own phase), poison always.
Control `flashvis`: the same arena with food always visible.
Hand plans, unevolved (5 growths × 12 arenas): v1 2.62 on flash vs 6.25 on flashvis. Hiding the food costs a
reactive brain about 60% of its score. Controlled assay (food 70–110 px ahead at ±20–35°, 4 growths, 16 trials each): v1 reaches it
within 95 ticks 97% of the time when it stays visible, but only 28% when it flashes for 8 ticks and then disappears.
First versions of plan v3 had runaway recurrent excitation (both memory populations firing every substep); the
final v3 uses weak M→M coupling (address 0.5 × seek 0.57), slow leak ~0.98 and projection axons to the motors.
Runs launched: plan v3 / v2 / v1 on flash, v3 on flashvis, and v3 with each of the three growth mechanisms off.
Every run used 40 generations, 3 seeds and robust fitness.

## R7a. Evolution on the memory task (40 gens, 3 seeds, robust fitness; 10 fresh regrowths × 20 held-out arenas)
| condition | regrowth mean (s1/s2/s3) | mean | min | hidden | synapses | h→h | slow cells* | min/run |
|---|---|---|---|---|---|---|---|---|
| plan v3 (memory) | 3.63 / 4.04 / 5.29 | 4.32 | 2.82 | 178 | 777 | 455 | 44–86 | 34 |
| plan v2 (interneurons) | 4.29 / 4.09 / 4.09 | 4.16 | 2.82 | 173 | 879 | 593 | 0 | 33 |
| plan v1 (feed-forward) | 4.39 / 4.85 / 3.97 | **4.40** | 3.55 | 94 | 347 | 0 | 0 | 19 |
| plan v3 on **visible-food control** | 9.43 / 8.68 / 8.77 | **8.96** | 7.05 | 171 | 726 | 363 | 0–81 | 30 |
| v3, no trophic competition | 3.80 / 4.71 / 4.40 | 4.30 | 3.03 | 190 | 852 | 331 | | 34 |
| v3, no refinement | 4.78 / 4.72 / 3.98 | 4.50 | 3.13 | 167 | 869 | 469 | | 31 |
| v3, no homeostasis | 4.39 / 3.49 / 3.98 | 3.95 | 2.07 | 124 | 705 | 482 | | 30 |
*from memory_test (5 regrowths).

Hidden food halves what evolved brains achieve (4.3 vs 9.0), so the task is genuinely harder. But all three plans end up
equal: memory circuits evolve and persist, yet they don't raise the score. Growth mechanisms: same picture as before
(within noise; homeostasis-off again has the worst worst case).

## R7b. Do the champions use memory? (`memory_test.js`, 5 regrowths × 12 arenas, score drop when knocked out)
| champion | intact | no h→h | slow → normal leak | memoryless (reset every tick) | turning sensors off |
|---|---|---|---|---|---|
| v1 s1 / s2 / s3 | 4.48 / 4.45 / 3.60 | (none) | (none) | 3.43 / 4.20 / 4.20 | (unconnected) |
| v2 s1 / s2 / s3 | 4.15 / 3.97 / 4.43 | 3.78 / 3.97 / **3.68** | (none) | 4.03 / **2.85** / **3.18** | (unconnected) |
| v3 s1 / s2 / s3 | 3.33 / 3.72 / 4.60 | **2.75** / 3.57 / 4.60 | 3.38 / 3.82 / 4.60 | 2.93 / 3.32 / 5.03 | 3.50 / 3.83 / 4.60 |
| v3-on-visible s1/s2/s3 (flashvis) | 8.33 / 8.60 / 8.27 | no change | 9.02 / 8.77 / 8.27 | 9.13 / 8.53 / 8.32 | 9.48 / 8.60 / 8.27 |

Reading: recurrent hidden→hidden wiring is used by 3 of 6 v2/v3 champions (drops of 0.4–0.75 when removed).
The slow-leak cells and turning sensors are never used: removing them doesn't hurt and sometimes helps. "Memoryless" resets
hurt most brains, including feed-forward v1 (whose neurons integrate input over several ticks). So this control
measures "temporal integration" in general, not only memory. Controlled homing assay (food flashed for 8 ticks at ±35–57°,
70–110 px): evolved champions reach it in 0–9% of trials, the same as the reactive hand plan. **Nothing evolved in 40
generations has learned to home on remembered food yet.** Their strategy is still to roam, avoid visible poison, and
pick up hidden food by chance.

# Round 8 (v7): modular engine, cue-then-turn memory test (final)
Engine split into `js/core` + `js/envs`. The bug arena port is **bit-identical** to v6: the hand plans and the v4, v5 and v6 champions grow identical weights, thresholds and leaks (with and without mirror symmetry). Their scores after 1500 ticks are identical on the flash, hard and normal tasks. `test_core.js` re-checks this against `legacy/v6/index_v6.html`.

Cue-then-turn **score** = correct − wrong over 20 trials, so the maximum is 20 and chance is 0. **Pass** = correct / all trials; silent trials count as fails.

## R8a. Hand-designed `memory` plan: pass rate vs delay (12 growths × 2 episodes × 20 trials)
| delay (ticks) | 0 | 5 | 10 | 20 | 40 | 80 | 160 |
|---|---|---|---|---|---|---|---|
| pass | 0.87 | 0.79 | 0.78 | 0.78 | 0.74 | 0.74 | 0.74 |
| wrong | 0.13 | 0.13 | 0.14 | 0.14 | 0.14 | 0.14 | 0.13 |
| silent | 0.00 | 0.09 | 0.08 | 0.08 | 0.13 | 0.13 | 0.13 |

- The latch is bistable (recurrent M excitation plus crossed X inhibition), so the pass rate hardly depends on the delay.
- About 8 of 12 growths score 100%. Failures come from lopsided growths (for example 3 M cells on one side and 29 on the other) that can't hold or flip one side.
- Plasticity off: 0.78 (same). Imposed mirror symmetry: 0.71.

## R8b. Evolution at delay 20, robust fitness (K=3, λ=0.5), 40 gens, 3 seeds; champions regrown with 10 fresh noise seeds × 20 held-out episodes
| start plan | seed | regrowth mean (sd) | min / max | pass (worst regrowth) | hidden | h→h synapses |
|---|---|---|---|---|---|---|
| memory | 1 | 14.43 (7.35) | 1.7 / 20 | 0.81 (0.50) | 97 | 767 |
| memory | 2 | 17.37 (5.60) | 2.6 / 20 | 0.91 (0.55) | 80 | 667 |
| memory | 3 | 15.31 (7.26) | 1.7 / 20 | 0.88 (0.54) | 108 | 825 |
| v1 | 1–3 | 0.00 (≈0.1) | about 0 | 0.39 (0.00): chance, always one side or silent | 77 | 0 |

- **memory plan:** mean 15.7 and pass 0.87, up from about 12.3 and 0.75–0.78 for the unevolved hand plan.
- **v1:** in 40 generations it never grows hidden→hidden wiring and stays at chance.
- Each run took about 6–7 minutes.
- Validation saturates: the champions score the ceiling (≈12.4 fitness = all validation trials right) on the 5 validation regrowths, yet fresh regrowths still include bad growths (min ≈ 2). More validation regrowths would help selection.

## R8c. Knock-outs: is memory used? (`memory_test.js`, 10 regrowths × 6 episodes, mean score / pass)
| brain | delay | intact | no hidden→hidden | slow cells → normal leak | memoryless (hidden reset every tick) |
|---|---|---|---|---|---|
| hand plan | 0 | 15.6 / 0.89 | 20.0 / 1.00 | 18.2 / 0.94 | 11.0 / 0.55 |
| hand plan | 20 | 12.3 / 0.75 | **0 / 0.00** | 13.6 / 0.72 | **0 / 0.00** |
| hand plan | 80 | 10.2 / 0.64 | **0 / 0.00** | 13.0 / 0.69 | **0 / 0.00** |
| evolved s1 / s2 / s3 | 0 | 15.5 / 17.9 / 15.0 | 20 / 20 / 20 | 15.5 / 20.0 / 16.4 | 15.0 / 18.0 / 12.0 |
| evolved s1 / s2 / s3 | 20 | 14.3 / 17.3 / 15.0 | **0 / 0 / 0** | 13.5 / 19.0 / 16.2 | **0 / 0 / 0** |
| evolved s1 / s2 / s3 | 80 | 14.4 / 17.2 / 15.9 | **0 / 0 / 0** | 13.6 / 18.0 / 15.8 | **0 / 0 / 0** |

- **The answer is held in recurrent hidden activity.** With no delay, the brains answer perfectly without hidden→hidden synapses. With any delay, removing them, or clearing hidden state each tick, leaves the brain silent: zero score, every time.
- **Slow-leak cells aren't needed.** Normal leak changes little, because the memory is an attractor, not a slowly decaying trace.
- **Longer delays generalise.** Champions evolved at delay 20 work unchanged at delay 80.
- Raw output: `results_v7/R8b_evolution.txt`, `R8c_hand_knockouts.txt`, `R8c_champion_knockouts.txt`.

## R8d. Curriculum from the memory plan (start delay 10, +10 when the champion passes ≥ 0.8, max 200), 40 gens, 3 seeds
| seed | final delay | regrowth mean at delay 200 (sd) | min | pass (worst regrowth) | hidden | h→h |
|---|---|---|---|---|---|---|
| 1 | 200 | 16.21 (7.36) | 1.5 | 0.90 (0.54) | 116 | 965 |
| 2 | 200 | 16.12 (6.26) | 1.5 | 0.85 (0.50) | 78 | 622 |
| 3 | 200 | 17.32 (3.89) | 10.0 | 0.87 (0.50) | 92 | 727 |

- All three seeds reached the maximum delay of 200 ticks, which is 40× the cue length.
- Knock-outs at delay 200 (6 regrowths × 3 episodes):

  | knock-out | effect |
  |---|---|
  | no hidden→hidden | 0, all seeds |
  | memoryless | 0, all seeds |
  | slow cells → normal leak | pass 1.00 → 0.67 (s1), 0.92 → 0.92 (s2), 0.81 → 0.58 (s3) |

  So at very long delays, two of the three champions also use their slow-leak cells.
- **Bug fixed during this round:** the first curriculum run checked the champion on its own-seed growth. When that growth happened to be bad, the delay never grew (one seed stayed at delay 10). The check now uses the champion's validation regrowths. The first run's output is kept in `results_v7/R8d_recall_and_curric_v0.txt`.
- Raw output: `R8e_curriculum.txt`, `R8e_curric_knockouts.txt`.

## R8e. Symbol recall (K=4 symbols, delay 10), 40 gens, 3 seeds
| start plan | regrowth mean (score = correct − wrong of 20) | pass | h→h |
|---|---|---|---|
| memory | 2.25 / 5.40 / 4.46 (mean 4.0) | 0.42 (chance for an always-answering brain 0.25) | 782 |
| v1 | −1.15 / −0.21 / 0.00 | 0.01 (silent) | 3 |

- From the memory plan (built for two symbols), evolution reaches about 2 of the 4 symbols. Knock-outs at delay 10 again give 0 without hidden→hidden synapses or with memoryless hidden state, so what it does recall comes from recurrent memory.
- v1 stays silent.
- Recall needs a K-way latch; a dedicated plan or longer runs are the next step.
- Raw output: `R8d_recall_and_curric_v0.txt`, `R8f_recall_knockouts.txt`.

## R8f. Text stub
- Plan v1: about 3–5% accuracy and 4.2–4.3 bits/char, against the unigram baseline of 25% and 3.61 bpc. It runs end to end in the UI and in Node. Learning anything here will need sequence memory (the cue/recall circuits) plus many more output-side mechanisms.

---
# Round 9 (v8): growth reliability and K-way memory
A growth **fails** if its pass rate is below 0.9 over 2 episodes × 20 trials (delay 20 unless stated). Tool: `growth_test.js`. Raw output is in `results_v8/`.

## R9a. Diagnosis: why ~1 in 5 (or more) growths fail (old `memory` plan and v7 champions, 100 growths each)
| brain | failed growths | mostly silent | mostly wrong (always one side) |
|---|---|---|---|
| plan `memory` | 48% | 23 | 25 |
| v7 cue-memory s1 / s2 / s3 | 41% / 21% / 42% | | |
| v7 cue-curric s1 / s2 / s3 | 30% / 38% / 36% | | |

What goes wrong (failed vs working growths, plan `memory`):
- **Axon targeting is fine.** Main axons fail 0%. About 16% of collaterals make no synapse, equally in failed and working growths.
- **Left/right cell imbalance barely matters.** Imbalance is 0.16 vs 0.12, and the minimum number of cells reached by an input is 16.5 vs 19.1. No population dies.
- **The real cause is variable loop gain in the latch.** Total recurrent excitation is 1330 vs 1538 mV, and the input a hidden cell receives varies hugely: q5/q25/q50/q75/q95 = 0 / 13 / 22 / 31 / 44 mV, with 10% of cells at 0. Traces show two failure modes:
  - The loop gain is too low, so the latch doesn't self-sustain after the cue and the brain stays **silent**.
  - The loop gain is too high, or one side is stronger, so the opposite cue can't flip it and the brain **always answers the same side**.
- Generic fixes applied to this crossed flip-flop did not help (failed growths):

  | variant | failed growths |
  |---|---|
  | imposed bilateral mirror | 65% |
  | growth-until-satisfied | 47% |
  | synaptic scaling | worse |

  The two-latch design needs a finely tuned asymmetry, which noise destroys. So the circuit was redesigned (R9b) instead of tuning it further.

## R9b. New mechanisms (genes; all off in old genomes, which grow identically: verified on 42 growths and in `test_core.js`)
- **Synaptic scaling** (`normE`, `normI`): each cell's total excitatory and inhibitory input from hidden cells is normalised to a set point.
- **Topographic map formation**:
  - The TOPO gene matches synapses by a positional label, so pre and post must have similar labels (width `topoW`).
  - `topoSnap` provides input-instructed identity: a TOPO cell's label snaps to the nearest input channel, so columns become discrete.
- **Parallel fibres**: the BIF gene splits the main axon into two cones running ±x.
- **Growth until satisfied** (`satisfy`): an axon with no synapse at full length keeps growing.
- **Redundancy**: more progenitors and a longer proliferation clock.
- **Fitness option `worstW`**: fitness = (1−w)(mean − λ·sd) + w·min over growths. Validation regrowths now default to 10.
- The imposed bilateral mirror is kept as a UI toggle for use as a fallback.

## R9c. `memoryK` plan: generic K-way working memory
The design is a band of slow excitatory M cells:
- Each cell takes its identity from the nearest input through topographic snapping, so input i → column i → output i.
- Each column self-excites through within-column recurrence, normalised by synaptic scaling.
- On GO, a central inhibitory X pool fires parallel fibres that silence all columns. The spike just before reset is the answer.

Nothing depends on K, so the same genome works for any K.

Pass rate (50 growths × 2 episodes × 20 trials):
| | delay 10 | delay 20 | delay 40 | delay 80 | chance |
|---|---|---|---|---|---|
| cue (K=2) | 1.000 | 1.000 | 1.000 | 1.000 | 0.5 |
| recall K=4 | 0.995 | 0.995 | 0.995 | 0.995 | 0.25 |
| recall K=8 | 0.993 | 0.993 | 0.993 | 0.993 | 0.125 |

- K=12: 0.997, with 0/30 growths failed.
- K=16 fails (0.02). The columns are 1.3 grid cells apart, which is the tissue resolution limit.

Failed growths (100 growths): cue 0%, K=4 1%, K=8 2%. With the imposed mirror: K=4 0/50, K=8 2/50. The plan `memory` failed 48%.

### Mechanism ablation (`ablate_memoryK.js`, 40 growths, delay 20): failed growths / mean pass
| variant | recall K=8 | cue |
|---|---|---|
| all mechanisms | 1/40 · 0.994 | 0/40 · 1.000 |
| no synaptic scaling | 34/40 · 0.312 | 36/40 · 0.383 |
| normE off | 15/40 · 0.788 | 7/40 · 0.917 |
| normI off | 10/40 · 0.813 | 6/40 · 0.934 |
| no growth-until-satisfied | 1/40 · 0.994 | 0/40 · 1.000 |
| continuous labels (no snapping) | 40/40 · 0.041 | 40/40 · 0.100 |
| no topographic matching | 40/40 · 0.090 | 40/40 · 0.300 |
| less redundancy (9 progenitors) | 13/40 · 0.822 | 10/40 · 0.854 |
| + juvenile homeostasis | 40/40 · 0.346 | 40/40 · 0.013 |

What the ablations show:
- Reliability comes from synaptic scaling, redundancy and discrete topographic identity.
- Growth-until-satisfied has no measurable effect here, because axons almost always find targets.
- Juvenile homeostasis destroys the memory, so it is off in memoryK.

### Knock-outs (`memory_test.js`, 5 growths × 2 episodes, delay 40): pass
| condition | recall K=8 | cue |
|---|---|---|
| intact | 1.00 | 1.00 |
| no recurrent excitation | 0 | 0 |
| no inhibition | 0.05 | 0.05 |
| no hidden→hidden | 0 | 0 |
| slow cells at normal leak | 1.00 | 1.00 |
| memoryless | 0 | 0 |

- Without inhibition there is no reset, so memories pile up.
- At delay 0, no recurrent excitation and no hidden→hidden both give 1.00. So it is the memory, not the readout, that needs recurrence.

## R9d. Evolution (40 gens, 3 seeds, robust fitness with 3 growths, λ=0.5, worst-growth weight 0.5, validation on 10 regrowths)
Champions were scored on 20 fresh regrowths × 5 episodes (`results_v8/R9_evolution.txt`). They were then regrown 100 times (`growth_test.js`; `gt_v8_*.txt`).

| run | pass (20 regrowths) | failed growths of 100: s1 / s2 / s3 | the start plan, same test |
|---|---|---|---|
| cue, from plan `memory` | 0.90 | 15% / 26% / 45% | 48% |
| cue, from `memoryK` | 0.94 | 13% / 5% / 3% | 0% |
| recall K=4 (delay 40±20), from `memoryK` | 0.97 | 1% / 4% / 4% | 1% |
| recall K=8 (delay 40±20), from `memoryK` | 0.95 | 12% / 6% / 16% | 2% |

- **Before vs after.** v7 champions failed in 21–42% of growths. memoryK champions fail in 1–16%, and 4 of the 9 meet the <5% target.
- **Evolution from memoryK did not improve on the hand plan; it made reliability slightly worse.** The plan already passes about 0.99, so fitness is at the ceiling. The champion is then chosen among near-ties on 10 fixed validation regrowths, which is a winner's curse: it picks genomes that were lucky on those seeds. Meanwhile hidden-cell counts drifted (80–228).
- **Recommendation:** use the hand plan for these tasks, or evolve at settings that aren't saturated (K=12, longer delays, text). A rerun with 6 growths per fitness evaluation is in R9d2.
- **Knock-outs on the champions** (`R9_champion_knockouts.txt`, delay 20/40): no recurrent excitation → 0; no hidden→hidden → 0; memoryless → 0; no inhibition → 0.05; slow cells at normal leak → unchanged.
  - At delay 0 the K=8 champion without recurrence still scores 0.45 (chance 0.125). So the readout path works, and the delay needs the recurrent memory.

## R9d2. Same evolution with 6 growths per fitness evaluation (`growths:6`; `R9b_evolution_growths6.txt`, `gt_v8_*_g6.txt`)
Failed growths per champion, s1 / s2 / s3, on two tests:

| run | `growth_test` (50 regrowths × 2 episodes) | experiment eval (20 regrowths × 5 episodes, jittered delays) | 3 growths per evaluation (R9d): growth_test / eval |
|---|---|---|---|
| cue, from memoryK | 2% / 2% / 0% | 10% / 5% / 0% (mean 5%) | 13 / 5 / 3% · mean 12% |
| recall K=8, from memoryK | 6% / 2% / 4% | 15% / 15% / 20% (mean 17%) | 12 / 6 / 16% · mean 13% |

- **cue: better.** 6 growths per evaluation gives a lower failure rate on both tests.
- **recall K=8: unclear.** The shorter test improves, but the stricter eval doesn't (17% vs 13%). With more episodes per regrowth, a pass rate just under 0.9 counts as a failure. Many K=8 failures are borderline: the worst regrowth of s1 passes 0.85.
- The hand plan memoryK is still the most reliable (0–2% on growth_test). Evolution doesn't improve on it because the task is at the ceiling.
- Cost: evolution takes 2× the CPU; this run took 52 min for 6 runs on 8 shared cores.

## R9e. Text: bigram baseline
| predictor | accuracy | bits/char |
|---|---|---|
| bigram fitted on the corpus | 0.598 | 1.614 |
| unigram | 0.246 | 3.613 |

The text env now shows both baselines. memoryK alone can only hold the current character, which is a "copy" predictor, so a learned transition stage is needed before it can help text.

## R9f. Hunger / deprivation signals and activity-timed requests (Travis's idea)
These are genes, off in old genomes. The UI has toggles for both. "Orphan output" means an output with no excitatory input at all. "Silent input" means a non-tonic input with no target.

**Plans** (`hunger_test.js`, 20 growths × 2 episodes, delay 20; `results_v8/hg_*.txt`):

| plan / env | off | hunger 1 | hunger 2 | request 1 | hunger 1 + request 1 |
|---|---|---|---|---|---|
| bug v3: orphan outputs | 33% | 0% | 0% | 2% | 0% |
| bug v3: silent inputs | 28% | 16% | 15% | 28% | 16% |
| bug v3: score | 1.78 | 1.37 | 2.49 | 1.23 | 1.61 |
| text v1: orphan outputs | 24% | 16% | 21% | 19% | 15% |
| text v1: score | 0.16 | −0.26 | −0.30 | −0.25 | −0.26 |
| recall K=8 v1: orphan outputs | 7.5% | 0.6% | 0% | 7.5% | 1.3% |
| recall K=8 v1: pass | 0 | 0 | 0 | 0 | 0 |
| recall K=4/8 memoryK: orphan outputs | 0% | 0% | 0% | 0% | 0% |
| recall K=8 memoryK: failed / score | 1/20 · 11.67 | 1/20 · 11.67 | 1/20 · 11.67 | 1/20 · 11.50 | 1/20 · 11.39 |
| cue memory / memoryK: orphan outputs | 0% | 0% | 0% | 0% | 0% |

**Bug arena, more growths** (`growth_test.js`, 30 growths × 3 episodes; `hg_bug.txt`): mean score

| | off | hunger 1 | hunger 2 | request 1 |
|---|---|---|---|---|
| v6 flash champion s1 | 1.03 | 1.40 | 1.36 | 0.98 |
| v6 flash champion s2 | 0.80 | 1.31 | 1.87 | 0.77 |
| v6 flash champion s3 | 3.98 | 4.94 | 4.77 | 4.38 |
| plan v3 (normal task) | 0.62 | 0.99 | 1.62 | |

- **Orphan motors in the bug arena** (that's the speed motor in every v3 growth): hunger fixes them, and the score goes up for all 3 v6 champions and for plan v3. The gain is about +0.4 to +1.0, at the edge of the noise but consistent across all 4 tests. This led to the new plan **v3h** (v3 + hunger 2).
- **Memory tasks:** hunger has no effect. With memoryK the outputs are never orphaned, and failures there come from latch dynamics, not wiring.
  - On the evolved K=8 / cue memoryK champions, which have up to 0.9% orphan outputs, hunger 1 removes the orphans, but failed growths stay the same: 12→15%, 16→15%, 13→11% (`gt_v8_hunger.txt`).
- **Text:** orphan outputs drop to 15–21%. The score doesn't improve; the stub doesn't learn either way.
- **Activity-timed request:**
  - Bug (no pairing defined, so every needy output requests): it wires the orphans but doesn't raise the score.
  - Recall (symbol i paired with output i): it adds direct input→output synapses, which slightly hurt memoryK (11.67 → 11.50). The memory, not the input, has to drive the answer after a delay.
  - It's kept as an option and left off by default. It is also effectively a developmental teaching signal: it needs the environment to say which output belongs with which input.

**Bug arena evolution, v3 vs v3h** (normal task, 30 gens, 3 seeds, robust fitness; champions regrown 10× × 5 episodes; `R9c_bug_hunger.txt`):

| start plan | regrowth mean (s1 / s2 / s3) | mean | min | hidden | synapses |
|---|---|---|---|---|---|
| v3 | 2.94 / 3.08 / 2.46 | 2.83 | 1.33 | 201 | 1672 |
| v3h (hunger) | 2.86 / 2.50 / 3.42 | 2.93 | 1.47 | 106 | 573 |

- After evolution the two are equal within noise. Evolution makes up for the orphan motor on its own.
- v3h champions are about half the size, so they are faster to simulate.
- Bug's default plan is now v3h: it helps the unevolved plan and costs nothing after evolution. Old genomes and plan v3 are unchanged.

---
# Round 10 (v9): learning transitions within a lifetime (toward text)
Environment `seq` (Sequence prediction). Each symbol is shown for 4 ticks; a GO/clock pulse in the first tick resets the working memory. Then comes a 4-tick prediction window, in which the outputs are read (winner-take-all) as the prediction of the next symbol.

Every lifetime brings a new random rule:
- **cycle:** a random order, repeated.
- **markov:** the preferred successor comes with p = 0.8.
- **order2:** a pattern in which the successor depends on two symbols.
- **text:** the tiny corpus.

"Ideal counter" is the best possible learner of first-order statistics on the same stream: it predicts the most frequent successor seen so far. Tool: `seq_test.js`. Raw output is in `results_v9/`.

## R10a. Plan `predictK` with teacher-gated plasticity (6 growths × 1 lifetime of 200 symbols)
| sequence | accuracy | first quarter | last quarter | chance | ideal counter (all / last q) | optimal |
|---|---|---|---|---|---|---|
| cycle K=4 | 0.971 | 0.883 | **1.000** | 0.250 | 0.980 / 1.000 | 1.000 |
| cycle K=8 | 0.889 | 0.647 | **0.970** | 0.125 | 0.960 / 1.000 | 1.000 |
| cycle K=12 | 0.767 | 0.383 | **0.943** | 0.083 | 0.940 / 1.000 | 1.000 |
| markov K=4 (p 0.8) | 0.732 | 0.670 | **0.750** | 0.250 | 0.778 / 0.810 | 0.800 |
| markov K=8 (p 0.8) | 0.660 | 0.443 | **0.743** | 0.125 | 0.762 / 0.810 | 0.800 |
| order2 K=6 | 0.616 | 0.530 | 0.630 | 0.167 | 0.540 / 0.560 | 1.000 (first-order 0.75) |

- With plasticity off, the same brains are at or below chance: 0.00–0.17. They mostly echo the current symbol.
- Learning is fast. At K=4 the transitions are learned within about 10 symbols.
- After about 50 symbols the brain gets within a few % of the ideal counter, except on order2, which needs a second-order memory (R10d).

## R10b. Learning rule comparison (same plan; the rule is set in its plasticity genes)
| rule | cycle 4 | cycle 8 | markov 8 |
|---|---|---|---|
| teacher-gated potentiation + presynaptic normalisation | **0.971** | **0.889** | **0.660** |
| reward-modulated STDP (dopamine +1 when correct, −0.5 when wrong; lr 0.05, eligibility 50 substeps) | 0.006 | 0.007 | 0.083 |
| reward-modulated STDP (lr 0.2, eligibility 200 substeps) | 0.003 | 0.001 | 0.040 |

- **Reward-modulated STDP fails.** The untrained brain echoes the current symbol, so it is always wrong. Dopamine dips depress whatever just fired, and with no correct trials there is nothing to reinforce. With K choices and no exploration, a reward signal alone is too weak a teacher.
- **The teacher-gated rule learns from every symbol.** The next symbol's own input is the teaching signal.

## R10c. Text corpus (19 characters; plan `predictKL` = the same genome on a 36×36 tissue)
| lifetime | accuracy | first quarter | last quarter | ideal counter (all / last q) | unigram | bigram (fitted on the whole corpus) |
|---|---|---|---|---|---|---|
| 200 characters (4 growths) | 0.371 | 0.230 | 0.450 | 0.470 / 0.555 | 0.246 | 0.598 |
| 600 characters (4 growths) | 0.447 | 0.345 | **0.487** | 0.546 / 0.585 | 0.246 | 0.598 |

- **Accuracy:** the brain learns bigram-like statistics within a lifetime. It is clearly above unigram (25%) and reaches 49% in the last quarter of a 600-character life. That is about 83% of what an ideal counter manages on the same stream, and below the corpus-fitted bigram (60%).
- **Bits per character are poor:** 3.1, against 3.61 unigram and 1.61 bigram. The readout is a softmax over a few spike counts and isn't calibrated; accuracy is the meaningful number.
- **Larger alphabets on the large tissue:** cycle K=16 gives 0.841 overall (last quarter 1.00); K=8 gives 0.952.
- **Tissue resolution:** K=16 failed on the 24×24 tissue in R9. The finer grid fixes that.

## R10d. Second-order context: not built (design sketch)
- **The order2 result shows the first-order limit.** Order2 needs the previous two symbols, and the brain stays at 0.63, below the first-order optimum of 0.75.
  - Note: it slightly beats the ideal *counter* (0.56). The counter breaks ties badly early on, and the brain's presynaptic trace (τ 12 substeps) carries a little information from the symbol before.
- **Plan for a two-step memory.** This needs a second band M2 that holds the *previous* symbol:
  - a late clock pulse (GO2, at the end of the prediction window) resets M2;
  - M → M2 copies the current symbol into it;
  - GO1 resets M but spares M2.
  - The plastic fibres from M and M2 would then need conjunctive (M, M2) units, e.g. sparse mixed-selectivity cells as in the cerebellar granule layer, so a pair can predict the next symbol.
- That needs a second clock channel in the env and a conjunctive layer. It is left for the next round.

## Caveats
- **Clock and teacher come from the environment.** The GO/clock pulse is supplied by the env, and the "teacher" is simply the next symbol's own input arriving at its prediction column. Nothing outside the brain computes errors.
- **A brain without learning can get lucky.** An untrained growth wires M→P by chance, and that fixed mapping can happen to match a short cycle: K=4 once gave 0.87 with plasticity off. test_core therefore checks the no-learning case at K=6.

# Round 11 (v10): second-order context and a calibrated readout
Raw output is in `results_v10/`. Each run is short (< 10 min); no evolution runs.

## R11a. Calibrated readout for bits per symbol (`R11a_calib_*.txt`)
The prediction is unchanged. Only the conversion of output spike counts into probabilities changes. Two online calibrators learn from the past symbols of the same lifetime: at each symbol they use the grid setting that had the lowest log loss so far.
- **calSoft:** softmax with a fitted temperature, plus a fitted uniform floor.
- **calCount:** spike counts plus a fitted uniform prior α.

"idealBits" is the online bigram counter with add-½ smoothing, which is the information-theoretic counterpart of the ideal counter.

| case | accuracy | bits (fixed β 0.5) | calSoft | calCount | idealBits (online counter) |
|---|---|---|---|---|---|
| cycle K=8 (predictK, 4 growths × 200) | 0.881 | 0.85 | **0.46** | 0.84 | 0.59 |
| markov K=8 | 0.661 | 1.71 | 1.68 | 1.86 | 1.55 |
| order2 K=6 | 0.630 | 1.27 | 1.26 | **1.10** | 0.87 |
| text (predictKL, 3 growths × 600) | 0.448 | 3.15 | **3.00** | 3.01 | 2.42 (unigram 3.61, corpus bigram 1.61) |

- **Calibration helps on deterministic streams:** on cycle K=8 the brain beats the online counter (0.46 vs 0.59).
- **On text it helps only a little (3.15 → 3.00).** The output spike counts are close to winner-take-all: the runner-up characters get almost no spikes, so the counts carry the brain's best guess but little of its uncertainty. Better bits would need graded output rates, e.g. weaker output inhibition or population outputs. That is a readout property, not a learning one.

## R11b — second-order context circuit (predictK2): representation (checkpoint)

Plan `predictK2` (M, X, R copy relay, M2, X2 gated reset, C conjunctive claw cells, P). Fixes needed for robustness
across growth seeds: X2 got polluted by R and by neighbouring X2 cells (shared tag T2) and its GO2 gate varied 1–3
synapses → some M2 columns were never reset or never loaded. Fix: X2 addressed by its own tag (T4, M2 seeks S4),
R axon short (`rBranch` −2.5), new cell-scale param `clawIn` (claw cells' total sensory/gate input fixed, 12),
juvenile Hebbian refinement off in this plan, `x2Thr` 4.5 (works 3–6).

Diagnostic (scratch `diag2.js`, K=6, growth seeds 100–400, decoded during the hold window):

| source | M = current | M2 = previous | active C / symbol | C cells driven by the right (M,M2) pair |
|---|---|---|---|---|
| cycle | 1.00 ×4 | 1.00 ×4 | 1.5–3.0 | 1.00 ×4 |
| order2 | 1.00 ×4 | 1.00 ×4 | 1.5–3.0 | 1.00 ×4 |

The second-order code is clean on all 4 growths (C cells cover 32–36 of 36 pairs). Learning C→P is the next step.

### R11b (cont.) — learning fixes (checkpoint)
Three further problems, all fixed generically:
1. **Pair coverage**: random claw choice left 1–4 of 36 (current, previous) pairs without any C cell. Claw choice is now
   *balanced*: claw cells of the same territory (own topo label) prefer the source column fewest of them have taken
   (competition for fibre partners). → 36/36 pairs, 3–5 C cells per pair on 6 growths.
2. **Fibre reach**: C fibres reached only ±2–3 columns of P (`reach` 1.7). `reach` 2.6 → every C column reaches every P column.
3. **Credit to the wrong context**: the teacher (next symbol) also loads M with that symbol, so the NEW context
   (prev, next) became active inside the teacher plateau and learned "predict the current symbol". New plasticity
   param `preLag` (substeps, default 0 = off): the teacher rule uses a pre-trace of spikes ≥ preLag substeps old. preLag 8.
New predictK2 defaults: mFibre 0 (C path only), lr 0.3, preNorm 40, normI 200, plateau 8, preLag 8.
Single growth (seed 100, 300 symbols): cycle6 acc 0.977 (last q 1.00), **order2 K=6 acc 0.970, last q 1.00** (first-order limit 0.75).

### R11b result — predictK2 vs predictK (3 growths × 300 symbols, K=6; `results_v10/R11b_*.txt`)

| case | plan | accuracy | first q | last q | bits (fixed) | calSoft bits | ideal 1st-order counter (last q) | 1st-order limit |
|---|---|---|---|---|---|---|---|---|
| order2:6 | predictK (v9) | 0.623 | 0.547 | 0.662 | 1.26 | 1.25 | 0.507 | 0.750 |
| order2:6 | **predictK2** | **0.970** | 0.880 | **1.000** | 1.25 | **0.19** | 0.507 | 0.750 |
| cycle:6 | predictK (v9) | 0.906 | 0.791 | 0.947 | 0.57 | 0.28 | 1.000 | 1.000 |
| cycle:6 | **predictK2** | **0.978** | 0.911 | **1.000** | 1.12 | **0.14** | 1.000 | 1.000 |

**Goal met: order2 K=6 goes past the first-order limit 0.75 to 1.00 in the last quarter** on all 3 growths, and
learns faster than the ideal first-order counter even on the cycle. With the calibrated readout it reaches 0.19 bits
per symbol (the first-order counter needs 0.77). The fixed softmax "bits" column is high because predictK2's output
counts are large (≈ 8 spikes), so the fixed temperature is too sharp; calibration fixes that.
(markov:6 / order2:8 for predictK2 were cut by the run's time limit.)

## R11c — text with predictK2L: not reached this round (negative result)
One growth × 600 symbols with the first predictK2L (36×36 tissue): accuracy 0.015 (chance 0.053; ideal first-order
counter 0.593 last q; predictKL v9 0.448). Diagnosis (`diag2.js`, K=16 cycle):
- The band edges were not on row edges of the 36-row grid, so the one-row bands (X, R, X2) smeared into their
  neighbours (sensors reached X and C, M fed X, …). Fixed: LARGE2 now uses bands on multiples of 1/18 → clean bands.
- Even with clean bands, 16–19 columns on 36 cells leave ~2 cells per column: M holds a symbol in 2 neighbouring
  "columns", M2 doesn't reset/load cleanly (decode 0.34), and only 21/324 C cells see one (M, M2) pair; ~12 of 256
  pairs are represented. The K=6 machinery needs ≈ 3+ cells per column, i.e. a ~60-row tissue for text, which would
  take well over the 10-minute run limit. Not attempted. So for text the best is still predictKL (0.448 acc / 3.00 calibrated bits).

### R11b (cont.) — other sequences with predictK2 (`results_v10/R11b_predictK2_markov.txt`, `..._order2_8.txt`)

| case | plan | accuracy | last q | calSoft bits | ideal 1st-order counter (last q) | limit |
|---|---|---|---|---|---|---|
| order2:8 (2 growths) | predictK2 | 0.830 | **0.873** | 0.38 | 0.687 | 1st-order 0.75 |
| markov:6 | predictK (v9) | 0.678 | 0.711 | 1.45 | 0.809 | optimal 0.80 |
| markov:6 | predictK2 | 0.569 | 0.627 | 1.89 | 0.809 | optimal 0.80 |

The price of a second-order-only readout: on a stochastic **first-order** source each C cell sees only 1/K of the
data for its symbol, so it learns slower (0.63 vs 0.71 last q). A mixed readout (C + weak M path, `mFibre: 1`)
is the obvious next step but made order2 worse in the quick tests, because the strong M path dominates the vote.

# Round 12 (v11): speed, and second-order text
(backup of v10 in `legacy/v10/`)

## R12a — speed (checkpoint; details in R12a table below when complete)
Simulation: event-driven spike propagation (list of this substep's spikes), teacher-rule nets skip the
eligibility/dopamine loops (which can't change anything there), cached plastic-synapse lists for preNorm.
Growth: numeric synapse keys, inlined matching score, squared-distance prefilters, precomputed reach masks,
no per-step array allocation in diffusion, alive-cell counter. Old genomes bit-identical (new check
`results_v11/eqv10.js`: growth W, thresholds, episode stats, spike counts, final weights and potentials vs `legacy/v10`).
predictK2L (36×36, text, 600 ticks): grow 2044 → ~1500 ms, simulate 1783 → 313 ms (337 → ~1950 ticks/s).

### R12a table — speed per tissue size (`results_v11/bench.js`, `results_v11/bench_xl.js`; 600 ticks, seed 100, same genome in both versions, results identical)

| plan / tissue | cells N | synapses | grow ms v10 → v11 | ticks/s v10 → v11 |
|---|---|---|---|---|
| predictK2 24×24 (order2 K=6) | 502 | 13 088 | 669 → 553 | 1 040 → 8 696 (×8.4) |
| predictK2L 36×36 (text) | 956 | 32 938 | 1 914 → 1 434 | 341 → 2 206 (×6.5) |
| plain 60×60 (LARGE2 scaled, nearly silent) | 1 132 | 28 924 | 7 497 → 4 244 | 6 250 → 6 593 |
| predictK2XL 60×60 (text; same v11-grown brain simulated by both nets) | 1 494 | 107 162 | – → 3 048 | 116 → 2 335 (×20) |

A predictK2XL text life of 1000 chars (10 000 ticks) now takes ≈ 3 s growth + ≈ 4 s simulation; in v10 the simulation alone took ≈ 86 s.
Web Worker for the browser: not done (optional; the per-generation cost is now small enough that the UI stays usable).

## R12b — a 60×60 tissue for second-order text (checkpoint)
New generic growth knobs (all default off/1, old genomes unchanged): `coneSpeed` (growth-cone steps per
developmental step: on a 60-row grid cones otherwise cover only 24/60 of the distance), `bifAt4` (own split
threshold for BIF4 axons), plan knobs `mBif` (memory axons split or not), `x2coll` (collaterals of the reset cells),
`T.sc` (cell-scale overrides). Layout "L60": bands on 1/30 row edges, the stack placed low (rows above die),
M 4 rows, X 1, R 1, M2 2, X2 1, C 8, P 7; rSyn 0.07, coneSpeed 3, bifAt4 1.8, mBif 0, x2coll 5.
Diagnostics K=16: M decode 1.00, 419/479 C cells clean, 254/256 pairs covered.
First runs (1 growth): cycle:16 last q **1.00**; order2:12 0.60 (200 symbols; ideal 1st-order counter 0.62);
**text 600: acc 0.372, last q 0.367** (predictKL 0.448). Growth+life ≈ 5 s.

## R12c — second-order text on 60×60: tuning, first+second-order combination (result)
Reference (online ideal counters, 5 streams): 1st-order 600 chars 0.546 / last q 0.588, 1000 chars 0.566 / 0.587;
2nd-order 0.692 / 0.788 (600), 0.733 / 0.790 (1000); 2nd-order with 1st-order backoff 0.707 / 0.788 (600). Corpus bigram 0.598.

Text, L60 + bifAt 5.5 (acc / last q / calSoft / calCount bits per char; idealBits = online first-order counter):

| setting | chars | growths | acc | last q | calSoft | calCount | idealBits |
|---|---|---|---|---|---|---|---|
| lr 0.3 (R12b) | 600 | 1 | 0.372 | 0.367 | – | – | – |
| lr 0.1 | 600 | 1 | 0.428 | 0.447 | – | – | – |
| lr 0.05 | 600 | 1 | 0.508 | 0.560 | 2.61 | 2.63 | 2.41 |
| lr 0.02 | 600 | 1 | 0.490 | 0.580 | 2.63 | 2.62 | 2.41 |
| lr 0.05, cThr −1.5 | 600 | 2 | 0.511 | 0.560 | 2.62 | 2.64 | 2.42 |
| lr 0.05, cThr −0.75 | 600 | 2 | 0.475 | 0.547 | 2.66 | 2.76 | 2.42 |
| lr 0.05, clawNorm 14 | 600 | 2 | 0.508 | 0.550 | 2.63 | 2.65 | 2.42 |
| lr 0.03 | 600 | 2 | 0.510 | 0.580 | 2.61 | 2.62 | 2.42 |
| lr 0.05 | 1000 | 2 | 0.542 | 0.572 | 2.45 | 2.46 | 2.20 |
| **lr 0.03 (plan predictK2XL)** | 1000 | 3 | **0.540** | **0.587** | 2.43 | **2.40** | 2.20 |
| lr 0.02 | 1000 | 3 | 0.534 | 0.587 | 2.45 | 2.41 | 2.20 |

Combining first- and second-order paths. The bottom C row has no M2 fibre, so it grows M-only cells.
These act as a first-order path, and their prediction is summed with the M×M2 conjunction cells at P.
(cmapt: the C weights match the ideal second-order argmax for 57/67 seen-context cells. dbg2: of C firings in the
hold window, 3932 come from M-only presyn and 3144 from M+M2; the M-only ones are mostly that bottom row.)
Ablation (`results_v11/abl.js`, 600 chars, 2 growths, lr 0.05): output weights of C cells set to 0:

| C cells used | acc | last q | calSoft |
|---|---|---|---|
| both paths | 0.514 | 0.560 | 2.62 |
| only M×M2 (second-order) | 0.417 | 0.507 | 2.79 |
| only M-only (first-order) | 0.397 | 0.440 | 2.92 |

So the summed paths beat either path alone. Making the other mixtures explicit (mBif 1 / mFibre 1 deep
splits) gave no gain (R12b, ≈0.37 at lr 0.3).

**Outcome:** with 1000 chars, last quarter 0.587 = the ideal first-order counter (0.585). That is just below the corpus
bigram 0.598, and far below the ideal second-order counter (0.79). Calibrated 2.40 bits/char vs 2.20 for the ideal
first-order counter. At 600 chars: 0.580 vs 0.588.
Why second order stays weak: there are 19² contexts, but only ≈ 60 columns × 1–2 conjunctive cells per M column.
Each context gets few cells, which learn slowly at the low lr that text needs (lr ≥ 0.1 brings back recency
errors). Raising the C threshold or lowering clawNorm did not make the conjunction more selective in a useful way.
Next: more C rows per column (taller C band or wider grid), or a per-path readout weight learned by the calibrated readout.

Fix (v11): the calibrated readout crashed in the browser (`CAL_SOFT[bs] is not iterable`) when a population grown
for K=6 kept running after the env was switched to text (19 symbols, so the target column was missing → NaN). Missing
columns now count 0 and the argmin is NaN-safe. Values are unchanged otherwise (equivalence checks identical).
Checks: `results_v11/eqv10.js` ALL IDENTICAL, `results_v9/equiv8.js` ALL IDENTICAL, `node test_core.js` ALL OK, headless
Chrome no errors (incl. text + two-phase clock → predictK2XL, Reset, run; `screenshot_seq_text_xl.png`).

# Round 13 (v12): closing the gap to the ideal second-order counter
(backup of v11 in `legacy/v11/`)

## R13a — diagnosis: the representation is there, the readout is not (checkpoint)
`results_v12/feat.js` records which C (conjunctive) cells fire in each symbol's hold window. It then scores
idealised online readouts on those features (predictK2XL, text, 1000 chars, 2 growths, last quarter):

| readout on the C-cell spike sets | last q |
|---|---|
| the network itself | 0.586 |
| ideal 1st-order counter / ideal 2nd-order counter | 0.584 / 0.790 |
| firing pattern as context key (counter per pattern) | **0.804** |
| sum of per-cell successor frequencies (what the net approximates) | 0.628 |
| same, with per-cell exponential averages (fixed rate 0.05 / 0.1 / 0.2 / 0.4) | 0.602 / 0.600 / 0.594 / 0.588 |
| sum weighted by each cell's sharpness (Σp²)^k, k = 1 / 2 / 4 / 16 | 0.686 / 0.736 / 0.750 / 0.754 |
| sum weighted by each cell's recent success (trust) | 0.640 |
| product of experts (sum of log p) | 0.676 |

So the C cells carry full second-order information: the pattern key even beats the ideal counter, because a pattern also
carries older context. About 177 of 479 C cells fire (the contexts that occur), 6 per symbol, and 78% of a cell's
firings fall in its top context. What loses accuracy is (a) the fixed-rate learning (a recency average instead of a count)
and (b) summing flat first-order cells with sharp second-order cells on an equal footing.

## R13b — metaplasticity and learned trust (checkpoint; text 1000 chars, 2 growths, predictK2XL + the setting)
Two new plasticity genes (off by default; old genomes identical):
- `metaN`: a cell's teacher-rule step shrinks as metaN/(metaN+E), E = potentiation it already received. Its
  normalised output weights become running averages (≈ counts) instead of a fixed-rate recency average.
- `trustPow` (+ `trustRef` 0.5, `trustMax` 4, `trustN` 200, `trustDelay` 2): learned per-cell trust. At each teacher
  event, every recently active cell measures the share of its plastic output weight that lands on the taught cells (the
  probability it gave to what happened). It keeps a running mean of that share, and its preNorm budget is scaled by
  min(trustMax, (trust/trustRef)^trustPow).
- (`confPow`: the same, but using the sharpness of the cell's own weights. It measures sharpness over P *cells*, not
  columns, so it mostly sees the random initial weights: little gain. Kept for completeness, off.)

| setting | acc | last q | calSoft | calCount |
|---|---|---|---|---|
| R12 best (lr 0.03) | 0.544 | 0.586 | 2.43 | 2.43 |
| metaN 40, lr 0.03 | 0.546 | 0.600 | 2.29 | 2.24 |
| metaN 40, lr 0.1 | 0.581 | 0.616 | 2.13 | 2.11 |
| metaN 40, lr 0.3 | 0.585 | 0.614 | **2.07** | 2.07 |
| metaN 40, lr 0.1, confPow 2 (ref 6, max 4) | 0.586 | 0.626 | 2.11 | 2.03 |
| metaN 40, lr 0.1, trustPow 1 | 0.570 | 0.636 | 2.12 | 2.25 |
| metaN 40, lr 0.1, trustPow 4 | 0.569 | 0.630 | 2.20 | 2.34 |
| metaN 40, lr 0.1, trustPow 4, readTicks 3 (env) | 0.587 | **0.660** | 2.15 | 2.10 |

Metaplasticity alone beats the corpus bigram (0.598): 0.616 last q, and 2.07 bits/char against 2.20 for the ideal
first-order counter. Trust adds a little more.
Where the rest is lost (`results_v12/wread.js`, metaN 40 + trustPow 4): an argmax of Σ (C spikes × the net's own C→P
weights) gives **0.728** last q, but the network's output gives 0.630. The P layer loses about 0.1:
- (a) **echo**: the current symbol's column still fires in the first read tick (taught input decaying), and it is the max in 26% of symbols;
- (b) saturation of P cells and output neurons (6% ties). P-cell counts over read ticks 2–4 give 0.678.

### R13b (cont.) — 4 growths × 1000 chars (text), checkpoint
New plan knob `pThr` (threshold gene of the P band, default 0). In the network, the predicted column often gets
too little drive to fire at all (12–18% of symbols); a lower P threshold helps.

| setting | acc | last q | calSoft | calCount |
|---|---|---|---|---|
| predictK2XL (R12) | 0.534 | 0.572 | 2.43 | 2.41 |
| metaN 40, lr 0.1 | 0.576 | 0.608 | 2.12 | 2.09 |
| metaN 40, lr 0.1, pThr −2 | 0.577 | 0.609 | 2.12 | **1.98** |
| metaN 40, lr 0.1, trustPow 2 | 0.554 | 0.626 | 2.19 | 2.31 |
| metaN 40, lr 0.1, trustPow 1, pThr −2 | **0.582** | 0.636 | 2.09 | 2.13 |
| metaN 40, lr 0.1, trustPow 2, pThr −2 | 0.572 | **0.646** | 2.14 | 2.24 |
| same, lr 0.2 | 0.579 | **0.646** | 2.12 | 2.21 |
| metaN 40, lr 0.1, trustPow 4, pThr −2 | 0.562 | 0.632 | 2.24 | 2.34 |
| (ideal 1st-order counter: 0.584 last q, 2.19 bits; corpus bigram 0.598) | | | | |

Trust window `trustN` 50 / 200 / 1000: 0.649 / 0.646 / 0.644. `trustDelay` 1 breaks it (0.43, measured before the
taught column is in plateau); delay 4: 0.632.

### R13b result — 8 growths (text; ideal 1st-order counter 0.584 / 0.588 last q at 1000 / 600 chars, corpus bigram 0.598)

| setting | chars | acc | last q | calSoft | calCount | idealBits |
|---|---|---|---|---|---|---|
| predictK2XL (R12) | 1000 | 0.536 | 0.581 | 2.43 | 2.43 | 2.19 |
| + metaN 40, lr 0.1 | 1000 | 0.576 | 0.610 | 2.15 | **2.13** | 2.19 |
| + metaN 40, lr 0.1, trustPow 1, pThr −2 | 1000 | **0.582** | 0.636 | **2.11** | 2.15 | 2.19 |
| + metaN 40, lr 0.1, trustPow 2, pThr −2 | 1000 | 0.576 | **0.650** | 2.15 | 2.24 | 2.19 |
| predictK2XL (R12) | 600 | 0.503 | 0.576 | 2.61 | 2.61 | 2.41 |
| + metaN 40, lr 0.1 | 600 | 0.547 | 0.603 | 2.34 | 2.33 | 2.41 |
| + metaN 40, lr 0.1, trustPow 1, pThr −2 | 600 | 0.543 | 0.614 | 2.34 | 2.38 | 2.41 |
| + metaN 40, lr 0.1, trustPow 2, pThr −2 | 600 | 0.524 | **0.617** | 2.42 | 2.51 | 2.41 |

Other knobs tried around trustPow 2 / pThr −2 (4 growths; all within ±0.02, the noise level at 4 growths):
- trust0 (starting trust) 0.1–0.7;
- trustN;
- plateau 4 / 12;
- preLag 4 / 12;
- tauPre 6 / 20 (20 worse: 0.613);
- cThr −2 / −4;
- preNorm 50–80;
- metaN 20 / 100.

Reading one tick later (env readTicks 3) does not change the 4-growth result (0.643 vs 0.646). The "echo" of the taught
column only wins when the prediction is weak anyway.

## R13c — more conjunctive cells: an 80×80 tissue (negative result)
Same layout scaled to 80×80 (`grid 80, maxCells 6000, coneSpeed 4–6, branchMax 700–1400, rSyn 0.0525`, 1–2 growths, text 1000):
- 868 C cells, 338 fire, 13.9 per symbol (60×60: 479 / 177 / 6.1);
- the idealised sharpness-weighted readout on them improves only a little (0.732 vs 0.712, `feat.js`);
- but the network reaches only 0.44–0.51 last q, and the linear readout of its own weights only 0.49.

Cause: 370 of 868 C cells reach only 16–17 of the 19 P columns (edge columns are missed; not fixed by branchMax
or coneSpeed), so they cannot learn those successors. The 60×60 diagnosis says more cells per context is not the main
limit anyway: 117 second-order cells fire, 2.8 per symbol, 83% pure, and every symbol has at least one.
Not pursued further this round. Activity-dependent recruitment of new cells was not tried.

## R13 summary
- **Plan predictK2XT** (`predictK2XL` + `metaN 40, lr 0.1, trustPow 2, pThr −2`; the default for text with the two-phase clock).
- **1000-char text, 8 growths:** last quarter **0.650** (R12: 0.581). That beats the corpus bigram 0.598 and the ideal first-order counter 0.584.
  - Whole life 0.576; calibrated 2.15 bits/char (ideal first-order counter 2.19).
  - The best bits come from metaN alone: 2.13 calCount (8 growths); 1.98 with pThr −2 (4 growths).
- **600 chars:** 0.617 last q.
- **Still far from the ideal second-order counter (0.79).** Losses, measured on the same runs:
  - the network's spiking readout vs a linear readout of its own weights: 0.65 vs 0.72 (weak predictions don't make P fire);
  - the learned trust vs the best idealised weighting: 0.72 vs 0.75;
  - the per-cell code vs the full firing pattern: 0.75 vs 0.80.
- **Checks:**
  - `results_v12/eqv11.js` (vs legacy/v11, incl. predictK2XL), `results_v11/eqv10.js` and `results_v9/equiv8.js`: ALL IDENTICAL;
  - `node test_core.js`: ALL OK (new test 10: predictK2XT text 0.55 last q at 300 chars);
  - headless Chrome: no errors (text + two-phase clock → predictK2XT, Reset, run).

# Round 14 (v13): recovering the readout loss
(backup of v12 in `legacy/v12/`). Base: plan predictK2XT, text 1000 chars, 4 growths unless noted. The ±0.02 noise from R13 still applies.

## R14a — receiver-pool mechanisms and a graded decoder (checkpoint)
New genes (plasticity group, all 0 = off; old genomes identical), acting on the cells that receive plastic synapses
(the P cells):
- `rcvDiv`, `rcvSig`: divisive normalisation of their plastic input. Each cell's plastic input is multiplied by
  rcvDiv · nRecv / (rcvSig + total plastic input to the pool), so total drive stays about constant (gain control).
- `rcvInh` (+ `rcvInhTau`): shared inhibitory pool; each receiver spike inhibits all receivers (soft winner-take-all).
- `rcvNoise`: Gaussian membrane noise (rate coding of weak inputs).

New decoder option (env `seq`, hidden param `readIn`, default 0): the count of each output adds readIn × the output
cell's summed synaptic input over the read window. This is a graded, subthreshold readout; a small value acts only as a tie-breaker.
`Agent` now also reports `out.input` (summed input per tick). It is only read by this decoder and doesn't change dynamics.

| setting (on top of predictK2XT) | acc | last q | calSoft | calCount |
|---|---|---|---|---|
| — (predictK2XT) | 0.572 | 0.646 | 2.14 | 2.24 |
| rcvInh 0.3 / 1 | 0.512 / 0.515 | 0.594 / 0.595 | 2.47 / 2.54 | 2.61 |
| rcvNoise 1 / 3 | 0.565 / 0.566 | 0.639 / 0.633 | 2.18 / 2.13 | 2.29 / 2.47 |
| rcvDiv 0.15 / 0.2 / 0.3 / 0.4 / 0.6 / 1 (rcvSig 20) | | 0.628 / 0.659 / **0.664** / **0.670** / 0.607 / 0.576 | 2.14 / 2.06 / 2.05 / 2.02 / 2.03 / 2.09 | |
| rcvDiv 0.3, rcvSig 5 / 60 | 0.598 / 0.583 | 0.651 / 0.634 | 2.05 / 2.07 | |
| rcvDiv 0.3, pThr 0 / −3 | 0.605 / 0.596 | 0.663 / 0.656 | 2.05 / 2.03 | |
| readIn 0.01 (decoder only) | 0.589 | 0.660 | 2.15 | 2.28 |
| **rcvDiv 0.3 + readIn 0.01** | **0.616** | **0.681** | 2.06 | 2.14 |
| rcvDiv 0.3 + readIn 0.1 / 1 | 0.614 / 0.600 | 0.676 / 0.659 | 2.08 / 2.15 | |

The shared inhibitory pool hurts: it also suppresses the teacher-driven firing that the learning needs.
Divisive normalisation removes the weak-drive failures. Per `results_v12/wread.js` (rcvDiv 0.3):
- the predicted column fires in every symbol (before: silent in 12–18%);
- the echo of the current symbol wins in 4% of symbols (before: 22%);
- what is left is mostly ties between output counts (12%), which the graded tie-breaker resolves.

## R14b — result: plan predictK2XN (= predictK2XT + rcvDiv 0.4, rcvSig 20), 8 growths
Ideal 1st-order counter 0.584 / 0.588 last q (1000 / 600 chars); idealBits 2.19 / 2.41; corpus bigram 0.598; ideal 2nd-order counter 0.79.

| plan | decoder | chars | acc | last q | calSoft | calCount |
|---|---|---|---|---|---|---|
| predictK2XT (R13) | spikes | 1000 | 0.576 | 0.650 | 2.15 | 2.24 |
| predictK2XT | + readIn 0.01 | 1000 | 0.591 | 0.663 | 2.16 | 2.29 |
| **predictK2XN** | spikes | 1000 | 0.607 | **0.673** | **2.03** | 2.05 |
| **predictK2XN** | + readIn 0.01 | 1000 | **0.623** | **0.686** | **2.00** | 2.08 |
| predictK2XT | spikes | 600 | 0.524 | 0.617 | 2.42 | 2.51 |
| predictK2XN | spikes | 600 | 0.562 | 0.651 | 2.27 | 2.30 |
| predictK2XN | + readIn 0.01 | 600 | 0.579 | 0.667 | 2.26 | 2.33 |

Readout loss (`results_v13/wread.js`, 2 growths): a linear readout of the net's own weights gives 0.724; the network
output now gives 0.694 (R13: 0.664 → 0.65 at 8 growths). About 0.03 is left (P-cell counts 0.712; output-count
ties 3%). Read-window variants change nothing (±0.005): hold 6 / read 6, hold 6 / read 4, read 3.
Other variants on top of rcvDiv 0.4 + readIn (4 growths, all ≤ 0.689):
- trustPow 4 / 6 (trustMax 16);
- rcvDiv 0.5;
- rcvSig 10;
- pThr 0;
- lr 0.2;
- rcvNoise 1.

Population-level conjunctive readout (pattern 0.80 vs per-cell 0.75): not tried this round. It would need another layer
of conjunctive cells.

Sanity, plan predictK2 (24×24, two-phase clock, 4 growths × 200 symbols; acc / last q / calSoft):

| genes | cycle:8 | markov:8 | order2:6 |
|---|---|---|---|
| predictK2 (unchanged) | 0.855 / 0.905 / 0.41 | 0.444 / 0.475 / 2.31 | 0.955 / 1.000 / 0.26 |
| + metaN 40, trustPow 2, pThr −2, rcvDiv 0.4 (lr 0.3) | 0.922 / **1.000** / 0.33 | 0.515 / **0.605** / 2.01 | 0.919 / 1.000 / 0.33 |
| + rcvDiv 0.4 only (no metaN: fixed-rate learning) | 0.732 / 0.780 / 0.55 | 0.366 / 0.370 / 2.38 | 0.556 / 0.625 / 0.73 |

Gain control needs the metaplastic (count-like) weights. Without them the normalised input amplifies noise.

## R14 summary
- **Default text plan predictK2XN:** last quarter **0.673** with the spiking decoder (R13 0.650, R12 0.581). With the graded tie-breaking decoder (`readIn` 0.01) it is **0.686**.
- **Calibrated bits/char:** 2.03 / 2.00, against 2.19 for the ideal first-order counter (1000 chars, 8 growths).
- **What helped:** divisive normalisation (gain control) of the prediction layer input (`rcvDiv`), and graded tie-breaking by summed input (`readIn`).
- **What didn't help:** the shared inhibitory pool (`rcvInh`; it fights the teacher), membrane noise, and longer or shorter read windows.
- **Readout loss:** 0.07 → 0.03.
- **Checks:**
  - `results_v13/eqv12.js` (vs legacy/v12, incl. predictK2XL / predictK2XT), `results_v12/eqv11.js` and `results_v9/equiv8.js`: ALL IDENTICAL;
  - `node test_core.js`: ALL OK;
  - headless Chrome: no errors.

# Round 15 (v14): a second mixing layer (granule / Kenyon-like)
(backup of v13 in `legacy/v13/`)

## R15a — offline estimate first (checkpoint; `results_v14/mix.js`)
On the C (conjunctive) spike sets of predictK2XN (text 1000, 2 growths), random sparse conjunctions were added: G cells, each
with k inputs from C cells near its x position (same column), firing when ≥ th of them are active. Readouts per feature
(online counts), unweighted (p0) or sharpness-weighted (p8, the idealised trust), last quarter:

| features | p0 | p8 |
|---|---|---|
| C only | 0.628 | 0.750 |
| G only, 2000 G, k 3, dx 0.05, th 2 (10.8 active/symbol, 0.5%) | 0.704 | 0.752 |
| G only, 3000 G, k 3, dx 0.03 | 0.686 | **0.764** |
| C+G, 2000 G, k 4, dx 0.05 | 0.678 | 0.760 |
| G only, 2000 G, k 2 / dx 0.2 (too few active) | 0.59 / 0.63 | 0.62 / 0.65 |
| (pattern of C cells as key) | 0.804 | |

Mixing helps a plain summed readout a lot (+0.07), but a well-weighted readout only by about +0.01. Small random
conjunctions don't reach the whole-pattern code (0.80).

## R15b — growing the mixing layer (checkpoint)
New generic developmental pieces (all off by default; old genomes identical, `results_v14/eqv13.js`):
- **Gene MIX** (cell output 45; older genomes are padded with it off). A mixing cell keeps the excitatory hidden inputs of
  `mixK` random presynaptic cells (chosen after growth). It has a fast membrane (`mixLeak`) and a fixed input budget (`mixNorm`).
- **Plasticity gene `mixInh`:** feedforward (APL / Golgi-like) inhibition. Each spike of a cell that projects onto mixing cells
  inhibits all mixing cells by mixInh mV.
- **Plan knob `T.mix`:** a G band between C and P, on spare staircase gene 9. G cells are TOPO, PLAST, bifurcating with
  no synapses before the split, tag T5, seek S5.
  - C axons pass through G on their way to P and synapse onto it; this is fixed, topographic, so the inputs come from the same column.
  - G sends teacher-gated plastic parallel fibres to P, alongside C, under the same metaN / trust / rcvDiv.
- **Layout:** the stack moved up 6 rows (the top rows die anyway). Without G, that layout alone gives 0.664–0.672 (2 growths), the same as predictK2XN.

First growth (C 8 rows, G 6 rows = 360 G cells, mixK 4): every G cell gets exactly 4 C inputs, sends about 178 plastic synapses to P,
and grows in 3.8 s (predictK2XN: 3.0 s). Tuning the input budget (1 growth, text 1000):

| mixNorm / mixLeak | G active / symbol | sparsity | coverage | ever active | G-only p8 | C p8 | net last q |
|---|---|---|---|---|---|---|---|
| 16 / 0.5 | 0 | 0 | 0 | 0 | – | – | 0.613 |
| 56 / 0.5 | 2.2 | 0.6% | 0.86 | 60 | 0.564 | 0.724 | 0.648 |
| 80 / 0.5 | 4.2 | 1.2% | 1.00 | 124 | 0.660 | 0.724 | 0.668 |
| 40 / 0.8 | 13.3 | 3.7% | 1.00 | 297 | 0.660 | 0.724 | 0.656 |

Offline on this growth, a 360-cell layer of k 4 gives at best C+G p8 0.724 (no gain); 720 cells give 0.736.

## R15c — predictK2XM results (text 1000 chars, 8 growths)
Plan **predictK2XM** = predictK2XN + MIX layer (G 6 rows, mixK 4, mixLeak 0.5, mixNorm 80, mixInh 0.5) + stack moved up 6 rows.

| plan (seq_test seeds) | acc | last q | calSoft | calCount | + readIn 0.01: acc / last q / calSoft / calCount |
|---|---|---|---|---|---|
| predictK2XN | 0.607 | 0.673 | 2.03 | 2.05 | 0.623 / 0.686 / 2.00 / 2.08 |
| **predictK2XM** | 0.625 | **0.697** | 2.01 | 2.02 | 0.639 / **0.708** / 2.00 / 2.04 |
| new layout, no MIX (C 14 rows) | 0.614 | 0.679 | 2.03 | 2.06 | |

**Ablation** (`results_v14/ablate_mix.js`, same 8 growths, seeds 1..8; noG = G cells silenced after growth, noC = C→P fibres cut):

| mode | acc / last q / calSoft / calCount | + readIn |
|---|---|---|
| predictK2XN (same seeds) | 0.598 / 0.656 / 2.106 / 2.101 | 0.613 / 0.673 / 2.082 / 2.130 |
| XM full | 0.623 / 0.692 / 1.988 / 2.010 | 0.633 / 0.700 / 1.984 / 2.031 |
| XM noG | 0.617 / 0.686 / 2.002 / 2.039 | 0.636 / 0.709 / 1.994 / 2.067 |
| XM noC | 0.475 / 0.532 / 2.553 / 2.729 | 0.485 / 0.543 / 2.597 / 2.785 |

G layer: 359.5 cells, 4.5 active per symbol → **sparsity 1.2%** (below the 5–10% target; more drive, e.g. mixLeak 0.8 → 3.7%,
did not help), **coverage 0.97** of symbols activate ≥1 G cell. Silencing G costs ≤ 0.006 (noise level); the XM gain over XN
(+0.024–0.036) comes mainly from the new geometry (longer columns / more C cells reaching P), not from mixing. G alone (noC) is weak.

4-growth tuning (all 0.65–0.68 last q, within noise): mixNorm 64/80/120 → 0.659/0.666/0.658; mixInh 0.5/1/2 → 0.677/0.669/0.667;
mixK 3/6 → 0.657/0.652; 12-row G (715 cells) → 0.663 (0.670 with mixInh 0.5; offline C p8 0.756, G 0.708, C+G 0.748).

**Sanity** (4 growths, 200 symbols; acc / last q / calSoft):

| plan | cycle:8 | markov:8 | order2:6 |
|---|---|---|---|
| predictK2XN | 0.959 / 1.000 / 0.20 | 0.720 / 0.775 / 1.53 | 0.922 / 0.970 / 0.29 |
| predictK2XM | 0.958 / 1.000 / 0.18 | 0.736 / 0.795 / 1.49 | 0.955 / 1.000 / 0.19 |

**Speed** (1 growth, text 1000): XN N 1494, grow 2.85 s, sim 3.18 s (3146 ticks/s); XM N 1854, grow 3.65 s, sim 4.50 s
(2222 ticks/s) → about 30% slower simulation, +0.8 s growth.

**Decision:** predictK2XM is better on both seed sets and on markov/order2, so it is the new text default (two-phase clock).
Note that the mixing layer itself is not what recovers the summation loss; the per-cell vs whole-pattern gap (0.75 vs 0.80) remains.

Checks: `results_v14/eqv13.js`, `results_v13/eqv12.js`, `results_v12/eqv11.js`, `results_v9/equiv8.js` all IDENTICAL;
`test_core.js` ALL OK (new test 11: predictK2XM grows 358 mixing cells, text 300 chars last q 0.61); headless Chrome: no errors.

# Round 16 (v15)
Design principle (Travis): always work toward the most biologically plausible AND best-functioning designs.

## R16a — slim plan predictK2XS (XM layout without the mixing layer) (checkpoint)
Plan knob `T.gap` (v15): the 8-boundary XM layout, but the G band is empty (its cells die; seed row in G dropped).
Other slim variants tried (seq_test seeds, 8 growths, text 1000; acc / last q / calSoft / calCount):

| variant | acc | last q | calSoft | calCount |
|---|---|---|---|---|
| predictK2XM (R15) | 0.625 | 0.697 | 2.01 | 2.02 |
| C 14 rows (C fills G), 6 seed rows | 0.617 | 0.675 | 2.00 | 2.04 |
| C 14 rows, 5 seed rows | 0.614 | 0.679 | 2.03 | 2.06 |
| C 8 rows, P directly below (P 13 rows) | 0.564 | 0.615 | 2.12 | 2.15 |
| **gap** (G band dies), 6 seed rows | 0.610 | 0.668 | 2.01 | 2.02 |
| **gap**, 5 seed rows (= XS) | 0.626 | 0.688 | 1.91 | 1.97 |
| gap 5 seed rows + readIn 0.01 | 0.646 | 0.712 | 1.89 | 1.99 |

XS vs XM on fresh seeds (`results_v15/cmp.js`, 8 growths each; last q spiking / readIn):

| seeds | XM | XS |
|---|---|---|
| 1..8 (ablate_mix seeds) | 0.692 / 0.700 | 0.664 / 0.683 |
| 20..27 | 0.700 / 0.710 | 0.663 / 0.676 |
| 28..35 | 0.682 / 0.691 | 0.677 / 0.695 |
| seq_test seeds | 0.697 / 0.708 | 0.688 / 0.712 |
| **mean (32 growths)** | **0.693 / 0.702** | **0.673 / 0.692** |

Growth is identical apart from G (C 480, P 419, C->P 93.7k plastic synapses in both). **Paired** ablation (same growth,
G->P removed; `ablate_mix.js S0=`): full - noG = +0.006 (1..8), +0.017 (9..16), +0.012 (17..24), +0.024 (25..32), +0.011
(33..40): **+0.014 over 40 growths, positive in 5/5 blocks**. So the R15 conclusion "G adds nothing" was too pessimistic: the
random mixing layer adds a small but consistent ~+0.014 (paired), and XS does NOT match XM (−0.02 spiking, −0.01 readIn).
XS stays registered as a faster option; predictK2XM stays the default.

## R16b — learned mixing cells: first sweeps (checkpoint)
New generic plasticity genes (v15, all 0 = off; net.js `initMixLearn` / `mixLearn`):
- `mixLr` (+ `mixN` consolidation, `mixPrune` structural pruning): **competitive instar rule** on the excitatory hidden inputs
  of mixing cells. On a mixing-cell spike, w += eta (Wtot x_pre / sum x_pre - w): the cell's input total stays fixed
  (heterosynaptic normalisation), inputs active before the spike gain, the others lose; inputs below mixPrune x mean are removed.
- `mixHomeo` / `mixRate`: **intrinsic homeostatic threshold** of each mixing cell, thr += mixHomeo (spike - mixRate) per substep
  (target mixRate spikes / substep, i.e. ~8% of symbol slots); the net keeps its own threshold copy (the genome is untouched).
- `mixGate`: teacher (dopamine-like) gating of the input rule by the share of the cell's output on taught cells.
Plan knob: `mixK 1000` keeps all ~22 grown candidate inputs (C cells of the same column) for learning.

4 growths (seeds 1..4), text 1000, on top of predictK2XM (last q / calSoft / G active per symbol / coverage):

| variant | last q | calSoft | G act | cov |
|---|---|---|---|---|
| XM (no learning) (2 growths) | 0.694 | 1.97 | 3.7 | 0.98 |
| mixHomeo 0.5 | **0.733** | **1.90** | 3.8 | 0.81 |
| mixHomeo 0.25 / 1 / 2 (1, 2: 2 growths) | 0.728 / 0.730 / 0.716 | 1.90 / 1.91 / 1.97 | | |
| mixHomeo 0.5, mixRate 0.0015 / 0.003 | 0.732 / 0.722 | 1.90 / 1.88 | | |
| mixHomeo 0.5, mixInh 1 | 0.737 | 1.88 | 3.5 | 0.79 |
| mixHomeo 0.5, mixK 3 / 5 | 0.734 / 0.724 | | | |
| + mixLr 0.003 / 0.01 | 0.730 / 0.714 | | | |
| + mixLr 0.05, mixN 20 | 0.718 | 1.93 | 5.2 | 0.92 |
| + mixLr 0.02, mixGate 1 (gate ~ never open) | 0.732 | 1.89 | | |
| + mixK 6, mixLr 0.02 | 0.718 | 1.94 | | |
| + mixK all (~22), mixLr 0.05 | 0.703 | 2.03 | 6.0 | 0.55 |
| + mixK all, mixLr 0.05, mixPrune 0.5 | 0.690 | 2.06 | | |
| + mixK 12, mixLr 0.05, mixPrune 0.5 | 0.691 | 2.05 | | |
| + mixK all, mixLr 0.2, mixN 10, mixPrune 0.7 | 0.695 | 2.04 | | |

8 growths, mixHomeo 0.5: seeds 1..8 last q 0.725 / calSoft 1.91 (XM 0.692 / 1.99); seeds 9..16 0.715 / 1.86 (XM 0.698 / 1.95).
So far: the **intrinsic homeostatic threshold** helps clearly (+0.02..0.04); the competitive synaptic rule hurts in every
form tried (more G activity, less selective).

## R16c — selectivity, gated learning, plan predictK2XG (checkpoint)
Selectivity (`ablate_mix.js`, 4 growths; G events = G spikes in the read phases 6-9; next-symbol accuracies are
cross-validated, trained on the first half of the text, scored on the second half, on the same G events):

| variant | last q | G act/sym (read) | sparsity read / phases 2-9 | coverage | cur purity | (cur,prev) purity | G -> next acc | current -> next | (cur,prev) -> next |
|---|---|---|---|---|---|---|---|---|---|
| XM (random, fixed) | 0.699 | 4.3 | 1.2% / 2.0% | 0.97 | 1.00 | 0.79 | 0.652 | 0.605 | 0.815 |
| + mixHomeo 0.5 (= XG) | **0.733** | 3.8 | 1.1% / 2.8% | 0.81 | 1.00 | **0.82** | **0.755** | 0.643 | 0.869 |
| + mixLr 0.05 | 0.713 | 5.3 | 1.5% / 3.1% | 0.93 | 1.00 | 0.80 | 0.744 | 0.666 | 0.836 |
| + mixK all, mixLr 0.05 | 0.703 | 6.0 | 1.7% / 2.7% | 0.55 | 1.00 | 0.78 | 0.715 | 0.659 | 0.820 |
| + mixLr 0.05, mixGate 1 | 0.729 | 3.8 | 1.1% / 2.8% | 0.83 | 1.00 | 0.82 | 0.752 | 0.643 | 0.872 |
| + mixLr 0.2, mixGate 1 | 0.732 | 3.9 | | | | 0.82 | 0.755 | | |
| + mixK all, mixLr 0.05, mixGate 1 | 0.700 | 4.7 | | 0.50 | | 0.74 | 0.693 | | |

(G spikes in phases 2-5, the transition, are unselective: with them the purity drops to 0.6 and G->next below current->next.)
The homeostatic threshold makes each G cell a better context detector (G->next +0.11 over the current symbol, was +0.05).
The teacher gate (now relative: output weight on taught cells / their number) is open too rarely to matter.

**predictK2XG** = predictK2XM + mixHomeo 0.5 (mixRate 0.002). Text 1000 chars, 8 growths per block (last q spiking / readIn; calSoft):

| seeds | XS | XM | XG | XG noG (paired) |
|---|---|---|---|---|
| seq_test seeds | 0.688 / 0.712; 1.91 | 0.697 / 0.708; 2.01 | **0.724 / 0.730; 1.92** | |
| 1..8 | 0.664 / 0.683; 2.07 | 0.692 / 0.700; 1.99 | **0.725**; 1.91 | 0.686 |
| 9..16 | | 0.698; 1.95 | **0.715**; 1.86 | 0.681 |
| 20..27 | 0.663 / 0.676; 2.09 | 0.700 / 0.710; 1.97 | **0.721 / 0.729; 1.89** | |
| 28..35 | 0.677 / 0.695; 2.01 | 0.682 / 0.691; 2.02 | **0.713 / 0.730; 1.95** | |
| mean | 0.673 | 0.694 | **0.720** | |

mixInh 1 instead of 0.5: same (0.723 / 0.735 readIn; 0.723, 0.721). Paired G ablation in XG: +0.034..0.039 (was +0.014 in XM).

Sanity (4 growths, 200 symbols; acc / last q / calSoft):

| plan | cycle:8 | markov:8 | order2:6 |
|---|---|---|---|
| predictK2XM (R15) | 0.958 / 1.000 / 0.18 | 0.736 / 0.795 / 1.49 | 0.955 / 1.000 / 0.19 |
| predictK2XS | 0.960 / 1.000 / 0.19 | 0.719 / 0.780 / 1.53 | 0.895 / 0.935 / 0.32 |
| predictK2XG | 0.956 / 1.000 / 0.18 | 0.701 / 0.770 / 1.56 | 0.955 / 1.000 / 0.22 |

Speed (one process alone, 2 growths, text 1000, seeds 20-21): XN 3102 ticks/s, grow 2.7 s, N 1496; XS 3046, 2.8 s, 1497;
XM 2641, 3.5 s, 1853; XG 2214, 3.6 s, 1853 (XG: -29% vs XS; more G spikes to propagate).

## R16 summary
- (1) predictK2XS (XM layout, G band dies) restores speed (3046 vs 2641 ticks/s for XM) but does NOT match XM: 0.673 vs 0.694 last q
  over 32 growths; paired ablation shows the random mixing layer adds +0.014. Not the default.
- (2) Learned mixing cells: the intrinsic homeostatic threshold (mixHomeo) is what works: **predictK2XG 0.720 last q (32 growths),
  ~1.9 bits**, +0.047 over XS, +0.026 over XM; G ablation now costs 0.035; G cells more selective (context purity 0.82, G->next
  0.755 vs current 0.643). Competitive instar learning of G inputs (+ pruning / consolidation / teacher gate) is neutral to harmful.
  XG is the new text default (two-phase clock).
- Checks: results_v15/eqv14.js, results_v14/eqv13.js, results_v13/eqv12.js, results_v12/eqv11.js, results_v9/equiv8.js all IDENTICAL;
  test_core ALL OK (test 10 -> predictK2XG default; new test 12: XG thresholds adapt, genome untouched; XS has no mixing cells);
  headless Chrome: no errors.

# Round 17 (v16)
## R17a — "the output is often one letter behind": diagnosis (checkpoint)
Script `results_v16/echo.js` (predictK2XG, text 1000 chars, 4 growths, seeds 1..4).

**Timeline** (mean output spikes per tick, by slot phase; columns of the current, next and previous symbol, mean other column):

| phase | what | current | next | previous | other |
|---|---|---|---|---|---|
| 0 GO2 | clock | 1.57 | 0.16 | 0.04 | 0.06 |
| 1 GO1 | clock | 1.26 | 0.15 | 0.02 | 0.06 |
| 2-5 | symbol shown = teacher drives its column | 1.87 / 2.00 / 2.00 / 2.00 | 0.12 / 0 / 1.28 / 1.60 | ~0 | ≤0.05 |
| 6 | read window tick 1 | 1.00 | 1.61 | 0.09 | 0.06 |
| 7-9 | read window | 0.03-0.05 | 1.58-1.59 | 0.08-0.09 | 0.06 |

(Phases 0-1: the prediction of the *current* symbol made in the previous slot is still firing; phase 6: exactly one pipeline
spike of the just-taught column, P -> output delay.)

**Scored predictions** (end of slot, read window = phases 6-9):

| | first quarter | last quarter | all |
|---|---|---|---|
| net = actual next | 0.473 | 0.724 | 0.649 |
| net = current symbol (echo) | 0.067 | 0.006 | 0.021 |
| net = previous symbol | 0.011 | 0.006 | 0.008 |
| corpus: next = current (double letters) | 0.012 | 0.012 | 0.013 |
| ideal bigram counter: = next / = current | 0.495 / 0 | 0.592 / 0 | 0.569 / 0 |
| ideal 2nd-order counter: = next / = current | 0.594 / 0.008 | 0.801 / 0.012 | 0.747 / 0.011 |

So the scored readout is NOT one behind: echo is 0.6% late in life (below the corpus double-letter rate), 6.7% in the first
quarter (the teacher's tail when nothing is learned yet).

**Display (the real cause):** the old stream drew each prediction one column to the right, under the symbol it predicted.
When the brain is right, the prediction therefore sits under (and appears together with) the symbol that has just arrived:
it looks like the output copies the current letter. The bar chart "output spikes in the last prediction window" showed the
previous prediction while the top line already showed the new symbol (= the predicted one when right). In the network view
the current symbol's output cell fires hardest of all (2 spikes per tick in phases 2-6): that is the teacher input.

## R17b — fix: display redesign + optional post-teacher afterhyperpolarisation (checkpoint)
**Display** (`js/envs/sequence.js` render / outputView; same table in `js/envs/text.js`):
- NOW panel: the input being shown (orange while presented = teacher, blue in the read window), the brain's prediction for the
  NEXT symbol (live WTA of the read-window spikes, '…' before the read window), and "last step: after 'x' it predicted 'y';
  actual next 'z' ✓/✗".
- History table, one column per step: input | prediction made while it was shown | the symbol that came next (green/red).
- Output bars: live in the read window ("prediction for the symbol after 'x'"), otherwise the last read window with the actual
  next boxed in green; a note that the current symbol's output cell firing in the network view is the teacher input.
- outputView: "next X" during the read window, "last pred X" otherwise (it used to show zeros outside the read window).

**Mechanism** (new plasticity gene, off by default): `teachAHP` / `teachAHPDur` (net.js): when a receiver's teacher drive ends
(teacher trace below half threshold after a plateau), it gets -teachAHP mV per substep for teachAHPDur substeps (12),
like the pause after a Purkinje complex spike. 4 growths (seeds 1..4) then 8 growths x 2 seed blocks:

| variant | acc | last q | calSoft | calCount | echo (all) | echo first q | echo last q | read-window spikes of current col, phases 7-9 |
|---|---|---|---|---|---|---|---|---|
| XG (4 growths) | 0.649 | 0.724 | 1.889 | 1.958 | 0.021 | 0.067 | 0.006 | 0.03-0.05 |
| + teachAHP 3 | 0.650 | 0.721 | 1.901 | 1.954 | **0.000** | **0.000** | 0.000 | 0.001-0.008 |
| + teachAHP 6 / 12 | 0.650 / 0.650 | 0.721 / 0.721 | 1.90 | 1.955 | 0.000 | 0.000 | 0.000 | |
| + teachAHP 6, dur 6 / 20 | 0.649 / 0.651 | 0.720 / 0.720 | 1.90 | 1.95 | 0.000 | | | |

| 8 growths | XG acc / last q / calSoft / echo | XG + teachAHP 3 | XG, readTicks 3 | XG + AHP 3, readTicks 3 |
|---|---|---|---|---|
| seeds 1..8 | 0.645 / 0.721 / 1.905 / 0.019 | 0.644 / 0.713 / 1.917 / 0.000 | 0.643 / 0.719 / 1.882 / 0.013 | 0.640 / 0.712 / 1.900 / 0.000 |
| seeds 9..16 | 0.640 / 0.720 / 1.868 / 0.018 | 0.637 / 0.713 / 1.879 / 0.002 | 0.634 / 0.713 / 1.837 / 0.014 | 0.632 / 0.707 / 1.855 / 0.001 |

The AHP removes the echo completely (also the 6.7% in the first quarter) but costs ~0.005 last-quarter accuracy (it also
silences the column for true double letters, 1.3% of the text), so it is NOT made default (XG unchanged). The one
pipeline spike of the taught column in read tick 1 remains (P -> output delay); skipping that tick (readTicks 3) improves
the calibrated bits (calCount 1.93 -> 1.85-1.88) but not accuracy; left as is.

## R17c — the brains you watch after Reset / Evolve are mutants; echo = the fallback of a brain that predicts nothing (checkpoint)
After "Reset" the UI watched `pop[0]`, a MUTANT of the plan; during evolution it shows champions / best of generation.
`results_v16/mutants.js` (12 mutants of predictK2XG, text 400 chars; acc / last q / share predictions = current input /
= previous / silent):

| | default decoder | + teachAHP 3 | readTicks 3 | teachAHP 3 + readTicks 3 |
|---|---|---|---|---|
| the plan itself | 0.578 / 0.770 / 0.038 / 0.023 / 0 | 0.575 / 0.760 / **0.000** / 0.025 / 0 | 0.575 / 0.760 / 0.025 / 0.020 / 0 | 0.578 / 0.760 / **0.000** / 0.020 / 0 |
| mutant mean (12) | 0.285 / 0.356 / **0.413** / 0.020 / 0 | 0.287 / 0.359 / 0.394 / 0.024 / 0 | 0.283 / 0.353 / 0.020 / 0.026 / 0.391 | 0.285 / 0.357 / **0.001** / 0.027 / 0.402 |
| echo machines (= current > 0.6) | 5 of 12 (0.69-1.00) | 5 | 0 (silent instead) | 0 (silent instead) |
(24 mutants, default: mean acc 0.242, echo 0.384.)

The 5 broken mutants (e.g. C band collapsed to 4 cells, P band halved, tiny brains) learn nothing; the only output spike in
their read window is the in-flight teacher spike of the current column (read tick 1), so the decoder reports the current
letter every time: "one letter behind". The teacher AHP cannot stop a spike already on its way to the output; skipping read
tick 1 (readTicks 3) turns them silent ('·'), with the same accuracy. Spike-frequency adaptation of the output cells
(tried, `outAdapt` 2 / 5 / 10: last q 0.691 / 0.415 / 0.486 on 4 growths, removed) suppresses the prediction too.

Decision: defaults unchanged (no option is more accurate; readTicks 3 trades -0.004 accuracy for -0.03 calibrated bits).
UI: Reset now watches the starting plan itself (unmutated); the seq view shows "so far: right x% · echo (prediction =
current input) y%" so an echoing brain is visible at a glance.

## R17 summary
- Diagnosis: the default plan's scored predictions are not one behind. Echo (prediction = current input) is 2.1% over the life:
  6.7% in the first quarter and 0.6% in the last, against 1.3% double letters in the text.
- The impression comes from (1) the old stream display, which put each prediction under the symbol it predicted, and
  (2) watched mutants. 5 of 12 mutants learn nothing and report the teacher's in-flight spike, i.e. echo 69-100%.
- Fixes:
  - Display redesigned. Reset now watches the plan itself, and an echo meter was added.
  - New gene teachAHP (off: removes the echo, accuracy -0.003..-0.007).
  - readTicks 3 turns echo mutants silent (off: accuracy -0.004, calibrated bits -0.03).
  - Output adaptation was tried and removed (hurts).
- New page growth.html ("How the brain grows"), linked from the index header.
- Checks:
  - equivalence v15 / v14 / v13 / v12 / v11 / v8: ALL IDENTICAL;
  - test_core ALL OK (new test 13);
  - headless Chrome: index.html and growth.html have no errors and no external requests.

# Round 18 (v17)
## R18a: "only about 1 in hundreds characters green" in the browser: reproduction (checkpoint)
Backup: `legacy/v16/`. Method: headless Chrome (puppeteer), clean profile vs injected localStorage. Sequence prediction is selected, then Text corpus, with no evolve and with Evolve. The watched brain's predictions are polled every 15–20 ms, and green fraction = right / all. Times are wall-clock at speed 10 unless stated.

| setup (v16 code) | watched brain | green |
|---|---|---|
| fresh profile, Text (no clock) | predictKL (first order), 200-char lives | 0.38 (last 100: 0.32–0.45) |
| fresh, Text + user ticks Two-phase clock | predictK2XG, 200-char lives | 0.44 (first quarter 0.17, last 0.56–0.63) |
| fresh, Text + clock + Evolve 60 s | same (no generation finished) | 0.40 |
| **v7 session saved after evolving seq cycle K=4 (gen 1), then Text + clock** | **old champion (predictK, small tissue)** | **0.085** (last 100: 0.04–0.11) |
| same session, Text without clock | old champion | 0.21 |
| "Text: next-character prediction (stub)" env (legacy/v16 page, 20 s) | plan v1, no learning | 145 / 2943 = **0.049** |
| v1 cellular session (bug), then seq, Text, clock | new population, plan XG | 0.42 at 20 s (life 200) |

Root causes, with evidence:
1. **The restored session wins over the current defaults.**
   - `restoreOrNew()` restored any v7 save silently. That includes its engine params, env params and population/champion (`fromJSON(…, true)`).
   - The watched brain is that session's champion (`useEvolution` → `showWatched('champion')`).
   - Changing Sequence to Text then only printed "the default plan … is now …; press Reset". The old champion, grown from a K=4 cycle plan, stayed watched: 8.5% green, near chance (5%).
2. **The never-learning text stub env** ("Text: next-character prediction (stub)", plan v1, 60-character episodes) is at chance (4.9%). A user looking for "text" can pick it from the env list.
3. **The defaults for Text weren't the best setup.**
   - Without ticking Two-phase clock, Text gets the first-order predictKL.
   - Lifetimes are 200 characters, so the watched life restarts before it reaches the late-life accuracy (node 0.72 is the last quarter of 1000 characters).
   - Result: 0.38–0.44 green.

Not a cause, checked:
- **History table vs scoring:** 1000 rows of a full life, rendered rows `[input, predicted, green, actual]`. green ⇔ predicted = actual in every row, and actual(i) = input(i+1). There is no off-by-one.
- **Watch loop:** plasticity stays on, weights reset only at the end of a life, `net.learning` is true.
- **Speed / Evolve:** they only change ticks per frame; the learning curve is the same per symbol (Evolve: 0.46 at symbol 230, vs 0.52 without Evolve at 330 on the same curve).

## R18b: fix (checkpoint)
- **Versioned saves:** `toJSON` writes `appVersion: 'v17'`, `defaultsVersion: 17` and `defaultPlan` (the env's default plan id at save time).
- **Load:** a session is restored only if `defaultsVersion` is current and its env settings still map to the same default plan. Otherwise:
  - it is copied to `spikingArena.session.prev` (the first auto-save would overwrite the v7 key);
  - the app starts from the recommended settings (engine `PARAM_DEFAULTS` + `recommendedEnvParams`);
  - **↶ Restore previous session** is shown. v5/v1 keys are offered the same way and never written.
- **Settings → ⟲ Reset to recommended settings:**
  - engine params go back to `PARAM_DEFAULTS`;
  - env params go back to the declared defaults + `def.recommend(P)`, keeping the env and its task keys (seq: source, K, det);
  - a new population starts from the default plan, and the watched brain is the unmutated plan;
  - the old session is set aside (restorable).
- **Recommended per task:** seq declares `recommend: P => P.source === 'text' ? { clock2: true, nSyms: 1000 } : {}`.
  - Choosing Text applies it with a message.
  - Switching environment applies the env's recommended params.
  - A change of the default plan always starts a population from the new plan and watches the plan itself (the old one is set aside), instead of "press Reset".
- **Text stub:** it has `redirect: { env: 'seq', params: { source: 'text' } }`. Its list entry reads "Text: next-character prediction (= Sequence prediction, Text corpus)" and opens that with the recommended settings, including a remembered `ui.env`.
- **Readout:**
  - the sequence view shows "accuracy so far X% · last 100: Y%" (bold green) and the echo share in the header;
  - `statusLine` has "last 100" (`SeqTask.lastAcc(m)`).
- **Engine unchanged:** genomes and scores are bit-identical (`results_v17/eqv16.js` vs legacy/v16: ALL IDENTICAL; eqv15 and eqv14 also IDENTICAL).

## R18c: browser before / after + regression test (checkpoint)
| scenario | v16 (before) | v17 (after) |
|---|---|---|
| fresh profile, seq → Text | 0.38 (predictKL, 200-char lives) | **0.67 / 0.68** over a full 1000-char life (quarters 0.46–0.50, 0.71, 0.74–0.75, 0.76–0.77; last 100: 0.72–0.79) |
| old evolved seq-cycle session in localStorage, then Text | **0.085** (old champion) | not restored (Restore button shown); Text 0.50–0.52 over the first 300 chars (same curve as fresh) |
| current-version session evolved on cycle, then Text | 0.085 | new population from XG, set aside; 0.52 at 330 chars |
| text stub env | 0.049 | redirects to seq + Text (XG) |
| Text + Evolve (40 s) | 0.40 | 0.46 at symbol 230 (same per-symbol curve; slower ticks) |

- Node reference (seq_test / test_core): last quarter ≈ 0.72; test_core: 0.64 for a 300-char life.
- `node browser_test.js`: 14 checks, ALL OK (≈ 110 s).
  - **A (fresh):** recommended setup, then 1000 history-table rows of one full life; the table is consistent; green ≥ 0.55, last 100 ≥ 0.60, last quarter > first + 0.15.
  - **B:** the old session is not silently restored; Text ≥ 0.40 over 300 chars.
  - **C:** Restore, then Reset to recommended.
  - **D:** stub redirect.
  - There are no page errors.
- Other checks: test_core ALL OK; full UI check (check8) has no errors; growth.html has no errors and no external requests.
- **Cost:** evolving on Text with 1000-character lives takes about 5× longer per generation than 200.

## R18 summary
The low green fraction came from the browser setup, not the learning rule. The UI silently restored an older session, kept its old champion (evolved for a 4-symbol cycle) when the task changed to Text, offered a never-learning text stub, and didn't use the best Text settings (two-phase clock, long lifetimes). v17 starts from the recommended settings, sets older saves aside with a Restore button, adds Reset to recommended, applies each task's recommended settings, and shows running and last-100 accuracy. The browser now matches node: 0.67 over a 1000-character life, 0.76 in the last quarter. `browser_test.js` guards this.

## R19: growth viewer (v18, checkpoint)
Scope: only the growth / brain visualizer. The user's order is growth viewer, then longer context, then reward learning. The v17 code is backed up in `legacy/v17/`.

**Passive growth recorder** (`growCell(g, { record: true })` → `brain.devLog`, format v2).
- It makes no RNG draws and changes no decision. Its timeline uses the 40 developmental steps plus 7 post-build stages: selection, mix, afferent survival, trophic, 2 juvenile-activity stages and Hebbian pruning.
- It stores events and deltas instead of snapshots:
  - per cell: parent, birth, moves (only when the position changes), state events (class / neuron / inhibitory, only on change), an int8 expression history, and death step and cause;
  - per axon: a flat Float32 path [x, y, step];
  - per synapse: one 7-number record plus its end step and reason (claw / mix / afferent / trophic / Hebbian prune);
  - morphogens: the fixed ones once, the emitted ones (4, 5) as uint8 per step;
  - juvenile: spikes and thresholds per block.

| default plan (seed 1) | neurons | cells | synapse records | axons | record size | growth time without / with recording |
|---|---|---|---|---|---|---|
| bug v3h | 205 | 169 | 812 | 448 | 0.3 MB | 168 / 187 ms |
| cue memoryK | 111 | 489 | 1653 | 449 | 0.6 MB | 182 / 156 ms |
| recall memoryK | 115 | 489 | 1651 | 451 | 0.6 MB | 127 / 161 ms |
| text predictK2XG (60×60) | 1853 | 2204 | 208445 | 4235 | 10.9 MB | 4.2 / 5.0 s |

- **Passivity:** W, thresholds and leak are identical with and without recording for all four default plans (test_core test 14). `results_v18/eqv17.js` (16 plan/env cases × 2 seeds; growth, episode stats, spike counts, final weights and potentials) vs legacy/v17: **ALL IDENTICAL**.
- **Viewer** (`viewer.html` + `js/ui/devview.js` + `js/ui/viewer.js`; offline, no dependencies):
  - tissue timeline with play, step and speed;
  - layers: morphogen heatmap (choose), cells by tag / fate / population, axons, growth cones, synapses, removed synapses, deaths, labels;
  - zoom, pan and fit;
  - cell inspector: tags, population, fate, threshold before / after homeostasis, leak, partners (highlighted, clickable), lineage, expression vector + history, gene decisions;
  - population wiring diagram with a live firing-rate overlay (▶ Run brain);
  - tooltips, legend, help.
- **Wiring:** the arena hands its watched brain over through localStorage (`spikingArena.viewer`). The Development tab now uses the same renderer (compact). growth.html links to the viewer.
- **Speed** (headless Chrome, DPR 2, flushed): small brains redraw in about 10–35 ms; the XL text brain takes about 14–80 ms per frame (software-rasterised axons into a reused pixel buffer, bounding-box culling, decimation). A hover-only change takes about 6 ms (cached base layer), and an unchanged frame is not redrawn.
- **Defaults and saves unchanged:** `APP_VERSION` is 'v18' and `DEFAULTS_VERSION` stays 17, so v17 sessions restore as before.
- **Tests:**
  - `viewer_test.js` ALL OK. For each env's default plan it checks no page errors, scrub, play, wheel zoom, drag pan, fit, hover, cell click → inspector, wiring node click, and Run brain with rates > 0. It also checks the Dev tab and the Open-growth-viewer hand-off (same N).
  - test_core ALL OK (14 tests); browser_test ALL OK; full UI check (check8) has no errors; growth.html has no errors and no external requests.
- **Screenshots:** `screenshot_viewer_growth.png` (text brain, step 23/40, zoom 1.25), `screenshot_viewer_growth_bug.png` (bug, step 18, coloured by fate), `screenshot_viewer_wiring.png` (text brain wiring diagram during a run).

## R20a: longer context — baselines, a bigger corpus, and an M2 reset bug (checkpoint)
Backup: `legacy/v18/`.

**New corpus `fables`** (`js/envs/text.js`, seq source `fables`): six Aesop fables retold in simple English. It has 4270 characters and 24 symbols (lowercase without j/q/x/z, plus space and full stop). Corpus bigram (fit on the corpus) 0.326; unigram 0.205.

**Ideal online n-gram counters** (`results_v19/ngram.js`; most frequent successor seen so far; backoff = fall back to lower order when the context is unseen). Each cell is all / last quarter.

| corpus, life | order 1 | order 2 | order 3 | order 4 |
|---|---|---|---|---|
| tiny text (224 chars, repeats), 1000 | 0.568 / 0.591 | 0.743 / 0.789 | 0.788 / 0.844 | 0.816 / 0.878 |
| tiny text, 2000 | 0.579 / 0.589 | 0.766 / 0.788 | 0.817 / 0.844 | 0.847 / 0.877 |
| fables, 1000 | 0.286 / 0.315 | 0.372 / 0.425 | 0.392 / 0.453 | 0.396 / 0.464 |
| fables, 2000 | 0.298 / 0.320 | 0.392 / 0.418 | 0.417 / 0.452 | 0.423 / 0.458 |
| fables, 4000 | 0.309 / 0.319 | 0.409 / 0.425 | 0.446 / 0.479 | 0.450 / 0.477 |

Order 3 can add about +0.055 (tiny text) and +0.035 (fables) over order 2.

**Baseline predictK2XG** (`results_v19/cmp.js`: paired, 8 growths, seeds 20–27, worker threads):
- tiny text, 1000 symbols: last quarter 0.721, calibrated 1.89 bits;
- fables, 2000 symbols: last quarter **0.286**, which is below the ideal first-order counter (0.324), at 3.78 bits.

**Diagnosis** (`results_v19/feat.js`, `results_v19/m2diag.js`):
- In the read window, the current symbol is decoded from the cells 100% of the time, but the previous symbol only 56% on fables.
- M2, the previous-symbol memory, is broken for many columns: with 24 columns, about half of the M2 columns are stuck on for most of the life (e.g. 0.38–0.82 of all slots) or never load.
- **Cause:** the gated reset cells X2 are CLAW cells. The claw keeps the M2 fibres of ONE source column, chosen with a balanced (anti-repeat) rule meant for the conjunctive C cells. With only 2–3 X2 cells per column, many columns end up with no own-column X2, so they are never reset. At 19 columns (tiny text) some columns are affected too (e.g. seed 20, column 'a' stuck in 68% of slots).
- **Fix (plan constant `clawOwn`, off by default):** an inhibitory claw cell keeps its own column (local feedback inhibition). With it, every M2 column is active in exactly 1/24 of the slots and always when its symbol was the previous one (cycle:24).

| paired, 8 growths | last quarter | calibrated bits |
|---|---|---|
| fables 2000: XG → XG + clawOwn | 0.286 → **0.325** (+0.038 ± 0.011) | 3.78 → 3.70 |
| tiny text 1000: XG → XG + clawOwn | 0.721 → **0.757** (+0.036 ± 0.008) | 1.89 → **1.63** |

Other knobs tried on fables (no or negative effect): lr, metaN, readIn (+0.03, decoder only), trustPow 0 (+0.02 on fables but −0.03 on text), topoW (no effect: synapses are not topo-limited here), mFibre (−0.01). A global M2 reset by inhibition prevents reloading (−0.07).

## R20b: predictK2XO, the new text default (checkpoint)
`predictK2XO` = XG + `clawOwn` (plan constant). Paired comparison with fresh seeds (S0 = 40), `results_v19/cmp.js`:

| task | XG last quarter | XO last quarter | Δ (paired) | calibrated bits XG → XO | ideal counter order 1 / 2 / 3 (last quarter) |
|---|---|---|---|---|---|
| tiny text, 1000 symbols, 12 growths | 0.711 | **0.764** | +0.053 ± 0.010 | 1.95 → **1.62** | 0.591 / 0.790 / 0.845 |
| fables, 2000, 8 growths (S0 20) | 0.286 | **0.325** | +0.038 ± 0.011 | 3.78 → 3.70 | 0.324 / 0.418 / 0.453 |
| fables, 4000, 8 growths | 0.298 | **0.312** | +0.013 ± 0.005 | 3.68 → 3.60 | 0.318 / 0.423 / 0.479 |
| order2:6, 600, 4 growths | 0.987 | 1.000 | +0.013 | 0.14 → 0.09 | 0.653 / 1 / 1 |
| order3:8, 600, 4 growths | 0.748 | 0.747 | −0.002 | 0.61 → 0.65 | 0.787 / 0.787 / 1 |
| cycle:24, 600 | 1.000 | 1.000 | 0 | 0.34 → 0.33 | 1 |
| markov:24 (det 0.8), 600 | 0.792 | 0.792 | 0 | 2.08 → 2.09 | 0.792 |

- **Ablation (text, XO, 8 growths)** shows the context memory is used:
  - silencing M2 (−100 mV) drops the last quarter from 0.765 to 0.560 (−0.206);
  - silencing X2 (so M2 is never reset) drops it to 0.572 (−0.193).
- **Speed:** XO runs at the same speed as XG or faster (fewer stuck M2 spikes): about 1900 ticks/s per thread.
- **Default and versions:** text and fables (with the two-phase clock) now default to predictK2XO. `DEFAULTS_VERSION` is 18, so older sessions are set aside (Restore) instead of silently restored. `APP_VERSION` is 'v19'.

**Context longer than 2 symbols: not reached yet.**
- order3:8 stays at the order-2 limit (0.747 vs 0.787).
- I looked at several designs; none fits this round:
  - **M3 slot:** needs a third clock phase and 2–3 new bands (relay, latch, gated reset), but only one free band gene (gene 3) is left.
  - **Fading trace band** (excitatory GO2-gated copy of M2, latched, ending by spike-frequency adaptation): needs a new ADAPT gene. C claw cells would also have to choose by (cell type, column), because M2 and trace fibres carry the same column label.
  - **Slow non-topographic mixing cells** (temporal conjunction of consecutive C patterns): random wiring covers about 3% of the needed trigram chains.
- What we gained instead: XO closes most of the gap to the ideal order-2 counter on tiny text (0.764 vs 0.790). On fables the remaining problem is sparse statistics: the brain lacks count-weighted back-off. Even XO's last quarter at 4000 symbols (0.312) is below the ideal first-order counter (0.318).

## R20c: UI cleanup and two display bugs (v19)
**Bugs (reproduced in headless Chrome: fresh profile, Sequence prediction → Text corpus, default plan, 1000 characters, watching and evolving).**
- **Output spikes for letters looked broken.** Two causes:
  - a read window has only 1–2 output spikes, but the bars were scaled to max(4, counts);
  - the panel showed the *live* counts, which are zero outside the read window and at its start, so most frames were empty.
  - Fix: the panel shows the last finished read window (live once it has spikes), scaled to the largest count, with the counts printed and a green box on the actual next symbol.
  - In the Activity tab, the raster was a nearest-neighbour downscale of about 1850 neuron rows to 170 px, so output cells (19 of 1853) were about 2 px and mostly dropped. Now each band (sensors / hidden / outputs) gets its own rows (at least 28), and each pixel is the OR of its neurons and time steps.
  - Seq, cue and recall draw their own output spikes, so the duplicate Outputs panel is hidden there.
- **Learning curve / fitness chart looked broken.**
  - The per-tenth curve had at most 10 points (2 by symbol 200), with no axis values and no x scale.
  - Now it uses bins of max(10, nSyms/20) symbols over the whole lifetime. Axes are 0/50/100 % and 0 / nSyms/2 / nSyms. It has chance and optimal lines, and a hollow last point for a partial bin.
  - The fitness chart said "Press Evolve" for the whole of generation 0 (minutes with text). It now shows "generation 0: evaluating i/50 brains (p%)" with a progress bar, and has a legend.
- **browser_test E** (new): during a 1000-character life:
  - the output bars drew up to 19 spikes in a read window;
  - the raster output band had up to 590 lit pixels;
  - the curve had ceil(n/bin) points with a symbol-weighted mean equal to the accuracy in 885 of 885 samples;
  - the status line's accuracy matched within 1.5 points after 100 symbols in 777 of 798 samples (the misses are a one-frame lag);
  - the chart showed generation-0 progress.

**Removed or moved (each number now appears in one place).**
- Status line:
  - now `gen N (p%) · champion X (regrown a–b) · watched: <key result>`;
  - removed: the env id/task (the selector shows it), the full env statusLine (moved to Settings → stats "watched episode"), hidden count / h→h / slow (Brain tab), ticks/s (Settings).
- Canvas header: "env name · watching" → "watching" (the selector shows the env).
- Seq canvas:
  - removed: the status line (symbol, accuracy, quarters…; accuracy is in the top bar), "accuracy so far / last 100" under the result, the slot footnote and the network-view note;
  - the reference line was shortened;
  - the prediction line was shortened to "after 'x': predicted 'y', next was 'z'".
- Memory canvas: pass % and delay were removed from the top line (pass % is in the top bar; the delay is in the bottom line).
- Bug canvas: score and speed were removed (score is in the top bar, speed in the Outputs panel); it shows t / episode length instead.
- Brain tab info: three compact lines. Dropped: the "direct sensor→output 0" and "pruned by activity" zeros, the long "Grown by cellular development…" sentence and the "sensor→motor" depth wording.
- Lifetime learning text: five aligned lines instead of eight long ones.
- Settings → stats: generation and champion were removed (top bar); evaluation progress, regrowth min/mean/max, last generation, environment means, the full watched-episode line, ticks/s plus spikes/tick and autosave stay.
- Notes in the Brain / Development tabs were shortened. The "show" checkbox was renamed "animate". The fitness chart got a legend and the "gen N" labels are aligned.
- Screenshots:
  - `screenshot_ui_{bug,cue,recall,seq}_{before,after}.png`: full window, during evolution; bug "before" is from legacy/v18;
  - `screenshot_ui_seq_panels.png`: learning curve and output spikes, before/after;
  - `screenshot_ui_chart.png`: fitness chart during generation 0;
  - `screenshot_ui_raster.png`: spike raster.

## R20 summary
- predictK2XO (own-column X2 reset) is the new text default: tiny text last quarter 0.711 → 0.764, calibrated bits 1.95 → 1.62. Fables: 0.286 → 0.325 at 2000 symbols.
- A context longer than 2 symbols was not reached: order3 stays at the order-2 limit. The designs and the gene budget are in R20b.
- New sources: Fables (4270 characters, 24 symbols) and order3.
- UI cleanup and display bugs are covered in R20c.
- test_core, browser_test (with the new panel checks E) and viewer_test pass; `results_v19/eqv18.js`: old plans are bit-identical to legacy/v18.

## R21a: reward-only learning, first working actor-critic (checkpoint)
New generic mechanisms, all off by default (PL_DEFAULTS, base.js):
- `rpe`: a TD critic. A graded value cell reads the state cells through plastic weights; dopamine is the reward-prediction error δ = r + γV' − V.
- `actNoise`: correlated exploration noise per action channel (Ornstein–Uhlenbeck).
- `actFb` / `outInh`: an action-selection loop. Each output spike excites its own column and inhibits the other columns and outputs.
- `rcvHomeo`: adaptive thresholds of the cells with plastic inputs.
- `preNorm` now also works with the reward rule.

New environment `bandit`: a contextual bandit with 2 contexts × 3 arms. The best arm pays 0.9 and the others 0.1. The best arms are new each lifetime and change every 60 trials; a lifetime is 240 trials. New plan `rewardK`.

The first version was at chance. Three things caused it:
- Per-cell noise averages away inside a 70-cell column, so the policy never explores. Fix: one noise source per action channel.
- The choice (a few output spikes) was not what the eligible synapses had done. Fix: efference copy from the output back to its column.
- GO dominated the central column. Fix: weak broadcast GO (`wDiffuse` 4).

Bandit results, 8 growths (seeds 11–18). "best arm" = share of trials where the best arm was chosen:

| variant | best arm (whole life) | first quarter | 2nd half of each block | rewarded | silent trials |
|---|---|---|---|---|---|
| **rewardK (TD critic + noise + loop)** | **0.524** | 0.621 | **0.659** | 0.512 | 20 |
| plasticity off | 0.287 | 0.327 | 0.289 | 0.313 | 36 |
| raw reward, no critic (`rpe 0`) | 0.315 | 0.465 | 0.336 | 0.347 | 7 |
| no exploration noise | 0.337 | 0.294 | 0.356 | 0.364 | 5 |
| no action loop (`actFb 0`, `outInh 0`) | 0.423 | 0.433 | 0.523 | 0.422 | 44 |
| chance / reference learner (discounted Thompson sampling) | 0.333 / 0.692 | – / – | – / 0.847 | | |

## R21b: outcome RPE, value-dependent exploration, cue task with a random mapping (checkpoint)
**Why the cue task first failed (it learned the wrong way round).** We traced it one tick at a time (`/tmp` scripts; the numbers are in this section):
- With γ = 0.9 per tick and a steady negative value, the TD error is a constant positive drift, δ = (γ − 1)V = +0.05. This drift, integrated by `tauMod`, potentiated whatever was eligible during the delay.
- At GO the memory is reset, so the state disappears before the outcome. V then ramps to 0, which is a spurious positive δ just before every wrong answer.
- With TD, pass rate fell below chance (to 0.1).

**Fixes:**
- `rpeMode 1`, outcome-only (Rescorla–Wagner) critic: dopamine = r − V(now) at outcome events, 0 between them.
  - An omitted reward counts as an outcome: tasks mark trial ends with `ev.outcome`, and the agent passes this to `net.modulate`.
  - The critic learns only at outcomes.
- `actNoiseV`: exploration noise divided by (1 + actNoiseV·V). The animal explores where it expects little reward and exploits where it expects much. Re-exploration after a bandit switch comes for free.
- New plan `rewardMemK` = `rewardK` with working-memory state columns: self-exciting, reset by GO through X (`s7 5`, `xgo 5`, as in memoryK). In the bandit, the relay columns of `rewardK` remain better (best arm 0.433 with memory columns vs 0.561).
- Cue/symbol envs:
  - new param `mapping: 'random'`: the rewarded side for each cue is a random permutation per lifetime;
  - with that mapping, GO is broadcast (as in the bandit; no old brain is affected);
  - the default plan is then `rewardMemK`;
  - hidden param `wrongCost` (default 1). Setting it to 0 makes the task reward-only: no punishment for a wrong answer.

**Bandit (8 growths, seeds 11–18), new rewardK defaults** (`rpeMode 1`, `actNoiseV 5`): best arm **0.653**, last quarter **0.692**, 2nd half of blocks **0.790**.
- Previous TD version: 0.524 / 0.350 / 0.659.
- Thompson-sampling reference: 0.692 / 0.660 / 0.847.
- Outcome RPE without actNoiseV: 0.561 / 0.527 / 0.673.

**Cue-then-turn, random mapping, delay 10, 120 trials, 8 growths. Pass rate = correct / all trials:**

| variant | wrong = −1: pass | first quarter | last quarter | reward only (wrong = 0): pass | first quarter | last quarter |
|---|---|---|---|---|---|---|
| rewardMemK, outcome RPE + noise + loop | 0.801 | 0.700 | 0.854 | 0.715 | 0.600 | 0.775 |
| + value-dependent noise (`actNoiseV 5`) | **0.876** | 0.683 | **0.938** | **0.815** | 0.650 | **0.883** |
| raw reward, no critic | 0.821 | 0.629 | 0.883 | 0.695 | 0.625 | 0.704 |
| no exploration noise | 0.877 | 0.621 | 0.979 | 0.602 | 0.512 | 0.646 |
| TD critic (`rpeMode 0`) | 0.398 | 0.400 | 0.417 | | | |
| no action loop | 0.757 | 0.650 | 0.808 | | | |
| plasticity off | 0.350 | 0.304 | 0.404 | | | |
| memoryK (old default; cannot learn a mapping) | 0.625 | 0.625 | 0.625 | | | |

How to read the cue table:
- With symmetric ±1 reward, raw reward already carries a sign, so the critic adds little. Noise is not needed either: two actions plus intrinsic variability are enough exploration.
- With reward only (wrong = 0), the critic and the noise are both needed:
  - raw reward 0.695 and no noise 0.602, vs 0.815 for the full plan;
  - with value-dependent noise, the late performance is close to the no-noise case.

## R21c: final ablations with the new defaults (checkpoint)
Settings: 8 growths each. Bandit: seeds 11–18, 240 trials, switch every 60. Cue: random mapping, **reward only (wrong = 0)**, delay 10, 120 trials.

| variant | bandit: best arm | last quarter | 2nd half of blocks | cue: pass | first quarter | last quarter |
|---|---|---|---|---|---|---|
| **full** (rewardK / rewardMemK) | **0.653** | **0.692** | **0.790** | **0.815** | 0.650 | **0.883** |
| plasticity off | 0.287 | 0.248 | 0.289 | 0.350 | 0.304 | 0.404 |
| raw reward, no critic (`rpe 0`) | 0.315 | 0.196 | 0.336 | 0.695 | 0.625 | 0.704 |
| no exploration noise (`actNoise 0`) | 0.382 | 0.377 | 0.424 | 0.602 | 0.512 | 0.646 |
| fixed noise (`actNoiseV 0`) | 0.561 | 0.527 | 0.673 | 0.715 | 0.600 | 0.775 |
| TD critic instead of outcome RPE (`rpeMode 0`) | 0.569 | 0.523 | 0.691 | 0.271 | 0.288 | 0.317 |
| no action loop (`actFb 0`, `outInh 0`) | 0.505 | 0.442 | 0.576 | 0.747 | 0.571 | 0.858 |
| reference | Thompson 0.692 | 0.660 | 0.847 | memoryK 0.625* | | |

\* memoryK cannot learn a mapping: it is right only in the lifetimes where the random mapping happens to be the identity (5 of 8).

Every component helps in both tasks. The critic matters most when outcomes are unsigned: bandit losses are 0, and in the cue task a wrong answer is 0. TD fails when the state fades before the outcome (the memory is reset at GO).

## R21d: bug arena with random colours (checkpoint)
Script: `results_v20/bug.js`.
- Brains: the three v8 champions `bug-v3h-s1..s3`, evolved on the flash task with fixed colours, with global dopamine.
- Each brain lives in 32 arenas with `randomValence`; in the odd arenas red is food. 1500 ticks each.
- Score = food − poison.

| variant | normal colours | swapped colours | all |
|---|---|---|---|
| plasticity off | 1.92 | −1.06 | 0.43 |
| **global dopamine (as evolved)** | 3.40 | −0.63 | 1.39 |
| global dopamine + motor noise (`actNoise 3`) | 2.92 | 0.29 | 1.60 |
| TD critic (`rpe 1`) | 2.75 | −1.08 | 0.83 |
| TD critic + value-dependent noise (`actNoise 3`, `actNoiseV 5`) | 2.75 | 0.17 | 1.46 |
| same with fixed noise | 2.58 | −0.54 | 1.02 |
| outcome RPE (`rpeMode 1`) + value-dependent noise | 3.21 | −0.13 | 1.54 |
| TD + value-dependent noise, plasticity off | 3.23 | −0.83 | 1.20 |
| unevolved plan v3h: global / plasticity off (16 arenas) | | | 0.06 / −0.06 |

**Verdict:** no clear gain in the bug. The differences (1.2–1.6) are within arena noise. The two parts behave differently:
- **Motor noise** helps a little, even without learning (0.43 → 1.20 frozen), because it frees stuck bugs.
- **The critic adds nothing here.** Food (+1) and poison (−1) already give a signed dopamine signal, as in the ±1 cue task (R21b).

None of these brains learns to reverse its colour preference in swapped arenas; all stay near 0. For comparison, R4 reached global 2.61 vs frozen 0.84, but only after 80 generations of evolution on random colours. That evolution was not repeated: long runs are excluded this round.

The bug default stays v3h with global dopamine. The new genes stay off there.

## R21 summary (round 21, v20)
- **Reward-only learning within a lifetime now works for discrete choices.** The plans are `rewardK` (bandit default) and `rewardMemK` (default for cue/recall with `mapping: 'random'`). Each has:
  - state columns → plastic parallel fibres → competing action columns;
  - an outcome RPE critic (dopamine = r − V);
  - value-dependent exploration noise, one source per column;
  - an efference-copy action loop.
- **Bandit:** best arm 0.653 (chance 0.333, frozen 0.287, Thompson reference 0.692); last quarter 0.692.
- **Cue, random mapping, reward only:** last quarter 0.883 (frozen 0.404).
- **Ablations (R21c):** removing the critic, the noise, the value scaling or the loop each hurts. A TD critic fails when the state is reset before the outcome.
- **Bug, random colours (R21d):** no clear gain over global dopamine. The default stays v3h.
- **Compatibility:**
  - New genes are off by default; old plans and champions are bit-identical to legacy/v19 (`results_v20/eqv19.js`, 38 cases; test_core v7/v8 champion checks).
  - No existing default changed, so `DEFAULTS_VERSION` stays 18; `APP_VERSION` is v20.
- **UI:**
  - New env "Choice: contextual bandit" and cue option "Rewarded answer: random mapping".
  - The Activity tab shows dopamine as the RPE, a dashed value trace and a critic info line.
  - Screenshot: `screenshot_ui_bandit.png`.

## R22a: third-order context via a second region, the shift register M → M2 → M3 (checkpoint)
Backup: `legacy/v20/`.

New pieces:
- `js/core/regions.js`: multi-region genomes (`kind: 'regions'`). Each region grows on its own tissue with its own gene program; tracts are laid between them afterwards (rule `topo` or `claw`).
- seq option `clock3`: a GO3 tick before GO2.
- Plan knob `front`: only the memory front end of predictK2 grows.
- Plan `predictK3` has two regions:
  - **cortex** = predictK2XO;
  - **context** = the front end (M X R M2 X2) of the same gene program on a second tissue. It receives the cortex's M2 through the tract `prev` (column to column) and copies it into its own M2 on GO2, which makes it M3. GO3 resets it.
  - **M3 → mixing tract**: each cortex mixing cell keeps one context column (claw, weight w3).
- Context region needs `clawOwn` (as in XO). Without it, M3 is right in only 0.66 of read windows; with it, 1.00 (`/tmp` diagnosis on order3:8). M, M2 and M3 are each right 100% of the time.

order3:8, 600 symbols, 4 growths (seeds 40–43; `results_v21/run.js`). The order-2 limit is 0.787 and the ideal order-3 counter is 1.

| plan | accuracy | last quarter | calibrated bits |
|---|---|---|---|
| predictK2XO (current default) | 0.735 | 0.747 | 0.65 |
| predictK3, M3 tract cut (w3 0) | 0.735 | 0.747 | 0.61 |
| predictK3 (w3 20, mixRate 0.002) | 0.791 | 0.817 | 0.52 |
| + mixing-cell target rate 0.006 | 0.887 | 0.932 | 0.34 |
| + mixRate 0.008, w3 30 | 0.942 | 0.970 | 0.25 |
| + mixRate 0.012 | **0.955** | **0.992** | **0.21** |

With the M3 tract cut, predictK3 scores exactly like XO, so the gain comes from the two-back context. Denser mixing cells (higher homeostatic target rate) give more triple conjunctions.

### R22b — predictK3 tune, text/fables, ablations (Sun Oct 11 2026, CT)
Default tune chosen: `w3 30`, cortex mixing target rate `0.008` (was w3 20 / 0.002 in R22a).
Last-quarter accuracy, mean of growths (paired seeds within a block).

| task | XO (predictK2XO) | predictK3 (default tune) | K3, M3 tract cut | K3, cortex M2 silenced | reference |
|---|---|---|---|---|---|
| order3:8, 600 sym, 4 growths | 0.747 | **0.970** | 0.747 | 0.748 | 2nd-order limit 0.787 |
| text, 1000 sym, growths 40-43 | 0.763 | 0.773 | – | – | ideal 2nd/3rd order 0.790/0.845 |
| text, 1000 sym, growths 48-55 (new seeds) | 0.763 (bits 1.608) | **0.772** (bits 1.572) | 0.730 | – | |
| fables, 2000 sym, 4 growths | 0.317 | 0.321 | – | – | 1st-order counter 0.326 |

Text sweep (4 growths): mr 0.004 0.766, mr 0.006 0.768, mr 0.006+w3 30 0.773, mr 0.006+w3 10 0.742, mr 0.012 0.730.
Ablations: cutting the M3 tract (or silencing the cortex M2 that feeds the context region) drops order3 exactly to the XO level, so the
third-step context carries the whole gain. On text the M3-cut brain is *below* XO (0.730): the cortex has learned to rely on it.
Verdict: clear win on order3 (0.75 -> 0.97, above the 2nd-order limit), small but replicated win on text (+0.009/+0.010 on two seed blocks,
still below the ideal 2nd-order counter), fables unchanged (≈ 1st-order counter). Coverage of (current, two-back) pairs by mixing cells is
the limit on big alphabets. -> Default: text/fables/order3 recommend the three-phase clock -> predictK3. DEFAULTS_VERSION 19, APP_VERSION v21.

### R22c — multi-region brains (B): regions framework, two-region actor-critic, viewer (Sun Oct 11 2026, CT)
Framework (core/regions.js): a genome `{kind:'regions', regions:[{name,color,g,inputs,outputs}], tracts:[...]}`; every region grows on its
own tissue with its own gene program (its own morphogen territories, bands and juvenile phase); tracts are laid between regions:
`topo` (column to column, replacing a placeholder input), `claw` (one source column per mixing cell), `all` (parallel fibres to every
excitatory plastic receiver, connection probability p, plastic). One merged SpikingNet; `g.region` per neuron; regions mutate, cross over,
save and load (compact encoding `kind:'regions'`).
Region plans: predictK3 (cortex + context, R22a/b) and new rewardKR / rewardMemKR = rewardK / rewardMemK split into a **cortex** region
(state or memory columns; its action band dies via the new `kill:'P'` knob) and a **striatum** region (action columns, carries the outputs;
`kill:'M'`), linked by a plastic corticostriatal tract (`all`, p 0.3, total 45; striatal GO weight 8, best of a small 2-growth sweep).

8 growths, seeds 11-18 (R21c settings):

| task | single tissue (R21 default) | two regions | |
|---|---|---|---|
| bandit, 240 trials: best arm / last quarter / 2nd half of blocks | rewardK 0.653 / 0.692 / 0.790 (silent 2-6) | rewardKR 0.546 / 0.596 / 0.701 (silent 35) | below |
| cue, random mapping, reward only, delay 10: pass / last quarter | rewardMemK 0.855 / 0.979 | rewardMemKR 0.693 / 0.829 | below |

Honest verdict: the two-region actor-critic learns from reward alone (well above frozen/chance) but does **not** match the single tissue.
Diagnosis: the cortex region grown without its action band has fewer state cells (59 vs 72) with about 2/3 of the sensory drive, and the
striatum answers less often in the response window (many silent trials). Sweeps of tract density/weight and GO weight did not close the gap.
Bugs found on the way: inhibitory class-0 interneurons were taken as tract sources (now 'all' tracts use excitatory cells only).
Equivalence: results_v21/eqv20.js — 46 plan/env/seed cases identical to legacy/v20 (growth W/thresholds, spikes, weights, stats).
Defaults unchanged for bandit/cue (rewardK / rewardMemK). The multi-region default is predictK3 (text, fables, order3).

## R22 summary (round 22, v21, Sun Oct 11 2026, CT)
- (A) Context cascade **predictK3** (cortex predictK2XO + context region holding the symbol two back, three-phase clock): order3 0.747 → 0.970
  (tract cut 0.747), text 0.763 → 0.772 (replicated on two seed blocks), fables 0.317 → 0.321. Default for text / fables / order3
  (recommended `clock3`), DEFAULTS_VERSION 19, APP_VERSION v21.
- (B) **Multi-region brains** (core/regions.js): regions on their own tissues, `topo` / `claw` / `all` tracts, one merged network; region genomes
  grow, save/load (compact `kind:'regions'`), mutate, cross over and evolve. rewardKR / rewardMemKR (cortex → striatum) learn from reward but
  stay below the single tissue (bandit 0.55 vs 0.65, cue 0.69 vs 0.86): not default. A single genome for every task is not reached.
- Viewer: region selector (each region's own tissue and growth), wiring diagram with region rings, grouped by region (screenshot_viewer_regions.png).
- Old genomes bit-identical vs legacy/v20 (results_v21/eqv20.js, 46 cases). test_core, viewer_test (+ predictK3 / region check), browser_test pass.

## R23 — one learning rule for teacher and reward tasks (round 23, v22; Sun Oct 11 2026, CT)
New gene `uni` (off by default): dw = lr · M_post · e. Eligibility e comes from STDP. The modulator is per target cell,
M_post = uniI · I_post + D, where I_post = a climbing-fibre-like instructive plateau and D = the global dopamine RPE (critic).
U1 = {uni 1, lr 0.05, uniI 0.4, tauElig 100, aMinus 0.3, rpe 1, rpeMode 1, rpeLr 0.3}, applied on top of each plan's own PL.
- R23a: bandit (rewardK, 8 growths, seeds 11-18): best arm, separate rule 0.653 vs U1 0.649 (last quarter 0.692 / 0.681).
- R23a: cue (rewardMemK, random mapping, reward only): pass, separate 0.855 vs U1 0.774 (last quarter 0.979 / 0.904). Under investigation.
- R23b: cue gap explained. The unified rule normalised the presynaptic weights at birth, as the teacher rule does; in rewardMemK
  no instructive input reaches a plastic receiver, so this was the only difference. Fix: normalise at birth only when an instructive
  pathway exists. Cue under U1: pass 0.855, last quarter 0.979, identical to the separate rule.
- R23c: final form of the rule. A receiver contacted by an instructive (climbing-fibre-like) sensor learns from its instructive
  signal; every other plastic receiver learns from the global dopamine RPE through its eligibility traces. In the first version
  every synapse kept traces and dopamine acted on teacher-instructed cells too: seq collapsed (order3, 80 symbols: accuracy
  0.00 at rpeGain 1, 0.55 at 0.1, 0.70 at 0.01) and ran 20-25x slower. Traces are now kept only where dopamine is the teacher,
  with lazy decay. Same U set (on top of each plan's circuit genes):

| task (growths) | metric | current best (separate rules) | unified rule U |
|---|---|---|---|
| order3 K8, 600 sym (4, seeds 40-43) | last quarter | 0.970 | 0.965 |
| text, 1000 sym (4, seeds 40-43) | last quarter | 0.773 | 0.773 |
| bandit (8, seeds 11-18) | best arm | 0.653 | 0.653 |
| cue, random mapping, reward only (8) | pass | 0.855 | 0.855 |
- R23d: one parameter set for all four plans needs a single synaptic-scaling setpoint. With preNorm 45 (the reward plans' value)
  everywhere: order3 0.968, text 0.769 (both within noise of 0.970 / 0.773). preNorm 20 everywhere breaks the bandit (0.481).
  -> UNIFIED_PL = {uni 1, lr 0.05, uniI 0.4, tauElig 100, aMinus 0.3, rpe 1, rpeMode 1, rpeLr 0.3, preNorm 45, teachThr 20, plateau 4}
  is now the default rule set of predictK3, rewardK, rewardMemK (and the region plans). DEFAULTS_VERSION 20, APP_VERSION v22.

| task | current best (separate rules) | unified (default now) |
|---|---|---|
| order3 K8 (predictK3), last quarter | 0.970 | 0.968 |
| text (predictK3), last quarter | 0.773 | 0.769 |
| bandit (rewardK), best arm | 0.653 | 0.653 |
| cue random mapping, reward only (rewardMemK), pass | 0.855 | 0.855 |
Bandit and cue are bit-identical to the separate rule: no receiver there has an instructive input, so the rule reduces exactly to
the reward rule. In seq every plastic receiver has an instructive input, so the rule is the teacher rule plus a critic, and the critic does no learning there.

## R23 summary (round 23, v22, Sun Oct 11 2026, CT)
- One learning rule (`uni`, `UNIFIED_PL`): dw = lr · M · e. A cell that receives an instructive input learns from a climbing-fibre-like plateau,
  which acts on its fresh eligibility. Every other plastic cell learns from the global dopamine RPE (critic), which acts on a slow eligibility
  trace (lazy decay). One parameter set (preNorm 45) is now the default in predictK3 / rewardK / rewardMemK.
  Results, separate rules vs unified: order3 0.970 / 0.968, text 0.773 / 0.769, bandit 0.653 / 0.653, cue 0.855 / 0.855 (all within noise).
- Rejected variant: dopamine on instructed cells too. Seq collapsed (0.00-0.70) and ran 20-25x slower.
- Old genomes bit-identical vs legacy/v21 (results_v22/eqv21.js: 50 plan/env/seed cases, genomes made by the legacy plans).
- test_core (+ unified-rule check), browser_test and viewer_test (+ the default plans use the unified rule) pass. DEFAULTS_VERSION 20, APP_VERSION v22.

## R24 — two-region actor-critic vs single tissue (round 24, v23; Sun Oct 11 2026, CT)
- R24a quick screen (bandit, 2 growths, seeds 11-12, 80 trials, no switches): rewardK best arm 0.606 (silent 2); rewardKR (cortex
  grown with its action band killed) 0.519 (silent 14.5); rewardKR with the cortex growing its **whole** gene program (no band killed)
  **0.831 (silent 4.5)**. The silence came from the cortex: the killed band changes how the state columns develop. Cortex = no kill is now
  the default of rewardKR / rewardMemKR (`killState` restores R22).
- R24b full runs (8 growths, seeds 11-18; R21c settings), cortex not killed: bandit rewardKR best arm **0.620** (R22: 0.546; rewardK 0.653),
  last quarter 0.575, 2nd half of blocks **0.831** (rewardK 0.790), silent 23.5 of 240 (R22: 35.4; rewardK 14.4). Cue rewardMemKR pass 0.698
  (R22: 0.693; rewardMemK 0.855), silent 13.6. The cortex fix explains the bandit gap only partly; the cue task is not helped.
  Why it helps: without the kill gene the cortex's action band still forms, finds no outputs and dies late (trophic), so the
  state columns develop as in the single tissue (88 class-0 cells, symbol drive 9.9 vs 7.1 per state cell).
- R24c screen (3 growths, seeds 11-13; bandit 120 trials with no switches: best arm; cue random mapping, reward only, delay 10, 80 trials: pass):
  single tissue bandit 0.750 (silent 2.7), cue 0.708 (silent 7.7); rewardKR/rewardMemKR (cortex not killed) bandit 0.844 (7.3), cue 0.733 (12.3);
  + striatum not killed either: bandit 0.717, cue 0.613 (worse: the striatum's leftover state band adds plastic noise).
- UI (round-24 steering request): the Development tab is reduced to a one-line caption, a growth animation that plays once, a Play/Replay
  button with a timeline slider, one "Open full growth viewer" button, and a Details toggle. (The plan buttons first moved to Settings > Development, then left the UI: R24e);
  the chemical selector, Step button and speed menu were removed (all are in viewer.html). The extra info in the Brain and Activity tabs is now
  behind a Details toggle. Screenshots: screenshot_ui_tab{Dev,Brain,Act}_{before,after}.png.
- R24e UI (standing principle: the brain works with little or no intervention). The Settings drawer went from ~45 controls to 12 on the cue task (inputs, selects and buttons, counted by viewer_test).
  - Removed from the UI (parameters and code paths kept): 22 plan buttons and the "Reset starts from" plan selector; the six growth checkboxes
    (trophic, refinement, homeostasis, mirroring, hunger, request); growths, episodes, λ, worst-growth weight, validation regrowths;
    leak and substeps; Seed from champion / watched; per-task knobs (delay jitter, cue/response/ITI ticks, curriculum x4, hold penalty,
    two/three-phase clock, symbol and prediction ticks, dopamine-dip costs, reward probabilities, cue hold, stuck/energy costs, sensor toggles).
  - Remaining: Reset to recommended; Environment (cue: delay, trials, rewarded answer; recall: + alphabet; seq: source, alphabet, Markov p,
    symbols; bandit: contexts, arms, switch interval, trials, delay; bug: task, ticks, reversal, random colours; text: characters);
    population, mutation rate, lifetime learning, Reset; Files; Detailed stats. No "Advanced" section was needed. All have tooltips.
  - Screenshots: screenshot_ui_settings_{before,after}.png. No default changed (old genomes bit-identical: eqv22 ALL IDENTICAL, 50 cases).
- R24f Brain-tab bug (user report: synapse lines run off the bottom of the canvas and others come back). Reproduced headless for the default
  plans bug v3h, cue memoryK, bandit rewardK, text predictK3. Only the two-region text brain was affected. Cause: layoutBrain mapped tissue
  coordinates with a fixed [-1, 1] range, but a multi-region brain places later regions beside the first (predictK3 context region at
  x 1..3.28), so the context region's cells were drawn at y up to ~576 on a 300-px canvas. Edges between the cortex and the context region therefore left the
  bottom and came back up. Fix: map the actual bounding box (at least [-1, 1]^2, so single-tissue pictures are unchanged). After the fix all
  nodes and edge endpoints are inside the canvas for all four plans (803 / 1653 / 7639 / 182777 synapses, 0 out, 0 bad indices). The Dev
  mini-view draws only the output region's own tissue (local [-1, 1] coordinates), so it was not affected. New browser_test check G.
  Screenshots: screenshot_brain_{bug,cue,bandit,seq_text}_{before,after}.png.
- R24d (8 growths, seeds 11-18, R21c settings; script results_v23/kr.js):
  - Striatal GO weight 4 makes it worse: bandit 0.524, silent 41.5; cue pass 0.589.
  - Removing the striatum's own plastic synapses (the leftover state-band cells): identical results, so they do not matter.
  - Short screens (3 growths): striatal GO 12, tract density 0.6, tract weight 70 were all no better on the cue task.
  - Cue per growth: the two-region plan fails in 3 of 8 growths (seed 11: pass 0.33, silent 44; seed 12: 0.53; seed 17: 0.48).
    The single tissue is weak only in seed 11 (0.54). So the gap comes from a few poorly wired growths, not from a uniformly slower learner.

### R24 summary
| task (8 growths) | single tissue | two regions, R22 | two regions, R24 (cortex not killed) |
|---|---|---|---|
| bandit: best arm / last quarter / 2nd half of blocks | 0.653 / 0.692 / 0.790 | 0.546 / 0.596 / 0.701 | **0.620** / 0.575 / **0.831** |
| bandit: silent trials (of 240) | 14.4 | 35.4 | 23.5 |
| cue (random mapping, reward only): pass / last quarter | 0.855 / 0.979 | 0.693 / 0.829 | 0.698 / 0.750 |
| cue: silent trials (of 120) | 6.75 | 10.0 | 13.6 |
- **Bandit:** the two-region plan is close to the single tissue (0.620 vs 0.653, roughly within noise) and better in the second half of blocks.
- **Cue:** it is still clearly below. Two-region is therefore not the default.
- **Not tried this round:** a D1/D2 direct and indirect pathway, and a separate dopamine-nucleus region (the critic is still computed in the output region).
- Old genomes are bit-identical vs legacy/v22 (results_v23/eqv22.js). APP_VERSION v23; DEFAULTS_VERSION stays 20.

## R25 (v24, round 25): Fast mode (UI / performance only)
- Backup: legacy/v23/. No engine, plan or default change (DEFAULTS_VERSION 20; APP_VERSION v24).
- **⚡ Fast mode** (top-bar toggle, remembered in localStorage):
  - Hides and skips the drawing panels (environment canvas, fitness chart, Brain / Development / Activity tabs) and display-only
    recording (spike raster buffer, flash, dopamine / weight / value traces). The brain layout is redone lazily when you switch back.
  - A text panel replaces them, updated at 4 Hz. Sequence: last 50 steps (input / predicted / actual, green/red), accuracy so far,
    last-100, symbol n / N, lifetimes completed + accuracy sparkline and list, ticks/s. Other envs: keyStats line, status line,
    per-lifetime best-arm / pass / score list, generation / champion.
  - Loop: the watched brain ticks until 55 ms of the frame are used (not "speed" ticks per frame); while evolving, evolution gets
    50 ms first. Frames are chained through a MessageChannel instead of requestAnimationFrame (no wait for the next display refresh).
- Speed (headless Chrome, this box). Normal = speed 10 (the maximum), Fast-forward on.
  | | normal | fast | speedup |
  |---|---|---|---|
  | watched brain, bandit rewardK (345 neurons) | 599 ticks/s | 9498 ticks/s | 15.9x |
  | watched brain, text predictK3 (2448 neurons, 183k synapses) | 201 ticks/s | 4105 ticks/s | 20.4x |
  | evolution, bandit (2 runs x 15 s) | 8299 / 8102 | 8660 / 8534 | ~1.05x |
  | evolution, text predictK3 (2 runs x 15 s; noisy: brain growth is not counted as ticks) | 1794 / 1732 | 1943 / 3747 | 1.1-2.2x |
  - Normal mode was capped by speed x 60 fps on bandit, and by drawing the 183k-synapse network on text.
  - Evolution already got ~40 of every ~45 ms with Fast-forward, so it gains little.
  - First try (still on requestAnimationFrame) made bandit evolution slower (7.4-7.7k): a 55 ms frame waited for the next vsync. Fixed by the
    message loop.
- Bit-identical: the substep hook only reads spikes. browser_test H checks this for seq (predictK) and bandit (rewardK): each fast-mode
  lifetime's accuracy / best-arm rate equals a Node run of the same genome and seed. In the test run: seq 0.9700, 0.9650; bandit 0.4708, 0.6875 (equal).
- browser_test H also checks: 0 canvas calls in 1.5 s of fast mode (canvas methods counted); panels hidden; the results panel updates;
  switching mode mid-run keeps the watched brain; the setting survives a reload; the toggle has a tooltip.
- Screenshots: screenshot_fast_seq_text.png, screenshot_fast_bandit.png.
- Note: one browser_test run executed in parallel with viewer_test failed section A/E once ("Cannot read properties of undefined (reading
  'length')", after which the frame loop stopped). It did not recur in 2 later full runs by themselves (the final one after the message-loop change) or in a run of section A alone. The test now
  logs page-error stacks so a recurrence can be pinned down.

## R26 (v25, round 26): headless runner for long local experiments + dashboard (build and smoke tests only)

**Build.**
- Backup of v24 in `legacy/v24/`.
- `run/` contains engine.js, lib.js, free.js, worker.js, pool.js, runner.js, report.js, bench.js and selftest.js. It runs on node and bun, needs no npm deps, uses worker_threads (default cores−1), and stops after N gens, N hours or never.
- Fitness:
  - robust fitness, identical to the app;
  - multi-task weighted fitness, normalised against `ref:"auto"`, where the env's default plan on the validation seeds = 1;
  - optional novelty search (kNN against population + archive, blended) and MAP-Elites (2 dims).
- `free:<base>` genomes treat structural plan constants as bounded genes.
- Stopping and resume:
  - Ctrl+C once = stop after the current generation; twice = exit;
  - a STOP file also stops the run;
  - checkpoints are written atomically (with a Windows rename retry);
  - `--resume DIR`.
- Results go to `results/<date>_<name>/`: config, version (APP_VERSION + file hashes), seeds in the checkpoint, generations.csv, champions/gen_*.json + champion_final.json, checkpoint, summary, log, plus `results/index.csv`.
- Configs in `experiments/`: text_baseline, multitask, novelty_free, mapelites_free.
- Also new: `dashboard.html` (offline), `run.bat` / `run.ps1`, and the README section.

**Checks.**
- selftest (node + bun): runner fitness === app Evolution fitness, RNG resume, free genomes grow, serialisation round trip.
- Smoke runs: all 4 configs (bun, results_v25/smoke), plus text_baseline under node, whose CSV is identical to bun's.
- Resume is identical in all modes.
- Results do not depend on the worker count.
- dashboard_test ALL OK.

**Bench (box: 8-thread Xeon, node 20.19.2 vs bun 1.2.15, 7 workers).**
- text predictK3: 24.8 vs 37.3 gens/h.
- bandit rewardK: 169 vs 385 gens/h.
- Recommendation: bun (×1.89 on average). These are box numbers; Travis should run `run.bat bench`.

**Bun 1.2 quirk.** `await worker.terminate()` never settles in Bun 1.2, so pool.close() no longer awaits it.

**Bug fixed (js/core/regions.js).**
- A mutated multi-region genome whose source region grew no cells of a 'claw' tract's class threw `Cannot read properties of undefined (reading 'length')`. This was the intermittent A/E page error in R25.
- The tract is now skipped. Genomes that grew before are unaffected (v6/v7/v8 compatibility checks pass, node smoke CSV = earlier bun CSV).

**UI steering.**
- The sequence history table (canvas) and the fast-mode panel no longer have an 'actual' row. They show two rows, input and prediction.
- The prediction made at step t sits under input t+1: green if equal, red otherwise. The first column is blank.
- browser_test checks:
  - E: drawnTable, 681 frames ok;
  - H: fast-panel spans aligned, first blank, colours = equality.
- Text env has no table, so no change there.

**Tests.** test_core, browser_test, viewer_test and dashboard_test are ALL OK, and selftest passes on node + bun.


## R27 (v26, DEFAULTS_VERSION 21): balanced multitask fitness; evolved reward plan rewardE becomes the default

**Overnight run (R26 multitask, bun, 7 workers, 8.2 h, 352 generations, 12,584 evaluations).** Champion (gen 318) combined 1.154, but lopsided:
text 1.42 (ref 7.09, ×0.20), order3 3.90 (8.67, ×0.45), bandit 6.98 (4.29, ×1.63), cueR 11.07 (4.73, ×2.34). The plain average let it trade
the prediction tasks for the reward tasks. Copied to `results_overnight_r26/`.

**Balanced fitness (run/lib.js normFit, `combine`).** `mean` (old), `min`, and `softmin` (new default in multitask.json: each normalised task
capped at 1.5, soft minimum with τ 0.25). The overnight champion scores 1.18 under mean but 0.49 under softmin; an all-1.0 genome scores 1.00.
Selftest added.

**What made the reward gains (run/ablate.js, held-out growths; transplant champion genes into the hand plans).**
- The champion descends from rewardMemK. 39 growth scalars, 5 plasticity values, 175/190 GRN weights, 463/506 receptor weights, all 7
  morphogen decay rates and the modulator channel changed.
- Single genes, 8 growths: pl.lr, pl.tauPre, pl.aMinus (0.3→0.035) each +0.5…0.8 on bandit; sc.request (0→0.15, the trophic "request"
  signal) +1.9 on cueR. **At 16 growths all of these shrink to noise** (bandit +0.16…0.22, cueR −1.0…+0.3, sd ≈ 3). lr/tauPre hurt
  order3 (−0.3…−0.8). None adopted.
- GRN alone hurts (bandit −1.25, cueR −3.7); GRN + growth scalars + channel together give most of the gain (bandit +1.45, cueR +3.3).
  The gain is a co-adapted developmental program, not one gene.
- Prediction tasks: the champion itself is bad at text/order3 (1.53 / 4.15). No transplanted gene helped predictK3 (aMinus, request,
  tauElig, channel: no effect; lr, tauPre: worse). predictK3 unchanged.

**Whole champion vs hand plans (16 held-out growths, mean episode score).**
| task | hand plan | rewardE |
|---|---|---|
| bandit (240 trials) | 5.28 (rewardK) | **6.80** |
| bandit, 400 trials (not evolved on) | 5.43 | **6.76** |
| cue, random mapping | 4.79 (rewardMemK) | **9.68** |
| recall, random mapping (not evolved on) | −3.25 | **1.37** |
Cue random, last-quarter correct (10 growths): default 20 trials 0.92 vs 0.82; 80 trials 1.00 vs 0.88; 160 trials 0.99 vs 0.99;
**but wrongCost 0 (no punishment): 0.54 vs 0.56 (20 trials), 0.68 vs 0.79 (80)**: it relies on the punishment signal.

**Adopted.** New plan `rewardE` (js/envs/reward_evolved.js): the champion genome kept whole, same body plan and learning rule as
rewardMemK. Default for bandit and for cue/recall with the random mapping. rewardK / rewardMemK stay as hand plans (and seeds).
v25 in `legacy/v25/`. multitask.json now starts from predictK3 / rewardE / rewardMemK with balanced fitness and 3 h.

**Tests.** test_core ALL OK (new: rewardE default, bandit last quarter 1.00 vs rewardK 0.72, cue random 1.00), browser_test ALL OK
(F: bandit and cue-random default plan rewardE), seq_test OK, run selftest ALL OK (new balanced-fitness check).

## R28 [text] Feature–Time toy port (fixed anatomy)

Frozen Play Code Toy export, run as delay-line coincidence in `experiments/toy-port/`. Learning off. Default plans and `run/` are unchanged. `SpikingNet` stays next-substep delivery with no per-tap delay; this export's delay-0 taps are a same-character chain (depth 10), so the port keeps its own ring and BugBrain's 15 mV tap quantum (rest −70, threshold −55).

`node experiments/toy-port/verify.js` on `sample-dialogue.txt` (3423 characters; the full corpus is not in the repo):

| check | result |
|---|---|
| next-letter agreement vs `snn-sim.cjs` | **100%** (3423/3423) |
| hard-spike set each step | **100%** |
| next-letter accuracy (port and reference) | 85.83% |
| summed readout weights vs the Toy readout | 96.35% |
| 2 and 3 substeps per character | same predictions, 0 idle spikes |

The 85.83% is on a snippet in the toy's `u:` / `a:` format that repeats cell-label lines, not a held-out corpus score. `test_core.js` ALL OK (no change under `js/` or `run/`).

## R28b [text] Fine-time window and three-factor plasticity on the same graph

`node experiments/toy-port/continuous.js`. Anatomy stays the export (7313 cells, 21547 synapses). Character = 25 ms, 8 bins, dt = 3.125 ms. A tap adds 15 mV while its axonal arrival is inside `window` bins. `window = 1` is the discrete boolean.

| setting | agreement vs discrete predictions | hard-spike sets | next-letter accuracy |
|---|---|---|---|
| 1 bin, window 1 | **100%** | **100%** | 85.83% |
| 8 bins, window 1 | **100%** | **100%** | 85.83% |
| window 4 bins (12.5 ms) | **100%** | **100%** | 85.83% |
| window 12 bins (37.5 ms) | 94.04% | 27.55% | 83.11% |

Phase-locked delays: a window shorter than one character does not change this net. A window past one character still counts the previous character's tap.

Plasticity: STDP eligibility × per-cell teacher (fired cell's vote vs the next character). `lr` 0.03, `tauPre`/`tauPost` 10, `tauElig` 50, `aMinus` 0.3. Weights were first clamped to `[0, 2/nTaps]`, which let one tap meet the whole hard threshold; replay accuracy fell to 43.42%.

Stabilized rule: project each cell's taps onto `sum(w) = 1` inside a band `[0.5, sMax] * w0`, with `sMax = 1 + 0.9 * (need/(need-1) - 1)` and `need = ceil(0.75 * n)`. A missing partner then drops the hard-path charge below `n * 15` mV, and the heaviest `need-1` taps stay under the soft threshold. No new synapses.

| plasticity on the 37.5 ms window | replay next-letter | vs frozen wide window | vs discrete |
|---|---|---|---|
| taps only | **83.11%** (same as pre-plastic) | 99.59% | 94.04% |
| taps + vote smoothing (`voteLr` 0.01) | **86.03%** | 94.92% | 90.86% |

1133 taps move in the taps-only pass (mean |Δw| 0.0021, max 0.246). `partnersHold` is true. The script selects vote smoothing because it stays within 2 points of the pre-plastic accuracy and beats taps-only. `verify.js` is still the discrete path and is unchanged by vote updates (they are restored on the shared net after each continuous run).

## R28c [text] Triangulate a grown letter layer against the export

`node experiments/toy-port/triangulate.js`. Target: 32 highest-count letter-only cells (all delay-0 + delay-1 bigrams). Birth from co-active letters on the first 70% of `sample-dialogue.txt`, trophic keep 32, one letter-substitution round (0 accepted). Held-out tail: 1027 characters. Not `growCell` (tissue synapses are not letter-delay taps).

| set | recall of the 32 motifs | held-out next-letter | agree with full net |
|---|---|---|---|
| full frozen net | — | **77.78%** | — |
| export motifs, frozen votes | 100% | 27.78% | 36.71% |
| frequent bigrams | **71.88%** (23/32) | 34.11% | 37.68% |
| predictive trophic | 40.63% (13/32) | 31.09% | 35.93% |

The export letter layer resembles frequency more than sharpness. The 32 motifs do not carry the full net's accuracy. All 314 letter cells score 62.96% on the same tail (agree with the full net 77.80%), so most of the 28%→78% gap was the rest of the letter layer.

## R28d [text] Depth-1 taps: delay 0 plus delay 2

Same script. Eligible target: 341 depth-1 cells with exactly those two delays, onto letter cells or raw letters (top 32: 22 cell+letter, 10 cell+cell). At most one letter cell fires at a time on this sample, so each cell is a trigram. Birth from co-occurrence on the growth prefix (357), keep 32. Held-out tail unchanged.

| set | recall of top 32 depth-1 | held-out next-letter | agree with full net |
|---|---|---|---|
| 314 letter cells | — | 62.96% | 77.80% |
| letters + export top 32, frozen votes | 100% | 62.38% | 77.60% |
| letters + all 341 eligible | — | **66.96%** | **83.06%** |
| letters + 32 most co-occurring | 34.38% (11/32) | 65.01% | 77.22% |
| letters + 32 predictive | 25.00% (8/32) | 63.94% | 77.31% |

The whole delay-2 layer adds about 4 points. All depth ≤ 1 cells, not only that shape, reach 68.23%.

## R28e [text] Depth-2 cell-to-cell taps

Same script, same split. Depth 2 is a shallower cell now plus another tap a few steps back. Birth when those taps co-occur (1497), keep 32. Held-out full net 77.78%.

| set | recall of top 32 depth-2 | held-out next-letter | agree with full net |
|---|---|---|---|
| depth ≤ 1 (769) | — | 68.23% | 84.91% |
| + export top 32 depth-2 | 100% | 69.98% | 87.44% |
| + 669 shallower-tap depth-2 cells | — | 71.93% | 91.43% |
| all depth ≤ 2 (1512) | — | **74.07%** | **93.67%** |
| + 32 most co-occurring | 9.38% (3/32) | 69.49% | 86.56% |
| + 32 predictive | 9.38% (3/32) | 69.20% | 85.88% |

Depth ≤ 2 is worth about 6 points over depth ≤ 1. A 32-cell budget matches the export's own top 32 (about +1 point) and recovers 3 of those motifs. About 4 points remain to the full net. `js/` and `run/` unchanged.
