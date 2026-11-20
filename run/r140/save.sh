#!/bin/bash
# copy new R140 results into the tracked folder and commit them (box restores wipe untracked sw/out)
cd /workspace/sweep; n=0
for f in sw/out/lp_p_*_4x_*.json sw/out/bd_b30[xb]*_4x_*.json sw/out/bd_b30[xb]*_*x_*.json sw/out/bd_*r140*.json sw/out/lp_*r140*.json; do [ -s "$f" ] || continue; b=run/r140/out/$(basename $f); [ -s $b ] || { cp $f $b; n=$((n+1)); }; done
if [ $n -gt 0 ]; then git add run/r140/out STATUS.md >/dev/null 2>&1; GIT_AUTHOR_NAME="Grok Bot" GIT_AUTHOR_EMAIL=bot@zaga.info GIT_COMMITTER_NAME="Grok Bot" GIT_COMMITTER_EMAIL=bot@zaga.info git commit -qm "R140: $n result file(s) + STATUS" && echo "saved $n"; fi
