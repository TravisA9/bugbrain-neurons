# Queue log (run/queue.js)

## 10/30/2026, 12:06:35 PM · y219a_1x_sched_heldout_y210g · DONE
granule step schedule held-out (part a): on y210 growths k 2728-2735 (refs v44, N16000, N16000 granLr0.05 at 100k / 300k in y210): N16000 sched100k and sched30k at 300k, sched30k at 100k, and v44 (8000 cells) + sched100k at 300k (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N16000 sched100k book300k g2728 n1 | 4.065 | 0 | 1 |  |
| v44 N16000 sched100k book300k g2729 n1 | 4.215 | 0 | 1 |  |
| v44 N16000 sched100k book300k g2730 n1 | 3.955 | 0 | 1 |  |
| v44 N16000 sched100k book300k g2731 n1 | 4.105 | 0 | 1 |  |
| v44 N16000 sched100k book300k g2732 n1 | 4.235 | 0 | 1 |  |
| v44 N16000 sched100k book300k g2733 n1 | 4.705 | 0 | 1 |  |
| v44 N16000 sched100k book300k g2734 n1 | 4.11 | 0 | 1 |  |
| v44 N16000 sched100k book300k g2735 n1 | 4.22 | 0 | 1 |  |
| v44 N16000 sched30k book100k g2728 n1 | 3.97 | 0 | 1 |  |
| v44 N16000 sched30k book100k g2729 n1 | 4.245 | 0 | 1 |  |
| v44 N16000 sched30k book100k g2730 n1 | 3.925 | 0 | 1 |  |
| v44 N16000 sched30k book100k g2731 n1 | 4.075 | 0 | 1 |  |
| v44 N16000 sched30k book100k g2732 n1 | 4.395 | 0 | 1 |  |
| v44 N16000 sched30k book100k g2733 n1 | 4.77 | 0 | 1 |  |
| v44 N16000 sched30k book100k g2734 n1 | 3.975 | 0 | 1 |  |
| v44 N16000 sched30k book100k g2735 n1 | 4.17 | 0 | 1 |  |
| v44 N16000 sched30k book300k g2728 n1 | 4.065 | 0 | 1 |  |
| v44 N16000 sched30k book300k g2729 n1 | 4.265 | 0 | 1 |  |
| v44 N16000 sched30k book300k g2730 n1 | 3.975 | 0 | 1 |  |
| v44 N16000 sched30k book300k g2731 n1 | 4.09 | 0 | 1 |  |
| v44 N16000 sched30k book300k g2732 n1 | 4.25 | 0 | 1 |  |
| v44 N16000 sched30k book300k g2733 n1 | 4.66 | 0 | 1 |  |
| v44 N16000 sched30k book300k g2734 n1 | 4.055 | 0 | 1 |  |
| v44 N16000 sched30k book300k g2735 n1 | 4.195 | 0 | 1 |  |
| v44 sched100k book300k g2728 n1 | 4.035 | 0 | 1 |  |
| v44 sched100k book300k g2729 n1 | 4.11 | 0 | 1 |  |
| v44 sched100k book300k g2730 n1 | 3.94 | 0 | 1 |  |
| v44 sched100k book300k g2731 n1 | 3.92 | 0 | 1 |  |
| v44 sched100k book300k g2732 n1 | 4.215 | 0 | 1 |  |
| v44 sched100k book300k g2733 n1 | 4.55 | 0 | 1 |  |
| v44 sched100k book300k g2734 n1 | 3.975 | 0 | 1 |  |
| v44 sched100k book300k g2735 n1 | 4.19 | 0 | 1 |  |

Criteria: y206 (k 2536-2543, n 8): sched100k 300k 0.4122 (+0.0036 vs 0.1, +0.0011 vs 0.05); sched30k 100k +0.0021 vs 0.1, 300k = 0.05. Pool with y219b (16 fresh growths). A schedule becomes the length rule if, on 16 fresh growths, it beats fixed granLr 0.1 at 300k and is not worse than 0.1 at 100k nor than 0.05 at 300k (losses not > 60%, t > -2). sched100k is bit-identical below 100k symbols, so short tasks cannot move. The v44 + sched100k arm asks whether the 8000-cell default also gains.
