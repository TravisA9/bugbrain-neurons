# Queue log (run/queue.js)

## 10/18/2026, 4:43:31 PM · x07_rule_conf_trustMax · DONE
Learning rule (5-task screen, 16 growths): sharpness weighting confPow 2 (ref 6, max 4) / trustMax 8 (v36 4) (question I77).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v36 confPow=2 book30k g0 n4 | 3.21 | 0.229 | 4 |  |
| v36 confPow=2 book30k g4 n4 | 3.046 | 0.09 | 4 |  |
| v36 confPow=2 book30k g8 n4 | 2.974 | 0.045 | 4 |  |
| v36 confPow=2 book30k g12 n4 | 3.009 | 0.113 | 4 |  |
| v36 confPow=2 book10k g0 n4 | 3.275 | 0.274 | 4 |  |
| v36 confPow=2 book10k g4 n4 | 3.022 | 0.201 | 4 |  |
| v36 confPow=2 book10k g8 n4 | 2.989 | 0.093 | 4 |  |
| v36 confPow=2 book10k g12 n4 | 2.994 | 0.094 | 4 |  |
| v36 confPow=2 fables4000 g0 n4 | 3.344 | 0.13 | 4 |  |
| v36 confPow=2 fables4000 g4 n4 | 3.249 | 0.094 | 4 |  |
| v36 confPow=2 fables4000 g8 n4 | 3.247 | 0.09 | 4 |  |
| v36 confPow=2 fables4000 g12 n4 | 3.23 | 0.08 | 4 |  |
| v36 confPow=2 order3 g0 n4 | 9.525 | 0.151 | 4 |  |
| v36 confPow=2 order3 g4 n4 | 9.456 | 0.13 | 4 |  |
| v36 confPow=2 order3 g8 n4 | 9.519 | 0.176 | 4 |  |
| v36 confPow=2 order3 g12 n4 | 9.656 | 0.021 | 4 |  |
| v36 confPow=2 text1000 g0 n4 | 7.39 | 0.05 | 4 |  |
| v36 confPow=2 text1000 g4 n4 | 7.401 | 0.119 | 4 |  |
| v36 confPow=2 text1000 g8 n4 | 7.536 | 0.101 | 4 |  |
| v36 confPow=2 text1000 g12 n4 | 7.598 | 0.097 | 4 |  |
| v36 trustMax=8 book30k g0 n4 | 3.28 | 0.216 | 4 |  |
| v36 trustMax=8 book30k g4 n4 | 3.114 | 0.101 | 4 |  |
| v36 trustMax=8 book30k g8 n4 | 3.066 | 0.041 | 4 |  |
| v36 trustMax=8 book30k g12 n4 | 3.046 | 0.114 | 4 |  |
| v36 trustMax=8 book10k g0 n4 | 3.317 | 0.207 | 4 |  |
| v36 trustMax=8 book10k g4 n4 | 3.18 | 0.169 | 4 |  |
| v36 trustMax=8 book10k g8 n4 | 3.075 | 0.029 | 4 |  |
| v36 trustMax=8 book10k g12 n4 | 3.079 | 0.034 | 4 |  |
| v36 trustMax=8 fables4000 g0 n4 | 3.354 | 0.11 | 4 |  |
| v36 trustMax=8 fables4000 g4 n4 | 3.312 | 0.108 | 4 |  |
| v36 trustMax=8 fables4000 g8 n4 | 3.272 | 0.086 | 4 |  |
| v36 trustMax=8 fables4000 g12 n4 | 3.24 | 0.061 | 4 |  |
| v36 trustMax=8 order3 g0 n4 | 9.45 | 0.183 | 4 |  |
| v36 trustMax=8 order3 g4 n4 | 9.563 | 0.065 | 4 |  |
| v36 trustMax=8 order3 g8 n4 | 9.537 | 0.11 | 4 |  |
| v36 trustMax=8 order3 g12 n4 | 9.588 | 0.067 | 4 |  |
| v36 trustMax=8 text1000 g0 n4 | 7.5 | 0.071 | 4 |  |
| v36 trustMax=8 text1000 g4 n4 | 7.55 | 0.103 | 4 |  |
| v36 trustMax=8 text1000 g8 n4 | 7.529 | 0.097 | 4 |  |
| v36 trustMax=8 text1000 g12 n4 | 7.53 | 0.139 | 4 |  |

Criteria: adoption-ready if book30k and book10k win and no task is worse (t < -2) vs w13 / box eval16c
