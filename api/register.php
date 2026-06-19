<?php
/** Запись текущего игрока на турнир (или отмена при action=cancel). */
declare(strict_types=1);
require __DIR__ . '/lib.php';
only_method('POST');

$u = require_user();
if (empty($u['onboarded'])) {
    json_out(['error' => 'not_onboarded', 'message' => 'Сначала заполните профиль'], 403);
}

$data = json_in();
$tid    = (int) ($data['tournament_id'] ?? 0);
$action = $data['action'] ?? 'register';
if (!$tid) {
    json_out(['error' => 'no_tournament'], 400);
}

$pdo = db();
$stmt = $pdo->prepare('SELECT * FROM tournaments WHERE id = ? AND is_published = 1');
$stmt->execute([$tid]);
$tour = $stmt->fetch();
if (!$tour) {
    json_out(['error' => 'tournament_not_found'], 404);
}

if ($action === 'cancel') {
    $del = $pdo->prepare("UPDATE registrations SET status='cancelled' WHERE user_id=? AND tournament_id=?");
    $del->execute([$u['id'], $tid]);
    json_out(['ok' => true, 'status' => 'cancelled']);
}

// сколько уже записано
$cnt = $pdo->prepare("SELECT COUNT(*) FROM registrations WHERE tournament_id=? AND status<>'cancelled'");
$cnt->execute([$tid]);
$taken = (int) $cnt->fetchColumn();
$status = $taken >= (int) $tour['seats'] ? 'waitlist' : 'confirmed';

// upsert (повторная запись после отмены — обновляем статус)
$ins = $pdo->prepare("
  INSERT INTO registrations (user_id, tournament_id, status) VALUES (?,?,?)
  ON DUPLICATE KEY UPDATE status = VALUES(status)
");
$ins->execute([$u['id'], $tid, $status]);

// уведомление игроку в Telegram
$when = date('d.m в H:i', strtotime((string) $tour['starts_at']));
$msg = $status === 'confirmed'
    ? "✅ Ты записан на турнир\n<b>" . htmlspecialchars($tour['title']) . "</b> · {$when}\nЖдём за столом ♠"
    : "📝 Ты в листе ожидания на\n<b>" . htmlspecialchars($tour['title']) . "</b> · {$when}\nСообщим, как освободится место.";
tg_send(!empty($u['tg_id']) ? (int) $u['tg_id'] : null, $msg);

json_out(['ok' => true, 'status' => $status]);
