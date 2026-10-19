# Queue log (run/queue.js)

## 10/18/2026, 11:27:39 PM · z08a_fast_valid_1x · DONE
Fast engine validation at 1x (growths k 1100-1107): exact vs fast on book10k / 30k, fables4000, order3, text1000, seqchoice order2 / cycle (question I84).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v37 book10k exact g1100 n4 | 3.399 | 0.128 | 4 |  |
| v37 book10k exact g1104 n4 | 3.232 | 0.275 | 4 |  |
| v37 book10k fast g1100 n4 | 3.394 | 0.126 | 4 |  |
| v37 book10k fast g1104 n4 | 3.23 | 0.268 | 4 |  |
| v37 book30k exact g1100 n4 | 3.416 | 0.137 | 4 |  |
| v37 book30k exact g1104 n4 | 3.218 | 0.31 | 4 |  |
| v37 book30k fast g1100 n4 | 3.418 | 0.137 | 4 |  |
| v37 book30k fast g1104 n4 | 3.229 | 0.317 | 4 |  |
| v37 fables4000 exact g1100 n4 | 3.527 | 0.032 | 4 |  |
| v37 fables4000 exact g1104 n4 | 3.418 | 0.069 | 4 |  |
| v37 fables4000 fast g1100 n4 | 3.527 | 0.032 | 4 |  |
| v37 fables4000 fast g1104 n4 | 3.42 | 0.055 | 4 |  |
| v37 order3 exact g1100 n4 | 9.606 | 0.105 | 4 |  |
| v37 order3 exact g1104 n4 | 9.663 | 0.013 | 4 |  |
| v37 order3 fast g1100 n4 | 9.606 | 0.105 | 4 |  |
| v37 order3 fast g1104 n4 | 9.663 | 0.013 | 4 |  |
| v37 text1000 exact g1100 n4 | 7.556 | 0.091 | 4 |  |
| v37 text1000 exact g1104 n4 | 7.527 | 0.1 | 4 |  |
| v37 text1000 fast g1100 n4 | 7.556 | 0.09 | 4 |  |
| v37 text1000 fast g1104 n4 | 7.51 | 0.081 | 4 |  |
| v37 seqchoice order2 exact g1100 n4 | 5.942 | 0.574 | 4 |  |
| v37 seqchoice order2 exact g1104 n4 | 6.46 | 0.408 | 4 |  |
| v37 seqchoice order2 fast g1100 n4 | 6.03 | 0.585 | 4 |  |
| v37 seqchoice order2 fast g1104 n4 | 6.461 | 0.376 | 4 |  |
| v37 seqchoice cycle exact g1100 n4 | 8.889 | 0.715 | 4 |  |
| v37 seqchoice cycle exact g1104 n4 | 9.361 | 0.075 | 4 |  |
| v37 seqchoice cycle fast g1100 n4 | 8.883 | 0.725 | 4 |  |
| v37 seqchoice cycle fast g1104 n4 | 9.367 | 0.073 | 4 |  |

Criteria: paired by growth seed (exact vs fast engine, same grown brain): per task mean diff, win / loss, paired t over 16 growths (z08a + z08b; z09a + z09b); wallMs per run gives the speedup on the worker
