// Online ideal n-gram counters on the sequence stream (what a perfect counter of order k reaches in one lifetime).
//   order k (strict): predicts the most frequent successor seen so far after the last k symbols (wrong if unseen)
//   order k + backoff: falls back to order k-1, ... (unseen context) — like PPM; bits: KT (add-1/2) with backoff mixing
// usage: node results_v19/ngram.js  [CORP=tiny|fables] [LIVES=1000,2000,4000] [NR=20]
const S = require('../js/node_load.js')();
const corpora = { tiny: S.text.CORPUS, fables: S.text.FABLES || '' };
const NR = +(process.env.NR || 20);
function run(C, A, n, start, K) {
  const idx = new Map(A.map((c, i) => [c, i])), seq = []; for (let i = 0; i <= n; i++) seq.push(idx.get(C[(start + i) % C.length]));
  const res = []; for (let k = 0; k <= K; k++) res.push({ hit: [], hitB: [], bits: 0 });
  const tabs = []; for (let k = 0; k <= K; k++) tabs.push(new Map());
  for (let t = 0; t < n; t++) { const y = seq[t + 1];
    const rows = []; for (let k = 0; k <= K; k++) { if (t - k + 1 < 0) { rows.push(null); continue; } const key = seq.slice(t - k + 1, t + 1).join(','); rows.push(tabs[k].get(key) || null); }
    for (let k = 0; k <= K; k++) {
      const am = r => { let b = -1, m = 0; if (r) for (let j = 0; j < r.length; j++) if (r[j] > m) { m = r[j]; b = j; } return b; };
      res[k].hit.push(am(rows[k]) === y ? 1 : 0);
      let kb = k; while (kb > 0 && !rows[kb]) kb--; res[k].hitB.push(am(rows[kb]) === y ? 1 : 0);
      // bits: blend from order 0 up to k, each level KT-smoothed around the lower level's distribution (simple interpolation)
      let p = new Array(A.length).fill(1 / A.length);
      for (let j = 0; j <= k; j++) { const r = rows[j]; if (!r) continue; let s = 0; for (const v of r) s += v; const a = 0.5 * A.length; p = p.map((q, i) => (r[i] + a * q) / (s + a)); }
      res[k].bits += -Math.log2(p[y]);
    }
    for (let k = 0; k <= K; k++) { if (t - k + 1 < 0) continue; const key = seq.slice(t - k + 1, t + 1).join(','); let r = tabs[k].get(key); if (!r) { r = new Array(A.length).fill(0); tabs[k].set(key, r); } r[y]++; }
  }
  return res;
}
const q4 = h => { const a = Math.floor(h.length * 3 / 4); let s = 0; for (let i = a; i < h.length; i++) s += h[i]; return s / (h.length - a); };
const mean = h => h.reduce((a, b) => a + b, 0) / h.length;
for (const cn of (process.env.CORP || 'tiny,fables').split(',')) { const C = corpora[cn]; if (!C) continue; const A = Array.from(new Set(C.split(''))).sort();
  for (const n of (process.env.LIVES || '1000,2000,4000').split(',').map(Number)) {
    const K = 4, agg = Array.from({ length: K + 1 }, () => ({ all: 0, last: 0, allB: 0, lastB: 0, bits: 0 }));
    for (let r = 0; r < NR; r++) { const st = (r * 2654435761 % C.length) >>> 0, res = run(C, A, n, st, K);
      res.forEach((x, k) => { agg[k].all += mean(x.hit); agg[k].last += q4(x.hit); agg[k].allB += mean(x.hitB); agg[k].lastB += q4(x.hitB); agg[k].bits += x.bits / n; }); }
    console.log(`${cn} (${C.length} chars, ${A.length} symbols), life ${n}: order | strict all / last q | backoff all / last q | bits (blended)`);
    agg.forEach((a, k) => console.log(`   ${k}  | ${(a.all / NR).toFixed(3)} / ${(a.last / NR).toFixed(3)} | ${(a.allB / NR).toFixed(3)} / ${(a.lastB / NR).toFixed(3)} | ${(a.bits / NR).toFixed(2)}`));
  } }
