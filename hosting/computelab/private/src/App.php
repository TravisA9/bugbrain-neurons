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

    public function migrate(): void
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
        $this->ensureColumn('leases', 'progress', 'INTEGER');
        $this->ensureColumn('results', 'seconds', 'INTEGER');
        $this->ensureColumn('design_records', 'arm', "VARCHAR(16) NOT NULL DEFAULT 'designer'");
        $this->ensureColumn('design_records', 'seq', 'INTEGER NOT NULL DEFAULT 0');
        $this->ensureColumn('design_genomes', 'is_public', 'INTEGER NOT NULL DEFAULT 0');
        $this->ensureColumn('task_policies', 'auto_advance', 'INTEGER NOT NULL DEFAULT 1');
        $this->ensureColumn('task_policies', 'solve_score', 'REAL NOT NULL DEFAULT 0.97');
        $this->ensureColumn('task_policies', 'solve_jobs', 'INTEGER NOT NULL DEFAULT 3');
        $this->ensureColumn('workers', 'public_credit', 'INTEGER NOT NULL DEFAULT 1');
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

    private function ensureColumn(string $table, string $column, string $definition): void
    {
        if ($this->hasColumn($table, $column)) {
            return;
        }
        $this->db->exec('ALTER TABLE `' . $table . '` ADD COLUMN `' . $column . '` ' . $definition);
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
        $this->db->prepare('INSERT INTO workers (id, name, token_hash, consent_at, paused, revoked, allowed_json, max_batches, last_seen, participant_id, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)')
            ->execute([$id, $name, hash('sha256', $token), $this->now(), json_encode($allowed), $maxBatches, $this->now(), $participantId, $this->now()]);
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

    public function revoke(string $workerId): void
    {
        $this->db->prepare('UPDATE workers SET revoked = 1 WHERE id = ?')->execute([$workerId]);
        $this->db->prepare('DELETE FROM leases WHERE worker_id = ?')->execute([$workerId]);
    }

    public function setPaused(string $workerId, bool $paused): void
    {
        $this->db->prepare('UPDATE workers SET paused = ? WHERE id = ?')->execute([$paused ? 1 : 0, $workerId]);
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
            $task = is_array($spec) ? (string) ($spec['taskId'] ?? '') : '';
            if ($task !== '' && isset($paused[(string) $job['project_id'] . '|' . $task])) {
                continue;
            }
            $n++;
        }
        return $n;
    }

    public function claim(array $worker): ?array
    {
        $this->replenishJobs();
        $this->expireLeases();
        if ((int) $worker['paused'] === 1) {
            return null;
        }
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
                    $batches = (int) ($spec['batches'] ?? 1);
                    if ($batches > (int) $worker['max_batches']) {
                        continue;
                    }
                    $taskId = (string) ($spec['taskId'] ?? '');
                    if ($taskId !== '' && $this->taskPaused((string) $project['id'], $taskId)) {
                        continue;
                    }
                    $ranked[] = ['job' => $job, 'spec' => $spec];
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
                $this->db->prepare('INSERT INTO leases (job_id, worker_id, until_at, heartbeat_at, started_at) VALUES (?, ?, ?, ?, ?)')->execute([$job['id'], $worker['id'], $until, $this->now(), $this->now()]);
                $tpl = $this->db->prepare('SELECT runner FROM templates WHERE id = ?');
                $tpl->execute([$job['template_id']]);
                $runner = (string) ($tpl->fetch()['runner'] ?? '');
                $this->db->commit();
                return [
                    'id' => $job['id'],
                    'project' => $job['project_id'],
                    'title' => $job['title'],
                    'runner' => $runner,
                    'spec' => $item['spec'],
                    'codeHash' => $job['code_hash'],
                    'leaseUntil' => $until,
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

    public function heartbeat(array $worker, array $extra = []): array
    {
        $this->db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([$this->now(), $worker['id']]);
        $fresh = $this->db->prepare('SELECT paused, revoked FROM workers WHERE id = ?');
        $fresh->execute([$worker['id']]);
        $state = $fresh->fetch();
        if (!$state) {
            return ['ok' => true, 'paused' => true, 'revoked' => true, 'jobId' => null, 'leaseUntil' => null];
        }
        $lease = $this->db->prepare('SELECT * FROM leases WHERE worker_id = ?');
        $lease->execute([$worker['id']]);
        $row = $lease->fetch();
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
        return [
            'ok' => true,
            'paused' => (int) $state['paused'] === 1,
            'revoked' => (int) $state['revoked'] === 1,
            'jobId' => $jobId,
            'leaseUntil' => $until,
        ];
    }

    public function submitResult(array $worker, string $jobId, array $body): void
    {
        if (!preg_match('/^[a-z0-9._-]{2,64}$/', $jobId)) {
            throw new InvalidArgumentException('Bad job id.');
        }
        $raw = json_encode($body);
        if ($raw === false || strlen($raw) > (int) $this->config['result_bytes']) {
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
            $lease = $this->db->prepare('SELECT worker_id, started_at FROM leases WHERE job_id = ? AND worker_id = ?');
            $lease->execute([$jobId, $worker['id']]);
            $leaseRow = $lease->fetch();
            if (!$leaseRow) {
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
            if ($row['project_id'] === 'spikefoundry' && empty($body['synthetic'])) {
                throw new InvalidArgumentException('SpikeFoundry results must be marked synthetic.');
            }
            $this->db->prepare('INSERT INTO results (job_id, worker_id, status, summary, body_json, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                ->execute([$jobId, $worker['id'], $status, $summary, $raw, $seconds, $this->now()]);
            if ($status === 'done') {
                $this->db->prepare('UPDATE jobs SET status = ?, not_before = NULL WHERE id = ? AND status = ?')->execute(['done', $jobId, 'leased']);
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
        $id = strtolower(preg_replace('/[^a-z0-9]+/', '-', $templateId) . '-' . $seed . '-' . bin2hex(random_bytes(3)));
        $this->db->prepare('INSERT INTO jobs (id, project_id, template_id, title, spec_json, code_hash, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $tpl['project_id'], $tpl['id'], $title, json_encode($spec), $this->protocolHash(), $priority, 'queued', $this->now()]);
        return $id;
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

    public function session(string $role, string $subject): array
    {
        $id = bin2hex(random_bytes(16));
        $csrf = bin2hex(random_bytes(16));
        $exp = gmdate('c', strtotime($this->now()) + 86400);
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

    public function ingestDesigns(array $worker, array $records, string $protocolHash): array
    {
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
        $stored = 0;
        $skipped = 0;
        $touched = [];
        foreach ($records as $rec) {
            if (is_array($rec) && $this->retiredDesign($rec)) {
                throw new InvalidArgumentException('Design upload from designer version spikefoundry-designer-1 or spikefoundry-designer-2 is not accepted.');
            }
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
            $haveGenome = $this->db->prepare('SELECT hash FROM design_genomes WHERE hash = ?');
            $haveGenome->execute([$genomeHash]);
            if (!$haveGenome->fetch()) {
                $this->db->prepare('INSERT INTO design_genomes (hash, genome_json, version, created_at) VALUES (?, ?, ?, ?)')
                    ->execute([$genomeHash, $genomeJson, $version, $this->now()]);
            }
            $id = substr(hash('sha256', $worker['id'] . '|' . $taskId . '|' . $taskVersion . '|' . $genomeHash . '|' . $seed . '|' . $jobId), 0, 32);
            $exists = $this->db->prepare('SELECT id FROM design_records WHERE id = ?');
            $exists->execute([$id]);
            if ($exists->fetch()) {
                $skipped++;
                continue;
            }
            $engine = substr((string) ($rec['engineVersion'] ?? 'spikefoundry-1'), 0, 32);
            $seq = (int) $this->db->query('SELECT COALESCE(MAX(seq), 0) + 1 FROM design_records')->fetchColumn();
            $this->db->prepare('INSERT INTO design_records (id, genome_hash, task_id, task_version, score_json, neurons, synapses, spikes, eval_ms, engine_version, protocol_hash, worker_id, seed, job_id, arm, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([
                    $id, $genomeHash, $taskId, $taskVersion, $scoreJson,
                    max(0, (int) ($rec['neurons'] ?? 0)), max(0, (int) ($rec['synapses'] ?? 0)),
                    max(0, (int) ($rec['spikes'] ?? 0)), max(0, (int) ($rec['evalMs'] ?? 0)),
                    $engine, substr($protocolHash, 0, 64), $worker['id'], $seed, $jobId !== '' ? $jobId : null, $arm, $seq, $this->now(),
                ]);
            $stored++;
            $touched[$taskId] = true;
            $heldNow = isset($scores['heldOut']) ? (float) $scores['heldOut'] : (isset($scores['quality']) ? (float) $scores['quality'] : 0.0);
            $this->noteHighlight($worker, $taskId, $heldNow, $genomeHash);
        }
        foreach (array_keys($touched) as $touchedTask) {
            $this->applyTaskPolicy('spikefoundry', $touchedTask);
        }
        return ['stored' => $stored, 'skipped' => $skipped];
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
        $st = $this->db->prepare('SELECT id, genome_hash, task_id, task_version, score_json, neurons, synapses, spikes, eval_ms, worker_id, seed, created_at FROM design_records WHERE task_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY created_at DESC LIMIT 400');
        $st->execute([$taskId]);
        $best = [];
        foreach ($st->fetchAll() as $row) {
            $score = json_decode((string) $row['score_json'], true);
            $quality = is_array($score) && isset($score['quality']) ? (float) $score['quality'] : -1;
            $hash = (string) $row['genome_hash'];
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
        $st = $this->db->prepare('SELECT COUNT(*) FROM design_records WHERE worker_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\')');
        $st->execute([$workerId]);
        return (int) $st->fetchColumn();
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

    private function noteHighlight(array $worker, string $taskId, float $held, string $genomeHash): void
    {
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
            $prior = $this->db->prepare('SELECT DISTINCT task_id FROM design_records WHERE worker_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\')');
            $prior->execute([$worker['id']]);
            $max = -1;
            foreach ($prior->fetchAll() as $row) {
                $at = array_search((string) $row['task_id'], $order, true);
                if ($at !== false && (string) $row['task_id'] !== $taskId && $at > $max) {
                    $max = (int) $at;
                }
            }
            if ($max >= 0 && $here > $max) {
                $this->addEvent((string) $worker['id'], $taskId, 'promoted', 'A design moved up to ' . $taskId, 'level');
            }
        }
        $sum = $this->db->prepare('SELECT COUNT(*) AS n, COALESCE(SUM(eval_ms), 0) AS ms FROM design_records WHERE worker_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\')');
        $sum->execute([$worker['id']]);
        $tot = $sum->fetch() ?: ['n' => 0, 'ms' => 0];
        foreach ([10, 100, 1000] as $mark) {
            if ((int) $tot['n'] >= $mark) {
                $this->addEvent((string) $worker['id'], $taskId, 'evals', $mark . ' evaluations', (string) $mark);
            }
        }
        $hours = ((int) $tot['ms']) / 3600000;
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

    public function leaderboard(int $limit = 20): array
    {
        if ($limit < 1) {
            $limit = 20;
        }
        if ($limit > 50) {
            $limit = 50;
        }
        $rows = $this->db->query('SELECT w.participant_id, w.name, w.public_credit, COUNT(r.id) AS records, COUNT(DISTINCT r.genome_hash) AS genomes, COALESCE(SUM(r.eval_ms), 0) AS ms FROM design_records r JOIN workers w ON w.id = r.worker_id WHERE r.engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') GROUP BY w.participant_id, w.name, w.public_credit ORDER BY ms DESC LIMIT ' . (int) $limit)->fetchAll();
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
        $globalCap = (int) ($this->config['supply_cap'] ?? 24);
        if ($globalCap < 1) {
            $globalCap = 24;
        }
        $this->moveQueuedOffPausedTasks();
        $queuedAll = $this->claimableQueued();
        if ($queuedAll >= $globalCap) {
            return 0;
        }
        $online = 0;
        $seen = $this->db->query('SELECT last_seen, revoked FROM workers')->fetchAll();
        foreach ($seen as $row) {
            if ((int) $row['revoked'] === 1 || empty($row['last_seen'])) {
                continue;
            }
            if ((strtotime($this->now()) - strtotime((string) $row['last_seen'])) <= 180) {
                $online++;
            }
        }
        $made = 0;
        $projects = $this->db->query('SELECT * FROM projects WHERE enabled = 1 ORDER BY priority DESC, id ASC')->fetchAll();
        foreach ($projects as $project) {
            if (!$this->projectAutoOn($project)) {
                continue;
            }
            $template = $this->supplyTemplate((string) $project['id']);
            if ($template === '') {
                continue;
            }
            $low = (int) $project['low_water'] > 0 ? (int) $project['low_water'] : max(1, $online);
            $cap = (int) $project['queue_cap'] > 0 ? (int) $project['queue_cap'] : 8;
            $queued = $this->claimableQueued((string) $project['id']);
            $guard = 0;
            while ($queued < $low && $queued < $cap && $queuedAll < $globalCap && $guard < 20) {
                $task = $this->supplyTask((string) $project['id']);
                if ($task === '') {
                    break;
                }
                $seed = (hexdec(substr(hash('sha256', $project['id'] . '|' . $this->now() . '|' . $made), 0, 6)) % 1000000) + 1;
                $evals = max(0, (int) ($project['evals_per_job'] ?? 0));
                $seconds = (int) ($project['target_seconds'] ?? 0) > 0 ? (int) $project['target_seconds'] : 180;
                $keepTop = (int) ($project['keep_top'] ?? 0) > 0 ? (int) $project['keep_top'] : 50;
                $keepRandom = array_key_exists('keep_random', $project) ? (int) $project['keep_random'] : 500;
                $extra = ['taskId' => $task, 'evals' => $evals, 'targetSeconds' => $seconds, 'keepTop' => $keepTop, 'keepRandom' => $keepRandom];
                if ((string) $project['id'] !== 'bugbrain' && (string) ($project['family'] ?? '') !== 'bugbrain') {
                    $extra['mode'] = 'propose';
                    try {
                        $top = $this->topDesigns($task, 3);
                        $hashes = [];
                        foreach ($top as $row) {
                            $hashes[] = (string) $row['genome_hash'];
                        }
                        if ($hashes !== []) {
                            $extra['seedGenomes'] = $hashes;
                        }
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
        $st = $this->db->prepare('SELECT score_json, eval_ms, arm, created_at FROM design_records WHERE task_id = ? AND engine_version NOT IN (\'spikefoundry-designer-1\', \'spikefoundry-designer-2\') ORDER BY seq DESC, created_at DESC LIMIT ' . (int) $limit);
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
}
