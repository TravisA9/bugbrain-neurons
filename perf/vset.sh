#!/bin/sh
# perf/vset.sh <repo root> <out.jsonl> [P parallel] [set]: fixed-seed fingerprints (final ws hash, fitness) of held-out growths (r42 seeds)
# set 'quick' (default): text1000 / order3 / fables4000 / book10k x growths 0-7 at 1x + seqchoice order2 g0-3;  set '4x': book3000 4xS g0-1
ROOT=$1; OUT=$2; P=${3:-6}; SET=${4:-quick}; : > "$OUT"
TXT='{"env":"seq","params":{"source":"text","nSyms":1000,"readIn":0.01}}'
O3='{"env":"seq","params":{"source":"order3","K":8,"readIn":0.01}}'
F4='{"env":"seq","params":{"source":"fables","nSyms":4000,"readIn":0.01}}'
B10='{"env":"seq","params":{"source":"book","nSyms":10000,"evalSyms":2000}}'
B3='{"env":"seq","params":{"source":"book","nSyms":3000,"evalSyms":1000}}'
SC='{"env":"seqchoice","params":{"source":"order2","nSyms":1000}}'
S4='sc.grid=120,sc.maxCells=13600,sc.coneSpeed=6,sc.axonLen=80'
L=$(mktemp)
if [ "$SET" = quick ]; then
  for k in 0 1 2 3 4 5 6 7; do for t in "$B10" "$F4" "$TXT" "$O3"; do printf '%s\t%s\t%s\n' "$t" "$k" base >> "$L"; done; done
  for k in 0 1 2 3; do printf '%s\t%s\t%s\n' "$SC" "$k" base >> "$L"; done
else
  for k in 0 1; do printf '%s\t%s\t%s\n' "$B3" "$k" "$S4" >> "$L"; done
fi
tr '\n' '\0' < "$L" | xargs -0 -P "$P" -I{} sh -c 'R="$2"; O="$3"; IFS="	"; set -- $1; cd "$R" && BB_PROF_OUT="$O" bun perf/p37.js deepURSx3 "$1" "$2" "$3" > /dev/null' _ "{}" "$ROOT" "$OUT" 2>&1
rm -f "$L"
