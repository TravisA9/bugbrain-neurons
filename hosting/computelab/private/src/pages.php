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

/* The note under the Resources heading. {since} is the last heartbeat; the page shows it as a local clock time.
 * Stopped is not the same as a chosen Off: the saved setting is kept and comes back when the worker runs again. */
function runNote(array $run, string $saved, int $now, string $savedLabel): array
{
    $wd = (string) $run['watchdog'];
    $noWatchdog = 'This computer has no watchdog (older setup), so it cannot restart by itself: run the setup command on it again (New setup command, below).';
    if ($run['run'] === 'running') {
        return ['note' => '', 'sub' => $wd === 'none' ? $noWatchdog : ''];
    }
    if ($run['run'] === 'starting') {
        return ['note' => 'Starting… waiting for this computer to check in.',
            'sub' => $wd === '' || $wd === 'none' ? 'If it does not start within a few minutes, this computer may have no watchdog (older setup): run the setup command on it again.' : 'Its watchdog starts the worker within about 3 minutes while the computer is on and awake.'];
    }
    if ($run['run'] === 'stopped') {
        if ($saved === 'off') {
            return ['note' => 'Off, and not running since {since}.', 'sub' => $wd === 'none' ? $noWatchdog : ''];
        }
        if ($run['requested'] !== '') {
            $mins = max(1, (int) round(($now - strtotime($run['requested'])) / 60));
            return ['note' => 'Stopped — still not running ' . $mins . ' min after it was turned on (last seen {since}).',
                'sub' => 'Is the computer on and awake? If it is, run the setup command on it again; that adds the watchdog older setups lack.'];
        }
        return ['note' => 'Stopped — not running since {since}. Turn it on to restart.',
            'sub' => $wd === '' || $wd === 'none' ? $noWatchdog : 'Saved setting: ' . $savedLabel . '. Its watchdog restarts it within about 3 minutes once the computer is on and awake.'];
    }
    return ['note' => '', 'sub' => ''];
}

/* The run-state fields the page script needs (status.json and the save reply). */
function runFields(array $state): array
{
    return ['run' => $state['run'], 'since' => $state['since'], 'shown' => $state['shown'], 'saved' => $state['mode'], 'runNote' => $state['runNote'], 'runSub' => $state['runSub'], 'watchdog' => $state['watchdog']];
}

/* Owner console name color uses the SpikeFoundry palette:
 * mint when Full blast is running, amber when Allowance is running, red when the
 * computer is dead (offline, stopped, or a stale heartbeat). A chosen Off that is
 * still checking in is muted, not red: it is intentionally idle, not dead. */
function ownerTone(array $state): string
{
    if (($state['run'] ?? '') === 'starting') {
        return 'starting';
    }
    if (($state['run'] ?? '') !== 'running' || empty($state['online'])) {
        return 'dead';
    }
    $mode = (string) ($state['mode'] ?? '');
    if ($mode === 'full') {
        return 'full';
    }
    if ($mode === 'allowance') {
        return 'allowance';
    }
    return 'off';
}

function ownerJobsLine(array $state): string
{
    if (($state['run'] ?? '') === 'starting') {
        return 'Starting…';
    }
    $n = (int) ($state['jobs'] ?? 0);
    if ($n <= 0) {
        return 'Idle';
    }
    return $n === 1 ? 'Running 1 job at once' : 'Running ' . $n . ' jobs at once';
}

/* Problems only: the owner list drops the "Healthy" badge so rows stay dense. */
function ownerHealthNote(array $health): string
{
    if ($health['level'] === 'ok') {
        return '';
    }
    $cls = $health['level'] === 'warn' ? 'warn' : 'off';
    $color = $health['level'] === 'bad' ? ' style="color:var(--red)"' : '';
    $led = $health['level'] === 'bad' ? ' style="background:var(--red);box-shadow:0 0 9px #ff818aaa"' : '';
    $hint = $health['hint'] !== '' ? ' <span class="owner-health-hint">' . h($health['hint']) . '</span>' : '';
    return '<p class="status ' . h($cls) . ' owner-health"' . $color . ' data-health><i class="led ' . h($cls) . '"' . $led . '></i>' . h($health['line']) . $hint . '</p>';
}

function sinceHtml(string $text, string $since): string
{
    $t = $since !== '' ? '<time datetime="' . h($since) . '" data-clock>' . h(gmdate('M j, H:i', strtotime($since)) . ' UTC') . '</time>' : 'a while';
    return str_replace(h('{since}'), $t, h($text));
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
        $applied = $rtMode === $res['mode'] && ($rtMode !== 'allowance' || $rtPct === $res['allowancePct'])
            && (!array_key_exists('maxJobs', $rt) || (int) $rt['maxJobs'] === $res['maxJobs']);
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
    $run = $app->runStateOf($worker);
    if ($run['run'] === 'stopped' || $run['run'] === 'starting') {
        $effective = is_array($rt) && isset($rt['mode']) ? 'Last report before it stopped: ' . substr($effective, 5) : 'Not running.';
        $effective = preg_replace('/ — switching to .*$/u', '', $effective);
    }
    $cores = is_array($rt) && isset($rt['cores']) ? max(1, min(64, (int) $rt['cores'])) : 0;
    $note = runNote($run, $res['mode'], $now, modeLabel($res['mode'], $res['allowancePct']));
    return ['run' => $run['run'], 'since' => $run['since'], 'watchdog' => $run['watchdog'], 'runNote' => $note['note'], 'runSub' => $note['sub'],
        'shown' => $run['run'] === 'stopped' ? 'off' : $res['mode'], 'line' => $line, 'online' => $online, 'paused' => $off, 'ago' => $ago, 'progress' => $progress, 'mode' => $res['mode'], 'pct' => $res['allowancePct'], 'maxJobs' => $res['maxJobs'], 'cores' => $cores, 'effective' => $effective, 'applied' => $applied, 'jobs' => $n];
}

/* Three-state control plus the allowance slider. Works as a plain form; the page script
 * saves on change without a reload. */
/* The three illustrations for the resource setting (Travis's artwork). Served from
 * private/assets/power as WebP with a PNG fallback; 480 px squares, about 2x the card height. */
function powerArt(): array
{
    return [
        'off' => ['file' => 'off', 'alt' => 'A cartoon cat flopped flat on its belly with X-ed out eyes: Compute Lab is switched off on this computer.'],
        'allowance' => ['file' => 'half-power', 'alt' => 'A drowsy cat curled around a computer chip next to a half-full battery: Compute Lab uses part of this computer in the background.'],
        'full' => ['file' => 'full-blast', 'alt' => 'A glowing boombox ray gun crackling with lightning: Compute Lab uses this whole computer at full blast.'],
    ];
}

function powerArtUrl(string $base, string $file, string $ext): string
{
    return $base . '/assets/power/' . $file . '.' . $ext . '?v=1';
}

function resourceControl(string $action, string $csrf, array $worker, array $state, string $artBase = '', bool $compact = false): string
{
    $id = (string) $worker['id'];
    $saved = (string) $state['mode'];
    /* The toggle and the picture show what the computer is doing: a stopped worker shows Off even when the saved
     * setting is on (kept in data-saved and restored when it runs again). */
    $run = (string) ($state['run'] ?? 'running');
    $mode = (string) ($state['shown'] ?? $saved);
    $pct = (int) $state['pct'];
    $nowLabel = $run === 'stopped' ? 'Stopped' : ($run === 'starting' ? 'Starting…' : modeLabel($mode, $pct));
    $note = (string) ($state['runNote'] ?? '');
    $sub = (string) ($state['runSub'] ?? '');
    $opt = function (string $value, string $short, string $aria, string $hint) use ($mode, $id): string {
        $rid = 'm-' . $id . '-' . $value;
        return '<input type="radio" id="' . h($rid) . '" name="mode" aria-label="' . h($aria) . '" value="' . h($value) . '"' . ($mode === $value ? ' checked' : '') . '>'
            . '<label for="' . h($rid) . '" title="' . h($hint) . '"><span class="tri-led" aria-hidden="true"></span><span class="tri-text"' . ($value === 'allowance' ? ' data-short-pct' : '') . '>' . h($short) . '</span></label>';
    };
    $fill = (int) round((max(10, min(90, $pct)) - 10) / 80 * 100);
    $art = '';
    if (!$compact && $artBase !== '') {
        $art = '<div class="res-art">';
        foreach (powerArt() as $m => $info) {
            $on = $m === $mode;
            $art .= '<picture class="art-' . h($m) . ($on ? ' is-on' : '') . ($on && $run === 'starting' ? ' is-starting' : '') . '" data-art="' . h($m) . '"' . ($on ? '' : ' aria-hidden="true"') . '>'
                . '<source type="image/webp" srcset="' . h(powerArtUrl($artBase, $info['file'], 'webp')) . '">'
                . '<img src="' . h(powerArtUrl($artBase, $info['file'], 'png')) . '" width="480" height="480" alt="' . h($info['alt']) . '" decoding="async"></picture>';
        }
        $art .= '</div>';
    }
    return '<form class="resources' . ($compact ? ' compact' : '') . ($art !== '' ? ' has-art' : '') . '" method="post" action="' . h($action) . '" data-resources data-mode="' . h($mode) . '" data-saved="' . h($saved) . '" data-run="' . h($run) . '">'
        . '<input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h($id) . '">'
        . '<div class="res-main">'
        . '<div class="res-head"><span class="label">Resources</span><span class="res-now" data-mode-label>' . h($nowLabel) . '</span></div>'
        . '<div class="res-run"' . ($note === '' && $sub === '' ? ' hidden' : '') . ' data-run-box role="status"><p class="res-run-note" data-run-note>' . sinceHtml($note, (string) ($state['since'] ?? '')) . '</p>'
        . '<p class="res-run-sub" data-run-sub>' . h($sub) . '</p></div>'
        . '<div class="tri" role="radiogroup" aria-label="How much of this computer Compute Lab may use">'
        . $opt('off', 'Off', 'Off', 'Finish the current job, then take no new work')
        . $opt('allowance', $pct . '%', 'Allowance, ' . $pct . ' percent at low priority', 'Use the share set below, at low priority')
        . $opt('full', 'Full', 'Full blast, every core', 'Use every core at normal priority')
        . '<span class="tri-thumb" aria-hidden="true"></span>'
        . '</div>'
        . '<div class="range-row' . ($mode === 'allowance' ? '' : ' is-idle') . '"><div class="range-label"><span>Allowance share</span><b data-pct-label>' . h((string) $pct) . '%</b></div>'
        . '<input type="range" name="pct" min="10" max="90" step="10" value="' . h((string) $pct) . '" style="--fill:' . $fill . '%" aria-label="Allowance as a share of this computer" aria-valuetext="' . h((string) $pct) . ' percent">'
        . '<div class="range-ends"><span>10%</span><span>90%</span></div></div>'
        . jobsStepper($state)
        . ($compact ? '' : '<p class="hint">Off lets the running job finish, then stops. The middle setting runs in the background at low priority. Full uses every core.</p>')
        . '<noscript><button class="button" type="submit">Save</button></noscript>'
        . '<p class="effective" data-effective>' . h((string) $state['effective']) . '</p>'
        . '</div>'
        . $art
        . '</form>';
}

/* Experiments at once: Auto (the default) lets the mode decide; 1..N caps the jobs this
 * computer runs together. N is the core count the worker reported (16 until it reports).
 * Off is always 0, Allowance never goes above its share of the cores, Full blast up to N. */
function jobsCap(string $mode, int $pct, int $cores): int
{
    if ($mode === 'off') {
        return 0;
    }
    if ($mode === 'full') {
        return $cores;
    }
    return max(1, min($cores, (int) ceil(max(10, min(90, $pct)) / 100 * $cores - 1e-9)));
}

function jobsNote(string $mode, int $pct, int $want, int $cores, bool $known): string
{
    $cap = jobsCap($mode, $pct, $cores);
    if ($mode === 'off') {
        return 'none while Off';
    }
    $n = $want > 0 ? min($want, $cap) : $cap;
    $txt = 'runs ' . ($want > 0 ? '' : 'up to ') . $n;
    if ($want > $cap) {
        $txt = 'runs ' . $n . ($mode === 'allowance' ? ', the allowance limit' : ', one per core');
    }
    return $txt . ($known ? ' of ' . $cores . ' cores' : '');
}

function jobsStepper(array $state): string
{
    $mode = (string) $state['mode'];
    $pct = (int) $state['pct'];
    $want = (int) ($state['maxJobs'] ?? 0);
    $known = (int) ($state['cores'] ?? 0) > 0;
    $cores = $known ? (int) $state['cores'] : 16;
    if ($want > $cores) {
        $cores = $want;
    }
    $val = $want > 0 ? (string) $want : 'Auto';
    return '<div class="jobs-row' . ($mode === 'off' ? ' is-idle' : '') . '" data-jobs-row data-cores="' . $cores . '" data-known="' . ($known ? '1' : '0') . '">'
        . '<span class="jobs-label" id="jl-' . h((string) ($state['id'] ?? '')) . '">Experiments at once</span>'
        . '<span class="stepper" role="group" aria-label="Experiments at once">'
        . '<button type="button" class="step" data-step="-1" aria-label="Fewer experiments at once">&minus;</button>'
        . '<output data-jobs-value aria-live="polite">' . h($val) . '</output>'
        . '<button type="button" class="step" data-step="1" aria-label="More experiments at once">+</button>'
        . '</span>'
        . '<input type="hidden" name="jobs" value="' . h($want > 0 ? (string) $want : 'auto') . '">'
        . '<span class="jobs-note" data-jobs-note>' . h(jobsNote($mode, $pct, $want, $cores, $known)) . '</span>'
        . '</div>';
}

function resourceScript(): string
{
    return '<script>
(function(){
  function label(m,p){return m==="off"?"Off":m==="full"?"Full blast":"Allowance · "+p+"%";}
  function clock(iso){var d=new Date(iso);if(isNaN(d))return "a while";var n=new Date(),t=d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});return d.toDateString()===n.toDateString()?t:d.toLocaleDateString([],{month:"short",day:"numeric"})+", "+t;}
  document.querySelectorAll("time[data-clock]").forEach(function(t){t.textContent=clock(t.getAttribute("datetime"));});
  document.querySelectorAll("form[data-resources]").forEach(function(f){
    var range=f.querySelector("input[name=pct]"),pl=f.querySelector("[data-pct-label]"),ml=f.querySelector("[data-mode-label]"),eff=f.querySelector("[data-effective]"),row=f.querySelector(".range-row"),timer=null,saving=false;
    var rbox=f.querySelector("[data-run-box]"),rnote=f.querySelector("[data-run-note]"),rsub=f.querySelector("[data-run-sub]");
    function mode(){var r=f.querySelector("input[name=mode]:checked");return r?r.value:"allowance";}
    function nowLabel(){var r=f.getAttribute("data-run");return r==="stopped"?"Stopped":r==="starting"?"Starting…":label(mode(),range.value);}
    /* Show what the computer is doing (run state from the server); the saved setting stays in data-saved. */
    function applyRun(d){
      if(!d||!d.run)return;
      f.setAttribute("data-run",d.run);if(d.saved)f.setAttribute("data-saved",d.saved);
      var shown=d.shown||d.saved||mode(),r=f.querySelector("input[name=mode][value="+shown+"]");if(r&&!r.checked)r.checked=true;
      var note=String(d.runNote||"").replace("{since}",clock(d.since)),sub=String(d.runSub||"");
      rnote.textContent=note;rsub.textContent=sub;rbox.hidden=!note&&!sub;
      ml.textContent=nowLabel();row.classList.toggle("is-idle",mode()!=="allowance");art();jobsNote();
    }
    f.__run=function(d){if(!saving)applyRun(d);};
    function save(){
      var body=new URLSearchParams(new FormData(f)),run=f.getAttribute("data-run");
      /* Turning a stopped computer on: Starting… until its heartbeat confirms. */
      if(mode()!=="off"&&(run==="stopped"||run==="starting")){f.setAttribute("data-run","starting");rnote.textContent="Starting… waiting for this computer to check in.";rsub.textContent="";rbox.hidden=false;}
      ml.textContent=nowLabel();row.classList.toggle("is-idle",mode()!=="allowance");art();jobsNote();
      eff.textContent="Saving…";saving=true;
      fetch(f.action,{method:"POST",body:body,headers:{"Accept":"application/json"},credentials:"same-origin"}).then(function(r){return r.json();}).then(function(d){
        saving=false;
        if(!d||!d.ok){eff.textContent=(d&&d.error)||"Could not save. Reload the page.";return;}
        applyRun(d);
        eff.setAttribute("data-until",String(Date.now()+45000));
        eff.textContent=d.run==="running"?"Saved: "+label(d.mode,d.pct)+(d.jobs?" · "+d.jobs+" at once":"")+". This computer picks it up at its next check-in, within about half a minute."
          :d.run==="starting"?"Saved: "+label(d.mode,d.pct)+". It starts with this setting when the worker comes back.":"Saved: "+label(d.mode,d.pct)+".";
      }).catch(function(){saving=false;eff.textContent="Could not save. Reload the page.";});
    }
    f.querySelectorAll("input[name=mode]").forEach(function(r){r.addEventListener("change",save);});
    var shortPct=f.querySelector("[data-short-pct]"),allowR=f.querySelector("input[name=mode][value=allowance]");
    function fill(){range.style.setProperty("--fill",Math.round((range.value-10)/80*100)+"%");range.setAttribute("aria-valuetext",range.value+" percent");if(shortPct)shortPct.textContent=range.value+"%";if(allowR)allowR.setAttribute("aria-label","Allowance, "+range.value+" percent at low priority");}
    function art(){var m=mode(),st=f.getAttribute("data-run")==="starting";f.setAttribute("data-mode",m);f.querySelectorAll("[data-art]").forEach(function(p){var on=p.getAttribute("data-art")===m;p.classList.toggle("is-on",on);p.classList.toggle("is-starting",on&&st);if(on)p.removeAttribute("aria-hidden");else p.setAttribute("aria-hidden","true");});}
    f.querySelectorAll("input[name=mode]").forEach(function(r){r.addEventListener("change",art);});
    var jr=f.querySelector("[data-jobs-row]"),jin=f.querySelector("input[name=jobs]"),jout=f.querySelector("[data-jobs-value]"),jnote=f.querySelector("[data-jobs-note]");
    function jobsNote(){
      if(!jr)return;var m=mode(),n=+jr.getAttribute("data-cores")||16,known=jr.getAttribute("data-known")==="1",w=jin.value==="auto"?0:+jin.value;
      var cap=m==="off"?0:m==="full"?n:Math.max(1,Math.min(n,Math.ceil(range.value/100*n-1e-9)));
      jr.classList.toggle("is-idle",m==="off");
      var t;if(m==="off"){t="none while Off";}else{var k=w>0?Math.min(w,cap):cap;t="runs "+(w>0?"":"up to ")+k;if(w>cap)t="runs "+k+(m==="allowance"?", the allowance limit":", one per core");if(known)t+=" of "+n+" cores";}
      jnote.textContent=t;
    }
    if(jr){
      jr.querySelectorAll("[data-step]").forEach(function(b){b.addEventListener("click",function(){
        var n=+jr.getAttribute("data-cores")||16,w=jin.value==="auto"?n+1:+jin.value;
        w=Math.max(1,Math.min(n+1,w+(+b.getAttribute("data-step"))));
        jin.value=w>n?"auto":String(w);jout.textContent=w>n?"Auto":String(w);jobsNote();
        clearTimeout(timer);timer=setTimeout(save,350);
      });});
    }
    range.addEventListener("input",function(){pl.textContent=range.value+"%";fill();jobsNote();});
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
.jobgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:7px}
.jobgrid>.muted{grid-column:1/-1;margin:0}
.jobgrid .taskcard{padding:7px 9px;border-radius:7px;min-width:0}
.jobgrid .taskline{margin-bottom:2px;gap:6px}
.jobgrid .taskname{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.jobgrid .taskdesc2{font-size:10px}
.jobgrid .prog{margin-top:6px;height:3px}
@media (max-width:560px){.jobgrid{grid-template-columns:1fr}}
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
.tri{position:relative;display:grid;grid-template-columns:repeat(3,1fr);box-sizing:content-box;width:300px;max-width:calc(100% - 10px);height:50px;padding:4px;background:linear-gradient(180deg,#071016,#0c151d);border:1px solid #293743;border-radius:999px;box-shadow:inset 0 2px 7px #000a,0 1px 0 #ffffff08;user-select:none}
.tri input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
.tri label{position:relative;z-index:2;margin:0;display:flex;align-items:center;justify-content:center;gap:7px;border-radius:999px;cursor:pointer;font:600 12px var(--display);letter-spacing:.02em;color:var(--muted);transition:color .25s ease;white-space:nowrap}
.tri label:hover{color:var(--text)}
.tri input:focus-visible+label{outline:2px solid var(--cyan);outline-offset:-2px}
.tri-led{flex:0 0 auto;width:12px;height:12px;border-radius:50%;background:currentColor;opacity:.45;transition:opacity .25s,box-shadow .25s}
.tri input:checked+label .tri-led{opacity:1;box-shadow:0 0 12px 1px currentColor}
.tri-thumb{position:absolute;z-index:1;top:4px;bottom:4px;left:4px;width:calc((100% - 8px)/3);border-radius:999px;border:1px solid #7a3c43;background:linear-gradient(180deg,#4a2329,#2e171b);box-shadow:0 0 14px #ff818a2e,inset 0 1px 0 #ffffff14;transition:transform .35s cubic-bezier(.25,1,.5,1),background .3s,border-color .3s,box-shadow .3s}
.tri input[value=off]:checked+label{color:#ffc2c6}
.tri input[value=allowance]:checked+label{color:var(--mint)}
.tri input[value=full]:checked+label{color:#06140f}
.resources[data-mode=allowance] .tri-thumb,.tri:has(input[value=allowance]:checked) .tri-thumb{transform:translateX(100%);border-color:#2f7a5d;background:linear-gradient(180deg,#173a2e,#0f241d);box-shadow:0 0 16px #69e2b133,inset 0 1px 0 #ffffff14}
.resources[data-mode=full] .tri-thumb,.tri:has(input[value=full]:checked) .tri-thumb{transform:translateX(200%);border-color:#9af0cc;background:linear-gradient(180deg,#8cf0c6,#4fcf9c);box-shadow:0 0 20px #69e2b166,inset 0 1px 0 #ffffff55}
.resources[data-mode=full] .tri input[value=full]:checked+label .tri-led{animation:tri-pulse 1.6s ease-in-out infinite}
@keyframes tri-pulse{0%,100%{box-shadow:0 0 12px 1px currentColor}50%{box-shadow:0 0 20px 4px currentColor;opacity:.7}}
.resources .range-row{position:relative;box-sizing:border-box;width:310px;max-width:100%;margin-top:11px;padding:11px 13px 8px;border:1px solid #2d5948;border-radius:10px;background:linear-gradient(180deg,#0f1f1a,#0b1513);transition:opacity .25s,border-color .25s,background .25s}
.resources .range-row::before{content:"";position:absolute;top:-7px;left:50%;width:12px;height:12px;margin-left:-6px;transform:rotate(45deg);background:#0f1f1a;border-left:1px solid #2d5948;border-top:1px solid #2d5948;transition:inherit}
.resources .range-row.is-idle{opacity:.5;border-style:dashed;border-color:#2b3a47;background:#0b1219}
.resources .range-row.is-idle::before{opacity:0}
.resources .range-row.is-idle input[type=range]::-webkit-slider-thumb{border-color:#6f8696;box-shadow:none;background:#c9d4dc}
.resources .range-row.is-idle input[type=range]::-moz-range-thumb{border-color:#6f8696;box-shadow:none;background:#c9d4dc}
.resources[data-mode=off] .res-now{color:var(--red)}
.resources[data-run=starting] .res-now{color:var(--amber)}
.res-run{border:1px solid #5a2a33;background:#1a0f13;border-radius:9px;padding:8px 11px;margin:0 0 11px}
.res-run[hidden]{display:none}
.resources[data-run=starting] .res-run{border-color:#6b5531;background:#1f1a12}
.resources[data-run=running] .res-run{border-color:#263642;background:#0b1219}
.res-run-note{margin:0;font:600 12px var(--display);color:#ffb3b9}
.resources[data-run=starting] .res-run-note{color:var(--amber)}
.resources[data-run=running] .res-run-note{display:none}
.res-run-sub{margin:3px 0 0;font:11px var(--mono);color:#aeb9c2}
.res-run-sub:empty{display:none}
.resources[data-run=starting] .res-run-note::before{content:"";display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:var(--amber);vertical-align:1px;animation:resPulse 1.2s ease-in-out infinite}
@keyframes resPulse{50%{opacity:.25}}
.res-art picture.is-on.is-starting img{filter:drop-shadow(0 8px 18px #0009) saturate(.55) brightness(.75);animation:resPulse 1.6s ease-in-out infinite}
.owner-computers{margin-bottom:15px}
.owner-computers .computer{padding:10px 12px;margin:0 0 8px}
.owner-computers .computer-top{justify-content:flex-start;align-items:baseline;flex-wrap:wrap;gap:6px 14px;margin-bottom:2px}
.owner-computers .computer-name{font:600 20px/1.2 var(--display)}
.owner-computers .computer-name.is-full{color:var(--mint)}
.owner-computers .computer-name.is-allowance{color:var(--amber)}
.owner-computers .computer-name.is-dead{color:var(--red)}
.owner-computers .computer-name.is-off{color:var(--muted)}
.owner-computers .computer-name.is-starting{color:var(--amber)}
.owner-computers .computer-jobs{font:500 14px/1.3 var(--display);color:var(--text)}
.owner-computers .owner-meta{margin:0 0 6px}
.owner-computers .owner-health{margin:0 0 6px;flex-wrap:wrap}
.owner-computers .owner-health-hint{font-weight:400;color:var(--muted);margin-left:6px}
.owner-computers .resources.compact{margin:6px 0 8px;padding:8px 10px}
.owner-computers .resources.compact .res-head{margin-bottom:6px}
.owner-computers .resources.compact .res-main{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 14px}
.owner-computers .resources.compact .res-head,.owner-computers .resources.compact .res-run,.owner-computers .resources.compact .effective{flex:1 0 100%}
.owner-computers .resources.compact .tri,.owner-computers .resources.compact .range-row,.owner-computers .resources.compact .jobs-row{margin-top:0;flex:1 1 240px;width:auto;max-width:100%}
.owner-computers .resources.compact .range-row::before{display:none}
.owner-computers .resources.compact .range-row{padding:8px 10px 6px}
.owner-computers .resources.compact .jobs-row{min-height:0;align-self:center}
.owner-computers .resources.compact .effective{border-top:0;padding-top:0}
.owner-computers .head-actions{margin:6px 0 4px}
.owner-computers details.diag{margin:4px 0 0}
@media (max-width:560px){.owner-computers .computer-name{font-size:18px}.owner-computers .resources.compact .tri,.owner-computers .resources.compact .range-row,.owner-computers .resources.compact .jobs-row{flex-basis:100%}}
.resources .range-label b{color:var(--mint);font:600 13px var(--display)}
.resources input[type=range]{-webkit-appearance:none;appearance:none;height:6px;margin:9px 0 7px;border-radius:999px;background:linear-gradient(90deg,var(--mint) 0,var(--mint) var(--fill,50%),#24323d var(--fill,50%));outline:none}
.resources .range-row.is-idle input[type=range]{background:linear-gradient(90deg,#4e6774 0,#4e6774 var(--fill,50%),#1d2933 var(--fill,50%))}
.resources input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#e9fff5;border:3px solid var(--mint);box-shadow:0 0 10px #69e2b188;cursor:pointer}
.resources input[type=range]::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:#e9fff5;border:3px solid var(--mint);box-shadow:0 0 10px #69e2b188;cursor:pointer}
.resources input[type=range]::-moz-range-track{background:transparent}
.resources input[type=range]:focus-visible::-webkit-slider-thumb{outline:2px solid var(--cyan);outline-offset:2px}
.resources input[type=range]:focus-visible::-moz-range-thumb{outline:2px solid var(--cyan);outline-offset:2px}
.resources.has-art{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);column-gap:14px;padding-right:10px}
.resources .hint,.resources .effective,.resources .res-head{max-width:330px}
.revoked-list{margin-top:12px;border:1px dashed #2b3a47;border-radius:10px;padding:8px 12px}
.revoked-list summary{cursor:pointer;font:11px var(--mono);color:var(--muted)}
.revoked-list ul{list-style:none;margin:8px 0 0;padding:0}
.revoked-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #1e2a34}
.revoked-row .quiet{flex:1}
.revoked-row form{margin:0}
.removed-note{margin-top:10px}
/* Left: Experiments at once, the hint and the Now line. Middle (next to the picture): the toggle and the slider. */
.resources.has-art .res-main{display:grid;grid-template-columns:minmax(0,1fr) 310px;grid-template-areas:"head head" "run run" "jobs tri" "hint range" "eff range";column-gap:20px;align-items:start;align-content:center}
.resources.has-art .res-run{grid-area:run}
.resources.has-art .res-head{grid-area:head;max-width:none}
.resources.has-art .tri{grid-area:tri}
.resources.has-art .range-row{grid-area:range;width:100%}
.resources.has-art .jobs-row{grid-area:jobs;width:100%;margin-top:0;align-self:center;min-height:60px}
.resources.has-art .hint{grid-area:hint;max-width:none;margin:11px 0 6px}
.resources.has-art .effective{grid-area:eff;max-width:none}
.resources.has-art .res-main noscript{grid-column:1/-1}
@media (max-width:1180px){.resources.has-art .res-main{grid-template-columns:minmax(0,1fr);grid-template-areas:"head" "run" "tri" "range" "jobs" "hint" "eff"}.resources.has-art .jobs-row{margin-top:9px;min-height:0}.resources.has-art .range-row{width:310px;max-width:100%}}
@media (max-width:1180px) and (min-width:561px){.resources.has-art .range-row,.resources.has-art .jobs-row{width:100%}.resources.has-art .range-row::before{left:155px}}
.resources .jobs-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;box-sizing:border-box;width:310px;max-width:100%;margin-top:9px;padding:7px 9px 7px 13px;border:1px solid #263642;border-radius:10px;background:#0b1219;transition:opacity .25s}
.resources .jobs-row.is-idle{opacity:.5;border-style:dashed}
.resources .jobs-label{font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#aeb9c2;flex:1 1 auto}
.resources .stepper{display:inline-flex;align-items:center;border:1px solid #2d5948;border-radius:999px;background:#0f1f1a;overflow:hidden}
.resources .stepper .step{width:28px;height:26px;border:0;background:transparent;color:var(--mint);font:600 15px var(--display);cursor:pointer;padding:0}
.resources .stepper .step:hover{background:#173a2e}
.resources .stepper .step:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
.resources .stepper output{min-width:38px;text-align:center;font:600 12px var(--display);color:#e9fff5}
.resources .jobs-note{flex:1 0 100%;font:10px var(--mono);color:var(--muted)}
.res-main{min-width:0}
.res-art{position:relative;align-self:stretch;min-height:250px;margin:0}
.res-art picture{position:absolute;inset:0;display:block;opacity:0;transform:scale(.94) translateY(4px);transition:opacity .35s ease,transform .5s cubic-bezier(.25,1,.5,1);pointer-events:none}
.res-art picture.is-on{opacity:1;transform:none}
.res-art picture{display:flex;align-items:center;justify-content:center}
.res-art img{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center;filter:drop-shadow(0 8px 18px #0009)}
.resources.has-art .tri label{gap:8px}
@media (max-width:560px){.resources.has-art{grid-template-columns:1fr;padding-right:14px}.res-art{order:-1;min-height:0;height:150px;margin:-4px 0 8px}}
@media (prefers-reduced-motion:reduce){.res-art picture.is-on.is-starting img,.resources[data-run=starting] .res-run-note::before{animation:none}.res-art picture{transition:none}.tri-thumb,.tri label,.resources .range-row{transition:none}.tri-led{animation:none!important}}
@media (max-width:420px){.tri label{font-size:11px;gap:6px}.tri-led{width:10px;height:10px}}
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
.disc .row3{margin-top:3px;font:10px var(--mono);color:#66737f;text-align:left}
.badge-mine{display:inline-block;font:9px var(--mono);color:#1b1306;background:var(--amber);border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:middle;letter-spacing:.03em}
.badge-m{display:inline-block;font:8px var(--mono);color:#d7efe6;background:#16332b;border:1px solid #2a5a4a;border-radius:3px;padding:1px 5px;margin:1px 0 0 4px;vertical-align:middle;letter-spacing:.04em;text-transform:uppercase}
.group-label{font:10px var(--mono);color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin:8px 2px 2px}
.disc-summary{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:4px 10px}
.disc-refresh{display:inline-flex;align-items:center;gap:5px;color:var(--muted);font:10px var(--mono)}
.disc-refresh.is-loading::before{content:"";width:9px;height:9px;border:1px solid currentColor;border-right-color:transparent;border-radius:50%;animation:disc-spin .8s linear infinite}
@keyframes disc-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.disc-refresh.is-loading::before{animation:none}}
.stage{position:relative;background-image:linear-gradient(#13212c55 1px,transparent 1px),linear-gradient(90deg,#13212c55 1px,transparent 1px);background-size:28px 28px;background-position:center;background-color:#0c131a;border:1px solid #1d2a33;border-radius:8px;overflow:hidden}
.stage svg{display:block;width:100%;height:auto}
.wire{stroke:#4e6774;stroke-width:1.6;fill:none}.wire.inhib{stroke:#b58fff}.wire.delay{stroke-dasharray:4 3}
/* Discoveries playback */
.snn-net .wire{opacity:.7}.snn-net .wire.excit{stroke:#2f7a60}.snn-net .wire.inhib{stroke:#b8457e}
.snn-net .pe{fill:#9dffd6;filter:drop-shadow(0 0 4px #69e2b1)}.snn-net .pi{fill:#ff6fb0;filter:drop-shadow(0 0 4px #ff4f9a)}
.snn-net .halo{fill:#69e2b1;pointer-events:none}.snn-net .node-inhib-g .halo{fill:#ff6fb0}.snn-net .node-output-g .halo{fill:#ffca76}.snn-net .node-input-g .halo{fill:#9dffd6}
.snn-net .charge{fill:#e6edf3;opacity:.5;pointer-events:none}.snn-net .node-input{stroke:#69e2b1}.snn-net .node-output{stroke:#ffca76;stroke-width:2}
.snn-net .node-hidden{fill:#173754;stroke:#65c7f2;stroke-width:2}.snn-net .node-hidden-g .halo{fill:#65c7f2}
.snn-net .node-inhib{fill:#542343;stroke:#ff6fb0;stroke-width:2}
.snn-net .fire .body{fill:#e9fff5;stroke:#fff}.snn-net .node-inhib-g.fire .body{fill:#ffd0e6}.snn-net .node-output-g.fire .body{fill:#fff0d2}.snn-net .unused{opacity:.35}
.snn-net .neuron-sign{fill:#fff;font:700 14px var(--mono);pointer-events:none}.snn-net .fire .neuron-sign{fill:#17212b}
.snn-io-label{fill:#c9d6df;font:9px var(--mono);letter-spacing:.06em}.snn-silent{fill:var(--amber);font:11px var(--mono)}
.snn-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0 6px}
.snn-btn{width:32px;height:28px;padding:0;border:1px solid #2a3b47;border-radius:7px;background:#0f1a22;color:var(--mint);font:600 13px var(--display);cursor:pointer;line-height:1}.snn-btn:hover{border-color:#3d6f5c;background:#12241d}
.snn-bar .snn-scrub{flex:1 1 160px;min-width:120px;margin:0 4px}
.snn-time{font:10px var(--mono);color:var(--muted);min-width:66px}.snn-speed{font:10px var(--mono);color:var(--muted);display:inline-flex;align-items:center;gap:5px;margin:0}
.snn-speed select{width:auto;padding:3px 6px;font:11px var(--mono);background:#0f1a22;color:var(--text);border:1px solid #2a3b47;border-radius:6px}
.snn-cases{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:0 0 8px;font:10px var(--mono);color:var(--muted)}.snn-cases span{margin-right:3px}
.snn-case{min-width:38px;height:24px;padding:0 7px;border:1px solid #2a3b47;border-radius:999px;background:transparent;color:#aeb9c2;font:11px var(--mono);cursor:pointer}.snn-case i{font-style:normal;margin-left:4px;color:var(--mint)}.snn-case.on{border-color:var(--mint);color:var(--text);background:#10231e}
.snn-trace .grid{stroke:#1a2731;stroke-width:1}.snn-trace .rl{fill:#7d8f9c;font:9px var(--mono)}.snn-trace .rl.out{fill:#ffca76}.snn-trace .rl.xp{fill:#aeb9c2}
.snn-trace .si{fill:#69e2b1}.snn-trace .so{fill:#ffca76}.snn-trace .playhead{stroke:#e9fff5;stroke-width:1.5;opacity:.85}
.snn-io{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font:11px var(--mono);color:#aeb9c2}.snn-io b{font-weight:500;color:var(--muted);margin-right:4px}.snn-io .err{color:var(--red)}
.snn-check{margin-top:6px;font:10px var(--mono);color:var(--muted)}.snn-check .ok{color:var(--mint)}.snn-check .warn{color:var(--amber)}
.snn-key{margin:8px 0;color:#aeb9c2;font:11px var(--mono)}.snn-key summary{cursor:pointer;color:var(--text)}
.snn-key ul,.snn-raster-key{display:flex;flex-wrap:wrap;gap:6px 14px;padding:0;list-style:none}
.snn-raster-key{margin:6px 0;color:#aeb9c2;font:10px var(--mono)}
.snn-key i,.snn-raster-key i{display:inline-block;width:9px;height:9px;margin-right:5px;background:var(--key-color);border-radius:50%;vertical-align:baseline}
.snn-key .port{border-radius:2px}.snn-key .wire-key{width:14px;height:3px;border-radius:0;vertical-align:middle}
.snn-key .diamond{border-radius:0;transform:rotate(45deg) scale(.8)}
@media (max-width:560px){.snn-bar .snn-scrub{flex-basis:100%;order:9;margin:2px 0}.snn-io{font-size:10px}.snn-net .net-label,.snn-io-label{font-size:17px}.snn-trace .rl{font-size:16px}}
@media (prefers-reduced-motion:reduce){.snn-net .pe,.snn-net .pi{filter:none}}
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

function computerCsrf(App $app, array $worker, array $nav): string
{
    $pid = (string) ($nav['participantId'] ?? '');
    if ($pid !== '' && $app->workerOwns($pid, (string) $worker['id'])) {
        return (string) ($nav['participantCsrf'] ?? '');
    }
    return (string) ($nav['ownerCsrf'] ?? '');
}

function myComputerPanel(App $app, string $base, ?array $computers, array $nav): string
{
    $head = '<section class="panel" id="my-computer"><div class="panelhead"><div class="paneltitle">My computer</div><a class="button small primary" href="' . h($base) . '/join">Add a computer</a></div><div class="panelbody">';
    if ($computers === null || $computers === []) {
        $why = !empty($nav['owner'])
            ? 'Mark a computer with “Show on My computer” in the owner console and it will appear here. Other computers stay listed only in the owner console.'
            : 'Link this browser to a computer to see what it is doing, set how much of it Compute Lab may use, and follow what it finds.';
        return $head . '<div class="empty"><strong>No computer linked yet</strong><p>' . h($why) . '</p>'
            . '<p>If this computer already runs Compute Lab, run a fresh setup command on it to reconnect this browser.</p>'
            . addComputerButton($base) . '</div></div></section>';
    }
    $cards = '';
    $ids = [];
    foreach ($computers as $worker) {
        $ids[] = (string) $worker['id'];
        $csrf = computerCsrf($app, $worker, $nav);
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
            . resourceControl($base . '/me/resources', $csrf, $worker, $state, $base)
            . '<h3>What it is doing</h3><div class="tasks jobgrid" data-jobs>' . $jobs . '</div>'
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
      if(d.mine){d.mine.forEach(function(c){var card=document.querySelector("[data-computer=\'"+c.id+"\']");if(!card)return;var l=card.querySelector("[data-line]");if(l)l.textContent=c.line;var e=card.querySelector("[data-effective]");if(e&&!(Date.now()<+(e.getAttribute("data-until")||0))&&e.textContent!=="Saving…")e.textContent=c.effective;var hb=card.querySelector("[data-health]");if(hb&&c.health&&hb.lastChild)hb.lastChild.textContent=c.health;var rf=card.querySelector("form[data-resources]");if(rf&&rf.__run)rf.__run(c);});}
    }).catch(function(){});
  }
  setInterval(tick,15000);
})();
</script>';
}

function pageHome(App $app, array $nav, ?array $computers = null): string
{
    $base = $app->base();
    $intro = '<section class="heading"><div><div class="eyebrow">Volunteer computing · SpikeFoundry first</div><h1>Give a spare computer something useful to do.</h1>'
        . '<p>Compute Lab shares quiet background work. SpikeFoundry runs small synthetic design trials for spiking networks. BugBrain, the neuron research, runs when SpikeFoundry has nothing waiting. Looking around in the browser does not donate this computer.</p></div>'
        . '<div class="head-actions">' . (empty($nav['owner']) && empty($nav['participant']) ? '<a class="button primary" href="' . h($base) . '/join">Join with your computer</a>' : '') . '<a class="button" href="' . h($base) . '/explore">Explore in your browser</a></div></section>';
    $body = $intro . rightNowPanel($app, $base) . myComputerPanel($app, $base, $computers, $nav);
    return layout('Compute Lab', $body, $base, $nav, ['foot' => resourceScript() . liveScript()]);
}

function pageJoin(App $app, string $error = '', array $nav = []): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $body = '<section class="heading"><div><div class="eyebrow">Join · one download</div><h1>Join with this computer</h1><p>This does not share a GitHub token or the owner password. A background program on your computer does the work. This browser tab is not the worker.</p></div></section>'
        . $err
        . '<section class="panel"><div class="panelhead"><div class="paneltitle">Your computer</div><span class="subtag">STARTS AT 50% ALLOWANCE</span></div><div class="panelbody"><form method="post" action="' . h($base) . '/join"><label>Computer name <input name="name" required maxlength="32" autocomplete="off" placeholder="kitchen-pc"></label>'
        . '<label><input type="checkbox" name="consent" value="1" required> I agree this computer may run tasks according to the choices below.</label>'
        . '<label><input type="checkbox" name="project[]" value="*" checked> Run any available ComputeLab task, including future projects</label>'
        . '<p class="quiet">To limit participation, uncheck “Run any available ComputeLab task” and choose specific projects below.</p>'
        . '<label><input type="checkbox" name="project[]" value="spikefoundry" checked> SpikeFoundry synthetic design jobs</label>'
        . '<label><input type="checkbox" name="project[]" value="bugbrain"> BugBrain template tests</label>'
        . '<p class="quiet">New computers start in Allowance at 50%: about half of the cores, at low priority, so you can keep using the computer. Change it any time on Home. Job length and the rest are picked for you.</p>'
        . '<p class="quiet">Running setup again on a computer that is already added is safe: it keeps that computer\'s entry, updates and restarts its worker, and does not add a duplicate.</p>'
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
        . '<p class="quiet">Running setup again on a computer that is already added is safe: it keeps that computer\'s entry, updates and restarts its worker, and does not add a duplicate.</p>'
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

/* When a discovery was first found. The server writes UTC; the page script rewrites it in the viewer's own time
 * zone ("Nov 10, 7:42 AM CST") with the relative age as a tooltip. */
function discWhenHtml(string $iso): string
{
    $t = $iso !== '' ? strtotime($iso) : false;
    if ($t === false) {
        return '';
    }
    return '<div class="row3"><time class="disc-when" datetime="' . h(gmdate('Y-m-d\\TH:i:s\\Z', $t)) . '">Found ' . h(gmdate('M j, g:i A', $t)) . ' UTC</time></div>';
}

function verifiedDiscoveries(array $studies): string
{
    $entries = [];
    foreach ($studies as $seed => $study) {
        foreach ($study['rounds'] as $round) {
            $arms = $round['arms'] ?? [];
            if (!is_array($arms)) {
                continue;
            }
            foreach ($arms as $name => $arm) {
                $hash = $arm['circuit'] ?? '';
                if (!is_string($hash) || !preg_match('/^[a-f0-9]{64}$/', $hash) || isset($entries[$hash])) {
                    continue;
                }
                $checks = [];
                foreach (['fresh' => 'Fresh sequence cases', 'shifted' => 'Longer sequence cases'] as $key => $label) {
                    $score = $arm['confirmation'][$key] ?? [];
                    $accuracy = $score['accuracy'] ?? null;
                    $recall = $score['recall'] ?? null;
                    if (!is_numeric($accuracy) || !is_numeric($recall) || min($accuracy, $recall) < 0.9 || max($accuracy, $recall) > 1) {
                        break;
                    }
                    $checks[] = $label . ' · ' . number_format(100 * $accuracy, 1) . '% accuracy · '
                        . number_format(100 * $recall, 1) . '% recall · ' . number_format((float) ($score['spikes'] ?? 0), 1) . ' spikes per case';
                }
                if (count($checks) !== 2) {
                    continue;
                }
                $checkpoint = $arm['checkpoint'] ?? '';
                $source = is_string($checkpoint) && preg_match('/^[a-f0-9]{64}$/', $checkpoint)
                    ? 'Checkpoint ' . substr($checkpoint, 0, 12) : 'Proposer ' . $name;
                $entries[$hash] = '<div class="taskcard"><strong>Sequence · ' . h(substr($hash, 0, 12)) . '</strong>'
                    . '<div class="taskdesc2">' . h($source . ' · seed ' . $seed . ' · ' . (int) ($arm['neurons'] ?? 0)
                        . ' neurons · ' . (int) ($arm['synapses'] ?? 0) . ' synapses') . '</div>'
                    . '<div class="taskdesc2">' . h(implode(' / ', $checks)) . '</div></div>';
            }
        }
    }
    return '<div class="viz-title"><strong>Independently verified circuits</strong><span>Fresh cases outside search</span></div>'
        . ($entries ? '<div class="tasks">' . implode('', array_slice($entries, 0, 8)) . '</div>'
            : '<p class="muted">No circuits have passed both fresh-case checks in a completed study yet.</p>');
}

function pageDiscoveries(App $app, array $nav, array $mineIds = [], bool $archive = false, bool $refresh = false, bool $larger = false): string
{
    $base = $app->base();
    $inverse = $app->inverseGalleryEnabled() && !$archive;
    $payload = $inverse ? ['items' => $app->inverseDiscoveries(), 'series' => [], 'board' => []] : $app->discoveriesPayload();
    $items = $payload['items'];
    if ($inverse && $larger) {
        $items = array_values(array_filter($items, static fn ($item) => isset($item['inverse']['graph'])));
    }
    usort($items, static function (array $a, array $b): int {
        return strcmp($b['when'], $a['when']) ?: strcmp($a['hash'], $b['hash']);
    });
    $mine = array_flip($mineIds);
    $series = $payload['series'];
    foreach ($items as $i => $item) {
        $items[$i]['mine'] = isset($mine[$item['worker']]);
        unset($items[$i]['worker']);
    }
    $board = [];
    foreach ($payload['board'] as $row) {
        $board[] = ['name' => (string) $row['name'], 'genomes' => (int) $row['genomes'], 'records' => (int) $row['records'], 'hours' => round((float) $row['hours'], 2)];
    }
    $list = '<button class="disc active" type="button" data-index="-1"><div class="row1"><span class="t">Overview</span><span class="s">' . h((string) count($items)) . '</span></div><div class="row2"><span>All tasks · contributors</span><span></span></div></button>';
    foreach ($items as $i => $item) {
        $badges = '';
        foreach (isset($item['badges']) && is_array($item['badges']) ? $item['badges'] : [] as $b) {
            $badges .= '<span class="badge-m">' . h((string) $b) . '</span>';
        }
        $list .= '<button class="disc' . ($item['mine'] ? ' mine' : '') . '" type="button" data-index="' . $i . '"><div class="row1"><span class="t">' . h($item['label'] ?? '#' . $item['rank'] . ' ' . $item['task'])
            . ($item['mine'] ? '<span class="badge-mine">Your computer</span>' : '') . $badges . '</span><span class="s">' . h(number_format((float) $item['held'], 3)) . '</span></div>'
            . '<div class="row2"><span>' . h($item['finder']) . (($item['confirmations'] ?? 0) > 0 ? ' · ✓' . h((string) $item['confirmations']) : '') . (($item['variants'] ?? 0) > 0 ? ' · +' . h((string) $item['variants']) . ' alike' : '') . '</span><span>' . h((string) $item['neurons']) . 'n · ' . h((string) $item['synapses']) . 's</span></div>'
            . (isset($item['inverse']['graph']) ? '<div class="row2">' . h($item['task']) . ' · ' . h((string) $item['level']) . ' hidden neurons</div>' : '')
            . discWhenHtml((string) ($item['when'] ?? '')) . '</button>';
    }
    if ($items === []) {
        $list .= '<p class="muted" style="padding:8px">' . ($inverse ? 'Waiting for the first inverse-design job to finish.' : 'No discoveries yet. Finished SpikeFoundry runs upload them.') . '</p>';
    }
    $data = ['items' => $items, 'series' => $series, 'board' => $board, 'genomeUrl' => $base . '/discoveries/genome?hash=', 'now' => $app->now(), 'mineCount' => count($mineIds), 'inverse' => $inverse];
    $verification = $inverse ? '' : verifiedDiscoveries($app->recentSequenceStudies());
    if ($refresh) {
        return jsonForHtml(['data' => $data, 'list' => $list, 'verification' => $verification]);
    }
    $description = $inverse
        ? '<p>Top ' . h((string) $app->discoveriesTopN()) . ' inverse designs per metric and pilot, newest first. Playback uses held-out examples.</p>'
            . '<a href="' . h($base . '/discoveries' . ($larger ? '' : '?larger=1')) . '">' . ($larger ? 'All designs' : 'Multi-neuron designs') . '</a> · '
            . '<a href="' . h($base . '/discoveries?archive=1') . '">Legacy discoveries archive</a>'
        : '<p>Browse search results, newest first, and play back their wiring. Ranking badges describe the cases used during search.</p>';
    $body = '<section class="heading"><div><div class="eyebrow">Discoveries · frozen designs</div><h1>What the network has found</h1>' . $description . '</div></section>'
        . '<div class="split"><section class="panel" aria-label="Discoveries"><div class="panelhead"><div class="paneltitle">Discoveries</div>'
        . '<div class="disc-summary"><span id="disc-refresh" class="disc-refresh" role="status">Auto-refresh on</span><span class="subtag" id="disc-count">' . h((string) count($items)) . ' DESIGNS</span></div></div>'
        . '<div class="list-scroll" id="disc-list">' . $list . '</div></section>'
        . '<section class="panel" aria-label="Discovery viewer"><div class="panelhead"><div class="paneltitle" id="v-title">Overview</div><span class="subtag" id="v-tag">ALL TASKS</span></div><div class="viewer-scroll" id="viewer"></div></section></div>'
        . '<template id="disc-verification">' . $verification . '</template>'
        . '<script type="application/json" id="disc-data">' . jsonForHtml($data) . '</script>';
    $engine = (string) ($app->config['engine_js'] ?? '');
    $version = is_readable($engine) ? hash_file('sha256', $engine) : 'missing';
    $foot = '<script id="disc-engine" src="' . h($base . '/assets/engine.js?v=' . $version) . '" defer></script><script>' . snnPlayerJs() . '</script><script>' . discoveriesJs() . '</script>';
    return layout('Discoveries', $body, $base, $nav, ['fit' => true, 'shell' => 'shell split-shell', 'foot' => $foot]);
}

function snnPlayerJs(): string
{
    return <<<'JS'
(function(root){
'use strict';
/* Discoveries playback. sanitize/compile are a line-for-line port of spikefoundry/genome_v2.js and trace() steps
 * exactly like SpikeFoundry.simulateFrozen in spikefoundry/engine.js (no plasticity: weights are never written). */
var MOTIFS=['feedforward','lateral','wta','delay-line','coincidence'],PATTERNS=['all','one','lateral','feedforward'];
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function round4(x){return Math.round(x*10000)/10000;}
function fromV1(g){var h=clamp(Math.round(g.nodes||2),1,8),m=g.topology==='memory'?'delay-line':g.topology==='routed'?'wta':'coincidence';return{v:2,modules:[{id:'in',kind:'input',n:2},{id:'e',kind:'lif',n:h,sign:1,thr:round4(g.thr||1.2),leak:round4(g.decay||.5),motif:m},{id:'i',kind:'lif',n:1,sign:-1,thr:round4(g.thr||1.2),leak:round4(g.decay||.5),motif:'lateral'},{id:'out',kind:'output',n:1}],wires:[{from:'in',to:'e',pattern:'all',weight:round4(g.wa||1),delay:0},{from:'e',to:'i',pattern:'one',weight:round4((g.wb||1)*.5),delay:g.topology==='memory'?1:0},{from:'i',to:'e',pattern:'lateral',weight:.3,delay:0},{from:'e',to:'out',pattern:'feedforward',weight:round4(Math.max(g.wa||1,g.wb||1)),delay:0}]};}
function sanitize(g){var mods=(g.modules||[]).slice(0,6).map(function(m){return{id:String(m.id||'m').replace(/[^a-z0-9]/g,'').slice(0,8)||'m',kind:m.kind==='input'||m.kind==='output'?m.kind:'lif',n:clamp(Math.round(m.n||1),1,8),sign:m.sign<0?-1:1,thr:round4(clamp(m.thr==null?1:m.thr,.4,3)),leak:round4(clamp(m.leak==null?.8:m.leak,.1,.95)),motif:MOTIFS.indexOf(m.motif)>=0?m.motif:'feedforward'};});
var ids={};mods.forEach(function(m){ids[m.id]=true;});
var wires=(g.wires||[]).slice(0,8).filter(function(w){return ids[w.from]&&ids[w.to];}).map(function(w){return{from:w.from,to:w.to,pattern:PATTERNS.indexOf(w.pattern)>=0?w.pattern:'one',weight:round4(clamp(w.weight==null?.5:w.weight,-2,2)),delay:clamp(Math.round(w.delay||0),0,4)};});
return{v:2,modules:mods,wires:wires};}
function compile(genome){var g=sanitize(genome&&genome.modules?genome:fromV1(genome||{})),ns=[],range={};
g.modules.forEach(function(m,mi){var s=ns.length;for(var i=0;i<m.n;i++)ns.push({kind:m.kind,thr:m.thr,leak:m.leak,sign:m.sign,mod:mi,idx:i});range[m.id]={start:s,n:m.n,sign:m.sign};});
var es=[];g.wires.forEach(function(w){var a=range[w.from],b=range[w.to];if(!a||!b)return;var sign=a.sign<0?-1:1,wt=round4(w.weight*(w.from==='in'||a.sign>0?1:sign));
for(var i=0;i<a.n;i++){var t=[];if(w.pattern==='all'){for(var j=0;j<b.n&&t.length<3;j++)t.push(j);}else if(w.pattern==='feedforward'){t.push(i%b.n);if(b.n>1)t.push((i+1)%b.n);}else if(w.pattern==='lateral'){t.push((i+1)%b.n);}else t.push(i%b.n);
t.forEach(function(j){if(es.length<64)es.push({from:a.start+i,to:b.start+j,weight:wt,delay:w.delay});});}});
return{mods:g.modules,neurons:ns,edges:es,inputs:ns.map(function(n,i){return n.kind==='input'?i:-1;}).filter(function(i){return i>=0;}),outputs:ns.map(function(n,i){return n.kind==='output'?i:-1;}).filter(function(i){return i>=0;})};}
/* Same loop as simulateFrozen, recording every step. */
function trace(net,seq){var N=net.neurons.length,mem=[],spk=[],fired=[],total=0,H=seq.length+4,inbox=[],steps=[],volt=[],sent=[],t,i,e;
for(i=0;i<N;i++){mem.push(0);spk.push(0);}for(i=0;i<net.outputs.length;i++)fired.push(false);for(t=0;t<H+6;t++){var row=[];for(i=0;i<N;i++)row.push(0);inbox.push(row);}
for(t=0;t<H;t++){for(i=0;i<net.inputs.length;i++)spk[net.inputs[i]]=t<seq.length?(seq[t][i]||0):0;var v=[];
for(i=0;i<N;i++){var n=net.neurons[i];if(n.kind==='input'){v.push(0);continue;}mem[i]=n.leak*mem[i]+inbox[t][i];spk[i]=0;v.push(mem[i]);if(mem[i]>=n.thr){spk[i]=1;mem[i]=0;total++;var o=net.outputs.indexOf(i);if(o>=0)fired[o]=true;}}
steps.push(spk.slice());volt.push(v);
for(e=0;e<net.edges.length;e++){var ed=net.edges[e];if(!spk[ed.from])continue;var w=t+ed.delay+1;if(w<inbox.length){inbox[w][ed.to]+=ed.weight;sent.push({t:t,e:e,at:w});}}}
return{H:H,spikes:steps,volt:volt,sent:sent,outputs:fired.map(Boolean),spikeCount:total};}
/* designer.js scoreSet: exact match needs as many outputs as labels, all equal. */
function caseCorrect(net,tr,c){return c.timing?net.outputs.every(function(id,i){var tick=tr.spikes.findIndex(function(row){return !!row[id];});return (tick<0?null:tick)===c.timing[i];}):correct(tr.outputs,c.label);}
function correct(outs,label){var lab=(label||[]).map(function(x){return!!x;}),m=outs.length===lab.length&&lab.length>0;for(var j=0;j<Math.max(outs.length,lab.length);j++)if(!!outs[j]!==lab[j])m=false;return m;}
function score(net,cases){var sp=0,ex=0,positives=0,tp=0;cases.forEach(function(c){var r=trace(net,c.seq);sp+=r.spikeCount;if(correct(r.outputs,c.label))ex++;c.label.forEach(function(want,i){if(want){positives++;if(r.outputs[i])tp++;}});});var n=Math.max(1,cases.length),acc=cases.length?ex/cases.length:0,quality=positives&&!tp?0:clamp(acc-.0015*(net.neurons.length+net.edges.length)-.00025*sp/n,0,1);return{spikes:sp,correct:ex,n:cases.length,accuracy:acc,quality:quality};}
/* The evaluator scores 4 held-out cases (designer.js scoreGenome default). Held-out cases do not depend on the job seed. */
function heldCases(task,n){var SF=root.SpikeFoundry;if(!SF||!SF.taskSamples)return[];return SF.taskSamples(task,n||4,true,1).map(function(s){return{seq:s.seq,label:s.label};});}

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var NS='http://www.w3.org/2000/svg',W=760,NH=260;
function layout(net){var cols=net.mods.length,pos=[];net.neurons.forEach(function(n){var m=net.mods[n.mod],x=60+(cols>1?n.mod*(W-120)/(cols-1):W/2),y=NH/2+(n.idx-(m.n-1)/2)*Math.min(44,(NH-60)/Math.max(1,m.n));pos.push([x,y]);});
var curves=net.edges.map(function(e){var a=pos[e.from],b=pos[e.to],dx=b[0]-a[0],bend=dx<=0?-60:0,c=[(a[0]+b[0])/2,(a[1]+b[1])/2+bend+(dx===0?-30:0)];if(e.from===e.to){a=[a[0]-8,a[1]-9];b=[b[0]+8,b[1]-9];c=[a[0]+8,a[1]-70];}return[a,c,b];});return{pos:pos,curves:curves};}
function qpt(q,u){var v=1-u;return[v*v*q[0][0]+2*v*u*q[1][0]+u*u*q[2][0],v*v*q[0][1]+2*v*u*q[1][1]+u*u*q[2][1]];}
function names(task){if(task==='Two-stream sequence')return{inputs:['A','B'],outputs:['Stream A','Stream B']};if(task==='Inverse design'||task==='Three-neuron pilot')return{inputs:['A','B'],outputs:['Output']};var SF=root.SpikeFoundry,t=SF&&SF.BASE_TASKS&&SF.BASE_TASKS[task];return t?{inputs:t.inputs,outputs:t.outputs}:{inputs:[],outputs:[]};}
function mount(box,o){
var net=o.net,lay=layout(net),cases=o.cases||[],nm=names(o.task),reduce=!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
var all=cases.map(function(c){return trace(net,c.seq);}),ci=0;for(var k=0;k<cases.length;k++){if(cases[k].label.some(Boolean)&&all[k].spikeCount>0){ci=k;break;}}
if(!(all[ci]&&all[ci].spikeCount>0))for(k=0;k<cases.length;k++)if(cases[k].label.some(Boolean)){ci=k;break;}
var tr=all[ci],tau=0,playing=false,raf=0,last=0,speed=1,STEP=650,HOLD=.8,dead=false;
function lbl(i){var n=net.neurons[i],io=n.kind==='input'?net.inputs.indexOf(i):net.outputs.indexOf(i);if(n.kind==='input')return nm.inputs[io]||('in'+io);if(n.kind==='output')return nm.outputs[io]||('out'+io);return(n.sign<0?'i':'e')+n.idx;}
var s='<svg class="snn-net" viewBox="0 0 '+W+' '+NH+'" role="img" aria-label="Network playback"><defs><filter id="snn-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="4"/></filter></defs><g class="snn-wires">';
net.mods.forEach(function(m,mi){var x=60+(net.mods.length>1?mi*(W-120)/(net.mods.length-1):W/2);s+='<text class="net-label" x="'+x+'" y="18" text-anchor="middle">'+esc((m.kind==='lif'?(m.sign<0?'INHIB ':'EXCIT ')+m.id:m.kind).toUpperCase())+'</text>';});
net.edges.forEach(function(e,ei){var q=lay.curves[ei];s+='<path class="wire'+(e.weight<0?' inhib':' excit')+(e.delay>0?' delay':'')+'" d="M'+q[0][0]+' '+q[0][1]+' Q'+q[1][0]+' '+q[1][1]+' '+q[2][0]+' '+q[2][1]+'" stroke-width="'+(1+Math.min(2.5,Math.abs(e.weight)*1.2)).toFixed(1)+'"><title>'+esc(lbl(e.from)+' → '+lbl(e.to))+' · weight '+e.weight.toFixed(2)+' · arrives after '+(e.delay+1)+' step'+(e.delay?'s':'')+'</title></path>';});
s+='</g><g class="snn-pulses"></g><g class="snn-nodes">';
net.neurons.forEach(function(n,i){var p=lay.pos[i],c=n.kind==='input'?'node-input':n.kind==='output'?'node-output':n.sign<0?'node-inhib':'node-hidden',io=n.kind==='input'?net.inputs.indexOf(i):-1,unused=n.kind==='input'&&io>=nm.inputs.length&&nm.inputs.length>0;
var x=p[0],y=p[1],body;
if(n.kind==='input')body='<rect class="'+c+' body" x="'+(x-11)+'" y="'+(y-11)+'" width="22" height="22" rx="5"/>';
else if(n.kind==='lif'&&n.sign<0)body='<polygon class="'+c+' body" points="'+x+','+(y-14)+' '+(x+14)+','+y+' '+x+','+(y+14)+' '+(x-14)+','+y+'"/>';
else body='<circle class="'+c+' body" cx="'+x+'" cy="'+y+'" r="'+(n.kind==='output'?12:11)+'"/>';
var label=n.kind==='lif'
  ?'<text class="neuron-sign" x="'+x+'" y="'+y+'" text-anchor="middle" dominant-baseline="central">'+(n.sign<0?'−':'+')+'</text>'
  :'<text class="snn-io-label" x="'+x+'" y="'+(y+(n.kind==='input'?-17:-19))+'" text-anchor="middle">'+esc(unused?'unused':lbl(i))+'</text>';
var detail=n.kind==='lif'?(n.sign<0?'Inhibitory':'Excitatory')+' neuron '+lbl(i)+' · threshold '+n.thr.toFixed(2)+' · leak '+n.leak.toFixed(2):lbl(i);
s+='<g class="snn-n '+c+'-g'+(unused?' unused':'')+'"><circle class="halo" cx="'+x+'" cy="'+y+'" r="19" opacity="0" filter="url(#snn-glow)"/>'
  +body+'<circle class="charge" cx="'+x+'" cy="'+y+'" r="0"/>'+label+'<title>'+esc(detail)+'</title></g>';
});
s+='</g><text class="snn-silent" x="'+W/2+'" y="'+(NH-12)+'" text-anchor="middle"></text></svg>';
var tw=W,lx=72,rows=net.inputs.concat(net.outputs),RH=15,TH=rows.length*RH+40;
function ctl(){var c='<div class="snn-bar"><button type="button" class="snn-btn" data-a="play" aria-label="Play">▶</button><button type="button" class="snn-btn" data-a="restart" aria-label="Restart" title="Restart">↺</button><button type="button" class="snn-btn" data-a="back" aria-label="Step back" title="Step back">‹</button><button type="button" class="snn-btn" data-a="fwd" aria-label="Step forward" title="Step forward">›</button>'
+'<input type="range" class="snn-scrub" min="0" max="1000" value="0" aria-label="Time"><span class="snn-time">t 0.0</span><label class="snn-speed">speed <select aria-label="Speed"><option value=".25">0.25×</option><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div>';
c+='<div class="snn-cases"><span>Held-out case</span>';cases.forEach(function(cs,i){c+='<button type="button" class="snn-case'+(i===ci?' on':'')+'" data-c="'+i+'" title="'+(caseCorrect(net,all[i],cs)?'scored correct':'scored wrong')+'">'+(i+1)+'<i>'+(caseCorrect(net,all[i],cs)?'✓':'✗')+'</i></button>';});return c+'</div>';}
var key='<details class="snn-key" open><summary>Network legend</summary><ul>'
  +'<li><i class="port" style="--key-color:#69e2b1" aria-hidden="true"></i>Input</li>'
  +'<li><i style="--key-color:#65c7f2" aria-hidden="true"></i>Excitatory neuron (+)</li>'
  +'<li><i class="diamond" style="--key-color:#ff6fb0" aria-hidden="true"></i>Inhibitory neuron (−)</li>'
  +'<li><i style="--key-color:#ffca76" aria-hidden="true"></i>Output</li>'
  +'<li><i class="wire-key" style="--key-color:#2f7a60" aria-hidden="true"></i>Nonnegative weight</li>'
  +'<li><i class="wire-key" style="--key-color:#b8457e" aria-hidden="true"></i>Inhibitory weight</li></ul>'
  +'<p>Moving dots are spikes. Mint dots travel on nonnegative wires and pink dots on inhibitory wires. A glow marks a recent spike. The inner dot shows charge toward the firing threshold. Dashed wires add a delay. Hover over a wire for its weight and travel time.</p></details>';
box.innerHTML='<div class="snn-player"><div class="stage snn-stage">'+s+'</div>'+ctl()+key+'<div class="stage snn-trace-stage"><svg class="snn-trace" viewBox="0 0 '+tw+' '+TH+'" role="img" aria-label="Input and output spikes over time"></svg></div><div class="snn-io"></div><div class="snn-check"></div></div>';
var svg=box.querySelector('.snn-net'),pulseG=svg.querySelector('.snn-pulses'),nodes=[].slice.call(svg.querySelectorAll('.snn-n')),halos=nodes.map(function(g){return g.querySelector('.halo');}),charges=nodes.map(function(g){return g.querySelector('.charge');}),silent=svg.querySelector('.snn-silent'),
playB=box.querySelector('[data-a=play]'),scrub=box.querySelector('.snn-scrub'),timeL=box.querySelector('.snn-time'),tsvg=box.querySelector('.snn-trace'),pool=[],head,lastS={};
function drawTrace(){var H=tr.H,cw=(tw-lx-90)/H,h='';for(var t=0;t<=H;t++)h+='<line x1="'+(lx+t*cw)+'" x2="'+(lx+t*cw)+'" y1="8" y2="'+(TH-26)+'" class="grid"/>';
rows.forEach(function(i,r){var n=net.neurons[i],y=10+r*RH,isOut=n.kind==='output',oi=net.outputs.indexOf(i);var un=!isOut&&nm.inputs.length&&net.inputs.indexOf(i)>=nm.inputs.length;h+='<text x="'+(lx-8)+'" y="'+(y+10)+'" text-anchor="end" class="rl'+(isOut?' out':'')+'">'+esc(un?'unused':(isOut?'out ':'in ')+lbl(i))+'</text>';
for(var t=0;t<H;t++)if(tr.spikes[t][i])h+='<rect x="'+(lx+t*cw+2)+'" y="'+(y+1)+'" width="'+(cw-4)+'" height="'+(RH-4)+'" rx="2" class="'+(isOut?'so':'si')+'"/>';
if(isOut){var want=oi<cases[ci].label.length?!!cases[ci].label[oi]:null;h+='<text x="'+(tw-84)+'" y="'+(y+10)+'" class="rl xp">'+(want===null?'not scored':'want '+(want?'●':'○')+' got '+(tr.outputs[oi]?'●':'○'))+'</text>';}});
h+='<text x="'+lx+'" y="'+(TH-8)+'" class="rl">time step 0 → '+(H-1)+' · inputs stop at '+(cases[ci].seq.length-1)+'</text><line class="playhead" x1="'+lx+'" x2="'+lx+'" y1="4" y2="'+(TH-22)+'"/>';tsvg.innerHTML=h;head=tsvg.querySelector('.playhead');tsvg._cw=cw;}
function io(){var c=cases[ci],ins=[];c.seq.forEach(function(row,t){row.forEach(function(v,j){if(v)ins.push((nm.inputs[j]||'in'+j)+' at t'+t);});});
var exp=nm.outputs.map(function(nmo,j){return nmo+' '+(c.timing&&c.timing[j]!==null?'fires at tick '+c.timing[j]:c.label[j]?'fires':'stays quiet');}).join(', '),got=net.outputs.map(function(i,j){return lbl(i)+' '+(tr.outputs[j]?(c.timing?'fires at tick '+tr.spikes.findIndex(function(row){return !!row[i];}):'fires'):'stays quiet');}).join(', '),ok=caseCorrect(net,tr,c);
var miss=nm.inputs.slice(net.inputs.length);box.querySelector('.snn-io').innerHTML='<span><b>Input</b> '+esc(ins.join(' · ')||'no spikes')+(miss.length?' <em class="muted">('+esc(miss.join(', '))+' '+(miss.length>1?'have':'has')+' no input neuron in this design)</em>':'')+'</span><span><b>Expected</b> '+esc(exp)+'</span><span class="'+(ok?'ok':'err')+'"><b>Network</b> '+esc(got||'no output neuron')+' '+(ok?'✓':'✗')+(net.outputs.length!==nm.outputs.length&&nm.outputs.length?' (has '+net.outputs.length+' outputs, the task has '+nm.outputs.length+')':'')+'</span>';
silent.textContent=tr.spikeCount===0?'This design never fires on this input'+(all.every(function(r){return r.spikeCount===0;})?' (nor on any held-out case)':'')+'.':'';}
function check(){var sc=score(net,cases),r=o.record||{},same=r.spikes==null||(sc.spikes===r.spikes&&(r.accuracy==null||Math.abs(sc.accuracy-r.accuracy)<6e-5));
box.querySelector('.snn-check').innerHTML=same?'<span class="ok">Exact replay</span> · same neuron model and wiring as the evaluator, no learning · its '+sc.n+' held-out cases here: '+sc.spikes+' spike'+(sc.spikes===1?'':'s')+', '+sc.correct+'/'+sc.n+' correct'+(r.spikes!=null?', matching the stored record':''):'<span class="warn">Illustrative</span> · this replay gives '+sc.spikes+' spikes and '+sc.correct+'/'+sc.n+' correct; the stored record says '+r.spikes+' spikes'+(r.accuracy!=null?' and accuracy '+Number(r.accuracy).toFixed(3):'')+'. The design was likely scored by an older engine or on different cases.';}
function pulse(k){if(!pool[k]){var c=document.createElementNS(NS,'circle');c.setAttribute('r','4.2');pulseG.appendChild(c);pool[k]=c;}return pool[k];}
function frame(){var H=tr.H,T=Math.min(tau,H-.001),st=Math.floor(T),i,n=0;
for(i=0;i<nodes.length;i++){var ls=-1;for(var t=st;t>=0&&t>st-4;t--)if(tr.spikes[t][i]){ls=t;break;}var age=ls<0?9:T-ls,g=age<4?Math.exp(-age*1.6):0,f=age<.3;
var key=(g*40|0)+(f?'f':'');if(lastS[i]!==key){halos[i].setAttribute('opacity',g.toFixed(2));nodes[i].classList.toggle('fire',f);lastS[i]=key;}
var nn=net.neurons[i];if(nn.kind!=='input'){var v=tr.volt[st][i]/nn.thr;if(tr.spikes[st][i])v=Math.max(0,1-(T-st)*3);var r=(clamp(v,0,1)*8).toFixed(1);if(charges[i]._r!==r){charges[i].setAttribute('r',r);charges[i]._r=r;}}}
for(i=0;i<tr.sent.length;i++){var d=tr.sent[i];if(T<d.t||T>=d.at)continue;var e=net.edges[d.e],p=qpt(lay.curves[d.e],(T-d.t)/(d.at-d.t)),c=pulse(n++);c.setAttribute('cx',p[0].toFixed(1));c.setAttribute('cy',p[1].toFixed(1));c.setAttribute('class',e.weight<0?'pi':'pe');c.style.display='';}
for(i=n;i<pool.length;i++)pool[i].style.display='none';
if(head){var x=(lx+T*tsvg._cw).toFixed(1);head.setAttribute('x1',x);head.setAttribute('x2',x);}
scrub.value=String(Math.round(T/H*1000));timeL.textContent='t '+T.toFixed(1)+' / '+H;}
function loop(ts){if(dead)return;raf=0;if(!playing)return;var dt=last?Math.min(100,ts-last):0;last=ts;tau+=dt*speed/STEP;if(tau>=tr.H+HOLD)tau=0;frame();raf=requestAnimationFrame(loop);}
function play(on){playing=on;playB.textContent=on?'❚❚':'▶';playB.setAttribute('aria-label',on?'Pause':'Play');box.querySelector('.snn-player').classList.toggle('playing',on);if(on&&!raf&&!document.hidden){last=0;raf=requestAnimationFrame(loop);}if(!on&&raf){cancelAnimationFrame(raf);raf=0;}}
function setCase(k){ci=k;tr=all[k];tau=0;box.querySelectorAll('.snn-case').forEach(function(b){b.classList.toggle('on',+b.getAttribute('data-c')===k);});drawTrace();io();frame();if(o.onCase)o.onCase(k,tr);}
function vis(){if(document.hidden){if(raf){cancelAnimationFrame(raf);raf=0;}}else if(playing&&!raf){last=0;raf=requestAnimationFrame(loop);}}
box.addEventListener('click',function(ev){var b=ev.target.closest('button');if(!b||!box.contains(b))return;var a=b.getAttribute('data-a');
if(a==='play'){if(!playing&&tau>=tr.H-.01)tau=0;play(!playing);}else if(a==='restart'){tau=0;frame();if(!reduce)play(true);}else if(a==='back'){play(false);tau=Math.max(0,Math.ceil(tau)-1);frame();}else if(a==='fwd'){play(false);tau=Math.min(tr.H-.001,Math.floor(tau)+1);frame();}else if(b.hasAttribute('data-c')){setCase(+b.getAttribute('data-c'));}});
scrub.addEventListener('input',function(){play(false);tau=+scrub.value/1000*tr.H;frame();});
box.querySelector('.snn-speed select').addEventListener('change',function(ev){speed=+ev.target.value||1;});
document.addEventListener('visibilitychange',vis);
drawTrace();io();check();
if(reduce||!o.autoplay){var fs=0;for(var t=0;t<tr.H;t++)if(tr.spikes[t].some(Boolean)){fs=t;break;}tau=fs+.15;frame();play(false);}else{frame();play(true);}
return{destroy:function(){dead=true;play(false);document.removeEventListener('visibilitychange',vis);},caseIndex:function(){return ci;},trace:function(){return tr;},set:function(x){play(false);tau=x;frame();},net:net};}
root.SnnPlayer={sanitize:sanitize,compile:compile,trace:trace,correct:correct,score:score,heldCases:heldCases,mount:mount};
})(typeof window!=='undefined'?window:globalThis);
JS;
}

function discoveriesJs(): string
{
    return <<<'JS'
(function(){
var D=JSON.parse(document.getElementById('disc-data').textContent),V=document.getElementById('viewer'),T=document.getElementById('v-title'),G=document.getElementById('v-tag'),cache={};
var engineReady=new Promise(function(resolve){
function loaded(){return window.SpikeFoundry&&typeof window.SpikeFoundry.taskSamples==='function';}
if(loaded()){resolve(true);return;}
var script=document.getElementById('disc-engine');
script.addEventListener('load',function(){resolve(!!loaded());},{once:true});
script.addEventListener('error',function(){resolve(false);},{once:true});
});
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function ago(iso){var d=(Date.parse(D.now)-Date.parse(iso))/1000;if(!(d>=0))return iso;if(d<90)return 'just now';if(d<5400)return Math.round(d/60)+' min ago';if(d<129600)return Math.round(d/3600)+' h ago';return Math.round(d/86400)+' days ago';}
function when(iso){var d=new Date(iso);if(isNaN(d.getTime()))return String(iso||'');var o={month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'};if(d.getFullYear()!==new Date().getFullYear())o.year='numeric';try{return d.toLocaleString(undefined,o);}catch(e){return d.toLocaleString();}}
function formatFindTimes(){[].forEach.call(document.querySelectorAll('#disc-list time.disc-when'),function(t){var iso=t.getAttribute('datetime');t.textContent='Found '+when(iso);t.title=ago(iso);});}
function metric(l,v,n,a){return '<div class="metric'+(a?' accent':'')+'"><div class="metriclabel">'+esc(l)+'</div><div class="metricvalue">'+v+'</div><div class="metricnote">'+esc(n||'')+'</div></div>';}
function f3(x){return x==null?'—':Number(x).toFixed(3);}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function rasterSvg(net,r){var N=net.neurons.length,T=r.length,W=360,rh=Math.max(8,Math.min(16,180/N)),H=N*rh+26,cw=(W-50)/T,s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Spike raster">';
for(var i=0;i<N;i++){var n=net.neurons[i],col=n.kind==='input'?'#69e2b1':n.kind==='output'?'#ffca76':n.sign<0?'#ff6fb0':'#65c7f2';s+='<text x="2" y="'+(i*rh+rh*.75+4)+'" fill="'+col+'" font-size="8" font-family="monospace">'+(n.kind==='input'?'in':n.kind==='output'?'out':(n.sign<0?'i':'e'))+n.idx+'</text>';
for(var t=0;t<T;t++)if(r[t][i])s+='<rect x="'+(40+t*cw)+'" y="'+(i*rh+2)+'" width="'+Math.max(2,cw-2)+'" height="'+(rh-3)+'" rx="2" fill="'+col+'"/>';}
s+='<text x="40" y="'+(H-6)+'" fill="#6e808e" font-size="9" font-family="monospace">time step 0 → '+(T-1)+'</text>';return s+'</svg>';}
function historySvg(pts,mark){if(!pts||pts.length<2)return '<p class="muted">The score history appears after two job summaries.</p>';var W=360,H=150,n=pts.length,b='',d='';pts.forEach(function(p,i){var x=8+i*(W-16)/(n-1);b+=(i?' ':'')+x.toFixed(1)+','+(8+(1-clamp(p[0],0,1))*(H-16)).toFixed(1);d+='<circle cx="'+x.toFixed(1)+'" cy="'+(8+(1-clamp(p[1],0,1))*(H-16)).toFixed(1)+'" r="1.6" fill="#65c7f2" opacity=".6"/>';});
var my=(8+(1-clamp(mark,0,1))*(H-16)).toFixed(1);return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Score history">'+d+'<polyline fill="none" stroke="#69e2b1" stroke-width="2" points="'+b+'"/><line x1="8" x2="'+(W-8)+'" y1="'+my+'" y2="'+my+'" stroke="#ffca76" stroke-dasharray="4 3"/></svg><div class="legend"><span><i></i>Best held-out</span><span class="b"><i></i>Each job</span><span class="c"><i></i>This design</span></div>';}
function overview(){T.textContent='Overview';G.textContent='ALL TASKS';var by={};D.items.forEach(function(it){if(!by[it.task]||it.held>by[it.task].held)by[it.task]=it;});
if(D.inverse){G.textContent='INVERSE DESIGN';V.innerHTML='<div class="metrics">'+metric('Designs listed',D.items.length,'top results by metric',true)+'</div><p class="muted">Select a design to see its scores, wiring, and replay cases.</p>';return;}
var h='<div class="metrics">'+metric('Designs listed',D.items.length,'top N per quality measure',true)+metric('Tasks',Object.keys(by).length,'curriculum levels reached')+metric('Yours',D.items.filter(function(i){return i.mine;}).length,D.mineCount?'found by your computer':'link a computer on Home')+metric('Contributors',D.board.length,'with public credit or Anonymous')+'</div>';
h+='<div class="viz-title"><strong>Best per task</strong><span>held-out score</span></div><div class="tasks">';Object.keys(by).forEach(function(k){var it=by[k];h+='<div class="taskcard"><div class="taskline"><span class="taskname">Level '+it.level+' · '+esc(k)+'</span><span class="taskscore">'+f3(it.held)+'</span></div><div class="taskdesc2">'+esc(it.finder)+' · '+it.neurons+' neurons · '+it.synapses+' synapses · '+'<span title="'+esc(ago(it.when))+'">'+esc(when(it.when))+'</span></div><div class="prog"><i style="width:'+Math.round(100*clamp(it.held,0,1))+'%"></i></div></div>';});
h+='</div><div class="viz-title"><strong>Contributors</strong><span>evaluation time donated</span></div><div class="log">';D.board.forEach(function(b){h+='<div class="logline"><span class="logtime">'+b.hours.toFixed(2)+' h</span><span class="logtext">'+esc(b.name)+'</span><span class="logscore">'+b.genomes+' designs</span></div>';});if(!D.board.length)h+='<p class="muted">No public results yet.</p>';var verified=document.getElementById('disc-verification');V.innerHTML=(verified?verified.innerHTML:'')+h+'</div>';}
function show(i,auto){var selection=++generation;if(player){player.destroy();player=null;}if(i<0)return overview();var it=D.items[i];var badges=(it.badges||[]).map(function(b){return '<span class="badge-m">'+esc(b)+'</span>';}).join('');T.innerHTML=esc(it.label||('#'+it.rank+' '+it.task))+(it.mine?'<span class="badge-mine">Your computer</span>':'')+badges;G.textContent=it.inverse?it.level+' HIDDEN '+(it.level===1?'NEURON':'NEURONS'):'LEVEL '+it.level;
var h='<div class="chips" style="margin-bottom:12px"><span class="chip">genome <b>'+esc(it.hash.slice(0,12))+'</b></span><span class="chip'+(it.mine?' mine':'')+'">found by '+esc(it.finder)+'</span><span class="chip disc-found" title="'+esc(ago(it.when))+'">found <b>'+esc(when(it.when))+'</b></span>'+(it.public?'<span class="chip"><b>public</b></span>':'')+(it.confirmations?'<span class="chip" title="Found again by later jobs">confirmed <b>'+it.confirmations+'×</b>'+(it.confirmedBy&&it.confirmedBy.length?' by '+esc(it.confirmedBy.join(', ')):'')+'</span>':'')+(it.variants?'<span class="chip" title="Other circuits with the same scores, size and spikes">+'+it.variants+' equivalent variant'+(it.variants>1?'s':'')+'</span>':'')+(it.badges&&it.badges.length?it.badges.map(function(b){return '<span class="chip" title="Among the top designs of this task on this measure">'+esc(b)+'</span>';}).join(''):'')+'</div>';
h+='<div class="metrics">'+(it.inverse
  ?metric('Accuracy',f3(it.accuracy),it.cases+' held-out cases',true)+metric('Recall',f3(it.recall),'positive cases')+metric('Specificity',f3(it.specificity),'negative cases')+metric('Demo match',f3(it.train),'examples used to select the proposal')
  :metric('Held-out score',f3(it.held),'size penalty included',true)+metric('Train score',f3(it.train),it.accuracy!=null?'accuracy '+f3(it.accuracy):'')+metric('Circuit size',it.neurons+'<small> / '+it.synapses+'</small>','neurons / synapses')+metric('Spikes',it.spikes,'on held-out cases · '+it.evalMs+' ms'))+'</div>';
h+='<div class="viz-title"><strong>Frozen network · playback</strong><span id="net-note">loading…</span></div><div id="net"><div class="stage"><div class="private">Loading the wiring…</div></div></div>';
h+='<div class="viz-grid"><div><div class="viz-title"><strong>Spike raster</strong><span id="raster-note">every neuron · held-out case</span></div><div class="stage" id="raster"><div class="private">Needs the wiring.</div></div>'
  +'<ul class="snn-raster-key" aria-label="Spike raster legend"><li><i style="--key-color:#69e2b1" aria-hidden="true"></i>in · input</li><li><i style="--key-color:#65c7f2" aria-hidden="true"></i>e · excitatory</li><li><i style="--key-color:#ff6fb0" aria-hidden="true"></i>i · inhibitory</li><li><i style="--key-color:#ffca76" aria-hidden="true"></i>out · output</li></ul></div>'
  +(it.inverse?'':'<div><div class="viz-title"><strong>Score history · '+esc(it.task)+' (whole task)</strong><span>'+((D.series[it.task]||[]).length)+' jobs, same for every design of this task</span></div>'+historySvg(D.series[it.task],it.held)+'</div>')+'</div>';
V.innerHTML=h;V.scrollTop=0;var hash=it.hash;
function draw(g){return engineReady.then(function(ready){if(selection!==generation)return;var P=window.SnnPlayer,R=document.getElementById('raster'),box=document.getElementById('net'),note=document.getElementById('net-note');
if(!ready){note.textContent='unavailable';box.textContent='The simulator could not load. Reload the page to try again.';R.textContent='Playback unavailable.';return;}
try{var net,cases;
if(it.inverse){
  net=g.graph?JSON.parse(JSON.stringify(g.graph)):window.SpikeFoundry.inverseCircuit(g.genes);
  net.mods=[{id:'in',kind:'input',n:2}];
  net.neurons.slice(2).forEach(function(n,i){net.mods.push({id:n.kind==='output'?'out':'h'+(i+1),kind:n.kind,sign:1,n:1});});
  net.neurons.forEach(function(n,i){n.mod=i<2?0:i-1;n.idx=i<2?i:0;n.sign=1;});
  cases=g.replay.map(function(pair){return{seq:[0,1,2,3].map(function(t){return[(pair[0]>>(2*t))&1,(pair[0]>>(2*t+1))&1];}),label:g.timing?pair[1].map(function(t){return t!==null;}):[pair[1]],timing:g.timing?pair[1]:null};});
}else{net=P.compile(g);cases=P.heldCases(it.task,4);}
note.textContent=net.neurons.length+' neurons · '+net.edges.length+' synapses · weights fixed';
if(!cases.length){box.textContent='Playback cases are unavailable for this task.';R.textContent='Playback unavailable.';return;}
player=P.mount(box,{net:net,task:it.task,cases:cases,record:it.inverse?null:{spikes:it.spikes,accuracy:it.accuracy},autoplay:auto,onCase:function(k,tr){R.innerHTML=rasterSvg(net,tr.spikes);document.getElementById('raster-note').textContent='every neuron · held-out case '+(k+1);}});
R.innerHTML=rasterSvg(net,player.trace().spikes);document.getElementById('raster-note').textContent='every neuron · held-out case '+(player.caseIndex()+1);}catch(e){box.innerHTML='<div class="stage"><div class="private">Could not simulate this design here.</div></div>';R.innerHTML='<div class="private">Could not simulate this design here.</div>';}});}
function priv(){if(selection!==generation)return;document.getElementById('net-note').textContent='private';document.getElementById('net').innerHTML='<div class="private">The wiring of this design is private until the owner publishes it.<br>Its size: '+it.neurons+' neurons and '+it.synapses+' synapses.</div>';document.getElementById('raster').innerHTML='<div class="private">Shown with the wiring.</div>';}
if(it.inverse)return draw(it.inverse);
if(cache[hash]===false)return priv();if(cache[hash])return draw(cache[hash]);
fetch(D.genomeUrl+encodeURIComponent(hash),{credentials:'same-origin'}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(g){cache[hash]=g;draw(g);}).catch(function(){cache[hash]=false;priv();});}
var player=null,generation=0,btns=[],list=document.getElementById('disc-list'),selectedHash=null,listMarkup=list.innerHTML;
function pick(b){
  var index=+b.getAttribute('data-index');
  selectedHash=index<0?null:D.items[index].hash;
  btns.forEach(function(x){x.classList.toggle('active',x===b);});
  show(index,true);
}
function bindButtons(){
  btns=[].slice.call(document.querySelectorAll('#disc-list .disc'));
  btns.forEach(function(b){b.addEventListener('click',function(){pick(b);});});
}
bindButtons();
formatFindTimes();
list.addEventListener('keydown',function(e){if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;var i=btns.indexOf(document.activeElement);if(i<0)return;var n=btns[i+(e.key==='ArrowDown'?1:-1)];if(n){e.preventDefault();n.focus();pick(n);n.scrollIntoView({block:'nearest'});}});
overview();
var refreshStatus=document.getElementById('disc-refresh');
if(refreshStatus){
  var interval=30000,timer=null,request=null,lastCheck=Date.now();
  var refreshUrl=new URL(window.location.href);
  refreshUrl.searchParams.set('refresh','1');
  function updateDiscoveries(snapshot){
    var focus=btns.indexOf(document.activeElement);
    var focusedIndex=focus<0?null:+btns[focus].getAttribute('data-index');
    var focusedHash=focusedIndex===null||focusedIndex<0?null:D.items[focusedIndex].hash;
    D=snapshot.data;
    if(snapshot.list!==listMarkup){
      var scroll=list.scrollTop;
      listMarkup=snapshot.list;
      list.innerHTML=listMarkup;
      bindButtons();
      btns.forEach(function(button){
        var index=+button.getAttribute('data-index');
        var hash=index<0?null:D.items[index].hash;
        button.classList.toggle('active',hash===selectedHash);
        if(focusedIndex!==null&&hash===focusedHash)button.focus({preventScroll:true});
      });
      list.scrollTop=scroll;
    }
    formatFindTimes();
    document.getElementById('disc-count').textContent=D.items.length+' DESIGNS';
    document.getElementById('disc-verification').innerHTML=snapshot.verification;
    if(selectedHash===null)overview();
  }
  function refresh(){
    if(document.hidden||request)return;
    request=new AbortController();
    var current=request,timeout=setTimeout(function(){current.abort();},15000);
    lastCheck=Date.now();
    refreshStatus.classList.add('is-loading');
    refreshStatus.textContent='Checking for new designs…';
    fetch(refreshUrl,{credentials:'same-origin',cache:'no-store',signal:current.signal})
      .then(function(response){if(!response.ok)throw new Error('Refresh failed');return response.json();})
      .then(function(snapshot){
        if(document.hidden||current.signal.aborted)return;
        updateDiscoveries(snapshot);
        refreshStatus.textContent='Checked '+new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',second:'2-digit'});
      })
      .catch(function(){if(!document.hidden)refreshStatus.textContent='Refresh delayed';})
      .finally(function(){clearTimeout(timeout);request=null;refreshStatus.classList.remove('is-loading');});
  }
  function stopRefresh(){clearInterval(timer);timer=null;if(request)request.abort();refreshStatus.textContent='Auto-refresh on';}
  function startRefresh(){
    if(document.hidden||timer)return;
    if(Date.now()-lastCheck>=interval)refresh();
    timer=setInterval(refresh,interval);
  }
  document.addEventListener('visibilitychange',function(){if(document.hidden)stopRefresh();else startRefresh();});
  window.addEventListener('pagehide',stopRefresh);
  window.addEventListener('pageshow',startRefresh);
  startRefresh();
}
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
    $store = $app->storageStatus();
    $seen = '';
    foreach ($app->taskTotals() as $tid => $t) {
        $seen .= ($seen === '' ? '' : ' · ') . $tid . ' ' . number_format($t['seen']) . ' seen, ' . number_format($t['kept']) . ' kept';
    }
    $storeLine = '<p class="quiet storage-line">Keeps the best ' . h(number_format($store['keep'])) . ' designs per task for each quality measure (held-out, train, efficiency, margin over random); the rest are counted for credit and not stored.'
        . ($store['mb'] !== null ? ' Database ' . h(number_format((float) $store['mb'], 0)) . ' MB (pruning harder above ' . h(number_format($store['soft'], 0)) . ' MB).' : '')
        . ($seen !== '' ? ' ' . h($seen) . '.' : '') . '</p>';
    return '<section class="panel"><div class="panelhead"><div class="paneltitle">Design library</div><span class="subtag">TOP COINCIDENCE DESIGNS</span></div><div class="panelbody"><p class="quiet">Weights stay frozen. The same genome is stored once.</p>' . $storeLine . '<div class="log">' . $list . '</div>'
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

function compositionResultsSection(App $app): string
{
    $rows = '';
    foreach ($app->compositionResults() as $family => $result) {
        $trials = (string) $result['trials'];
        $rows .= '<tr><td>' . h($family) . '</td><td>' . h((string) $result['jobs']) . '</td><td>'
            . h($result['learned'] . '/' . $trials) . '</td><td>' . h($result['baseline'] . '/' . $trials) . '</td></tr>';
    }
    return $rows === '' ? '' : '<section class="panel"><h2>Multi-neuron pilot results</h2>'
        . '<p>Held-out timing passes across the latest 120 completed pilot jobs.</p>'
        . '<table><thead><tr><th>Family</th><th>Jobs</th><th>DNN</th><th>Random</th></tr></thead><tbody>'
        . $rows . '</tbody></table></section>';
}

function sequenceStudySection(App $app, string $csrf): string
{
    $labels = ['current' => 'Current proposer', 'evolution' => 'Simple evolution', 'learned' => 'Learned designer'];
    $studies = $app->recentSequenceStudies();
    $times = array_fill_keys(array_keys($labels), []);
    $paired = 0;
    $seeds = 0;
    $comparison = static function (array $config): array {
        return [$config['cpuBudgetMs'] ?? null, $config['cap'] ?? null, $config['initialId'] ?? null];
    };
    $reference = $studies ? $comparison(reset($studies)['config']) : [];
    foreach ($studies as $study) {
        if ($comparison($study['config']) !== $reference) {
            continue;
        }
        $hasPair = false;
        foreach ($study['rounds'] as $round) {
            $arms = $round['arms'] ?? [];
            if (!is_array($arms) || array_diff_key($labels, $arms)) {
                continue;
            }
            $hasPair = true;
            $paired++;
            foreach ($labels as $name => $label) {
                $ms = $arms[$name]['verifiedCpuMs'] ?? null;
                if (is_numeric($ms) && $ms > 0) {
                    $times[$name][] = (float) $ms / 1000;
                }
            }
        }
        $seeds += $hasPair ? 1 : 0;
    }
    $summary = '<p class="muted">No completed studies with a matched comparison yet.</p>';
    if ($paired > 0) {
        $summary = '<p class="quiet">' . $paired . ' matched rounds across ' . $seeds . ' seeds using the latest study budget and starting checkpoint. Times include confirmation and the learned checkpoint’s training cost.</p><ul>';
        foreach ($labels as $name => $label) {
            sort($times[$name], SORT_NUMERIC);
            $n = count($times[$name]);
            $median = $n ? ($times[$name][intdiv($n - 1, 2)] + $times[$name][intdiv($n, 2)]) / 2 : null;
            $summary .= '<li>' . h($label . ' · ' . $n . '/' . $paired . ' verified'
                . ($median === null ? '' : ' · median ' . number_format($median, 3) . ' CPU-seconds when successful')) . '</li>';
        }
        $summary .= '</ul>';
    }
    $base = $app->base();
    return '<h2 style="margin-top:18px">Sequence study</h2>' . $summary
        . '<form method="post" action="' . h($base) . '/owner/sequence-study"><input type="hidden" name="csrf" value="' . h($csrf) . '">'
        . '<label>First seed <input name="seed" type="number" min="1" max="999998" required></label>'
        . '<button class="small" type="submit">Queue three capped study jobs</button></form>'
        . '<p class="quiet"><a href="' . h($base) . '/owner/sequence-experiment.json">Latest sequence experiment report (JSON)</a></p>'
        . '<p class="quiet"><a href="' . h($base) . '/owner/inverse-experiment.json">Latest inverse design report and model (JSON)</a> · '
        . '<a href="' . h($base) . '/owner/inverse-champion.json">Shared inverse model (JSON)</a> · '
        . '<a href="' . h($base) . '/owner/arena-pilot.json">BugBrain arena pilot (JSON)</a></p>';
}

function pageOwner(App $app, string $csrf, array $nav = [], string $error = '', string $status = 'all', int $page = 1): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $projects = $app->db->query('SELECT * FROM projects ORDER BY priority DESC, id ASC')->fetchAll();
    $templates = $app->db->query('SELECT * FROM templates ORDER BY id')->fetchAll();
    $workers = $app->db->query('SELECT * FROM workers WHERE removed_at IS NULL ORDER BY created_at DESC')->fetchAll();
    $removedCount = (int) $app->db->query('SELECT COUNT(*) FROM workers WHERE removed_at IS NOT NULL')->fetchColumn();
    $people = '';
    $revokedRows = '';
    foreach ($workers as $w) {
        if ((int) $w['revoked'] === 1) {
            $revokedRows .= '<li class="revoked-row"><span class="computer-name">' . h((string) $w['name']) . '</span><span class="quiet">revoked · ' . h((string) $app->contribution((string) $w['id'])['done']) . ' jobs done</span>'
                . '<form method="post" action="' . h($base) . '/owner/remove-computer" onsubmit="return confirm(\'Remove ' . h(addslashes((string) $w['name'])) . ' from this list? Its discoveries and credit stay.\')"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $w['id']) . '"><button class="button small stop" type="submit">Remove</button></form></li>';
            continue;
        }
        $leases = $app->leasesOf((string) $w['id']);
        $state = describeWorker($app, $w, $leases);
        $health = $app->healthOf($w);
        $done = $app->contribution((string) $w['id']);
        $revoked = (int) $w['revoked'] === 1;
        $controls = '';
        if (!$revoked) {
            $controls = resourceControl($base . '/owner/resources', $csrf, $w, $state, $base, true)
                . '<div class="head-actions"><form method="post" action="' . h($base) . '/owner/revoke" onsubmit="return confirm(\'Revoke this computer\\\'s token?\')"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $w['id']) . '"><button class="button small stop" type="submit">Revoke</button></form>'
                . newSetupForm($base . '/owner/setup-command', $csrf, (string) $w['id'])
                . '<form method="post" action="' . h($base) . '/owner/owner-home"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $w['id']) . '"><input type="hidden" name="shown" value="' . ((int) ($w['owner_home'] ?? 0) === 1 ? '0' : '1') . '"><button class="button small" type="submit">' . ((int) ($w['owner_home'] ?? 0) === 1 ? 'Hide from My computer' : 'Show on My computer') . '</button></form></div>';
        }
        $tone = ownerTone($state);
        $people .= '<div class="computer" data-computer="' . h((string) $w['id']) . '"><div class="computer-top"><span class="computer-name is-' . h($tone) . '" data-tone>' . h((string) $w['name']) . '</span><span class="computer-jobs" data-jobs-now>' . h(ownerJobsLine($state)) . '</span></div>'
            . ownerHealthNote($health)
            . '<p class="quiet owner-meta"><span data-seen>' . ($state['ago'] !== '' ? 'Last seen ' . h($state['ago']) : 'Not seen yet') . '</span> · ' . h((string) $done['done']) . ' jobs done</p>'
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
        . compositionResultsSection($app)
        . sequenceStudySection($app, $csrf)
        . '<h2 style="margin-top:18px">Task thresholds</h2>' . ($thresholds !== '' ? $thresholds : '<p class="muted">Thresholds appear after the first design upload.</p>')
        . '</div></details>';
    $store = $app->storageStatus();
    if ($store['warn']) {
        $err .= '<p class="err storage-warn">Database storage is high: ' . h(number_format((float) $store['mb'], 0)) . ' MB, over the ' . h(number_format($store['soft'], 0)) . ' MB guard (the host stops accepting writes at 3072 MB). The hourly prune is keeping fewer designs per task until it is back under.</p>';
    }
    $body = $err . '<section class="heading"><div><div class="eyebrow">Owner console</div><h1>Owner</h1><p>Computers, jobs, and task health. A running job stays with its computer while its heartbeat renews the lease. The detailed job settings are under Advanced.</p></div><div class="head-actions"><div class="chips">' . $summary . '</div></div></section>'
        . '<section class="panel owner-computers" id="computers"><div class="panelhead"><div class="paneltitle">Computers</div><span class="subtag">' . h((string) count(array_filter($workers, function ($w) { return (int) $w['revoked'] !== 1; }))) . ' ENROLLED</span></div><div class="panelbody">' . addComputerButton($base) . ($people !== '' ? $people : '<p class="muted">None enrolled.</p>')
        . ($revokedRows !== '' ? '<details class="revoked-list"><summary>Revoked (' . substr_count($revokedRows, '<li ') . ') — remove to clean up this list</summary><ul>' . $revokedRows . '</ul></details>' : '')
        . ($removedCount > 0 ? '<p class="quiet removed-note">' . h((string) $removedCount) . ' removed ' . ($removedCount === 1 ? 'computer is' : 'computers are') . ' hidden here; ' . ($removedCount === 1 ? 'its' : 'their') . ' discoveries and credit stay.</p>' : '')
        . '</div></section>'
        . '<div class="grid2"><div class="stack">'
        . '<section class="panel"><div class="panelhead"><div class="paneltitle">Jobs</div></div><div class="panelbody">' . $filterHtml . '<table><thead><tr><th>Job</th><th>Project</th><th>Status</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>' . $rows . '</tbody></table>' . $pager . '</div></section>'
        . '</div><div class="stack">' . $health . designLibrarySection($app, $csrf, $base) . '</div></div>'
        . $advanced;
    /* Keeps each computer's Resources state (Stopped / Starting… / running) current without a reload. */
        $poll = '<script>(function(){var u=' . json_encode($base . '/owner/run.json', JSON_UNESCAPED_SLASHES) . ';function tick(){if(document.hidden)return;fetch(u,{credentials:"same-origin",headers:{"Accept":"application/json"}}).then(function(r){return r.json();}).then(function(d){(d.computers||[]).forEach(function(c){var card=document.querySelector("[data-computer=\'"+c.id+"\']");if(!card)return;var f=card.querySelector("form[data-resources]");if(f&&f.__run)f.__run(c);var n=card.querySelector("[data-tone]");if(n&&c.tone)n.className="computer-name is-"+c.tone;var j=card.querySelector("[data-jobs-now]");if(j&&c.jobsLine)j.textContent=c.jobsLine;var s=card.querySelector("[data-seen]");if(s&&c.seen)s.textContent=c.seen;var e=card.querySelector("[data-effective]");if(e&&!(Date.now()<+(e.getAttribute("data-until")||0))&&e.textContent!=="Saving…")e.textContent=c.effective;var hb=card.querySelector("[data-health]");if(c.healthHtml){if(hb){hb.outerHTML=c.healthHtml;}else{var meta=card.querySelector(".owner-meta");if(meta)meta.insertAdjacentHTML("beforebegin",c.healthHtml);}}else if(hb){hb.remove();}});}).catch(function(){});}setInterval(tick,15000);})();</script>';
return layout('Owner', $body, $base, $nav, ['foot' => resourceScript() . $poll]);
}
