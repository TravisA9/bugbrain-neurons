#!/bin/bash
# R61 screen D3 (after D2, 2 procs): slower consolidation (metaN 400), metaCap + predErr 0, output-side homeostasis of the taught cells (rcvHomeo)
cd /workspace/bb-book
R=',"readIn":0.01'
B() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$1,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true$R}}"; }
export BB_G0S=0,4 BB_TASKS="[$(B 30000),$(B 10000),{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":4000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order3\",\"K\":8$R}}]"
while pgrep -f "screenD2.jsonl" >/dev/null || pgrep -f "screenD.sh 2" >/dev/null; do sleep 30; done
BB_PAR=2 node run/r47_sweep.js results_box/r61/screenD3.jsonl 0 deepURSx3:pl.metaN=400 deepURSx3:pl.metaCap=200,pl.predErr=0 deepURSx3:pl.rcvHomeo=0.2
