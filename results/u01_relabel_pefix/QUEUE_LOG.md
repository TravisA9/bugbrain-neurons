# Queue log (run/queue.js)

## 10/17/2026, 5:11:30 PM · u01_relabel_pefix · DONE
Renaming (analogy): v35 hybrid LTD with a bigger fixed part, peFix 0.05 / 0.1 / 0.2 (predErr 0.3), order3 relabel g16-31 (question Q23).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.05 g16 | 8.875 | 0.51 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.1 g16 | 8.882 | 0.56 | 16 |  |
| deepURSx3 order3 n2000 relabel0.5 pl.predErr=0.3,pl.peMode=16,pl.peFix=0.2 g16 | 9.017 | 0.506 | 16 |  |

Criteria: paired g16-31: v34 8.319, v35 8.460, additive predErr 0.05 8.863 (v35 is -0.40 vs additive, t -4.7). Does more fixed-size LTD recover fast unlearning?
