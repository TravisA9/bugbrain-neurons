# PRIORITIES (R104, Oct 30 2026, ~7:30 PM CT; **v45 / DEFAULTS_VERSION 38** unchanged — v45 = plan deepURSx3 with a 16000-cell granule layer, mixed 3/4-letter claws, cortex lr 0.2; v44 kept as deepURSx3v44)

## R104 update (queue review, evening)
- **No adoption.** Nothing finished a 16-growth held-out this round: y222 (32000 cells) still running on linux-pc, y219b (step schedule) still running on chromium.
- **Demand-grown claws (I105) rejected as built** (y217 + y218, 24 fresh growths): book10k -0.046, book30k -0.031, fables4000 -0.022, all 0/24. The pool never fills (granAsg ~3000 of 8000), so recycling never runs.
- **Step schedule:** y219a sched100k +0.0029 vs fixed 0.1 at 300k (6/2, n 8), +0.0005 vs 0.05; waits for y219b. **Smooth schedule rejected** (y215 book10k -0.0029 1/6, book30k -0.0027 1/6).
- Runtime is linear in granule cells (16000 / 32000 / 64000 = 1 / 2 / 4x); 64000 fits in ~0.5 GB.
- Cortex lr 0.15: stays rejected (R102r full-set confirmation y214 K4 -0.0016, 1/10).

## Ranked open questions (R104)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I101 | Capacity vs length: 32000 cells held-out at 100k/300k (v46 candidate) + full-set confirmation; does 64000 add again at 300k | y222 (running), y223, y227 |
| 2 | Q42 / I102 | Length rule: step schedule held-out at 300k; 1M with 16000 vs 32000 cells (capacity or rule?) | y219b (running), y221, y224 |
| 3 | I104 / Q46 | Sized order3: cx4dT context x4 vs x2 vs x1 on the full set | y226 |
| 4 | I98 | cx3 sized recipe (y211 passed except book10k -0.003 4/12) | (later) |
| — | I105 | Demand-grown claws: rejected as built; only a redesigned birth rule | — |
Engineering: sparse granule update path is now the main lever (runtime is linear in cells; 64000 cells = 4x v45). Generation loops wait for the length rule.
Low: analogy / evolution. Rejected ideas stay rejected (plus R104: smooth granule schedule, demand claws as built).

## Worker notes (R104)
linux-pc: healthy on 609911c, y222 (renewed 7:06 PM CT). chromium: on 609911c, y219b since 9:09 AM CT, renewal gap 10:39 AM - 6:50 PM CT (PC off / asleep), heavy-eligible. tacobell: worker Disabled on purpose (Travis); laptop = push route only.

# PRIORITIES (R103, Oct 30 2026, ~7 AM CT; **v45 / DEFAULTS_VERSION 38 adopted** — v45 = plan deepURSx3 with a 16000-cell granule layer, mixed 3/4-letter claws, cortex lr 0.2; v44 kept as deepURSx3v44)

## R103 update (queue review, morning)
- **v45 adopted:** y210 book300k +0.0084 (8/0), book100k +0.0029 (4/4); 48-growth short-task bar met (fables4000 -0.0007, 19/27, borderline). ~1.7x runtime.
- **Constant granLr 0.05 rejected** (y204a/b: book10k -0.0158 0/16). Only a step schedule remains (y219a/b).
- **32000 cells best at 300k** (y207: +0.0075 vs 16000, 8/0; +0.0039 vs 16000 sched100k) and neutral on short tasks (y208). Held-out y222 queued.
- **cx4dT order3 gap = the 4x context chain** (y213: removing it +0.184, 8/0). cx3 recipe wins seqchoice by +0.22-0.26 (y211).
- Push blocked: TacoBell + CHROMIUM disconnected; bundles in /workspace/R103 (push_r103.bat). tacobell worker silent since 10:09 PM CT Oct 29.

## Ranked open questions (R103)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I101 | Capacity vs length: 32000 cells held-out at 100k/300k (next v46 candidate) | y222 |
| 2 | Q42 / I102 | Length rule: granule step schedule held-out at 300k; does 1M still climb | y219a, y219b, y221, y215 |
| 3 | I104 / Q46 | Sized order3: cx4dT with a 1x/2x context chain on the full set | (next round) |
| 4 | I98 | cx3 sized recipe held-out (y211 passed except book10k -0.003) | (next round) |
| — | I105 | Demand-grown granule claws (off by default) | y217, y218 |
Engineering: sparse granule update path is now urgent (v45 is 1.7x slower; 32000 cells ~2x more).
Low: analogy / evolution. Rejected ideas stay rejected.

# PRIORITIES (R102r, Oct 29 2026, ~8 PM CT; **v44 / DEFAULTS_VERSION 37** unchanged — v44 = plan deepURSx3 with an 8000-cell granule layer, mixed 3/4-letter claws, cortex lr 0.2; v45 candidate (16000 cells) **passed its fables4000 tie-break (y209)** and waits only for the y210 length leg (running on linux-pc))

## R102r update (queue review, evening; the "R102" commit 91501d6 = granDemand I105 by another agent is separate)
- **No adoption.** v45: y209 (32 fresh) fables4000 -0.0002 (16/16), book10k +0.0020 (23/8); pooled 48 growths fables4000 -0.0007 (19/27, t -1.2) — inside the bar. Adopt next round if y210 shows N16000 not worse than v44 at 100k / 300k. y216: 8000 / 16000 / 32000 cells identical on order3 / K4 / seqchoice.
- **cortex lr 0.15 rejected** (y214, box, 16 fresh, 8 tasks): K4 -0.0016 (1/10, t -3.5), text1000 -0.0015 (4/10), fables4000 -0.0013 (5/11). Cortex lr stays 0.2.
- **Granule step schedule (Q42 / I102):** y206 sched100k = best 1x at book300k 0.4122 (+0.0036 vs fixed 0.1, +0.0011 vs fixed 0.05; n 8); sched30k wins at 100k (+0.0035 vs 0.05, 7/1). Held-out y219a/b, book1M y221 queued.
- Workers: all three alive on 91501d6. tacobell is memory-starved (~300 MB free; crashes / paging-file errors) -> y214 finished on the box, y214 blocked, tacobell forceVersion bump to drop its claim. chromium's first job y207 is ~2x over its estimate.

## Ranked open questions (R102r)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q42 / I102 | Length rule: granule step schedule held-out on 16 fresh growths at 300k; does 1M still climb | y210 (running), y219a, y219b, y221, y212, y204a/b, y215 |
| 2 | I99 | v45 (16000 cells) adoption — only the y210 length leg left | y210 |
| 3 | I101 | Capacity vs length: 32000 cells at 100k-300k (short tasks answered: no effect) | y207 (running), y208 |
| 4 | I98 | cx3 sized recipe held-out | y211, y212 |
| 5 | I104 / Q46 | Sized order3 gap: which cx4dT extra costs order3 | y213 (box, R102r) |
| — | I105 | Demand-grown granule claws vs random at granN 8000 (off by default; do not adopt from the queue) | y217, y218 |
Answered R102r: cortex lr 0.15 rejected (K4); granule count does not move order3 / K4 / seqchoice; v45 fables4000 tie-break passed.
Engineering: the sparse granule update path remains the top item (16000-32000 cells at 300k-1M are slow; tacobell cannot run them).
Low: analogy / evolution. Rejected ideas stay rejected.

## Worker notes (R102r)
linux-pc: healthy, last renewal 7:40 PM CT (y210). tacobell: alive, last renewal 7:20 PM CT, memory-starved (close apps or cap to 1 run; watchdog "restarting" every 15 min is a false alarm — supervisor and dq.js are up). chromium: alive, last renewal 7:14 PM CT on y207 (claimed 12:49 PM CT), cursor machine shows disconnected but the worker runs; heavy-eligible.

## Previous header (R101)
# (R101 header) PRIORITIES (R101, Oct 29 2026, ~7:30 AM CT; **v44 / DEFAULTS_VERSION 37** unchanged — v44 = plan deepURSx3 with an 8000-cell granule layer, mixed 3/4-letter claws; v45 candidate (16000 cells) still undecided: its tie-break y209 / y210 has not run because R100 was never pushed)

## R101 update (queue review, morning)
- **Blocker: R100 + R101 are unpushed** (TacoBell and CHROMIUM offline; box token is read-only). origin code is still R99 (27133b4), so no job that requires run/r100_jobs.js (y206-y216) is visible to workers; only y204a/b can run. y205 crashed again on old code (out of memory, 64/64).
- **No adoption.** cortex lr 0.15 (y195a+b, 16 held-out): book10k +0.0014, book30k +0.0008, fables12000 +0.0011 (12/4), text1000 -0.0003 (9/7): nothing worse -> full-task confirmation y214. cortex lr 0.1 rejected at 1x (text1000 -0.0036, 5/11).
- **Capacity vs length:** 4000 cells fall behind past 10k (book30k -0.0079, 2/14); 16000 = 8000 within noise below 30k (+0.001); 16000 wins at 100k at 1x (y192 16/0) and at cx3 on fresh growths (y203 +0.0063, 14/1).
- Workers: all three silent this morning (linux-pc since 11:06 PM CT, tacobell since 5:13 PM CT, chromium since 5:41 AM CT Oct 28).

## Ranked open questions (R101)
| rank | id | question | jobs |
|---|---|---|---|
| 0 | — | Push R100 + R101 (bundles on the box /workspace/R101) | — |
| 1 | Q42 | Rule at length: granule step schedule on 16000 cells; fresh-growth length block; cx3 at length | y206, y210, y212, y204a/b, y215 |
| 2 | I99 | v45 tie-break: fables4000 on 32 more fresh growths (+ y210 length leg) | y209, y210 |
| 3 | I101 | Capacity vs length: 32000 cells at 10k-300k and on order3 / seqchoice | y207, y208, y216 |
| 4 | I77 | cortex lr 0.15 full-task confirmation | y214 |
| 5 | I98 x Q46 | cx3 sized recipe held-out; sized order3 gap ablation | y211, y213 |
| — | I105 | Demand-grown granule claws vs random claws at granN 8000 (off by default; do not adopt from the queue) | y217, y218 |
Answered R101: 4000 cells too few past 10k (16 growths); 16000 cells pay at length at cx3 too (fresh); cortex lr 0.1 rejected at 1x.
Growth-phase memory / speed: lib.js dense-matrix fix (R100) is still unpushed; the sparse granule update path remains the top engineering item. Generation loops wait for a length-rule result.
Low: analogy / evolution. Rejected ideas stay rejected.

## Worker notes (R101)
linux-pc: silent since 11:06 PM CT Oct 28 (claimed y204a; lease expired 3:06 AM CT) — overnight outage, check systemd. tacobell: offline since ~5:13 PM CT Oct 28. chromium: offline since 5:41 AM CT Oct 28 on old code 48387fe, 0 jobs finished; heavy-eligible.

## Previous header (R100)
# (R100 header) PRIORITIES (R100, Oct 28 2026, ~7:40 PM CT; **v44 / DEFAULTS_VERSION 37** unchanged — v44 = plan deepURSx3 with an 8000-cell granule layer, mixed 3/4-letter claws; v45 candidate (v44 + P.granN=16000) **not adopted**: fables4000 -0.0015 (3/11) on its 16 fresh confirmation growths; tie-break y209)

## R100 update (queue review, evening)
- **No adoption.** y198a+b (k 2632-2647): book10k +0.0028 (10/5), book30k +0.0016 (10/5), order3 / K4 / text1000 not worse, seqchoice identical, **fables4000 -0.0015 (3/11, t -1.9)**. Pooled 48 growths fables4000 -0.0005 (21/25, t -1.0). Pre-registered tie-break: y209 (32 fresh growths) + y210 (fresh length).
- **Length:** 16000 cells + granLr 0.05 (y201) = best 1x at book300k, 0.4111 (+0.0107 over v44, 8/0) but -0.0014 at 100k vs 16000 alone: smaller granule step costs early, pays late. **New code P.granLrT / granLrLate / granLrShape** (global granule step schedule by symbols seen; bit-identical off) -> y206. granLr 0.05 at 1x vs v44 300k +0.0044 (13/3, n 16).
- **y200 crash fixed** (run/lib.js synapse count built the dense N x N matrix: Out of memory at 32000 cells; now counts the sparse list, bit-identical, peak memory at 16000 cells 550 -> 238 MB). Requeued y207 / y208; y205 blocked.
- **Granule count vs length (y194a):** 4000 cells fall behind past 10k (book20k -0.0067, 2/6); 16000 = 8000 below 30k on those growths.
- **cx3:** granRef 1800 passes held-out (y196 order3 +0.018, 11/2; nothing worse) -> cx3 settings. Full recipe (y202, 16000 + ref1800 + cone rb2 str3): book +0.0045 (12-13/3), seqchoice 3.9 / 4.1 vs 1.6 / 2.1, K4 / text / fables dips n.s. Striatum dose plateaus above x2 (x5 best, n.s.); cone required (y199). cx3 also falls 100k -> 300k (-0.0031).
- **cx4dT order3 ~0.726** whatever the granules (1x 0.9675 on the same growths) -> y213 ablation.
- Workers: linux-pc healthy (27133b4); tacobell offline since ~5:13 PM CT (lease on y194b to 9:13 PM CT); chromium silent since 5:41 AM CT on old code 48387fe (stays heavy-eligible).

## Ranked open questions (R100)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q42 | Rule at length: granule step schedule tied to symbols seen (0.1 -> 0.05 at 30k / 100k / smooth) on 16000 cells; fresh-growth length block; does it carry to cx3 | y206, y210, y212, y204a/b, y195a/b |
| 2 | I99 | v45 tie-break: fables4000 on 32 more fresh growths (+ y210 length leg) | y209, y210 |
| 3 | Q42 x I99 | Capacity vs length: 32000 cells at 10k-300k (on the fixed code); size curve 5k-30k | y207, y208, y194b |
| 4 | I98 x Q46 | cx3 sized recipe held-out (16000 + ref1800 + cone rb2 str5 vs ref1800); cx3 at book100k fresh | y211, y203 |
| 5 | Q46 | Sized order3 gap: which cx4dT extra costs order3 | y213 |
Answered R100: v45 not adopted on its confirmation (fables4000 3/11; tie-break pending); granRef 1800 passes held-out at cx3; cone required for the striatum seqchoice gain; 4000 cells too few past 10k.
Growth-phase memory / speed: the lib.js dense-matrix fix is the first win (peak memory -57% at 16000 cells); the sparse granule update path is still the top engineering item. Generation loops wait for a length-rule result.
Low: analogy / evolution. Rejected ideas stay rejected (granAnneal per-cell count stays rejected; the R100 schedule is a different, global mechanism).

## Worker notes (R100)
linux-pc: alive on 27133b4, running y203 (claimed 7:14 PM CT); 9 jobs finished today. tacobell: worker file stale since 11:43 AM CT but lease renewals until 5:13 PM CT; laptop offline now; finished y194a, y198a. chromium: silent since 5:41 AM CT (old code 48387fe), never finished a job; heavy-eligible, check its Task Scheduler / git pull when the PC is next on.

## Previous header (R99)
# (R99 header) PRIORITIES (R99, Oct 28 2026, ~7:30 AM CT; **v44 / DEFAULTS_VERSION 37** unchanged — v44 = plan deepURSx3 with an 8000-cell granule layer, mixed 3/4-letter claws (gene d.gran K 4 / Kmin 3); **v45 candidate = v44 + P.granN=16000** (pending full-task confirmation y198a/b))

## R99 update (queue review, morning)
- **v45 candidate: 16000 granule cells (mixed 3/4 claws).** 32 fresh growths (y189a+b k 2552-2567, y192a+b k 2568-2583) vs v44: no task worse; book30k +0.002 / +0.005, book100k +0.0078 (16/0, t 6.6), fables12000 +0.002 (13/3). Full-task confirmation y198a/b (8 tasks incl. K4 / seqchoice, fresh k 2632-2647). Not adopted yet.
- **Rejected:** all-4 claws at 16000 (book30k -0.009, 2/14); granW 40 at 16000 (book30k -0.0022, 5/11; third time the same length trade).
- **Length:** capacity carries the plateau to 100k (y178 slopes 30k->100k: v43 -0.010, 8000 -0.0025, 16000 +0.001); past 100k only granLr 0.05 still rises (+0.0043, 5/2, n 8; y185b interim). Next: y201 (16000 + granLr 0.05 at 100k/300k), y204a/b (granLr 0.05 at short length), y200 / y205 (32000 cells).
- **cx3:** N16000 ref1800 book100k 0.4285 (+0.028 vs v42 cx3, 8/0); striatum x3 + cone + rb2 lifts cx3 seqchoice to 3.8 / 4.2 (16/0; 1x ~6.3). Next: y199 striatum dose, y202 all-round cx3 recipe, y203 fresh book100k.
- chromium joined (new worker), claimed y196 at 5:41 AM CT then went offline.

## Ranked open questions (R99)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | v45 confirmation: 16000 Kmix vs v44 on all 8 tasks, fresh growths | y198a/b |
| 2 | Q42 x I99 | Capacity vs length: 32000 cells at 10k-300k; where does each size flatten (5k-30k) | y200, y205, y194a/b, y190 |
| 3 | Q42 | Rule at length: granule step 0.05 on 16000 cells (100k / 300k and short), cortex step dose (case for annealing tied to symbols seen) | y201, y204a/b, y195a/b, y197, y185b (box) |
| 4 | Q46 x I98 | seqchoice at size: striatum dose (x2-x5), is the cone needed | y199, y202 |
| 5 | I99 x I95 | cx3 all-round recipe with 16000 granules; granRef 1800 order3 fix held-out; cx3 book100k fresh | y202, y196, y203 |
| 6 | I99 | 4x: cx4dT 16000 Kmix | y191 (running) |
Answered R99: all-4 claws at 16000 (rejected); granW 40 as a constant (rejected again; a length schedule is a new idea); "claws should grow with cells" (wrong at 16000).
Growth-phase memory / speed: the sparse granule update path is the top engineering item (16000 cells ~1.7x v44 runtime; 32000 more). Generation loops wait for a length-rule result.
Low: analogy / evolution. Rejected ideas stay rejected.

## Worker notes (R99)
linux-pc: alive on 48387fe, running y191 (7:04 AM CT); 7 jobs finished overnight, no evening outage. tacobell: alive on 48387fe, running y194a (3:24 AM CT); network blip ~5:54-7:20 AM CT (GitHub DNS failure), job kept running, on AC. chromium: new; short claim/release loop 8:02-8:23 PM CT Oct 27 (probably double Start), off overnight, claimed y196 at 5:41 AM CT and went offline (lease to ~9:41 AM CT); no results yet; no worker-config entry. crashSkip empty everywhere. Box: y185b book300k arms (42 of 56). Depth after push: ~130 slot-h ≈ 12-13 h for linux-pc alone (~7-8 h if chromium is on all day); light pool ~26 slot-h ≈ 16 h for tacobell.

## Previous header (R98)
# (R98 header) PRIORITIES (R98, Oct 27 2026, ~7:30 PM CT; **v44 / DEFAULTS_VERSION 37** unchanged — v44 = plan deepURSx3 with an 8000-cell granule layer, mixed 3/4-letter claws (gene d.gran K 4 / Kmin 3); v43 = deepURSx3v43 = P.granN=4000,P.granK=3; v42 = deepURSx3v42 (2000 cells, granRef 600))

## R98 update (queue review, evening)
- **y180a (box, 48 fresh growths k 2464-2511, text1000): granGain guard rejected.** granGain 0.001 vs v44 -0.0004 (16/26), 0.01 -0.0003 (17/24); neither recovers text. v44 vs v43 text +0.0007 (24/19, t 2.0): the y175 text dip was a v43 cost that v44 already undoes. y180b dropped (partial).
- **y185b interim (book100k, n 8):** cortex lr 0.1 +0.0019 (6/2), granLr 0.05 +0.0009 (4/4), granW 40 -0.0013 (3/5) vs v44; book300k arms still running on the box.
- R93-R97 reached origin (6:36 PM CT); both workers back on aa99b62 and running (y178 linux-pc, y189a tacobell).
- New jobs (run/r98_jobs.js): y194a/b capacity x length curve 5k-30k (light), y195a/b cortex step x length (light), y196 cx3 granRef 1800 held-out incl. order3 / seqchoice (heavy), y197 cortex lr 0.15 at 100k / 300k on the y185b growths (heavy).

## Ranked open questions (R98)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q42 | Rule at length: does a smaller cortex step help past 100k, and does the best step fall with length (case for an annealed cortex step)? | y185b (box, running), y185a, y181, y197, y195a/b |
| 2 | Q42 x I99 | Capacity vs length: where does each granule layer size flatten (5k-30k; 100k / 300k)? | y194a/b, y193, y178, y184, y190 |
| 3 | I99 | Claw mix x cell count at 1x (16000 mixed vs all-4 claws; 16000 +/- granW 40) | y192a/b, y189a/b |
| 4 | I99 x I95 | cx3 with v44-style granules; granRef 1800 order3 fix on fresh growths | y183, y196 |
| 5 | Q46 x I98 | seqchoice at size: cx3 + sizeCone + recvBudget 2 (+/- striatum x3) | y187, y196 |
| 6 | I99 | 4x: cx4dT 16000 Kmix, granRef 600 / 1800 | y191 |
Answered R98: text1000 guard (y180a: granGain 0.001 / 0.01 do not help; v44 already near v41 on text) -> rejected.
Growth-phase memory / speed: the sparse granule update path stays the top engineering item (16000-cell arms ~3x v43 runtime in y189 / y192 / y193 / y194). Generation loops wait for a length-rule result (y185 / y195 / y197).
Low: analogy / evolution. Rejected ideas stay rejected (as R97; plus granGain 0.001 / 0.01 as a text guard).

## Worker notes (R98)
linux-pc: alive on aa99b62, running y178 (claimed 6:38 PM CT, lease renewed 7:08 PM CT); 13 h heartbeat gap while idle (10:01 PM CT Oct 26 -> 11:09 AM CT Oct 27). tacobell: back after ~3 days silent, running y189a on aa99b62 (claimed 6:37 PM CT, renewed 7:08 PM CT). No crash-loop skips. Box: y180a done, y180b dropped, y185b book300k arms running (chain98.sh, par 5). Depth after push: light 20.4 slot-h ≈ 12.7 h for tacobell; heavy 115.4 slot-h ≈ 11.5 h for linux-pc (+ light leftovers).

## Previous header (R97)
# (R97 header) PRIORITIES (R97, Oct 26 2026, ~7:45 PM CT; **v44 / DEFAULTS_VERSION 37** unchanged — v44 = plan deepURSx3 with an 8000-cell granule layer, mixed 3/4-letter claws (gene d.gran K 4 / Kmin 3); v43 = deepURSx3v43 = P.granN=4000,P.granK=3; v42 = deepURSx3v42 (2000 cells, granRef 600))

## R97 update (queue review, evening)
- **y182a+b (box, fresh k 2520-2535, n 16): claws vs cells at 1x.** Mixed 3/4 claws at 4000 cells = all of v44's fables gain (+0.0055, 16/0) but none of its book30k gain (vs v44 -0.0078, 1/15, t -4.8). The cells carry book30k (+0.0064 13/2 for v44 vs v43). The cheaper brain does **not** replace v44; nothing is a candidate.
- v44 vs v43 replicates on a third fresh block (book30k +0.006, fables +0.006, nothing worse).
- Hypothesis: claw length should grow with cell count (4-letter combinations are rarer and need more cells). Test y192a/b (16000 cells: mixed vs all-4 claws).
- Box now runs y185b (rule at length) then y180a/b; y193 (queued) puts 16000-cell arms on the y185b growths.

## Ranked open questions (R97)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q42 | Rule at length: does a smaller cortex step (0.1) or granule step (granLr 0.05) stop the 1x decline past 100k? | y185b (box, running), y185a + y181 |
| 2 | Q42 x I99 | Capacity vs rule at length on the same growths: 16000 Kmix at 100k / 300k (1x); 8000 / 16000 at 100k; cx3 300k | y193, y178, y184, y190 |
| 3 | I99 | Claw mix x cell count at 1x: 16000 mixed vs all-4 claws (incl. book100k, fables12000); 16000 Kmix +/- granW 40 | y192a/b, y189a/b |
| 4 | I99 x I95 | cx3 with v44-style granules (8000 / 16000 Kmix, ref 1800), 5 tasks | y183 |
| 5 | Q46 x I98 | seqchoice at size: cx3 + sizeCone + recvBudget 2 (+/- striatum x3) | y187 |
| 6 | I99 | 4x: cx4dT 16000 Kmix, granRef 600 / 1800 (order3 at size) | y191 |
| 7 | I99 | text1000 guard: granGain 0.001 / 0.01 on v44 | y180a/b (box, after y185b) |
Answered R97: I99 claws vs cells at 1x (y182: both needed; 4000 + Kmix not adopted).
Growth-phase memory / speed: 16000 granules ~3x v43 runtime; the sparse granule update path stays the top engineering item (y192 / y193 are the first jobs that need it). Generation loops wait for a length-rule result.
Low: analogy / evolution. Rejected ideas stay rejected (as R96; plus 4000 cells + mixed claws as a cheaper v44 at 1x).

## Worker notes (R97)
linux-pc: alive, idle on a83beaa (heartbeat 6:59 PM CT Oct 26); queue drained since 5:08 PM CT Oct 25 because R93-R96 never reached origin. tacobell: silent since 9:50 AM CT Oct 24 (~58 h; stale "running y174b"). Box: y182a+b done; chain y185b (par 3) -> y180a -> y180b running in /workspace/R97/box (cwd /workspace/R97/boxcode = 73f8531). Queue after push: linux-pc ≈ 109 slot-h meaningful (~11 h) + ~54 slot-h filler.

## Previous header (R96)
# (R96 header) PRIORITIES (R96, Oct 26 2026, ~7:30 AM CT; **v44 / DEFAULTS_VERSION 37** unchanged — v44 = plan deepURSx3 with an 8000-cell granule layer, mixed 3/4-letter claws (gene d.gran K 4 / Kmin 3); v43 = deepURSx3v43 = P.granN=4000,P.granK=3; v42 = deepURSx3v42 (2000 cells, granRef 600))

## R96 update (queue review, morning; R95 evening run failed unpushed, folded in here)
- **v44 confirmed** on fresh k 2448-2463 (y179, box): book30k +0.009 (14/2), fables +0.005 (14/2), nothing worse.
- **granW 40 not adopted**: fables +0.013 (16/0), text +0.001 (9/1), but book30k -0.0033 (5/11, t -1.6). Length trade; retested at book100k (y185a) and at 16000 cells (y189).
- **1x gets worse past 100k** (y162b: 300k 0.394 < 100k 0.398, same growths): the rule at length is now the top question (y185).
- At size, capacity pays more with length (cx3 granN 6000 + granRef 1800 book100k +0.014, 8/0); granRef 1800 fixes much of order3 at cx3 (+0.027) at a small fables cost.
- Seqchoice at size is still broken (cx4dT 4.5 vs 6.4; striatum x8 worse; cx3 1.6). Cause = divRep cortex sizing; y187 tries cone + receive budget on cx3.
- Rejected this round: output gate 0.2 (generation), granRef 400, granRef 900 (flat), granAnneal at 300k, striatum x8.

## Ranked open questions (R96)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q42 | Rule at length: does a smaller cortex step (0.1) or granule step (granLr 0.05) stop the 1x decline past 100k? | y185a/b, y181 |
| 2 | Q42 x I99 | Capacity x length: 8000 / 16000 Kmix at book100k / 300k, 1x and cx3 | y178, y184, y190 |
| 3 | I99 | Claws vs cells at 1x (box) and the next step: 16000 Kmix +/- granW 40 | y182 (box), y189a/b |
| 4 | I99 x I95 | cx3 with v44-style granules (8000 / 16000 Kmix, ref 1800), 5 tasks | y183 |
| 5 | Q46 x I98 | seqchoice at size: cx3 + sizeCone + recvBudget 2 (+/- striatum x3) | y187 |
| 6 | I99 | 4x: cx4dT 16000 Kmix, granRef 600 / 1800 (order3 at size) | y191 |
| 7 | I99 | text1000 guard: granGain 0.001 / 0.01 on v44 | y180a/b |
Growth-phase memory / speed: 16000 granules ~3x v43 runtime; the sparse granule update path stays the top engineering item. Generation loops: gate rejected; next generation test waits for a length-rule result.
Low: analogy / evolution. Rejected ideas stay rejected (as R94, plus output gate 0.2, granRef 400 / 900, striatum x8, granW 40 as a constant).

## Worker notes (R96)
linux-pc: alive, idle since 5:08 PM CT Oct 25 (queue drained; R93-R95 jobs never reached origin); heartbeats every ~30 min, last 7:18 AM CT Oct 26; no crash loop. tacobell: silent since 9:50 AM CT Oct 24 (~46 h); its workers file still says "running y174b" (stale; y174b finished on linux-pc); worker-config cpuMax 60 (order says 75; not changed here because the push path is down). Moto G not seen. Queue after push: linux-pc ≈ 99 slot-h meaningful (~10 h); light ≈ 10 slot-h (~6 h on tacobell) + older filler.

## Previous header (R94)
# (R94 header) PRIORITIES (R94, Oct 25 2026, ~7:45 AM CT; **v44 / DEFAULTS_VERSION 37** — v44 = plan deepURSx3 with an 8000-cell granule layer, mixed 3/4-letter claws (gene d.gran K 4 / Kmin 3); v43 = deepURSx3v43 = P.granN=4000,P.granK=3; v42 = deepURSx3v42 (2000 cells, granRef 600))

## R94 update (queue review, morning)
- **v44 adopted** (granN 8000 + Kmix34) on 16 fresh held-out growths y174a+b (k 2352-2367, 8 tasks): book30k +0.009 (14/2), fables +0.007 (14/2), book10k 0 (8/8), text1000 -0.0003 (6/8, n.s.), order3 / K4 / seqchoice not worse. Cost ~1.45x runtime.
- granK is no longer a global default: unset = plan gene. All pending jobs pinned (P.granK=3; y140 no-granN arms back to their v41 meaning P.granN=2000). New jobs pin V43 / V44 explicitly, so old worker code (a83beaa) runs them identically.
- Cumulative text1000 drift is now significant but small: v43 vs v41 -0.0011 (11/33, t -2.4, n 48). Guard job y180.
- granAnneal flat at book100k / fables12000 (y162a) -> rejected at length; y162b de-ranked.
- linux-pc ran y174b / y175 / y162a after a ~23 h outage, then went silent again at ~10 PM (4th night outage). tacobell offline since 9:50 AM Oct 24. Push blocked again (TacoBell not connected); bundles in /workspace/R94 carry R93 + R94.

## Ranked open questions (R94)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | v44 worker confirmation + granW 40 held-out (v45 candidate: fables +0.020 16/0, text 3/11) | y179a/b |
| 2 | I99 | text1000 guard: granGain 0.001 / 0.01 on v44 (48 growths) | y180a/b |
| 3 | Q42 x I99 | Plateau x granule capacity: y177 (box) fables 4k -> 12k slope steeper with cells (+0.004 at 8000, +0.006 at 16000); book 30k / 100k / 300k next | y178, y181 (linux-pc) |
| 4 | I99 | Capacity curve 4000 / 8000 / 16000 (3 claws) | y176 |
| 5 | I99 x I95 | Granules sized with the cortex (cx3) | y165, y173 |
| 6 | I98 | One sized brain for all tasks | y166 |
| 7 | Q46 | seqchoice at size: striatum x6 / x8 replication | y167 |
| 8 | I99 | cx4dT granN 8000 | y168 |
| 9 | I72 | Generation with published stats | y169 |
| 10 | I99 | granRef 400 / 900 (on v43; retest on v44 if it moves) | y171a/b |
Growth-phase memory / speed: v44 = 8000 granules now costs ~1.45x v43 on every run; the sparse granule update path is the top engineering item (needed before 16000 or cx3 x granules are affordable).
Low: analogy / evolution. Rejected ideas stay rejected (as R92, plus granAnneal at length R94). De-ranked: y140 (0.6, superseded), y162b (0.7).

## Worker notes (R94)
linux-pc: back 7:53 PM - ~9:56 PM Oct 24, silent since (lease on y165 expired 3:20 AM); 4 night outages in 4 days — needs a physical check of sleep / power / network. tacobell: offline since 9:50 AM Oct 24 (laptop off / asleep); its worker-config has cpuMax 60 (the standing order says 75). Moto G never seen. Queue: light ~18 slot-h meaningful (~11 h at ~1.6 slot-h per wall hour) + ~29 slot-h filler; heavy ~98 slot-h (linux-pc can also take all light jobs).

## Previous header (R93)
# (R93 header) PRIORITIES (R93, Oct 24 2026, ~7:30 PM CT; **v43 / DEFAULTS_VERSION 36** unchanged — v43 = v42 with a 4000-cell granule layer; v42 = plan deepURSx3v42 (2000 cells, granRef 600); v41 = deepURSx3v42 + P.granRef=100)

## R93 update (queue review, evening)
- **No adoption; v44 candidate (granN 8000 + Kmix34) holds its first 8 held-out growths** (y174a: book30k +0.012 8/0, fables +0.009 8/0, book10k +0.002, text 0, order3 / K4 / seqchoice identical). y174b (other 8) decides.
- Pooled 24 growths: book30k +0.008 (20/4), fables +0.007 (24/0), book10k +0.003, text +0.0005. granW 40 on top: fables +0.021, book no longer worse, text -0.0006 (1/5).
- Length: bigger granule layer gains more from 10k -> 30k (+0.016 vs +0.011) -> plateau is partly capacity; y177 (fables 4k/12k, light) and y178 (book 30k/100k, heavy) queued.
- **Both workers silent**: linux-pc since 8:26 PM Oct 23 (~23 h), tacobell since 10:50 AM (laptop offline; y174b lease expired 2:50 PM). Push blocked; bundles on the box (/workspace/R93).

## Ranked open questions (R93)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | granN 8000 + Kmix34 held-out half 2 (v44 decision) | y174b |
| 2 | I99 | Cumulative text1000 drift v41 -> v42 -> v43 (48 growths) | y175 |
| 3 | Q42 x I99 | Plateau x granule capacity: does the length slope keep growing with cells? | y178 (linux-pc), y177 |
| 4 | Q42 / I100 | granAnneal at 100k / 300k, fables12k | y162a/b (linux-pc), y172 |
| 5 | I99 | Capacity curve 4000 / 8000 / 16000 | y176 |
| 6 | I99 x I95 | Granules sized with the cortex (cx3) | y165, y173 |
| 7 | I98 | One sized brain for all tasks | y166 |
| 8 | Q46 | seqchoice at size: striatum x6 / x8 replication | y167 |
| 9 | I99 | cx4dT granN 8000 | y168 |
| 10 | I72 | Generation with published stats | y169 |
| 11 | I99 | granRef 400 / 900 on v43 | y171a/b |
Growth-phase memory / speed: granN 8000 costs ~1.45x v43, 16000 ~2.8x; write the sparse granule update path if v44 = 8000 (needed before 16000 is affordable at size).
Low: analogy / evolution. Rejected ideas stay rejected (as R92).

## Worker notes (R93)
linux-pc: silent ~23 h (third night outage; needs a physical check + no-sleep / power settings). tacobell: laptop offline since ~10:50 AM CT; watchdog cannot help while the machine is off/asleep. Queue: light ~16 slot-h meaningful (~10-11 h) + ~29 slot-h filler; heavy ~94 slot-h. Moto G never seen.

## Previous header (R92)
# (R92 header) PRIORITIES (R92, Oct 24 2026, ~7:30 AM CT; **v43 / DEFAULTS_VERSION 36** unchanged — v43 = v42 with a 4000-cell granule layer; v42 = plan deepURSx3v42 (2000 cells, granRef 600); v41 = deepURSx3v42 + P.granRef=100)

## R92 update (queue review, morning)
- **No adoption; v43 holds** its worker held-out (y160 k 2272-2287: book10k +0.008 (16/0), book30k +0.011 (15/1), fables / order3 / seqchoice 0, text -0.0013 (4/9); pooled 32 text -0.00045, n.s.).
- granAnneal (I100) flat at 10k-30k -> rejected at 1x; y162 (100k / 300k) still pending.
- Granule capacity II (y163a + y163b partial): granN 8000 + mixed 3/4 claws up on book10k / book30k / fables / text; held-out y174a/b queued (all 8 tasks).
- linux-pc silent since 8:26 PM CT Oct 23 (second evening outage); tacobell healthy, single-file on memGB-1 jobs.

## Ranked open questions (R92)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | granN 8000 + Kmix34 held-out on 8 tasks (v44 candidate) | y163b (running), y174a/b |
| 2 | I99 | Cumulative text1000 drift v41 -> v42 -> v43 (48 growths) | y175 |
| 3 | Q42 / I100 | Plateau at length: granAnneal at 100k / 300k, fables12k | y162a/b (linux-pc), y172 |
| 4 | I99 | Capacity curve 4000 / 8000 / 16000 | y176 |
| 5 | I99 x I95 | Granules sized with the cortex (cx3) | y165, y173 |
| 6 | I98 | One sized brain for all tasks | y166 |
| 7 | Q46 | seqchoice at size: striatum x6 / x8 replication | y167 |
| 8 | I99 | cx4dT granN 8000 | y168 |
| 9 | I72 | Generation with published stats | y169 |
| 10 | I99 | granRef 400 / 900 on v43 | y171a/b |
Growth-phase memory / speed: granN 8000 costs ~1.45x v43, 16000 ~2.8x; a sparse granule update path becomes worth writing if v44 uses 8000.
Low: analogy / evolution. Rejected ideas stay rejected (as R91, plus granAnneal at 1x R92).

## Worker notes (R92)
linux-pc: silent since 8:26 PM CT Oct 23 (~40 slot-h heavy work waiting; needs a physical check, and maybe a no-sleep / power setting). tacobell: healthy; ~16 slot-h light (~11 h). Moto G never seen.

## Previous header (R91)
# (R91 header) PRIORITIES (R91, Oct 23 2026, ~7:30 PM CT; **v43 / DEFAULTS_VERSION 36** — v43 = v42 with a 4000-cell granule layer; v42 = plan deepURSx3v42 (2000 cells, granRef 600); v41 = deepURSx3v42 + P.granRef=100; v40 brain = deepURSx3v40)

## R91 update (queue review, evening)
- **v43 adopted: granule layer 4000 cells.** y159 (k 2240-2255) + box confirmation (k 2256-2271, all 8 tasks): book10k +0.008 (28/4), book30k +0.011 (29/1),
  fables +0.001-0.002, text / order3 / K4 / seqchoice not worse. Cost ~1.4x runtime. Worker held-out = y160a/b.
- New code: granAnneal (per-granule step annealing, for the plateau) and gen.js BB_GEN_MEAN (publishable generation stats).
- linux-pc back since 9:38 AM CT, idle since 3:23 PM (queue empty). tacobell silent since 5:00 PM CT. Push blocked (TacoBell offline); bundles on the box.

## Ranked open questions (R91)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | v43 worker held-out (all 8 tasks) | y160a/b |
| 2 | Q42 / I100 | Plateau: per-granule step annealing (granAnneal 5000 / 20000) at 10k, 100k, 300k | y161a/b, y162a/b, y172 |
| 3 | I99 | Granule capacity II: granN 8000, mixed claws K3-4, granW 40 on v43 (brain ~0.38 vs ceiling ~0.41) | y163a/b |
| 4 | I99 x I95 | Size the granules with the cortex: cx3 granN 2000/6000 x granRef 600/1800; at 100k | y165, y173 |
| 5 | I98 | One sized brain for all tasks (cx3 ref850 +/- granN 6000, 7 tasks) | y166 |
| 6 | Q46 / I98 | seqchoice at size: striatum x6 / x8 replication (growths 16-31) | y167 |
| 7 | I99 | cx4dT granN 8000 | y168 |
| 8 | I72 | Generation with v43 + outGate, published stats | y169 |
| 9 | I99 | granRef 400 / 900 on v43 | y171a/b |
Growth-phase memory / speed: v43 adds ~2000 cells and ~1.4x runtime; no new speed work this round (next candidate: a sparse granule update path).
Low: analogy / evolution. Rejected ideas stay rejected (deeper chains / slow layers R60, delta rules R82, clawKeep / clawWF R82, mixFreeze R82, granIso R88, metaN 80+ R88,
granRef 1000 / 3000 at 1x R88-R89, granGain 0.001 / granRate 0.0006 / granW 90 R90, slower granLr R91, preNorm R91, mixInh 0.35 R91).

## Worker notes (R91)
linux-pc: back, idle since 3:23 PM CT; ~62 slot-h heavy work queued (waits on the push). tacobell: silent since 5:00 PM CT; ~20 slot-h light work (~10 h). Moto G never seen.

## Previous header (R90)
# (R90 header) PRIORITIES (R90, Oct 23 2026, ~7:45 AM CT; **v42 / DEFAULTS_VERSION 35** unchanged — v42 = v41 + params.granRef 600; v41 = deepURSx3 + P.granRef=100; v40 brain = deepURSx3v40)

## R90 update (queue review, morning)
- **No adoption; v42 holds** its worker held-out (y154 k 2176-2191: book10k +0.020, book30k +0.019 (16/0), fables +0.004, text / order3 / seqchoice / K4 0).
- 1x granule tuning is exhausted: granLr 0.05 / 0.2, granGain 0.001 / 0.01, granRate 0.00015 / 0.0006, granW 90 flat or worse; granRef 450 = 750 = 600; only granW 40
  (fables +0.006, 15/1) is worth a v42 retest. preNorm 45 (y148a+b, 16) book +0.002 (11/5, 11/4), text 0: too small to adopt, retest on v42 (y157).
- linux-pc silent since Oct 22 9:45 PM CT (claimed y143; lease expired) -> Travis to check. tacobell healthy.

## Ranked open questions (R90)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | Granule capacity on v42 (granN 4000, granK 4): the remaining lever toward the ~0.41 ceiling | y159a/b (light), y149 (cx4) |
| 2 | I99 | granW 40 on v42 (fables +0.006 on v41) | y155a/b |
| 3 | Q42 | Plateau: does a slower readout step win with length? (granLr 0.05 / 0.025 at 10k-100k) | y156a/b, y158 |
| 4 | I99 x I95 | granRef 1000 at cx3 / cx4 | y143 (linux-pc) |
| 5 | I98 | One sized brain for all tasks with granules; cx3 + ref850 for order3 | y144, y152 |
| 6 | Q46 | Output-drive normalisation: preNorm 45 / 50 on v42; mixInh 0.35 | y148b, y157a/b, y153a/b |
| 7 | Q42 | cx3 at 100k; granRef 1000 at 100k | y151, y145 |
| 8 | I98 | seqchoice at size | y150 |
| 9 | I72 | Generation with granules + outGate | y142 |
Low: analogy / evolution. Rejected ideas stay rejected (deeper chains / slow layers R60, delta rules R82, clawKeep / clawWF R82, mixFreeze R82, granIso R88, metaN 80+ R88,
granRef 1000 / 3000 R88-R89, granGain 0.001 / granRate 0.0006 / granW 90 R90).

## Worker notes (R90)
linux-pc: silent since 9:45 PM CT Oct 22 (needs a check); ~55 slot-h of heavy work waiting. tacobell: healthy, ~18-19 slot-h light work (~10 h). Box probe: 1x jobs <= ~0.4 GB, cx4 granule ~1.3 GB.

## Previous header (R89)
# (R89 header) PRIORITIES (R89, Oct 22 2026, ~8 PM CT; **v42 / DEFAULTS_VERSION 35** — v42 = v41 + params.granRef 600; v41 = deepURSx3 + P.granRef=100; v40 brain = deepURSx3v40)

## R89 update (queue review, evening)
- **v42 adopted: granRef 600.** y139 (run on the box, fresh k 2048-2063): book10k +0.019, book30k +0.022 (16/0), fables +0.003, order3 +0.002, text -0.0005 (4/6, n.s.),
  seqchoice identical; pooled with R88's block (32 growths) text -0.0004 (11/14, t -1.0). granRef 1000 stays rejected (text negative on all 3 blocks). Worker held-out = y154.
- Nothing pushed again: TacoBell (push path) offline since Oct 21 5:19 PM CT; linux-pc alive but idle since 6:25 AM (queue empty). Bundles ready on the box (/workspace/r89).
- Pending R88 jobs pinned to v41 (P.granRef=100) except arms that set granRef; y139 dropped (done on box); y154a/b added.

## Ranked open questions (R89)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | v42 worker held-out (watch text1000) | y154a/b |
| 2 | I99 x I95 | Does a stronger granule drive (1000) add at cx3 / cx4? | y143 |
| 3 | I98 | One sized brain for all tasks with granules; cx3 + ref850 for order3 | y144, y152 |
| 4 | I99 | Close the brain's accuracy (v42 held-out book ~0.38-0.39) to the granule readout ceiling (~0.41): capacity (granN 4000, granK 4), readout rule (granLr, granGain), code (granRate, granW) | y140, y141, y147 |
| 5 | Q46 | Output-drive normalisation with granules (cortex preNorm 45 / 65); mixInh 0.35 on v41 | y148, y153 |
| 6 | Q42 | Plateau after ~10k symbols: granRef 1000 at 100k; cx3 at 100k (capacity vs rule) | y145, y151 |
| 7 | I98 | seqchoice at size (thinF 8, recvBudget 1.5, striatum 6x) | y150 |
| 8 | I72 | Generation with granules + outGate loop breaker | y142 |
| 9 | I95 | Scale the granule layer with the cortex (granN 4000 / 8000 at cx4) | y149 |
Low: analogy / evolution. Rejected ideas stay rejected (deeper chains / slow layers R60, delta rules R82, clawKeep / clawWF R82, mixFreeze R82, granIso R88, metaN 80+ R88, granRef 1000 / 3000 R88-R89).

## Worker notes (R89)
linux-pc: healthy, idle (starved) since 6:25 AM CT. tacobell: laptop offline since Oct 21 5:19 PM CT. Queue after R89 (once pushed): ~78.9 slot-h = linux-pc ~13 h; light ~21 slot-h.

## Previous header (R88)
# (R88 header) PRIORITIES (R88, Oct 22 2026, ~7:45 AM CT; **v41 / DEFAULTS_VERSION 34** unchanged — v41 = v40 + 2000-cell granule layer onto the outputs (R84); old brain = deepURSx3v40)

## R88 update (queue review, morning; R87 evening review failed before pushing)
- **No adoption.** v41 holds its worker held-out (y133 k 2000-2015: book +0.038 16/0, fables +0.010 16/0, order3 / text / K4 0, seqchoice identical).
- **v42 candidate = granRef 600** (box k 2144-2159: book +0.019 16/0, text -0.0003 n.s.). granRef 1000 (32 fresh growths) book +0.020 but text -0.0008 (12/15, t -2.4).
  Decision = y139a/b (16 more fresh growths, 600 and 1000). granIso (output fencing) costs book -0.008: rejected.
- Granules stack with size (cx3 / cx4 +0.03 book over the same brains without them); order3 at size still -0.13 without mixInhRef.
- Plateau confirmed as a rule limit: no gain from 10k to 300k (to 1M +0.008) at 1x, 4x, 8x, any cortex rate, with or without granules.
- linux-pc idle since 6:25 AM (queue empty); tacobell / TacoBell offline since Oct 21 5:19 PM -> nothing could be pushed this run.

## Ranked open questions (R88)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | v42: granRef 600 or 1000 — which passes no-task-worse on a second fresh block? | y139a/b |
| 2 | I99 x I95 | Does granRef 1000 add at cx3 / cx4? | y143 |
| 3 | I98 | One sized brain for all tasks with granules (cx4dT + receivers + thin5 +/- ref850); cx3 + ref850 for order3 | y144, y152 |
| 4 | I99 | Granule capacity / readout rule / code (granN 4000, granK 4, granLr, granGain, granRate, granW) toward the 0.41 ceiling | y140, y141, y147 |
| 5 | Q46 | Output-drive normalisation with granules: cortex preNorm 45 / 65 | y148 |
| 6 | Q42 | Plateau: granRef 1000 at 100k; v41 cx3 at 100k — capacity or rule? | y145, y151 |
| 7 | I98 | seqchoice at size: thinF 8, recvBudget 1.5, striatum 6x | y150 |
| 8 | I72 | Generation with granules (+ outGate loop breaker) | y142 |
| 9 | I95 | Scale the granule layer with the cortex (granN 4000 / 8000 at cx4) | y149 |
Low: analogy / evolution. Rejected ideas stay rejected (deeper chains / slow layers R60, delta rules R82, clawKeep / clawWF R82, mixFreeze R82, granIso R88, metaN 80+ R88).

## Worker notes (R88)
linux-pc: healthy, idle (no eligible jobs) since 6:25 AM; takes the R88 jobs once pushed. tacobell: laptop offline since Oct 21 5:19 PM CT (not a crash loop).
Queue after R88 (once pushed): ~79.5 slot-h = linux-pc ~13 h; light pool ~23 slot-h for tacobell when it is back.

## Previous header (R86)
# (R86 header) PRIORITIES (R86, Oct 21 2026, ~7:45 AM CT; **v41 / DEFAULTS_VERSION 34** — v41 = v40 + 2000-cell granule layer onto the outputs (R84); old brain = deepURSx3v40)

## R86 update (queue review, morning)
- **v41 pushed** (adopted by the R83-R85 box session under Travis's standing authorisation; 16 fresh growths k 1940-1955: book +0.038 16/0, fables +0.009 16/0, order3 / text
  unchanged, seqchoice identical). All pending queue runs pinned to v40 (P.granN=0). Second held-out on the workers = y133 (must hold, else revert).
- **Size curve peaks at 4x** (cx6 -0.005, cx8 -0.010 book vs cx4; text +0.010 keeps rising). cx3 holds on fresh seeds (+0.028 book). lr / preNorm / divRep 3 at cx4: no gain.
- **seqchoice at size is a receiver problem:** cx4 divRep + 4x striatum + context with sizeCone + recvBudget 2: cycle 0.29 -> 6.0 (1x 9.1). I98 thinF 5 adds +1.1 / +1.7 at
  all-4x and helps book / text there. mixInhRef restores order3 (+0.14) on the cx4 brain for text -0.012.
- tacobell was killed silently overnight (~9 PM-5:45 AM); the watchdog restarted it. linux-pc healthy.

## Ranked open questions (R86)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I99 | Does v41 hold on worker hardware / new seeds (all 7 + K4)? | y133a/b |
| 2 | I99 | v42: granRef 300 / 1000 / 1000+iso — more book without the text cost? | y134a/b |
| 3 | I99 x I95 | Do granules stack with cortex size (cx3 / cx4 divRep)? box g0: book10k +0.022, order3 +0.028 over cx4dT | y135 |
| 4 | Q42 | Plateau: does the granule readout gain grow with length (book100k, fables12000)? | y138 |
| 5 | I98 | One sized brain for all tasks: cx4dT + sized receivers + thinF (+ mixInhRef) | y136 |
| 6 | I99 | Close the granule readout gap (own 0.33 vs ceiling 0.41): readout rule, granule sparsity, more claws | box |
| 7 | I72 | Generation with granules | y137, y104, y106 |
Low: analogy / evolution. Rejected ideas stay rejected (deeper chains / slow layers R60, delta rules R82, clawKeep / clawWF R82, mixFreeze R82).
Decision point (for Travis) unchanged: no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain.

## Worker notes (R86)
linux-pc: healthy, on y103; updates to v41 code before its next claim. tacobell: back since 5:45 AM (watchdog), light-only (2 slots, cpuMax 60, maxMemGB 1).
Queue after R86: linux-pc ~45-50 h, tacobell ~18-20 h (light) by estimate.

## Previous header (R79)
# PRIORITIES (R79, Oct 20 2026, ~7:45 PM CT; **v40 / DEFAULTS_VERSION 33** unchanged — v40 = v39 + cortex preNorm 55; fast engine default since v38)

## R79 update (queue review, evening)
- **No adoption.** v40 held its second fresh check (y89 k 1700-1715: no task significantly worse). Weak 1x candidate: mixInh 0.35 (order3 +0.006, t 2.0; text -0.002 n.s.) -> y105 ladder (32 fresh growths).
- **Size, Travis's opposite-varying patch confirmed:** trophMin@cortex = 0.005 / f keeps order3 K4 at 1x level on 16 FRESH growths (0.981 vs 0.986; untreated 0.090) and turns 8x
  order3 0 -> 0.766, text 0.565 -> 0.777; book / text are bit-identical with or without it (a pure fix).
- **The compensated size curve peaks at 3x-4x:** book30k vs 1x cx2 +0.003, cx3 +0.025, cx4 +0.031 (16/0; fresh +0.034 16/0), cx8 +0.023 (book10k, n 8) — 8x is below 4x (fables -0.012, 0/8).
  cx3 is the efficient point (= cx4 on book within 0.006, text +0.017 14/2, ~70 % of the cost). Fresh cx3 check = y98.
- **Two failures remain, and they look like one fault:** order3 K8 -0.08..-0.19 at every size and seqchoice collapsed under cortex-only divRep. R78: order3 = pooled mixing inhibition grows ~f
  (P.mixInhRef restores order3 but costs text). R79 census: seqchoice = the striatum's cortex input spread over 14x more, 14x weaker synapses (487 -> 6905, same total), so the striatum
  echoes its input (accuracy below chance). In both, a sized region projects onto a fixed-size receiver and normalising the TOTAL makes each synapse f-times weaker.
  Proposed patch (I98, not yet coded): keep per-synapse strength / afferent count at the 1x value (thin the projection ~1/f).
- **Generation measured for the first time:** greedy = ~95 % spaces; T0.7 ~70 % valid words, 33 % non-space (real ~80 %), trigram surprise 6 bits vs 2.4; gates trade content for validity.
- **Length:** still flat at size (book100k / 300k +0.005 / +0.008 vs 1x; fables 8000 / 12000 = the 4000 gain).

## Ranked open questions (R79)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I98 / Q46 | Sized-source -> fixed-receiver dilution: which region must grow with the cortex for seqchoice; does thinning the projection ~1/f (code) fix seqchoice and order3 without the text cost of mixInhRef? | y110, y97, y96; box: write the gene |
| 2 | I97 | mixInhRef on the best book brain (cx4 divRep + trophMin): order3 back, text cost? | y97a/b |
| 3 | I95 | Where does the curve peak (cx6), is 8x really below 4x (24 growths), cx3 on fresh seeds, lr / preNorm / divRep 3 at size | y98, y99, y100-y102, y112 |
| 4 | Q42 | The ~10k plateau / 0.40 oracle: readIn, metaN, length with the divRep brain | y107, y109, y103, y111 |
| 5 | I96 | 1x mixInh below 0.5 as v41 | y105a-d |
| 6 | I72 | Generation: 1x and cx4 divRep with T0.7 / gate | y106, y104 |
Decision point (for Travis) unchanged: no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain. Today's best: cx4 divRep +
trophMin has the book gain (+0.034 fresh) but order3 -0.12 and seqchoice ~0.1-2 of 9.

## Worker notes (R79)
linux-pc: healthy (26 jobs since 7:37 AM, no restarts), on y36 (4xS book300k) since 6:25 PM; updates to the R79 code before its next claim. tacobell: healthy, light-only since R78
(2 slots, cpuMax 60, maxMemGB 1); it sat idle from 7:21 PM until the R79 light jobs (y105-y109, ~13 slot-h). Queue after R79: linux-pc ~6-9 h, tacobell ~7-9 h by estimate.

## Previous header (R77)
PRIORITIES (R77, Oct 20 2026, ~8 AM CT; **v40 / DEFAULTS_VERSION 33** — v40 = v39 + cortex preNorm 55; fast engine default since v38)

## R77 update (queue review, morning)
- **Adopted v40** (standing authorisation): preNorm@cortex 55 passed on 16 fresh growths (y83: no task worse; order3 +0.005 8/0, book / fables +0.001-0.002). Old brain = `deepURSx3v39`.
  Scaled runs pin `pl.preNorm@cortex=45` (at cortex 4x preNorm 55 costs order3 -0.014, y85). All pending jobs were pinned to 45 (= the v39 brain they were designed for).
- **Root cause found for the size "silence"** (Travis's compensation idea, applied): each output releases a fixed trophic factor; an f x larger cortex splits it f ways and the
  output-projecting cells starve below trophMin and die -> outputs with zero afferents (order3 K4 at 4x, order3 K8 at 8x, 8x text 0.57). `sc.trophMin@cortex = 0.005 / f`
  restores them (box: cx4 K4 0 -> 9.88, cx8 order3 0 -> 7.25, cx8 text 5.71 -> 7.66; book / text at 4x unchanged). It does NOT fix the remaining order3 K8 loss at 4xS
  (context-side, I87) or the divRep seqchoice collapse.
- **Best text brain so far:** cortex 4x + divRep 2 (the cortex actually fills): book30k 0.373 vs 1x 0.340 (+0.033, 8/0, growths 0-7), fables +0.033; order3 / seqchoice
  broken without fixes. Fresh-seed check + trophMin = y89; the compensated 2x / 3x / 4x / 8x curve = y90 / y91.
- **Length:** flat from 30k to 1M at 1x (y27) and 100k -> 300k at cortex 4x (y50b). The plateau is a learning-rule property, not a size one.
- **recvBudget 2** fully recovers seqchoice at whole-brain 2x on fresh seeds (vs 1x +0.34 / +0.27, n.s.), = the R72 cap at 4x, partial at 3x.
- **Bug found:** generation jobs y31 / y32 ran r42.js (no generation metrics); pending y18 / y53 / y78 switched to run/gen.js.

## Ranked open questions (R77)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q45 / I80 | Does the cx4 divRep text gain (+0.03) hold on fresh seeds, with trophMin/4 keeping order3 K4? | y89a/b |
| 2 | I95 | Compensated size curve: 2x / 3x / 4x / 8x divRep + trophMin 0.005/f — is book monotone in size once nothing starves? | y90a/b, y91 |
| 3 | Q46 / I87 | Why does divRep collapse seqchoice (0.2-2.7 with every fix), and what is the residual order3 K8 loss at 4xS (context dilution)? | box (receiver probe of the divRep striatum; context-side census) |
| 4 | I94 | recvBudget 2 at 3x / 4x: what limits seqchoice there? | box |
| 5 | Q42 | The ~10k plateau (flat to 1M at every size): does the 0.40 readout ceiling itself plateau, or only the rule? | box (readout vs length) |
| 6 | I72 | Generation, now measured (gen.js) | y18, y53, y78 |
Decision point (for Travis): no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain. trophMin / f removes the
total failures; whether cx4 divRep + trophMin + recvBudget gets there is y89 / y90 plus the seqchoice diagnosis.

## Worker notes (R77)
linux-pc: healthy, ~10 est slot-h per hour; one unexplained restart at 5:47 AM CT on y33a (not repeated). tacobell: healthy, ~1.75 est slot-h per hour, on y50a (book300k) since 4:04 AM.
Runnable after R77 ~300 est slot-h (~25 h both workers); the R77 jobs first (~21 slot-h).

## Previous header (R75)
PRIORITIES (R75, Oct 19 2026, ~7:45 PM CT; **v39 / DEFAULTS_VERSION 32** unchanged; fast engine default since v38)

## R75 update (queue review, evening)
- **Worker incident:** linux-pc was OOM-killed every ~4 min from 4:42 PM CT on y46 (8x cortex: ~4.4 GB per run x ~8 parallel). Fixed: job `memGB` + run/mempar.js
  (parallel runs capped by RAM), crash-loop guard in run/dq.js (2nd restart on the same job -> skip it 12 h), 8x jobs split / parked, tacobell skips `*cx8*`.
- **Next adoption candidate:** preNorm@cortex 55 (I92): no task worse on growths 0-15 (book30k +0.004 14/1). y83a/b (fresh k 1500-1515, all 7 tasks) decides v40.
- **Size, honest status:** whole-brain 4xS + fanRef book +0.013 but order3 -0.23; cortex 4x + fanRef book +0.009 (growths 0-15) / +0.005 n.s. (fresh), order3 -0.09..-0.11,
  text -0.012. The striatal cap rescues seqchoice only at cortex 4x (2x / 3x / 8x still collapse, y66). order3 K4 fails completely at 4xS (0.086 vs 0.984, y30): a dynamics bug,
  not capacity, and probably the same one behind the order3 loss (Q44, y86).
- **Length still flat** (y26: 1x book100k = 30k = 10k under v39).

## Ranked open questions (R75)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q43 / I92 | preNorm@cortex 55 on fresh growths; optimum 50-80; does it help at cortex 4x? | y83a/b, y84, y85 |
| 2 | Q44 / I87 | Why short-context order3 (K4) dies at 4xS; which region | y86 + box dissection |
| 3 | I91 | trophic 28 on fresh growths (text = fix, seqchoice worse so far) | y80, y82 |
| 4 | I80 | Does a fully grown 8x cortex add anything (memGB jobs) | y46, y61, y52 |
| 5 | Q42 / I73 | Length at size under fanRef | y50, y54, y55, y60 |
Decision point (for Travis) unchanged: no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain.

## Worker notes (R75)
linux-pc: crash loop on y46 4:42-~7:50 PM CT; after the R75 pushes it skips the memGB jobs until it self-updates, then runs them at ~2 parallel. tacobell: alive, y80;
it runs 2-3x slower than the slot estimates. Runnable queue after R75 ~358 est slot-h (>= 20 h for both workers).

## Previous header (R71)
PRIORITIES (R71, Oct 19 2026, ~11:30 AM CT; **v39 / DEFAULTS_VERSION 32** unchanged; R71 adds size-scaling genes, all off by default)

## R72 update (Oct 19 midday)
- **Seqchoice collapse diagnosed (I90):** the striatum still sees the state (mixing cells decode the arm at 1.0 at 1x and 4x), but preNorm gives each presynaptic cell the
  same outgoing budget, so a striatal receiver's plastic total grows 4-6x with a 10x larger mixing population: drive 4x, receivers' own arm code 0.75 -> 0.3, output margin 0.35 -> 0.12.
- **Fix (genes off by default):** `P.postCapRel` (+ `P.postN`) caps a receiver's plastic total at a multiple of its birth total. Cortex 4x + fanRef + postCapRel 1.5 / postN 130 on seqchoice
  (8 growths): order2 3.23 -> 5.76, cycle 3.97 -> 7.83 (1x 6.48 / 9.23); an all-receiver cap reaches 6.1 / 8.8 but costs 1x cue -2 (postN keeps 1x bit-identical).
- **Large-run decision:** still not proposable: order3 -0.07 and seqchoice -0.7 / -1.4 vs 1x remain, 16-growth confirmation (y62-y69) pending.

## R71 update
- **New genes** (bit-identical when off; test_core checks it): `sc.sizeF` (per-region size factor), `sc.sizeNorm`, `sc.divReach`, `sc.divRep` (I80),
  `P.fanRef` / `P.fanRefR` (fan-in-normalised rate of the teacher / reward rule).
- **fanRef is a partial fix (I89; ladder 200 / 300 / 450 / 840 -> order3 0.790 / 0.835 / 0.875 / 0.856, optimum ~450):** cortex 4x + fanRef 450 at lr 0.2 recovers order3 0.756 -> 0.875 (8/0; cortex 4x lr 0.1: 0.797; 1x 0.949) and keeps the
  cortex text gain (book10k / 30k +0.009, fables +0.005 vs v39 1x, 8 growths). Order3 is still -0.07 vs 1x, text1000 -0.008.
- **Not fixed:** the seqchoice collapse from a bigger cortex (order2 3.2-3.7, cycle ~4.0 vs 6.5 / 9.2); fanRefR helps order2 a little, cycle not at all, so it is not
  a rate effect. sizeNorm 4 makes it worse (rejected). The context-side order3 loss is untouched by fanRef (predictor fan-in does not change with context size).
- **I80 growth timing fixed in code:** divRep 2 fills maxCells (8x cortex 14.45k cells vs 7.3k). Whether a full 8x cortex pays is y46 / y61.
- **Large-run decision: still not proposable.** No scaled brain meets the bar (order3 within 0.02 of 1x, seqchoice within noise, book gain kept).

## Ranked open questions (R71)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I89 | fanRef at 16 growths and fresh seeds; best fanRef (200 / 300 / 450) and fanRefR; does a higher lr pay under fanRef? | y42, y43, y44, y48, y51 |
| 2 | I87 | Per-region factors with fanRef (plain 4xS, sizeF all-but-striatum, sizeF everywhere); context 4x + sizeNorm; the seqchoice collapse needs a diagnosis (striatum input from a big cortex) | y45, y57, y59 |
| 3 | I80 | Does a fully grown 8x cortex (divRep 2) add to 4x under fanRef? | y46, y61, y52, y56 |
| 4 | I73 | Length at size under fanRef (book100k / 300k, k 1400-1415) vs y27 / y36 / y40 | y50, y54, y55, y60 |
| 5 | I78 / I72 | 2x cortex size curve; rule knobs and generation under fanRef | y49, y58, y53 |
Decision point (for Travis) unchanged: no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain,
and the long-life jobs show size still improving between 100k and 300k.

## Worker notes (R71)
R71 code pushed 10:57 AM CT (9787c0f); y42-y61 queued 10:57 AM (~172 est slot-h; requires run/r71_jobs.js). y42a was claimed within minutes. Pending
before R71: ~150 est slot-h. Total ~320 est slot-h, ~200-220 real slot-h at the R69 ratio: ~17-18 h for both workers (12 slots) together, not the
24 h asked for. The next review needs to add more.

## Previous update (R70)
- **v39 adopted** (standing authorisation): cortex lr 0.2 passed on 16 FRESH growths (y08: book10k +0.006, book30k +0.009, fables +0.007, order3 -0.002 n.s.,
  text 0, seqchoice identical). Old brain = plan `deepURSx3v37`. y23 (fresh set 2) passes too; pooled 32 fresh growths order3 -0.004 (t -1.7): small, watch it.
  z10b completes the 4xS fast-engine check (no task worse): v38 engine stands. lr 0.3 / 0.5 forget order3 (-0.015 / -0.046): the rate optimum at 1x is ~0.2-0.25.
- **Rate x size:** at 4xS lr 0.2 is worse (book -0.004 / -0.006, text -0.006); lr 0.05 does not rescue order3. The best rate falls with size, so scaled runs pin lr 0.1.
- **Size dissection (y10a/b, 16 growths):** the book gain lives in the cortex (+0.014 of +0.020); scaling the context regions gains nothing and alone costs
  order3 -0.22; scaling the cortex alone costs order3 -0.16, text -0.015 and collapses seqchoice. A code fix is needed before size can be a default (I87).
- **Large-run decision:** still **not ready** (order3 / seqchoice lost at size; length flat at 100k). y36 (4xS 100k vs 300k) and y27 (1x to 1M) answer the length half.
- Rejected: plateau 6 at lr 0.2 (order3 -0.020, t -2.6), lr 0.3 / 0.5.

## Ranked open questions (R70)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I77 | Rule knobs at the new rate (teachThr, plateau 5, metaCap 400, trustPow 0.5, preNorm 55); lr 0.25; does v39 hold on fresh set 2? | y23, y24, y25, y38 |
| 2 | I87 | Region causes of the size loss (y10b, y16, y33, y37) and order3 K 4 / 16 x size (y30); then a box code fix: per-region scaling, fan-in normalised to source-region size, striatum excluded from sc.* | y10b, y16, y30, y33, y37 |
| 3 | I78 | Rate x size curve (2xS 0.05 / 0.1 / 0.2, 4xS 0.07 / 0.14); size curve on fresh seeds (2xS / 3xS / 4xS); rule knobs at 4xS | y28, y29, y34, y39, y15, y21, y35 |
| 4 | I73 | Does length ever pay? 1x v39 to 1M; 2xS / 4xS 100k -> 300k | y26, y27, y36, y40, y41 |
| 5 | I72 / I81 | Generation with the gate under v39 and at 4xS after 100k | y31, y32, y18 |
| 6 | I80 | 8x growth needs proliferation / growth time scaled (code, box) | none (code) |
| low | - | space-bias output fixes, mixing codes, sparser activity, fewer substeps, staged maturation, evolution / racing, plateau 6, lr >= 0.3 | none |
Decision point (for Travis) unchanged: no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain,
and y36 shows 4xS still improving between 100k and 300k.

## Worker notes (R70)
Both workers were busy on R69 jobs all morning (linux-pc y08a -> z10b, tacobell y08b -> y10b). R70 queued ~122 slot-hours on top of ~44 left (~14 h wall
together by the estimates, likely less). All R70 jobs `require` only R69 files, so the workers can claim them on their current code.

## Previous update (R69)
- **v38 adopted** (standing authorisation): params.fastEngine 1 by default after z08 (1x, 16 growths x 7 tasks), z09 (4xS book10k, 16/16 identical) and
  z10 (4xS 5 tasks, 8 growths) showed no task worse. Exact engine = P.fastEngine=0 (identity checks; verify.js BB_ENGINE=0). z10b completes the 4xS check.
- **Size is not a free win.** 4xS gains book +0.02 and fables +0.017 but loses order3 -0.24 (0/16) and collapses seqchoice; 2xS loses order3 -0.15 and
  text1000 -0.017. The loss grows with the cell count of the cortex or the context regions (box dissection), and plan-wide sc.* variants also inflate the
  striatum. The large-brain run is **not ready**: fix higher-order context at size first (I87 / Q39).
- **Length is flat at every size** (1x v37 100k = 30k; 2xS / 4xS 100k = 30k). The brain saturates at a bigram-plus level whatever it is fed.
- Cortex lr 0.2 wins the 5-task screen (book +0.008 / +0.009, fables +0.007, order3 -0.007 n.s.): confirmation on fresh seeds with seqchoice (y08) -> v39 if it passes.
- Rejected: staged maturation (I82), tauPre 8 / 18, metaCap 100 / metaN 80 under v37 (order3). Cumulative v34 -> v37 gains hold on fresh seeds (z01-z03).

## Ranked open questions (R69)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | Q40 / I77 | Does cortex lr 0.2 (+ plateau 6) pass on fresh growths with seqchoice (adopt as v39)? Where does the rate stop paying? | y08a/b, y09 |
| 2 | Q39 / I87 | Which region's size breaks order3 / seqchoice, and which carries the book gain (4xS and 2xS by region; 3xS curve; long fables x size)? Then a code fix on the box (per-region scaling, normalised fan-in from bigger context regions, striatum excluded from size variants) | y10a/b, y16, y21, y17 |
| 3 | I78 | Rule x size: does lr 0.2 add at 4xS, does lr 0.05 rescue order3, do consolidation knobs behave differently at size? Fresh-seed replication of 4xS | y11a/b, y15a/b, y20, y22a/b |
| 4 | I84 | Fast engine at 4xS on 16 growths (post-adoption check) | z10b |
| 5 | I72 / I81 / I73 | Generation with the confidence gate at 4xS; size x length at the faster rate | y18, y19 |
| 6 | I80 | 8x needs growth time / proliferation scaled to the grid (code, box) | none (code) |
| 7 | I71 / I81 | Travis's passive-then-active hunch: output gate done (better generation policy, no accuracy gain); confidence-gated learning and a silent-then-acting seqchoice phase need code | none (code) |
| low | - | space-bias output fixes, mixing codes, sparser activity, fewer substeps, staged maturation, analogy, evolution | none |
Decision point (for Travis): no large run until a scaled brain keeps order3 within 0.02 of 1x and seqchoice within noise while keeping the book gain.
Then: v39 (or v38) at 4xS, 100k -> 300k -> 1M symbols with checkpoints and generation samples, on linux-pc, only with Travis's go-ahead.

## Worker notes (R69)
Both workers healthy and on the latest code (d8e7d84 at review time; they self-update to the R69 commit), supervised, heartbeats every ~30 min. Both sat idle
from ~6 AM CT because the queue ran dry. Measured capacity: linux-pc ~8 parallel runs, tacobell ~4 (cpuMax 75). R69 queued ~76 slot-hours = ~6-6.5 h of wall
time on both workers together (up to ~9 h if 4xS is memory-bound): short of 12 h on purpose, because the next useful jobs depend on y08 / y10 (do not pad with
low-value runs; the next review refills). The laptop's old local queue stays retired.

## Previous update (R68)
- Fewer substeps per symbol (I86) is not a win. 75-82% of the substeps loses 0.02-0.03 on every text task (0/8) for 1.1-1.2x life speed. 50-64% loses 0.05-0.25. Time-constant rescaling (dtRescale) is far worse, because synaptic delay and the spike limit are tied to the substep.
- Fast engine (I84): z08 (1x) and z09 (4xS book10k, 16/16 identical scores, 1.97x on the worker) pass; flip fastEngine to 1 (DEFAULTS_VERSION 31) once z10 is done so no in-flight comparison mixes engines.
- Nothing queued from R68. Remaining speed levers: threads (SharedArrayBuffer workers over cells), or per-tick work (readout / modulate / critic), which caps substep savings at ~1.4x.

## Previous update (R67)
- Sparser activity (I85) is not a win. Text tasks already spike 1.6-2% per substep in the cortex; the 23% 'receiving' figure is fan-in. Every gene setting that cuts activity (adaptive hidden thresholds, pooled region inhibition, threshold offset) costs book / fables accuracy (best: -0.11 at -25% activity). Halving seqchoice activity costs -0.01 to -0.02.
- Speed does not follow spikes: 10x fewer spikes gives 1.05x (1x) / 1.43x (4xS), and mode 2 stays slower. Next speed lever: fewer O(N) passes per substep, or threads.
- Nothing queued from R67. R66 fast engine: z08 (1x, 16 growths x 7 tasks) passes (all |t| < 1.4, worker book 2.8-3.3x faster); z09 (4xS) running, adopt after it passes.

## Previous update (R66)
- Fast engine (I84, params.fastEngine 1, off by default): life 1.86x (1x) / 1.60x (4xS) faster than the exact engine, total 1.70x / 1.45x; vs R64 total 2.4x. Box screen: no task worse. 4xS peak RSS 1.59 -> 1.08 GB (exact path too, bit-identical).
- z08a/b, z09a/b, z10 (priority 0.975 / 0.974 / 0.95) validate it on 16 fresh growths. If they pass, make fastEngine 1 the default (standing authorisation).
- Several-x needs threads: activity is dense (~23% of cells receive input per substep) and propagation is now the floor.

Goal (Travis): the best SNN design, found as fast as possible, on the way to a **large brain that generates text like a small LLM**.

## Previous update (R65)
- Engine: bit-identical speedups give life 1.47x (1x) / 1.59x (4xS), total 1.40x / 1.43x. dropDense cuts 4xS life RSS from 1.45 to 0.26 GB, which should ease the 17x worker cost. Growth (~25% of a 4xS run, dense N² matrices) is the next speed target.
- New genes, all off by default: output confidence gate (I81, z06 / z07) and staged maturation (I82, z04 / z05; early box signs are negative).
- Q38 cumulative v34 / v36 / v37 check on fresh seeds k 1000-1015: z01-z03.
- The ranking below is unchanged. Add: rank 3b I81 gate generation (z06); low I82 staged (z04 / z05) unless z04 shows staged ≥ scratch.

## Previous status (R64)

Goal (Travis): the best SNN design, found as fast as possible, on the way to a **large brain that generates text like a small LLM**.
Analogy is secondary. Pick tests that bring the design landscape into focus, avoid low-payoff tangents, and keep every machine busy.

## Where we stand (R64)
- **v37 adopted** (R64, standing authorisation, 16 held-out growths, no task worse): deepURSx3 = v36 + cortex lr 0.1 + striatum predErr 0.3.
  Book 10k / 30k 0.325 / 0.324 (v36 0.316 / 0.313), fables4000 0.339, order3 0.964, text1000 0.758; seqchoice = v35 (the v36 order2 loss was the
  striatum's missing prediction-miss LTD). v36 = plan deepURSx3v36.
- **Size pays** once the wiring scales with the grid: 4xS book 0.346 / 0.349 (+0.030 / +0.036 vs v36 1x, 15/16), 2xS 0.337 / 0.337. The scale-up
  track is now the main track. But **8x does not scale yet**: proliferation (and likely other step-counted growth) stops at ~15k cells (22k with
  pDiv 1) and 8xS scores below 4xS on the box. Cost: 4xS ~17x a 1x growth, 2xS ~2.5x.
- Rule knobs: lr is the only one that wins all 5 tasks; every consolidation-loosening knob (metaCap, metaN, preNorm) buys book / fables with an
  order3 loss. The gap to the 0.40 readout ceiling is now ~0.075 at 1x and ~0.05 at 4xS (v36 rule).
- Space bias: unchanged by every rule knob (boundary precision 0.30-0.33); size raises it to 0.32-0.36. Output-side fixes exhausted.

## Ranked open questions (R64)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I78 | Does the size gain hold on every task under v37 (4xS / 2xS on the 5-task screen), and does it grow with life length (4xS / 2xS at 100k)? | y03a/b, y05, x17a/b, x16a/b (x19 v36 gate tasks running) |
| 2 | I77 / I79 | Does the rate keep paying above 0.1 (cortex lr 0.15 / 0.2), and do plateau 6 / metaCap 100 / metaN 80 / tauPre add on top of v37? | y02, y04, y07 |
| 3 | I80 | Make growth scale past 4x (proliferation / growth time counted in developmental steps): code + box diagnosis, then an 8xS point | code (no job yet) |
| 4 | I72 | Generation: 4xS at 30k (x14 running), 1x at 100k (x15) | x14, x15 |
| 5 | I73 | Life length under v37 (v36: 10k = 30k = 100k) | y06 |
| low | I75 / I76 | space bias via output / homeostasis, mixing-code knobs: exhausted | none |
Decision point (for Travis): if y03 shows v37 4xS >= v37 1x + 0.02 on book with no task worse, and x17 shows 4xS still climbing at 100k, propose the
staged large run on linux-pc: v37 at 4xS (8x only after I80), 100k -> 300k -> 1M symbols with checkpoints + generation samples. Do not start it
without Travis.

## Worker notes (R64)
linux-pc: supervised since ~1:39 PM CT Oct 18 (R61d, code 29978cd), heartbeats + 30-min claim renewals, one job at a time (the old double process
is gone). tacobell: supervised, cpuMax 75, 4 parallel runs, no claims on battery. Its old local queue stays retired.

## Previous status (R63)
### Where we stood (R63)
- v36 (book ~0.31-0.32) is still a bigram-level learner; its own states support 0.40 (linear readout) and 3-grams reach 0.43-0.52.
- Life length does not help under v36 (10k 0.316, 30k 0.313, 100k 0.314); depth x4 = x3.
- **Size was never tested properly**: sc.grid alone shrinks axons relative to the sheet (coneSpeed / axonLen are in grid steps), so the old
  2x lost and 4x went silent. With wiring scaled to the grid, a 4x brain beat 1x on a box smoke test (3.43 vs 3.33, 1 growth). x01 / x02 decide it.
- Output-side space-bias fixes (readIn > 0.01, readTicks, rcvHomeo 0.02-0.05) and mixing-code knobs (mixHomeo, mixLr, mixK) are ruled out.
- v36 may hurt reward-coupled seqchoice order2 (-0.055 vs v35, t -2.5): x12.

### Ranked open questions (R63, shared jobs x00-x19)
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I78 / I73 | Does size pay once the wiring scales with the grid (2xS / 4xS vs 1x at book 10k / 30k)? Decides the large-brain run | x01a/b, x02 (+ x19 gate tasks) |
| 2 | I77 | Which teacher-rule knob of the cortex cells moves book toward 0.40 without hurting order3 / fables / text (5-task screens, adoption-ready) | x03-x08, x10, x11, x18 (x00 = worker reference) |
| 3 | I75 | Space bias through trust / sharpness weighting and very weak homeostasis at a realistic target rate | x03, x07, x09 |
| 4 | Q31 | Is v36 really worse on seqchoice order2, and is it metaCap or predErr 0? | x12 |
| 5 | I72 | Generation: 4xS brain at 30k, 1x at 100k (sampling T 1 / 0.7) | x14, x15 |
| 6 | I73 | Size x length: 2xS / 4xS at 100k | x16a/b, x17a/b |
| low | I76 | mixLr 0.005 confirmation (book30k +0.003) | x13 |
Decision point: if 4xS (or 2xS) beats w13 by >= 0.01 on book30k, scale-up becomes the main track: propose a staged large run on linux-pc
(4xS-8xS, best rule, 100k -> 300k -> 1M symbols with checkpoints and generation samples); do not start it without Travis. If a rule screen
wins on book30k and book10k with no task worse, it is adoption-ready (16 growths) and goes to Travis / the authorised default rule.

### Worker notes (R63)
linux-pc publishes results but has no heartbeat (pre-R61 dq.js, not under the supervisor) and runs two worker processes under one name
(two jobs at a time). When someone is at the PC: `sh run/install-linux.sh linux-pc`
(systemd user service + linger, self-updating). tacobell: supervised, cpuMax 75, no claims on battery.

## Previous status (R62)
### v36 adopted (R62, Oct 17, 11 PM CT, Travis approved)
R62 found the book weakness is the **learning rule, not the representation**: an offline linear readout of v35's own states predicts the
next letter at 0.40 held-out (bigram 0.31, 3-gram 0.43), while v35 got 0.27 at 10k and fell with life length (0.15 at 100k): decoder ties
(~30% of predictions), and a metaplastic potentiation scale that fades to 0 while the prediction-miss LTD does not. **v36** = deepURSx3 with
predErr 0 + pl.metaCap 200, graded decoder readIn 0.01 (seq recommend): book30k 0.229 -> 0.313, book10k 0.271 -> 0.316, 100k ~0.30, no task
worse (16 growths; RESULTS R62). v35 = plan deepURSx3v35 (+ readIn 0), legacy/v35. The w01-w12 numbers are v35 / predErr-dose numbers;
the still-pending w08-w12 were pinned to deepURSx3v35 + readIn 0 (same meaning as written) and moved to priority 0.6.

New ranked questions (shared jobs w13-w26, all v36, 16 held-out growths in 4-growth runs):
| rank | id | question | jobs |
|---|---|---|---|
| 1 | I73 | Does size / depth / length pay under v36? 2x and 4x cells, deepURSx4, 100k life, vs the v36 reference | w13 (ref), w14, w15a/b, w16a-d, w17, w18a/b |
| 2 | I75 | Space bias (62% space predictions vs 20%): output-side fixes that keep book30k (readIn 0.03 / 0.1, readTicks 6 / 8, rcvHomeo 0.02 / 0.05) | w19-w21 |
| 3 | I76 | Stable letter-pair codes (98k codes for 410 pairs): mixHomeo 0.05 / 0.15, mixLr 0.005 / 0.02, mixK 3 / 5 (book30k + fables4000) | w22-w24 |
| 4 | I72 | Generation under v36 (argmax / sampling after a 30k life) | w25 |
| 5 | Q31 | seqchoice safety of v36 (seqchoice defaults to deepURSx3, not in the R62 eval) | w26 |
Decision point: if 2x / 4x / x4 beat w13 by >= 0.01 on book30k, propose the large run; otherwise keep working on the rule (I75 / I76).

## Yardstick: the real corpus (I66, `source:'book'`, js/envs/book.js)
13 public-domain Gutenberg books in simple English (Alice, Grimm, Andersen, Aesop, Peter Pan, Wind in the Willows, Oz, Secret Garden, ...),
reduced to 24 symbols (" .abcdefghiklmnoprstuvwy": lowercase, q->k, x->ks, z->s, j->g, sentence punctuation -> '.').
3,289,087 training characters and 172,269 held-out characters (the last ~5% of each book, never streamed in training).
A life streams `nSyms` TRAIN characters from a random start, so any length works (10k, 100k, 1M) without loops. The last `evalSyms` come from HELD,
and the fitness is **10 x held-out accuracy** (teacher forced). `genSyms` + `run/gen.js` free-run the brain on its own output (I72).
Node/Termux only (3.4 MB file, not loaded by index.html). Old envs are bit-identical (perf/verify.js 10/10, test_core ALL OK).

Offline n-gram held-out accuracy on the same split (what a brain would need to beat):

| context chars | 0 | 1 (bigram) | 2 | 3 | 4 | 5 | 7 |
|---|---|---|---|---|---|---|---|
| held-out accuracy | 0.196 | 0.301 | 0.424 | 0.521 | 0.581 | 0.609 | 0.597 |

Early box numbers (book 10k with eval 2000, 2 growths): v35 0.270, v34 0.273, 2x brain 0.277, x6 0.281 (rejected), 0.5x 0.02 (sc.grid < 1x is broken).
All are **below bigram** (0.301), and 3k lives reach 0.295. Generation: argmax gives only spaces; sampling (genTemp 1) babbles in "the/and/to" style,
with train-vocabulary words 0.47 vs 0.98 for real text and trigram bits 5.65 vs 2.48.
So far the brain is a weak bigram learner on real text, and scale has not yet been shown to help. Questions (b) and (c) decide everything else.

## Ranked open questions

| rank | id | question | why now | jobs |
|---|---|---|---|---|
| 1 | (c) Q32 / I70 | **Stability-plasticity rule**: does predErr 0.1 (peMode 16, peFix 0.01) keep v35's gains while restoring long-gap memory, on every task including the real corpus? | fables4000 +0.038 and fables8000 +0.074 vs v35 (R60). It is the only adoption candidate. Defaults change only after 16+ held-out growths with no task worse (t < -2) and Travis's approval | PC q46-q57 (old tasks); shared **w01-w03** (book 10k / 30k, 16 growths) |
| 2 | (b) I73 | **Scaling curves on the real corpus**: does held-out accuracy rise with brain size (1x / 2x / 4x cells) and with depth x3 vs x4, at fixed life? | Nothing else matters if size does not pay. Deeper x6/x8 and slow layers are rejected (lose on long fables); x4 is the only depth still in play | shared **w04-w06** |
| 3 | (b') I73 | **Length curve**: 3k / 10k / 30k / 100k symbols. Does a longer life keep improving held-out accuracy (an LLM-style data-scaling curve), or plateau near bigram? | Long runs are only worth it if the curve keeps climbing | shared **w03, w07** (+ phone slices w09) |
| 4 | (g) | **Engine throughput**: a 2x brain costs ~3x the time (129 s/growth at 10k on the box). A large-brain text run needs >= 10x speed (sparse event-driven updates, typed-array hot loops, worker threads per region) | Has to be paid before a large run; perf/ already has the harness | code (no job yet) |
| 5 | (e) I72 | **Free-running generation**: does the generated text get more word-like with size, length and rule? Metrics: train-vocabulary word rate, distinct 4-grams, copying (8/16-grams verbatim in TRAIN), trigram bits/char vs real held-out text | The goal is generation; teacher-forced accuracy may not track it | shared **w08** (+ phone w10) |
| 6 | (d) | **Long-gap memory**: fables second and third pass (fables8000/12000) and book held-out at 30k/100k | Mostly covered by (c) and the length ladder | PC q47/q50/q53/q55 |
| 7 | (f) I71 | **Passive-then-active**: predict silently first, gate LTD and output by confidence, act later | Travis's hunch. Needs code; after (c) settles the LTD dose | code later |
| low | - | analogy / renaming (relabel), evolution of genes, critical periods, racing | Renaming winners (peFix 0.2, predErr 1.0) cost heavily on fables; evolution failed at gen 0 (q33/q45); racing is not worth it | none new |

Rejected (R60): deeper chains x6/x8, slow context layers, sc.grid < 1x, renaming-tuned rules (v07: fables2000 2.225 / 2.792 vs ~2.8).

## Numbering
Shared jobs on the `queue` branch use the **w** prefix (w01...). The PC's local queue has q46-q57 (PR #6). Ideas: I66 = corpus (now built),
I70 = dose, I71 = passive-then-active, I72 = generation, I73 = size scaling. The book source is part of I66; run/gen.js implements I72's test.

## Rules (unchanged)
Code goes only to `neuro/distributed-queue` and jobs only to `queue` (never main). Jobs never need unpushed code. Defaults change only after
held-out evaluation (16+ growths, no task worse at t < -2) and only with Travis's approval.

## Next decision point
If w04-w07 show held-out accuracy rising clearly with size (2x > 1x by >= 0.01 and 4x > 2x) or with length (30k/100k > 10k), propose a long
large-brain run on linux-pc (4x-8x cells, x3 or x4, the best rule, 300k-1M-symbol life with checkpoints and generation samples). Do not start it without Travis.
If neither helps, the engine is the bottleneck: work on the learning rule and representation (the n-gram gap from 0.30 to 0.52), not on size.
