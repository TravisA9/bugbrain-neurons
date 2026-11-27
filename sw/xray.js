// node sw/xray.js <k> <variant> <tag> [nSyms] [passageLen]
// BRAIN X-RAY (opt-in trace mode). One book growth exactly as sw/bookdiag.js (same seeds, same params), with READ-ONLY observers:
//   - a per-substep hook (Agent.tick onSubstep) that records which granule / cortex / output cells spiked in each symbol slot,
//   - a wrapper on task.act that, at the end of each slot, reads the slot's fired granules and their CURRENT readout weights,
//   - a wrapper on net.guRecruit that notices when a granule slot is recycled to a new key (forgetting).
// Nothing in js/ is changed and the observers never write engine state or draw random numbers, so the brain's life is bit-identical
// to bookdiag (checked: the per-symbol hits string equals bookdiag's for the same k / variant / nSyms; see run/xray/BITCHECK.md).
// Output: sw/out/xray_<tag>_<k>.json = { summary diagnostics (6), passage trace (first passageLen held-out steps) }.
// "Evidence" below = the granule readout: E[s] = sum over granules that spiked in the slot of their weight onto output s. It is an
// approximation of the real decision (spike counts + graded input of all cells); its agreement with the real answer is reported.
'use strict';
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag, nS, pl] = process.argv.slice(2), k = +k0, PASS = +(pl || 400);
const tj = { env: 'seq', params: { source: 'book', nSyms: +(nS || 10000), evalSyms: 2000 } }, task = Object.assign({ name: 'r42' }, tj);
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',').filter(Boolean)) { const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], brain, env), net = a.net, G = net.g, N = net.N;
const T = a.task, K = T.K, seq = T.seq, nSyms = T.P.nSyms, h0 = T.heldFrom, AL = SA.book.ALPHA, ch = i => i == null || i < 0 ? '?' : AL[i] === ' ' ? '_' : AL[i];
const o0 = G.nIn + G.nHid, reg = G.region, gr = G.gran, names = (gc.cell.regions || []).map(r => r.name || r.R && r.R.name);
const gu = net.gu; if (!gu) throw new Error('no granule utility pool (needs P.granUtility)');
const { nG, gOff, outS, outK } = gu, posts = net.posts, ws = net.ws;
// granule -> output-symbol edge table (topology is fixed; weights are read live)
const eT = new Int32Array(nG * K).fill(-1); for (let j = 0; j < nG; j++) for (let q = outS[j]; q < outS[j + 1]; q++) { const m = posts[outK[q]] - o0; if (m >= 0 && m < K) eT[j * K + m] = outK[q]; }
const w0f = (j, s) => { const e = eT[j * K + s]; return e < 0 ? 0 : ws[e]; };
// every presynaptic cell -> its edges onto the output cells (granules and cortex alike): the real excitatory / inhibitory drive
const oS = new Int32Array(N + 1), oE = [], oM = []; { const L0 = Array.from({ length: N }, () => []); for (let e = 0; e < posts.length; e++) { const m = posts[e] - o0; if (m >= 0 && m < K) L0[net.pres[e]].push(e); }
  for (let i = 0; i < N; i++) { oS[i] = oE.length; for (const e of L0[i]) { oE.push(e); oM.push(posts[e] - o0); } } oS[N] = oE.length; }
const OE = Int32Array.from(oE), OM = Int32Array.from(oM);
const cellDrive = (i, v) => { v.fill(0); for (let q = oS[i]; q < oS[i + 1]; q++) v[OM[q]] += ws[OE[q]]; };
const w = (j, s) => w0f(j, s);
// ---- key decoding: what context a granule detects, as text, and how far back it reaches (letters) ----
const lettersOf = s => s === '' ? '' : s.split(',').map(x => ch(+x)).join('');
function decode(key) {
  if (key == null) return { type: 'none', text: '', span: 0 };
  const c0 = key[0];
  if (c0 === 'C') { const [wv, pv, cv] = key.slice(1).split('|'); const W = lettersOf(wv), P = lettersOf(pv); return { type: 'chunk', text: W + '_' + P + ch(+cv), span: W.length + 1 + P.length + 1 }; }
  if (c0 === 'W') { const [pv, cv] = key.slice(1).split('|'); const P = lettersOf(pv); return { type: 'word', text: '_' + P + ch(+cv), span: P.length + 2 }; }
  if (c0 === 'P' || c0 === 'Q') return { type: c0 === 'P' ? 'phrase' : 'category', text: key, span: 12 };
  if (c0 === 'B' || c0 === 'F') { const pr = key.slice(1).split('|'), cur = pr[0].split(',')[0], bin = +pr[1], x = +pr[2]; const lo = c0 === 'B' ? 1 << bin : bin, hi = c0 === 'B' ? (2 << bin) - 1 : bin;
    return { type: 'copy', text: `'${ch(x)}' ${lo}-${hi} back, now '${ch(+cur)}'`, span: hi }; }
  const a2 = key.split(','), n = +a2[0]; if (n > 0 && a2.length === n + 1) { let t = ''; for (let c = n; c >= 1; c--) t += ch(+a2[c]); return { type: 'tuple' + n, text: t, span: n }; }
  return { type: 'other', text: key, span: 0 };
}
const keyOf = j => gu.keyBy[j];
if (process.env.XRAY_DEBUG) console.error('src keys', gu.src.map(S => S.keys.slice(0, 26).join(' ')), 'K', gu.K, 'Km', gu.Km, 'readTicks', T.P.readTicks, 'slot', T.slot, 'ALPHA', AL.join(''));
// ---- per-slot spike collection ----
const fm = new Uint8Array(nG), fl = new Int32Array(nG); let fn = 0;   // granules that SPIKED in the read window
const sc = new Float64Array(N), sl = new Int32Array(N); let sn = 0;   // spike count per cell in the read window (cells with output edges)
const isRead = () => T.phaseT >= T.slot - T.P.readTicks;
const RN = 256, regSlot = new Float64Array(RN); let outSlot = 0;
const onSub = nt => { const spk = nt.spk, n = nt.nSpk;
  const rd = isRead();
  for (let s = 0; s < n; s++) { const i = spk[s]; const isG = i >= gOff && i < gOff + nG;
    if (isG) regSlot[254]++; else if (i >= G.nIn && i < o0) regSlot[reg[i]]++; else if (i >= o0) outSlot++;
    if (!rd) continue; if (oS[i + 1] > oS[i]) { if (!sc[i]) sl[sn++] = i; sc[i]++; }
    if (isG) { const j = i - gOff; if (!fm[j]) { fm[j] = 1; fl[fn++] = j; } } } };
// ---- life-long per-granule stats ----
const gFire = new Float64Array(nG), gGood = new Float64Array(nG), gBad = new Float64Array(nG), gBorn = new Int32Array(nG), gLast = new Int32Array(nG).fill(-1);
const gLearned = new Uint8Array(nG), gRight = new Float64Array(nG), hFire = new Float64Array(nG), hFlip = new Float64Array(nG), hGood = new Float64Array(nG), hBad = new Float64Array(nG);
const shadow = new Array(nG).fill(null); for (let j = 0; j < nG; j++) shadow[j] = gu.keyBy[j];
const evictions = [], evictedAt = new Map(); let relearn = 0, relearnGap = 0, recruits = 0; const relearnUseful = [0, 0];
let win = 0;   // window (= symbol) index
const rec0 = net.guRecruit.bind(net);
net.guRecruit = function (key, ...A) { const r = rec0(key, ...A); if (r === true) { const j = gu.owned.get(key); recruits++;
    if (j != null) { const old = shadow[j];
      if (old != null && old !== key) { const d = decode(old); evictions.push({ t: win, learned: gLearned[j], type: d.type, span: d.span, text: d.text, age: win - gBorn[j], fires: gFire[j], right: gRight[j], good: gGood[j], bad: gBad[j], idle: gLast[j] < 0 ? -1 : win - gLast[j] });
        if (gLearned[j]) evictedAt.set(old, { t: win, good: gGood[j], right: gRight[j], fires: gFire[j] }); }
      const ev = evictedAt.get(key); if (ev) { relearn++; relearnGap += win - ev.t; relearnUseful[ev.fires >= 2 && ev.right / ev.fires >= 0.5 ? 1 : 0]++; evictedAt.delete(key); }
      shadow[j] = key; gLearned[j] = 1; gBorn[j] = win; gRight[j] = 0; gFire[j] = 0; gGood[j] = 0; gBad[j] = 0; gLast[j] = -1; } }
  return r; };
// ---- online count models on the same stream (reference: what pure memorization of recent letters can do) ----
const MAXO = 10, ctab = Array.from({ length: MAXO + 1 }, () => new Map());
const ctxKey = (i, o) => { let s = ''; for (let q = i - o + 1; q <= i; q++) s += String.fromCharCode(65 + seq[q]); return s; };
function countPredict(i) { for (let o = Math.min(MAXO, i + 1); o >= 1; o--) { const t = ctab[o].get(ctxKey(i, o)); if (t) { let b = -1, bv = 0; for (const [x, v] of t) if (v > bv) { bv = v; b = x; } return { pred: b, order: o }; } } return { pred: -1, order: 0 }; }
function knownOrder(i, tgt) { let best = 0; for (let o = 1; o <= Math.min(MAXO, i + 1); o++) { const t = ctab[o].get(ctxKey(i, o)); if (t && t.get(tgt)) best = o; else if (!t) break; } return best; }
function countAdd(i, tgt) { for (let o = 1; o <= Math.min(MAXO, i + 1); o++) { const key = ctxKey(i, o); let t = ctab[o].get(key); if (!t) ctab[o].set(key, t = new Map()); t.set(tgt, (t.get(tgt) || 0) + 1); } }
// ---- accumulators ----
const nBins = 10, L2L = {};   // learning-to-learn: [bin][novelty] -> [brain hits, count-model hits, n]
const novB = c => c === 0 ? 'new' : c <= 2 ? '1-2' : c <= 9 ? '3-9' : '10+';
const ctx4 = new Map();
const err = { didntKnow: 0, weak: 0, outshouted: 0, n: 0, unknowable: 0, knowableMissed: 0, ex: { didntKnow: [], outshouted: [] }, ratioHist: new Array(11).fill(0), byKnown: {} };
const agree = { evid: 0, n: 0, evidHeld: 0, nHeld: 0 };
const spanH = { held: {}, heldOk: {}, heldBad: {} }, spanB = s => s <= 2 ? '1-2' : s <= 3 ? '3' : s <= 4 ? '4' : s <= 8 ? '5-8' : s <= 16 ? '9-16' : s <= 32 ? '17-32' : '33+';
let wSpanNum = 0, wSpanDen = 0; const typeShare = {}; let noEvid = 0;
const reuse = [];   // word-end windows: { w, prev, keys[] }
let curWord = '', prevWord = '';
const passage = []; let heldN = 0, heldOk = 0, cmHeldOk = 0;
const firedHeld = new Set(); let firedSizeSum = 0, firedSizeN = 0;
const E = new Float64Array(K), E2 = new Float64Array(K), V = new Float64Array(K); let DB = new Float64Array(4096 * K);
const cFire = new Float64Array(N), cFlip = new Float64Array(N), cGood = new Float64Array(N), cFired = new Set(); let granShareN = 0, granShareD = 0; const spur = { n: 0, bad: 0, cn: 0, cbad: 0 }, offCtx = { n: 0, all: 0, drive: 0, allDrive: 0 };
const amax = v => { let b = 0; for (let s = 1; s < v.length; s++) if (v[s] > v[b]) b = s; return b; };
const act0 = T.act.bind(T);
T.act = function (out, ag) {
  const pos0 = this.pos, ev = act0(out, ag);
  if (this.pos !== pos0 && pos0 < nSyms) {   // a prediction was scored this tick: input seq[pos0], target seq[pos0+1]
    const i = pos0, inp = seq[i], tgt = seq[i + 1], last = this.recent[this.recent.length - 1], pred = last[1], ok = !!last[2], held = h0 >= 0 && i >= h0;
    const cnt = this.lastCounts;
    // drive of every cell that spiked in the read window onto the outputs (spike count x current weight); E = the summed drive
    if (DB.length < sn * K) DB = new Float64Array(sn * K * 2);
    E.fill(0); let eG = 0, eGt = 0; for (let q = 0; q < sn; q++) { const i = sl[q]; cellDrive(i, V); const c = sc[i]; for (let s = 0; s < K; s++) { const x = c * V[s]; DB[q * K + s] = x; E[s] += x; } }
    const kE = amax(E); agree.n++; if (kE === pred) agree.evid++; if (held) { agree.nHeld++; if (kE === pred) agree.evidHeld++; }
    // pivotal analysis: would removing one spiking cell's drive change the winner?  (granules: per granule; cortex: per cell)
    let topJ = -1, topW = 0; const contrib = [], grp = {};
    for (let q = 0; q < sn; q++) { const i = sl[q], isG = i >= gOff && i < gOff + nG; for (let s = 0; s < K; s++) E2[s] = E[s] - DB[q * K + s]; const k2 = amax(E2), dP = DB[q * K + kE], dT = DB[q * K + tgt];
      if (isG) { const j = i - gOff; gFire[j]++; gLast[j] = win; { let bs = 0; for (let s2 = 1; s2 < K; s2++) if (DB[q * K + s2] > DB[q * K + bs]) bs = s2; if (bs === tgt && DB[q * K + bs] > 0) gRight[j]++; }
        if (held && !gu.xf[j]) { offCtx.n++; offCtx.drive += Math.max(0, dP); } if (held) { offCtx.all++; offCtx.allDrive += Math.max(0, dP); } if (kE === tgt && k2 !== tgt) gGood[j]++; if (kE !== tgt && k2 === tgt) gBad[j]++;
        if (held) { hFire[j]++; firedHeld.add(j); if (k2 !== kE) { hFlip[j]++; if (kE === tgt) hGood[j]++; else if (k2 === tgt) hBad[j]++; } }
        eG += dP; if (dP > topW) { topW = dP; topJ = j; } if (held && passage.length < PASS) contrib.push([j, DB[q * K + pred], dT]); }
      else if (held) { cFire[i]++; cFired.add(i); if (k2 !== kE) { cFlip[i]++; if (kE === tgt) cGood[i]++; } }
      if (held) { const gname = isG ? 'granule' : (names[reg[i]] || 'r' + reg[i]); const Gp = grp[gname] || (grp[gname] = [0, 0, 0]); Gp[0] += DB[q * K + pred]; Gp[1] += dT; Gp[2]++; } }
    if (held) { firedSizeSum += fn; firedSizeN++; const tot = Math.max(1e-9, E[kE]); granShareN += eG / tot; granShareD++; }
    // spurious matches: a matched tuple / chunk detector whose context is NOT the true recent text
    if (held) { let txt = ''; for (let q = Math.max(0, i - 40); q <= i; q++) txt += ch(seq[q]);
      for (let q = 0; q < gu.xFn; q++) { const d = decode(keyOf(gu.xF[q])); if (d.type.startsWith('tuple')) { spur.n++; if (!txt.endsWith(d.text)) spur.bad++; } else if (d.type === 'chunk') { spur.cn++; if (!txt.endsWith(d.text)) spur.cbad++; } } }
    // context length that decided the answer: the granule with the largest drive to the winner, unless the cortex path gave most of it
    let dSpan = 0; const cortexWon = E[kE] > 0 && eG < 0.5 * E[kE];
    if (held) { let b; if (cortexWon) b = 'cortex (≤3)'; else if (topJ >= 0) b = spanB(decode(keyOf(topJ)).span); else b = 'none';
      if (!cortexWon && topJ >= 0) dSpan = decode(keyOf(topJ)).span; spanH.held[b] = (spanH.held[b] || 0) + 1; const H2 = ok ? spanH.heldOk : spanH.heldBad; H2[b] = (H2[b] || 0) + 1; if (topJ < 0) noEvid++; }
    if (held) for (let q = 0; q < sn; q++) { const i = sl[q]; if (!(i >= gOff && i < gOff + nG)) continue; const x = DB[q * K + kE]; if (x > 0) { const d = decode(keyOf(i - gOff)); wSpanNum += x * d.span; wSpanDen += x; typeShare[d.type] = (typeShare[d.type] || 0) + x; } }
    // count models / novelty
    const cp = countPredict(i), kn = knownOrder(i, tgt), c4k = i >= 3 ? ctxKey(i, 4) : null, c4 = c4k ? (ctx4.get(c4k) || 0) : 0;
    // error typing (held-out, wrong answers)
    let etype = null, ratio = null;
    if (held) { heldN++; if (ok) heldOk++; if (cp.pred === tgt) cmHeldOk++;
      const kb = (kn >= 4 ? '4+' : String(kn)); const KB = err.byKnown[kb] || (err.byKnown[kb] = [0, 0]); KB[1]++; if (ok) KB[0]++;
      if (!ok) { err.n++; const ep = Math.max(E[pred], 1e-9); ratio = Math.max(0, E[tgt]) / ep; err.ratioHist[Math.min(10, Math.floor(ratio * 10))]++;
        etype = ratio < 0.1 ? 'didntKnow' : ratio < 0.5 ? 'weak' : 'outshouted'; err[etype]++;
        if (kn === 0) err.unknowable++; else err.knowableMissed++;
        const exL = etype === 'weak' ? null : err.ex[etype]; if (exL && exL.length < 12) { let ctx = ''; for (let q = Math.max(0, i - 24); q <= i; q++) ctx += ch(seq[q]);
          const top = [], sup = []; for (let q = 0; q < sn; q++) { const i2 = sl[q]; if (!(i2 >= gOff && i2 < gOff + nG)) continue; const d = DB[q * K + pred] - DB[q * K + tgt], x = DB[q * K + tgt]; if (d > 0) top.push([d, i2 - gOff]); if (x > 0) sup.push([x, i2 - gOff]); }
          top.sort((x, y) => y[0] - x[0]); sup.sort((x, y) => y[0] - x[0]);
          const cg = {}; for (const [gname, v] of Object.entries(grp)) cg[gname] = { toPred: +v[0].toFixed(1), toTruth: +v[1].toFixed(1) };
          exL.push({ ctx, truth: ch(tgt), pred: ch(pred), ratio: +ratio.toFixed(3), knownOrder: kn, blame: top.slice(0, 3).map(([d, j]) => ({ unit: decode(keyOf(j)).type, text: decode(keyOf(j)).text, margin: +d.toFixed(2) })), support: sup.slice(0, 3).map(([x, j]) => ({ unit: decode(keyOf(j)).type, text: decode(keyOf(j)).text, w: +x.toFixed(2) })), byPopulation: cg }); } } }
    // learning to learn (training part, the whole life binned)
    { const bin = Math.min(nBins - 1, Math.floor(i * nBins / nSyms)), nb = novB(c4), key = (held ? 'H' : bin) + ':' + nb, r = L2L[key] || (L2L[key] = [0, 0, 0]); r[0] += ok ? 1 : 0; r[1] += cp.pred === tgt ? 1 : 0; r[2]++; }
    // unit reuse: the window that ends a word (input = last letter, target = the delimiter)
    const isD = AL[inp] === ' ' || AL[inp] === '.'; if (!isD) curWord += AL[inp];
    if (!isD && (AL[tgt] === ' ' || AL[tgt] === '.') && i > nSyms * 0.5) { const keys = []; for (let q = 0; q < gu.xFn; q++) { const kk = keyOf(gu.xF[q]); if (kk != null) keys.push(kk); } reuse.push({ w: curWord, prev: prevWord, keys }); }
    if (isD && curWord) { prevWord = curWord; curWord = ''; }
    // passage trace
    if (held && passage.length < PASS) {
      const rs = {}; for (let r = 0; r < RN; r++) if (regSlot[r]) rs[names[r] || 'r' + r] = regSlot[r];
      const topC = Array.from(cnt).map((v, s) => [s, v]).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([s, v]) => [ch(s), +v.toFixed(2)]);
      const topE = Array.from(E).map((v, s) => [s, v]).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([s, v]) => [ch(s), +v.toFixed(2)]);
      contrib.sort((x, y) => Math.max(y[1], y[2]) - Math.max(x[1], x[2]));
      passage.push({ in: ch(inp), truth: ch(tgt), pred: ch(pred), ok, counts: topC, evid: topE, eT: +E[tgt].toFixed(2), eP: +E[pred].toFixed(2), nGran: fn, regions: rs, outSpikes: outSlot,
        units: contrib.slice(0, 8).map(([j, wp, wt]) => { const d = decode(keyOf(j)); return { id: j, type: d.type, text: d.text, span: d.span, toPred: +wp.toFixed(2), toTruth: +wt.toFixed(2) }; }),
        pop: Object.fromEntries(Object.entries(grp).map(([gname, v]) => [gname, { toPred: +v[0].toFixed(1), toTruth: +v[1].toFixed(1), cells: v[2] }])), matched: gu.xFn,
        etype, ratio: ratio == null ? null : +ratio.toFixed(3), span: dSpan, knownOrder: kn, cmPred: ch(cp.pred), cmOrder: cp.order, seen4: c4 });
    }
    // update reference counters after the prediction (online, like the brain)
    countAdd(i, tgt); if (c4k) ctx4.set(c4k, c4 + 1);
    for (let q = 0; q < fn; q++) fm[fl[q]] = 0; fn = 0; for (let q = 0; q < sn; q++) sc[sl[q]] = 0; sn = 0; regSlot.fill(0); outSlot = 0; win++;
  }
  return ev; };
const t0 = Date.now(); while (!a.done) a.tick(onSub);
const st = T.stats();
// ---- diagnostics ----
let keyed = 0, everFiredHeld = firedHeld.size, flipped = 0, flippedGood = 0, flippedBad = 0; const typeN = {}, typeFlip = {};
for (let j = 0; j < nG; j++) { const kk = gu.keyBy[j]; if (kk == null) continue; keyed++; const ty = decode(kk).type; typeN[ty] = (typeN[ty] || 0) + 1; if (hFlip[j] > 0) { flipped++; typeFlip[ty] = (typeFlip[ty] || 0) + 1; } if (hGood[j] > 0) flippedGood++; if (hBad[j] > 0) flippedBad++; }
// reuse: same word, different previous word -> Jaccard of fired unit keys (overall and per unit type); baseline: different words
const byW = new Map(); for (const r of reuse) { if (r.w.length < 2) continue; let A = byW.get(r.w); if (!A) byW.set(r.w, A = []); A.push(r); }
const jac = (A, B) => { const s = new Set(A), t = new Set(B); let i = 0; for (const x of t) if (s.has(x)) i++; const u = s.size + t.size - i; return u ? i / u : 0; };
const typeF = t => kk => decode(kk).type.startsWith(t);
const reuseOut = { pairs: 0, jacc: 0, byType: {}, diffWordJacc: 0, diffPairs: 0, long: { pairs: 0, sharedWholeWord: 0 } };
const TY = ['tuple', 'chunk', 'copy', 'word']; for (const t of TY) reuseOut.byType[t] = { pairs: 0, shareAny: 0, jacc: 0 };
for (const [wd, A] of byW) { let c = 0; for (let x = 0; x < A.length && c < 60; x++) for (let y = x + 1; y < A.length && c < 60; y++) { if (A[x].prev === A[y].prev) continue; c++;
    reuseOut.pairs++; reuseOut.jacc += jac(A[x].keys, A[y].keys);
    for (const t of TY) { const f = typeF(t), X = A[x].keys.filter(f), Y = A[y].keys.filter(f); if (!X.length && !Y.length) continue; const R = reuseOut.byType[t]; R.pairs++; const jj = jac(X, Y); R.jacc += jj; if (jj > 0) R.shareAny++; }
    if (wd.length >= 5) { reuseOut.long.pairs++; const sx = new Set(A[x].keys.filter(kk => decode(kk).span >= wd.length + 1)); if (A[y].keys.some(kk => sx.has(kk) && decode(kk).span >= wd.length + 1)) reuseOut.long.sharedWholeWord++; } } }
{ const ws2 = [...byW.values()].map(A => A[0]); for (let x = 0; x + 1 < ws2.length && reuseOut.diffPairs < 3000; x++) { reuseOut.diffPairs++; reuseOut.diffWordJacc += jac(ws2[x].keys, ws2[x + 1].keys); } }
reuseOut.jacc = reuseOut.pairs ? +(reuseOut.jacc / reuseOut.pairs).toFixed(4) : null; reuseOut.diffWordJacc = reuseOut.diffPairs ? +(reuseOut.diffWordJacc / reuseOut.diffPairs).toFixed(4) : null;
for (const t of TY) { const R = reuseOut.byType[t]; R.jacc = R.pairs ? +(R.jacc / R.pairs).toFixed(4) : null; R.shareAny = R.pairs ? +(R.shareAny / R.pairs).toFixed(4) : null; }
reuseOut.words = byW.size;
// forgetting
const EL = evictions.filter(e => e.learned), uf = e => e.fires >= 2 && e.right / e.fires >= 0.5;
const fg = { recruits, evictionsInitialRandom: evictions.length - EL.length, learnedEvicted: EL.length, learnedEvictedNeverFiredAfterBirth: EL.filter(e => e.fires === 0).length, learnedEvictedUsuallyRight: EL.filter(uf).length, learnedEvictedPivotal: EL.filter(e => e.good > 0).length, evictions: evictions.length, evictedUseful: evictions.filter(e => e.good > 0).length, evictedNeverFired: evictions.filter(e => e.fires === 0).length, relearned: relearn, relearnMeanGap: relearn ? Math.round(relearnGap / relearn) : null, relearnUseful,
  medianAge: null, medianIdle: null, byType: {}, examplesUseful: EL.filter(uf).slice(-12) };
if (EL.length) { const ag = EL.map(e => e.age).sort((x, y) => x - y), id = EL.map(e => e.idle).filter(x => x >= 0).sort((x, y) => x - y); fg.medianAge = ag[ag.length >> 1]; fg.medianIdle = id.length ? id[id.length >> 1] : null;
  for (const e of EL) { const B = fg.byType[e.type] || (fg.byType[e.type] = { n: 0, usuallyRight: 0 }); B.n++; if (uf(e)) B.usuallyRight++; } }
let liveUseful = 0, liveN = 0, liveFired = 0; for (let j = 0; j < nG; j++) if (gu.keyBy[j] != null && gLearned[j]) { liveN++; if (gFire[j] >= 2) { liveFired++; if (gRight[j] / gFire[j] >= 0.5) liveUseful++; } } fg.liveLearned = liveN; fg.liveLearnedFiredTwice = liveFired; fg.liveLearnedUsuallyRight = liveUseful;
// timeline of learned-item evictions (per tenth of the life)
fg.timeline = Array.from({ length: 10 }, (_, b) => { const E3 = EL.filter(e => Math.min(9, Math.floor(e.t * 10 / nSyms)) === b); return { n: E3.length, usuallyRight: E3.filter(uf).length }; });
const out = { k, tag, variant, nSyms, heldFrom: h0, heldAcc: st.heldAcc, trainAcc: st.trainAcc, sec: (Date.now() - t0) / 1000, nG, K,
  hits: T.hits.slice(T.h0.n).join(''),
  agreement: { evidVsReal: +(agree.evid / agree.n).toFixed(4), evidVsRealHeld: +(agree.evidHeld / agree.nHeld).toFixed(4) },
  countModel: { heldAcc: +(cmHeldOk / heldN).toFixed(4), maxOrder: MAXO, note: 'online backoff count model (longest seen context up to 10 letters, majority successor) on the same stream' },
  errors: { wrong: err.n, didntKnow: err.didntKnow, weak: err.weak, outshouted: err.outshouted, unknowable: err.unknowable, knowableMissed: err.knowableMissed, ratioHist: err.ratioHist,
    accByKnownOrder: Object.fromEntries(Object.entries(err.byKnown).map(([b, v]) => [b, { acc: +(v[0] / v[1]).toFixed(4), n: v[1] }])), examples: err.ex },
  reuse: reuseOut,
  dead: { poolSlots: nG, keyed, firedInHeld: everFiredHeld, flippedAny: flipped, flippedToRight: flippedGood, flippedToWrong: flippedBad, typeN, typeFlip, meanFiredPerStep: +(firedSizeSum / Math.max(1, firedSizeN)).toFixed(1) },
  forgetting: fg,
  cortexDead: (() => { let nC = 0, fl2 = 0, gd = 0; const byR = {}; for (let i = G.nIn; i < o0; i++) { if (i >= gOff && i < gOff + nG) continue; if (oS[i + 1] === oS[i]) continue; nC++; const r = names[reg[i]] || 'r' + reg[i]; const B = byR[r] || (byR[r] = { cells: 0, fired: 0, flipped: 0 }); B.cells++; if (cFire[i] > 0) B.fired++; if (cFlip[i] > 0) { fl2++; B.flipped++; } if (cGood[i] > 0) gd++; } return { cellsWithOutputEdges: nC, flippedAny: fl2, flippedToRight: gd, firedInHeld: cFired.size, byRegion: byR }; })(),
  granuleShareOfWinnerDrive: +(granShareN / Math.max(1, granShareD)).toFixed(4),
  offContextGranuleSpikes: { spikingNotMatched: offCtx.n, spikingAll: offCtx.all, driveShareToWinner: +(offCtx.drive / Math.max(1e-9, offCtx.allDrive)).toFixed(4) },
  spuriousMatches: { tupleFired: spur.n, tupleNotInText: spur.bad, chunkFired: spur.cn, chunkNotInText: spur.cbad },
  learningToLearn: Object.fromEntries(Object.entries(L2L).map(([kk, v]) => [kk, { brain: +(v[0] / v[2]).toFixed(4), count: +(v[1] / v[2]).toFixed(4), n: v[2] }])),
  contextUsed: { decisiveSpanHeld: spanH.held, decisiveSpanCorrect: spanH.heldOk, decisiveSpanWrong: spanH.heldBad, noEvidence: noEvid, evidenceWeightedSpan: +(wSpanNum / Math.max(1e-9, wSpanDen)).toFixed(2), evidenceShareByType: Object.fromEntries(Object.entries(typeShare).map(([t, v]) => [t, +(v / wSpanDen).toFixed(4)])) },
  guStats: JSON.parse(JSON.stringify(net.granUtilityStats ? net.granUtilityStats() : {}, (kk, v) => Array.isArray(v) && v.length > 20 ? v.length : v)),
  passage };
fs.writeFileSync(`sw/out/xray_${tag}_${k}.json`, JSON.stringify(out));
const { passage: _p, hits: _h, ...brief } = out; console.log(JSON.stringify(brief).slice(0, 4000));
