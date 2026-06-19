<?php
/** Приём данных Telegram Login Widget, проверка подписи, создание сессии. */
declare(strict_types=1);
require __DIR__ . '/lib.php';
only_method('POST');

$c = cfg();
$data = json_in();

if (!verify_telegram_auth($data, $c['tg_bot_token'], (int) $c['tg_auth_max_age'])) {
    json_out(['error' => 'bad_telegram_signature'], 403);
}

$tgId      = (int) ($data['id'] ?? 0);
$username  = $data['username']   ?? null;
$firstName = $data['first_name'] ?? null;
$lastName  = $data['last_name']  ?? null;
$photoUrl  = $data['photo_url']  ?? null;

if (!$tgId) {
    json_out(['error' => 'no_tg_id'], 400);
}

$pdo = db();

// upsert по tg_id
$stmt = $pdo->prepare('SELECT * FROM users WHERE tg_id = ?');
$stmt->execute([$tgId]);
$user = $stmt->fetch();

$isAdmin = in_array($tgId, array_map('intval', $c['admins'] ?? []), true) ? 1 : 0;

if ($user) {
    $upd = $pdo->prepare('UPDATE users SET username=?, first_name=?, last_name=?, photo_url=?, is_admin=? WHERE id=?');
    $upd->execute([$username, $firstName, $lastName, $photoUrl, $isAdmin, $user['id']]);
    $uid = (int) $user['id'];
} else {
    $ins = $pdo->prepare('INSERT INTO users (tg_id, username, first_name, last_name, photo_url, is_admin) VALUES (?,?,?,?,?,?)');
    $ins->execute([$tgId, $username, $firstName, $lastName, $photoUrl, $isAdmin]);
    $uid = (int) $pdo->lastInsertId();
}

start_session();
session_regenerate_id(true);
$_SESSION['uid'] = $uid;

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$uid]);
$fresh = $stmt->fetch();

json_out(['ok' => true, 'user' => public_user($fresh)]);
