# Where BugBrain stands (Nov 23, 2026) — plain-language calibration

Everything here comes from runs on the box; scripts and raw JSON are in this folder. Nothing is estimated unless marked.

## 1. The test, in plain terms
The brain reads ~98,000 letters of children's books (Aesop, Grimm, Oz, Alice, ...; 24-letter alphabet: a–z without j q x z, plus space and full stop),
then reads 2,000 letters it has never seen (book endings held out) and must guess each next letter before seeing it.
"Accuracy .53" = it guesses the next letter right 53 times out of 100. Chance is 1 in 24 (4%); always guessing the commonest letter (space) gets ~20%.

## 2. What .53 looks like (real held-out text, seed k2951, R140 winner)
Capital letter (or · for a space) = the brain guessed that letter right; _ = wrong.

```
text : ay. a fool may deceive by his dress and appearance but his words will soon show what he really is. the fisherman and the little fish a poor fisherman who lived on the fish he caught had bad luck one d
SNN  : _Y_·__F_OL·___·D_____E·__·__S·________D·__P______E·_UT·__S·_____·W__L·_OON·_H__·_H_T·_E·__A___·___·_HE·_I_H___AN__ND·_HE·__TTLE·___H_A___OR·___HE_MAN·W_O·__VE_·_N_THE·_I_H__E_____HT·__D·___·__CK·___·_
5gram: _Y_·__F___·___·______E·__·__S·____S·AND·__P______E·_UT·__S·______W__L·S_ON·______HAT·_E·_E___Y·___·_HE·_I_H____N__ND·THE·__TTLE·___H·____OR·___H____N_W_O·__VE_·__·THE·_I_H·_E__A__H_·_A_·B__·__CK·___·_
```
Word by word (2,000 held letters, 3 seeds, R140 winner):
- First letter of a word: right only ~17% of the time (it can't know which word comes next).
- Remaining letters of a word: right ~65% of the time — once a word has started it often knows how it ends.
- The space after a word (knowing the word is finished): right ~89%.
- Whole word right after its first letter (every remaining letter + the space): ~29% of words.
So it is a decent *spelling completer* of familiar words, and has almost no idea *which* word comes next.
Notice "fisherman": first time `_I_H___AN`, later in the passage `FI_H__MAN` — it picked the word up while reading (the 5-gram did not improve).

## 3. Calibration: same 98k training letters, same 2,000 test letters
| model | trained on | k2951 | k2953 | k2954 | mean acc | bits/char |
|---|---|---|---|---|---|---|
| KN unigram (letter frequency) | same 98k | 0.201 | 0.192 | 0.198 | 0.197 | 4.11 |
| KN bigram (1 letter context) | same 98k | 0.293 | 0.323 | 0.287 | 0.301 | 3.31 |
| KN trigram (2 letters) | same 98k | 0.415 | 0.431 | 0.390 | 0.412 | 2.75 |
| KN 4-gram | same 98k | 0.488 | 0.490 | 0.460 | 0.479 | 2.44 |
| KN 5-gram (4 letters) | same 98k | 0.526 | 0.523 | 0.508 | 0.519 | 2.35 |
| KN 6-gram | same 98k | 0.534 | 0.520 | 0.521 | 0.525 | 2.34 |
| KN 7-gram | same 98k | 0.539 | 0.514 | 0.517 | 0.524 | 2.37 |
| LSTM 256 units (numpy, 11 min CPU, early-stopped) | same 98k | 0.466 | – | – | – | 2.53 |
| LSTM 128 units (numpy, 7 min CPU) | same 98k | 0.492 | – | – | – | 2.49 |
| **BugBrain SNN, R135 candidate (4x, 64k pool)** | same 98k, one pass | .523 | .519 | .5265 | .523 | see §4 |
| **BugBrain SNN, R140 winner (+ long look-back)** | same 98k, one pass | .5305 | .529 | .524 | .528 | see §4 |
| *Reference: models given the whole 3.29M-letter corpus (33x more text)* | | | | | | |
| KN 5-gram | all 3.29M | 0.576 | 0.578 | 0.568 | 0.574 | 1.87 |
| KN 7-gram | all 3.29M | 0.619 | 0.616 | 0.605 | 0.613 | 1.74 |
| LSTM 256 units (numpy, 12 min CPU, ~6 passes' worth of samples) | all 3.29M | 0.613 | – | – | – | 1.67 |

Notes: KN = interpolated Kneser–Ney smoothing (the standard strong n-gram). n-gram/LSTM bits are exact log-loss; the SNN's spike counts are not a
probability, so its bits are the env's calibrated estimate (see §4). 2,000 letters gives about ±.011 standard error per seed, so differences under ~.01 are noise.
SNN figures for R135/R140 are the existing book100k runs (sw/out/bd_b100*_4x_*.json, STATUS.md R139–R141); n-gram/LSTM rows were scored here on the exact letters of those lives (standing/data_k*.json).
Against the 5-gram on k2951/2953/2954 the SNN gets 134/130/152 letters right that the 5-gram misses, and misses 125/118/120 that the 5-gram gets.

**Bottom line: on the same small amount of text, BugBrain predicts letters about as well as a well-smoothed 5–6-letter-context n-gram, and better than the small LSTMs we could train here on that little text (they overfit).** It does not yet beat a 7-gram, and anything trained on 33x more text is far ahead (.61 vs .53).
