<?php
declare(strict_types=1);
require __DIR__ . '/private/src/compat.php';

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
    if (($path === '/' || $path === '/explore') && $method === 'GET') {
        $html = (string) file_get_contents((string) $app->config['lab_html']);
        $html = str_replace('/spikefoundry/engine.js', $base . '/assets/engine.js', $html);
        $html = str_replace('src="engine.js"', 'src="' . h($base . '/assets/engine.js') . '"', $html);
        coord_html($html);
        return;
    }
    if ($path === '/join' && $method === 'GET') {
        coord_html(pageJoin($app));
        return;
    }
    if ($path === '/join' && $method === 'POST') {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'local');
        if (!$app->rateLimit('join:' . $ip, (int) $app->config['login_per_minute'])) {
            coord_html(pageJoin($app, 'Too many enrollments from this network. Wait a minute.'));
            return;
        }
        $projects = isset($_POST['project']) && is_array($_POST['project']) ? array_map('strval', $_POST['project']) : [];
        $made = $app->enroll((string) ($_POST['name'] ?? ''), $projects, (int) ($_POST['max'] ?? 2), isset($_POST['consent']));
        $session = $app->session('participant', $made['workerId']);
        coord_set_cookie('lab_participant', $session['id'], $base);
        coord_html(pageToken($app, $made['name'], $made['token']));
        return;
    }
    if ($path === '/me' && $method === 'GET') {
        $session = $app->sessionById(coord_cookie('lab_participant'));
        if (!$session || $session['role'] !== 'participant') {
            coord_html(pageJoin($app, 'Enroll this computer to see its own work.'));
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
        coord_html(pageMe($app, $worker, $app->currentLease((string) $worker['id']), $app->history((string) $worker['id'])));
        return;
    }
    if ($path === '/me/pause' && $method === 'POST') {
        $session = $app->sessionById(coord_cookie('lab_participant'));
        if (!$session || $session['role'] !== 'participant') {
            http_response_code(403);
            echo 'Participants only.';
            return;
        }
        $st = $app->db->prepare('SELECT paused FROM workers WHERE id = ?');
        $st->execute([$session['subject']]);
        $row = $st->fetch();
        $app->setPaused((string) $session['subject'], !((int) ($row['paused'] ?? 0) === 1));
        header('Location: ' . $base . '/me', true, 303);
        return;
    }
    if ($path === '/owner/login' && $method === 'GET') {
        coord_html(pageLogin($app));
        return;
    }
    if ($path === '/owner/login' && $method === 'POST') {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'local');
        if (!$app->rateLimit('login:' . $ip, (int) $app->config['login_per_minute'])) {
            coord_html(pageLogin($app, 'Too many tries. Wait a minute.'));
            return;
        }
        $session = $app->login((string) ($_POST['username'] ?? ''), (string) ($_POST['password'] ?? ''));
        if (!$session) {
            coord_html(pageLogin($app, 'Name or password is wrong.'));
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
        coord_html(pageOwner($app, (string) $session['csrf']));
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
        $body = $method === 'POST' ? coord_body() : [];
        if ($path === '/api/v1/heartbeat' && $method === 'POST') {
            $sent = (string) ($body['codeHash'] ?? '');
            if ($sent !== '' && !hash_equals($app->protocolHash(), $sent)) {
                coord_json(409, ['error' => 'This worker build is not an approved code version.']);
                return;
            }
            coord_json(200, $app->heartbeat($worker));
            return;
        }
        if ($path === '/api/v1/claim' && $method === 'POST') {
            if (!hash_equals($app->protocolHash(), (string) ($body['codeHash'] ?? ''))) {
                coord_json(409, ['error' => 'Code hash is not approved. Nothing was assigned.']);
                return;
            }
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
    } else {
        http_response_code(400);
        coord_html(pageJoin($app, $e->getMessage()));
    }
}
