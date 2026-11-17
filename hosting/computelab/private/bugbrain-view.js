(() => {
  'use strict';
  const SA = window.SpikingArena;
  const canvas = document.getElementById('bug-arena');
  const status = document.getElementById('bug-status');
  const titleEl = document.getElementById('bug-title');
  const archDescEl = document.getElementById('bug-arch-desc');
  const learningBtn = document.getElementById('bug-learning');
  const pause = document.getElementById('bug-pause');
  const restart = document.getElementById('bug-restart');
  const leftHeading = document.getElementById('bug-left-heading');
  const rightHeading = document.getElementById('bug-right-heading');
  const ctx = canvas.getContext('2d');
  const baselineCanvas = document.getElementById('bug-baseline');
  const baselineCtx = baselineCanvas?.getContext('2d');
  const championUrl = canvas.dataset.champion;
  const garden = SA.bug.GARDEN;

  const SHOWCASES = {
    'bug-forage': {
      title: 'BugBrain Foraging Arena',
      sotaName: 'bugSOTA',
      desc: 'State-of-the-Art grown foraging brain (bugSOTA): compound ommatidia, enthusiastic green-apple pursuit, strict ipsilateral red-poison avoidance, commissural bump-escape reflex, and central working-memory attractors.',
      env: 'bug',
      envParams: { task: 'flashvis', episodeTicks: 1000, sotaPhysics: true },
      useGarden: true,
      msPerTick: 22,
    },
    'bug-flash': {
      title: 'Spatial Working Memory Arena',
      sotaName: 'bugSOTA',
      desc: 'State-of-the-Art working-memory foraging brain (bugSOTA): green apples flash visible only 8% of the time; slow-leak recurrent M interneurons hold the unseen apple’s direction and guide the bug after the flash.',
      env: 'bug',
      envParams: { task: 'flash', episodeTicks: 1000, sotaPhysics: true },
      useGarden: true,
      msPerTick: 22,
    },
    'bug-reversal': {
      title: 'Dopamine Valence Reversal Arena',
      sotaName: 'bugSOTA',
      desc: 'State-of-the-Art adaptive foraging brain (bugSOTA): halfway through life (tick 500), green and red apples swap meaning; dopamine reward prediction error rewires plastic sensorimotor synapses online.',
      env: 'bug',
      envParams: { task: 'normal', reversal: true, episodeTicks: 1000, sotaPhysics: true },
      useGarden: true,
      msPerTick: 22,
    },
    'bug-hard': {
      title: 'Predator Survival & Moving Targets',
      sotaName: 'bugSOTA',
      desc: 'State-of-the-Art survival brain (bugSOTA): apples drift while a predator actively chases the bug; combines rapid ipsilateral predator-evasion reflexes with high-speed green-apple pursuit.',
      env: 'bug',
      envParams: { task: 'hard', episodeTicks: 1000, sotaPhysics: true },
      useGarden: false,
      msPerTick: 22,
    },
    'seq-fables': {
      title: 'English Language & Fables Prediction',
      sotaName: 'deepURSx3_chunk',
      desc: 'State-of-the-Art 4-region brain (deepURSx3_chunk): Two-timescale Event-Gated Cortical Chunking + Cerebellar Granule Layer with Utility-Pruned Structural Plasticity (granUtility=1) predicting Aesop’s Fables live with 100% local learning.',
      env: 'seq',
      envParams: { source: 'fables', nSyms: 600, clock2: true, readIn: 0.01 },
      useGarden: false,
      msPerTick: 16,
    },
    'seq-order3': {
      title: '3rd-Order Temporal Context Grammar',
      sotaName: 'deepURSx3_chunk',
      desc: 'State-of-the-Art 4-region brain (deepURSx3_chunk): holds 3 consecutive symbols in slow-leak working-memory and event-gated chunk attractors to predict context-dependent transitions past the 1st/2nd-order limit.',
      env: 'seq',
      envParams: { source: 'order3', K: 8, nSyms: 400, clock2: true, readIn: 0.01 },
      useGarden: false,
      msPerTick: 16,
    },
    'memory-recall': {
      title: 'Delayed Associative Working Memory',
      sotaName: 'unifiedR',
      desc: 'State-of-the-Art multi-region brain (unifiedR): reverberating cortical attractor columns hold a brief sensory cue across a blank delay period, while striatal dopamine plasticity learns the cue-to-action mapping.',
      env: 'recall',
      envParams: { K: 4, delay: 20, nTrials: 24 },
      useGarden: false,
      msPerTick: 18,
    },
    'rl-bandit': {
      title: 'Dopamine Reinforcement & Reversal Learning',
      sotaName: 'unifiedR',
      desc: 'State-of-the-Art cortico-striatal actor-critic brain (unifiedR): learns which action arm is rewarded in each context via TD dopamine reward prediction error (r − V) and rapidly adapts when the best arm switches.',
      env: 'bandit',
      envParams: { C: 2, K: 4, switchEvery: 12, nTrials: 48 },
      useGarden: false,
      msPerTick: 18,
    },
  };

  let currentShowcase = 'bug-forage';
  let learningOn = true;
  let selected = { id: 'v3h', change: null };
  let agent, baseline, seed, playing = true, previous = 0, frame = 0, finishedAt = null;
  let elapsed = 0;

  async function load() {
    try {
      const response = await fetch(championUrl, { cache: 'no-store' });
      if (response.ok) selected = await response.json();
    } catch (e) {}
  }

  function applyLearningState() {
    SA.params.plasticity = learningOn;
    if (learningBtn) {
      learningBtn.textContent = 'Learning: ' + (learningOn ? 'On' : 'Off');
      learningBtn.setAttribute('aria-pressed', learningOn ? 'true' : 'false');
      learningBtn.classList.toggle('is-learning-on', learningOn);
      learningBtn.classList.toggle('is-learning-off', !learningOn);
    }
    if (agent && agent.net) {
      agent.net.learning = !!(learningOn && agent.net.plastic && agent.net.plastic.length > 0 && agent.net.p.lr > 0);
    }
  }

  function formatStatus(brain, label, isLearnOn) {
    const t = brain.task;
    const learnTag = isLearnOn ? 'Learning ON' : 'Learning OFF (Frozen)';
    const nSyn = SA.countSynapses ? SA.countSynapses(brain.brain) : (brain.net && brain.net.ws ? brain.net.ws.length : 0);
    const archTag = brain.brain.N + ' neurons · ' + nSyn + ' synapses';
    if (currentShowcase.indexOf('bug-') === 0) {
      const stats = t.stats();
      return 'SOTA ' + label + ' (' + learnTag + ' · ' + archTag + ') · Food ' + stats.food +
        ' · Poison ' + stats.poison +
        (t.hard ? ' · Caught ' + stats.caught : '') +
        ' · Score ' + t.score() +
        ' · Fitness ' + brain.fitness.toFixed(1) +
        ' · Tick ' + brain.t + '/' + t.horizon +
        ' · Stuck ' + (100 * stats.stuck / Math.max(1, brain.t)).toFixed(0) + '%';
    }
    if (t.accuracy != null && t.lastAcc) {
      const acc = t.n ? (100 * t.accuracy).toFixed(1) + '%' : '0.0%';
      const last = t.n ? (100 * t.lastAcc(100)).toFixed(1) + '%' : '0.0%';
      return 'SOTA ' + label + ' (' + learnTag + ' · ' + archTag + ') · Accuracy ' + acc +
        ' · Last 100 symbols: ' + last +
        ' · Symbol ' + Math.min((t.pos || 0) + 1, t.P.nSyms) + '/' + t.P.nSyms;
    }
    if (t.statusLine) {
      return 'SOTA ' + label + ' (' + learnTag + ' · ' + archTag + ') · ' + t.statusLine();
    }
    return 'SOTA ' + label + ' (' + learnTag + ' · ' + archTag + ') · Tick ' + brain.t;
  }

  function drawBrain(brain, surface, context, label, isLearnOn) {
    if (tHasRender(brain.task)) {
      const view = SA.currentEnv().def.view || { width: 1120, height: 700 };
      const w = currentShowcase.indexOf('bug-') === 0 && SHOWCASES[currentShowcase].useGarden ? 1120 : view.width;
      const h = currentShowcase.indexOf('bug-') === 0 && SHOWCASES[currentShowcase].useGarden ? 700 : view.height;
      if (surface.width !== w || surface.height !== h) {
        surface.width = w;
        surface.height = h;
      }
      brain.task.render(context, surface.width, surface.height, { showStats: false });
    }
    return formatStatus(brain, label, isLearnOn);
  }

  function tHasRender(task) {
    return task && typeof task.render === 'function';
  }

  function draw() {
    if (!agent) return;
    const sc = SHOWCASES[currentShowcase];
    const sotaLabel = sc.sotaName + (currentShowcase.indexOf('bug-') === 0 && selected && selected.id !== 'v3h' ? '+' + selected.id : '');
    const score = drawBrain(agent, canvas, ctx, sotaLabel, learningOn);
    const completed = agent.done ? ' · Round complete' : '';
    if (!baseline) {
      status.textContent = score + completed;
      return;
    }
    if (leftHeading) leftHeading.textContent = 'SOTA ' + sotaLabel + ' (' + (learningOn ? 'Learning On' : 'Learning Off') + ')';
    if (rightHeading) rightHeading.textContent = currentShowcase.indexOf('bug-') === 0 ? 'Original BugBrain (v3h baseline)' : ('SOTA ' + sotaLabel + ' (Learning Off / Frozen)');
    document.getElementById('bug-champion-score').textContent = score;
    const baseLabel = currentShowcase.indexOf('bug-') === 0 ? 'v3h' : sc.sotaName;
    const baseLearn = currentShowcase.indexOf('bug-') === 0 ? learningOn : false;
    document.getElementById('bug-baseline-score').textContent = drawBrain(baseline, baselineCanvas, baselineCtx, baseLabel, baseLearn);
    status.textContent = 'Shared seed ' + seed + ' · Tick ' + agent.t +
      ' · Comparing SOTA ' + sotaLabel + ' vs ' + (currentShowcase.indexOf('bug-') === 0 ? 'Original v3h' : 'Frozen baseline') + completed;
  }

  function makeSotaGenome(sc) {
    if (sc.sotaName === 'bugSOTA') {
      const g = SA.createSotaBugGenome ? SA.createSotaBugGenome(selected?.change?.tune) : SA.tunedBugGenome(selected?.change?.tune);
      if (selected?.change?.field && g.sc && g.sc[selected.change.field] != null) {
        g.sc[selected.change.field] *= selected.change.factor;
      }
      return g;
    }
    if (sc.sotaName === 'deepURSx3_chunk' && SA.PLANS.deepURSx3_chunk) {
      SA.params.fastEngine = 1;
      SA.params.granFast = 1;
      SA.params.granUtility = 1;
      SA.params.scaleInvariant = 1;
      SA.params.granN = 2048;
      SA.params.granKmin = 3;
      SA.params.granK = 4;
      SA.params.granW = 60;
      const g = SA.PLANS.deepURSx3_chunk.make();
      for (const r of g.regions || []) if (r.id === 'cortex' && r.g && r.g.pl) r.g.pl.lr = 0.2;
      return g;
    }
    if (SA.PLANS[sc.sotaName]) {
      SA.params.scaleInvariant = 1;
      return SA.PLANS[sc.sotaName].make();
    }
    return SA.planFor('env').make();
  }

  function start() {
    const sc = SHOWCASES[currentShowcase] || SHOWCASES['bug-forage'];
    if (titleEl) titleEl.textContent = sc.title;
    if (archDescEl) archDescEl.textContent = sc.desc;
    SA.params.plasticity = learningOn;
    const params = SA.recommendedEnvParams(sc.env, sc.envParams, Object.keys(sc.envParams));
    SA.setEnv(sc.env, Object.assign({}, params, sc.envParams));
    const current = SA.currentEnv();
    const env = sc.useGarden
      ? { ...current, def: { ...current.def, create: (s, p) => new SA.bug.World(s, p, garden) } }
      : current;
    const genome = makeSotaGenome(sc);
    seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    const grown = SA.growCell(genome, { seed, spec: env.spec });
    agent = new SA.Agent(genome, seed, grown, env);
    applyLearningState();
    if (baselineCanvas) {
      if (currentShowcase.indexOf('bug-') === 0) {
        const baseEnv = sc.useGarden
          ? { ...current, P: Object.assign({}, current.P, { sotaPhysics: false }), def: { ...current.def, create: (s, p) => new SA.bug.World(s, Object.assign({}, p, { sotaPhysics: false }), garden) } }
          : current;
        const original = SA.PLANS.v3h.make();
        baseline = new SA.Agent(original, seed, SA.growCell(original, { seed, spec: baseEnv.spec }), baseEnv);
      } else {
        SA.params.plasticity = false;
        baseline = new SA.Agent(genome, seed, grown, env);
        baseline.net.learning = false;
        SA.params.plasticity = learningOn;
      }
    } else {
      baseline = null;
    }
    playing = true;
    finishedAt = null;
    elapsed = 0;
    pause.textContent = 'Pause';
    draw();
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const delta = Math.min(50, now - previous);
    previous = now;
    if (!playing || document.hidden || !agent) {
      elapsed = 0;
      return;
    }
    if (agent.done) {
      if (finishedAt === null) finishedAt = now;
      if (now - finishedAt >= 2000) start();
      return;
    }
    const sc = SHOWCASES[currentShowcase] || SHOWCASES['bug-forage'];
    const stepMs = sc.msPerTick || 22;
    elapsed += delta;
    if (elapsed < stepMs) return;
    while (elapsed >= stepMs && !agent.done) {
      elapsed -= stepMs;
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
      status.textContent = 'The arena could not load: ' + (error && error.message ? error.message : 'refresh to try again.');
    }
  }

  if (learningBtn) {
    learningBtn.addEventListener('click', () => {
      learningOn = !learningOn;
      applyLearningState();
      draw();
    });
  }

  document.querySelectorAll('.showcase-tab[data-showcase]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-showcase');
      if (!SHOWCASES[id]) return;
      currentShowcase = id;
      document.querySelectorAll('.showcase-tab[data-showcase]').forEach(b => {
        const active = b.getAttribute('data-showcase') === id;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      start();
    });
  });

  pause.addEventListener('click', () => {
    playing = !playing;
    pause.textContent = playing ? 'Pause' : 'Resume';
  });
  restart.addEventListener('click', newArena);
  setInterval(async () => {
    if (!selected || document.hidden) return;
    const before = selected.id;
    try {
      await load();
      if (selected.id !== before && currentShowcase.indexOf('bug-') === 0) start();
    } catch (error) {}
  }, 60000);
  newArena();
})();
