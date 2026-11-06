# Queue log (run/queue.js)

## 11/6/2026, 2:51:45 AM · y242_1x_v47_gen_length · DONE
generation loops vs life length on v47 (32000 cells, granule step at 100k): book30k vs book300k life, then 500 greedy free-run symbols; published stats distinct4 (loops), nonSpace (space collapse), triBits (vs real text ~2.6); fresh k 2944-2951 (question I72).

| run | mean | sd | growths | note |
|---|---|---|---|---|
| v47 gen distinct4 book30k g2944 n1 | 0.0765 | 0 | 1 |  |
| v47 gen distinct4 book30k g2945 n1 | 0.0463 | 0 | 1 |  |
| v47 gen distinct4 book30k g2946 n1 | 0.1026 | 0 | 1 |  |
| v47 gen distinct4 book30k g2947 n1 | 0.0443 | 0 | 1 |  |
| v47 gen distinct4 book30k g2948 n1 | 0.0121 | 0 | 1 |  |
| v47 gen distinct4 book30k g2949 n1 | 0.1167 | 0 | 1 |  |
| v47 gen distinct4 book30k g2950 n1 | 0.0241 | 0 | 1 |  |
| v47 gen distinct4 book30k g2951 n1 | 0.0463 | 0 | 1 |  |
| v47 gen nonSpace book30k g2944 n1 | 0.608 | 0 | 1 |  |
| v47 gen nonSpace book30k g2945 n1 | 0.6 | 0 | 1 |  |
| v47 gen nonSpace book30k g2946 n1 | 0.536 | 0 | 1 |  |
| v47 gen nonSpace book30k g2947 n1 | 0.632 | 0 | 1 |  |
| v47 gen nonSpace book30k g2948 n1 | 0.498 | 0 | 1 |  |
| v47 gen nonSpace book30k g2949 n1 | 0.686 | 0 | 1 |  |
| v47 gen nonSpace book30k g2950 n1 | 0.6 | 0 | 1 |  |
| v47 gen nonSpace book30k g2951 n1 | 0.77 | 0 | 1 |  |
| v47 gen triBits book30k g2944 n1 | 4.391 | 0 | 1 |  |
| v47 gen triBits book30k g2945 n1 | 3.8848 | 0 | 1 |  |
| v47 gen triBits book30k g2946 n1 | 6.1607 | 0 | 1 |  |
| v47 gen triBits book30k g2947 n1 | 3.6855 | 0 | 1 |  |
| v47 gen triBits book30k g2948 n1 | 4.6926 | 0 | 1 |  |
| v47 gen triBits book30k g2949 n1 | 3.2427 | 0 | 1 |  |
| v47 gen triBits book30k g2950 n1 | 3.3216 | 0 | 1 |  |
| v47 gen triBits book30k g2951 n1 | 1.7035 | 0 | 1 |  |
| v47 gen distinct4 book300k g2944 n1 | 0.0382 | 0 | 1 |  |
| v47 gen distinct4 book300k g2945 n1 | 0.0543 | 0 | 1 |  |
| v47 gen distinct4 book300k g2946 n1 | 0.0624 | 0 | 1 |  |
| v47 gen distinct4 book300k g2947 n1 | 0.0362 | 0 | 1 |  |
| v47 gen distinct4 book300k g2948 n1 | 0.0423 | 0 | 1 |  |
| v47 gen distinct4 book300k g2949 n1 | 0.0724 | 0 | 1 |  |
| v47 gen distinct4 book300k g2950 n1 | 0.0121 | 0 | 1 |  |
| v47 gen distinct4 book300k g2951 n1 | 0.0262 | 0 | 1 |  |
| v47 gen nonSpace book300k g2944 n1 | 0.64 | 0 | 1 |  |
| v47 gen nonSpace book300k g2945 n1 | 0.698 | 0 | 1 |  |
| v47 gen nonSpace book300k g2946 n1 | 0.732 | 0 | 1 |  |
| v47 gen nonSpace book300k g2947 n1 | 0.504 | 0 | 1 |  |
| v47 gen nonSpace book300k g2948 n1 | 0.498 | 0 | 1 |  |
| v47 gen nonSpace book300k g2949 n1 | 0.374 | 0 | 1 |  |
| v47 gen nonSpace book300k g2950 n1 | 0.338 | 0 | 1 |  |
| v47 gen nonSpace book300k g2951 n1 | 0.558 | 0 | 1 |  |
| v47 gen triBits book300k g2944 n1 | 5.2832 | 0 | 1 |  |
| v47 gen triBits book300k g2945 n1 | 4.0081 | 0 | 1 |  |
| v47 gen triBits book300k g2946 n1 | 1.6446 | 0 | 1 |  |
| v47 gen triBits book300k g2947 n1 | 6.3317 | 0 | 1 |  |
| v47 gen triBits book300k g2948 n1 | 4.7578 | 0 | 1 |  |
| v47 gen triBits book300k g2949 n1 | 10.6227 | 0 | 1 |  |
| v47 gen triBits book300k g2950 n1 | 11.477 | 0 | 1 |  |
| v47 gen triBits book300k g2951 n1 | 5.3304 | 0 | 1 |  |

Criteria: Box smoke (book3k, g2944): greedy collapses to spaces (nonSpace 0.035, distinct4 0.076, triBits 5.78). y169 (v43, book30k): word rate ~0.10. Question: does a 10x longer life (where the step fires) cut the greedy loops, i.e. is looping a capacity / learning problem or a readout-policy problem? If book300k is not clearly better on distinct4 / nonSpace (paired, 8 growths), loops are a policy problem -> next: sampled / anti-repeat readout, not more learning. Each stat is a separate run on the same growth (queue keeps one mean per run); teacher-forced fitness is in fitMean.
