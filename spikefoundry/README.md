# SpikeFoundry on this computer

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
