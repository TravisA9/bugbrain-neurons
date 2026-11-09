'use strict';
/* On/off for the worker that is installed on THIS computer.
 * Windows matches start_worker.bat / stop_worker.bat: scheduled task BugBrainWorker.
 * Linux matches the systemd user service from run/install-linux.sh.
 * Probe results are the only running/enabled facts. A failed probe is "unknown", not "on". */
const cp = require('child_process');
const TASK = 'BugBrainWorker';
const UNIT = 'bugbrain-worker.service';

function commands(platform, action) {
  if (action !== 'on' && action !== 'off') return null;
  if (platform === 'win32') {
    if (action === 'on') return [
      ['schtasks', ['/Change', '/TN', TASK, '/Enable']],
      ['schtasks', ['/Run', '/TN', TASK]],
    ];
    return [
      ['schtasks', ['/End', '/TN', TASK]],
      ['schtasks', ['/Change', '/TN', TASK, '/Disable']],
    ];
  }
  if (platform === 'linux') {
    if (action === 'on') return [['systemctl', ['--user', 'enable', '--now', UNIT]]];
    return [['systemctl', ['--user', 'disable', '--now', UNIT]]];
  }
  return null;
}

function parseWindowsQuery(text, code) {
  const s = String(text || '');
  if (code && /cannot find the file|does not exist|ERROR:/i.test(s)) return { installed: false, enabled: false, running: false, detail: 'BugBrainWorker is not installed on this computer.' };
  const state = /Scheduled Task State:\s*(\S+)/i.exec(s);
  const status = /^Status:\s*(\S+)/im.exec(s);
  if (!state && !status) return { installed: false, enabled: null, running: null, detail: 'Could not read the BugBrainWorker task.', unknown: true };
  const enabled = state ? /^enabled$/i.test(state[1]) : null;
  const running = status ? /^running$/i.test(status[1]) : false;
  let detail = 'The scheduled task is ' + (enabled ? 'enabled' : 'disabled') + (running ? ' and the task is running.' : ' and the task is not running.');
  return { installed: true, enabled: !!enabled, running: !!running, detail };
}

function parseLinux(enabledText, enabledCode, activeText) {
  const e = String(enabledText || '').trim(), a = String(activeText || '').trim();
  const blob = e + '\n' + a;
  if (/not-found|could not be found|Failed to get unit|not been loaded/i.test(blob) || (enabledCode && /No such file/i.test(blob))) {
    return { installed: false, enabled: false, running: false, detail: 'The bugbrain-worker service is not installed on this computer.' };
  }
  if (!e && !a) return { installed: false, enabled: null, running: null, detail: 'Could not read the bugbrain-worker service.', unknown: true };
  const enabled = e === 'enabled';
  const running = a === 'active';
  const failed = a === 'failed';
  let detail = (enabled ? 'The service is enabled' : 'The service is not enabled') + (running ? ' and running.' : failed ? ' and the last start failed.' : ' and not running.');
  return { installed: true, enabled, running, failed, detail };
}

function defaultExec(cmd, args) {
  try {
    const out = cp.execFileSync(cmd, args, { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + '\n' + (e.stderr || e.message || '')) };
  }
}

function probe(platform, exec) {
  exec = exec || defaultExec;
  platform = platform || process.platform;
  if (platform === 'win32') {
    const q = exec('schtasks', ['/Query', '/TN', TASK, '/FO', 'LIST', '/V']);
    return Object.assign({ platform, task: TASK }, parseWindowsQuery(q.out, q.code));
  }
  if (platform === 'linux') {
    const en = exec('systemctl', ['--user', 'is-enabled', UNIT]);
    const ac = exec('systemctl', ['--user', 'is-active', UNIT]);
    return Object.assign({ platform, task: UNIT }, parseLinux(en.out, en.code, ac.out));
  }
  return { platform, installed: false, enabled: null, running: null, detail: 'This computer is not Windows or Linux, so the desk cannot start a worker here. You can still look at the queue.' };
}

function apply(action, opt) {
  opt = opt || {};
  const platform = opt.platform || process.platform;
  const plan = commands(platform, action);
  if (!plan) return { ok: false, applied: false, error: 'This computer cannot start or stop a BugBrain worker from here.' };
  if (!opt.live) return { ok: true, applied: false, preview: true, plan, error: 'Live control is off, so nothing was started or stopped.' };
  const exec = opt.exec || defaultExec;
  const steps = [];
  for (let i = 0; i < plan.length; i++) {
    const [cmd, args] = plan[i];
    const endIsOptional = action === 'off' && platform === 'win32' && args[0] === '/End';
    const r = exec(cmd, args);
    steps.push({ cmd, args, code: r.code });
    if (r.code && !endIsOptional) {
      return { ok: false, applied: false, steps, error: 'Could not ' + (action === 'on' ? 'start' : 'stop') + ' the worker. ' + String(r.out || '').trim().split('\n').slice(-2).join(' ') };
    }
  }
  return { ok: true, applied: true, steps };
}

module.exports = { TASK, UNIT, commands, parseWindowsQuery, parseLinux, probe, apply };
