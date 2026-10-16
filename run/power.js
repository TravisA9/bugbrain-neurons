'use strict';
/* run/power.js (R48): phone/tablet power guard for --phone mode (Termux on Android).
 * Pause when battery < BB_PHONE_MIN_PCT (30), not charging, or battery temperature >= BB_PHONE_MAX_C (42 C).
 * Resume with hysteresis: battery >= min+5 and temperature <= max-4 (and charging).
 * Source: termux-battery-status (Termux:API app + `pkg install termux-api`), else /sys/class/power_supply/*.
 * If neither works the guard reports "unknown" and does not pause (warned once).
 * Testing: BB_POWER_JSON=<file> with {"percentage":50,"status":"CHARGING","temperature":35} overrides the source. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const MIN = +(process.env.BB_PHONE_MIN_PCT || 30), MAXC = +(process.env.BB_PHONE_MAX_C || 42);
function fromTermux() {
  try { const o = cp.execFileSync('termux-battery-status', [], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] });
    const j = JSON.parse(o); if (j && j.percentage != null) return { pct: +j.percentage, charging: /CHARGING|FULL/i.test(String(j.status)) && !/DISCHARGING|NOT_CHARGING/i.test(String(j.status)) || (j.plugged && j.plugged !== 'UNPLUGGED' && !/DISCHARGING/i.test(String(j.status))), tempC: j.temperature != null ? +j.temperature : null, src: 'termux-api' }; } catch (e) {}
  return null;
}
function fromSys() {
  const base = '/sys/class/power_supply'; let dirs = []; try { dirs = fs.readdirSync(base); } catch (e) { return null; }
  const r = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { return null; } };
  let bat = null, ac = false;
  for (const d of dirs) { const p = path.join(base, d), type = r(path.join(p, 'type'));
    if (type === 'Battery' && !bat) bat = p; else if (type && type !== 'Battery' && r(path.join(p, 'online')) === '1') ac = true; }
  if (!bat) return null;
  const cap = r(path.join(bat, 'capacity')), status = r(path.join(bat, 'status')) || '', t = r(path.join(bat, 'temp'));
  if (cap == null) return null;
  return { pct: +cap, charging: /Charging|Full/i.test(status) && !/Discharging|Not charging/i.test(status) || ac, tempC: t != null ? +t / 10 : null, src: 'sysfs' };
}
function read() {
  if (process.env.BB_POWER_JSON) { try { const j = JSON.parse(fs.readFileSync(process.env.BB_POWER_JSON, 'utf8')); return { pct: +j.percentage, charging: /CHARGING|FULL/i.test(j.status) && !/DISCHARGING|NOT_CHARGING/i.test(j.status), tempC: j.temperature != null ? +j.temperature : null, src: 'file' }; } catch (e) { return null; } }
  return fromTermux() || fromSys();
}
let pausedNow = false, lastT = 0, last = { pause: false, why: '' }, warned = false;
function check(force) {   // -> { pause, why, info }; cached for 60 s
  if (!force && Date.now() - lastT < 60000) return last; lastT = Date.now();
  const b = read();
  if (!b) { if (!warned) { console.log('[power] battery status unavailable (install Termux:API app + `pkg install termux-api`); not pausing on power'); warned = true; } return (last = { pause: false, why: 'power unknown', info: null }); }
  const why = [];
  const lowPct = pausedNow ? b.pct < MIN + 5 : b.pct < MIN, hot = b.tempC != null && (pausedNow ? b.tempC > MAXC - 4 : b.tempC >= MAXC);
  if (!b.charging) why.push('not charging'); if (lowPct) why.push(`battery ${b.pct}%`); if (hot) why.push(`battery ${b.tempC.toFixed(1)} C`);
  pausedNow = why.length > 0;
  return (last = { pause: pausedNow, why: why.join(', '), info: b });
}
module.exports = { check, read };
if (require.main === module) console.log(JSON.stringify(Object.assign(check(true), { min: MIN, maxC: MAXC })));
