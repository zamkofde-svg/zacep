<?php
/** Рейтинг игроков. ?period=month|season|all (season = текущий год). */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$period = $_GET['period'] ?? 'month';
$where = '';
if ($period === 'month') {
    $where = 'WHERE YEAR(res.created_at)=YEAR(CURDATE()) AND MONTH(res.created_at)=MONTH(CURDATE())';
} elseif ($period === 'season') {
    $where = 'WHERE YEAR(res.created_at)=YEAR(CURDATE())';
}

$sql = "
  SELECT u.id, u.nick, u.first_name, u.username,
         COUNT(res.id) AS tournaments,
         SUM(CASE WHEN res.place IS NOT NULL AND res.place <= 9 THEN 1 ELSE 0 END) AS itm,
         COALESCE(SUM(res.points),0) AS points
  FROM results res
  JOIN users u ON u.id = res.user_id
  $where
  GROUP BY u.id
  ORDER BY points DESC, itm DESC
  LIMIT 50
";

$rows = [];
$rank = 0;
foreach (db()->query($sql) as $r) {
    $rank++;
    $name = $r['nick'] ?: ($r['first_name'] ?: ('@' . ($r['username'] ?? 'player')));
    $rows[] = [
        'rank'        => $rank,
        'name'        => $name,
        'tournaments' => (int) $r['tournaments'],
        'itm'         => (int) $r['itm'],
        'points'      => (int) $r['points'],
    ];
}

json_out(['period' => $period, 'rating' => $rows]);
