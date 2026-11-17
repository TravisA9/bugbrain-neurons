#!/bin/bash
# one job line: f si g K tag extraJSON
cd /workspace/sweep; LOG=$1; read f si g K tag ex <<< "$2"
while [ $(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo) -lt 2 ]; do sleep 20; done
node --max-old-space-size=6000 run/r123/probe.js $f $si $g $K "$ex" >> $LOG 2>&1 || echo "FAIL $1" >> $LOG
