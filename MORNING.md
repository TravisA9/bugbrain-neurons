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
8a472feb R123 relGrowth - a9271886 R124/R125 - 30d36c69 R126 - be277210 R126b - c47564ca R127 pathBudget - 92cfb92c R128/R129 rgDiv - b1c568f1 R130 cross-task/ablation - 42f35ee6 R131 anSelf/anSize + best setting + this file - 1b11b457 commit-list fixup - f9beabbc R132 validation, 8x diagnosis, granNeg/granKalLTD + "Update after 3 AM"

## Update after 3 AM (R132)
**1. The 4x gain holds up on new seeds.** The best setting at 4x vs 1x, same seed, held-out next-letter accuracy on 2000 held letters:
- book10k, 11 seeds: +2.1 points on average (se 0.7), 10 better / 1 worse. Without seed 2952: +1.7, 9/1.
- book30k, 7 seeds: +1.6 points (se 0.7), 7 better / 0 worse. Without seed 2952: +1.0 (se 0.3), 6/0.
  New seeds 2954-2957: .4625->.481, .4465->.4585, .498->.5065, .4515->.4685.
So the gain is not just seed 2952; it is smaller but consistent on the others.

**2. Why 8x is flat.** 8x vs 4x: book10k .460/.494/.450 vs .4625/.4925/.447; book30k .471/.484 vs .478/.4765. Not a capacity problem:
- The granule pool is not full: ~3.9k (book10k) / 6.7k (book30k) of 32000 granules are used, none hit the cap, ~4 granules fire per letter, the same at 4x and 8x.
  Doubling the pool (64000) at 4x changed nothing (0/+.009/-.0005).
- Lag columns are healthy at both sizes.
- Comparing with a simple counting model on the same text (sw/countmodel.js): the 4x/8x brain predicts about as well as a model that counts
  3-letter contexts (order 3), but not as well as one that counts 4-letter contexts (order 4) on book30k (.02-.03 short).
- Splitting the test letters by how often their 4-letter context had been seen before shows where: on contexts seen ONCE before, the brain
  scores like the 3-letter counter (.44-.49) while the 4-letter counter gets .53-.60. On contexts seen 5+ times the brain is close to the counter.
  On book10k the 4-letter counter does not beat the 3-letter one, so book10k is data-limited; book30k has headroom the brain does not use.
- So the limit is the readout's few-shot learning: how fast it trusts a 4-letter context it has seen once. More neurons don't change that.

**3. Fixes tried (all pre-registered, all negative, kept off as default-off flags):**
- granOneShot .1 (book10k): null.
- granNeg (new flag: allow negative readout weights, so a specific context can veto the general guess): book10k -0.1, book30k -0.6 points. Refuted.
- Strong one-shot (granOneShot 1): book30k -3.2/-4.0. It does fix the seen-once contexts (.47 -> .554, near the counter) but damages the
  frequent ones (.48 -> .425). Self-calibrated share (granOneShot 2): -0.4/-2.2.
- granKalLTD (new flag: also average the one-shot weight down on wrong guesses) + strong one-shot: -2.2/-2.6; frequent contexts recover only partly.
  Weaker one-shot (.3) with it: -0.35/-1.7.
Every variant trades the rare contexts against the frequent ones inside one linear readout; none is a net gain.

**Next lead:** keep the readout's fast one-shot memory for rare contexts separate from the slow, averaged weights for frequent ones
(two time-scales, e.g. a fast decaying trace on each granule synapse that is consolidated into the slow weight), and test on book30k/100k,
where there is headroom. Growing the granule pool or the lag depth with size is not supported by the evidence yet.
