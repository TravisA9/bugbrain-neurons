# Queue log (run/queue.js)

## 10/17/2026, 11:13:16 AM · s07_v35_pefix_sweep · DONE
Sweep peFix 0.005 / 0.02 around v35 (predErr 0.3, peMode 16) on fables2000 + text1000, g0 (question Q20).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 fables2000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.005 g0 | 2.892 | 0.156 | 16 |  |
| deepURSx3 text1000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.005 g0 | 7.45 | 0.135 | 16 |  |
| deepURSx3 fables2000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.02 g0 | 2.865 | 0.142 | 16 |  |
| deepURSx3 text1000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.02 g0 | 7.458 | 0.106 | 16 |  |

Criteria: v35 g0 and v34 base g0 known (results_box/r53); R53 peFix 0.02 hurt fables at predErr 0.5
