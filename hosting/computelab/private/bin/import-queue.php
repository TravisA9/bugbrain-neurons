<?php
declare(strict_types=1);
/* php private/bin/import-queue.php --dir /path/to/queue-checkout
 * Copies job titles and done summaries into the coordinator database.
 * Finished git jobs become history. Unfinished ones are held, not assigned,
 * because the old files are not an approved template. */
$private = dirname(__DIR__);
require $private . '/src/App.php';
$config = require $private . '/config.php';
if ($config['driver'] === 'sqlite') {
    $db = new PDO('sqlite:' . $config['sqlite']['path']);
} else {
    $m = $config['mysql'];
    $db = new PDO('mysql:host=' . $m['host'] . ';dbname=' . $m['database'] . ';charset=' . ($m['charset'] ?? 'utf8mb4'), (string) $m['user'], (string) $m['password']);
}
$app = new App($db, $config);
$app->migrate();
$dir = '';
for ($i = 1; $i < $argc; $i++) {
    if ($argv[$i] === '--dir' && isset($argv[$i + 1])) {
        $dir = (string) $argv[++$i];
    }
}
if ($dir === '') {
    fwrite(STDERR, "Pass --dir.\n");
    exit(1);
}
$n = $app->importQueueDir($dir);
echo "Imported $n job records. Unfinished git jobs are held until you queue an approved template.\n";
