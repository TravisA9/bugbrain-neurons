#!/bin/sh
# run/install-linux.sh (R61): one-time setup of an always-on BugBrain worker on Linux (systemd user service; crontab fallback).
#   sh run/install-linux.sh [worker-name]
# Asks once for the GitHub token if ~/.bugbrain/token is missing. Safe to re-run.
set -e
ST="$HOME/.bugbrain"; DIR="${BB_HOME:-$HOME/bugbrain-neurons}"; SRC="$(cd "$(dirname "$0")" && pwd)"
command -v git >/dev/null || { echo "Please install git first (sudo apt install git)"; exit 1; }
command -v node >/dev/null || command -v bun >/dev/null || { echo "Please install Node.js 18+ first (sudo apt install nodejs) or bun"; exit 1; }
mkdir -p "$ST"; chmod 700 "$ST"
if [ ! -s "$ST/token" ]; then
  if [ -n "$BB_DQ_TOKEN" ]; then T="$BB_DQ_TOKEN"; else printf 'Paste the GitHub token (input hidden): '; stty -echo 2>/dev/null; read -r T; stty echo 2>/dev/null; echo; fi
  [ -n "$T" ] || { echo "No token given; stopping."; exit 1; }
  ( umask 077; printf '%s\n' "$T" > "$ST/token" ); chmod 600 "$ST/token"; T=""; echo "token saved in $ST/token (only you can read it)"
fi
[ -n "$1" ] && printf '%s\n' "$1" > "$ST/worker-name"
cp "$SRC/worker.sh" "$ST/worker.sh"; chmod 700 "$ST/worker.sh"
[ -d "$DIR/.git" ] || git clone -q -b neuro/distributed-queue https://github.com/TravisA9/bugbrain-neurons.git "$DIR"
if command -v systemctl >/dev/null && systemctl --user show-environment >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/bugbrain-worker.service" <<UNIT
[Unit]
Description=BugBrain always-on worker
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/bin/sh %h/.bugbrain/worker.sh
Environment=PATH=$(dirname "$(command -v node || command -v bun)"):/usr/local/bin:/usr/bin:/bin
Restart=always
RestartSec=30
Nice=10
KillMode=control-group
[Install]
WantedBy=default.target
UNIT
  rm -f "$ST/worker.pid"
  systemctl --user daemon-reload; systemctl --user enable --now bugbrain-worker.service
  loginctl enable-linger "$USER" 2>/dev/null || sudo loginctl enable-linger "$USER" || echo "!! run once: sudo loginctl enable-linger $USER   (keeps the worker running after logout / at boot)"
  echo "installed: systemd user service bugbrain-worker (status: systemctl --user status bugbrain-worker)"
else
  ( crontab -l 2>/dev/null | grep -v 'bugbrain/worker.sh'; echo "@reboot nohup /bin/sh $ST/worker.sh >/dev/null 2>&1 &" ) | crontab -
  nohup /bin/sh "$ST/worker.sh" >/dev/null 2>&1 &
  echo "installed: crontab @reboot + started now"
fi
echo "worker name: $(cat "$ST/worker-name" 2>/dev/null || echo '(derived from the hostname on first start)')   log: tail -f $ST/worker.log"
