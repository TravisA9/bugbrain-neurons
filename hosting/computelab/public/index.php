<?php
declare(strict_types=1);

function coord_load_compat(): void
{
    $candidates = [__DIR__ . '/private/src/compat.php'];
    $homeFile = __DIR__ . '/coord-home.txt';
    if (is_file($homeFile)) {
        $path = trim((string) file_get_contents($homeFile));
        if ($path !== '') {
            $candidates[] = rtrim($path, '/') . '/src/compat.php';
        }
    }
    $env = getenv('COORD_PRIVATE');
    if (is_string($env) && $env !== '') {
        $candidates[] = rtrim($env, '/') . '/src/compat.php';
    }
    $candidates[] = dirname(__DIR__) . '/private/src/compat.php';
    foreach ($candidates as $file) {
        if (is_file($file)) {
            require_once $file;
            return;
        }
    }
}
coord_load_compat();

function coord_private_root(): string
{
    $homeFile = __DIR__ . '/coord-home.txt';
    if (is_file($homeFile)) {
        $path = trim((string) file_get_contents($homeFile));
        if ($path !== '' && is_dir($path)) {
            return $path;
        }
    }
    $env = getenv('COORD_PRIVATE');
    if (is_string($env) && $env !== '' && is_dir($env)) {
        return $env;
    }
    return dirname(__DIR__) . '/private';
}

$private = coord_private_root();
require $private . '/src/App.php';
require $private . '/src/pages.php';
require $private . '/src/setup.php';

function coord_config(string $private): array
{
    $override = getenv('COORD_CONFIG');
    if (is_string($override) && is_file($override)) {
        $config = require $override;
        if (!is_array($config)) {
            throw new RuntimeException('Config must return an array.');
        }
        return $config;
    }
    $path = $private . '/config.php';
    if (!is_file($path)) {
        $path = $private . '/config.example.php';
    }
    $config = require $path;
    if (!is_array($config)) {
        throw new RuntimeException('Config must return an array.');
    }
    return $config;
}

function coord_db(array $config): PDO
{
    if (($config['driver'] ?? '') === 'sqlite') {
        $path = (string) $config['sqlite']['path'];
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0700, true);
        }
        return new PDO('sqlite:' . $path);
    }
    $m = $config['mysql'];
    $dsn = 'mysql:host=' . $m['host'] . ';dbname=' . $m['database'] . ';charset=' . ($m['charset'] ?? 'utf8mb4');
    return new PDO($dsn, (string) $m['user'], (string) $m['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
}

function coord_json(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body);
}

function coord_html(string $html): void
{
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo $html;
}

function coord_cookie(string $name): string
{
    return (string) ($_COOKIE[$name] ?? '');
}

function coord_set_cookie(string $name, string $value, string $base): void
{
    setcookie($name, $value, ['expires' => time() + 86400, 'path' => ($base === '' ? '/' : $base . '/'), 'httponly' => true, 'samesite' => 'Lax']);
}

function coord_clear_cookie(string $name, string $base): void
{
    setcookie($name, '', ['expires' => time() - 3600, 'path' => ($base === '' ? '/' : $base . '/'), 'httponly' => true, 'samesite' => 'Lax']);
}

function coord_who(App $app, string $current): array
{
    $owner = $app->sessionById(coord_cookie('lab_owner'));
    $part = $app->sessionById(coord_cookie('lab_participant'));
    $isOwner = $owner && $owner['role'] === 'owner';
    $isPart = $part && $part['role'] === 'participant';
    return [
        'current' => $current,
        'owner' => $isOwner,
        'participant' => $isPart,
        'ownerCsrf' => $isOwner ? (string) $owner['csrf'] : '',
        'participantCsrf' => $isPart ? (string) $part['csrf'] : '',
        'participantId' => $isPart ? (string) $part['subject'] : '',
    ];
}

function coord_public_url(App $app): string
{
    $configured = trim((string) ($app->config['public_url'] ?? ''));
    if ($configured !== '') {
        return rtrim($configured, '/');
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $scheme = $https ? 'https' : 'http';
    return $scheme . '://' . $host . $app->base();
}

function coord_bearer(): string
{
    $h = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (str_starts_with($h, 'Bearer ')) {
        return trim(substr($h, 7));
    }
    return '';
}

function coord_path(App $app): string
{
    $uri = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/');
    $base = $app->base();
    if ($base !== '' && str_starts_with($uri, $base)) {
        $uri = substr($uri, strlen($base));
    }
    $uri = '/' . trim($uri, '/');
    return $uri === '/' ? '/' : rtrim($uri, '/');
}

function coord_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 65536) {
        throw new InvalidArgumentException('Request is too large.');
    }
    if ($raw === '') {
        return $_POST;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new InvalidArgumentException('Send JSON.');
    }
    return $data;
}

$app = new App(coord_db(coord_config($private)), coord_config($private));
if (getenv('COORD_TEST_NOW')) {
    $app->clock = static fn (): string => (string) getenv('COORD_TEST_NOW');
}
$app->migrate();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = coord_path($app);
$base = $app->base();

try {
    if ($path === '/assets/engine.js' && $method === 'GET') {
        $file = (string) $app->config['engine_js'];
        header('Content-Type: text/javascript; charset=utf-8');
        readfile($file);
        return;
    }
    if ($path === '/' && $method === 'GET') {
        coord_html(pageHome($app, coord_who($app, 'home')));
        return;
    }
    if (($path === '/explore' || $path === '/lab') && $method === 'GET') {
        $html = (string) file_get_contents((string) $app->config['lab_html']);
        $html = str_replace('/spikefoundry/engine.js', $base . '/assets/engine.js', $html);
        $html = str_replace('src="engine.js"', 'src="' . h($base . '/assets/engine.js') . '"', $html);
        $bar = exploreBar($base, coord_who($app, 'explore'));
        $html = preg_replace('/<body([^>]*)>/i', '<body$1>' . $bar, $html, 1);
        coord_html($html);
        return;
    }
    if ($path === '/join' && $method === 'GET') {
        coord_html(pageJoin($app, '', coord_who($app, 'join')));
        return;
    }
    if ($path === '/join/setup' && $method === 'GET') {
        http_response_code(405);
        header('Cache-Control: no-store');
        echo 'Use the download button on the setup page.';
        return;
    }
    if ($path === '/join/setup' && $method === 'POST') {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'local');
        if (!$app->rateLimit('setup:' . $ip, (int) $app->config['login_per_minute'])) {
            http_response_code(429);
            header('Cache-Control: no-store');
            echo 'Too many downloads. Wait a minute.';
            return;
        }
        $token = (string) ($_POST['token'] ?? '');
        $os = (string) ($_POST['os'] ?? '');
        $worker = $app->workerByToken($token);
        if (!$worker) {
            http_response_code(404);
            header('Cache-Control: no-store');
            echo 'Unknown token.';
            return;
        }
        $script = setup_script($os, $token, coord_public_url($app), $app->workerRepo(), $app->workerRef());
        $name = $os === 'windows' ? 'computelab-setup.cmd' : 'computelab-setup.sh';
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Cache-Control: no-store');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        echo $script;
        return;
    }
    if ($path === '/join' && $method === 'POST') {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'local');
        if (!$app->rateLimit('join:' . $ip, (int) $app->config['login_per_minute'])) {
            coord_html(pageJoin($app, 'Too many enrollments from this network. Wait a minute.'));
            return;
        }
        $projects = isset($_POST['project']) && is_array($_POST['project']) ? array_map('strval', $_POST['project']) : [];
        $participantId = null;
        $existing = $app->sessionById(coord_cookie('lab_participant'));
        if ($existing && $existing['role'] === 'participant') {
            $prev = $app->db->prepare('SELECT * FROM workers WHERE id = ?');
            $prev->execute([$existing['subject']]);
            $prevRow = $prev->fetch();
            if ($prevRow) {
                $participantId = $app->ensureParticipant($prevRow);
            }
        }
        $made = $app->enroll((string) ($_POST['name'] ?? ''), $projects, (int) ($_POST['max'] ?? 2), isset($_POST['consent']), $participantId);
        $session = $app->session('participant', $made['workerId']);
        coord_set_cookie('lab_participant', $session['id'], $base);
        header('Cache-Control: no-store');
        $who = coord_who($app, 'join');
        $who['participant'] = true;
        $who['participantCsrf'] = (string) $session['csrf'];
        coord_html(pageToken($app, $made['name'], $made['token'], $who));
        return;
    }
    if ($path === '/me' && $method === 'GET') {
        $session = $app->sessionById(coord_cookie('lab_participant'));
        $who = coord_who($app, 'me');
        if (!$session || $session['role'] !== 'participant') {
            coord_html(pageJoin($app, 'Enroll this computer to see its own work.', $who));
            return;
        }
        $st = $app->db->prepare('SELECT * FROM workers WHERE id = ?');
        $st->execute([$session['subject']]);
        $worker = $st->fetch();
        if (!$worker) {
            http_response_code(404);
            echo 'Unknown computer.';
            return;
        }
        $pid = $app->ensureParticipant($worker);
        coord_html(pageMe($app, $app->computersFor($pid), (string) $session['csrf'], $who));
        return;
    }
    if ($path === '/me/pause' && $method === 'POST') {
        $session = $app->sessionById(coord_cookie('lab_participant'));
        if (!$session || $session['role'] !== 'participant') {
            http_response_code(403);
            echo 'Participants only.';
            return;
        }
        $csrf = (string) ($_POST['csrf'] ?? '');
        if ($csrf === '' || !hash_equals((string) $session['csrf'], $csrf)) {
            http_response_code(403);
            echo 'Missing or bad security token. Reload the page.';
            return;
        }
        $st = $app->db->prepare('SELECT * FROM workers WHERE id = ?');
        $st->execute([$session['subject']]);
        $self = $st->fetch();
        if (!$self) {
            http_response_code(404);
            echo 'Unknown computer.';
            return;
        }
        $pid = $app->ensureParticipant($self);
        $target = (string) ($_POST['id'] ?? $session['subject']);
        if (!$app->workerOwns($pid, $target)) {
            http_response_code(403);
            echo 'That computer is not yours.';
            return;
        }
        $posted = (string) ($_POST['paused'] ?? '');
        if ($posted === '1' || $posted === '0') {
            $app->setPaused($target, $posted === '1');
        } else {
            $cur = $app->db->prepare('SELECT paused FROM workers WHERE id = ?');
            $cur->execute([$target]);
            $row = $cur->fetch();
            $app->setPaused($target, !((int) ($row['paused'] ?? 0) === 1));
        }
        header('Location: ' . $base . '/me', true, 303);
        return;
    }
    if ($path === '/logout' && $method === 'POST') {
        $owner = $app->sessionById(coord_cookie('lab_owner'));
        $part = $app->sessionById(coord_cookie('lab_participant'));
        $csrf = (string) ($_POST['csrf'] ?? '');
        $ok = ($owner && $owner['role'] === 'owner' && $csrf !== '' && hash_equals((string) $owner['csrf'], $csrf))
            || ($part && $part['role'] === 'participant' && $csrf !== '' && hash_equals((string) $part['csrf'], $csrf));
        if (!$ok) {
            http_response_code(403);
            echo 'Missing or bad security token. Reload the page.';
            return;
        }
        if ($owner) {
            $app->db->prepare('DELETE FROM sessions WHERE id = ?')->execute([$owner['id']]);
        }
        if ($part) {
            $app->db->prepare('DELETE FROM sessions WHERE id = ?')->execute([$part['id']]);
        }
        coord_clear_cookie('lab_owner', $base);
        coord_clear_cookie('lab_participant', $base);
        header('Location: ' . ($base === '' ? '/' : $base . '/'), true, 303);
        return;
    }
    if ($path === '/owner/login' && $method === 'GET') {
        coord_html(pageLogin($app, '', coord_who($app, 'login')));
        return;
    }
    if ($path === '/owner/login' && $method === 'POST') {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'local');
        if (!$app->rateLimit('login:' . $ip, (int) $app->config['login_per_minute'])) {
            coord_html(pageLogin($app, 'Too many tries. Wait a minute.', coord_who($app, 'login')));
            return;
        }
        $session = $app->login((string) ($_POST['username'] ?? ''), (string) ($_POST['password'] ?? ''));
        if (!$session) {
            coord_html(pageLogin($app, 'Name or password is wrong.', coord_who($app, 'login')));
            return;
        }
        coord_set_cookie('lab_owner', $session['id'], $base);
        header('Location: ' . $base . '/owner', true, 303);
        return;
    }
    if ($path === '/owner' && $method === 'GET') {
        $session = $app->sessionById(coord_cookie('lab_owner'));
        if (!$session || $session['role'] !== 'owner') {
            coord_html(pageLogin($app));
            return;
        }
        $status = (string) ($_GET['status'] ?? 'all');
        if (!in_array($status, ['all', 'queued', 'running', 'leased', 'done', 'held'], true)) {
            $status = 'all';
        }
        $pageNum = (int) ($_GET['page'] ?? 1);
        coord_html(pageOwner($app, (string) $session['csrf'], coord_who($app, 'owner'), '', $status, $pageNum));
        return;
    }
    if (str_starts_with($path, '/owner/designs') && $method === 'GET') {
        $session = $app->sessionById(coord_cookie('lab_owner'));
        if (!$session || $session['role'] !== 'owner') {
            http_response_code(403);
            echo 'Owner only.';
            return;
        }
        $task = (string) ($_GET['task'] ?? 'coincidence');
        if ($path === '/owner/designs/genome') {
            $row = $app->designGenome((string) ($_GET['hash'] ?? ''));
            if (!$row) {
                http_response_code(404);
                echo 'Unknown genome.';
                return;
            }
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="genome.json"');
            echo (string) $row['genome_json'];
            return;
        }
        if ($path === '/owner/designs/export') {
            $format = (string) ($_GET['format'] ?? 'jsonl');
            $rows = $app->designExportRows($task, 2000);
            header('Cache-Control: no-store');
            if ($format === 'csv') {
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="designs.csv"');
                echo "task_id,task_version,genome_hash,quality,neurons,synapses,spikes,eval_ms,worker_id,seed\n";
                foreach ($rows as $row) {
                    $score = json_decode((string) $row['score_json'], true);
                    $quality = is_array($score) && isset($score['quality']) ? $score['quality'] : '';
                    echo $row['task_id'] . ',' . $row['task_version'] . ',' . $row['genome_hash'] . ',' . $quality . ',' . $row['neurons'] . ',' . $row['synapses'] . ',' . $row['spikes'] . ',' . $row['eval_ms'] . ',' . $row['worker_id'] . ',' . $row['seed'] . "\n";
                }
                return;
            }
            header('Content-Type: application/x-ndjson; charset=utf-8');
            header('Content-Disposition: attachment; filename="designs.jsonl"');
            foreach ($rows as $row) {
                echo json_encode($row) . "\n";
            }
            return;
        }
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['task' => $task, 'top' => $app->topDesigns($task, 10)]);
        return;
    }
    if (str_starts_with($path, '/owner/') && $method === 'POST') {
        $session = $app->sessionById(coord_cookie('lab_owner'));
        if (!$session || $session['role'] !== 'owner') {
            http_response_code(403);
            echo 'Owner only.';
            return;
        }
        $csrf = (string) ($_POST['csrf'] ?? '');
        if ($csrf === '' || !hash_equals((string) $session['csrf'], $csrf)) {
            http_response_code(403);
            echo 'Missing or bad security token. Reload the owner page.';
            return;
        }
        if ($path === '/owner/project') {
            $app->setProject((string) ($_POST['id'] ?? ''), isset($_POST['priority']) ? (int) $_POST['priority'] : null, isset($_POST['enabled']));
        } elseif ($path === '/owner/job') {
            $app->createJob((string) ($_POST['template'] ?? ''), (string) ($_POST['title'] ?? ''), (float) ($_POST['priority'] ?? 0.5), (int) ($_POST['seed'] ?? 1));
        } elseif ($path === '/owner/revoke') {
            $app->revoke((string) ($_POST['id'] ?? ''));
        } elseif ($path === '/owner/requeue') {
            $app->requeue((string) ($_POST['id'] ?? ''));
        } elseif ($path === '/owner/project-create') {
            $app->createProject((string) ($_POST['title'] ?? ''), (string) ($_POST['summary'] ?? ''), (string) ($_POST['runner'] ?? ''), (int) ($_POST['priority'] ?? 1), isset($_POST['enabled']));
        } elseif ($path === '/owner/design-seed') {
            $app->seedJobFromDesigns((string) ($_POST['template'] ?? 'sf-vision'), (string) ($_POST['task'] ?? 'coincidence'), (int) ($_POST['count'] ?? 3), (int) ($_POST['seed'] ?? 7));
        } elseif ($path === '/owner/pause') {
            $paused = (string) ($_POST['paused'] ?? '');
            if ($paused !== '0' && $paused !== '1') {
                throw new InvalidArgumentException('Say whether the computer should pause.');
            }
            $app->setPaused((string) ($_POST['id'] ?? ''), $paused === '1');
        } else {
            http_response_code(404);
            echo 'Not found.';
            return;
        }
        header('Location: ' . $base . '/owner', true, 303);
        return;
    }
    if (str_starts_with($path, '/api/v1/') ) {
        $token = coord_bearer();
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'local');
        if (!$app->rateLimit('api:' . ($token !== '' ? hash('sha256', $token) : $ip), (int) $app->config['api_per_minute'])) {
            coord_json(429, ['error' => 'Slow down.']);
            return;
        }
        $worker = $app->workerByToken($token);
        if (!$worker) {
            coord_json(401, ['error' => 'Unknown or revoked worker token.']);
            return;
        }
        if ($path === '/api/v1/designs' && $method === 'POST') {
            $body = [];
        } else {
            $body = $method === 'POST' ? coord_body() : [];
        }
        if ($path === '/api/v1/heartbeat' && $method === 'POST') {
            $sent = (string) ($body['codeHash'] ?? '');
            if ($sent !== '' && !$app->codeApproved($sent)) {
                coord_json(409, ['error' => 'This worker build is not an approved code version.']);
                return;
            }
            $extra = [];
            if (isset($body['progress']) && $body['progress'] !== '' && $body['progress'] !== null && is_numeric($body['progress'])) {
                $extra['progress'] = (int) $body['progress'];
            }
            coord_json(200, $app->heartbeat($worker, $extra));
            return;
        }
        if ($path === '/api/v1/designs' && $method === 'POST') {
            $raw = file_get_contents('php://input') ?: '';
            if (strlen($raw) > 65536) {
                coord_json(413, ['error' => 'Upload is too large.']);
                return;
            }
            $encoding = strtolower((string) ($_SERVER['HTTP_CONTENT_ENCODING'] ?? ''));
            if ($encoding === 'gzip') {
                $raw = gzdecode($raw);
                if ($raw === false || strlen($raw) > 100000) {
                    coord_json(400, ['error' => 'Design upload could not be read.']);
                    return;
                }
            }
            $data = json_decode($raw, true);
            if (!is_array($data) || !isset($data['records']) || !is_array($data['records'])) {
                coord_json(400, ['error' => 'Send a records list.']);
                return;
            }
            $sent = (string) ($data['codeHash'] ?? '');
            if ($sent !== '' && !$app->codeApproved($sent)) {
                coord_json(409, ['error' => 'This worker build is not an approved code version.']);
                return;
            }
            coord_json(200, $app->ingestDesigns($worker, $data['records'], $sent !== '' ? $sent : $app->protocolHash()));
            return;
        }
        if ($path === '/api/v1/claim' && $method === 'POST') {
            if (!$app->codeApproved((string) ($body['codeHash'] ?? ''))) {
                coord_json(409, ['error' => 'Code hash is not approved. Nothing was assigned.']);
                return;
            }
            $worker['code_hash'] = (string) $body['codeHash'];
            $job = $app->claim($worker);
            coord_json(200, ['job' => $job]);
            return;
        }
        if ($path === '/api/v1/result' && $method === 'POST') {
            $app->submitResult($worker, (string) ($body['jobId'] ?? ''), is_array($body['result'] ?? null) ? $body['result'] : []);
            coord_json(200, ['ok' => true]);
            return;
        }
        coord_json(404, ['error' => 'Not found.']);
        return;
    }
    http_response_code(404);
    echo 'Not found.';
} catch (InvalidArgumentException $e) {
    if (str_starts_with($path, '/api/')) {
        coord_json(400, ['error' => $e->getMessage()]);
    } elseif ($path === '/join/setup') {
        http_response_code(400);
        header('Cache-Control: no-store');
        echo $e->getMessage();
    } elseif (str_starts_with($path, '/owner') && $method === 'POST') {
        $session = $app->sessionById(coord_cookie('lab_owner'));
        http_response_code(400);
        if ($session && $session['role'] === 'owner') {
            coord_html(pageOwner($app, (string) $session['csrf'], coord_who($app, 'owner'), $e->getMessage()));
        } else {
            echo $e->getMessage();
        }
    } else {
        http_response_code(400);
        coord_html(pageJoin($app, $e->getMessage(), coord_who($app, 'join')));
    }
}
