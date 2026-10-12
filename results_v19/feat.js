// What could a readout do with the brain's own context cells? Records, per symbol slot, which cells with plastic outputs
// spiked (and how often) and scores online readouts on these feature sets (offline, same stream):
//   sum-norm   sum over active cells of their normalised successor counts (what preNorm weights approximate)
//   sum-count  sum of raw successor counts (experienced cells weigh more: an automatic back-off)
//   key        the whole active set as one context (most specific)
// [SRC=fables|text] [NS=2000] [NG=2] [BASE=PREDICT2_XG] [TUNE='{}'] [BANDS=1] node results_v19/feat.js
const SA = require('../js/node_load.js')();
const SRC = process.env.SRC || 'fables', NS = +(process.env.NS || 2000), NG = +(process.env.NG || 2), T = Object.assign({}, SA[process.env.BASE || 'PREDICT2_XG'], JSON.parse(process.env.TUNE || '{}'));
const agg = {}, add = (k, v) => agg[k] = (agg[k] || 0) + v / NG;
for (let g = 0; g < NG; g++) {
  const env = SA.setEnv('seq', { source: SRC, nSyms: NS, clock2: true }), K = env.spec.outputs.length;
  const d = SA.createPredict2Plan(T), b = SA.growCell(d, { seed: 20 + g, spec: env.spec }), a = new SA.Agent(d, 1020 + g, b, env), net = a.net, task = a.task;
  const B = T.bands, nm = T.mix ? ['top', 'M', 'X', 'R', 'M2', 'X2', 'C', 'G', 'P'] : ['top', 'M', 'X', 'R', 'M2', 'X2', 'C', 'P'];
  const bandOf = i => { const y = b.pos[i][1]; let k = 0; while (k < B.length && y < B[k]) k++; return nm[k]; };
  net.buildNp(); const XB = (process.env.XBANDS || '').split(',').filter(x => x), F = []; for (let i = b.nIn; i < b.nIn + b.nHid; i++) if (net.npStart[i + 1] > net.npStart[i] || XB.includes(bandOf(i))) F.push(i);
  if (g === 0) { const c = {}; for (const i of F) c[bandOf(i)] = (c[bandOf(i)] || 0) + 1; console.log('cells with plastic outputs by band:', JSON.stringify(c)); }
  const sp = new Float32Array(b.N), recs = [];
  while (!a.done) { const pos = task.pos; const ph = task.phaseT, PH = +(process.env.PH || 6); a.tick(n => { if (ph >= PH) for (const i of F) sp[i] += n.spiked[i]; });
    if (task.pos !== pos) { recs.push({ cur: task.seq[pos], prev: pos > 0 ? task.seq[pos - 1] : -1, pp: pos > 1 ? task.seq[pos - 2] : -1, tgt: task.seq[pos + 1], f: F.filter(i => sp[i] > 0).map(i => [i, sp[i]]) }); for (const i of F) sp[i] = 0; } }
  const st = task.stats(); add('brain lastQ', st.lastQuarter); add('brain acc', st.accuracy);
  add('active cells / slot', recs.reduce((s, r) => s + r.f.length, 0) / recs.length);
  const n = recs.length, q3 = Math.floor(n * 3 / 4), argmax = v => { let bi = 0; for (let i = 1; i < v.length; i++) if (v[i] > v[bi]) bi = i; return v[bi] > 0 ? bi : -1; };
  const run = (name, pred, upd) => { const cnt = new Map(); let c = 0, cl = 0; recs.forEach((r, j) => { const ok = pred(r, cnt) === r.tgt; c += ok; if (j >= q3) cl += ok; upd(r, cnt); }); add(name + ' lastQ', cl / (n - q3)); };
  const row = (cnt, k) => { let R = cnt.get(k); if (!R) cnt.set(k, R = new Float64Array(K)); return R; };
  const ctx = (name, kf) => run(name, (r, c) => argmax(row(c, kf(r))), (r, c) => row(c, kf(r))[r.tgt]++);
  ctx('ideal1', r => r.cur); ctx('ideal2 strict', r => r.prev + ',' + r.cur); ctx('ideal3 strict', r => r.pp + ',' + r.prev + ',' + r.cur);
  run('ideal2 backoff', (r, c) => { const R = c.get('2' + r.prev + ',' + r.cur); return argmax(R || row(c, '1' + r.cur)); }, (r, c) => { row(c, '2' + r.prev + ',' + r.cur)[r.tgt]++; row(c, '1' + r.cur)[r.tgt]++; });
  const sumR = (w) => (r, c) => { const v = new Float64Array(K); for (const [i] of r.f) { const R = row(c, i); let t = 0; for (const x of R) t += x; if (t > 0) { const f = w(t); for (let k = 0; k < K; k++) v[k] += f * R[k] / t; } } return argmax(v); };
  const upF = (r, c) => { for (const [i] of r.f) row(c, i)[r.tgt]++; };
  run('sum-norm', sumR(t => 1), upF); run('sum-count', sumR(t => t), upF); run('sum-conf t/(t+3)', sumR(t => t / (t + 3)), upF); run('sum-conf t/(t+10)', sumR(t => t / (t + 10)), upF); run('sum-conf t/(t+30)', sumR(t => t / (t + 30)), upF); run('sum-sqrt', sumR(t => Math.sqrt(t)), upF);
  if (process.env.BANDS) for (const bn of ['M', 'M2', 'C', 'G']) { const fb = (r, c) => sumR(t => t / (t + 3))({ f: r.f.filter(([i]) => bandOf(i) === bn) }, c); run('band ' + bn + ' only (conf)', fb, (r, c) => { for (const [i] of r.f) if (bandOf(i) === bn) row(c, i)[r.tgt]++; }); }
  for (const fld of ['cur', 'prev', 'pp']) { const cnt = new Map(); let cl = 0; recs.forEach((r, j) => { const v = new Float64Array(K);
      for (const [i] of r.f) { const R = row(cnt, i); let t = 0; for (const x of R) t += x; if (t > 0) for (let k = 0; k < K; k++) v[k] += R[k] / t; }
      if (j >= q3 && argmax(v) === r[fld]) cl++; if (r[fld] >= 0) for (const [i] of r.f) row(cnt, i)[r[fld]]++; }); add('decode ' + fld + ' from cells', cl / (n - q3)); }
  ctx('key (active set)', r => r.f.map(x => x[0]).join(','));
}
for (const [k, v] of Object.entries(agg)) console.log(k.padEnd(26), v.toFixed(3));
