# PRIORITIES (R63, Oct 18 2026, 7:45 AM CT; v36)

Goal (Travis): the best SNN design, found as fast as possible, on the way to a **large brain that generates text like a small LLM**.
Analogy is secondary. Pick tests that bring the design landscape into focus, avoid low-payoff tangents, and keep every machine busy.

## Where we stand (R63)
- v36 (book ~0.31-0.32) is still a bigram-level learner; its own states support 0.40 (linear readout) and 3-grams reach 0.43-0.52.
- Life length does not help under v36 (10k 0.316, 30k 0.313, 100k 0.314); depth x4 = x3.
- **Size was never tested properly**: sc.grid alone shrinks axons relative to the sheet (coneSpeed / axonLen are in grid steps), so the old
  2x lost and 4x went silent. With wiring scaled to the grid, a 4x brain beat 1x on a box smoke test (3.43 vs 3.33, 1 growth). x01 / x02 decide it.
- Output-side space-bias fixes (readIn > 0.01, readTicks, rcvHomeo 0.02-0.05) and mixing-code knobs (mixHomeo, mixLr, mixK) are ruled out.
- v36 may hurt reward-coupled seqchoice order2 (-0.055 vs v35, t -2.5): x12.

## Ranked open questions (shared jobs x00-x17)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I78 / I73 | Does size pay once the wiring scales with the grid (2xS / 4xS vs 1x at book 10k / 30k)? Decides the large-brain run | x01a/b, x02 |
| 2 | I77 | Which teacher-rule knob of the cortex cells moves book toward 0.40 without hurting order3 / fables / text (5-task screens, adoption-ready) | x03-x08, x10, x11 (x00 = worker reference) |
| 3 | I75 | Space bias through trust / sharpness weighting and very weak homeostasis at a realistic target rate | x03, x07, x09 |
| 4 | Q31 | Is v36 really worse on seqchoice order2, and is it metaCap or predErr 0? | x12 |
| 5 | I72 | Generation: 4xS brain at 30k, 1x at 100k (sampling T 1 / 0.7) | x14, x15 |
| 6 | I73 | Size x length: 2xS / 4xS at 100k | x16a/b, x17a/b |
| low | I76 | mixLr 0.005 confirmation (book30k +0.003) | x13 |
Decision point: if 4xS (or 2xS) beats w13 by >= 0.01 on book30k, scale-up becomes the main track: propose a staged large run on linux-pc
(4xS-8xS, best rule, 100k -> 300k -> 1M symbols with checkpoints and generation samples); do not start it without Travis. If a rule screen
wins on book30k and book10k with no task worse, it is adoption-ready (16 growths) and goes to Travis / the authorised default rule.

## Worker notes (R63)
linux-pc publishes results but has no heartbeat (pre-R61 dq.js, not under the supervisor). When someone is at the PC: `sh run/install-linux.sh linux-pc`
(systemd user service + linger, self-updating). tacobell: supervised, cpuMax 75, no claims on battery.

## Previous status (R62)
### v36 adopted (R62, Oct 17, 11 PM CT, Travis approved)
R62 found the book weakness is the **learning rule, not the representation**: an offline linear readout of v35's own states predicts the
next letter at 0.40 held-out (bigram 0.31, 3-gram 0.43), while v35 got 0.27 at 10k and fell with life length (0.15 at 100k): decoder ties
(~30% of predictions), and a metaplastic potentiation scale that fades to 0 while the prediction-miss LTD does not. **v36** = deepURSx3 with
predErr 0 + pl.metaCap 200, graded decoder readIn 0.01 (seq recommend): book30k 0.229 -> 0.313, book10k 0.271 -> 0.316, 100k ~0.30, no task
worse (16 growths; RESULTS R62). v35 = plan deepURSx3v35 (+ readIn 0), legacy/v35. The w01-w12 numbers are v35 / predErr-dose numbers;
the still-pending w08-w12 were pinned to deepURSx3v35 + readIn 0 (same meaning as written) and moved to priority 0.6.

New ranked questions (shared jobs w13-w26, all v36, 16 held-out growths in 4-growth runs):
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I73 | Does size / depth / length pay under v36? 2x and 4x cells, deepURSx4, 100k life, vs the v36 reference | w13 (ref), w14, w15a/b, w16a-d, w17, w18a/b |
| 2 | I75 | Space bias (62% space predictions vs 20%): output-side fixes that keep book30k (readIn 0.03 / 0.1, readTicks 6 / 8, rcvHomeo 0.02 / 0.05) | w19-w21 |
| 3 | I76 | Stable letter-pair codes (98k codes for 410 pairs): mixHomeo 0.05 / 0.15, mixLr 0.005 / 0.02, mixK 3 / 5 (book30k + fables4000) | w22-w24 |
| 4 | I72 | Generation under v36 (argmax / sampling after a 30k life) | w25 |
| 5 | Q31 | seqchoice safety of v36 (seqchoice defaults to deepURSx3, not in the R62 eval) | w26 |
Decision point: if 2x / 4x / x4 beat w13 by >= 0.01 on book30k, propose the large run; otherwise keep working on the rule (I75 / I76).

## Yardstick: the real corpus (I66, `source:'book'`, js/envs/book.js)
13 public-domain Gutenberg books in simple English (Alice, Grimm, Andersen, Aesop, Peter Pan, Wind in the Willows, Oz, Secret Garden, ...),
reduced to 24 symbols (" .abcdefghiklmnoprstuvwy": lowercase, q->k, x->ks, z->s, j->g, sentence punctuation -> '.').
3,289,087 training characters and 172,269 held-out characters (the last ~5% of each book, never streamed in training).
A life streams `nSyms` TRAIN characters from a random start, so any length works (10k, 100k, 1M) without loops. The last `evalSyms` come from HELD,
and the fitness is **10 x held-out accuracy** (teacher forced). `genSyms` + `run/gen.js` free-run the brain on its own output (I72).
Node/Termux only (3.4 MB file, not loaded by index.html). Old envs are bit-identical (perf/verify.js 10/10, test_core ALL OK).

Offline n-gram held-out accuracy on the same split (what a brain would need to beat):

| context chars | 0 | 1 (bigram) | 2 | 3 | 4 | 5 | 7 |
|---|---|---|---|---|---|---|---|
| held-out accuracy | 0.196 | 0.301 | 0.424 | 0.521 | 0.581 | 0.609 | 0.597 |

Early box numbers (book 10k with eval 2000, 2 growths): v35 0.270, v34 0.273, 2x brain 0.277, x6 0.281 (rejected), 0.5x 0.02 (sc.grid < 1x is broken).
All are **below bigram** (0.301), and 3k lives reach 0.295. Generation: argmax gives only spaces; sampling (genTemp 1) babbles in "the/and/to" style,
with train-vocabulary words 0.47 vs 0.98 for real text and trigram bits 5.65 vs 2.48.
So far the brain is a weak bigram learner on real text, and scale has not yet been shown to help. Questions (b) and (c) decide everything else.

## Ranked open questions

| rank | id | question | why now | jobs |
|---|---|---|---|---|
| 1 | (c) Q32 / I70 | **Stability-plasticity rule**: does predErr 0.1 (peMode 16, peFix 0.01) keep v35's gains while restoring long-gap memory, on every task including the real corpus? | fables4000 +0.038 and fables8000 +0.074 vs v35 (R60). It is the only adoption candidate. Defaults change only after 16+ held-out growths with no task worse (t < -2) and Travis's approval | PC q46-q57 (old tasks); shared **w01-w03** (book 10k / 30k, 16 growths) |
| 2 | (b) I73 | **Scaling curves on the real corpus**: does held-out accuracy rise with brain size (1x / 2x / 4x cells) and with depth x3 vs x4, at fixed life? | Nothing else matters if size does not pay. Deeper x6/x8 and slow layers are rejected (lose on long fables); x4 is the only depth still in play | shared **w04-w06** |
| 3 | (b') I73 | **Length curve**: 3k / 10k / 30k / 100k symbols. Does a longer life keep improving held-out accuracy (an LLM-style data-scaling curve), or plateau near bigram? | Long runs are only worth it if the curve keeps climbing | shared **w03, w07** (+ phone slices w09) |
| 4 | (g) | **Engine throughput**: a 2x brain costs ~3x the time (129 s/growth at 10k on the box). A large-brain text run needs >= 10x speed (sparse event-driven updates, typed-array hot loops, worker threads per region) | Has to be paid before a large run; perf/ already has the harness | code (no job yet) |
| 5 | (e) I72 | **Free-running generation**: does the generated text get more word-like with size, length and rule? Metrics: train-vocabulary word rate, distinct 4-grams, copying (8/16-grams verbatim in TRAIN), trigram bits/char vs real held-out text | The goal is generation; teacher-forced accuracy may not track it | shared **w08** (+ phone w10) |
| 6 | (d) | **Long-gap memory**: fables second and third pass (fables8000/12000) and book held-out at 30k/100k | Mostly covered by (c) and the length ladder | PC q47/q50/q53/q55 |
| 7 | (f) I71 | **Passive-then-active**: predict silently first, gate LTD and output by confidence, act later | Travis's hunch. Needs code; after (c) settles the LTD dose | code later |
| low | - | analogy / renaming (relabel), evolution of genes, critical periods, racing | Renaming winners (peFix 0.2, predErr 1.0) cost heavily on fables; evolution failed at gen 0 (q33/q45); racing is not worth it | none new |

Rejected (R60): deeper chains x6/x8, slow context layers, sc.grid < 1x, renaming-tuned rules (v07: fables2000 2.225 / 2.792 vs ~2.8).

## Numbering
Shared jobs on the `queue` branch use the **w** prefix (w01...). The PC's local queue has q46-q57 (PR #6). Ideas: I66 = corpus (now built),
I70 = dose, I71 = passive-then-active, I72 = generation, I73 = size scaling. The book source is part of I66; run/gen.js implements I72's test.

## Rules (unchanged)
Code goes only to `neuro/distributed-queue` and jobs only to `queue` (never main). Jobs never need unpushed code. Defaults change only after
held-out evaluation (16+ growths, no task worse at t < -2) and only with Travis's approval.

## Next decision point
If w04-w07 show held-out accuracy rising clearly with size (2x > 1x by >= 0.01 and 4x > 2x) or with length (30k/100k > 10k), propose a long
large-brain run on linux-pc (4x-8x cells, x3 or x4, the best rule, 300k-1M-symbol life with checkpoints and generation samples). Do not start it without Travis.
If neither helps, the engine is the bottleneck: work on the learning rule and representation (the n-gram gap from 0.30 to 0.52), not on size.
