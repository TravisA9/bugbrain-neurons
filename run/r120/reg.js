// regression driver: node reg.js <P> <seeds csv> ; resumable (skips jobs already in reg.jsonl)
const { spawn } = require('child_process'), fs = require('fs');
const P = +process.argv[2] || 3, seeds = (process.argv[3] || '2951,2952,2953').split(',').map(Number);
const V = fs.readFileSync('/workspace/v47.txt', 'utf8').trim(), ARM = { off: '', old: fs.readFileSync('/workspace/hr/old.txt', 'utf8').trim(), gd: fs.readFileSync('/workspace/hr/old.txt', 'utf8').trim() + ',P.granExactGuard=3', gd2: fs.readFileSync('/workspace/hr/old.txt', 'utf8').trim() + ',P.granExactGuard=2', dc: fs.readFileSync('/workspace/hr/old.txt', 'utf8').trim() + (process.env.DCV || '') }, arms = (process.argv[4] || 'off,old,fin').split(',');
const T = [[{ env: 'seq', params: { source: 'order3', K: 8, readIn: 0.01 } }, 'order3'], [{ env: 'seq', params: { source: 'order3', K: 4, readIn: 0.01 } }, 'K4'],
  [{ env: 'seqchoice', params: { source: 'order2', nSyms: 1000 } }, 'sc_order2'], [{ env: 'seqchoice', params: { source: 'cycle', nSyms: 1000 } }, 'sc_cycle'],
  [{ env: 'seq', params: { source: 'fables', nSyms: 4000, readIn: 0.01 } }, 'fables4000'], [{ env: 'seq', params: { source: 'text', nSyms: 1000, readIn: 0.01 } }, 'text1000'],
  [{ env: 'seq', params: { source: 'book', nSyms: 10000, evalSyms: 2000 } }, 'book10k']];
const done = new Set((fs.existsSync('reg.jsonl') ? fs.readFileSync('reg.jsonl', 'utf8').trim().split('\n').filter(Boolean) : []).map(l => { const r = JSON.parse(l); return r.k + r.arm + r.task; }));
const jobs = []; for (const k of seeds) for (const [tj, nm] of T) for (const arm of arms) if (!done.has(k + arm + nm)) jobs.push({ k, arm, nm, tj });
let run = 0; const next = () => { if (!jobs.length) { if (!run) fs.appendFileSync('reg.log', 'DONE\n'); return; } const j = jobs.shift(); run++;
  const c = spawn('node', ['run/r42.js', 'deepURSx3', JSON.stringify(j.tj), '1', ARM[j.arm] ? V + ',' + ARM[j.arm].replace(/^,/, '') : V, String(j.k)], { cwd: '/workspace/bb' }); let o = '';
  c.stdout.on('data', d => o += d); c.stderr.on('data', d => fs.appendFileSync('reg.err', d));
  c.on('close', code => { run--; try { const r = JSON.parse(o.slice(o.indexOf('{'))); fs.appendFileSync('reg.jsonl', JSON.stringify({ k: j.k, arm: j.arm, task: j.nm, mean: r.mean, scores: r.scores, stats: r.stats, wallMs: r.wallMs }) + '\n'); } catch (e) { fs.appendFileSync('reg.err', 'FAIL ' + JSON.stringify(j) + ' ' + code + '\n'); } next(); }); };
for (let i = 0; i < P; i++) next();
