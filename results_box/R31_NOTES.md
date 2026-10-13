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
