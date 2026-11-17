#!/bin/bash
cd /workspace/sweep
while kill -0 384869 2>/dev/null; do sleep 20; done
run/r123/tests.sh
pkill -f "run_jobs.sh run/r123/jobs_rgv3.txt"; pkill -f "xargs -d .n -P 1 -n 1 run/r123/one.sh run/r123/logs/rgv3.log"; sleep 2
while pgrep -f "^/bin/bash run/r123/one.sh run/r123/logs/rgv3.log" >/dev/null; do sleep 10; done
P=2 run/r123/run_jobs.sh run/r123/jobs_rgv3.txt run/r123/logs/rgv3.log
