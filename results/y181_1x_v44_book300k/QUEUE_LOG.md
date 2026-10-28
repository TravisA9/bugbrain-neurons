# Queue log (run/queue.js)

## 10/28/2026, 2:00:32 PM · y181_1x_v44_book300k · DONE
the plateau at 300k symbols with the bigger granule layer: v43 / v44 at book300k, fresh k 2512-2519 (30k / 100k = y178) (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v43 1x book300k g2512 n1 | 3.77 | 0 | 1 |  |
| v43 1x book300k g2513 n1 | 4.02 | 0 | 1 |  |
| v43 1x book300k g2514 n1 | 4.085 | 0 | 1 |  |
| v43 1x book300k g2515 n1 | 3.66 | 0 | 1 |  |
| v43 1x book300k g2516 n1 | 3.79 | 0 | 1 |  |
| v43 1x book300k g2517 n1 | 3.905 | 0 | 1 |  |
| v43 1x book300k g2518 n1 | 3.86 | 0 | 1 |  |
| v43 1x book300k g2519 n1 | 3.73 | 0 | 1 |  |
| v44 1x book300k g2512 n1 | 3.955 | 0 | 1 |  |
| v44 1x book300k g2513 n1 | 4.245 | 0 | 1 |  |
| v44 1x book300k g2514 n1 | 4.23 | 0 | 1 |  |
| v44 1x book300k g2515 n1 | 3.77 | 0 | 1 |  |
| v44 1x book300k g2516 n1 | 3.835 | 0 | 1 |  |
| v44 1x book300k g2517 n1 | 3.985 | 0 | 1 |  |
| v44 1x book300k g2518 n1 | 4.09 | 0 | 1 |  |
| v44 1x book300k g2519 n1 | 3.805 | 0 | 1 |  |

Criteria: v42 book100k 0.384 vs 30k ~0.39; y93 v39 flat to 1M. If v44 keeps climbing 100k -> 300k (y178 + this) while v43 is flat, the length plateau is granule capacity and the next step is sizing the layer with training length; if both are flat at 300k, the limit is the cortex / readout rule.
