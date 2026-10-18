# Queue log (run/queue.js)

## 10/18/2026, 12:31:29 PM · x04_rule_lr · DONE
Learning rule (5-task screen, 16 growths): teacher-rule rate lr 0.1 / 0.025 (v36 0.05) (question I77).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v36 lr=0.1 book30k g0 n4 | 3.393 | 0.195 | 4 |  |
| v36 lr=0.1 book30k g4 n4 | 3.202 | 0.097 | 4 |  |
| v36 lr=0.1 book30k g8 n4 | 3.159 | 0.05 | 4 |  |
| v36 lr=0.1 book30k g12 n4 | 3.206 | 0.116 | 4 |  |
| v36 lr=0.1 book10k g0 n4 | 3.416 | 0.215 | 4 |  |
| v36 lr=0.1 book10k g4 n4 | 3.235 | 0.177 | 4 |  |
| v36 lr=0.1 book10k g8 n4 | 3.171 | 0.064 | 4 |  |
| v36 lr=0.1 book10k g12 n4 | 3.184 | 0.054 | 4 |  |
| v36 lr=0.1 fables4000 g0 n4 | 3.424 | 0.111 | 4 |  |
| v36 lr=0.1 fables4000 g4 n4 | 3.395 | 0.099 | 4 |  |
| v36 lr=0.1 fables4000 g8 n4 | 3.377 | 0.102 | 4 |  |
| v36 lr=0.1 fables4000 g12 n4 | 3.368 | 0.049 | 4 |  |
| v36 lr=0.1 order3 g0 n4 | 9.656 | 0.021 | 4 |  |
| v36 lr=0.1 order3 g4 n4 | 9.638 | 0.028 | 4 |  |
| v36 lr=0.1 order3 g8 n4 | 9.65 | 0.025 | 4 |  |
| v36 lr=0.1 order3 g12 n4 | 9.619 | 0.054 | 4 |  |
| v36 lr=0.1 text1000 g0 n4 | 7.534 | 0.036 | 4 |  |
| v36 lr=0.1 text1000 g4 n4 | 7.605 | 0.009 | 4 |  |
| v36 lr=0.1 text1000 g8 n4 | 7.569 | 0.074 | 4 |  |
| v36 lr=0.1 text1000 g12 n4 | 7.595 | 0.086 | 4 |  |
| v36 lr=0.025 book30k g0 n4 | 3.216 | 0.219 | 4 |  |
| v36 lr=0.025 book30k g4 n4 | 3.024 | 0.089 | 4 |  |
| v36 lr=0.025 book30k g8 n4 | 2.976 | 0.027 | 4 |  |
| v36 lr=0.025 book30k g12 n4 | 2.955 | 0.124 | 4 |  |
| v36 lr=0.025 book10k g0 n4 | 3.232 | 0.217 | 4 |  |
| v36 lr=0.025 book10k g4 n4 | 3.046 | 0.175 | 4 |  |
| v36 lr=0.025 book10k g8 n4 | 2.971 | 0.059 | 4 |  |
| v36 lr=0.025 book10k g12 n4 | 3.006 | 0.066 | 4 |  |
| v36 lr=0.025 fables4000 g0 n4 | 3.269 | 0.125 | 4 |  |
| v36 lr=0.025 fables4000 g4 n4 | 3.203 | 0.138 | 4 |  |
| v36 lr=0.025 fables4000 g8 n4 | 3.184 | 0.13 | 4 |  |
| v36 lr=0.025 fables4000 g12 n4 | 3.136 | 0.075 | 4 |  |
| v36 lr=0.025 order3 g0 n4 | 9.162 | 0.543 | 4 |  |
| v36 lr=0.025 order3 g4 n4 | 9.344 | 0.089 | 4 |  |
| v36 lr=0.025 order3 g8 n4 | 9.413 | 0.067 | 4 |  |
| v36 lr=0.025 order3 g12 n4 | 9.319 | 0.231 | 4 |  |
| v36 lr=0.025 text1000 g0 n4 | 7.285 | 0.151 | 4 |  |
| v36 lr=0.025 text1000 g4 n4 | 7.464 | 0.067 | 4 |  |
| v36 lr=0.025 text1000 g8 n4 | 7.516 | 0.127 | 4 |  |
| v36 lr=0.025 text1000 g12 n4 | 7.465 | 0.132 | 4 |  |

Criteria: adoption-ready if book30k and book10k win and no task is worse (t < -2) vs w13 / box eval16c
