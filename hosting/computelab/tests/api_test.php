<?php
declare(strict_types=1);
require dirname(__DIR__) . '/private/src/App.php';

if (getenv('COORD_RACE_CHILD') === '1') {
    $raceConfig = [
        'driver' => 'sqlite',
        'base_path' => '/computelab',
        'lease_seconds' => 60,
        'result_bytes' => 2048,
        'login_per_minute' => 3,
        'api_per_minute' => 5,
        'max_attempts' => 3,
        'protocol' => dirname(__DIR__) . '/PROTOCOL.txt',
    ];
    $raceDb = new PDO('sqlite:' . (string) getenv('COORD_RACE_DB'));
    $raceApp = new App($raceDb, $raceConfig);
    $raceWorker = $raceApp->workerByToken((string) getenv('COORD_RACE_TOKEN'));
    $raceJob = $raceWorker ? $raceApp->claim($raceWorker) : null;
    echo $raceJob ? (string) $raceJob['id'] : '';
    exit(0);
}

$fail = 0;
$n = 0;
function check(bool $ok, string $what): void
{
    global $fail, $n;
    $n++;
    if (!$ok) {
        fwrite(STDERR, "FAIL $what\n");
        $fail++;
    } else {
        echo "ok   $what\n";
    }
}

$now = '2026-11-09T03:00:00+00:00';
$config = [
    'driver' => 'sqlite',
    'base_path' => '/computelab',
    'lease_seconds' => 60,
    'result_bytes' => 2048,
    'login_per_minute' => 3,
    'api_per_minute' => 5,
    'protocol' => dirname(__DIR__) . '/PROTOCOL.txt',
];
$db = new PDO('sqlite::memory:');
$app = new App($db, $config, static function () use (&$now): string { return $now; });
$app->migrate();
$app->createOwner('labowner', 'correct-horse');
$bad = $app->login('labowner', 'wrong-password');
$good = $app->login('labowner', 'correct-horse');
check($bad === null && $good && password_get_info((string) $db->query('SELECT password_hash FROM owner')->fetchColumn())['algo'] !== 0, 'owner password is hashed and a wrong password fails');

$threw = false;
try { $app->enroll('pc1', ['spikefoundry'], 2, false); } catch (InvalidArgumentException $e) { $threw = true; }
check($threw, 'enrollment without consent is refused');
try { $app->enroll("pc';drop table workers;--", ['spikefoundry'], 2, true); $threw = false; } catch (InvalidArgumentException $e) { $threw = true; }
check($threw, 'a name with SQL text is refused');

$made = $app->enroll('home-pc', ['spikefoundry', 'bugbrain'], 2, true);
$worker = $app->workerByToken($made['token']);
check($worker && $worker['name'] === 'home-pc' && $made['token'] !== hash('sha256', $made['token']), 'enrollment returns a token that is stored only as a hash');
check($app->claim($worker) === null, 'there is nothing to claim before the owner queues a job');

$sf = $app->createJob('sf-vision', 'Synthetic vision', 0.2, 11);
$bb = $app->createJob('bb-order3', 'Order 3', 0.99, 8000);
$job = $app->claim($app->workerByToken($made['token']));
check($job && $job['id'] === $sf && $job['project'] === 'spikefoundry', 'SpikeFoundry is assigned before a higher-priority BugBrain job');
check($job['codeHash'] === $app->protocolHash() && $job['runner'] === 'spikefoundry/run.js', 'the lease is pinned to the approved protocol hash and runner');

$other = $app->enroll('other-pc', ['spikefoundry', 'bugbrain'], 2, true);
$now = '2026-11-09T03:00:30+00:00';
$second = $app->claim($app->workerByToken($other['token']));
check($second && $second['id'] === $bb, 'the second computer gets BugBrain while the first lease is still valid');
$now = '2026-11-09T03:02:30+00:00';
$third = $app->enroll('third-pc', ['bugbrain'], 2, true);
$re = $app->claim($app->workerByToken($third['token']));
$expiredAttempts = (int) $db->query('SELECT attempts FROM jobs WHERE id = ' . $db->quote($bb))->fetchColumn();
$expiredError = (string) $db->query('SELECT last_error FROM jobs WHERE id = ' . $db->quote($bb))->fetchColumn();
check($re && $re['id'] === $bb && $expiredAttempts === 1 && str_contains($expiredError, 'Lease expired'), 'an expired lease returns the BugBrain job to the queue and counts the attempt');

$app->setPaused((string) $worker['id'], true);
check($app->claim($app->workerByToken($made['token'])) === null, 'a paused computer is not given a new job');
$app->revoke((string) $other['workerId']);
check($app->workerByToken($other['token']) === null, 'a revoked token cannot authenticate');

$holder = $app->workerByToken($third['token']);
$badResult = false;
try { $app->submitResult($holder, $re['id'], ['status' => 'done', 'summary' => 'x', 'command' => 'rm -rf /']); } catch (InvalidArgumentException $e) { $badResult = true; }
check($badResult, 'a result with a command field is rejected');
$digest = hash('sha256', 'Synthetic pipeline finished.');
try { $app->submitResult($holder, $re['id'], ['status' => 'done', 'summary' => 'Synthetic pipeline finished.', 'digest' => '00', 'synthetic' => false]); $badResult = false; } catch (InvalidArgumentException $e) { $badResult = true; }
check($badResult, 'a mismatched digest is rejected');
$app->submitResult($holder, $re['id'], ['status' => 'done', 'summary' => 'Template run/r42.js finished.', 'digest' => hash('sha256', 'Template run/r42.js finished.'), 'synthetic' => false]);
$left = $db->query('SELECT status FROM jobs WHERE id = ' . $db->quote($re['id']))->fetchColumn();
check($left === 'done', 'a valid result finishes the leased job');

$app->setPaused((string) $worker['id'], false);
$again = $app->createJob('sf-vision', 'Synthetic again', 0.8, 12);
$holder2 = $app->workerByToken($made['token']);
$got = $app->claim($holder2);
$plain = false;
try { $app->submitResult($holder2, (string) $got['id'], ['status' => 'done', 'summary' => 'not synthetic']); } catch (InvalidArgumentException $e) { $plain = str_contains($e->getMessage(), 'synthetic'); }
check($got && $got['project'] === 'spikefoundry' && $plain, 'SpikeFoundry results must say they are synthetic');

for ($i = 0; $i < 3; $i++) $app->rateLimit('login:test', 3);
check($app->rateLimit('login:test', 3) === false, 'login attempts are rate limited');

$dir = sys_get_temp_dir() . '/coord-import-' . bin2hex(random_bytes(3));
mkdir($dir . '/jobs', 0700, true);
mkdir($dir . '/done', 0700, true);
file_put_contents($dir . '/jobs/old.json', json_encode(['id' => 'old-job', 'title' => 'Old git job', 'priority' => 0.4]));
file_put_contents($dir . '/done/old.json', json_encode(['id' => 'old-job', 'status' => 'done', 'worker' => 'linux-pc', 'finishedAt' => '2026-11-06T16:50:58Z']));
file_put_contents($dir . '/jobs/open.json', json_encode(['id' => 'open-job', 'title' => 'Unfinished git job']));
$imported = $app->importQueueDir($dir);
$open = $db->query("SELECT status FROM jobs WHERE id = 'import-open-job'")->fetchColumn();
check($imported === 2 && $open === 'held', 'git import keeps finished history and does not queue unfinished files');
$importStays = false;
try { $app->requeue('import-open-job'); } catch (InvalidArgumentException $e) { $importStays = str_contains($e->getMessage(), 'Imported'); }
check($importStays, 'an imported held job stays out of the volunteer queue');

$schema = (string) file_get_contents(dirname(__DIR__) . '/private/src/App.php');
check(strpos($schema, 'TEXT PRIMARY KEY') === false && strpos($schema, 'VARCHAR(191) PRIMARY KEY') !== false, 'indexed ids are VARCHAR(191) so MySQL can build the keys');

function lab(): array
{
    global $config;
    $box = new stdClass();
    $box->t = '2026-11-09T04:00:00+00:00';
    $db = new PDO('sqlite::memory:');
    $app = new App($db, $config, static function () use ($box): string { return $box->t; });
    $app->migrate();
    $app->createOwner('labowner', 'correct-horse');
    return ['app' => $app, 'db' => $db, 'clock' => $box];
}

$legacy = new PDO('sqlite::memory:');
$legacy->exec('CREATE TABLE jobs (
    id VARCHAR(191) PRIMARY KEY,
    project_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    title TEXT NOT NULL,
    spec_json TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    priority REAL NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
)');
$legacy->exec("INSERT INTO jobs (id, project_id, template_id, title, spec_json, code_hash, priority, status, created_at) VALUES ('keep-me', 'bugbrain', 'bb-order3', 'Keep this row', '{}', 'abc', 0.2, 'queued', '2026-11-01T00:00:00+00:00')");
$legacyApp = new App($legacy, $config, static function (): string { return '2026-11-09T04:00:00+00:00'; });
$legacyApp->migrate();
$kept = $legacy->query("SELECT title, attempts, last_error, status FROM jobs WHERE id = 'keep-me'")->fetch();
$legacyApp->migrate();
$keptAgain = $legacy->query("SELECT title, attempts FROM jobs WHERE id = 'keep-me'")->fetch();
check($kept && $kept['title'] === 'Keep this row' && (int) $kept['attempts'] === 0 && $kept['last_error'] === null && $kept['status'] === 'queued' && $keptAgain['title'] === 'Keep this row', 'upgrade adds job columns and keeps the existing row');

$fit = lab();
$fitWorker = $fit['app']->enroll('fit-pc', ['spikefoundry'], 2, true);
$big = $fit['app']->createJob('sf-vision', 'Too many batches', 4, 30);
$small = $fit['app']->createJob('sf-vision', 'Small enough', 1, 31);
$fit['db']->prepare('UPDATE jobs SET spec_json = ? WHERE id = ?')->execute([json_encode(['scenario' => 'vision', 'batches' => 9, 'seed' => 30]), $big]);
$fitJob = $fit['app']->claim($fit['app']->workerByToken($fitWorker['token']));
$bigStatus = $fit['db']->query('SELECT status FROM jobs WHERE id = ' . $fit['db']->quote($big))->fetchColumn();
check($fitJob && $fitJob['id'] === $small && $bigStatus === 'queued', 'an oversized first job stays queued and a smaller job in the same project is claimed');

$skip = lab();
$skipWorker = $skip['app']->enroll('skip-pc', ['spikefoundry', 'bugbrain'], 2, true);
$onlyBig = $skip['app']->createJob('sf-vision', 'Only too big', 5, 32);
$bug = $skip['app']->createJob('bb-order3', 'Fits elsewhere', 0.1, 33);
$skip['db']->prepare('UPDATE jobs SET spec_json = ? WHERE id = ?')->execute([json_encode(['scenario' => 'vision', 'batches' => 9, 'seed' => 32]), $onlyBig]);
$skipped = $skip['app']->claim($skip['app']->workerByToken($skipWorker['token']));
check($skipped && $skipped['id'] === $bug, 'when no job in the first project fits, the next project is claimed');

$failLab = lab();
$failWorker = $failLab['app']->enroll('fail-pc', ['spikefoundry'], 2, true);
$failId = $failLab['app']->createJob('sf-vision', 'Flaky', 1, 40);
$held = false;
for ($attempt = 1; $attempt <= 3; $attempt++) {
    $leased = $failLab['app']->claim($failLab['app']->workerByToken($failWorker['token']));
    if (!$leased || $leased['id'] !== $failId) {
        $held = false;
        break;
    }
    $failLab['app']->submitResult($failLab['app']->workerByToken($failWorker['token']), $failId, ['status' => 'error', 'summary' => 'broke ' . $attempt, 'synthetic' => true]);
    $row = $failLab['db']->query('SELECT status, attempts, last_error, not_before FROM jobs WHERE id = ' . $failLab['db']->quote($failId))->fetch();
    if ($attempt < 3) {
        if ($row['status'] !== 'queued' || (int) $row['attempts'] !== $attempt || (string) $row['not_before'] <= $failLab['clock']->t) {
            $held = false;
            break;
        }
        $againTooSoon = $failLab['app']->claim($failLab['app']->workerByToken($failWorker['token']));
        if ($againTooSoon !== null) {
            $held = false;
            break;
        }
        $failLab['clock']->t = gmdate('c', strtotime((string) $row['not_before']) + 1);
    } else {
        $held = $row['status'] === 'held' && (int) $row['attempts'] === 3 && $row['last_error'] === 'broke 3';
    }
}
$afterHold = $failLab['app']->claim($failLab['app']->workerByToken($failWorker['token']));
check($held && $afterHold === null, 'three errors hold the job and leave it out of the queue');
$failLab['app']->requeue($failId);
$reset = $failLab['db']->query('SELECT status, attempts, last_error FROM jobs WHERE id = ' . $failLab['db']->quote($failId))->fetch();
$afterReset = $failLab['app']->claim($failLab['app']->workerByToken($failWorker['token']));
check($reset['status'] === 'queued' && (int) $reset['attempts'] === 0 && $reset['last_error'] === null && $afterReset && $afterReset['id'] === $failId, 'requeue clears the hold and the attempt count');

$same = lab();
$sameWorker = $same['app']->enroll('same-pc', ['spikefoundry'], 2, true);
$burned = $same['app']->createJob('sf-vision', 'Just failed', 3, 50);
$otherJob = $same['app']->createJob('sf-vision', 'Fresh work', 1, 51);
$burnLease = $same['app']->claim($same['app']->workerByToken($sameWorker['token']));
$same['app']->submitResult($same['app']->workerByToken($sameWorker['token']), (string) $burnLease['id'], ['status' => 'error', 'summary' => 'nope', 'synthetic' => true]);
$same['clock']->t = (string) $same['db']->query('SELECT not_before FROM jobs WHERE id = ' . $same['db']->quote($burned))->fetchColumn();
$preferred = $same['app']->claim($same['app']->workerByToken($sameWorker['token']));
check($burnLease['id'] === $burned && $preferred && $preferred['id'] === $otherJob, 'a computer is given other work before the job it just failed');

$beatLab = lab();
$beatWorker = $beatLab['app']->enroll('beat-pc', ['spikefoundry'], 2, true);
$beatLab['app']->createJob('sf-vision', 'Long job', 1, 55);
$beatJob = $beatLab['app']->claim($beatLab['app']->workerByToken($beatWorker['token']));
$until1 = (string) $beatLab['db']->query('SELECT until_at FROM leases WHERE job_id = ' . $beatLab['db']->quote($beatJob['id']))->fetchColumn();
$beatLab['clock']->t = '2026-11-09T04:00:30+00:00';
$beat = $beatLab['app']->heartbeat($beatLab['app']->workerByToken($beatWorker['token']));
$until2 = (string) $beatLab['db']->query('SELECT until_at FROM leases WHERE job_id = ' . $beatLab['db']->quote($beatJob['id']))->fetchColumn();
$otherBeat = $beatLab['app']->enroll('beat-other', ['spikefoundry'], 2, true);
$foreign = $beatLab['app']->heartbeat($beatLab['app']->workerByToken($otherBeat['token']));
$until3 = (string) $beatLab['db']->query('SELECT until_at FROM leases WHERE job_id = ' . $beatLab['db']->quote($beatJob['id']))->fetchColumn();
check($beat['jobId'] === $beatJob['id'] && strtotime($until2) > strtotime($until1) && $until3 === $until2 && $foreign['jobId'] === null, 'a heartbeat extends only that computer\'s lease');

$steal = lab();
$stealWorker = $steal['app']->enroll('steal-pc', ['spikefoundry'], 2, true);
$firstId = $steal['app']->createJob('sf-vision', 'First', 4, 60);
$secondId = $steal['app']->createJob('sf-vision', 'Second', 1, 61);
$stolenId = null;
$steal['app']->beforeLease = function (array $job) use ($steal, &$stolenId): void {
    $steal['app']->beforeLease = null;
    $steal['app']->db->prepare('UPDATE jobs SET status = ? WHERE id = ?')->execute(['leased', $job['id']]);
    $until = gmdate('c', strtotime($steal['app']->now()) + 60);
    $steal['app']->db->prepare('INSERT INTO leases (job_id, worker_id, until_at, heartbeat_at) VALUES (?, ?, ?, ?)')->execute([$job['id'], 'other-holder', $until, $steal['app']->now()]);
    $stolenId = $job['id'];
};
$stolenClaim = $steal['app']->claim($steal['app']->workerByToken($stealWorker['token']));
$leaseCount = (int) $steal['db']->query('SELECT COUNT(*) FROM leases')->fetchColumn();
check($stolenId === $firstId && $stolenClaim && $stolenClaim['id'] === $secondId && $leaseCount === 2, 'a lost conditional update leases the next job instead of the same one');

$racePath = sys_get_temp_dir() . '/coord-race-' . bin2hex(random_bytes(4)) . '.sqlite';
$racePdo = new PDO('sqlite:' . $racePath);
$racePdo->query('PRAGMA journal_mode=WAL')->fetch();
$raceConfig = $config;
$raceConfig['lease_seconds'] = 60;
$raceApp = new App($racePdo, $raceConfig, static function (): string { return '2026-11-09T05:00:00+00:00'; });
$raceApp->migrate();
$raceApp->createOwner('labowner', 'correct-horse');
$raceA = $raceApp->enroll('race-a', ['spikefoundry'], 2, true);
$raceB = $raceApp->enroll('race-b', ['spikefoundry'], 2, true);
$raceOnly = $raceApp->createJob('sf-vision', 'Only one', 1, 70);
unset($raceApp, $racePdo);
$raceOut = [];
$raceErr = [];
$raceProcs = [];
foreach ([$raceA['token'], $raceB['token']] as $raceToken) {
    $raceCmd = 'COORD_RACE_CHILD=1 COORD_RACE_DB=' . escapeshellarg($racePath) . ' COORD_RACE_TOKEN=' . escapeshellarg($raceToken) . ' ' . escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__);
    $racePipes = [];
    $raceProcs[] = ['proc' => proc_open($raceCmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $racePipes), 'pipes' => $racePipes];
}
foreach ($raceProcs as $raceProc) {
    fclose($raceProc['pipes'][0]);
    $raceOut[] = stream_get_contents($raceProc['pipes'][1]);
    $raceErr[] = stream_get_contents($raceProc['pipes'][2]);
    fclose($raceProc['pipes'][1]);
    fclose($raceProc['pipes'][2]);
    proc_close($raceProc['proc']);
}
$raceWinners = array_values(array_filter($raceOut, static function (string $line): bool { return trim($line) !== ''; }));
$raceCheck = new PDO('sqlite:' . $racePath);
$raceLeases = (int) $raceCheck->query('SELECT COUNT(*) FROM leases')->fetchColumn();
$raceStatus = (string) $raceCheck->query('SELECT status FROM jobs WHERE id = ' . $raceCheck->quote($raceOnly))->fetchColumn();
check(count($raceWinners) === 1 && trim($raceWinners[0]) === $raceOnly && $raceLeases === 1 && $raceStatus === 'leased', 'two simultaneous claims lease the job once');
if (count($raceWinners) !== 1 || $raceLeases !== 1) {
    fwrite(STDERR, 'race detail ' . json_encode(['out' => $raceOut, 'err' => $raceErr]) . "\n");
}
@unlink($racePath);
@unlink($racePath . '-wal');
@unlink($racePath . '-shm');

$ux = lab();
$deskA = $ux['app']->enroll('desk-a', ['spikefoundry'], 2, true);
$deskB = $ux['app']->enroll('desk-b', ['bugbrain'], 2, true, $deskA['participantId']);
$linked = $ux['app']->computersFor($deskA['participantId']);
check(count($linked) === 2 && $ux['app']->workerOwns($deskA['participantId'], $deskB['workerId']), 'one participant can link more than one computer');
$badRunner = false;
try { $ux['app']->createProject('Nope', 'No runner.', 'run/evil.js', 1, true); } catch (InvalidArgumentException $e) { $badRunner = true; }
check($badRunner, 'a project runner outside the allowlist is refused');
$proj = $ux['app']->createProject('Evening vision', 'A small synthetic vision project.', 'spikefoundry/run.js', 5, true);
$evening = $ux['app']->createJob($proj . '-default', 'Evening check', 1, 3);
$eveningJob = $ux['app']->claim($ux['app']->workerByToken($deskA['token']));
check($eveningJob && $eveningJob['id'] === $evening && $eveningJob['project'] === $proj, 'a new SpikeFoundry project is offered to a computer that allowed SpikeFoundry');
$ux['app']->heartbeat($ux['app']->workerByToken($deskA['token']), ['progress' => 42]);
$eveningLease = $ux['app']->currentLease($deskA['workerId']);
check($eveningLease && (int) $eveningLease['progress'] === 42, 'a heartbeat records progress only on that computer\'s lease');
$runningPage = $ux['app']->listJobs('running', 1, 1);
check($runningPage['total'] === 1 && $runningPage['rows'][0]['status'] === 'leased' && $runningPage['pages'] === 1, 'the running filter lists leased jobs');
$ux['clock']->t = gmdate('c', strtotime($ux['clock']->t) + 90);
$ux['app']->submitResult($ux['app']->workerByToken($deskA['token']), $evening, ['status' => 'done', 'summary' => 'Synthetic evening run.', 'synthetic' => true]);
$contrib = $ux['app']->contribution($deskA['workerId']);
check($contrib['done'] === 1 && $contrib['seconds'] === 90, 'a finished job records how long the computer worked');
$stats = $ux['app']->homeStats();
check($stats['online'] >= 1 && $stats['projects'] >= 3 && $stats['done'] >= 1, 'home totals count computers, finished jobs, and projects');
require dirname(__DIR__) . '/private/src/setup.php';
$unix = setup_script('unix', $deskA['token'], 'https://zaga.info/computelab', 'https://github.com/TravisA9/bugbrain-neurons.git', 'cursor/worker-console-22bf');
$windows = setup_script('windows', $deskA['token'], 'https://zaga.info/computelab', 'https://github.com/TravisA9/bugbrain-neurons.git', 'cursor/worker-console-22bf');
check(strpos($unix, $deskA['token']) !== false && strpos($unix, 'set -x') === false && strpos($unix, 'nodejs.org') !== false && strpos($unix, 'BB_COORDINATOR_URL') !== false, 'the Mac/Linux setup file saves the token without tracing the shell');
preg_match('/-EncodedCommand ([A-Za-z0-9+\/=]+)/', $windows, $winEnc);
$windowsAll = $windows . str_replace("\0", '', base64_decode($winEnc[1] ?? ''));
check(strpos($windows, '@echo off') === 0 && strpos($windowsAll, $deskA['token']) !== false && strpos($windows, 'echo ' . $deskA['token']) === false && strpos($windows, 'nodejs.org') !== false, 'the Windows setup file saves the token and does not echo it');
check(strpos($windows, 'BB_CODE_BRANCH') !== false && strpos($windows, 'cursor/worker-console-22bf') !== false && strpos($windows, 'core.autocrlf=false') !== false && strpos($windows, 'run\\install-windows.ps1') !== false && strpos($windows, '.bugbrain\\logs') !== false && strpos($windows, 'uninstall-computelab.cmd') !== false, 'the Windows setup pins the worker branch, keeps LF, and installs through the per-user installer with logs and uninstall');
$verifyAt = strpos($windows, 'run\\verify-start.js');
$runningAt = strpos($windows, 'Compute Lab is running in the background');
$gateAt = strpos($windows, 'if errorlevel 1 goto notrunning');
check($verifyAt !== false && $gateAt !== false && $runningAt !== false && $verifyAt < $gateAt && $gateAt < $runningAt && substr_count($windows, 'is running in the background') === 1 && strpos($windows, ':notrunning') !== false && strpos($windows, 'FAIL: Compute Lab is NOT running') !== false && strpos($windows, 'exit /b 1') !== false, 'the Windows setup says the worker is running only after verify-start passes, and prints FAIL otherwise');
check(strpos($windowsAll, "'.previous-'") !== false && strpos($windows, 'Register-ScheduledTask') === false, 'the Windows setup keeps an existing token from another computer entry instead of overwriting it, and leaves task registration to the installer');
$installer = (string) file_get_contents(dirname(__DIR__, 3) . '/run/install-windows.ps1');
check(strpos($installer, '-LogonType Interactive -RunLevel Limited') !== false && strpos($installer, '-AtLogOn -User $user') !== false && strpos($installer, '/SC ONLOGON /RL LIMITED /IT /RU $user') !== false && strpos($installer, "GetFolderPath('Startup')") !== false && strpos($installer, '-WindowStyle Hidden') !== false && strpos($installer, 'Start-Process') !== false, 'the Windows installer registers a per-user task without admin, falls back to schtasks and then the Startup folder, and starts the worker hidden');
check(strpos($installer, "'ComputeLab Worker'") !== false && strpos($installer, "'ComputeLabWorker'") !== false && strpos($installer, 'computelab-worker\.ps1') !== false && strpos($installer, 'Disable-ScheduledTask') !== false && strpos($installer, 'Unregister-ScheduledTask') === false && strpos($installer, 'taskkill.exe /T /F') !== false, 'the Windows installer reuses an existing Compute Lab task, disables extra copies without deleting them, and stops a running worker first');
check(stripos($installer, 'is running') === false && strpos($installer, 'exit 1') !== false, 'the Windows installer never claims the worker is running; verify-start decides');
check(strpos($unix, 'computelab-watchdog.timer') !== false && strpos($unix, 'OnUnitActiveSec=3min') !== false && strpos($unix, 'StartLimitIntervalSec=0') !== false && strpos($unix, '*/3 * * * * BB_INSTALL=cron /bin/sh $ST/computelab-worker.sh') !== false && strpos($unix, 'systemctl --user stop computelab-watchdog.timer computelab.service') !== false && strpos($unix, 'grep -v "# computelab-watchdog"') !== false, 'new Mac/Linux installs get a 3-minute watchdog (systemd timer or cron) that the stop script also stops');
$installer2 = (string) file_get_contents(dirname(__DIR__, 3) . '/run/install-windows.ps1');
check(strpos($installer2, "'--headless powershell.exe ' + \$psArgs") !== false && strpos($installer2, '-RepetitionInterval (New-TimeSpan -Minutes 3)') !== false && strpos($installer2, '-MultipleInstances IgnoreNew') !== false, 'new Windows installs run the worker in a headless console (no Terminal window to close) with a 3-minute watchdog trigger');
$uVerify = strpos($unix, 'run/verify-start.js');
$uRunning = strpos($unix, 'Compute Lab is running in the background');
check($uVerify !== false && $uRunning !== false && $uVerify < $uRunning && strpos($unix, 'FAIL: Compute Lab is NOT running') !== false, 'the Mac/Linux setup also says the worker is running only after verify-start passes');
check(strpos($unix, 'BB_CODE_BRANCH') !== false && strpos($unix, 'cursor/worker-console-22bf') !== false && strpos($unix, 'core.autocrlf=false') !== false && strpos($unix, 'systemctl --user') !== false && strpos($unix, '@reboot') !== false && strpos($unix, 'LaunchAgents') !== false && strpos($unix, 'worker.log') !== false && strpos($unix, 'uninstall-computelab.sh') !== false && strpos($unix, 'echo "' . $deskA['token']) === false, 'the Mac/Linux setup pins the branch and installs systemd, cron, or launchd with logs and uninstall');

$lib = lab();
$libWorker = $lib['app']->enroll('lib-pc', ['spikefoundry'], 2, true);
$genomeJson = '{"decay":0.4,"topology":"parallel","wa":1.1}';
$genomeHash = hash('sha256', $genomeJson);
$one = ['taskId' => 'coincidence', 'taskVersion' => 'base-1', 'genomeJson' => $genomeJson, 'genomeHash' => $genomeHash, 'genomeVersion' => 1, 'metrics' => ['quality' => 0.4, 'accuracy' => 0.5], 'neurons' => 3, 'synapses' => 4, 'spikes' => 8, 'evalMs' => 2, 'seed' => 7, 'jobId' => 'sf-vision-7-aaa', 'engineVersion' => 'spikefoundry-1'];
$better = $one;
$better['metrics'] = ['quality' => 0.8, 'accuracy' => 0.9];
$better['seed'] = 8;
$bad = $one;
$bad['genomeHash'] = str_repeat('ab', 32);
$first = $lib['app']->ingestDesigns($lib['app']->workerByToken($libWorker['token']), [$one, $bad], $lib['app']->protocolHash());
$again = $lib['app']->ingestDesigns($lib['app']->workerByToken($libWorker['token']), [$one, $better], $lib['app']->protocolHash());
$top = $lib['app']->topDesigns('coincidence', 5);
check($first['stored'] === 1 && $first['skipped'] === 1 && $again['stored'] === 0 && $again['skipped'] === 1 && $again['confirmed'] === 1, 'design uploads dedupe a genome and reject a bad hash');
check(count($top) === 1 && $top[0]['quality'] == 0.8 && $lib['app']->designGenome($genomeHash)['genome_json'] === $genomeJson, 'the library keeps one genome and ranks the better score');
check($lib['app']->designsByWorker($libWorker['workerId']) === 1, 'a computer can see how many designs it found (a repeat of its own design is not a second one)');
check(count($lib['app']->designExportRows('coincidence', 10)) === 1, 'export returns the compact rows');
$seeded = $lib['app']->seedJobFromDesigns('sf-vision', 'coincidence', 3, 11);
$seedRow = $lib['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $lib['db']->quote($seeded))->fetch();
check($seeded && strpos((string) $seedRow['spec_json'], $genomeHash) !== false, 'the owner can seed a job from the top designs');
check($lib['app']->codeApproved('4b0e21855d9ce104a96633047e8199874524044d399c6150d02eb77e4edca4c4'), 'the previous protocol hash stays approved');
$train = $lib['app']->createJob('sf-train', 'Train model', 5, 4);
$held = $lib['app']->claim($lib['app']->workerByToken($libWorker['token']));
$modelId = $lib['app']->saveModel($lib['app']->workerByToken($libWorker['token']), $held['id'], '{"format":"spikefoundry-designer","designerVersion":"spikefoundry-designer-3","spearman":0.77}', ['spearman' => 0.77, 'heldOut' => 6]);
$current = $lib['app']->currentModel();
check($held && $held['id'] === $train && $modelId && $current && strpos((string) $current['body_json'], '0.77') !== false, 'a leased worker can store a versioned model checkpoint');

function designRecord(string $json, int $seed, float $train, float $held, string $arm, int $ms): array
{
    return [
        'taskId' => 'coincidence', 'taskVersion' => 'base-1', 'genomeJson' => $json, 'genomeHash' => hash('sha256', $json),
        'metrics' => ['quality' => $held, 'train' => $train, 'heldOut' => $held, 'arm' => $arm],
        'neurons' => 2, 'synapses' => 2, 'spikes' => 1, 'evalMs' => $ms, 'seed' => $seed, 'jobId' => 'plateau-job', 'engineVersion' => 'spikefoundry-1',
    ];
}
$plateau = lab();
$pw = $plateau['app']->enroll('plateau-pc', ['spikefoundry'], 2, true);
$pworker = $plateau['app']->workerByToken($pw['token']);
$rise = [];
foreach ([0.2, 0.45, 0.7] as $i => $score) {
    $json = '{"arm":"rise","n":' . $i . '}';
    $rise[] = designRecord($json, 10 + $i, $score, $score, $i === 0 ? 'random' : 'designer', 1000);
}
$plateau['app']->ingestDesigns($pworker, $rise, $plateau['app']->protocolHash());
$rising = $plateau['app']->taskStatus('spikefoundry', 'coincidence');
check($rising['status'] === 'Improving' && strpos($rising['designer']['label'], 'beating random') !== false, 'a climbing held-out score is Improving and the designer is ahead of random');
$plateau['app']->saveTaskPolicy('spikefoundry', 'coincidence', 0.005, 4, 0, 'pause');
$flat = [];
for ($i = 0; $i < 4; $i++) {
    $flat[] = designRecord('{"arm":"flat","n":' . $i . '}', 20 + $i, 0.7, 0.7, 'designer', 1000);
}
$plateau['app']->ingestDesigns($pworker, $flat, $plateau['app']->protocolHash());
$stalled = $plateau['app']->taskStatus('spikefoundry', 'coincidence');
check($stalled['status'] === 'Stalled' && $plateau['app']->taskPaused('spikefoundry', 'coincidence'), 'a flat window pauses the task when that action is selected');
$over = lab();
$ow = $over['app']->enroll('over-pc', ['spikefoundry'], 2, true);
$oworker = $over['app']->workerByToken($ow['token']);
$split = [];
foreach ([[0.2, 0.6], [0.2, 0.6], [0.8, 0.4], [0.9, 0.3]] as $i => $pair) {
    $split[] = designRecord('{"arm":"over","n":' . $i . '}', 30 + $i, $pair[0], $pair[1], 'designer', 1000);
}
$over['app']->ingestDesigns($oworker, $split, $over['app']->protocolHash());
check($over['app']->taskStatus('spikefoundry', 'coincidence')['status'] === 'Overfitting', 'train rising while held-out falls is Overfitting');
require dirname(__DIR__) . '/private/src/pages.php';
$svg = scoreChart($rising['points']);
check(strpos($svg, '<svg') !== false && strpos($svg, 'polyline') !== false, 'the owner chart is inline SVG');

$credit = lab();
$person = $credit['app']->enroll('pat-pc', ['spikefoundry'], 2, true);
$pw2 = $credit['app']->workerByToken($person['token']);
$low = '{"k":1}';
$high = '{"k":2}';
$credit['app']->ingestDesigns($pw2, [[
    'taskId' => 'coincidence', 'taskVersion' => 'base-1', 'genomeJson' => $low, 'genomeHash' => hash('sha256', $low),
    'metrics' => ['quality' => 0.2, 'heldOut' => 0.2, 'train' => 0.2], 'neurons' => 1, 'synapses' => 1, 'spikes' => 1, 'evalMs' => 1000, 'seed' => 1, 'jobId' => 'credit-job',
]], $credit['app']->protocolHash());
$credit['app']->ingestDesigns($pw2, [[
    'taskId' => 'sequence', 'taskVersion' => 'base-1', 'genomeJson' => $high, 'genomeHash' => hash('sha256', $high),
    'metrics' => ['quality' => 0.9, 'heldOut' => 0.9, 'train' => 0.9], 'neurons' => 1, 'synapses' => 1, 'spikes' => 1, 'evalMs' => 3600000, 'seed' => 2, 'jobId' => 'credit-job',
]], $credit['app']->protocolHash());
$feed = $credit['app']->highlights([$person['workerId']]);
$feedText = '';
foreach ($feed as $event) {
    $feedText .= $event['detail'] . ' ';
}
check(strpos($feedText, 'New best') !== false && strpos($feedText, 'moved up') !== false && strpos($feedText, '1 hours') !== false, 'highlights include a best, a promotion, and an hour milestone');
check($credit['app']->creditName($pw2) === 'pat-pc', 'credit uses the computer name by default');
$credit['app']->setCredit($person['participantId'], false);
$hidden = $credit['app']->db->prepare('SELECT name, public_credit FROM workers WHERE id = ?');
$hidden->execute([$person['workerId']]);
check($credit['app']->creditName($hidden->fetch()) === 'Anonymous', 'opt-out credit shows Anonymous');
$board = $credit['app']->leaderboard(5);
check($board && $board[0]['name'] === 'Anonymous' && $board[0]['records'] === 2, 'the leaderboard respects the opt-out');
$credit['app']->setGenomePublic(hash('sha256', $high), true);
$pub = $credit['app']->designGenome(hash('sha256', $high));
check($pub && (int) $pub['is_public'] === 1, 'the owner can mark a genome public');

// t48u: removing revoked computers keeps their history.
$credit['app']->setCredit($person['participantId'], true);
$other = $credit['app']->enroll('still-on', ['spikefoundry'], 2, true);
check($credit['app']->removeRevoked($person['workerId']) === false && $credit['app']->removeRevoked($other['workerId']) === false, 'an active computer cannot be removed');
$credit['app']->revoke($person['workerId']);
$credit['app']->db->prepare('INSERT INTO worker_diagnostics (worker_id, kind, ok, summary, body_json, created_at) VALUES (?, ?, 1, ?, ?, ?)')->execute([$person['workerId'], 'startup', 'x', '{}', $credit['app']->now()]);
$recBefore = (int) $credit['app']->db->query('SELECT COUNT(*) FROM design_records')->fetchColumn();
$gone = $credit['app']->removeRevokedOnce();
$again = $credit['app']->removeRevokedOnce();
$row = $credit['app']->db->prepare('SELECT name, revoked, removed_at FROM workers WHERE id = ?');
$row->execute([$person['workerId']]);
$tomb = $row->fetch();
$diag = (int) $credit['app']->db->query('SELECT COUNT(*) FROM worker_diagnostics WHERE worker_id = ' . $credit['app']->db->quote($person['workerId']))->fetchColumn();
$board2 = $credit['app']->leaderboard(5);
$disc = json_encode($credit['app']->discoveries());
check($gone['ran'] && $gone['removed'] === ['pat-pc'] && !$again['ran'] && $tomb && $tomb['name'] === 'pat-pc' && !empty($tomb['removed_at']) && $diag === 0, 'the one-time cleanup removes only revoked computers, once, keeping a tombstone with the name');
check((int) $credit['app']->db->query('SELECT COUNT(*) FROM design_records')->fetchColumn() === $recBefore && $board2 && $board2[0]['name'] === 'pat-pc' && strpos($disc, 'pat-pc') !== false && $credit['app']->creditName($pw2) === 'pat-pc', 'design records, the leaderboard, Discoveries and credit still show a removed computer');
check($credit['app']->removeRevoked($person['workerId']) === false && $credit['app']->workerByToken($person['token']) === null, 'removing twice does nothing and a removed computer still cannot sign in');

$supply = lab();
$sw = $supply['app']->enroll('supply-pc', ['spikefoundry', 'bugbrain'], 2, true);
$supply['db']->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([$supply['clock']->t, $sw['workerId']]);
$supply['db']->exec("UPDATE projects SET auto_jobs = 1 WHERE id = 'spikefoundry'");
$got = $supply['app']->claim($supply['app']->workerByToken($sw['token']));
$auto = (int) $supply['db']->query("SELECT auto_created FROM projects WHERE id = 'spikefoundry'")->fetchColumn();
$spec = json_decode((string) $supply['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $supply['db']->quote((string) $got['id']))->fetchColumn(), true);
$bbQueued = (int) $supply['db']->query("SELECT COUNT(*) FROM jobs WHERE project_id = 'bugbrain'")->fetchColumn();
check($got && $got['project'] === 'spikefoundry' && $spec['mode'] === 'propose' && (int) $spec['evals'] === 0 && (int) $spec['targetSeconds'] === 180 && (int) $spec['keepTop'] === 50 && (int) $spec['keepRandom'] === 500 && $auto === 1 && $bbQueued === 0, 'an empty SpikeFoundry queue grows one propose job and BugBrain stays off');
$second = $supply['app']->claim($supply['app']->workerByToken($sw['token']));
$jobsAfter = (int) $supply['db']->query("SELECT COUNT(*) FROM jobs WHERE project_id = 'spikefoundry'")->fetchColumn();
$autoAfter = (int) $supply['db']->query("SELECT auto_created FROM projects WHERE id = 'spikefoundry'")->fetchColumn();
check(($second === null || (string) $second['id'] === (string) $got['id']) && $jobsAfter === 1 && $autoAfter === 1, 'supply does not add another job until the throttle window passes');
$supply['clock']->t = gmdate('c', strtotime($supply['clock']->t) + 20);
$supply['app']->saveSupply('spikefoundry', true, 2, 2, 12);
$id = substr(hash('sha256', 'spikefoundry|coincidence'), 0, 32);
$supply['db']->prepare('REPLACE INTO task_policies (id, project_id, task_id, stall_delta, stall_evals, stall_hours, stall_action, paused, pause_reason, advanced_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    ->execute([$id, 'spikefoundry', 'coincidence', 0.005, 3000, 6, 'pause', 1, 'stall', 'sequence']);
$again = $supply['app']->claim($supply['app']->workerByToken($sw['token']));
$againSpec = $again ? json_decode((string) $supply['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $supply['db']->quote((string) $again['id']))->fetchColumn(), true) : [];
check($again && $againSpec['taskId'] === 'sequence' && (int) $againSpec['evals'] === 12, 'auto jobs skip a paused task and use the next level');

$lfText = "computelab-protocol-2\nkeep this line\n";
$crlfPath = sys_get_temp_dir() . '/computelab-protocol-crlf.txt';
$lfPath = sys_get_temp_dir() . '/computelab-protocol-lf.txt';
file_put_contents($lfPath, $lfText);
file_put_contents($crlfPath, str_replace("\n", "\r\n", $lfText));
$lfApp = new App($db, array_merge($config, ['protocol' => $lfPath]), static function () use (&$now): string { return $now; });
$crlfApp = new App($db, array_merge($config, ['protocol' => $crlfPath]), static function () use (&$now): string { return $now; });
check($lfApp->protocolHash() === $crlfApp->protocolHash(), 'a CRLF protocol file hashes the same as the LF file');

$pins = lab();
$legacy = '4b0e21855d9ce104a96633047e8199874524044d399c6150d02eb77e4edca4c4';
$currentHash = $pins['app']->protocolHash();
$staleJob = $pins['app']->createJob('sf-vision', 'Stale hash job', 0.2, 9);
$finished = $pins['app']->createJob('bb-order3', 'Finished old hash', 0.2, 10);
$pins['db']->prepare('UPDATE templates SET code_hash = ? WHERE id IN (?, ?)')->execute([$legacy, 'sf-vision', 'bb-order3']);
$pins['db']->prepare('UPDATE jobs SET code_hash = ? WHERE id = ?')->execute([$legacy, $staleJob]);
$pins['db']->prepare("UPDATE jobs SET code_hash = ?, status = 'done' WHERE id = ?")->execute([$legacy, $finished]);
$changedPins = $pins['app']->refreshProtocolPins();
$visionHash = (string) $pins['db']->query("SELECT code_hash FROM templates WHERE id = 'sf-vision'")->fetchColumn();
$orderHash = (string) $pins['db']->query("SELECT code_hash FROM templates WHERE id = 'bb-order3'")->fetchColumn();
$queuedHash = (string) $pins['db']->query('SELECT code_hash FROM jobs WHERE id = ' . $pins['db']->quote($staleJob))->fetchColumn();
$doneHash = (string) $pins['db']->query('SELECT code_hash FROM jobs WHERE id = ' . $pins['db']->quote($finished))->fetchColumn();
check($changedPins >= 3 && $visionHash === $currentHash && $orderHash === $currentHash && $queuedHash === $currentHash && $doneHash === $legacy, 'old accepted template and queued hashes move to the current protocol');
check($pins['app']->refreshProtocolPins() === 0, 'refreshing protocol pins a second time changes nothing');
$pins['db']->prepare('UPDATE templates SET code_hash = ? WHERE id = ?')->execute([$legacy, 'sf-propose']);
$stamped = $pins['app']->createJob('sf-propose', 'New from old template', 0.2, 11);
$stampedHash = (string) $pins['db']->query('SELECT code_hash FROM jobs WHERE id = ' . $pins['db']->quote($stamped))->fetchColumn();
check($stampedHash === $currentHash, 'a new job is stamped with the current protocol hash');

$blocked = false;
try {
    $app->ingestDesigns($worker, [[
        'taskId' => 'coincidence', 'taskVersion' => 'base-1', 'genomeJson' => '{"v":2,"old":1}', 'genomeHash' => hash('sha256', '{"v":2,"old":1}'),
        'genomeVersion' => 2, 'metrics' => ['quality' => 0.744, 'arm' => 'designer'], 'neurons' => 8, 'synapses' => 14, 'spikes' => 15,
        'evalMs' => 1, 'seed' => 1, 'jobId' => 'sf-propose-1-old', 'engineVersion' => 'spikefoundry-designer-1',
    ]], $app->protocolHash());
} catch (InvalidArgumentException $e) {
    $blocked = strpos($e->getMessage(), 'spikefoundry-designer-1') !== false;
}
check($blocked, 'a placeholder designer upload is rejected');

$clean = lab();
$clean['db']->exec("DELETE FROM supply_state WHERE id = 'purge-designer-1'");
$oldPc = $clean['app']->enroll('old-pc', ['spikefoundry'], 2, true);
$oldWorker = $clean['app']->workerByToken($oldPc['token']);
$keepPc = $clean['app']->enroll('keep-pc', ['spikefoundry'], 2, true);
$keepWorker = $clean['app']->workerByToken($keepPc['token']);
$stamp = $clean['clock']->t;
$insertGenome = $clean['db']->prepare('INSERT INTO design_genomes (hash, genome_json, version, created_at) VALUES (?, ?, ?, ?)');
$insertRecord = $clean['db']->prepare('INSERT INTO design_records (id, genome_hash, task_id, task_version, score_json, neurons, synapses, spikes, eval_ms, engine_version, protocol_hash, worker_id, seed, job_id, arm, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
$oldJson = '{"v":2,"old":1}';
$oldHash = hash('sha256', $oldJson);
$keepJson = '{"v":2,"keep":1}';
$keepHash = hash('sha256', $keepJson);
$midJson = '{"v":2,"mid":1}';
$midHash = hash('sha256', $midJson);
$sigJson = '{"v":1,"sig":1}';
$sigHash = hash('sha256', $sigJson);
$insertGenome->execute([$oldHash, $oldJson, 2, $stamp]);
$insertGenome->execute([$keepHash, $keepJson, 2, $stamp]);
$insertGenome->execute([$midHash, $midJson, 2, $stamp]);
$insertGenome->execute([$sigHash, $sigJson, 1, $stamp]);
$insertRecord->execute(['old-row', $oldHash, 'coincidence', 'base-1', '{"quality":0.744,"heldOut":0.744,"train":0.744,"arm":"designer"}', 8, 14, 15, 1, 'spikefoundry-designer-1', 'abc', $oldWorker['id'], 1, 'sf-propose-1-old', 'designer', 1, $stamp]);
$insertRecord->execute(['keep-row', $keepHash, 'coincidence', 'base-1', '{"quality":0.744,"heldOut":0.744,"train":0.744,"arm":"designer"}', 8, 14, 4, 1, 'spikefoundry-designer-3', 'abc', $keepWorker['id'], 2, 'sf-propose-3-new', 'designer', 2, $stamp]);
$insertRecord->execute(['mid-row', $midHash, 'coincidence', 'base-1', '{"quality":0.5,"heldOut":0.5,"train":0.5,"arm":"designer"}', 9, 20, 4, 1, 'spikefoundry-designer-2', 'abc', $oldWorker['id'], 4, 'sf-propose-2-mid', 'designer', 4, $stamp]);
$insertRecord->execute(['sig-row', $sigHash, 'coincidence', 'base-1', '{"quality":0.744,"arm":"designer"}', 8, 14, 15, 1, 'spikefoundry-1', 'abc', $keepWorker['id'], 3, 'sf-vision-3-sig', 'designer', 3, $stamp]);
$clean['db']->prepare('INSERT INTO design_events (id, worker_id, task_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')->execute(['evt-old', $oldWorker['id'], 'coincidence', 'best', 'New best design on coincidence', $stamp]);
$clean['db']->prepare('INSERT INTO model_checkpoints (id, label, body_json, metric_json, created_at) VALUES (?, ?, ?, ?, ?)')->execute(['ckpt-old', 'designer', '{"format":"spikefoundry-designer","spearman":0.1}', '{}', $stamp]);
$clean['db']->prepare('INSERT INTO model_checkpoints (id, label, body_json, metric_json, created_at) VALUES (?, ?, ?, ?, ?)')->execute(['ckpt-new', 'designer', '{"format":"spikefoundry-designer","designerVersion":"spikefoundry-designer-3"}', '{}', $stamp]);
$clean['db']->prepare('INSERT INTO model_checkpoints (id, label, body_json, metric_json, created_at) VALUES (?, ?, ?, ?, ?)')->execute(['ckpt-mid', 'designer', '{"format":"spikefoundry-designer","designerVersion":"spikefoundry-designer-2"}', '{}', $stamp]);
$removed = $clean['app']->purgePlaceholderDesigns();
$sigLeft = (int) $clean['db']->query("SELECT COUNT(*) FROM design_records WHERE id = 'sig-row'")->fetchColumn();
$keepLeft = (int) $clean['db']->query("SELECT COUNT(*) FROM design_records WHERE id = 'keep-row'")->fetchColumn();
$oldLeft = (int) $clean['db']->query("SELECT COUNT(*) FROM design_records WHERE id = 'old-row'")->fetchColumn();
check($removed === 1 && $oldLeft === 0 && $keepLeft === 1 && $sigLeft === 1, 'only the designer-1 stamp is removed, not a real score that happens to look similar');
$clean['db']->exec("DELETE FROM supply_state WHERE id = 'purge-designer-2'");
$removed2 = $clean['app']->purgeDesigner2();
$midLeft = (int) $clean['db']->query("SELECT COUNT(*) FROM design_records WHERE id = 'mid-row'")->fetchColumn();
$keepLeft = (int) $clean['db']->query("SELECT COUNT(*) FROM design_records WHERE id = 'keep-row'")->fetchColumn();
$eventLeft = (int) $clean['db']->query("SELECT COUNT(*) FROM design_events WHERE id = 'evt-old'")->fetchColumn();
$oldCkpt = (int) $clean['db']->query("SELECT COUNT(*) FROM model_checkpoints WHERE id = 'ckpt-old'")->fetchColumn();
$midCkpt = (int) $clean['db']->query("SELECT COUNT(*) FROM model_checkpoints WHERE id = 'ckpt-mid'")->fetchColumn();
$newCkpt = (int) $clean['db']->query("SELECT COUNT(*) FROM model_checkpoints WHERE id = 'ckpt-new'")->fetchColumn();
$note = (string) $clean['db']->query("SELECT note FROM supply_state WHERE id = 'purge-designer-2'")->fetchColumn();
check($removed2 === 1 && $midLeft === 0 && $keepLeft === 1 && $eventLeft === 0 && $midCkpt === 0 && $newCkpt === 1 && $oldCkpt === 0 && strpos($note, 'spikefoundry-designer-2') !== false, 'designer-2 rows are purged once and designer-3 rows stay');
check($clean['app']->purgeDesigner2() === 0, 'the designer-2 purge does not run a second time');
$real = [
    'taskId' => 'coincidence', 'taskVersion' => 'base-1', 'genomeJson' => '{"v":2,"real":1}', 'genomeHash' => hash('sha256', '{"v":2,"real":1}'),
    'genomeVersion' => 2, 'metrics' => ['quality' => 0.744, 'heldOut' => 0.744, 'train' => 0.744, 'arm' => 'designer'],
    'neurons' => 8, 'synapses' => 14, 'spikes' => 15, 'evalMs' => 1, 'seed' => 1, 'jobId' => 'sf-propose-3-real', 'engineVersion' => 'spikefoundry-designer-3',
];
$accepted = $clean['app']->ingestDesigns($keepWorker, [$real], $clean['app']->protocolHash());
$blocked2 = false;
try {
    $clean['app']->ingestDesigns($keepWorker, [array_merge($real, ['engineVersion' => 'spikefoundry-designer-2', 'genomeJson' => '{"v":2,"old2":1}', 'genomeHash' => hash('sha256', '{"v":2,"old2":1}')])], $clean['app']->protocolHash());
} catch (InvalidArgumentException $e) {
    $blocked2 = strpos($e->getMessage(), 'spikefoundry-designer-2') !== false;
}
check($accepted['stored'] === 1 && $blocked2, 'designer-3 records are accepted even at 8 neurons and quality 0.744, and designer-2 is refused');
$clean['app']->ingestSummary($keepWorker, [
    'taskId' => 'coincidence', 'jobId' => 'sf-propose-3-sum', 'engineVersion' => 'spikefoundry-designer-3',
    'evals' => 4000, 'designerEvals' => 3600, 'randomEvals' => 400, 'evalMs' => 180000,
    'bestHeld' => 0.5, 'bestTrain' => 0.5, 'designerMean' => 0.42, 'randomMean' => 0.2,
    'histogram' => [0, 0, 0, 0, 4000],
    'curve' => [
        ['n' => 1, 'held' => 0.2, 'train' => 0.2, 'bestHeld' => 0.2, 'bestTrain' => 0.2],
        ['n' => 4000, 'held' => 0.5, 'train' => 0.5, 'bestHeld' => 0.5, 'bestTrain' => 0.5],
    ],
]);
$series = $clean['app']->taskSeries('coincidence', 80);
$health = $clean['app']->designerHealthForTask('coincidence');
check($series && (int) $series[count($series) - 1]['n'] >= 4000 && $health && strpos($health['label'], 'beating random') !== false, 'plateau charts count evaluations from the job summary');

$solve = lab();
$solveReg = $solve['app']->enroll('solve-pc', ['spikefoundry'], 2, true);
$solveWorker = $solve['app']->workerByToken($solveReg['token']);
$solve['db']->exec("UPDATE projects SET auto_jobs = 1 WHERE id = 'spikefoundry'");
$queuedId = $solve['app']->createJob('sf-propose', 'Auto coincidence', 0.6, 77, ['taskId' => 'coincidence', 'mode' => 'propose', 'seedGenomes' => ['abc']]);
$manualId = $solve['app']->createJob('sf-propose', 'Owner coincidence run', 0.6, 78, ['taskId' => 'coincidence', 'mode' => 'propose']);
$flatSummary = function (string $job, float $best) {
    return [
        'taskId' => 'coincidence', 'jobId' => $job, 'engineVersion' => 'spikefoundry-designer-3',
        'evals' => 500000, 'designerEvals' => 450000, 'randomEvals' => 50000, 'evalMs' => 180000,
        'bestHeld' => $best, 'bestTrain' => $best, 'designerMean' => 0.24, 'randomMean' => 0.12, 'histogram' => [1, 2, 3],
        'curve' => [
            ['n' => 1, 'held' => 0.5, 'train' => 0.5, 'bestHeld' => $best, 'bestTrain' => $best],
            ['n' => 250000, 'held' => 0.3, 'train' => 0.3, 'bestHeld' => $best, 'bestTrain' => $best],
            ['n' => 500000, 'held' => 0.2, 'train' => 0.2, 'bestHeld' => $best, 'bestTrain' => $best],
        ],
    ];
};
$solve['app']->ingestSummary($solveWorker, $flatSummary('sf-propose-1-a', 0.982));
$solve['app']->ingestSummary($solveWorker, $flatSummary('sf-propose-2-b', 0.982));
check(!$solve['app']->taskPaused('spikefoundry', 'coincidence'), 'a high flat score with fewer job summaries than required does not advance yet');
$solve['app']->ingestSummary($solveWorker, $flatSummary('sf-propose-3-c', 0.982));
$solvedPolicy = $solve['app']->taskPolicy('spikefoundry', 'coincidence');
$movedSpec = json_decode((string) $solve['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $solve['db']->quote($queuedId))->fetchColumn(), true);
$movedTitle = (string) $solve['db']->query('SELECT title FROM jobs WHERE id = ' . $solve['db']->quote($queuedId))->fetchColumn();
$manualSpec = json_decode((string) $solve['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $solve['db']->quote($manualId))->fetchColumn(), true);
$advanceNote = (string) $solve['db']->query("SELECT note FROM supply_state WHERE id = 'advance-coincidence'")->fetchColumn();
check($solvedPolicy['paused'] === 1 && $solvedPolicy['pause_reason'] === 'solved' && $solvedPolicy['advanced_to'] === 'sequence' && $solvedPolicy['stall_action'] === 'flag', 'a solved task advances by default without waiting for the stall window');
check($movedSpec['taskId'] === 'sequence' && !isset($movedSpec['seedGenomes']) && $movedTitle === 'Auto sequence' && $manualSpec['taskId'] === 'coincidence' && strpos($advanceNote, 'solved at held-out 0.982') !== false && strpos($advanceNote, 'sequence') !== false, 'queued auto jobs move to the next task and the advance is noted');
$solve['db']->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([$solve['clock']->t, $solveReg['workerId']]);
$nextJob = $solve['app']->claim($solve['app']->workerByToken($solveReg['token']));
$nextSpec = $nextJob ? json_decode((string) $solve['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $solve['db']->quote((string) $nextJob['id']))->fetchColumn(), true) : [];
check($nextJob && $nextSpec['taskId'] === 'sequence', 'claims after the advance get the next task');
$solve['app']->saveTaskPolicy('spikefoundry', 'coincidence', 0.005, 3000, 6, 'flag', false, 0.97, 3);
check(!$solve['app']->taskPaused('spikefoundry', 'coincidence') && (int) $solve['app']->taskPolicy('spikefoundry', 'coincidence')['auto_advance'] === 0, 'turning auto-advance off returns a solved task to supply');
$solve['app']->saveTaskPolicy('spikefoundry', 'coincidence', 0.005, 3000, 6, 'flag', true, 0.99, 3);
check(!$solve['app']->taskPaused('spikefoundry', 'coincidence'), 'a solved score above the best held-out score keeps the task active');
$solve['app']->saveTaskPolicy('spikefoundry', 'coincidence', 0.005, 3000, 6, 'flag', true, 0.97, 3);
check($solve['app']->taskPaused('spikefoundry', 'coincidence') && $solve['app']->nextCurriculumTask('scenario-control') === '' && !in_array('digits', App::CURRICULUM, true), 'the default threshold advances again, and the last designer task has no next step');
$solve['app']->ingestDesigns($solveWorker, [designRecord('{"arm":"solved","n":1}', 90, 0.982, 0.982, 'designer', 1000)], $solve['app']->protocolHash());
$ownerHtml = implode('', taskHealthSection($solve['app'], 'csrf-x', '/computelab'));
check(strpos($ownerHtml, 'name="auto_advance" value="1" checked') !== false && strpos($ownerHtml, 'name="solve_score"') !== false && strpos($ownerHtml, 'Solved. Jobs moved on automatically.') !== false && strpos($ownerHtml, 'Next level: sequence') !== false, 'the owner console shows the solved state and the per-task auto-advance settings');
$bigEvals = $flatSummary('sf-propose-4-d', 0.5);
$bigEvals['taskId'] = 'sequence';
$bigEvals['evals'] = 5000000;
$solve['app']->ingestSummary($solveWorker, $bigEvals);
check((int) $solve['db']->query("SELECT COUNT(*) FROM design_summaries WHERE job_id = 'sf-propose-4-d'")->fetchColumn() === 1, 'a summary from a long time-budget job with millions of evaluations is accepted');

$two = lab();
$twoReg = $two['app']->enroll('two-pc', ['spikefoundry'], 2, true);
$twoSeen = function () use ($two, $twoReg) {
    $two['db']->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([$two['clock']->t, $twoReg['workerId']]);
    return $two['app']->workerByToken($twoReg['token']);
};
$two['app']->saveSupply('spikefoundry', false, 1, 1, 0);
$two['app']->createJob('sf-propose', 'Left behind', 0.9, 551402, ['taskId' => 'sequence', 'mode' => 'propose']);
$two['app']->createJob('sf-propose', 'Next run', 0.5, 601809, ['taskId' => 'sequence', 'mode' => 'propose']);
$oldRun = $two['app']->claim($twoSeen());
$two['clock']->t = gmdate('c', strtotime($two['clock']->t) + 60);
$newRun = $two['app']->claim($twoSeen());
$twoBeat = $two['app']->heartbeat($twoSeen());
$oldRow = $two['db']->query('SELECT status, attempts FROM jobs WHERE id = ' . $two['db']->quote((string) $oldRun['id']))->fetch();
$leaseCount = (int) $two['db']->query('SELECT COUNT(*) FROM leases')->fetchColumn();
check($oldRun && $newRun && (string) $newRun['id'] !== (string) $oldRun['id'] && $twoBeat['jobId'] === (string) $newRun['id'] && $leaseCount === 1 && (string) $oldRow['status'] === 'queued' && (int) $oldRow['attempts'] === 1, 'a restarted computer that claims again drops its old lease, and the heartbeat follows the new job');

$gap = lab();
$gapReg = $gap['app']->enroll('gap-pc', ['spikefoundry'], 2, true);
$gapSeen = function () use ($gap, $gapReg) {
    $gap['db']->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([$gap['clock']->t, $gapReg['workerId']]);
    return $gap['app']->workerByToken($gapReg['token']);
};
$gap['app']->saveSupply('spikefoundry', false, 1, 1, 0);
$staleId = $gap['app']->createJob('sf-propose', 'Auto coincidence', 0.6, 91, ['taskId' => 'coincidence', 'mode' => 'propose', 'seedGenomes' => ['old']]);
$leasedJob = $gap['app']->claim($gapSeen());
$gapPolicy = substr(hash('sha256', 'spikefoundry|coincidence'), 0, 32);
$gap['db']->prepare('REPLACE INTO task_policies (id, project_id, task_id, stall_delta, stall_evals, stall_hours, stall_action, paused, pause_reason, advanced_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    ->execute([$gapPolicy, 'spikefoundry', 'coincidence', 0.005, 3000, 6, 'flag', 1, 'solved', 'sequence']);
$gap['app']->saveSupply('spikefoundry', true, 1, 1, 0);
$gap['clock']->t = gmdate('c', strtotime($gap['clock']->t) + 4000);
$afterExpiry = $gap['app']->claim($gapSeen());
$staleSpec = json_decode((string) $gap['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $gap['db']->quote($staleId))->fetchColumn(), true);
$afterSpec = $afterExpiry ? json_decode((string) $gap['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $gap['db']->quote((string) $afterExpiry['id']))->fetchColumn(), true) : [];
check($leasedJob && (string) $leasedJob['id'] === $staleId && $staleSpec['taskId'] === 'sequence' && !isset($staleSpec['seedGenomes']) && $afterExpiry && $afterSpec['taskId'] === 'sequence', 'an auto job whose lease expires on a solved task moves to the next task and is claimed again');
$gap['clock']->t = gmdate('c', strtotime($gap['clock']->t) + 4000);
$gap['db']->exec("UPDATE jobs SET status = 'done' WHERE status IN ('queued', 'leased')");
$gap['db']->exec('DELETE FROM leases');
$ownerJob = $gap['app']->createJob('sf-propose', 'Owner coincidence run', 0.6, 92, ['taskId' => 'coincidence', 'mode' => 'propose']);
$madeBefore = (int) $gap['db']->query("SELECT auto_created FROM projects WHERE id = 'spikefoundry'")->fetchColumn();
$fresh = $gap['app']->claim($gapSeen());
$freshSpec = $fresh ? json_decode((string) $gap['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $gap['db']->quote((string) $fresh['id']))->fetchColumn(), true) : [];
$ownerSpec = json_decode((string) $gap['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $gap['db']->quote($ownerJob))->fetchColumn(), true);
$madeAfter = (int) $gap['db']->query("SELECT auto_created FROM projects WHERE id = 'spikefoundry'")->fetchColumn();
check($fresh && $freshSpec['taskId'] === 'sequence' && $ownerSpec['taskId'] === 'coincidence' && $madeAfter === $madeBefore + 1 && $gap['app']->claimableQueued('spikefoundry') === 0, 'a queued job for a paused task does not count toward the queue, so supply still adds a next-task job');

/* ---- Resource control: Off / Allowance / Full blast, several job slots ---- */
$res = lab();
$resOn = $res['app']->enroll('res-on', ['spikefoundry'], 20, true);
$resOff = $res['app']->enroll('res-off', ['spikefoundry'], 20, true);
check((string) $res['db']->query("SELECT resource_mode || ':' || allowance_pct FROM workers WHERE id = " . $res['db']->quote($resOn['workerId']))->fetchColumn() === 'allowance:50', 'a new computer starts in Allowance at 50%');
$res['db']->prepare('UPDATE workers SET paused = 1 WHERE id = ?')->execute([$resOff['workerId']]);
foreach (['resource_mode', 'allowance_pct', 'runtime_json'] as $col) {
    $res['db']->exec('ALTER TABLE workers DROP COLUMN ' . $col);
}
$res['app']->migrate();
$modes = [];
foreach ($res['db']->query('SELECT id, resource_mode FROM workers')->fetchAll() as $row) {
    $modes[(string) $row['id']] = (string) $row['resource_mode'];
}
check(($modes[$resOn['workerId']] ?? '') === 'full' && ($modes[$resOff['workerId']] ?? '') === 'off', 'upgrading keeps what each computer did: On becomes Full blast and Off stays Off');
$res['app']->setResources($resOn['workerId'], 'allowance', 73);
$w = $res['app']->workerByToken($resOn['token']);
check($res['app']->resourcesOf($w)['mode'] === 'allowance' && $res['app']->resourcesOf($w)['allowancePct'] === 70 && App::clampAllowance(3) === 10 && App::clampAllowance(100) === 90, 'the allowance is kept between 10% and 90% in steps of 10');
$res['app']->createJob('sf-vision', 'Slot A', 1, 41);
$res['app']->createJob('sf-vision', 'Slot B', 1, 42);
$a = $res['app']->claim($w, 0);
$b = $res['app']->claim($res['app']->workerByToken($resOn['token']), 1);
$leaseCount = (int) $res['db']->query('SELECT COUNT(*) FROM leases WHERE worker_id = ' . $res['db']->quote($resOn['workerId']))->fetchColumn();
check($a && $b && $a['id'] !== $b['id'] && $b['slot'] === 1 && $leaseCount === 2, 'one computer can hold one job per slot');
$before = (string) $res['db']->query('SELECT until_at FROM leases WHERE job_id = ' . $res['db']->quote((string) $a['id']))->fetchColumn();
$res['clock']->t = gmdate('c', strtotime($res['clock']->t) + 30);
$ctl = $res['app']->heartbeat($w, ['control' => true, 'runtime' => ['mode' => 'allowance', 'pct' => 70, 'slots' => 3, 'cores' => 4, 'duty' => 0.933, 'priority' => 'low', 'running' => 2, 'token' => 'x']]);
$after = (string) $res['db']->query('SELECT until_at FROM leases WHERE job_id = ' . $res['db']->quote((string) $a['id']))->fetchColumn();
$rt = json_decode((string) $res['db']->query('SELECT runtime_json FROM workers WHERE id = ' . $res['db']->quote($resOn['workerId']))->fetchColumn(), true);
check($ctl['resources'] === ['mode' => 'allowance', 'allowancePct' => 70, 'maxJobs' => 0] && $ctl['jobId'] === null && $before === $after && ($rt['slots'] ?? 0) === 3 && !isset($rt['token']), 'a control check-in reads the setting and saves what the worker applied, without renewing a lease');
$res['app']->setResources($resOn['workerId'], 'allowance', null, 3);
$ctl3 = $res['app']->heartbeat($res['app']->workerByToken($resOn['token']), ['control' => true, 'runtime' => ['mode' => 'allowance', 'pct' => 70, 'slots' => 3, 'cores' => 4, 'maxJobs' => 3]]);
$rt3 = json_decode((string) $res['db']->query('SELECT runtime_json FROM workers WHERE id = ' . $res['db']->quote($resOn['workerId']))->fetchColumn(), true);
check($ctl3['resources'] === ['mode' => 'allowance', 'allowancePct' => 70, 'maxJobs' => 3] && ($rt3['maxJobs'] ?? null) === 3, 'Experiments at once is saved per computer, sent on the check-in, and the applied value is recorded');
$res['app']->setResources($resOn['workerId'], 'full', null, null);
$keep = $res['app']->resourcesOf($res['app']->workerByToken($resOn['token']));
$res['app']->setResources($resOn['workerId'], 'allowance', 70, 500);
$big = $res['app']->resourcesOf($res['app']->workerByToken($resOn['token']));
$res['app']->setResources($resOn['workerId'], 'allowance', 70, 0);
$auto = $res['app']->resourcesOf($res['app']->workerByToken($resOn['token']));
check($keep['maxJobs'] === 3 && $keep['mode'] === 'full' && $big['maxJobs'] === 64 && $auto['maxJobs'] === 0 && App::clampMaxJobs(-4) === 0, 'changing the mode keeps Experiments at once, numbers are capped at 64, and 0 is Auto');
$beatB = $res['app']->heartbeat($w, ['jobId' => (string) $b['id'], 'progress' => 40]);
check($beatB['jobId'] === (string) $b['id'] && (int) $res['db']->query('SELECT progress FROM leases WHERE job_id = ' . $res['db']->quote((string) $b['id']))->fetchColumn() === 40, 'a job heartbeat renews exactly that job');
$res['app']->setResources($resOn['workerId'], 'off');
check($res['app']->claim($res['app']->workerByToken($resOn['token']), 2) === null && (int) $res['db']->query('SELECT COUNT(*) FROM leases WHERE worker_id = ' . $res['db']->quote($resOn['workerId']))->fetchColumn() === 2, 'Off takes no new job and lets running jobs finish');
$res['app']->setResources($resOn['workerId'], 'full');
$res['app']->heartbeat($res['app']->workerByToken($resOn['token']), ['control' => true, 'reset' => true]);
check((int) $res['db']->query('SELECT COUNT(*) FROM leases WHERE worker_id = ' . $res['db']->quote($resOn['workerId']))->fetchColumn() === 0, 'a restarted worker hands back the jobs it held');

$idx = lab();
$names = [];
foreach ($idx['db']->query('PRAGMA index_list(design_records)')->fetchAll() as $row) {
    $names[] = (string) $row['name'];
}
$idx['app']->migrate();
$again = [];
foreach ($idx['db']->query('PRAGMA index_list(design_records)')->fetchAll() as $row) {
    $again[] = (string) $row['name'];
}
check(count(array_intersect(['idx_dr_seq', 'idx_dr_task_seq', 'idx_dr_worker_task', 'idx_dr_engine_task'], $names)) === 4 && count($again) === count($names), 'design records are indexed for uploads and pages, and a second upgrade adds nothing');
$iw = $idx['app']->enroll('batch-pc', ['spikefoundry'], 2, true);
$iworker = $idx['app']->workerByToken($iw['token']);
$batch = [];
for ($i = 0; $i < 12; $i++) {
    $batch[] = designRecord('{"arm":"batch","n":' . $i . '}', 500 + $i, 0.1 + $i / 100, 0.1 + $i / 100, 'designer', 400000);
}
$idx['app']->ingestDesigns($iworker, $batch, $idx['app']->protocolHash());
$tenth = (int) $idx['db']->query("SELECT COUNT(*) FROM design_events WHERE worker_id = " . $idx['db']->quote((string) $iworker['id']) . " AND kind = 'evals' AND detail = '10 evaluations'")->fetchColumn();
$hour = (int) $idx['db']->query("SELECT COUNT(*) FROM design_events WHERE worker_id = " . $idx['db']->quote((string) $iworker['id']) . " AND kind = 'hours' AND detail = '1 hours donated'")->fetchColumn();
check($tenth === 1 && $hour === 1, 'milestones counted within one upload batch still fire once (10 evaluations, 1 hour donated)');

// t44u: one entry per distinct design, repeats counted as confirmations, unique job seeds.
check(App::designHash('{"modules":[{"id":"in","kind":"input","leak":0.8,"motif":"feedforward","n":5,"sign":1,"thr":1},{"id":"e","kind":"lif","leak":0.3409,"motif":"coincidence","n":1,"sign":1,"thr":2.0069},{"id":"i","kind":"lif","leak":0.7961,"motif":"wta","n":1,"sign":-1,"thr":2.4083},{"id":"out","kind":"output","leak":0.8,"motif":"feedforward","n":1,"sign":1,"thr":1.0}],"v":2,"wires":[{"delay":0,"from":"in","pattern":"all","to":"e","weight":0.8},{"delay":2,"from":"e","pattern":"one","to":"i","weight":-0.1636},{"delay":1,"from":"i","pattern":"lateral","to":"e","weight":1.8566},{"delay":0,"from":"e","pattern":"feedforward","to":"out","weight":1}]}') === '55099528cf18e80b3abafe79a78032bbe43b0bb6b258768a1056e10ab8976b33', 'PHP and the worker compute the same canonical design hash');
$dd = lab();
$wa = $dd['app']->workerByToken($dd['app']->enroll('find-a', ['spikefoundry'], 2, true)['token']);
$wb = $dd['app']->workerByToken($dd['app']->enroll('find-b', ['spikefoundry'], 2, true)['token']);
$gA = '{"modules":[{"id":"a","n":1},{"id":"b","n":2}],"v":2,"wires":[{"from":"a","to":"b","weight":0.5}]}';
$gB = '{"modules":[{"id":"b","n":2},{"id":"a","n":1}],"v":2,"wires":[{"from":"a","to":"b","weight":0.5}]}';
$recA = designRecord($gA, 31, 0.6, 0.6, 'designer', 5); $recA['jobId'] = 'job-a';
$recB = designRecord($gB, 32, 0.6, 0.6, 'designer', 5); $recB['jobId'] = 'job-b';
$r1 = $dd['app']->ingestDesigns($wa, [$recA], $dd['app']->protocolHash());
$dd['clock']->t = '2026-11-09T04:01:00+00:00';
$r2 = $dd['app']->ingestDesigns($wb, [$recB], $dd['app']->protocolHash());
$retry = $recA; $retry['seed'] = 99;
$r3 = $dd['app']->ingestDesigns($wa, [$retry], $dd['app']->protocolHash());
$rowsDd = $dd['db']->query("SELECT worker_id, confirmations FROM design_records WHERE task_id = 'coincidence'")->fetchAll();
$conf = $dd['db']->query('SELECT worker_id, n FROM design_confirmations')->fetchAll();
check($r1['stored'] === 1 && $r2['stored'] === 0 && $r2['confirmed'] === 1 && count($rowsDd) === 1 && $rowsDd[0]['worker_id'] === $wa['id'] && (int) $rowsDd[0]['confirmations'] === 1
    && count($conf) === 1 && $conf[0]['worker_id'] === $wb['id'], 'the same design from another computer (listed in another order) is one entry: the first finder keeps it and the second is noted as a confirmation');
check($r3['stored'] === 0 && (int) $dd['db']->query('SELECT confirmations FROM design_records')->fetchColumn() === 1, 'a retried job re-uploading its design adds nothing');
$disc = $dd['app']->discoveries(12);
check(count($disc) === 1 && $disc[0]['finder'] === 'find-a' && $disc[0]['confirmations'] === 1 && $disc[0]['confirmedBy'] === ['find-b'], 'Discoveries lists the design once, credits the first finder, and names the computer that confirmed it');
// Same scores and size but different wiring: one Discoveries entry, the rest counted as equivalent variants.
$gC = '{"modules":[{"id":"a","n":1},{"id":"b","n":2}],"v":2,"wires":[{"from":"a","to":"b","weight":0.7}]}';
$recC = designRecord($gC, 33, 0.6, 0.6, 'designer', 5); $recC['jobId'] = 'job-c';
$dd['app']->ingestDesigns($wb, [$recC], $dd['app']->protocolHash());
$disc2 = $dd['app']->discoveries(12);
check(count($disc2) === 1 && $disc2[0]['variants'] === 1 && $disc2[0]['finder'] === 'find-a' && (int) $dd['db']->query('SELECT COUNT(*) FROM design_records')->fetchColumn() === 2, 'circuits that score the same with the same size show as one discovery with an equivalent-variant count, and both records are kept');
// Records stored by the old code (no design hash): the upgrade marks later copies, keeps every row, and is safe to repeat.
$old = lab();
$ow = [];
foreach (['old-a', 'old-b', 'old-c'] as $nm) {
    $ow[] = $old['app']->enroll($nm, ['spikefoundry'], 2, true)['workerId'];
}
$legacyRow = function (string $id, string $genomeJson, string $worker, string $job, int $seq, float $q) use ($old) {
    $gh = hash('sha256', $genomeJson);
    $old['db']->prepare('INSERT OR IGNORE INTO design_genomes (hash, genome_json, version, created_at) VALUES (?, ?, 2, ?)')->execute([$gh, $genomeJson, '2026-11-09T03:00:00+00:00']);
    $old['db']->prepare("INSERT INTO design_records (id, genome_hash, task_id, task_version, score_json, neurons, synapses, spikes, eval_ms, engine_version, protocol_hash, worker_id, seed, job_id, arm, seq, created_at) VALUES (?, ?, 'sequence', 'base-1', ?, 5, 5, 0, 1, 'spikefoundry-designer-3', 'p', ?, 1, ?, 'designer', ?, ?)")
        ->execute([$id, $gh, json_encode(['quality' => $q, 'train' => $q, 'heldOut' => $q, 'accuracy' => 0.75]), $worker, $job, $seq, '2026-11-09T03:00:0' . $seq . '+00:00']);
};
$legacyRow('r1', $gA, $ow[0], 'j1', 1, 0.70);
$legacyRow('r2', $gA, $ow[1], 'j2', 2, 0.72);
$legacyRow('r3', $gB, $ow[2], 'j3', 3, 0.70);
$legacyRow('r4', $gA, $ow[0], 'j1', 4, 0.70);
$legacyRow('r5', $gC, $ow[2], 'j5', 5, 0.65);
$m1 = $old['app']->mergeDuplicateDesigns(60);
$m2 = $old['app']->mergeDuplicateDesigns(60);
$rows = [];
foreach ($old['db']->query('SELECT id, duplicate_of, confirmations, score_json FROM design_records ORDER BY id')->fetchAll() as $row) {
    $rows[$row['id']] = $row;
}
$best = json_decode((string) $rows['r1']['score_json'], true);
check(count($rows) === 5 && $rows['r1']['duplicate_of'] === null && $rows['r2']['duplicate_of'] === 'r1' && $rows['r3']['duplicate_of'] === 'r1' && $rows['r4']['duplicate_of'] === 'r1' && $rows['r5']['duplicate_of'] === null
    && (int) $rows['r1']['confirmations'] === 2 && abs((float) $best['quality'] - 0.72) < 1e-9, 'the upgrade marks later copies (including one listed in another order) as duplicate_of the first find, keeps every row, counts other jobs as confirmations, and keeps the best score');
check($m1['groups'] === 1 && $m1['marked'] === 3 && $m1['canonicalOnly'] === 1 && $m2['groups'] === 0 && $m2['marked'] === 0, 'the duplicate merge reports what it did and is safe to run again');
// Every auto job gets its own seed, even when the queue is refilled twice in the same second.
$sd = lab();
$seeds = [];
for ($i = 0; $i < 60; $i++) {
    $seed = $sd['app']->freshSeed();
    $sd['app']->createJob('sf-vision', 'Auto coincidence', 0.6, $seed, ['taskId' => 'coincidence', 'knownHashes' => [substr(hash('sha256', (string) $i), 0, 16), 'not-hex']]);
    $seeds[] = $seed;
}
$stored = $sd['db']->query('SELECT COUNT(DISTINCT seed) FROM jobs WHERE seed IS NOT NULL')->fetchColumn();
$spec = json_decode((string) $sd['db']->query('SELECT spec_json FROM jobs LIMIT 1')->fetchColumn(), true);
check(count(array_unique($seeds)) === 60 && (int) $stored >= 60 && count($spec['knownHashes'] ?? []) === 1, 'each new job gets a seed no other job used, and carries the short hashes of designs the library already has');
$src = (string) file_get_contents(dirname(__DIR__) . '/private/src/App.php');
check(strpos($src, "\$project['id'] . '|' . \$this->now() . '|' . \$made") === false && strpos($src, '$seed = $this->freshSeed();') !== false, 'auto jobs no longer derive their seed from the clock second');

echo "$n checks\n";
exit($fail === 0 ? 0 : 1);
