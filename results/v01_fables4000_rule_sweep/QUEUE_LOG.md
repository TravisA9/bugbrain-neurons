# Queue log (run/queue.js)

## 10/17/2026, 6:53:36 PM · v01_fables4000_rule_sweep · DONE
Fix v35 long-fables harm? predErr 0.1 / 0.2 (peFix 0.01), peFix 0 / 0.005 (predErr 0.3) on fables4000, growths 16-47 (question Q32).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 fables4000 pl.predErr=0.1,pl.peMode=16,pl.peFix=0.01 g16 | 3.045 | 0.117 | 16 |  |
| deepURSx3 fables4000 pl.predErr=0.1,pl.peMode=16,pl.peFix=0.01 g32 | 3.118 | 0.132 | 16 |  |
| deepURSx3 fables4000 pl.predErr=0.2,pl.peMode=16,pl.peFix=0.01 g16 | 3.04 | 0.108 | 16 |  |
| deepURSx3 fables4000 pl.predErr=0.2,pl.peMode=16,pl.peFix=0.01 g32 | 3.106 | 0.123 | 16 |  |
| deepURSx3 fables4000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0 g16 | 3.017 | 0.119 | 16 |  |
| deepURSx3 fables4000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0 g32 | 3.092 | 0.132 | 16 |  |
| deepURSx3 fables4000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.005 g16 | 3.028 | 0.109 | 16 |  |
| deepURSx3 fables4000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.005 g32 | 3.097 | 0.114 | 16 |  |

Criteria: v34/v35 g16-47 known (u06): v35 -0.029 (t -2.9, n 32). Want a variant with no fables loss
