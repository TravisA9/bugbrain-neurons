#!/bin/bash
# usage: run/r140/q2.sh jobs.txt P : launches each job when fewer than P sizeF=4 runs (lagprobe140/bookdiag) are alive (counts runs started elsewhere too)
cd /workspace/sweep
while IFS='|' read -r kind k v tag; do [ -z "$kind" ] && continue
  if [ "$kind" = lp ]; then f=sw/out/lp_${tag}_$k.json; else f=sw/out/bd_${tag}_$k.json; fi; [ -s $f ] && continue
  while [ $(pgrep -f "(lagprobe140|bookdiag).*sizeF=4" | wc -l) -ge $2 ]; do sleep 15; done
  [ -s $f ] && continue
  if [ "$kind" = lp ]; then nohup node --max-old-space-size=6000 sw/lagprobe140.js $k "$v" $tag 30000 > sw/out/log_lp_${tag}_$k.txt 2>&1 &
  else nohup node --max-old-space-size=6000 sw/bookdiag.js $k "$v" $tag 30000 > sw/out/log_bd_${tag}_$k.txt 2>&1 & fi
  echo "$(date +%T) start $kind $tag $k"; sleep 5
done < "$1"
wait
