'use strict';
/* run/engine.js (v25, round 26): loads the browser engine (js/core + js/envs) into this thread's global scope.
 * Unlike js/node_load.js (a separate vm context, used by the tests) the code runs in the thread's own context, which is
 * several times faster in Node (global look-ups inside a vm context are slow). Each worker thread has its own globals.
 * Works in Node >= 18 and Bun. Paths are built with path.join (Windows-safe). */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const FILES = require(path.join(ROOT, 'js', 'node_load.js')).FILES;
let SA = null;
function loadEngine() {
  if (SA) return SA;
  for (const f of FILES) {
    const p = path.join(ROOT, 'js', ...f.split('/'));
    if (!fs.existsSync(p)) continue;
    vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
  }
  SA = globalThis.SpikingArena;
  return SA;
}
// code version: APP_VERSION + a short hash of every engine / runner file
function codeVersion() {
  const S = loadEngine(), files = {};
  const list = FILES.map(f => path.join('js', ...f.split('/'))).concat(fs.readdirSync(__dirname).filter(f => f.endsWith('.js')).map(f => path.join('run', f)));
  for (const rel of list) { const p = path.join(ROOT, rel); if (fs.existsSync(p)) files[rel.split(path.sep).join('/')] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12); }
  const all = crypto.createHash('sha1').update(JSON.stringify(files)).digest('hex').slice(0, 12);
  return { appVersion: S.APP_VERSION, defaultsVersion: S.DEFAULTS_VERSION, hash: all, files };
}
const runtime = () => (typeof Bun !== 'undefined' ? 'bun ' + Bun.version : 'node ' + process.versions.node);
module.exports = { ROOT, loadEngine, codeVersion, runtime };
