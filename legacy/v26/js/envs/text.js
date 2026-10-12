/* =====================================================================
 * envs/text.js — 'Text: next-character prediction' (skeleton / stub).
 * A tiny built-in corpus is streamed one character at a time (one-hot input,
 * charTicks ticks per character). While a character is shown, the output group
 * (one output cell per character) is read by winner-take-all = the predicted
 * NEXT character. Metrics: accuracy, bits per character (softmax over output
 * spike counts, smoothed), compared with the unigram baseline.
 * It runs end to end; it is not expected to perform well yet.
 * ===================================================================== */
(function () {
'use strict';
const CORPUS = ('the cat sat on the mat. the dog sat on the log. the cat saw the dog. ' +
  'a bird sang in the tree. the dog ran to the tree. the cat ran to the mat. ' +
  'the sun is hot. the sea is blue. the bird is in the tree. the dog is on the log. ').repeat(1);
const ALPHA = Array.from(new Set(CORPUS.split(''))).sort();
// v19 (round 20): a larger corpus for longer lifetimes: six Aesop fables retold in simple English (after the public-domain
// translations), lowercase, space and full stop only (24 symbols: no j, q, x, z, no commas). Used by the seq env (source 'fables').
const FABLES = (
  'the cat and the crow. a crow sat on a branch of a tree with a piece of cheese in her beak. a cat saw her and ' +
  'wanted the cheese. he came to the foot of the tree and said good day mistress crow. how well you look today. ' +
  'how bright your eyes are. i am sure your voice is as sweet as your feathers are fine. will you sing one song ' +
  'for me. the crow was glad to hear this. she lifted her head and began to sing but the moment she opened her ' +
  'beak the cheese fell to the ground and the cat ate it up. that is all i wanted said the cat. in return for the ' +
  'cheese i will give you a piece of good advice. do not trust those who praise you. the ant and the grasshopper. ' +
  'in a field one summer day a grasshopper was hopping about singing to its heart. an ant passed by bearing an ' +
  'ear of corn to the nest. why not come and sing with me said the grasshopper instead of working so hard. i am ' +
  'helping to lay up food for the winter said the ant and i think you should do the same. why bother about winter ' +
  'said the grasshopper. we have plenty of food at present. but the ant went on its way and carried on its work. ' +
  'when the winter came the grasshopper had no food and found itself dying of hunger while it saw the ants eating ' +
  'corn and grain from the stores they had collected in the summer. then the grasshopper knew it is best to ' +
  'prepare for the days of need. the dog and the shadow. a dog was carrying a piece of meat in his mouth to eat ' +
  'it in peace at home. on his way he had to cross a plank lying across a running brook. as he crossed he looked ' +
  'down and saw his own shadow in the water beneath. thinking it was another dog with another piece of meat he ' +
  'made up his mind to have that also. so he made a snap at the shadow in the water but as he opened his mouth ' +
  'the piece of meat fell out dropped into the water and was never seen more. beware lest you lose the substance ' +
  'by grasping at the shadow. the lion and the mouse. once when a lion was asleep a little mouse began running up ' +
  'and down upon him. this soon wakened the lion who placed his huge paw upon her and opened his big mouth to ' +
  'swallow her. pardon o king cried the little mouse. forgive me this time. i shall never forget it. who knows ' +
  'but what i may be able to do you a turn some of these days. the lion was so tickled at the idea of the mouse ' +
  'being able to help him that he lifted up his paw and let her go. some time after the lion was caught in a trap ' +
  'and the hunters who desired to carry him alive to the king tied him to a tree while they went in search of a ' +
  'wagon to carry him on. right then the little mouse happened to pass by and seeing the sad plight in which the ' +
  'lion was went up to him and soon gnawed away the ropes that bound the king of the beasts. was i not right said ' +
  'the little mouse. little friends may prove great friends. the hare and the tortoise. the hare was once ' +
  'boasting of his speed before the other animals. i have never yet been beaten said he when i put forth my full ' +
  'speed. i challenge any one here to race with me. the tortoise said calmly i accept your challenge. that is a ' +
  'fine tale said the hare. i could dance round you all the way. keep your boasting till you have beaten me ' +
  'answered the tortoise. shall we race. so a course was set and a start was made. the hare darted almost out of ' +
  'sight at once but soon stopped and to show his contempt for the tortoise lay down to have a nap. the tortoise ' +
  'plodded on and plodded on and when the hare awoke from his nap he saw the tortoise close to the winning post ' +
  'and could not run up in time to save the race. then the tortoise said slow and steady wins the race. the wind ' +
  'and the sun. the wind and the sun were disputing which was the stronger. suddenly they saw a traveller coming ' +
  'down the road and the sun said i see a way to decide our dispute. whichever of us can cause that traveller to ' +
  'take off his cloak shall be regarded as the stronger. you begin. so the sun retired behind a cloud and the ' +
  'wind began to blow as hard as it could upon the traveller. but the harder he blew the more closely did the ' +
  'traveller wrap his cloak round him till at last the wind had to give up in despair. then the sun came out and ' +
  'shone in all his glory upon the traveller who soon found it too hot to walk with his cloak on. kindness wins ' +
  'where force fails. ').trim() + ' ';
const FABLES_ALPHA = Array.from(new Set(FABLES.split(''))).sort();
const FABLES_BIGRAM = (() => { const A = FABLES_ALPHA, I = new Map(A.map((c, i) => [c, i])), n = A.map(() => new Array(A.length).fill(0)), u = new Array(A.length).fill(0), L = FABLES.length;
  for (let i = 0; i < L; i++) { n[I.get(FABLES[i])][I.get(FABLES[(i + 1) % L])]++; u[I.get(FABLES[i])]++; }
  let hit = 0, bits = 0; for (const row of n) { const t = row.reduce((a, b) => a + b, 0); if (!t) continue; hit += Math.max(...row); for (const x of row) if (x) bits -= x * Math.log2(x / t); }
  return { acc: hit / L, bpc: bits / L, uniAcc: Math.max(...u) / L, uniBpc: -u.reduce((s, x) => s + (x ? x / L * Math.log2(x / L) : 0), 0) }; })();
const A = ALPHA.length, IDX = new Map(ALPHA.map((c, i) => [c, i]));
const UNIGRAM = (() => { const n = new Array(A).fill(0); for (const c of CORPUS) n[IDX.get(c)]++; return n.map(x => x / CORPUS.length); })();
const BASE_ACC = Math.max(...UNIGRAM), BASE_BPC = -UNIGRAM.reduce((s, p) => s + (p ? p * Math.log2(p) : 0), 0);
// BIGRAM baseline (fitted on the corpus itself, so an upper bound for a 1-character memory):
// predict the most frequent follower of the current character; bits = conditional entropy H(next | current)
const BIGRAM = (() => { const n = Array.from({ length: A }, () => new Array(A).fill(0));
  for (let i = 0; i < CORPUS.length; i++) n[IDX.get(CORPUS[i])][IDX.get(CORPUS[(i + 1) % CORPUS.length])]++;
  let hit = 0, bits = 0; for (const row of n) { const t = row.reduce((a, b) => a + b, 0); if (!t) continue; hit += Math.max(...row);
    for (const x of row) if (x) bits -= x * Math.log2(x / t); }
  return { counts: n, acc: hit / CORPUS.length, bpc: bits / CORPUS.length }; })();
const label = c => c === ' ' ? '␣' : c;

function textIO(P) {
  const xs = spread(A, -0.92, 0.92), ox = spread(A, -0.92, 0.92);
  const inputs = ALPHA.map((c, k) => ({ name: 'in_' + label(c), group: 'char', tag: 1, cls: 1, pos: [xs[k], 1], cue: true }));
  inputs.push({ name: 'tonic', group: 'tonic', tag: 6, cls: 3, pos: [0, 0.85], midline: true, tonic: true });
  const outputs = ALPHA.map((c, k) => ({ name: 'out_' + label(c), group: 'char', tag: 4, cls: 5, pos: [ox[k], -1], bias: P.outBias }));
  return { inputs, outputs, classes: ['', 'char', '', 'tonic', '', 'out'], tagNames: ['tag 0', 'char', 'tag 2', 'tag 3', 'output', 'tag 5', 'tonic', 'free'],
           juvenile: { waves: [ALPHA.map((c, k) => k)], waveGain: P.inGain, tonic: [[A, P.tonicCurrent]], kicks: null } };
}
class TextTask {
  constructor(seed, P) {
    this.P = P; const r = mulberry32((seed ^ 0x51ed270b) >>> 0);
    this.start = (r() * CORPUS.length) | 0; this.pos = 0; this.sub = 0; this.t = 0;
    this.counts = new Float64Array(A); this.correct = 0; this.n = 0; this.bits = 0; this.rewardLog = []; this.recent = [];
    this.horizon = P.nChars * P.charTicks;
  }
  ch(k) { return CORPUS[(this.start + k) % CORPUS.length]; }
  get done() { return this.pos >= this.P.nChars; }
  sense(ext) { Enc.oneHot(ext, ALPHA.map((c, k) => k), IDX.get(this.ch(this.pos)), this.P.inGain); ext[A] = this.P.tonicCurrent; }
  act(out) {
    const P = this.P; let ev = null;
    for (let k = 0; k < A; k++) this.counts[k] += out.spikes[k];
    this.sub++; this.t++;
    if (this.sub >= P.charTicks) {                       // end of this character: read the prediction of the next one
      const target = IDX.get(this.ch(this.pos + 1)), k = Dec.wta(this.counts);
      const p = Dec.softmax(this.counts, P.beta), q = (1 - 0.05) * p[target] + 0.05 / A;
      this.bits += -Math.log2(q); this.n++;
      const ok = k === target; if (ok) this.correct++;
      this.recent.push([this.ch(this.pos), k < 0 ? '·' : ALPHA[k], ok]); if (this.recent.length > 48) this.recent.shift();
      this.rewardLog.push([this.t, ok ? 1 : 0]);
      ev = { pos: ok ? 1 : 0, neg: ok ? 0 : P.wrongCost, pain: 0, reward: ok ? 1 : 0 };
      this.counts.fill(0); this.sub = 0; this.pos++;
    }
    return ev;
  }
  get accuracy() { return this.n ? this.correct / this.n : 0; }
  get bpc() { return this.n ? this.bits / this.n : Math.log2(A); }
  score() { return this.accuracy; }
  fitness() { return 10 * this.accuracy - 0.5 * (this.bpc - BASE_BPC); }
  stats() { return { chars: this.n, accuracy: this.accuracy, bpc: this.bpc, baseAcc: BASE_ACC, baseBpc: BASE_BPC, bigramAcc: BIGRAM.acc, bigramBpc: BIGRAM.bpc }; }
  statusLine() { return `char ${this.pos}/${this.P.nChars} · accuracy ${(100 * this.accuracy).toFixed(0)}% (unigram ${(100 * BASE_ACC).toFixed(0)}%, bigram ${(100 * BIGRAM.acc).toFixed(0)}%) · ${this.bpc.toFixed(2)} bits/char (unigram ${BASE_BPC.toFixed(2)}, bigram ${BIGRAM.bpc.toFixed(2)}, uniform ${Math.log2(A).toFixed(2)})`; }
  outputView() { const mx = Math.max(4, ...this.counts); const top = Array.from(this.counts).map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    return top.map(([v, k]) => ({ name: 'out ' + label(ALPHA[k]), v, lo: 0, hi: mx })); }
  render(c, W, H) {
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H); c.fillStyle = '#222'; c.font = '14px system-ui'; c.fillText(this.statusLine(), 16, 24);
    // v16: one column per step, aligned: input | the prediction made while it was shown | the character that came next
    c.font = '12px system-ui'; c.fillStyle = '#555'; c.fillText('one column per step: the input, the prediction made while it was shown, the character that came next (green = right)', 16, 52);
    const ys = [82, 108, 134], x0 = 120, dx = 14, rec = this.recent.slice(-Math.floor((W - x0 - 30) / dx));
    ['input', 'predicted next', 'actual next'].forEach((t, r) => c.fillText(t, 16, ys[r]));
    c.font = '18px ui-monospace, monospace'; c.textAlign = 'center';
    rec.forEach(([inp, pred, ok], i) => { const x = x0 + i * dx + dx / 2, nx = i + 1 < rec.length ? rec[i + 1][0] : this.ch(this.pos);
      c.fillStyle = '#222'; c.fillText(label(inp), x, ys[0]); c.fillStyle = ok ? '#2a9d3a' : '#c43c3c'; c.fillText(label(pred), x, ys[1]); c.fillText(label(nx), x, ys[2]); });
    { const x = x0 + rec.length * dx + dx / 2; c.fillStyle = '#5f8cff'; c.fillText(label(this.ch(this.pos)), x, ys[0]); c.fillStyle = '#aaa'; c.fillText('…', x, ys[1]); c.fillText('?', x, ys[2]); }
    c.textAlign = 'left';
    // output spike counts of the current character
    const bw = (W - 32) / A, mx = Math.max(4, ...this.counts);
    c.font = '11px ui-monospace, monospace';
    for (let k = 0; k < A; k++) { const h = this.counts[k] / mx * 120; c.fillStyle = '#c9c3b6'; c.fillRect(16 + k * bw, 180, bw - 2, 120); c.fillStyle = '#5f8cff'; c.fillRect(16 + k * bw, 300 - h, bw - 2, h);
      c.fillStyle = '#333'; c.fillText(label(ALPHA[k]), 16 + k * bw + bw / 2 - 3, 316); }
    c.font = '12px system-ui'; c.fillStyle = '#555'; c.fillText('output spikes while the current character is shown (winner = prediction)', 16, 340);
    c.fillText(`corpus: ${CORPUS.length} chars, alphabet ${A} symbols; ${this.P.charTicks} ticks per character`, 16, 370);
  }
}
registerEnv({
  id: 'text', name: 'Text: next-character prediction (stub)', view: { width: 700, height: 500 },
  // v17 (round 18): the stub never learns (0% right); the UI no longer offers it: choosing text opens Sequence prediction + Text corpus
  redirect: { env: 'seq', params: { source: 'text' } },
  description: 'Characters of a tiny corpus, one-hot; predict the next character (winner-take-all). Skeleton for text without lifetime learning; for learned next-character prediction use Sequence prediction with Sequence = Text corpus (plan predictKL).',
  defaultPlan: 'v1',
  params: {
    nChars: { value: 60, min: 10, max: 400, step: 10, label: 'Characters per episode' },
    charTicks: { value: 4, min: 1, max: 12, step: 1, label: 'Ticks per character' },
    wrongCost: { value: 0.2, min: 0, max: 1, step: 0.05, label: 'Dopamine dip on a wrong prediction' },
    beta: { value: 0.5, hidden: true }, inGain: { value: 10, hidden: true }, tonicCurrent: { value: 1.5, hidden: true }, outBias: { value: 0, hidden: true },
  },
  io: textIO,
  create(seed, P) { return new TextTask(seed, P); },
});
SpikingArena.text = { CORPUS, ALPHA, FABLES, FABLES_ALPHA, FABLES_BIGRAM, BASE_ACC, BASE_BPC, BIGRAM, TextTask };
})();
