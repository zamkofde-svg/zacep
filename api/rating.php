<?php
/** Рейтинг игроков. ?period=month|season|all. */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$period = $_GET['period'] ?? 'month';

// сезон: по умолчанию текущий, либо выбранный через ?season=<key>
$allSeasons = seasons();
$season = current_season();
if (!empty($_GET['season'])) {
    foreach ($allSeasons as $s) {
        if ($s['key'] === $_GET['season']) { $season = $s; break; }
    }
}
// список уже стартовавших сезонов для выбора (новые сверху)
$today = date('Y-m-d');
$started = array_values(array_filter($allSeasons, fn($s) => $s['start'] <= $today));
$started = array_reverse($started);
$seasonList = array_map(fn($s) => ['key' => $s['key'], 'name' => $s['name']], $started);

$where = '';
if ($period === 'month') {
    $where = 'WHERE YEAR(res.created_at)=YEAR(CURDATE()) AND MONTH(res.created_at)=MONTH(CURDATE())';
} elseif ($period === 'season') {
    $where = "WHERE res.created_at BETWEEN '{$season['start']} 00:00:00' AND '{$season['end']} 23:59:59'";
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

json_out([
    'period'     => $period,
    'season'     => $season['name'],
    'season_key' => $season['key'],
    'seasons'    => $seasonList,
    'rating'     => $rows,
]);
