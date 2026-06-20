/* ===== Зацеп имеется — маска телефона для всех полей type=tel ===== */
(function () {
  function fmt(v) {
    let d = v.replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    else if (d[0] === '9') d = '7' + d;     // ввели сразу 9XX...
    else if (d[0] !== '7') d = '7' + d;     // форсим РФ
    d = d.slice(0, 11);
    let r = '+7';
    if (d.length > 1) r += ' (' + d.slice(1, 4);
    if (d.length >= 4) r += ') ' + d.slice(4, 7);
    if (d.length >= 7) r += '-' + d.slice(7, 9);
    if (d.length >= 9) r += '-' + d.slice(9, 11);
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
