// node sw/headroom2.js <k> <nSyms>: word-level count models (online argmax, backoff) on the book stream of seed k: held-out acc (last 2000)
// W2 = prev word + partial (-> partial -> char o4); W3 = 2 prev words + partial (-> W2 ...); W3m2 = W3 used only if its context was seen >= 2 times
const L = require('../run/lib.js'); const k = +process.argv[2], nS = +process.argv[3];
const env = L.setupTask({ name: 'r42', env: 'seq', params: { source: 'book', nSyms: nS, evalSyms: 2000 } });
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), T = env.def.create(p.arenaSeeds[k] >>> 0, env.P, env.spec);
const s = T.seq, h0 = T.heldFrom, n = nS;
const cnt = new Map(); for (let i = 0; i < n; i++) cnt.set(s[i], (cnt.get(s[i]) || 0) + 1); const SP = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
const am = t => { let b = -1, bv = 0, z = 0; for (const [x, v] of t) { z += v; if (v > bv) { bv = v; b = x; } } return [b, z]; };
const add = (m, key, y) => { let t = m.get(key); if (!t) m.set(key, t = new Map()); t.set(y, (t.get(y) || 0) + 1); };
const C4 = new Map(), W1 = new Map(), W2 = new Map(), W3 = new Map(); let h = { o4: 0, W2: 0, W3: 0, W3m2: 0 }, m = 0, w1 = '', w2 = '', cur = '';
for (let i = 0; i < n; i++) { const y = s[i + 1]; if (y === undefined) break;
  cur = s[i] === SP ? '' : cur + ',' + s[i]; const k4 = s.slice(Math.max(0, i - 3), i + 1).join(','), k1 = cur, k2 = w1 + '|' + cur, k3 = w2 + '|' + k2;
  if (i >= h0) { m++; const t4 = C4.get(k4), p4 = t4 ? am(t4)[0] : -1; if (p4 === y) h.o4++;
    const t1 = W1.get(k1), p1 = t1 ? am(t1)[0] : p4, t2 = W2.get(k2), p2 = t2 ? am(t2)[0] : p1; if (p2 === y) h.W2++;
    const t3 = W3.get(k3), a3 = t3 ? am(t3) : null; if ((a3 ? a3[0] : p2) === y) h.W3++; if ((a3 && a3[1] >= 2 ? a3[0] : p2) === y) h.W3m2++; }
  add(C4, k4, y); add(W1, k1, y); add(W2, k2, y); add(W3, k3, y);
  if (y === SP && cur !== '') { w2 = w1; w1 = cur; } }
console.log(JSON.stringify({ k, nS, ...Object.fromEntries(Object.entries(h).map(([a, b]) => [a, +(b / m).toFixed(4)])) }));
