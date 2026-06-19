<?php
/** Список предстоящих турниров с числом записавшихся и флагом записи текущего игрока. */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$pdo = db();
$user = current_user();
$uid = $user['id'] ?? 0;

$sql = "
  SELECT t.*,
    (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status <> 'cancelled') AS taken,
    (SELECT r2.status FROM registrations r2 WHERE r2.tournament_id = t.id AND r2.user_id = ? LIMIT 1) AS my_status
  FROM tournaments t
  WHERE t.is_published = 1 AND t.starts_at >= NOW() - INTERVAL 6 HOUR
  ORDER BY t.starts_at ASC
";
$stmt = $pdo->prepare($sql);
$stmt->execute([$uid]);

$rows = array_map(static function (array $t): array {
    return [
        'id'          => (int) $t['id'],
        'title'       => $t['title'],
        'format'      => $t['format'],
        'starts_at'   => $t['starts_at'],
        'venue'       => $t['venue'],
        'buyin'       => (int) $t['buyin'],
        'stack'       => (int) $t['stack'],
        'seats'       => (int) $t['seats'],
        'taken'       => (int) $t['taken'],
        'description' => $t['description'],
        'my_status'   => $t['my_status'],
    ];
}, $stmt->fetchAll());

json_out(['tournaments' => $rows]);
