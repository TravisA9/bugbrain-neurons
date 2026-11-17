#!/bin/bash
# usage: run/r123/run_jobs.sh jobs.txt log ; each line: f si g K tag extraJSON(no spaces); 4 parallel, skips finished
cd /workspace/sweep
while read f si g K tag ex; do o=run/r123/out/K${K}_f${f}_si${si}_g${g}$([ "$tag" = x ] || echo _$tag).json; [ -s $o ] || echo "$f $si $g $K $tag $ex"; done < $1 | xargs -d "\n" -P ${P:-4} -n 1 run/r123/one.sh "$2" 2>/dev/null
echo "ALL DONE $1" >> $2
