# Explore tab

`/computelab/explore` shows the lab's current best design in a few demos with few controls. The header's
Explore item is a dropdown; each entry opens a tab: `/explore#arena`, `#read`, `#name`, `#copy`, `#patterns`.
The list lives in one place: `exploreDemos()` in `private/src/pages.php`.

| Tab | What it shows | How |
|---|---|---|
| `#arena` | BugBrain foraging arena (`?compare=1`: next to the original) | live in the browser: plan v3h + the audited champion edit from `/explore/bugbrain-champion.json` |
| `#read` | next-letter guesses on held-out text, with a 5-letter pattern counter for comparison | replay of a recorded run |
| `#name` | one-shot recall of an invented name | replay |
| `#copy` | delayed copy across up to 30 steps (marked "Being tested" while its design is in the gate) | replay |
| `#patterns` | a small version of the design grows in a Web Worker and learns a colour pattern | live (`explore-live.js`) |

## Files

- `private/explore/design.json`: the top-design manifest (schema 2), plus one replay file per demo.
  `App::topDesign()` validates it (schema 2, 64 KB cap, field patterns, whitelisted replay ids, sha256 per file)
  and falls back to the arena champion alone on any problem, so a bad manifest never blanks the page.
- `GET /explore/design.json`: the manifest plus `champion` (ETag, `no-cache`).
- `GET /explore/replay/<read|name|copy>.json`: served only when named in a valid manifest and the file's sha256
  matches; ETag `"<version>-<id>-<sha16>"`, `Cache-Control: public, max-age=300`.
- `private/bugbrain.js`: the engine bundle (js/core + js/envs from one commit, no book corpus) + `bugbrain-view.js`.
  Build: `node tools/build_bugbrain_bundle.js --ref <commit>`; the header names the commit and body sha256; cap 600 KB.
  `--check` verifies the committed file is reproducible. Bump `bugbrain.js?v=` in `pageBugArena()` when it changes.
- `private/explore-replay.js`, `private/explore-live.js`: loaded only when their tab opens.

## Updating to a new design

1. A design passes the promotion gate.
2. From the research checkout, run `tools/export_explore.js` with that design's version, commit, variant and finished
   outputs (see `tools/export_explore_r135.sh` for the exact R135 export). It runs no brains.
3. If the engine changed, rebuild the bundle from the research commit and bump `?v=`.
4. Commit `private/explore/` (and the bundle), run `tests/api_test.php` and `tests/http_test.php`, and hand the
   folder to the ComputeLab deploy. Only `private/explore/*` (and `private/bugbrain.js`) need uploading.

The arena brain changes only through audited arena results (`arenaChampion()`) or the manifest's `arena.plan` after a
fair paired audit under the same physics.
