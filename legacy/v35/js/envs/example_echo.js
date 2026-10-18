// Minimal example environment (see README "How to add a new environment"). Not loaded by default:
// add <script src="js/envs/example_echo.js"></script> to index.html (before js/ui/app.js) and to FILES in js/node_load.js.
(function () {
  'use strict';
  const { registerEnv, Enc, Dec, mulberry32 } = SpikingArena;
  class EchoTask {
    constructor(seed, P) {
      this.P = P; this.rng = mulberry32(seed); this.t = 0; this.horizon = P.ticks;
      this.rewardLog = []; this.hits = 0; this.n = 0; this.light = 0;
    }
    get done() { return this.t >= this.P.ticks; }
    sense(ext) {                                    // encoders: write input currents
      if (this.t % 20 === 0) this.light = this.rng() < 0.5 ? 1 : 0;
      Enc.current(ext, 0, this.light, this.P.gain);  // input 0 = 'light'
      Enc.current(ext, 1, 1, 1.5);                   // input 1 = tonic drive
    }
    act(out) {                                      // decoders: read output spikes
      const on = Dec.wta(out.spikes, [0]) === 0;      // did 'lamp' spike this tick?
      this.t++; this.n++; const ok = on === (this.light === 1);
      if (ok) this.hits++; const reward = ok ? 0.01 : -0.01; this.rewardLog.push(reward);
      return { pos: ok && on ? 1 : 0, neg: ok ? 0 : 1, pain: 0, reward };   // dopamine for plasticity
    }
    fitness() { return 10 * this.hits / Math.max(1, this.n); }
    score() { return this.hits / Math.max(1, this.n); }
    stats() { return { accuracy: this.score() }; }
    statusLine() { return `tick ${this.t} · light ${this.light} · accuracy ${(100 * this.score()).toFixed(0)}%`; }
    render(ctx, W, H) { ctx.fillStyle = this.light ? '#ff0' : '#222'; ctx.fillRect(0, 0, W, H); }
  }
  registerEnv({
    id: 'echo', name: 'Echo: light on -> lamp on', description: 'Fire the lamp neuron while the light is on.',
    view: { w: 400, h: 300 },
    params: { ticks: { value: 400, min: 100, max: 2000, step: 100, label: 'Ticks per episode' },
              gain:  { value: 10, min: 0, max: 30, step: 1, label: 'Input gain' } },
    io: P => ({
      inputs:  [{ name: 'light', group: 'sense', tag: 1, pos: [0, 1], cue: true },
                { name: 'tonic', group: 'tonic', tag: 7, pos: [0.5, 1], tonic: true }],
      outputs: [{ name: 'lamp', group: 'motor', tag: 4, pos: [0, -1] }],
    }),
    create: (seed, P, spec) => new EchoTask(seed, P),
    defaultPlan: 'v1',
  });
})();
