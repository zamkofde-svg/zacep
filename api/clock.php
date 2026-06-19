<?php
/** Публичные данные для лайв-экрана: часы, блайнды, метрики. Без авторизации (табло). */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$tid = (int) ($_GET['t'] ?? 0);
if (!$tid) json_out(['error' => 'no_tournament'], 400);

$tour = db()->query("SELECT id, title, status FROM tournaments WHERE id=$tid")->fetch();
if (!$tour) json_out(['error' => 'not_found'], 404);

json_out([
    'tournament' => ['id' => (int) $tour['id'], 'title' => $tour['title'], 'status' => $tour['status']],
    'clock'      => tournament_clock(db(), $tid),
    'summary'    => tournament_summary(db(), $tid),
]);
