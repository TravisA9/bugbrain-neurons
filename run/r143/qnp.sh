#!/bin/bash
# usage: run/r143/qnp.sh jobs.txt : runs sw/nameprobe.js jobs one at a time while total node jobs (r42/bookdiag/lagprobe/nameprobe/test_core/standing) < 3
cd /workspace/sweep
while IFS='|' read -r k v tag; do [ -z "$k" ] && continue; f=sw/out/np_${tag}_$k.json; [ -s $f ] && continue
  while [ $(pgrep -f "node .*(r42.js|bookdiag|lagprobe|nameprobe|test_core|standing_)" | wc -l) -ge 3 ]; do sleep 15; done
  echo "$(date +%T) start $tag $k"; node --max-old-space-size=6000 sw/nameprobe.js $k "$v" $tag 30000 10 > sw/out/log_np_${tag}_$k.txt 2>&1; echo "$(date +%T) done $tag $k"
done < "$1"
echo QDONE
