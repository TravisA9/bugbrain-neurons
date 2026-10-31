# Feature–Time toy port

A fixed-anatomy spike runner for one frozen Play Code Toy export. It predicts the next character. It does not grow cells, and it does not learn. Evolved brains and the headless runner (`run/`) are untouched.

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

`predictFine(text, sub)` is the same circuit on a finer clock. Delays are multiplied by `sub`. The character is an input spike on the first substep only. Later substeps in that character stay silent, and the returned predictions match `predict`.

`SpikingNet` is unchanged. A spike there is current on the next substep, `preLag` only builds the teacher trace, and CLAW coincidence is input on the current substep. Delay 0 in this export is a same-character chain (depth 10), which that synapse update does not carry. This folder is the place for that delay line.

Learning is off. Weights stay at the export. There is no STDP, no dopamine, and no cell birth. Continuous time, a membrane that leaks between characters, and timing-dependent plasticity are the next steps, once this snapshot stays aligned with the reference.
