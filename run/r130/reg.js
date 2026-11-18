// node sw/reg.js <jobs.json> <out.jsonl> <P>; jobs: [{arm,task,tj,variant,k}] ; resumable; memory guard (>=3 GB available before each spawn)
const { spawn, execSync } = require('child_process'), fs = require('fs');
const [JF, OUT, P0] = process.argv.slice(2), P = +P0 || 3, jobsAll = JSON.parse(fs.readFileSync(JF, 'utf8'));
const done = new Set((fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean) : []).map(l => { const r = JSON.parse(l); return r.k + '|' + r.arm + '|' + r.task; }));
const jobs = jobsAll.filter(j => !done.has(j.k + '|' + j.arm + '|' + j.task)); let run = 0;
const memOK = () => +execSync("awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo").toString() >= 3;
const next = () => { if (!jobs.length) { if (!run) fs.appendFileSync(OUT + '.log', 'DONE\n'); return; } if (!memOK()) { setTimeout(next, 20000); return; }
  const j = jobs.shift(); run++; const t0 = Date.now();
  const c = spawn('node', ['--max-old-space-size=7000', 'run/r42.js', 'deepURSx3', j.tj, '1', j.variant, String(j.k)], { cwd: '/workspace/sweep' }); let o = '';
  c.stdout.on('data', d => o += d); c.stderr.on('data', d => fs.appendFileSync(OUT + '.err', d));
  c.on('close', () => { run--; try { const r = JSON.parse(o.slice(o.indexOf('{'))); fs.appendFileSync(OUT, JSON.stringify({ k: j.k, arm: j.arm, task: j.task, mean: r.mean, stats: r.stats, wallMs: Date.now() - t0 }) + '\n'); } catch (e) { fs.appendFileSync(OUT + '.err', 'FAIL ' + JSON.stringify(j) + '\n'); } fs.appendFileSync(OUT + '.log', `${new Date().toTimeString().slice(0,5)} ${j.arm} ${j.task} k${j.k} done\n`); next(); }); };
for (let i = 0; i < P; i++) setTimeout(next, i * 2000);
