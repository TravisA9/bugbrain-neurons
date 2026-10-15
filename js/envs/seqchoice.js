/* =====================================================================
 * envs/seqchoice.js — v30 (R31) 'Sequence + choice' (mixed task): a symbol stream as in 'seq' (three-phase clock,
 * a new sequence rule every lifetime) where every prediction is an ACTION: after each symbol the brain picks one of
 * K arms, and only the arm assigned to the NEXT symbol is rewarded. The arm assignment is a new random permutation
 * every lifetime (mapping 'random'), so the symbol shown next (the teacher) does not say which arm pays: the brain needs
 * the context of the sequence (a sequence area) AND reward learning (a reward area). Each choice is an outcome event
 * (reward or omitted reward), so the env carries both areal signals: the phase clock and a dopamine source.
 * mapping 'same': arm k pays for symbol k (prediction rewarded; the teacher alone suffices).
 * ===================================================================== */
(function () {
'use strict';
const SA = SpikingArena;
class SeqChoiceTask extends SA.SeqTask {
  constructor(seed, P, spec) {
    super(seed, P, spec); this.outcomeEv = true; const K = this.K, r = mulberry32((seed ^ 0x3c6ef372) >>> 0);
    this.map = Array.from({ length: K }, (_, i) => i);
    if (P.mapping === 'random') for (let i = K - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [this.map[i], this.map[j]] = [this.map[j], this.map[i]]; }
  }
  targetOf(s) { return this.map[s]; }
}
function io(P) { const s = SA.seqIO(Object.assign({}, P, { clock2: true, clock3: true })); s.outcome = true;
  s.outputs.forEach((o, k) => { o.name = 'arm_' + (k + 1); }); return s; }
registerEnv({
  id: 'seqchoice', name: 'Sequence + choice (mixed: context and reward)', view: { width: 700, height: 480 },
  description: 'A symbol stream with a new rule every lifetime; after each symbol pick an arm. Only the arm assigned (new every lifetime) to the NEXT symbol pays. Needs sequence context and reward learning together.',
  defaultPlan: 'unifiedR',
  taskKeys: ['source', 'K', 'mapping'],
  params: {
    source: { value: 'order2', label: 'Sequence', options: [['cycle', 'Cycle'], ['order2', 'Second-order pattern'], ['order3', 'Third-order pattern']] },
    K: { value: 6, min: 3, max: 12, step: 1, label: 'Symbols = arms' },
    mapping: { value: 'random', label: 'Which arm pays', options: [['random', 'A random arm per symbol (new every lifetime)'], ['same', 'The arm of the next symbol']] },
    nSyms: { value: 300, min: 20, max: 5000, step: 20, label: 'Symbols per lifetime' },
    onTicks: { value: 4, hidden: true }, holdTicks: { value: 4, hidden: true }, clock2: { value: true, hidden: true }, clock3: { value: true, hidden: true },
    wrongCost: { value: 0, hidden: true }, det: { value: 0.8, hidden: true },
    goTicks: { value: 1, hidden: true }, nClock: { value: 9, hidden: true }, readTicks: { value: 4, hidden: true }, readIn: { value: 0, hidden: true }, beta: { value: 0.5, hidden: true },
    inGain: { value: 10, hidden: true }, goGain: { value: 6, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  },
  io,
  create(seed, P, spec) { return new SeqChoiceTask(seed, P, spec); },
});
})();
