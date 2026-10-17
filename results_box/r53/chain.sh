#!/bin/bash
# R53 continuation: waits for the confirm sweep, then hybrid screen + order2 check (BB_PAR=3; race validation shares the box)
cd /workspace/spiking-arena
while kill -0 2425887 2>/dev/null; do sleep 20; done
echo "confirm done $(date)"
export BB_PAR=3
node run/r47_sweep.js results_box/r53/hybrid.jsonl 0 deepURSx3:pl.predErr=0.5,pl.peMode=16,pl.peFix=0.02 deepURSx3:pl.predErr=0.5,pl.peMode=16,pl.peFix=0.05 slowS98w2:pl.predErr=0.3,pl.peMode=16,pl.peFix=0.05 slowS98w2:pl.predErr=0.5,pl.peMode=16,pl.peFix=0.02
echo "hybrid done $(date)"
BB_TASKS='[{"env":"seqchoice","params":{"source":"order2","nSyms":1000}}]' node run/r47_sweep.js results_box/r53/order2.jsonl 0 deepURSx3 deepURSx3:pl.predErr=0.3,pl.peMode=1 deepURSx3:pl.predErr=0.5,pl.peMode=1 slowS98w2 slowS98w2:pl.predErr=0.3,pl.peMode=1 slowS98w2:pl.predErr=0.5,pl.peMode=1 deepURSx3:pl.predErr=0.5,pl.peMode=16,pl.peFix=0.02 deepURSx3:pl.predErr=0.5,pl.peMode=16,pl.peFix=0.05 slowS98w2:pl.predErr=0.3,pl.peMode=16,pl.peFix=0.05 slowS98w2:pl.predErr=0.5,pl.peMode=16,pl.peFix=0.02
echo "order2 done $(date)"
