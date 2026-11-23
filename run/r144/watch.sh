#!/bin/bash
# one watch tick: sleep $1 s, restart gate.js if dead (and no orphan probe/bookdiag jobs), print status
cd /workspace/sweep; sleep ${1:-240}
if ! pgrep -f "[r]un/r144/gate.js" >/dev/null; then
  if pgrep -f "[s]w/(lagprobe140|bookdiag).js" >/dev/null; then echo "gate dead, orphans running - wait";
  elif grep -q "GATE DONE\|STOP rule fired" run/r144/gate.log; then echo "gate finished";
  else echo "$(date +%T) restarting gate" | tee -a run/r144/gate.log; setsid nohup node run/r144/gate.js >>run/r144/gate.out 2>&1 < /dev/null & fi
fi
date +%T; ls sw/out/lp_g144p_S2_4x_*.json 2>/dev/null | wc -l; tail -n 2 run/r144/gate.log
