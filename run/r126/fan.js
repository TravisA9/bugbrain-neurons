// node sw/fan.js f seed K '{"relGrowth":1,...}' : grow only (test_core block-2 config), print per-region mean in-region fan-in of hidden cells, N, time
const [f, g, K, ex] = process.argv.slice(2); const S = require('../js/node_load.js')(); S.params.granN = 128; Object.assign(S.params, JSON.parse(ex || '{}'));
const envP = Object.assign({}, S.recommendedEnvParams('seq', { source: 'order3', K: +K }, +K === 8 ? ['source'] : ['source', 'K']), { nSyms: 160 }); const E = S.setEnv('seq', envP);
const D = S.PLANS.deepURSx3.make(); D.regions.forEach(R => { R.g.sc.sizeF = +f; }); const t0 = Date.now(), b = S.growCell(D, { seed: +g, spec: E.spec });
const sp = b.sp, reg = b.region, gr = b.gran, nIn = b.nIn, h1 = b.nIn + b.nHid, fin = new Float64Array(b.N), all = new Float64Array(b.N);
for (let k = 0; k < sp.pre.length; k++) { const a = sp.pre[k], c = sp.post[k]; if (c < nIn || c >= h1 || (gr && gr[c]) || (gr && gr[a])) continue; all[c]++; if (a < nIn || reg[a] === reg[c]) fin[c]++; }
const R = {}; for (let c = nIn; c < h1; c++) { if (gr && gr[c]) continue; const r = b.regions && b.regions[reg[c]] ? b.regions[reg[c]].name || reg[c] : reg[c]; const e = R[r] || (R[r] = [0, 0, 0]); e[0] += fin[c]; e[1] += all[c]; e[2]++; }
const out = {}; for (const r in R) out[r] = { n: R[r][2], inRegion: +(R[r][0] / R[r][2]).toFixed(1), all: +(R[r][1] / R[r][2]).toFixed(1) };
console.log(JSON.stringify({ f: +f, g: +g, N: b.N, sec: (Date.now() - t0) / 1000, regions: out }));
