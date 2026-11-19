// node sw/headroom3.js <k> <nSyms> [Ks]: word-CATEGORY count models (upper-bound style headroom). Words (seen >= 3 in the training part) are clustered
// offline by k-means (cosine) on the distribution of the NEXT word's first two letters; held = last 2000 letters. Models (online argmax with backoff):
// mixW / mixWC: evidence-summing (readout-like) model over {o4, partial, W2} / + {(c2,c1,partial), (c2,w1,partial)}, weight n/(n+2) per context
// cW = (c2, w1, partial) -> W2 (category of the word before last + exact last word); cWm2 = cW only if seen >= 2
// W2 = (w1, partial) -> partial -> o4; C2 = (c2, c1, partial) -> (c1, partial) -> partial -> o4; W2C = W2 if its context seen >= 2 else C2.
const L = require('../run/lib.js'); const k = +process.argv[2], nS = +process.argv[3], Ks = (process.argv[4] || '16,64,256').split(',').map(Number);
const env = L.setupTask({ name: 'r42', env: 'seq', params: { source: 'book', nSyms: nS, evalSyms: 2000 } });
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), T = env.def.create(p.arenaSeeds[k] >>> 0, env.P, env.spec);
const s = T.seq, h0 = T.heldFrom, n = nS, A = s.slice(0, n + 1).reduce((a, b) => a > b ? a : b, 0) + 1;
const cnt = new Map(); for (let i = 0; i < n; i++) cnt.set(s[i], (cnt.get(s[i]) || 0) + 1); const SP = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
// word list of the training part with next-word first-two-letter profiles
const words = []; { let cur = ''; for (let i = 0; i < h0; i++) { if (s[i] === SP) { if (cur) words.push([cur, i + 1]); cur = ''; } else cur += ',' + s[i]; } }
const prof = new Map(), wc = new Map(); for (let q = 0; q + 1 < words.length; q++) { const [w] = words[q], st = words[q + 1][1]; const a = s[st], b = s[st + 1];
  if (!prof.has(w)) prof.set(w, new Float64Array(A + A * A)); const v = prof.get(w); v[a]++; v[A + a * A + b] += 0.5; wc.set(w, (wc.get(w) || 0) + 1); }
const W = [...prof.keys()].filter(w => wc.get(w) >= 3), X = W.map(w => { const v = prof.get(w); let z = 0; for (const x of v) z += x * x; z = Math.sqrt(z) || 1; return v.map(x => x / z); });
const kmeans = K => { const D = X[0].length, C = []; for (let j = 0; j < K && j < X.length; j++) C.push(Float64Array.from(X[Math.floor(j * X.length / K)]));
  let as = new Int32Array(X.length); for (let it = 0; it < 15; it++) { for (let i = 0; i < X.length; i++) { let b = 0, bv = -1; for (let j = 0; j < C.length; j++) { let d = 0; const c = C[j], x = X[i]; for (let t = 0; t < D; t++) d += c[t] * x[t]; if (d > bv) { bv = d; b = j; } } as[i] = b; }
    for (const c of C) c.fill(0); for (let i = 0; i < X.length; i++) { const c = C[as[i]], x = X[i]; for (let t = 0; t < D; t++) c[t] += x[t]; } for (const c of C) { let z = 0; for (const x of c) z += x * x; z = Math.sqrt(z) || 1; for (let t = 0; t < D; t++) c[t] /= z; } }
  const m = new Map(); W.forEach((w, i) => m.set(w, as[i])); return m; };
const am = t => { let b = -1, bv = 0, z = 0; for (const [x, v] of t) { z += v; if (v > bv) { bv = v; b = x; } } return [b, z]; };
const add = (m, key, y) => { let t = m.get(key); if (!t) m.set(key, t = new Map()); t.set(y, (t.get(y) || 0) + 1); };
const res = { k, nS, nWordsClustered: W.length };
for (const K of Ks) { const cat = kmeans(K), cOf = w => cat.has(w) ? cat.get(w) : 'r';
  const C4 = new Map(), W1 = new Map(), W2 = new Map(), Q1 = new Map(), Q2 = new Map(), X3 = new Map(); let hW2 = 0, hC2 = 0, hW2C = 0, hX = 0, hX2 = 0, hMb = 0, hMc = 0, m = 0, w1 = '', w2 = '', cur = '';
  for (let i = 0; i < n; i++) { const y = s[i + 1]; if (y === undefined) break;
    cur = s[i] === SP ? '' : cur + ',' + s[i]; const k4 = s.slice(Math.max(0, i - 3), i + 1).join(','), kw2 = w1 + '|' + cur, kq1 = cOf(w1) + '|' + cur, kq2 = cOf(w2) + '|' + kq1, kx = cOf(w2) + '|' + kw2;
    if (i >= h0) { m++; const t4 = C4.get(k4), p4 = t4 ? am(t4)[0] : -1, t1 = W1.get(cur), p1 = t1 ? am(t1)[0] : p4;
      const t2 = W2.get(kw2), a2 = t2 ? am(t2) : null, pw2 = a2 ? a2[0] : p1; if (pw2 === y) hW2++;
      const u1 = Q1.get(kq1), pq1 = u1 ? am(u1)[0] : p1, u2 = Q2.get(kq2), pq2 = u2 ? am(u2)[0] : pq1; if (pq2 === y) hC2++;
      if ((a2 && a2[1] >= 2 ? a2[0] : pq2) === y) hW2C++;
      const mix = ts => { const sc = new Map(); for (const t of ts) { if (!t) continue; let z = 0; for (const v of t.values()) z += v; const lam = z / (z + 2); for (const [x, v] of t) sc.set(x, (sc.get(x) || 0) + lam * v / z); } let b = -1, bv = -1; for (const [x, v] of sc) if (v > bv) { bv = v; b = x; } return b; };
      if (mix([t4, t1, t2]) === y) hMb++; if (mix([t4, t1, t2, u2, X3.get(kx)]) === y) hMc++;
      const tx = X3.get(kx), ax = tx ? am(tx) : null; if ((ax ? ax[0] : pw2) === y) hX++; if ((ax && ax[1] >= 2 ? ax[0] : pw2) === y) hX2++; }
    add(C4, k4, y); add(W1, cur, y); add(W2, kw2, y); add(Q1, kq1, y); add(Q2, kq2, y); add(X3, kx, y);
    if (y === SP && cur !== '') { w2 = w1; w1 = cur; } }
  res['K' + K] = { W2: +(hW2 / m).toFixed(4), C2: +(hC2 / m).toFixed(4), W2C: +(hW2C / m).toFixed(4), cW: +(hX / m).toFixed(4), cWm2: +(hX2 / m).toFixed(4), mixW: +(hMb / m).toFixed(4), mixWC: +(hMc / m).toFixed(4) }; }
console.log(JSON.stringify(res));
