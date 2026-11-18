// node sw/countmodel.js <k> [nSyms]: the book stream of seed k (as bookdiag) -> online order-n count models (backoff) held-out accuracy, n = 1..8,
// and accuracy split by how often the order-4 context (t..t-3) was seen before. Prints JSON.
const L = require('../run/lib.js'), SA = L.SA;
const k = +process.argv[2], nS = +(process.argv[3] || 10000);
const env = L.setupTask({ name: 'r42', env: 'seq', params: { source: 'book', nSyms: nS, evalSyms: 2000 } });
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), T = env.def.create(p.arenaSeeds[k] >>> 0, env.P, env.spec);
const s = T.seq, h0 = T.heldFrom, n = nS, res = {};
for (const ord of [1, 2, 3, 4, 5, 6, 8]) {
  const tabs = Array.from({ length: ord + 1 }, () => new Map()); let c = 0, m = 0;
  for (let i = 0; i < n; i++) {   // predict s[i+1] from s[..i]
    let pred = -1;
    for (let o = Math.min(ord, i + 1); o >= 1 && pred < 0; o--) { const key = s.slice(i - o + 1, i + 1).join(','), t = tabs[o].get(key); if (t) { let b = -1, bv = 0; for (const [x, v] of t) if (v > bv) { bv = v; b = x; } pred = b; } }
    if (i >= h0) { m++; if (pred === s[i + 1]) c++; }
    for (let o = 1; o <= Math.min(ord, i + 1); o++) { const key = s.slice(i - o + 1, i + 1).join(','); let t = tabs[o].get(key); if (!t) tabs[o].set(key, t = new Map()); t.set(s[i + 1], (t.get(s[i + 1]) || 0) + 1); }
  }
  res['o' + ord] = +(c / m).toFixed(4);
}
// seen-count split for order-4 contexts in the held part (order-4 count model accuracy per bin)
const t4 = new Map(), bins = {}; for (let i = 0; i < n; i++) { const key = s.slice(Math.max(0, i - 3), i + 1).join(','), t = t4.get(key); const seen = t ? [...t.values()].reduce((a, b) => a + b, 0) : 0;
  if (i >= h0) { const bn = seen === 0 ? '0' : seen === 1 ? '1' : seen < 5 ? '2-4' : '5+'; const B = bins[bn] || (bins[bn] = [0, 0]); B[1]++; } let tt = t; if (!tt) t4.set(key, tt = new Map()); tt.set(s[i + 1], (tt.get(s[i + 1]) || 0) + 1); }
res.ctx4seen = Object.fromEntries(Object.entries(bins).map(([b, v]) => [b, v[1]]));
// brain hits by bin (bd files given as extra args)
for (const f of process.argv.slice(4)) { const d = JSON.parse(require('fs').readFileSync(f)); if (!d.hits) continue; const t5 = new Map(), bb = {}; let j = 0;
  for (let i = 0; i < n; i++) { const key = s.slice(Math.max(0, i - 3), i + 1).join(','), t = t5.get(key); const seen = t ? [...t.values()].reduce((a, b) => a + b, 0) : 0;
    if (i >= h0) { const bn = seen === 0 ? '0' : seen === 1 ? '1' : seen < 5 ? '2-4' : '5+'; const B = bb[bn] || (bb[bn] = [0, 0]); B[0] += +d.hits[j++]; B[1]++; } let tt = t; if (!tt) t5.set(key, tt = new Map()); tt.set(s[i + 1], (tt.get(s[i + 1]) || 0) + 1); }
  res['brain:' + d.tag] = Object.fromEntries(Object.entries(bb).map(([b, v]) => [b, +(v[0] / v[1]).toFixed(3)])); }
// count model (order-5 backoff) accuracy by the same bins
for (const ord of [3, 4, 5]) { const tabs = Array.from({ length: ord + 1 }, () => new Map()), t6 = new Map(), bb = {};
  for (let i = 0; i < n; i++) { let pred = -1; for (let o = Math.min(ord, i + 1); o >= 1 && pred < 0; o--) { const t = tabs[o].get(s.slice(i - o + 1, i + 1).join(',')); if (t) { let b = -1, bv = 0; for (const [x, v] of t) if (v > bv) { bv = v; b = x; } pred = b; } }
    const key = s.slice(Math.max(0, i - 3), i + 1).join(','), t = t6.get(key), seen = t ? [...t.values()].reduce((a, b) => a + b, 0) : 0;
    if (i >= h0) { const bn = seen === 0 ? '0' : seen === 1 ? '1' : seen < 5 ? '2-4' : '5+'; const B = bb[bn] || (bb[bn] = [0, 0]); B[0] += pred === s[i + 1] ? 1 : 0; B[1]++; }
    let tt = t; if (!tt) t6.set(key, tt = new Map()); tt.set(s[i + 1], (tt.get(s[i + 1]) || 0) + 1);
    for (let o = 1; o <= Math.min(ord, i + 1); o++) { const kk = s.slice(i - o + 1, i + 1).join(','); let q = tabs[o].get(kk); if (!q) tabs[o].set(kk, q = new Map()); q.set(s[i + 1], (q.get(s[i + 1]) || 0) + 1); } }
  res['count' + ord] = Object.fromEntries(Object.entries(bb).map(([b, v]) => [b, +(v[0] / v[1]).toFixed(3)])); }
console.log(JSON.stringify({ k, nS, h0, ...res }));
