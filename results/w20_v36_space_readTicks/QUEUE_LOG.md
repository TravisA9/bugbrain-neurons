# Queue log (run/queue.js)

## 10/18/2026, 3:45:57 AM · w20_v36_space_readTicks · DONE
Space bias, output side: longer read window readTicks 6 / 8 (v36 = 4), book 30k and 10k, growths 0-15 (question I75).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v36 readTicks6 book30k g0 n4 | 1.791 | 0.308 | 4 |  |
| v36 readTicks6 book30k g4 n4 | 1.583 | 0.092 | 4 |  |
| v36 readTicks6 book30k g8 n4 | 1.7 | 0.138 | 4 |  |
| v36 readTicks6 book30k g12 n4 | 1.688 | 0.163 | 4 |  |
| v36 readTicks6 book10k g0 n4 | 1.892 | 0.355 | 4 |  |
| v36 readTicks6 book10k g4 n4 | 1.586 | 0.096 | 4 |  |
| v36 readTicks6 book10k g8 n4 | 1.741 | 0.124 | 4 |  |
| v36 readTicks6 book10k g12 n4 | 1.639 | 0.11 | 4 |  |
| v36 readTicks8 book30k g0 n4 | 1.156 | 0.131 | 4 |  |
| v36 readTicks8 book30k g4 n4 | 1.126 | 0.134 | 4 |  |
| v36 readTicks8 book30k g8 n4 | 1.186 | 0.14 | 4 |  |
| v36 readTicks8 book30k g12 n4 | 1.094 | 0.11 | 4 |  |
| v36 readTicks8 book10k g0 n4 | 1.205 | 0.137 | 4 |  |
| v36 readTicks8 book10k g4 n4 | 1.121 | 0.157 | 4 |  |
| v36 readTicks8 book10k g8 n4 | 1.27 | 0.117 | 4 |  |
| v36 readTicks8 book10k g12 n4 | 1.148 | 0.049 | 4 |  |

Criteria: more output spikes per decision, fewer near-ties
