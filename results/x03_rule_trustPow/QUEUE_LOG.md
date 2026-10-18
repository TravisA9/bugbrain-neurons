# Queue log (run/queue.js)

## 10/18/2026, 11:11:55 AM · x03_rule_trustPow · DONE
Learning rule (5-task screen, 16 growths): per-cell trust weighting trustPow 4 / 0 (v36 2): reliable cells dominate the summed prediction (also a space-bias lever) (question I77).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v36 trustPow=4 book30k g0 n4 | 2.736 | 0.272 | 4 |  |
| v36 trustPow=4 book30k g4 n4 | 2.368 | 0.124 | 4 |  |
| v36 trustPow=4 book30k g8 n4 | 2.395 | 0.113 | 4 |  |
| v36 trustPow=4 book30k g12 n4 | 2.458 | 0.19 | 4 |  |
| v36 trustPow=4 book10k g0 n4 | 2.833 | 0.327 | 4 |  |
| v36 trustPow=4 book10k g4 n4 | 2.469 | 0.148 | 4 |  |
| v36 trustPow=4 book10k g8 n4 | 2.489 | 0.139 | 4 |  |
| v36 trustPow=4 book10k g12 n4 | 2.54 | 0.122 | 4 |  |
| v36 trustPow=4 fables4000 g0 n4 | 2.966 | 0.192 | 4 |  |
| v36 trustPow=4 fables4000 g4 n4 | 2.913 | 0.12 | 4 |  |
| v36 trustPow=4 fables4000 g8 n4 | 2.94 | 0.081 | 4 |  |
| v36 trustPow=4 fables4000 g12 n4 | 2.9 | 0.101 | 4 |  |
| v36 trustPow=4 order3 g0 n4 | 9.644 | 0.011 | 4 |  |
| v36 trustPow=4 order3 g4 n4 | 9.606 | 0.076 | 4 |  |
| v36 trustPow=4 order3 g8 n4 | 9.656 | 0.011 | 4 |  |
| v36 trustPow=4 order3 g12 n4 | 9.662 | 0.028 | 4 |  |
| v36 trustPow=4 text1000 g0 n4 | 7.334 | 0.073 | 4 |  |
| v36 trustPow=4 text1000 g4 n4 | 7.374 | 0.076 | 4 |  |
| v36 trustPow=4 text1000 g8 n4 | 7.413 | 0.069 | 4 |  |
| v36 trustPow=4 text1000 g12 n4 | 7.401 | 0.18 | 4 |  |
| v36 trustPow=0 book30k g0 n4 | 3.311 | 0.203 | 4 |  |
| v36 trustPow=0 book30k g4 n4 | 3.164 | 0.072 | 4 |  |
| v36 trustPow=0 book30k g8 n4 | 3.055 | 0.056 | 4 |  |
| v36 trustPow=0 book30k g12 n4 | 3.063 | 0.143 | 4 |  |
| v36 trustPow=0 book10k g0 n4 | 3.239 | 0.093 | 4 |  |
| v36 trustPow=0 book10k g4 n4 | 3.13 | 0.085 | 4 |  |
| v36 trustPow=0 book10k g8 n4 | 2.942 | 0.102 | 4 |  |
| v36 trustPow=0 book10k g12 n4 | 2.999 | 0.148 | 4 |  |
| v36 trustPow=0 fables4000 g0 n4 | 2.954 | 0.08 | 4 |  |
| v36 trustPow=0 fables4000 g4 n4 | 2.902 | 0.105 | 4 |  |
| v36 trustPow=0 fables4000 g8 n4 | 2.835 | 0.069 | 4 |  |
| v36 trustPow=0 fables4000 g12 n4 | 2.818 | 0.05 | 4 |  |
| v36 trustPow=0 order3 g0 n4 | 7.719 | 0.435 | 4 |  |
| v36 trustPow=0 order3 g4 n4 | 7.544 | 0.251 | 4 |  |
| v36 trustPow=0 order3 g8 n4 | 8.213 | 0.435 | 4 |  |
| v36 trustPow=0 order3 g12 n4 | 7.813 | 0.401 | 4 |  |
| v36 trustPow=0 text1000 g0 n4 | 6.026 | 0.158 | 4 |  |
| v36 trustPow=0 text1000 g4 n4 | 6.005 | 0.092 | 4 |  |
| v36 trustPow=0 text1000 g8 n4 | 6.119 | 0.108 | 4 |  |
| v36 trustPow=0 text1000 g12 n4 | 5.981 | 0.119 | 4 |  |

Criteria: adoption-ready if book30k and book10k win and no task is worse (t < -2) vs w13 / box eval16c
