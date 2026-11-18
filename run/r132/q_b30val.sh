#!/bin/bash
cd /workspace/sweep
while pgrep -f "[x]args.*" >/dev/null && pgrep -f "[b]drun.sh" >/dev/null; do sleep 30; done
run1() { set -- $1; k=$1; t=$2; [ -s sw/out/bd_b30v_${t}_$k.json ] && return; while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 3 ]; do sleep 15; done
  if [ $t = 1x ]; then v="pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,P.granOneShot=0.03,P.lagHomeo=1e-9"; else v="pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,P.granOneShot=0.03,sc.sizeF=4,P.relGrowth=1,P.pathBudget=1,P.rgDiv=2,P.trophic=16,P.recvBudget=2,P.postCapRel=1.5,P.anSelf=1,P.lagHomeo=1e-9"; fi
  node --max-old-space-size=6000 sw/bookdiag.js $k "$v" b30v_$t 30000 >> sw/logs/b30v.log 2>&1 || echo "FAIL $k $t" >> sw/logs/b30v.log; }
export -f run1
printf '2954 4x\n2954 1x\n2955 4x\n2955 1x\n2956 4x\n2956 1x\n2957 4x\n2957 1x\n' | xargs -d '\n' -P 2 -I{} bash -c 'run1 "$@"' _ {}
echo ALLDONE >> sw/logs/b30v.log
