/* =====================================================================
   CABINET + ADMIN PAGE LOGIC — Shpigotskiy Art Space (v0.4)
   One file drives every /account/ page. Each section runs only if its
   anchor element exists, so the same script is safe everywhere.
   ===================================================================== */
(function () {
  'use strict';

  var API = window.API;

  /* ---------- DOM helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function show(el) { if (el) el.classList.add('show'); }
  function hide(el) { if (el) el.classList.remove('show'); }
  function getNextParam() {
    var m = location.search.match(/[?&]next=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : 'dashboard.html';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- formatting ---------- */
  var MONTHS = ['января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря'];
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }
  function fmtMoney(n) {
    return (n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';
  }

  var SUB_STATUS = {
    active:    { label: 'Активный',   cls: 'badge-green' },
    frozen:    { label: 'Заморожен',  cls: 'badge-gold'  },
    completed: { label: 'Завершён',   cls: 'badge-gray'  }
  };
  var PAY_STATUS = {
    paid:    { label: 'Оплачено',          cls: 'badge-green' },
    pending: { label: 'Ожидает оплаты',    cls: 'badge-gold'  }
  };
  var LESSON_TYPE_LABEL = { video: 'Видео', text: 'Текст', image: 'Изображение', file: 'Файл' };

  function badge(map, key) {
    var s = map[key] || { label: key, cls: 'badge-gray' };
    return '<span class="cab-badge ' + s.cls + '">' + s.label + '</span>';
  }

  /* ---------- toast ---------- */
  function toast(message) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  function setFormError(box, message) {
    if (!box) return; box.textContent = message; box.classList.add('show');
  }

  /* ---------- modal ---------- */
  function openModal(title, bodyHtml, wide) {
    var overlay = document.createElement('div');
    overlay.className = 'cab-modal' + (wide ? ' cab-modal-wide' : '');
    overlay.innerHTML =
      '<div class="cab-modal-dialog" role="dialog" aria-modal="true">' +
        '<div class="cab-modal-head"><h3>' + title + '</h3>' +
          '<button class="cab-modal-x" aria-label="Закрыть">&times;</button></div>' +
        '<div class="cab-modal-body"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    var body = overlay.querySelector('.cab-modal-body');
    body.innerHTML = bodyHtml;
    function close() { document.removeEventListener('keydown', onKey); overlay.remove(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.cab-modal-x').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () { overlay.classList.add('show'); });
    return { overlay: overlay, body: body, close: close };
  }

  function field(label, control) { return '<div class="form-group"><label>' + label + '</label>' + control + '</div>'; }
  function row(a, b) { return '<div class="cab-form-row">' + a + b + '</div>'; }
  function input(name, value, type) {
    return '<input class="form-control" name="' + name + '" type="' + (type || 'text') +
      '" value="' + escapeHtml(value == null ? '' : value) + '">';
  }
  function textarea(name, value) {
    return '<textarea class="form-control" name="' + name + '" rows="4">' + escapeHtml(value == null ? '' : value) + '</textarea>';
  }
  function selectCtrl(name, options, current) {
    var opts = options.map(function (o) {
      return '<option value="' + escapeHtml(o.value) + '"' + (o.value === current ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
    }).join('');
    return '<select class="form-control" name="' + name + '">' + opts + '</select>';
  }
  function formActions() {
    return '<div class="form-error" data-err></div>' +
      '<div class="cab-modal-actions">' +
        '<button type="button" class="btn btn-outline btn-sm" data-cancel>Отмена</button>' +
        '<button type="submit" class="btn btn-primary btn-sm">Сохранить</button>' +
      '</div>';
  }

  /* =================================================================
     SIDEBAR
     ================================================================= */
  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z"/><path d="M8 7h8M8 11h8"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/></svg>',
    parents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    hw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    cert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="M9 14l-1 8 4-2 4 2-1-8"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    check2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  };

  /* status / type maps (v0.5) */
  var HW_STATUS = {
    assigned:  { label: 'Назначено',          cls: 'badge-gold'  },
    submitted: { label: 'Отправлено',         cls: 'badge-blue'  },
    reviewed:  { label: 'Проверено',          cls: 'badge-green' },
    revision:  { label: 'Требуется доработка', cls: 'badge-red'   }
  };
  var ATT_STATUS = {
    present:   { label: 'Присутствовал',  cls: 'badge-green' },
    excused:   { label: 'Уважительная',   cls: 'badge-gold'  },
    unexcused: { label: 'Неуважительная', cls: 'badge-red'   },
    absent:    { label: 'Отсутствовал',   cls: 'badge-gray'  }
  };
  var NOTE_TYPE = {
    recommendation: { label: 'Рекомендация', cls: 'badge-blue'  },
    remark:         { label: 'Замечание',    cls: 'badge-gold'  },
    progress:       { label: 'О прогрессе',  cls: 'badge-green' }
  };
  var ACH_ICON = {
    concert: 'note', stage: 'star', calendar: 'calendar', course: 'cert', exhibition: 'image', star: 'star'
  };
  function achIcon(key) { return ICON[ACH_ICON[key] || 'star'] || ICON.star; }

  var STUDENT_NAV = [
    { href: 'dashboard.html',     label: 'Главная',           icon: ICON.home     },
    { href: 'schedule.html',      label: 'Расписание',        icon: ICON.calendar },
    { href: 'courses.html',       label: 'Мои курсы',         icon: ICON.book     },
    { href: 'attendance.html',    label: 'Посещаемость',      icon: ICON.check2   },
    { href: 'homework.html',      label: 'Домашние задания',  icon: ICON.hw       },
    { href: 'certificates.html',  label: 'Сертификаты',       icon: ICON.cert     },
    { href: 'progress.html',      label: 'Профиль развития',  icon: ICON.chart    },
    { href: 'subscriptions.html', label: 'Мои абонементы',    icon: ICON.card     },
    { href: 'payments.html',      label: 'История платежей',  icon: ICON.receipt  },
    { href: 'shop.html',          label: 'Оплата и покупки',  icon: ICON.cart     }
  ];
  var PARENT_NAV = [
    { href: 'parent.html', label: 'Кабинет родителя', icon: ICON.parents }
  ];
  var ADMIN_NAV = [
    { href: 'admin.html',               label: 'Ученики',          icon: ICON.users     },
    { href: 'admin-parents.html',       label: 'Родители',         icon: ICON.parents   },
    { href: 'admin-subscriptions.html', label: 'Абонементы',       icon: ICON.card      },
    { href: 'admin-courses.html',       label: 'Курсы',            icon: ICON.book      },
    { href: 'admin-attendance.html',    label: 'Посещаемость',     icon: ICON.check2    },
    { href: 'admin-homework.html',      label: 'Домашние задания', icon: ICON.hw        },
    { href: 'admin-certificates.html',  label: 'Сертификаты',      icon: ICON.cert      },
    { href: 'admin-achievements.html',  label: 'Достижения',       icon: ICON.star      },
    { href: 'admin-payments.html',      label: 'Платежи',          icon: ICON.receipt   }
  ];

  function renderSidebar() {
    var host = $('[data-cab-sidebar]');
    if (!host) return;
    var kind = host.getAttribute('data-cab-sidebar');
    var me = API.auth.current();
    var file = location.pathname.split('/').pop() || 'dashboard.html';
    var isAdmin = me && me.role === 'admin';
    var roleLabel = isAdmin ? 'Администратор' : (kind === 'parent' ? 'Родитель' : 'Ученик');
    var initial = ((me && me.name) || '?').trim().charAt(0).toUpperCase() || '?';
    var tagline = kind === 'admin' ? 'Администрирование'
      : (kind === 'parent' ? 'Кабинет родителя' : 'Личный кабинет');

    function link(item) {
      return '<a href="' + item.href + '"' + (item.href === file ? ' class="active"' : '') + '>' +
        item.icon + item.label + '</a>';
    }

    var nav = '';
    if (kind === 'admin') {
      nav += ADMIN_NAV.map(link).join('');
    } else if (kind === 'parent') {
      nav += PARENT_NAV.map(link).join('');
    } else {
      nav += STUDENT_NAV.map(link).join('');
      if (isAdmin) {
        nav += '<div class="cab-nav-sep">Администрирование</div>' +
          '<a href="admin.html">' + ICON.shield + 'Админ-панель</a>';
      }
    }

    host.innerHTML =
      '<a href="../index.html" class="cab-logo">' +
        '<span class="name">Shpigotskiy Art Space</span>' +
        '<span class="tagline-small">' + tagline + '</span>' +
      '</a>' +
      '<div class="cab-user">' +
        '<div class="cab-avatar">' + escapeHtml(initial) + '</div>' +
        '<div class="cab-user-meta"><div class="nm">' + escapeHtml((me && me.name) || 'Гость') + '</div>' +
          '<div class="role">' + roleLabel + '</div></div>' +
      '</div>' +
      '<nav class="cab-nav">' + nav + '</nav>' +
      '<button class="cab-signout" data-signout>' + ICON.out + 'Выйти</button>';
  }

  renderSidebar();

  $all('[data-signout]').forEach(function (btn) { btn.addEventListener('click', function () { window.signOut(); }); });
  var sbToggle = $('[data-sidebar-toggle]');
  var sidebar  = $('.cab-sidebar');
  if (sbToggle && sidebar) {
    sbToggle.addEventListener('click', function () { sidebar.classList.toggle('open'); });
  }

  /* =================================================================
     AUTH FORMS
     ================================================================= */
  var loginForm = $('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var box = $('#login-error'); hide(box);
      var login = $('#login-id').value.trim(), password = $('#login-password').value;
      if (!login || !password) { setFormError(box, 'Заполните все поля'); return; }
      var btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Вход…';
      API.auth.login(login, password).then(function (user) {
        var dest = getNextParam();
        if (dest === 'dashboard.html') {
          if (user.role === 'admin') dest = 'admin.html';
          else if (user.role === 'parent') dest = 'parent.html';
        }
        location.href = dest;
      }).catch(function (err) { setFormError(box, err.message); btn.disabled = false; btn.textContent = btn.dataset.label; });
    });
  }

  var registerForm = $('#register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var box = $('#register-error'); hide(box);
      var name = $('#reg-name').value.trim(), email = $('#reg-email').value.trim();
      var phone = $('#reg-phone').value.trim(), password = $('#reg-password').value;
      var password2 = $('#reg-password2').value;
      if (name.length < 2) { setFormError(box, 'Введите имя'); return; }
      if (!email && !phone) { setFormError(box, 'Укажите телефон или email'); return; }
      if (password.length < 6) { setFormError(box, 'Пароль должен быть не короче 6 символов'); return; }
      if (password !== password2) { setFormError(box, 'Пароли не совпадают'); return; }
      var btn = registerForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Создаём…';
      API.auth.register({ name: name, email: email, phone: phone, password: password }).then(function () {
        location.href = 'dashboard.html';
      }).catch(function (err) { setFormError(box, err.message); btn.disabled = false; btn.textContent = btn.dataset.label; });
    });
  }

  var recoverForm = $('#recover-form');
  if (recoverForm) {
    recoverForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var box = $('#recover-error'); hide(box);
      var login = $('#recover-id').value.trim();
      if (!login) { setFormError(box, 'Укажите телефон или email'); return; }
      var btn = recoverForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Отправляем…';
      API.auth.recover(login).then(function () {
        var body = $('#recover-body'), success = $('#recover-success');
        if (body) body.style.display = 'none'; show(success);
      }).catch(function (err) { setFormError(box, err.message); btn.disabled = false; btn.textContent = 'Восстановить доступ'; });
    });
  }

  /* =================================================================
     DASHBOARD
     ================================================================= */
  var dash = $('#dashboard-root');
  if (dash) {
    var notesBox = $('[data-notes]');
    if (notesBox) {
      API.notifications.list().then(function (items) {
        if (!items.length) { notesBox.innerHTML = ''; return; }
        notesBox.innerHTML = items.map(function (n) {
          return '<div class="cab-note ' + n.level + '">' +
            '<div class="cab-note-body"><strong>' + escapeHtml(n.title) + '</strong>' +
              '<span>' + escapeHtml(n.text) + '</span></div>' +
            (n.action ? '<a class="cab-note-action" href="' + n.action.href + '">' + escapeHtml(n.action.label) + '</a>' : '') +
            '</div>';
        }).join('');
      });
    }
    API.student.profile().then(function (p) {
      $('[data-dash="hello"]').textContent = 'Здравствуйте, ' + p.name.split(' ')[0] + '!';
      $('[data-dash="direction"]').textContent = p.direction;
      $('[data-dash="level"]').textContent = p.level;
      $('[data-dash="teacher"]').textContent = p.teacher;
      if (p.nextLesson) {
        $('[data-dash="next-day"]').textContent = p.nextLesson.weekday + ', ' + fmtDate(p.nextLesson.date);
        $('[data-dash="next-time"]').textContent = p.nextLesson.time + ' · ' + p.nextLesson.room;
        $('[data-dash="next-dir"]').textContent  = p.nextLesson.direction + ' · ' + p.nextLesson.teacher;
      } else {
        $('[data-dash="next-day"]').textContent = 'Нет запланированных занятий';
      }
      $('[data-dash="lessons-left"]').textContent  = p.lessonsLeft;
      $('[data-dash="lessons-total"]').textContent = p.lessonsTotal ? 'из ' + p.lessonsTotal + ' в абонементе' : 'нет активного абонемента';
      var pct = p.lessonsTotal ? Math.round((p.lessonsLeft / p.lessonsTotal) * 100) : 0;
      var bar = $('[data-dash="lessons-bar"]');
      if (bar) bar.style.width = pct + '%';
      $('[data-dash="sub-until"]').textContent = p.subscriptionUntil ? 'до ' + fmtDate(p.subscriptionUntil) : 'Нет активного абонемента';
      var pay = PAY_STATUS[p.paymentStatus] || PAY_STATUS.pending;
      var payBadge = $('[data-dash="payment"]');
      payBadge.textContent = pay.label; payBadge.className = 'cab-badge ' + pay.cls;
      dash.classList.add('loaded');
    });
    API.student.weekly().then(function (rows) {
      var list = $('[data-dash="weekly"]');
      if (!list) return;
      list.innerHTML = rows.map(function (r) {
        return '<div class="cab-week-row">' +
          '<div class="cab-week-day">' + r.weekday + '</div>' +
          '<div class="cab-week-info"><strong>' + r.direction + '</strong><span>' + r.teacher + ' · ' + r.room + '</span></div>' +
          '<div class="cab-week-time">' + r.time + '</div></div>';
      }).join('');
    });
  }

  /* =================================================================
     MY COURSES  [v0.4 — progress from LMS, modules count, last viewed]
     ================================================================= */
  var coursesRoot = $('#courses-root');
  if (coursesRoot) {
    API.courses.purchased().then(function (list) {
      if (!list.length) {
        coursesRoot.innerHTML = '<p class="cab-empty">Вы пока не приобрели онлайн-курсы. ' +
          '<a href="shop.html">Перейти в магазин →</a></p>';
        return;
      }
      coursesRoot.innerHTML = list.map(function (c) {
        var done = c.progress >= 100;
        var nextHref = c.nextLessonId ? 'lesson.html?id=' + c.nextLessonId : 'lesson.html?course=' + c.id;
        var btnLabel = done ? 'Пройти заново' : (c.lessonsDone > 0 ? 'Продолжить курс' : 'Начать курс');
        return '<div class="cab-course">' +
          '<div class="cab-course-cover" style="background:' + c.gradient + ';">' +
            (done ? '<span class="cab-course-flag">Завершён</span>' : '') +
          '</div>' +
          '<div class="cab-course-body">' +
            '<h3>' + escapeHtml(c.title) + '</h3>' +
            '<p class="cab-course-teacher">' + escapeHtml(c.teacher) + '</p>' +
            '<div class="cab-progress"><div class="cab-progress-bar" style="width:' + c.progress + '%;"></div></div>' +
            '<div class="cab-course-meta">' +
              '<span>' + c.lessonsDone + ' / ' + c.lessonsTotal + ' уроков</span>' +
              '<span class="cab-course-pct">' + c.progress + '%</span>' +
            '</div>' +
            '<div class="cab-course-meta2">' +
              (c.modulesTotal ? '<span>' + c.modulesTotal + ' ' + plural(c.modulesTotal, 'модуль', 'модуля', 'модулей') + '</span>' : '') +
              (c.lastViewedAt ? '<span>Последний: ' + fmtDate(c.lastViewedAt) + '</span>' : '') +
            '</div>' +
            '<a class="btn ' + (done ? 'btn-outline' : 'btn-primary') + ' btn-full cab-course-btn" href="' + nextHref + '">' +
              btnLabel + '</a>' +
          '</div>' +
        '</div>';
      }).join('');
    });
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  /* =================================================================
     LESSON VIEWER  [v0.4]
     ================================================================= */
  var lessonRoot = $('#lesson-root');
  if (lessonRoot) {
    var params = new URLSearchParams(location.search);
    var lessonId = params.get('id');

    if (!lessonId) { location.replace('courses.html'); }
    else {
      API.lms.lessons.get(lessonId).then(function (lesson) {
        /* ownership check */
        API.courses.purchased().then(function (owned) {
          var ownedCourse = null;
          for (var i = 0; i < owned.length; i++) {
            if (owned[i].id === lesson.courseId) { ownedCourse = owned[i]; break; }
          }
          if (!ownedCourse) { location.replace('shop.html'); return; }

          Promise.all([
            API.courses.courseDetail(lesson.courseId),
            API.lms.progress.list(lesson.courseId)
          ]).then(function (res) {
            var course = res[0], completedIds = res[1];
            renderLesson(lesson, course, completedIds);
          });
        });
      }).catch(function () { location.replace('courses.html'); });
    }
  }

  function flatLessons(course) {
    var all = [];
    (course.modules || []).forEach(function (m) {
      (m.lessons || []).forEach(function (l) { all.push(l); });
    });
    return all;
  }

  function renderLessonContent(lesson) {
    var c = lesson.content || {};
    if (lesson.type === 'video') {
      return '<div class="lesson-video-placeholder">' +
        '<div class="lesson-play-btn">' + ICON.play + '</div>' +
        '<p class="lesson-video-label">' + escapeHtml(c.title || lesson.title) + '</p>' +
      '</div>';
    }
    if (lesson.type === 'text') {
      return '<div class="lesson-text-body">' + (c.body || '') + '</div>';
    }
    if (lesson.type === 'image') {
      return '<div class="lesson-image-wrap">' +
        '<div class="lesson-image-placeholder">' + ICON.image + '</div>' +
        (c.caption ? '<p class="lesson-image-caption">' + escapeHtml(c.caption) + '</p>' : '') +
      '</div>';
    }
    if (lesson.type === 'file') {
      return '<div class="lesson-file-card">' +
        '<div class="lesson-file-icon">' + ICON.file + '</div>' +
        '<div class="lesson-file-info">' +
          '<div class="lesson-file-name">' + escapeHtml(c.filename || '—') + '</div>' +
          '<div class="lesson-file-sub">' + escapeHtml(c.label || 'Файл') + '</div>' +
        '</div>' +
        '<button class="btn btn-outline btn-sm" data-mock-dl>' + escapeHtml(c.label || 'Скачать') + '</button>' +
      '</div>';
    }
    return '';
  }

  function renderLesson(lesson, course, completedIds) {
    var all = flatLessons(course);
    var idx = -1;
    for (var i = 0; i < all.length; i++) { if (all[i].id === lesson.id) { idx = i; break; } }
    var prev = idx > 0 ? all[idx - 1] : null;
    var next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
    var isDone = completedIds.indexOf(lesson.id) !== -1;

    /* topbar title */
    var topbarName = $('#lesson-topbar-name');
    if (topbarName) topbarName.textContent = lesson.title;

    /* find module name */
    var moduleName = '';
    (course.modules || []).forEach(function (m) {
      (m.lessons || []).forEach(function (l) { if (l.id === lesson.id) moduleName = m.title; });
    });

    /* build tree */
    var treeHtml = '';
    (course.modules || []).forEach(function (m) {
      treeHtml += '<div class="lesson-tree-module">' +
        '<div class="lesson-tree-module-title">' + escapeHtml(m.title) + '</div>' +
        '<ul class="lesson-tree-list">';
      (m.lessons || []).forEach(function (l) {
        var isCurrent = l.id === lesson.id;
        var isLDone   = completedIds.indexOf(l.id) !== -1;
        var cls = 'lesson-tree-item' + (isCurrent ? ' current' : '') + (isLDone ? ' done' : '');
        treeHtml += '<li class="' + cls + '">' +
          '<a href="lesson.html?id=' + l.id + '">' +
            '<span class="lesson-tree-icon">' + (isLDone ? ICON.check : ICON.play) + '</span>' +
            '<span class="lesson-tree-title">' + escapeHtml(l.title) + '</span>' +
          '</a></li>';
      });
      treeHtml += '</ul></div>';
    });

    var html =
      '<div class="lesson-layout">' +
        '<div class="lesson-tree-panel">' +
          '<a href="courses.html" class="lesson-back">← Мои курсы</a>' +
          '<div class="lesson-course-name">' + escapeHtml(course.title) + '</div>' +
          treeHtml +
        '</div>' +
        '<div class="lesson-main">' +
          '<nav class="lesson-breadcrumb">' +
            '<a href="courses.html">Мои курсы</a> / ' +
            '<span>' + escapeHtml(course.title) + '</span>' +
            (moduleName ? ' / <span>' + escapeHtml(moduleName) + '</span>' : '') +
          '</nav>' +
          '<h1 class="lesson-title">' + escapeHtml(lesson.title) + '</h1>' +
          '<div class="lesson-type-badge ltype-' + lesson.type + '">' + (LESSON_TYPE_LABEL[lesson.type] || lesson.type) + '</div>' +
          '<div class="lesson-content-area">' + renderLessonContent(lesson) + '</div>' +
          '<div class="lesson-done-area">' +
            (isDone
              ? '<button class="btn btn-outline btn-done-state" disabled>' + ICON.check + ' Урок пройден</button>'
              : '<button class="btn btn-primary" id="mark-done-btn">Отметить урок пройденным</button>') +
          '</div>' +
          '<div class="lesson-nav-bar">' +
            (prev ? '<a href="lesson.html?id=' + prev.id + '" class="btn btn-outline">← ' + escapeHtml(prev.title) + '</a>' : '<span></span>') +
            (next ? '<a href="lesson.html?id=' + next.id + '" class="btn btn-primary">' + escapeHtml(next.title) + ' →</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    lessonRoot.innerHTML = html;

    /* bind mark-done */
    var markBtn = $('#mark-done-btn');
    if (markBtn) {
      markBtn.addEventListener('click', function () {
        markBtn.disabled = true; markBtn.textContent = 'Сохраняем…';
        API.lms.progress.mark(lesson.id).then(function () {
          markBtn.outerHTML = '<button class="btn btn-outline btn-done-state" disabled>' + ICON.check + ' Урок пройден</button>';
          /* update tree */
          var treeItem = lessonRoot.querySelector('.lesson-tree-item.current');
          if (treeItem) {
            treeItem.classList.add('done');
            var ico = treeItem.querySelector('.lesson-tree-icon');
            if (ico) ico.innerHTML = ICON.check;
          }
          toast('Урок отмечен пройденным');
        }).catch(function (e) {
          toast(e.message); markBtn.disabled = false; markBtn.textContent = 'Отметить урок пройденным';
        });
      });
    }

    /* bind mock download */
    $all('[data-mock-dl]', lessonRoot).forEach(function (btn) {
      btn.addEventListener('click', function () { toast('Файл доступен в полной версии'); });
    });
  }

  /* =================================================================
     SUBSCRIPTIONS — "Мои абонементы"
     ================================================================= */
  var subsRoot = $('#subscriptions-root');
  if (subsRoot) {
    API.subscriptions.list().then(function (list) {
      if (!list.length) {
        subsRoot.innerHTML = '<p class="cab-empty">У вас пока нет абонементов. <a href="shop.html">Оформить →</a></p>';
        return;
      }
      var rows = list.map(function (s) {
        return '<tr>' +
          '<td data-th="Абонемент"><strong>' + escapeHtml(s.name) + '</strong></td>' +
          '<td data-th="Куплен">' + fmtDate(s.purchaseDate) + '</td>' +
          '<td data-th="Действует до">' + fmtDate(s.endDate) + '</td>' +
          '<td data-th="Занятия">' + s.lessonsLeft + ' / ' + s.lessonsTotal + '</td>' +
          '<td data-th="Статус">' + badge(SUB_STATUS, s.status) + '</td></tr>';
      }).join('');
      subsRoot.innerHTML =
        '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Абонемент</th><th>Куплен</th><th>Действует до</th><th>Занятия</th><th>Статус</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    });
  }

  /* =================================================================
     PAYMENTS — "История платежей"
     ================================================================= */
  var payRoot = $('#payments-root');
  if (payRoot) {
    API.payments.list().then(function (list) {
      if (!list.length) { payRoot.innerHTML = '<p class="cab-empty">Платежей пока нет.</p>'; return; }
      var rows = list.map(function (p) {
        return '<tr>' +
          '<td data-th="Дата">' + fmtDate(p.date) + '</td>' +
          '<td data-th="Назначение">' + escapeHtml(p.purpose) + '</td>' +
          '<td data-th="Сумма">' + fmtMoney(p.amount) + '</td>' +
          '<td data-th="Статус">' + badge(PAY_STATUS, p.status) + '</td></tr>';
      }).join('');
      payRoot.innerHTML =
        '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Дата</th><th>Назначение</th><th>Сумма</th><th>Статус</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    });
  }

  /* =================================================================
     SHOP
     ================================================================= */
  var shopRoot = $('#shop-root');
  if (shopRoot) { loadShop(); }
  function loadShop() {
    API.subscriptions.plans().then(function (plans) {
      $('[data-shop="plans"]').innerHTML = plans.map(function (p) {
        return '<div class="cab-buy-card">' +
          '<div class="cab-buy-head"><h3>' + escapeHtml(p.name) + '</h3><span class="cab-buy-price">' + fmtMoney(p.price) + '</span></div>' +
          '<ul class="cab-buy-feats"><li>' + p.lessons + ' занятий</li><li>Срок ' + p.durationDays + ' дней</li><li>' + escapeHtml(p.direction) + '</li></ul>' +
          '<button class="btn btn-primary btn-full" data-buy-plan="' + p.id + '">Купить</button></div>';
      }).join('');
      $all('[data-buy-plan]').forEach(function (btn) {
        btn.addEventListener('click', function () { buyPlan(btn.getAttribute('data-buy-plan'), btn); });
      });
    });
    API.subscriptions.list().then(function (list) {
      var host = $('[data-shop="renew"]');
      var renewable = list.filter(function (s) { return s.status !== 'completed'; });
      if (!renewable.length) { host.innerHTML = '<p class="cab-empty">Нет абонементов для продления.</p>'; return; }
      host.innerHTML = renewable.map(function (s) {
        return '<div class="cab-buy-card">' +
          '<div class="cab-buy-head"><h3>' + escapeHtml(s.name) + '</h3><span class="cab-buy-price">' + fmtMoney(s.price) + '</span></div>' +
          '<ul class="cab-buy-feats"><li>Осталось ' + s.lessonsLeft + ' из ' + s.lessonsTotal + '</li><li>До ' + fmtDate(s.endDate) + '</li><li>' + badge(SUB_STATUS, s.status) + '</li></ul>' +
          '<button class="btn btn-outline btn-full" data-renew="' + s.id + '">Продлить</button></div>';
      }).join('');
      $all('[data-renew]').forEach(function (btn) {
        btn.addEventListener('click', function () { renewSub(btn.getAttribute('data-renew'), btn); });
      });
    });
    API.courses.catalog().then(function (list) {
      $('[data-shop="courses"]').innerHTML = list.map(function (c) {
        return '<div class="cab-buy-card">' +
          '<div class="cab-buy-head"><h3>' + escapeHtml(c.title) + '</h3><span class="cab-buy-price">' + fmtMoney(c.price) + '</span></div>' +
          '<ul class="cab-buy-feats"><li>' + escapeHtml(c.teacher) + '</li><li>' + c.lessonsTotal + ' уроков</li></ul>' +
          (c.owned
            ? '<button class="btn btn-outline btn-full" disabled>Уже приобретён</button>'
            : '<button class="btn btn-primary btn-full" data-buy-course="' + c.id + '">Купить курс</button>') +
          '</div>';
      }).join('');
      $all('[data-buy-course]').forEach(function (btn) {
        btn.addEventListener('click', function () { buyCourse(btn.getAttribute('data-buy-course'), btn); });
      });
    });
  }
  function lock(btn, text) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = text; }
  function buyPlan(id, btn) {
    lock(btn, 'Оформляем…');
    API.subscriptions.buy(id).then(function () { toast('Абонемент оформлен'); loadShop(); })
      .catch(function (e) { toast(e.message); btn.disabled = false; btn.textContent = btn.dataset.t; });
  }
  function renewSub(id, btn) {
    lock(btn, 'Продлеваем…');
    API.subscriptions.renew(id).then(function () { toast('Абонемент продлён'); loadShop(); })
      .catch(function (e) { toast(e.message); btn.disabled = false; btn.textContent = btn.dataset.t; });
  }
  function buyCourse(id, btn) {
    lock(btn, 'Покупаем…');
    API.courses.buy(id).then(function () { toast('Курс приобретён'); loadShop(); })
      .catch(function (e) { toast(e.message); btn.disabled = false; btn.textContent = btn.dataset.t; });
  }

  /* =================================================================
     SCHEDULE CALENDAR
     ================================================================= */
  var calRoot = $('#calendar-root');
  if (calRoot) {
    var WEEKDAY_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    var CAL_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    var view = new Date(); view = new Date(view.getFullYear(), view.getMonth(), 1);
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function ymd2(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }
    function render() {
      var year = view.getFullYear(), month = view.getMonth();
      $('[data-cal="title"]').textContent = CAL_MONTHS[month] + ' ' + year;
      API.schedule.month(year, month).then(function (lessons) {
        var byDate = {};
        lessons.forEach(function (l) { (byDate[l.date] = byDate[l.date] || []).push(l); });
        var grid = $('[data-cal="grid"]');
        var html = WEEKDAY_SHORT.map(function (w) { return '<div class="cal-head">' + w + '</div>'; }).join('');
        var first = new Date(year, month, 1), lead = (first.getDay() + 6) % 7;
        for (var i = 0; i < lead; i++) html += '<div class="cal-cell cal-empty"></div>';
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var today = new Date(), todayStr = ymd2(today.getFullYear(), today.getMonth(), today.getDate());
        for (var d = 1; d <= daysInMonth; d++) {
          var key = ymd2(year, month, d), dayLessons = byDate[key] || [];
          var cls = 'cal-cell' + (key === todayStr ? ' cal-today' : '') + (dayLessons.length ? ' cal-has' : '');
          html += '<div class="' + cls + '" data-day="' + key + '"><span class="cal-num">' + d + '</span>' + (dayLessons.length ? '<span class="cal-dot"></span>' : '') + '</div>';
        }
        grid.innerHTML = html;
        $all('.cal-has', grid).forEach(function (cell) {
          cell.addEventListener('click', function () {
            $all('.cal-cell.selected', grid).forEach(function (c) { c.classList.remove('selected'); });
            cell.classList.add('selected'); showDay(cell.dataset.day, byDate[cell.dataset.day]);
          });
        });
        var initial = byDate[todayStr] ? todayStr : Object.keys(byDate).sort()[0];
        if (initial) { var initCell = grid.querySelector('[data-day="' + initial + '"]'); if (initCell) initCell.classList.add('selected'); showDay(initial, byDate[initial]); }
        else $('[data-cal="detail"]').innerHTML = '<p class="cab-empty">В этом месяце занятий нет.</p>';
      });
    }
    function showDay(dateStr, lessons) {
      var p = dateStr.split('-');
      var title = parseInt(p[2], 10) + ' ' + CAL_MONTHS[parseInt(p[1], 10) - 1].toLowerCase();
      var html = '<h3 class="cab-detail-title">' + title + '</h3>';
      html += (lessons || []).map(function (l) {
        return '<div class="cab-lesson"><div class="cab-lesson-time">' + l.time + '</div>' +
          '<div class="cab-lesson-info"><strong>' + l.direction + '</strong><span>' + l.teacher + ' · ' + l.room + '</span></div></div>';
      }).join('');
      $('[data-cal="detail"]').innerHTML = html;
    }
    $('[data-cal="prev"]').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
    $('[data-cal="next"]').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
    render();
  }

  /* =================================================================
     ADMIN — students
     ================================================================= */
  var adminStudents = $('#admin-students-root');
  if (adminStudents) {
    var searchBox = $('[data-admin-search]');
    function loadStudents(q) {
      API.admin.students(q).then(function (list) {
        if (!list.length) { adminStudents.innerHTML = '<p class="cab-empty">Ученики не найдены.</p>'; return; }
        var rows = list.map(function (s) {
          return '<tr>' +
            '<td data-th="Имя"><strong>' + escapeHtml(s.name) + '</strong></td>' +
            '<td data-th="Контакты">' + escapeHtml(s.email || s.phone || '—') + '</td>' +
            '<td data-th="Абонемент">' + (s.subscription ? escapeHtml(s.subscription) : '<span class="cab-muted">нет</span>') + '</td>' +
            '<td data-th="Осталось">' + (s.lessonsLeft != null ? s.lessonsLeft : '—') + '</td>' +
            '<td data-th="Оплата">' + badge(PAY_STATUS, s.paymentStatus) + '</td>' +
            '<td data-th=""><button class="btn btn-outline btn-sm" data-card="' + s.id + '">Карточка</button></td></tr>';
        }).join('');
        adminStudents.innerHTML =
          '<div class="cab-table-wrap"><table class="cab-table">' +
          '<thead><tr><th>Имя</th><th>Контакты</th><th>Абонемент</th><th>Осталось</th><th>Оплата</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>';
        $all('[data-card]', adminStudents).forEach(function (btn) {
          btn.addEventListener('click', function () { openStudentCard(btn.getAttribute('data-card')); });
        });
      });
    }
    if (searchBox) searchBox.addEventListener('input', function () { loadStudents(searchBox.value); });
    loadStudents('');
  }
  function openStudentCard(id) {
    API.admin.student(id).then(function (data) {
      var u = data.user;
      var subs = data.subscriptions.length
        ? data.subscriptions.map(function (s) { return '<li>' + escapeHtml(s.name) + ' — ' + s.lessonsLeft + '/' + s.lessonsTotal + ' · ' + badge(SUB_STATUS, s.status) + '</li>'; }).join('')
        : '<li class="cab-muted">нет</li>';
      var pays = data.payments.length
        ? data.payments.map(function (p) { return '<li>' + fmtDate(p.date) + ' — ' + escapeHtml(p.purpose) + ' · ' + fmtMoney(p.amount) + ' ' + badge(PAY_STATUS, p.status) + '</li>'; }).join('')
        : '<li class="cab-muted">нет</li>';
      var crs = data.courses.length
        ? data.courses.map(function (c) { return '<li>' + escapeHtml(c.title) + ' — ' + c.progress + '%</li>'; }).join('')
        : '<li class="cab-muted">нет</li>';
      var att = data.attendance || { rate: 0, present: 0, total: 0 };
      var certs = data.certificates.length
        ? data.certificates.map(function (c) { return '<li>' + escapeHtml(c.title) + ' · ' + fmtDate(c.date) + '</li>'; }).join('')
        : '<li class="cab-muted">нет</li>';
      var achs = data.achievements.length
        ? data.achievements.map(function (a) { return '<li>' + escapeHtml(a.title) + ' · ' + fmtDate(a.date) + '</li>'; }).join('')
        : '<li class="cab-muted">нет</li>';
      var m = openModal('Карточка ученика',
        '<div class="cab-card-block"><div class="cab-strong">' + escapeHtml(u.name) + '</div>' +
          '<div class="cab-muted">' + escapeHtml(u.email || '—') + ' · ' + escapeHtml(u.phone || '—') + '</div></div>' +
        '<h4 class="cab-block-title">Посещаемость</h4>' +
          '<p class="cab-muted">' + att.rate + '% · посещено ' + att.present + ' из ' + att.total + ' занятий</p>' +
        '<h4 class="cab-block-title">Абонементы</h4><ul class="cab-list">' + subs + '</ul>' +
        '<h4 class="cab-block-title">Платежи</h4><ul class="cab-list">' + pays + '</ul>' +
        '<h4 class="cab-block-title">Курсы</h4><ul class="cab-list">' + crs + '</ul>' +
        '<h4 class="cab-block-title">Сертификаты</h4><ul class="cab-list">' + certs + '</ul>' +
        '<h4 class="cab-block-title">Достижения</h4><ul class="cab-list">' + achs + '</ul>' +
        '<div class="cab-block-head"><h4 class="cab-block-title">Комментарии преподавателя</h4>' +
          '<button class="btn btn-outline btn-sm" data-add-note>+ Комментарий</button></div>' +
        '<div class="note-list" data-notes-list></div>');
      renderCardNotes(m, id);
      m.body.querySelector('[data-add-note]').addEventListener('click', function () { addNote(id, m); });
    }).catch(function (e) { toast(e.message); });
  }
  function renderCardNotes(m, studentId) {
    var host = m.body.querySelector('[data-notes-list]');
    API.comments.list(studentId).then(function (notes) {
      if (!notes.length) { host.innerHTML = '<p class="cab-empty">Комментариев пока нет.</p>'; return; }
      host.innerHTML = notes.map(function (n) {
        return '<div class="note-item"><div class="note-head">' + badge(NOTE_TYPE, n.type) +
          '<span class="note-meta">' + escapeHtml(n.author) + ' · ' + fmtDate(n.date) + '</span>' +
          '<button class="btn-icon danger" data-del-note="' + n.id + '" title="Удалить">✕</button></div>' +
          '<p>' + escapeHtml(n.text) + '</p></div>';
      }).join('');
      $all('[data-del-note]', host).forEach(function (b) {
        b.addEventListener('click', function () {
          API.comments.remove(b.getAttribute('data-del-note')).then(function () { renderCardNotes(m, studentId); });
        });
      });
    });
  }
  function addNote(studentId, parentModal) {
    var typeOpts = [
      { value: 'progress', label: 'О прогрессе' },
      { value: 'recommendation', label: 'Рекомендация' },
      { value: 'remark', label: 'Замечание' }
    ];
    var html = '<form data-form>' +
      field('Тип', selectCtrl('type', typeOpts, 'progress')) +
      field('Комментарий', textarea('text', '')) +
      formActions() + '</form>';
    var m = openModal('Новый комментарий', html);
    bindCrudForm(m, function (data) { data.studentId = studentId; return API.comments.create(data); },
      function () { toast('Комментарий добавлен'); renderCardNotes(parentModal, studentId); });
  }

  /* =================================================================
     ADMIN — subscriptions CRUD
     ================================================================= */
  var adminSubs = $('#admin-subs-root');
  if (adminSubs) {
    var addSubBtn = $('[data-add-sub]');
    if (addSubBtn) addSubBtn.addEventListener('click', function () { editSub(null); });
    loadAdminSubs();
  }
  function loadAdminSubs() {
    API.subscriptions.all().then(function (list) {
      if (!list.length) { adminSubs.innerHTML = '<p class="cab-empty">Абонементов пока нет.</p>'; return; }
      var rows = list.map(function (s) {
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(s.studentName) + '</td>' +
          '<td data-th="Название"><strong>' + escapeHtml(s.name) + '</strong></td>' +
          '<td data-th="Занятия">' + s.lessonsLeft + ' / ' + s.lessonsTotal + '</td>' +
          '<td data-th="Стоимость">' + fmtMoney(s.price) + '</td>' +
          '<td data-th="Период">' + fmtDate(s.startDate) + ' – ' + fmtDate(s.endDate) + '</td>' +
          '<td data-th="Статус">' + badge(SUB_STATUS, s.status) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + s.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + s.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminSubs.innerHTML =
        '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Ученик</th><th>Название</th><th>Занятия</th><th>Стоимость</th><th>Период</th><th>Статус</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminSubs).forEach(function (b) { b.addEventListener('click', function () { editSub(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminSubs).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить абонемент?')) API.subscriptions.remove(b.getAttribute('data-del')).then(function () { toast('Абонемент удалён'); loadAdminSubs(); });
        });
      });
    });
  }
  function editSub(id) {
    Promise.all([API.admin.studentOptions(), id ? API.subscriptions.all() : Promise.resolve([])])
      .then(function (res) {
        var students = res[0], sub = id ? (res[1].filter(function (s) { return s.id === id; })[0] || {}) : {};
        var studentOpts = students.map(function (s) { return { value: s.id, label: s.name }; });
        var statusOpts = [{ value: 'active', label: 'Активный' },{ value: 'frozen', label: 'Заморожен' },{ value: 'completed', label: 'Завершён' }];
        var html = '<form data-form>' +
          field('Ученик', selectCtrl('studentId', studentOpts, sub.studentId)) +
          field('Название', input('name', sub.name)) +
          row(field('Всего занятий', input('lessonsTotal', sub.lessonsTotal, 'number')),
              field('Осталось', input('lessonsLeft', sub.lessonsLeft, 'number'))) +
          row(field('Стоимость, ₸', input('price', sub.price, 'number')),
              field('Статус', selectCtrl('status', statusOpts, sub.status || 'active'))) +
          row(field('Начало', input('startDate', sub.startDate, 'date')),
              field('Окончание', input('endDate', sub.endDate, 'date'))) +
          formActions() + '</form>';
        var m = openModal(id ? 'Редактировать абонемент' : 'Новый абонемент', html);
        bindCrudForm(m, function (data) { return id ? API.subscriptions.update(id, data) : API.subscriptions.create(data); },
          function () { toast(id ? 'Сохранено' : 'Абонемент создан'); loadAdminSubs(); });
      });
  }

  /* =================================================================
     ADMIN — courses CRUD + LMS editor  [v0.4]
     ================================================================= */
  var adminCourses = $('#admin-courses-root');
  if (adminCourses) {
    var addCourseBtn = $('[data-add-course]');
    if (addCourseBtn) addCourseBtn.addEventListener('click', function () { editCourse(null); });
    loadAdminCourses();
  }
  function loadAdminCourses() {
    API.courses.all().then(function (list) {
      if (!list.length) { adminCourses.innerHTML = '<p class="cab-empty">Курсов пока нет.</p>'; return; }
      var rows = list.map(function (c) {
        return '<tr>' +
          '<td data-th="Название"><strong>' + escapeHtml(c.title) + '</strong></td>' +
          '<td data-th="Преподаватель">' + escapeHtml(c.teacher || '—') + '</td>' +
          '<td data-th="Модули">' + (c.modulesTotal || 0) + '</td>' +
          '<td data-th="Уроков">' + c.lessonsTotal + '</td>' +
          '<td data-th="Цена">' + fmtMoney(c.price) + '</td>' +
          '<td data-th="Учеников">' + c.students + '</td>' +
          '<td data-th="Статус">' + (c.published ? badge(SUB_STATUS, 'active') : '<span class="cab-badge badge-gray">Скрыт</span>') + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + c.id + '" title="Редактировать">✎</button>' +
            '<button class="btn btn-outline btn-sm" data-lms="' + c.id + '" title="Модули и уроки">Структура</button>' +
            '<button class="btn-icon danger" data-del="' + c.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminCourses.innerHTML =
        '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Название</th><th>Преподаватель</th><th>Модули</th><th>Уроков</th><th>Цена</th><th>Учеников</th><th>Статус</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminCourses).forEach(function (b) { b.addEventListener('click', function () { editCourse(b.getAttribute('data-edit')); }); });
      $all('[data-lms]', adminCourses).forEach(function (b) { b.addEventListener('click', function () { openLmsEditor(b.getAttribute('data-lms')); }); });
      $all('[data-del]', adminCourses).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить курс и все его уроки?')) API.courses.remove(b.getAttribute('data-del')).then(function () { toast('Курс удалён'); loadAdminCourses(); });
        });
      });
    });
  }
  function editCourse(id) {
    (id ? API.courses.all() : Promise.resolve([])).then(function (list) {
      var c = id ? (list.filter(function (x) { return x.id === id; })[0] || {}) : {};
      var gradOpts = [
        { value: 'linear-gradient(135deg,#1a0a0a,#3d1010)', label: 'Красный' },
        { value: 'linear-gradient(135deg,#0d1a0d,#0d3020)', label: 'Зелёный' },
        { value: 'linear-gradient(135deg,#0d0d1a,#151530)', label: 'Синий'   },
        { value: 'linear-gradient(135deg,#1a0a15,#2d0d28)', label: 'Фиолетовый' }
      ];
      var pubOpts = [{ value: 'true', label: 'Опубликован' },{ value: 'false', label: 'Скрыт' }];
      var html = '<form data-form>' +
        field('Название', input('title', c.title)) +
        field('Преподаватель', input('teacher', c.teacher)) +
        row(field('Цена, ₸', input('price', c.price, 'number')),
            field('Статус', selectCtrl('published', pubOpts, c.published === false ? 'false' : 'true'))) +
        field('Обложка', selectCtrl('gradient', gradOpts, c.gradient)) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать курс' : 'Новый курс', html);
      bindCrudForm(m, function (data) { data.published = data.published === 'true'; return id ? API.courses.update(id, data) : API.courses.create(data); },
        function () { toast(id ? 'Сохранено' : 'Курс создан'); loadAdminCourses(); });
    });
  }

  /* ---- LMS Editor (modal: modules + lessons) ---- */
  function openLmsEditor(courseId) {
    var m = openModal('Загрузка…', '<div id="lms-editor-inner">Загрузка…</div>', true);
    reloadLmsEditor(courseId, m);
  }

  function reloadLmsEditor(courseId, modal) {
    API.courses.courseDetail(courseId).then(function (course) {
      modal.overlay.querySelector('.cab-modal-head h3').textContent = 'Структура: ' + course.title;
      renderLmsEditorBody(course, modal.body, function () { reloadLmsEditor(courseId, modal); });
    });
  }

  function renderLmsEditorBody(course, container, reload) {
    var modules = course.modules || [];
    var html = '<div class="lms-editor">' +
      '<div class="lms-editor-toolbar">' +
        '<span class="lms-editor-hint">' + modules.length + ' ' + plural(modules.length, 'модуль', 'модуля', 'модулей') + '</span>' +
        '<button class="btn btn-primary btn-sm" id="lms-add-mod">+ Добавить модуль</button>' +
      '</div>';
    if (!modules.length) {
      html += '<p class="cab-empty">Модулей пока нет. Добавьте первый модуль.</p>';
    } else {
      modules.forEach(function (m) {
        html += '<div class="lms-module-card" data-mid="' + m.id + '">' +
          '<div class="lms-module-head">' +
            '<div class="lms-module-meta">' +
              '<strong>' + escapeHtml(m.title) + '</strong>' +
              '<span>' + (m.lessons ? m.lessons.length : 0) + ' уроков</span>' +
            '</div>' +
            '<div class="cab-row-actions">' +
              '<button class="btn-icon" data-edit-mod="' + m.id + '" title="Редактировать">✎</button>' +
              '<button class="btn-icon danger" data-del-mod="' + m.id + '" title="Удалить">✕</button>' +
            '</div>' +
          '</div>' +
          '<ul class="lms-lesson-list">';
        (m.lessons || []).forEach(function (l) {
          html += '<li class="lms-lesson-item">' +
            '<span class="lms-type-pill ltype-' + l.type + '">' + (LESSON_TYPE_LABEL[l.type] || l.type) + '</span>' +
            '<span class="lms-lesson-name">' + escapeHtml(l.title) + '</span>' +
            '<div class="cab-row-actions">' +
              '<button class="btn-icon" data-edit-les="' + l.id + '" title="Редактировать">✎</button>' +
              '<button class="btn-icon danger" data-del-les="' + l.id + '" title="Удалить">✕</button>' +
            '</div></li>';
        });
        html += '</ul>' +
          '<button class="lms-add-lesson btn btn-outline btn-sm" data-add-les="' + m.id + '">+ Урок</button>' +
        '</div>';
      });
    }
    html += '</div>';
    container.innerHTML = html;

    /* bind: add module */
    container.querySelector('#lms-add-mod').addEventListener('click', function () {
      editModule(null, course.id, reload);
    });
    /* bind: edit/delete module */
    $all('[data-edit-mod]', container).forEach(function (b) {
      b.addEventListener('click', function () { editModule(b.getAttribute('data-edit-mod'), course.id, reload); });
    });
    $all('[data-del-mod]', container).forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Удалить модуль и все его уроки?')) {
          API.lms.modules.remove(b.getAttribute('data-del-mod')).then(function () { toast('Модуль удалён'); reload(); });
        }
      });
    });
    /* bind: add/edit/delete lesson */
    $all('[data-add-les]', container).forEach(function (b) {
      b.addEventListener('click', function () { editLesson(null, b.getAttribute('data-add-les'), course.id, reload); });
    });
    $all('[data-edit-les]', container).forEach(function (b) {
      b.addEventListener('click', function () { editLesson(b.getAttribute('data-edit-les'), null, course.id, reload); });
    });
    $all('[data-del-les]', container).forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Удалить урок?')) {
          API.lms.lessons.remove(b.getAttribute('data-del-les')).then(function () { toast('Урок удалён'); reload(); });
        }
      });
    });
  }

  function editModule(id, courseId, onDone) {
    var load = id ? API.lms.modules.list(courseId) : Promise.resolve([]);
    load.then(function (mods) {
      var mod = id ? (mods.filter(function (m) { return m.id === id; })[0] || {}) : {};
      var html = '<form data-form>' +
        field('Название модуля', input('title', mod.title)) +
        field('Порядок', input('order', mod.order, 'number')) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать модуль' : 'Новый модуль', html);
      bindCrudForm(m, function (data) {
        data.courseId = courseId;
        return id ? API.lms.modules.update(id, data) : API.lms.modules.create(data);
      }, function () { toast(id ? 'Модуль обновлён' : 'Модуль создан'); onDone(); });
    });
  }

  function editLesson(id, moduleId, courseId, onDone) {
    var load = id ? API.lms.lessons.get(id) : Promise.resolve({});
    load.then(function (les) {
      var typeOpts = [
        { value: 'video', label: 'Видео' },
        { value: 'text',  label: 'Текст' },
        { value: 'image', label: 'Изображение' },
        { value: 'file',  label: 'Файл' }
      ];
      var c = les.content || {};
      var html = '<form data-form>' +
        field('Название урока', input('title', les.title)) +
        row(field('Тип', selectCtrl('type', typeOpts, les.type || 'text')),
            field('Порядок', input('order', les.order, 'number'))) +
        field('Описание (опционально)', input('description', les.description)) +
        '<div class="lms-content-fields">' +
          field('Текст / HTML (для типа Текст)', textarea('contentBody', c.body)) +
          field('Заголовок / подпись (Видео / Изображение)', input('contentTitle', c.title || c.caption)) +
          field('Имя файла (для типа Файл)', input('contentFilename', c.filename)) +
          field('Метка кнопки (для Файл)', input('contentLabel', c.label)) +
        '</div>' +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать урок' : 'Новый урок', html);
      bindCrudForm(m, function (data) {
        if (!moduleId && les.moduleId) moduleId = les.moduleId;
        data.moduleId = moduleId; data.courseId = courseId;
        return id ? API.lms.lessons.update(id, data) : API.lms.lessons.create(data);
      }, function () { toast(id ? 'Урок обновлён' : 'Урок создан'); onDone(); });
    });
  }

  /* =================================================================
     ADMIN — payments list
     ================================================================= */
  var adminPays = $('#admin-payments-root');
  if (adminPays) {
    API.payments.all().then(function (list) {
      if (!list.length) { adminPays.innerHTML = '<p class="cab-empty">Платежей пока нет.</p>'; return; }
      var rows = list.map(function (p) {
        return '<tr>' +
          '<td data-th="Дата">' + fmtDate(p.date) + '</td>' +
          '<td data-th="Ученик">' + escapeHtml(p.studentName) + '</td>' +
          '<td data-th="Назначение">' + escapeHtml(p.purpose) + '</td>' +
          '<td data-th="Сумма">' + fmtMoney(p.amount) + '</td>' +
          '<td data-th="Статус">' + badge(PAY_STATUS, p.status) + '</td></tr>';
      }).join('');
      adminPays.innerHTML =
        '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Дата</th><th>Ученик</th><th>Назначение</th><th>Сумма</th><th>Статус</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    });
  }

  /* =================================================================
     ATTENDANCE — student view  [v0.5]
     ================================================================= */
  var attendanceRoot = $('#attendance-root');
  if (attendanceRoot) {
    Promise.all([API.attendance.stats(), API.attendance.list()]).then(function (res) {
      var st = res[0], list = res[1];
      var stats =
        '<div class="cab-grid">' +
          '<div class="cab-card">' +
            '<div class="cab-card-label">' + ICON.check2 + 'Посещаемость</div>' +
            '<div class="cab-stat">' + st.rate + '%</div>' +
            '<div class="cab-stat-sub">' + st.present + ' из ' + st.total + ' занятий посещено</div>' +
            '<div class="cab-progress"><div class="cab-progress-bar" style="width:' + st.rate + '%;"></div></div>' +
          '</div>' +
          '<div class="cab-card">' +
            '<div class="cab-card-label">' + ICON.chart + 'Статистика за период</div>' +
            '<div class="att-legend">' +
              attLegend('Присутствовал', st.present, 'badge-green') +
              attLegend('Уважительная причина', st.excused, 'badge-gold') +
              attLegend('Неуважительная причина', st.unexcused, 'badge-red') +
              attLegend('Отсутствовал', st.absent, 'badge-gray') +
            '</div>' +
          '</div>' +
        '</div>';
      var table;
      if (!list.length) {
        table = '<p class="cab-empty">Записей о посещениях пока нет.</p>';
      } else {
        var rows = list.map(function (a) {
          return '<tr>' +
            '<td data-th="Дата">' + fmtDate(a.date) + '</td>' +
            '<td data-th="Направление">' + escapeHtml(a.direction) + '</td>' +
            '<td data-th="Статус">' + badge(ATT_STATUS, a.status) + '</td></tr>';
        }).join('');
        table =
          '<h2 class="cab-section-title">История посещений</h2>' +
          '<div class="cab-table-wrap"><table class="cab-table">' +
          '<thead><tr><th>Дата</th><th>Направление</th><th>Статус</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>';
      }
      attendanceRoot.innerHTML = stats + table;
    });
  }
  function attLegend(label, n, cls) {
    return '<div class="att-legend-row"><span class="cab-badge ' + cls + '">' + n + '</span><span>' + escapeHtml(label) + '</span></div>';
  }

  /* =================================================================
     HOMEWORK — student view  [v0.5]
     ================================================================= */
  var hwRoot = $('#homework-root');
  if (hwRoot) { loadStudentHomework(); }
  function loadStudentHomework() {
    API.homework.list().then(function (list) {
      if (!list.length) { hwRoot.innerHTML = '<p class="cab-empty">Домашних заданий пока нет.</p>'; return; }
      hwRoot.innerHTML = list.map(renderHwCard).join('');
      $all('[data-hw-submit]', hwRoot).forEach(function (b) {
        b.addEventListener('click', function () { openSubmitHw(b.getAttribute('data-hw-submit')); });
      });
    });
  }
  function hwFiles(files) {
    if (!files || !files.length) return '';
    return '<div class="hw-materials">' + files.map(function (f) {
      return '<span class="hw-file">' + ICON.file + escapeHtml(f.name) + '</span>';
    }).join('') + '</div>';
  }
  function renderHwCard(h) {
    var overdue = (h.status === 'assigned' || h.status === 'revision') && daysLeft(h.dueDate) < 0;
    var materials = (h.materials || []).length
      ? '<div class="hw-block"><div class="hw-block-label">Материалы задания</div>' + hwFiles(h.materials) + '</div>' : '';
    var submission = h.submission
      ? '<div class="hw-block"><div class="hw-block-label">Ваш ответ · ' + fmtDate(h.submission.submittedAt) + '</div>' +
          (h.submission.comment ? '<p>' + escapeHtml(h.submission.comment) + '</p>' : '') + hwFiles(h.submission.files) + '</div>'
      : '';
    var review = h.review
      ? '<div class="hw-block hw-review"><div class="hw-block-label">Комментарий преподавателя · ' + fmtDate(h.review.reviewedAt) + '</div>' +
          '<p>' + escapeHtml(h.review.comment) + '</p></div>'
      : '';
    var canSubmit = h.status === 'assigned' || h.status === 'revision';
    var action = canSubmit
      ? '<div class="hw-actions"><button class="btn btn-primary btn-sm" data-hw-submit="' + h.id + '">' +
          (h.status === 'revision' ? 'Отправить заново' : 'Сдать работу') + '</button></div>'
      : '';
    return '<div class="hw-card">' +
      '<div class="hw-card-head">' +
        '<div><h3>' + escapeHtml(h.title) + '</h3>' +
          '<div class="hw-meta">' + escapeHtml(h.direction) + ' · ' + escapeHtml(h.teacher) + '</div></div>' +
        badge(HW_STATUS, h.status) +
      '</div>' +
      '<p class="hw-desc">' + escapeHtml(h.description) + '</p>' +
      '<div class="hw-dates">' +
        '<span>Выдано: ' + fmtDate(h.assignedDate) + '</span>' +
        '<span class="' + (overdue ? 'hw-overdue' : '') + '">Срок: ' + fmtDate(h.dueDate) + (overdue ? ' · просрочено' : '') + '</span>' +
      '</div>' +
      materials + submission + review + action +
    '</div>';
  }
  function openSubmitHw(id) {
    API.homework.get(id).then(function (h) {
      var html = '<form data-form>' +
        '<p class="cab-muted" style="margin-bottom:16px;">Прикрепите файл (видео, изображение или документ) и при необходимости добавьте комментарий преподавателю.</p>' +
        field('Файл с работой', '<input class="form-control" type="file" name="file" accept="image/*,video/*,.pdf,.doc,.docx">') +
        field('Комментарий (опционально)', textarea('comment', '')) +
        '<div class="form-error" data-err></div>' +
        '<div class="cab-modal-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" data-cancel>Отмена</button>' +
          '<button type="submit" class="btn btn-primary btn-sm">Отправить на проверку</button>' +
        '</div></form>';
      var m = openModal('Сдать работу: ' + escapeHtml(h.title), html);
      var form = m.body.querySelector('[data-form]');
      m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = form.querySelector('[data-err]'); hide(err);
        var fileInput = form.querySelector('input[type=file]');
        var files = [];
        if (fileInput && fileInput.files && fileInput.files.length) {
          files = Array.prototype.slice.call(fileInput.files).map(function (f) { return { name: f.name, kind: f.type }; });
        }
        if (!files.length) { setFormError(err, 'Выберите файл с работой'); return; }
        var comment = form.querySelector('textarea[name=comment]').value;
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        API.homework.submit(id, { comment: comment, files: files }).then(function () {
          m.close(); toast('Работа отправлена на проверку'); loadStudentHomework();
        }).catch(function (ex) { setFormError(err, ex.message); btn.disabled = false; });
      });
    });
  }
  function daysLeft(iso) {
    var p = (iso || '').split('-'); var due = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((due - today) / 86400000);
  }

  /* =================================================================
     CERTIFICATES — student view  [v0.5]
     ================================================================= */
  var certRoot = $('#certificates-root');
  if (certRoot) {
    API.certificates.list().then(function (list) {
      if (!list.length) {
        certRoot.innerHTML = '<p class="cab-empty">Сертификатов пока нет. Они появятся по мере прохождения курсов и участия в мероприятиях.</p>';
        return;
      }
      certRoot.innerHTML = '<div class="cert-grid">' + list.map(renderCertCard).join('') + '</div>';
      bindMockDownloads(certRoot);
    });
  }
  function renderCertCard(c) {
    return '<div class="cert-card">' +
      '<div class="cert-ribbon" style="background:' + c.gradient + ';">' + ICON.cert + '</div>' +
      '<div class="cert-body">' +
        '<h3>' + escapeHtml(c.title) + '</h3>' +
        '<div class="cert-date">' + fmtDate(c.date) + '</div>' +
        (c.description ? '<p class="cert-desc">' + escapeHtml(c.description) + '</p>' : '') +
        '<button class="btn btn-outline btn-sm" data-mock-dl>' + ICON.download + ' Скачать</button>' +
      '</div></div>';
  }
  function bindMockDownloads(root) {
    $all('[data-mock-dl]', root).forEach(function (btn) {
      btn.addEventListener('click', function () { toast('Файл доступен в полной версии'); });
    });
  }
  function renderAchCard(a) {
    return '<div class="ach-card"><div class="ach-icon">' + achIcon(a.icon) + '</div>' +
      '<div class="ach-info"><strong>' + escapeHtml(a.title) + '</strong>' +
        '<span class="ach-date">' + fmtDate(a.date) + '</span>' +
        (a.description ? '<p>' + escapeHtml(a.description) + '</p>' : '') +
      '</div></div>';
  }
  function renderNote(n) {
    return '<div class="note-item">' +
      '<div class="note-head">' + badge(NOTE_TYPE, n.type) +
        '<span class="note-meta">' + escapeHtml(n.author) + ' · ' + fmtDate(n.date) + '</span></div>' +
      '<p>' + escapeHtml(n.text) + '</p></div>';
  }

  /* =================================================================
     DEVELOPMENT PROFILE — student view  [v0.5]
     ================================================================= */
  var devRoot = $('#development-root');
  if (devRoot) {
    API.student.development().then(function (d) {
      devRoot.innerHTML = developmentHtml(d);
      bindMockDownloads(devRoot);
    });
  }
  function developmentHtml(d) {
    var att = d.attendance;
    var completed = d.courses.filter(function (c) { return c.done; });
    var coursesHtml = d.courses.length
      ? d.courses.map(function (c) {
          return '<div class="dev-course"><div class="dev-course-head"><strong>' + escapeHtml(c.title) + '</strong><span>' + c.progress + '%</span></div>' +
            '<div class="cab-progress"><div class="cab-progress-bar" style="width:' + c.progress + '%;"></div></div></div>';
        }).join('')
      : '<p class="cab-empty">Нет курсов.</p>';
    var certsHtml = d.certificates.length
      ? '<div class="cert-grid">' + d.certificates.map(renderCertCard).join('') + '</div>'
      : '<p class="cab-empty">Сертификатов пока нет.</p>';
    var achHtml = d.achievements.length
      ? '<div class="ach-grid">' + d.achievements.map(renderAchCard).join('') + '</div>'
      : '<p class="cab-empty">Достижений пока нет.</p>';
    var notesHtml = d.notes.length ? d.notes.map(renderNote).join('') : '<p class="cab-empty">Комментариев преподавателя пока нет.</p>';
    return '' +
      '<div class="cab-grid">' +
        '<div class="cab-card"><div class="cab-card-label">' + ICON.check2 + 'Посещаемость</div>' +
          '<div class="cab-stat">' + att.rate + '%</div>' +
          '<div class="cab-stat-sub">' + att.present + ' из ' + att.total + ' занятий</div></div>' +
        '<div class="cab-card"><div class="cab-card-label">' + ICON.book + 'Завершённые курсы</div>' +
          '<div class="cab-stat">' + completed.length + '</div>' +
          '<div class="cab-stat-sub">из ' + d.courses.length + ' приобретённых</div></div>' +
        '<div class="cab-card"><div class="cab-card-label">' + ICON.cert + 'Сертификаты</div>' +
          '<div class="cab-stat">' + d.certificates.length + '</div></div>' +
        '<div class="cab-card"><div class="cab-card-label">' + ICON.star + 'Достижения</div>' +
          '<div class="cab-stat">' + d.achievements.length + '</div></div>' +
      '</div>' +
      '<h2 class="cab-section-title">Прогресс по курсам</h2>' + coursesHtml +
      '<h2 class="cab-section-title">Достижения</h2>' + achHtml +
      '<h2 class="cab-section-title">Сертификаты</h2>' + certsHtml +
      '<h2 class="cab-section-title">Комментарии преподавателей</h2><div class="note-list">' + notesHtml + '</div>';
  }

  /* =================================================================
     PARENT CABINET  [v0.5]
     ================================================================= */
  var parentRoot = $('#parent-root');
  if (parentRoot) {
    API.parent.children().then(function (kids) {
      if (!kids.length) {
        parentRoot.innerHTML = '<p class="cab-empty">К вашему аккаунту пока не привязаны ученики. Обратитесь к администратору студии.</p>';
        return;
      }
      parentRoot.innerHTML = kids.map(renderChildCard).join('');
      bindMockDownloads(parentRoot);
    });
  }
  function pcTile(label, value) {
    return '<div class="pc-tile"><div class="pc-tile-label">' + label + '</div><div class="pc-tile-val">' + value + '</div></div>';
  }
  function renderChildCard(c) {
    var next = c.nextLesson
      ? c.nextLesson.weekday + ', ' + fmtDate(c.nextLesson.date) + ' · ' + c.nextLesson.time
      : 'Нет занятий';
    var pay = PAY_STATUS[c.paymentStatus] || PAY_STATUS.pending;
    var courses = c.courses.length
      ? c.courses.map(function (cr) {
          return '<div class="dev-course"><div class="dev-course-head"><strong>' + escapeHtml(cr.title) + '</strong><span>' + cr.progress + '%</span></div>' +
            '<div class="cab-progress"><div class="cab-progress-bar" style="width:' + cr.progress + '%;"></div></div></div>';
        }).join('')
      : '<p class="cab-empty">Нет онлайн-курсов.</p>';
    var hw = c.homework.length
      ? c.homework.slice(0, 5).map(function (h) {
          return '<li class="pc-hw-item"><span>' + escapeHtml(h.title) + '</span>' + badge(HW_STATUS, h.status) + '</li>';
        }).join('')
      : '<li class="cab-empty">Заданий нет.</li>';
    var ach = c.achievements.length
      ? '<div class="ach-grid">' + c.achievements.map(renderAchCard).join('') + '</div>'
      : '<p class="cab-empty">Достижений пока нет.</p>';
    var certs = c.certificates.length
      ? '<div class="cert-grid">' + c.certificates.map(renderCertCard).join('') + '</div>'
      : '<p class="cab-empty">Сертификатов пока нет.</p>';
    var notes = c.notes.length ? c.notes.slice(0, 3).map(renderNote).join('') : '<p class="cab-empty">Комментариев пока нет.</p>';
    return '<section class="pc-child">' +
      '<div class="pc-head">' +
        '<div class="cab-avatar pc-avatar">' + escapeHtml(c.name.charAt(0)) + '</div>' +
        '<div><h2>' + escapeHtml(c.name) + '</h2>' +
          '<div class="pc-sub">' + escapeHtml(c.direction) + ' · ' + escapeHtml(c.teacher) + ' · ' + escapeHtml(c.level) + '</div></div>' +
      '</div>' +
      '<div class="pc-tiles">' +
        pcTile('Ближайшее занятие', escapeHtml(next)) +
        pcTile('Осталось занятий', c.lessonsTotal ? (c.lessonsLeft + ' из ' + c.lessonsTotal) : 'нет абонемента') +
        pcTile('Посещаемость', c.attendance.rate + '%') +
        pcTile('Оплата', '<span class="cab-badge ' + pay.cls + '">' + pay.label + '</span>') +
      '</div>' +
      '<div class="pc-cols">' +
        '<div class="pc-col"><h3 class="pc-col-title">Прогресс по курсам</h3>' + courses + '</div>' +
        '<div class="pc-col"><h3 class="pc-col-title">Домашние задания' +
          (c.homeworkPending ? ' <span class="pc-badge">' + c.homeworkPending + '</span>' : '') +
          '</h3><ul class="pc-hw-list">' + hw + '</ul></div>' +
      '</div>' +
      '<h3 class="pc-col-title">Достижения</h3>' + ach +
      '<h3 class="pc-col-title">Сертификаты</h3>' + certs +
      '<h3 class="pc-col-title">Комментарии преподавателей</h3><div class="note-list">' + notes + '</div>' +
    '</section>';
  }

  /* =================================================================
     ADMIN — parents CRUD  [v0.5]
     ================================================================= */
  var adminParents = $('#admin-parents-root');
  if (adminParents) {
    var addParentBtn = $('[data-add-parent]');
    if (addParentBtn) addParentBtn.addEventListener('click', function () { editParent(null); });
    loadAdminParents();
  }
  function loadAdminParents() {
    API.admin.parents().then(function (list) {
      if (!list.length) { adminParents.innerHTML = '<p class="cab-empty">Родителей пока нет.</p>'; return; }
      var rows = list.map(function (p) {
        return '<tr>' +
          '<td data-th="Имя"><strong>' + escapeHtml(p.name) + '</strong></td>' +
          '<td data-th="Контакты">' + escapeHtml(p.email || p.phone || '—') + '</td>' +
          '<td data-th="Дети">' + (p.children.length ? escapeHtml(p.children.join(', ')) : '<span class="cab-muted">не привязаны</span>') + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + p.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + p.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminParents.innerHTML =
        '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Имя</th><th>Контакты</th><th>Дети</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminParents).forEach(function (b) { b.addEventListener('click', function () { editParent(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminParents).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить родителя?')) API.admin.removeParent(b.getAttribute('data-del')).then(function () { toast('Родитель удалён'); loadAdminParents(); });
        });
      });
    });
  }
  function editParent(id) {
    Promise.all([API.admin.studentOptions(), id ? API.admin.parents() : Promise.resolve([])]).then(function (res) {
      var students = res[0];
      var p = id ? (res[1].filter(function (x) { return x.id === id; })[0] || {}) : {};
      var childIds = p.childrenIds || [];
      var checks = students.length
        ? students.map(function (s) {
            var on = childIds.indexOf(s.id) !== -1;
            return '<label class="check-row"><input type="checkbox" value="' + s.id + '" data-child' + (on ? ' checked' : '') + '> ' + escapeHtml(s.name) + '</label>';
          }).join('')
        : '<p class="cab-muted">Нет учеников.</p>';
      var html = '<form data-form>' +
        field('Имя родителя', input('name', p.name)) +
        row(field('Email', input('email', p.email)), field('Телефон', input('phone', p.phone))) +
        field('Пароль' + (id ? ' (пусто — не менять)' : ''), input('password', '')) +
        field('Привязанные ученики', '<div class="check-list">' + checks + '</div>') +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать родителя' : 'Новый родитель', html);
      var form = m.body.querySelector('[data-form]');
      m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = form.querySelector('[data-err]'); hide(err);
        var data = {};
        $all('input[name], select[name], textarea[name]', form).forEach(function (el) { if (el.name) data[el.name] = el.value; });
        data.childrenIds = $all('[data-child]', form).filter(function (ch) { return ch.checked; }).map(function (ch) { return ch.value; });
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        var op = id ? API.admin.updateParent(id, data) : API.admin.createParent(data);
        op.then(function () { m.close(); toast(id ? 'Сохранено' : 'Родитель создан'); loadAdminParents(); })
          .catch(function (ex) { setFormError(err, ex.message); btn.disabled = false; });
      });
    });
  }

  /* =================================================================
     ADMIN — attendance CRUD  [v0.5]
     ================================================================= */
  var adminAtt = $('#admin-attendance-root');
  if (adminAtt) {
    var addAttBtn = $('[data-add-att]');
    if (addAttBtn) addAttBtn.addEventListener('click', function () { editAttendance(null); });
    loadAdminAttendance();
  }
  function loadAdminAttendance() {
    API.attendance.all().then(function (list) {
      if (!list.length) { adminAtt.innerHTML = '<p class="cab-empty">Записей о посещаемости пока нет.</p>'; return; }
      var rows = list.map(function (a) {
        return '<tr>' +
          '<td data-th="Дата">' + fmtDate(a.date) + '</td>' +
          '<td data-th="Ученик">' + escapeHtml(a.studentName) + '</td>' +
          '<td data-th="Направление">' + escapeHtml(a.direction) + '</td>' +
          '<td data-th="Статус">' + badge(ATT_STATUS, a.status) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + a.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + a.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminAtt.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Дата</th><th>Ученик</th><th>Направление</th><th>Статус</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminAtt).forEach(function (b) { b.addEventListener('click', function () { editAttendance(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminAtt).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить запись?')) API.attendance.remove(b.getAttribute('data-del')).then(function () { toast('Запись удалена'); loadAdminAttendance(); });
        });
      });
    });
  }
  function editAttendance(id) {
    Promise.all([API.admin.studentOptions(), id ? API.attendance.all() : Promise.resolve([])]).then(function (res) {
      var students = res[0].map(function (s) { return { value: s.id, label: s.name }; });
      var rec = id ? (res[1].filter(function (a) { return a.id === id; })[0] || {}) : {};
      var statusOpts = [
        { value: 'present', label: 'Присутствовал' },
        { value: 'excused', label: 'Уважительная причина' },
        { value: 'unexcused', label: 'Неуважительная причина' },
        { value: 'absent', label: 'Отсутствовал' }
      ];
      var html = '<form data-form>' +
        field('Ученик', selectCtrl('studentId', students, rec.studentId)) +
        row(field('Дата', input('date', rec.date, 'date')), field('Направление', input('direction', rec.direction))) +
        field('Статус', selectCtrl('status', statusOpts, rec.status || 'present')) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать посещение' : 'Новая отметка', html);
      bindCrudForm(m, function (data) { return id ? API.attendance.update(id, data) : API.attendance.create(data); },
        function () { toast(id ? 'Сохранено' : 'Отметка добавлена'); loadAdminAttendance(); });
    });
  }

  /* =================================================================
     ADMIN — homework CRUD + review  [v0.5]
     ================================================================= */
  var adminHw = $('#admin-homework-root');
  if (adminHw) {
    var addHwBtn = $('[data-add-hw]');
    if (addHwBtn) addHwBtn.addEventListener('click', function () { editHomework(null); });
    loadAdminHomework();
  }
  function loadAdminHomework() {
    API.homework.all().then(function (list) {
      if (!list.length) { adminHw.innerHTML = '<p class="cab-empty">Домашних заданий пока нет.</p>'; return; }
      var rows = list.map(function (h) {
        var reviewBtn = (h.status === 'submitted' || h.status === 'reviewed' || h.status === 'revision')
          ? '<button class="btn btn-outline btn-sm" data-review="' + h.id + '">Проверить</button>' : '';
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(h.studentName) + '</td>' +
          '<td data-th="Задание"><strong>' + escapeHtml(h.title) + '</strong></td>' +
          '<td data-th="Направление">' + escapeHtml(h.direction) + '</td>' +
          '<td data-th="Срок">' + fmtDate(h.dueDate) + '</td>' +
          '<td data-th="Статус">' + badge(HW_STATUS, h.status) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' + reviewBtn +
            '<button class="btn-icon" data-edit="' + h.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + h.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminHw.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Ученик</th><th>Задание</th><th>Направление</th><th>Срок</th><th>Статус</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminHw).forEach(function (b) { b.addEventListener('click', function () { editHomework(b.getAttribute('data-edit')); }); });
      $all('[data-review]', adminHw).forEach(function (b) { b.addEventListener('click', function () { reviewHomework(b.getAttribute('data-review')); }); });
      $all('[data-del]', adminHw).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить задание?')) API.homework.remove(b.getAttribute('data-del')).then(function () { toast('Задание удалено'); loadAdminHomework(); });
        });
      });
    });
  }
  function editHomework(id) {
    Promise.all([API.admin.studentOptions(), id ? API.homework.get(id) : Promise.resolve({})]).then(function (res) {
      var students = res[0].map(function (s) { return { value: s.id, label: s.name }; });
      var h = res[1] || {};
      var materials = (h.materials || []).map(function (mm) { return mm.name; }).join(', ');
      var html = '<form data-form>' +
        field('Ученик', selectCtrl('studentId', students, h.studentId)) +
        field('Название', input('title', h.title)) +
        field('Описание', textarea('description', h.description)) +
        row(field('Дата выдачи', input('assignedDate', h.assignedDate, 'date')),
            field('Срок выполнения', input('dueDate', h.dueDate, 'date'))) +
        field('Материалы (имена файлов через запятую)', input('materials', materials)) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать задание' : 'Новое задание', html);
      bindCrudForm(m, function (data) { return id ? API.homework.update(id, data) : API.homework.create(data); },
        function () { toast(id ? 'Сохранено' : 'Задание создано'); loadAdminHomework(); });
    });
  }
  function reviewHomework(id) {
    API.homework.get(id).then(function (h) {
      var sub = h.submission
        ? '<div class="hw-block"><div class="hw-block-label">Ответ ученика · ' + fmtDate(h.submission.submittedAt) + '</div>' +
            (h.submission.comment ? '<p>' + escapeHtml(h.submission.comment) + '</p>' : '') + hwFiles(h.submission.files) + '</div>'
        : '<p class="cab-empty">Ученик ещё не отправил работу.</p>';
      var statusOpts = [
        { value: 'reviewed', label: 'Проверено' },
        { value: 'revision', label: 'Требуется доработка' }
      ];
      var html = '<div class="cab-card-block"><div class="cab-strong">' + escapeHtml(h.title) + '</div></div>' + sub +
        '<form data-form>' +
          field('Комментарий преподавателя', textarea('comment', h.review ? h.review.comment : '')) +
          field('Статус', selectCtrl('status', statusOpts, h.status === 'revision' ? 'revision' : 'reviewed')) +
          formActions() + '</form>';
      var m = openModal('Проверка работы', html);
      bindCrudForm(m, function (data) { return API.homework.review(id, data); },
        function () { toast('Работа проверена'); loadAdminHomework(); });
    });
  }

  /* =================================================================
     ADMIN — certificates CRUD  [v0.5]
     ================================================================= */
  var adminCerts = $('#admin-certificates-root');
  if (adminCerts) {
    var addCertBtn = $('[data-add-cert]');
    if (addCertBtn) addCertBtn.addEventListener('click', function () { editCertificate(null); });
    loadAdminCerts();
  }
  function loadAdminCerts() {
    API.certificates.all().then(function (list) {
      if (!list.length) { adminCerts.innerHTML = '<p class="cab-empty">Сертификатов пока нет.</p>'; return; }
      var rows = list.map(function (c) {
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(c.studentName) + '</td>' +
          '<td data-th="Название"><strong>' + escapeHtml(c.title) + '</strong></td>' +
          '<td data-th="Дата">' + fmtDate(c.date) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + c.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + c.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminCerts.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Ученик</th><th>Название</th><th>Дата</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminCerts).forEach(function (b) { b.addEventListener('click', function () { editCertificate(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminCerts).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить сертификат?')) API.certificates.remove(b.getAttribute('data-del')).then(function () { toast('Сертификат удалён'); loadAdminCerts(); });
        });
      });
    });
  }
  function editCertificate(id) {
    Promise.all([API.admin.studentOptions(), id ? API.certificates.all() : Promise.resolve([])]).then(function (res) {
      var students = res[0].map(function (s) { return { value: s.id, label: s.name }; });
      var c = id ? (res[1].filter(function (x) { return x.id === id; })[0] || {}) : {};
      var gradOpts = [
        { value: 'linear-gradient(135deg,#1a0a0a,#3d1010)', label: 'Красный' },
        { value: 'linear-gradient(135deg,#0d1a0d,#0d3020)', label: 'Зелёный' },
        { value: 'linear-gradient(135deg,#0d0d1a,#151530)', label: 'Синий' },
        { value: 'linear-gradient(135deg,#1a0a15,#2d0d28)', label: 'Фиолетовый' }
      ];
      var html = '<form data-form>' +
        field('Ученик', selectCtrl('studentId', students, c.studentId)) +
        field('Название', input('title', c.title)) +
        field('Дата выдачи', input('date', c.date, 'date')) +
        field('Описание', textarea('description', c.description)) +
        field('Оформление', selectCtrl('gradient', gradOpts, c.gradient)) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать сертификат' : 'Новый сертификат', html);
      bindCrudForm(m, function (data) { return id ? API.certificates.update(id, data) : API.certificates.create(data); },
        function () { toast(id ? 'Сохранено' : 'Сертификат создан'); loadAdminCerts(); });
    });
  }

  /* =================================================================
     ADMIN — achievements CRUD  [v0.5]
     ================================================================= */
  var adminAch = $('#admin-achievements-root');
  if (adminAch) {
    var addAchBtn = $('[data-add-ach]');
    if (addAchBtn) addAchBtn.addEventListener('click', function () { editAchievement(null); });
    loadAdminAch();
  }
  function loadAdminAch() {
    API.achievements.all().then(function (list) {
      if (!list.length) { adminAch.innerHTML = '<p class="cab-empty">Достижений пока нет.</p>'; return; }
      var rows = list.map(function (a) {
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(a.studentName) + '</td>' +
          '<td data-th="Достижение"><strong>' + escapeHtml(a.title) + '</strong></td>' +
          '<td data-th="Дата">' + fmtDate(a.date) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + a.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + a.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminAch.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Ученик</th><th>Достижение</th><th>Дата</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminAch).forEach(function (b) { b.addEventListener('click', function () { editAchievement(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminAch).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить достижение?')) API.achievements.remove(b.getAttribute('data-del')).then(function () { toast('Достижение удалено'); loadAdminAch(); });
        });
      });
    });
  }
  function editAchievement(id) {
    Promise.all([API.admin.studentOptions(), id ? API.achievements.all() : Promise.resolve([])]).then(function (res) {
      var students = res[0].map(function (s) { return { value: s.id, label: s.name }; });
      var a = id ? (res[1].filter(function (x) { return x.id === id; })[0] || {}) : {};
      var iconOpts = [
        { value: 'concert', label: 'Концерт' },
        { value: 'stage', label: 'Выступление' },
        { value: 'calendar', label: 'Без пропусков' },
        { value: 'course', label: 'Курс завершён' },
        { value: 'exhibition', label: 'Выставка' },
        { value: 'star', label: 'Звезда' }
      ];
      var html = '<form data-form>' +
        field('Ученик', selectCtrl('studentId', students, a.studentId)) +
        field('Название', input('title', a.title)) +
        row(field('Иконка', selectCtrl('icon', iconOpts, a.icon || 'star')),
            field('Дата', input('date', a.date, 'date'))) +
        field('Описание', textarea('description', a.description)) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать достижение' : 'Новое достижение', html);
      bindCrudForm(m, function (data) { return id ? API.achievements.update(id, data) : API.achievements.create(data); },
        function () { toast(id ? 'Сохранено' : 'Достижение создано'); loadAdminAch(); });
    });
  }

  /* shared CRUD form binder */
  function bindCrudForm(modal, save, onDone) {
    var form = modal.body.querySelector('[data-form]');
    var cancel = modal.body.querySelector('[data-cancel]');
    if (cancel) cancel.addEventListener('click', modal.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = form.querySelector('[data-err]'); hide(err);
      var data = {};
      $all('input, select, textarea', form).forEach(function (el) { if (el.name) data[el.name] = el.value; });
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      save(data).then(function () { modal.close(); onDone(); })
        .catch(function (ex) { setFormError(err, ex.message); btn.disabled = false; });
    });
  }
})();
