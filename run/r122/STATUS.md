# hr2 STATUS (R120) — started 10:11 CST
- base commit 77de3a97 (cursor/hidden-rep). granExact = P.granUtility=2,P.granExact=1,P.granCo=1 (R119 'old')
- reuse: /workspace/tf/base.jsonl + /workspace/hr/b30.jsonl (v47 book30k k2944-2953), /workspace/hr/ex30.jsonl (granExact book30k), /workspace/hr/reg.jsonl (short tasks k2951-2953)

## Step 1 — saturation guard (P.granExactGuard bitmask; 1 = dedup at init, 2 = column guard)
- dedup: 32000 random claw tuples -> 25068 distinct (k2950); 6932 duplicate detectors start free (recruitable).
- column guard (self-calibrating): lag column ignored for tuple matching/recruiting when its window rate > min(0.9, 3 x max column rate of source 0 = the current letter), after 3000 events. No hand-set rate.
- book10k tune (k2950 healthy / k2946 diagnosis): heldAcc granExact -> G1 / G2 / G3
  - 2950: 0.407 -> 0.406 / 0.407 (guard never triggers: identical) / 0.406
  - 2946: 0.363 -> 0.381 / 0.389 / 0.388 ; guard triggers on 2946 (source 1 col 20 rate 1.00; thr 0.466)
  - generation: 2946 distinct4 0.114 -> 0.034 (G2/G3, mostly spaces) ; 2950 0.148 -> 0.118 (G1/G3)
### PRE-REGISTERED (before any test-seed run): P.granUtility=2,P.granExact=1,P.granCo=1,P.granExactGuard=3
- test: book30k seeds 2944-2949,2951-2953 (2946 also used for diagnosis -> not clean); paired vs v47 (tf/base + hr/b30) and granExact (hr/ex30)
- short tasks: hr/reg.js task set, k2951-2953, arms off/old (reuse hr/reg.jsonl) + guard
- 10:28 launched gd30 (book30k, guard=3, 9 seeds, P5)
- 10:28 launched short-task reg (arm gd, k2951-2953, P3) -> hr2/reg.jsonl

## Step 2 — dense non-granule cells (book10k k2950 granExact dump: hr2/dump/ex50, cells.js, dense.js, densen.js)
- 296 non-granule cells active >50% of slots = 240 'go'-tagged relay cells (60 per region x 4, rate 1.00, every symbol: the go clock relay, constant by design)
  + 56 cortex 'symbol'-tagged cells (slot rate 0.69, per-symbol 0.43..1.0 = broadly tuned; same grown threshold as the 302 sparse ones, rate 0.088).
- Offline prequential readout (held acc): unnormalised AdaGrad (as hr/aug.js) / step normalised by #active features (NREF 4):
  gran 0.357/0.357 ; all 0.296/0.341 ; all minus dense 0.329/0.365 ; exact1-4g 0.444 ; exact+nonGran 0.299/0.350 ; exact+nonGran minus dense 0.315/0.363
  -> the "0.31" hurt was mostly step-size dilution in the unnormalised probe; dense cells cost ~0.01-0.02, non-dense non-granule cells cost more. Brain itself (NLMS readout) 0.407 > every probe.
- P.denseCeil (new, off by default): per-cell ceiling homeostasis relative to the region mean (frozen after 4000 substeps), go/tonic relays + inhibitory cells exempt, bounded raise.
  book3k k2950 (ref granExact 0.360): running-mean version 0.052/0.034 (runaway); frozen 0.292 (h .01, .1); +inh exempt K4 0.284, K12 0.342. Dense cortex cells INCREASED (62 -> 68-74). Loses everywhere tried (as R67 did).
- WHY (why.js, grown weights, k2950): dense and sparse cortex symbol cells have the SAME threshold (-58.8) and the SAME total input (74.8/cell, synaptic scaling),
  no inhibitory cells among them, same symbol-input weight (29.8). The dense 56 take 19.2/cell from cortex 'tag 5' cells (slow, persistent) vs 8.0 for the sparse ones
  (and 25.8 vs 37.0 from 'free' cells) -> recurrent excitation from slow persistent cells drives them regardless of the current symbol. Not homeostasis targets, not tonic.
- 10:36 reg gd done (21); launched reg gd2 (guard-only, to show no trigger) and dc10 (denseCeil .02 K12, book10k k2950)
- 10:44 dc10 (denseCeil .02 K12, book10k k2950): heldAcc 0.368 vs granExact 0.407 (-0.039), dense>50 308 (vs 296). denseCeil abandoned (default off).

## Step 1 results — book30k, pre-registered guard=3 (hr2/gd30.jsonl; ana30.js)
- heldAcc v47 / granExact / guard3 per seed: 2944 .3905/.4385/.4350 2945 .3950/.4385/.4365 2946 .4005/.3995/.4080 2947 .4115/.4530/.4525 2948 .4095/.4600/.4645
  2949 .4175/.4570/.4540 2951 .4085/.4590/.4585 2952 .4555/.4655/.4925 2953 .4210/.4630/.4680
- guard3 - granExact: +0.0039 (sd .0096, t 1.24, 4+/5-)  NOT a clear win; guard3 - v47 +0.040 (9/9)
- guard triggered in life (guardSkip>1000) on 2946 (+.0085), 2948 (+.0045), 2949 (-.003), 2952 (+.027); never on 2944/2945/2947/2951 (dedup only: -.0035/-.002/-.0005/-.0005)
- probe(all) guard3-gx -0.017 (2/7); probe(granules) +0.0017 (6/3); distinct4 +0.032 (6+/1-); triBits ~0; wordValid -0.12 (2945 collapses to 0.012)
- short tasks (k2951-2953, fit = 10 x acc): order3/K4/sc_order2/sc_cycle identical to granExact; text1000 +0.0007 acc (1+/0-); fables4000 +0.0038 (2+/1-); book10k +0.015 (3/3)
- guard-only (G=2) short tasks: identical to granExact everywhere except fables k2952 (+0.013 acc; guard triggered) -> no trigger on K4/order3/seqchoice/text
- POST-HOC (not pre-registered): launched gc30 = guard-only G=2 on the same 9 seeds to separate dedup from guard

## Step 3 (11:00 brief) — causal test of tag5 -> symbol drive
- 11:01 launched BB_ABL 21>17 scale 0 / 0.5 (cortex only), book10k k2950 granExact, dumps hr2/dump/abl*
- growth origin (why2.js, k2950 cortex symbol cells): dense cells get tag5 input from 355 tag5 cells spanning all 24 letter labels (sparse: 144 cells, 9.9 labels);
  per-synapse weight is the same (~0.055). All tag5 cells are slow. Dense cells sit at the back edge (y -0.95 vs -0.89, x -0.23 vs +0.04). corr(rate, #tag5 inputs) 0.53, corr(rate, #labels) 0.53.
  Hidden input is normalised to the same total (normE: 45), so the tag5 share is set by how many broad tag5 fibres reach the cell: label-mixed persistent context -> on for any recent letters.
- CAUSAL TEST (BB_ABL, book10k k2950): cutting ALL 63320 tag5->cortex symbol synapses (x0) or halving them leaves the 45 dense cells dense (rate .615 -> .622, MI with current symbol .135 -> .131 bits)
  and heldAcc .407 -> .404 / .406. => grown tag5 fan-in is NOT the cause (the claim is falsified).
- Life weights (why.js LIFE=2000, ws): dense cells' plastic input from cortex 'free' cells grows 25.8 -> 93.2 /cell and tag5 19.2 -> 30.1; sparse cells: free 37.0 -> 36.5, tag5 8.0 -> 2.9.
  => the dense cells are made by LIFETIME plasticity: rich-get-richer potentiation of recurrent inputs onto already-busy symbol cells.
- WHICH RULE (rule.js): all 90936 free->symbol synapses are in the main plastic list (lr 0.2), the RECV set and the preNorm list. preNorm (v20) fixes each
  PRESYNAPTIC cell's outgoing budget, so targets compete for it and the busiest receivers win more of every fibre: rich-get-richer with no receiver-side bound.
  v47 has no receiver-side budget (postCap/postCapRel off; scaleInvariant's 1.5 cap only binds scaled receivers). Not a growth-rule (develop.js) problem.
- 11:07 launched pc10: postCapRel 1 / 1.5 / 2 on granExact, book10k k2950 (tune seed)
- pc10 (postCapRel 1/1.5/2): bit-identical to granExact -> postCap acts on the reward rule only, not on the teacher-gated rule that grows these inputs. No effect.
- ROOT CAUSE (why2.js letters): the 56 dense cortex symbol cells are the cells of the 8 most frequent letters (space 11, i 8, o 9, h/t/a/e 6, n 4).
  Cortex symbol cells are TAUGHT (RECV): the teacher-gated rule potentiates a cell's active context inputs whenever its letter is the target, and in the cortex
  there is no mismatch depression (v47: predErr only in the striatum, R64). A potentiation-only rule converges to "fire whenever the letter was EVER likely"
  -> cells of frequent letters fire for almost any context (the known space bias, 62% predicted vs 20% true).
  Existing remedy: pl.predErr (R41 prediction-mismatch LTD = balanced, error-driven delta rule). 11:2x launched pe10: cortex predErr 0.1/0.3/1 on granExact, book10k k2950

## gc30 (POST-HOC guard-only G=2, book30k 9 seeds) — dedup vs guard separation
- heldAcc G2: 2944 .4385 2945 .4385 2946 .4065 2947 .4530 2948 .4640 2949 .4545 2951 .4590 2952 .4940 2953 .4680
- never triggered on 2944/2945/2947/2951 -> bit-identical to granExact there (no false triggers); triggered on 2946 +.007, 2948 +.004, 2949 -.0025, 2952 +.0285, 2953 +.005
- G2 - granExact +0.0047 (t 1.48, 4+/1-, 4 ties); G3 - G2 (= dedup effect) mean -0.0008 (mixed); distinct4 G2-gx +0.002, G3-gx +0.032 (noisy); probe(all) G2-gx -0.009
- verdict: column guard is a safe no-op on healthy growths and helps 4 of 5 saturated ones; dedup adds nothing to accuracy.

## pe10 — cortex predErr on granExact, book10k k2950 (ref granExact .407, dense>50 296, cortex symbol dense 56, gen nonSpace .62)
- predErr 0.1: .408, cortex dense 67, probe(all) .271, d4 .121
- predErr 0.3: .412, cortex dense 68, probe .308, d4 .030 (loops "he wors")
- predErr 1  : .408, cortex dense 17 (56 -> 17: mismatch LTD removes most of them = causal confirmation of the teacher-rule mechanism), probe .300, d4 .101, gen nonSpace .08 (collapses to spaces)
- -> removing the dense cells does NOT raise heldAcc (+.001): the brain's readout already discounts them. Density is a symptom, not the accuracy bottleneck.
### PRE-REGISTERED 11:16 (before test seeds): arms on granExact (P.granUtility=2,P.granExact=1,P.granCo=1)
- primary  pe1 : pl.predErr@cortex=1   (root-cause fix: balanced teacher rule; removes dense cells)
- secondary pe03: pl.predErr@cortex=0.3 (best tune-seed heldAcc, chosen among 3 on one seed: selection-biased)
- book30k 2944-2949,2951-2953 paired vs granExact (hr/ex30) and v47; then short-task set k2951-2953
- 11:2x test_core ALL OK (incl. R120 test) + spikefoundry 10/10; interim commit 60fbb2c8 on cursor/hidden-rep
- 11:28 pe 30k interim (4 seeds): pe1 -0.0146 vs granExact (0/4), pe03 -0.0023 (1/3). launched short-task reg arms pe03,pe1 (P2)

## R121 (11:51 brief) — what limits granExact now
- 11:52 launched traced granExact book30k k2944/2947/2951 (BB_GUTRACE + dumps) -> hr2/lim/
- lim1.js on hr/dump/ex30.* (granExact book30k, 9 seeds, 1999 held slots each; L = context symbols incl. current, L3 = 4-gram):
  acc brain .448 | online backoff L1 .296 L2 .403 L3 .471 L4 .500 L5 .505 L6 .506. Brain's hit pattern is most like L3 (phi .704; L4 .639, L5 .607) but 0.023 below it.
  position (brain / L3 / L5): wordStart .152/.165/.153, let2 .372/.403/.402, let3 .460/.476/.507, let4 .469/.530/.599, let5+ .342/.390/.544, tgtSpace .885/.877/.877
  -> let4 + let5+ (27% of slots) carry ~0.046 of the 0.057 gap to L5.
  by sightings of the L3 context before (brain / L3 model): 1: .383/.575, 2: .483/.544, 3-4: .491/.555, 5-9: .462/.515, 10-19: .453/.494, 20-49: .448/.444, 50+: .457/.462
  by sightings of the L4 context (brain / L4): 0: .330/.358, 1: .402/.540, 2: .428/.529, 3-4: .455/.536, 5-9 .471/.529, 10-19 .504/.535, 20-49 .523/.538, 50+ .456/.468
  -> the brain needs ~10-20 sightings to reach what a count model gets from 1; rare contexts (L4 seen <=4) = 43% of held slots.
  target rank (brain / L5): top1 .885/.877, 2-5 .429/.487, 6-10 .353/.418, 11+ .237/.334
- pe FINAL book30k 9 seeds vs granExact: pe1 -0.0115 (1+/8-, t -3.96), probe -0.014; pe03 -0.0001 (4+/5-), probe -0.007. Both fail; cortex predErr rejected.
- pe short tasks (k2951-2953, acc = fit/10, vs granExact): pe03 text1000 +.018 (3/3), fables +.010 (3/3), book10k +.011 (3/3), order3 -.0075 (0/3), K4 -.004 (0/1), sc same
  pe1: text1000 +.044 (3/3), fables -.002, book10k +.0035, order3 -.0075 (0/3), K4 -.012 (0/2). -> violates no-task-worse (order3, K4) and no gain at book30k: rejected.
- lim2.js (traced granExact book30k k2944/2947/2951; column->letter purity .96-.98):
  held-slot coverage by a live exact detector: L3 tuple .975/.915/.987, L4 tuple .793/.758/.833; 6.3-6.6 detectors active per held slot, 98-99% of slots >=1.
  sightings before a detector exists: L3 contexts 0 (grown) ~70%, 1 ~25%, >=2 ~1-2%; L4: 1 sighting ~80%, 2 ~11%. Recruits keep coming (~900 per 6000 slots late in life),
  capacity recycled from never-matching detectors (no free cells needed). Recurring (>=2) L4 contexts never detected: 8-16%.
  -> coverage and recruitment speed are NOT binding: a detector exists after 1 sighting for ~80% of held L4 contexts.
- 12:00 BINDING CONSTRAINT hypothesis: readout sample efficiency (rare contexts), not coverage. New P.granKal (experience-weighted NLMS). launched kal10: A=1,3,10, A=1 min .1 on granExact book10k k2950
- readout test (lim2 bySeen4, held slots whose L4 context was seen once before AND an exact L4 detector was live): brain .335/.537/.402 (k2944/2947/2951, n 134-176)
  vs the count model's .540 after one sighting; seen twice with detector .414/.381/.477. -> the detector is there; the readout does not use it. BINDING = readout sample efficiency:
  NLMS splits each error over all ~6.5 active detectors by x^2, so a new specific detector gets ~1/6.5 of the correction while the experienced shorter-context ones absorb the rest.
- 12:12 granKal bug (granGain psi never updated -> granule pathway silent, all 0.309) fixed; a=1 now bit-identical to NLMS (unit check). relaunched kal10
- kal10 (book10k k2950, ref granExact .407): granKal A=1 .415, A=1 min .1 .414, A=3 .415, A=10 .413 (all +.006..+.008; insensitive to A). d4 .114/.141/.077/.101 (ref .148)
### PRE-REGISTERED 12:16: P.granKal=1 (a_j = max(.02, 1/(1+n_j))) on granExact; book30k 2944-2949,2951-2953 vs granExact (hr/ex30) + v47; short tasks k2951-2953 vs off/old
- kal short tasks (k2951-2953, acc vs granExact): order3/K4/sc_order2/sc_cycle identical; text1000 +.0008 (1+/0-); fables4000 +.0065 (2+/1-); book10k +.0098 (3/3). No task worse on average.
- kal book30k interim (6 seeds): +.0016 vs granExact (4+/2-)
- kal book30k FINAL (9 seeds): +0.0024 vs granExact (7+/2-, t 1.57); probe(gran) +.0014 (7/1); distinct4 +.013 (3/3). vs v47 +.0385 (9/9).
  lim1 on kal dumps: helps L4 contexts seen 3-9 times (+.010-.014) but NOT seen once (.402 -> .394; count model .540).
- WHY seen-once fails: a detector is recruited AFTER its first sighting, with target weight wo + granLr x (1-y) = ~0.1 on a scale where trained weights reach
  wMax x granExactW = 750 and drive is d / granRef (600). Its first-sighting information is written at ~1e-4 of a useful size.
  New P.granOneShot=1: recruit target weight = granLr x granRef x (1-y) (= the readout's own NLMS step for a lone input). launched os10 (k2950): oneShot, oneShot+granKal
- os10: granOneShot=1 .391 (both; loops 'he irish bosun smee') - too large. trying granOneShot=2 (step / (1 + active granules))
- 12:42 graded granOneShot (0<v<1 = fraction of lone-input step) added; os10b: 0.25, 0.5 (no kal). box shared: <=4 of my runs
- tune k2950 book10k (ref granExact .407, +kal .415): oneShot1 .391 (+kal .391); oneShot2 .405 (+kal .399); 0.5 .395; 0.25 .403. Larger first-sighting weight = worse. trying 0.1/0.05 + kal (with dumps)
- 12:53 tune: os0.1+kal .421, os0.05+kal .427 (> granExact+kal .415, granExact .407); os2 alone .405. launched os0.02+kal, os0.03+kal, os0.05 no-kal
- 13:03 tune done: +kal os0.02 .426, os0.03 .428, os0.05 .427, os0.1 .421; os0.05 no-kal .422. seen-once L4 (k2950 10k, count model L4 .525): kal .399, os0.05 .459, os0.1 .486. PRE-REGISTERED: granKal=1,granOneShot=0.03 (centre of 0.02-0.05 plateau). Pass = book30k mean > granExact on 9 seeds + no short task worse. launched os30 (P4, dumps). test_core ALL OK w/ oneShot test.
- 13:21 os30 wave1 (4/9): vs granExact +0.009 (4/4); spikefoundry 10/10 PASS
- 13:32 os30 8/9 done; launched short tasks reg.js os arm (P3, k2951-2953)
- 13:45 os30 FINAL (pre-registered granExact+granKal=1+granOneShot=0.03, 9 seeds): heldAcc vs granExact +0.0111 (sd .0059, t 5.6, 9+/0-); vs granKal alone +0.0086 (8+/1-, t 5.6); vs v47 +0.0471 (9/9).
  probe(all cells) -0.011 vs gx (2/7; offline probe, not the brain); probe(gran) +0.0007.
  seen-once L4 (9-seed mean, count model .540): gx .402, kal .394, os .437; seen 2: .428/.436/.461; 3-4: .455/.469/.479; 5-9 .471/.481/.483. Gap to count model on seen-once cut 0.138 -> 0.103.
  looping: distinct4 os-gx +0.014 (4+/3-, n.s.), wordValid ~0; samples still loop on all 9 seeds ('the garden the garden', 'the the the'). Not fixed.
  short tasks (k2951-2953, os vs granExact, acc): order3/K4/sc_order2/sc_cycle identical; text1000 0.000 (1+/1-); fables4000 +0.016 (3/3); book10k +0.0185 (3/3). No task worse -> PASS.
- 13:38 committed fc2bcacc (on 60fbb2c8); push 403; bundle /workspace/hr2/hidden-rep.bundle (77de3a97..cursor/hidden-rep)

## R122 (13:4x) — granOneShot check on k2954 + looping diagnosis
- launched q2954.sh (P4): book10k & 30k on k2954: gx, kal, kal+oneShot 0.02/0.03/0.05/0.1 -> t54/
- looping diagnosis step 1 (ngen.js, offline, os30 dumps, 9 seeds): the EXACT count n-gram model trained on the same life, decoded the way the brain decodes (greedy argmax, no learning), loops on 9/9 seeds at EVERY order:
  distinct4 L1 .002-.012, L2 .008-.024, L3 .020-.064, L4 .020-.135, L5 .032-.241, L6 .050-.378 (periods 4..54; L1 = 'the the the'); brain distinct4 .008-.147 (in the L3-L6 range).
  Same model SAMPLED (p ~ counts): distinct4 .79-.89, no loop. -> root cause = deterministic argmax decoding of a finite-context predictor (a closed deterministic finite-state loop must cycle). Better held acc cannot fix it.
- queued qgen.sh (starts after q2954): brain with existing env flag genTemp (sample p ~ counts^(1/T)) T=1, 0.5 on k2950/2954 10k, + gx T1 -> gen/
- 2954 10k (heldAcc): gx .395, kal .398, +os 0.02 .416, 0.03 .408, 0.05 .416, 0.1 .409. 30k: gx .448, kal .456, os0.03 .4625, os0.1 .469 (0.02/0.05 30k running)
- 2954 30k: os0.02 .457, os0.05 .470 (gx .448, kal .456, 0.03 .4625, 0.1 .469). -> 0.03 holds (+.0145 vs gx at 30k, +.013 at 10k); 0.02-0.1 is one plateau on 2954 (best 0.05-0.1 at 30k), so the 2950 "sharp drop at 0.1" was noise. No constant change needed.
- genTemp (brain sampling, existing env flag, k2950 10k os): T0 d4 .044 wv .67 ('an eaten  te' loop); T0.5 d4 .726 wv .76; T1 d4 .835 wv .56; gx T1 .885/.49. heldAcc unchanged (.428). Sampling alone removes the loop.
- 13:5x steering (Travis): test chunk units exist? loop = identical low-level state? minimal fatigue flag cuts looping w/o hurting held acc?
- added BB_GENDUMP (probe only) -> launched gd_os50 (k2950 10k os T0, gen act dump)
- chunk units (chunk.js, os30 dumps 2944/2948/2951): per cell, held log-loss of predicting its firing from the last L symbols (L 0-9); span = smallest L within 2% of best.
  context-driven cells ~3200-3500/seed; granule spans 3-5 (90%), 6+: 26-46; non-granule 6+: ~450-690 but broadly tuned (top word <= 1-2% of fires). Word-specific (>=50% of fires inside one word, span>=6): 0 / 0 / 4. -> NO chunk/word units exist yet.
- gen state (BB_GENDUMP, gstate.js, k2950 10k os greedy, passive: heldAcc .428 & d4 .0443 identical to non-dump run): full hidden active set repeats EXACTLY with period 14 (' an eaten  te ') from slot 13; 308/486 slots identical to lag 14, rare perturbations fall back into the same cycle. -> limit cycle; nothing in the state distinguishes pass 1 from pass 2.
- count-model fatigue sim (nfat.js, L4, 5 seeds): fixed tau 4-32: held unchanged, loops unchanged (tau < period does nothing; tau >= period shifts the period, large tau collapses to '    '). self-calibrated tau = c x own mean recurrence: c .05-.5 held -0.002..-0.02, d4 still .02-.14, loops persist.
- implemented P.granFatigue=c (net.js, off default): exact detector refractory for c x its own mean inter-fire interval (symbol clock, runs in gen). launched qfat.sh (P4): c .05/.2/.5 on k2950, 0/.05/.2/.5 on k2954 -> fat/
- 14:1x granFatigue v1 bug: symbol clock counted input-burst toggles (~12/symbol) -> blocked within-symbol re-fires, heldAcc .30 (fat/ discarded). v2: episode = fires within one symbol (substeps/teaching event), refractory only between episodes; small fables check c .05: score .3087 vs .3067 (127 skips). relaunched qfat2 -> fat2/
- granFatigue v2 (k2950 | k2954 10k, os greedy; baseline held .428 | .408, d4 .044 | .056): c .05 .415 | .404, d4 .258 | .093; c .2 .407 | .408, d4 .089 | .068; c .5 .386 | .382, d4 .060 | .040. Samples still degenerate ('he  s  t     he  s  t'). -> costs held acc (up to -.04), d4 gain small and inconsistent. REJECTED (flag stays, default off).
- 2954 greedy gen state: 'she ' exact state period 5, then fixed point '    ' (granule set identical, Jaccard .91, only 39 slow non-granule cells drift).
- test_core + spikefoundry running detached (test_core4.out, sf3.out), incl. new granFatigue-off bit-identical check
