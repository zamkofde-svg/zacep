<?php
/** Завершение регистрации в ЛК: покерный ник + телефон (как «Прежде чем начать»). */
declare(strict_types=1);
require __DIR__ . '/lib.php';
only_method('POST');

$u = require_user();
$data = json_in();

$nick     = trim((string) ($data['nick'] ?? ''));
$phone    = trim((string) ($data['phone'] ?? ''));
$realName = trim((string) ($data['real_name'] ?? ''));

if (mb_strlen($realName) < 3 || mb_strlen($realName) > 100) {
    json_out(['error' => 'bad_name', 'message' => 'Укажите фамилию и имя'], 422);
}
if (mb_strlen($nick) < 2 || mb_strlen($nick) > 32) {
    json_out(['error' => 'bad_nick', 'message' => 'Ник от 2 до 32 символов'], 422);
}
$phoneNorm = normalize_phone($phone);
if ($phoneNorm !== '' && strlen(preg_replace('/\D/', '', $phoneNorm)) < 11) {
    json_out(['error' => 'bad_phone', 'message' => 'Проверьте номер телефона'], 422);
}

$stmt = db()->prepare('UPDATE users SET nick=?, phone=?, real_name=?, onboarded=1 WHERE id=?');
$stmt->execute([$nick, $phoneNorm, $realName, $u['id']]);

// авто-слияние: если этот телефон уже есть на «оффлайн»-карточке (без Telegram
// и без пароля — заведена на входе/в консоли), сливаем её в текущий аккаунт
if ($phoneNorm !== '') {
    $dup = db()->prepare('SELECT id FROM users WHERE phone=? AND id<>? AND tg_id IS NULL AND password_hash IS NULL LIMIT 1');
    $dup->execute([$phoneNorm, $u['id']]);
    if ($d = $dup->fetch()) {
        merge_users(db(), (int) $u['id'], (int) $d['id']);
    }
}

$fresh = db()->prepare('SELECT * FROM users WHERE id=?');
$fresh->execute([$u['id']]);
json_out(['ok' => true, 'user' => public_user($fresh->fetch())]);
