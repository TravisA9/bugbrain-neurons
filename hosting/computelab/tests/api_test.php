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
check(strpos($windows, '@echo off') === 0 && strpos($windows, $deskA['token']) !== false && strpos($windows, 'echo ' . $deskA['token']) === false && strpos($windows, 'nodejs.org') !== false, 'the Windows setup file saves the token and does not echo it');

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
check($first['stored'] === 1 && $first['skipped'] === 1 && $again['stored'] === 1 && $again['skipped'] === 1, 'design uploads dedupe a genome and reject a bad hash');
check(count($top) === 1 && $top[0]['quality'] == 0.8 && $lib['app']->designGenome($genomeHash)['genome_json'] === $genomeJson, 'the library keeps one genome and ranks the better score');
check($lib['app']->designsByWorker($libWorker['workerId']) === 2, 'a computer can see how many designs it found');
check(count($lib['app']->designExportRows('coincidence', 10)) === 2, 'export returns the compact rows');
$seeded = $lib['app']->seedJobFromDesigns('sf-vision', 'coincidence', 3, 11);
$seedRow = $lib['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $lib['db']->quote($seeded))->fetch();
check($seeded && strpos((string) $seedRow['spec_json'], $genomeHash) !== false, 'the owner can seed a job from the top designs');
check($lib['app']->codeApproved('4b0e21855d9ce104a96633047e8199874524044d399c6150d02eb77e4edca4c4'), 'the previous protocol hash stays approved');
$train = $lib['app']->createJob('sf-train', 'Train model', 5, 4);
$held = $lib['app']->claim($lib['app']->workerByToken($libWorker['token']));
$modelId = $lib['app']->saveModel($lib['app']->workerByToken($libWorker['token']), $held['id'], '{"format":"spikefoundry-designer","spearman":0.77}', ['spearman' => 0.77, 'heldOut' => 6]);
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

$supply = lab();
$sw = $supply['app']->enroll('supply-pc', ['spikefoundry', 'bugbrain'], 2, true);
$supply['db']->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([$supply['clock']->t, $sw['workerId']]);
$supply['db']->exec("UPDATE projects SET auto_jobs = 1 WHERE id = 'spikefoundry'");
$got = $supply['app']->claim($supply['app']->workerByToken($sw['token']));
$auto = (int) $supply['db']->query("SELECT auto_created FROM projects WHERE id = 'spikefoundry'")->fetchColumn();
$spec = json_decode((string) $supply['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $supply['db']->quote((string) $got['id']))->fetchColumn(), true);
$bbQueued = (int) $supply['db']->query("SELECT COUNT(*) FROM jobs WHERE project_id = 'bugbrain'")->fetchColumn();
check($got && $got['project'] === 'spikefoundry' && $spec['mode'] === 'propose' && (int) $spec['evals'] === 40 && $auto === 1 && $bbQueued === 0, 'an empty SpikeFoundry queue grows one propose job and BugBrain stays off');
$second = $supply['app']->claim($supply['app']->workerByToken($sw['token']));
check($second === null, 'supply does not add another job until the throttle window passes');
$supply['clock']->t = gmdate('c', strtotime($supply['clock']->t) + 20);
$supply['app']->saveSupply('spikefoundry', true, 2, 2, 12);
$id = substr(hash('sha256', 'spikefoundry|coincidence'), 0, 32);
$supply['db']->prepare('REPLACE INTO task_policies (id, project_id, task_id, stall_delta, stall_evals, stall_hours, stall_action, paused, pause_reason, advanced_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    ->execute([$id, 'spikefoundry', 'coincidence', 0.005, 3000, 6, 'pause', 1, 'stall', 'sequence']);
$again = $supply['app']->claim($supply['app']->workerByToken($sw['token']));
$againSpec = $again ? json_decode((string) $supply['db']->query('SELECT spec_json FROM jobs WHERE id = ' . $supply['db']->quote((string) $again['id']))->fetchColumn(), true) : [];
check($again && $againSpec['taskId'] === 'sequence' && (int) $againSpec['evals'] === 12, 'auto jobs skip a paused task and use the next level');

echo "$n checks\n";
exit($fail === 0 ? 0 : 1);
