<?php
declare(strict_types=1);
/* php private/bin/experiments.php validate [dir]
 *   Checks every experiment spec (private/experiments/*.json) without touching the database. Exit 1 on any error.
 * php private/bin/experiments.php report
 *   Prints the aggregated experiment report as JSON (same as GET /experiments.json). Reads config.php; prints no secrets. */
$private = dirname(__DIR__);
require $private . '/src/App.php';
$cmd = $argv[1] ?? 'validate';
if ($cmd === 'validate') {
    $dir = $argv[2] ?? ($private . '/experiments');
    $loaded = Experiments::load($dir);
    foreach ($loaded['specs'] as $id => $spec) {
        echo 'ok   ' . $id . ' (' . $spec['status'] . ")\n";
    }
    foreach ($loaded['errors'] as $id => $errs) {
        fwrite(STDERR, 'FAIL ' . $id . ': ' . implode('; ', $errs) . "\n");
    }
    exit($loaded['errors'] === [] ? 0 : 1);
}
if ($cmd === 'report') {
    $config = require $private . '/config.php';
    if ($config['driver'] === 'sqlite') {
        $db = new PDO('sqlite:' . $config['sqlite']['path']);
    } else {
        $m = $config['mysql'];
        $db = new PDO('mysql:host=' . $m['host'] . ';dbname=' . $m['database'] . ';charset=' . ($m['charset'] ?? 'utf8mb4'), (string) $m['user'], (string) $m['password']);
    }
    $app = new App($db, $config);
    echo json_encode($app->experimentsReport(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit(0);
}
fwrite(STDERR, "Usage: php private/bin/experiments.php validate [dir] | report\n");
exit(2);
