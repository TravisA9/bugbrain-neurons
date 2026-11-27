# Brain X-ray: trace mode is bit-identical (Nov 27, 2026)
`sw/xray.js` is the opt-in trace mode. It changes no file under js/ (engine untouched; default runs cannot be affected) and its
observers only read state (no RNG draws, no writes). Proof that a TRACED life equals an untraced one: R144 (ctrl variant, run/xray/r144.txt),
book30k, per-held-out-prediction hit string compared with the untraced sw/bookdiag.js runs from R145 t1 (bd_g145a_ctrl_<k>.json):
- k2977: identical hits string, heldAcc 0.4935 = 0.4935
- k2978: identical hits string, heldAcc 0.5215 = 0.5215
- test_core.js on this branch: ALL OK (Nov 27 ~10:55 CT). spikefoundry: 10/10 PASS.
