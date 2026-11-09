'use strict';
const G = require('./genome_v2.js');
const SF = require('./engine.js');
let n = 0;
function check(ok, what) { n++; if (!ok) { console.error('FAIL ' + what); process.exitCode = 1; } else console.log('ok   ' + what); }
function rngOf(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const v1 = { topology: 'memory', wa: 1.2, wb: 0.9, thr: 1.4, decay: 0.45, nodes: 3, depth: 2 };
const v2 = G.fromV1(v1);
check(v2.v === 2 && v2.modules.some(m => m.kind === 'lif' && m.sign === 1) && v2.modules.some(m => m.sign === -1), 'a v1 genome becomes excitatory and inhibitory populations');
check(JSON.stringify(v2).indexOf('stdp') < 0 && JSON.stringify(v2).indexOf('homeostasis') < 0, 'the design has no plasticity rule');

const seq = [[1, 0], [1, 1], [0, 1], [0, 0]];
const first = G.simulate(v2, seq);
const second = G.simulate(v2, seq);
check(JSON.stringify(first) === JSON.stringify(second), 'the same frozen genome and spikes repeat exactly');
const weights = G.compile(v2).edges.map(e => e.weight);
G.simulate(v2, seq);
check(JSON.stringify(G.compile(v2).edges.map(e => e.weight)) === JSON.stringify(weights), 'evaluation does not change weights');

const child = G.mutate(v2, rngOf(3));
check(child.v === 2 && JSON.stringify(child) !== JSON.stringify(v2), 'mutation changes a frozen parameter and stays v2');
const other = G.mutate(v2, rngOf(9));
const mixed = G.crossover(child, other, rngOf(4));
const mixedRun = G.simulate(mixed, seq);
check(mixed.wires.length > 0 && mixedRun.spikeCount >= 0, 'crossover still runs in the frozen simulator');

const direct = SF.simulateFrozen(G.compile(v2), seq);
check(direct.spikeCount === first.spikeCount && direct.outputs.join(',') === first.outputs.join(','), 'engine.js runs the same frozen step');
console.log(n + ' checks');
