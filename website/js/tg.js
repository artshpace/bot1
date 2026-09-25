/* ===== TELEGRAM MINI APP ADAPTER [v1.0] =====
   Делает публичный сайт полноценным Telegram Mini App: бот открывает
   SITE_URL кнопкой web_app / menu button, а этот адаптер разворачивает
   окно, подгоняет цвета под бренд и включает системную кнопку «Назад».
   Вне Telegram (обычный браузер) — молча ничего не делает. */
(function () {
  'use strict';
  var tg = window.Telegram && window.Telegram.WebApp;
  // initData не пустой только внутри Telegram — так отсекаем обычных посетителей.
  if (!tg || !tg.initData) return;

  try {
    tg.ready();
    tg.expand();
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); // чтобы свайп не закрывал приложение при скролле
  } catch (e) { /* ignore */ }

  document.documentElement.classList.add('tg');
  var applyBody = function () { document.body && document.body.classList.add('tg-miniapp'); };
  if (document.body) applyBody(); else document.addEventListener('DOMContentLoaded', applyBody);

  // Цвета шапки/фона под тёплую «бумажную» палитру сайта.
  try {
    if (tg.setHeaderColor) tg.setHeaderColor('#FBF8F2');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#FBF8F2');
  } catch (e) { /* ignore */ }

  // Системная кнопка «Назад»: показываем везде, кроме главной.
  try {
    var path = location.pathname.replace(/\/+$/, '');
    var isHome = /(^|\/)(index)?$/.test(path) || /\/index\.html$/.test(location.pathname) || /\/website$/.test(path);
    if (tg.BackButton) {
      if (isHome) {
        tg.BackButton.hide();
      } else {
        tg.BackButton.show();
        tg.BackButton.onClick(function () {
          if (history.length > 1) history.back();
          else location.href = location.pathname.indexOf('/directions/') !== -1 ? '../index.html' : 'index.html';
        });
      }
    }
  } catch (e) { /* ignore */ }
})();
