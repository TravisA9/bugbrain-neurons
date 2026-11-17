#!/bin/bash
# usage: run30.sh <tag> <P> <variant suffix> <seeds...>  (no dumps)
TAG=$1; PP=$2; EX=$3; shift 3
cd /workspace/bb; V=$(cat /workspace/v47.txt)$EX
for k in "$@"; do echo $k; done | xargs -P $PP -I{} sh -c "node run/r118_probe.js deepURSx3 '{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":30000,\"evalSyms\":2000,\"genSyms\":500}}' {} '$V' >> /workspace/hr2/$TAG.jsonl 2>>/workspace/hr2/$TAG.err"
echo DONE >> /workspace/hr2/$TAG.log
