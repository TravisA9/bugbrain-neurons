# BugBrain arena audit: bugSOTA vs v3h (pre-registration)

Written 2026-11-23, before any full run. Script: `tools/bug_audit.js`. Run it only after R144 has finished (one process, single-threaded, about 1.5 M arena ticks).

## Why

The live arena brain (v3h plus the audited champion edit) steers well, but in the arena it eats poison apples freely. It also avoids walls, yet sometimes gets pinned against one. The Sunday overhaul's `bugSOTA` claims to fix both. This audit checks that claim fairly before either brain goes into `#arena`.

## What "same physics" means here

`bugSOTA` is two things:

1. **Genome:** v3h plus different neuromodulator genes (`gFood 1.5, gPoison 1.5, gWall 0.02, tauMod 12`) and a `sotaBug` flag. These are the only brain differences. The plan's comments describe extra wiring (ipsilateral poison veer, commissural bump escape, and so on), but `createSotaBugGenome` does not add any of it.
2. **Environment steering:** the `sotaBug` flag switches on `sotaPhysics` in `envs/bug.js` (`World.sota`). That is hand-written code in the *environment*: it pulls the wheels toward the nearest green apple, veers away from red ones and the predator, widens the item hit cone, and turns the bug off walls. The brain does none of this.

So a raw "bugSOTA vs v3h" comparison mostly measures that environment code, not the brain. Both plans therefore run under the same physics:

- **standard** (PRIMARY): environment steering off for both. This is the arena the live demo uses. The script overrides the genome's switch and checks every tick that it held.
- **assisted** (report only): environment steering on for both. It shows how much the hand-written steering adds. It cannot promote a brain, because the live core (`b0e789cc`) has no such code.

## Design

- Core: `e923906` (it has both plans). Under standard physics, the live core `b0e789cc` reproduced the same runs bit for bit in the smoke check (`--ref b0e789cc --physics standard`).
- Arena: the Explore garden layout, 1500 ticks per round.
- Tasks: `flash` (the `#arena` demo: food seen only in brief flashes) and `hard` (the `#predator` demo: drifting items plus a chasing predator; being caught costs 2).
- Pairing: 16 growth seeds. Each seed grows one brain per plan. Each brain then lives 8 rounds in a row: one network, learning carried over, a new arena each round, as in the long-running demo. Round r of growth g uses the same arena seed for both plans. Learning is on.
- Unit of analysis: the growth (the mean over its 8 rounds), paired across plans.

## Metrics (per round, and by round number = learning time)

- food, poison bites, caught (predator), and score = food − poison − 2 × caught
- poison share of bites = poison / (food + poison), plus its slope over rounds (is it learning to avoid poison?)
- wall contacts: touch onsets (body against a wall, either the contact sensors or a blocked move)
- wall contact ticks
- **wall-stuck ticks: touching a wall AND moved less than 10 px over the last 30 ticks** (N = 30). The `#arena` panel uses the same rule.
- stuck ticks: the environment's own measure (moved less than 10 px over 30 ticks anywhere)

## Pass rule (decided now, before the run)

`bugSOTA` replaces v3h as the arena brain only if **all** of these hold under **standard physics**:

1. flash: the mean paired score difference is above 0, **and** bugSOTA scores higher in at least 12 of the 16 growths (one-sided sign test, p ≈ 0.04)
2. flash: poison bites are not up by more than 10% against v3h
3. flash: wall-stuck time is not up by more than 10% (or by fewer than 5 ticks per round)
4. hard (predator): the mean paired score difference is at least 0, and catches are not up by more than 10% (or by at most 0.05 per round)

Report only, not deciding: everything under assisted physics, the per-round learning curves, and the poison-share slopes.

If it fails, v3h (plus the audited champion edit) stays in `#arena`. Either way, a swap still needs Travis's OK and DCB's deploy.

## Commands

```
# full pre-registered run (after R144):
node tools/bug_audit.js --out /workspace/sweep/standing/bug_audit_full.json
# smoke (done 2026-11-23, 1 seed, 1 growth x 2 rounds x 300 ticks, 1.2 s):
node tools/bug_audit.js --growths 1 --rounds 2 --ticks 300 --seed 1 --out /workspace/sweep/standing/bug_audit_smoke.json
```

The script prints a verdict only at the pre-registered size (16 × 8 × 1500). At smaller sizes it says "smoke only".
