/* Explore: #patterns. The browser grows a small version of the current best design (the manifest's
 * text.liveVariant: same genes and settings, fewer granule cells) and watches a repeating pattern.
 * The brain grows and runs in a Web Worker (this same file), so the page stays smooth.
 * Page side: ExploreDemos.patterns = {show, hide}. Worker side: importScripts(engine), grow, run, post steps. */
(function () {
  'use strict';
  var PATTERNS = [
    { source: 'cycle', K: 6, n: 200, name: 'A simple loop', tip: 'six colours always in the same order' },
    { source: 'order2', K: 6, n: 300, name: 'A two-step rule', tip: 'what comes next depends on the last two colours' },
    { source: 'order3', K: 8, n: 400, name: 'A three-step rule', tip: 'what comes next depends on the colour three steps back' },
  ];

  /* ---------------- worker ---------------- */
  if (typeof document === 'undefined') {
    self.onmessage = function (ev) {
      var m = ev.data;
      try {
        importScripts(m.engine);
        var SA = self.SpikingArena;
        var plan = SA.PLANS[m.plan] ? m.plan : 'deepURSx3';
        var gc = SA.genomeToCompact(SA.PLANS[plan].make());
        var cells = gc.kind === 'regions' ? gc.cell.regions.map(function (r) { return r.g; }) : [gc.cell];
        (m.variant || '').split(',').forEach(function (kv) {
          if (!kv) return; var a = kv.split('='), key = a[0], v = +a[1], ks = key.split('@'), sf = ks[0].split('.'), sel = ks[1];
          if (!isFinite(v) || sf.length !== 2) return;
          if (sf[0] === 'P') { SA.params[sf[1]] = v; return; }
          var target = cells;
          if (sel && gc.kind === 'regions') target = gc.cell.regions.map(function (r, i) { return [r, cells[i]]; })
            .filter(function (x) { return x[0].name === sel || x[0].name.indexOf(sel + ' ') === 0; }).map(function (x) { return x[1]; });
          target.forEach(function (c) { if (c[sf[0]]) c[sf[0]][sf[1]] = v; });
        });
        var given = { source: m.source, K: m.K, nSyms: m.n, clock2: true, clock3: true, readIn: 0.01 };
        SA.setEnv('seq', Object.assign(SA.recommendedEnvParams('seq', given, Object.keys(given)), given));
        var env = SA.currentEnv(), g = SA.genomeFromCompact(gc), t0 = Date.now();
        var brain = SA.growCell(g, { seed: m.seed, spec: env.spec });
        self.postMessage({ type: 'grown', N: brain.N, ms: Date.now() - t0 });
        var a = new SA.Agent(g, m.seed ^ 0x5bd1e995, brain, env), T = a.task, seen = 0, batch = [];
        while (!a.done) {
          a.tick();
          if (T.hits.length > seen) {
            seen = T.hits.length; var r = T.recent[T.recent.length - 1];
            batch.push([r[0], r[1], r[2] ? 1 : 0, r[3]]);
            if (batch.length >= 10) { self.postMessage({ type: 'steps', steps: batch }); batch = []; }
          }
        }
        if (batch.length) self.postMessage({ type: 'steps', steps: batch });
        self.postMessage({ type: 'done', acc: T.accuracy });
      } catch (e) { self.postMessage({ type: 'error', message: String(e && e.message || e) }); }
    };
    return;
  }

  /* ---------------- page ---------------- */
  var site = window.ExploreSite || {}, me = document.currentScript && document.currentScript.src;
  var COL = ['#69e2b1', '#65c7f2', '#ffca76', '#b5a4ff', '#ff818a', '#f0e68c', '#7fd3c3', '#e59ee0'];
  var st = { worker: null, which: -1, steps: [], shown: 0, raf: 0, last: 0, grown: null, done: false, design: null };
  var stage = function () { return document.querySelector('[data-stage="patterns"]'); };
  var btn = function () { return document.querySelector('[data-play="patterns"]'); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var style = document.createElement('style');
  style.textContent = '.lv-top{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:baseline;margin:0 0 10px}.lv-top h3{margin:0;font:600 16px var(--display)}.lv-top span{color:var(--muted);font-size:13px}'
    + '.lv-canvas{display:block;width:100%;height:auto;max-height:calc(100vh - 240px);object-fit:contain;background:#0b1218;border:1px solid var(--line);border-radius:10px}.lv-status{font:12px var(--mono);color:var(--mint);margin:8px 0 0}'
    + '.lv-note{font-size:12.5px;color:var(--muted);margin:6px 0 0}';
  document.head.appendChild(style);

  function stop() { if (st.worker) { st.worker.terminate(); st.worker = null; } cancelAnimationFrame(st.raf); st.raf = 0; }
  function design() {
    if (st.design) return Promise.resolve(st.design);
    return fetch(site.design, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (d) { st.design = d || {}; return st.design; });
  }
  function begin() {
    stop();
    st.which = (st.which + 1) % PATTERNS.length; st.steps = []; st.shown = 0; st.grown = null; st.done = false;
    var p = PATTERNS[st.which], s = stage(); s.innerHTML = '';
    var top = el('div', 'lv-top'); top.appendChild(el('h3', null, p.name)); top.appendChild(el('span', null, p.tip)); s.appendChild(top);
    var cv = el('canvas', 'lv-canvas'); cv.width = 1100; cv.height = 330; cv.setAttribute('aria-label', 'The pattern and the brain\'s guesses'); s.appendChild(cv);
    var status = el('p', 'lv-status', 'Growing a small brain in your browser. This takes about 10 seconds…'); status.setAttribute('role', 'status'); s.appendChild(status);
    s.appendChild(el('p', 'lv-note', 'Top: the pattern. Bottom: its guess before each colour arrives (ring = right, cross = wrong).'));
    st.cv = cv; st.status = status;
    btn().textContent = 'Next pattern';
    design().then(function (d) {
      var text = d && d.text ? d.text : {};
      st.worker = new Worker(me);
      st.worker.onmessage = function (e) {
        var m = e.data;
        if (m.type === 'grown') { st.grown = m; st.status.textContent = 'Grown: ' + m.N.toLocaleString() + ' neurons. Now it watches the pattern…'; }
        else if (m.type === 'steps') st.steps = st.steps.concat(m.steps);
        else if (m.type === 'done') st.done = true;
        else if (m.type === 'error') st.status.textContent = 'This demo could not run in this browser.';
      };
      st.worker.onerror = function () { st.status.textContent = 'This demo could not run in this browser.'; };
      st.worker.postMessage({ engine: new URL(site.engine, location.href).href, plan: text.plan || 'deepURSx3', variant: text.liveVariant || 'P.granN=4000',
        source: p.source, K: p.K, n: p.n, seed: (Math.random() * 0x7fffffff) | 0 });
      st.last = performance.now(); st.raf = requestAnimationFrame(frame);
    });
  }
  function frame(now) {
    st.raf = requestAnimationFrame(frame);
    var rate = st.shown < 40 ? 6 : st.shown < 120 ? 12 : 24;   // steps per second: slow at first, then faster
    var want = Math.min(st.steps.length, st.shown + Math.floor((now - st.last) * rate / 1000));
    if (want > st.shown) { st.shown = want; st.last = now; } else if (st.shown >= st.steps.length) st.last = now;
    draw();
  }
  function draw() {
    var cv = st.cv, g = cv.getContext('2d'), W = cv.width, H = cv.height, p = PATTERNS[st.which];
    g.clearRect(0, 0, W, H);
    var shown = st.steps.slice(0, st.shown), r = 15, step = 38, n = Math.floor((W - 60) / step), from = Math.max(0, shown.length - n);
    g.font = '12px "DM Sans", system-ui, sans-serif'; g.fillStyle = '#8b9baa'; g.textAlign = 'left';
    g.fillText('pattern', 12, 60); g.fillText('guess', 12, 128);
    for (var i = from; i < shown.length; i++) {
      var s = shown[i], x = 70 + (i - from) * step;
      g.fillStyle = COL[s[3] % COL.length]; g.beginPath(); g.arc(x, 56, r, 0, 7); g.fill();
      g.fillStyle = COL[s[1] % COL.length]; g.globalAlpha = 0.85; g.beginPath(); g.arc(x, 124, r - 3, 0, 7); g.fill(); g.globalAlpha = 1;
      g.lineWidth = 2.5;
      if (s[2]) { g.strokeStyle = '#e6edf3'; g.beginPath(); g.arc(x, 124, r + 2, 0, 7); g.stroke(); }
      else { g.strokeStyle = '#ff818a'; g.beginPath(); g.moveTo(x - 7, 148); g.lineTo(x + 7, 162); g.moveTo(x + 7, 148); g.lineTo(x - 7, 162); g.stroke(); }
    }
    // rolling accuracy over the last 20 guesses
    var L = 70, B = H - 24, top = 190, w = W - L - 30;
    g.strokeStyle = '#202d39'; g.lineWidth = 1; [0, 0.5, 1].forEach(function (v) { var y = B - v * (B - top); g.beginPath(); g.moveTo(L, y); g.lineTo(L + w, y); g.stroke(); g.fillStyle = '#8b9baa'; g.textAlign = 'right'; g.fillText(Math.round(v * 100) + '%', L - 8, y + 4); });
    g.textAlign = 'left'; g.fillStyle = '#8b9baa'; g.fillText('right in the last 20 guesses', L + 4, top - 8);
    var chance = 1 / p.K, yc = B - chance * (B - top); g.setLineDash([2, 4]); g.strokeStyle = '#8b9baa'; g.beginPath(); g.moveTo(L, yc); g.lineTo(L + w, yc); g.stroke(); g.setLineDash([]);
    g.fillText('guessing', L + w - 60, yc - 6);
    if (shown.length > 1) {
      g.strokeStyle = '#69e2b1'; g.lineWidth = 2.5; g.beginPath(); var sum = 0, last = 0;
      for (var j = 0; j < shown.length; j++) { sum += shown[j][2]; if (j >= 20) sum -= shown[j - 20][2]; var a = sum / Math.min(j + 1, 20), x2 = L + w * j / (p.n - 1), y2 = B - a * (B - top); if (j) g.lineTo(x2, y2); else g.moveTo(x2, y2); last = a; }
      g.stroke();
      if (st.grown) st.status.textContent = 'Grown: ' + st.grown.N.toLocaleString() + ' neurons · step ' + shown.length + ' of ' + p.n + ' · right in the last 20 guesses: ' + Math.round(100 * last) + '%' +
        (st.done && st.shown >= st.steps.length ? (st.which < PATTERNS.length - 1 ? ' · done. Press Next pattern for a harder one.' : ' · done. Press Next pattern to start again.') : '');
    }
  }
  window.ExploreDemos = window.ExploreDemos || {};
  window.ExploreDemos.patterns = {
    show: function () { var b = btn(); if (!b.dataset.wired) { b.dataset.wired = '1'; b.addEventListener('click', begin); } b.disabled = false; if (!st.cv) begin(); else if (!st.raf && st.steps.length) { st.last = performance.now(); st.raf = requestAnimationFrame(frame); } },
    hide: function () { cancelAnimationFrame(st.raf); st.raf = 0; },
  };
})();
