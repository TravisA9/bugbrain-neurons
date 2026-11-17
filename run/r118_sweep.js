// R118: offline linear-probe sweep on hidden states dumped by run/r118_probe.js (BB_DUMP=<base>).  node run/r118_sweep.js <base> '[{"g":"all"|"gran","EP":1,"L2":1e-4,"lr":0.5,"online":false|true|"held","off":1}]'
// online "held" = one prequential pass over train then held slots (predict before update) = the fair comparison to the online brain
const fs = require('fs'), [base, cfgS] = process.argv.slice(2);
const off = new Uint32Array(fs.readFileSync(base + '.off').buffer.slice(0)), ix = new Uint16Array(fs.readFileSync(base + '.ix').buffer.slice(0)), M = JSON.parse(fs.readFileSync(base + '.json'));
const { nH, K, hf, nS, seq, hits, gran } = M, nSl = off.length - 1, held = [], tr = [];
for (let t = 2; t < Math.min(nSl, nS) - 1; t++) (t >= hf ? held : tr).push(t);
const brainHeld = held.filter(t => hits[t]).length / held.length;
function fit(sel, TS, EP, L2, lr = 0.5, online = false, o = 1) {
  const trL = online === 'held' ? tr.concat(held) : tr.slice(-TS), W = new Float32Array(nH * K), G2 = new Float32Array(nH * K).fill(1e-6), b = new Float32Array(K), z = new Float32Array(K);
  const score = t => { z.set(b); for (let p = off[t]; p < off[t + 1]; p++) { const i = ix[p]; if (sel[i]) { const r = i * K; for (let j = 0; j < K; j++) z[j] += W[r + j]; } } let bk = 0; for (let j = 1; j < K; j++) if (z[j] > z[bk]) bk = j; return bk; };
  let preq = 0, hp = 0;
  for (let ep = 0; ep < EP; ep++) for (let q = 0; q < trL.length; q++) { const t = online ? trL[q] : trL[(q * 7919 + ep * 104729) % trL.length], y = seq[t + o];
    z.set(b); for (let p = off[t]; p < off[t + 1]; p++) { const i = ix[p]; if (sel[i]) { const r = i * K; for (let j = 0; j < K; j++) z[j] += W[r + j]; } }
    let m = -1e9, am = 0; for (let j = 0; j < K; j++) if (z[j] > m) { m = z[j]; am = j; } if (am === y) { preq++; if (t >= hf) hp++; } let s = 0; for (let j = 0; j < K; j++) { z[j] = Math.exp(z[j] - m); s += z[j]; }
    for (let j = 0; j < K; j++) { const gk = z[j] / s - (j === y ? 1 : 0); b[j] -= 0.05 * gk; z[j] = gk; }
    for (let p = off[t]; p < off[t + 1]; p++) { const i = ix[p]; if (!sel[i]) continue; const r = i * K; for (let j = 0; j < K; j++) { const gg = z[j] + L2 * W[r + j]; G2[r + j] += gg * gg; W[r + j] -= lr * gg / Math.sqrt(G2[r + j]); } } }
  const acc = xs => xs.filter(t => score(t) === seq[t + o]).length / xs.length;
  return { held: +acc(held).toFixed(4), train2k: +acc(tr.slice(-2000)).toFixed(4), preqLast: online ? +(preq / trL.length).toFixed(4) : undefined, preqHeld: online === 'held' ? +(hp / held.length).toFixed(4) : undefined };
}
const all = new Uint8Array(nH).fill(1), gr = Uint8Array.from(gran);
const cfgs = JSON.parse(cfgS || '[]'); const out = { base, brainHeld: +brainHeld.toFixed(4), heldSlots: held.length, trainSlots: tr.length, res: [] };
for (const c of cfgs) { const t0 = Date.now(); const r = fit(c.g === 'gran' ? gr : all, c.TS || tr.length, c.EP, c.L2, c.lr, c.online, c.off != null ? c.off : 1); out.res.push(Object.assign({}, c, r, { s: (Date.now() - t0) / 1000 | 0 })); console.error(JSON.stringify(out.res[out.res.length - 1])); }
console.log(JSON.stringify(out));
