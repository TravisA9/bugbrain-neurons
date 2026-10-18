#!/bin/bash
# R61: 30k recordings (seed 11) of base and graded decoder + predErr 0, then screen D1
cd /workspace/bb-book
while pgrep -f "screenC2.jsonl" >/dev/null; do sleep 30; done
node run/r61_rec.js deepURSx3 30000 2000 11 /workspace/r61rec/p_v35_30000_s11 > /workspace/r61rec/p_v35_30000_s11.log 2>&1 &
node run/r61_rec.js deepURSx3 30000 2000 11 /workspace/r61rec/p_ri_pe0_30000_s11 T.readIn=0.01,pl.predErr=0 > /workspace/r61rec/p_ri_pe0_30000_s11.log 2>&1 &
wait
results_box/r61/screenD.sh 1
