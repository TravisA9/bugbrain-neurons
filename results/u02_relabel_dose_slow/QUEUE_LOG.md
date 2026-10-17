# Queue log (run/queue.js)

## 10/17/2026, 5:13:24 PM · u02_relabel_dose_slow · DONE
Renaming: v35 rule stronger (predErr 0.6 / 1.0, peFix 0.01) and slowS98w2 + v35 rule, order3 relabel g16-31 (question Q23).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.6,pl.peMode=16,pl.peFix=0.01 g16 | 8.524 | 0.295 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=1,pl.peMode=16,pl.peFix=0.01 g16 | 8.916 | 0.5 | 16 |  |
| slowS98w2 order3 n2000 relabel0.5 v35 g16 | 8.346 | 0.429 | 16 |  |

Criteria: same pairing as u01
