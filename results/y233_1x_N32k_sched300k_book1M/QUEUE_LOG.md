# Queue log (run/queue.js)

## 11/2/2026, 11:14:58 PM · y233_1x_N32k_sched300k_book1M · DONE
when to step at 1M: 32000 sched300k (granLrT 300000, late 0.05) at book1M on k 2536-2539 (refs: y229 32000 fixed, y224 32000 sched100k, same growths) (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N32000 sched300k book1M g2536 n1 | 3.985 | 0 | 1 |  |
| v44 N32000 sched300k book1M g2537 n1 | 4.165 | 0 | 1 |  |
| v44 N32000 sched300k book1M g2538 n1 | 4.19 | 0 | 1 |  |
| v44 N32000 sched300k book1M g2539 n1 | 4.45 | 0 | 1 |  |

Criteria: Screen (n 4, direction only): if the step at 300k beats sched100k at 1M, the rule scales with text length (anneal later for longer text); if it is worse, early annealing is the lever.
