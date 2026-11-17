// R122: does a COUNT n-gram model (backoff, trained on the same life) loop under the same greedy decoding the brain uses?  node ngen.js <dump> [nGen]
const fs = require('fs'), M = JSON.parse(fs.readFileSync(process.argv[2] + '.json')), { seq, K } = M, nS = M.nS, NG = +(process.argv[3] || 500);
const A = ' .abcdefghiklmnoprstuvwy', LM = 6, T = Array.from({ length: LM + 1 }, () => new Map());
const key = (s, t, l) => { let k = ''; for (let i = t - l + 1; i <= t; i++) k += A[s[i]]; return k; };
for (let t = 0; t < nS; t++) for (let l = 0; l <= Math.min(LM, t + 1); l++) { const k = key(seq, t, l); let m = T[l].get(k); if (!m) T[l].set(k, m = new Float64Array(K)); m[seq[t + 1]]++; }
let rs = 12345; const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648;
const gen = (L, temp) => { const s = seq.slice(0, nS + 1); for (let g = 0; g < NG; g++) { const t = s.length - 1; let m = null; for (let l = L; l >= 0; l--) { m = T[l].get(key(s, t, l)); if (m) break; }
    let k = 0; if (!temp) { for (let j = 1; j < K; j++) if (m[j] > m[k]) k = j; } else { let z = 0; const w = m.map(c => Math.pow(c, 1 / temp)); w.forEach(x => z += x); let u = rnd() * z; for (k = 0; k < K - 1 && (u -= w[k]) > 0; k++); }
    s.push(k); } return s.slice(nS + 1).map(i => A[i]).join(''); };
const st = s => { const g4 = []; for (let i = 0; i + 4 <= s.length; i++) g4.push(s.slice(i, i + 4)); let per = 0; const tail = s.slice(-200); for (let p = 1; p <= 100; p++) { let ok = true; for (let i = p; i < tail.length; i++) if (tail[i] !== tail[i - p]) { ok = false; break; } if (ok) { per = p; break; } }
  return { distinct4: +(new Set(g4).size / g4.length).toFixed(3), period: per }; };
const out = { b: process.argv[2].split('/').pop() };
for (const L of [1, 2, 3, 4, 5, 6]) { const g = gen(L, 0); out['greedyL' + L] = Object.assign(st(g), { s: g.slice(0, 60) }); }
for (const L of [3, 4]) { const g = gen(L, 1); out['sampleL' + L] = Object.assign(st(g), { s: g.slice(0, 60) }); }
console.log(JSON.stringify(out));
