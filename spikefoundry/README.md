# SpikeFoundry on this computer

## Design a circuit from input/output examples

Run the local inverse-design study with Node 18 or later.

```sh
node spikefoundry/inverse_designer.js study inverse-results
node spikefoundry/inverse_designer.js design inverse-results/model.json examples.json
```

For temporal inputs, `examples.json` is an array of objects such as
`{"x":[[1,0],[0,0],[0,1],[0,0]],"y":1}`. Each input has four time steps
and two binary channels. The target says whether the output should fire.
The model emits wire weights, delays, threshold, leak, and recurrence for
a circuit supported by the frozen simulator. It ranks up to eight proposals
by their agreement with the supplied examples.

The study creates a corpus from a bounded circuit grammar and splits source
tasks by their complete behavior before training. It gives the model a
random subset of examples for each test task and evaluates the emitted
circuit on the remaining inputs. The report includes the first model proposal,
selection among eight model proposals, eight random proposals, and the
closest circuit from the training library. Corpus and training CPU time are
recorded separately.

### Shared training

Set `inverse_composition` and `inverse_gallery` to true to run the
three-hidden-neuron pilot. The coordinator supplies one pilot job at a time
under its normal queue limits. Pilot jobs train a separate timing designer,
compare it with random-start search on the same held-out behavior at the
same evaluation budget, and publish explicit `snn-graph-1` circuits to
Discoveries. Gallery scores describe firing versus silence. The owner job
report also records first-spike timing results for both methods.

Set `inverse_shared_training` to true in the coordinator configuration when
the fleet supports shared assignments. Automatic inverse jobs then load the
current shared checkpoint at claim time. The first eligible model starts the
lineage. Later jobs fine-tune the assigned checkpoint for 60 epochs.

The promotion benchmark uses 12 reserved circuit behaviors and three sets of
examples per behavior. A candidate must gain at least three passes out of 36
and improve on at least two behaviors. The coordinator accepts a promotion
only while the assigned generation is current. Future assignments receive
the promoted checkpoint. The owner can inspect the model and its benchmark
results at `/owner/inverse-champion.json`.

### First-spike timing experiment

Run `node spikefoundry/inverse_timing_experiment.js 8` for eight paired seeds
per held-out circuit family. The local experiment compares one reference
wiring, simulator feedback that treats each timing mismatch equally, and
simulator feedback that discounts small timing errors. All arms use the same
demonstrations and number of model updates. The audit reports both exact
first-spike timing and graded timing scores on fresh inputs. It also checks
how often exhaustive search can recover a circuit from the same demonstrations.

Run `node spikefoundry/inverse_timing_experiment.js 8 search` to compare
the DNN's fixed shortlist, random circuits, and simulator-guided single-gene
edits at budgets of 8 and 32 distinct circuit evaluations per demonstration
set. The revision arms compare DNN starts with DNN edit priorities, random
starts with DNN edit priorities, and random starts with random edit
priorities. All arms select circuits using only the demonstrations before
scoring them on fresh inputs.

Run `node spikefoundry/inverse_timing_experiment.js 8 augment` to recover
training circuits with random-start search. The search uses 64 demonstrations
and accepts a circuit only if it matches the target first-spike time or
silence on all 256 inputs. Each fold holds out a whole two-excitatory-input
delay-order family and excludes equivalent behaviors from its audit. The
experiment compares recovered designs, reference designs for the same new
behaviors, and replay of existing behaviors at equal training update counts.

Run `node spikefoundry/inverse_composition_experiment.js 4` to test whether
source-verified three-hidden-neuron examples improve a timing designer over
replaying two-hidden-neuron examples. Each fold reserves the distinct
behaviors of one three-hidden-neuron circuit family. Both DNNs and
random-start simulator search evaluate 32 distinct circuits per trial.

Run `node spikefoundry/inverse_composition_experiment.js 6 hybrid` to
compare those baselines with a 16-evaluation DNN search followed by a
16-evaluation random-start search. The second search skips wirings the
first already evaluated. Both search arms select using the demonstrations,
with new demonstration sets and a separate sample of serial-cascade
behaviors for this experiment.

Run `node spikefoundry/inverse_composition_experiment.js 4 balanced` to
compare equal family sampling within each circuit size with uniform
behavior sampling and two-hidden-neuron replay. Checkpoints are selected
using the weakest family pass rate on reserved two-hidden-neuron behaviors,
with mean family pass rate and timing accuracy as tie-breakers. Each
selected checkpoint is then scored on the reserved three-hidden-neuron
family at the same 32-circuit budget.

Run `node spikefoundry/inverse_composition_experiment.js 4 diverse` to
generate additional behaviors with five new detector variants. The diverse
arm replaces repeated training rows with simulator-generated behaviors
from the same family and circuit size. The replay, oversampled, and diverse
arms share the expanded design space and the same audit.

A second set of 12 reserved behaviors measures generalization. The report
shows audit results for both models. Promotion uses the first set.

For complete random truth tables, run
`node spikefoundry/inverse_designer.js table examples.json` with all 16 rows
in the form `{"x":[0,1,1,0],"y":1}`. This command constructs a circuit
directly from the table and serves as an exact construction reference.

## Sequence designer experiment

Run the capped study locally with Node 18 or later. Save the following as
`sequence-experiment.json`, then run the command from the worker repository.

```json
{"seed":1729,"rounds":6,"cpuBudgetMs":1000,"cap":3000}
```

```sh
node spikefoundry/experiment.js sequence-experiment.json sequence-results
```

Each round compares the current proposal strategy and simple evolution under
the same CPU and proposal caps. After the first round, a learned arm ranks
candidate edits with a checkpoint fitted on actual search outcomes. All arms
share the screening and search cases. Each arm can send up to three finalists
to balanced confirmation cases, including longer sequences. The reported
CPU time to a verified circuit includes the completed search, confirmation,
and the learned checkpoint's training cost. The experiment tracks
cache hits, unique simulation CPU time, attempts, plateau stops, confirmation
scores, and circuit size. It requires two consecutive qualifying rounds with
the same checkpoint to promote it. It also checks a 64-module chain assembled
from reference circuits separately from the learned search. An approved
checkpoint also ranks modules for a new task with two independent sequence
channels. The transfer test checks both component behaviors and both outputs.

The output directory holds the experiment report, the evaluation journal,
the tested model versions, and an approved checkpoint if one passes. Reuse
the same directory and options to resume. Supply the approved checkpoint
object as `initialCheckpoint` to carry its model and verified parent into a
follow-up study with a new seed and output directory. CPU-time caps can change
the number of proposals across machines even with the same seed.

On Compute Lab, the owner can queue **Run a capped sequence experiment** from
the job template list. Each seed has one job ID, and workers must advertise
experiment support. The owner console links the latest JSON report.
The **Sequence study** form queues three capped jobs with consecutive seeds.
The three jobs use disjoint case partitions. The comparison shows successes
and median CPU time for matched rounds with the same budget and starting
checkpoint. Discoveries lists circuits that pass both confirmation suites
separately from the search rankings.

The coordinator saves completed rounds during a job. A replacement donor can
restore those rounds. An interrupted round can still repeat on a replacement
machine, while a retry on the same machine also has its local journal.
Set `pause_legacy_spikefoundry_search` in the coordinator configuration to stop
refilling and claiming the legacy SpikeFoundry search while running the study.
Set the study budget and optional approved `initialCheckpoint` under
`sequence_experiment` in that configuration.

SpikeFoundry proposes small circuits and scores them on **synthetic spike patterns**. That percent is not a BugBrain reading score and not a result from the research queue.

The file you were given is kept byte for byte at `spikefoundry/original/SpikeFoundry-SNN-Design-Lab.html`. The lab and the background worker both use `spikefoundry/engine.js` instead of a second copy of the math.

## What you can do

- **Explore** (`/lab`) runs batches in the browser tab only. It does not enroll the computer and does not submit work.
- **Donate** is a separate choice on the participant page. A background worker (`run/dq.js`, started by `start_worker.bat` or `start_worker.sh`) runs jobs. Closing the browser does not stop that worker.
- **Owner desk** creates projects and sets their order. SpikeFoundry is first, BugBrain second, unless you disable or lower SpikeFoundry. A job that is already leased keeps running.

## Pilot, not a public join link

The shared queue is a private git branch. A volunteer would need a write token to push claims. This setup does not hand that token out. Use it on computers you already trust. There is no public signup.

## Windows

1. Install Git and Node.js 18 or newer.
2. Clone this branch of the repo (the worker still tracks `neuro/distributed-queue` until this is merged).
3. In a terminal:

```
node run\console.js --dir C:\path\to\queue-checkout
```

4. Open the **owner** link to add projects. Open the **participant** link on that PC, tick the consent box and the projects, then save.
5. Install the worker the way `WORKERS.md` describes, then `start_worker.bat`. Turn it off with `stop_worker.bat` or the participant page (with `--live-switch` if the page should stop the scheduled task).

The queue checkout is a clone of the `queue` branch. Do not point the desk at the worker's `.dq` folder.

## Linux

Same steps with `node run/console.js --dir /path/to/queue-checkout`, `sh start_worker.sh`, and `sh stop_worker.sh`.

## Synthetic scenarios

The planning direction is to grow networks from small modules with a clear spike interface, compile those modules into one graph, and score that graph on held-out events. `spikefoundry/scenarios.js` is the first bounded slice of that, plus four seeded data shapes:

| Scenario | Shape | What the labels stand in for |
|---|---|---|
| `vision` | `[batch, channels, height, width]` | which quadrant of a synthetic image is bright |
| `sequence` | `[batch, sequence, hidden]` | a context bit, plus a next-token id at each step |
| `graph` | adjacency `[nodes, nodes]`, features `[nodes, features]` | whether a generated edge list is even, and a neighbor average |
| `control` | `[batch, steps, observations]` plus rewards | whether a delayed synthetic reward appeared |

Spikes are a latency-style encoding of those numbers. The job compiles a readout with a coincidence or sequence module and runs an event-driven simulator. Neurons carry a partition id so the same graph can be split later; the partition does not change the spikes.

Numbers outside the caps in `scenarios.js` (`LIMITS`) are rejected. Defaults are a few dozen values, not a stored dataset. The runner writes `scenario.json` (shapes, counts, one preview, a pipeline fraction) into the job output folder only.

A pipeline fraction means generation, encoding, compilation, and held-out scoring finished. It does **not** mean the circuit is good at vision, language, graphs, or control, and it is not a public benchmark result.

```
node spikefoundry/run.js --job spikefoundry/examples/vision-job.json --out spikefoundry-out
node spikefoundry/scenario_test.js
```

`examples/curriculum-job.json` runs the four stages in order and stops if a stage’s pipeline fails. Earlier stages are not dropped from that walk.

## A bounded job

A SpikeFoundry job is a JSON file in `jobs/` on the queue checkout:

```json
{
  "id": "sf-pilot-1",
  "kind": "spikefoundry",
  "project": "spikefoundry",
  "title": "Two synthetic batches, seed 11",
  "priority": 0.5,
  "estHours": 0.2,
  "seed": 11,
  "batches": 2
}
```

Run it locally, without the git queue:

```
node spikefoundry/run.js --job job.json --out /tmp/sf-out
```

The checkpoint stays in that output folder. Run the same command again to continue after a failure. A different `--out` folder does not reuse it.

`projects.json` in the queue folder:

```json
{
  "projects": [
    { "id": "spikefoundry", "title": "SpikeFoundry", "enabled": true, "priority": 2 },
    { "id": "bugbrain", "title": "BugBrain neurons", "enabled": true, "priority": 1 }
  ]
}
```

Without that file, existing BugBrain jobs keep their old order and SpikeFoundry jobs are not claimed.
