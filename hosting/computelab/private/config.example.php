<?php
/* Copy to config.php next to this file, outside the public web root when you can.
 * Do not commit config.php. */
return [
    'driver' => 'mysql',
    'mysql' => [
        'host' => 'localhost',
        'database' => 'computelab',
        'user' => 'computelab',
        'password' => 'replace-me',
        'charset' => 'utf8mb4',
    ],
    'sqlite' => [
        'path' => dirname(__DIR__) . '/private/data/computelab.sqlite',
    ],
    /* Path visitors use, no trailing slash. Empty string if the app is the whole host. */
    'base_path' => '/computelab',
    /* Public address the setup download writes for workers. Empty uses the address of the current request. */
    'public_url' => 'https://zaga.info/computelab',
    'worker_repo' => 'https://github.com/TravisA9/bugbrain-neurons.git',
    /* Branch that contains run/coord.js. After this work is merged, neuro/distributed-queue is the long-lived name. */
    'worker_ref' => 'cursor/worker-console-22bf',
    'lease_seconds' => 900,
    'max_attempts' => 3,
    'result_bytes' => 32768,
    'login_per_minute' => 8,
    'api_per_minute' => 120,
    'engine_js' => dirname(__DIR__, 3) . '/spikefoundry/engine.js',
    'lab_html' => dirname(__DIR__, 3) . '/spikefoundry/lab.html',
    'protocol' => dirname(__DIR__) . '/PROTOCOL.txt',
];
