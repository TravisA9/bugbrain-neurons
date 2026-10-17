#!/usr/bin/env node
'use strict';
/* run/dashdata.js (R51): everything dashboard.html shows, in one file it can load on file:// (no server):
 *   results/dashdata.js = window.BB_DASH = { ideas (+ theme, parents), rounds (RESULTS.md sections), progress (registry timeline),
 *   adoptions, jobs (local + shared queue), machines (who runs what), log (QUEUE_LOG.md), ... }
 * Sources: experiments/ideas.json, RESULTS.md, experiments/registry.jsonl (+ shared registry/*.jsonl), experiments/queue/*.json,
 *   results/queue_state.json, results/QUEUE_LOG.md, and the `queue` branch of the GitHub repo (claims/, done/, jobs/, registry/, history).
 * The queue branch is read from a private read-only clone .dq-view/ (fetched at most every 2 min, 20 s timeout, no credentials);
 *   offline or no git: uses the last fetched copy, else a worker clone .dq/, else local data only. Never pushes anything.
 * Called by run/queue.js after each job and by run/refill.js before each pick. Usage: bun run/dashdata.js [--no-fetch] [--quiet]
 *   --write-parents: also store the inferred theme/parents into experiments/ideas.json (only fields that are missing). */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'results');   // always the project's results folder (not a dq scratch folder)
const ARGS = new Set(process.argv.slice(2));
const QUIET = ARGS.has('--quiet');
const say = s => { if (!QUIET) console.log(s); };
const rd = (p, d) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return d; } };
const rj = (p, d) => { try { return JSON.parse(rd(p)); } catch (e) { return d; } };
const REPO = process.env.BB_DQ_REPO_RO || 'https://github.com/TravisA9/bugbrain-neurons.git';
const VIEW = path.join(ROOT, '.dq-view');

// ---------- ideas: themes + 'grew from' relations ----------
const THEMES = ['memory', 'reward', 'learning', 'growth', 'world model', 'analogy', 'scaling', 'tooling'];
const AREA_THEME = { memory: 'memory', 'staged-learning': 'memory', regions: 'growth', reward: 'reward', growth: 'growth', development: 'growth',
  learning: 'learning', 'world-model': 'world model', scaling: 'scaling', speed: 'tooling', evaluation: 'tooling', evolution: 'tooling' };
const THEME_OF = { I17: 'memory', I32: 'memory', I47: 'world model', I50: 'world model', I61: 'world model', I64: 'world model', I62: 'world model',
  I49: 'analogy', I63: 'analogy', I12: 'scaling', I34: 'scaling', I58: 'scaling', I59: 'memory', I18: 'reward', I37: 'reward', I41: 'learning', I36: 'analogy' };
// inferred from titles / evidence / rounds (child: [parents]); an explicit "parents" field in ideas.json wins
const PARENTS = { I03: ['I02'], I04: ['I02'], I06: ['I05'], I07: ['I04'], I08: ['I07'], I09: ['I06'], I10: ['I09', 'I06'], I11: ['I02'], I12: ['I10'],
  I13: ['I10'], I14: ['I13'], I15: ['I14'], I16: ['I01'], I17: ['I10'], I18: ['I16', 'I17'], I19: ['I09', 'I16'], I20: ['I11'], I21: ['I03', 'I20'],
  I22: ['I16', 'I21'], I23: ['I07'], I24: ['I23', 'I08'], I25: ['I17', 'I22', 'I19'], I26: ['I25'], I27: ['I25', 'I15'], I28: ['I22'], I29: ['I28'],
  I30: ['I29'], I31: ['I25', 'I27'], I32: ['I17'], I33: ['I11'], I34: ['I20'], I35: ['I04'], I36: ['I25'], I37: ['I31', 'I29'], I38: ['I31'],
  I39: ['I29'], I40: ['I21', 'I31'], I41: ['I37'], I42: ['I35'], I43: ['I29'], I44: ['I40'], I45: ['I24'], I46: ['I42'], I47: ['I09'], I48: ['I32'],
  I49: ['I36'], I50: ['I47'], I51: ['I32'], I52: ['I17', 'I34'], I53: ['I52'], I54: ['I52'], I55: ['I51'], I56: ['I54'], I57: ['I55'],
  I58: ['I56', 'I41'], I59: ['I56'], I60: ['I41'], I61: ['I47'], I62: ['I58', 'I47'], I63: ['I49'], I64: ['I47'] };
const themeOf = i => i.theme || THEME_OF[i.id] || AREA_THEME[i.area] || 'tooling';
function loadIdeas() {
  const p = path.join(ROOT, 'experiments', 'ideas.json'), D = rj(p, { ideas: [], questions: [] });
  if (ARGS.has('--write-parents')) {
    let n = 0; for (const i of D.ideas) { if (!i.theme) { i.theme = themeOf(i); n++; } if (!i.parents && PARENTS[i.id]) { i.parents = PARENTS[i.id]; n++; } }
    if (n) { fs.writeFileSync(p, JSON.stringify(D, null, 2) + '\n'); say(`ideas.json: stored ${n} theme/parents fields`); }
  }
  const payoff = q => +(q.impact * q.likelihood / q.cost).toFixed(2);
  return { ideas: D.ideas.map(i => Object.assign({}, i, { theme: themeOf(i), parents: i.parents || PARENTS[i.id] || [] })),
    questions: (D.questions || []).map(q => Object.assign({ payoff: payoff(q) }, q)).sort((a, b) => b.payoff - a.payoff) };
}

// ---------- RESULTS.md: rounds, dates, adoptions ----------
// commit times (CT) of each round on the box master (the PC has no git history); later rounds fall back to the date in the heading
const ROUND_AT = { R27: '2026-10-12T09:17:00-05:00', R28: '2026-10-12T11:47:50-05:00', R29: '2026-10-12T13:10:53-05:00', R30: '2026-10-12T16:36:10-05:00',
  R31: '2026-10-12T19:04:49-05:00', R32: '2026-10-12T21:34:53-05:00', R33: '2026-10-12T21:51:57-05:00', R34: '2026-10-13T00:33:35-05:00',
  R35: '2026-10-13T00:48:59-05:00', R36: '2026-10-13T01:06:58-05:00', R37: '2026-10-13T01:29:48-05:00', R38: '2026-10-13T07:30:05-05:00',
  R39: '2026-10-13T18:47:13-05:00', R40: '2026-10-14T11:33:56-05:00', R41: '2026-10-15T21:24:31-05:00', R42: '2026-10-15T21:54:12-05:00',
  R43: '2026-10-15T22:36:07-05:00', R44: '2026-10-15T23:28:18-05:00', R45: '2026-10-16T07:41:14-05:00', R46: '2026-10-16T08:21:02-05:00',
  R48: '2026-10-16T15:36:12-05:00', R50: '2026-10-16T19:20:00-05:00' };
const ADOPTIONS = [   // defaults adopted (app version, DEFAULTS_VERSION, round, when, what)
  { v: 'v26', dv: 21, round: 'R27', at: '2026-10-12T09:17:00-05:00', what: 'balanced multitask fitness; evolved reward plan rewardE' },
  { v: 'v27', dv: 22, round: 'R28', at: '2026-10-12T11:47:50-05:00', what: 'local connection demand' },
  { v: 'v30', dv: 23, round: 'R30', at: '2026-10-12T23:42:45-05:00', what: 'unifiedR: one genome, areas from the task I/O' },
  { v: 'v31', dv: 24, round: 'R35', at: '2026-10-13T00:52:46-05:00', what: 'reward area = rewardE2 (dual-timescale eligibility)' },
  { v: 'v32', dv: 25, round: 'R37', at: '2026-10-13T01:29:48-05:00', what: 'outcome -> striatum owns outputs, clock -> graded cortex' },
  { v: 'v33', dv: 26, round: 'R39', at: '2026-10-13T18:47:13-05:00', what: 'striatum = rewardE3 (q04 champion transplant)' },
  { v: 'v34', dv: 27, round: 'R44', at: '2026-10-16T06:17:14-05:00', what: 'deepURSx3 deep-memory brain for sequences/text/seqchoice' },
];
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function headingDate(h) {
  const m = h.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* (\d{1,2})(?:,? (\d{4}))?(?:,? (\d{1,2}):(\d{2}) ?(AM|PM))?/); if (!m) return null;
  let hh = m[4] ? (+m[4] % 12) + (m[6] === 'PM' ? 12 : 0) : 12, mm = m[5] ? +m[5] : 0;
  return `${m[3] || 2026}-${String(MON[m[1]] + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-05:00`;
}
function loadRounds() {
  const text = rd(path.join(ROOT, 'RESULTS.md'), '').replace(/\r/g, ''), lines = text.split('\n'), secs = [];
  let cur = null, round = null;
  for (const l of lines) {
    const h = l.match(/^(#{1,2}) (.*)$/);
    if (h) {
      const t = h[2], rm = t.match(/^Round (\d+)/i) || t.match(/^R(\d+)/);
      if (rm) round = 'R' + rm[1];
      cur = { round, title: t, level: h[1].length, md: '' }; secs.push(cur); continue;
    }
    if (cur) cur.md += l + '\n';
  }
  const rounds = {};
  for (const s of secs) { if (!s.round) continue; const r = rounds[s.round] || (rounds[s.round] = { id: s.round, n: +s.round.slice(1), title: s.title, at: null, sections: [] });
    r.sections.push({ title: s.title, md: s.md.trim() }); if (!r.at) r.at = ROUND_AT[s.round] || headingDate(s.title); }
  for (const a of ADOPTIONS) if (rounds[a.round]) rounds[a.round].adoptedAs = a.v;
  for (const [id, at] of Object.entries(ROUND_AT)) if (!rounds[id]) rounds[id] = { id, n: +id.slice(1), title: id, at, sections: [] };
  for (const r of Object.values(rounds)) { const a = r.sections.find(s => /^R\d+\b.*(—|-|:|\()/.test(s.title)) || r.sections[0]; if (a) r.title = a.title; r.adopted = !!r.adoptedAs || (/\badopted\b/i.test(r.title) && !/not adopted/i.test(r.title)); }
  return rounds;
}

// ---------- the shared queue branch ----------
function git(args, cwd, timeout) { return cp.execFileSync('git', args, { cwd, encoding: 'utf8', timeout: timeout || 20000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20,
  env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }), windowsHide: true }).trim(); }
function refreshView() {
  const stamp = path.join(VIEW, '.fetched');
  if (ARGS.has('--no-fetch')) return fs.existsSync(path.join(VIEW, '.git')) ? 'cached (no fetch)' : null;
  try {
    if (!fs.existsSync(path.join(VIEW, '.git'))) { fs.mkdirSync(VIEW, { recursive: true }); git(['init', '-q'], VIEW); git(['remote', 'add', 'origin', REPO], VIEW); }
    const last = +rd(stamp, '0'); if (Date.now() - last < 120e3) return 'fresh';
    git(['-c', 'credential.helper=', 'fetch', '-q', 'origin', '+refs/heads/queue:refs/remotes/origin/queue'], VIEW, 20000);
    fs.writeFileSync(stamp, String(Date.now())); return 'fetched';
  } catch (e) { return fs.existsSync(path.join(VIEW, '.git')) ? 'offline (last fetched copy)' : null; }
}
function readShared() {
  const how = refreshView(), out = { source: null, how, files: {}, history: [] };
  const viaView = () => { git(['rev-parse', '--verify', '-q', 'origin/queue'], VIEW, 5000);
    const names = git(['ls-tree', '-r', '--name-only', 'origin/queue'], VIEW).split('\n').filter(f => /^(claims|done|jobs)\/[^/]+\.json$|^registry\/[^/]+\.jsonl$|^results\/[^/]+\/QUEUE_LOG\.md$/.test(f));
    // one batch read of all blobs
    const blobs = cp.execFileSync('git', ['cat-file', '--batch'], { cwd: VIEW, input: names.map(n => 'origin/queue:' + n).join('\n') + '\n', maxBuffer: 64 << 20, windowsHide: true });
    let pos = 0; for (const n of names) { const nl = blobs.indexOf(10, pos), hdr = blobs.slice(pos, nl).toString().split(' '), size = +hdr[2];
      out.files[n] = blobs.slice(nl + 1, nl + 1 + size).toString('utf8'); pos = nl + 1 + size + 1; }
    out.history = git(['log', 'origin/queue', '--format=%aI|%s', '-n', '2000'], VIEW).split('\n').filter(Boolean).map(l => { const i = l.indexOf('|'); return { at: l.slice(0, i), msg: l.slice(i + 1) }; });
    out.source = '.dq-view (' + how + ')'; out.fetchedAt = new Date(+rd(path.join(VIEW, '.fetched'), '0') || Date.now()).toISOString();
  };
  try { if (how) { viaView(); return out; } } catch (e) {}
  const dq = path.join(ROOT, '.dq');   // a worker clone on this machine (read files only, never touch its git)
  if (fs.existsSync(path.join(dq, 'jobs'))) {
    for (const d of ['claims', 'done', 'jobs', 'registry']) for (const f of (() => { try { return fs.readdirSync(path.join(dq, d)); } catch (e) { return []; } })()) if (/\.jsonl?$/.test(f)) out.files[d + '/' + f] = rd(path.join(dq, d, f), '');
    out.source = '.dq worker clone (files only)';
  }
  return out;
}

// ---------- registry -> progress ----------
function taskLabel(t) {
  if (t == null) return null;
  if (typeof t === 'string' && t[0] !== '{') return { text: 'text@1000', order3: 'order3', order2: 'order2@300', cycle: 'cycle@300', bandit: 'bandit', cueR: 'cue', cue: 'cue', fables: 'fables@2000' }[t] || t;
  let o; try { o = typeof t === 'string' ? JSON.parse(t) : t; } catch (e) { return String(t).slice(0, 40); }
  const p = o.params || {};
  if (o.env === 'seq') { if (p.relabel) return null; const src = p.source || 'seq'; if (src === 'order3' || src === 'cycle') return p.nSyms ? `${src}@${p.nSyms}` : src; return `${src}@${p.nSyms || (src === 'fables' ? 2000 : src === 'text' ? 1000 : 200)}`; }
  if (o.env === 'seqchoice') return `${p.source || 'cycle'}@${p.nSyms || 300}` + (p.K ? ` K${p.K}` : '');
  if (o.env === 'bandit') return 'bandit' + (p.K && p.K !== 3 ? ` K${p.K}` : '') + (p.nTrials ? ` ${p.nTrials} trials` : '');
  if (o.env === 'cue') return 'cue' + (p.delay ? ` delay ${p.delay}` : '');
  return o.env + (p.source ? ' ' + p.source : '');
}
const TASK_INFO = {   // the main series of the Progress view (score = task score out of 10 unless noted)
  'text@1000': 'Text prediction, 1000-letter life', 'text@3000': 'Text prediction, 3000-letter life', 'order3': 'Every-third-symbol rule (order 3)',
  'fables@2000': 'Fables, 2000-letter life', 'cycle@300': 'Sequence choice: cycle (reward, 300 symbols)', 'order2@300': 'Sequence choice: order 2 (reward, 300 symbols)',
  'order2@1000': 'Sequence choice: order 2 (reward, 1000 symbols)', 'bandit': 'Bandit (3 arms)', 'cue': 'Cue-then-turn (random mapping)' };
function roundOfEntry(e, roundsSorted) {
  const m = String(e.source || '').match(/\br(\d{2})\b/i); if (m) return 'R' + m[1];
  const t = Date.parse(e.at); let best = null; for (const r of roundsSorted) if (r.at && Date.parse(r.at) <= t) best = r.id; return best;
}
function buildProgress(entries, rounds) {
  const rs = Object.values(rounds).filter(r => r.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const series = {};
  for (const e of entries) {
    if (!e.desc || e.desc.kind !== 'ablate' || !e.result || typeof e.result.mean !== 'number') continue;
    const task = taskLabel(e.desc.task); if (!task) continue;
    const round = roundOfEntry(e, rs);
    let at = e.at; if (e.source && round && rounds[round] && rounds[round].at && /^2026-10-13T12:30/.test(e.at)) at = rounds[round].at;   // backfilled lines: use their round's time
    const G = e.desc.G || (e.result.scores || []).length || 0;
    (series[task] || (series[task] = [])).push({ at, round, mean: +e.result.mean.toFixed(3), sd: e.result.sd != null ? +(+e.result.sd).toFixed(3) : null, G,
      plan: e.desc.plan, variant: String(e.desc.variant || '').replace(/\|r42 g0=\d+/, ''), dv: e.desc.defaults, by: e.by || e._from || null });
  }
  const out = [];
  for (const [task, pts] of Object.entries(series)) {
    pts.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let best = -Infinity; const steps = [];
    for (const p of pts) if (p.G >= 4 && p.mean > best) { best = p.mean; steps.push({ at: p.at, mean: p.mean, plan: p.plan, variant: p.variant, round: p.round, G: p.G }); }
    out.push({ task, label: TASK_INFO[task] || task, main: !!TASK_INFO[task], n: pts.length, best: isFinite(best) ? best : null, points: pts, steps });
  }
  return out.sort((a, b) => (b.main - a.main) || (Object.keys(TASK_INFO).indexOf(a.task) - Object.keys(TASK_INFO).indexOf(b.task)) || b.n - a.n);
}

// ---------- jobs + machines ----------
const shortJob = j => j && ({ id: j.id, title: j.title, question: j.question || null, priority: j.priority, kind: j.kind, auto: !!j.auto, idea: j.idea || null,
  estHours: j.estHours || (j.budget && j.budget.hours) || null, note: j.note || null, accept: j.accept && j.accept.note ? j.accept.note : null, after: j.after || null });
function buildJobsMachines(shared) {
  const host = os.hostname(), localName = process.env.BB_WORKER || host;
  const QS = rj(path.join(RES, 'queue_state.json'), { jobs: {} }), QJ = (() => { const t = rd(path.join(RES, 'queue.js'), ''); try { return JSON.parse(t.replace(/^window\.BB_QUEUE = /, '').replace(/;\s*$/, '')); } catch (e) { return null; } })();
  const qdir = path.join(ROOT, 'experiments', 'queue'), jobs = {};
  for (const f of (() => { try { return fs.readdirSync(qdir); } catch (e) { return []; } })()) if (f.endsWith('.json')) { const j = rj(path.join(qdir, f)); if (j && j.id) jobs[j.id] = Object.assign(shortJob(j), { where: 'local' }); }
  for (const [id, s] of Object.entries(QS.jobs || {})) { const j = jobs[id] || (jobs[id] = { id, title: id, where: 'local' });
    j.local = { status: s.status, startedAt: s.startedAt || null, endedAt: s.endedAt || null, pass: s.pass == null ? null : s.pass, why: s.why || null,
      error: s.error || null, champion: s.summary && s.summary.champion ? +(+s.summary.champion.val).toFixed(4) : null,
      results: s.results ? Object.values(s.results).map(r => ({ label: r.label, mean: r.mean, sd: r.sd, n: r.n, error: r.error ? true : undefined })) : null }; }
  // shared queue branch
  const F = shared.files, claims = {}, done = {};
  for (const [n, t] of Object.entries(F)) {
    let m;
    if ((m = n.match(/^jobs\/(.+)\.json$/))) { try { const j = JSON.parse(t); const o = jobs[j.id] || (jobs[j.id] = Object.assign(shortJob(j), {})); o.shared = o.shared || {}; o.where = o.local ? 'both' : 'shared'; if (o.title === o.id) Object.assign(o, shortJob(j)); } catch (e) {} }
    else if ((m = n.match(/^claims\/(.+)\.json$/))) { try { claims[m[1]] = JSON.parse(t); } catch (e) {} }
    else if ((m = n.match(/^done\/(.+)\.json$/))) { try { done[m[1]] = JSON.parse(t); } catch (e) {} }
  }
  const now = Date.now();
  for (const [id, c] of Object.entries(claims)) { const o = jobs[id] || (jobs[id] = { id, title: id, where: 'shared' }); o.shared = Object.assign(o.shared || {}, { claim: { worker: c.worker, at: c.at, renewed: c.renewed, until: c.until, platform: c.platform, expired: Date.parse(c.until) < now } }); }
  for (const [id, d] of Object.entries(done)) { const o = jobs[id] || (jobs[id] = { id, title: id, where: 'shared' }); o.shared = Object.assign(o.shared || {}, { done: { worker: d.worker, finishedAt: d.finishedAt, status: d.status, pass: d.pass,
    champion: d.summary && d.summary.champion ? +(+d.summary.champion.val).toFixed(4) : null } }); }
  for (const [n, t] of Object.entries(F)) { const m = n.match(/^results\/([^/]+)\/QUEUE_LOG\.md$/); if (m && jobs[m[1]]) { const parts = t.replace(/\r/g, '').split('\n## ').slice(1); const last = parts.filter(p => p.includes(m[1])).pop(); if (last) jobs[m[1]].sharedLog = '## ' + last.trim(); } }
  // status of each job in one word
  for (const j of Object.values(jobs)) {
    const s = j.shared || {}, l = j.local || {};
    j.status = s.done ? (s.done.status === 'done' ? 'done' : s.done.status) : s.claim && !s.claim.expired ? 'running' : l.status || (s.claim && s.claim.expired ? 'stale claim' : 'pending');
    if (l.status === 'running' && !s.done) j.status = 'running';
    if (l.status === 'done' || l.status === 'failed' || /skipped/.test(l.status || '')) j.status = l.status;
  }
  // machines: history of the shared branch (claim / result / release by WORKER)
  const M = {};
  const mach = (name, extra) => M[name] || (M[name] = Object.assign({ name, platform: null, kind: 'shared queue', running: [], done: [], events: [], lastSeen: null }, extra || {}));
  const seen = (m, at) => { if (!m.lastSeen || Date.parse(at) > Date.parse(m.lastSeen)) m.lastSeen = at; };
  const spans = {};   // job@worker -> { start, end }
  for (const h of shared.history.slice().reverse()) {
    const rel = h.msg.match(/^release (\S+)(?: (?!by \S+(?: \(|$)).*)?$/); if (rel) { for (const sp of Object.values(spans)) if (sp.job === rel[1] && !sp.end) { sp.end = h.at; sp.status = 'released'; } continue; }
    const m = h.msg.match(/^(claim|result|release|renew) (\S+) by (\S+)(?: \((.*)\))?/); if (!m) continue;
    const [, act, id, w, st] = m; const mm = mach(w); seen(mm, h.at);
    const k = id + '@' + w; if (act === 'claim') spans[k] = { job: id, worker: w, start: h.at, end: null, status: 'running' };
    else if (act === 'result' || act === 'release') { const sp = spans[k] || (spans[k] = { job: id, worker: w, start: null }); sp.end = h.at; sp.status = act === 'release' ? 'released' : (st || 'done'); }
  }
  for (const c of Object.values(claims)) { const mm = mach(c.worker); mm.platform = c.platform || mm.platform; mm.host = c.host; seen(mm, c.renewed || c.at);
    if (Date.parse(c.until) >= now && !done[c.id]) mm.running.push({ id: c.id, since: c.at, until: c.until }); }
  for (const d of Object.values(done)) { const mm = mach(d.worker); mm.done.push({ id: d.id, at: d.finishedAt, status: d.status, pass: d.pass }); seen(mm, d.finishedAt); }
  const allSp = Object.values(spans).filter(sp => sp.start || sp.end);
  for (const sp of allSp) { if (!sp.end) { const c = claims[sp.job], mine = c && c.worker === sp.worker && Date.parse(c.until) >= now && !done[sp.job];
      const later = allSp.filter(o => o.worker === sp.worker && o !== sp && o.start && Date.parse(o.start) > Date.parse(sp.start)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
      if (!mine || later) { sp.status = 'abandoned'; sp.end = later ? later.start : new Date(Math.min(now, Date.parse(sp.start) + 3600e3)).toISOString(); } }
    mach(sp.worker).events.push(sp); }
  // this machine's local queue
  const L = mach(localName + ' (local queue)', { kind: 'local queue', host, platform: process.platform, local: true });
  for (const [id, s] of Object.entries(QS.jobs || {})) {
    if (s.status === 'running') L.running.push({ id, since: s.startedAt });
    if (s.status === 'done') L.done.push({ id, at: s.endedAt, status: 'done', pass: s.pass == null ? null : s.pass });
    if (s.startedAt) { L.events.push({ job: id, worker: L.name, start: s.startedAt, end: s.endedAt || null, status: s.status }); seen(L, s.endedAt || s.startedAt); }
  }
  if (QJ) { L.queueUpdatedAt = QJ.updatedAt; L.paused = !!QJ.paused; L.state = QJ.state || null; seen(L, QJ.updatedAt); }
  if (!L.events.length && !QJ) delete M[L.name];
  for (const m of Object.values(M)) { m.running.sort((a, b) => Date.parse(b.since || 0) - Date.parse(a.since || 0));
    if (!m.local && m.running.length > 1) { m.held = m.running.slice(1); m.running = m.running.slice(0, 1); }   // older unexpired claims of the same worker: probably abandoned (restart), lease still open
    m.done.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); m.events.sort((a, b) => Date.parse(a.start || a.end) - Date.parse(b.start || b.end));
    const age = m.lastSeen ? (now - Date.parse(m.lastSeen)) / 3600e3 : Infinity;
    m.status = m.paused ? 'paused' : m.running.length ? 'running' : age < 6 ? 'idle' : 'offline'; m.doneCount = m.done.length; }
  for (const m of Object.values(M)) for (const h of m.held || []) if (jobs[h.id] && jobs[h.id].status === 'running') jobs[h.id].status = 'held (probably abandoned)';
  return { jobs: Object.values(jobs).sort((a, b) => (b.priority || 0) - (a.priority || 0)), machines: Object.values(M).sort((a, b) => (b.status === 'running') - (a.status === 'running') || b.doneCount - a.doneCount), localName };
}

// ---------- main ----------
function main() {
  const t0 = Date.now();
  const I = loadIdeas(), rounds = loadRounds(), shared = readShared();
  const local = rd(path.join(ROOT, 'experiments', 'registry.jsonl'), '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const fps = new Set(local.map(e => e.fp)), sharedReg = [];
  for (const [n, t] of Object.entries(shared.files)) if (n.startsWith('registry/')) for (const l of t.split('\n')) { if (!l.trim()) continue; try { const e = JSON.parse(l); if (!fps.has(e.fp)) { fps.add(e.fp); e._from = n.slice(9, -6); sharedReg.push(e); } } catch (e) {} }
  const progress = buildProgress(local.concat(sharedReg), rounds), JM = buildJobsMachines(shared);
  const log = rd(path.join(RES, 'QUEUE_LOG.md'), '').replace(/\r/g, '');
  const D = { writtenAt: new Date().toISOString(), host: os.hostname(), themes: THEMES, ideas: I.ideas, questions: I.questions,
    rounds, adoptions: ADOPTIONS, progress, jobs: JM.jobs, machines: JM.machines,
    registry: { local: local.length, shared: sharedReg.length },
    shared: { source: shared.source, fetchedAt: shared.fetchedAt || null, claims: Object.keys(shared.files).filter(n => n.startsWith('claims/')).length, history: shared.history.length },
    log: log.split('\n## ').slice(1).slice(-40).map(x => '## ' + x.trim()) };
  fs.mkdirSync(RES, { recursive: true });
  const tmp = path.join(RES, 'dashdata.js.tmp'), out = path.join(RES, 'dashdata.js');
  fs.writeFileSync(tmp, '/* generated by run/dashdata.js; do not edit */\nwindow.BB_DASH = ' + JSON.stringify(D) + ';\n');
  for (let i = 0; i < 5; i++) { try { fs.renameSync(tmp, out); break; } catch (e) { if (i === 4) fs.copyFileSync(tmp, out); } }
  say(`results/dashdata.js: ${D.ideas.length} ideas, ${Object.keys(rounds).length} rounds, ${progress.length} task series (${local.length}+${sharedReg.length} registry lines), ${D.jobs.length} jobs, ${D.machines.length} machines; shared queue: ${shared.source || 'not available'}; ${Date.now() - t0} ms`);
}
try { main(); } catch (e) { console.error('dashdata failed: ' + (e && e.stack || e)); process.exit(QUIET ? 0 : 1); }
