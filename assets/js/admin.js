/* ===== Зацеп имеется — админка ===== */
const API = 'api/';
const root = document.getElementById('root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');

async function api(path, opts = {}) {
  const res = await fetch(API + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { throw new Error('not-json'); }
  if (!res.ok) { const e = new Error(data.error || 'http'); e.status = res.status; e.data = data; throw e; }
  return data;
}
const adminApi = (action, payload) =>
  api('admin.php', { method: 'POST', body: JSON.stringify({ action, ...payload }) });

function dtLocalValue(mysql) { return mysql ? mysql.replace(' ', 'T').slice(0, 16) : ''; }
function dtHuman(mysql) {
  if (!mysql) return '';
  const [d, t] = mysql.split(' ');
  const [y, mo, da] = d.split('-');
  return `${da}.${mo}.${y} ${t.slice(0,5)}`;
}
const FORMATS = { classic: 'Классика', bounty: 'Баунти', guest: 'Гостевой' };

/* ---------- init ---------- */
(async function init() {
  let me;
  try { me = await api('me.php'); }
  catch { root.innerHTML = '<div class="panel" style="margin-top:40px;"><h3>Бэкенд недоступен</h3><p class="muted">Админка работает только на боевом хостинге (PHP+MySQL).</p></div>'; return; }

  if (!me.user) {
    root.innerHTML = `<div class="panel" style="margin-top:40px;"><h3>Нужен вход</h3><p class="muted">Войдите через Telegram, чтобы открыть админку.</p><a href="account.html" class="btn btn-primary btn-sm" style="margin-top:14px;">Войти</a></div>`;
    return;
  }
  if (!me.user.is_admin) {
    root.innerHTML = `<div class="panel" style="margin-top:40px;"><h3>Доступ только для администраторов</h3><p class="muted">Твой аккаунт (#${me.user.id}) не админ. Попроси добавить тебя в список администраторов.</p></div>`;
    return;
  }
  renderShell(me.user);
  loadTournaments();
  loadUsers();
})();

function renderShell(user) {
  root.innerHTML = `
    <div class="admin-head">
      <div><h1 style="font-size:1.8rem;">Админка</h1><p class="muted">Привет, ${esc(user.first_name || user.nick || 'админ')} 👋</p></div>
      <button class="btn btn-primary btn-sm" id="newBtn">+ Новый турнир</button>
    </div>
    <div class="panel" id="formPanel" hidden></div>
    <div class="panel"><div class="panel-head"><h3>Турниры</h3></div><div id="tlist"><p class="muted">Загрузка…</p></div></div>
    <div class="panel" style="margin-top:22px;">
      <div class="panel-head" style="flex-wrap:wrap;gap:10px;">
        <h3>Игроки · CRM</h3>
        <input id="uSearch" placeholder="Поиск: имя, ник, телефон…" style="flex:1;min-width:180px;max-width:320px;padding:8px 12px;border-radius:10px;border:1px solid var(--line,#333);background:transparent;color:inherit;">
      </div>
      <div id="uStats" class="muted" style="margin-bottom:12px;"></div>
      <div id="uList"><p class="muted">Загрузка…</p></div>
    </div>
    <div class="panel" style="margin-top:22px;"><div class="panel-head"><h3>Дубли по телефону</h3><button class="btn btn-ghost btn-sm" id="dupBtn">Проверить</button></div><div id="dupList"><p class="muted">Нажми «Проверить», чтобы найти аккаунты с одинаковым номером.</p></div></div>`;
  document.getElementById('newBtn').addEventListener('click', () => openForm());
  document.getElementById('dupBtn').addEventListener('click', loadDuplicates);
  document.getElementById('uSearch').addEventListener('input', (e) => renderUsers(e.target.value));
}

/* ---------- Игроки · CRM ---------- */
let USERS = [];
async function loadUsers() {
  const { users } = await adminApi('users');
  USERS = users;
  renderUsers(document.getElementById('uSearch')?.value || '');
}

function uName(u) { return u.real_name || u.nick || u.first_name || (u.username ? '@' + u.username : ('Игрок #' + u.id)); }

function renderUsers(q = '') {
  const box = document.getElementById('uList');
  const stats = document.getElementById('uStats');
  q = q.trim().toLowerCase();
  const list = USERS.filter(u => !q ||
    uName(u).toLowerCase().includes(q) ||
    (u.nick || '').toLowerCase().includes(q) ||
    (u.phone || '').toLowerCase().includes(q) ||
    (u.username || '').toLowerCase().includes(q));

  const totSpent = USERS.reduce((s, u) => s + Number(u.spent || 0), 0);
  const totPlayers = USERS.length;
  const offline = USERS.filter(u => u.consent_offline == 1).length;
  stats.innerHTML = `Игроков: <b>${totPlayers}</b> · показано: <b>${list.length}</b> · суммарные взносы: <b>${fmt(totSpent)} ₽</b> · офлайн-согласий: <b>${offline}</b>`;

  if (!list.length) { box.innerHTML = '<p class="muted">Никого не найдено.</p>'; return; }

  const rows = list.map(u => {
    const contacts = [u.phone, u.username ? '@' + u.username : '', u.tg_id ? 'ТГ' : ''].filter(Boolean).join(' · ') || '—';
    const on = u.consent_online == 1 ? '<span class="c-ok" title="Согласие принято онлайн">онлайн ✓</span>' : '';
    const off = u.consent_offline == 1
      ? `<span class="c-ok" title="Подписано офлайн${u.consent_offline_at ? ' · ' + dtHuman(u.consent_offline_at) : ''}">офлайн ✓</span>` : '';
    const consent = (on + ' ' + off).trim() || '<span class="muted">—</span>';
    return `<tr data-uid="${u.id}">
      <td>${u.id}</td>
      <td><b>${esc(uName(u))}</b>${u.is_admin == 1 ? ' <span class="c-ok">админ</span>' : ''}${u.nick && u.nick !== u.real_name ? `<br><span class="muted">«${esc(u.nick)}»</span>` : ''}</td>
      <td class="muted" style="white-space:nowrap;">${esc(contacts)}</td>
      <td style="text-align:center;">${u.played}${Number(u.itm) ? ` <span class="muted">/ ${u.itm} ITM</span>` : ''}</td>
      <td style="text-align:right;white-space:nowrap;">${fmt(u.spent)} ₽</td>
      <td style="text-align:right;">${fmt(u.points)}</td>
      <td style="white-space:nowrap;">${consent}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn btn-ghost btn-sm u-off">${u.consent_offline == 1 ? 'Снять офлайн' : 'Отметить офлайн'}</button>
      </td>
    </tr>`;
  }).join('');

  box.innerHTML = `<div style="overflow-x:auto;">
    <table class="crm-table" style="width:100%;border-collapse:collapse;font-size:.9rem;">
      <thead><tr style="text-align:left;color:var(--muted,#999);">
        <th>#</th><th>Игрок</th><th>Контакты</th><th>Турниров</th><th>Взносы</th><th>Очки</th><th>Согласие</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  box.querySelectorAll('tr[data-uid]').forEach(tr => {
    const uid = Number(tr.dataset.uid);
    tr.querySelector('.u-off').addEventListener('click', async (e) => {
      const u = USERS.find(x => x.id === uid);
      const turnOn = u.consent_offline != 1;
      if (turnOn && !confirm(`Отметить, что ${uName(u)} подписал(а) согласие офлайн?`)) return;
      try {
        await adminApi('user_consent', { user_id: uid, offline: turnOn });
        u.consent_offline = turnOn ? 1 : 0;
        u.consent_offline_at = turnOn ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
        renderUsers(document.getElementById('uSearch').value);
      } catch (err) { alert(err.data?.message || 'Ошибка'); }
    });
  });
}

async function loadDuplicates() {
  const box = document.getElementById('dupList');
  box.innerHTML = '<p class="muted">Загрузка…</p>';
  const { groups } = await adminApi('duplicates');
  if (!groups.length) { box.innerHTML = '<p class="muted">Дублей по телефону нет 👍</p>'; return; }
  box.innerHTML = groups.map(g => {
    const keep = g.users.find(u => u.tg_id) || g.users[0];
    const rows = g.users.map(u => `<div class="history-item"><span>#${u.id} <b>${esc(u.nick || u.real_name || '—')}</b>${u.tg_id ? ' · ТГ ' + (u.username ? '@' + esc(u.username) : '✓') : ''}${u.is_admin == 1 ? ' · админ' : ''} · результатов: ${u.results}</span>${u.id === keep.id ? '<span class="hi-place">оставить</span>' : '<span class="muted">удалить</span>'}</div>`).join('');
    return `<div class="trow" style="flex-direction:column;align-items:stretch;" data-keep="${keep.id}" data-ids="${g.users.map(u => u.id).join(',')}">
      <div class="t-main"><h4>${esc(g.phone)}</h4>${rows}</div>
      <div style="margin-top:10px;"><button class="btn btn-primary btn-sm dup-merge">Объединить в #${keep.id}</button></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.dup-merge').forEach(b => b.addEventListener('click', async () => {
    const row = b.closest('[data-keep]');
    const keep = Number(row.dataset.keep);
    const drops = row.dataset.ids.split(',').map(Number).filter(x => x !== keep);
    if (!confirm(`Объединить аккаунты в #${keep}? Данные перенесутся, лишние удалятся.`)) return;
    try { for (const d of drops) await adminApi('merge', { keep_id: keep, drop_id: d }); await loadDuplicates(); alert('Объединено ✅'); }
    catch (e) { alert(e.data?.message || 'Ошибка'); }
  }));
}

/* ---------- форма турнира ---------- */
function openForm(t = null) {
  const p = document.getElementById('formPanel');
  p.hidden = false;
  p.innerHTML = `
    <div class="panel-head"><h3>${t ? 'Изменить турнир' : 'Новый турнир'}</h3><button class="btn btn-ghost btn-sm" id="closeForm">Закрыть</button></div>
    <form id="tform" class="admin-form">
      <div class="full"><label class="lbl">Название</label><input name="title" value="${esc(t?.title || '')}" required></div>
      <div><label class="lbl">Формат</label><select name="format">${Object.entries(FORMATS).map(([v,l])=>`<option value="${v}" ${t?.format===v?'selected':''}>${l}</option>`).join('')}</select></div>
      <div><label class="lbl">Дата и время</label><input type="datetime-local" name="starts_at" value="${dtLocalValue(t?.starts_at)}" required></div>
      <div><label class="lbl">Мест</label><input type="number" name="seats" value="${t?.seats ?? 36}" min="1"></div>
      <div><label class="lbl">Взнос, ₽</label><input type="number" name="buyin" value="${t?.buyin ?? 1500}" min="0"></div>
      <div><label class="lbl">Стартовый стек</label><input type="number" name="stack" value="${t?.stack ?? 5000}" min="0"></div>
      <div><label class="lbl">Площадка</label><input name="venue" value="${esc(t?.venue || 'ТРЦ «Грин Хаус», Тюмень')}"></div>
      <div class="full"><label class="lbl">Описание</label><textarea name="description">${esc(t?.description || '')}</textarea></div>
      <label class="check full"><input type="checkbox" name="is_published" ${(!t || t.is_published==1)?'checked':''}> Опубликован (виден на сайте)</label>
      <div class="full"><button class="btn btn-primary" type="submit">${t ? 'Сохранить' : 'Создать турнир'}</button></div>
    </form>`;
  document.getElementById('closeForm').addEventListener('click', () => { p.hidden = true; });
  document.getElementById('tform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await adminApi('tournament_save', {
        id: t?.id || 0,
        title: f.title.value, format: f.format.value, starts_at: f.starts_at.value,
        seats: f.seats.value, buyin: f.buyin.value, stack: f.stack.value,
        venue: f.venue.value, description: f.description.value,
        is_published: f.is_published.checked,
      });
      p.hidden = true;
      loadTournaments();
    } catch (e) { alert(e.data?.message || 'Не удалось сохранить'); }
  });
}

/* ---------- список турниров ---------- */
async function loadTournaments() {
  const box = document.getElementById('tlist');
  const { tournaments } = await adminApi('tournaments');
  if (!tournaments.length) { box.innerHTML = '<p class="muted">Пока нет турниров. Создай первый 👆</p>'; return; }
  box.innerHTML = tournaments.map(t => `
    <div class="trow" data-id="${t.id}">
      <div class="t-main">
        <h4>${esc(t.title)} <span class="badge-pub ${t.is_published==1?'on':'off'}">${t.is_published==1?'опубликован':'скрыт'}</span></h4>
        <p>${FORMATS[t.format]} · ${dtHuman(t.starts_at)} · ${t.taken}/${t.seats} мест · взнос ${fmt(t.buyin)} ₽</p>
      </div>
      <div class="t-actions">
        <a class="btn btn-primary btn-sm" href="td.html?t=${t.id}">▶ Вести</a>
        <button class="btn btn-ghost btn-sm act-regs">Записи</button>
        <button class="btn btn-ghost btn-sm act-edit">Изменить</button>
        <button class="btn btn-sm btn-danger act-del">Удалить</button>
      </div>
      <div class="regs-box" hidden></div>
    </div>`).join('');

  box.querySelectorAll('.trow').forEach(row => {
    const id = Number(row.dataset.id);
    const t = tournaments.find(x => x.id === id);
    row.querySelector('.act-edit').addEventListener('click', () => { openForm(t); window.scrollTo(0,0); });
    row.querySelector('.act-del').addEventListener('click', async () => {
      if (!confirm(`Удалить турнир «${t.title}»? Записи и результаты тоже удалятся.`)) return;
      await adminApi('tournament_delete', { id }); loadTournaments();
    });
    row.querySelector('.act-regs').addEventListener('click', () => toggleRegs(row, id));
  });
}

/* ---------- записи на турнир ---------- */
async function toggleRegs(row, tid) {
  const box = row.querySelector('.regs-box');
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<p class="muted">Загрузка…</p>';
  const { registrations } = await adminApi('registrations', { tournament_id: tid });

  box.innerHTML = `
    <div class="mini-form" style="margin-bottom:16px;">
      <input class="rp-phone" placeholder="+7 900 000-00-00" style="width:170px;">
      <input class="rp-nick" placeholder="Ник (необяз.)" style="width:140px;">
      <button class="btn btn-primary btn-sm rp-add">Записать по телефону</button>
    </div>
    <div class="rp-list">${renderRegs(registrations, tid)}</div>`;

  box.querySelector('.rp-add').addEventListener('click', async () => {
    const phone = box.querySelector('.rp-phone').value.trim();
    const nick = box.querySelector('.rp-nick').value.trim();
    try { await adminApi('reg_add', { tournament_id: tid, phone, nick }); box.querySelector('.rp-phone').value=''; box.querySelector('.rp-nick').value=''; await refreshRegs(box, tid); }
    catch (e) { alert(e.data?.message || 'Не удалось записать'); }
  });
  bindRegActions(box, tid);
}

function renderRegs(regs, tid) {
  if (!regs.length) return '<p class="muted">Никто ещё не записан.</p>';
  return regs.map((r, i) => `
    <div class="reg-item" data-uid="${r.user_id}">
      <div class="reg-date" style="width:auto;min-width:34px;"><span class="d" style="font-size:1.1rem;">${i+1}</span></div>
      <div class="reg-info" style="flex:1;">
        <h4>${esc(r.real_name || r.nick || r.first_name || ('@'+(r.username||'игрок')))} ${r.status==='waitlist'?'<span class="status-pill wait">лист ожидания</span>':''}</h4>
        <p>${esc([r.nick && r.nick!==r.real_name ? '«'+r.nick+'»' : '', r.phone, r.username?'@'+r.username:''].filter(Boolean).join(' · ') || '—')}</p>
      </div>
      <div class="mini-form">
        <button class="btn btn-sm btn-danger reg-cancel">Снять</button>
      </div>
    </div>`).join('');
}

function bindRegActions(box, tid) {
  box.querySelectorAll('.reg-item').forEach(item => {
    const uid = Number(item.dataset.uid);
    item.querySelector('.reg-cancel').addEventListener('click', async () => {
      if (!confirm('Снять игрока с турнира?')) return;
      await adminApi('reg_cancel', { tournament_id: tid, user_id: uid });
      await refreshRegs(box, tid);
    });
  });
}

async function refreshRegs(box, tid) {
  const { registrations } = await adminApi('registrations', { tournament_id: tid });
  box.querySelector('.rp-list').innerHTML = renderRegs(registrations, tid);
  bindRegActions(box, tid);
}
