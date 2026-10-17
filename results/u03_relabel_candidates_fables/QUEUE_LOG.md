# Queue log (run/queue.js)

## 10/17/2026, 5:34:43 PM · u03_relabel_candidates_fables · DONE
Safety for the renaming candidates: peFix 0.05 / 0.1 (predErr 0.3) on fables2000 and fables4000 relabel, g0-15 (question Q23).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 fables2000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.05 g0 | 2.773 | 0.15 | 16 |  |
| deepURSx3 fables2000 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.1 g0 | 2.497 | 0.18 | 16 |  |
| deepURSx3 fables4000 relabel0.5 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.05 g0 | 2.502 | 0.139 | 16 |  |
| deepURSx3 fables4000 relabel0.5 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.1 g0 | 2.144 | 0.187 | 16 |  |

Criteria: v34/v35 g0 known (fables2000, fables4000rl). R53: peFix 0.05 at predErr 0.5 cost fables -0.33; is predErr 0.3 milder?
