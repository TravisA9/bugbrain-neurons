#!/bin/sh
# queue.sh <jobfile> <parallel>: each line "k arm tag nSyms"; runs detached-safe (skips finished outputs)
xargs -P "$2" -L 1 sh /workspace/wordunit/job.sh < "$1"
echo "- $(date '+%H:%M') CT: queue $1 finished" >> /workspace/wordunit/STATUS.md
