'use strict';
/* HTTP desk: auth, origin, switch, submit. No live queue and no real scheduled task. */
const fs = require('fs'), path = require('path'), os = require('os');
const { createConsole, listen } = require('./console.js');
let n = 0;
function check(cond, what) { n++; if (!cond) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }
function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-console-')); fs.mkdirSync(path.join(d, 'jobs')); fs.mkdirSync(path.join(d, 'workers')); return d; }

async function main() {
  const dir = tmp();
  const now = Date.parse('2026-11-09T01:02:00.000Z');
  fs.writeFileSync(path.join(dir, 'worker-config.json'), JSON.stringify({ version: 1, forceVersion: 0, defaults: { mode: 'run' }, workers: { 'linux-pc': { maxMemGB: 4 } }, jobs: {} }) + '\n');
  fs.writeFileSync(path.join(dir, 'workers/linux-pc.json'), JSON.stringify({ worker: 'linux-pc', type: 'linux', state: 'idle', job: null, mode: 'run', at: new Date(now - 60000).toISOString() }) + '\n');
  fs.writeFileSync(path.join(dir, 'jobs/ready.json'), JSON.stringify({ id: 'ready', title: 'Ready test', kind: 'runs', priority: 0.4, estHours: 0.2, memGB: 1, runs: [{ script: 'run/r42.js', args: ['deepURSx3'] }] }) + '\n');
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ banner: 'Practice copy. Not live machines.' }) + '\n');
  let enabled = false, running = false; const calls = [];
  const machine = {
    probe: () => ({ installed: true, enabled, running, platform: 'win32', detail: enabled ? (running ? 'task running' : 'enabled, not running') : 'task disabled' }),
    apply: action => { calls.push(action); if (action === 'on') { enabled = true; running = true; } else { enabled = false; running = false; } return { ok: true, applied: true }; },
  };
  const app = createConsole({ dir, token: 'a'.repeat(48), publish: false, liveSwitch: true, localName: 'linux-pc', now: () => now, machine, exists: () => true });
  const addr = await listen(app.server, '127.0.0.1', 0);
  const base = 'http://127.0.0.1:' + addr.port;
  const token = 'a'.repeat(48);
  async function hit(method, p, body, headers) {
    const res = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, text, json };
  }
  const page = await hit('GET', '/');
  check(page.status === 200 && page.text.includes('cannot run them'), 'the page loads and says the browser cannot run tests');
  const anon = await hit('GET', '/api/state');
  check(anon.status === 401, 'the queue is not readable without the pairing token');
  const badOrigin = await hit('POST', '/api/priority', { id: 'ready', priority: 1 }, { 'X-Bugbrain-Token': token, Origin: 'http://evil.test' });
  check(badOrigin.status === 403, 'a foreign page cannot change the queue');
  const st = await hit('GET', '/api/state', null, { 'X-Bugbrain-Token': token });
  check(st.status === 200 && st.json.workers[0].activity === 'idle' && st.json.workers[0].connected, 'paired read shows the fresh worker as idle');
  check(st.json.thisComputer.enabled === false && st.json.thisComputer.running === false && st.json.thisComputer.liveSwitch === true, 'this computer reports the probed off task, not a wish');
  const on = await hit('POST', '/api/switch', { on: true }, { 'X-Bugbrain-Token': token, Origin: 'http://127.0.0.1:' + addr.port });
  check(on.status === 200 && calls[0] === 'on', 'turn on uses the machine switch');
  const stOn = await hit('GET', '/api/state', null, { 'X-Bugbrain-Token': token });
  check(stOn.json.thisComputer.enabled === true && stOn.json.thisComputer.running === true, 'after a successful on, the probe is what the page would show');
  const added = await hit('POST', '/api/submit', { template: 'read-book-short', seed: 8000 }, { 'X-Bugbrain-Token': token });
  check(added.status === 200 && added.json.id === 'desk-read-book-short-g8000', 'submit adds the short reading check');
  check(fs.existsSync(path.join(dir, 'jobs', 'desk-read-book-short-g8000.json')), 'the job file is on disk');
  const sooner = await hit('POST', '/api/priority', { id: 'desk-read-book-short-g8000', priority: 2 }, { 'X-Bugbrain-Token': token });
  check(sooner.status === 200, 'priority of a waiting test is saved');
  const again = await hit('GET', '/api/state', null, { 'X-Bugbrain-Token': token });
  const card = again.json.jobs.find(j => j.id === 'desk-read-book-short-g8000');
  check(card && card.phase === 'waiting' && card.effectivePriority === 2 && card.runnableBy.includes('linux-pc'), 'the new test is waiting and eligible for linux-pc');
  const pub = await hit('POST', '/api/publish', {}, { 'X-Bugbrain-Token': token });
  check(pub.status === 409 && /Sending is off/.test(pub.json.error), 'send is refused when publish is not armed');
  const off = await hit('POST', '/api/switch', { on: false }, { 'X-Bugbrain-Token': token });
  check(off.status === 200 && calls[1] === 'off' && fs.existsSync(path.join(dir, 'jobs', 'desk-read-book-short-g8000.json')), 'turn off stops the switch and does not delete the job');

  const quiet = createConsole({ dir, token, publish: false, liveSwitch: false, localName: 'linux-pc', now: () => now, machine: { probe: () => { throw new Error('should not be required to succeed'); }, apply: () => { throw new Error('live off must not apply'); } }, exists: () => true });
  // probe throwing is caught
  const addr2 = await listen(quiet.server, '127.0.0.1', 0);
  const base2 = 'http://127.0.0.1:' + addr2.port;
  const res2 = await fetch(base2 + '/api/switch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bugbrain-Token': token }, body: '{"on":true}' });
  const body2 = await res2.json();
  check(res2.status === 409 && /Live control is off/.test(body2.error), 'without --live-switch the task is not started');
  const st2 = await (await fetch(base2 + '/api/state', { headers: { 'X-Bugbrain-Token': token } })).json();
  check(st2.thisComputer.unknown === true || st2.thisComputer.detail, 'a failed probe is not reported as running');
  check(st2.thisComputer.running !== true, 'a failed probe is not running');

  const ownerTok = token;
  const partTok = 'b'.repeat(48);
  const roles = createConsole({ dir, token: ownerTok, participantToken: partTok, publish: false, liveSwitch: false, localName: 'linux-pc', now: () => now, machine, exists: () => true });
  const addr3 = await listen(roles.server, '127.0.0.1', 0);
  const base3 = 'http://127.0.0.1:' + addr3.port;
  async function hit3(method, p, body, key) {
    const res = await fetch(base3 + p, { method, headers: { 'Content-Type': 'application/json', 'X-Bugbrain-Token': key }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }
  const labPage = await fetch(base3 + '/lab');
  const labHtml = await labPage.text();
  check(labPage.status === 200 && labHtml.includes('Run 1 batch') && !labHtml.includes('/api/'), 'the lab page loads without a token and does not call the queue');
  const denied = await hit3('POST', '/api/project', { create: true, title: 'Nope' }, partTok);
  check(denied.status === 403, 'a participant cannot create or reorder projects');
  const made = await hit3('POST', '/api/project', { create: true, title: 'Notes' }, ownerTok);
  check(made.status === 200 && made.json.projects.some(p => p.id === 'spikefoundry') && made.json.projects.some(p => p.id === 'notes'), 'the owner can add a project and the defaults include SpikeFoundry');
  const sf = made.json.projects.find(p => p.id === 'spikefoundry');
  const bb = made.json.projects.find(p => p.id === 'bugbrain');
  check(sf && bb && sf.priority > bb.priority, 'SpikeFoundry starts ahead of BugBrain');
  const opted = await hit3('POST', '/api/participant/choices', { donate: true, allowedProjects: ['spikefoundry'], maxBatches: 2 }, partTok);
  check(opted.status === 200 && opted.json.participant.donate === true, 'the participant can opt in to SpikeFoundry only');
  const ownerOpt = await hit3('POST', '/api/participant/choices', { donate: true, allowedProjects: ['bugbrain'], maxBatches: 2 }, ownerTok);
  check(ownerOpt.status === 403, 'the owner key cannot use the participant opt-in route');
  const view = await hit3('GET', '/api/participant/state', null, partTok);
  check(view.status === 200 && view.json.current == null && typeof view.json.explanation === 'string' && view.json.explanation.length > 10 && view.json.participant.donate === true, 'the participant view tells the truth when no shared job is running');
  roles.server.close();

  app.server.close(); quiet.server.close();
  console.log(n + ' checks');
  if (process.exitCode) process.exit(process.exitCode);
}
main().catch(e => { console.error(e); process.exit(1); });
