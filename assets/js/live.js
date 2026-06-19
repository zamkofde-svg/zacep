/* ===== Зацеп имеется — лайв-табло для ТВ ===== */
const TID = Number(new URLSearchParams(location.search).get('t') || 0);
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const $ = (id) => document.getElementById(id);
const STATUS = { scheduled: 'Скоро старт', running: 'Идёт игра', final: 'Финальный стол', finished: 'Завершён' };
function fmtClock(s) { s = Math.max(0, s | 0); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function blinds(lv) { return lv ? `${fmt(lv.sb)} / ${fmt(lv.bb)}` : '—'; }

let endAt = null, paused = true; // локальный тик между опросами

async function sync() {
  if (!TID) { $('mid').innerHTML = '<div class="idle">Не указан турнир (?t=ID)</div>'; return; }
  let d;
  try { d = await (await fetch('api/clock.php?t=' + TID, { cache: 'no-store' })).json(); } catch { return; }
  if (d.error) { $('mid').innerHTML = '<div class="idle">Турнир не найден</div>'; return; }

  $('ttl').textContent = d.tournament.title;
  $('st').textContent = STATUS[d.tournament.status] || d.tournament.status;
  const s = d.summary;
  $('mActive').textContent = `${s.active}/${s.players}`;
  $('mEntries').textContent = fmt(s.entries);
  $('mAvg').textContent = fmt(s.avg_stack);
  $('mChips').textContent = fmt(s.chips_in_play);

  const c = d.clock;
  if (d.tournament.status !== 'running' || !c.has_levels) {
    endAt = null; paused = true;
    $('mid').innerHTML = `<div class="idle">${d.tournament.status === 'finished' ? '🏁 Турнир завершён' : 'Турнир ещё не запущен'}</div>`;
    return;
  }
  paused = !!c.paused;
  endAt = paused ? null : (Date.now() + c.remaining * 1000);
  const cur = c.current || {};
  const mid = $('mid');
  if (cur.is_break) {
    mid.innerHTML = `<div class="lvl">Уровень ${c.level} / ${c.total}</div>
      <div class="timer ${paused ? 'paused' : ''}" id="t">${fmtClock(c.remaining)}</div>
      <div class="break-big">☕ ${cur.title || 'ПЕРЕРЫВ'}</div>
      <div class="nextb">Далее: ${blinds(c.next)}</div>`;
  } else {
    mid.innerHTML = `<div class="lvl">Уровень ${c.level} / ${c.total}${paused ? ' · ПАУЗА' : ''}</div>
      <div class="timer ${paused ? 'paused' : ''}" id="t">${fmtClock(c.remaining)}</div>
      <div class="blinds">${fmt(cur.sb)} / ${fmt(cur.bb)} ${cur.ante ? `<small>анте ${fmt(cur.ante)}</small>` : ''}</div>
      <div class="nextb">Далее: ${c.next ? (c.next.is_break ? (c.next.title || 'перерыв') : blinds(c.next)) : 'финал'}</div>`;
  }
}

// локальный посекундный тик (плавный отсчёт между синхронизациями)
function tick() {
  const t = $('t');
  if (t && endAt && !paused) t.textContent = fmtClock((endAt - Date.now()) / 1000);
}

sync();
setInterval(sync, 3000); // ресинк с сервером (смена уровня/пауза)
setInterval(tick, 250);  // плавный отсчёт
