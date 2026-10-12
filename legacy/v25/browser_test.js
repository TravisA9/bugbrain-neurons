/* browser_test.js (v17, round 18; panels v19): headless-Chrome regression test of what a USER sees in the sequence/text view.
 *   node browser_test.js            (needs puppeteer-core + Chrome; PUPPETEER=<path to puppeteer-core>, CHROME=<binary>)
 * Checks, in a fresh profile and in a profile holding an older saved session:
 *   A fresh: Sequence prediction -> Text corpus gives the recommended setup (two- and three-phase clock, 1000 symbols, plan predictK3; v21);
 *     the HISTORY TABLE rows (input | predicted next | actual next) of one full 1000-character lifetime are captured:
 *     each row's colour (green) must equal predicted === actual, each 'actual next' must be the next row's input,
 *     green fraction >= 0.55 overall and >= 0.60 in the last 100, last quarter > first quarter.
 *   B an older (v16) saved session (seq, cycle K=4, evolved, champion) is NOT restored silently; the Restore button is shown;
 *     Text then reaches >= 0.40 green over the first 300 characters (before v17: ~0.08, the old champion was watched).
 *   C Restore previous session loads it; Settings -> Reset to recommended settings goes back to generation 0 with the default plan.
 *   D the text stub entry opens Sequence prediction + Text corpus.
 *   E (v19, panels) during the lifetime of A: the output-spike bars on the canvas show nonzero spikes, the spike raster's output band
 *     has lit pixels; the learning curve has ceil(n / bin) points whose symbol-weighted mean equals the accuracy, and the status line's
 *     'accuracy N%' matches it; while evolving (before generation 1) the fitness chart shows the generation-0 progress.
 *   F (v20) bandit env: default plan rewardK (critic + action noise) runs, status line, Activity tab critic line + value trace,
 *     screenshot_ui_bandit.png; cue with the random mapping switches to rewardMemK with broadcast GO.
 *   G (v23) Brain view: every node and edge endpoint inside the canvas for the default plans.
 *   H (v24) Fast mode: no canvas calls at all, the text panel updates, the setting survives a reload, switching mid-lifetime keeps the
 *     brain, and each finished lifetime's accuracy / best-arm rate equals a Node run of the same genome + seed (bit-identical).
 *   No page errors anywhere. Runs ~2.5 min. Exit code 1 on failure. */
const path = require('path'), fs = require('fs');
const puppeteer = require(process.env.PUPPETEER || (() => { try { return require.resolve('puppeteer-core'); } catch (e) { return '/tmp/pt/node_modules/puppeteer-core'; } })());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = __dirname, URL = 'file://' + path.join(ROOT, 'index.html');
const OLD = fs.readFileSync(path.join(ROOT, 'results_v17/fixture_old_session_v16.json'), 'utf8');
const SAnode = () => require(path.join(ROOT, 'js/node_load.js'))();
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

async function open(b, oldSession) {
  const p = await b.newPage(), errs = []; p.on('pageerror', e => { errs.push(e.message); console.log('     page error stack: ' + (e.stack || '').split('\n').slice(0, 4).join(' / ')); }); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('dialog', d => d.accept());
  await p.setViewport({ width: 1600, height: 1000 });
  await p.goto(URL); await p.evaluate(() => localStorage.clear());
  if (oldSession) await p.evaluate(t => localStorage.setItem('spikingArena.session.v7', t), oldSession);
  await p.reload(); await sleep(800); return { p, errs };
}
const msg = p => p.$eval('#msg', e => e.textContent);
async function chooseText(p) {
  if (await p.$eval('#selEnv', e => e.value) !== 'seq') { await p.select('#selEnv', 'seq'); await sleep(1500); }
  await p.evaluate(() => { const s = [...document.querySelectorAll('#sl_task select')].find(x => [...x.options].some(o => o.value === 'text')); s.value = 'text'; s.dispatchEvent(new Event('change')); });
  await sleep(2500);
}
// capture the history table rows exactly as rendered (task.recent = [input, predicted, green?, actual]) for every finished step
async function record(p) {
  // a fresh lifetime starts first (New episode), so the rows of the first recorded lifetime are complete; rows of later lifetimes are not mixed in
  await p.evaluate(() => { document.getElementById('btnNewWorld').click(); window.__rows = []; window.__lives = []; let w = __arena.watch, n = 0;
    window.__poll = setInterval(() => { const W = __arena.watch;
      if (W !== w) { const k = w.task.n - n; if (k > 0 && !window.__lives.length) window.__rows.push(...w.task.recent.slice(-k).map(r => r.slice())); window.__lives.push(w.task.hits.slice()); w = W; n = 0; }
      const t = W.task, k = t.n - n;
      if (!window.__lives.length && t.drawn) { const P = window.__panel || (window.__panel = { bars: 0, out: 0, curveOk: 0, curveBad: [], lineOk: 0, lineBad: [], tabOk: 0, tabBad: [] });
        { const D = t.drawnTable; if (D && D.inputs.length > 1) { const R = t.recent.slice(-(D.inputs.length - 1)); let ok = D.preds[0] === null && D.inputs[D.inputs.length - 1] === R[R.length - 1][3];
            for (let j = 1; j < D.inputs.length; j++) { if (D.green[j] !== (D.preds[j] === D.inputs[j]) || D.inputs[j - 1] !== R[j - 1][0] || D.preds[j] !== R[j - 1][1]) ok = false; }
            if (ok) P.tabOk++; else if (P.tabBad.length < 5) P.tabBad.push(JSON.stringify(D).slice(0, 200)); } }
        P.bars = Math.max(P.bars, t.drawn.bars.reduce((a, b) => a + b, 0)); const R = __arena.raster; if (R) P.out = Math.max(P.out, R.outputs || 0);
        if (t.n && t.n === t.hits.length) { const cv = t.curve(), want = Math.ceil(t.hits.length / t.curveBin()), mean = cv.reduce((a, q) => a + q.acc * q.n, 0) / t.n;
          if (cv.length === want && Math.abs(mean - t.correct / t.n) < 1e-9) P.curveOk++; else P.curveBad.push([t.n, cv.length, want, mean, t.correct / t.n]);
          const m = /accuracy (\d+)%/.exec(document.getElementById('statline').textContent);
          if (t.n < 100) {} else if (m && Math.abs(+m[1] - 100 * t.correct / t.n) <= 1.5) P.lineOk++; else if (m) P.lineBad.push([t.n, m[1], 100 * t.correct / t.n]); } }
      if (k > 0) { if (!window.__lives.length) window.__rows.push(...t.recent.slice(-Math.min(k, t.recent.length)).map(r => r.slice())); n = t.n; } }, 15); });
}
const frac = a => a.length ? a.reduce((s, r) => s + (r[2] ? 1 : 0), 0) / a.length : 0;
function tableConsistent(rows) { const bad = []; for (let i = 0; i < rows.length; i++) { if (!!rows[i][2] !== (rows[i][1] === rows[i][3])) bad.push(['colour', i, rows[i]]); if (i + 1 < rows.length && rows[i][3] !== rows[i + 1][0]) bad.push(['next', i, rows[i], rows[i + 1]]); } if (bad.length) console.log('     table mismatches:', JSON.stringify(bad.slice(0, 5)), bad.length); return bad.length; }

(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 900000 });
  try {
    // ---- A: fresh profile ----
    { const { p, errs } = await open(b); await chooseText(p); await p.select('#selSpeed', '10');
      const s = await p.evaluate(() => ({ plan: SpikingArena.defaultPlanId(SpikingArena.currentEnv()), P: SpikingArena.currentEnv().P, label: __arena.watch.genome.label }));
      check(s.plan === 'predictK3' && s.P.clock2 && s.P.clock3 && s.P.nSyms === 1000, `A recommended text setup: plan ${s.plan}, clock2 ${s.P.clock2}, clock3 ${s.P.clock3}, nSyms ${s.P.nSyms}`);
      await record(p); const t0 = Date.now();
      while (Date.now() - t0 < 150000 && !(await p.evaluate(() => window.__lives.length))) await sleep(2000);
      const r = await p.evaluate(() => ({ rows: window.__rows, life: window.__lives[0] || null }));
      const rows = r.rows.slice(0, 1000), h = r.life || [], q = (a, i) => frac(a.slice(Math.floor(a.length * i / 4), Math.floor(a.length * (i + 1) / 4)).map(x => [0, 0, x]));
      console.log(`     A table: ${rows.length} rows, green ${frac(rows).toFixed(3)}, last 100 ${frac(rows.slice(-100)).toFixed(3)}; lifetime hits ${h.length}, quarters ${[0, 1, 2, 3].map(i => q(h, i).toFixed(2)).join(' ')}`);
      check(rows.length >= 990 && h.length === 1000, 'A one full 1000-character lifetime recorded');
      check(tableConsistent(rows) === 0, 'A history table consistent (green = predicted equals actual; actual = next input)');
      check(frac(rows) >= 0.55, `A green fraction over the lifetime >= 0.55 (${frac(rows).toFixed(3)})`);
      check(frac(rows.slice(-100)) >= 0.6, `A last-100 green >= 0.60 (${frac(rows.slice(-100)).toFixed(3)})`);
      check(q(h, 3) > q(h, 0) + 0.15, 'A accuracy improves over the lifetime (last quarter > first quarter + 0.15)');
      const pn = await p.evaluate(() => window.__panel || {});
      console.log('     E panels: ' + JSON.stringify({ ...pn, curveBad: (pn.curveBad || []).slice(0, 3), lineBad: (pn.lineBad || []).slice(0, 3) }));
      check(pn.bars > 0, `E output-spike bars drew nonzero spikes during the lifetime (max ${pn.bars} per read window)`);
      check(pn.out > 0, `E spike raster: output band has lit pixels (max ${pn.out})`);
      check(pn.curveOk > 20 && !pn.curveBad.length, `E learning curve: ceil(n/bin) points, weighted mean = accuracy (${pn.curveOk} samples, ${pn.curveBad.length} bad)`);
      check(pn.tabOk > 20 && !pn.tabBad.length, `E history table: rows input / prediction, each prediction under the input it predicted, green = prediction equals the input above, first column blank (${pn.tabOk} frames ok, ${pn.tabBad.length} bad)`);
      check(pn.lineOk > 20 && pn.lineBad.length <= 0.05 * pn.lineOk, `E status line 'accuracy N%' matches the task after 100 symbols (${pn.lineOk} ok, ${pn.lineBad.length} off by > 1.5 points: one-frame lag)`);
      // the fitness chart while generation 0 is being evaluated
      await p.evaluate(() => clearInterval(window.__poll)); await p.click('#btnRun'); await sleep(20000);
      const ch = await p.evaluate(() => { const c = document.getElementById('chart'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let blue = 0, track = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i] < 120 && d[i + 2] > 200 && d[i + 1] > 150) blue++; if (d[i] === 43 && d[i + 1] === 48 && d[i + 2] === 56) track++; } return { blue, track, gen: __arena.evo.gen, hist: __arena.evo.history.length, prog: __arena.evo.progress() }; });
      check(ch.hist > 0 || (ch.track > 0 && (ch.blue > 0) === (ch.prog >= 0.004)), `E fitness chart shows generation-0 progress while evolving (progress ${(ch.prog * 100).toFixed(1)}%, bar ${ch.blue} px, track ${ch.track} px)`);
      check(!errs.length, 'A/E no page errors ' + errs.join(' | ')); await p.close(); }
    // ---- B + C: an older saved session ----
    { const { p, errs } = await open(b, OLD);
      const m0 = await msg(p), vis = await p.$eval('#btnRestorePrev', e => !e.hidden);
      check(!/^Restored/.test(m0) && vis && /Restore previous session/.test(m0), 'B old session not restored silently, Restore button shown');
      await chooseText(p); await p.select('#selSpeed', '10'); await record(p);
      const t0 = Date.now(); while (Date.now() - t0 < 90000 && (await p.evaluate(() => window.__rows.length)) < 300) await sleep(2000);
      const rows = (await p.evaluate(() => window.__rows)).slice(0, 300);
      check(frac(rows) >= 0.4, `B Text after an old session: green over 300 chars >= 0.40 (${frac(rows).toFixed(3)})`);
      await p.evaluate(() => clearInterval(window.__poll));
      await p.click('#btnRestorePrev'); await sleep(2500);
      const c1 = await p.evaluate(() => ({ gen: __arena.evo.gen, env: SpikingArena.params.env, src: SpikingArena.currentEnv().P.source }));
      check(/Restored the previous session/.test(await msg(p)) && c1.gen === 1 && c1.src === 'cycle', `C Restore previous session: gen ${c1.gen}, source ${c1.src}`);
      await p.evaluate(() => document.getElementById('btnRecommended').click()); await sleep(2500);
      const c2 = await p.evaluate(() => ({ gen: __arena.evo.gen, plan: SpikingArena.defaultPlanId(SpikingArena.currentEnv()), lbl: __arena.watch.genome.label, def: SpikingArena.planFor('env').make().label }));
      check(c2.gen === 0 && c2.lbl === c2.def && await p.$eval('#btnRestorePrev', e => !e.hidden), `C Reset to recommended settings: gen 0, watching the default plan ${c2.plan}, Restore button shown`);
      check(!errs.length, 'B/C no page errors ' + errs.join(' | ')); await p.close(); }
    // ---- D: the text stub entry ----
    { const { p, errs } = await open(b); await p.select('#selEnv', 'text'); await sleep(2500);
      const d = await p.evaluate(() => ({ env: SpikingArena.params.env, P: SpikingArena.currentEnv().P, plan: SpikingArena.defaultPlanId(SpikingArena.currentEnv()) }));
      check(d.env === 'seq' && d.P.source === 'text' && d.plan === 'predictK3', `D text entry -> ${d.env}/${d.P.source}, plan ${d.plan}`);
      check(!errs.length, 'D no page errors ' + errs.join(' | ')); await p.close(); }
    // ---- F (v20): the bandit env and the reward-only cue mode ----
    { const { p, errs } = await open(b); await p.select('#selEnv', 'bandit'); await sleep(2500); await p.select('#selSpeed', '10');
      const f0 = await p.evaluate(() => ({ plan: SpikingArena.defaultPlanId(SpikingArena.currentEnv()), crit: !!__arena.watch.net.crit, noise: !!__arena.watch.net.anList }));
      check(f0.plan === 'rewardK' && f0.crit && f0.noise, `F bandit: default plan ${f0.plan}, critic ${f0.crit}, action noise ${f0.noise}`);
      await p.evaluate(() => document.querySelector('[data-tab="tabAct"]').click()); await sleep(30000);
      const f1 = await p.evaluate(() => { const t = __arena.watch.task, n = __arena.watch.net, info = document.getElementById('learnInfo').textContent, st = document.getElementById('statline').textContent;
        const c = document.getElementById('learn'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let gold = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 140 && d[i + 1] > 170 && d[i + 2] > 190) gold++;
        return { trials: t.hits ? t.hits.length : 0, drawn: !!t.drawn, info: /critic .*value now/.test(info) && /critic value/.test(document.getElementById('learnNote').textContent), st: /best arm \d+%/.test(st), gold, v: n.value }; });
      console.log('     F bandit: ' + JSON.stringify(f1));
      check(f1.trials > 5 && f1.drawn && f1.st, `F bandit runs: ${f1.trials} trials, view drawn, status line shows 'best arm N%'`);
      check(f1.info && f1.gold > 0, `F Activity tab: critic line (value / last RPE) and the value trace (${f1.gold} px)`);
      await p.screenshot({ path: path.join(ROOT, 'screenshot_ui_bandit.png') });
      await p.select('#selEnv', 'cue'); await sleep(2000);
      await p.evaluate(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'random') && [...x.options].some(o => o.value === 'same')); s.value = 'random'; s.dispatchEvent(new Event('change')); });
      await sleep(2500);
      const f2 = await p.evaluate(() => ({ plan: SpikingArena.defaultPlanId(SpikingArena.currentEnv()), label: __arena.watch.genome.label, nIn: SpikingArena.currentEnv().spec.inputs.length, map: !!__arena.watch.task.map }));
      check(f2.plan === 'rewardMemK' && /memory columns/.test(f2.label) && f2.nIn === 12 && f2.map, `F cue, random mapping: plan ${f2.plan}, ${f2.nIn} inputs (broadcast GO), hidden mapping drawn`);
      check(!errs.length, 'F no page errors ' + errs.join(' | ')); await p.close(); }
    // ---- G (v23): the Brain-tab network view keeps every neuron and synapse inside the canvas, for every default plan ----
    // (bug report: lines went off the bottom and came back; cause: the two-region text brain's context region lay outside the [-1, 1] mapping)
    { const { p, errs } = await open(b);
      for (const env of ['bug', 'cue', 'bandit', 'text']) {
        if (env === 'text') await chooseText(p); else { await p.select('#selEnv', env); await sleep(1500); }
        await p.click('button[data-tab="tabBrain"]'); await sleep(2000);
        const r = await p.evaluate(() => { const { pos, edges, W, H, N } = __arena.brainView, inC = q => q && isFinite(q[0]) && isFinite(q[1]) && q[0] >= 0 && q[0] <= W && q[1] >= 0 && q[1] <= H;
          let nodesOut = 0, edgesOut = 0, badIdx = 0; for (let i = 0; i < N; i++) if (!inC(pos[i])) nodesOut++;
          for (const [a, c] of edges) { if (a >= N || c >= N) badIdx++; else if (!inC(pos[a]) || !inC(pos[c])) edgesOut++; }
          return { plan: SpikingArena.defaultPlanId(SpikingArena.currentEnv()), N, posN: pos.length, edges: edges.length, nodesOut, edgesOut, badIdx }; });
        check(r.posN === r.N && r.edges > 0 && !r.nodesOut && !r.edgesOut && !r.badIdx, `G Brain view ${env} (${r.plan}, ${r.N} neurons, ${r.edges} synapses): all nodes and edge endpoints inside the canvas (out ${r.nodesOut}/${r.edgesOut}, bad index ${r.badIdx})`);
      }
      check(!errs.length, 'G no page errors ' + errs.join(' | ')); await p.close(); }
    // ---- H (v24): fast mode ----
    { const { p, errs } = await open(b);
      await p.evaluate(() => { window.__cv = 0; const C = CanvasRenderingContext2D.prototype;
        for (const k of ['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'drawImage', 'putImageData', 'fillText']) { const f = C[k]; C[k] = function () { window.__cv++; return f.apply(this, arguments); }; } });
      for (const env of ['seq', 'bandit']) {
        await p.select('#selEnv', env); await sleep(2000);
        await p.evaluate(() => { document.getElementById('chkFastMode').click(); }); await sleep(600);
        const w0 = await p.evaluate(() => { window.__w = __arena.watch; window.__cv = 0; return { t: __arena.watch.task.t, prog: document.getElementById('fpProg').textContent, fast: document.body.classList.contains('fast') }; });
        await sleep(1500);
        const w1 = await p.evaluate(() => ({ same: window.__w === __arena.watch || __arena.lifeLog.list.length > 0, cv: window.__cv, prog: document.getElementById('fpProg').textContent, acc: document.getElementById('fpAcc').textContent, rate: __arena.rates.watch,
          hidden: getComputedStyle(document.getElementById('brain')).display === 'none' || getComputedStyle(document.querySelector('.colR')).display === 'none' }));
        if (env === 'seq') { const ft = await p.evaluate(() => { const r = document.querySelector('#fastPanel .seqrow'); if (!r) return null; const ins = [...r.querySelectorAll('span.in')].map(x => x.textContent.trim()), pr = [...r.querySelectorAll('span.ok, span.bad, span.none')];
            return { n: ins.length, first: pr[0] && pr[0].className, bad: pr.slice(1).filter((x, j) => (x.className === 'ok') !== (x.textContent.trim() === ins[j + 1])).length, aligned: pr.length === ins.length, rows: r.textContent.split('\n').map(l => l.trim().split(/\s+/)[0]) }; });
          check(ft && ft.n > 5 && ft.aligned && ft.first === 'none' && ft.bad === 0 && ft.rows.join() === 'input,prediction', `H seq fast panel: rows ${ft && ft.rows.join(' / ')}, ${ft && ft.n} aligned columns, first prediction blank, green = prediction equals the input above (${ft && ft.bad} wrong colours)`); }
        check(w0.fast && w1.cv === 0 && w1.hidden && w1.prog !== w0.prog, `H ${env} fast mode: ${w1.cv} canvas calls in 1.5 s, panels hidden, results panel updates (${w0.prog} -> ${w1.prog}; ${w1.acc}; ${w1.rate | 0} ticks/s)`);
        // switch back and forth mid-lifetime: the same brain keeps running
        const s0 = await p.evaluate(() => { const w = __arena.watch; window.__g0 = w.genome; document.getElementById('chkFastMode').click(); return { t: w.task.t, done: w.done }; }); await sleep(800);
        const s1 = await p.evaluate(() => { const w = window.__w2 = __arena.watch, fast = document.body.classList.contains('fast'); document.getElementById('chkFastMode').click(); return { t: w.task.t, fast }; }); await sleep(800);
        const s2 = await p.evaluate(() => ({ genome: window.__g0 === __arena.watch.genome, same: window.__w2 === __arena.watch, t: __arena.watch.task.t, fast: document.body.classList.contains('fast') }));
        check(!s1.fast && s2.fast && s2.genome && (s2.same ? s2.t > s1.t : true) && s1.t > 0, `H ${env} switching modes mid-run keeps the brain (same genome; tick ${s0.t} -> ${s1.t} -> ${s2.t}${s2.same ? '' : ', a lifetime ended meanwhile'})`);
        // wait for two finished lifetimes; compare with Node (same default-plan genome, same seed)
        await p.waitForFunction(() => __arena.lifeLog.list.length >= 2, { timeout: 180000, polling: 500 });
        const L = await p.evaluate(() => ({ list: __arena.lifeLog.list.slice(0, 2), P: SpikingArena.currentEnv().P, unmutated: !__arena.evo.champion && __arena.evo.gen === 0 }));
        const SA = SAnode(); SA.setEnv(env, L.P); const g = SA.planFor('env').make();
        const node = L.list.map(e => { const a = SA.runEpisode(g, e.seed); const t = a.task; return t.optRate != null ? t.optRate : t.accuracy; });
        check(L.unmutated && L.list.every((e, i) => Math.abs(e.v - node[i]) < 1e-12), `H ${env} fast-mode lifetimes equal Node runs (browser ${L.list.map(e => e.v.toFixed(4)).join(', ')} vs node ${node.map(v => v.toFixed(4)).join(', ')})`);
        await p.evaluate(() => document.getElementById('chkFastMode').click()); await sleep(300);
      }
      await p.evaluate(() => document.getElementById('chkFastMode').click()); await p.reload(); await sleep(1500);
      const rem = await p.evaluate(() => ({ chk: document.getElementById('chkFastMode').checked, fast: document.body.classList.contains('fast'), tip: document.getElementById('lblFastMode').title.length }));
      check(rem.chk && rem.fast && rem.tip > 40, 'H fast mode is remembered after a reload and has a tooltip');
      await p.evaluate(() => document.getElementById('chkFastMode').click());
      check(!errs.length, 'H no page errors ' + errs.join(' | ')); await p.close(); }
  } finally { await b.close(); }
  console.log(fails ? `${fails} FAILED` : 'BROWSER TEST: ALL OK'); process.exit(fails ? 1 : 0);
})();
