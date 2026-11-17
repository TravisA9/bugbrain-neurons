// R122: context span of every active cell. For each cell, predict its firing on HELD slots from train-slot firing rates given the last L symbols (backoff, smoothed);
// span = smallest L whose held log-loss is within 2% of the best L (1..9). A chunk/word unit needs span >= word length (6+) and word-specific firing.
const fs = require('fs'), b = process.argv[2], M = JSON.parse(fs.readFileSync(b + '.json')), { seq, hf, gran } = M, LM = 9;
const rd = (f, T) => { const B = fs.readFileSync(f); return new T(B.buffer.slice(B.byteOffset, B.byteOffset + B.length)); }, off = rd(b + '.off', Uint32Array), ix = rd(b + '.ix', Uint16Array), nS = off.length - 1;
const ctx = []; for (let L = 0; L <= LM; L++) { const m = new Map(), id = new Int32Array(nS); for (let t = 0; t < nS; t++) { let k = ''; for (let i = Math.max(0, t - L + 1); i <= t; i++) k += String.fromCharCode(65 + seq[i]); let v = m.get(k); if (v == null) m.set(k, v = m.size); id[t] = v; } ctx.push({ id, n: m.size }); }
const fires = new Map(); for (let t = 0; t < nS; t++) for (let q = off[t]; q < off[t + 1]; q++) { const c = ix[q]; let a = fires.get(c); if (!a) fires.set(c, a = []); a.push(t); }
const T0 = 9, held = []; for (let t = Math.max(hf, T0); t < nS; t++) held.push(t);
const nTr = Array.from({ length: LM + 1 }, (_, L) => { const a = new Float32Array(ctx[L].n); for (let t = T0; t < hf; t++) a[ctx[L].id[t]]++; return a; });
const res = [];
for (const [c, ts] of fires) { const tr = ts.filter(t => t >= T0 && t < hf); if (tr.length < 60) continue; const fh = new Uint8Array(nS); ts.forEach(t => fh[t] = 1);
  const p0 = tr.length / (hf - T0), loss = [];
  const f = Array.from({ length: LM + 1 }, (_, L) => { const a = new Float32Array(ctx[L].n); for (const t of tr) a[ctx[L].id[t]]++; return a; });
  for (let L = 0; L <= LM; L++) { let s = 0; for (const t of held) { let p = p0; for (let l = 0; l <= L; l++) { const k = ctx[l].id[t], n = nTr[l][k]; if (n > 0) p = (f[l][k] + 2 * p) / (n + 2); } p = Math.min(1 - 1e-4, Math.max(1e-4, p)); s -= fh[t] ? Math.log2(p) : Math.log2(1 - p); } loss.push(s / held.length); }
  const best = Math.min(...loss); let span = 0; for (let L = 0; L <= LM; L++) if (loss[L] <= best + 0.02 * (loss[0] - best) + 1e-9) { span = L; break; }
  res.push({ c, g: gran[c], rate: +p0.toFixed(4), span, gain59: +((loss[5] - loss[9]) / Math.max(1e-9, loss[0] - best)).toFixed(3), expl: +(1 - best / loss[0]).toFixed(3) }); }
const hist = g => { const h = {}; res.filter(r => r.g === g).forEach(r => h[r.span] = (h[r.span] || 0) + 1); return h; };
const A = ' .abcdefghiklmnoprstuvwy', wordAt = t => { let i = t; while (i >= 0 && seq[i] !== 0) i--; let j = t + 1; while (j < seq.length && seq[j] !== 0) j++; return [...seq.slice(i + 1, j)].map(x => A[x]).join('') + '@' + (t - i); };
const ok = res.filter(r => r.expl >= 0.2), long = ok.filter(r => r.span >= 6);
for (const r of long) { const ts = fires.get(r.c).filter(t => t < hf), m = new Map(); ts.forEach(t => { const w = wordAt(t); m.set(w, (m.get(w) || 0) + 1); }); const top = [...m].sort((a, b) => b[1] - a[1]); r.top = top.slice(0, 3).map(x => x[0] + ':' + x[1]).join(' '); r.top1 = +(top[0][1] / ts.length).toFixed(2);
  const sp = m.size; r.words = sp; }

const h2 = g => { const h = {}; ok.filter(r => r.g === g).forEach(r => h[r.span] = (h[r.span] || 0) + 1); return h; };
console.log(JSON.stringify({ b: b.split('/').pop(), cells: res.length, ctxDriven: ok.length, granSpan: h2(1), otherSpan: h2(0), span6plus: long.length, span6gran: long.filter(r => r.g).length,
  wordSpecific: long.filter(r => r.top1 >= 0.5).length, ex: long.sort((x, y) => y.top1 - x.top1).slice(0, 6).map(r => [r.c, r.g, r.span, r.rate, r.expl, r.top1, r.top]), exLow: long.slice(-3).map(r => [r.c, r.g, r.span, r.rate, r.expl, r.top1, r.top]) }));
