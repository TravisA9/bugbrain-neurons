'use strict';
/* run/mempar.js (R75): memory-aware parallelism for a `runs` job.
 * A job may declare "memGB": the peak resident memory of ONE of its runs (GB). queue.js then starts at most
 *   floor(min(0.7 x total RAM, 0.9 x currently available RAM) / memGB) runs at once (at least 1, at most --workers).
 * Why: R75, an 8x-cortex book run peaks at ~4.4 GB; linux-pc started ~8 of them at once and the whole worker was killed by the
 * out-of-memory guard every ~4 minutes (y46 claimed and released 30+ times, Oct 19 4:42-7:20 PM CT). Jobs without memGB are unchanged.
 * Jobs that use it list "run/mempar.js" in `requires`, so a worker on older code never claims them. */
const os = require('os');
function runParallel(j, workers) {
  const g = +(j && j.memGB); if (!(g > 0)) return workers;
  const GB = 2 ** 30, cap = Math.min(0.7 * os.totalmem() / GB, 0.9 * os.freemem() / GB);
  return Math.max(1, Math.min(workers, Math.floor(cap / g)));
}
module.exports = { runParallel };
if (require.main === module) { const g = +process.argv[2] || 4.6; console.log(`total ${(os.totalmem() / 2 ** 30).toFixed(1)} GB, free ${(os.freemem() / 2 ** 30).toFixed(1)} GB, memGB ${g} -> ${runParallel({ memGB: g }, Math.max(1, os.cpus().length - 2))} parallel runs`); }
