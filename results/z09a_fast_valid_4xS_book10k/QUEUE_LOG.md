# Queue log (run/queue.js)

## 10/18/2026, 11:53:09 PM · z09a_fast_valid_4xS_book10k · DONE
Fast engine validation at 4xS on book10k (growths k 1100-1107): exact vs fast (question I84).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v37 4xS book10k exact g1100 n4 | 3.449 | 0.258 | 4 |  |
| v37 4xS book10k exact g1104 n4 | 3.32 | 0.094 | 4 |  |
| v37 4xS book10k fast g1100 n4 | 3.449 | 0.258 | 4 |  |
| v37 4xS book10k fast g1104 n4 | 3.32 | 0.094 | 4 |  |

Criteria: paired by growth seed (exact vs fast engine, same grown brain): per task mean diff, win / loss, paired t over 16 growths (z08a + z08b; z09a + z09b); wallMs per run gives the speedup on the worker
