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
| **BugBrain SNN, R135 candidate (4x, 64k pool)** | same 98k, one pass | .523 | .519 | .5265 | .523 | not recorded in those runs |
| **BugBrain SNN, R140 winner (+ long look-back)** | same 98k, one pass | .5305 | .529 | .524 | .528 | not recorded in those runs |
| *Reference: models given the whole 3.29M-letter corpus (33x more text)* | | | | | | |
| KN 5-gram | all 3.29M | 0.576 | 0.578 | 0.568 | 0.574 | 1.87 |
| KN 7-gram | all 3.29M | 0.619 | 0.616 | 0.605 | 0.613 | 1.74 |
| LSTM 256 units (numpy, 12 min CPU, ~6 passes' worth of samples) | all 3.29M | 0.613 | – | – | – | 1.67 |

Notes: KN = interpolated Kneser–Ney smoothing (the standard strong n-gram). n-gram/LSTM bits are exact log-loss; the SNN's spike counts are not a
probability, so its bits are the env's calibrated estimate (only recorded for the 1x run in §4). 2,000 letters gives about ±.011 standard error per seed, so differences under ~.01 are noise.
SNN figures for R135/R140 are the existing book100k runs (sw/out/bd_b100*_4x_*.json, STATUS.md R139–R141); n-gram/LSTM rows were scored here on the exact letters of those lives (standing/data_k*.json).
Against the 5-gram on k2951/2953/2954 the SNN gets 134/130/152 letters right that the 5-gram misses, and misses 125/118/120 that the 5-gram gets.

**Bottom line: on the same small amount of text, BugBrain predicts letters about as well as a well-smoothed 5–6-letter-context n-gram, and better than the small LSTMs we could train here on that little text (they overfit).** It is not clearly better than the best n-gram on this text (differences are within noise), and anything trained on 33x more text is far ahead (.61 vs .53).

## 4. What it writes — real samples
**Which brain:** the 4x book100k generation run was lost twice (box reboot at ~11:37 and an interruption), so these samples come from the
same R140-winner settings at **1x size after 30,000 letters** (seed k2951; 35,644 neurons, 1,764,963 synapses). On its own 2,000 held letters it scored
**0.525** accuracy (calibrated 2.85 bits/char); KN n-grams trained on the same 28k letters score
3-gram 0.413, 5-gram 0.496, 6-gram 0.497 (bits 2.48). So letter-guessing is at/above a 5-gram, but its probabilities are worse calibrated (2.85 vs 2.48 bits).
Learning was frozen while generating (as in run/gen.js). Sampling = p ∝ spike counts^(1/T), the R122 method. File: standing/gen_r140S2_1x_b30k_2951.json.

### 4a. Reading (guessing each next letter of a prompt) — capital = guessed right

**Unseen book text (Grimm, held out)** — 50% of letters guessed
```
he got up and looked kwite kindly at them but said nothing and went into the forest. and when they looked round they found that they had been sleeping kwite close to a precipice and would certainly ha
hE ___ ___AN_ __O_E_ __IT_ __N__Y __ _HE_ __T __ID _OT__N_ _ND ___T _N__ THE __R____ AND __EN _HE_ __O_E_ _OUND _HE_ FO__D _H_T _HE_ _AD _E_N ______N_ __IT_ __OSE __ _ __E______ AN_ ___LD ______N__ _A
```

**Different source (a fable from the separate fables corpus, 0/22 overlap with the book text)** — 45% of letters guessed
```
the cat and the crow. a crow sat on a branch of a tree with a piece of cheese in her beak. a cat saw her and wanted the cheese. he came to the foot of the tree and said good day mistress crow. how well you look today. how bright your eyes are. i am sure your voice is as sweet as your feathers are fine. 
tHE _A__A__ _HE ___W_ _ __OW____ _N__ __A___ __ _ ___E___TH A___E_E OF __E______ _____E___ _________ _E___N_ _A___D T_E ___E___ _E _A_E __ THE ____ __ THE ___E A__ __ID ___D __Y ___T_E_S ___W_ __W W__L _OU ___________ __W ___G_T _OU_ ____ A_E_ _ _M SURE _OU_ __ICE _S A_ __EE_ __ _OU_ _____ER_ A_E ___E_ 
```

**Modern prose (written for this test)** — 45% of letters guessed
```
the city council voted on tuesday to build a new bridge across the river. the mayor said that the work would begin in the spring and that 
tHE __TY __U_________D _N_T______ __ _____ _ _E_ _____E __ROSS _HE ___E__ _HE ________ID TH_T _HE W_R_ W_ULD _E______ _HE ______ _ND _H_T 
```

**Question/answer** — 44% of letters guessed
```
kwestion. who went to the land of os. answer. 
k______N_ ___ _E_T __ THE _AN_ __ ___ _N__ER_ 
```

### 4b. Writing on its own (free-running, T=0.5 unless marked) — verbatim

**Prompt: "once upon a time there was a "**
```
SNN T0.5: genera half a a gall. and hearened t anag the  ed and hed with anage by ty  d s woug ans of t   g s the had sea lived     s  sh here the ked his a a anage is   a sir said ha sir. ba eed s chis anage he seve is   a g s t   a s and chanagusth
SNN T1  : revoid thed he haaanaglane sstyorth w a gen    ang him kinahhevea d hermevil nnshenatatherr ath at ously. the had laaa e wthis aa   ty inkely meeena nkwe ch mankwire said go t a wss   ches anags  ahen i aantan angrth your sth   w t  genay.a
```

**Prompt: "kwestion. who went to the land of os. answer. " (book spelling: q→kw, z→s)**
```
SNN T0.5: i   a   shis w a   s and caparisonkey out one  ge ed all. ena  a  ge for the kna a net a door a four  ng   s   s w sir the aanty as i am genne w a great said gerr l a ses ann us   ona a  aaenaageveral  e  a     s sel w   s w sir anage d   a
```

**Prompt: "kwestion. what does a cat like to eat. answer. a cat likes to eat "**
```
SNN T0.5: for thearts very s was glad     sth and his eas a hal and a grea on s said polly ona d a named eded ty as i th and ea littl eked ty as came day onaa  a se streett anage thatherman name   a saw a grena       sthed ang he wthorn anage d was a
```

**Prompt: "...and the old woman said "**
```
SNN T0.5: gred ingry aance to the kinah won the was gus to th   a g a p gused o the kinel camed a g and ces anaged tobimar  na his a d a foolin ened thinarrd     ss  a great the knew a grel said a geners he he was  w a gred a vere     s anage by the 
```

**Continue unseen Grimm text**
```
SNN T0.5: d a  s s a horse w glads from for to catchest on   s   a s   a se s ws feelt t said th   a ses cab thenked   ss  anaget torts  g   a small sainahs fasting         s senans ty as i am with   a   shermanage  aa gga     ane ws are not a s sthe
real text: ve fallen into it in the darkness if they had gone only a few paces further. and their mother told them that it must have been the angel who watches over good children. snow white and rose red kept their mothers little cottage so neat that 
```

**Continue modern prose**
```
SNN T0.5: a dea s was a gre d said ankey out on s   anks a kwito t ach   cketed t      a gener ty in a sir s gorena nenaand slight ity ina      s ckem the had we w anage  ons the kingl each      sh  myyy     and hiles each morn and everena   name a f
```

**Same prompts, baselines (T=0.5, verbatim, standing/ngram_results.json and lstm_*.json):**
```
story_open  3-gram (98k):   dow i so but and tild the all cable wen wing to the wit and and i some a put down ther le was the shat gir he shand the for a re shad and he i hat he a do the whe she saing the mad and and not the the
story_open  5-gram (98k):   come him and a little that i should scarly to the first cart of the man and many once of the strike a happing so have to the bough and i had be and than the matted in them and the said get on the chil
story_open  LSTM-128 (98k): lont to the horses and when his nothing my conts i was always his best so paych of so well and i should say what i know how the first with dill to the firing as we ond it opened the cobfursed and i am
story_open  7-gram (3.29M): flowers and the even the man that i was wild woods and the land of the barrel but the snow and the last she said the strange and the man said the marionette in the morning himself there were have a go
story_open  LSTM-256 (3.29M): great remarkable garden. the wolf went back to the sense of the third day good to the sea to a large door and lands and spread out one of the first time the little girl was only the grandfather and he
qa_oz       7-gram (3.29M): free. the silent for the lady and never wished so longer and she said the window and the mock turtle went on the golden cap and dorothy was a large pieces of sunshine and the world. the sun shining fo
```
Honest reading: as a *guesser* the SNN is n-gram-class, but as a *writer* it is clearly worse than a 3-gram: words break down ("anage", "a  s s")
and it drifts into fragments. Two reasons visible in the data: (1) its spike counts are poorly calibrated probabilities (2.85 vs 2.48 bits/char for the
5-gram on the same letters), and sampling from them picks too many junk letters; (2) every wrong letter it writes becomes its next input, and it never saw
its own mistakes while learning. None of the models answers a question — the n-grams and LSTM just keep writing book-like text ("dorothy" appears only by association).

### 4c. Long memory: does it recall an invented name seen earlier in the same passage?
Prompts like "a little girl named sorinda lived in a house by the wood. sorinda had a red cap." (3 invented names × 4 gaps; letters 2..end of the name).
| gap between mentions | 1st mention (no memory possible) | 2nd mention, learning frozen | 2nd mention, learning on (names read during life) | KN 5-gram 2nd mention |
|---|---|---|---|---|
| 5 letters | 1/20 | 1/20 | 0/20 | 3/40 |
| 31 | 1/20 | 2/20 | 0/20 | 4/40 |
| 61 | 1/20 | 2/20 | 0/20 | 4/40 |
| 127 | 1/20 | 2/20 | 0/20 | 4/40 |

**Result: no recall.** Even 5 letters later it does not complete the name. The R140 look-back works on the synthetic copy probe (.51–.57 vs .21 chance)
but does not yet carry over to recalling a new word in prose. Telling detail: after the learning-on pass, names like "tobimar" and "garvine(l)" show up
in later free-running samples — so they were stored, but not retrieved at the moment they were needed. This is the clearest gap for "memory for intelligent interaction".

## 5. Published reference points (character-level; different datasets, so only rough)
Our task: 24-symbol children's books, ~98k training letters. Benchmarks below: text8 = 100M characters of cleaned Wikipedia (27 symbols, 90M train); enwik8 = 100M raw Wikipedia bytes. Lower bits/char = better; 1 bit/char ≈ guessing among 2 equally likely letters.

| model | data | bits/char | source |
|---|---|---|---|
| Smoothed character n-gram | text8 (90M chars) | 1.64 | Mikolov et al. 2012, Table 2 — https://www.fit.vut.cz/person/imikolov/public/rnnlm/char.pdf |
| LSTM | text8 | 1.43 | Cooijmans et al., cited in Al-Rfou et al. 2018 Table 1 — https://arxiv.org/abs/1808.04444 |
| mLSTM, 45M parameters | text8 | 1.27 | Krause et al. 2018 Table 5 — http://proceedings.mlr.press/v80/krause18a/krause18a.pdf |
| 64-layer Transformer, 235M params (next-char accuracy 75.9%) | text8 | 1.13 | Al-Rfou et al. 2018 Tables 1–2 — https://arxiv.org/abs/1808.04444 |
| Transformer-XL 24 layers, 277M params | text8 | 1.08 | https://paperswithcode.co/benchmark/text8 |
| GPT-2 117M ("small") / 1.5B, zero-shot | text8 | 1.17 / 0.98 | Radford et al. 2019 Table 3 — https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf |
| Human (Shannon's guessing experiments) | printed English | ~0.6–1.3 | Shannon 1951 — https://www.princeton.edu/~wbialek/rome/refs/shannon_51.pdf |

In our own runs the n-gram ladder on this corpus is: 98k letters → best KN n-gram ≈ 2.34 bits/char, 52.5% accuracy; 3.29M letters → 7-gram 1.67–1.74 bits/char, ~62%.
The text8 transformer paper reports accuracy too: 1.13 bits/char ≈ 76% next-character accuracy. A rough mapping on English-like text:
~20% = letter frequencies only, ~41% = trigram, ~52% = 5-gram on a small book set (BugBrain today), ~62% = 7-gram on a few MB, ~71–76% = deep transformer on 90M chars, GPT-2-class higher still.

## 6. Scale
| | BugBrain (R140 winner, 4x) | GPT-2 small | Llama 3 |
|---|---|---|---|
| units / parameters | 79,609 neurons (64k of them pooled detector "granules"); synapses not measured at 4x (1x sibling: 35,644 neurons / 1.76M synapses) | 124M parameters | 8B and 70B parameters |
| training text | 98,000 letters (~100 KB, one children's-book-length read, read once, online) | 40 GB WebText (~8M documents) | >15 trillion tokens |
| ratio of training text to ours | 1 | ~400,000x | very roughly 600,000,000x (at ~4 characters/token) |
| context it can use | detectors for 3–4-letter tuples and word chunks, plus look-back up to 32 letters (R140) | 1,024 tokens | 8,192 tokens |
Sources: GPT-2 paper above; GPT-2 sizes https://aiwiki.ai/wiki/gpt-2 ; Llama 3 https://ai.meta.com/blog/meta-llama-3/ and https://github.com/meta-llama/llama3/blob/main/MODEL_CARD.md .

## 7. Honest assessment
- **Where we are:** on ~100k letters of children's books, BugBrain guesses the next letter about as well as a well-smoothed 5–6-letter-context n-gram
  trained on the same text (.53 vs .52–.53; 1x/30k: .525 vs .50), and better than the small LSTMs we could train here on that little data (.47–.49).
  That is a real result for a grown spiking network learning online in one pass with local rules — but it is n-gram-class, i.e. roughly 1990s statistical language modelling.
- **Genuinely novel:** the network is grown, not designed, and learns in a single online pass with no backprop; word-chunk and tuple detectors are recruited
  as it reads (it picks up a repeated word like "fisherman" within a passage); the R140 surprise-gated look-back gives exact long-range copying on a synthetic probe without hurting book accuracy.
- **Gap to an LLM, in order of size:** (1) **data** — 98k letters vs ~40 GB (GPT-2) and >15T tokens (Llama 3); (2) **no meaning/abstraction** — it learns which letters follow which, not words-as-concepts, so it cannot answer questions or carry a topic;
  (3) **memory** — usable context is a handful of letters (plus a 32-letter copy rule that doesn't yet fire in prose) vs 1k–8k tokens of attention; (4) **generation** — poor probability calibration and no robustness to its own errors make its writing worse than its guessing;
  (5) **scale** — ~80k neurons vs 124M–70B parameters, and this brain gains nothing from 8x size at 100k letters (R139), so more text, not more neurons, is the next lever.
- **Practical next tests suggested by this exercise:** recall-a-name in prose as a standing probe (currently 0%), probability calibration of the readout (bits), and generation quality vs n-gram at equal accuracy.
