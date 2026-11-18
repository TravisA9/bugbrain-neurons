#!/bin/bash
# P=n sw/bdrun.sh : runs ${J:-sw/jobs_bd.txt} lines k|variant|tag with mem guard 2 GB
cd /workspace/sweep
run1() { IFS='|' read k v t <<< "$1"; [ -s sw/out/bd_${t}_$k.json ] && return; while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 2 ]; do sleep 15; done; node --max-old-space-size=6000 sw/bookdiag.js $k "$v" $t >> sw/logs/bd.log 2>&1 || echo "FAIL $t $k" >> sw/logs/bd.log; }
export -f run1
xargs -d '\n' -P ${P:-2} -I{} bash -c 'run1 "$@"' _ {} < ${J:-sw/jobs_bd.txt}
echo ALLDONE >> sw/logs/bd.log
