# Queue log (run/queue.js)

## 10/16/2026, 4:59:37 PM · q18_bandit_hard · DONE
Generality: bandit 6 arms 3 contexts, switches every 40; cue random delay 40 (question Q06).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| unifiedR bandit{"K":6,"C":3,"switchEvery":40} base | 3.323 | 0.706 | 16 |  |
| unifiedR cue{"mapping":"random","delay":40} base | 9.098 | 2.083 | 16 |  |
| unifiedR recall{"mapping":"random","K":6} base | -7.725 | 2.081 | 16 |  |
