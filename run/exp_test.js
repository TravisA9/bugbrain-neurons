// node run/exp_test.js : server-defined experiment runner (run/exp.js) and its coord.js plumbing.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const E = require('./exp.js'), C = require('./coord.js'), L = require('./lib.js');
let fails = 0, n = 0;
const check = (ok, what) => { n++; if (ok) console.log('ok   ' + what); else { fails++; console.error('FAIL ' + what); } };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const CHAMP = fs.readFileSync(path.join(__dirname, 'exp_champion_r144.txt'), 'utf8').trim();
const job = (o) => Object.assign({ version: 'bb-exp-1', protocol: 1, id: 't', arm: 'control', task: 'o3', phase: 'tune', plan: 'deepURSx3',
  tj: { env: 'seq', params: { source: 'order3', K: 4, nSyms: 300, readIn: 0.01 } }, variant: 'base', k: 3, metric: 'accuracy', strictFlags: true }, o);

check(E.PROTOCOL === 1 && C.EXP_PROTOCOL === 1 && C.ALLOWED.has('run/exp.js'), 'the worker speaks experiment protocol 1 and run/exp.js is on the runner allowlist');
check(throws(() => E.validateJob(job({ protocol: 2 })), /protocol 2/), 'a job needing a newer protocol is refused');
check(throws(() => E.validateJob(job({ variant: 'P.a=1;rm -rf' })), /characters/), 'a variant with shell characters is refused');
check(throws(() => E.validateJob(job({ version: 'x' })), /bb-exp-1/), 'only bb-exp-1 jobs run');
// strict flags against this engine
const gc = () => L.serialize(L.startGenome('deepURSx3'));
check(throws(() => E.applyVariant(L, gc(), E.parseVariant('P.noSuchFlag=1'), true), /unknown engine flag P\.noSuchFlag/), 'strict mode refuses an engine flag this engine does not have');
check(throws(() => E.applyVariant(L, gc(), E.parseVariant('sc.noSuchField=1'), true), /unknown genome field/), 'strict mode refuses a genome field the engine never reads');
check(throws(() => E.applyVariant(L, gc(), E.parseVariant('P.wSlow=0.003'), true), /unknown engine flag P\.wSlow/), 'a flag from a newer engine (R145 wSlow) is refused by this R144 engine');
const saved = Object.assign({}, L.SA.params);
let applied = 0; try { applied = E.applyVariant(L, gc(), E.parseVariant(CHAMP), true); } catch (e) { console.error(e.message); }
check(applied === CHAMP.split(',').length, 'every setting of the R144 champion exists in this engine (strict check passes: ' + applied + ' settings)');
Object.keys(L.SA.params).forEach(k => { L.SA.params[k] = saved[k]; });
// coord plumbing
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-test-'));
const args = C.runnerArgs({ runner: 'run/exp.js', spec: { seed: 3, experiment: job({ heapMB: 3000 }) } }, out);
check(/^--max-old-space-size=\d+$/.test(args[0]) && args[1].endsWith(path.join('run', 'exp.js')) && args[2] === '--job' && JSON.parse(fs.readFileSync(args[3], 'utf8')).id === 't',
  'coord.js passes the heap size first and writes the experiment object as job.json');
check(C.runnerArgs({ runner: 'run/exp.js', spec: { experiment: job({}) } }, out)[0].endsWith(path.join('run', 'exp.js')), 'no heapMB: no heap flag');
check(throws(() => C.runnerArgs({ runner: 'run/exp.js', spec: {} }, out), /experiment object/), 'an experiment job without its experiment object is refused');
// one tiny real run, as the worker spawns it
const jf = path.join(out, 'tiny.json'); fs.writeFileSync(jf, JSON.stringify(job({})));
const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'exp.js'), '--job', jf, '--out', out], { encoding: 'utf8' });
let res = null; try { res = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8')); } catch (e) {}
check(r.status === 0 && res && res.version === 'bb-exp-1' && res.k === 3 && typeof res.metrics.accuracy === 'number' && res.engine.defaults === L.SA.DEFAULTS_VERSION,
  'a tiny run writes result.json with the metric and the engine version');
// same seed, same result (the server pairs arms on seeds)
fs.rmSync(path.join(out, 'result.json'));
cp.spawnSync(process.execPath, [path.join(__dirname, 'exp.js'), '--job', jf, '--out', out], { encoding: 'utf8' });
const res2 = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'));
check(res && JSON.stringify(res2.metrics) === JSON.stringify(res.metrics), 'the same job gives the same metrics (deterministic)');
const bad = path.join(out, 'bad.json'); fs.writeFileSync(bad, JSON.stringify(job({ variant: 'P.noSuchFlag=1' })));
const rb = cp.spawnSync(process.execPath, [path.join(__dirname, 'exp.js'), '--job', bad, '--out', path.join(out, 'b')], { encoding: 'utf8' });
check(rb.status === 3 && /unknown engine flag/.test(rb.stderr) && !fs.existsSync(path.join(out, 'b', 'result.json')), 'an unknown flag exits non-zero with no result, so the server sees an error, not a wrong score');
fs.rmSync(out, { recursive: true, force: true });
console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'ALL OK (' + n + ' checks)');
process.exit(fails ? 1 : 0);
