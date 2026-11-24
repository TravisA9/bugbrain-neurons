# Explore

`/computelab/explore` shows the lab's current best design in a few demos with few controls. The header's
Explore item is a dropdown and the only view switcher (no in-page tabs); each entry opens a view (hash change, no reload): `/explore#arena`, `#predator`, `#read`, `#name`, `#copy`, `#patterns`.
The list lives in one place: `exploreDemos()` in `private/src/pages.php`.

| Tab | What it shows | How |
|---|---|---|
| `#arena` | BugBrain foraging arena, flash task (`?compare=1`: next to the original). One bug keeps learning from round to round; a stats panel beside the canvas (below it under 900 px) shows its age and food / poison rates over its life (sparkline), poison share early vs lately, and time stuck on walls | live (`explore-arena.js` after the engine bundle): plan v3h + the audited champion edit from `/explore/bugbrain-champion.json` |
| `#predator` | the same, in the core's `hard` task: drifting items and a predator that chases the bug (being caught costs 2). The panel adds "caught" per 1,000 steps, early vs lately | live (`explore-arena.js`) |
| `#shoot` | Poison shooter: the #arena garden and brain plus a fourth motor output, `fire`, that shoots straight ahead (12-step cooldown, each shot a small punishment signal). Hitting red removes it (reward); hitting green removes it (penalty). Score = green eaten + red shot - green shot. The panel shows score and shots per 1,000 steps and the red share of hits, early vs lately | live (`explore-arena.js`) |
| `#shoot-predator` | The shooter with the #predator hunter after it: a hit stuns it for 160 steps (frozen, drawn dimmed with a ring that empties) and knocks it back 30 px, a small reward; being caught costs 2 as in #predator. Adds hunter hits and caught per 1,000 steps | live (`explore-arena.js`) |
| `#brain` | Watch a brain grow: the arena brain grows from its genes (cells divide, move and become neurons; axons follow the chemical signals; synapses form, then trophic deaths and Hebbian pruning remove some), then lives: the bug runs off-screen in the flash arena and spikes travel along the connections, with sensor and motor activity bars and a reward / punishment glow. Play / Pause, Restart, speed 0.05x to 8x; click a cell for details | live (`explore-brain.js` after the engine bundle) |
| `#read` | next-letter guesses on held-out text, with a 5-letter pattern counter for comparison | replay of a recorded run |
| `#name` | one-shot recall of an invented name | replay |
| `#copy` | delayed copy across up to 30 steps (marked "Being tested" while its design is in the gate) | replay |
| `#patterns` | a small version of the design grows in a Web Worker and learns a colour pattern | live (`explore-live.js`) |

## Files

- `private/explore/design.json`: the top-design manifest (schema 2), plus one replay file per demo.
  `App::topDesign()` validates it (schema 2, 64 KB cap, field patterns, whitelisted replay ids, sha256 per file)
  and falls back to the arena champion alone on any problem, so a bad manifest never blanks the page.
- `GET /explore/design.json`: the manifest plus `champion` (ETag, `Cache-Control: public, max-age=60`, since the CDN often drops If-None-Match).
- `GET /explore/replay/<read|name|copy>.json`: served only when named in a valid manifest and the file's sha256
  matches; ETag `"<version>-<id>-<sha16>"`, `Cache-Control: public, max-age=300`.
- `private/bugbrain.js`: the engine bundle (js/core + js/envs from one commit, no book corpus) + `bugbrain-view.js`.
  Build: `node tools/build_bugbrain_bundle.js --ref <commit>`; the header names the commit and body sha256; cap 600 KB.
  `--check` verifies the committed file is reproducible. The page loads it as `bugbrain.js?v=<first 10 hex of its sha1>`, like the explore-*.js files, so a new bundle gets a new URL past the CDN's 7-day cache.
- `private/explore-replay.js`, `private/explore-live.js`, `private/explore-arena.js`, `private/explore-brain.js`: loaded only when their view opens.
  `bugbrain-view.js` is now an empty stub, so the bundle is engine only (590 KB).

## Long-running arenas (`explore-arena.js`)

- When a round ends, only the arena is replaced (`agent.task = env.def.create(...)`); the `SpikingNet` and what it has learned carry over.
- The learned state (every typed array and number the `SpikingNet` owns, about 70–90 KB of JSON) is saved to
  `localStorage['computelab.bug.<arena|predator>.v1']` every 30 s, when the tab is hidden, and on `pagehide`. It is
  restored only if the champion, task and engine URL match, and every array has the same type and length. Otherwise a new bug is grown.
  "Start fresh" (click twice once the bug is older than 3,000 steps) clears it.
- History: at most 96 bins of `[steps, food, poison, caught, wall-stuck]`. When it is full, neighbouring bins merge and
  bins double in length, so memory stays flat however long the page stays open.
- Hidden browser tab: no drawing; 15 steps per second on a 1 s timer (browsers throttle hidden timers anyway).
  Another Explore view open: the arena pauses.
- Wall-stuck = touching a wall and moved less than 10 px over the last 30 steps (the same rule as `tools/bug_audit.js`).
- Head-to-head audit of bugSOTA vs v3h: see `BUG_AUDIT.md` (pre-registered; run after R144).

## Poison shooter (`#shoot`, `#shoot-predator`)

- Everything is in `explore-arena.js` (`shootKit()`): a `ShootWorld` subclass of the bug world and a spec with a fourth output (`fire`, bias 0, at the motor end of the tissue). The engine bundle is untouched, so #arena, #predator and `tools/bug_audit.js` run exactly as before.
- The brain is the same plan (v3h + champion edit) grown with the four-output spec, so it is a sibling of the #arena bug, not the same network. It learns continuously and is saved like the other arenas (`computelab.bug.shoot.v1`, `computelab.bug.shoot-predator.v1`).
- Fire: the fire neuron's rate over a tick above 0.12 shoots one projectile (9 px a step, 42 steps or the first wall). Constants are in `SHOOT`.
- Rewards (dopamine): red hit +1, green hit -1, each shot -0.05, hunter stun +0.5, caught -2. Shots hit hidden (not flashing) green apples too.
- Checks: `node tools/shoot_check.js` (run by `tests/api_test.php`: hit rules, exact cooldown, stun / freeze / wake-up, caught cost, and the grown brain firing in both views) and `python3 tools/explore_shoot_browser_check.py` (Playwright on a running site: no errors, shots fire, never faster than the cooldown; saves screenshots).

## Brain growth view (`explore-brain.js`)

- Grows the champion exactly as the arena does (same `genomeFor` / `makeEnv`, same seed rule) with `growCell(genome, { seed, spec, record: true })`. The recorder in `js/core/develop.js` is passive: it draws no random numbers and changes no state, so the brain is identical. `tools/brain_record_check.js` checks this (same network fields and the same 300 ticks of behaviour, recorder on vs off) and `tests/api_test.php` runs it.
- Seed: every load grows the same brain. It uses the champion file's `seed` if it has one, otherwise `DEFAULT_SEED` = 12345 in `explore-brain.js` (136 recorded cells, 728 synapses for v3h). Restart replays it. "Grow a new one" (beside the seed in the side panel) picks a random seed and writes `#brain?seed=N`, so that brain can be reloaded or shared; plain `#brain` goes back to the default. `tools/brain_record_check.js` also grows the default seed in two fresh bundle loads and compares cell count, synapse count and a hash of the whole growth trace (`traceHash`, read from `explore-brain.js`; `ExploreDemos.brain.state()` shows the same `trace` in the browser).
- Fields drawn as soft additive heatmaps on the tissue (legend beside the canvas, each one switchable): eye signal and motor signal (fixed chemicals 2 and 3, on), midline, front and central band (fixed 0, 1 and 6, off by default), cell signals A / B (chemicals 4 and 5, per step from the recording; the legend says "this brain makes none" when the genes make none, as for v3h), and the hunger pull towards motors that still lack inputs (rebuilt per step from the recorded synapses with the core's rule). Each entry says how strongly the genes let it steer axons.
- Growth plays at 2 steps a second times the speed; living at 10 ticks a second times the speed. Spike pulses are capped at 500 and trails at the recorded points.
- Hooks for screenshots: `ExploreDemos.brain.seek(step)` (past the last growth step it runs that many life ticks), `pause()`, `state()`.

## Updating to a new design

1. A design passes the promotion gate.
2. From the research checkout, run `tools/export_explore.js` with that design's version, commit, variant and finished
   outputs (see `tools/export_explore_r144.sh` for the current R144 export, `tools/export_explore_r135.sh` for the earlier R135 one). It runs no brains.
3. If the engine changed, rebuild the bundle from the research commit and bump `?v=`.
4. Commit `private/explore/` (and the bundle), run `tests/api_test.php` and `tests/http_test.php`, and hand the
   folder to the ComputeLab deploy. Only `private/explore/*` (and `private/bugbrain.js`) need uploading.

The arena brain changes only through audited arena results (`arenaChampion()`) or the manifest's `arena.plan` after a
fair paired audit under the same physics.
