<?php
/** Вход по телефону + пароль. */
declare(strict_types=1);
require __DIR__ . '/lib.php';
only_method('POST');

$d = json_in();
$phone    = normalize_phone((string) ($d['phone'] ?? ''));
$password = (string) ($d['password'] ?? '');

if ($phone === '' || $password === '') {
    json_out(['error' => 'bad_input', 'message' => 'Введите телефон и пароль'], 422);
}

$pdo = db();
$f = $pdo->prepare('SELECT * FROM users WHERE phone = ? AND password_hash IS NOT NULL LIMIT 1');
$f->execute([$phone]);
$u = $f->fetch();

if (!$u || !password_verify($password, $u['password_hash'])) {
    json_out(['error' => 'invalid_credentials', 'message' => 'Неверный телефон или пароль'], 401);
}

start_session();
session_regenerate_id(true);
$_SESSION['uid'] = (int) $u['id'];

json_out(['ok' => true, 'user' => public_user($u)]);
