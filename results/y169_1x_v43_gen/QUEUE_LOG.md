# Queue log (run/queue.js)

## 10/25/2026, 3:57:54 PM · y169_1x_v43_gen · DONE
generation on v42 / v43 (+ output gate 0.2): book30k life then 500 free-run symbols, published stat = train-vocabulary word rate / trigram bits per char (BB_GEN_MEAN), fresh k 2320-2327 (question I72).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v42 1x gen wordValid book30k g2320 n1 | 1 | 0 | 1 |  |
| v42 1x gen wordValid book30k g2321 n1 | 1 | 0 | 1 |  |
| v42 1x gen wordValid book30k g2322 n1 | 1 | 0 | 1 |  |
| v42 1x gen wordValid book30k g2323 n1 | 1 | 0 | 1 |  |
| v42 1x gen wordValid book30k g2324 n1 | 0.9322 | 0 | 1 |  |
| v42 1x gen wordValid book30k g2325 n1 | 1 | 0 | 1 |  |
| v42 1x gen wordValid book30k g2326 n1 | 1 | 0 | 1 |  |
| v42 1x gen wordValid book30k g2327 n1 | 0.9125 | 0 | 1 |  |
| v43 1x gen wordValid book30k g2320 n1 | 0.95 | 0 | 1 |  |
| v43 1x gen wordValid book30k g2321 n1 | 1 | 0 | 1 |  |
| v43 1x gen wordValid book30k g2322 n1 | 1 | 0 | 1 |  |
| v43 1x gen wordValid book30k g2323 n1 | 1 | 0 | 1 |  |
| v43 1x gen wordValid book30k g2324 n1 | 1 | 0 | 1 |  |
| v43 1x gen wordValid book30k g2325 n1 | 1 | 0 | 1 |  |
| v43 1x gen wordValid book30k g2326 n1 | 1 | 0 | 1 |  |
| v43 1x gen wordValid book30k g2327 n1 | 1 | 0 | 1 |  |
| v43 gate0.2 gen wordValid book30k g2320 n1 | 0.4717 | 0 | 1 |  |
| v43 gate0.2 gen wordValid book30k g2321 n1 | 0.5229 | 0 | 1 |  |
| v43 gate0.2 gen wordValid book30k g2322 n1 | 0.6 | 0 | 1 |  |
| v43 gate0.2 gen wordValid book30k g2323 n1 | 0.4245 | 0 | 1 |  |
| v43 gate0.2 gen wordValid book30k g2324 n1 | 0.4206 | 0 | 1 |  |
| v43 gate0.2 gen wordValid book30k g2325 n1 | 0.5546 | 0 | 1 |  |
| v43 gate0.2 gen wordValid book30k g2326 n1 | 0.6667 | 0 | 1 |  |
| v43 gate0.2 gen wordValid book30k g2327 n1 | 0.4608 | 0 | 1 |  |
| v42 1x gen triBits book30k g2320 n1 | 3.6971 | 0 | 1 |  |
| v42 1x gen triBits book30k g2321 n1 | 3.9945 | 0 | 1 |  |
| v42 1x gen triBits book30k g2322 n1 | 3.3024 | 0 | 1 |  |
| v42 1x gen triBits book30k g2323 n1 | 2.6812 | 0 | 1 |  |
| v42 1x gen triBits book30k g2324 n1 | 4.0694 | 0 | 1 |  |
| v42 1x gen triBits book30k g2325 n1 | 2.0022 | 0 | 1 |  |
| v42 1x gen triBits book30k g2326 n1 | 1.8242 | 0 | 1 |  |
| v42 1x gen triBits book30k g2327 n1 | 5.3027 | 0 | 1 |  |
| v43 1x gen triBits book30k g2320 n1 | 2.482 | 0 | 1 |  |
| v43 1x gen triBits book30k g2321 n1 | 3.2978 | 0 | 1 |  |
| v43 1x gen triBits book30k g2322 n1 | 4.489 | 0 | 1 |  |
| v43 1x gen triBits book30k g2323 n1 | 2.0077 | 0 | 1 |  |
| v43 1x gen triBits book30k g2324 n1 | 3.5126 | 0 | 1 |  |
| v43 1x gen triBits book30k g2325 n1 | 1.9139 | 0 | 1 |  |
| v43 1x gen triBits book30k g2326 n1 | 1.8583 | 0 | 1 |  |
| v43 1x gen triBits book30k g2327 n1 | 5.3915 | 0 | 1 |  |
| v43 gate0.2 gen triBits book30k g2320 n1 | 5.1128 | 0 | 1 |  |
| v43 gate0.2 gen triBits book30k g2321 n1 | 5.1848 | 0 | 1 |  |
| v43 gate0.2 gen triBits book30k g2322 n1 | 5.3786 | 0 | 1 |  |
| v43 gate0.2 gen triBits book30k g2323 n1 | 4.8575 | 0 | 1 |  |
| v43 gate0.2 gen triBits book30k g2324 n1 | 4.8905 | 0 | 1 |  |
| v43 gate0.2 gen triBits book30k g2325 n1 | 5.4023 | 0 | 1 |  |
| v43 gate0.2 gen triBits book30k g2326 n1 | 4.8535 | 0 | 1 |  |
| v43 gate0.2 gen triBits book30k g2327 n1 | 5.806 | 0 | 1 |  |

Criteria: y142 published only the teacher-forced fitness (the generation stats stayed in the worker's local jsonl). R91 gen.js BB_GEN_MEAN puts one generation stat in `mean`. Do more / better granules help free-running text (word rate up, trigram bits/char down towards the real-text reference)?
