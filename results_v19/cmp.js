// Paired comparison of plan variants on a sequence source, in parallel worker threads (same growth seeds + same streams per variant).
//   [SRC=text|fables|order3:8|cycle:6..] [NS=1000] [NG=8] [S0=20] [BASE=PREDICT2_XG] [J=8]
//   [VARS='{"XG":{},"new":{"key":1}}'] [PP='{"readIn":0.01}'] [ABL='{"new":"silenceF"}'] node results_v19/cmp.js
// Prints per variant: accuracy, first / last quarter, calibrated bits (soft / count), ticks/s, N, growth s; the difference to the
// first variant (paired mean +- s.e.); and the online ideal counters of order 1, 2, 3 (backoff) on the same streams (last quarter).
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
if (isMainThread) {
  const NS = +(process.env.NS || 1000), NG = +(process.env.NG || 8), S0 = +(process.env.S0 || 20), J = +(process.env.J || 8);
  const SRC = process.env.SRC || 'text', BASE = process.env.BASE || 'PREDICT2_XG', VARS = JSON.parse(process.env.VARS || '{"base":{}}'), PP = JSON.parse(process.env.PP || '{}'), ABL = JSON.parse(process.env.ABL || '{}');
  const names = Object.keys(VARS), jobs = []; for (let g = 0; g < NG; g++) for (const v of names) jobs.push({ v, g });
  const out = {}; let next = 0, done = 0; const t0 = Date.now();
  const startW = () => { if (next >= jobs.length) return; const j = jobs[next++];
    const w = new Worker(__filename, { workerData: { NS, S0, SRC, BASE, tune: VARS[j.v], PP, abl: ABL[j.v] || null, g: j.g } });
    w.on('message', m => { (out[j.v] = out[j.v] || [])[j.g] = m; }); w.on('error', e => { console.error(j.v, j.g, e); }); w.on('exit', () => { done++; if (done === jobs.length) report(); else startW(); }); };
  for (let i = 0; i < Math.min(J, jobs.length); i++) startW();
  function report() {
    console.log(`SRC ${SRC}  NS ${NS}  NG ${NG}  S0 ${S0}  BASE ${BASE}  PP ${JSON.stringify(PP)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    const keys = ['accuracy', 'firstQuarter', 'lastQuarter', 'bitsSoft', 'bitsCount', 'tps', 'N', 'grow'];
    const m = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
    for (const v of names) { const a = out[v].filter(x => x); let line = v.padEnd(14) + keys.map(k => `${k} ${m(a, k) < 10 ? m(a, k).toFixed(3) : m(a, k).toFixed(0)}`).join('  ');
      if (v !== names[0]) { const b = out[names[0]], d = a.map((x, i) => x.lastQuarter - b[i].lastQuarter), md = d.reduce((s, x) => s + x, 0) / d.length, sd = Math.sqrt(d.reduce((s, x) => s + (x - md) ** 2, 0) / Math.max(1, d.length - 1));
        const db = a.map((x, i) => x.bitsSoft - b[i].bitsSoft), mb = db.reduce((s, x) => s + x, 0) / db.length;
        line += `  | dLastQ ${md >= 0 ? '+' : ''}${md.toFixed(3)} +- ${(sd / Math.sqrt(d.length)).toFixed(3)}  dBits ${mb >= 0 ? '+' : ''}${mb.toFixed(3)}`; }
      console.log(line); }
    const a = out[names[0]]; console.log(`ideal online counters (backoff), last quarter: order1 ${m(a, 'i1').toFixed(3)}  order2 ${m(a, 'i2').toFixed(3)}  order3 ${m(a, 'i3').toFixed(3)}  order4 ${m(a, 'i4').toFixed(3)}  (all: ${m(a, 'a1').toFixed(3)} ${m(a, 'a2').toFixed(3)} ${m(a, 'a3').toFixed(3)} ${m(a, 'a4').toFixed(3)})`);
  }
} else {
  const { NS, S0, SRC, BASE, tune, PP, abl, g } = workerData;
  const SA = require(path.join(__dirname, '../js/node_load.js'))();
  const [source, K] = SRC.split(':');
  const env = SA.setEnv('seq', Object.assign({ source, K: +(K || 4), nSyms: NS, clock2: true }, PP));
  const d = SA.createPredict2Plan(Object.assign({}, SA[BASE], tune));
  let t = Date.now(); const b = SA.growCell(d, { seed: S0 + g, spec: env.spec }); const grow = (Date.now() - t) / 1000;
  t = Date.now(); const a = new SA.Agent(d, 1000 + S0 + g, b, env);
  if (abl) {   // prototype / ablation hooks: [{ band: 'M2', phases: [0], ext: -40 }, ...] add external current to a band's cells in given slot phases
    const T = Object.assign({}, SA[BASE], tune), Bd = T.bands, nm = T.mix ? ['top', 'M', 'X', 'R', 'M2', 'X2', 'C', 'G', 'P'] : T.gap ? ['top', 'M', 'X', 'R', 'M2', 'X2', 'C', 'gap', 'P'] : ['top', 'M', 'X', 'R', 'M2', 'X2', 'C', 'P'];
    const bandOf = i => { const y = b.pos[i][1]; let k = 0; while (k < Bd.length && y < Bd[k]) k++; return nm[k]; };
    const hooks = (Array.isArray(abl) ? abl : [abl]).map(h => Object.assign({}, h, { cells: (() => { const c = []; for (let i = b.nIn; i < b.nIn + b.nHid; i++) if (bandOf(i) === h.band) c.push(i); return c; })() }));
    const task = a.task, sense = task.sense.bind(task);
    task.sense = (ext, ag) => { sense(ext, ag); for (const h of hooks) if (!h.phases || h.phases.includes(task.phaseT)) for (const i of h.cells) ext[i] += h.ext; };
  }
  while (!a.done) a.tick();
  const st = a.task.stats(), ts = (Date.now() - t) / 1000;
  // ideal online counters with backoff on the same stream
  const seq = a.task.seq, n = a.task.n, Kk = a.task.K, tabs = [null, new Map(), new Map(), new Map(), new Map()], hit = [0, [], [], [], []];
  for (let i = 0; i < n; i++) { const y = seq[i + 1]; const rows = [];
    for (let k = 1; k <= 4; k++) rows[k] = i - k + 1 >= 0 ? tabs[k].get(seq.slice(i - k + 1, i + 1).join(',')) : null;
    for (let k = 1; k <= 4; k++) { let kb = k; while (kb > 1 && !rows[kb]) kb--; const r = rows[kb]; let bi = -1, mx = 0; if (r) for (let j = 0; j < Kk; j++) if (r[j] > mx) { mx = r[j]; bi = j; } hit[k].push(bi === y ? 1 : 0); }
    for (let k = 1; k <= 4; k++) if (i - k + 1 >= 0) { const key = seq.slice(i - k + 1, i + 1).join(','); let r = tabs[k].get(key); if (!r) tabs[k].set(key, r = new Array(Kk).fill(0)); r[y]++; } }
  const q = h => { const s = Math.floor(h.length * 3 / 4); let c = 0; for (let i = s; i < h.length; i++) c += h[i]; return c / (h.length - s); }, al = h => h.reduce((x, y) => x + y, 0) / h.length;
  parentPort.postMessage(Object.assign({}, st, { tps: a.task.t / ts, N: b.N, grow, i1: q(hit[1]), i2: q(hit[2]), i3: q(hit[3]), i4: q(hit[4]), a1: al(hit[1]), a2: al(hit[2]), a3: al(hit[3]), a4: al(hit[4]) }));
}
