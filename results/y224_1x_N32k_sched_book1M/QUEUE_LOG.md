# Queue log (run/queue.js)

## 11/2/2026, 12:00:12 AM · y224_1x_N32k_sched_book1M · DONE
capacity vs rule at 1M symbols: 32000 cells + sched100k at book1M on k 2536-2539 (16000-cell 1M arms in y221, same growths) (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N32000 sched100k book1M g2536 n1 | 4.015 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2537 n1 | 4.215 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2538 n1 | 4.165 | 0 | 1 |  |
| v44 N32000 sched100k book1M g2539 n1 | 4.455 | 0 | 1 |  |

Criteria: Pairs with y221: if 32000 sched100k beats 16000 sched100k at 1M by more than at 300k, capacity is the long-text limit; if equal, the step rule is. Runs are long (~5.6 h each on linux-pc).
