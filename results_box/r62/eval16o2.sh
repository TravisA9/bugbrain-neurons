#!/bin/bash
# R61 eval16 extra: order2 with clock2/clock3 (the plain order2@1000 task is near 0 for both arms), base vs candidate
cd /workspace/bb-book
export BB_G0S=0,4,8,12 BB_PAR=1
BB_TASKS='[{"env":"seq","params":{"source":"order2","nSyms":1000,"clock2":true,"clock3":true}}]' node run/r47_sweep.js results_box/r61/eval16.jsonl 0 deepURSx3 &
BB_TASKS='[{"env":"seq","params":{"source":"order2","nSyms":1000,"clock2":true,"clock3":true,"readIn":0.01}}]' node run/r47_sweep.js results_box/r61/eval16b.jsonl 0 deepURSx3:pl.predErr=0 &
wait
