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
