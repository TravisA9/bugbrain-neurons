# PRE-REGISTRATION: word-unit diagnostic (written Fri Nov 27 2026 3:32 PM CT, before any word-unit run; queue started right after)

Purpose (Travis t190u): find the missing / failing mechanism, not tune. The X-ray showed R144 ~= a letter counter, word-chunk units never
reused across contexts (their key includes the previous word), and flat accuracy on never-seen 4-letter contexts.

## Mechanism under test
R144's chunk unit key = (previous word, word-so-far, current letter) -> 'C' keys. The flag P.granWord (code already existed since R143 as an
untested off flag; this branch adds value 2) gives units keyed on (word-so-far, current letter) ALONE -> 'W' keys, so the same unit fires for a
word after ANY previous word. Same pool, same recruit rule / pressure gate, same one-shot + granKal + granTrace readout. Only word boundaries
(the self-calibrated most frequent symbol) are used; nothing text-specific beyond that.
- granWord 0 (R144 baseline; bit-identical to unset)
- granWord 1: word units ADDED alongside the previous-word chunk units
- granWord 2 (new): word units REPLACE the previous-word chunk units (extreme: no previous-word context at all in the chunk level)
Extremes first: 0 vs 2 (none vs all-word), then the midpoint 1 (both). The flag is discrete, so this 3-point ladder is the whole bisection.

## Measures (X-ray tracer sw/xray.js, book, held = last 2000 letters; baselines: x30 k2977 / k2978, x100 k2977)
- M (mechanism): reuse.byType.word.shareAny = fraction of same-word / different-previous-word word-end pairs whose fired WORD units overlap;
  also long.sharedWholeWord / long.pairs (words >= 5 letters sharing a unit spanning the whole word). Baseline: chunk shareAny 0, word n/a;
  whole-word sharing 220/674 = .33 (k2977), 97/775 = .13 (k2978).
- O (outcome): held accuracy on NEVER-SEEN 4-letter contexts (learningToLearn H:new), brain vs the online backoff counter on the same
  positions. Baseline 30k: k2977 .350 vs .364 counter, k2978 .356 vs .360 (brain BELOW counter); 100k k2977 .404 vs .397.
- Also heldAcc overall and the H:1-2 bin (contexts seen once or twice).

## Decision thresholds
- M passes if word shareAny >= 0.50 (mean of seeds) and whole-word sharing rises by >= +0.10 over baseline. M fails (implementation failed) if
  word shareAny < 0.20.
- O passes if new-context accuracy rises >= +0.02 over the baseline arm (mean of seeds) AND the brain beats the counter on new contexts by
  >= +0.01. "Flat" = |delta| < 0.01.
- Interpretation:
  * M pass, O flat  -> reuse is NOT the missing mechanism; the gap is a level up (categories / similarity / hierarchy / top-down backoff).
  * M pass, O pass  -> reuse is (part of) the missing mechanism; follow up with the next level reading word units.
  * M fail          -> implementation failed; no conclusion about reuse.
- Pick for the 16-seed confirm: the arm with M pass and the higher mean heldAcc on the 2 tune seeds (granWord 1 if they tie within .003).
  Confirm on 16 fresh seeds k3001-k3016 (never used), base vs chosen arm, 30k. Same thresholds on 16-seed means; also paired heldAcc
  (sign count, mean diff). One 100k run (chosen arm, k2977) vs the existing x100 baseline if the box has time.

## My predictions (honest, written before running)
1. M: word shareAny high (.6-.95) for granWord 1 and 2 -> M passes. (Once a W key exists, it fires after any previous word by construction;
   the open question is only whether the gated recruit rule ever creates them.)
2. O: FLAT (|delta| < .01) for both arms. Reason (logic, not data): a W key with a word-so-far of >= 3 letters spans >= 4 letters plus the
   word boundary, so it CONTAINS the last 4 letters; it cannot fire if that 4-letter context was never seen. W keys with 1-2 letters of
   word-so-far are exactly a 3- or 4-letter tuple anchored at the space, which the tuple units already cover. So any exact-match unit,
   word-keyed or not, is silent on a never-seen 4-letter context; only indirect pool effects could move O.
3. heldAcc: granWord 1 within +-.005 of base; granWord 2 lower (-.005..-.02), because the previous word is real information
   (R134/R136 headroom: previous word + partial beats letter orders).
4. 1-2 bin: granWord 1 slightly up (+0..+.02): a word seen after a different previous word now has a unit.
5. Therefore my expected interpretation: "reuse is not the missing mechanism; the missing piece is generalization beyond exact matches
   (similarity / categories / backoff that pools evidence from related contexts)".

## Exploratory (not a decision input)
An offline count-model headroom on the same streams: what simple non-exact predictors (interpolated blend of orders, PPM-like) score on the
never-seen-4-context positions vs the backoff counter, to size how much a generalizing mechanism could gain there.

Guardrails: flags off = bit-identical (test_core ALL OK, spikefoundry pass; base arm hits string must equal the earlier x30 runs), <= 3 node
jobs on the box, no game-specific code, nothing touched in ComputeLab\worker, never push to cursor/spikefoundry-designer-22bf.
