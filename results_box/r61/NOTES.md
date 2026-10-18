# R61: why v35 is a weak learner on real text (book): running notes
Worktree /workspace/bb-book, branch neuro/book-diag (from 1b32911). Defaults unchanged. Accuracy below = held-out (book), or fitness/10 (fables4000, order3). 8 growths unless noted.

## Diagnosis
- **Learning curve (base v35):** 3k 0.289, 10k 0.279, 30k 0.230, 100k 0.149. Longer lives make it WORSE. Train and held-out accuracy are about equal, so this is not memorizing.
- **Oracle readout (seed 11, softmax fit on the recorded states):**
  - current, 1-back and 2-back symbols decode at 0.97–1.0;
  - next-symbol held-out accuracy from the 480 current-symbol cells (cortex tag 7, the plastic inputs) is 0.39–0.40 at 10k, 30k and 100k, vs the brain's 0.31 / 0.26 / 0.18;
  - data-matched bigram 0.31–0.32, 3-gram 0.43;
  - the taught prediction cells (tag 1) give a linear 0.29 (10k) and 0.36 (100k), while the brain gives 0.31 / 0.18.
  => The information is there and is stable over a long life. The local learning and readout don't extract it, and that gets worse over time. This is NOT a representation bottleneck, at least up to about the 3-gram level.
- **Mixing (conjunction) cells:** about 27 of 359 cells are active per slot. The code is unstable: 98k distinct codes for 410 letter pairs (H(code|pair) = 9.3 bits), and a readout of the next symbol from them gives only 0.19–0.23. So real trigram use through the mixing layer is weak. That limits going past bigram, but it isn't today's main loss.
- **Decoder:**
  - 28–33% of held-out predictions are tied read-window counts, which count as "no answer" (mean read spikes 5.9 at 10k, 2.7 at 100k);
  - a random tie-break would give 0.36 (10k) and 0.24 (100k) vs the brain's 0.31 / 0.18;
  - the brain over-predicts space (33% of predictions vs 20% true).
- **Saturation:**
  - plastic weights are not saturated high: about 96% sit near the floor, and the mean weight drops from 0.24 to 0.11 within 2k symbols, then slowly to 0.09 at 100k;
  - output firing in the read window fades over a long life.

## Fix screens (8 growths)
| variant | book10k | book30k | fables4000 | order3 |
|---|---|---|---|---|
| base | 0.279 | 0.230 | 0.301 | 0.907 |
| readIn 0.01 (graded decoder, existing task param) | 0.301 | 0.248 | 0.332 | 0.952 |
| predErr 0.1 | 0.286 | 0.265 | 0.303 | 0.894 |
| predErr 0 | 0.290 | 0.281 | 0.302 | 0.887 |
| lr 0.02 | 0.281 | 0.260 | 0.295 | 0.819 (harm) |
| readIn 0.01 + predErr 0 | (running) | **0.303** | (running) | (running) |
- The predErr hybrid LTD drives much of the long-life decline (30k: +0.05 with it off).
- readIn fixes the tie losses (+0.02–0.045 everywhere, no harm).
- Running: readIn + predErr 0 / 0.1 on 10k, fables and order3 (screenC2), and the 100k book life for base / predErr 0 / predErr 0.1, all with readIn (screenC).

## Mechanism of the long-life decline (code reading, 20:58 CT)
- Teacher potentiation uses metaplasticity (pl.metaN 40). Each presynaptic cell's potentiation is scaled by metaN / (metaN + E), where E is the total potentiation that cell has ever received. E never decays, so the learning rate keeps shrinking towards 0 over a life.
- The predErr LTD is NOT scaled that way. Over a long life depression wins, the weights fall to the floor and the output read-window firing fades.
- This fits the data: turning predErr off helps the 30k life far more than the 10k life.
- New option `pl.metaCap` (off by default; bit-identical when off: same scores and stats on book1500 x2 and order3): caps E, so potentiation keeps a floor rate.

## Screen C/C2 partial (graded decoder readIn 0.01 + predErr 0)
- book10k 0.316 (base 0.279), book30k 0.303 (base 0.230). Both above or at the bigram level now.

## Queued
- 30k recordings (base, readIn + predErr 0)
- screen D1: metaN 0, metaCap 200
- screen D2: peMode 18 (renormalise after LTD), mixHomeo 0.05 (steadier letter-pair codes), metaN 0 + predErr 0
- All with readIn 0.01 on book10k/30k, fables4000 and order3.

## Screen C/C2 complete-ish (21:25 CT); all arms use readIn 0.01
| arm | book10k | book30k | book100k | fables4000 | order3 |
|---|---|---|---|---|---|
| readIn only (A, plus C for 100k) | 0.301 | 0.248 | 0.160 | 0.332 | 0.952 |
| + predErr 0 | 0.316 | 0.303 | **0.298** | 0.331 | 0.951 |
| + predErr 0.1 | 0.311 | 0.284 | (running) | 0.331 | 0.953 |
| + metaN 0 (D1, predErr stays 0.3) | (running) | **0.344** | | (running) | (running) |
- With predErr 0 the long-life decline is almost gone: 100k 0.298 vs 0.160.
- metaN 0 gives the best 30k score, which confirms the mechanism (the metaplastic learning rate shrinks towards 0).

## 30k recordings, seed 11 (base vs readIn + predErr 0)
- held-out 0.262 -> 0.330; no-answer (ties) 32% -> 0.4%; read spikes 4.1 -> 8.0; agreement with the bigram choice 0.26 -> 0.51.
- The input, context and mixing states are identical in the two runs: only the taught cells (cortex tag 1/5) receive plastic synapses. The oracle ceiling therefore stays at 0.395 (current-symbol cells).
- Remaining gap: the brain now predicts space 62% of the time (truth 20%).

## Screens D1/D2 (21:45 CT); all arms use readIn 0.01; baseline readIn-only = 0.301 / 0.248 / 0.332 / 0.952
| arm | book10k | book30k | fables4000 | order3 |
|---|---|---|---|---|
| metaN 0 (no consolidation) | 0.340 | **0.344** | **0.349** | 0.873 (harm) |
| metaCap 200 | 0.320 | 0.318 | 0.335 | 0.952 |
| peMode 18 (renormalise after LTD) | 0.301 | 0.248 | 0.332 | 0.952 (no effect) |
| mixHomeo 0.05 (steadier pair codes) | (running) | 0.257 | (running) | (running) |
- Removing consolidation helps text but breaks order3, which needs it.
- Capping consolidation gives most of the text gain with no order3 harm. It is about as good as predErr 0.
- Held-out eval16, base arm: book10k 0.271 and book30k 0.228 (16 growths). The rest is running; the candidate arm starts after D2.
- Queued D3: metaN 400; metaCap 200 + predErr 0; rcvHomeo 0.2 (output-side homeostasis).

## Held-out eval, 16 growths (22:25 CT): candidate = graded decoder (readIn 0.01) + pl.predErr 0, vs v35. Paired by growth.
| task | v35 | candidate | diff (se) | wins/losses |
|---|---|---|---|---|
| book30k | 0.229 | 0.299 | +0.070 (0.002) | 16/0 |
| book10k | 0.271 | 0.308 | +0.038 (0.002) | 16/0 |
| fables4000 | 0.300 | 0.327 | +0.027 (0.002) | 16/0 |
| fables2000 | 0.288 | 0.315 | +0.026 (0.001) | 16/0 |
| order3 | 0.904 | 0.953 | +0.048 (0.010) | 15/1 |
| text1000 | 0.745 | 0.754 | +0.009 (0.002) | 15/1 |
| order2@1000 (no clocks; both near 0, uninformative) | 0.034 | 0.032 | -0.002 (0.002) | 1/1 |
| order2@1000 clock2+3 | 0.996 | 0.996 | 0.000 | 0/1 |
=> Passes no-task-worse: no task is worse beyond noise. This is a default candidate, pending Travis's approval.

## Learning-rule combos vs the candidate (8 growths, paired)
- metaCap 200 + predErr 0: book30k +0.017 (8/0), book10k +0.009, fables4000 +0.003, order3 identical. Clean; 16-growth eval running (eval16c).
- metaCap 100 + predErr 0: book +0.026 / +0.015, but order3 -0.007 (1/6). Rejected.
- metaCap 200 + predErr 0 + mixHomeo 0.05: book +0.017 / +0.007, fables4000 -0.001 (3/4), order3 +0.014 (7/0). 16-growth eval queued (eval16d).
- metaN 0 + predErr 0: book 0.339 / 0.341, fables 0.345, order3 0.864 (harm).
- metaN 400: order3 0.920 (harm).
- rcvHomeo 0.2: running.
