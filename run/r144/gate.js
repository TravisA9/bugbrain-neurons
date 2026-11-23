// node run/r144/gate.js : R144 promotion gate for the R140 look-back (S2) vs R135 candidate, 16 fresh seeds, 4x.
// Phases (in order): A tasks (fables4000 + text1000 both arms, all seeds; order3/K4/sc_order2/sc_cycle both arms, 4 seeds) -> stop-rule check on fables
// -> B probe (S2, all seeds) -> C book100k (both arms, all seeds). Max concurrent node jobs: 3 minus any other node job on the box (counted each spawn).
// Resumable (skips finished outputs). Commits each small result as it lands. Writes run/r144/out/STOP if the stop rule fires.
const { spawn, execSync } = require('child_process'), fs = require('fs'), D = '/workspace/sweep';
const SEEDS = [2960, 2961, 2962, 2963, 2964, 2965, 2966, 2967, 2968, 2969, 2970, 2971, 2973, 2974, 2975, 2976];
const CAND = JSON.parse(fs.readFileSync(D + '/run/r140/jobs_reg.json', 'utf8')).find(x => x.arm === 'cand_4x').variant, S2 = fs.readFileSync(D + '/run/r140/win_S2.txt', 'utf8').trim();
const ARMS = { cand_4x: CAND, S2_4x: S2 }, TJ = {}; for (const x of JSON.parse(fs.readFileSync(D + '/run/r140/jobs_reg.json', 'utf8'))) TJ[x.task] = x.tj;
const XR = D + '/run/r144/out/xreg.jsonl', LOG = D + '/run/r144/gate.log', log = s => fs.appendFileSync(LOG, `${new Date().toTimeString().slice(0, 8)} ${s}\n`);
const doneReg = () => new Set((fs.existsSync(XR) ? fs.readFileSync(XR, 'utf8').trim().split('\n').filter(Boolean) : []).map(l => { const r = JSON.parse(l); return r.k + '|' + r.arm + '|' + r.task; }));
const jobsA = [], jobsB = [], jobsC = [];
for (const k of SEEDS) for (const t of ['fables4000', 'text1000']) for (const a in ARMS) jobsA.push({ kind: 'reg', k, arm: a, task: t });
for (const k of SEEDS.slice(0, 4)) for (const t of ['order3', 'K4', 'sc_order2', 'sc_cycle']) for (const a in ARMS) jobsA.push({ kind: 'reg', k, arm: a, task: t });
for (const k of SEEDS) jobsB.push({ kind: 'lp', k, arm: 'S2_4x', tag: 'g144p_S2_4x', out: `sw/out/lp_g144p_S2_4x_${k}.json` });
for (const k of SEEDS) for (const a in ARMS) jobsC.push({ kind: 'bd', k, arm: a, tag: `g144b_${a}`, out: `sw/out/bd_g144b_${a}_${k}.json` });
const others = () => { try { return +execSync(`pgrep -f "node .*(nameprobe|standing_|test_core)" | wc -l`).toString().trim(); } catch (e) { return 0; } };
const memOK = () => +execSync("awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo").toString() >= 3;
let commitQ = Promise.resolve(); const commit = (files, msg) => { commitQ = commitQ.then(() => { try { execSync(`git add -f ${files.join(' ')} && git -c user.name="Grok Bot" -c user.email=bot@zaga.info commit -q -m "${msg}"`, { cwd: D }); } catch (e) { log('commit failed: ' + msg); } }); };
let run = 0;
const runPhase = (jobs) => new Promise(res => { const q = jobs.slice();
  const next = () => { if (fs.existsSync(D + '/run/r144/out/STOP')) { if (!run) res(); return; }
    if (!q.length) { if (!run) res(); return; }
    if (run + others() >= 3 || !memOK()) { setTimeout(next, 20000); return; }
    const j = q.shift(); const dr = doneReg();
    if (j.kind === 'reg' && dr.has(j.k + '|' + j.arm + '|' + j.task)) return next();
    if (j.kind !== 'reg' && fs.existsSync(D + '/' + j.out) && fs.statSync(D + '/' + j.out).size > 0) return next();
    run++; const t0 = Date.now(); let args;
    if (j.kind === 'reg') args = ['--max-old-space-size=7000', 'run/r42.js', 'deepURSx3', TJ[j.task], '1', ARMS[j.arm], String(j.k)];
    else if (j.kind === 'lp') args = ['--max-old-space-size=6000', 'sw/lagprobe140.js', String(j.k), ARMS[j.arm], j.tag, '30000'];
    else args = ['--max-old-space-size=6000', 'sw/bookdiag.js', String(j.k), ARMS[j.arm], j.tag, '100000'];
    log(`start ${j.kind} ${j.arm} ${j.task || ''} k${j.k}`);
    const c = spawn('node', args, { cwd: D }); let o = ''; c.stdout.on('data', d => o += d); c.stderr.on('data', d => fs.appendFileSync(D + '/run/r144/gate.err', d));
    c.on('close', code => { run--; const s = ((Date.now() - t0) / 60000).toFixed(1);
      if (j.kind === 'reg') { try { const r = JSON.parse(o.slice(o.indexOf('{'))); fs.appendFileSync(XR, JSON.stringify({ k: j.k, arm: j.arm, task: j.task, mean: r.mean, stats: r.stats, wallMs: Date.now() - t0 }) + '\n'); log(`done reg ${j.arm} ${j.task} k${j.k} ${s} min`); } catch (e) { log(`FAIL reg ${j.arm} ${j.task} k${j.k} code ${code}`); } }
      else { if (fs.existsSync(D + '/' + j.out)) { log(`done ${j.kind} ${j.arm} k${j.k} ${s} min`); commit([j.out], `R144 gate: ${j.kind} ${j.arm} k${j.k}`); } else log(`FAIL ${j.kind} ${j.arm} k${j.k} code ${code}`); }
      next(); });
    setTimeout(next, 3000); };
  for (let i = 0; i < 3; i++) setTimeout(next, i * 3000); });
(async () => {
  log('gate start'); await runPhase(jobsA); commit(['run/r144/out/xreg.jsonl'], 'R144 gate: phase A tasks');
  // stop rule on fables4000 (all seeds with both arms)
  const R = {}; for (const l of fs.readFileSync(XR, 'utf8').trim().split('\n')) { const r = JSON.parse(l); if (r.task !== 'fables4000') continue; (R[r.k] = R[r.k] || {})[r.arm] = r; }
  const ks = Object.keys(R).filter(k => R[k].cand_4x && R[k].S2_4x); const da = ks.reduce((s, k) => s + R[k].S2_4x.stats.accuracy - R[k].cand_4x.stats.accuracy, 0) / ks.length, df = ks.reduce((s, k) => s + R[k].S2_4x.mean - R[k].cand_4x.mean, 0) / ks.length;
  log(`fables stop-rule check n=${ks.length} acc d ${da.toFixed(4)} fit d ${df.toFixed(4)}`);
  if (da < -0.005 || df < -0.05) { fs.writeFileSync(D + '/run/r144/out/STOP', `fables acc d ${da} fit d ${df}\n`); log('STOP rule fired'); commit(['run/r144/out/STOP'], 'R144 gate STOP (fables)'); await commitQ; return; }
  await runPhase(jobsB); await runPhase(jobsC); await commitQ; log('GATE DONE'); })();
