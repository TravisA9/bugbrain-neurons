#!/bin/bash
cd /workspace/sweep
for k in 2951 2953; do [ -s sw/out/bd_b30best_8x_$k.json ] && continue; while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 6 ]; do sleep 15; done; node --max-old-space-size=7000 sw/bookdiag.js $k "pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,P.granOneShot=0.03,sc.sizeF=8,P.relGrowth=1,P.pathBudget=1,P.rgDiv=2,P.trophic=16,P.recvBudget=2,P.postCapRel=1.5,P.anSelf=1,P.lagHomeo=1e-9" b30best_8x 30000 >> sw/logs/b30_8x.log 2>&1 || echo "FAIL $k" >> sw/logs/b30_8x.log; done
echo ALLDONE >> sw/logs/b30_8x.log
