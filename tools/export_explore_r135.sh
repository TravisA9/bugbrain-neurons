#!/bin/sh
# The exact export that produced hosting/computelab/private/explore for R135 (run from the research checkout, e.g. /workspace/sweep).
# The KN 5-gram comparison hits come from tools/explore_kn5_hits.py (standing/ngram.py, same 98k training letters).
set -e
S=sw/out; OUT=${OUT:-../explore-wt/hosting/computelab/private/explore}
python3 ${TOOLS:-../explore-wt/tools}/explore_kn5_hits.py 2953 /tmp/kn5_2953.json
node ${TOOLS:-../explore-wt/tools}/export_explore.js --version R135 --commit 7e20a207 --variant-file standing/variant_r135cand.txt --updated 2026-11-23 \
  --read $S/bd_b100cand_4x_2953.json --read-held standing/data_k2953.json --read-compare /tmp/kn5_2953.json \
  --name $S/np_np_cand_4x_2951.json,$S/np_np_cand_4x_2953.json \
  --copy sw/out/lp_g144p_S2_4x_2960.json,sw/out/lp_g144p_S2_4x_2961.json,sw/out/lp_g144p_S2_4x_2962.json,sw/out/lp_g144p_S2_4x_2963.json,sw/out/lp_g144p_S2_4x_2964.json,sw/out/lp_g144p_S2_4x_2965.json,sw/out/lp_g144p_S2_4x_2966.json,sw/out/lp_g144p_S2_4x_2967.json,sw/out/lp_g144p_S2_4x_2968.json,sw/out/lp_g144p_S2_4x_2969.json,sw/out/lp_g144p_S2_4x_2970.json,sw/out/lp_g144p_S2_4x_2971.json,sw/out/lp_g144p_S2_4x_2973.json,sw/out/lp_g144p_S2_4x_2974.json,sw/out/lp_g144p_S2_4x_2975.json \
  --copy-off 0.225,0.208 --copy-off-note "look-back off, seeds 2954/2955 (R140)" --copy-design R140-S2 --copy-status testing \
  --out "$OUT"
