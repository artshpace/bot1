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
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
  };

  var STUDENT_NAV = [
    { href: 'dashboard.html',     label: 'Главная',           icon: ICON.home    },
    { href: 'schedule.html',      label: 'Расписание',        icon: ICON.calendar},
    { href: 'courses.html',       label: 'Мои курсы',         icon: ICON.book    },
    { href: 'subscriptions.html', label: 'Мои абонементы',    icon: ICON.card    },
    { href: 'payments.html',      label: 'История платежей',  icon: ICON.receipt },
    { href: 'shop.html',          label: 'Оплата и покупки',  icon: ICON.cart    }
  ];
  var STUDENT_SOON = [
    { label: 'Родительский кабинет', icon: ICON.parents, tag: 'v0.5' },
    { label: 'Домашние задания',     icon: ICON.hw,      tag: 'v0.5' },
    { label: 'Сертификаты',          icon: ICON.cert,    tag: 'v0.5' }
  ];
  var ADMIN_NAV = [
    { href: 'admin.html',               label: 'Ученики',    icon: ICON.users   },
    { href: 'admin-subscriptions.html', label: 'Абонементы', icon: ICON.card    },
    { href: 'admin-courses.html',       label: 'Курсы',      icon: ICON.book    },
    { href: 'admin-payments.html',      label: 'Платежи',    icon: ICON.receipt }
  ];

  function renderSidebar() {
    var host = $('[data-cab-sidebar]');
    if (!host) return;
    var kind = host.getAttribute('data-cab-sidebar');
    var me = API.auth.current();
    var file = location.pathname.split('/').pop() || 'dashboard.html';
    var isAdmin = me && me.role === 'admin';
    var roleLabel = isAdmin ? 'Администратор' : 'Ученик';
    var initial = ((me && me.name) || '?').trim().charAt(0).toUpperCase() || '?';

    function link(item) {
      return '<a href="' + item.href + '"' + (item.href === file ? ' class="active"' : '') + '>' +
        item.icon + item.label + '</a>';
    }

    var nav = '';
    if (kind === 'admin') {
      nav += ADMIN_NAV.map(link).join('');
    } else {
      nav += STUDENT_NAV.map(link).join('');
      if (isAdmin) {
        nav += '<div class="cab-nav-sep">Администрирование</div>' +
          '<a href="admin.html">' + ICON.shield + 'Админ-панель</a>';
      }
      nav += '<div class="cab-nav-sep">Скоро</div>';
      nav += STUDENT_SOON.map(function (s) {
        return '<span class="cab-nav-soon">' + s.icon + s.label +
          '<span class="soon-tag">' + s.tag + '</span></span>';
      }).join('');
    }

    host.innerHTML =
      '<a href="../index.html" class="cab-logo">' +
        '<span class="name">Shpigotskiy Art Space</span>' +
        '<span class="tagline-small">' + (kind === 'admin' ? 'Администрирование' : 'Личный кабинет') + '</span>' +
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
        if (user.role === 'admin' && dest === 'dashboard.html') dest = 'admin.html';
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
      openModal('Карточка ученика',
        '<div class="cab-card-block"><div class="cab-strong">' + escapeHtml(u.name) + '</div>' +
          '<div class="cab-muted">' + escapeHtml(u.email || '—') + ' · ' + escapeHtml(u.phone || '—') + '</div></div>' +
        '<h4 class="cab-block-title">Абонементы</h4><ul class="cab-list">' + subs + '</ul>' +
        '<h4 class="cab-block-title">Платежи</h4><ul class="cab-list">' + pays + '</ul>' +
        '<h4 class="cab-block-title">Курсы</h4><ul class="cab-list">' + crs + '</ul>');
    }).catch(function (e) { toast(e.message); });
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
