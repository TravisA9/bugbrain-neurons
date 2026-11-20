// R140 probe headroom: online argmax count models on the delaycopy stream (same task seeds as sw/lagprobe140.js), probe = letter after the cue, 2nd half
const L = require('../lib.js'), SA = L.SA;
const [nS, ...ks] = process.argv.slice(2);
for (const k of ks.map(Number)) {
  const task = { name: 'r140', env: 'seq', params: { source: 'delaycopy', K: 12, dMin: 4, dMax: 30, nSyms: +nS, clock2: true, clock3: true, readIn: 0.01 } };
  const env = L.setupTask(task), p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), t = env.def.create(p.arenaSeeds[k], env.P, env.spec), seq = t.seq, dc = t.rule.delaycopy, h0 = (seq.length - 1) >> 1;
  const res = {};
  const model = (name, keyOf) => { const tab = new Map(); let c = 0, n = 0;
    for (let i = 0; i + 1 < seq.length; i++) { const ky = keyOf(i); let m = tab.get(ky), pr = -1; if (m) { let bv = -1; for (const [y, v] of m) if (v > bv) { bv = v; pr = y; } }
      if (i >= h0 && seq[i] === dc.cue) { n++; if (pr === seq[i + 1]) c++; } if (!m) tab.set(ky, m = new Map()); m.set(seq[i + 1], (m.get(seq[i + 1]) || 0) + 1); }
    res[name] = +(c / n).toFixed(3); };
  for (const o of [1, 2, 4, 6, 8]) { const tabs = Array.from({ length: o }, () => new Map()); let c = 0, n = 0;   // order-o with backoff to shorter contexts
    for (let i = 0; i + 1 < seq.length; i++) { let pr = -1; for (let q = o; q >= 1 && pr < 0; q--) { const m = tabs[q - 1].get(seq.slice(Math.max(0, i - q + 1), i + 1).join(',')); if (m) { let bv = -1; for (const [y, v] of m) if (v > bv) { bv = v; pr = y; } } }
      if (i >= h0 && seq[i] === dc.cue) { n++; if (pr === seq[i + 1]) c++; }
      for (let q = 1; q <= o; q++) { const ky = seq.slice(Math.max(0, i - q + 1), i + 1).join(','), T = tabs[q - 1]; let m = T.get(ky); if (!m) T.set(ky, m = new Map()); m.set(seq[i + 1], (m.get(seq[i + 1]) || 0) + 1); } }
    res['o' + o] = +(c / n).toFixed(3); }
  for (const D of [8, 16, 32]) model('copyD' + D, i => { let j = i - 1; while (j >= 0 && j > i - D && seq[j] >= dc.pay) j--; return j >= 0 && j > i - D && i - j >= 4 ? seq[i] + '|' + seq[j] : seq[i] + '|none'; });
  console.log(JSON.stringify({ k, nSyms: +nS, probeN: 'letter after cue, 2nd half', ...res }));
}
