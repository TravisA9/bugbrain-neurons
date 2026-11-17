// R121 coverage / recruitment: node lim2.js <dumpBase> <trace.json>
const fs = require('fs'), b = process.argv[2], TR = JSON.parse(fs.readFileSync(process.argv[3])), M = JSON.parse(fs.readFileSync(b + '.json')), { seq, hf, K, gran } = M;
const rd = (f, T) => { const B = fs.readFileSync(f); return new T(B.buffer.slice(B.byteOffset, B.byteOffset + B.length)); }, off = rd(b + '.off', Uint32Array), ix = rd(b + '.ix', Uint16Array), nS = off.length - 1;
let g0 = -1; for (let i = 0; i < gran.length; i++) if (gran[i]) { g0 = i; break; } const nG = TR.init.length;
const parse = k => { if (k == null) return null; const a = k.split(','); return { n: +a[0], c: a.slice(1).map(Number) }; };
// column -> letter per source, from recruit events: claw c of a key recruited at slot t is source c's column for letter seq[t - c + d]; choose d by purity
const best = { d: 0, pur: -1, map: null };
for (const d of [-1, 0, 1]) { const cnt = [0, 1, 2, 3, 4].map(() => new Map()); for (const [t, j, k] of TR.log) { const p = parse(k); if (!p) continue; p.c.forEach((col, c) => { const i = t - c + d; if (i < 0 || i >= seq.length) return; const m = cnt[c]; const key = col; if (!m.has(key)) m.set(key, new Float64Array(K)); m.get(key)[seq[i]]++; }); }
  let tot = 0, top = 0; const map = cnt.map(m => { const r = new Map(); for (const [col, v] of m) { let bk = 0, s = 0; for (let y = 0; y < K; y++) { s += v[y]; if (v[y] > v[bk]) bk = y; } tot += s; top += v[bk]; r.set(col, bk); } return r; });
  if (top / tot > best.pur) Object.assign(best, { d, pur: top / tot, map }); }
const letters = p => p.c.map((col, c) => best.map[c] && best.map[c].has(col) ? best.map[c].get(col) : -1);
// replay live detectors: tuple letter string -> count of live detectors
const live = new Map(), cur = new Array(nG).fill(null), lk = p => p ? p.n + ':' + letters(p).join('.') : null;
const add = (s, v) => { if (s == null) return; const x = (live.get(s) || 0) + v; if (x) live.set(s, x); else live.delete(s); };
for (let j = 0; j < nG; j++) { cur[j] = lk(parse(TR.init[j])); add(cur[j], 1); }
const ctx = (t, n) => { const a = []; for (let c = 0; c < n; c++) a.push(seq[t - c]); return n + ':' + a.join('.'); };
const byS = {}; let q = 0; const L = TR.log; const seenCnt = [3, 4].map(() => new Map()), firstDet = [3, 4].map(() => new Map());
const covH = { 3: 0, 4: 0, any34: 0 }, firedH = { gran: 0, n: 0 }, bins = []; let nH = 0, recruits = 0;
const perBin = 2000; for (let t = 0; t < nS - 1; t++) {
  while (q < L.length && L[q][0] <= t) { const [, j, k] = L[q++]; add(cur[j], -1); cur[j] = lk(parse(k)); add(cur[j], 1); recruits++; }
  if (t % perBin === 0) { let free = 0; for (let j = 0; j < nG; j++) if (cur[j] == null) free++; bins.push({ t, recruitsSoFar: recruits, free }); }
  [3, 4].forEach((n, z) => { if (t < n) return; const c = ctx(t, n), s = (seenCnt[z].get(c) || 0); if (live.has(c) && !firstDet[z].has(c)) firstDet[z].set(c, s); seenCnt[z].set(c, s + 1); });
  if (t >= hf) { nH++; const h3 = live.has(ctx(t, 3)), h4 = live.has(ctx(t, 4)); { const sc = (seenCnt[1].get(ctx(t, 4)) || 1) - 1, bn = sc <= 0 ? '0' : sc <= 1 ? '1' : sc <= 2 ? '2' : sc <= 4 ? '3-4' : sc <= 9 ? '5-9' : sc <= 19 ? '10-19' : '20+', kk = bn + (h4 ? '/det' : '/noDet'), o = byS[kk] || (byS[kk] = { n: 0, hit: 0 }); o.n++; o.hit += M.hits[t]; } if (h3) covH[3]++; if (h4) covH[4]++; if (h3 || h4) covH.any34++;
    let a = 0; for (let p = off[t]; p < off[t + 1]; p++) if (gran[ix[p]]) a++; firedH.gran += a; if (a) firedH.n++; } }
const lat = z => { const v = [...firstDet[z].values()], h = {}; for (const x of v) { const k = x <= 0 ? '0' : x <= 1 ? '1' : x <= 2 ? '2' : x <= 4 ? '3-4' : x <= 9 ? '5-9' : '10+'; h[k] = (h[k] || 0) + 1; } const tot = seenCnt[z].size; return { contexts: tot, everDetected: v.length, sightingsBeforeDetector: h }; };
// recurrent contexts never detected
const nd = z => { let n2 = 0, nd2 = 0; for (const [c, s] of seenCnt[z]) if (s >= 2) { n2++; if (!firstDet[z].has(c)) nd2++; } return { recurring2plus: n2, neverDetected: nd2 }; };
let n4 = 0, n3 = 0, nNull = 0; for (const s of cur) { if (s == null) nNull++; else if (s[0] === '4') n4++; else n3++; }
console.log(JSON.stringify({ b: b.split('/').pop(), purity: +best.pur.toFixed(3), d: best.d, recruits, finalDet: { n3, n4, free: nNull, distinctLive: live.size },
  heldCoverage: { L3: +(covH[3] / nH).toFixed(3), L4: +(covH[4] / nH).toFixed(3), any: +(covH.any34 / nH).toFixed(3) }, heldGranActivePerSlot: +(firedH.gran / nH).toFixed(2), heldSlotsWithAnyGran: +(firedH.n / nH).toFixed(3),
  bySeen4: Object.fromEntries(Object.entries(byS).sort().map(([k, o]) => [k, o.n + ':' + (o.hit / o.n).toFixed(3)])), lat3: lat(0), lat4: lat(1), nd3: nd(0), nd4: nd(1), timeline: bins.filter((x, i) => i % 3 === 0) }));
