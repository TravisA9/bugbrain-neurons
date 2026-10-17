# Queue log (run/queue.js)

## 10/17/2026, 5:36:47 PM · u04_fables8000_second_pass · DONE
Long-gap recall: fables 8000 = two passes of the 4270-char corpus (recall after ~4270 symbols); v34 vs v35, deepURSx4 + v35 rule, slowS98w2 + v35 rule (8 growths g0) (question Q32).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 fables8000 (2 passes) v34(predErr0) g0 n8 | 3.198 | 0.09 | 8 |  |
| deepURSx3 fables8000 (2 passes) v35 g0 n8 | 3.112 | 0.119 | 8 |  |
| deepURSx4 fables8000 (2 passes) v35 g0 n8 | 3.147 | 0.118 | 8 |  |
| slowS98w2 fables8000 (2 passes) v35 g0 n8 | 3.115 | 0.116 | 8 |  |

Criteria: compare stats q2/lastQuarter (second pass) vs firstQuarter; v35 neutral on fables4000 (-0.009); a second-pass gain = real long memory
