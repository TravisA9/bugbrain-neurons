#!/bin/sh
# run/worker.sh (R61): stable launcher for an always-on BugBrain worker (Linux, macOS, Termux). Never needs editing:
# the installers copy it to ~/.bugbrain/worker.sh and all logic lives in run/supervisor.js, which is updated from git.
# Loop: fetch + reset the checkout to origin/neuro/distributed-queue (local edits are stashed), run the supervisor,
# restart at once when it asks for an update (exit 10), wait for a new token on exit 3, back off on crashes.
# Optional env: BB_HOME (checkout, default ~/bugbrain-neurons), BB_REPO, BB_CODE_BRANCH, BB_STATE_DIR (default ~/.bugbrain).
ST="${BB_STATE_DIR:-$HOME/.bugbrain}"; DIR="${BB_HOME:-$HOME/bugbrain-neurons}"; BR="${BB_CODE_BRANCH:-neuro/distributed-queue}"
REPO="${BB_REPO:-https://github.com/TravisA9/bugbrain-neurons.git}"; LOG="$ST/worker.log"
mkdir -p "$ST"; chmod 700 "$ST" 2>/dev/null
# Single instance (Phase 0). A launcher that is still running from before this version only has its pid file, so a
# live pid with a matching command line always wins. Compute Lab launchers (run/worker.sh, started through
# ~/.bugbrain/computelab-worker.sh) only yield to another Compute Lab launcher, never to the old GitHub-token worker
# (~/.bugbrain/worker.sh), which used the same worker.pid and could block Compute Lab forever.
if [ -n "${BB_COORDINATOR_URL:-}" ]; then PAT='run/worker.sh'; PIDS="$ST/computelab.pid $ST/worker.pid"; else PAT='worker.sh'; PIDS="$ST/worker.pid"; fi
for pf in $PIDS; do
  op="$(cat "$pf" 2>/dev/null)"
  case "$op" in ''|*[!0-9]*) continue ;; esac
  [ "$op" = $$ ] && continue
  if kill -0 "$op" 2>/dev/null && { [ ! -r "/proc/$op/cmdline" ] || tr '\0' ' ' < "/proc/$op/cmdline" | grep -q "$PAT"; }; then echo "worker already running (pid $op)"; exit 0; fi
done
# flock on fd 9 when available (util-linux): the kernel drops the lock when this launcher dies, so a stale pid or a
# reused pid can never block a restart. Child processes do not inherit fd 9 (9>&- below), so an orphaned job can
# never hold the lock either.
if command -v flock >/dev/null 2>&1; then
  exec 9>>"$ST/launcher.lock"
  flock -n 9 || { echo "worker already running (launcher lock $ST/launcher.lock is held)"; exit 0; }
fi
echo $$ > "$ST/worker.pid"
# No other launcher runs (checked above), so a stop file is left over from a worker that died; it would stop this one at once.
rm -f "$ST/dq.stop"
log() { echo "[$(date '+%F %T')] [launcher] $*" >> "$LOG"; }
# Node.js lookup (Phase 0): PATH, the folder setup wrote into computelab.env, the newest nvm or fnm Node, Volta,
# /usr/local/bin, /usr/bin, /snap/bin. Services do not read ~/.bashrc, and an nvm or fnm upgrade can delete the exact
# folder setup saw, so look again on every start instead of trusting one fixed path. The newest Node 18+ wins.
node_major() { "$1" -p "process.versions.node.split('.')[0]" 2>/dev/null </dev/null; }
find_runtime() {
  envdir=$(sed -n "s/^export PATH='\([^']*\)'.*/\1/p" "$ST/computelab.env" 2>/dev/null | head -n 1)
  best=; bm=0; first=
  for c in "$(command -v node 2>/dev/null)" "${envdir:+$envdir/node}" \
           "$HOME"/.nvm/versions/node/*/bin/node \
           "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node "$HOME"/.fnm/node-versions/*/installation/bin/node \
           "$HOME/.volta/bin/node" "$HOME/.local/bin/node" $(for sd in ${BB_NODE_SYSTEM_DIRS:-/usr/local/bin /usr/bin /snap/bin /opt/homebrew/bin}; do printf '%s ' "$sd/node"; done); do
    [ -n "$c" ] && [ -x "$c" ] || continue
    m=$(node_major "$c"); case "$m" in ''|*[!0-9]*) continue ;; esac
    [ -z "$first" ] && first=$c
    if [ "$m" -ge 18 ] && [ "$m" -gt "$bm" ]; then best=$c; bm=$m; fi
  done
  if [ -n "$best" ]; then printf '%s' "$best"; elif command -v bun >/dev/null 2>&1; then command -v bun; elif [ -n "$first" ]; then printf '%s' "$first"; fi
}
# Tell the Compute Lab site that this computer has no usable Node.js (curl or wget, at most once an hour). The token
# goes in a header read from a private file and is never printed. Uses the existing diagnostics API.
report_no_node() {
  [ -n "${BB_COORDINATOR_URL:-}" ] || return 0
  tf="${BB_COORDINATOR_TOKEN_FILE:-$ST/coordinator-token}"; [ -s "$tf" ] || return 0
  stamp="$ST/.no-node-reported"; now=$(date +%s)
  last=$(cat "$stamp" 2>/dev/null); case "$last" in ''|*[!0-9]*) last=0 ;; esac
  [ $((now - last)) -lt 3600 ] && return 0
  echo "$now" > "$stamp"
  os=$(uname -sr 2>/dev/null | tr -d '"\\'); distro=$( (. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-}") | tr -d '"\\')
  body=$(printf '{"kind":"error","ok":false,"summary":"Node.js 18 or newer was not found, so the worker cannot start","hint":"Install Node.js 20 LTS (https://nodejs.org/en/download) or run the Compute Lab setup command again.","os":"%s","distro":"%s","arch":"%s","install":"%s","launcher":"worker.sh"}' "$os" "$distro" "$(uname -m 2>/dev/null)" "${BB_INSTALL:-}")
  hdr="$ST/.nonode-auth"; ( umask 077; printf 'Authorization: Bearer %s\n' "$(tr -d ' \r\n' < "$tf")" > "$hdr" )
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 20 -A computelab-launcher -H "@$hdr" -H 'Content-Type: application/json' -d "$body" "${BB_COORDINATOR_URL%/}/api/v1/diagnostics" >/dev/null 2>&1 </dev/null && log "reported the missing Node.js to the Compute Lab site"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 20 -U computelab-launcher --header="$(cat "$hdr")" --header='Content-Type: application/json' --post-data="$body" -O /dev/null "${BB_COORDINATOR_URL%/}/api/v1/diagnostics" >/dev/null 2>&1 </dev/null && log "reported the missing Node.js to the Compute Lab site"
  fi
  rm -f "$hdr"
}
RT="$(find_runtime)"; export GIT_TERMINAL_PROMPT=0
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
  [ -n "$RT" ] && [ -x "$RT" ] || RT="$(find_runtime)"
  [ -n "$RT" ] || { log "node (or bun) not found; retry in 5 min"; report_no_node; sleep 300; RT="$(find_runtime)"; continue; }
  case "$RT" in */*) rd=$(dirname "$RT"); case ":$PATH:" in *":$rd:"*) ;; *) PATH="$rd:$PATH"; export PATH ;; esac ;; esac
  t0=$(date +%s); "$RT" run/supervisor.js >> "$LOG" 2>&1 9>&-; code=$?; ran=$(( $(date +%s) - t0 ))
  if [ "$code" = 10 ]; then fails=0; continue; fi
  if [ "$code" = 3 ]; then
    log "token refused: put a valid token in $ST/token (chmod 600); checking again every minute"
    m0="$(ls -l "$ST/token" 2>/dev/null)"; i=0; while [ $i -lt 30 ] && [ "$(ls -l "$ST/token" 2>/dev/null)" = "$m0" ]; do sleep 60; i=$((i+1)); done; continue; fi
  [ $ran -gt 600 ] && fails=0; fails=$((fails+1)); w=$((15 * (1 << (fails > 6 ? 6 : fails - 1)))); [ $w -gt 600 ] && w=600
  log "supervisor exited ($code) after ${ran}s; restart in ${w}s"; sleep $w
done
