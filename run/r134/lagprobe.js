// node sw/lagprobe.js <k> <variant> <tag> [nSyms]: book life; per slot, spike counts of every non-granule hidden cell (whole slot) -> sw/out/lp_<tag>_<k>.{bin,json}
// for linear probes of the letter at lag L (sw/lagprobe.py)
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag, nS] = process.argv.slice(2), k = +k0, n = +(nS || 10000);
const task = { name: 'r42', env: 'seq', params: { source: 'book', nSyms: n, evalSyms: 2000 } };
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], brain, env), net = a.net, G = net.g;
const names = (gc.cell.regions || []).map(r => r.name || r.R && r.R.name);
const ids = []; for (let i = G.nIn; i < G.nIn + G.nHid; i++) if (!(G.gran && G.gran[i])) ids.push(i);
const col = new Int32Array(net.N).fill(-1); ids.forEach((i, q) => col[i] = q);
const cnt = new Float32Array(ids.length), rows = [], syms = [];
const RW = +process.env.RW || 0, Tk = () => a.task; let inRead = true;   // RW=1: count only the read window (the last readTicks ticks of the slot)
const st0 = net.step.bind(net); net.step = function () { st0(); if (RW && !inRead) return; const spk = net.spk; for (let s = 0; s < net.nSpk; s++) { const q = col[spk[s]]; if (q >= 0) cnt[q]++; } };
const T = a.task; let pos = T.pos;
while (!a.done) { if (RW) inRead = T.phaseT >= T.slot - T.P.readTicks; a.tick(); if (T.pos !== pos) { rows.push(Float32Array.from(cnt)); syms.push(T.seq[pos]); cnt.fill(0); pos = T.pos; } }
const buf = new Float32Array(rows.length * ids.length); rows.forEach((r, t) => buf.set(r, t * ids.length));
fs.writeFileSync(`sw/out/lp_${tag}_${k}.bin`, Buffer.from(buf.buffer));
fs.writeFileSync(`sw/out/lp_${tag}_${k}.json`, JSON.stringify({ k, tag, nCells: ids.length, nRows: rows.length, region: ids.map(i => names[G.region[i]] || String(G.region[i])), syms, heldAcc: T.stats ? T.stats().heldAcc : null }));
console.log(JSON.stringify({ k, tag, nCells: ids.length, nRows: rows.length }));
