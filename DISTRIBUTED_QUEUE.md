# Distributed queue (run/dq.js)

Every worker (today the always-on `linux-pc` and `tacobell`; phones and GitHub Actions can join) pulls jobs from the `queue` branch of this repo.
No two machines run the same job: a worker claims a job by pushing `claims/<id>.json`; if someone else pushed first, GitHub
rejects the push, and the worker resyncs and picks the next job. Claims carry a lease (default 4 h, or 1.5x the job budget) renewed every
30 min; an expired claim can be taken over. Finished jobs write `done/<id>.json`, `results/<id>/` and `registry/<id>.jsonl`
(the shared registry = all `registry/*.jsonl`; one file per job, so pushes never conflict). Before running, the job is checked
against local + shared registry (the normal dedup in run/queue.js).

* Always-on workers (boot start, self-update, remote control via `worker-config.json`): see [WORKERS.md](WORKERS.md).
* Run a worker: `bun run/dq.js` (`--once`, `--hours 5`, `--wait`, `--worker NAME`). PAUSE file and battery pause work as in run/queue.js.
* Add a job: put a queue JSON (same format as experiments/queue) in `jobs/` on the `queue` branch and push.
* Actions: `.github/workflows/dq.yml`, 4 runners x ~5 h, every 6 h + manual "Run workflow". Needs the workflow file on `main`.
* Push access: PC uses its git login; Actions uses GITHUB_TOKEN; other machines need a token (`BB_DQ_REPO=https://x-access-token:TOKEN@github.com/TravisA9/bugbrain-neurons.git`).

## Job files (R60+)
A job is `jobs/<id>.json`: `{ id, title, priority, estHours, slotHours, requires, runs: [{ script: "run/r42.js", args: [plan, taskJSON, G, variant, g0, "--force"], env: { BB_OUT } }] }`.
Generators live in `run/rNN_jobs.js` (e.g. `node run/r70_jobs.js outdir`); the queue review copies their output to `jobs/` (skipping anything already claimed or done).
- `requires`: files that must exist in the worker's checkout; a worker on older code skips the job until it self-updates.
- `memGB` (R75, optional): peak memory of ONE run in GB. `run/mempar.js` then runs at most floor(min(0.7 x total RAM, 0.9 x free RAM) / memGB) of the job's runs at once
  (an 8x-cortex book run peaks at ~4.4 GB; 8 at once killed linux-pc every 4 min). Jobs using it list `run/mempar.js` in `requires`.
- Crash-loop guard (R75, run/dq.js): a supervised worker that restarts while holding a job counts it in `~/.bugbrain/crashloop.json`; the 2nd restart within 6 h
  makes that worker skip the job for 12 h (other workers can still take it). The heartbeat file `workers/<name>.json` lists such jobs under `crashSkip`.
- `variant`: comma-separated overrides, `sc.<gene>=` (growth), `pl.<gene>=` (plasticity), `@region` to limit one to a region (`pl.lr@cortex=0.2`,
  `sc.grid@context=120`, `@!striatum` = all but), `P.<param>=` (engine / env params, e.g. `P.fastEngine=1`).
- **Pinning:** when a default is about to change, every arm of a pending job sets the affected value explicitly (e.g. `pl.lr@cortex=0.1`,
  `P.fastEngine=1`), so no job changes meaning when the workers pick up the new code.
- Growth seeds (`g0`): 0-15 are the screening growths; 1000+, 1100+, 1200+, 1300+, 1400+ are fresh sets used once for confirmations.
- Adoption rule: a change becomes the default only after 16 held-out growths with no task worse (paired by growth, t < -2 counts as worse).
