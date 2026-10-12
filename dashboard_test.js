/* dashboard_test.js (v25, round 26): headless-Chrome check of dashboard.html with real runner output.
 *   node dashboard_test.js [results-folder]   (default results_v25/smoke; needs puppeteer-core + Chrome like browser_test.js)
 * Loads every run folder (files carry their relative paths, as a folder pick does), checks the runs table, the charts,
 * opens a champion in index.html (#load handoff) and in viewer.html (#arena handoff); also the plain file picker.
 * No page errors anywhere. Writes screenshot_dashboard.png. */
const path = require('path'), fs = require('fs');
const puppeteer = require(process.env.PUPPETEER || (() => { try { return require.resolve('puppeteer-core'); } catch (e) { return '/tmp/pt/node_modules/puppeteer-core'; } })());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = __dirname, RES = path.resolve(process.argv[2] || path.join(ROOT, 'results_v25', 'smoke'));
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
function walk(d, base) { const out = []; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) out.push(...walk(p, base)); else out.push({ rel: path.relative(base, p).split(path.sep).join('/'), text: fs.readFileSync(p, 'utf8') }); } return out; }
(async () => {
  const files = walk(RES, path.dirname(RES)).filter(f => /\.(csv|json)$/.test(f.rel));
  const nRuns = fs.readdirSync(RES).filter(d => fs.existsSync(path.join(RES, d, 'summary.json'))).length;
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = []; const watch = p => { p.on('pageerror', e => errs.push(p.url().split('/').pop() + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(p.url().split('/').pop() + ': ' + m.text()); }); p.on('dialog', d => d.accept()); };
  try {
    const p = await b.newPage(); watch(p); await p.setViewport({ width: 1400, height: 1000 });
    await p.goto('file://' + path.join(ROOT, 'dashboard.html')); await sleep(300);
    await p.evaluate(async fs_ => { const list = fs_.map(f => { const x = new File([f.text], f.rel.split('/').pop()); Object.defineProperty(x, 'webkitRelativePath', { value: f.rel }); return x; }); await window.__dash.loadFiles(list, true); }, files);
    await sleep(500);
    const d = await p.evaluate(() => ({ rows: document.querySelectorAll('#runs tbody tr').length, charts: document.querySelectorAll('.chart canvas').length, titles: [...document.querySelectorAll('.chart h3')].map(h => h.textContent),
      champs: document.querySelectorAll('td.champs button').length, gens: [...window.__dash.runs.values()].map(r => r.rows.length) }));
    check(d.rows === nRuns && d.gens.every(n => n >= 2), `dashboard: ${d.rows} runs in the table (= ${nRuns} run folders), generations per run ${d.gens.join(', ')}`);
    check(d.charts >= 6 && d.titles.some(t => /novelty/i.test(t)) && d.titles.some(t => /coverage/i.test(t)) && d.titles.some(t => /text: champion/.test(t)), `dashboard: ${d.charts} charts (${d.titles.slice(0, 4).join(' | ')} ...; novelty + MAP-Elites charts present)`);
    check(d.champs >= 2 * nRuns, `dashboard: champion buttons (${d.champs})`);
    await p.screenshot({ path: path.join(ROOT, 'screenshot_dashboard.png'), fullPage: true });
    // open a champion in the arena and in the viewer
    let before = new Set(await b.pages());
    await p.evaluate(() => document.querySelector('td.champs button[data-where="arena"]').click()); await sleep(4000);
    const ap = (await b.pages()).find(x => !before.has(x)); if (ap) watch(ap);
    const a = ap ? await ap.evaluate(() => ({ msg: document.getElementById('msg').textContent, n: __arena.watch.brain.N, hash: location.hash })) : null;
    check(a && /Loaded champion of run/.test(a.msg) && a.n > 0 && !a.hash, `dashboard -> index.html#load: ${a ? a.msg.slice(0, 110) : 'no page'}`);
    if (ap) await ap.close();
    before = new Set(await b.pages());
    await p.evaluate(() => document.querySelector('td.champs button[data-where="viewer"]').click()); await sleep(4000);
    const vp = (await b.pages()).find(x => !before.has(x)); if (vp) watch(vp);
    const v = vp ? await vp.evaluate(() => ({ src: window.__viewer.st.src, label: window.__viewer.st.label, N: window.__viewer.st.model && window.__viewer.st.model.N })) : null;
    check(v && v.src === 'arena' && /champion of/.test(v.label) && v.N > 0, `dashboard -> viewer.html#arena: ${v ? v.label + ', ' + v.N + ' cells' : 'no page'}`);
    if (vp) await vp.close();
    // the plain file picker (one run's files, no folder paths)
    const one = fs.readdirSync(RES).find(d => fs.existsSync(path.join(RES, d, 'summary.json')));
    const p2 = await b.newPage(); watch(p2); await p2.goto('file://' + path.join(ROOT, 'dashboard.html')); await sleep(300);
    const inp = await p2.$('#inFiles'); await inp.uploadFile(...['generations.csv', 'summary.json', 'config.json', 'champions/champion_final.json'].map(f => path.join(RES, one, f))); await sleep(800);
    const d2 = await p2.evaluate(() => ({ rows: document.querySelectorAll('#runs tbody tr').length, charts: document.querySelectorAll('.chart canvas').length, champs: document.querySelectorAll('td.champs button').length }));
    check(d2.rows === 1 && d2.charts >= 3 && d2.champs === 2, `dashboard file picker: 1 run, ${d2.charts} charts, ${d2.champs} champion buttons`);
    check(!errs.length, 'dashboard / index / viewer: no page errors ' + errs.join(' | '));
  } finally { await b.close(); }
  console.log(fails ? `${fails} FAILED` : 'DASHBOARD TEST: ALL OK'); process.exit(fails ? 1 : 0);
})();
