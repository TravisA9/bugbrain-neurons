#!/bin/bash
# tune.sh <tag> <seed> <nSyms> <variant suffixes...>
TAG=$1; K=$2; N=$3; shift 3
cd /workspace/bb; V=$(cat /workspace/v47.txt)
T="{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$N,\"evalSyms\":1000,\"genSyms\":300}}"
for ex in "$@"; do echo "$ex"; done | xargs -P 4 -I{} sh -c "node run/r118_probe.js deepURSx3 '$T' $K '$V{}' 8000 1 >> /workspace/hr2/$TAG.jsonl 2>>/workspace/hr2/$TAG.err"
echo DONE >> /workspace/hr2/$TAG.log
