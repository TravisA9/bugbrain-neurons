# Queue log (run/queue.js)

## 11/2/2026, 4:04:31 PM · y232a_1x_N32k_sched_book1M_fresh · DONE
step schedule at 1M, fresh held-out (part a): 32000 fixed 0.1 (v46) vs 32000 sched100k at book1M, k 2880-2883 (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N32000 book1M g2880 n1 | 4.46 | 0 | 1 |  |
| v44 N32000 book1M g2881 n1 | 4.39 | 0 | 1 |  |
| v44 N32000 book1M g2882 n1 | 4.13 | 0 | 1 |  |
| v44 N32000 book1M g2883 n1 | 4.465 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2880 n1 | 4.445 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2881 n1 | 4.41 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2882 n1 | 4.135 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2883 n1 | 4.53 | 0 | 1 |  |

Criteria: Pre-registered with y232b (8 fresh growths): sched100k is a length-rule candidate if mean > 0 at 1M with losses not > 60% and t > -2 on y232a+b; adoption additionally needs 16 fresh 1M growths and the full short set (book10k/30k, fables4000, order3, text1000, seqchoice) not worse. Short tasks are unaffected below 100k symbols by construction (step at 100k).
