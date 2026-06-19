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
        'photo_url'  => $u['photo_url'] ?? null,
        'nick'       => $u['nick'] ?? null,
        'phone'      => $u['phone'] ?? null,
        'onboarded'  => (bool) ($u['onboarded'] ?? false),
        'is_admin'   => (bool) ($u['is_admin'] ?? false),
    ];
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
