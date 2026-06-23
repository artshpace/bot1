/* =====================================================================
   CABINET PAGE LOGIC — Shpigotskiy Art Space (v0.2)
   ---------------------------------------------------------------------
   One file drives every /account/ page. Each section runs only if its
   anchor element exists on the current page, so the same script is safe
   to include everywhere. Depends on api.js (window.API).
   ===================================================================== */
(function () {
  'use strict';

  var API = window.API;

  /* ---------- small DOM helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function show(el) { if (el) el.classList.add('show'); }
  function hide(el) { if (el) el.classList.remove('show'); }
  function getNextParam() {
    var m = location.search.match(/[?&]next=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : 'dashboard.html';
  }

  /* Toast notice (used for mock actions like "open course"). */
  function toast(message) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }
  window.cabinetToast = toast;

  function setFormError(box, message) {
    if (!box) return;
    box.textContent = message;
    box.classList.add('show');
  }

  /* =================================================================
     AUTH FORMS — login / register / recover
     ================================================================= */

  // ---- LOGIN ----
  var loginForm = $('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var box = $('#login-error');
      hide(box);
      var login = $('#login-id').value.trim();
      var password = $('#login-password').value;
      if (!login || !password) { setFormError(box, 'Заполните все поля'); return; }

      var btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Вход…';

      API.auth.login(login, password).then(function () {
        location.href = getNextParam();
      }).catch(function (err) {
        setFormError(box, err.message);
        btn.disabled = false; btn.textContent = btn.dataset.label;
      });
    });
  }

  // ---- REGISTER ----
  var registerForm = $('#register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var box = $('#register-error');
      hide(box);
      var name = $('#reg-name').value.trim();
      var email = $('#reg-email').value.trim();
      var phone = $('#reg-phone').value.trim();
      var password = $('#reg-password').value;
      var password2 = $('#reg-password2').value;

      if (name.length < 2) { setFormError(box, 'Введите имя'); return; }
      if (!email && !phone) { setFormError(box, 'Укажите телефон или email'); return; }
      if (password.length < 6) { setFormError(box, 'Пароль должен быть не короче 6 символов'); return; }
      if (password !== password2) { setFormError(box, 'Пароли не совпадают'); return; }

      var btn = registerForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Создаём…';

      API.auth.register({ name: name, email: email, phone: phone, password: password }).then(function () {
        location.href = 'dashboard.html';
      }).catch(function (err) {
        setFormError(box, err.message);
        btn.disabled = false; btn.textContent = btn.dataset.label;
      });
    });
  }

  // ---- RECOVER ----
  var recoverForm = $('#recover-form');
  if (recoverForm) {
    recoverForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var box = $('#recover-error');
      hide(box);
      var login = $('#recover-id').value.trim();
      if (!login) { setFormError(box, 'Укажите телефон или email'); return; }

      var btn = recoverForm.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Отправляем…';

      API.auth.recover(login).then(function () {
        var body = $('#recover-body');
        var success = $('#recover-success');
        if (body) body.style.display = 'none';
        show(success);
      }).catch(function (err) {
        setFormError(box, err.message);
        btn.disabled = false; btn.textContent = 'Восстановить доступ';
      });
    });
  }

  /* =================================================================
     SIDEBAR — fill greeting + bind sign-out (present on all inner pages)
     ================================================================= */
  var me = API.auth.current();
  if (me) {
    var greetEl = $('[data-user-name]');
    if (greetEl) greetEl.textContent = me.name;
    var initialEl = $('[data-user-initial]');
    if (initialEl) initialEl.textContent = (me.name || '?').trim().charAt(0).toUpperCase() || '?';
  }
  $all('[data-signout]').forEach(function (btn) {
    btn.addEventListener('click', function () { window.signOut(); });
  });
  // Mobile sidebar toggle
  var sbToggle = $('[data-sidebar-toggle]');
  var sidebar = $('.cab-sidebar');
  if (sbToggle && sidebar) {
    sbToggle.addEventListener('click', function () { sidebar.classList.toggle('open'); });
  }

  /* =================================================================
     DASHBOARD
     ================================================================= */
  var dash = $('#dashboard-root');
  if (dash) {
    var PAYMENT = {
      paid: { label: 'Оплачено', cls: 'badge-green' },
      pending: { label: 'Ожидает оплаты', cls: 'badge-gold' },
      overdue: { label: 'Просрочено', cls: 'badge-red' }
    };
    function fmtDate(iso) {
      var months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      var p = iso.split('-');
      return parseInt(p[2], 10) + ' ' + months[parseInt(p[1], 10) - 1] + ' ' + p[0];
    }

    API.student.profile().then(function (p) {
      $('[data-dash="hello"]').textContent = 'Здравствуйте, ' + p.name.split(' ')[0] + '!';
      $('[data-dash="direction"]').textContent = p.direction;
      $('[data-dash="level"]').textContent = p.level;
      $('[data-dash="teacher"]').textContent = p.teacher;

      // next lesson
      if (p.nextLesson) {
        $('[data-dash="next-day"]').textContent = p.nextLesson.weekday + ', ' + fmtDate(p.nextLesson.date);
        $('[data-dash="next-time"]').textContent = p.nextLesson.time + ' · ' + p.nextLesson.room;
        $('[data-dash="next-dir"]').textContent = p.nextLesson.direction + ' · ' + p.nextLesson.teacher;
      } else {
        $('[data-dash="next-day"]').textContent = 'Нет запланированных занятий';
      }

      // lessons left
      $('[data-dash="lessons-left"]').textContent = p.lessonsLeft;
      $('[data-dash="lessons-total"]').textContent = 'из ' + p.lessonsTotal + ' в абонементе';
      var pct = Math.round((p.lessonsLeft / p.lessonsTotal) * 100);
      var bar = $('[data-dash="lessons-bar"]');
      if (bar) bar.style.width = pct + '%';

      // subscription + payment
      $('[data-dash="sub-until"]').textContent = 'до ' + fmtDate(p.subscriptionUntil);
      var pay = PAYMENT[p.paymentStatus] || PAYMENT.pending;
      var payBadge = $('[data-dash="payment"]');
      payBadge.textContent = pay.label;
      payBadge.className = 'cab-badge ' + pay.cls;

      $('#dashboard-root').classList.add('loaded');
    });

    // weekly schedule preview
    API.student.weekly().then(function (rows) {
      var list = $('[data-dash="weekly"]');
      if (!list) return;
      list.innerHTML = rows.map(function (r) {
        return '<div class="cab-week-row">' +
          '<div class="cab-week-day">' + r.weekday + '</div>' +
          '<div class="cab-week-info"><strong>' + r.direction + '</strong><span>' + r.teacher + ' · ' + r.room + '</span></div>' +
          '<div class="cab-week-time">' + r.time + '</div>' +
          '</div>';
      }).join('');
    });
  }

  /* =================================================================
     MY COURSES
     ================================================================= */
  var coursesRoot = $('#courses-root');
  if (coursesRoot) {
    API.courses.purchased().then(function (list) {
      coursesRoot.innerHTML = list.map(function (c) {
        var done = c.progress >= 100;
        return '<div class="cab-course">' +
          '<div class="cab-course-cover" style="background:' + c.gradient + ';">' +
            (done ? '<span class="cab-course-flag">Завершён</span>' : '') +
          '</div>' +
          '<div class="cab-course-body">' +
            '<h3>' + c.title + '</h3>' +
            '<p class="cab-course-teacher">' + c.teacher + '</p>' +
            '<div class="cab-progress"><div class="cab-progress-bar" style="width:' + c.progress + '%;"></div></div>' +
            '<div class="cab-course-meta">' +
              '<span>' + c.lessonsDone + ' / ' + c.lessonsTotal + ' уроков</span>' +
              '<span class="cab-course-pct">' + c.progress + '%</span>' +
            '</div>' +
            '<button class="btn ' + (done ? 'btn-outline' : 'btn-primary') + ' btn-full cab-course-btn" data-course="' + c.id + '">' +
              (done ? 'Пройти заново' : 'Продолжить курс') +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');

      $all('[data-course]', coursesRoot).forEach(function (btn) {
        btn.addEventListener('click', function () {
          // Mock: real player arrives with the LMS module.
          toast('Плеер курса появится в ближайшем обновлении');
        });
      });
    });
  }

  /* =================================================================
     SCHEDULE CALENDAR
     ================================================================= */
  var calRoot = $('#calendar-root');
  if (calRoot) {
    var WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    var view = new Date();
    view = new Date(view.getFullYear(), view.getMonth(), 1);

    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function ymd(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }

    function render() {
      var year = view.getFullYear();
      var month = view.getMonth();
      $('[data-cal="title"]').textContent = MONTHS[month] + ' ' + year;

      API.schedule.month(year, month).then(function (lessons) {
        // group lessons by date
        var byDate = {};
        lessons.forEach(function (l) { (byDate[l.date] = byDate[l.date] || []).push(l); });

        var grid = $('[data-cal="grid"]');
        var html = WEEKDAY_SHORT.map(function (w) {
          return '<div class="cal-head">' + w + '</div>';
        }).join('');

        // Monday-first offset
        var first = new Date(year, month, 1);
        var lead = (first.getDay() + 6) % 7;
        for (var i = 0; i < lead; i++) html += '<div class="cal-cell cal-empty"></div>';

        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var today = new Date();
        var todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate());

        for (var d = 1; d <= daysInMonth; d++) {
          var key = ymd(year, month, d);
          var dayLessons = byDate[key] || [];
          var cls = 'cal-cell';
          if (key === todayStr) cls += ' cal-today';
          if (dayLessons.length) cls += ' cal-has';
          html += '<div class="' + cls + '" data-day="' + key + '">' +
            '<span class="cal-num">' + d + '</span>' +
            (dayLessons.length ? '<span class="cal-dot"></span>' : '') +
            '</div>';
        }
        grid.innerHTML = html;

        // bind day clicks to detail panel
        $all('.cal-has', grid).forEach(function (cell) {
          cell.addEventListener('click', function () {
            $all('.cal-cell.selected', grid).forEach(function (c) { c.classList.remove('selected'); });
            cell.classList.add('selected');
            showDay(cell.dataset.day, byDate[cell.dataset.day]);
          });
        });

        // auto-select today (or first lesson day) for a non-empty panel
        var initial = byDate[todayStr] ? todayStr : Object.keys(byDate).sort()[0];
        if (initial) {
          var initCell = grid.querySelector('[data-day="' + initial + '"]');
          if (initCell) initCell.classList.add('selected');
          showDay(initial, byDate[initial]);
        } else {
          $('[data-cal="detail"]').innerHTML = '<p class="cab-empty">В этом месяце занятий нет.</p>';
        }
      });
    }

    function showDay(dateStr, lessons) {
      var p = dateStr.split('-');
      var title = parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1].toLowerCase();
      var html = '<h3 class="cab-detail-title">' + title + '</h3>';
      html += (lessons || []).map(function (l) {
        return '<div class="cab-lesson">' +
          '<div class="cab-lesson-time">' + l.time + '</div>' +
          '<div class="cab-lesson-info"><strong>' + l.direction + '</strong><span>' + l.teacher + ' · ' + l.room + '</span></div>' +
          '</div>';
      }).join('');
      $('[data-cal="detail"]').innerHTML = html;
    }

    $('[data-cal="prev"]').addEventListener('click', function () {
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render();
    });
    $('[data-cal="next"]').addEventListener('click', function () {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render();
    });

    render();
  }
})();
