# PREREG R146: copy look-back depth (P.lagDepth) on the R144 champion

Approved by Travis 2026-11-24 ("approve the R146 experiment"), relayed by DCB at 13:18 CT. Written before any R146 run.
Machine-readable spec: `r146-lagdepth.json` (that file is what the server plans from; this file only explains it).

**Question.** Longer context and memory is the main direction. R144 looks back 32 steps (`P.lagDepth=32`). Does a different
depth in 8..128 beat it on 100k-symbol book text without hurting the small text tasks?

**Control.** The R144 champion string exactly (`base`), i.e. lagDepth 32. Every arm is the base with only `P.lagDepth` changed.

**Search (tuning seeds only, primary task only).** log2 scale, integers, at most 6 points besides the control, stop when neighbours are < 0.5 log2 apart.
Order is fixed by the planner: round 1 = control (32, the log2 midpoint of 8..128) + the extremes 8 and 128; then the midpoints
between the best point so far and its neighbours (e.g. 16 and 64, then 23 or 45, ...). Best point = highest mean paired delta
vs control on the primary task over the 2 tuning seeds. If no point beats the control, verdict `no-gain` and nothing is confirmed.
If the best point is at 8 or 128 the report flags `atEdge` and proposes a wider range; that extension needs a new approval.

**Confirmation.** Best point vs control on 16 fresh seeds (from the seed ledger, never used for tuning or by any other
experiment), all three tasks.

**Tasks and metrics.**
- book100k `{env:seq, source:book, nSyms:100000, evalSyms:2000}`: metric `heldAcc` (primary).
- fables4000 `{source:fables, nSyms:4000, readIn:0.01}`: metric `accuracy` (guard).
- text1000 `{source:text, nSyms:1000, readIn:0.01}`: metric `accuracy` (guard).

**Pass (all must hold on the 16 confirmation seeds).**
- primary mean paired delta >= +0.002 heldAcc,
- paired t >= 2.0,
- wins >= 62.5% of seeds (10/16),
- no seed worse than -0.005,
- each guard task: mean paired delta >= -0.005.
Anything else is `fail`. Two runner failures of the same run mark the experiment `blocked`.

**Who runs it.** Only computers whose worker reports the experiment protocol (`experiments:1`) and memGB >= 7; heap 7000 MB.
At most 6 runs queued at once. Expected about 70 min per book100k run. Budget: tuning (primary task only) up to 7 arms x 2 seeds = 14 book100k runs;
confirmation 2 arms x 3 tasks x 16 seeds = 96 runs (32 of them book100k).

**Switch on.** The spec ships `"enabled": false`. After `experiments_enabled = true`, add `'experiments_enable' => ['r146-lagdepth']`
to private/config.php. Remove the id again to pause (queued runs finish; nothing new is planned).
