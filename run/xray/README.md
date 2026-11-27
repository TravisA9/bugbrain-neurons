# Brain X-ray (opt-in trace mode for the R144 text brain)
Run: `node --max-old-space-size=6500 sw/xray.js <k> "$(cat run/xray/r144.txt)" <tag> <nSyms> [passageLen=400]` -> sw/out/xray_<tag>_<k>.json
Same growth / seeds / params as sw/bookdiag.js. Records, per symbol slot: which granules (with their decoded context keys) and cortex
cells spiked in the read window, their drive onto every output (spike count x current weight), the real answer vs the drive argmax,
and recycling of granule slots. Diagnostics: error types (didn't know / weak / outshouted, plus whether the answer was knowable from the
text seen so far), unit reuse across contexts, dead weight (single-cell drive-removal ablation on held-out), forgetting (learned
granules evicted and re-learned), learning-to-learn (accuracy by context novelty over life vs an online count model), and the context
length behind each decision. The passage trace (first passageLen held-out steps) feeds the X-ray Page.
Caveat: the drive model reproduces the real answer on about 83-85% of steps (reported as `agreement`).
