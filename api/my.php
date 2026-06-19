<?php
/** Личные данные игрока: записи, история результатов, очки и место в рейтинге. */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$u = require_user();
$pdo = db();
$uid = (int) $u['id'];

// Активные записи (предстоящие турниры)
$reg = $pdo->prepare("
  SELECT r.status, t.id, t.title, t.format, t.starts_at, t.venue
  FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
  WHERE r.user_id = ? AND r.status <> 'cancelled' AND t.starts_at >= NOW() - INTERVAL 6 HOUR
  ORDER BY t.starts_at ASC
");
$reg->execute([$uid]);
$registrations = $reg->fetchAll();

// История результатов
$hist = $pdo->prepare("
  SELECT res.place, res.points, res.created_at, t.title, t.format, t.starts_at
  FROM results res JOIN tournaments t ON t.id = res.tournament_id
  WHERE res.user_id = ?
  ORDER BY t.starts_at DESC LIMIT 20
");
$hist->execute([$uid]);
$history = $hist->fetchAll();

// Очки за текущий месяц и место
$monthPts = (int) $pdo->query("
  SELECT COALESCE(SUM(res.points),0) FROM results res
  WHERE res.user_id = " . $uid . " AND YEAR(res.created_at)=YEAR(CURDATE()) AND MONTH(res.created_at)=MONTH(CURDATE())
")->fetchColumn();

// место в рейтинге месяца
$place = $pdo->query("
  SELECT COUNT(*)+1 FROM (
    SELECT user_id, SUM(points) pts FROM results
    WHERE YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE())
    GROUP BY user_id HAVING pts > " . $monthPts . "
  ) x
")->fetchColumn();

$totalPlayers = (int) $pdo->query('SELECT COUNT(*) FROM users WHERE onboarded = 1')->fetchColumn();
$played = (int) ($pdo->query('SELECT COUNT(*) FROM results WHERE user_id = ' . $uid)->fetchColumn());
$itm = (int) ($pdo->query('SELECT COUNT(*) FROM results WHERE user_id = ' . $uid . ' AND place IS NOT NULL AND place <= 9')->fetchColumn());

json_out([
    'user'          => public_user($u),
    'registrations' => $registrations,
    'history'       => $history,
    'stats'         => [
        'month_points' => $monthPts,
        'place'        => (int) $place,
        'total_players'=> $totalPlayers,
        'played'       => $played,
        'itm'          => $itm,
        'itm_percent'  => $played > 0 ? (int) round($itm / $played * 100) : 0,
    ],
]);
