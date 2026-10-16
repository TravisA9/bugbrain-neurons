(function () {
'use strict';
/* =====================================================================
 * UI LAYER (browser only): draws and wires controls. The engine (js/core)
 * and the environments (js/envs) know nothing about the DOM.
 * ===================================================================== */
const SA = window.SpikingArena, P = SA.params;
const ENV = () => SA.currentEnv();
let lastDefaultPlan = null;   // v9: default plan of the current env settings (see onEnvParamChange)
const $ = id => document.getElementById(id);


/* ---------- state ---------- */
const LS_KEY = 'spikingArena.session.v7';
const LS_V6 = 'spikingArena.session.v5';    // v5/v6 sessions (read only: legacy/v6 still uses it)
const LS_OLD = 'spikingArena.session.v1';   // v1-v4 sessions (read only: never overwritten, the legacy page still uses it)
const UI_KEY = 'spikingArena.ui.v7';
const PREV_KEY = 'spikingArena.session.prev';   // v17: a session set aside (older version, replaced by a reset / task change); 'Restore previous session' loads it
const ui = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } })();
const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {} };
// v34 UI (Oct 16): Sequence prediction with the Text corpus is the first-open environment (main focus); applied once to remembered UI state too
if (!ui.env || ui.envDefaultV !== 1) { ui.env = 'text'; ui.envDefaultV = 1; }   // 'text' redirects to seq + source text (recommended settings) below
// v17: always start from the RECOMMENDED settings of the remembered environment (a redirecting env, e.g. the text stub, opens its target)
if (ui.env && SA.ENVS[ui.env]) { const r = SA.ENVS[ui.env].redirect; if (r && SA.ENVS[r.env]) { ui.env = r.env; SA.setEnv(r.env, SA.recommendedEnvParams(r.env, r.params, Object.keys(r.params))); } else SA.setEnv(ui.env, SA.recommendedEnvParams(ui.env)); }
ui.defaultsVersion = SA.DEFAULTS_VERSION;
let evo = null;
let running = false;
const rndSeed = () => (Math.random() * 1e9) | 0;
let watch = new SA.Agent(SA.planFor('env').make(), rndSeed());
let watchLabel = SA.planFor('env').label;
let lastTickRate = 0, tickCounter = 0, rateT0 = performance.now(), lastSave = '';

/* ---------- sliders & checkboxes (all write into SpikingArena.params) ----------
   v23 (round 24, standing UI principle): the brain should work with little or no intervention, so the drawer shows only a
   few playable variables. Everything else (growth-mechanism toggles, ruled-out mechanisms such as bilateral mirroring,
   hunger and request signals, the starting-plan selector, fitness-shaping weights, leak/substeps) keeps its parameter and
   code path (tests, legacy pages, session files) but has no control any more: the defaults are the best settings. */
const box = key => $('sl_' + key);
const SLIDERS = [
  ['popSize', 'Population', 10, 200, 1, 'Genomes per generation (takes effect next generation)'],
  ['cellMut', 'Mutation rate (per gene)', 0.005, 0.1, 0.005, 'Chance that each gene changes when a child is made'],
];
const sliderSync = [];
function makeSlider(parent, obj, key, name, min, max, step, note, onChange) {
  const lab = document.createElement('label'); lab.textContent = name;
  const inp = document.createElement('input'); Object.assign(inp, { type: 'range', min, max, step, value: obj()[key] });
  const val = document.createElement('span'); val.className = 'v'; val.textContent = obj()[key];
  inp.oninput = () => { obj()[key] = +inp.value; val.textContent = inp.value; if (onChange) onChange(); };
  const sync = () => { inp.value = obj()[key]; val.textContent = obj()[key]; };
  lab.title = inp.title = note || name; parent.append(lab, inp, val); return sync;
}
function makeCheck(parent, obj, key, text, onChange, tip) {
  const l = document.createElement('label'); l.className = 'chk full'; l.style.cssText = 'white-space:normal';
  const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!obj()[key];
  c.onchange = () => { obj()[key] = c.checked; if (onChange) onChange(); };
  l.title = c.title = tip || text;
  l.append(c, document.createTextNode(' ' + text)); parent.append(l); return () => { c.checked = !!obj()[key]; };
}
function makeSelect(parent, obj, key, label, opts, onChange, first, tip) {
  const l = document.createElement('label'); l.className = 'chk full';
  const sel = document.createElement('select'); sel.style.maxWidth = '100%';
  sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  sel.value = obj()[key]; sel.onchange = () => { obj()[key] = sel.value; if (onChange) onChange(); };
  l.title = sel.title = tip || label.replace(/: $/, '');
  l.append(document.createTextNode(label), sel); if (first) parent.insertBefore(l, parent.firstChild); else parent.append(l);
  return () => { sel.value = obj()[key]; };
}
const PP = () => P;
for (const [key, name, min, max, step, note] of SLIDERS) sliderSync.push(makeSlider(box('evo'), PP, key, name, min, max, step, note));
sliderSync.push(makeCheck(box('evo'), PP, 'plasticity', 'Lifetime learning (dopamine-gated plasticity)', null,
  'On: every brain also learns during its lifetime from reward (the default). Off: behaviour comes from the grown wiring alone.'));
// v23: the environment settings shown per task (the playable variables); every other env param keeps its recommended value
const ENV_UI = {
  cue: ['delay', 'nTrials', 'mapping'],
  recall: ['K', 'delay', 'nTrials', 'mapping'],
  seq: ['source', 'K', 'det', 'nSyms'],
  bandit: ['C', 'K', 'switchEvery', 'nTrials', 'delay'],
  bug: ['task', 'episodeTicks', 'reversal', 'randomValence'],
  text: ['nChars'],
};
/* ---------- environment selector + environment-specific settings (generated from the env's declared params) ---------- */
const envSel = $('selEnv');
// v17: an env with a redirect (the never-learning text stub) is listed under its useful form and opens its target with the recommended settings
// v34 UI: the text stub (duplicate of Sequence -> Text corpus) and the ruled-out chunker (I51) are not listed (code kept)
const UI_HIDDEN_ENVS = ['text', 'chunk'];
envSel.innerHTML = SA.envList().filter(d => !UI_HIDDEN_ENVS.includes(d.id) || d.id === P.env).map(d => `<option value="${d.id}">${d.name}</option>`).join('');
document.title = `Spiking Arena ${SA.APP_VERSION} — grown spiking brains, any environment`;
envSel.value = P.env;
envSel.onchange = () => { const id = envSel.value, r = SA.ENVS[id].redirect; envSel.value = P.env;
  if (r) switchEnv(r.env, SA.recommendedEnvParams(r.env, r.params, Object.keys(r.params)), 'Switched environment');
  else switchEnv(id, null, 'Switched environment'); };
let envSync = [];
function buildEnvControls() {
  const env = ENV(), host = $('sl_task'); host.innerHTML = ''; envSync = [];
  const d = document.createElement('div'); d.className = 'note full'; d.textContent = env.def.description || ''; host.append(d);
  const EP = () => ENV().P, changed = () => onEnvParamChange();
  const shown = ENV_UI[env.id];
  for (const [key, m] of Object.entries(env.def.params || {})) {
    if (m.hidden || (shown && !shown.includes(key))) continue;
    if (m.options) envSync.push(makeSelect(host, EP, key, (m.label || key) + ': ', m.options, changed));
    else if (typeof m.value === 'boolean') envSync.push(makeCheck(host, EP, key, m.label || key, changed));
    else envSync.push(makeSlider(host, EP, key, m.label || key, m.min, m.max, m.step, m.note, changed));
  }
  $('secTaskTitle').textContent = 'Environment: ' + env.def.name;
}
// a setting changed: the watched brain gets a fresh episode (and is regrown if the I/O changed)
let envParamTimer = 0, lastRec = null;
const recSig = () => { const e = ENV(); return e.def.recommend ? JSON.stringify(e.def.recommend(e.P)) : ''; };
// v9: an env can pick its default plan from its params (seq: big alphabet / text -> predictKL); follow such a change
// v17 (round 18): (a) a task change that changes the env's RECOMMENDED settings applies them (seq: Text -> two-phase clock,
// 1000 symbols); (b) a change of the default plan ALWAYS starts a population from the new plan and watches the plan itself.
// Before v17 an evolved session (gen > 0) kept its old champion here ("press Reset"): an old cycle/K=4 champion
// was then watched on text and predicted ~8% right (round 18 reproduction).
function onEnvParamChange() { clearTimeout(envParamTimer); envParamTimer = setTimeout(() => {
  const env = ENV(); let note = '';
  if (env.def.recommend && recSig() !== lastRec) {
    const rec = env.def.recommend(env.P), ch = Object.entries(rec).filter(([k, v]) => env.P[k] !== v);
    if (ch.length) { SA.setEnv(env.id, rec); buildEnvControls(); note = `Recommended for this task: ${ch.map(([k, v]) => (env.def.params[k].label || k).replace(/ \(.*$/, '') + ' = ' + (v === true ? 'on' : v)).join(', ')}. `; }
  }
  lastRec = recSig();
  const dp = SA.defaultPlanId(ENV());
  if (lastDefaultPlan && dp !== lastDefaultPlan && (P.cellStart === 'env' || !P.cellStart)) {
    const kept = stashSession();
    watch = new SA.Agent(SA.planFor('env').make(), rndSeed()); watchLabel = SA.planFor('env').label + ' (the default plan, unmutated)'; resetRaster(); buildPlanButtons();
    useEvolution(new SA.Evolution(), note + `Default plan is now ${SA.planFor('env').label}: new population of ${P.popSize} genomes. Press ▶ Evolve.` +
      (kept ? ' The previous population was set aside (Restore previous session).' : ''));
    return;
  }
  lastDefaultPlan = dp; if (note) msg(note);
  const g = watch.genome; watch = new SA.Agent(g, rndSeed()); resetRaster(); }, 150); }
// switch to another environment: a population is tied to its environment, so this starts a new one
function switchEnv(id, envP, note) {
  if (id === P.env && !envP) return true;
  if (id !== P.env && evo && evo.gen > 0 && !confirm(`Switch to "${SA.ENVS[id].name}"? This starts a new population (the current one can be brought back with Restore previous session).`)) return false;
  stashSession();
  SA.setEnv(id, envP || SA.recommendedEnvParams(id)); ui.env = id; saveUi(); envSel.value = id; buildEnvControls(); lastRec = recSig();   // v17: the env's recommended settings
  watch = new SA.Agent(SA.planFor('env').make(), rndSeed()); watchLabel = SA.planFor('env').label; resetRaster(); buildPlanButtons(); fitArena();
  useEvolution(new SA.Evolution(), `${note}: ${SA.ENVS[id].name}. New population of ${P.popSize} genomes (${SA.planFor(P.cellStart).label}). Press ▶ Evolve.`);
  return true;
}
const syncControls = () => { sliderSync.forEach(f => f()); envSel.value = P.env; buildEnvControls(); buildPlanButtons(); fitArena(); };
/* ---------- settings drawer (open state remembered) + tabs ---------- */
function setDrawer(open) { ui.settingsOpen = open; $('drawer').classList.toggle('open', open); saveUi(); }
$('btnSettings').onclick = () => setDrawer(!$('drawer').classList.contains('open'));
$('btnCloseSettings').onclick = () => setDrawer(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });
setDrawer(!!ui.settingsOpen);
for (const d of document.querySelectorAll('.drawer details')) {
  if (ui['sec_' + d.id] != null) d.open = ui['sec_' + d.id];
  d.addEventListener('toggle', () => { ui['sec_' + d.id] = d.open; saveUi(); });
}
function setTab(id) { ui.tab = id; saveUi();
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === id);
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.id === id); }
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => setTab(b.dataset.tab);
setTab(ui.tab || 'tabBrain');

function msg(t) { $('msg').textContent = t; }
function download(obj, name) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- session: auto-save / restore ---------- */
// v17 (round 18): sessions carry appVersion + defaultsVersion + the default plan id at save time. On load only a session
// saved with the CURRENT defaults (and whose env settings still map to the same default plan) is restored; anything older
// is set aside and the app starts from the recommended settings, with a 'Restore previous session' button.
let prevSrc = null;
function showRestore(key, what) { prevSrc = key; const b = $('btnRestorePrev'); b.hidden = !key; if (key) b.title = 'Load ' + what + ' (its own settings replace the recommended ones)'; }
function stashSession() {
  if (!evo || evo.gen === 0) return false;
  try { localStorage.setItem(PREV_KEY, JSON.stringify(evo.toJSON())); showRestore(PREV_KEY, `the session set aside (generation ${evo.gen})`); return true; }
  catch (e) { msg('Could not set the old session aside (' + e.name + '); use Export session to keep it.'); return false; }
}
function sessionIsCurrent(obj) {
  if (!obj || obj.defaultsVersion !== SA.DEFAULTS_VERSION || !SA.ENVS[obj.env]) return false;
  const def = SA.ENVS[obj.env], P2 = Object.assign(SA.envDefaults(obj.env), obj.envParams || {});
  const d = typeof def.defaultPlan === 'function' ? def.defaultPlan(P2) : def.defaultPlan;
  return !obj.defaultPlan || d === obj.defaultPlan;
}
$('btnRestorePrev').onclick = () => {
  const t = prevSrc && localStorage.getItem(prevSrc); if (!t) { showRestore(null); return msg('Nothing to restore.'); }
  if (evo && evo.gen > 0 && prevSrc !== PREV_KEY) stashSession();
  try {
    const obj = JSON.parse(t), src = prevSrc, e = SA.Evolution.fromJSON(obj, true); afterSessionLoad();
    useEvolution(e, `Restored the previous session (${ENV().def.name}, saved with ${obj.appVersion || 'an older version'}): ${e.pop.length} brains at generation ${e.gen}` +
      (e.champion ? `, champion ${e.champion.val.toFixed(2)}` : '') + '. Its settings are active now; Settings → Reset to recommended settings goes back.');
    if (src !== PREV_KEY) showRestore(null); else $('btnRestorePrev').hidden = true;
    saveSession();
  } catch (err) { msg('Could not restore: ' + err.message); }
};
function saveSession() {
  try { const t = JSON.stringify(evo.toJSON()); localStorage.setItem(LS_KEY, t); lastSave = `gen ${evo.gen}, ${(t.length / 1024).toFixed(0)} KB`; }
  catch (e) { lastSave = 'FAILED (' + e.name + '): use Export session instead'; }
}
function useEvolution(e, note) {
  evo = e; if (!ui.fast) drawChart();
  if (evo.champion) showWatched('champion');
  msg(note);
}
// after a session was loaded (its environment may differ): rebuild env-dependent UI + the watched brain
function afterSessionLoad() {
  ui.env = P.env; saveUi(); syncControls(); lastRec = recSig();
  watch = new SA.Agent(SA.planFor('env').make(), rndSeed()); watchLabel = SA.planFor('env').label; resetRaster();
}
function restoreOrNew() {
  let legacyNote = '', offer = '';
  for (const key of [LS_KEY, LS_V6, LS_OLD]) {
    const t = localStorage.getItem(key); if (!t) continue;
    let obj = null; try { obj = JSON.parse(t); } catch (e) { if (key === LS_KEY) break; continue; }
    if (key !== LS_KEY || !sessionIsCurrent(obj)) {   // v17: older version / older defaults: set aside, offer it
      try {
        SA.Evolution.fromJSON(obj, false);             // restorable at all? (no side effects without restoreParams)
        if (key === LS_KEY) localStorage.setItem(PREV_KEY, t);   // the first auto-save of the new session overwrites LS_KEY
        const what = `your saved ${key === LS_OLD ? 'v4 cellular' : key === LS_V6 ? 'v6' : obj.appVersion || 'older'} session (${SA.ENVS[obj.env] && /v7$/.test(obj.format) ? SA.ENVS[obj.env].name : 'bug arena'}, generation ${obj.gen || 0})`;
        showRestore(key === LS_KEY ? PREV_KEY : key, what);
        offer = ` Started with the current recommended settings; ${what} was made with older settings and is kept: ↶ Restore previous session loads it.`;
      } catch (err) {
        console.warn('could not restore session', err.message);
        if (key === LS_OLD && err.message === SA.LEGACY_MSG) legacyNote = ' Your older saved session uses legacy (non-cellular) brains; it is untouched and still opens in legacy/index_v4_legacy.html.';
        if (key === LS_KEY) break;
        continue;
      }
      break;
    }
    try {
      const e = SA.Evolution.fromJSON(t, true); afterSessionLoad();
      useEvolution(e, `Restored your saved ${key === LS_OLD ? 'older (v4) cellular ' : key === LS_V6 ? 'v6 ' : ''}session (${ENV().def.name}): ${e.pop.length} brains at generation ${e.gen}` +
        (e.champion ? `, champion scores ${e.champion.val.toFixed(2)}` : '') + (key === LS_OLD ? ' (task set to Normal, single growth, as it was evolved)' : '') + '. Press ▶ Evolve to continue.');
      return;
    } catch (err) {
      console.warn('could not restore session', err.message);
      if (key === LS_OLD && err.message === SA.LEGACY_MSG) legacyNote = ' Your older saved session uses legacy (non-cellular) brains; it is untouched and still opens in legacy/index_v4_legacy.html.';
      if (key === LS_KEY) break;
    }
  }
  watchLabel = SA.planFor('env').label + ' (the default plan, unmutated)';
  useEvolution(new SA.Evolution(), `${ENV().def.name}: new population of ${P.popSize} cellular genomes (${SA.planFor(P.cellStart).label}). Press ▶ Evolve.` + offer + legacyNote);
}
// v17: Settings → Reset to recommended settings: engine params = PARAM_DEFAULTS, env params = recommended (keeping the
// env and its task choice), a new population from the default plan; the old session is set aside (restorable)
$('btnRecommended').onclick = () => {
  const kept = stashSession(), env = ENV();
  for (const k in SA.PARAM_DEFAULTS) if (k !== 'env') P[k] = SA.PARAM_DEFAULTS[k];
  SA.setEnv(env.id, SA.recommendedEnvParams(env.id, Object.assign({}, env.P)));
  afterSessionLoad(); watchLabel = SA.planFor('env').label + ' (the default plan, unmutated)';
  useEvolution(new SA.Evolution(), `Recommended settings: ${ENV().def.name}, default plan ${SA.planFor('env').label}, new population of ${P.popSize}. Press ▶ Evolve.` + (kept ? ' The previous session was set aside (Restore previous session).' : ''));
};

/* ---------- what are we watching? ---------- */
function setWatched(g, label) { if (watch.genome !== g) { watch = new SA.Agent(g, rndSeed()); resetRaster(); } watchLabel = label; }
function showWatched(mode) {
  if (mode) $('selWatch').value = mode;
  const m = $('selWatch').value;
  if (m === 'champion' && evo.champion) setWatched(evo.champion.genome, `all-time champion (found gen ${evo.champion.gen}, validation score ${evo.champion.val.toFixed(2)})`);
  if (m === 'latest' && evo.latestBest) setWatched(evo.latestBest, `best of generation ${evo.gen - 1}`);
}
$('selWatch').onchange = () => showWatched();

/* ---------- buttons ---------- */
$('btnRun').onclick = () => { running = !running; $('btnRun').textContent = running ? '⏸ Pause' : '▶ Evolve'; };
$('btnReset').onclick = () => {
  if (!confirm('Throw away the current population and champion and start a new population from the default plan?\n(Export session first if you want to keep it.)')) return;
  useEvolution(new SA.Evolution(), `Reset: ${P.popSize} cellular genomes (${P.cellStart === 'random' ? 'random' : 'mutants of ' + SA.planFor(P.cellStart).label}), each grown ${P.growths}× per generation.`);
  // v16: watch the starting plan itself (the population holds its mutants, and a mutant can be broken)
  if (P.cellStart !== 'random') setWatched(SA.planFor(P.cellStart).make(), SA.planFor(P.cellStart).label + ' (the starting plan, unmutated)');
  else setWatched(evo.pop[0], 'first genome of the new population');
};
$('btnSeedChamp').onclick = () => {
  if (!evo.champion) return msg('No champion yet. Let at least one generation finish.');
  evo.seedWith(evo.champion.genome); msg(`Population replaced by the champion + ${evo.pop.length - 1} mutants. Generation ${evo.gen} restarts.`);
};
$('btnSeedWatched').onclick = () => {
  evo.seedWith(SA.cloneGenome(watch.genome)); msg(`Population replaced by the watched brain (${watchLabel}) + mutants.`);
};
$('btnNewWorld').onclick = () => { const g = watch.genome; watch = new SA.Agent(g, rndSeed()); };
$('btnExportSession').onclick = () => download(evo.toJSON(), `spiking-session-gen${evo.gen}.json`);
$('btnExportChamp').onclick = () => {
  if (!evo.champion) return msg('No champion yet.');
  download(SA.genomeToJSON(evo.champion.genome, { kind: 'champion', generation: evo.champion.gen, validation: evo.champion.val, params: Object.assign({}, P) }), `spiking-${P.env}-champion-gen${evo.champion.gen}.json`);
};
$('btnExportWatched').onclick = () => download(SA.genomeToJSON(watch.genome, { label: watchLabel, params: Object.assign({}, P) }), 'spiking-brain.json');
function loadBrain(obj, source) {
  const f = SA.brainFromFile(obj), g = f.genome;
  if (f.env !== P.env && SA.ENVS[f.env]) { if (!switchEnv(f.env, f.envParams, `"${source}" was made for another environment; switched`)) return; }
  $('selWatch').value = 'loaded'; setWatched(g, source);
  const b = SA.phenotype(g);
  msg(`Loaded ${source} (cellular genome: regrown from its DNA): ${b.nHid} hidden neurons, ${SA.countSynapses(g)} synapses` +
      (b.skippedEdges ? `, ${b.skippedEdges} edges skipped (unknown ids)` : '') + (b.locked ? ', topology locked' : '') +
      '. Now watching it. Use "Seed from watched brain" to evolve from it.');
}
function importText(text, source) {
  try {
    const obj = JSON.parse(text);
    if (/^spiking-arena-session\/v\d$/.test(obj.format)) {
      if (!confirm(`Replace the current session with "${source}" (generation ${obj.gen})?`)) return;
      const e = SA.Evolution.fromJSON(obj, true); afterSessionLoad();
      useEvolution(e, `Imported session ${source}: generation ${e.gen}, ${e.pop.length} brains. Press ▶ Evolve to continue.`);
      saveSession();
    } else loadBrain(obj, source);
  } catch (e) { msg((e.message === SA.LEGACY_MSG ? '' : 'Import failed: ') + e.message); }
}
$('fileIn').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => importText(t, f.name)); e.target.value = ''; };

/* ---------- development view (cellular genomes): compact TissueView (js/ui/devview.js, v18) ---------- */
const dev = { genome: null, key: null, brain: null, model: null, frame: 0, playing: true, last: 0 };
const TAG_COLORS = ['#b8a8e0', '#4cd964', '#ff5a5a', '#ff9f43', '#ffd34d', '#f7f06d', '#ffffff', '#4dd2ff'];
const devTV = new SA.TissueView($('devCanvas'), { layers: { chem: -1, labels: false }, empty: 'The watched brain was not grown from a cellular genome.',
  onSelect: h => devInfoUpdate(h), onHover: h => { $('devCanvas').title = h && dev.model ? SA.devDescribe(dev.model, h, Math.floor(dev.frame)).replace(/<[^>]+>/g, '') : ''; } });
// v23: a compact tab: the growth plays once by itself; one Play/Replay button and a timeline slider (full controls: viewer.html)
const DEV_SPEED = 6;   // growth steps per second
const devBtn = () => { $('devPlay').textContent = dev.playing ? '⏸ Pause' : dev.model && dev.frame >= dev.model.TT - 1 ? '⟲ Replay' : '▶ Play'; };
$('devPlay').onclick = () => { if (!dev.playing && dev.model && dev.frame >= dev.model.TT - 1) dev.frame = 0; dev.playing = !dev.playing; devBtn(); };
$('devSlider').oninput = () => { dev.playing = false; dev.frame = +$('devSlider').value; devBtn(); };
// hand the watched brain to the growth viewer (viewer.html) through localStorage, then open it
$('devViewer').onclick = () => {
  if (watch.genome.kind !== 'cell' && watch.genome.kind !== 'regions') return msg('The watched brain is not a cellular genome.');
  try { localStorage.setItem('spikingArena.viewer', JSON.stringify({ format: 'spiking-arena-viewer/v1', genome: SA.genomeToCompact(watch.genome), env: P.env, envParams: Object.assign({}, ENV().P),
    params: Object.assign({}, P), label: watchLabel, savedAt: new Date().toISOString() })); } catch (e) { return msg('Could not hand the brain to the viewer: ' + e.message); }
  window.open('viewer.html#arena', '_blank');
};
$('lnkViewer').onclick = e => { e.preventDefault(); $('devViewer').click(); };
function buildPlanButtons() { lastDefaultPlan = SA.defaultPlanId(ENV()); }   // v23: the plan buttons left the UI (the env's default plan is always used)
function devRefresh() {
  const g = watch.genome; if (dev.genome === g && dev.key === ENV().spec.key) return;
  dev.genome = g; dev.key = ENV().spec.key; dev.frame = 0; dev.playing = true;   // auto-plays once
  if (g.kind === 'cell' || g.kind === 'regions') { dev.brain = SA.growCell(g, { record: true }); dev.model = SA.DevModel(dev.brain, ENV().spec);
    if (dev.model.sub) { dev.brain = dev.model.regions[dev.model.outRegion].brain; dev.model = dev.model.sub[dev.model.outRegion]; }   // v21 multi-region brain: the output region's tissue (all regions: the growth viewer)
    devTV.setModel(dev.model); $('devSlider').max = dev.model.TT - 1; }
  else { dev.brain = null; dev.model = null; devTV.m = null; devTV.dirty = true; }
  devInfoUpdate(null);
}
function devTick(now) {
  if (ui.tab !== 'tabDev') { dev.last = now; return; }     // v18: grown + recorded only while the tab is open
  devRefresh();
  const dt = Math.min(100, now - (dev.last || now)); dev.last = now;
  if (dev.model && dev.playing) { dev.frame = Math.min(dev.model.TT - 1, dev.frame + dt / 1000 * DEV_SPEED); if (dev.frame >= dev.model.TT - 1) dev.playing = false; }
  if (dev.model) { $('devSlider').value = dev.frame; const s = dev.model.stageAt(Math.floor(dev.frame)); if ($('devStage').textContent !== s.split(':')[0]) $('devStage').textContent = s.split(':')[0]; devBtn(); }
  if (dev.model) { const f0 = Math.floor(devTV.f); devTV.setFrame(dev.frame); if (Math.floor(dev.frame) !== f0) devInfoUpdate(devTV.sel); }
  devTV.draw();
}
function devInfoUpdate(sel) {
  const m = dev.model; if (!m) { $('devInfo').innerHTML = ''; return; }
  const f = Math.floor(dev.frame), st = dev.brain.devStats, alive = m.cells.filter(c => c.moves.length && f >= c.from && f < c.to), nNeu = alive.filter(c => SA.devCellState(c, f)[1]).length;
  let nSyn = 0; for (let k = 0; k < m.syn.n; k++) if (m.syn.a[k * 7 + 2] <= f && !(m.syn.end[k] >= 0 && m.syn.end[k] <= f)) nSyn++;
  const dead = m.cells.filter(c => c.died >= 0 && c.died <= f);
  $('devInfo').innerHTML = `<b>${dev.genome.label || 'cellular genome'}</b> · ${SA.genomeParamCount(dev.genome)} genome numbers · <i>${m.stageAt(f)}</i><br>` +
    `cells alive <b>${alive.length}</b> (neurons ${nNeu}, progenitors ${alive.length - nNeu}) · synapses <b>${nSyn}</b> · deaths ${dead.filter(c => c.cause === 'apoptosis').length} programmed, ${dead.filter(c => c.cause !== 'apoptosis').length} trophic / afferent` +
    (f >= m.TT - 1 ? `<br><b>Final brain:</b> ${st.survivors} hidden neurons, ${st.synapses} synapses, ${st.refinePruned} pruned by juvenile activity; grown in ${st.ms.toFixed(0)} ms` : '') +
    (sel ? '<br>' + SA.devDescribe(m, sel, f) : '');
}

/* ---------- raster ring buffer ---------- */
const RT = 400; let rN = 0, rBuf = null, rPos = 0;
const flash = { a: new Float32Array(0) };
function resetRaster() { rN = watch.net.N; rBuf = new Uint8Array(RT * rN); rPos = 0; flash.a = new Float32Array(rN); if (!ui.fast) layoutBrain(); }   // v24: no layout (canvas work) in fast mode
function recordSubstep(net) {
  if (net.N !== rN) resetRaster();
  const base = rPos * rN, sp = net.spiked, f = flash.a;
  for (let i = 0; i < rN; i++) { rBuf[base + i] = sp[i]; f[i] = sp[i] ? 1 : f[i] * 0.85; }
  rPos = (rPos + 1) % RT;
}

function rasterSpikesPerTick() { let s = 0; if (rBuf) for (let i = 0; i < rBuf.length; i++) s += rBuf[i]; return s / (RT / P.substeps); }

/* ---------- main loop ---------- */
// v24 fast mode: no drawing at all (no canvas calls, no per-frame DOM writes), no display-only recording (raster, flash,
// learning traces); the watched brain runs as many ticks as fit in the frame budget; a text panel updates at 4 Hz.
// The simulation itself is untouched (the substep hook only reads spikes), so results are bit-identical in both modes.
let watchTicks = 0, watchRate = 0;
function frame() {
  const t0 = performance.now(), fast = !!ui.fast, watching = $('chkWatch').checked;
  if (running) {
    const budget = fast ? 50 : $('chkFast').checked ? 40 : 8;   // ms of evolution work per frame
    while (performance.now() - t0 < budget) {
      const before = evo.ticksDone;
      if (evo.run(100)) onGeneration();
      tickCounter += evo.ticksDone - before;
    }
  }
  if (watching && fast) {
    const tEnd = t0 + 55;
    do { for (let i = 0; i < 10; i++) { watch.tick(); watchTicks++; if (watch.done) { endLifetime(); break; } } } while (performance.now() < tEnd);
  } else if (watching) {
    const n = +$('selSpeed').value;
    for (let i = 0; i < n; i++) {
      watch.tick(recordSubstep); watchTicks++;
      recordLearning();
      if (watch.done) endLifetime();   // lifetimes match evaluation: weights reset after
    }
    drawArena(); drawBrain(); drawRaster(); drawOutputs(); drawLearning(); devTick(performance.now());
  }
  const now = performance.now();
  if (now - rateT0 > 1000) { lastTickRate = tickCounter * 1000 / (now - rateT0); watchRate = watchTicks * 1000 / (now - rateT0); tickCounter = 0; watchTicks = 0; rateT0 = now; }
  if (fast) drawFast(); else { drawStats(); if (running && !evo.history.length) drawChart(); }
  // v24: fast mode schedules the next frame through a message (no wait for the next display refresh; ~55 ms of work per
  // task keeps the page responsive); normal mode stays on requestAnimationFrame
  if (fast) fastChan.port2.postMessage(0); else requestAnimationFrame(frame);
}
const fastChan = new MessageChannel(); fastChan.port1.onmessage = () => frame();
// v24: switching modes never touches the brain or the population (only what is drawn)
function setFastMode(on) {
  ui.fast = !!on; saveUi(); $('chkFastMode').checked = ui.fast; document.body.classList.toggle('fast', ui.fast); fastT = 0;
  if (!ui.fast) { resetRaster(); drawChart(); }
}
$('chkFastMode').onchange = () => setFastMode($('chkFastMode').checked);
/* ---------- fast mode: compact results panel (text only) ---------- */
let fastT = 0;
const lifeLog = { genome: null, list: [] };   // finished lifetimes of the watched genome: { v, seed, label }
const SPARK = '▁▂▃▄▅▆▇█';
// the env's headline number for one lifetime (seq/text: accuracy; bandit: best-arm rate; cue/recall: pass rate; else: score)
function lifeValue(t) {
  if (t.optRate != null) return { v: t.optRate, pct: true, name: 'best arm' };
  if (t.passRate != null) return { v: t.passRate, pct: true, name: 'pass' };
  if (t.accuracy != null) return { v: t.accuracy, pct: true, name: 'accuracy' };
  return { v: t.score ? t.score() : t.fitness(), pct: false, name: 'score' };
}
const fmtV = (x, pct) => pct ? (100 * x).toFixed(1) + '%' : (+x).toFixed(2);
const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const symTxt = (t, k) => k == null || k < 0 || !t.names ? '·' : (n => n === ' ' ? '␣' : n === '\n' ? '¶' : n)(String(t.names[k]));
// v25: two aligned rows: each prediction sits under the input it predicted (made one step earlier); green = matches the input above
function seqRows(t) {
  const rec = t.recent.slice(-50), ins = rec.length ? rec.map(r => r[0]).concat([rec[rec.length - 1][3]]) : [], prd = ins.map((_, j) => j ? rec[j - 1][1] : null);
  const w = Math.max(1, ...ins.map(k => symTxt(t, k).length), ...prd.map(k => k == null ? 1 : symTxt(t, k).length));
  const cell = (x, cls) => `<span class="${cls}">${esc(x.padEnd(w))}</span>`;
  return `<div class="seqrow"><span class="dim">input      </span>${ins.map(k => cell(symTxt(t, k), 'in')).join(' ')}\n` +
    `<span class="dim">prediction </span>${prd.map((k, j) => j ? cell(symTxt(t, k), k === ins[j] ? 'ok' : 'bad') : cell(' ', 'none')).join(' ')}</div>`;
}
function drawFast() {
  const now = performance.now(); if (now - fastT < 250) return; fastT = now;
  const t = watch.task, lv = lifeValue(t), L = lifeLog.genome === watch.genome ? lifeLog.list : [], h = evo.history, last = h[h.length - 1], ch = evo.champion;
  const isSeq = !!(t.recent && t.lastAcc && t.names);
  const prog = isSeq ? `symbol ${Math.min(t.pos + 1, t.P.nSyms)} / ${t.P.nSyms}` : t.statusLine ? t.statusLine() : 't ' + t.t;
  let html = `<div class="note">⚡ Fast mode: drawing is off; the numbers below update 4×/s. Watching: ${esc(watchLabel)}</div>`;
  if (isSeq) html += `<table style="margin:8px 0"><tr><td>accuracy so far<br><span class="big" id="fpAcc">${t.n ? (100 * t.accuracy).toFixed(1) + '%' : '–'}</span></td>` +
      `<td>last 100<br><span class="big" id="fpLast">${t.n ? (100 * t.lastAcc(100)).toFixed(1) + '%' : '–'}</span></td><td>lifetime progress<br><span class="big" id="fpProg">${prog}</span></td></tr></table>` +
      `<div class="note">recent steps (each prediction sits under the symbol it predicted: green = right, red = wrong):</div>` + seqRows(t);
  else html += `<div style="margin:8px 0"><span class="big" id="fpAcc">${t.keyStats ? esc(t.keyStats()) : fmtV(lv.v, lv.pct)}</span></div><div id="fpProg">${esc(prog)}</div>`;
  const vals = L.map(e => e.v), lo = Math.min(...vals, lv.pct ? 0 : Infinity), hi = Math.max(...vals, lv.pct ? 1 : -Infinity);
  html += `<div style="margin-top:10px">lifetimes completed: <b id="fpLives">${L.length}</b>` + (L.length ? ` · ${lv.name} per lifetime <span class="spark">${vals.slice(-40).map(v => SPARK[Math.max(0, Math.min(7, Math.round((v - lo) / ((hi - lo) || 1) * 7)))]).join('')}</span>` +
      `<div class="note" id="fpList">${L.slice(-12).map(e => fmtV(e.v, lv.pct)).join(' · ')}</div>` : '') + '</div>';
  html += `<div style="margin-top:10px">simulation: watched brain <b id="fpRate">${watchRate | 0}</b> ticks/s` + (running ? ` · evolution <b>${lastTickRate | 0}</b> ticks/s` : '') + '</div>';
  if (running || h.length) html += `<div>evolution: generation <b>${evo.gen}</b> (${(evo.progress() * 100).toFixed(0)}%) · champion <b>${ch ? ch.val.toFixed(2) : '–'}</b>` +
      (last ? ` · last generation best ${last.best.toFixed(2)}, average ${last.avg.toFixed(2)}` : '') + (running ? '' : ' (paused)') + '</div>';
  $('fastPanel').innerHTML = html;
  $('statline').innerHTML = `gen <b>${evo.gen}</b> · champion <b>${ch ? ch.val.toFixed(2) : '–'}</b> · watched: <b>${t.keyStats ? t.keyStats() : ''}</b>`;
}
function onGeneration() {
  if (!ui.fast) drawChart(); saveSession();
  const m = $('selWatch').value;
  if (m === 'champion' || m === 'latest') showWatched();
}

/* ---------- lifetime learning read-out ---------- */
const LT = 400, modBufs = Array.from({ length: 4 }, () => new Float32Array(LT)), dwBuf = new Float32Array(LT), valBuf = new Float32Array(LT); let lPos = 0;
const lifetimes = [];   // finished watched lifetimes: { first, second } (food - poison per half)
function recordLearning() { const m = watch.net.mods; for (let c = 0; c < 4; c++) modBufs[c][lPos] = c < m.length ? m[c] : 0; dwBuf[lPos] = watch.net.dwSum; valBuf[lPos] = watch.net.crit ? watch.net.value : 0; lPos = (lPos + 1) % LT; }
// reward collected in the first vs second half of the episode (task.rewardLog = [tick, reward])
function halfScores(w) {
  const h = (w.horizon || 1000) / 2, log = w.rewardLog || [];
  let a = 0, b = 0; for (const [t, r] of log) { if (t < h) a += r; else b += r; }
  return { first: +a.toFixed(2), second: +b.toFixed(2) };
}
function endLifetime() {
  lifetimes.push(halfScores(watch.task)); if (lifetimes.length > 50) lifetimes.shift();
  if (lifeLog.genome !== watch.genome) lifeLog.list = [];   // v24: per-lifetime results of the watched genome (fast panel)
  lifeLog.genome = watch.genome; lifeLog.list.push({ v: lifeValue(watch.task).v, seed: watch.seed, label: watchLabel }); if (lifeLog.list.length > 500) lifeLog.list.shift();
  watch = new SA.Agent(watch.genome, rndSeed());   // fresh episode, weights reset to genome
}
const lctx = $('learn').getContext('2d');
function drawLearning() {
  const c = lctx, W = 440, H = 110; c.clearRect(0, 0, W, H);
  c.fillStyle = '#333'; c.fillRect(0, H / 2, W, 1);
  const nCh = watch.net.nCh; let mm = 0.5, dm = 1e-3; for (let i = 0; i < LT; i++) { for (let ch = 0; ch < nCh; ch++) mm = Math.max(mm, Math.abs(modBufs[ch][i])); dm = Math.max(dm, dwBuf[i]); }
  c.lineWidth = 1.2;
  c.strokeStyle = '#c88cff'; c.beginPath();
  for (let t = 0; t < LT; t++) { const v = dwBuf[(lPos + t) % LT], x = t * W / LT, y = H - 2 - v / dm * (H / 2 - 4); t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  for (let ch = nCh - 1; ch >= 0; ch--) {            // one trace per modulator channel (compartment)
    c.strokeStyle = CH_COLORS[ch]; c.beginPath();
    for (let t = 0; t < LT; t++) { const v = modBufs[ch][(lPos + t) % LT], x = t * W / LT, y = H / 2 - v / mm * (H / 2 - 4); t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  }
  const crit = !!watch.net.crit;
  if (crit) {                                         // v20: critic's value estimate V (same scale as the dopamine = RPE trace)
    c.strokeStyle = '#5fd3e0'; c.setLineDash([3, 2]); c.beginPath();
    for (let t = 0; t < LT; t++) { const v = valBuf[(lPos + t) % LT], x = t * W / LT, y = H / 2 - v / mm * (H / 2 - 4); t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.setLineDash([]);
  }
  const note = crit ? 'yellow = dopamine = reward prediction error (' + (watch.net.p.rpeMode === 1 ? 'r − V at each outcome' : 'TD error') + ') · dashed cyan = critic value V · purple = total weight change per tick'
                    : 'yellow = dopamine (up on reward, down on punishment) · purple = total weight change per tick';
  if ($('learnNote').textContent !== note) $('learnNote').textContent = note;
  if (!crit) for (let ch = 0; ch < nCh; ch++) { c.fillStyle = CH_COLORS[ch]; c.fillText('ch' + ch, 4 + ch * 30, H - 4); }
  c.fillStyle = '#8a919c'; c.font = '10px system-ui'; c.fillText('mod ±' + mm.toFixed(2), 4, 10); c.fillText('|dw| max ' + dm.toFixed(2) + ' mV/tick', W - 120, 10);
}
function drawLearnInfo() {
  const w = watch.task, net = watch.net, cur = halfScores(w), n = lifetimes.length;
  const avg = k => n ? (lifetimes.reduce((s, l) => s + l[k], 0) / n).toFixed(2) : '-';
  const pl = net.p;
  $('learnInfo').textContent =
`learning   ${net.learning ? 'on' : (P.plasticity ? 'no plastic synapses / lr 0' : 'off (frozen)')} · ${net.plastic.length} of ${net.ws.length} synapses plastic · moved ${net.drift().toFixed(0)} mV this lifetime
reward     this lifetime: 1st half ${cur.first} → 2nd half ${cur.second} · last ${n} lifetimes: ${avg('first')} → ${avg('second')}
genes      lr ${pl.lr.toPrecision(2)} · tauElig ${pl.tauElig.toFixed(0)} · aMinus ${pl.aMinus.toFixed(2)}` +
  net.chs.map((ch, i) => `\nch${i}        reward+ ${ch.gFood.toFixed(2)} · reward− ${ch.gPoison.toFixed(2)} · pain ${ch.gWall.toFixed(2)} · tau ${ch.tauMod.toFixed(1)}` +
    (net.chSrc[i].length ? ` · driven by ${net.chSrc[i].length} neuron(s) ×${ch.gSpike.toFixed(2)}` : '')).join('') +
  (net.crit ? `\ncritic     reward prediction error (${pl.rpeMode === 1 ? 'at outcomes' : 'TD'}) · value now ${net.value.toFixed(2)} · last RPE ${net.lastDelta.toFixed(2)}` +
    (net.anList ? ` · exploration noise ${pl.actNoise}${pl.actNoiseV > 0 ? ' / (1 + ' + pl.actNoiseV + ' V)' : ''}` : '') : '') +
  (net.pruning ? `\npruning    at tick ${net.pruning.tick}: ${net.tickNo >= net.pruning.tick ? net.pruned + ' synapses removed' : 'pending'}` : '');
}

/* ---------- drawing: the environment (each environment renders itself) ---------- */
const actx = $('arena').getContext('2d');
function fitArena() {
  const v = ENV().def.view || { width: 700, height: 500 }, cv = $('arena');
  if (cv.width !== v.width || cv.height !== v.height) { cv.width = v.width; cv.height = v.height; cv.style.aspectRatio = v.width + ' / ' + v.height; }
}
function drawArena() {
  const t = watch.task, cv = $('arena');
  if (t.render) t.render(actx, cv.width, cv.height, {});
  else { actx.fillStyle = '#f4f1ea'; actx.fillRect(0, 0, cv.width, cv.height); actx.fillStyle = '#222'; actx.font = '14px system-ui'; actx.fillText(t.statusLine ? t.statusLine() : 't ' + t.t, 16, 24); }
  $('watchInfo').textContent = '· watching: ' + watchLabel;
}
/* ---------- drawing: brain ---------- */
const CH_COLORS = ['#ffd34d', '#4dd2ff', '#ff6bd6', '#8dff6b'];
const TYPE_COLORS = ['#c88cff', '#ff9f43', '#4dd2ff', '#ff6b6b', '#8dff6b', '#f7f06d', '#6b8dff', '#ff6bd6'];
const bctx = $('brain').getContext('2d'); let pos = [], edgeCache = null, edgeList = [], growT0 = 0, nodeColor = [], nodeRing = [];
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
let layoutOf = null;
function layoutBrain() {
  const g = watch.brain, N = g.N, Wd = 440, H = 300; pos = new Array(N); layoutOf = g;
  if (g.pos) {
    // grown brain: real positions. Front of the brain (sensors) on the left, back (outputs) on the right,
    // the body's left side at the top.
    // v23 fix: map the brain's actual bounding box (at least the unit tissue [-1, 1]^2) into the canvas. A multi-region brain places
    // its later regions beside the first tissue (e.g. predictK3: the context region at x 1..3.3), and the fixed [-1, 1] mapping
    // put those cells and their synapses below the canvas (lines went off the bottom and came back to the cortex).
    let x0 = -1, x1 = 1, y0 = -1, y1 = 1;
    for (let i = 0; i < N; i++) { const [x, y] = g.pos[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < N; i++) pos[i] = [30 + (y1 - g.pos[i][1]) / (y1 - y0) * 380, 20 + (g.pos[i][0] - x0) / (x1 - x0) * 260];
  } else {
    for (let i = 0; i < g.nIn; i++) pos[i] = [18, 14 + i * (H - 28) / Math.max(1, g.nIn - 1)];
    const cx = 230, cy = H / 2, R = Math.min(115, 30 + g.nHid * 2.2);
    for (let j = 0; j < g.nHid; j++) {
      // golden-angle spiral so any count looks tidy
      const r = R * Math.sqrt((j + 0.5) / Math.max(1, g.nHid)), th = j * 2.39996;
      pos[g.nIn + j] = [cx + r * Math.cos(th), cy + r * Math.sin(th)];
    }
    const m0 = g.nIn + g.nHid;
    for (let m = 0; m < g.nOut; m++) pos[m0 + m] = [Wd - 30, 20 + m * (H - 40) / Math.max(1, g.nOut - 1)];
  }
  // neuron colours: inputs blue, motors gold, hidden by cell type (grown) or purple;
  // ring = compartment (modulator channel) of most plastic synapses onto that neuron
  const nCh = g.nCh || 1, votes = Array.from({ length: N }, () => new Array(nCh).fill(0));
  for (let i = 0; i < g.W.length; i++) if (g.W[i] && g.P[i]) votes[i % N][(g.C ? g.C[i] : 0) % nCh]++;
  for (let i = 0; i < N; i++) {
    nodeColor[i] = SA.isInput(g, i) ? [95, 179, 255] : SA.isOutput(g, i) ? [255, 200, 60] :
      (g.cellType ? hexRgb((watch.genome.kind === 'cell' || watch.genome.kind === 'regions' ? TAG_COLORS : TYPE_COLORS)[(g.cellType[i] - SA.N_FIXED) % TYPE_COLORS.length]) : [200, 140, 255]);
    const v = votes[i], best = v.indexOf(Math.max(...v));
    nodeRing[i] = nCh > 1 && v[best] > 0 ? CH_COLORS[best] : null;
  }
  edgeList = [];
  const Wm = g.W; let maxW = 1e-6;
  for (let i = 0; i < Wm.length; i++) maxW = Math.max(maxW, Math.abs(Wm[i]));
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const i = a * N + b, w = Wm[i]; if (!w) continue;
    const al = 0.08 + 0.5 * Math.abs(w) / maxW, plastic = g.P && g.P[i];
    let col = w > 0 ? `rgba(80,220,120,${al})` : `rgba(255,90,90,${al})`;
    if (plastic && nCh > 1) { const [r_, g_, b_] = hexRgb(CH_COLORS[(g.C ? g.C[i] : 0) % nCh]); col = `rgba(${r_},${g_},${b_},${al + 0.1})`; }
    edgeList.push([a, b, col, plastic]);
  }
  edgeCache = document.createElement('canvas'); edgeCache.width = Wd; edgeCache.height = H;
  drawEdges(edgeCache.getContext('2d'), edgeList.length);
  growT0 = g.pos ? performance.now() : 0;          // grown brains get a short growth animation
}
function drawEdges(c, n) {
  for (let q = 0; q < n; q++) {
    const [a, b, col, plastic] = edgeList[q];
    c.strokeStyle = col; c.setLineDash(plastic ? [3, 2] : []);      // dashed = plastic synapse
    c.beginPath(); c.moveTo(pos[a][0], pos[a][1]); c.lineTo(pos[b][0], pos[b][1]); c.stroke();
  }
  c.setLineDash([]);
}
function drawBrain() {
  const c = bctx, g = watch.brain, N = g.N, v = watch.net.v, f = flash.a;
  if (rN !== N) resetRaster(); else if (!edgeCache || layoutOf !== g) layoutBrain();   // v24: the brain may have changed in fast mode
  c.clearRect(0, 0, 440, 300);
  // growth animation (1.6 s): neurons appear class by class, then the wiring grows in
  const gt = growT0 ? Math.min(1, (performance.now() - growT0) / 1600) : 1;
  if (gt < 1) {
    const ne = Math.floor(Math.max(0, gt - 0.4) / 0.6 * edgeList.length); drawEdges(c, ne);
    c.fillStyle = '#8a919c'; c.font = '11px system-ui'; c.fillText(gt < 0.4 ? 'growing neurons…' : 'growing synapses…', 170, 292);
  } else c.drawImage(edgeCache, 0, 0);
  c.fillStyle = '#8a919c'; c.font = '10px system-ui';
  if (g.pos) { c.fillText('front (sensors)', 4, 296); c.fillText('back (outputs)', 362, 296); c.fillText('left', 410, 12); c.fillText('right', 408, 292 - 10); }
  else { c.fillText('sensors', 4, 9); c.fillText('outputs', 400, 9); }
  const shown = gt < 1 ? Math.floor(Math.min(1, gt / 0.4) * N) : N;
  const order = g.cellType ? growOrder(g) : null;
  for (let q = 0; q < shown; q++) {
    const i = order ? order[q] : q;
    const [x, y] = pos[i], fl = f[i] || 0;
    const sub = Math.max(0, Math.min(1, (v[i] - SA.V_REST) / (g.thresh[i] - SA.V_REST)));  // 0 at rest, 1 at threshold
    const base = nodeColor[i] || [200, 140, 255];
    const k = 0.35 + 0.3 * sub + 0.35 * fl;
    c.fillStyle = `rgb(${base[0] * k + 255 * fl * 0.6 | 0},${base[1] * k + 255 * fl * 0.6 | 0},${base[2] * k + 255 * fl * 0.6 | 0})`;
    const r = SA.isOutput(g, i) ? 8 : (g.nHid > 100 && !SA.isInput(g, i) ? 3 : 5);
    c.beginPath(); c.arc(x, y, r + fl * 2, 0, 7); c.fill();
    if (nodeRing[i]) { c.strokeStyle = nodeRing[i]; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1; }
  }
}
let growOrderCache = null;
function growOrder(g) {
  if (growOrderCache && growOrderCache.g === g) return growOrderCache.o;
  const o = Array.from({ length: g.N }, (_, i) => i).sort((a, b) => g.cellType[a] - g.cellType[b]);
  growOrderCache = { g, o }; return o;
}

/* ---------- drawing: raster ---------- */
// v19: three bands (sensors / hidden / outputs), each row of the picture = OR over its group of neurons (max-pooling), so
// spikes of big brains (1800+ neurons) and of the few output cells stay visible. lastRaster = lit pixels per band (tests).
const rctx = $('raster').getContext('2d'); let rImg = null, lastRaster = null;
function drawRaster() {
  if (!rBuf) return;
  const g = watch.brain, N = rN, Wc = rctx.canvas.width, Hc = rctx.canvas.height, lab = 52, Wd = Wc - lab;
  const groups = [['sensors', 0, g.nIn, [95, 179, 255]], ['hidden', g.nIn, g.nIn + g.nHid, [200, 140, 255]], ['outputs', g.nIn + g.nHid, N, [255, 200, 60]]].filter(b => b[2] > b[1]);
  // sensors and outputs get at least 28 rows (or one per neuron), hidden the rest
  const avail = Hc - 2 * (groups.length - 1), small = groups.map(b => b[0] === 'hidden' ? 0 : Math.min(Math.max(28, Math.round(avail * (b[2] - b[1]) / N)), avail / 3 | 0));
  const hs = small.map((r, i) => groups[i][0] === 'hidden' ? avail - small.reduce((a, b) => a + b, 0) : r);
  if (!rImg || rImg.width !== Wd || rImg.height !== Hc) rImg = rctx.createImageData(Wd, Hc);
  const d = rImg.data; for (let q = 0; q < d.length; q += 4) { d[q] = 13; d[q + 1] = 15; d[q + 2] = 18; d[q + 3] = 255; }
  const lit = {}; let y0 = 0;
  groups.forEach(([name, a, b, col], gi) => { const h = hs[gi], n = b - a; let cnt = 0;
    for (let r = 0; r < h; r++) { const i0 = a + Math.floor(r * n / h), i1 = Math.max(i0 + 1, a + Math.floor((r + 1) * n / h));
      for (let x = 0; x < Wd; x++) { const t0 = Math.floor(x * RT / Wd), t1 = Math.max(t0 + 1, Math.floor((x + 1) * RT / Wd)); let on = 0;
        for (let t = t0; t < t1 && !on; t++) { const src = ((rPos + t) % RT) * N; for (let i = i0; i < i1; i++) if (rBuf[src + i]) { on = 1; break; } }
        if (on) { const p = ((y0 + r) * Wd + x) * 4; d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; cnt++; } } }
    lit[name] = cnt; y0 += h + 2; });
  rctx.clearRect(0, 0, Wc, Hc); rctx.putImageData(rImg, lab, 0);
  rctx.fillStyle = '#8a919c'; rctx.font = '10px system-ui'; y0 = 0;
  groups.forEach(([name, a, b], gi) => { rctx.fillText(name, 2, y0 + 11); rctx.fillText(String(b - a), 2, y0 + 22); y0 += hs[gi] + 2; });
  lastRaster = lit;
}

/* ---------- drawing: outputs (decoded actions, or raw output rates) ---------- */
const wctx = $('wheels').getContext('2d');
function drawOutputs() {
  const c = wctx, t = watch.task;
  // the sequence task draws all output spikes on its own canvas: no second copy here
  const own = !!t.drawsOutputs; $('outsBox').style.display = own ? 'none' : ''; if (own) return; c.clearRect(0, 0, 440, 66); c.font = '12px system-ui';
  let bars = t.outputView ? t.outputView() : null;
  if (!bars) bars = Array.from(watch.out.rates, (v, m) => ({ name: ENV().spec.outputs[m].name, v, lo: 0, hi: 0.5 }));
  bars = bars.slice(0, 3);
  bars.forEach((b, j) => {
    const y = 4 + j * 20, span = b.hi - b.lo || 1, x0 = 110, w = 320, zero = b.lo < 0 ? x0 + (-b.lo) / span * w : x0;
    c.fillStyle = '#2b3038'; c.fillRect(x0, y, w, 16);
    const xv = x0 + (Math.max(b.lo, Math.min(b.hi, b.v)) - b.lo) / span * w;
    c.fillStyle = b.v >= 0 ? '#4cd964' : '#ff9f43'; c.fillRect(Math.min(zero, xv), y, Math.abs(xv - zero), 16);
    if (b.ref != null) { c.fillStyle = '#888'; c.fillRect(x0 + (b.ref - b.lo) / span * w, y - 2, 1, 20); }
    c.fillStyle = '#dde1e7'; c.fillText(b.name + ' ' + (Math.abs(b.v) < 10 ? b.v.toFixed(2) : b.v.toFixed(0)), 0, y + 12);
  });
}

/* ---------- drawing: fitness chart ---------- */
const cctx = $('chart').getContext('2d');
function drawChart() {
  const c = cctx, W = c.canvas.width, H = c.canvas.height, h = evo.history, padL = 34, padB = 16;
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#8a919c'; c.font = '11px system-ui';
  if (!h.length) { c.fillText(running ? `generation ${evo.gen}: ${evo.phase === 'val' ? 'validating' : 'evaluating ' + Math.min(evo.idx + 1, evo.pop.length) + '/' + evo.pop.length} brains (${(evo.progress() * 100).toFixed(0)}%) · the first point appears when it ends`
      : 'Press "▶ Evolve": one point per generation (fitness of the best, the average and the all-time champion).', padL + 10, H / 2);
    if (running) { c.fillStyle = '#2b3038'; c.fillRect(padL + 10, H / 2 + 8, 300, 5); c.fillStyle = '#5fb3ff'; c.fillRect(padL + 10, H / 2 + 8, 300 * evo.progress(), 5); }
    return; }
  let lo = 0, hi = 1; for (const p of h) { lo = Math.min(lo, p.avg, p.best, p.cMin == null ? 0 : p.cMin); hi = Math.max(hi, p.best, p.champ || 0, p.cMax == null ? 0 : p.cMax); }
  const X = i => padL + (W - padL - 8) * (h.length === 1 ? 0.5 : i / (h.length - 1));
  const Y = v => 16 + (H - padB - 16) * (1 - (v - lo) / (hi - lo));   // top 14 px: legend
  c.strokeStyle = '#333'; c.beginPath(); c.moveTo(padL, Y(0)); c.lineTo(W, Y(0)); c.stroke();
  c.fillText(hi.toFixed(1), 2, Y(hi) + 8); c.fillText('0', 2, Y(0) + 4); if (lo < -0.15 * (hi - lo)) c.fillText(lo.toFixed(1), 2, Y(lo));
  c.fillText('gen ' + h[0].gen, padL, H - 4); c.textAlign = 'right'; c.fillText('gen ' + h[h.length - 1].gen, W - 8, H - 4); c.textAlign = 'left';
  if (h.some(p => p.cMin != null)) {                       // champion regrowth min-max band
    c.fillStyle = 'rgba(255,211,77,.15)'; c.beginPath();
    h.forEach((p, i) => { const v = p.cMax != null ? p.cMax : p.champ; i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)); });
    for (let i = h.length - 1; i >= 0; i--) { const p = h[i], v = p.cMin != null ? p.cMin : p.champ; c.lineTo(X(i), Y(v)); }
    c.fill(); c.fillStyle = '#8a919c';
  }
  for (const [key, col, lw] of [['avg', '#5fb3ff', 1.2], ['best', '#4cd964', 1.2], ['champ', '#ffd34d', 2.5]]) {
    c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); let started = false;
    h.forEach((p, i) => { if (p[key] == null) return; started ? c.lineTo(X(i), Y(p[key])) : c.moveTo(X(i), Y(p[key])); started = true; });
    c.stroke();
  }
  c.lineWidth = 1;
  c.font = '10px system-ui'; c.fillStyle = '#8a919c'; c.fillText('fitness per generation:', padL, 9); let lx = padL + c.measureText('fitness per generation:').width + 8; for (const [t, col] of [['champion (validated)', '#ffd34d'], ['best', '#4cd964'], ['average', '#5fb3ff']]) { c.fillStyle = col; c.fillRect(lx, 4, 10, 3); c.fillStyle = '#8a919c'; c.fillText(t, lx + 13, 9); lx += c.measureText(t).width + 26; }
}

/* ---------- stats ---------- */
let statsT = 0;
function activeHidden() {
  const g = watch.brain; if (!rBuf) return 0; let n = 0;
  for (let i = g.nIn; i < g.nIn + g.nHid; i++) { for (let t = 0; t < RT; t++) if (rBuf[t * rN + i]) { n++; break; } }
  return n;
}
let nsCache = { g: null, v: null };
function netStatsOf(g) { if (nsCache.g !== g) nsCache = { g, v: SA.networkStats(g) }; return nsCache.v; }
function drawStats() {
  const now = performance.now(); if (now - statsT < 250) return; statsT = now;
  const h = evo.history, last = h[h.length - 1], g = watch.brain, st = SA.synapseStats(g), ch = evo.champion;
  { const ns = netStatsOf(g), plastic = Array.from(g.P).reduce((n, p, i) => n + (p && g.W[i] ? 1 : 0), 0), ds = g.devStats;
    $('brainInfo').innerHTML =
      `<b>${g.N}</b> neurons: ${g.nIn} sensors · <b style="color:#c88cff">${g.nHid}</b> hidden (${activeHidden()} active) · ${g.nOut} outputs` +
      ` · <b>${st.total}</b> synapses (${ns.hh} hidden→hidden, <span style="color:#ffd34d">${plastic} plastic</span>${st.direct ? `, <span style="color:#ff9f43">${st.direct} sensor→output</span>` : ''})` +
      ((g.nCh || 1) > 1 ? `<br>dopamine compartments: ` + Array.from({ length: g.nCh }, (_, i) => `<span style="color:${CH_COLORS[i]}">■ ch${i}</span>`).join(' ') : '') +
      ((watch.genome.kind === 'cell' || watch.genome.kind === 'regions') && ds ? `<br>grown from ${SA.genomeParamCount(watch.genome)} genome numbers: ${ds.cells} cells → ${ds.neurons} neurons → ${ds.survivors} kept · ${ns.slow} slow-leak (memory) cells · ${ns.inLoops} in recurrent loops · depth ${ns.motorDepth}–${ns.maxDepth}` : '') +
      (g.nHid === 0 ? '<br><span style="color:#ff9f43">No hidden neurons: a pure reflex circuit.</span>' : ''); }
  { const t = watch.task;
    $('statline').innerHTML = `gen <b>${evo.gen}</b> (${(evo.progress() * 100).toFixed(0)}%) · champion <b>${ch ? ch.val.toFixed(2) : '–'}</b>` +
      (ch && ch.spread ? ` (regrown ${ch.spread.min.toFixed(1)}–${ch.spread.max.toFixed(1)})` : '') +
      ` · watched: <b>${t.keyStats ? t.keyStats() : t.statusLine ? t.statusLine() : ''}</b>`; }
  $('stats').textContent =
`evaluation        ${evo.phase === 'val' ? 'validating the top brains' : 'brain ' + Math.min(evo.idx + 1, evo.pop.length) + '/' + evo.pop.length} · ${P.growths} growth${P.growths > 1 ? 's' : ''} × ${P.episodes} episode${P.episodes > 1 ? 's' : ''} each
champion          ${ch ? ch.val.toFixed(2) + ' validation fitness, found in generation ' + ch.gen : '–'}${ch && ch.spread ? '\nchampion regrown  min ' + ch.spread.min.toFixed(2) + ' · mean ' + ch.spread.mean.toFixed(2) + ' · max ' + ch.spread.max.toFixed(2) + ' (' + ch.spread.n + ' growths)' : ''}
last generation   ${last ? 'best ' + last.best.toFixed(2) + ' · average ' + last.avg.toFixed(2) : '–'}${last && last.env ? '\nenvironment       ' + Object.entries(last.env).map(([k, v]) => k + ' ' + (typeof v === 'number' ? +v.toFixed(2) : v)).join(' · ') : ''}
watched episode   ${watch.task.statusLine ? watch.task.statusLine() : '–'}
simulation        ${(lastTickRate | 0)} ticks/s${running ? '' : ' (paused)'} · watched brain ${rasterSpikesPerTick().toFixed(1)} spikes/tick
auto-saved        ${lastSave || '–'}`;
  drawLearnInfo();
}

$('chkFastMode').checked = !!ui.fast; document.body.classList.toggle('fast', !!ui.fast);
buildEnvControls(); buildPlanButtons(); fitArena(); resetRaster(); lastRec = recSig(); restoreOrNew(); saveUi(); requestAnimationFrame(frame);
// v25: index.html#load opens a brain handed over by dashboard.html (localStorage 'spikingArena.load', removed after use)
if (location.hash === '#load') { const t = localStorage.getItem('spikingArena.load'); localStorage.removeItem('spikingArena.load'); history.replaceState(null, '', location.pathname);
  if (t) { let name = 'champion from the dashboard'; try { const o = JSON.parse(t); if (o.meta && o.meta.run) name = `champion of run ${o.meta.run} (generation ${o.meta.generation})`; } catch (e) {} importText(t, name); } }
window.__arena = { get evo() { return evo; }, get watch() { return watch; }, get raster() { return lastRaster; }, get lifeLog() { return lifeLog; }, get rates() { return { watch: watchRate, evo: lastTickRate }; }, setFastMode,
  get brainView() { return { pos, edges: edgeList.map(e => [e[0], e[1]]), W: bctx.canvas.width, H: bctx.canvas.height, N: watch.brain.N }; } };  // handy in the dev console
})();