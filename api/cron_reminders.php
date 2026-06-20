<?php
/**
 * Автонапоминания о турнирах. Запускается по cron (каждые ~15 мин).
 * CLI: php cron_reminders.php
 * Веб (для теста): /api/cron_reminders.php?key=<cron_key>
 *
 * Шлёт зарегистрированным игрокам с привязанным Telegram:
 *   - 'day'  — когда до старта 2..24 часа (напоминание за сутки)
 *   - 'soon' — когда до старта <= 2 часа
 * Каждое напоминание уходит один раз (reminder_log).
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$c = cfg();
if (php_sapi_name() !== 'cli') {
    if (($_GET['key'] ?? '') !== ($c['cron_key'] ?? '__no__')) {
        http_response_code(403);
        exit('forbidden');
    }
}

$pdo = db();

function remind_group(PDO $pdo, array $t, string $kind): int
{
    $tid = (int) $t['id'];
    $stmt = $pdo->prepare("
        SELECT u.id, u.tg_id FROM registrations r JOIN users u ON u.id = r.user_id
        WHERE r.tournament_id = ? AND r.status <> 'cancelled' AND u.tg_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM reminder_log rl WHERE rl.tournament_id=? AND rl.user_id=u.id AND rl.kind=?)
    ");
    $stmt->execute([$tid, $tid, $kind]);
    $title = htmlspecialchars($t['title']);
    $venue = htmlspecialchars($t['venue'] ?? '');
    $when  = $t['when_str'];
    $msg = $kind === 'soon'
        ? "⏰ Уже скоро! Турнир <b>{$title}</b> в {$when}.\n📍 {$venue}\nНе опаздывай — регистрация закрывается. ♠"
        : "📅 Напоминание: турнир <b>{$title}</b>\n🕒 {$when} · 📍 {$venue}\nЖдём тебя за столом!";
    $ins = $pdo->prepare("INSERT IGNORE INTO reminder_log (tournament_id, user_id, kind) VALUES (?,?,?)");
    $n = 0;
    foreach ($stmt->fetchAll() as $p) {
        if (tg_send((int) $p['tg_id'], $msg)) {
            $ins->execute([$tid, (int) $p['id'], $kind]);
            $n++;
        }
    }
    return $n;
}

$sent = 0;
// 'soon' — старт в ближайшие 2 часа
$soon = $pdo->query("SELECT id, title, venue, DATE_FORMAT(starts_at,'%d.%m %H:%i') AS when_str
    FROM tournaments WHERE is_published=1 AND starts_at > NOW() AND starts_at <= NOW() + INTERVAL 2 HOUR");
foreach ($soon as $t) $sent += remind_group($pdo, $t, 'soon');

// 'day' — старт через 2..24 часа
$day = $pdo->query("SELECT id, title, venue, DATE_FORMAT(starts_at,'%d.%m %H:%i') AS when_str
    FROM tournaments WHERE is_published=1 AND starts_at > NOW() + INTERVAL 2 HOUR AND starts_at <= NOW() + INTERVAL 24 HOUR");
foreach ($day as $t) $sent += remind_group($pdo, $t, 'day');

echo "reminders sent: {$sent}\n";
