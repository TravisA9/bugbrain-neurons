const [f, ex] = process.argv.slice(2); const S = require('/workspace/sweep/js/node_load.js')(); S.params.granN = 128; Object.assign(S.params, JSON.parse(ex));
const E = S.setEnv('seq', Object.assign({}, S.recommendedEnvParams('seq', { source: 'order3', K: 8 }, ['source']), { nSyms: 160 }));
const D = S.PLANS.deepURSx3.make(); D.regions.forEach(R => { R.g.sc.sizeF = +f; }); const b = S.growCell(D, { seed: 5, spec: E.spec }), sp = b.sp, h1 = b.nIn + b.nHid;
const st = {}; for (let k = 0; k < sp.pre.length; k++) { const a = sp.pre[k], q = sp.post[k]; if (q < b.nIn || q >= h1 || (b.gran && (b.gran[q] || b.gran[a]))) continue; const r = b.regions[b.region[q]].name; if (r !== 'context') continue;
  const src = a < b.nIn ? 'env' : b.region[a] === b.region[q] ? (sp.w[k] > 0 ? 'inE' : 'inI') : 'tract'; const e = st[src] || (st[src] = [0, 0]); e[0]++; e[1] += Math.abs(sp.w[k]); }
let nc = 0; for (let q = b.nIn; q < h1; q++) if (!(b.gran && b.gran[q]) && b.regions[b.region[q]].name === 'context') nc++;
console.log(f, ex, JSON.stringify(Object.fromEntries(Object.entries(st).map(([k, v]) => [k, { perCell: +(v[0] / nc).toFixed(2), meanW: +(v[1] / v[0]).toFixed(2) }]))));
