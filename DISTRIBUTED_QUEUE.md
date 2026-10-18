# Distributed queue (run/dq.js)

Every machine (Travis's PC, GitHub Actions runners, the box, the other agent) pulls jobs from the `queue` branch of this repo.
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
