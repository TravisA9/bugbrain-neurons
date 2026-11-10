'use strict';
/* run/diag.js: remote diagnostics for Compute Lab workers.
 * collect() describes this computer (OS, Node, cores, RAM, code commit, protocol hash, install method) and
 * post() sends a report to POST <coordinator>/api/v1/diagnostics with the worker token. Reports are rate-limited
 * (at most one per 60 s per kind, 30 per hour, kept in ~/.bugbrain/diag-stamps.json), size-capped, and scrubbed:
 * the token and anything that looks like a credential never leave this computer.
 * Written for old Node too (no fetch, no ?. or ??), so a too-old Node can still say that it is too old. */
var fs = require('fs'), path = require('path'), os = require('os');
var ROOT = path.resolve(__dirname, '..');
var STATE = process.env.BB_STATE_DIR || path.join(os.homedir(), '.bugbrain');
var ring = [];

function scrub(text, secret) {
  var s = String(text == null ? '' : text);
  if (secret) s = s.split(secret).join('[redacted]');
  s = s.replace(/(Bearer|Authorization:?|token[=:]|password[=:]|secret[=:])\s*[^\s"]+/gi, '$1 [redacted]');
  s = s.replace(/\b[A-Za-z0-9_\-]{32,}\b/g, function (m) { return (/^[a-f0-9]+$/i.test(m) && (m.length === 40 || m.length === 64)) ? m : '[redacted]'; });
  s = s.replace(/(github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, '$1[redacted]');
  return s;
}
/* Keep the last 50 console lines so a report can show what happened just before a failure. */
function capture() {
  if (capture.done) return; capture.done = true;
  ['log', 'error', 'warn'].forEach(function (k) {
    var orig = console[k];
    console[k] = function () {
      try { remember(Array.prototype.slice.call(arguments).map(String).join(' ')); } catch (e) {}
      return orig.apply(console, arguments);
    };
  });
}
function remember(line) { ring.push(String(line).slice(0, 300)); if (ring.length > 50) ring.shift(); }
function logTail() { return ring.slice(-50); }
function readFileTail(file, n) {
  try { var t = fs.readFileSync(file, 'utf8'); return t.split(/\r?\n/).filter(Boolean).slice(-(n || 50)); } catch (e) { return []; }
}
function distro() {
  try { var t = fs.readFileSync('/etc/os-release', 'utf8'); var m = /^PRETTY_NAME="?([^"\n]*)"?/m.exec(t); if (m) return m[1]; } catch (e) {}
  if (process.platform === 'darwin') return 'macOS (Darwin ' + os.release() + ')';
  if (process.platform === 'win32') return 'Windows ' + os.release();
  return '';
}
function gitHead() {
  try {
    var g = path.join(ROOT, '.git');
    if (fs.statSync(g).isFile()) { var gd = /gitdir:\s*(.+)/.exec(fs.readFileSync(g, 'utf8')); if (gd) g = path.resolve(ROOT, gd[1].trim()); }
    var head = fs.readFileSync(path.join(g, 'HEAD'), 'utf8').trim();
    if (/^[a-f0-9]{40}$/.test(head)) return head;
    var ref = head.replace(/^ref:\s*/, '');
    try { return fs.readFileSync(path.join(g, ref), 'utf8').trim(); } catch (e) {}
    var packed = fs.readFileSync(path.join(g, 'packed-refs'), 'utf8').split('\n');
    for (var i = 0; i < packed.length; i++) { var p = packed[i].split(' '); if (p[1] === ref) return p[0]; }
  } catch (e) {}
  return '';
}
function protocolHash() {
  try {
    var t = fs.readFileSync(path.join(ROOT, 'hosting', 'computelab', 'PROTOCOL.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return require('crypto').createHash('sha256').update(t).digest('hex');
  } catch (e) { return ''; }
}
function installMethod() {
  if (process.env.BB_INSTALL) return process.env.BB_INSTALL;
  if (process.env.INVOCATION_ID) return 'systemd';
  return process.platform === 'win32' ? 'task-scheduler' : 'manual';
}
function nodeMajor() { return +String(process.versions.node).split('.')[0]; }
function collect(extra) {
  var r = {
    os: os.type() + ' ' + os.release(), distro: distro(), arch: process.arch, node: process.version,
    nodeOk: nodeMajor() >= 18, cores: (os.cpus() || []).length, ramGB: Math.round(os.totalmem() / 1073741824 * 10) / 10,
    codeSha: gitHead(), protocolHash: protocolHash(), install: installMethod(),
    restarts: +(process.env.BB_SUP_RESTARTS || 0), branch: process.env.BB_CODE_BRANCH || '', pid: process.pid
  };
  for (var k in (extra || {})) r[k] = extra[k];
  return r;
}
function errorInfo(e) {
  if (!e) return null;
  return { message: String(e.message || e).slice(0, 400), stack: String(e.stack || '').split('\n').slice(0, 8).join('\n').slice(0, 1500) };
}
function allowed(kind, force) {
  var f = path.join(STATE, 'diag-stamps.json'), now = Date.now(), s = {};
  try { s = JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch (e) {}
  var hour = (s.hour || []).filter(function (t) { return now - t < 3600e3; });
  if (!force && (hour.length >= 30 || now - (s[kind] || 0) < 60e3)) return false;
  hour.push(now); s.hour = hour; s[kind] = now;
  try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(f, JSON.stringify(s)); } catch (e) {}
  return true;
}
function tokenFrom(file) {
  try { var t = fs.readFileSync(file, 'utf8').trim(); return /^[a-f0-9]{32,128}$/.test(t) ? t : ''; } catch (e) { return ''; }
}
/* POST JSON to the coordinator. cb(err, statusCode, bodyText). Never throws. */
function request(base, token, route, payload, cb) {
  try {
    var body = JSON.stringify(payload);
    var u = new (require('url').URL)(String(base).replace(/\/+$/, '') + route);
    var mod = u.protocol === 'http:' ? require('http') : require('https');
    var req = mod.request({ method: 'POST', hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'User-Agent': 'computelab-worker/' + process.version, 'Content-Length': Buffer.byteLength(body) }, timeout: 20000 },
      function (res) { var d = ''; res.on('data', function (c) { if (d.length < 4000) d += c; }); res.on('end', function () { cb(null, res.statusCode, d); }); });
    req.on('timeout', function () { req.destroy(new Error('timed out after 20 s')); });
    req.on('error', function (e) { cb(e); });
    req.end(body);
  } catch (e) { cb(e); }
}
function post(base, token, report, cb, opts) {
  cb = cb || function () {};
  opts = opts || {};
  if (!base || !token) return cb(new Error('no coordinator or token'));
  if (!allowed(report.kind || 'x', opts.force)) return cb(null, 0, 'rate-limited locally');
  var clean;
  try { clean = JSON.parse(scrub(JSON.stringify(report), token)); } catch (e) { return cb(e); }
  if (clean.log && clean.log.length > 50) clean.log = clean.log.slice(-50);
  var body = JSON.stringify(clean);
  while (body.length > 15000 && clean.log && clean.log.length) { clean.log.shift(); body = JSON.stringify(clean); }
  if (body.length > 15000) { delete clean.log; if (clean.lastError) delete clean.lastError.stack; }
  request(base, token, '/api/v1/diagnostics', clean, cb);
}
module.exports = { scrub: scrub, capture: capture, remember: remember, logTail: logTail, readFileTail: readFileTail, collect: collect,
  errorInfo: errorInfo, post: post, request: request, tokenFrom: tokenFrom, protocolHash: protocolHash, gitHead: gitHead, nodeMajor: nodeMajor, STATE: STATE };
