<?php
declare(strict_types=1);

/** Coordinator for shared hosting. SQLite in tests, MySQL/MariaDB on Hostinger. */
final class App
{
    public PDO $db;
    /** @var array<string,mixed> */
    public array $config;
    /** @var callable():string */
    public $clock;

    public function __construct(PDO $db, array $config, ?callable $clock = null)
    {
        $this->db = $db;
        $this->config = $config;
        $this->clock = $clock ?? static fn (): string => gmdate('c');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
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
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            priority INTEGER NOT NULL,
            enabled INTEGER NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            runner TEXT NOT NULL,
            spec_json TEXT NOT NULL,
            code_hash TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS approved_code (
            hash TEXT PRIMARY KEY,
            label TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            template_id TEXT NOT NULL,
            title TEXT NOT NULL,
            spec_json TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            priority REAL NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS workers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            consent_at TEXT NOT NULL,
            paused INTEGER NOT NULL,
            revoked INTEGER NOT NULL,
            allowed_json TEXT NOT NULL,
            max_batches INTEGER NOT NULL,
            last_seen TEXT,
            created_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS leases (
            job_id TEXT PRIMARY KEY,
            worker_id TEXT NOT NULL,
            until_at TEXT NOT NULL,
            heartbeat_at TEXT NOT NULL
        )');
        $this->db->exec("CREATE TABLE IF NOT EXISTS results (
            id $auto,
            job_id TEXT NOT NULL,
            worker_id TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT NOT NULL,
            body_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )");
        $this->db->exec('CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            subject TEXT NOT NULL,
            csrf TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )');
        $this->db->exec('CREATE TABLE IF NOT EXISTS rate_limits (
            bucket TEXT PRIMARY KEY,
            window_start TEXT NOT NULL,
            hits INTEGER NOT NULL
        )');
        $this->seed();
    }

    public function seed(): void
    {
        $hash = $this->protocolHash();
        $have = $this->db->prepare('SELECT hash FROM approved_code WHERE hash = ?');
        $have->execute([$hash]);
        if (!$have->fetch()) {
            $this->db->prepare('INSERT INTO approved_code (hash, label) VALUES (?, ?)')->execute([$hash, 'protocol-1']);
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

    public function protocolHash(): string
    {
        $path = (string) $this->config['protocol'];
        $text = is_file($path) ? (string) file_get_contents($path) : '';
        return hash('sha256', $text);
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

    /** @param list<string> $projects */
    public function enroll(string $name, array $projects, int $maxBatches, bool $consent): array
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
        $this->db->prepare('INSERT INTO workers (id, name, token_hash, consent_at, paused, revoked, allowed_json, max_batches, last_seen, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)')
            ->execute([$id, $name, hash('sha256', $token), $this->now(), json_encode($allowed), $maxBatches, $this->now(), $this->now()]);
        return ['workerId' => $id, 'token' => $token, 'name' => $name];
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
        $st = $this->db->prepare('SELECT job_id FROM leases WHERE until_at < ?');
        $st->execute([$now]);
        foreach ($st->fetchAll() as $row) {
            $this->db->prepare('UPDATE jobs SET status = ? WHERE id = ? AND status = ?')->execute(['queued', $row['job_id'], 'leased']);
        }
        $this->db->prepare('DELETE FROM leases WHERE until_at < ?')->execute([$now]);
    }

    public function claim(array $worker): ?array
    {
        $this->expireLeases();
        if ((int) $worker['paused'] === 1) {
            return null;
        }
        $allowed = json_decode((string) $worker['allowed_json'], true) ?: [];
        $projects = $this->db->query('SELECT * FROM projects WHERE enabled = 1 ORDER BY priority DESC, id ASC')->fetchAll();
        foreach ($projects as $project) {
            if (!in_array($project['id'], $allowed, true)) {
                continue;
            }
            $st = $this->db->prepare('SELECT * FROM jobs WHERE project_id = ? AND status = ? ORDER BY priority DESC, id ASC');
            $st->execute([$project['id'], 'queued']);
            $job = $st->fetch();
            if (!$job) {
                continue;
            }
            $spec = json_decode((string) $job['spec_json'], true) ?: [];
            $batches = (int) ($spec['batches'] ?? 1);
            if ($batches > (int) $worker['max_batches']) {
                continue;
            }
            $until = gmdate('c', strtotime($this->now()) + (int) $this->config['lease_seconds']);
            $this->db->prepare('UPDATE jobs SET status = ? WHERE id = ? AND status = ?')->execute(['leased', $job['id'], 'queued']);
            $this->db->prepare('INSERT INTO leases (job_id, worker_id, until_at, heartbeat_at) VALUES (?, ?, ?, ?)')->execute([$job['id'], $worker['id'], $until, $this->now()]);
            $tpl = $this->db->prepare('SELECT runner FROM templates WHERE id = ?');
            $tpl->execute([$job['template_id']]);
            $runner = (string) ($tpl->fetch()['runner'] ?? '');
            return [
                'id' => $job['id'],
                'project' => $job['project_id'],
                'title' => $job['title'],
                'runner' => $runner,
                'spec' => $spec,
                'codeHash' => $job['code_hash'],
                'leaseUntil' => $until,
            ];
        }
        return null;
    }

    public function heartbeat(array $worker): array
    {
        $this->db->prepare('UPDATE workers SET last_seen = ? WHERE id = ?')->execute([$this->now(), $worker['id']]);
        $lease = $this->db->prepare('SELECT * FROM leases WHERE worker_id = ?');
        $lease->execute([$worker['id']]);
        $row = $lease->fetch();
        if ($row) {
            $until = gmdate('c', strtotime($this->now()) + (int) $this->config['lease_seconds']);
            $this->db->prepare('UPDATE leases SET heartbeat_at = ?, until_at = ? WHERE job_id = ?')->execute([$this->now(), $until, $row['job_id']]);
        }
        return ['ok' => true, 'paused' => (int) $worker['paused'] === 1, 'jobId' => $row['job_id'] ?? null];
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
        $lease = $this->db->prepare('SELECT * FROM leases WHERE job_id = ? AND worker_id = ?');
        $lease->execute([$jobId, $worker['id']]);
        if (!$lease->fetch()) {
            throw new InvalidArgumentException('This computer does not hold that job.');
        }
        $job = $this->db->prepare('SELECT * FROM jobs WHERE id = ?');
        $job->execute([$jobId]);
        $row = $job->fetch();
        if (!$row) {
            throw new InvalidArgumentException('Unknown job.');
        }
        $status = (string) ($body['status'] ?? '');
        if (!in_array($status, ['done', 'error'], true)) {
            throw new InvalidArgumentException('Status must be done or error.');
        }
        $summary = (string) ($body['summary'] ?? '');
        if (strlen($summary) > 500) {
            throw new InvalidArgumentException('Summary is too long.');
        }
        if ($row['project_id'] === 'spikefoundry' && empty($body['synthetic'])) {
            throw new InvalidArgumentException('SpikeFoundry results must be marked synthetic.');
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
        $this->db->prepare('INSERT INTO results (job_id, worker_id, status, summary, body_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$jobId, $worker['id'], $status, $summary, $raw, $this->now()]);
        $this->db->prepare('UPDATE jobs SET status = ? WHERE id = ?')->execute([$status === 'done' ? 'done' : 'queued', $jobId]);
        $this->db->prepare('DELETE FROM leases WHERE job_id = ?')->execute([$jobId]);
    }

    public function createJob(string $templateId, string $title, float $priority, int $seed): string
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
        $spec['seed'] = $seed;
        $id = strtolower(preg_replace('/[^a-z0-9]+/', '-', $templateId) . '-' . $seed . '-' . bin2hex(random_bytes(3)));
        $this->db->prepare('INSERT INTO jobs (id, project_id, template_id, title, spec_json, code_hash, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $tpl['project_id'], $tpl['id'], $title, json_encode($spec), $tpl['code_hash'], $priority, 'queued', $this->now()]);
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
        $st = $this->db->prepare('SELECT leases.job_id, leases.until_at, jobs.title, jobs.project_id FROM leases JOIN jobs ON jobs.id = leases.job_id WHERE leases.worker_id = ?');
        $st->execute([$workerId]);
        $row = $st->fetch();
        return $row ?: null;
    }
}
