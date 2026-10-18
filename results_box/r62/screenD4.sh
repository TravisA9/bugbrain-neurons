#!/bin/bash
# R61 screen D3 (after D2, 2 procs): slower consolidation (metaN 400), metaCap + predErr 0, output-side homeostasis of the taught cells (rcvHomeo)
cd /workspace/bb-book
R=',"readIn":0.01'
B() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$1,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true$R}}"; }
export BB_G0S=0,4 BB_TASKS="[$(B 30000),$(B 10000),{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":4000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order3\",\"K\":8$R}}]"

BB_PAR=2 node run/r47_sweep.js results_box/r61/screenD4.jsonl 0 deepURSx3:pl.metaCap=200,pl.predErr=0,pl.mixHomeo=0.05 deepURSx3:pl.metaCap=100,pl.predErr=0
