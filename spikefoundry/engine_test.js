'use strict';
/* node spikefoundry/engine_test.js */
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
const SF = require('./engine.js');
const Run = require('./run.js');
const Sch = require('./schedule.js');
let n = 0;
function check(cond, what) { n++; if (!cond) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sf-')); }

const a = SF.createState(7, SF.PILOT_BUDGET);
const b = SF.createState(7, SF.PILOT_BUDGET);
SF.runBatch(a); SF.runBatch(b);
check(JSON.stringify(SF.checkpoint(a)) === JSON.stringify(SF.checkpoint(b)), 'same seed and budget produce the same checkpoint');
const c = SF.createState(8, SF.PILOT_BUDGET); SF.runBatch(c);
check(JSON.stringify(SF.checkpoint(a)) !== JSON.stringify(SF.checkpoint(c)), 'a different seed changes the checkpoint');

const g = { topology: 'parallel', wa: 1.1, wb: 1.05, thr: 1.4, decay: .4, nodes: 2, depth: 1 };
const s1 = SF.scoreDesign(g, 'coincidence', true, 0, SF.PILOT_BUDGET, SF.createState(1).rng);
const s2 = SF.scoreDesign(g, 'coincidence', true, 0, SF.PILOT_BUDGET, SF.createState(99).rng);
check(s1.accuracy === s2.accuracy && s1.quality === s2.quality && s1.synthetic === true, 'validation score is seeded and marked synthetic');
check(s1.accuracy >= 0 && s1.accuracy <= 1, 'synthetic match stays between 0 and 1');

const silentG = { topology: 'parallel', wa: 0, wb: 0, thr: 99, decay: .4, nodes: 2, depth: 1 };
const silent = SF.scoreDesign(silentG, 'sequence', true, 0, SF.PILOT_BUDGET, SF.createState(1).rng);
check(silent.recall === 0 && silent.spikes === 0 && silent.accuracy > 0.5 && silent.quality === 0, 'a silent net that only matches true negatives gets no quality on sequence');

const code = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(code, sandbox, { filename: 'engine.js' });
const browser = sandbox.SpikeFoundry;
const d = browser.createState(7, browser.PILOT_BUDGET);
browser.runBatch(d);
check(JSON.stringify(browser.checkpoint(d)) === JSON.stringify(SF.checkpoint(a)), 'browser global and node require run the same batch');

const dir1 = tmp(), dir2 = tmp();
const job = { id: 'sf-pilot', kind: 'spikefoundry', project: 'spikefoundry', seed: 11, batches: 2, budget: SF.PILOT_BUDGET };
Run.execute(job, dir1);
const again = SF.createState(11, SF.PILOT_BUDGET); SF.runBatch(again); SF.runBatch(again);
const saved = JSON.parse(fs.readFileSync(path.join(dir1, 'checkpoint.json'), 'utf8'));
check(saved.batch === 2 && saved.seed === 11, 'headless run writes a two-batch checkpoint');
check(JSON.stringify(saved.model.W1) === JSON.stringify(SF.checkpoint(again).model.W1), 'headless checkpoint matches a second engine run');
Run.execute(Object.assign({}, job, { seed: 12 }), dir2);
check(fs.readFileSync(path.join(dir1, 'checkpoint.json'), 'utf8') !== fs.readFileSync(path.join(dir2, 'checkpoint.json'), 'utf8'), 'two output folders do not share a checkpoint');

const failDir = tmp();
let failed = false;
try { cp.execFileSync(process.execPath, [path.join(__dirname, 'run.js'), '--job', writeJob(failDir), '--out', path.join(failDir, 'out')], { env: Object.assign({}, process.env, { SF_FAIL_AFTER: '1' }), encoding: 'utf8' }); }
catch (e) { failed = true; }
check(failed, 'an injected failure exits non-zero');
const mid = JSON.parse(fs.readFileSync(path.join(failDir, 'out', 'checkpoint.json'), 'utf8'));
check(mid.batch === 1, 'the failure keeps the checkpoint from the finished batch');
cp.execFileSync(process.execPath, [path.join(__dirname, 'run.js'), '--job', path.join(failDir, 'job.json'), '--out', path.join(failDir, 'out')], { encoding: 'utf8' });
const done = JSON.parse(fs.readFileSync(path.join(failDir, 'out', 'progress.json'), 'utf8'));
check(done.status === 'done' && done.batchesDone === 2 && done.synthetic === true, 'retry continues from the checkpoint to the requested batches');

function writeJob(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'job.json');
  fs.writeFileSync(p, JSON.stringify(job));
  return p;
}

const projects = Sch.DEFAULTS.map(p => Object.assign({}, p));
const sf = { id: 'sf1', kind: 'spikefoundry', project: 'spikefoundry', priority: 0.2, batches: 1, seed: 1 };
const bb = { id: 'bb1', kind: 'runs', project: 'bugbrain', priority: 0.9, estHours: 0.2 };
const donor = { donate: true, allowedProjects: ['spikefoundry', 'bugbrain'], maxBatches: 2, pause: false };
check(Sch.choose([bb, sf], projects, donor, true)[0].id === 'sf1', 'an opted-in donor takes SpikeFoundry before a higher BugBrain priority');
check(Sch.choose([bb], projects, donor, true)[0].id === 'bb1', 'BugBrain is the fallback when SpikeFoundry has nothing eligible');
check(Sch.choose([bb, sf], projects, null, false).every(j => j.id !== 'sf1') && Sch.choose([bb, sf], projects, null, false)[0].id === 'bb1', 'without a participant file, SpikeFoundry is not claimed and BugBrain still is');
check(Sch.choose([bb, sf], projects, { donate: false, allowedProjects: ['spikefoundry', 'bugbrain'] }, true).length === 0, 'donation off claims nothing');
check(Sch.choose([bb, sf], projects, { donate: true, allowedProjects: ['bugbrain'], pause: false }, true)[0].id === 'bb1', 'a donor who declined SpikeFoundry is not given it');
check(Sch.choose([sf, bb], projects, Object.assign({}, donor, { pause: true }), true).length === 0, 'pause claims nothing new');
const off = projects.map(p => p.id === 'spikefoundry' ? Object.assign({}, p, { enabled: false }) : p);
check(Sch.choose([sf, bb], off, donor, true)[0].id === 'bb1', 'disabling SpikeFoundry falls through to BugBrain');
const tooBig = Object.assign({}, sf, { id: 'sf-big', batches: 9 });
check(!Sch.choose([tooBig, bb], projects, donor, true).some(j => j.id === 'sf-big'), 'a batch limit is enforced');
check(Sch.choose([bb, sf], null, donor, true).every(j => j.project !== 'spikefoundry'), 'with no project list, SpikeFoundry stays out and BugBrain order remains');
check(/spikefoundry stays ahead/.test(Sch.explain(Sch.choose([bb], projects, donor, true), projects)), 'fallback copy keeps SpikeFoundry ahead when it has no job');
check(/^spikefoundry is what/.test(Sch.explain(Sch.choose([sf, bb], projects, donor, true), projects)), 'SpikeFoundry is named when it is the job that would run');
const running = { id: 'bb-live', kind: 'runs', project: 'bugbrain' };
const waitingOnly = [sf, bb];
check(!Sch.choose(waitingOnly, projects, donor, true).some(j => j.id === running.id), 'a running lease that is not in the free list is not returned');

const lab = fs.readFileSync(path.join(__dirname, 'lab.html'), 'utf8');
check(!lab.includes('/api/') && !/Donate compute/.test(lab), 'the explore lab has no queue API and no donate control');
check(lab.includes('Not a BugBrain') || lab.includes('not a BugBrain'), 'the lab says the score is not a BugBrain result');
const original = fs.readFileSync(path.join(__dirname, 'original', 'SpikeFoundry-SNN-Design-Lab.html'));
check(original.length === 61592 && original.includes('SpikeFoundry — SNN Design Lab'), 'the supplied HTML is stored unchanged');

console.log(n + ' checks');
if (process.exitCode) process.exit(process.exitCode);
