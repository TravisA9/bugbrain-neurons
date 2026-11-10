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
$meRedirect = http($base . '/me', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
check(in_array($meRedirect['status'], [302, 303], true) && preg_match('#Location: /computelab/\#my-computer#', $meRedirect['header']) === 1, 'My computer lives on Home now, and /me sends people there');
$myHome = function () use ($base, &$cookie): string {
    return http($base . '/', 'GET', null, ['Cookie: lab_participant=' . $cookie])['body'];
};
$me = ['body' => $myHome()];
check(str_contains($me['body'], 'id="right-now"') && strpos($me['body'], 'id="right-now"') < strpos($me['body'], 'id="my-computer"') && str_contains($me['body'], 'Not running a shared job') && str_contains($me['body'], 'Waiting for work') && !str_contains($me['body'], 'name="priority"') && !str_contains($me['body'], 'name="evals"') && !str_contains($me['body'], 'name="seconds"'), 'Home shows Right now, then My computer, with no job-length settings for participants');
check(str_contains($me['body'], 'value="allowance" checked') && str_contains($me['body'], 'type="range" name="pct" min="10" max="90" step="10" value="50"') && str_contains($me['body'], '>Full<') && str_contains($me['body'], '>Off<') && str_contains($me['body'], 'data-short-pct>50%<') && str_contains($me['body'], 'aria-label="Full blast, every core"') && str_contains($me['body'], 'aria-label="Allowance, 50 percent at low priority"'), 'a new computer starts in Allowance at 50%, with a short-label three-state switch (full names kept for screen readers) and the slider');
$artOn = preg_match('#<picture class="art-allowance is-on" data-art="allowance">.*?half-power\.webp.*?half-power\.png#s', $me['body']) === 1;
check($artOn && substr_count($me['body'], 'data-art="') === 3 && substr_count($me['body'], 'data-art="off" aria-hidden="true"') === 1 && substr_count($me['body'], 'data-art="full" aria-hidden="true"') === 1 && str_contains($me['body'], 'alt="A drowsy cat curled around a computer chip'), 'Home shows only the illustration for the current setting, with the other two preloaded and hidden from screen readers');
$webp = http($base . '/assets/power/full-blast.webp');
$png = http($base . '/assets/power/off.png');
check($webp['status'] === 200 && str_contains($webp['header'], 'image/webp') && substr($webp['body'], 8, 4) === 'WEBP' && strlen($webp['body']) < 150000 && $png['status'] === 200 && substr($png['body'], 1, 3) === 'PNG' && strlen($png['body']) < 150000 && http($base . '/assets/power/other.png')['status'] !== 200, 'the setting illustrations are served as WebP with a PNG fallback, each under 150 KB');
preg_match('/action="[^"]*\/me\/resources".*?name="csrf" value="([a-f0-9]+)"><input type="hidden" name="id" value="([a-f0-9]+)"/s', $me['body'], $mr);
$meCsrf = [1 => $mr[1] ?? ''];
$meId = [1 => $mr[2] ?? ''];
$jsonHeaders = ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json', 'Cookie: lab_participant=' . $cookie];
$resBare = http($base . '/me/resources', 'POST', http_build_query(['id' => $meId[1], 'mode' => 'off']), $jsonHeaders);
check($resBare['status'] === 403, 'turning a computer off without the security token is refused');
$offSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'off', 'pct' => '50']), $jsonHeaders);
$offPage = $myHome();
check($offSave['status'] === 200 && json_decode($offSave['body'], true) === ['ok' => true, 'mode' => 'off', 'pct' => 50, 'jobs' => 0] && str_contains($offPage, 'value="off" checked') && str_contains($offPage, 'Off — not taking new work') && str_contains($offPage, '<picture class="art-off is-on" data-art="off">'), 'Off stops new work, saves without a reload, and shows the Off illustration');
$offBeat = http($base . '/api/v1/heartbeat', 'POST', json_encode(['codeHash' => '', 'control' => true]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
$offClaim = http($base . '/api/v1/claim', 'POST', json_encode(['codeHash' => trim((string) shell_exec('php -r ' . escapeshellarg('echo hash("sha256", str_replace("\r\n", "\n", file_get_contents(' . var_export(dirname(__DIR__) . '/PROTOCOL.txt', true) . ')));')))]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
check((json_decode($offBeat['body'], true)['resources']['mode'] ?? '') === 'off' && (json_decode($offBeat['body'], true)['paused'] ?? false) === true && json_decode($offClaim['body'], true) === ['job' => null], 'the worker reads Off from its check-in and gets no job');
$pctSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'allowance', 'pct' => '37']), $jsonHeaders);
$badMode = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'turbo']), $jsonHeaders);
check(json_decode($pctSave['body'], true) === ['ok' => true, 'mode' => 'allowance', 'pct' => 40, 'jobs' => 0] && $badMode['status'] === 400 && str_contains($badMode['body'], 'Full blast'), 'the allowance snaps to steps of 10 and unknown modes are refused');
$fullSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'full']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
$fullPage = $myHome();
$fullBeat = json_decode(http($base . '/api/v1/heartbeat', 'POST', json_encode(['control' => true, 'runtime' => ['mode' => 'full', 'pct' => 100, 'slots' => 8, 'cores' => 8, 'duty' => 1, 'priority' => 'normal', 'running' => 0]]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json'])['body'], true);
$fullPage2 = $myHome();
check(in_array($fullSave['status'], [302, 303], true) && str_contains($fullSave['header'], '#my-computer') && str_contains($fullPage, 'value="full" checked') && ($fullBeat['resources'] ?? []) === ['mode' => 'full', 'allowancePct' => 40, 'maxJobs' => 0] && str_contains($fullPage2, 'Now: Full blast · 8 of 8 cores · normal priority') && str_contains($fullPage2, 'Waiting for work'), 'Full blast works as a plain form too, and the page shows what the worker applied');
check(str_contains($fullPage2, 'data-jobs-row data-cores="8" data-known="1"') && str_contains($fullPage2, '<output data-jobs-value aria-live="polite">Auto</output>') && str_contains($fullPage2, 'name="jobs" value="auto"') && str_contains($fullPage2, 'runs up to 8 of 8 cores'), 'Home shows Experiments at once next to the resources, Auto by default, up to every core on Full blast');
$jobsSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'allowance', 'pct' => '50', 'jobs' => '2']), $jsonHeaders);
$jobsBeat = json_decode(http($base . '/api/v1/heartbeat', 'POST', json_encode(['control' => true, 'runtime' => ['mode' => 'allowance', 'pct' => 50, 'slots' => 2, 'cores' => 8, 'duty' => 1, 'priority' => 'low', 'running' => 0, 'maxJobs' => 2]]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json'])['body'], true);
$jobsPage = $myHome();
check(json_decode($jobsSave['body'], true) === ['ok' => true, 'mode' => 'allowance', 'pct' => 50, 'jobs' => 2] && ($jobsBeat['resources']['maxJobs'] ?? null) === 2 && str_contains($jobsPage, '<output data-jobs-value aria-live="polite">2</output>') && str_contains($jobsPage, 'runs 2 of 8 cores') && str_contains($jobsPage, 'Now: Allowance · 50% · 2 of 8 cores'), 'choosing 2 at once saves, reaches the worker on its check-in, and the page shows it applied');
$capSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'allowance', 'pct' => '30', 'jobs' => '6']), $jsonHeaders);
$capPage = $myHome();
$autoSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'full', 'jobs' => 'auto']), $jsonHeaders);
check(str_contains($capPage, 'runs 3, the allowance limit of 8 cores') && (json_decode($autoSave['body'], true)['jobs'] ?? null) === 0, 'the allowance caps a larger number, and Auto goes back to 0');
$cssBody = http($base . '/assets/computelab.css')['body'];
check(str_contains($cssBody, '.resources.has-art{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);') && str_contains($cssBody, 'object-fit:contain;object-position:center') && strpos($fullPage2, 'data-jobs-row') < strpos($fullPage2, '<div class="res-art">'), 'Resources is two thirds controls and one third picture, with the picture centred and never cropped');
check(str_contains($cssBody, '.resources.has-art .res-main{display:grid;grid-template-columns:310px minmax(0,1fr);grid-template-areas:"head head" "tri jobs" "range hint" "range eff"') && str_contains($cssBody, '.resources.has-art .jobs-row{grid-area:jobs;width:100%') && str_contains($cssBody, 'width:300px;max-width:calc(100% - 10px);height:50px'), 'the controls fill the left two thirds in two columns while the toggle stays a compact pill');
$status = http($base . '/status.json', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
$sj = json_decode($status['body'], true);
$anon = json_decode(http($base . '/status.json')['body'], true);
check($status['status'] === 200 && isset($sj['online'], $sj['running'], $sj['queued'], $sj['done'], $sj['tasks']) && ($sj['mine'][0]['mode'] ?? '') === 'full' && isset($sj['mine'][0]['health']) && ($anon['mine'] ?? null) === [], 'status.json feeds the Right now box and only lists your own computers');
$css = http($base . '/assets/computelab.css');
check($css['status'] === 200 && str_contains($css['header'], 'text/css') && str_contains($css['body'], '--mint:#69e2b1') && str_contains($css['body'], '.tri') && str_contains($me['body'], '/computelab/assets/computelab.css?v='), 'every page loads the shared SpikeFoundry stylesheet');
check(str_contains($css['body'], '.jobgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))') && str_contains($css['body'], '@media (max-width:560px){.jobgrid{grid-template-columns:1fr}}') && str_contains($me['body'], 'class="tasks jobgrid" data-jobs'), 'What it is doing lays out job cards in columns, one column on phones');
check(str_contains($css['body'], 'box-sizing:content-box;width:300px;max-width:calc(100% - 10px);height:50px;padding:4px;'), 'the three-way switch is a compact 310x60 pill like the example, not a full-width bar');

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
preg_match('/action="[^"]*\/owner\/resources".*?name="csrf" value="([a-f0-9]+)"><input type="hidden" name="id" value="([a-f0-9]+)"/s', $ownerLive['body'], $pauseFields);
check(str_contains($ownerLive['body'], '<details class="advanced"><summary>Advanced') && strpos($ownerLive['body'], 'name="seconds"') > strpos($ownerLive['body'], '<details class="advanced"><summary>Advanced'), 'the owner job-length settings sit under Advanced');
$ownerPauseBare = http($base . '/owner/resources', 'POST', http_build_query(['id' => $pauseFields[2] ?? '', 'mode' => 'off']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($ownerPauseBare['status'] === 403, 'owner resource changes without the security token are refused');
$ownerPause = http($base . '/owner/resources', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'mode' => 'off']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$ownerPaused = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($ownerPause['status'], [303, 302], true) && str_contains($ownerPaused['body'], 'value="off" checked') && str_contains($ownerPaused['body'], 'home-pc'), 'the owner can turn a computer off');
$ownerResume = http($base . '/owner/resources', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'mode' => 'allowance', 'pct' => '50']), ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($ownerResume['status'] === 200 && json_decode($ownerResume['body'], true) === ['ok' => true, 'mode' => 'allowance', 'pct' => 50, 'jobs' => 0], 'the owner can turn a computer back on');
$disc = http($base . '/discoveries', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
check($disc['status'] === 200 && str_contains($disc['body'], '<html lang="en" class="fit">') && str_contains($disc['body'], 'class="list-scroll"') && str_contains($disc['body'], 'id="viewer"') && str_contains($disc['body'], 'badge-mine') && str_contains($disc['body'], 'class="disc mine"'), 'Discoveries is a split view and marks your own computer\'s designs');
$dd = preg_match('#<script type="application/json" id="disc-data">(.*?)</script>#s', $disc['body'], $dm) === 1 ? json_decode($dm[1], true) : [];
$gh = (string) ($dd['items'][0]['hash'] ?? '');
$gMine = http($base . '/discoveries/genome?hash=' . $gh, 'GET', null, ['Cookie: lab_participant=' . $cookie]);
$gAnon = http($base . '/discoveries/genome?hash=' . $gh);
$gOwner = http($base . '/discoveries/genome?hash=' . $gh, 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($gh !== '' && $gMine['status'] === 200 && $gAnon['status'] === 404 && $gOwner['status'] === 200 && !isset($dd['items'][0]['worker']), 'a private genome opens for the computer that found it and the owner, not for strangers');
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
    'setup' => [$join['body'], 'Home'],
    'me' => [http($base . '/', 'GET', null, ['Cookie: lab_participant=' . $cookie])['body'], 'Home'],
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
$pages['join-as-owner'] = [http($base . '/join', 'GET', null, $ownerCookie)['body'], 'Home'];
$pages['join-as-participant'] = [http($base . '/join', 'GET', null, ['Cookie: lab_participant=' . $cookie])['body'], 'Home'];
$joinOk = true;
foreach ($pages as $name => $page) {
    $hasJoin = str_contains(site_header($page[0]), '>Join</a>');
    if ($hasJoin === in_array($name, $signedIn, true)) {
        $joinOk = false;
        echo "join tab wrong on $name\n";
    }
}
check($joinOk, 'the Join tab shows only to signed-out visitors');
check(header_current(site_header($pages['join-as-owner'][0])) === 'Home' && str_contains($pages['join-as-owner'][0], 'name="consent"'), 'a signed-in visitor can still open the join page by URL');
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
check(str_contains($ownerView['body'], 'data-health') && str_contains($ownerView['body'], 'New setup command'), 'each computer in the owner console has a health line and a new setup command');
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
$meNow = ['body' => $myHome()];
check(str_contains($meNow['body'], 'data-health') && str_contains($meNow['body'], 'New setup command'), 'the participant sees a health line and can get a new setup command');
preg_match('/\/me\/setup-command".*?name="csrf" value="([a-f0-9]+)"/s', $meNow['body'], $mc);
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

// Setup on a computer that is already added: keep the working entry, retire the unused new one; a revoked token means a fresh add.
require_once dirname(__DIR__) . '/private/src/setup.php';
$runTokenStep = function (string $newToken, ?string $oldToken) use ($base): array {
    $home = sys_get_temp_dir() . '/cl-home-' . bin2hex(random_bytes(4));
    mkdir($home . '/.bugbrain', 0700, true);
    if ($oldToken !== null) {
        file_put_contents($home . '/.bugbrain/coordinator-token', $oldToken . "\n");
    }
    $script = setup_script('unix', $newToken, $base, 'https://example.invalid/repo.git', 'main');
    $cut = strpos($script, 'say "Compute Lab setup"');
    file_put_contents($home . '/step.sh', substr($script, 0, $cut === false ? strlen($script) : $cut));
    $out = (string) shell_exec('HOME=' . escapeshellarg($home) . ' sh ' . escapeshellarg($home . '/step.sh') . ' 2>&1; echo "exit=$?"');
    $saved = trim((string) @file_get_contents($home . '/.bugbrain/coordinator-token'));
    $prev = glob($home . '/.bugbrain/coordinator-token.previous-*') ?: [];
    $prevToken = $prev ? trim((string) file_get_contents($prev[0])) : '';
    $left = glob($home . '/.bugbrain/.chk-*') ?: [];
    return ['out' => $out, 'saved' => $saved, 'prev' => $prevToken, 'left' => count($left)];
};
$person = $app->enroll('dup-person', ['spikefoundry'], 2, true);
$oldPc = $app->enroll('dup-old', ['spikefoundry'], 2, true);
$newPc = $app->enroll('dup-new', ['spikefoundry'], 2, true, $person['participantId']);
$newCode = $app->makeSetupCode($newPc['workerId'], $newPc['token'])['code'];
$kept = $runTokenStep($newPc['token'], $oldPc['token']);
$oldRow = $app->db->query('SELECT participant_id, revoked FROM workers WHERE id = ' . $app->db->quote($oldPc['workerId']))->fetch();
check(str_contains($kept['out'], 'This computer is already added as dup-old') && str_contains($kept['out'], 'The new entry dup-new was not needed') && str_contains($kept['out'], 'exit=0')
    && $kept['saved'] === $oldPc['token'] && $kept['prev'] === '' && $kept['left'] === 0
    && $app->workerByToken($oldPc['token']) !== null && $app->workerByToken($newPc['token']) === null && $app->tokenForSetupCode($newCode) === null
    && (string) $oldRow['participant_id'] === $person['participantId'], 'setup on an already-added computer keeps its entry and token, retires the unused new entry and its setup code, and links the kept entry to the person who ran it');
$busyOld = $app->enroll('dup-old2', ['spikefoundry'], 2, true);
$busyNew = $app->enroll('dup-busy', ['spikefoundry'], 2, true);
$app->db->prepare('INSERT INTO leases (job_id, worker_id, until_at, heartbeat_at) VALUES (?, ?, ?, ?)')->execute(['dup-job', $busyNew['workerId'], gmdate('c', time() + 60), gmdate('c')]);
$busy = $app->keepExistingEntry($app->workerByToken($busyOld['token']), $busyNew['token']);
$app->db->exec("DELETE FROM leases WHERE job_id = 'dup-job'");
check($busy['retired'] === null && $app->workerByToken($busyNew['token']) !== null, 'a new entry that already did work is never retired');
$goneOld = $app->enroll('dup-gone', ['spikefoundry'], 2, true);
$app->revoke($goneOld['workerId']);
$fresh = $app->enroll('dup-fresh', ['spikefoundry'], 2, true);
$re = $runTokenStep($fresh['token'], $goneOld['token']);
check(str_contains($re['out'], 'no longer works') && str_contains($re['out'], 'exit=0') && !str_contains($re['out'], 'already added')
    && $re['saved'] === $fresh['token'] && $re['prev'] === $goneOld['token'] && $app->workerByToken($fresh['token']) !== null, 'when the token on the computer was revoked, setup adds it fresh and keeps the old token as .previous-*');
$first = $runTokenStep($fresh['token'], null);
check($first['saved'] === $fresh['token'] && !str_contains($first['out'], 'already added') && str_contains($first['out'], 'exit=0'), 'a computer with no token is added as usual');
$apiGone = http($base . '/api/v1/setup/existing', 'POST', json_encode(['newToken' => $fresh['token']]), ['Authorization: Bearer ' . $goneOld['token'], 'Content-Type: application/json']);
check($apiGone['status'] === 401 && $app->workerByToken($fresh['token']) !== null, 'a revoked token cannot retire anything');
$winSetup = setup_script('windows', $fresh['token'], $base, 'https://example.invalid/repo.git', 'main');
preg_match('/-EncodedCommand ([A-Za-z0-9+\/=]+)/', $winSetup, $enc);
$winPs = str_replace("\0", '', base64_decode($enc[1] ?? ''));
check(str_contains($winPs, '/api/v1/setup/existing') && str_contains($winPs, 'This computer is already added as') && str_contains($winPs, '.previous-') && str_contains($winPs, '-ne 401') && str_contains($winSetup, 'setup-kept-entry')
    && strpos($winSetup, 'This computer is already added as %KEPT%') > strpos($winSetup, 'verify-start.js'), 'the Windows setup checks an existing token first and says "already added" only after the verified check-in');
check(str_contains(http($base . '/join')['body'], 'already added is safe'), 'the Add a computer page says running setup again is safe');

$ico = http($base . '/favicon.ico');
$svg = http($base . '/favicon.svg');
$touch = http($base . '/apple-touch-icon.png');
$i512 = http($base . '/icon-512.png');
check($ico['status'] === 200 && str_contains($ico['header'], 'image/x-icon') && substr($ico['body'], 0, 4) === "\0\0\1\0" && $svg['status'] === 200 && str_contains($svg['header'], 'image/svg+xml') && str_contains($svg['body'], '<svg') && $touch['status'] === 200 && substr($touch['body'], 1, 3) === 'PNG' && $i512['status'] === 200, 'the favicon, touch icon and app icons are served with the right types');
$man = http($base . '/manifest.webmanifest');
$manJson = json_decode($man['body'], true);
$homeHtml = http($base . '/')['body'];
check($man['status'] === 200 && is_array($manJson) && ($manJson['name'] ?? '') === 'Compute Lab' && count($manJson['icons'] ?? []) === 3 && str_contains($homeHtml, 'rel="icon"') && str_contains($homeHtml, '/computelab/favicon.svg') && str_contains($homeHtml, 'rel="manifest"') && str_contains(http($base . '/explore')['body'], 'rel="apple-touch-icon"'), 'every page links the favicon, touch icon and manifest');

// t48u: revoked computers leave the main Owner list and can be removed; active ones cannot.
$login2 = http($base . '/owner/login', 'POST', http_build_query(['username' => 'labowner', 'password' => 'correct-horse']), ['Content-Type: application/x-www-form-urlencoded']);
if (preg_match('/Set-Cookie: lab_owner=([^;]+)/', $login2['header'], $oc2)) {
    $oc = $oc2;
}
$oh = ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')];
$ownerNow = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')])['body'];
preg_match('/name="csrf" value="([a-f0-9]+)"/', $ownerNow, $oCsrf);
preg_match_all('/action="[^"]*\/owner\/resources".*?name="id" value="([a-f0-9]+)"/s', $ownerNow, $activeIds);
$victim = end($activeIds[1]);
$keep = $activeIds[1][0];
http($base . '/owner/revoke', 'POST', http_build_query(['csrf' => $oCsrf[1] ?? '', 'id' => $victim]), $oh);
$afterRevoke = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')])['body'];
check(count($activeIds[1]) >= 2 && !str_contains($afterRevoke, '>REVOKED<') && str_contains($afterRevoke, '<details class="revoked-list">') && str_contains($afterRevoke, 'name="id" value="' . $victim . '"><button class="button small stop" type="submit">Remove</button>') && str_contains($afterRevoke, "return confirm('Remove "), 'a revoked computer leaves the main Owner list and gets a Remove button with a confirm step');
$badRemove = http($base . '/owner/remove-computer', 'POST', http_build_query(['csrf' => $oCsrf[1] ?? '', 'id' => $keep]), $oh);
$afterBad = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')])['body'];
check(preg_match('/owner\/resources".*?name="id" value="' . $keep . '"/s', $afterBad) === 1, 'an active computer cannot be removed');
http($base . '/owner/remove-computer', 'POST', http_build_query(['csrf' => $oCsrf[1] ?? '', 'id' => $victim]), $oh);
$afterRemove = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')])['body'];
check(!str_contains($afterRemove, 'value="' . $victim . '"') && str_contains($afterRemove, 'discoveries and credit stay.'), 'a removed computer is gone from the Owner console, with a note that its credit stays');
$noCsrfRemove = http($base . '/owner/remove-computer', 'POST', http_build_query(['id' => $victim]), $oh);
check($noCsrfRemove['status'] === 403, 'removing without the security token is refused');

proc_terminate($proc);
echo "http checks done\n";
exit($fail === 0 ? 0 : 1);
