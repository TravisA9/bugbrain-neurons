#!/bin/bash
# serial 8x queue: wait until no 8x bookdiag runs, then run the next job (no memory-guard race)
cd /workspace/sweep
while read -r L; do IFS='|' read k v t n <<< "$L"; [ -s sw/out/bd_${t}_$k.json ] && continue
  while pgrep -f "bookdiag.js.*_8x" >/dev/null; do sleep 20; done
  node --max-old-space-size=7000 sw/bookdiag.js $k "$v" $t $n >> sw/logs/bd2.log 2>&1 || echo "FAIL $t $k" >> sw/logs/bd2.log
done < sw/jobs_r139_8x.txt
