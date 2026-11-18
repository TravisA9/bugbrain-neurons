#!/bin/bash
cd /workspace/sweep
while pgrep -f "[q]_b30val.sh" >/dev/null; do sleep 20; done
run1() { set -- $1; k=$1; o=$2; t=b30os${o}_4x; [ -s sw/out/bd_${t}_$k.json ] && return; while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 3 ]; do sleep 15; done
  node --max-old-space-size=6000 sw/bookdiag.js $k "pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,sc.sizeF=4,P.relGrowth=1,P.pathBudget=1,P.rgDiv=2,P.trophic=16,P.recvBudget=2,P.postCapRel=1.5,P.anSelf=1,P.lagHomeo=1e-9,P.granOneShot=$o" $t 30000 >> sw/logs/os.log 2>&1 || echo "FAIL $k $o" >> sw/logs/os.log; }
export -f run1
printf "2951 1\n2953 1\n2951 2\n2953 2\n" | xargs -d '\n' -P 2 -I{} bash -c 'run1 "$@"' _ {}
echo ALLDONE >> sw/logs/os.log
