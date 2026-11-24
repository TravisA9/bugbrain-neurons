# R145 pre-registration: B2 slow consolidation weight on the granule readout (vs R144)

Written Tue Nov 24 2026 ~10:20 CT, BEFORE any R145 test was run. Approved by Travis (chat, "ok" / "yup", Nov 24).
Branch cursor/relgrowth, engine v47 / DEFAULTS_VERSION 40 (unchanged). Control = R144 champion (`run/champion.txt`, 4x).

## Mechanism (new opt-in flags, all 0 = off = bit-identical; js/core/net.js granSlowStep, base.js)
Each granule -> output readout synapse r carries a second, slow weight C_r beside the learned (granKal NLMS) weight U_r.
Once per teaching event, for every synapse visited (its granule active in the read window):
- `P.wSlow = a`:      C += a (U - C)          (the slow weight tracks the learned weight)
- `P.wSlowPull = b`:  U += b (C - U)          (the learned weight is pulled back to its consolidated value; Benna-Fusi two-variable coupling)
- `P.wSlowRead = l`:  outputs read (1 - l) U + l C (l = 1: the slow weight alone = a running average of U)
The NLMS error is always computed from U. C starts at U and restarts with U when a granule is re-assigned. No new RNG.
Checks: wSlow 0 (any pull/read) bit-identical to unset; wSlow 1 bit-identical to off (C = U); test_core ALL OK; spikefoundry all PASS.
Reference (read only, not copied): Gemini Run 4 `wAnchor` (pull toward the birth weight w0) = the b > 0 case with C frozen at w0 (a = 0).

## Hypothesis
H1: a protected slow weight (B2 coupled, a > 0, b > 0) raises book100k held-out accuracy vs R144 without losing the delay-copy probe,
and the gain is NOT reproduced by the rate-only controls below (DeepSeek Toy A: a single slow weight / low rate can fake the gain).

## Arms
| arm | variant (appended to run/champion.txt) | role |
|---|---|---|
| ctrl | (none) | R144 control |
| B2 coupled | `P.wSlow=a,P.wSlowPull=b` | the proposal |
| B2 read-mix | `P.wSlow=a,P.wSlowRead=0.5` | two weights read together, no pull |
| slowOnly | `P.wSlow=a,P.wSlowRead=1` | single slow weight read alone (running average) |
| lowLr | `P.granLr=x,P.granLrLate=x/2` (default 0.1 / 0.05) | plain low learning rate |
| kalMin | `P.granKalMin=y` (default 0.02) | readout rate-floor knob (count consolidation) |
| metaCap | `pl.metaCap=z` (default 200; cortex metaN 40) | existing cortex consolidation knob |
| peMode0 | `pl.peMode=0` (default 16) | existing soft-bound LTD consolidation knob, removed |

## Seeds
- Tune: k2977, k2978 (fresh, never used). Confirm: k2980..k2995 (16 fresh, never used, disjoint from tune).

## Tuning (2 seeds; extremes first, then bisect, then refine)
T1 extremes, bookdiag book30k (eval 2000), 2 seeds:
  ctrl; B2 coupled (a,b) = (0.3,0.1), (0.003,0.1), (0.03,0.01), (0.03,1); read-mix a=0.03; slowOnly a=0.003 and a=0.3;
  lowLr x=0.025; kalMin y=0.005; metaCap z=2000; peMode0.
T2 bisect/refine, bookdiag book100k, 2 seeds: ctrl + the best T1 B2 extreme and its bisection toward the next-best extreme
  (geometric midpoint in a and/or b), plus, for each control family, its best T1 setting (lowLr, slowOnly, kalMin, metaCap/peMode0 best one).
  Refine (optional, at most one more 2-seed step) only if two B2 settings are within .002 of each other.
Selection: B2 winner = highest 2-seed mean book100k heldAcc among B2 arms; matched control = the best rate-only control at book100k (lowLr / slowOnly / kalMin).
Stop rule: if no B2 arm's 2-seed book100k mean is >= ctrl's, stop and report negative (no 16-seed run).
Tune seeds also run fables4000 + text1000 for the T2 finalists (cheap stop check).

## Confirmation (16 fresh seeds k2980..k2995, paired vs ctrl)
Phase A: fables4000 + text1000 (ctrl, B2 winner, all seeds); order3 / K4 / sc_order2 / sc_cycle (both, first 4 seeds).
  Stop rule (as R144): B2 fables acc cost > .005 or fitness < -.05 vs ctrl -> STOP.
Phase B: delay-copy probe (sw/lagprobe140.js, 30000 syms; ctrl and B2, all seeds).
Phase C: book100k (sw/bookdiag.js; ctrl and B2, all seeds), then the matched control at book100k (16 seeds).
Max 3 node jobs on the box at once.

## Pass bars (B2 minus ctrl, paired over 16 seeds)
1. book100k heldAcc: mean > 0 and paired t >= 2.0 (primary).
2. book100k: >= 11/16 wins and no seed below -.003 (secondary, same per-seed bar as R144).
3. delay-copy probe: mean >= ctrl - .01.
4. fables4000 / text1000: acc cost <= .005 and fitness >= -.05 (the accepted cap); order3/K4/seqchoice: no mean change beyond +-.005.
5. Attribution: B2 minus matched control at book100k: mean > 0 with t >= 2.0. If 1 passes but 5 fails, the result is reported as a
   rate effect (not consolidation) and B2 is not recommended over the simpler knob.
Report all bars honestly whether they pass or fail; Travis decides any promotion. No engine default changes in R145.
