# Queue log (run/queue.js)

## 10/18/2026, 11:30:10 PM · z08b_fast_valid_1x · DONE
Fast engine validation at 1x (growths k 1108-1115): exact vs fast on book10k / 30k, fables4000, order3, text1000, seqchoice order2 / cycle (question I84).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v37 book10k exact g1108 n4 | 3.144 | 0.123 | 4 |  |
| v37 book10k exact g1112 n4 | 3.139 | 0.097 | 4 |  |
| v37 book10k fast g1108 n4 | 3.158 | 0.135 | 4 |  |
| v37 book10k fast g1112 n4 | 3.139 | 0.097 | 4 |  |
| v37 book30k exact g1108 n4 | 3.184 | 0.114 | 4 |  |
| v37 book30k exact g1112 n4 | 3.18 | 0.14 | 4 |  |
| v37 book30k fast g1108 n4 | 3.181 | 0.123 | 4 |  |
| v37 book30k fast g1112 n4 | 3.18 | 0.14 | 4 |  |
| v37 fables4000 exact g1108 n4 | 3.46 | 0.19 | 4 |  |
| v37 fables4000 exact g1112 n4 | 3.333 | 0.124 | 4 |  |
| v37 fables4000 fast g1108 n4 | 3.46 | 0.19 | 4 |  |
| v37 fables4000 fast g1112 n4 | 3.333 | 0.124 | 4 |  |
| v37 order3 exact g1108 n4 | 9.481 | 0.241 | 4 |  |
| v37 order3 exact g1112 n4 | 9.519 | 0.228 | 4 |  |
| v37 order3 fast g1108 n4 | 9.481 | 0.241 | 4 |  |
| v37 order3 fast g1112 n4 | 9.519 | 0.228 | 4 |  |
| v37 text1000 exact g1108 n4 | 7.584 | 0.052 | 4 |  |
| v37 text1000 exact g1112 n4 | 7.647 | 0.069 | 4 |  |
| v37 text1000 fast g1108 n4 | 7.584 | 0.052 | 4 |  |
| v37 text1000 fast g1112 n4 | 7.647 | 0.069 | 4 |  |
| v37 seqchoice order2 exact g1108 n4 | 5.815 | 0.796 | 4 |  |
| v37 seqchoice order2 exact g1112 n4 | 5.506 | 1.135 | 4 |  |
| v37 seqchoice order2 fast g1108 n4 | 5.711 | 0.846 | 4 |  |
| v37 seqchoice order2 fast g1112 n4 | 5.506 | 1.135 | 4 |  |
| v37 seqchoice cycle exact g1108 n4 | 8.953 | 0.709 | 4 |  |
| v37 seqchoice cycle exact g1112 n4 | 9.348 | 0.046 | 4 |  |
| v37 seqchoice cycle fast g1108 n4 | 8.953 | 0.709 | 4 |  |
| v37 seqchoice cycle fast g1112 n4 | 9.348 | 0.046 | 4 |  |

Criteria: paired by growth seed (exact vs fast engine, same grown brain): per task mean diff, win / loss, paired t over 16 growths (z08a + z08b; z09a + z09b); wallMs per run gives the speedup on the worker
