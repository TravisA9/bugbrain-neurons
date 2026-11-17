// R121: granExact brain vs online backoff n-gram predictors (context length L = symbols up to and incl. the current one), same life, same held slots
const fs = require('fs'), b = process.argv[2], M = JSON.parse(fs.readFileSync(b + '.json')), { seq, hits, hf, K } = M, nS = Math.min(M.nS, seq.length - 1);
const LM = 6, T = Array.from({ length: LM + 1 }, () => new Map()), P = Array.from({ length: LM + 1 }, () => new Int16Array(nS).fill(-1)), C = Array.from({ length: LM + 1 }, () => new Int32Array(nS));
const key = (t, l) => { let s = ''; for (let i = t - l + 1; i <= t; i++) s += String.fromCharCode(65 + seq[i]); return s; };
for (let t = 0; t < nS - 1; t++) {
  for (let L = 0; L <= LM; L++) { // prediction of model L = longest seen context <= L (backoff)
    if (t >= hf) for (let l = Math.min(L, t + 1); l >= 0; l--) { const m = T[l].get(key(t, l)); if (m) { let bk = 0; for (let j = 1; j < K; j++) if (m[j] > m[bk]) bk = j; P[L][t] = bk; break; } }
    if (t >= hf && L <= Math.min(LM, t + 1)) { const m = T[L].get(key(t, L)); C[L][t] = m ? m.n : 0; } }
  for (let l = 0; l <= Math.min(LM, t + 1); l++) { const k = key(t, l); let m = T[l].get(k); if (!m) { T[l].set(k, m = new Float64Array(K)); m.n = 0; } m[seq[t + 1]]++; m.n++; } }
const H = []; for (let t = hf; t < nS - 1; t++) H.push(t);
const acc = (f, sel = H) => { const x = sel.filter(f); return +(x.length / sel.length).toFixed(4); }, hit = (L, t) => P[L][t] === seq[t + 1];
const out = { b: b.split('/').pop(), held: H.length, brain: acc(t => hits[t]) }; for (let L = 0; L <= LM; L++) out['L' + L] = acc(t => hit(L, t));
// which order does the brain behave like: phi between hit vectors
const phi = L => { let a = 0, bb = 0, c = 0, d = 0; for (const t of H) { const x = hits[t] ? 1 : 0, y = hit(L, t) ? 1 : 0; if (x && y) a++; else if (x) bb++; else if (y) c++; else d++; } return +((a * d - bb * c) / Math.sqrt((a + bb) * (c + d) * (a + c) * (bb + d))).toFixed(3); };
out.phi = {}; for (let L = 1; L <= LM; L++) out.phi['L' + L] = phi(L);
// word position
let SP = 0; { const c = new Float64Array(K); for (let t = 0; t < hf; t++) c[seq[t]]++; for (let j = 1; j < K; j++) if (c[j] > c[SP]) SP = j; }
const pos = t => { let wp = 0; for (let i = t; i >= 0 && seq[i] !== SP; i--) wp++; return seq[t + 1] === SP ? 'tgtSpace' : wp === 0 ? 'wordStart' : wp === 1 ? 'let2' : wp === 2 ? 'let3' : wp === 3 ? 'let4' : 'let5+'; };
out.pos = {}; for (const c of ['wordStart', 'let2', 'let3', 'let4', 'let5+', 'tgtSpace']) { const s = H.filter(t => pos(t) === c); out.pos[c] = { share: +(s.length / H.length).toFixed(3), brain: acc(t => hits[t], s), L3: acc(t => hit(3, t), s), L4: acc(t => hit(4, t), s), L5: acc(t => hit(5, t), s) }; }
// how often the L=3 / L=4 context was seen before (sample efficiency)
for (const L of [3, 4]) { const bins = [[0, 0], [1, 1], [2, 2], [3, 4], [5, 9], [10, 19], [20, 49], [50, 1e9]]; out['seen' + L] = {};
  for (const [lo, hi] of bins) { const s = H.filter(t => C[L][t] >= lo && C[L][t] <= hi); if (!s.length) continue; out['seen' + L][lo + '-' + (hi > 1e8 ? 'inf' : hi)] = { share: +(s.length / H.length).toFixed(3), brain: acc(t => hits[t], s), L3: acc(t => hit(3, t), s), L4: acc(t => hit(4, t), s), L5: acc(t => hit(5, t), s), L6: acc(t => hit(6, t), s) }; } }
// target letter frequency (train counts) quartiles
{ const c = new Float64Array(K); for (let t = 0; t < hf; t++) c[seq[t + 1]]++; const ord = [...Array(K).keys()].sort((x, y) => c[y] - c[x]), rk = new Int32Array(K); ord.forEach((s, i) => rk[s] = i); out.tgtFreq = {};
  for (const [nm, lo, hi] of [['top1', 0, 0], ['2-5', 1, 4], ['6-10', 5, 9], ['11+', 10, 99]]) { const s = H.filter(t => rk[seq[t + 1]] >= lo && rk[seq[t + 1]] <= hi); out.tgtFreq[nm] = { share: +(s.length / H.length).toFixed(3), brain: acc(t => hits[t], s), L4: acc(t => hit(4, t), s), L5: acc(t => hit(5, t), s) }; } }
console.log(JSON.stringify(out));
