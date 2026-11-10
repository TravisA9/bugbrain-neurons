'use strict';
/* node run/watchdog_test.js: the watchdog that brings a dead worker back, the stale stop file, and the launcher loop.
 * Cause covered (TacoBell 2026-11-09 22:51): the worker ran in a Windows Terminal window; closing it killed everything
 * (0xC000013A) and the logon-only task never restarted it. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const W = require('./watchdog.js'), C = require('./coord.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', n, m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));

/* Windows: headless console host, a repeating trigger, IgnoreNew, and only when something is missing. */
const ps = W.windowsScript('C:\\Users\\X\\.bugbrain\\computelab-worker.ps1');
ok(/New-ScheduledTaskAction -Execute 'conhost\.exe' -Argument \('--headless powershell\.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' \+ \$ps1/.test(ps), 'task action becomes conhost --headless powershell');
ok(/-RepetitionInterval \(New-TimeSpan -Minutes 3\)/.test(ps) && /\$t\.Triggers = @\(\$t\.Triggers\) \+ @\(\$tr\)/.test(ps), 'a 3-minute repeating trigger is added next to the logon trigger');
ok(/MultipleInstances = 'IgnoreNew'/.test(ps) && /if \(\$changed\.Count -gt 0\) \{ Set-ScheduledTask/.test(ps), 'IgnoreNew, and the task is only changed when something is missing');
ok(/\$build -ge 18362/.test(ps) && /State -ne 'Disabled'/.test(ps), 'headless only on Windows builds that have it; a task the user disabled is left alone');
ok(/C:\\Users\\X\\\.bugbrain\\computelab-worker\.ps1/.test(ps), 'the task runs this computer\'s computelab-worker.ps1');

{ const st = tmp(), calls = [];
  const r = W.ensure({ force: true, stateDir: st, platform: 'win32', run: (cmd, args) => { calls.push(cmd); return 'noise\r\n{"changed":"headless,repeat","ok":true,"task":"ComputeLab Worker","headless":true,"kind":"task-repeat"}\r\n'; } });
  ok(r.ok && r.kind === 'task-repeat' && r.changed === 'headless,repeat' && calls[0] === 'powershell.exe', 'Windows ensure reports the change');
  ok(W.kind(st) === 'task-repeat' && W.read(st).task === 'ComputeLab Worker', 'the result is saved to watchdog.json for the heartbeat');
  const bad = W.ensure({ force: true, stateDir: st, platform: 'win32', run: () => { const e = new Error('Access is denied.'); throw e; } });
  ok(bad.ok && bad.kept && W.kind(st) === 'task-repeat' && /denied/.test(bad.why), 'a probe that throws after a successful setup keeps the last good watchdog');
}
{ const st = tmp();
  const timed = W.ensure({ force: true, stateDir: st, platform: 'win32', run: () => { const e = new Error('spawnSync powershell.exe ETIMEDOUT'); e.code = 'ETIMEDOUT'; throw e; } });
  ok(!timed.ok && !timed.kept && W.kind(st) === 'none' && /ETIMEDOUT/.test(timed.why), 'a timed-out probe with no earlier success is still no watchdog');
}
{ const st = tmp();
  W.ensure({ force: true, stateDir: st, platform: 'win32', run: () => '{"ok":true,"task":"ComputeLab Worker","headless":true,"kind":"task-repeat"}' });
  const gone = W.ensure({ force: true, stateDir: st, platform: 'win32', run: () => '{"ok":false,"kind":"none","why":"no enabled Compute Lab task"}' });
  ok(!gone.ok && W.kind(st) === 'none' && /no enabled/.test(gone.why), 'a completed probe that finds no task reports none, even if an earlier run succeeded'); }

/* systemd: timer + oneshot + no start limit, written once. */
{ const st = tmp(), home = tmp(), calls = [];
  fs.mkdirSync(path.join(home, '.config/systemd/user'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config/systemd/user/computelab.service'), '[Service]\n');
  fs.writeFileSync(path.join(st, 'stop-computelab.sh'), '#!/bin/sh\nsystemctl --user stop computelab.service\n');
  const run = (cmd, args) => { calls.push(cmd + ' ' + args.join(' ')); return ''; };
  const r = W.ensure({ force: true, stateDir: st, home, platform: 'linux', install: 'systemd', run });
  const dir = path.join(home, '.config/systemd/user');
  ok(r.ok && r.kind === 'systemd-timer', 'systemd install gets a timer');
  ok(/OnUnitActiveSec=3min/.test(fs.readFileSync(path.join(dir, 'computelab-watchdog.timer'), 'utf8')) && /systemctl --user start computelab\.service/.test(fs.readFileSync(path.join(dir, 'computelab-watchdog.service'), 'utf8')), 'the timer starts computelab.service every 3 minutes');
  ok(/StartLimitIntervalSec=0/.test(fs.readFileSync(path.join(dir, 'computelab.service.d/watchdog.conf'), 'utf8')), 'systemd never gives up restarting');
  ok(calls.indexOf('systemctl --user daemon-reload') >= 0 && calls.indexOf('systemctl --user enable --now computelab-watchdog.timer') >= 0, 'units are reloaded and the timer enabled');
  ok(/computelab-watchdog\.timer/.test(fs.readFileSync(path.join(st, 'stop-computelab.sh'), 'utf8')), 'the stop script also stops the watchdog, so a deliberate stop stays stopped');
  calls.length = 0; W.ensure({ force: true, stateDir: st, home, platform: 'linux', install: 'systemd', run });
  ok(calls.indexOf('systemctl --user daemon-reload') < 0, 'second run changes nothing'); }

/* cron: an every-3-minutes line next to the @reboot line, once. */
{ const st = tmp(); let tab = '@reboot BB_INSTALL=cron /bin/sh ' + st + '/computelab-worker.sh >/dev/null 2>&1\n';
  fs.writeFileSync(path.join(st, 'computelab-worker.sh'), '#!/bin/sh\n');
  const run = (cmd, args, input) => { if (args[0] === '-l') return tab; tab = input; return ''; };
  W.ensure({ force: true, stateDir: st, platform: 'linux', install: 'cron', run });
  ok(tab.split('\n').filter(l => /^\*\/3 \* \* \* \* BB_INSTALL=cron \/bin\/sh .*computelab-worker\.sh .*# computelab-watchdog$/.test(l)).length === 1 && /^@reboot/.test(tab), 'cron install gets a 3-minute line, the @reboot line stays');
  W.ensure({ force: true, stateDir: st, platform: 'linux', install: 'cron', run });
  ok(tab.split('# computelab-watchdog').length === 2, 'the cron line is added only once'); }
ok(W.ensure({ force: true, stateDir: tmp(), platform: 'darwin', install: 'launchd', run: () => '' }).kind === 'launchd', 'launchd: KeepAlive already restarts it');
ok(W.ensure({ stateDir: tmp(), platform: 'linux', install: 'cron', run: () => { throw new Error('must not run'); } }).kind === 'none' || !!process.env.BB_COORDINATOR_URL, 'not a Compute Lab worker: nothing is touched');

/* coord.js: a stop file older than this process is stale and removed; a fresh one is a real request and stays. */
{ const d = tmp(), f = path.join(d, 'dq.stop'); fs.writeFileSync(f, 'new code\n'); const old = Date.now() / 1000 - 3600; fs.utimesSync(f, old, old);
  ok(C.clearStaleStop(f, Date.now()) && !fs.existsSync(f), 'a stale dq.stop from a dead worker is cleared at start');
  fs.writeFileSync(f, 'new code\n'); ok(!C.clearStaleStop(f, Date.now() - 60000) && fs.existsSync(f), 'a stop file written after start is kept'); }

/* Launchers: clear the stale stop file once they hold the lock, and relaunch on every exit. */
const ps1 = fs.readFileSync(path.join(__dirname, 'worker.ps1'), 'utf8');
ok(ps1.indexOf("Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $ST 'dq.stop')") > ps1.indexOf('$mutex.WaitOne(0)'), 'worker.ps1 clears dq.stop after taking the mutex');
ok(/try \{ & \$rt\.Source run\/supervisor\.js 2>&1 \| ToLog; \$code = \$LASTEXITCODE \}/.test(ps1) && /catch \{ \$code = -1/.test(ps1) && /while \(\$true\) \{/.test(ps1) && !/\n\s*(exit|break)\b[^\n]*\n[^\n]*supervisor exited/.test(ps1), 'worker.ps1 loops on every exit, errors included');
const inst = fs.readFileSync(path.join(__dirname, 'install-windows.ps1'), 'utf8');
ok(/'--headless powershell\.exe ' \+ \$psArgs/.test(inst) && /-RepetitionInterval \(New-TimeSpan -Minutes 3\)/.test(inst), 'new Windows installs get the headless action and the 3-minute trigger');

if (process.platform !== 'win32') {
  /* Run the real worker.sh against a local origin: supervisor exits 10, 10, then 7; the launcher keeps relaunching. */
  const d = tmp(), origin = path.join(d, 'origin.git'), work = path.join(d, 'src'), st = path.join(d, 'st'), home = path.join(d, 'checkout');
  fs.mkdirSync(st); const g = (cwd, ...a) => cp.execFileSync('git', a, { cwd, stdio: 'pipe' });
  g(d, 'init', '-q', '--bare', origin); fs.mkdirSync(path.join(work, 'run'), { recursive: true });
  fs.writeFileSync(path.join(work, 'run/supervisor.js'), "const fs=require('fs'),f=process.env.CNT;const n=(+(fs.existsSync(f)?fs.readFileSync(f,'utf8'):0))+1;fs.writeFileSync(f,String(n));process.exit(n<3?10:7);\n");
  g(work, 'init', '-q', '-b', 'b1'); g(work, 'add', '.'); g(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x'); g(work, 'push', '-q', origin, 'b1');
  fs.writeFileSync(path.join(st, 'dq.stop'), 'left by a dead worker\n');
  const env = Object.assign({}, process.env, { BB_STATE_DIR: st, BB_HOME: home, BB_CODE_BRANCH: 'b1', BB_REPO: origin, CNT: path.join(d, 'count') });
  const p = cp.spawn('/bin/sh', [path.join(__dirname, 'worker.sh')], { env, stdio: 'ignore', detached: true });
  const t0 = Date.now(); while (Date.now() - t0 < 20000 && !/supervisor exited \(7\)/.test(fs.existsSync(path.join(st, 'worker.log')) ? fs.readFileSync(path.join(st, 'worker.log'), 'utf8') : '')) cp.execFileSync('sleep', ['0.2']);
  try { process.kill(-p.pid, 'SIGKILL'); } catch (e) {}
  const log = fs.readFileSync(path.join(st, 'worker.log'), 'utf8');
  ok(fs.readFileSync(path.join(d, 'count'), 'utf8') === '3' && /supervisor exited \(7\) after \d+s; restart in 15s/.test(log), 'worker.sh relaunched after exit 10 twice and schedules a relaunch after a crash');
  ok(!fs.existsSync(path.join(st, 'dq.stop')), 'worker.sh removed the stale dq.stop before starting');
}
console.log('watchdog_test: ' + n + ' checks passed');
