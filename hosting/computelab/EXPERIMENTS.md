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

## Query cost (fix1, after the 2026-11-24 step-3 outage)

Step 3 turned on `inverse_stall_jobs`; `inverseJobsSincePromotion()` was a `COUNT(*)` over `results JOIN jobs` with
`spec_json NOT LIKE` (full scan of ~1M results, 60-120 s on the host) run by every supply pass, `/discoveries` and
`/experiments.json`, and it counted all history (979k), so it would also have stopped inverse supply at once.

Now no policy path reads a big table:
- **Stall count**: a counter row `policy_state('inverse_since_promotion')`, tagged with the champion generation. +1 per finished
  plain inverse result (only while `inverse_stall_jobs` > 0), set to 0 by a promotion; a different generation reads as 0.
  Two primary-key reads. Counting starts when the flag is first turned on (history is not counted).
- **Share cap**: `SELECT job_id FROM leases` then those jobs by primary key; online slots cached in `policy_state` for `supply_seconds`.
- **Composition queue (>1)**: queued pilots tallied in the existing `claimableQueued()` pass, leased ones as above. Queue 1 (default) keeps the original query.
- **/experiments.json** and the deduped gallery: `page_cache`, 30 s / 60 s; the report allocates no seeds for specs that are not switched on.

Measured on MariaDB 11.8 with 1M jobs + 1M results (box, warm 1 GB buffer pool):

| Query | EXPLAIN | Time |
|---|---|---|
| old stall count | results ALL 947k rows + jobs eq_ref | 7.8 s (returned 1,000,000) |
| new stall count | policy_state / inverse_champion const (PK) | 0.0001 s each |
| old share join | leases ALL 60 + jobs eq_ref | 0.002 s (MariaDB drove it from leases; SQLite drove it from jobs) |
| new share | leases 60 rows; jobs PRIMARY range 60 rows | 0.0004 s |
| fix0 composition COUNT | jobs ALL 1M | 1.2 s |
| `/experiments.json` (fix0, stall on) | | 14.4 s |
| `/experiments.json` (fix1) | | 0.001 s (then cached) |

Pre-existing (not from this branch, same with every flag off): the claim's job finder and `claimableQueued()` filter
`jobs.status` with no index: ALL 1M rows, 1.1-1.2 s each, a claim with a supply pass 2.4-3.6 s on the box. Optional fix:
`php private/bin/job-indexes.php` (dry run) then `--apply`: one online index `idx_jobs_status_project (status(16), project_id(32))`,
built in 2.2 s here (ALGORITHM=INPLACE, LOCK=NONE; reads and writes continue). After it: ref on the index, 200 rows,
0.001-0.005 s; a full claim 0.004-0.007 s.

## Turning it on (after Travis approves each step)

1. Deploy the coordinator (this branch, after Phase 1 `8e885e1d`). Leave `experiments_enabled` false. Run `upgrade.php` (new tables).
2. Ship the worker branch to canary; check one canary computer reports `experiments: 1` and `memGB` in its runtime.
3. Set `experiments_enabled => true`. Nothing runs yet: R146 ships `"enabled": false`. Switch it on with
   `'experiments_enable' => ['r146-lagdepth']` (pre-registration: `private/experiments/PREREG-r146-lagdepth.md`). Only
   protocol-1 computers with room take runs (memGB minus `experiment_mem_reserve_gb`, default 4, must be >= 7).
4. Optionally retire wasteful types: `retire_job_types => ['bb-order3', 'bb-chunk-fables', 'bb-chunk-order3', 'sf-propose', 'sf-train', 'sf-vision']`.
5. Promote canary to stable.
