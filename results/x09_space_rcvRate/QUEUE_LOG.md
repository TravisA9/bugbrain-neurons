# Queue log (run/queue.js)

## 10/18/2026, 6:05:42 PM · x09_space_rcvRate · DONE
Learning rule (5-task screen, 16 growths): space bias: very weak output homeostasis with a realistic target rate, rcvHomeo 0.005 rcvRate 0.1 / rcvHomeo 0.002 (w21: 0.02 / 0.05 at rate 0.02 collapsed to 0.12) (question I75).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v36 rcvHomeo=0.005 book30k g0 n4 | 1.415 | 0.248 | 4 |  |
| v36 rcvHomeo=0.005 book30k g4 n4 | 1.311 | 0.154 | 4 |  |
| v36 rcvHomeo=0.005 book30k g8 n4 | 1.206 | 0.066 | 4 |  |
| v36 rcvHomeo=0.005 book30k g12 n4 | 1.202 | 0.149 | 4 |  |
| v36 rcvHomeo=0.005 book10k g0 n4 | 1.295 | 0.115 | 4 |  |
| v36 rcvHomeo=0.005 book10k g4 n4 | 1.25 | 0.155 | 4 |  |
| v36 rcvHomeo=0.005 book10k g8 n4 | 1.169 | 0.127 | 4 |  |
| v36 rcvHomeo=0.005 book10k g12 n4 | 1.164 | 0.122 | 4 |  |
| v36 rcvHomeo=0.005 fables4000 g0 n4 | 1.315 | 0.086 | 4 |  |
| v36 rcvHomeo=0.005 fables4000 g4 n4 | 1.294 | 0.15 | 4 |  |
| v36 rcvHomeo=0.005 fables4000 g8 n4 | 1.261 | 0.077 | 4 |  |
| v36 rcvHomeo=0.005 fables4000 g12 n4 | 1.234 | 0.049 | 4 |  |
| v36 rcvHomeo=0.005 order3 g0 n4 | 9.375 | 0.433 | 4 |  |
| v36 rcvHomeo=0.005 order3 g4 n4 | 9.519 | 0.105 | 4 |  |
| v36 rcvHomeo=0.005 order3 g8 n4 | 9.556 | 0.048 | 4 |  |
| v36 rcvHomeo=0.005 order3 g12 n4 | 9.625 | 0 | 4 |  |
| v36 rcvHomeo=0.005 text1000 g0 n4 | 4.981 | 0.257 | 4 |  |
| v36 rcvHomeo=0.005 text1000 g4 n4 | 4.974 | 0.172 | 4 |  |
| v36 rcvHomeo=0.005 text1000 g8 n4 | 5.215 | 0.106 | 4 |  |
| v36 rcvHomeo=0.005 text1000 g12 n4 | 5.274 | 0.125 | 4 |  |
| v36 rcvHomeo=0.002 book30k g0 n4 | 1.157 | 0.155 | 4 |  |
| v36 rcvHomeo=0.002 book30k g4 n4 | 0.914 | 0.052 | 4 |  |
| v36 rcvHomeo=0.002 book30k g8 n4 | 1.075 | 0.103 | 4 |  |
| v36 rcvHomeo=0.002 book30k g12 n4 | 0.971 | 0.024 | 4 |  |
| v36 rcvHomeo=0.002 book10k g0 n4 | 1.439 | 0.093 | 4 |  |
| v36 rcvHomeo=0.002 book10k g4 n4 | 1.136 | 0.14 | 4 |  |
| v36 rcvHomeo=0.002 book10k g8 n4 | 1.243 | 0.074 | 4 |  |
| v36 rcvHomeo=0.002 book10k g12 n4 | 1.175 | 0.097 | 4 |  |
| v36 rcvHomeo=0.002 fables4000 g0 n4 | 2.783 | 0.198 | 4 |  |
| v36 rcvHomeo=0.002 fables4000 g4 n4 | 2.857 | 0.083 | 4 |  |
| v36 rcvHomeo=0.002 fables4000 g8 n4 | 2.673 | 0.073 | 4 |  |
| v36 rcvHomeo=0.002 fables4000 g12 n4 | 2.804 | 0.045 | 4 |  |
| v36 rcvHomeo=0.002 order3 g0 n4 | 9.45 | 0.169 | 4 |  |
| v36 rcvHomeo=0.002 order3 g4 n4 | 9.563 | 0.067 | 4 |  |
| v36 rcvHomeo=0.002 order3 g8 n4 | 9.594 | 0.027 | 4 |  |
| v36 rcvHomeo=0.002 order3 g12 n4 | 9.6 | 0.047 | 4 |  |
| v36 rcvHomeo=0.002 text1000 g0 n4 | 7.511 | 0.067 | 4 |  |
| v36 rcvHomeo=0.002 text1000 g4 n4 | 7.688 | 0.125 | 4 |  |
| v36 rcvHomeo=0.002 text1000 g8 n4 | 7.72 | 0.1 | 4 |  |
| v36 rcvHomeo=0.002 text1000 g12 n4 | 7.647 | 0.083 | 4 |  |

Criteria: adoption-ready if book30k and book10k win and no task is worse (t < -2) vs w13 / box eval16c
