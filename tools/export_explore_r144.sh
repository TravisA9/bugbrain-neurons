#!/bin/sh
# The exact export that produced hosting/computelab/private/explore for R144 (run from the research checkout, e.g. /workspace/sweep).
# R144 = R140 look-back (S2) on the R135 candidate, promoted Nov 24, 2026 (run/champion.txt, run/CHAMPION.md on cursor/relgrowth).
# #read: book100k seed 2953 (same seed and held text as the R135 export; KN 5-gram comparison from tools/explore_kn5_hits.py).
# #name: R143b prose name probe, S2 arm, seeds 2951/2953. #copy: R144 gate delay-copy probes, all 16 fresh seeds (look-back off: R140 seeds 2954/2955).
set -e
S=sw/out; OUT=${OUT:-../explore-wt/hosting/computelab/private/explore}; COMMIT=${COMMIT:?set COMMIT to the cursor/relgrowth champion commit}
python3 ${TOOLS:-../explore-wt/tools}/explore_kn5_hits.py 2953 /tmp/kn5_2953.json
rm -f "$OUT"/read-*.json "$OUT"/name-*.json "$OUT"/copy-*.json "$OUT"/design.json
node ${TOOLS:-../explore-wt/tools}/export_explore.js --version R144 --commit "$COMMIT" --variant-file run/champion.txt --updated 2026-11-24 \
  --read $S/bd_b100r140S2_4x_2953.json --read-held standing/data_k2953.json --read-compare /tmp/kn5_2953.json \
  --name $S/np_np_S2_4x_2951.json,$S/np_np_S2_4x_2953.json \
  --copy $(ls $S/lp_g144p_S2_4x_29*.json | sort | paste -sd,) \
  --copy-off 0.225,0.208 --copy-off-note "look-back off, seeds 2954/2955 (R140)" --copy-design R144 --copy-status top \
  --out "$OUT"
