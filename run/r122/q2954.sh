#!/bin/bash
# q2954: second tune seed. jobs "name|nSyms|suffix"
cd /workspace/bb; V=$(cat /workspace/v47.txt); O=$(cat /workspace/hr/old.txt)
run() { n=$1; N=$2; s=$3; E=$([ $N = 30000 ] && echo 2000 || echo 1000); G=$([ $N = 30000 ] && echo 500 || echo 300)
  node run/r118_probe.js deepURSx3 "{\"env\":\"seq\",\"params\":{\"source\":\"book\",\"nSyms\":$N,\"evalSyms\":$E,\"genSyms\":$G}}" 2954 "$V$O$s" 8000 1 > /workspace/hr2/t54/$n.out 2>/workspace/hr2/t54/$n.err; echo "$n done $(date +%H:%M)" >> /workspace/hr2/t54/log; }
export -f run; export V O
mkdir -p /workspace/hr2/t54
printf '%s\n' "gx10|10000|" "kal10|10000|,P.granKal=1" "a02_10|10000|,P.granKal=1,P.granOneShot=0.02" "a03_10|10000|,P.granKal=1,P.granOneShot=0.03" "a05_10|10000|,P.granKal=1,P.granOneShot=0.05" "a10_10|10000|,P.granKal=1,P.granOneShot=0.1" \
 "gx30|30000|" "kal30|30000|,P.granKal=1" "a03_30|30000|,P.granKal=1,P.granOneShot=0.03" "a10_30|30000|,P.granKal=1,P.granOneShot=0.1" "a02_30|30000|,P.granKal=1,P.granOneShot=0.02" "a05_30|30000|,P.granKal=1,P.granOneShot=0.05" \
 | xargs -P 4 -I{} bash -c 'IFS="|" read n N s <<< "{}"; run "$n" "$N" "$s"'
echo ALLDONE >> /workspace/hr2/t54/log
