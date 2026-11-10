<?php
declare(strict_types=1);

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

function agoText(int $delta): string
{
    if ($delta < 0) {
        $delta = 0;
    }
    if ($delta < 45) {
        return 'just now';
    }
    if ($delta < 3600) {
        $m = max(1, (int) round($delta / 60));
        return $m . ' minute' . ($m === 1 ? '' : 's') . ' ago';
    }
    if ($delta < 86400) {
        $hours = max(1, (int) round($delta / 3600));
        return $hours . ' hour' . ($hours === 1 ? '' : 's') . ' ago';
    }
    $days = max(1, (int) round($delta / 86400));
    return $days . ' day' . ($days === 1 ? '' : 's') . ' ago';
}

function formatDuration(int $seconds): string
{
    if ($seconds < 60) {
        return 'under a minute';
    }
    $minutes = (int) floor($seconds / 60);
    if ($minutes < 60) {
        return $minutes . ' minute' . ($minutes === 1 ? '' : 's');
    }
    $hours = (int) floor($minutes / 60);
    $minutes = $minutes % 60;
    $text = $hours . ' hour' . ($hours === 1 ? '' : 's');
    if ($minutes > 0) {
        $text .= ' ' . $minutes . ' minute' . ($minutes === 1 ? '' : 's');
    }
    return $text;
}

function jobStatusLabel(string $status): string
{
    if ($status === 'leased') {
        return 'running';
    }
    return $status;
}

function projectNiceName(string $id, string $title): string
{
    if ($id === 'spikefoundry') {
        return 'SpikeFoundry';
    }
    if ($id === 'bugbrain') {
        return 'BugBrain';
    }
    if ($title !== '') {
        return $title;
    }
    return $id;
}

function jsonForHtml($value): string
{
    $json = json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    return $json === false ? 'null' : $json;
}

function modeLabel(string $mode, int $pct): string
{
    if ($mode === 'off') {
        return 'Off';
    }
    if ($mode === 'full') {
        return 'Full blast';
    }
    return 'Allowance · ' . $pct . '%';
}

/* One line about a computer, plus what its worker last reported. */
function describeWorker(App $app, array $worker, array $leases = []): array
{
    $now = strtotime($app->now());
    $seen = !empty($worker['last_seen']) ? strtotime((string) $worker['last_seen']) : 0;
    $age = $seen ? ($now - $seen) : null;
    $online = $age !== null && $age <= 180;
    $res = $app->resourcesOf($worker);
    $off = $res['mode'] === 'off';
    $ago = $seen ? agoText($now - $seen) : '';
    $n = count($leases);
    $progress = null;
    if ($n === 1 && isset($leases[0]['progress']) && $leases[0]['progress'] !== null && $leases[0]['progress'] !== '') {
        $progress = (int) $leases[0]['progress'];
    }
    if (!$online && $n === 0) {
        $line = $seen ? ('Offline — last seen ' . $ago) : 'Offline — this computer has not checked in yet';
    } elseif ($n > 0) {
        $line = $n === 1
            ? 'Running a ' . projectNiceName((string) $leases[0]['project_id'], (string) ($leases[0]['title'] ?? '')) . ' job' . ($progress !== null ? ' (' . $progress . '%)' : '')
            : 'Running ' . $n . ' jobs at once';
        if ($off) {
            $line .= ', then this computer stops';
        }
    } elseif ($off) {
        $line = 'Off — not taking new work';
    } else {
        $line = 'Waiting for work';
    }
    $rt = $res['runtime'];
    $effective = 'Waiting for this computer to report its setting.';
    $applied = false;
    if (is_array($rt) && isset($rt['mode'])) {
        $rtMode = (string) $rt['mode'];
        $rtPct = (int) ($rt['pct'] ?? 0);
        $applied = $rtMode === $res['mode'] && ($rtMode !== 'allowance' || $rtPct === $res['allowancePct']);
        $parts = [modeLabel($rtMode, $rtPct)];
        if (isset($rt['slots'], $rt['cores'])) {
            $parts[] = $rtMode === 'off' ? 'no new jobs' : ((int) $rt['slots'] . ' of ' . (int) $rt['cores'] . ' cores');
        }
        if ($rtMode === 'allowance' && isset($rt['duty']) && (float) $rt['duty'] < 0.999) {
            $parts[] = 'each job works ' . (int) round(100 * (float) $rt['duty']) . '% of the time';
        }
        if ($rtMode !== 'off' && isset($rt['priority'])) {
            $parts[] = ((string) $rt['priority'] === 'normal' ? 'normal' : 'low') . ' priority';
        }
        $effective = 'Now: ' . implode(' · ', $parts);
        if (!$applied) {
            $effective .= ' — switching to ' . modeLabel($res['mode'], $res['allowancePct']) . ' at its next check-in';
        }
    }
    return ['line' => $line, 'online' => $online, 'paused' => $off, 'ago' => $ago, 'progress' => $progress, 'mode' => $res['mode'], 'pct' => $res['allowancePct'], 'effective' => $effective, 'applied' => $applied, 'jobs' => $n];
}

/* Three-state control plus the allowance slider. Works as a plain form; the page script
 * saves on change without a reload. */
function resourceControl(string $action, string $csrf, array $worker, array $state): string
{
    $id = (string) $worker['id'];
    $mode = (string) $state['mode'];
    $pct = (int) $state['pct'];
    $opt = function (string $value, string $label, string $hint) use ($mode, $id): string {
        $rid = 'm-' . $id . '-' . $value;
        return '<input type="radio" id="' . h($rid) . '" name="mode" value="' . h($value) . '"' . ($mode === $value ? ' checked' : '') . '>'
            . '<label for="' . h($rid) . '" title="' . h($hint) . '"><span class="tri-led" aria-hidden="true"></span>' . h($label) . '</label>';
    };
    $fill = (int) round((max(10, min(90, $pct)) - 10) / 80 * 100);
    return '<form class="resources" method="post" action="' . h($action) . '" data-resources data-mode="' . h($mode) . '">'
        . '<input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h($id) . '">'
        . '<div class="res-head"><span class="label">Resources</span><span class="res-now" data-mode-label>' . h(modeLabel($mode, $pct)) . '</span></div>'
        . '<div class="tri" role="radiogroup" aria-label="How much of this computer Compute Lab may use">'
        . $opt('off', 'Off', 'Finish the current job, then take no new work')
        . $opt('allowance', 'Allowance', 'Use the share set below, at low priority')
        . $opt('full', 'Full blast', 'Use every core at normal priority')
        . '<span class="tri-thumb" aria-hidden="true"></span>'
        . '</div>'
        . '<div class="range-row' . ($mode === 'allowance' ? '' : ' is-idle') . '"><div class="range-label"><span>Allowance share</span><b data-pct-label>' . h((string) $pct) . '%</b></div>'
        . '<input type="range" name="pct" min="10" max="90" step="10" value="' . h((string) $pct) . '" style="--fill:' . $fill . '%" aria-label="Allowance as a share of this computer" aria-valuetext="' . h((string) $pct) . ' percent">'
        . '<div class="range-ends"><span>10%</span><span>90%</span></div></div>'
        . '<p class="hint">Allowance runs in the background at low priority. Full blast uses every core. Off lets the running job finish, then stops.</p>'
        . '<noscript><button class="button" type="submit">Save</button></noscript>'
        . '<p class="effective" data-effective>' . h((string) $state['effective']) . '</p>'
        . '</form>';
}

function resourceScript(): string
{
    return '<script>
(function(){
  function label(m,p){return m==="off"?"Off":m==="full"?"Full blast":"Allowance · "+p+"%";}
  document.querySelectorAll("form[data-resources]").forEach(function(f){
    var range=f.querySelector("input[name=pct]"),pl=f.querySelector("[data-pct-label]"),ml=f.querySelector("[data-mode-label]"),eff=f.querySelector("[data-effective]"),row=f.querySelector(".range-row"),timer=null;
    function mode(){var r=f.querySelector("input[name=mode]:checked");return r?r.value:"allowance";}
    function save(){
      var body=new URLSearchParams(new FormData(f));
      ml.textContent=label(mode(),range.value);row.classList.toggle("is-idle",mode()!=="allowance");f.setAttribute("data-mode",mode());
      eff.textContent="Saving…";
      fetch(f.action,{method:"POST",body:body,headers:{"Accept":"application/json"},credentials:"same-origin"}).then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok){eff.textContent=(d&&d.error)||"Could not save. Reload the page.";return;}
        eff.setAttribute("data-until",String(Date.now()+45000));eff.textContent="Saved: "+label(d.mode,d.pct)+". This computer picks it up at its next check-in, within about half a minute.";
      }).catch(function(){eff.textContent="Could not save. Reload the page.";});
    }
    f.querySelectorAll("input[name=mode]").forEach(function(r){r.addEventListener("change",save);});
    function fill(){range.style.setProperty("--fill",Math.round((range.value-10)/80*100)+"%");range.setAttribute("aria-valuetext",range.value+" percent");}
    f.querySelectorAll("input[name=mode]").forEach(function(r){r.addEventListener("change",function(){f.setAttribute("data-mode",mode());});});
    range.addEventListener("input",function(){pl.textContent=range.value+"%";fill();});
    range.addEventListener("change",function(){if(mode()!=="allowance"){var a=f.querySelector("input[value=allowance]");if(a)a.checked=true;}clearTimeout(timer);timer=setTimeout(save,150);});
  });
})();
</script>';
}

function navLinks(string $base, array $nav): string
{
    $current = (string) ($nav['current'] ?? '');
    if ($current === 'login') {
        $current = 'owner';
    }
    if ($current === 'me') {
        $current = 'home';
    }
    /* Signed in means an owner session or a participant session. Signed-in visitors add
     * computers from the My computer box on Home, so Join leaves the menu and the join
     * and setup pages mark Home instead. /join still works by URL. */
    $signedIn = !empty($nav['owner']) || !empty($nav['participant']);
    if ($signedIn && $current === 'join') {
        $current = 'home';
    }
    $items = [
        ['home', 'Home', $base === '' ? '/' : $base . '/'],
        ['explore', 'Explore', $base . '/explore'],
        ['discoveries', 'Discoveries', $base . '/discoveries'],
        ['join', 'Join', $base . '/join'],
        ['owner', 'Owner', $base . '/owner'],
    ];
    $html = '';
    foreach ($items as $item) {
        if ($signedIn && $item[0] === 'join') {
            continue;
        }
        $on = $current === $item[0];
        $html .= '<a href="' . h($item[2]) . '"' . ($on ? ' class="is-current" aria-current="page"' : '') . '>' . h($item[1]) . '</a>';
    }
    return $html;
}

/* The one account item at the end of the menu: Log out when signed in, Log in otherwise. */
function logoutForm(string $base, array $nav): string
{
    if (empty($nav['owner']) && empty($nav['participant'])) {
        return '<a class="cl-account" href="' . h($base . '/owner/login') . '">Log in</a>';
    }
    $csrf = !empty($nav['owner']) ? (string) ($nav['ownerCsrf'] ?? '') : (string) ($nav['participantCsrf'] ?? '');
    return '<form method="post" action="' . h($base) . '/logout" class="cl-account"><input type="hidden" name="csrf" value="' . h($csrf) . '"><button type="submit">Log out</button></form>';
}

/* One header for every page, including the Explore lab. Its styles are scoped to .cl-top
 * and set every property they rely on, so a page's own CSS cannot move or resize it.
 * Colors and type follow the SpikeFoundry design lab. */
function siteHeaderCss(): string
{
    return '<style>
        .cl-top,.cl-top *{box-sizing:border-box;margin:0;padding:0;border:0;background:none;font:inherit;line-height:inherit;letter-spacing:normal;text-transform:none}
        .cl-top{display:block;position:sticky;top:0;z-index:50;width:100%;height:56px;background:#0b1219;border-bottom:1px solid #202d39;color:#e6edf3;font:500 13px/1 "DM Sans","Segoe UI",system-ui,sans-serif;text-align:left}
        .cl-top .cl-top-inner{width:min(1490px,calc(100% - 28px));height:55px;margin:0 auto;display:flex;align-items:center;gap:16px}
        .cl-top .cl-brand{display:flex;align-items:center;gap:10px;color:#e6edf3;text-decoration:none;white-space:nowrap;margin-right:auto;font:700 15px/1 "Space Grotesk","DM Sans",system-ui,sans-serif;letter-spacing:.01em}
        .cl-top .cl-brand b{font-weight:700;color:#69e2b1}
        .cl-top .cl-mark{width:30px;height:30px;border:1px solid #315848;border-radius:9px;display:grid;place-items:center;color:#69e2b1;background:#10231e;box-shadow:inset 0 0 12px #153b2d}
        .cl-top .cl-mark svg{width:18px;height:18px;display:block}
        .cl-top .cl-toggle{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
        .cl-top .cl-burger{display:none;cursor:pointer;border:1px solid #202d39;border-radius:8px;padding:8px 12px;background:#121d27;color:#e6edf3;font:600 12px/1 "DM Sans",system-ui,sans-serif}
        .cl-top .cl-nav{display:flex;align-items:center;gap:6px;white-space:nowrap}
        .cl-top .cl-nav a{color:#8b9baa;text-decoration:none;padding:9px 12px;border-radius:8px;border:1px solid transparent}
        .cl-top .cl-nav a:hover{color:#e6edf3;background:#121d27}
        .cl-top .cl-nav a.is-current{color:#69e2b1;background:#10231e;border-color:#2d5948}
        .cl-top .cl-account{display:inline-flex;margin-left:8px}
        .cl-top .cl-nav a.cl-account,.cl-top .cl-account button{display:inline-block;width:84px;text-align:center;cursor:pointer;color:#e6edf3;background:#121d27;border:1px solid #202d39;border-radius:8px;padding:9px 0;font:600 12px/1 "DM Sans",system-ui,sans-serif}
        .cl-top .cl-nav a.cl-account:hover,.cl-top .cl-account button:hover{border-color:#466072;background:#172531}
        @media (max-width:860px){
          .cl-top .cl-burger{display:inline-block}
          .cl-top .cl-nav{display:none;position:absolute;top:56px;left:0;right:0;flex-direction:column;align-items:stretch;gap:4px;padding:10px 14px;background:#0b1219;border-bottom:1px solid #202d39}
          .cl-top .cl-toggle:checked ~ .cl-nav{display:flex}
          .cl-top .cl-account{margin-left:0}
        }
        </style>';
}

function siteHeader(string $base, array $nav): string
{
    $mark = '<span class="cl-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12h4l2.4-6 3.2 12 2.4-6H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="12" r="1.4" fill="currentColor"/><circle cx="20" cy="12" r="1.4" fill="currentColor"/></svg></span>';
    return '<div class="cl-top" role="banner"><div class="cl-top-inner"><a class="cl-brand" href="' . h($base === '' ? '/' : $base . '/') . '">' . $mark . '<span>compute<b>lab</b></span></a>'
        . '<input class="cl-toggle" id="cl-toggle" type="checkbox" aria-label="Show menu"><label class="cl-burger" for="cl-toggle">Menu</label>'
        . '<nav class="cl-nav" aria-label="Compute Lab">' . navLinks($base, $nav) . logoutForm($base, $nav) . '</nav></div></div>';
}

/* The shared Compute Lab stylesheet, served at /assets/computelab.css. Palette, type,
 * panels, buttons, chips, sliders, and switches come from SpikeFoundry-SNN-Design-Lab.html. */
function labCss(): string
{
    return <<<'CSS'
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
:root{--bg:#090e14;--panel:#101821;--panel2:#0d151d;--line:#202d39;--muted:#8b9baa;--text:#e6edf3;--mint:#69e2b1;--cyan:#65c7f2;--amber:#ffca76;--red:#ff818a;--purple:#b5a4ff;--mono:'DM Mono',ui-monospace,Consolas,monospace;--sans:'DM Sans','Segoe UI',system-ui,sans-serif;--display:'Space Grotesk','DM Sans',system-ui,sans-serif;--mine:#ffca76}
*{box-sizing:border-box}
html{background:#090e14}
body{margin:0;background:radial-gradient(ellipse at 50% -15%,#142535 0,#090e14 46rem) no-repeat,#090e14;color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.5;min-height:100vh}
a{color:var(--mint)}a:hover{color:#8ef0c6}
code{font:12px var(--mono);background:#0c131a;border:1px solid #293743;border-radius:5px;padding:2px 6px;word-break:break-all}
.shell{max-width:1490px;margin:auto;padding:25px 34px 40px}
.shell.narrow{max-width:980px}
.heading{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:0 0 19px}
.eyebrow{color:var(--mint);font:10px var(--mono);letter-spacing:.15em;text-transform:uppercase;margin-bottom:6px}
h1,.heading h1{font:600 27px/1.15 var(--display);margin:0;letter-spacing:-.03em}
.heading p,.lede{margin:6px 0 0;color:var(--muted);font-size:13px;max-width:70ch}
h2{font:600 15px var(--display);margin:0 0 10px;letter-spacing:.01em}
h3{font:600 12px var(--display);margin:14px 0 8px}
p{margin:0 0 10px}
.muted{color:var(--muted)}.err{color:var(--red)}.ok{color:var(--mint)}
.quiet{font-size:12px;color:var(--muted)}
.head-actions{display:flex;gap:9px;flex-wrap:wrap}
.button,button{display:inline-block;border:1px solid var(--line);background:#121d27;color:var(--text);padding:10px 14px;border-radius:8px;font:600 12px var(--sans);cursor:pointer;transition:.15s;text-decoration:none}
.button:hover,button:hover{border-color:#466072;background:#172531;color:var(--text)}
.button.primary,.cta{background:var(--mint);border:1px solid var(--mint);color:#07120e}
.button.primary:hover,.cta:hover{background:#8ef0c6;color:#07120e}
.cta{display:inline-block;padding:10px 14px;border-radius:8px;font:600 12px var(--sans);text-decoration:none}
.button.stop{background:#381f24;border-color:#64353a;color:#ffafb4}
.button.small,button.small{padding:7px 10px;font-size:11px}
.panel,section.panel{background:linear-gradient(160deg,#121c26,#0e161e);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 10px 32px #0002;margin:0 0 15px}
.panelhead{min-height:48px;padding:10px 17px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.paneltitle{font:600 12px var(--display);letter-spacing:.01em}
.panelbody{padding:15px 17px}
.subtag{font:10px var(--mono);color:var(--muted);border:1px solid #293743;background:#0c131a;padding:5px 8px;border-radius:5px;white-space:nowrap}
.status{font:10px var(--mono);color:var(--mint);display:inline-flex;gap:7px;align-items:center}
.status.off{color:var(--muted)}.status.warn{color:var(--amber)}
.led{display:inline-block;width:7px;height:7px;background:var(--mint);border-radius:50%;box-shadow:0 0 9px #69e2b1aa}
.led.off{background:#4e6774;box-shadow:none}.led.warn{background:var(--amber);box-shadow:0 0 9px #ffca76aa}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.metric{background:linear-gradient(150deg,#121c26,#0e161e);border:1px solid var(--line);border-radius:10px;padding:13px 14px;min-width:0}
.metriclabel{font:10px var(--mono);color:var(--muted);margin-bottom:9px;text-transform:uppercase;letter-spacing:.04em}
.metricvalue{font:600 23px/1.1 var(--display);letter-spacing:-.04em;overflow-wrap:anywhere}
.metricvalue small{font:11px var(--mono);color:var(--muted);letter-spacing:0}
.metricnote{font:10px var(--mono);color:#6e808e;margin-top:5px}
.metric.accent .metricvalue{color:var(--mint)}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.chip{font:10px var(--mono);color:#aebbc4;background:#101921;border:1px solid #273541;padding:5px 8px;border-radius:5px}
.chip b{font-weight:500;color:var(--mint)}
.chip.mine{border-color:#6b5531;color:var(--amber);background:#1f1a12}
.tasks{display:flex;flex-direction:column;gap:8px}
.taskcard{padding:10px 11px;border:1px solid #26343f;background:#0d151c;border-radius:8px}
.taskline{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
.taskname{font:600 12px var(--display)}
.taskscore{font:11px var(--mono);color:var(--mint)}
.taskdesc2{font-size:11px;color:#7e8c98}
.prog{height:4px;background:#1d2a33;border-radius:5px;overflow:hidden;margin-top:9px}
.prog i{height:100%;display:block;background:linear-gradient(90deg,#46b98b,#8cf0c5);border-radius:5px}
.log{display:flex;flex-direction:column}
.logline{display:grid;grid-template-columns:120px 1fr auto;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1b2730;font:11px var(--mono)}
.logline:last-child{border:0}.logtime{color:#71818d}.logtext{color:#aeb9c2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.logscore{text-align:right;color:var(--mint)}
label{display:block;margin:10px 0;color:#aab6c0;font-size:12px}
input,select,textarea{font:12px var(--mono);color:#d4dde5;background:#0c141b;border:1px solid #2b3a47;padding:8px 10px;border-radius:6px;width:100%;max-width:420px;margin-top:5px}
input[type=checkbox],input[type=radio]{width:auto;margin:0 8px 0 0;accent-color:var(--mint);vertical-align:middle}
textarea{min-height:70px}
input:focus,select:focus,textarea:focus{outline:1px solid #38634f;border-color:#38634f}
input[type=range]{width:100%;max-width:none;accent-color:var(--mint);height:4px;padding:0;border:0;background:none;margin:6px 0}
.range-row{margin-top:13px}.range-row.is-idle{opacity:.55}
.range-label{display:flex;justify-content:space-between;color:var(--muted);font:10px var(--mono);margin-bottom:4px}
.range-label b{color:var(--text);font-weight:500}
.range-ends{display:flex;justify-content:space-between;color:#5d6d7a;font:9px var(--mono)}
.switchrow{display:flex;justify-content:space-between;align-items:center;margin:10px 0;color:#aab6c0;font-size:12px}
.tri{position:relative;display:grid;grid-template-columns:repeat(3,1fr);height:44px;padding:4px;background:linear-gradient(180deg,#071016,#0c151d);border:1px solid #293743;border-radius:999px;box-shadow:inset 0 2px 7px #000a,0 1px 0 #ffffff08;user-select:none}
.tri input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
.tri label{position:relative;z-index:2;margin:0;display:flex;align-items:center;justify-content:center;gap:7px;border-radius:999px;cursor:pointer;font:600 12px var(--display);letter-spacing:.02em;color:var(--muted);transition:color .25s ease;white-space:nowrap}
.tri label:hover{color:var(--text)}
.tri input:focus-visible+label{outline:2px solid var(--cyan);outline-offset:-2px}
.tri-led{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.45;transition:opacity .25s,box-shadow .25s}
.tri input:checked+label .tri-led{opacity:1;box-shadow:0 0 8px currentColor}
.tri-thumb{position:absolute;z-index:1;top:4px;bottom:4px;left:4px;width:calc((100% - 8px)/3);border-radius:999px;border:1px solid #7a3c43;background:linear-gradient(180deg,#4a2329,#2e171b);box-shadow:0 0 14px #ff818a2e,inset 0 1px 0 #ffffff14;transition:transform .35s cubic-bezier(.25,1,.5,1),background .3s,border-color .3s,box-shadow .3s}
.tri input[value=off]:checked+label{color:#ffc2c6}
.tri input[value=allowance]:checked+label{color:var(--mint)}
.tri input[value=full]:checked+label{color:#06140f}
.resources[data-mode=allowance] .tri-thumb,.tri:has(input[value=allowance]:checked) .tri-thumb{transform:translateX(100%);border-color:#2f7a5d;background:linear-gradient(180deg,#173a2e,#0f241d);box-shadow:0 0 16px #69e2b133,inset 0 1px 0 #ffffff14}
.resources[data-mode=full] .tri-thumb,.tri:has(input[value=full]:checked) .tri-thumb{transform:translateX(200%);border-color:#9af0cc;background:linear-gradient(180deg,#8cf0c6,#4fcf9c);box-shadow:0 0 20px #69e2b166,inset 0 1px 0 #ffffff55}
.resources[data-mode=full] .tri input[value=full]:checked+label .tri-led{animation:tri-pulse 1.6s ease-in-out infinite}
@keyframes tri-pulse{50%{box-shadow:0 0 2px currentColor;opacity:.6}}
.resources .range-row{position:relative;margin-top:11px;padding:11px 13px 8px;border:1px solid #2d5948;border-radius:10px;background:linear-gradient(180deg,#0f1f1a,#0b1513);transition:opacity .25s,border-color .25s,background .25s}
.resources .range-row::before{content:"";position:absolute;top:-7px;left:50%;width:12px;height:12px;margin-left:-6px;transform:rotate(45deg);background:#0f1f1a;border-left:1px solid #2d5948;border-top:1px solid #2d5948;transition:inherit}
.resources .range-row.is-idle{opacity:.5;border-style:dashed;border-color:#2b3a47;background:#0b1219}
.resources .range-row.is-idle::before{opacity:0}
.resources .range-row.is-idle input[type=range]::-webkit-slider-thumb{border-color:#6f8696;box-shadow:none;background:#c9d4dc}
.resources .range-row.is-idle input[type=range]::-moz-range-thumb{border-color:#6f8696;box-shadow:none;background:#c9d4dc}
.resources[data-mode=off] .res-now{color:var(--red)}
.resources .range-label b{color:var(--mint);font:600 13px var(--display)}
.resources input[type=range]{-webkit-appearance:none;appearance:none;height:6px;margin:9px 0 7px;border-radius:999px;background:linear-gradient(90deg,var(--mint) 0,var(--mint) var(--fill,50%),#24323d var(--fill,50%));outline:none}
.resources .range-row.is-idle input[type=range]{background:linear-gradient(90deg,#4e6774 0,#4e6774 var(--fill,50%),#1d2933 var(--fill,50%))}
.resources input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#e9fff5;border:3px solid var(--mint);box-shadow:0 0 10px #69e2b188;cursor:pointer}
.resources input[type=range]::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:#e9fff5;border:3px solid var(--mint);box-shadow:0 0 10px #69e2b188;cursor:pointer}
.resources input[type=range]::-moz-range-track{background:transparent}
.resources input[type=range]:focus-visible::-webkit-slider-thumb{outline:2px solid var(--cyan);outline-offset:2px}
.resources input[type=range]:focus-visible::-moz-range-thumb{outline:2px solid var(--cyan);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.tri-thumb,.tri label,.resources .range-row{transition:none}.tri-led{animation:none!important}}
@media (max-width:420px){.tri label{font-size:11px;gap:5px}}
.resources{border:1px solid #263642;background:#0b1319;border-radius:10px;padding:13px 14px;margin:12px 0}
.res-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.res-head .label{font:10px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.res-now{font:600 12px var(--display);color:var(--mint)}
.resources .hint{font-size:11px;color:var(--muted);margin:10px 0 6px}
.resources .effective{font:11px var(--mono);color:#aeb9c2;margin:0;border-top:1px solid #1e2a34;padding-top:9px}
.grid2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.9fr);gap:15px}
.stack{display:flex;flex-direction:column;gap:15px}
.computer{border:1px solid #26343f;background:#0d151c;border-radius:10px;padding:14px 15px;margin:0 0 12px}
.computer.mine{box-shadow:inset 2px 0 var(--mine)}
.computer-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}
.computer-name{font:600 15px var(--display)}
.status-line{font:600 18px/1.3 var(--display);margin:4px 0 4px}
.add-computer{margin:0 0 12px}
.empty{border:1px dashed #2b3a47;border-radius:10px;padding:18px;color:var(--muted);background:#0b1219}
.empty strong{display:block;color:var(--text);font:600 15px var(--display);margin-bottom:6px}
.filters{display:flex;flex-wrap:wrap;gap:7px;margin:4px 0 12px}
.filters a{text-decoration:none;font:10px var(--mono);color:#aebbc4;background:#101921;border:1px solid #273541;padding:6px 9px;border-radius:5px}
.filters a.is-current{color:var(--mint);border-color:#2d5948;background:#10231e}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #1b2730;vertical-align:top}th{font:10px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
details.advanced{border:1px solid var(--line);border-radius:12px;background:#0b1219;margin:0 0 15px}
details.advanced>summary{cursor:pointer;padding:14px 17px;font:600 13px var(--display);list-style:none;display:flex;justify-content:space-between;align-items:center}
details.advanced>summary::-webkit-details-marker{display:none}
details.advanced>summary:after{content:"Show";font:10px var(--mono);color:var(--muted);border:1px solid #293743;padding:4px 8px;border-radius:5px}
details.advanced[open]>summary:after{content:"Hide"}
details.advanced>.inner{padding:0 17px 6px}
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0 16px}
.chart-svg{width:100%;height:auto;display:block;background:#0c131a;border:1px solid #1d2a33;border-radius:8px}
.legend{display:flex;gap:14px;color:var(--muted);font:10px var(--mono);margin:6px 0 0}
.legend i{display:inline-block;width:12px;height:2px;vertical-align:middle;margin-right:5px;background:var(--mint)}
.legend .b i{background:var(--cyan)}.legend .c i{background:var(--amber)}
.footer{display:flex;justify-content:space-between;gap:12px;margin-top:17px;padding:11px 2px;color:#73828e;font:10px var(--mono)}
/* Discoveries: a fixed-height split view. Only the list and the viewer scroll. */
html.fit,body.fit{height:100%;overflow:hidden}
body.fit .shell.split-shell{height:calc(100vh - 56px);height:calc(100dvh - 56px);max-width:1490px;padding:18px 34px 18px;display:flex;flex-direction:column}
.split-shell .heading{flex:none;margin-bottom:14px}
.split{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(270px,380px) minmax(0,1fr);gap:15px}
.split>.panel{margin:0;display:flex;flex-direction:column;min-height:0}
.list-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:7px;overscroll-behavior:contain}
.viewer-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;padding:15px 17px;overscroll-behavior:contain}
.disc{display:block;width:100%;text-align:left;padding:10px 11px;border:1px solid #26343f;background:#0d151c;border-radius:8px;cursor:pointer;color:var(--text);font:inherit;transition:.15s}
.disc:hover,.disc.active{border-color:#38634f;background:#101d1b}
.disc.active{box-shadow:inset 2px 0 var(--mint)}
.disc.mine{border-color:#6b5531;background:#17140e}
.disc.mine:hover,.disc.mine.active{border-color:#a8814a;background:#1f1a12}
.disc.mine.active{box-shadow:inset 2px 0 var(--mine)}
.disc .row1{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px}
.disc .t{font:600 12px var(--display)}
.disc .s{font:11px var(--mono);color:var(--mint)}
.disc.mine .s{color:var(--amber)}
.disc .row2{display:flex;justify-content:space-between;gap:8px;font:10px var(--mono);color:#7e8c98}
.badge-mine{display:inline-block;font:9px var(--mono);color:#1b1306;background:var(--amber);border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:middle;letter-spacing:.03em}
.group-label{font:10px var(--mono);color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin:8px 2px 2px}
.stage{position:relative;background-image:linear-gradient(#13212c55 1px,transparent 1px),linear-gradient(90deg,#13212c55 1px,transparent 1px);background-size:28px 28px;background-position:center;background-color:#0c131a;border:1px solid #1d2a33;border-radius:8px;overflow:hidden}
.stage svg{display:block;width:100%;height:auto}
.wire{stroke:#4e6774;stroke-width:1.6;fill:none}.wire.inhib{stroke:#b58fff}.wire.delay{stroke-dasharray:4 3}
.node-input{fill:#132c2b;stroke:#3a755f;stroke-width:1.5}.node-hidden{fill:#1e2336;stroke:#7769c3;stroke-width:1.5}.node-inhib{fill:#2a1e36;stroke:#b58fff;stroke-width:1.5}.node-output{fill:#352719;stroke:#a87636;stroke-width:1.5}
.net-label{fill:#98a8b5;font:10px var(--mono);letter-spacing:.1em}
.viz-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:12px}
.viz-title{display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px}
.viz-title strong{font:600 12px var(--display)}.viz-title span{font:10px var(--mono);color:var(--muted)}
.private{display:grid;place-items:center;min-height:180px;color:var(--muted);font:11px var(--mono);text-align:center;padding:18px}
@media(max-width:950px){.grid2{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.viz-grid{grid-template-columns:1fr}}
@media(max-width:860px){
  body.fit .shell.split-shell{padding:12px 14px}
  .split{grid-template-columns:1fr;grid-template-rows:minmax(0,38%) minmax(0,62%)}
  .split-shell .heading p{display:none}
}
@media(max-width:620px){.shell{padding:18px 14px 26px}.heading{align-items:start;flex-direction:column}.heading h1{font-size:23px}.metrics{grid-template-columns:repeat(2,1fr)}.logline{grid-template-columns:1fr}.footer{flex-direction:column}table,tbody,tr,td{display:block;width:100%}th{display:none}}
pre.code{background:#081016;border:1px solid var(--line);border-radius:8px;padding:10px;font:11px/1.5 "DM Mono",ui-monospace,monospace;color:#b9c7d2;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;margin:6px 0 10px}
details.diag h3{font-size:12px;margin:12px 0 4px;color:var(--muted)}
.cmd{display:flex;gap:8px;align-items:stretch;margin:8px 0 10px;max-width:100%}
.cmd pre{flex:1;min-width:0;margin:0;background:#081016;border:1px solid #2b3a47;border-radius:8px;padding:11px 13px;font:12px/1.5 var(--mono);color:#d4dde5;white-space:pre-wrap;word-break:break-all}
.cmd button{flex:none}
.setup-again{margin-top:12px;padding-top:10px;border-top:1px solid #1e2a34}
CSS;
}

function labCssUrl(string $base): string
{
    return $base . '/assets/computelab.css?v=' . substr(sha1(labCss()), 0, 10);
}

/* Favicon (spike-train mark in the SpikeFoundry palette) and the minimal web app manifest. */
function iconLinks(string $base): string
{
    return '<link rel="icon" href="' . h($base . '/favicon.ico') . '" sizes="any">'
        . '<link rel="icon" type="image/svg+xml" href="' . h($base . '/favicon.svg') . '">'
        . '<link rel="apple-touch-icon" href="' . h($base . '/apple-touch-icon.png') . '">'
        . '<link rel="manifest" href="' . h($base . '/manifest.webmanifest') . '">'
        . '<meta name="theme-color" content="#090e14">';
}

function webManifest(string $base): array
{
    return [
        'name' => 'Compute Lab',
        'short_name' => 'Compute Lab',
        'description' => 'Donate spare computer time to SpikeFoundry experiments.',
        'start_url' => $base . '/',
        'scope' => $base . '/',
        'display' => 'standalone',
        'background_color' => '#090e14',
        'theme_color' => '#090e14',
        'icons' => [
            ['src' => $base . '/favicon.svg', 'sizes' => 'any', 'type' => 'image/svg+xml'],
            ['src' => $base . '/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png'],
            ['src' => $base . '/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
        ],
    ];
}

function layout(string $title, string $body, string $base, array $nav = [], array $opts = []): string
{
    $fit = !empty($opts['fit']);
    $shell = (string) ($opts['shell'] ?? 'shell');
    return '<!DOCTYPE html><html lang="en"' . ($fit ? ' class="fit"' : '') . '><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>'
        . h($title) . '</title>' . iconLinks($base) . siteHeaderCss() . '<link rel="stylesheet" href="' . h(labCssUrl($base)) . '">' . (string) ($opts['head'] ?? '') . '</head><body' . ($fit ? ' class="fit"' : '') . '>'
        . siteHeader($base, $nav) . '<main class="' . h($shell) . '">' . $body . '</main>' . (string) ($opts['foot'] ?? '') . '</body></html>';
}

/* The Explore lab keeps its own page and script. It gets the shared header, the shared
 * stylesheet, and a few overrides that map its colors and type onto the design palette. */
function exploreBar(string $base, array $nav): string
{
    return siteHeaderCss() . siteHeader($base, $nav);
}

function exploreSkin(string $base): string
{
    return iconLinks($base) . '<link rel="stylesheet" href="' . h(labCssUrl($base)) . '"><style>
        :root{--bg:#090e14;--card:#101821;--line:#202d39;--text:#e6edf3;--muted:#8b9baa;--mint:#69e2b1;--amber:#ffca76}
        body{background:radial-gradient(ellipse at 50% -15%,#142535 0,#090e14 46rem) no-repeat,#090e14;font-family:var(--sans);font-size:14px}
        body>header,body>main{width:min(1490px,calc(100% - 68px))}
        body>header h1{font:600 27px/1.15 var(--display);letter-spacing:-.03em}
        body>header .mark{font:10px var(--mono);letter-spacing:.15em}
        main section{background:linear-gradient(160deg,#121c26,#0e161e);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 32px #0002}
        main h2{font:600 13px var(--display)}
        main button{border-radius:8px;font:600 12px var(--sans);background:var(--mint);color:#07120e}
        main button.secondary,main button:disabled{background:#121d27;color:var(--text);border:1px solid var(--line)}
        main select{font:11px var(--mono);color:#d4dde5;background:#0c141b;border:1px solid #2b3a47;border-radius:6px}
        .banner{background:#1f1a12;color:#f3e2b8;border:1px solid #6b5531;border-radius:10px}
        </style>';
}

function addComputerButton(string $base): string
{
    return '<p class="add-computer"><a class="cta" href="' . h($base) . '/join">Add a computer</a></p>';
}

function copyScript(): string
{
    return '<script>document.querySelectorAll("[data-copy]").forEach(function(b){b.addEventListener("click",function(){var t=document.getElementById(b.getAttribute("data-copy")).textContent;function done(){var o=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=o;},1600);}function fallback(){var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();try{document.execCommand("copy");done();}catch(e){}document.body.removeChild(a);}if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(done,fallback);}else fallback();});});</script>';
}

function commandBox(string $id, string $command): string
{
    return '<div class="cmd"><pre id="' . h($id) . '">' . h($command) . '</pre><button class="button primary" type="button" data-copy="' . h($id) . '">Copy</button></div>';
}

function newSetupForm(string $action, string $csrf, string $id): string
{
    return '<form method="post" action="' . h($action) . '" onsubmit="return confirm(\'This makes a new setup command and replaces this computer\\\'s token. Run the new command on that computer. Continue?\')"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h($id) . '"><button class="button small" type="submit">New setup command</button></form>';
}

function rightNowPanel(App $app, string $base): string
{
    $live = $app->liveStatus();
    $tasks = '';
    foreach ($live['tasks'] as $t) {
        $state = (string) $t['state'];
        $cls = $state === 'Solved' ? 'ok' : ($state === 'Stalled' || $state === 'Overfitting' ? 'warn' : '');
        $tasks .= '<div class="taskcard"><div class="taskline"><span class="taskname">Level ' . h((string) $t['level']) . ' · ' . h((string) $t['task']) . '</span>'
            . '<span class="taskscore">' . ($t['best'] !== null ? h(number_format((float) $t['best'], 3)) : '—') . '</span></div>'
            . '<div class="taskdesc2"><span class="status ' . h($cls) . '">' . h($state) . '</span> · best held-out score</div>'
            . '<div class="prog"><i style="width:' . h((string) (int) round(100 * max(0, min(1, (float) ($t['best'] ?? 0))))) . '%"></i></div></div>';
    }
    if ($tasks === '') {
        $tasks = '<p class="muted">Task progress shows up after the first design upload.</p>';
    }
    $projects = [];
    foreach ($live['projects'] as $p) {
        if ($p['enabled']) {
            $projects[] = projectNiceName($p['id'], $p['title']);
        }
    }
    return '<section class="panel" id="right-now" data-live="' . h($base . '/status.json') . '"><div class="panelhead"><div class="paneltitle">Right now</div>'
        . '<span class="status"><i class="led"></i><span data-live-at>LIVE</span></span></div><div class="panelbody">'
        . '<div class="metrics">'
        . '<div class="metric accent"><div class="metriclabel">Computers online</div><div class="metricvalue" data-stat="online">' . h((string) $live['online']) . '</div><div class="metricnote">checked in within 3 minutes</div></div>'
        . '<div class="metric"><div class="metriclabel">Jobs running</div><div class="metricvalue" data-stat="running">' . h((string) $live['running']) . '</div><div class="metricnote"><span data-stat="slots">' . h((string) $live['slots']) . '</span> job slots open</div></div>'
        . '<div class="metric"><div class="metriclabel">Waiting</div><div class="metricvalue" data-stat="queued">' . h((string) $live['queued']) . '</div><div class="metricnote">jobs ready to claim</div></div>'
        . '<div class="metric"><div class="metriclabel">Jobs done</div><div class="metricvalue" data-stat="done">' . h((string) $live['done']) . '</div><div class="metricnote">' . h(implode(' · ', $projects)) . '</div></div>'
        . '</div><h3>SpikeFoundry curriculum</h3><div class="tasks" data-tasks>' . $tasks . '</div></div></section>';
}

function myComputerPanel(App $app, string $base, ?array $computers, string $csrf, bool $owner): string
{
    $head = '<section class="panel" id="my-computer"><div class="panelhead"><div class="paneltitle">My computer</div><a class="button small primary" href="' . h($base) . '/join">Add a computer</a></div><div class="panelbody">';
    if ($computers === null || $computers === []) {
        $why = $owner
            ? 'You are signed in as the owner. Computers you link from this browser show up here; every computer is listed in the owner console.'
            : 'Link this browser to a computer to see what it is doing, set how much of it Compute Lab may use, and follow what it finds.';
        return $head . '<div class="empty"><strong>No computer linked yet</strong><p>' . h($why) . '</p>'
            . '<p>Setup takes one download. A small background program does the work, and you can turn it off or down at any time.</p>'
            . addComputerButton($base) . '</div></div></section>';
    }
    $cards = '';
    $ids = [];
    foreach ($computers as $worker) {
        $ids[] = (string) $worker['id'];
        $leases = $app->leasesOf((string) $worker['id']);
        $state = describeWorker($app, $worker, $leases);
        $totals = $app->contribution((string) $worker['id']);
        $seen = $state['online']
            ? 'Online · last seen ' . ($state['ago'] !== '' ? $state['ago'] : 'just now')
            : ($state['ago'] !== '' ? 'Last seen ' . $state['ago'] : 'Not seen yet');
        $jobs = '';
        foreach ($leases as $lease) {
            $pg = isset($lease['progress']) && $lease['progress'] !== null && $lease['progress'] !== '' ? (int) $lease['progress'] : null;
            $jobs .= '<div class="taskcard"><div class="taskline"><span class="taskname">' . h((string) $lease['title']) . '</span><span class="taskscore">' . ($pg !== null ? h((string) $pg) . '%' : 'running') . '</span></div>'
                . '<div class="taskdesc2">slot ' . h((string) (int) ($lease['slot'] ?? 0)) . ' · heartbeat ' . h(!empty($lease['heartbeat_at']) ? agoText(strtotime($app->now()) - strtotime((string) $lease['heartbeat_at'])) : '—') . '</div>'
                . ($pg !== null ? '<div class="prog"><i style="width:' . h((string) $pg) . '%"></i></div>' : '') . '</div>';
        }
        if ($jobs === '') {
            $jobs = '<p class="muted">Not running a shared job.</p>';
        }
        $time = $totals['seconds'] > 0 ? formatDuration((int) $totals['seconds']) : 'no recorded time yet';
        $found = $app->designsByWorker((string) $worker['id']);
        $shown = (int) ($worker['public_credit'] ?? 1) === 1;
        $led = !$state['online'] ? 'off' : ($state['paused'] ? 'warn' : '');
        $cards .= '<div class="computer mine" data-computer="' . h((string) $worker['id']) . '"><div class="computer-top"><span class="computer-name">' . h((string) $worker['name']) . '</span>'
            . '<span class="status ' . h($led) . '"><i class="led ' . h($led) . '"></i>' . h($seen) . '</span></div>'
            . '<p class="status-line" role="status" data-line>' . h($state['line']) . '</p>'
            . healthBadge($app->healthOf($worker))
            . resourceControl($base . '/me/resources', $csrf, $worker, $state)
            . '<h3>What it is doing</h3><div class="tasks" data-jobs>' . $jobs . '</div>'
            . '<h3>Credit</h3><div class="chips"><span class="chip"><b>' . h((string) $totals['done']) . '</b> jobs done</span><span class="chip">' . h($time) . ' of compute</span><span class="chip mine"><b>' . h((string) $found) . '</b> designs found</span></div>'
            . '<form method="post" action="' . h($base) . '/me/credit" style="margin-top:10px"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $worker['id']) . '"><input type="hidden" name="shown" value="' . ($shown ? '0' : '1') . '"><button class="small" type="submit">' . ($shown ? 'Show my designs as Anonymous' : 'Show my name on discoveries') . '</button></form>'
            . '<div class="setup-again"><p class="quiet">Stopped working, or moved to a new computer? Get a new setup command and run it there. It says what is missing if something is wrong.</p>'
            . newSetupForm($base . '/me/setup-command', $csrf, (string) $worker['id']) . '</div>'
            . '</div>';
    }
    $highlights = '';
    foreach ($app->highlights($ids) as $event) {
        $highlights .= '<div class="logline"><span class="logtime">' . h(agoText(strtotime($app->now()) - strtotime((string) $event['created_at']))) . '</span><span class="logtext">' . h((string) $event['detail']) . '</span><span class="logscore">' . h((string) $event['kind']) . '</span></div>';
    }
    if ($highlights === '') {
        $highlights = '<p class="muted">Notable results show up here after this computer finds a design.</p>';
    }
    $history = '';
    foreach ($computers as $worker) {
        foreach ($app->history((string) $worker['id']) as $row) {
            $history .= '<div class="logline"><span class="logtime">' . h(agoText(strtotime($app->now()) - strtotime((string) $row['created_at']))) . '</span><span class="logtext">' . h((string) $row['summary']) . '</span><span class="logscore">' . h((string) $row['status']) . '</span></div>';
        }
    }
    if ($history === '') {
        $history = '<p class="muted">None yet.</p>';
    }
    return $head . $cards . '<h3>Highlights</h3><div class="log">' . $highlights . '</div>'
        . '<h3>Recent results</h3><div class="log">' . $history . '</div>'
        . addComputerButton($base) . '</div></section>';
}

function liveScript(): string
{
    return '<script>
(function(){
  var box=document.getElementById("right-now");if(!box||!window.fetch)return;
  function tick(){
    fetch(box.getAttribute("data-live"),{credentials:"same-origin",headers:{"Accept":"application/json"}}).then(function(r){return r.json();}).then(function(d){
      ["online","running","queued","done","slots"].forEach(function(k){var el=box.querySelector("[data-stat="+k+"]");if(el&&d[k]!=null)el.textContent=d[k];});
      var at=box.querySelector("[data-live-at]");if(at)at.textContent="LIVE · "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
      if(d.mine){d.mine.forEach(function(c){var card=document.querySelector("[data-computer=\'"+c.id+"\']");if(!card)return;var l=card.querySelector("[data-line]");if(l)l.textContent=c.line;var e=card.querySelector("[data-effective]");if(e&&!(Date.now()<+(e.getAttribute("data-until")||0))&&e.textContent!=="Saving…")e.textContent=c.effective;var hb=card.querySelector("[data-health]");if(hb&&c.health&&hb.lastChild)hb.lastChild.textContent=c.health;});}
    }).catch(function(){});
  }
  setInterval(tick,15000);
})();
</script>';
}

function pageHome(App $app, array $nav, ?array $computers = null, string $csrf = ''): string
{
    $base = $app->base();
    $intro = '<section class="heading"><div><div class="eyebrow">Volunteer computing · SpikeFoundry first</div><h1>Give a spare computer something useful to do.</h1>'
        . '<p>Compute Lab shares quiet background work. SpikeFoundry runs small synthetic design trials for spiking networks. BugBrain, the neuron research, runs when SpikeFoundry has nothing waiting. Looking around in the browser does not donate this computer.</p></div>'
        . '<div class="head-actions">' . (empty($nav['owner']) && empty($nav['participant']) ? '<a class="button primary" href="' . h($base) . '/join">Join with your computer</a>' : '') . '<a class="button" href="' . h($base) . '/explore">Explore in your browser</a></div></section>';
    $body = $intro . rightNowPanel($app, $base) . myComputerPanel($app, $base, $computers, $csrf, !empty($nav['owner']));
    return layout('Compute Lab', $body, $base, $nav, ['foot' => resourceScript() . liveScript()]);
}

function pageJoin(App $app, string $error = '', array $nav = []): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $body = '<section class="heading"><div><div class="eyebrow">Join · one download</div><h1>Join with this computer</h1><p>This does not share a GitHub token or the owner password. A background program on your computer does the work. This browser tab is not the worker.</p></div></section>'
        . $err
        . '<section class="panel"><div class="panelhead"><div class="paneltitle">Your computer</div><span class="subtag">STARTS AT 50% ALLOWANCE</span></div><div class="panelbody"><form method="post" action="' . h($base) . '/join"><label>Computer name <input name="name" required maxlength="32" autocomplete="off" placeholder="kitchen-pc"></label>'
        . '<label><input type="checkbox" name="consent" value="1"> I agree this computer may run the projects I tick. SpikeFoundry comes first. BugBrain runs when SpikeFoundry is idle.</label>'
        . '<label><input type="checkbox" name="project[]" value="spikefoundry" checked> SpikeFoundry synthetic design jobs</label>'
        . '<label><input type="checkbox" name="project[]" value="bugbrain"> BugBrain template tests</label>'
        . '<p class="quiet">New computers start in Allowance at 50%: about half of the cores, at low priority, so you can keep using the computer. Change it any time on Home. Job length and the rest are picked for you.</p>'
        . '<button class="button primary" type="submit">Create a worker token</button></form></div></section>';
    return layout('Join Compute Lab', $body, $base, $nav, ['shell' => 'shell narrow']);
}

function pageToken(App $app, string $name, string $token, array $nav = [], string $command = '', string $expires = ''): string
{
    $base = $app->base();
    $unix = '';
    if ($command !== '') {
        $unix = '<h3>Mac or Linux: paste this into a terminal</h3>'
            . commandBox('setup-cmd', $command)
            . '<p class="quiet">It downloads the setup for this computer and runs it. Nothing needs to be made executable. The command works until ' . h(gmdate('H:i', strtotime($expires))) . ' UTC (one hour); after that, get a new one from My computer on Home.</p>';
    }
    $body = '<section class="heading"><div><div class="eyebrow">Setup · ' . h($name) . '</div><h1>Set up ' . h($name) . '</h1><p>This token is shown once. It is not a GitHub password. The setup command and the download files contain it so the setup can save it. Do not share them.</p></div></section>'
        . '<section class="panel"><div class="panelhead"><div class="paneltitle">Token</div><span class="subtag">SHOWN ONCE</span></div><div class="panelbody"><p><code>' . h($token) . '</code></p></div></section>'
        . '<section class="panel"><div class="panelhead"><div class="paneltitle">One step on this computer</div><span class="subtag">STARTS AT 50% ALLOWANCE</span></div><div class="panelbody">'
        . '<p>The setup checks for Node.js 18 or newer and git, downloads the worker, saves the token in your home folder, starts the background program, and then checks that the coordinator accepts it. It prints a plain result at the end.</p>'
        . $unix
        . '<h3>Mac or Linux: or download the file</h3>'
        . '<form method="post" action="' . h($base) . '/join/setup"><input type="hidden" name="token" value="' . h($token) . '"><input type="hidden" name="os" value="unix"><button class="button" type="submit">Download Mac or Linux setup</button></form>'
        . '<p class="quiet" style="margin-top:10px">Then run it in a terminal (no chmod needed):</p>' . commandBox('setup-file', 'sh ~/Downloads/computelab-setup.sh')
        . '<h3>Windows</h3>'
        . '<form method="post" action="' . h($base) . '/join/setup"><input type="hidden" name="token" value="' . h($token) . '"><input type="hidden" name="os" value="windows"><button class="button primary" type="submit">Download Windows setup</button></form>'
        . '<p class="quiet" style="margin-top:10px">Windows: double-click the .cmd file.</p>'
        . '<p>If Node.js is missing or too old, the setup says so and links to <a href="https://nodejs.org/">nodejs.org</a>. Git is needed too, from <a href="https://git-scm.com/">git-scm.com</a>.</p>'
        . '<h3>How much it uses, and how to stop</h3>'
        . '<p>On Home, the My computer box has one control: Off, Allowance, or Full blast, plus the allowance slider. Off lets the running job finish and takes no new work.</p>'
        . '<p class="quiet">Mac or Linux can also run <code>sh ~/.bugbrain/stop-computelab.sh</code>. Windows can close the Compute Lab task from Task Manager, using the process id in <code>%USERPROFILE%\\.bugbrain\\computelab.pid</code>.</p>'
        . '<p><a class="cta" href="' . h($base) . '/#my-computer">Go to My computer</a></p></div></section>';
    return layout('Worker token', $body, $base, $nav, ['shell' => 'shell narrow', 'foot' => copyScript()]);
}

function pageLogin(App $app, string $error = '', array $nav = []): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $body = '<section class="heading"><div><div class="eyebrow">Owner</div><h1>Owner login</h1><p>Only the owner can change projects, jobs, and every computer.</p></div></section>' . $err
        . '<section class="panel"><div class="panelbody"><form method="post" action="' . h($base) . '/owner/login"><label>Name <input name="username" autocomplete="username" required></label>'
        . '<label>Password <input name="password" type="password" autocomplete="current-password" required></label>'
        . '<button class="button primary" type="submit">Log in</button></form></div></section>';
    return layout('Owner login', $body, $base, $nav, ['shell' => 'shell narrow']);
}

function scoreChart(array $points): string
{
    if (count($points) < 2) {
        return '<p class="muted">The chart appears after two evaluations.</p>';
    }
    $width = 640;
    $height = 160;
    $step = ($width - 16) / (count($points) - 1);
    $held = '';
    $train = '';
    foreach ($points as $i => $point) {
        $x = 8 + $i * $step;
        $yHeld = 8 + (1 - max(0, min(1, (float) $point['bestHeld']))) * ($height - 16);
        $yTrain = 8 + (1 - max(0, min(1, (float) $point['bestTrain']))) * ($height - 16);
        $held .= ($i === 0 ? '' : ' ') . round($x, 1) . ',' . round($yHeld, 1);
        $train .= ($i === 0 ? '' : ' ') . round($x, 1) . ',' . round($yTrain, 1);
    }
    $grid = '';
    foreach ([0.25, 0.5, 0.75] as $g) {
        $y = round(8 + (1 - $g) * ($height - 16), 1);
        $grid .= '<line x1="8" x2="' . ($width - 8) . '" y1="' . $y . '" y2="' . $y . '" stroke="#1d2a33" stroke-width="1"></line>';
    }
    return '<svg class="chart-svg" viewBox="0 0 ' . $width . ' ' . $height . '" role="img" aria-label="Best scores over evaluations">' . $grid
        . '<polyline fill="none" stroke="#65c7f2" stroke-width="1.5" points="' . $train . '"></polyline>'
        . '<polyline fill="none" stroke="#69e2b1" stroke-width="2.5" points="' . $held . '"></polyline></svg>'
        . '<div class="legend"><span><i></i>Best held-out</span><span class="b"><i></i>Best train</span></div>';
}

function pageDiscoveries(App $app, array $nav, array $mineIds = []): string
{
    $base = $app->base();
    $items = $app->discoveries(12);
    $mine = array_flip($mineIds);
    $series = [];
    $tasks = [];
    foreach ($items as $i => $item) {
        $items[$i]['mine'] = isset($mine[$item['worker']]);
        unset($items[$i]['worker']);
        $tasks[$item['task']] = true;
    }
    foreach (array_keys($tasks) as $task) {
        $pts = [];
        foreach ($app->taskSeries($task, 120) as $p) {
            $pts[] = [round((float) $p['bestHeld'], 4), round((float) $p['held'], 4)];
        }
        $series[$task] = $pts;
    }
    $board = [];
    foreach ($app->leaderboard(12) as $row) {
        $board[] = ['name' => (string) $row['name'], 'genomes' => (int) $row['genomes'], 'records' => (int) $row['records'], 'hours' => round((float) $row['hours'], 2)];
    }
    $list = '<button class="disc active" type="button" data-index="-1"><div class="row1"><span class="t">Overview</span><span class="s">' . h((string) count($items)) . '</span></div><div class="row2"><span>All tasks · contributors</span><span></span></div></button>';
    $lastTask = '';
    foreach ($items as $i => $item) {
        if ($item['task'] !== $lastTask) {
            $list .= '<div class="group-label">Level ' . h((string) $item['level']) . ' · ' . h($item['task']) . '</div>';
            $lastTask = $item['task'];
        }
        $list .= '<button class="disc' . ($item['mine'] ? ' mine' : '') . '" type="button" data-index="' . $i . '"><div class="row1"><span class="t">#' . h((string) $item['rank']) . ' ' . h($item['task'])
            . ($item['mine'] ? '<span class="badge-mine">Your computer</span>' : '') . '</span><span class="s">' . h(number_format((float) $item['held'], 3)) . '</span></div>'
            . '<div class="row2"><span>' . h($item['finder']) . '</span><span>' . h((string) $item['neurons']) . 'n · ' . h((string) $item['synapses']) . 's</span></div></button>';
    }
    if ($items === []) {
        $list .= '<p class="muted" style="padding:8px">No discoveries yet. Finished SpikeFoundry runs upload them.</p>';
    }
    $data = ['items' => $items, 'series' => $series, 'board' => $board, 'genomeUrl' => $base . '/discoveries/genome?hash=', 'now' => $app->now(), 'mineCount' => count($mineIds)];
    $body = '<section class="heading"><div><div class="eyebrow">Discoveries · frozen designs</div><h1>What the network has found</h1><p>The best distinct designs of each task, newest level first. Designs found by your computer are marked in amber. Wiring is shown when the owner made a design public or your computer found it.</p></div></section>'
        . '<div class="split"><section class="panel" aria-label="Discoveries"><div class="panelhead"><div class="paneltitle">Discoveries</div><span class="subtag">' . h((string) count($items)) . ' DESIGNS</span></div><div class="list-scroll" id="disc-list">' . $list . '</div></section>'
        . '<section class="panel" aria-label="Discovery viewer"><div class="panelhead"><div class="paneltitle" id="v-title">Overview</div><span class="subtag" id="v-tag">ALL TASKS</span></div><div class="viewer-scroll" id="viewer"></div></section></div>'
        . '<script type="application/json" id="disc-data">' . jsonForHtml($data) . '</script>';
    $foot = '<script src="' . h($base . '/assets/engine.js') . '" defer></script><script>' . discoveriesJs() . '</script>';
    return layout('Discoveries', $body, $base, $nav, ['fit' => true, 'shell' => 'shell split-shell', 'foot' => $foot]);
}

function discoveriesJs(): string
{
    return <<<'JS'
(function(){
var D=JSON.parse(document.getElementById('disc-data').textContent),V=document.getElementById('viewer'),T=document.getElementById('v-title'),G=document.getElementById('v-tag'),cache={};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function ago(iso){var d=(Date.parse(D.now)-Date.parse(iso))/1000;if(!(d>=0))return iso;if(d<90)return 'just now';if(d<5400)return Math.round(d/60)+' min ago';if(d<129600)return Math.round(d/3600)+' h ago';return Math.round(d/86400)+' days ago';}
function metric(l,v,n,a){return '<div class="metric'+(a?' accent':'')+'"><div class="metriclabel">'+esc(l)+'</div><div class="metricvalue">'+v+'</div><div class="metricnote">'+esc(n||'')+'</div></div>';}
function f3(x){return x==null?'—':Number(x).toFixed(3);}
/* Genome v2 compile, same rules as spikefoundry/genome_v2.js. v1 genomes are converted first. */
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function fromV1(g){var h=clamp(Math.round(g.nodes||2),1,8),m=g.topology==='memory'?'delay-line':g.topology==='routed'?'wta':'coincidence';return{v:2,modules:[{id:'in',kind:'input',n:2},{id:'e',kind:'lif',n:h,sign:1,thr:g.thr||1.2,leak:g.decay||.5,motif:m},{id:'i',kind:'lif',n:1,sign:-1,thr:g.thr||1.2,leak:g.decay||.5},{id:'out',kind:'output',n:1}],wires:[{from:'in',to:'e',pattern:'all',weight:g.wa||1,delay:0},{from:'e',to:'i',pattern:'one',weight:(g.wb||1)*.5,delay:g.topology==='memory'?1:0},{from:'i',to:'e',pattern:'lateral',weight:.3,delay:0},{from:'e',to:'out',pattern:'feedforward',weight:Math.max(g.wa||1,g.wb||1),delay:0}]};}
function compile(g){if(!g.modules)g=fromV1(g);var mods=(g.modules||[]).slice(0,6).map(function(m){return{id:String(m.id||'m'),kind:m.kind==='input'||m.kind==='output'?m.kind:'lif',n:clamp(Math.round(m.n||1),1,8),sign:m.sign<0?-1:1,thr:clamp(m.thr==null?1:m.thr,.4,3),leak:clamp(m.leak==null?.8:m.leak,.1,.95),motif:m.motif||''};});
var ns=[],range={};mods.forEach(function(m,mi){var s=ns.length;for(var i=0;i<m.n;i++)ns.push({kind:m.kind,thr:m.thr,leak:m.leak,sign:m.sign,mod:mi,idx:i});range[m.id]={start:s,n:m.n,sign:m.sign};});
var es=[];(g.wires||[]).slice(0,8).forEach(function(w){var a=range[w.from],b=range[w.to];if(!a||!b)return;var wt=clamp(w.weight==null?.5:w.weight,-2,2)*(w.from==='in'||a.sign>0?1:-1),dl=clamp(Math.round(w.delay||0),0,4);
for(var i=0;i<a.n;i++){var t=[];if(w.pattern==='all'){for(var j=0;j<b.n&&t.length<3;j++)t.push(j);}else if(w.pattern==='feedforward'){t.push(i%b.n);if(b.n>1)t.push((i+1)%b.n);}else if(w.pattern==='lateral'){t.push((i+1)%b.n);}else t.push(i%b.n);
t.forEach(function(j){if(es.length<64)es.push({from:a.start+i,to:b.start+j,weight:wt,delay:dl});});}});
return{mods:mods,neurons:ns,edges:es,inputs:ns.map(function(n,i){return n.kind==='input'?i:-1;}).filter(function(i){return i>=0;}),outputs:ns.map(function(n,i){return n.kind==='output'?i:-1;}).filter(function(i){return i>=0;})};}
function netSvg(net){var W=760,H=260,cols=net.mods.length,pos=[];net.neurons.forEach(function(n,i){var m=net.mods[n.mod],x=60+(cols>1?n.mod*(W-120)/(cols-1):W/2),y=H/2+(n.idx-(m.n-1)/2)*Math.min(44,(H-60)/Math.max(1,m.n));pos.push([x,y]);});
var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Network diagram">';
net.mods.forEach(function(m,mi){var x=60+(cols>1?mi*(W-120)/(cols-1):W/2);s+='<text class="net-label" x="'+x+'" y="18" text-anchor="middle">'+esc((m.kind==='lif'?(m.sign<0?'INHIB ':'EXCIT ')+m.id:m.kind).toUpperCase())+'</text>';});
net.edges.forEach(function(e){var a=pos[e.from],b=pos[e.to],dx=b[0]-a[0],bend=dx<=0?-60:0,mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2+bend+(dx===0?-30:0);s+='<path class="wire'+(e.weight<0?' inhib':'')+(e.delay>0?' delay':'')+'" d="M'+a[0]+' '+a[1]+' Q'+mx+' '+my+' '+b[0]+' '+b[1]+'" stroke-width="'+(1+Math.min(2.5,Math.abs(e.weight)*1.2)).toFixed(1)+'" opacity=".85"><title>w '+e.weight.toFixed(2)+(e.delay?' · delay '+e.delay:'')+'</title></path>';});
net.neurons.forEach(function(n,i){var p=pos[i],c=n.kind==='input'?'node-input':n.kind==='output'?'node-output':n.sign<0?'node-inhib':'node-hidden';s+='<circle class="'+c+'" cx="'+p[0]+'" cy="'+p[1]+'" r="11"><title>'+esc(n.kind)+(n.kind==='lif'?' thr '+n.thr.toFixed(2)+' leak '+n.leak.toFixed(2):'')+'</title></circle>';});
return s+'</svg>';}
function sample(task,nIn){try{var SF=window.SpikeFoundry;if(SF&&SF.taskSamples){var s=SF.taskSamples(task,1,true,7);if(s&&s[0]&&s[0].seq)return s[0].seq;}}catch(e){}var seq=[];for(var t=0;t<10;t++){var row=[];for(var i=0;i<nIn;i++)row.push(t===2+i*(task==='sequence'?2:0)||t===6?1:0);seq.push(row);}return seq;}
function simulate(net,seq){var N=net.neurons.length,mem=new Array(N).fill(0),spk=new Array(N).fill(0),H=seq.length+4,inbox=[],raster=[];for(var t=0;t<H+6;t++)inbox.push(new Array(N).fill(0));
for(t=0;t<H;t++){for(var i=0;i<net.inputs.length;i++)spk[net.inputs[i]]=t<seq.length?(seq[t][i]||0):0;for(i=0;i<N;i++){var n=net.neurons[i];if(n.kind==='input')continue;mem[i]=n.leak*mem[i]+inbox[t][i];spk[i]=0;if(mem[i]>=n.thr){spk[i]=1;mem[i]=0;}}
raster.push(spk.slice());for(var e=0;e<net.edges.length;e++){var ed=net.edges[e];if(!spk[ed.from])continue;var w=t+ed.delay+1;if(w<inbox.length)inbox[w][ed.to]+=ed.weight;}}return raster;}
function rasterSvg(net,r){var N=net.neurons.length,T=r.length,W=360,rh=Math.max(8,Math.min(16,180/N)),H=N*rh+26,cw=(W-50)/T,s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Spike raster">';
for(var i=0;i<N;i++){var n=net.neurons[i],col=n.kind==='input'?'#69e2b1':n.kind==='output'?'#ffca76':n.sign<0?'#b5a4ff':'#65c7f2';s+='<text x="2" y="'+(i*rh+rh*.75+4)+'" fill="#6e808e" font-size="8" font-family="monospace">'+(n.kind==='input'?'in':n.kind==='output'?'out':(n.sign<0?'i':'e'))+n.idx+'</text>';
for(var t=0;t<T;t++)if(r[t][i])s+='<rect x="'+(40+t*cw)+'" y="'+(i*rh+2)+'" width="'+Math.max(2,cw-2)+'" height="'+(rh-3)+'" rx="2" fill="'+col+'"/>';}
s+='<text x="40" y="'+(H-6)+'" fill="#6e808e" font-size="9" font-family="monospace">time step 0 → '+(T-1)+'</text>';return s+'</svg>';}
function historySvg(pts,mark){if(!pts||pts.length<2)return '<p class="muted">The score history appears after two job summaries.</p>';var W=360,H=150,n=pts.length,b='',d='';pts.forEach(function(p,i){var x=8+i*(W-16)/(n-1);b+=(i?' ':'')+x.toFixed(1)+','+(8+(1-clamp(p[0],0,1))*(H-16)).toFixed(1);d+='<circle cx="'+x.toFixed(1)+'" cy="'+(8+(1-clamp(p[1],0,1))*(H-16)).toFixed(1)+'" r="1.6" fill="#65c7f2" opacity=".6"/>';});
var my=(8+(1-clamp(mark,0,1))*(H-16)).toFixed(1);return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Score history">'+d+'<polyline fill="none" stroke="#69e2b1" stroke-width="2" points="'+b+'"/><line x1="8" x2="'+(W-8)+'" y1="'+my+'" y2="'+my+'" stroke="#ffca76" stroke-dasharray="4 3"/></svg><div class="legend"><span><i></i>Best held-out</span><span class="b"><i></i>Each job</span><span class="c"><i></i>This design</span></div>';}
function overview(){T.textContent='Overview';G.textContent='ALL TASKS';var by={};D.items.forEach(function(it){if(!by[it.task]||it.held>by[it.task].held)by[it.task]=it;});
var h='<div class="metrics">'+metric('Designs listed',D.items.length,'best distinct per task',true)+metric('Tasks',Object.keys(by).length,'curriculum levels reached')+metric('Yours',D.items.filter(function(i){return i.mine;}).length,D.mineCount?'found by your computer':'link a computer on Home')+metric('Contributors',D.board.length,'with public credit or Anonymous')+'</div>';
h+='<div class="viz-title"><strong>Best per task</strong><span>held-out score</span></div><div class="tasks">';Object.keys(by).forEach(function(k){var it=by[k];h+='<div class="taskcard"><div class="taskline"><span class="taskname">Level '+it.level+' · '+esc(k)+'</span><span class="taskscore">'+f3(it.held)+'</span></div><div class="taskdesc2">'+esc(it.finder)+' · '+it.neurons+' neurons · '+it.synapses+' synapses · '+esc(ago(it.when))+'</div><div class="prog"><i style="width:'+Math.round(100*clamp(it.held,0,1))+'%"></i></div></div>';});
h+='</div><div class="viz-title"><strong>Contributors</strong><span>evaluation time donated</span></div><div class="log">';D.board.forEach(function(b){h+='<div class="logline"><span class="logtime">'+b.hours.toFixed(2)+' h</span><span class="logtext">'+esc(b.name)+'</span><span class="logscore">'+b.genomes+' designs</span></div>';});if(!D.board.length)h+='<p class="muted">No public results yet.</p>';V.innerHTML=h+'</div>';}
function show(i){if(i<0)return overview();var it=D.items[i];T.innerHTML=esc('#'+it.rank+' '+it.task)+(it.mine?'<span class="badge-mine">Your computer</span>':'');G.textContent='LEVEL '+it.level;
var h='<div class="chips" style="margin-bottom:12px"><span class="chip">genome <b>'+esc(it.hash.slice(0,12))+'</b></span><span class="chip'+(it.mine?' mine':'')+'">found by '+esc(it.finder)+'</span><span class="chip">'+esc(ago(it.when))+'</span>'+(it.public?'<span class="chip"><b>public</b></span>':'')+'</div>';
h+='<div class="metrics">'+metric('Held-out score',f3(it.held),'size penalty included',true)+metric('Train score',f3(it.train),it.accuracy!=null?'accuracy '+f3(it.accuracy):'')+metric('Circuit size',it.neurons+'<small> / '+it.synapses+'</small>','neurons / synapses')+metric('Spikes',it.spikes,'on held-out cases · '+it.evalMs+' ms')+'</div>';
h+='<div class="viz-title"><strong>Frozen network</strong><span id="net-note">loading…</span></div><div class="stage" id="net"><div class="private">Loading the wiring…</div></div>';
h+='<div class="viz-grid"><div><div class="viz-title"><strong>Spike raster</strong><span>one held-out sample</span></div><div class="stage" id="raster"><div class="private">Needs the wiring.</div></div></div><div><div class="viz-title"><strong>Score history · '+esc(it.task)+'</strong><span>'+((D.series[it.task]||[]).length)+' jobs</span></div>'+historySvg(D.series[it.task],it.held)+'</div></div>';
V.innerHTML=h;V.scrollTop=0;var hash=it.hash;
function draw(g){if(D.items[cur]!==it)return;var net=compile(g);document.getElementById('net').innerHTML=netSvg(net);document.getElementById('net-note').textContent=net.neurons.length+' neurons · '+net.edges.length+' synapses · weights fixed';try{document.getElementById('raster').innerHTML=rasterSvg(net,simulate(net,sample(it.task,net.inputs.length)));}catch(e){document.getElementById('raster').innerHTML='<div class="private">Could not simulate this design here.</div>';}}
function priv(){if(D.items[cur]!==it)return;document.getElementById('net-note').textContent='private';document.getElementById('net').innerHTML='<div class="private">The wiring of this design is private until the owner publishes it.<br>Its size: '+it.neurons+' neurons and '+it.synapses+' synapses.</div>';document.getElementById('raster').innerHTML='<div class="private">Shown with the wiring.</div>';}
if(cache[hash]===false)return priv();if(cache[hash])return draw(cache[hash]);
fetch(D.genomeUrl+encodeURIComponent(hash),{credentials:'same-origin'}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(g){cache[hash]=g;draw(g);}).catch(function(){cache[hash]=false;priv();});}
var cur=-1,btns=[].slice.call(document.querySelectorAll('#disc-list .disc'));
function pick(b){btns.forEach(function(x){x.classList.toggle('active',x===b);});cur=+b.getAttribute('data-index');show(cur);}
btns.forEach(function(b){b.addEventListener('click',function(){pick(b);});});
document.getElementById('disc-list').addEventListener('keydown',function(e){if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;var i=btns.indexOf(document.activeElement);if(i<0)return;var n=btns[i+(e.key==='ArrowDown'?1:-1)];if(n){e.preventDefault();n.focus();pick(n);n.scrollIntoView({block:'nearest'});}});
overview();
})();
JS;
}

function taskHealthSection(App $app, string $csrf, string $base): array
{
    $tasks = $app->watchedTasks();
    $banner = '';
    $cards = '';
    $forms = '';
    foreach ($tasks as $health) {
        $task = (string) ($health['task_id'] ?? '');
        $status = (string) $health['status'];
        if ($status === 'Stalled' || $status === 'Overfitting') {
            $banner .= '<p><strong>' . h($task) . '</strong> is ' . h($status) . '.</p>';
        }
        $policy = $health['policy'];
        $shown = $health['points'];
        if (count($shown) > 80) {
            $shown = array_slice($shown, count($shown) - 80);
        }
        $cards .= '<section class="panel"><div class="panelhead"><div class="paneltitle">' . h($task) . '</div><span class="subtag">' . h(strtoupper($status)) . '</span></div><div class="panelbody">'
            . scoreChart($shown)
            . '<p class="quiet" style="margin-top:8px">' . h((string) $health['designer']['label']) . '</p>'
            . ($policy['paused'] ? '<p class="quiet">' . ($policy['pause_reason'] === 'solved' ? 'Solved. Jobs moved on automatically.' : 'Paused.') . ' New claims skip this task.' . ($policy['advanced_to'] !== '' ? ' Next level: ' . h((string) $policy['advanced_to']) : '') . '</p>' : '')
            . '</div></section>';
        $forms .= '<h3>' . h($task) . '</h3><form method="post" action="' . h($base) . '/owner/task-policy"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="project" value="spikefoundry"><input type="hidden" name="task" value="' . h($task) . '"><div class="form-grid">'
            . '<label>Minimum relative gain <input name="delta" type="number" min="0" max="1" step="0.001" value="' . h((string) $policy['stall_delta']) . '"></label>'
            . '<label>Evaluation window <input name="evals" type="number" min="2" max="100000" value="' . h((string) $policy['stall_evals']) . '"></label>'
            . '<label>Compute hours in that window <input name="hours" type="number" min="0" max="10000" step="0.1" value="' . h((string) $policy['stall_hours']) . '"></label>'
            . '<label>When it stalls <select name="action"><option value="flag"' . ($policy['stall_action'] === 'flag' ? ' selected' : '') . '>Flag it</option><option value="pause"' . ($policy['stall_action'] === 'pause' ? ' selected' : '') . '>Pause the task</option><option value="advance"' . ($policy['stall_action'] === 'advance' ? ' selected' : '') . '>Advance to the next level</option></select></label>'
            . '<label>Solved at best held-out score <input name="solve_score" type="number" min="0" max="1" step="0.001" value="' . h((string) $policy['solve_score']) . '"></label>'
            . '<label>Job summaries needed first <input name="solve_jobs" type="number" min="1" max="1000" value="' . h((string) $policy['solve_jobs']) . '"></label>'
            . '</div><label><input type="checkbox" name="auto_advance" value="1"' . ((int) $policy['auto_advance'] === 1 ? ' checked' : '') . '> Advance to the next task when solved</label>'
            . '<button class="small" type="submit">Save thresholds</button></form>';
    }
    if ($cards === '') {
        $cards = '<p class="muted">Charts appear after the first design upload.</p>';
    }
    $bannerHtml = $banner !== '' ? '<section class="panel"><div class="panelhead"><div class="paneltitle">Needs attention</div></div><div class="panelbody">' . $banner . '</div></section>' : '';
    return [$bannerHtml . $cards, $forms];
}

function designLibrarySection(App $app, string $csrf, string $base): string
{
    $task = 'coincidence';
    try {
        $top = $app->topDesigns($task, 5);
    } catch (InvalidArgumentException $e) {
        $top = [];
    }
    $list = '';
    foreach ($top as $row) {
        $who = $app->db->prepare('SELECT name, public_credit FROM workers WHERE id = ?');
        $who->execute([(string) ($row['worker_id'] ?? '')]);
        $finder = $who->fetch();
        $credit = $finder ? $app->creditName($finder) : 'Anonymous';
        $list .= '<div class="logline"><span class="logtime">' . h(number_format((float) $row['quality'], 3)) . '</span><span class="logtext">' . h($credit) . ' · ' . h(substr((string) $row['genome_hash'], 0, 16)) . ' · <a href="' . h($base . '/owner/designs/genome?hash=' . $row['genome_hash']) . '">Download genome</a></span>'
            . '<span><form method="post" action="' . h($base) . '/owner/design-public"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="hash" value="' . h((string) $row['genome_hash']) . '"><input type="hidden" name="shown" value="1"><button class="small" type="submit">Mark public</button></form></span></div>';
    }
    if ($list === '') {
        $list = '<p class="muted">No saved designs yet. Finished SpikeFoundry runs upload them.</p>';
    }
    return '<section class="panel"><div class="panelhead"><div class="paneltitle">Design library</div><span class="subtag">TOP COINCIDENCE DESIGNS</span></div><div class="panelbody"><p class="quiet">Weights stay frozen. The same genome is stored once.</p><div class="log">' . $list . '</div>'
        . '<p style="margin-top:10px"><a href="' . h($base . '/owner/designs/export?format=jsonl&task=coincidence') . '">Export JSONL</a> · <a href="' . h($base . '/owner/designs/export?format=csv&task=coincidence') . '">Export CSV</a></p>'
        . '<form method="post" action="' . h($base) . '/owner/design-seed"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="template" value="sf-vision"><input type="hidden" name="task" value="coincidence"><input type="hidden" name="count" value="3"><label>Seed <input name="seed" type="number" min="1" max="1000000" value="11"></label><button class="small" type="submit">Seed new job from top designs</button></form></div></section>';
}

function healthBadge(array $health): string
{
    $cls = $health['level'] === 'ok' ? '' : ($health['level'] === 'warn' ? 'warn' : 'off');
    $color = $health['level'] === 'bad' ? ' style="color:var(--red)"' : '';
    return '<p class="status ' . h($cls) . '"' . $color . ' data-health><i class="led ' . h($cls) . '"' . ($health['level'] === 'bad' ? ' style="background:var(--red);box-shadow:0 0 9px #ff818aaa"' : '') . '></i>' . h($health['line']) . '</p>'
        . ($health['hint'] !== '' ? '<p class="quiet" data-hint>' . h($health['hint']) . '</p>' : '');
}

function diagnosticsPanel(App $app, string $workerId): string
{
    $reports = $app->latestDiagnostics($workerId, 6);
    if ($reports === []) {
        return '<details class="advanced diag"><summary>Diagnostics</summary><div class="inner"><p class="muted">No report from this computer yet. Workers from this version on send one at startup, on errors, and when setup finishes.</p></div></details>';
    }
    $r = $reports[0];
    $b = json_decode((string) $r['body_json'], true);
    if (!is_array($b)) {
        $b = [];
    }
    $row = function (string $k, $v): string {
        if ($v === null || $v === '' || $v === []) {
            return '';
        }
        if (is_bool($v)) {
            $v = $v ? 'yes' : 'no';
        }
        if (is_array($v)) {
            $v = json_encode($v);
        }
        return '<div class="logline"><span class="logtime">' . h($k) . '</span><span class="logtext" style="white-space:normal">' . h((string) $v) . '</span><span></span></div>';
    };
    $err = isset($b['lastError']) && is_array($b['lastError']) ? $b['lastError'] : null;
    $checks = '';
    if (isset($b['checks']) && is_array($b['checks'])) {
        foreach ($b['checks'] as $c) {
            if (is_array($c)) {
                $checks .= '<div class="logline"><span class="logtime">' . (!empty($c['ok']) ? '✓' : '✗') . ' ' . h((string) ($c['name'] ?? '')) . '</span><span class="logtext" style="white-space:normal">' . h((string) ($c['detail'] ?? '')) . '</span><span></span></div>';
            }
        }
    }
    $html = '<details class="advanced diag"><summary>Diagnostics · ' . h((string) $r['kind']) . ' report ' . h(agoText(strtotime($app->now()) - strtotime((string) $r['created_at']))) . '</summary><div class="inner">'
        . '<p class="' . ((int) $r['ok'] === 1 ? 'ok' : 'err') . '">' . h((string) $r['summary']) . '</p><div class="log">'
        . $row('OS', trim((string) ($b['distro'] ?? '') . ' ' . (string) ($b['os'] ?? '')))
        . $row('Arch', $b['arch'] ?? null)
        . $row('Node', $b['node'] ?? null)
        . $row('Cores / RAM', isset($b['cores']) ? $b['cores'] . ' cores · ' . ($b['ramGB'] ?? '?') . ' GB' : null)
        . $row('Code', $b['codeSha'] ?? null)
        . $row('Protocol', isset($b['protocolMatch']) ? ($b['protocolMatch'] ? 'matches the server' : 'does not match the server') : (isset($b['protocolHash']) ? substr((string) $b['protocolHash'], 0, 16) : null))
        . $row('Install', $b['install'] ?? null)
        . $row('Restarts', $b['restarts'] ?? null)
        . $row('Exit code', $b['exitCode'] ?? null)
        . $row('Hint', $b['hint'] ?? null)
        . '</div>' . ($checks !== '' ? '<h3>Setup checks</h3><div class="log">' . $checks . '</div>' : '');
    if ($err) {
        $html .= '<h3>Last error</h3><pre class="code">' . h((string) ($err['message'] ?? '')) . "\n" . h((string) ($err['stack'] ?? '')) . '</pre>';
    }
    if (!empty($b['stderrTail']) && is_array($b['stderrTail'])) {
        $html .= '<h3>Error output</h3><pre class="code">' . h(implode("\n", array_map('strval', $b['stderrTail']))) . '</pre>';
    }
    if (!empty($b['log']) && is_array($b['log'])) {
        $html .= '<h3>Last log lines</h3><pre class="code">' . h(implode("\n", array_map('strval', $b['log']))) . '</pre>';
    }
    if (count($reports) > 1) {
        $html .= '<h3>Earlier reports</h3><div class="log">';
        foreach (array_slice($reports, 1) as $old) {
            $html .= '<div class="logline"><span class="logtime">' . h(agoText(strtotime($app->now()) - strtotime((string) $old['created_at']))) . '</span><span class="logtext">' . h((string) $old['summary']) . '</span><span class="logscore">' . h((string) $old['kind']) . '</span></div>';
        }
        $html .= '</div>';
    }
    return $html . '</div></details>';
}

function pageOwner(App $app, string $csrf, array $nav = [], string $error = '', string $status = 'all', int $page = 1): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $projects = $app->db->query('SELECT * FROM projects ORDER BY priority DESC, id ASC')->fetchAll();
    $templates = $app->db->query('SELECT * FROM templates ORDER BY id')->fetchAll();
    $workers = $app->db->query('SELECT * FROM workers ORDER BY created_at DESC')->fetchAll();
    $people = '';
    foreach ($workers as $w) {
        $leases = $app->leasesOf((string) $w['id']);
        $state = describeWorker($app, $w, $leases);
        $health = $app->healthOf($w);
        $done = $app->contribution((string) $w['id']);
        $revoked = (int) $w['revoked'] === 1;
        $controls = '';
        if (!$revoked) {
            $controls = resourceControl($base . '/owner/resources', $csrf, $w, $state)
                . '<div class="head-actions"><form method="post" action="' . h($base) . '/owner/revoke" onsubmit="return confirm(\'Revoke this computer\\\'s token?\')"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $w['id']) . '"><button class="button small stop" type="submit">Revoke</button></form>'
                . newSetupForm($base . '/owner/setup-command', $csrf, (string) $w['id']) . '</div>';
        }
        $jobs = [];
        foreach ($leases as $l) {
            $jobs[] = (string) $l['title'];
        }
        $people .= '<div class="computer"><div class="computer-top"><span class="computer-name">' . h((string) $w['name']) . '</span><span class="subtag">' . h($revoked ? 'REVOKED' : strtoupper(modeLabel($state['mode'], (int) $state['pct']))) . '</span></div>'
            . '<p class="status-line">' . h($revoked ? 'Token revoked' : $state['line']) . '</p>'
            . healthBadge($health)
            . '<p class="quiet">' . ($state['ago'] !== '' ? 'Last seen ' . h($state['ago']) : 'Not seen yet') . ' · current jobs ' . h($jobs === [] ? 'none' : implode(', ', $jobs)) . ' · ' . h((string) $done['done']) . ' jobs done</p>'
            . $controls . diagnosticsPanel($app, (string) $w['id']) . '</div>';
    }
    $filters = ['all' => 'All', 'queued' => 'Queued', 'running' => 'Running', 'done' => 'Done', 'held' => 'Held'];
    $filterHtml = '<div class="filters">';
    foreach ($filters as $key => $label) {
        $on = $status === $key;
        $filterHtml .= '<a href="' . h($base . '/owner?status=' . rawurlencode($key) . '&page=1') . '"' . ($on ? ' class="is-current" aria-current="page"' : '') . '>' . h($label) . '</a>';
    }
    $filterHtml .= '</div>';
    $listed = $app->listJobs($status, $page, 20);
    $rows = '';
    foreach ($listed['rows'] as $job) {
        $label = jobStatusLabel((string) $job['status']);
        $requeue = '';
        if ((string) $job['status'] === 'held' && (int) $job['attempts'] > 0) {
            $requeue = '<form method="post" action="' . h($base) . '/owner/requeue"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $job['id']) . '"><button class="small" type="submit">Requeue and reset attempts</button></form>';
        }
        $rows .= '<tr><td><strong>' . h((string) $job['title']) . '</strong><br><span class="quiet">' . h((string) $job['id']) . '</span></td>'
            . '<td>' . h((string) $job['project_id']) . '</td><td>' . h($label) . '</td><td>' . h((string) $job['attempts']) . '</td>'
            . '<td>' . h((string) ($job['last_error'] ?? '')) . $requeue . '</td></tr>';
    }
    if ($rows === '') {
        $rows = '<tr><td class="muted">No jobs in this list.</td></tr>';
    }
    $pager = '<p class="quiet">Page ' . h((string) $listed['page']) . ' of ' . h((string) $listed['pages']) . ' · ' . h((string) $listed['total']) . ' jobs</p>';
    if ($listed['page'] > 1) {
        $pager .= '<a href="' . h($base . '/owner?status=' . rawurlencode($status) . '&page=' . ($listed['page'] - 1)) . '">Previous</a> ';
    }
    if ($listed['page'] < $listed['pages']) {
        $pager .= '<a href="' . h($base . '/owner?status=' . rawurlencode($status) . '&page=' . ($listed['page'] + 1)) . '">Next</a>';
    }
    $proj = '';
    $summary = '';
    foreach ($projects as $p) {
        $summary .= '<span class="chip">' . h(projectNiceName((string) $p['id'], (string) $p['title'])) . ' · priority <b>' . h((string) $p['priority']) . '</b> · ' . ((int) $p['enabled'] ? 'enabled' : 'off') . '</span>';
        $proj .= '<h3>' . h((string) $p['title']) . ' <span class="quiet">' . h((string) $p['id']) . ' · priority ' . h((string) $p['priority']) . ' · ' . ((int) $p['enabled'] ? 'enabled' : 'off') . ' · ' . h((string) ($p['family'] ?? '')) . '</span></h3><p class="quiet">' . h((string) $p['summary']) . '</p>'
            . '<form method="post" action="' . h($base) . '/owner/project"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $p['id']) . '"><div class="form-grid">'
            . '<label>Priority <input name="priority" type="number" min="0" max="100" value="' . h((string) $p['priority']) . '"></label></div>'
            . '<label><input type="checkbox" name="enabled" value="1"' . ((int) $p['enabled'] ? ' checked' : '') . '> Enabled</label>'
            . '<button class="small" type="submit">Save project</button></form>'
            . '<form method="post" action="' . h($base) . '/owner/supply"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $p['id']) . '">'
            . '<label><input type="checkbox" name="auto" value="1"' . ($app->projectAutoOn($p) ? ' checked' : '') . '> Auto-create jobs</label><div class="form-grid">'
            . '<label>Low-water mark (0 = one per busy slot) <input name="low" type="number" min="0" max="100" value="' . h((string) ($p['low_water'] ?? 0)) . '"></label>'
            . '<label>Cap on waiting jobs <input name="cap" type="number" min="1" max="100" value="' . h((string) ($p['queue_cap'] ?? 8)) . '"></label>'
            . '<label>Evaluations per job (0 = time budget) <input name="evals" type="number" min="0" max="250000" value="' . h((string) ($p['evals_per_job'] ?? 0)) . '"></label>'
            . '<label>Target seconds per job <input name="seconds" type="number" min="1" max="3600" value="' . h((string) ($p['target_seconds'] ?? 180)) . '"></label>'
            . '<label>Top designs kept <input name="keep" type="number" min="1" max="200" value="' . h((string) ($p['keep_top'] ?? 50)) . '"></label>'
            . '<label>Random checks kept <input name="random" type="number" min="0" max="2000" value="' . h((string) ($p['keep_random'] ?? 500)) . '"></label>'
            . '</div><p class="quiet">Auto-created: ' . h((string) ($p['auto_created'] ?? 0)) . '. ' . h((string) ($p['auto_note'] ?? '')) . '</p>'
            . '<button class="small" type="submit">Save auto jobs</button></form>';
    }
    $runnerOpts = '';
    foreach ($app->allowedRunners() as $runner) {
        $runnerOpts .= '<option value="' . h($runner) . '">' . h($runner) . '</option>';
    }
    $opts = '';
    foreach ($templates as $t) {
        $opts .= '<option value="' . h((string) $t['id']) . '">' . h((string) $t['title']) . '</option>';
    }
    list($health, $thresholds) = taskHealthSection($app, $csrf, $base);
    $advanced = '<details class="advanced"><summary>Advanced · job length, supply, thresholds, new projects</summary><div class="inner">'
        . '<p class="quiet">Participants never see these. Job length, evaluations, and kept designs apply to every computer. A job that fails three times is held until you requeue it.</p>'
        . '<h2>Projects</h2>' . $proj
        . '<h2 style="margin-top:18px">New project</h2><form method="post" action="' . h($base) . '/owner/project-create"><input type="hidden" name="csrf" value="' . h($csrf) . '">'
        . '<label>Name <input name="title" required maxlength="80"></label>'
        . '<label>Description <textarea name="summary" required maxlength="400"></textarea></label>'
        . '<div class="form-grid"><label>Runner <select name="runner">' . $runnerOpts . '</select></label>'
        . '<label>Priority <input name="priority" type="number" min="0" max="100" value="1"></label></div>'
        . '<label><input type="checkbox" name="enabled" value="1" checked> Enabled</label>'
        . '<button class="small" type="submit">Create project</button></form>'
        . '<h2 style="margin-top:18px">New job from a template</h2><form method="post" action="' . h($base) . '/owner/job"><input type="hidden" name="csrf" value="' . h($csrf) . '"><div class="form-grid">'
        . '<label>Template <select name="template">' . $opts . '</select></label>'
        . '<label>Title <input name="title" required maxlength="120"></label>'
        . '<label>Priority <input name="priority" type="number" min="0" max="5" step="0.1" value="0.5"></label>'
        . '<label>Seed <input name="seed" type="number" min="1" max="1000000" value="7"></label></div>'
        . '<button class="small" type="submit">Queue job</button></form>'
        . '<h2 style="margin-top:18px">Task thresholds</h2>' . ($thresholds !== '' ? $thresholds : '<p class="muted">Thresholds appear after the first design upload.</p>')
        . '</div></details>';
    $body = $err . '<section class="heading"><div><div class="eyebrow">Owner console</div><h1>Owner</h1><p>Computers, jobs, and task health. A running job stays with its computer while its heartbeat renews the lease. The detailed job settings are under Advanced.</p></div><div class="head-actions"><div class="chips">' . $summary . '</div></div></section>'
        . '<div class="grid2"><div class="stack">'
        . '<section class="panel" id="computers"><div class="panelhead"><div class="paneltitle">Computers</div><span class="subtag">' . h((string) count($workers)) . ' ENROLLED</span></div><div class="panelbody">' . addComputerButton($base) . ($people !== '' ? $people : '<p class="muted">None enrolled.</p>') . '</div></section>'
        . '<section class="panel"><div class="panelhead"><div class="paneltitle">Jobs</div></div><div class="panelbody">' . $filterHtml . '<table><thead><tr><th>Job</th><th>Project</th><th>Status</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>' . $rows . '</tbody></table>' . $pager . '</div></section>'
        . '</div><div class="stack">' . $health . designLibrarySection($app, $csrf, $base) . '</div></div>'
        . $advanced;
    return layout('Owner', $body, $base, $nav, ['foot' => resourceScript()]);
}
