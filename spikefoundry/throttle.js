'use strict';
/* Duty cycle for a SpikeFoundry job. The worker (run/coord.js) writes {"duty": 0.4} to the
 * file named by SF_THROTTLE_FILE and may change it while the job runs. pace() is called
 * between evaluations: after about 100 ms of work it sleeps long enough that work is
 * roughly `duty` of wall time. With no file, or duty 1, it never sleeps. */
const fs = require('fs');
let file = process.env.SF_THROTTLE_FILE || '';
let duty = 1;
let readAt = 0;
let busyFrom = Date.now();
const cell = typeof SharedArrayBuffer !== 'undefined' ? new Int32Array(new SharedArrayBuffer(4)) : null;

function sleepSync(ms) {
  if (!(ms > 0)) return;
  if (cell) { Atomics.wait(cell, 0, 0, ms); return; }
  const end = Date.now() + ms;
  while (Date.now() < end) { /* no SharedArrayBuffer: busy wait is the only option */ }
}
function readDuty(now) {
  if (!file) return 1;
  if (now - readAt < 2000) return duty;
  readAt = now;
  try {
    const d = +JSON.parse(fs.readFileSync(file, 'utf8')).duty;
    duty = d > 0.01 && d <= 1 ? d : 1;
  } catch (e) { /* keep the last value */ }
  return duty;
}
function pace() {
  const now = Date.now();
  const d = readDuty(now);
  if (d >= 0.999) { busyFrom = now; return 0; }
  const busy = now - busyFrom;
  if (busy < 100) return 0;
  const rest = Math.min(5000, Math.round(busy * (1 - d) / d));
  sleepSync(rest);
  busyFrom = Date.now();
  return rest;
}
function useFile(f) { file = f || ''; readAt = 0; duty = 1; busyFrom = Date.now(); }
module.exports = { pace, sleepSync, useFile, readDuty };
