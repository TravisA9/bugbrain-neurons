#!/bin/sh
# job.sh <k> <arm> <tag> <nSyms>   arm: base | w1 | w2
cd /workspace/wordunit-wt || exit 1
V=$(cat /workspace/xray-notes/r144.txt)
case "$2" in base) ;; w1) V="$V,P.granWord=1";; w2) V="$V,P.granWord=2";; *) V="$V,$2";; esac
T="$3_$2"
[ -s sw/out/xray_${T}_$1.json ] && exit 0
pgrep -f "xray.js $1 .* $T $4" > /dev/null && exit 0   # already running (e.g. from an earlier queue)
# global slot limit: at most 3 xray node jobs on the box (flock so two queues never race past it)
exec 9>/tmp/wordunit_slot.lock
while :; do flock 9; n=$(pgrep -fc "sw/xray.js"); if [ "$n" -lt 3 ]; then break; fi; flock -u 9; sleep 30; done
node --max-old-space-size=3000 sw/xray.js "$1" "$V" "$T" "$4" 400 9>&- > /workspace/wordunit/logs/${T}_$1.log 2>&1 &
NP=$!; sleep 5; flock -u 9; exec 9>&-; wait $NP; RC=$?
echo "- $(date '+%H:%M') CT: done $T k$1 exit $RC" >> /workspace/wordunit/STATUS.md
exit 0
