#!/bin/bash
# R122 granFatigue test (k2950/2954 book10k, granExact+kal+oneShot0.03, greedy gen with gen-state dump)
cd /workspace/bb; V=$(cat /workspace/v47.txt); O=$(cat /workspace/hr/old.txt); export V O; mkdir -p /workspace/hr2/fat2
run() { n=$1; k=$2; s=$3; BB_GENDUMP=/workspace/hr2/fat2/$n.gen.json node run/r118_probe.js deepURSx3 '{"env":"seq","params":{"source":"book","nSyms":10000,"evalSyms":1000,"genSyms":500}}' $k "$V$O,P.granKal=1,P.granOneShot=0.03$s" 8000 1 > /workspace/hr2/fat2/$n.out 2>/workspace/hr2/fat2/$n.err; echo "$n done $(date +%H:%M)" >> /workspace/hr2/fat2/log; }
export -f run
printf "%s\n" "f05_50|2950|,P.granFatigue=0.05" "f2_50|2950|,P.granFatigue=0.2" "f5_50|2950|,P.granFatigue=0.5" "f2_54|2954|,P.granFatigue=0.2" "f05_54|2954|,P.granFatigue=0.05" "f5_54|2954|,P.granFatigue=0.5" \
 | xargs -P 4 -I{} bash -c 'IFS="|" read n k s <<< "{}"; run "$n" "$k" "$s"'
echo ALLDONE >> /workspace/hr2/fat2/log
