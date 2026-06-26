/* =====================================================================
   TELEGRAM ACCOUNT LINK  (Phase 2 P1 — Задача 4)
   ---------------------------------------------------------------------
   Adds a "Подключить Telegram" card to settings.html. Generates a one-time
   binding code (SUPA.createTelegramCode → public.telegram_codes), then opens
   the bot deep-link  t.me/<bot>?start=<code>. The bot Worker
   (workers/telegram-bot.js) consumes the code and writes telegram_chat_id
   onto the user's profile. This module just drives the UI and polls the
   link status.

   Loaded on settings.html AFTER supa.js (window.SUPA) and account.js.
   Mounts into #telegram-link-root.
   ===================================================================== */
(function () {
  'use strict';

  // ⚠️ ПРОВЕРЬ имя бота у @BotFather (без @). По умолчанию из роадмапа.
  var BOT_USERNAME = 'artshpacebot';

  var ROOT_ID = 'telegram-link-root';
  var pollTimer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function injectStyles() {
    if (document.getElementById('tg-link-styles')) return;
    var css =
      '.tg-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:20px 22px;margin-top:24px;max-width:560px;}' +
      '.tg-card h2{margin:0 0 4px;font-size:1.15rem;display:flex;align-items:center;gap:8px;}' +
      '.tg-sub{color:var(--text-muted);font-size:.86rem;margin:0 0 16px;line-height:1.5;}' +
      '.tg-ico{width:22px;height:22px;color:#229ED9;flex:0 0 auto;}' +
      '.tg-status{display:flex;align-items:center;gap:8px;font-size:.92rem;font-weight:600;margin-bottom:14px;}' +
      '.tg-status.on{color:#2e9e5b;}.tg-status.off{color:var(--text-muted);}' +
      '.tg-dot{width:9px;height:9px;border-radius:50%;background:#c9ccd1;}' +
      '.tg-status.on .tg-dot{background:#2e9e5b;}' +
      '.tg-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}' +
      '.tg-hint{font-size:.82rem;color:var(--text-muted);margin-top:12px;line-height:1.5;}' +
      '.tg-msg{font-size:.84rem;margin-top:10px;min-height:1.1em;}' +
      '.tg-msg.ok{color:#2e9e5b;}.tg-msg.err{color:#e53935;}.tg-msg.wait{color:var(--text-muted);}';
    var st = document.createElement('style');
    st.id = 'tg-link-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var TG_ICON =
    '<svg class="tg-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M21.94 4.3 18.7 19.6c-.24 1.08-.88 1.34-1.78.84l-4.92-3.63-2.37 2.28c-.26.26-.48.48-.99.48l.35-5 9.1-8.22c.4-.35-.08-.55-.62-.2L4.2 13.1l-4.85-1.52c-1.05-.33-1.07-1.05.22-1.56L20.6 2.86c.88-.32 1.65.2 1.34 1.44Z" transform="translate(1 0)"/></svg>';

  function setMsg(text, kind) {
    var el = document.getElementById('tg-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'tg-msg' + (kind ? ' ' + kind : '');
  }

  function renderLinked(root, info) {
    stopPoll();
    var when = '';
    if (info && info.linkedAt) {
      try { when = ' · ' + new Date(info.linkedAt).toLocaleDateString('ru-RU'); } catch (e) {}
    }
    root.innerHTML =
      '<div class="tg-card">' +
        '<h2>' + TG_ICON + 'Telegram</h2>' +
        '<div class="tg-status on"><span class="tg-dot"></span>Подключён' + esc(when) + '</div>' +
        '<p class="tg-sub">Бот будет присылать вам напоминания о занятиях и статус заявок.</p>' +
        '<div class="tg-actions">' +
          '<button type="button" class="btn btn-ghost btn-sm" id="tg-unlink">Отключить</button>' +
        '</div>' +
        '<div class="tg-msg" id="tg-msg"></div>' +
      '</div>';

    var btn = document.getElementById('tg-unlink');
    if (btn) btn.addEventListener('click', function () {
      btn.disabled = true; setMsg('Отключаем…', 'wait');
      window.SUPA.unlinkTelegram().then(function () {
        renderUnlinked(root);
      }).catch(function (ex) {
        btn.disabled = false;
        setMsg('Ошибка: ' + (ex && ex.message ? ex.message : 'не удалось отключить'), 'err');
      });
    });
  }

  function renderUnlinked(root) {
    root.innerHTML =
      '<div class="tg-card">' +
        '<h2>' + TG_ICON + 'Telegram</h2>' +
        '<div class="tg-status off"><span class="tg-dot"></span>Не подключён</div>' +
        '<p class="tg-sub">Подключите Telegram, чтобы получать напоминания о занятиях и уведомления прямо в мессенджер.</p>' +
        '<div class="tg-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" id="tg-connect">Подключить Telegram</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="tg-check" style="display:none;">Я нажал «Старт» — проверить</button>' +
        '</div>' +
        '<p class="tg-hint" id="tg-hint" style="display:none;">Откроется бот <strong>@' + esc(BOT_USERNAME) + '</strong>. Нажмите в нём кнопку <strong>«Старт» / Start</strong> — привязка произойдёт автоматически, и эта страница обновится сама.</p>' +
        '<div class="tg-msg" id="tg-msg"></div>' +
      '</div>';

    var connect = document.getElementById('tg-connect');
    var check = document.getElementById('tg-check');
    var hint = document.getElementById('tg-hint');

    if (connect) connect.addEventListener('click', function () {
      connect.disabled = true; setMsg('Готовим код…', 'wait');
      window.SUPA.createTelegramCode().then(function (code) {
        var url = 'https://t.me/' + BOT_USERNAME + '?start=' + encodeURIComponent(code);
        window.open(url, '_blank', 'noopener');
        connect.disabled = false;
        connect.textContent = 'Открыть бота ещё раз';
        if (hint) hint.style.display = '';
        if (check) check.style.display = '';
        setMsg('Ждём подтверждения из Telegram…', 'wait');
        startPoll(root);
      }).catch(function (ex) {
        connect.disabled = false;
        setMsg('Ошибка: ' + (ex && ex.message ? ex.message : 'не удалось создать код'), 'err');
      });
    });

    if (check) check.addEventListener('click', function () { refresh(root, true); });
  }

  function refresh(root, showMiss) {
    return window.SUPA.myTelegram().then(function (info) {
      if (info && info.linked) { renderLinked(root, info); return true; }
      if (showMiss) setMsg('Пока не вижу привязки. Убедитесь, что нажали «Старт» в боте, и попробуйте ещё раз.', 'err');
      return false;
    }).catch(function () { return false; });
  }

  // Poll the link status for ~2 minutes after the user opens the bot, so the
  // card flips to "Подключён" on its own without a manual refresh.
  function startPoll(root) {
    stopPoll();
    var tries = 0;
    pollTimer = setInterval(function () {
      tries++;
      if (tries > 40) { stopPoll(); return; } // ~2 min at 3s
      window.SUPA.myTelegram().then(function (info) {
        if (info && info.linked) renderLinked(root, info);
      }).catch(function () {});
    }, 3000);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  // account.js renders an older MOCK Telegram block (button "Привязать
  // Telegram" + a code to copy) inside #settings-root. That mock writes to
  // localStorage and does NOT reach the real bot, so we hide it and keep only
  // this real card. account.js renders asynchronously, so we watch for it.
  function hideMockTelegram() {
    var settings = document.getElementById('settings-root');
    if (!settings) return;
    var marker = settings.querySelector('[data-tg-status], [data-tg-link]');
    if (!marker) return false;
    var section = marker.closest('.settings-card') || marker.closest('section');
    if (section && section.style.display !== 'none') section.style.display = 'none';
    return true;
  }

  function watchMockTelegram() {
    var settings = document.getElementById('settings-root');
    if (!settings) return;
    if (hideMockTelegram()) return; // already there
    var obs = new MutationObserver(function () {
      if (hideMockTelegram()) obs.disconnect();
    });
    obs.observe(settings, { childList: true, subtree: true });
    // Safety: stop observing after 10s regardless.
    setTimeout(function () { obs.disconnect(); }, 10000);
  }

  function mount() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    if (!window.SUPA || !window.SUPA.enabled || !window.SUPA.enabled()) {
      // Supabase not configured — this feature can't work; stay silent.
      return;
    }
    watchMockTelegram();
    injectStyles();
    root.innerHTML = '<div class="tg-card"><p class="tg-sub">Загрузка…</p></div>';
    window.SUPA.myTelegram().then(function (info) {
      if (info && info.linked) renderLinked(root, info);
      else renderUnlinked(root);
    }).catch(function () { renderUnlinked(root); });
  }

  window.addEventListener('beforeunload', stopPoll);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
