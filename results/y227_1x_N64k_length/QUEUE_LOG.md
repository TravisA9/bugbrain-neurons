# Queue log (run/queue.js)

## 11/1/2026, 6:27:16 AM · y227_1x_N64k_length · DONE
capacity curve at length: 64000 granule cells at book100k / book300k on k 2536-2543 (refs y193 / y207 N16000 / N32000, y206 sched100k, same growths) (question I101).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N64000 book100k g2536 n1 | 4.01 | 0 | 1 |  |
| v44 N64000 book100k g2537 n1 | 3.975 | 0 | 1 |  |
| v44 N64000 book100k g2538 n1 | 4.205 | 0 | 1 |  |
| v44 N64000 book100k g2539 n1 | 4.115 | 0 | 1 |  |
| v44 N64000 book100k g2540 n1 | 4.235 | 0 | 1 |  |
| v44 N64000 book100k g2541 n1 | 4.09 | 0 | 1 |  |
| v44 N64000 book100k g2542 n1 | 4.395 | 0 | 1 |  |
| v44 N64000 book100k g2543 n1 | 4.12 | 0 | 1 |  |
| v44 N64000 book300k g2536 n1 | 3.885 | 0 | 1 |  |
| v44 N64000 book300k g2537 n1 | 4.08 | 0 | 1 |  |
| v44 N64000 book300k g2538 n1 | 4.1 | 0 | 1 |  |
| v44 N64000 book300k g2539 n1 | 4.2 | 0 | 1 |  |
| v44 N64000 book300k g2540 n1 | 4.33 | 0 | 1 |  |
| v44 N64000 book300k g2541 n1 | 4.115 | 0 | 1 |  |
| v44 N64000 book300k g2542 n1 | 4.43 | 0 | 1 |  |
| v44 N64000 book300k g2543 n1 | 4.31 | 0 | 1 |  |

Criteria: y207: 32000 +0.0075 over 16000 at 300k (8/0). If 64000 adds again at 300k, the text plateau is still a cell-count limit and the sparse granule path becomes mandatory; if it is flat, 32000 is the knee. 100k tells whether the extra cells cost the middle range (32000 was -0.0018 at 100k). ~4x v45 runtime per run.
