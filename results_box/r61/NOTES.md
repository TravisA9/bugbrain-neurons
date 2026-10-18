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
