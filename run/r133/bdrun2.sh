#!/bin/bash
# J=jobs P=n sw/bdrun2.sh : lines k|variant|tag|nSyms, mem guard 3 GB (5 GB for 8x), log sw/logs/bd2.log
cd /workspace/sweep
run1() { IFS='|' read k v t n <<< "$1"; [ -s sw/out/bd_${t}_$k.json ] && return; g=3; [[ $t == *8x* ]] && g=6; while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt $g ]; do sleep 15; done; node --max-old-space-size=7000 sw/bookdiag.js $k "$v" $t $n >> sw/logs/bd2.log 2>&1 || echo "FAIL $t $k" >> sw/logs/bd2.log; }
export -f run1
xargs -d '\n' -P ${P:-3} -I{} bash -c 'run1 "$@"' _ {} < $J
echo ALLDONE >> sw/logs/bd2.log
