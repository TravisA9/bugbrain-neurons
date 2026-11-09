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
$cmd = 'COORD_CONFIG=' . escapeshellarg($config) . ' php -S 127.0.0.1:' . $port . ' -t ' . escapeshellarg($public) . ' ' . escapeshellarg($public . '/index.php');
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
$logout = http($base . '/logout', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$afterLogout = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($logout['status'], [303, 302], true) && str_contains($afterLogout['body'], 'Owner login') && !str_contains($afterLogout['body'], '>Owner<'), 'log out returns the owner to the login page');

proc_terminate($proc);
echo "http checks done\n";
exit($fail === 0 ? 0 : 1);
