// counterfactual: the cells dense in dump A (non-granule, slot rate > .5, excluding rate-1 relays) - their rate / symbol selectivity in dump B
const fs = require('fs'), ld = b => { const M = JSON.parse(fs.readFileSync(b + '.json')), rd = (f, T) => { const B = fs.readFileSync(f); return new T(B.buffer.slice(B.byteOffset, B.byteOffset + B.length)); };
  const off = rd(b + '.off', Uint32Array), ix = rd(b + '.ix', Uint16Array), nS = off.length - 1, { nH, K, seq, gran } = M, rate = new Float64Array(nH), by = new Float64Array(nH * K), sn = new Float64Array(K);
  for (let t = 0; t < nS; t++) { sn[seq[t]]++; for (let q = off[t]; q < off[t + 1]; q++) { rate[ix[q]]++; by[ix[q] * K + seq[t]]++; } } for (let i = 0; i < nH; i++) rate[i] /= nS; return { rate, by, sn, K, gran, nH }; };
const A = ld(process.argv[2]), S = A.rate.map((r, i) => !A.gran[i] && r > 0.5 && r < 0.99 ? 1 : 0), ids = []; S.forEach((x, i) => x && ids.push(i));
// selectivity: entropy-based mutual information between the cell's spike and the current symbol (bits), averaged over the set
const mi = (D, i) => { let n = 0, on = 0; for (let y = 0; y < D.K; y++) { n += D.sn[y]; on += D.by[i * D.K + y]; } const p1 = on / n, H = p => p > 0 && p < 1 ? -p * Math.log2(p) - (1 - p) * Math.log2(1 - p) : 0; let hc = 0; for (let y = 0; y < D.K; y++) if (D.sn[y]) hc += D.sn[y] / n * H(D.by[i * D.K + y] / D.sn[y]); return H(p1) - hc; };
const out = {}; for (const b of process.argv.slice(2)) { const D = ld(b); let r = 0, m = 0, d50 = 0; for (const i of ids) { r += D.rate[i]; m += mi(D, i); } for (let i = 0; i < D.nH; i++) if (!D.gran[i] && D.rate[i] > 0.5) d50++;
  let ms = 0, ns = 0; for (let i = 0; i < D.nH; i++) if (!D.gran[i] && !S[i] && D.rate[i] > 0.02 && D.rate[i] < 0.5) { ms += mi(D, i); ns++; }
  out[b.split('/').pop()] = { set: ids.length, setRate: +(r / ids.length).toFixed(3), setMIbits: +(m / ids.length).toFixed(4), otherMIbits: +(ms / ns).toFixed(4), nonGranDense50: d50 }; }
console.log(JSON.stringify(out));
