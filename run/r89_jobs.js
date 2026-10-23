// R89 (Oct 22 2026, evening queue review): v42 adopted = v41 + params.granRef 600 (DEFAULTS_VERSION 35).
// y139 (the v42 decision, fresh k 2048-2063) was run on the box (both workers had no jobs: R88's jobs were never pushed, TacoBell offline),
// so it is dropped from the queue. Every other R88 job (y140-y153) was written for v41 (granRef 100): each run whose variant sets no
// P.granRef is pinned to P.granRef=100, so the jobs keep their v41 meaning and stay comparable with their v41 refs (y133-y138).
// Adds y154a/b: v42 worker held-out vs v41 (fresh k 2176-2191, all 7 tasks + order3 K4).
// usage: node run/r89_jobs.js <outdir>   (runs run/r88_jobs.js into <outdir>, then pins / drops / adds)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const out = process.argv[2] || 'jobs_r89'; fs.mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [path.join(__dirname, 'r88_jobs.js'), out], { stdio: 'ignore' });
const REQ = ['run/r42.js', 'js/core/net.js', 'js/core/regions.js', 'js/core/develop.js', 'run/mempar.js', 'run/r88_jobs.js', 'run/r89_jobs.js'];
const pin = s => /P\.granRef=/.test(s) ? s : s.replace(/(,P\.fastEngine=1)$/, ',P.granRef=100$1');
for (const f of fs.readdirSync(out)) {
  const p = path.join(out, f);
  if (/^y139/.test(f)) { fs.unlinkSync(p); continue; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of j.runs) if (r.args[0] === 'deepURSx3') r.args[3] = pin(r.args[3]);
  j.requires = REQ; j.title += ' [R89: pinned to v41 = P.granRef=100]';
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
const T = { b10: [{ source: 'book', nSyms: 10000, evalSyms: 2000 }, 'book10k', 47], b30: [{ source: 'book', nSyms: 30000, evalSyms: 2000 }, 'book30k', 109],
  f4: [{ source: 'fables', nSyms: 4000, readIn: 0.01 }, 'fables4000', 27], o3: [{ source: 'order3', K: 8, readIn: 0.01 }, 'order3', 11], t1: [{ source: 'text', nSyms: 1000, readIn: 0.01 }, 'text1000', 15],
  o3k4: [{ source: 'order3', K: 4, readIn: 0.01 }, 'order3 K4', 8], so2: [{ source: 'order2', nSyms: 1000 }, 'seqchoice order2', 11, 'seqchoice'], scy: [{ source: 'cycle', nSyms: 1000 }, 'seqchoice cycle', 9, 'seqchoice'] };
const ARMS = [['v42 1x', 'pl.lr@cortex=0.2,P.fastEngine=1'], ['v41 1x', 'pl.lr@cortex=0.2,P.granRef=100,P.fastEngine=1']];
for (const [s, g0] of [['a', 2176], ['b', 2184]]) {
  const id = `y154${s}_1x_v42_heldout`, runs = []; let sec = 0;
  for (const [lbl, variant] of ARMS) for (const t in T) for (let g = g0; g < g0 + 8; g++) {
    runs.push({ script: 'run/r42.js', args: ['deepURSx3', JSON.stringify({ env: T[t][3] || 'seq', params: T[t][0] }), '1', variant, String(g), '--force'], label: `${lbl} ${T[t][1]} g${g} n1`, env: { BB_OUT: `results/phone/${id}.jsonl` } });
    sec += T[t][2]; }
  const j = { id, question: 'I99', track: 'neuro', kind: 'runs', requires: REQ, title: `v42 worker held-out: v42 (granRef 600) vs v41 (P.granRef=100) on fresh growths k ${g0}-${g0 + 7}, all 7 tasks + order3 K4`,
    priority: 0.99, estHours: +(sec / 3600 / 6).toFixed(1), slotHours: +(sec / 3600).toFixed(1), phone: false, flag: 'text', memGB: 1,
    accept: { note: 'v42 adopted R89 on two box blocks (32 growths): book +0.018 / +0.021 (32/0), fables +0.003, order3 +0.002, text1000 -0.0004 (11/14, t -1.0). Watch text1000: if the pooled text cost reaches significance over 48 growths, revert to granRef 100 or test 300-450.' }, runs };
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(j, null, 2) + '\n');
}
let tot = 0; for (const f of fs.readdirSync(out).sort()) { const j = JSON.parse(fs.readFileSync(path.join(out, f))); tot += j.slotHours; console.log(j.id.padEnd(30), String(j.runs.length).padStart(4), 'runs', String(j.slotHours).padStart(5), 'slot-h', 'pri', j.priority, 'memGB', j.memGB || '-'); }
console.log('total slot-h', tot.toFixed(1));
