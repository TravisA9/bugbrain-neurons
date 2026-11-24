<?php
declare(strict_types=1);
/* php private/bin/job-indexes.php            shows the index it would add and the statement (changes nothing)
 * php private/bin/job-indexes.php --apply    adds it (online on MySQL/MariaDB; run from the command line, at a quiet time)
 * Optional. One index, jobs(status, project_id), for the existing claim/supply queries that otherwise scan every job row.
 * Safe to run more than once. Prints no credentials. */
$private = dirname(__DIR__);
require $private . '/src/App.php';
$configPath = $private . '/config.php';
if (PHP_SAPI !== 'cli' || !is_file($configPath)) {
    fwrite(STDERR, "Run from the command line on the server (needs private/config.php).\n");
    exit(1);
}
$config = require $configPath;
if ($config['driver'] === 'sqlite') {
    $db = new PDO('sqlite:' . $config['sqlite']['path']);
} else {
    $m = $config['mysql'];
    $db = new PDO('mysql:host=' . $m['host'] . ';dbname=' . $m['database'] . ';charset=' . ($m['charset'] ?? 'utf8mb4'), (string) $m['user'], (string) $m['password']);
}
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$app = new App($db, $config);
$apply = in_array('--apply', $argv, true);
$rows = $config['driver'] === 'sqlite' ? null : $db->query("SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'")->fetchColumn();
$r = $app->jobStatusIndex($apply);
echo 'jobs rows (estimate): ' . ($rows === null ? 'n/a' : (string) $rows) . "\n";
echo $r['index'] . ' on (' . $r['columns'] . '): ' . ($r['existed'] ? 'already there' : ($r['applied'] ? 'added in ' . $r['seconds'] . ' s' : 'missing; would run: ' . $r['sql'])) . "\n";
