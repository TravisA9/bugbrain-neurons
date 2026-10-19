/* =====================================================================
 * agent.js — one brain living in one environment episode.
 * Every tick:  task.sense(ext)  -> input currents (encoders)
 *              output bias       -> ext of the output cells (spec)
 *              substeps x net.step()
 *              out.rates / out.spikes -> task.act(out) (decoders) -> reward events
 *              net.modulate(pos, neg, pain)  (dopamine for lifetime learning)
 * ===================================================================== */
'use strict';
const NO_EVENTS = { pos: 0, neg: 0, pain: 0 };
class Agent {
  // brain (optional): an already grown network for this genome (e.g. grown with another noise seed)
  // env (optional): { id, def, P, spec } from currentEnv(); default = the current environment
  constructor(genome, seed, brain, env) {
    this.env = env || currentEnv(); this.seed = seed >>> 0;
    this.task = this.env.def.create(this.seed, this.env.P, this.env.spec);
    this.setBrain(genome, brain);
  }
  setBrain(genome, brain) {
    this.genome = genome; this.brain = brain || phenotype(genome, this.env.spec); const S = params.lifeSub > 0 ? params.lifeSub : params.substeps;   // R68 lifeSub: substeps per tick in the life only (growth keeps params.substeps); dtRescale 1: the dynamics rescaled to the coarser step
    this.dtF = params.dtRescale > 0 && S !== params.substeps ? params.substeps / S : 0;
    this.net = this.dtF ? new SpikingNet(this.brain, { dt: this.dtF }) : new SpikingNet(this.brain);
    const n = this.brain.nOut; this.out = { rates: new Float64Array(n), spikes: new Uint16Array(n), input: new Float64Array(n) };   // input (v13): synaptic input summed over the tick (graded decoders)
  }
  get world() { return this.task; }          // (the bug arena's World; kept for older scripts)
  get t() { return this.task.t; }
  get done() { return this.task.done; }
  get fitness() { return this.task.fitness(); }
  // onSubstep(net) is an optional hook (used by the UI for raster plots)
  tick(onSubstep) {
    const net = this.net, ext = net.ext, g = this.brain, OUT = this.env.spec.outputs, o0 = g.nIn + g.nHid, nOut = g.nOut;
    const sp = this.out.spikes, rates = this.out.rates, inp = this.out.input;
    ext.fill(0);
    this.task.sense(ext, this);
    for (let m = 0; m < nOut; m++) { ext[o0 + m] = OUT[m].bias; sp[m] = 0; inp[m] = 0; }
    if (this.dtF) { const f = this.dtF; for (let i = 0; i < ext.length; i++) ext[i] *= f; }   // (input currents are mV per substep)
    for (let s = 0, S = params.lifeSub > 0 ? params.lifeSub : params.substeps; s < S; s++) {
      net.step();
      for (let m = 0; m < nOut; m++) { sp[m] += net.spiked[o0 + m]; inp[m] += net.syn[o0 + m]; }
      if (onSubstep) onSubstep(net);
    }
    for (let m = 0; m < nOut; m++) rates[m] = net.rate(o0 + m);
    const ev = this.task.act(this.out, this) || NO_EVENTS;
    net.modulate(ev.pos || 0, ev.neg || 0, ev.pain || 0, !!ev.outcome);
    return ev.reward || 0;
  }
}
// Run one whole episode; returns the agent (task holds the stats).
function runEpisode(genome, seed, brain, env, maxTicks) {
  const a = new Agent(genome, seed, brain, env); let n = 0;
  while (!a.done && n++ < (maxTicks || 1e7)) a.tick();
  return a;
}
const Sim = Agent;   // old name
Object.assign(SpikingArena, { Agent, Sim, runEpisode });
