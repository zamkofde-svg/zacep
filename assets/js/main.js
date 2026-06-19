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
    { name: 'Артём «Рейз» К.',  t: 12, itm: 8, pts: 2480 },
    { name: 'Дмитрий С.',        t: 14, itm: 7, pts: 2310 },
    { name: 'Ольга «Флоп» М.',  t: 11, itm: 7, pts: 2145 },
    { name: 'Никита В.',         t: 10, itm: 6, pts: 1980 },
    { name: 'Сергей П.',         t: 13, itm: 5, pts: 1870 },
    { name: 'Иван «Колл» Т.',   t:  9, itm: 5, pts: 1640 },
    { name: 'Марина З.',         t:  8, itm: 4, pts: 1510 },
    { name: 'Алексей Г.',        t: 10, itm: 4, pts: 1395 },
  ],
  season: [
    { name: 'Дмитрий С.',        t: 68, itm: 41, pts: 14820 },
    { name: 'Артём «Рейз» К.',  t: 61, itm: 39, pts: 14310 },
    { name: 'Никита В.',         t: 59, itm: 34, pts: 12640 },
    { name: 'Ольга «Флоп» М.',  t: 54, itm: 33, pts: 12145 },
    { name: 'Сергей П.',         t: 63, itm: 30, pts: 11870 },
    { name: 'Марина З.',         t: 48, itm: 26, pts: 10210 },
    { name: 'Иван «Колл» Т.',   t: 51, itm: 25, pts:  9640 },
    { name: 'Алексей Г.',        t: 47, itm: 22, pts:  8995 },
  ],
  alltime: [
    { name: 'Дмитрий С.',        t: 412, itm: 256, pts: 98420 },
    { name: 'Никита В.',         t: 388, itm: 231, pts: 91640 },
    { name: 'Артём «Рейз» К.',  t: 351, itm: 219, pts: 88310 },
    { name: 'Сергей П.',         t: 401, itm: 198, pts: 81870 },
    { name: 'Ольга «Флоп» М.',  t: 322, itm: 191, pts: 78145 },
    { name: 'Марина З.',         t: 298, itm: 166, pts: 70210 },
    { name: 'Иван «Колл» Т.',   t: 311, itm: 159, pts: 66640 },
    { name: 'Алексей Г.',        t: 287, itm: 142, pts: 60995 },
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

document.querySelectorAll('.lb-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelector('.lb-tab.active')?.classList.remove('active');
    tab.classList.add('active');
    renderLB(tab.dataset.tab);
  });
});
renderLB('month');
