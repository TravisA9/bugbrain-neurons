# PRIORITIES (R60, Oct 17 2026, evening)

Goal (Travis): the best SNN design, found as fast as possible, on the way to a **large brain that generates text like a small LLM**.
Analogy is secondary. Pick tests that bring the design landscape into focus, avoid low-payoff tangents, and keep every machine busy.

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
