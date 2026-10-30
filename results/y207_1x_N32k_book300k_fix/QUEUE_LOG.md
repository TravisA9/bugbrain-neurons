# Queue log (run/queue.js)

## 10/29/2026, 10:23:29 PM · y207_1x_N32k_book300k_fix · DONE
capacity at length (requeue of y200 on the R100 memory fix): 32000 granule cells + mixed claws at book100k / book300k on k 2536-2543 (refs y185b v44 1x, y193 N16000, same growths) (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N32000 book100k g2536 n1 | 3.955 | 0 | 1 |  |
| v44 N32000 book100k g2537 n1 | 3.905 | 0 | 1 |  |
| v44 N32000 book100k g2538 n1 | 4.13 | 0 | 1 |  |
| v44 N32000 book100k g2539 n1 | 4.05 | 0 | 1 |  |
| v44 N32000 book100k g2540 n1 | 4.235 | 0 | 1 |  |
| v44 N32000 book100k g2541 n1 | 4.07 | 0 | 1 |  |
| v44 N32000 book100k g2542 n1 | 4.32 | 0 | 1 |  |
| v44 N32000 book100k g2543 n1 | 4.11 | 0 | 1 |  |
| v44 N32000 book300k g2536 n1 | 3.845 | 0 | 1 |  |
| v44 N32000 book300k g2537 n1 | 4.08 | 0 | 1 |  |
| v44 N32000 book300k g2538 n1 | 4.13 | 0 | 1 |  |
| v44 N32000 book300k g2539 n1 | 4.155 | 0 | 1 |  |
| v44 N32000 book300k g2540 n1 | 4.345 | 0 | 1 |  |
| v44 N32000 book300k g2541 n1 | 4.13 | 0 | 1 |  |
| v44 N32000 book300k g2542 n1 | 4.38 | 0 | 1 |  |
| v44 N32000 book300k g2543 n1 | 4.225 | 0 | 1 |  |

Criteria: y200 crashed (Out of memory in run/lib.js synapse count). y193: 16000 cells +0.008 at 100k and 300k but still fall 100k -> 300k (-0.0028). If 32000 adds again at 100k and does not fall to 300k, capacity is still the binding limit at length.
