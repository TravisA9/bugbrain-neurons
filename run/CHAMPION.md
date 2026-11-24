# Standing champion design (the setting new rounds build on)

**R144 (promoted Nov 24, 2026, 05:40 CT by Travis)** = R140 look-back "S2" on top of the R135 candidate, at 4x.

- `run/champion.txt` — full argument string as run in R144 (4x: `sc.sizeF=4`).
- `run/champion_base.txt` — same without the brain size (append `sc.sizeF=N`; 4x is the tested size).
- Contents: R135 candidate (`run/r140/cand_base.txt`: relGrowth + pathBudget + rgDiv 2 + trophic 16 + recvBudget 2 + postCapRel 1.5 + anSelf 1,
  granule readout granExact / granKal / granOneShot 0.03 / granTrace / granUtility 2 / granCo, word chunks granChunk 1 + granChunkGate 2 + granScale 2)
  + long look-back `P.lagDepth=32,P.lagBlur=1,P.lagGate=1,P.lagSurp=2`.
- Engine defaults are unchanged (v47 / DEFAULTS_VERSION 40): every part is an opt-in flag (off = bit-identical). Baselines for new rounds:
  use `run/champion.txt` as the control arm (as `cand_4x` was in R140-R144).

Gate record (R144, 16 fresh seeds k2960-2971/2973-2976, S2 minus R135 candidate):
- book100k heldAcc +.0041 mean (t 3.4, 13+/3-; .5408 -> .5449); worst seed k2961 -.0035 (per-seed bar -.003 missed by one seed).
- delay-copy probe .517 mean (candidate ~.22); 15/16 >= .45, k2967 .448 (bar missed by one item).
- fables4000 acc -.0028 / fit -.024; text1000 acc -.0021 / fit -.009 (early-text cost from the copy votes; accepted by Travis as a capped cost:
  stop if acc cost > .005 or fitness < -.05). order3, K4, seqchoice order2 / cycle identical.
- Strict pre-registered rule: FAILED on the two per-seed bars; Travis promoted on the clearly positive means (decision 05:40 CT Nov 24).

Previous standing setting: R135 candidate (`run/r140/cand_base.txt` + `sc.sizeF=4`).
