#!/bin/bash
# usage: runv.sh jobsfile out ; lines "EXTRA|args"
while IFS='|' read -r x t; do
  while [ $(jobs -r | wc -l) -ge 8 ]; do sleep 1; done
  EXTRA="$x" bun demand_exp.js $t >> "$2" 2>>"$2.err" &
done < "$1"; wait
