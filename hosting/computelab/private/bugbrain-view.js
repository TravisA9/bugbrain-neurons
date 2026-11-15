(() => {
  'use strict';
  const SA = window.SpikingArena;
  const canvas = document.getElementById('bug-arena');
  const status = document.getElementById('bug-status');
  const pause = document.getElementById('bug-pause');
  const restart = document.getElementById('bug-restart');
  const ctx = canvas.getContext('2d');
  const baselineCanvas = document.getElementById('bug-baseline');
  const baselineCtx = baselineCanvas?.getContext('2d');
  const championUrl = canvas.dataset.champion;
  const width = canvas.width, height = canvas.height;
  const garden = { width, height, itemCount: 66, walls: [
    [10, 10, width - 10, 10], [width - 10, 10, width - 10, height - 10],
    [width - 10, height - 10, 10, height - 10], [10, height - 10, 10, 10],
    // Staggered gates connect the side passages to the central route.
    [225, 10, 225, 205], [225, 300, 225, 520], [225, 610, 225, 690],
    [535, 10, 535, 115], [535, 210, 535, 415], [535, 520, 535, 690],
    [865, 10, 865, 240], [865, 340, 865, 540], [865, 625, 865, 690],
    [10, 335, 135, 335], [315, 160, 455, 160], [325, 545, 535, 545],
    [535, 285, 705, 285], [705, 285, 705, 420], [625, 535, 780, 535],
    [955, 180, 1110, 180], [865, 465, 1015, 465], [1015, 465, 1015, 545],
  ] };
  let selected, agent, baseline, seed, playing = true, previous = 0, frame = 0;

  async function load() {
    const response = await fetch(championUrl, { cache: 'no-store' });
    if (!response.ok) throw Error('Champion request failed');
    selected = await response.json();
  }

  function drawBrain(brain, surface, context, id) {
    brain.task.render(context, surface.width, surface.height, { showStats: false });
    const stats = brain.task.stats();
    return 'Brain ' + id + ' · Food ' + stats.food + ' · Poison ' + stats.poison +
      ' · Fitness ' + brain.fitness.toFixed(1) + ' · Tick ' + brain.t + '/' + brain.task.horizon +
      ' · Wall contact ' + (100 * brain.task.contactTicks / Math.max(1, brain.t)).toFixed(0) + '%' +
      ' · Stuck ' + (100 * stats.stuck / Math.max(1, brain.t)).toFixed(0) + '%';
  }

  function draw() {
    const score = drawBrain(agent, canvas, ctx, selected.id);
    if (!baseline) {
      status.textContent = score;
      return;
    }
    document.getElementById('bug-champion-score').textContent = score;
    document.getElementById('bug-baseline-score').textContent = drawBrain(baseline, baselineCanvas, baselineCtx, 'v3h');
    status.textContent = 'Shared seed ' + seed + ' · Tick ' + agent.t +
      (selected.change ? '' : ' · The original is still the champion');
  }

  function start() {
    const params = SA.recommendedEnvParams('bug', { task: 'flash' }, ['task']);
    SA.setEnv('bug', { ...params, task: 'flash' });
    const current = SA.currentEnv();
    const env = { ...current, def: { ...current.def, create: (seed, params) => new SA.bug.World(seed, params, garden) } };
    const genome = SA.PLANS.v3h.make();
    if (selected.change) genome.sc[selected.change.field] *= selected.change.factor;
    seed = Math.floor(Math.random() * 0xffffffff);
    agent = new SA.Agent(genome, seed, SA.growCell(genome, { seed, spec: env.spec }), env);
    if (baselineCanvas) {
      const original = SA.PLANS.v3h.make();
      baseline = new SA.Agent(original, seed, SA.growCell(original, { seed, spec: env.spec }), env);
    }
    playing = true;
    pause.textContent = 'Pause';
    draw();
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    if (!playing || document.hidden || agent.done || now - previous < 32) return;
    previous = now;
    agent.tick();
    if (baseline && !baseline.done) baseline.tick();
    draw();
  }

  async function newArena() {
    try { await load(); start(); pause.disabled = restart.disabled = false; }
    catch (error) { status.textContent = 'The arena could not load. Refresh the page to try again.'; }
  }

  pause.addEventListener('click', () => {
    playing = !playing;
    pause.textContent = playing ? 'Pause' : 'Resume';
  });
  restart.addEventListener('click', newArena);
  setInterval(async () => {
    if (!selected || document.hidden) return;
    const before = selected;
    try {
      await load();
      if (before.id !== selected.id) start();
    } catch (error) { selected = before; }
  }, 60000);
  newArena();
})();
