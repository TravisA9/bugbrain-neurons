/* Explore: the BugBrain arena (#arena). Appended to the engine bundle by tools/build_bugbrain_bundle.js.
 * Grows the arena brain in the browser: plan v3h plus the audited champion edit from
 * /explore/bugbrain-champion.json ({id, change: {field, factor} | {tune: {...}}}), in the standard arena.
 * The Explore router calls ExploreDemos.arena.show/hide; without the router (older pages) it starts at once.
 * Does nothing when loaded without a page (e.g. inside the live demo's Web Worker). */
(() => {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const SA = window.SpikingArena;
  const canvas = document.getElementById('bug-arena');
  if (!SA || !canvas) return;
  const status = document.getElementById('bug-status');
  const learningBtn = document.getElementById('bug-learning');
  const pause = document.getElementById('bug-pause');
  const restart = document.getElementById('bug-restart');
  const ctx = canvas.getContext('2d');
  const baselineCanvas = document.getElementById('bug-baseline');
  const baselineCtx = baselineCanvas ? baselineCanvas.getContext('2d') : null;
  const championUrl = canvas.dataset.champion;
  const garden = SA.bug.GARDEN;
  let learningOn = true, visible = false, started = false;
  let selected = { id: 'v3h', change: null };
  let agent = null, baseline = null, seed = 0, playing = true, previous = 0, frame = 0, finishedAt = null, elapsed = 0;
  const MS_PER_TICK = 22;

  async function load() {
    try {
      const response = await fetch(championUrl, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data.id === 'string') selected = data;
      }
    } catch (e) { /* keep the last champion */ }
  }

  function genome() {
    const change = selected && selected.change ? selected.change : null;
    const g = SA.tunedBugGenome(change && change.tune ? change.tune : undefined);
    if (change && change.field && g.sc && g.sc[change.field] != null && isFinite(change.factor)) g.sc[change.field] *= change.factor;
    return g;
  }

  function applyLearning() {
    SA.params.plasticity = learningOn;
    if (learningBtn) {
      learningBtn.textContent = 'Learning: ' + (learningOn ? 'On' : 'Off');
      learningBtn.setAttribute('aria-pressed', learningOn ? 'true' : 'false');
      learningBtn.classList.toggle('is-learning-on', learningOn);
      learningBtn.classList.toggle('is-learning-off', !learningOn);
    }
    // net.learning is a getter on SA.params.plasticity in the current engine; older engines kept a plain field.
    const d = agent && agent.net ? Object.getOwnPropertyDescriptor(agent.net, 'learning') : null;
    if (d && d.writable) agent.net.learning = !!(learningOn && agent.net.plastic && agent.net.plastic.length > 0 && agent.net.p && agent.net.p.lr > 0);
  }

  function line(brain) {
    const t = brain.task, s = t.stats();
    return 'Food ' + s.food + ' · Poison ' + s.poison + ' · Score ' + t.score() + ' · Time ' + brain.t + ' of ' + t.horizon +
      ' · ' + brain.brain.N + ' neurons';
  }

  function render(brain, surface, context) {
    if (surface.width !== 1120 || surface.height !== 700) { surface.width = 1120; surface.height = 700; }
    brain.task.render(context, surface.width, surface.height, { showStats: false });
    return line(brain);
  }

  function draw() {
    if (!agent) return;
    const done = agent.done ? ' · Round over, a new one starts in a moment' : '';
    const text = render(agent, canvas, ctx);
    if (!baseline) {
      status.textContent = (learningOn ? 'Learning on · ' : 'Learning off · ') + text + done;
      return;
    }
    document.getElementById('bug-champion-score').textContent = text;
    document.getElementById('bug-baseline-score').textContent = render(baseline, baselineCanvas, baselineCtx);
    status.textContent = 'Same garden and seed for both' + (selected.id !== 'v3h' ? ' · current brain = original + one tested change' :
      ' · no tested change has beaten the original yet, so both are the same brain') + done;
  }

  function start() {
    const params = SA.recommendedEnvParams('bug', { task: 'flash' }, ['task']);
    SA.setEnv('bug', Object.assign({}, params, { task: 'flash' }));
    const current = SA.currentEnv();
    const env = Object.assign({}, current, { def: Object.assign({}, current.def, { create: (s, p) => new SA.bug.World(s, p, garden) }) });
    SA.params.plasticity = learningOn;
    const g = genome();
    seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    agent = new SA.Agent(g, seed, SA.growCell(g, { seed, spec: env.spec }), env);
    if (baselineCanvas) {
      const original = SA.PLANS.v3h.make();
      baseline = new SA.Agent(original, seed, SA.growCell(original, { seed, spec: env.spec }), env);
    }
    applyLearning();
    playing = true; finishedAt = null; elapsed = 0;
    pause.textContent = 'Pause';
    draw();
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const delta = Math.min(50, now - previous);
    previous = now;
    if (!playing || !visible || document.hidden || !agent) { elapsed = 0; return; }
    if (agent.done) {
      if (finishedAt === null) { finishedAt = now; draw(); }
      if (now - finishedAt >= 2000) start();
      return;
    }
    elapsed += delta;
    if (elapsed < MS_PER_TICK) return;
    while (elapsed >= MS_PER_TICK && !agent.done) {
      elapsed -= MS_PER_TICK;
      agent.tick();
      if (baseline && !baseline.done) baseline.tick();
    }
    draw();
  }

  async function newArena() {
    try {
      await load();
      start();
      pause.disabled = restart.disabled = false;
    } catch (error) {
      if (window.console) console.error('arena:', error);
      status.textContent = 'The arena could not load. Refresh the page to try again.';
    }
  }

  if (learningBtn) learningBtn.addEventListener('click', () => { learningOn = !learningOn; applyLearning(); draw(); });
  pause.addEventListener('click', () => { playing = !playing; pause.textContent = playing ? 'Pause' : 'Resume'; });
  restart.addEventListener('click', newArena);
  setInterval(async () => {
    if (!visible || document.hidden) return;
    const before = selected.id;
    await load();
    if (selected.id !== before) start();
  }, 60000);

  const demo = {
    show() { visible = true; if (!started) { started = true; newArena(); } },
    hide() { visible = false; },
  };
  if (window.ExploreDemos) window.ExploreDemos.arena = demo;
  else demo.show();
})();
