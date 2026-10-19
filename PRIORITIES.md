# PRIORITIES (R71, Oct 19 2026, ~11:30 AM CT; **v39 / DEFAULTS_VERSION 32** unchanged; R71 adds size-scaling genes, all off by default)

## R71 update
- **New genes** (bit-identical when off; test_core checks it): `sc.sizeF` (per-region size factor), `sc.sizeNorm`, `sc.divReach`, `sc.divRep` (I80),
  `P.fanRef` / `P.fanRefR` (fan-in-normalised rate of the teacher / reward rule).
- **fanRef is a partial fix (I89; ladder 200 / 300 / 450 / 840 -> order3 0.790 / 0.835 / 0.875 / 0.856, optimum ~450):** cortex 4x + fanRef 450 at lr 0.2 recovers order3 0.756 -> 0.875 (8/0; cortex 4x lr 0.1: 0.797; 1x 0.949) and keeps the
  cortex text gain (book10k / 30k +0.009, fables +0.005 vs v39 1x, 8 growths). Order3 is still -0.07 vs 1x, text1000 -0.008.
- **Not fixed:** the seqchoice collapse from a bigger cortex (order2 3.2-3.7, cycle ~4.0 vs 6.5 / 9.2); fanRefR helps order2 a little, cycle not at all, so it is not
  a rate effect. sizeNorm 4 makes it worse (rejected). The context-side order3 loss is untouched by fanRef (predictor fan-in does not change with context size).
- **I80 growth timing fixed in code:** divRep 2 fills maxCells (8x cortex 14.45k cells vs 7.3k). Whether a full 8x cortex pays is y46 / y61.
- **Large-run decision: still not proposable.** No scaled brain meets the bar (order3 within 0.02 of 1x, seqchoice within noise, book gain kept).

## Ranked open questions (R71)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I89 | fanRef at 16 growths and fresh seeds; best fanRef (200 / 300 / 450) and fanRefR; does a higher lr pay under fanRef? | y42, y43, y44, y48, y51 |
| 2 | I87 | Per-region factors with fanRef (plain 4xS, sizeF all-but-striatum, sizeF everywhere); context 4x + sizeNorm; the seqchoice collapse needs a diagnosis (striatum input from a big cortex) | y45, y57, y59 |
| 3 | I80 | Does a fully grown 8x cortex (divRep 2) add to 4x under fanRef? | y46, y61, y52, y56 |
| 4 | I73 | Length at size under fanRef (book100k / 300k, k 1400-1415) vs y27 / y36 / y40 | y50, y54, y55, y60 |
| 5 | I78 / I72 | 2x cortex size curve; rule knobs and generation under fanRef | y49, y58, y53 |
Decision point (for Travis) unchanged: no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain,
and the long-life jobs show size still improving between 100k and 300k.

## Worker notes (R71)
R71 code pushed 10:57 AM CT (9787c0f); y42-y61 queued 10:57 AM (~172 est slot-h; requires run/r71_jobs.js). y42a was claimed within minutes. Pending
before R71: ~150 est slot-h. Total ~320 est slot-h, ~200-220 real slot-h at the R69 ratio: ~17-18 h for both workers (12 slots) together, not the
24 h asked for. The next review needs to add more.

## Previous update (R70)
- **v39 adopted** (standing authorisation): cortex lr 0.2 passed on 16 FRESH growths (y08: book10k +0.006, book30k +0.009, fables +0.007, order3 -0.002 n.s.,
  text 0, seqchoice identical). Old brain = plan `deepURSx3v37`. y23 (fresh set 2) passes too; pooled 32 fresh growths order3 -0.004 (t -1.7): small, watch it.
  z10b completes the 4xS fast-engine check (no task worse): v38 engine stands. lr 0.3 / 0.5 forget order3 (-0.015 / -0.046): the rate optimum at 1x is ~0.2-0.25.
- **Rate x size:** at 4xS lr 0.2 is worse (book -0.004 / -0.006, text -0.006); lr 0.05 does not rescue order3. The best rate falls with size, so scaled runs pin lr 0.1.
- **Size dissection (y10a/b, 16 growths):** the book gain lives in the cortex (+0.014 of +0.020); scaling the context regions gains nothing and alone costs
  order3 -0.22; scaling the cortex alone costs order3 -0.16, text -0.015 and collapses seqchoice. A code fix is needed before size can be a default (I87).
- **Large-run decision:** still **not ready** (order3 / seqchoice lost at size; length flat at 100k). y36 (4xS 100k vs 300k) and y27 (1x to 1M) answer the length half.
- Rejected: plateau 6 at lr 0.2 (order3 -0.020, t -2.6), lr 0.3 / 0.5.

## Ranked open questions (R70)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I77 | Rule knobs at the new rate (teachThr, plateau 5, metaCap 400, trustPow 0.5, preNorm 55); lr 0.25; does v39 hold on fresh set 2? | y23, y24, y25, y38 |
| 2 | I87 | Region causes of the size loss (y10b, y16, y33, y37) and order3 K 4 / 16 x size (y30); then a box code fix: per-region scaling, fan-in normalised to source-region size, striatum excluded from sc.* | y10b, y16, y30, y33, y37 |
| 3 | I78 | Rate x size curve (2xS 0.05 / 0.1 / 0.2, 4xS 0.07 / 0.14); size curve on fresh seeds (2xS / 3xS / 4xS); rule knobs at 4xS | y28, y29, y34, y39, y15, y21, y35 |
| 4 | I73 | Does length ever pay? 1x v39 to 1M; 2xS / 4xS 100k -> 300k | y26, y27, y36, y40, y41 |
| 5 | I72 / I81 | Generation with the gate under v39 and at 4xS after 100k | y31, y32, y18 |
| 6 | I80 | 8x growth needs proliferation / growth time scaled (code, box) | none (code) |
| low | - | space-bias output fixes, mixing codes, sparser activity, fewer substeps, staged maturation, evolution / racing, plateau 6, lr >= 0.3 | none |
Decision point (for Travis) unchanged: no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain,
and y36 shows 4xS still improving between 100k and 300k.

## Worker notes (R70)
Both workers were busy on R69 jobs all morning (linux-pc y08a -> z10b, tacobell y08b -> y10b). R70 queued ~122 slot-hours on top of ~44 left (~14 h wall
together by the estimates, likely less). All R70 jobs `require` only R69 files, so the workers can claim them on their current code.

## Previous update (R69)
- **v38 adopted** (standing authorisation): params.fastEngine 1 by default after z08 (1x, 16 growths x 7 tasks), z09 (4xS book10k, 16/16 identical) and
  z10 (4xS 5 tasks, 8 growths) showed no task worse. Exact engine = P.fastEngine=0 (identity checks; verify.js BB_ENGINE=0). z10b completes the 4xS check.
- **Size is not a free win.** 4xS gains book +0.02 and fables +0.017 but loses order3 -0.24 (0/16) and collapses seqchoice; 2xS loses order3 -0.15 and
  text1000 -0.017. The loss grows with the cell count of the cortex or the context regions (box dissection), and plan-wide sc.* variants also inflate the
  striatum. The large-brain run is **not ready**: fix higher-order context at size first (I87 / Q39).
- **Length is flat at every size** (1x v37 100k = 30k; 2xS / 4xS 100k = 30k). The brain saturates at a bigram-plus level whatever it is fed.
- Cortex lr 0.2 wins the 5-task screen (book +0.008 / +0.009, fables +0.007, order3 -0.007 n.s.): confirmation on fresh seeds with seqchoice (y08) -> v39 if it passes.
- Rejected: staged maturation (I82), tauPre 8 / 18, metaCap 100 / metaN 80 under v37 (order3). Cumulative v34 -> v37 gains hold on fresh seeds (z01-z03).

## Ranked open questions (R69)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q40 / I77 | Does cortex lr 0.2 (+ plateau 6) pass on fresh growths with seqchoice (adopt as v39)? Where does the rate stop paying? | y08a/b, y09 |
| 2 | Q39 / I87 | Which region's size breaks order3 / seqchoice, and which carries the book gain (4xS and 2xS by region; 3xS curve; long fables x size)? Then a code fix on the box (per-region scaling, normalised fan-in from bigger context regions, striatum excluded from size variants) | y10a/b, y16, y21, y17 |
| 3 | I78 | Rule x size: does lr 0.2 add at 4xS, does lr 0.05 rescue order3, do consolidation knobs behave differently at size? Fresh-seed replication of 4xS | y11a/b, y15a/b, y20, y22a/b |
| 4 | I84 | Fast engine at 4xS on 16 growths (post-adoption check) | z10b |
| 5 | I72 / I81 / I73 | Generation with the confidence gate at 4xS; size x length at the faster rate | y18, y19 |
| 6 | I80 | 8x needs growth time / proliferation scaled to the grid (code, box) | none (code) |
| 7 | I71 / I81 | Travis's passive-then-active hunch: output gate done (better generation policy, no accuracy gain); confidence-gated learning and a silent-then-acting seqchoice phase need code | none (code) |
| low | - | space-bias output fixes, mixing codes, sparser activity, fewer substeps, staged maturation, analogy, evolution | none |
Decision point (for Travis): no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain.
Then: v39 (or v38) at 4xS, 100k -> 300k -> 1M symbols with checkpoints and generation samples, on linux-pc, only with Travis's go-ahead.

## Worker notes (R69)
Both workers healthy and on the latest code (d8e7d84 at review time; they self-update to the R69 commit), supervised, heartbeats every ~30 min. Both sat idle
from ~6 AM CT because the queue ran dry. Measured capacity: linux-pc ~8 parallel runs, tacobell ~4 (cpuMax 75). R69 queued ~76 slot-hours = ~6-6.5 h of wall
time on both workers together (up to ~9 h if 4xS is memory-bound): short of 12 h on purpose, because the next useful jobs depend on y08 / y10 (do not pad with
low-value runs; the next review refills). The laptop's old local queue stays retired.

## Previous update (R68)
- Fewer substeps per symbol (I86) is not a win. 75-82% of the substeps loses 0.02-0.03 on every text task (0/8) for 1.1-1.2x life speed. 50-64% loses 0.05-0.25. Time-constant rescaling (dtRescale) is far worse, because synaptic delay and the spike limit are tied to the substep.
- Fast engine (I84): z08 (1x) and z09 (4xS book10k, 16/16 identical scores, 1.97x on the worker) pass; flip fastEngine to 1 (DEFAULTS_VERSION 31) once z10 is done so no in-flight comparison mixes engines.
- Nothing queued from R68. Remaining speed levers: threads (SharedArrayBuffer workers over cells), or per-tick work (readout / modulate / critic), which caps substep savings at ~1.4x.

## Previous update (R67)
- Sparser activity (I85) is not a win. Text tasks already spike 1.6-2% per substep in the cortex; the 23% 'receiving' figure is fan-in. Every gene setting that cuts activity (adaptive hidden thresholds, pooled region inhibition, threshold offset) costs book / fables accuracy (best: -0.11 at -25% activity). Halving seqchoice activity costs -0.01 to -0.02.
- Speed does not follow spikes: 10x fewer spikes gives 1.05x (1x) / 1.43x (4xS), and mode 2 stays slower. Next speed lever: fewer O(N) passes per substep, or threads.
- Nothing queued from R67. R66 fast engine: z08 (1x, 16 growths x 7 tasks) passes (all |t| < 1.4, worker book 2.8-3.3x faster); z09 (4xS) running, adopt after it passes.

## Previous update (R66)
- Fast engine (I84, params.fastEngine 1, off by default): life 1.86x (1x) / 1.60x (4xS) faster than the exact engine, total 1.70x / 1.45x; vs R64 total 2.4x. Box screen: no task worse. 4xS peak RSS 1.59 -> 1.08 GB (exact path too, bit-identical).
- z08a/b, z09a/b, z10 (priority 0.975 / 0.974 / 0.95) validate it on 16 fresh growths. If they pass, make fastEngine 1 the default (standing authorisation).
- Several-x needs threads: activity is dense (~23% of cells receive input per substep) and propagation is now the floor.

Goal (Travis): the best SNN design, found as fast as possible, on the way to a **large brain that generates text like a small LLM**.

## Previous update (R65)
- Engine: bit-identical speedups give life 1.47x (1x) / 1.59x (4xS), total 1.40x / 1.43x. dropDense cuts 4xS life RSS from 1.45 to 0.26 GB, which should ease the 17x worker cost. Growth (~25% of a 4xS run, dense N² matrices) is the next speed target.
- New genes, all off by default: output confidence gate (I81, z06 / z07) and staged maturation (I82, z04 / z05; early box signs are negative).
- Q38 cumulative v34 / v36 / v37 check on fresh seeds k 1000-1015: z01-z03.
- The ranking below is unchanged. Add: rank 3b I81 gate generation (z06); low I82 staged (z04 / z05) unless z04 shows staged ≥ scratch.

## Previous status (R64)

Goal (Travis): the best SNN design, found as fast as possible, on the way to a **large brain that generates text like a small LLM**.
Analogy is secondary. Pick tests that bring the design landscape into focus, avoid low-payoff tangents, and keep every machine busy.

## Where we stand (R64)
- **v37 adopted** (R64, standing authorisation, 16 held-out growths, no task worse): deepURSx3 = v36 + cortex lr 0.1 + striatum predErr 0.3.
  Book 10k / 30k 0.325 / 0.324 (v36 0.316 / 0.313), fables4000 0.339, order3 0.964, text1000 0.758; seqchoice = v35 (the v36 order2 loss was the
  striatum's missing prediction-miss LTD). v36 = plan deepURSx3v36.
- **Size pays** once the wiring scales with the grid: 4xS book 0.346 / 0.349 (+0.030 / +0.036 vs v36 1x, 15/16), 2xS 0.337 / 0.337. The scale-up
  track is now the main track. But **8x does not scale yet**: proliferation (and likely other step-counted growth) stops at ~15k cells (22k with
  pDiv 1) and 8xS scores below 4xS on the box. Cost: 4xS ~17x a 1x growth, 2xS ~2.5x.
- Rule knobs: lr is the only one that wins all 5 tasks; every consolidation-loosening knob (metaCap, metaN, preNorm) buys book / fables with an
  order3 loss. The gap to the 0.40 readout ceiling is now ~0.075 at 1x and ~0.05 at 4xS (v36 rule).
- Space bias: unchanged by every rule knob (boundary precision 0.30-0.33); size raises it to 0.32-0.36. Output-side fixes exhausted.

## Ranked open questions (R64)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I78 | Does the size gain hold on every task under v37 (4xS / 2xS on the 5-task screen), and does it grow with life length (4xS / 2xS at 100k)? | y03a/b, y05, x17a/b, x16a/b (x19 v36 gate tasks running) |
| 2 | I77 / I79 | Does the rate keep paying above 0.1 (cortex lr 0.15 / 0.2), and do plateau 6 / metaCap 100 / metaN 80 / tauPre add on top of v37? | y02, y04, y07 |
| 3 | I80 | Make growth scale past 4x (proliferation / growth time counted in developmental steps): code + box diagnosis, then an 8xS point | code (no job yet) |
| 4 | I72 | Generation: 4xS at 30k (x14 running), 1x at 100k (x15) | x14, x15 |
| 5 | I73 | Life length under v37 (v36: 10k = 30k = 100k) | y06 |
| low | I75 / I76 | space bias via output / homeostasis, mixing-code knobs: exhausted | none |
Decision point (for Travis): if y03 shows v37 4xS >= v37 1x + 0.02 on book with no task worse, and x17 shows 4xS still climbing at 100k, propose the
staged large run on linux-pc: v37 at 4xS (8x only after I80), 100k -> 300k -> 1M symbols with checkpoints + generation samples. Do not start it
without Travis.

## Worker notes (R64)
linux-pc: supervised since ~1:39 PM CT Oct 18 (R61d, code 29978cd), heartbeats + 30-min claim renewals, one job at a time (the old double process
is gone). tacobell: supervised, cpuMax 75, 4 parallel runs, no claims on battery. Its old local queue stays retired.

## Previous status (R63)
### Where we stood (R63)
- v36 (book ~0.31-0.32) is still a bigram-level learner; its own states support 0.40 (linear readout) and 3-grams reach 0.43-0.52.
- Life length does not help under v36 (10k 0.316, 30k 0.313, 100k 0.314); depth x4 = x3.
- **Size was never tested properly**: sc.grid alone shrinks axons relative to the sheet (coneSpeed / axonLen are in grid steps), so the old
  2x lost and 4x went silent. With wiring scaled to the grid, a 4x brain beat 1x on a box smoke test (3.43 vs 3.33, 1 growth). x01 / x02 decide it.
- Output-side space-bias fixes (readIn > 0.01, readTicks, rcvHomeo 0.02-0.05) and mixing-code knobs (mixHomeo, mixLr, mixK) are ruled out.
- v36 may hurt reward-coupled seqchoice order2 (-0.055 vs v35, t -2.5): x12.

### Ranked open questions (R63, shared jobs x00-x19)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I78 / I73 | Does size pay once the wiring scales with the grid (2xS / 4xS vs 1x at book 10k / 30k)? Decides the large-brain run | x01a/b, x02 (+ x19 gate tasks) |
| 2 | I77 | Which teacher-rule knob of the cortex cells moves book toward 0.40 without hurting order3 / fables / text (5-task screens, adoption-ready) | x03-x08, x10, x11, x18 (x00 = worker reference) |
| 3 | I75 | Space bias through trust / sharpness weighting and very weak homeostasis at a realistic target rate | x03, x07, x09 |
| 4 | Q31 | Is v36 really worse on seqchoice order2, and is it metaCap or predErr 0? | x12 |
| 5 | I72 | Generation: 4xS brain at 30k, 1x at 100k (sampling T 1 / 0.7) | x14, x15 |
| 6 | I73 | Size x length: 2xS / 4xS at 100k | x16a/b, x17a/b |
| low | I76 | mixLr 0.005 confirmation (book30k +0.003) | x13 |
Decision point: if 4xS (or 2xS) beats w13 by >= 0.01 on book30k, scale-up becomes the main track: propose a staged large run on linux-pc
(4xS-8xS, best rule, 100k -> 300k -> 1M symbols with checkpoints and generation samples); do not start it without Travis. If a rule screen
wins on book30k and book10k with no task worse, it is adoption-ready (16 growths) and goes to Travis / the authorised default rule.

### Worker notes (R63)
linux-pc publishes results but has no heartbeat (pre-R61 dq.js, not under the supervisor) and runs two worker processes under one name
(two jobs at a time). When someone is at the PC: `sh run/install-linux.sh linux-pc`
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
