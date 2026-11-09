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
$explore = http($base . '/explore');
check($explore['status'] === 200 && str_contains($explore['body'], 'Run 1 batch') && !str_contains($explore['body'], 'Create a worker token'), 'explore serves the lab and does not enroll anyone');
check(str_contains($explore['body'], '/computelab/assets/engine.js'), 'the lab loads the engine from this site path');
$engine = http($base . '/assets/engine.js');
check($engine['status'] === 200 && str_contains($engine['body'], 'SpikeFoundry'), 'the engine script is served');

$join = http($base . '/join', 'POST', http_build_query([
    'name' => 'home-pc', 'consent' => '1', 'max' => '2', 'project' => ['spikefoundry'],
]), ['Content-Type: application/x-www-form-urlencoded']);
check($join['status'] === 200 && preg_match('/<code>([a-f0-9]{48})<\/code>/', $join['body'], $m) === 1, 'join shows a worker token once');
$token = $m[1] ?? '';
$cookie = '';
if (preg_match('/Set-Cookie: lab_participant=([^;]+)/', $join['header'], $c)) $cookie = $c[1];
$me = http($base . '/me', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
check(str_contains($me['body'], 'Not running a shared job') && str_contains($me['body'], 'cannot change project order'), 'participant page is separate from the owner console');

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

proc_terminate($proc);
echo "http checks done\n";
exit($fail === 0 ? 0 : 1);
