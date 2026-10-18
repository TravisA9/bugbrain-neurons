// R62: where is the prediction lost between the taught prediction cells (cortex tag 1) and the decoder?
// node run/r62_out.js <prefix>: held accuracy of (a) brain, (b) argmax whole-slot output counts, (c) argmax read-window counts with random tie-break,
// (d) a column vote of the prediction cells (each tag-1 cell labelled by the next symbol it fires with most often in train; argmax of label counts)
const fs = require('fs'), [pre] = process.argv.slice(2), M = JSON.parse(fs.readFileSync(pre + '.json')), B = fs.readFileSync(pre + '.bin');
const K = M.K, seq = M.seq, S = [], OC = []; let o = 0;
while (o < B.length) { const na = B.readUInt16LE(o); o += 2; const c = new Uint16Array(na); for (let j = 0; j < na; j++) { c[j] = B.readUInt16LE(o); o += 3; } OC.push(Array.from(B.subarray(o, o + 24))); o += 24; S.push(c); }
const T = S.length, hf = M.heldFrom, held = [], tr = []; for (let t = 2; t < T - 1; t++) (t >= hf ? held : tr).push(t);
const acc = (xs, f) => +(xs.filter(f).length / xs.length).toFixed(3), am = c => { let b = 0; for (let k = 1; k < K; k++) if (c[k] > c[b]) b = k; return b; };
let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, amR = c => { const m = Math.max(...c); const x = c.map((v, k) => v === m ? k : -1).filter(k => k >= 0); return x[Math.floor(rnd() * x.length)]; };
const tag = i => M.cellType[i] - 16, isP = i => M.region[i] === 0 && !(M.mix && M.mix[i]) && tag(i) === 1;
const co = new Map(); for (const t of tr.slice(-20000)) for (const i of S[t]) if (isP(i)) { if (!co.has(i)) co.set(i, new Float64Array(K)); co.get(i)[seq[t + 1]]++; }
const lab = new Map(); for (const [i, r] of co) lab.set(i, am(r)); const labels = new Float64Array(K); for (const v of lab.values()) labels[v]++;
const vote = (t, norm) => { const c = new Float64Array(K); for (const i of S[t]) if (lab.has(i)) c[lab.get(i)] += norm ? 1 / labels[lab.get(i)] : 1; return am(c); };
const R = { brainHeld: acc(held, t => M.hits[t]), wholeSlotArgmax: acc(held, t => am(OC[t]) === seq[t + 1]), wholeSlotOutSpikes: +(held.reduce((a, t) => a + OC[t].reduce((x, y) => x + y, 0), 0) / held.length).toFixed(2) };
if (M.rc) R.readWinRandomTie = acc(held, t => amR(M.rc[t]) === seq[t + 1]);
R.predCellVote = acc(held, t => vote(t, false) === seq[t + 1]); R.predCellVoteNorm = acc(held, t => vote(t, true) === seq[t + 1]);
R.predCellsLabelled = lab.size; R.labelsTop = Array.from(labels).map((v, k) => [' .abcdefghiklmnoprstuvwy'[k], v]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x.join(':')).join(' ');
console.log(JSON.stringify(R));
