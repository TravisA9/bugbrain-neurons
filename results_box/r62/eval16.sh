#!/bin/bash
# R61 held-out evaluation, 16 growths (chunks 0,4,8,12): base v35 vs candidate (graded decoder readIn 0.01 + pl.predErr 0)
# arm a = base (starts after screen D1, 2 procs), arm b = candidate (after D2, 4 procs). 8-growth rows from earlier screens are re-used (same keys).
cd /workspace/bb-book
T() { local R=$1; echo "[{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":30000,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true$R}},{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":10000,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true$R}},{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":4000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order3\",\"K\":8$R}},{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":2000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order2\",\"nSyms\":1000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"text\",\"nSyms\":1000$R}}]"; }
export BB_G0S=0,4,8,12
if [ "$1" = a ]; then
  while pgrep -f "screenD.jsonl" >/dev/null || pgrep -f rec30.sh >/dev/null; do sleep 30; done
  BB_PAR=2 BB_TASKS="$(T '')" node run/r47_sweep.js results_box/r61/eval16.jsonl 0 deepURSx3
else
  while pgrep -f "screenD2.jsonl" >/dev/null || pgrep -f "screenD.sh 2" >/dev/null; do sleep 30; done
  BB_PAR=2 BB_TASKS="$(T ',"readIn":0.01')" node run/r47_sweep.js results_box/r61/eval16b.jsonl 0 deepURSx3:pl.predErr=0
fi
