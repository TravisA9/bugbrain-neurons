#!/bin/bash
cd /workspace/sweep
node test_core.js > run/r123/logs/test_core2.log 2>&1; echo "EXIT $?" >> run/r123/logs/test_core2.log
: > run/r123/logs/sf2.log; for t in spikefoundry/*_test.js; do node $t > /tmp/sf.out 2>&1 && echo "PASS $t" >> run/r123/logs/sf2.log || { echo "FAIL $t" >> run/r123/logs/sf2.log; tail -5 /tmp/sf.out >> run/r123/logs/sf2.log; }; done; echo DONE >> run/r123/logs/sf2.log
