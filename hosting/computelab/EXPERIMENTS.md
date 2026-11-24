# Server-defined experiments (Compute Lab)

Volunteers choose nothing. The server decides what every computer runs, from JSON specs in `private/experiments/`,
and the results come back to the server, which aggregates them and plans the next runs. Everything here is off
until `experiments_enabled` is set to true in `private/config.php` (default false: claims, supply and pages are
the same as before, which the tests check).

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Spec | `private/experiments/<id>.json` | One pre-registered experiment (format below). `status`: active, proposed, paused, retired. Only active specs run. |
| Catalog | `private/experiments/CATALOG.json` | Every job type volunteers can be given, its consumer, and the recommended state. |
| Planner | `private/src/Experiments.php` | Pure function (spec, seeds, runs) -> next runs + report. Extremes first, then bisect, then fresh-seed confirmation, then the verdict. |
| Scheduler | `App::replenishExperiments()` (called from `replenishJobs`) | Queues the runs the planner asks for (template `bb-experiment`, runner `run/exp.js`), up to the spec's `queueCap`. |
| Seed ledger | table `exp_seed_ledger` | Each experiment gets its own block (tune seeds, then confirmation seeds) from `experiment_seed_start` (5001). No seed is shared between experiments, so confirmation seeds are always fresh. |
| Claim gate | `App::experimentFits()` | An experiment run goes only to a computer whose heartbeat runtime reports `experiments >= spec.protocol` and `memGB - experiment_mem_reserve_gb >= requires.memGB` (one run per that many GB). Experiment runs are offered before other work. |
| Results | `App::submitResult()` | A `done` result must carry `research` = `{version 'bb-exp-1', id, arm, task, k, variant, metric, metrics{...}}` matching the job, with a finite metric. Errors go through the normal retry path; a run that fails twice blocks its experiment (no loops). |
| Report | `GET /experiments.json` (404 while off), `php private/bin/experiments.php report` | Per experiment: phase, search points and scores, paired deltas vs control (mean, t, wins, worst seed) per task, verdict, follow-up proposals. No computer names. |
| Retire list | config `retire_job_types` (default `[]`) | Job types never supplied or handed out; rows are kept. |
| Validation | `php private/bin/experiments.php validate` | Checks every spec without a database. |

## Spec format (`bb-exp-1`, worker protocol 1)

```json
{
  "id": "r146-lagdepth", "title": "...", "status": "active", "goal": "memory", "priority": 3,
  "runner": "run/exp.js", "protocol": 1, "plan": "deepURSx3",
  "base": "<the champion variant: also the control arm>",
  "search": { "param": "P.lagDepth", "lo": 8, "hi": 128, "scale": "log2", "integer": true, "maxPoints": 6, "minGap": 0.5 },
  "tasks": [
    { "id": "book100k", "tj": { "env": "seq", "params": { "source": "book", "nSyms": 100000, "evalSyms": 2000 } }, "metric": "heldAcc", "primary": true },
    { "id": "fables4000", "tj": { "...": "..." }, "metric": "accuracy", "guard": { "maxDrop": 0.005 } }
  ],
  "seeds": { "tune": 2, "confirm": 16 },
  "pass": { "meanDelta": 0.002, "minT": 2.0, "minWinFrac": 0.625, "perSeedFloor": -0.005 },
  "requires": { "memGB": 7, "heapMB": 7000, "minutes": 70 },
  "queueCap": 6
}
```

Instead of `search`, a spec may give fixed `arms`: `[{ "id": "deep", "set": { "P.lagDepth": 64 } }]` (up to 8). Fixed arms skip
tuning and go straight to confirmation.

How a search runs (all on the server, no user step):
1. **Tune, extremes first**: control + `lo` + `hi` on the tuning seeds, primary task only.
2. **Bisect**: midpoints (in the spec's scale) between the best point and each neighbour, better neighbour first, until `maxPoints` or `minGap`.
3. If no point beats the control: verdict `no-gain`, nothing confirmed.
4. **Confirm**: the best point vs control on the fresh confirmation seeds, every task.
5. **Verdict** (`pass` / `fail`), from the pre-registered bar: primary task paired mean >= `meanDelta`, t >= `minT`, win fraction >= `minWinFrac`,
   worst seed >= `perSeedFloor`; every guard task mean >= `-maxDrop`.
6. **Proposals**: if the best point sat on an edge of the range, the report proposes the next range out. Proposals are not run
   automatically: a new range is a new pre-registration and needs Travis's approval (add it as a spec with `status: active`).

Changing what volunteers run is a spec change on the server (data), not worker code, as long as the experiment fits
`run/exp.js` (one growth of `plan` + `variant` on task `tj`, seed `k`, any numeric task stat as the metric). A new kind of run
needs a new runner, which ships through the worker channel (canary, then stable) and a protocol bump.

## Worker side (protocol 1)

Branch `cursor/worker-experiments` (based on `e46d14b1`, the Phase 1 worker), for DCB to bring into the worker branch / canary:
- `run/exp.js`: the runner. With `strictFlags` it refuses any flag or genome field the engine does not read, so an old engine fails
  loudly instead of reporting a plausible score for the wrong brain.
- `run/coord.js`: `run/exp.js` on the allowlist; passes `--max-old-space-size=<heapMB>` (capped at 80% of RAM); sends
  `result.json` as `research`; heartbeat runtime adds `experiments: 1` and `memGB`.
- The R144 engine (`js/core/*`, `js/envs/sequence.js` from relgrowth 46445869). Every R144 flag is opt-in, off = bit-identical.

## Inverse designer compute policy (second commit; all off by default)

DCB found the shared inverse designer takes ~99% of volunteer jobs, re-solves the same 12 promotion behaviours, and promotes on
them without looking at the audit set (likely overfitting). Config knobs, each tested on and off:

| Config | Effect |
|---|---|
| `inverse_promotion_audit_gate`, `inverse_promotion_audit_margin` | Promotion also needs audit passes >= champion audit + margin; otherwise outcome `audit-not-better`. |
| `inverse_stall_jobs` | After N finished plain inverse jobs with no promotion, plain inverse supply stops (composition and other work go on); a promotion restarts the count. `/experiments.json` shows `inverse.stalled` and a note. |
| `inverse_share_max` | Once plain inverse jobs hold this share of online slots, a claim skips them whenever other work is queued (no idling when nothing else exists). |
| `inverse_composition_queue`, `inverse_composition_first` | More composition pilots in flight, handed out first. |
| `discoveries_dedupe` | Public Discoveries shows each circuit once (first finder, best scores, "✓N" confirmations), keeps a smaller circuit even below the top N, and shows the designer's level, promotion and audit scores. Storage/trim unchanged. |

Not done here (needs worker code): auto-growing composition size/parts, and enlarging the gene grid / behaviour split.

## Turning it on (after Travis approves each step)

1. Deploy the coordinator (this branch, after Phase 1 `8e885e1d`). Leave `experiments_enabled` false. Run `upgrade.php` (new tables).
2. Ship the worker branch to canary; check one canary computer reports `experiments: 1` and `memGB` in its runtime.
3. Set `experiments_enabled => true`. The active spec queues its first runs; only protocol-1 computers with room take them.
4. Optionally retire wasteful types: `retire_job_types => ['bb-order3', 'bb-chunk-fables', 'bb-chunk-order3', 'sf-propose', 'sf-train', 'sf-vision']`.
5. Promote canary to stable.
