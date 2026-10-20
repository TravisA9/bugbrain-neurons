// R77: shared-queue jobs y89-y92 (node run/r77_jobs.js <outdir>) + the v40 pin / re-rank of pending jobs (node run/r77_jobs.js <outdir> <queue jobs dir> <queue done dir> <queue claims dir>).
// v40 (R77) = v39 + cortex preNorm 55. Every R77 arm sets the cortex rate and states the cortex budget explicitly: 'pl.preNorm@cortex=45' = the v39 brain.
// R77 box finding (Travis's compensation idea): every output cell releases a FIXED trophic factor, shared by its inputs; a cell receiving less than
//   sc.trophMin (0.005) dies. A cortex f x larger splits the same factor f ways, so at cortex 4x on order3 K4 (4 outputs) and at 8x on order3 K8 every
//   output-projecting cortex cell starves and dies: the outputs end with ZERO afferents (wiring census) -> score 0. Compensation: trophMin@cortex = 0.005 / f
//   (box, growths 0-1: cx4 divRep K4 0 -> 9.88; cx4 fanRef K4 0 / 2.55 -> 9.28 / 6.97; cx4 divRep K8 7.97 / 7.35 -> 8.90 / 8.27; book / text identical).
// y89: cortex 4x + divRep 2 + trophMin/4 (I80; y46c growths 0-7: book10k +0.029, book30k +0.033, fables +0.033 vs 1x, 8/0) on FRESH growths k 1700-1715,
//      with v40 and v39 1x arms on the same growths (= a second fresh v40 check).
// y90: the compensated size curve (cortex 2x / 3x / 4x divRep 2 + trophMin 0.005/f), growths 0-15, 5 tasks + order3 K4 + seqchoice cycle; cortex 4x (no divRep) + trophMin/4 on K4.
// y91: cortex 8x divRep 2 + trophMin/8 (memGB 4.6; 'cx8' in the id: tacobell skips it).
const fs = require('fs'), path = require('path');
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'run/r77_jobs.js'];
const out = process.argv[2] || 'jobs_r77'; fs.mkdirSync(out, { recursive: true });
const book = (n, x) => JSON.stringify({ env: 'seq', params: Object.assign({ source: 'book', nSyms: n, evalSyms: 2000 }, x || {}) });
const FAB = n => JSON.stringify({ env: 'seq', params: { source: 'fables', nSyms: n, readIn: 0.01 } });
const ORD = K => JSON.stringify({ env: 'seq', params: { source: 'order3', K, readIn: 0.01 } }), TXT = JSON.stringify({ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } });
const SC = s => JSON.stringify({ env: 'seqchoice', params: { source: s, nSyms: 1000 } });
const T = { b10: [book(10000), 'book10k'], b30: [book(30000), 'book30k'], f4: [FAB(4000), 'fables4000'], o3: [ORD(8), 'order3'], o3k4: [ORD(4), 'order3 K4'], t1: [TXT, 'text1000'],
  so2: [SC('order2'), 'seqchoice order2'], scy: [SC('cycle'), 'seqchoice cycle'] };
// measured wall s per run on linux-pc (registry wallMs): 1x y24/y83, cortex 4x divRep y46c; 2x / 3x interpolated
const SEC = { 'c8d': { b10: 577, f4: 300, o3: 142, t1: 206 }, '1x': { b10: 35, b30: 81, f4: 20, o3: 8, o3k4: 6, t1: 11, so2: 11, scy: 9 }, 'c4d': { b10: 221, b30: 560, f4: 115, o3: 62, o3k4: 50, t1: 83, so2: 75, scy: 72 } };
SEC.c2d = {}; SEC.c3d = {}; for (const k in SEC.c4d) { SEC.c2d[k] = Math.round(SEC.c4d[k] * 0.45); SEC.c3d[k] = Math.round(SEC.c4d[k] * 0.7); }
const FAST = 'P.fastEngine=1', L2 = 'pl.lr@cortex=0.2', PN = x => `pl.preNorm@cortex=${x}`, v = (...a) => a.filter(Boolean).concat([FAST]).join(',');
const FR = 'P.fanRef=450,P.fanRefR=126', CD = f => `sc.sizeF@cortex=${f},sc.divRep@cortex=2`;
const V40 = v(L2), V39 = v(L2, PN(45)), C4D = v(CD(4), FR, L2, PN(45));
const SLOTS = 6;
function job(id, o) {
  const runs = []; let sec = 0;
  for (const a of o.arms) for (const tk of a.tasks) for (const g0 of o.seeds) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', T[tk][0], '1', a.variant, String(g0), '--force'], label: `${a.lbl} ${T[tk][1]} g${g0} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += SEC[a.size][tk]; }
  const j = { id, question: o.q, track: 'neuro', kind: 'runs', requires: REQ, title: o.title, priority: o.pri, estHours: +(sec / 3600 / SLOTS).toFixed(1), slotHours: +(sec / 3600).toFixed(1), phone: false, flag: 'text', accept: { note: o.note }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n'); return j; }
const K = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const ALL7 = ['b10', 'b30', 'f4', 'o3', 't1', 'so2', 'scy'], FIVE = ['b10', 'b30', 'f4', 'o3', 't1'];
const J = [];
const TM = f => `sc.trophMin@cortex=${+(0.005 / f).toPrecision(4)}`, CDT = f => v(CD(f), TM(f), FR, L2, PN(45));
for (const [s, g] of [['a', K(1700, 8)], ['b', K(1708, 8)]])
  J.push(job('y89' + s + '_cx4divRep_fresh', { q: 'Q45', pri: 0.995, seeds: g, title: `cortex 4x divRep 2 + trophMin/4 + fanRef 450/R126 (preNorm 45) vs 1x v40 and v39 on FRESH growths k ${g[0]}-${g[7]}, all 7 tasks + order3 K4`,
    note: 'does the cx4 divRep text gain (y46c growths 0-7: book +0.03) hold on fresh seeds, and does trophMin/4 keep order3 / K4? v40 vs v39 (pin preNorm 45) = second fresh check of v40',
    arms: [{ variant: V40, tasks: ALL7, size: '1x', lbl: 'v40' }, { variant: V39, tasks: FIVE.concat(['o3k4']), size: '1x', lbl: 'v39' }, { variant: CDT(4), tasks: ALL7.concat(['o3k4']), size: 'c4d', lbl: 'cx4 divRep trophMin/4' }] }));
for (const [s, g] of [['a', K(0, 8)], ['b', K(8, 8)]])
  J.push(job('y90' + s + '_trophMin_curve', { q: 'I95', pri: 0.99, seeds: g, title: `compensated size curve: cortex 2x / 3x / 4x divRep 2 + trophMin 0.005/f + fanRef 450/R126 (preNorm 45), growths ${g[0]}-${g[7]}, 5 tasks + order3 K4 + seqchoice cycle; cx4 + trophMin/4 on K4`,
    note: 'refs 1x v39 (y24 / y84 / y86 / y10), y46c (cx4 divRep, no trophMin), y49 (cx2), y86 (cx4 K4); Travis: patch varying opposite to size',
    arms: [2, 3, 4].map(f => ({ variant: CDT(f), tasks: FIVE.concat(['o3k4', 'scy']), size: 'c' + f + 'd', lbl: `cx${f} divRep trophMin/${f}` }))
      .concat([{ variant: v('sc.sizeF@cortex=4', TM(4), FR, L2, PN(45)), tasks: ['o3k4'], size: 'c4d', lbl: 'cx4 trophMin/4' }]) }));
{ const j = job('y91_cx8_trophMin', { q: 'I95', pri: 0.975, seeds: K(0, 8), title: 'cortex 8x divRep 2 + trophMin/8 + fanRef 450/R126 (preNorm 45), growths 0-7: order3, text1000, book10k, fables4000 [memGB 4.6]', note: 'ref y46 (8x without trophMin: order3 0.000, text 0.565); box g0: order3 0 -> 0.725, text 0.571 -> 0.766',
  arms: [{ variant: CDT(8), tasks: ['o3', 't1', 'b10', 'f4'], size: 'c8d', lbl: 'cx8 divRep trophMin/8' }] });
  Object.assign(j, { memGB: 4.6, requires: j.requires.concat(['run/mempar.js']), estHours: +(j.slotHours / 2).toFixed(1) }); fs.writeFileSync(path.join(out, j.id + '.json'), JSON.stringify(j, null, 2) + '\n'); }
// v40 pin + re-rank of pending jobs (needs the queue's jobs / done / claims dirs)
const [QJ, QD, QC] = process.argv.slice(3);
const PRI = { y61c_cx4_divRep_g8: 0.72, y61_cx8_divRep_g8: 0.6, y52_cx8_long: 0.55, y77_cx8_fix_book100k: 0.5,
  y21_size3xS_screen: 0.8, y39a_3xS_fresh: 0.78, y39b_3xS_fresh: 0.78, y73_cx3_fix_all7: 0.79,
  y18_gen_gate_4xS: 0.7, y53_cx4_fanRef_gen: 0.69, y78_fix_gen30k_g16: 0.68,
  y51a_cx4_fanRef_g16: 0.66, y51b_cx4_fanRef_g24: 0.66, y69a_fix_all7_g32: 0.67, y69b_fix_all7_g40: 0.67,
  y57_4xS_fanRef300: 0.6, y59_ctx4_norm: 0.6, y37a_4xS_dissect_g16: 0.6, y37b_4xS_dissect_g24: 0.6, y71_fix_long_text: 0.6,
  y36_4xS_book300k: 0.58, y55_4xS_fanRef_long: 0.57, y54_cx4_fanRef_book300k_g1408: 0.57, y40_2xS_long: 0.57, y60_1x_fanRef_long: 0.55,
  y70_fix_book1M: 0.55, y74_fix_book300k_g1416: 0.55, y75_fix_book1M_g1404: 0.54, y76_fix_book300k_g1424: 0.54, y41_4xS_rate_book100k: 0.52,
  y35a_4xS_rule: 0.5, y35b_4xS_rule: 0.5, y58_cx4_fanRef_rule: 0.5, y20_4xS_consolidation: 0.5, y19_4xS_lr02_book100k: 0.45, y22a_4xS_lr02_fresh: 0.45, y22b_4xS_lr02_fresh: 0.45 };
const BLOCK = { y38_v39_rule_knobs_g16: 'R77: its knobs are settled (teachThr inert, metaCap 400 / trustPow 0.5 / plateau 5 rejected, preNorm 55 adopted as v40); more growths of rejected arms do not clarify anything' };
const GEN = ['y18_gen_gate_4xS', 'y53_cx4_fanRef_gen', 'y78_fix_gen30k_g16'];   // R77: r42.js ignores genSyms (no generation metrics, y31 / y32 recorded only teacher-forced accuracy) -> run/gen.js
if (QJ) {
  let pinned = 0, files = 0;
  for (const f of fs.readdirSync(QJ).filter(f => f.endsWith('.json'))) {
    const id = f.replace(/\.json$/, ''); if (fs.existsSync(path.join(QD, f)) || fs.existsSync(path.join(QC, f))) continue;
    const j = JSON.parse(fs.readFileSync(path.join(QJ, f), 'utf8')); let ch = false;
    for (const r of j.runs || []) { if (r.args[0] !== 'deepURSx3' || /preNorm@cortex=|pl\.preNorm=/.test(r.args[3])) continue;
      const a = r.args[3] === 'base' ? [] : r.args[3].split(','), k = a.indexOf(FAST); if (k >= 0) a.splice(k, 0, PN(45)); else a.push(PN(45)); r.args[3] = a.join(','); pinned++; ch = true; }
    if (GEN.includes(id)) { for (const r of j.runs) r.script = 'run/gen.js'; j.requires = [...new Set((j.requires || []).concat(['run/gen.js']))]; j.r77gen = 'R77: script r42.js -> run/gen.js (r42 records no generation metrics)'; ch = true; }
    if (PRI[id] != null && PRI[id] !== j.priority) { j.priority = PRI[id]; ch = true; }
    if (BLOCK[id]) { j.kind = 'blocked'; j.blockedWhy = BLOCK[id]; ch = true; }
    if (ch) { j.r77 = 'R77: v40 pin (pl.preNorm@cortex=45 = the v39 brain) / re-rank'; fs.writeFileSync(path.join(out, f), JSON.stringify(j, null, 2) + '\n'); files++; }
  }
  console.log(`pinned ${pinned} runs in ${files} pending job files`);
}
console.log(J.map(j => `${j.id} pri ${j.priority} runs ${j.runs.length} slot-h ${j.slotHours} est ${j.estHours} h`).join('\n'));
console.log('new slot-h', J.reduce((a, j) => a + j.slotHours, 0).toFixed(1));
