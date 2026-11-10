'use strict';
/* The Discoveries playback must simulate exactly what the evaluator scored.
 * Loads snnPlayerJs() from pages.php and compares it with spikefoundry/genome_v2.js + engine.js + designer.js.
 * Run: node hosting/computelab/tests/snn_player_test.js [path-to-php] */
const path = require('path');
const { execFileSync } = require('child_process');
const vm = require('vm');
const root = path.resolve(__dirname, '../../..');
const SF = require(path.join(root, 'spikefoundry/engine.js'));
const G = require(path.join(root, 'spikefoundry/genome_v2.js'));
const D = require(path.join(root, 'spikefoundry/designer.js'));
const php = process.argv[2] || process.env.PHP || 'php';
const src = execFileSync(php, ['-r', 'require "' + path.join(__dirname, '../private/src/pages.php') + '"; echo snnPlayerJs();'], { encoding: 'utf8' });
const ctx = { SpikeFoundry: SF, Math, JSON, String, Object, Array };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const P = ctx.SnnPlayer;
let failed = 0, checks = 0;
function check(ok, label) { checks++; if (!ok) { failed++; console.log('FAIL ' + label); } }

check(P && typeof P.trace === 'function' && typeof P.mount === 'function', 'the player exposes its simulator and mount');
let rngState = 11;
const rng = () => { rngState = (rngState * 1103515245 + 12345) % 2147483648; return rngState / 2147483648; };
let runs = 0, bad = 0, scoreBad = 0, frozen = true;
Object.keys(SF.BASE_TASKS).forEach(task => {
  let g = D.blankFor ? D.blankFor(task) : G.blank(2, 1);
  for (let k = 0; k < 60; k++) {
    g = k % 7 === 6 ? G.crossover(g, G.mutate(g, rng), rng) : G.mutate(g, rng);
    if (k % 5 === 0) g.wires.forEach(w => { w.delay = Math.floor(rng() * 5); });
    const ref = G.compile(g), net = P.compile(g);
    if (JSON.stringify(ref.edges) !== JSON.stringify(net.edges) || ref.neurons.length !== net.neurons.length) bad++;
    const before = JSON.stringify(net.edges);
    SF.taskSamples(task, 6, false, k + 1).concat(SF.taskSamples(task, 4, true, 1)).forEach(c => {
      const a = G.simulate(g, c.seq), b = P.trace(net, c.seq);
      runs++;
      const perStep = b.spikes.reduce((n, row) => n + row.reduce((m, v, i) => m + (net.neurons[i].kind === 'input' ? 0 : v), 0), 0);
      if (a.spikeCount !== b.spikeCount || perStep !== b.spikeCount || JSON.stringify(a.outputs) !== JSON.stringify(b.outputs)) bad++;
    });
    if (JSON.stringify(net.edges) !== before) frozen = false;
    const ref4 = D.scoreGenome(g, task, 1 + k), mine = P.score(net, P.heldCases(task, 4));
    if (mine.spikes !== ref4.spikes || Math.abs(mine.quality - ref4.quality) > 1e-12 || Math.abs(mine.accuracy - ref4.accuracy) > 1e-12) scoreBad++;
  }
});
check(bad === 0, 'per-step replay matches simulateFrozen on ' + runs + ' runs (' + bad + ' differ)');
check(scoreBad === 0, 'held-out spikes, accuracy and quality equal designer.scoreGenome for every generated design');
check(frozen, 'the replay never writes a weight');
const v1 = { topology: 'memory', wa: 1.3, wb: 1.1, thr: 1.4, decay: 0.6, nodes: 3 };
check(JSON.stringify(P.compile(v1).edges) === JSON.stringify(G.compile(G.fromV1(v1)).edges), 'v1 genomes convert the same way');
const silent = P.compile({ v: 2, modules: [{ id: 'in', kind: 'input', n: 2 }, { id: 'e', kind: 'lif', n: 2, thr: 3, leak: 0.1 }, { id: 'out', kind: 'output', n: 1 }], wires: [{ from: 'in', to: 'e', pattern: 'all', weight: 0.1 }, { from: 'e', to: 'out', pattern: 'one', weight: 0.1 }] });
const st = P.trace(silent, P.heldCases('coincidence', 4)[0].seq);
check(st.spikeCount === 0 && st.sent.every(d => silent.neurons[silent.edges[d.e].from].kind === 'input'), 'a silent design records no internal spikes, only input pulses');
const cases = P.heldCases('coincidence', 4);
check(cases.length === 4 && JSON.stringify(cases) === JSON.stringify(SF.taskSamples('coincidence', 4, true, 99).map(s => ({ seq: s.seq, label: s.label }))), 'held-out cases do not depend on the job seed');
const tr = P.trace(P.compile(G.blank(2, 1)), cases[0].seq);
check(tr.sent.every(d => d.at === d.t + P.compile(G.blank(2, 1)).edges[d.e].delay + 1), 'pulses arrive after delay + 1 steps');
console.log((failed ? 'FAILED ' + failed + ' of ' : 'ok ') + checks + ' snn player checks (' + runs + ' replays)');
process.exit(failed ? 1 : 0);
