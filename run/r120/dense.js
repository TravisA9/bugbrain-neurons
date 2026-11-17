// offline: do the dense (always-on) non-granule cells hurt a linear readout? prequential AdaGrad softmax (as hr/aug.js), held slots scored
const fs = require('fs'), b = process.argv[2], M = JSON.parse(fs.readFileSync(b + '.json'));
const rd = (f, T) => { const B = fs.readFileSync(f); return new T(B.buffer.slice(B.byteOffset, B.byteOffset + B.length)); };
const off = rd(b + '.off', Uint32Array), ix = rd(b + '.ix', Uint16Array), { nH, K, hf, seq, gran } = M, nS = off.length - 1;
const rate = new Float64Array(nH); for (let p = 0; p < ix.length; p++) rate[ix[p]]++; for (let i = 0; i < nH; i++) rate[i] /= nS;
function run(sel, orders) { const W = new Map(), G = new Map(), ids = new Map(), bias = new Float64Array(K), z = new Float64Array(K); let ok = 0, n = 0;
  const row = (f, m) => { let w = m.get(f); if (!w) { w = new Float64Array(K); m.set(f, w); if (m === G) w.fill(1e-6); } return w; };
  for (let t = 5; t < Math.min(nS, seq.length - 1) - 1; t++) { const F = []; for (let p = off[t]; p < off[t + 1]; p++) if (sel[ix[p]]) F.push(ix[p]);
    for (const o of orders) { let k = 'o' + o; for (let i = 0; i < o; i++) k += ',' + seq[t - i]; let id = ids.get(k); if (id == null) ids.set(k, id = nH + ids.size); F.push(id); }
    z.set(bias); for (const f of F) { const w = W.get(f); if (w) for (let j = 0; j < K; j++) z[j] += w[j]; }
    let m = -1e9, am = 0; for (let j = 0; j < K; j++) if (z[j] > m) { m = z[j]; am = j; } const y = seq[t + 1]; if (t >= hf) { n++; if (am === y) ok++; }
    let s = 0; for (let j = 0; j < K; j++) { z[j] = Math.exp(z[j] - m); s += z[j]; } for (let j = 0; j < K; j++) { z[j] = z[j] / s - (j === y ? 1 : 0); bias[j] -= 0.05 * z[j]; }
    for (const f of F) { const w = row(f, W), g2 = row(f, G); for (let j = 0; j < K; j++) { const gg = z[j] + 1e-4 * w[j]; g2[j] += gg * gg; w[j] -= 0.5 * gg / Math.sqrt(g2[j]); } } }
  return +(ok / n).toFixed(4); }
const S = f => Uint8Array.from({ length: nH }, (_, i) => f(i) ? 1 : 0), cnt = s => s.reduce((a, x) => a + x, 0);
const sets = { gran: S(i => gran[i]), all: S(() => 1), allNoDense50: S(i => rate[i] <= 0.5), allNoDense30: S(i => rate[i] <= 0.3), nonGran: S(i => !gran[i]), nonGranNoDense50: S(i => !gran[i] && rate[i] <= 0.5), none: S(() => 0) };
const out = { b, nH, nDense50: cnt(S(i => !gran[i] && rate[i] > 0.5)), nDense30: cnt(S(i => !gran[i] && rate[i] > 0.3)) };
for (const [k, s] of Object.entries(sets)) out[k] = run(s, []);
out.exact1234 = run(sets.none, [1, 2, 3, 4]); out.exact1234_nonGran = run(sets.nonGran, [1, 2, 3, 4]); out.exact1234_nonGranNoDense50 = run(sets.nonGranNoDense50, [1, 2, 3, 4]); out.exact1234_all = run(sets.all, [1, 2, 3, 4]);
console.log(JSON.stringify(out));
