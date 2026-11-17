process.chdir('/workspace/bb/run'); const L = require('/workspace/bb/run/lib.js'), SA = L.SA, fs = require('fs');
const k = 2950, variant = fs.readFileSync('/workspace/v47.txt', 'utf8').trim() + ',P.granUtility=2,P.granExact=1,P.granCo=1';
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.replace(/^,/, '').split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = isNaN(+v) ? v : +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), env = L.setupTask({ name: 'x', env: 'seq', params: { source: 'book', nSyms: 10000 } }), b = SA.growCell(L.deserialize(gc).g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(L.deserialize(gc).g, p.arenaSeeds[k], b, env);
const n = a.net, E = n.ws.length, nIn = b.nIn;
const lists = Object.entries(n).filter(([kk, v]) => (v instanceof Int32Array || v instanceof Uint32Array || Array.isArray(v)) && v.length > 100 && v.length <= E && typeof v[0] === 'number').map(([kk, v]) => [kk, new Set(v)]);
const flags = Object.entries(n).filter(([kk, v]) => (v instanceof Uint8Array) && v.length === E).map(([kk]) => kk);
const sel = []; for (let i = nIn; i < nIn + b.nHid; i++) { if (b.region[i] !== 0 || b.cellType[i] !== 23) continue; for (let q = n.start[i]; q < n.start[i + 1]; q++) { const j = n.posts[q]; if (b.cellType[j] === 17 && b.region[j] === 0) sel.push(q); } }
console.log('free->symbol synapses', sel.length, 'in lists:', lists.map(([kk, S]) => kk + ':' + sel.filter(q => S.has(q)).length + '/' + S.size).join(' '), 'flags:', flags.map(f => f + ':' + sel.filter(q => n[f][q]).length).join(' '));
console.log(Object.keys(n.p || {}).filter(x => /rule|hebb|stdp|instr|lr|plast/i.test(x)).map(x => x + '=' + n.p[x]).join(' '));
