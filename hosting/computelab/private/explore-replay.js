/* Explore: demos that play back results recorded by the research runs (#read, #name, #copy).
 * Data: /explore/replay/<id>.json, named and checked by the top-design manifest (/explore/design.json).
 * Nothing here runs a brain; the numbers are exactly what the runs measured. */
(function () {
  'use strict';
  var site = window.ExploreSite || {}, cache = {};
  var C = { mint: '#69e2b1', red: '#ff818a', amber: '#ffca76', cyan: '#65c7f2', purple: '#b5a4ff', muted: '#8b9baa', line: '#202d39', text: '#e6edf3', panel: '#0d151d' };
  function getJson(url) {
    if (!cache[url]) cache[url] = fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    return cache[url];
  }
  function replay(id) { return getJson(site.replayBase + id + '.json?v=' + encodeURIComponent(site.version || '')); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pct(x) { return Math.round(100 * x) + '%'; }
  var css = '.rp-wrap{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px}.rp-text{font:17px/1.75 var(--mono);background:#0b1218;border:1px solid var(--line);border-radius:10px;padding:14px 16px;height:340px;overflow:auto;word-break:break-word;white-space:pre-wrap}'
    + '.rp-text .ok{color:var(--mint)}.rp-text .no{color:#ff818a;opacity:.75}.rp-text .cur{background:#65c7f233;border-radius:3px}'
    + '.rp-side{display:flex;flex-direction:column;gap:12px}.rp-card{background:#0b1218;border:1px solid var(--line);border-radius:10px;padding:12px 14px}.rp-card h4{margin:0 0 6px;font:600 13px var(--sans);color:var(--text)}'
    + '.rp-big{font:600 30px/1 var(--display);color:var(--mint)}.rp-big.alt{color:var(--cyan)}.rp-meter{height:8px;border-radius:5px;background:#18242f;margin:8px 0 4px;overflow:hidden}.rp-meter i{display:block;height:100%;width:0;border-radius:5px;background:var(--mint);transition:width .2s}'
    + '.rp-meter.alt i{background:var(--cyan)}.rp-note{font-size:12.5px;color:var(--muted);line-height:1.45;margin:0}.rp-legend{display:flex;gap:16px;font-size:12.5px;color:var(--muted);margin:0 0 8px}.rp-legend b{font-weight:600}'
    + '.rp-take{margin:12px 0 0;font-size:14px;line-height:1.5;color:#c3ced8;max-width:820px}.rp-ex{font:16px/1.7 var(--mono);background:#0b1218;border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:0 0 12px}'
    + '.rp-ex mark{background:#b5a4ff2e;color:var(--purple);border-radius:4px;padding:1px 3px}.rp-ex .gap{color:var(--muted)}.rp-canvas{display:block;width:100%;height:auto;background:#0b1218;border:1px solid var(--line);border-radius:10px}'
    + '@media(max-width:820px){.rp-wrap{grid-template-columns:1fr}.rp-text{height:260px;font-size:15px}}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  function button(id) { return document.querySelector('[data-play="' + id + '"]'); }
  function stage(id) { return document.querySelector('[data-stage="' + id + '"]'); }
  function fail(id) { stage(id).innerHTML = ''; stage(id).appendChild(el('p', 'quiet', 'The recorded run could not load. Refresh the page to try again.')); }

  /* ---------- #read: letter-by-letter guesses on a story it never trained on ---------- */
  var read = { timer: null, data: null };
  function readBuild(d) {
    var s = stage('read'); s.innerHTML = '';
    var lg = el('p', 'rp-legend'); lg.innerHTML = '<span><b style="color:#69e2b1">green</b> = guessed right before seeing it</span><span><b style="color:#ff818a">red</b> = guessed wrong</span>';
    s.appendChild(lg);
    var wrap = el('div', 'rp-wrap'), text = el('div', 'rp-text'), side = el('div', 'rp-side');
    text.setAttribute('aria-live', 'off');
    function card(title, cls, note) { var c = el('div', 'rp-card'); c.appendChild(el('h4', null, title)); var big = el('div', 'rp-big' + (cls ? ' ' + cls : ''), '–'); c.appendChild(big);
      var m = el('div', 'rp-meter' + (cls ? ' ' + cls : '')); var bar = el('i'); m.appendChild(bar); c.appendChild(m); c.appendChild(el('p', 'rp-note', note)); side.appendChild(c); return { big: big, bar: bar }; }
    read.me = card('This brain: letters right so far', '', 'The spiking brain, after one read of about 98,000 letters, learning as it goes.');
    if (d.compare) read.other = card('Classic 5-letter pattern counter', 'alt', 'A standard statistics method trained on the same text, for comparison.');
    wrap.appendChild(text); wrap.appendChild(side); s.appendChild(wrap);
    read.take = el('p', 'rp-take'); s.appendChild(read.take);
    read.text = text;
  }
  function readPlay() {
    var d = read.data; if (!d) return;
    clearInterval(read.timer); readBuild(d);
    var i = 0, right = 0, oRight = 0, n = d.text.length, cur = null;
    read.timer = setInterval(function () {
      for (var step = 0; step < 2 && i < n; step++, i++) {
        var ok = d.hits[i] === '1', ch = d.text[i];
        if (cur) cur.classList.remove('cur');
        cur = el('span', ok ? 'ok cur' : 'no cur', ch); read.text.appendChild(cur);
        if (ok) right++; if (d.compare && d.compare.hits[i] === '1') oRight++;
      }
      read.me.big.textContent = pct(right / i); read.me.bar.style.width = (100 * right / i) + '%';
      if (read.other) { read.other.big.textContent = pct(oRight / i); read.other.bar.style.width = (100 * oRight / i) + '%'; }
      read.text.scrollTop = read.text.scrollHeight;
      if (i >= n) {
        clearInterval(read.timer); read.timer = null; if (cur) cur.classList.remove('cur');
        read.take.textContent = 'Across all ' + n.toLocaleString() + ' letters it got ' + pct(d.acc) + ' right' + (d.compare ? ', about level with the pattern counter (' + pct(d.compare.acc) + ')' : '') +
          '. Once a word has started it gets ' + pct(d.words.restOfWord) + ' of the remaining letters, but only ' + pct(d.words.firstLetter) +
          ' of first letters: it knows spelling well, but has little idea which word comes next. Large AI language models get roughly three quarters or more of letters right.';
        button('read').textContent = 'Play again';
      }
    }, 40);
    button('read').textContent = 'Restart';
  }

  /* ---------- #name: a made-up name, seen once, recalled later ---------- */
  var name = { data: null, raf: 0 };
  function nameBuild(d) {
    var s = stage('name'); s.innerHTML = '';
    var nm = d.names[0] || 'kefefev';
    var ex = el('div', 'rp-ex'); ex.innerHTML = '<span class="quiet" style="font:12px var(--sans);display:block;margin-bottom:4px">How the test works (example)</span>'
      + 'there once was a girl named <mark>' + nm + '</mark><span class="gap"> … 5 to 127 letters of story … </span><mark>' + nm + '</mark> went home.';
    s.appendChild(ex);
    var cv = el('canvas', 'rp-canvas'); cv.width = 1100; cv.height = 340; cv.setAttribute('aria-label', 'Share of name letters guessed right the first and second time, by gap'); s.appendChild(cv);
    var tk = el('p', 'rp-take'); s.appendChild(tk);
    var meanSecond = d.learning.second.reduce(function (a, b) { return a + b; }, 0) / d.learning.second.length;
    var meanFirst = d.learning.first.reduce(function (a, b) { return a + b; }, 0) / d.learning.first.length;
    var meanFrozen = d.frozen.second.reduce(function (a, b) { return a + b; }, 0) / d.frozen.second.length;
    tk.textContent = 'The first time a name appears, the brain gets about ' + pct(meanFirst) + ' of its letters (after the first) right, since it has never seen it. The second time it gets about ' +
      pct(meanSecond) + ', even 127 letters later: it learned the name from one sighting. With learning switched off it stays near ' + pct(meanFrozen) +
      '. It does not yet get whole names exactly right. Measured on ' + d.namesPerGap + ' names per gap across ' + d.seeds.length + ' grown brains.';
    return cv;
  }
  function nameDraw(cv, d, t) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height, L = 70, R = 20, T = 40, B = 56, n = d.gaps.length, slot = (W - L - R) / n, bw = Math.min(54, slot / 3.2);
    g.clearRect(0, 0, W, H); g.font = '13px "DM Sans", system-ui, sans-serif';
    for (var y = 0; y <= 1.0001; y += 0.25) { var py = T + (1 - y) * (H - T - B); g.strokeStyle = C.line; g.beginPath(); g.moveTo(L, py); g.lineTo(W - R, py); g.stroke(); g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText(Math.round(y * 100) + '%', L - 10, py + 4); }
    g.textAlign = 'left'; g.fillStyle = '#5d6b78'; g.fillRect(L, 12, 12, 12); g.fillStyle = C.muted; g.fillText('First time it sees the name', L + 18, 22);
    g.fillStyle = C.mint; g.fillRect(L + 230, 12, 12, 12); g.fillStyle = C.muted; g.fillText('Second time', L + 248, 22);
    for (var i = 0; i < n; i++) {
      var cx = L + slot * (i + 0.5), vals = [d.learning.first[i], d.learning.second[i]], cols = ['#5d6b78', C.mint];
      for (var j = 0; j < 2; j++) {
        var v = vals[j] * Math.max(0, Math.min(1, t)), h = v * (H - T - B), x = cx + (j === 0 ? -bw - 4 : 4);
        g.fillStyle = cols[j]; g.fillRect(x, H - B - h, bw, h);
        if (t >= 1) { g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(pct(vals[j]), x + bw / 2, H - B - h - 7); }
      }
      g.fillStyle = C.muted; g.textAlign = 'center'; g.fillText(d.gaps[i] + ' letters later', cx, H - B + 22);
    }
  }
  function namePlay() {
    var d = name.data; if (!d) return; var cv = nameBuild(d); cancelAnimationFrame(name.raf); var t0 = performance.now();
    (function f(now) { var t = (now - t0) / 1400; nameDraw(cv, d, t); if (t < 1) name.raf = requestAnimationFrame(f); else nameDraw(cv, d, 1); })(t0);
    button('name').textContent = 'Play again';
  }

  /* ---------- #copy: repeat a symbol seen up to 30 steps back ---------- */
  var copy = { data: null, raf: 0 };
  var SYM = ['#69e2b1', '#65c7f2', '#ffca76', '#b5a4ff'];
  function copyBuild(d) {
    var s = stage('copy'); s.innerHTML = '';
    var strip = el('canvas', 'rp-canvas'); strip.width = 1100; strip.height = 120; strip.setAttribute('aria-label', 'Example of the test: a coloured symbol, filler, then a cue to repeat it'); s.appendChild(strip);
    s.appendChild(el('p', 'rp-note', 'How the test works: a coloured symbol, grey filler, then the ? cue. The right answer is the colour from before the filler.'));
    var cv = el('canvas', 'rp-canvas'); cv.width = 1100; cv.height = 300; cv.style.marginTop = '12px'; cv.setAttribute('aria-label', 'Share of cues answered right, by how far back the symbol was'); s.appendChild(cv);
    var tk = el('p', 'rp-take'); s.appendChild(tk);
    var lo = Math.min.apply(null, d.perSeed), hi = Math.max.apply(null, d.perSeed);
    tk.textContent = 'With the new long look-back, ' + d.seeds + ' freshly grown brains answered ' + pct(d.withLookBack) + ' of cues right (each brain between ' + pct(lo) + ' and ' + pct(hi) +
      '), and it holds up even 17 to 31 steps back. Without it the brain is at ' + pct(d.without) + ', no better than guessing one of the 4 colours (' + pct(d.chance) +
      '). This part of the design (' + d.design + ') is still going through the lab\'s tests and is not yet the current best design.';
    return { strip: strip, cv: cv };
  }
  var COPYSEQ = (function () {   // an example stream for the illustration: symbol, 4-23 fillers, cue (not recorded answers)
    var out = [];
    for (var k = 0; k < 24; k++) { var at = out.length; out.push({ c: k % 4 }); for (var f = 0, nf = 4 + (k * 7) % 20; f < nf; f++) out.push({ f: 1 }); out.push({ q: 1, ans: k % 4, from: at }); }
    return out;
  })();
  function copyDraw(v, d, now, t0) {
    var g = v.strip.getContext('2d'), W = v.strip.width, H = v.strip.height, tile = 30, step = 36, n = Math.floor((W - 40) / step), y = 62;
    var s = Math.max(0, Math.floor((now - t0) / 320)), len = COPYSEQ.length;
    g.clearRect(0, 0, W, H);
    for (var i = 0; i < n; i++) {
      var idx = (s + i) % len, it = COPYSEQ[idx], x = 20 + i * step;
      g.fillStyle = it.f ? '#26323d' : it.q ? '#0b1218' : SYM[it.c];
      g.beginPath(); if (g.roundRect) g.roundRect(x, y, tile, tile, 7); else g.rect(x, y, tile, tile); g.fill();
      if (it.q) {
        g.strokeStyle = C.text; g.lineWidth = 2; g.stroke();
        g.fillStyle = C.text; g.font = '600 17px "DM Sans", sans-serif'; g.textAlign = 'center'; g.fillText('?', x + tile / 2, y + tile / 2 + 6);
        g.fillStyle = SYM[it.ans]; g.fillRect(x + 6, y + tile + 7, tile - 12, 5);
        var back = idx - it.from;   // arc back to the symbol to repeat, when it is still in view
        if (i - back >= 0) { var x0 = 20 + (i - back) * step + tile / 2, x1 = x + tile / 2; g.strokeStyle = SYM[it.ans]; g.lineWidth = 2; g.setLineDash([5, 4]);
          g.beginPath(); g.moveTo(x0, y - 4); g.bezierCurveTo(x0, y - 50, x1, y - 50, x1, y - 4); g.stroke(); g.setLineDash([]);
          g.fillStyle = C.muted; g.font = '12px "DM Sans", sans-serif'; g.fillText(back + ' steps back', (x0 + x1) / 2, y - 42); }
      }
    }
  }
  function copyBars(v, d, t) {
    var g = v.cv.getContext('2d'), W = v.cv.width, H = v.cv.height, L = 70, R = 20, T = 40, B = 50, n = d.bins.length, slot = (W - L - R) / n, bw = Math.min(110, slot / 2.2);
    g.clearRect(0, 0, W, H); g.font = '13px "DM Sans", system-ui, sans-serif';
    var Y = function (v) { return T + (1 - v) * (H - T - B); };
    for (var y = 0; y <= 1.0001; y += 0.25) { g.strokeStyle = C.line; g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(W - R, Y(y)); g.stroke(); g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText(Math.round(y * 100) + '%', L - 10, Y(y) + 4); }
    for (var i = 0; i < n; i++) {
      var cx = L + slot * (i + 0.5), val = d.bins[i].acc * Math.max(0, Math.min(1, t)), h = val * (H - T - B);
      g.fillStyle = C.mint; g.fillRect(cx - bw / 2, H - B - h, bw, h);
      if (t >= 1) { g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(pct(d.bins[i].acc), cx, H - B - h - 8); }
      g.fillStyle = C.muted; g.textAlign = 'center'; g.fillText(d.bins[i].label + ' steps back', cx, H - B + 22);
    }
    function hline(v, col, dash) { g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
    function key(x, col, dash, label) { g.textAlign = 'left'; if (dash) { g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 22, 18); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
      else { g.fillStyle = col; g.fillRect(x + 5, 12, 12, 12); } g.fillStyle = C.muted; g.fillText(label, x + 28, 22); return x + 40 + g.measureText(label).width; }
    if (d.without != null) hline(d.without, C.red, [6, 5]);
    hline(d.chance, C.muted, [2, 4]);
    var kx = key(L, C.mint, null, 'With the long look-back: cues answered right');
    if (d.without != null) kx = key(kx, C.red, [6, 5], 'Without it: ' + pct(d.without));
    key(kx, C.muted, [2, 4], 'Guessing: ' + pct(d.chance));
  }
  function copyPlay() {
    var d = copy.data; if (!d) return; var v = copyBuild(d); cancelAnimationFrame(copy.raf); var t0 = performance.now();
    (function f(now) { copyDraw(v, d, now, t0); copyBars(v, d, (now - t0) / 1400); copy.raf = requestAnimationFrame(f); })(t0);
    button('copy').textContent = 'Play again';
  }

  function register(id, holder, play, stop) {
    var btn = button(id);
    btn.addEventListener('click', play);
    window.ExploreDemos[id] = {
      show: function () {
        if (holder.data) { if (!holder.played) { holder.played = true; play(); } return; }
        replay(id).then(function (d) { holder.data = d; btn.disabled = false; holder.played = true; play(); }).catch(function () { fail(id); });
      },
      hide: stop,
    };
  }
  window.ExploreDemos = window.ExploreDemos || {};
  register('read', read, readPlay, function () { clearInterval(read.timer); read.timer = null; button('read').textContent = 'Play'; read.played = false; });
  register('name', name, namePlay, function () { cancelAnimationFrame(name.raf); });
  register('copy', copy, copyPlay, function () { cancelAnimationFrame(copy.raf); copy.played = false; });
})();
