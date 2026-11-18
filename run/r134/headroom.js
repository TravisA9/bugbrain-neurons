// node sw/headroom.js <k> <nSyms>: online backoff count models on the book stream of seed k (as bookdiag): held-out acc (last 2000)
// char orders 1..12 (backoff to shorter), and word-level contexts: W1 = current partial word (since last space), W2 = previous word + partial,
// W2c = W2 backing off to char order 8. Prints JSON.
const L = require('../run/lib.js');
const k = +process.argv[2], nS = +process.argv[3];
const env = L.setupTask({ name: 'r42', env: 'seq', params: { source: 'book', nSyms: nS, evalSyms: 2000 } });
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), T = env.def.create(p.arenaSeeds[k] >>> 0, env.P, env.spec);
const s = T.seq, h0 = T.heldFrom, n = nS, res = { k, nS };
const cnt = new Map(); for (let i = 0; i < n; i++) cnt.set(s[i], (cnt.get(s[i]) || 0) + 1); const SP = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
const argmax = t => { let b = -1, bv = 0; for (const [x, v] of t) if (v > bv) { bv = v; b = x; } return b; };
const add = (m, key, y) => { let t = m.get(key); if (!t) m.set(key, t = new Map()); t.set(y, (t.get(y) || 0) + 1); };
// char backoff, all orders in one pass
const MO = 12, tabs = Array.from({ length: MO + 1 }, () => new Map()), hit = new Float64Array(MO + 1), hit2 = new Float64Array(MO + 1); let m = 0;
const tot = t => { let z = 0; for (const v of t.values()) z += v; return z; };
// word contexts
const W1 = new Map(), W2 = new Map(); let hW1 = 0, hW2 = 0, hW2c = 0, prevW = '', cur = '';
for (let i = 0; i < n; i++) {
  const y = s[i + 1]; if (y === undefined) break;
  const keys = []; for (let o = 1; o <= MO; o++) keys[o] = i - o + 1 >= 0 ? s.slice(i - o + 1, i + 1).join(',') : null;
  cur = s[i] === SP ? '' : cur + ',' + s[i]; if (s[i] === SP && i > 0) { /* word ended at i-1 */ }
  if (i >= h0) { m++;
    for (let ord = 1; ord <= MO; ord++) { let pr = -1; for (let o = ord; o >= 1 && pr < 0; o--) { if (!keys[o]) continue; const t = tabs[o].get(keys[o]); if (t) pr = argmax(t); } if (pr === y) hit[ord]++;
      pr = -1; for (let o = ord; o >= 1 && pr < 0; o--) { if (!keys[o]) continue; const t = tabs[o].get(keys[o]); if (t && (o === 1 || tot(t) >= 2)) pr = argmax(t); } if (pr === y) hit2[ord]++; }
    const c8 = (() => { for (let o = 8; o >= 1; o--) { if (!keys[o]) continue; const t = tabs[o].get(keys[o]); if (t) return argmax(t); } return -1; })();
    const t1 = W1.get(cur), t2 = W2.get(prevW + '|' + cur);
    const p1 = t1 ? argmax(t1) : c8, p2 = t2 ? argmax(t2) : p1;
    if (p1 === y) hW1++; if (p2 === y) hW2++;
    // W2c: previous word + partial if seen, else char order 8
    const p2c = t2 ? argmax(t2) : c8; if (p2c === y) hW2c++; }
  for (let o = 1; o <= MO; o++) if (keys[o]) add(tabs[o], keys[o], y);
  add(W1, cur, y); add(W2, prevW + '|' + cur, y);
  if (y === SP) { if (cur !== '') prevW = cur; }
}
for (let o = 1; o <= MO; o++) res['o' + o] = +(hit[o] / m).toFixed(4);
for (let o = 3; o <= MO; o++) res['m2o' + o] = +(hit2[o] / m).toFixed(4);   // backoff only from contexts seen >= 2 times
res.wordPartial = +(hW1 / m).toFixed(4); res.prevWordPartial = +(hW2 / m).toFixed(4); res.prevWordPartial_c8 = +(hW2c / m).toFixed(4);
console.log(JSON.stringify(res));
