# Queue log (run/queue.js)

## 11/4/2026, 9:19:49 PM · y237_1x_N64k_sched_book1M · DONE
does capacity pay at 1M with the step rule? 64000 sched100k at book1M on k 2536-2539 (refs: y224 32000 sched100k 0.4213, y229 16000 sched100k 0.4176, same growths) (question I101).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N64000 sched100k book1M g2536 n1 | 4.025 | 0 | 1 |  |
| v44 N64000 sched100k book1M g2537 n1 | 4.19 | 0 | 1 |  |
| v44 N64000 sched100k book1M g2538 n1 | 4.235 | 0 | 1 |  |
| v44 N64000 sched100k book1M g2539 n1 | 4.48 | 0 | 1 |  |

Criteria: Screen (n 4, direction). y229: the cell gain shrank at 1M (32000 vs 16000 +0.0025-0.0036 vs +0.0054 at 300k). If 64000 sched100k > 32000 sched100k by > +0.003 (3/1+), capacity still pays at 1M and the plateau is capacity-bound; if flat, the 1M limit is the rule / readout, not cells.
