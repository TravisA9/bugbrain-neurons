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
    'pause_legacy_spikefoundry_search' => false,
    'inverse_gallery' => false,
    'inverse_shared_training' => false,
    'inverse_composition' => false,
    'inverse_sequence' => false,
    'sequence_experiment' => ['rounds' => 6, 'cpuBudgetMs' => 1000, 'cap' => 3000],
    /* Server-defined experiments (private/experiments/*.json, see EXPERIMENTS.md). Off by default. When on, the
     * planner queues runs of every spec with status active and hands them only to computers whose worker reports
     * experiment protocol >= the spec's and enough memory; their results are aggregated at /experiments.json. */
    'experiments_enabled' => false,
    'experiments_enable' => [],                // ids of specs shipped with "enabled": false to switch on, e.g. ['r146-lagdepth']
    'experiment_seed_start' => 5001,        // first seed of the fresh-seed ledger (box runs used up to ~2980)
    'experiment_mem_reserve_gb' => 4,       // memory left to the volunteer before counting experiment slots
    'experiment_max_per_worker' => 0,          // extra cap on experiment runs per computer (0 = memory rule only: floor((memGB - reserve) / spec memGB))
    'experiment_max_minutes' => 0,             // an experiment run with no result after this long loses its lease (0 = 3 x spec requires.minutes, else 360)
    /* Job types never supplied or handed out (config only; rows are kept). Recommended once experiments run:
     * ['bb-order3', 'bb-chunk-fables', 'bb-chunk-order3', 'sf-propose', 'sf-train', 'sf-vision'] */
    'retire_job_types' => [],
    /* Inverse designer compute policy (all off by default = behaviour as before). Suggested once experiments run:
     * gate 1, margin 1, stall 300, share 0.1, composition queue 4, composition first. */
    'inverse_promotion_audit_gate' => false,   // also require the held-back audit score to improve before promoting
    'inverse_promotion_audit_margin' => 1,     // audit trials (of 36) the candidate must gain over the champion
    'inverse_stall_jobs' => 0,                 // N finished plain inverse jobs with no promotion -> stop plain inverse supply
    'inverse_share_max' => 0,                  // 0..1: share of online slots plain inverse may hold while other work waits
    'inverse_composition_queue' => 1,          // composition pilots kept in flight
    'inverse_composition_first' => false,      // hand out composition pilots before plain inverse jobs
    'discoveries_dedupe' => false,             // public gallery: each circuit once ("confirmed N times"), smaller circuits kept, champion level + audit shown
    'login_per_minute' => 8,
    'api_per_minute' => 120,
    'design_per_minute' => 60,
    /* Discoveries shows the top N per quality measure per task (held-out, train, efficiency,
     * margin over random) after a quality floor. Storage keeps the top K per measure. */
    'discoveries_top_n' => 8,
    'design_keep_per_measure' => 200,
    'discoveries_floor_ratio' => 0.5,
    'engine_js' => dirname(__DIR__, 3) . '/spikefoundry/engine.js',
    'lab_html' => dirname(__DIR__, 3) . '/spikefoundry/lab.html',
    'protocol' => dirname(__DIR__) . '/PROTOCOL.txt',
];
