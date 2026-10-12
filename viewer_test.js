/* viewer_test.js (v18, round 19): headless-Chrome test of the growth viewer (viewer.html) and the Development tab.
 *   node viewer_test.js     (puppeteer-core + Chrome; PUPPETEER=, CHROME= as in browser_test.js; SHOTS=dir saves screenshots)
 * For the default plan of every environment (bug v3h, cue memoryK, recall memoryK, seq text predictK2XO):
 *   no page errors; the recording covers growth + post-growth stages; draw time of the tissue view (first / cached / scrub);
 *   timeline scrub (slider input) changes the frame and the stage label; mouse-wheel zoom, drag pan, double-click fit;
 *   hover shows a tooltip; clicking a cell opens its inspector and highlights it; wiring view: clicking a population
 *   node opens its inspector; Run brain produces population firing rates.
 * Index: the Development tab draws, and "Open growth viewer" hands the watched brain to viewer.html (#arena). */
const path = require('path'), fs = require('fs');
const puppeteer = require(process.env.PUPPETEER || (() => { try { return require.resolve('puppeteer-core'); } catch (e) { return '/tmp/pt/node_modules/puppeteer-core'; } })());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = __dirname, SHOTS = process.env.SHOTS || '';
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
async function page(b, url) {
  const p = await b.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('dialog', d => d.accept());
  await p.setViewport({ width: 1500, height: 900, deviceScaleFactor: 2 }); await p.goto(url); return { p, errs };
}
const ready = p => p.waitForFunction(() => window.__viewer && window.__viewer.st.model && document.getElementById('busy').style.display === 'none', { timeout: 120000 });
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 600000 });
  try {
    for (const [src, plan] of [['bug', 'v3h'], ['cue', 'memoryK'], ['recall', 'memoryK'], ['seq:text', 'predictK3']]) {
      const { p, errs } = await page(b, 'file://' + path.join(ROOT, 'viewer.html') + '#src=' + src); await ready(p);
      await p.evaluate(() => { document.getElementById('help').style.display = 'none'; });
      const info = await p.evaluate(() => { const v = window.__viewer, m = v.st.model; return { TT: m.TT, T: m.T, cells: m.cells.length, syn: m.syn.n, pops: m.pops.length, N: m.N, plan: SpikingArena.defaultPlanId(SpikingArena.currentEnv()) }; });
      check(info.plan === plan && info.TT === info.T + 7 && info.cells > 0 && info.syn > 0 && info.pops >= 3, `${src}: plan ${info.plan}, ${info.cells} cells, ${info.syn} synapse records, ${info.pops} populations, timeline ${info.TT} frames`);
      // draw timings (forced redraws)
      // (each timing is flushed with a 1-pixel read-back, so it includes the rasterization)
      const tm = await p.evaluate(() => { const v = window.__viewer, tv = v.tv, flush = () => tv.ctx.getImageData(0, 0, 1, 1), t = []; for (const f of [0, 20, v.st.model.TT - 1]) { v.setFrame(f); tv.draw(true); flush(); const t0 = performance.now(); tv.baseKey = null; tv.draw(true); flush(); t.push(performance.now() - t0); }
        let t0 = performance.now(); tv.draw(); const idle = performance.now() - t0; t0 = performance.now(); tv.hover = { kind: 'in', i: 0, key: 'i0' }; tv.draw(true); flush(); const hov = performance.now() - t0; tv.hover = null; return { t, idle, hov }; });
      console.log(`     draw ms (DPR 2, flushed): frame 0 ${tm.t[0].toFixed(1)}, frame 20 ${tm.t[1].toFixed(1)}, final ${tm.t[2].toFixed(1)}; hover only ${tm.hov.toFixed(1)}; unchanged ${tm.idle.toFixed(2)}`);
      check(Math.max(...tm.t) < 300 && tm.idle < 2 && tm.hov < 30, `${src}: tissue view draws in < 300 ms (hover-only redraw ${tm.hov.toFixed(1)} ms), nothing redrawn when unchanged`);
      // scrub the timeline like a user (slider input event)
      const sc = await p.evaluate(async () => { const s = document.getElementById('tlSlider'), out = [];
        for (const v of [5, 22.4, 40, 43, 46]) { s.value = v; s.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 40)); out.push([window.__viewer.tv.f, document.getElementById('stageLbl').textContent]); } return out; });
      check(sc[0][0] === 5 && Math.floor(sc[1][0]) === 22 && /selection/.test(sc[2][1]) && /juvenile/.test(sc[3][1]) && /final/.test(sc[4][1]), `${src}: scrubbing moves the frame and the stage label (${sc.map(x => x[1].slice(0, 18)).join(' | ')})`);
      // play for a moment from frame 10
      await p.evaluate(() => { window.__viewer.setFrame(10); window.__viewer.setPlay(true); }); await sleep(600);
      const pf = await p.evaluate(() => { const f = window.__viewer.st.frame; window.__viewer.setPlay(false); return f; });
      check(pf > 11 && pf < 20, `${src}: play advances the timeline (frame 10 -> ${pf.toFixed(1)} in 0.6 s)`);
      // zoom with the wheel, pan by dragging, fit by double-click
      const box = await (await p.$('#cvTissue')).boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const k0 = await p.evaluate(() => window.__viewer.tv.k);
      await p.mouse.move(cx, cy); await p.mouse.wheel({ deltaY: -600 }); await sleep(100);
      const k1 = await p.evaluate(() => window.__viewer.tv.k);
      const o0 = await p.evaluate(() => [window.__viewer.tv.ox, window.__viewer.tv.oy]);
      await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 80, cy + 40, { steps: 5 }); await p.mouse.up(); await sleep(100);
      const o1 = await p.evaluate(() => [window.__viewer.tv.ox, window.__viewer.tv.oy]);
      check(k1 > k0 * 1.5 && Math.abs(o1[0] - o0[0] - 80) < 2 && Math.abs(o1[1] - o0[1] - 40) < 2, `${src}: wheel zoom ×${(k1 / k0).toFixed(2)}, drag pans by (80, 40)`);
      await p.mouse.click(cx, cy, { clickCount: 2 }); await sleep(100);
      check(Math.abs(await p.evaluate(() => window.__viewer.tv.k) - k0) < 1e-6, `${src}: double-click fits the view again`);
      // click a cell at the final frame: the hidden neuron nearest to the centre of the tissue
      await p.evaluate(() => { window.__viewer.setFrame(window.__viewer.st.model.TT - 1); window.__viewer.tv.select(null); });
      const tgt = await p.evaluate(() => { const v = window.__viewer, m = v.st.model, tv = v.tv, f = m.TT - 1; let best = null, bd = 1e9;
        for (const c of m.cells) { if (!(c.moves.length && f >= c.from && f < c.to) || c.node < 0) continue; const [x, y] = SpikingArena.devCellPos(c, f), px = tv.sx((1 - y) / 2), py = tv.sy((x + 1) / 2), d = Math.hypot(px - tv.W / 2, py - tv.H / 2); if (d < bd) { bd = d; best = { id: c.id, px, py }; } } return best; });
      await p.mouse.move(box.x + tgt.px, box.y + tgt.py); await sleep(150);
      const tipOn = await p.evaluate(() => document.getElementById('tip').style.display === 'block' && /cell #/.test(document.getElementById('tip').textContent));
      await p.mouse.click(box.x + tgt.px, box.y + tgt.py); await sleep(200);
      const ins = await p.evaluate(() => ({ sel: window.__viewer.tv.sel, h: document.querySelector('#insBody h3') ? document.querySelector('#insBody h3').textContent : '', txt: document.getElementById('insBody').textContent, heat: !!document.querySelector('#insBody canvas.ins-heat') }));
      check(tipOn && ins.sel && ins.sel.id === tgt.id && ins.h.includes('#' + tgt.id) && /threshold/.test(ins.txt) && /lineage/.test(ins.txt) && ins.heat, `${src}: hover tooltip + click opens the inspector of cell #${tgt.id} (${ins.h})`);
      if (SHOTS && src === 'seq:text') { await p.evaluate(() => { const v = window.__viewer; v.tv.select(null); v.setFrame(22); v.tv.fit(); v.tv.zoomAt(v.tv.W * 0.5, v.tv.H * 0.5, 1.25); }); await p.mouse.move(2, 2); await sleep(300); await p.screenshot({ path: path.join(SHOTS, 'screenshot_viewer_growth.png') }); }
      if (SHOTS && src === 'bug') { await p.evaluate(() => { window.__viewer.setFrame(18); window.__viewer.tv.selectCell(window.__viewer.tv.sel.id); document.getElementById('selColor').value = 'fate'; document.getElementById('selColor').dispatchEvent(new Event('change')); }); await sleep(300); await p.screenshot({ path: path.join(SHOTS, 'screenshot_viewer_growth_bug.png') }); }
      // wiring view: click the largest hidden population
      await p.click('#tabWiring'); await sleep(200);
      const wb = await (await p.$('#cvWiring')).boundingBox();
      const node = await p.evaluate(() => { const v = window.__viewer, m = v.st.wmodel, w = v.wv; w.draw(true); const pop = m.pops.filter(q => q.kind === 'hid').sort((a, b) => b.nodes.length - a.nodes.length)[0]; return { id: pop.id, px: w.sx(pop.wx), py: w.sy(pop.wy) }; });
      await p.mouse.click(wb.x + node.px, wb.y + node.py); await sleep(200);
      const wi = await p.evaluate(() => ({ sel: window.__viewer.wv.sel, h: document.querySelector('#insBody h3') ? document.querySelector('#insBody h3').textContent : '' }));
      check(wi.sel === node.id && /Population/.test(wi.h), `${src}: wiring diagram click selects population (${wi.h})`);
      if (src === 'seq:text') {   // v21: multi-region brain (cortex + context): region selector, wiring grouped by region
        const rg = await p.evaluate(() => { const v = window.__viewer, w = v.st.wmodel, sel = document.getElementById('selRegion'), out = { vis: document.getElementById('regionBox').style.display !== 'none', n: sel.options.length, regions: w.regions.length, cross: w.popEdges.filter(e => w.pops[e.a].region != null && w.pops[e.b].region != null && w.pops[e.a].region !== w.pops[e.b].region).length };
          const N0 = v.st.model.N; sel.value = '1'; sel.dispatchEvent(new Event('change')); out.switched = v.st.model.N !== N0 && v.st.region === 1; sel.value = String(w.outRegion); sel.dispatchEvent(new Event('change')); return out; });
        const un = await p.evaluate(() => { const S = window.SpikingArena, U = S.UNIFIED_PL, same = pl => Object.keys(U).every(k => pl[k] === U[k]); return { brain: window.__viewer.st.brain.pl.uni === 1, plans: same(S.PLANS.predictK3.make().regions[0].g.pl) && same(S.PLANS.rewardK.make().pl) && same(S.PLANS.rewardMemK.make().pl) }; });
        check(un.brain && un.plans, `${src}: the grown brain and the default plans (predictK3, rewardK, rewardMemK) use the unified learning rule (v22)`);
        check(rg.vis && rg.n === 2 && rg.regions === 2 && rg.cross > 0 && rg.switched, `${src}: 2 regions (selector switches the tissue), ${rg.cross} tract links between regions in the wiring diagram`); }
      // live activity
      await p.click('#btnRun'); await sleep(1500);
      const run = await p.evaluate(() => { const r = window.__viewer.st.run; return r ? { ticks: r.ticks, rate: Array.from(r.rates).reduce((a, x) => a + x, 0) } : null; });
      if (SHOTS && src === 'seq:text') { await p.evaluate(() => { const v = window.__viewer; v.wv.sel = null; v.wv.dirty = true; v.showInspectorNull && 0; }); await sleep(400); await p.screenshot({ path: path.join(SHOTS, 'screenshot_viewer_wiring.png') }); }
      await p.click('#btnRun');
      check(run && run.ticks > 5 && run.rate > 0, `${src}: Run brain: ${run && run.ticks} ticks, summed population rate ${run && run.rate.toFixed(4)}`);
      check(!errs.length, `${src}: no page errors ${errs.join(' | ')}`);
      await p.close();
    }
    // index: the Development tab + hand-off to the viewer
    { const { p, errs } = await page(b, 'file://' + path.join(ROOT, 'index.html'));
      await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(800);
      await p.click('button[data-tab="tabDev"]'); await sleep(2500);
      const d = await p.evaluate(() => ({ info: document.getElementById('devInfo').textContent, w: document.getElementById('devCanvas').width }));
      check(/cells alive/.test(d.info) && d.w > 400, `index Development tab: ${d.info.slice(0, 90)}…`);
      // v23: compact Development tab: Play/Replay + slider + one viewer button; the animation plays once by itself; plan buttons live in Settings
      const dv = await p.evaluate(async () => { const t = document.getElementById('tabDev'), btns = [...t.querySelectorAll('button')].map(x => x.id), f0 = +document.getElementById('devSlider').value;
        await new Promise(r => setTimeout(r, 1500)); const f1 = +document.getElementById('devSlider').value;
        return { btns, sel: t.querySelectorAll('select').length, f0, f1, plans: !document.getElementById('planBtns'), tips: [...t.querySelectorAll('button, input')].every(x => x.title) }; });
      check(dv.btns.join() === 'devPlay,devViewer' && dv.sel === 0 && dv.f1 > dv.f0 && dv.plans && dv.tips, `index Development tab is compact (buttons ${dv.btns.join(', ')}; auto-plays ${dv.f0.toFixed(1)} -> ${dv.f1.toFixed(1)}; no plan buttons; tooltips)`);
      // v23 (standing UI principle): the Settings drawer holds only a few playable variables, each with a tooltip
      const dr = await p.evaluate(() => { const vis = x => !x.hidden && x.offsetParent !== null || x.closest('details');
        const ctl = [...document.querySelectorAll('#drawer input, #drawer select, #drawer button')].filter(x => !x.hidden && x.type !== 'file');
        return { n: ctl.length, untitled: ctl.filter(x => !x.title && !(x.closest('label') || {}).title).map(x => x.id || x.textContent), gone: ['sl_dev', 'sl_learn', 'secDev', 'secLearn'].every(id => !document.getElementById(id)),
          labels: [...document.querySelectorAll('#drawer label')].map(l => l.textContent.trim().slice(0, 30)) }; });
      check(dr.gone && dr.n <= 16 && !dr.untitled.length, `index Settings drawer is minimal (${dr.n} controls: ${dr.labels.join(' | ')}; untitled: ${dr.untitled.join(', ') || 'none'})`);
      const before = new Set((await b.pages()));
      await p.click('#devViewer'); await sleep(1500);
      const vp = (await b.pages()).find(x => !before.has(x) && /viewer\.html/.test(x.url()));
      check(!!vp, 'index: Open growth viewer opens viewer.html#arena');
      if (vp) { const verrs = []; vp.on('pageerror', e => verrs.push(e.message)); await ready(vp);
        const s = await vp.evaluate(() => ({ src: window.__viewer.st.src, label: window.__viewer.st.label, N: window.__viewer.st.model.N }));
        const wN = await p.evaluate(() => __arena.watch.brain.N);
        check(s.src === 'arena' && s.N === wN, `viewer shows the arena's watched brain (${s.label}, ${s.N} neurons = arena ${wN})`); await vp.close(); }
      check(!errs.length, 'index: no page errors ' + errs.join(' | ')); await p.close(); }
  } finally { await b.close(); }
  console.log(fails ? `${fails} FAILED` : 'VIEWER TEST: ALL OK'); process.exit(fails ? 1 : 0);
})();
