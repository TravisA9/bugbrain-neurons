#!/bin/bash
cd /workspace/sweep
for j in "2951 1" "2953 1"; do set -- $j; k=$1; o=$2; t=b30ltd${o}_4x; [ -s sw/out/bd_${t}_$k.json ] && continue
  while [ $(pgrep -fc "[b]ookdiag.js") -ge 3 ] || [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 3 ]; do sleep 15; done
  node --max-old-space-size=6000 sw/bookdiag.js $k "pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,sc.sizeF=4,P.relGrowth=1,P.pathBudget=1,P.rgDiv=2,P.trophic=16,P.recvBudget=2,P.postCapRel=1.5,P.anSelf=1,P.lagHomeo=1e-9,P.granOneShot=$o,P.granKalLTD=1" $t 30000 >> sw/logs/ltd.log 2>&1 || echo "FAIL $k" >> sw/logs/ltd.log; done
echo ALLDONE >> sw/logs/ltd.log
