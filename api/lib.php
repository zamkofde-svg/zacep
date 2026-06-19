<?php
/**
 * Общие хелперы бэкенда «Зацеп имеется».
 */

declare(strict_types=1);

function cfg(): array
{
    static $config = null;
    if ($config === null) {
        $path = __DIR__ . '/config.php';
        if (!file_exists($path)) {
            json_out(['error' => 'config_missing', 'message' => 'Создайте api/config.php из config.example.php'], 500);
        }
        $config = require $path;
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = cfg();
        $dsn = "mysql:host={$c['db_host']};dbname={$c['db_name']};charset={$c['db_charset']}";
        try {
            $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            json_out(['error' => 'db_connect_failed'], 500);
        }
    }
    return $pdo;
}

/** Отправить JSON и завершить выполнение. */
function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Прочитать тело запроса как JSON-массив. */
function json_in(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '[]', true);
    return is_array($data) ? $data : [];
}

function start_session(): void
{
    $c = cfg();
    if (session_status() === PHP_SESSION_NONE) {
        session_name($c['session_name']);
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        ]);
        session_start();
    }
}

/** Текущий пользователь из сессии или null. */
function current_user(): ?array
{
    start_session();
    if (empty($_SESSION['uid'])) {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['uid']]);
    $u = $stmt->fetch();
    return $u ?: null;
}

/** Требовать авторизацию, иначе 401. */
function require_user(): array
{
    $u = current_user();
    if (!$u) {
        json_out(['error' => 'unauthorized'], 401);
    }
    return $u;
}

function only_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        json_out(['error' => 'method_not_allowed'], 405);
    }
}

/** Публичное представление пользователя (без чувствительных полей). */
function public_user(array $u): array
{
    return [
        'id'         => (int) $u['id'],
        'tg_id'      => isset($u['tg_id']) ? (int) $u['tg_id'] : null,
        'username'   => $u['username'] ?? null,
        'first_name' => $u['first_name'] ?? null,
        'last_name'  => $u['last_name'] ?? null,
        'real_name'  => $u['real_name'] ?? null,
        'photo_url'  => $u['photo_url'] ?? null,
        'nick'       => $u['nick'] ?? null,
        'phone'      => $u['phone'] ?? null,
        'onboarded'  => (bool) ($u['onboarded'] ?? false),
        'is_admin'   => (bool) ($u['is_admin'] ?? false),
    ];
}

/** Канонический формат телефона: 8XXX/+7XXX/7XXX → +7XXXXXXXXXX. */
function normalize_phone(string $raw): string
{
    $d = preg_replace('/\D/', '', $raw);
    if (strlen($d) === 11 && ($d[0] === '8' || $d[0] === '7')) {
        $d = '7' . substr($d, 1);
    } elseif (strlen($d) === 10) {
        $d = '7' . $d;
    }
    return $d === '' ? '' : '+' . $d;
}

/** Стандартная структура блайндов (можно потом отредактировать). */
function default_levels(): array
{
    // [sb, bb, ante, minutes, is_break, title]
    return [
        [100, 200, 0, 20, 0, null],
        [200, 400, 0, 20, 0, null],
        [300, 600, 600, 20, 0, null],
        [500, 1000, 1000, 20, 0, null],
        [0, 0, 0, 10, 1, 'Перерыв'],
        [700, 1400, 1400, 20, 0, null],
        [1000, 2000, 2000, 20, 0, null],
        [1500, 3000, 3000, 20, 0, null],
        [2000, 4000, 4000, 20, 0, null],
        [0, 0, 0, 10, 1, 'Перерыв'],
        [3000, 6000, 6000, 20, 0, null],
        [5000, 10000, 10000, 20, 0, null],
        [8000, 16000, 16000, 20, 0, null],
        [12000, 24000, 24000, 20, 0, null],
        [20000, 40000, 40000, 20, 0, null],
    ];
}

/** Состояние часов турнира (с ленивой авто-сменой уровня). Tz-безопасно через MySQL. */
function tournament_clock(PDO $pdo, int $tid): array
{
    $t = $pdo->prepare("SELECT status, current_level, clock_paused, paused_left,
        TIMESTAMPDIFF(SECOND, level_started_at, NOW()) AS elapsed FROM tournaments WHERE id=?");
    $t->execute([$tid]);
    $tr = $t->fetch();
    if (!$tr) return ['status' => 'unknown', 'has_levels' => false];

    $levels = $pdo->query("SELECT idx,sb,bb,ante,duration_min,is_break,title FROM tournament_levels WHERE tournament_id=$tid ORDER BY idx")->fetchAll();
    $total = count($levels);
    $base = ['status' => $tr['status'], 'has_levels' => $total > 0, 'total' => $total,
             'level' => (int) $tr['current_level'], 'remaining' => 0, 'paused' => (bool) $tr['clock_paused']];
    if ($total === 0) return $base;

    $li = fn($i) => ($i >= 1 && $i <= $total) ? $levels[$i - 1] : null;
    $pack = function ($lv) {
        if (!$lv) return null;
        return ['sb' => (int) $lv['sb'], 'bb' => (int) $lv['bb'], 'ante' => (int) $lv['ante'],
                'is_break' => (bool) $lv['is_break'], 'title' => $lv['title'], 'duration_min' => (int) $lv['duration_min']];
    };

    if ($tr['status'] !== 'running') {
        $cur = max(1, min($total, (int) $tr['current_level'] ?: 1));
        return array_merge($base, ['current' => $pack($li($cur)), 'next' => $pack($li($cur + 1)), 'level' => $cur]);
    }

    $cur = max(1, min($total, (int) $tr['current_level']));
    if ($tr['clock_paused']) {
        $remaining = (int) $tr['paused_left'];
    } else {
        $into = (int) $tr['elapsed'];
        while ($cur < $total && $into >= ((int) $levels[$cur - 1]['duration_min']) * 60) {
            $into -= ((int) $levels[$cur - 1]['duration_min']) * 60;
            $cur++;
        }
        $dur = ((int) $levels[$cur - 1]['duration_min']) * 60;
        $remaining = max(0, $dur - $into);
        if ($cur !== (int) $tr['current_level']) {
            $passed = (int) $tr['elapsed'] - $into;
            $pdo->prepare("UPDATE tournaments SET current_level=?, level_started_at = level_started_at + INTERVAL ? SECOND WHERE id=?")
                ->execute([$cur, $passed, $tid]);
        }
    }
    return array_merge($base, ['level' => $cur, 'remaining' => $remaining, 'current' => $pack($li($cur)), 'next' => $pack($li($cur + 1))]);
}

/** Краткая сводка турнира для лайв-экрана. */
function tournament_summary(PDO $pdo, int $tid): array
{
    $stack = (int) ($pdo->query("SELECT stack FROM tournaments WHERE id=$tid")->fetchColumn() ?: 0);
    $entries = (int) $pdo->query("SELECT COUNT(*) FROM entries WHERE tournament_id=$tid")->fetchColumn();
    $active  = (int) $pdo->query("SELECT COUNT(*) FROM tournament_players WHERE tournament_id=$tid AND status='active'")->fetchColumn();
    $players = (int) $pdo->query("SELECT COUNT(*) FROM tournament_players WHERE tournament_id=$tid")->fetchColumn();
    $chips = $entries * $stack;
    return ['players' => $players, 'active' => $active, 'entries' => $entries,
            'chips_in_play' => $chips, 'avg_stack' => $active > 0 ? (int) round($chips / $active) : 0];
}

/** Требовать права администратора. */
function require_admin(): array
{
    $u = require_user();
    if (empty($u['is_admin'])) {
        json_out(['error' => 'forbidden'], 403);
    }
    return $u;
}

/** Отправить сообщение пользователю через бота (если он запускал бота). */
function tg_send(?int $chatId, string $text): bool
{
    if (!$chatId) {
        return false;
    }
    $c = cfg();
    $url = 'https://api.telegram.org/bot' . $c['tg_bot_token'] . '/sendMessage';
    $payload = http_build_query([
        'chat_id'    => $chatId,
        'text'       => $text,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => 'true',
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
    ]);
    $res = curl_exec($ch);
    $ok = $res !== false && (int) curl_getinfo($ch, CURLINFO_HTTP_CODE) === 200;
    curl_close($ch);
    return $ok;
}

/** Определения ачивок: code => [emoji, title, kind, n]. */
function achievement_defs(): array
{
    return [
        'first_tournament' => ['🎲', 'Первый турнир',  'played', 1],
        'first_itm'        => ['💰', 'Первые призовые', 'itm',    1],
        'first_win'        => ['♠️', 'Первая победа',   'win',    1],
        'regular'          => ['🔥', 'Завсегдатай',     'played', 10],
        'veteran'          => ['🏆', 'Ветеран',         'played', 25],
        'legend'           => ['👑', 'Легенда стола',   'played', 50],
    ];
}

/**
 * Пересчитать ачивки игрока, начислить новые, отправить уведомления.
 * Возвращает массив новых ачивок [['code','title','emoji'], ...].
 */
function award_achievements(int $userId): array
{
    $pdo = db();
    $played = (int) $pdo->query('SELECT COUNT(*) FROM results WHERE user_id=' . $userId)->fetchColumn();
    $itm    = (int) $pdo->query('SELECT COUNT(*) FROM results WHERE user_id=' . $userId . ' AND place IS NOT NULL AND place<=9')->fetchColumn();
    $wins   = (int) $pdo->query('SELECT COUNT(*) FROM results WHERE user_id=' . $userId . ' AND place=1')->fetchColumn();
    $metrics = ['played' => $played, 'itm' => $itm, 'win' => $wins];

    $have = $pdo->prepare('SELECT code FROM user_achievements WHERE user_id=?');
    $have->execute([$userId]);
    $owned = array_column($have->fetchAll(), 'code');

    $new = [];
    $ins = $pdo->prepare('INSERT IGNORE INTO user_achievements (user_id, code) VALUES (?,?)');
    foreach (achievement_defs() as $code => [$emoji, $title, $kind, $n]) {
        if (($metrics[$kind] ?? 0) >= $n && !in_array($code, $owned, true)) {
            $ins->execute([$userId, $code]);
            $new[] = ['code' => $code, 'title' => $title, 'emoji' => $emoji];
        }
    }

    if ($new) {
        $uStmt = $pdo->prepare('SELECT tg_id FROM users WHERE id=?');
        $uStmt->execute([$userId]);
        $tg = $uStmt->fetchColumn();
        foreach ($new as $a) {
            tg_send($tg ? (int) $tg : null, "{$a['emoji']} <b>Новая ачивка!</b>\n«{$a['title']}» — так держать ♠");
        }
    }
    return $new;
}

/**
 * Проверка подписи Telegram Login Widget.
 * Документация: https://core.telegram.org/widgets/login#checking-authorization
 */
function verify_telegram_auth(array $data, string $botToken, int $maxAge): bool
{
    if (empty($data['hash'])) {
        return false;
    }
    $hash = (string) $data['hash'];
    unset($data['hash']);

    $pairs = [];
    foreach ($data as $key => $value) {
        $pairs[] = $key . '=' . $value;
    }
    sort($pairs);
    $dataCheckString = implode("\n", $pairs);

    $secretKey = hash('sha256', $botToken, true);
    $calculated = hash_hmac('sha256', $dataCheckString, $secretKey);

    if (!hash_equals($calculated, $hash)) {
        return false;
    }
    // защита от устаревшей авторизации
    if (!empty($data['auth_date']) && (time() - (int) $data['auth_date']) > $maxAge) {
        return false;
    }
    return true;
}
