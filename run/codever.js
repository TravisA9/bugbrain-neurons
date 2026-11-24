'use strict';
/* run/codever.js (Phase 1): the code version the Compute Lab coordinator wants this computer to run.
 *
 * The coordinator's heartbeat reply may carry  code: { channel: 'stable' | 'canary', ref: '<40-hex commit>' | '' }.
 * coord.js saves it to ~/.bugbrain/code-target.json after every control check-in; the supervisor reads it and keeps
 * the checkout on that commit. ref '' means "follow the branch tip" (the old behaviour). A reply without `code`
 * (an older coordinator) removes the file, so the worker falls back to the branch tip too.
 *
 * Safety: a target is only followed when it is a commit of the worker branch (an ancestor of its tip) and contains
 * this file, so a pinned commit can always follow the next change. Anything else is ignored with a log line. */
const fs = require('fs'), path = require('path'), os = require('os');

function stateDir() { return process.env.BB_STATE_DIR || path.join(os.homedir(), '.bugbrain'); }
function targetFile(st) { return path.join(st || stateDir(), 'code-target.json'); }
const SHA = /^[0-9a-f]{40}$/;

/* The part of a heartbeat reply that matters, or null when the coordinator did not say (old coordinator). */
function fromReply(beat) {
  if (!beat || typeof beat !== 'object' || !beat.code || typeof beat.code !== 'object') return null;
  const ref = String(beat.code.ref || '').trim().toLowerCase();
  const channel = String(beat.code.channel || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'stable';
  if (ref !== '' && !SHA.test(ref)) return { channel: channel, ref: '', invalid: true };
  return { channel: channel, ref: ref };
}

function read(st) {
  try {
    const t = JSON.parse(fs.readFileSync(targetFile(st), 'utf8').replace(/^\uFEFF/, ''));
    if (!t || typeof t !== 'object') return null;
    const ref = String(t.ref || '').toLowerCase();
    return { channel: String(t.channel || ''), ref: SHA.test(ref) ? ref : '', at: t.at || '' };
  } catch (e) { return null; }
}

/* Save what the coordinator said. Returns true when the saved target changed. */
function save(beat, st) {
  const want = fromReply(beat), f = targetFile(st);
  if (!want) {
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (e) {} return true; }
    return false;
  }
  const have = read(st);
  if (have && have.ref === want.ref && have.channel === want.channel) return false;
  try {
    const tmp = f + '.tmp' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify({ channel: want.channel, ref: want.ref, at: new Date().toISOString() }) + '\n');
    fs.renameSync(tmp, f);
  } catch (e) { return false; }
  return true;
}

/* The commit the supervisor should run, or '' for the branch tip. */
function wanted(st) { const t = read(st); return t && t.ref ? t.ref : ''; }

/* Make `sha` usable in the checkout. git(args) runs git in the checkout and throws on failure; codeRef is the
 * fetched branch tip (refs/bb/code). Returns { ok, why }. Fetches the commit (and, for a shallow clone, the
 * history needed to prove it belongs to the branch) when missing. */
function usable(git, sha, codeRef, shallow) {
  if (!SHA.test(sha)) return { ok: false, why: 'not a full commit id' };
  const has = () => { try { git(['cat-file', '-e', sha + '^{commit}']); return true; } catch (e) { return false; } };
  if (!has()) { try { git(['fetch', '-q', '--no-tags'].concat(shallow ? ['--depth', '1'] : []).concat(['origin', sha])); } catch (e) {} }
  if (!has()) return { ok: false, why: 'commit ' + sha.slice(0, 7) + ' could not be downloaded' };
  const anc = () => { try { git(['merge-base', '--is-ancestor', sha, codeRef]); return true; } catch (e) { return false; } };
  if (!anc() && shallow) { try { git(['fetch', '-q', '--no-tags', '--unshallow', 'origin']); } catch (e) {} }
  if (!anc()) return { ok: false, why: 'commit ' + sha.slice(0, 7) + ' is not on the worker branch' };
  try { git(['cat-file', '-e', sha + ':run/codever.js']); } catch (e) { return { ok: false, why: 'commit ' + sha.slice(0, 7) + ' is older than channel support' }; }
  return { ok: true, why: '' };
}

module.exports = { fromReply, read, save, wanted, usable, targetFile, SHA };
