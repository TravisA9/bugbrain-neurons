<?php
declare(strict_types=1);
/* php tests/experiments_test.php : server-defined experiments (planner, seed ledger, claim gating, results, retire list). */
require dirname(__DIR__) . '/private/src/App.php';
require_once dirname(__DIR__) . '/private/src/pages.php';

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
/** PDO that records every statement it is given (query-count and EXPLAIN guards). */
class RecPDO extends PDO
{
    public array $log = [];
    public bool $rec = false;
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        if ($this->rec) {
            $this->log[] = $query;
        }
        return parent::prepare($query, $options);
    }
    public function query(string $query, ?int $fetchMode = null, mixed ...$args): PDOStatement|false
    {
        if ($this->rec) {
            $this->log[] = $query;
        }
        return $fetchMode === null ? parent::query($query) : parent::query($query, $fetchMode, ...$args);
    }
    public function exec(string $statement): int|false
    {
        if ($this->rec) {
            $this->log[] = $statement;
        }
        return parent::exec($statement);
    }
    /** Full-table scans in the recorded statements, from SQLite's EXPLAIN QUERY PLAN ("SCAN x" without an index). */
    public function scans(): array
    {
        $out = [];
        foreach ($this->log as $sql) {
            if (!preg_match('/^\s*(SELECT|UPDATE|DELETE)/i', $sql)) {
                continue;
            }
            $st = parent::prepare('EXPLAIN QUERY PLAN ' . $sql);
            $st->execute(array_fill(0, substr_count($sql, '?'), null));
            foreach ($st->fetchAll() as $row) {
                if (preg_match('/^SCAN (\w+)(?! USING (COVERING )?INDEX)/', (string) $row['detail'], $m)) {
                    $out[] = $m[1] . ' <- ' . preg_replace('/\s+/', ' ', trim($sql));
                }
            }
        }
        return $out;
    }
}

function lab(array $over, bool $record = false): array
{
    global $config;
    $box = new stdClass();
    $box->t = '2026-11-24T18:00:00+00:00';
    $db = $record ? new RecPDO('sqlite::memory:') : new PDO('sqlite::memory:');
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

/* ---- Inverse designer compute policy (inverse_promotion_audit_gate, inverse_stall_jobs, inverse_share_max, composition) ---- */
$candidate = ['genes' => [1, 2, 0, 0, 0, 0, 0], 'freshCount' => 192, 'replay' => [[0, 0], [2, 1]]];
$ckpt = ['version' => 'inverse-designer-1', 'encoding' => 'f32le-gzip', 'payload' => base64_encode(gzencode(str_repeat("\0", 38064)))];
function sharedSubmit(App $a, array $w, array $job, array $cand, ?array $inc, int $audit, ?int $incAudit): string
{
    global $candidate, $ckpt;
    $as = $job['spec']['inverseShared'];
    $a->submitResult($w, $job['id'], ['status' => 'done', 'synthetic' => true, 'research' => [
        'version' => 'inverse-designer-1', 'seed' => $job['spec']['seed'], 'checkpoint' => $ckpt,
        'discoveries' => [$candidate + ['accuracy' => 0.6, 'recall' => 0.8, 'specificity' => 0.4, 'demoAccuracy' => 0.6]],
        'promotion' => ['benchmark' => $as['benchmark'], 'parentGeneration' => $as['generation'], 'candidate' => $cand, 'incumbent' => $inc,
            'auditPassed' => $audit, 'auditTrials' => 36, 'incumbentAuditPassed' => $incAudit]]]);
    return $a->inverseExperimentReport($job['spec']['seed'])['research']['promotion']['outcome'];
}
$p12 = array_merge(array_fill(0, 12, 1), array_fill(0, 24, 0));
$p15 = $p12;
$p15[12] = $p15[13] = $p15[15] = 1;
foreach ([false, true] as $gate) {
    [$ia] = lab(['inverse_gallery' => true, 'inverse_shared_training' => true, 'inverse_promotion_audit_gate' => $gate]);
    $iw = $ia->workerByToken($ia->enroll('inv-pc', ['spikefoundry'], 2, true)['token']);
    for ($sd = 300; $sd < 303; $sd++) {
        $ia->createJob('sf-inverse-experiment', 'Shared', 1, $sd, ['inverseGallery' => true]);
    }
    $j0 = $ia->claim($iw, 0, false, 1, true, true, true);
    sharedSubmit($ia, $iw, $j0, $p12, null, 12, null);
    $j1 = $ia->claim($iw, 0, false, 1, true, true, true);
    $out = sharedSubmit($ia, $iw, $j1, $p15, $p12, 12, 12);
    check($gate ? $out === 'audit-not-better' : $out === 'promoted',
        $gate ? 'audit gate on: a promotion-set gain with no audit gain is not promoted' : 'audit gate off: the same report promotes, as before');
    if ($gate) {
        $j2 = $ia->claim($iw, 0, false, 1, true, true, true);
        check(sharedSubmit($ia, $iw, $j2, $p15, $p12, 13, 12) === 'promoted', 'audit gate on: the same gain with a better audit score promotes');
    }
}
[$st, , $stClock] = lab(['inverse_gallery' => true, 'inverse_shared_training' => true, 'inverse_stall_jobs' => 2]);
$sw = $st->workerByToken($st->enroll('stall-pc', ['spikefoundry'], 2, true)['token']);
for ($sd = 400; $sd < 404; $sd++) {
    $st->createJob('sf-inverse-experiment', 'Shared', 1, $sd, ['inverseGallery' => true]);
}
$a0 = $st->claim($sw, 0, false, 1, true, true, true);
sharedSubmit($st, $sw, $a0, $p12, null, 12, null);
check(!$st->inverseStalled() && $st->inverseJobsSincePromotion() === 0, 'a promotion resets the stall count');
$stClock->t = '2026-11-24T18:01:00+00:00';
for ($i = 0; $i < 2; $i++) {
    $b = $st->claim($sw, 0, false, 1, true, true, true);
    sharedSubmit($st, $sw, $b, $p12, $p12, 12, 12);
}
check($st->inverseStalled() && $st->inverseJobsSincePromotion() === 2, 'two jobs with no promotion mark the shared designer stalled (inverse_stall_jobs 2)');
$st->db->exec("DELETE FROM jobs WHERE status = 'queued'");
$st->db->prepare("REPLACE INTO supply_state (id, ran_at, note) VALUES ('global', '2000-01-01T00:00:00+00:00', 'x')")->execute();
$st->db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute(['2026-11-24T18:01:00+00:00', $sw['id']]);
$st->saveSupply('spikefoundry', true, 1, 4, 0);
$st->replenishJobs();
check((int) $st->db->query("SELECT COUNT(*) FROM jobs WHERE status = 'queued' AND template_id = 'sf-inverse-experiment'")->fetchColumn() === 0,
    'a stalled shared designer gets no new plain inverse jobs');
[$st2] = lab(['inverse_gallery' => true, 'inverse_shared_training' => true]);
$st2w = $st2->workerByToken($st2->enroll('nostall-pc', ['spikefoundry'], 2, true)['token']);
$st2->db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute(['2026-11-24T18:00:00+00:00', $st2w['id']]);
$st2->saveSupply('spikefoundry', true, 1, 4, 0);
$st2->replenishJobs();
check((int) $st2->db->query("SELECT COUNT(*) FROM jobs WHERE status = 'queued' AND template_id = 'sf-inverse-experiment'")->fetchColumn() > 0,
    'with inverse_stall_jobs off, supply fills plain inverse jobs as before');

/* share cap: experiment work wins once plain inverse holds its share; with nothing else the computer still gets inverse */
[$sh, $shDb] = lab(['inverse_gallery' => true, 'inverse_share_max' => 0.1, 'experiments_enabled' => true, 'experiments_dir' => $dir]);
$shA = $sh->enroll('share-a', ['*'], 2, true);
$sh->heartbeat($sh->workerByToken($shA['token']), ['runtime' => ['slots' => 4]]);
for ($sd = 500; $sd < 504; $sd++) {
    $sh->createJob('sf-inverse-experiment', 'Plain', 1, $sd, ['inverseGallery' => true]);
}
$g1 = $sh->claim($sh->workerByToken($shA['token']), 0, false, 1, true, true);
$g2 = $sh->claim($sh->workerByToken($shA['token']), 1, false, 1, true, true);
check($g1 !== null && $g2 !== null, 'share cap with no other work: the computer still gets inverse jobs (no idling)');
$sh->createJob('sf-vision', 'Other work', 0.1, 77);
$g3 = $sh->claim($sh->workerByToken($shA['token']), 2, false, 1, true, true);
check(($g3['spec']['scenario'] ?? '') === 'vision', 'share cap reached (2 of ceil(0.1 x 4) = 1): other work is handed out before more inverse');
[$ns] = lab(['inverse_gallery' => true]);
$nsA = $ns->enroll('noshare', ['*'], 2, true);
for ($sd = 500; $sd < 503; $sd++) {
    $ns->createJob('sf-inverse-experiment', 'Plain', 1, $sd, ['inverseGallery' => true]);
}
$ns->createJob('sf-vision', 'Other work', 0.1, 77);
$ns->claim($ns->workerByToken($nsA['token']), 0, false, 1, true, true);
$n2 = $ns->claim($ns->workerByToken($nsA['token']), 1, false, 1, true, true);
check(($n2['spec']['mode'] ?? '') === 'inverse-experiment', 'without inverse_share_max the queue order is unchanged');

/* composition: more pilots in flight and first in line */
[$co, $coDb] = lab(['inverse_gallery' => true, 'inverse_composition' => true, 'inverse_composition_queue' => 3, 'inverse_composition_first' => true]);
$coW = $co->enroll('comp-pc', ['*'], 2, true);
$coDb->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute(['2026-11-24T18:00:00+00:00', $coW['workerId']]);
$co->saveSupply('spikefoundry', true, 1, 8, 0);
$co->replenishJobs();
check((int) $coDb->query("SELECT COUNT(*) FROM jobs WHERE spec_json LIKE '%inverseComposition%'")->fetchColumn() === 3, 'inverse_composition_queue 3 keeps three composition pilots in flight');
$cj = $co->claim($co->workerByToken($coW['token']), 0, false, 1, true, true, true, true, true);
check(!empty($cj['spec']['inverseComposition']), 'inverse_composition_first hands out a composition pilot before plain inverse jobs');
[$co1, $co1Db] = lab(['inverse_gallery' => true, 'inverse_composition' => true]);
$co1W = $co1->enroll('comp1-pc', ['*'], 2, true);
$co1Db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute(['2026-11-24T18:00:00+00:00', $co1W['workerId']]);
$co1->saveSupply('spikefoundry', true, 1, 8, 0);
$co1->replenishJobs();
check((int) $co1Db->query("SELECT COUNT(*) FROM jobs WHERE spec_json LIKE '%inverseComposition%'")->fetchColumn() === 1, 'by default one composition pilot is in flight, as before');
$rep = $st->experimentsReport();
check(($rep['inverse']['stalled'] ?? null) === true && str_contains((string) ($rep['inverse']['note'] ?? ''), 'compute moved') && isset($rep['inverse']['champion']['auditPassed']),
    'the report shows the designer champion (promotion and audit scores) and the stall note');

/* ---- fix1: the stall count is a counter since the last promotion; per-request paths add no big-table scans ---- */
function seedHistory(PDO $db, int $n): void
{
    $db->beginTransaction();
    $j = $db->prepare("INSERT INTO jobs (id, project_id, template_id, title, spec_json, code_hash, priority, status, created_at, seed) VALUES (?, 'spikefoundry', 'sf-inverse-experiment', 'old', ?, 'x', 1, 'done', '2026-11-01T00:00:00+00:00', ?)");
    $r = $db->prepare("INSERT INTO results (job_id, worker_id, status, summary, body_json, created_at) VALUES (?, 'w-old', 'done', '', '{}', '2026-11-01T00:00:00+00:00')");
    for ($i = 0; $i < $n; $i++) {
        $j->execute(['old-' . $i, json_encode(['mode' => 'inverse-experiment', 'seed' => 900000 + $i, 'pad' => str_repeat('x', 200)]), 900000 + $i]);
        $r->execute(['old-' . $i]);
    }
    $db->commit();
}
[$sp, $spDb] = lab(['inverse_gallery' => true, 'inverse_shared_training' => true, 'inverse_stall_jobs' => 3]);
seedHistory($spDb, 3000);
check($sp->inverseJobsSincePromotion() === 0 && !$sp->inverseStalled(),
    'first enable: 3000 finished inverse jobs of history count as 0 (counting starts now; supply does not stop at once)');
$spw = $sp->workerByToken($sp->enroll('since-pc', ['spikefoundry'], 2, true)['token']);
for ($sd = 700; $sd < 706; $sd++) {
    $sp->createJob('sf-inverse-experiment', 'Shared', 1, $sd, ['inverseGallery' => true]);
}
sharedSubmit($sp, $spw, $sp->claim($spw, 0, false, 1, true, true, true), $p12, null, 12, null);
check($sp->inverseJobsSincePromotion() === 0, 'the promoting job itself is not counted');
for ($i = 0; $i < 3; $i++) {
    sharedSubmit($sp, $spw, $sp->claim($spw, 0, false, 1, true, true, true), $p12, $p12, 12, 12);
}
check($sp->inverseJobsSincePromotion() === 3 && $sp->inverseStalled(), 'three non-promoting jobs since the promotion: count 3, stalled at inverse_stall_jobs 3');
$spDb->exec('UPDATE inverse_champion SET generation = generation + 1');
check($sp->inverseJobsSincePromotion() === 0 && !$sp->inverseStalled(), 'a newer champion generation (promotion) reads as 0 even before any job reports');
[$spOff, $spOffDb] = lab(['inverse_gallery' => true, 'inverse_shared_training' => true]);
$spOffW = $spOff->workerByToken($spOff->enroll('off-pc', ['spikefoundry'], 2, true)['token']);
$spOff->createJob('sf-inverse-experiment', 'Shared', 1, 720, ['inverseGallery' => true]);
$spOff->createJob('sf-inverse-experiment', 'Shared', 1, 721, ['inverseGallery' => true]);
sharedSubmit($spOff, $spOffW, $spOff->claim($spOffW, 0, false, 1, true, true, true), $p12, null, 12, null);
sharedSubmit($spOff, $spOffW, $spOff->claim($spOffW, 0, false, 1, true, true, true), $p12, $p12, 12, 12);
check((int) $spOffDb->query('SELECT COUNT(*) FROM policy_state')->fetchColumn() === 0, 'with inverse_stall_jobs off nothing is counted or written');

/* The claim path (supply pass included) with every inverse policy flag on vs all off, on 3000 rows of history. */
$policyOn = ['inverse_stall_jobs' => 300, 'inverse_share_max' => 0.1, 'inverse_composition_queue' => 4, 'inverse_composition_first' => true,
    'inverse_promotion_audit_gate' => true, 'retire_job_types' => ['bb-order3'], 'discoveries_dedupe' => true];
$runs = [];
foreach (['off' => [], 'on' => $policyOn] as $mode => $flags) {
    [$qa, $qdb, $qc] = lab(['inverse_gallery' => true, 'inverse_shared_training' => true, 'inverse_composition' => true] + $flags, true);
    seedHistory($qdb, 3000);
    $qa->saveSupply('spikefoundry', true, 1, 4, 0);
    $qt = $qa->enroll('q-pc', ['spikefoundry'], 2, true)['token'];
    $qa->heartbeat($qa->workerByToken($qt), ['runtime' => ['cores' => 8, 'slots' => 2]]);
    $qa->createJob('sf-inverse-experiment', 'Shared', 1, 730, ['inverseGallery' => true]);
    $qa->claim($qa->workerByToken($qt), 0, false, 1, true, true, true); // warm-up (first supply pass, caches)
    $qc->t = '2026-11-24T18:05:00+00:00';
    $qdb->prepare("REPLACE INTO supply_state (id, ran_at, note) VALUES ('global', '2000-01-01T00:00:00+00:00', 'x')")->execute();
    $qdb->exec("DELETE FROM policy_state WHERE name = 'online_slots'");
    $qw = $qa->workerByToken($qt);
    $qdb->log = [];
    $qdb->rec = true;
    $qa->claim($qw, 1, false, 1, true, true, true);
    $qdb->rec = false;
    $runs[$mode] = ['n' => count($qdb->log), 'scans' => $qdb->scans(), 'app' => $qa, 'db' => $qdb];
}
$newScans = array_values(array_diff(array_unique(array_map(static fn ($x) => explode(' <- ', $x)[1], $runs['on']['scans'])),
    array_unique(array_map(static fn ($x) => explode(' <- ', $x)[1], $runs['off']['scans']))));
$bad = array_values(array_filter($newScans, static fn ($sql) => preg_match('/\b(FROM|JOIN) (jobs|results)\b/', $sql)));
check($bad === [], 'claim with every policy flag on adds no full scan of jobs or results (new reads: leases, jobs by primary key, the cached workers pass)'
    . ($bad ? ': ' . implode(' | ', $bad) : ''));
check($runs['on']['n'] - $runs['off']['n'] <= 8, 'claim with every policy flag on issues at most 8 more statements than with them off (' . $runs['off']['n'] . ' vs ' . $runs['on']['n'] . ')');
$qdb = $runs['on']['db'];
$qdb->log = [];
$qdb->rec = true;
$runs['on']['app']->inverseStalled();
$runs['on']['app']->inverseJobsSincePromotion();
$qdb->rec = false;
check(count($qdb->log) <= 4 && $qdb->scans() === [], 'the stall check is two primary-key reads, no scans (' . count($qdb->log) . ' statements for two calls)');
$qa = $runs['on']['app'];
$qa->experimentsReport();
$qa->cached('experiments-report-v1', 30, static fn () => $qa->experimentsReport());
$qa->inverseDiscoveriesDeduped();
$qdb->log = [];
$qdb->rec = true;
$qa->cached('experiments-report-v1', 30, static fn () => $qa->experimentsReport());
$qa->inverseDiscoveriesDeduped();
$qdb->rec = false;
check(count($qdb->log) === 2, '/experiments.json and the deduped gallery are served from page_cache: one read each while fresh');

/* Optional jobs(status, project_id) index: dry run changes nothing; applied, the existing claim query stops scanning jobs. */
[$ix, $ixDb] = lab([], true);
seedHistory($ixDb, 500);
$dry = $ix->jobStatusIndex(false);
$find = "SELECT * FROM jobs WHERE project_id = ? AND status = ? AND (not_before IS NULL OR not_before <= ?) ORDER BY priority DESC, attempts ASC, id ASC";
$ixDb->log = [$find];
$before = $ixDb->scans();
$done = $ix->jobStatusIndex(true);
$after = $ixDb->scans();
check(!$dry['existed'] && !$dry['applied'] && $before !== [] && $done['applied'] && $after === [] && $ix->jobStatusIndex(true)['existed'],
    'job-indexes.php: dry run adds nothing; --apply adds idx_jobs_status_project and the claim query uses it; running again is a no-op');

/* ---- fix2: experiment runs survive dead or hung workers; per-computer cap; no stale report ---- */
function expGood(array $job, float $v): array
{
    $e = $job['spec']['experiment'];
    return ['status' => 'done', 'summary' => 's', 'research' => ['version' => 'bb-exp-1', 'id' => $e['id'], 'arm' => $e['arm'], 'task' => $e['task'],
        'k' => $e['k'], 'variant' => $e['variant'], 'metric' => $e['metric'], 'metrics' => [$e['metric'] => $v], 'engine' => ['defaults' => 40]]];
}
function expWorker(App $a, string $name, float $mem): string
{
    $t = $a->enroll($name, ['bugbrain'], 2, true)['token'];
    $a->heartbeat($a->workerByToken($t), ['runtime' => ['cores' => 16, 'slots' => 8, 'experiments' => 1, 'memGB' => $mem]]);
    return $t;
}
[$lx, $lxDb, $lxc] = lab(['experiments_enabled' => true, 'experiments_dir' => $dir]);
$deadT = expWorker($lx, 'dead-pc', 15.7);
$aliveT = expWorker($lx, 'alive-pc', 15.7);
$lost = $lx->claim($lx->workerByToken($deadT), 0);
check(str_starts_with((string) ($lost['id'] ?? ''), 'exp-'), 'a run is leased');
$lxc->t = '2026-11-24T18:11:00+00:00'; // 11 min later: the 600 s lease ran out with no check-in
$lx->heartbeat($lx->workerByToken($aliveT), ['runtime' => ['cores' => 16, 'slots' => 8, 'experiments' => 1, 'memGB' => 15.7]]);
$again = null;
for ($i = 0; $i < 8 && ($again['id'] ?? '') !== $lost['id']; $i++) {
    $c = $lx->claim($lx->workerByToken($aliveT), 0);
    if ($c !== null && $c['id'] !== $lost['id']) {
        $lx->submitResult($lx->workerByToken($aliveT), $c['id'], expGood($c, 0.5));
        continue;
    }
    $again = $c;
}
check(($again['id'] ?? '') === $lost['id'], 'a dead worker\'s lease expires and the same run is leased to another capable computer');
$lx->submitResult($lx->workerByToken($aliveT), $again['id'], expGood($again, 0.61));
check((float) $lxDb->query('SELECT metric FROM exp_runs WHERE job_id = ' . $lxDb->quote($lost['id']))->fetchColumn() === 0.61
    && $lxDb->query('SELECT status FROM exp_runs WHERE job_id = ' . $lxDb->quote($lost['id']))->fetchColumn() === 'done',
    'the re-leased run\'s result is recorded on the run');
$lx->replenishExperiments();
$hung = $lx->claim($lx->workerByToken($aliveT), 0);
$lxr = array_values(array_filter($lx->experimentsReport()['experiments'], static fn ($e) => $e['id'] === 'test-lag'))[0]['runs'];
check($hung !== null && $lxr['leased'] === 1 && $lxr['oldestLeaseMin'] === 0 && $lxr['maxMinutes'] === 360,
    'another run is leased; the report shows live leases, the oldest lease age and the time limit');
for ($m = 1; $m <= 7; $m++) { // the worker checks in every hour for 7 hours, so the lease never expires
    $lxc->t = gmdate('c', strtotime('2026-11-24T18:11:00+00:00') + 3600 * $m);
    $lx->heartbeat($lx->workerByToken($aliveT), ['jobId' => $hung['id']]);
    $lx->expireLeases();
}
$st = $lxDb->query('SELECT status, last_error FROM jobs WHERE id = ' . $lxDb->quote($hung['id']))->fetch();
check($st['status'] === 'queued' && str_contains((string) $st['last_error'], '360 min limit')
    && !$lxDb->query('SELECT 1 FROM leases WHERE job_id = ' . $lxDb->quote($hung['id']))->fetch(),
    'a run that keeps checking in but never reports loses its lease after 360 min (3 x requires.minutes when set) and is re-queued');
check($lx->experimentMaxMinutes(['requires' => ['minutes' => 70]]) === 210 && $lx->experimentMaxMinutes(null) === 360,
    'time limit: 3 x requires.minutes (R146: 210 min), else 360');
$lxDb->prepare("UPDATE jobs SET status = 'held' WHERE id = ?")->execute([$hung['id']]);
$hr = array_values(array_filter($lx->experimentRuns('test-lag'), static fn ($r) => $r['status'] === 'failed'));
$lx->replenishExperiments();
check(count($hr) === 1 && (int) $lxDb->query("SELECT COUNT(*) FROM exp_runs r JOIN jobs j ON j.id = r.job_id WHERE j.status = 'queued' AND r.arm = "
    . $lxDb->quote((string) $hr[0]['arm']) . ' AND r.seed = ' . (int) $hr[0]['seed'] . ' AND r.task = ' . $lxDb->quote((string) $hr[0]['task']))->fetchColumn() === 1,
    'a run whose job is held (attempts used up) counts as failed and the planner queues it again (it used to show as running for ever)');

foreach ([0 => 6, 2 => 2] as $capCfg => $want) {
    [$cp] = lab(['experiments_enabled' => true, 'experiments_dir' => $dir, 'experiment_max_per_worker' => $capCfg]);
    $ct = expWorker($cp, 'ana-like', 62.7);
    $got = 0;
    for ($slot = 0; $slot < 10; $slot++) {
        $c = $cp->claim($cp->workerByToken($ct), $slot);
        $got += $c !== null && str_starts_with((string) $c['id'], 'exp-') ? 1 : 0;
    }
    check($got === $want, $capCfg === 0 ? 'a 62.7 GB computer takes all 6 queued tuning runs at once (memory rule allows floor((62.7 - 4) / 7) = 8; memGB is total memory)'
        : 'experiment_max_per_worker 2 caps the same computer at 2');
}

[$sc, , $scc] = lab([]);
$built = 0;
$mk = static function () use (&$built, $scc): array { $built++; return ['at' => $scc->t]; };
$sc->cached('k', 30, $mk, 120);
$scc->t = '2026-11-27T14:56:44+00:00'; // 2.5 days of nobody asking
$first = $sc->cached('k', 30, $mk, 120);
check($first['at'] === '2026-11-27T14:56:44+00:00' && $built === 2, 'a cached report older than its limit is rebuilt for the first visitor, not served 2.5 days old');
$scc->t = '2026-11-27T14:57:30+00:00';
$second = $sc->cached('k', 30, $mk, 120);
check(strtotime('2026-11-27T14:57:30+00:00') - strtotime($second['at']) <= 120, 'inside the limit a copy at most 120 s old may be served while it is rebuilt');

/* ---- R146 ships switched off; config experiments_enable turns it on ---- */
$shipDir = dirname(__DIR__) . '/private/experiments';
[$r0, $r0Db] = lab(['experiments_enabled' => true, 'experiments_dir' => $shipDir]);
check($shipped['specs']['r146-lagdepth']['enabled'] === false && $r0->activeExperiments() === [] && $r0->replenishExperiments() === 0
    && (int) $r0Db->query('SELECT COUNT(*) FROM exp_runs')->fetchColumn() === 0, 'R146 ships enabled:false: experiments_enabled alone queues nothing');
[$r1, $r1Db] = lab(['experiments_enabled' => true, 'experiments_dir' => $shipDir, 'experiments_enable' => ['r146-lagdepth']]);
$r1->replenishExperiments();
$arms146 = array_column($r1Db->query("SELECT DISTINCT arm FROM exp_runs WHERE experiment_id = 'r146-lagdepth' ORDER BY arm")->fetchAll(), 'arm');
$sp146 = json_decode((string) $r1Db->query("SELECT spec_json FROM jobs WHERE template_id = 'bb-experiment' AND id LIKE 'exp-r146-lagdepth-%' LIMIT 1")->fetchColumn(), true);
check(array_keys($r1->activeExperiments()) === ['r146-lagdepth'] && $arms146 === ['control', 'p128', 'p8']
    && (int) $r1Db->query("SELECT COUNT(*) FROM exp_runs WHERE experiment_id = 'r146-lagdepth'")->fetchColumn() === 6
    && $sp146['experiment']['memGB'] === 7 && $sp146['experiment']['heapMB'] === 7000 && $sp146['experiment']['task'] === 'book100k',
    'listed in experiments_enable: R146 queues control (32) and the extremes 8 and 128 on 2 tune seeds, book100k, 7 GB / 7000 MB');
$smallT = $r1->enroll('small-pc', ['bugbrain'], 2, true)['token'];
$r1->heartbeat($r1->workerByToken($smallT), ['runtime' => ['cores' => 8, 'slots' => 2, 'experiments' => 1, 'memGB' => 10]]);
$bigT = $r1->enroll('big-pc', ['bugbrain'], 2, true)['token'];
$r1->heartbeat($r1->workerByToken($bigT), ['runtime' => ['cores' => 8, 'slots' => 2, 'experiments' => 1, 'memGB' => 15.7]]);
$gotSmall = $r1->claim($r1->workerByToken($smallT), 0);
$gotBig = $r1->claim($r1->workerByToken($bigT), 0);
check($gotSmall === null && str_starts_with((string) ($gotBig['id'] ?? ''), 'exp-r146-lagdepth-'),
    'with the default 4 GB reserve a 10 GB computer never gets R146 (needs 7 GB free); a 15.7 GB one (TacoBell) does');

/* ---- Discoveries dedupe (public gallery only) ---- */
foreach ([false, true] as $dd) {
    [$dg, $dgDb] = lab(['inverse_gallery' => true, 'discoveries_dedupe' => $dd, 'discoveries_top_n' => 8]);
    $dw = $dg->workerByToken($dg->enroll('dedupe-pc', ['spikefoundry'], 2, true)['token']);
    foreach ([601, 602, 603] as $i => $sd) {
        $dg->createJob('sf-inverse-experiment', 'Gallery', 1, $sd, ['inverseGallery' => true]);
        $jj = $dg->claim($dw, 0, false, 1, true, true);
        $genes = $i < 2 ? [1, 2, 0, 0, 0, 0, 0] : [0, 1, 0, 0, 0, 0, 1];
        $dg->submitResult($dw, $jj['id'], ['status' => 'done', 'synthetic' => true, 'research' => ['version' => 'inverse-designer-1', 'seed' => $jj['spec']['seed'],
            'checkpoint' => $ckpt, 'discoveries' => [['genes' => $genes, 'freshCount' => 192, 'replay' => [[0, 0], [2, 1]],
                'accuracy' => 0.6 + $i / 100, 'recall' => 0.8, 'specificity' => 0.4, 'demoAccuracy' => 0.6]]]]);
        $dg->db->exec("UPDATE inverse_discoveries SET created_at = '2026-11-24T1" . (5 + $i) . ":00:00+00:00' WHERE seed = $sd");
    }
    $raw = $dg->inverseDiscoveries();
    if (!$dd) {
        check(count($raw) === 3 && substr_count(pageDiscoveries($dg, []), 'data-index="') - substr_count(pageDiscoveries($dg, []), 'data-index="-') === 3 && !str_contains(pageDiscoveries($dg, []), 'Shared designer:'), 'dedupe off: the gallery lists every find, as before');
        continue;
    }
    $ded = $dg->inverseDiscoveriesDeduped();
    $twice = array_values(array_filter($ded, static fn ($x) => $x['confirmations'] === 1));
    check(count($raw) === 3 && count($ded) === 2 && count($twice) === 1 && $twice[0]['seed'] === 601 && abs($twice[0]['held'] - 0.61) < 1e-9,
        'dedupe on: a circuit found twice shows once, credited to the first find, with the best score and "confirmed 1 more time"');
    $html = pageDiscoveries($dg, []);
    check(str_contains($html, '✓1') && str_contains($html, 'Shared designer: level 0') && (int) $dgDb->query('SELECT COUNT(*) FROM inverse_discoveries')->fetchColumn() === 3,
        'the page shows the confirmation count and the designer level; storage keeps every row');
}

foreach (glob($dir . '/*') ?: [] as $f) {
    unlink($f);
}
rmdir($dir);
echo $fail === 0 ? "ALL OK ($n checks)\n" : "$fail of $n checks FAILED\n";
exit($fail === 0 ? 0 : 1);
