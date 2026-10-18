# Queue log (run/queue.js)

## 10/17/2026, 7:02:39 PM · v05_relabel_replicate_g32 · DONE
Renaming replicate on growths 32-47: v34, v35, peFix 0.2, predErr 1.0 (order3 relabel) (question Q23).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 order3 n2000 relabel0.5 v34(predErr0) g32 | 8.45 | 0.424 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 v35 g32 | 8.652 | 0.352 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.2 g32 | 9.134 | 0.338 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=1,pl.peMode=16,pl.peFix=0.01 g32 | 9.261 | 0.309 | 16 |  |

Criteria: u01/u02 g16-31: peFix 0.2 +0.56 vs v35 (t 6.7), predErr 1.0 +0.46 (t 6.2)
