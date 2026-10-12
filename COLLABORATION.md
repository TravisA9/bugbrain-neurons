# BugBrain Neurons: collaboration guide

Briefing for every agent working on this repo. Two agents share it:
- **Neuro** (Travis's main agent): evolution, fitness and reward learning.
- **Text** (the second agent, another machine): the text / language track.

## Project goals
Brains made of spiking neurons (leaky integrate-and-fire: rest -70, threshold -55, leak 0.95) that **grow** from one shared gene regulatory network through local developmental signalling (morphogens, axon guidance, trophic signals, synaptic scaling, homeostasis), then learn with **local** rules only. Evolution is a testbed for the growth program, not the goal. Long-term aim: a task-agnostic engine that handles many data types, ending with text and small-language-model-like output.

## Travis's standing principles (non-negotiable)
1. Always aim for the most **biologically plausible AND best-performing** design.
2. **No backprop.** Local plasticity only: STDP, eligibility traces, dopamine RPE, teacher plateaus (climbing-fibre-like).
3. Structure comes from **local developmental growth**, not hand-wiring wherever possible.
4. The **latest best settings are always the defaults** (bump `DEFAULTS_VERSION`; old saves are not restored silently).
5. **Minimal UI:** the brain should work with little or no intervention and only a few playable variables. Remove ruled-out ideas from the UI each round, with no redundant info.
6. Plain JS, no build step, no npm deps for the app: `index.html` must **open offline by double-click**.
7. Task-agnostic core; text/SLM is the long-term target.

## Architecture map
- `index.html`: the app. `viewer.html`: the growth viewer. `growth.html`: how growth works. `dashboard.html`: runner results.
- `js/core/`: `base.js` (RNG, utils), `io.js` (sensor/output coding), `develop.js` (cell growth on a tissue grid, GRN, morphogens, axon guidance), `plans.js` (body plans / plan genomes: memoryK, predictK*, predictK3, rewardK, rewardMemK...), `net.js` (LIF network + plasticity, unified rule `UNIFIED_PL`), `regions.js` (multi-region brains, tracts `topo` / `claw` / `all`), `agent.js`, `evolve.js` (robust-growth fitness), `files.js` (saves).
- `js/envs/`: `bug`, `memory` (cue / recall), `sequence` (cycle, markov, order2, order3, text, fables), `text`, `bandit`, `reward_evolved.js` (rewardE), `example_echo` (template for new envs).
- `js/ui/`: `app.js`, `devview.js`, `viewer.js`. `js/node_load.js` loads the core in Node.
- `run/`: headless runner (Node 18+ or Bun, worker_threads, no deps): `runner.js`, `engine.js`, `lib.js` (fitness, normalisation, balanced `softmin` combine), `free.js`, `worker.js`, `pool.js`, `report.js`, `bench.js`, `selftest.js`, `ablate.js`.
- `experiments/*.json`: runner configs (text_baseline, multitask, novelty_free, mapelites_free).
- `results_v*/`: per-round analysis scripts (outputs are not in git). `legacy/v25/`: the previous app version for bit-identity checks. `champions/v8/`: sample champion genomes.

## Running things
```
node test_core.js            # core regression (~1-2 min), must print ALL OK
node seq_test.js             # sequence/text prediction (CASES=, PLAN=, NG=)
node run/selftest.js         # runner == app fitness, resume, serialisation
node browser_test.js         # needs puppeteer-core + Chrome (PUPPETEER=, CHROME=)
node viewer_test.js; node dashboard_test.js

bun run/runner.js experiments/text_baseline.json   # or node; bun ~1.9x faster
bun run/runner.js experiments/multitask.json --hours 3
bun run/runner.js --resume results/<dir>
bun run/bench.js
node run/ablate.js ...       # gene transplant / ablation on held-out growths
```
Windows: `run.bat <experiment|bench>`. Stop a run with Ctrl+C once or by creating a `STOP` file. Outputs go to `results/<date>_<name>/` (gitignored; open `dashboard.html` to view). See README "Headless scripts" for every script's options.

## Current best numbers (from RESULTS.md, R22-R27)
| task | default plan | score |
|---|---|---|
| text (next-char accuracy) | predictK3 | **0.772** |
| fables, 2000 symbols | predictK3 | **0.321** (1st-order counter 0.326: stuck at first order) |
| bandit, 240 trials (16 held-out growths, episode score) | rewardE | **6.80** (rewardK 5.28) |
| cue, random mapping | rewardE | **9.68** (rewardMemK 4.79) |
| recall, random mapping (not evolved on) | rewardE | **1.37** (-3.25) |
| bandit best-arm rate | rewardK | 0.653 (Thompson ref 0.692) |
Context is currently a shift register M -> M2 -> M3 (about 3 symbols back). That is the main limit on text.

## Ownership
**Neuro** owns evolution, fitness (`run/lib.js` combine/normalisation, `js/core/evolve.js`), reward learning (rewardK / rewardMemK / rewardE, critic, dopamine), and future go/no-go striatum and dopamine regions.

**Text** owns the text track (see issues):
- **(a) Scaling harness:** how text accuracy changes with brain size (cells), context length (bands) and corpus size.
- **(b) Longer memory:** brain-plausible context beyond the 3-symbol shift register (slow-decay cells, recurrence, chained bands, replay), judged on fables (now about 0.32) and text (0.772).
- **(c) Speed:** typed-array neuron/synapse update and an optional WebGPU path, bit-identical or statistically equivalent.

Shared files (`net.js`, `develop.js`, `plans.js`, `regions.js`): keep changes small, and keep old genomes growing bit-identically (add flags that default off). Say in the PR which files you touched.

## Workflow
- Branches: `neuro/<topic>` and `text/<topic>`. **Never push directly to `main`.**
- Open a PR per result. It needs a results table (baseline vs new, number of growths, seeds), the exact reproduce commands, and the test status (test_core / selftest ALL OK).
- Log every round in `RESULTS.md` as `## R<n> [text]` or `## R<n> [neuro]`, appended at the end. Rebase before merge to avoid clashes.
- GitHub issues are the task board. Link PRs to issues.
- **Do not change defaults without a held-out evaluation over >= 16 growths** (fresh seeds not used in tuning). When a default changes, bump `DEFAULTS_VERSION` / `APP_VERSION`, back up the previous app to `legacy/v<N>/`, and remove the ruled-out UI options.
- Commit code, configs and small summaries only. Large outputs (results/, checkpoints, logs) stay out of git (see `.gitignore`); keep the repo under about 20 MB.
