#!/bin/bash
# R122 generation decoding test (after q2954): genTemp = sample next symbol with p ~ output spike counts^(1/T) (existing env flag; learning frozen in gen)
while ! grep -q ALLDONE /workspace/hr2/t54/log 2>/dev/null; do sleep 30; done
cd /workspace/bb; V=$(cat /workspace/v47.txt); O=$(cat /workspace/hr/old.txt); export V O; mkdir -p /workspace/hr2/gen
run() { n=$1; k=$2; T=$3; s=$4; node run/r118_probe.js deepURSx3 "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":10000,\"evalSyms\":1000,\"genSyms\":500,\"genTemp\":$T}}" $k "$V$O$s" 8000 1 > /workspace/hr2/gen/$n.out 2>/workspace/hr2/gen/$n.err; echo "$n done $(date +%H:%M)" >> /workspace/hr2/gen/log; }
export -f run
printf '%s\n' "os50_T0|2950|0|,P.granKal=1,P.granOneShot=0.03" "os50_T1|2950|1|,P.granKal=1,P.granOneShot=0.03" "os50_T05|2950|0.5|,P.granKal=1,P.granOneShot=0.03" "gx50_T1|2950|1|" "os54_T1|2954|1|,P.granKal=1,P.granOneShot=0.03" "os54_T05|2954|0.5|,P.granKal=1,P.granOneShot=0.03" \
 | xargs -P 4 -I{} bash -c 'IFS="|" read n k T s <<< "{}"; run "$n" "$k" "$T" "$s"'
echo ALLDONE >> /workspace/hr2/gen/log
