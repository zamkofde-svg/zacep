<?php
/** Текущий пользователь по сессии. */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$u = current_user();
if (!$u) {
    json_out(['user' => null], 200);
}
json_out(['user' => public_user($u)]);
