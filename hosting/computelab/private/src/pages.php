<?php
declare(strict_types=1);

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

function layout(string $title, string $body, string $base): string
{
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'
        . h($title) . '</title><style>
        :root{--paper:#f4efe6;--card:#fffaf3;--ink:#241c16;--muted:#5c5348;--line:#e3d7c6;--moss:#1d6b4a;--clay:#a33b24}
        *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.45 Segoe UI,system-ui,sans-serif}
        main{width:min(820px,calc(100% - 28px));margin:0 auto;padding:24px 0 48px}
        h1{font:600 32px/1.1 Georgia,Palatino,serif;margin:0 0 8px}
        section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:12px 0}
        button,input,select{font:inherit}button{background:var(--ink);color:#fffaf3;border:0;border-radius:999px;padding:10px 14px;cursor:pointer}
        input,select{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:#fff}
        label{display:block;margin:8px 0}.muted{color:var(--muted)}.err{color:var(--clay)}
        a{color:var(--moss)}
        </style></head><body><main>' . $body . '<p class="muted"><a href="' . h($base) . '/explore">Explore lab</a></p></main></body></html>';
}

function pageJoin(App $app, string $error = ''): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $body = '<h1>Join with this computer</h1><p class="muted">This does not share a GitHub token or the owner password. The background worker polls out. A browser tab is not the worker.</p>'
        . $err
        . '<section><form method="post" action="' . h($base) . '/join"><label>Computer name <input name="name" required maxlength="32" autocomplete="off"></label>'
        . '<label><input type="checkbox" name="consent" value="1"> I agree this computer may run the projects I tick. SpikeFoundry synthetic jobs come before BugBrain when both are allowed.</label>'
        . '<label><input type="checkbox" name="project[]" value="spikefoundry" checked> SpikeFoundry synthetic design jobs</label>'
        . '<label><input type="checkbox" name="project[]" value="bugbrain"> BugBrain template tests</label>'
        . '<label>Most batches I will take <input name="max" type="number" min="1" max="20" value="2"></label>'
        . '<button type="submit">Create a worker token</button></form></section>';
    return layout('Join Compute Lab', $body, $base);
}

function pageToken(App $app, string $name, string $token): string
{
    $base = $app->base();
    $body = '<h1>Token for ' . h($name) . '</h1><p>Copy this once. It is not shown again. Put it in the worker token file on this computer. It is not a GitHub password.</p>'
        . '<section><p><code>' . h($token) . '</code></p></section>'
        . '<p><a href="' . h($base) . '/me">Your computer</a></p>';
    return layout('Worker token', $body, $base);
}

function pageMe(App $app, array $worker, ?array $lease, array $history): string
{
    $base = $app->base();
    $csrf = '';
    $now = $lease
        ? h((string) $lease['project_id']) . ' · ' . h((string) $lease['title']) . ' until ' . h((string) $lease['until_at'])
        : 'Not running a shared job.';
    $paused = (int) $worker['paused'] === 1;
    $rows = '';
    foreach ($history as $row) {
        $rows .= '<p>' . h((string) $row['created_at'] . ' · ' . $row['job_id'] . ' · ' . $row['status'] . ' · ' . $row['summary']) . '</p>';
    }
    if ($rows === '') {
        $rows = '<p class="muted">None yet.</p>';
    }
    $body = '<h1>Your computer</h1><p class="muted">This page cannot change project order or see the owner password.</p>'
        . '<section><h2>Right now</h2><p>' . $now . '</p><p>' . ($paused ? 'Paused. No new job will start.' : 'Taking new work when a job is waiting.') . '</p>'
        . '<form method="post" action="' . h($base) . '/me/pause"><button type="submit">' . ($paused ? 'Allow new work' : 'Pause new work') . '</button></form></section>'
        . '<section><h2>Recent results</h2>' . $rows . '</section>';
    return layout('Your computer', $body, $base);
}

function pageLogin(App $app, string $error = ''): string
{
    $base = $app->base();
    $err = $error !== '' ? '<p class="err">' . h($error) . '</p>' : '';
    $body = '<h1>Owner login</h1>' . $err
        . '<section><form method="post" action="' . h($base) . '/owner/login"><label>Name <input name="username" autocomplete="username" required></label>'
        . '<label>Password <input name="password" type="password" autocomplete="current-password" required></label>'
        . '<button type="submit">Log in</button></form></section>';
    return layout('Owner login', $body, $base);
}

function pageOwner(App $app, string $csrf): string
{
    $base = $app->base();
    $projects = $app->db->query('SELECT * FROM projects ORDER BY priority DESC')->fetchAll();
    $templates = $app->db->query('SELECT * FROM templates ORDER BY id')->fetchAll();
    $workers = $app->db->query('SELECT id, name, paused, revoked, last_seen FROM workers ORDER BY created_at DESC')->fetchAll();
    $proj = '';
    foreach ($projects as $p) {
        $proj .= '<section><h2>' . h((string) $p['title']) . '</h2><p class="muted">' . h((string) $p['id']) . ' · priority ' . h((string) $p['priority']) . ' · ' . ((int) $p['enabled'] ? 'enabled' : 'off') . '</p><p>' . h((string) $p['summary']) . '</p>'
            . '<form method="post" action="' . h($base) . '/owner/project"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $p['id']) . '">'
            . '<label>Priority <input name="priority" type="number" min="0" max="100" value="' . h((string) $p['priority']) . '"></label>'
            . '<label><input type="checkbox" name="enabled" value="1"' . ((int) $p['enabled'] ? ' checked' : '') . '> Enabled</label>'
            . '<button type="submit">Save project</button></form></section>';
    }
    $opts = '';
    foreach ($templates as $t) {
        $opts .= '<option value="' . h((string) $t['id']) . '">' . h((string) $t['title']) . '</option>';
    }
    $people = '';
    foreach ($workers as $w) {
        $people .= '<p>' . h((string) $w['name']) . ((int) $w['revoked'] ? ' · revoked' : '') . ((int) $w['paused'] ? ' · paused' : '') . '</p>'
            . '<form method="post" action="' . h($base) . '/owner/revoke"><input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="id" value="' . h((string) $w['id']) . '"><button type="submit">Revoke token</button></form>';
    }
    $body = '<h1>Owner</h1><p class="muted">SpikeFoundry is priority 2 and BugBrain is priority 1 unless you change them. A leased job is not taken away.</p>'
        . $proj
        . '<section><h2>New job from a template</h2><form method="post" action="' . h($base) . '/owner/job"><input type="hidden" name="csrf" value="' . h($csrf) . '">'
        . '<label>Template <select name="template">' . $opts . '</select></label>'
        . '<label>Title <input name="title" required maxlength="120"></label>'
        . '<label>Priority <input name="priority" type="number" min="0" max="5" step="0.1" value="0.5"></label>'
        . '<label>Seed <input name="seed" type="number" min="1" max="1000000" value="7"></label>'
        . '<button type="submit">Queue job</button></form></section>'
        . '<section><h2>Computers</h2>' . ($people !== '' ? $people : '<p class="muted">None enrolled.</p>') . '</section>';
    return layout('Owner', $body, $base);
}
