// node run/r145/drive.js <jobs.json> [logname]: R145 job driver (resumable). jobs = [{kind:'bd'|'lp'|'reg', k, arm, add, tag, n, task}]
// variant = run/champion.txt + ',' + add. Max concurrent node jobs: 3 minus any foreign node job (counted at each spawn). Commits each output.
const { spawn, execSync } = require('child_process'), fs = require('fs'), D = '/workspace/sweep';
const JF = process.argv[2], NAME = process.argv[3] || require('path').basename(JF, '.json'), LOG = `${D}/run/r145/${NAME}.log`, XR = `${D}/run/r145/out/xreg_${NAME}.jsonl`;
fs.mkdirSync(D + '/run/r145/out', { recursive: true });
const CH = fs.readFileSync(D + '/run/champion.txt', 'utf8').trim(), TJ = {}; for (const x of JSON.parse(fs.readFileSync(D + '/run/r140/jobs_reg.json', 'utf8'))) TJ[x.task] = x.tj;
const log = s => fs.appendFileSync(LOG, `${new Date().toTimeString().slice(0, 8)} ${s}\n`);
const jobs = JSON.parse(fs.readFileSync(JF, 'utf8'));
const doneReg = () => new Set((fs.existsSync(XR) ? fs.readFileSync(XR, 'utf8').trim().split('\n').filter(Boolean) : []).map(l => { const r = JSON.parse(l); return r.k + '|' + r.arm + '|' + r.task; }));
const outOf = j => j.kind === 'bd' ? `sw/out/bd_${j.tag}_${j.k}.json` : j.kind === 'lp' ? `sw/out/lp_${j.tag}_${j.k}.json` : null;
const mine = () => { try { return execSync('ps -eo args=').toString().split('\n').filter(l => /^(\S*\/)?node\s/.test(l) && !/exec-daemon|hostinger|playwright|\.npm\/_npx|mcp|run\/r145\/drive\.js/.test(l)).length; } catch (e) { return 0; } };
const memOK = () => +execSync("awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo").toString() >= +(process.env.MEMGB || 4);
let commitQ = Promise.resolve(); const commit = (files, msg) => { commitQ = commitQ.then(() => { try { execSync(`git add -f ${files.join(' ')} && git -c user.name="Grok Bot" -c user.email=bot@zaga.info commit -q -m "${msg}"`, { cwd: D }); } catch (e) { log('commit failed: ' + msg); } }); };
const MAXJ = +(process.env.MAXJ || 3); let run = 0; const q = jobs.slice();
const next = () => { if (fs.existsSync(`${D}/run/r145/out/STOP_${NAME}`)) q.length = 0;
  if (!q.length) { if (!run) finish(); return; }
  if (run >= MAXJ || mine() >= MAXJ || !memOK()) return;   // mine() counts every non-daemon node job incl. our own children
  const j = q.shift(), variant = j.add ? CH + ',' + j.add : CH, o = outOf(j);
  if (j.kind === 'reg' && doneReg().has(j.k + '|' + j.arm + '|' + j.task)) return next();
  if (o && fs.existsSync(D + '/' + o) && fs.statSync(D + '/' + o).size > 0) return next();
  run++; const t0 = Date.now(); let args;
  if (j.kind === 'reg') args = ['--max-old-space-size=7000', 'run/r42.js', 'deepURSx3', TJ[j.task], '1', variant, String(j.k)];
  else if (j.kind === 'lp') args = ['--max-old-space-size=6000', 'sw/lagprobe140.js', String(j.k), variant, j.tag, String(j.n || 30000)];
  else args = ['--max-old-space-size=6000', 'sw/bookdiag.js', String(j.k), variant, j.tag, String(j.n || 100000)];
  log(`start ${j.kind} ${j.arm} ${j.task || j.n || ''} k${j.k}`);
  const c = spawn('node', args, { cwd: D }); let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => fs.appendFileSync(`${D}/run/r145/${NAME}.err`, d));
  c.on('close', code => { run--; const s = ((Date.now() - t0) / 60000).toFixed(1);
    if (j.kind === 'reg') { try { const r = JSON.parse(out.slice(out.indexOf('{'))); fs.appendFileSync(XR, JSON.stringify({ k: j.k, arm: j.arm, task: j.task, mean: r.mean, stats: r.stats, wallMs: Date.now() - t0 }) + '\n'); log(`done reg ${j.arm} ${j.task} k${j.k} ${s} min`); commit([XR], `R145 ${NAME}: reg ${j.arm} ${j.task} k${j.k}`); } catch (e) { log(`FAIL reg ${j.arm} ${j.task} k${j.k} code ${code}`); } }
    else if (fs.existsSync(D + '/' + o)) { log(`done ${j.kind} ${j.arm} k${j.k} ${s} min`); commit([o], `R145 ${NAME}: ${j.kind} ${j.arm} k${j.k}`); } else log(`FAIL ${j.kind} ${j.arm} k${j.k} code ${code}`);
    }); };
let fin = false, iv; const finish = () => { if (fin) return; fin = true; clearInterval(iv); commitQ.then(() => log('DRIVE DONE')); };
log(`drive start ${jobs.length} jobs`); iv = setInterval(next, 15000); next();
