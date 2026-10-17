# Queue log (run/queue.js)

## 10/17/2026, 8:21:09 AM · p14_v34_depth_fables4000 · DONE
Long non-repeating memory on the v34 engine: deepURSx3 / x4 / x6 / x8 on fables 4000 (one full pass of the 4270-char corpus) + deepURSx3 fables4000 renamed at 0.5 (16 growths) (question Q32).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| deepURSx3 fables4000 (v34 engine) g0 | 3.008 | 0.136 | 16 |  |
| deepURSx4 fables4000 (v34 engine) g0 | 3.022 | 0.143 | 16 |  |
| deepURSx6 fables4000 (v34 engine) g0 | 2.971 | 0.138 | 16 |  |
| deepURSx8 fables4000 (v34 engine) g0 | 2.953 | 0.144 | 16 |  |
| deepURSx3 fables4000 relabel 0.5 (v34 engine) g0 | 2.62 | 0.081 | 16 |  |

Criteria: v34 engine only (DEFAULTS_VERSION 27, deepURSx3 = the v34 plan): pairs with PC job q40_v35_fables_long (v35 / x4+PE / x6+PE / slowS98w2+PE on the same growths) and q44 (v35 fables relabel). Do NOT run on a v35 checkout (deepURSx3 would then be v35 and duplicate q40)
