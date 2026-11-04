# Queue log (run/queue.js)

## 11/4/2026, 11:19:34 AM · y238b_1x_N32k_sched_book1M_fresh2 · DONE
step schedule at 1M, fresh held-out growths 9-16 (part b): 32000 fixed 0.1 (v46) vs 32000 sched100k at book1M, k 2932-2935 (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N32000 book1M g2932 n1 | 4.635 | 0 | 1 |  |
| v44 N32000 book1M g2933 n1 | 4.735 | 0 | 1 |  |
| v44 N32000 book1M g2934 n1 | 4.385 | 0 | 1 |  |
| v44 N32000 book1M g2935 n1 | 4.08 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2932 n1 | 4.705 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2933 n1 | 4.765 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2934 n1 | 4.38 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2935 n1 | 4.125 | 0 | 1 |  |

Criteria: Pre-registered (R109): adopt sched100k as the length rule only after 16 fresh 1M growths (mean > 0, losses not > 60%, t > -2 on the 16; y232a/b gave 8: +0.0053, 6/2, t 2.2) and the short set not worse (y238c identity check).
