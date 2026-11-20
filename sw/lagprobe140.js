// node sw/lagprobe140.js <k> <variant> <tag> [nSyms] [K] [dMin] [dMax]: R140 long-context probe (seq source 'delaycopy', copy after delay)
// -> sw/out/lp_<tag>_<k>.json: overall acc, probe acc (letter after the cue) in the 2nd half of life, by lag of the payload (cue = lag 0)
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag, nS, K0, d0, d1] = process.argv.slice(2), k = +k0;
const tj = { env: 'seq', params: { source: 'delaycopy', K: +(K0 || 12), dMin: +(d0 || 4), dMax: +(d1 || 30), nSyms: +(nS || 10000), clock2: true, clock3: true, readIn: 0.01 } }, task = Object.assign({ name: 'r140' }, tj);
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { if (!kv) continue; const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], brain, env), net = a.net;
const t0 = Date.now(); while (!a.done) a.tick();
const T = a.task, seq = T.seq, hits = T.hits, dc = T.rule.delaycopy, h0 = hits.length >> 1, bins = {}, all = [0, 0];
for (let i = h0; i < hits.length; i++) { if (seq[i] !== dc.cue) continue; let j = i - 1; while (j >= 0 && seq[j] >= dc.pay) j--; if (j < 0) continue; const lag = i - j, b = lag <= 8 ? '5-8' : lag <= 16 ? '9-16' : '17-31';
  (bins[b] = bins[b] || [0, 0])[0] += hits[i]; bins[b][1]++; all[0] += hits[i]; all[1]++; }
const gu = net.granUtilityStats ? net.granUtilityStats() : null, st = gu || {};
const out = { k, tag, variant, acc: +T.accuracy.toFixed(4), probeAcc: +(all[0] / all[1]).toFixed(4), probeN: all[1], bins: Object.fromEntries(Object.entries(bins).map(([b, v]) => [b, { acc: +(v[0] / v[1]).toFixed(4), n: v[1] }])),
  lagRec: st.lagRec || 0, lagFired: st.lagFired || 0, exact: st.exact, sec: (Date.now() - t0) / 1000, desc: T.rule.desc };
fs.writeFileSync(`sw/out/lp_${tag}_${k}.json`, JSON.stringify(out)); console.log(JSON.stringify(out));
