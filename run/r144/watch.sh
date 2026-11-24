#!/bin/bash
# one watch tick: sleep $1 s, restart gate.js if dead (and no orphan probe/bookdiag jobs), print status
cd /workspace/sweep; sleep ${1:-240}
if ! pgrep -f "[r]un/r144/gate.js" >/dev/null; then
  if grep -q "GATE DONE\|STOP rule fired" run/r144/gate.log; then echo "gate finished";
  else echo "$(date +%T) restarting gate" | tee -a run/r144/gate.log; GATE_MAX=3 GATE_MEMGB=5 setsid nohup node run/r144/gate.js >>run/r144/gate.out 2>&1 < /dev/null & fi
fi
date +%T; ls sw/out/lp_g144p_S2_4x_*.json 2>/dev/null | wc -l; tail -n 2 run/r144/gate.log
for f in sw/out/bd_g144b_*.json; do [ -e "$f" ] || continue; git ls-files --error-unmatch "$f" >/dev/null 2>&1 || { git add -f "$f" && git commit -qm "R144 gate: $(basename $f .json)" && echo "committed $f"; }; done
free -g | awk '/Mem/{print "MemAvail GB", $7}'
python3 run/r144/csum.py 2>/dev/null
