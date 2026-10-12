/* =====================================================================
 * ui/viewer.js (v18, round 19): the growth viewer page (viewer.html).
 * Grows a genome with the passive development recorder and shows it with
 * TissueView (timeline) and WiringView (population graph); optional live run.
 * Sources: the brain handed over by the arena (localStorage 'spikingArena.viewer',
 * written by index.html's "Open growth viewer"), the environments' default plans,
 * or a brain / session file. URL hash: #arena, #src=seq:text, #frame=20, #view=wiring, #plan=<id>.
 * ===================================================================== */
(function () {
'use strict';
const SA = window.SpikingArena, $ = id => document.getElementById(id), P = SA.params;
const HANDOFF_KEY = 'spikingArena.viewer';
const PRESETS = [['bug', 'Bug arena', 'bug', {}], ['cue', 'Cue-then-turn (memory)', 'cue', {}], ['recall', 'Sequence: symbol recall', 'recall', {}],
  ['seq:cycle', 'Sequence prediction (cycle)', 'seq', { source: 'cycle' }], ['seq:text', 'Sequence prediction, Text corpus', 'seq', { source: 'text' }]];
const st = { src: null, genome: null, env: 'bug', envP: {}, label: '', seed: null, model: null, brain: null, frame: 0, playing: false, view: 'tissue', run: null, handoff: null, fileName: '' };
const hash = new URLSearchParams(location.hash.slice(1).replace(/^arena$/, 'src=arena'));
const tip = $('tip');
const tipAt = (html, x, y) => { if (!html) { tip.style.display = 'none'; return; } tip.innerHTML = html; tip.style.display = 'block';
  const bw = $('canvasBox').clientWidth; tip.style.left = Math.min(x + 14, bw - tip.offsetWidth - 4) + 'px'; tip.style.top = (y + 16) + 'px'; };
// v21: st.model = the tissue model (for a multi-region brain: the selected region's own tissue), st.wmodel = the wiring model (whole brain)
const tv = new SA.TissueView($('cvTissue'), { onHover: (h, x, y) => tipAt(h && st.model ? SA.devDescribe(st.model, h, Math.floor(st.frame)) : '', x, y), onSelect: h => { showInspector(h); if (h && h.kind === 'cell' && st.model.cells[h.id].pop != null) { wv.sel = st.model.cells[h.id].pop; wv.dirty = true; } } });
const wv = new SA.WiringView($('cvWiring'), { onHover: (id, x, y) => tipAt(id != null && st.wmodel ? popTip(id) : '', x, y), onSelect: id => { $('insBody').innerHTML = id != null ? SA.devPopHTML(st.wmodel, id) : SA.devInspectHTML(st.model, null); wireLinks(); } });
function popTip(id) { const p = st.wmodel.pops[id]; return `<b style="color:${p.color}">${p.kind === 'hid' ? p.short + ': ' : ''}${p.name}</b> · ${p.nodes.length} ${p.kind === 'hid' ? 'neurons' : 'channels'}` + (wv.rates ? ` · rate ${(wv.rates[id] * 1000).toFixed(1)} spikes / 1000 substeps` : ''); }

/* ---------- sources ---------- */
function loadHandoff() { try { const o = JSON.parse(localStorage.getItem(HANDOFF_KEY)); return o && o.format === 'spiking-arena-viewer/v1' ? o : null; } catch (e) { return null; } }
function buildSrc() {
  st.handoff = loadHandoff();
  const opts = (st.handoff ? [['arena', `From the arena: ${st.handoff.label || 'watched brain'}`]] : []).concat(PRESETS.map(([id, n]) => [id, n + ' · default plan'])).concat(st.fileName ? [['file', 'File: ' + st.fileName]] : []);
  $('selSrc').innerHTML = opts.map(([v, t]) => `<option value="${v}">${t.replace(/</g, '&lt;')}</option>`).join('');
}
function buildPlans() {
  const env = SA.currentEnv(), dp = SA.defaultPlanId(env);
  $('selPlan').innerHTML = `<option value="">(the brain's own genome)</option>` + Object.values(SA.PLANS).map(p => `<option value="${p.id}">${p.id === dp ? '★ ' : ''}${p.label.replace(/</g, '&lt;')}</option>`).join('');
}
function setSource(src, keepPlan) {
  st.src = src; $('selSrc').value = src; stopRun();
  if (src === 'arena') { const h = st.handoff; st.env = h.env; st.envP = h.envParams || {}; if (h.params) for (const k in h.params) if (k in P && k !== 'env' && k !== 'popSize') P[k] = h.params[k];
    SA.setEnv(st.env, Object.assign(SA.recommendedEnvParams(st.env), st.envP)); st.genome = SA.genomeFromCompact(h.genome); st.label = h.label || 'brain from the arena'; }
  else if (src === 'file') { SA.setEnv(st.env, Object.assign(SA.recommendedEnvParams(st.env), st.envP || {})); }
  else { const pr = PRESETS.find(p => p[0] === src) || PRESETS[0]; for (const k in SA.PARAM_DEFAULTS) if (k !== 'env') P[k] = SA.PARAM_DEFAULTS[k];
    st.env = pr[2]; st.envP = SA.recommendedEnvParams(pr[2], pr[3], Object.keys(pr[3])); SA.setEnv(st.env, st.envP);
    const pl = SA.planFor('env'); st.genome = pl.make(); st.label = pl.label + ' (default plan)'; }
  buildPlans(); $('selPlan').value = ''; if (keepPlan) { $('selPlan').value = keepPlan; usePlan(keepPlan); return; }
  st.seed = null; $('inSeed').value = st.genome.seed >>> 0; grow();
}
function usePlan(id) { if (!id) return setSource(st.src); const pl = SA.PLANS[id]; st.genome = pl.make(); st.label = pl.label; $('inSeed').value = st.genome.seed >>> 0; st.seed = null; grow(); }
$('selSrc').onchange = () => setSource($('selSrc').value);
$('selPlan').onchange = () => usePlan($('selPlan').value);
$('btnRegrow').onclick = () => { st.seed = +$('inSeed').value >>> 0; grow(); };
$('btnFile').onclick = () => $('fileIn').click();
$('fileIn').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const o = JSON.parse(t); let g, env, envP;
    if (/^spiking-arena-session\//.test(o.format)) { const c = o.champion ? o.champion.genome : o.population[0]; g = SA.genomeFromCompact(c); env = SA.ENVS[o.env] ? o.env : 'bug'; envP = o.envParams || {}; }
    else { const b = SA.brainFromFile(o); g = b.genome; env = b.env; envP = b.envParams || {}; }
    st.genome = g; st.env = SA.ENVS[env].redirect ? 'seq' : env; st.envP = envP; st.label = f.name; st.fileName = f.name; buildSrc(); st.src = 'file'; $('selSrc').value = 'file';
    SA.setEnv(st.env, Object.assign(SA.recommendedEnvParams(st.env), envP)); buildPlans(); $('selPlan').value = ''; $('inSeed').value = g.seed >>> 0; st.seed = null; grow(); }
  catch (err) { $('info').textContent = 'Could not load: ' + err.message; } }); e.target.value = ''; };

/* ---------- grow + record ---------- */
function grow() {
  $('busy').style.display = 'flex'; stopRun();
  setTimeout(() => {
    const t0 = performance.now(), env = SA.currentEnv();
    try { st.brain = SA.growCell(st.genome, st.seed != null ? { record: true, seed: st.seed, spec: env.spec } : { record: true, spec: env.spec }); st.wmodel = SA.DevModel(st.brain, env.spec); st.region = st.wmodel.sub ? st.wmodel.outRegion : -1; st.model = st.wmodel.sub ? st.wmodel.sub[st.region] : st.wmodel; }
    catch (err) { $('busy').style.display = 'none'; $('info').textContent = 'Growth failed: ' + err.message; console.error(err); return; }
    const ms = performance.now() - t0, m = st.model, b = st.brain, ds = b.devStats, R = st.wmodel.regions;
    $('regionBox').style.display = R ? '' : 'none'; if (R) { $('selRegion').innerHTML = R.map((r, k) => `<option value="${k}" style="color:${r.color}">${r.name}${r.outputs ? ' (outputs)' : ''}</option>`).join(''); $('selRegion').value = st.region; }
    tv.setModel(m); wv.setModel(st.wmodel); wv.minSyn = +$('minSyn').value;
    $('tlSlider').max = m.TT - 1;
    $('tlMarks').innerHTML = [[0, 'step 1', 0], [10, '10', 0], [20, '20', 0], [30, '30', 0], [m.T, 'selection', 0], [m.T + 1, 'trophic', 1], [m.T + 3.5, 'juvenile activity', 0], [m.T + 6, 'pruned', 1]]
      .map(([t, n, row]) => `<span style="left:${(100 * t / (m.TT - 1)).toFixed(2)}%;top:${row ? 11 : 0}px">${n}</span>`).join('');
    setFrame(hash.has('frame') && !st.grown ? +hash.get('frame') : m.TT - 1); st.grown = true;
    $('info').innerHTML = `<b>${st.label.replace(/</g, '&lt;')}</b> · ${env.def.name} · ${R ? `${R.length} regions (${R.map(r => `<span style="color:${r.color}">${r.name}</span>`).join(', ')}), ${b.tracts.length} tract${b.tracts.length > 1 ? 's' : ''}` : `${m.GS}×${m.GS} tissue`} · ${ds.cells} cells → ${ds.neurons} neurons → <b>${b.nHid}</b> survived · ${ds.synapses} synapses · ${R ? '' : `${m.syn.n} formed during growth · `}${st.wmodel.pops.length} populations · grown + recorded in ${ms.toFixed(0)} ms`;
    $('busy').style.display = 'none'; showInspector(null); legend(); tv.dirty = wv.dirty = true;
  }, 30);
}

/* ---------- timeline ---------- */
function setFrame(f) { if (!st.model) return; st.frame = Math.max(0, Math.min(st.model.TT - 1, f)); tv.setFrame(st.frame); $('tlSlider').value = st.frame; $('stageLbl').textContent = (Math.floor(st.frame) < st.model.T ? `step ${Math.floor(st.frame) + 1}/${st.model.T}: ` : '') + st.model.stageAt(Math.floor(st.frame)); }
function setPlay(on) { st.playing = on; $('btnPlay').textContent = on ? '⏸ Pause' : '▶ Play'; if (on && st.frame >= st.model.TT - 1.01) setFrame(0); }
$('tlSlider').oninput = () => { setPlay(false); setFrame(+$('tlSlider').value); };
$('btnPlay').onclick = () => setPlay(!st.playing);
$('btnBack').onclick = () => { setPlay(false); setFrame(Math.ceil(st.frame) - 1); };
$('btnFwd').onclick = () => { setPlay(false); setFrame(Math.floor(st.frame) + 1); };

/* ---------- views, layers, legend ---------- */
function setView(v) { st.view = v; $('tabTissue').classList.toggle('on', v === 'tissue'); $('tabWiring').classList.toggle('on', v === 'wiring');
  $('cvTissue').style.display = v === 'tissue' ? '' : 'none'; $('cvWiring').style.display = v === 'wiring' ? '' : 'none'; $('minSynBox').style.display = v === 'wiring' ? '' : 'none';
  tipAt(''); (v === 'tissue' ? tv : wv).dirty = true; legend(); }
function setRegion(k) { st.region = k; st.model = st.wmodel.sub[k]; tv.setModel(st.model); $('tlSlider').max = st.model.TT - 1; setFrame(Math.min(st.frame, st.model.TT - 1));
  if (st.run) { st.run.lact = new Float32Array(st.model.N); tv.act = st.run.lact; } showInspector(null); legend(); tv.dirty = true; }
$('selRegion').onchange = () => setRegion(+$('selRegion').value);
$('tabTissue').onclick = () => setView('tissue'); $('tabWiring').onclick = () => setView('wiring');
const cur = () => st.view === 'tissue' ? tv : wv;
$('btnFit').onclick = () => cur().fit(); $('btnZin').onclick = () => { const v = cur(); v.zoomAt(v.W / 2, v.H / 2, 1.4); }; $('btnZout').onclick = () => { const v = cur(); v.zoomAt(v.W / 2, v.H / 2, 1 / 1.4); };
$('minSyn').oninput = () => { wv.minSyn = +$('minSyn').value; $('minSynV').textContent = wv.minSyn; wv.dirty = true; };
$('selChem').innerHTML = '<option value="-1">none</option>' + SA.CHEM_NAMES.map((n, k) => `<option value="${k}">${k}: ${n}${k === 4 || k === 5 ? ' (emitted by cells, per step)' : ''}</option>`).join('');
$('selChem').value = '1'; $('selChem').onchange = () => tv.setLayer('chem', +$('selChem').value);
$('selColor').onchange = () => { tv.setLayer('colorBy', $('selColor').value); legend(); };
const LAYERS = [['cells', 'cells'], ['axons', 'axons'], ['cones', 'growth cones'], ['synapses', 'synapses'], ['pruned', 'removed synapses'], ['deaths', 'deaths'], ['labels', 'labels'], ['sensors', 'sensors / outputs']];
$('layerBox').innerHTML = LAYERS.map(([k, n]) => `<label class="chk"><input type="checkbox" data-layer="${k}" ${tv.layers[k] ? 'checked' : ''}> ${n}</label>`).join('');
for (const cb of document.querySelectorAll('[data-layer]')) cb.onchange = () => tv.setLayer(cb.dataset.layer, cb.checked);
function legend() {
  const m = st.model, items = [];
  if (st.view === 'wiring') {
    items.push(['line', '#4cd964', 'excitatory link'], ['line', '#ff5a5a', 'inhibitory link'], ['line', '#ffd34d', 'mostly plastic (dashed)'], ['dot', '#7fb2ff', 'sensors'], ['dot', '#ffc83c', 'outputs'], ['dot', '#ffffff', 'glow = firing rate (Run)']);
    const w = st.wmodel; if (w && w.regions) w.regions.forEach(r => items.push(['ring', r.color, 'region ' + r.name + ' (ring)']));
    if (w) for (const p of w.pops.filter(p => p.kind === 'hid').slice(0, w.regions ? 18 : 14)) items.push(['dot', p.color, `${p.short}: ${p.name}`]);
  } else {
    const cb = tv.layers.colorBy;
    if (cb === 'tag' && m) (m.spec.tagNames || []).forEach((n, k) => items.push(['dot', SA.TAG_COLORS_DEV[k], /^tag/.test(n) ? n : 'tag ' + n]));
    if (cb === 'fate') for (const t of SA.DEV_TRAITS) if (t[4]) items.push(['dot', t[4], t[1]]);
    if (cb === 'fate') items.push(['dot', '#b8a8e0', 'plain excitatory']);
    if (cb === 'pop' && m) for (const p of m.pops.filter(p => p.kind === 'hid').slice(0, 16)) items.push(['dot', p.color, `${p.short}: ${p.name}`]);
    items.push(['dot', '#5b636d', 'progenitor (not yet a neuron)'], ['ring', '#ff5a5a', 'inhibitory neuron'], ['sq', '#7fb2ff', 'sensor cell (front)'], ['dot', '#ffc83c', 'output cell (back)'],
      ['sq', '#ebf0f5', 'synapse: excitatory'], ['sq', '#ff6060', 'synapse: inhibitory'], ['sq', '#ffd64d', 'synapse: plastic'], ['sq', '#e650e6', 'removed synapse'],
      ['x', '#ff5a5a', 'programmed death'], ['x', '#ffa03c', 'trophic / afferent death'], ['dot', '#ffffff', 'growth cone (axon tip)'], ['line', '#7fb2ff', 'sensor axon']);
  }
  $('legend').innerHTML = items.map(([k, c, t]) => `<div>${k === 'dot' ? `<span class="sw" style="background:${c}"></span>` : k === 'ring' ? `<span class="sw" style="border:2px solid ${c};width:10px;height:10px"></span>` : k === 'sq' ? `<span class="sq" style="background:${c};width:6px;height:6px;margin:2px 7px 2px 2px"></span>` : k === 'x' ? `<span style="color:${c};margin-right:5px;font-weight:bold">✕</span>` : `<span class="sq" style="background:${c};height:3px;vertical-align:3px"></span>`}${t.replace(/</g, '&lt;')}</div>`).join('');
}

/* ---------- inspector ---------- */
function showInspector(h) { $('insBody').innerHTML = st.model ? SA.devInspectHTML(st.model, h, Math.floor(st.frame)) : ''; for (const cv of document.querySelectorAll('#insBody canvas.ins-heat')) SA.devDrawHeat(cv, st.model); wireLinks(); }
function wireLinks() { for (const a of document.querySelectorAll('#insBody a.ins-link')) a.onclick = e => { e.preventDefault();
  if (a.dataset.cell) { setView('tissue'); tv.selectCell(+a.dataset.cell); }
  else if (a.dataset.node) { setView('tissue'); tv.selectNode(+a.dataset.node); }
  else if (a.dataset.pop) { wv.sel = +a.dataset.pop; wv.dirty = true; $('insBody').innerHTML = SA.devPopHTML(st.wmodel, wv.sel); wireLinks(); } }; }

/* ---------- live run: activity overlay ---------- */
function stopRun() { st.run = null; tv.act = null; wv.rates = null; $('btnRun').textContent = '▶ Run brain'; $('btnRun').classList.remove('on'); $('runInfo').textContent = ''; tv.dirty = wv.dirty = true; }
$('btnRun').onclick = () => { if (st.run) return stopRun(); if (!st.model) return;
  const env = SA.currentEnv(), m = st.wmodel, a = new SA.Agent(st.genome, (Math.random() * 1e9) >>> 0, st.brain, env);
  st.run = { a, act: new Float32Array(m.N), rates: new Float32Array(m.pops.length), ticks: 0 }; wv.rates = st.run.rates;
  if (m.sub) st.run.lact = new Float32Array(st.model.N); tv.act = st.run.lact || st.run.act;
  setFrame(st.model.TT - 1); setPlay(false); $('btnRun').textContent = '⏸ Stop'; $('btnRun').classList.add('on'); };
function runStep() {
  const R = st.run, m = st.wmodel, sub = P.substeps; let a = R.a;
  const cnt = new Float32Array(m.pops.length);
  for (let t = 0; t < 2; t++) { a.tick(net => { const sp = net.spiked; for (let i = 0; i < m.N; i++) { if (sp[i]) { R.act[i] = 1; cnt[m.popOfNode[i]]++; } } });
    for (let i = 0; i < m.N; i++) R.act[i] *= 0.6; R.ticks++;
    if (a.done) { R.a = a = new SA.Agent(st.genome, (Math.random() * 1e9) >>> 0, st.brain, SA.currentEnv()); } }
  m.pops.forEach((p, k) => { const r = cnt[k] / (p.nodes.length * 2 * sub); R.rates[k] = 0.85 * R.rates[k] + 0.15 * r; });
  if (R.lact) { const loc = m.regions[st.region].local; for (let i = 0; i < loc.length; i++) R.lact[i] = loc[i] >= 0 ? R.act[loc[i]] : 0; }   // v21: the shown region's cells
  $('runInfo').textContent = `tick ${a.t} · ${a.task.statusLine ? a.task.statusLine() : ''}`;
  tv.actVer = (tv.actVer || 0) + 1; tv.dirty = wv.dirty = true;
}

/* ---------- main loop + keys ---------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (st.playing && st.model) { const f = st.frame + dt * +$('selSpeed').value; if (f >= st.model.TT - 1) { setFrame(st.model.TT - 1); setPlay(false); } else setFrame(f); }
  if (st.run) runStep();
  if (st.view === 'tissue') tv.draw(); else wv.draw();
  requestAnimationFrame(loop);
}
document.addEventListener('keydown', e => { if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (e.key === ' ') { e.preventDefault(); setPlay(!st.playing); } else if (e.key === 'ArrowLeft') { e.preventDefault(); $('btnBack').click(); } else if (e.key === 'ArrowRight') { e.preventDefault(); $('btnFwd').click(); }
  else if (e.key === 'f' || e.key === 'F') cur().fit(); else if (e.key === 'w' || e.key === 'W') setView(st.view === 'tissue' ? 'wiring' : 'tissue');
  else if (e.key === '?' || e.key === 'h') $('btnHelp').click(); else if (e.key === 'Escape') { $('help').style.display = 'none'; tv.select(null); } });
$('btnHelp').onclick = () => { const h = $('help'); h.style.display = h.style.display === 'block' ? 'none' : 'block'; }; $('btnHelpClose').onclick = () => { $('help').style.display = 'none'; };
window.addEventListener('resize', () => { tv.dirty = wv.dirty = true; });

buildSrc();
const want = hash.get('src') || (st.handoff ? 'arena' : 'bug');
setSource(st.handoff || want !== 'arena' ? (PRESETS.some(p => p[0] === want) || want === 'arena' ? want : 'bug') : 'bug', hash.get('plan') || '');
if (hash.get('view') === 'wiring') setView('wiring');
if (!localStorage.getItem('spikingArena.viewerHelpSeen')) { $('help').style.display = 'block'; try { localStorage.setItem('spikingArena.viewerHelpSeen', '1'); } catch (e) {} }
legend(); requestAnimationFrame(loop);
window.__viewer = { st, tv, wv, setFrame, setView, setSource, setPlay, setRegion };   // for scripted tests / the dev console
})();
