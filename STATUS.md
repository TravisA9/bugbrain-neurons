# Size sweep STATUS (box, /workspace/sweep, code 60fbb2c8, v47 defaults, all R118-R120 flags off)
- 12:55 CT: clone + probe (sw/probe.js, wraps net.step on the instance only; 1x g5 score 0.969 identical to unprobed run). No core edits.
- NOTE: test_core block 2 passes {source:'order3',K:8} through recommendedEnvParams(...,['source']), which keeps only `source` -> the test actually runs K=4 (4 outputs). Main sweep = exact test_core config (K4); second pass K8 (as the brief said).
- 12:56 CT: started detached sweep: sw/run_sweep.sh 4 then 8 (8 sizes x si 0/1 x 8 seeds, 4 parallel). Outputs sw/out/*.json, logs sw/logs/.
- 12:59 CT: K4 sweep 32/128 done. Queued after it: decomposition (sw/jobs_decomp.txt: si=0 + one scaleInvariant component each [trophMin/f, sizeCone, divRep/divReach, net-level budgets, thinF], and si=1 without trophMin/f; sizes 2/2.5/3/4 x 8 seeds), then K8 sweep.
- 13:00 CT: K4 sweep done (128 runs). Decomposition running (fixed xargs quoting), then K8.
- 13:02 CT: K4 analysed (sw/ana_K4.md, sw/tab.js). Collapse = output orphaning at 2.5x+ (trophic deaths in ~205-cell quanta). Running growth-only trophic-margin probe (sw/troph.js via sw/load_diag.js: in-memory passive hook, core files untouched; 1x score identical 0.96875).
- 13:12 CT: FINDING 1 (trophic cliff): si=0 collapse starts at 2.5x (score 0.968 at 2x -> 0.582 -> 0.316 -> 0.156). Every afferent of an output gets the SAME trophic share 1/n (normE equalises weights); survival needs share >= trophMin 0.005, so an output whose growth-time fan-in n > 200 loses ALL its afferents at once (orphan). Margin share/trophMin = 2.43 at 1x, 1.91 at 1.25x, 1.66 at 1.5x -> crosses 1 between 2x and 2.5x. A weaker afferent subclass (~15/output, half weight) already dies at 1.5x (~55 deaths) without score loss.
- FINDING 2 (grid aliasing, NEW): fine sizes 1.05/1.15/1.2/1.25/1.35x leave one 9-input clock group (GO / goC) with NO targets in some region (devStats silentIn 9). 1.2x: goC unwired in all 3 context regions -> score 0.000 on 4/4 seeds; 1.25x: cortex GO group unwired -> 0.951. Cause: cell classes are horizontal bands 1-2 grid rows thick (clock relays = exactly 1 row at 1x); a non-integer grid rescale changes the sampling phase. sw/bands.js, sw/inwire.js, sw/scan.js. Fine-scan running (seed 5).
- 13:22 CT: resumed after interruption. Decomp trimmed to sizes 4 and 2.5 (sw/jobs_decomp2.txt) for time; K8 trimmed to 1/2/2.5/3/4 x 4 seeds (sw/jobs_K8.txt). troph si0 + scan si0 still running.
- 13:23 CT: DECOMP 4x (K4): si0 + trophMin/f alone = 0.969 (6/6 seeds, 0 orphans) vs si0 0.156; + sizeCone 0.167, + divRep/divReach 0.000, + net budgets (recvBudget 3, postCapRel 1.5, trophic 24, mixInhRef) 0.164, + thinF 0.196; si1 0.948 but si1 with trophMin restored to 0.005 -> 0.000 (5/5). => the collapse is entirely trophMin. sw/decomp_tab.js. Running si1 growth check at aliasing sizes (sw/scanL.js).
- 13:34 CT: si=1 growth at 1.05/1.15/1.2/1.25/1.35x: SAME unwired clock groups as si=0 (scaleInvariant does not touch the fate map). Fine scan si0 g5 (stopped at 2.75x to free CPU): aliasing also at 1.7x; first orphan output at 2.4x when growth fan-in/output ~235.
- 13:38 CT: runner wait-loop bug (pgrep matched itself) lost ~15 min; restarted decomp(4x,2.5x)+K8 runner. troph si0 finished (sw/out/troph_si0_*.json).
- 13:49 CT: report drafted at sw/REPORT.md; K8 pass running.
- 14:01 CT: K8 analysed (mixing-layer inhibition causes the K8 loss from 2x; si=1 mostly fixes). Report final in sw/REPORT.md. Remaining K8 runs finishing detached; nothing else queued.

## R122 relGrowth (14:09 CT): branch relgrowth from origin cursor/hidden-rep fc2bcacc. Plan: implement P.relGrowth (trophic alpha/n, mixInh pool-relative, stripe min width), bit-identity + test_core, then sweeps K4/K8, 1x cross-task cost, book scaling.
- 14:14 CT: implemented P.relGrowth (develop.js trophic fair-share OR-rule alpha 0.5, fixed morphogens on 1x lattice, ceil cone; net.js mixInh pool). Smoke K4 g5: 1x identical 0.969; 1.2x 0.000->0.956 (silentIn 0); 1.25x 0.963; 2.5x 0.969; 4x 0.963; K8 4x g11 0.869. test_core + spikefoundry running (sw/logs/test_core.log, sf.log).
- 14:15 CT: launched size sweeps (sw/jobs_r122.txt, 400 probe runs, P=3: relGrowth arm K4+K8 x 12 sizes x 8 seeds, then si0/si1 baselines for bad sizes and K8). Prepared sw/jobs_reg1x.json (1x cross-task, os vs os+relGrowth, k2951-2953) and sw/jobs_book.json (book10k 2x/4x) for after test_core.
- 14:43 CT: test_core ALL OK and all 10 spikefoundry tests PASS with relGrowth code present (flag off). Sweep 139 runs done (log lines). Launched 1x cross-task reg (sw/out/reg1x.jsonl, P=1).
- 14:55 reg1x 2951: os_rg == os on all 7 tasks (identical, matches hr2 ref); killed rest (1x is identical by construction). Launched decomposition sw/jobs_dec.txt (4x g11/51/64/5 x relGrowthOff 1/2/4/8, P=1) -> sw/logs/dec.log
- 15:01 resumed. Origin now afed1aba (R122 granFatigue) -> rename this work R123, rebase at commit. dec so far 4x: rgOff1(trophic off) all die (0.00-0.03) -> trophic part essential; rgOff2(lattice off) g11 0.963 (vs 0.794 rg) -> lattice snap hurts g11 at 4x. Sweep 266/360.
- 15:16 dec: rgOff2 (no lattice snap) 4x g5/11/51/64 all 0.963; rgOff4 (cone) g11 0.794 unchanged. FIX: lattice (b) now nested lattice grid1*floor(GS/grid1); no snap when grid is exact multiple (4x). Only f>=4 behaviour changes. Moved old 4x rg outputs to *_rgold.json; rerunning 4x rg K4+K8 (sw/jobs_rg4.txt) after sweep.
- 15:20 K8 (cmp.js 8): rg > si0 at all sizes, ~si1 up to 2x (2x 0.875 vs si1 0.841), but 3x rg 0.795 < si1 0.875. Lead: 1x-lattice snap at 3x (ratio 1.73). Queued sw/jobs_3x.txt (3x K4+K8 rgOff2=no snap, 8 seeds) after rg4. Note: dec 4x rgoff4/8 runs after 15:14 use new code (no snap at 4x).
- 15:30 queued book scaling (sw/jobs_book.json: os 1x k2952/2953 + os_2x, os_2x_rg, os_4x_rg, os_4x_si x k2951-2953; out sw/out/book.jsonl seeded with reg1x rows) to start P=2 when the size sweep ends.
- 15:27 (note: the 15:16/15:20/15:30 stamps above were early by ~10-15 min). dec 4x rgOff8 (new code: no snap, no mixing scaling) g5 0.963 g11 0.969 g51 0.969. Sweep 316/360.
- 15:45 lattice fix v3: GRN reads snapped fields (nested lattice), growth cones keep smooth fields. Probes: 3x g11 0.806->0.950, 1.2x g5 0.963 silentIn 0, 1.7x g11 0.969 silentIn 0. Old rg outputs (sizes != 1,4) renamed *_rgv1.json; rerunning rg arm (sw/jobs_rgv3.txt, 160 runs, P=1). Book10k so far (k2951): os 4.535, 2x_rg(v1 code) 4.405, 4x_rg 4.465, 2x 4.045, 4x_si 4.605; k2952 os 4.38, 2x_rg 4.825. 2x_rg book must be rerun with v3 code.
- 15:51 resumed (3rd). All runners alive: rg4 7/16, rgv3 13/160 (P=1), book reg (3 left). Killed 3x-rgoff2 chainer (superseded by v3). Queued sw/jobs_book3.json (book10k os_2x_rg3 v3 code x3; book30k os_4x_rg x3, os_4x_si x3; ref 1x book30k from /workspace/hr2/os30.jsonl: 2951 .4765, 2952 .4735, 2953 .475) -> sw/out/book3.jsonl P=2 after book reg. Units: r42 mean = 10 x heldAcc (held-out next-char accuracy on 2000 held symbols).
- 15:52 rebased: branch relgrowth = afed1aba + 871391c5 (R123 WIP; amend at end). sw/bump.sh: after rg4 -> sw/tests.sh (test_core -> sw/logs/test_core2.log, spikefoundry -> sw/logs/sf2.log), then rgv3 to P=2.
- 16:05 book10k (heldAcc, paired vs 1x os .454/.438/.439): 2x_rg(v1) +.013? mixed 1+/2-; 4x_rg -.007/+.027/-.088 (2953 collapse .351); 2x -; 4x_si +.007/+.050/+.007 3+/0-. Lead: rg lacks si's learning-rate/budget scaling -> new arm os_4x_sirg (si+rg). sw/rebook.sh swaps queue to sw/jobs_book4.json (2x_rg3, 4x_sirg book10k, book30k 4x_si then 4x_rg) after 2 book3 rows.
- 16:19 book10k 4x_sirg k2951 == 4x_si exactly (4.605, same bits/hidden): at exact 4x si already contains every rg effect, so the 4x_si>4x_rg gap is si's plasticity/budget scaling (lrF8/16, postCap, recvBudget, divRep/Reach), not growth. Killed redundant sirg runs; new queue sw/jobs_book5.json: book30k 4x_si x3, book10k 2x_si x3, 2x_sirg x3 (P=2). Dropped book30k 4x_rg (rg-only 4x lost on book10k 2/3).
- 16:19 queued sw/jobs_sirg.txt (si+rg probe: K8/K4 x 1.2,1.35,2.5,3 x 4 seeds) after rgv3.
- 16:29 on rebased tree (afed1aba + R123): test_core ALL OK EXIT 0 (sw/logs/test_core2.log, incl. new R123 check), spikefoundry 10/10 PASS (sw/logs/sf2.log). rgv3 66/160 at P=2.
- 16:40 resumed (4th). Alive: book5 reg (book30k 4x_si 2951/2952 done), rgv3 81/160 P=2, sirg chainer (trimmed to K8 16 jobs). Box is slower (other job).
- 16:40 K4 rgv3 complete (cmp.js 4): rg 0.951-0.966 at every size 1-4x incl 1.2x (si0/si1 0.00); min>=0.95 except 4x one seed 0.90. Book30k 4x_si: 2951 .475 (-.0015), 2952 .528 (+.0545).
- 16:54 book30k 4x_si done: -.0015/+.0545/+.001 (2+/1-, mean .493 vs .475; only k2952 moves). book10k 2x_si 0/3 (-.056/-.031/-.006); 2x_sirg k2951 .452 vs 2x_si .398. rgv3 124/160. sirg chainer re-made (starts when rgv3 log says ALL DONE, P=2).
- 17:06 rgv3 done (K8: rg 1.05-2.5x 0.87-0.92 vs si0/si1 0.00-0.86 at awkward sizes; 3x 0.809, 4x 0.818 < si1 0.875/0.901). sirg K8 (4 seeds): 1.2x .909, 1.35x .917, 2.5x .908, 3x .803 (si1 .875). Testing 3x K8 si+rg with snap off (sw/jobs_sirg2.txt, P=4). book10k 2x_sirg .452/.489/.380.
- 17:13 box memory tight (avail 2 GB, other job); sirg2 stuck on 3 GB guard -> rerun sequentially with 2 GB guard.
- 17:19 sirg2: 3x K8 si+rg with snap off = si1 exactly (.844/.906/.912/.838) -> GRN snap costs at 3x. Rule v4: snap only while GS < 1.5*grid1 (sizeF < 2.25; failures were all <= 1.7x). Old 2.5x/3x rg outputs -> *_rgv3.json; rerunning (sw/jobs_rgv4.txt, 32, P=3; mem guard 2 GB).
- 17:32 part 2 prepared: sw/bookdiag.js (per-region rate, output drive gran vs other, granule pool stats, NLMS step/input power, heldAcc); jobs sw/jobs_bd.txt (k2951/2952 x os1x, os2xsi, os2xrg, os1x_g64, os2xsi_g64) via sw/bdrun.sh P=2 after rgv4.
- 17:40 rgv4 done (K4 2.5x/3x .966/.959; K8 .855/.809). test_core ALL OK + spikefoundry 10/10 PASS on final code. Committed 8a472feb (amended R123, RESULTS entry, run/r123 tools) on afed1aba; bundle relgrowth.bundle (afed1aba..relgrowth). Part 2: bookdiag 2951 os1x .4535 / os2xsi .3975 / os2xrg .435 (harness reproduces r42 exactly). 2x_si: context-region rates 1.5-4x higher, granule rate 3.3x, active granules/event 10.2 vs 4.2, NLMS step 0.38 vs 1.12, recruits 1374 vs 3923.
- 17:48 bd so far: heldAcc tracks context activity / active granules: 2952 1x ctx rates .049/.043/.041, active gran 10.5, step .077 -> .438; 2952 2x_rg ctx .025, active 4.2 -> .4845; 2951 2x_si ctx .039/.08/.10, active 10.2 -> .3975; granN 64000 at 1x 2951 +.0045 only. Queued sw/jobs_bd2.txt (lag-column rates gu.cr; granExactGuard=2 causal test on 2952 1x, 2951/2952 2x_si).
- 18:00 KEY: 2952 1x has a stuck-on lag column (source 1 col 5 window rate 1.00; source 3 col 5 .50). granExactGuard=2 on 2952 1x: .438 -> .4605, active gran 10.5 -> 5.6, NLMS step .077 -> 1.27. 2952 2x_si: ctx rates .10/.14/.18, active gran 39.4, step .0074 -> .407. granN 64000: +.0045 (2951 1x), +.009 (2952 1x), +.0095/+.008 (2x_si): capacity not binding. Waiting os2xsi_gd 2951/2952, os2xrgb 2952.
- 18:11 guard on 2x_si hurts (2951 .3975->.3745, 2952 .407->.3885): 4-13 saturated lag columns, dropping them loses the tuples -> broad context over-activity, not one stuck column. 2x_rg 2952 (ctx .025) .4845. Launched sw/jobs_bd3.txt (4x_si 2951, 4x_rg 2953 (book .351), 1x 2953) P=3.
- 18:22 bd3: 4x_rg 2953 (book .351) runs COLD (ctx .021, active gran 2.5, exact 84k vs 172k at 1x); 4x_si 2951 1x-like (ctx .038, act 4.2) .4605; 1x 2953 .4385 act 4.2. Both hot and cold lag columns hurt. Implemented P.lagHomeo (net.js, R124): per lag column log-threshold offset h += eta x (r_sc - r_0c), target = same letter's source-0 window rate (measured), clamp +-1, after 500 windows. PRE-REGISTERED: eta = 0.02, lagHomeoMax 1 (default), target as above; no tuning on the test runs. Tests: 1x cross-task (k2951-2953 x order3,K4,sc_order2,sc_cycle,text1000,fables4000,book10k; no task worse), book10k 1x/2x_si/2x_rg/4x_si x 3 seeds paired vs 1x off.
- 18:22 smoke 2952 1x 3k syms: lag column means -> .032/.028/.025 (target src0 .032), lhMax hit clamp. Launched sw/jobs_lh.json (book10k os_lh, 2x_si_lh, 2x_rg_lh, 4x_si_lh x3; then 1x cross-task x3) -> sw/out/lh.jsonl P=3.
- 18:36 PRE-REGISTERED lagHomeo eta .02 = strongly NEGATIVE: book10k heldAcc 1x .267/.283/.289 (off .454/.438/.439), 2x_rg .312/.386, 2x_si .356/.366. Smoke showed it drives lag columns COLD (active gran 2.9): target 'lag col rate = same letter src-0 rate' is too low (lag cells legitimately hit more windows). Killed rest of lh queue. Measuring natural lag/src0 rate ratios (lagHomeo=1e-9, inert) on healthy 1x 2951/2953, hot 2x_si 2951/2952, cold 4x_rg 2953, 2x_rg 2952 (sw/jobs_bd4.txt).
- 18:45 bd4 natural lag-source activity (columns active per window, sum_c r_sc): healthy 1x 2951/2953 + 2x_rg 2952: 0.94-0.99 (all 3 lag sources); hot 2x_si 2951 0.98/2.94/3.34, 2952 3.90/4.44/6.42; cold 4x_rg 2953 0.70/0.62/0.62 (book .351). v1 (per-column, src-0 target) kept as P.lagHomeoCol=1. v2 PRE-REGISTERED before any test: per lag source one shared log-threshold offset, target = 1 active column per window (one letter per lag), eta = 0.001 per window (slower than the 1000-window rate sensor), clamp +-1, warm-up 500. Same test plan.
- 18:55 lh2 early: 2951 1x .457 (+.003), 2x_rg .442, 2x_si .401; 2952 1x .278 (off .438) -> v2 NEGATIVE on 1x (fails no-task-worse already). Letting the 12 book10k arms finish, then killing the cross-task part (sw/out/lh2.jsonl).
- 19:05 lh2 book10k (heldAcc): 1x .457/.278/.417 (off .454/.438/.439); 2x_rg .442/.474/.444; 2x_si .401/.448/.390. 2952 1x diag: offsets src2/3 at -1 (thr lowered) yet their window activity fell to 0.29/0.27 (src1 raised .74 -> .47): activity is non-monotone in threshold for these cells -> threshold homeostat cannot hold the target. Running test_core/spikefoundry on current code.
- 19:12 lagHomeo v1+v2 REJECTED (negative; 4x_si_lh2 .463/.488/.445 ~= off). Implemented P.lagWTA=k (R125, net.js guExact): k-WTA on lag-cell output to granule claws: per read window only the first k columns of each lag source (s>=1) to fire count (latency WTA; NOT a network inhibitory pool). PRE-REGISTERED before testing: lagWTA=1; prediction: hot 2x_si improves toward 1x, cold 4x_rg 2953 unchanged, healthy ~unchanged. Tests: book10k 1x/2x_si/2x_rg/4x_si x3 + 4x_rg 2953, then 1x cross-task x3 (sw/jobs_wta.json -> sw/out/wta.jsonl, P=3).
- 19:23 wta early: 1x .454/.377/.441 (off .454/.438/.439) -> 2952 (stuck-on src1 col5, rate 1.0) loses .061: the stuck column fires first every window and wins. 2x_rg .435/.484 (= off), 2x_si 2951 .404 (+.006). Pre-registered lagWTA=1 fails no-task-worse on 1x. Finishing 13 book10k arms, cross-task skipped.
- 19:42 lagWTA=1 final: book10k 1x .454/.377/.441 (off .454/.438/.439); 2x_si .404/.391/.424 (off .398/.407/.433); 2x_rg .435/.484/.421 (= off); 4x_si .461/.488/.446 (= off); 4x_rg 2953 .351 (= off). Short tasks done (2951 all 6, 2952 order3/K4/sc x2, 2953 order3/K4/sc x2) identical to base. REJECTED (2952 1x -.061). Running final test_core + spikefoundry.
- 19:53 test_core failed only on my over-strong 'lagHomeo inert in warm-up' assertion (creating thr array changes the path); relaxed to off bit-identical + on runs; rerunning -> sw/logs/test_core3.log. spikefoundry 10/10 PASS on final code.
- 20:07 test_core3 ALL OK (R123/R124/R125 checks), spikefoundry 10/10 PASS. Committed R124/R125 negatives on 8a472feb; bundle refreshed.
- 20:07 PRE-REGISTERED P.fanInBudget=1 (with P.relGrowth=1): per region, a 1x reference growth (same genome, same seed, sizeF=1) gives each hidden cell type's mean in-region fan-in B_t (incl. env inputs; tracts/claws untouched). At sizeF>1, if the type's mean n_t > B_t, each cell keeps its strongest-|w| ceil(n_i x B_t / n_t) inputs (proportional cut, so type mean ~ B_t and the distribution shape is kept), done after synapse placement and before normE/normI, which re-normalise the kept inputs. No-op at 1x. Selection: strongest (largest |w| at growth). Tests: fan-in flat 1x/2x/4x; K4/K8 sweep 4 seeds (1,1.2,2,2.5,3,4); book10k 1x/2x/4x x3 paired vs 1x; 1x identical by construction.
- 20:09 fan check f=2 g5 K4 (in-region hidden fan-in): rg cortex 158.4 ctx 42.8/44.7/43.5 -> fib 95.9 / 25.5/25.4/24.2 (1x 90.7 / 25.6/24.7/23.3): flat in-region; incl. tracts still grows (ctx 34.8 -> 47.7 at 2x) because tracts are outside the registered budget. Launched book10k fib (2x,4x rg+fib x3, sw/out/fib.jsonl, P=2) and probe sweep sw/jobs_fibp.txt (K4/K8 x 4,2,1.2,2.5,3 x 4 seeds, P=1).
- 20:21 fanInBudget v1 (as registered) COLLAPSES: 4x K4 g5/11/23/37 and K8 g5 all 0.000. Cause: 'strongest |w|' over all inputs drops every inhibitory input (raw I weights are weaker before normI): 4x cortex inhibitory in-degree 4.5 -> 0, 19% cells always-on, runaway 21% of substeps. Killed v1 runs (moved to sw/out/fib_v1). v2 PRE-REGISTERED (selection-rule fix, same budget principle): separate excitatory and inhibitory budgets per type (B_tE, B_tI from the 1x reference), strongest within each sign; everything else as v1.
- 20:22 v2 fan check f=2 g5: in-region cortex 96.0, ctx 25.9/25.8/24.6 (1x 90.7/25.6/24.7/23.3). Relaunched book10k fib (P=2) and probe sweep (P=1) with v2.
- 20:30 v2 results so far: book10k 2x_rg_fib .213/.237/.269, 4x .021/.045 (1x .454/.438/.439) -> strongly NEGATIVE. Probe 4x K4 .925/.906/.919/.869 (rg ~.96), K8 .694/.662/.656 (rg ~.82). Running bookdiag fib2x 2951 (with inert lagHomeo to log lag-column rates).
- 20:35 fib2x bookdiag 2951: context regions SILENT (rate .0017 vs .025), 0 lag columns/window, 0 exact granules -> readout cortex-only .2135. Book10k v2 final: 2x .213/.237/.269, 4x .021/.045/.031. Probe: 4x K4 .87-.93, K8 .66-.69; 2x K4 .96-.98, K8 .70; 1.2x K4 .96-.97, K8 .90-.92. Finishing 2.5x/3x at P=3.
- 20:36 context afferents seed5 (perCell): 1x env.5 tract9.3 inE22.0 inI3.1; 2x rg env.63 tract22.2 inE36.7 inI5.5; 2x rg+fib env.63 tract22.2 inE21.8 inI3.5 -> env inputs untouched, post-norm totals similar; silencing mechanism not pinned down beyond that
- 20:45 fibp done (40). 2.5x K4 .969/.944/.969/.969 K8 .700/.706/.706/.700; 3x K4 .875/.956/.894/.887 K8 .681/.662/.688/.681 (seeds 5/11/23/37). Fan 4x s5 in-region rg cortex 401 ctx 74.5/82.2/76.3 -> fib 76.1 / 25.5/24.7/23.7 (flat). Running tests.
- 20:46 RESULTS R126 written, run/r126 data copied
- 20:53 RESUMED. test_core running (R126 block ok). Started sw/fibdiag.js mechanism probe (k2951 2x rg vs rg+fib, book1k, static afferent classes + per-class drive)
- 20:56 test_core ALL OK (EXIT 0), spikefoundry 10/10 PASS. R126 committed 30d36c69, bundle refreshed.
- 21:05 fibdiag v1 (context only): fib lag cells (src2/3 in context/context2) 0 spikes; their E inputs = sameCol recurrence 5.6 + in-region non-column E 6.7 (rg) -> 0.88 (fib); post-norm E total equal (45). nonCol context cells in fib get drive only from env (otherColCell/inRegion drive 0). Rerunning with all hidden regions (rg2xA/fib2xA).
- 21:15 MECHANISM found (fibdiag, k2951, 2x, book1k): lag-1 column cells (cortex) E afferents 1x sameCol 3.39 + prevSrc-same-letter 2.35; 2x rg 8.49 + 3.40; 2x fib 6.27 + 0. Feed-forward weights are 0.986x the recurrent ones (constant genome margin), so strongest-|w| keeps the recurrent loop and deletes the whole feed-forward letter path -> lag1 silent -> lag2/3 (context) silent (their in-region trigger E 6.7->0.9 too) -> 0 exact granules. Context in-region E: 1802/2781 cells have all-equal weights -> selection = index tie-break. Committing tools.
- 21:15 R126b committed be277210, bundle refreshed. DONE.
- 21:15 R127 pathBudget started: checking whether column pathways are distinguishable by presyn cellType at growth time

## R127 pathBudget — PRE-REGISTERED (21:2x)
- Flag P.pathBudget=1 (default 0, bit-identical, no RNG), with relGrowth, only sizeF>1. Pathway = (presyn hidden cellType, sign) into post cellType (letter col type16 -> lag type18 = feed-forward; 18->18 = own-column recurrence; other in-region types; inhibitory types). Each pathway held at its 1x reference mean count (proportional per cell, ceil). Selection RANDOM within pathway via deterministic hash(seed,pre,post) — never by weight. Env inputs, tracts, claws untouched.
- Predictions: lag-1 ff:rec count ratio ~.69 at 1x/2x/4x (rg: .40 at 2x); in-region fan-in flat; no hot/cold lag columns (~1 col/window per source); K4/K8 >= rg; book10k 2x/4x >= 1x paired.
- Tests: ratio+fan check 1x/2x/4x; K4/K8 sizes 1.2/2/2.5/3/4 x seeds 5/11/23/37; book10k 2x/4x x k2951-2953 vs 1x + bookdiag lag cols; 1x identical by construction (test_core check).
- 21:21 static check (k2951 growth, per lag-1 cell): ff/rec count ratio 1x .693; rg 2x .40, 4x .536; pb 2x .782, 4x .747 (ceil rounding of small counts lifts ff 2.35->3.0). Lag-1 E in-degree 1x 5.74; rg 11.9/25.9; pb 6.86/6.85. Context lag E 5.8 -> rg 12.3/25.0 -> pb 7.2/6.9; cortex nonCol E 124 -> rg 218/616 -> pb 126/142. Context nonCol E still grows (11->14.5->19.9) via tract column inputs (outside budget). Launched bookdiag pb2x/pb4x x3 (P=2, sw/logs/bd.log) and probes pbp (P=1, sw/logs/pbp.log).
- 21:32 book10k pb2x .4395/.442/.446 (1x .4535/.438/.4385); pb4x k2951 .4585. Lag-col stats need P.lagHomeo=1e-9 (cr tracking; heldAcc-identical) -> queued sw/jobs_pbcr.txt (pb 2x/4x x3 + rg comparators 2x 2951/2953, 4x 2951/2952). Probes 4x: K4 .938/.950/.944/.944, K8 .906/.900 so far.
- 21:42 book10k pb: 2x .4395/.442/.446, 4x .4585/.4075/.3985 (1x .4535/.438/.4385). Lag cols/window (src1-3) crpb2x 2951 .98/.98/.98, 2952 .99/1.46/1.47, 2953 .95/.95/.95. Probes so far: 4x K4 .938-.950 K8 .894-.906; 2x K4 .956x4 K8 .844/.887/.825/.919; 1.2x K4 .956-.969.
- 21:53 cr results: crpb4x 2951 .98/.98/.98 (.4585), 2952 .99/1.27/1.28 (.4075), 2953 .95/1.73/2.18 HOT (.3985); rg comparators cr2xrg 2951 .98x3, 2953 .93/.76/.92; cr4xrg 2951 .98/.96/.96, 2953 .70/.62/.62 cold. pb does NOT remove hot/cold: 4x 2953 flips cold->hot. Next: fibdiag k2953 1x vs pb4x (mechanism).
- 21:5x MECHANISM of remaining hot lag cols (fibdiag k2953 1x vs pb4x, book1k): lag cells' own in-degree/weights now match 1x (sameCol 3.95 vs 3.55, I 3.09 vs 2.58, lag-1 rate .038 vs .039) and feedback-inhibition loop structure identical (interneuron own-column share .5714 both). But context nonCol cells' TRACT (column) fan-in is outside the budget: 3.66 -> 11.55 (ctx), 3.52 -> 12.18 (ctx2), 2.22 -> 8.46 (ctx3); their rates .024/.025/.028 -> .027/.046/.068; lag-2/3 columns (triggered via in-region nonCol E) reverberate hot (.040 -> .067/.080, sameCol drive 1.0 -> 1.7/2.25). Lag-1 (triggered directly by src0 cols, in-region) stays healthy.
- Cheap confirmation queued: pathBudget + existing P.thinF=2 (claw/topo tracts keep ~S/f source cells at f x weight = tract budget, no RNG), book10k 4x/2x x3 with lag-col tracking (sw/jobs_pbth.txt, P=3).
- 22:06 RESUMED. pbth 4x (pathBudget+thinF=2): .455/.407/.3955, lag cols identical to pb4x (2953 still .95/1.73/2.18) -> thinF bit2 does not touch the inputs that grew. 2x pbth running. Inspecting which tracts feed context nonCol cells.
- CORRECTION: the tract into context cells is already a clean pathway. Every arrival cell gets exactly 1 source column (1x and 4x) at constant total weight 29.8 (cortex 2 cols, 60.0); only the cells per source column grow (5 -> 19, weight w/S each). "otherColCell 3.66 -> 11.55" was edges, not pathways or drive. thinF=2 only re-thins S at constant total -> no effect (pbth4x = pb4x). Tract budgeting is moot; extending pathBudget to tracts is not needed (nothing to cut at the pathway level).
- Remaining failure: lag-2/3 columns (context regions) reverberate hot at 4x for k2953/k2952 while lag-1 stays healthy. Column size 5 -> 19 with sameCol in-degree held ~3.9: near-complete (3.5/4) -> sparse (3.9/18) recurrence. Next: column-level stats (fraction of column firing when active, persistence) lag1 vs lag2/3, 1x vs pb4x.
- 22:11 pbth 2x = pb2x exactly (.4395/.442/.446; lag cols identical). thinF=2 = no-op on top of pathBudget (as the arrival analysis predicts). Running column stats (BB_COLSTAT, window = granule read window) 1x/pb4x k2953 + pb4x k2951.
- 22:16 MECHANISM (k2953 4x): hot = ONE stuck column per lag source (src2 '-9200' active 92% of windows, src3 '9200' 91%), not global heat. Those columns have no/low inhibition: src2 '-9200' 0 interneurons (0 I syn/cell), src3 '9200' 0.67 I/cell; interneurons per column 1x 1-4, 4x 0-13 (same in rg4x: the defect is from growth, not pathBudget; rg4x was cold overall, which masked it). Edge columns (topo +-0.92). Checking interneuron placement.
- 22:19 k2952 stuck columns are normally inhibited (1x '-5200' src1 90%, 3 interneurons; pb2x '9200' src2/3 45%) -> second, different failure type. Launched book30k pb 2x/4x x3 (P=2, sw/logs/b30.log; 2x met >=2/3 at book10k, 4x did not) + test_core/spikefoundry for R127 commit.

## R128 fateSnap — PRE-REGISTERED (22:5x)
- Mechanism found for k2953 4x hot lag cols: the edge column (topo -0.92, x 1.31-1.41) gets no interneurons at 4x: interneuron (type 20) stripe starts at x 1.425 (1x: 1.35, inside the column). This is an edge fate-discretization defect (relGrowth (b) snaps fates to the 1x lattice only below 2.25x).
- Flag P.fateSnap=1 (default 0, bit-identical, no RNG): with relGrowth, GRN fates read the 1x-lattice morphogens at every size. Tested with pathBudget.
- Predictions: every lag column has >= 1 interneuron at 2x/4x; k2953 4x stuck edge columns gone (cols/window ~1); book10k 4x >= pb4x (.4585/.4075/.3985). k2952 (normally inhibited stuck column) is NOT predicted to be fixed.
- 22:35 R127 committed c47564ca (test_core ALL OK, sf 10/10), bundle refreshed. book30k so far pb4x 2951 .4765 (1x .4765) 2952 .443 (1x .4735); pb2x 2951 .4615. fateSnap growth check running.
- fateSnap RESULT (growth only, k2953 4x): negative. Columns with 0 interneurons remain (src2 '-9200', src3 '-2800'). The type-20 stripe still starts at x 1.442. Not trophic either: relGrowthAlpha .2/.05 gives identical cells. Recorded deaths at the left edge are similar at 1x and 4x. At 4x the leftmost interneurons sit at local x -0.875 vs -0.95 at 1x, while column cells reach -0.99: a placement offset at the edge. fateSnap is kept off by default, documented negative.

## R128b colInh — PRE-REGISTERED (23:0x)
- Flag P.colInh=1 (default 0, bit-identical, no RNG; needs pathBudget; sizeF>1 only). Column = cells of one type with one topo label. If a column grew NO inhibitory afferents while its type has inhibitory pathways at 1x, its cells get the 1x mean count of each inhibitory pathway J->T from the NEAREST cells of type J (deterministic), and those J cells get the 1x mean count of T->J excitatory inputs from the nearest column cells. Weights = this brain's mean weight of the pathway; normE/normI follow.
- Predictions: no lag column with 0 interneurons at 4x; k2953 4x stuck edge columns gone (src2/3 ~1 col/window); book10k 4x k2953 > .3985; k2951 unchanged; k2952 (different failure) not fixed.
- 22:40 colInh growth check k2953 4x: src2 '-9200' 0 -> 3 interneurons (3 I syn/cell); src3 '9200' unchanged at 0.67 I/cell (partial, rule needs zero). book30k pb4x .4765/.443/.420 (1x .4765/.4735/.475), pb2x .4615/.4755/pending. Launched book10k colInh 4x x3 (crci4x).
- colInh v1 RESULT: negative. book10k 4x k2953 .3905 (src2 1.72 / src3 2.17, still stuck); k2951 .458 (unchanged). Mechanism, from fibdiag per-column life stats (BB_COLSTAT): the stuck column fires about every substep (rate .98/cell), sustained by its own recurrence (drive 24.7 vs 2.6 in healthy columns), and gets almost no inhibition (.03 per spike vs 2.25). Its 3 donated interneurons are silent (rate .0003). The termination circuit is a coincidence gate. Each column's interneurons get own-column E (5 syn, 16 of 28 after norm) plus a symbol-onset input (env class 2, 12 of 28). Threshold gap is 19.8, so an interneuron fires only when its column is active AND a new symbol arrives. That resets the lag column (the shift-register clock). Donated interneurons got only 8 of 28 from the stuck column (shared with their own column -8400), so they can never cross threshold.
- Other columns: k2951's edge column has 4 interneurons (1.74 I/cell) and is healthy. The failure is a column with NO dedicated reset interneuron.

## R128c colInh v2 (dedicated reset interneurons) — PRE-REGISTERED
- P.colInh=2: for a column of type T with no inhibitory afferents, take the K nearest interneurons (type J) from neighbouring columns. K = 1x mean J->T in-degree, rounded, and at most half of a donor column's interneurons. Rewire them fully to the orphan column: drop their T-type E inputs and their inhibitory outputs onto T cells. Give them E from the orphan column's nearest cells (the same count they had from their old column, same weights) and inhibitory outputs onto every orphan column cell (the old per-synapse weight). Their symbol-onset and other inputs are kept. Deterministic, no RNG.
- Predictions: k2953 4x src2 edge column no longer stuck (src2 ~1 col/window); src3 '9200' (0.67 I/cell, partial) may stay stuck; book10k k2953 4x > .3985; k2951/2952 within ±.005.
- 22:52 colInh v2 RESULT (k2953 4x, book1k colstat): src2 edge column FIXED (3 dedicated interneurons; activity .17 like 1x, src2 .902 cols/window = healthy); src3 '9200' (partial orphan: 1 interneuron, 0.67 I/cell) still stuck (.91), as predicted. heldAcc book1k .335 vs pb .32. book30k pb final: 4x .4765/.443/.420, 2x .4615/.4755/.4785 (1x .4765/.4735/.475).
- PRE-REGISTERED colInh v3 (P.colInh=3): v2 also for columns with < 0.5 x the 1x inhibitory in-degree per cell; donated K = round(1x pathway mean) - existing interneurons; existing kept. Predictions: k2953 4x src3 unstuck (~1 col/window); book10k 4x k2953 > .3985; k2951/2952 within +-.005 unless they have partial orphans.
- 22:53 colInh v3 colstat k2953 4x: src1/2/3 .902/.902/.900 cols/window (1x .90/.905/.887) -> stuck columns gone. Launched book10k ci3 4x/2x x3 (P=3).
- 22:58 ci3 book10k: 4x .455/.4055/.452 (1x .4535/.438/.4385 -> 2+/1-; k2953 .3985->.452, lag cols .95x3 healthy); 2x .4395/.4405/.446 (2+/1-). k2952 still hot (1.27-1.47) = the other failure type. Criterion met -> book30k ci3 4x/2x x3 launched (P=2).
- 23:01 ROOT CAUSE (growth): with relGrowth alone, division reach stays 1 site, so at 4x (lattice 2x finer) a clone spreads half the physical distance per step and the region's edge territory is reached late and fated differently (the interneuron stripe is inset by .117 at the left and .10 at the right). Growth-only check k2953 4x pb: orphan lag columns (0 inhibitory inputs) 1, weak columns (<1 I/cell) 3. With sc.divReach=2: 0 / 0. With divReach=2 + divRep=2: 0 / 0 (min 2 I/cell, as uniform as 1x).

## R129 rgDiv — PRE-REGISTERED
- P.rgDiv (default 0, bit-identical; only with relGrowth and sizeF>1): 1 = division reach = ceil(sqrt(sizeF)) lattice sites (the same physical spread per developmental step as at 1x); 2 = also divisions per step = ceil(log2 sizeF). These are si's two growth parts, tested here without si's plasticity/budget scaling. No post-hoc rewiring.
- Predictions: 0 orphan lag columns at 2x/4x for k2951-2953; with pathBudget, reproduces ci3 (book10k 4x k2953 ~.45, lag cols ~.95); no seed worse than ci3 by > .01. Choose rgDiv=1 if it is as good as 2 (fewer parts).
- 23:06 rgDiv growth check k2951-2953 x 2x/4x: 0 orphan / 0 weak lag columns for rgDiv 1 and 2 (rgDiv2 min 2 I/cell at 4x). Launched book10k rd1 4x, rd2 4x, rd1 2x x3 (P=1 next to b30ci P=2).
- 23:16 rd1 4x book10k .451/.489/.4465 (1x .4535/.438/.4385: 2+/1-, mean +.019); lag cols ALL healthy incl k2952 (.99x3)! rgDiv also removes the k2952 failure type at 4x.
- 23:27 rd2 4x book10k .4625/.4925/.447 (3+/0-, mean +.026 vs 1x) = best so far; lag cols healthy all seeds. Launched book30k rd2 4x/2x x3 (P=2).
- 23:36 rd 2x book10k .4535/.493/.4355 (1x .4535/.438/.4385: 1 tie/1+/1-), lag cols healthy (k2952 .99x3). Running test_core+sf for R128/R129 commit.
- 23:49 book30k rd2 4x .478/.526/.4765 (1x .4765/.4735/.475: 3+/0-, mean +.019); 2x .4745/.523/pending. test_core 2e/2f blocks fixed (type-18 columns); full tests running.
- 23:50 prepared cross-task jobs sw/jobs_xt.json (6 tasks x 3 seeds: 1x os for 2952/2953 + rd2 2x/4x; out sw/out/xt.jsonl, 1x 2951 from reg1x) and probes sw/jobs_rdp.txt (pb+rgDiv2).

## 00:10 Nov 18: R128/R129 committed 92cfb92c, bundle refreshed
- book30k rd2 2x .4745/.523/.4695 vs 1x .4765/.4735/.475 (1+/2-, mean +.0145); 4x .478/.526/.4765 (3+/0-, +.019).
- Running: cross-task sw/jobs_xt.json P=2 (sw/out/xt.jsonl); bdrun sw/jobs_abl.txt P=1: abl_rgrd2_4x (rg+rgDiv2, no pathBudget) x3, rd2_8x k2951/2952, abl_genes_4x (sc.divReach=2,divRep=2 only, no relGrowth) x3.
- Pre-registered predictions: rg+rgDiv2 without pathBudget fixes columns but loses some heldAcc at 4x (pathBudget prevented fan-in blowup); genes-only (no relGrowth) is ~si-like (4x_si .461/.488/.446) or worse; 8x >= 4x on both seeds if the curve still rises. Cross-task: no task worse than 1x by > 1 sd at 2x/4x.

## 00:35 cross-task (score 'mean', paired k2951/2952/2953 vs 1x os)
- rd2 = rg+pathBudget+rgDiv2. K4 2x/4x = 1x (9.85-9.875). order3 ~= (2x -.05 avg, 4x -.017). text1000 better all seeds (2x +.13, 4x +.16). fables4000 4x better all (+.23/+.47/+.15), 2x mixed (-.02/+.42/-.03).
- seqchoice FAILS with rd2: sc_order2 1x 7.35/7.08/6.6 -> 2x 4.75/3.63/4.46, 4x 5.45/3.38/5.92; sc_cycle 1x 9.415/9.19/8.325 -> 4x k2952 2.945.
- seqchoice 2x ablation: plain sizeF 1.3-2.5 (collapse); rg 3.5/5.4/3.3 (order2), 4.1/4.6/2.9 (cycle); rg+pb worse than rg; sirg 4.5/7.3/6.8, 5.9/9.7/9.7; rg+rgDiv2 (NO pathBudget) 6.8/3.7/7.1 (order2), 8.9/9.8/9.1 (cycle, 2+/1-, mean +.28). => pathBudget hurts seqchoice; rgDiv is the main fix.
- book10k 4x rg+rgDiv2 no pb: .4555/.4775/.4395 vs 1x (3+/0-, +.014; with pb +.026).
- Running: sw/jobs_xrd.json (rg+rgDiv2 cross-task 2x/4x, incl. seqchoice 4x) -> sw/out/xsc.jsonl. 8x book (pb+rd2) k2951 RSS 4.5 GB.

## 00:40 Nov 18 resume
- xrd done (rg+rgDiv2, no pb) table: python3 sw/xtab.py. rgrd2 4x: K4 +.025, text +.11 (3+), fables +.14 (2+/0-), order3 -.26 (0/3-), sc_order2 -2.55 (0/3), sc_cycle -1.1. rd2 (with pb) 4x: order3 -.017, fables +.26, sc_order2 -2.1, sc_cycle -2.2. => seqchoice degrades at scale under EVERY setting tried (plain 2x collapses to ~1.5); not caused by pathBudget alone. pb helps order3 at 4x.
- 8x book10k pb+rd2: k2951 .46 (4x .4625), k2952 .494 (4x .4925): flat from 4x to 8x (1x .4535/.438).
- Mechanism hypothesis (R76 history): striatum is over-driven at scale (plastic total per receiver ~f^1.1, output response variance ~f^-1); seqchoice = reward learning in striatum, not granules. R76b fixed it with recvBudget=2+postCapRel 1.5 (+fanRef); R74 trophic bits 8/16 = fan-equalized lr.
- PRE-REG (sw/jobs_xpl.json -> sw/out/xpl.jsonl): sc_order2 2x/4x x3 on rg+rgDiv2 + {trophic=24 | trophic=8 | recvBudget=2+postCapRel=1.5}, + sirg_4x ref. Prediction: trophic=24 (bit16 = reward-rule fan-eq) restores sc_order2 to within 0.5 of 1x on >=2/3 seeds at 2x and 4x; trophic=8 alone does not (teacher rule only).

## 00:46 xpl result (sc_order2, d vs 1x mean over 3 seeds)
- rgrd2 + recvBudget2+postCapRel1.5: 2x -0.50 (0/3), 4x -1.38; +trophic24: 2x -1.25, 4x -1.92; +trophic8: 2x -2.3, 4x -3.3 (worse than none); sirg_4x (si+rg) -0.39 (best). Prediction (tr24 restores) FAILED; the receiver cap is the useful rule part, si's full set best.
- abl_genes_4x (divReach/divRep genes, no relGrowth) book10k: k2952 .479, k2953 .4385.
- Launched sw/jobs_xsi.json -> sw/out/xsi.jsonl: sirg cross-task 2x/4x; rdpl (rg+rgDiv2+tr24+rb2+pcr1.5) and rd2pl (+pathBudget) on seqchoice 2x/4x.

## 00:49 seqchoice wiring (sw/scfan.js, grow only, sw/logs/scfan.log; E in-degree per receiver, k2951-3)
- 1x: striatum<-cortex 0.7-2.3, striatum<-striatum 19-23, OUT<-striatum 5-7 (total w 49.8).
- 2x rg+rgDiv2: striatum<-cortex 10.5-13.2 (~6-8x the 1x), striatum<-striatum 40-45, OUT<-striatum 12-14. 4x: cortex 25-29 (~15x), recurrent 78-82, OUT 23-27.
- pathBudget cuts only the striatum's own recurrent E (43 -> 22, = 1x) and leaves the cortex->striatum 'all' TRACT (tracts are outside pathBudget) at 6-15x: the cortex/recurrent ratio grows even further -> explains rgpb < rg on seqchoice.
- si thins the 'all' tract (thinF bit 1, p/f_src): cortex->striatum 5-7 (2x/4x).
- PRE-REG (sw/jobs_xth.json -> xth.jsonl, queued after xsi): rgrd2 + thinF=1 (all-tract thinning only), + thinF=5 (+ plastic thinning), rd2(pb)+thinF=1; sc_order2/sc_cycle 2x/4x x3. Prediction: thinF=1 recovers most of seqchoice (sc_order2 within 1.0 of 1x on >=2/3 seeds at 2x and 4x); with pb+thinF=1 no longer worse than without pb.

## 01:05 xsi results (d vs 1x, 3 seeds)
- sirg (si+rg): 2x K4 -.025, order3 -.017, fables -.06, text +.175, sc_order2 -.80, sc_cycle -.56; 4x K4 -.05, order3 -.07, fables +.26, text +.15, sc_order2 -.39, sc_cycle -2.54 (0/3). Not a no-task-worse setting.
- rdpl (rg+rgDiv2+trophic24+recvBudget2+postCapRel1.5): sc_cycle 2x +.52, 4x +.50; sc_order2 2x -.59, 4x -.78. rd2pl (+pb): sc_cycle +.69/+.47, sc_order2 -.54/-1.23.
- abl_genes_4x (sc.divReach=2,divRep=2, no relGrowth) book10k .4525/.479/.4385 (1+/1-/1=, +.013).

## 01:15 thinF result: prediction FAILED
- seqchoice with thinF=1 (all-tract thinning): sc_order2 rdth1 2x -1.48, 4x -1.71; rd2th1 -2.27/-1.48; thinF=5 -1.8/-2.1; sc_cycle rdth1 4x +.16, others -0.07..-1.1. Thinning cortex->striatum does not fix seqchoice.
- book10k: thinF=1 is bit-identical on book (rdth1_4x = abl_rgrd2_4x, rd2th1_4x = rd2_4x for done seeds); remaining thinF book jobs killed.
- Best seqchoice so far = plasticity rule parts (receiver cap recvBudget2+postCapRel1.5, trophic 16/24). Launched: sw/jobs_xrb.json -> xrb.jsonl (rd2rb, rd2rb16, rdrb16 on seqchoice 2x/4x; rd2pl on order3/K4/text/fables 2x/4x); book10k sw/jobs_bpl.txt (rd2pl_4x, rd2rb_4x x3).
- PRE-REG: rd2rb16 (pathBudget+rgDiv2 + reward-rule fan-eq + receiver cap) is the best single setting if sc_order2 >= -0.6 at 2x/4x, sc_cycle >= 0, and book10k 4x stays >= 2/3 seeds above 1x.

## 01:25 xrb results (seqchoice d vs 1x)
- sc_order2: rd2rb16 2x -.60 / 4x -.53; rdrb16 (no pb) -.28/-.60; rd2rb -1.14/-1.06; rd2pl -.54/-1.23. sc_cycle: all of these +.2..+.7 (better than 1x).
- rd2pl teacher tasks: 4x K4 -.09 (0/2), order3 -.09 (0/3) (trophic bit 8 = teacher-rule fan-eq costs K4/order3) -> drop bit 8.
- Candidate single setting: rd2rb16 = relGrowth+pathBudget+rgDiv2 + trophic16 (reward-rule fan-eq) + recvBudget2+postCapRel1.5. Running its order3/K4/text/fables 2x/4x (xrb16.jsonl) and book10k 4x (after the bpl queue).
- seqchoice order2 still ~-0.55 below 1x at scale with every setting tried (0/3 seeds): an open failure, documented.

## 01:50 seqchoice order2 MECHANISM (sw/scprobe.js life probe, sw/scarm.js per-arm wiring, sw/spana.py; k2951-2953, 1x vs 2x/4x)
- Information reaches the striatum: ridge decode of the correct arm from striatal spike counts = 0.99-1.00 at 1x AND 2x (order-2 oracle 1.0, first-order .75). Not an information problem.
- Failure = DEAD ARMS: in the 2nd half some arms are never chosen (accByTarget 0). 1x: 2 rare arms dead (acc ~.71 ~ first-order ceiling .75); 2x failing seeds: 4 of 6 arms dead (k2952 rgrd2: choices only arms 2,5). Early choice entropy (first 50 trials) 1x 1.8-2.4 bits vs 2x 1.4-1.9: less exploration.
- Cause chain: initial action bias. First-30-trial output-spike share max/mean: 1x 1.9/1.9/3.2; rgrd2 2x 4.1/5.0/2.1 (k2952 one arm .84); 4x k2952 .81. The arm pools (output-projecting striatal cells) fire very unequally at scale: pool rates 1x 1.0-5.8, 2x 0.2-17.5.
- Wiring of the action cells (scarm): they get NO inhibition at any size; E fan-in from striatum 90-114 (1x) -> ~200 (2x) -> ~350 (4x), from cortex 15-17 (1x) -> ~95-100 (2x, 6x) -> ~190 (4x, 12x), weights normalised (total ~45 each). Each action cell becomes an unselective integrator of ~100-190 tiny cortex synapses; the reward rule (cortex->striatum, OUT weights fixed |dw|=0) must reshape them; per-synapse |dw| 1/3 of 1x.
- Negatives: zeroing the inhibitory striatum->OUT synapses that appear at scale (I->OUT 0 at 1x, 1-4 per arm at 2x) does NOT help (k2952 2x 3.73). thinF=1 only halves the action-cell cortex fan-in (100 -> 49 vs 1x 15) -> explains why thinF failed.
- PRE-REG diagnostic (sw/jobs_xam.json -> xam.jsonl): existing P.allMax=16 caps 'all'-tract convergence at ~the 1x action-cell cortex fan-in. Prediction: rgrd2+allMax16 and rd2rb16+allMax16 recover sc_order2 to within 0.3 of 1x at 2x/4x (>=2/3 seeds), sc_cycle not worse; 1x allMax16 ~ no-op (1x fan-in 15-17). If confirmed, the growth-native version = 'all'-tract fan-in from a 1x reference count (tractBudget), as pathBudget does for local pathways.

## 01:50 allMax diagnostic: prediction FAILED
- allMax=16 (action-cell cortex fan-in at the 1x level; 1x no-op confirmed: osam = os): sc_order2 rgrd2+am 2x -1.57, 4x -1.65; rd2rb16+am 2x -.53 (6.4/8.45/4.6), 4x -.37 (8.15/6.08/5.70); sc_cycle worse (-.24..-.65 vs +.3..+.4 without). With pathBudget the action cells' striatal E fan-in is already at 1x (~100); with pb+allMax both are at 1x, still not recovered. In-degree of the action cells is NOT the cause.
- 'mixing -> striatum' tract synapses 636 (1x) -> 7991 (2x) -> 33620 (4x) (k2952; sources = cortex mixing cells grow ~6x/12x).
- PRE-REG exploration test (sw/jobs_xan.json -> xan.jsonl): plan striatum pl.actNoise = 8 (shared OU noise per action column). actNoise 16/24 at 1x and rd2rb16 2x/4x, sc_order2+sc_cycle x3. Prediction (dead arms = too little exploration vs the larger initial arm bias): more noise helps scaled brains more than 1x (order2 gap to 1x-at-same-noise shrinks below 0.3).

## 01:57 exploration test: prediction CONFIRMED (partly)
- striatum pl.actNoise (plan 8): an16 sc_order2 1x 7.14/6.53/6.65 (-.24 vs 1x@8), rd2rb16 2x 6.11/7.13/6.74 (-.35), 4x 7.33/7.84/6.89 (+.34, 2+/1-); an24 1x +.07, 2x -.45, 4x +.34. sc_cycle +.17..+.54 everywhere (no task worse).
- vs 1x at the same noise: 4x +.58 (an16), 2x -.11 -> the scale gap on order2 closes with more exploration. Mechanism: larger initial arm bias at size (measured) + the same exploration noise -> dead arms.
- Testing a relative rule: actNoise x sqrt(sizeF) (2x 11.3) and x sizeF (4x 32) (sw/jobs_xan2.json -> xan2.jsonl); 1x stays bit-identical under either.

## 02:05 R131 P.anSize implemented (net.js initActNoise/actNoiseStep; base.js anSize:0; test_core block 9 added, not yet run)
- anSize=1: action noise x sqrt(largest region sizeF); 1x unchanged (osan = os exactly on sc_order2 x3).
- xan2: actNoise x sqrt(f) 2x (11.3) order2 -.37 (1+/2-), x f 4x (32) +.33; sc_cycle +.41/+.44.
- CAUTION: cand_4x (anSize=1 => 8x2=16) order2 6.10/7.51/6.97 (-.15) vs an16_4x (16 set directly) 7.33/7.84/6.89 (+.34): float-level noise differences change a seed by up to 1.2 -> sc_order2 differences < ~0.5 on 3 seeds are within run-to-run chaos. Queued 5 more seeds (k2954-2958) for os / rd2rb16 2x,4x / cand 2x,4x on sc_order2 (sw/jobs_xs8.json -> xs8.jsonl).

## 02:25 self-calibration lead: the brain already HAS arm-pool homeostasis, and it is too slow at size
- Plan striatum pl.rcvHomeo = 0.018 (intrinsic threshold homeostasis of the action-column cells, target rcvRate 0.02/substep; base.js: "so no column dominates just because it grew bigger").
- Pool rates over life (spikes/cell/trial, trials 0/100/400/900): 1x k2952 max 5.0 -> 7.0 (pools trade places); rgrd2 2x k2952 hot pool 17.5 -> 16.9 -> 13.6 -> 7.4 (still 2-7x the others at the end, dead arms); 4x k2952 9.8 -> 11.8. The equaliser exists but cannot remove the larger initial bias within the life.
- PRE-REG (sw/jobs_xrh.json -> xrh.jsonl, after xs8): pl.rcvHomeo@striatum 0.036 / 0.072 at 1x and rd2rb16 2x/4x, sc_order2+sc_cycle x3. Prediction: faster homeostasis closes the size gap (order2 2x/4x within 0.3 of 1x at the same gain) and is ~neutral at 1x (within 0.3). If so, the self-calibrating version = homeostatic gain set by the column's own rate error (relative), no size knob. Screen only (3 seeds); winner gets 8 seeds.

## 02:23 xs8 (sc_order2, 8 seeds k2951-2958, paired vs 1x os mean 6.84)
- rd2rb16: 2x -.29 (se .33, 2+/6-), 4x -.18 (se .17, 3+/5-).
- cand = rd2rb16 + anSize=1: 2x -.09 (se .39, 4+/4-), 4x +.37 (se .29, 6+/2-).
- cand vs rd2rb16 paired: 2x +.20 (se .12, 7+/1-), 4x +.55 (se .25, 7+/1-). => anSize ADOPTED into the candidate: it helps on 7/8 seeds at both sizes; vs 1x order2 is now within noise (2x) / above (4x). Teacher tasks + book bit-identical to rd2 (anSize only acts where pl.actNoise > 0 drives action columns).

## 02:32 rcvHomeo screen: prediction FAILED; anSelf pre-registered
- pl.rcvHomeo@striatum (plan .018): .036 order2 1x -.43, 2x -.58, 4x -.44; .072 1x +.25, 2x -.58, 4x -.35 (3 seeds). Faster pool homeostasis does not close the size gap (gap to same-gain 1x -.6..-.8). Negative.
- PRE-REG R131 P.anSelf=1 (net.js anSelfF, default off, bit-identical): exploration noise x sqrt(B), B = max/mean of the outputs' recent spike rates (EMA tau 4000 substeps) - noise rises by itself when one arm dominates, no size knob, acts at 1x too. Test sw/jobs_xself.json -> xself.jsonl: 1x / rd2rb16+anSelf 2x / 4x, sc_order2 8 seeds + sc_cycle 3. Prediction: 2x/4x order2 >= cand (anSize) and 1x within +-0.3 of os (8 seeds); sc_cycle not worse.
- test_core run killed (code changed under it); rerun after the last code change.

## 02:36 anSelf result (sc_order2 8 seeds paired vs 1x os; sc_cycle 3 seeds)
- self (anSelf=1): 1x -.08 (se .13, 4+/4-: neutral); rd2rb16+anSelf 2x +.14 (se .27, 5+/3-), 4x +.09 (se .27, 5+/3-). sc_cycle 1x +.15, 2x +.57, 4x +.33.
- paired: self vs rd2rb16 2x +.43 (se .14, 7+/1-), 4x +.27 (se .20, 6+/2-); self vs anSize-cand 2x +.23 (5+/3-), 4x -.28 (se .16, 1+/7-).
- Prediction: 1x within +-.3 YES; 2x >= cand YES; 4x >= cand NO (anSize better at 4x). Chosen: anSelf (self-calibrating, no size knob, neutral at 1x, seqchoice >= 1x at 2x and 4x). anSize kept as a documented alternative.
- Checking anSelf is a no-op on teacher tasks (sw/jobs_xselfT.json, k2951 1x/4x).

## 02:45 sc_cycle 8 seeds: anSelf 1x +.16 (7+/1-), best 2x +.36 (6+/2-), 4x +.10 (5+/3-). 8x k2953 .450 (4x .447): 8x flat (.460/.494/.450). MORNING.md drafted. Running: test_core (tests.sh), book10k best_2x x3 (sw/jobs_b2x.txt).

## 02:55 R131 committed 42f35ee6 (+ MORNING.md commit-list fixup 1b11b457); test_core ALL OK (R131 anSize/anSelf ok), spikefoundry 10 PASS; bundle refreshed + verified. Night done.

## 03:00 Nov 18 continue: validation + why 8x is flat
- Running: sw/jobs_val.txt (book10k best_4x and os_1x, k2954-2961, P=2).
- 8x vs 4x bookdiag (rd2, k2951-2953): granule stats identical (rewired ~3.9k, matched ~15.4k, exact ~170k, active granules/event 4.0-4.3, NLMS step 1.12-1.15, X2 ~1.9k), lag columns healthy at both (cr .78/.95-.99). The granule code (claws on letter columns t..t-3) carries the same information at any size: size does not change what the readout sees.
- COUNT-MODEL CEILING (sw/countmodel.js: online backoff order-n count model on the same stream, held acc): book10k o4 .480/.4865/.455, o5 .4815/.492/.45, o8 .48/.4915/.447. The 4x brain .4625/.4925/.447 is AT the ceiling for k2952/2953 (and .018 below for k2951) -> book10k is data-limited: no model of any order can do better, so 8x cannot. book30k: o4 .509/.5295/.496, o6 .525/.5375/.486 vs brain 4x .478/.526/.4765 -> headroom .02-.05 (k2951 largest). book100k: o5/o6 .534-.58.
- PRE-REG: 8x on book30k k2951 (+k2953 if memory) vs 4x (.478/.4765). Prediction: if size adds usable capacity, 8x closes part of the .03-.05 gap to the count model; if flat again, the readout/representation (granule pool fixed at 32000, claw depth 3 lags) is the limit -> next test granN scaled with size.

## 03:17 VALIDATION book10k 4x best vs 1x, 11 seeds (k2951-2961): +.0208 (se .0066), 10+/1-; excluding k2952 +.0174 (se .0063), 9+/1-. The gain is real beyond seed 2952 (k2958 +.071 is another 1x-defect seed).
- Where the gain is / what's left (k2956-2961, held symbols binned by how often the order-4 context t..t-3 was seen before; count5 = online order-5 backoff count model):
  unseen (n 3201): count .357, 1x .330, 4x .350 | seen once (1919): count .561, 1x .473, 4x .510 | 2-4x (2689): .549 / .492 / .521 | 5+ (4191): .516 / .501 / .513.
  -> size helps exactly where contexts are rare; the 4x brain matches the count model on frequent and unseen contexts; the remaining gap (.03-.05) is few-shot learning of rarely seen contexts. Overall the 4x brain is within ~.015 of the best count model on book10k -> 8x has almost nothing left to gain on book10k (data ceiling).
- Granule pool is NOT saturated at 4x/8x: rewired ~3.9k of cap 32000, capped 0.
- PRE-REG (sw/jobs_lim.txt, 4x k2956-2958, vs best_4x): granN 64000 -> no gain (pool not saturated; prediction |d| < .005); granOneShot .1 (readout one-shot step, plan .03) -> gain in the seen-once bin (prediction +.005..+.02 overall). Diagnostic only (rule constant, not a size rule).

## 03:20 8x book30k k2951 = .471 (4x best .478; count o4 .509, o6 .525) -> 8x flat on book30k too, despite .03-.05 headroom.
Pre-registered reading: flat 8x with headroom => readout/representation limit, not size. jobs_lim (g64_4x, os10_4x; k2956-58) running P=2; 8x k2953 running; b30val queued.

## 03:32 jobs_lim DONE (book10k 4x best-setting, paired vs best_4x .4935/.452/.4725, k2956-58)
- g64_4x (granN 64000): .4935/.461/.472 -> d = 0/+.009/-.0005, mean +.003. Pre-reg "no gain |d|<.005": CONFIRMED (pool not the limit).
- os10_4x (granOneShot .1): .4885/.4485/.480 -> d = -.005/-.0035/+.0075, mean -.0003. Pre-reg "+.005..+.02": REFUTED.
- Count-model reference: brain 4x ~= order-3 count model on book10k (2956 o3 .4935 / brain .4935; 2958 o3 .4755 / .4725) and book30k
  (2951 o3 .4845 / brain .478; 2952 .521/.526; 2953 .4745/.4765) but BELOW order-4/5 on book30k by .02-.03 (o4 .509/.5295/.496).
- Distinct contexts book30k k2951: 2260 order-3, 6464 order-4; granules rewired 6.7k of 32000, capped 0 -> coverage fine, pool unsaturated.
- 8x book30k k2951 .471 vs 4x .478: flat. k2953 running. b30val (k2954-57 4x/1x) running P=2.

## 03:45 PRE-REG R132 granNeg (new default-off flag: signed granule readout, weights in [-wMax, wMax] in granKalStep)
Diagnosis: brain 4x ~= order-3 count model, below order-4/5 on book30k (.02-.03). Count backoff lets a specific context OVERRIDE the generic
order-3 prediction; the readout has weights >= 0, so a specific detector can only add, never veto. Hypothesis: non-negativity blocks the override.
Prediction: granNeg=1 at 4x raises book30k (k2951/2953/2952 vs .478/.4765/.526) by +.01..+.03, gains concentrated in 2-4/5+ bins; book10k k2956-58
(vs .4935/.452/.4725) gain smaller (data ceiling) except k2958 (o4 .5005 headroom). If |d| < .005: non-negativity is NOT the limit.
Queue sw/q_neg.sh (starts after 8x finishes; P stays <= 3).

## 03:43 RESUMED (origin cursor/relgrowth = 1b11b457 per Travis; still no push). Live: q_b30val (P=2), q_neg (P=1) = 3.
8x book30k DONE: k2951 .471 (4x .478, d -.007), k2953 .484 (4x .4765, d +.0075) -> mean +.0003: 8x flat on book30k too.

## 03:58 granNeg book10k: 2956 .4915 (d -.002), 2957 .448 (d -.004); bins unchanged/slightly worse. Book30k 2951/2953 still queued (2952 dropped).
## Bins book30k (k2953 8x, k2954/2955 4x): seen-once order-4 contexts: brain ~= count3 (.44-.49) << count4 (.525-.545); 2-4 bin also below count4/5.
At book10k count4 seen-once ~= count3 (no order-4 one-shot value) -> granOneShot .03 (tuned on book10k) is too weak for longer books.
PRE-REG os: book30k 4x, granOneShot=1 (full lone-input NLMS step on recruit) and =2 (self-calibrating NLMS share), k2951/2953 vs .478/.4765.
Prediction: +.005..+.02, gain in seen-once bin toward count4. If |d|<.005, the one-shot recruit weight is not the limit.
Queue sw/q_os.sh (after q_b30val; P=2 + q_neg 1 = 3).

## 04:05 VALIDATION book30k 4x best vs 1x DONE (b30v k2954-57; 1x -> 4x): 2954 .4625->.481, 2955 .4465->.4585, 2956 .498->.5065, 2957 .4515->.4685
-> +.0185/+.012/+.0085/+.017 (4/4). With k2951-53 (.4765/.4735/.475 -> .478/.526/.4765): 7 seeds mean +.0159 (se .0067), 7+/0-;
excluding k2952: +.0098 (se .0030), 6+/0-. Gain is real beyond k2952 on both book10k (11 seeds) and book30k (7 seeds).
granNeg book10k 2958 .4745 (d +.002) -> book10k mean -.0013 (null). Running: b30neg 2951, b30os1 2951/2953.

## 04:20 RESULTS book30k 4x (vs best .478/.4765):
- granNeg: 2951 .472, 2953 .471 (d -.006/-.0055) + book10k mean -.0013 -> REFUTED: non-negativity is not the limit. Kept off (flag documented).
- granOneShot=1: 2951 .4465, 2953 .436 (d -.0315/-.0405) -> REFUTED as a whole, BUT bins: seen-once UP (2951 .47->.554 ~ count4 .599; 2953 .429->.489)
  while 5+ COLLAPSES (2951 .48->.425, 2953 .523->.469). Mechanism: the large first-sighting weight is never averaged down, because false alarms
  (err<0) use the plain NLMS split (1/k share), not granKal's experience-weighted split.
PRE-REG R132 granKalLTD (new default-off flag: experience-weighted split for LTD too). os1+kalLTD at book30k 4x k2951/2953:
keeps the seen-once gain and restores 5+ -> net d +.005..+.02 vs best. If 5+ stays collapsed, the over-weight is not an LTD-split issue.
Running sw/q_ltd.sh (P<=3 enforced by pgrep count). os2 (self-calibrating share) running.

## 04:33 RESUMED again (Travis: 7/7 book30k validation great). os2 (granOneShot=2, self-calibrated NLMS share) book30k 4x: 2951 .474 (d -.004), 2953 .4545 (d -.022) -> REFUTED.
## 04:36 granKalLTD+os1 2951: .456 (d -.022 vs best; vs os1 alone +.0095); bins 1 .554 (kept), 5+ .425->.442 (vs best .48): only partial recovery -> pre-reg REFUTED on 2951 (2953 running).
Exploratory (not a strong prior): os .3 + kalLTD at 2951/2953 (b30ltd03_4x), P=3.
## 04:44 granKalLTD+os1 2953: .451 (d -.0255 vs best; +.015 vs os1 alone) -> R132 granKalLTD REFUTED (2/2 below best). test_core running (granNeg/granKalLTD flags).
## 04:50 os .3 + kalLTD (exploratory): 2951 .4745 (d -.0035), 2953 .4595 (d -.017) -> negative. No readout fix worked; nothing to confirm. All runners done; test_core running, then spikefoundry, commit R132, bundle, MORNING.
## 05:12 DONE. test_core ALL OK EXIT 0 (incl. R132 granNeg / granKalLTD blocks), spikefoundry 10/10 PASS. Commits f9beabbc (R132) + 6dcb6cf8 (MORNING commit list).
Bundle relgrowth.bundle = afed1aba..relgrowth @ 6dcb6cf8, verified. No runners left. Not pushed.
## 05:43 R133 START (Travis approved, t124u). origin cursor/relgrowth = 6dcb6cf8. Implemented P.granFast (net.js granFastStep + recruit trace), test block added; pre-registered in RESULTS.md. Smoke next.
## 05:47 granFast fix: default granGain path (U) wiped the fast part at the dense rescale -> FA now added as psi x FA there. Running: smoke book10k 1x k2956 (vs .4975), tune book30k 4x k2951/2953 (vs .478/.4765). P=3.
## 05:56 granFast smoke book10k 1x k2956: .492 vs .4975 (d -.0055; bins 0 .37->.355, 1 .528->.50, 2-4 .53->.543, 5+ .543->.541). book10k is data-limited (count4 seen-once ~ count3), so not decisive; waiting for book30k 4x tune seeds.
## 06:03 R133 TUNE SEEDS (no knob to tune; granFast=1 as pre-registered) book30k 4x vs best .478/.4765:
k2951 .4955 (+.0175), k2953 .493 (+.0165). Bins: 2951 seen-once .559 (count3 .48, count4 .599), 5+ .495; 2953 seen-once .479, 5+ .533 (8x best .531).
(best-4x hits for 2951/2953 were not saved; the 5+ check uses the confirmation seeds k2954-57, which have best-4x hits.)
Launched sw/jobs_fast.txt (bdrun2, P=3): confirm 4x k2954-57, 8x k2951/2953, 1x k2951/2953, book100k best/fast 4x k2951.
## 06:06 queued cross-task sw/jobs_xfast.json (34 jobs, after bdrun2): fast_4x sc_order2/sc_cycle 8 seeds, order3/K4/text1000/fables4000 k2951-53; fast_1x all 6 tasks k2951.
## 06:17 CONFIRM book30k 4x granFast vs best (b30v_4x): k2954 .481->.4945 (+.0135), k2956 .5065->.516 (+.0095).
Bins best->fast: 2954 seen-once .441->.473, 2-4 .501->.55, 5+ .518->.523; 2956 seen-once .506->.523, 2-4 .516->.555, 5+ .54->.54. 5+ criterion met (no drop).
Running 2955/2957 4x, 8x k2951.
## 06:32 RESUMED (interrupted). Live: bdrun2 (8x k2951, 8x k2953, book100k best_4x k2951), q_xfast waiting. Nothing relaunched.
CONFIRM book30k 4x granFast vs best: 2954 +.0135, 2955 .4585->.4675 (+.009), 2956 +.0095, 2957 .4685->.477 (+.0085). With tune seeds 2951 +.0175, 2953 +.0165: 6/6.
1x granFast book30k: k2951 .4765->.496 (+.0195), k2953 .475->.483 (+.008). NOTE: at 1x granFast nearly matches 4x granFast (2951 .496 vs .4955; 2953 .483 vs .493).
## 06:35 bins 2955 seen-once .487->.524, 5+ .472=.472; 2957 seen-once .524->.528, 5+ .481->.485. Queued sw/q_more.sh: 1x granFast book30k k2954-57 (after xfast) to test whether size still helps with granFast.
## 06:42 8x granFast book30k k2951: .492 (4x .4955, 1x .496; 8x best w/o fast .471). Size not helping on k2951 with granFast. Running 8x k2953, book100k best_4x & fast_4x k2951. Mem avail ~1-2 GB (two 4.5 GB 8x was the peak; one now).
## 06:57 8x granFast book30k k2953: .492 (4x .493, 1x .483). 8x flat with granFast too (2951 .492/.4955/.496, 2953 .492/.493/.483 for 8x/4x/1x). test_core running in the free slot; book100k best/fast 4x k2951 running.
## 07:08 NAME CLASH FIXED: "granFast" already existed (I106 engine flag, default 1); my base.js `granFast: 0` had overridden it to 0 and test_core
caught it (EXIT 1). I106 is bit-identical on/off (os_1x rerun reproduced .4975 + identical hits), so all R133 numbers stand: "P.granFast=1" arms = I106 on + trace on;
baselines = I106 off = bit-identical to on. Renamed the R133 flag to P.granTrace (net.js granTraceStep), restored I106 default; pending job files
(jobs_xfast.json, jobs_fast2.txt) switched to P.granTrace=1. book100k runs in flight loaded the old code (same meaning). test_core rerunning.
## 07:21 b100best_4x k2951 .4955 (count o3 .49, o4 .527, o5 .5335). RESUMED (3rd interrupt); live: b100fast_4x k2951, test_core; q_xfast + q_more waiting.
## 07:27 test_core ALL OK EXIT 0 (with R133 granTrace block: R133 granTrace: off bit-identical, on score 0.508: ok). spikefoundry running.
## 07:32 book100k 4x k2951: best .4955 -> granTrace .504 (+.0085). Bins best->trace: seen-once .551=.551, 2-4 .521->.596, 5+ .498->.50, 0 .355->.327.
Count model 100k: o3 .49, o4 .527, o5 .5335, o6 .5405; count4 5+ .52. At 100k 79% of held letters are in the 5+ bin, where the brain (.50) stays at
count3 level (.499) vs count4 .52 -> the remaining 100k gap is the slow weights on frequent contexts, not one-shot. spikefoundry 6/10 PASS so far; xfast cross-task started (reg.js P=3).
## 07:38 spikefoundry 10/10 PASS. CROSS-TASK granTrace (fitness 0-10, paired vs best setting):
  sc_order2   f4 vs b4: n=8 mean d +0.000 se 0.000 0+/0-  2951:5.995->5.995 2952:7.435->7.435 2953:6.645->6.645 2954:6.76->6.76 2955:6.975->6.975 2956:7.045->7.045 2957:6.965->6.965 2958:7.655->7.655
  sc_order2   f1 vs b1: n=1 mean d +0.000 0+/0-  2951:7.105->7.105
  sc_cycle    f4 vs b4: n=8 mean d +0.000 se 0.000 0+/0-  2951:9.01->9.01 2952:9.28->9.28 2953:9.635->9.635 2954:9.065->9.065 2955:9.415->9.415 2956:9.385->9.385 2957:9.42->9.42 2958:9.18->9.18
  sc_cycle    f1 vs b1: n=1 mean d +0.000 0+/0-  2951:9.65->9.65
  order3      f4 vs b4t: n=3 mean d +0.025 se 0.000 3+/0-  2951:9.675->9.7 2952:9.675->9.7 2953:9.675->9.7
  order3      f1 vs b1t: n=1 mean d +0.025 1+/0-  2951:9.675->9.7
  K4          f4 vs b4t: n=3 mean d +0.025 se 0.000 3+/0-  2951:9.85->9.875 2952:9.85->9.875 2953:9.85->9.875
  K4          f1 vs b1t: n=1 mean d +0.025 1+/0-  2951:9.85->9.875
  text1000    f4 vs b4t: n=3 mean d +0.312 se 0.024 3+/0-  2951:7.805->8.13 2952:7.805->8.07 2953:7.745->8.09
  text1000    f1 vs b1t: n=1 mean d +0.310 1+/0-  2951:7.67->7.98
  fables4000  f4 vs b4t: n=3 mean d +0.129 se 0.025 3+/0-  2951:4.465->4.556 2952:4.367->4.489 2953:4.413->4.588
  seqchoice bit-identical (no granule readout there). fables 2953 4x / 1x pending.
## 07:44 cross-task DONE: fables4000 4x 4.465/4.367/4.413 -> 4.556/4.489/4.588 (3+), 1x k2951 4.3 -> 4.519. No task worse. Running q_more: trace_1x_check (book10k k2956, rename check vs .492), 1x granTrace book30k k2954-57.
## 07:48 rename check: P.granTrace=1 book10k 1x k2956 = .492 with hits identical to the P.granFast=1 run -> all R133 numbers carry over to the renamed flag.
## 07:54 1x granTrace book30k: k2954 .474 (1x base .4625; 4x trace .4945), k2955 .4615 (1x .4465; 4x trace .4675). 2956/2957 running.
## 07:59 1x granTrace book30k k2956 .5135 (1x .498; 4x trace .516). 2957 running.
## 08:02 ALL R133 RUNS DONE. book30k summary (python3 sw/r133sum.py; k2951,2953-57):
trace4x - best4x +.0124 (se .0016) 6+/0-; trace1x - base1x +.0136 (se .0016) 6+/0-; trace4x - trace1x +.0087 (se .0031) 5+/1-;
trace8x - trace4x -.0023 (2 seeds, 0+/2-). trace 4x ~= order-4 count model (o4 .509/.496/.494/.4725/.525/.4795).
Writing RESULTS R133, committing.
## 08:05 R133 COMMITTED 9f043e92 (on top of 6dcb6cf8 = origin cursor/relgrowth). Bundle relgrowth.bundle afed1aba..relgrowth @ 9f043e92 verified. test_core ALL OK, sf 10/10. No runners left. Not pushed.
## 08:15 R134 START (Travis t127u: longer context main line). Step 1 headroom.
## R134 step 1 HEADROOM (sw/headroom.js; online count models, argmax, backoff to shorter; held = last 2000 letters; k2951 / k2953)
| nSyms | o3 | o4 | o5 | o6 | o7 | o8 | partial word | prev word + partial |
| 30k  | .484/.474 | .509/.496 | .519/.491 | .525/.486 | .527/.477 | .527/.477 | .501/.500 | .528/.5115 |
| 100k | .490/.494 | .527/.524 | .533/.520 | .540/.513 | .538/.507 | .535/.502 | .511/.5175 | .5465/.5365 |
| 300k | .486/.508 | .525/.547 | .532/.553 | .546/.554 | .545/.548 | .534/.539 | .519/.543 | .552/.5765 |
| 1M   | .485/.509 | .532/.575 | .555/.589 | .562/.597 | .567/.593 | .559/.581 | .5245/.565 | .571/.6125 |
Letters 5-8 are worth ~0 to +.013 at 30k-100k (negative on k2953: too sparse) and +.02-.03 at 1M. The previous WORD + current partial word
beats every letter order at every length (+.012..+.02 over o4 at 30k/100k, +.04 at 1M). (Min-count-2 backoff did not change this.)
## R134 step 2 diagnosis (code): lag depth 4 is HARDCODED: regions.js granuleLayer K = min(4, round(granK)), and the claw sources are a fixed list
[cortex cls0 (t), cortex cls2 (t-1), context cls2 (t-2), 2nd context cls2 (t-3)] = the deepURSx3 plan's chain of context regions (one-step shift registers).
Not a growth limit or decay: there is no t-4 source to claw onto. (deepURSx3_chunk exists: an event-gated 'chunk context' region holding the letter
before a space; never evaluated on book.) Running linear lag probes (sw/lagprobe.js/.py) at 1x and 4x k2951 book10k.
## 08:20 implemented P.granChunk (net.js guChunkEvent/guChunkFire; recruit tail moved into guRecruit, off = bit-identical checked on text 400). Pre-registered in RESULTS.md. Lag probes running.
## R134 lag probes 1x k2951 book10k (ridge one-hot probe of the letter at lag L from per-slot spike counts, whole slot; test = last 30%; chance .20):
| region | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 |
| cortex | 1.00 | 1.00 | .99 | .97 | .95 | .34 | .26 | .19 | .17 |
| context | .34 | 1.00 | 1.00 | .99 | .35 | .26 | .20 | .18 | .17 |
| striatum | .25 | .33 | 1.00 | 1.00 | .98 | .35 | .26 | .19 | .18 |
| context 2 | .19 | .25 | .34 | 1.00 | 1.00 | .98 | .35 | .26 | .20 |
| ALL | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | .98 | .34 | .24 | .17 |
Each stage holds 3 letters over a whole slot -> 6 letters (t..t-5) are decodable, nothing beyond (lag 6 = chance + correlation). Whole-slot counts mix the
pre-shift and post-shift letter, so a read-window-only probe (RW=1) is running to see what the granules can actually use at read time.

## R134 lag probe, 1x READ WINDOW (k2951, 10k syms, chance .20) — done
context .33/.998/.991/.35 (lags 0-3) | striatum lag2 .99 lag3 .98 | context2 lag3 .99 lag4 .98 | cortex lags0-4 1.0/.99/.91/.90/.89 | ALL lags0-4 .99+, lag5 .36, lag6 .26
=> at readout time the net holds exactly current+4 previous letters (each region = one shift-register stage; delay line ends at context2 lag4). Claws read t..t-3 only; lag4 is present (ctx2 .98) but unused. Beyond lag4: nothing (structural, not noise).
4x whole-slot probe running (python, sw/logs/lpp_tr4x.log). test_core with granChunk block running (sw/logs/tc134.log). b30chunk_4x k2951 running.
CORRECTION: lagprobe region labels were shifted (genome lists 5 entries incl. striatum; grown brain has 4 regions cortex/context/context 2/context 3). True: "striatum"=context 2 (rw lags 2-3), "context 2"=context 3 (rw lags 3-4). Delay line = 4 regions -> lags 0..4. Claws use cortex c0 (t), cortex c2, context c2, context2 c2 (t-3); context3 (holds t-4 at .98) is unused.
Implemented granDeep (regions.js, off = unchanged): K cap = 1+#regions, extra source context3 cls2 (t-4). Run with P.granK=5.
## R134 granChunk tune k2951 book30k 4x: .5155 vs trace .4955 (+.020; chunkRec 20549, fired 82987). tr4x lag probe OOM-killed (skipped).
Running sw/jobs_ch2.txt: chunk k2953 (vs .493), granDeep k2951, chunk+deep k2951.

## 9:05 resume. Headroom table + lag diagnosis are in RESULTS.md (R134). test_core with granChunk block: ALL OK (before granDeep test added).
book30k 4x vs trace baseline (heldAcc, 2000 held letters):
- granChunk k2951 .5155 (+.020), k2953 .5065 vs .493 (+.0135). Tune 2/2 positive. k2951 bins vs trace: 5+ .495->.522, 2-4 .542->.563, 1 .559->.569, 0 .377->.373.
- granDeep (K=5, context3 t-4) k2951 .5055 (+.010; pre-reg predicted +.000..+.005).
- chunk+deep k2951 .511 (+.0155; less than chunk alone).
Next: confirm granChunk on k2954-2957 (trace .4945/.4675/.516/.477); granDeep on k2953; then 8x/1x chunk, book100k.
Running sw/jobs_ch3.txt (P=3): chunk 4x k2954-2957, deep 4x k2953, chunk 8x k2951/2953, chunk 1x k2951, chunk book100k 4x k2951. Baselines: trace 8x .492/.492, 1x k2951 .496, b100 trace k2951 .504. test_core (with granDeep test) to rerun at end.
- granChunk confirm 4x: k2954 .4945->.504 (+.0095), k2955 .4675->.4815 (+.014), k2956 .516->.5275 (+.0115). k2957 running (vs .477). So far 5/5 positive.
9:55 check: only 3 bookdiag runners alive (k2957 chunk, deep k2953, chunk 8x k2951; ~19 min elapsed); the other node processes are box infrastructure. Nothing relaunched.
Queued sw/q_xchunk.sh (regressions with granChunk, 34 jobs, starts when bdrun2 ends; out sw/out/xchunk.jsonl; baseline sw/out/xfast.jsonl).
- 10:20 results: chunk 4x k2957 .477->.487 (+.010) => granChunk 4x 6/6 positive: +.020/+.0135/+.0095/+.014/+.0115/+.010, mean +.0131 (new seeds only +.0113).
- granDeep 4x k2953 .4935 vs .493 (+.0005) => granDeep +.010/+.0005: not robust, not adopted.
- chunk 8x k2951 .512 (trace 8x .492; chunk 4x .5155 => 8x vs 4x -.0035). chunk 1x k2951 .5115 (trace 1x .496, +.0155; 4x-1x +.004).
Running: chunk 8x k2953, chunk book100k 4x k2951. Box seems to pause when idle; keep a foreground sleep running while waiting.
Regressions: split A (now, P=1) / B (after 8x k2953 ends) -> sw/out/xchunk.jsonl.
- chunk 8x k2953 .5025 (trace 8x .492; chunk 4x .5065 => 8x vs 4x -.004). 8x still does NOT beat 4x (k2951 -.0035, k2953 -.004).
- regressions so far (chunk vs trace, fitness 0-10): order3 9.7/9.7 = ; seqchoice order2 & cycle 4 seeds each identical; K4 9.875 = ; text1000 8.13->8.80, 8.09->8.845 (+.71).
- regressions (chunk vs trace): order3 4x 9.7x3 =, 1x 9.7 =; seqchoice order2 & cycle 8 seeds bit-identical; K4 9.875x3 =; text1000 4x 8.13/8.07/8.09 -> 8.80/8.795/8.845 (+.717), 1x 7.98->8.605; fables4000 4x 4.556/4.489 -> 4.633/4.599 (+.094). Remaining: few 1x/fables jobs. b100chunk k2951 at 26 min.
10:45 resume: live = b100chunk k2951 (28 min), reg B (fables 4x k2953 then 1x sc_cycle/K4/fables). Started test_core+spikefoundry (sw/logs/tc134b.log, sf134.log).
## 8x diagnosis (from bd gu stats + sw/chunkkeys.js, k2951)
- Granule/chunk pool is granN=32000 at 4x AND 8x (sizeF does not scale it). Chunk recruits 4x/8x: k2951 20549/20528, k2953 21254/21255; fired 82987/83135. Matched/exact also ~equal. => chunk code identical at 4x and 8x; extra 8x cortex adds nothing the readout uses.
- Recruitment saturation: book30k has 21425 distinct chunk keys, only 3579 seen >=2; 20549 recruited (~1 per surprising letter); granule turnover (rewired) 6.7k -> 27.5k of 32k with chunks. book100k: 59051 keys (12463 recurring) > 32000 pool.
- One level only: key = (previous word, partial word, letter); the previous word is a stored string, not a node; no chunk-of-chunks units and nothing feeds a slower region.
- book100k chunk 4x k2951 .496 vs trace .504 (-.008). PRE-REG (larger gain at 100k) REFUTED. chunkRec 57353, rewired 70748 (pool 32000): saturation/eviction.
- regressions complete: fables4000 4x 4.556/4.489/4.588 -> 4.633/4.599/4.669 (+.089); 1x sc_cycle 9.65 =, K4 9.875 =, fables 4.519->4.59. No regression.
- b100 bins (trace -> chunk): seen0 .327->.318, seen1 .551->.458, 2-4 .596->.516, 5+ .500->.508. Chunk helps frequent contexts; rare 4-letter detectors are evicted by single-use chunk detectors (pool 32000 < keys).
- RESULTS.md R134 results + 8x diagnosis written.
- test_core ALL OK (incl. R134 granChunk + granDeep), spikefoundry 10 PASS.
- Committed 2406c837 (R134) as Grok Bot; bundle afed1aba..relgrowth refreshed + verified (head 2406c837). Not pushed. experiments/registry.jsonl left unstaged (run log, not committed in recent rounds). DONE.

# R135 (11:10): granChunkGate (2nd-sighting recruit, bit sketch 32xpool) + granScale (pool x max(1,sizeF/r)); both off = bit-identical (smoke ok). Pre-reg in RESULTS.md.
Running sw/jobs_r135a.txt: gate 4x book30k k2951 (vs trace .4955 / chunk .5155), k2953 (.493/.5065), book100k k2951 (trace .504, chunk .496).
- gate 4x book30k: k2951 .498 (trace .4955 +.0025; ungated chunk .5155), k2953 .499 (trace .493 +.006; chunk .5065). chunkRec 3554/3318 (ungated 20549/21254), gated 21201/21873, turnover 10310/10576.
  => gate loses most of the 30k gain (pre-reg >= +.008 FAILS on tune seeds): recruiting at the 2nd sighting means a key predicts only from its 3rd; at 30k most useful keys occur 2-3 times.
  b100gate k2951 still running.
Launched sw/jobs_r135b.txt: ungated chunk 8x + granScale4 (pool 64000) book30k k2951 (vs chunk 4x .5155, chunk 8x .512); ungated chunk 4x + granScale2 (pool 64000) book100k k2951 (vs .504/.496) = pool-capacity test.
- b100gate 4x k2951 .5145 (trace .504 +.0105; ungated chunk .496). PRE-REG 100k >= +.005 MET. bins trace/chunk/gate: seen1 .551/.458/.551, 2-4 .596/.516/.601, 5+ .500/.508/.512. chunkRec 12549, turnover 23605 (ungated 70748).
- granChunkGate=2 (pressure gate: 1st sighting only into a free never-matched slot) implemented, smoke off-identical; pre-registered. Running sw/jobs_r135c.txt P=1: b100 gate2 k2951, then b30 gate2 k2951/k2953.
- 11:58 resume. Live: b100chsc2_4x (35 min), b100gate2_4x (8 min). Result: ungated chunk 8x + granScale4 (pool 64000) book30k k2951 .5145 (chunk 4x .5155 => -.001; chunk 8x pool 32000 .512). Pool size alone does not make 8x beat 4x.
Launched b30gate2sc_8x k2951 (gate2 + granScale4, 8x).
- b100chsc2_4x k2951 (ungated chunk, pool 64000 via granScale 2): .523 (trace .504 +.019; chunk pool 32000 .496; gate1 .5145). chunkRec 54925, turnover 65456. 100k loss was pool capacity. Control needed: trace + pool 64000 without chunk.
- b100gate2_4x k2951 .5105 (trace .504 +.0065; gate1 .5145; ungated .496; ungated+pool64k .523). chunkRec 28650, chunkFull(1st sightings refused) 29178, turnover 40410. Running: b30gate2sc_8x k2951, b30gate2_4x k2951 (then k2953), b100sc2_4x control.
- b30gate2sc_8x k2951 .5145 (= ungated 8x+pool64k exactly: pool never full at 30k so gate2 is inactive, as designed). vs chunk 4x .5155 => 8x -.001.
- b30gate2_4x k2951 .515 (trace .4955 +.0195; ungated .5155); chunkFull 3 (pool barely full at 30k). 8x gate2+pool64k k2951 .5145 vs 4x .515 => -.0005. Running: b30gate2_4x k2953, b30gate2sc_8x k2953, b100sc2_4x control.
- 12:53 resume. b30gate2_4x k2953 .5065 (trace .493 +.0135; = ungated .5065). gate2 30k tune 2/2 >= +.008: MET. Live: b100sc2_4x control, b30gate2sc_8x k2953.
- ~13:10: box processes barely advance between calls (etime +5 s over several minutes of waiting); runs progress only intermittently. Live: b100sc2_4x (35 min), b30gate2sc_8x k2953, b30gate2_4x k2954; queued k2955.
- b30gate2_4x k2954 .504 (trace .4945 +.0095; = ungated .504; chunkFull 0).
- b30gate2sc_8x k2953 .507 vs gate2 4x .5065 (+.0005). 8x vs 4x: -.0005/+.0005 => pre-reg 8x >= 4x+.003 FAILS.
- b30gate2_4x k2955 .4815 (trace .4675 +.014; = ungated). gate2 30k: 4/4 positive, identical to ungated (pool not full).
Launched book100k trace baselines k2953/k2954 (needed for new-seed confirmation).
- CONTROL b100sc2_4x k2951 (trace + pool 64000, NO chunks): .5015 (trace 32k .504). => pool alone gives nothing; the .523 of chunk+64k is the chunks given room (+.0215 over control).
  bins (seen0/1/2-4/5+): trace .327/.551/.596/.500; trace64k .327/.551/.577/.500; chunk64k .336/.542/.592/.525; gate2 32k .346/.495/.592/.512.
  Candidate for confirmation: granChunk + granChunkGate 2 + granScale 2 (pool 64000 at 4x; gate2 inert until the pool is full). New seeds: book30k k2954/k2955, book100k k2953/k2954.
Queued: r135x (b30cand k2954/k2955, b100cand k2953) P=1 now; r135y (b100cand k2954) after baselines finish.
- RESULTS.md R135 partial written.
- 13:39 resume: live b100fast k2953/k2954 (20 min), b30cand k2954 (8 min); waiter for b100cand k2954. Nothing relaunched.
- ~13:45 (box clock): box is mostly suspended between calls (runs advance ~4 min per ~20 min real). Queued sw/q_r135chain.sh: after all bookdiag runs -> regressions (sw/jobs_xcand.json -> sw/out/xr135.jsonl, P=3) -> test_core (sw/logs/tc135.log) -> spikefoundry (sw/logs/sf135.log, ends CHAINDONE).
  Pending results: b100fast k2953/k2954 (baselines), b30cand k2954/k2955, b100cand k2953/k2954. Commit after checking (code uncommitted: granChunkGate 1/2, granScale, test_core R135 block).
- 14:03: book100k trace baselines k2953 .5015, k2954 .502. b30cand_4x k2954 .5045 (trace .4945 +.010). Running b30cand k2955, b100cand k2954; b100cand k2953 next.
- b30cand_4x k2955 .484 (trace .4675 +.0165). book30k candidate new seeds 2/2 >= +.008. Running b100cand k2953/k2954. Started an early test_core (sw/logs/tc135a.log).
- test_core (with R135 block) ALL OK (sw/logs/tc135a.log). Waiting for b100cand k2954 (36 min) / k2953 (24 min).
- b100cand_4x k2954 .5265 (trace .502 +.0245). chunkRec 48403, chunkFull 68, turnover 57794. k2953 running (49 min).
- b100cand_4x k2953 .519 (trace .5015 +.0175; chunkFull 9881). Candidate CONFIRMED on new seeds: book100k +.0175/+.0245, book30k +.010/+.0165. Regressions (xr135) running.
- Regressions (candidate vs trace, fitness): order3 9.7 x3 / 1x =; seqchoice order2+cycle 8 seeds bit-identical; K4 =; text1000 4x 8.13/8.07/8.09 -> 8.86/8.85/8.92 (+.78), 1x 7.98->8.605; fables4000 4x 4.556/4.489/4.588 -> 4.629/4.571/4.688 (+.085), 1x 4.519->4.59. No regression. Chain now on test_core rerun + spikefoundry.
- spikefoundry 10 PASS (test_core ALL OK in tc135a). Committed 7e20a207 (R135) as Grok Bot; bundle afed1aba..relgrowth refreshed + verified (head 7e20a207). Not pushed. R135 DONE.

# R136 (15:30): granPhrase (2nd level: w2|w1|partial|letter) + granGrow (pool cap f x granN, born granN, grows when the pressure gate would refuse). Off = bit-identical (smoke ok). Headroom + pre-reg in RESULTS.md (W3 ~ W2: predicted small).
Running sw/jobs_r136a.txt P=3: b100full (grow3+phrase) k2951/k2953, b100phr (scale2+phrase) k2951, then b30full k2951/k2953, b100phr k2953. Baselines R135 cand b100 .523/.519; b30 gate2 .515/.5065.
- 16:20 resume: live b100full k2951/k2953, b100phr k2951 (48 min CPU, near end). Nothing relaunched.
- b100full_4x k2951 (grow3+phrase) .5115 vs R135 cand .523 (-.0115), trace .504. Pool grew 32000->96000 (cap hit), then 43120 refusals; phraseRec 55461 (phraseFired 65418) vs chunkRec 39377 (cand 54925): phrase units crowd out chunks.
- b100full_4x k2953 .512 vs cand .519 (-.007). b100phr_4x k2951 (scale2+phrase, no grow) .5085 vs .523 (-.0145). => phrase units NEGATIVE at book100k (as the W3~W2 headroom predicted; worse: they crowd chunks). Killed the queued b100phr k2953 (redundant).
- One principled variant: granPhrase=2 (phrases always 2nd-sighting gated, leaving the pool to chunks). Plus grow-only (no phrase) to test the demand-grown pool vs granScale 2. sw/jobs_r136b.txt queued after b30full runs.
- b30full_4x k2951 .5155 vs gate2 .515 (+.0005; no loss); pool grew 32000 -> 53655, phraseRec 27160.
- b30full_4x k2953 .5045 vs gate2 .5065 (-.002; within the .003 allowance). Running b100grow k2951/k2953; then b100phr2 k2951. test_core+spikefoundry running (tc136/sf136).
- 17:10 resume: live b100grow k2951/k2953 (11 min CPU), test_core (tc136). b100phr2 queued in r136b runner.
- test_core ALL OK (incl. R136 block), spikefoundry 10 PASS (tc136/sf136).
- Committed eade7c41 (R136 flags + negative results, grow-only/phrase2 pending); bundle refreshed + verified (head eade7c41). Waiting for b100grow k2951/k2953, b100phr2 k2951.
- ~17:25: stopping the turn; box advances only intermittently. Still running unattended: b100grow k2951/k2953 (~24/60 min CPU), then b100phr2 k2951 (same runner, sw/jobs_r136b.txt). Compare grow vs R135 cand .523/.519; phr2 vs grow k2951. Add to RESULTS.md + commit as a follow-up.
- 17:23 resume (R136 follow-up + R137 start). live: 00:24:30 b100grow_4x 00:24:30 b100grow_4x 
- R137 headroom (sw/headroom3.js, sw/out/hr3.jsonl): words clustered offline (k-means on next-word first-2-letter profile, K 4/16/64). Hard-backoff count models with
  categories are all <= W2. Evidence-summing (readout-like) mix: +categories vs words-only, k2951/k2953: 30k -.0035..-.005 / +.002..+.0065; 100k -.0075..-.0015 / -.002..+.0095;
  300k +.005 / +.0035..+.0105. => category upper bound ~0 at 100k, ~+.005 at 300k. Pre-reg +.005 at book100k unlikely.
- R137 granCat implemented (smoke: off bit-identical, on catK/catN 6, catRec 18). Pre-registered. Running sw/jobs_r137a.txt P=1 (b100cat k2951, k2953, b30cat k2951, k2953) alongside the R136 runner.
- ~17:30 (box clock): box frozen most of the time (CPU +3 min per ~10 min of waiting). Stopping the turn. Unattended: R136 runner (b100grow k2951/k2953 at 32 min, then b100phr2 k2951), R137 runner sw/jobs_r137a.txt (b100cat k2951 at 4 min, then k2953, b30cat k2951/k2953). test_core has the R137 block (not yet run). Code uncommitted: granCat (net.js/base.js/test_core.js).
- b100grow_4x (chunk+gate2+granGrow3, no phrase): k2951 .5135, k2953 .51 vs R135 cand (granScale2) .523/.519 => -.0095/-.009. Pool grew 32000 -> 62262/68014 (never full) yet worse: demand-grown pool does NOT replace granScale 2. Running b100cat k2951 (32 min), b100phr2 k2951.
- test_core ALL OK (incl. R137 granCat block; sw/logs/tc137.log); spikefoundry running.
- 18:21 resume; spikefoundry 10 PASS (sf137).
- Grow vs fixed-64k diagnosis (existing logs, k2951/k2953): exact-tuple fires grow 1.56M/1.55M vs fixed 64k 2.06M/2.04M (trace 32k 1.89M/1.84M); mean active granules 3.5 vs 5.4;
  chunk recruits equal (54326 vs 54925). Bins k2951 (seen1/2-4/5+): grow .523/.573/.517 vs fixed .542/.592/.525. => grow loses 4-letter TUPLE coverage, not chunks.
  Cause = starting size: fixed 64k is born with 64k random-claw tuple detectors; grow is born with 32k, adds slots only for refused first chunk sightings, while
  tuple recruits and 2nd-sighting chunk recruits keep evicting tuple detectors from the start. Timing secondary. A self-calibrating fix would grow on any eviction of a used detector (not built).
- 18:31 b100cat_4x k2951 heldAcc .5125 (R135 cand .523, -.0105). catK 64, catRec 25422, chunkRec 34680 (cand 54925), exact 1.82M (cand 2.06M): category keys crowd out chunks/tuples like phrases did. Pre-reg range -.004..+.003 missed on the low side.
- 18:59 b100phr2_4x k2951 .5105 (grow-only .5135, cand .523). phraseRec 6024, pool 62949. Negative. R136 follow-up complete.
- 19:03 committed ab4dd26d (R136 follow-up + granCat code + cat k2951); bundle refreshed + verified.
- 19:11 R137 stopped by the requester (not Travis) (k2953/b30cat killed). granCat refuted, noted in RESULTS. Starting R138 (separate L2 pool).
- 19:28 R138 built (granL2, granL2N, granEvGrow); test_core rerunning (tc138); pre-reg in RESULTS; launching sw/jobs_r138a.txt (10 book100k runs, P=3).
- 19:33 first launch P=3 OOM-killed two 8x runs (3 x 8x does not fit in 16 GB); relaunched as two P=1 queues (8x serial + 4x serial).
- 19:42 tc138 ALL OK, sf138 10 PASS; committed 821bc6c7 (R138 code + pre-reg, R137 refuted note); bundle verified. Running: b100cand_8x k2951 (8x queue), b100L2phrEq_4x k2951 (4x queue).
- 20:01 resume: 3 runners live (8x queue: b100cand_8x k2951; 4x queues: b100L2phrEq_4x k2951, b100L2catEq_4x k2953), not relaunched; mem avail ~2 GB.
- 20:56 b100L2phrEq_4x k2951 (4x, L1 64k + L2 64k phrases) .5175 vs R135 4x .523 = -.0055 (no-loss -.003 FAILS on seed 1). L1 intact (exact 2.03M vs 2.06M, chunkRec 51547 vs 54925); 65046 phrase recruits, 70666 phrase fires (~1 fire each): crowd-out removed, but single-use L2 units still cost the readout ~.005.
- 21:01 b100L2catEq_4x k2953 (4x, L1 64k + L2 64k categories) .5175 vs R135 4x .519 = -.0015 (no-loss met on this seed). L1 intact (exact 2.02M, chunkRec 51043); catRec 43491, catFired 68733.
- 21:13 8x queue reordered (cand 2951 running; then L2cat_8x 2951, cand_8x 2953, L2cat_8x 2953, L2phr2_8x 2951): cat chosen for 8x (4x Eq cat -.0015 vs phrase -.0055); L2phr_8x dropped. Queued recurrence-gate test b100L2phr2Eq_4x (granPhrase 2 = phrase units only on 2nd sighting) k2951/k2953. Memory allows only one 8x at a time.
- 22:02 resume: live = cand_8x k2951, phrEq_4x k2953, catEq_4x k2951 (not relaunched). Split the queued phr2Eq_4x k2951/k2953 into two single-job queues so both gate runs go in parallel when the 4x slots free; L2cat_8x k2951 waits for the 8x slot.
- 22:16 cand_8x k2951 OOM-killed at 2h39m CPU (memory-guard race: both phr2Eq_4x started when phrEq_4x ended, then L2cat_8x started too = 4 procs). Result: phrEq_4x k2953 done (below). L2cat_8x k2951 SIGSTOPped until catEq_4x k2951 ends; cand_8x k2951/k2953 + L2cat_8x k2953 moved to a serial 8x chain (sw/q_r138_8x.sh, starts only when no 8x runs).
- 22:16 b100L2phrEq_4x k2953 .517 vs R135 4x .519 = -.002 (phraseRec 65054, phraseFired 53750 = <1 fire per unit; exact 2.03M, chunkRec 51107). phrEq mean -.00375: no-loss target fails narrowly.
- 22:20 b100L2catEq_4x k2951 .522 vs .523 = -.001 (catRec 47234, catFired 110097 = 2.3 fires/unit). catEq mean -.00125: 4x no-loss target MET for categories (2/2). L2cat_8x k2951 resumed (SIGCONT); running: L2cat_8x k2951, phr2Eq_4x k2951/k2953; chain then cand_8x k2951.
- 22:52 resume: live = L2cat_8x k2951 + phr2Eq_4x k2951/k2953 (1x8x + 2x4x, the cap); not relaunched. Remaining queues: two single-job 4x runners (exit after phr2Eq), serial 8x chain q_r138_8x.sh (cand_8x k2951 next, starts only when no 8x runs; no new 4x jobs queued).
- 23:35 RECURRENCE GATE b100L2phr2Eq_4x (granPhrase 2: phrase units only on 2nd sighting, own 64k L2 pool): k2951 .5215 (-.0015 vs .523; ungated -.0055), k2953 .5195 (+.0005 vs .519; ungated -.002). Mean -.0005: gate removes the loss, adds nothing. Only 6152/5151 phrase units (4.2/3.7 fires each), i.e. the 64k L2 pool stays ~90% empty.
- 23:36 4x slots free while the 8x pair runs: launched granEvGrow test b100evgrow_4x k2951/k2953 (chunk + gate2 + granGrow 3 + granEvGrow 1; vs grow-only .5135/.51 and fixed 64k .523/.519). Cap kept: 1x8x + 2x4x.
- 23:42 resume: live = L2cat_8x k2951 + evgrow_4x k2951/k2953 (cap 1x8x + 2x4x); not relaunched; 8x chain waiting (cand_8x k2951 next).
- 00:19 b100L2cat_8x k2951 (8x, L1 64k + L2 64k categories) .5155 vs R135 4x .523 = -.0075 (target >= +.003 FAILS); vs 4x same pools (catEq) .522 = -.0065. L1 intact (exact 2.05M, chunkRec 51528), catRec 47275 / 110616 fires (same as 4x). So the loss is the 8x network itself, not L2; cand_8x k2951 (running) will confirm.
- 00:31 granEvGrow b100evgrow_4x (chunk+gate2+granGrow 3+evGrow): k2951 .5165, k2953 .5115 vs grow-only .5135/.51 (+.003/+.0015) vs fixed 64k .523/.519 (-.0065/-.0075). Pool grew 32000 -> 66807/73846 (evGrown 34772/41815), but exact-tuple fires stay 1.56M/1.55M (fixed 64k 2.06M): grown slots get no random claws, so eviction-triggered growth keeps learned detectors but does not restore the born random-tuple coverage. Partial fix only; fixed 64k still better.
- 00:33 resume: cand_8x k2951 running (16 min CPU, ~2.5-3 h total); 8x chain killed (no more runs queued; cand_8x k2953 / L2cat_8x k2953 dropped).
- 00:33 DIAG 8x vs 4x with identical pools (L2cat_8x vs L2catEq_4x, k2951; sw/diag8x.js): granule side identical (exact 2.05M vs 2.03M, meanActiveGran 5.4/5.4, chunkRec 51528/51521, catRec 47275/47234, lag-column cross-talk cr identical to 3 decimals, granFrac .423/.422). Only the non-granule cortex path differs (other drive 89.3M vs 87.6M; cortex 14474 vs 7224 cells). Only 47/2000 held predictions differ (8x loses 30, gains 17: net -13 = -.0065, ~1.9 sigma of the flip count). Loss spread over bins (unseen ctx -.028 n=107, 5+ -.005) and inside-word letters (-.011); word-end +.010.
## R138 summary (plain language, 01:25; cand_8x k2951 pending)
- Idea: give second-level units (phrases / word categories) their own pool so they stop pushing out letter-tuple and chunk detectors.
- That worked as plumbing: level-1 detectors are back to R135 levels. At 4x, adding a 64k L2 pool costs nothing for categories (-.001/-.0015)
  and for recurrence-gated phrases (-.0015/+.0005); ungated phrases still cost (-.0055/-.002).
- But L2 adds no accuracy: ungated phrase units fire about once each; with the 2nd-sighting gate only ~5-6k form and the 64k pool stays ~90% empty;
  categories fire ~2 times each. At 100k letters there is too little recurrence for these keys to pay off.
- 8x target missed: 8x + L2 categories .5155 vs 4x same pools .522. The granule side is identical at 8x and 4x; only 47 of 2000 predictions differ
  (~1.9 sigma), so the gap is noise from the larger non-granule cortex path, not a scaling collapse.
- Grow-on-eviction helps grow-only a bit (+.003/+.0015) but stays ~.007 below a fixed 64k pool, because grown slots get no random tuple claws.
- Takeaway: separate tiers are the right structure, but the level-2 content needs more recurrence (longer text or coarser keys) before it can earn readout weight.
- 01:23 committed d230ee0e (R138 results + summary), bundle verified; waiting for cand_8x k2951.
- 03:01 b100cand_8x k2951 = .530: +.007 vs R135 4x .523 (would meet 8x >= 4x + .003 on this seed), +.0145 vs L2cat_8x .5155. Exact fires 3.96M vs 2.06M (4x), active granules 11.4 vs 5.4; 78/2000 predictions differ vs 4x (+46/-32, ~1.6 sigma), gains in rare contexts (seen 1 and 2-4: +.028).
## R138 summary update (03:01)
- The plain 8x candidate is the best result so far (.530, one seed): at 8x the shared pool holds 128k random 4-letter detectors, twice as many as 4x, and they help in rarely seen contexts.
- The L2 split hurt at 8x because it gave half of that pool to level-2 units that rarely recur, instead of to tuple detectors.
- So what scales with brain size at book100k is born tuple coverage, not level-2 phrase or category keys. Next check (not run): cand_8x on k2953 plus a 4x run with a 128k pool (granScale 1) to separate pool size from cortex size.
- 03:01 committed ad054de1, bundle verified. Nothing running.
- 03:02 R139 pre-registered; launched 8x serial chain (cand_8x k2953 -> k2954) + 4x queue P=2 (pool128_4x = cand 4x + granScale 1, k2951/k2953/k2954). Cap 1x8x + 2x4x.
- 03:52 resume: nothing finished or died; live = cand_8x k2953 + pool128_4x k2951/k2953 (50 min CPU each), 8x chain (k2954 next) and 4x queue (k2954 next) intact, so nothing relaunched. Mem avail ~0.5-1 GB (guard: SIGSTOP pool128 k2953 if < 400 MB).
- 03:55 OOM again: cand_8x k2953 killed at ~50 min (8x 5.7 GB + two 128k-pool 4x at 2.2 GB each + ~3.5 GB other did not fit). Killed the restarted cand_8x k2954 (3 min in) and the old queues. New plan (sw/q_r139b.sh): finish pool128_4x k2951/k2953; then cand_8x k2953 + pool128_4x k2954 together; then cand_8x k2954 alone (max 1x8x + 1x4x).
- 04:51 pool128_4x k2951 .5295 (4x 64k .523: +.0065; cand_8x .530: -.0005), exact 3.97M vs 8x 3.96M, active gran 11.3 vs 11.4 => on k2951 the whole 8x gain is the 128k pool. pool128_4x k2953 .5215 (vs .519: +.0025; exact 3.91M). Now running: cand_8x k2953 + pool128_4x k2954 (q_r139b.sh), then cand_8x k2954 alone.
- 06:42 pool128_4x k2954 .5255 vs 4x .5265 = -.001 (exact 4.08M, active 11.6, chunkRec 48483). pool128_4x over 64k: +.0065 / +.0025 / -.001 (mean +.0027). cand_8x k2953 running (~1h53 CPU), then cand_8x k2954.
- 07:39 cand_8x k2953 .5215 vs 4x .519 = +.0025 (< .003); equals pool128_4x k2953 .5215 exactly (exact 3.85M vs 3.91M, active 10.6 vs 10.8). So far 8x = 4x+128k pool on both seeds (k2951 .530 vs .5295). cand_8x k2954 running (last run).
- 10:42 cand_8x k2954 .5255 vs 4x .5265 = -.001; equals pool128_4x k2954 .5255 exactly.
## R139 result
- cand_8x vs 4x(64k): .530/.5215/.5255 vs .523/.519/.5265 = +.007/+.0025/-.001 (mean +.0028; pre-reg +.003 not met).
- pool128_4x: .5295/.5215/.5255 = identical to 8x within .0005 on all 3 seeds.
- Conclusion: brain size adds nothing at book100k; the whole 8x effect is the doubled random tuple pool, and that effect is small/inconsistent (+.0027 mean). Pool size is the only scaling lever here, and it is near saturation for 100k letters. Not promoted.
## R140 (longer look-back, extremes first)
- 07:20 built P.lagDepth / P.lagBlur (net.js guLagEvent / guLagFire: symbol-level delay register to D, copy detectors (c, far lag, x)); probe source 'delaycopy' + sw/lagprobe140.js; run/r140/headroom.js.
- Probe headroom 30k: count o1-o8 .22-.30 (chance .25); copy memory D8 .33, D16 .53-.59, D32 1.0. 1x 6k smoke: off .25, D32 .49, D32 blur .51.
- Pre-registered in RESULTS.md. Queue A (run/r140/q.sh, 2x4x): probe off/x32/b32 + book30k x32/b32, k2954/k2955 (book baselines .5045/.484).
- 08:12 probe off 4x (30k): k2954 .225, k2955 .208 (chance .25; bins 5-8/9-16/17-31 ~.17-.27). Queue B (D16 exact/blur, probe + book30k) chained after A.
- 08:45 box was rebooted/restored ~08:28 (sw/out and run/r13x/out wiped; restored tracked files from git; lp_p_off jsons lost, numbers above). Queue A remainder + B relaunched as run/r140/jobs_ab.txt (P=2).
- 09:01 book30k D32 exact k2954 .460 vs cand .5045 = -.0445 (BIG LOSS). lagRec 4487, copy fires 3.1M (~100/window), active granules 17.1 vs 6.9, granule drive share .56 vs .39: copy keys (current letter, lag, letter) are too broad in text (common letters sit at some far lag almost always) and swamp the readout.
- 09:12 1x book10k screens k2954: off .458, D32 .4045, D32+lagCtx 3 (key = last 3 letters + far letter) .448 (fires 61k vs 669k). Running 1x D32blur/D16/D8.
- 09:16 1x book10k k2954: D32 blur .4545 (-.0035, 695 recruits), D16 .4325, D8 .452 (loss tracks copy recruits/fires). Running 1x b32c2/b16/b32c3.
- 09:20 PROBE 4x D32 exact k2954 .607 vs off .225 (bins 5-8 .565, 9-16 .584, 17-31 .629): real long context. 1x book10k k2954: b32c2 .4465, b16 .457 (-.001), b32c3 .446. Stopped queue AB after x32 (book x32 k2955 + probe x32 k2955 still running, not killed); queue C (q2.sh): probe b32/b16/x16 + book b16/b32, k2954/2955.
- 09:24 1x book10k k2955: off .4475, b16 .4435, b8 .4525 (1x 10k noise ~+-.01).
- 09:28 1x book10k b8 (D8 blur): k2954 .463 (+.005), k2955 .4525 (+.005): possible hot spot. Queue D: b8 4x book + probe first, then queue C. 1x refine b6/b12.
- 09:32 1x book10k blur depth curve (k2954/k2955, off .458/.4475): D6 .4595/.451, D8 .463/.4525, D12 .4615/.447, D16 .457/.4435, D32 .4545/-. Hump at D8 (+.005/+.005, within 1x noise).
- 09:39 book30k 4x D32 exact k2955 .4455 vs .484 = -.0385 (k2954 -.0445). D32 exact is refuted on book. test_core ALL OK with lagCtx test.
- 09:45 PROBE 4x D32 exact k2955 .571 vs off .208 (+.363; bins .45/.56/.61). Pre-reg >= .60 both seeds: missed on k2955 (.571), long context clearly real. Committed 501e983f, bundle refreshed.
- 09:54 P.lagGate (utility gate: recruit a copy key only if its lower-bound hit rate beats the net's own prediction and the bigram). 1x book10k k2954/k2955 (off .458/.4475): x32g .4435/.443, b32g .4575/.453. 1x probe 6k x32g .2456 (= off: exact keys never reach n>=3 in 110 segments).
- 09:58 1x probe 6k k2954 (new probe): off .246, b32 .509, b32+gate .509 (123 recruits vs 251). Blur + gate keeps the probe gain and is ~neutral on book 1x: next 4x candidate.
- 09:59 book30k 4x D8 blur: k2954 .5085 (+.004), k2955 .4835 (-.0005); 266/264 copy recruits. Small, not >= +.003 on both. Queue F (q2.sh jobs_f): b32+gate book, probes b32g/b8/b32, book b32.
- 10:18 book30k 4x D32 blur + gate: k2954 .4965 (-.008), k2955 .484 (.000); 318/302 recruits. Gate removes most of the D32 loss but not all. Queue G: probes b32g (running), book b6, probes b8, book b12 (refine around D8 blur).
- 10:56 PROBE 4x D32 blur + gate: k2954 .604, k2955 .574 (off .225/.208; = exact D32 .607/.571) with only 167/165 copy detectors (exact 1906/1911). Blur+gate keeps all the probe gain. (q2 race relaunched p_b32g k2954 after it finished; duplicate killed, q2.sh now rechecks.)
- 10:58 added P.lagGate=2 (reference = max(net's own prediction, trigram count rate P(x | last 3 letters)) instead of the bigram). Queue H: book b32g2, probes b8, book b12, probe b32g2.
- 11:15 book30k 4x D6 blur: k2954 .506 (+.0015), k2955 .4885 (+.0045); mean +.003, both positive (D8 blur mean +.0018). Book hot spot = short blur (lags 4-5/4-7), i.e. one more blurred letter, not long context.
- 11:33 book30k 4x D32 blur + lagGate 2: k2954 .4955 (-.009), k2955 .482 (-.002); 304/293 recruits (gate 1: -.008/.000, 318/302). Trigram reference does not remove the D32 book loss.
- 11:40 diag: D32 blur+gate detectors are few (~300) but broad: ~1.1M fires (each ~12% of windows; D6 blur 0.35M, D8 0.75M), active granules 10.5 vs 6.9. Gate passes keys on early small-n luck; book loss tracks fires, not recruits.
- 12:06 PROBE 4x D8 blur: k2954 .272, k2955 .221 (off .225/.208): gains only in lags 5-8 (k2954 .50); no long context. Running book D12 blur, then probe b32g2 k2954.
- 12:25 built P.lagPrune (free a copy detector when its running hit-rate UCB < bigram reference; key banned) and P.lagSurp (copy detector fires only when its precision beats the short-context (3-letter) count confidence). 1x book10k k2954 on b32g (.4575; off .458): +prune .461 (86 pruned), +surp .461 (fires 39k vs 302k). 1x probe 6k b32g+prune+surp .421 (b32g .509, off .246).
- 12:24 book30k 4x D12 blur: k2954 .4995 (-.005), k2955 .481 (-.003). Blur depth curve on book (4x, vs .5045/.484): D6 +.0015/+.0045, D8 +.004/-.0005, D12 -.005/-.003, D32+gate -.008/.000.
- 12:43 book30k 4x b32g + lagPrune k2954 .497 (-.0075; b32g .4965).
- 12:58 PROBE 4x b32 + lagGate 2 k2954 .604 (= gate 1 .604; off .225). Queue H done.
- 13:01 book30k 4x b32g + lagSurp k2954 .5045 (= baseline .5045; b32g -.008): surprise gating removes the book loss on this seed.
- 13:16 book30k 4x b32g + lagPrune k2955 .4795 (-.0045). lagPrune refuted (-.0075/-.0045). Dropped prune probes; queue J = probes b32g+lagSurp k2954/k2955. Added lagSurp 0<v<1 = softer threshold (precision > v x confidence).
- 13:19 book30k 4x b32g + lagSurp k2955 .4815 (-.0025). lagSurp book: .5045/.4815 vs .5045/.484 = .000/-.0025 (no-loss within .003).
- 13:50 PROBE 4x b32g + lagSurp k2954 .497 (b32g .604, off .225): keeps ~70% of the gain. Added lagSurp 2 (Laplace-smoothed short-context confidence: rare contexts no longer look confident).
- 13:52 PROBE 4x b32g + lagSurp k2955 .485 (b32g .574, off .208). lagSurp probe .497/.485 = keeps +.27/+.28 of +.38/+.37. Queue K: lagSurp 2 (smoothed) and 0.5 (soft) on probe + book.
- 14:09 book30k 4x b32g + lagSurp 2 k2954 .505 (+.0005). test_core ALL OK with lagSurp 2 / 0.5 tests.
- 14:23 PROBE 4x lagSurp 2 k2954 .530 (lagSurp 1 .497, ungated .604, off .225); book k2954 .505.
- 14:40 book30k 4x lagSurp 0.5 k2954 .5015 (-.003).
- 14:43 PROBE 4x lagSurp 0.5 k2954 .587 (fires 795k vs 120k for lagSurp 2). Pareto so far k2954 (probe / book delta): ungated .604/-.008, S0.5 .587/-.003, S2 .530/+.0005, S1 .497/.000. Queue Sh book k2955 next.
- 14:58 book30k 4x lagSurp 2 k2955 .483 (-.001). lagSurp 2 book .505/.483 vs .5045/.484 = +.0005/-.001: no-loss on both.
- 15:16 lagSurp 2 PROBE k2955 .508 (off .208; ungated .574). lagSurp 0.5 book k2955 .4795 (-.0045): fails no-loss; its k2955 probe stopped (not needed). WINNER = D32 blur + lagGate 1 + lagSurp 2: probe .530/.508 (+.305/+.300 over off), book30k +.0005/-.001. Confirm: new seeds k2956/k2957 (cand + winner book, winner probe) running, then cross-task, then book100k.
- 15:33 cand book30k 4x k2956 .5345 (new-seed baseline).
- 15:37 cand book30k 4x k2957 .488.
- 15:52 R140 confirm: winner S2 book30k k2956 .5405 vs cand .5345 (+.006). Probe k2956 started.
- 15:55 R140 confirm: winner S2 book30k k2957 .4955 vs cand .488 (+.0075). Both new seeds no loss.
- 16:24 R140 confirm: winner S2 probe k2956 .569 (5-8 .50, 9-16 .567, 17-31 .586); off ~.21-.22, depth-8 copy ceiling .33.
- 16:27 R140 confirm: winner S2 probe k2957 .515 (5-8 .537, 9-16 .518, 17-31 .509). Step 1 done: probe holds on 4 seeds (.530/.508/.569/.515). Chain: cross-task next.
- 16:50 R140 cross-task running (reg.js, 56 jobs). seqchoice order2/cycle identical cand vs S2 on all seeds: diag shows seqchoice never engages the granule pool; order3 recruits/fires copy detectors (S2 3 rec/77 fires) but acc unchanged .94. text/fables are the real test.
- 17:00 R140 cross-task done: all tasks within the -.05 bound. fitness d: order2/cycle/order3/K4/text +.000, fables -.043 (acc .4397->.4363, worse on all 3 seeds). book100k S2 started k2951/k2953 (17:00), k2954 queued.

# R141 (Nov 23, 09:55 CT): fables loss of the R140 winner + book100k confirm
- State found: box was frozen, not rebooted. chain.sh resumed; book100k S2 k2951/k2953 (bookdiag, 100000) still running (~80 CPU-min at 09:50), k2954 queued by q2.sh. Pre-reg for them is the R140 one (>= -.003 each vs .523/.519/.5265).
- PRE-REGISTRATION R141a (written before any run): fables4000 4x, k2951/2952/2953 (cand fitness/acc known from xr140; S2 -.043 fitness / -.0033 acc, worse on 3/3).
  H: the loss comes from copy detectors passing the surprise gate in a short text: at 4000 letters most 3-letter contexts are seen a few times, so the
  add-one smoothed confidence (lagSurp 2) is low almost everywhere and far-back detectors drive the readout on many letters.
  Extremes first (Travis t131u): G = D32 blur + lagGate 1, no surprise gate (max firing); S1 = D32 blur + gate 1 + lagSurp 1 (unsmoothed confidence, quieter);
  D8S2 = lagDepth 8 + blur + gate 1 + lagSurp 2 (short look-back, same gate).
  Predictions: G fables d <= -.043 (worse or equal to S2); S1 d >= -.015; D8S2 between S1 and S2.
  Pass for a fix: fables fitness mean d >= -.010 vs cand and no seed worse by > .03, with known tune results probe >= .45 and book30k >= -.003
  (S1 already has probe .497/.485, book .000/-.0025). If H holds and S1 passes -> confirm S1 on fresh seeds (fables k2954-2956, book30k k2956/2957,
  probe k2956/2957, cross-task). If G is NOT worse than S2, H is refuted (the loss is not firing volume) -> look at lagDepth / readout instead (bisect D16).
  Jobs: run/r141/jobs_fab.json -> run/r141/out/xf141.jsonl (sw/reg.js, P=2, alongside the 2 book100k runs).
- 09:49 book100k S2 4x: k2951 .5305 vs cand .523 (+.0075), k2953 .529 vs .519 (+.010). Pre-reg (>= -.003) MET on 2/2 so far; k2954 started 09:49 (vs .5265).
- 10:10 R141a RESULTS (fables4000 4x fitness d vs cand, k2951/2952/2953; acc d mean): S2 -.034/-.078/-.017 = -.043 (acc -.0033);
  G (no surprise gate) -.107/-.120/-.036 = -.088 (acc -.0063); S1 -.059/-.018/-.026 = -.034 (acc -.0037); D8S2 -.029/+.033/-.058 = -.018 (acc -.0017).
  Prediction G <= S2: MET (loss grows with copy firing). Prediction S1 >= -.015: FAILED (smoothing is not the lever). No arm passes the fix gate (>= -.010).
  Per quarter (acc d, S2): .000/+.002/-.008/-.006 -> loss is late in the life (when copy detectors exist), not early luck. Log-loss is BETTER with S2
  (bits -.017; G -.019; D8S2 -.009): the copy detectors add correct probability mass but flip some argmax choices. The loss is ~13 letters/seed of 4000.
- PRE-REGISTRATION R141b (before running): is the fables loss real beyond the 3 cross-task seeds? cand vs S2 fables4000 4x on fresh k2954/k2955/k2956
  (run/r141/jobs_fab2.json -> run/r141/out/xf141b.jsonl). If the fresh-seed mean d >= -.010 fitness, the R140 loss is seed noise (report the 6-seed mean);
  if <= -.03 on >= 2/3 seeds, it is real -> next a code fix that scales a copy detector's readout vote by its evidence (self-calibrating, no constant).
  Secondary: bits (expect S2 lower, as on k2951-2953).
- 10:20 R141b RESULTS (fresh seeds, S2 vs cand fables4000 4x): fitness d k2954 +.051, k2955 +.001, k2956 -.076 = -.008 (pre-reg ">= -.010 = noise" MET);
  acc d -.001/-.003/-.005 (mean -.0030); bits -.054/-.026/+.021 (mean -.020, better). 6-seed: fitness -.0255 (sign 2+/4-), acc -.0032 (0+/6-), bits better 5/6.
  Reading: the fitness loss is within seed noise, but a small accuracy cost (~13 of 4000 letters) is consistent on 6/6 seeds while log-loss improves:
  copy detectors add correct probability mass yet flip a few argmax choices. Next fix candidate (not yet coded): scale a copy detector's readout vote by
  its own evidence (hits / sightings lower bound) so young detectors cannot flip the argmax. book100k k2954 still running.

# R142 (Nov 23, 10:35 CT): evidence-weighted vote for far-back copy detectors (P.lagEvid)
- History: unpushed commits after 7e20a207 stripped of 63 raw sw/out dumps > 1 MB (Travis approved, t136u); old head tagged pre-strip (8c225f7b);
  new head b0e789cc pushed to origin cursor/relgrowth (fast-forward from 7e20a207). Size guard: .githooks/pre-commit + .gitignore.
- Flag P.lagEvid (default 0 = off, bit-identical, no RNG). Applies to copy detectors that pass the lagSurp gate (pp = (h+1)/(n+2) > cf).
  Evidence = lower bound lb = pp - sqrt(pp (1-pp) / (n+2)). Strong (lb > cf): full vote (held all window). Weak: vote weight w, rate-coded = held on a
  fraction w of the window's substeps (deterministic accumulator). lagEvid 1: w = 0 (weak detectors silent); 0 < v < 1: w = v; 2: w = (lb - cf) / (pp - cf) clipped to [0,1].
- PRE-REGISTRATION R142 (before any run). Base = R140 winner S2. Extremes first: E1 (w = 0) and E2 (graded); bisect (v = 0.5, ...) only if E1 fixes fables
  but loses the probe. Tune: fables4000 4x k2951-2953 (S2 fitness -.043, acc -.0033 vs cand); probe + book30k 4x k2954/k2955 (S2 .530/.508, book .505/.483; cand book .5045/.484).
  Pass: fables fitness mean d >= -.010 AND acc mean d >= -.001 vs cand; probe >= .45 on both; book30k >= cand - .003 on both.
  Prediction: E1 fables acc d ~ -.001..+.001 (most of the cost gone), probe .42-.50 (young detectors silenced costs some copy hits); E2 between S2 and E1.
  Confirm a passing arm on fresh seeds: fables k2954-2956 (cand known), book30k + probe k2956/k2957, then cross-task.
  Jobs: run/r142/jobs_fab.json -> run/r142/out/xf142.jsonl; run/r142/jobs_pb.txt (q2.sh, P=2 with the running book100k).
- 10:42 R142 fables (fit/acc d vs cand, k2951/2952/2953): E1 +.000/+.002, -.071/-.007, -.036/.000 = fit -.036, acc -.0017, bits +.028 (worse). FAILS pass.
  E2 identical to E1: BUG, the graded weight (lb - cf)/(pp - cf) is <= 0 for every weak detector by definition. Fixed: E2 w = (pp - cf)/(pp - lb) (share of the
  1-sigma interval above cf). Added lagEvid 3 = DIAGNOSTIC, every copy vote silent (recruitment unchanged): if E3 still loses on fables, the loss is not the votes.
  test_core with the first version ALL OK (10:55); re-running with the fix. Running: E3 + E2b fables (run/r142/jobs_fab2.json -> run/r142/out/xf142b.jsonl).
- 10:59 book100k S2 4x k2954 .524 vs cand .5265 (-.0025): passes (>= .5235). R140 book100k confirm COMPLETE: +.0075/+.010/-.0025 (mean +.005), 3/3 within the pre-reg.
- 11:07 R142 E3 (every copy vote silent, recruitment unchanged) fables k2951 +.015/.000, k2952 +.003/.000: no loss -> the fables cost IS the copy votes (not recruitment / register).
- 11:17 R142 RESULTS (fables4000 4x vs cand, k2951/2952/2953, fit / acc): E1 (weak silent) -.036 / -.0017; E2b (graded, fixed) -.028/-.060/-.034 = -.041 / -.0030;
  E3 (all copy votes silent) +.015/+.003/-.018 = .000 / -.0003. Probe E1 k2954 .5302 = S2 .5302 exactly with 52k fires vs 120k.
  VERDICT: evidence weighting FAILS the fables gate (pre-reg: fit >= -.010 and acc >= -.001); prediction (E1 acc ~0) failed. E3 proves the loss is the votes,
  but it comes from detectors with good evidence too (silencing the weak half changes little). No bisection (pre-reg: only if E1 fixed fables).
  Stopped E1 probe k2955 / book k2955 (decision made). Kept E1 book30k k2954 (is the halved firing free on book?). test_core: run with the fix was OOM-killed
  (EXIT 137, 4 node jobs running); rerun alone 11:18. spikefoundry 10/10 PASS (11:15).
- 11:18 E1 book30k k2954 .502 vs cand .5045 (-.0025; S2 .505). 11:34 test_core ALL OK with lagEvid 0/1/0.5/2/3 (sw/logs/tc142c.log, run alone); spikefoundry 10/10 PASS.

# R142b (Nov 23, 11:40 CT): copy votes that never overrule the short context's first choice (P.lagMarg)
- Choice (vs entropy-scaled votes): E1/E2 showed rate-scaling the votes barely matters; E3 shows the cost is votes that flip the argmax. So act on the flip directly.
  P.lagMarg (default 0 = off, bit-identical, no RNG; needs lagSurp): from the short-context counts after the last 3 letters (first choice mT with count m1,
  runner-up m2), a copy detector predicting x != mT is silent in this window when the first choice leads: lagMarg 1 = any strict lead (m1 > m2);
  lagMarg 2 = lead beyond 1 sigma (m1 - m2 > sqrt(m1 + m2), self-calibrating). Votes FOR mT, and votes in unseen / tied contexts, are unchanged.
- PRE-REGISTRATION (before any run): extremes M1 (strict) and M2 (1-sigma) on fables4000 4x k2951-2953 (S2 fit -.043 / acc -.0033 vs cand).
  Pass: fit mean d >= -.010 AND acc mean d >= -.001; then probe >= .45 (k2954/k2955) and book30k >= cand - .003 (.5045/.484); confirm on fresh seeds
  (fables k2954-2956, book30k + probe k2956/k2957). Prediction: M1 fables acc >= -.001 (flips gone), probe .40-.53 (probe contexts are mostly unseen/tied,
  so copy votes survive); M2 between S2 and M1 on fables, probe ~ S2. If M1 passes fables but loses the probe, bisect the lead threshold between M1 and M2.
- 11:58 R142b RESULTS (fables vs cand, k2951/2952/2953 fit/acc): M1 +.020/-.001, -.040/-.005, -.027/-.001 = -.016 / -.0023 (bits +.048, worse);
  M2 -.020/+.001, -.063/-.007, -.037/-.004 = -.040 / -.0033. Both FAIL (pre-reg fit >= -.010 and acc >= -.001). M1 prediction (acc >= -.001) failed:
  blocking votes against a leading 3-letter first choice removes ~30% of the cost; the rest comes from votes in contexts the 3-letter counts call unseen/tied.
  New hypothesis: there the network already predicts from the WORD context (chunk detectors, which the 3-letter counts do not see), and a far copy outvotes it.
- PRE-REGISTRATION R142c (before running): lagMarg 3 = copy votes silent in windows where the word-chunk detector of (current word, letter) fired
  (word context known -> it outranks the far copy; self-calibrating, no constant). Fables k2951-2953: pass = fit >= -.010 and acc >= -.001.
  Prediction: acc >= -.001 (close to E3). Risk: the probe (chunks may exist for filler words) -> then probe k2954/k2955 must stay >= .45 and book30k >= -.003.
  Run with P=1 (another agent's sw/standing_gen.js is running; max 3 node jobs incl. test_core).
- 12:08 R142c RESULTS (lagMarg 3, copy defers to word chunks; fables vs cand k2951/2952/2953 fit/acc): -.023/-.003, -.058/-.008, -.055/-.003 = -.045 / -.0047
  (bits -.010). FAILS and is WORSE than S2 (-.043/-.0033): hypothesis REFUTED. Copy votes in chunk windows help; the cost sits in windows with NO word
  chunk (word starts, new/rare words). No probe/book runs (pre-reg: only if fables passes). Candidate next extreme (not run): lagMarg 4 = copy votes ONLY
  in windows where the word chunk fired. test_core with lagMarg 1/2/3 running (sw/logs/tc142d.log).
- 12:16 test_core ALL OK with lagMarg 0/1/2/3 (sw/logs/tc142d.log); 12:17 spikefoundry 10/10 PASS. Code committed (flags off by default).
- PRE-REGISTRATION R142d (12:20, before any run): lagMarg 4 = the opposite extreme of lagMarg 3: far-back copy votes ONLY in windows where the word-chunk
  detector of (current word, letter) fired. Fables4000 4x k2951-2953, same gate: fit mean d >= -.010 AND acc mean d >= -.001 vs cand.
  Prediction (from lagMarg 3 = -.045 and all-silent = .000): fables acc >= -.001. Risk: probe (filler 'words' may lack chunks) -> if fables passes,
  probe k2954/k2955 >= .45 and book30k k2954/k2955 >= cand - .003 (.5045/.484), then fresh seeds (fables k2954-2956, book30k + probe k2956/k2957).
- 12:24 R142d partial: M4 fables k2951 +.007/.000, k2952 +.017/.000 (k2952 was the worst seed for S2: -.078/-.008).
- 12:27 R142d fables RESULT: M4 +.007/.000, +.017/.000, -.022/-.003 = fit +.0007, acc -.0010 (bits +.013, worse). PASSES the fables gate (acc exactly at
  the -.001 bound). Next per pre-reg: probe + book30k k2954/k2955 (run/r142/jobs_m4pb.txt, q2.sh P=2; test_core also running = 3 node jobs).
- 12:36 test_core ALL OK, but it exposed a BUG in the lagMarg 3/4 refactor: gu.xf is a Uint8Array, so "fired" was 1 / 0 / false and fired === true never held:
  lagMarg 3 never deferred (the R142c result above was run with the earlier, correct lagMarg 3 code, so it stands); lagMarg 4 as run silenced copies only when
  no owned chunk detector matched (fired === false), not when one was owned but had not fired (0). Fixed (xf === 1). Check: rerun M4 fables k2951 with the
  fix; if identical to the run above, the two definitions coincide in practice (an owned chunk detector always fires in its window) and the M4 results stand.
- 12:39 equivalence check: M4 fables k2951 with the fix = identical stats to the original run (4.636, all stats equal). M4 results stand. test_core rerun with the fix started.
- 12:57 test_core ALL OK with the fix (lagMarg 3 defers 620 again, 4 defers 1724). Started fresh-seed fables M4 k2954-2956 (P=1; probes k2954/k2955 still running since 12:28).
- 13:06 R142d RESULTS: probe M4 k2954 .242, k2955 .224 (S2 .530/.508, off .225/.208): the long-delay memory is GONE (copy fires 1.7k/2.3k vs ~120k).
  Fresh fables M4 k2954/2955/2956: -.014/-.001, -.019/-.002, -.022/-.002 = fit -.018, acc -.0017 (bits +.009, worse) -> also fails on fresh seeds.
  M4 FAILS (probe < .45; fresh fables below the gate). Stopped its book30k k2954/k2955 runs (decision made). All lagEvid / lagMarg flags stay off.

## R142 CONCLUSION (13:10 CT): should the fables cost block promotion of the R140 look-back?
- The cost: fables4000 accuracy -.0032 (0+/6- seeds, ~13 of 4000 letters); fitness -.0255 over 6 seeds (2+/4-, fresh seeds -.008 = within noise);
  log-loss BETTER on 5/6 seeds. Inside the pre-registered cross-task bound (-.05 fitness). text1000 acc -.0013, fitness .000; all other tasks identical.
- The gain: delay-copy probe .51-.57 vs ~.21 (4 seeds); book30k no loss (4 seeds, mean +.003); book100k +.0075/+.010/-.0025 (mean +.005).
- Seven fixes tried (R141-R142). Only two remove the fables cost: silencing every copy vote (E3) and allowing copies only inside word-chunk windows (M4);
  both also erase the long-delay memory (probe back to ~.22). The votes that cost fables accuracy are the same votes that carry information across >4 letters
  when no word context exists. The cost is the price of the memory at 4000 letters, not a separable bug.
- Recommendation: do NOT block on fables. Treat it as a documented, bounded cost (accuracy -.003, fitness within noise, log-loss better) and take the
  look-back (lagDepth 32 + lagBlur 1 + lagGate 1 + lagSurp 2) into the promotion gate: 16 fresh growths with paired book100k + probe, with fables4000
  tracked (stop rule: fables accuracy cost > .005 or fitness < -.05). Cheap side test first: fables at longer length (e.g. 16k letters, 3 seeds): if the cost
  shrinks with more text, it is a short-text startup effect. Promotion still needs Travis's call because "no task worse" read strictly flags fables accuracy.

# R143 (Nov 23, 13:15 CT): (1) is the fables cost a startup effect? (2) a standing prose name-recall probe
- PRE-REGISTRATION R143a (before any run): fables at 16000 letters (the fables corpus is only 4270 characters, so 16k = ~3.7 passes from a random start;
  the copy register (<= 32 letters) cannot exploit the 4270-letter repeat), R140 S2 vs cand, 4x, k2951/2952/2953 (same seeds as fables4000:
  acc -.0033, fit -.043). Startup effect if the accuracy cost shrinks to |acc d| <= .0015 (less than half) at 16k; not startup if acc d <= -.003 again.
  Also compare lastQuarter acc d. Jobs run/r143/jobs_fab16.json -> run/r143/out/xf16.jsonl (sw/reg.js P=2).
- R143b: built sw/nameprobe.js (standing prose name-recall probe). Book life of nSyms letters, then invented names (6-8 letters, CV pattern, none in the book,
  each name used in exactly ONE passage) mentioned twice in prose: "<intro> NAME <book filler> NAME <tail>", gaps 5/15/31/61/127 letters, 10 names per gap
  per set. Set ON = passages appended to the life (learning on); set OFF = after the life, plasticity frozen; different names. Teacher-forced argmax guesses.
  Per mention: first (first letter), rest (letters 2..end, first letter given), exact (all of 2..end right). Recall = 2nd mention minus 1st mention (same
  letters, no memory possible at the 1st). Alignment self-check (guess stream accuracy at shift -1/0/+1; smoke: shift 0 best in both sets).
- PRE-REGISTRATION R143b (before the real runs): cand vs S2 at 4x after book30k, k2951/k2953 (run/r143/jobs_np.txt, run/r143/qnp.sh, one at a time).
  Expectation: recall (rest2 - rest1) ~ 0 (|d| <= .03) and exact2 = 0 for BOTH arms at every gap, ON and OFF. S2's copy register reaches <= 32 letters back,
  but its copy detectors need repeated sightings of a (far letter, current letter) key to be recruited and a one-shot name never repeats before the probe.
  A recall gain >= .05 at gaps 5/15 for S2 only would contradict this.
- 13:15 PROPOSAL (mechanism for prose name recall) + small flag written (not yet tested): P.granWord. Diagnosis: the chunk detector recruited at the 1st
  mention is keyed (previous word, partial word, letter), e.g. "named|so|r"; at the 2nd mention the previous word differs ("cap|so|r"), so the one-shot
  detector cannot fire again. The R140 copy register is positional (far letter at lag d + current letter) and needs repeated sightings. granWord adds a
  word-start key (partial word, letter) WITHOUT the previous word ('W' + p + '|' + c), recruited/fired exactly like chunk keys (same gate, pool, one-shot /
  granTrace readout). An invented name seen once leaves detectors "so|r", "sor|i", ... bound one-shot to the next letter; they fire again at the 2nd mention
  after any word. Expected reach: letters 3+ of the name (prefixes of 2+ letters are specific); limited by the readout trace decay and pool pressure
  (risk as in R136: extra keys crowd the pool at book100k). Off = bit-identical (test_core block added; to run when a node slot frees).

# R144 PROMOTION GATE for the R140 look-back (Travis decision 1:16 PM CT: accept the fables dip as a capped cost; run the full gate)
- PRE-REGISTRATION (13:20 CT, before any run). Arms: R140 S2 (R135 candidate + lagDepth 32 + lagBlur 1 + lagGate 1 + lagSurp 2) vs R135 candidate, 4x.
  16 fresh, never-tuned seeds: k2960-2971, 2973-2976 (2972 skipped: the number appears in RESULTS.md). Driver run/r144/gate.js (resumable, max 3 node
  jobs incl. other agents' jobs, >= 3 GB free before each spawn, commits each small result as it lands; log run/r144/gate.log).
  Phase A (first, cheap): fables4000 + text1000 both arms x 16 seeds; order3, K4, sc_order2, sc_cycle both arms x 4 seeds (2960-2963).
  STOP RULE (checked after phase A, automatic): fables4000 mean accuracy d < -.005 OR mean fitness d < -.05 -> stop, no further phases.
  Phase B: delay-copy probe (sw/lagprobe140.js, 30000) for S2 x 16 seeds. Phase C: book100k (sw/bookdiag.js, 100000) both arms x 16 seeds.
  PASS (all): book100k paired mean d >= 0 AND every seed d >= -.003 (the R140 per-seed bar; a sign count is reported too); probe >= .45 on every seed
  (mean also reported); text1000 / order3 / K4 / sc_order2 / sc_cycle mean fitness d >= -.05 (expected .000; R140: identical or +-.001); fables within the stop rule.
  Prediction: book100k mean d +.003..+.006 with 1-4 seeds below -.003 (R140 confirm: +.0075/+.010/-.0025); probe .50-.57 on all; fables acc d ~-.003.
  Cost estimate: A ~1 h, B ~3 h, C ~13-14 h of awake box time (32 book100k runs x ~75 CPU-min / 3); the box freezes when idle, so wall time can be longer.
  Starts after R143 (fables16k, name probe) and a test_core run with the new (off) granWord code.
- 13:25 R143a partial (fables16000 S2 vs cand): 2951 fit +0.003 acc +0.0000 last +0.0000 bits -0.0100 0.794;2952 fit -0.020 acc -0.0030 last -0.0010 bits +0.0100 0.796;mean fit -0.0085 acc -0.0015 last -0.0005;
- 13:34 R143a RESULT (fables16000, S2 vs cand, k2951/2952/2953 fit/acc): +.003/.000, -.020/-.003, -.013/-.002 = fit -.010, acc -.0017
  (last quarter -.0007). vs fables4000 on the same seeds: acc -.0033, fit -.043. The cost halves with 4x more text (and is ~0 in the last quarter), but
  -.0017 is just outside the pre-registered "startup" bound (<= .0015) and well inside "not startup" (<= -.003 not met): MOSTLY A STARTUP EFFECT.
  Caveat: the fables corpus is 4270 letters, so 16k = ~3.7 passes (acc ~.79 = partly memorised text), not new prose.
- 13:36 R143b first result (cand 4x book30k k2951): LEARNING ON, letters 2..end (first letter given): 1st mention .05-.19 -> 2nd mention .64-.69 at EVERY gap
  (5/15/31/61/127); exact whole-name 0/10 per gap; first letter ~0 (unknowable). LEARNING FROZEN: no recall (.03-.11 both mentions).
  Pre-registration (~0 for both arms) REFUTED for the learning-on condition: the 4x candidate already recalls one-shot names in prose, through one-shot
  learning of exact letter-tuple granules (granOneShot/granTrace; no previous-word key needed), not through the copy register. With plasticity frozen there is
  no recall by construction (the memory IS the plasticity). The 1x result in standing/STANDING.md (0/20 learning on) differs: different size / settings, to check.
  -> granWord (word-start keys) is less needed than proposed; kept as an untested off flag. Recall is per-letter, not whole-name (exact 0).
- 13:52 test_core ALL OK with granWord (off bit-identical; on: 49 word-start recruits) (sw/logs/tc143.log); spikefoundry 10/10 PASS. R144 gate driver started (phase A uses the free node slot while 2 name probes run).
- 13:59 R143b cand k2953 (learning on): rest .05-.17 -> .63-.72 at every gap; exact 0; frozen none. Same as k2951. S2 runs: k2951 since 13:52, k2953 since 13:59 (ETA ~14:20-14:30). Gate phase A running in the free slot.
- 14:17 R143b S2 k2951 done: ON rest m1 .05-.17 -> m2 .63-.68 (mean m2 .662 vs cand .665, same seed); exact 0; OFF (frozen) S2 m2 .049-.088 vs cand .033-.070
  (m2 - m1 <= 0 at every gap for S2 too): the look-back adds NO frozen one-shot recall, as pre-registered (recruitment needs repeats). k2953 pending (~14:23).
  Gate phase A: 10/96 reg results by 14:16 (one slot while probes ran; goes to 3 slots after k2953 ends).
- 14:24 R143b COMPLETE (cand vs S2, 4x, book30k, k2951/2953; recall = rest m2 - m1, letters 2..end, 10 names x ~5.7 letters per gap):
  ON (learning):  gap 5/15/31/61/127  S2 .517/.500/.567/.640/.527  cand .500/.553/.542/.648/.571  (mean S2 .550, cand .563; 2nd-mention acc S2 .672, cand .673)
  OFF (frozen):   both arms <= +.02 at every gap (no recall); exact whole-name 0/10 everywhere, both arms; first letter ~0.
  vs pre-reg: "~0 for both arms" REFUTED for ON (both arms ~.55), CONFIRMED for OFF. The S2-only signal (>= .05 at gaps 5/15) is ABSENT (+.017 / -.053).
  Conclusion: one-shot name recall in prose comes from one-shot exact-tuple granules (granOneShot/granTrace), present in the R135 candidate already;
  the R140 copy register adds nothing for names seen once (it needs repeated sightings to recruit). Not a reason for or against R144.
- 14:34 R144 phase A 29/96: fables4000 n=7 fit d -.056 acc d -.0051 (0+/7-) = at/over the stop-rule lines (acc < -.005 or fit < -.05; checked automatically after all of A); text1000 n=7 fit -.009 acc -.0023. ETA end of A ~15:30 CT.
- 14:55 R144 phase A 58/96: fables n=14 fit -.038 acc -.0036 (inside stop rule); text1000 n=14 fit -.011 acc -.0022 (+4/-10).
- 14:59 TEXT1000 FLAG (Travis accepted only the fables dip). Phase A n=15: text1000 acc d -.0021 (se .0006, paired t -3.2, 1+/11-/3=) = SIGNIFICANT,
  ~2 letters per 1000; fitness -.010 (inside the -.05 bar). Location: first quarter -.0035, q1 -.0043 (t -3.8), q2 -.0005, last quarter .0000;
  log-loss unchanged (bits +.0007 ns). Same shape as fables (early argmax flips, gone later). R140 3-seed check had already shown -.0013.
- PRE-REGISTRATION R144m (mechanism check, before running): S2 + P.lagEvid=3 (copy votes silent, recruitment unchanged) on text1000, k2960/2961/2962/2970/2971
  (S2 d there -.002/-.007/-.005/-.003/-.005, mean -.0044), vs the cand results already in xreg. If the copy votes carry the text1000 dip:
  lagEvid3 mean acc d within +-.0010 of cand (R142 fables: -.0003). If d stays <= -.0025, something else in S2 (lagDepth recruitment/pool) causes it.
  Run by pausing the gate scheduler (SIGSTOP; its running children finish) so node jobs stay <= 3; resume with SIGCONT.
- 15:02 R144m RESULT: S2 + lagEvid 3 on text1000 k2960/61/62/70/71 = cand EXACTLY on every seed (acc, q1, bits, fitness d .0000), vs S2 d -.0044 on the
  same seeds. The text1000 dip is carried entirely by the copy votes (same mechanism as fables; silencing them restores cand bit-for-bit here).
  Gate paused 14:57-15:01 for this (node jobs stayed <= 3); resumed, 64/96 phase A results, now order3/K4/sc_* (4 seeds).
- 15:14 R144 PHASE A COMPLETE (96/96, 16 fresh seeds; S2 - cand, 4x):
  fables4000 n=16: acc -.0028 (t -2.6, 6+/10-), fit -.024, log-loss bits -.019 (better, t -3.9). STOP RULE NOT FIRED (acc >= -.005, fit >= -.05).
  text1000 n=16: acc -.0021 (se .0006, t -3.5, 1+/12-/3=), fit -.009 (inside -.05 bar), q1 -.0043, last quarter +.0003, bits +.0008 ns.
    FLAG: significant, NOT covered by Travis's fables acceptance; same mechanism (R144m: copy votes silenced -> = cand exactly). ~2 letters/1000, early only.
  order3, K4, sc_order2, sc_cycle (4 seeds each): .0000 fitness and accuracy, identical.
  Phase B (lagprobe S2 x16) started 15:14 (3 slots); ETA ~18:15 CT; phase C (book100k x32) then ~13-14 h awake -> ~08:00-09:00 CT Tue (later if the box freezes).
- 15:21 DECISION (Travis): text1000 early-text dip is part of the same capped cost; same stop rule as fables (acc cost > .005 or fitness < -.05). Phase A text1000 = acc -.0021, fit -.009 -> within cap. Gate continues (phase B running since 15:14).
- 15:52 R144 phase B 3/16: probe k2960 .475, k2961 .477, k2962 .574 (bar .45 every seed; 2 seeds near it). ~34 min per round of 3 -> B ETA ~18:40 CT.
- 16:23 R144 phase B 5/16: 2960 .475, 2961 .477, 2962 .574, 2963 .554, 2965 .534 (all >= .45). ETA ~18:40 CT.
- 17:00 R144 phase B 9/16: 2960 .475, 2961 .477, 2962 .574, 2963 .554, 2964 .474, 2965 .534, 2966 .528, 2967 .448 (133/297 right), 2968 .518.
  k2967 .448 < .45 -> the pre-registered probe criterion ("every seed >= .45") is FAILED (by 1 item: .45 x 297 = 133.65). Cand/off baseline ~.21-.25, so the
  memory is clearly present on k2967 (about 2x off); 4 seeds sit at .45-.48. Gate continues (rest of B, then C) for the full picture; verdict needs Travis.
- 17:32 DECISION (Travis): keep going; probe-criterion verdict deferred until the book100k results. Run phase C to completion. Criterion unchanged.
- 17:35 phase B 12/16: +2969 .564, 2970 .544, 2971 .508. Still 1 below .45 (k2967).
- 18:09 phase B 15/16: +2973 .532, 2974 .507, 2975 .515. k2976 running (ETA ~18:40); phase C book100k started in the free slots.
- 18:25 another executor (ComputeLab Explore) may run 1 node job -> gate limited to 2 node jobs: old driver paused (SIGSTOP) until lp k2976 finishes (~18:40), then restarted with GATE_MAX=2 (resumes from completed files).
- 18:40 R144 PHASE B COMPLETE (S2 delay-copy probe, 4x, 16 seeds): 2960 .475, 2961 .477, 2962 .574, 2963 .554, 2964 .474, 2965 .534, 2966 .528,
  2967 .448, 2968 .518, 2969 .564, 2970 .544, 2971 .508, 2973 .532, 2974 .507, 2975 .515, 2976 .526. Mean .517 (median .522; predicted .50-.57),
  1/16 below .45 (k2967 .448, one item short), 3 more at .45-.48. Pre-registered "every seed >= .45": NOT MET (verdict deferred by Travis to book100k).
  Phase C (book100k both arms x16) started 18:39 with GATE_MAX=2 (driver PID 290841). ~2 jobs per ~70+ min -> ETA ~Tue 13:00-15:00 CT awake time.
- 18:42 Explore executor finished -> gate restarted with GATE_MAX=3 (driver PID 293272; orphan-aware: the 2 running k2960 book jobs counted and not duplicated). watch.sh commits bd JSONs and prints pairs (run/r144/csum.py).
- 19:32 arena executor may run 1 light node job: gate restarted (PID 323772) with GATE_MAX=3 but a 3rd job only spawns if >= 5 GB available (GATE_MEMGB=5); running k2960 x2 + k2961 cand continue as orphans (counted, not duplicated). MemAvail 6 GB with 3 book jobs.
- 19:40 phase C pair 1: k2960 S2-cand +.0060. Book job ~57 min, ~1.7 GB RSS; MemAvail 4.6 GB (browser on box) -> gate holds at 2 jobs. ETA ~Tue 10:00-12:00 CT awake time.
- 19:44 MemAvail fell to 2.7 GB with 3 book jobs (browser/playwright on box use ~4 GB) -> back to GATE_MAX=2 (driver PID 331929); S2 k2962 killed 3 min in and requeued.
- 20:22 arena done -> gate restarted GATE_MAX=3 GATE_MEMGB=5 (PID 358292); 3 book jobs (S2 2961, cand 2962, S2 2962); MemAvail 9 GB before the 3rd.
- 20:38 phase C pair 2: k2961 -.0035 (< -.003 per-seed bar -> the pre-registered book rule 'every seed >= -.003' is already not met). Running mean +.0012 (n=2). Gate continues to completion per Travis.
- 21:12 phase C: 2/16 pairs done (+ cand k2962 alone); running S2 2962, cand+S2 2963; gate PID 358292 alive, MemAvail 7 GB.
- 21:23 phase C 3/16 pairs: 2960 +.0060, 2961 -.0035, 2962 -.0030 (= bar, .568 vs .571; meets >= -.003). Mean -.0002.
- 21:38 phase C 4/16 pairs: +2963 +.0080. Mean +.0019, 1 below -.003. ~3 jobs / 57 min -> ETA ~04:30-05:00 CT Tue (awake time).
- 22:03 gate restarted (PID 424834; counts any foreign node job, e.g. another executor's t2b.js, toward the 3-job cap). Phase C 4/16 pairs (cand 4, S2 4 done; running cand 2964, S2 2964, cand 2965). No failures.
- 22:15 WARNING: a Chrome renderer (another agent's tab, started ~22:10, likely the ComputeLab explore page) holds 7.2 GB; MemAvail ~0.4 GB. Not mine -> not killed. Gate spawns nothing new below 5 GB; if the OOM killer hits a book job, a gate restart reruns it.
