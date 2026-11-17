#!/bin/bash
cd /workspace/sweep
while [ $(wc -l < run/r123/out/book3.jsonl 2>/dev/null || echo 0) -lt 2 ]; do sleep 20; done
pkill -f "run/r123/reg.js run/r123/jobs_book3.json"; sleep 1; pkill -f "sizeF=2,P.relGrowth=1"; sleep 3
node run/r123/reg.js run/r123/jobs_book4.json run/r123/out/book3.jsonl 2
