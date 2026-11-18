// node sw/fibtype.js <k> <variant> <tag>: grow only (as r42 k); dump cellType, region name, column source/col of every cell -> sw/out/ft_<tag>_<k>.json
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag] = process.argv.slice(2), k = +k0;
const task = { name: 'r42', env: 'seq', params: { source: 'book', nSyms: 1000, evalSyms: 200 } };
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const b = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], b, env), net = a.net, G = net.g, N = net.N;
const col = new Array(N).fill(null); net.gu.src.forEach((S, s) => { for (let c = 0; c < S.keys.length; c++) for (let q = S.off[c]; q < S.off[c + 1]; q++) { const id = S.cells[q]; if (id >= 0 && id < N) col[id] = [s, String(S.keys[c])]; } });
const out = { nIn: G.nIn, nHid: G.nHid, regionNames: (b.regions || []).map(r => r.name), region: Array.from(G.region.slice(0, G.nIn + G.nHid)), cellType: Array.from((G.cellType || b.cellType || []).slice(0, G.nIn + G.nHid)), gran: G.gran ? Array.from(G.gran.slice(0, G.nIn + G.nHid)) : null, thresh: Array.from(G.thresh.slice(0, G.nIn + G.nHid)), pos: (G.pos || b.pos || []).slice(0, G.nIn + G.nHid), col };
fs.writeFileSync(`sw/out/ft_${tag}_${k}.json`, JSON.stringify(out)); console.log('ok', Object.keys(out), out.cellType.length);
