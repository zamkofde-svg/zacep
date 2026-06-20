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
})();

function renderShell(user) {
  root.innerHTML = `
    <div class="admin-head">
      <div><h1 style="font-size:1.8rem;">Админка</h1><p class="muted">Привет, ${esc(user.first_name || user.nick || 'админ')} 👋</p></div>
      <button class="btn btn-primary btn-sm" id="newBtn">+ Новый турнир</button>
    </div>
    <div class="panel" id="formPanel" hidden></div>
    <div class="panel"><div class="panel-head"><h3>Турниры</h3></div><div id="tlist"><p class="muted">Загрузка…</p></div></div>
    <div class="panel" style="margin-top:22px;"><div class="panel-head"><h3>Дубли по телефону</h3><button class="btn btn-ghost btn-sm" id="dupBtn">Проверить</button></div><div id="dupList"><p class="muted">Нажми «Проверить», чтобы найти аккаунты с одинаковым номером.</p></div></div>`;
  document.getElementById('newBtn').addEventListener('click', () => openForm());
  document.getElementById('dupBtn').addEventListener('click', loadDuplicates);
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
      <div><label class="lbl">Стартовый стек</label><input type="number" name="stack" value="${t?.stack ?? 20000}" min="0"></div>
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
        <input class="res-place" type="number" placeholder="место" min="1">
        <input class="res-points" type="number" placeholder="очки" min="0">
        <button class="btn btn-primary btn-sm res-add">Результат</button>
        <button class="btn btn-sm btn-danger reg-cancel">Снять</button>
      </div>
    </div>`).join('');
}

function bindRegActions(box, tid) {
  box.querySelectorAll('.reg-item').forEach(item => {
    const uid = Number(item.dataset.uid);
    item.querySelector('.res-add').addEventListener('click', async () => {
      const place = item.querySelector('.res-place').value;
      const points = item.querySelector('.res-points').value;
      try {
        const r = await adminApi('result_add', { tournament_id: tid, user_id: uid, place, points });
        const ach = (r.new_achievements || []).map(a => a.emoji + ' ' + a.title).join(', ');
        alert('Результат внесён.' + (ach ? '\nНовые ачивки: ' + ach : ''));
      } catch (e) { alert(e.data?.message || 'Ошибка'); }
    });
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
