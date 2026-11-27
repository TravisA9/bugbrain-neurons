#!/bin/sh
# waiter/chain: tune -> pick arm (PREREG rule) -> confirm queue base+arm k3001-3016 (global 3-job limit in job.sh) -> RESULT.md -> x100 chosen arm k2977
cd /workspace/wordunit
while kill -0 1148122 2>/dev/null; do sleep 60; done
A=$(python3 result.py pick); [ -z "$A" ] && A=w1
echo "$A" > chosen.txt
echo "- $(date '+%H:%M') CT: tune done; chosen arm by PREREG rule: $A. Starting confirm queue (base+$A interleaved, P=3)" >> STATUS.md
for k in $(seq 3001 3016); do echo "$k base c30 30000"; echo "$k $A c30 30000"; done > jobs_confirm.txt
sh queue.sh jobs_confirm.txt 3 > logs/q_confirm.nohup 2>&1 &
QA=$!
while kill -0 $QA 2>/dev/null; do python3 result.py > /dev/null 2>&1; sleep 300; done
while pgrep -f "xray.js .* c30_" > /dev/null; do sleep 60; done
python3 result.py > /dev/null 2>&1
echo "- $(date '+%H:%M') CT: confirm finished; RESULT.md written. Starting x100 $A k2977" >> STATUS.md
sh job.sh 2977 $A x100 100000
python3 summ.py /workspace/sweep/sw/out/xray_x100_2977.json /workspace/wordunit-wt/sw/out/xray_x100_${A}_2977.json > x100_cmp.txt 2>&1
{ echo; echo "## 100k (k2977): base (earlier x100, same code path) vs $A"; echo '```'; cat x100_cmp.txt; echo '```'; } >> RESULT.md
echo "- $(date '+%H:%M') CT: x100 done; appended to RESULT.md. ALL DONE" >> STATUS.md
