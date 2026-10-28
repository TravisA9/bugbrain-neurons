# Queue log (run/queue.js)

## 10/27/2026, 10:13:15 PM · y185a_1x_v44_lenRule_book300k · DONE
the learning rule at length: v44 at book100k / book300k with half the cortex step (lr 0.1) or half the granule NLMS step (granLr 0.05), plus granW 40 at 100k, k 2512-2519 (book300k refs v43 / v44 = y181, same growths) (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v44 1x book100k g2512 n1 | 3.765 | 0 | 1 |  |
| v44 1x book100k g2513 n1 | 4.04 | 0 | 1 |  |
| v44 1x book100k g2514 n1 | 4.105 | 0 | 1 |  |
| v44 1x book100k g2515 n1 | 3.98 | 0 | 1 |  |
| v44 1x book100k g2516 n1 | 3.865 | 0 | 1 |  |
| v44 1x book100k g2517 n1 | 4.1 | 0 | 1 |  |
| v44 1x book100k g2518 n1 | 3.985 | 0 | 1 |  |
| v44 1x book100k g2519 n1 | 3.925 | 0 | 1 |  |
| v44 cxlr0.1 book100k g2512 n1 | 3.78 | 0 | 1 |  |
| v44 cxlr0.1 book100k g2513 n1 | 4.02 | 0 | 1 |  |
| v44 cxlr0.1 book100k g2514 n1 | 4.16 | 0 | 1 |  |
| v44 cxlr0.1 book100k g2515 n1 | 3.99 | 0 | 1 |  |
| v44 cxlr0.1 book100k g2516 n1 | 3.92 | 0 | 1 |  |
| v44 cxlr0.1 book100k g2517 n1 | 4.1 | 0 | 1 |  |
| v44 cxlr0.1 book100k g2518 n1 | 4.045 | 0 | 1 |  |
| v44 cxlr0.1 book100k g2519 n1 | 3.88 | 0 | 1 |  |
| v44 cxlr0.1 book300k g2512 n1 | 3.955 | 0 | 1 |  |
| v44 cxlr0.1 book300k g2513 n1 | 4.235 | 0 | 1 |  |
| v44 cxlr0.1 book300k g2514 n1 | 4.2 | 0 | 1 |  |
| v44 cxlr0.1 book300k g2515 n1 | 3.77 | 0 | 1 |  |
| v44 cxlr0.1 book300k g2516 n1 | 3.795 | 0 | 1 |  |
| v44 cxlr0.1 book300k g2517 n1 | 3.99 | 0 | 1 |  |
| v44 cxlr0.1 book300k g2518 n1 | 4.1 | 0 | 1 |  |
| v44 cxlr0.1 book300k g2519 n1 | 3.815 | 0 | 1 |  |
| v44 granLr0.05 book100k g2512 n1 | 3.78 | 0 | 1 |  |
| v44 granLr0.05 book100k g2513 n1 | 4.05 | 0 | 1 |  |
| v44 granLr0.05 book100k g2514 n1 | 4.12 | 0 | 1 |  |
| v44 granLr0.05 book100k g2515 n1 | 4.06 | 0 | 1 |  |
| v44 granLr0.05 book100k g2516 n1 | 3.975 | 0 | 1 |  |
| v44 granLr0.05 book100k g2517 n1 | 4.095 | 0 | 1 |  |
| v44 granLr0.05 book100k g2518 n1 | 4.01 | 0 | 1 |  |
| v44 granLr0.05 book100k g2519 n1 | 3.835 | 0 | 1 |  |
| v44 granLr0.05 book300k g2512 n1 | 3.895 | 0 | 1 |  |
| v44 granLr0.05 book300k g2513 n1 | 4.295 | 0 | 1 |  |
| v44 granLr0.05 book300k g2514 n1 | 4.22 | 0 | 1 |  |
| v44 granLr0.05 book300k g2515 n1 | 3.85 | 0 | 1 |  |
| v44 granLr0.05 book300k g2516 n1 | 3.92 | 0 | 1 |  |
| v44 granLr0.05 book300k g2517 n1 | 4.095 | 0 | 1 |  |
| v44 granLr0.05 book300k g2518 n1 | 4.105 | 0 | 1 |  |
| v44 granLr0.05 book300k g2519 n1 | 3.885 | 0 | 1 |  |
| v44 granW40 book100k g2512 n1 | 3.74 | 0 | 1 |  |
| v44 granW40 book100k g2513 n1 | 4.11 | 0 | 1 |  |
| v44 granW40 book100k g2514 n1 | 4.21 | 0 | 1 |  |
| v44 granW40 book100k g2515 n1 | 4 | 0 | 1 |  |
| v44 granW40 book100k g2516 n1 | 3.87 | 0 | 1 |  |
| v44 granW40 book100k g2517 n1 | 4.125 | 0 | 1 |  |
| v44 granW40 book100k g2518 n1 | 3.935 | 0 | 1 |  |
| v44 granW40 book100k g2519 n1 | 3.935 | 0 | 1 |  |

Criteria: y162b: the 1x brain is slightly worse at 300k than at 100k (0.394 vs 0.398) and granAnneal does not help; if a smaller main-cortex or granule step lifts 300k above 100k, the plateau is a step-size (rule) problem and an annealed cortex step is the next design.
