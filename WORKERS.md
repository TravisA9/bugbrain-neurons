# Always-on workers

Set up each machine once. After that it starts at boot, restarts itself, and follows new code, jobs and settings from GitHub within ~10 minutes.
No arguments and no manual pulls.

You need a GitHub token **once** (fine-grained, repo `TravisA9/bugbrain-neurons`, **Contents: Read and write**; see TERMUX.md step 1).
The installer asks for it and stores it only on that device in `~/.bugbrain/token` (chmod 600). It is never printed or committed.

## Linux PC (e.g. linux-pc)
Stop any old worker first (Ctrl+C in its terminal, or `pkill -f run/dq.js`). Then:
```
git clone -b neuro/distributed-queue https://github.com/TravisA9/bugbrain-neurons.git ~/bugbrain-neurons
sh ~/bugbrain-neurons/run/install-linux.sh linux-pc
```
This installs a systemd user service (`bugbrain-worker`) and turns on linger, so it keeps running after logout and starts at boot.
If it prints `sudo loginctl enable-linger ...`, run that line once. Without systemd it falls back to crontab `@reboot`.

## Android phone / tablet (Termux)
Install **Termux**, **Termux:API** and **Termux:Boot** from F-Droid. Open Termux:Boot once. In Android settings set Termux battery use to **Unrestricted**. Then in Termux:
```
pkg install -y git && git clone -b neuro/distributed-queue https://github.com/TravisA9/bugbrain-neurons.git ~/bugbrain-neurons && sh ~/bugbrain-neurons/run/install-termux.sh
```
An old phone setup (`~/.bugbrain_env`) is picked up automatically: same token, same name, and the old worker is stopped. Phones run in phone mode (power guard).

## Windows
In PowerShell (needs Git for Windows and Node.js):
```
git clone -b neuro/distributed-queue https://github.com/TravisA9/bugbrain-neurons.git $HOME\bugbrain-neurons
powershell -ExecutionPolicy Bypass -File $HOME\bugbrain-neurons\run\install-windows.ps1 -Name my-pc
```
This registers a hidden Task Scheduler task `BugBrainWorker` that runs at logon. Press Enter at the token prompt to use this PC's own git login.
It is separate from the local `run/queue.js` runner, which is left untouched.

## Everyday
- Log: `tail -f ~/.bugbrain/worker.log` (Windows: `%USERPROFILE%\.bugbrain\worker.log`)
- Stop / start (Linux): `systemctl --user stop bugbrain-worker` / `start`. Termux: `pkill -f bugbrain/worker.sh; pkill -f run/supervisor.js`. Windows: Task Scheduler → BugBrainWorker → End.
- Rename: put the name in `~/.bugbrain/worker-name` and restart. New token: overwrite `~/.bugbrain/token` (the worker retries within a minute).
- Local edits in the checkout are stashed, not lost (`git stash list`).

## How it works
`~/.bugbrain/worker.sh` (or `worker.ps1`) is a tiny launcher copied out of the repo, so it never changes under itself. In a loop it:
1. fetches `neuro/distributed-queue` and resets `~/bugbrain-neurons` to it (local edits are stashed);
2. runs `run/supervisor.js`, which reads `worker-config.json` from the `queue` branch and runs `run/dq.js --wait` with those settings;
3. starts again at once when the supervisor asks for an update, and backs off after crashes.

The supervisor checks GitHub every `pollMinutes` (default 10). dq.js also checks for new code before every claim and every 2 min while waiting, so jobs that `require` new files are picked up without a manual pull.
Each worker writes `workers/<name>.json` on the queue branch (state, job, code version, config version) when its state changes and every 30 min.

## Remote control (push to the `queue` branch only)
Edit `worker-config.json` at the root of the queue branch:
```json
{
  "version": 1,
  "forceVersion": 0,
  "defaults": { "mode": "run", "pollMinutes": 10 },
  "types":   { "phone": { "phone": true }, "linux": {}, "windows": {} },
  "workers": { "linux-pc": {}, "phone-pixel-7": { "mode": "pause" } },
  "jobs":    { "w08_*": { "priority": 0.2 }, "v09_markov_more": "block" }
}
```
| want | change | takes effect |
|---|---|---|
| pause / resume a device (or all phones) | `workers.<name>.mode` (or `types.phone.mode`) = `"pause"` / `"run"` | the current job finishes; within ~3–10 min |
| see what a device would pick, without claiming | `mode: "observe"` | next poll |
| re-prioritise or block jobs everywhere | `jobs: { "<id or prefix*>": { "priority": x } }` or `"block"` | next claim (no restart) |
| limit a device to some jobs | `only: ["w*"]`, `skip: [...]`, `minPriority: 0.9` | next claim |
| restart all workers after their current job | bump `version` (or `types.X.version` / `workers.N.version`) | ≤ 10 min + current job |
| restart now, killing running jobs | bump `forceVersion` (claims are released on restart, so jobs restart from scratch) | ≤ 10 min |
| new code | push to `neuro/distributed-queue` | after the current job, ≤ 2–10 min |
| other settings | `hours`, `phone`, `workers` (parallel runs per job), `allowBattery`, `includeText`, `pollMinutes` | graceful restart |

Settings layer as built-in < `defaults` < `types[linux|windows|mac|phone]` < `workers[name]`.
Exit codes: dq.js 3 = token refused (the launcher waits for a new token file); 10 = update and restart.
