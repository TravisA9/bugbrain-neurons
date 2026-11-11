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

function coord_set_cookie(string $name, string $value, string $base, int $ttl = 86400): void
{
    setcookie($name, $value, ['expires' => time() + $ttl, 'path' => ($base === '' ? '/' : $base . '/'), 'httponly' => true, 'samesite' => 'Lax']);
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

/** A one-hour "curl ... | sh" command for a computer whose token is known right now (just enrolled or just rotated). */
function coord_setup_command(App $app, string $token): array
{
    $worker = $app->workerByToken($token);
    if (!$worker) {
        return ['command' => '', 'expires' => ''];
    }
    $made = $app->makeSetupCode((string) $worker['id'], $token);
    $url = coord_public_url($app) . '/s/' . $made['code'];
    return ['command' => '(curl -fsSL ' . $url . ' || wget -qO- ' . $url . ') | sh', 'expires' => $made['expires']];
}

/** The participant session plus the participant id, or null. */
function coord_participant(App $app): ?array
{
    $session = $app->sessionById(coord_cookie('lab_participant'));
    if (!$session || $session['role'] !== 'participant') {
        return null;
    }
    $st = $app->db->prepare('SELECT * FROM workers WHERE id = ?');
    $st->execute([$session['subject']]);
    $self = $st->fetch();
    if (!$self) {
        return null;
    }
    return ['session' => $session, 'pid' => $app->ensureParticipant($self)];
}

/** Computers linked to this browser's participant session, or null when there is none. */
function coord_my_computers(App $app): ?array
{
    $part = coord_participant($app);
    return $part ? $app->computersFor($part['pid']) : null;
}

function coord_owner_session(App $app): ?array
{
    $session = $app->sessionById(coord_cookie('lab_owner'));
    if (!$session || $session['role'] !== 'owner') {
        return null;
    }
    return $session;
}

/** Computers this visitor should see on Home: the participant cookie's computers, plus any the signed-in owner marked for My computer. */
function coord_home_computers(App $app): array
{
    $out = [];
    $seen = [];
    $part = coord_participant($app);
    if ($part) {
        foreach ($app->computersFor($part['pid']) as $w) {
            $id = (string) $w['id'];
            $out[] = $w;
            $seen[$id] = true;
        }
    }
    if (coord_owner_session($app)) {
        foreach ($app->ownerHomeComputers() as $w) {
            $id = (string) $w['id'];
            if (!isset($seen[$id])) {
                $out[] = $w;
            }
        }
    }
    return $out;
}

/** True when this POST's CSRF belongs to a session that may control this computer from Home. */
function coord_may_control(App $app, string $workerId, string $csrf): bool
{
    if ($csrf === '') {
        return false;
    }
    $part = coord_participant($app);
    if ($part && hash_equals((string) $part['session']['csrf'], $csrf) && $app->workerOwns($part['pid'], $workerId)) {
        return true;
    }
    $owner = coord_owner_session($app);
    if ($owner && hash_equals((string) $owner['csrf'], $csrf) && $app->isOwnerHome($workerId)) {
        return true;
    }
    return false;
}

function coord_wants_json(): bool
{
    return stripos((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json') !== false;
}

function coord_home_url(string $base, string $anchor = ''): string
{
    return ($base === '' ? '/' : $base . '/') . ($anchor !== '' ? '#' . $anchor : '');
}

/** Saves Off / Allowance / Full blast for one computer and answers the page script or the plain form. */
function coord_save_resources(App $app, string $workerId, string $back): void
{
    $mode = (string) ($_POST['mode'] ?? '');
    $pct = isset($_POST['pct']) && is_numeric($_POST['pct']) ? (int) $_POST['pct'] : null;
    $maxJobs = null;
    if (isset($_POST['jobs'])) {
        $maxJobs = $_POST['jobs'] === 'auto' ? 0 : (is_numeric($_POST['jobs']) ? (int) $_POST['jobs'] : null);
    }
    try {
        $app->setResources($workerId, $mode, $pct, $maxJobs);
        $app->noteRestartRequest($workerId, $mode);
    } catch (InvalidArgumentException $e) {
        if (coord_wants_json()) {
            coord_json(400, ['ok' => false, 'error' => $e->getMessage()]);
            return;
        }
        throw $e;
    }
    $st = $app->db->prepare('SELECT * FROM workers WHERE id = ?');
    $st->execute([$workerId]);
    $row = $st->fetch() ?: [];
    $res = $app->resourcesOf($row);
    if (coord_wants_json()) {
        $state = describeWorker($app, $row, $app->leasesOf($workerId));
        coord_json(200, ['ok' => true, 'mode' => $res['mode'], 'pct' => $res['allowancePct'], 'jobs' => $res['maxJobs']] + runFields($state));
        return;
    }
    header('Location: ' . $back, true, 303);
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

function coord_body(int $maxBytes = 65536): array
{
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1) ?: '';
    if (strlen($raw) > $maxBytes) {
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
    if ($path === '/assets/computelab.css' && $method === 'GET') {
        header('Content-Type: text/css; charset=utf-8');
        header('Cache-Control: public, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        echo labCss();
        return;
    }
    $icons = [
        '/favicon.svg' => ['favicon.svg', 'image/svg+xml'],
        '/favicon.ico' => ['favicon.ico', 'image/x-icon'],
        '/apple-touch-icon.png' => ['apple-touch-icon.png', 'image/png'],
        '/icon-192.png' => ['icon-192.png', 'image/png'],
        '/icon-512.png' => ['icon-512.png', 'image/png'],
    ];
    if (isset($icons[$path]) && ($method === 'GET' || $method === 'HEAD')) {
        $file = $private . '/assets/icons/' . $icons[$path][0];
        if (!is_file($file)) {
            coord_json(404, ['ok' => false, 'error' => 'Not found.']);
            return;
        }
        header('Content-Type: ' . $icons[$path][1]);
        header('Cache-Control: public, max-age=604800');
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . filesize($file));
        if ($method === 'GET') {
            readfile($file);
        }
        return;
    }
    if (preg_match('#^/assets/power/(off|half-power|full-blast)\.(webp|png)$#', $path, $pm) && ($method === 'GET' || $method === 'HEAD')) {
        $file = $private . '/assets/power/' . $pm[1] . '.' . $pm[2];
        if (!is_file($file)) {
            coord_json(404, ['ok' => false, 'error' => 'Not found.']);
            return;
        }
        header('Content-Type: ' . ($pm[2] === 'webp' ? 'image/webp' : 'image/png'));
        header('Cache-Control: public, max-age=604800');
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . filesize($file));
        if ($method === 'GET') {
            readfile($file);
        }
        return;
    }
    if ($path === '/manifest.webmanifest' && $method === 'GET') {
        header('Content-Type: application/manifest+json; charset=utf-8');
        header('Cache-Control: public, max-age=86400');
        echo json_encode(webManifest($base), JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        return;
    }
    if ($path === '/' && $method === 'GET') {
        coord_html(pageHome($app, coord_who($app, 'home'), coord_home_computers($app)));
        return;
    }
    if ($path === '/status.json' && $method === 'GET') {
        $live = $app->liveStatus();
        $mine = [];
        foreach (coord_home_computers($app) ?? [] as $w) {
            $state = describeWorker($app, $w, $app->leasesOf((string) $w['id']));
            $health = $app->healthOf($w);
            $mine[] = ['id' => (string) $w['id'], 'line' => $state['line'], 'effective' => $state['effective'], 'mode' => $state['mode'], 'pct' => $state['pct'], 'health' => (string) $health['line']] + runFields($state);
        }
        $live['mine'] = $mine;
        coord_json(200, $live);
        return;
    }
    if (($path === '/explore' || $path === '/lab') && $method === 'GET') {
        $html = (string) file_get_contents((string) $app->config['lab_html']);
        $html = str_replace('/spikefoundry/engine.js', $base . '/assets/engine.js', $html);
        $html = str_replace('src="engine.js"', 'src="' . h($base . '/assets/engine.js') . '"', $html);
        $bar = exploreBar($base, coord_who($app, 'explore'));
        $html = preg_replace('/<body([^>]*)>/i', '<body$1>' . $bar, $html, 1);
        $html = preg_replace('#</head>#i', exploreSkin($base) . '</head>', $html, 1);
        coord_html($html);
        return;
    }
    if ($path === '/discoveries' && $method === 'GET') {
        $ids = [];
        foreach (coord_home_computers($app) ?? [] as $w) {
            $ids[] = (string) $w['id'];
        }
        $archive = ($_GET['archive'] ?? '') === '1';
        if (($_GET['refresh'] ?? '') === '1') {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: private, no-store');
            echo pageDiscoveries($app, coord_who($app, 'discoveries'), $ids, $archive, true);
            return;
        }
        coord_html(pageDiscoveries($app, coord_who($app, 'discoveries'), $ids, $archive));
        return;
    }
    if ($path === '/discoveries/genome' && $method === 'GET') {
        $hash = (string) ($_GET['hash'] ?? '');
        $row = $app->designGenome($hash);
        $ids = [];
        foreach (coord_home_computers($app) ?? [] as $w) {
            $ids[] = (string) $w['id'];
        }
        $who = coord_who($app, 'discoveries');
        if (!$row || !$app->genomeVisibleTo($hash, (bool) $who['owner'], $ids)) {
            http_response_code(404);
            echo 'That genome is not public.';
            return;
        }
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store');
        echo (string) $row['genome_json'];
        return;
    }
    if (preg_match('#^/s/([A-Za-z0-9]{16,40})$#', $path, $m) && $method === 'GET') {
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'local');
        if (!$app->rateLimit('setup:' . $ip, (int) $app->config['login_per_minute'])) {
            echo "echo 'Too many setup downloads from this network. Wait a minute and run the command again.'; exit 1\n";
            return;
        }
        $token = $app->tokenForSetupCode($m[1]);
        if ($token === null) {
            echo "echo 'This Compute Lab setup command has expired or was replaced. Get a new one from My computer on the Compute Lab page.'; exit 1\n";
            return;
        }
        echo setup_script('unix', $token, coord_public_url($app), $app->workerRepo(), $app->workerRef());
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
            coord_html(pageJoin($app, 'Too many enrollments from this network. Wait a minute.', coord_who($app, 'join')));
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
        $made = $app->enroll((string) ($_POST['name'] ?? ''), $projects, (int) ($_POST['max'] ?? 20), isset($_POST['consent']), $participantId);
        $session = $app->session('participant', $made['workerId']);
        coord_set_cookie('lab_participant', $session['id'], $base, App::PARTICIPANT_SESSION_SECONDS);
        header('Cache-Control: no-store');
        $who = coord_who($app, 'join');
        $who['participant'] = true;
        $who['participantCsrf'] = (string) $session['csrf'];
        $cmd = coord_setup_command($app, $made['token']);
        coord_html(pageToken($app, $made['name'], $made['token'], $who, $cmd['command'], $cmd['expires']));
        return;
    }
    if ($path === '/me' && $method === 'GET') {
        header('Location: ' . coord_home_url($base, 'my-computer'), true, 303);
        return;
    }
    if ($path === '/me/resources' && $method === 'POST') {
        $csrf = (string) ($_POST['csrf'] ?? '');
        $target = (string) ($_POST['id'] ?? '');
        if (!coord_may_control($app, $target, $csrf)) {
            coord_json(403, ['ok' => false, 'error' => 'Your session ended, or that computer is not yours. Reload the page.']);
            return;
        }
        coord_save_resources($app, $target, coord_home_url($base, 'my-computer'));
        return;
    }
    if ($path === '/me/pause' && $method === 'POST') {
        $csrf = (string) ($_POST['csrf'] ?? '');
        $target = (string) ($_POST['id'] ?? '');
        if ($target === '') {
            $part = coord_participant($app);
            $target = $part ? (string) $part['session']['subject'] : '';
        }
        if (!coord_may_control($app, $target, $csrf)) {
            http_response_code(403);
            echo 'Your session ended, or that computer is not yours. Reload the page.';
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
        header('Location: ' . coord_home_url($base, 'my-computer'), true, 303);
        return;
    }
    if ($path === '/me/setup-command' && $method === 'POST') {
        $csrf = (string) ($_POST['csrf'] ?? '');
        $target = (string) ($_POST['id'] ?? '');
        if (!coord_may_control($app, $target, $csrf)) {
            http_response_code(403);
            echo 'Your session ended, or that computer is not yours. Reload the page.';
            return;
        }
        $row = $app->db->prepare('SELECT name FROM workers WHERE id = ?');
        $row->execute([$target]);
        $name = (string) $row->fetchColumn();
        $token = $app->rotateToken($target);
        $cmd = coord_setup_command($app, $token);
        header('Cache-Control: no-store');
        coord_html(pageToken($app, $name, $token, coord_who($app, 'me'), $cmd['command'], $cmd['expires']));
        return;
    }
    if ($path === '/me/credit' && $method === 'POST') {
        $csrf = (string) ($_POST['csrf'] ?? '');
        $target = (string) ($_POST['id'] ?? '');
        if (!coord_may_control($app, $target, $csrf)) {
            http_response_code(403);
            echo 'Your session ended, or that computer is not yours. Reload the page.';
            return;
        }
        $st = $app->db->prepare('SELECT * FROM workers WHERE id = ?');
        $st->execute([$target]);
        $self = $st->fetch();
        if ($self) {
            $app->setCredit($app->ensureParticipant($self), (string) ($_POST['shown'] ?? '1') === '1');
        }
        header('Location: ' . coord_home_url($base, 'my-computer'), true, 303);
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
            coord_html(pageLogin($app, '', coord_who($app, 'login')));
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
    if ($path === '/owner/inverse-experiment.json' && $method === 'GET') {
        if (!coord_owner_session($app)) {
            coord_json(403, ['error' => 'Owner only.']);
            return;
        }
        $report = $app->inverseExperimentReport((int) ($_GET['seed'] ?? 0));
        coord_json($report ? 200 : 404, $report ?? ['error' => 'No completed inverse experiment.']);
        return;
    }
    if ($path === '/owner/sequence-experiment.json' && $method === 'GET') {
        if (!coord_owner_session($app)) {
            coord_json(403, ['error' => 'Owner only.']);
            return;
        }
        $report = $app->sequenceExperimentReport((string) ($_GET['job'] ?? ''));
        coord_json($report ? 200 : 404, $report ?? ['error' => 'No completed sequence experiment.']);
        return;
    }
    if ($path === '/owner/run.json' && $method === 'GET') {
        $session = $app->sessionById(coord_cookie('lab_owner'));
        if (!$session || $session['role'] !== 'owner') {
            coord_json(403, ['ok' => false, 'error' => 'Owner only.']);
            return;
        }
        $out = [];
        foreach ($app->db->query('SELECT * FROM workers WHERE revoked = 0 AND removed_at IS NULL')->fetchAll() as $w) {
            $state = describeWorker($app, $w, $app->leasesOf((string) $w['id']));
            $out[] = ['id' => (string) $w['id'], 'line' => $state['line'], 'effective' => $state['effective'],
                'tone' => ownerTone($state), 'jobsLine' => ownerJobsLine($state),
                'seen' => $state['ago'] !== '' ? 'Last seen ' . $state['ago'] : 'Not seen yet',
                'healthHtml' => ownerHealthNote($app->healthOf($w))] + runFields($state);
        }
        coord_json(200, ['ok' => true, 'computers' => $out]);
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
        if ($path === '/owner/setup-command') {
            $target = (string) ($_POST['id'] ?? '');
            $row = $app->db->prepare('SELECT name FROM workers WHERE id = ?');
            $row->execute([$target]);
            $name = (string) $row->fetchColumn();
            $token = $app->rotateToken($target);
            $cmd = coord_setup_command($app, $token);
            header('Cache-Control: no-store');
            coord_html(pageToken($app, $name, $token, coord_who($app, 'owner'), $cmd['command'], $cmd['expires']));
            return;
        }
        if ($path === '/owner/resources') {
            $target = (string) ($_POST['id'] ?? '');
            $chk = $app->db->prepare('SELECT id FROM workers WHERE id = ? AND revoked = 0');
            $chk->execute([$target]);
            if (!$chk->fetch()) {
                throw new InvalidArgumentException('That computer is unknown or revoked.');
            }
            coord_save_resources($app, $target, $base . '/owner#computers');
            return;
        }
        if ($path === '/owner/owner-home') {
            $app->setOwnerHome((string) ($_POST['id'] ?? ''), (string) ($_POST['shown'] ?? '0') === '1');
            header('Location: ' . $base . '/owner#computers', true, 303);
            return;
        }
        if ($path === '/owner/project') {
            $app->setProject((string) ($_POST['id'] ?? ''), isset($_POST['priority']) ? (int) $_POST['priority'] : null, isset($_POST['enabled']));
        } elseif ($path === '/owner/job') {
            $app->createJob((string) ($_POST['template'] ?? ''), (string) ($_POST['title'] ?? ''), (float) ($_POST['priority'] ?? 0.5), (int) ($_POST['seed'] ?? 1));
        } elseif ($path === '/owner/sequence-study') {
            $app->queueSequenceStudy((int) ($_POST['seed'] ?? 0));
        } elseif ($path === '/owner/revoke') {
            $app->revoke((string) ($_POST['id'] ?? ''));
        } elseif ($path === '/owner/remove-computer') {
            if (!$app->removeRevoked((string) ($_POST['id'] ?? ''))) {
                throw new InvalidArgumentException('Only a revoked computer can be removed.');
            }
        } elseif ($path === '/owner/requeue') {
            $app->requeue((string) ($_POST['id'] ?? ''));
        } elseif ($path === '/owner/project-create') {
            $app->createProject((string) ($_POST['title'] ?? ''), (string) ($_POST['summary'] ?? ''), (string) ($_POST['runner'] ?? ''), (int) ($_POST['priority'] ?? 1), isset($_POST['enabled']));
        } elseif ($path === '/owner/supply') {
            $app->saveSupply((string) ($_POST['id'] ?? ''), isset($_POST['auto']), (int) ($_POST['low'] ?? 0), (int) ($_POST['cap'] ?? 8), (int) ($_POST['evals'] ?? 0), (int) ($_POST['seconds'] ?? 180), (int) ($_POST['keep'] ?? 50), (int) ($_POST['random'] ?? 500));
        } elseif ($path === '/owner/task-policy') {
            $app->saveTaskPolicy((string) ($_POST['project'] ?? ''), (string) ($_POST['task'] ?? ''), (float) ($_POST['delta'] ?? 0.005), (int) ($_POST['evals'] ?? 3000), (float) ($_POST['hours'] ?? 6), (string) ($_POST['action'] ?? 'flag'), isset($_POST['solve_score']) ? isset($_POST['auto_advance']) : null, isset($_POST['solve_score']) ? (float) $_POST['solve_score'] : null, isset($_POST['solve_jobs']) ? (int) $_POST['solve_jobs'] : null);
        } elseif ($path === '/owner/design-public') {
            $app->setGenomePublic((string) ($_POST['hash'] ?? ''), (string) ($_POST['shown'] ?? '0') === '1');
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
        $bucket = ($path === '/api/v1/designs')
            ? 'design:' . ($token !== '' ? hash('sha256', $token) : $ip)
            : 'api:' . ($token !== '' ? hash('sha256', $token) : $ip);
        $limit = ($path === '/api/v1/designs')
            ? (int) ($app->config['design_per_minute'] ?? 60)
            : (int) $app->config['api_per_minute'];
        if (!$app->rateLimit($bucket, $limit)) {
            header('Retry-After: 30');
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
            $body = $method === 'POST' ? coord_body($path === '/api/v1/sequence-checkpoint' ? 530000 : 65536) : [];
        }
        if ($path === '/api/v1/diagnostics' && $method === 'POST') {
            if (!$app->rateLimit('diag:' . hash('sha256', $token), 20)) {
                header('Retry-After: 60');
                coord_json(429, ['error' => 'Too many reports.']);
                return;
            }
            coord_json(200, $app->saveDiagnostics((string) $worker['id'], $body, $token));
            return;
        }
        // Setup found this (valid) token already on the computer: keep this entry, retire the unused new one.
        if ($path === '/api/v1/setup/existing' && $method === 'POST') {
            $newToken = is_string($body['newToken'] ?? null) ? (string) $body['newToken'] : '';
            coord_json(200, $app->keepExistingEntry($worker, $newToken));
            return;
        }
        if ($path === '/api/v1/heartbeat' && $method === 'POST') {
            $sent = (string) ($body['codeHash'] ?? '');
            if ($sent !== '' && !$app->codeApproved($sent)) {
                $app->noteReject((string) $worker['id'], 'protocol');
                coord_json(409, ['error' => 'This worker build is not an approved code version.']);
                return;
            }
            if (!empty($worker['last_reject'])) {
                $app->db->prepare('UPDATE workers SET last_reject = NULL WHERE id = ?')->execute([(string) $worker['id']]);
            }
            $extra = [];
            if (isset($body['progress']) && $body['progress'] !== '' && $body['progress'] !== null && is_numeric($body['progress'])) {
                $extra['progress'] = (int) $body['progress'];
            }
            if (isset($body['jobId']) && is_string($body['jobId']) && preg_match('/^[a-z0-9._-]{2,64}$/', $body['jobId'])) {
                $extra['jobId'] = $body['jobId'];
            }
            if (!empty($body['control'])) {
                $extra['control'] = true;
            }
            if (!empty($body['reset']) && empty($body['setupCheck'])) {
                $extra['reset'] = true;
            }
            if (isset($body['runtime']) && is_array($body['runtime'])) {
                $extra['runtime'] = $body['runtime'];
            }
            coord_json(200, $app->heartbeat($worker, $extra));
            return;
        }
        if ($path === '/api/v1/designs' && $method === 'POST') {
            $raw = file_get_contents('php://input') ?: '';
            if (strlen($raw) > 1500000) {
                coord_json(413, ['error' => 'Upload is too large.']);
                return;
            }
            $encoding = strtolower((string) ($_SERVER['HTTP_CONTENT_ENCODING'] ?? ''));
            if ($encoding === 'gzip') {
                $raw = gzdecode($raw);
                if ($raw === false || strlen($raw) > 2000000) {
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
            if (isset($data['summary']) && is_array($data['summary'])) {
                if (!isset($data['summary']['jobId']) && isset($data['records'][0]['jobId'])) {
                    $data['summary']['jobId'] = $data['records'][0]['jobId'];
                }
                $app->ingestSummary($worker, $data['summary']);
            }
            coord_json(200, $app->ingestDesigns($worker, $data['records'], $sent !== '' ? $sent : $app->protocolHash()));
            return;
        }
        if ($path === '/api/v1/model' && $method === 'GET') {
            $row = $app->currentModel();
            if (!$row) {
                coord_json(404, ['error' => 'No model checkpoint yet.']);
                return;
            }
            coord_json(200, ['id' => $row['id'], 'metrics' => json_decode((string) $row['metric_json'], true), 'model' => json_decode((string) $row['body_json'], true)]);
            return;
        }
        if ($path === '/api/v1/model' && $method === 'POST') {
            if (strlen(json_encode($body)) > 60000) {
                coord_json(413, ['error' => 'Model checkpoint is too large.']);
                return;
            }
            $id = $app->saveModel($worker, (string) ($body['jobId'] ?? ''), json_encode(isset($body['model']) ? $body['model'] : []), is_array($body['metrics'] ?? null) ? $body['metrics'] : []);
            coord_json(200, ['id' => $id]);
            return;
        }
        if ($path === '/api/v1/claim' && $method === 'POST') {
            if (!$app->codeApproved((string) ($body['codeHash'] ?? ''))) {
                $app->noteReject((string) $worker['id'], 'protocol');
                coord_json(409, ['error' => 'Code hash is not approved. Nothing was assigned.']);
                return;
            }
            $worker['code_hash'] = (string) $body['codeHash'];
            $slot = isset($body['slot']) && is_numeric($body['slot']) ? (int) $body['slot'] : 0;
            $job = $app->claim($worker, $slot, ($body['sequenceExperiment'] ?? false) === true, (int) ($body['studyVersion'] ?? 1),
                ($body['inverseExperiment'] ?? false) === true, ($body['inverseGallery'] ?? false) === true);
            coord_json(200, ['job' => $job]);
            return;
        }
        if ($path === '/api/v1/sequence-checkpoint' && $method === 'POST') {
            $snapshot = is_array($body['snapshot'] ?? null) ? $body['snapshot'] : null;
            coord_json(200, ['snapshot' => $app->sequenceCheckpoint($worker, (string) ($body['jobId'] ?? ''), $snapshot)]);
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
