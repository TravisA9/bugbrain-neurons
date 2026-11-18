# Morning summary: growing spiking brains that scale (Nov 17-18 overnight)

Branch `relgrowth`, nothing pushed (TacoBell untouched). Hand-over bundle: `/workspace/sweep/relgrowth.bundle` (afed1aba..relgrowth, verified).
Commits R123-R131 are listed at the end. Every new behaviour is a default-off flag, bit-identical when off; test_core ALL OK and spikefoundry passing on the last commit.
Numbers: book = held-out next-character accuracy on 2000 held symbols (heldAcc); other tasks = task fitness 0-10. All comparisons are paired, the same seeds vs the 1x brain (k2951/2952/2953 unless noted).

## The short version
- **Bigger brains now learn more, and growth found most of the fix itself.** The best single setting grows a 4x brain that beats the 1x brain on every seed for book10k (.4625/.4925/.447 vs .4535/.438/.4385, +2.6 points) and book30k (.478/.526/.4765 vs .4765/.4735/.475, +1.9), and on text1000 (+.17) and fables4000 (+.26). K4 and order3 stay level, and the sequence-choice tasks are level or better (8 seeds).
- **The curve flattens after 4x.** 8x on book10k scores .460/.494/.450, the same as 4x. The next limit is not growth.

## What worked, and why
1. **Relative growth (relGrowth, R123).** Growth rules measured against the brain's own size, so awkward sizes (1.2x, 2.5x...) no longer collapse and no inputs are left unwired. Necessary, but not enough for learning.
2. **The real book failure was a broken shift register (R124-R128).** Book relies on "lag columns" that remember the last few letters. Each column needs its own inhibitory cell to reset it when a new letter arrives. In bigger brains, cells at the edge of the sheet were born too late and took the wrong fate, so some columns got no reset cell and stayed stuck on. A post-hoc rewiring (colInh) proved this but prescribes the fix, so it stays a diagnostic.
3. **The growth-native fix (rgDiv, R129):** let dividing cells spread as far per developmental step as they do in a 1x brain. Daughter cells then reach about sqrt(size) sites, with log2(size) divisions per step. Every lag column then gets its reset cell at 2x and 4x, on all seeds, with no rewiring. This gave the book gains.
4. **Per-pathway input budget (pathBudget, R127).** Each cell keeps the same number of inputs per pathway as in the 1x brain, chosen at random rather than by weight. It adds about +1 point on book at 4x and keeps order3 level at 4x.
5. **Sequence-choice failure = "dead arms" (R130-R131).** Diagnosed with one-life probes:
   - The needed context *does* reach the striatum: the right action can be decoded from it perfectly at every size.
   - The problem is action selection. In a bigger brain the output pools start out much more unequal: one arm can take 84% of the output spikes at first.
   - The fixed exploration noise is then too weak. Some arms are never tried, so they never earn credit and stay dead.
   - The fix: the reward rule's per-receiver step and cap (existing flags trophic 16, recvBudget 2, postCapRel 1.5), plus **self-calibrated exploration (anSelf, new)**. Exploration noise rises by itself when one arm dominates the recent output. It needs no size knob and is neutral at 1x.
   - Result on 8 seeds: order2 2x +.14 and 4x +.09 vs 1x, previously -.29/-.18. cycle (8 seeds) +.36/+.10; at 1x anSelf: order2 -.08, cycle +.16 (7/8).

## What failed, and why (all documented in RESULTS.md)
- fanInBudget (keep the strongest inputs): it deletes the whole lag feed-forward path, because weights carry a fixed genetic margin.
- Other negatives:
  - lagHomeo and lagWTA, and fateSnap.
  - colInh v1: donated reset cells never fire.
  - thinF and allMax (cutting cortex input to the striatum), and removing the inhibitory synapses onto the outputs.
  - Faster arm-pool homeostasis: the brain already has it, but it is too slow to undo the starting bias.
- anSize (exploration x sqrt(size)) works, and is better at 4x (+.37) but worse at 2x than anSelf. It is kept as an alternative because it is a hand-set size knob.
- Caution: seqchoice is chaotic. A float-level change in the noise can move one seed by up to 1.2 points, so all seqchoice decisions used 8 seeds.

## Current best setting (one fixed setting for every size)
`P.relGrowth=1, P.pathBudget=1, P.rgDiv=2, P.trophic=16, P.recvBudget=2, P.postCapRel=1.5, P.anSelf=1` (plus `sc.sizeF=f`).
At 1x it is bit-identical on teacher tasks and neutral on seqchoice.

| task (vs 1x, paired) | 2x | 4x |
|---|---|---|
| book10k heldAcc | .4535/.493/.4355 (1 better, 1 equal, 1 slightly worse) | **.4625/.4925/.447 (3/3 better)** |
| book30k heldAcc | .4745/.523/.4695 (1 better / 2 slightly worse) | **.478/.526/.4765 (3/3 better)** |
| text1000 | +.135 (3/3) | +.165 (3/3) |
| fables4000 | +.12 (1/3) | +.26 (3/3) |
| K4 | = | = |
| order3 | -.05 | -.017 |
| seqchoice order2 (8 seeds) | +.14 | +.09 |
| seqchoice cycle (8 seeds) | +.36 (6/8) | +.10 (5/8) |

The ablation at 4x book10k shows which parts matter:
- relGrowth alone: .447/.465/.351.
- Adding rgDiv brings it to +1.4 points.
- Adding pathBudget brings it to +2.6.
- The division genes without relGrowth give +1.3 at exactly 4x, but relGrowth is still needed at non-power sizes.

## Open failures
- 2x is the weak size on book30k: 2 of 3 seeds slightly below 1x. On book, the gains come mostly from seed 2952.
- The k2952 1x brain has its own stuck lag column, a 1x growth defect that size cannot reach.
- 8x does not beat 4x: the capacity added past 4x is not used by the readout or the learning rules.

## Next lead
- Find out what limits learning at 4-8x now that the wiring is healthy. The candidates are:
  - the readout: the granule NLMS, whose size is fixed at 32000;
  - lag-column depth: still 3 lags at every size.
- A cheap first test is to grow the granule layer and the lag depth with size at 8x and see whether the curve rises again.
- Run the best setting on 8+ seeds for book10k/30k: the gain sits mainly on one seed.

## Commits (relgrowth, oldest first)
8a472feb R123 relGrowth - a9271886 R124/R125 - 30d36c69 R126 - be277210 R126b - c47564ca R127 pathBudget - 92cfb92c R128/R129 rgDiv - b1c568f1 R130 cross-task/ablation - (R131 anSelf/anSize: see git log)
