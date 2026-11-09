'use strict';
const Designer = require('./designer.js');
const Genome = require('./genome_v2.js');
const Tasks = require('./tasks.js');
let n = 0;
function check(ok, what) { n++; if (!ok) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }
function rngOf(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rng = rngOf(5);
const examples = [];
let genome = Genome.blank(2, 1);
for (let i = 0; i < 24; i++) {
  genome = Genome.mutate(genome, rng);
  const weight = Designer.designFeatures(genome)[4];
  examples.push(Designer.exampleFromScore('coincidence', genome, weight));
}
const fit = Designer.fitSurrogate(examples, 5);
check(fit.heldOut >= 1 && fit.spearman > 0.3, 'surrogate rank correlation on held-out designs is above 0.3 (got ' + fit.spearman.toFixed(3) + ')');

const feat = Tasks.featuresOf(Tasks.specById('coincidence'));
const screened = Designer.screen(feat, Genome.blank(2, 1), rngOf(8), fit.model, 8);
check(screened.length === 3 && screened[0].predicted >= screened[screened.length - 1].predicted, 'the surrogate keeps only the higher-ranked mutations');
const proposed = Designer.propose(feat, rngOf(2), Designer.makePolicy(rngOf(2)));
check(proposed.v === 2 && JSON.stringify(proposed).indexOf('stdp') < 0, 'the generator proposes a frozen v2 genome');

const os = require('os'), path = require('path'), fs = require('fs');
const small = Genome.sanitize(Genome.blank(1, 1));
small.modules.forEach(mod => { if (mod.kind === 'lif') mod.n = 1; });
const big = Genome.sanitize(Genome.blank(4, 2));
big.modules.forEach(mod => { if (mod.kind === 'lif') mod.n = 6; });
const smallScore = Designer.scoreGenome(small, 'coincidence', 1);
const bigScore = Designer.scoreGenome(big, 'coincidence', 1);
const smallNet = Genome.compile(small);
const bigNet = Genome.compile(big);
check(smallScore.neurons === smallNet.neurons.length && smallScore.synapses === smallNet.edges.length && bigScore.neurons === bigNet.neurons.length && bigScore.synapses === bigNet.edges.length && smallScore.neurons !== bigScore.neurons && smallScore.synapses !== bigScore.synapses, 'distinct genomes with different sizes record different counts');

const out = path.join(os.tmpdir(), 'designer-score-' + process.pid);
const SF = require('./engine.js');
Designer.run({ id: 'score-job', mode: 'propose', taskId: 'coincidence', seed: 11, evals: 40, targetSeconds: 30, keepTop: 3, keepRandom: 2 }, out, SF);
const saved = JSON.parse(fs.readFileSync(path.join(out, 'designs.json'), 'utf8'));
const records = saved.records;
const genomes = new Set(records.map(row => row.genomeHash));
const signatures = new Set(records.map(row => [row.metrics.quality, row.metrics.train, row.metrics.heldOut, row.spikes, row.neurons, row.synapses].join('|')));
const sizes = new Set(records.map(row => row.neurons + '/' + row.synapses));
const randoms = records.filter(row => row.metrics.arm === 'random').length;
let replay = true;
records.forEach(row => {
  const again = Designer.scoreGenome(JSON.parse(row.genomeJson), row.taskId, row.seed);
  if (again.quality !== row.metrics.quality || again.spikes !== row.spikes || again.train !== row.metrics.train || again.heldOut !== row.metrics.heldOut || again.neurons !== row.neurons || again.synapses !== row.synapses) replay = false;
});
check(genomes.size > 1 && signatures.size > 1 && sizes.size > 1, 'distinct genomes do not all receive the same score and size');
check(replay, 'simulating a recorded genome again reproduces its recorded score');
check(saved.summary.evals === 40 && saved.summary.histogram.reduce((s, n) => s + n, 0) === 40 && saved.summary.curve.length <= 100 && records.length <= 5 && randoms === 2 && randoms < records.length && records.every(row => row.engineVersion === 'spikefoundry-designer-3'), 'a job keeps the top designs and a capped random sample, plus a summary');
const timedOut = path.join(out, 'timed');
const began = Date.now();
Designer.run({ id: 'timed-job', mode: 'propose', taskId: 'coincidence', seed: 4, evals: 0, targetSeconds: 1, keepTop: 5, keepRandom: 5 }, timedOut, SF);
const timedDoc = JSON.parse(fs.readFileSync(path.join(timedOut, 'designs.json'), 'utf8'));
const progress = JSON.parse(fs.readFileSync(path.join(timedOut, 'progress.json'), 'utf8'));
check(timedDoc.summary.evals >= 1 && timedDoc.summary.evals < 250000 && timedDoc.records.length <= 10 && progress.evals === timedDoc.summary.evals && (Date.now() - began) < 4000, 'a propose job stops at its time budget and reports progress');
console.log(n + ' checks');
