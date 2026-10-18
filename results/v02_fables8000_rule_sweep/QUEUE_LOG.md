# Queue log (run/queue.js)

## 10/17/2026, 7:18:25 PM · v02_fables8000_rule_sweep · DONE
Same four rule variants on fables8000 (two passes), 8 growths g0-7 (question Q32).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 fables8000 (2 passes) pl.predErr=0.1,pl.peMode=16,pl.peFix=0.01 g0 n8 | 3.186 | 0.099 | 8 |  |
| deepURSx3 fables8000 (2 passes) pl.predErr=0.2,pl.peMode=16,pl.peFix=0.01 g0 n8 | 3.143 | 0.089 | 8 |  |
| deepURSx3 fables8000 (2 passes) pl.predErr=0.3,pl.peMode=16,pl.peFix=0 g0 n8 | 3.146 | 0.105 | 8 |  |
| deepURSx3 fables8000 (2 passes) pl.predErr=0.3,pl.peMode=16,pl.peFix=0.005 g0 n8 | 3.142 | 0.103 | 8 |  |

Criteria: u04: v35 -0.084 vs v34 (t -4.1, 0/8); the harm grows with life length
