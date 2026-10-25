# Queue log (run/queue.js)

## 10/24/2026, 8:55:57 PM · y162a_1x_granAnneal_book100k · DONE
the plateau with a decaying granule step: v43 / anneal 5000 / anneal 20000 at book100k + fables12000, growths 1400-1407 (refs y158 v42 / granLr 0.05, same growths) [linux-pc] (question Q42).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v43 1x book100k g1400 n1 | 3.97 | 0 | 1 |  |
| v43 1x book100k g1401 n1 | 3.7 | 0 | 1 |  |
| v43 1x book100k g1402 n1 | 3.845 | 0 | 1 |  |
| v43 1x book100k g1403 n1 | 3.91 | 0 | 1 |  |
| v43 1x book100k g1404 n1 | 4.46 | 0 | 1 |  |
| v43 1x book100k g1405 n1 | 3.83 | 0 | 1 |  |
| v43 1x book100k g1406 n1 | 3.87 | 0 | 1 |  |
| v43 1x book100k g1407 n1 | 4.22 | 0 | 1 |  |
| v43 1x fables12000 g1400 n1 | 4.159 | 0 | 1 |  |
| v43 1x fables12000 g1401 n1 | 4.273 | 0 | 1 |  |
| v43 1x fables12000 g1402 n1 | 4.251 | 0 | 1 |  |
| v43 1x fables12000 g1403 n1 | 4.159 | 0 | 1 |  |
| v43 1x fables12000 g1404 n1 | 4.353 | 0 | 1 |  |
| v43 1x fables12000 g1405 n1 | 4.273 | 0 | 1 |  |
| v43 1x fables12000 g1406 n1 | 4.183 | 0 | 1 |  |
| v43 1x fables12000 g1407 n1 | 4.23 | 0 | 1 |  |
| v43 anneal5000 book100k g1400 n1 | 3.955 | 0 | 1 |  |
| v43 anneal5000 book100k g1401 n1 | 3.725 | 0 | 1 |  |
| v43 anneal5000 book100k g1402 n1 | 3.845 | 0 | 1 |  |
| v43 anneal5000 book100k g1403 n1 | 3.815 | 0 | 1 |  |
| v43 anneal5000 book100k g1404 n1 | 4.49 | 0 | 1 |  |
| v43 anneal5000 book100k g1405 n1 | 3.78 | 0 | 1 |  |
| v43 anneal5000 book100k g1406 n1 | 3.825 | 0 | 1 |  |
| v43 anneal5000 book100k g1407 n1 | 4.235 | 0 | 1 |  |
| v43 anneal5000 fables12000 g1400 n1 | 4.167 | 0 | 1 |  |
| v43 anneal5000 fables12000 g1401 n1 | 4.255 | 0 | 1 |  |
| v43 anneal5000 fables12000 g1402 n1 | 4.263 | 0 | 1 |  |
| v43 anneal5000 fables12000 g1403 n1 | 4.145 | 0 | 1 |  |
| v43 anneal5000 fables12000 g1404 n1 | 4.349 | 0 | 1 |  |
| v43 anneal5000 fables12000 g1405 n1 | 4.269 | 0 | 1 |  |
| v43 anneal5000 fables12000 g1406 n1 | 4.18 | 0 | 1 |  |
| v43 anneal5000 fables12000 g1407 n1 | 4.236 | 0 | 1 |  |
| v43 anneal20000 book100k g1400 n1 | 3.965 | 0 | 1 |  |
| v43 anneal20000 book100k g1401 n1 | 3.72 | 0 | 1 |  |
| v43 anneal20000 book100k g1402 n1 | 3.865 | 0 | 1 |  |
| v43 anneal20000 book100k g1403 n1 | 3.94 | 0 | 1 |  |
| v43 anneal20000 book100k g1404 n1 | 4.48 | 0 | 1 |  |
| v43 anneal20000 book100k g1405 n1 | 3.81 | 0 | 1 |  |
| v43 anneal20000 book100k g1406 n1 | 3.845 | 0 | 1 |  |
| v43 anneal20000 book100k g1407 n1 | 4.235 | 0 | 1 |  |
| v43 anneal20000 fables12000 g1400 n1 | 4.172 | 0 | 1 |  |
| v43 anneal20000 fables12000 g1401 n1 | 4.251 | 0 | 1 |  |
| v43 anneal20000 fables12000 g1402 n1 | 4.25 | 0 | 1 |  |
| v43 anneal20000 fables12000 g1403 n1 | 4.176 | 0 | 1 |  |
| v43 anneal20000 fables12000 g1404 n1 | 4.37 | 0 | 1 |  |
| v43 anneal20000 fables12000 g1405 n1 | 4.266 | 0 | 1 |  |
| v43 anneal20000 fables12000 g1406 n1 | 4.165 | 0 | 1 |  |
| v43 anneal20000 fables12000 g1407 n1 | 4.226 | 0 | 1 |  |

Criteria: y158: v42 book100k 0.384 (+0.016 over v41) but no length slope; granLr 0.05 +0.002 (5/1) at 100k. If granAnneal turns the slow step's late gain into a slope without the early loss, the plateau was readout step noise.
