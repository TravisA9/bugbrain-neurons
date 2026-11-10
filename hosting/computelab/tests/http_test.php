<?php
declare(strict_types=1);
/* HTTP checks against the PHP built-in server and one worker poll. */
$root = dirname(__DIR__, 3);
$public = dirname(__DIR__) . '/public';
$db = sys_get_temp_dir() . '/coord-http-' . bin2hex(random_bytes(3)) . '.sqlite';
$config = sys_get_temp_dir() . '/coord-config-' . bin2hex(random_bytes(3)) . '.php';
file_put_contents($config, '<?php return ' . var_export([
    'driver' => 'sqlite',
    'sqlite' => ['path' => $db],
    'base_path' => '/computelab',
    'lease_seconds' => 120,
    'result_bytes' => 32768,
    'login_per_minute' => 8,
    'api_per_minute' => 120,
    'engine_js' => $root . '/spikefoundry/engine.js',
    'lab_html' => $root . '/spikefoundry/lab.html',
    'protocol' => dirname(__DIR__) . '/PROTOCOL.txt',
], true) . ';');
require dirname(__DIR__) . '/private/src/App.php';
$cfg = require $config;
$app = new App(new PDO('sqlite:' . $db), $cfg);
$app->migrate();
$app->createOwner('labowner', 'correct-horse');
$app->createJob('sf-vision', 'Synthetic vision', 0.5, 11);

$port = 8091;
$cmd = 'exec env COORD_CONFIG=' . escapeshellarg($config) . ' php -S 127.0.0.1:' . $port . ' -t ' . escapeshellarg($public) . ' ' . escapeshellarg($public . '/index.php');
$proc = proc_open($cmd . ' > /tmp/coord-php-server.log 2>&1', [['pipe', 'r'], ['file', '/tmp/coord-php-out.txt', 'w'], ['file', '/tmp/coord-php-err.txt', 'w']], $pipes, $public);
$fail = 0;
function check(bool $ok, string $what): void
{
    global $fail;
    if (!$ok) { fwrite(STDERR, "FAIL $what\n"); $fail++; } else echo "ok   $what\n";
}
usleep(300000);
$base = 'http://127.0.0.1:' . $port . '/computelab';
function http(string $url, string $method = 'GET', ?string $body = null, array $headers = []): array
{
    $header = implode("\r\n", $headers);
    $ctx = stream_context_create(['http' => [
        'method' => $method,
        'header' => $header,
        'content' => $body ?? '',
        'ignore_errors' => true,
        'follow_location' => 0,
    ]]);
    $text = (string) file_get_contents($url, false, $ctx);
    $rawHeaders = $http_response_header ?? [];
    $status = 0;
    foreach ($rawHeaders as $line) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $line, $m)) $status = (int) $m[1];
    }
    return ['status' => $status, 'header' => implode("\n", $rawHeaders), 'body' => $text];
}
$home = http($base . '/');
check($home['status'] === 200 && str_contains($home['body'], 'Join with your computer') && str_contains($home['body'], 'Explore in your browser') && str_contains($home['body'], 'aria-current="page"') && str_contains($home['body'], '>Home<') && !str_contains($home['body'], 'Run 1 batch'), 'home explains Compute Lab and highlights Home');
$explore = http($base . '/explore');
check($explore['status'] === 200 && str_contains($explore['body'], 'Run 1 batch') && !str_contains($explore['body'], 'Create a worker token'), 'explore serves the lab and does not enroll anyone');
check(str_contains($explore['body'], 'aria-current="page"') && str_contains($explore['body'], '>Explore<'), 'explore keeps a way back to the rest of the site');
check(str_contains($explore['body'], '/computelab/assets/engine.js'), 'the lab loads the engine from this site path');
$engine = http($base . '/assets/engine.js');
check($engine['status'] === 200 && str_contains($engine['body'], 'SpikeFoundry'), 'the engine script is served');

$join = http($base . '/join', 'POST', http_build_query([
    'name' => 'home-pc', 'consent' => '1', 'max' => '2', 'project' => ['spikefoundry'],
]), ['Content-Type: application/x-www-form-urlencoded']);
check($join['status'] === 200 && preg_match('/<code>([a-f0-9]{48})<\/code>/', $join['body'], $m) === 1, 'join shows a worker token once');
$token = $m[1] ?? '';
$setup = http($base . '/join/setup', 'POST', http_build_query(['token' => $token, 'os' => 'unix']), ['Content-Type: application/x-www-form-urlencoded']);
check($setup['status'] === 200 && stripos($setup['header'], 'no-store') !== false && str_contains($setup['header'], 'computelab-setup.sh') && str_contains($setup['body'], $token) && str_contains($setup['body'], 'nodejs.org') && !str_contains($setup['body'], 'set -x'), 'the Mac/Linux download is not stored and contains the token');
$setupWin = http($base . '/join/setup', 'POST', http_build_query(['token' => $token, 'os' => 'windows']), ['Content-Type: application/x-www-form-urlencoded']);
check($setupWin['status'] === 200 && str_contains($setupWin['header'], 'computelab-setup.cmd') && str_contains($setupWin['body'], '@echo off') && !str_contains($setupWin['body'], 'echo ' . $token), 'the Windows download does not echo the token');
$leaky = 'abcdef1234567890abcdef1234567890abcdef1234567890';
$setupGet = http($base . '/join/setup?token=' . $leaky);
check($setupGet['status'] === 405 && !str_contains($setupGet['body'], $leaky), 'a setup link in the address bar is refused and does not repeat the token');
$cookie = '';
if (preg_match('/Set-Cookie: lab_participant=([^;]+)/', $join['header'], $c)) $cookie = $c[1];
$me = http($base . '/me', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
check(str_contains($me['body'], 'Not running a shared job') && str_contains($me['body'], 'cannot change project order') && str_contains($me['body'], 'Waiting for work') && str_contains($me['body'], 'class="switch on"'), 'participant page shows an On switch and cannot change project order');
preg_match('/name="csrf" value="([a-f0-9]+)"/', $me['body'], $meCsrf);
preg_match('/name="id" value="([a-f0-9]+)"/', $me['body'], $meId);
$pauseBare = http($base . '/me/pause', 'POST', http_build_query(['id' => $meId[1] ?? '', 'paused' => '1']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
check($pauseBare['status'] === 403, 'turning a computer off without the security token is refused');
$pause = http($base . '/me/pause', 'POST', http_build_query(['csrf' => $meCsrf[1] ?? '', 'id' => $meId[1] ?? '', 'paused' => '1']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
$pausedPage = http($base . '/me', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
check(in_array($pause['status'], [303, 302], true) && str_contains($pausedPage['body'], 'Paused') && str_contains($pausedPage['body'], 'class="switch off"'), 'the Off switch pauses new work');
$resume = http($base . '/me/pause', 'POST', http_build_query(['csrf' => $meCsrf[1] ?? '', 'id' => $meId[1] ?? '', 'paused' => '0']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
$resumedPage = http($base . '/me', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
check(in_array($resume['status'], [303, 302], true) && str_contains($resumedPage['body'], 'Waiting for work'), 'the On switch accepts new work again');

$login = http($base . '/owner/login', 'POST', http_build_query(['username' => 'labowner', 'password' => 'correct-horse']), ['Content-Type: application/x-www-form-urlencoded']);
preg_match('/Set-Cookie: lab_owner=([^;]+)/', $login['header'], $oc);
$owner = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(str_contains($owner['body'], 'SpikeFoundry') && str_contains($owner['body'], 'priority 2') && preg_match('/name="csrf" value="([a-f0-9]+)"/', $owner['body'], $csrf), 'owner page shows SpikeFoundry ahead of the form');
$noCsrf = http($base . '/owner/job', 'POST', http_build_query(['template' => 'sf-vision', 'title' => 'nope', 'priority' => '1', 'seed' => '3']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($noCsrf['status'] === 403, 'owner actions without the security token are refused');
$with = http($base . '/owner/job', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'template' => 'sf-vision', 'title' => 'Another synthetic check', 'priority' => '0.4', 'seed' => '9']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($with['status'], [303, 302], true), 'owner can queue a template job with the security token');

$partJob = http($base . '/owner/job', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'template' => 'sf-vision', 'title' => 'no', 'priority' => '1', 'seed' => '4']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
check($partJob['status'] === 403, 'a participant cookie cannot queue a job');
$projBare = http($base . '/owner/project-create', 'POST', http_build_query(['title' => 'Evening vision', 'summary' => 'A small extra project.', 'runner' => 'spikefoundry/run.js', 'priority' => '4', 'enabled' => '1']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($projBare['status'] === 403, 'creating a project without the security token is refused');
$projPart = http($base . '/owner/project-create', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'title' => 'Stolen', 'summary' => 'Nope.', 'runner' => 'spikefoundry/run.js', 'priority' => '4', 'enabled' => '1']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
check($projPart['status'] === 403, 'a participant cookie cannot create a project');
$proj = http($base . '/owner/project-create', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'title' => 'Evening vision', 'summary' => 'A small extra project.', 'runner' => 'spikefoundry/run.js', 'priority' => '4', 'enabled' => '1']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$ownerAfter = http($base . '/owner?status=all&page=1', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($proj['status'], [303, 302], true) && str_contains($ownerAfter['body'], 'Evening vision') && str_contains($ownerAfter['body'], 'Queued'), 'the owner can create a project and see the job list');

$hash = trim((string) shell_exec('php -r ' . escapeshellarg('echo hash("sha256", file_get_contents(' . var_export(dirname(__DIR__) . '/PROTOCOL.txt', true) . '));')));
$genomeJson = '{"decay":0.4,"topology":"parallel"}';
$designBody = json_encode(['codeHash' => $hash, 'records' => [[
    'taskId' => 'coincidence', 'taskVersion' => 'base-1', 'genomeJson' => $genomeJson,
    'genomeHash' => hash('sha256', $genomeJson), 'metrics' => ['quality' => 0.2],
    'neurons' => 2, 'synapses' => 2, 'spikes' => 1, 'evalMs' => 1, 'seed' => 3, 'jobId' => 'join-job',
]]]);
$designPost = http($base . '/api/v1/designs', 'POST', gzencode($designBody), ['Authorization: Bearer ' . $token, 'Content-Type: application/json', 'Content-Encoding: gzip']);
$designJson = json_decode($designPost['body'], true);
check($designPost['status'] === 200 && ($designJson['stored'] ?? 0) === 1, 'a gzip design batch is accepted for the worker token');
$claim = http($base . '/api/v1/claim', 'POST', json_encode(['codeHash' => $hash]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
$claimBody = json_decode($claim['body'], true);
check($claim['status'] === 200 && ($claimBody['job']['project'] ?? '') === 'spikefoundry', 'the worker API assigns a SpikeFoundry job to the enrolled token');
$revoked = http($base . '/api/v1/claim', 'POST', json_encode(['codeHash' => 'nope']), ['Authorization: Bearer not-a-token', 'Content-Type: application/json']);
check($revoked['status'] === 401, 'a bad token is rejected');

$tokenFile = sys_get_temp_dir() . '/coord-token-' . bin2hex(random_bytes(2));
file_put_contents($tokenFile, $token . "\n");
$worker = shell_exec('node ' . escapeshellarg($root . '/run/coord.js') . ' --once --url ' . escapeshellarg($base) . ' --token-file ' . escapeshellarg($tokenFile) . ' 2>&1');
check(is_string($worker) && str_contains($worker, '"status":"done"'), 'the native worker polls, runs the template, and submits a result');
$ownerLive = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
preg_match('/action="[^"]*\\/owner\\/pause"[^>]*>.*?<input type="hidden" name="csrf" value="([a-f0-9]+)"><input type="hidden" name="id" value="([a-f0-9]+)"/s', $ownerLive['body'], $pauseFields);
if ($pauseFields === []) {
    preg_match('/\\/owner\\/pause".*?name="csrf" value="([a-f0-9]+)".*?name="id" value="([a-f0-9]+)"/s', $ownerLive['body'], $pauseFields);
}
$ownerPauseBare = http($base . '/owner/pause', 'POST', http_build_query(['id' => $pauseFields[2] ?? '', 'paused' => '1']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($ownerPauseBare['status'] === 403, 'owner pause without the security token is refused');
$ownerPause = http($base . '/owner/pause', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'paused' => '1']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$ownerPaused = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($ownerPause['status'], [303, 302], true) && str_contains($ownerPaused['body'], 'Resume') && str_contains($ownerPaused['body'], 'home-pc'), 'the owner can pause a computer');
$ownerResume = http($base . '/owner/pause', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'paused' => '0']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($ownerResume['status'], [303, 302], true), 'the owner can resume a computer');
// Every page shares one header: only the current-tab mark and the account item may differ.
function site_header(string $html): string
{
    return preg_match('#<div class="cl-top" role="banner">.*?</nav></div></div>#s', $html, $m) === 1 ? $m[0] : '';
}
function header_shape(string $header): string
{
    $x = str_replace([' class="is-current" aria-current="page"'], '', $header);
    $x = preg_replace('#<a class="cl-account"[^>]*>Log in</a>|<form method="post" action="[^"]*/logout" class="cl-account">.*?</form>#s', '[account]', $x);
    $x = preg_replace('#<a href="[^"]*/join">Join</a>#', '', (string) $x);
    return (string) $x;
}
function header_current(string $header): string
{
    return preg_match('#aria-current="page">([^<]+)<#', $header, $m) === 1 ? $m[1] : '';
}
$ownerCookie = ['Cookie: lab_owner=' . ($oc[1] ?? '')];
$pages = [
    'home' => [http($base . '/')['body'], 'Home'],
    'explore' => [http($base . '/explore')['body'], 'Explore'],
    'discoveries' => [http($base . '/discoveries')['body'], 'Discoveries'],
    'join' => [http($base . '/join')['body'], 'Join'],
    'setup' => [$join['body'], 'My computer'],
    'me' => [http($base . '/me', 'GET', null, ['Cookie: lab_participant=' . $cookie])['body'], 'My computer'],
    'owner-login' => [http($base . '/owner/login')['body'], 'Owner'],
    'owner-out' => [http($base . '/owner')['body'], 'Owner'],
    'owner' => [http($base . '/owner', 'GET', null, $ownerCookie)['body'], 'Owner'],
    'home-as-owner' => [http($base . '/', 'GET', null, $ownerCookie)['body'], 'Home'],
    'explore-as-owner' => [http($base . '/explore', 'GET', null, $ownerCookie)['body'], 'Explore'],
];
$shapes = [];
$currentOk = true;
foreach ($pages as $name => $page) {
    $head = site_header($page[0]);
    $shapes[$name] = $head === '' ? 'missing' : header_shape($head);
    if (header_current($head) !== $page[1] || substr_count($head, 'aria-current="page"') !== 1) {
        $currentOk = false;
        echo "header current mismatch on $name: " . header_current($head) . "\n";
    }
}
check(count(array_unique($shapes)) === 1 && reset($shapes) !== 'missing', 'every page has the same header apart from the current tab and account item');
check($currentOk, 'each page marks exactly its own tab as current');
check(str_contains(site_header($pages['home'][0]), '>Log in<') && str_contains(site_header($pages['owner'][0]), 'Log out') && str_contains(site_header($pages['me'][0]), 'Log out'), 'the account item reads Log in when signed out and Log out when signed in');
$signedIn = ['setup', 'me', 'owner', 'home-as-owner', 'explore-as-owner', 'join-as-owner', 'join-as-participant'];
$pages['join-as-owner'] = [http($base . '/join', 'GET', null, $ownerCookie)['body'], 'My computer'];
$pages['join-as-participant'] = [http($base . '/join', 'GET', null, ['Cookie: lab_participant=' . $cookie])['body'], 'My computer'];
$joinOk = true;
foreach ($pages as $name => $page) {
    $hasJoin = str_contains(site_header($page[0]), '>Join</a>');
    if ($hasJoin === in_array($name, $signedIn, true)) {
        $joinOk = false;
        echo "join tab wrong on $name\n";
    }
}
check($joinOk, 'the Join tab shows only to signed-out visitors');
check(header_current(site_header($pages['join-as-owner'][0])) === 'My computer' && str_contains($pages['join-as-owner'][0], 'name="consent"'), 'a signed-in visitor can still open the join page by URL');
check(str_contains($pages['me'][0], '>Add a computer</a>') && str_contains($pages['owner'][0], '>Add a computer</a>'), 'My computer and the owner console offer Add a computer');
check(substr_count($pages['explore'][0], 'class="cl-top"') === 1 && !str_contains($pages['explore'][0], 'class="top"'), 'explore uses the shared header only once');

$logout = http($base . '/logout', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$afterLogout = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($logout['status'], [303, 302], true) && str_contains($afterLogout['body'], 'Owner login') && str_contains($afterLogout['body'], '>Log in<') && !str_contains($afterLogout['body'], 'Log out'), 'log out returns the owner to the login page');

/* ---- Setup command, setup scripts, remote diagnostics ---- */
check(preg_match('#\(curl -fsSL (http\S+/s/([A-Za-z0-9]{16,40})) \|\| wget -qO- \S+\) \| sh#', $join['body'], $sm) === 1 && str_contains($join['body'], 'data-copy="setup-cmd"') && str_contains($join['body'], 'sh ~/Downloads/computelab-setup.sh') && !str_contains($join['body'], 'then open it'), 'the token page shows a copy-paste setup command with a copy button');
$code = $sm[2] ?? '';
$viaCode = http($base . '/s/' . $code);
check($viaCode['status'] === 200 && str_contains($viaCode['body'], '#!/bin/sh') && str_contains($viaCode['body'], $token) && stripos($viaCode['header'], 'no-store') !== false, 'the setup command downloads the script for this computer');
$tmpSh = sys_get_temp_dir() . '/cl-setup-' . bin2hex(random_bytes(2)) . '.sh';
file_put_contents($tmpSh, $viaCode['body']);
exec('sh -n ' . escapeshellarg($tmpSh) . ' 2>&1', $o1, $shRc);
exec('bash -n ' . escapeshellarg($tmpSh) . ' 2>&1', $o2, $bashRc);
unlink($tmpSh);
check($shRc === 0 && $bashRc === 0, 'the Mac/Linux setup parses with both sh and bash');
$u = $viaCode['body'];
check(str_contains($u, 'run/preflight.js') && str_contains($u, 'run/worker.sh') && str_contains($u, 'Environment="PATH=') && str_contains($u, '.nvm/versions/node') && str_contains($u, '/api/v1/diagnostics') && !str_contains($u, 'exec node run/supervisor.js') && !str_contains($u, 'echo "$(cat'), 'the Mac/Linux setup finds Node for the service, runs the launcher loop, checks itself, and reports failures');
check(substr_count($u, 'git -C "$repo" fetch') === 1 && str_contains($u, '</dev/null'), 'the setup keeps standard input away from commands, so curl | sh works');
check(preg_match("#FromBase64String\('([A-Za-z0-9+/=]+)'\)#", $setupWin['body'], $wm) === 1 && str_contains((string) base64_decode($wm[1]), "run\\worker.ps1") && str_contains($setupWin['body'], 'preflight.js'), 'the Windows task runs the launcher loop and the setup checks itself');
$expired = http($base . '/s/AAAAAAAAAAAAAAAAAAAA');
check($expired['status'] === 200 && str_contains($expired['body'], 'expired') && str_contains($expired['body'], 'exit 1') && !str_contains($expired['body'], $token), 'an unknown setup code prints a plain message instead of a script');

$diagBody = json_encode(['kind' => 'setup', 'ok' => false, 'summary' => 'Setup failed: Node.js v12.22.9 is too old (18 or newer is needed)', 'hint' => 'Install Node.js 20 LTS', 'node' => 'v12.22.9', 'distro' => 'Ubuntu 22.04.4 LTS', 'log' => ['token=' . $token, 'Authorization: Bearer ' . $token, 'line two']]);
$diag = http($base . '/api/v1/diagnostics', 'POST', $diagBody, ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
check($diag['status'] === 200 && str_contains($diag['body'], '"ok":true'), 'a worker can send a diagnostics report');
$badKind = http($base . '/api/v1/diagnostics', 'POST', json_encode(['kind' => 'nonsense']), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
$noTok = http($base . '/api/v1/diagnostics', 'POST', $diagBody, ['Content-Type: application/json']);
check($badKind['status'] === 400 && $noTok['status'] === 401, 'diagnostics need a known kind and a worker token');
$big = http($base . '/api/v1/diagnostics', 'POST', json_encode(['kind' => 'error', 'log' => array_fill(0, 400, str_repeat('x', 150))]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
$sizeRow = $app->db->query("SELECT MAX(LENGTH(body_json)) FROM worker_diagnostics")->fetchColumn();
check($big['status'] === 200 && (int) $sizeRow <= 16384, 'diagnostics are capped in size');
$relog = http($base . '/owner/login', 'POST', http_build_query(['username' => 'labowner', 'password' => 'correct-horse']), ['Content-Type: application/x-www-form-urlencoded']);
preg_match('/Set-Cookie: lab_owner=([^;]+)/', $relog['header'], $rc);
$ownerView = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($rc[1] ?? '')]);
check(str_contains($ownerView['body'], 'Diagnostics ·') && str_contains($ownerView['body'], 'Setup failed: Node.js v12.22.9 is too old') && !str_contains($ownerView['body'], $token) && !str_contains((string) $app->db->query("SELECT GROUP_CONCAT(body_json) FROM worker_diagnostics")->fetchColumn(), $token) && str_contains((string) $app->db->query("SELECT GROUP_CONCAT(body_json) FROM worker_diagnostics")->fetchColumn(), 'Ubuntu 22.04.4 LTS'), 'the owner sees the latest report without the token');
check(str_contains($ownerView['body'], 'class="health') && str_contains($ownerView['body'], 'New setup command'), 'each computer in the owner console has a health line and a new setup command');
$wrongHash = http($base . '/api/v1/heartbeat', 'POST', json_encode(['codeHash' => str_repeat('f', 64)]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
$wrow = $app->db->query("SELECT * FROM workers WHERE name = 'home-pc'")->fetch();
check($wrongHash['status'] === 409 && $app->healthOf($wrow)['line'] === 'Protocol mismatch, needs update', 'a protocol mismatch shows in the health line');
$goodBeat = http($base . '/api/v1/heartbeat', 'POST', json_encode(['codeHash' => $hash]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
$wrow = $app->db->query("SELECT * FROM workers WHERE name = 'home-pc'")->fetch();
check($goodBeat['status'] === 200 && $app->healthOf($wrow)['line'] !== 'Protocol mismatch, needs update', 'a good heartbeat clears the protocol mismatch');
$ago = gmdate('c', time() - 46 * 60);
$ghost = ['id' => 'ghost', 'revoked' => 0, 'last_seen' => $ago, 'created_at' => $ago, 'runtime_json' => null, 'last_reject' => null];
check(str_contains($app->healthOf($ghost)['line'], 'never checked in') && str_contains($app->healthOf($ghost)['hint'], 'Node.js 18'), 'a computer that registered but never ran says so, with a fix');
$seenOld = ['id' => 'ghost', 'revoked' => 0, 'last_seen' => gmdate('c', time() - 30 * 60), 'created_at' => gmdate('c', time() - 90 * 60), 'runtime_json' => null, 'last_reject' => null];
check(str_contains($app->healthOf($seenOld)['line'], 'no heartbeat for 30 min'), 'a computer that stopped says how long ago');
$meNow = http($base . '/me', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
check(str_contains($meNow['body'], 'class="health') && str_contains($meNow['body'], 'New setup command'), 'the participant sees a health line and can get a new setup command');
preg_match('/name="csrf" value="([a-f0-9]+)"/', $meNow['body'], $mc);
$wid = (string) $wrow['id'];
$rot = http($base . '/me/setup-command', 'POST', http_build_query(['csrf' => $mc[1] ?? '', 'id' => $wid]), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
preg_match('/<code>([a-f0-9]{48})<\/code>/', $rot['body'], $nt);
$oldBeat = http($base . '/api/v1/heartbeat', 'POST', json_encode(['codeHash' => $hash]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
$newBeat = http($base . '/api/v1/heartbeat', 'POST', json_encode(['codeHash' => $hash]), ['Authorization: Bearer ' . ($nt[1] ?? 'x'), 'Content-Type: application/json']);
$oldCode = http($base . '/s/' . $code);
check($rot['status'] === 200 && str_contains($rot['body'], '| sh') && $oldBeat['status'] === 401 && $newBeat['status'] === 200 && str_contains($oldCode['body'], 'expired'), 'a new setup command replaces the token and the old setup command');
$rotBare = http($base . '/me/setup-command', 'POST', http_build_query(['id' => $wid]), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
check($rotBare['status'] === 403, 'a new setup command needs the security token');
$sealed = (string) $app->db->query('SELECT sealed FROM setup_codes LIMIT 1')->fetchColumn();
check($sealed !== '' && !str_contains($sealed, $nt[1] ?? 'zz') && !str_contains(base64_decode($sealed), $nt[1] ?? 'zz'), 'setup codes do not store the token in readable form');

proc_terminate($proc);
echo "http checks done\n";
exit($fail === 0 ? 0 : 1);
