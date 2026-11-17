// R122: fatigue on context detectors, simulated on the count model (backoff L, the brain's detector analogue). A key that fired within tau steps is suppressed
// (graded: its counts x (1 - exp(-dt/tau)) added to a lower order fallback). Measure held acc (teacher forced) and greedy generation loops. node nfat.js <dump> <L>
const fs = require('fs'), M = JSON.parse(fs.readFileSync(process.argv[2] + '.json')), { seq, K, hf } = M, nS = M.nS, L = +(process.argv[3] || 4), NG = 500;
const A = ' .abcdefghiklmnoprstuvwy', T = Array.from({ length: L + 1 }, () => new Map());
const key = (s, t, l) => { let k = ''; for (let i = t - l + 1; i <= t; i++) k += A[s[i]]; return k; };
const learn = (s, t) => { for (let l = 0; l <= Math.min(L, t + 1); l++) { const k = key(s, t, l); let m = T[l].get(k); if (!m) T[l].set(k, m = new Float64Array(K)); m[s[t + 1]]++; } };
const n0 = m => { let n = 0; m.forEach(x => n += x); return n; };   // tau < 0: self-calibrated tau_k = |tau| x the key's own mean recurrence interval (t / count)
const pred = (s, t, last, tau) => { const z = new Float64Array(K); let wl = 1; for (let l = Math.min(L, t + 1); l >= 0 && wl > 1e-6; l--) { const k = key(s, t, l), m = T[l].get(k); if (!m) continue;
    const tk = tau < 0 ? -tau * t / n0(m) : tau, f = tau !== 0 && l > 0 && last.has(l + k) ? 1 - Math.exp(-(t - last.get(l + k)) / tk) : 1; let n = 0; m.forEach(x => n += x); for (let j = 0; j < K; j++) z[j] += wl * f * m[j] / n; wl *= 1 - f; if (tau !== 0) last.set(l + k, t); }
  let bk = 0; for (let j = 1; j < K; j++) if (z[j] > z[bk]) bk = j; return bk; };
const out = { b: process.argv[2].split('/').pop(), L };
for (const tau of (process.argv[4] || "0,4,16,32,64,128").split(",").map(Number)) { T.forEach(m => m.clear()); let last = new Map(), h = 0, n = 0;
  for (let t = 0; t < nS; t++) { if (t >= hf) { n++; if (pred(seq, t, last, tau) === seq[t + 1]) h++; } else if (tau !== 0) pred(seq, t, last, tau); learn(seq, t); }
  const s = seq.slice(0, nS + 1); for (let g = 0; g < NG; g++) s.push(pred(s, s.length - 1, last, tau)); const gs = s.slice(nS + 1).map(i => A[i]).join('');
  const g4 = []; for (let i = 0; i + 4 <= gs.length; i++) g4.push(gs.slice(i, i + 4)); const tl = gs.slice(-200); let per = 0; for (let p = 1; p <= 100 && !per; p++) { let ok = 1; for (let i = p; i < tl.length; i++) if (tl[i] !== tl[i - p]) { ok = 0; break; } if (ok) per = p; }
  out['tau' + tau] = { held: +(h / n).toFixed(4), d4: +(new Set(g4).size / g4.length).toFixed(3), per, s: gs.slice(100, 160) }; }
console.log(JSON.stringify(out));
