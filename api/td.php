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

switch ($action) {

    case 'players': {
        if (!$tid) json_out(['error' => 'no_tournament'], 400);
        $tour = $pdo->query('SELECT * FROM tournaments WHERE id=' . $tid)->fetch();
        if (!$tour) json_out(['error' => 'tournament_not_found'], 404);

        $st = $pdo->prepare("
            SELECT tp.player_number, tp.table_no, tp.seat_no, tp.status, tp.place,
                   u.id AS user_id, u.nick, u.real_name, u.first_name, u.username,
                   (SELECT COUNT(*) FROM entries e WHERE e.tournament_id=tp.tournament_id AND e.user_id=tp.user_id) AS entries,
                   (SELECT COALESCE(SUM(e.amount),0) FROM entries e WHERE e.tournament_id=tp.tournament_id AND e.user_id=tp.user_id) AS paid
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
        json_out(['ok' => true, 'player_number' => $num, 'user_id' => $uid]);
        break;
    }

    case 'entry': { // перезаход или аддон
        only_method('POST');
        $uid  = (int) ($body['user_id'] ?? 0);
        $kind = in_array($body['kind'] ?? '', ['reentry', 'addon'], true) ? $body['kind'] : 'reentry';
        $amount = (int) ($body['amount'] ?? 0);
        if (!$tid || !$uid) json_out(['error' => 'bad_input'], 422);
        $tp = $pdo->prepare('SELECT * FROM tournament_players WHERE tournament_id=? AND user_id=?');
        $tp->execute([$tid, $uid]);
        if (!$tp->fetch()) json_out(['error' => 'not_player', 'message' => 'Игрока нет на турнире — сначала чек-ин'], 404);

        $pdo->prepare('INSERT INTO entries (tournament_id, user_id, kind, amount) VALUES (?,?,?,?)')
            ->execute([$tid, $uid, $kind, $amount]);
        if ($kind === 'reentry') {
            $pdo->prepare("UPDATE tournament_players SET status='active', place=NULL WHERE tournament_id=? AND user_id=?")
                ->execute([$tid, $uid]);
        }
        json_out(['ok' => true]);
        break;
    }

    case 'bust': { // вылет → авто-место по порядку выбывания
        only_method('POST');
        $uid = (int) ($body['user_id'] ?? 0);
        if (!$tid || !$uid) json_out(['error' => 'bad_input'], 422);
        $place = (int) $pdo->query("SELECT COUNT(*) FROM tournament_players WHERE tournament_id=$tid AND status='active'")->fetchColumn();
        $pdo->prepare("UPDATE tournament_players SET status='busted', place=? WHERE tournament_id=? AND user_id=? AND status='active'")
            ->execute([$place, $tid, $uid]);
        json_out(['ok' => true, 'place' => $place]);
        break;
    }

    case 'reactivate': { // отмена вылета (исправление)
        only_method('POST');
        $uid = (int) ($body['user_id'] ?? 0);
        $pdo->prepare("UPDATE tournament_players SET status='active', place=NULL WHERE tournament_id=? AND user_id=?")
            ->execute([$tid, $uid]);
        json_out(['ok' => true]);
        break;
    }

    default:
        json_out(['error' => 'unknown_action'], 400);
}
