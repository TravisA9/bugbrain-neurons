# Queue log (run/queue.js)

## 10/18/2026, 5:45:50 PM · x08_rule_predErrSmall · DONE
Learning rule (5-task screen, 16 growths): error-driven part back in small doses under the cap: predErr 0.03 / 0.01 (peMode 16, peFix 0.01; v35 0.3) (question I77).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v36 predErr=0.03 book30k g0 n4 | 3.292 | 0.223 | 4 |  |
| v36 predErr=0.03 book30k g4 n4 | 3.115 | 0.09 | 4 |  |
| v36 predErr=0.03 book30k g8 n4 | 3.082 | 0.03 | 4 |  |
| v36 predErr=0.03 book30k g12 n4 | 3.044 | 0.118 | 4 |  |
| v36 predErr=0.03 book10k g0 n4 | 3.325 | 0.215 | 4 |  |
| v36 predErr=0.03 book10k g4 n4 | 3.175 | 0.19 | 4 |  |
| v36 predErr=0.03 book10k g8 n4 | 3.066 | 0.013 | 4 |  |
| v36 predErr=0.03 book10k g12 n4 | 3.098 | 0.031 | 4 |  |
| v36 predErr=0.03 fables4000 g0 n4 | 3.345 | 0.106 | 4 |  |
| v36 predErr=0.03 fables4000 g4 n4 | 3.322 | 0.101 | 4 |  |
| v36 predErr=0.03 fables4000 g8 n4 | 3.279 | 0.093 | 4 |  |
| v36 predErr=0.03 fables4000 g12 n4 | 3.262 | 0.07 | 4 |  |
| v36 predErr=0.03 order3 g0 n4 | 9.431 | 0.195 | 4 |  |
| v36 predErr=0.03 order3 g4 n4 | 9.544 | 0.057 | 4 |  |
| v36 predErr=0.03 order3 g8 n4 | 9.525 | 0.131 | 4 |  |
| v36 predErr=0.03 order3 g12 n4 | 9.588 | 0.067 | 4 |  |
| v36 predErr=0.03 text1000 g0 n4 | 7.516 | 0.083 | 4 |  |
| v36 predErr=0.03 text1000 g4 n4 | 7.56 | 0.088 | 4 |  |
| v36 predErr=0.03 text1000 g8 n4 | 7.528 | 0.081 | 4 |  |
| v36 predErr=0.03 text1000 g12 n4 | 7.546 | 0.151 | 4 |  |
| v36 predErr=0.01 book30k g0 n4 | 3.306 | 0.22 | 4 |  |
| v36 predErr=0.01 book30k g4 n4 | 3.111 | 0.093 | 4 |  |
| v36 predErr=0.01 book30k g8 n4 | 3.09 | 0.042 | 4 |  |
| v36 predErr=0.01 book30k g12 n4 | 3.047 | 0.11 | 4 |  |
| v36 predErr=0.01 book10k g0 n4 | 3.321 | 0.229 | 4 |  |
| v36 predErr=0.01 book10k g4 n4 | 3.163 | 0.176 | 4 |  |
| v36 predErr=0.01 book10k g8 n4 | 3.05 | 0.038 | 4 |  |
| v36 predErr=0.01 book10k g12 n4 | 3.095 | 0.036 | 4 |  |
| v36 predErr=0.01 fables4000 g0 n4 | 3.377 | 0.097 | 4 |  |
| v36 predErr=0.01 fables4000 g4 n4 | 3.317 | 0.091 | 4 |  |
| v36 predErr=0.01 fables4000 g8 n4 | 3.292 | 0.1 | 4 |  |
| v36 predErr=0.01 fables4000 g12 n4 | 3.244 | 0.08 | 4 |  |
| v36 predErr=0.01 order3 g0 n4 | 9.431 | 0.195 | 4 |  |
| v36 predErr=0.01 order3 g4 n4 | 9.519 | 0.054 | 4 |  |
| v36 predErr=0.01 order3 g8 n4 | 9.525 | 0.131 | 4 |  |
| v36 predErr=0.01 order3 g12 n4 | 9.588 | 0.067 | 4 |  |
| v36 predErr=0.01 text1000 g0 n4 | 7.501 | 0.069 | 4 |  |
| v36 predErr=0.01 text1000 g4 n4 | 7.555 | 0.079 | 4 |  |
| v36 predErr=0.01 text1000 g8 n4 | 7.536 | 0.086 | 4 |  |
| v36 predErr=0.01 text1000 g12 n4 | 7.549 | 0.148 | 4 |  |

Criteria: adoption-ready if book30k and book10k win and no task is worse (t < -2) vs w13 / box eval16c
