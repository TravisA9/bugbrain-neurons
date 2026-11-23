// node sw/standing_gen.js <k> <variant> <tag> [nSyms]  (Nov 23 "where we stand" samples; same growth/seed path as sw/bookdiag.js)
// 1) one book life (nSyms letters of TRAIN, last 2000 from HELD) -> held-out stats exactly as bookdiag (heldAcc etc.)
// 2) still in the life (LEARNING ON): long-memory prompts with names set B, teacher-forced; per-letter argmax guesses recorded
// 3) after the life (LEARNING FROZEN, as run/gen.js): long-memory prompts with names set A (teacher-forced guesses), then for each scenario
//    the prompt is fed letter by letter (guesses recorded) and the brain free-runs (its sampled letter becomes the next input), T=0.5 and T=1.
// Writes standing/gen_<tag>_<k>.json plus the exact train/held text of the life (for baselines on the SAME letters).
const L = require('../run/lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag, nS0] = process.argv.slice(2), k = +k0, NS = +(nS0 || 100000);
const B = SA.book, A = B.ALPHA, IDX = new Map(A.map((c, i) => [c, i]));
const clean = t => t.toLowerCase().replace(/['’‘]/g, '').replace(/[.!?;:]+/g, '.').replace(/qu/g, 'kw').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/j/g, 'g')
  .replace(/[^a-z.]+/g, ' ').replace(/ *\. */g, '. ').replace(/(\. )+/g, '. ').replace(/ +/g, ' ');
// long-memory templates: N appears twice; the gap between the occurrences grows
const TPL = [['d_short', 'the king sent for N and N came at once. '],
  ['d_30', 'a little girl named N lived in a house by the wood. N had a red cap. '],
  ['d_60', 'once there was a dog called N who lived on a farm with an old man and his wife. every day N ran to the river. '],
  ['d_120', 'in a village by the sea lived a fisherman named N. he had a small boat and a net and each morning he went out on the water to catch fish for his children and his wife. one day N saw a great storm. ']];
const NAMES_A = ['sorinda', 'brumwick', 'pelmatho'], NAMES_B = ['garvinel', 'tobimar', 'kelvoran'];
const lm = names => { const out = []; for (const [id, t] of TPL) for (const nm of names) { const s = clean(t.replace(/N/g, nm)); const i1 = s.indexOf(nm), i2 = s.indexOf(nm, i1 + 1);
  out.push({ id, name: nm, text: s, first: [i1, i1 + nm.length], second: [i2, i2 + nm.length], gap: i2 - (i1 + nm.length) }); } return out; };
const F = SA.text.FABLES;
const SCEN = [
  { id: 'book_heldout_1', src: 'HELD', off: 20000 }, { id: 'book_heldout_2', src: 'HELD', off: 90000 }, { id: 'book_heldout_3', src: 'HELD', off: 150000 },
  { id: 'fable_other_source', text: F.slice(0, F.indexOf('. ', 300) + 2) },
  { id: 'modern_prose', text: clean('The city council voted on Tuesday to build a new bridge across the river. The mayor said that the work would begin in the spring and that ') },
  { id: 'qa_oz', text: clean('Question: who went to the land of Oz? Answer: ') },
  { id: 'qa_cat', text: clean('Question: what does a cat like to eat? Answer: a cat likes to eat ') },
  { id: 'qa_dialog', text: clean('The little girl asked the old woman, "Where is my mother?" and the old woman said, "') },
  { id: 'story_open', text: clean('Once upon a time there was a ') }];
const FREE = 300, TEMPS = [0.5, 1];
// life
const lifeLM = lm(NAMES_B), lifeTxt = lifeLM.map(x => x.text).join('');
const nSyms = NS + lifeTxt.length;
const tj = { env: 'seq', params: { source: 'book', nSyms, evalSyms: 2000 + lifeTxt.length, genSyms: 1 } }, task = Object.assign({ name: 'r42' }, tj);
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
// build the frozen-phase plan
const plan = [], segs = []; const frozenLM = lm(NAMES_A);
const push = (s, info) => { const st = plan.length; for (const c of s) plan.push({ f: IDX.get(c) }); segs.push(Object.assign({ kind: 'force', start: st, len: s.length }, info)); };
for (const x of frozenLM) push(x.text, { lm: x });
for (const sc of SCEN) { let txt = sc.text, truth = null;
  if (sc.src === 'HELD') { let o = B.HELD.indexOf('. ', sc.off) + 2; txt = B.HELD.slice(o, o + 200); truth = B.HELD.slice(o + 200, o + 200 + FREE); sc.heldOff = o; }
  sc.prompt = txt; sc.truth = truth;
  for (const T of TEMPS) { push(txt, { scen: sc.id, T }); const st = plan.length; for (let i = 0; i < FREE; i++) plan.push({ T }); segs.push({ kind: 'free', scen: sc.id, T, start: st, len: FREE }); } }
tj.params.genSyms = plan.length;
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], brain, env), net = a.net, T = a.task;
if (T.genSyms !== plan.length) throw new Error('genSyms ' + T.genSyms + ' vs ' + plan.length);
for (let i = 0; i < lifeTxt.length; i++) T.seq[NS + 1 + i] = IDX.get(lifeTxt[i]);   // learning-on prompts follow the 2000 held letters
const lifeGuess = [], genLog = [];
const argmax = c => { let b = 0; for (let j = 1; j < c.length; j++) if (c[j] > c[b]) b = j; return b; };
const orig = T.act.bind(T); T.P.genTemp = 0.5;
T.act = function (out, ag) { const p0 = this.pos, r = orig(out, ag);
  if (this.pos > p0) { if (p0 < nSyms) { if (p0 >= NS) { const e = this.recent[this.recent.length - 1]; lifeGuess.push(e[1]); } }
    else { const i = p0 - nSyms, st = plan[i], am = argmax(this.lastCounts);
      if (st.f != null) { genLog.push(am); this.seq[this.pos] = st.f; } else genLog.push(this.seq[this.pos]);
      const nx = plan[i + 1]; if (nx && nx.T) this.P.genTemp = nx.T; } }
  return r; };
const t0 = Date.now(); let stats0 = null;
while (!a.done && T.pos < NS) a.tick(); stats0 = T.stats();
const trainText = T.seq.slice(0, NS - 2000 + 1).map(i => A[i]).join(''), heldCtx = T.seq.slice(0, NS + 1).map(i => A[i]).join('');
while (!a.done && T.pos < nSyms) a.tick();
const was = SA.params.plasticity; SA.params.plasticity = false; while (!a.done) a.tick(); SA.params.plasticity = was;
// score
const lmScore = (items, guesses, base) => items.map((x, j) => { const off = base[j]; const g = i => A[guesses[off + i - 1]];   // guess for text[i] was made after seeing text[i-1]
  const sc = ([s, e]) => { let h = 0, n = 0, str = ''; for (let i = s + 1; i < e; i++) { n++; const ok = g(i) === x.text[i]; h += ok; str += ok ? x.text[i].toUpperCase() : '_'; } return { hits: h, n, marks: x.text[s] + str }; };
  return { id: x.id, name: x.name, gap: x.gap, first: sc(x.first), second: sc(x.second) }; });
let o = 0; const baseLife = lifeLM.map(x => { const b = o; o += x.text.length; return b; });
// in life the guess for lifeTxt[0] came from the held text; guesses array index i = guess for lifeTxt[i]; shift so g(i) uses guesses[off+i]
const lifeRes = lmScore(lifeLM, [null].concat(lifeGuess), baseLife.map(b => b + 1).map(b => b - 0));
const frozenSegs = segs.filter(s => s.lm), frozenRes = lmScore(frozenLM, [null].concat(genLog), frozenSegs.map(s => s.start + 1));
const scen = SCEN.map(sc => { const r = { id: sc.id, prompt: sc.prompt, truth: sc.truth, heldOff: sc.heldOff };
  for (const s of segs.filter(s => s.scen === sc.id)) { const g = genLog.slice(s.start, s.start + s.len).map(i => A[i]).join('');
    if (s.kind === 'free') r['sample_T' + s.T] = g;
    else if (s.T === TEMPS[0]) { let h = 0, m = ''; for (let i = 1; i < s.len; i++) { const ok = g[i] === sc.prompt[i]; h += ok; m += ok ? sc.prompt[i].toUpperCase() : '_'; } r.promptGuessAcc = +(h / (s.len - 1)).toFixed(4); r.promptGuesses = g; r.promptMarks = sc.prompt[0] + m; } }
  return r; });
const out = { k, tag, variant, nSyms: NS, heldStats: stats0, N: net.N, nHid: net.g.nHid, synapses: net.posts.length, sec: (Date.now() - t0) / 1000,
  heldStart: B.HELD.indexOf(heldCtx.slice(NS - 2000 + 1)), longMemoryLearningOn: lifeRes, longMemoryFrozen: frozenRes, scenarios: scen };
fs.mkdirSync('standing', { recursive: true });
fs.writeFileSync(`standing/gen_${tag}_${k}.json`, JSON.stringify(out, null, 1));
fs.writeFileSync(`standing/life_${tag}_${k}.txt`, heldCtx);   // seq[0..NS]: TRAIN part = first NS-2000+1 letters, then the 2000 held letters
console.log(JSON.stringify({ heldAcc: stats0.heldAcc, heldBitsSoft: stats0.heldBitsSoft, sec: out.sec }));
