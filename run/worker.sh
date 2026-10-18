#!/bin/sh
# run/worker.sh (R61): stable launcher for an always-on BugBrain worker (Linux, macOS, Termux). Never needs editing:
# the installers copy it to ~/.bugbrain/worker.sh and all logic lives in run/supervisor.js, which is updated from git.
# Loop: fetch + reset the checkout to origin/neuro/distributed-queue (local edits are stashed), run the supervisor,
# restart at once when it asks for an update (exit 10), wait for a new token on exit 3, back off on crashes.
# Optional env: BB_HOME (checkout, default ~/bugbrain-neurons), BB_REPO, BB_CODE_BRANCH, BB_STATE_DIR (default ~/.bugbrain).
ST="${BB_STATE_DIR:-$HOME/.bugbrain}"; DIR="${BB_HOME:-$HOME/bugbrain-neurons}"; BR="${BB_CODE_BRANCH:-neuro/distributed-queue}"
REPO="${BB_REPO:-https://github.com/TravisA9/bugbrain-neurons.git}"; LOG="$ST/worker.log"
mkdir -p "$ST"; chmod 700 "$ST" 2>/dev/null
op="$(cat "$ST/worker.pid" 2>/dev/null)"
if [ -n "$op" ] && [ "$op" != $$ ] && kill -0 "$op" 2>/dev/null && { [ ! -r "/proc/$op/cmdline" ] || grep -q worker.sh "/proc/$op/cmdline"; }; then echo "worker already running (pid $(cat "$ST/worker.pid"))"; exit 0; fi
echo $$ > "$ST/worker.pid"
log() { echo "[$(date '+%F %T')] [launcher] $*" >> "$LOG"; }
RT="$(command -v node || command -v bun)"; export GIT_TERMINAL_PROMPT=0
fails=0
while :; do
  [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ] && mv -f "$LOG" "$LOG.1"
  if [ ! -d "$DIR/.git" ]; then log "cloning $BR into $DIR"; git clone -q -b "$BR" "$REPO" "$DIR" >> "$LOG" 2>&1 || { log "clone failed; retry in 60 s"; sleep 60; continue; }; fi
  cd "$DIR" || { sleep 60; continue; }
  if git fetch -q origin "+refs/heads/$BR:refs/bb/code" >> "$LOG" 2>&1; then
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then git stash push -q -m "bb-worker autostash $(date '+%F %T')" >> "$LOG" 2>&1 && log "local edits stashed (git stash list)"; fi
    old="$(git rev-parse --short HEAD 2>/dev/null)"
    git checkout -q -B "$BR" refs/bb/code >> "$LOG" 2>&1 && git reset -q --hard refs/bb/code >> "$LOG" 2>&1
    new="$(git rev-parse --short HEAD)"; [ "$old" != "$new" ] && log "code $old -> $new"
  else log "fetch failed; running the code that is here"; fi
  [ -n "$RT" ] || { log "node (or bun) not found; retry in 5 min"; sleep 300; RT="$(command -v node || command -v bun)"; continue; }
  t0=$(date +%s); "$RT" run/supervisor.js >> "$LOG" 2>&1; code=$?; ran=$(( $(date +%s) - t0 ))
  if [ "$code" = 10 ]; then fails=0; continue; fi
  if [ "$code" = 3 ]; then
    log "token refused: put a valid token in $ST/token (chmod 600); checking again every minute"
    m0="$(ls -l "$ST/token" 2>/dev/null)"; i=0; while [ $i -lt 30 ] && [ "$(ls -l "$ST/token" 2>/dev/null)" = "$m0" ]; do sleep 60; i=$((i+1)); done; continue; fi
  [ $ran -gt 600 ] && fails=0; fails=$((fails+1)); w=$((15 * (1 << (fails > 6 ? 6 : fails - 1)))); [ $w -gt 600 ] && w=600
  log "supervisor exited ($code) after ${ran}s; restart in ${w}s"; sleep $w
done
