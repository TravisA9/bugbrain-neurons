#!/bin/bash
# R62 eval16 for the learning-rule combos (graded decoder readIn 0.01 on every task): c = metaCap 200 + predErr 0, d = c + mixHomeo 0.05
cd /workspace/bb-book
R=',"readIn":0.01'
TASKS="[{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":30000,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true$R}},{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":10000,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true$R}},{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":4000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order3\",\"K\":8$R}},{\"env\":\"seq\",\"params\":{\"source\":\"fables\",\"nSyms\":2000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order2\",\"nSyms\":1000$R}},{\"env\":\"seq\",\"params\":{\"source\":\"order2\",\"nSyms\":1000,\"clock2\":true,\"clock3\":true$R}},{\"env\":\"seq\",\"params\":{\"source\":\"text\",\"nSyms\":1000$R}}]"
export BB_G0S=0,4,8,12 BB_TASKS="$TASKS"
if [ "$1" = c ]; then BB_PAR=2 node run/r47_sweep.js results_box/r62/eval16c.jsonl 0 deepURSx3:pl.metaCap=200,pl.predErr=0
else while pgrep -f eval16o2.sh >/dev/null || pgrep -f screenD3.sh >/dev/null; do sleep 30; done; BB_PAR=2 node run/r47_sweep.js results_box/r62/eval16d.jsonl 0 deepURSx3:pl.metaCap=200,pl.predErr=0,pl.mixHomeo=0.05; fi
