#!/data/data/com.termux/files/usr/bin/bash
# run/termux_start.sh (R48): (re)start the phone worker in the background. Stop: bash run/termux_stop.sh (or `pkill -f run/dq.js`).
DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$HOME/.bugbrain_env" ] && . "$HOME/.bugbrain_env"
[ -n "$BB_DQ_TOKEN" ] || { echo "No token: run run/termux_setup.sh first."; exit 1; }
pkill -f 'run/dq.js' 2>/dev/null; pkill -f 'run/queue.js' 2>/dev/null
command -v termux-wake-lock >/dev/null && termux-wake-lock
cd "$DIR" && git pull -q --ff-only 2>/dev/null || true
export BB_DQ_TOKEN BB_WORKER
nohup node run/dq.js --phone --wait --worker "$BB_WORKER" >> "$HOME/bb-dq.log" 2>&1 &
echo "worker $BB_WORKER started (pid $!). Log: tail -f ~/bb-dq.log"
