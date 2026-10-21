# Queue log (run/queue.js)

## 10/21/2026, 10:10:15 AM · y137_1x_v41_gen · DONE
generation with v41 vs v40 (gen.js, book30k, greedy + T0.7), growths 0-7 (question I72).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v40 1x gen30k greedy g0 n1 | 3.28 | 0 | 1 |  |
| v40 1x gen30k greedy g1 n1 | 3.515 | 0 | 1 |  |
| v40 1x gen30k greedy g2 n1 | 3.845 | 0 | 1 |  |
| v40 1x gen30k greedy g3 n1 | 3.55 | 0 | 1 |  |
| v40 1x gen30k greedy g4 n1 | 3.515 | 0 | 1 |  |
| v40 1x gen30k greedy g5 n1 | 3.215 | 0 | 1 |  |
| v40 1x gen30k greedy g6 n1 | 3.375 | 0 | 1 |  |
| v40 1x gen30k greedy g7 n1 | 3.205 | 0 | 1 |  |
| v40 1x gen30k T0.7 g0 n1 | 3.28 | 0 | 1 |  |
| v40 1x gen30k T0.7 g1 n1 | 3.515 | 0 | 1 |  |
| v40 1x gen30k T0.7 g2 n1 | 3.845 | 0 | 1 |  |
| v40 1x gen30k T0.7 g3 n1 | 3.55 | 0 | 1 |  |
| v40 1x gen30k T0.7 g4 n1 | 3.515 | 0 | 1 |  |
| v40 1x gen30k T0.7 g5 n1 | 3.215 | 0 | 1 |  |
| v40 1x gen30k T0.7 g6 n1 | 3.375 | 0 | 1 |  |
| v40 1x gen30k T0.7 g7 n1 | 3.205 | 0 | 1 |  |
| v41 1x gen30k greedy g0 n1 | 3.695 | 0 | 1 |  |
| v41 1x gen30k greedy g1 n1 | 3.995 | 0 | 1 |  |
| v41 1x gen30k greedy g2 n1 | 3.92 | 0 | 1 |  |
| v41 1x gen30k greedy g3 n1 | 3.985 | 0 | 1 |  |
| v41 1x gen30k greedy g4 n1 | 3.855 | 0 | 1 |  |
| v41 1x gen30k greedy g5 n1 | 3.6 | 0 | 1 |  |
| v41 1x gen30k greedy g6 n1 | 3.76 | 0 | 1 |  |
| v41 1x gen30k greedy g7 n1 | 3.565 | 0 | 1 |  |
| v41 1x gen30k T0.7 g0 n1 | 3.695 | 0 | 1 |  |
| v41 1x gen30k T0.7 g1 n1 | 3.995 | 0 | 1 |  |
| v41 1x gen30k T0.7 g2 n1 | 3.92 | 0 | 1 |  |
| v41 1x gen30k T0.7 g3 n1 | 3.985 | 0 | 1 |  |
| v41 1x gen30k T0.7 g4 n1 | 3.855 | 0 | 1 |  |
| v41 1x gen30k T0.7 g5 n1 | 3.6 | 0 | 1 |  |
| v41 1x gen30k T0.7 g6 n1 | 3.76 | 0 | 1 |  |
| v41 1x gen30k T0.7 g7 n1 | 3.565 | 0 | 1 |  |

Criteria: R79: v40 greedy ~95 % spaces, T0.7 ~70 % valid words, trigram surprise 6 bits vs real 2.4. Do granule (t, t-1, t-2) codes make generated text more trigram-like?
