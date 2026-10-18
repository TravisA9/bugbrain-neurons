// R61 book diagnosis recorder: node run/r61_rec.js <plan> <nSyms> <evalSyms> <seed> <out prefix> [variant k=v,...]
// Grows one brain, lives one book life, and records per symbol slot: the hidden cells' spike counts in the slot (sparse), the output
// counts, the symbol and the brain's prediction; every nSyms/20 slots a saturation checkpoint (plastic weights, thresholds, output silence).
// Writes <prefix>.bin (per slot: u16 nActive, nActive x (u16 cell, u8 count), 24 x u8 output counts) and <prefix>.json (meta + checkpoints).
const L = require('./lib.js'), SA = L.SA, fs = require('fs');
const [plan, nS, eS, seedS, out, variant = 'base'] = process.argv.slice(2), seed = +seedS;
const task = { name: 'r61', env: 'seq', params: { source: 'book', nSyms: +nS, evalSyms: +eS, clock2: true, clock3: true } };
const g = SA.PLANS[plan].make(), cells = g.kind === 'regions' ? g.regions.map(r => r.g) : [g];
if (variant !== 'base') for (const kv of variant.split(',')) { const [k, v] = kv.split('='), [s, f] = k.split('.'); if (s === 'P') SA.params[f] = +v; else if (s === 'T') task.params[f] = +v; else for (const C of cells) C[s][f] = +v; }
const env = L.setupTask(task), brain = SA.growCell(g, { seed, spec: env.spec }), a = new SA.Agent(g, seed, brain, env), net = a.net, T = a.task;
const nIn = brain.nIn, nHid = brain.nHid, o0 = nIn + nHid, cnt = new Uint16Array(nHid), K = T.K, chunks = [], meta = { plan, variant, seed, nSyms: +nS, evalSyms: +eS, nIn, nHid, nOut: brain.nOut, K,
  region: Array.from(brain.region.slice(nIn, o0)), mix: brain.mix ? Array.from(brain.mix.slice(nIn, o0)) : null, cellType: Array.from(brain.cellType.slice(nIn, o0)), regions: brain.regions.map(r => r.name), heldFrom: T.heldFrom, ckpt: [] };
const wMax = SA.params.wMax, ck = Math.max(1, Math.floor(+nS / 20)); let lastPos = 0, silent = 0, slots = 0, buf = Buffer.alloc(1 << 20), bp = 0;
const put = (b) => { if (bp + b.length > buf.length) { chunks.push(buf.subarray(0, bp)); buf = Buffer.alloc(Math.max(1 << 20, b.length)); bp = 0; } b.copy(buf, bp); bp += b.length; };
const outCnt = new Uint16Array(brain.nOut);
const hook = (n) => { const sp = n.spk; for (let s = 0; s < n.nSpk; s++) { const i = sp[s]; if (i >= nIn && i < o0) cnt[i - nIn]++; else if (i >= o0) outCnt[i - o0]++; } };
const checkpoint = () => { const ws = net.ws, w0 = net.w0, pl = net.plastic; let hi = 0, lo = 0, sum = 0, n = 0; for (let q = 0; q < pl.length; q++) { const k = pl[q]; if (w0[k] <= 0) continue; const w = ws[k]; n++; sum += w; if (w >= 0.99 * wMax) hi++; if (w <= 0.01 * wMax) lo++; }
  let th = null; if (net.thr && net.mxList) { const L2 = net.mxList; let s = 0, s2 = 0; for (let q = 0; q < L2.length; q++) { s += net.thr[L2[q]]; s2 += net.thr[L2[q]] ** 2; } th = { mean: s / L2.length, sd: Math.sqrt(Math.max(0, s2 / L2.length - (s / L2.length) ** 2)) }; }
  meta.ckpt.push({ pos: T.pos, plastic: n, fracHi: hi / n, fracLo: lo / n, meanW: sum / n, wMax, mixThr: th, silentOut: slots ? silent / slots : 0, acc: T.n ? T.correct / T.n : 0, recentAcc: T.lastAcc(500) }); silent = 0; slots = 0; };
checkpoint();
while (!a.done) { a.tick(hook);
  if (T.pos !== lastPos) { lastPos = T.pos; let na = 0; for (let i = 0; i < nHid; i++) if (cnt[i]) na++;
    const b = Buffer.alloc(2 + 3 * na + 24); b.writeUInt16LE(na, 0); let o = 2; for (let i = 0; i < nHid; i++) if (cnt[i]) { b.writeUInt16LE(i, o); b[o + 2] = Math.min(255, cnt[i]); o += 3; }
    let tot = 0; for (let m = 0; m < 24; m++) { b[o + m] = Math.min(255, outCnt[m] || 0); tot += outCnt[m] || 0; } put(b); if (!tot) silent++; slots++;
    (meta.pred = meta.pred || []).push(T.recent.length ? T.recent[T.recent.length - 1][1] : -1);
    (meta.rc = meta.rc || []).push(Array.from(T.lastCounts, x => +x.toFixed(2)));   // read-window output counts behind the decision
    cnt.fill(0); outCnt.fill(0); if (T.pos % ck === 0) checkpoint(); } }
chunks.push(buf.subarray(0, bp)); fs.writeFileSync(out + '.bin', Buffer.concat(chunks));
meta.seq = Array.from(T.seq.slice(0, T.pos + 1)); meta.hits = T.hits; meta.stats = T.stats(); fs.writeFileSync(out + '.json', JSON.stringify(meta));
console.log(JSON.stringify({ out, slots: T.pos, heldAcc: meta.stats.heldAcc, trainAcc: meta.stats.trainAcc }));
