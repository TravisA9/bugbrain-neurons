#!/usr/bin/env node
// Export the Explore tab's top-design manifest (schema 2) and its replay files from finished research outputs.
// Runs no brains: it only reads result JSONs that the research runs already wrote, so it is cheap and safe to rerun.
//
//   node tools/export_explore.js --version R135 --commit 7e20a207 --variant-file <file with the variant string> \
//     [--read <bd_*.json with per-letter hits> --read-held <data_k*.json> [--read-compare <json {hits, model}>]] \
//     [--name <np_*.json>[,<np_*.json>...]] \
//     [--copy <lp_*.json>[,...] --copy-off <acc>[,<acc>...] [--copy-off-note <text>] [--copy-design R140-S2] [--copy-status testing]] \
//     [--arena-plan v3h] [--out hosting/computelab/private/explore] [--updated YYYY-MM-DD]
//
// Writes <out>/design.json and <out>/<id>-<version>.json for each replay given. A replay that is not given keeps
// the entry already in <out>/design.json (if any), so one demo can be refreshed alone.
// Promotion routine: after a design passes the gate, rerun this with its outputs, commit private/explore/, and
// hand the folder to the ComputeLab deploy (upload private/explore/* only).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const list = v => (v ? String(v).split(',').filter(Boolean) : []);
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const out = path.resolve(opt('--out', path.join(repo, 'hosting/computelab/private/explore')));
const version = opt('--version'); if (!/^[A-Za-z0-9._-]{1,40}$/.test(version || '')) throw new Error('--version must be 1-40 of [A-Za-z0-9._-]');
const variant = (opt('--variant') || (opt('--variant-file') ? fs.readFileSync(opt('--variant-file'), 'utf8') : '')).trim();
if (!/^[A-Za-z0-9.@=,|_-]{0,2000}$/.test(variant)) throw new Error('variant has unexpected characters');
fs.mkdirSync(out, { recursive: true });
const manifestPath = path.join(out, 'design.json');
const old = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
const replays = Object.assign({}, old.replays || {});
function write(id, data, meta) {
  const file = id + '-' + String(meta.design || version).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json', text = JSON.stringify(data) + '\n';
  fs.writeFileSync(path.join(out, file), text);
  replays[id] = Object.assign({ file, sha256: crypto.createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) }, meta);
  console.log('wrote ' + file + ' (' + (text.length / 1024).toFixed(1) + ' KB)');
}

// #read: per-letter right/wrong on held-out text the brain never trained on.
if (opt('--read')) {
  const bd = readJson(opt('--read')), held = readJson(opt('--read-held')).held;
  const hits = String(bd.hits); if (hits.length !== held.length) throw new Error('hits and held text differ in length');
  const cmp = opt('--read-compare') ? readJson(opt('--read-compare')) : null;
  const acc = h => round([...h].filter(c => c === '1').length / h.length);
  const words = h => { let n = 0, first = 0, rest = 0, restN = 0; for (let i = 0; i < held.length; i++) {
    if (held[i] === ' ' || (i > 0 && held[i - 1] !== ' ')) continue; let j = i; while (j < held.length && held[j] !== ' ') j++; if (j >= held.length) break;
    n++; first += +h[i]; for (let q = i + 1; q <= j; q++) { rest += +h[q]; restN++; } }
    return { words: n, firstLetter: round(first / n), restOfWord: round(rest / restN) }; };
  write('read', { id: 'read', design: version, seed: bd.k, letters: held.length, text: held, hits,
    acc: acc(hits), words: words(hits), trainLetters: (bd.subs && bd.subs >= 4.4e6) ? 98000 : null,
    compare: cmp ? { label: cmp.model, hits: String(cmp.hits), acc: acc(String(cmp.hits)), words: words(String(cmp.hits)) } : null,
    source: path.basename(opt('--read')) }, { design: version, status: 'top' });
}

// #name: an invented name seen once in prose, then again after a gap; letters 2..end guessed right each time.
if (opt('--name')) {
  const runs = list(opt('--name')).map(readJson), gaps = Object.keys(runs[0].on.byGap).map(Number).sort((a, b) => a - b);
  const avg = (set, key) => gaps.map(g => round(mean(runs.map(r => r[set].byGap[g][key])), 3));
  write('name', { id: 'name', design: version, seeds: runs.map(r => r.k), gaps,
    learning: { first: avg('on', 'rest1'), second: avg('on', 'rest2'), exact: avg('on', 'exact2') },
    frozen: { first: avg('off', 'rest1'), second: avg('off', 'rest2') },
    names: runs[0].names.slice(0, 8), namesPerGap: runs[0].on.byGap[gaps[0]].n * runs.length,
    source: list(opt('--name')).map(f => path.basename(f)) }, { design: version, status: 'top' });
}

// #copy: delayed copy probe (a symbol, a stretch of filler, a cue: repeat the symbol), by how far back it was.
if (opt('--copy')) {
  const runs = list(opt('--copy')).map(readJson), labels = ['5-8', '9-16', '17-31'], off = list(opt('--copy-off')).map(Number);
  write('copy', { id: 'copy', design: opt('--copy-design', version), status: opt('--copy-status', 'top'), seeds: runs.length,
    bins: labels.map(b => ({ label: b, acc: round(mean(runs.map(r => r.bins[b].acc)), 3), n: runs.reduce((s, r) => s + r.bins[b].n, 0) })),
    withLookBack: round(mean(runs.map(r => r.probeAcc)), 3), perSeed: runs.map(r => round(r.probeAcc, 3)),
    without: off.length ? round(mean(off), 3) : null, withoutNote: opt('--copy-off-note', ''), chance: 0.25, desc: runs[0].desc,
    source: list(opt('--copy')).map(f => path.basename(f)) }, { design: opt('--copy-design', version), status: opt('--copy-status', 'top') });
}

const manifest = {
  schema: 2, version, commit: opt('--commit', old.commit || ''), updated: opt('--updated', new Date().toISOString().slice(0, 10)),
  text: { plan: 'deepURSx3', variant, size: '4x',
    // The browser grows a small version of the same design for the live demos (fewer granule cells, normal size).
    liveVariant: variant.split(',').filter(kv => !/^(sc\.sizeF|P\.granN)=/.test(kv)).concat('P.granN=4000').join(',') },
  arena: { plan: opt('--arena-plan', (old.arena && old.arena.plan) || 'v3h'), physics: 'standard' },
  replays,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
console.log('wrote design.json (' + version + ', ' + Object.keys(replays).join(', ') + ')');
