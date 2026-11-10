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
const golden = JSON.parse('{"modules":[{"id":"in","kind":"input","leak":0.8,"motif":"feedforward","n":5,"sign":1,"thr":1},{"id":"e","kind":"lif","leak":0.3409,"motif":"coincidence","n":1,"sign":1,"thr":2.0069},{"id":"i","kind":"lif","leak":0.7961,"motif":"wta","n":1,"sign":-1,"thr":2.4083},{"id":"out","kind":"output","leak":0.8,"motif":"feedforward","n":1,"sign":1,"thr":1.0}],"v":2,"wires":[{"delay":0,"from":"in","pattern":"all","to":"e","weight":0.8},{"delay":2,"from":"e","pattern":"one","to":"i","weight":-0.1636},{"delay":1,"from":"i","pattern":"lateral","to":"e","weight":1.8566},{"delay":0,"from":"e","pattern":"feedforward","to":"out","weight":1}]}');
const shuffled = JSON.parse(JSON.stringify(golden));
shuffled.modules.reverse(); shuffled.wires.reverse();
check(Lib.designHash(golden) === '55099528cf18e80b3abafe79a78032bbe43b0bb6b258768a1056e10ab8976b33' && Lib.designHash(shuffled) === Lib.designHash(golden) && Lib.genomeHash(shuffled) !== Lib.genomeHash(golden), 'the canonical design hash ignores module and wire order and matches the PHP value');
const nudged = JSON.parse(JSON.stringify(golden)); nudged.wires[1].weight = -0.1637;
check(Lib.designHash(nudged) !== Lib.designHash(golden), 'a different weight is a different design');
console.log(n + ' checks');
