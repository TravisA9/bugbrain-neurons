# R31 (box, 2026-10-12): graded areas + mixed task seqchoice
seqchoice: order2, 6 symbols = 6 arms, 300 symbols; fitness 10*(0.5 acc + 0.5 last-quarter acc); chance ~1.67, optimal 10.
16 held-out growths each (run/mixed_eval.js), mean:
| plan | mapping random (real mixed task) | mapping same |
|---|---|---|
| predictK3 | 1.55 | 9.82 |
| unifiedR (only cortex+context develop) | 1.55 | 9.82 |
| rewardE | 3.80 | 3.72 |
| unifiedG (graded; striatum 0.81 + cortex/context 0.30, corticostriatal tracts) | 3.09 | 3.35 |
Box evolution regions_mixed (5 tasks incl. seqchoice, start unifiedG, 34 gens / 2 h, 7 workers): champion 0.981 (gen 1):
text 6.74 (0.96), order3 7.21 (0.87), bandit 6.51 (0.99), cueR 9.85 (0.94), seqchoice 3.66 (1.33 vs rewardE).
Verdict: graded areas work mechanically and are bit-identical on single-signal tasks; no plan solves the random-mapping
mixed task (best 3.8/10): the striatum gets context only through a linear tract, no conjunction. Defaults unchanged.

# R32 (box): conjunctive corticostriatal input, plan unifiedC
Cortex mixing cells (sparse claw-like conjunctions of current x previous x two-back symbol, homeostatic thresholds) -> striatal
receivers, plastic, dopamine-learned (new tract source from.mix); both areas ~0.73 expressed on clock + outcome; striatum owns outputs.
seqchoice random mapping, 16 held-out growths (mean):
| variant | 300 symbols | 1000 symbols, read 4 | 1000 symbols, read window 8/6 |
|---|---|---|---|
| rewardE | 3.80 | 3.83 | 4.10 |
| unifiedR | 1.55 | 1.41 | 1.41 |
| unifiedG | 3.09 | | |
| unifiedC wTot 45 p 0.3 | 3.57 | 3.85 | 4.39 |
Sweep (300 symbols): wTot 20 3.47, 90 3.21; p 1 2.28, p 0.1 2.88; + linear M2/M3 tracts 2.82; 30/0.5 3.22; 60/0.2 3.36.
Diagnosis: the striatal reward learner itself is the limit, not the conjunctions: on a deterministic CYCLE (pure 6x6 contextual
bandit, no context needed) rewardE gets only 4.4 (300 symbols) / 5.3 (1000); ~1/4 of growths stay at chance (1.6-1.9).
text/order3/bandit/cue: unifiedC grows exactly unifiedR (checked: identical scores). Defaults unchanged.

# R33 (box): reward learner on many cue-arm pairings (rewardE, 16 held-out growths, mean / growths at chance)
seqchoice CYCLE (pure 6x6 contextual bandit), 300 symbols: base 4.54 (2 dead)
| change | cycle | bandit (base 6.69) | cue random (base 10.17) |
|---|---|---|---|
| tauElig 100 / 250 (longer trace) | 3.15 / 2.65 (7 dead) | | |
| outInh 25 (stronger WTA) | 4.46 | | |
| actNoiseV 20 (value-decayed exploration) | 4.36 | | |
| rcvHomeo 0.1 / 0.3 (receiver homeostasis) | 4.76 / 5.45 (0 dead) | | |
| tauElig 12 / 6 (SHORTER trace) | 5.57 / 7.12 | | |
| tauElig 6 + rcvHomeo 0.3 | 8.20 | 4.05 | 1.17 (8 dead) |
| tauElig 8 + rcvHomeo 0.3 + rpeLr 0.6 + homeoRate 1 | **8.74** | 3.53 | 1.74 (8 dead) |
| NEW eligUse 1 (outcome consumes tags) | 5.54 | 6.05 | 9.65 |
| eligUse 1 + rcvHomeo 0.3 + rpeLr 0.6 + homeoRate 1 | 8.21 | 4.58 | 7.69 |
| eligUse 0.7 | 5.19 | 6.47 | 10.04 |
seqchoice random mapping (order2): rewardE base 3.80, +tauElig 6/rcvHomeo 0.3 4.72, +best-cycle fix 4.38;
unifiedC (fix on striatum only) 300 sym 3.57 -> 3.06..3.46; 1000 sym window 8: 4.39 -> 3.31..3.78.
Verdict: the 6x6 learner is fixed by a trace matched to the trial (short or consumed at the outcome) + stronger receiver
homeostasis (no dead growths), but the same settings break bandit/cue (longer cue->choice delays need the long trace), and
the random-mapping order2 task stays < 5. No default change; eligUse kept as an option (default 0, bit-identical off).
