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
  function formActions(submitLabel) {
    return '<div class="form-error" data-err></div>' +
      '<div class="cab-modal-actions">' +
        '<button type="button" class="btn btn-outline btn-sm" data-cancel>Отмена</button>' +
        '<button type="submit" class="btn btn-primary btn-sm">' + (submitLabel || 'Сохранить') + '</button>' +
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
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v14"/></svg>',
    funnel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    teacher: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>'
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
    absent:    { label: 'Отсутствовал',   cls: 'badge-gray'  },
    sick:      { label: 'По болезни',     cls: 'badge-blue'  },
    makeup:    { label: 'Отработка',      cls: 'badge-teal'  }
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
    { href: 'schedule.html',      label: 'Календарь',         icon: ICON.calendar },
    { href: 'courses.html',       label: 'Мои курсы',         icon: ICON.book     },
    { href: 'attendance.html',    label: 'Посещаемость',      icon: ICON.check2   },
    { href: 'journal.html',       label: 'Журнал занятий',    icon: ICON.book     },
    { href: 'homework.html',      label: 'Домашние задания',  icon: ICON.hw       },
    { href: 'achievements.html',  label: 'Достижения',        icon: ICON.star     },
    { href: 'certificates.html',  label: 'Сертификаты',       icon: ICON.cert     },
    { href: 'portfolio.html',     label: 'Портфолио',         icon: ICON.folder   },
    { href: 'progress.html',      label: 'Профиль развития',  icon: ICON.chart    },
    { href: 'subscriptions.html', label: 'Мои абонементы',    icon: ICON.card     },
    { href: 'payments.html',      label: 'История платежей',  icon: ICON.receipt  },
    { href: 'shop.html',          label: 'Оплата и покупки',  icon: ICON.cart     },
    { href: 'orders.html',        label: 'Мои заказы',        icon: ICON.receipt  },
    { href: 'notifications.html', label: 'Уведомления',       icon: ICON.bell     },
    { href: 'settings.html',      label: 'Настройки',         icon: ICON.gear     }
  ];
  var PARENT_NAV = [
    { href: 'parent.html',        label: 'Кабинет родителя',  icon: ICON.parents  },
    { href: 'shop.html',          label: 'Оплата и покупки',  icon: ICON.cart     },
    { href: 'orders.html',        label: 'Мои заказы',        icon: ICON.receipt  },
    { href: 'notifications.html', label: 'Уведомления',       icon: ICON.bell     },
    { href: 'settings.html',      label: 'Настройки',         icon: ICON.gear     }
  ];
  var TEACHER_NAV = [
    { href: 'teacher.html',       label: 'Кабинет',           icon: ICON.home     },
    { href: 'shop.html',          label: 'Оплата и покупки',  icon: ICON.cart     },
    { href: 'cart.html',          label: 'Корзина',           icon: ICON.receipt  },
    { href: 'notifications.html', label: 'Уведомления',       icon: ICON.bell     },
    { href: 'settings.html',      label: 'Настройки',         icon: ICON.gear     }
  ];
  var ADMIN_NAV = [
    /* --- Ученики / Преподаватели --- */
    { href: 'admin.html',               label: 'Ученики',          icon: ICON.users     },
    { href: 'admin-parents.html',       label: 'Родители',         icon: ICON.parents   },
    { href: 'admin-teachers.html',      label: 'Преподаватели',    icon: ICON.teacher   },
    /* --- CRM --- */
    { href: 'admin-leads.html',         label: 'CRM Лиды',         icon: ICON.funnel    },
    { href: 'admin-trials.html',        label: 'Пробные занятия',  icon: ICON.calendar  },
    { href: 'admin-funnel.html',        label: 'Воронка продаж',   icon: ICON.chart     },
    /* --- Учёба --- */
    { href: 'admin-subscriptions.html', label: 'Абонементы',       icon: ICON.card      },
    { href: 'admin-courses.html',       label: 'Курсы',            icon: ICON.book      },
    { href: 'admin-attendance.html',    label: 'Посещаемость',     icon: ICON.check2    },
    { href: 'admin-homework.html',      label: 'Домашние задания', icon: ICON.hw        },
    { href: 'admin-skillmap.html',      label: 'Карта развития',   icon: ICON.star      },
    /* --- Образование v1.1 --- */
    { href: 'admin-journal.html',        label: 'Эл. журнал',       icon: ICON.book      },
    { href: 'admin-recalculations.html', label: 'Перерасчёты',      icon: ICON.card      },
    { href: 'admin-rehearsals.html',     label: 'Репетиции',        icon: ICON.calendar  },
    { href: 'admin-tickets.html',        label: 'Билеты',           icon: ICON.ticket    },
    { href: 'admin-branding.html',       label: 'Брендинг',         icon: ICON.gear      },
    /* --- Контент --- */
    { href: 'admin-certificates.html',  label: 'Сертификаты',      icon: ICON.cert      },
    { href: 'admin-achievements.html',  label: 'Достижения',       icon: ICON.star      },
    { href: 'admin-portfolio.html',     label: 'Портфолио',        icon: ICON.folder    },
    { href: 'admin-events.html',        label: 'Мероприятия',      icon: ICON.ticket    },
    /* --- Финансы / Аналитика --- */
    { href: 'admin-payments.html',      label: 'Платежи',          icon: ICON.receipt   },
    { href: 'admin-orders.html',        label: 'Заказы',           icon: ICON.cart      },
    { href: 'admin-analytics.html',     label: 'Аналитика',        icon: ICON.chart     },
    { href: 'admin-ads.html',           label: 'Реклама и лиды',   icon: ICON.funnel    },
    { href: 'admin-churn.html',         label: 'Причины ухода',    icon: ICON.logout    },
    { href: 'admin-reports.html',       label: 'Отчёты',           icon: ICON.folder    },
    /* --- Коммуникации --- */
    { href: 'admin-broadcast.html',     label: 'Рассылки',         icon: ICON.bell      },
    { href: 'notifications.html',       label: 'Уведомления',      icon: ICON.bell      },
    /* --- Система --- */
    { href: 'director.html',            label: 'Панель директора', icon: ICON.star      },
    { href: 'settings.html',            label: 'Настройки',        icon: ICON.gear      }
  ];

  function renderSidebar() {
    var host = $('[data-cab-sidebar]');
    if (!host) return;
    var kind = host.getAttribute('data-cab-sidebar');
    var me = API.auth.current();
    // Shared pages declare data-cab-sidebar="auto" → pick nav by role.  [v0.7]
    if (kind === 'auto') {
      var r = me && me.role;
      kind = (r === 'admin' || r === 'director') ? 'admin' : r === 'parent' ? 'parent' : r === 'teacher' ? 'teacher' : 'student';
    }
    var file = location.pathname.split('/').pop() || 'dashboard.html';
    // Director is the owner superuser → treated as admin for nav/label. [Phase 2 P0]
    var isAdmin = me && (me.role === 'admin' || me.role === 'director');
    var roleLabel = isAdmin ? 'Администратор'
      : kind === 'parent' ? 'Родитель'
      : kind === 'teacher' ? 'Преподаватель'
      : 'Ученик';
    var initial = ((me && me.name) || '?').trim().charAt(0).toUpperCase() || '?';
    var tagline = kind === 'admin' ? 'Администрирование'
      : kind === 'parent' ? 'Кабинет родителя'
      : kind === 'teacher' ? 'Кабинет преподавателя'
      : 'Личный кабинет';

    function link(item) {
      return '<a href="' + item.href + '"' + (item.href === file ? ' class="active"' : '') + '>' +
        item.icon + item.label + '</a>';
    }

    var nav = '';
    if (kind === 'admin') {
      // "Панель директора" is director-only; hide it from plain admins. [Phase 2 P0]
      var isDirector = me && me.role === 'director';
      nav += ADMIN_NAV.filter(function (it) {
        return it.href !== 'director.html' || isDirector;
      }).map(link).join('');
    } else if (kind === 'parent') {
      nav += PARENT_NAV.map(link).join('');
    } else if (kind === 'teacher') {
      nav += TEACHER_NAV.map(link).join('');
      if (isAdmin) {
        nav += '<div class="cab-nav-sep">Администрирование</div>' +
          '<a href="admin.html">' + ICON.shield + 'Админ-панель</a>';
      }
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

  /* Apply brand colours + dynamic school name/logo after sidebar is painted */
  if (API.brand) {
    API.brand.get().then(function (br) {
      if (br.primaryColor) document.documentElement.style.setProperty('--accent', br.primaryColor);
      if (br.accentColor)  document.documentElement.style.setProperty('--accent-dark', br.accentColor);
      var nameEl = $('.cab-logo .name');
      if (nameEl && br.schoolName) nameEl.textContent = br.schoolName;
      var taglineEl = $('.cab-logo .tagline-small');
      if (taglineEl && br.tagline) taglineEl.textContent = br.tagline;
      if (br.logoUrl) {
        var cabLogo = $('.cab-logo');
        if (cabLogo && !cabLogo.querySelector('.cab-logo-img')) {
          var img = document.createElement('img');
          img.className = 'cab-logo-img';
          img.src = br.logoUrl; img.alt = br.schoolName || 'Logo';
          img.onerror = function () { img.remove(); };
          cabLogo.insertBefore(img, cabLogo.firstChild);
        }
      }
    });
  }

  var sbToggle = $('[data-sidebar-toggle]');
  var sidebar  = $('.cab-sidebar');
  if (sbToggle && sidebar) {
    var backdrop = document.createElement('div');
    backdrop.className = 'cab-backdrop';
    document.body.appendChild(backdrop);
    function openSidebar()  { sidebar.classList.add('open');    backdrop.classList.add('show'); }
    function closeSidebar() { sidebar.classList.remove('open'); backdrop.classList.remove('show'); }
    sbToggle.addEventListener('click', function () {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    backdrop.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSidebar(); });
  }

  /* =================================================================
     NAVIGATION — back / home / breadcrumbs + sign-out confirm  [v0.6]
     A subnav strip is injected under the topbar on every cabinet page,
     so the existing topbar design stays intact.
     ================================================================= */
  var PAGE_META = {
    'dashboard.html':         { title: 'Главная' },
    'schedule.html':          { title: 'Расписание и календарь' },
    'courses.html':           { title: 'Мои курсы' },
    'lesson.html':            { title: 'Урок', parent: 'courses.html' },
    'attendance.html':        { title: 'Посещаемость' },
    'homework.html':          { title: 'Домашние задания' },
    'certificates.html':      { title: 'Сертификаты' },
    'achievements.html':      { title: 'Профиль достижений' },
    'progress.html':          { title: 'Профиль развития' },
    'portfolio.html':         { title: 'Портфолио' },
    'notifications.html':     { title: 'Уведомления' },
    'settings.html':          { title: 'Настройки аккаунта' },
    'subscriptions.html':     { title: 'Мои абонементы' },
    'payments.html':          { title: 'История платежей' },
    'shop.html':              { title: 'Оплата и покупки' },
    'parent.html':            { title: 'Кабинет родителя' },
    'teacher.html':           { title: 'Кабинет преподавателя' },
    'cart.html':              { title: 'Корзина' },
    'checkout.html':          { title: 'Оформление заказа', parent: 'cart.html' },
    'orders.html':            { title: 'Мои заказы' },
    'admin.html':             { title: 'Ученики' },
    'admin-parents.html':     { title: 'Родители' },
    'admin-subscriptions.html': { title: 'Абонементы' },
    'admin-courses.html':     { title: 'Курсы' },
    'admin-attendance.html':  { title: 'Посещаемость' },
    'admin-homework.html':    { title: 'Домашние задания' },
    'admin-certificates.html':{ title: 'Сертификаты' },
    'admin-achievements.html':{ title: 'Достижения' },
    'admin-events.html':      { title: 'Мероприятия' },
    'admin-portfolio.html':   { title: 'Портфолио' },
    'admin-payments.html':    { title: 'Платежи' },
    /* CRM v0.9 */
    'admin-leads.html':       { title: 'CRM Лиды' },
    'admin-trials.html':      { title: 'Пробные занятия' },
    'admin-teachers.html':    { title: 'Преподаватели' },
    'admin-funnel.html':      { title: 'Воронка продаж' },
    'admin-analytics.html':   { title: 'Финансовая аналитика' },
    'admin-broadcast.html':   { title: 'Рассылки' },
    'admin-skillmap.html':    { title: 'Карта развития' },
    'admin-churn.html':       { title: 'Причины ухода' },
    'admin-reports.html':     { title: 'Отчёты' },
    'admin-orders.html':      { title: 'Заказы' },
    'admin-ads.html':         { title: 'Реклама и лиды' },
    'director.html':          { title: 'Панель директора' },
    /* v1.1 educational */
    'journal.html':              { title: 'Журнал занятий' },
    'admin-journal.html':        { title: 'Электронный журнал' },
    'admin-recalculations.html': { title: 'Перерасчёты по болезни' },
    'admin-rehearsals.html':     { title: 'Репетиции' },
    'admin-tickets.html':        { title: 'Билеты на мероприятия' },
    'admin-branding.html':       { title: 'Брендинг' }
  };

  function roleHome() {
    var me = API.auth.current();
    if (me && me.role === 'director') return { href: 'director.html',  label: 'Панель директора' };
    if (me && me.role === 'admin')   return { href: 'admin.html',    label: 'Админ-панель' };
    if (me && me.role === 'parent')  return { href: 'parent.html',   label: 'Кабинет родителя' };
    if (me && me.role === 'teacher') return { href: 'teacher.html',  label: 'Кабинет преподавателя' };
    return { href: 'dashboard.html', label: 'Главная' };
  }

  function buildCrumbs(file) {
    var home = roleHome();
    var crumbs = [{ href: home.href, label: home.label }];
    var chain = [];
    var cur = file;
    var guard = 0;
    while (cur && PAGE_META[cur] && PAGE_META[cur].parent && guard++ < 6) {
      cur = PAGE_META[cur].parent;
      if (PAGE_META[cur]) chain.unshift({ href: cur, label: PAGE_META[cur].title });
    }
    chain.forEach(function (c) { crumbs.push(c); });
    var meta = PAGE_META[file];
    if (file !== home.href && meta) crumbs.push({ href: null, label: meta.title });
    return crumbs;
  }

  function renderSubnav() {
    var topbar = $('.cab-topbar');
    if (!topbar || $('.cab-subnav')) return;
    var file = location.pathname.split('/').pop() || 'dashboard.html';
    var home = roleHome();
    var crumbs = buildCrumbs(file);
    var isHome = file === home.href;

    var trail = crumbs.map(function (c, i) {
      var last = i === crumbs.length - 1;
      if (c.href && !last) return '<a href="' + c.href + '">' + escapeHtml(c.label) + '</a>';
      return '<span aria-current="page">' + escapeHtml(c.label) + '</span>';
    }).join('<span class="sep">/</span>');

    var bar = document.createElement('div');
    bar.className = 'cab-subnav';
    bar.innerHTML =
      '<div class="cab-subnav-actions">' +
        (isHome ? '' : '<button class="cab-navbtn" data-nav-back type="button">' + BACK_ICON + '<span>Назад</span></button>') +
        '<a class="cab-navbtn" href="' + home.href + '">' + ICON.home + '<span>На главную</span></a>' +
        '<a class="cab-navbtn cab-navbtn-site" href="../index.html">' + GLOBE_ICON + '<span>На сайт</span></a>' +
      '</div>' +
      '<nav class="cab-breadcrumbs" aria-label="Хлебные крошки">' + trail + '</nav>' +
      '<div class="cab-search" data-search>' +
        '<span class="cab-search-ic">' + SEARCH_ICON + '</span>' +
        '<input type="search" class="cab-search-input" placeholder="Поиск по платформе…" autocomplete="off" aria-label="Глобальный поиск">' +
        '<div class="cab-search-results" data-search-results hidden></div>' +
      '</div>';
    topbar.parentNode.insertBefore(bar, topbar.nextSibling);

    var back = $('[data-nav-back]', bar);
    if (back) back.addEventListener('click', function () {
      if (history.length > 1) history.back();
      else location.href = home.href;
    });
    wireGlobalSearch(bar);
  }

  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>';
  var SEARCH_TYPE = { course: 'Курс', lesson: 'Урок', teacher: 'Преподаватель', homework: 'ДЗ', event: 'Мероприятие' };

  function wireGlobalSearch(bar) {
    var box = $('[data-search]', bar);
    var input = $('.cab-search-input', box);
    var results = $('[data-search-results]', box);
    var timer = null;

    function render(list, q) {
      if (!list.length) {
        results.innerHTML = '<div class="cab-search-empty">Ничего не найдено по запросу «' + escapeHtml(q) + '»</div>';
      } else {
        results.innerHTML = list.map(function (r) {
          return '<a class="cab-search-row" href="' + r.href + '">' +
            '<span class="cab-search-tag">' + escapeHtml(SEARCH_TYPE[r.type] || r.type) + '</span>' +
            '<span class="cab-search-main"><span class="t">' + escapeHtml(r.title) + '</span>' +
            (r.subtitle ? '<span class="s">' + escapeHtml(r.subtitle) + '</span>' : '') + '</span></a>';
        }).join('');
      }
      results.hidden = false;
    }
    function close() { results.hidden = true; }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      if (q.length < 2) { close(); return; }
      timer = setTimeout(function () {
        API.search.global(q).then(function (list) { render(list, q); });
      }, 200);
    });
    input.addEventListener('focus', function () { if (results.innerHTML && input.value.trim().length >= 2) results.hidden = false; });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) close(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; close(); } });
  }

  var BACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
  var GLOBE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>';

  renderSubnav();

  /* =================================================================
     TELEGRAM MINI APP ADAPTER  [v0.6]
     Activates only when a page is opened inside Telegram (the Telegram
     WebApp SDK is present). Outside Telegram it is a no-op, so ordinary
     browser use is unaffected. Architecture-ready for the real bot.
     ================================================================= */
  (function initMiniApp() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.initData) return;
    try {
      document.body.classList.add('tg-miniapp');
      tg.ready();
      tg.expand();
      // Map Telegram's native Back button to our navigation.
      var home = roleHome();
      var file = location.pathname.split('/').pop() || 'dashboard.html';
      if (file !== home.href && tg.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(function () {
          if (history.length > 1) history.back(); else location.href = home.href;
        });
      }
    } catch (e) { /* never break the page over the optional integration */ }
  })();

  /* Sign-out with confirmation. */
  function confirmSignOut() {
    var m = openModal('Выход из аккаунта',
      '<p class="cab-confirm-text">Вы действительно хотите выйти из аккаунта?</p>' +
      '<div class="cab-modal-actions">' +
        '<button type="button" class="btn btn-outline btn-sm" data-no>Отмена</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-yes>Выйти</button>' +
      '</div>');
    $('[data-no]', m.body).addEventListener('click', m.close);
    $('[data-yes]', m.body).addEventListener('click', function () { window.signOut(); });
  }
  $all('[data-signout]').forEach(function (btn) {
    btn.addEventListener('click', function () { confirmSignOut(); });
  });

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
          if (user.role === 'director') dest = 'director.html';
          else if (user.role === 'admin') dest = 'admin.html';
          else if (user.role === 'parent') dest = 'parent.html';
          else if (user.role === 'teacher') dest = 'teacher.html';
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
  var TXN_STATUS = {
    succeeded:  { label: 'Успешно',     cls: 'badge-green' },
    processing: { label: 'В обработке',  cls: 'badge-blue'  },
    pending:    { label: 'Ожидает',      cls: 'badge-gold'  },
    failed:     { label: 'Ошибка',       cls: 'badge-red'   }
  };
  function txnDate(iso) { return iso ? fmtDate(iso.slice(0, 10)) : '—'; }
  var payRoot = $('#payments-root');
  if (payRoot) {
    Promise.all([API.payments.list(), API.payments.transactions()]).then(function (res) {
      var list = res[0], txns = res[1];
      var html = '';
      if (!list.length) {
        html += '<p class="cab-empty">Платежей пока нет.</p>';
      } else {
        var rows = list.map(function (p) {
          return '<tr>' +
            '<td data-th="Дата">' + fmtDate(p.date) + '</td>' +
            '<td data-th="Назначение">' + escapeHtml(p.purpose) + '</td>' +
            '<td data-th="Сумма">' + fmtMoney(p.amount) + '</td>' +
            '<td data-th="Статус">' + badge(PAY_STATUS, p.status) + '</td></tr>';
        }).join('');
        html += '<div class="cab-table-wrap"><table class="cab-table">' +
          '<thead><tr><th>Дата</th><th>Назначение</th><th>Сумма</th><th>Статус</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>';
      }
      // Transaction log from the universal payment layer.
      if (txns.length) {
        var trows = txns.map(function (t) {
          return '<tr>' +
            '<td data-th="Дата">' + txnDate(t.createdAt) + '</td>' +
            '<td data-th="Операция">' + escapeHtml(t.purpose || '—') + '</td>' +
            '<td data-th="Шлюз">' + escapeHtml(t.gateway) + '</td>' +
            '<td data-th="Сумма">' + fmtMoney(t.amount) + '</td>' +
            '<td data-th="Статус">' + badge(TXN_STATUS, t.status) +
              (t.error ? ' <span class="cab-muted">(' + escapeHtml(t.error) + ')</span>' : '') + '</td></tr>';
        }).join('');
        html += '<h2 class="cab-section-title">История транзакций</h2>' +
          '<div class="cab-table-wrap"><table class="cab-table">' +
          '<thead><tr><th>Дата</th><th>Операция</th><th>Шлюз</th><th>Сумма</th><th>Статус</th></tr></thead>' +
          '<tbody>' + trows + '</tbody></table></div>';
      }
      payRoot.innerHTML = html;
    });
  }

  /* =================================================================
     SHOP
     ================================================================= */
  var shopRoot = $('#shop-root');
  if (shopRoot) { loadShop(); }
  function loadShop() {
    var plansHost = $('[data-shop="plans"]');
    if (plansHost) {
      API.subscriptions.plans().then(function (plans) {
        plansHost.innerHTML = plans.map(function (p) {
          return '<div class="cab-buy-card">' +
            '<div class="cab-buy-head"><h3>' + escapeHtml(p.name) + '</h3><span class="cab-buy-price">' + fmtMoney(p.price) + '</span></div>' +
            '<ul class="cab-buy-feats"><li>' + p.lessons + ' занятий</li><li>Срок ' + p.durationDays + ' дней</li><li>' + escapeHtml(p.direction) + '</li></ul>' +
            '<button class="btn btn-primary btn-full" data-buy-plan="' + p.id + '">Купить</button></div>';
        }).join('');
        $all('[data-buy-plan]', plansHost).forEach(function (btn) {
          btn.addEventListener('click', function () { buyPlan(btn.getAttribute('data-buy-plan'), btn); });
        });
      });
    }
    API.subscriptions.list().then(function (list) {
      var host = $('[data-shop="renew"]');
      if (!host) return;
      var renewable = list.filter(function (s) { return s.status !== 'completed'; });
      if (!renewable.length) { host.innerHTML = '<p class="cab-empty">Нет абонементов для продления.</p>'; return; }
      host.innerHTML = renewable.map(function (s) {
        return '<div class="cab-buy-card">' +
          '<div class="cab-buy-head"><h3>' + escapeHtml(s.name) + '</h3><span class="cab-buy-price">' + fmtMoney(s.price) + '</span></div>' +
          '<ul class="cab-buy-feats"><li>Осталось ' + s.lessonsLeft + ' из ' + s.lessonsTotal + '</li><li>До ' + fmtDate(s.endDate) + '</li><li>' + badge(SUB_STATUS, s.status) + '</li></ul>' +
          '<button class="btn btn-outline btn-full" data-renew="' + s.id + '">Продлить</button></div>';
      }).join('');
      $all('[data-renew]', host).forEach(function (btn) {
        btn.addEventListener('click', function () { renewSub(btn.getAttribute('data-renew'), btn); });
      });
    });
    API.courses.catalog().then(function (list) {
      var coursesHost = $('[data-shop="courses"]');
      if (!coursesHost) return;
      coursesHost.innerHTML = list.map(function (c) {
        return '<div class="cab-buy-card">' +
          '<div class="cab-buy-head"><h3>' + escapeHtml(c.title) + '</h3><span class="cab-buy-price">' + fmtMoney(c.price) + '</span></div>' +
          '<ul class="cab-buy-feats"><li>' + escapeHtml(c.teacher) + '</li><li>' + c.lessonsTotal + ' уроков</li></ul>' +
          (c.owned
            ? '<button class="btn btn-outline btn-full" disabled>Уже приобретён</button>'
            : '<button class="btn btn-primary btn-full" data-buy-course="' + c.id + '">Купить курс</button>') +
          '</div>';
      }).join('');
      $all('[data-buy-course]', coursesHost).forEach(function (btn) {
        btn.addEventListener('click', function () { buyCourse(btn.getAttribute('data-buy-course'), btn); });
      });
    });
    var mcHost = $('[data-shop="masterclasses"]');
    if (mcHost) {
      API.shop.masterclasses().then(function (list) {
        if (!list.length) { mcHost.innerHTML = '<p class="cab-empty">Нет доступных мастер-классов.</p>'; return; }
        mcHost.innerHTML = list.map(function (e) {
          return '<div class="cab-buy-card">' +
            '<div class="cab-buy-head"><h3>' + escapeHtml(e.title) + '</h3><span class="cab-buy-price">' + fmtMoney(e.price || 0) + '</span></div>' +
            '<ul class="cab-buy-feats">' +
              (e.date ? '<li>' + fmtDate(e.date) + (e.time ? ' · ' + escapeHtml(e.time) : '') + '</li>' : '') +
              (e.place ? '<li>' + escapeHtml(e.place) + '</li>' : '') +
            '</ul>' +
            '<button class="btn btn-primary btn-full" data-cart-add data-type="event" data-id="' + e.id + '" data-name="' + escapeHtml(e.title) + '" data-price="' + (e.price || 0) + '">В корзину</button>' +
          '</div>';
        }).join('');
        bindCartAddButtons(mcHost);
      });
    }
    var intHost = $('[data-shop="intensives"]');
    if (intHost) {
      API.shop.intensives().then(function (list) {
        if (!list.length) { intHost.innerHTML = '<p class="cab-empty">Нет доступных интенсивов.</p>'; return; }
        intHost.innerHTML = list.map(function (p) {
          return '<div class="cab-buy-card">' +
            '<div class="cab-buy-head"><h3>' + escapeHtml(p.name) + '</h3><span class="cab-buy-price">' + fmtMoney(p.price) + '</span></div>' +
            '<ul class="cab-buy-feats"><li>' + escapeHtml(p.direction) + '</li><li>' + p.lessons + ' занятий · ' + p.durationDays + ' дней</li></ul>' +
            '<button class="btn btn-primary btn-full" data-cart-add data-type="intensive" data-id="' + p.id + '" data-name="' + escapeHtml(p.name) + '" data-price="' + p.price + '">В корзину</button>' +
          '</div>';
        }).join('');
        bindCartAddButtons(intHost);
      });
    }
    var gcHost = $('[data-shop="giftcerts"]');
    if (gcHost) {
      API.shop.giftCertificates().then(function (list) {
        if (!list.length) { gcHost.innerHTML = '<p class="cab-empty">Нет доступных сертификатов.</p>'; return; }
        gcHost.innerHTML = list.map(function (gc) {
          return '<div class="cab-buy-card">' +
            '<div class="cab-buy-head"><h3>' + escapeHtml(gc.name) + '</h3><span class="cab-buy-price">' + fmtMoney(gc.price) + '</span></div>' +
            '<ul class="cab-buy-feats"><li>Номинал ' + fmtMoney(gc.value) + '</li><li>Действует 12 месяцев</li></ul>' +
            '<button class="btn btn-primary btn-full" data-cart-add data-type="giftCert" data-id="' + gc.id + '" data-name="' + escapeHtml(gc.name) + '" data-price="' + gc.price + '">В корзину</button>' +
          '</div>';
        }).join('');
        bindCartAddButtons(gcHost);
      });
    }
  }
  function bindCartAddButtons(root) {
    $all('[data-cart-add]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = {
          type: btn.getAttribute('data-type'),
          productId: btn.getAttribute('data-id'),
          name: btn.getAttribute('data-name'),
          price: parseFloat(btn.getAttribute('data-price')) || 0
        };
        API.cart.add(item).then(function () {
          toast('Добавлено в корзину');
          refreshCartBadge();
        }).catch(function (e) { toast(e.message); });
      });
    });
  }
  function refreshCartBadge() {
    API.cart.count().then(function (n) {
      $all('.cab-nav a[href="cart.html"]').forEach(function (a) {
        var b = a.querySelector('.cab-nav-badge');
        if (n > 0) {
          if (!b) { b = document.createElement('span'); b.className = 'cab-nav-badge'; a.appendChild(b); }
          b.textContent = n;
        } else if (b) { b.remove(); }
      });
    });
  }
  refreshCartBadge();
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
     CART  [v0.7]
     ================================================================= */
  var cartRoot = $('#cart-root');
  if (cartRoot) { loadCart(); }
  function loadCart() {
    API.cart.items().then(function (items) {
      if (!items.length) {
        cartRoot.innerHTML =
          '<div class="cab-page-head"><h1>Корзина</h1></div>' +
          '<p class="cab-empty">Корзина пуста. <a href="shop.html">Перейти в магазин →</a></p>';
        return;
      }
      var rows = items.map(function (it) {
        return '<tr>' +
          '<td data-th="Товар"><strong>' + escapeHtml(it.name) + '</strong>' +
            '<div class="cab-muted">' + escapeHtml(cartTypeLabel(it.type)) + '</div></td>' +
          '<td data-th="Кол-во"><div class="cart-qty-ctrl">' +
            '<button class="btn-icon" data-cart-minus="' + it.id + '">−</button>' +
            '<span>' + it.qty + '</span>' +
            '<button class="btn-icon" data-cart-plus="' + it.id + '">+</button>' +
          '</div></td>' +
          '<td data-th="Цена">' + fmtMoney(it.price * it.qty) + '</td>' +
          '<td data-th=""><button class="btn-icon danger" data-cart-rm="' + it.id + '" title="Удалить">✕</button></td>' +
        '</tr>';
      }).join('');
      API.cart.total().then(function (total) {
        cartRoot.innerHTML =
          '<div class="cab-page-head"><h1>Корзина</h1></div>' +
          '<div class="cab-table-wrap"><table class="cab-table">' +
          '<thead><tr><th>Товар</th><th>Кол-во</th><th>Сумма</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>' +
          '<div class="cart-footer">' +
            '<div class="cart-total">Итого: <strong>' + fmtMoney(total) + '</strong></div>' +
            '<button class="btn btn-primary" id="cart-checkout-btn">Оформить заказ</button>' +
          '</div>';
        $all('[data-cart-rm]', cartRoot).forEach(function (b) {
          b.addEventListener('click', function () {
            API.cart.remove(b.getAttribute('data-cart-rm')).then(function () { refreshCartBadge(); loadCart(); });
          });
        });
        $all('[data-cart-minus]', cartRoot).forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-cart-minus');
            var cur = items.filter(function (i) { return i.id === id; })[0];
            if (cur && cur.qty <= 1) {
              API.cart.remove(id).then(function () { refreshCartBadge(); loadCart(); });
            } else {
              API.cart.add({ id: id, qty: -1, _delta: true }).then(function () { loadCart(); }).catch(function () {
                API.cart.remove(id).then(function () { refreshCartBadge(); loadCart(); });
              });
            }
          });
        });
        $all('[data-cart-plus]', cartRoot).forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-cart-plus');
            var cur = items.filter(function (i) { return i.id === id; })[0];
            if (cur) API.cart.add({ type: cur.type, productId: cur.productId, name: cur.name, price: cur.price }).then(function () { loadCart(); });
          });
        });
        var checkoutBtn = $('#cart-checkout-btn');
        if (checkoutBtn) {
          /* Go to the dedicated checkout page — payment-method selection and
             payment happen there. Access is granted only after payment. */
          checkoutBtn.addEventListener('click', function () { location.href = 'checkout.html'; });
        }
      });
    });
  }
  function cartTypeLabel(t) {
    var MAP = { subscription: 'Абонемент', 'subscription-plan': 'Абонемент', course: 'Курс',
      intensive: 'Интенсив', giftCert: 'Подарочный сертификат', 'gift-cert': 'Подарочный сертификат',
      event: 'Мастер-класс', masterclass: 'Мастер-класс', merch: 'Товар' };
    return MAP[t] || t;
  }

  /* =================================================================
     CHECKOUT  [v1.0] — summary → customer data → payment method →
     payment → confirmation. Access is granted ONLY after payment.
     ================================================================= */
  /* Payment methods shown at checkout. `live: true` = selectable.
     CloudPayments handles Visa/MC/Apple Pay/Google Pay in one widget.
     Freedom Pay and Kaspi route through the backend proxy.
     Secrets (API keys) are NEVER here — see .env.example.            */
  var PAY_METHODS = [
    { id: 'cloudpayments', label: 'Банковская карта',  sub: 'Visa · Mastercard · Мир',         icon: '💳', live: false },
    { id: 'applepay',      label: 'Apple Pay',          sub: 'через CloudPayments',              icon: '🍎', live: false, via: 'cloudpayments' },
    { id: 'googlepay',     label: 'Google Pay',         sub: 'через CloudPayments',              icon: '⬛', live: false, via: 'cloudpayments' },
    { id: 'kaspi',         label: 'Kaspi Pay',          sub: 'QR-код или редирект',              icon: '🔴', live: false },
    { id: 'freedompay',    label: 'Freedom Pay',        sub: 'Фридом Банк',                      icon: '🔷', live: false },
    { id: 'mock',          label: 'Демо-оплата',        sub: 'тестовый режим',                   icon: '🧪', live: true  }
  ];
  var checkoutRoot = $('#checkout-root');
  if (checkoutRoot) { renderCheckoutSummary(); }
  function renderCheckoutSummary() {
    Promise.all([API.cart.items(), API.cart.total()]).then(function (res) {
      var items = res[0], total = res[1];
      if (!items.length) {
        checkoutRoot.innerHTML = '<p class="cab-empty">Корзина пуста. <a href="shop.html">Перейти в магазин →</a></p>';
        return;
      }
      var me = API.auth.current() || {};
      var rows = items.map(function (it) {
        return '<tr><td data-th="Товар"><strong>' + escapeHtml(it.name) + '</strong>' +
          '<div class="cab-muted">' + escapeHtml(cartTypeLabel(it.type)) + '</div></td>' +
          '<td data-th="Кол-во">' + it.qty + '</td>' +
          '<td data-th="Сумма">' + fmtMoney(it.price * it.qty) + '</td></tr>';
      }).join('');
      var firstLive = true;
      var methods = PAY_METHODS.map(function (m) {
        var checked = m.live && firstLive;
        if (m.live && firstLive) firstLive = false;
        return '<label class="pay-method' + (m.live ? '' : ' disabled') + '">' +
          '<input type="radio" name="paymethod" value="' + m.id + '"' +
            (m.live ? (checked ? ' checked' : '') : ' disabled') + '>' +
          '<span class="pay-method-inner">' +
            (m.icon ? '<span class="pay-method-icon">' + m.icon + '</span>' : '') +
            '<span class="pay-method-text"><strong>' + escapeHtml(m.label) + '</strong>' +
              (m.sub ? '<span class="cab-muted" style="font-size:.8rem;display:block">' + escapeHtml(m.sub) + '</span>' : '') +
            '</span>' +
          '</span>' +
          (m.live ? '' : ' <span class="badge badge-gray">скоро</span>') +
          '</label>';
      }).join('');
      checkoutRoot.innerHTML =
        '<div class="checkout-grid">' +
          '<div class="checkout-col">' +
            '<h3>Состав заказа</h3>' +
            '<div class="cab-table-wrap"><table class="cab-table"><thead><tr><th>Товар</th><th>Кол-во</th><th>Сумма</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<div class="cart-total" style="margin-top:12px">Итого к оплате: <strong>' + fmtMoney(total) + '</strong></div>' +
          '</div>' +
          '<div class="checkout-col">' +
            '<h3>Данные покупателя</h3>' +
            '<div class="form-group"><label>Имя</label><input class="cab-input" id="co-name" value="' + escapeHtml(me.name || '') + '"></div>' +
            '<div class="form-group"><label>Телефон</label><input class="cab-input" id="co-phone" value="' + escapeHtml(me.phone || '') + '"></div>' +
            '<div class="form-group"><label>Email</label><input class="cab-input" id="co-email" value="' + escapeHtml(me.email || '') + '"></div>' +
            '<h3 style="margin-top:16px">Способ оплаты</h3>' +
            '<div class="pay-methods">' + methods + '</div>' +
            '<div class="form-error" id="co-err" style="display:none"></div>' +
            '<button class="btn btn-primary btn-full" id="co-pay-btn" style="margin-top:16px">Перейти к оплате</button>' +
            '<p class="cab-muted" style="margin-top:8px;font-size:.8rem">Доступ к курсам и абонементам открывается только после успешной оплаты.</p>' +
          '</div>' +
        '</div>';
      $('#co-pay-btn').addEventListener('click', function () { startCheckout(total); });
    });
  }
  function startCheckout(total) {
    var btn = $('#co-pay-btn'); var err = $('#co-err');
    var selectedId = (checkoutRoot.querySelector('input[name="paymethod"]:checked') || {}).value || 'mock';
    /* Apple Pay / Google Pay route through the CloudPayments widget. */
    var selectedMeta = PAY_METHODS.filter(function (m) { return m.id === selectedId; })[0] || {};
    var gatewayId = selectedMeta.via || selectedId;
    var name = $('#co-name').value.trim();
    var phone = $('#co-phone').value.trim();
    if (!name || !phone) { err.textContent = 'Укажите имя и телефон'; err.style.display = 'block'; return; }
    err.style.display = 'none'; btn.disabled = true; btn.textContent = 'Создаём заказ…';
    API.orders.create({ name: name, phone: phone, email: ($('#co-email') || {}).value || '', paymentMethod: gatewayId })
      .then(function (order) { renderPaymentStep(order, selectedId, gatewayId); })
      .catch(function (e) { err.textContent = e.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Перейти к оплате'; });
  }
  function renderPaymentStep(order, displayId, gatewayId) {
    var method = gatewayId || displayId;
    var label = (PAY_METHODS.filter(function (m) { return m.id === (displayId || method); })[0] || {}).label || method;
    checkoutRoot.innerHTML =
      '<div class="checkout-pay">' +
        '<div class="cab-page-head"><h2>Оплата заказа №' + order.id.split('-').pop() + '</h2></div>' +
        '<p>Сумма к оплате: <strong>' + fmtMoney(order.total) + '</strong></p>' +
        '<p>Способ оплаты: <strong>' + escapeHtml(label) + '</strong></p>' +
        '<p class="cab-muted">Статус заказа: ожидает оплаты. Нажмите «Оплатить», чтобы завершить покупку.</p>' +
        '<div class="form-error" id="pay-err" style="display:none"></div>' +
        '<div style="display:flex;gap:10px;margin-top:16px">' +
          '<button class="btn btn-primary" id="pay-confirm">Оплатить ' + fmtMoney(order.total) + '</button>' +
          '<a class="btn btn-outline" href="orders.html">Оплатить позже</a>' +
        '</div>' +
      '</div>';
    $('#pay-confirm').addEventListener('click', function () {
      var b = $('#pay-confirm'); var e = $('#pay-err');
      b.disabled = true; b.textContent = 'Оплата…'; e.style.display = 'none';
      API.orders.pay(order.id, method).then(function (paid) {
        refreshCartBadge();
        checkoutRoot.innerHTML =
          '<div class="checkout-success" style="text-align:center;padding:40px 20px">' +
            '<div class="success-icon" style="margin:0 auto 16px;width:64px;height:64px;border-radius:50%;background:rgba(76,175,80,.15);display:flex;align-items:center;justify-content:center;color:#4caf50;font-size:32px">✓</div>' +
            '<h2>Оплата прошла успешно!</h2>' +
            '<p class="cab-muted">Заказ №' + paid.id.split('-').pop() + ' оплачен. Доступ открыт.</p>' +
            '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px">' +
              '<a class="btn btn-primary" href="orders.html">Мои заказы</a>' +
              '<a class="btn btn-outline" href="dashboard.html">В кабинет</a>' +
            '</div>' +
          '</div>';
      }).catch(function (ex) {
        e.textContent = 'Оплата не прошла: ' + ex.message + ' Попробуйте ещё раз или выберите другой способ.';
        e.style.display = 'block'; b.disabled = false; b.textContent = 'Оплатить ' + fmtMoney(order.total);
      });
    });
  }

  /* =================================================================
     ORDERS — "Мои заказы"  [v1.0]
     ================================================================= */
  var ORDER_STATUS_LABELS = {
    created: 'Создан', awaiting_payment: 'Ожидает оплаты', paid: 'Оплачен',
    cancelled: 'Отменён', refunded: 'Возврат'
  };
  var ORDER_STATUS_CLS = {
    created: 'badge-gray', awaiting_payment: 'badge-gold', paid: 'badge-green',
    cancelled: 'badge-red', refunded: 'badge-blue'
  };
  var PAY_STATUS_LABELS = {
    created: 'Создан', awaiting: 'Ожидает оплаты', succeeded: 'Оплачен',
    failed: 'Ошибка оплаты', cancelled: 'Отменён', refunded: 'Возврат'
  };
  var ordersRoot = $('#orders-root');
  if (ordersRoot) { loadMyOrders(); }
  function loadMyOrders() {
    API.orders.list().then(function (list) {
      if (!list.length) {
        ordersRoot.innerHTML = '<p class="cab-empty">У вас пока нет заказов. <a href="shop.html">Перейти в магазин →</a></p>';
        return;
      }
      var rows = list.map(function (o) {
        var items = o.items.map(function (i) { return escapeHtml(i.name) + (i.qty > 1 ? ' ×' + i.qty : ''); }).join(', ');
        var actions = '';
        if (o.status === 'awaiting_payment') {
          actions = '<button class="btn btn-sm btn-primary" data-pay-order="' + o.id + '">Оплатить</button> ' +
                    '<button class="btn btn-sm btn-outline" data-cancel-order="' + o.id + '">Отменить</button>';
        }
        return '<tr>' +
          '<td data-th="№">' + o.id.split('-').pop() + '</td>' +
          '<td data-th="Дата">' + fmtDate((o.createdAt || '').slice(0, 10)) + '</td>' +
          '<td data-th="Товары">' + items + '</td>' +
          '<td data-th="Сумма">' + fmtMoney(o.total) + '</td>' +
          '<td data-th="Заказ"><span class="badge ' + (ORDER_STATUS_CLS[o.status] || 'badge-gray') + '">' + escapeHtml(ORDER_STATUS_LABELS[o.status] || o.status) + '</span></td>' +
          '<td data-th="Оплата">' + escapeHtml(PAY_STATUS_LABELS[o.paymentStatus] || o.paymentStatus || '—') + '</td>' +
          '<td data-th="">' + actions + '</td>' +
        '</tr>';
      }).join('');
      ordersRoot.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>№</th><th>Дата</th><th>Товары</th><th>Сумма</th><th>Заказ</th><th>Оплата</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-pay-order]', ordersRoot).forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          API.orders.pay(b.getAttribute('data-pay-order')).then(function () {
            toast('Оплата прошла успешно. Доступ открыт.'); loadMyOrders();
          }).catch(function (e) { toast('Оплата не прошла: ' + e.message); b.disabled = false; });
        });
      });
      $all('[data-cancel-order]', ordersRoot).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Отменить заказ?')) return;
          API.orders.cancel(b.getAttribute('data-cancel-order')).then(function () { toast('Заказ отменён'); loadMyOrders(); });
        });
      });
    });
  }

  /* =================================================================
     ADMIN — Заказы (all orders, refund)  [v1.0]
     ================================================================= */
  var adminOrders = $('#admin-orders-root');
  if (adminOrders) { loadAdminOrders(); }
  function loadAdminOrders() {
    API.orders.all().then(function (list) {
      if (!list.length) { adminOrders.innerHTML = '<p class="cab-empty">Заказов пока нет.</p>'; return; }
      var rows = list.map(function (o) {
        var items = o.items.map(function (i) { return escapeHtml(i.name) + (i.qty > 1 ? ' ×' + i.qty : ''); }).join(', ');
        var refundBtn = o.status === 'paid'
          ? '<button class="btn btn-sm btn-outline" data-refund="' + o.id + '">Возврат</button>' : '';
        return '<tr>' +
          '<td data-th="№">' + o.id.split('-').pop() + '</td>' +
          '<td data-th="Клиент">' + escapeHtml(o.userName || (o.customer && o.customer.name) || '—') + '</td>' +
          '<td data-th="Дата">' + fmtDate((o.createdAt || '').slice(0, 10)) + '</td>' +
          '<td data-th="Товары">' + items + '</td>' +
          '<td data-th="Сумма">' + fmtMoney(o.total) + '</td>' +
          '<td data-th="Заказ"><span class="badge ' + (ORDER_STATUS_CLS[o.status] || 'badge-gray') + '">' + escapeHtml(ORDER_STATUS_LABELS[o.status] || o.status) + '</span></td>' +
          '<td data-th="Оплата">' + escapeHtml(PAY_STATUS_LABELS[o.paymentStatus] || o.paymentStatus || '—') + '</td>' +
          '<td data-th="">' + refundBtn + '</td>' +
        '</tr>';
      }).join('');
      adminOrders.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>№</th><th>Клиент</th><th>Дата</th><th>Товары</th><th>Сумма</th><th>Заказ</th><th>Оплата</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-refund]', adminOrders).forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Оформить возврат по заказу?')) return;
          API.orders.refund(b.getAttribute('data-refund')).then(function () { toast('Возврат оформлен'); loadAdminOrders(); })
            .catch(function (e) { toast(e.message); });
        });
      });
    });
  }

  /* =================================================================
     ADMIN — Реклама и лиды (ad analytics)  [v1.0]
     ================================================================= */
  var adminAds = $('#admin-ads-root');
  if (adminAds) { loadAdminAds(); }
  function loadAdminAds() {
    Promise.all([API.tracking.config(), API.telegram.config(), API.payments.config()]).then(function (cfgRes) {
      renderAdsIntegrations(cfgRes[0], cfgRes[1], cfgRes[2]);
    });
    API.analytics.ads().then(function (data) {
      function tableFor(rows, keyLabel) {
        if (!rows.length) return '<p class="cab-empty">Нет данных.</p>';
        var body = rows.map(function (r) {
          return '<tr><td data-th="' + keyLabel + '">' + escapeHtml(r.key) + '</td>' +
            '<td data-th="Лиды">' + r.leads + '</td>' +
            '<td data-th="Пробные">' + r.trials + '</td>' +
            '<td data-th="Покупки">' + r.purchases + '</td>' +
            '<td data-th="Конверсия">' + r.conversion + '%</td></tr>';
        }).join('');
        return '<div class="cab-table-wrap"><table class="cab-table"><thead><tr><th>' + keyLabel +
          '</th><th>Лиды</th><th>Пробные</th><th>Покупки</th><th>Конверсия</th></tr></thead><tbody>' + body + '</tbody></table></div>';
      }
      adminAds.innerHTML =
        '<div class="cab-stats-row" style="margin-bottom:24px">' +
          '<div class="cab-stat-card"><div class="cab-stat-val">' + data.totalLeads + '</div><div class="cab-stat-label">Всего лидов</div></div>' +
          '<div class="cab-stat-card"><div class="cab-stat-val">' + data.totalPurchases + '</div><div class="cab-stat-label">Покупок</div></div>' +
          '<div class="cab-stat-card"><div class="cab-stat-val">' + data.conversion + '%</div><div class="cab-stat-label">Конверсия лид→покупка</div></div>' +
          '<div class="cab-stat-card"><div class="cab-stat-val">' + fmtMoney(data.orderRevenue) + '</div><div class="cab-stat-label">Выручка по заказам</div></div>' +
        '</div>' +
        '<div id="ads-integrations"></div>' +
        '<h3 style="margin:8px 0 12px">По источникам</h3>' + tableFor(data.bySource, 'Источник') +
        '<h3 style="margin:24px 0 12px">По рекламным кампаниям (UTM)</h3>' + tableFor(data.byCampaign, 'Кампания');
      /* integrations block is rendered separately (async) — re-attach if present */
      Promise.all([API.tracking.config(), API.telegram.config(), API.payments.config()]).then(function (r) {
        renderAdsIntegrations(r[0], r[1], r[2]);
      });
    });
  }
  function renderAdsIntegrations(meta, tg, pay) {
    var host = $('#ads-integrations');
    if (!host) return;
    var gwOpts = ['mock', 'cloudpayments', 'kaspi', 'freedompay'].map(function (k) {
      var labels = { mock: 'Демо (тест)', cloudpayments: 'CloudPayments', kaspi: 'Kaspi Pay', freedompay: 'Freedom Pay' };
      return '<option value="' + k + '"' + ((pay && pay.activeGateway === k) ? ' selected' : '') + '>' + labels[k] + '</option>';
    }).join('');
    host.innerHTML =
      '<h3 style="margin:24px 0 12px">Интеграции — Meta Pixel · Telegram · Оплата</h3>' +
      '<div class="cab-card" style="padding:16px;max-width:560px;margin-bottom:16px">' +
        '<h4 style="margin:0 0 10px">Meta Pixel / Conversions API</h4>' +
        '<div class="form-group"><label>Meta Pixel ID</label><input class="cab-input" id="meta-pixel" value="' + escapeHtml(meta.pixelId || '') + '" placeholder="напр. 123456789012345"></div>' +
        '<div class="form-group"><label>Conversions API — токен доступа</label><input class="cab-input" id="meta-capi" value="' + escapeHtml(meta.capiToken || '') + '" placeholder="EAAB..."></div>' +
        '<label class="pay-method" style="margin:6px 0;padding:8px 12px"><input type="checkbox" id="meta-enabled"' + (meta.enabled ? ' checked' : '') + '> Включить отправку событий</label>' +
        '<div class="form-group" style="margin-top:10px"><label>Telegram — chat ID администратора</label><input class="cab-input" id="tg-chat" value="' + escapeHtml(tg.adminChatId || '') + '" placeholder="напр. 123456789"></div>' +
        '<p class="cab-muted" style="font-size:.8rem;margin:4px 0 10px">Бот: @' + escapeHtml(tg.bot || '') + '. Секретный токен бота — только в переменной TELEGRAM_BOT_TOKEN на сервере.</p>' +
        '<button class="btn btn-primary btn-sm" id="save-integrations">Сохранить</button>' +
      '</div>' +
      '<div class="cab-card" style="padding:16px;max-width:560px">' +
        '<h4 style="margin:0 0 10px">Платёжный шлюз</h4>' +
        '<div class="form-group"><label>Активный шлюз</label>' +
          '<select class="cab-input" id="pay-gateway">' + gwOpts + '</select></div>' +
        '<div class="form-group"><label>CloudPayments Public ID <span class="cab-muted">(клиентский, не секрет)</span></label>' +
          '<input class="cab-input" id="cp-public-id" value="' + escapeHtml((pay && pay.cloudpaymentsPublicId) || '') + '" placeholder="pk_..."></div>' +
        '<p class="cab-muted" style="font-size:.8rem;margin:4px 0 10px">API Secret, ключи Kaspi и Freedom Pay — только в переменных окружения на сервере. Смотрите <code>.env.example</code>.</p>' +
        '<button class="btn btn-primary btn-sm" id="save-pay-cfg">Сохранить</button>' +
      '</div>';
    $('#save-integrations').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      Promise.all([
        API.tracking.setConfig({ pixelId: $('#meta-pixel').value.trim(),
          capiToken: $('#meta-capi').value.trim(), enabled: $('#meta-enabled').checked }),
        API.telegram.setAdminChat($('#tg-chat').value.trim())
      ]).then(function () { toast('Настройки интеграций сохранены'); btn.disabled = false; });
    });
    $('#save-pay-cfg').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      API.payments.setConfig({
        activeGateway: $('#pay-gateway').value,
        cloudpaymentsPublicId: $('#cp-public-id').value.trim()
      }).then(function () { toast('Настройки оплаты сохранены'); btn.disabled = false; });
    });
  }

  /* =================================================================
     SCHEDULE / UNIFIED CALENDAR  [v0.6 — lessons + events + deadlines]
     ================================================================= */
  var CAL_KIND = {
    lesson:    { label: 'Занятие',    cls: 'ck-lesson'    },
    event:     { label: 'Мероприятие', cls: 'ck-event'   },
    deadline:  { label: 'Дедлайн ДЗ', cls: 'ck-deadline' },
    rehearsal: { label: 'Репетиция',  cls: 'ck-rehearsal' }
  };
  var CAL_EVENT_KIND = {
    concert: 'Концерт', performance: 'Спектакль', exhibition: 'Выставка', masterclass: 'Мастер-класс'
  };
  function calKindOf(item) {
    if (item.kind === 'event') return CAL_EVENT_KIND[item.eventType] || 'Мероприятие';
    return CAL_KIND[item.kind] ? CAL_KIND[item.kind].label : item.kind;
  }
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
      API.calendar.month(year, month).then(function (items) {
        var byDate = {};
        items.forEach(function (it) { (byDate[it.date] = byDate[it.date] || []).push(it); });
        var grid = $('[data-cal="grid"]');
        var html = WEEKDAY_SHORT.map(function (w) { return '<div class="cal-head">' + w + '</div>'; }).join('');
        var first = new Date(year, month, 1), lead = (first.getDay() + 6) % 7;
        for (var i = 0; i < lead; i++) html += '<div class="cal-cell cal-empty"></div>';
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var today = new Date(), todayStr = ymd2(today.getFullYear(), today.getMonth(), today.getDate());
        for (var d = 1; d <= daysInMonth; d++) {
          var key = ymd2(year, month, d), day = byDate[key] || [];
          var cls = 'cal-cell' + (key === todayStr ? ' cal-today' : '') + (day.length ? ' cal-has' : '');
          var dots = '';
          if (day.length) {
            var kinds = {};
            day.forEach(function (it) { kinds[it.kind] = true; });
            dots = '<span class="cal-dots">' + Object.keys(kinds).map(function (k) {
              return '<span class="cal-dot ' + (CAL_KIND[k] ? CAL_KIND[k].cls : '') + '"></span>';
            }).join('') + '</span>';
          }
          html += '<div class="' + cls + '" data-day="' + key + '"><span class="cal-num">' + d + '</span>' + dots + '</div>';
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
        else $('[data-cal="detail"]').innerHTML = '<p class="cab-empty">В этом месяце событий нет.</p>';
      });
    }
    function showDay(dateStr, items) {
      var p = dateStr.split('-');
      var title = parseInt(p[2], 10) + ' ' + CAL_MONTHS[parseInt(p[1], 10) - 1].toLowerCase();
      var html = '<h3 class="cab-detail-title">' + title + '</h3>';
      html += (items || []).map(function (it) {
        var kindCls = CAL_KIND[it.kind] ? CAL_KIND[it.kind].cls : '';
        var meta = it.kind === 'lesson' ? ((it.teacher || '') + (it.place ? ' · ' + it.place : ''))
          : (it.place || (it.kind === 'deadline' ? 'Срок сдачи задания' : ''));
        return '<div class="cab-lesson cal-item ' + kindCls + '">' +
          '<div class="cab-lesson-time">' + (it.time || '—') + '</div>' +
          '<div class="cab-lesson-info"><span class="cal-item-kind">' + escapeHtml(calKindOf(it)) + '</span>' +
          '<strong>' + escapeHtml(it.title) + '</strong>' +
          (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') + '</div></div>';
      }).join('');
      $('[data-cal="detail"]').innerHTML = html;
    }
    $('[data-cal="prev"]').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
    $('[data-cal="next"]').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
    render();
  }

  /* =================================================================
     TEACHER CABINET  [v0.7]
     ================================================================= */
  var teacherRoot = $('#teacher-root');
  if (teacherRoot) { loadTeacherCabinet(); }
  function loadTeacherCabinet() {
    Promise.all([
      API.teacher.myStudents(),
      API.teacher.homeworkForReview(),
      API.teacher.todayAttendance()
    ]).then(function (res) {
      var students = res[0], hwReview = res[1], attendance = res[2];
      var pending = hwReview.filter(function (h) { return h.status === 'submitted'; }).length;
      var html =
        '<div class="cab-page-head"><h1>Кабинет преподавателя</h1></div>' +
        '<div class="cab-grid">' +
          statCard(ICON.users,  'Мои ученики',    students.length, '') +
          statCard(ICON.hw,     'На проверку',    pending,         pending ? 'требуют проверки' : 'заданий к проверке нет') +
          statCard(ICON.check2, 'Посещаемость сегодня', attendance.length, 'занятий сегодня') +
        '</div>' +
        '<h2 class="cab-section-title">Мои ученики' +
          '<button class="btn btn-outline btn-sm" style="float:right" data-add-teacher-hw>+ Задание</button></h2>' +
        '<div class="cab-search" style="margin-bottom:16px">' +
          '<span class="cab-search-ic">' + SEARCH_ICON + '</span>' +
          '<input type="search" class="cab-search-input" id="teacher-student-search" placeholder="Поиск ученика…" autocomplete="off">' +
        '</div>' +
        '<div id="teacher-students-list">' + renderTeacherStudents(students) + '</div>';

      if (hwReview.length) {
        html += '<h2 class="cab-section-title">Домашние задания на проверку</h2>' +
          '<div id="teacher-hw-review">' + renderTeacherHwReview(hwReview) + '</div>';
      }

      if (attendance.length) {
        html += '<h2 class="cab-section-title">Посещаемость сегодня</h2>' +
          '<div id="teacher-attendance">' + renderTeacherAttendance(attendance, students) + '</div>';
      }

      html += '<h2 class="cab-section-title">Электронный журнал' +
        '<button class="btn btn-outline btn-sm" style="float:right" data-add-journal-entry>+ Запись в журнал</button></h2>' +
        '<div id="teacher-journal-list"><p class="cab-empty">Загрузка…</p></div>' +
        '<h2 class="cab-section-title">Мои репетиции</h2>' +
        '<div id="teacher-rehearsals-list"><p class="cab-empty">Загрузка…</p></div>';

      teacherRoot.innerHTML = html;

      API.teacher.myRehearsals().then(function (rlist) {
        var rl = $('#teacher-rehearsals-list', teacherRoot);
        if (!rl) return;
        if (!rlist.length) { rl.innerHTML = '<p class="cab-empty">Репетиций пока нет.</p>'; return; }
        rl.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
          '<thead><tr><th>Дата</th><th>Мероприятие</th><th>Место</th><th>Участников</th></tr></thead><tbody>' +
          rlist.map(function (r) {
            return '<tr>' +
              '<td data-th="Дата">' + fmtDate(r.date) + (r.time ? ' ' + escapeHtml(r.time) : '') + '</td>' +
              '<td data-th="Мероприятие"><strong>' + escapeHtml(r.eventTitle || r.eventId) + '</strong></td>' +
              '<td data-th="Место">' + escapeHtml(r.place || '—') + '</td>' +
              '<td data-th="Участников">' + (r.participants ? r.participants.length : 0) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      });

      API.teacher.journalEntries().then(function (entries) {
        var jl = $('#teacher-journal-list', teacherRoot);
        if (!jl) return;
        if (!entries.length) { jl.innerHTML = '<p class="cab-empty">Записей в журнале пока нет.</p>'; return; }
        jl.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
          '<thead><tr><th>Дата</th><th>Направление</th><th>Тема</th><th>Комментарий</th><th></th></tr></thead><tbody>' +
          entries.map(function (e) {
            return '<tr>' +
              '<td data-th="Дата">' + fmtDate(e.date) + (e.time ? ' ' + e.time : '') + '</td>' +
              '<td data-th="Направление">' + escapeHtml(e.direction) + '</td>' +
              '<td data-th="Тема"><strong>' + escapeHtml(e.topic) + '</strong></td>' +
              '<td data-th="Комментарий">' + escapeHtml(e.teacherComment || '—') + '</td>' +
              '<td data-th=""><div class="cab-row-actions">' +
                '<button class="btn-icon" data-edit-journal="' + e.id + '" title="Редактировать">✎</button>' +
                '<button class="btn-icon danger" data-del-journal="' + e.id + '" title="Удалить">✕</button>' +
              '</div></td></tr>';
          }).join('') +
          '</tbody></table></div>';
        bindTeacherJournalActions(teacherRoot, students);
      });

      var searchInput = $('#teacher-student-search', teacherRoot);
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          var q = searchInput.value.toLowerCase();
          var filtered = students.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) !== -1; });
          $('#teacher-students-list', teacherRoot).innerHTML = renderTeacherStudents(filtered);
          bindTeacherStudentActions(teacherRoot);
        });
      }
      bindTeacherStudentActions(teacherRoot);
      bindTeacherHwActions(teacherRoot);

      var addHwBtn = $('[data-add-teacher-hw]', teacherRoot);
      if (addHwBtn) addHwBtn.addEventListener('click', function () { editTeacherHomework(null, students); });

      var addJournalBtn = $('[data-add-journal-entry]', teacherRoot);
      if (addJournalBtn) addJournalBtn.addEventListener('click', function () { editJournalEntry(null, students); });
    });
  }
  function bindTeacherJournalActions(root, students) {
    $all('[data-edit-journal]', root).forEach(function (b) {
      b.addEventListener('click', function () { editJournalEntry(b.getAttribute('data-edit-journal'), students); });
    });
    $all('[data-del-journal]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Удалить запись?')) API.teacher.removeJournalEntry(b.getAttribute('data-del-journal')).then(function () {
          toast('Запись удалена');
          API.teacher.journalEntries().then(function (entries) {
            var jl = $('#teacher-journal-list', root);
            if (jl) jl.innerHTML = entries.length ? entries.map(function(e){
              return '<tr><td>' + fmtDate(e.date) + '</td><td>' + escapeHtml(e.direction) + '</td><td>' + escapeHtml(e.topic) + '</td><td>' + escapeHtml(e.teacherComment||'—') + '</td><td></td></tr>';
            }).join('') : '<p class="cab-empty">Записей пока нет.</p>';
          });
        });
      });
    });
  }
  function editJournalEntry(id, students) {
    var me = API.auth.current();
    var p = id ? API.journal.get(id) : Promise.resolve({});
    p.then(function (e) {
      e = e || {};
      var studs = (students || []).map(function (s) { return { value: s.id, label: s.name }; });
      var studsChecks = (students || []).map(function (s) {
        var on = (e.studentIds || []).indexOf(s.id) !== -1;
        return '<label class="check-row"><input type="checkbox" value="' + s.id + '" data-jrn-student' + (on?' checked':'') + '> ' + escapeHtml(s.name) + '</label>';
      }).join('');
      var html = '<form data-form>' +
        row(field('Дата', input('date', e.date || new Date().toISOString().slice(0,10), 'date')), field('Время', input('time', e.time || ''))) +
        field('Направление', input('direction', e.direction || (me && me.direction) || '')) +
        field('Тема занятия', input('topic', e.topic)) +
        field('Домашнее задание', textarea('homeworkText', e.homeworkText)) +
        field('Комментарий преподавателя', textarea('teacherComment', e.teacherComment)) +
        (studsChecks ? field('Ученики на занятии', '<div class="check-list">' + studsChecks + '</div>') : '') +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать запись' : 'Новая запись в журнал', html, true);
      var form = m.body.querySelector('[data-form]');
      m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var err = form.querySelector('[data-err]'); hide(err);
        var data = {};
        $all('input[name], select[name], textarea[name]', form).forEach(function (el) { if (el.name) data[el.name] = el.value; });
        data.studentIds = $all('[data-jrn-student]', form).filter(function(c){return c.checked;}).map(function(c){return c.value;});
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        var op = id ? API.teacher.updateJournalEntry(id, data) : API.teacher.createJournalEntry(data);
        op.then(function () { m.close(); toast(id ? 'Запись обновлена' : 'Запись добавлена'); loadTeacherCabinet(); })
          .catch(function (ex) { setFormError(err, ex.message); btn.disabled = false; });
      });
    });
  }
  function renderTeacherStudents(students) {
    if (!students.length) return '<p class="cab-empty">Учеников не найдено.</p>';
    return '<div class="cab-table-wrap"><table class="cab-table">' +
      '<thead><tr><th>Ученик</th><th>Направление</th><th>Посещаемость</th><th>Незакрытые ДЗ</th><th></th></tr></thead><tbody>' +
      students.map(function (s) {
        return '<tr>' +
          '<td data-th="Ученик"><strong>' + escapeHtml(s.name) + '</strong></td>' +
          '<td data-th="Направление">' + escapeHtml(s.direction || '—') + '</td>' +
          '<td data-th="Посещаемость">' + (s.attendanceRate != null ? s.attendanceRate + '%' : '—') + '</td>' +
          '<td data-th="Незакрытые ДЗ">' + (s.homeworkPending || 0) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn btn-outline btn-sm" data-teacher-card="' + s.id + '">Карточка</button>' +
            '<button class="btn btn-outline btn-sm" data-teacher-note="' + s.id + '" data-teacher-note-name="' + escapeHtml(s.name) + '">Комментарий</button>' +
          '</div></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }
  function renderTeacherHwReview(list) {
    if (!list.length) return '<p class="cab-empty">Заданий на проверку нет.</p>';
    return '<div class="cab-table-wrap"><table class="cab-table">' +
      '<thead><tr><th>Ученик</th><th>Задание</th><th>Статус</th><th>Срок</th><th></th></tr></thead><tbody>' +
      list.map(function (h) {
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(h.studentName) + '</td>' +
          '<td data-th="Задание"><strong>' + escapeHtml(h.title) + '</strong></td>' +
          '<td data-th="Статус">' + badge(HW_STATUS, h.status) + '</td>' +
          '<td data-th="Срок">' + fmtDate(h.dueDate) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn btn-outline btn-sm" data-teacher-review-hw="' + h.id + '">Проверить</button>' +
            '<button class="btn-icon" data-teacher-edit-hw="' + h.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-teacher-del-hw="' + h.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }
  function renderTeacherAttendance(list, students) {
    var attOpts = [
      { value: 'present',   label: 'Присутствовал' },
      { value: 'excused',   label: 'Уважительная причина' },
      { value: 'unexcused', label: 'Неуважительная причина' },
      { value: 'absent',    label: 'Отсутствовал' },
      { value: 'sick',      label: 'По болезни' },
      { value: 'makeup',    label: 'Отработка' }
    ];
    if (!list.length) return '<p class="cab-empty">Занятий сегодня нет.</p>';
    return '<div class="cab-table-wrap"><table class="cab-table">' +
      '<thead><tr><th>Ученик</th><th>Направление</th><th>Статус</th><th></th></tr></thead><tbody>' +
      list.map(function (a) {
        var opts = attOpts.map(function (o) {
          return '<option value="' + o.value + '"' + (a.status === o.value ? ' selected' : '') + '>' + o.label + '</option>';
        }).join('');
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(a.studentName) + '</td>' +
          '<td data-th="Направление">' + escapeHtml(a.direction) + '</td>' +
          '<td data-th="Статус"><select class="form-control form-control-sm" data-att-sel="' + a.id + '">' + opts + '</select></td>' +
          '<td data-th=""><button class="btn btn-outline btn-sm" data-att-save="' + a.id + '">Сохранить</button></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }
  function bindTeacherStudentActions(root) {
    $all('[data-teacher-card]', root).forEach(function (b) {
      b.addEventListener('click', function () { openStudentCard(b.getAttribute('data-teacher-card')); });
    });
    $all('[data-teacher-note]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-teacher-note');
        var name = b.getAttribute('data-teacher-note-name');
        addTeacherNote(id, name);
      });
    });
    $all('[data-att-save]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-att-save');
        var sel = $('[data-att-sel="' + id + '"]', root);
        if (!sel) return;
        API.teacher.updateAttendance(id, { status: sel.value }).then(function () { toast('Посещаемость обновлена'); });
      });
    });
  }
  function bindTeacherHwActions(root) {
    $all('[data-teacher-review-hw]', root).forEach(function (b) {
      b.addEventListener('click', function () { reviewHomework(b.getAttribute('data-teacher-review-hw')); });
    });
    $all('[data-teacher-edit-hw]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        API.teacher.myStudents().then(function (students) {
          editTeacherHomework(b.getAttribute('data-teacher-edit-hw'), students);
        });
      });
    });
    $all('[data-teacher-del-hw]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Удалить задание?')) {
          API.teacher.removeHomework(b.getAttribute('data-teacher-del-hw')).then(function () {
            toast('Задание удалено'); loadTeacherCabinet();
          });
        }
      });
    });
  }
  function addTeacherNote(studentId, studentName) {
    var typeOpts = [
      { value: 'progress', label: 'О прогрессе' },
      { value: 'recommendation', label: 'Рекомендация' },
      { value: 'remark', label: 'Замечание' }
    ];
    var html = '<form data-form>' +
      field('Тип', selectCtrl('type', typeOpts, 'progress')) +
      field('Комментарий', textarea('text', '')) +
      formActions() + '</form>';
    var m = openModal('Комментарий: ' + escapeHtml(studentName), html);
    bindCrudForm(m, function (data) {
      return API.teacher.addComment({ studentId: studentId, type: data.type, text: data.text });
    }, function () { toast('Комментарий добавлен'); });
  }
  function editTeacherHomework(id, students) {
    Promise.all([
      id ? API.homework.get(id) : Promise.resolve({}),
      students ? Promise.resolve(students) : API.teacher.myStudents()
    ]).then(function (res) {
      var h = res[0] || {}, sts = res[1];
      var studentOpts = sts.map(function (s) { return { value: s.id, label: s.name }; });
      var html = '<form data-form>' +
        field('Ученик', selectCtrl('studentId', studentOpts, h.studentId)) +
        field('Название', input('title', h.title)) +
        field('Описание', textarea('description', h.description)) +
        row(field('Дата выдачи', input('assignedDate', h.assignedDate, 'date')),
            field('Срок выполнения', input('dueDate', h.dueDate, 'date'))) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать задание' : 'Новое задание', html);
      bindCrudForm(m, function (data) {
        return id ? API.teacher.updateHomework(id, data) : API.teacher.createHomework(data);
      }, function () { toast(id ? 'Сохранено' : 'Задание создано'); loadTeacherCabinet(); });
    });
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
              attLegend('По болезни', st.sick || 0, 'badge-blue') +
              attLegend('Отработка', st.makeup || 0, 'badge-teal') +
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
      if (f.kind === 'url' || /^https?:\/\//.test(f.name)) {
        return '<a class="hw-file hw-link" href="' + escapeHtml(f.name) + '" target="_blank" rel="noopener">' + ICON.download + escapeHtml(f.name) + '</a>';
      }
      var icon = /^image\//.test(f.kind) ? ICON.image : /^audio\//.test(f.kind) ? ICON.note : /^video\//.test(f.kind) ? ICON.play : ICON.file;
      return '<span class="hw-file">' + icon + escapeHtml(f.name) + '</span>';
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
        '<p class="cab-muted" style="margin-bottom:16px;">Прикрепите файл или вставьте ссылку. Поддерживаются изображения, PDF, видео, аудио и ссылки на YouTube, Google Drive и т.д.</p>' +
        field('Файл с работой (изображение / PDF / видео / аудио)',
          '<input class="form-control" type="file" name="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.mp3,.mp4,.wav,.ogg">') +
        field('Или ссылка (URL на видео, Google Drive, SoundCloud…)', input('url', '')) +
        field('Текстовый ответ (опционально)', textarea('comment', '')) +
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
        var urlVal = (form.querySelector('input[name=url]') || {}).value || '';
        if (urlVal) files.push({ name: urlVal, kind: 'url' });
        var comment = form.querySelector('textarea[name=comment]').value;
        if (!files.length && !comment.trim()) { setFormError(err, 'Прикрепите файл, вставьте ссылку или напишите ответ'); return; }
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
    Promise.all([API.parent.children(), API.recalculations.list()]).then(function (res) {
      var kids = res[0], recalcs = res[1];
      if (!kids.length) {
        parentRoot.innerHTML = '<p class="cab-empty">К вашему аккаунту пока не привязаны ученики. Обратитесь к администратору студии.</p>';
        return;
      }
      var recalcSection = '<h2 class="cab-section-title" style="margin-top:36px">Перерасчёты по болезни' +
        '<button class="btn btn-outline btn-sm" style="float:right" data-add-recalc>+ Подать заявку</button></h2>' +
        renderParentRecalcList(recalcs);
      parentRoot.innerHTML = kids.map(renderChildCard).join('') + recalcSection;
      bindMockDownloads(parentRoot);
      var addRecalcBtn = $('[data-add-recalc]', parentRoot);
      if (addRecalcBtn) addRecalcBtn.addEventListener('click', function () { openRecalcForm(kids); });
    });
  }
  function renderParentRecalcList(list) {
    var RECALC_STATUS = { pending: { label: 'На рассмотрении', cls: 'badge-gold' }, approved: { label: 'Одобрено', cls: 'badge-green' }, rejected: { label: 'Отклонено', cls: 'badge-red' } };
    if (!list.length) return '<p class="cab-empty">Заявок на перерасчёт пока нет.</p>';
    return '<div class="cab-table-wrap"><table class="cab-table">' +
      '<thead><tr><th>Ученик</th><th>Дата пропуска</th><th>Комментарий</th><th>Статус</th><th>Ответ</th></tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(r.studentName) + '</td>' +
          '<td data-th="Дата пропуска">' + fmtDate(r.absenceDate) + '</td>' +
          '<td data-th="Комментарий">' + escapeHtml(r.comment || '—') + '</td>' +
          '<td data-th="Статус">' + badge(RECALC_STATUS, r.status) + '</td>' +
          '<td data-th="Ответ">' + escapeHtml(r.adminComment || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function openRecalcForm(kids) {
    var kidOpts = kids.map(function (k) { return { value: k.id, label: k.name }; });
    var html = '<form data-form>' +
      field('Ученик', selectCtrl('studentId', kidOpts, kidOpts[0] && kidOpts[0].value)) +
      field('Дата пропуска (по болезни)', input('absenceDate', '', 'date')) +
      field('Ссылка на справку / файл', input('certificateUrl', '')) +
      field('Комментарий', textarea('comment', '')) +
      formActions() + '</form>';
    var m = openModal('Заявка на перерасчёт по болезни', html);
    var form = m.body.querySelector('[data-form]');
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = form.querySelector('[data-err]'); hide(err);
      var data = {}; $all('input[name],select[name],textarea[name]', form).forEach(function(el){ if(el.name) data[el.name]=el.value; });
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      var kid = kids.filter(function(k){return k.id===data.studentId;})[0];
      data.studentName = kid ? kid.name : '';
      API.recalculations.create(data).then(function () { m.close(); toast('Заявка подана'); location.reload(); })
        .catch(function (ex) { setFormError(err, ex.message); btn.disabled = false; });
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
    var att = c.attendance || {};
    var attBreakdown =
      attLegend('Присутствовал', att.present || 0, 'badge-green') +
      attLegend('Уважительная', att.excused || 0, 'badge-gold') +
      attLegend('По болезни', att.sick || 0, 'badge-blue') +
      attLegend('Отработка', att.makeup || 0, 'badge-teal') +
      attLegend('Неуважительная', att.unexcused || 0, 'badge-red') +
      attLegend('Отсутствовал', att.absent || 0, 'badge-gray');
    return '<section class="pc-child">' +
      '<div class="pc-head">' +
        '<div class="cab-avatar pc-avatar">' + escapeHtml(c.name.charAt(0)) + '</div>' +
        '<div><h2>' + escapeHtml(c.name) + '</h2>' +
          '<div class="pc-sub">' + escapeHtml(c.direction) + ' · ' + escapeHtml(c.teacher) + ' · ' + escapeHtml(c.level) + '</div></div>' +
      '</div>' +
      '<div class="pc-tiles">' +
        pcTile('Ближайшее занятие', escapeHtml(next)) +
        pcTile('Осталось занятий', c.lessonsTotal ? (c.lessonsLeft + ' из ' + c.lessonsTotal) : 'нет абонемента') +
        pcTile('Посещаемость', (att.rate || 0) + '%') +
        pcTile('Оплата', '<span class="cab-badge ' + pay.cls + '">' + pay.label + '</span>') +
      '</div>' +
      '<div class="pc-cols">' +
        '<div class="pc-col"><h3 class="pc-col-title">Прогресс по курсам</h3>' + courses + '</div>' +
        '<div class="pc-col"><h3 class="pc-col-title">Домашние задания' +
          (c.homeworkPending ? ' <span class="pc-badge">' + c.homeworkPending + '</span>' : '') +
          '</h3><ul class="pc-hw-list">' + hw + '</ul></div>' +
      '</div>' +
      '<h3 class="pc-col-title">Статистика посещаемости</h3>' +
      '<div class="att-legend">' + attBreakdown + '</div>' +
      '<div class="cab-progress" style="margin-top:8px"><div class="cab-progress-bar" style="width:' + (att.rate || 0) + '%;"></div></div>' +
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
        { value: 'present',   label: 'Присутствовал' },
        { value: 'excused',   label: 'Уважительная причина' },
        { value: 'unexcused', label: 'Неуважительная причина' },
        { value: 'absent',    label: 'Отсутствовал' },
        { value: 'sick',      label: 'По болезни' },
        { value: 'makeup',    label: 'Отработка' }
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
      var certNum = c.number || ('CERT-' + Date.now().toString(36).toUpperCase());
      var html = '<form data-form>' +
        field('Ученик', selectCtrl('studentId', students, c.studentId)) +
        field('Название', input('title', c.title)) +
        row(field('Дата выдачи', input('date', c.date, 'date')),
            field('Уникальный номер', input('number', certNum))) +
        field('Описание', textarea('description', c.description)) +
        row(field('Оформление', selectCtrl('gradient', gradOpts, c.gradient)),
            field('Подпись (директор)', input('signedBy', c.signedBy || ''))) +
        field('URL логотипа на сертификате', input('logoUrl', c.logoUrl || '')) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать сертификат' : 'Новый сертификат', html, true);
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

  /* =================================================================
     SHARED-PAGE VIEWER CONTEXT  [v0.6]
     Student → self. Parent → one of their children. Admin → any student.
     The selected child/student is carried in ?student=ID.
     ================================================================= */
  function targetStudentId() {
    var m = location.search.match(/[?&]student=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function resolveViewer() {
    var me = API.auth.current();
    var sel = targetStudentId();
    if (!me || me.role === 'student') return Promise.resolve({ id: me ? me.id : null, options: null });
    var src = me.role === 'parent' ? API.parent.children() : API.admin.studentOptions();
    return src.then(function (list) {
      var opts = list.map(function (s) { return { id: s.id, name: s.name }; });
      var id = (sel && opts.some(function (o) { return o.id === sel; })) ? sel : (opts[0] && opts[0].id);
      return { id: id, options: opts };
    });
  }
  function viewerPicker(ctx, page, label) {
    if (!ctx.options || !ctx.options.length) return '';
    var opts = ctx.options.map(function (o) {
      return '<option value="' + escapeHtml(o.id) + '"' + (o.id === ctx.id ? ' selected' : '') + '>' + escapeHtml(o.name) + '</option>';
    }).join('');
    return '<div class="cab-viewer-pick"><label>' + (label || 'Ученик') + ':</label>' +
      '<select class="form-control" data-viewer-pick data-page="' + page + '">' + opts + '</select></div>';
  }
  function bindViewerPicker(root) {
    var sel = $('[data-viewer-pick]', root);
    if (sel) sel.addEventListener('change', function () {
      location.href = sel.getAttribute('data-page') + '?student=' + encodeURIComponent(sel.value);
    });
  }

  /* =================================================================
     NOTIFICATION CENTER  [v0.6]
     ================================================================= */
  var NOTICE_META = {
    lesson:        { label: 'Занятие',          icon: ICON.calendar },
    payment:       { label: 'Платёж',           icon: ICON.receipt  },
    homework:      { label: 'Домашнее задание', icon: ICON.hw       },
    certificate:   { label: 'Сертификат',       icon: ICON.cert     },
    achievement:   { label: 'Достижение',       icon: ICON.star     },
    event:         { label: 'Мероприятие',      icon: ICON.ticket   },
    comment:       { label: 'Комментарий',      icon: ICON.note     },
    subscription:  { label: 'Абонемент',        icon: ICON.card     },
    system:        { label: 'Система',          icon: ICON.bell     },
    /* v1.1 educational types */
    journal:       { label: 'Журнал занятий',   icon: ICON.book     },
    recalculation: { label: 'Перерасчёт',       icon: ICON.card     },
    rehearsal:     { label: 'Репетиция',        icon: ICON.calendar },
    ticket:        { label: 'Билет',            icon: ICON.ticket   },
    portfolio:     { label: 'Портфолио',        icon: ICON.folder   }
  };
  var notifRoot = $('#notifications-root');
  if (notifRoot) {
    var notifFilter = 'inbox';
    loadNotifications();
    function loadNotifications() {
      API.notifications.feed(notifFilter).then(function (list) {
        var tabs = '<div class="cab-tabs" data-notif-tabs>' +
          tab('inbox', 'Входящие') + tab('unread', 'Непрочитанные') + tab('archived', 'Архив') + '</div>';
        var actions = (notifFilter !== 'archived')
          ? '<div class="cab-toolbar"><div></div><button class="btn btn-outline btn-sm" data-notif-readall>Отметить все прочитанными</button></div>'
          : '';
        var body = list.length ? list.map(renderNotice).join('')
          : '<p class="cab-empty">' + (notifFilter === 'archived' ? 'Архив пуст.' : notifFilter === 'unread' ? 'Непрочитанных уведомлений нет.' : 'Уведомлений пока нет.') + '</p>';
        notifRoot.innerHTML = tabs + actions + '<div class="notif-list">' + body + '</div>';
        $all('[data-notif-tab]', notifRoot).forEach(function (b) {
          b.addEventListener('click', function () { notifFilter = b.getAttribute('data-notif-tab'); loadNotifications(); });
        });
        var readAll = $('[data-notif-readall]', notifRoot);
        if (readAll) readAll.addEventListener('click', function () {
          API.notifications.markAllRead().then(function () { toast('Все уведомления прочитаны'); loadNotifications(); refreshNavBadge(); });
        });
        $all('[data-notif-read]', notifRoot).forEach(function (b) {
          b.addEventListener('click', function () { API.notifications.markRead(b.getAttribute('data-notif-read')).then(function () { loadNotifications(); refreshNavBadge(); }); });
        });
        $all('[data-notif-arch]', notifRoot).forEach(function (b) {
          b.addEventListener('click', function () { API.notifications.archive(b.getAttribute('data-notif-arch')).then(function () { toast('В архиве'); loadNotifications(); refreshNavBadge(); }); });
        });
        $all('[data-notif-unarch]', notifRoot).forEach(function (b) {
          b.addEventListener('click', function () { API.notifications.unarchive(b.getAttribute('data-notif-unarch')).then(function () { loadNotifications(); }); });
        });
        $all('[data-notif-del]', notifRoot).forEach(function (b) {
          b.addEventListener('click', function () { API.notifications.remove(b.getAttribute('data-notif-del')).then(function () { loadNotifications(); refreshNavBadge(); }); });
        });
      });
      function tab(key, label) {
        return '<button class="cab-tab' + (notifFilter === key ? ' active' : '') + '" data-notif-tab="' + key + '">' + label + '</button>';
      }
    }
  }
  function renderNotice(n) {
    var meta = NOTICE_META[n.type] || NOTICE_META.system;
    var link = n.href ? '<a class="btn btn-outline btn-sm" href="' + n.href + '">Открыть</a>' : '';
    var act = n.archived
      ? '<button class="btn-icon" data-notif-unarch="' + n.id + '" title="Вернуть из архива">↩</button>' +
        '<button class="btn-icon danger" data-notif-del="' + n.id + '" title="Удалить">✕</button>'
      : (n.read ? '' : '<button class="btn-icon" data-notif-read="' + n.id + '" title="Прочитано">' + ICON.check + '</button>') +
        '<button class="btn-icon" data-notif-arch="' + n.id + '" title="В архив">' + ICON.folder + '</button>';
    return '<div class="notif-item' + (n.read ? '' : ' unread') + '">' +
      '<div class="notif-ic">' + meta.icon + '</div>' +
      '<div class="notif-body">' +
        '<div class="notif-top"><span class="notif-tag">' + meta.label + '</span>' +
          '<span class="notif-date">' + fmtDate(n.date) + '</span></div>' +
        '<strong>' + escapeHtml(n.title) + '</strong>' +
        '<p>' + escapeHtml(n.text) + '</p>' +
        (link ? '<div class="notif-actions-row">' + link + '</div>' : '') +
      '</div>' +
      '<div class="notif-actions">' + act + '</div>' +
    '</div>';
  }
  /* Sidebar unread badge on the Уведомления link. */
  function refreshNavBadge() {
    if (!API.auth.current()) return;
    API.notifications.unreadCount().then(function (n) {
      $all('.cab-nav a[href="notifications.html"]').forEach(function (a) {
        var b = a.querySelector('.cab-nav-badge');
        if (n > 0) {
          if (!b) { b = document.createElement('span'); b.className = 'cab-nav-badge'; a.appendChild(b); }
          b.textContent = n > 99 ? '99+' : n;
        } else if (b) { b.remove(); }
      });
    });
  }
  refreshNavBadge();

  /* =================================================================
     ACHIEVEMENTS PROFILE — "Профиль достижений"  [v0.6]
     ================================================================= */
  var achProfileRoot = $('#achievements-root');
  if (achProfileRoot) {
    resolveViewer().then(function (ctx) {
      if (!ctx.id) { achProfileRoot.innerHTML = '<p class="cab-empty">Нет данных для отображения.</p>'; return; }
      API.student.development(ctx.id).then(function (d) {
        achProfileRoot.innerHTML = viewerPicker(ctx, 'achievements.html', 'Ученик') + achievementsProfileHtml(d);
        bindMockDownloads(achProfileRoot);
        bindViewerPicker(achProfileRoot);
      });
    });
  }
  function achievementsProfileHtml(d) {
    var att = d.attendance;
    var completed = d.courses.filter(function (c) { return c.done; });
    var EVENT_ICONS = { concert: 1, stage: 1, exhibition: 1 };
    var participation = d.achievements.filter(function (a) { return EVENT_ICONS[a.icon]; });
    var achHtml = d.achievements.length
      ? '<div class="ach-grid">' + d.achievements.map(renderAchCard).join('') + '</div>'
      : '<p class="cab-empty">Достижений пока нет.</p>';
    var partHtml = participation.length
      ? '<div class="ach-grid">' + participation.map(renderAchCard).join('') + '</div>'
      : '<p class="cab-empty">Участие в мероприятиях пока не отмечено.</p>';
    var certsHtml = d.certificates.length
      ? '<div class="cert-grid">' + d.certificates.map(renderCertCard).join('') + '</div>'
      : '<p class="cab-empty">Сертификатов пока нет.</p>';
    var coursesHtml = completed.length
      ? '<ul class="cab-list">' + completed.map(function (c) { return '<li>' + ICON.check + ' ' + escapeHtml(c.title) + '</li>'; }).join('') + '</ul>'
      : '<p class="cab-empty">Завершённых курсов пока нет.</p>';
    return '' +
      '<div class="cab-grid">' +
        statCard(ICON.star, 'Достижения', d.achievements.length, '') +
        statCard(ICON.cert, 'Сертификаты', d.certificates.length, '') +
        statCard(ICON.book, 'Завершено курсов', completed.length, 'из ' + d.courses.length) +
        statCard(ICON.check2, 'Посещаемость', att.rate + '%', att.present + ' из ' + att.total + ' занятий') +
      '</div>' +
      '<h2 class="cab-section-title">Достижения</h2>' + achHtml +
      '<h2 class="cab-section-title">Участие в мероприятиях</h2>' + partHtml +
      '<h2 class="cab-section-title">Завершённые курсы</h2>' + coursesHtml +
      '<h2 class="cab-section-title">Сертификаты</h2>' + certsHtml;
  }
  function statCard(icon, label, value, sub) {
    return '<div class="cab-card"><div class="cab-card-label">' + icon + label + '</div>' +
      '<div class="cab-stat">' + value + '</div>' +
      (sub ? '<div class="cab-stat-sub">' + sub + '</div>' : '') + '</div>';
  }

  /* =================================================================
     PORTFOLIO — student / parent view  [v0.6]
     ================================================================= */
  var PF_KIND = {
    photo:       { label: 'Фото',       icon: ICON.image },
    video:       { label: 'Видео',      icon: ICON.play  },
    audio:       { label: 'Аудио',      icon: ICON.note  },
    document:    { label: 'Документ',   icon: ICON.file  },
    diploma:     { label: 'Диплом',     icon: ICON.cert  },
    certificate: { label: 'Сертификат', icon: ICON.cert  }
  };
  var pfRoot = $('#portfolio-root');
  if (pfRoot) {
    resolveViewer().then(function (ctx) {
      if (!ctx.id) { pfRoot.innerHTML = '<p class="cab-empty">Нет данных для отображения.</p>'; return; }
      API.portfolio.list(ctx.id).then(function (list) {
        if (!list.length) {
          pfRoot.innerHTML = viewerPicker(ctx, 'portfolio.html', 'Ученик') +
            '<p class="cab-empty">Портфолио пока пустое. Материалы добавляет преподаватель.</p>';
          bindViewerPicker(pfRoot);
          return;
        }
        /* collect unique kinds for filter tabs */
        var kinds = ['all'];
        list.forEach(function (p) { if (kinds.indexOf(p.kind) === -1) kinds.push(p.kind); });
        var pfFilter = 'all';
        function renderPfGrid() {
          var visible = pfFilter === 'all' ? list : list.filter(function (p) { return p.kind === pfFilter; });
          var grid = visible.length
            ? '<div class="pf-grid">' + visible.map(renderPortfolioItem).join('') + '</div>'
            : '<p class="cab-empty">Нет материалов этого типа.</p>';
          var tabs = '<div class="cab-tabs pf-filter-tabs">' +
            kinds.map(function (k) {
              var lbl = k === 'all' ? 'Все' : ((PF_KIND[k] || {}).label || k);
              return '<button class="cab-tab' + (pfFilter === k ? ' active' : '') + '" data-pf-filter="' + k + '">' + lbl + '</button>';
            }).join('') + '</div>';
          pfRoot.innerHTML = viewerPicker(ctx, 'portfolio.html', 'Ученик') + tabs + grid;
          bindViewerPicker(pfRoot);
          $all('[data-pf-filter]', pfRoot).forEach(function (b) {
            b.addEventListener('click', function () { pfFilter = b.getAttribute('data-pf-filter'); renderPfGrid(); });
          });
          $all('[data-pf-open]', pfRoot).forEach(function (b) {
            b.addEventListener('click', function () { toast('Просмотр материала доступен в полной версии'); });
          });
        }
        renderPfGrid();
      });
    });
  }
  function renderPortfolioItem(p) {
    var k = PF_KIND[p.kind] || PF_KIND.document;
    return '<div class="pf-card pf-' + p.kind + '">' +
      '<div class="pf-thumb">' + k.icon + '<span class="pf-kind">' + k.label + '</span></div>' +
      '<div class="pf-body"><strong>' + escapeHtml(p.title) + '</strong>' +
        (p.direction ? '<div class="pf-direction">' + escapeHtml(p.direction) + '</div>' : '') +
        (p.note ? '<p>' + escapeHtml(p.note) + '</p>' : '') +
        '<div class="pf-meta">' + escapeHtml(p.addedBy || '') + ' · ' + fmtDate(p.date) + '</div>' +
        '<button class="btn btn-outline btn-sm" data-pf-open>Открыть</button>' +
      '</div></div>';
  }

  /* =================================================================
     ACCOUNT SETTINGS  [v0.6]
     ================================================================= */
  var settingsRoot = $('#settings-root');
  if (settingsRoot) loadSettings();
  function loadSettings() {
    var me = API.auth.current();
    Promise.all([API.auth.prefs(), API.integrations.channels(), API.telegram.checkPendingLink()]).then(function (res) {
      var prefs = res[0], channels = res[1], tgStatus = res[2];
      var tg = me.telegram || {};
      var prefRows = [
        ['lessons', 'Занятия и расписание'], ['homework', 'Домашние задания'],
        ['comments', 'Комментарии преподавателя'], ['subscription', 'Окончание абонемента'],
        ['events', 'Новые курсы и мероприятия']
      ].map(function (p) {
        return '<label class="check-row"><input type="checkbox" data-pref="' + p[0] + '"' + (prefs[p[0]] !== false ? ' checked' : '') + '><span>' + p[1] + '</span></label>';
      }).join('');

      var tgLinked = tgStatus.linked;
      var tgPending = !tgLinked && tgStatus.pending;
      var tgStatusText = tgLinked
        ? ('Привязан' + (tgStatus.username ? ' · @' + escapeHtml(tgStatus.username) : ''))
        : 'Не привязан';
      var tgBlock = tgLinked
        ? '<button class="btn btn-outline btn-sm" data-tg-unlink>Отвязать</button>'
        : (tgPending
          ? '<button class="btn btn-outline btn-sm" data-tg-cancel-link>Отменить</button>'
          : '<button class="btn btn-primary btn-sm" data-tg-link>Привязать Telegram</button>');
      var tgCodeHtml = tgPending
        ? '<div class="tg-link-code" data-tg-code-block>' +
            '<p style="margin:8px 0 4px">Отправьте этот код боту ' +
              '<a href="https://t.me/' + escapeHtml(tgStatus.bot || 'shpigotskiy_art_bot') + '" target="_blank">@' + escapeHtml(tgStatus.bot || 'shpigotskiy_art_bot') + '</a>:</p>' +
            '<div class="tg-code-display" data-tg-code>' + escapeHtml(tgPending.code) + '</div>' +
            '<p class="cab-muted" style="font-size:.8rem;margin:4px 0 0">Код действителен 15 минут. Ожидаем подтверждения…</p>' +
            '<div class="tg-link-spinner" data-tg-spinner>⏳</div>' +
          '</div>'
        : '';

      settingsRoot.innerHTML =
        '<div class="settings-grid">' +
          '<section class="cab-card settings-card"><h2>Профиль</h2>' +
            '<form data-form-profile>' +
              field('Имя', input('name', me.name)) +
              field('Email', input('email', me.email, 'email')) +
              field('Телефон', input('phone', me.phone)) +
              '<div class="form-error" data-err-profile></div>' +
              '<button class="btn btn-primary btn-sm" type="submit">Сохранить профиль</button>' +
            '</form></section>' +

          '<section class="cab-card settings-card"><h2>Смена пароля</h2>' +
            '<form data-form-pass>' +
              field('Текущий пароль', input('current', '', 'password')) +
              field('Новый пароль', input('next', '', 'password')) +
              field('Повторите пароль', input('confirm', '', 'password')) +
              '<div class="form-error" data-err-pass></div>' +
              '<button class="btn btn-primary btn-sm" type="submit">Изменить пароль</button>' +
            '</form></section>' +

          '<section class="cab-card settings-card"><h2>Уведомления</h2>' +
            '<p class="cab-muted">Выберите, о чём присылать уведомления.</p>' +
            '<div class="check-list">' + prefRows + '</div>' +
            '<button class="btn btn-primary btn-sm" data-save-prefs>Сохранить настройки</button>' +
          '</section>' +

          '<section class="cab-card settings-card"><h2>Привязанные аккаунты</h2>' +
            '<div class="linked-row">' +
              '<div class="linked-info">' + ICON.bell + '<div><strong>Telegram</strong>' +
                '<span class="cab-muted" data-tg-status>' + tgStatusText + '</span></div></div>' +
              tgBlock +
            '</div>' +
            tgCodeHtml +
            '<p class="cab-muted settings-channels" style="margin-top:8px">Каналы доставки: ' + channelStatus(channels) + '</p>' +
          '</section>' +
        '</div>';

      // profile form
      $('[data-form-profile]', settingsRoot).addEventListener('submit', function (e) {
        e.preventDefault();
        var err = $('[data-err-profile]', settingsRoot); hide(err);
        var data = collectForm(this);
        API.auth.updateProfile(data).then(function () {
          toast('Профиль сохранён'); renderSidebar(); bindSignout();
        }).catch(function (ex) { setFormError(err, ex.message); });
      });
      // password form
      $('[data-form-pass]', settingsRoot).addEventListener('submit', function (e) {
        e.preventDefault();
        var err = $('[data-err-pass]', settingsRoot); hide(err);
        var d = collectForm(this);
        if (d.next !== d.confirm) { setFormError(err, 'Пароли не совпадают'); return; }
        API.auth.changePassword(d.current, d.next).then(function () {
          toast('Пароль изменён'); $('[data-form-pass]', settingsRoot).reset();
        }).catch(function (ex) { setFormError(err, ex.message); });
      });
      // prefs
      $('[data-save-prefs]', settingsRoot).addEventListener('click', function () {
        var p = {};
        $all('[data-pref]', settingsRoot).forEach(function (c) { p[c.getAttribute('data-pref')] = c.checked; });
        API.auth.setPrefs(p).then(function () { toast('Настройки уведомлений сохранены'); });
      });
      // telegram link/unlink
      var linkBtn = $('[data-tg-link]', settingsRoot);
      if (linkBtn) linkBtn.addEventListener('click', startTelegramLink);
      var unlinkBtn = $('[data-tg-unlink]', settingsRoot);
      if (unlinkBtn) unlinkBtn.addEventListener('click', function () {
        API.auth.unlinkTelegram().then(function () { toast('Telegram отвязан'); loadSettings(); });
      });
      // if a link code is pending, re-attach the polling block
      var codeBlock = $('[data-tg-code-block]', settingsRoot);
      if (codeBlock) attachLinkPolling(codeBlock);
    });
  }
  function channelStatus(ch) {
    var names = { telegram: 'Telegram', push: 'Push', email: 'Email', sms: 'SMS' };
    return Object.keys(names).map(function (k) {
      return names[k] + ' — ' + (ch[k] ? 'вкл.' : 'скоро');
    }).join(' · ');
  }

  /* Generate a TG-XXXXXX code and show the instruction block. */
  function startTelegramLink() {
    var btn = $('[data-tg-link]', settingsRoot);
    if (btn) { btn.disabled = true; btn.textContent = 'Генерируем код…'; }
    API.telegram.generateLinkCode().then(function (res) {
      var section = btn ? btn.closest('section') : null;
      if (!section) { loadSettings(); return; }
      var existingBlock = $('[data-tg-code-block]', section);
      if (existingBlock) existingBlock.remove();
      var block = document.createElement('div');
      block.className = 'tg-link-code'; block.setAttribute('data-tg-code-block', '');
      block.innerHTML =
        '<p style="margin:8px 0 4px">Отправьте этот код боту ' +
          '<a href="https://t.me/' + escapeHtml(res.bot || 'shpigotskiy_art_bot') + '" target="_blank">@' + escapeHtml(res.bot || 'shpigotskiy_art_bot') + '</a>:</p>' +
        '<div class="tg-code-display" data-tg-code>' + escapeHtml(res.code) + '</div>' +
        '<p class="cab-muted" style="font-size:.8rem;margin:4px 0 0">Код действителен 15 минут. Ожидаем подтверждения…</p>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<span class="cab-muted" data-tg-spinner>⏳ Ожидаем…</span>' +
          '<button class="btn btn-outline btn-sm" data-tg-cancel-link>Отменить</button>' +
        '</div>';
      var linkedRow = $('[data-tg-link]', section) ? $('[data-tg-link]', section).closest('.linked-row') : null;
      if (linkedRow) { linkedRow.parentNode.insertBefore(block, linkedRow.nextSibling); }
      else { section.appendChild(block); }
      if (btn) btn.style.display = 'none';
      attachLinkPolling(block);
    }).catch(function (ex) {
      toast('Ошибка: ' + ex.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Привязать Telegram'; }
    });
  }

  /* Poll every 3 s until the bot confirms the code or the code expires. */
  function attachLinkPolling(block) {
    var cancelBtn = $('[data-tg-cancel-link]', settingsRoot || document);
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      API.telegram.cancelPendingLink().then(function () { loadSettings(); });
    });
    var timer = setInterval(function () {
      if (!document.body.contains(block)) { clearInterval(timer); return; }
      API.telegram.checkPendingLink().then(function (s) {
        if (s.linked) {
          clearInterval(timer);
          toast('Telegram привязан' + (s.username ? ': @' + s.username : '') + '!');
          loadSettings();
        } else if (!s.pending) {
          clearInterval(timer);
          toast('Код истёк. Попробуйте снова.');
          loadSettings();
        }
      }).catch(function () { clearInterval(timer); });
    }, 3000);
  }

  function collectForm(form) {
    var data = {};
    $all('input, select, textarea', form).forEach(function (el) { if (el.name) data[el.name] = el.value; });
    return data;
  }
  function bindSignout() {
    $all('[data-signout]').forEach(function (btn) {
      btn.addEventListener('click', function () { confirmSignOut(); });
    });
  }

  /* =================================================================
     ADMIN — events CRUD  [v0.6]
     ================================================================= */
  var EVENT_TYPE_OPTS = [
    { value: 'concert', label: 'Концерт' },
    { value: 'performance', label: 'Спектакль' },
    { value: 'exhibition', label: 'Выставка' },
    { value: 'masterclass', label: 'Мастер-класс' }
  ];
  function eventTypeLabel(t) {
    var o = EVENT_TYPE_OPTS.filter(function (x) { return x.value === t; })[0];
    return o ? o.label : t;
  }
  var adminEvents = $('#admin-events-root');
  if (adminEvents) {
    var addEventBtn = $('[data-add-event]');
    if (addEventBtn) addEventBtn.addEventListener('click', function () { editEvent(null); });
    loadAdminEvents();
  }
  function loadAdminEvents() {
    API.events.all().then(function (list) {
      if (!list.length) { adminEvents.innerHTML = '<p class="cab-empty">Мероприятий пока нет.</p>'; return; }
      var rows = list.map(function (e) {
        return '<tr>' +
          '<td data-th="Тип">' + escapeHtml(eventTypeLabel(e.type)) + '</td>' +
          '<td data-th="Название"><strong>' + escapeHtml(e.title) + '</strong></td>' +
          '<td data-th="Дата">' + fmtDate(e.date) + (e.time ? ' · ' + escapeHtml(e.time) : '') + '</td>' +
          '<td data-th="Место">' + escapeHtml(e.place || '—') + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + e.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + e.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminEvents.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Тип</th><th>Название</th><th>Дата</th><th>Место</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminEvents).forEach(function (b) { b.addEventListener('click', function () { editEvent(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminEvents).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить мероприятие?')) API.events.remove(b.getAttribute('data-del')).then(function () { toast('Удалено'); loadAdminEvents(); });
        });
      });
    });
  }
  function editEvent(id) {
    (id ? API.events.all() : Promise.resolve([])).then(function (list) {
      var e = id ? (list.filter(function (x) { return x.id === id; })[0] || {}) : {};
      var html = '<form data-form>' +
        row(field('Тип', selectCtrl('type', EVENT_TYPE_OPTS, e.type || 'concert')),
            field('Дата', input('date', e.date, 'date'))) +
        field('Название', input('title', e.title)) +
        row(field('Время', input('time', e.time)), field('Место', input('place', e.place))) +
        field('Описание', textarea('description', e.description)) +
        '<h4 style="margin:16px 0 8px;font-size:.9rem;color:var(--text-muted)">Билеты</h4>' +
        row(field('Цена билета (0 = бесплатно)', input('ticketPrice', e.ticketPrice || 0, 'number')),
            field('Макс. мест (0 = без ограничений)', input('maxSeats', e.maxSeats || 0, 'number'))) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать мероприятие' : 'Новое мероприятие', html, true);
      bindCrudForm(m, function (data) {
        data.ticketPrice = parseFloat(data.ticketPrice) || 0;
        data.maxSeats = parseInt(data.maxSeats) || 0;
        return id ? API.events.update(id, data) : API.events.create(data);
      }, function () { toast(id ? 'Сохранено' : 'Мероприятие создано'); loadAdminEvents(); });
    });
  }

  /* =================================================================
     ADMIN — portfolio CRUD  [v0.6]
     ================================================================= */
  var PF_KIND_OPTS = [
    { value: 'photo', label: 'Фото' }, { value: 'video', label: 'Видео' },
    { value: 'audio', label: 'Аудио' }, { value: 'document', label: 'Документ' },
    { value: 'diploma', label: 'Диплом' }, { value: 'certificate', label: 'Сертификат' }
  ];
  var adminPf = $('#admin-portfolio-root');
  if (adminPf) {
    var addPfBtn = $('[data-add-pf]');
    if (addPfBtn) addPfBtn.addEventListener('click', function () { editPortfolio(null); });
    loadAdminPortfolio();
  }
  function loadAdminPortfolio() {
    API.portfolio.all().then(function (list) {
      if (!list.length) { adminPf.innerHTML = '<p class="cab-empty">Материалов пока нет.</p>'; return; }
      var rows = list.map(function (p) {
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(p.studentName) + '</td>' +
          '<td data-th="Тип">' + escapeHtml((PF_KIND[p.kind] || {}).label || p.kind) + '</td>' +
          '<td data-th="Материал"><strong>' + escapeHtml(p.title) + '</strong></td>' +
          '<td data-th="Дата">' + fmtDate(p.date) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + p.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + p.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminPf.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Ученик</th><th>Тип</th><th>Материал</th><th>Дата</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminPf).forEach(function (b) { b.addEventListener('click', function () { editPortfolio(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminPf).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить материал?')) API.portfolio.remove(b.getAttribute('data-del')).then(function () { toast('Удалено'); loadAdminPortfolio(); });
        });
      });
    });
  }
  function editPortfolio(id) {
    Promise.all([API.admin.studentOptions(), id ? API.portfolio.all() : Promise.resolve([])]).then(function (res) {
      var students = res[0].map(function (s) { return { value: s.id, label: s.name }; });
      var p = id ? (res[1].filter(function (x) { return x.id === id; })[0] || {}) : {};
      var html = '<form data-form>' +
        row(field('Ученик', selectCtrl('studentId', students, p.studentId)),
            field('Тип материала', selectCtrl('kind', PF_KIND_OPTS, p.kind || 'photo'))) +
        row(field('Направление', input('direction', p.direction || '')), field('Дата', input('date', p.date, 'date'))) +
        field('Название', input('title', p.title)) +
        field('Комментарий', textarea('note', p.note)) +
        field('Кто добавил', input('addedBy', p.addedBy)) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать материал' : 'Новый материал портфолио', html);
      bindCrudForm(m, function (data) { return id ? API.portfolio.update(id, data) : API.portfolio.create(data); },
        function () { toast(id ? 'Сохранено' : 'Материал добавлен'); loadAdminPortfolio(); });
    });
  }

  /* =================================================================
     ADMIN — CRM Лиды  [v0.9]
     ================================================================= */
  var LEAD_STATUS_LABELS = {
    new: 'Новый', processing: 'В работе', no_answer: 'Не берёт трубку',
    trial_scheduled: 'Записан на пробное', trial_done: 'Пробное проведено',
    purchased: 'Купил', active: 'Активный ученик', lost: 'Потерян'
  };
  var LEAD_SOURCE_LABELS = { trial: 'Пробное', course: 'Курс', callback: 'Перезвонить', event: 'Мероприятие', store: 'Магазин' };
  var adminLeads = $('#admin-leads-root');
  if (adminLeads) {
    var addLeadBtn = $('[data-add-lead]');
    if (addLeadBtn) addLeadBtn.addEventListener('click', function () { editLead(null); });
    var leadsFilter = $('[data-leads-filter]');
    if (leadsFilter) leadsFilter.addEventListener('change', loadAdminLeads);
    loadAdminLeads();
  }
  function loadAdminLeads() {
    if (!adminLeads) return;
    var f = leadsFilter ? leadsFilter.value : '';
    API.leads.list(f ? { status: f } : {}).then(function (list) {
      if (!list.length) { adminLeads.innerHTML = '<p class="cab-empty">Лидов нет.</p>'; return; }
      var statusBadgeCls = { new: 'badge-blue', processing: 'badge-gold', no_answer: 'badge-gray',
        trial_scheduled: 'badge-blue', trial_done: 'badge-gold', purchased: 'badge-green', active: 'badge-green', lost: 'badge-red' };
      var rows = list.map(function (l) {
        var cls = statusBadgeCls[l.status] || 'badge-gray';
        return '<tr>' +
          '<td data-th="Имя"><strong>' + escapeHtml(l.name) + '</strong></td>' +
          '<td data-th="Телефон">' + escapeHtml(l.phone) + '</td>' +
          '<td data-th="Источник">' + escapeHtml(LEAD_SOURCE_LABELS[l.source] || l.source) + '</td>' +
          '<td data-th="Статус"><span class="badge ' + cls + '">' + escapeHtml(LEAD_STATUS_LABELS[l.status] || l.status) + '</span></td>' +
          '<td data-th="Дата">' + fmtDate(l.createdAt) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-lead-card="' + l.id + '" title="Карточка">≡</button>' +
            '<button class="btn-icon" data-edit-lead="' + l.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del-lead="' + l.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminLeads.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Имя</th><th>Телефон</th><th>Источник</th><th>Статус</th><th>Дата</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-lead-card]', adminLeads).forEach(function (b) {
        b.addEventListener('click', function () { openLeadCard(b.getAttribute('data-lead-card')); });
      });
      $all('[data-edit-lead]', adminLeads).forEach(function (b) {
        b.addEventListener('click', function () { editLead(b.getAttribute('data-edit-lead')); });
      });
      $all('[data-del-lead]', adminLeads).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить лид?')) API.leads.remove(b.getAttribute('data-del-lead')).then(function () { toast('Удалено'); loadAdminLeads(); });
        });
      });
    });
  }
  function openLeadCard(id) {
    API.leads.get(id).then(function (l) {
      var comments = (l.comments || []).map(function (c) {
        return '<div class="cab-comment"><span class="cab-comment-author">' + escapeHtml(c.author) + '</span> <span class="cab-comment-date">' + fmtDate(c.date) + '</span><p>' + escapeHtml(c.text) + '</p></div>';
      }).join('');
      var statusOpts = Object.keys(LEAD_STATUS_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (l.status === k ? ' selected' : '') + '>' + escapeHtml(LEAD_STATUS_LABELS[k]) + '</option>';
      }).join('');
      var html = '<div class="cab-lead-card">' +
        '<p><strong>Телефон:</strong> ' + escapeHtml(l.phone) + '</p>' +
        (l.email ? '<p><strong>Email:</strong> ' + escapeHtml(l.email) + '</p>' : '') +
        '<p><strong>Источник:</strong> ' + escapeHtml(LEAD_SOURCE_LABELS[l.source] || l.source) + '</p>' +
        '<p><strong>Создан:</strong> ' + fmtDate(l.createdAt) + '</p>' +
        '<div class="cab-form-row" style="margin:12px 0"><label class="cab-label">Статус</label>' +
          '<select id="lead-status-sel" class="cab-input">' + statusOpts + '</select></div>' +
        '<div class="cab-comments">' + (comments || '<p class="cab-empty">Комментариев нет.</p>') + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
          '<input id="lead-comment-inp" class="cab-input" style="flex:1" placeholder="Добавить комментарий…">' +
          '<button class="btn-secondary" id="lead-comment-btn">Добавить</button>' +
        '</div>' +
        '<div style="margin-top:12px"><button class="btn-secondary" data-cancel>Закрыть</button></div>' +
        '</div>';
      var m = openModal('Лид: ' + escapeHtml(l.name), html);
      var sel = m.body.querySelector('#lead-status-sel');
      sel.addEventListener('change', function () {
        API.leads.setStatus(id, sel.value).then(function () { toast('Статус обновлён'); loadAdminLeads(); });
      });
      var inp = m.body.querySelector('#lead-comment-inp');
      m.body.querySelector('#lead-comment-btn').addEventListener('click', function () {
        if (!inp.value.trim()) return;
        API.leads.addComment(id, inp.value.trim()).then(function () { toast('Комментарий добавлен'); inp.value = ''; m.close(); openLeadCard(id); });
      });
      m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    });
  }
  function editLead(id) {
    var sourceOpts = [
      { value: 'trial', label: 'Пробное' }, { value: 'callback', label: 'Перезвонить' },
      { value: 'course', label: 'Курс' }, { value: 'event', label: 'Мероприятие' }, { value: 'store', label: 'Магазин' }
    ];
    var statusOpts = Object.keys(LEAD_STATUS_LABELS).map(function (k) { return { value: k, label: LEAD_STATUS_LABELS[k] }; });
    (id ? API.leads.get(id) : Promise.resolve({})).then(function (l) {
      var html = '<form data-form>' +
        row(field('Имя *', input('name', l.name)), field('Телефон *', input('phone', l.phone))) +
        row(field('Email', input('email', l.email, 'email')), field('Направление', input('direction', l.direction))) +
        row(field('Источник', selectCtrl('source', sourceOpts, l.source || 'callback')),
            field('Статус', selectCtrl('status', statusOpts, l.status || 'new'))) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать лид' : 'Новый лид', html);
      bindCrudForm(m, function (data) { return id ? API.leads.update(id, data) : API.leads.create(data); },
        function () { toast(id ? 'Сохранено' : 'Лид создан'); loadAdminLeads(); });
    });
  }

  /* =================================================================
     ADMIN — Пробные занятия  [v0.9]
     ================================================================= */
  var adminTrials = $('#admin-trials-root');
  if (adminTrials) {
    var addTrialBtn = $('[data-add-trial]');
    if (addTrialBtn) addTrialBtn.addEventListener('click', function () { editTrial(null); });
    loadAdminTrials();
  }
  function loadAdminTrials() {
    if (!adminTrials) return;
    API.trials.list().then(function (list) {
      if (!list.length) { adminTrials.innerHTML = '<p class="cab-empty">Пробных занятий пока нет.</p>'; return; }
      var statusBadge = { scheduled: 'badge-blue', done: 'badge-green', cancelled: 'badge-red', no_show: 'badge-gray' };
      var statusLabel = { scheduled: 'Запланировано', done: 'Проведено', cancelled: 'Отменено', no_show: 'Не пришёл' };
      var rows = list.map(function (t) {
        return '<tr>' +
          '<td data-th="Имя"><strong>' + escapeHtml(t.name) + '</strong></td>' +
          '<td data-th="Телефон">' + escapeHtml(t.phone) + '</td>' +
          '<td data-th="Направление">' + escapeHtml(t.direction) + '</td>' +
          '<td data-th="Преподаватель">' + escapeHtml(t.teacher) + '</td>' +
          '<td data-th="Дата/Время">' + fmtDate(t.date) + (t.time ? ' ' + escapeHtml(t.time) : '') + '</td>' +
          '<td data-th="Статус"><span class="badge ' + (statusBadge[t.status] || 'badge-gray') + '">' + escapeHtml(statusLabel[t.status] || t.status) + '</span></td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            (t.status === 'scheduled' ? '<button class="btn-icon" data-trial-result="' + t.id + '" title="Записать результат">✓</button>' : '') +
            '<button class="btn-icon" data-edit-trial="' + t.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del-trial="' + t.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminTrials.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Имя</th><th>Телефон</th><th>Направление</th><th>Преподаватель</th><th>Дата/Время</th><th>Статус</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-trial-result]', adminTrials).forEach(function (b) {
        b.addEventListener('click', function () { recordTrialResult(b.getAttribute('data-trial-result')); });
      });
      $all('[data-edit-trial]', adminTrials).forEach(function (b) {
        b.addEventListener('click', function () { editTrial(b.getAttribute('data-edit-trial')); });
      });
      $all('[data-del-trial]', adminTrials).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить пробное занятие?')) API.trials.remove(b.getAttribute('data-del-trial')).then(function () { toast('Удалено'); loadAdminTrials(); });
        });
      });
    });
  }
  function recordTrialResult(id) {
    var resultOpts = [
      { value: 'converted', label: 'Записался' },
      { value: 'not_converted', label: 'Не записался' },
      { value: 'reschedule', label: 'Перенести' }
    ];
    var html = '<form data-form>' +
      field('Результат', selectCtrl('result', resultOpts, 'converted')) +
      field('Комментарий преподавателя', textarea('teacherComment', '')) +
      field('Рекомендация', input('recommendation', '')) +
      formActions('Сохранить результат') + '</form>';
    var m = openModal('Результат пробного занятия', html);
    bindCrudForm(m, function (data) { return API.trials.recordResult(id, data.result, data.teacherComment, data.recommendation); },
      function () { toast('Результат сохранён'); loadAdminTrials(); });
  }
  function editTrial(id) {
    (id ? API.trials.get(id) : Promise.resolve({})).then(function (t) {
      var html = '<form data-form>' +
        row(field('Имя *', input('name', t.name)), field('Телефон', input('phone', t.phone))) +
        row(field('Дата *', input('date', t.date, 'date')), field('Время', input('time', t.time))) +
        row(field('Преподаватель', input('teacher', t.teacher)), field('Направление', input('direction', t.direction))) +
        field('Комментарий', textarea('adminComment', t.adminComment)) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать занятие' : 'Новое пробное занятие', html);
      bindCrudForm(m, function (data) { return id ? API.trials.update(id, data) : API.trials.create(data); },
        function () { toast(id ? 'Сохранено' : 'Занятие создано'); loadAdminTrials(); });
    });
  }

  /* =================================================================
     ADMIN — Преподаватели CRM  [v0.9]
     ================================================================= */
  var adminTeachers = $('#admin-teachers-root');
  if (adminTeachers) { loadAdminTeachers(); }
  function loadAdminTeachers() {
    if (!adminTeachers) return;
    var users = (window.API && API.auth) ? [] : [];
    Promise.all([
      API.admin.list(),
      Promise.resolve(read_users_safe())
    ]).then(function () {
      var academics = JSON.parse(localStorage.getItem('sas_academics') || '{}');
      var allUsers = JSON.parse(localStorage.getItem('sas_users') || '[]');
      var teachers = allUsers.filter(function (u) { return u.role === 'teacher'; });
      if (!teachers.length) { adminTeachers.innerHTML = '<p class="cab-empty">Преподавателей пока нет.</p>'; return; }
      var rows = teachers.map(function (t) {
        var studentCount = Object.keys(academics).filter(function (sid) {
          return academics[sid] && academics[sid].teacher === t.name;
        }).length;
        return '<tr>' +
          '<td data-th="Имя"><strong>' + escapeHtml(t.name) + '</strong></td>' +
          '<td data-th="Email">' + escapeHtml(t.email || '—') + '</td>' +
          '<td data-th="Телефон">' + escapeHtml(t.phone || '—') + '</td>' +
          '<td data-th="Учеников">' + studentCount + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-teacher-card="' + t.id + '" title="Профиль">≡</button>' +
          '</div></td></tr>';
      }).join('');
      adminTeachers.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Имя</th><th>Email</th><th>Телефон</th><th>Учеников</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-teacher-card]', adminTeachers).forEach(function (b) {
        b.addEventListener('click', function () { openTeacherCard(b.getAttribute('data-teacher-card')); });
      });
    });
  }
  function read_users_safe() {
    try { return JSON.parse(localStorage.getItem('sas_users') || '[]'); } catch (e) { return []; }
  }
  function openTeacherCard(teacherId) {
    var allUsers = read_users_safe();
    var t = allUsers.filter(function (u) { return u.id === teacherId; })[0];
    if (!t) return;
    var academics = JSON.parse(localStorage.getItem('sas_academics') || '{}');
    var students = allUsers.filter(function (u) {
      return u.role === 'student' && academics[u.id] && academics[u.id].teacher === t.name;
    });
    var slist = students.map(function (s) {
      var ac = academics[s.id] || {};
      return '<li>' + escapeHtml(s.name) + ' · ' + escapeHtml(ac.direction || '—') + '</li>';
    }).join('') || '<li>Нет назначенных учеников</li>';
    var html = '<div class="cab-teacher-card">' +
      '<p><strong>Email:</strong> ' + escapeHtml(t.email || '—') + '</p>' +
      '<p><strong>Телефон:</strong> ' + escapeHtml(t.phone || '—') + '</p>' +
      '<p><strong>Роль:</strong> Преподаватель</p>' +
      '<h4 style="margin:16px 0 8px">Ученики (' + students.length + ')</h4><ul style="padding-left:20px">' + slist + '</ul>' +
      '<div style="margin-top:16px"><button class="btn-secondary" data-cancel>Закрыть</button></div>' +
      '</div>';
    var m = openModal('Профиль: ' + escapeHtml(t.name), html);
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
  }

  /* =================================================================
     ADMIN — Воронка продаж  [v0.9]
     ================================================================= */
  var adminFunnel = $('#admin-funnel-root');
  if (adminFunnel) { loadAdminFunnel(); }
  function loadAdminFunnel() {
    if (!adminFunnel) return;
    API.analytics.funnel().then(function (data) {
      var stagesHtml = data.stages.map(function (s, i) {
        var width = Math.max(20, s.rate || 0);
        return '<div class="funnel-stage" style="width:' + width + '%;min-width:180px">' +
          '<div class="funnel-label">' + escapeHtml(s.label) + '</div>' +
          '<div class="funnel-count">' + s.count + ' чел.</div>' +
          (i > 0 ? '<div class="funnel-rate">' + (s.rate || 0) + '%</div>' : '') +
          '</div>';
      }).join('<div class="funnel-arrow">▼</div>');
      var t = data.trials;
      adminFunnel.innerHTML =
        '<div class="funnel-wrap">' + stagesHtml + '</div>' +
        '<div class="cab-stats-row" style="margin-top:24px">' +
          stat('Пробных запланировано', t.scheduled) +
          stat('Пробных проведено', t.done) +
          stat('Конвертировано', t.converted) +
          stat('Конверсия пробного', t.conversionRate + '%') +
        '</div>';
    });
    function stat(label, val) {
      return '<div class="cab-stat-card"><div class="cab-stat-val">' + val + '</div><div class="cab-stat-label">' + escapeHtml(label) + '</div></div>';
    }
  }

  /* =================================================================
     ADMIN — Финансовая аналитика  [v0.9]
     ================================================================= */
  var adminAnalytics = $('#admin-analytics-root');
  if (adminAnalytics) { loadAdminAnalytics(); }
  function loadAdminAnalytics() {
    if (!adminAnalytics) return;
    Promise.all([
      API.analytics.revenue('month', 6),
      API.analytics.byCategory(),
      API.analytics.unpaid()
    ]).then(function (res) {
      var revData = res[0], cats = res[1], unpaid = res[2];
      var maxRev = Math.max.apply(null, revData.map(function (r) { return r.amount; })) || 1;
      var bars = revData.map(function (r) {
        var h = Math.round(r.amount / maxRev * 120);
        return '<div class="ana-bar-col">' +
          '<div class="ana-bar" style="height:' + h + 'px" title="' + fmtMoney(r.amount) + '"></div>' +
          '<div class="ana-bar-label">' + escapeHtml(r.label) + '</div>' +
          '</div>';
      }).join('');
      var catRows = [
        { k: 'subscriptions', label: 'Абонементы' },
        { k: 'courses', label: 'Курсы' },
        { k: 'store', label: 'Магазин' },
        { k: 'other', label: 'Прочее' }
      ].map(function (c) {
        var pct = cats.total > 0 ? Math.round(cats.categories[c.k] / cats.total * 100) : 0;
        return '<tr><td>' + escapeHtml(c.label) + '</td><td>' + fmtMoney(cats.categories[c.k]) + '</td>' +
          '<td><div style="background:#2a1a1a;border-radius:4px;height:10px"><div style="background:var(--accent);border-radius:4px;height:10px;width:' + pct + '%"></div></div></td>' +
          '<td>' + pct + '%</td></tr>';
      }).join('');
      adminAnalytics.innerHTML =
        '<h3 style="margin-bottom:16px">Выручка по месяцам</h3>' +
        '<div class="ana-bar-chart">' + bars + '</div>' +
        '<h3 style="margin:24px 0 12px">Выручка по категориям</h3>' +
        '<div class="cab-table-wrap"><table class="cab-table"><thead><tr><th>Категория</th><th>Сумма</th><th>Доля</th><th>%</th></tr></thead><tbody>' + catRows + '</tbody></table></div>' +
        '<h3 style="margin:24px 0 12px">Задолженности</h3>' +
        '<div class="cab-stats-row">' +
          '<div class="cab-stat-card"><div class="cab-stat-val">' + unpaid.count + '</div><div class="cab-stat-label">Неоплаченных счетов</div></div>' +
          '<div class="cab-stat-card"><div class="cab-stat-val">' + fmtMoney(unpaid.total) + '</div><div class="cab-stat-label">Сумма долга</div></div>' +
        '</div>';
    });
  }

  /* =================================================================
     ADMIN — Рассылки  [v0.9]
     ================================================================= */
  var adminBroadcast = $('#admin-broadcast-root');
  if (adminBroadcast) { loadBroadcastHistory(); loadBroadcastTemplates(); }
  function loadBroadcastHistory() {
    var histRoot = $('[data-broadcast-history]');
    if (!histRoot) return;
    API.broadcast.history().then(function (list) {
      if (!list.length) { histRoot.innerHTML = '<p class="cab-empty">Рассылок пока не было.</p>'; return; }
      var rows = list.map(function (b) {
        return '<tr>' +
          '<td data-th="Тема"><strong>' + escapeHtml(b.subject) + '</strong></td>' +
          '<td data-th="Получатели">' + escapeHtml(b.recipients) + '</td>' +
          '<td data-th="Каналы">' + (b.channels || []).join(', ') + '</td>' +
          '<td data-th="Отправлено">' + fmtDate(b.sentAt) + '</td>' +
          '<td data-th="Кол-во">' + (b.recipientCount || 0) + '</td>' +
          '</tr>';
      }).join('');
      histRoot.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Тема</th><th>Получатели</th><th>Каналы</th><th>Отправлено</th><th>Кол-во</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    });
  }
  function loadBroadcastTemplates() {
    var tplRoot = $('[data-broadcast-templates]');
    if (!tplRoot) return;
    API.broadcast.templates().then(function (list) {
      tplRoot.innerHTML = list.map(function (t) {
        return '<div class="cab-card" style="margin-bottom:8px;cursor:pointer" data-tpl-id="' + t.id + '">' +
          '<strong>' + escapeHtml(t.name) + '</strong><br><small style="color:var(--text-muted)">' + escapeHtml(t.body.slice(0, 80)) + '…</small></div>';
      }).join('');
      $all('[data-tpl-id]', tplRoot).forEach(function (el) {
        el.addEventListener('click', function () { openBroadcastForm(el.getAttribute('data-tpl-id')); });
      });
    });
  }
  function openBroadcastForm(tplId) {
    API.broadcast.templates().then(function (tmpls) {
      var tpl = tplId ? (tmpls.filter(function (t) { return t.id === tplId; })[0] || {}) : {};
      var recipOpts = [
        { value: 'all', label: 'Все' }, { value: 'student', label: 'Ученики' },
        { value: 'parent', label: 'Родители' }, { value: 'teacher', label: 'Преподаватели' }
      ];
      var html = '<form data-form>' +
        field('Тема', input('subject', tpl.name || '')) +
        field('Текст', textarea('body', tpl.body || '')) +
        row(field('Получатели', selectCtrl('recipients', recipOpts, 'all')),
            field('Каналы (через запятую)', input('channels', 'in_app'))) +
        '<input type="hidden" name="template" value="' + escapeHtml(tplId || 'custom') + '">' +
        formActions('Отправить') + '</form>';
      var m = openModal('Новая рассылка', html);
      bindCrudForm(m, function (data) {
        data.channels = data.channels ? data.channels.split(',').map(function (c) { return c.trim(); }) : ['in_app'];
        return API.broadcast.send(data);
      }, function () { toast('Рассылка отправлена'); loadBroadcastHistory(); });
    });
  }
  var sendBroadcastBtn = $('[data-send-broadcast]');
  if (sendBroadcastBtn) sendBroadcastBtn.addEventListener('click', function () { openBroadcastForm(null); });

  /* =================================================================
     ADMIN — Карта развития  [v0.9]
     ================================================================= */
  var adminSkillmap = $('#admin-skillmap-root');
  if (adminSkillmap) { loadAdminSkillmap(); }
  function loadAdminSkillmap() {
    if (!adminSkillmap) return;
    var allUsers = read_users_safe();
    var students = allUsers.filter(function (u) { return u.role === 'student'; });
    if (!students.length) { adminSkillmap.innerHTML = '<p class="cab-empty">Учеников нет.</p>'; return; }
    var opts = students.map(function (s) { return '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>'; }).join('');
    adminSkillmap.innerHTML = '<div style="margin-bottom:16px">' +
      '<label class="cab-label">Ученик</label>' +
      '<select class="cab-input" id="skillmap-stu-sel" style="max-width:320px">' + opts + '</select>' +
      '</div><div id="skillmap-display"></div>';
    var sel = $('#skillmap-stu-sel');
    sel.addEventListener('change', function () { showSkillmap(sel.value); });
    showSkillmap(students[0].id);
  }
  function showSkillmap(studentId) {
    var disp = $('#skillmap-display');
    if (!disp) return;
    API.skillMap.getForStudent(studentId).then(function (map) {
      API.skillMap.templates().then(function (templates) {
        if (!Object.keys(map).length) { disp.innerHTML = '<p class="cab-empty">Навыки не заданы. Нажмите «Редактировать», чтобы добавить.</p>'; }
        var html = Object.keys(templates).map(function (dir) {
          var skills = templates[dir];
          var dirSkills = map[dir] || {};
          var rows = skills.map(function (sk) {
            var lvl = dirSkills[sk] || 0;
            var dots = [0,1,2,3,4,5].map(function (i) {
              return '<span class="skill-dot' + (i <= lvl ? ' skill-dot-filled' : '') + '" data-dir="' + encodeURIComponent(dir) + '" data-sk="' + encodeURIComponent(sk) + '" data-lvl="' + i + '">' + (i === 0 ? '○' : '●') + '</span>';
            }).join('');
            return '<div class="skill-row"><span class="skill-name">' + escapeHtml(sk) + '</span><span class="skill-dots">' + dots + '</span><span class="skill-level">' + lvl + '/5</span></div>';
          }).join('');
          return '<div class="skill-direction"><h4>' + escapeHtml(dir) + '</h4>' + rows + '</div>';
        }).join('');
        disp.innerHTML = html || '<p class="cab-empty">Нет шаблонов.</p>';
        $all('[data-dir]', disp).forEach(function (dot) {
          dot.style.cursor = 'pointer';
          dot.addEventListener('click', function () {
            var dir = decodeURIComponent(dot.getAttribute('data-dir'));
            var sk = decodeURIComponent(dot.getAttribute('data-sk'));
            var lvl = parseInt(dot.getAttribute('data-lvl'), 10);
            var stuSel = $('#skillmap-stu-sel');
            var sid = stuSel ? stuSel.value : studentId;
            API.skillMap.setLevel(sid, dir, sk, lvl).then(function () { showSkillmap(sid); });
          });
        });
      });
    });
  }

  /* =================================================================
     ADMIN — Причины ухода  [v0.9]
     ================================================================= */
  var CHURN_REASON_LABELS = {
    expensive: 'Дорого', moved: 'Переезд', schedule: 'Расписание',
    interest: 'Потеря интереса', competitor: 'Конкурент', other: 'Другое'
  };
  var adminChurn = $('#admin-churn-root');
  if (adminChurn) { loadAdminChurn(); }
  function loadAdminChurn() {
    if (!adminChurn) return;
    Promise.all([API.churn.stats()]).then(function (res) {
      var stats = res[0];
      var statCards = Object.keys(stats.byReason).map(function (r) {
        return '<div class="cab-stat-card"><div class="cab-stat-val">' + stats.byReason[r] + '</div><div class="cab-stat-label">' + escapeHtml(CHURN_REASON_LABELS[r] || r) + '</div></div>';
      }).join('');
      var rows = stats.list.map(function (c) {
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(c.studentName) + '</td>' +
          '<td data-th="Причина"><span class="badge badge-red">' + escapeHtml(CHURN_REASON_LABELS[c.reason] || c.reason) + '</span></td>' +
          '<td data-th="Направление">' + escapeHtml(c.direction || '—') + '</td>' +
          '<td data-th="Комментарий">' + escapeHtml(c.comment || '—') + '</td>' +
          '<td data-th="Дата">' + fmtDate(c.date) + '</td>' +
          '</tr>';
      }).join('');
      adminChurn.innerHTML =
        '<div class="cab-stats-row" style="margin-bottom:24px">' +
          '<div class="cab-stat-card"><div class="cab-stat-val">' + stats.total + '</div><div class="cab-stat-label">Всего ушло</div></div>' +
          statCards +
        '</div>' +
        (rows ? '<div class="cab-table-wrap"><table class="cab-table"><thead><tr><th>Ученик</th><th>Причина</th><th>Направление</th><th>Комментарий</th><th>Дата</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="cab-empty">Данных об уходе пока нет.</p>');
    });
    var addChurnBtn = $('[data-add-churn]');
    if (addChurnBtn) addChurnBtn.addEventListener('click', function () { openAddChurn(); });
  }
  function openAddChurn() {
    var allUsers = read_users_safe();
    var students = allUsers.filter(function (u) { return u.role === 'student'; });
    var stuOpts = students.map(function (s) { return { value: s.id, label: s.name }; });
    var reasonOpts = Object.keys(CHURN_REASON_LABELS).map(function (k) { return { value: k, label: CHURN_REASON_LABELS[k] }; });
    var html = '<form data-form>' +
      row(field('Ученик', selectCtrl('studentId', stuOpts, '')),
          field('Причина', selectCtrl('reason', reasonOpts, 'expensive'))) +
      field('Направление', input('direction', '')) +
      field('Комментарий', textarea('comment', '')) +
      formActions('Записать') + '</form>';
    var m = openModal('Причина ухода ученика', html);
    bindCrudForm(m, function (data) {
      var stu = students.filter(function (s) { return s.id === data.studentId; })[0];
      data.studentName = stu ? stu.name : '—';
      return API.churn.record(data);
    }, function () { toast('Записано'); loadAdminChurn(); });
  }

  /* =================================================================
     ADMIN — Отчёты  [v0.9]
     ================================================================= */
  var adminReports = $('#admin-reports-root');
  if (adminReports) { loadAdminReports(); }
  function loadAdminReports() {
    if (!adminReports) return;
    var REPORTS = [
      { id: 'attendance', label: 'Посещаемость', desc: 'Статистика посещений по ученикам за период.' },
      { id: 'sales', label: 'Продажи', desc: 'Детализация платежей и абонементов за период.' },
      { id: 'leads', label: 'Лиды', desc: 'Новые заявки, источники и конверсия.' },
      { id: 'trials', label: 'Пробные занятия', desc: 'Список пробных, результаты, конверсия.' },
      { id: 'debts', label: 'Задолженности', desc: 'Неоплаченные счета и суммы долга.' },
      { id: 'workload', label: 'Нагрузка преподавателей', desc: 'Количество учеников и занятий по преподавателям.' }
    ];
    adminReports.innerHTML = REPORTS.map(function (r) {
      return '<div class="cab-card" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
        '<div><strong>' + escapeHtml(r.label) + '</strong><br><small style="color:var(--text-muted)">' + escapeHtml(r.desc) + '</small></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn-secondary" data-report="' + r.id + '" data-fmt="json">Просмотр</button>' +
          '<button class="btn-secondary" data-report="' + r.id + '" data-fmt="csv">CSV</button>' +
        '</div></div>';
    }).join('');
    $all('[data-report]', adminReports).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var rId = btn.getAttribute('data-report');
        var fmt = btn.getAttribute('data-fmt');
        generateReport(rId, fmt);
      });
    });
  }
  function generateReport(reportId, fmt) {
    var generators = {
      attendance: function () { return Promise.resolve(JSON.parse(localStorage.getItem('sas_attendance') || '[]')); },
      sales: function () { return Promise.resolve(JSON.parse(localStorage.getItem('sas_payments') || '[]')); },
      leads: function () { return Promise.resolve(JSON.parse(localStorage.getItem('sas_leads') || '[]')); },
      trials: function () { return Promise.resolve(JSON.parse(localStorage.getItem('sas_trials') || '[]')); },
      debts: function () {
        var p = JSON.parse(localStorage.getItem('sas_payments') || '[]');
        return Promise.resolve(p.filter(function (x) { return x.status === 'pending'; }));
      },
      workload: function () {
        var ac = JSON.parse(localStorage.getItem('sas_academics') || '{}');
        var wl = {};
        Object.keys(ac).forEach(function (sid) { var t = ac[sid].teacher; if (t) wl[t] = (wl[t] || 0) + 1; });
        return Promise.resolve(Object.keys(wl).map(function (t) { return { teacher: t, students: wl[t] }; }));
      }
    };
    var gen = generators[reportId];
    if (!gen) return;
    gen().then(function (data) {
      if (fmt === 'csv') {
        if (!data.length) { toast('Нет данных'); return; }
        var keys = Object.keys(data[0]);
        var csv = [keys.join(',')].concat(data.map(function (row) {
          return keys.map(function (k) { var v = row[k]; return typeof v === 'object' ? JSON.stringify(v) : (v || ''); }).join(',');
        })).join('\n');
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = reportId + '-report.csv'; a.click();
        URL.revokeObjectURL(url);
      } else {
        var html = '<pre style="max-height:400px;overflow:auto;font-size:11px;background:#111;padding:12px;border-radius:6px">' +
          escapeHtml(JSON.stringify(data, null, 2)) + '</pre><div style="margin-top:12px"><button class="btn-secondary" data-cancel>Закрыть</button></div>';
        var m = openModal('Отчёт: ' + reportId, html);
        m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
      }
    });
  }

  /* =================================================================
     DIRECTOR — управленческая панель  [v0.9]
     ================================================================= */
  var directorRoot = $('#director-root');
  if (directorRoot) { loadDirectorDashboard(); }
  function loadDirectorDashboard() {
    if (!directorRoot) return;
    directorRoot.innerHTML = '<p class="cab-empty">Загрузка данных…</p>';
    Promise.all([API.analytics.summary(), API.recalculations.all()]).then(function (res) {
      var s = res[0], recalcs = res[1];
      var pendingRecalc = recalcs.filter(function(r){return r.status==='pending';}).length;
      var teacherRows = Object.keys(s.teacherWorkload).map(function (t) {
        return '<tr><td>' + escapeHtml(t) + '</td><td>' + s.teacherWorkload[t] + ' учеников</td></tr>';
      }).join('') || '<tr><td colspan="2" class="cab-empty">Нет данных</td></tr>';
      directorRoot.innerHTML =
        '<div class="cab-stats-row">' +
          dStat('Активных учеников', s.activeStudents, 'badge-green') +
          dStat('Новых заявок', s.newLeads, 'badge-blue') +
          dStat('Пробных ожидается', s.scheduledTrials, 'badge-gold') +
          dStat('Преподавателей', s.teachers, '') +
        '</div>' +
        '<div class="cab-stats-row" style="margin-top:12px">' +
          dStat('Выручка за месяц', fmtMoney(s.monthRevenue), 'badge-green') +
          dStat('Продаж за месяц', s.salesCount != null ? s.salesCount : '—', '') +
          dStat('Конверсия лид→ученик', (s.conversion != null ? s.conversion : 0) + '%', 'badge-blue') +
          dStat('Сумма долга', fmtMoney(s.unpaidTotal), s.unpaidTotal > 0 ? 'badge-red' : '') +
        '</div>' +
        '<div class="cab-stats-row" style="margin-top:12px">' +
          dStat('Ожидают оплаты', s.awaitingOrders != null ? s.awaitingOrders : 0, s.awaitingOrders ? 'badge-gold' : '') +
          dStat('Занятий за неделю', s.upcomingLessons != null ? s.upcomingLessons : 0, '') +
          dStat('Предстоящих событий', s.upcomingEvents, '') +
          dStat('Перерасчётов на рассмотрении', pendingRecalc, pendingRecalc ? 'badge-gold' : '') +
        '</div>' +
        '<h3 style="margin:24px 0 12px">Нагрузка преподавателей</h3>' +
        '<div class="cab-table-wrap"><table class="cab-table"><thead><tr><th>Преподаватель</th><th>Учеников</th></tr></thead><tbody>' + teacherRows + '</tbody></table></div>' +
        '<div class="dir-quick-links" style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap">' +
          '<a href="admin-leads.html" class="btn-secondary">CRM Лиды</a>' +
          '<a href="admin-trials.html" class="btn-secondary">Пробные</a>' +
          '<a href="admin-funnel.html" class="btn-secondary">Воронка</a>' +
          '<a href="admin-ads.html" class="btn-secondary">Реклама и лиды</a>' +
          '<a href="admin-orders.html" class="btn-secondary">Заказы</a>' +
          '<a href="admin-analytics.html" class="btn-secondary">Аналитика</a>' +
          '<a href="admin-reports.html" class="btn-secondary">Отчёты</a>' +
          '<a href="admin-journal.html" class="btn-secondary">Электронный журнал</a>' +
          '<a href="admin-recalculations.html" class="btn-secondary">Перерасчёты</a>' +
          '<a href="admin-tickets.html" class="btn-secondary">Билеты</a>' +
          '<a href="admin-branding.html" class="btn-secondary">Брендинг</a>' +
        '</div>';
    });
    function dStat(label, val, cls) {
      return '<div class="cab-stat-card"><div class="cab-stat-val' + (cls ? ' ' + cls : '') + '">' + val + '</div><div class="cab-stat-label">' + escapeHtml(label) + '</div></div>';
    }
  }

  /* =================================================================
     STUDENT — Журнал занятий  [v1.1]
     ================================================================= */
  var journalRoot = $('#journal-root');
  if (journalRoot) { loadStudentJournal(); }
  function loadStudentJournal() {
    API.journal.list().then(function (entries) {
      if (!entries.length) { journalRoot.innerHTML = '<p class="cab-empty">Записей в журнале пока нет.</p>'; return; }
      journalRoot.innerHTML = entries.map(function (e) {
        var hw = e.homeworkText
          ? '<div class="jrn-block"><div class="jrn-block-label">Домашнее задание</div><p>' + escapeHtml(e.homeworkText) + '</p></div>'
          : '';
        var comment = e.teacherComment
          ? '<div class="jrn-block"><div class="jrn-block-label">Комментарий преподавателя</div><p>' + escapeHtml(e.teacherComment) + '</p></div>'
          : '';
        return '<div class="jrn-card">' +
          '<div class="jrn-head">' +
            '<div><strong>' + escapeHtml(e.topic) + '</strong>' +
              '<div class="jrn-meta">' + escapeHtml(e.direction) + ' · ' + escapeHtml(e.teacher) + '</div></div>' +
            '<div class="jrn-date">' + fmtDate(e.date) + (e.time ? ' ' + escapeHtml(e.time) : '') + '</div>' +
          '</div>' +
          hw + comment +
        '</div>';
      }).join('');
    });
  }

  /* =================================================================
     ADMIN — Электронный журнал  [v1.1]
     ================================================================= */
  var adminJournalRoot = $('#admin-journal-root');
  if (adminJournalRoot) {
    var addJournalBtn2 = $('[data-add-journal]');
    if (addJournalBtn2) addJournalBtn2.addEventListener('click', function () { editAdminJournal(null); });
    loadAdminJournal();
  }
  function loadAdminJournal() {
    if (!adminJournalRoot) return;
    API.journal.list().then(function (entries) {
      if (!entries.length) { adminJournalRoot.innerHTML = '<p class="cab-empty">Записей пока нет.</p>'; return; }
      var rows = entries.map(function (e) {
        return '<tr>' +
          '<td data-th="Дата">' + fmtDate(e.date) + (e.time ? ' ' + e.time : '') + '</td>' +
          '<td data-th="Направление">' + escapeHtml(e.direction) + '</td>' +
          '<td data-th="Преподаватель">' + escapeHtml(e.teacher) + '</td>' +
          '<td data-th="Тема"><strong>' + escapeHtml(e.topic) + '</strong></td>' +
          '<td data-th="Учеников">' + (e.studentIds ? e.studentIds.length : 0) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + e.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + e.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminJournalRoot.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Дата</th><th>Направление</th><th>Преподаватель</th><th>Тема</th><th>Учеников</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminJournalRoot).forEach(function (b) { b.addEventListener('click', function () { editAdminJournal(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminJournalRoot).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить запись?')) API.journal.remove(b.getAttribute('data-del')).then(function () { toast('Запись удалена'); loadAdminJournal(); });
        });
      });
    });
  }
  function editAdminJournal(id) {
    Promise.all([API.admin.studentOptions(), id ? API.journal.get(id) : Promise.resolve({})]).then(function (res) {
      var students = res[0], e = res[1] || {};
      var studsChecks = students.map(function (s) {
        var on = (e.studentIds || []).indexOf(s.id) !== -1;
        return '<label class="check-row"><input type="checkbox" value="' + s.id + '" data-jrn-s' + (on ? ' checked' : '') + '> ' + escapeHtml(s.name) + '</label>';
      }).join('');
      var html = '<form data-form>' +
        row(field('Дата', input('date', e.date || new Date().toISOString().slice(0,10), 'date')), field('Время', input('time', e.time || ''))) +
        row(field('Направление', input('direction', e.direction || '')), field('Преподаватель', input('teacher', e.teacher || ''))) +
        field('Тема занятия', input('topic', e.topic || '')) +
        field('Домашнее задание', textarea('homeworkText', e.homeworkText || '')) +
        field('Комментарий преподавателя', textarea('teacherComment', e.teacherComment || '')) +
        (studsChecks ? field('Ученики', '<div class="check-list">' + studsChecks + '</div>') : '') +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать запись' : 'Новая запись в журнал', html, true);
      var form = m.body.querySelector('[data-form]');
      m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var err = form.querySelector('[data-err]'); hide(err);
        var data = {};
        $all('input[name], select[name], textarea[name]', form).forEach(function (el) { if (el.name) data[el.name] = el.value; });
        data.studentIds = $all('[data-jrn-s]', form).filter(function(c){return c.checked;}).map(function(c){return c.value;});
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        var op = id ? API.journal.update(id, data) : API.journal.create(data);
        op.then(function () { m.close(); toast(id ? 'Сохранено' : 'Запись добавлена'); loadAdminJournal(); })
          .catch(function (ex) { setFormError(err, ex.message); btn.disabled = false; });
      });
    });
  }

  /* =================================================================
     ADMIN — Перерасчёты по болезни  [v1.1]
     ================================================================= */
  var adminRecalcRoot = $('#admin-recalculations-root');
  if (adminRecalcRoot) { loadAdminRecalculations(); }
  function loadAdminRecalculations() {
    if (!adminRecalcRoot) return;
    var RECALC_STATUS = { pending: { label: 'На рассмотрении', cls: 'badge-gold' }, approved: { label: 'Одобрено', cls: 'badge-green' }, rejected: { label: 'Отклонено', cls: 'badge-red' } };
    API.recalculations.all().then(function (list) {
      if (!list.length) { adminRecalcRoot.innerHTML = '<p class="cab-empty">Заявок на перерасчёт пока нет.</p>'; return; }
      var rows = list.map(function (r) {
        var actions = r.status === 'pending'
          ? '<button class="btn btn-outline btn-sm" data-recalc-approve="' + r.id + '">Одобрить</button>' +
            '<button class="btn btn-outline btn-sm" style="color:var(--red)" data-recalc-reject="' + r.id + '">Отклонить</button>'
          : '';
        return '<tr>' +
          '<td data-th="Ученик">' + escapeHtml(r.studentName) + '</td>' +
          '<td data-th="Дата пропуска">' + fmtDate(r.absenceDate) + '</td>' +
          '<td data-th="Справка">' + (r.certificateUrl ? '<a href="' + escapeHtml(r.certificateUrl) + '" target="_blank" class="btn-secondary" style="font-size:.8rem">Открыть</a>' : '—') + '</td>' +
          '<td data-th="Комментарий">' + escapeHtml(r.comment || '—') + '</td>' +
          '<td data-th="Статус">' + badge(RECALC_STATUS, r.status) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' + actions + '</div></td></tr>';
      }).join('');
      adminRecalcRoot.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Ученик</th><th>Дата пропуска</th><th>Справка</th><th>Комментарий</th><th>Статус</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-recalc-approve]', adminRecalcRoot).forEach(function (b) {
        b.addEventListener('click', function () { reviewRecalc(b.getAttribute('data-recalc-approve'), 'approved'); });
      });
      $all('[data-recalc-reject]', adminRecalcRoot).forEach(function (b) {
        b.addEventListener('click', function () {
          var comment = prompt('Причина отклонения (необязательно):');
          reviewRecalc(b.getAttribute('data-recalc-reject'), 'rejected', comment);
        });
      });
    });
  }
  function reviewRecalc(id, status, comment) {
    API.recalculations.review(id, { status: status, adminComment: comment || '' }).then(function () {
      toast(status === 'approved' ? 'Одобрено' : 'Отклонено');
      loadAdminRecalculations();
    });
  }

  /* =================================================================
     ADMIN — Репетиции  [v1.1]
     ================================================================= */
  var adminRehearsalsRoot = $('#admin-rehearsals-root');
  if (adminRehearsalsRoot) {
    var addRehearsalBtn = $('[data-add-rehearsal]');
    if (addRehearsalBtn) addRehearsalBtn.addEventListener('click', function () { editRehearsal(null); });
    loadAdminRehearsals();
  }
  function loadAdminRehearsals() {
    if (!adminRehearsalsRoot) return;
    API.rehearsals.list().then(function (list) {
      if (!list.length) { adminRehearsalsRoot.innerHTML = '<p class="cab-empty">Репетиций пока нет.</p>'; return; }
      var rows = list.map(function (r) {
        return '<tr>' +
          '<td data-th="Дата">' + fmtDate(r.date) + (r.time ? ' ' + escapeHtml(r.time) : '') + '</td>' +
          '<td data-th="Мероприятие"><strong>' + escapeHtml(r.eventTitle || r.eventId) + '</strong></td>' +
          '<td data-th="Место">' + escapeHtml(r.place || '—') + '</td>' +
          '<td data-th="Преподаватель">' + escapeHtml(r.teacher || '—') + '</td>' +
          '<td data-th="Участников">' + (r.participants ? r.participants.length : 0) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn-icon" data-edit="' + r.id + '" title="Редактировать">✎</button>' +
            '<button class="btn-icon danger" data-del="' + r.id + '" title="Удалить">✕</button>' +
          '</div></td></tr>';
      }).join('');
      adminRehearsalsRoot.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Дата</th><th>Мероприятие</th><th>Место</th><th>Преподаватель</th><th>Участников</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-edit]', adminRehearsalsRoot).forEach(function (b) { b.addEventListener('click', function () { editRehearsal(b.getAttribute('data-edit')); }); });
      $all('[data-del]', adminRehearsalsRoot).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Удалить репетицию?')) API.rehearsals.remove(b.getAttribute('data-del')).then(function () { toast('Репетиция удалена'); loadAdminRehearsals(); });
        });
      });
    });
  }
  function editRehearsal(id) {
    Promise.all([API.events.list(), id ? API.rehearsals.list() : Promise.resolve([])]).then(function (res) {
      var evts = res[0].map(function (e) { return { value: e.id, label: e.title }; });
      var r = id ? (res[1].filter(function(x){return x.id===id;})[0]||{}) : {};
      var html = '<form data-form>' +
        field('Мероприятие', selectCtrl('eventId', evts, r.eventId)) +
        row(field('Дата', input('date', r.date || '', 'date')), field('Время', input('time', r.time || ''))) +
        row(field('Место', input('place', r.place || '')), field('Преподаватель', input('teacher', r.teacher || ''))) +
        field('Комментарий', textarea('comment', r.comment || '')) +
        formActions() + '</form>';
      var m = openModal(id ? 'Редактировать репетицию' : 'Новая репетиция', html);
      bindCrudForm(m, function (data) { return id ? API.rehearsals.update(id, data) : API.rehearsals.create(data); },
        function () { toast(id ? 'Сохранено' : 'Репетиция добавлена'); loadAdminRehearsals(); });
    });
  }

  /* =================================================================
     ADMIN — Билеты  [v1.1]
     ================================================================= */
  var adminTicketsRoot = $('#admin-tickets-root');
  if (adminTicketsRoot) {
    var issueTicketBtn = $('[data-issue-ticket]');
    if (issueTicketBtn) issueTicketBtn.addEventListener('click', function () { issueTicket(); });
    loadAdminTickets();
  }
  function loadAdminTickets() {
    if (!adminTicketsRoot) return;
    var TKT_STATUS = { issued: { label: 'Выдан', cls: 'badge-green' }, used: { label: 'Использован', cls: 'badge-gray' }, cancelled: { label: 'Аннулирован', cls: 'badge-red' } };
    API.tickets.all().then(function (list) {
      if (!list.length) { adminTicketsRoot.innerHTML = '<p class="cab-empty">Билетов пока нет.</p>'; return; }
      var rows = list.map(function (t) {
        return '<tr>' +
          '<td data-th="Номер"><code class="tkt-number">' + escapeHtml(t.number) + '</code></td>' +
          '<td data-th="Мероприятие"><strong>' + escapeHtml(t.eventTitle) + '</strong></td>' +
          '<td data-th="Дата">' + fmtDate(t.eventDate) + (t.eventTime ? ' ' + escapeHtml(t.eventTime) : '') + '</td>' +
          '<td data-th="Владелец">' + escapeHtml(t.holderName || '—') + '</td>' +
          '<td data-th="Телефон">' + escapeHtml(t.holderPhone || '—') + '</td>' +
          '<td data-th="Цена">' + (t.price ? fmtMoney(t.price) : 'Бесплатно') + '</td>' +
          '<td data-th="Статус">' + badge(TKT_STATUS, t.status) + '</td>' +
          '<td data-th=""><div class="cab-row-actions">' +
            '<button class="btn btn-outline btn-sm" data-view-ticket="' + t.id + '">Просмотр</button>' +
            (t.status === 'issued' ? '<button class="btn btn-outline btn-sm" data-validate-ticket="' + escapeHtml(t.number) + '">Отметить исп.</button>' : '') +
            (t.status === 'issued' ? '<button class="btn-icon danger" data-cancel-ticket="' + t.id + '" title="Аннулировать">✕</button>' : '') +
          '</div></td></tr>';
      }).join('');
      adminTicketsRoot.innerHTML = '<div class="cab-table-wrap"><table class="cab-table">' +
        '<thead><tr><th>Номер</th><th>Мероприятие</th><th>Дата</th><th>Владелец</th><th>Телефон</th><th>Цена</th><th>Статус</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
      $all('[data-view-ticket]', adminTicketsRoot).forEach(function (b) {
        b.addEventListener('click', function () {
          var tid = b.getAttribute('data-view-ticket');
          var t = list.filter(function (x) { return x.id === tid; })[0]; if (!t) return;
          var qrHtml = '<div class="tkt-qr-placeholder" title="QR-код">' +
            '<div class="tkt-qr-grid">' + Array(16).fill('<span></span>').join('') + '</div>' +
            '<code class="tkt-number" style="display:block;text-align:center;margin-top:8px;font-size:1.1rem">' + escapeHtml(t.number) + '</code></div>';
          openModal('Билет · ' + escapeHtml(t.eventTitle),
            '<div style="text-align:center">' + qrHtml + '</div>' +
            '<table class="cab-table" style="margin-top:16px"><tbody>' +
            '<tr><td><strong>Мероприятие</strong></td><td>' + escapeHtml(t.eventTitle) + '</td></tr>' +
            '<tr><td><strong>Дата</strong></td><td>' + fmtDate(t.eventDate) + (t.eventTime ? ' ' + escapeHtml(t.eventTime) : '') + '</td></tr>' +
            (t.holderName ? '<tr><td><strong>Владелец</strong></td><td>' + escapeHtml(t.holderName) + '</td></tr>' : '') +
            (t.holderPhone ? '<tr><td><strong>Телефон</strong></td><td>' + escapeHtml(t.holderPhone) + '</td></tr>' : '') +
            '<tr><td><strong>Цена</strong></td><td>' + (t.price ? fmtMoney(t.price) : 'Бесплатно') + '</td></tr>' +
            '<tr><td><strong>Статус</strong></td><td>' + badge(TKT_STATUS, t.status) + '</td></tr>' +
            '</tbody></table>');
        });
      });
      $all('[data-validate-ticket]', adminTicketsRoot).forEach(function (b) {
        b.addEventListener('click', function () {
          var num = b.getAttribute('data-validate-ticket');
          if (!confirm('Отметить билет ' + num + ' как использованный?')) return;
          API.tickets.validate(num).then(function (t) { toast('Билет ' + t.number + ' — использован'); loadAdminTickets(); })
            .catch(function (ex) { toast('Ошибка: ' + ex.message); });
        });
      });
      $all('[data-cancel-ticket]', adminTicketsRoot).forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Аннулировать билет?')) API.tickets.cancel(b.getAttribute('data-cancel-ticket')).then(function () { toast('Билет аннулирован'); loadAdminTickets(); });
        });
      });
    });
  }
  function issueTicket() {
    Promise.all([API.events.list(), API.admin.studentOptions()]).then(function (res) {
      var evts = res[0], students = res[1];
      var evtOpts = evts.map(function (e) { return { value: e.id, label: e.title + (e.date ? ' · ' + fmtDate(e.date) : '') }; });
      var stuOpts = [{ value: '', label: '— гость (без аккаунта) —' }].concat(
        students.map(function (s) { return { value: s.id, label: s.name }; })
      );
      var html = '<form data-form>' +
        field('Мероприятие', selectCtrl('eventId', evtOpts, evtOpts[0] && evtOpts[0].value)) +
        field('Ученик (или оставьте пустым для гостя)', selectCtrl('userId', stuOpts, '')) +
        row(field('Имя владельца (для гостя)', input('holderName', '')), field('Телефон', input('holderPhone', ''))) +
        field('Цена билета (0 = бесплатно)', input('price', '0', 'number')) +
        formActions('Выдать билет') + '</form>';
      var m = openModal('Выдать билет', html);
      bindCrudForm(m, function (data) {
        data.price = parseFloat(data.price) || 0;
        if (!data.userId) data.userId = 'guest-' + Date.now();
        return API.tickets.issue(data);
      }, function () { toast('Билет выдан'); loadAdminTickets(); });
    });
  }

  /* =================================================================
     ADMIN — Брендинг  [v1.1]
     ================================================================= */
  var adminBrandRoot = $('#admin-branding-root');
  if (adminBrandRoot) { loadAdminBranding(); }
  function loadAdminBranding() {
    if (!adminBrandRoot) return;
    API.brand.get().then(function (b) {
      var html = '<form id="brand-form" style="max-width:600px">' +
        '<h2 class="cab-section-title">Идентификация школы</h2>' +
        row(field('Название школы', input('schoolName', b.schoolName || '')), field('Слоган', input('tagline', b.tagline || ''))) +
        row(field('Директор', input('directorName', b.directorName || '')), field('Телефон', input('contactPhone', b.contactPhone || ''))) +
        row(field('Email', input('contactEmail', b.contactEmail || '')), field('Адрес', input('address', b.address || ''))) +
        '<h2 class="cab-section-title">Визуальный стиль</h2>' +
        row(field('URL логотипа', input('logoUrl', b.logoUrl || '')), field('URL фавикона', input('faviconUrl', b.faviconUrl || ''))) +
        row(field('Основной цвет', '<input class="form-control" type="color" name="primaryColor" value="' + escapeHtml(b.primaryColor || '#c0392b') + '">'),
            field('Акцентный цвет', '<input class="form-control" type="color" name="accentColor" value="' + escapeHtml(b.accentColor || '#8e1a0e') + '">')) +
        '<div class="form-error" data-err></div>' +
        '<div class="cab-form-actions">' +
          '<button type="submit" class="btn btn-primary">Сохранить настройки</button>' +
        '</div>' +
      '</form>';
      adminBrandRoot.innerHTML = html;
      var form = document.getElementById('brand-form');
      if (!form) return;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = form.querySelector('[data-err]'); hide(err);
        var data = {};
        $all('input[name], select[name], textarea[name]', form).forEach(function (el) { if (el.name) data[el.name] = el.value; });
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        API.brand.update(data).then(function () { toast('Настройки брендинга сохранены'); btn.disabled = false; })
          .catch(function (ex) { setFormError(err, ex.message); btn.disabled = false; });
      });
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
