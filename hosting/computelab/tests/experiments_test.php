<?php
declare(strict_types=1);
/* php tests/experiments_test.php : server-defined experiments (planner, seed ledger, claim gating, results, retire list). */
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

$BASE = 'pl.lr@cortex=0.2,P.granN=32000,P.lagDepth=32,sc.sizeF=4';
function spec(array $over = []): array
{
    global $BASE;
    return array_replace([
        'id' => 'test-lag', 'title' => 't', 'status' => 'active', 'priority' => 3, 'runner' => 'run/exp.js', 'protocol' => 1,
        'plan' => 'deepURSx3', 'base' => $BASE,
        'search' => ['param' => 'P.lagDepth', 'lo' => 8, 'hi' => 128, 'scale' => 'log2', 'integer' => true, 'maxPoints' => 6, 'minGap' => 0.5],
        'tasks' => [
            ['id' => 'book100k', 'tj' => ['env' => 'seq', 'params' => ['source' => 'book', 'nSyms' => 100000, 'evalSyms' => 2000]], 'metric' => 'heldAcc', 'primary' => true],
            ['id' => 'fables4000', 'tj' => ['env' => 'seq', 'params' => ['source' => 'fables', 'nSyms' => 4000]], 'metric' => 'accuracy', 'guard' => ['maxDrop' => 0.005]],
        ],
        'seeds' => ['tune' => 2, 'confirm' => 4],
        'pass' => ['meanDelta' => 0.002, 'minT' => 2.0, 'minWinFrac' => 0.625, 'perSeedFloor' => -0.005],
        'requires' => ['memGB' => 7, 'heapMB' => 7000], 'queueCap' => 64,
    ], $over);
}
/* A fake brain: book heldAcc peaks at lagDepth 64 (+.006 over 32); fables unaffected; small per-seed noise. */
function fakeMetric(string $variant, string $task, int $seed, float $fablesCost = 0.0): float
{
    preg_match('/P\.lagDepth=([0-9.]+)/', $variant, $m);
    $x = log((float) $m[1], 2);
    $noise = (($seed * 7919 + (int) round($x * 13)) % 11 - 5) / 10000;
    if ($task === 'book100k') {
        return 0.54 + 0.006 - 0.003 * ($x - 6) ** 2 + $noise;
    }
    return 0.30 + $noise - ($x > 5 ? $fablesCost : 0);
}
function runAll(array $spec, array $seeds, callable $metric, int $maxRounds = 40): array
{
    $runs = [];
    $order = [];
    for ($i = 0; $i < $maxRounds; $i++) {
        $p = Experiments::plan($spec, $seeds, $runs);
        if ($p['phase'] === 'done' || $p['phase'] === 'blocked') {
            return [$p, $runs, $order];
        }
        foreach ($p['need'] as $r) {
            $order[] = $r['arm'];
            $runs[] = ['arm' => $r['arm'], 'task' => $r['task'], 'seed' => $r['seed'], 'status' => 'done', 'metric' => $metric($r['variant'], $r['task'], $r['seed'])];
        }
    }
    return [$p, $runs, $order];
}

/* ---- specs ---- */
$shipped = Experiments::load(dirname(__DIR__) . '/private/experiments');
check($shipped['errors'] === [] && isset($shipped['specs']['r146-lagdepth'], $shipped['specs']['r146-size']), 'the shipped experiment specs validate (CATALOG.json is not a spec)');
check(str_contains($shipped['specs']['r146-lagdepth']['base'], 'P.relGrowth=1') && str_contains($shipped['specs']['r146-lagdepth']['base'], 'P.lagDepth=32,'), 'the lagDepth search runs on the R144 champion (its control arm)');
check(Experiments::validate(spec()) === [], 'a well-formed spec has no errors');
check(Experiments::validate(spec(['runner' => 'run/r42.js'])) !== [], 'only experiment runners are allowed');
check(Experiments::validate(spec(['base' => $BASE . ',P.x=1;rm'])) !== [], 'a base with shell characters is refused');
check(Experiments::validate(spec(['protocol' => 2])) !== [], 'a spec needing a newer protocol than the server knows is refused');
check(Experiments::validate(spec(['arms' => [['id' => 'a', 'set' => ['P.lagDepth' => 64]]]])) !== [], 'search and arms together are refused');
$t2 = spec()['tasks'];
unset($t2[1]['guard']);
check(Experiments::validate(spec(['tasks' => $t2])) !== [], 'a non-primary task needs a guard (pre-registered capped cost)');
check(Experiments::variantWith('a.b@x=1,P.c=2', ['P.c' => 5, 'P.d' => 0.25]) === 'a.b@x=1,P.c=5,P.d=0.25', 'variantWith replaces in place and appends new keys');

/* ---- planner: extremes first, then bisect, then confirm ---- */
$seeds = [5001, 5002, 5003, 5004, 5005, 5006];
$p0 = Experiments::plan(spec(), $seeds, []);
$arms0 = array_values(array_unique(array_column($p0['need'], 'arm')));
sort($arms0);
check($p0['phase'] === 'tune' && $arms0 === ['control', 'p128', 'p8'] && count($p0['need']) === 6
    && array_unique(array_column($p0['need'], 'task')) === ['book100k'] && array_values(array_unique(array_column($p0['need'], 'seed'))) === [5001, 5002],
    'first plan: control and both extremes, on the 2 tuning seeds, primary task only');
check(str_contains($p0['need'][1]['variant'], 'P.lagDepth=8') || str_contains($p0['need'][1]['variant'], 'P.lagDepth=128'), 'an arm variant is the base with the searched value');
$again = Experiments::plan(spec(), $seeds, array_map(static fn ($r) => $r + ['status' => 'running', 'metric' => null], $p0['need']));
check($again['need'] === [] && $again['phase'] === 'tune', 'runs already in flight are not planned twice');

[$pf, $runs, $order] = runAll(spec(), $seeds, static fn ($v, $t, $k) => fakeMetric($v, $t, $k));
check($pf['phase'] === 'done' && $pf['report']['search']['best'] === '64', 'bisection finds the optimum between the control and the better extreme (64)');
check(array_slice(array_values(array_unique($order)), 0, 3) === ['control', 'p8', 'p128'] || array_slice(array_values(array_unique($order)), 0, 3) === ['control', 'p128', 'p8'], 'the extremes run before any bisection point');
check(count($pf['report']['search']['points']) <= 6, 'the search stops at maxPoints');
check($pf['report']['verdict'] === 'pass' && $pf['report']['winner'] === 'p64', 'a clearly better point passes the pre-registered bar on the fresh seeds');
$confirmSeeds = array_values(array_unique(array_column(array_filter($runs, static fn ($r) => $r['arm'] === 'p64' && $r['task'] === 'fables4000'), 'seed')));
check($confirmSeeds === [5003, 5004, 5005, 5006], 'confirmation runs every task on the fresh seeds only (never the tuning seeds)');
$conf = $pf['report']['confirm'][0]['tasks']['book100k'];
check($conf['n'] === 4 && $conf['mean'] > 0.002 && $conf['wins'] === 4, 'the report has paired deltas, wins and t for the primary task');

[$pg] = runAll(spec(), $seeds, static fn ($v, $t, $k) => fakeMetric($v, $t, $k, 0.01));
check($pg['report']['verdict'] === 'fail' && $pg['report']['confirm'][0]['tasks']['fables4000']['pass'] === false, 'a guard task that drops more than its cap fails the verdict');

[$pn] = runAll(spec(), $seeds, static fn ($v, $t, $k) => $t === 'book100k' ? (str_contains($v, 'P.lagDepth=32,') ? 0.55 : 0.54) : 0.3);
check($pn['phase'] === 'done' && $pn['report']['verdict'] === 'no-gain' && count(array_filter([], 'is_null')) === 0, 'when the control beats every point nothing is confirmed (no-gain)');

[$pe] = runAll(spec(), $seeds, static function ($v, $t, $k) {
    preg_match('/P\.lagDepth=([0-9.]+)/', $v, $m);
    return $t === 'book100k' ? 0.5 + log((float) $m[1], 2) / 100 : 0.3;
});
check(($pe['report']['proposals'][0]['kind'] ?? '') === 'extend-range' && $pe['report']['proposals'][0]['lo'] === '128' && $pe['report']['proposals'][0]['hi'] === '2048',
    'a best point on the edge of the range proposes the next range out (for approval, not auto-run)');

$failRuns = [];
foreach ($p0['need'] as $r) {
    $failRuns[] = ['arm' => $r['arm'], 'task' => $r['task'], 'seed' => $r['seed'], 'status' => 'failed', 'metric' => null];
}
$p1 = Experiments::plan(spec(), $seeds, $failRuns);
check(count($p1['need']) === 6, 'a failed run is planned again');
$p2 = Experiments::plan(spec(), $seeds, array_merge($failRuns, $failRuns));
check($p2['phase'] === 'blocked' && $p2['need'] === [], 'a run that failed twice blocks the experiment instead of looping');

$arms = spec(['arms' => [['id' => 'deep', 'set' => ['P.lagDepth' => 64]]]]);
unset($arms['search']);
check(Experiments::validate($arms) === [], 'fixed-arm specs validate');
$pa = Experiments::plan($arms, $seeds, []);
check($pa['phase'] === 'confirm' && count($pa['need']) === 4 * 2 * 2, 'fixed arms go straight to confirmation (control + arm, every task, fresh seeds)');

/* ---- App integration ---- */
$config = [
    'driver' => 'sqlite', 'base_path' => '/computelab', 'lease_seconds' => 600, 'result_bytes' => 2048,
    'login_per_minute' => 3, 'api_per_minute' => 5, 'max_attempts' => 3, 'protocol' => dirname(__DIR__) . '/PROTOCOL.txt',
];
$dir = sys_get_temp_dir() . '/exp-test-' . getmypid();
@mkdir($dir);
file_put_contents($dir . '/test-lag.json', json_encode(spec()));
$other = spec(['id' => 'test-two', 'status' => 'proposed']);
file_put_contents($dir . '/test-two.json', json_encode($other));
function lab(array $over): array
{
    global $config;
    $box = new stdClass();
    $box->t = '2026-11-24T18:00:00+00:00';
    $db = new PDO('sqlite::memory:');
    $app = new App($db, $over + $config, static function () use ($box): string { return $box->t; });
    $app->migrate();
    return [$app, $db, $box];
}

[$off, $offDb] = lab(['experiments_dir' => $dir]);
$off->replenishJobs();
check((int) $offDb->query("SELECT COUNT(*) FROM jobs WHERE template_id = 'bb-experiment'")->fetchColumn() === 0
    && !$offDb->query("SELECT 1 FROM templates WHERE id = 'bb-experiment'")->fetch() && !$off->experimentsEnabled(),
    'with experiments_enabled off nothing is planned and no template is added');

[$lab, $db, $clock] = lab(['experiments_enabled' => true, 'experiments_dir' => $dir]);
$made = $lab->replenishExperiments();
check($made === 6 && (int) $db->query("SELECT COUNT(*) FROM exp_runs WHERE experiment_id = 'test-lag'")->fetchColumn() === 6, 'enabled: the active spec queues its first 6 tuning runs; the proposed spec queues none');
$seedsA = $lab->experimentSeeds(spec());
check($seedsA === [5001, 5002, 5003, 5004, 5005, 5006], 'the seed ledger hands out a fresh block from experiment_seed_start');
check($lab->experimentSeeds(spec(['id' => 'test-two'])) === [5007, 5008, 5009, 5010, 5011, 5012] && $lab->experimentSeeds(spec()) === $seedsA,
    'another experiment gets a disjoint block; a block is stable once allocated');
check($lab->replenishExperiments() === 0, 'planning again does not duplicate queued runs');

$old = $lab->enroll('old-pc', ['spikefoundry', 'bugbrain'], 2, true);
$oldW = $lab->workerByToken($old['token']);
$lab->heartbeat($oldW, ['runtime' => ['cores' => 8, 'slots' => 4]]);
check($lab->claim($lab->workerByToken($old['token'])) === null, 'a worker without experiment protocol is never given an experiment run');

$small = $lab->enroll('small-pc', ['bugbrain'], 2, true);
$lab->heartbeat($lab->workerByToken($small['token']), ['runtime' => ['cores' => 8, 'slots' => 4, 'experiments' => 1, 'memGB' => 8]]);
check($lab->claim($lab->workerByToken($small['token'])) === null, 'a computer without room for the run (8 GB - 4 GB reserve < 7 GB) is not given it');

$big = $lab->enroll('big-pc', ['bugbrain'], 2, true);
$lab->heartbeat($lab->workerByToken($big['token']), ['runtime' => ['cores' => 8, 'slots' => 4, 'experiments' => 1, 'memGB' => 15.7]]);
$bw = $lab->workerByToken($big['token']);
$job = $lab->claim($bw, 0);
check($job !== null && $job['runner'] === 'run/exp.js' && ($job['spec']['experiment']['heapMB'] ?? 0) === 7000
    && ($job['spec']['experiment']['strictFlags'] ?? false) === true && $job['spec']['experiment']['version'] === 'bb-exp-1',
    'a capable computer gets the run: runner run/exp.js, heap size, strict flag checking');
check($lab->claim($bw, 1) === null, 'memory caps concurrent runs: 15.7 GB fits one 7 GB run beside the reserve');

$exp = $job['spec']['experiment'];
$good = ['version' => 'bb-exp-1', 'id' => $exp['id'], 'arm' => $exp['arm'], 'task' => $exp['task'], 'k' => $exp['k'], 'variant' => $exp['variant'],
    'metric' => 'heldAcc', 'metrics' => ['heldAcc' => 0.5421, 'trainAcc' => 0.6], 'engine' => ['defaults' => 40]];
$threw = '';
try {
    $lab->submitResult($bw, $job['id'], ['status' => 'done', 'summary' => 's', 'research' => ['arm' => 'p999'] + $good]);
} catch (InvalidArgumentException $e) {
    $threw = $e->getMessage();
}
check($threw === 'Experiment report does not match the job.', 'a report for another arm is refused');
try {
    $lab->submitResult($bw, $job['id'], ['status' => 'done', 'summary' => 's', 'research' => ['metrics' => ['trainAcc' => 1]] + $good]);
    $threw = '';
} catch (InvalidArgumentException $e) {
    $threw = $e->getMessage();
}
check($threw === 'Experiment report is missing its metric.', 'a report without the job metric is refused');
$lab->submitResult($bw, $job['id'], ['status' => 'done', 'summary' => 's', 'research' => $good]);
$row = $db->query("SELECT status, metric, worker_id FROM exp_runs WHERE job_id = " . $db->quote($job['id']))->fetch();
check($row['status'] === 'done' && abs((float) $row['metric'] - 0.5421) < 1e-9, 'a matching report stores the metric on the run');
$rep = $lab->experimentsReport();
$mine = array_values(array_filter($rep['experiments'], static fn ($e) => $e['id'] === 'test-lag'))[0];
check($rep['enabled'] === true && $mine['runs']['done'] === 1 && $mine['phase'] === 'tune' && !str_contains(json_encode($rep), 'big-pc'),
    'the report aggregates runs per experiment and names no computer');

$err = $lab->claim($bw, 0);
$lab->submitResult($bw, $err['id'], ['status' => 'error', 'summary' => 'Unknown flag P.lagDepth']);
check($db->query('SELECT status FROM jobs WHERE id = ' . $db->quote($err['id']))->fetchColumn() !== 'done', 'an error result goes back through the normal retry path');

/* Full loop on the server: a fake worker answers every run until the verdict. */
[$loop, $ldb, $lclock] = lab(['experiments_enabled' => true, 'experiments_dir' => $dir]);
$lw = $loop->enroll('loop-pc', ['bugbrain'], 2, true);
$loop->heartbeat($loop->workerByToken($lw['token']), ['runtime' => ['cores' => 8, 'slots' => 1, 'experiments' => 1, 'memGB' => 64]]);
$guard = 0;
while ($guard++ < 200) {
    $loop->replenishExperiments();
    $w = $loop->workerByToken($lw['token']);
    $j = $loop->claim($w, 0);
    if ($j === null) {
        break;
    }
    $e = $j['spec']['experiment'];
    $loop->submitResult($w, $j['id'], ['status' => 'done', 'summary' => 'ok', 'research' => ['version' => 'bb-exp-1', 'id' => $e['id'], 'arm' => $e['arm'],
        'task' => $e['task'], 'k' => $e['k'], 'variant' => $e['variant'], 'metric' => $e['metric'], 'metrics' => [$e['metric'] => fakeMetric($e['variant'], $e['task'], $e['k'])]]]);
}
$fin = array_values(array_filter($loop->experimentsReport()['experiments'], static fn ($e) => $e['id'] === 'test-lag'))[0];
check($fin['phase'] === 'done' && $fin['verdict'] === 'pass' && $fin['winner'] === 'p64' && $fin['runs']['failed'] === 0,
    'end to end through claim and submit: the server plans, runs and decides the experiment with no user choice');

/* Retire list */
[$ret, $rdb] = lab(['retire_job_types' => ['bb-order3', 'sf-vision']]);
$ret->createJob('bb-order3', 'old', 1, 77);
$rw = $ret->enroll('r-pc', ['spikefoundry', 'bugbrain'], 2, true);
check($ret->claim($ret->workerByToken($rw['token'])) === null && $ret->claimableQueued() === 0, 'a retired job type is never handed out and does not count toward the queue');
[$keep] = lab([]);
$keep->createJob('bb-order3', 'old', 1, 77);
$kw = $keep->enroll('k-pc', ['spikefoundry', 'bugbrain'], 2, true);
check(($keep->claim($keep->workerByToken($kw['token']))['id'] ?? '') !== '', 'with the default (empty) retire list the same job is handed out as before');

foreach (glob($dir . '/*') ?: [] as $f) {
    unlink($f);
}
rmdir($dir);
echo $fail === 0 ? "ALL OK ($n checks)\n" : "$fail of $n checks FAILED\n";
exit($fail === 0 ? 0 : 1);
