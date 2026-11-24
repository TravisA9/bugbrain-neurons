<?php
declare(strict_types=1);

/*
 * Server-defined experiments (off unless config 'experiments_enabled' is true).
 *
 * An experiment is one JSON file in private/experiments/ (see EXPERIMENTS.md). It names the worker runner,
 * the worker experiment protocol it needs, a base design (the champion, which is also the control arm),
 * either a one-parameter search range or fixed arms, the tasks and metric, how many tuning and confirmation
 * seeds, and the pass bar. Volunteers choose nothing: the server plans every run from the spec plus the runs
 * already finished, hands them to computers that can run them, aggregates the results, and proposes follow-ups.
 *
 * Planning is a pure function of (spec, runs), so it is deterministic and testable:
 *   tune    : control + the two extremes of the search range on the tuning seeds (primary task only);
 *             then bisect: midpoints between the best point and each neighbour, until maxPoints or minGap;
 *   confirm : the best point (or every fixed arm) vs control on the fresh confirmation seeds, every task;
 *   verdict : pass / fail against the pre-registered bar (paired deltas, t, wins, worst seed, guard tasks).
 */
final class Experiments
{
    public const PROTOCOL = 1;
    public const RESULT_VERSION = 'bb-exp-1';
    public const RUNNERS = ['run/exp.js'];
    public const MAX_RUN_FAILURES = 2;
    private const PARAM_RE = '/^(P\.[A-Za-z][A-Za-z0-9]*|[a-z]{1,8}\.[A-Za-z][A-Za-z0-9]*(@[!A-Za-z0-9_-]{1,24})?)$/';

    /** @return array{specs: array<string, array>, errors: array<string, list<string>>} */
    public static function load(string $dir): array
    {
        $specs = [];
        $errors = [];
        foreach (is_dir($dir) ? (glob(rtrim($dir, '/') . '/*.json') ?: []) : [] as $file) {
            $base = basename($file, '.json');
            if ($base === 'CATALOG') {
                continue;
            }
            $spec = json_decode((string) file_get_contents($file), true);
            if (!is_array($spec)) {
                $errors[$base] = ['not valid JSON'];
                continue;
            }
            $bad = self::validate($spec);
            if (($spec['id'] ?? '') !== $base) {
                $bad[] = 'id must match the file name';
            }
            if ($bad !== []) {
                $errors[$base] = $bad;
                continue;
            }
            $specs[$base] = $spec;
        }
        ksort($specs);
        return ['specs' => $specs, 'errors' => $errors];
    }

    /** @return list<string> */
    public static function validate(array $s): array
    {
        $e = [];
        if (!preg_match('/^[a-z0-9][a-z0-9-]{1,47}$/', (string) ($s['id'] ?? ''))) {
            $e[] = 'id: 2-48 lower-case letters, digits, hyphens';
        }
        if (!in_array($s['status'] ?? '', ['active', 'proposed', 'paused', 'retired'], true)) {
            $e[] = 'status: active, proposed, paused or retired';
        }
        if (array_key_exists('enabled', $s) && !is_bool($s['enabled'])) {
            $e[] = 'enabled: true or false (false = waits for config experiments_enable)';
        }
        if (!in_array($s['runner'] ?? '', self::RUNNERS, true)) {
            $e[] = 'runner: one of ' . implode(', ', self::RUNNERS);
        }
        $p = $s['protocol'] ?? null;
        if (!is_int($p) || $p < 1 || $p > self::PROTOCOL) {
            $e[] = 'protocol: 1..' . self::PROTOCOL;
        }
        if (!preg_match('/^[A-Za-z0-9_]{1,40}$/', (string) ($s['plan'] ?? ''))) {
            $e[] = 'plan: a genome plan name';
        }
        try {
            self::parseVariant((string) ($s['base'] ?? ''));
        } catch (InvalidArgumentException $x) {
            $e[] = 'base: ' . $x->getMessage();
        }
        $hasSearch = isset($s['search']);
        $hasArms = isset($s['arms']);
        if ($hasSearch === $hasArms) {
            $e[] = 'give exactly one of search or arms';
        }
        if ($hasSearch) {
            $q = $s['search'];
            if (!is_array($q) || !preg_match(self::PARAM_RE, (string) ($q['param'] ?? ''))) {
                $e[] = 'search.param: P.name or s.field[@sel]';
            } else {
                $lo = $q['lo'] ?? null;
                $hi = $q['hi'] ?? null;
                $scale = $q['scale'] ?? 'linear';
                if (!is_numeric($lo) || !is_numeric($hi) || (float) $lo >= (float) $hi) {
                    $e[] = 'search: numeric lo < hi';
                } elseif ($scale === 'log2' && (float) $lo <= 0) {
                    $e[] = 'search: log2 needs lo > 0';
                }
                if (!in_array($scale, ['linear', 'log2'], true)) {
                    $e[] = 'search.scale: linear or log2';
                }
                $mp = $q['maxPoints'] ?? 7;
                if (!is_int($mp) || $mp < 2 || $mp > 16) {
                    $e[] = 'search.maxPoints: 2..16';
                }
                if (!is_numeric($q['minGap'] ?? 0) || (float) ($q['minGap'] ?? 0) < 0) {
                    $e[] = 'search.minGap: >= 0';
                }
            }
        }
        if ($hasArms) {
            if (!is_array($s['arms']) || $s['arms'] === [] || count($s['arms']) > 8) {
                $e[] = 'arms: 1..8 arms';
            } else {
                foreach ($s['arms'] as $i => $arm) {
                    if (!is_array($arm) || !preg_match('/^[a-z0-9][a-z0-9_-]{0,23}$/', (string) ($arm['id'] ?? '')) || ($arm['id'] ?? '') === 'control') {
                        $e[] = "arms[$i].id: 1-24 lower-case letters, digits, _ or - (not control)";
                        continue;
                    }
                    if (!is_array($arm['set'] ?? null) || $arm['set'] === []) {
                        $e[] = "arms[$i].set: param => value map";
                        continue;
                    }
                    foreach ($arm['set'] as $k => $v) {
                        if (!preg_match(self::PARAM_RE, (string) $k) || !is_numeric($v)) {
                            $e[] = "arms[$i].set: bad $k";
                        }
                    }
                }
            }
        }
        $tasks = $s['tasks'] ?? null;
        $primary = 0;
        if (!is_array($tasks) || $tasks === [] || count($tasks) > 8) {
            $e[] = 'tasks: 1..8 tasks';
        } else {
            foreach ($tasks as $i => $t) {
                if (!is_array($t) || !preg_match('/^[a-z0-9][a-z0-9_-]{0,23}$/', (string) ($t['id'] ?? ''))
                    || !is_array($t['tj'] ?? null) || !is_string($t['tj']['env'] ?? null)
                    || !preg_match('/^[A-Za-z][A-Za-z0-9_]{0,23}$/', (string) ($t['metric'] ?? ''))) {
                    $e[] = "tasks[$i]: id, tj {env, params} and metric";
                    continue;
                }
                if (!empty($t['primary'])) {
                    $primary++;
                } elseif (!is_array($t['guard'] ?? null) || !is_numeric($t['guard']['maxDrop'] ?? null)) {
                    $e[] = "tasks[$i]: a non-primary task needs guard.maxDrop";
                }
                if (preg_match('/[\n\r;&|`$]/', json_encode($t['tj']))) {
                    $e[] = "tasks[$i].tj: characters the worker will not pass through";
                }
            }
            if ($primary !== 1) {
                $e[] = 'tasks: exactly one primary task';
            }
        }
        $seeds = $s['seeds'] ?? null;
        if (!is_array($seeds) || !is_int($seeds['tune'] ?? null) || !is_int($seeds['confirm'] ?? null)
            || $seeds['tune'] < 1 || $seeds['tune'] > 8 || $seeds['confirm'] < 4 || $seeds['confirm'] > 64) {
            $e[] = 'seeds: tune 1..8, confirm 4..64';
        }
        $pass = $s['pass'] ?? null;
        if (!is_array($pass)) {
            $e[] = 'pass: the pre-registered bar';
        } else {
            foreach (['meanDelta', 'minT', 'minWinFrac', 'perSeedFloor'] as $k) {
                if (!is_numeric($pass[$k] ?? null)) {
                    $e[] = "pass.$k: number";
                }
            }
        }
        $req = $s['requires'] ?? [];
        if (!is_array($req) || !is_numeric($req['memGB'] ?? 0) || !is_numeric($req['heapMB'] ?? 0)
            || (float) ($req['memGB'] ?? 0) < 0 || (int) ($req['heapMB'] ?? 0) < 0 || (int) ($req['heapMB'] ?? 0) > 32000) {
            $e[] = 'requires: memGB >= 0, heapMB 0..32000';
        }
        return $e;
    }

    /** "a=1,b@x=2" -> ordered [key => value]; throws on anything the worker would refuse. */
    public static function parseVariant(string $v): array
    {
        if ($v === '' || $v === 'base') {
            return [];
        }
        if (strlen($v) > 4000 || preg_match('/[\n\r;&|`$\s]/', $v)) {
            throw new InvalidArgumentException('variant has characters the worker will not pass through');
        }
        $out = [];
        foreach (explode(',', $v) as $kv) {
            $parts = explode('=', $kv);
            if (count($parts) !== 2 || !preg_match(self::PARAM_RE, $parts[0]) || !is_numeric($parts[1])) {
                throw new InvalidArgumentException('bad variant item ' . substr($kv, 0, 60));
            }
            $out[$parts[0]] = $parts[1];
        }
        return $out;
    }

    public static function variantWith(string $base, array $set): string
    {
        $kv = self::parseVariant($base);
        foreach ($set as $k => $v) {
            $kv[(string) $k] = self::num($v);
        }
        $out = [];
        foreach ($kv as $k => $v) {
            $out[] = $k . '=' . $v;
        }
        return implode(',', $out);
    }

    public static function num($v): string
    {
        $f = (float) $v;
        if ($f == floor($f) && abs($f) < 1e15) {
            return (string) (int) $f;
        }
        return rtrim(rtrim(sprintf('%.6g', $f), '0'), '.');
    }

    /** The control arm is the base design as it stands. */
    public static function armId($value): string
    {
        return 'p' . self::num($value);
    }

    /** @return array<string, string> arm id => variant, for every arm the spec can ever run */
    public static function armVariant(array $s, string $arm): ?string
    {
        if ($arm === 'control') {
            return (string) $s['base'];
        }
        if (isset($s['search'])) {
            if (!preg_match('/^p(-?[0-9.e+-]+)$/', $arm, $m) || !is_numeric($m[1])) {
                return null;
            }
            return self::variantWith((string) $s['base'], [$s['search']['param'] => $m[1]]);
        }
        foreach ($s['arms'] as $a) {
            if ($a['id'] === $arm) {
                return self::variantWith((string) $s['base'], $a['set']);
            }
        }
        return null;
    }

    public static function primaryTask(array $s): array
    {
        foreach ($s['tasks'] as $t) {
            if (!empty($t['primary'])) {
                return $t;
            }
        }
        throw new LogicException('validated spec has a primary task');
    }

    /**
     * Index runs: [arm][task][seed] => metric (done runs only), plus the set of every (arm|task|seed) already
     * planned in any state, so nothing is planned twice.
     * @param list<array{arm:string, task:string, seed:int, status:string, metric:?float}> $runs
     */
    private static function index(array $runs): array
    {
        $done = [];
        $planned = [];
        $fails = [];
        foreach ($runs as $r) {
            $key = $r['arm'] . '|' . $r['task'] . '|' . $r['seed'];
            if ($r['status'] === 'failed') {
                $fails[$key] = ($fails[$key] ?? 0) + 1;
                continue;
            }
            $planned[$key] = (string) $r['status'];
            if ($r['status'] === 'done' && $r['metric'] !== null && is_finite((float) $r['metric'])) {
                $done[$r['arm']][$r['task']][(int) $r['seed']] = (float) $r['metric'];
            }
        }
        return [$done, $planned, $fails];
    }

    /** Mean paired delta (arm - control) on a task over the given seeds; null until every seed of both is done. */
    private static function paired(array $done, string $arm, string $task, array $seeds): ?array
    {
        $d = [];
        foreach ($seeds as $k) {
            if (!isset($done[$arm][$task][$k], $done['control'][$task][$k])) {
                return null;
            }
            $d[$k] = $done[$arm][$task][$k] - $done['control'][$task][$k];
        }
        return $d;
    }

    public static function stats(array $deltas): array
    {
        $n = count($deltas);
        if ($n === 0) {
            return ['n' => 0, 'mean' => null, 'sd' => null, 't' => null, 'wins' => 0, 'losses' => 0, 'worst' => null, 'worstSeed' => null];
        }
        $vals = array_values($deltas);
        $mean = array_sum($vals) / $n;
        $var = 0.0;
        foreach ($vals as $x) {
            $var += ($x - $mean) ** 2;
        }
        $sd = $n > 1 ? sqrt($var / ($n - 1)) : 0.0;
        /* t is capped at +-999 (a zero spread with a non-zero mean is as clear as it gets; JSON has no infinity). */
        $t = $n < 2 ? null : ($sd > 0 ? max(-999.0, min(999.0, $mean / ($sd / sqrt($n)))) : ($mean == 0.0 ? 0.0 : ($mean > 0 ? 999.0 : -999.0)));
        $worstSeed = array_keys($deltas, min($vals))[0];
        return [
            'n' => $n, 'mean' => round($mean, 6), 'sd' => round($sd, 6), 't' => $t === null ? null : round($t, 3),
            'wins' => count(array_filter($vals, static fn ($x) => $x > 0)), 'losses' => count(array_filter($vals, static fn ($x) => $x < 0)),
            'worst' => round(min($vals), 6), 'worstSeed' => $worstSeed,
        ];
    }

    private static function toScale(array $q, float $v): float
    {
        return ($q['scale'] ?? 'linear') === 'log2' ? log($v, 2) : $v;
    }

    private static function fromScale(array $q, float $x): float
    {
        $v = ($q['scale'] ?? 'linear') === 'log2' ? 2 ** $x : $x;
        return !empty($q['integer']) ? (float) round($v) : (float) round($v, 6);
    }

    /** Search points in the order they were opened: extremes first, then bisection midpoints. */
    public static function searchState(array $s, array $done, array $tuneSeeds): array
    {
        $q = $s['search'];
        $task = self::primaryTask($s)['id'];
        $pts = [(float) $q['lo'], (float) $q['hi']];
        $baseKv = self::parseVariant((string) $s['base']);
        $controlValue = isset($baseKv[$q['param']]) ? (float) $baseKv[$q['param']] : null;
        $score = static function (float $v) use ($done, $task, $tuneSeeds, $controlValue): ?float {
            if ($controlValue !== null && abs($v - $controlValue) < 1e-12) {
                return 0.0;
            }
            $d = self::paired($done, self::armId($v), $task, $tuneSeeds);
            return $d === null ? null : array_sum($d) / count($d);
        };
        $maxPoints = (int) ($q['maxPoints'] ?? 7);
        $minGap = (float) ($q['minGap'] ?? 0);
        $guard = 0;
        while ($guard++ < 32) {
            $known = [];
            foreach ($pts as $v) {
                $sc = $score($v);
                if ($sc === null) {
                    return ['points' => $pts, 'pending' => true, 'best' => null, 'controlValue' => $controlValue, 'scores' => $known];
                }
                $known[self::num($v)] = $sc;
            }
            if ($controlValue !== null) {
                $known[self::num($controlValue)] = 0.0;
            }
            $vals = array_map('floatval', array_keys($known));
            sort($vals);
            $bestV = null;
            $bestS = -INF;
            foreach ($vals as $v) {
                if ($known[self::num($v)] > $bestS) {
                    $bestS = $known[self::num($v)];
                    $bestV = $v;
                }
            }
            $i = array_search($bestV, $vals, true);
            $cands = [];
            foreach ([$i - 1, $i + 1] as $j) {
                if ($j < 0 || $j >= count($vals)) {
                    continue;
                }
                $a = self::toScale($q, $bestV);
                $b = self::toScale($q, $vals[$j]);
                if (abs($a - $b) <= $minGap) {
                    continue;
                }
                $mid = self::fromScale($q, ($a + $b) / 2);
                if (isset($known[self::num($mid)]) || abs($mid - $bestV) < 1e-12 || abs($mid - $vals[$j]) < 1e-12) {
                    continue;
                }
                $cands[] = ['v' => $mid, 'nb' => $known[self::num($vals[$j])]];
            }
            usort($cands, static fn ($x, $y) => $y['nb'] <=> $x['nb']);
            $added = false;
            foreach ($cands as $c) {
                if (count($pts) >= $maxPoints) {
                    break;
                }
                $pts[] = $c['v'];
                $added = true;
            }
            if (!$added) {
                return ['points' => $pts, 'pending' => false, 'best' => $bestV, 'bestDelta' => $bestS,
                    'controlValue' => $controlValue, 'scores' => $known,
                    'atEdge' => $bestV !== null && (abs($bestV - (float) $q['lo']) < 1e-12 || abs($bestV - (float) $q['hi']) < 1e-12)];
            }
        }
        throw new LogicException('search did not settle');
    }

    /**
     * What should run next and where the experiment stands.
     * @param list<int> $seeds the experiment's seed block (tune seeds first, then confirmation seeds)
     * @param list<array> $runs every run already planned for this experiment
     * @return array{phase:string, need:list<array{arm:string, task:string, seed:int, variant:string, phase:string}>, report:array}
     */
    public static function plan(array $s, array $seeds, array $runs): array
    {
        [$done, $planned, $fails] = self::index($runs);
        $blocked = [];
        $nt = (int) $s['seeds']['tune'];
        $tune = array_slice($seeds, 0, $nt);
        $confirm = array_slice($seeds, $nt, (int) $s['seeds']['confirm']);
        $primary = self::primaryTask($s)['id'];
        $need = [];
        $add = static function (string $arm, string $task, int $seed, string $phase) use (&$need, &$blocked, $planned, $fails, $s): void {
            $key = $arm . '|' . $task . '|' . $seed;
            if (isset($planned[$key])) {
                return;
            }
            if (($fails[$key] ?? 0) >= self::MAX_RUN_FAILURES) {
                $blocked[] = $key;
                return;
            }
            $v = self::armVariant($s, $arm);
            if ($v !== null) {
                $need[] = ['arm' => $arm, 'task' => $task, 'seed' => $seed, 'variant' => $v, 'phase' => $phase];
            }
        };
        $report = ['id' => $s['id'], 'title' => (string) ($s['title'] ?? $s['id']), 'goal' => (string) ($s['goal'] ?? ''),
            'tuneSeeds' => $tune, 'confirmSeeds' => $confirm];
        $finalists = [];
        if (isset($s['search'])) {
            $st = self::searchState($s, $done, $tune);
            $report['search'] = ['param' => $s['search']['param'], 'points' => array_map([self::class, 'num'], $st['points']),
                'scores' => $st['scores'], 'controlValue' => $st['controlValue'], 'best' => $st['best'] === null ? null : self::num($st['best'])];
            if ($st['pending']) {
                foreach ($tune as $k) {
                    $add('control', $primary, $k, 'tune');
                    foreach ($st['points'] as $v) {
                        if ($st['controlValue'] === null || abs($v - $st['controlValue']) > 1e-12) {
                            $add(self::armId($v), $primary, $k, 'tune');
                        }
                    }
                }
                if ($blocked !== []) {
                    return self::blockedResult($report, $blocked);
                }
                return ['phase' => 'tune', 'need' => $need, 'report' => $report + ['phase' => 'tune', 'verdict' => 'running']];
            }
            $report['search']['atEdge'] = $st['atEdge'];
            if ($st['best'] === null || ($st['controlValue'] !== null && abs($st['best'] - $st['controlValue']) < 1e-12) || $st['bestDelta'] <= 0) {
                return ['phase' => 'done', 'need' => [], 'report' => $report + ['phase' => 'done', 'verdict' => 'no-gain',
                    'note' => 'No search point beat the control on the tuning seeds; nothing to confirm.',
                    'proposals' => $st['atEdge'] ? [self::extendProposal($s, $st)] : []]];
            }
            $finalists = [self::armId($st['best'])];
        } else {
            foreach ($s['arms'] as $a) {
                $finalists[] = (string) $a['id'];
            }
        }
        foreach ($confirm as $k) {
            foreach ($s['tasks'] as $t) {
                $add('control', (string) $t['id'], $k, 'confirm');
                foreach ($finalists as $arm) {
                    $add($arm, (string) $t['id'], $k, 'confirm');
                }
            }
        }
        $arms = [];
        $complete = true;
        foreach ($finalists as $arm) {
            $row = ['arm' => $arm, 'variantSet' => self::armDiff($s, $arm), 'tasks' => []];
            $ok = true;
            foreach ($s['tasks'] as $t) {
                $d = self::paired($done, $arm, (string) $t['id'], $confirm);
                $partial = [];
                foreach ($confirm as $k) {
                    if (isset($done[$arm][$t['id']][$k], $done['control'][$t['id']][$k])) {
                        $partial[$k] = $done[$arm][$t['id']][$k] - $done['control'][$t['id']][$k];
                    }
                }
                $stt = self::stats($partial);
                $stt['complete'] = $d !== null;
                if ($d === null) {
                    $complete = false;
                }
                $stt['metric'] = (string) $t['metric'];
                if (!empty($t['primary'])) {
                    $p = $s['pass'];
                    $stt['pass'] = $d !== null && $stt['mean'] >= (float) $p['meanDelta'] && ($stt['t'] ?? -INF) >= (float) $p['minT']
                        && $stt['wins'] / max(1, $stt['n']) >= (float) $p['minWinFrac'] && $stt['worst'] >= (float) $p['perSeedFloor'];
                } else {
                    $stt['pass'] = $d !== null && $stt['mean'] >= -(float) $t['guard']['maxDrop'];
                }
                $ok = $ok && $stt['pass'];
                $row['tasks'][(string) $t['id']] = $stt;
            }
            $row['pass'] = $ok;
            $arms[] = $row;
        }
        $report['confirm'] = $arms;
        if ($blocked !== []) {
            return self::blockedResult($report, $blocked);
        }
        if (!$complete) {
            return ['phase' => 'confirm', 'need' => $need, 'report' => $report + ['phase' => 'confirm', 'verdict' => 'running']];
        }
        $winners = array_values(array_filter($arms, static fn ($a) => $a['pass']));
        $proposals = [];
        if (isset($s['search']) && !empty($st['atEdge'])) {
            $proposals[] = self::extendProposal($s, $st);
        }
        return ['phase' => 'done', 'need' => [], 'report' => $report + ['phase' => 'done', 'verdict' => $winners ? 'pass' : 'fail',
            'winner' => $winners ? $winners[0]['arm'] : null, 'proposals' => $proposals]];
    }

    private static function blockedResult(array $report, array $blocked): array
    {
        return ['phase' => 'blocked', 'need' => [], 'report' => $report + ['phase' => 'blocked', 'verdict' => 'blocked',
            'blockedRuns' => array_slice($blocked, 0, 20),
            'note' => 'A run failed ' . self::MAX_RUN_FAILURES . ' times; planning stopped until the spec or the worker code is fixed.']];
    }

    private static function armDiff(array $s, string $arm): array
    {
        if (isset($s['search'])) {
            return [$s['search']['param'] => substr($arm, 1)];
        }
        foreach ($s['arms'] as $a) {
            if ($a['id'] === $arm) {
                return $a['set'];
            }
        }
        return [];
    }

    /** The best point sat on the edge of the range: propose the same search one range further out (needs approval). */
    private static function extendProposal(array $s, array $st): array
    {
        $q = $s['search'];
        $lo = (float) $q['lo'];
        $hi = (float) $q['hi'];
        $log = ($q['scale'] ?? 'linear') === 'log2';
        if (abs($st['best'] - $hi) < 1e-12) {
            $nlo = $hi;
            $nhi = $log ? $hi * ($hi / $lo) : $hi + ($hi - $lo);
        } else {
            $nhi = $lo;
            $nlo = $log ? $lo / ($hi / $lo) : $lo - ($hi - $lo);
        }
        return ['kind' => 'extend-range', 'from' => $s['id'], 'param' => $q['param'], 'lo' => self::num($nlo), 'hi' => self::num($nhi),
            'why' => 'The best point was at the edge of the searched range, so the optimum may lie further out.'];
    }
}
