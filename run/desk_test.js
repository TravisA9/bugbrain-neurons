'use strict';
/* Queue control, truthful status, and the local desk. No network, no live queue.
 *   node run/desk_test.js
 *   node run/console_test.js */
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const WC = require('./wconfig.js');
const Desk = require('./desk.js');
const Machine = require('./machine.js');
const TM = require('./templates.js');
const ROOT = path.resolve(__dirname, '..');
let n = 0;
function check(cond, what) { n++; if (!cond) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'bb-desk-')); }
function write(dir, rel, obj) { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
const NOW = Date.parse('2026-11-09T01:02:00.000Z');
function worker(name, state, job, at, type) { return { worker: name, type: type || 'linux', state, job, mode: 'run', host: name, platform: type === 'windows' ? 'win32' : 'linux', at }; }

function baseQueue(dir) {
  write(dir, 'worker-config.json', {
    version: 1, forceVersion: 0,
    defaults: { mode: 'run' },
    workers: { 'linux-pc': { maxMemGB: 4 }, tacobell: { maxMemGB: 1, skip: ['*book300k*'] }, chromium: {} },
    jobs: { 'y221_held': 'block' },
  });
  write(dir, 'jobs/ready-low.json', { id: 'ready-low', title: 'Low', kind: 'runs', priority: 0.2, estHours: 0.2, memGB: 2, runs: [{ script: 'run/r42.js', args: ['deepURSx3'] }] });
  write(dir, 'jobs/ready-high.json', { id: 'ready-high', title: 'High', kind: 'runs', priority: 0.9, estHours: 0.2, memGB: 2, runs: [{ script: 'run/r42.js', args: ['deepURSx3'] }] });
  write(dir, 'jobs/y221_held.json', { id: 'y221_held', title: 'Held in settings', kind: 'runs', priority: 0.95, estHours: 1, memGB: 2, runs: [{}] });
  write(dir, 'jobs/file-parked.json', { id: 'file-parked', title: 'Parked in the file', kind: 'blocked', priority: 0.99, estHours: 1, runs: [{}] });
  write(dir, 'jobs/big.json', { id: 'big', title: 'Too big for the laptop', kind: 'runs', priority: 0.8, estHours: 1, memGB: 8, runs: [{}] });
  write(dir, 'workers/linux-pc.json', worker('linux-pc', 'idle', null, new Date(NOW - 4 * 60 * 1000).toISOString()));
  write(dir, 'workers/chromium.json', worker('chromium', 'running', 'old-job', '2026-11-02T15:30:24.899Z', 'windows'));
  write(dir, 'workers/tacobell.json', worker('tacobell', 'running', 'old-job-2', '2026-10-30T03:09:23.769Z', 'windows'));
}

check(fs.readFileSync(path.join(ROOT, 'start_worker.bat'), 'utf8').includes('schtasks /Change /TN BugBrainWorker /Enable'), 'start bat enables BugBrainWorker');
check(fs.readFileSync(path.join(ROOT, 'start_worker.bat'), 'utf8').includes('schtasks /Run /TN BugBrainWorker'), 'start bat runs BugBrainWorker');
check(fs.readFileSync(path.join(ROOT, 'stop_worker.bat'), 'utf8').includes('schtasks /End /TN BugBrainWorker'), 'stop bat ends the task');
check(fs.readFileSync(path.join(ROOT, 'stop_worker.bat'), 'utf8').includes('schtasks /Change /TN BugBrainWorker /Disable'), 'stop bat disables the task');
const on = Machine.commands('win32', 'on').map(c => c[0] + ' ' + c[1].join(' ')).join('\n');
check(on === 'schtasks /Change /TN BugBrainWorker /Enable\nschtasks /Run /TN BugBrainWorker', 'Windows on commands match the bat');
const off = Machine.commands('win32', 'off').map(c => c[0] + ' ' + c[1].join(' ')).join('\n');
check(off === 'schtasks /End /TN BugBrainWorker\nschtasks /Change /TN BugBrainWorker /Disable', 'Windows off commands match the bat');
check(Machine.commands('linux', 'off')[0][1].join(' ').includes('disable --now bugbrain-worker.service'), 'Linux off disables the user service');
check(Machine.commands('darwin', 'on') == null, 'macOS has no native worker switch');

const winRunning = Machine.parseWindowsQuery('TaskName: \\BugBrainWorker\nStatus: Running\nScheduled Task State: Enabled\n', 0);
check(winRunning.installed && winRunning.enabled && winRunning.running, 'Windows query: enabled and running');
const winOff = Machine.parseWindowsQuery('TaskName: \\BugBrainWorker\nStatus: Disabled\nScheduled Task State: Disabled\n', 0);
check(winOff.installed && !winOff.enabled && !winOff.running, 'Windows query: disabled is not running');
const winMissing = Machine.parseWindowsQuery('ERROR: The system cannot find the file specified.', 1);
check(!winMissing.installed && !winMissing.running, 'missing task is not installed and not running');
const winUnknown = Machine.parseWindowsQuery('', 1);
check(winUnknown.unknown && winUnknown.running !== true, 'unreadable task is unknown, not running');
const lin = Machine.parseLinux('enabled', 0, 'active');
check(lin.installed && lin.enabled && lin.running, 'systemd active and enabled');
const linOff = Machine.parseLinux('disabled', 1, 'inactive');
check(linOff.installed && !linOff.enabled && !linOff.running, 'systemd disabled and inactive');
const linGone = Machine.parseLinux('Failed to get unit file state: not-found', 1, 'inactive');
check(!linGone.installed, 'missing unit is not installed');
let execs = [];
const preview = Machine.apply('on', { platform: 'win32', live: false, exec: () => { execs.push('no'); return { code: 0, out: '' }; } });
check(preview.preview && !preview.applied && execs.length === 0, 'preview on does not touch the task');
execs = [];
const stopped = Machine.apply('off', { platform: 'win32', live: true, exec: (c, a) => { execs.push(a[0]); return { code: a[0] === '/End' ? 1 : 0, out: '' }; } });
check(stopped.ok && stopped.applied && execs.join(',') === '/End,/Change', 'End may fail if already stopped; Disable still runs');

const dir = tmp();
baseQueue(dir);
const state = Desk.view(dir, NOW);
const byName = Object.fromEntries(state.workers.map(w => [w.name, w]));
check(byName['linux-pc'].connected && byName['linux-pc'].activity === 'idle' && byName['linux-pc'].label === 'Idle', 'fresh idle heartbeat is idle and connected');
check(!byName.chromium.connected && byName.chromium.activity === 'offline' && /not treated as live/.test(byName.chromium.staleNote), 'stale running heartbeat is offline, not busy');
check(!byName.tacobell.connected && byName.tacobell.activity === 'offline', 'week-old running heartbeat is offline');
const jobs = Object.fromEntries(state.jobs.map(j => [j.id, j]));
check(jobs['ready-high'].phase === 'waiting' && jobs['ready-low'].phase === 'waiting', 'unclaimed tests are waiting');
check(jobs['y221_held'].phase === 'parked' && jobs['y221_held'].parkReason === 'config', 'config block parks a test');
check(jobs['file-parked'].phase === 'parked' && jobs['file-parked'].parkReason === 'file', 'kind blocked stays parked');
check(jobs['ready-high'].runnableBy.includes('linux-pc') && !jobs['ready-high'].runnableBy.includes('tacobell'), '2 GB test fits linux-pc and not the 1 GB laptop');
check(!jobs.big.runnableBy.includes('linux-pc') && !jobs.big.runnableBy.includes('tacobell') && jobs.big.runnableBy.includes('chromium'), '8 GB test is skipped by capped computers and still visible for a computer with no memory cap');

const cfg = Desk.load(dir).config;
const raw = Desk.load(dir).jobs;
const picked = WC.selectJobs(cfg, 'linux-pc', 'linux', raw, {});
check(picked.map(j => j.id).join(',') === 'ready-high,ready-low', 'highest priority pending test is first; parked and too-big are skipped');
check(WC.selectJobs(cfg, 'linux-pc', 'linux', raw, { claimed: new Set(['ready-high']) }).map(j => j.id).join(',') === 'ready-low', 'an active claim is not offered to a second worker');
check(WC.selectJobs(cfg, 'linux-pc', 'linux', raw, { claimed: new Set() }).some(j => j.id === 'ready-high'), 'an expired claim does not block (it is simply absent from the claimed set)');
write(dir, 'claims/ready-high.json', { id: 'ready-high', worker: 'chromium', until: new Date(NOW - 1000).toISOString() });
const afterExpiry = Desk.view(dir, NOW);
check(afterExpiry.jobs.find(j => j.id === 'ready-high').phase === 'waiting', 'expired lease returns the test to waiting');
fs.unlinkSync(path.join(dir, 'claims/ready-high.json'));

const pausedCfg = JSON.parse(JSON.stringify(cfg));
pausedCfg.workers['linux-pc'].mode = 'pause';
check(WC.selectJobs(pausedCfg, 'linux-pc', 'linux', raw, {}).length === 0, 'pause claims nothing');
write(dir, 'claims/ready-low.json', { id: 'ready-low', worker: 'linux-pc', until: new Date(NOW + 3600e3).toISOString(), at: new Date(NOW).toISOString() });
const claimBefore = fs.readFileSync(path.join(dir, 'claims/ready-low.json'), 'utf8');
const jobBefore = fs.readFileSync(path.join(dir, 'jobs/ready-low.json'), 'utf8');
const pauseRes = Desk.setMode(dir, 'linux-pc', 'pause');
check(/finishes/.test(pauseRes.effect) && fs.readFileSync(path.join(dir, 'claims/ready-low.json'), 'utf8') === claimBefore, 'pause does not drop the lease');
check(fs.readFileSync(path.join(dir, 'jobs/ready-low.json'), 'utf8') === jobBefore, 'pause does not delete the job');
const pausedView = Desk.view(dir, NOW);
const pc = pausedView.workers.find(w => w.name === 'linux-pc');
check(pc.activity === 'paused' && pc.label === 'Paused', 'connected worker in pause mode shows paused when it is not on a test');
// the leased job's holder heartbeat is idle, not running, so the job is held rather than shown as a live run
check(pausedView.jobs.find(j => j.id === 'ready-low').phase === 'leased', 'a fresh computer that is not reporting the test as running keeps the lease');
let threw = false;
try { Desk.assignJob(dir, 'ready-low', 'tacobell', NOW); } catch (e) { threw = /not reassigned/.test(e.message); }
check(threw, 'cannot reassign a leased test');
check(!fs.existsSync(path.join(dir, 'jobs/ready-low.json')) === false && fs.existsSync(path.join(dir, 'claims/ready-low.json')), 'failed reassign leaves the job and the lease');
Desk.setMode(dir, 'linux-pc', 'run');
fs.unlinkSync(path.join(dir, 'claims/ready-low.json'));

const pri = Desk.setPriority(dir, 'ready-low', 1.2, NOW);
const order = WC.selectJobs(Desk.load(dir).config, 'linux-pc', 'linux', Desk.load(dir).jobs, {}).map(j => j.id);
check(pri.priority === 1.2 && order[0] === 'ready-low', 'raising priority puts that pending test first');
write(dir, 'claims/ready-low.json', { id: 'ready-low', worker: 'linux-pc', until: new Date(NOW + 3600e3).toISOString() });
write(dir, 'workers/linux-pc.json', worker('linux-pc', 'running', 'ready-low', new Date(NOW - 60 * 1000).toISOString()));
const busy = Desk.view(dir, NOW).workers.find(w => w.name === 'linux-pc');
check(busy.connected && busy.activity === 'busy' && busy.job === 'ready-low', 'fresh running heartbeat is busy');
const noted = Desk.setPriority(dir, 'ready-low', 0.1, NOW);
check(/not stopped/.test(noted.note), 'priority change on a live run does not claim to stop it');
check(fs.existsSync(path.join(dir, 'claims/ready-low.json')), 'priority change keeps the lease');
fs.unlinkSync(path.join(dir, 'claims/ready-low.json'));
write(dir, 'workers/linux-pc.json', worker('linux-pc', 'idle', null, new Date(NOW - 60 * 1000).toISOString()));

const asg = Desk.assignJob(dir, 'ready-high', 'tacobell', NOW);
check(asg.assign === 'tacobell', 'pending test can be assigned');
const afterAssign = Desk.load(dir);
check(WC.selectJobs(afterAssign.config, 'tacobell', 'windows', afterAssign.jobs, {}).some(j => j.id === 'ready-high') === false, 'assignment does not override the memory cap');
Desk.assignJob(dir, 'ready-high', 'linux-pc', NOW);
const onlyLinux = Desk.load(dir);
check(WC.selectJobs(onlyLinux.config, 'linux-pc', 'linux', onlyLinux.jobs, {}).some(j => j.id === 'ready-high'), 'assigned worker still sees the test');
check(!WC.selectJobs(onlyLinux.config, 'chromium', 'windows', onlyLinux.jobs, {}).some(j => j.id === 'ready-high'), 'another worker does not get an assigned test');
Desk.assignJob(dir, 'ready-high', '', NOW);
check(!WC.jobView(Desk.load(dir).config, { id: 'ready-high', priority: 0.9 }).assign, 'clearing assignment lets any eligible worker take it');

const sub = Desk.submit(dir, 'order3', 8000);
check(sub.id === 'desk-order3-g8000' && fs.existsSync(path.join(dir, 'jobs', sub.id + '.json')), 'submit writes a real one-growth job');
const built = JSON.parse(fs.readFileSync(path.join(dir, 'jobs', sub.id + '.json'), 'utf8'));
check(built.runs.length === 1 && built.runs[0].script === 'run/r42.js' && built.runs[0].args[0] === 'deepURSx3' && built.runs[0].args[3].includes('P.granN=32000'), 'submitted job is r42 on the v47 pins');
check(WC.selectJobs(Desk.load(dir).config, 'linux-pc', 'linux', Desk.load(dir).jobs, { exists: () => true }).some(j => j.id === sub.id), 'submitted job is claimable by linux-pc');
let dup = false;
try { Desk.submit(dir, 'order3', 8000); } catch (e) { dup = /already/.test(e.message); }
check(dup, 'the same growth is not queued twice');
let bad = false;
try { TM.buildTemplate('rm-rf', 1); } catch (e) { bad = /Unknown test/.test(e.message); }
check(bad, 'unknown templates are refused');
check(TM.SCRIPTS.size === 2 && ![...TM.SCRIPTS].some(s => s.includes('shell')), 'only the two existing runners can be submitted');

let parked = false;
try { Desk.setBlock(dir, 'file-parked', false, NOW); } catch (e) { parked = /does not rewrite/.test(e.message); }
check(parked && JSON.parse(fs.readFileSync(path.join(dir, 'jobs/file-parked.json'), 'utf8')).kind === 'blocked', 'unblocking does not rewrite a parked test file');
write(dir, 'claims/ready-high.json', { id: 'ready-high', worker: 'linux-pc', until: new Date(NOW + 1000).toISOString() });
let hold = false;
try { Desk.setBlock(dir, 'ready-high', true, NOW); } catch (e) { hold = /already running/.test(e.message); }
check(hold, 'holding a live test is refused');
fs.unlinkSync(path.join(dir, 'claims/ready-high.json'));
Desk.setBlock(dir, 'ready-high', true, NOW);
check(WC.jobView(Desk.load(dir).config, { id: 'ready-high', priority: 0.9, kind: 'runs' }) == null, 'hold uses the existing block flag');
Desk.setBlock(dir, 'ready-high', false, NOW);
check(WC.jobView(Desk.load(dir).config, { id: 'ready-high', priority: 0.9, kind: 'runs' }), 'allow clears the block');

write(dir, 'workers/linux-pc.json', worker('linux-pc', 'running', 'ready-high', new Date(NOW - 30 * 1000).toISOString()));
const cfgPauseBusy = Desk.load(dir).config;
cfgPauseBusy.workers['linux-pc'].mode = 'pause';
write(dir, 'worker-config.json', cfgPauseBusy);
const both = Desk.view(dir, NOW).workers.find(w => w.name === 'linux-pc');
check(both.activity === 'busy' && /still running/.test(both.pauseNote), 'pause plus a fresh running heartbeat stays busy and says the run was not stopped');

check(Desk.LIVE_RE.test('https://github.com/TravisA9/bugbrain-neurons.git'), 'live repo is recognized');
check(Desk.LIVE_RE.test('https://x-access-token:secret@github.com/TravisA9/bugbrain-neurons.git'), 'token URL is still the live repo');
check(!Desk.LIVE_RE.test('https://github.com/other/bugbrain-neurons.git'), 'a fork is not the live repo');
let refused = '';
try { Desk.assertCanPublish('https://x-access-token:secret@github.com/TravisA9/bugbrain-neurons.git', {}); } catch (e) { refused = e.message; }
check(/live BugBrain queue/.test(refused) && !/secret/.test(refused), 'publish refuses the live queue and does not echo the token');
check((() => { Desk.assertCanPublish('https://example.test/queue.git', {}); return true; })(), 'a non-live remote is allowed');

const html = fs.readFileSync(path.join(ROOT, 'console/index.html'), 'utf8');
check(html.includes('cannot run them') && html.includes('neither can a phone'), 'the page says a browser and a phone cannot run tests');
check(html.includes('Heartbeat connected') && html.includes('Heartbeat offline'), 'the page shows connected and offline heartbeats');
check(/Turn worker on/.test(html) && /Turn worker off/.test(html) && /Pause new work/.test(html), 'on, off, and pause are separate controls');
check(!html.includes('innerHTML'), 'job text is not written with innerHTML');

const why = state.whyIdle.join(' ');
check(/idle/.test(why) && /parked|held/.test(why), 'idle explanation names parked work when a computer is connected and idle');

const cp = require('child_process');
function g(cwd, args) { return cp.execFileSync('git', ['-c', 'user.name=bugbrain-desk', '-c', 'user.email=bugbrain-desk@users.noreply.github.com'].concat(args), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
const bare = tmp() + '.git';
cp.execFileSync('git', ['init', '-q', '--bare', bare]);
const clone = tmp();
cp.execFileSync('git', ['init', '-q', clone]);
g(clone, ['checkout', '-q', '-B', 'queue']);
fs.mkdirSync(path.join(clone, 'jobs'), { recursive: true });
fs.writeFileSync(path.join(clone, 'worker-config.json'), '{}\n');
fs.writeFileSync(path.join(clone, 'jobs/keep.json'), JSON.stringify({ id: 'keep', title: 'Keep', kind: 'runs', priority: 0.2, runs: [{}] }) + '\n');
g(clone, ['add', 'worker-config.json', 'jobs']);
g(clone, ['commit', '-q', '-m', 'init']);
g(clone, ['remote', 'add', 'origin', bare]);
g(clone, ['push', '-q', 'origin', 'HEAD:queue']);
Desk.setPriority(clone, 'keep', 1, NOW);
const sent = Desk.publish(clone, {});
check(sent.pushed, 'publish sends a local queue branch');
const remotePri = cp.execFileSync('git', ['--git-dir', bare, 'show', 'queue:worker-config.json'], { encoding: 'utf8' });
check(/"priority": 1/.test(remotePri), 'the pushed config has the new priority');
g(clone, ['checkout', '-q', '-B', 'not-queue']);
let wrongBranch = false;
try { Desk.publish(clone, {}); } catch (e) { wrongBranch = /not the queue branch/.test(e.message); }
check(wrongBranch, 'publish refuses a folder that is not on the queue branch');
const jobStill = cp.execFileSync('git', ['--git-dir', bare, 'show', 'queue:jobs/keep.json'], { encoding: 'utf8' });
check(/"id":\s*"keep"/.test(jobStill), 'publish does not remove the job file');

console.log(n + ' checks');
if (process.exitCode) process.exit(process.exitCode);
