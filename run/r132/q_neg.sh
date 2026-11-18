#!/bin/bash
cd /workspace/sweep
while pgrep -f "[q]_b30_8x.sh" >/dev/null; do sleep 20; done
for j in "2956 10000" "2957 10000" "2958 10000" "2951 30000" "2953 30000" "2952 30000"; do set -- $j; k=$1; n=$2; t=neg_4x; [ $n = 30000 ] && t=b30neg_4x
  [ -s sw/out/bd_${t}_$k.json ] && continue; while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 3 ]; do sleep 15; done
  node --max-old-space-size=6000 sw/bookdiag.js $k "pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,P.granOneShot=0.03,sc.sizeF=4,P.relGrowth=1,P.pathBudget=1,P.rgDiv=2,P.trophic=16,P.recvBudget=2,P.postCapRel=1.5,P.anSelf=1,P.lagHomeo=1e-9,P.granNeg=1" $t $n >> sw/logs/neg.log 2>&1 || echo "FAIL $k" >> sw/logs/neg.log; done
echo ALLDONE >> sw/logs/neg.log
