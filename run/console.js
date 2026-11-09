#!/usr/bin/env node
'use strict';
/* Local desk. Binds to 127.0.0.1 only. Mutating requests need the pairing token.
 * Does not push to GitHub unless --publish is set, and even then refuses the live
 * TravisA9/bugbrain-neurons remote unless BB_CONSOLE_PUBLISH_LIVE=1.
 * Does not start or stop a worker unless --live-switch is set. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const Desk = require('./desk.js');
const Machine = require('./machine.js');
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'console', 'index.html');

function argMap(argv) {
  const a = {}; const v = argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    const k = v[i].replace(/^--/, '');
    if (['publish', 'live-switch', 'demo'].includes(k)) a[k] = true;
    else a[k] = v[++i];
  }
  return a;
}
function sameToken(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
function tokenFile(stateDir) {
  fs.mkdirSync(stateDir, { recursive: true });
  try { fs.chmodSync(stateDir, 0o700); } catch (e) {}
  const f = path.join(stateDir, 'console-token');
  let t = '';
  try { t = fs.readFileSync(f, 'utf8').trim(); } catch (e) {}
  if (!/^[a-f0-9]{32,}$/.test(t)) {
    t = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(f, t + '\n', { mode: 0o600 });
    try { fs.chmodSync(f, 0o600); } catch (e) {}
  }
  return t;
}
function localName(stateDir) {
  try { return fs.readFileSync(path.join(stateDir, 'worker-name'), 'utf8').trim(); } catch (e) { return ''; }
}
function allowedOrigin(origin, host) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:') return false;
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
    if (host && u.host !== host) return false;
    return true;
  } catch (e) { return false; }
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('too large'), { code: 'size' })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(Object.assign(new Error('Send JSON.'), { code: 'json' })); } });
    req.on('error', reject);
  });
}
function send(res, code, obj, type) {
  const body = type === 'html' ? obj : JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': type === 'html' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

function createConsole(opt) {
  opt = opt || {};
  const dir = opt.dir;
  const token = opt.token;
  const publishArmed = !!opt.publish;
  const liveSwitch = !!opt.liveSwitch;
  const stateDir = opt.stateDir || path.join(os.homedir(), '.bugbrain');
  const nowFn = opt.now || (() => Date.now());
  const machine = opt.machine || {
    probe: () => Machine.probe(opt.platform),
    apply: action => Machine.apply(action, { live: liveSwitch, platform: opt.platform }),
  };
  const exists = opt.exists || (rel => fs.existsSync(path.join(ROOT, rel)));
  const name = opt.localName != null ? opt.localName : localName(stateDir);

  function state() {
    const base = Desk.view(dir, nowFn(), { publishArmed, liveSwitch, localName: name, exists });
    let probe;
    try { probe = machine.probe(); } catch (e) { probe = { installed: false, enabled: null, running: null, unknown: true, detail: 'Could not check the worker on this computer.' }; }
    const mine = base.workers.find(w => w.name === name) || null;
    base.thisComputer = {
      name: name || '',
      liveSwitch,
      installed: !!probe.installed,
      enabled: probe.installed ? probe.enabled : null,
      running: probe.installed ? !!probe.running : false,
      unknown: !!probe.unknown || probe.enabled == null && probe.installed,
      failed: !!probe.failed,
      detail: probe.detail || '',
      platform: probe.platform || opt.platform || '',
      worker: mine,
    };
    return base;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const host = String(req.headers.host || '');
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { send(res, 403, { error: 'The desk only answers on this computer.' }); return; }
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        send(res, 200, fs.readFileSync(PAGE), 'html'); return;
      }
      if (!url.pathname.startsWith('/api/')) { send(res, 404, { error: 'Not found.' }); return; }
      if (!sameToken(req.headers['x-bugbrain-token'], token)) { send(res, 401, { error: 'Open the desk from the link printed when it started. That link is the key.' }); return; }
      if (!allowedOrigin(req.headers.origin, host)) { send(res, 403, { error: 'This page only accepts actions from itself.' }); return; }
      if (req.method === 'GET' && url.pathname === '/api/state') { send(res, 200, state()); return; }
      if (req.method === 'GET' && url.pathname === '/api/job') {
        send(res, 200, Desk.jobDetail(dir, url.searchParams.get('id') || '', nowFn())); return;
      }
      if (req.method !== 'POST') { send(res, 405, { error: 'Not allowed.' }); return; }
      const body = await readBody(req, 100000);
      const t = nowFn();
      let out;
      if (url.pathname === '/api/mode') out = Desk.setMode(dir, body.worker || name, body.mode);
      else if (url.pathname === '/api/priority') out = Desk.setPriority(dir, body.id, body.priority, t);
      else if (url.pathname === '/api/assign') out = Desk.assignJob(dir, body.id, body.worker || '', t);
      else if (url.pathname === '/api/block') out = Desk.setBlock(dir, body.id, !!body.blocked, t);
      else if (url.pathname === '/api/submit') out = Desk.submit(dir, body.template, body.seed);
      else if (url.pathname === '/api/switch') {
        if (!liveSwitch) { send(res, 409, { error: 'Live control is off. The scheduled task was not changed. Start the desk with --live-switch on the computer that has the worker.' }); return; }
        const action = body.on ? 'on' : 'off';
        const r = machine.apply(action);
        if (!r.ok) { send(res, 409, { error: r.error || 'Could not change the worker.' }); return; }
        out = r;
      } else if (url.pathname === '/api/publish') {
        if (!publishArmed) { send(res, 409, { error: 'Sending is off. Changes stay in this folder. Start the desk with --publish when you mean to update the shared queue.' }); return; }
        out = Desk.publish(dir, opt.env || process.env);
      } else { send(res, 404, { error: 'Not found.' }); return; }
      send(res, 200, out);
    } catch (e) {
      const code = e.code === 'missing' || e.code === 'template' || e.code === 'seed' ? 400 : e.code === 'leased' || e.code === 'parked' || e.code === 'live-queue' || e.code === 'branch' ? 409 : 400;
      send(res, code, { error: e.message || 'Something went wrong.' });
    }
  });
  return { server, token, dir, state };
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address()));
  });
}

async function main() {
  const a = argMap(process.argv);
  if (a.host && a.host !== '127.0.0.1' && a.host !== 'localhost') { console.error('Refusing to listen on ' + a.host + '. The desk stays on this computer.'); process.exit(2); }
  const stateDir = a['state-dir'] || path.join(os.homedir(), '.bugbrain');
  let dir = a.dir;
  if (a.demo || !dir) {
    dir = a.dir || path.join(stateDir, 'desk-demo');
    if (a.demo || !a.dir) seedDemo(dir);
  }
  fs.mkdirSync(dir, { recursive: true });
  const token = tokenFile(stateDir);
  const liveSwitch = !!a['live-switch'];
  const app = createConsole({ dir, token, publish: !!a.publish, liveSwitch, stateDir, now: a.now ? () => Date.parse(a.now) : undefined, platform: a.platform });
  const addr = await listen(app.server, '127.0.0.1', +(a.port || 8787));
  const link = 'http://127.0.0.1:' + addr.port + '/#token=' + token;
  console.log('BugBrain desk  ' + link);
  console.log('Queue folder   ' + dir);
  console.log(liveSwitch ? 'On/off will change the worker on this computer.' : 'On/off will not change a scheduled task (pass --live-switch on the worker computer).');
  console.log(a.publish ? 'Send-to-workers is armed.' : 'Changes stay in the queue folder (pass --publish to send them).');
  console.log('A browser on this computer can open the desk. It cannot run the brain tests.');
}

function seedDemo(dir) {
  fs.mkdirSync(path.join(dir, 'jobs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'workers'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'claims'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'done'), { recursive: true });
  const now = new Date().toISOString();
  if (!fs.existsSync(path.join(dir, 'worker-config.json'))) {
    fs.writeFileSync(path.join(dir, 'worker-config.json'), JSON.stringify({
      version: 1, forceVersion: 0, defaults: { mode: 'run', pollMinutes: 10 },
      workers: { 'linux-pc': { maxMemGB: 4 }, tacobell: { cpuMax: 60, maxMemGB: 1 } },
      jobs: { 'sample-held': 'block' },
    }, null, 2) + '\n');
  }
  const put = (folder, name, obj) => { const p = path.join(dir, folder, name); if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); };
  put('jobs', 'sample-held.json', { id: 'sample-held', title: 'A parked sample (not a real experiment)', kind: 'runs', priority: 0.4, estHours: 0.2, memGB: 1, runs: [{ script: 'run/r42.js', args: ['deepURSx3'], label: 'sample' }] });
  put('workers', 'linux-pc.json', { worker: 'linux-pc', type: 'linux', state: 'idle', job: null, mode: 'run', host: 'sample', platform: 'linux', at: now });
  if (!fs.existsSync(path.join(dir, 'meta.json'))) fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ banner: 'Practice copy on this computer. It is not the shared queue, and these are not live machines.', source: 'demo' }, null, 2) + '\n');
}

if (require.main === module) main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
module.exports = { createConsole, listen, tokenFile, allowedOrigin };
