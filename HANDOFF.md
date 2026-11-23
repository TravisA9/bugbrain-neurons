# ComputeLab — Cross-Agent Handoff & Collaboration Protocol

Shared coordination protocol for all AI agents (Codex, Gemini, Grok Bot / BrainBot, Neuro, Text) working on `C:\Users\Dell\Desktop\ComputeLab`. It supports handoffs, audits of prior work, idea sharing, and hypothesis critique without repeating dead ends.

> **Source of truth.** This file, `worker/HANDOFF.md` in the repo, is the master copy. It replaces the Word document *ComputeLab — Cross-Agent Handoff & Collaboration Protocol.docx* (retired Nov 23, 2026). Edit this file in a commit; do not keep a parallel .docx. If a formatted copy is needed, export one from this file and treat it as read-only. A convenience copy also sits at `C:\Users\Dell\Desktop\ComputeLab\HANDOFF.md`; the repo copy wins if they differ.
>
> Append to the Handoff Log (Section 14) rather than rewriting other agents' sections. Correct another agent's claims by adding a dated note with evidence.

## Section 1: North-Star Goal & Non-Negotiable Principles

- **Biological scaling goal:** Grow large, task-agnostic spiking neural networks using Leaky Integrate-and-Fire (LIF) neurons (V_rest = −70 mV, V_thresh = −55 mV, leak = 0.95) derived from a shared cellular genome. Growth must rely entirely on local developmental signaling: morphogen gradients, axon guidance cues, trophic competition, and structural homeostasis.
- **Generalization goal:** Mechanisms are judged by cross-task gains under one fixed, self-calibrating setting. Growth should discover mechanisms rather than have them prescribed per task.
- **Local plasticity only:** Learning must occur strictly through biologically local mechanisms: STDP, eligibility traces, global/regional dopamine reward prediction error (RPE), and local teacher plateaus. No backpropagation or global gradient calculations.
- **Long-term target:** Scalable, efficient language generation and text modeling comparable to small language models via structured spiking dynamics, with enough memory (context length) for intelligent interaction.
- **Zero-dependency engineering:** Vanilla JavaScript with zero build steps, external toolchains, or npm dependencies. The primary interface (`index.html`) must run completely offline by double-clicking.
- **Version control & parameter safety:** Always preserve the latest verified best configuration as default by incrementing `DEFAULTS_VERSION` and `APP_VERSION`. Historical genomes must remain bit-identically reproducible. New features are opt-in flags defaulting to 0 (off = bit-identical, same RNG stream consumption) until formally promoted.
- **Strict promotion gate:** see Section 2a. Never update baseline parameters or change defaults without passing it and a clean `node test_core.js` (ALL OK) plus the SpikeFoundry suite.

## Section 2: Verified Scaling Baseline & Known Dead Ends

### Verified architecture state (updated Nov 23, 2026)

- **Defaults:** v47 / `DEFAULTS_VERSION` 40 is still the default on both branches. Everything below is opt-in flags.
- **Optimized dynamic kernel** (`worker/js/core/net.js`): gFast0 evaluation is conditionally gated to `g1 - g0 <= 2048 || params.granFast === 2`. About 5× execution speedup at 32k neurons; 64k runs 3.1× faster than historical 32k baselines.
- **Composition limits** (`worker/spikefoundry/composition.js`): standard limits for `chain()` and `parallel()` extended from the original caps (4,096 neurons / 32,768 edges) to 262,144 neurons / 4,194,304 edges / 8,192 tail. Verified stable up to 8,320 neurons and 70,460 edges within a 50 ms tick window.
- **Best known single setting (BrainBot, branch `cursor/relgrowth`, not yet default):** relGrowth + pathBudget + rgDiv 2 + trophic 16 + recvBudget 2 + postCapRel 1.5 + anSelf 1, granule readout with granExact / granKal / granOneShot 0.03 / granTrace, plus word chunks (granChunk 1 + granChunkGate 2 + granScale 2 → 64k pool at 4×). Full argument string: `run/r140/cand_base.txt`.

### R123–R140 results (BrainBot, Nov 17–20; details in `RESULTS.md` / `STATUS.md`)

Scores are held-out next-letter accuracy (heldAcc, 2,000 held letters) on the book corpus unless stated; fitness is the 0–10 cross-task score from `run/r42.js`.

| Round | Change | Result |
|---|---|---|
| R122 | genTemp sampling (existing env flag) | **Greedy looping solved.** Greedy decoding is a deterministic argmax limit cycle (the exact n-gram model loops too). Sampling from the output distribution (T 0.5–1) gives distinct-4grams .57–.84 with held accuracy unchanged. |
| R123 | `P.relGrowth` (relative growth rules for sized regions) | **Fixes the growth collapse at awkward sizes:** K4 0.95–0.97 at every size 1–4× where older rules gave 0.00 at 1.05–1.35×. Trophic fair-share survival is the essential part. |
| R124–R128 | lagHomeo, lagWTA, fanInBudget, pathBudget, fateSnap, colInh | Diagnosed why bigger brains did not learn more: one stuck, uninhibited edge lag column per source (a growth defect). Homeostat, WTA, flat fan-in budget, fate snapping: negative. pathBudget (in-degree per afferent pathway): kept as a part. |
| R129–R131 | `P.rgDiv` (division reach/repeats scale with size), anSelf | Correct shift register at every size; 4× beats 1× on all 3 seeds (book10k +.026, book30k +.019). seqchoice losses at size traced to dead arms from a larger initial arm bias; anSelf (self-calibrated exploration) and receiver caps are part of the best setting. |
| R132–R133 | Validation of the best setting; granTrace (fast one-shot trace on the granule readout) | granTrace kept in the best setting (readout sample efficiency, found binding in R121, is the target). |
| R134 | `P.granChunk` (word chunk detectors: previous word + partial word + letter) | book30k +.020/+.0135 over trace; book100k −.008 with the 32k pool (pool saturation: 59k keys > 32k cells). No regressions. |
| R135 | granChunkGate 2 (pressure gate) + granScale 2 (pool 64k at 4×) | **Confirmed on new seeds:** book30k +.010/+.0165, book100k +.0175/+.0245; control "64k pool without chunks" gives nothing (the gain is chunks given room). No regressions (text1000 +.78 fitness, fables +.085). Origin `cursor/relgrowth` = this commit (7e20a207). |
| R136–R138 | phrase units, learned word categories, pool grown on demand, separate level-2 pool | **Negative.** Second-level keys recur too rarely to help at book100k; in a shared pool they crowd out chunks (−.007 to −.0145). A grown pool lacks the born random-claw tuple coverage of a fixed pool. All flags off. |
| R139 | 8× vs 4× with a 128k pool, book100k, 3 seeds | **8× = 4× + 128k pool on every seed** (.530/.5215/.5255 vs .5295/.5215/.5255; +.0028 over 4×/64k). Brain size beyond 4× adds nothing beyond the pool. Not promoted. |
| R140 | Long look-back: `P.lagDepth`, `lagBlur`, `lagCtx`, `lagGate`, `lagPrune`, `lagSurp` | **Winner: lagDepth 32 + lagBlur 1 + lagGate 1 + lagSurp 2** (far-back copy detectors drive the readout only when the short-context prediction is uncertain, Laplace-smoothed). Delay-copy probe .530/.508/.569/.515 on 4 seeds vs ~.21 off; book30k +.0005/−.001/+.006/+.0075 (no loss). Cross-task: order2, cycle, order3, K4, text unchanged; **fables4000 −.043 fitness (acc .4397→.4363), worse on 3/3 seeds** (inside the −.05 bound, under diagnosis in R141). book100k confirmation running. D32 exact (no blur/gate) costs book −.04; lagPrune refuted. |

### Known dead ends (do not re-test unchanged)

- **Pure large-scale grown sheets:** fully grown sheets with `scaleInvariant=1` at sizeF=8 generate ~8M–10M edges; `runEpisode` is impractically slow single-threaded.
- **Flat granule pool at 32k for long text:** the old "capacity saturates at ~32k cells" conclusion (y237 / y240) applies to flat 3/4-letter granules only. It **no longer holds with word chunks**: chunks need a 64k pool at book100k (R134/R135), and a 128k pool adds a little more (R139). Size the pool with the amount of text, not with brain size.
- **Brain size beyond 4× on book** (R130, R138, R139): flat once the pool is matched.
- **Second-level keys (phrases, categories) in the granule pool** (R136–R138): crowd-out or too rare to help.
- **Lag-column fixes that do not touch growth** (R124–R128): homeostat, latency WTA, strongest-input fan-in pruning, fate snapping.
- **lagPrune** (R140): −.0075/−.0045 on book30k.
- **Granule fatigue against generation loops** (R122): rejected; sampling is the fix.

### Recommended operational architecture

A 1×–4× grown developmental sheet (`scaleInvariant=1` / relGrowth + rgDiv) paired with a 64k (book100k) sparse granule/chunk pool. Example: 2× + 64k chunk = 72,280 neurons / 5.72M edges.

### Key open targets

- **Long context / memory:** turn the R140 look-back into a promoted setting (fix the fables loss, confirm on book100k), then move from software word keys toward grown slower regions that learn event sequences.
- **Plasticity probe gap:** narrow the gap between the optimal linear readout probe (~0.40 on standard book) and the unassisted local plastic rules (~0.35).
- ~~Generation trajectories: resolve greedy generation loops (y242, y243).~~ **Solved in R122** with genTemp sampling; greedy argmax decoding is a limit cycle by construction.

## Section 2a: Promotion Gate (agreed Nov 23, 2026)

Two stages, so an idea costs hours rather than a day of box time before it is known to be worth the full gate:

1. **Screen** on 2–3 paired seeds (tune seeds), with targets and rejection criteria pre-registered in `RESULTS.md`/`STATUS.md` before the first run. Tune on 2 seeds; confirm the chosen setting on new seeds.
2. **Promote** (change a default) only after all of:
   - held-out evaluation across **at least 16 fresh network growths** (un-tuned seeds);
   - a **paired long-book gain** (book100k or longer) over the current best setting;
   - **no task worse** on the cross-task suite (order2, cycle, order3, K4, text, fables, plus any task family added since);
   - `node test_core.js` prints ALL OK and the SpikeFoundry suite passes;
   - flags off = bit-identical with unchanged RNG consumption.

Synthetic pilots (Sections 7–13) follow the same two stages: screen on 8 paired growths, then 16 fresh seeds before engine integration.

## Section 2b: Branch Ownership & Merging

| Branch | Owner | State (Nov 23, 2026) |
|---|---|---|
| `travis/sunday-wip` @ `1bf24be6` | Codex | Pilots in Sections 6–13 (`run/*_pilot.js`). v47 default; priorities end at R116. |
| `cursor/relgrowth` | Grok Bot (BrainBot) | Origin at `7e20a207` (R135). Later commits are kept on the box (`/workspace/sweep`, branch `relgrowth`) and reach origin by git bundle through TacoBell (`relgrowth.bundle`). |

Local `cursor/relgrowth` commits after `7e20a207` (main ones; plus result/STATUS commits):

- `eade7c41`, `ab4dd26d` R136 granPhrase / granGrow (negative)
- `821bc6c7` R137 granCat (refuted); R138 granL2 / granL2N / granEvGrow
- `d230ee0e`, `ad054de1` R138 results (L2 adds nothing; 8× gain = doubled pool)
- `b216b780`, `be1df939` R139 (8× = 4× + 128k pool)
- `a76a5d7b` R140 lagDepth / lagBlur + probe `sw/lagprobe140.js`
- `780cad49` lagCtx; `f581b40d`, `c6d82aaf` lagGate 1/2; `e0078f3a`, `9deab80d`, `bbbb1106` lagPrune / lagSurp (1, 0<v<1, 2)
- `6cb1de7a`, `844ad4ef` R140 winner + confirm pre-registration; `83b5610b` cross-task results
- `55006920` R141 pre-registration; `203c5edc` this file; `73a309e1` R141 results

**History note (Nov 23, 2026).** Before the first push of these commits, the 63 raw `sw/out` dumps over 1 MB (fde_\*, ft_\*, sp_\*; ~450 MB) were stripped from every commit after `7e20a207` with `git filter-branch --index-filter` (approved by Travis). Trees are otherwise identical; commit IDs from R139 on changed (the IDs above are the new ones). The old head is tagged `pre-strip` (`8c225f7b`) on the box only. Guard: `.githooks/pre-commit` refuses `sw/out` files over 1 MB (`git config core.hooksPath .githooks`), and `.gitignore` excludes `sw/out/fde_*`, `ft_*`, `sp_*`.

**Merge note.** Each agent commits only to its own branch. The two branches change different files (Codex: new `run/*_pilot.js` scripts and docs; BrainBot: opt-in flags in `js/core/net.js`, `base.js`, `develop.js`, tests in `test_core.js`, tools under `run/` and `sw/`). Merge `cursor/relgrowth` into `travis/sunday-wip` (or both into a new integration branch) only after both sides' `node test_core.js` ALL OK and SpikeFoundry pass on the merged tree, and record the merge commit in the Handoff Log. Shared docs (`RESULTS.md`, `PRIORITIES.md`, this file) are append-only per agent to keep merges trivial. Never force-push another agent's branch.

## Section 3: Standard Session Handoff Template

Copy and append this block to the Handoff Log (Section 14) at the end of every active work cycle.

```markdown
### Session Handoff Log

* **Agent & Timestamp:** [agent] | [date, time CT]
* **Workspace / Commit / Branch:** `C:\Users\Dell\Desktop\ComputeLab` | Commit: [hash] | Branch: [branch-name]
* **Objective & Hypothesis:**
  * *Objective:* Briefly state task goal.
  * *Hypothesis:* State expected outcome with explicit metric gate (e.g., paired delta >= +0.003 on book300k across >= 6/8 growths).
* **Exact Files Modified or Created:**
  * `worker/js/core/...`
  * `worker/spikefoundry/...`
* **Commands Run & Verified Results:**
  * `node test_core.js` -> Status: [ALL OK / FAILED]
  * `node spikefoundry/scenario_test.js` -> Status: [PASSED / FAILED]
  * Run parameters: Seeds: [list] | nSyms: [N] | Neurons: [N] | Edges: [E] | Execution Time: [ms] | Scores: [val]
* **Critiques, Surprises & Open Questions:**
  * *Failures & Anomaly Analysis:* Describe unexpected behaviors or edge-case regressions.
  * *Verification Requests:* Specify code sections or assertions requiring audit by the next agent.
* **Immediate Next Step:**
  * [ ] Concrete task for next arriving agent.
```

## Section 4: Cross-Agent Critique & Idea-Sharing Rules

- **Data-driven critiques:** When reviewing proposals or performance claims, reference concrete source files, line numbers, historical run IDs (y\* / R\*), or benchmark data. Abstract or unverified theoretical critiques are invalid.
- **Isolate optimization vs. representation:** Verify strict bit-level execution identity when making engine optimizations (e.g., checking granFast=1 vs 0 or validating RNG sequence order in `develop.js`). Never misattribute runtime latency improvements to learning-rule quality gains.
- **Falsifiable idea queueing:** Any proposed architectural alteration (such as CSR representations in `spikefoundry/engine.js`, credit assignment adjustments, or structural chunking tweaks) must define target metrics, baseline thresholds, and clear rejection criteria before long-running evaluation scripts start.
- **Search like finding a page in a book:** test the extremes or likely hot spots first, then halve toward the best region, then refine. Avoid slow step-by-step sweeps.
- **State synchronization:** Keep project documentation aligned. Update `worker/PRIORITIES.md`, `worker/RESULTS.md`, and this file immediately after pushing notable structural changes.

## Section 5: Pre-Handoff Verification Checklist

Run from `worker/` before every handoff and record the status in your Handoff Log entry.

| Verification step | Command / scope | Required status | Status (BrainBot, Nov 23, `cursor/relgrowth`) |
|---|---|---|---|
| Core suite | `node test_core.js` | Must output ALL OK | ALL OK (R140 code incl. lagSurp 2 / 0.5 tests, Nov 20) |
| Scenario verification | `node spikefoundry/scenario_test.js` | All subtests pass | PASS (10/10, last run R135) |
| Composition scaling | `node spikefoundry/test_large_composition.js` | Completes without error | Not re-run since Nov 16 (no SpikeFoundry changes) |
| Git hygiene | `git status` | Clean; no binary artifacts or logs > 20 MB | Run logs and scratch tools under `sw/` untracked by design; nothing > 20 MB committed |

- [ ] `node test_core.js` → ALL OK
- [ ] `node spikefoundry/scenario_test.js` → all subtests pass
- [ ] `node spikefoundry/test_large_composition.js` → completes
- [ ] New flags default to 0; off = bit-identical, RNG consumption unchanged
- [ ] Pre-registration written before the runs; results (including negatives) in `RESULTS.md`
- [ ] Result JSONs committed (the box can be reset and wipe uncommitted output)
- [ ] `git status` clean of large artifacts; branch and commit recorded in the Handoff Log
- [ ] Handoff Log entry appended (Section 14)

## Section 6: Growth Across Input Types

*November 23, 2026 | Codex review and agreed research direction*

The goal is one developmental genome that grows an efficient spiking neural network for a wide range of inputs and objectives. Keep the input adapter responsible for signal structure, such as channel groups, spatial neighbors, timestamps or graph edges. Specify the task through its outputs and available feedback. Let the shared growth rules decide where to allocate neurons and synapses. Preserve local plasticity, offline operation and the existing default promotion gate.

### Current Evidence

The I/O spec already exposes channel geometry and tags to development. The environment still chooses the starting body plan, and SpikeFoundry’s synthetic scenarios choose circuit modules by input family. The multitask harness provides a starting point for testing one genome across tasks. See worker/js/core/io.js, worker/spikefoundry/scenarios.js and worker/experiments/multitask.json.

The worker checkout reviewed was travis/sunday-wip at 1bf24be6, with v47 as the default. Its priorities end at R116. The local origin/queue ref contains completed y242 and y243 records. R135 is at 7e20a207 on bundle/relgrowth. Its 4× book100k gains make longer context worth testing. Its word keys are maintained in software, and the measured 8× arms were flat. Use text as one benchmark for memory alongside transfer tests.

### First Transfer Experiment

Use one multichannel event stream for immediate detection and delayed prediction, with the same encoder, seed genome and local growth rules. Match output count and feedback frequency and vary the target’s dependence on history. Compare a frozen structure with activity-only remodeling and remodeling guided by delayed feedback. Give the two remodeling arms the same wiring and update budgets. Swap the resulting hidden networks and refit only the readouts under the same budget to test whether the hidden wiring became task-specific.

Record held-out task scores, synaptic events per decision, latency and peak memory, including encoding. Screen on paired seeds, then freeze settings before testing a held-out input family. Keep the existing gate of at least 16 fresh growths and a clean core suite for default promotion.

### Hypotheses About Growth and Coordination

#### Use Delayed Feedback to Stabilize Useful Wiring

The first hypothesis is that the network can explore wiring locally but lacks a reliable way to retain connections that helped with a later outcome. Let cells with available input slots admit a small number of temporary connections from nearby active axons. Maintain a short eligibility trace on each candidate. A teacher plateau or regional reward prediction error can reinforce eligible candidates when feedback arrives. Replace candidates with low accumulated benefit under a local budget, giving recent candidates time to receive feedback.

Reuse the developmental request trace in worker/js/core/develop.js and the recruitment and pruning machinery around granUtilityEvent in worker/js/core/net.js. The older q22 structured recruitment and q24 need-growth runs did not clear their targets. The proposed change is to let delayed feedback select which trial connections survive, then test that contribution against matched activity-only remodeling. Reports of activity-dependent rewiring motivate the mechanism. Its value for task adaptation remains a hypothesis.

#### Let Regions Coordinate at Different Timescales

If the benefit disappears at longer delays, test a small mix of short and slow traces generated by the same genome. Retain longer-lived pathways where delayed feedback repeatedly supports them. For coordination across regions, first test whether repeated co-activity and regional feedback can stabilize a sparse bridge between adjacent regions. An event emitted by one region could become input to a slower region, giving it a way to learn event sequences without text-specific word keys.

### Decision Rule for the Pilot

**Proposed screen** on eight paired growths. Advance if feedback-guided remodeling improves delayed-task balanced accuracy by at least two percentage points over activity-only remodeling, or uses at least 20% fewer synaptic events per decision within one point of its accuracy. Require immediate-task accuracy within one point of the fixed baseline. Reject the mechanism if it misses both routes or if the matched swap shows no task-specific advantage. Report the observed effect and cost by seed before extending the experiment.

**Research references.** Butz and van Ooyen (2013), doi:10.1371/journal.pcbi.1003259, on activity-dependent structural remodeling. Bellec et al. (2020), doi:10.1038/s41467-020-17236-y, on combining eligibility traces with learning signals.

## Section 7: Feedback Guided Growth Pilot

*November 23, 2026 | Codex | Worker base travis/sunday-wip at 1bf24be6*

The first synthetic screen passed. Delayed feedback helped local trial connections survive when they contributed to the task. Circuits grown with that feedback retained an advantage on their own task after the readouts were refit. The pilot found essentially the same synaptic event cost across arms.

### Method and Reproduction

From worker/, run node run/local_growth_pilot.js. The script uses the SpikeFoundry LIF simulator. Seeds 401–408 each supplied 6,144 growth trials, 1,200 separate readout fit trials and 1,024 held-out trials. The same event stream supplied an immediate coincidence target and a target requiring a cue four ticks earlier. Every remodeling arm used the same local candidate schedule and two-afferent cap per cell. The controls held the initial wiring fixed, ranked candidates by activity alone, or paired candidates with shuffled feedback. The swap refit the readout for each task with the hidden wiring fixed.

### Results on Held Out Examples

Mean balanced accuracy for delayed prediction was 78.7% with task-aligned feedback, 56.2% with activity-only remodeling, 56.0% with shuffled feedback and 53.6% with fixed wiring. The paired gain over activity alone averaged 22.5 points. Seven of eight seeds improved, five cleared two points and one lost 4.9 points.

Immediate detection reached 92.0% with its own feedback-grown wiring versus 53.0% with fixed wiring. With separately refit readouts, the matching hidden network beat the swapped network by 34.7 points for immediate detection and 20.9 points for delayed prediction. Both swap effects were positive on every seed. Delayed feedback and activity-only remodeling used about 43.4 and 43.5 synaptic events per decision, respectively. The pilot passed on accuracy and specialization.

### Limits and Next Experiment

The candidate bank included hand-specified delays of 0, 2 and 4 ticks. The teacher arrived at a fixed interval after a single read tick, so trace decay was a common multiplier. This tests whether feedback can select useful wiring from a fixed pool. The next experiment should use overlapping events and jittered feedback, compare a decaying trace with a matched fixed window, and hold out a new input family. Retain the existing 16-growth promotion gate. The production growth rules and defaults were untouched.

## Section 8: Overlapping Events and Delayed Feedback

*November 23, 2026 | Codex | Worker base travis/sunday-wip at 1bf24be6*

A decaying trace passed the temporal screen when short feedback lags were common. Both rules specialized on the spatial tasks.

### Method and Reproduction

From worker/, run node run/overlapping_feedback_pilot.js. Add --uniform for the timing sensitivity test or --spatial for transfer. Feedback arrived two to ten ticks after each decision, with about 4.8 plausible sources per pulse. The fixed window weighed them equally and decay favored recent sources. Total pulse weight and candidate budgets matched. Shuffled feedback broke the pairing and the oracle received the true pairing.

### Temporal Results

On seeds 501–508, delayed-task balanced accuracy was 88.35% with decay, 85.32% with a fixed window, 56.14% with shuffled feedback and 86.57% with oracle pairing. The gain over the fixed window was 3.03 points, above the two-point screen. Three seeds improved and five tied. Both trace conditions retained an exact target connection pair on five seeds. Synaptic events per decision were 13.51 with decay and 13.52 with the fixed window. After readout refitting, the matching trace-grown circuit beat the swapped one by 30.02 points on immediate detection and 29.39 points on delayed prediction.

With uniform feedback timing on the same seeds, decay gained 0.53 points on the delayed task and lost 21.49 points on immediate detection against the fixed window. Treat exponential decay as a timing assumption to test for each feedback regime.

### Spatial Transfer

On fresh seeds 601–608, the frozen rule grew circuits for horizontal and vertical neighbor coincidence in an event stream with correlated spatial background. Decay reached 96.69% and 100% on the two tasks. The fixed window reached 96.44% and 100%. The matching trace-grown wiring kept an advantage of about 30 points on each task after the swap. Both rules reached the vertical task ceiling.

### Implications for Follow On Work

Candidate delays, read windows and label prevalence were prescribed. Compare an adaptive timing rule on a harder spatial task before engine integration. Keep the existing 16-growth promotion gate.

## Section 9: Adaptive Feedback Timing Pilot

*November 23, 2026 | Codex | Worker base travis/sunday-wip at 1bf24be6*

The adaptive rule learned to assign more weight to older events when feedback arrived later. It fell 2.21 accuracy points short of the better fixed rule on average across six task and timing combinations. The experiment did not clear the screen.

### Method and Reproduction

From worker/, run node run/adaptive_eligibility_pilot.js. Add --diagnostics for the known timing profile and known wiring controls. Sixteen fresh seeds (701–716) saw two spatial patterns per task, correlated distractors and 12% label flips. Feedback delays favored recent events, were uniform, or favored older events. The adaptive rule estimated lag-specific spike and feedback covariance over 2,048 calibration decisions and froze those weights before rewiring. All growth arms had the same 32 rewiring rounds, wiring budget and readout fit. The adaptive arm did additional calibration computation.

### Accuracy and Timing Results

The learned mean lag was 5.54, 5.73 and 6.35 ticks across the three regimes. The true means were 4.18, 6.00 and 7.82 ticks. The biggest loss was on the uniform-delay vertical task (56.79% adaptive versus 63.07% fixed window). Matched hidden networks led swapped networks after refitting in all six combinations. Inference synaptic event counts differed by less than 0.14% against the better fixed rule.

### Diagnostic Controls

Giving the rule the true delay distribution raised late vertical accuracy to 65.89%, from 56.60% with the learned weights. Perfect event pairing reached 63.38% on horizontal and 66.05% on vertical. Its candidate schedules offered an average of 1.00 and 1.125 of the two exact target patterns. The pairing control retained all offered exact patterns on average. Supplying both patterns raised accuracy with the same refit to 75.97% and 77.90%. Reading those patterns with their known OR rule reached 87.63% and 87.89%.

### Next Experiment

Test a local way to generate and retain both complementary patterns with a fixed timing window and a fixed wiring budget. Use the known-pattern refit and the known OR rule to measure the remaining readout gap. Revisit adaptive timing once candidate coverage improves. Production growth and defaults remain as before.

## Section 10: Complementary Wiring Pilot

*November 23, 2026 | Codex | Worker base travis/sunday-wip at 1bf24be6*

Local proposal coverage improved accuracy by 5.00 percentage points at essentially the same inference event cost. Both useful patterns appeared much more often. The fixed-window growth rule still retained both too rarely to pass the pilot gate.

### Method and Reproduction

From worker/, run node run/complementary_wiring_pilot.js. On 16 fresh paired seeds (801–816), compare random proposals with a schedule that avoids repeats for each receiver and favors fields its nearby receivers have tried less often. The proposal schedule has no access to task labels. A third arm discounts feedback utility for candidates whose firing overlaps nearby incumbents. The experiment reused the two-pattern spatial tasks and three delay regimes, the fixed timing window, the same initial fields and readout fit, and 32 trial rounds per receiver.

### Candidate Coverage and Retention

Across both tasks and all regimes, random proposals offered both exact patterns in 37.5% of runs and retained both in 5.21%. The coverage schedule offered both in 87.5% and retained both in 18.75%. Balanced accuracy rose from 57.51% to 62.51%, with a gain in all six task and timing combinations. Inference cost stayed near 13.56 synaptic events per decision. Retention rose 13.54 points, below the 20-point gate.

The firing overlap discount reached 62.61% accuracy and 17.71% dual retention. That is similar to the coverage-only result. Proposal search and overlap scoring add growth-time work. The pilot matched candidate evaluations and measured inference events.

### Diagnostic Controls and Next Experiment

With true event–feedback pairing, the coverage schedule retained both patterns in every run where both were offered (87.5% overall) and reached 76.81% accuracy. The known-pattern refit reached 77.65% and 77.96% for the two tasks. Their known OR readout reached about 88.17% on each task. These controls put the next priority on preserving useful candidates under ambiguous feedback. Use the improved proposal schedule and true-pairing control to test whether longer candidate probation improves dual retention before revisiting adaptive timing.

## Section 11: Candidate Probation Pilot

*November 23, 2026 | Codex | Worker base travis/sunday-wip at 1bf24be6*

Spreading each trial across four blocks reduced mean accuracy by 3.62 points and dual retention by 10.42 points. The rule missed the improvement gate.

### Method and Reproduction

From worker/, run node run/candidate_probation_pilot.js. The 16 fresh paired seeds (901–916) reused the spatial tasks, three delay regimes, proposal schedule, 128 credited observations per candidate, wiring budget and readout fit. The baseline considered replacement after each 128-read block. The contiguous control compared four candidates after four blocks. The spaced arm also waited four blocks, but each candidate used 32 reads from every block. The grouped arms stored four pending scores per receiver. Spaced slices included simulator warmup and reproduced the full block spikes for the checked candidates.

### Accuracy and Retention

With the fixed feedback window, the single-block baseline reached 64.21% balanced accuracy and retained both exact patterns in 23.96% of runs. The contiguous control reached 61.00% and 17.71%. The spaced arm reached 60.59% and 13.54%. Both patterns were offered in 93.75% of runs across all arms. Spacing added a 0.41-point accuracy loss and a 4.17-point retention loss relative to contiguous batching. Inference cost stayed near 13.49 synaptic events per decision.

### True Pairing and Follow On Work

With true event–feedback pairing, the baseline retained both patterns in 93.75% of runs, the contiguous control in 90.63% and the spaced arm in 87.50%. The larger drop from ambiguous feedback persisted across trial layouts. Keep the single-block coverage pilot as the comparator. A follow-up can test a local feedback signal that identifies which recent event it concerns while holding replacement cadence fixed.

## Section 12: Partial Cues for Delayed Feedback

*November 23, 2026 | Codex | Worker base travis/sunday-wip at 1bf24be6*

Two noisy cue bits with graded matching passed the screen. Mean balanced accuracy rose 7.76 points and dual retention rose 29.17 points at essentially the same inference event count.

### Method and Reproduction

From worker/, run node run/feedback_cue_pilot.js. On 16 fresh paired seeds (1001–1016), keep the single-block replacement cadence, proposal schedule and fixed timing window. Supply each synthetic event with a reusable random context category and return one to three bits of it with feedback. The 20% independent bit error rate was known to the soft matcher. Cue bits carried no task labels or unique event identity and were used only during growth. Only the true-pairing control saw the source event index when routing credit.

### Results and Failure Diagnosis

The no-cue window scored 61.71% and retained both patterns in 17.71% of runs. Two soft bits raised those figures to 69.47% and 46.88%, with accuracy gains in all six task and timing combinations. Three soft bits reached 71.11% and 58.33%. Two clean bits reached 73.00% and 81.25%. True pairing reached 75.22% and 81.25%. All arms offered both patterns in 87.5% of runs.

One soft bit missed the retention gate by 0.21 points. It sent 28.42% of credit to the source on average versus 35.06% with two bits. A second bit reduced ambiguity. Hard matching also missed the gate and assigned zero credit to the source on 23.28% of pulses. Soft matching preserved some credit after a mismatch and passed with the same noisy cues. Shuffled cues reduced accuracy by 3.34 points. They narrowed the candidate set without improving true-source credit. Reject hard matching for noisy cues and fall back to the time window when cue reliability is unknown.

### Implications and Research Handoff

The result supports partial event context as a way to route delayed feedback. The synthetic feedback supplied an independent context copy. Test an available sensory or action cue and estimate its reliability before engine integration. For every failed variant, record the observed failure, the control or metric that diagnoses it, a proposed explanation, and what would justify revising or abandoning it.

## Section 13: Existing Signals for Delayed Feedback

*November 23, 2026 | Codex | Worker base travis/sunday-wip at 1bf24be6*

Matching the current arena state missed the growth gate. A learned visual prior located more of the delayed pickup credit, but native pickup timing supplied too little feedback for the tested growth rule.

### Current State Matching

Run node run/native_feedback_context_pilot.js from worker/. The 16 paired seeds (1101–1116) reuse the spatial task and match current BugBrain eye, gyro and steering states with earlier states. Steering came from a scripted controller in the existing arena. Feedback carried no copied context. Vision, steering and their combination reduced accuracy by 0.95–1.17 points and reduced dual retention. Combined matching assigned 22.50% of credit to the true event versus 22.05% for timing alone. The shuffled control sent 22.31%. Persistence narrowed the window without distinguishing the causal event. Drop current-state matching when the signal is independent of feedback occurrence.

### Native Pickup Audit and Growth

A separate audit learned how proximity predicted a pickup using unpaired arrival times from 789 native rewards. On 1,048 held-out rewards, the visual prior sent 22.30% of credit to the true tick versus 11.29% for timing alone and 10.99% for shuffled vision. The audit imposed uniform delays of two to ten ticks.

Run with --pickup-growth and save its JSON as pickup.json. On 16 fresh seeds, native pickups determined when synthetic spatial labels were delivered. True-source credit rose from 22.37% to 38.12%. Accuracy gained 0.52 points and dual retention stayed at zero. The shuffled prior lost 0.57 accuracy points.

### Failure Diagnosis and Follow On Work

Run with --density-control pickup.json. Only 6.58% of decisions received pickup-triggered feedback. On the same seeds, true pairing retained both patterns in 84.38% of dense runs, 43.75% after matching each seed’s pulse count by random thinning, and 28.13% with native pickup timing. Scarcity explains much of the loss. The remaining native gap warrants testing pulse concentration across candidate trials. Give each trial a minimum amount of independent outcome evidence and test a cue closer to contact before engine integration.

## Section 14: Handoff Log

### Session Handoff Log — Grok Bot (BrainBot)

* **Agent & Timestamp:** Grok Bot (BrainBot) | Nov 23, 2026, ~10 AM CT
* **Workspace / Commit / Branch:** `/workspace/sweep` (box clone of `worker/`) | Commit: see `git log` (this file's commit, after `55006920`) | Branch: `cursor/relgrowth` (local `relgrowth`; origin at `7e20a207`)
* **Objective & Hypothesis:**
  * *Objective:* Longer context, toward a memory level that allows intelligent interaction (Travis t127u), with one self-calibrating setting that does not hurt any task.
  * *Hypothesis (R141, pre-registered in `RESULTS.md`):* the R140 winner's fables loss comes from far-back copy detectors passing the smoothed surprise gate in a short (4,000-letter) text. Prediction: no gate is worse than S2; unsmoothed lagSurp 1 is within −.015 fitness. A fix passes at fables d ≥ −.010 with probe ≥ .45 and book30k ≥ −.003.
* **Exact Files Modified or Created (R123–R141):** `js/core/*.js` (mainly `net.js`, `base.js`; opt-in flags only), `test_core.js` (tests per flag), `RESULTS.md`, `STATUS.md`, `run/r123`–`run/r141`, `sw/bookdiag.js`, `sw/lagprobe140.js`, `sw/reg.js`, `HANDOFF.md`.
* **Commands Run & Verified Results:**
  * `node test_core.js` -> ALL OK (Nov 20, with R140 flags)
  * `node spikefoundry/scenario_test.js` -> PASSED (10/10, R135)
  * Summary in Section 2 (R123–R140 table). Seeds: tune k2951/k2953 (book100k), k2954/k2955 (book30k, probe); confirm k2956/k2957; cross-task k2951–2953 (seqchoice 8 seeds). 4× brain, 64k pool.
* **Critiques, Surprises & Open Questions:**
  * *Failures & Anomaly Analysis:* Size beyond 4× adds nothing once the pool is matched (R139). Second-level keys are too rare to help (R136–R138). The R140 look-back loses .043 fables fitness on 3/3 seeds while text1000 is unchanged.
  * *Convergence with Codex:* Codex found that delayed feedback selecting trial wiring beats activity alone (Section 7); BrainBot found that keeping far-back detectors by measured utility works (R140). Both hit the same failure mode: early luck or ambiguous credit (Sections 9–13; R140 lagPrune, ungated D32).
  * *Verification Requests:* Audit `net.js` `guLagUse` (lagSurp gate, ~line 1003–1020) and the probe source `delaycopy` in `sw/lagprobe140.js`.
* **Immediate Next Step:**
  * [ ] R141: fables4000 diagnosis (G / S1 / D8S2 × k2951–2953) and book100k S2 confirm (k2951/k2953/k2954 vs .523/.519/.5265) — running on the box.
  * [ ] Push local `cursor/relgrowth` commits through the TacoBell bundle.
  * [ ] Merge plan with Codex's `travis/sunday-wip` (Section 2b).
