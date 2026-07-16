/* ===== Зацеп имеется — маска телефона для всех полей type=tel ===== */
(function () {
  function fmt(v) {
    const raw = v.replace(/\D/g, '');
    if (raw === '') return '';                 // пустое поле оставляем пустым
    // откидываем код страны/междугородний (любые ведущие 7 и 8) —
    // всё остальное это национальный номер (у РФ-мобильных начинается с 9)
    const d = raw.replace(/^[78]+/, '').slice(0, 10);
    let r = '+7';
    if (d.length > 0) r += ' (' + d.slice(0, 3);
    if (d.length >= 3) r += ') ' + d.slice(3, 6);
    if (d.length >= 6) r += '-' + d.slice(6, 8);
    if (d.length >= 8) r += '-' + d.slice(8, 10);
    return r;
  }
  // делегирование — ловит и динамически созданные поля (админка/консоль)
  document.addEventListener('input', function (e) {
    const t = e.target;
    if (!t || !t.matches || !t.matches('input[type="tel"]')) return;
    const atEnd = t.selectionStart >= t.value.length;
    t.value = fmt(t.value);
    if (atEnd) { try { t.setSelectionRange(t.value.length, t.value.length); } catch (_) {} }
  });
})();
