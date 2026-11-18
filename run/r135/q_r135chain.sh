#!/bin/bash
# R135 chain: wait for all bookdiag runs (incl. r135y waiter) -> regressions (candidate) -> test_core + spikefoundry
cd /workspace/sweep
sleep 60
while pgrep -f "[b]drun2.sh" >/dev/null || pgrep -f "[k]ill -0 979959" >/dev/null; do sleep 30; done
node sw/reg.js sw/jobs_xcand.json sw/out/xr135.jsonl 3
node test_core.js > sw/logs/tc135.log 2>&1; echo EXIT $? >> sw/logs/tc135.log
for t in spikefoundry/*_test.js; do node $t > /dev/null 2>&1 && echo "PASS $t" || echo "FAIL $t"; done > sw/logs/sf135.log 2>&1
echo CHAINDONE >> sw/logs/sf135.log
