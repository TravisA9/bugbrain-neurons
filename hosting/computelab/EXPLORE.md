# Explore

`/computelab/explore` shows the lab's current best design in a few demos with few controls. The header's
Explore item is a dropdown and the only view switcher (no in-page tabs); each entry opens a view (hash change, no reload): `/explore#arena`, `#predator`, `#read`, `#name`, `#copy`, `#patterns`.
The list lives in one place: `exploreDemos()` in `private/src/pages.php`.

| Tab | What it shows | How |
|---|---|---|
| `#arena` | BugBrain foraging arena, flash task (`?compare=1`: next to the original). One bug keeps learning from round to round; a stats panel beside the canvas (below it under 900 px) shows its age and food / poison rates over its life (sparkline), poison share early vs lately, and time stuck on walls | live (`explore-arena.js` after the engine bundle): plan v3h + the audited champion edit from `/explore/bugbrain-champion.json` |
| `#predator` | the same, in the core's `hard` task: drifting items and a predator that chases the bug (being caught costs 2). The panel adds "caught" per 1,000 steps, early vs lately | live (`explore-arena.js`) |
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
  `--check` verifies the committed file is reproducible. Bump `bugbrain.js?v=` in `pageBugArena()` when it changes.
- `private/explore-replay.js`, `private/explore-live.js`, `private/explore-arena.js`: loaded only when their view opens.
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

## Updating to a new design

1. A design passes the promotion gate.
2. From the research checkout, run `tools/export_explore.js` with that design's version, commit, variant and finished
   outputs (see `tools/export_explore_r135.sh` for the exact R135 export). It runs no brains.
3. If the engine changed, rebuild the bundle from the research commit and bump `?v=`.
4. Commit `private/explore/` (and the bundle), run `tests/api_test.php` and `tests/http_test.php`, and hand the
   folder to the ComputeLab deploy. Only `private/explore/*` (and `private/bugbrain.js`) need uploading.

The arena brain changes only through audited arena results (`arenaChampion()`) or the manifest's `arena.plan` after a
fair paired audit under the same physics.
