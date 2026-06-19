<?php
/** Завершение регистрации в ЛК: покерный ник + телефон (как «Прежде чем начать»). */
declare(strict_types=1);
require __DIR__ . '/lib.php';
only_method('POST');

$u = require_user();
$data = json_in();

$nick  = trim((string) ($data['nick'] ?? ''));
$phone = trim((string) ($data['phone'] ?? ''));

if (mb_strlen($nick) < 2 || mb_strlen($nick) > 32) {
    json_out(['error' => 'bad_nick', 'message' => 'Ник от 2 до 32 символов'], 422);
}
// нормализуем телефон: оставляем цифры и плюс
$phoneNorm = preg_replace('/[^\d+]/', '', $phone);
if ($phoneNorm !== '' && strlen(preg_replace('/\D/', '', $phoneNorm)) < 10) {
    json_out(['error' => 'bad_phone', 'message' => 'Проверьте номер телефона'], 422);
}

$stmt = db()->prepare('UPDATE users SET nick=?, phone=?, onboarded=1 WHERE id=?');
$stmt->execute([$nick, $phoneNorm, $u['id']]);

$u['nick'] = $nick;
$u['phone'] = $phoneNorm;
$u['onboarded'] = 1;
json_out(['ok' => true, 'user' => public_user($u)]);
