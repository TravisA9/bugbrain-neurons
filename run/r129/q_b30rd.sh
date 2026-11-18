#!/bin/bash
cd /workspace/sweep
run1() { set -- $1; k=$1; f=$2; [ -s sw/out/bd_b30rd2_${f}x_$k.json ] && return; while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 2 ]; do sleep 15; done; node --max-old-space-size=6000 sw/bookdiag.js $k "pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,P.granOneShot=0.03,sc.sizeF=$f,P.relGrowth=1,P.pathBudget=1,P.rgDiv=2,P.lagHomeo=1e-9" b30rd2_${f}x 30000 >> sw/logs/b30rd.log 2>&1 || echo "FAIL $k $f" >> sw/logs/b30rd.log; }
export -f run1
printf '2951 4\n2952 4\n2953 4\n2951 2\n2952 2\n2953 2\n' | xargs -d '\n' -P ${P:-2} -I{} bash -c 'run1 "$@"' _ {}
echo ALLDONE >> sw/logs/b30rd.log
