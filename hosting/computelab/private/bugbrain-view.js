(() => {
  'use strict';
  const SA = window.SpikingArena;
  const canvas = document.getElementById('bug-arena');
  const status = document.getElementById('bug-status');
  const pause = document.getElementById('bug-pause');
  const restart = document.getElementById('bug-restart');
  const ctx = canvas.getContext('2d');
  const championUrl = canvas.dataset.champion;
  let selected, agent, playing = true, previous = 0, frame = 0;

  async function load() {
    const response = await fetch(championUrl, { cache: 'no-store' });
    if (!response.ok) throw Error('Champion request failed');
    selected = await response.json();
  }

  function draw() {
    agent.task.render(ctx, canvas.width, canvas.height);
    const stats = agent.task.stats();
    status.textContent = 'Brain ' + selected.id + ' · Food ' + stats.food + ' · Poison ' + stats.poison +
      ' · Score ' + agent.fitness.toFixed(1);
  }

  function start() {
    const params = SA.recommendedEnvParams('bug', { task: 'flash' }, ['task']);
    SA.setEnv('bug', { ...params, task: 'flash' });
    const env = SA.currentEnv();
    const genome = SA.PLANS.v3h.make();
    if (selected.change) genome.sc[selected.change.field] *= selected.change.factor;
    const seed = Math.floor(Math.random() * 0xffffffff);
    agent = new SA.Agent(genome, seed, SA.growCell(genome, { seed, spec: env.spec }), env);
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
