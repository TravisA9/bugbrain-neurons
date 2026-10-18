#!/bin/bash
# R61 screen C: graded decoder readIn 0.01 combined with predErr 0 / 0.1; plus the 100k book life (does the long-life decline go away?)
cd /workspace/bb-book
B() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$1,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true,\"readIn\":0.01}}"; }
export BB_G0S=0,4 BB_PAR=4
BB_TASKS="[$(B 100000)]" node run/r47_sweep.js results_box/r61/screenC.jsonl 0 deepURSx3 deepURSx3:pl.predErr=0 deepURSx3:pl.predErr=0.1 &
sleep 2
BB_PAR=0 true
wait
