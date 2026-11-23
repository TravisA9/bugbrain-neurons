#!/bin/bash
# R144m: wait for gate children to finish (gate paused), run 5 jobs 3 at a time, then resume gate
cd /workspace/sweep
while [ $(pgrep -fc "[r]un/r42.js") -gt 0 ]; do sleep 10; done
echo "$(date +%T) gate children done" >> run/r144m/q.log
run1(){ k=$1; o=$(node --max-old-space-size=7000 run/r42.js deepURSx3 '{"env":"seq","params":{"source":"text","nSyms":1000,"readIn":0.01}}' 1 'pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1,P.granUtility=2,P.granExact=1,P.granCo=1,P.granKal=1,P.granOneShot=0.03,P.lagHomeo=1e-9,P.relGrowth=1,P.pathBudget=1,P.rgDiv=2,P.trophic=16,P.recvBudget=2,P.postCapRel=1.5,P.anSelf=1,P.granTrace=1,P.granChunk=1,P.granChunkGate=2,P.granScale=2,sc.sizeF=4,P.lagDepth=32,P.lagBlur=1,P.lagGate=1,P.lagSurp=2,P.lagEvid=3' $k 2>>run/r144m/err.log); echo "$o" | python3 -c "import sys,json;s=sys.stdin.read();r=json.loads(s[s.index('{'):]);print(json.dumps({'k':$k,'arm':'S2_ev3','task':'text1000','mean':r['mean'],'stats':r['stats']}))" >> run/r144m/x.jsonl; echo "$(date +%T) done $k" >> run/r144m/q.log; }
run1 2960 & run1 2961 & run1 2962 & wait
run1 2970 & run1 2971 & wait
kill -CONT 74824; echo "$(date +%T) gate resumed" >> run/r144m/q.log
