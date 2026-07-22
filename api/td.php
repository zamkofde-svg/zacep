<?php
/** Tournament Director API (Фаза 1): чек-ин, закупы/перезаходы/аддоны, вылеты, касса. Только админ. */
declare(strict_types=1);
require __DIR__ . '/lib.php';
require_admin();
$pdo = db();

$body   = json_in();
$action = $_GET['action'] ?? $body['action'] ?? '';
$tid    = (int) ($_GET['tournament_id'] ?? $body['tournament_id'] ?? 0);

function display_name(array $u): string
{
    return $u['nick'] ?: ($u['real_name'] ?: ($u['first_name'] ?: ('@' . ($u['username'] ?? 'игрок'))));
}

/** Найти пользователя по id или телефону, при необходимости создать «оффлайн»-карточку. */
function resolve_user(PDO $pdo, array $body): int
{
    $uid = (int) ($body['user_id'] ?? 0);
    if ($uid) return $uid;
    $phone = normalize_phone((string) ($body['phone'] ?? ''));
    $nick  = trim((string) ($body['nick'] ?? ''));
    $real  = trim((string) ($body['real_name'] ?? ''));
    if (strlen(preg_replace('/\D/', '', $phone)) >= 11) {
        $f = $pdo->prepare('SELECT id FROM users WHERE phone=? LIMIT 1');
        $f->execute([$phone]);
        $row = $f->fetch();
        if ($row) return (int) $row['id'];
        $ins = $pdo->prepare('INSERT INTO users (real_name, nick, phone, onboarded) VALUES (?,?,?,1)');
        $ins->execute([$real ?: null, $nick ?: ('Гость ' . substr($phone, -4)), $phone]);
        return (int) $pdo->lastInsertId();
    }
    if ($nick !== '') { // совсем оффлайн — только ник
        $ins = $pdo->prepare('INSERT INTO users (nick, real_name, onboarded) VALUES (?,?,1)');
        $ins->execute([$nick, $real ?: null]);
        return (int) $pdo->lastInsertId();
    }
    json_out(['error' => 'no_player', 'message' => 'Укажите игрока, телефон или ник'], 422);
}

/** user_id по body: явный user_id или номер бэйджа в этом турнире. */
function uid_from(PDO $pdo, int $tid, array $body): int
{
    $uid = (int) ($body['user_id'] ?? 0);
    if ($uid) return $uid;
    $num = (int) ($body['number'] ?? 0);
    if ($num) {
        $r = $pdo->prepare('SELECT user_id FROM tournament_players WHERE tournament_id=? AND player_number=?');
        $r->execute([$tid, $num]);
        $row = $r->fetch();
        return $row ? (int) $row['user_id'] : 0;
    }
    return 0;
}

/** Посадить игрока на первое свободное место (для поздних чек-инов и перезаходов). */
function assign_open_seat(PDO $pdo, int $tid, int $size, int $uid): void
{
    // существующие столы с числом активных игроков
    $rows = $pdo->query("SELECT table_no, COUNT(*) c FROM tournament_players
        WHERE tournament_id=$tid AND status='active' AND table_no IS NOT NULL
        GROUP BY table_no ORDER BY c ASC")->fetchAll();
    if (!$rows) return; // рассадки ещё не было — сажать некуда
    $table = null;
    foreach ($rows as $r) { if ((int) $r['c'] < $size) { $table = (int) $r['table_no']; break; } }
    if ($table === null) {
        $table = (int) $pdo->query("SELECT COALESCE(MAX(table_no),0)+1 FROM tournament_players WHERE tournament_id=$tid")->fetchColumn();
    }
    // первое свободное место за столом
    $taken = $pdo->prepare("SELECT seat_no FROM tournament_players WHERE tournament_id=? AND table_no=? AND status='active' AND seat_no IS NOT NULL");
    $taken->execute([$tid, $table]);
    $busy = array_map('intval', array_column($taken->fetchAll(), 'seat_no'));
    $seat = 1; while (in_array($seat, $busy, true)) $seat++;
    $pdo->prepare("UPDATE tournament_players SET table_no=?, seat_no=? WHERE tournament_id=? AND user_id=?")
        ->execute([$table, $seat, $tid, $uid]);
}

switch ($action) {

    case 'players': {
        if (!$tid) json_out(['error' => 'no_tournament'], 400);
        $tour = $pdo->query('SELECT * FROM tournaments WHERE id=' . $tid)->fetch();
        if (!$tour) json_out(['error' => 'tournament_not_found'], 404);

        $st = $pdo->prepare("
            SELECT tp.player_number, tp.table_no, tp.seat_no, tp.status, tp.place,
                   u.id AS user_id, u.nick, u.real_name, u.first_name, u.username,
                   (SELECT COUNT(*) FROM entries e WHERE e.tournament_id=tp.tournament_id AND e.user_id=tp.user_id) AS entries,
                   (SELECT COALESCE(SUM(e.amount),0) FROM entries e WHERE e.tournament_id=tp.tournament_id AND e.user_id=tp.user_id) AS paid,
                   (SELECT res.points FROM results res WHERE res.tournament_id=tp.tournament_id AND res.user_id=tp.user_id) AS points
            FROM tournament_players tp JOIN users u ON u.id=tp.user_id
            WHERE tp.tournament_id=?
            ORDER BY tp.player_number ASC
        ");
        $st->execute([$tid]);
        $players = array_map(function ($r) {
            return [
                'user_id' => (int) $r['user_id'], 'number' => (int) $r['player_number'],
                'name' => display_name($r), 'real_name' => $r['real_name'],
                'table_no' => $r['table_no'] !== null ? (int) $r['table_no'] : null,
                'seat_no' => $r['seat_no'] !== null ? (int) $r['seat_no'] : null,
                'status' => $r['status'], 'place' => $r['place'] !== null ? (int) $r['place'] : null,
                'entries' => (int) $r['entries'], 'paid' => (int) $r['paid'],
                'points' => $r['points'] !== null ? (int) $r['points'] : null,
            ];
        }, $st->fetchAll());

        // записанные онлайн, но ещё не на чек-ине
        $pend = $pdo->prepare("
            SELECT u.id AS user_id, u.nick, u.real_name, u.first_name, u.username, u.phone
            FROM registrations r JOIN users u ON u.id=r.user_id
            WHERE r.tournament_id=? AND r.status<>'cancelled'
              AND u.id NOT IN (SELECT user_id FROM tournament_players WHERE tournament_id=?)
            ORDER BY r.created_at ASC
        ");
        $pend->execute([$tid, $tid]);
        $pending = array_map(fn($r) => [
            'user_id' => (int) $r['user_id'], 'name' => display_name($r), 'phone' => $r['phone'],
        ], $pend->fetchAll());

        $entriesTotal = (int) $pdo->query("SELECT COUNT(*) FROM entries WHERE tournament_id=$tid")->fetchColumn();
        $money        = (int) $pdo->query("SELECT COALESCE(SUM(amount),0) FROM entries WHERE tournament_id=$tid")->fetchColumn();
        $active       = (int) $pdo->query("SELECT COUNT(*) FROM tournament_players WHERE tournament_id=$tid AND status='active'")->fetchColumn();
        $total        = count($players);
        $chipsInPlay  = $entriesTotal * (int) $tour['stack'];

        json_out([
            'tournament' => [
                'id' => (int) $tour['id'], 'title' => $tour['title'], 'status' => $tour['status'],
                'table_size' => (int) $tour['table_size'], 'buyin' => (int) $tour['buyin'], 'stack' => (int) $tour['stack'],
            ],
            'players' => $players, 'pending' => $pending,
            'clock' => tournament_clock($pdo, $tid),
            'summary' => [
                'players' => $total, 'active' => $active, 'entries' => $entriesTotal,
                'money' => $money, 'chips_in_play' => $chipsInPlay,
                'avg_stack' => $active > 0 ? (int) round($chipsInPlay / $active) : 0,
            ],
        ]);
        break;
    }

    case 'checkin': {
        only_method('POST');
        if (!$tid) json_out(['error' => 'no_tournament'], 400);
        $uid = resolve_user($pdo, $body);
        $amount = (int) ($body['amount'] ?? 0);

        $ex = $pdo->prepare('SELECT id FROM tournament_players WHERE tournament_id=? AND user_id=?');
        $ex->execute([$tid, $uid]);
        if ($ex->fetch()) json_out(['error' => 'already_in', 'message' => 'Игрок уже на турнире'], 409);

        $num = (int) $pdo->query("SELECT COALESCE(MAX(player_number),0)+1 FROM tournament_players WHERE tournament_id=$tid")->fetchColumn();
        $pdo->prepare('INSERT INTO tournament_players (tournament_id, user_id, player_number, status) VALUES (?,?,?,\'active\')')
            ->execute([$tid, $uid, $num]);
        $pdo->prepare('INSERT INTO entries (tournament_id, user_id, kind, amount) VALUES (?,?,\'buyin\',?)')
            ->execute([$tid, $uid, $amount]);
        $tsize = (int) ($pdo->query("SELECT table_size FROM tournaments WHERE id=$tid")->fetchColumn() ?: 9);
        assign_open_seat($pdo, $tid, $tsize, $uid); // посадить, если рассадка уже сделана
        json_out(['ok' => true, 'player_number' => $num, 'user_id' => $uid]);
        break;
    }

    case 'entry': { // перезаход или аддон
        only_method('POST');
        $uid  = uid_from($pdo, $tid, $body);
        $kind = in_array($body['kind'] ?? '', ['reentry', 'addon'], true) ? $body['kind'] : 'reentry';
        $amount = (int) ($body['amount'] ?? 0);
        if (!$tid || !$uid) json_out(['error' => 'no_player', 'message' => 'Игрок с таким номером не найден'], 404);
        $tp = $pdo->prepare('SELECT * FROM tournament_players WHERE tournament_id=? AND user_id=?');
        $tp->execute([$tid, $uid]);
        if (!$tp->fetch()) json_out(['error' => 'not_player', 'message' => 'Игрока нет на турнире — сначала чек-ин'], 404);

        $pdo->prepare('INSERT INTO entries (tournament_id, user_id, kind, amount) VALUES (?,?,?,?)')
            ->execute([$tid, $uid, $kind, $amount]);
        if ($kind === 'reentry') {
            $pdo->prepare("UPDATE tournament_players SET status='active', place=NULL WHERE tournament_id=? AND user_id=?")
                ->execute([$tid, $uid]);
            $tsize = (int) ($pdo->query("SELECT table_size FROM tournaments WHERE id=$tid")->fetchColumn() ?: 9);
            assign_open_seat($pdo, $tid, $tsize, $uid); // пересадить на свободное место
        }
        json_out(['ok' => true]);
        break;
    }

    case 'bust': { // вылет → авто-место по порядку выбывания
        only_method('POST');
        $uid = uid_from($pdo, $tid, $body);
        if (!$tid || !$uid) json_out(['error' => 'no_player', 'message' => 'Игрок с таким номером не найден'], 404);
        $place = (int) $pdo->query("SELECT COUNT(*) FROM tournament_players WHERE tournament_id=$tid AND status='active'")->fetchColumn();
        $pdo->prepare("UPDATE tournament_players SET status='busted', place=?, table_no=NULL, seat_no=NULL WHERE tournament_id=? AND user_id=? AND status='active'")
            ->execute([$place, $tid, $uid]);
        json_out(['ok' => true, 'place' => $place]);
        break;
    }

    case 'reactivate': { // отмена вылета (исправление)
        only_method('POST');
        $uid = uid_from($pdo, $tid, $body);
        if (!$uid) json_out(['error' => 'no_player'], 404);
        $pdo->prepare("UPDATE tournament_players SET status='active', place=NULL WHERE tournament_id=? AND user_id=?")
            ->execute([$tid, $uid]);
        $tsize = (int) ($pdo->query("SELECT table_size FROM tournaments WHERE id=$tid")->fetchColumn() ?: 9);
        assign_open_seat($pdo, $tid, $tsize, $uid);
        json_out(['ok' => true]);
        break;
    }

    case 'seat_draw': { // жеребьёвка/пересборка рассадки активных игроков
        only_method('POST');
        if (!$tid) json_out(['error' => 'no_tournament'], 400);
        $size = (int) ($pdo->query("SELECT table_size FROM tournaments WHERE id=$tid")->fetchColumn() ?: 9);
        $ids = array_map('intval', array_column(
            $pdo->query("SELECT user_id FROM tournament_players WHERE tournament_id=$tid AND status='active' ORDER BY RAND()")->fetchAll(),
            'user_id'
        ));
        // сброс рассадки
        $pdo->query("UPDATE tournament_players SET table_no=NULL, seat_no=NULL WHERE tournament_id=$tid");
        $n = count($ids);
        $tables = max(1, (int) ceil($n / $size));
        $upd = $pdo->prepare("UPDATE tournament_players SET table_no=?, seat_no=? WHERE tournament_id=? AND user_id=?");
        $seatCounter = array_fill(1, $tables, 0);
        foreach ($ids as $i => $uid) {
            $t = ($i % $tables) + 1;          // раскидываем по кругу — столы ровные
            $seat = ++$seatCounter[$t];
            $upd->execute([$t, $seat, $tid, $uid]);
        }
        json_out(['ok' => true, 'tables' => $tables, 'seated' => $n]);
        break;
    }

    case 'move': { // ручной перенос игрока за стол/место
        only_method('POST');
        $uid = uid_from($pdo, $tid, $body);
        if (!$uid) json_out(['error' => 'no_player', 'message' => 'Игрок с таким номером не найден'], 404);
        $table = (int) ($body['table_no'] ?? 0) ?: null;
        $seat  = (int) ($body['seat_no'] ?? 0) ?: null;

        if ($table !== null && $seat === null) {
            // место не указали — первое свободное за этим столом
            $t = $pdo->prepare("SELECT seat_no FROM tournament_players WHERE tournament_id=? AND table_no=? AND status='active' AND user_id<>? AND seat_no IS NOT NULL");
            $t->execute([$tid, $table, $uid]);
            $busy = array_map('intval', array_column($t->fetchAll(), 'seat_no'));
            $seat = 1; while (in_array($seat, $busy, true)) $seat++;
        } elseif ($table !== null && $seat !== null) {
            // если место занято другим — освобождаем того (он сядет при пересборке)
            $pdo->prepare("UPDATE tournament_players SET seat_no=NULL WHERE tournament_id=? AND table_no=? AND seat_no=? AND user_id<>?")
                ->execute([$tid, $table, $seat, $uid]);
        }
        $pdo->prepare("UPDATE tournament_players SET table_no=?, seat_no=? WHERE tournament_id=? AND user_id=?")
            ->execute([$table, $seat, $tid, $uid]);
        json_out(['ok' => true, 'table_no' => $table, 'seat_no' => $seat]);
        break;
    }

    case 'levels_get': {
        $rows = $pdo->query("SELECT idx,sb,bb,ante,duration_min,is_break,title FROM tournament_levels WHERE tournament_id=$tid ORDER BY idx")->fetchAll();
        json_out(['levels' => $rows]);
        break;
    }

    case 'levels_default': {
        only_method('POST');
        if (!$tid) json_out(['error' => 'no_tournament'], 400);
        $structs = blind_structures();
        $key = (string) ($body['structure'] ?? 'andrey');
        if (!isset($structs[$key])) $key = array_key_first($structs);
        $st = $structs[$key];
        $pdo->query("DELETE FROM tournament_levels WHERE tournament_id=$tid");
        $ins = $pdo->prepare("INSERT INTO tournament_levels (tournament_id,idx,sb,bb,ante,duration_min,is_break,title) VALUES (?,?,?,?,?,?,?,?)");
        $i = 1;
        foreach ($st['levels'] as [$sb, $bb, $ante, $min, $brk, $title]) {
            $ins->execute([$tid, $i++, $sb, $bb, $ante, $min, $brk, $title]);
        }
        // приводим стартовый стек турнира к стеку структуры
        $pdo->prepare("UPDATE tournaments SET stack=? WHERE id=?")->execute([(int) $st['stack'], $tid]);
        json_out(['ok' => true, 'count' => $i - 1, 'structure' => $key, 'label' => $st['label'], 'stack' => (int) $st['stack']]);
        break;
    }

    case 'structures': { // список именованных структур для выбора в консоли
        $out = [];
        foreach (blind_structures() as $k => $s) {
            $out[] = ['key' => $k, 'label' => $s['label'], 'stack' => (int) $s['stack'], 'levels' => count($s['levels'])];
        }
        json_out(['structures' => $out]);
        break;
    }

    case 'levels_set': {
        only_method('POST');
        if (!$tid) json_out(['error' => 'no_tournament'], 400);
        $levels = $body['levels'] ?? [];
        if (!is_array($levels) || !$levels) json_out(['error' => 'bad_input', 'message' => 'Нет уровней'], 422);
        $pdo->query("DELETE FROM tournament_levels WHERE tournament_id=$tid");
        $ins = $pdo->prepare("INSERT INTO tournament_levels (tournament_id,idx,sb,bb,ante,duration_min,is_break,title) VALUES (?,?,?,?,?,?,?,?)");
        $i = 1;
        foreach ($levels as $l) {
            $brk = !empty($l['is_break']) ? 1 : 0;
            $ins->execute([$tid, $i++, (int)($l['sb']??0), (int)($l['bb']??0), (int)($l['ante']??0),
                max(1,(int)($l['duration_min']??20)), $brk, $l['title'] ?? null]);
        }
        json_out(['ok' => true, 'count' => $i - 1]);
        break;
    }

    case 'start': {
        only_method('POST');
        $cnt = (int) $pdo->query("SELECT COUNT(*) FROM tournament_levels WHERE tournament_id=$tid")->fetchColumn();
        if ($cnt === 0) json_out(['error' => 'no_levels', 'message' => 'Сначала задайте структуру блайндов'], 422);
        $pdo->prepare("UPDATE tournaments SET status='running', current_level=1, level_started_at=NOW(), clock_paused=0, paused_left=NULL WHERE id=?")->execute([$tid]);
        json_out(['ok' => true]);
        break;
    }

    case 'pause': {
        only_method('POST');
        $c = tournament_clock($pdo, $tid);
        if (($c['status'] ?? '') === 'running' && empty($c['paused'])) {
            $pdo->prepare("UPDATE tournaments SET clock_paused=1, paused_left=? WHERE id=?")->execute([(int) $c['remaining'], $tid]);
        }
        json_out(['ok' => true]);
        break;
    }

    case 'resume': {
        only_method('POST');
        $left = (int) ($pdo->query("SELECT paused_left FROM tournaments WHERE id=$tid")->fetchColumn() ?: 0);
        $dur  = (int) ($pdo->query("SELECT l.duration_min FROM tournament_levels l JOIN tournaments t ON t.id=l.tournament_id AND t.current_level=l.idx WHERE t.id=$tid")->fetchColumn() ?: 20) * 60;
        $back = max(0, $dur - $left);
        $pdo->prepare("UPDATE tournaments SET clock_paused=0, paused_left=NULL, level_started_at = NOW() - INTERVAL ? SECOND WHERE id=?")->execute([$back, $tid]);
        json_out(['ok' => true]);
        break;
    }

    case 'next_level': case 'prev_level': {
        only_method('POST');
        $total = (int) $pdo->query("SELECT COUNT(*) FROM tournament_levels WHERE tournament_id=$tid")->fetchColumn();
        $cur = (int) $pdo->query("SELECT current_level FROM tournaments WHERE id=$tid")->fetchColumn();
        $cur += ($action === 'next_level') ? 1 : -1;
        $cur = max(1, min($total ?: 1, $cur));
        $pdo->prepare("UPDATE tournaments SET current_level=?, level_started_at=NOW(), clock_paused=0, paused_left=NULL WHERE id=?")->execute([$cur, $tid]);
        json_out(['ok' => true, 'level' => $cur]);
        break;
    }

    case 'finish': {
        only_method('POST');
        $pdo->prepare("UPDATE tournaments SET status='finished', clock_paused=1 WHERE id=?")->execute([$tid]);
        json_out(['ok' => true]);
        break;
    }

    case 'finalize': { // завершить турнир и начислить очки на финальный стол
        only_method('POST');
        if (!$tid) json_out(['error' => 'no_tournament'], 400);
        $tour = $pdo->query("SELECT stack FROM tournaments WHERE id=$tid")->fetch();

        // победитель = последний активный
        $act = $pdo->query("SELECT user_id FROM tournament_players WHERE tournament_id=$tid AND status='active'")->fetchAll();
        if (count($act) > 1) {
            json_out(['error' => 'too_many_active', 'message' => 'Оставьте одного игрока (победителя) — отметьте вылеты остальных'], 409);
        }
        if (count($act) === 1) {
            $pdo->prepare("UPDATE tournament_players SET status='busted', place=1, table_no=NULL, seat_no=NULL WHERE tournament_id=? AND user_id=?")
                ->execute([$tid, (int) $act[0]['user_id']]);
        }

        $entries = (int) $pdo->query("SELECT COUNT(*) FROM entries WHERE tournament_id=$tid")->fetchColumn();
        $stack   = (int) $tour['stack'];
        $pool    = (int) round($entries * $stack / 100); // банк очков = фишки в игре ÷ 100
        $totalPlayers = (int) $pdo->query("SELECT COUNT(*) FROM tournament_players WHERE tournament_id=$tid")->fetchColumn();

        $curve = [30, 20, 14, 11, 8, 6, 5, 4, 2]; // доли мест 1..9, %
        $paid = max(1, min(9, $totalPlayers));
        $norm = array_sum(array_slice($curve, 0, $paid));

        $awarded = [];
        for ($p = 1; $p <= $paid; $p++) {
            $pts = (int) round($pool * $curve[$p - 1] / $norm);
            $u = $pdo->prepare("SELECT user_id FROM tournament_players WHERE tournament_id=? AND place=? LIMIT 1");
            $u->execute([$tid, $p]);
            $uid = (int) ($u->fetchColumn() ?: 0);
            if (!$uid) continue;
            $pdo->prepare("INSERT INTO results (user_id,tournament_id,place,points) VALUES (?,?,?,?)
                           ON DUPLICATE KEY UPDATE place=VALUES(place), points=VALUES(points)")
                ->execute([$uid, $tid, $p, $pts]);
            // уведомление
            $tg = $pdo->query("SELECT tg_id FROM users WHERE id=$uid")->fetchColumn();
            tg_send($tg ? (int) $tg : null, "🏁 Турнир завершён!\n{$p} место · <b>+{$pts}</b> очков в рейтинг ♠");
            award_achievements($uid);
            $awarded[] = ['place' => $p, 'user_id' => $uid, 'points' => $pts];
        }

        $pdo->prepare("UPDATE tournaments SET status='finished', clock_paused=1 WHERE id=?")->execute([$tid]);
        json_out(['ok' => true, 'pool' => $pool, 'paid_places' => $paid, 'awarded' => $awarded]);
        break;
    }

    case 'set_status': { // ручная смена статуса (scheduled/running/final/finished)
        only_method('POST');
        $st = in_array($body['status'] ?? '', ['scheduled','running','final','finished'], true) ? $body['status'] : null;
        if (!$st) json_out(['error' => 'bad_status'], 422);
        $pdo->prepare("UPDATE tournaments SET status=? WHERE id=?")->execute([$st, $tid]);
        json_out(['ok' => true]);
        break;
    }

    default:
        json_out(['error' => 'unknown_action'], 400);
}
