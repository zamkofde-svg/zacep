/* ===== Зацеп имеется — личный кабинет =====
   Работает с PHP-бэкендом (api/*.php). Если бэкенд недоступен
   (например, на статичном превью GitHub Pages) — включается демо-режим. */

const API = 'api/';
let BACKEND = false;

const el = (id) => document.getElementById(id);
const views = { auth: 'view-auth', onb: 'view-onboarding', dash: 'view-dash' };
function show(view) {
  Object.values(views).forEach(v => el(v).hidden = (v !== views[view]));
}

const MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
function parseDt(s) { // "YYYY-MM-DD HH:MM:SS" -> Date (локально)
  if (!s) return null;
  const [d, t = '00:00:00'] = s.split(/[ T]/);
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi);
}
const dayNum = (s) => { const d = parseDt(s); return d ? d.getDate() : '—'; };
const monShort = (s) => { const d = parseDt(s); return d ? MONTHS[d.getMonth()] : ''; };
const timeStr = (s) => { const d = parseDt(s); return d ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : ''; };
const fmt = (n) => Number(n).toLocaleString('ru-RU');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('not-json'); } // на Pages PHP отдаётся текстом — значит бэка нет
  if (!res.ok) { const e = new Error(data.error || 'http'); e.status = res.status; e.data = data; throw e; }
  return data;
}

/* ---------------- Telegram Login Widget ---------------- */
async function mountTelegramWidget() {
  const box = el('tg-widget');
  try {
    const { tg_bot_username } = await api('config_public.php');
    if (!tg_bot_username) throw new Error('no-bot');
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.setAttribute('data-telegram-login', tg_bot_username);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '12');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    s.setAttribute('data-request-access', 'write');
    box.innerHTML = '';
    box.appendChild(s);
  } catch {
    box.innerHTML = '<p class="legal">Кнопка входа Telegram появится после настройки бота на боевом домене.</p>';
  }
  // диагностика мини-аппа — ПОД кнопкой, не вместо неё
  if (window.__tgDiag) {
    const d = document.createElement('p');
    d.className = 'legal';
    d.style.cssText = 'color:var(--danger);font-size:.75rem;margin-top:8px;';
    d.textContent = '⚠ ' + window.__tgDiag;
    box.appendChild(d);
  }
}

window.onTelegramAuth = async (user) => {
  try {
    await api('auth_telegram.php', { method: 'POST', body: JSON.stringify(user) });
    await route();
  } catch (e) {
    alert('Не удалось войти через Telegram. Попробуйте ещё раз.');
  }
};

/* ---------------- Онбординг ---------------- */
function bindOnboarding() {
  el('onboardingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const real_name = el('onbName').value.trim();
    const nick = el('onbNick').value.trim();
    const phone = el('onbPhone').value.trim();
    if (!el('onbConsent').checked) { alert('Подтвердите, что вам исполнилось 18 лет'); return; }
    try {
      await api('onboarding.php', { method: 'POST', body: JSON.stringify({ real_name, nick, phone }) });
      await route();
    } catch (e) {
      alert(e.data?.message || 'Проверьте ник и телефон');
    }
  });
}

/* ---------------- Вход/регистрация по телефону ---------------- */
function bindPhoneAuth() {
  const loginForm = el('phoneLoginForm');
  const regForm = el('phoneRegForm');
  if (!loginForm || !regForm) return;

  el('toRegister')?.addEventListener('click', (e) => { e.preventDefault(); loginForm.hidden = true; regForm.hidden = false; });
  el('toLogin')?.addEventListener('click', (e) => { e.preventDefault(); regForm.hidden = true; loginForm.hidden = false; });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!BACKEND) { alert('Вход по телефону работает на боевом сайте (zacep.fun).'); return; }
    try {
      await api('login_phone.php', { method: 'POST', body: JSON.stringify({ phone: el('liPhone').value.trim(), password: el('liPass').value }) });
      await route();
    } catch (e) { alert(e.data?.message || 'Не удалось войти'); }
  });

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!BACKEND) { alert('Регистрация работает на боевом сайте (zacep.fun).'); return; }
    if (!el('rgConsent').checked) { alert('Подтвердите согласие, чтобы продолжить'); return; }
    try {
      await api('register_phone.php', { method: 'POST', body: JSON.stringify({
        real_name: el('rgName').value.trim(), nick: el('rgNick').value.trim(),
        phone: el('rgPhone').value.trim(), password: el('rgPass').value,
      }) });
      await route();
    } catch (e) { alert(e.data?.message || 'Не удалось зарегистрироваться'); }
  });
}

/* ---------------- Дашборд ---------------- */
async function loadDashboard() {
  const [me, tours] = await Promise.all([api('my.php'), api('tournaments.php')]);
  renderDashboard(me, tours.tournaments || []);
}

function renderDashboard(me, tournaments) {
  const u = me.user, st = me.stats;
  const name = u.nick || u.first_name || ('@' + (u.username || 'игрок'));
  const initial = (name || 'И').trim().charAt(0).toUpperCase();
  const regs = me.registrations || [];
  const hist = me.history || [];

  const openTours = tournaments.filter(t => !t.my_status || t.my_status === 'cancelled');

  el('view-dash').innerHTML = `
    <div class="wrap">
      <div class="dash-head">
        <div class="profile">
          <div class="avatar">${esc(initial)}</div>
          <div class="who">
            <h2>${esc(name)}</h2>
            <div class="uid">ID игрока · #${u.id}</div>
            ${u.username ? `<div class="tg-tag">✈ @${esc(u.username)} · подключён</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:10px;">
          ${u.is_admin ? '<a href="admin.html" class="btn btn-ghost btn-sm">⚙ Админка</a>' : ''}
          <button class="logout" id="logout">Выйти</button>
        </div>
      </div>

      ${(me.seatings && me.seatings.length) ? me.seatings.map(s => `
      <div class="cta-banner reveal in" style="padding:26px 30px;text-align:left;margin-bottom:22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="font-family:var(--font-head);font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7);">Турнир идёт · ${esc(s.title)}</div>
          <div style="font-family:var(--font-head);font-weight:700;color:#fff;font-size:1.6rem;margin-top:4px;">Твой бэйдж №${s.number}</div>
        </div>
        <div style="font-family:var(--font-head);font-weight:700;color:#fff;font-size:1.4rem;">${s.table_no ? `Стол ${s.table_no} · место ${s.seat_no}` : 'Ждём рассадку'}</div>
      </div>`).join('') : ''}

      <div class="dash-stats">
        <div class="dstat"><div class="ic">🏅</div><div class="n">${st.place ? '#' + st.place : '—'}</div><div class="l">Место в рейтинге месяца</div><div class="delta">из ${fmt(st.total_players)} игроков</div></div>
        <div class="dstat"><div class="ic">⭐</div><div class="n">${fmt(st.month_points)}</div><div class="l">Очков в этом месяце</div></div>
        <div class="dstat"><div class="ic">🎫</div><div class="n">${st.played}</div><div class="l">Турниров сыграно</div></div>
        <div class="dstat"><div class="ic">💰</div><div class="n">${st.itm_percent}%</div><div class="l">Попаданий в призы (ITM)</div><div class="delta">${st.itm} из ${st.played}</div></div>
      </div>

      <div class="dash-cols">
        <div class="panel">
          <div class="panel-head"><h3>Мои записи</h3></div>
          ${regs.length ? regs.map(r => `
            <div class="reg-item">
              <div class="reg-date"><span class="d">${dayNum(r.starts_at)}</span><span class="m">${monShort(r.starts_at)}</span></div>
              <div class="reg-info"><h4>${esc(r.title)} · ${timeStr(r.starts_at)}</h4><p>${esc(r.venue || '')}</p></div>
              <span class="status-pill ${r.status === 'confirmed' ? 'ok' : 'wait'}">${r.status === 'confirmed' ? 'Подтверждено' : 'В ожидании'}</span>
            </div>`).join('') : '<p class="muted" style="padding:8px 0;">Пока нет записей. Запишись на ближайший турнир ниже 👇</p>'}

          <div class="panel-head" style="margin-top:30px;"><h3>Записаться на турнир</h3></div>
          ${openTours.length ? openTours.map(t => `
            <div class="reg-item">
              <div class="reg-date"><span class="d">${dayNum(t.starts_at)}</span><span class="m">${monShort(t.starts_at)}</span></div>
              <div class="reg-info"><h4>${esc(t.title)} · ${timeStr(t.starts_at)}</h4><p>${t.taken}/${t.seats} мест · взнос ${fmt(t.buyin)} ₽</p></div>
              <button class="btn btn-primary btn-sm reg-btn" data-tid="${t.id}" data-title="${esc(t.title)}">Записаться</button>
            </div>`).join('') : '<p class="muted" style="padding:8px 0;">Новые турниры скоро появятся.</p>'}

          <div class="panel-head" style="margin-top:30px;"><h3>История турниров</h3><a href="index.html#rating">Весь рейтинг →</a></div>
          ${hist.length ? hist.map(h => `
            <div class="history-item"><span>${dayNum(h.starts_at)} ${monShort(h.starts_at)} · ${esc(h.title)}</span><span class="hi-place">${h.place ? h.place + ' место' : '—'} · +${fmt(h.points)}</span></div>`).join('')
            : '<p class="muted" style="padding:8px 0;">Сыграй первый турнир — здесь появится история и очки.</p>'}
        </div>

        <div>
          <div class="panel" style="margin-bottom:22px;">
            <div class="panel-head"><h3>Рейтинг месяца</h3></div>
            <div class="rank-widget">
              <div class="place">${st.place ? '#' + st.place : '—'}</div>
              <div class="of">из ${fmt(st.total_players)} игроков</div>
              <div class="progress"><i style="width:${st.place && st.total_players ? Math.max(6, Math.round((1 - (st.place - 1) / st.total_players) * 100)) : 0}%"></i></div>
              <p class="hint">${st.month_points ? 'Очки идут в зачёт сезона. Играй больше — поднимайся выше.' : 'Сыграй турнир, чтобы попасть в рейтинг.'}</p>
            </div>
          </div>
          <div class="panel" style="margin-bottom:22px;">
            <div class="panel-head"><h3>Достижения</h3></div>
            ${(me.achievements && me.achievements.length)
              ? me.achievements.map(a => `<div class="history-item"><span>${a.emoji} ${esc(a.title)}</span></div>`).join('')
              : '<p class="muted" style="padding:8px 0;">Сыграй турниры — ачивки появятся здесь.</p>'}
          </div>
          <div class="panel">
            <div class="panel-head"><h3>Профиль</h3></div>
            <div class="history-item"><span>Фамилия и имя</span><span>${esc(u.real_name || '—')}</span></div>
            <div class="history-item"><span>Покерный ник</span><span class="hi-place">${esc(u.nick || '—')}</span></div>
            <div class="history-item"><span>Телефон</span><span>${esc(u.phone || '—')}</span></div>
            <div class="history-item"><span>Telegram</span><span>${u.tg_id ? (u.username ? '@' + esc(u.username) : 'привязан ✓') : '<span class="muted">не привязан</span>'}</span></div>
            ${!u.tg_id ? `<div style="padding-top:14px;">
              <p class="muted" style="font-size:.85rem;margin-bottom:10px;">Привяжи Telegram, чтобы получать уведомления о записи, результатах и ачивках:</p>
              <div id="linkTgBox" style="display:flex;justify-content:flex-start;min-height:40px;"></div>
            </div>` : ''}
          </div>
        </div>
      </div>

      ${BACKEND ? '' : '<div class="disclaimer" style="margin-top:30px;"><span class="age-badge">i</span><span>Демо-режим: бэкенд не подключён, данные примерные. На боевом хостинге (PHP+MySQL) вход и записи работают по-настоящему.</span></div>'}
    </div>`;

  el('logout').addEventListener('click', doLogout);
  document.querySelectorAll('.reg-btn').forEach(b => b.addEventListener('click', () => doRegister(b.dataset.tid, b.dataset.title)));
  if (!u.tg_id) mountLinkWidget('linkTgBox');
  window.scrollTo(0, 0);
}

/* ---------- Привязка Telegram к текущему аккаунту ---------- */
async function mountLinkWidget(id) {
  const box = document.getElementById(id);
  if (!box) return;
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initData) { // внутри мини-аппа
    box.innerHTML = '<button class="btn btn-primary btn-sm" id="linkTgMini">✈ Привязать этот Telegram</button>';
    document.getElementById('linkTgMini').addEventListener('click', async () => {
      try { await api('link_telegram.php', { method: 'POST', body: JSON.stringify({ initData: tg.initData }) }); alert('Telegram привязан ✅'); await loadDashboard(); }
      catch (e) { alert(e.data?.message || 'Не удалось привязать'); }
    });
    return;
  }
  try {
    const { tg_bot_username } = await api('config_public.php');
    if (!tg_bot_username) throw new Error('no-bot');
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.setAttribute('data-telegram-login', tg_bot_username);
    s.setAttribute('data-size', 'medium');
    s.setAttribute('data-radius', '12');
    s.setAttribute('data-onauth', 'onTelegramLink(user)');
    s.setAttribute('data-request-access', 'write');
    box.innerHTML = '';
    box.appendChild(s);
  } catch { box.innerHTML = '<p class="legal">Привязка появится после настройки бота.</p>'; }
}

window.onTelegramLink = async (user) => {
  try {
    await api('link_telegram.php', { method: 'POST', body: JSON.stringify(user) });
    alert('Telegram привязан ✅ Нажми Start у @zacepfun_bot, чтобы получать уведомления.');
    await loadDashboard();
  } catch (e) {
    alert(e.data?.message || 'Не удалось привязать Telegram');
  }
};

async function doRegister(tid, title) {
  if (!BACKEND) { alert('Демо-режим: на боевом сайте здесь произойдёт запись на турнир.'); return; }
  if (!confirm(`Записаться на турнир «${title}»?`)) return;
  try {
    const r = await api('register.php', { method: 'POST', body: JSON.stringify({ tournament_id: Number(tid) }) });
    alert(r.status === 'waitlist'
      ? 'Ты добавлен в лист ожидания — сообщим, как освободится место.'
      : '✅ Готово! Ты записан на турнир. Подтверждение пришло в Telegram.');
    await loadDashboard();
  } catch (e) {
    alert(e.data?.message || 'Не удалось записаться. Попробуйте позже.');
  }
}

async function doLogout() {
  if (BACKEND) { try { await api('logout.php', { method: 'POST' }); } catch {} }
  show('auth');
}

/* ---------------- Роутинг состояния ---------------- */
async function route() {
  const me = await api('me.php');
  if (!me.user) { show('auth'); await mountTelegramWidget(); return; }
  if (!me.user.onboarded) { show('onb'); return; }
  show('dash');
  await loadDashboard();
}

/* ---------------- Демо-режим (нет бэка) ---------------- */
function startDemo() {
  show('auth');
  el('tg-widget').innerHTML = '<button class="oauth-btn tg-login" id="demoLogin"><span class="oi tg">✈</span> Войти (демо)</button>';
  el('demoLogin').addEventListener('click', () => {
    const today = new Date();
    const iso = (addDays, h) => { const d = new Date(today); d.setDate(d.getDate() + addDays); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(h).padStart(2,'0')}:00:00`; };
    const me = {
      user: { id: 1042, username: 'artem_raise', first_name: 'Артём', real_name: 'Кузнецов Артём', nick: 'Артём «Рейз» К.', phone: '+7 900 000-00-00', onboarded: true },
      registrations: [
        { status: 'confirmed', title: 'Классика', starts_at: iso(2, 19), venue: 'ТРЦ «Грин Хаус», Тюмень' },
        { status: 'waitlist',  title: 'Баунти',   starts_at: iso(4, 17), venue: 'ТРЦ «Грин Хаус», Тюмень' },
      ],
      history: [
        { place: 2, points: 420, title: 'Классика', starts_at: iso(-4, 19) },
        { place: 1, points: 560, title: 'Баунти',   starts_at: iso(-6, 17) },
        { place: 5, points: 180, title: 'Классика', starts_at: iso(-9, 19) },
      ],
      stats: { month_points: 2480, place: 1, total_players: 1204, played: 12, itm: 8, itm_percent: 67 },
      achievements: [
        { emoji: '👑', title: 'Легенда стола' },
        { emoji: '🔥', title: 'Завсегдатай' },
        { emoji: '♠️', title: 'Первая победа' },
        { emoji: '🎲', title: 'Первый турнир' },
      ],
    };
    const tours = [
      { id: 1, title: 'Классика', starts_at: iso(2, 19), venue: 'ТРЦ «Грин Хаус», Тюмень', buyin: 1500, seats: 36, taken: 9, my_status: 'confirmed' },
      { id: 2, title: 'Баунти',   starts_at: iso(4, 17), venue: 'ТРЦ «Грин Хаус», Тюмень', buyin: 2500, seats: 36, taken: 14, my_status: 'waitlist' },
      { id: 3, title: 'Гостевой — бар «Коробок»', starts_at: iso(6, 18), venue: 'Бар «Коробок», Тюмень', buyin: 1500, seats: 27, taken: 5, my_status: null },
    ];
    show('dash');
    renderDashboard(me, tours);
  });
}

/* ---------------- Старт ---------------- */
(async function init() {
  bindOnboarding();
  bindPhoneAuth();
  // Telegram Mini App — авторизуемся автоматически по initData
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try { tg.ready(); tg.expand(); } catch {}
    if (tg.initData) {
      try {
        await api('auth_webapp.php', { method: 'POST', body: JSON.stringify({ initData: tg.initData }) });
        BACKEND = true;
        await route();
        return;
      } catch (e) {
        window.__tgDiag = 'Подпись не принята: ' + (e.data?.error || e.message);
      }
    } else {
      const has = !!(tg.initDataUnsafe && tg.initDataUnsafe.user);
      window.__tgDiag = `Telegram передал пустой initData. platform=${tg.platform || '?'} v=${tg.version || '?'} user=${has ? 'есть' : 'нет'}`;
    }
  }
  try {
    await api('me.php');       // проверяем, жив ли бэкенд
    BACKEND = true;
    await route();
  } catch (e) {
    BACKEND = false;
    startDemo();
  }
})();
