<?php
declare(strict_types=1);
require dirname(__DIR__) . '/private/src/App.php';

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
check($re && $re['id'] === $bb, 'an expired lease returns the BugBrain job to the queue');

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

echo "$n checks\n";
exit($fail === 0 ? 0 : 1);
