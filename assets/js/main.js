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

// ====== Leaderboard data + tabs ======
const RATING = {
  month: [
    { name: 'Слава Полный дом',      t: 12, itm: 8, pts: 2480 },
    { name: 'Нина Вильямс',          t: 14, itm: 7, pts: 2310 },
    { name: 'Леха Скин',             t: 11, itm: 7, pts: 2145 },
    { name: 'Егор большой трактор',  t: 10, itm: 6, pts: 1980 },
    { name: 'Данич Качок',           t: 13, itm: 5, pts: 1870 },
    { name: 'Вова Легенда',          t:  9, itm: 5, pts: 1640 },
    { name: 'Данич Букетный',        t:  8, itm: 4, pts: 1510 },
  ],
  season: [
    { name: 'Слава Полный дом',      t: 68, itm: 41, pts: 14820 },
    { name: 'Нина Вильямс',          t: 61, itm: 39, pts: 14310 },
    { name: 'Данич Качок',           t: 59, itm: 34, pts: 12640 },
    { name: 'Леха Скин',             t: 54, itm: 33, pts: 12145 },
    { name: 'Егор большой трактор',  t: 63, itm: 30, pts: 11870 },
    { name: 'Вова Легенда',          t: 48, itm: 26, pts: 10210 },
    { name: 'Данич Букетный',        t: 51, itm: 25, pts:  9640 },
  ],
  alltime: [
    { name: 'Слава Полный дом',      t: 412, itm: 256, pts: 98420 },
    { name: 'Данич Качок',           t: 388, itm: 231, pts: 91640 },
    { name: 'Нина Вильямс',          t: 351, itm: 219, pts: 88310 },
    { name: 'Вова Легенда',          t: 401, itm: 198, pts: 81870 },
    { name: 'Леха Скин',             t: 322, itm: 191, pts: 78145 },
    { name: 'Егор большой трактор',  t: 298, itm: 166, pts: 70210 },
    { name: 'Данич Букетный',        t: 287, itm: 142, pts: 60995 },
  ],
};

const lbBody = document.getElementById('lbBody');
const fmt = n => n.toLocaleString('ru-RU');
const medals = ['<span class="medal g">1</span>', '<span class="medal s">2</span>', '<span class="medal b">3</span>'];

function renderLB(tab) {
  if (!lbBody) return;
  lbBody.innerHTML = RATING[tab].map((p, i) => `
    <tr>
      <td class="rank">${i < 3 ? medals[i] : i + 1}</td>
      <td>${p.name}</td>
      <td class="num">${p.t}</td>
      <td class="num">${p.itm}</td>
      <td class="pts">${fmt(p.pts)}</td>
    </tr>`).join('');
}

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
  const main=tours.filter(t=>t.format!=='guest');
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
