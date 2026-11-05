# Queue log (run/queue.js)

## 11/5/2026, 3:58:56 AM · y239_1x_N32k_schedEarly_book1M · DONE
step time / late rate at 1M: 32000 sched30k (late 0.05) and sched100k late 0.025 at book1M on k 2536-2539 (refs: y229 fixed, y224 sched100k, y233 sched300k, same growths) (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N32000 sched30k book1M g2536 n1 | 4.015 | 0 | 1 |  |
| v44 N32000 sched30k book1M g2537 n1 | 4.195 | 0 | 1 |  |
| v44 N32000 sched30k book1M g2538 n1 | 4.17 | 0 | 1 |  |
| v44 N32000 sched30k book1M g2539 n1 | 4.405 | 0 | 1 |  |
| v44 N32000 sched100k late025 book1M g2536 n1 | 3.985 | 0 | 1 |  |
| v44 N32000 sched100k late025 book1M g2537 n1 | 4.2 | 0 | 1 |  |
| v44 N32000 sched100k late025 book1M g2538 n1 | 4.195 | 0 | 1 |  |
| v44 N32000 sched100k late025 book1M g2539 n1 | 4.445 | 0 | 1 |  |

Criteria: Screen (n 4, direction). y233: sched300k -0.0015 vs sched100k (1/3). If sched30k >= sched100k, the step time is not length-bound (anneal early); if late 0.025 > 0.05 by > +0.003, the late rate is the lever. Neither replaces sched100k without its own 16 fresh growths.
