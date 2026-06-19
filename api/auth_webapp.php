<?php
/** Вход через Telegram Mini App: проверка initData и сессия. */
declare(strict_types=1);
require __DIR__ . '/lib.php';
only_method('POST');

$c = cfg();
$initData = (string) (json_in()['initData'] ?? '');
if ($initData === '') json_out(['error' => 'no_init_data'], 400);

parse_str($initData, $fields);
$hash = (string) ($fields['hash'] ?? '');
unset($fields['hash']);
if ($hash === '') json_out(['error' => 'no_hash'], 400);

// data_check_string: ключи по алфавиту, "key=value" через \n
ksort($fields);
$pairs = [];
foreach ($fields as $k => $v) { $pairs[] = $k . '=' . $v; }
$dcs = implode("\n", $pairs);

// secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
$secret = hash_hmac('sha256', $c['tg_bot_token'], 'WebAppData', true);
$calc = hash_hmac('sha256', $dcs, $secret);
if (!hash_equals($calc, $hash)) json_out(['error' => 'bad_signature'], 403);

if (!empty($fields['auth_date']) && (time() - (int) $fields['auth_date']) > (int) $c['tg_auth_max_age']) {
    json_out(['error' => 'expired'], 403);
}

$u = json_decode($fields['user'] ?? '', true);
$tgId = (int) ($u['id'] ?? 0);
if (!$tgId) json_out(['error' => 'no_user'], 400);

$pdo = db();
$isAdmin = in_array($tgId, array_map('intval', $c['admins'] ?? []), true) ? 1 : 0;
$stmt = $pdo->prepare('SELECT * FROM users WHERE tg_id = ?');
$stmt->execute([$tgId]);
$row = $stmt->fetch();
if ($row) {
    $pdo->prepare('UPDATE users SET username=?, first_name=?, last_name=?, photo_url=?, is_admin=? WHERE id=?')
        ->execute([$u['username'] ?? null, $u['first_name'] ?? null, $u['last_name'] ?? null, $u['photo_url'] ?? null, $isAdmin, $row['id']]);
    $uid = (int) $row['id'];
} else {
    $pdo->prepare('INSERT INTO users (tg_id, username, first_name, last_name, photo_url, is_admin) VALUES (?,?,?,?,?,?)')
        ->execute([$tgId, $u['username'] ?? null, $u['first_name'] ?? null, $u['last_name'] ?? null, $u['photo_url'] ?? null, $isAdmin]);
    $uid = (int) $pdo->lastInsertId();
}

start_session();
session_regenerate_id(true);
$_SESSION['uid'] = $uid;

$fresh = $pdo->prepare('SELECT * FROM users WHERE id=?');
$fresh->execute([$uid]);
json_out(['ok' => true, 'user' => public_user($fresh->fetch())]);
