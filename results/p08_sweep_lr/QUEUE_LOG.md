# Queue log (run/queue.js)

## 10/17/2026, 12:26:37 AM · p08_sweep_lr · DONE
Sweep deepURSx3 pl.lr x0.75/x1.25 on order3/order2 (non-text half of refill tier b), 16 growths (question AUTO).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 order3 base g0 | 9.963 | 0.003 | 16 |  |
| deepURSx3 order2 base g0 | 5.852 | 1.059 | 16 |  |
| deepURSx3 order3 pl.lr=0.0375 g0 | 9.962 | 0.003 | 16 |  |
| deepURSx3 order2 pl.lr=0.0375 g0 | 5.995 | 1.036 | 16 |  |
| deepURSx3 order3 pl.lr=0.0625 g0 | 9.966 | 0.004 | 16 |  |
| deepURSx3 order2 pl.lr=0.0625 g0 | 5.612 | 1.453 | 16 |  |

Criteria: same keys as run/refill.js sweeps; refill keeps only the text runs
