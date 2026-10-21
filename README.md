# BugBrain (Spiking Arena) v41: grown spiking brains, any environment

**Repository:** https://github.com/TravisA9/bugbrain-neurons (private). Collaboration rules for agents: [COLLABORATION.md](COLLABORATION.md).

Brains are networks of leaky integrate-and-fire neurons. Nobody writes them synapse by synapse: each one is **grown from a cellular genome** by local development, using chemicals, a gene network inside each cell, axon guidance, trophic competition, activity-driven refinement and homeostasis. Evolution improves the genome. During its life, the grown brain keeps learning through local plasticity: reward-modulated (dopamine), or since v9 teacher-gated (the next input is the teacher). There's no backprop anywhere.

v7 splits the program into a **task-agnostic engine** and **environments** that plug into it. The bug arena is now just one environment. The long-term aim is other data types, eventually text.

**Design principle:** always work toward the most biologically plausible *and* best-functioning designs: local, developmentally grown mechanisms that also measurably help.

## How BugBrain works now (v41, October 2026)
This section is the current summary. The sections further down are the reference for files and genes, and the round-by-round history
(`Where things stand (round ...)`, `Round ...`) is kept as written at the time, so its "default" and "status" lines are out of date. Full numbers: [RESULTS.md](RESULTS.md); what is being tested next: [PRIORITIES.md](PRIORITIES.md).

**What a brain is.** A few thousand leaky integrate-and-fire neurons (about 3,450 on the sequence tasks at normal size), grown from a cellular genome by local development (morphogens, a gene
network in every cell, axon guidance, trophic competition, juvenile activity and pruning). Nobody wires synapses by hand and there is no backprop.

**The default brain for text and sequences: `deepURSx3`.** One genome (`unifiedR` plus a context chain) grows several regions, depending on the task's signals:
- **cortex**: the current symbol, conjunction / mixing cells, and the prediction cells that drive the outputs. Its prediction cells are the only cells that learn on sequence tasks.
- **three context regions** in a chain: each is driven by the one before it, so together they hold older context (two and more symbols back). They feed the cortex mixing cells. Their wiring is grown, not learned.
- **striatum** (only when the task has a reward / outcome signal, e.g. seqchoice, bandit): action cells that learn from dopamine.

**How it learns during its life (three-factor rules, all local).**
- *Cortex, teacher-gated rule.* The next input symbol is the teacher: when it arrives, its prediction cell gets a short plateau, and every
  synapse from a recently active cell onto it is strengthened by lr x pre-trace (cortex lr **0.2** since v39). Each presynaptic cell keeps a fixed
  total of outgoing plastic weight (`preNorm`; 55 for inputs onto the cortex since v40, was 45), so its weights become "how often did each symbol follow me". Metaplastic consolidation slows the
  learning of cells that have learned a lot, but only down to a floor (`metaCap` 200), so learning never stops over a long life.
  There is **no prediction-miss weakening in the cortex** (`predErr` 0; it hurt long text).
- *Striatum, dopamine rule.* Eligibility traces of pre-before-post timing, turned into weight changes by a dopamine reward prediction error (r - V),
  plus prediction-miss weakening (`predErr` 0.3), which the reward sequence task needs.
- *Readout.* The output is a graded decoder over the prediction cells' spikes with a small learned read-in (`readIn` 0.01, sequence tasks).
- *Optional confidence gate* (`pl.outGate`, off by default): the brain only "speaks" when its winning output is clear enough (share or margin);
  learning goes on either way. When it is sure, it is right about half the time vs about a third overall, and as a writing policy it gives more real words than always taking the top letter or sampling. It does not raise accuracy.

**Engine.** Since v38 the default is the fast engine (`params.fastEngine` 1): the same model computed more cheaply, not bit-identical, checked by
scores on 16 growths per task (no task worse; 2-3x faster on book jobs). Use `P.fastEngine=0` for exact-engine identity checks.

**Tasks used for decisions** (all scored on held-out data / fresh growths): `book` (13 public-domain children's books, 3.3M training letters,
24-symbol alphabet, held-out last 5% of each book; Node / workers only, not loaded by `index.html`), `fables`, `order3` (third-order sequence
memory), `text` (small corpus), `seqchoice` (symbol-to-action pairings learned from reward).

**Where it stands (held-out next-letter accuracy on book text).** v34 0.27 -> v37 0.32 -> v39 0.325-0.33 -> v40 about +0.001 more on book, +0.005 on order3 (16 fresh growths, 10k / 30k-letter lives). v41 adds a cerebellum-like granule layer (2000 cells, each a sparse conjunction of the letters t, t-1, t-2) wired onto the output cells and learned by a cerebellar error rule with a self-silencing gain: book +0.38 points, fables +0.09, order3 / text unchanged, seqchoice identical (16 fresh growths); the brain's own book accuracy rises to about 0.33-0.36 (the granule layer's own readout ceiling is about 0.41, the 3-gram level). A linear readout
trained directly on the brain's own activity reaches about 0.40, so the learning rule leaves room. A "last two letters" counter gets 0.43-0.52.
Generation is babble with some real words (about 56-74% of generated words are real words, depending on the sampling policy).

**Size.** Bigger brains need their wiring scaled to the sheet (`sc.grid`, `sc.maxCells`, and `sc.coneSpeed` / `sc.axonLen`, which are in grid steps):
"4xS" = grid 120, maxCells 13600, coneSpeed 6, axonLen 80; "2xS" = 85 / 6800 / 4 / 57. 4xS gains about +0.02 on book and fables but loses order3
(0.96 -> 0.73) and the reward sequence task; most of the order3 loss comes from more cells in the context regions or the cortex. 8x does not grow
properly yet (cell division and growth time are counted in developmental steps). Longer lives (100k letters vs 30k) add almost nothing at any size.
Size is therefore a run-time choice, not a default. At 4xS the best cortex rate is 0.1, not 0.2.
R71 added size genes, all off by default: `sc.sizeF` scales one region (`sc.sizeF@cortex=4` = cortex-only 4xS), `sc.divRep` lets a cell divide
more than once per developmental step (an 8x cortex then grows fully), and `P.fanRef` / `P.fanRefR` scale a cell's learning rate down by
fanRef / (its plastic input count). With fanRef 450 a 4x cortex keeps lr 0.2 and gets back about half its order3 loss. Seqchoice still collapses at size (RESULTS R71).

**Tried and rejected** (details in IDEAS.md / RESULTS.md): output-side "space bias" fixes, stable letter-pair codes, sparser activity (the cortex
already fires sparsely, ~2% of cells per step), fewer substeps per letter, staged maturation of a big brain, evolution / racing for text,
stronger consolidation knobs (metaCap 100, metaN 80: book up, order3 down), tauPre 8 / 18, plateau 6 (order3 down at lr 0.2).

**How experiments run.** Jobs are JSON files on the `queue` branch; always-on workers (the Linux PC `linux-pc`, the laptop `tacobell`) claim them,
run them and push the results, and update their own code from `neuro/distributed-queue` (see [WORKERS.md](WORKERS.md), [DISTRIBUTED_QUEUE.md](DISTRIBUTED_QUEUE.md)).
A change becomes the default only when it passes on 16 held-out growths with no task worse.

## Run it
Double-click `index.html`. It works offline from `file://`: there's no build step, no server and no module loading. It uses plain `<script src>` files from `js/`. The `js/` folder must sit next to `index.html`.
- **Top bar:** environment selector, ▶ Evolve, fast-forward, which brain to watch, animate, speed, **⚡ Fast mode** (v24), New episode, **⚙ Settings**, and a link to **How the brain grows** (`growth.html`, v16): a short offline page with diagrams. It explains the genome / gene network, morphogens, cell fate, axon guidance, columns, trophic signals, tuning and lifetime learning, the biology behind each, and which mechanisms each default plan uses.
- **Sequence view (v16):** a NOW panel shows the input, the brain's prediction for the NEXT symbol (live in the read window) and the last result (✓/✗). The history table has one column per step: input | prediction made while it was shown | the symbol that came next. It also shows the share of echo predictions (prediction = current input). The current symbol's output cell firing in the network view is the teacher input, not the prediction.
- **Recommended settings by default (v17):** on load, a saved session is restored only if it was saved with the current defaults (`defaultsVersion`, plus the same default plan for its settings). An older save is set aside: the app starts from the recommended settings and shows **↶ Restore previous session**. **Settings → ⟲ Reset to recommended settings** resets everything except the environment and its task choice (e.g. Text corpus). Choosing a task applies its recommended settings: **Sequence prediction → Text corpus** turns on the two-phase clock and 1000 symbols per lifetime (plan predictK2XO since v19; Fables corpus: 2000 symbols). A change of default plan always starts a population from the new plan; the old one can be restored. The never-learning text stub is no longer offered: its entry opens Sequence prediction + Text corpus.
- **Accuracy readout (v17):** the sequence view shows "accuracy so far" and "last 100" (also in the status line).
- **Reset** now watches the starting plan itself. The population holds its mutants, and a broken mutant can echo the current input (RESULTS R17).
- **What the screen shows (v19, one place per number):**
  - the **status line** (top bar) has the key numbers: generation and its progress, the champion's validation fitness (with its regrowth range) and the watched brain's key result (seq: accuracy so far · last 100; memory tasks: pass %; bug arena: score);
  - the **environment canvas** shows the task with little text. Seq: one line of reference numbers (chance, unigram, ideal 1st-order counter, optimal, calibrated bits, echo), the "now" panel, the history table, the learning curve (accuracy per nSyms/20 symbols over the whole lifetime, axes 0–100 %, chance / optimal lines, hollow last point = bin still filling) and the output spikes of the last read window (bars scaled to the largest count, counts printed, green box = the actual next symbol);
  - the **fitness chart** has a legend and, during generation 0, the evaluation progress;
  - **Activity & learning**: the spike raster pools each row over its group (sensors / hidden / outputs, each labelled with its size), so the few output cells of a 1800-neuron brain stay visible; the Outputs panel is hidden when the environment draws its own output spikes (seq, cue, recall);
  - **⚙ Settings** holds the details (evaluation progress, champion regrowth, last generation, the full episode statistics, ticks/s, autosave).
- **🌱 Growth viewer (`viewer.html`, v18):** opened from the top bar or from the Development tab (it then shows the brain you are watching), or by double-clicking `viewer.html` (offline, no server). It can also show each environment's default plan or a brain / session file.
  - **Tissue view, timeline:** a slider scrubs through the 40 developmental steps, then selection, afferent survival, trophic competition, juvenile activity and Hebbian pruning. Play, step and speed controls are included. Every frame is replayed from a passive growth record.
  - **Layers:** any morphogen as a heatmap; cells coloured by address tag, fate or population; axons; growth cones; synapses (excitatory / inhibitory / plastic); removed synapses; deaths (programmed vs trophic / afferent); and sensor, output and column labels.
  - **Navigation:** wheel zoom, drag pan, double-click or F to fit. Rendering is hi-DPI and cached, and big tissues use a pixel-buffer axon renderer, so the 60×60 text brain redraws in under 0.1 s.
  - **Inspector:** click a cell to see its population, fate, tags, threshold (before and after juvenile homeostasis), leak, and in/out partners (highlighted in the view and clickable). It also shows birth / neuron / death steps, lineage, the gene-expression vector and its history, and gene-output decisions.
  - **Wiring diagram:** populations (sensor and output groups, hidden cells grouped by fate and tag) are laid out from sensors on the left to outputs on the right. Edges are sized by synapse count; green is excitatory, red inhibitory, and dashed yellow plastic. Click a node to see its inputs and outputs. **▶ Run brain** overlays live population firing rates.
  - Hover tooltips, a legend and help (`?`) are included. Keys: Space play, ←/→ step, F fit, W switch view.
- **Development tab (v23, simplified):** a one-line caption, the growth of the watched brain (plays once; Play/Replay button and a timeline slider), one **Open full growth viewer** button, and a Details toggle. The environment's default plan is always used (no plan buttons). Brain and Activity tabs likewise show only the picture plus a Details toggle for the numbers.
- **Left:** the environment view and the fitness chart.
- **Right:** Brain, Development, and Activity & learning tabs.
- **Settings drawer (v23, minimal):** the brain should work with little or no intervention, so the drawer has only a few playable variables, each with a tooltip.
  - **Environment:** the key task variables only: Cue-then-turn = delay, trials, rewarded answer; Symbol recall = alphabet, delay, trials, rewarded answer; Sequence = sequence/source, alphabet, Markov p, symbols per lifetime; Bandit = contexts, arms, switch interval, trials, delay; Bug arena = task, ticks, reversal, random colours; Text = characters.
  - **Evolution & learning:** population, mutation rate, lifetime learning on/off, Reset.
  - **Files** and **Detailed stats** (collapsed).
  - Everything else keeps its parameter and code path (tests, legacy pages, session files) but is no longer in the UI; *Reset to recommended settings* restores it.
- **⚡ Fast mode (v24):** a top-bar toggle (remembered in this browser) that switches off all drawing: no canvases, no spike/learning trace recording, no per-frame DOM updates. The watched brain runs as many ticks as fit in each frame; evolution gets a 50 ms budget per frame. A compact text panel replaces the picture and updates 4 times per second.
  - **Sequence prediction:** the last 50 steps as text (input / predicted next / actual, green = right, red = wrong), accuracy so far, last-100 accuracy, symbol n / N, lifetimes completed with an accuracy sparkline and list, ticks/s.
  - **Other environments:** the key score (bandit best arm %, cue pass %, bug score), progress, per-lifetime results; generation / champion when evolving.
  - Switching modes mid-run keeps the brain and the population; results are bit-identical (only display code is skipped). Watched brain: bandit ~16x, text predictK3 ~20x faster; evolution only ~1.05-2x, because Fast-forward already gave it most of each frame (RESULTS R25).
- **Brain tab (v23 fix):** the network picture fits the whole brain into the canvas, including multi-region brains (before, the text brain's context region and its synapses were drawn below the canvas).
- Switching environment starts a new population after you confirm. Sessions and brain files remember their environment.

## Environments
| id | name | inputs → outputs | what it tests |
|---|---|---|---|
| `cue` (default) | Cue-then-turn (memory) | cue_left, cue_right, go, tonic → turn_left, turn_right | A cue flashes on one side (5 ticks), then a delay with no input, then GO. The brain must answer with the cued side, decoded by winner-take-all over response-window spikes. Reward is +1 correct, −1 wrong, −0.5 silent. *Delay* is a slider; the *curriculum* option lengthens the delay whenever the champion passes. v20: **Rewarded answer = random mapping per lifetime**. The rewarded side for each cue is a hidden permutation, so it must be learned from reward alone. GO is then broadcast, and the default plan becomes `rewardE` (v26; was `rewardMemK`). The hidden parameter `wrongCost` 0 makes it reward-only, with no punishment for a wrong answer. |
| `recall` | Sequence: symbol recall | K one-hot symbols, go, tonic → K outputs | The same trial structure with K symbols (default 4, up to 16; the `memoryK` plan works up to 12). Each output sits under its symbol's input. This is groundwork for text. |
| `text` | Text: next-character prediction (stub; no lifetime learning. For learned text prediction, use `seq` with Sequence = Text corpus) | 19 one-hot characters + tonic → 19 outputs | A tiny built-in corpus. The brain predicts the next character by WTA. Reports accuracy and bits per character against a unigram baseline (25%, 3.61 bpc) and a bigram baseline (60%, 1.61 bpc). It runs end to end but doesn't learn much yet. |
| `seq` | Sequence prediction (learned transitions) | K one-hot symbols, go/clock, tonic → K outputs | A stream of symbols with a **new rule every lifetime**: a cycle, a Markov chain (preferred successor with probability p), a second-order pattern, a third-order pattern (`order3`, v19: segments x Y Z s where s depends on x), the text corpus (19 characters) or the **Fables corpus** (v19: six Aesop fables retold in 4270 characters, 24 symbols, corpus bigram 33%). The brain predicts the next symbol. It reports accuracy, accuracy in the first and last quarter of the life (the view shows the learning curve), bits per symbol, chance, an ideal online counter (the best possible first-order learner on the same stream) and the optimal predictor. |
| `bandit` (v20) | Choice: contextual bandit (reward only) | C context cues, 9 broadcast GO copies, tonic → K arms | Each trial shows a context, then GO; the brain picks an arm (WTA over response spikes). The best arm of each context pays with probability 0.9, the others 0.1. The best arms are new every lifetime and change every 60 trials. The view shows the arm bars, the learning curve per 10 trials with the switches, and a reference learner (discounted Thompson sampling). Only reward is given, never a teacher. Default plan `rewardE` (v26; was `rewardK`). |
| `bug` | Bug arena | 9 eyes × 3 colours, tonic, 3 touch, 2 turning → left, right, speed | Tasks: flash (memory), flashvis, hard (predator), normal. Behaviour is identical to v6. |

## Architecture (`js/`, loaded in this order)
| file | role |
|---|---|
| `core/base.js` | `SpikingArena` namespace, RNG, engine params, generic network helpers and stats |
| `core/io.js` | **I/O spec** (`makeSpec`), **encoders** (`Enc.current / oneHot / population / poisson`), **decoders** (`Dec.rateToValue / wta / softmax`), environment registry, body-plan registry |
| `core/develop.js` | cellular development: tissue, morphogens, gene network, axon guidance, trophic competition, refinement, homeostasis; gene MIX (v14, off by default): sparse mixing cells that keep `mixK` random presynaptic cells, with their own leak `mixLeak` and input budget `mixNorm`. It places sensor and output cells from the environment's spec. |
| `core/regions.js` | multi-region brains (v21): every region grows on its own tissue with its own gene program; long-range tracts (`topo`, `claw`, `all`) link them into one network; `g.region` per neuron |
| `core/plans.js` | hand-written body plans v1, v2, v3 (designed for the bug) |
| `core/net.js` | spiking network: LIF, three-factor STDP, dopamine channel; teacher-gated plasticity with presynaptic normalisation (v9); event-driven spike propagation and no wasted eligibility/dopamine loops under the teacher rule (v11, 6–20× faster, bit-identical); metaplasticity (`metaN`) and learned per-cell trust (`trustPow`) for the teacher rule (v12, off by default); receiver-pool gain control / inhibitory pool / noise (`rcvDiv`, `rcvInh`, `rcvNoise`; v13, off by default); post-teacher afterhyperpolarisation of the receivers (`teachAHP`, `teachAHPDur`; v16, off by default); feedforward (APL / Golgi-like) inhibition of mixing cells (`mixInh`; v14, off by default); learned mixing cells: intrinsic homeostatic thresholds (`mixHomeo`, `mixRate`) and a competitive instar rule on their inputs (`mixLr`, `mixN`, `mixPrune`, teacher gate `mixGate`) (v15, off by default; the net keeps its own threshold copy) |
| `core/files.js` | brain files (`spiking-arena-net/v7`), compact genomes, migration of v4–v6 files |
| `core/agent.js` | `Agent` (one brain in one episode) and `runEpisode` |
| `core/evolve.js` | evolution: robust fitness over growths, champion validation, sessions (`spiking-arena-session/v7`) |
| `envs/bug.js`, `envs/memory.js` (cue + recall + plan `memory`), `envs/text.js`, `envs/sequence.js` (env `seq` + plans `predictK`, `predictKL`) | environments |
| `envs/example_echo.js` | the minimal example below. It isn't loaded by default. |
| `ui/devview.js` | growth / wiring visualizer (v18): `DevModel` (populations, partners, lineage from the growth record), `TissueView` (timeline renderer), `WiringView` (population graph), inspector HTML. Used by `viewer.html` and the Development tab |
| `ui/viewer.js` | the `viewer.html` page: brain sources, timeline, layers, inspector, live run |
| `ui/app.js` | the browser UI, which is generic: it draws via the environment's `render` and `outputView` |
| `node_load.js` | loads the same files into Node: `const SA = require('./js/node_load.js')()` |

**Growth record (v18).** `growCell(genome, { record: true })` attaches `brain.devLog`, the input of the viewer. The recorder is passive: it makes no RNG draws and changes no decision, so the brain is bit-identical with or without it (test_core test 14). To keep XL tissues small (about 10 MB for 60×60), it stores events and deltas, not snapshots:
- for each cell: parent, birth, position changes, state changes (class / neuron / inhibitory), an int8 expression history, and its death step and cause;
- for each axon: a flat path of points with step stamps;
- for each synapse: one record (pre, post, step, position, weight, plastic) plus its end step and reason (selection, mix, afferent, trophic, Hebbian prune);
- the fixed morphogens once, and the two emitted ones quantised to uint8 per step;
- juvenile spikes and thresholds per block.

**How growth uses the spec.** Genes never mention "eye 3". Each input and output channel carries an **address tag** (0–8) and a **position** on the tissue edge (x −1 left … +1 right, y −1 back … +1 front). Development places a fixed cell there, and its axon or receptive cone grows from that point. The "sensor cue" morphogen comes from the inputs marked `cue` (or from `cueSources`), and the "motor cue" morphogen comes from the outputs. Hidden neurons find their partners through tag matching and these gradients. So the same genome type grows a brain for any channel layout. A genome grown for one spec can be grown for another, but it usually needs evolving to work there.

**Dev genes (40 outputs per cell):** divide, die, migrate, emit, inhibitory, threshold, plastic, axon, branch, address tags, search tags, guidance weights, collaterals, slow leak, projection, and the new **XSYN** gene. XSYN marks a commissural axon that makes no synapses until it has crossed the midline. Older genomes get XSYN switched off, so they grow exactly as before.

**v8 genes and cell parameters.** All of them are off in older genomes, which grow identically.
- **TOPO** (topographic matching): synapses between TOPO cells, from inputs onto TOPO cells, and from TOPO cells onto outputs are weighted by exp(−(Δlabel/`topoW`)²).
  - A cell's label is its x position at birth.
  - With `topoSnap`, the label snaps to the nearest input channel instead. This is "input-instructed identity": columns become discrete, so channel i → column i → output i emerges for any K.
- **BIF**: the main axon splits into two cones that run in ±x, like parallel fibres.
- **Synaptic scaling** (`normE`, `normI`): each cell's total excitatory and inhibitory hidden input is normalised to a set point.
- **Growth until satisfied** (`satisfy`): an axon with no synapse at full length keeps growing.
- **`branchMax`**: the number of synapses per axon branch.
- **v9: learnable projections.**
  - Gene **RECV** marks a cell as receptive to plastic input. With `plastRecv`, only PLAST→RECV synapses are plastic, and they skip topographic matching: a broad, all-to-all learnable projection.
  - **`coneSpeed`** (v11, cell scale, default 1): growth-cone steps per developmental step, so axons can cross a 60-row tissue in the 40 developmental steps. **`bifAt4`** (default 0 = use bifAt): the split threshold for BIF4 axons.
  - Growth is about 1.3–1.8× faster in v11 (numeric synapse keys, cached reach masks, distance prefilters, no per-step allocation in diffusion), with bit-identical results.
  - **`bifAt`**: a bifurcating axon that seeks signal B grows as a single axon and splits into two parallel fibres only when it arrives there, like a granule-cell T. The fibres make synapses all along their way.
  - **`afferent`**: RECV cells that get no sensory input die (afferent-dependent survival).
  - **`grid`**: tissue resolution (default 24; the large plan uses 36).

**v10: second-order context machinery.** All off in older genomes (they grow identically; checked in `test_core.js`).
- **CLAW** (granule-like conjunctive cells): fast membrane (`clawLeak`), fixed total hidden input `clawNorm` (split half/half between parallel-fibre input and the rest), fixed total sensory/gate input `clawIn`. A claw cell keeps the fibres of **one** source column; the choice is balanced, so claw cells of one territory cover the source columns evenly. With a fast membrane a cell whose input is split between two sources fires only when both are active: a conjunction.
- **BIF4**: a bifurcating axon that splits where signal 4 (not 5) is high. With **XSYN** it makes no synapses before the split, so it feeds only its fibre target band.
- **Diffuse sensors** (env flag `diffuse`): broadcast clock lines that skip topographic matching.
- Plasticity gene **`preLag`** (substeps): the teacher rule uses a presynaptic trace of spikes at least `preLag` substeps old, so the context that was active *before* the teacher event is credited, not the one the event itself recreates.

**Teacher-gated plasticity** (v9; plasticity genes `teach`, `teachThr`, `plateau`, `preNorm`). It is off in all older genomes, which keep reward-modulated STDP.
- When a cell's smoothed input from sensory neurons crosses `teachThr`, it has a **teacher event**: an instructive input, like a climbing fibre.
- During the next `plateau` substeps, each of its spikes potentiates its plastic inputs by lr × the presynaptic trace.
- Every presynaptic cell keeps the sum of its plastic weights at `preNorm` (heterosynaptic competition). Its weights therefore track how often each target followed it.
- **Hunger** (`hunger`, `hungerRate`, `hungerTarget`, `hungerRelax`, `hungerLam`): need-based attraction.
  - An output with fewer than `hungerTarget` excitatory input synapses builds up a need over developmental time, and so does a sensor with fewer than `hungerTarget` targets. The need resets once satisfied.
  - Needy outputs emit an attractant that pulls growing excitatory axons, and tag matching is relaxed in proportion to the need. Needy sensors relax their matching and keep growing.
  - UI toggle: *hunger signals*.
- **Request** (`request`, `reqDelay`, `reqDecay`): the activity-timed variant.
  - During axon growth, sensors fire spontaneously, and the cells they reach get a decaying eligibility trace.
  - `reqDelay` steps later, the outputs paired with that sensor emit a decaying request. The pairing comes from `spec.juvenile.pairs`; cue and recall pair symbol i with output i. Without pairs, every needy output requests.
  - Eligible axons are pulled towards requesting outputs and their matching is relaxed.
  - UI toggle: *activity-timed requests*.

Each tick of `Agent.tick()` does five things:
1. `task.sense(ext)` writes input currents (encoders).
2. Output biases are added.
3. The network runs 4 substeps.
4. `task.act({rates, spikes})` decodes the outputs and returns `{pos, neg, pain, reward}`.
5. `net.modulate(pos, neg, pain)` releases dopamine for plasticity.

## How to add a new environment
1. Create `js/envs/myenv.js` (complete version: `js/envs/example_echo.js`):
```js
(function () {
  const { registerEnv, Enc, Dec, mulberry32 } = SpikingArena;
  class EchoTask {                                   // one episode
    constructor(seed, P) { this.P = P; this.rng = mulberry32(seed); this.t = 0; this.horizon = P.ticks;
                           this.rewardLog = []; this.hits = 0; this.light = 0; }
    get done() { return this.t >= this.P.ticks; }
    sense(ext) {                                     // inputs -> currents
      if (this.t % 20 === 0) this.light = this.rng() < 0.5 ? 1 : 0;
      Enc.current(ext, 0, this.light, this.P.gain);  // channel 0 = 'light'
      Enc.current(ext, 1, 1, 1.5);                   // channel 1 = tonic drive
    }
    act(out) {                                       // output spikes -> action, reward
      const on = Dec.wta(out.spikes, [0]) === 0, ok = on === (this.light === 1);
      this.t++; if (ok) this.hits++; const reward = ok ? 0.01 : -0.01; this.rewardLog.push(reward);
      return { pos: ok && on ? 1 : 0, neg: ok ? 0 : 1, pain: 0, reward };   // pos/neg drive dopamine
    }
    fitness() { return 10 * this.hits / this.t; }    // what evolution maximises
    score()   { return this.hits / this.t; }         // what the reports show
    stats()   { return { accuracy: this.score() }; }
    statusLine() { return `light ${this.light} · accuracy ${(100 * this.score()).toFixed(0)}%`; }
    render(ctx, W, H) { ctx.fillStyle = this.light ? '#ff0' : '#222'; ctx.fillRect(0, 0, W, H); }
  }
  registerEnv({
    id: 'echo', name: 'Echo: light on -> lamp on', description: 'Fire the lamp while the light is on.',
    view: { w: 400, h: 300 },
    params: { ticks: { value: 400, min: 100, max: 2000, step: 100, label: 'Ticks per episode' },   // become UI sliders
              gain:  { value: 10, min: 0, max: 30, step: 1, label: 'Input gain' } },
    io: P => ({ inputs:  [{ name: 'light', group: 'sense', tag: 1, pos: [0, 1], cue: true },
                          { name: 'tonic', group: 'tonic', tag: 7, pos: [0.5, 1], tonic: true }],
                outputs: [{ name: 'lamp', group: 'motor', tag: 4, pos: [0, -1] }] }),
    create: (seed, P, spec) => new EchoTask(seed, P),
    defaultPlan: 'v1',                               // starting genome: 'v1', 'v2', 'v3', 'memory' or your own registerPlan(...)
  });
})();
```
2. Add `<script src="js/envs/myenv.js"></script>` to `index.html`, before `js/ui/app.js`. Add `'envs/myenv.js'` to `FILES` in `js/node_load.js`.
3. Reload. The environment appears in the selector, and its params appear in the Settings drawer.

**Rules for an environment:**
- Keep everything deterministic from `seed`.
- `act` must advance `t` and eventually set `done`.
- Use tags 4 or 5 for outputs.
- Booleans in `params` become checkboxes, and `options: {value: label}` becomes a dropdown. `hidden: true` keeps a parameter out of the UI.

**Optional hooks:**
- `outputView()` returns labelled output bars.
- `juvenile` in the spec defines spontaneous activity during development.
- `onGeneration(evo)` supports curricula.

## Body plans (starting genomes)
- **predictK3** (v21, default for text, fables and order3 = with the three-phase clock): the first **multi-region** plan, a context cascade.
  - Region *cortex* = predictK2XO (current symbol M, previous symbol M2, conjunctive C, mixing G, prediction P).
  - Region *context* = the same gene program with its front end only: a shift register whose M2 holds the symbol **two steps back** (M3).
    Its input is a `topo` tract from the cortex M2 (copied on the env's GO2), reset by GO3 (the three-phase clock `clock3`).
  - Tract M3 → cortex mixing cells (`claw`, weight 30; cortex mixing target rate 0.008): the mixing cells now see (current, previous, two-back).
- **rewardKR / rewardMemKR** (v21, not default): rewardK / rewardMemK as two regions, *cortex* (state or memory columns) and *striatum*
  (action columns, outputs), linked by a plastic corticostriatal tract. They learn from reward but stay below the single tissue (RESULTS R22c).
- **v1:** feed-forward "French flag", sensor → hidden → motor.
- **v2 / v3:** add recurrent M and X populations for the bug.
- **rewardE** (v26, default for `bandit` and cue/recall with the random mapping): the rewardMemK body plan with gene values found by evolution (R26 overnight multitask run, generation 318; RESULTS R27). Same developmental machinery and learning rule, different numbers. 16 held-out growths: bandit 6.80 vs 5.28 (rewardK), cue random 9.68 vs 4.79, recall random 1.37 vs −3.25 (rewardMemK). Caveat: with `wrongCost` 0 (no punishment) it is weaker than rewardMemK.
- **rewardK** (v20, hand plan; was the default for `bandit`): an actor-critic, learning from reward alone within a lifetime.
  - State columns M relay the cue. Their parallel fibres reach every action column P (one per output: `sc.topoOut`) through plastic synapses.
  - The P columns compete through shared inhibition and adaptive thresholds. Each has one slow noise source, which is the exploration (`actNoise`), scaled by 1/(1 + 5V) (`actNoiseV`). The chosen output excites its own column and inhibits the others (`actFb`, `outInh`).
  - A critic value cell reads the state cells. Dopamine is the reward prediction error r − V at each outcome (`rpe`, `rpeMode 1`), and it gates reward-modulated STDP with eligibility traces.
- **rewardMemK** (v20, hand plan; was the default for cue/recall with the random mapping): rewardK with working-memory state columns (self-exciting, reset by GO, as in memoryK).
- **v3h** (v8): plan v3 + hunger. In plan v3 the speed motor gets no input in every growth; v3h wires all motors.
- **predictK** (v9, default for `seq`): transition learning.
  - memoryK's columns M hold the current symbol, and GO resets them.
  - A band of **prediction columns P** (TOPO, RECV) sits behind them. Each P column receives its own symbol's input as the teacher and drives its own output.
  - M axons descend into the P band and split into parallel fibres that cross every P column. These are plastic and all-to-all, for any K.
  - When the next symbol arrives, its P column gets a teacher event while the memory of the previous symbol is still active, so M(previous)→P(next) is strengthened. In the prediction window, M(current) drives P(most likely next).
  - Works up to about 12 symbols.
- **predictK2** (v10, default for `seq` with *Two-phase clock* on): second-order context, for any K up to ~8.
  - The env's two-phase clock sends GO2, then GO1, before each symbol.
  - **M** holds the current symbol (reset by GO1). **R** (copy relay, claw cells gated by GO1) copies M into **M2** just before M is reset; **X2** (inhibitory claw cells, gated by GO2) resets only the active M2 column. So M2 holds the previous symbol.
  - **C** (conjunctive claw cells): each gets one M column (topographic) and one M2 column (balanced claw choice), so every (previous, current) pair has 3–5 cells. Their parallel fibres reach every prediction column P through teacher-gated plastic synapses (`preLag` 8).
  - order2 K=6: last-quarter accuracy 1.00 (first-order limit 0.75); order2 K=8: 0.87. Weaker than predictK on noisy first-order chains (markov 0.63 vs 0.71).
  - **predictK2L** is the 36×36 version. It grows, but it does **not** learn text (too few cells per column; RESULTS R11c).
  - **predictK2XL** (v11, default for `seq` with Text corpus or K > 12 *and* the two-phase clock): a 60×60 tissue. It uses coneSpeed 3, M2 only 2 rows, `mBif: 0` (M fibres don't split in C, so the bottom C row keeps M-only cells: a first-order path summed with the M×M2 cells), `x2coll: 5` (collaterals keep X2 alive), `bifAt4: 1.8`, and lr 0.03.
    - Text, 1000 characters: last quarter 0.587, which matches the ideal first-order counter (0.585). Calibrated 2.40 bits per character.
    - Growth takes ≈ 3 s and a 1000-character life ≈ 4 s.
  - New plan knobs for `createPredict2Plan` (v11): `mBif`, `x2coll`, `coneSpeed`, `bifAt4`, and `sc: {...}` (any cell-scale override).
  - **predictK2XT** (v12; the default for `seq` with Text corpus or K > 12 *and* the two-phase clock): predictK2XL plus two new plasticity genes and a lower P threshold (`metaN 40, lr 0.1, trustPow 2, pThr −2`).
    - Text, 1000 characters (8 growths): last quarter **0.650**, above the corpus bigram (0.598) and the ideal first-order counter (0.584). Calibrated 2.15 bits per character.
    - **metaN** (metaplasticity): each presynaptic cell's teacher-rule step shrinks as metaN / (metaN + E), where E is the potentiation the cell has already received. Its normalised weights become running averages (counts) instead of a fixed-rate recency average.
    - **trustPow** (learned trust, with `trustRef` 0.5, `trustMax` 4, `trustN` 200, `trustDelay` 2, `trust0`): at each teacher event, every recently active cell measures the share of its plastic output weight that lands on the taught cells. It keeps a running mean of that share and scales its output budget by min(trustMax, (trust/trustRef)^trustPow). Reliable, context-specific cells then outvote flat ones; it is a local per-path trust.
    - **confPow** (scale the budget by the sharpness of the cell's own weights) is also there, but off: it measures sharpness over P cells rather than columns and helps less.
    - Plan knob `pThr`: threshold gene of the P band.
  - **predictK2XN** (v13): predictK2XT plus **divisive normalisation** of the prediction cells' plastic input (`rcvDiv 0.4, rcvSig 20`).
    - Each receiver's plastic input is multiplied by rcvDiv · nRecv / (rcvSig + total plastic input to the pool). Total drive stays about constant, so the relatively strongest prediction fires even when all are weak.
    - Text, 1000 characters (8 growths): last quarter **0.673**, 2.03 bits per character. With the graded decoder `readIn 0.01`: **0.686**, 2.00 bits.
    - Also available, off by default: `rcvInh` (+ `rcvInhTau`), a shared inhibitory pool (soft winner-take-all; it hurts here because it fights the teacher), and `rcvNoise`, membrane noise in the receivers.
  - **predictK2XM** (v14): predictK2XN plus a **mixing layer** G (about 360 granule / Kenyon-like cells between C and P; the stack moves up 6 rows to make room).
    - Each G cell keeps 4 random C inputs (`mixK 4`) and has a fast membrane (`mixLeak 0.5`) and a fixed input budget (`mixNorm 80`). Feedforward inhibition (`mixInh 0.5`) keeps it sparse: 1.2% active per symbol, covering 97% of symbols. G sends teacher-gated plastic fibres to P alongside C.
    - Text, 1000 characters (8 growths): last quarter **0.697**, 2.01 bits per character; with `readIn 0.01`: **0.708**, 2.00 bits.
    - Ablation: silencing G costs at most 0.006, so most of the gain over predictK2XN comes from the new geometry rather than the mixing itself. The simulation is about 30% slower (RESULTS R15).
  - **predictK2XO** (v19; the default for text and fables with the two-phase clock): predictK2XG with the plan constant `clawOwn`: an inhibitory claw cell keeps its OWN column instead of a balanced choice, so each X2 reset cell is driven by its own symbol and resets its own M2 column. In XG about half of the 24 M2 columns were stuck or never loaded (X2 cells wired to other columns).
    - Text, 1000 characters (12 growths, paired): last quarter **0.764** vs XG 0.711 (+0.053 ± 0.010), calibrated **1.62** bits vs 1.95; ideal 2nd-order counter 0.790. Fables 2000: 0.325 vs 0.286 (ideal 1st-order counter 0.324).
    - Silencing M2 costs −0.21, silencing X2 −0.19: the second-order memory is used. Cycle, Markov unchanged, order2:6 1.00; order3:8 stays at the order-2 limit (RESULTS R20b).
  - **predictK2XG** (v15; the text default in v15–v18): predictK2XM whose mixing cells have an **intrinsic homeostatic threshold** (`mixHomeo 0.5`, target `mixRate 0.002` spikes per substep). Silent cells become excitable and promiscuous ones selective.
    - Text, 1000 characters (32 growths): last quarter **0.72** (predictK2XM 0.69), about 1.9 bits per character. Silencing the mixing layer now costs 0.035.
    - Each mixing cell's read-phase spikes predict the next symbol better than the current symbol does (0.755 vs 0.643).
    - The competitive synaptic rule (`mixLr`, with pruning, consolidation or teacher gating) did not help (RESULTS R16).
  - **predictK2XS** (v15): the predictK2XM layout without the mixing layer (the G band dies, plan knob `gap`). About 30% faster but 0.02 below predictK2XM on text.
  - The `seq` decoder option `readIn` (hidden env param, default 0) adds readIn × each output cell's summed synaptic input to its spike count: a graded, subthreshold readout. A small value just breaks ties. `Agent` reports that input as `out.input`.
- **predictKL**: the same genome on a 36×36 tissue, with room for about 20 symbols (text). The `seq` env picks it as the default plan when Sequence = Text corpus or K > 12; the UI switches automatically.
- **memory:** designed for cue-then-turn (the v7 default; v8 defaults to memoryK). Each side has one progenitor:
  - *M cells* (lateral): excitatory, slow-leak, recurrent self-excitation. They receive the cue and drive their own side's output.
  - *X cells* (medial): inhibitory. Their commissural (XSYN) axons cross the midline and inhibit the other side's M.

  Together this is a bistable left/right latch. It grows about 75 hidden neurons and about 580 hidden→hidden synapses. About 45% of growths fail (see RESULTS R9a).
- **memoryK** (v8; the default for cue and recall): generic K-way working memory. About 105 hidden cells grow:
  - **M band** (front): slow excitatory TOPO cells. Each one snaps to the identity of the nearest input, so K columns form, each excited only by its symbol. Each column re-excites itself, normalised by synaptic scaling, and drives the output underneath it.
  - **X pool** (back, centre): inhibitory, with BIF parallel fibres. GO drives the pool, which silences every column after the answer. The answer is the last burst of the active column.

  Nothing depends on K. With delays of 10–80 the pass rate is 1.00 for cue and about 0.99 for K=4, 8 and 12, and fewer than 2% of growths fail. K=16 is beyond the tissue resolution.

## Evolution
- Every genome is grown with K noise seeds (*Growths*, default 3). Fitness = (1 − w)·(mean − λ·sd) + w·worst over growths, with λ = 0.5. *Worst-growth weight* w defaults to 0; 0.5 punishes genomes whose growths sometimes fail.
- The top genomes are revalidated on held-out regrowths (default 10, up to 20) × held-out episodes.
- **Impose bilateral symmetry** (`cellMirror`, code only since v23) is a fallback: the right side copies the left.
- Learning (STDP + dopamine, or teacher-gated) happens within a life and never writes back into the genome. The teacher-gated rule's genes aren't mutated: they are set by the plan.

## Files and formats
- **Session** (`spiking-arena-session/v7`; v8 writes the same format): environment, environment params, engine params, population, champion and history. v1–v6 cellular sessions import as **Bug arena** sessions.
- **Brain** (`spiking-arena-net/v7`): neurons and edges plus `developmental_genome`, `environment` and `envParams`. Importing one switches to its environment. v4–v6 brains open as Bug-arena brains, and v6 champions score exactly as in v6.
- **Not supported:** direct, recipe and mushroom-body (non-cellular) files. Open those in `legacy/index_v4_legacy.html`.
- **Version stamps (v17):** sessions also store `appVersion`, `defaultsVersion` and `defaultPlan`. A set-aside session lives under the browser key `spikingArena.session.prev`.
- **Saved sessions:** v7 saves under its own browser key. Your v6 auto-saved session is read once and never overwritten.
- `legacy/v6/` keeps the complete v6 (`index_v6.html` and its scripts). `legacy/v7/` … `legacy/v17/` keep v7 to v17 (`index.html`, `js/` and the scripts).
- `legacy/v26/` and `legacy/v35/` keep v26 and v35 (v35 = the R53 defaults; in the current app the v35 brain is plan `deepURSx3v35`, reproduce v35 numbers with the seq param `readIn` 0). v36 (R62): deepURSx3 without prediction-miss LTD, capped consolidation (`pl.metaCap` 200), graded decoder (`readIn` 0.01) on the three-phase-clock tasks. v37 (R64): deepURSx3 = v36 + cortex `pl.lr` 0.1 + striatum prediction-miss LTD (`predErr` 0.3, as v35); the v36 brain is plan `deepURSx3v36`. v38 (R69): same brains and rules, the fast engine (`params.fastEngine` 1, R66) is the default; the exact engine is `P.fastEngine=0` (use it for bit-identity checks and exact-engine fingerprints).
- v7 recall brains and sessions keep their old output row, because `outLayout: 'v7'` is set on import. They score exactly as in v7.

## Headless scripts (Node 18+)
- `node test_core.js` (about 45 s): every environment grows, runs, evolves and round-trips. It also checks:
  - legacy files are rejected;
  - v6 compatibility against `legacy/v6/index_v6.html`: identical growth and identical bug scores;
  - v7 compatibility against `legacy/v7/`: identical growth and scores for the memory plan, the text plan and the v7 champions;
  - memoryK passes cue, and recall with K=4 and K=8;
  - v8 compatibility against `legacy/v8/`: identical growth and scores for v8/v7 champions and plans;
  - `predictK` learns a K=6 cycle within a lifetime, and can't without plasticity;
  - `predictK2` (two-phase clock) learns order2 K=6 past the first-order limit (the whole test now takes about 85 s).
  - the growth recorder is passive (identical W / thresholds / leak with and without `record`) for the four default plans, and the viewer model builds (v18).
- `node experiment.js GENS SEEDS name=key:val,...`: parallel evolution runs. Each key goes to the environment's params if it has one, otherwise to the engine params. Each champion is regrown with 10 fresh noise seeds and scored on 20 held-out episodes.
  - Example: `node experiment.js 40 1,2,3 mem=env:cue,cellStart:memory,delay:20 v1=env:cue,cellStart:v1,delay:20`
  - Environment variables: `SAVE_DIR`, `LOG` (interim lines), `NTEST`, `NREG`, `FROZEN=1`. The table also shows `fail`: the fraction of regrowths that pass below 0.9.
- `[ENV=cue] [PLAN=memory] [DELAY=20] node memory_test.js [brain.json ...]`: does the brain use memory? It scores the brain intact, without hidden→hidden synapses, without recurrent excitation, without inhibition, with slow cells at normal leak, and memoryless (hidden state cleared every tick). `K=` sets the symbol count for recall.
- `[ENV=..] [PLAN=..] node cell_test.js [brain.json]`: developmental robustness and mechanism ablations.
- `[ENV=cue] [K=4] [DELAY=20] [PLAN=memory] [NG=100] [NE=2] [MIRROR=1] [SC='{"normE":40}'] node growth_test.js [brain.json ...]`: growth reliability. It prints the share of failed growths (pass < 0.9), split into silent and wrong. It also compares the structure of failed and working growths: cells reached by inputs, cells driving outputs, left/right imbalance, recurrent excitation and inhibition, axons without synapses, and trophic deaths.
- `[ENV=recall|cue] [K=8] [NG=40] node ablate_memoryK.js`: mechanism ablation of the memoryK plan.
- `[CASES='cycle:4,cycle:8,markov:8,order2:6,text'] [NG=6] [NS=200] [PLAN=predictK|predictKL|predictK2|predictK2L|predictK2XL|predictK2XT|predictK2XN|predictK2XM|predictK2XS|predictK2XG] [TUNE='{"rule":"rstdp"}'] [PP='{"det":0.8}'] [NOLEARN=1] node seq_test.js [brain.json]`: sequence prediction: accuracy (whole life, first and last quarter), bits (fixed softmax), **calSoft / calCount** (calibrated readouts, v10: softmax temperature + floor, or spike counts + smoothing, chosen online by follow-the-leader on past symbols only), **idealBits** (online first-order counter, add-½), chance, ideal counter, first-order optimum and optimal. The K2 plans switch the two-phase clock on.
- `node browser_test.js` (about 2 min; puppeteer-core + Chrome, `PUPPETEER=` / `CHROME=` to point at them): headless-browser regression test of the sequence/text view as a user sees it. It checks the recommended Text setup, records the history-table rows of one full 1000-character lifetime (green = predicted equals actual; actual = next input), and requires green ≥ 0.55 overall, ≥ 0.60 in the last 100, and an improving learning curve. It also checks that an older saved session (`results_v17/fixture_old_session_v16.json`) isn't restored silently, that Restore / Reset to recommended work, and that the text stub entry redirects. v20 (section F): the bandit runs with its default plan (rewardE since v26), the critic line and value trace are drawn in the Activity tab (`screenshot_ui_bandit.png`), and cue with the random mapping switches to rewardE.
- `[SHOTS=dir] node viewer_test.js` (about 30 s; puppeteer-core + Chrome): headless test of the growth viewer. For the default plans of bug, cue, recall and text it checks that there are no page errors, draw times, timeline scrub and play, wheel zoom, drag pan, fit, hover tooltip, cell-click inspector, wiring-node click and Run brain. It also checks the Development tab and its Open growth viewer hand-off. `SHOTS` saves the screenshots.
- `results_v20/` (round 21):
  - `[ENV=bandit|cue] [PP='{...}'] [PLAN=rewardK] [TUNE=..] [PL=..] [NG=8] [S0=11] [FROZEN=1] [VARS='{"name":{"PL":{"rpe":0}}}'] node results_v20/rl.js`: reward-learning runs; one lifetime per growth, averaged stats.
  - `[FILES=..] [NA=32] [VARS=..] node results_v20/bug.js`: bug champions with random colours, normal vs swapped arenas.
  - `eqv19.js`: bit-identity vs `legacy/v19` (the v19 app).
- `node results_v18/eqv17.js`: bit-identity check of v18 vs `legacy/v17`.
- `results_v19/` (round 20): `ngram.js` online ideal counters of order 1–4; `[SRC=text|fables|order3:8] [NS=1000] [NG=8] [S0=40] [BASE=predictK2XG] [VARS='{"XO":{...}}'] [J=threads] [ABL=...] node results_v19/cmp.js` paired plan comparison with the ideal counters and band ablations; `feat.js` offline readouts of band activity; `m2diag.js` M2 correctness per column. `eqv18.js` checks that v19 grows and scores old plans bit-identically to `legacy/v18` (ALL IDENTICAL). `legacy/v18/` is the v18 app.
- `node results_v17/eqv16.js`: bit-identity check of v17 vs `legacy/v16`.
- `node results_v16/eqv15.js`: bit-identity check of v16 vs `legacy/v15`.
- `[BASE=PREDICT2_XG] [TUNE='{"teachAHP":3}'] [PP='{"readTicks":3}'] [NG=8] [S0=1] node results_v16/echo.js`: "one letter behind?" diagnosis. It prints output spikes per slot phase for the current, next and previous column. It also prints how often the scored prediction equals the next, the current or the previous symbol, next to corpus base rates and the ideal first- and second-order counters (first and last quarter).
- `[NM=12] [TUNE=..] [PP=..] node results_v16/mutants.js`: accuracy and echo of plan mutants (what the UI shows during evolution).
- `node results_v15/eqv14.js`: bit-identity check of v15 vs `legacy/v14`. `[BASE=PREDICT2_XG] [TUNE='{...}'] [PP='{"readIn":0.01}'] [S0=20] [NG=8] node results_v15/cmp.js`: text accuracy, bits, ticks/s and growth time on fresh seeds.
- `node results_v14/eqv13.js`: bit-identity check of v14 vs `legacy/v13`. `[PP='{"readIn":0.01}'] [NG=8] [MODES=full,noG,noC] [TUNE='{...}'] [S0=1] node results_v14/ablate_mix.js`: mixing-layer ablation with G sparsity and coverage, plus G selectivity (context purity and next-symbol accuracy of G spikes; v15). Set `TUNE='{"mixHomeo":0.5}'` for predictK2XG. `[TUNE='{...}'] node results_v14/mix.js`: offline estimate of what random mixing could add to the readout.
- `node results_v13/eqv12.js`: bit-identity check of v13 vs `legacy/v12`. `[PP='{"readIn":0.01}'] [BASE=PREDICT2_XN] [TUNE='{...}'] node results_v13/wread.js`: the linear readout of the net's own weights vs its spiking output.
- `node results_v12/eqv11.js`: bit-identity check of v12 vs `legacy/v11` (same checks, including predictK2XL). `[TUNE='{...}'] [NG=2] node results_v12/feat.js` / `wread.js`: record the C-cell spike sets and score idealised readouts on them (feature counters, sharpness / trust weighting, pattern key; linear readout of the net's own weights vs its spiking output).
- `node results_v11/eqv10.js`: bit-identity check of v11 vs `legacy/v10` (growth, thresholds, episode stats, spike counts, final weights and potentials). `node results_v11/bench.js` / `bench_xl.js`: growth time and ticks/s (`ROOT=legacy/v10` for the old version).
- `[NG=30] [NE=2] [CASES=bug:v3,recall8:memoryK,cue:brain.json] [VARS='{"off":{},"h":{"hunger":1}}'] node hunger_test.js`: orphan outputs, silent inputs, failed growths and score, with hunger/request variants.

Results are in `RESULTS.md`. Evolved brains are in `champions/`: `v8/` evolved from the memory and memoryK plans, `v7/` cue-then-turn (`cue-*`) and symbol recall (`recall-*`), `v6/` bug flash, `v5/` bug hard, `v4/` bug normal.

## Running long experiments locally (v25)

(Also new in v25: the sequence history table and the fast-mode panel show two rows, **input** and **prediction**. Each prediction sits under the input symbol it predicted: green = right, red = wrong. The first column is blank.)
Headless evolution for overnight / multi-day runs on your own PC: Node 18+ or Bun, no npm packages, Windows-safe paths. All workers evaluate genomes in parallel; results are reproducible (the same config and seed give the same numbers with any worker count, and after a resume).

**Windows quick start** (in the project folder, cmd or PowerShell; the helpers use Bun if it is installed, otherwise Node):
```
run.bat selftest                                   quick check (~1 min)
run.bat bench                                      Node vs Bun on this PC + recommendation (~5 min)
run.bat experiments\multitask.json --smoke         tiny 2-generation test of a config (~1 min)
run.bat experiments\multitask.json                 the real run (stops after the config's "hours")
run.bat experiments\text_baseline.json --hours 8 --workers 6
run.bat --resume results\2026-10-12_220500_multitask      continue after a stop / reboot
run.bat report                                     table of all runs
```
PowerShell: `.\run.ps1 ...` with the same arguments; if scripts are blocked, use `powershell -ExecutionPolicy Bypass -File .\run.ps1 ...`. Anywhere else: `node run/runner.js experiments/multitask.json` or `bun run/runner.js ...`.

- **Stopping:** Ctrl+C once finishes the current generation, saves and stops; Ctrl+C twice quits at once, and the checkpoint of the last finished generation stays. Creating a file named `STOP` in the run folder also stops it after the generation.
- **Options:** `--hours H`, `--gens N` (total generation count, also on resume; 0 = no limit), `--workers N` (default: logical cores − 1, i.e. 7 on an i5-1135G7; 0 = no worker threads), `--pop N`, `--seed N`, `--name NAME`, `--out DIR`, `--smoke`.
- **Modes** (the config's `"mode"`):
  - `standard`: the app's robust fitness. Each genome is grown `growths` times with seeds shared by the generation, and fitness = mean − robustW·sd. The top genomes are revalidated on held-out growths, and the best becomes the champion. Selection: elites, tournament, crossover, mutation.
  - `novelty`: selection uses (1 − w)·fitness + w·novelty. A behaviour descriptor per genome (e.g. `bandit.optimal`, `cueR.pass`, `brain.logSynapses`) is compared with an archive.
  - `map-elites`: a grid over 2 descriptors, keeping the best genome per cell.
- **Multi-task fitness:** `"tasks"` is a weighted list of environment configs. Each task's fitness is normalised as (f − lo)/(hi − lo); `"ref": "auto"` uses the env's default plan on the validation seeds as 1.0 (or give `{ "lo": .., "hi": .. }`).
- **'free' genomes** (`"start": ["free:reward"]`): the actor-critic plan's structural constants are bounded, evolvable genes (`run/free.js`). They are: column seed counts, tissue size, band positions, wiring weights, memory on/off, 1 or 2 regions, tract weight and density. A structural mutation (probability `free.pStruct`) rebuilds the cellular genome from the plan; otherwise the cellular genome mutates as usual. A `predict3` space (w3, gain, mixing rate) exists too.
- **Example configs** (`experiments/`):

  | config | what it runs |
  |---|---|
  | `text_baseline.json` | (a) predictK3 on text |
  | `multitask.json` | (b) text + order3 + bandit + cue-reward from predictK3 / rewardE / rewardMemK; balanced fitness (`"combine": {"type": "softmin", "tau": 0.25, "cap": 1.5}`: each task capped at 1.5× its reference, soft minimum over tasks, so no task can be traded away; `"mean"` and `"min"` also accepted) |
  | `novelty_free.json` | (c) novelty search with free actor-critic genomes |
  | `mapelites_free.json` | (d) MAP-Elites with free actor-critic genomes |

  Each config has a `"smoke"` block with short lifetimes for `--smoke`.
- **Output:** `results/<date>_<name>/` contains:
  - `config.json`, `version.json` (APP_VERSION, runtime, file hashes), `log.txt`;
  - `generations.csv`: per generation the best / mean / median (normalised), the champion, per task best / mean / median / champion raw fitness, novelty, archive, coverage, QD score, ticks/s;
  - `champions/gen_NNNNN.json` every `championEvery` generations + `champion_final.json`: brain files that open in index.html (Settings → Import) or viewer.html;
  - `checkpoint.json` and `summary.json`.

  One line per finished or stopped session goes into `results/index.csv`. `run/report.js` prints a table of all runs; it reads every summary.json, so killed runs are listed too.
- **Dashboard:** open `dashboard.html` (offline) and pick the `results` folder (or single files).
  - It shows the run table and charts per task over generations (champion, best, mean, novelty / archive, MAP-Elites coverage, ticks/s).
  - Each champion has buttons to open it in the growth viewer or the arena (handed over through localStorage).
- **Speed:** the runner loads the engine into each thread directly (`run/engine.js`), not through a `vm` context as the tests do; in Node that is ~6× faster. On this 8-thread box Bun was faster than Node 20 (RESULTS R26); run `run.bat bench` on your PC to check. A run should stay with one runtime: results are bit-identical within a runtime, and Node and Bun also matched in all checks so far.
- `node run/selftest.js` checks that the runner's fitness equals the app's Evolution fitness bit for bit, the RNG / resume, and that free genomes build and grow. `node dashboard_test.js` checks the dashboard in headless Chrome.

## History: where things stood (round 24, v23)
- **Two-region actor-critic** (rewardKR / rewardMemKR; RESULTS R24): the cortex region now grows its whole gene program, with no band killed.
  Its action band finds no outputs and dies late, so the state columns develop as in the single tissue.
  - Bandit best arm: 0.546 → **0.620** (single tissue 0.653); 2nd half of blocks 0.831 (single 0.790); silent trials 35 → 24 (single 14).
  - Cue: pass 0.698 (single 0.855). It fails in 3 of 8 growths.
  - Not the default. A D1/D2 pathway and a separate dopamine-nucleus region are still to try.
- **Simpler UI:** the Development tab shows a caption, the growth animation (plays once; Play/Replay and a slider) and one Open full growth
  viewer button. Brain and Activity tabs keep only the picture, with numbers behind Details.
- **Minimal Settings drawer:** removed from the UI: plan buttons and the starting-plan selector, the six growth-mechanism checkboxes (trophic, refinement, homeostasis, mirroring, hunger, request), fitness-shaping sliders (growths, episodes, λ, worst-growth weight, validation regrowths), leak and substeps, Seed buttons, and per-task timing/cost knobs (e.g. two/three-phase clock, symbol/prediction ticks, dopamine-dip costs, curriculum, penalties, sensor toggles). The code paths stay.

## Where things stand (round 23, v22)
- **One learning rule** (gene `uni`, parameter set `UNIFIED_PL`; RESULTS R23): dw = lr · M · e. The third factor M depends on the target cell.
  A cell contacted by an instructive (topographic) sensor learns from its climbing-fibre-like plateau, applied to the fresh eligibility.
  Every other plastic cell learns from the global dopamine RPE of a critic, applied to slow eligibility traces (lazy decay).
  The same genes and one parameter set are now the default in predictK3, rewardK and rewardMemK (`DEFAULTS_VERSION` 20).
  The circuit genes (gain control, action loop) stay plan-specific. Last quarter / best arm / pass, separate rules vs unified:

  | task | separate | unified |
  |---|---|---|
  | order3 (predictK3) | 0.970 | 0.968 |
  | text (predictK3) | 0.773 | 0.769 |
  | bandit (rewardK) | 0.653 | 0.653 |
  | cue, random mapping (rewardMemK) | 0.855 | 0.855 |

  The variant that also let dopamine act on taught cells failed: seq accuracy collapsed and runs were 20× slower.
  Plans accept `separate: true` to get the v21 rules back. Old genomes are bit-identical (`results_v22/eqv21.js`). Script: `results_v22/uni.js`.

## Where things stand (round 22, v21)
- **(A) Context cascade, predictK3** (RESULTS R22a/b): last quarter, mean of growths.
  | task | predictK2XO | predictK3 | M3 tract cut | reference |
  |---|---|---|---|---|
  | order3, K 8, 600 symbols | 0.747 | **0.970** | 0.747 | 2nd-order limit 0.787 |
  | text, 1000 symbols (8 new growths) | 0.763 | **0.772** | 0.730 | ideal 2nd / 3rd order 0.790 / 0.845 |
  | fables, 2000 symbols | 0.317 | 0.321 | – | 1st-order counter 0.326 |
  The third step is used (cutting the tract drops order3 exactly to the XO level). Text gains a small, replicated +0.01; fables does not move.
  Text, fables and order3 now recommend the three-phase clock, so their default plan is predictK3 (`DEFAULTS_VERSION` 19).
- **(B) Multi-region brains** (R22c): regions grow on their own tissues (own morphogen territories), tracts are laid between them, the
  result is one network. predictK3 is the working example (beats single-tissue XO). The two-region actor-critic (rewardKR) learns the bandit
  (0.55 best arm vs rewardK 0.65) and the cue task (pass 0.69 vs 0.86): it **does not match** the single tissue yet; one genome for all
  tasks is not reached (text and reward tasks still need different plasticity rules in the output region).
- **Viewer:** a region selector shows each region's own tissue and growth; the wiring diagram shows all regions, with each population
  ringed in its region's colour and grouped by region. The Development tab shows the output region.
- Old genomes grow and run bit-identically (`results_v21/eqv20.js`, 46 cases vs legacy/v20). Scripts: `results_v21/run.js` (sequence runs, ablations), `results_v20/rl.js` (reward tasks, accepts region plans).

## Where things stand (round 21, v20)
- **Reward-only learning works** for discrete choices. Measured over 8 growths (RESULTS R21a–d):
  - **Contextual bandit:** the best arm is chosen 0.65 of the time (chance 0.33, plasticity off 0.29); last quarter 0.69, against 0.66 for a Thompson-sampling reference.
  - **Cue-then-turn with a random mapping and reward only:** last quarter 0.88 (plasticity off 0.40; memoryK cannot learn a mapping).
- **Every part is needed in the ablations:**
  - Raw reward without a critic: 0.32 on the bandit.
  - No exploration noise: 0.38. Fixed noise instead of value-scaled noise: 0.56.
  - No action loop: 0.51.
  - A TD critic fails when the memory is reset before the outcome: cue 0.27.
- **Bug with random colours: no gain.** Food and poison already give signed dopamine. Motor noise helps a little; no tested variant reverses its colour preference within a lifetime.
- **New genes, all off by default:** `rpe*`, `actNoise*`, `actFb`, `outInh`, `rcvHomeo`. Old genomes grow and run bit-identically (`results_v20/eqv19.js`). No existing default changed, so `DEFAULTS_VERSION` stays 18.
- **Activity tab:** when the brain has a critic, the dopamine trace is the RPE, with a dashed value trace and a "critic" line (value now, last RPE, exploration).

## Where things stand (round 20, v19)
- **New default for text: predictK2XO** (own-column X2 reset): last quarter 0.76 vs 0.71, 1.62 vs 1.95 calibrated bits. `DEFAULTS_VERSION` 18, so v18 sessions are set aside with ↶ Restore. Genomes without `clawOwn` grow bit-identically.
- **Bigger corpus:** Fables (4270 characters, 24 symbols); the brain matches the ideal first-order counter at 2000 symbols but not the order-2 counter (0.42): sparse statistics need count-weighted back-off.
- **Context longer than 2 symbols:** not reached (order3:8 at the order-2 limit). The designs and why they need a new gene are in RESULTS R20b.
- **UI cleanup and two display bugs fixed** (RESULTS R20c): output-spike bars (empty because 1–2 spikes were scaled to 4 and live zeros were shown), learning curve (10 points per life, no axes), fitness chart (blank for the whole of generation 0). browser_test checks all three.

## Where things stand (round 19, v18)
- **Growth viewer:** `viewer.html` (linked from the arena, the Development tab and `growth.html`) replays how a brain grows. It has a timeline, morphogen and cell / axon / synapse / death layers, zoom and pan, a cell inspector with genes, partners and lineage, a population wiring diagram, and a live activity overlay. Screenshots: `screenshot_viewer_growth.png` (text brain, step 23/40), `screenshot_viewer_growth_bug.png` (bug, coloured by fate), `screenshot_viewer_wiring.png`.
- **Behaviour unchanged:** brains, defaults and saves are as in v17. The growth recorder is passive and v18 is bit-identical to v17. `DEFAULTS_VERSION` is still 17, so v17 sessions restore. RESULTS R19.

## Where things stand (round 18, v17)
- **"Only about 1 in hundreds green" was a browser setup problem, not the brain.** In headless Chrome:
  - the old auto-restored session's champion (evolved on cycle K=4), watched on Text: 8.5% green;
  - the text stub env: ~5%;
  - Text without the two-phase clock (first-order plan, 200-character lives): ~38%.
- **Fix:** v17 starts from the recommended settings (two-phase clock, 1000 characters, predictK2XG) and never silently restores older saves; a default-plan change starts a population from the new plan.
- **Result:** browser green is 0.66–0.68 over a full 1000-character life, with the last quarter at 0.74–0.77, matching node. `browser_test.js` guards this. RESULTS R18.

## Round 17 (v16)
- **"Output one letter behind" is not a property of the default plan's scored predictions.** predictK2XG predicts the actual next character 72% of the time in the last quarter. Its echo (prediction = current input) is 0.6% there (6.7% in the first quarter), below the 1.3% of double letters in the text.
- **Two causes of the impression:**
  1. The old display put each prediction under the symbol it predicted, so a right prediction looked like a copy of the current letter.
  2. After Reset or during evolution, the UI shows mutants. 5 of 12 mutants of the plan are broken and output the current letter 69–100% of the time: in their read window, the only output spike is the teacher's last in-flight spike.
- **Fixes:**
  - The display was redesigned, and Reset now watches the plan itself.
  - The optional `teachAHP` gene removes the plan's echo completely, and skipping the first read tick (env `readTicks 3`) turns echoing mutants silent. Neither is more accurate (−0.002 to −0.007), so both stay off. RESULTS R17.

## Round 16 (v15)
- **Text: 0.72 last quarter** (`predictK2XG`, 1000 characters, 32 growths), about 1.9 bits per character (predictK2XM 0.69, predictK2XS 0.67, corpus bigram 0.598, ideal second-order counter 0.79).
- **What helped:** the intrinsic homeostatic threshold of the mixing cells. It is a local, unsupervised plasticity of excitability. It makes each mixing cell a sharper context detector.
- **What didn't:** competitive Hebbian learning of the mixing cells' inputs, in every form tried (with pruning, with consolidation, with teacher gating). It made the cells more active and less selective.
- **Mixing layer:** the paired ablation shows that even the random mixing layer adds +0.014 (R15's "nothing" was within noise). The slim layout without it (predictK2XS) is faster but worse, so it is not the default.
- **Sanity (predictK2XG):** cycle:8 1.00, markov:8 0.77, order2:6 1.00 last quarter. The simulation runs about 29% slower than predictK2XS. RESULTS R16.

## Round 15 (v14)
- **Text: 0.697 last quarter** (`predictK2XM`, 1000 characters, 8 growths), 0.708 with `readIn 0.01`; calibrated 2.01 / 2.00 bits per character (predictK2XN: 0.673 / 0.686).
- **The mixing layer works as a sparse code** (1.2% active, 97% coverage), but it adds no measurable accuracy: silencing it costs ≤ 0.006. The gain comes from the larger conjunctive stack in the new layout. The per-cell vs whole-pattern gap (0.75 vs 0.80) is still open.
- **Sanity (predictK2XM):** cycle:8 1.00, markov:8 0.80, order2:6 1.00 last quarter. The simulation is about 30% slower than predictK2XN (2222 vs 3146 ticks/s). RESULTS R15.

## Round 14 (v13)
- **Text: 0.673 last quarter** with spiking output (`predictK2XN`, 1000 characters, 8 growths), and 0.686 with the graded tie-breaking decoder. Calibrated 2.03 / 2.00 bits per character; ideal first-order counter 0.584 / 2.19, corpus bigram 0.598, ideal second-order counter 0.79.
- **Gain control** (divisive normalisation of the prediction layer input) recovered most of the readout loss. A linear readout of the network's own weights gives 0.72 and the network now gives 0.69 (it was 0.65).
- **Remaining gap:** the learned trust is weaker than the best idealised weighting (0.72 vs 0.75), and the per-cell code is weaker than the full firing pattern (0.75 vs 0.80). The pattern readout would need another conjunctive layer.
- **Sanity (predictK2 with the new genes, 24×24):** cycle:8 1.00, markov:8 0.61, order2:6 1.00 last quarter (without them: 0.91 / 0.48 / 1.00). RESULTS R14.

## Round 13 (v12)
- **Text beats the corpus bigram:** `predictK2XT` reaches 0.650 last quarter on a 1000-character life (R12: 0.581; bigram 0.598; ideal first-order counter 0.584), 2.15 bits per character calibrated. Results are in RESULTS R13.
  - Metaplasticity alone gives 0.610 and the best bits (2.13).
  - Learned trust plus a lower P threshold adds +0.04.
- **Gap to the ideal second-order counter (0.79), measured:**
  - The conjunctive cells carry the information: a counter keyed by their firing pattern scores 0.80.
  - Losses are the network's spiking readout (0.72 → 0.65: weak predictions don't make P fire), the learned trust vs the best idealised weighting (0.75 → 0.72), and the per-cell code vs the pattern (0.80 → 0.75).
- **More cells (80×80 tissue) did not help yet:** many conjunctive cells miss 2–3 prediction columns there. Activity-dependent recruitment was not tried.

## Round 12 (v11)
- **Much faster simulation, bit-identical.** Ticks per second, v10 → v11:
  - 24×24 predictK2: 1 040 → 8 700;
  - 36×36 predictK2L: 341 → 2 200;
  - 60×60 predictK2XL: 116 → 2 335.

  Growth is 1.2–1.8× faster. Old genomes and brains give identical results (`results_v11/eqv10.js`, v8 check, test_core). Table in RESULTS R12a.
- **Second-order text on a 60×60 tissue** (`predictK2XL`): last quarter 0.587 on a 1000-character life. That matches the ideal first-order counter (0.585) but is still just below the corpus bigram (0.598). Calibrated 2.40 bits per character (ideal first-order counter 2.20).
  - The second-order cells do learn the right contexts (57/67 match the ideal argmax). But there are too few cells per context (19² contexts) and the learning rate has to stay low, so it is far from the ideal second-order counter (0.79). See RESULTS R12c.
  - Summing the first- and second-order paths beats either path alone (0.56 vs 0.51 / 0.44 at 600 characters).
- **Not done:** a Web Worker for the browser (optional; not needed after the speed-up). More conjunctive cells per context, or a learned per-path weight, is the next step.

## Round 11 (v10)
- **Second-order context works** (`predictK2`, Settings → Sequence → *Two-phase clock*). On a pattern whose successor depends on the last two symbols, last-quarter accuracy is 1.00 for K=6 and 0.87 for K=8, above the first-order limit of 0.75, and faster than an ideal first-order counter. With the calibrated readout it reaches 0.19 bits per symbol (first-order counter: 0.77).
- **Calibrated readout** (all seq plans; status line "calibrated"): it helps a lot when the outputs are graded (predictK2 order2 1.25 → 0.19 bits) and little on text (3.15 → 3.00), where the output counts are nearly winner-take-all.
- **Not done:** text with second-order context. A 36-row tissue has too few cells per column for 19 characters (RESULTS R11c). Second-order-only prediction is also slower on noisy first-order chains; a mixed first + second-order readout is the next step.

## Round 10 (v9)
- **Learned transitions work.** A grown brain (`predictK`) learns a new sequence rule within each lifetime, using only a local, teacher-gated rule.
  - **Cycles:** last-quarter accuracy 1.00 / 0.97 / 0.94 for K = 4 / 8 / 12.
  - **Markov chain with p = 0.8:** 0.74–0.75, close to the optimum of 0.80.
- **Text** (`predictKL`, 600-character life): 45% overall and 49% in the last quarter. That beats unigram (25%) and is about 83% of an ideal online counter (58%), but below the corpus bigram (60%). Bits per character are poor (3.1) because the spike-count readout isn't calibrated.
- **How to try it:** choose the environment *Sequence prediction* and press ▶ Evolve, or just watch the plan: the learning curve fills in during the life. For text, set Sequence = Text corpus in Settings. Headless: `CASES=cycle:8,markov:8,text NS=200 node seq_test.js`.
- **Reward-modulated STDP alone doesn't learn this task.** It stays at or below chance.
- **Second-order context isn't built yet.** On a pattern that needs two symbols of context, the brain reaches 0.63, below the first-order optimum of 0.75.
- **Earlier results:** memoryK holds 2–12 symbols with 0–2% failed growths. Hunger signals wire orphan motors in the bug arena.
