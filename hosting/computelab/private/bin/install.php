<?php
declare(strict_types=1);
/* php private/bin/install.php --username OWNER --password-env COORD_OWNER_PASSWORD
 * Creates tables and the owner account. Does not print the password. */
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
$username = '';
for ($i = 1; $i < $argc; $i++) {
    if ($argv[$i] === '--username' && isset($argv[$i + 1])) {
        $username = (string) $argv[++$i];
    }
}
$env = getenv('COORD_OWNER_PASSWORD');
$password = is_string($env) ? $env : '';
if ($username === '' || $password === '') {
    fwrite(STDERR, "Pass --username and set COORD_OWNER_PASSWORD.\n");
    exit(1);
}
$app->createOwner($username, $password);
echo "Owner account created. Protocol hash " . $app->protocolHash() . "\n";
