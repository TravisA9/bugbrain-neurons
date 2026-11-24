# R145 off = bit-identical proof (Nov 24 ~10:20 CT)
- test_core ALL OK (sw/logs/tc145.log, 19 min) incl. new R145 check: wSlow 0 (with wSlowPull 0.5 / wSlowRead 1 set) bit-identical to unset;
  wSlow 1 (C = U every visit) bit-identical to off; wSlow .05 + pull .1 and wSlow .05 + read 1 change the readout and learn.
- spikefoundry 10/10 PASS (sw/logs/sf145.log).
- Full R144 champion at 4x, book5000, k2977 (sw/bookdiag.js): unset (bit145_x) vs `P.wSlow=0,P.wSlowPull=0.5,P.wSlowRead=1` (bit145_z)
  vs `P.wSlow=1,P.wSlowPull=0.5,P.wSlowRead=0.5` (bit145_one): heldAcc .444 all three; per-prediction hit string, substeps, region spike
  rates, output drive, granule event stats all identical.
