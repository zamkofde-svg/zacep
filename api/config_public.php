<?php
/** Публичные настройки для фронтенда (без секретов). */
declare(strict_types=1);
require __DIR__ . '/lib.php';
$c = cfg();
json_out(['tg_bot_username' => $c['tg_bot_username'] ?? '']);
