/* ====== Зацеп имеется — landing interactions ====== */

// Header shadow on scroll
const header = document.getElementById('header');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Mobile burger menu
const burger = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');
if (burger) {
  burger.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => navLinks.classList.remove('open'))
  );
}

// Reveal on scroll
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 80}ms`;
  io.observe(el);
});

// ====== Leaderboard (реальные данные из api/rating.php) + tabs ======
const lbBody = document.getElementById('lbBody');
const fmt = n => n.toLocaleString('ru-RU');
const medals = ['<span class="medal g">1</span>', '<span class="medal s">2</span>', '<span class="medal b">3</span>'];

const PERIOD_MAP = { month: 'month', season: 'season', alltime: 'all' };
const ratingCache = {};
async function renderLB(tab) {
  if (!lbBody) return;
  let list = ratingCache[tab];
  if (!list) {
    try {
      const r = await fetch('api/rating.php?period=' + (PERIOD_MAP[tab] || 'month'), { credentials: 'same-origin' });
      list = (await r.json()).rating || [];
      ratingCache[tab] = list;
    } catch { list = []; }
  }
  if (!list.length) {
    lbBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:26px;color:var(--muted)">Рейтинг появится после первых турниров.</td></tr>';
    return;
  }
  lbBody.innerHTML = list.map((p, i) => `
    <tr>
      <td class="rank">${i < 3 ? medals[i] : i + 1}</td>
      <td>${String(p.name || '').replace(/[<>]/g, '')}</td>
      <td class="num">${p.tournaments}</td>
      <td class="num">${p.itm}</td>
      <td class="pts">${fmt(p.points)}</td>
    </tr>`).join('');
}

// Hero-карточка «Рейтинг месяца» — реальный топ-5
async function loadHeroRating() {
  const box = document.getElementById('heroLb');
  if (!box) return;
  let list = [];
  try { list = (await fetch('api/rating.php?period=month', { credentials: 'same-origin' }).then(r => r.json())).rating || []; } catch {}
  if (!list.length) { box.innerHTML = '<p class="muted" style="padding:8px 0;font-size:.9rem;">Рейтинг обновится после первых турниров.</p>'; return; }
  box.innerHTML = list.slice(0, 5).map((p, i) => `
    <div class="lb-row${i === 0 ? ' top' : ''}"><span class="lb-rank">${i + 1}</span><span class="lb-name">${String(p.name || '').replace(/[<>]/g, '')}</span><span class="lb-pts">${fmt(p.points)}</span></div>`).join('');
}
loadHeroRating();

// ====== Динамические карточки турниров (с фолбэком на демо) ======
const WD = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];
const MON = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function parseDt(s){ if(!s) return null; const [d,t='00:00:00']=s.split(/[ T]/); const [y,mo,da]=d.split('-').map(Number); const [h,mi]=t.split(':').map(Number); return new Date(y,mo-1,da,h,mi); }
function dateLine(s){ const d=parseDt(s); if(!d) return ''; return `${WD[d.getDay()]} · ${d.getDate()} ${MON[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
const FMTLINE = { classic:"Texas Hold'em NL", bounty:'Knockout · очки за нокауты', guest:'Гостевой турнир · очки в рейтинг' };

function tcard(t, hit){
  const left = Math.max(0, (t.seats||0) - (t.taken||0));
  return `<div class="tcard reveal in">
    ${hit ? '<span class="ribbon">ХИТ</span>' : ''}
    <span class="date">${dateLine(t.starts_at)}</span>
    <h3>${(t.title||'').replace(/[<>]/g,'')}</h3>
    <p class="fmt">${FMTLINE[t.format]||FMTLINE.classic}</p>
    <div class="meta">
      <div><span>Стартовый стек</span><b>${fmt(t.stack||0)}</b></div>
      <div><span>Свободно мест</span><b>${left} из ${t.seats||0}</b></div>
      <div><span>Взнос</span><b>${fmt(t.buyin||0)} ₽</b></div>
    </div>
    <a href="account.html" class="btn btn-primary btn-block btn-sm">Записаться</a>
  </div>`;
}

function demoTours(){
  const now=new Date(); const mk=(addD,h)=>{const d=new Date(now); d.setDate(d.getDate()+addD); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(h).padStart(2,'0')}:00:00`;};
  return [
    {title:'Классика',format:'classic',starts_at:mk(1,19),stack:20000,seats:36,taken:9,buyin:1500},
    {title:'Баунти',format:'bounty',starts_at:mk(3,17),stack:30000,seats:36,taken:5,buyin:2500},
    {title:'Гостевой — бар «Коробок»',format:'guest',starts_at:mk(2,18),stack:25000,seats:27,taken:4,buyin:1500},
  ];
}

async function loadTours(){
  const grid=document.getElementById('tourGrid'); const guest=document.getElementById('guestGrid');
  if(!grid) return;
  let tours;
  try {
    const r=await fetch('api/tournaments.php',{credentials:'same-origin'});
    const txt=await r.text(); tours=JSON.parse(txt).tournaments;
    if(!Array.isArray(tours)) throw 0;
  } catch { tours=demoTours(); }
  const main=tours;                                  // в «Ближайших» показываем все, включая гостевые
  const gs=tours.filter(t=>t.format==='guest');
  grid.innerHTML = main.length ? main.map((t,i)=>tcard(t, i===0)).join('') : '<p class="muted">Ближайшие турниры скоро появятся — следи за анонсами.</p>';
  if(guest && gs.length) guest.insertAdjacentHTML('afterbegin', gs.map(t=>tcard(t,false)).join(''));
}
loadTours();

document.querySelectorAll('.lb-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelector('.lb-tab.active')?.classList.remove('active');
    tab.classList.add('active');
    renderLB(tab.dataset.tab);
  });
});
renderLB('month');
