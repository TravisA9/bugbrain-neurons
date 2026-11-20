#!/bin/bash
# copy new R140 results into the tracked folder and commit them (box restores wipe untracked sw/out)
cd /workspace/sweep; n=0
for f in $(ls sw/out/*.json | grep -E "/(lp_p_|bd_b30cand_4x_295[67]|bd_b100[a-z0-9]*r140|bd_b30[xb][0-9]+_|bd_b100[xb][0-9]+_|bd_r140|lp_r140)"); do [ -s "$f" ] || continue; b=run/r140/out/$(basename $f); [ -s $b ] || { cp $f $b; n=$((n+1)); }; done
if [ $n -gt 0 ]; then git add run/r140/out STATUS.md >/dev/null 2>&1; GIT_AUTHOR_NAME="Grok Bot" GIT_AUTHOR_EMAIL=bot@zaga.info GIT_COMMITTER_NAME="Grok Bot" GIT_COMMITTER_EMAIL=bot@zaga.info git commit -qm "R140: $n result file(s) + STATUS" && echo "saved $n"; fi
