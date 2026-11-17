#!/bin/bash
# usage: run/r123/run_sweep.sh <K> <jobsTag> ; runs all sizes x arms x seeds with 4 parallel slots, skips finished outputs
cd /workspace/sweep; K=$1
for f in 4 3 2.5 2 1.75 1.5 1.25 1; do for si in 0 1; do for g in 5 11 23 37 51 64 78 91; do
  [ -s run/r123/out/K${K}_f${f}_si${si}_g${g}.json ] || echo "$f $si $g $K"; done; done; done |
xargs -P 4 -L 1 bash -c 'while [ $(awk "/MemAvailable/{print int(\$2/1048576)}" /proc/meminfo) -lt 3 ]; do sleep 20; done; node --max-old-space-size=6000 run/r123/probe.js $0 $1 $2 $3 >> run/r123/logs/K$3.log 2>&1 || echo "FAIL $0 $1 $2 $3" >> run/r123/logs/K$3.log'
echo "ALL DONE K=$K" >> run/r123/logs/K$K.log
