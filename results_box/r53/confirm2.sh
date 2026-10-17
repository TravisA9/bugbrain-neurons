#!/bin/bash
# R53 confirm 2: growths 32-47, base + predErr 0.5 peMode 1 (+ optional extra variants as args); resumable, max 2 processes
cd /workspace/spiking-arena
while pgrep -f "r53/chain2.sh" >/dev/null; do sleep 20; done
export BB_PAR=2 BB_TASKS='[{"env":"seq","params":{"source":"text","nSyms":3000}},{"env":"seq","params":{"source":"fables","nSyms":2000}},{"env":"seq","params":{"source":"order3","K":8}}]'
node run/r47_sweep.js results_box/r53/confirm2.jsonl 32 deepURSx3 deepURSx3:pl.predErr=0.5,pl.peMode=1 "$@"
echo "confirm2 done $(date)"
