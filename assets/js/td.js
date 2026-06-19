/* ===== Зацеп имеется — консоль турнир-директора (Фаза 1) ===== */
const API = 'api/';
const root = document.getElementById('root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const TID = Number(new URLSearchParams(location.search).get('t') || 0);
let T = null; // данные турнира

async function api(path, opts = {}) {
  const res = await fetch(API + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  const txt = await res.text(); let data;
  try { data = JSON.parse(txt); } catch { throw new Error('not-json'); }
  if (!res.ok) { const e = new Error(data.error || 'http'); e.status = res.status; e.data = data; throw e; }
  return data;
}
const td = (action, payload) => api('td.php', { method: 'POST', body: JSON.stringify({ action, tournament_id: TID, ...payload }) });

const STATUS_RU = { scheduled: 'анонс', running: 'идёт', final: 'финалка', finished: 'завершён' };
const statusRu = (s) => STATUS_RU[s] || s;
function fmtClock(sec) { sec = Math.max(0, sec | 0); const m = Math.floor(sec / 60), s = sec % 60; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function blindsStr(lv) { if (!lv) return '—'; if (lv.is_break) return lv.title || 'Перерыв'; return `${fmt(lv.sb)} / ${fmt(lv.bb)}${lv.ante ? ' · анте ' + fmt(lv.ante) : ''}`; }

function clockBoxHTML(c) {
  if (!c || !c.has_levels) return '<p class="muted">Структура блайндов не задана.</p>';
  const cur = c.current || {};
  return `
    <div style="font-family:var(--font-head);font-weight:700;font-size:3rem;color:var(--accent);line-height:1;" id="clkTime">${fmtClock(c.remaining)}</div>
    <div class="muted" style="margin:6px 0 10px;">Уровень <b id="clkLevel">${c.level}</b> из ${c.total}${c.paused ? ' · ⏸ пауза' : ''}</div>
    <div style="font-family:var(--font-head);font-weight:600;font-size:1.3rem;" id="clkBlinds">${blindsStr(cur)}</div>
    <div class="muted" style="font-size:.85rem;margin-top:4px;" id="clkNext">Далее: ${blindsStr(c.next)}</div>`;
}

function clockControls(c, status) {
  if (!c || !c.has_levels) return `<button class="btn btn-primary btn-sm" id="lvlDefault">Применить стандартную структуру (15 уровней)</button>`;
  if (status === 'running' || status === 'final') {
    return `
      ${c.paused ? '<button class="btn btn-primary btn-sm" id="clkResume">▶ Продолжить</button>' : '<button class="btn btn-ghost btn-sm" id="clkPause">⏸ Пауза</button>'}
      <button class="btn btn-ghost btn-sm" id="clkPrev">◀ уровень</button>
      <button class="btn btn-ghost btn-sm" id="clkNextBtn">уровень ▶</button>
      <button class="btn btn-sm btn-danger" id="clkFinish">🏁 Финиш</button>`;
  }
  return `<button class="btn btn-primary btn-sm" id="clkStart">▶ Старт турнира</button>
          <button class="btn btn-ghost btn-sm" id="lvlDefault">Сбросить структуру (стандарт)</button>`;
}

(async function init() {
  if (!TID) { root.innerHTML = '<p class="muted" style="padding-top:40px;">Не указан турнир. Откройте из админки.</p>'; return; }
  let me;
  try { me = await api('me.php'); } catch { root.innerHTML = '<div class="panel" style="margin-top:40px;"><h3>Бэкенд недоступен</h3></div>'; return; }
  if (!me.user || !me.user.is_admin) { root.innerHTML = '<div class="panel" style="margin-top:40px;"><h3>Только для администраторов</h3><a href="account.html" class="btn btn-primary btn-sm" style="margin-top:12px;">Войти</a></div>'; return; }
  load();
})();

async function load() {
  let d;
  try { d = await api(`td.php?action=players&tournament_id=${TID}`); }
  catch (e) { root.innerHTML = `<p class="muted" style="padding-top:40px;">Ошибка: ${esc(e.data?.message || e.message)}</p>`; return; }
  T = d.tournament;
  render(d);
}

function render(d) {
  const s = d.summary;
  root.innerHTML = `
    <div class="admin-head">
      <div><h1 style="font-size:1.7rem;">${esc(T.title)}</h1><p class="muted">Управление турниром · стол ${T.table_size}-max</p></div>
      <a href="admin.html" class="btn btn-ghost btn-sm">К списку</a>
    </div>

    <div class="dash-stats" style="margin-bottom:22px;">
      <div class="dstat"><div class="ic">👥</div><div class="n">${s.active}</div><div class="l">в игре сейчас</div><div class="delta">из ${s.players} игроков</div></div>
      <div class="dstat"><div class="ic">🔁</div><div class="n">${s.entries}</div><div class="l">закупов всего</div></div>
      <div class="dstat"><div class="ic">💰</div><div class="n">${fmt(s.money)} ₽</div><div class="l">касса вечера</div></div>
      <div class="dstat"><div class="ic">🃏</div><div class="n">${fmt(s.avg_stack)}</div><div class="l">средний стек</div><div class="delta">${fmt(s.chips_in_play)} фишек в игре</div></div>
    </div>

    <div class="panel" style="margin-bottom:22px;">
      <div class="panel-head"><h3>⏱ Часы турнира · <span id="clkStatus">${statusRu(T.status)}</span></h3>
        <a class="btn btn-ghost btn-sm" href="live.html?t=${TID}" target="_blank">📺 Табло</a></div>
      <div id="clockBox" style="text-align:center;padding:6px 0 18px;">${clockBoxHTML(d.clock)}</div>
      <div class="mini-form" style="justify-content:center;">${clockControls(d.clock, T.status)}</div>
    </div>

    <div class="panel" style="margin-bottom:22px;">
      <div class="panel-head"><h3>⚡ По номеру бэйджа</h3></div>
      <div class="mini-form">
        <input id="qNum" type="number" inputmode="numeric" placeholder="№" style="width:90px;font-size:1.2rem;font-family:var(--font-head);">
        <button class="btn btn-sm btn-danger" id="qBust">Вылет</button>
        <button class="btn btn-primary btn-sm" id="qReentry">+ перезаход</button>
        <button class="btn btn-ghost btn-sm" id="qAddon">+ аддон</button>
      </div>
    </div>

    <div class="panel" style="margin-bottom:22px;">
      <div class="panel-head"><h3>Рассадка</h3><button class="btn btn-primary btn-sm" id="drawBtn">🎲 Жеребьёвка / пересобрать</button></div>
      <div id="seatMap">${seatMapHTML(d.players)}</div>
      <div class="mini-form" style="margin-top:16px;padding-top:16px;border-top:1px dashed var(--line);">
        <span class="muted" style="font-size:.85rem;">Вручную:</span>
        <input id="mvNum" type="number" placeholder="№ бэйджа" style="width:110px;">
        <input id="mvTable" type="number" placeholder="стол" style="width:80px;">
        <input id="mvSeat" type="number" placeholder="место (необяз.)" style="width:140px;">
        <button class="btn btn-primary btn-sm" id="mvBtn">Посадить</button>
        <button class="btn btn-ghost btn-sm" id="mvOff">Снять со стола</button>
      </div>
    </div>

    <div class="panel" style="margin-bottom:22px;">
      <div class="panel-head"><h3>Чек-ин игрока</h3></div>
      ${d.pending.length ? `
        <div class="mini-form" style="margin-bottom:14px;">
          <select id="pendSel" style="padding:11px 14px;border-radius:12px;background:var(--bg-2);border:1px solid var(--line);color:var(--text);min-width:200px;">
            <option value="">— записанные онлайн —</option>
            ${d.pending.map(p => `<option value="${p.user_id}">${esc(p.name)}${p.phone ? ' · ' + esc(p.phone) : ''}</option>`).join('')}
          </select>
          <input id="pendAmt" type="number" value="${T.buyin}" style="width:110px;" title="сумма">
          <button class="btn btn-primary btn-sm" id="pendBtn">Чек-ин + закуп</button>
        </div>` : ''}
      <div class="mini-form">
        <input id="ciName" placeholder="Фамилия Имя" style="width:150px;">
        <input id="ciNick" placeholder="Ник" style="width:110px;">
        <input id="ciPhone" placeholder="Телефон" style="width:150px;">
        <input id="ciAmt" type="number" value="${T.buyin}" style="width:100px;" title="сумма">
        <button class="btn btn-primary btn-sm" id="ciBtn">Добавить нового</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Игроки (${d.players.length})</h3></div>
      ${d.players.length ? d.players.map(rowHTML).join('') : '<p class="muted">Пока никто не на чек-ине.</p>'}
    </div>`;

  // чек-ин из списка записанных
  const pendBtn = document.getElementById('pendBtn');
  pendBtn?.addEventListener('click', async () => {
    const uid = Number(document.getElementById('pendSel').value);
    if (!uid) { alert('Выберите игрока'); return; }
    await act(() => td('checkin', { user_id: uid, amount: Number(document.getElementById('pendAmt').value) }));
  });
  // новый игрок
  document.getElementById('ciBtn').addEventListener('click', async () => {
    const real_name = document.getElementById('ciName').value.trim();
    const nick = document.getElementById('ciNick').value.trim();
    const phone = document.getElementById('ciPhone').value.trim();
    if (!nick && !phone) { alert('Нужен ник или телефон'); return; }
    await act(() => td('checkin', { real_name, nick, phone, amount: Number(document.getElementById('ciAmt').value) }));
  });

  // быстрые действия по номеру бэйджа
  const qn = () => { const n = Number(document.getElementById('qNum').value); if (!n) { alert('Введите номер бэйджа'); return null; } return n; };
  document.getElementById('qBust').addEventListener('click', () => { const n = qn(); if (n && confirm(`Вылет игрока №${n}?`)) act(() => td('bust', { number: n })); });
  document.getElementById('qReentry').addEventListener('click', () => { const n = qn(); if (n) act(() => td('entry', { number: n, kind: 'reentry', amount: T.buyin })); });
  document.getElementById('qAddon').addEventListener('click', () => { const n = qn(); if (n) act(() => td('entry', { number: n, kind: 'addon', amount: T.buyin })); });
  document.getElementById('drawBtn').addEventListener('click', () => { if (confirm('Пересобрать рассадку активных игроков? Текущие места изменятся.')) act(() => td('seat_draw', {})); });
  // ручная посадка
  document.getElementById('mvBtn').addEventListener('click', () => {
    const n = Number(document.getElementById('mvNum').value), tbl = Number(document.getElementById('mvTable').value), st = Number(document.getElementById('mvSeat').value);
    if (!n || !tbl) { alert('Введите номер бэйджа и стол'); return; }
    act(() => td('move', { number: n, table_no: tbl, seat_no: st || 0 }));
  });
  document.getElementById('mvOff').addEventListener('click', () => {
    const n = Number(document.getElementById('mvNum').value);
    if (!n) { alert('Введите номер бэйджа'); return; }
    act(() => td('move', { number: n, table_no: 0 }));
  });

  // часы
  document.getElementById('clkStart')?.addEventListener('click', () => act(() => td('start', {})));
  document.getElementById('clkPause')?.addEventListener('click', () => act(() => td('pause', {})));
  document.getElementById('clkResume')?.addEventListener('click', () => act(() => td('resume', {})));
  document.getElementById('clkPrev')?.addEventListener('click', () => act(() => td('prev_level', {})));
  document.getElementById('clkNextBtn')?.addEventListener('click', () => act(() => td('next_level', {})));
  document.getElementById('clkFinish')?.addEventListener('click', async () => {
    if (!confirm('Завершить турнир и начислить очки на финальный стол? Оставь в игре только победителя.')) return;
    try {
      const r = await td('finalize', {});
      alert(`🏁 Турнир завершён!\nБанк: ${fmt(r.pool)} очков, роздано на ${r.paid_places} мест.`);
      await load();
    } catch (e) { alert(e.data?.message || 'Не удалось завершить'); }
  });
  document.getElementById('lvlDefault')?.addEventListener('click', () => { if (confirm('Применить стандартную структуру блайндов? Текущая будет заменена.')) act(() => td('levels_default', {})); });
  startClockPoll();

  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const uid = Number(b.dataset.uid), a = b.dataset.act;
    if (a === 'bust') { if (!confirm('Отметить вылет игрока?')) return; act(() => td('bust', { user_id: uid })); }
    else if (a === 'reactivate') act(() => td('reactivate', { user_id: uid }));
    else if (a === 'reentry') act(() => td('entry', { user_id: uid, kind: 'reentry', amount: T.buyin }));
    else if (a === 'addon') act(() => td('entry', { user_id: uid, kind: 'addon', amount: T.buyin }));
  }));
}

function seatMapHTML(players) {
  const active = players.filter(p => p.status === 'active');
  const seated = active.filter(p => p.table_no);
  const unseated = active.filter(p => !p.table_no);
  if (!seated.length && !unseated.length) return '<p class="muted">Нет активных игроков.</p>';
  const tables = {};
  seated.forEach(p => { (tables[p.table_no] = tables[p.table_no] || []).push(p); });
  let html = '';
  if (!seated.length) html += '<p class="muted">Рассадка ещё не сделана — нажми «Жеребьёвка».</p>';
  html += Object.keys(tables).map(Number).sort((a, b) => a - b).map(tn => {
    const ps = tables[tn].sort((a, b) => (a.seat_no || 0) - (b.seat_no || 0));
    return `<div style="margin-bottom:14px;">
      <div style="font-family:var(--font-head);font-weight:600;color:var(--accent);margin-bottom:6px;">Стол ${tn} <span class="muted" style="font-weight:400;">· ${ps.length} игр.</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${ps.map(p => `<span style="background:var(--bg-2);border:1px solid var(--line);border-radius:10px;padding:7px 12px;font-size:.88rem;">${p.seat_no}. <b>№${p.number}</b> ${esc(p.name)}</span>`).join('')}
      </div></div>`;
  }).join('');
  if (unseated.length) html += `<p class="muted" style="margin-top:8px;">Без места (${unseated.length}): ${unseated.map(p => '№' + p.number).join(', ')} — нажми «Жеребьёвка».</p>`;
  return html;
}

function rowHTML(p) {
  const busted = p.status === 'busted';
  const seat = (p.table_no ? `стол ${p.table_no}` : 'без стола') + (p.seat_no ? `, место ${p.seat_no}` : '');
  return `<div class="trow" style="${busted ? 'opacity:.55;' : ''}">
    <div class="reg-date" style="width:48px;min-width:48px;"><span class="d" style="font-size:1.2rem;">${p.number}</span></div>
    <div class="t-main">
      <h4>${esc(p.name)} ${busted ? `<span class="status-pill wait">вылет · ${p.place || '—'} место</span>` : ''}</h4>
      <p>${seat} · закупов: ${p.entries} · оплачено ${fmt(p.paid)} ₽${p.points != null ? ` · <span style="color:var(--accent)">+${fmt(p.points)} очков</span>` : ''}</p>
    </div>
    <div class="t-actions">
      ${busted
        ? `<button class="btn btn-primary btn-sm" data-act="reentry" data-uid="${p.user_id}">+ перезаход</button>
           <button class="btn btn-ghost btn-sm" data-act="reactivate" data-uid="${p.user_id}">вернуть в игру</button>`
        : `<button class="btn btn-ghost btn-sm" data-act="addon" data-uid="${p.user_id}">+ аддон</button>
           <button class="btn btn-sm btn-danger" data-act="bust" data-uid="${p.user_id}">вылет</button>`}
    </div>
  </div>`;
}

async function act(fn) {
  try { await fn(); await load(); }
  catch (e) { alert(e.data?.message || 'Ошибка операции'); }
}

function startClockPoll() {
  if (window.__clk) clearInterval(window.__clk);
  const tick = async () => {
    if (!document.getElementById('clockBox')) { clearInterval(window.__clk); return; }
    let c; try { c = (await api('clock.php?t=' + TID)).clock; } catch { return; }
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('clkTime', fmtClock(c.remaining)); set('clkLevel', c.level);
    set('clkBlinds', blindsStr(c.current)); set('clkNext', 'Далее: ' + blindsStr(c.next));
  };
  tick();
  window.__clk = setInterval(tick, 1000);
}
