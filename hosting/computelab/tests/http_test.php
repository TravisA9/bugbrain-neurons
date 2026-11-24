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
    'inverse_shared_training' => true,
    'inverse_composition' => true,
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
function save4(string $body): array
{
    return array_intersect_key(json_decode($body, true) ?: [], array_flip(['ok', 'mode', 'pct', 'jobs']));
}
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
check($explore['status'] === 200 && str_contains($explore['body'], 'id="bug-arena"') && !str_contains($explore['body'], 'Create a worker token'), 'explore serves the arena and does not enroll anyone');
check(str_contains($explore['body'], 'aria-current="page"') && str_contains($explore['body'], '>Explore<'), 'explore keeps a way back to the rest of the site');
check(str_contains($explore['body'], '/computelab/assets/bugbrain.js'), 'the arena loads the BugBrain engine from this site path');
check(json_decode(http($base . '/explore/bugbrain-champion.json')['body'], true)['id'] === 'v3h', 'the arena starts with the default BugBrain before a verified edit');

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
check($offSave['status'] === 200 && save4($offSave['body']) === ['ok' => true, 'mode' => 'off', 'pct' => 50, 'jobs' => 0] && str_contains($offPage, 'value="off" checked') && str_contains($offPage, 'Off — not taking new work') && str_contains($offPage, '<picture class="art-off is-on" data-art="off">'), 'Off stops new work, saves without a reload, and shows the Off illustration');
$offBeat = http($base . '/api/v1/heartbeat', 'POST', json_encode(['codeHash' => '', 'control' => true]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
$offClaim = http($base . '/api/v1/claim', 'POST', json_encode(['codeHash' => trim((string) shell_exec('php -r ' . escapeshellarg('echo hash("sha256", str_replace("\r\n", "\n", file_get_contents(' . var_export(dirname(__DIR__) . '/PROTOCOL.txt', true) . ')));')))]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json']);
check((json_decode($offBeat['body'], true)['resources']['mode'] ?? '') === 'off' && (json_decode($offBeat['body'], true)['paused'] ?? false) === true && json_decode($offClaim['body'], true) === ['job' => null], 'the worker reads Off from its check-in and gets no job');
$pctSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'allowance', 'pct' => '37']), $jsonHeaders);
$badMode = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'turbo']), $jsonHeaders);
check(save4($pctSave['body']) === ['ok' => true, 'mode' => 'allowance', 'pct' => 40, 'jobs' => 0] && $badMode['status'] === 400 && str_contains($badMode['body'], 'Full blast'), 'the allowance snaps to steps of 10 and unknown modes are refused');
$fullSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'full']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
$fullPage = $myHome();
$fullBeat = json_decode(http($base . '/api/v1/heartbeat', 'POST', json_encode(['control' => true, 'runtime' => ['mode' => 'full', 'pct' => 100, 'slots' => 8, 'cores' => 8, 'duty' => 1, 'priority' => 'normal', 'running' => 0]]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json'])['body'], true);
$fullPage2 = $myHome();
check(in_array($fullSave['status'], [302, 303], true) && str_contains($fullSave['header'], '#my-computer') && str_contains($fullPage, 'value="full" checked') && ($fullBeat['resources'] ?? []) === ['mode' => 'full', 'allowancePct' => 40, 'maxJobs' => 0] && str_contains($fullPage2, 'Now: Full blast · 8 of 8 cores · normal priority') && str_contains($fullPage2, 'Waiting for work'), 'Full blast works as a plain form too, and the page shows what the worker applied');
check(str_contains($fullPage2, 'data-jobs-row data-cores="8" data-known="1"') && str_contains($fullPage2, '<output data-jobs-value aria-live="polite">Auto</output>') && str_contains($fullPage2, 'name="jobs" value="auto"') && str_contains($fullPage2, 'runs up to 8 of 8 cores'), 'Home shows Experiments at once next to the resources, Auto by default, up to every core on Full blast');
$jobsSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'allowance', 'pct' => '50', 'jobs' => '2']), $jsonHeaders);
$jobsBeat = json_decode(http($base . '/api/v1/heartbeat', 'POST', json_encode(['control' => true, 'runtime' => ['mode' => 'allowance', 'pct' => 50, 'slots' => 2, 'cores' => 8, 'duty' => 1, 'priority' => 'low', 'running' => 0, 'maxJobs' => 2]]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json'])['body'], true);
$jobsPage = $myHome();
check(save4($jobsSave['body']) === ['ok' => true, 'mode' => 'allowance', 'pct' => 50, 'jobs' => 2] && ($jobsBeat['resources']['maxJobs'] ?? null) === 2 && str_contains($jobsPage, '<output data-jobs-value aria-live="polite">2</output>') && str_contains($jobsPage, 'runs 2 of 8 cores') && str_contains($jobsPage, 'Now: Allowance · 50% · 2 of 8 cores'), 'choosing 2 at once saves, reaches the worker on its check-in, and the page shows it applied');
$capSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'allowance', 'pct' => '30', 'jobs' => '6']), $jsonHeaders);
$capPage = $myHome();
$autoSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $meId[1], 'mode' => 'full', 'jobs' => 'auto']), $jsonHeaders);
check(str_contains($capPage, 'runs 3, the allowance limit of 8 cores') && (json_decode($autoSave['body'], true)['jobs'] ?? null) === 0, 'the allowance caps a larger number, and Auto goes back to 0');
$cssBody = http($base . '/assets/computelab.css')['body'];
check(str_contains($cssBody, '.resources.has-art{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);') && str_contains($cssBody, 'object-fit:contain;object-position:center') && strpos($fullPage2, 'data-jobs-row') < strpos($fullPage2, '<div class="res-art">'), 'Resources is two thirds controls and one third picture, with the picture centred and never cropped');
check(str_contains($cssBody, '.resources.has-art .res-main{display:grid;grid-template-columns:minmax(0,1fr) 310px;grid-template-areas:"head head" "run run" "jobs tri" "hint range" "eff range"') && str_contains($cssBody, '.resources.has-art .jobs-row{grid-area:jobs;width:100%') && str_contains($cssBody, 'width:300px;max-width:calc(100% - 10px);height:50px'), 'the toggle and slider sit in the middle next to the picture; Experiments, the hint and the Now line on the left; the toggle stays a compact pill');
check(str_contains($cssBody, '.tri-led{flex:0 0 auto;width:12px;height:12px;') && str_contains($cssBody, '@keyframes tri-pulse{0%,100%{box-shadow:0 0 12px 1px currentColor}50%{box-shadow:0 0 20px 4px currentColor'), 'the toggle LEDs are 12 px with a matching glow and pulse');
/* t53u: the toggle shows what the computer is doing. A stale heartbeat shows Stopped (Off, with its own note), the
 * saved setting is kept; turning it on shows Starting… until a heartbeat; a chosen Off on a running computer differs. */
$wid = $meId[1];
$beatWith = function (array $rt) use ($base, $token) { return json_decode(http($base . '/api/v1/heartbeat', 'POST', json_encode(['control' => true, 'runtime' => $rt]), ['Authorization: Bearer ' . $token, 'Content-Type: application/json'])['body'], true); };
$rtFull = ['mode' => 'full', 'pct' => 100, 'slots' => 8, 'cores' => 8, 'duty' => 1, 'priority' => 'normal', 'running' => 0];
$beatWith($rtFull);
$app->db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([gmdate('c', time() - 7200), $wid]);
$stopPage = $myHome();
check(str_contains($stopPage, 'data-saved="full" data-run="stopped"') && str_contains($stopPage, 'value="off" checked') && str_contains($stopPage, '<span class="res-now" data-mode-label>Stopped</span>') && str_contains($stopPage, 'Stopped — not running since <time datetime="') && str_contains($stopPage, '</time>. Turn it on to restart.') && str_contains($stopPage, '<picture class="art-off is-on" data-art="off">'), 'a stale heartbeat shows Stopped: Off toggle, the Off picture, "not running since", and the saved Full blast kept');
check(str_contains($stopPage, 'no watchdog (older setup)') && str_contains($stopPage, 'run the setup command on it again'), 'a worker that never reported a watchdog says so and points to re-running setup');
check((string) $app->db->query("SELECT resource_mode FROM workers WHERE id = '" . $wid . "'")->fetchColumn() === 'full', 'showing Stopped does not change the saved setting');
$sjStop = json_decode(http($base . '/status.json', 'GET', null, ['Cookie: lab_participant=' . $cookie])['body'], true);
$mineStop = array_values(array_filter($sjStop['mine'] ?? [], function ($c) use ($wid) { return $c['id'] === $wid; }))[0] ?? [];
check(($mineStop['run'] ?? '') === 'stopped' && ($mineStop['shown'] ?? '') === 'off' && ($mineStop['saved'] ?? '') === 'full' && str_contains((string) ($mineStop['runNote'] ?? ''), '{since}'), 'status.json carries the run state for the live page');
$startSave = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $wid, 'mode' => 'allowance', 'pct' => '50']), $jsonHeaders);
$sd = json_decode($startSave['body'], true);
$startPage = $myHome();
check(($sd['run'] ?? '') === 'starting' && ($sd['shown'] ?? '') === 'allowance' && str_contains($startPage, 'data-run="starting"') && str_contains($startPage, '<span class="res-now" data-mode-label>Starting…</span>') && str_contains($startPage, 'value="allowance" checked') && str_contains($startPage, 'art-allowance is-on is-starting'), 'turning a stopped computer on shows Starting… with the chosen setting and its picture dimmed');
$beatWith(['mode' => 'allowance', 'pct' => 50, 'slots' => 4, 'cores' => 8, 'duty' => 1, 'priority' => 'low', 'running' => 0, 'watchdog' => 'task-repeat']);
$runPage = $myHome();
check(str_contains($runPage, 'data-run="running"') && str_contains($runPage, '<span class="res-now" data-mode-label>Allowance · 50%</span>') && str_contains($runPage, 'data-run-box role="status"><p class="res-run-note" data-run-note></p><p class="res-run-sub" data-run-sub></p>') && str_contains($runPage, '<div class="res-run" hidden'), 'the next heartbeat confirms it: running, no note');
check((string) $app->db->query("SELECT runtime_json FROM workers WHERE id = '" . $wid . "'")->fetchColumn() !== '' && str_contains((string) $app->db->query("SELECT runtime_json FROM workers WHERE id = '" . $wid . "'")->fetchColumn(), '"watchdog":"task-repeat"'), 'the heartbeat keeps the watchdog the worker reported');
$app->db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([gmdate('c', time() - 7200), $wid]);
$stop2 = $myHome();
check(str_contains($stop2, 'Its watchdog restarts it within about 3 minutes') && !str_contains($stop2, 'no watchdog (older setup)') && str_contains($stop2, 'Saved setting: Allowance · 50%'), 'with a watchdog, Stopped says it comes back by itself once the computer is awake');
http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $wid, 'mode' => 'full']), $jsonHeaders);
$app->db->prepare('UPDATE workers SET restart_requested_at = ? WHERE id = ?')->execute([gmdate('c', time() - 900), $wid]);
$late = $myHome();
check(str_contains($late, 'data-run="stopped"') && str_contains($late, 'still not running 15 min after it was turned on') && str_contains($late, 'run the setup command on it again'), 'Starting… gives up after 10 minutes and says what to check');
$beatWith(['mode' => 'off', 'pct' => 50, 'slots' => 0, 'cores' => 8, 'duty' => 1, 'priority' => 'low', 'running' => 0, 'watchdog' => 'task-repeat']);
http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $wid, 'mode' => 'off']), $jsonHeaders);
$chosenOff = $myHome();
check(str_contains($chosenOff, 'data-saved="off" data-run="running"') && str_contains($chosenOff, '<span class="res-now" data-mode-label>Off</span>') && !str_contains($chosenOff, 'Stopped —') && str_contains($chosenOff, '<div class="res-run" hidden'), 'a chosen Off on a running computer is plain Off, not Stopped');
$js = $stopPage;
check(str_contains($js, 'function applyRun(d)') && str_contains($js, 'rf.__run(c)') && str_contains($js, 'replace("{since}",clock(d.since))') && str_contains($js, 'Starting… waiting for this computer to check in.'), 'the page script follows the run state from status.json and shows local times');
http($base . '/me/resources', 'POST', http_build_query(['csrf' => $meCsrf[1], 'id' => $wid, 'mode' => 'full', 'jobs' => 'auto']), $jsonHeaders);
$beatWith($rtFull);
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
check(str_contains($owner['body'], 'id="active-projects"') && str_contains($owner['body'], 'name="active[]" value="spikefoundry"') && str_contains($owner['body'], 'name="active[]" value="bugbrain"') && str_contains($owner['body'], 'Save active projects'), 'the owner console has a control for which projects are active');
$joinPage = http($base . '/join');
check($joinPage['status'] === 200 && !str_contains($joinPage['body'], 'name="project[]" value="spikefoundry"') && !str_contains($joinPage['body'], 'BugBrain template tests') && str_contains($joinPage['body'], 'how much compute to donate'), 'Join does not offer per-project choices to volunteers');
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
$activeOff = http($base . '/owner/active-projects', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'active' => ['bugbrain']]), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$ownerActive = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($activeOff['status'], [303, 302], true) && str_contains($ownerActive['body'], 'value="bugbrain" checked') && !preg_match('/name="active\[\]" value="spikefoundry" checked/', $ownerActive['body']) && str_contains($ownerActive['body'], 'value="evening-vision"') && !preg_match('/name="active\[\]" value="evening-vision" checked/', $ownerActive['body']), 'the owner can deactivate SpikeFoundry and a new project from the Active projects control');
$activeOn = http($base . '/owner/active-projects', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'active' => ['spikefoundry', 'bugbrain', 'evening-vision']]), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($activeOn['status'], [303, 302], true), 'the owner can turn the projects back on');

/* Phase 1: code channels from the owner console; participants cannot change them. */
$oh = ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')];
preg_match('/action="[^"]*\/owner\/code-channel"><input type="hidden" name="csrf" value="[a-f0-9]+"><input type="hidden" name="id" value="([a-f0-9]+)"><input type="hidden" name="channel" value="canary">/', $ownerActive['body'], $chId);
$toCanary = http($base . '/owner/code-channel', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'id' => $chId[1] ?? '', 'channel' => 'canary']), $oh);
$partCanary = http($base . '/owner/code-channel', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'id' => $chId[1] ?? '', 'channel' => 'stable']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_participant=' . $cookie]);
$noCsrf = http($base . '/owner/code-ref', 'POST', http_build_query(['csrf' => 'bad', 'channel' => 'canary', 'ref' => str_repeat('a', 40)]), $oh);
$setRef = http($base . '/owner/code-ref', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'channel' => 'canary', 'ref' => str_repeat('a', 40)]), $oh);
$promote = http($base . '/owner/code-promote', 'POST', http_build_query(['csrf' => $csrf[1] ?? '']), $oh);
$ownerCode = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(isset($chId[1]) && in_array($toCanary['status'], [303, 302], true) && $partCanary['status'] === 403 && $noCsrf['status'] !== 303
    && in_array($setRef['status'], [303, 302], true) && in_array($promote['status'], [303, 302], true)
    && str_contains($ownerCode['body'], '>Make stable<') && substr_count($ownerCode['body'], 'title="' . str_repeat('a', 40) . '">aaaaaaa</code>') === 2,
    'the owner can make a computer canary, set the canary commit and promote it to stable; participants and bad CSRF cannot');
$resetRef = http($base . '/owner/code-ref', 'POST', http_build_query(['csrf' => $csrf[1] ?? '', 'channel' => 'canary', 'ref' => '']), $oh);
check(in_array($resetRef['status'], [303, 302], true), 'canary can go back to following the branch tip');

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
$ownerRun = json_decode(http($base . '/owner/run.json', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')])['body'], true);
check(str_contains($ownerLive['body'], '<section class="panel owner-computers" id="computers">') && strpos($ownerLive['body'], 'id="computers"') < strpos($ownerLive['body'], '<div class="grid2">') && str_contains($ownerLive['body'], '<form class="resources compact"') && !str_contains($ownerLive['body'], '<div class="res-art">') && !str_contains($ownerLive['body'], 'Off lets the running job finish, then stops.') && !str_contains($ownerLive['body'], 'Healthy') && str_contains($ownerLive['body'], 'data-jobs-now') && str_contains($ownerLive['body'], 'owner/run.json') && ($ownerRun['ok'] ?? false) === true && isset($ownerRun['computers'][0]['run'], $ownerRun['computers'][0]['tone'], $ownerRun['computers'][0]['jobsLine']) && http($base . '/owner/run.json')['status'] === 403, 'Owner computer cards are compact (no picture, no Off/middle/Full explanation, no Healthy badge) and keep their state live');
check(str_contains($ownerLive['body'], '<details class="advanced"><summary>Advanced') && strpos($ownerLive['body'], 'name="seconds"') > strpos($ownerLive['body'], '<details class="advanced"><summary>Advanced'), 'the owner job-length settings sit under Advanced');
$ownerPauseBare = http($base . '/owner/resources', 'POST', http_build_query(['id' => $pauseFields[2] ?? '', 'mode' => 'off']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($ownerPauseBare['status'] === 403, 'owner resource changes without the security token are refused');
$ownerPause = http($base . '/owner/resources', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'mode' => 'off']), ['Content-Type: application/x-www-form-urlencoded', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$ownerPaused = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(in_array($ownerPause['status'], [303, 302], true) && str_contains($ownerPaused['body'], 'value="off" checked') && str_contains($ownerPaused['body'], 'home-pc'), 'the owner can turn a computer off');
$ownerResume = http($base . '/owner/resources', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'mode' => 'allowance', 'pct' => '50']), ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($ownerResume['status'] === 200 && save4($ownerResume['body']) === ['ok' => true, 'mode' => 'allowance', 'pct' => 50, 'jobs' => 0], 'the owner can turn a computer back on');
$ownerTones = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(str_contains($ownerTones['body'], 'computer-name is-allowance') && str_contains($ownerTones['body'], 'data-jobs-now>Idle<') && str_contains($css['body'], '.owner-computers .computer-name.is-full{color:var(--mint)}') && str_contains($css['body'], '.owner-computers .computer-name.is-allowance{color:var(--amber)}') && str_contains($css['body'], '.owner-computers .computer-name.is-dead{color:var(--red)}') && str_contains($css['body'], '.owner-computers .resources.compact .res-main{display:flex;flex-wrap:wrap'), 'a running Allowance computer is named in amber, shows Idle when it has no jobs, and the compact controls sit on one wrapping row');
http($base . '/owner/resources', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'mode' => 'full']), ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$fullOwner = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(str_contains($fullOwner['body'], 'computer-name is-full') && str_contains($fullOwner['body'], 'data-jobs-now>Idle<'), 'a running Full blast computer is named in mint');
http($base . '/owner/resources', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'mode' => 'off']), ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$offOwner = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(str_contains($offOwner['body'], 'computer-name is-off') && str_contains($offOwner['body'], 'data-jobs-now>Idle<') && !str_contains($offOwner['body'], 'computer-name is-dead'), 'an intentionally Off computer that is still checking in is muted, not red');
$app->db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([gmdate('c', time() - 7200), $pauseFields[2] ?? '']);
$deadOwner = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check(str_contains($deadOwner['body'], 'computer-name is-dead') && str_contains($deadOwner['body'], 'Not running: no heartbeat'), 'a stale or stopped computer is named in red and shows the problem, not Healthy');
$app->db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([gmdate('c'), $pauseFields[2] ?? '']);
http($base . '/owner/resources', 'POST', http_build_query(['csrf' => $pauseFields[1] ?? '', 'id' => $pauseFields[2] ?? '', 'mode' => 'allowance', 'pct' => '50']), ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$disc = http($base . '/discoveries', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
check($disc['status'] === 200 && str_contains($disc['body'], '<html lang="en" class="fit">') && str_contains($disc['body'], 'class="list-scroll"') && str_contains($disc['body'], 'id="viewer"') && str_contains($disc['body'], 'badge-mine') && str_contains($disc['body'], 'class="disc mine"'), 'Discoveries is a split view and marks your own computer\'s designs');
$dd = preg_match('#<script type="application/json" id="disc-data">(.*?)</script>#s', $disc['body'], $dm) === 1 ? json_decode($dm[1], true) : [];
$discRefresh = http($base . '/discoveries?refresh=1', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
$refreshed = json_decode($discRefresh['body'], true);
check($discRefresh['status'] === 200 && ($refreshed['data']['items'] ?? null) === ($dd['items'] ?? [])
    && str_contains($refreshed['list'] ?? '', 'class="disc mine"') && str_contains($disc['body'], 'id="disc-refresh"'),
    'Discoveries refresh returns the same participant-aware list and has a visible refresh status');
$gh = (string) ($dd['items'][0]['hash'] ?? '');
check(str_contains($disc['body'], 'root.SnnPlayer=') && str_contains($disc['body'], "prefers-reduced-motion: reduce") && str_contains($disc['body'], "addEventListener('visibilitychange'") && str_contains($disc['body'], 'requestAnimationFrame(loop)') && str_contains($disc['body'], 'This design never fires on this input') && strpos($disc['body'], 'root.SnnPlayer=') < strpos($disc['body'], 'P.mount(box'), 'Discoveries plays the frozen network back in the browser, pauses for reduced motion and hidden tabs, and says when a design is silent');
check(preg_match('#<div class="row3"><time class="disc-when" datetime="\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ">Found [A-Z][a-z]{2} \\d{1,2}, \\d{1,2}:\\d\\d [AP]M C[DS]T</time></div>#', $disc['body']) === 1 && str_contains($disc['body'], "timeZone:'America/Chicago'") && str_contains($disc['body'], "timeZoneName:'short'") && str_contains($disc['body'], 'chip disc-found" title="'), 'each discovery card and the viewer show when it was found, in Central time, with the age as a tooltip');
$knownFound = '2026-11-09T15:03:39+00:00';
$app->db->exec("UPDATE design_records SET created_at = '$knownFound'");
$app->db->exec('DELETE FROM page_cache');
$discDated = http($base . '/discoveries', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
$archDated = http($base . '/discoveries?archive=1', 'GET', null, ['Cookie: lab_participant=' . $cookie]);
$foundRe = '#<time class="disc-when" datetime="2026-11-09T15:03:39Z">Found Nov 9, 9:03 AM CST</time>#';
$renderStamp = gmdate('M j, g:i A');
check(preg_match($foundRe, $discDated['body']) === 1 && preg_match($foundRe, $archDated['body']) === 1
    && str_contains($discDated['body'], '"when":"2026-11-09T15:03:39+00:00"')
    && str_contains($archDated['body'], '"when":"2026-11-09T15:03:39+00:00"')
    && str_contains($discDated['body'], 'chip disc-found" title="')
    && str_contains($archDated['body'], "timeZone:'America/Chicago'")
    && !preg_match('#<time class="disc-when"[^>]*>Found ' . preg_quote($renderStamp, '#') . '#', $discDated['body']),
    'each discovery card, the archive view, and the viewer data use the record\'s first-found time in Central time, not the page render time');
$gMine = http($base . '/discoveries/genome?hash=' . $gh, 'GET', null, ['Cookie: lab_participant=' . $cookie]);
$gAnon = http($base . '/discoveries/genome?hash=' . $gh);
$gOwner = http($base . '/discoveries/genome?hash=' . $gh, 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($gh !== '' && $gMine['status'] === 200 && $gAnon['status'] === 200 && $gOwner['status'] === 200 && str_contains($gAnon['body'], '{') && !isset($dd['items'][0]['worker']), 'a design on the Discoveries list includes its wiring for every visitor');
$hiddenHash = hash('sha256', 'not-on-the-discoveries-list');
$app->db->prepare('INSERT INTO design_genomes (hash, genome_json, version, created_at, is_public) VALUES (?, ?, 2, ?, 0)')->execute([$hiddenHash, '{"v":2,"modules":[]}', gmdate('c')]);
$hAnon = http($base . '/discoveries/genome?hash=' . $hiddenHash);
$hOwner = http($base . '/discoveries/genome?hash=' . $hiddenHash, 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
check($hAnon['status'] === 404 && $hOwner['status'] === 200, 'a private genome that is not on Discoveries stays hidden from strangers and opens for the owner');
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
$returning = $app->enroll('reconnect-existing', ['spikefoundry'], 2, true);
$temporary = $app->enroll('reconnect-temporary', ['spikefoundry'], 2, true);
$returningSession = $app->session('participant', $temporary['workerId']);
$keptReturning = $runTokenStep($temporary['token'], $returning['token']);
$returningHome = http($base . '/', 'GET', null, ['Cookie: lab_participant=' . $returningSession['id']]);
$rebound = $app->sessionById($returningSession['id']);
check($keptReturning['saved'] === $returning['token'] && ($rebound['subject'] ?? '') === $returning['workerId']
    && str_contains($returningHome['body'], '>reconnect-existing<')
    && !str_contains($returningHome['body'], '>reconnect-temporary<'),
    'fresh setup reconnects an unlinked browser to a standalone computer and preserves its token');
check(strtotime($rebound['expires_at'] ?? '') - strtotime($app->now()) >= 29 * 86400,
    'the refreshed participant session lasts 30 days');
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
$tv = $app->enroll('travirtual', ['spikefoundry'], 2, true);
$an = $app->enroll('analinux', ['spikefoundry'], 2, true);
$ownerNow = http($base . '/owner', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')])['body'];
preg_match('/name="csrf" value="([a-f0-9]+)"/', $ownerNow, $oCsrf);
check(str_contains($ownerNow, '>travirtual<') && str_contains($ownerNow, '>analinux<') && substr_count($ownerNow, 'Show on My computer') >= 2 && !str_contains($ownerNow, 'Hide from My computer'), 'the owner console lists both computers with a Show on My computer action');
$flag = http($base . '/owner/owner-home', 'POST', http_build_query(['csrf' => $oCsrf[1] ?? '', 'id' => $tv['workerId'], 'shown' => '1']), $oh);
check(in_array($flag['status'], [302, 303], true), 'the owner can mark one computer for My computer');
$homeOwner = http($base . '/', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')])['body'];
check(str_contains($homeOwner, 'id="my-computer"') && str_contains($homeOwner, '>travirtual<') && str_contains($homeOwner, 'action="') && str_contains($homeOwner, '/me/resources') && !str_contains($homeOwner, '>analinux<') && !str_contains($homeOwner, '>home-pc<') && !str_contains($homeOwner, 'No computer linked yet'), 'the signed-in owner sees only the flagged computer on Home, with the participant resource controls');
$mineJson = json_decode(http($base . '/status.json', 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? ''), 'Accept: application/json'])['body'], true);
$mineIds = array_column($mineJson['mine'] ?? [], 'id');
check($mineIds === [$tv['workerId']], 'status.json mine lists only the owner-flagged computer');
preg_match('/action="[^"]*\/me\/resources".*?name="csrf" value="([a-f0-9]+)"><input type="hidden" name="id" value="' . preg_quote($tv['workerId'], '/') . '"/s', $homeOwner, $homeRes);
$saveMine = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $homeRes[1] ?? '', 'id' => $tv['workerId'], 'mode' => 'full']), ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
$saveHers = http($base . '/me/resources', 'POST', http_build_query(['csrf' => $homeRes[1] ?? '', 'id' => $an['workerId'], 'mode' => 'full']), ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json', 'Cookie: lab_owner=' . ($oc[1] ?? '')]);
check((save4($saveMine['body'])['ok'] ?? false) === true && $saveHers['status'] === 403, 'the owner can use the Home toggle on the flagged computer and not on analinux');
$partHome = http($base . '/', 'GET', null, ['Cookie: lab_participant=' . $cookie])['body'];
check(str_contains($partHome, '>home-pc<') && !str_contains($partHome, '>travirtual<') && !str_contains($partHome, '>analinux<'), 'a participant still sees only the computers linked to their browser');
$noTok = http($base . '/owner/owner-home', 'POST', http_build_query(['id' => $tv['workerId'], 'shown' => '0']), $oh);
check($noTok['status'] === 403, 'changing the My computer flag without the security token is refused');

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

$researchWorker = $app->enroll('sequence-research-pc', ['spikefoundry'], 2, true);
$researchToken = tempnam(sys_get_temp_dir(), 'sequence-token-');
file_put_contents($researchToken, $researchWorker['token']);
$researchJob = http($base . '/owner/job', 'POST', http_build_query([
    'csrf' => $oCsrf[1] ?? '', 'template' => 'sf-sequence-experiment',
    'title' => 'Sequence experiment smoke test', 'priority' => 5, 'seed' => 1729,
]), $oh);
check(in_array($researchJob['status'], [302, 303], true), 'the owner can queue the sequence experiment');
$researchPoll = shell_exec('node ' . escapeshellarg($root . '/run/coord.js') . ' --once --url ' . escapeshellarg($base) . ' --token-file ' . escapeshellarg($researchToken) . ' 2>&1');
$researchUrl = $base . '/owner/sequence-experiment.json?job=sf-sequence-experiment-1729';
$researchReport = http($researchUrl, 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
$researchJson = json_decode($researchReport['body'], true);
check(str_contains($researchPoll ?? '', 'sf-sequence-experiment-1729') && $researchReport['status'] === 200
    && count($researchJson['research']['rounds'] ?? []) === 6 && ($researchJson['research']['composition']['composed'] ?? false),
    'the donor worker runs the study and its report reaches the owner');
check(http($researchUrl)['status'] === 403, 'the study report requires an owner session');

$inverseJob = http($base . '/owner/job', 'POST', http_build_query([
    'csrf' => $oCsrf[1] ?? '', 'template' => 'sf-inverse-experiment',
    'title' => 'Inverse experiment smoke test', 'priority' => 5, 'seed' => 1729,
]), $oh);
$inversePoll = shell_exec('node ' . escapeshellarg($root . '/run/coord.js') . ' --once --url ' . escapeshellarg($base) . ' --token-file ' . escapeshellarg($researchToken) . ' 2>&1');
$inverseUrl = $base . '/owner/inverse-experiment.json?seed=1729';
$inverseReport = http($inverseUrl, 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
$inverseJson = json_decode($inverseReport['body'], true);
check(in_array($inverseJob['status'], [302, 303], true) && str_contains($inversePoll ?? '', 'sf-inverse-experiment-1729')
    && $inverseReport['status'] === 200 && ($inverseJson['research']['checkpoint']['encoding'] ?? '') === 'f32le-gzip',
    'an updated donor trains the inverse designer and sends its model and report to the owner');
check(http($inverseUrl)['status'] === 403, 'the inverse experiment report requires an owner session');

$app->createJob('sf-inverse-experiment', 'Shared inverse smoke test', 5, 1735, ['inverseGallery' => true]);
$sharedPoll = shell_exec('node ' . escapeshellarg($root . '/run/coord.js') . ' --once --url ' . escapeshellarg($base) . ' --token-file ' . escapeshellarg($researchToken) . ' 2>&1');
$championUrl = $base . '/owner/inverse-champion.json';
$championResponse = http($championUrl, 'GET', null, ['Cookie: lab_owner=' . ($oc[1] ?? '')]);
$champion = json_decode($championResponse['body'], true);
check(str_contains($sharedPoll ?? '', 'sf-inverse-experiment-1735') && $championResponse['status'] === 200
    && ($champion['generation'] ?? null) === 1 && count($champion['passes'] ?? []) === 36,
    'a donor trains and publishes a shared checkpoint through HTTP');
check(http($championUrl)['status'] === 403, 'the shared checkpoint requires an owner session');

$app->createJob('sf-inverse-experiment', 'Composition smoke test', 5, 2311,
    ['inverseGallery' => true, 'inverseComposition' => true]);
$compositionPoll = shell_exec('node ' . escapeshellarg($root . '/run/coord.js') . ' --once --url ' . escapeshellarg($base) . ' --token-file ' . escapeshellarg($researchToken) . ' 2>&1');
$composition = $app->inverseExperimentReport(2311)['research'] ?? [];
$graphs = array_filter($app->inverseDiscoveries(), static fn ($item) => isset($item['inverse']['graph']));
check(str_contains($compositionPoll ?? '', 'sf-inverse-experiment-2311')
    && ($composition['version'] ?? '') === 'inverse-composition-1'
    && ($composition['learned']['trials'] ?? 0) === ($composition['baseline']['trials'] ?? -1)
    && $graphs && count(reset($graphs)['inverse']['graph']['neurons']) === 6,
    'a donor publishes a three-hidden-neuron graph and paired timing results');

$app->createJob('sf-inverse-experiment', 'Two-stream smoke test', 5, 2320,
    ['inverseGallery' => true, 'inverseComposition' => true, 'inverseSequence' => true]);
$sequencePoll = shell_exec('node ' . escapeshellarg($root . '/run/coord.js') . ' --once --url ' . escapeshellarg($base) . ' --token-file ' . escapeshellarg($researchToken) . ' 2>&1');
$sequence = $app->inverseExperimentReport(2320)['research'] ?? [];
$sequenceGraphs = array_filter($app->inverseDiscoveries(), static fn ($item) => $item['task'] === 'Two-stream sequence');
check(str_contains($sequencePoll ?? '', 'sf-inverse-experiment-2320') && ($sequence['learned']['trials'] ?? 0) === 12
    && $sequenceGraphs && min(array_column($sequenceGraphs, 'level')) >= 4
    && isset($app->compositionResults()['Two-stream sequence']),
    'a donor publishes two-output timing graphs and the owner sees family results');

/* Explore demos (kept late: these extra requests must not use up the earlier pages' rate-limit window). */
$explore = http($base . '/explore');
$demoIds = ['arena', 'predator', 'shoot', 'shoot-predator', 'brain', 'read', 'name', 'copy', 'patterns'];
$tabsOk = true;
foreach ($demoIds as $demoId) {
    if (!str_contains($explore['body'], 'id="demo-' . $demoId . '"') || !str_contains($explore['body'], 'id="demo-' . $demoId . '-title"')
        || !str_contains($explore['body'], 'href="/computelab/explore#' . $demoId . '"')) {
        $tabsOk = false;
        echo "explore demo missing: $demoId\n";
    }
}
check($tabsOk, 'explore has a titled view for every demo, and the header Explore menu links to each one');
check(!str_contains($explore['body'], 'class="ex-tabs"') && !str_contains($explore['body'], 'data-tab=') && substr_count($explore['body'], 'class="ex-cap"') === count($demoIds)
    && str_contains($explore['body'], "querySelectorAll('.cl-drop-menu a')") && str_contains($explore['body'], 'getElementById("cl-toggle");if(t)t.checked=false'),
    'the header dropdown is the only view switcher: no in-page tabs, one caption per view, the current entry is marked and the mobile menu closes on a hash change');
check(substr_count($explore['body'], 'class="bug-stats" data-role="stats"') === 4 && str_contains($explore['body'], '<div class="bug-stage"><canvas id="bug-arena"')
    && str_contains($explore['body'], '<div class="bug-stage"><canvas id="bug-predator"') && str_contains($explore['body'], '@media(max-width:900px){.bug-stage{grid-template-columns:1fr}'),
    'all four arenas have their stats panel beside the canvas, moving below it on narrow screens');
check(str_contains($explore['body'], '<details class="cl-drop"><summary class="is-current" aria-current="page">Explore</summary>')
    && str_contains(http($base . '/discoveries')['body'], '<details class="cl-drop"><summary>Explore</summary>'),
    'Explore is one dropdown menu item on every page');
$bundleTag = substr((string) sha1_file(dirname(__DIR__) . '/private/bugbrain.js'), 0, 10);
check(str_contains($explore['body'], '/computelab/assets/bugbrain.js?v=' . $bundleTag . '"') && !str_contains($explore['body'], 'SOTA') && !str_contains($explore['body'], 'State-of-the-Art'),
    'explore loads the engine bundle with a cache-buster from its content hash (a new bundle gets a new URL past the CDN) and makes no state-of-the-art claims');
$exploreCompare = http($base . '/explore?compare=1');
check($exploreCompare['status'] === 200 && str_contains($exploreCompare['body'], 'id="bug-baseline"') && str_contains($exploreCompare['body'], 'data-compare="1"') && str_contains($exploreCompare['body'], 'data-role="base-stats"')
    && !str_contains($explore['body'], 'id="bug-baseline"'), 'explore?compare=1 still shows the two arenas side by side');
$designResp = http($base . '/explore/design.json');
$designJson = json_decode($designResp['body'], true);
preg_match('/ETag: ("[^"]+")/i', $designResp['header'], $designTag);
check($designResp['status'] === 200 && ($designJson['schema'] ?? 0) === 2 && ($designJson['champion']['id'] ?? '') === 'v3h'
    && isset($designJson['text']['liveVariant']) && isset($designTag[1]) && str_contains($designResp['header'], 'Cache-Control: public, max-age=60')
    && http($base . '/explore/design.json', 'GET', null, ['If-None-Match: ' . $designTag[1]])['status'] === 304,
    'design.json serves the schema 2 manifest with the arena champion, a short max-age, and answers a matching ETag with 304');
$shipV = (string) (json_decode((string) file_get_contents(dirname(__DIR__) . '/private/explore/design.json'), true)['version'] ?? '');   // the shipped top design
$replayResp = http($base . '/explore/replay/read.json');
preg_match('/ETag: ("[^"]+")/i', $replayResp['header'], $replayTag);
check($replayResp['status'] === 200 && str_contains($replayResp['header'], 'Cache-Control: public') && isset($replayTag[1])
    && $shipV !== '' && str_contains($replayTag[1], $shipV . '-read-') && strlen((string) (json_decode($replayResp['body'], true)['hits'] ?? '')) > 1000
    && http($base . '/explore/replay/read.json', 'GET', null, ['If-None-Match: ' . $replayTag[1]])['status'] === 304,
    'a replay is served with a cache header and a manifest-version ETag');
$cond = static function (string $url, string $inm) use ($base): int { return http($base . $url, 'GET', null, ['If-None-Match: ' . $inm])['status']; };
check(isset($designTag[1], $replayTag[1])
    && $cond('/explore/design.json', 'W/' . $designTag[1]) === 304 && $cond('/explore/replay/read.json', 'W/' . $replayTag[1]) === 304
    && $cond('/explore/design.json', '"nope", W/' . $designTag[1]) === 304 && $cond('/explore/replay/read.json', '"nope" , ' . $replayTag[1]) === 304
    && $cond('/explore/design.json', '*') === 304
    && $cond('/explore/design.json', '"nope", W/"also-nope"') === 200 && $cond('/explore/replay/read.json', 'W/"' . $shipV . '-read-0000000000000000"') === 200,
    'design.json and replays answer 304 to a weak tag or a list containing the tag, and 200 to a mismatch');
$badReplay = true;
foreach (['/explore/replay/evil.json', '/explore/replay/design.json', '/explore/replay/..%2Fdesign.json', '/explore/replay/READ.json', '/explore/replay/read.php'] as $u) {
    $r = http($base . $u);
    if ($r['status'] !== 404 || str_contains($r['body'], '"schema"')) {
        $badReplay = false;
        echo "replay path not refused: $u ({$r['status']})\n";
    }
}
check($badReplay, 'unknown or crafted replay paths get 404');
$replayJs = http($base . '/assets/explore-replay.js');
$liveJs = http($base . '/assets/explore-live.js');
$engineJs = http($base . '/assets/bugbrain.js?v=' . $bundleTag);
$arenaJs = http($base . '/assets/explore-arena.js');
check($replayJs['status'] === 200 && str_contains($replayJs['header'], 'application/javascript') && str_contains($replayJs['body'], 'ExploreDemos')
    && $liveJs['status'] === 200 && str_contains($liveJs['body'], 'importScripts')
    && $engineJs['status'] === 200 && str_contains($engineJs['body'], 'built by tools/build_bugbrain_bundle.js from commit') && strlen($engineJs['body']) <= 600 * 1024,
    'the demo scripts and the engine bundle (with its source commit, at most 600 KB) are served');
check($arenaJs['status'] === 200 && str_contains($arenaJs['header'], 'application/javascript') && str_contains($arenaJs['body'], 'localStorage')
    && str_contains($arenaJs['body'], "ExploreDemos[id] = makeArena") && !str_contains($engineJs['body'], 'makeArena('),
    'the arena demos (long-running bug, predator) are a lazy script outside the engine bundle');
check(str_contains($explore['body'], 'id="demo-predator"') && str_contains($explore['body'], 'data-task="hard"') && str_contains($explore['body'], 'data-task="flash"')
    && str_contains($explore['body'], 'href="/computelab/explore#predator"') && str_contains($explore['body'], 'data-arena-js="/computelab/assets/explore-arena.js?v=')
    && substr_count($explore['body'], 'data-needs="engine,arena"') === 4 && substr_count($explore['body'], '>Start fresh</button>') === 4
    && !str_contains($explore['body'], '>New arena</button>'),
    'explore has the predator arena tab and both arenas keep one bug with a Start fresh button');
check(str_contains($explore['body'], '<canvas id="bug-shoot" class="bug-canvas" data-role="canvas"') && str_contains($explore['body'], 'data-task="shoot"')
    && str_contains($explore['body'], '<canvas id="bug-shoot-predator"') && str_contains($explore['body'], 'data-task="shoot-predator"')
    && str_contains($explore['body'], 'href="/computelab/explore#shoot"') && str_contains($explore['body'], 'href="/computelab/explore#shoot-predator"')
    && str_contains($arenaJs['body'], 'class ShootWorld extends B.World') && str_contains($arenaJs['body'], "'shoot', 'shoot-predator'") && !str_contains($engineJs['body'], 'ShootWorld'),
    'explore has the poison shooter (with and without the hunter); its fire output and projectiles live in the lazy arena script, not the engine bundle');
$brainJsHttp = http($base . '/assets/explore-brain.js');
check($brainJsHttp['status'] === 200 && str_contains($brainJsHttp['header'], 'application/javascript') && str_contains($brainJsHttp['body'], 'ExploreDemos.brain')
    && str_contains($brainJsHttp['body'], 'record: true') && !str_contains($engineJs['body'], 'ExploreDemos.brain'),
    'the brain-growth view is a lazy script outside the engine bundle');
check(str_contains($explore['body'], 'id="demo-brain"') && str_contains($explore['body'], '>Watch a brain grow<') && str_contains($explore['body'], 'data-needs="engine,brain"')
    && str_contains($explore['body'], 'data-brain-js="/computelab/assets/explore-brain.js?v=') && str_contains($explore['body'], "if (n === 'brain') out.push(root.getAttribute('data-brain-js'))")
    && str_contains($explore['body'], 'data-role="speed"') && str_contains($explore['body'], 'data-role="restart"') && str_contains($explore['body'], 'data-role="play"')
    && str_contains($explore['body'], 'data-champion="/computelab/explore/bugbrain-champion.json"') && str_contains($explore['body'], '<aside class="bug-stats br-stats" data-role="stats"'),
    'explore has the brain-growth view with play, slow-motion speed and restart controls, and its legend beside the canvas');
check(str_contains($explore['body'], "function hashId() { return location.hash.slice(1).split('?')[0]; }") && str_contains($brainJsHttp['body'], 'const DEFAULT_SEED = ')
    && str_contains($brainJsHttp['body'], 'Grow a new one') && str_contains($brainJsHttp['body'], 'seed=(\\d{1,10})'),
    'explore#brain?seed=N opens the brain view with that seed; without one it grows the fixed default seed');

$arenaWorker = $app->enroll('arena-test', ['bugbrain'], 1, true);
file_put_contents($researchToken, $arenaWorker['token']);
$arenaJob = $app->createJob('bb-arena-pilot', 'Memory arena smoke test', 5, 17);
$arenaPoll = shell_exec('node ' . escapeshellarg($root . '/run/coord.js') . ' --once --url ' . escapeshellarg($base) . ' --token-file ' . escapeshellarg($researchToken) . ' 2>&1');
unlink($researchToken);
$st = $app->db->prepare("SELECT body_json FROM results WHERE job_id = ? AND status = 'done'");
$st->execute([$arenaJob]);
$arena = json_decode((string) $st->fetchColumn(), true)['research'] ?? [];
check(str_contains($arenaPoll ?? '', $arenaJob) && ($arena['version'] ?? '') === 'arena-memory-1'
    && count($arena['audit']['edit']['tasks'][2]['scores'] ?? []) === 12
    && isset($arena['audit']['edit']['tasks'][0]['approachedAfterLoss']),
    'a BugBrain donor submits paired arena mutation results');

proc_terminate($proc);

/* A second server whose database refuses connections the way MySQL does at the host's per-second limit. */
function coord_refusing_server(string $config, string $public, int $port, int $refuse)
{
    $cmd = 'exec env COORD_CONFIG=' . escapeshellarg($config) . ' COORD_TEST_DB_REFUSE=' . $refuse . ' php -S 127.0.0.1:' . $port . ' -t ' . escapeshellarg($public) . ' ' . escapeshellarg($public . '/index.php');
    $p = proc_open($cmd . ' > /tmp/coord-php-refuse.log 2>&1', [['pipe', 'r'], ['file', '/tmp/coord-php-refuse-out.txt', 'w'], ['file', '/tmp/coord-php-refuse-err.txt', 'w']], $pp, $public);
    usleep(300000);
    return $p;
}
$p2 = coord_refusing_server($config, $public, $port + 1, 2);
$b2 = 'http://127.0.0.1:' . ($port + 1) . '/computelab';
$t0 = microtime(true);
$st2 = http($b2 . '/status.json');
$home2 = http($b2 . '/');
check($st2['status'] === 200 && is_array(json_decode($st2['body'], true)) && $home2['status'] === 200 && microtime(true) - $t0 < 3,
    'two refused connections per request are retried and the pages still answer 200');
proc_terminate($p2);
$p3 = coord_refusing_server($config, $public, $port + 2, 99);
$b3 = 'http://127.0.0.1:' . ($port + 2) . '/computelab';
$busyApi = http($b3 . '/api/v1/claim', 'POST', '{}', ['Content-Type: application/json', 'Authorization: Bearer ' . str_repeat('a', 64)]);
$busyPage = http($b3 . '/discoveries');
$cssBusy = http($b3 . '/assets/computelab.css');
$iconBusy = http($b3 . '/favicon.svg');
$jsBusy = http($b3 . '/assets/explore-arena.js');
check($busyApi['status'] === 503 && preg_match('/^Retry-After: 5$/mi', $busyApi['header']) === 1 && (json_decode($busyApi['body'], true)['retryAfter'] ?? 0) === 5
    && str_contains($busyApi['header'], 'application/json') && !str_contains($busyApi['body'], 'PDOException') && !str_contains($busyApi['body'], 'Fatal'),
    'a database that keeps refusing gives the API a clean JSON 503 with Retry-After: 5, not a PHP error');
check($busyPage['status'] === 503 && preg_match('/^Retry-After: 5$/mi', $busyPage['header']) === 1 && str_contains($busyPage['body'], 'Compute Lab is busy') && !str_contains($busyPage['body'], 'PDOException'),
    'pages answer a short "busy, retrying" 503 page instead of a 500');
check($cssBusy['status'] === 200 && str_contains($cssBusy['header'], 'text/css') && $iconBusy['status'] === 200 && $jsBusy['status'] === 200,
    'stylesheet, icons and Explore scripts are served without opening a database connection');
proc_terminate($p3);
$retry503 = trim((string) shell_exec('node -e ' . escapeshellarg("const c=require(" . json_encode($root . '/run/coord.js') . "); const d=c.decideRetry({status:503,message:'busy'},1000); process.stdout.write(d.action+' '+d.delay)") . ' 2>&1'));
check($retry503 === 'retry 2000', 'the worker treats a 503 as retryable and backs off (no worker change needed)');
echo "http checks done\n";
exit($fail === 0 ? 0 : 1);
