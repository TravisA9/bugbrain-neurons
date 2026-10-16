# Running the BugBrain worker on Android (Termux)

Each phone or tablet joins the shared job list (branch `queue`), the same one the PC and the GitHub runners use, so no job is run twice.
Phone mode uses 1–2 cores. It pauses when the battery is below 30 %, when the device isn't charging, or when the battery reaches 42 °C, and it resumes on its own.

## 1. Create a GitHub token (once, on any computer)
1. Go to https://github.com/settings/personal-access-tokens/new (Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token).
2. Name: `bugbrain-phones`. Expiration: 90 days (or whatever you prefer).
3. Repository access: **Only select repositories** → `TravisA9/bugbrain-neurons`.
4. Permissions → Repository permissions → **Contents: Read and write** (leave everything else at No access; Metadata read-only is added automatically).
5. Generate, then copy the token (starts with `github_pat_`). One token can be used on all devices.

## 2. On each device
1. Install **Termux** and **Termux:API** from F-Droid (https://f-droid.org/packages/com.termux/ and https://f-droid.org/packages/com.termux.api/). The Play Store version of Termux is outdated, so don't use it.
2. Android settings → Apps → Termux → Battery → **Unrestricted** (otherwise Android kills it overnight).
3. Open Termux and paste:
   ```
   pkg update -y && pkg install -y curl && curl -fsSL https://raw.githubusercontent.com/TravisA9/bugbrain-neurons/neuro/distributed-queue/run/termux_setup.sh -o ~/bb_setup.sh && bash ~/bb_setup.sh
   ```
   When it asks, paste the token (it stays hidden). Optional name: put `BB_WORKER=tablet ` in front of `bash`.
4. Leave it plugged in. You can close Termux; the notification shows it's still running.

## Everyday commands (in Termux)
- Watch: `tail -f ~/bb-dq.log` (Ctrl+C stops watching, not the worker)
- Check the battery reading: `node ~/bugbrain-neurons/run/power.js`
- Restart after a reboot: `bash ~/bugbrain-neurons/run/termux_start.sh`
- Stop: `bash ~/bugbrain-neurons/run/termux_stop.sh`

## Notes
- The token is stored only on the device in `~/.bugbrain_env` (readable by Termux only), never in the repo. To revoke it, delete it on GitHub; to replace it, run `rm ~/.bugbrain_env && bash ~/bb_setup.sh`.
- Tuning (optional, before starting): `export BB_PHONE_MIN_PCT=40 BB_PHONE_MAX_C=40`.
- If the Termux:API app is missing, the worker can't read the battery and won't pause for power; `power.js` will tell you.
