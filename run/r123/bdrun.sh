#!/bin/bash
# P=n run/r123/bdrun.sh : runs run/r123/jobs_bd.txt lines k|variant|tag with mem guard 2 GB
cd /workspace/sweep
run1() { IFS='|' read k v t <<< "$1"; [ -s run/r123/out/bd_${t}_$k.json ] && return; while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 2 ]; do sleep 15; done; node --max-old-space-size=6000 run/r123/bookdiag.js $k "$v" $t >> run/r123/logs/bd.log 2>&1 || echo "FAIL $t $k" >> run/r123/logs/bd.log; }
export -f run1
xargs -d '\n' -P ${P:-2} -I{} bash -c 'run1 "$@"' _ {} < run/r123/jobs_bd.txt
echo ALLDONE >> run/r123/logs/bd.log
