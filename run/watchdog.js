'use strict';
/* run/watchdog.js: makes sure something brings this computer's worker back if it dies, on every start of the
 * supervisor, so computers installed before this file get it through the normal code update (no new setup needed).
 *
 * Why (TacoBell, 2026-11-09 22:51): the "ComputeLab Worker" task ran powershell.exe with -WindowStyle Hidden, but
 * Windows 11 hands new consoles to Windows Terminal when it is the default terminal, so the worker sat in a Terminal
 * window. Closing that window sent CTRL_CLOSE to every process on the console: powershell (exit 0xC000013A), the
 * supervisor, coord.js and its jobs all died at once, and the task had only a logon trigger, so nothing restarted it.
 *
 *  Windows  : the task's action becomes  conhost.exe --headless powershell.exe ...  (a console no window or Terminal can
 *             own), and the task gets a trigger that repeats every 3 minutes. MultipleInstances=IgnoreNew makes that a
 *             watchdog: while the worker runs the trigger does nothing; when it is gone the task starts it again.
 *  systemd  : a user timer (computelab-watchdog.timer) starts computelab.service every 3 minutes (a no-op while it
 *             runs) and the service never gives up restarting (StartLimitIntervalSec=0).
 *  cron     : a "* /3" crontab line runs the launcher, which exits at once when a worker is already running.
 *  launchd  : KeepAlive already restarts it.
 * Off is a setting the running worker honours (it claims nothing), so the watchdog never needs to ask the server:
 * a computer the user turned off keeps a sleeping worker, and turning it back on takes effect at the next check-in.
 * The result is written to ~/.bugbrain/watchdog.json and sent with each heartbeat, so the web page can tell an old
 * install with no watchdog ("re-run setup") from one that will come back by itself. */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const INTERVAL_MIN = 3;

function stateDir() { return process.env.BB_STATE_DIR || path.join(os.homedir(), '.bugbrain'); }
function write(st, rep) { try { fs.writeFileSync(path.join(st, 'watchdog.json'), JSON.stringify(Object.assign({ at: new Date().toISOString() }, rep)) + '\n'); } catch (e) {} return rep; }
function read(st) { try { return JSON.parse(fs.readFileSync(path.join(st || stateDir(), 'watchdog.json'), 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return null; } }
/* A probe that throws (PowerShell ETIMEDOUT under load, Access denied, and so on) did not learn whether
 * the watchdog is present. Keep the last successful result so a later heartbeat does not tell the site
 * this computer has no watchdog (TacoBell, 2026-11-10: the 3-minute task was already set up; a 60 s
 * Get-ScheduledTask timed out after a supervisor restart and overwrote watchdog.json with kind none). */
function keepPrevious(st, why) {
  const prev = read(st);
  if (prev && prev.ok && prev.kind && prev.kind !== 'none') {
    return { ok: true, kind: prev.kind, task: prev.task || '', headless: !!prev.headless, changed: '', why: why, kept: true };
  }
  return { ok: false, kind: 'none', why: why };
}

/* PowerShell run by ensureWindows. Prints one JSON line. Only touches the Compute Lab task of this user. */
function windowsScript(ps1) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ps1 = '" + ps1.replace(/'/g, "''") + "'",
    "$t = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.State -ne 'Disabled' -and ($_.TaskName -eq 'ComputeLab Worker' -or $_.TaskName -eq 'ComputeLabWorker' -or ((@($_.Actions) | ForEach-Object { \"$($_.Execute) $($_.Arguments)\" }) -join ' ') -match 'computelab-worker\\.ps1') }) | Select-Object -First 1",
    "if (-not $t) { @{ ok = $false; kind = 'none'; why = 'no enabled Compute Lab task' } | ConvertTo-Json -Compress; exit 0 }",
    "$a = @($t.Actions)[0]",
    "$headless = ($a.Execute -match 'conhost') -and ($a.Arguments -match '--headless')",
    "$rep = @($t.Triggers | Where-Object { $_.Repetition -and $_.Repetition.Interval })",
    "$changed = @()",
    "$build = [Environment]::OSVersion.Version.Build",
    "if (-not $headless -and $build -ge 18362) { $t.Actions = @(New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"' + $ps1 + '\"')); $changed += 'headless'; $headless = $true }",
    "if ($rep.Count -eq 0) { $tr = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(2)) -RepetitionInterval (New-TimeSpan -Minutes " + INTERVAL_MIN + "); $t.Triggers = @($t.Triggers) + @($tr); $changed += 'repeat' }",
    "if ([string]$t.Settings.MultipleInstances -ne 'IgnoreNew') { $t.Settings.MultipleInstances = 'IgnoreNew'; $changed += 'ignorenew' }",
    "if ($changed.Count -gt 0) { Set-ScheduledTask -InputObject $t | Out-Null }",
    "@{ ok = $true; kind = 'task-repeat'; task = $t.TaskName; headless = $headless; changed = ($changed -join ',') } | ConvertTo-Json -Compress",
  ].join('\n');
}

function ensureWindows(st, run) {
  const ps1 = path.join(st, 'computelab-worker.ps1');
  const out = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', windowsScript(ps1)]);
  const line = String(out || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}';
  const r = JSON.parse(line);
  return { ok: !!r.ok, kind: r.ok ? 'task-repeat' : 'none', task: r.task || '', headless: !!r.headless, changed: r.changed || '', why: r.why || '' };
}

function systemdUnits(st) {
  return {
    service: '[Unit]\nDescription=Compute Lab watchdog: start the worker if it is not running\n[Service]\nType=oneshot\nExecStart=/bin/sh -c \'systemctl --user is-enabled --quiet computelab.service && systemctl --user start computelab.service\'\n',
    timer: '[Unit]\nDescription=Compute Lab watchdog every ' + INTERVAL_MIN + ' minutes\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=' + INTERVAL_MIN + 'min\nAccuracySec=30s\n[Install]\nWantedBy=timers.target\n',
    dropin: '[Unit]\nStartLimitIntervalSec=0\n[Service]\nRestart=always\nRestartSec=30\n',
  };
}

function ensureSystemd(st, run, home) {
  const dir = path.join(home, '.config', 'systemd', 'user');
  if (!fs.existsSync(path.join(dir, 'computelab.service'))) return { ok: false, kind: 'none', why: 'no computelab.service' };
  const u = systemdUnits(st);
  let changed = false;
  const put = (f, body) => { let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {} if (old !== body) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); changed = true; } };
  put(path.join(dir, 'computelab-watchdog.service'), u.service);
  put(path.join(dir, 'computelab-watchdog.timer'), u.timer);
  put(path.join(dir, 'computelab.service.d', 'watchdog.conf'), u.dropin);
  if (changed) run('systemctl', ['--user', 'daemon-reload']);
  run('systemctl', ['--user', 'enable', '--now', 'computelab-watchdog.timer']);
  return { ok: true, kind: 'systemd-timer', changed: changed ? 'units' : '' };
}

function cronLine(st) { return '*/' + INTERVAL_MIN + ' * * * * BB_INSTALL=cron /bin/sh ' + path.join(st, 'computelab-worker.sh') + ' >/dev/null 2>&1 # computelab-watchdog'; }

function ensureCron(st, run) {
  if (!fs.existsSync(path.join(st, 'computelab-worker.sh'))) return { ok: false, kind: 'none', why: 'no computelab-worker.sh' };
  let tab = '';
  try { tab = run('crontab', ['-l']) || ''; } catch (e) { tab = ''; }
  if (tab.indexOf('# computelab-watchdog') >= 0) return { ok: true, kind: 'cron', changed: '' };
  const next = tab.replace(/\s*$/, '') + (tab.trim() ? '\n' : '') + cronLine(st) + '\n';
  run('crontab', ['-'], next);
  return { ok: true, kind: 'cron', changed: 'crontab' };
}

/* The stop script must stop the watchdog too, or a deliberate stop comes back in 3 minutes. It only kills a pid
 * whose command line is the Compute Lab launcher (run/worker.sh), never the old GitHub-token worker that shares
 * worker.pid. STOP_MARK lets ensure() replace stop scripts written before this version. */
const STOP_MARK = '# computelab-stop v2';
function unixStopScript() {
  return '#!/bin/sh\n' + STOP_MARK + '\n'
    + 'if command -v systemctl >/dev/null 2>&1; then systemctl --user stop computelab-watchdog.timer computelab.service >/dev/null 2>&1; fi\n'
    + 'launchctl bootout "gui/$(id -u)/info.computelab.worker" >/dev/null 2>&1\n'
    + '(crontab -l 2>/dev/null | grep -v "# computelab-watchdog") | crontab - 2>/dev/null\n'
    + 'for f in "$HOME/.bugbrain/computelab.pid" "$HOME/.bugbrain/worker.pid"; do p=$(cat "$f" 2>/dev/null); [ -n "$p" ] || continue; if [ ! -r "/proc/$p/cmdline" ] || tr \'\\0\' \' \' < "/proc/$p/cmdline" | grep -q run/worker.sh; then kill "$p" 2>/dev/null; fi; done\n'
    + 'pkill -u "$(id -u)" -f \'run/supervisor.js\' >/dev/null 2>&1\n'
    + 'rm -f "$HOME/.bugbrain/computelab.pid"\n'
    + 'echo "Compute Lab worker stopped. It starts again at the next login or after setup; run uninstall-computelab.sh to remove it."\n';
}

function ensure(opts) {
  opts = opts || {};
  const st = opts.stateDir || stateDir(), home = opts.home || os.homedir(), platform = opts.platform || process.platform;
  const install = opts.install != null ? opts.install : (process.env.BB_INSTALL || '');
  const run = opts.run || ((cmd, args, input) => cp.execFileSync(cmd, args, { encoding: 'utf8', input: input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 120000 }));
  if (!process.env.BB_COORDINATOR_URL && !opts.force) return write(st, { ok: false, kind: 'none', why: 'not a Compute Lab worker' });
  let rep;
  try {
    if (platform === 'win32') rep = ensureWindows(st, run);
    else if (install === 'systemd') rep = ensureSystemd(st, run, home);
    else if (install === 'launchd') rep = { ok: true, kind: 'launchd', changed: '' };
    else if (install === 'cron' || install === 'setup' || install === '') rep = ensureCron(st, run);
    else rep = { ok: false, kind: 'none', why: 'install method ' + install };
    if (platform !== 'win32') {
      const stop = path.join(st, 'stop-computelab.sh');
      try { if (fs.existsSync(stop) && fs.readFileSync(stop, 'utf8').indexOf(STOP_MARK) < 0) fs.writeFileSync(stop, unixStopScript(), { mode: 0o700 }); } catch (e) {}
    }
  } catch (e) {
    rep = keepPrevious(st, String((e && (e.stderr || e.message)) || e).trim().split('\n').pop().slice(0, 160));
  }
  const hrun = opts.healthRun || ((cmd, args) => cp.execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 15000 }));
  try { rep.health = health({ st, home, platform, run: hrun, install }); } catch (e) { rep.health = { error: String((e && e.message) || e).slice(0, 160) }; }
  return write(st, rep);
}

/* ---- Phase 0 health facts, sent with the heartbeat runtime and the startup diagnostics (owner console) ----------
 * linger   Linux: true when systemd keeps this user's services running without a login (needed to start at boot and
 *          survive logout). Only checked and reported: enabling it may need an admin password, so the worker never
 *          tries (it could pop up a password dialog on the user's screen).
 * maySleep true when the computer is set to suspend itself when idle (GNOME on AC power, or the Windows AC sleep
 *          timer), so a quiet computer can be told apart from a broken one. null when unknown.
 * legacy   Linux: the old GitHub-token worker unit (bugbrain-worker.service). One that is not running (failed, or
 *          stuck restarting because it shares worker.pid) is disabled and its unit file moved to ~/.bugbrain; one that
 *          is running is left alone and only reported. */
function lingerState(run, user) {
  const u = user || (() => { try { return os.userInfo().username; } catch (e) { return ''; } })();
  if (u) { try { if (fs.existsSync('/var/lib/systemd/linger/' + u)) return true; } catch (e) {} }
  try { const out = String(run('loginctl', ['show-user', u || String(process.getuid()), '--property=Linger']) || ''); const m = /Linger=(yes|no)/.exec(out); if (m) return m[1] === 'yes'; } catch (e) {}
  return u && fs.existsSync('/var/lib/systemd/linger') ? false : null;
}
function maySleepLinux(run) {
  try {
    const type = String(run('gsettings', ['get', 'org.gnome.settings-daemon.plugins.power', 'sleep-inactive-ac-type']) || '').trim().replace(/'/g, '');
    if (!type) return null;
    if (type === 'nothing' || type === 'blank' || type === 'logout') return false;
    const t = +String(run('gsettings', ['get', 'org.gnome.settings-daemon.plugins.power', 'sleep-inactive-ac-timeout']) || '').trim().replace(/^uint32\s+/, '');
    return !(t === 0);
  } catch (e) { return null; }
}
/* powercfg prints the AC index, then the DC index, as the last two hex values (the labels are localised). */
function maySleepWindows(run) {
  try {
    const out = String(run('powercfg.exe', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE']) || '');
    const hex = out.match(/0x[0-9a-fA-F]{8}/g) || [];
    if (hex.length < 2) return null;
    return parseInt(hex[hex.length - 2], 16) > 0;
  } catch (e) { return null; }
}
const LEGACY_UNIT = 'bugbrain-worker.service';
function isLegacyUnit(text) {
  const t = String(text || '');
  return /Description=BugBrain always-on worker/.test(t) && /ExecStart=\/bin\/sh %h\/\.bugbrain\/worker\.sh/.test(t) && !/BB_COORDINATOR_URL|computelab/i.test(t);
}
function legacyCleanup(st, run, home) {
  const unit = path.join(home, '.config', 'systemd', 'user', LEGACY_UNIT);
  let text;
  try { text = fs.readFileSync(unit, 'utf8'); } catch (e) { return { present: false }; }
  if (!isLegacyUnit(text)) return { present: true, legacy: false, action: 'kept (not the old GitHub-token worker)' };
  let active = '';
  try { active = String(run('systemctl', ['--user', 'is-active', LEGACY_UNIT]) || '').trim(); } catch (e) { active = String((e && e.stdout) || '').trim() || 'unknown'; }
  if (active === 'active') return { present: true, legacy: true, active: active, action: 'kept (it is running; remove it by hand if it is not wanted)' };
  if (active === 'unknown' || active === '') return { present: true, legacy: true, active: active, action: 'kept (could not read its state)' };
  try { run('systemctl', ['--user', 'disable', '--now', LEGACY_UNIT]); } catch (e) {}
  const bak = path.join(st, 'legacy-' + LEGACY_UNIT + '.bak');
  try { fs.renameSync(unit, bak); } catch (e) { try { fs.copyFileSync(unit, bak); fs.unlinkSync(unit); } catch (e2) { return { present: true, legacy: true, active: active, action: 'disabled; could not move the unit file: ' + e2.message }; } }
  try { run('systemctl', ['--user', 'daemon-reload']); } catch (e) {}
  return { present: false, legacy: true, active: active, action: 'disabled and moved to ' + bak };
}
function health(o) {
  const h = { at: new Date().toISOString() };
  if (o.platform === 'win32') { h.maySleep = maySleepWindows(o.run); return h; }
  if (o.platform === 'linux') {
    h.linger = lingerState(o.run);
    h.maySleep = maySleepLinux(o.run);
    if (o.install === 'systemd' || fs.existsSync(path.join(o.home, '.config', 'systemd', 'user', LEGACY_UNIT))) h.legacy = legacyCleanup(o.st, o.run, o.home);
  }
  return h;
}
/* Compact health for the heartbeat runtime (the coordinator ignores fields it does not know). */
function healthSummary(st) {
  const r = read(st), h = r && r.health;
  if (!h) return null;
  const out = {};
  if (h.linger != null) out.linger = !!h.linger;
  if (h.maySleep != null) out.maySleep = !!h.maySleep;
  if (h.legacy && h.legacy.legacy) out.legacyWorker = String(h.legacy.action || '').slice(0, 80);
  return out;
}

/* The value coord.js sends with its heartbeat: the watchdog kind, or 'none'. */
function kind(st) { const r = read(st); return r && r.ok ? String(r.kind || 'none') : 'none'; }

module.exports = { ensure, read, kind, health, healthSummary, isLegacyUnit, legacyCleanup, lingerState, maySleepLinux, maySleepWindows, windowsScript, systemdUnits, cronLine, unixStopScript, STOP_MARK, INTERVAL_MIN };
