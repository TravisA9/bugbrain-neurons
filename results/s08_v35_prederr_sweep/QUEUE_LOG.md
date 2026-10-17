# Queue log (run/queue.js)

## 10/17/2026, 11:19:17 AM · s08_v35_prederr_sweep · DONE
Sweep predErr 0.2 / 0.4 around v35 (peMode 16, peFix 0.01) on fables2000 + text1000, g0 (question Q20).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 fables2000 pl.predErr=0.2,pl.peMode=16,pl.peFix=0.01 g0 | 2.892 | 0.142 | 16 |  |
| deepURSx3 text1000 pl.predErr=0.2,pl.peMode=16,pl.peFix=0.01 g0 | 7.408 | 0.131 | 16 |  |
| deepURSx3 fables2000 pl.predErr=0.4,pl.peMode=16,pl.peFix=0.01 g0 | 2.873 | 0.138 | 16 |  |
| deepURSx3 text1000 pl.predErr=0.4,pl.peMode=16,pl.peFix=0.01 g0 | 7.492 | 0.112 | 16 |  |

Criteria: R53: 0.5/peFix 0.01 fables -0.024 (t -2.4); is 0.4 still safe with more text gain?
