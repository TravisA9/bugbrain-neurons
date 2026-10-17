#!/bin/bash
# R53 step 2: smaller fixed part (peFix 0.01) after the first hybrid screen
cd /workspace/spiking-arena
while kill -0 2430829 2>/dev/null; do sleep 20; done
export BB_PAR=3
node run/r47_sweep.js results_box/r53/hybrid.jsonl 0 deepURSx3:pl.predErr=0.5,pl.peMode=16,pl.peFix=0.01 deepURSx3:pl.predErr=0.3,pl.peMode=16,pl.peFix=0.01
echo "hybrid2 done $(date)"
BB_TASKS='[{"env":"seqchoice","params":{"source":"order2","nSyms":1000}}]' node run/r47_sweep.js results_box/r53/order2.jsonl 0 deepURSx3:pl.predErr=0.5,pl.peMode=16,pl.peFix=0.01 deepURSx3:pl.predErr=0.3,pl.peMode=16,pl.peFix=0.01
echo "order2b done $(date)"
