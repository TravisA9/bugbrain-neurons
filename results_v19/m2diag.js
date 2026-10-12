// Is the previous symbol held in M2 during the read window? (column of the most active M2 / M cells vs the true symbols)
const SA = require('../js/node_load.js')();
const SRC = process.env.SRC || 'fables', NS = +(process.env.NS || 1000), T = Object.assign({}, SA[process.env.BASE || 'PREDICT2_XG'], JSON.parse(process.env.TUNE || '{}'));
const [source, KK] = SRC.split(':');
const env = SA.setEnv('seq', { source, K: +(KK || 4), nSyms: NS, clock2: true }), K = env.spec.outputs.length, xs = env.spec.inputs.slice(0, K).map(c => c.pos[0]);
const d = SA.createPredict2Plan(T), b = SA.growCell(d, { seed: +(process.env.SEED || 20), spec: env.spec, record: true }), a = new SA.Agent(d, 1020, b, env), task = a.task;
const B = T.bands, nm = T.mix ? ['top', 'M', 'X', 'R', 'M2', 'X2', 'C', 'G', 'P'] : ['top', 'M', 'X', 'R', 'M2', 'X2', 'C', 'P'];
const bandOf = i => { const y = b.pos[i][1]; let k = 0; while (k < B.length && y < B[k]) k++; return nm[k]; };
const lab = new Map(); for (const c of b.devLog.cells) if (c.node >= 0 && c.topo != null) lab.set(c.node, c.topo);
const colOf = i => { const x = lab.has(i) ? lab.get(i) : b.pos[i][0]; let bi = 0; for (let k = 1; k < K; k++) if (Math.abs(xs[k] - x) < Math.abs(xs[bi] - x)) bi = k; return bi; };
const pops = {}; for (let i = b.nIn; i < b.nIn + b.nHid; i++) (pops[bandOf(i)] = pops[bandOf(i)] || []).push(i);
console.log('cells per band', Object.fromEntries(Object.entries(pops).map(([k, v]) => [k, v.length])));
const per = {}; for (const bn of ['M', 'M2', 'R', 'X2']) per[bn] = new Array(K).fill(0);
for (const bn of ['M', 'M2']) for (const i of pops[bn] || []) per[bn][colOf(i)]++;
console.log('M2 cells per column', per.M2.join(' '));
const st = { M: [0, 0, 0], M2: [0, 0, 0] }, byRep = { same: [0, 0], diff: [0, 0] }, byPrev = Array.from({ length: K }, () => [0, 0]);
const sp = new Float32Array(b.N), colAct = new Float64Array(K), colRight = new Float64Array(K); let nSl = 0;
while (!a.done) { const pos = task.pos, ph = task.phaseT; a.tick(n => { if (ph >= 6) for (let i = b.nIn; i < b.nIn + b.nHid; i++) sp[i] += n.spiked[i]; });
  if (task.pos !== pos && pos > 0) { const cur = task.seq[pos], prev = task.seq[pos - 1];
    for (const [bn, tgt] of [['M', cur], ['M2', prev]]) { const c = new Float64Array(K); let tot = 0; for (const i of pops[bn]) { c[colOf(i)] += sp[i]; tot += sp[i]; }
      let bi = 0; for (let k = 1; k < K; k++) if (c[k] > c[bi]) bi = k; if (tot === 0) st[bn][2]++; else if (bi === tgt) st[bn][0]++; else st[bn][1]++;
      if (bn === 'M2') { nSl++; for (let k = 0; k < K; k++) if (c[k] > 0) { colAct[k]++; if (k === prev) colRight[k]++; } const r = prev === cur ? byRep.same : byRep.diff; r[0] += tot > 0 && bi === tgt; r[1]++; byPrev[prev][0] += tot > 0 && bi === tgt; byPrev[prev][1]++; } }
    sp.fill(0); } }
console.log('read window, most active column right / wrong / silent:', JSON.stringify(st));
console.log('M2 right when prev == cur:', (byRep.same[0] / byRep.same[1]).toFixed(2), byRep.same[1], ' prev != cur:', (byRep.diff[0] / byRep.diff[1]).toFixed(2));
console.log('M2 column active in read window (share of slots) / active when it is prev:', Array.from(colAct, (v, k) => task.names[k] + ':' + (v / nSl).toFixed(2) + '/' + (colRight[k] / Math.max(1, task.seq.slice(0, nSl).filter(x => x === k).length)).toFixed(2)).join(' '));
console.log('M2 right by prev symbol:', byPrev.map((r, k) => task.names[k] + ':' + (r[1] ? (r[0] / r[1]).toFixed(2) : '-') + '/' + r[1]).join(' '));
