# Queue log (run/queue.js)

## 10/18/2026, 11:56:26 PM · z09b_fast_valid_4xS_book10k · DONE
Fast engine validation at 4xS on book10k (growths k 1108-1115): exact vs fast (question I84).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v37 4xS book10k exact g1108 n4 | 3.309 | 0.239 | 4 |  |
| v37 4xS book10k exact g1112 n4 | 3.314 | 0.237 | 4 |  |
| v37 4xS book10k fast g1108 n4 | 3.309 | 0.239 | 4 |  |
| v37 4xS book10k fast g1112 n4 | 3.314 | 0.237 | 4 |  |

Criteria: paired by growth seed (exact vs fast engine, same grown brain): per task mean diff, win / loss, paired t over 16 growths (z08a + z08b; z09a + z09b); wallMs per run gives the speedup on the worker
