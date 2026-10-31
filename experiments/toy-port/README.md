# Feature–Time toy port

A fixed-anatomy spike runner for one frozen Play Code Toy export. It predicts the next character. The graph stays the exported cells and synapses: nothing grows a new cell. Evolved brains and the headless runner (`run/`) are untouched.

Two clocks:

- `verify.js` is the discrete regression. One bin per character, membrane reset, learning off. It matches `snn-sim.cjs`.
- `continuous.js` is the fine-time path. Axonal delays use the export's delay steps, coincidence is a timing window, and a three-factor rule can change weights on those same synapses.

## Run

From the repo root:

```
node experiments/toy-port/verify.js
```

Optional arguments: `verify.js [model.snn.json] [sample.txt]`. With no arguments it uses the files in this folder. The process exits 0 when next-letter agreement with `snn-sim.cjs` is at least 99%, the hard-spike set matches at that bar, the engine's rest and threshold still match, `Dec.wta` reads the output spike, streaming `step` matches `predict`, and a finer substep clock matches the character clock. It writes `agreement.json`.

Latest measured run on `sample-dialogue.txt` (3423 characters):

| check | result |
|---|---|
| next-letter agreement vs `snn-sim.cjs` | 100% (3423/3423) |
| hard-spike set, every step | 100% |
| next-letter accuracy (port and reference) | 85.83% |
| summed readout weights vs the Toy readout | 96.35% |
| 2 and 3 substeps per character | same predictions, 0 spikes on idle substeps |

The accuracy is on this snippet, which is written in the toy's turn format and repeats lines stored as cell labels. The full training corpus is not in the repo. Opening lines:

```
_
u:let us pause for a moment
a:ok_
u:tell the story again
a:the garden sounds like a good place to visit._
u:what object was near the door
a:a hat was near the door.
u:the hat was near the door.
a:i heard that.
```

`snn-sim.cjs` is the unmodified reference simulator. Its command-line mode expects the Toy harness, which is not in this repo. Load it through `verify.js` (it exports `loadSNN` and `run`).

## Continuous time and plasticity

```
node experiments/toy-port/continuous.js
```

Same default model and sample. The process exits 0 when the one-bin window still matches the discrete runner at 99% or better (predictions and hard spikes) and the plasticity pass moves at least one weight. It writes `continuous-report.json`.

Each character is 25 ms, split into 8 bins (3.125 ms). An export delay of `d` characters is an axon of `d * 25` ms. A tap contributes its 15 mV charge while that arrival sits inside the last `window` bins. Hard fire means every tap is inside the window; soft fire is the export's soft count, with a delay-0 tap in the window and at least 3 taps. After a spike the cell is quiet for `window` bins. `window = 1` is a single bin, which is the discrete boolean.

On `sample-dialogue.txt` (3423 characters):

| setting | next-letter agreement vs discrete | hard-spike sets | next-letter accuracy |
|---|---|---|---|
| 1 bin/character, window 1 | **100%** | **100%** | 85.83% |
| 8 bins/character, window 1 (3.125 ms) | **100%** | **100%** | 85.83% |
| window 4 bins (12.5 ms, shorter than a character) | **100%** | **100%** | 85.83% |
| window 12 bins (37.5 ms, past one character) | 94.04% | 27.55% | 83.11% |

Taps in this export are phase-locked: letters arrive at the start of a character and delays are whole characters. A window shorter than one character still sees the same coincidence. A window of 37.5 ms still counts a tap from the previous character, so different cells fire (spike sets agree on 27.55% of steps) and 5.96% of the predicted letters change.

Plasticity is BugBrain's three-factor shape (`lr` 0.03, `tauPre`/`tauPost` 10, `tauElig` 50, `aMinus` 0.3, from `PL_DEFAULTS` in `js/core/base.js`). A presynaptic arrival after the axonal delay writes the pre trace and depresses eligibility by `aMinus * xPost`. A postsynaptic spike adds the pre trace to eligibility. At the end of the character the next input is the teacher for each cell that fired: `M = +1` when that cell's vote is the next character, and `M = -1` otherwise, and `w += lr * M * e`.

The weights are then projected so partners cannot drop out:

- Every tap stays in a band around `w0 = 1/nTaps`. The floor is `0.5 * w0`. The ceiling is `w0 * (1 + 0.9 * (need/(need-1) - 1))`, with `need = ceil(0.75 * nTaps)`. That ceiling sits under `need/(need-1)`, so the heaviest `need - 1` taps cannot meet the soft threshold.
- The cell's taps are rescaled to sum to 1 (mixed with the original equal weights if a pure rescale would leave the band). A full coincidence is still exactly `n * 15` mV. Leaving any one tap out drops the hard-path charge strictly below that, so a heavy tap cannot fire alone.

The synapse list does not grow or shrink. With only that projection, replay on the 37.5 ms window stays at the pre-plastic accuracy, **83.11%**, and 99.59% of predicted letters match the frozen wide-window run. 1133 synapses move (mean |Δw| 0.0021, max 0.246). `partnersHold` is true.

Readout votes can learn too (`readoutLearn: true`, `voteLr` 0.01). For a cell that fired, its count distribution is mixed toward the next character: `p <- (1 - voteLr) * p + voteLr * onehot(next)`. The vote character is the new mode. On this snippet that raises replay accuracy from 83.11% to **86.03%** (discrete baseline 85.83%). `continuous.js` reports vote smoothing when it stays within 2 points of the pre-plastic accuracy and beats taps-only; otherwise it reports taps-only. The class leaves `readoutLearn` off unless you pass it. Votes on the shared discrete net are restored after each run, so `verify.js` still sees the export.

```javascript
const { loadFeatureTime } = require('./toy_net');
const { ContinuousToy } = require('./continuous');
const net = loadFeatureTime('./baseline-frozen.snn.json');
const sim = new ContinuousToy(net, { sub: 8, window: 12, plasticity: true, readoutLearn: true });
const online = sim.run(text);   // weights and votes move after each character
sim.plasticity = false;
const replay = sim.run(text);   // learned weights and votes, no further updates
```

## API

```javascript
const { loadFeatureTime } = require('./toy_net');
const net = loadFeatureTime('./baseline-frozen.snn.json');
const preds = net.predict(text);     // preds[i] guesses the character after text[i]
net.reset();
const first = net.step(text[0]);     // one character at a time; same result as predict
const again = net.predictFine(text, 4);  // 4 substeps per character; same predictions
```

`net.outSpikes` is a one-hot spike of the predicted character (silent when the readout abstains). `net.v[i]` is that cell's hard-path potential at the decision, or rest if it fired. `net.summary()` lists cells, synapses, max delay, and the depth of the delay-0 chain.

## Discrete clock, and what is still ahead

One tick is one character. Every delay in the export is an integer number of characters (0–31 here). The delay line is a ring of 64 steps, the same horizon as the reference: a cell tap at delay 64 or more would not arrive.

Each coincident tap adds 15 mV, BugBrain's threshold minus rest (`js/core/base.js`: −55 and −70). A cell hard-fires when every tap's own spike is present, then resets to rest. Cells that do not fire also start the next character at rest. There is no leak across characters. The history lives in the delay line.

The export field `threshold` is the soft count, `ceil(0.75 * nTaps)`. A soft spike is a second event: enough taps are nearly satisfied (a hard spike or a soft spike on a cell tap), one of those taps has delay 0, and the cell has at least 3 taps. Soft spikes can complete a downstream tap. They do not count as the strict AND. Synaptic weights in the file are `1/nTaps` rounded to 4 decimals, so the membrane counts taps instead of adding those rounded weights.

The readout is lateral inhibition over the cells that fired. Inside one span, the cell with the higher training count wins. Across spans, the longest cell that has a vote wins. If that winner's confidence is below `outrankConf` (0.8), a longer soft or abstract cell can take the character when its own confidence is at least 0.8 and at least 0.1 higher. The vote on a cell is its majority character among counts of 2 or more. `_` is an ordinary output character. The reference simulator has no separate silence neuron, and neither does this port. One input id is the token `speak`; it has no synapses.

`predictFine(text, sub)` is the same discrete circuit on a finer clock. Delays are multiplied by `sub`. The character is an input spike on the first substep only. Later substeps in that character stay silent, and the returned predictions match `predict`. That is a different check from `continuous.js`: there the window can be wider than one bin, so late arrivals still count.

## Triangulation: grow a letter layer toward the export

```
node experiments/toy-port/triangulate.js
```

Writes `triangulate-report.json`. The target subgraph is the 32 highest-count cells whose taps are only input letters. In this export every one of those is a delay-0 letter plus the previous letter (a bigram such as `e `, `he`, `th`, `u:`).

Growth runs on the first 70% of `sample-dialogue.txt` (2396 characters). A cell is born for every pair of letters that co-occur at least twice. Trophic competition keeps the 32 with the best predictive score on that prefix. One adaptation round then tries single-letter substitutions and accepts a change only when the score rises. Votes for the grown cells are fit on the prefix only. The last 1027 characters are held out. This is not `growCell` on a tissue: those synapses are spatial, not `(letter, delay)` taps, so they are not in the same coordinates as this subgraph.

Held-out next-letter accuracy:

| set | anatomy recall vs the 32 export motifs | next-letter accuracy | agreement with the full frozen net |
|---|---|---|---|
| full frozen net | — | 77.78% | — |
| export's 32 motifs, frozen votes | 100% | 27.78% | 36.71% |
| 32 most frequent bigrams on the prefix | **71.88%** (23/32) | 34.11% | 37.68% |
| 32 kept by predictive score | 40.63% (13/32) | 31.09% | 35.93% |

No substitution raised a score: every better pair was already in the trophic set. The export's letter layer is closer to "keep the bigrams that fire often" than to "keep the sharpest predictors." Those 32 motifs, even with the export's own votes, are far below the full net (27.78% vs 77.78%). Most of that gap is the rest of the letter layer, not the deeper taps. All 314 letter cells, with their frozen votes, score **62.96%** on the same held-out tail and agree with the full net on 77.80% of positions.

## Second wave: delay-0 plus delay-2

The common depth-1 cell has two taps: the letter-cell that fires now (delay 0) and either a raw letter or another letter-cell from two steps back (delay 2). On this sample at most one letter cell fires at a time, so each such cell is a trigram. `triangulate.js` also grows that layer on top of the 314 export letter cells. A pair is born whenever it co-occurs at least twice on the growth prefix (357 births). Competition keeps 32.

| set, on the held-out tail | recall of the 32 highest-count depth-1 cells | next-letter | agreement with the full net |
|---|---|---|---|
| 314 letter cells only | — | 62.96% | 77.80% |
| letters + those 32 export cells, frozen votes | 100% | 62.38% | 77.60% |
| letters + all 341 eligible depth-1 cells | — | **66.96%** | **83.06%** |
| letters + 32 most co-occurring pairs | 34.38% (11/32) | 65.01% | 77.22% |
| letters + 32 best predictive pairs | 25.00% (8/32) | 63.94% | 77.31% |

The export's own top 32 depth-1 cells do not help this snippet: their frozen votes slightly override the letter layer (62.38% vs 62.96%). The whole depth-1 layer adds about 4 points (62.96% → 66.96%) and moves agreement with the full net from 77.80% to 83.06%. Counting every depth-1 cell, not only that two-tap shape, reaches **68.23%**.

## Third wave: depth-2 taps

Depth 2 is mostly a cell from the previous layer firing now, plus another shallower cell or a letter a few steps back (`C0@0+C1@2`, `C1@0+L@4`, and similar 2–4 tap shapes). `triangulate.js` births those patterns when the taps co-occur on the growth prefix (1497 candidates) and keeps 32. Held-out tail, full net **77.78%**:

| set | recall of the 32 busiest depth-2 cells | next-letter | agreement with the full net |
|---|---|---|---|
| all depth ≤ 1 (769 cells) | — | 68.23% | 84.91% |
| depth ≤ 1 + export's top 32 depth-2, frozen votes | 100% | 69.98% | 87.44% |
| depth ≤ 1 + 669 grown-style depth-2 cells | — | 71.93% | 91.43% |
| every cell of depth ≤ 2 (1512) | — | **74.07%** | **93.67%** |
| depth ≤ 1 + 32 most co-occurring patterns | 9.38% (3/32) | 69.49% | 86.56% |
| depth ≤ 1 + 32 best predictive patterns | 9.38% (3/32) | 69.20% | 85.88% |

Depth 2 is worth about **6 points** (68.23% → 74.07%). A budget of 32 recovers only 3 of the export's busiest depth-2 motifs and about 1 point of behavior, close to what those 32 export cells themselves add (69.98%).

## Fourth wave: depth 3 and 4

The same birth rule, one layer deeper: a cell is born when its 2–4 taps onto shallower cells co-occur on the growth prefix. Competition keeps 32. Full net on the held-out tail remains **77.78%**.

| set | next-letter | agreement with the full net |
|---|---|---|
| every cell of depth ≤ 2 (1512) | 74.07% | 93.67% |
| depth ≤ 2 + the export’s 32 busiest depth-3 cells | 75.24% | 95.42% |
| every cell of depth ≤ 3 (2842) | **75.93%** | **96.88%** |
| depth ≤ 3 + the export’s 32 busiest depth-4 cells | 76.32% | 97.27% |
| every cell of depth ≤ 4 (4350) | **77.19%** | **98.73%** |
| depth ≤ 2 + 32 grown depth-3 patterns | 74.07% | 93.67% |
| depth ≤ 3 + 32 grown depth-4 patterns | 75.93% | 96.88% |

Depth 3 adds about **2 points** (74.07% → 75.93%). Depth 4 adds about **1 point** (75.93% → 77.19%). The full net is 0.6 points past depth 4. The export’s own top 32 cells do most of each layer’s work. Patterns born from co-occurrence on this snippet recover 2 of the 32 depth-3 motifs and 1 of the 32 depth-4 motifs, and they do not change a held-out prediction. Those export cells are long-delay combinations this dialogue does not rehearse often enough for the grown votes to take the readout.

## What still differs from a grown BugBrain

`SpikingNet` is unchanged. A spike there is current on the next substep, `preLag` only builds the teacher trace, and CLAW coincidence is input on the current substep. Delay 0 in this export is a same-character chain (depth 10), which that synapse update does not carry. This folder keeps its own delay line.

The continuous path is still not a grown brain:

- The cells and synapses are the Toy export. There is no genome, no morphogen, and no new cell.
- It is not on the evolution loop or the worker queue. Default plans (`predictK3`, `rewardE`) are unchanged.
- The teacher is the next character compared with that cell's vote. It is not dopamine from the bug arena or the bandit, and it is not the sequence plan's column teacher.
- Readout learning, when on, only smooths that cell's existing vote. There is no presynaptic normalisation across cells, no metaplasticity, and no homeostatic threshold.
- Time is the export's character step (25 ms, 8 bins here), not four substeps of a tissue tick.
- The coincidence window is a rectangle on axonal arrival times. A grown CLAW cell is a fast membrane over inputs that are already simultaneous.
