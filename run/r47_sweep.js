// R47 sweep driver: node run/r47_sweep.js <out.jsonl> <g0> <plan:variant>... ; 4 tasks x 16 growths (4 chunks of 4), 8 parallel processes (BB_PAR); R56 BB_G0S = chunk offsets (default 0,4,8,12)
const { spawn } = require('child_process'), path = require('path');
const [out, G0, ...PV] = process.argv.slice(2);
const TASKS = process.env.BB_TASKS ? JSON.parse(process.env.BB_TASKS) : [{ env: 'seq', params: { source: 'fables', nSyms: 2000 } }, { env: 'seq', params: { source: 'text', nSyms: 3000 } }, { env: 'seq', params: { source: 'order3', K: 8 } }, { env: 'seq', params: { source: 'text', nSyms: 1000 } }];
const jobs = []; for (const pv of PV) { const [plan, v = 'base'] = pv.split(':'); for (const t of TASKS) for (const c of (process.env.BB_G0S ? process.env.BB_G0S.split(',').map(Number) : [0, 4, 8, 12])) jobs.push([plan, JSON.stringify(t), '4', v, String(+G0 + c)]); }
// R53: resumable - chunks already in <out.jsonl> (same plan, variant, task, g0) are skipped
{ const fs = require('fs'), have = new Set(); try { for (const l of fs.readFileSync(path.resolve(out), 'utf8').trim().split('\n')) { const r = JSON.parse(l); have.add([r.plan, r.task, r.variant, r.g0].join('|')); } } catch (e) {}
  for (let j = jobs.length - 1; j >= 0; j--) if (have.has([jobs[j][0], jobs[j][1], jobs[j][3], +jobs[j][4]].join('|'))) jobs.splice(j, 1); }
let i = 0, live = 0, done = 0; const P = +(process.env.BB_PAR || 8);
function next() { while (live < P && i < jobs.length) { const a = jobs[i++]; live++;
  const ch = spawn('node', [path.join(__dirname, 'r42.js'), ...a], { env: Object.assign({}, process.env, { BB_OUT: out }), stdio: ['ignore', 'ignore', 'inherit'] });
  ch.on('exit', c => { live--; done++; if (c) console.error('FAIL', a.join(' ')); if (done % 16 === 0) console.log(done + '/' + jobs.length, new Date().toLocaleTimeString()); next(); }); } }
next();
