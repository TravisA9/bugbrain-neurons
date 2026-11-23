// node sw/nameprobe.js <k> <variant> <tag> [nSyms=30000] [nNames=10 per gap]  (R143 standing prose name-recall probe)
// One book life of nSyms letters (same growth/seed path as sw/bookdiag.js / sw/standing_gen.js), then invented names in prose, each mentioned twice:
//   "<intro> NAME <filler of ~gap letters> NAME <tail>"  gaps 5/15/31/61/127 (letters between the end of mention 1 and the start of mention 2).
// Set ON  (learning on): passages appended to the life (teacher-forced, plasticity on).  Set OFF (learning frozen): after the life, plasticity off.
// Different invented names in each set; none occurs in the book. Guesses are the brain's argmax for each letter, teacher-forced on the true text.
// Scores per mention: first = first letter of the name (after the space), rest = letters 2..end (the first letter is given), exact = all of letters 2..end right.
// Recall = 2nd mention minus 1st mention (the 1st mention is the no-memory baseline for the same letters).
// -> sw/out/np_<tag>_<k>.json (small summary + per-passage marks)
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag, nS0, nN0] = process.argv.slice(2), k = +k0, NS = +(nS0 || 30000), NN = +(nN0 || 10);
const B = SA.book, A = B.ALPHA, IDX = new Map(A.map((c, i) => [c, i]));
const GAPS = [5, 15, 31, 61, 127];
// deterministic invented names: CV(C)V... from the alphabet, 6-8 letters, not in the book
let rs = 12345; const rnd = n => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs % n; };
const CON = 'bdfgklmnprstvw', VOW = 'aeiou';
const mk = () => { const n = 6 + rnd(3); let s = ''; for (let i = 0; s.length < n; i++) s += i % 2 ? VOW[rnd(5)] : CON[rnd(CON.length)]; return s.slice(0, n); };
const names = []; const seenN = new Set(); while (names.length < 2 * NN * GAPS.length) { const nm = mk(); if (seenN.has(nm) || B.TRAIN.includes(nm) || B.HELD.includes(nm)) continue; seenN.add(nm); names.push(nm); }
const INTRO = ['there was a man named ', 'a little girl named ', 'once a king called ', 'the old woman said to ', 'in the town lived a boy named '];
const TAIL = ['was very glad. ', 'went home. ', 'said nothing. ', 'ran to the door. ', 'sat down by the fire. '];
// filler: natural book text (held part) cut at word boundaries to ~gap letters (exact gap recorded)
const H = B.HELD; let fo = 5000;
const filler = g => { if (g <= 5) return ' and '.slice(0, Math.max(3, g)).padEnd(g, ' ').replace(/^ */, ' ').replace(/ *$/, ' ');
  let o = H.indexOf(' ', fo) + 1; fo = o + 400; let s = H.slice(o, o + g + 20).replace(/\./g, ' '); s = s.slice(0, s.lastIndexOf(' ', g - 1) + 1); return ' ' + s.trim() + ' '; };
const mkSet = nms => { const out = []; let t = 0; for (let q = 0; q < nms.length; q++) { const nm = nms[q], g = GAPS[q % GAPS.length]; const intro = INTRO[t % 5], tail = TAIL[t % 5]; t++;
  const fl = filler(g), s = intro + nm + fl + nm + ' ' + tail, i1 = intro.length, i2 = i1 + nm.length + fl.length; out.push({ name: nm, gapTarget: g, gap: i2 - (i1 + nm.length), text: s, m1: i1, m2: i2, n: nm.length }); } return out; };
const NG = NN * GAPS.length, setOn = mkSet(names.slice(0, NG)), setOff = mkSet(names.slice(NG));   // every name is used in exactly one passage
const onTxt = setOn.map(x => x.text).join(''), offTxt = setOff.map(x => x.text).join('');
const nSyms = NS + onTxt.length;
const tj = { env: 'seq', params: { source: 'book', nSyms, evalSyms: 2000 + onTxt.length, genSyms: offTxt.length } }, task = Object.assign({ name: 'r42' }, tj);
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { if (!kv) continue; const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], brain, env), net = a.net, T = a.task;
if (T.genSyms !== offTxt.length) throw new Error('genSyms ' + T.genSyms);
for (let i = 0; i < onTxt.length; i++) T.seq[NS + 1 + i] = IDX.get(onTxt[i]);
const onG = [], offG = [], argmax = c => { let b = 0; for (let j = 1; j < c.length; j++) if (c[j] > c[b]) b = j; return b; };
const orig = T.act.bind(T); T.P.genTemp = 0;
T.act = function (out, ag) { const p0 = this.pos, r = orig(out, ag);
  if (this.pos > p0) { if (p0 < nSyms) { if (p0 >= NS) onG.push(this.recent[this.recent.length - 1][1]); }
    else { const i = p0 - nSyms; offG.push(argmax(this.lastCounts)); if (i < offTxt.length) this.seq[this.pos] = IDX.get(offTxt[i]); } }
  return r; };
// NOTE on alignment: onG[i] = guess for onTxt[i] (made after onTxt[i-1]; onG[0] after the last held letter). offG[i] = guess made after reading offTxt[i]... verified below.
const t0 = Date.now(); while (!a.done && T.pos < NS) a.tick(); const st0 = T.stats();
while (!a.done && T.pos < nSyms) a.tick();
const was = SA.params.plasticity; SA.params.plasticity = false; while (!a.done) a.tick(); SA.params.plasticity = was;
const score = (set, txt, gs, shift) => { const G = i => A[gs[i + shift]]; let o = 0; const per = [];
  const agg = {}; for (const x of set) { const one = m => { const f = G(o + m - 1 + 1) === undefined ? 0 : 0; let h = 0, n = 0, mk2 = ''; for (let i = 1; i < x.n; i++) { n++; const ok = G(o + m + i) === txt[o + m + i]; h += ok; mk2 += ok ? txt[o + m + i].toUpperCase() : '_'; }
      return { first: +(G(o + m) === txt[o + m]), rest: h, n, exact: +(h === n), marks: txt[o + m] + mk2 }; };
    if (txt.slice(o + x.m1, o + x.m1 + x.n) !== x.name || txt.slice(o + x.m2, o + x.m2 + x.n) !== x.name) throw new Error('align ' + x.name);
    const r1 = one(x.m1), r2 = one(x.m2); per.push({ name: x.name, gap: x.gap, gapT: x.gapTarget, m1: r1.marks, m2: r2.marks });
    const b = agg[x.gapTarget] = agg[x.gapTarget] || { n: 0, first1: 0, first2: 0, rest1: 0, rest2: 0, letters: 0, exact1: 0, exact2: 0 };
    b.n++; b.first1 += r1.first; b.first2 += r2.first; b.rest1 += r1.rest; b.rest2 += r2.rest; b.letters += r1.n; b.exact1 += r1.exact; b.exact2 += r2.exact; o += x.text.length; }
  const sum = {}; for (const [gp, b] of Object.entries(agg)) sum[gp] = { n: b.n, first1: +(b.first1 / b.n).toFixed(3), first2: +(b.first2 / b.n).toFixed(3), rest1: +(b.rest1 / b.letters).toFixed(3), rest2: +(b.rest2 / b.letters).toFixed(3), exact1: b.exact1, exact2: b.exact2 };
  return { byGap: sum, per }; };
// alignment check on ordinary letters: overall argmax accuracy of each stream at shift 0 must beat shift +-1
const accAt = (txt, gs, sh) => { let h = 0, n = 0; for (let i = 2; i < txt.length - 2; i++) { const v = gs[i + sh]; if (v == null) continue; n++; h += A[v] === txt[i]; } return +(h / n).toFixed(4); };
const shOn = [-1, 0, 1].map(s => accAt(onTxt, onG, s)), shOff = [-1, 0, 1].map(s => accAt(offTxt, offG, s));
const bestSh = v => [-1, 0, 1][v.indexOf(Math.max(...v))];
const sOn = bestSh(shOn), sOff = bestSh(shOff);
const gu = (net.granUtilityStats && net.granUtilityStats()) || {};
const out = { k, tag, variant, nSyms: NS, heldAcc: st0.heldAcc, names: names, shiftAcc: { on: shOn, off: shOff, used: [sOn, sOff] }, textAccOn: shOn[sOn + 1], textAccOff: shOff[sOff + 1],
  on: score(setOn, onTxt, onG, sOn), off: score(setOff, offTxt, offG, sOff), lagRec: gu.lagRec || 0, lagFired: gu.lagFired || 0, sec: (Date.now() - t0) / 1000 };
fs.writeFileSync(`sw/out/np_${tag}_${k}.json`, JSON.stringify(out));
console.log(JSON.stringify({ k, tag, heldAcc: out.heldAcc, shift: out.shiftAcc, on: out.on.byGap, off: out.off.byGap, sec: out.sec }));
