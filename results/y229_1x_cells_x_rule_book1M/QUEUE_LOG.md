# Queue log (run/queue.js)

## 11/1/2026, 7:25:49 PM · y229_1x_cells_x_rule_book1M · DONE
cells x rule at 1M symbols (2x2 with y224): 16000 fixed 0.1, 16000 sched100k, 32000 fixed 0.1 (= v46) at book1M on k 2536-2539; supersedes y221 (blocked: its smooth30k arm is rejected and it had no fixed-0.1 reference) (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N16000 book1M g2536 n1 | 4.025 | 0 | 1 |  |
| v44 N16000 book1M g2537 n1 | 4.09 | 0 | 1 |  |
| v44 N16000 book1M g2538 n1 | 4.06 | 0 | 1 |  |
| v44 N16000 book1M g2539 n1 | 4.325 | 0 | 1 |  |
| v44 N16000 sched100k book1M g2536 n1 | 3.985 | 0 | 1 |  |
| v44 N16000 sched100k book1M g2537 n1 | 4.17 | 0 | 1 |  |
| v44 N16000 sched100k book1M g2538 n1 | 4.065 | 0 | 1 |  |
| v44 N16000 sched100k book1M g2539 n1 | 4.485 | 0 | 1 |  |
| v44 N32000 book1M g2536 n1 | 4.005 | 0 | 1 |  |
| v44 N32000 book1M g2537 n1 | 4.095 | 0 | 1 |  |
| v44 N32000 book1M g2538 n1 | 4.09 | 0 | 1 |  |
| v44 N32000 book1M g2539 n1 | 4.41 | 0 | 1 |  |

Criteria: With y224 (32000 sched100k, same growths) this is a 2x2: cell effect = 32000 - 16000 at each rule, rule effect = sched100k - fixed at each size. If the cell effect at 1M is larger than at 300k (+0.0056), capacity is still the long-text limit; if sched100k only helps at 1M, write the length rule. n 4 = direction only.
