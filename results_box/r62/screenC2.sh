#!/bin/bash
cd /workspace/bb-book
B() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$1,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true,\"readIn\":0.01}}"; }
R=',"readIn":0.01'
export BB_G0S=0,4 BB_PAR=2 BB_TASKS="[$(B 30000),$(B 10000),{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":4000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order3\",\"K\":8$R}}]"
while pgrep -f "screenB.jsonl" >/dev/null; do sleep 30; done
node run/r47_sweep.js results_box/r61/screenC2.jsonl 0 deepURSx3:pl.predErr=0 deepURSx3:pl.predErr=0.1
