// R38: one-off backfill of experiments/registry.jsonl from finished results (results_box/r35..r37 ablations, results/*/summary.json runs)
const fs = require('fs'), path = require('path'), R = require('./registry.js'), ROOT = path.resolve(__dirname, '..');
const have = new Set(R.load().map(e => e.fp)); let n = 0;
const add = (d, x) => { const f = R.fingerprints(d); if (have.has(f.fp)) return; have.add(f.fp); R.record(d, x); n++; };
for (const dir of ['results_box/r35', 'results_box/r36', 'results_box/r37']) { const D = path.join(ROOT, dir); if (!fs.existsSync(D)) continue;
  for (const f of fs.readdirSync(D)) { if (!f.endsWith('.json')) continue; let o; try { o = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { continue; } if (o.mean == null) continue;
    const plan = o.plan || ('r37:' + o.v), variant = o.variant || 'base', G = (o.scores || []).length; add(R.describeAblation(plan, o.task, variant, G, variant === 'champ' ? 'dualtag2_champion.json' : null, dir === 'results_box/r37' && !/^unified[CG]_/.test(f) ? 25 : 24), { status: 'finished', result: o, source: dir + '/' + f }); } }
for (const base of ['results']) { const B = path.join(ROOT, base); if (!fs.existsSync(B)) continue;
  for (const d of fs.readdirSync(B)) { const sp = path.join(B, d, 'summary.json'), cp = path.join(B, d, 'config.json'); if (!fs.existsSync(sp) || !fs.existsSync(cp)) continue;
    const s = JSON.parse(fs.readFileSync(sp, 'utf8')), c = JSON.parse(fs.readFileSync(cp, 'utf8')); if (c.smokeRun || s.status === 'running') continue;
    let dv = null; try { dv = JSON.parse(fs.readFileSync(path.join(B, d, 'version.json'), 'utf8')).defaultsVersion; } catch (e) {}
    add(R.describeRun(c, dv == null ? null : dv), { status: s.status, dir: d, champion: s.champion ? { val: s.champion.val, gen: s.champion.gen, raw: s.champion.raw } : null, tasks: s.tasks, source: base + '/' + d }); } }
console.log(`registry backfill: ${n} entries added -> ${R.REG}`);
