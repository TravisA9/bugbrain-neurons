// node sw/bookdiag.js <k> <variant> <tag> [nSyms]: one book growth (as r42 k) with diagnostics -> sw/out/bd_<tag>_<k>.json
// per-region spikes/cell/substep, output-cell excitatory drive split granule vs other, granule pool stats, NLMS step / input power, held acc
const L = require('../lib.js'), SA = L.SA, fs = require('fs');
const [k0, variant, tag, nS] = process.argv.slice(2), k = +k0;
const tj = { env: 'seq', params: { source: 'book', nSyms: +(nS || 10000), evalSyms: 2000 } }, task = Object.assign({ name: 'r42' }, tj);
const gc = L.serialize(L.startGenome('deepURSx3')), cells = gc.kind === 'regions' ? gc.cell.regions.map(r => r.g) : [gc.cell];
for (const kv of variant.split(',')) { const [kk, v] = kv.split('='), [kq, sel] = kk.split('@'), [s, f] = kq.split('.'); if (s === 'P') SA.params[f] = +v; else for (const C of L.selCells(gc, cells, sel)) C[s][f] = +v; }
const p = L.seedPlan({ valGrowths: k + 1, valArenas: k + 1 }, 0, true), g = L.deserialize(gc).g, env = L.setupTask(task);
const brain = SA.growCell(g, { seed: p.growSeeds[k], spec: env.spec }), a = new SA.Agent(g, p.arenaSeeds[k], brain, env), net = a.net, G = net.g, N = net.N;
const o0 = G.nIn + G.nHid, o1 = o0 + G.nOut, reg = G.region, gr = G.gran, RN = 256, regC = new Float64Array(RN), regS = new Float64Array(RN);
for (let i = G.nIn; i < o1; i++) regC[gr && gr[i] ? 254 : reg[i]]++;
// edges into outputs, by presyn
const toOut = Array.from({ length: N }, () => []); for (let e = 0; e < net.posts.length; e++) { const j = net.posts[e]; if (j >= o0 && j < o1) toOut[net.pres[e]].push(e); }
let dG = 0, dO = 0, dI = 0, subs = 0, ev = 0, x2s = 0, nAs = 0, steps = 0;
const st0 = net.step.bind(net);
net.step = function () { st0(); subs++; const spk = net.spk, n = net.nSpk, ws = net.ws;
  for (let s = 0; s < n; s++) { const i = spk[s]; regS[gr && gr[i] ? 254 : reg[i]]++; const E = toOut[i]; if (E.length) { let w = 0, wi = 0; for (const e of E) { const x = ws[e]; if (x > 0) w += x; else wi -= x; } if (gr && gr[i]) dG += w; else dO += w; dI += wi; } } };
if (net.granKalStep) { const kal0 = net.granKalStep.bind(net); net.granKalStep = function (...A) { const gA = A[9], W = A[12], nA = A[15], aL = A[16]; let x2 = 0, na = 0; for (let q = 0; q < nA; q++) { const x = gA[aL[q]] / W; if (x >= 0.01) { x2 += x * x; na++; } } ev++; x2s += x2; nAs += na; if (x2 > 0) steps += A[5] * A[6] / x2; return kal0(...A); }; }
const t0 = Date.now(); while (!a.done) a.tick();
const st = a.task.stats ? a.task.stats() : {}, names = (gc.cell.regions || []).map(r => r.name || r.R && r.R.name);
const R = {}; for (let r = 0; r < RN; r++) if (regC[r]) R[r === 254 ? 'granule' : (names[r] || 'r' + r)] = { cells: regC[r], rate: +(regS[r] / regC[r] / subs).toExponential(3) };
const gu = net.granUtilityStats ? net.granUtilityStats() : null;
const cr = net.gu && net.gu.cr ? net.gu.cr.map(x => { let t = 0, m = 0, h = 0; for (const v of x) { t += v; if (v > m) m = v; if (v > 0.5) h++; } return { cols: x.length, mean: +(t / x.length).toFixed(4), max: +m.toFixed(3), over05: h }; }) : null;
const out = { k, tag, variant, heldAcc: st.heldAcc, trainAcc: st.trainAcc, N, nHid: G.nHid, subs, regions: R, outDrive: { gran: +dG.toExponential(3), other: +dO.toExponential(3), inh: +dI.toExponential(3), granFrac: +(dG / (dG + dO)).toFixed(4) },
  granEvents: ev, meanActiveGran: +(nAs / Math.max(1, ev)).toFixed(1), meanX2: +(x2s / Math.max(1, ev)).toFixed(3), meanStep: +(steps / Math.max(1, ev)).toExponential(3), gu: gu && JSON.parse(JSON.stringify(gu, (kk, v) => Array.isArray(v) && v.length > 20 ? v.length : v)), cr, sec: (Date.now() - t0) / 1000 };
if (a.task.h0 && a.task.hits) out.hits = a.task.hits.slice(a.task.h0.n).join('');   // per held-out prediction hit (1/0), for sw/countmodel.js bins
fs.writeFileSync(`sw/out/bd_${tag}_${k}.json`, JSON.stringify(out)); console.log(JSON.stringify(out));
