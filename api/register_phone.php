<?php
/** Регистрация по телефону + пароль (альтернатива Telegram). */
declare(strict_types=1);
require __DIR__ . '/lib.php';
only_method('POST');

$d = json_in();
$realName = trim((string) ($d['real_name'] ?? ''));
$nick     = trim((string) ($d['nick'] ?? ''));
$phoneRaw = (string) ($d['phone'] ?? '');
$password = (string) ($d['password'] ?? '');
$phone    = normalize_phone($phoneRaw);

if (mb_strlen($realName) < 3 || mb_strlen($realName) > 100) {
    json_out(['error' => 'bad_name', 'message' => 'Укажите фамилию и имя'], 422);
}
if (mb_strlen($nick) < 2 || mb_strlen($nick) > 32) {
    json_out(['error' => 'bad_nick', 'message' => 'Ник от 2 до 32 символов'], 422);
}
if (strlen(preg_replace('/\D/', '', $phone)) < 10) {
    json_out(['error' => 'bad_phone', 'message' => 'Проверьте номер телефона'], 422);
}
if (mb_strlen($password) < 6) {
    json_out(['error' => 'bad_password', 'message' => 'Пароль не короче 6 символов'], 422);
}

$pdo = db();
$f = $pdo->prepare('SELECT * FROM users WHERE phone = ? LIMIT 1');
$f->execute([$phone]);
$existing = $f->fetch();

$hash = password_hash($password, PASSWORD_DEFAULT);

if ($existing) {
    // нельзя «угнать» аккаунт с паролем или привязанный к Telegram
    if (!empty($existing['password_hash']) || !empty($existing['tg_id'])) {
        json_out(['error' => 'phone_taken', 'message' => 'Аккаунт с этим номером уже есть — войдите'], 409);
    }
    // claim: это «оффлайн»-карточка, заведённая админом по телефону
    $upd = $pdo->prepare('UPDATE users SET real_name=?, nick=?, password_hash=?, onboarded=1 WHERE id=?');
    $upd->execute([$realName, $nick, $hash, $existing['id']]);
    $uid = (int) $existing['id'];
} else {
    $ins = $pdo->prepare('INSERT INTO users (real_name, nick, phone, password_hash, onboarded) VALUES (?,?,?,?,1)');
    $ins->execute([$realName, $nick, $phone, $hash]);
    $uid = (int) $pdo->lastInsertId();
}

start_session();
session_regenerate_id(true);
$_SESSION['uid'] = $uid;

$u = $pdo->prepare('SELECT * FROM users WHERE id=?');
$u->execute([$uid]);
json_out(['ok' => true, 'user' => public_user($u->fetch())]);
