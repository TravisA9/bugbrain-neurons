# Queue log (run/queue.js)

## 11/3/2026, 7:31:50 PM · y238c_1x_N32k_sched_short_identity · DONE
short-set identity check for the step rule: 32000 sched100k on book10k/30k, fables4000, order3, K4, text1000, seqchoice x2, k 2904-2905 (ref: y235a 32000 arm, same growths) (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 N32000 sched100k book10k g2904 n1 | 4.195 | 0 | 1 |  |
| v44 N32000 sched100k book10k g2905 n1 | 4.075 | 0 | 1 |  |
| v44 N32000 sched100k book30k g2904 n1 | 4.335 | 0 | 1 |  |
| v44 N32000 sched100k book30k g2905 n1 | 4.49 | 0 | 1 |  |
| v44 N32000 sched100k fables4000 g2904 n1 | 3.636 | 0 | 1 |  |
| v44 N32000 sched100k fables4000 g2905 n1 | 3.758 | 0 | 1 |  |
| v44 N32000 sched100k order3 g2904 n1 | 9.675 | 0 | 1 |  |
| v44 N32000 sched100k order3 g2905 n1 | 9.7 | 0 | 1 |  |
| v44 N32000 sched100k K4 g2904 n1 | 9.85 | 0 | 1 |  |
| v44 N32000 sched100k K4 g2905 n1 | 9.875 | 0 | 1 |  |
| v44 N32000 sched100k text1000 g2904 n1 | 7.58 | 0 | 1 |  |
| v44 N32000 sched100k text1000 g2905 n1 | 7.8 | 0 | 1 |  |
| v44 N32000 sched100k seqchoice order2 g2904 n1 | 5.01 | 0 | 1 |  |
| v44 N32000 sched100k seqchoice order2 g2905 n1 | 5.615 | 0 | 1 |  |
| v44 N32000 sched100k seqchoice cycle g2904 n1 | 9.03 | 0 | 1 |  |
| v44 N32000 sched100k seqchoice cycle g2905 n1 | 9.02 | 0 | 1 |  |

Criteria: The step fires after 100000 teaching events, so every short task should be bit-identical to v46 (y235a 32000 arm on k 2904-2905). Any difference = the event counter is not what we think -> no adoption until explained.
