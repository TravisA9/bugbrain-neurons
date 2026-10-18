# Queue log (run/queue.js)

## 10/17/2026, 11:40:36 PM · w05_size2x_book10k · DONE
Size ladder 2x (sc.grid 85, maxCells 6800: ~6800 hidden cells) on book 10k, v35 and predErr 0.1, growths 0-7 (1x = w01 g0-7) (question I73).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 book10k eval2000 v35 2x g0 n8 | 2.678 | 0.239 | 8 |  |
| deepURSx3 book10k eval2000 predErr0.1 2x g0 n8 | 2.718 | 0.256 | 8 |  |

Criteria: scaling pays if 2x - 1x >= +0.01 held-out accuracy
