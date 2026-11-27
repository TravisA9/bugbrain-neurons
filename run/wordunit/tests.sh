#!/bin/sh
# flags-off guardrails: test_core + spikefoundry, in the wordunit worktree
cd /workspace/wordunit-wt || exit 1
node test_core.js > /workspace/wordunit/logs/test_core.log 2>&1; echo "exit $?" >> /workspace/wordunit/logs/test_core.log
: > /workspace/wordunit/logs/sf.log
for f in spikefoundry/*_test.js; do if node "$f" > /workspace/wordunit/logs/sf_$(basename $f .js).log 2>&1; then echo "PASS $f" >> /workspace/wordunit/logs/sf.log; else echo "FAIL $f" >> /workspace/wordunit/logs/sf.log; fi; done
echo DONE >> /workspace/wordunit/logs/sf.log
echo "- $(date '+%H:%M') CT: tests finished: test_core $(tail -2 /workspace/wordunit/logs/test_core.log | tr '\n' ' '); sf $(grep -c PASS /workspace/wordunit/logs/sf.log)/$(ls spikefoundry/*_test.js | wc -l) PASS" >> /workspace/wordunit/STATUS.md
