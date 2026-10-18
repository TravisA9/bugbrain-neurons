#!/bin/bash
# R61 fix screen, 8 growths (chunks g0 0,4), resumable. A: graded decoder readIn 0.01 (task param) + base no-harm tasks; B: predErr dose / lr variants
cd /workspace/bb-book
B() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$1,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true$2}}"; }
F() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":4000$1}}"; }
O() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"order3\",\"K\":8$1}}"; }
R=',"readIn":0.01'
export BB_G0S=0,4
if [ "$1" = A ]; then
  export BB_PAR=2 BB_TASKS="[$(B 30000 $R),$(B 10000 $R),$(F),$(O),$(F $R),$(O $R)]"
  node run/r47_sweep.js results_box/r61/screenA.jsonl 0 deepURSx3
else
  while pgrep -f "r47_sweep.js results_box/r61/curve" >/dev/null; do sleep 60; done
  export BB_PAR=4 BB_TASKS="[$(B 30000),$(B 10000),$(F),$(O)]"
  node run/r47_sweep.js results_box/r61/screenB.jsonl 0 deepURSx3:pl.predErr=0.1 deepURSx3:pl.predErr=0 deepURSx3:pl.lr=0.02
fi
