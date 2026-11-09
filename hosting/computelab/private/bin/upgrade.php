<?php
declare(strict_types=1);
/* php private/bin/upgrade.php
 * Adds missing columns on an existing SQLite or MySQL database. Keeps every row.
 * Safe to run more than once. The web app also runs this upgrade on each request. */
$private = dirname(__DIR__);
require $private . '/src/App.php';
$configPath = $private . '/config.php';
if (!is_file($configPath)) {
    fwrite(STDERR, "Copy config.example.php to config.php and edit it first.\n");
    exit(1);
}
$config = require $configPath;
if ($config['driver'] === 'sqlite') {
    $dir = dirname((string) $config['sqlite']['path']);
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    $db = new PDO('sqlite:' . $config['sqlite']['path']);
} else {
    $m = $config['mysql'];
    $dsn = 'mysql:host=' . $m['host'] . ';dbname=' . $m['database'] . ';charset=' . ($m['charset'] ?? 'utf8mb4');
    $db = new PDO($dsn, (string) $m['user'], (string) $m['password']);
}
$app = new App($db, $config);
$app->migrate();
echo "Schema is current. Added any missing job, project, worker, lease, and result columns. Existing rows were kept.\n";
foreach ($app->watchedTasks() as $health) {
    $policy = $health['policy'];
    $best = 0.0;
    foreach ($health['points'] as $point) {
        $best = max($best, (float) $point['bestHeld']);
    }
    echo 'Task ' . $health['task_id'] . ': ' . $health['status'] . ', best held-out ' . sprintf('%.3f', $best)
        . ((int) $policy['paused'] === 1 ? ', paused (' . $policy['pause_reason'] . ')' . ($policy['advanced_to'] !== '' ? ', next ' . $policy['advanced_to'] : '') : ', active') . ".\n";
}

