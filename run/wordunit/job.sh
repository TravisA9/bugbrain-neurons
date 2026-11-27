#!/bin/sh
# job.sh <k> <arm> <tag> <nSyms>   arm: base | w1 | w2
cd /workspace/wordunit-wt || exit 1
V=$(cat /workspace/xray-notes/r144.txt)
case "$2" in base) ;; w1) V="$V,P.granWord=1";; w2) V="$V,P.granWord=2";; *) V="$V,$2";; esac
T="$3_$2"
[ -s sw/out/xray_${T}_$1.json ] && exit 0
node --max-old-space-size=3000 sw/xray.js "$1" "$V" "$T" "$4" 400 > /workspace/wordunit/logs/${T}_$1.log 2>&1
echo "- $(date '+%H:%M') CT: done $T k$1 exit $?" >> /workspace/wordunit/STATUS.md
