'use strict';
/* node spikefoundry/scenario_test.js */
const fs = require('fs'), path = require('path'), os = require('os');
const S = require('./scenarios.js');
const Run = require('./run.js');
let n = 0;
function check(cond, what) { n++; if (!cond) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }

function shapeOf(kind, data) {
  if (kind === 'vision') return [data.params.batch, data.params.channels, data.params.height, data.params.width];
  if (kind === 'sequence') return [data.params.batch, data.params.sequence, data.params.hidden];
  if (kind === 'control') return [data.params.batch, data.params.steps, data.params.obs];
  return data.shape;
}

for (const kind of S.KINDS) {
  const a = S.generate(kind, { seed: 4 });
  const b = S.generate(kind, { seed: 4 });
  check(JSON.stringify(a.examples) === JSON.stringify(b.examples), kind + ' data is deterministic for a seed');
  check(JSON.stringify(S.generate(kind, { seed: 5 }).examples) !== JSON.stringify(a.examples), kind + ' changes with the seed');
  const overlap = a.train.filter(i => a.heldOut.indexOf(i) >= 0);
  check(overlap.length === 0 && a.train.length > 0 && a.heldOut.length > 0, kind + ' held-out split does not overlap train');
  check(JSON.stringify(shapeOf(kind, a)) === JSON.stringify(a.shape) || kind === 'graph', kind + ' reports its tensor shape');
  if (kind === 'vision') check(a.examples[0].values.length === a.params.channels * a.params.height * a.params.width, 'vision values are channels × height × width');
  if (kind === 'sequence') check(a.examples[0].values.length === a.params.sequence && a.examples[0].values[0].length === a.params.hidden && a.examples[0].nextTokens.length === a.params.sequence, 'sequence matrix is [time, hidden] and has next-token targets');
  if (kind === 'graph') check(a.examples[0].adjacency.length === a.params.nodes && a.examples[0].features[0].length === a.params.features && a.examples[0].relations.length > 0, 'graph example has adjacency, features, and relations');
  if (kind === 'control') check(a.examples[0].values.length === a.params.steps && a.examples[0].values[0].length === a.params.obs && a.examples[0].rewards.length === a.params.steps, 'control episode is [time, observation] plus rewards');
  const coded = S.encodeSpikes(a.examples[0], a.params.steps);
  check(coded.events.every(e => e.t >= 0 && e.t < a.params.steps), kind + ' spikes stay inside the time window');
  const report = S.runOne(kind, { seed: 4 });
  check(report.synthetic === true && report.pipelineOk === true && report.note.indexOf('not real-world') >= 0, kind + ' pipeline score is labeled synthetic');
  check(JSON.stringify(report).length < 20000, kind + ' report stays compact and omits the full tensor');
}

let bounded = false;
try { S.normalize('vision', { height: 100 }); } catch (e) { bounded = e.code === 'bounds'; }
check(bounded, 'owner parameters outside the cap are rejected');
let unknown = false;
try { S.normalize('imagenet', {}); } catch (e) { unknown = e.code === 'scenario'; }
check(unknown, 'unknown scenario names are rejected');

const coin = S.compileModule(S.moduleSpec('coincidence'));
const seq = S.compileModule(S.moduleSpec('sequence'), coin.neurons.length);
const composed = S.compose([coin, seq]);
check(composed.modules.length === 2 && composed.synapses.some(s => s.from === coin.outputs[0] && s.to === seq.inputs[0]), 'composition connects spike outputs to the next module inputs');
check(composed.synapses.length < composed.neurons.length * composed.neurons.length, 'the compiled graph stores synapses sparsely');

const events = [{ t: 0, channel: 0 }, { t: 0, channel: 1 }];
const graph = S.compileReadout(2);
const flipped = JSON.parse(JSON.stringify(graph));
flipped.neurons.forEach(n => { n.partition = n.partition ? 0 : 1; });
const one = S.simulateEvents(graph, events, 6);
const two = S.simulateEvents(flipped, events, 6);
check(JSON.stringify(one.outputSpikes) === JSON.stringify(two.outputSpikes), 'partition labels do not change the spikes the graph emits');

check(S.stageAllowed('sequence', {}) === false && S.stageAllowed('sequence', { vision: true }) === true, 'sequence waits until the vision stage has run');
const curriculum = S.runCurriculum({ seed: 9, batch: 2, steps: 6 });
check(curriculum.advancedThrough.join(',') === 'vision,sequence,graph,control', 'a clean seed walks the four synthetic stages in order');
check(curriculum.note.indexOf('not a quality pass') >= 0, 'curriculum promotion is not described as task quality');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-scen-'));
const job = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples', 'vision-job.json'), 'utf8'));
Run.execute(job, dir);
const written = JSON.parse(fs.readFileSync(path.join(dir, 'scenario.json'), 'utf8'));
check(written.kind === 'vision' && written.shape.join(',') === '2,1,4,4' && written.synthetic === true, 'a vision job writes a compact scenario report');
check(!fs.readdirSync(dir).some(name => name.endsWith('.bin') || name.startsWith('dataset')), 'the job output does not dump a dataset file');

console.log(n + ' checks');
if (process.exitCode) process.exit(process.exitCode);
