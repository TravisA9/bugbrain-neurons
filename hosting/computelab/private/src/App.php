<?php
declare(strict_types=1);
require_once __DIR__ . '/compat.php';

/** Coordinator for shared hosting. SQLite in tests, MySQL/MariaDB on Hostinger. */
final class App
{
    public PDO $db;
    /** @var array<string,mixed> */
    public array $config;
    /** @var callable():string */
    public $clock;
    /** Test hook: runs after a fitting job is chosen and before the conditional lease update. */
    public $beforeLease;

    public function __construct(PDO $db, array $config, ?callable $clock = null)
    {
        $this->db = $db;
        $this->config = $config;
        $this->clock = $clock ?? static fn (): string => gmdate('c');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        if (($this->config['driver'] ?? '') === 'sqlite') {
            $this->db->exec('PRAGMA busy_timeout = 8000');
        }
    }

    public function now(): string
    {
        return ($this->clock)();
    }

    public function base(): string
    {
        return rtrim((string) ($this->config['base_path'] ?? ''), '/');
    }

    /* Schema setup runs from the command line (deploy, tests, bin/upgrade) and once per App.php build on the web.
     * It used to run on every request: a dozen CREATE TABLE IF NOT EXISTS / SHOW INDEX / SHOW COLUMNS statements
     * that each need a metadata lock on the tables. On the live MariaDB they queued behind any long read of
     * design_records and every request after them queued too, so the whole app stalled for a minute or more
     * every few minutes. */
    public function migrate(): void
    {
        $stamp = (string) ($this->config['schema_stamp'] ?? (dirname(__DIR__) . '/schema.stamp'));
        $key = sha1(implode('|', [(string) @filemtime(__FILE__), (string) @filesize(__FILE__), (string) ($this->config['driver'] ?? ''),
            (string) ($this->config['sqlite']['path'] ?? ''), (string) ($this->config['mysql']['host'] ?? ''), (string) ($this->config['mysql']['database'] ?? '')]));
        if (PHP_SAPI === 'cli') {
            $this->migrateNow();
            $this->writeStamp($stamp, $key);
            return;
        }
        if (@file_get_contents($stamp) === $key) {
            return;
        }
        $lock = @fopen($stamp . '.lock', 'c');
        if ($lock !== false && !flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock); // another request is migrating right now
            return;
        }
        try {
            if (@file_get_contents($stamp) !== $key) {
                $this->migrateNow();
                $this->writeStamp($stamp, $key);
            }
        } catch (PDOException $e) {
            // The host refused schema changes (read-only database): serve with the schema as it is.
        } finally {
            if ($lock !== false) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    private function writeStamp(string $stamp, string $key): void
    {
        $tmp = $stamp . '.tmp' . getmypid();
        if (@file_put_contents($tmp, $key) !== false) {
            @rename($tmp, $stamp);
        }
    }

    public function migrateNow(): void
    {
        $auto = $this->config['driver'] === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INTEGER PRIMARY KEY AUTO_INCREMENT';
        $this->db->exec('CREATE TABLE IF NOT EXISTS owner (
            id INTEGER PRIMARY KEY,
            username VARCHAR(191) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS projects (
            id VARCHAR(191) PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            priority INTEGER NOT NULL,
            enabled INTEGER NOT NULL,
            family VARCHAR(32),
            auto_jobs INTEGER,
            low_water INTEGER NOT NULL DEFAULT 0,
            queue_cap INTEGER NOT NULL DEFAULT 8,
            evals_per_job INTEGER NOT NULL DEFAULT 0,
            target_seconds INTEGER NOT NULL DEFAULT 180,
            keep_top INTEGER NOT NULL DEFAULT 50,
            keep_random INTEGER NOT NULL DEFAULT 500,
            auto_created INTEGER NOT NULL DEFAULT 0,
            auto_note TEXT
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS supply_state (
            id VARCHAR(191) PRIMARY KEY,
            ran_at TEXT NOT NULL,
            note TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS design_summaries (
            id VARCHAR(191) PRIMARY KEY,
            job_id VARCHAR(191),
            task_id VARCHAR(64) NOT NULL,
            worker_id VARCHAR(191) NOT NULL,
            engine_version VARCHAR(32) NOT NULL,
            evals INTEGER NOT NULL,
            designer_evals INTEGER NOT NULL,
            random_evals INTEGER NOT NULL,
            eval_ms INTEGER NOT NULL,
            best_held REAL NOT NULL,
            best_train REAL NOT NULL,
            designer_mean REAL NOT NULL,
            random_mean REAL NOT NULL,
            histogram_json TEXT NOT NULL,
            curve_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS templates (
            id VARCHAR(191) PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            runner TEXT NOT NULL,
            spec_json TEXT NOT NULL,
            code_hash TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS approved_code (
            hash VARCHAR(191) PRIMARY KEY,
            label TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS jobs (
            id VARCHAR(191) PRIMARY KEY,
            project_id TEXT NOT NULL,
            template_id TEXT NOT NULL,
            title TEXT NOT NULL,
            spec_json TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            priority REAL NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            not_before VARCHAR(40),
            last_worker VARCHAR(191),
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS workers (
            id VARCHAR(191) PRIMARY KEY,
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            consent_at TEXT NOT NULL,
            paused INTEGER NOT NULL,
            revoked INTEGER NOT NULL,
            allowed_json TEXT NOT NULL,
            max_batches INTEGER NOT NULL,
            last_seen TEXT,
            participant_id VARCHAR(191),
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS leases (
            job_id VARCHAR(191) PRIMARY KEY,
            worker_id TEXT NOT NULL,
            until_at TEXT NOT NULL,
            heartbeat_at TEXT NOT NULL,
            started_at VARCHAR(40),
            progress INTEGER
        )');
        $this->db->exec("CREATE TABLE IF NOT EXISTS results (
            id $auto,
            job_id TEXT NOT NULL,
            worker_id TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT NOT NULL,
            body_json TEXT NOT NULL,
            seconds INTEGER,
            created_at TEXT NOT NULL
        )");
        $this->db->exec('CREATE TABLE IF NOT EXISTS sessions (
            id VARCHAR(191) PRIMARY KEY,
            role TEXT NOT NULL,
            subject TEXT NOT NULL,
            csrf TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS model_checkpoints (
            id VARCHAR(191) PRIMARY KEY,
            label VARCHAR(64) NOT NULL,
            body_json TEXT NOT NULL,
            metric_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS sequence_checkpoints (
            job_id VARCHAR(191) PRIMARY KEY,
            completed_rounds INTEGER NOT NULL,
            payload MEDIUMTEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS sequence_study_results (
            job_id VARCHAR(191) PRIMARY KEY,
            seed INTEGER NOT NULL,
            result_id INTEGER NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS inverse_discoveries (
            id VARCHAR(64) PRIMARY KEY,
            worker_id VARCHAR(191) NOT NULL,
            seed INTEGER NOT NULL,
            case_count INTEGER NOT NULL,
            accuracy DOUBLE NOT NULL,
            recall DOUBLE,
            specificity DOUBLE,
            demo_accuracy DOUBLE NOT NULL,
            circuit_json TEXT NOT NULL,
            created_at VARCHAR(40) NOT NULL
        )');
        $this->ensureIndexes('inverse_discoveries', [
            'idx_inverse_accuracy' => 'accuracy, created_at',
            'idx_inverse_recall' => 'recall, created_at',
            'idx_inverse_specificity' => 'specificity, created_at',
            'idx_inverse_demo' => 'demo_accuracy, created_at',
            'idx_inverse_created' => 'created_at',
        ]);
        $this->db->exec('CREATE TABLE IF NOT EXISTS inverse_worker_models (
            worker_id VARCHAR(191) PRIMARY KEY,
            seed INTEGER NOT NULL,
            checkpoint TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS inverse_champion (
            id INTEGER PRIMARY KEY,
            benchmark VARCHAR(32) NOT NULL,
            generation INTEGER NOT NULL,
            job_id VARCHAR(191),
            checkpoint TEXT,
            passes_json TEXT,
            audit_passed INTEGER,
            promoted_at VARCHAR(40)
        )');
        if (!$this->db->query('SELECT id FROM inverse_champion WHERE id = 1')->fetchColumn()) {
            try {
                $this->db->prepare('INSERT INTO inverse_champion (id, benchmark, generation) VALUES (1, ?, 0)')
                    ->execute([self::INVERSE_SHARED_BENCHMARK]);
            } catch (PDOException $e) {
                if ((string) $e->getCode() !== '23000') {
                    throw $e;
                }
            }
        }
        $this->db->exec('CREATE TABLE IF NOT EXISTS design_genomes (
            hash VARCHAR(191) PRIMARY KEY,
            genome_json TEXT NOT NULL,
            version INTEGER NOT NULL,
            is_public INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS design_events (
            id VARCHAR(191) PRIMARY KEY,
            worker_id VARCHAR(191) NOT NULL,
            task_id VARCHAR(64) NOT NULL,
            kind VARCHAR(32) NOT NULL,
            detail TEXT NOT NULL,
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS design_records (
            id VARCHAR(191) PRIMARY KEY,
            genome_hash VARCHAR(191) NOT NULL,
            task_id VARCHAR(64) NOT NULL,
            task_version VARCHAR(32) NOT NULL,
            score_json TEXT NOT NULL,
            neurons INTEGER NOT NULL,
            synapses INTEGER NOT NULL,
            spikes INTEGER NOT NULL,
            eval_ms INTEGER NOT NULL,
            engine_version VARCHAR(32) NOT NULL,
            protocol_hash VARCHAR(64) NOT NULL,
            worker_id VARCHAR(191) NOT NULL,
            seed INTEGER NOT NULL,
            job_id VARCHAR(191),
            arm VARCHAR(16) NOT NULL DEFAULT \'designer\',
            seq INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS task_policies (
            id VARCHAR(191) PRIMARY KEY,
            project_id VARCHAR(191) NOT NULL,
            task_id VARCHAR(64) NOT NULL,
            stall_delta REAL NOT NULL,
            stall_evals INTEGER NOT NULL,
            stall_hours REAL NOT NULL,
            stall_action VARCHAR(16) NOT NULL,
            paused INTEGER NOT NULL,
            pause_reason VARCHAR(16),
            advanced_to VARCHAR(64)
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS rate_limits (
            bucket VARCHAR(191) PRIMARY KEY,
            window_start TEXT NOT NULL,
            hits INTEGER NOT NULL
        )');
        $this->ensureColumn('jobs', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
        $this->ensureColumn('jobs', 'last_error', 'TEXT');
        $this->ensureColumn('jobs', 'not_before', 'VARCHAR(40)');
        $this->ensureColumn('jobs', 'last_worker', 'VARCHAR(191)');
        $this->ensureColumn('projects', 'family', 'VARCHAR(32)');
        $this->ensureColumn('workers', 'participant_id', 'VARCHAR(191)');
        $this->ensureColumn('leases', 'started_at', 'VARCHAR(40)');
        $this->ensureIndexes('design_records', [
            'idx_dr_seq' => 'seq',
            'idx_dr_task_seq' => 'task_id, seq',
            'idx_dr_worker_task' => 'worker_id, task_id',
        ]);
        $this->ensureColumn('leases', 'progress', 'INTEGER');
        // One entry per distinct design: canonical design hash, first finder kept, repeats counted as confirmations.
        $this->ensureColumn('design_records', 'design_hash', 'VARCHAR(64)');
        $this->ensureColumn('design_records', 'canon_key', 'VARCHAR(64)');
        $this->ensureColumn('design_records', 'duplicate_of', 'VARCHAR(191)');
        $this->ensureColumn('design_records', 'confirmations', 'INTEGER NOT NULL DEFAULT 0');
        $this->ensureColumn('design_genomes', 'design_hash', 'VARCHAR(64)');
        $this->ensureColumn('jobs', 'seed', 'INTEGER');
        $this->db->exec('CREATE TABLE IF NOT EXISTS design_confirmations (
            design_id VARCHAR(191) NOT NULL,
            worker_id VARCHAR(191) NOT NULL,
            n INTEGER NOT NULL,
            first_at VARCHAR(40) NOT NULL,
            last_at VARCHAR(40) NOT NULL,
            PRIMARY KEY (design_id, worker_id)
        )');
        $this->ensureIndexes('design_records', [
            'idx_dr_task_design' => 'task_id, design_hash',
            'ux_dr_canon' => 'task_id, canon_key',
            'idx_dr_genome' => 'genome_hash',
            'idx_dr_job' => 'job_id',
        ]);
        /* Held-out score and quality as columns, so the kept set and the top designs come from an index. */
        $this->ensureColumn('design_records', 'held', 'DOUBLE NULL');
        $this->ensureColumn('design_records', 'quality', 'DOUBLE NULL');
        $this->ensureIndexes('design_records', [
            'idx_dr_task_held' => 'task_id, held',
            'idx_dr_task_quality' => 'task_id, quality',
        ]);
        $this->backfillScores(5000);
        /* engine_version, task_id only served the old full-table scans; task_seq covers the per-task reads. */
        $this->dropIndexes('design_records', ['idx_dr_engine_task']);
        $this->ensureIndexes('design_genomes', ['idx_dg_design' => 'design_hash']);
        /* Shared cache for expensive read-only pages (Discoveries). One request rebuilds a stale entry while the
         * others keep serving the old copy. */
        $this->db->exec('CREATE TABLE IF NOT EXISTS page_cache (
            k VARCHAR(64) PRIMARY KEY,
            body ' . (($this->config['driver'] ?? '') === 'sqlite' ? 'TEXT' : 'LONGTEXT') . ' NOT NULL,
            built_at INTEGER NOT NULL,
            building_until INTEGER NOT NULL DEFAULT 0
        )');
        /* Running credit totals per computer. Every upload used to count and sum all of the computer's records (one
         * computer has ~945k) twice per request; uploads arrive in waves as job slots finish together, and those scans
         * stalled every page for about a minute every three minutes. */
        $this->db->exec('CREATE TABLE IF NOT EXISTS worker_totals (
            worker_id VARCHAR(191) PRIMARY KEY,
            n INTEGER NOT NULL,
            ms BIGINT NOT NULL,
            tasks TEXT NOT NULL
        )');
        $this->ensureColumn('worker_totals', 'genomes', 'BIGINT NOT NULL DEFAULT 0');
        /* Records seen per task, kept or not: the library only keeps each task's best designs (see keepPerTask). */
        $this->db->exec('CREATE TABLE IF NOT EXISTS task_totals (
            task_id VARCHAR(64) PRIMARY KEY,
            seen BIGINT NOT NULL,
            kept BIGINT NOT NULL,
            ms BIGINT NOT NULL
        )');
        /* Receipts of design uploads, so a retried upload is not counted twice (kept 3 days). */
        $this->db->exec('CREATE TABLE IF NOT EXISTS upload_batches (
            id VARCHAR(64) PRIMARY KEY,
            worker_id VARCHAR(191) NOT NULL,
            created_at VARCHAR(40) NOT NULL
        )');
        $this->seedWorkerTotalsFromFile();
        $this->ensureIndexes('jobs', ['idx_jobs_seed' => 'seed']);
        $this->ensureColumn('results', 'seconds', 'INTEGER');
        $this->ensureColumn('design_records', 'arm', "VARCHAR(16) NOT NULL DEFAULT 'designer'");
        $this->ensureColumn('design_records', 'seq', 'INTEGER NOT NULL DEFAULT 0');
        $this->ensureColumn('design_genomes', 'is_public', 'INTEGER NOT NULL DEFAULT 0');
        $this->ensureColumn('task_policies', 'auto_advance', 'INTEGER NOT NULL DEFAULT 1');
        $this->ensureColumn('task_policies', 'solve_score', 'REAL NOT NULL DEFAULT 0.97');
        $this->ensureColumn('task_policies', 'solve_jobs', 'INTEGER NOT NULL DEFAULT 3');
        $this->ensureColumn('workers', 'public_credit', 'INTEGER NOT NULL DEFAULT 1');
        /* Resource control replaces the old On/Off switch. Existing computers keep what they
         * were doing: Off stays Off, On becomes Full blast (one job at normal priority was the
         * old meaning of On). New computers start in Allowance at 50%. */
        $freshMode = !$this->hasColumn('workers', 'resource_mode');
        $this->ensureColumn('workers', 'resource_mode', "VARCHAR(16) NOT NULL DEFAULT 'allowance'");
        $this->ensureColumn('workers', 'allowance_pct', 'INTEGER NOT NULL DEFAULT 50');
        /* Experiments at once: 0 is Auto (the mode decides), 1..64 caps the job slots. */
        $this->ensureColumn('workers', 'max_jobs', 'INTEGER NOT NULL DEFAULT 0');
        /* A removed computer is a tombstone: the row stays so credit, design records, results and
         * job history keep their name, but it no longer shows in the Owner console. Only revoked
         * computers can be removed. */
        $this->ensureColumn('workers', 'removed_at', 'VARCHAR(40) NULL');
        $this->ensureColumn('workers', 'runtime_json', 'TEXT');
        /* Set when someone turns a stopped computer on: "Starting…" until a heartbeat newer than this arrives. */
        $this->ensureColumn('workers', 'restart_requested_at', 'VARCHAR(40) NULL');
        if ($freshMode) {
            $this->db->exec("UPDATE workers SET resource_mode = 'off' WHERE paused = 1");
            $this->db->exec("UPDATE workers SET resource_mode = 'full' WHERE paused = 0");
        }
        $this->ensureColumn('leases', 'slot', 'INTEGER NOT NULL DEFAULT 0');
        $freshAuto = !$this->hasColumn('projects', 'auto_jobs');
        $this->ensureColumn('projects', 'auto_jobs', 'INTEGER');
        $this->ensureColumn('projects', 'low_water', 'INTEGER NOT NULL DEFAULT 0');
        $this->ensureColumn('projects', 'queue_cap', 'INTEGER NOT NULL DEFAULT 8');
        $this->ensureColumn('projects', 'evals_per_job', 'INTEGER NOT NULL DEFAULT 100000');
        $freshSeconds = !$this->hasColumn('projects', 'target_seconds');
        $this->ensureColumn('projects', 'target_seconds', 'INTEGER NOT NULL DEFAULT 180');
        if ($freshSeconds) {
            $this->db->exec('UPDATE projects SET evals_per_job = 100000 WHERE evals_per_job > 0 AND evals_per_job <= 40');
            $this->db->exec('UPDATE projects SET target_seconds = 180 WHERE target_seconds IS NULL OR target_seconds = 0');
        }
        $this->ensureColumn('projects', 'auto_created', 'INTEGER NOT NULL DEFAULT 0');
        $this->ensureColumn('projects', 'auto_note', 'TEXT');
        $freshKeep = !$this->hasColumn('projects', 'keep_top');
        $this->ensureColumn('projects', 'keep_top', 'INTEGER NOT NULL DEFAULT 50');
        $this->ensureColumn('projects', 'keep_random', 'INTEGER NOT NULL DEFAULT 500');
        if ($freshKeep) {
            $this->db->exec('UPDATE projects SET evals_per_job = 0 WHERE evals_per_job >= 100000');
        }
        if ($freshAuto) {
            $this->db->exec("UPDATE projects SET auto_jobs = 1 WHERE id = 'spikefoundry'");
        }
        $this->ensureColumn('workers', 'last_reject', 'TEXT');
        /* Owner-console flag: this computer appears on the owner's Home (My computer).
         * It is per computer, not “all of the owner's machines”. The first schema pass
         * marks the existing travirtual machine; later passes leave the owner's choice alone. */
        $this->ensureColumn('workers', 'owner_home', 'INTEGER NOT NULL DEFAULT 0');
        $this->seedOwnerHomeTravirtual();
        $this->db->exec("CREATE TABLE IF NOT EXISTS worker_diagnostics (
            id $auto,
            worker_id VARCHAR(191) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            ok INTEGER NOT NULL,
            summary TEXT NOT NULL,
            body_json TEXT NOT NULL,
            created_at VARCHAR(40) NOT NULL
        )");
        $this->db->exec('CREATE TABLE IF NOT EXISTS setup_codes (
            id VARCHAR(191) PRIMARY KEY,
            worker_id VARCHAR(191) NOT NULL,
            sealed TEXT NOT NULL,
            expires_at VARCHAR(40) NOT NULL
        )');
        $this->seed();
        $this->refreshProtocolPins();
        $this->purgePlaceholderDesigns();
        $this->purgeDesigner2();
        $this->db->exec("UPDATE projects SET family = 'spikefoundry' WHERE id = 'spikefoundry' AND (family IS NULL OR family = '')");
        $this->db->exec("UPDATE projects SET family = 'bugbrain' WHERE id = 'bugbrain' AND (family IS NULL OR family = '')");
    }

    private function hasColumn(string $table, string $column): bool
    {
        if (!preg_match('/^[a-z_]+$/', $table) || !preg_match('/^[a-z_]+$/', $column)) {
            throw new InvalidArgumentException('Bad column.');
        }
        if (($this->config['driver'] ?? '') === 'sqlite') {
            $rows = $this->db->query('PRAGMA table_info(' . $table . ')')->fetchAll();
            foreach ($rows as $row) {
                if ((string) ($row['name'] ?? '') === $column) {
                    return true;
                }
            }
            return false;
        }
        $rows = $this->db->query('SHOW COLUMNS FROM `' . $table . '`')->fetchAll();
        foreach ($rows as $row) {
            if ((string) ($row['Field'] ?? '') === $column) {
                return true;
            }
        }
        return false;
    }

    /* Design records grow with every job; without these, each upload scanned the whole table
     * several times per record and the host flagged the slow queries. One cheap metadata
     * query per request; a missing index is created once (a racing request may create it first). */
    private function ensureIndexes(string $table, array $indexes): void
    {
        if (!preg_match('/^[a-z_]+$/', $table)) {
            throw new InvalidArgumentException('Bad table.');
        }
        $have = [];
        if (($this->config['driver'] ?? '') === 'sqlite') {
            foreach ($this->db->query('PRAGMA index_list(' . $table . ')')->fetchAll() as $row) {
                $have[(string) ($row['name'] ?? '')] = true;
            }
        } else {
            foreach ($this->db->query('SHOW INDEX FROM `' . $table . '`')->fetchAll() as $row) {
                $have[(string) ($row['Key_name'] ?? '')] = true;
            }
        }
        foreach ($indexes as $name => $columns) {
            if (isset($have[$name]) || !preg_match('/^[a-z_]+$/', $name) || !preg_match('/^[a-z_, ]+$/', $columns)) {
                continue;
            }
            try {
                // ux_ names are unique. Rows with a NULL key never clash, so old rows need no backfill first.
                $this->db->exec('CREATE ' . (strpos($name, 'ux_') === 0 ? 'UNIQUE ' : '') . 'INDEX ' . $name . ' ON ' . $table . ' (' . $columns . ')');
            } catch (PDOException $e) {
                // Another request created it at the same moment.
            }
        }
    }

    private function ensureColumn(string $table, string $column, string $definition): void
    {
        if ($this->hasColumn($table, $column)) {
            return;
        }
        $this->db->exec('ALTER TABLE `' . $table . '` ADD COLUMN `' . $column . '` ' . $definition);
    }

    private function dropIndexes(string $table, array $names): void
    {
        if (!preg_match('/^[a-z_]+$/', $table)) {
            throw new InvalidArgumentException('Bad table.');
        }
        $have = [];
        $rows = ($this->config['driver'] ?? '') === 'sqlite'
            ? $this->db->query('PRAGMA index_list(' . $table . ')')->fetchAll()
            : $this->db->query('SHOW INDEX FROM `' . $table . '`')->fetchAll();
        foreach ($rows as $row) {
            $have[(string) ($row['name'] ?? ($row['Key_name'] ?? ''))] = true;
        }
        foreach ($names as $name) {
            if (!isset($have[$name]) || !preg_match('/^[a-z0-9_]+$/', $name)) {
                continue;
            }
            $this->db->exec(($this->config['driver'] ?? '') === 'sqlite' ? 'DROP INDEX ' . $name : 'ALTER TABLE `' . $table . '` DROP INDEX `' . $name . '`');
        }
    }

    public function seed(): void
    {
        $hash = $this->protocolHash();
        $have = $this->db->prepare('SELECT hash FROM approved_code WHERE hash = ?');
        $have->execute([$hash]);
        if (!$have->fetch()) {
            $this->db->prepare('INSERT INTO approved_code (hash, label) VALUES (?, ?)')->execute([$hash, 'protocol-current']);
        }
        $legacy = '4b0e21855d9ce104a96633047e8199874524044d399c6150d02eb77e4edca4c4';
        $have->execute([$legacy]);
        if (!$have->fetch()) {
            $this->db->prepare('INSERT INTO approved_code (hash, label) VALUES (?, ?)')->execute([$legacy, 'protocol-1']);
        }
        $projects = [
            ['spikefoundry', 'SpikeFoundry', 'Synthetic design jobs. Not BugBrain accuracy.', 2, 1],
            ['bugbrain', 'BugBrain neurons', 'Existing reading and generation tests, template only.', 1, 1],
        ];
        $ins = $this->db->prepare('INSERT INTO projects (id, title, summary, priority, enabled) VALUES (?, ?, ?, ?, ?)');
        foreach ($projects as $p) {
            if (!$this->db->query('SELECT id FROM projects WHERE id = ' . $this->db->quote($p[0]))->fetch()) {
                $ins->execute($p);
            }
        }
        $templates = [
            ['sf-train', 'spikefoundry', 'Train the design model', 'spikefoundry/run.js', json_encode([
                'mode' => 'train-model', 'batches' => 1, 'taskId' => 'coincidence',
            ], JSON_THROW_ON_ERROR), $hash],
            ['sf-propose', 'spikefoundry', 'Propose and evaluate designs', 'spikefoundry/run.js', json_encode([
                'mode' => 'propose', 'batches' => 1, 'taskId' => 'coincidence',
            ], JSON_THROW_ON_ERROR), $hash],
            ['sf-sequence-experiment', 'spikefoundry', 'Run a capped sequence experiment', 'spikefoundry/run.js', json_encode([
                'mode' => 'sequence-experiment', 'batches' => 1,
            ], JSON_THROW_ON_ERROR), $hash],
            ['sf-inverse-experiment', 'spikefoundry', 'Train an SNN designer from examples', 'spikefoundry/run.js', json_encode([
                'mode' => 'inverse-experiment', 'batches' => 1,
            ], JSON_THROW_ON_ERROR), $hash],
            ['sf-vision', 'spikefoundry', 'Synthetic vision check', 'spikefoundry/run.js', json_encode([
                'scenario' => 'vision', 'batches' => 1,
                'scenarioParams' => ['batch' => 2, 'channels' => 1, 'height' => 4, 'width' => 4, 'steps' => 6],
            ], JSON_THROW_ON_ERROR), $hash],
            ['bb-order3', 'bugbrain', 'One order-3 growth', 'run/r42.js', json_encode([
                'plan' => 'deepURSx3',
                'task' => ['env' => 'seq', 'params' => ['source' => 'order3', 'K' => 8, 'readIn' => 0.01]],
                'growths' => 1,
                'variant' => 'pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1',
            ], JSON_THROW_ON_ERROR), $hash],
        ];
        $ti = $this->db->prepare('INSERT INTO templates (id, project_id, title, runner, spec_json, code_hash) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($templates as $t) {
            if (!$this->db->query('SELECT id FROM templates WHERE id = ' . $this->db->quote($t[0]))->fetch()) {
                $ti->execute($t);
            }
        }
    }

    public function refreshProtocolPins(): int
    {
        $current = $this->protocolHash();
        $st = $this->db->prepare('SELECT hash FROM approved_code WHERE hash <> ?');
        $st->execute([$current]);
        $hashes = [];
        foreach ($st->fetchAll() as $row) {
            $hash = (string) $row['hash'];
            if (preg_match('/^[a-f0-9]{64}$/', $hash)) {
                $hashes[] = $hash;
            }
        }
        if ($hashes === []) {
            return 0;
        }
        $marks = implode(',', array_fill(0, count($hashes), '?'));
        $changed = 0;
        $tpl = $this->db->prepare('UPDATE templates SET code_hash = ? WHERE code_hash IN (' . $marks . ')');
        $tpl->execute(array_merge([$current], $hashes));
        $changed += $tpl->rowCount();
        $jobs = $this->db->prepare("UPDATE jobs SET code_hash = ? WHERE status = 'queued' AND code_hash IN (" . $marks . ')');
        $jobs->execute(array_merge([$current], $hashes));
        $changed += $jobs->rowCount();
        return $changed;
    }

    public function retiredDesign(array $rec): bool
    {
        $engine = (string) ($rec['engineVersion'] ?? $rec['engine_version'] ?? '');
        return $engine === 'spikefoundry-designer-1' || $engine === 'spikefoundry-designer-2';
    }

    public function purgePlaceholderDesigns(): int
    {
        $done = $this->db->query("SELECT id FROM supply_state WHERE id = 'purge-designer-1'")->fetch();
        if ($done) {
            return 0;
        }
        $rows = $this->db->query('SELECT id, genome_hash, engine_version, neurons, synapses, score_json, worker_id FROM design_records')->fetchAll();
        $removed = 0;
        foreach ($rows as $rec) {
            if ((string) ($rec['engine_version'] ?? '') !== 'spikefoundry-designer-1') {
                continue;
            }
            $this->db->prepare('DELETE FROM design_records WHERE id = ?')->execute([(string) $rec['id']]);
            $removed++;
        }
        $this->db->exec('DELETE FROM design_genomes WHERE hash NOT IN (SELECT genome_hash FROM design_records)');
        $this->db->exec('DELETE FROM design_events WHERE worker_id NOT IN (SELECT DISTINCT worker_id FROM design_records)');
        $this->db->exec("DELETE FROM model_checkpoints WHERE body_json LIKE '%spikefoundry-designer%' AND body_json NOT LIKE '%spikefoundry-designer-3%'");
        $note = 'removed ' . $removed . ' records stamped spikefoundry-designer-1';
        $this->db->prepare('INSERT INTO supply_state (id, ran_at, note) VALUES (?, ?, ?)')->execute(['purge-designer-1', $this->now(), $note]);
        return $removed;
    }

    public function purgeDesigner2(): int
    {
        $done = $this->db->query("SELECT id FROM supply_state WHERE id = 'purge-designer-2'")->fetch();
        if ($done) {
            return 0;
        }
        $rows = $this->db->query('SELECT id, engine_version FROM design_records')->fetchAll();
        $removed = 0;
        foreach ($rows as $rec) {
            if ((string) ($rec['engine_version'] ?? '') !== 'spikefoundry-designer-2') {
                continue;
            }
            $this->db->prepare('DELETE FROM design_records WHERE id = ?')->execute([(string) $rec['id']]);
            $removed++;
        }
        $this->db->exec('DELETE FROM design_genomes WHERE hash NOT IN (SELECT genome_hash FROM design_records)');
        $this->db->exec('DELETE FROM design_events WHERE worker_id NOT IN (SELECT DISTINCT worker_id FROM design_records)');
        $this->db->exec("DELETE FROM model_checkpoints WHERE body_json LIKE '%spikefoundry-designer-2%' AND body_json NOT LIKE '%spikefoundry-designer-3%'");
        $note = 'removed ' . $removed . ' records stamped spikefoundry-designer-2 (scores were real, sizes were the blank network)';
        $this->db->prepare('INSERT INTO supply_state (id, ran_at, note) VALUES (?, ?, ?)')->execute(['purge-designer-2', $this->now(), $note]);
        return $removed;
    }

    public function protocolHash(): string
    {
        $path = (string) $this->config['protocol'];
        $text = is_file($path) ? (string) file_get_contents($path) : '';
        $text = str_replace("\r\n", "\n", $text);
        $text = str_replace("\r", "\n", $text);
        return hash('sha256', $text);
    }

    public function codeApproved(string $hash): bool
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $hash)) {
            return false;
        }
        if (hash_equals($this->protocolHash(), $hash)) {
            return true;
        }
        $st = $this->db->prepare('SELECT hash FROM approved_code WHERE hash = ?');
        $st->execute([$hash]);
        return (bool) $st->fetch();
    }

    public function createOwner(string $username, string $password): void
    {
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) {
            throw new InvalidArgumentException('Owner name must be 3–32 letters, digits, dot, underscore, or hyphen.');
        }
        if (strlen($password) < 10) {
            throw new InvalidArgumentException('Owner password must be at least 10 characters.');
        }
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $this->db->prepare('INSERT INTO owner (id, username, password_hash) VALUES (1, ?, ?)')->execute([$username, $hash]);
    }

    public function rateLimit(string $bucket, int $limit): bool
    {
        $now = $this->now();
        $row = $this->db->prepare('SELECT window_start, hits FROM rate_limits WHERE bucket = ?');
        $row->execute([$bucket]);
        $cur = $row->fetch();
        if (!$cur || (strtotime($now) - strtotime((string) $cur['window_start'])) >= 60) {
            $this->db->prepare('REPLACE INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)')->execute([$bucket, $now]);
            return true;
        }
        if ((int) $cur['hits'] >= $limit) {
            return false;
        }
        $this->db->prepare('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?')->execute([$bucket]);
        return true;
    }

    /** @return list<string> */
    public function allowedRunners(): array
    {
        return ['spikefoundry/run.js', 'run/r42.js', 'run/gen.js'];
    }

    public function runnerFamily(string $runner): string
    {
        if ($runner === 'spikefoundry/run.js') {
            return 'spikefoundry';
        }
        return 'bugbrain';
    }

    /** @param list<string> $projects */
    public function enroll(string $name, array $projects, int $maxBatches, bool $consent, ?string $participantId = null): array
    {
        if (!$consent) {
            throw new InvalidArgumentException('Enrollment needs the consent box.');
        }
        $name = strtolower(trim($name));
        if (!preg_match('/^[a-z0-9._-]{2,32}$/', $name)) {
            throw new InvalidArgumentException('Computer name must be 2–32 letters, digits, dot, underscore, or hyphen.');
        }
        $allowed = array_values(array_intersect($projects, ['spikefoundry', 'bugbrain']));
        if ($allowed === []) {
            throw new InvalidArgumentException('Choose at least one project.');
        }
        if ($maxBatches < 1 || $maxBatches > 20) {
            throw new InvalidArgumentException('Batch limit must be from 1 to 20.');
        }
        $id = bin2hex(random_bytes(8));
        $token = bin2hex(random_bytes(24));
        if ($participantId !== null && $participantId !== '') {
            if (!preg_match('/^[a-f0-9]{8,32}$/', $participantId)) {
                throw new InvalidArgumentException('Unknown participant.');
            }
            $known = $this->db->prepare('SELECT id FROM workers WHERE participant_id = ? OR id = ?');
            $known->execute([$participantId, $participantId]);
            if (!$known->fetch()) {
                throw new InvalidArgumentException('Unknown participant.');
            }
        } else {
            $participantId = $id;
        }
        $this->db->prepare('INSERT INTO workers (id, name, token_hash, consent_at, paused, revoked, allowed_json, max_batches, last_seen, participant_id, created_at, resource_mode, allowance_pct) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $name, hash('sha256', $token), $this->now(), json_encode($allowed), $maxBatches, $this->now(), $participantId, $this->now(), 'allowance', 50]);
        return ['workerId' => $id, 'token' => $token, 'name' => $name, 'participantId' => $participantId];
    }

    public function workerByToken(string $token): ?array
    {
        if (!preg_match('/^[a-f0-9]{32,128}$/', $token)) {
            return null;
        }
        $st = $this->db->prepare('SELECT * FROM workers WHERE token_hash = ? AND revoked = 0');
        $st->execute([hash('sha256', $token)]);
        $row = $st->fetch();
        return $row ?: null;
    }

    /* Removes a revoked computer from the Owner console. Returns false (and changes nothing)
     * for an active computer. The workers row is kept as a tombstone with its name, so
     * Discoveries, credit, design records, results and job history still resolve; only the
     * clutter that belongs to the dead entry goes: its diagnostics, unused setup codes and
     * any stale lease. */
    public function removeRevoked(string $workerId): bool
    {
        $st = $this->db->prepare('UPDATE workers SET removed_at = ? WHERE id = ? AND revoked = 1 AND removed_at IS NULL');
        $st->execute([$this->now(), $workerId]);
        if ($st->rowCount() !== 1) {
            return false;
        }
        $this->db->prepare('DELETE FROM worker_diagnostics WHERE worker_id = ?')->execute([$workerId]);
        $this->db->prepare('DELETE FROM setup_codes WHERE worker_id = ?')->execute([$workerId]);
        $this->db->prepare('DELETE FROM leases WHERE worker_id = ?')->execute([$workerId]);
        return true;
    }

    /* One-time cleanup (bin/upgrade.php): remove every computer that is revoked today.
     * Runs once; later revocations are removed by hand from the Owner console. */
    public function removeRevokedOnce(): array
    {
        $done = $this->db->query("SELECT id FROM supply_state WHERE id = 'remove-revoked-1'")->fetch();
        if ($done) {
            return ['ran' => false, 'removed' => []];
        }
        $names = [];
        foreach ($this->db->query('SELECT id, name FROM workers WHERE revoked = 1 AND removed_at IS NULL ORDER BY created_at ASC, id ASC')->fetchAll() as $w) {
            if ($this->removeRevoked((string) $w['id'])) {
                $names[] = (string) $w['name'];
            }
        }
        $this->db->prepare('INSERT INTO supply_state (id, ran_at, note) VALUES (?, ?, ?)')->execute(['remove-revoked-1', $this->now(), 'removed ' . count($names) . ': ' . substr(implode(', ', $names), 0, 400)]);
        return ['ran' => true, 'removed' => $names];
    }

    public function revoke(string $workerId): void
    {
        $this->db->prepare('UPDATE workers SET revoked = 1 WHERE id = ?')->execute([$workerId]);
        $this->db->prepare('DELETE FROM leases WHERE worker_id = ?')->execute([$workerId]);
    }

    /**
     * Setup ran on a computer that already has a valid token for $existing. Keep that entry, and retire the entry the
     * new setup command was made for when it is a clear, unused duplicate (no results, no designs, no running job).
     * For a standalone kept computer, a fresh browser session follows the kept entry. If the browser already
     * belongs to a participant with other computers, add the kept computer to that participant instead.
     */
    public function keepExistingEntry(array $existing, string $newToken): array
    {
        $out = ['ok' => true, 'name' => (string) $existing['name'], 'retired' => null, 'linked' => false];
        $new = $newToken !== '' ? $this->workerByToken($newToken) : null;
        if (!$new || (string) $new['id'] === (string) $existing['id']) {
            return $out;
        }
        $nid = (string) $new['id'];
        foreach (['results', 'design_records', 'leases'] as $table) {
            $st = $this->db->prepare('SELECT COUNT(*) FROM ' . $table . ' WHERE worker_id = ?');
            $st->execute([$nid]);
            if ((int) $st->fetchColumn() > 0) {
                return $out;
            }
        }
        $eid = (string) $existing['id'];
        $npid = (string) ($new['participant_id'] ?? '');
        $epid = (string) ($existing['participant_id'] ?? '');
        if ($npid !== '' && ($epid === '' || $epid === $eid)) {
            $others = $this->db->prepare('SELECT COUNT(*) FROM workers WHERE participant_id = ? AND id <> ?');
            $others->execute([$eid, $eid]);
            if ((int) $others->fetchColumn() === 0) {
                if ($npid === $nid) {
                    $this->db->prepare("UPDATE sessions SET subject = ? WHERE role = 'participant' AND subject = ?")->execute([$eid, $nid]);
                } else {
                    $this->db->prepare('UPDATE workers SET participant_id = ? WHERE id = ?')->execute([$npid, $eid]);
                }
                $out['linked'] = true;
            }
        }
        $this->revoke($nid);
        $this->db->prepare('DELETE FROM setup_codes WHERE worker_id = ?')->execute([$nid]);
        $out['retired'] = (string) $new['name'];
        return $out;
    }

    /* Pause is Off. Resuming a computer that was Off puts it back in Allowance. */
    public function setPaused(string $workerId, bool $paused): void
    {
        if ($paused) {
            $this->db->prepare("UPDATE workers SET paused = 1, resource_mode = 'off' WHERE id = ?")->execute([$workerId]);
            return;
        }
        $this->db->prepare("UPDATE workers SET paused = 0, resource_mode = CASE WHEN resource_mode = 'off' THEN 'allowance' ELSE resource_mode END WHERE id = ?")->execute([$workerId]);
    }

    public const RESOURCE_MODES = ['off', 'allowance', 'full'];

    /* The one setting a participant has: how much of the computer Compute Lab may use.
     * Off claims nothing new, Allowance caps the share of cores at low priority, Full blast
     * uses every core at normal priority. The worker reads this on its next check-in. */
    public function setResources(string $workerId, string $mode, ?int $pct = null, ?int $maxJobs = null): void
    {
        if (!in_array($mode, self::RESOURCE_MODES, true)) {
            throw new InvalidArgumentException('Choose Off, Allowance, or Full blast.');
        }
        if ($pct === null) {
            $cur = $this->db->prepare('SELECT allowance_pct FROM workers WHERE id = ?');
            $cur->execute([$workerId]);
            $pct = (int) ($cur->fetchColumn() ?: 50);
        }
        $pct = self::clampAllowance($pct);
        $this->db->prepare('UPDATE workers SET resource_mode = ?, allowance_pct = ?, paused = ? WHERE id = ?')
            ->execute([$mode, $pct, $mode === 'off' ? 1 : 0, $workerId]);
        if ($maxJobs !== null) {
            $this->db->prepare('UPDATE workers SET max_jobs = ? WHERE id = ?')->execute([self::clampMaxJobs($maxJobs), $workerId]);
        }
    }

    /* Seconds without a heartbeat after which a computer counts as not running. The worker checks in every 20 s. */
    public const STALE_SECONDS = 180;
    /* How long "Starting…" may show before the page says the watchdog did not bring it back. */
    public const START_WAIT_SECONDS = 600;

    /* The toggle was set on a computer that is not running: remember when, so the page can show "Starting…" until
     * the watchdog on that computer brings the worker back and it checks in. Off clears it. */
    public function noteRestartRequest(string $workerId, string $mode): void
    {
        $st = $this->db->prepare('SELECT last_seen FROM workers WHERE id = ?');
        $st->execute([$workerId]);
        $seen = (string) ($st->fetchColumn() ?: '');
        $stale = $seen === '' || (strtotime($this->now()) - strtotime($seen)) > self::STALE_SECONDS;
        if ($mode === 'off') {
            $this->db->prepare('UPDATE workers SET restart_requested_at = NULL WHERE id = ?')->execute([$workerId]);
        } elseif ($stale) {
            $this->db->prepare('UPDATE workers SET restart_requested_at = ? WHERE id = ?')->execute([$this->now(), $workerId]);
        }
    }

    /* What the computer is actually doing, kept apart from the saved setting (resource_mode):
     *   running   heartbeat within STALE_SECONDS
     *   starting  someone turned it on after it stopped, less than START_WAIT_SECONDS ago, no heartbeat since
     *   stopped   it checked in before but not lately (window closed, crash, computer off or asleep)
     *   never     registered, never checked in (the health line explains)
     * watchdog is what the worker reported ('task-repeat', 'systemd-timer', 'cron', 'launchd'), 'none', or '' when
     * its code is too old to say. */
    public function runStateOf(array $worker): array
    {
        $now = strtotime($this->now());
        $seen = !empty($worker['last_seen']) ? strtotime((string) $worker['last_seen']) : 0;
        $created = !empty($worker['created_at']) ? strtotime((string) $worker['created_at']) : 0;
        $rt = json_decode((string) ($worker['runtime_json'] ?? ''), true);
        $beat = ($seen - $created) > 5 || is_array($rt);
        $watchdog = is_array($rt) && isset($rt['watchdog']) ? (string) $rt['watchdog'] : '';
        $req = !empty($worker['restart_requested_at']) ? strtotime((string) $worker['restart_requested_at']) : 0;
        $since = $seen ? gmdate('c', $seen) : '';
        if ($seen && ($now - $seen) <= self::STALE_SECONDS) {
            return ['run' => 'running', 'since' => $since, 'requested' => '', 'watchdog' => $watchdog];
        }
        if (!$beat) {
            return ['run' => 'never', 'since' => $since, 'requested' => '', 'watchdog' => $watchdog];
        }
        if ($req > $seen && ($now - $req) < self::START_WAIT_SECONDS) {
            return ['run' => 'starting', 'since' => $since, 'requested' => gmdate('c', $req), 'watchdog' => $watchdog];
        }
        return ['run' => 'stopped', 'since' => $since, 'requested' => $req > $seen ? gmdate('c', $req) : '', 'watchdog' => $watchdog];
    }

    /* 0 = Auto. Anything above 64 is 64; the worker also never runs more than its cores. */
    public static function clampMaxJobs(int $n): int
    {
        return max(0, min(64, $n));
    }

    public static function clampAllowance(int $pct): int
    {
        $pct = (int) (round($pct / 10) * 10);
        if ($pct < 10) {
            $pct = 10;
        }
        if ($pct > 90) {
            $pct = 90;
        }
        return $pct;
    }

    public function resourcesOf(array $worker): array
    {
        $mode = (string) ($worker['resource_mode'] ?? '');
        if (!in_array($mode, self::RESOURCE_MODES, true)) {
            $mode = (int) ($worker['paused'] ?? 0) === 1 ? 'off' : 'allowance';
        }
        if ((int) ($worker['paused'] ?? 0) === 1) {
            $mode = 'off';
        }
        $runtime = json_decode((string) ($worker['runtime_json'] ?? ''), true);
        return [
            'mode' => $mode,
            'allowancePct' => self::clampAllowance((int) ($worker['allowance_pct'] ?? 50)),
            'maxJobs' => self::clampMaxJobs((int) ($worker['max_jobs'] ?? 0)),
            'runtime' => is_array($runtime) ? $runtime : null,
        ];
    }

    /* What the worker said it is doing, kept small: cores, slots, duty, priority, mode. */
    private function saveRuntime(string $workerId, array $report): void
    {
        $clean = [];
        foreach (['cores', 'slots', 'running', 'maxJobs'] as $k) {
            if (isset($report[$k]) && is_numeric($report[$k])) {
                $clean[$k] = max(0, min(1024, (int) $report[$k]));
            }
        }
        if (isset($report['duty']) && is_numeric($report['duty'])) {
            $clean['duty'] = max(0.0, min(1.0, round((float) $report['duty'], 3)));
        }
        foreach (['mode', 'priority', 'platform', 'watchdog'] as $k) {
            if (isset($report[$k]) && is_string($report[$k]) && preg_match('/^[a-z0-9 _.-]{1,24}$/i', $report[$k])) {
                $clean[$k] = $report[$k];
            }
        }
        if (isset($report['pct']) && is_numeric($report['pct'])) {
            $clean['pct'] = max(0, min(100, (int) $report['pct']));
        }
        $clean['at'] = $this->now();
        $this->db->prepare('UPDATE workers SET runtime_json = ? WHERE id = ?')->execute([json_encode($clean), $workerId]);
    }

    public function expireLeases(): void
    {
        $now = $this->now();
        $st = $this->db->prepare('SELECT job_id, worker_id FROM leases WHERE until_at < ?');
        $st->execute([$now]);
        $rows = $st->fetchAll();
        foreach ($rows as $row) {
            $this->noteFailure((string) $row['job_id'], (string) $row['worker_id'], 'Lease expired before a result arrived.', true);
        }
        $this->db->prepare('DELETE FROM leases WHERE until_at < ?')->execute([$now]);
        if ($rows !== []) {
            $this->moveQueuedOffPausedTasks();
        }
    }

    /* Queued auto jobs that point at a paused task that already has a next task move
     * along the chain. Runs when supply fills the queue and when leases expire, so a job
     * that comes back from a dead worker does not sit on a solved task. */
    public function moveQueuedOffPausedTasks(): int
    {
        $rows = $this->db->query("SELECT project_id, task_id, advanced_to FROM task_policies WHERE paused = 1 AND advanced_to IS NOT NULL AND advanced_to <> ''")->fetchAll();
        if ($rows === []) {
            return 0;
        }
        $byTask = [];
        foreach ($rows as $row) {
            $byTask[(string) $row['project_id'] . '|' . (string) $row['task_id']] = $row;
        }
        $order = self::CURRICULUM;
        $moved = 0;
        foreach ($order as $task) {
            foreach ($byTask as $key => $row) {
                if ((string) $row['task_id'] === $task) {
                    $moved += $this->retargetQueued((string) $row['project_id'], $task, (string) $row['advanced_to']);
                }
            }
        }
        foreach ($byTask as $row) {
            if (!in_array((string) $row['task_id'], $order, true)) {
                $moved += $this->retargetQueued((string) $row['project_id'], (string) $row['task_id'], (string) $row['advanced_to']);
            }
        }
        return $moved;
    }

    /* Queued jobs a worker could claim now: jobs for a paused task are skipped by claim(),
     * so they do not count toward the low-water mark or the caps. */
    public function claimableQueued(?string $projectId = null): int
    {
        if ($projectId === null) {
            $st = $this->db->query("SELECT project_id, spec_json FROM jobs WHERE status = 'queued'");
        } else {
            $st = $this->db->prepare("SELECT project_id, spec_json FROM jobs WHERE status = 'queued' AND project_id = ?");
            $st->execute([$projectId]);
        }
        $paused = [];
        foreach ($this->db->query('SELECT project_id, task_id FROM task_policies WHERE paused = 1')->fetchAll() as $row) {
            $paused[(string) $row['project_id'] . '|' . (string) $row['task_id']] = true;
        }
        $n = 0;
        foreach ($st->fetchAll() as $job) {
            $spec = json_decode((string) $job['spec_json'], true);
            if ($this->legacySearchPaused((string) $job['project_id'], $spec)) {
                continue;
            }
            $task = is_array($spec) ? (string) ($spec['taskId'] ?? '') : '';
            if ($task !== '' && isset($paused[(string) $job['project_id'] . '|' . $task])) {
                continue;
            }
            $n++;
        }
        return $n;
    }

    public function claim(array $worker, int $slot = 0, bool $sequenceExperiment = false, int $studyVersion = 1, bool $inverseExperiment = false, bool $inverseGallery = false, bool $inverseShared = false, bool $inverseComposition = false, bool $inverseSequence = false): ?array
    {
        $this->replenishJobs();
        $this->expireLeases();
        $fresh = $this->db->prepare('SELECT paused, resource_mode FROM workers WHERE id = ?');
        $fresh->execute([$worker['id']]);
        $now0 = $fresh->fetch();
        if ((int) $worker['paused'] === 1 || ($now0 && ((int) $now0['paused'] === 1 || (string) $now0['resource_mode'] === 'off'))) {
            return null;
        }
        if ($slot < 0 || $slot > 63) {
            throw new InvalidArgumentException('Slot must be from 0 to 63.');
        }
        $this->dropLeasesOf((string) $worker['id'], $slot);
        $allowed = json_decode((string) $worker['allowed_json'], true);
        if (!is_array($allowed)) {
            $allowed = [];
        }
        $now = $this->now();
        $projects = $this->db->query('SELECT * FROM projects WHERE enabled = 1 ORDER BY priority DESC, id ASC')->fetchAll();
        $this->db->beginTransaction();
        try {
            $ranked = [];
            $codeHash = (string) ($worker['code_hash'] ?? '');
            $findSql = 'SELECT * FROM jobs WHERE project_id = ? AND status = ? AND (not_before IS NULL OR not_before <= ?)';
            if ($codeHash !== '') {
                $findSql .= ' AND code_hash = ?';
            }
            $findSql .= ' ORDER BY priority DESC, attempts ASC, id ASC';
            $find = $this->db->prepare($findSql);
            foreach ($projects as $project) {
                $family = (string) ($project['family'] ?? '');
                if (!in_array($project['id'], $allowed, true) && !in_array($family, $allowed, true)) {
                    continue;
                }
                $args = [$project['id'], 'queued', $now];
                if ($codeHash !== '') {
                    $args[] = $codeHash;
                }
                $find->execute($args);
                foreach ($find->fetchAll() as $job) {
                    $spec = json_decode((string) $job['spec_json'], true);
                    if (!is_array($spec)) {
                        $spec = [];
                    }
                    if (($spec['mode'] ?? '') === 'sequence-experiment'
                        && (!$sequenceExperiment || $studyVersion < (int) ($spec['experiment']['studyVersion'] ?? 1))) {
                        continue;
                    }
                    if (($spec['mode'] ?? '') === 'inverse-experiment' && (!$inverseExperiment || (!empty($spec['inverseGallery']) && !$inverseGallery))) {
                        continue;
                    }
                    $composition = !empty($spec['inverseComposition']);
                    if ($composition && (!$inverseComposition || empty($this->config['inverse_composition'])
                        || (!empty($spec['inverseSequence']) && !$inverseSequence))) {
                        continue;
                    }
                    $shared = !$composition && ($spec['mode'] ?? '') === 'inverse-experiment' && !empty($spec['inverseGallery'])
                        && !empty($this->config['inverse_shared_training']);
                    if ($shared && !$inverseShared) {
                        continue;
                    }
                    if ($this->legacySearchPaused((string) $project['id'], $spec)) {
                        continue;
                    }
                    $batches = (int) ($spec['batches'] ?? 1);
                    if ($batches > (int) $worker['max_batches']) {
                        continue;
                    }
                    $taskId = (string) ($spec['taskId'] ?? '');
                    if ($taskId !== '' && $this->taskPaused((string) $project['id'], $taskId)) {
                        continue;
                    }
                    $ranked[] = ['job' => $job, 'spec' => $spec, 'shared' => $shared];
                }
            }
            $hasOther = false;
            foreach ($ranked as $item) {
                if ((string) ($item['job']['last_worker'] ?? '') !== (string) $worker['id']) {
                    $hasOther = true;
                    break;
                }
            }
            foreach ($ranked as $item) {
                $job = $item['job'];
                if ($hasOther && (string) ($job['last_worker'] ?? '') === (string) $worker['id']) {
                    continue;
                }
                if (is_callable($this->beforeLease)) {
                    $hook = $this->beforeLease;
                    $hook($job);
                }
                $upd = $this->db->prepare('UPDATE jobs SET status = ? WHERE id = ? AND status = ?');
                $upd->execute(['leased', $job['id'], 'queued']);
                if ($upd->rowCount() < 1) {
                    continue;
                }
                $until = gmdate('c', strtotime($this->now()) + (int) $this->config['lease_seconds']);
                $this->db->prepare('INSERT INTO leases (job_id, worker_id, until_at, heartbeat_at, started_at, slot) VALUES (?, ?, ?, ?, ?, ?)')->execute([$job['id'], $worker['id'], $until, $this->now(), $this->now(), $slot]);
                $tpl = $this->db->prepare('SELECT runner FROM templates WHERE id = ?');
                $tpl->execute([$job['template_id']]);
                $runner = (string) ($tpl->fetch()['runner'] ?? '');
                $spec = $item['spec'];
                if ($item['shared'] || isset($spec['inverseShared'])) {
                    unset($spec['inverseShared']);
                    if ($item['shared']) {
                        $champion = $this->inverseChampion();
                        $spec['inverseShared'] = ['benchmark' => $champion['benchmark'], 'generation' => $champion['generation']];
                    }
                    $this->db->prepare('UPDATE jobs SET spec_json = ? WHERE id = ?')->execute([json_encode($spec), $job['id']]);
                    if ($item['shared']) {
                        $spec['inverseShared']['checkpoint'] = $champion['checkpoint'];
                    }
                }
                $this->db->commit();
                return [
                    'id' => $job['id'],
                    'project' => $job['project_id'],
                    'title' => $job['title'],
                    'runner' => $runner,
                    'spec' => $spec,
                    'codeHash' => $job['code_hash'],
                    'leaseUntil' => $until,
                    'slot' => $slot,
                ];
            }
            $this->db->rollBack();
            return null;
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /* Each worker slot runs one job at a time and only asks for work when that slot is
     * idle, so a lease the slot still holds belongs to a run it gave up (a restart, or a
     * heartbeat that answered for another job). Hand those jobs back now instead of
     * letting the old lease ride along. A null slot drops every lease of the worker,
     * which a freshly started worker asks for. */
    public function dropLeasesOf(string $workerId, ?int $slot = null): void
    {
        if ($slot === null) {
            $st = $this->db->prepare('SELECT job_id FROM leases WHERE worker_id = ?');
            $st->execute([$workerId]);
        } else {
            $st = $this->db->prepare('SELECT job_id FROM leases WHERE worker_id = ? AND slot = ?');
            $st->execute([$workerId, $slot]);
        }
        $rows = $st->fetchAll();
        if ($rows === []) {
            return;
        }
        foreach ($rows as $row) {
            $this->noteFailure((string) $row['job_id'], $workerId, 'The computer asked for new work while still holding this lease, so the lease was dropped.', true);
            $this->db->prepare('DELETE FROM leases WHERE job_id = ? AND worker_id = ?')->execute([$row['job_id'], $workerId]);
        }
        $this->moveQueuedOffPausedTasks();
    }

    public function heartbeat(array $worker, array $extra = []): array
    {
        $this->db->prepare('UPDATE workers SET last_seen = ?, restart_requested_at = NULL WHERE id = ?')->execute([$this->now(), $worker['id']]);
        $fresh = $this->db->prepare('SELECT * FROM workers WHERE id = ?');
        $fresh->execute([$worker['id']]);
        $state = $fresh->fetch();
        if (!$state) {
            return ['ok' => true, 'paused' => true, 'revoked' => true, 'jobId' => null, 'leaseUntil' => null];
        }
        if (isset($extra['runtime']) && is_array($extra['runtime'])) {
            $this->saveRuntime((string) $worker['id'], $extra['runtime']);
        }
        if (!empty($extra['reset']) && (int) $state['revoked'] !== 1) {
            $this->dropLeasesOf((string) $worker['id']);
        }
        $resources = $this->resourcesOf($state);
        $base = [
            'ok' => true,
            'paused' => (int) $state['paused'] === 1,
            'revoked' => (int) $state['revoked'] === 1,
            'resources' => ['mode' => $resources['mode'], 'allowancePct' => $resources['allowancePct'], 'maxJobs' => $resources['maxJobs']],
        ];
        /* A control check-in only reads settings. It does not renew any lease. */
        if (!empty($extra['control'])) {
            return $base + ['jobId' => null, 'leaseUntil' => null];
        }
        $row = false;
        if (isset($extra['jobId']) && is_string($extra['jobId']) && $extra['jobId'] !== '') {
            $lease = $this->db->prepare('SELECT * FROM leases WHERE worker_id = ? AND job_id = ?');
            $lease->execute([$worker['id'], $extra['jobId']]);
            $row = $lease->fetch();
        } else {
            $lease = $this->db->prepare('SELECT * FROM leases WHERE worker_id = ? ORDER BY started_at DESC, job_id DESC');
            $lease->execute([$worker['id']]);
            $row = $lease->fetch();
        }
        $jobId = null;
        $until = null;
        if ($row && (int) $state['revoked'] !== 1) {
            $next = gmdate('c', strtotime($this->now()) + (int) $this->config['lease_seconds']);
            $progress = null;
            if (isset($extra['progress']) && $extra['progress'] !== '' && $extra['progress'] !== null && is_numeric($extra['progress'])) {
                $progress = (int) $extra['progress'];
                if ($progress < 0) {
                    $progress = 0;
                }
                if ($progress > 100) {
                    $progress = 100;
                }
            }
            if ($progress === null) {
                $upd = $this->db->prepare('UPDATE leases SET heartbeat_at = ?, until_at = ? WHERE job_id = ? AND worker_id = ?');
                $upd->execute([$this->now(), $next, $row['job_id'], $worker['id']]);
            } else {
                $upd = $this->db->prepare('UPDATE leases SET heartbeat_at = ?, until_at = ?, progress = ? WHERE job_id = ? AND worker_id = ?');
                $upd->execute([$this->now(), $next, $progress, $row['job_id'], $worker['id']]);
            }
            $check = $this->db->prepare('SELECT until_at FROM leases WHERE job_id = ? AND worker_id = ?');
            $check->execute([$row['job_id'], $worker['id']]);
            $still = $check->fetch();
            if ($still) {
                $jobId = (string) $row['job_id'];
                $until = (string) $still['until_at'];
            }
        }
        return $base + ['jobId' => $jobId, 'leaseUntil' => $until];
    }

    public function submitResult(array $worker, string $jobId, array $body): void
    {
        if (!preg_match('/^[a-z0-9._-]{2,64}$/', $jobId)) {
            throw new InvalidArgumentException('Bad job id.');
        }
        $raw = json_encode($body);
        $maxBytes = (int) $this->config['result_bytes'];
        if ($raw === false || strlen($raw) > max($maxBytes, 60000)) {
            throw new InvalidArgumentException('Result is too large.');
        }
        $status = (string) ($body['status'] ?? '');
        if (!in_array($status, ['done', 'error'], true)) {
            throw new InvalidArgumentException('Status must be done or error.');
        }
        $summary = (string) ($body['summary'] ?? '');
        if (strlen($summary) > 500) {
            throw new InvalidArgumentException('Summary is too long.');
        }
        if (isset($body['digest'])) {
            $expect = hash('sha256', $summary);
            if (!hash_equals($expect, (string) $body['digest'])) {
                throw new InvalidArgumentException('Result digest does not match the summary.');
            }
        }
        foreach (['command', 'shell', 'token', 'password', 'github_token'] as $banned) {
            if (array_key_exists($banned, $body)) {
                throw new InvalidArgumentException('Result contains a field the coordinator does not accept.');
            }
        }
        $this->db->beginTransaction();
        try {
            $lock = ($this->config['driver'] ?? '') === 'sqlite' ? '' : ' FOR UPDATE';
            $lease = $this->db->prepare('SELECT worker_id, started_at FROM leases WHERE job_id = ? AND worker_id = ?' . $lock);
            $lease->execute([$jobId, $worker['id']]);
            $leaseRow = $lease->fetch();
            if (!$leaseRow) {
                if ($status === 'done') {
                    $completed = $this->db->prepare("SELECT 1 FROM results r JOIN jobs j ON j.id = r.job_id
                        WHERE r.job_id = ? AND r.worker_id = ? AND r.status = 'done' AND j.status = 'done' LIMIT 1");
                    $completed->execute([$jobId, $worker['id']]);
                    if ($completed->fetchColumn()) {
                        $this->db->commit();
                        return;
                    }
                }
                throw new InvalidArgumentException('This computer does not hold that job.');
            }
            $seconds = null;
            if (!empty($leaseRow['started_at'])) {
                $seconds = strtotime($this->now()) - strtotime((string) $leaseRow['started_at']);
                if ($seconds < 0) {
                    $seconds = 0;
                }
            }
            $job = $this->db->prepare('SELECT * FROM jobs WHERE id = ?');
            $job->execute([$jobId]);
            $row = $job->fetch();
            if (!$row || (string) $row['status'] !== 'leased') {
                throw new InvalidArgumentException('This computer does not hold that job.');
            }
            $isInverse = $row['template_id'] === 'sf-inverse-experiment';
            if (strlen($raw) > ($row['template_id'] === 'sf-sequence-experiment' || $isInverse ? 60000 : $maxBytes)) {
                throw new InvalidArgumentException('Result is too large.');
            }
            if ($row['project_id'] === 'spikefoundry' && empty($body['synthetic'])) {
                throw new InvalidArgumentException('SpikeFoundry results must be marked synthetic.');
            }
            if ($status === 'done' && $row['template_id'] === 'sf-sequence-experiment') {
                $report = $body['research'] ?? [];
                $spec = json_decode((string) $row['spec_json'], true);
                $options = $spec['experiment'] ?? [];
                $versions = ($options['studyVersion'] ?? 1) >= 2 ? ['sequence-experiment-2'] : ['sequence-experiment-1', 'sequence-experiment-2'];
                if (!in_array($report['version'] ?? '', $versions, true)
                    || ($report['config']['seed'] ?? null) !== (int) $row['seed']
                    || ($report['config']['cpuBudgetMs'] ?? null) !== ($options['cpuBudgetMs'] ?? null)
                    || ($report['config']['cap'] ?? null) !== ($options['cap'] ?? null)
                    || !is_array($report['rounds'] ?? null)
                    || count($report['rounds']) !== (int) ($options['rounds'] ?? 0)) {
                    throw new InvalidArgumentException('Sequence experiment report does not match the job.');
                }
            }
            $composition = $isInverse && !empty(json_decode((string) $row['spec_json'], true)['inverseComposition']);
            if ($status === 'done' && $composition) {
                $report = $body['research'] ?? [];
                $sequence = !empty(json_decode((string) $row['spec_json'], true)['inverseSequence']);
                if (($report['version'] ?? '') !== 'inverse-composition-1' || ($report['seed'] ?? null) !== (int) $row['seed']
                    || !is_array($report['discoveries'] ?? null) || (($report['family'] ?? '') === 'Two-stream sequence') !== $sequence) {
                    throw new InvalidArgumentException('Composition report does not match the job.');
                }
                $this->saveInverseDiscoveries((string) $worker['id'], (int) $row['seed'], $report['discoveries'], true, $sequence);
                unset($body['research']['discoveries']);
                $raw = json_encode($body);
            } elseif ($status === 'done' && $isInverse) {
                $report = $body['research'] ?? [];
                $checkpoint = $report['checkpoint'] ?? [];
                if (($report['version'] ?? '') !== 'inverse-designer-1' || ($report['seed'] ?? null) !== (int) $row['seed']
                    || ($checkpoint['version'] ?? '') !== 'inverse-designer-1' || ($checkpoint['encoding'] ?? '') !== 'f32le-gzip'
                    || !is_string($checkpoint['payload'] ?? null) || base64_decode($checkpoint['payload'], true) === false) {
                    throw new InvalidArgumentException('Inverse experiment report does not match the job.');
                }
                $spec = json_decode((string) $row['spec_json'], true);
                $discoveries = $report['discoveries'] ?? [];
                if (!is_array($discoveries) || (!empty($spec['inverseGallery']) && !$discoveries)) {
                    throw new InvalidArgumentException('Automatic inverse jobs must include circuits.');
                }
                $this->saveInverseDiscoveries((string) $worker['id'], (int) $row['seed'], $discoveries);
                if (isset($spec['inverseShared'])) {
                    if (!is_array($report['promotion'] ?? null)) {
                        throw new InvalidArgumentException('Shared inverse jobs must include a promotion report.');
                    }
                    $body['research']['promotion']['outcome'] = $this->considerInversePromotion(
                        $jobId, $spec['inverseShared'], $report['promotion'], $checkpoint
                    );
                }
                if (!empty($spec['inverseGallery'])) {
                    $this->db->prepare('REPLACE INTO inverse_worker_models (worker_id, seed, checkpoint) VALUES (?, ?, ?)')
                        ->execute([$worker['id'], (int) $row['seed'], json_encode($checkpoint)]);
                    unset($body['research']['checkpoint'], $body['research']['discoveries']);
                    $raw = json_encode($body);
                }
            }
            $this->db->prepare('INSERT INTO results (job_id, worker_id, status, summary, body_json, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                ->execute([$jobId, $worker['id'], $status, $summary, $raw, $seconds, $this->now()]);
            if ($status === 'done' && $row['template_id'] === 'sf-sequence-experiment' && ($body['research']['version'] ?? '') === 'sequence-experiment-2') {
                $resultId = (int) $this->db->lastInsertId();
                $this->db->prepare('REPLACE INTO sequence_study_results (job_id, seed, result_id) VALUES (?, ?, ?)')
                    ->execute([$jobId, (int) $row['seed'], $resultId]);
            }
            if ($status === 'done') {
                $this->db->prepare('UPDATE jobs SET status = ?, not_before = NULL WHERE id = ? AND status = ?')->execute(['done', $jobId, 'leased']);
                if ($row['template_id'] === 'sf-sequence-experiment') {
                    $this->db->prepare('DELETE FROM sequence_checkpoints WHERE job_id = ?')->execute([$jobId]);
                }
            } else {
                $this->noteFailure($jobId, (string) $worker['id'], $summary !== '' ? $summary : 'Job returned an error.', false);
            }
            $this->db->prepare('DELETE FROM leases WHERE job_id = ? AND worker_id = ?')->execute([$jobId, $worker['id']]);
            $this->db->commit();
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    public function requeue(string $jobId): void
    {
        if (!preg_match('/^[a-z0-9._-]{2,80}$/', $jobId)) {
            throw new InvalidArgumentException('Bad job id.');
        }
        $st = $this->db->prepare('SELECT status, attempts, last_error FROM jobs WHERE id = ?');
        $st->execute([$jobId]);
        $row = $st->fetch();
        if (!$row || (string) $row['status'] !== 'held') {
            throw new InvalidArgumentException('Only a held job can be requeued.');
        }
        if ((int) $row['attempts'] < 1 && trim((string) ($row['last_error'] ?? '')) === '') {
            throw new InvalidArgumentException('Imported jobs stay held. Queue an approved template instead.');
        }
        $upd = $this->db->prepare('UPDATE jobs SET status = ?, attempts = 0, last_error = NULL, last_worker = NULL, not_before = NULL WHERE id = ? AND status = ?');
        $upd->execute(['queued', $jobId, 'held']);
        if ($upd->rowCount() < 1) {
            throw new InvalidArgumentException('Only a held job can be requeued.');
        }
    }

    private function noteFailure(string $jobId, string $workerId, string $error, bool $readyNow): void
    {
        $st = $this->db->prepare('SELECT attempts, status FROM jobs WHERE id = ?');
        $st->execute([$jobId]);
        $job = $st->fetch();
        if (!$job || (string) $job['status'] !== 'leased') {
            return;
        }
        $attempts = (int) $job['attempts'] + 1;
        $max = (int) ($this->config['max_attempts'] ?? 3);
        if ($max < 1) {
            $max = 3;
        }
        if (strlen($error) > 500) {
            $error = substr($error, 0, 500);
        }
        $status = 'queued';
        $notBefore = null;
        if ($attempts >= $max) {
            $status = 'held';
        } elseif (!$readyNow) {
            $notBefore = gmdate('c', strtotime($this->now()) + $this->retryDelaySeconds($attempts));
        }
        $upd = $this->db->prepare('UPDATE jobs SET status = ?, attempts = ?, last_error = ?, last_worker = ?, not_before = ? WHERE id = ? AND status = ? AND attempts = ?');
        $upd->execute([$status, $attempts, $error, $workerId, $notBefore, $jobId, 'leased', (int) $job['attempts']]);
    }

    private function retryDelaySeconds(int $attempts): int
    {
        $shift = $attempts - 1;
        if ($shift < 0) {
            $shift = 0;
        }
        if ($shift > 8) {
            $shift = 8;
        }
        $seconds = 60 * (2 ** $shift);
        if ($seconds > 900) {
            $seconds = 900;
        }
        return (int) $seconds;
    }

    public function createJob(string $templateId, string $title, float $priority, int $seed, array $extra = []): string
    {
        $st = $this->db->prepare('SELECT * FROM templates WHERE id = ?');
        $st->execute([$templateId]);
        $tpl = $st->fetch();
        if (!$tpl) {
            throw new InvalidArgumentException('Unknown template.');
        }
        if ($priority < 0 || $priority > 5) {
            throw new InvalidArgumentException('Job priority must be from 0 to 5.');
        }
        if ($seed < 1 || $seed > 1000000) {
            throw new InvalidArgumentException('Seed must be from 1 to 1000000.');
        }
        $title = trim($title);
        if ($title === '' || strlen($title) > 120) {
            throw new InvalidArgumentException('Title must be 1–120 characters.');
        }
        $spec = json_decode((string) $tpl['spec_json'], true);
        if (!is_array($spec)) {
            $spec = [];
        }
        $spec['seed'] = $seed;
        if (isset($extra['seedGenomes']) && is_array($extra['seedGenomes'])) {
            $spec['seedGenomes'] = array_values(array_slice($extra['seedGenomes'], 0, 10));
        }
        if (isset($extra['taskId'])) {
            $spec['taskId'] = (string) $extra['taskId'];
        }
        if (isset($extra['mode'])) {
            $spec['mode'] = (string) $extra['mode'];
        }
        if (isset($extra['evals'])) {
            $spec['evals'] = max(0, min(250000, (int) $extra['evals']));
        }
        if (isset($extra['targetSeconds'])) {
            $spec['targetSeconds'] = max(1, min(3600, (int) $extra['targetSeconds']));
        }
        if (isset($extra['keepTop'])) {
            $spec['keepTop'] = max(1, min(200, (int) $extra['keepTop']));
        }
        if (isset($extra['keepRandom'])) {
            $spec['keepRandom'] = max(0, min(2000, (int) $extra['keepRandom']));
        }
        if (isset($extra['knownHashes']) && is_array($extra['knownHashes'])) {
            $known = [];
            foreach ($extra['knownHashes'] as $k) {
                if (is_string($k) && preg_match('/^[a-f0-9]{16}$/', $k)) {
                    $known[] = $k;
                }
            }
            $spec['knownHashes'] = array_values(array_slice(array_unique($known), 0, 200));
        }
        if ($templateId === 'sf-sequence-experiment') {
            $options = $this->config['sequence_experiment'] ?? [];
            $spec['experiment'] = [
                'studyVersion' => 2,
                'rounds' => max(3, min(12, (int) ($options['rounds'] ?? 6))),
                'cpuBudgetMs' => max(10, min(10000, (int) ($options['cpuBudgetMs'] ?? 1000))),
                'cap' => max(10, min(10000, (int) ($options['cap'] ?? 3000))),
            ];
            if (is_array($options['initialCheckpoint'] ?? null)) {
                $spec['experiment']['initialCheckpoint'] = $options['initialCheckpoint'];
            }
            $id = 'sf-sequence-experiment-' . $seed;
        } elseif ($templateId === 'sf-inverse-experiment') {
            $id = 'sf-inverse-experiment-' . $seed;
            if (!empty($extra['inverseGallery'])) {
                $spec['inverseGallery'] = true;
            }
            if (!empty($extra['inverseComposition'])) {
                $spec['inverseComposition'] = true;
                if (!empty($extra['inverseSequence'])) {
                    $spec['inverseSequence'] = true;
                }
            }
        } else {
            $id = strtolower(preg_replace('/[^a-z0-9]+/', '-', $templateId) . '-' . $seed . '-' . bin2hex(random_bytes(3)));
        }
        try {
            $this->db->prepare('INSERT INTO jobs (id, project_id, template_id, title, spec_json, code_hash, priority, status, created_at, seed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$id, $tpl['project_id'], $tpl['id'], $title, json_encode($spec), $this->protocolHash(), $priority, 'queued', $this->now(), $seed]);
        } catch (PDOException $e) {
            if (in_array($templateId, ['sf-sequence-experiment', 'sf-inverse-experiment'], true) && (string) $e->getCode() === '23000') {
                throw new InvalidArgumentException($templateId === 'sf-sequence-experiment'
                    ? 'A sequence experiment already uses that seed.' : 'An inverse experiment already uses that seed.');
            }
            throw $e;
        }
        return $id;
    }

    public function sequenceExperimentReport(string $jobId): ?array
    {
        $sql = "SELECT j.id, r.body_json FROM results r JOIN jobs j ON j.id = r.job_id
            WHERE j.template_id = 'sf-sequence-experiment' AND r.status = 'done'";
        $args = [];
        if ($jobId !== '') {
            $sql .= ' AND j.id = ?';
            $args[] = $jobId;
        }
        $st = $this->db->prepare($sql . ' ORDER BY r.created_at DESC, r.id DESC LIMIT 1');
        $st->execute($args);
        $row = $st->fetch();
        $body = $row ? json_decode((string) $row['body_json'], true) : null;
        return is_array($body['research'] ?? null) ? ['jobId' => $row['id'], 'research' => $body['research']] : null;
    }

    public function inverseExperimentReport(int $seed): ?array
    {
        $st = $this->db->prepare("SELECT r.job_id, r.body_json, m.checkpoint FROM results r JOIN jobs j ON j.id = r.job_id
            LEFT JOIN inverse_worker_models m ON m.worker_id = r.worker_id AND m.seed = j.seed
            WHERE j.template_id = 'sf-inverse-experiment' AND r.status = 'done' AND (? = 0 OR j.seed = ?)
            ORDER BY r.id DESC LIMIT 1");
        $st->execute([$seed, $seed]);
        $row = $st->fetch();
        $body = $row ? json_decode((string) $row['body_json'], true) : null;
        if (isset($row['checkpoint']) && is_array($body['research'] ?? null)) {
            $body['research']['checkpoint'] = json_decode($row['checkpoint'], true);
        }
        return is_array($body['research'] ?? null) ? ['jobId' => $row['job_id'], 'research' => $body['research']] : null;
    }

    public function inverseGalleryEnabled(): bool
    {
        return !empty($this->config['inverse_gallery']);
    }

    private const INVERSE_SHARED_BENCHMARK = 'inverse-shared-1';

    public function inverseChampion(): array
    {
        $row = $this->db->query('SELECT benchmark, generation, job_id, checkpoint, passes_json, audit_passed, promoted_at
            FROM inverse_champion WHERE id = 1')->fetch();
        if (!$row || $row['benchmark'] !== self::INVERSE_SHARED_BENCHMARK) {
            throw new RuntimeException('The shared inverse benchmark is unavailable.');
        }
        return [
            'benchmark' => $row['benchmark'], 'generation' => (int) $row['generation'], 'jobId' => $row['job_id'],
            'checkpoint' => $row['checkpoint'] === null ? null : json_decode($row['checkpoint'], true),
            'passes' => $row['passes_json'] === null ? null : json_decode($row['passes_json'], true),
            'auditPassed' => $row['audit_passed'] === null ? null : (int) $row['audit_passed'],
            'promotedAt' => $row['promoted_at'],
        ];
    }

    private function considerInversePromotion(string $jobId, array $assigned, array $report, array $checkpoint): string
    {
        $validPasses = static function ($bits): bool {
            return is_array($bits) && count($bits) === 36 && array_keys($bits) === range(0, 35)
                && count(array_filter($bits, static fn ($bit) => $bit === 0 || $bit === 1)) === 36;
        };
        $candidate = $report['candidate'] ?? null;
        $baseline = $report['incumbent'] ?? null;
        $generation = $assigned['generation'];
        $audit = $report['auditPassed'] ?? null;
        $incumbentAudit = $report['incumbentAuditPassed'] ?? null;
        if (($report['benchmark'] ?? '') !== $assigned['benchmark'] || ($report['parentGeneration'] ?? null) !== $generation
            || !$validPasses($candidate) || ($generation > 0 ? !$validPasses($baseline) : $baseline !== null)
            || ($report['auditTrials'] ?? null) !== 36 || !is_int($audit) || $audit < 0 || $audit > 36) {
            throw new InvalidArgumentException('Invalid shared inverse benchmark report.');
        }
        $champion = $this->inverseChampion();
        if ($generation !== $champion['generation']) {
            return 'stale';
        }
        if ($baseline !== $champion['passes'] || $incumbentAudit !== $champion['auditPassed']) {
            throw new InvalidArgumentException('The incumbent did not reproduce its benchmark.');
        }
        $passes = array_sum($candidate);
        if ($generation === 0 && $passes === 0) {
            return 'below-margin';
        }
        if ($generation > 0) {
            $improvedTasks = 0;
            for ($i = 0; $i < count($candidate); $i += 3) {
                if (array_sum(array_slice($candidate, $i, 3)) > array_sum(array_slice($baseline, $i, 3))) {
                    $improvedTasks++;
                }
            }
            if ($passes - array_sum($baseline) < 3 || $improvedTasks < 2) {
                return 'below-margin';
            }
        }
        $bytes = @gzdecode(base64_decode($checkpoint['payload'], true), 38065);
        if (!is_string($bytes) || strlen($bytes) !== 38064) {
            throw new InvalidArgumentException('Invalid shared inverse checkpoint size.');
        }
        foreach (unpack('g*', $bytes) as $weight) {
            if (!is_finite($weight)) {
                throw new InvalidArgumentException('Invalid shared inverse checkpoint weight.');
            }
        }
        $update = $this->db->prepare('UPDATE inverse_champion SET generation = generation + 1, job_id = ?, checkpoint = ?,
            passes_json = ?, audit_passed = ?, promoted_at = ? WHERE id = 1 AND generation = ? AND benchmark = ?');
        $update->execute([$jobId, json_encode($checkpoint), json_encode($candidate), $audit, $this->now(), $generation, $assigned['benchmark']]);
        return $update->rowCount() === 1 ? 'promoted' : 'stale';
    }

    private function saveInverseDiscoveries(string $worker, int $seed, array $rows, bool $composition = false, bool $sequence = false): void
    {
        if (count($rows) > 32) {
            throw new InvalidArgumentException('Too many inverse discoveries.');
        }
        $insert = $this->db->prepare('REPLACE INTO inverse_discoveries
            (id, worker_id, seed, case_count, accuracy, recall, specificity, demo_accuracy, circuit_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $widths = [4, 4, 3, 3, 2, 2, 2];
        foreach (array_values($rows) as $index => $row) {
            $genes = $row['genes'] ?? null;
            $replay = $row['replay'] ?? null;
            $cases = $row['freshCount'] ?? null;
            if (!is_array($replay)
                || count($replay) < 1 || count($replay) > 4 || !is_int($cases) || $cases < count($replay) || $cases > 256) {
                throw new InvalidArgumentException('Invalid inverse circuit or replay cases.');
            }
            if ($composition) {
                $circuit = ['graph' => $this->validateInverseGraph($row['graph'] ?? null, $sequence)];
                if ($sequence) {
                    $circuit['timing'] = 'first-spike';
                }
            } else {
                if (!is_array($genes) || count($genes) !== count($widths)) {
                    throw new InvalidArgumentException('Invalid inverse circuit genes.');
                }
                $genes = array_values($genes);
                foreach ($genes as $i => $gene) {
                    if (!is_int($gene) || $gene < 0 || $gene >= $widths[$i]) {
                        throw new InvalidArgumentException('Invalid inverse circuit gene.');
                    }
                }
                $circuit = ['genes' => $genes];
            }
            foreach ($replay as $case) {
                if (!is_array($case) || count($case) !== 2 || !is_int($case[0] ?? null)
                    || $case[0] < 0 || $case[0] > 255
                    || ($sequence ? (!is_array($case[1] ?? null) || count($case[1]) !== 2
                        || count(array_filter($case[1], static fn ($time) => $time === null || (is_int($time) && $time >= 0 && $time < 8))) !== 2)
                        : !in_array($case[1] ?? null, [0, 1], true))) {
                    throw new InvalidArgumentException('Invalid inverse replay case.');
                }
            }
            $scores = [];
            foreach (['accuracy', 'recall', 'specificity', 'demoAccuracy'] as $name) {
                $value = $row[$name] ?? null;
                if ($value === null && in_array($name, ['recall', 'specificity'], true)) {
                    $scores[] = null;
                    continue;
                }
                if ((!is_int($value) && !is_float($value)) || $value < 0 || $value > 1) {
                    throw new InvalidArgumentException('Invalid inverse discovery score.');
                }
                $scores[] = $value;
            }
            $id = hash('sha256', 'inverse-designer-1:' . $seed . ':' . $index);
            $insert->execute(array_merge([$id, $worker, $seed, $cases], $scores, [
                json_encode($circuit + ['replay' => $replay, 'candidate' => $index + 1]), $this->now(),
            ]));
        }
    }

    private function validateInverseGraph($graph, bool $sequence): array
    {
        $nodes = $graph['neurons'] ?? null;
        $edges = $graph['edges'] ?? null;
        $count = is_array($nodes) ? count($nodes) : 0;
        $outputs = $sequence ? [$count - 2, $count - 1] : [5];
        if (($graph['version'] ?? null) !== 'snn-graph-1' || !is_array($edges)
            || ($sequence ? ($count < 8 || $count > 10) : $count !== 6) || count($edges) > 30
            || ($graph['inputs'] ?? null) !== [0, 1] || ($graph['outputs'] ?? null) !== $outputs) {
            throw new InvalidArgumentException('Invalid composition graph.');
        }
        $cleanNodes = [];
        foreach (array_values($nodes) as $i => $node) {
            $kind = $i < 2 ? 'input' : (in_array($i, $outputs, true) ? 'output' : 'lif');
            $thr = $node['thr'] ?? null;
            $leak = $node['leak'] ?? null;
            if (($node['kind'] ?? null) !== $kind || !is_numeric($thr) || $thr <= 0 || $thr > 16
                || !is_numeric($leak) || $leak < 0 || $leak > 1) {
                throw new InvalidArgumentException('Invalid composition neuron.');
            }
            $cleanNodes[] = ['kind' => $kind, 'thr' => (float) $thr, 'leak' => (float) $leak];
        }
        $cleanEdges = [];
        foreach ($edges as $edge) {
            $from = $edge['from'] ?? null;
            $to = $edge['to'] ?? null;
            $weight = $edge['weight'] ?? null;
            $delay = $edge['delay'] ?? null;
            if (!is_int($from) || !is_int($to) || $from < 0 || $from >= $to || $to < 2 || $to >= $count
                || !is_numeric($weight) || abs((float) $weight) > 16 || !is_int($delay) || $delay < 0 || $delay > 4) {
                throw new InvalidArgumentException('Invalid composition connection.');
            }
            $cleanEdges[] = ['from' => $from, 'to' => $to, 'weight' => (float) $weight, 'delay' => $delay];
        }
        return ['version' => 'snn-graph-1', 'neurons' => $cleanNodes, 'edges' => $cleanEdges, 'inputs' => [0, 1], 'outputs' => $outputs];
    }

    public function inverseDiscoveries(?int $limit = null): array
    {
        $items = [];
        $limit = $limit === null ? $this->discoveriesTopN() : max(1, min(20, $limit));
        foreach (["d.circuit_json LIKE '%first-spike%'", "d.circuit_json LIKE '%snn-graph-1%' AND d.circuit_json NOT LIKE '%first-spike%'",
            "d.circuit_json NOT LIKE '%snn-graph-1%'"] as $format) {
            foreach (['accuracy' => 'Accuracy', 'recall' => 'Recall', 'specificity' => 'Specificity', 'demo_accuracy' => 'Demo match'] as $column => $label) {
                $rows = $this->db->query("SELECT d.*, w.name, w.public_credit FROM inverse_discoveries d
                    LEFT JOIN workers w ON w.id = d.worker_id WHERE d.$column IS NOT NULL AND $format
                    ORDER BY d.$column DESC, d.created_at DESC, d.id ASC LIMIT $limit")->fetchAll();
                foreach ($rows as $rank => $row) {
                    $id = $row['id'];
                    if (!isset($items[$id])) {
                        $circuit = json_decode($row['circuit_json'], true);
                        $g = $circuit['genes'] ?? null;
                        $graph = $circuit['graph'] ?? null;
                        $hidden = $graph ? count($graph['neurons']) - count($graph['inputs']) - count($graph['outputs']) : 1;
                        $items[$id] = [
                            'hash' => $id, 'rank' => $rank + 1,
                            'task' => isset($circuit['timing']) ? 'Two-stream sequence' : ($graph ? 'Three-neuron pilot' : 'Inverse design'),
                            'level' => $hidden,
                            'label' => 'Circuit ' . $row['seed'] . '–' . ($circuit['candidate'] ?? substr($id, 0, 6)),
                            'worker' => $row['worker_id'], 'finder' => $this->creditName($row),
                            'when' => $row['created_at'], 'seed' => (int) $row['seed'], 'cases' => (int) $row['case_count'],
                            'held' => (float) $row['accuracy'], 'accuracy' => (float) $row['accuracy'], 'train' => (float) $row['demo_accuracy'],
                            'recall' => $row['recall'] === null ? null : (float) $row['recall'],
                            'specificity' => $row['specificity'] === null ? null : (float) $row['specificity'],
                            'neurons' => $graph ? count($graph['neurons']) : 4,
                            'synapses' => $graph ? count($graph['edges']) : 1 + (int) ($g[0] !== 1) + (int) ($g[1] !== 1) + $g[6],
                            'inverse' => $circuit, 'badges' => [],
                        ];
                    }
                    $items[$id]['badges'][] = $label . ' #' . ($rank + 1);
                }
            }
        }
        return array_values($items);
    }

    public function compositionResults(): array
    {
        $rows = $this->db->query("SELECT r.body_json FROM results r JOIN jobs j ON j.id = r.job_id
            WHERE j.template_id = 'sf-inverse-experiment' AND j.spec_json LIKE '%inverseComposition%'
            AND r.status = 'done' ORDER BY r.id DESC LIMIT 120")->fetchAll(PDO::FETCH_COLUMN);
        $families = [];
        foreach ($rows as $body) {
            $report = json_decode($body, true)['research'] ?? [];
            $family = $report['family'] ?? '';
            if (!is_string($family) || !isset($report['learned']['trials'], $report['learned']['passed'], $report['baseline']['passed'])) {
                continue;
            }
            $total = $families[$family] ?? ['jobs' => 0, 'trials' => 0, 'learned' => 0, 'baseline' => 0];
            $total['jobs']++;
            $total['trials'] += (int) $report['learned']['trials'];
            $total['learned'] += (int) $report['learned']['passed'];
            $total['baseline'] += (int) $report['baseline']['passed'];
            $families[$family] = $total;
        }
        return $families;
    }

    private function trimInverseDiscoveries(): void
    {
        $older = $this->db->query('SELECT id FROM inverse_discoveries ORDER BY created_at DESC, id ASC LIMIT 256 OFFSET 1000')
            ->fetchAll(PDO::FETCH_COLUMN);
        if (!$older) {
            return;
        }
        $remove = array_values(array_diff($older, array_column($this->inverseDiscoveries(20), 'hash')));
        if ($remove) {
            $this->db->prepare('DELETE FROM inverse_discoveries WHERE id IN (' . implode(',', array_fill(0, count($remove), '?')) . ')')
                ->execute($remove);
        }
    }

    public function recentSequenceStudies(): array
    {
        $rows = $this->db->query('SELECT s.seed, r.body_json FROM sequence_study_results s
            JOIN results r ON r.id = s.result_id ORDER BY s.result_id DESC LIMIT 12')->fetchAll();
        $studies = [];
        foreach ($rows as $row) {
            $body = json_decode((string) $row['body_json'], true);
            $report = $body['research'] ?? [];
            if (($report['version'] ?? '') === 'sequence-experiment-2' && is_array($report['rounds'] ?? null)) {
                $studies[(int) $row['seed']] = ['config' => $report['config'] ?? [], 'rounds' => $report['rounds']];
            }
        }
        return $studies;
    }

    public function queueSequenceStudy(int $firstSeed): array
    {
        if ($firstSeed < 1 || $firstSeed > 999998) {
            throw new InvalidArgumentException('The first study seed must be from 1 to 999998.');
        }
        $this->db->beginTransaction();
        try {
            $ids = [];
            for ($seed = $firstSeed; $seed < $firstSeed + 3; $seed++) {
                $ids[] = $this->createJob('sf-sequence-experiment', 'Sequence study · seed ' . $seed, 0.8, $seed);
            }
            $this->db->commit();
            return $ids;
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function sequenceCheckpoint(array $worker, string $jobId, ?array $snapshot): ?array
    {
        $lease = $this->db->prepare("SELECT j.spec_json FROM jobs j JOIN leases l ON l.job_id = j.id
            WHERE j.id = ? AND l.worker_id = ? AND l.until_at > ? AND j.status = 'leased'
            AND j.template_id = 'sf-sequence-experiment'");
        $lease->execute([$jobId, $worker['id'], $this->now()]);
        $spec = json_decode((string) $lease->fetchColumn(), true);
        if (($spec['experiment']['studyVersion'] ?? 0) < 2) {
            throw new InvalidArgumentException('No active sequence experiment lease.');
        }
        if ($snapshot !== null) {
            $rounds = $snapshot['completedRounds'] ?? null;
            $payload = $snapshot['payload'] ?? null;
            if (!is_int($rounds) || $rounds < 1 || $rounds > (int) $spec['experiment']['rounds']
                || !is_string($payload) || strlen($payload) > 524288 || base64_decode($payload, true) === false) {
                throw new InvalidArgumentException('Invalid sequence checkpoint.');
            }
            $active = "EXISTS (SELECT 1 FROM leases WHERE job_id = ? AND worker_id = ? AND until_at > ?)";
            $args = [$jobId, $worker['id'], $this->now()];
            $sql = 'INSERT INTO sequence_checkpoints (job_id, completed_rounds, payload) SELECT ?, ?, ? WHERE ' . $active
                . ' AND NOT EXISTS (SELECT 1 FROM sequence_checkpoints WHERE job_id = ?)';
            try {
                $this->db->prepare($sql)->execute(array_merge([$jobId, $rounds, $payload], $args, [$jobId]));
            } catch (PDOException $e) {
                if ((string) $e->getCode() !== '23000') {
                    throw $e;
                }
            }
            $this->db->prepare('UPDATE sequence_checkpoints SET completed_rounds = ?, payload = ? WHERE job_id = ? AND completed_rounds < ? AND ' . $active)
                ->execute(array_merge([$rounds, $payload, $jobId, $rounds], $args));
        }
        $st = $this->db->prepare('SELECT completed_rounds, payload FROM sequence_checkpoints WHERE job_id = ?');
        $st->execute([$jobId]);
        $row = $st->fetch();
        return $row ? ['completedRounds' => (int) $row['completed_rounds'], 'payload' => $row['payload']] : null;
    }

    /** A seed no other job has used, so two jobs never repeat the same search. */
    public function freshSeed(): int
    {
        $check = $this->db->prepare('SELECT 1 FROM jobs WHERE seed = ? LIMIT 1');
        $seed = random_int(1, 1000000);
        for ($try = 0; $try < 40; $try++) {
            $check->execute([$seed]);
            if (!$check->fetch()) {
                return $seed;
            }
            $seed = random_int(1, 1000000);
        }
        return $seed;
    }

    /** Short canonical hashes of designs the library already has for a task, so a job can skip re-evaluating them. */
    public function knownDesignHashes(string $taskId, int $limit = 100): array
    {
        $st = $this->db->prepare('SELECT design_hash FROM design_records WHERE task_id = ? AND duplicate_of IS NULL AND design_hash IS NOT NULL ORDER BY seq DESC LIMIT ' . max(1, min(200, $limit)));
        $st->execute([$taskId]);
        $out = [];
        foreach ($st->fetchAll() as $row) {
            $out[substr((string) $row['design_hash'], 0, 16)] = true;
        }
        return array_keys($out);
    }

    public function setProject(string $id, ?int $priority, ?bool $enabled): void
    {
        if ($priority !== null && ($priority < 0 || $priority > 100)) {
            throw new InvalidArgumentException('Project priority must be from 0 to 100.');
        }
        if ($priority !== null) {
            $this->db->prepare('UPDATE projects SET priority = ? WHERE id = ?')->execute([$priority, $id]);
        }
        if ($enabled !== null) {
            $this->db->prepare('UPDATE projects SET enabled = ? WHERE id = ?')->execute([$enabled ? 1 : 0, $id]);
        }
    }

    public function login(string $username, string $password): ?array
    {
        $st = $this->db->prepare('SELECT * FROM owner WHERE username = ?');
        $st->execute([$username]);
        $row = $st->fetch();
        if (!$row || !password_verify($password, (string) $row['password_hash'])) {
            return null;
        }
        return $this->session('owner', (string) $row['username']);
    }

    public const PARTICIPANT_SESSION_SECONDS = 30 * 86400;

    public function session(string $role, string $subject): array
    {
        $id = bin2hex(random_bytes(16));
        $csrf = bin2hex(random_bytes(16));
        $ttl = $role === 'participant' ? self::PARTICIPANT_SESSION_SECONDS : 86400;
        $exp = gmdate('c', strtotime($this->now()) + $ttl);
        $this->db->prepare('INSERT INTO sessions (id, role, subject, csrf, expires_at) VALUES (?, ?, ?, ?, ?)')->execute([$id, $role, $subject, $csrf, $exp]);
        return ['id' => $id, 'role' => $role, 'subject' => $subject, 'csrf' => $csrf];
    }

    public function sessionById(string $id): ?array
    {
        if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
            return null;
        }
        $st = $this->db->prepare('SELECT * FROM sessions WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row || strtotime((string) $row['expires_at']) < strtotime($this->now())) {
            return null;
        }
        return $row;
    }

    public function importQueueDir(string $dir): int
    {
        $n = 0;
        $doneDir = $dir . '/done';
        $jobDir = $dir . '/jobs';
        if (!is_dir($jobDir)) {
            throw new InvalidArgumentException('No jobs folder in that queue checkout.');
        }
        foreach (scandir($jobDir) ?: [] as $file) {
            if (!str_ends_with($file, '.json')) {
                continue;
            }
            $job = json_decode((string) file_get_contents($jobDir . '/' . $file), true);
            if (!is_array($job) || empty($job['id'])) {
                continue;
            }
            $id = 'import-' . preg_replace('/[^a-z0-9._-]/', '', (string) $job['id']);
            $donePath = $doneDir . '/' . $job['id'] . '.json';
            $done = is_file($donePath) ? json_decode((string) file_get_contents($donePath), true) : null;
            $status = is_array($done) ? 'done' : 'held';
            $exists = $this->db->prepare('SELECT id FROM jobs WHERE id = ?');
            $exists->execute([$id]);
            if ($exists->fetch()) {
                continue;
            }
            $hash = $this->protocolHash();
            $this->db->prepare('INSERT INTO jobs (id, project_id, template_id, title, spec_json, code_hash, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$id, 'bugbrain', 'bb-order3', (string) ($job['title'] ?? $job['id']), json_encode(['imported' => true, 'sourceId' => $job['id']]), $hash, (float) ($job['priority'] ?? 0.5), $status, $this->now()]);
            if (is_array($done)) {
                $summary = 'Imported from the git queue. ' . (string) ($done['status'] ?? 'done');
                $this->db->prepare('INSERT INTO results (job_id, worker_id, status, summary, body_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                    ->execute([$id, 'import', 'done', substr($summary, 0, 500), json_encode(['synthetic' => false, 'imported' => true, 'worker' => $done['worker'] ?? null]), (string) ($done['finishedAt'] ?? $this->now())]);
            }
            $n++;
        }
        return $n;
    }

    public function history(string $workerId): array
    {
        $st = $this->db->prepare('SELECT created_at, job_id, status, summary FROM results WHERE worker_id = ? ORDER BY id DESC LIMIT 8');
        $st->execute([$workerId]);
        return $st->fetchAll();
    }

    public function leasesOf(string $workerId): array
    {
        $st = $this->db->prepare('SELECT leases.job_id, leases.until_at, leases.heartbeat_at, leases.started_at, leases.progress, leases.slot, jobs.title, jobs.project_id FROM leases JOIN jobs ON jobs.id = leases.job_id WHERE leases.worker_id = ? ORDER BY leases.slot ASC, leases.started_at ASC');
        $st->execute([$workerId]);
        return $st->fetchAll();
    }

    public function currentLease(string $workerId): ?array
    {
        $st = $this->db->prepare('SELECT leases.job_id, leases.until_at, leases.heartbeat_at, leases.started_at, leases.progress, jobs.title, jobs.project_id FROM leases JOIN jobs ON jobs.id = leases.job_id WHERE leases.worker_id = ?');
        $st->execute([$workerId]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function ensureParticipant(array $worker): string
    {
        $pid = (string) ($worker['participant_id'] ?? '');
        if ($pid !== '') {
            return $pid;
        }
        $pid = (string) $worker['id'];
        $this->db->prepare('UPDATE workers SET participant_id = ? WHERE id = ? AND (participant_id IS NULL OR participant_id = \'\')')->execute([$pid, $worker['id']]);
        return $pid;
    }

    public function computersFor(string $participantId): array
    {
        $st = $this->db->prepare('SELECT * FROM workers WHERE participant_id = ? AND revoked = 0 ORDER BY created_at ASC, id ASC');
        $st->execute([$participantId]);
        return $st->fetchAll();
    }

    public function workerOwns(string $participantId, string $workerId): bool
    {
        $st = $this->db->prepare('SELECT id FROM workers WHERE id = ? AND participant_id = ? AND revoked = 0');
        $st->execute([$workerId, $participantId]);
        return (bool) $st->fetch();
    }

    /** Computers the owner has chosen to show on Home / My computer. */
    public function ownerHomeComputers(): array
    {
        return $this->db->query('SELECT * FROM workers WHERE owner_home = 1 AND revoked = 0 AND removed_at IS NULL ORDER BY created_at ASC, id ASC')->fetchAll();
    }

    public function isOwnerHome(string $workerId): bool
    {
        $st = $this->db->prepare('SELECT id FROM workers WHERE id = ? AND owner_home = 1 AND revoked = 0 AND removed_at IS NULL');
        $st->execute([$workerId]);
        return (bool) $st->fetch();
    }

    public function setOwnerHome(string $workerId, bool $shown): void
    {
        $st = $this->db->prepare('SELECT id, revoked, removed_at FROM workers WHERE id = ?');
        $st->execute([$workerId]);
        $row = $st->fetch();
        if (!$row || (int) $row['revoked'] === 1 || (string) ($row['removed_at'] ?? '') !== '') {
            throw new InvalidArgumentException('That computer is unknown, revoked, or removed.');
        }
        $this->db->prepare('UPDATE workers SET owner_home = ? WHERE id = ?')->execute([$shown ? 1 : 0, $workerId]);
    }

    /** Once: put the existing travirtual computer on the owner's Home. Never re-applies. */
    private function seedOwnerHomeTravirtual(): void
    {
        $done = $this->db->query("SELECT id FROM supply_state WHERE id = 'seed-owner-home-travirtual'")->fetch();
        if ($done) {
            return;
        }
        $has = (int) $this->db->query('SELECT COUNT(*) FROM workers WHERE owner_home = 1')->fetchColumn();
        if ($has === 0) {
            $this->db->prepare('UPDATE workers SET owner_home = 1 WHERE revoked = 0 AND removed_at IS NULL AND LOWER(name) = ?')->execute(['travirtual']);
        }
        $n = (int) $this->db->query('SELECT COUNT(*) FROM workers WHERE owner_home = 1')->fetchColumn();
        $this->db->prepare('INSERT INTO supply_state (id, ran_at, note) VALUES (?, ?, ?)')->execute(['seed-owner-home-travirtual', $this->now(), 'flagged ' . $n]);
    }

    public function contribution(string $workerId): array
    {
        $st = $this->db->prepare('SELECT COUNT(*) AS n, COALESCE(SUM(seconds), 0) AS secs FROM results WHERE worker_id = ? AND status = ?');
        $st->execute([$workerId, 'done']);
        $row = $st->fetch() ?: ['n' => 0, 'secs' => 0];
        return ['done' => (int) $row['n'], 'seconds' => (int) $row['secs']];
    }

    public function homeStats(): array
    {
        $now = strtotime($this->now());
        $online = 0;
        foreach ($this->db->query('SELECT last_seen, revoked FROM workers')->fetchAll() as $row) {
            if ((int) $row['revoked'] === 1 || empty($row['last_seen'])) {
                continue;
            }
            if (($now - strtotime((string) $row['last_seen'])) <= 180) {
                $online++;
            }
        }
        $done = (int) $this->db->query("SELECT COUNT(*) FROM jobs WHERE status = 'done'")->fetchColumn();
        $projects = (int) $this->db->query('SELECT COUNT(*) FROM projects')->fetchColumn();
        return ['online' => $online, 'done' => $done, 'projects' => $projects];
    }

    /* Public numbers for the Right now box. Read only: it never applies a task policy. */
    /* Same for every visitor and polled every 15 s by each open Home page: shared for live_cache_seconds (default 10). */
    public function liveStatus(): array
    {
        $ttl = (int) ($this->config['live_cache_seconds'] ?? 30);
        return $ttl > 0 ? $this->cached('live-v1', $ttl, function (): array { return $this->liveStatusNow(); }) : $this->liveStatusNow();
    }

    public function liveStatusNow(): array
    {
        $stats = $this->homeStats();
        $now = strtotime($this->now());
        $cores = 0;
        foreach ($this->db->query('SELECT last_seen, revoked, paused, runtime_json FROM workers')->fetchAll() as $row) {
            if ((int) $row['revoked'] === 1 || empty($row['last_seen']) || ($now - strtotime((string) $row['last_seen'])) > 180) {
                continue;
            }
            $rt = json_decode((string) ($row['runtime_json'] ?? ''), true);
            if ((int) $row['paused'] !== 1) {
                $cores += is_array($rt) && isset($rt['slots']) ? max(0, (int) $rt['slots']) : 1;
            }
        }
        $running = (int) $this->db->query('SELECT COUNT(*) FROM leases')->fetchColumn();
        $tasks = [];
        $rows = $this->db->query("SELECT DISTINCT task_id FROM design_records WHERE engine_version NOT IN ('spikefoundry-designer-1', 'spikefoundry-designer-2')")->fetchAll();
        $order = self::CURRICULUM;
        foreach ($rows as $row) {
            $task = (string) $row['task_id'];
            if (!preg_match('/^[a-z0-9._-]{1,64}$/', $task)) {
                continue;
            }
            $at = array_search($task, $order, true);
            $policy = $this->taskPolicy('spikefoundry', $task);
            $best = null;
            try {
                $sum = $this->db->prepare('SELECT MAX(best_held) FROM design_summaries WHERE task_id = ?');
                $sum->execute([$task]);
                $v = $sum->fetchColumn();
                $best = $v === null || $v === false ? null : round((float) $v, 3);
            } catch (Exception $e) {
                $best = null;
            }
            if ((int) $policy['paused'] === 1) {
                $state = (string) ($policy['pause_reason'] ?? '') === 'solved' ? 'Solved' : 'Paused';
            } else {
                $health = $this->taskStatus('spikefoundry', $task);
                $state = (string) $health['status'];
                $pts = $health['points'];
                if ($best === null && $pts !== []) {
                    $best = round((float) $pts[count($pts) - 1]['bestHeld'], 3);
                }
            }
            $tasks[] = ['task' => $task, 'level' => $at === false ? count($order) + 1 : $at + 1, 'state' => $state, 'best' => $best];
        }
        usort($tasks, function ($a, $b) {
            return $a['level'] === $b['level'] ? strcmp($a['task'], $b['task']) : ($a['level'] < $b['level'] ? -1 : 1);
        });
        $projects = [];
        foreach ($this->db->query('SELECT id, title, priority, enabled FROM projects ORDER BY priority DESC, id ASC')->fetchAll() as $p) {
            $projects[] = ['id' => (string) $p['id'], 'title' => (string) $p['title'], 'priority' => (int) $p['priority'], 'enabled' => (int) $p['enabled'] === 1];
        }
        return [
            'online' => (int) $stats['online'],
            'done' => (int) $stats['done'],
            'running' => $running,
            'queued' => $this->claimableQueued(),
            'slots' => $cores,
            'tasks' => $tasks,
            'projects' => $projects,
            'at' => $this->now(),
        ];
    }

    public function createProject(string $title, string $summary, string $runner, int $priority, bool $enabled): string
    {
        if (!in_array($runner, $this->allowedRunners(), true)) {
            throw new InvalidArgumentException('Choose a runner from the list.');
        }
        $title = trim($title);
        $summary = trim($summary);
        if ($title === '' || strlen($title) > 80) {
            throw new InvalidArgumentException('Project name must be 1-80 characters.');
        }
        if ($summary === '' || strlen($summary) > 400) {
            throw new InvalidArgumentException('Description must be 1-400 characters.');
        }
        if ($priority < 0 || $priority > 100) {
            throw new InvalidArgumentException('Project priority must be from 0 to 100.');
        }
        $id = strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', $title));
        $id = trim($id, '-');
        if (strlen($id) < 2) {
            throw new InvalidArgumentException('Use a name with letters or digits.');
        }
        if (strlen($id) > 40) {
            $id = substr($id, 0, 40);
            $id = trim($id, '-');
        }
        $baseId = $id;
        $n = 2;
        $exists = $this->db->prepare('SELECT id FROM projects WHERE id = ?');
        while (true) {
            $exists->execute([$id]);
            if (!$exists->fetch()) {
                break;
            }
            $id = $baseId . '-' . $n;
            $n++;
            if ($n > 50) {
                throw new InvalidArgumentException('Could not find a free project id.');
            }
        }
        $family = $this->runnerFamily($runner);
        $this->db->prepare('INSERT INTO projects (id, title, summary, priority, enabled, family) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$id, $title, $summary, $priority, $enabled ? 1 : 0, $family]);
        $spec = $runner === 'spikefoundry/run.js'
            ? ['scenario' => 'vision', 'batches' => 1, 'scenarioParams' => ['batch' => 2, 'channels' => 1, 'height' => 4, 'width' => 4, 'steps' => 6]]
            : [
                'plan' => 'deepURSx3',
                'task' => ['env' => 'seq', 'params' => ['source' => 'order3', 'K' => 8, 'readIn' => 0.01]],
                'growths' => 1,
                'variant' => 'pl.lr@cortex=0.2,P.granN=32000,P.granKmin=3,P.granK=4,P.granW=60,P.granLrT=100000,P.granLrLate=0.05,P.fastEngine=1',
            ];
        $templateId = $id . '-default';
        $this->db->prepare('INSERT INTO templates (id, project_id, title, runner, spec_json, code_hash) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$templateId, $id, $title, $runner, json_encode($spec), $this->protocolHash()]);
        return $id;
    }

    public function listJobs(string $status, int $page, int $perPage = 20): array
    {
        $map = ['all' => '', 'queued' => 'queued', 'running' => 'leased', 'leased' => 'leased', 'done' => 'done', 'held' => 'held'];
        if (!array_key_exists($status, $map)) {
            throw new InvalidArgumentException('Unknown status.');
        }
        if ($perPage < 1) {
            $perPage = 20;
        }
        if ($perPage > 100) {
            $perPage = 100;
        }
        if ($page < 1) {
            $page = 1;
        }
        $where = '';
        $args = [];
        if ($map[$status] !== '') {
            $where = ' WHERE status = ?';
            $args[] = $map[$status];
        }
        $count = $this->db->prepare('SELECT COUNT(*) FROM jobs' . $where);
        $count->execute($args);
        $total = (int) $count->fetchColumn();
        $pages = max(1, (int) ceil($total / $perPage));
        if ($page > $pages) {
            $page = $pages;
        }
        $offset = ($page - 1) * $perPage;
        $sql = 'SELECT * FROM jobs' . $where . ' ORDER BY created_at DESC, id ASC LIMIT ' . (int) $perPage . ' OFFSET ' . (int) $offset;
        $st = $this->db->prepare($sql);
        $st->execute($args);
        return ['rows' => $st->fetchAll(), 'total' => $total, 'page' => $page, 'pages' => $pages, 'status' => $status];
    }

    public function workerRepo(): string
    {
        $repo = trim((string) ($this->config['worker_repo'] ?? 'https://github.com/TravisA9/bugbrain-neurons.git'));
        return $repo !== '' ? $repo : 'https://github.com/TravisA9/bugbrain-neurons.git';
    }

    public function workerRef(): string
    {
        $ref = trim((string) ($this->config['worker_ref'] ?? 'cursor/worker-console-22bf'));
        return $ref !== '' ? $ref : 'cursor/worker-console-22bf';
    }

    /** Per-upload totals for highlight checks, so they are read once per batch, not per record. */
    private $highlightMemo = [];

    public function ingestDesigns(array $worker, array $records, string $protocolHash): array
    {
        $this->highlightMemo = [];
        $cap = (int) ($this->config['design_batch'] ?? 500);
        if ($cap < 1) {
            $cap = 500;
        }
        if ($cap > 500) {
            $cap = 500;
        }
        if (count($records) > $cap) {
            throw new InvalidArgumentException('Too many design records in one upload.');
        }
        $perJob = (int) ($this->config['design_per_job'] ?? 2000);
        $confirmed = 0;
        $stored = 0;
        $skipped = 0;
        $capped = 0;
        $touched = [];
        $seen = [];
        foreach ($records as $rec) {
            if (is_array($rec) && $this->retiredDesign($rec)) {
                throw new InvalidArgumentException('Design upload from designer version spikefoundry-designer-1 or spikefoundry-designer-2 is not accepted.');
            }
        }
        /* Records below the task's kept set are only counted. A retried upload of the same batch must not count twice. */
        $batchKey = $this->uploadBatchKey($worker, $records);
        $batchSeen = $this->db->prepare('SELECT id FROM upload_batches WHERE id = ?');
        $batchSeen->execute([$batchKey]);
        if ($batchSeen->fetch()) {
            return ['stored' => 0, 'skipped' => count($records), 'confirmed' => 0, 'capped' => 0];
        }
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                $skipped++;
                continue;
            }
            $taskId = (string) ($rec['taskId'] ?? '');
            $taskVersion = (string) ($rec['taskVersion'] ?? '');
            $genomeJson = (string) ($rec['genomeJson'] ?? '');
            $genomeHash = (string) ($rec['genomeHash'] ?? '');
            if (!preg_match('/^[a-z0-9._-]{1,64}$/', $taskId) || !preg_match('/^[a-z0-9._-]{1,32}$/', $taskVersion)) {
                $skipped++;
                continue;
            }
            if (strlen($genomeJson) < 2 || strlen($genomeJson) > 4000 || !preg_match('/^[a-f0-9]{64}$/', $genomeHash)) {
                $skipped++;
                continue;
            }
            if (!hash_equals(hash('sha256', $genomeJson), $genomeHash)) {
                $skipped++;
                continue;
            }
            $decoded = json_decode($genomeJson, true);
            if (!is_array($decoded)) {
                $skipped++;
                continue;
            }
            $jobId = (string) ($rec['jobId'] ?? '');
            if ($jobId !== '' && !preg_match('/^[a-z0-9._-]{2,64}$/', $jobId)) {
                $skipped++;
                continue;
            }
            if ($jobId !== '') {
                $count = $this->db->prepare('SELECT COUNT(*) FROM design_records WHERE job_id = ?');
                $count->execute([$jobId]);
                if ((int) $count->fetchColumn() >= $perJob) {
                    $skipped++;
                    continue;
                }
            }
            $seed = (int) ($rec['seed'] ?? 0);
            $version = (int) ($rec['genomeVersion'] ?? 1);
            if ($version < 1 || $version > 2) {
                $version = 1;
            }
            $scores = isset($rec['metrics']) && is_array($rec['metrics']) ? $rec['metrics'] : [];
            $arm = (isset($scores['arm']) && ($scores['arm'] === 'random' || $scores['arm'] === 'designer')) ? (string) $scores['arm'] : 'designer';
            $scoreJson = json_encode([
                'quality' => isset($scores['quality']) ? (float) $scores['quality'] : null,
                'accuracy' => isset($scores['accuracy']) ? (float) $scores['accuracy'] : null,
                'f1' => isset($scores['f1']) ? (float) $scores['f1'] : null,
                'precision' => isset($scores['precision']) ? (float) $scores['precision'] : null,
                'recall' => isset($scores['recall']) ? (float) $scores['recall'] : null,
                'train' => isset($scores['train']) ? (float) $scores['train'] : (isset($scores['quality']) ? (float) $scores['quality'] : null),
                'heldOut' => isset($scores['heldOut']) ? (float) $scores['heldOut'] : (isset($scores['quality']) ? (float) $scores['quality'] : null),
                'arm' => $arm,
            ]);
            if ($scoreJson === false || strlen($scoreJson) > 500) {
                $skipped++;
                continue;
            }
            $designHash = self::designHash($genomeJson);
            if ($designHash === null) {
                $skipped++;
                continue;
            }
            $id = substr(hash('sha256', $worker['id'] . '|' . $taskId . '|' . $taskVersion . '|' . $genomeHash . '|' . $seed . '|' . $jobId), 0, 32);
            $exists = $this->db->prepare('SELECT id FROM design_records WHERE id = ?');
            $exists->execute([$id]);
            if ($exists->fetch()) {
                $skipped++;
                continue;
            }
            // Already in the library for this task (any computer, any listing order)? Count a confirmation instead of a new row.
            $scoreRow = ['score_json' => $scoreJson, 'spikes' => max(0, (int) ($rec['spikes'] ?? 0)), 'eval_ms' => max(0, (int) ($rec['evalMs'] ?? 0))];
            $first = $this->firstDesign($taskId, $designHash);
            if ($first) {
                $this->confirmDesign($first, $worker, $jobId, $scoreRow);
                $confirmed++;
                continue;
            }
            $heldNow = isset($scores['heldOut']) ? (float) $scores['heldOut'] : (isset($scores['quality']) ? (float) $scores['quality'] : 0.0);
            $evalMs = max(0, (int) ($rec['evalMs'] ?? 0));
            $fit = [
                'train' => isset($scores['train']) ? (float) $scores['train'] : $heldNow,
                'quality' => isset($scores['quality']) ? (float) $scores['quality'] : $heldNow,
                'neurons' => max(0, (int) ($rec['neurons'] ?? 0)),
                'synapses' => max(0, (int) ($rec['synapses'] ?? 0)),
                'spikes' => max(0, (int) ($rec['spikes'] ?? 0)),
            ];
            if (isset($scores['recall'])) {
                $fit['recall'] = (float) $scores['recall'];
            }
            if (isset($scores['f1'])) {
                $fit['f1'] = (float) $scores['f1'];
            }
            if (!isset($seen[$taskId])) {
                $seen[$taskId] = [0, 0, 0];
            }
            $seen[$taskId][0]++;
            $seen[$taskId][2] += $evalMs;
            if (!$this->designFits($taskId, $heldNow, $fit)) {
                // Not among the task's best on any measure: credit the work, keep no row and no genome.
                $this->noteHighlight($worker, $taskId, $heldNow, $genomeHash, $evalMs, false);
                $capped++;
                continue;
            }
            $haveGenome = $this->db->prepare('SELECT hash FROM design_genomes WHERE hash = ?');
            $haveGenome->execute([$genomeHash]);
            if (!$haveGenome->fetch()) {
                $this->db->prepare('INSERT INTO design_genomes (hash, genome_json, version, created_at, design_hash) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$genomeHash, $genomeJson, $version, $this->now(), $designHash]);
            }
            $engine = substr((string) ($rec['engineVersion'] ?? 'spikefoundry-1'), 0, 32);
            $seq = (int) $this->db->query('SELECT COALESCE(MAX(seq), 0) + 1 FROM design_records')->fetchColumn();
            try {
                $this->db->prepare('INSERT INTO design_records (id, genome_hash, task_id, task_version, score_json, neurons, synapses, spikes, eval_ms, engine_version, protocol_hash, worker_id, seed, job_id, arm, seq, created_at, design_hash, canon_key, held, quality) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([
                        $id, $genomeHash, $taskId, $taskVersion, $scoreJson,
                        max(0, (int) ($rec['neurons'] ?? 0)), max(0, (int) ($rec['synapses'] ?? 0)),
                        max(0, (int) ($rec['spikes'] ?? 0)), max(0, (int) ($rec['evalMs'] ?? 0)),
                        $engine, substr($protocolHash, 0, 64), $worker['id'], $seed, $jobId !== '' ? $jobId : null, $arm, $seq, $this->now(),
                        $designHash, $designHash, $heldNow, isset($scores['quality']) ? (float) $scores['quality'] : -1.0,
                    ]);
            } catch (PDOException $e) {
                // Another upload stored the same design a moment ago (unique task + design): confirm it instead.
                $first = $this->firstDesign($taskId, $designHash);
                if (!$first) {
                    throw $e;
                }
                $this->confirmDesign($first, $worker, $jobId, $scoreRow);
                $confirmed++;
                continue;
            }
            $stored++;
            $seen[$taskId][1]++;
            $touched[$taskId] = true;
            $this->rememberKept($taskId, $fit + ['held' => $heldNow]);
            $this->noteHighlight($worker, $taskId, $heldNow, $genomeHash, $evalMs);
        }
        foreach ($seen as $task => $n) {
            $this->bumpTaskTotals((string) $task, $n[0], $n[1], $n[2]);
        }
        try {
            $this->db->prepare('INSERT INTO upload_batches (id, worker_id, created_at) VALUES (?, ?, ?)')->execute([$batchKey, (string) $worker['id'], $this->now()]);
        } catch (PDOException $e) {
            // the same batch finished in a parallel request
        }
        foreach (array_keys($touched) as $touchedTask) {
            $this->applyTaskPolicy('spikefoundry', $touchedTask);
        }
        $this->maybePrune();
        return ['stored' => $stored, 'skipped' => $skipped, 'confirmed' => $confirmed, 'capped' => $capped];
    }

    private function uploadBatchKey(array $worker, array $records): string
    {
        $parts = [(string) $worker['id']];
        foreach ($records as $rec) {
            $parts[] = is_array($rec) ? (string) ($rec['jobId'] ?? '') . '|' . (string) ($rec['genomeHash'] ?? '') . '|' . (string) ($rec['seed'] ?? '') . '|' . (string) ($rec['taskId'] ?? '') : '-';
        }
        return hash('sha256', implode("\n", $parts));
    }

    /* ---- Canonical designs ------------------------------------------------------------------
     * The same circuit gets the same design hash however its parts are listed: object keys sorted, the module and
     * wire lists sorted (they are sets), numbers with at most 6 decimals. spikefoundry/library.js designHash() writes
     * the exact same text. */
    const DESIGN_SET_LISTS = ['modules' => true, 'wires' => true, 'neurons' => true, 'synapses' => true];

    public static function designHash(string $genomeJson): ?string
    {
        $value = json_decode($genomeJson);
        if (!is_object($value) && !is_array($value)) {
            return null;
        }
        return hash('sha256', self::canonText($value, ''));
    }

    public static function canonText($value, string $key): string
    {
        if ($value === null) {
            return 'null';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_int($value)) {
            return (string) $value;
        }
        if (is_float($value)) {
            if (is_nan($value) || is_infinite($value)) {
                return 'null';
            }
            if (floor($value) === $value && abs($value) < 1e15) {
                return (string) (int) $value;
            }
            $text = rtrim(rtrim(sprintf('%.6F', $value), '0'), '.');
            return $text === '-0' ? '0' : $text;
        }
        if (is_string($value)) {
            return (string) json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        if (is_array($value)) {
            $parts = [];
            foreach ($value as $item) {
                $parts[] = self::canonText($item, '');
            }
            if ($key !== '' && isset(self::DESIGN_SET_LISTS[$key])) {
                sort($parts, SORT_STRING);
            }
            return '[' . implode(',', $parts) . ']';
        }
        $vars = get_object_vars($value);
        $keys = array_map('strval', array_keys($vars));
        sort($keys, SORT_STRING);
        $parts = [];
        foreach ($keys as $k) {
            $parts[] = json_encode($k, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ':' . self::canonText($vars[$k], $k);
        }
        return '{' . implode(',', $parts) . '}';
    }

    private function firstDesign(string $taskId, string $designHash): ?array
    {
        $st = $this->db->prepare('SELECT id, worker_id, job_id, score_json FROM design_records WHERE task_id = ? AND design_hash = ? AND duplicate_of IS NULL ORDER BY seq ASC, created_at ASC LIMIT 1');
        $st->execute([$taskId, $designHash]);
        $row = $st->fetch();
        return $row ?: null;
    }

    /** A repeat of a known design: the first finder keeps it; the repeat is counted and the confirming computer noted.
     * A retried upload from the same job is not a confirmation. */
    private function confirmDesign(array $first, array $worker, string $jobId, array $scoreRow = []): void
    {
        $this->keepBetterScore($first, $scoreRow);
        if ($jobId !== '' && $jobId === (string) ($first['job_id'] ?? '')) {
            return;
        }
        $this->db->prepare('UPDATE design_records SET confirmations = confirmations + 1 WHERE id = ?')->execute([(string) $first['id']]);
        $this->noteConfirmer((string) $first['id'], (string) $worker['id'], 1, $this->now());
    }

    /** Scores depend on the job's seed, so a repeat can score higher. The first finder keeps the entry, with the best score seen. */
    private function keepBetterScore(array $first, array $scoreRow): void
    {
        if (!isset($scoreRow['score_json'])) {
            return;
        }
        $old = json_decode((string) ($first['score_json'] ?? ''), true);
        $new = json_decode((string) $scoreRow['score_json'], true);
        $oldQ = is_array($old) && isset($old['quality']) ? (float) $old['quality'] : -1.0;
        $newQ = is_array($new) && isset($new['quality']) ? (float) $new['quality'] : -1.0;
        if ($newQ > $oldQ) {
            $this->db->prepare('UPDATE design_records SET score_json = ?, spikes = ?, eval_ms = ?, held = ?, quality = ? WHERE id = ?')
                ->execute([(string) $scoreRow['score_json'], (int) ($scoreRow['spikes'] ?? 0), (int) ($scoreRow['eval_ms'] ?? 0), $this->heldValue((string) $scoreRow['score_json']), $newQ, (string) $first['id']]);
        }
    }

    private function noteConfirmer(string $designId, string $workerId, int $n, string $at): void
    {
        $up = $this->db->prepare('UPDATE design_confirmations SET n = n + ?, last_at = ? WHERE design_id = ? AND worker_id = ?');
        $up->execute([$n, $at, $designId, $workerId]);
        if ($up->rowCount() > 0) {
            return;
        }
        try {
            $this->db->prepare('INSERT INTO design_confirmations (design_id, worker_id, n, first_at, last_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([$designId, $workerId, $n, $at, $at]);
        } catch (PDOException $e) {
            $up->execute([$n, $at, $designId, $workerId]);
        }
    }

    /**
     * One-time (and repeatable) merge for records stored before canonical hashes: fills design_hash, then marks every
     * later copy of a design as duplicate_of the first one (lowest seq) and counts it as a confirmation. No row is
     * deleted. Also fills jobs.seed from the job spec. Runs from bin/upgrade.php.
     */
    public function mergeDuplicateDesigns(int $budgetSeconds = 900): array
    {
        $stop = microtime(true) + max(5, $budgetSeconds);
        $out = ['genomes' => 0, 'records' => 0, 'groups' => 0, 'marked' => 0, 'canonicalOnly' => 0, 'jobSeeds' => 0, 'finished' => false];
        $pick = $this->db->prepare('SELECT hash, genome_json FROM design_genomes WHERE design_hash IS NULL LIMIT 1000');
        $set = $this->db->prepare('UPDATE design_genomes SET design_hash = ? WHERE hash = ?');
        while (microtime(true) < $stop) {
            $pick->execute();
            $rows = $pick->fetchAll();
            if ($rows === []) {
                break;
            }
            $this->db->beginTransaction();
            foreach ($rows as $row) {
                $dh = self::designHash((string) $row['genome_json']);
                $set->execute([$dh !== null ? $dh : (string) $row['hash'], (string) $row['hash']]);
                $out['genomes']++;
            }
            $this->db->commit();
        }
        $out['records'] = $this->db->exec('UPDATE design_records SET design_hash = (SELECT g.design_hash FROM design_genomes g WHERE g.hash = design_records.genome_hash) WHERE design_hash IS NULL');
        $groups = $this->db->query('SELECT task_id, design_hash, COUNT(*) AS n, COUNT(DISTINCT genome_hash) AS g FROM design_records WHERE design_hash IS NOT NULL AND duplicate_of IS NULL GROUP BY task_id, design_hash HAVING COUNT(*) > 1')->fetchAll();
        $members = $this->db->prepare('SELECT id, worker_id, job_id, created_at, score_json, spikes, eval_ms FROM design_records WHERE task_id = ? AND design_hash = ? AND duplicate_of IS NULL ORDER BY seq ASC, created_at ASC, id ASC');
        $mark = $this->db->prepare('UPDATE design_records SET duplicate_of = ?, canon_key = NULL WHERE id = ?');
        $bump = $this->db->prepare('UPDATE design_records SET confirmations = confirmations + ? WHERE id = ?');
        foreach ($groups as $group) {
            if (microtime(true) >= $stop) {
                return $out;
            }
            $members->execute([(string) $group['task_id'], (string) $group['design_hash']]);
            $rows = $members->fetchAll();
            if (count($rows) < 2) {
                continue;
            }
            $first = array_shift($rows);
            $this->db->beginTransaction();
            $counted = 0;
            $by = [];
            $best = $first;
            foreach ($rows as $row) {
                $mark->execute([(string) $first['id'], (string) $row['id']]);
                $out['marked']++;
                $rq = json_decode((string) $row['score_json'], true);
                $bq = json_decode((string) $best['score_json'], true);
                if ((is_array($rq) ? (float) ($rq['quality'] ?? -1) : -1.0) > (is_array($bq) ? (float) ($bq['quality'] ?? -1) : -1.0)) {
                    $best = $row;
                }
                if ((string) ($row['job_id'] ?? '') !== '' && (string) $row['job_id'] === (string) ($first['job_id'] ?? '')) {
                    continue; // a retried upload of the same job, not a confirmation
                }
                $counted++;
                $w = (string) $row['worker_id'];
                if (!isset($by[$w])) {
                    $by[$w] = [0, (string) $row['created_at']];
                }
                $by[$w][0]++;
                $by[$w][1] = (string) $row['created_at'];
            }
            if ($counted > 0) {
                $bump->execute([$counted, (string) $first['id']]);
            }
            if ($best !== $first) {
                $this->keepBetterScore($first, ['score_json' => $best['score_json'], 'spikes' => $best['spikes'], 'eval_ms' => $best['eval_ms']]);
            }
            foreach ($by as $w => $info) {
                $this->noteConfirmer((string) $first['id'], (string) $w, (int) $info[0], (string) $info[1]);
            }
            $this->db->commit();
            $out['groups']++;
            if ((int) $group['g'] > 1) {
                $out['canonicalOnly']++;
            }
        }
        $jobs = $this->db->prepare('SELECT id, spec_json FROM jobs WHERE seed IS NULL LIMIT 1000');
        $setSeed = $this->db->prepare('UPDATE jobs SET seed = ? WHERE id = ?');
        while (microtime(true) < $stop) {
            $jobs->execute();
            $rows = $jobs->fetchAll();
            if ($rows === []) {
                break;
            }
            $this->db->beginTransaction();
            foreach ($rows as $row) {
                $spec = json_decode((string) $row['spec_json'], true);
                $setSeed->execute([is_array($spec) && isset($spec['seed']) ? (int) $spec['seed'] : 0, (string) $row['id']]);
                $out['jobSeeds']++;
            }
            $this->db->commit();
        }
        $out['finished'] = microtime(true) < $stop;
        return $out;
    }

    public function ingestSummary(array $worker, array $summary): void
    {
        $taskId = (string) ($summary['taskId'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{1,64}$/', $taskId)) {
            throw new InvalidArgumentException('Unknown task.');
        }
        $engine = substr((string) ($summary['engineVersion'] ?? ''), 0, 32);
        if ($this->retiredDesign(['engineVersion' => $engine])) {
            throw new InvalidArgumentException('Design upload from designer version spikefoundry-designer-1 or spikefoundry-designer-2 is not accepted.');
        }
        if ($engine === '') {
            $engine = 'spikefoundry-designer-3';
        }
        $evals = (int) ($summary['evals'] ?? 0);
        if ($evals < 1 || $evals > 50000000) {
            throw new InvalidArgumentException('Summary evaluation count is out of range.');
        }
        $curve = isset($summary['curve']) && is_array($summary['curve']) ? array_slice($summary['curve'], 0, 120) : [];
        $points = [];
        foreach ($curve as $point) {
            if (!is_array($point)) {
                continue;
            }
            $points[] = [
                'n' => max(0, (int) ($point['n'] ?? 0)),
                'held' => (float) ($point['held'] ?? 0),
                'train' => (float) ($point['train'] ?? 0),
                'bestHeld' => (float) ($point['bestHeld'] ?? 0),
                'bestTrain' => (float) ($point['bestTrain'] ?? 0),
            ];
        }
        $histIn = isset($summary['histogram']) && is_array($summary['histogram']) ? array_slice($summary['histogram'], 0, 16) : [];
        $hist = [];
        foreach ($histIn as $bin) {
            $hist[] = max(0, (int) $bin);
        }
        $jobId = (string) ($summary['jobId'] ?? '');
        if ($jobId !== '' && !preg_match('/^[a-z0-9._-]{2,64}$/', $jobId)) {
            throw new InvalidArgumentException('Bad job id.');
        }
        $id = substr(hash('sha256', $worker['id'] . '|' . $jobId . '|' . $taskId), 0, 32);
        $have = $this->db->prepare('SELECT id FROM design_summaries WHERE id = ?');
        $have->execute([$id]);
        if ($have->fetch()) {
            return;
        }
        $this->db->prepare('INSERT INTO design_summaries (id, job_id, task_id, worker_id, engine_version, evals, designer_evals, random_evals, eval_ms, best_held, best_train, designer_mean, random_mean, histogram_json, curve_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([
                $id,
                $jobId !== '' ? $jobId : null,
                $taskId,
                $worker['id'],
                $engine,
                $evals,
                max(0, (int) ($summary['designerEvals'] ?? 0)),
                max(0, (int) ($summary['randomEvals'] ?? 0)),
                max(0, (int) ($summary['evalMs'] ?? 0)),
                (float) ($summary['bestHeld'] ?? 0),
                (float) ($summary['bestTrain'] ?? 0),
                (float) ($summary['designerMean'] ?? 0),
                (float) ($summary['randomMean'] ?? 0),
                json_encode($hist),
                json_encode($points),
                $this->now(),
            ]);
        $this->applyTaskPolicy('spikefoundry', $taskId);
    }

    public function topDesigns(string $taskId, int $limit = 10): array
    {
        if (!preg_match('/^[a-z0-9._-]{1,64}$/', $taskId)) {
            throw new InvalidArgumentException('Unknown task.');
        }
        if ($limit < 1) {
            $limit = 10;
        }
        if ($limit > 50) {
            $limit = 50;
        }
        $st = $this->db->prepare('SELECT id, genome_hash, design_hash, task_id, task_version, score_json, neurons, synapses, spikes, eval_ms, worker_id, seed, created_at, confirmations FROM design_records WHERE task_id = ? AND duplicate_of IS NULL AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY seq DESC LIMIT 400');
        $unscored = $this->db->prepare('SELECT 1 FROM design_records WHERE task_id = ? AND quality IS NULL LIMIT 1');
        $unscored->execute([$taskId]);
        if (!$unscored->fetch()) {
            /* Every row has its quality column: the best designs straight from the index. */
            $st = $this->db->prepare('SELECT id, genome_hash, design_hash, task_id, task_version, score_json, neurons, synapses, spikes, eval_ms, worker_id, seed, created_at, confirmations FROM design_records WHERE task_id = ? AND duplicate_of IS NULL AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY quality DESC, seq ASC LIMIT 400');
        }
        $st->execute([$taskId]);
        $best = [];
        foreach ($st->fetchAll() as $row) {
            $score = json_decode((string) $row['score_json'], true);
            $quality = is_array($score) && isset($score['quality']) ? (float) $score['quality'] : -1;
            $hash = (string) ($row['design_hash'] ?? '') !== '' ? (string) $row['design_hash'] : (string) $row['genome_hash'];
            if (!isset($best[$hash]) || $quality > $best[$hash]['quality']) {
                $row['quality'] = $quality;
                $best[$hash] = $row;
            }
        }
        $rows = array_values($best);
        usort($rows, function ($a, $b) {
            if ($a['quality'] === $b['quality']) {
                return strcmp((string) $a['genome_hash'], (string) $b['genome_hash']);
            }
            return $a['quality'] < $b['quality'] ? 1 : -1;
        });
        return array_slice($rows, 0, $limit);
    }

    /* Everything the Discoveries page shows that is the same for every viewer, cached for
     * discoveries_cache_seconds (default 120; 0 turns the cache off). */
    public function discoveriesPayload(): array
    {
        $ttl = (int) ($this->config['discoveries_cache_seconds'] ?? 600);
        $build = function (): array {
            $items = $this->discoveries();
            $series = [];
            foreach ($items as $item) {
                if (isset($series[$item['task']])) {
                    continue;
                }
                $pts = [];
                foreach ($this->taskSeries($item['task'], 120) as $p) {
                    $pts[] = [round((float) $p['bestHeld'], 4), round((float) $p['held'], 4)];
                }
                $series[$item['task']] = $pts;
            }
            /* The credit board scans every record (a million on the live server) and changes slowly. */
            $board = $this->cached('board-v1', (int) ($this->config['board_cache_seconds'] ?? 3600), function (): array {
                return ['rows' => $this->leaderboard(12)];
            });
            return ['items' => $items, 'series' => $series, 'board' => $board['rows'] ?? []];
        };
        return $ttl > 0 ? $this->cached('discoveries-v3', $ttl, $build) : $build();
    }

    public function cached(string $key, int $ttl, callable $build): array
    {
        $now = strtotime($this->now());
        $st = $this->db->prepare('SELECT body, built_at, building_until FROM page_cache WHERE k = ?');
        $st->execute([$key]);
        $row = $st->fetch();
        $old = $row ? json_decode((string) $row['body'], true) : null;
        if (is_array($old) && $now - (int) $row['built_at'] < $ttl) {
            return $old;
        }
        /* Claim the rebuild; whoever loses serves the stale copy instead of running the same heavy queries. */
        if ($row) {
            try {
                $claim = $this->db->prepare('UPDATE page_cache SET building_until = ? WHERE k = ? AND building_until < ?');
                $claim->execute([$now + 300, $key, $now]);
                $claimed = $claim->rowCount() === 1;
            } catch (PDOException $e) {
                // Read-only database (the host refuses writes, e.g. over the size limit): keep pages up.
                return is_array($old) ? $old : $build();
            }
            if (!$claimed && is_array($old)) {
                return $old;
            }
            /* The winner also answers with the stale copy and rebuilds after its response is sent, so no
             * visitor waits for the rebuild (it ran ~35 s on a million records). */
            if (is_array($old) && PHP_SAPI !== 'cli') {
                register_shutdown_function(function () use ($key, $build) {
                    ignore_user_abort(true);
                    @set_time_limit(300);
                    if (function_exists('fastcgi_finish_request')) {
                        fastcgi_finish_request();
                    } elseif (function_exists('litespeed_finish_request')) {
                        litespeed_finish_request();
                    }
                    $this->storeCache($key, $build(), true);
                });
                return $old;
            }
        }
        $fresh = $build();
        $this->storeCache($key, $fresh, (bool) $row);
        return $fresh;
    }

    private function storeCache(string $key, array $value, bool $exists): void
    {
        $body = json_encode($value);
        if ($body === false) {
            return;
        }
        $now = strtotime($this->now());
        try {
            if ($exists) {
                $this->db->prepare('UPDATE page_cache SET body = ?, built_at = ?, building_until = 0 WHERE k = ?')->execute([$body, $now, $key]);
            } else {
                $this->db->prepare('INSERT INTO page_cache (k, body, built_at, building_until) VALUES (?, ?, ?, 0)')->execute([$key, $body, $now]);
            }
        } catch (PDOException $e) {
            // another request stored it first, or the database is read-only right now
        }
    }

    /* Outstanding discoveries for the split view: the top N designs of each task on each
     * quality measure (held-out, train, efficiency, margin over random), after a floor that
     * drops silent or weak designs, newest curriculum level first, best held-out first inside
     * a level. A design that leads more than one measure is shown once, with badges. */
    public function discoveries(?int $perMeasure = null): array
    {
        $n = $perMeasure === null ? $this->discoveriesTopN() : max(1, min(50, $perMeasure));
        $tasks = [];
        foreach ($this->db->query("SELECT DISTINCT task_id FROM design_records WHERE engine_version NOT IN ('spikefoundry-designer-1', 'spikefoundry-designer-2')")->fetchAll() as $row) {
            $tasks[] = (string) $row['task_id'];
        }
        $order = self::CURRICULUM;
        $levelOf = function (string $task) use ($order): int {
            $at = array_search($task, $order, true);
            return $at === false ? count($order) : (int) $at;
        };
        usort($tasks, function ($a, $b) use ($levelOf) {
            $la = $levelOf($a);
            $lb = $levelOf($b);
            return $la === $lb ? strcmp($a, $b) : ($la < $lb ? 1 : -1);
        });
        $names = [];
        foreach ($this->db->query('SELECT id, name, public_credit FROM workers')->fetchAll() as $w) {
            $names[(string) $w['id']] = $this->creditName($w);
        }
        $out = [];
        foreach ($tasks as $task) {
            if (!preg_match('/^[a-z0-9._-]{1,64}$/', $task)) {
                continue;
            }
            $random = $this->taskRandomMean($task);
            $groups = [];
            foreach ($this->taskDiscoveryRows($task) as $row) {
                $score = json_decode((string) $row['score_json'], true);
                if (!is_array($score)) {
                    $score = [];
                }
                $quality = is_array($score) && isset($score['quality']) ? (float) $score['quality'] : (float) ($row['quality'] ?? -1);
                $sig = sprintf('%.4f|%.4f|%.4f|%d|%d|%d', $quality, (float) ($score['train'] ?? 0), (float) ($score['accuracy'] ?? 0), (int) $row['neurons'], (int) $row['synapses'], (int) $row['spikes']);
                if (!isset($groups[$sig])) {
                    $groups[$sig] = ['row' => $row, 'variants' => 0, 'confirmations' => 0];
                } else {
                    $groups[$sig]['variants']++;
                    if (strcmp((string) $row['created_at'], (string) $groups[$sig]['row']['created_at']) < 0) {
                        $groups[$sig]['row'] = $row;
                    }
                }
                $groups[$sig]['confirmations'] += (int) ($row['confirmations'] ?? 0);
            }
            $reps = [];
            foreach ($groups as $group) {
                $reps[] = ['group' => $group, 'row' => $group['row'], 'm' => $this->designMeasureValues($group['row'])];
            }
            $floorPass = [];
            $bestHeld = null;
            foreach ($reps as $i => $rep) {
                if ($this->designPassesKeepFloor($rep['m'], $random)) {
                    $floorPass[] = $i;
                    if ($bestHeld === null || $rep['m']['held'] > $bestHeld) {
                        $bestHeld = $rep['m']['held'];
                    }
                }
            }
            $eligible = [];
            foreach ($floorPass as $i) {
                if ($this->designPassesShowcaseFloor($reps[$i]['m'], $random, $bestHeld)) {
                    $eligible[] = $i;
                }
            }
            $picked = [];
            $take = function (array $indices, callable $cmp, string $badge) use ($n, &$picked): void {
                usort($indices, $cmp);
                foreach (array_slice($indices, 0, $n) as $i) {
                    if (!isset($picked[$i])) {
                        $picked[$i] = [];
                    }
                    $picked[$i][] = $badge;
                }
            };
            $byHeld = function ($a, $b) use ($reps) {
                $ha = $reps[$a]['m']['held'];
                $hb = $reps[$b]['m']['held'];
                if ($ha === $hb) {
                    return strcmp((string) $reps[$a]['row']['genome_hash'], (string) $reps[$b]['row']['genome_hash']);
                }
                return $ha < $hb ? 1 : -1;
            };
            $byTrain = function ($a, $b) use ($reps) {
                $ta = $reps[$a]['m']['train'];
                $tb = $reps[$b]['m']['train'];
                if ($ta === $tb) {
                    $ha = $reps[$a]['m']['held'];
                    $hb = $reps[$b]['m']['held'];
                    if ($ha === $hb) {
                        return strcmp((string) $reps[$a]['row']['genome_hash'], (string) $reps[$b]['row']['genome_hash']);
                    }
                    return $ha < $hb ? 1 : -1;
                }
                return $ta < $tb ? 1 : -1;
            };
            $byEff = function ($a, $b) use ($reps) {
                $sa = $reps[$a]['m']['size'];
                $sb = $reps[$b]['m']['size'];
                if ($sa === $sb) {
                    $ha = $reps[$a]['m']['held'];
                    $hb = $reps[$b]['m']['held'];
                    if ($ha === $hb) {
                        return strcmp((string) $reps[$a]['row']['genome_hash'], (string) $reps[$b]['row']['genome_hash']);
                    }
                    return $ha < $hb ? 1 : -1;
                }
                return $sa < $sb ? -1 : 1;
            };
            $take($eligible, $byHeld, 'held-out');
            $take($eligible, $byTrain, 'train');
            $take($eligible, $byEff, 'efficiency');
            if ($random !== null) {
                $take($eligible, $byHeld, 'margin');
            }
            $order = array_keys($picked);
            usort($order, $byHeld);
            foreach ($order as $rank => $i) {
                $row = $reps[$i]['row'];
                $group = $reps[$i]['group'];
                $m = $reps[$i]['m'];
                $score = json_decode((string) $row['score_json'], true);
                if (!is_array($score)) {
                    $score = [];
                }
                $genome = $this->designGenome((string) $row['genome_hash']);
                $out[] = [
                    'id' => (string) $row['id'],
                    'hash' => (string) $row['genome_hash'],
                    'task' => $task,
                    'level' => $levelOf($task) + 1,
                    'rank' => $rank + 1,
                    'quality' => round((float) ($score['quality'] ?? $m['quality']), 4),
                    'held' => round($m['held'], 4),
                    'train' => isset($score['train']) ? round((float) $score['train'], 4) : null,
                    'accuracy' => isset($score['accuracy']) ? round((float) $score['accuracy'], 4) : null,
                    'margin' => $random === null ? null : round($m['held'] - $random, 4),
                    'badges' => $picked[$i],
                    'neurons' => (int) $row['neurons'],
                    'synapses' => (int) $row['synapses'],
                    'spikes' => (int) $row['spikes'],
                    'evalMs' => (int) $row['eval_ms'],
                    'when' => (string) $row['created_at'],
                    'worker' => (string) $row['worker_id'],
                    'finder' => $names[(string) $row['worker_id']] ?? 'Anonymous',
                    'public' => $genome && (int) ($genome['is_public'] ?? 0) === 1,
                    'variants' => (int) $group['variants'],
                    'confirmations' => (int) $group['confirmations'],
                    'confirmedBy' => $this->confirmersOf((string) $row['id'], (string) $row['worker_id'], $names),
                ];
            }
        }
        return $out;
    }

    /** First-find rows a task can showcase: the stronger scores, plus compact designs that actually fired. */
    private function taskDiscoveryRows(string $taskId): array
    {
        $cols = 'id, genome_hash, design_hash, task_id, task_version, score_json, neurons, synapses, spikes, eval_ms, worker_id, seed, created_at, confirmations, quality';
        $where = 'task_id = ? AND duplicate_of IS NULL AND spikes > 0 AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\')';
        $unscored = $this->db->prepare('SELECT 1 FROM design_records WHERE task_id = ? AND quality IS NULL LIMIT 1');
        $unscored->execute([$taskId]);
        $order = $unscored->fetch() ? 'seq DESC' : 'quality DESC, seq ASC';
        $st = $this->db->prepare("SELECT $cols FROM design_records WHERE $where ORDER BY $order LIMIT 2000");
        $st->execute([$taskId]);
        $byId = [];
        foreach ($st->fetchAll() as $row) {
            $byId[(string) $row['id']] = $row;
        }
        $small = $this->db->prepare("SELECT $cols FROM design_records WHERE $where ORDER BY (neurons + synapses) ASC, seq ASC LIMIT 400");
        $small->execute([$taskId]);
        foreach ($small->fetchAll() as $row) {
            $byId[(string) $row['id']] = $row;
        }
        return array_values($byId);
    }

    private function confirmersOf(string $designId, string $finderId, array $names): array
    {
        $st = $this->db->prepare('SELECT worker_id FROM design_confirmations WHERE design_id = ? ORDER BY first_at ASC LIMIT 20');
        $st->execute([$designId]);
        $out = [];
        foreach ($st->fetchAll() as $row) {
            $w = (string) $row['worker_id'];
            if ($w === $finderId) {
                continue;
            }
            $name = $names[$w] ?? 'Anonymous';
            $out[$name] = true;
        }
        return array_keys($out);
    }

    /* A genome is shown to everyone once the owner marks it public, when it is on the
     * Discoveries list (the public showcase), to the owner, and to the people whose
     * computer found it. Otherwise the viewer only sees its size. */
    public function genomeVisibleTo(string $hash, bool $owner, array $workerIds): bool
    {
        $row = $this->designGenome($hash);
        if (!$row) {
            return false;
        }
        if ($owner || (int) ($row['is_public'] ?? 0) === 1 || $this->hashIsListedDiscovery($hash)) {
            return true;
        }
        $ids = [];
        foreach ($workerIds as $id) {
            if (preg_match('/^[a-f0-9]{8,32}$/', (string) $id)) {
                $ids[] = (string) $id;
            }
        }
        if ($ids === []) {
            return false;
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $st = $this->db->prepare('SELECT 1 FROM design_records WHERE genome_hash = ? AND worker_id IN (' . $marks . ') LIMIT 1');
        $st->execute(array_merge([$hash], $ids));
        return (bool) $st->fetch();
    }

    /* Hashes of designs currently on the Discoveries page (cached with the page payload). */
    public function hashIsListedDiscovery(string $hash): bool
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $hash)) {
            return false;
        }
        foreach (($this->discoveriesPayload()['items'] ?? []) as $item) {
            if (is_array($item) && (string) ($item['hash'] ?? '') === $hash) {
                return true;
            }
        }
        return false;
    }

    public function designGenome(string $hash): ?array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $hash)) {
            return null;
        }
        $st = $this->db->prepare('SELECT hash, genome_json, version, is_public FROM design_genomes WHERE hash = ?');
        $st->execute([$hash]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function designExportRows(string $taskId, int $limit = 2000): array
    {
        if ($limit < 1) {
            $limit = 1;
        }
        if ($limit > 2000) {
            $limit = 2000;
        }
        if ($taskId === '' || $taskId === 'all') {
            $st = $this->db->prepare('SELECT r.task_id, r.task_version, r.genome_hash, r.score_json, r.neurons, r.synapses, r.spikes, r.eval_ms, r.engine_version, r.worker_id, r.seed, r.job_id, g.genome_json FROM design_records r JOIN design_genomes g ON g.hash = r.genome_hash WHERE r.engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY r.created_at DESC LIMIT ' . (int) $limit);
            $st->execute();
            return $st->fetchAll();
        }
        if (!preg_match('/^[a-z0-9._-]{1,64}$/', $taskId)) {
            throw new InvalidArgumentException('Unknown task.');
        }
        $st = $this->db->prepare('SELECT r.task_id, r.task_version, r.genome_hash, r.score_json, r.neurons, r.synapses, r.spikes, r.eval_ms, r.engine_version, r.worker_id, r.seed, r.job_id, g.genome_json FROM design_records r JOIN design_genomes g ON g.hash = r.genome_hash WHERE r.task_id = ? AND r.engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY r.created_at DESC LIMIT ' . (int) $limit);
        $st->execute([$taskId]);
        return $st->fetchAll();
    }

    public function designsByWorker(string $workerId): int
    {
        $saved = $this->workerTotalsRow($workerId);
        if ($saved !== null) {
            return $saved['n'];
        }
        $st = $this->db->prepare('SELECT COUNT(*) FROM design_records WHERE worker_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\')');
        $st->execute([$workerId]);
        return (int) $st->fetchColumn();
    }

    private function workerTotalsRow(string $workerId): ?array
    {
        $st = $this->db->prepare('SELECT n, ms, tasks, genomes FROM worker_totals WHERE worker_id = ?');
        $st->execute([$workerId]);
        $row = $st->fetch();
        if (!$row) {
            return null;
        }
        $tasks = [];
        $list = json_decode((string) $row['tasks'], true);
        foreach (is_array($list) ? $list : [] as $t) {
            $tasks[(string) $t] = true;
        }
        return ['tasks' => $tasks, 'n' => (int) $row['n'], 'ms' => (int) $row['ms'], 'genomes' => (int) ($row['genomes'] ?? 0)];
    }

    private function scanWorkerTotals(string $workerId): array
    {
        $prior = $this->db->prepare('SELECT DISTINCT task_id FROM design_records WHERE worker_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\')');
        $prior->execute([$workerId]);
        $tasks = [];
        foreach ($prior->fetchAll() as $row) {
            $tasks[(string) $row['task_id']] = true;
        }
        $sum = $this->db->prepare('SELECT COUNT(*) AS n, COALESCE(SUM(eval_ms), 0) AS ms, COUNT(DISTINCT genome_hash) AS g FROM design_records WHERE worker_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\')');
        $sum->execute([$workerId]);
        $tot = $sum->fetch() ?: ['n' => 0, 'ms' => 0, 'g' => 0];
        return ['tasks' => $tasks, 'n' => (int) $tot['n'], 'ms' => (int) $tot['ms'], 'genomes' => (int) $tot['g']];
    }

    public function seedJobFromDesigns(string $templateId, string $taskId, int $count, int $seed): string
    {
        $top = $this->topDesigns($taskId, $count);
        $hashes = [];
        foreach ($top as $row) {
            $hashes[] = (string) $row['genome_hash'];
        }
        if ($hashes === []) {
            throw new InvalidArgumentException('No saved designs for that task yet.');
        }
        return $this->createJob($templateId, 'Seeded from top ' . $taskId . ' designs', 0.8, $seed, ['seedGenomes' => $hashes, 'taskId' => $taskId]);
    }

    public function saveModel(array $worker, string $jobId, string $body, array $metrics): string
    {
        if (strlen($body) < 2 || strlen($body) > 60000) {
            throw new InvalidArgumentException('Model checkpoint is the wrong size.');
        }
        if (!preg_match('/^[a-z0-9._-]{2,64}$/', $jobId)) {
            throw new InvalidArgumentException('Bad job id.');
        }
        $lease = $this->db->prepare('SELECT job_id FROM leases WHERE job_id = ? AND worker_id = ?');
        $lease->execute([$jobId, $worker['id']]);
        if (!$lease->fetch()) {
            throw new InvalidArgumentException('This computer does not hold that job.');
        }
        $decoded = json_decode($body, true);
        if (is_array($decoded) && (string) ($decoded['format'] ?? '') === 'spikefoundry-designer' && (string) ($decoded['designerVersion'] ?? '') !== 'spikefoundry-designer-3') {
            throw new InvalidArgumentException('That designer checkpoint is from a retired designer version.');
        }
        $id = substr(hash('sha256', $jobId . '|' . $worker['id'] . '|' . hash('sha256', $body)), 0, 32);
        $have = $this->db->prepare('SELECT id FROM model_checkpoints WHERE id = ?');
        $have->execute([$id]);
        if (!$have->fetch()) {
            $metricJson = json_encode([
                'spearman' => isset($metrics['spearman']) ? (float) $metrics['spearman'] : null,
                'heldOut' => isset($metrics['heldOut']) ? (int) $metrics['heldOut'] : 0,
            ]);
            $this->db->prepare('INSERT INTO model_checkpoints (id, label, body_json, metric_json, created_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([$id, 'designer', $body, $metricJson === false ? '{}' : $metricJson, $this->now()]);
        }
        return $id;
    }

    public function currentModel(): ?array
    {
        $row = $this->db->query('SELECT id, label, body_json, metric_json, created_at FROM model_checkpoints WHERE body_json NOT LIKE \'%spikefoundry-designer%\' OR body_json LIKE \'%spikefoundry-designer-3%\' ORDER BY created_at DESC LIMIT 1')->fetch();
        return $row ?: null;
    }

    public function creditName(array $worker): string
    {
        if ((int) ($worker['public_credit'] ?? 1) !== 1) {
            return 'Anonymous';
        }
        $name = trim((string) ($worker['name'] ?? ''));
        return $name !== '' ? $name : 'Anonymous';
    }

    public function setCredit(string $participantId, bool $shown): void
    {
        $this->db->prepare('UPDATE workers SET public_credit = ? WHERE participant_id = ?')->execute([$shown ? 1 : 0, $participantId]);
    }

    public function setGenomePublic(string $hash, bool $shown): void
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $hash)) {
            throw new InvalidArgumentException('Unknown genome.');
        }
        $this->db->prepare('UPDATE design_genomes SET is_public = ? WHERE hash = ?')->execute([$shown ? 1 : 0, $hash]);
    }

    private function addEvent(string $workerId, string $taskId, string $kind, string $detail, string $bucket): void
    {
        $id = substr(hash('sha256', $workerId . '|' . $kind . '|' . $taskId . '|' . $bucket), 0, 32);
        $have = $this->db->prepare('SELECT id FROM design_events WHERE id = ?');
        $have->execute([$id]);
        if ($have->fetch()) {
            return;
        }
        $this->db->prepare('INSERT INTO design_events (id, worker_id, task_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$id, $workerId, $taskId, $kind, substr($detail, 0, 200), $this->now()]);
    }

    private function heldValue(string $json): float
    {
        $score = json_decode($json, true);
        if (!is_array($score)) {
            return 0.0;
        }
        if (isset($score['heldOut'])) {
            return (float) $score['heldOut'];
        }
        return isset($score['quality']) ? (float) $score['quality'] : 0.0;
    }

    private function noteHighlight(array $worker, string $taskId, float $held, string $genomeHash, int $evalMs = 0, bool $full = true): void
    {
        $wid = (string) $worker['id'];
        if (!isset($this->highlightMemo[$wid])) {
            $saved = $this->workerTotalsRow($wid);
            if ($saved !== null) {
                // Saved totals do not include the record just stored; it is added below.
                $this->highlightMemo[$wid] = $saved + ['first' => false];
            } else {
                // First upload since the totals table: count once (includes the record just stored) and save.
                $tot = $this->scanWorkerTotals($wid);
                $this->highlightMemo[$wid] = $tot + ['first' => true];
                try {
                    $this->db->prepare('INSERT INTO worker_totals (worker_id, n, ms, tasks, genomes) VALUES (?, ?, ?, ?, ?)')
                        ->execute([$wid, $tot['n'], $tot['ms'], json_encode(array_keys($tot['tasks'])), $tot['genomes']]);
                } catch (PDOException $e) {
                    // another upload from this computer saved it first
                }
            }
        }
        $memo =& $this->highlightMemo[$wid];
        if (!$memo['first'] || !$full) {
            /* A kept record counts as a new genome unless this computer already has a row with it; a counted-only
             * record has no row to compare with and counts as new. */
            $newGenome = 1;
            if ($full) {
                $g = $this->db->prepare('SELECT COUNT(*) FROM (SELECT 1 FROM design_records WHERE genome_hash = ? AND worker_id = ? LIMIT 2) t');
                $g->execute([$genomeHash, $wid]);
                $newGenome = (int) $g->fetchColumn() > 1 ? 0 : 1;
            }
            $memo['n'] += 1;
            $memo['ms'] += $evalMs;
            $this->db->prepare('UPDATE worker_totals SET n = n + 1, ms = ms + ?, genomes = genomes + ? WHERE worker_id = ?')->execute([$evalMs, $newGenome, $wid]);
        }
        $memo['first'] = false;
        $priorTasks = $memo['tasks'];
        if (!isset($memo['tasks'][$taskId])) {
            $memo['tasks'][$taskId] = true;
            $this->db->prepare('UPDATE worker_totals SET tasks = ? WHERE worker_id = ?')->execute([json_encode(array_keys($memo['tasks'])), $wid]);
        }
        if (!$full) {
            $this->noteMilestones($worker, $taskId, (int) $memo['n'], (int) $memo['ms']);
            unset($memo);
            return;
        }
        $others = $this->db->prepare('SELECT score_json, worker_id, genome_hash FROM design_records WHERE task_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY seq DESC LIMIT 200');
        $others->execute([$taskId]);
        $bestOther = -1.0;
        $personal = -1.0;
        $better = 0;
        $seen = [];
        foreach ($others->fetchAll() as $row) {
            if ((string) $row['genome_hash'] === $genomeHash && (string) $row['worker_id'] === (string) $worker['id']) {
                continue;
            }
            $value = $this->heldValue((string) $row['score_json']);
            if ((string) $row['worker_id'] === (string) $worker['id'] && $value > $personal) {
                $personal = $value;
            }
            if ($value > $bestOther) {
                $bestOther = $value;
            }
            if (!isset($seen[$row['genome_hash']])) {
                $seen[$row['genome_hash']] = $value;
            }
        }
        foreach ($seen as $value) {
            if ($value > $held) {
                $better++;
            }
        }
        if ($held > $bestOther) {
            $this->addEvent((string) $worker['id'], $taskId, 'best', 'New best design on ' . $taskId, 'best');
        }
        if ($held > $personal) {
            $this->addEvent((string) $worker['id'], $taskId, 'personal', 'Personal best on ' . $taskId, (string) round($held, 3));
        }
        if ($better < 10) {
            $this->addEvent((string) $worker['id'], $taskId, 'top10', 'Top 10 on ' . $taskId, $genomeHash);
        }
        $order = ['coincidence', 'sequence', 'vote3', 'routing', 'composed', 'context3', 'nested', 'scenario-vision', 'scenario-sequence', 'scenario-graph', 'scenario-control', 'digits', 'mnist', 'cart-pole'];
        $here = array_search($taskId, $order, true);
        if ($here !== false && $here > 0) {
            $max = -1;
            foreach (array_keys($priorTasks) as $priorTask) {
                $at = array_search((string) $priorTask, $order, true);
                if ($at !== false && (string) $priorTask !== $taskId && $at > $max) {
                    $max = (int) $at;
                }
            }
            if ($max >= 0 && $here > $max) {
                $this->addEvent((string) $worker['id'], $taskId, 'promoted', 'A design moved up to ' . $taskId, 'level');
            }
        }
        $tot = ['n' => $memo['n'], 'ms' => $memo['ms']];
        unset($memo);
        $this->noteMilestones($worker, $taskId, (int) $tot['n'], (int) $tot['ms']);
    }

    private function noteMilestones(array $worker, string $taskId, int $n, int $ms): void
    {
        foreach ([10, 100, 1000] as $mark) {
            if ($n >= $mark) {
                $this->addEvent((string) $worker['id'], $taskId, 'evals', $mark . ' evaluations', (string) $mark);
            }
        }
        $hours = $ms / 3600000;
        foreach ([1, 5, 10] as $mark) {
            if ($hours + 1e-9 >= $mark) {
                $this->addEvent((string) $worker['id'], $taskId, 'hours', $mark . ' hours donated', (string) $mark);
            }
        }
    }

    public function highlights(array $workerIds): array
    {
        $ids = [];
        foreach ($workerIds as $id) {
            if (preg_match('/^[a-f0-9]{8,32}$/', (string) $id)) {
                $ids[] = (string) $id;
            }
        }
        if ($ids === []) {
            return [];
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $st = $this->db->prepare('SELECT kind, task_id, detail, created_at FROM design_events WHERE worker_id IN (' . $marks . ') ORDER BY created_at DESC, id DESC LIMIT 12');
        $st->execute($ids);
        return $st->fetchAll();
    }

    /* ---- Library size ---------------------------------------------------------------------
     * Every evaluated design used to get a row and a genome: about a million of each in a day, 3.3 GB, and the host
     * made the database read-only at its 3 GB limit. Now a task keeps the top K designs on each quality measure
     * (held-out, train, efficiency, margin over random; design_keep_per_measure, default 200). Everything else is
     * counted (worker_totals, task_totals) and dropped. Discoveries shows only the top N per measure that pass a
     * quality floor (must fire on a positive label, beat the task's random control when one exists, and reach a
     * fraction of the task's best eligible held-out score). An hourly prune trims what fell out of the kept set;
     * over db_soft_limit_mb it prunes harder, rebuilds the tables, and the owner console shows a warning. */
    private $keepMemo = [];
    private $randomMeanMemo = [];

    public function discoveriesTopN(): int
    {
        $n = (int) ($this->config['discoveries_top_n'] ?? 8);
        return max(1, min(20, $n));
    }

    public function keepPerMeasure(): int
    {
        $k = (int) ($this->config['design_keep_per_measure'] ?? $this->config['design_keep_per_task'] ?? 200);
        return max(20, min(10000, $k));
    }

    public function keepPerTask(): int
    {
        return $this->keepPerMeasure();
    }

    public function discoveriesFloorRatio(): float
    {
        $r = (float) ($this->config['discoveries_floor_ratio'] ?? 0.5);
        if ($r < 0.05) {
            return 0.05;
        }
        if ($r > 1.0) {
            return 1.0;
        }
        return $r;
    }

    /** Task-level random-arm mean held-out, or null when there are not enough random checks. */
    private function taskRandomMean(string $taskId): ?float
    {
        if (!isset($this->randomMeanMemo[$taskId])) {
            $st = $this->db->prepare('SELECT COALESCE(SUM(random_evals), 0) AS r, COALESCE(SUM(random_mean * random_evals), 0) AS rs FROM design_summaries WHERE task_id = ?');
            $st->execute([$taskId]);
            $row = $st->fetch();
            $r = $row ? (int) $row['r'] : 0;
            $this->randomMeanMemo[$taskId] = $r < 1 ? false : ((float) $row['rs']) / $r;
        }
        $v = $this->randomMeanMemo[$taskId];
        return $v === false ? null : $v;
    }

    /** Scores used for the floor and the four keep/showcase measures. */
    private function designMeasureValues(array $row, ?array $score = null): array
    {
        if ($score === null) {
            $score = json_decode((string) ($row['score_json'] ?? ''), true);
            if (!is_array($score)) {
                $score = [];
            }
        }
        $held = isset($score['heldOut']) ? (float) $score['heldOut'] : (isset($score['quality']) ? (float) $score['quality'] : (isset($row['held']) && $row['held'] !== null ? (float) $row['held'] : 0.0));
        $train = isset($score['train']) ? (float) $score['train'] : $held;
        $quality = isset($score['quality']) ? (float) $score['quality'] : $held;
        $neurons = (int) ($row['neurons'] ?? 0);
        $synapses = (int) ($row['synapses'] ?? 0);
        $spikes = (int) ($row['spikes'] ?? 0);
        return [
            'held' => $held,
            'train' => $train,
            'quality' => $quality,
            'neurons' => $neurons,
            'synapses' => $synapses,
            'spikes' => $spikes,
            'recall' => isset($score['recall']) ? (float) $score['recall'] : null,
            'f1' => isset($score['f1']) ? (float) $score['f1'] : null,
            'size' => $neurons + $synapses,
        ];
    }

    /** True when the design actually responds to a positive label (or, without recall/f1, when it spiked). */
    private function designFires(array $m): bool
    {
        if ($m['spikes'] <= 0) {
            return false;
        }
        if ($m['recall'] !== null) {
            return $m['recall'] > 0;
        }
        if ($m['f1'] !== null) {
            return $m['f1'] > 0;
        }
        return true;
    }

    private function designBeatsRandom(array $m, ?float $randomMean): bool
    {
        if ($randomMean === null) {
            return true;
        }
        return $m['held'] > $randomMean;
    }

    /** Storage floor: the design fires and beats the random control when one exists. */
    private function designPassesKeepFloor(array $m, ?float $randomMean): bool
    {
        return $this->designFires($m) && $this->designBeatsRandom($m, $randomMean);
    }

    /** Showcase floor: the keep floor, plus a fraction of the task's best eligible held-out score. */
    private function designPassesShowcaseFloor(array $m, ?float $randomMean, ?float $bestEligibleHeld): bool
    {
        if (!$this->designPassesKeepFloor($m, $randomMean)) {
            return false;
        }
        if ($bestEligibleHeld === null || $bestEligibleHeld <= 0) {
            return true;
        }
        return $m['held'] + 1e-12 >= $this->discoveriesFloorRatio() * $bestEligibleHeld;
    }

    private function measureThresholds(string $taskId): array
    {
        if (!isset($this->keepMemo[$taskId])) {
            $this->keepMemo[$taskId] = $this->computeMeasureThresholds($taskId);
        }
        return $this->keepMemo[$taskId];
    }

    private function computeMeasureThresholds(string $taskId): array
    {
        $k = $this->keepPerMeasure();
        $random = $this->taskRandomMean($taskId);
        $helds = [];
        $trains = [];
        $margins = [];
        $eff = [];
        $st = $this->db->prepare('SELECT score_json, neurons, synapses, spikes, held FROM design_records WHERE task_id = ? AND duplicate_of IS NULL AND spikes > 0');
        $st->execute([$taskId]);
        while (($row = $st->fetch()) !== false) {
            $m = $this->designMeasureValues($row);
            if (!$this->designFires($m)) {
                continue;
            }
            $helds[] = $m['held'];
            $trains[] = $m['train'];
            $margins[] = $m['held'] - ($random ?? 0.0);
            if ($this->designPassesKeepFloor($m, $random)) {
                $eff[] = [$m['size'], $m['held']];
            }
        }
        return $this->packThresholds($k, $random, $helds, $trains, $margins, $eff);
    }

    private function packThresholds(int $k, ?float $random, array $helds, array $trains, array $margins, array $eff): array
    {
        rsort($helds, SORT_NUMERIC);
        rsort($trains, SORT_NUMERIC);
        rsort($margins, SORT_NUMERIC);
        usort($eff, function ($a, $b) {
            if ($a[0] === $b[0]) {
                return $a[1] < $b[1] ? 1 : ($a[1] > $b[1] ? -1 : 0);
            }
            return $a[0] < $b[0] ? -1 : 1;
        });
        $helds = array_slice($helds, 0, $k);
        $trains = array_slice($trains, 0, $k);
        $margins = array_slice($margins, 0, $k);
        $eff = array_slice($eff, 0, $k);
        $effWorstSize = null;
        $effMinHeldAtWorst = null;
        if ($eff !== []) {
            $worst = $eff[count($eff) - 1];
            $effWorstSize = $worst[0];
            $effMinHeldAtWorst = $worst[1];
        }
        return [
            'k' => $k,
            'random' => $random,
            'helds' => $helds,
            'trains' => $trains,
            'margins' => $margins,
            'eff' => $eff,
            'nHeld' => count($helds),
            'nTrain' => count($trains),
            'nMargin' => count($margins),
            'nEff' => count($eff),
            'minHeld' => $helds !== [] ? $helds[count($helds) - 1] : null,
            'minTrain' => $trains !== [] ? $trains[count($trains) - 1] : null,
            'minMargin' => $margins !== [] ? $margins[count($margins) - 1] : null,
            'effWorstSize' => $effWorstSize,
            'effMinHeldAtWorst' => $effMinHeldAtWorst,
        ];
    }

    /** True when a design would rank in some measure's kept set (or that set still has room). */
    public function designFits(string $taskId, float $held, array $metrics = []): bool
    {
        $m = [
            'held' => $held,
            'train' => isset($metrics['train']) ? (float) $metrics['train'] : $held,
            'quality' => isset($metrics['quality']) ? (float) $metrics['quality'] : $held,
            'neurons' => (int) ($metrics['neurons'] ?? 0),
            'synapses' => (int) ($metrics['synapses'] ?? 0),
            'spikes' => (int) ($metrics['spikes'] ?? 0),
            'recall' => isset($metrics['recall']) ? (float) $metrics['recall'] : null,
            'f1' => isset($metrics['f1']) ? (float) $metrics['f1'] : null,
            'size' => (int) ($metrics['neurons'] ?? 0) + (int) ($metrics['synapses'] ?? 0),
        ];
        if ($metrics !== [] && !$this->designFires($m)) {
            return false;
        }
        $th = $this->measureThresholds($taskId);
        $k = $th['k'];
        if ($th['nHeld'] < $k || $held > (float) $th['minHeld']) {
            return true;
        }
        if ($th['nTrain'] < $k || $m['train'] > (float) $th['minTrain']) {
            return true;
        }
        $margin = $held - ($th['random'] ?? 0.0);
        if ($th['nMargin'] < $k || $margin > (float) $th['minMargin']) {
            return true;
        }
        if ($this->designPassesKeepFloor($m, $th['random'])) {
            if ($th['nEff'] < $k) {
                return true;
            }
            if ($m['size'] < (int) $th['effWorstSize']) {
                return true;
            }
            if ($m['size'] === (int) $th['effWorstSize'] && $held > (float) $th['effMinHeldAtWorst']) {
                return true;
            }
        }
        return false;
    }

    private function rememberKept(string $taskId, array $m): void
    {
        if (!isset($m['size'])) {
            $m['size'] = (int) ($m['neurons'] ?? 0) + (int) ($m['synapses'] ?? 0);
        }
        if (!isset($m['held'])) {
            $m['held'] = 0.0;
        }
        if (!isset($m['train'])) {
            $m['train'] = $m['held'];
        }
        if (!isset($m['recall'])) {
            $m['recall'] = null;
        }
        if (!isset($m['f1'])) {
            $m['f1'] = null;
        }
        if (!isset($m['spikes'])) {
            $m['spikes'] = 0;
        }
        $th = $this->measureThresholds($taskId);
        $th['helds'][] = (float) $m['held'];
        $th['trains'][] = (float) $m['train'];
        $th['margins'][] = (float) $m['held'] - ($th['random'] ?? 0.0);
        if ($this->designPassesKeepFloor($m, $th['random'])) {
            $th['eff'][] = [(int) $m['size'], (float) $m['held']];
        }
        $this->keepMemo[$taskId] = $this->packThresholds($th['k'], $th['random'], $th['helds'], $th['trains'], $th['margins'], $th['eff']);
    }

    private function bumpTaskTotals(string $taskId, int $seen, int $kept, int $ms): void
    {
        $up = $this->db->prepare('UPDATE task_totals SET seen = seen + ?, kept = kept + ?, ms = ms + ? WHERE task_id = ?');
        $up->execute([$seen, $kept, $ms, $taskId]);
        if ($up->rowCount() > 0) {
            return;
        }
        try {
            $this->db->prepare('INSERT INTO task_totals (task_id, seen, kept, ms) VALUES (?, ?, ?, ?)')->execute([$taskId, $seen, $kept, $ms]);
        } catch (PDOException $e) {
            $up->execute([$seen, $kept, $ms, $taskId]);
        }
    }

    public function taskTotals(): array
    {
        $out = [];
        foreach ($this->db->query('SELECT task_id, seen, kept, ms FROM task_totals ORDER BY task_id')->fetchAll() as $row) {
            $out[(string) $row['task_id']] = ['seen' => (int) $row['seen'], 'kept' => (int) $row['kept'], 'ms' => (int) $row['ms']];
        }
        return $out;
    }

    /* Credit totals computed from the full table before a prune; applied once writes work (see compact-designs.php). */
    private function seedWorkerTotalsFromFile(): void
    {
        $file = (string) ($this->config['totals_seed'] ?? (dirname(__DIR__) . '/worker-totals-seed.json'));
        if (!is_file($file)) {
            return;
        }
        $rows = json_decode((string) @file_get_contents($file), true);
        if (!is_array($rows)) {
            return;
        }
        $have = $this->db->prepare('SELECT n FROM worker_totals WHERE worker_id = ?');
        foreach ($rows as $wid => $t) {
            if (!is_array($t) || !preg_match('/^[a-f0-9]{8,32}$/', (string) $wid)) {
                continue;
            }
            $have->execute([(string) $wid]);
            if ($have->fetch()) {
                $this->db->prepare('UPDATE worker_totals SET genomes = ? WHERE worker_id = ? AND genomes = 0')->execute([(int) ($t['genomes'] ?? 0), (string) $wid]);
            } else {
                $this->db->prepare('INSERT INTO worker_totals (worker_id, n, ms, tasks, genomes) VALUES (?, ?, ?, ?, ?)')
                    ->execute([(string) $wid, (int) ($t['n'] ?? 0), (int) ($t['ms'] ?? 0), json_encode(array_values((array) ($t['tasks'] ?? []))), (int) ($t['genomes'] ?? 0)]);
            }
        }
        @rename($file, $file . '.applied');
    }

    /** Per-computer credit from the rows themselves (before a prune). */
    public function workerTotalsFromRows(): array
    {
        $out = [];
        $st = $this->db->query('SELECT worker_id, task_id, COUNT(*) AS n, COALESCE(SUM(eval_ms), 0) AS ms FROM design_records WHERE engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') GROUP BY worker_id, task_id');
        foreach ($st->fetchAll() as $row) {
            $w = (string) $row['worker_id'];
            if (!isset($out[$w])) {
                $out[$w] = ['n' => 0, 'ms' => 0, 'tasks' => [], 'genomes' => 0];
            }
            $out[$w]['n'] += (int) $row['n'];
            $out[$w]['ms'] += (int) $row['ms'];
            $out[$w]['tasks'][] = (string) $row['task_id'];
        }
        $st = $this->db->query('SELECT worker_id, COUNT(DISTINCT genome_hash) AS g FROM design_records WHERE engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') GROUP BY worker_id');
        foreach ($st->fetchAll() as $row) {
            if (isset($out[(string) $row['worker_id']])) {
                $out[(string) $row['worker_id']]['genomes'] = (int) $row['g'];
            }
        }
        return $out;
    }

    /**
     * Deletes design records outside the keep policy, then their genomes and confirmations, old checkpoints and old
     * upload receipts. Kept for every task:
     *   - the best $keep first finds on each quality measure (held-out, train, efficiency, margin over random);
     *   - every design that has confirmations or later copies pointing at it, those later copies (duplicate_of set;
     *     uploads stopped making them when confirmations came in), and every design Discoveries shows now.
     * Recency windows (latest-per-task / latest-per-worker) are no longer kept: the score-history chart reads
     * design_summaries, and the designer / surrogate fall back to model_checkpoints (the last 50 are still kept).
     * $latestPerTask and $latestPerWorker are accepted so older callers still run, but they are ignored.
     */
    public function pruneDesigns(?int $keep = null, int $latestPerTask = 0, int $latestPerWorker = 0, int $budgetSeconds = 600): array
    {
        $keep = $keep ?? $this->keepPerMeasure();
        $stop = microtime(true) + max(5, $budgetSeconds);
        $out = ['keep' => $keep, 'records' => 0, 'genomes' => 0, 'confirmations' => 0, 'checkpoints' => 0, 'kept' => 0, 'tasks' => [], 'finished' => false];
        $protected = [];
        foreach ($this->db->query('SELECT DISTINCT design_id FROM design_confirmations')->fetchAll() as $r) {
            $protected[(string) $r['design_id']] = true;
        }
        foreach ($this->db->query('SELECT DISTINCT duplicate_of FROM design_records WHERE duplicate_of IS NOT NULL')->fetchAll() as $r) {
            $protected[(string) $r['duplicate_of']] = true;
        }
        foreach ($this->db->query('SELECT id FROM design_records WHERE confirmations > 0')->fetchAll() as $r) {
            $protected[(string) $r['id']] = true;
        }
        $shown = $this->db->prepare('SELECT body FROM page_cache WHERE k = ?');
        foreach (['discoveries-v3', 'discoveries-v2', 'discoveries-v1'] as $cacheKey) {
            $shown->execute([$cacheKey]);
            $cached = $shown->fetch();
            $body = $cached ? json_decode((string) $cached['body'], true) : null;
            foreach (is_array($body) && isset($body['items']) && is_array($body['items']) ? $body['items'] : [] as $item) {
                if (is_array($item) && isset($item['id'])) {
                    $protected[(string) $item['id']] = true;
                }
            }
        }
        $tasks = [];
        foreach ($this->db->query('SELECT DISTINCT task_id FROM design_records')->fetchAll() as $r) {
            $tasks[] = (string) $r['task_id'];
        }
        $mysql = ($this->config['driver'] ?? '') !== 'sqlite';
        foreach ($tasks as $task) {
            $random = $this->taskRandomMean($task);
            $topHeld = new SplMinHeap();
            $topTrain = new SplMinHeap();
            $topMargin = new SplMinHeap();
            $topEff = new SplMinHeap();
            $dups = [];
            $sql = 'SELECT id, score_json, seq, worker_id, duplicate_of, neurons, synapses, spikes FROM design_records WHERE task_id = ?';
            $st = $mysql && defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY') ? $this->db->prepare($sql, [PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false]) : $this->db->prepare($sql);
            $st->execute([$task]);
            $total = 0;
            while (($row = $st->fetch(PDO::FETCH_NUM)) !== false) {
                $total++;
                if ($row[4] !== null && $row[4] !== '') {
                    $dups[] = (string) $row[0];
                    continue;
                }
                $id = (string) $row[0];
                $m = $this->designMeasureValues([
                    'score_json' => $row[1],
                    'neurons' => $row[5],
                    'synapses' => $row[6],
                    'spikes' => $row[7],
                ]);
                if (!$this->designFires($m)) {
                    continue;
                }
                $seq = (int) $row[2];
                self::boundedPush($topHeld, [$m['held'], $seq, $id], $keep);
                self::boundedPush($topTrain, [$m['train'], $seq, $id], $keep);
                self::boundedPush($topMargin, [$m['held'] - ($random ?? 0.0), $seq, $id], $keep);
                if ($this->designPassesKeepFloor($m, $random)) {
                    self::boundedPush($topEff, [-$m['size'], $m['held'], $seq, $id], $keep);
                }
            }
            $st->closeCursor();
            $keepIds = $protected;
            foreach ($dups as $id) {
                $keepIds[$id] = true;
            }
            foreach ([$topHeld, $topTrain, $topMargin, $topEff] as $heap) {
                foreach ($heap as $item) {
                    $keepIds[(string) $item[count($item) - 1]] = true;
                }
            }
            unset($topHeld, $topTrain, $topMargin, $topEff);
            $range = $this->db->prepare('SELECT MIN(seq) AS lo, MAX(seq) AS hi FROM design_records WHERE task_id = ?');
            $range->execute([$task]);
            $r = $range->fetch();
            $lo = (int) ($r['lo'] ?? 0);
            $hi = (int) ($r['hi'] ?? -1);
            $pick = $this->db->prepare('SELECT id FROM design_records WHERE task_id = ? AND seq >= ? AND seq < ?');
            $deleted = 0;
            for ($from = $lo; $from <= $hi; $from += 5000) {
                if (microtime(true) >= $stop) {
                    $out['tasks'][$task] = ['rows' => $total, 'deleted' => $deleted];
                    return $out;
                }
                $pick->execute([$task, $from, $from + 5000]);
                $gone = [];
                foreach ($pick->fetchAll(PDO::FETCH_COLUMN) as $id) {
                    if (!isset($keepIds[(string) $id])) {
                        $gone[] = (string) $id;
                    }
                }
                foreach (array_chunk($gone, 500) as $chunk) {
                    $del = $this->db->prepare('DELETE FROM design_records WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
                    $del->execute($chunk);
                    $deleted += $del->rowCount();
                }
            }
            $out['records'] += $deleted;
            $out['kept'] += $total - $deleted;
            $out['tasks'][$task] = ['rows' => $total, 'deleted' => $deleted];
            unset($this->keepMemo[$task]);
        }
        foreach (str_split('0123456789abcdef') as $prefix) {
            if (microtime(true) >= $stop) {
                return $out;
            }
            $out['genomes'] += $this->db->exec("DELETE FROM design_genomes WHERE hash LIKE '" . $prefix . "%' AND is_public = 0 AND NOT EXISTS (SELECT 1 FROM design_records r WHERE r.genome_hash = design_genomes.hash)");
        }
        $out['confirmations'] = $this->db->exec('DELETE FROM design_confirmations WHERE NOT EXISTS (SELECT 1 FROM design_records r WHERE r.id = design_confirmations.design_id)');
        $old = $this->db->query('SELECT id FROM model_checkpoints ORDER BY created_at DESC, id DESC')->fetchAll(PDO::FETCH_COLUMN);
        foreach (array_chunk(array_slice($old, 50), 200) as $chunk) {
            $del = $this->db->prepare('DELETE FROM model_checkpoints WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
            $del->execute($chunk);
            $out['checkpoints'] += $del->rowCount();
        }
        try {
            $this->db->prepare('DELETE FROM upload_batches WHERE created_at < ?')->execute([gmdate('c', strtotime($this->now()) - 3 * 86400)]);
        } catch (PDOException $e) {
            // not created yet (the schema step had not run)
        }
        $out['finished'] = true;
        return $out;
    }

    /** Fills the held and quality columns of rows stored before they existed. */
    public function backfillScores(int $limit = 100000): int
    {
        $pick = $this->db->prepare('SELECT id, score_json FROM design_records WHERE held IS NULL OR quality IS NULL LIMIT ' . max(1, $limit));
        $pick->execute();
        $rows = $pick->fetchAll();
        if ($rows === []) {
            return 0;
        }
        $set = $this->db->prepare('UPDATE design_records SET held = ?, quality = ? WHERE id = ?');
        $this->db->beginTransaction();
        foreach ($rows as $row) {
            $score = json_decode((string) $row['score_json'], true);
            $set->execute([$this->heldValue((string) $row['score_json']), is_array($score) && isset($score['quality']) ? (float) $score['quality'] : -1.0, (string) $row['id']]);
        }
        $this->db->commit();
        return count($rows);
    }

    private static function boundedPush(SplMinHeap $heap, array $item, int $limit): void
    {
        if ($limit < 1) {
            return;
        }
        if ($heap->count() < $limit) {
            $heap->insert($item);
        } elseif ($item > $heap->top()) {
            $heap->extract();
            $heap->insert($item);
        }
    }

    /** Database size in MB (data and indexes), or null when unknown. */
    public function dbSizeMb(): ?float
    {
        try {
            if (($this->config['driver'] ?? '') === 'sqlite') {
                $pages = (int) $this->db->query('PRAGMA page_count')->fetchColumn();
                $size = (int) $this->db->query('PRAGMA page_size')->fetchColumn();
                return round($pages * $size / 1048576, 1);
            }
            $v = $this->db->query('SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn();
            return $v === null || $v === false ? null : round(((float) $v) / 1048576, 1);
        } catch (PDOException $e) {
            return null;
        }
    }

    /** Rebuilds the design tables so deleted rows give their space back (InnoDB files do not shrink on DELETE). */
    public function compactTables(): void
    {
        if (($this->config['driver'] ?? '') === 'sqlite') {
            $this->db->exec('VACUUM');
            return;
        }
        foreach (['design_records', 'design_genomes', 'design_confirmations', 'model_checkpoints'] as $table) {
            $this->db->exec('ALTER TABLE `' . $table . '` FORCE');
        }
    }

    /** Runs the prune at most every prune_every_seconds (default 3600; 0 = never on its own). */
    public function maybePrune(bool $force = false): ?array
    {
        $every = (int) ($this->config['prune_every_seconds'] ?? 3600);
        if (!$force && $every <= 0) {
            return null;
        }
        $state = $this->db->query("SELECT ran_at FROM supply_state WHERE id = 'prune'")->fetch();
        if (!$force && $state && (strtotime($this->now()) - strtotime((string) $state['ran_at'])) < $every) {
            return null;
        }
        $claim = $state
            ? $this->db->prepare("UPDATE supply_state SET ran_at = ?, note = 'running' WHERE id = 'prune' AND ran_at = ?")
            : $this->db->prepare("INSERT INTO supply_state (id, ran_at, note) VALUES ('prune', ?, 'running')");
        try {
            $claim->execute($state ? [$this->now(), (string) $state['ran_at']] : [$this->now()]);
        } catch (PDOException $e) {
            return null;
        }
        if ($claim->rowCount() !== 1) {
            return null;
        }
        if (PHP_SAPI !== 'cli') {
            register_shutdown_function(function () {
                ignore_user_abort(true);
                @set_time_limit(600);
                if (function_exists('fastcgi_finish_request')) {
                    fastcgi_finish_request();
                } elseif (function_exists('litespeed_finish_request')) {
                    litespeed_finish_request();
                }
                try {
                    $this->pruneNow();
                } catch (Throwable $e) {
                    // next upload after the interval tries again
                }
            });
            return ['scheduled' => true];
        }
        return $this->pruneNow();
    }

    public function pruneNow(): array
    {
        $soft = (float) ($this->config['db_soft_limit_mb'] ?? 2048);
        $this->backfillScores();
        $before = $this->dbSizeMb();
        $hard = $before !== null && $before > $soft;
        $keep = $this->keepPerMeasure();
        $res = $this->pruneDesigns($hard ? max(20, intdiv($keep, 4)) : $keep, 0, 0, 300);
        if ($hard) {
            try {
                $this->compactTables();
            } catch (PDOException $e) {
                $res['compactError'] = substr($e->getMessage(), 0, 120);
            }
        }
        $after = $this->dbSizeMb();
        $note = ['before' => $before, 'mb' => $after, 'soft' => $soft, 'hard' => $hard, 'keep' => $res['keep'], 'deleted' => $res['records'], 'genomes' => $res['genomes'], 'at' => $this->now()];
        $this->db->prepare('REPLACE INTO supply_state (id, ran_at, note) VALUES (?, ?, ?)')->execute(['storage', $this->now(), (string) json_encode($note)]);
        $this->db->prepare("UPDATE supply_state SET note = 'done' WHERE id = 'prune'")->execute();
        return $res + ['mbBefore' => $before, 'mbAfter' => $after, 'hard' => $hard];
    }

    /** Last measured size for the owner console; warn is set when it was over db_soft_limit_mb. */
    public function storageStatus(): array
    {
        $soft = (float) ($this->config['db_soft_limit_mb'] ?? 2048);
        $row = $this->db->query("SELECT note FROM supply_state WHERE id = 'storage'")->fetch();
        $note = $row ? json_decode((string) $row['note'], true) : null;
        $mb = is_array($note) && isset($note['mb']) ? (float) $note['mb'] : null;
        $before = is_array($note) && isset($note['before']) ? (float) $note['before'] : null;
        return [
            'mb' => $mb,
            'soft' => $soft,
            'keep' => $this->keepPerTask(),
            'at' => is_array($note) ? (string) ($note['at'] ?? '') : '',
            'warn' => ($mb !== null && $mb > $soft) || ($before !== null && $before > $soft),
        ];
    }

    public function leaderboard(int $limit = 20): array
    {
        if ($limit < 1) {
            $limit = 20;
        }
        if ($limit > 50) {
            $limit = 50;
        }
        /* Credit comes from the running totals: the library keeps only each task's best designs, so counting rows
         * would undercount. A computer with records but no totals row yet gets one from its rows first. */
        $have = [];
        foreach ($this->db->query('SELECT worker_id FROM worker_totals')->fetchAll() as $row) {
            $have[(string) $row['worker_id']] = true;
        }
        foreach ($this->db->query('SELECT DISTINCT worker_id FROM design_records')->fetchAll() as $row) {
            $wid = (string) $row['worker_id'];
            if (isset($have[$wid])) {
                continue;
            }
            $tot = $this->scanWorkerTotals($wid);
            try {
                $this->db->prepare('INSERT INTO worker_totals (worker_id, n, ms, tasks, genomes) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$wid, $tot['n'], $tot['ms'], json_encode(array_keys($tot['tasks'])), $tot['genomes']]);
            } catch (PDOException $e) {
                // read-only right now, or another request saved it first
            }
        }
        $rows = $this->db->query('SELECT w.participant_id, w.name, w.public_credit, SUM(t.n) AS records, SUM(t.genomes) AS genomes, COALESCE(SUM(t.ms), 0) AS ms FROM worker_totals t JOIN workers w ON w.id = t.worker_id WHERE t.n > 0 GROUP BY w.participant_id, w.name, w.public_credit ORDER BY ms DESC, records DESC LIMIT ' . (int) $limit)->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'name' => (int) $row['public_credit'] === 1 ? (string) $row['name'] : 'Anonymous',
                'records' => (int) $row['records'],
                'genomes' => (int) $row['genomes'],
                'hours' => ((int) $row['ms']) / 3600000,
            ];
        }
        return $out;
    }

    public function projectAutoOn(array $project): bool
    {
        return (int) ($project['auto_jobs'] ?? 0) === 1;
    }

    public function saveSupply(string $projectId, bool $on, int $lowWater, int $cap, int $evals, int $seconds = 180, int $keepTop = 50, int $keepRandom = 500): void
    {
        if ($lowWater < 0 || $lowWater > 100 || $cap < 1 || $cap > 100 || $evals < 0 || $evals > 250000 || $seconds < 1 || $seconds > 3600 || $keepTop < 1 || $keepTop > 200 || $keepRandom < 0 || $keepRandom > 2000) {
            throw new InvalidArgumentException('Supply settings are out of range.');
        }
        $this->db->prepare('UPDATE projects SET auto_jobs = ?, low_water = ?, queue_cap = ?, evals_per_job = ?, target_seconds = ?, keep_top = ?, keep_random = ? WHERE id = ?')
            ->execute([$on ? 1 : 0, $lowWater, $cap, $evals, $seconds, $keepTop, $keepRandom, $projectId]);
    }

    public function replenishJobs(): int
    {
        $gap = (int) ($this->config['supply_seconds'] ?? 15);
        if ($gap < 1) {
            $gap = 15;
        }
        $state = $this->db->query("SELECT ran_at FROM supply_state WHERE id = 'global'")->fetch();
        if ($state && (strtotime($this->now()) - strtotime((string) $state['ran_at'])) < $gap) {
            return 0;
        }
        $this->db->prepare('REPLACE INTO supply_state (id, ran_at, note) VALUES (?, ?, ?)')->execute(['global', $this->now(), 'running']);
        if ($this->inverseGalleryEnabled()) {
            $this->trimInverseDiscoveries();
        }
        $globalCap = (int) ($this->config['supply_cap'] ?? 24);
        if ($globalCap < 1) {
            $globalCap = 24;
        }
        $this->moveQueuedOffPausedTasks();
        $queuedAll = $this->claimableQueued();
        if ($queuedAll >= $globalCap) {
            return 0;
        }
        /* Low water 0 means one waiting job per busy slot of an online computer. A
         * computer that runs four jobs at once counts as four. */
        $online = 0;
        $seen = $this->db->query('SELECT last_seen, revoked, paused, runtime_json FROM workers')->fetchAll();
        foreach ($seen as $row) {
            if ((int) $row['revoked'] === 1 || empty($row['last_seen']) || (int) $row['paused'] === 1) {
                continue;
            }
            if ((strtotime($this->now()) - strtotime((string) $row['last_seen'])) <= 180) {
                $rt = json_decode((string) ($row['runtime_json'] ?? ''), true);
                $slots = is_array($rt) && isset($rt['slots']) ? (int) $rt['slots'] : 1;
                $online += max(1, min(16, $slots));
            }
        }
        $made = 0;
        $topMemo = [];
        $projects = $this->db->query('SELECT * FROM projects WHERE enabled = 1 ORDER BY priority DESC, id ASC')->fetchAll();
        foreach ($projects as $project) {
            $inverse = $project['id'] === 'spikefoundry' && $this->inverseGalleryEnabled();
            if (!$inverse && $this->legacySearchPaused((string) $project['id'], ['mode' => 'propose'])) {
                continue;
            }
            if (!$this->projectAutoOn($project)) {
                continue;
            }
            $template = $inverse ? 'sf-inverse-experiment' : $this->supplyTemplate((string) $project['id']);
            if ($template === '') {
                continue;
            }
            $low = (int) $project['low_water'] > 0 ? (int) $project['low_water'] : max(1, $online);
            $cap = (int) $project['queue_cap'] > 0 ? (int) $project['queue_cap'] : 8;
            $queued = $this->claimableQueued((string) $project['id']);
            if ($inverse && !empty($this->config['inverse_composition']) && $queuedAll < $globalCap
                && !$this->db->query("SELECT 1 FROM jobs WHERE template_id = 'sf-inverse-experiment'
                    AND status IN ('queued','leased') AND spec_json LIKE '%inverseComposition%' LIMIT 1")->fetchColumn()) {
                $seed = $this->freshSeed();
                $sequence = !empty($this->config['inverse_sequence']) && $seed % 2 === 0;
                $this->createJob($template, $sequence ? 'Two-stream sequence pilot' : 'Three-hidden-neuron pilot', 0.7, $seed,
                    ['inverseGallery' => true, 'inverseComposition' => true, 'inverseSequence' => $sequence]);
                $queued++;
                $queuedAll++;
                $made++;
            }
            $guard = 0;
            while ($queued < $low && $queued < $cap && $queuedAll < $globalCap && $guard < 20) {
                $task = $inverse ? 'inverse design' : $this->supplyTask((string) $project['id']);
                if ($task === '') {
                    break;
                }
                // Random and checked against every earlier job: the old time-based seed repeated when two requests
                // refilled the queue in the same second, so two computers ran the very same search.
                $seed = $this->freshSeed();
                $evals = max(0, (int) ($project['evals_per_job'] ?? 0));
                $seconds = (int) ($project['target_seconds'] ?? 0) > 0 ? (int) $project['target_seconds'] : 180;
                $keepTop = (int) ($project['keep_top'] ?? 0) > 0 ? (int) $project['keep_top'] : 50;
                $keepRandom = array_key_exists('keep_random', $project) ? (int) $project['keep_random'] : 500;
                $extra = ['taskId' => $task, 'evals' => $evals, 'targetSeconds' => $seconds, 'keepTop' => $keepTop, 'keepRandom' => $keepRandom];
                if ($inverse) {
                    $extra = ['inverseGallery' => true];
                } elseif ((string) $project['id'] !== 'bugbrain' && (string) ($project['family'] ?? '') !== 'bugbrain') {
                    $extra['mode'] = 'propose';
                    try {
                        if (!isset($topMemo[$task])) {
                            $topMemo[$task] = $this->topDesigns($task, 3);
                        }
                        $top = $topMemo[$task];
                        $hashes = [];
                        foreach ($top as $row) {
                            $hashes[] = (string) $row['genome_hash'];
                        }
                        if ($hashes !== []) {
                            $extra['seedGenomes'] = $hashes;
                        }
                        $extra['knownHashes'] = $this->knownDesignHashes($task, 100);
                    } catch (InvalidArgumentException $e) {
                        $hashes = [];
                    }
                }
                $this->createJob($template, 'Auto ' . $task, 0.6, $seed, $extra);
                $queued++;
                $queuedAll++;
                $made++;
                $guard++;
            }
            if ($made > 0) {
                $note = $made . ' auto jobs at ' . $this->now();
                $this->db->prepare('UPDATE projects SET auto_created = auto_created + ?, auto_note = ? WHERE id = ?')->execute([$made, substr($note, 0, 200), $project['id']]);
                $made = 0;
            }
        }
        return $queuedAll;
    }

    private function legacySearchPaused(string $projectId, $spec): bool
    {
        return $projectId === 'spikefoundry' && !empty($this->config['pause_legacy_spikefoundry_search'])
            && in_array($spec['mode'] ?? '', ['propose', 'train-model'], true);
    }

    private function supplyTemplate(string $projectId): string
    {
        $prefer = ($projectId === 'bugbrain') ? ['bb-order3'] : ['sf-propose', 'sf-vision'];
        foreach ($prefer as $id) {
            $st = $this->db->prepare('SELECT id FROM templates WHERE id = ? AND project_id = ?');
            $st->execute([$id, $projectId]);
            if ($st->fetch()) {
                return $id;
            }
        }
        $st = $this->db->prepare('SELECT id FROM templates WHERE project_id = ? ORDER BY id ASC LIMIT 1');
        $st->execute([$projectId]);
        $row = $st->fetch();
        return $row ? (string) $row['id'] : '';
    }

    /* Tasks the SpikeFoundry designer can score, easiest first. A task outside this list
     * would fall back to coincidence inside the worker, so supply and auto-advance stop here. */
    public const CURRICULUM = ['coincidence', 'sequence', 'vote3', 'routing', 'composed', 'context3', 'nested', 'scenario-vision', 'scenario-sequence', 'scenario-graph', 'scenario-control'];

    private function supplyTask(string $projectId): string
    {
        $order = self::CURRICULUM;
        if ($projectId === 'bugbrain') {
            return 'order3';
        }
        foreach ($order as $task) {
            $policy = $this->taskPolicy($projectId, $task);
            if ((int) $policy['paused'] === 1) {
                $next = (string) $policy['advanced_to'];
                if ($next !== '' && !$this->taskPaused($projectId, $next)) {
                    return $next;
                }
                continue;
            }
            return $task;
        }
        return '';
    }

    public function defaultTaskPolicy(): array
    {
        return ['stall_delta' => 0.005, 'stall_evals' => 3000, 'stall_hours' => 6.0, 'stall_action' => 'flag', 'paused' => 0, 'pause_reason' => '', 'advanced_to' => '', 'auto_advance' => 1, 'solve_score' => 0.97, 'solve_jobs' => 3];
    }

    public function taskPolicy(string $projectId, string $taskId): array
    {
        $st = $this->db->prepare('SELECT * FROM task_policies WHERE project_id = ? AND task_id = ?');
        $st->execute([$projectId, $taskId]);
        $row = $st->fetch();
        $base = $this->defaultTaskPolicy();
        if (!$row) {
            $base['project_id'] = $projectId;
            $base['task_id'] = $taskId;
            return $base;
        }
        return [
            'project_id' => (string) $row['project_id'],
            'task_id' => (string) $row['task_id'],
            'stall_delta' => (float) $row['stall_delta'],
            'stall_evals' => (int) $row['stall_evals'],
            'stall_hours' => (float) $row['stall_hours'],
            'stall_action' => (string) $row['stall_action'],
            'paused' => (int) $row['paused'],
            'pause_reason' => (string) ($row['pause_reason'] ?? ''),
            'advanced_to' => (string) ($row['advanced_to'] ?? ''),
            'auto_advance' => isset($row['auto_advance']) ? (int) $row['auto_advance'] : 1,
            'solve_score' => isset($row['solve_score']) ? (float) $row['solve_score'] : 0.97,
            'solve_jobs' => isset($row['solve_jobs']) ? (int) $row['solve_jobs'] : 3,
        ];
    }

    public function saveTaskPolicy(string $projectId, string $taskId, float $delta, int $evals, float $hours, string $action, ?bool $autoAdvance = null, ?float $solveScore = null, ?int $solveJobs = null): void
    {
        if (!preg_match('/^[a-z0-9._-]{1,40}$/', $projectId) || !preg_match('/^[a-z0-9._-]{1,64}$/', $taskId)) {
            throw new InvalidArgumentException('Unknown project or task.');
        }
        if ($delta < 0 || $delta > 1) {
            throw new InvalidArgumentException('The improvement delta must be from 0 to 1.');
        }
        if ($evals < 2 || $evals > 100000) {
            throw new InvalidArgumentException('The evaluation window must be from 2 to 100000.');
        }
        if ($hours < 0 || $hours > 10000) {
            throw new InvalidArgumentException('The compute window must be from 0 to 10000 hours.');
        }
        if (!in_array($action, ['flag', 'pause', 'advance'], true)) {
            throw new InvalidArgumentException('Choose flag, pause, or advance.');
        }
        if ($solveScore !== null && ($solveScore < 0 || $solveScore > 1)) {
            throw new InvalidArgumentException('The solved score must be from 0 to 1.');
        }
        if ($solveJobs !== null && ($solveJobs < 1 || $solveJobs > 1000)) {
            throw new InvalidArgumentException('The solved job count must be from 1 to 1000.');
        }
        $current = $this->taskPolicy($projectId, $taskId);
        $current['stall_delta'] = $delta;
        $current['stall_evals'] = $evals;
        $current['stall_hours'] = $hours;
        $current['stall_action'] = $action;
        if ($autoAdvance !== null) {
            $current['auto_advance'] = $autoAdvance ? 1 : 0;
        }
        if ($solveScore !== null) {
            $current['solve_score'] = $solveScore;
        }
        if ($solveJobs !== null) {
            $current['solve_jobs'] = $solveJobs;
        }
        $this->writeTaskPolicy($projectId, $taskId, $current);
        $this->applyTaskPolicy($projectId, $taskId);
    }

    public function taskPaused(string $projectId, string $taskId): bool
    {
        return (int) $this->taskPolicy($projectId, $taskId)['paused'] === 1;
    }

    public function taskSeries(string $taskId, int $limit = 500): array
    {
        if ($limit < 1) {
            $limit = 1;
        }
        if ($limit > 500) {
            $limit = 500;
        }
        $fromSummary = $this->summarySeries($taskId, $limit);
        if ($fromSummary !== []) {
            return $fromSummary;
        }
        $st = $this->db->prepare('SELECT score_json, eval_ms, arm, created_at FROM design_records WHERE task_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY seq DESC LIMIT ' . (int) $limit);
        $st->execute([$taskId]);
        $rows = array_reverse($st->fetchAll());
        $bestHeld = 0.0;
        $bestTrain = 0.0;
        $hours = 0.0;
        $points = [];
        $n = 0;
        foreach ($rows as $row) {
            $n++;
            $score = json_decode((string) $row['score_json'], true);
            if (!is_array($score)) {
                $score = [];
            }
            $held = isset($score['heldOut']) ? (float) $score['heldOut'] : (isset($score['quality']) ? (float) $score['quality'] : 0.0);
            $train = isset($score['train']) ? (float) $score['train'] : $held;
            $hours += ((int) $row['eval_ms']) / 3600000;
            if ($held > $bestHeld) {
                $bestHeld = $held;
            }
            if ($train > $bestTrain) {
                $bestTrain = $train;
            }
            $points[] = [
                'n' => $n,
                'hours' => $hours,
                'bestHeld' => $bestHeld,
                'bestTrain' => $bestTrain,
                'held' => $held,
                'train' => $train,
                'arm' => (string) ($row['arm'] ?? 'designer'),
            ];
        }
        return $points;
    }

    private function summarySeries(string $taskId, int $limit): array
    {
        $st = $this->db->prepare('SELECT evals, eval_ms, best_held, best_train, curve_json FROM design_summaries WHERE task_id = ? ORDER BY created_at DESC LIMIT 40');
        $st->execute([$taskId]);
        $rows = array_reverse($st->fetchAll());
        if ($rows === []) {
            return [];
        }
        $points = [];
        $offset = 0;
        $hours = 0.0;
        $bestHeld = 0.0;
        $bestTrain = 0.0;
        foreach ($rows as $row) {
            $jobEvals = max(1, (int) $row['evals']);
            $jobHours = ((int) $row['eval_ms']) / 3600000;
            $curve = json_decode((string) $row['curve_json'], true);
            if (!is_array($curve) || $curve === []) {
                $curve = [['n' => $jobEvals, 'held' => (float) $row['best_held'], 'train' => (float) $row['best_train'], 'bestHeld' => (float) $row['best_held'], 'bestTrain' => (float) $row['best_train']]];
            }
            foreach ($curve as $point) {
                if (!is_array($point)) {
                    continue;
                }
                $local = max(1, min($jobEvals, (int) ($point['n'] ?? $jobEvals)));
                $held = isset($point['held']) ? (float) $point['held'] : (float) ($point['bestHeld'] ?? 0);
                $train = isset($point['train']) ? (float) $point['train'] : $held;
                $bestHeld = max($bestHeld, isset($point['bestHeld']) ? (float) $point['bestHeld'] : $held);
                $bestTrain = max($bestTrain, isset($point['bestTrain']) ? (float) $point['bestTrain'] : $train);
                $points[] = [
                    'n' => $offset + $local,
                    'hours' => $hours + $jobHours * ($local / $jobEvals),
                    'bestHeld' => $bestHeld,
                    'bestTrain' => $bestTrain,
                    'held' => $held,
                    'train' => $train,
                    'arm' => 'summary',
                ];
            }
            $offset += $jobEvals;
            $hours += $jobHours;
        }
        if (count($points) > $limit) {
            $thin = [];
            $last = count($points) - 1;
            for ($i = 0; $i < $limit; $i++) {
                $thin[] = $points[(int) round($i * $last / max(1, $limit - 1))];
            }
            $points = $thin;
        }
        return $points;
    }

    public function taskStatus(string $projectId, string $taskId): array
    {
        $policy = $this->taskPolicy($projectId, $taskId);
        $points = $this->taskSeries($taskId, max(20, (int) $policy['stall_evals']));
        $count = count($points);
        $status = 'Improving';
        if ($count >= 2) {
            $endN = (int) $points[$count - 1]['n'];
            $target = max(2, (int) $policy['stall_evals']);
            $startIdx = $count - 1;
            while ($startIdx > 0 && ($endN - (int) $points[$startIdx]['n'] + 1) < $target) {
                $startIdx--;
            }
            $slice = array_slice($points, $startIdx);
            $start = $slice[0];
            $end = $slice[count($slice) - 1];
            $base = $start['bestHeld'] > 0.01 ? $start['bestHeld'] : 0.01;
            $relative = ($end['bestHeld'] - $start['bestHeld']) / $base;
            $hours = $end['hours'] - $start['hours'];
            $span = (int) $end['n'] - (int) $start['n'] + 1;
            $full = $span >= (int) $policy['stall_evals'] && $hours + 1e-9 >= (float) $policy['stall_hours'];
            $half = (int) floor(count($slice) / 2);
            $first = array_slice($slice, 0, max(1, $half));
            $second = array_slice($slice, max(1, $half));
            $avg = function (array $rows, string $key): float {
                $sum = 0.0;
                foreach ($rows as $row) {
                    $sum += (float) $row[$key];
                }
                return $sum / max(1, count($rows));
            };
            $trainUp = $avg($second, 'train') > $avg($first, 'train') + 0.001;
            $heldFlat = $avg($second, 'held') <= $avg($first, 'held') + 1e-9;
            if ($trainUp && $heldFlat && count($slice) >= 4) {
                $status = 'Overfitting';
            } elseif ($full && $relative <= (float) $policy['stall_delta']) {
                $status = 'Stalled';
            } elseif ($relative <= (float) $policy['stall_delta']) {
                $status = 'Slowing';
            } else {
                $status = 'Improving';
            }
        }
        $health = $this->designerHealthForTask($taskId);
        return ['status' => $status, 'policy' => $policy, 'points' => $points, 'designer' => $health ?? $this->designerHealth($points)];
    }

    public function designerHealthForTask(string $taskId): ?array
    {
        $st = $this->db->prepare('SELECT COALESCE(SUM(designer_evals), 0) AS d, COALESCE(SUM(random_evals), 0) AS r, COALESCE(SUM(designer_mean * designer_evals), 0) AS ds, COALESCE(SUM(random_mean * random_evals), 0) AS rs FROM design_summaries WHERE task_id = ?');
        $st->execute([$taskId]);
        $row = $st->fetch();
        if (!$row || ((int) $row['d'] + (int) $row['r']) < 1) {
            return null;
        }
        if ((int) $row['r'] < 1 || (int) $row['d'] < 1) {
            return ['label' => 'not enough random checks yet', 'percent' => null];
        }
        $d = ((float) $row['ds']) / (int) $row['d'];
        $r = ((float) $row['rs']) / (int) $row['r'];
        $percent = ($d - $r) / ($r > 0.001 ? $r : 0.001) * 100;
        if ($d > $r) {
            return ['label' => 'designer beating random by ' . (string) (int) round($percent) . '%', 'percent' => $percent];
        }
        return ['label' => 'designer no longer helping', 'percent' => $percent];
    }

    public function designerHealth(array $points): array
    {
        $designer = [];
        $random = [];
        foreach ($points as $point) {
            if ($point['arm'] === 'random') {
                $random[] = (float) $point['held'];
            } else {
                $designer[] = (float) $point['held'];
            }
        }
        if (count($random) < 1 || count($designer) < 1) {
            return ['label' => 'not enough random checks yet', 'percent' => null];
        }
        $mean = function (array $rows): float {
            return array_sum($rows) / count($rows);
        };
        $d = $mean($designer);
        $r = $mean($random);
        $percent = ($d - $r) / ($r > 0.001 ? $r : 0.001) * 100;
        if ($d > $r) {
            return ['label' => 'designer beating random by ' . (string) (int) round($percent) . '%', 'percent' => $percent];
        }
        return ['label' => 'designer no longer helping', 'percent' => $percent];
    }

    public function applyTaskPolicy(string $projectId, string $taskId): array
    {
        $health = $this->taskStatus($projectId, $taskId);
        $policy = $health['policy'];
        $id = substr(hash('sha256', $projectId . '|' . $taskId), 0, 32);
        $paused = (int) $policy['paused'];
        $reason = (string) $policy['pause_reason'];
        $advanced = (string) $policy['advanced_to'];
        $solved = $this->taskSolved($health, $taskId);
        $wasPaused = $paused === 1;
        if ($solved['solved']) {
            $paused = 1;
            $reason = 'solved';
            $advanced = $solved['next'];
        } elseif ($reason === 'solved') {
            $paused = 0;
            $reason = '';
            $advanced = '';
        } elseif ($health['status'] === 'Stalled' && $policy['stall_action'] === 'pause') {
            $paused = 1;
            $reason = 'stall';
        } elseif ($health['status'] === 'Stalled' && $policy['stall_action'] === 'advance') {
            $paused = 1;
            $reason = 'stall';
            $advanced = $this->nextCurriculumTask($taskId);
        } elseif ($health['status'] === 'Improving' && $reason === 'stall') {
            $paused = 0;
            $reason = '';
        }
        $policy['paused'] = $paused;
        $policy['pause_reason'] = $reason;
        $policy['advanced_to'] = $advanced;
        $this->writeTaskPolicy($projectId, $taskId, $policy);
        if ($paused === 1 && $advanced !== '') {
            $moved = $this->retargetQueued($projectId, $taskId, $advanced);
            if (!$wasPaused) {
                $note = $taskId . ' ' . ($reason === 'solved' ? 'solved at held-out ' . sprintf('%.3f', $solved['best']) : 'stalled') . '; supply moved to ' . $advanced . ' at ' . $this->now() . ($moved > 0 ? '; ' . $moved . ' queued jobs retargeted' : '');
                $this->db->prepare('REPLACE INTO supply_state (id, ran_at, note) VALUES (?, ?, ?)')->execute([substr('advance-' . $taskId, 0, 64), $this->now(), substr($note, 0, 250)]);
            }
        }
        $health['policy'] = $this->taskPolicy($projectId, $taskId);
        $health['solved'] = $solved;
        return $health;
    }

    /* A task counts as solved when auto-advance is on, a harder task exists, the best
     * held-out score reached solve_score, the curve is Slowing or Stalled, and at least
     * solve_jobs job summaries back it. It does not wait for the full stall window. */
    public function taskSolved(array $health, string $taskId): array
    {
        $policy = $health['policy'];
        $points = $health['points'];
        $best = 0.0;
        foreach ($points as $point) {
            $best = max($best, (float) $point['bestHeld']);
        }
        $out = ['solved' => false, 'best' => $best, 'jobs' => 0, 'next' => ''];
        if ((int) $policy['auto_advance'] !== 1) {
            return $out;
        }
        $next = $this->nextCurriculumTask($taskId);
        if ($next === '' || $best + 1e-9 < (float) $policy['solve_score']) {
            return $out;
        }
        if (!in_array($health['status'], ['Slowing', 'Stalled'], true)) {
            return $out;
        }
        $st = $this->db->prepare('SELECT COUNT(*) FROM design_summaries WHERE task_id = ?');
        $st->execute([$taskId]);
        $jobs = (int) $st->fetchColumn();
        $out['jobs'] = $jobs;
        if ($jobs < max(1, (int) $policy['solve_jobs'])) {
            return $out;
        }
        $out['solved'] = true;
        $out['next'] = $next;
        return $out;
    }

    private function writeTaskPolicy(string $projectId, string $taskId, array $p): void
    {
        $id = substr(hash('sha256', $projectId . '|' . $taskId), 0, 32);
        $this->db->prepare('REPLACE INTO task_policies (id, project_id, task_id, stall_delta, stall_evals, stall_hours, stall_action, paused, pause_reason, advanced_to, auto_advance, solve_score, solve_jobs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $projectId, $taskId, (float) $p['stall_delta'], (int) $p['stall_evals'], (float) $p['stall_hours'], (string) $p['stall_action'], (int) $p['paused'], (string) $p['pause_reason'], (string) $p['advanced_to'], (int) $p['auto_advance'], (float) $p['solve_score'], (int) $p['solve_jobs']]);
    }

    /* Queued auto jobs for a task that was just left behind move to the next task,
     * so they do not sit in the queue (claims skip a paused task) and block supply. */
    private function retargetQueued(string $projectId, string $from, string $to): int
    {
        $st = $this->db->prepare("SELECT id, title, spec_json FROM jobs WHERE project_id = ? AND status = 'queued'");
        $st->execute([$projectId]);
        $upd = $this->db->prepare("UPDATE jobs SET title = ?, spec_json = ? WHERE id = ? AND status = 'queued'");
        $moved = 0;
        foreach ($st->fetchAll() as $job) {
            $spec = json_decode((string) $job['spec_json'], true);
            if (!is_array($spec) || (string) ($spec['taskId'] ?? '') !== $from || strpos((string) $job['title'], 'Auto ') !== 0) {
                continue;
            }
            $spec['taskId'] = $to;
            unset($spec['seedGenomes']);
            $upd->execute(['Auto ' . $to, json_encode($spec), $job['id']]);
            $moved++;
        }
        return $moved;
    }

    public function nextCurriculumTask(string $taskId): string
    {
        $order = self::CURRICULUM;
        $index = array_search($taskId, $order, true);
        if ($index === false || $index >= count($order) - 1) {
            return '';
        }
        return $order[$index + 1];
    }

    public function watchedTasks(): array
    {
        $rows = $this->db->query('SELECT DISTINCT task_id FROM design_records WHERE engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY task_id ASC LIMIT 12')->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $task = (string) $row['task_id'];
            $out[] = $this->applyTaskPolicy('spikefoundry', $task);
            $out[count($out) - 1]['task_id'] = $task;
        }
        return $out;
    }
    /* ---- Remote diagnostics ------------------------------------------------------------
     * Workers report what went wrong (startup, error, crash, setup). Reports are size-capped,
     * scrubbed of anything that looks like a credential, and only the newest 30 per computer
     * are kept. */
    const DIAG_KINDS = ['startup', 'error', 'crash', 'setup'];
    const DIAG_MAX_BYTES = 16384;

    public static function scrubText(string $text): string
    {
        $text = preg_replace('/(Bearer|Authorization:?|token[=:]|password[=:]|passwd[=:]|secret[=:])\s*\S+/i', '$1 [redacted]', $text);
        /* Long opaque strings look like credentials. Git commit ids (40 hex) and SHA-256
         * hashes (64 hex) stay readable; worker tokens are 48 hex and are removed. */
        $text = preg_replace_callback('/\b[A-Za-z0-9_\-]{32,}\b/', function ($m) {
            $s = $m[0];
            return (ctype_xdigit($s) && (strlen($s) === 40 || strlen($s) === 64)) ? $s : '[redacted]';
        }, (string) $text);
        return (string) $text;
    }

    private static function cleanDiag($value, int $depth = 0)
    {
        if ($depth > 3) {
            return null;
        }
        if (is_array($value)) {
            $out = [];
            $n = 0;
            foreach ($value as $k => $v) {
                if (++$n > 60) {
                    break;
                }
                if (is_string($k) && preg_match('/token|password|secret|cookie|auth/i', $k)) {
                    continue;
                }
                $out[is_int($k) ? $k : substr((string) $k, 0, 40)] = self::cleanDiag($v, $depth + 1);
            }
            return $out;
        }
        if (is_string($value)) {
            return self::scrubText(substr($value, 0, 2000));
        }
        if (is_bool($value) || is_int($value) || is_float($value) || $value === null) {
            return $value;
        }
        return null;
    }

    public function saveDiagnostics(string $workerId, array $report, string $secret = ''): array
    {
        if ($secret !== '') {
            $report = json_decode(str_replace($secret, '[redacted]', (string) json_encode($report)), true) ?: [];
        }
        $kind = (string) ($report['kind'] ?? '');
        if (!in_array($kind, self::DIAG_KINDS, true)) {
            throw new InvalidArgumentException('kind must be one of ' . implode(', ', self::DIAG_KINDS));
        }
        $ok = !empty($report['ok']) ? 1 : 0;
        $summary = self::scrubText(substr(trim((string) ($report['summary'] ?? '')), 0, 300));
        if ($summary === '') {
            $summary = $ok ? ucfirst($kind) . ' report' : ucfirst($kind) . ' problem';
        }
        $body = self::cleanDiag($report);
        unset($body['kind'], $body['summary'], $body['ok']);
        if (isset($body['log']) && is_array($body['log'])) {
            $body['log'] = array_map(function ($l) {
                return substr((string) $l, 0, 300);
            }, array_slice(array_values($body['log']), -50));
        }
        $json = json_encode($body);
        while (strlen((string) $json) > self::DIAG_MAX_BYTES && isset($body['log']) && count($body['log']) > 0) {
            array_shift($body['log']);
            $json = json_encode($body);
        }
        if (strlen((string) $json) > self::DIAG_MAX_BYTES) {
            unset($body['log'], $body['lastError']['stack']);
            $json = json_encode($body);
        }
        if (strlen((string) $json) > self::DIAG_MAX_BYTES) {
            $json = json_encode(['truncated' => true]);
        }
        $now = $this->now();
        $this->db->prepare('INSERT INTO worker_diagnostics (worker_id, kind, ok, summary, body_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$workerId, $kind, $ok, $summary, $json, $now]);
        $ids = $this->db->prepare('SELECT id FROM worker_diagnostics WHERE worker_id = ? ORDER BY id DESC');
        $ids->execute([$workerId]);
        $all = $ids->fetchAll(PDO::FETCH_COLUMN);
        if (count($all) > 30) {
            $cut = (int) $all[29];
            $this->db->prepare('DELETE FROM worker_diagnostics WHERE worker_id = ? AND id < ?')->execute([$workerId, $cut]);
        }
        return ['ok' => true, 'stored' => $kind];
    }

    public function latestDiagnostics(string $workerId, int $limit = 5): array
    {
        $limit = max(1, min(30, $limit));
        $q = $this->db->prepare('SELECT id, kind, ok, summary, body_json, created_at FROM worker_diagnostics WHERE worker_id = ? ORDER BY id DESC LIMIT ' . $limit);
        $q->execute([$workerId]);
        return $q->fetchAll();
    }

    /** Remember why the server turned a worker away (protocol mismatch), for the health line. */
    public function noteReject(string $workerId, string $what): void
    {
        $this->db->prepare('UPDATE workers SET last_reject = ? WHERE id = ?')
            ->execute([json_encode(['what' => substr($what, 0, 40), 'at' => $this->now()]), $workerId]);
    }

    /** One plain-English line about whether a computer is working, plus a fix hint. */
    public function healthOf(array $worker): array
    {
        $now = strtotime($this->now());
        $id = (string) $worker['id'];
        if ((int) ($worker['revoked'] ?? 0) === 1) {
            return ['level' => 'bad', 'line' => 'Token revoked', 'hint' => 'Re-run setup with a new link to use this computer again.'];
        }
        $seen = !empty($worker['last_seen']) ? strtotime((string) $worker['last_seen']) : 0;
        $created = !empty($worker['created_at']) ? strtotime((string) $worker['created_at']) : 0;
        $age = $seen > 0 ? $now - $seen : null;
        $online = $age !== null && $age <= 180;
        /* enroll() stamps last_seen at registration; a real heartbeat moves it later or
         * leaves a runtime report behind. */
        $beat = ($seen - $created) > 5 || trim((string) ($worker['runtime_json'] ?? '')) !== '';
        $reject = json_decode((string) ($worker['last_reject'] ?? ''), true);
        $rejectRecent = is_array($reject) && isset($reject['at']) && ($now - strtotime((string) $reject['at'])) < 900 && (!$seen || strtotime((string) $reject['at']) >= $seen - 60);
        $diags = $this->latestDiagnostics($id, 1);
        $last = $diags[0] ?? null;
        $lastBody = $last ? json_decode((string) $last['body_json'], true) : null;
        $hintFrom = function (string $fallback) use ($lastBody): string {
            return is_array($lastBody) && !empty($lastBody['hint']) ? (string) $lastBody['hint'] : $fallback;
        };
        $mins = $age !== null ? max(1, (int) round($age / 60)) : 0;
        $span = $mins >= 120 ? round($mins / 60) . ' h' : $mins . ' min';
        if ($rejectRecent && ($reject['what'] ?? '') === 'protocol') {
            return ['level' => 'bad', 'line' => 'Protocol mismatch, needs update', 'hint' => 'The worker downloads the new code by itself within a few minutes. If this stays, re-run the setup file.'];
        }
        if ($online && $beat) {
            if ($last && (int) $last['ok'] === 0 && $last['kind'] !== 'setup' && ($now - strtotime((string) $last['created_at'])) < 600) {
                return ['level' => 'warn', 'line' => 'Running, recovered from an error: ' . $last['summary'], 'hint' => $hintFrom('')];
            }
            return ['level' => 'ok', 'line' => 'Healthy', 'hint' => ''];
        }
        $lastAt = $last ? strtotime((string) $last['created_at']) : 0;
        if ($last && (int) $last['ok'] === 0 && $lastAt >= $seen - 120) {
            if ($last['kind'] === 'setup') {
                return ['level' => 'bad', 'line' => 'Setup failed: ' . $last['summary'], 'hint' => $hintFrom('Fix the problem above, then run the setup file again.')];
            }
            if (is_array($lastBody) && isset($lastBody['reach']) && $lastBody['reach'] === false) {
                return ['level' => 'bad', 'line' => "Can't reach server", 'hint' => $hintFrom('Check the internet connection or firewall on that computer.')];
            }
            return ['level' => 'bad', 'line' => ($beat ? 'Stopped after checking in: ' : 'Not running: ') . 'worker crashed (' . $last['summary'] . ')', 'hint' => $hintFrom('Run the setup file again. If it keeps crashing, send the owner the Diagnostics shown here.')];
        }
        if ($online && !$beat) {
            return ['level' => 'warn', 'line' => 'Registered, waiting for the worker program to start', 'hint' => 'Finish the setup file on that computer.'];
        }
        if (!$beat) {
            return ['level' => 'bad', 'line' => 'Not running: registered ' . $span . ' ago, but the worker program never checked in', 'hint' => 'Run the setup file again on that computer and read its last lines. It needs Node.js 18 or newer for the account that runs it.'];
        }
        return ['level' => $mins > 60 ? 'bad' : 'warn', 'line' => 'Not running: no heartbeat for ' . $span, 'hint' => 'Is the computer on and awake? If it is, run the setup file again.'];
    }

    /* ---- One-line setup commands ---------------------------------------------------------
     * "curl ... /s/CODE | sh" needs the worker token inside the script, but the database only keeps token hashes.
     * A setup code seals the token with a key derived from the code itself (AES-256-GCM); the row is keyed by the
     * code's hash and expires after an hour. Without the code, the row is useless. */
    const SETUP_CODE_SECONDS = 3600;

    public function makeSetupCode(string $workerId, string $token): array
    {
        $this->db->prepare('DELETE FROM setup_codes WHERE expires_at < ?')->execute([$this->now()]);
        $code = rtrim(strtr(base64_encode(random_bytes(15)), '+/', 'Ab'), '=');
        $key = hash('sha256', 'computelab-setup|' . $code, true);
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($token, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Could not seal the setup code.');
        }
        $expires = gmdate('c', strtotime($this->now()) + self::SETUP_CODE_SECONDS);
        $this->db->prepare('INSERT INTO setup_codes (id, worker_id, sealed, expires_at) VALUES (?, ?, ?, ?)')
            ->execute([hash('sha256', $code), $workerId, base64_encode($iv . $tag . $cipher), $expires]);
        return ['code' => $code, 'expires' => $expires];
    }

    /** Returns the token for a live setup code, or null when the code is unknown or expired. */
    public function tokenForSetupCode(string $code): ?string
    {
        if (!preg_match('/^[A-Za-z0-9]{16,40}$/', $code)) {
            return null;
        }
        $st = $this->db->prepare('SELECT sealed, expires_at FROM setup_codes WHERE id = ?');
        $st->execute([hash('sha256', $code)]);
        $row = $st->fetch();
        if (!$row || strtotime((string) $row['expires_at']) < strtotime($this->now())) {
            return null;
        }
        $raw = base64_decode((string) $row['sealed'], true);
        if ($raw === false || strlen($raw) < 29) {
            return null;
        }
        $key = hash('sha256', 'computelab-setup|' . $code, true);
        $token = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        if (!is_string($token) || !preg_match('/^[a-f0-9]{32,128}$/', $token)) {
            return null;
        }
        return $this->workerByToken($token) ? $token : null;
    }

    /** New token for an existing computer, so its owner can get a fresh setup command. The old token stops working. */
    public function rotateToken(string $workerId): string
    {
        $token = bin2hex(random_bytes(24));
        $st = $this->db->prepare('UPDATE workers SET token_hash = ? WHERE id = ? AND revoked = 0');
        $st->execute([hash('sha256', $token), $workerId]);
        if ($st->rowCount() < 1) {
            throw new InvalidArgumentException('That computer is unknown or revoked.');
        }
        $this->db->prepare('DELETE FROM setup_codes WHERE worker_id = ?')->execute([$workerId]);
        return $token;
    }
}
