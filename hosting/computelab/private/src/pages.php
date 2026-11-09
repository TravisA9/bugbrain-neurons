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

function describeWorker(App $app, array $worker, ?array $lease): array
{
    $now = strtotime($app->now());
    $seen = !empty($worker['last_seen']) ? strtotime((string) $worker['last_seen']) : 0;
    $age = $seen ? ($now - $seen) : null;
    $online = $age !== null && $age <= 180;
    $paused = (int) $worker['paused'] === 1;
    $progress = null;
    if ($lease && isset($lease['progress']) && $lease['progress'] !== null && $lease['progress'] !== '') {
        $progress = (int) $lease['progress'];
    }
    $ago = $seen ? agoText($now - $seen) : '';
    if (!$online && !$lease) {
        $line = $seen ? ('Offline — last seen ' . $ago) : 'Offline — this computer has not checked in yet';
    } elseif ($lease) {
        $line = 'Running a ' . projectNiceName((string) $lease['project_id'], (string) ($lease['title'] ?? '')) . ' job';
        if ($progress !== null) {
            $line .= ' (' . $progress . '%)';
        }
        if ($paused) {
            $line .= ', then this computer will pause';
        }
    } elseif ($paused) {
        $line = 'Paused';
    } else {
        $line = 'Waiting for work';
    }
    return ['line' => $line, 'online' => $online, 'paused' => $paused, 'ago' => $ago, 'progress' => $progress];
}

function navLinks(string $base, array $nav): string
{
    $current = (string) ($nav['current'] ?? '');
    $items = [
        ['home', 'Home', $base === '' ? '/' : $base . '/'],
        ['explore', 'Explore', $base . '/explore'],
        ['join', 'Join', $base . '/join'],
        ['me', 'My computer', $base . '/me'],
    ];
    if (!empty($nav['owner'])) {
        $items[] = ['owner', 'Owner', $base . '/owner'];
    }
    $html = '';
    foreach ($items as $item) {
        $on = $current === $item[0];
        $html .= '<a href="' . h($item[2]) . '"' . ($on ? ' class="is-current" aria-current="page"' : '') . '>' . h($item[1]) . '</a>';
    }
    return $html;
}

function logoutForm(string $base, array $nav): string
{
    if (empty($nav['owner']) && empty($nav['participant'])) {
        return '';
    }
    $csrf = !empty($nav['owner']) ? (string) ($nav['ownerCsrf'] ?? '') : (string) ($nav['participantCsrf'] ?? '');
    return '<form method="post" action="' . h($base) . '/logout" class="logout"><input type="hidden" name="csrf" value="' . h($csrf) . '"><button type="submit">Log out</button></form>';
}

function layout(string $title, string $body, string $base, array $nav = []): string
{
    $links = navLinks($base, $nav);
    $logout = logoutForm($base, $nav);
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'
        . h($title) . '</title><style>
        :root{--paper:#f3ecdf;--card:#fffaf3;--ink:#241c16;--muted:#5c5348;--line:#e4d5c3;--moss:#1d6b4a;--clay:#a33b24;--sand:#efe4d4}
        *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.45 Segoe UI,system-ui,sans-serif}
        .top{background:#fffaf3;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:2}
        .top-inner{width:min(920px,calc(100% - 28px));margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:12px 0}
        .brand{font:700 18px/1 Georgia,Palatino,serif;color:var(--ink);text-decoration:none;margin-right:auto}
        .nav-toggle{position:absolute;opacity:0;pointer-events:none}
        .nav-burger{display:none;border:1px solid var(--line);border-radius:999px;padding:6px 12px;background:#fff}
        nav{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}
        nav a{color:var(--moss);text-decoration:none;font-weight:650}
        nav a.is-current{color:var(--ink);border-bottom:2px solid var(--ink)}
        nav button,.logout button{background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:6px 12px}
        main{width:min(920px,calc(100% - 28px));margin:0 auto;padding:28px 0 56px}
        h1{font:600 36px/1.12 Georgia,Palatino,serif;margin:0 0 10px}
        h2{font:600 22px/1.2 Georgia,Palatino,serif;margin:0 0 8px}
        section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin:14px 0}
        button,input,select,textarea{font:inherit}button{background:var(--ink);color:#fffaf3;border:0;border-radius:999px;padding:10px 16px;cursor:pointer}
        input,select,textarea{border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:#fff;width:100%;max-width:420px}
        label{display:block;margin:10px 0}.muted{color:var(--muted)}.err{color:var(--clay)}
        a{color:var(--moss)}
        .cta{display:inline-block;background:var(--ink);color:#fffaf3;text-decoration:none;border-radius:999px;padding:12px 18px;margin:8px 8px 0 0;font-weight:650}
        .cta.alt{background:var(--moss)}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .stat{background:var(--sand);border-radius:14px;padding:12px}
        .stat strong{display:block;font:600 32px/1 Georgia,Palatino,serif}
        .status-line{font:600 28px/1.25 Georgia,Palatino,serif;margin:0 0 8px}
        .switch{display:flex;align-items:center;gap:14px;width:100%;max-width:520px;border-radius:999px;padding:16px 18px;font:600 22px/1.2 Georgia,serif;text-align:left}
        .switch.on{background:var(--moss);color:#f4efe6}
        .switch.off{background:var(--clay);color:#fffaf3}
        .knob{width:28px;height:28px;border-radius:50%;background:#fff;margin-left:auto;flex:none}
        .bar{height:10px;background:var(--sand);border-radius:999px;overflow:hidden;margin:8px 0}
        .bar span{display:block;height:100%;background:var(--moss)}
        table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}
        .filters{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
        .filters a{text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 10px;color:var(--ink)}
        .filters a.is-current{background:var(--ink);color:#fffaf3}
        .quiet{font-size:14px}
        @media (max-width:720px){
          h1{font-size:30px}.stats{grid-template-columns:1fr}
          .nav-burger{display:inline-block}
          nav{display:none;width:100%;flex-direction:column;align-items:flex-start;padding-bottom:8px}
          .nav-toggle:checked ~ nav{display:flex}
          table,tbody,tr,td{display:block;width:100%}
          th{display:none}
        }
        </style></head><body><header class="top"><div class="top-inner"><a class="brand" href="' . h($base === '' ? '/' : $base . '/') . '">Compute Lab</a>'
        . '<input class="nav-toggle" id="nav-toggle" type="checkbox"><label class="nav-burger" for="nav-toggle">Menu</label><nav>'
        . $links . $logout . '</nav></div></header><main>' . $body . '</main></body></html>';
}

function exploreBar(string $base, array $nav): string
{
    $home = $base === '' ? '/' : $base . '/';
    return '<style>.cl-nav{background:#f4efe6;color:#241c16;font:16px/1.4 Segoe UI,system-ui,sans-serif}.cl-nav a{color:#1d6b4a;text-decoration:none;margin-right:12px;font-weight:650}.cl-nav a.is-current{color:#241c16;border-bottom:2px solid #241c16}.cl-nav button{background:#241c16;color:#fffaf3;border:0;border-radius:999px;padding:6px 12px;cursor:pointer}.cl-nav-inner{width:min(1100px,calc(100% - 28px));margin:0 auto;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0}</style>'
        . '<div class="cl-nav"><div class="cl-nav-inner"><a href="' . h($home) . '">Compute Lab</a>' . navLinks($base, $nav) . logoutForm($base, $nav) . '</div></div>';
}

function pageHome(App $app, array $nav): string
{
    $base = $app->base();
    $stats = $app->homeStats();
    $ownerLink = empty($nav['owner'])
        ? '<p class="quiet"><a href="' . h($base) . '/owner/login">Owner login</a></p>'
        : '';
    $body = '<h1>Give a spare computer something useful to do</h1>'
        . '<p>Compute Lab shares quiet background work. The main project is SpikeFoundry, small synthetic design trials. BugBrain, the neuron research, is second and runs when SpikeFoundry has nothing waiting.</p>'
        . '<p>Looking around in the browser does not donate this computer. Joining does, and you can turn that computer off whenever you want.</p>'
        . '<p><a class="cta" href="' . h($base) . '/join">Join with your computer</a>'
        . '<a class="cta alt" href="' . h($base) . '/explore">Explore in your browser</a></p>'
        . '<section><h2>Right now</h2><div class="stats">'
        . '<div class="stat"><strong>' . h((string) $stats['online']) . '</strong><span class="muted">Computers online</span></div>'
        . '<div class="stat"><strong>' . h((string) $stats['done']) . '</strong><span class="muted">Jobs done</span></div>'
        . '<div class="stat"><strong>' . h((string) $stats['projects']) . '</strong><span class="muted">Projects</span></div>'
        . '</div><p class="muted">Online means a computer checked in during the last 3 minutes.</p></section>'
        . $ownerLink;
    return layout('Compute Lab', $body, $base, $nav);
}

function pageJoin(App $app, string $error = '', array $nav = []): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $body = '<h1>Join with this computer</h1><p class="muted">This does not share a GitHub token or the owner password. A background program on your computer does the work. This browser tab is not the worker.</p>'
        . $err
        . '<section><form method="post" action="' . h($base) . '/join"><label>Computer name <input name="name" required maxlength="32" autocomplete="off"></label>'
        . '<label><input type="checkbox" name="consent" value="1"> I agree this computer may run the projects I tick. SpikeFoundry comes first. BugBrain runs when SpikeFoundry is idle.</label>'
        . '<label><input type="checkbox" name="project[]" value="spikefoundry" checked> SpikeFoundry synthetic design jobs</label>'
        . '<label><input type="checkbox" name="project[]" value="bugbrain"> BugBrain template tests</label>'
        . '<p class="muted">A new project the owner adds uses the same choice. SpikeFoundry projects stay with computers that allowed SpikeFoundry.</p>'
        . '<label>Most batches I will take <input name="max" type="number" min="1" max="20" value="2"></label>'
        . '<button type="submit">Create a worker token</button></form></section>';
    return layout('Join Compute Lab', $body, $base, $nav);
}

function pageToken(App $app, string $name, string $token, array $nav = []): string
{
    $base = $app->base();
    $body = '<h1>Set up ' . h($name) . '</h1>'
        . '<p>This token is shown once. It is not a GitHub password. The download files contain it so the setup can save it. Do not share those files.</p>'
        . '<section><h2>Token</h2><p><code>' . h($token) . '</code></p></section>'
        . '<section><h2>One step on this computer</h2>'
        . '<p>Download a setup file, then open it. It checks for Node.js, downloads the worker, saves the token in your home folder, and starts the background program.</p>'
        . '<form method="post" action="' . h($base) . '/join/setup"><input type="hidden" name="token" value="' . h($token) . '"><input type="hidden" name="os" value="windows"><button type="submit">Download Windows setup</button></form>'
        . '<form method="post" action="' . h($base) . '/join/setup"><input type="hidden" name="token" value="' . h($token) . '"><input type="hidden" name="os" value="unix"><button type="submit">Download Mac or Linux setup</button></form>'
        . '<p class="muted">Windows: double-click the .cmd file. Mac or Linux: open Terminal and run <code>sh ~/Downloads/computelab-setup.sh</code>.</p>'
        . '<p>If Node.js is missing, the file tells you and links to <a href="https://nodejs.org/">nodejs.org</a>. Git is needed too, from <a href="https://git-scm.com/">git-scm.com</a>.</p>'
        . '<h2>How to stop</h2>'
        . '<p>On My computer, turn the switch Off. The job already running can finish. No new job starts.</p>'
        . '<p>Mac or Linux can also run <code>~/.bugbrain/stop-computelab.sh</code>. Windows can close the Compute Lab task from Task Manager, using the process id in <code>%USERPROFILE%\\.bugbrain\\computelab.pid</code>.</p>'
        . '<p><a class="cta" href="' . h($base) . '/me">My computer</a></p></section>';
    return layout('Worker token', $body, $base, $nav);
}

function pageMe(App $app, array $computers, string $csrf, array $nav): string
{
    $base = $app->base();
    $cards = '';
    foreach ($computers as $worker) {
        $lease = $app->currentLease((string) $worker['id']);
        $state = describeWorker($app, $worker, $lease);
        $totals = $app->contribution((string) $worker['id']);
        $next = $state['paused'] ? '0' : '1';
        $switchClass = $state['paused'] ? 'off' : 'on';
        $switchWord = $state['paused'] ? 'Off' : 'On';
        $switchHint = $state['paused'] ? 'Turn on to accept new work' : 'Turn off to finish the current job, then stop';
        $seen = $state['online']
            ? 'Online · last seen ' . ($state['ago'] !== '' ? $state['ago'] : 'just now')
            : ($state['ago'] !== '' ? 'Last seen ' . $state['ago'] : 'Not seen yet');
        $leaseLine = 'Not running a shared job.';
        $bar = '';
        if ($lease) {
            $leaseLine = h((string) $lease['title']) . ' · lease until ' . h(gmdate('H:i', strtotime((string) $lease['until_at']))) . ' UTC';
            if (!empty($lease['heartbeat_at'])) {
                $leaseLine .= ' · heartbeat ' . h(agoText(strtotime($app->now()) - strtotime((string) $lease['heartbeat_at'])));
            }
            if ($state['progress'] !== null) {
                $bar = '<div class="bar" aria-hidden="true"><span style="width:' . h((string) $state['progress']) . '%"></span></div>';
            }
        }
        $history = $app->history((string) $worker['id']);
        $rows = '';
        foreach ($history as $row) {
            $rows .= '<p>' . h((string) $row['created_at'] . ' · ' . $row['job_id'] . ' · ' . $row['status'] . ' · ' . $row['summary']) . '</p>';
        }
        if ($rows === '') {
            $rows = '<p class="muted">None yet.</p>';
        }
        $time = $totals['seconds'] > 0 ? formatDuration((int) $totals['seconds']) : 'No recorded time yet';
        $found = $app->designsByWorker((string) $worker['id']);
        $cards .= '<section><h2>' . h((string) $worker['name']) . '</h2>'
            . '<p class="status-line" role="status">' . h($state['line']) . '</p>'
            . '<p>' . h($seen) . '</p>'
            . '<p>' . $leaseLine . '</p>' . $bar
            . '<form method="post" action="' . h($base) . '/me/pause"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $worker['id']) . '"><input type="hidden" name="paused" value="' . $next . '">'
            . '<button class="switch ' . $switchClass . '" type="submit" aria-pressed="' . ($state['paused'] ? 'false' : 'true') . '"><span>' . $switchWord . '</span><span class="knob"></span></button>'
            . '<p class="muted">' . h($switchHint) . '</p></form>'
            . '<p>' . h((string) $totals['done']) . ' jobs done · ' . h($time) . ' of compute</p>'
            . '<p>Designs found by your computer: ' . h((string) $found) . '</p>'
            . '<h3>Recent results</h3>' . $rows . '</section>';
    }
    if ($cards === '') {
        $cards = '<section><p>No computer is linked to this browser yet.</p><p><a class="cta" href="' . h($base) . '/join">Join with your computer</a></p></section>';
    }
    $body = '<h1>My computer</h1><p class="muted">This page cannot change project order or see the owner password. On accepts new work. Off finishes the current job, then stops.</p>' . $cards;
    return layout('My computer', $body, $base, $nav);
}

function pageLogin(App $app, string $error = '', array $nav = []): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $body = '<h1>Owner login</h1>' . $err
        . '<section><form method="post" action="' . h($base) . '/owner/login"><label>Name <input name="username" autocomplete="username" required></label>'
        . '<label>Password <input name="password" type="password" autocomplete="current-password" required></label>'
        . '<button type="submit">Log in</button></form></section>';
    return layout('Owner login', $body, $base, $nav);
}

function scoreChart(array $points): string
{
    if (count($points) < 2) {
        return '<p class="muted">The chart appears after two evaluations.</p>';
    }
    $width = 640;
    $height = 160;
    $step = count($points) > 1 ? ($width - 16) / (count($points) - 1) : 0;
    $held = '';
    $train = '';
    foreach ($points as $i => $point) {
        $x = 8 + $i * $step;
        $yHeld = 8 + (1 - max(0, min(1, (float) $point['bestHeld']))) * ($height - 16);
        $yTrain = 8 + (1 - max(0, min(1, (float) $point['bestTrain']))) * ($height - 16);
        $held .= ($i === 0 ? '' : ' ') . round($x, 1) . ',' . round($yHeld, 1);
        $train .= ($i === 0 ? '' : ' ') . round($x, 1) . ',' . round($yTrain, 1);
    }
    return '<svg viewBox="0 0 ' . $width . ' ' . $height . '" role="img" aria-label="Best scores over evaluations" style="width:100%;height:auto;background:#fff;border:1px solid #e4d5c3;border-radius:12px">'
        . '<polyline fill="none" stroke="#1d6b4a" stroke-width="3" points="' . $held . '"></polyline>'
        . '<polyline fill="none" stroke="#a33b24" stroke-width="2" points="' . $train . '"></polyline></svg>'
        . '<p class="muted">Green is the best held-out score. Clay is the best train score.</p>';
}

function taskHealthSection(App $app, string $csrf, string $base): string
{
    $tasks = $app->watchedTasks();
    $banner = '';
    $cards = '';
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
        $cards .= '<section><h2>' . h($task) . ' · ' . h($status) . '</h2>'
            . scoreChart($shown)
            . '<p>' . h((string) $health['designer']['label']) . '</p>'
            . ($policy['paused'] ? '<p>Paused. New claims skip this task.' . ($policy['advanced_to'] !== '' ? ' Next level: ' . h((string) $policy['advanced_to']) : '') . '</p>' : '')
            . '<form method="post" action="' . h($base) . '/owner/task-policy"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="project" value="spikefoundry"><input type="hidden" name="task" value="' . h($task) . '">'
            . '<label>Minimum relative gain <input name="delta" type="number" min="0" max="1" step="0.001" value="' . h((string) $policy['stall_delta']) . '"></label>'
            . '<label>Evaluation window <input name="evals" type="number" min="2" max="100000" value="' . h((string) $policy['stall_evals']) . '"></label>'
            . '<label>Compute hours in that window <input name="hours" type="number" min="0" max="10000" step="0.1" value="' . h((string) $policy['stall_hours']) . '"></label>'
            . '<label>When it stalls <select name="action"><option value="flag"' . ($policy['stall_action'] === 'flag' ? ' selected' : '') . '>Flag it</option><option value="pause"' . ($policy['stall_action'] === 'pause' ? ' selected' : '') . '>Pause the task</option><option value="advance"' . ($policy['stall_action'] === 'advance' ? ' selected' : '') . '>Advance to the next level</option></select></label>'
            . '<button type="submit">Save thresholds</button></form></section>';
    }
    if ($cards === '') {
        $cards = '<p class="muted">Charts appear after the first design upload.</p>';
    }
    $bannerHtml = $banner !== '' ? '<section><h2>Needs attention</h2>' . $banner . '</section>' : '';
    return $bannerHtml . $cards;
}

function designLibrarySection(App $app, string $csrf, string $base): string
{
    $task = 'coincidence';
    $top = [];
    try {
        $top = $app->topDesigns($task, 5);
    } catch (InvalidArgumentException $e) {
        $top = [];
    }
    $list = '';
    foreach ($top as $row) {
        $list .= '<p>' . h((string) $row['genome_hash']) . ' · score ' . h((string) $row['quality']) . ' · <a href="' . h($base . '/owner/designs/genome?hash=' . $row['genome_hash']) . '">Download genome</a></p>';
    }
    if ($list === '') {
        $list = '<p class="muted">No saved designs yet. Finished SpikeFoundry runs upload them.</p>';
    }
    return '<section><h2>Design library</h2><p class="muted">Top coincidence designs. Weights stay frozen. The same genome is stored once.</p>' . $list
        . '<p><a href="' . h($base . '/owner/designs/export?format=jsonl&task=coincidence') . '">Export JSONL</a> · <a href="' . h($base . '/owner/designs/export?format=csv&task=coincidence') . '">Export CSV</a></p>'
        . '<form method="post" action="' . h($base) . '/owner/design-seed"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="template" value="sf-vision"><input type="hidden" name="task" value="coincidence"><input type="hidden" name="count" value="3"><label>Seed <input name="seed" type="number" min="1" max="1000000" value="11"></label><button type="submit">Seed new job from top designs</button></form></section>';
}

function pageOwner(App $app, string $csrf, array $nav = [], string $error = '', string $status = 'all', int $page = 1): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $projects = $app->db->query('SELECT * FROM projects ORDER BY priority DESC, id ASC')->fetchAll();
    $templates = $app->db->query('SELECT * FROM templates ORDER BY id')->fetchAll();
    $workers = $app->db->query('SELECT * FROM workers ORDER BY created_at DESC')->fetchAll();
    $proj = '';
    foreach ($projects as $p) {
        $proj .= '<section><h2>' . h((string) $p['title']) . '</h2><p class="muted">' . h((string) $p['id']) . ' · priority ' . h((string) $p['priority']) . ' · ' . ((int) $p['enabled'] ? 'enabled' : 'off') . ' · ' . h((string) ($p['family'] ?? '')) . '</p><p>' . h((string) $p['summary']) . '</p>'
            . '<form method="post" action="' . h($base) . '/owner/project"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $p['id']) . '">'
            . '<label>Priority <input name="priority" type="number" min="0" max="100" value="' . h((string) $p['priority']) . '"></label>'
            . '<label><input type="checkbox" name="enabled" value="1"' . ((int) $p['enabled'] ? ' checked' : '') . '> Enabled</label>'
            . '<button type="submit">Save project</button></form></section>';
    }
    $runnerOpts = '';
    foreach ($app->allowedRunners() as $runner) {
        $runnerOpts .= '<option value="' . h($runner) . '">' . h($runner) . '</option>';
    }
    $create = '<section><h2>New project</h2><form method="post" action="' . h($base) . '/owner/project-create"><input type="hidden" name="csrf" value="' . h($csrf) . '">'
        . '<label>Name <input name="title" required maxlength="80"></label>'
        . '<label>Description <textarea name="summary" required maxlength="400"></textarea></label>'
        . '<label>Runner <select name="runner">' . $runnerOpts . '</select></label>'
        . '<label>Priority <input name="priority" type="number" min="0" max="100" value="1"></label>'
        . '<label><input type="checkbox" name="enabled" value="1" checked> Enabled</label>'
        . '<button type="submit">Create project</button></form></section>';
    $opts = '';
    foreach ($templates as $t) {
        $opts .= '<option value="' . h((string) $t['id']) . '">' . h((string) $t['title']) . '</option>';
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
            $requeue = '<form method="post" action="' . h($base) . '/owner/requeue"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $job['id']) . '"><button type="submit">Requeue and reset attempts</button></form>';
        }
        $rows .= '<tr><td><strong>' . h((string) $job['title']) . '</strong><br><span class="muted">' . h((string) $job['id']) . '</span></td>'
            . '<td>' . h((string) $job['project_id']) . '</td><td>' . h($label) . '</td><td>' . h((string) $job['attempts']) . '</td>'
            . '<td>' . h((string) ($job['last_error'] ?? '')) . $requeue . '</td></tr>';
    }
    if ($rows === '') {
        $rows = '<tr><td class="muted">No jobs in this list.</td></tr>';
    }
    $pager = '<p class="muted">Page ' . h((string) $listed['page']) . ' of ' . h((string) $listed['pages']) . ' · ' . h((string) $listed['total']) . ' jobs</p>';
    if ($listed['page'] > 1) {
        $pager .= '<a href="' . h($base . '/owner?status=' . rawurlencode($status) . '&page=' . ($listed['page'] - 1)) . '">Previous</a> ';
    }
    if ($listed['page'] < $listed['pages']) {
        $pager .= '<a href="' . h($base . '/owner?status=' . rawurlencode($status) . '&page=' . ($listed['page'] + 1)) . '">Next</a>';
    }
    $people = '';
    foreach ($workers as $w) {
        $lease = $app->currentLease((string) $w['id']);
        $state = describeWorker($app, $w, $lease);
        $done = $app->contribution((string) $w['id']);
        $job = $lease ? (string) $lease['title'] : 'none';
        $revoked = (int) $w['revoked'] === 1;
        $controls = '';
        if (!$revoked) {
            $controls = '<form method="post" action="' . h($base) . '/owner/pause"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $w['id']) . '"><input type="hidden" name="paused" value="' . ($state['paused'] ? '0' : '1') . '"><button type="submit">' . ($state['paused'] ? 'Resume' : 'Pause') . '</button></form>'
                . '<form method="post" action="' . h($base) . '/owner/revoke"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $w['id']) . '"><button type="submit">Revoke</button></form>';
        }
        $people .= '<section><h2>' . h((string) $w['name']) . '</h2><p>' . h($revoked ? 'Token revoked' : $state['line']) . '</p>'
            . '<p class="muted">' . ($state['ago'] !== '' ? 'Last seen ' . h($state['ago']) : 'Not seen yet') . ' · current job ' . h($job) . ' · ' . h((string) $done['done']) . ' jobs done</p>'
            . $controls . '</section>';
    }
    $body = $err . '<h1>Owner</h1><p class="muted">SpikeFoundry is priority 2 and BugBrain is priority 1 unless you change them. A running job stays with that computer while its heartbeat renews the lease. A job that fails three times is held until you requeue it. Within a project, a computer takes the highest-priority queued job that fits its batch limit.</p>'
        . $create . $proj
        . '<section><h2>New job from a template</h2><form method="post" action="' . h($base) . '/owner/job"><input type="hidden" name="csrf" value="' . h($csrf) . '">'
        . '<label>Template <select name="template">' . $opts . '</select></label>'
        . '<label>Title <input name="title" required maxlength="120"></label>'
        . '<label>Priority <input name="priority" type="number" min="0" max="5" step="0.1" value="0.5"></label>'
        . '<label>Seed <input name="seed" type="number" min="1" max="1000000" value="7"></label>'
        . '<button type="submit">Queue job</button></form></section>'
        . '<section><h2>Jobs</h2>' . $filterHtml . '<table><thead><tr><th>Job</th><th>Project</th><th>Status</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>' . $rows . '</tbody></table>' . $pager . '</section>'
        . taskHealthSection($app, $csrf, $base)
        . designLibrarySection($app, $csrf, $base)
        . '<h2>Computers</h2>' . ($people !== '' ? $people : '<p class="muted">None enrolled.</p>');
    return layout('Owner', $body, $base, $nav);
}
