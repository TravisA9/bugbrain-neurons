// perf/act67.js (R67): activity per region (fraction of cells spiking / receiving a spike per substep, sampled every 5th tick): bun perf/act67.js <repo> '<task json>' <k> [variant]  (BB_OUT appends)
const [repo, tj, k = 0, variant = 'base'] = process.argv.slice(2);
const L = require(require("path").resolve(repo) + '/run/lib.js'), SA = L.SA, task = Object.assign({ name: 'act' }, JSON.parse(tj));
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
if (variant !== 'base') for (const kv of variant.split(',')) { const [k0, v] = kv.split('='), [kk, sel] = k0.split('@'), [s, f] = kk.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: 64, valArenas: 64 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[+k], spec: env.spec });
const a = new SA.Agent(g, p.arenaSeeds[+k], brain, env); if (L.dropDense) L.dropDense(brain); const n = a.net, N = n.N;
const reg = brain.region, names = (brain.regions || [{ name: 'all' }]).map(r => r.name), R = names.length;
const rid = new Int32Array(N); for (let i = 0; i < N; i++) rid[i] = i < brain.N ? (reg ? (reg[i] === 255 ? R : reg[i]) : (i < brain.nIn ? R : 0)) : R; // R = inputs
const size = new Float64Array(R + 1); for (let i = 0; i < N; i++) size[rid[i]]++;
const spk = new Float64Array(R + 1), rcv = new Float64Array(R + 1), mk = new Uint8Array(N); let samples = 0, sub = 0, tick = 0;
const st0 = n.step.bind(n);
n.step = function () { const r = st0(); sub++;
  if (tick % 5 === 0) { samples++; mk.fill(0); const sp = n.spiked;
    for (let i = 0; i < N; i++) if (sp[i]) { spk[rid[i]]++; for (let q = n.start[i]; q < n.start[i + 1]; q++) mk[n.posts[q]] = 1; }
    for (let i = 0; i < N; i++) if (mk[i] || n.ext[i] !== 0) rcv[rid[i]]++; }
  return r; };
while (!a.done) { a.tick(); tick++; }
const out = { task: tj, k: +k, variant, N, fit: a.fitness, spikesPerSub: n.spikeCount / sub, regions: {} };
for (let r = 0; r <= R; r++) out.regions[r < R ? names[r] : 'inputs'] = { n: size[r], spike: +(spk[r] / samples / size[r]).toFixed(4), recv: +(rcv[r] / samples / size[r]).toFixed(4) };
let hs = 0, hr = 0, hn = 0; for (let r = 0; r < R; r++) { hs += spk[r]; hr += rcv[r]; hn += size[r]; } out.hidden = { spike: +(hs / samples / hn).toFixed(4), recv: +(hr / samples / hn).toFixed(4) };
if (process.env.BB_OUT) require('fs').appendFileSync(process.env.BB_OUT, JSON.stringify(out) + '\n'); console.log(JSON.stringify(out));
