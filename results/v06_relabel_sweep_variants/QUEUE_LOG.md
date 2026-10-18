# Queue log (run/queue.js)

## 10/17/2026, 7:14:00 PM · v06_relabel_sweep_variants · DONE
Renaming cost of the long-fables fix candidates: v01 variants on order3 relabel g16-31 (question Q23).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.1,pl.peMode=16,pl.peFix=0.01 g16 | 8.399 | 0.43 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.2,pl.peMode=16,pl.peFix=0.01 g16 | 8.468 | 0.406 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.3,pl.peMode=16,pl.peFix=0 g16 | 8.498 | 0.329 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.005 g16 | 8.492 | 0.349 | 16 |  |

Criteria: v35 8.460, v34 8.319 (g16-31); a fix that keeps fables may give up renaming speed
