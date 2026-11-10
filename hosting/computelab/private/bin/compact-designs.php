<?php
declare(strict_types=1);
/* php private/bin/compact-designs.php prune [--keep=2000]
 * php private/bin/compact-designs.php finish
 *
 * One-time shrink of the design library after it outgrew the host's 3 GB database limit (the host then refuses
 * INSERT, UPDATE and CREATE but still allows SELECT, DELETE and ALTER).
 *   prune   Saves every computer's credit totals to worker-totals-seed.json, drops indexes nothing uses, deletes the
 *           designs outside the keep policy (App::pruneDesigns) with their genomes, and rebuilds the tables so the
 *           space is given back. Uses only SELECT, DELETE and ALTER.
 *   finish  Once writes work again: runs the schema setup (new tables, credit totals from the seed file, score
 *           columns) and prints the leaderboard. */
$private = dirname(__DIR__);
require $private . '/src/App.php';
$config = require $private . '/config.php';
$phase = $argv[1] ?? '';
$keep = 2000;
foreach ($argv as $arg) {
    if (preg_match('/^--keep=(\d+)$/', $arg, $m)) {
        $keep = (int) $m[1];
    }
}
if ($config['driver'] === 'sqlite') {
    $db = new PDO('sqlite:' . $config['sqlite']['path']);
} else {
    $m = $config['mysql'];
    $db = new PDO('mysql:host=' . $m['host'] . ';dbname=' . $m['database'] . ';charset=' . ($m['charset'] ?? 'utf8mb4'), (string) $m['user'], (string) $m['password']);
}
$app = new App($db, $config);
ini_set('memory_limit', '1024M');
$mysql = $config['driver'] !== 'sqlite';

function sizes(PDO $db, bool $mysql): string
{
    if (!$mysql) {
        return 'sqlite';
    }
    $out = [];
    $total = 0.0;
    foreach ($db->query('SELECT table_name AS t, table_rows AS r, (data_length + index_length) / 1048576 AS mb FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY data_length + index_length DESC')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $total += (float) $row['mb'];
        if ((float) $row['mb'] >= 1) {
            $out[] = $row['t'] . ' ~' . $row['r'] . ' rows ' . round((float) $row['mb']) . ' MB';
        }
    }
    return round($total) . ' MB total: ' . implode(', ', $out);
}

function indexNames(PDO $db, string $table): array
{
    $have = [];
    foreach ($db->query('SHOW INDEX FROM `' . $table . '`')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $have[(string) $row['Key_name']] = true;
    }
    return $have;
}

function columnNames(PDO $db, string $table): array
{
    $have = [];
    foreach ($db->query('SHOW COLUMNS FROM `' . $table . '`')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $have[(string) $row['Field']] = true;
    }
    return $have;
}

$t0 = microtime(true);
$lap = function (string $what) use (&$t0): void {
    printf("%s (%.1fs)\n", $what, microtime(true) - $t0);
    $t0 = microtime(true);
};

if ($phase === 'prune') {
    echo 'before: ' . sizes($db, $mysql) . "\n";
    echo 'rows: ' . $db->query('SELECT COUNT(*) FROM design_records')->fetchColumn() . ' records, ' . $db->query('SELECT COUNT(*) FROM design_genomes')->fetchColumn() . " genomes\n";
    $seedFile = (string) ($config['totals_seed'] ?? ($private . '/worker-totals-seed.json'));
    if (!is_file($seedFile) && !is_file($seedFile . '.applied')) {
        $totals = $app->workerTotalsFromRows();
        file_put_contents($seedFile, json_encode($totals, JSON_PRETTY_PRINT));
        chmod($seedFile, 0600);
        foreach ($totals as $w => $t) {
            echo "credit $w: {$t['n']} records, {$t['genomes']} genomes, {$t['ms']} ms, tasks " . implode(',', $t['tasks']) . "\n";
        }
        $lap('credit totals saved to ' . basename($seedFile));
    } else {
        echo "credit totals file already there, kept\n";
    }
    if ($mysql) {
        // Overlapping indexes: Hostinger's wdbi_* copies and the old engine/task index. Dropping them first also makes the deletes cheaper.
        $drop = [];
        foreach (array_keys(indexNames($db, 'design_records')) as $name) {
            if (strpos($name, 'wdbi_') === 0 || $name === 'idx_dr_engine_task') {
                $drop[] = 'DROP INDEX `' . $name . '`';
            }
        }
        if ($drop !== []) {
            $db->exec('ALTER TABLE design_records ' . implode(', ', $drop));
            $lap('dropped ' . count($drop) . ' overlapping indexes on design_records');
        }
    }
    $res = $app->pruneDesigns($keep, 500, 200, 3000);
    foreach ($res['tasks'] as $task => $t) {
        echo "task $task: {$t['rows']} rows, deleted {$t['deleted']}\n";
    }
    $lap("pruned: keep $keep per task; deleted {$res['records']} records, {$res['genomes']} genomes, {$res['confirmations']} confirmations, {$res['checkpoints']} old checkpoints; kept {$res['kept']}; finished " . ($res['finished'] ? 'yes' : 'NO'));
    if ($mysql && $res['finished']) {
        $cols = columnNames($db, 'design_records');
        $idx = indexNames($db, 'design_records');
        $parts = [];
        if (!isset($cols['held'])) {
            $parts[] = 'ADD COLUMN held DOUBLE NULL';
        }
        if (!isset($cols['quality'])) {
            $parts[] = 'ADD COLUMN quality DOUBLE NULL';
        }
        foreach (['idx_dr_task_held' => 'task_id, held', 'idx_dr_task_quality' => 'task_id, quality', 'idx_dr_job' => 'job_id'] as $name => $colsOf) {
            if (!isset($idx[$name])) {
                $parts[] = 'ADD INDEX ' . $name . ' (' . $colsOf . ')';
            }
        }
        $parts[] = 'FORCE';
        $db->exec('ALTER TABLE design_records ' . implode(', ', $parts));
        $lap('rebuilt design_records (' . implode(', ', $parts) . ')');
        if (!isset(columnNames($db, 'worker_totals')['genomes'])) {
            $db->exec('ALTER TABLE worker_totals ADD COLUMN genomes BIGINT NOT NULL DEFAULT 0');
        }
        foreach (['design_genomes', 'design_confirmations', 'model_checkpoints'] as $table) {
            $db->exec('ALTER TABLE `' . $table . '` FORCE');
            $lap("rebuilt $table");
        }
    }
    echo 'after: ' . sizes($db, $mysql) . "\n";
    echo 'rows: ' . $db->query('SELECT COUNT(*) FROM design_records')->fetchColumn() . ' records, ' . $db->query('SELECT COUNT(*) FROM design_genomes')->fetchColumn() . " genomes\n";
    exit(0);
}
if ($phase === 'finish') {
    $app->migrate();
    $lap('schema current; credit totals from the seed file applied if it was there');
    $n = $app->backfillScores();
    $lap("score columns filled on $n rows");
    foreach ($app->leaderboard(20) as $row) {
        echo "board {$row['name']}: {$row['records']} records, {$row['genomes']} genomes, " . round($row['hours'], 2) . " h\n";
    }
    echo 'after: ' . sizes($db, $mysql) . "\n";
    exit(0);
}
fwrite(STDERR, "usage: compact-designs.php prune [--keep=2000] | finish\n");
exit(2);
