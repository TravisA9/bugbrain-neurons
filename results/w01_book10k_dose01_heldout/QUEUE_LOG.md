# Queue log (run/queue.js)

## 10/17/2026, 9:13:30 PM · w01_book10k_dose01_heldout · DONE
Real corpus held-out check of the lead candidate: book 10k (last 2000 held out), v35 vs predErr 0.1, growths 0-15 (I66 / I70; also the 1x point of the size ladder) (question Q32).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 book10k eval2000 v35 g0 n16 | 2.707 | 0.193 | 16 |  |
| deepURSx3 book10k eval2000 predErr0.1 g0 n16 | 2.79 | 0.206 | 16 |  |

Criteria: adopt predErr 0.1 only if book is not worse (t > -2) here AND on PC q46-q57
