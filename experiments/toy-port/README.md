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

## What still differs from a grown BugBrain

`SpikingNet` is unchanged. A spike there is current on the next substep, `preLag` only builds the teacher trace, and CLAW coincidence is input on the current substep. Delay 0 in this export is a same-character chain (depth 10), which that synapse update does not carry. This folder keeps its own delay line.

The continuous path is still not a grown brain:

- The cells and synapses are the Toy export. There is no genome, no morphogen, and no new cell.
- It is not on the evolution loop or the worker queue. Default plans (`predictK3`, `rewardE`) are unchanged.
- The teacher is the next character compared with that cell's vote. It is not dopamine from the bug arena or the bandit, and it is not the sequence plan's column teacher.
- Readout learning, when on, only smooths that cell's existing vote. There is no presynaptic normalisation across cells, no metaplasticity, and no homeostatic threshold.
- Time is the export's character step (25 ms, 8 bins here), not four substeps of a tissue tick.
- The coincidence window is a rectangle on axonal arrival times. A grown CLAW cell is a fast membrane over inputs that are already simultaneous.
