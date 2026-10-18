#!/bin/bash
# R61 screen D: learning-rule fixes, all with the graded decoder (readIn 0.01). Run D1 after C2 (2 procs), D2 after C (4 procs).
cd /workspace/bb-book
R=',"readIn":0.01'
B() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$1,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true$R}}"; }
export BB_G0S=0,4 BB_TASKS="[$(B 30000),$(B 10000),{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":4000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order3\",\"K\":8$R}}]"
if [ "$1" = 1 ]; then
  while pgrep -f "screenC2.jsonl" >/dev/null; do sleep 30; done
  BB_PAR=2 node run/r47_sweep.js results_box/r61/screenD.jsonl 0 deepURSx3:pl.metaN=0 deepURSx3:pl.metaCap=200
else
  while pgrep -f "screenC.jsonl" >/dev/null; do sleep 30; done
  BB_PAR=4 node run/r47_sweep.js results_box/r61/screenD2.jsonl 0 deepURSx3:pl.peMode=18 deepURSx3:pl.mixHomeo=0.05 deepURSx3:pl.metaN=0,pl.predErr=0
fi
