# Queue log (run/queue.js)

## 10/19/2026, 3:36:31 AM · z06_gate_gen_book30k · DONE
Confidence-gated generation after a 30k life (1x, 16 growths): greedy / sampled T1 / gate share 0.5 / gate margin 0.2 / gate 0.4 + T0.7 (question I81).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v37 gen greedy g0 n4 | 3.393 | 0.195 | 4 |  |
| v37 gen greedy g4 n4 | 3.202 | 0.097 | 4 |  |
| v37 gen greedy g8 n4 | 3.159 | 0.05 | 4 |  |
| v37 gen greedy g12 n4 | 3.206 | 0.116 | 4 |  |
| v37 gen T1 g0 n4 | 3.393 | 0.195 | 4 |  |
| v37 gen T1 g4 n4 | 3.202 | 0.097 | 4 |  |
| v37 gen T1 g8 n4 | 3.159 | 0.05 | 4 |  |
| v37 gen T1 g12 n4 | 3.206 | 0.116 | 4 |  |
| v37 gen gate0.5 g0 n4 | 3.393 | 0.195 | 4 |  |
| v37 gen gate0.5 g4 n4 | 3.202 | 0.097 | 4 |  |
| v37 gen gate0.5 g8 n4 | 3.159 | 0.05 | 4 |  |
| v37 gen gate0.5 g12 n4 | 3.206 | 0.116 | 4 |  |
| v37 gen gate margin0.2 g0 n4 | 3.393 | 0.195 | 4 |  |
| v37 gen gate margin0.2 g4 n4 | 3.202 | 0.097 | 4 |  |
| v37 gen gate margin0.2 g8 n4 | 3.159 | 0.05 | 4 |  |
| v37 gen gate margin0.2 g12 n4 | 3.206 | 0.116 | 4 |  |
| v37 gen gate0.4 T0.7 g0 n4 | 3.393 | 0.195 | 4 |  |
| v37 gen gate0.4 T0.7 g4 n4 | 3.202 | 0.097 | 4 |  |
| v37 gen gate0.4 T0.7 g8 n4 | 3.159 | 0.05 | 4 |  |
| v37 gen gate0.4 T0.7 g12 n4 | 3.206 | 0.116 | 4 |  |

Criteria: gen quality: wordValid, distinct4, topCharFrac, nonSpace, triBits; teacher-forced gateCov / gatePrec. Learning is identical in every arm (1x book: no dopamine-learning synapses), so heldAcc must be equal across arms
