#!/usr/bin/env node
'use strict';
/* Headless SpikeFoundry job. Same engine as the browser lab. One process, one checkpoint directory.
 *   node spikefoundry/run.js --job job.json --out dir
 * Does not read the git queue and does not donate anything by itself. */
const fs = require('fs'), path = require('path');
const SF = require('./engine.js');
const Scenarios = require('./scenarios.js');

function args(argv) {
  const a = {}; const v = argv.slice(2);
  for (let i = 0; i < v.length; i++) { const k = v[i].replace(/^--/, ''); if (k === 'dry') a[k] = true; else a[k] = v[++i]; }
  return a;
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n'); fs.renameSync(tmp, p); }

function budgetOf(job) {
  const base = job.budget && job.budget.profile === 'full' ? SF.FULL_BUDGET : job.budget && job.budget.profile === 'lab' ? SF.LAB_BUDGET : SF.PILOT_BUDGET;
  return Object.assign({}, base, job.budget || {});
}

function execute(job, outDir) {
  if (!job || job.kind !== 'spikefoundry') throw new Error('This runner only accepts kind "spikefoundry".');
  if (!Number.isInteger(+job.seed)) throw new Error('A SpikeFoundry job needs an integer seed.');
  const batches = +job.batches || +((job.budget && job.budget.batches) || 1);
  if (batches < 1 || batches > 20) throw new Error('batches must be from 1 to 20.');
  fs.mkdirSync(outDir, { recursive: true });
  if (job.mode === 'inverse-experiment') {
    const { study, sharedStudy, packModel } = require('./inverse_designer');
    const summaryPath = path.join(outDir, 'summary.json');
    if (fs.existsSync(summaryPath)) {
      const saved = readJson(summaryPath);
      const cached = saved.research;
      if (cached?.version === 'inverse-designer-1' && cached.seed === +job.seed
          && cached.promotion?.benchmark === job.inverseShared?.benchmark
          && cached.promotion?.parentGeneration === job.inverseShared?.generation) return saved;
    }
    const { model, report } = job.inverseShared ? sharedStudy(+job.seed, job.inverseShared)
      : study({ seed: +job.seed, epochs: job.inverseGallery ? 2400 : 120 });
    const { results, ...research } = report;
    research.checkpoint = packModel(model);
    research.discoveries = results.map(({ learned, replay, freshCount }) => ({
      genes: learned.genes, accuracy: learned.accuracy, recall: learned.recall,
      specificity: learned.specificity, demoAccuracy: learned.demoAccuracy, replay, freshCount,
    }));
    const note = 'Inverse design verified ' + report.metrics.learned.verified + '/' + report.testTasks +
      (report.promotion ? ' promotion trials from generation ' + report.promotion.parentGeneration + '.'
        : ' held-out tasks. Random proposals verified ' + report.metrics.random.verified + '/' + report.testTasks + '.');
    const summary = { synthetic: true, batches: 1, tasks: [], note, research };
    writeJson(summaryPath, summary);
    return summary;
  }
  if (job.mode === 'sequence-experiment') {
    const { runExperiment, experimentReport } = require('./experiment');
    const progress = path.join(outDir, 'progress.json');
    const state = runExperiment({ ...job.experiment, seed: +job.seed }, outDir, (done, total) => {
      writeJson(progress, { synthetic: true, batchesDone: done, batchesTotal: total, status: 'running' });
    });
    const research = experimentReport(state);
    const note = 'Sequence experiment completed ' + research.rounds.length + ' rounds. ' +
      (research.promoted ? 'Promoted checkpoint ' + research.approved.id.slice(0, 12) + '.' : 'No new checkpoint passed promotion.');
    const summary = { synthetic: true, batches: 1, tasks: [], note, research };
    writeJson(path.join(outDir, 'summary.json'), summary);
    writeJson(progress, { synthetic: true, batchesDone: research.rounds.length, batchesTotal: research.rounds.length, status: 'done' });
    writeJson(path.join(outDir, 'queue_state.json'), { jobs: { [job.id || 'spikefoundry']: { status: 'done', pass: null, summary: note, synthetic: true } } });
    return summary;
  }
  if (job.mode === 'train-model' || job.mode === 'propose') {
    const Designer = require('./designer.js');
    const sum = Designer.run(job, outDir, SF);
    writeJson(path.join(outDir, 'queue_state.json'), { jobs: { [job.id || 'spikefoundry']: { status: 'done', pass: null, summary: sum.note, synthetic: true } } });
    return sum;
  }
  const cpPath = path.join(outDir, 'checkpoint.json');
  const progressPath = path.join(outDir, 'progress.json');
  let state = fs.existsSync(cpPath) ? SF.restore(readJson(cpPath)) : SF.createState(+job.seed, budgetOf(job));
  if (state.seed !== (+job.seed >>> 0) && state.seed !== +job.seed) throw new Error('Checkpoint seed does not match the job. Refusing to mix runs.');
  writeJson(progressPath, { synthetic: true, batchesDone: state.batch, batchesTotal: batches, status: 'running', seed: +job.seed, known: true });
  while (state.batch < batches) {
    if (process.env.SF_FAIL_AFTER && state.batch >= +process.env.SF_FAIL_AFTER) {
      const err = new Error('Stopped after checkpoint ' + state.batch + ' (test failure). The checkpoint was kept.');
      err.code = 'injected';
      throw err;
    }
    require('./throttle.js').pace();
    SF.runBatch(state);
    writeJson(cpPath, SF.checkpoint(state));
    const sum = SF.summary(state);
    writeJson(progressPath, { synthetic: true, batchesDone: state.batch, batchesTotal: batches, status: 'running', seed: +job.seed, known: true, bestSynthetic: sum.tasks[0] ? sum.tasks[0].syntheticScore : null });
    writeJson(path.join(outDir, 'summary.json'), sum);
  }
  const sum = SF.summary(state);
  if (job.scenario || job.curriculum) {
    sum.scenario = Scenarios.runJob(job);
    writeJson(path.join(outDir, 'scenario.json'), sum.scenario);
  }
  writeJson(progressPath, { synthetic: true, batchesDone: state.batch, batchesTotal: batches, status: 'done', seed: +job.seed, known: true, scenario: job.scenario || (job.curriculum ? 'curriculum' : null) });
  const log = ['# SpikeFoundry synthetic run', '', 'Seed ' + job.seed + '. Batches ' + batches + '.', 'These percents are synthetic spike-pattern matches, not BugBrain scores.', ''];
  for (const row of sum.tasks) log.push('- ' + row.name + ': synthetic score ' + row.syntheticScore.toFixed(3) + ', pattern match ' + (row.syntheticMatch * 100).toFixed(1) + '%');
  if (sum.scenario) log.push('', 'Scenario pipeline: ' + (job.curriculum ? 'curriculum' : job.scenario) + '. ' + Scenarios.NOTE);
  fs.writeFileSync(path.join(outDir, 'QUEUE_LOG.md'), log.join('\n') + '\n');
  writeJson(path.join(outDir, 'queue_state.json'), { jobs: { [job.id || 'spikefoundry']: { status: 'done', pass: null, summary: sum.note, synthetic: true } } });
  if (job.track === 'levels') {
    sum.curriculum = require('./curriculum.js').run(+job.seed || 1);
  }
  const Library = require('./library.js');
  const records = Library.fromEvaluations(state.evaluations || [], { jobId: job.id || 'spikefoundry', engineVersion: 'spikefoundry-1' });
  if (records.length) writeJson(path.join(outDir, 'designs.json'), { records: records });
  return sum;
}

function main() {
  const a = args(process.argv);
  const job = a.job ? readJson(a.job) : { id: 'spikefoundry-local', kind: 'spikefoundry', seed: +(a.seed || 1), batches: +(a.batches || 1), budget: a.profile ? { profile: a.profile } : undefined };
  const out = a.out || path.join(process.cwd(), 'spikefoundry-out');
  try {
    const sum = execute(job, out);
    console.log(JSON.stringify({ ok: true, synthetic: true, batches: sum.batches, tasks: sum.tasks.length }));
  } catch (e) {
    try {
      const progressPath = path.join(out, 'progress.json');
      const prev = fs.existsSync(progressPath) ? readJson(progressPath) : { batchesDone: 0, batchesTotal: +(job.batches || 1), known: false };
      writeJson(progressPath, Object.assign(prev, { status: 'error', error: e.message, synthetic: true }));
      fs.writeFileSync(path.join(out, 'error.txt'), e.message + '\n');
    } catch (e2) {}
    console.error(e.message || e);
    process.exit(1);
  }
}

module.exports = { execute, budgetOf };
if (require.main === module) main();
