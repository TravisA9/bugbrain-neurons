'use strict';
/* Grow a small feature population toward a subgraph of the frozen Toy export.
 *
 * Target: the 32 highest-count cells whose taps are only input letters. In this
 * export those are all delay-0 + delay-1 pairs (the common bigrams).
 *
 * Growth, one lifetime on the first 70% of sample-dialogue.txt:
 *   synaptogenesis — a cell is born for every letter pair that co-occurs at
 *   least twice (the two taps are the letters that were active together);
 *   trophic competition — keep the 32 with the highest predictive score
 *   (how often the next character matched their majority vote, weighted by use);
 *   one adaptation round — substitute one letter when that strictly raises the score.
 * The readout counts are taken only on that prefix. The last 30% is held out.
 *
 * Distance: anatomy is the overlap of (letter, delay) pairs with the export's
 * 32 motifs. Behavior is next-letter agreement on the held-out slice, read with
 * the same FeatureTimeNet readout as the toy port.
 *
 *   node experiments/toy-port/triangulate.js [model.snn.json] [sample.txt]
 * Deterministic. Does not touch js/ or run/.
 */
const fs = require('fs'), path = require('path');
const { FeatureTimeNet, loadFeatureTime } = require('./toy_net');

const K = 32;

function hexId(prefix, ch) {
  let hex = '';
  for (let i = 0; i < ch.length; i++) hex += (i ? '-' : '') + ch.charCodeAt(i).toString(16);
  return prefix + hex;
}
function sigOf(c0, c1) { return hexId('', c0) + '@0|' + hexId('', c1) + '@1'; }
function show(ch) { return JSON.stringify(ch); }

function voteFrom(counts) {
  let total = 0;
  const rows = [];
  for (const [ch, n] of counts) { total += n; if (n >= 2) rows.push([ch, n]); }
  rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (!rows.length || !total) return { char: null, hits: 0, total, rows };
  return { char: rows[0][0], hits: rows[0][1], total, rows };
}

// Fires of a delay-0/1 bigram on text[0, end). Labels (the next char) only count while t+1 < end.
function observe(text, end, c0, c1) {
  const counts = new Map();
  let fires = 0;
  for (let t = 1; t + 1 < end; t++) {
    if (text[t] !== c0 || text[t - 1] !== c1) continue;
    fires++;
    counts.set(text[t + 1], (counts.get(text[t + 1]) || 0) + 1);
  }
  const vote = voteFrom(counts);
  const score = vote.total ? (vote.hits + 0.5) / (vote.total + 1) * Math.log(1 + fires) : 0;
  return { c0, c1, fires, counts, vote: vote.char, hits: vote.hits, total: vote.total, rows: vote.rows, score, sig: sigOf(c0, c1) };
}

function collectBigrams(text, end) {
  const seen = new Map();
  for (let t = 1; t < end; t++) {
    if (t + 1 >= end) continue;
    const key = text[t] + '\0' + text[t - 1];
    let row = seen.get(key);
    if (!row) seen.set(key, row = { c0: text[t], c1: text[t - 1], fires: 0, counts: new Map() });
    row.fires++;
    const nxt = text[t + 1];
    row.counts.set(nxt, (row.counts.get(nxt) || 0) + 1);
  }
  const out = [];
  for (const row of seen.values()) {
    const vote = voteFrom(row.counts);
    const score = vote.total ? (vote.hits + 0.5) / (vote.total + 1) * Math.log(1 + row.fires) : 0;
    out.push({ c0: row.c0, c1: row.c1, fires: row.fires, counts: row.counts, vote: vote.char, hits: vote.hits, total: vote.total, rows: vote.rows, score, sig: sigOf(row.c0, row.c1) });
  }
  return out;
}

function byScore(a, b) { return b.score - a.score || b.fires - a.fires || (a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0); }

function adapt(chosen, alphabet, text, end) {
  const taken = new Set(chosen.map(c => c.sig));
  let accepted = 0;
  const next = chosen.map(c => Object.assign({}, c));
  for (let i = 0; i < next.length; i++) {
    let best = next[i];
    for (const slot of [0, 1]) {
      for (const ch of alphabet) {
        const c0 = slot === 0 ? ch : best.c0;
        const c1 = slot === 1 ? ch : best.c1;
        if (c0 === best.c0 && c1 === best.c1) continue;
        const sig = sigOf(c0, c1);
        if (taken.has(sig) && sig !== best.sig) continue;
        const obs = observe(text, end, c0, c1);
        if (obs.score > best.score) best = obs;
      }
    }
    if (best.sig !== next[i].sig) {
      taken.delete(next[i].sig);
      taken.add(best.sig);
      next[i] = best;
      accepted++;
    }
  }
  return { cells: next, accepted };
}

function targetMotifs(doc) {
  const inputs = new Map(doc.neurons.filter(n => n.type === 'input').map(n => [n.id, n.char]));
  const byPost = new Map();
  for (const s of doc.synapses) {
    if (!byPost.has(s.post)) byPost.set(s.post, []);
    byPost.get(s.post).push(s);
  }
  const votes = new Map();
  for (const r of doc.readout) {
    if (!votes.has(r.pre)) votes.set(r.pre, []);
    votes.get(r.pre).push(r);
  }
  const motifs = [];
  for (const c of doc.neurons) {
    if (c.type !== 'cell') continue;
    const taps = byPost.get(c.id) || [];
    if (taps.length !== 2 || !taps.every(t => inputs.has(t.pre))) continue;
    const byDelay = new Map(taps.map(t => [t.delay, inputs.get(t.pre)]));
    if (!byDelay.has(0) || !byDelay.has(1)) continue;
    const counts = new Map();
    for (const r of votes.get(c.id) || []) counts.set(r.char, (counts.get(r.char) || 0) + r.votes);
    const rows = [...counts.entries()];
    const vote = voteFrom(counts);
    motifs.push({
      id: c.id, count: c.count, c0: byDelay.get(0), c1: byDelay.get(1),
      fires: c.count, counts, vote: vote.char, hits: vote.hits, total: vote.total,
      rows, score: 0, sig: sigOf(byDelay.get(0), byDelay.get(1)),
    });
  }
  motifs.sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
  return motifs.slice(0, K);
}

function miniDoc(cells) {
  const chars = new Set();
  for (const c of cells) { chars.add(c.c0); chars.add(c.c1); for (const [ch] of c.rows) chars.add(ch); }
  const neurons = [];
  for (const ch of chars) neurons.push({ id: hexId('in:', ch), type: 'input', char: ch });
  for (const ch of chars) neurons.push({ id: hexId('out:', ch), type: 'output', char: ch });
  const ordered = cells.slice().sort((a, b) => b.fires - a.fires || (a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0));
  const synapses = [], readout = [];
  ordered.forEach((c, i) => {
    const id = 'g' + i;
    neurons.push({ id, type: 'cell', span: 2, count: c.fires, abstract: false, nTaps: 2, threshold: 2, role: 'motif' });
    synapses.push({ pre: hexId('in:', c.c0), post: id, delay: 0, weight: 0.5 });
    synapses.push({ pre: hexId('in:', c.c1), post: id, delay: 1, weight: 0.5 });
    for (const [ch, n] of c.rows) readout.push({ pre: id, post: hexId('out:', ch), char: ch, votes: n, weight: 0 });
  });
  return {
    neuronModel: { softFire: 0.75 },
    ftConfig: { softOutrank: true, outrankConf: 0.8 },
    neurons, synapses, readout,
  };
}

function predict(cells, text) {
  if (!cells.length) return new Array(text.length).fill(null);
  return new FeatureTimeNet(miniDoc(cells)).predict(text);
}

function nextPct(preds, text, from, to) {
  let hit = 0, n = 0;
  const end = Math.min(to, text.length - 1);
  for (let i = from; i < end; i++) { n++; if (preds[i] === text[i + 1]) hit++; }
  return { hit, n, pct: n ? +(100 * hit / n).toFixed(2) : 0 };
}
function agreePct(a, b, from, to) {
  let hit = 0, n = 0;
  for (let i = from; i < to && i < a.length; i++) { n++; if (a[i] === b[i]) hit++; }
  return { hit, n, pct: n ? +(100 * hit / n).toFixed(2) : 0 };
}
function pairText(sig) {
  const [a, b] = sig.split('|');
  const ch = part => JSON.stringify(String.fromCharCode(parseInt(part.split('@')[0], 16)));
  return ch(b) + ch(a);
}
function overlap(grown, target) {
  const g = new Set(grown.map(c => c.sig));
  const t = [...new Set(target.map(c => c.sig))];
  const hit = [], miss = [];
  for (const s of t) (g.has(s) ? hit : miss).push(pairText(s));
  const union = g.size + t.length - hit.length;
  return {
    recallPct: t.length ? +(100 * hit.length / t.length).toFixed(2) : 0,
    precisionPct: g.size ? +(100 * hit.length / g.size).toFixed(2) : 0,
    jaccardPct: union ? +(100 * hit.length / union).toFixed(2) : 0,
    shared: hit.length,
    recovered: hit.slice(0, 8),
    missed: miss.slice(0, 8),
  };
}
function brief(cells) {
  return cells.slice(0, 8).map(c => show(c.c1) + show(c.c0) + ' n=' + c.fires + (c.vote ? '→' + show(c.vote) : ''));
}

function main() {
  const modelPath = process.argv[2] || path.join(__dirname, 'baseline-frozen.snn.json');
  const samplePath = process.argv[3] || path.join(__dirname, 'sample-dialogue.txt');
  const text = fs.readFileSync(samplePath, 'utf8');
  const split = Math.floor(text.length * 0.7);
  const doc = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const target = targetMotifs(doc);
  if (target.length < K) throw new Error('only ' + target.length + ' letter-pair motifs');

  const pool = collectBigrams(text, split).filter(c => c.total >= 2);
  pool.sort(byScore);
  const grown = pool.slice(0, K);
  const byFreq = pool.slice().sort((a, b) => b.fires - a.fires || (a.sig < b.sig ? -1 : 1)).slice(0, K);
  const alphabet = [];
  const seenCh = new Set();
  for (let i = 0; i < split; i++) if (!seenCh.has(text[i])) { seenCh.add(text[i]); alphabet.push(text[i]); }
  alphabet.sort();
  const adapted = adapt(grown, alphabet, text, split);

  const t0 = Date.now();
  const fullPred = loadFeatureTime(modelPath).predict(text);
  const exportPred = predict(target, text);
  const grownPred = predict(grown, text);
  const adaptPred = predict(adapted.cells, text);
  const freqPred = predict(byFreq, text);
  // The fast majority-of-one-span rule should match FeatureTimeNet. Check the grown net.
  let fastMiss = 0;
  {
    const ordered = grown.slice().sort((a, b) => b.fires - a.fires || (a.sig < b.sig ? -1 : 1));
    for (let t = split; t < text.length - 1; t++) {
      let best = null;
      for (const c of ordered) {
        if (t < 1 || text[t] !== c.c0 || text[t - 1] !== c.c1 || !c.vote) continue;
        if (!best || c.fires > best.fires) best = c;
      }
      if ((best ? best.vote : null) !== grownPred[t]) fastMiss++;
    }
  }

  const testFrom = split, testTo = text.length;
  const anatomyGrown = overlap(grown, target);
  const anatomyAdapt = overlap(adapted.cells, target);
  const anatomyFreq = overlap(byFreq, target);
  const report = {
    sample: path.basename(samplePath),
    chars: text.length,
    split: { grow: split, test: text.length - split },
    target: {
      k: target.length,
      rule: '32 highest-count cells with only letter taps; all are a delay-0 letter plus a delay-1 letter',
      examples: brief(target),
    },
    births: pool.length,
    fullNet: { testNextPct: nextPct(fullPred, text, testFrom, testTo).pct },
    exportSubgraph: {
      note: 'frozen votes from the original corpus, not refit on this sample',
      testNextPct: nextPct(exportPred, text, testFrom, testTo).pct,
      agreeFullPct: agreePct(exportPred, fullPred, testFrom, testTo).pct,
    },
    frequencyControl: {
      note: 'top 32 bigrams by count on the growth prefix, votes fit there',
      ...anatomyFreq,
      testNextPct: nextPct(freqPred, text, testFrom, testTo).pct,
      agreeExportPct: agreePct(freqPred, exportPred, testFrom, testTo).pct,
      agreeFullPct: agreePct(freqPred, fullPred, testFrom, testTo).pct,
      examples: brief(byFreq),
    },
    grown: {
      note: 'born from co-active letters, kept by predictive score, votes fit on the growth prefix',
      ...anatomyGrown,
      testNextPct: nextPct(grownPred, text, testFrom, testTo).pct,
      agreeExportPct: agreePct(grownPred, exportPred, testFrom, testTo).pct,
      agreeFullPct: agreePct(grownPred, fullPred, testFrom, testTo).pct,
      examples: brief(grown),
    },
    adapted: {
      note: 'one round of single-letter substitution accepted only when the growth-prefix score rises',
      substitutions: adapted.accepted,
      ...anatomyAdapt,
      testNextPct: nextPct(adaptPred, text, testFrom, testTo).pct,
      agreeExportPct: agreePct(adaptPred, exportPred, testFrom, testTo).pct,
      agreeFullPct: agreePct(adaptPred, fullPred, testFrom, testTo).pct,
      examples: brief(adapted.cells),
    },
    readoutCheckMisses: fastMiss,
    secs: +((Date.now() - t0) / 1000).toFixed(2),
  };
  const outFile = path.join(__dirname, 'triangulate-report.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  const ok = target.length === K && fastMiss === 0 && pool.length > K;
  console.log(ok ? 'TRIANGULATION DONE' : 'TRIANGULATION FAIL');
  process.exitCode = ok ? 0 : 1;
}

if (require.main === module) main();
