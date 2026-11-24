#!/usr/bin/env node
// Build hosting/computelab/private/bugbrain.js: the BugBrain engine (js/core + js/envs, no book corpus)
// taken from one git commit, followed by the Explore arena view (hosting/computelab/private/bugbrain-view.js
// from the working tree). Reproducible: the same commit and view give the same bytes.
//
//   node tools/build_bugbrain_bundle.js [--ref <git ref>] [--out <file>] [--max-kb 600] [--check]
//
// --ref     commit that supplies js/core and js/envs (default HEAD). The top design's code lives on the
//           research branch (e.g. relgrowth), so pass that ref when the core changes.
// --check   build in memory and compare with --out; exit 1 if it differs (for CI / deploy checks).
// The header names the source commit and the sha256 of everything after the header line.
'use strict';
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ref = opt('--ref', 'HEAD'), out = path.resolve(opt('--out', path.join(repo, 'hosting/computelab/private/bugbrain.js')));
const maxKb = +opt('--max-kb', '600'), check = args.includes('--check');
// Same files and order as js/node_load.js, minus envs/book.js (3.4 MB corpus, Node only).
const FILES = ['core/base.js', 'core/io.js', 'core/develop.js', 'core/regions.js', 'core/plans.js', 'core/net.js', 'core/files.js',
  'core/agent.js', 'core/evolve.js', 'envs/bug.js', 'envs/memory.js', 'envs/text.js', 'envs/sequence.js', 'envs/seqchoice.js',
  'envs/bandit.js', 'envs/reward_evolved.js'];
const git = a => execFileSync('git', a, { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
const sha = git(['rev-parse', ref + '^{commit}']).trim();
const parts = FILES.map(f => git(['show', sha + ':js/' + f]).replace(/\s+$/, '') + '\n');
const view = fs.readFileSync(path.join(repo, 'hosting/computelab/private/bugbrain-view.js'), 'utf8').replace(/\s+$/, '') + '\n';
const body = parts.join('\n') + '\n' + view;
const bodySha = crypto.createHash('sha256').update(body).digest('hex');
const header = '/* bugbrain.js built by tools/build_bugbrain_bundle.js from commit ' + sha + ' (' + ref + '); js/' + FILES.join(', js/') +
  ' + hosting/computelab/private/bugbrain-view.js; body sha256 ' + bodySha + ' */\n';
const text = header + body, kb = Buffer.byteLength(text) / 1024;
if (kb > maxKb) { console.error('bundle is ' + kb.toFixed(1) + ' KB, over the ' + maxKb + ' KB cap'); process.exit(2); }
if (check) {
  const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === text;
  console.log((same ? 'up to date: ' : 'DIFFERS: ') + out); process.exit(same ? 0 : 1);
}
fs.writeFileSync(out, text);
console.log('wrote ' + out + ' (' + kb.toFixed(1) + ' KB, commit ' + sha.slice(0, 12) + ', file sha256 ' +
  crypto.createHash('sha256').update(text).digest('hex') + ')');
