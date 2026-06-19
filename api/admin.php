<?php
/** Админ-API: турниры, записи, результаты. Только для is_admin. */
declare(strict_types=1);
require __DIR__ . '/lib.php';

require_admin();
$pdo = db();

$body   = json_in();
$action = $_GET['action'] ?? $body['action'] ?? '';

function norm_dt(string $s): string
{
    $s = str_replace('T', ' ', trim($s));
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $s)) {
        $s .= ':00';
    }
    return $s;
}

switch ($action) {

    case 'tournaments': // список всех турниров (вкл. снятые с публикации)
        $rows = $pdo->query("
            SELECT t.*,
              (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id=t.id AND r.status<>'cancelled') AS taken
            FROM tournaments t ORDER BY t.starts_at DESC
        ")->fetchAll();
        json_out(['tournaments' => $rows]);
        break;

    case 'tournament_save':
        only_method('POST');
        $id    = (int) ($body['id'] ?? 0);
        $title = trim((string) ($body['title'] ?? ''));
        $format = in_array($body['format'] ?? '', ['classic','bounty','guest'], true) ? $body['format'] : 'classic';
        $starts = norm_dt((string) ($body['starts_at'] ?? ''));
        $venue  = trim((string) ($body['venue'] ?? 'ТРЦ «Грин Хаус», Тюмень'));
        $buyin  = (int) ($body['buyin'] ?? 0);
        $stack  = (int) ($body['stack'] ?? 0);
        $seats  = max(1, (int) ($body['seats'] ?? 36));
        $desc   = trim((string) ($body['description'] ?? ''));
        $pub    = !empty($body['is_published']) ? 1 : 0;
        if ($title === '' || !preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $starts)) {
            json_out(['error' => 'bad_input', 'message' => 'Заполните название и дату/время'], 422);
        }
        if ($id) {
            $st = $pdo->prepare('UPDATE tournaments SET title=?,format=?,starts_at=?,venue=?,buyin=?,stack=?,seats=?,description=?,is_published=? WHERE id=?');
            $st->execute([$title,$format,$starts,$venue,$buyin,$stack,$seats,$desc,$pub,$id]);
        } else {
            $st = $pdo->prepare('INSERT INTO tournaments (title,format,starts_at,venue,buyin,stack,seats,description,is_published) VALUES (?,?,?,?,?,?,?,?,?)');
            $st->execute([$title,$format,$starts,$venue,$buyin,$stack,$seats,$desc,$pub]);
            $id = (int) $pdo->lastInsertId();
        }
        json_out(['ok' => true, 'id' => $id]);
        break;

    case 'tournament_delete':
        only_method('POST');
        $st = $pdo->prepare('DELETE FROM tournaments WHERE id=?');
        $st->execute([(int) ($body['id'] ?? 0)]);
        json_out(['ok' => true]);
        break;

    case 'registrations': // ?tournament_id=
        $tid = (int) ($_GET['tournament_id'] ?? $body['tournament_id'] ?? 0);
        $st = $pdo->prepare("
            SELECT r.id, r.status, r.created_at, u.id AS user_id, u.nick, u.real_name, u.first_name, u.username, u.phone
            FROM registrations r JOIN users u ON u.id=r.user_id
            WHERE r.tournament_id=? AND r.status<>'cancelled'
            ORDER BY r.created_at ASC
        ");
        $st->execute([$tid]);
        json_out(['registrations' => $st->fetchAll()]);
        break;

    case 'reg_add': // ручная запись по телефону
        only_method('POST');
        $tid   = (int) ($body['tournament_id'] ?? 0);
        $phone = normalize_phone((string) ($body['phone'] ?? ''));
        $nick  = trim((string) ($body['nick'] ?? ''));
        if (!$tid || strlen(preg_replace('/\D/', '', $phone)) < 10) {
            json_out(['error' => 'bad_input', 'message' => 'Нужен турнир и корректный телефон'], 422);
        }
        // найти игрока по телефону или создать «оффлайн»-карточку
        $f = $pdo->prepare('SELECT * FROM users WHERE phone=? LIMIT 1');
        $f->execute([$phone]);
        $player = $f->fetch();
        if (!$player) {
            $ins = $pdo->prepare('INSERT INTO users (nick, phone, onboarded) VALUES (?,?,1)');
            $ins->execute([$nick !== '' ? $nick : ('Гость ' . substr($phone, -4)), $phone]);
            $uid = (int) $pdo->lastInsertId();
            $tg = null;
        } else {
            $uid = (int) $player['id'];
            $tg = $player['tg_id'] ?? null;
            if ($nick !== '' && empty($player['nick'])) {
                $pdo->prepare('UPDATE users SET nick=? WHERE id=?')->execute([$nick, $uid]);
            }
        }
        $cnt = $pdo->prepare("SELECT COUNT(*) FROM registrations WHERE tournament_id=? AND status<>'cancelled'");
        $cnt->execute([$tid]);
        $tour = $pdo->query('SELECT * FROM tournaments WHERE id=' . $tid)->fetch();
        if (!$tour) json_out(['error' => 'tournament_not_found'], 404);
        $status = ((int) $cnt->fetchColumn() >= (int) $tour['seats']) ? 'waitlist' : 'confirmed';
        $pdo->prepare("INSERT INTO registrations (user_id,tournament_id,status) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)")
            ->execute([$uid, $tid, $status]);
        if ($tg) {
            $when = date('d.m в H:i', strtotime((string) $tour['starts_at']));
            tg_send((int) $tg, "✅ Тебя записали на турнир\n<b>" . htmlspecialchars($tour['title']) . "</b> · {$when}");
        }
        json_out(['ok' => true, 'status' => $status, 'user_id' => $uid]);
        break;

    case 'reg_cancel':
        only_method('POST');
        $pdo->prepare("UPDATE registrations SET status='cancelled' WHERE tournament_id=? AND user_id=?")
            ->execute([(int) ($body['tournament_id'] ?? 0), (int) ($body['user_id'] ?? 0)]);
        json_out(['ok' => true]);
        break;

    case 'result_add': // внести результат игроку → рейтинг + ачивки + уведомление
        only_method('POST');
        $tid    = (int) ($body['tournament_id'] ?? 0);
        $uid    = (int) ($body['user_id'] ?? 0);
        $place  = isset($body['place']) && $body['place'] !== '' ? (int) $body['place'] : null;
        $points = (int) ($body['points'] ?? 0);
        if (!$tid || !$uid) json_out(['error' => 'bad_input'], 422);
        $pdo->prepare('INSERT INTO results (user_id,tournament_id,place,points) VALUES (?,?,?,?)')
            ->execute([$uid, $tid, $place, $points]);
        // уведомление о результате
        $tg = $pdo->query('SELECT tg_id FROM users WHERE id=' . $uid)->fetchColumn();
        $tour = $pdo->query('SELECT title FROM tournaments WHERE id=' . $tid)->fetchColumn();
        if ($tg) {
            $pl = $place ? "{$place} место" : 'участие';
            tg_send((int) $tg, "🏁 Результат турнира <b>" . htmlspecialchars((string) $tour) . "</b>:\n{$pl} · +{$points} очков в рейтинг");
        }
        $new = award_achievements($uid);
        json_out(['ok' => true, 'new_achievements' => $new]);
        break;

    default:
        json_out(['error' => 'unknown_action'], 400);
}
