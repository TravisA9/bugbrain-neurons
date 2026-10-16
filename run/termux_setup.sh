#!/data/data/com.termux/files/usr/bin/bash
# run/termux_setup.sh (R48): one-shot setup + start of the BugBrain distributed-queue worker on an Android phone/tablet (Termux).
#   BB_DQ_TOKEN=<fine-grained token> BB_WORKER=<name> bash termux_setup.sh
# Re-running is safe: it updates the code and restarts the worker. The token is never put in this file or in the repo;
# it is kept only in ~/.bugbrain_env (chmod 600, this device) so the worker can be restarted with run/termux_start.sh.
set -e
BRANCH="${BB_BRANCH:-neuro/distributed-queue}"
DIR="${BB_DIR:-$HOME/bugbrain-neurons}"
REPO="https://github.com/TravisA9/bugbrain-neurons.git"
if [ -z "$BB_DQ_TOKEN" ] && [ -f "$HOME/.bugbrain_env" ]; then . "$HOME/.bugbrain_env"; fi
if [ -z "$BB_DQ_TOKEN" ]; then printf 'Paste the GitHub token (input hidden): '; read -rs BB_DQ_TOKEN; echo; fi
[ -n "$BB_DQ_TOKEN" ] || { echo "No token given; stopping."; exit 1; }
WORKER="${BB_WORKER:-$(getprop ro.product.model 2>/dev/null | tr -cs 'A-Za-z0-9' '-' | sed 's/-*$//')}"
WORKER="${WORKER:-android}-$(od -An -N2 -tx2 /dev/urandom | tr -d ' ')"
echo "== packages"; pkg update -y >/dev/null 2>&1 || true
pkg install -y git nodejs-lts termux-api >/dev/null 2>&1 || pkg install -y git nodejs termux-api
echo "== code ($BRANCH)"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" FETCH_HEAD
else git clone -q --branch "$BRANCH" "$REPO" "$DIR"; fi
umask 077; { echo "export BB_DQ_TOKEN='$BB_DQ_TOKEN'"; echo "export BB_WORKER='$WORKER'"; } > "$HOME/.bugbrain_env"; chmod 600 "$HOME/.bugbrain_env"
echo "== power check"; node "$DIR/run/power.js" || true
bash "$DIR/run/termux_start.sh"
