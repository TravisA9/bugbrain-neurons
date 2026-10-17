#!/bin/bash
# R53 confirm 3: candidate vs base on text1000 + order2 (growths 32-47) and text5000 (growths 0-15); resumable, 4 processes
cd /workspace/spiking-arena
export BB_PAR=4
V="deepURSx3 deepURSx3:pl.predErr=0.3,pl.peMode=16,pl.peFix=0.01"
BB_TASKS='[{"env":"seq","params":{"source":"text","nSyms":1000}},{"env":"seqchoice","params":{"source":"order2","nSyms":1000}}]' node run/r47_sweep.js results_box/r53/confirm3.jsonl 32 $V
echo "c3a done $(date)"
BB_TASKS='[{"env":"seq","params":{"source":"text","nSyms":5000}}]' node run/r47_sweep.js results_box/r53/confirm3.jsonl 0 $V
echo "c3 done $(date)"
