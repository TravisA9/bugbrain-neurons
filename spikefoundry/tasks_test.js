'use strict';
const Tasks = require('./tasks.js');
const SF = require('./engine.js');
const Scenarios = require('./scenarios.js');
let n = 0;
function check(ok, what) { n++; if (!ok) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }

const specs = Tasks.allSpecs();
check(specs.length === Object.keys(SF.BASE_TASKS).length + Scenarios.KINDS.length, 'every toy task and scenario has a descriptor');
specs.forEach(spec => {
  const again = Tasks.specById(spec.id);
  const feat = Tasks.featuresOf(spec);
  check(again && JSON.stringify(again.examples) === JSON.stringify(spec.examples), spec.id + ' examples are fixed for the same id');
  check(feat.length === Tasks.FEATURE_LENGTH && feat.every(v => v >= 0 && v <= 1), spec.id + ' feature vector is 24 numbers from 0 to 1');
});
const coin = Tasks.specById('coincidence');
check(coin.family === 'toy' && coin.inputs.encoding === 'binary' && coin.examples.length === 2 && coin.examples[0].output.length === 1, 'coincidence describes binary spike examples');
const vision = Tasks.specById('scenario-vision');
check(vision.family === 'visual' && vision.inputs.encoding === 'latency' && vision.difficulty === 7 && vision.synthetic === true, 'vision scenario is a visual latency task');
const seq = Tasks.featuresOf(Tasks.specById('scenario-sequence'));
const graph = Tasks.featuresOf(Tasks.specById('scenario-graph'));
check(seq[2] === 1 && graph[3] === 1 && seq[2] !== graph[2], 'scenario families land on different feature slots');
console.log(n + ' checks');
