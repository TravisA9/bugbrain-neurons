TX='{"env":"seq","params":{"source":"text","clock2":true,"clock3":true,"nSyms":1000}}'; O3='{"env":"seq","params":{"source":"order3","K":8,"clock2":true,"clock3":true}}'
pl=$1; t=$2; g0=$3; [ $t = text ] && J="$TX" || J="$O3"
node ../../run/r42.js $pl "$J" 8 base $g0 > scale_${pl}_${t}_$g0.json 2>&1
