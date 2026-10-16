#!/data/data/com.termux/files/usr/bin/bash
pkill -f 'run/dq.js'; pkill -f 'run/queue.js'; pkill -f 'run/runner.js'; pkill -f 'run/ablate.js'
command -v termux-wake-unlock >/dev/null && termux-wake-unlock; echo "BugBrain worker stopped."
