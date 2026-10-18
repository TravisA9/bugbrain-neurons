#!/bin/bash
# R62: second worker for eval16d, task list reversed (meets the first worker in the middle; a duplicate chunk is harmless, same key overwrites)
cd /workspace/bb-book
R=',"readIn":0.01'
TASKS="[{\"env\":\"seq\",\"params\":{\"source\":\"text\",\"nSyms\":1000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order2\",\"nSyms\":1000,\"clock2\":true,\"clock3\":true$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order2\",\"nSyms\":1000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":2000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order3\",\"K\":8$R}},{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":4000$R}}]"
BB_G0S=0,4,8,12 BB_TASKS="$TASKS" BB_PAR=3 node run/r47_sweep.js results_box/r62/eval16d.jsonl 0 deepURSx3:pl.metaCap=200,pl.predErr=0,pl.mixHomeo=0.05
