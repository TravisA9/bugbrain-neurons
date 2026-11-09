'use strict';
const Lib = require('./library.js');
let n = 0;
function check(ok, what) { n++; if (!ok) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }
const genome = { wa: 1.1, topology: 'parallel', decay: 0.4 };
const flipped = { decay: 0.4, topology: 'parallel', wa: 1.1 };
check(Lib.genomeHash(genome) === Lib.genomeHash(flipped), 'genome hash ignores key order');
check(Lib.genomeJson(genome).indexOf('"decay"') < Lib.genomeJson(genome).indexOf('"topology"'), 'canonical JSON sorts keys');
const rows = Lib.fromEvaluations([
  { taskId: 'coincidence', genome: genome, metrics: { quality: 0.5 }, neurons: 2, synapses: 3, spikes: 4, evalMs: 1, seed: 9 },
  { taskId: 'bad' },
], { jobId: 'job-1' });
check(rows.length === 1 && rows[0].genomeHash === Lib.genomeHash(genome) && rows[0].jobId === 'job-1', 'evaluations become compact records and drop incomplete rows');
console.log(n + ' checks');
