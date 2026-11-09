#!/usr/bin/env node
'use strict';
/* Copy a slim, read-only view of the local origin/queue ref into a folder the desk can open.
 * Does not fetch, push, or change the queue branch. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
function git(args) { return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32e6 }).trim(); }
function show(spec) { return git(['show', spec]); }
function main() {
  const dest = process.argv[2] || path.join(require('os').tmpdir(), 'bugbrain-queue-snapshot');
  const ref = process.argv[3] || 'origin/queue';
  fs.rmSync(dest, { recursive: true, force: true });
  for (const d of ['jobs', 'workers', 'claims', 'done', 'results']) fs.mkdirSync(path.join(dest, d), { recursive: true });
  const commit = git(['rev-parse', ref]);
  const when = git(['log', '-1', '--format=%cI', ref]);
  fs.writeFileSync(path.join(dest, 'worker-config.json'), show(ref + ':worker-config.json'));
  const names = git(['ls-tree', '-r', '--name-only', ref]).split('\n');
  const jobs = new Set(names.filter(n => n.startsWith('jobs/') && n.endsWith('.json')).map(n => path.basename(n, '.json')));
  const dones = new Set(names.filter(n => n.startsWith('done/') && n.endsWith('.json')).map(n => path.basename(n, '.json')));
  for (const n of names.filter(n => n.startsWith('workers/') && n.endsWith('.json'))) fs.writeFileSync(path.join(dest, n), show(ref + ':' + n));
  const pending = [...jobs].filter(id => !dones.has(id));
  for (const id of pending) fs.writeFileSync(path.join(dest, 'jobs', id + '.json'), show(ref + ':jobs/' + id + '.json'));
  const recent = [];
  const log = git(['log', ref, '--format=%s', '-n', '400']);
  for (const line of log.split('\n')) {
    const m = /^result (\S+) by /.exec(line);
    if (m && dones.has(m[1]) && !recent.includes(m[1])) recent.push(m[1]);
    if (recent.length >= 4) break;
  }
  for (const id of recent) {
    try { fs.writeFileSync(path.join(dest, 'jobs', id + '.json'), show(ref + ':jobs/' + id + '.json')); } catch (e) {}
    try { fs.writeFileSync(path.join(dest, 'done', id + '.json'), show(ref + ':done/' + id + '.json')); } catch (e) {}
    try { fs.mkdirSync(path.join(dest, 'results', id), { recursive: true }); fs.writeFileSync(path.join(dest, 'results', id, 'QUEUE_LOG.md'), show(ref + ':results/' + id + '/QUEUE_LOG.md')); } catch (e) {}
  }
  const banner = 'Copy of the queue branch at ' + commit.slice(0, 7) + ' (' + when + '). Not a live connection. Heartbeats are the last messages those computers pushed, not a ping from this page. Nothing here is sent back.';
  fs.writeFileSync(path.join(dest, 'meta.json'), JSON.stringify({ banner, source: ref, commit, when, pending: pending.length }, null, 2) + '\n');
  console.log(dest);
  console.log('pending ' + pending.length + ', recent results ' + recent.join(', '));
}
main();
