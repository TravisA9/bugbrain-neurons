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
console.log(n + ' checks');
