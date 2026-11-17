#!/bin/bash
cd /workspace/bb
for k in 2944 2945 2946 2947 2948 2949 2951 2952 2953; do echo $k; done | xargs -P 4 -I{} sh -c "BB_DUMP=/workspace/hr2/lim/os.{} node run/r118_probe.js deepURSx3 '{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":30000,\"evalSyms\":2000,\"genSyms\":500}}' {} 'pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,P.granOneShot=0.03' >> /workspace/hr2/os30.jsonl 2>>/workspace/hr2/os30.err"
echo DONE >> /workspace/hr2/os30.log
