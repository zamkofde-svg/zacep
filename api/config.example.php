<?php
/**
 * Зацеп имеется — конфигурация бэкенда.
 *
 * 1. Скопируй этот файл в config.php (cp config.example.php config.php)
 * 2. Заполни значения ниже реальными данными
 * config.php в git не попадает (см. .gitignore) — токен и пароли не утекут.
 */

return [
    // ---- Telegram ----
    // Токен бота от @BotFather (например 123456:ABC-DEF...)
    'tg_bot_token'    => 'ВСТАВЬ_ТОКЕН_БОТА',
    // Username бота без @ (например zacep_poker_bot) — используется виджетом входа
    'tg_bot_username' => 'ВСТАВЬ_USERNAME_БОТА',
    // Максимальный возраст авторизации Telegram в секундах (защита от повтора)
    'tg_auth_max_age' => 86400,

    // ---- База данных MySQL (данные из панели reg.ru) ----
    'db_host' => 'localhost',
    'db_name' => 'ВСТАВЬ_ИМЯ_БД',
    'db_user' => 'ВСТАВЬ_ПОЛЬЗОВАТЕЛЯ',
    'db_pass' => 'ВСТАВЬ_ПАРОЛЬ',
    'db_charset' => 'utf8mb4',

    // ---- Сессии ----
    'session_name' => 'zacep_sid',

    // Telegram ID администраторов (через запятую), которым доступна выдача результатов.
    // Узнать свой ID можно у @userinfobot
    'admins' => [],
];
