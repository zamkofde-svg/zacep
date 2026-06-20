<?php
/** Привязка Telegram к текущему (например, телефонному) аккаунту. */
declare(strict_types=1);
require __DIR__ . '/lib.php';
only_method('POST');

$u = require_user();
$c = cfg();
$data = json_in();

$tgId = 0; $username = null; $firstName = null; $lastName = null; $photo = null;

if (!empty($data['initData'])) {
    // из мини-аппа
    parse_str((string) $data['initData'], $f);
    $hash = (string) ($f['hash'] ?? ''); unset($f['hash']);
    ksort($f);
    $pairs = []; foreach ($f as $k => $v) $pairs[] = $k . '=' . $v;
    $secret = hash_hmac('sha256', $c['tg_bot_token'], 'WebAppData', true);
    if ($hash === '' || !hash_equals(hash_hmac('sha256', implode("\n", $pairs), $secret), $hash)) {
        json_out(['error' => 'bad_signature'], 403);
    }
    $usr = json_decode($f['user'] ?? '', true);
    $tgId = (int) ($usr['id'] ?? 0);
    $username = $usr['username'] ?? null; $firstName = $usr['first_name'] ?? null;
    $lastName = $usr['last_name'] ?? null; $photo = $usr['photo_url'] ?? null;
} else {
    // из Login Widget на сайте
    if (!verify_telegram_auth($data, $c['tg_bot_token'], (int) $c['tg_auth_max_age'])) {
        json_out(['error' => 'bad_signature'], 403);
    }
    $tgId = (int) ($data['id'] ?? 0);
    $username = $data['username'] ?? null; $firstName = $data['first_name'] ?? null;
    $lastName = $data['last_name'] ?? null; $photo = $data['photo_url'] ?? null;
}

if (!$tgId) json_out(['error' => 'no_tg_id'], 400);

$pdo = db();
// этот Telegram уже привязан к другому аккаунту?
$other = $pdo->prepare('SELECT id FROM users WHERE tg_id = ? AND id <> ?');
$other->execute([$tgId, $u['id']]);
if ($other->fetch()) {
    json_out(['error' => 'tg_taken', 'message' => 'Этот Telegram уже привязан к другому аккаунту'], 409);
}

$isAdmin = in_array($tgId, array_map('intval', $c['admins'] ?? []), true) ? 1 : (int) $u['is_admin'];
$pdo->prepare('UPDATE users SET tg_id=?, username=?, first_name=COALESCE(first_name,?), last_name=COALESCE(last_name,?), photo_url=?, is_admin=? WHERE id=?')
    ->execute([$tgId, $username, $firstName, $lastName, $photo, $isAdmin, $u['id']]);

$fresh = $pdo->prepare('SELECT * FROM users WHERE id=?');
$fresh->execute([$u['id']]);
json_out(['ok' => true, 'user' => public_user($fresh->fetch())]);
