#!/bin/bash
# R62 learning curve: v35 deepURSx3 on book, life 3k / 10k / 30k / 100k (last 2000 = held-out), 8 growths
cd /workspace/bb-book
B() { echo "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$1,\"evalSyms\":2000,\"clock2\":true,\"clock3\":true}}"; }
export BB_PAR=4 BB_G0S=0,4 BB_TASKS="[$(B 100000),$(B 30000),$(B 10000),$(B 3000)]"
node run/r47_sweep.js results_box/r62/curve.jsonl 0 deepURSx3
echo "curve done $(date)"
