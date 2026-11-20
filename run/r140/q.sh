#!/bin/bash
# usage: run/r140/q.sh jobs.txt P ; job = kind|k|variant|tag ; kind lp = probe 30k, bd = book30k
cd /workspace/sweep
run1() { IFS='|' read -r kind k v tag <<< "$1"; if [ "$kind" = lp ]; then f=sw/out/lp_${tag}_$k.json; [ -s $f ] || node --max-old-space-size=6000 sw/lagprobe140.js $k "$v" $tag 30000 > sw/out/log_lp_${tag}_$k.txt 2>&1; else f=sw/out/bd_${tag}_$k.json; [ -s $f ] || node --max-old-space-size=6000 sw/bookdiag.js $k "$v" $tag 30000 > sw/out/log_bd_${tag}_$k.txt 2>&1; fi; echo "$(date +%T) done $kind $tag $k"; }
export -f run1
cat "$1" | xargs -P "$2" -I{} bash -c 'run1 "$@"' _ {}
