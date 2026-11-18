// node sw/scprobe.js <k> <variant> <tag> : one seqchoice order2 life (as r42 k) with probes -> sw/out/sp_<tag>_<k>.json
// per trial: ctx (prev, cur), target, choice, ok, output counts, delta (dopamine), per-group spike counts in the slot,
// striatum spike vector (sparse) for decoding, |dw| on OUT<-striatum and striatum<-cortex synapses.
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag] = process.argv.slice(2), k = +k0;
const task = { name: 'r42', env: 'seqchoice', params: { source: 'order2', nSyms: 1000 } };
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { if (!kv) continue; const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const nV = Math.max(64, k + 1), p = L.seedPlan({ valGrowths: nV, valArenas: nV }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const b = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], b, env), net = a.net, N = net.N;
const names = (b.regions || []).map(r => r.name), h1 = b.nIn + b.nHid;
const grp = q => q < b.nIn ? 'in' : q >= h1 ? 'OUT' : names[b.region[q]] || ('r' + b.region[q]);
const G = new Array(N); for (let q = 0; q < N; q++) G[q] = grp(q);
const str = []; for (let q = 0; q < N; q++) if (G[q] === 'striatum') str.push(q);
const cx = []; for (let q = 0; q < N; q++) if (G[q] === 'cortex' || G[q] === 'context') cx.push(q);
const syn = { os: [], sc: [], ss: [] }; for (let s2 = 0; s2 < net.posts.length; s2++) { const po = G[net.posts[s2]], pr = G[net.pres[s2]]; if (po === 'OUT' && pr === 'striatum') syn.os.push(s2); else if (po === 'striatum' && (pr === 'cortex' || pr === 'context')) syn.sc.push(s2); else if (po === 'striatum' && pr === 'striatum') syn.ss.push(s2); }
if (process.env.BB_NOIOUT) { let z = 0; for (let s2 = 0; s2 < net.posts.length; s2++) if (G[net.posts[s2]] === 'OUT' && G[net.pres[s2]] === 'striatum' && net.ws[s2] < 0) { net.ws[s2] = 0; net.w0[s2] = 0; z++; } console.log('NOIOUT zeroed', z); }
const T = a.task, cnt = new Float32Array(N), trials = []; let lastPos = T.pos;
const wPrev = { os: Float32Array.from(syn.os, s2 => net.ws[s2]), sc: Float32Array.from(syn.sc, s2 => net.ws[s2]) };
const sumW = (arr) => { let s = 0; for (const s2 of arr) s += net.ws[s2]; return s; };
while (!a.done) {
  const pos0 = T.pos, seqPrev = T.seq[pos0 - 1], seqCur = T.seq[pos0], tgt = T.targetOf(T.seq[pos0 + 1]);
  const counts0 = Array.from(T.counts);
  a.tick(n2 => { const sp = n2.spiked; for (let q = 0; q < N; q++) if (sp[q]) cnt[q]++; });
  if (T.pos !== pos0) {   // slot ended: decision made with T.lastCounts
    const c = Array.from(T.lastCounts), tot = c.reduce((x, y) => x + y, 0), srt = [...c].sort((x, y) => y - x), ch = SA.Dec ? null : null;
    const grpS = {}; for (let q = 0; q < N; q++) if (cnt[q]) grpS[G[q]] = (grpS[G[q]] || 0) + cnt[q];
    const sv = []; for (let i = 0; i < str.length; i++) if (cnt[str[i]]) sv.push(i, cnt[str[i]]);
    const cv = []; for (let i = 0; i < cx.length; i++) if (cnt[cx[i]]) cv.push(i, cnt[cx[i]]);
    let dOs = 0, dSc = 0; for (let i = 0; i < syn.os.length; i++) { const w = net.ws[syn.os[i]]; dOs += Math.abs(w - wPrev.os[i]); wPrev.os[i] = w; } for (let i = 0; i < syn.sc.length; i++) { const w = net.ws[syn.sc[i]]; dSc += Math.abs(w - wPrev.sc[i]); wPrev.sc[i] = w; }
    const hit = T.hits[T.hits.length - 1];
    trials.push({ p: seqPrev, c: seqCur, t: tgt, ok: hit, cnt: c, tot, m: tot > 0 ? (c[tgt] - Math.max(...c.filter((_, j) => j !== tgt))) / tot : 0, top2: tot > 0 ? (srt[0] - srt[1]) / tot : 0, da: net.lastDelta, v: net.value, g: grpS, sv, cv, dOs, dSc });
    cnt.fill(0);
  }
}
const out = { tag, k, nStr: str.length, nCx: cx.length, nSyn: { os: syn.os.length, sc: syn.sc.length, ss: syn.ss.length }, wSum: { os: sumW(syn.os), sc: sumW(syn.sc), ss: sumW(syn.ss) }, fitness: a.fitness, acc: T.accuracy, trials };
fs.writeFileSync(`sw/out/sp_${tag}_${k}.json`, JSON.stringify(out)); console.log(tag, k, 'fit', a.fitness.toFixed(3), 'acc', T.accuracy.toFixed(3), 'nStr', str.length, JSON.stringify(out.nSyn), JSON.stringify(out.wSum));
