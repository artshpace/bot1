/* =====================================================================
   MOCK API LAYER — Shpigotskiy Art Space (v0.3)
   ---------------------------------------------------------------------
   Centralised data access for the student cabinet and admin panel.
   Every page talks to this object instead of calling fetch() directly,
   so when a real backend appears only this file changes — page code
   stays the same.

   All methods return Promises (simulating network latency) so swapping
   in real `fetch(...)` calls later is a drop-in replacement.

   Persistence is mocked with localStorage:
     sas_users          — registered users (the "database")
     sas_session        — the currently signed-in user
     sas_subscriptions  — subscription records (per student)   [v0.3]
     sas_payments       — payment records (per student)        [v0.3]
     sas_courses        — online-course catalogue + enrolments [v0.3]

   Payment integration point: subscriptions/courses purchases route
   through processCharge() — the single place a real payment gateway
   (Kaspi / CloudPayments / Stripe …) will plug into later.

   Namespaces marked "RESERVED" are scaffolding for future versions
   (parent cabinet, attendance, homework, certificates, Telegram Mini
   App). They are intentionally NOT implemented yet — see ROADMAP in
   website/README.md.
   ===================================================================== */
(function (global) {
  'use strict';

  var LS_USERS = 'sas_users';
  var LS_SESSION = 'sas_session';
  var LS_SUBS = 'sas_subscriptions';
  var LS_PAYMENTS = 'sas_payments';
  var LS_COURSES = 'sas_courses';

  /* ---- storage helpers ---- */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ---- promise helpers that mimic an async network ---- */
  function delay(value, ms) {
    return new Promise(function (res) { setTimeout(function () { res(value); }, ms || 280); });
  }
  function fail(message, ms) {
    return new Promise(function (_, rej) { setTimeout(function () { rej(new Error(message)); }, ms || 280); });
  }

  /* ---- date helpers ---- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(date, n) { var d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function parseYmd(s) { var p = (s || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function daysUntil(isoDate) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((parseYmd(isoDate) - today) / 86400000);
  }

  function norm(v) { return (v || '').trim().toLowerCase(); }
  function uid(prefix) { return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000); }
  function publicUser(u) {
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
  }
  function matches(u, login) { return norm(u.email) === login || norm(u.phone) === login; }
  function curId() { var u = auth.current(); return u ? u.id : null; }

  /* =================================================================
     SEED DATA — created once, then persisted in localStorage.
     Dates are computed relative to "now" so the demo notifications
     (few lessons left / subscription ending soon / unpaid) fire.
     ================================================================= */
  var DEMO_USER = {
    id: 'stu-demo', name: 'Алина Ким',
    email: 'demo@shpigotskiy.art', phone: '+7 777 123-45-67',
    password: 'demo1234', role: 'student'
  };
  var ADMIN_USER = {
    id: 'adm-1', name: 'Антон Шпигоцкий',
    email: 'admin@shpigotskiy.art', phone: '+7 777 000-00-00',
    password: 'admin1234', role: 'admin'
  };

  function seedSubscriptions() {
    var now = new Date();
    return [
      {
        id: 'sub-demo-1', studentId: 'stu-demo', name: 'Гитара · Безлимит-8',
        lessonsTotal: 8, lessonsLeft: 2, price: 18000,
        startDate: ymd(addDays(now, -25)), endDate: ymd(addDays(now, 5)),
        purchaseDate: ymd(addDays(now, -25)), status: 'active'
      },
      {
        id: 'sub-demo-2', studentId: 'stu-demo', name: 'Вокал · 4 занятия',
        lessonsTotal: 4, lessonsLeft: 3, price: 9000,
        startDate: ymd(addDays(now, -10)), endDate: ymd(addDays(now, 35)),
        purchaseDate: ymd(addDays(now, -2)), status: 'frozen'
      },
      {
        id: 'sub-demo-3', studentId: 'stu-demo', name: 'Гитара · 8 занятий',
        lessonsTotal: 8, lessonsLeft: 0, price: 16000,
        startDate: ymd(addDays(now, -85)), endDate: ymd(addDays(now, -55)),
        purchaseDate: ymd(addDays(now, -85)), status: 'completed'
      }
    ];
  }

  function seedPayments() {
    var now = new Date();
    return [
      {
        id: 'pay-demo-1', studentId: 'stu-demo', date: ymd(addDays(now, -25)),
        amount: 18000, purpose: 'Абонемент «Гитара · Безлимит-8»', status: 'paid'
      },
      {
        id: 'pay-demo-2', studentId: 'stu-demo', date: ymd(addDays(now, -40)),
        amount: 12000, purpose: 'Онлайн-курс «Гитара для начинающих»', status: 'paid'
      },
      {
        id: 'pay-demo-3', studentId: 'stu-demo', date: ymd(addDays(now, -2)),
        amount: 9000, purpose: 'Абонемент «Вокал · 4 занятия»', status: 'pending'
      }
    ];
  }

  function seedCourses() {
    return [
      {
        id: 'c-guitar-basic', title: 'Гитара для начинающих', teacher: 'Антон Шпигоцкий',
        price: 12000, lessonsTotal: 24, gradient: 'linear-gradient(135deg,#1a0a0a,#3d1010)',
        published: true, enrollments: { 'stu-demo': { lessonsDone: 16 } }
      },
      {
        id: 'c-vocal-voice', title: 'Вокал: постановка голоса', teacher: 'Мария Лебедева',
        price: 14000, lessonsTotal: 20, gradient: 'linear-gradient(135deg,#0d1a0d,#0d3020)',
        published: true, enrollments: { 'stu-demo': { lessonsDone: 5 } }
      },
      {
        id: 'c-watercolor', title: 'Акварель с нуля', teacher: 'Ольга Светлова',
        price: 10000, lessonsTotal: 16, gradient: 'linear-gradient(135deg,#0d0d1a,#151530)',
        published: true, enrollments: { 'stu-demo': { lessonsDone: 16 } }
      },
      {
        id: 'c-acting-base', title: 'Актёрское мастерство: старт', teacher: 'Игорь Волков',
        price: 13000, lessonsTotal: 18, gradient: 'linear-gradient(135deg,#1a0a15,#2d0d28)',
        published: true, enrollments: {}
      }
    ];
  }

  (function ensureSeed() {
    var users = read(LS_USERS, null) || [];
    if (!users.some(function (u) { return u.id === DEMO_USER.id; })) users.push(DEMO_USER);
    if (!users.some(function (u) { return u.id === ADMIN_USER.id; })) users.push(ADMIN_USER);
    write(LS_USERS, users);
    if (!read(LS_SUBS, null)) write(LS_SUBS, seedSubscriptions());
    if (!read(LS_PAYMENTS, null)) write(LS_PAYMENTS, seedPayments());
    if (!read(LS_COURSES, null)) write(LS_COURSES, seedCourses());
  })();

  /* Purchasable subscription plans (the "shop" catalogue). Static for now;
     a real backend would serve these from a products table. */
  var PLANS = [
    { id: 'plan-g8', name: 'Гитара · 8 занятий', direction: 'Гитара', lessons: 8, price: 16000, durationDays: 30 },
    { id: 'plan-g12', name: 'Гитара · 12 занятий', direction: 'Гитара', lessons: 12, price: 22000, durationDays: 45 },
    { id: 'plan-v8', name: 'Вокал · 8 занятий', direction: 'Вокал', lessons: 8, price: 14000, durationDays: 30 },
    { id: 'plan-paint8', name: 'Живопись · 8 занятий', direction: 'Живопись', lessons: 8, price: 12000, durationDays: 30 }
  ];

  /* =================================================================
     PAYMENT GATEWAY — single future integration point.
     Today it just resolves (mock "successful" checkout). To go live,
     replace the body with a real PSP call (Kaspi / CloudPayments /
     Stripe …) that returns a Promise resolving on success.
     ================================================================= */
  function processCharge(order) {
    return delay({ ok: true, provider: 'mock', order: order });
  }

  function addPayment(rec) {
    var payments = read(LS_PAYMENTS, []);
    var payment = {
      id: uid('pay'),
      studentId: rec.studentId,
      date: ymd(new Date()),
      amount: rec.amount,
      purpose: rec.purpose,
      status: rec.status || 'paid'
    };
    payments.push(payment);
    write(LS_PAYMENTS, payments);
    return payment;
  }

  /* =================================================================
     AUTH
     ================================================================= */
  var auth = {
    register: function (payload) {
      var users = read(LS_USERS, []);
      var login = norm(payload.email || payload.phone);
      if (!login) return fail('Укажите телефон или email');
      if (users.some(function (u) { return matches(u, login); })) {
        return fail('Пользователь с такими данными уже зарегистрирован');
      }
      var user = {
        id: uid('stu'),
        name: (payload.name || '').trim(),
        email: (payload.email || '').trim(),
        phone: (payload.phone || '').trim(),
        password: payload.password,
        role: 'student'
      };
      users.push(user);
      write(LS_USERS, users);
      write(LS_SESSION, { login: norm(user.email || user.phone), at: Date.now() });
      return delay(publicUser(user));
    },

    login: function (loginValue, password) {
      var users = read(LS_USERS, []);
      var login = norm(loginValue);
      var user = users.filter(function (u) { return matches(u, login); })[0];
      if (!user || user.password !== password) return fail('Неверный логин или пароль');
      write(LS_SESSION, { login: norm(user.email || user.phone), at: Date.now() });
      return delay(publicUser(user));
    },

    /* Mock recovery: always reports success without revealing whether the
       account exists (standard practice). A real backend would email/SMS. */
    recover: function (loginValue) {
      if (!norm(loginValue)) return fail('Укажите телефон или email');
      return delay({ ok: true });
    },

    logout: function () {
      localStorage.removeItem(LS_SESSION);
      return Promise.resolve({ ok: true });
    },

    /* Synchronous — used by the route guard before render. */
    current: function () {
      var session = read(LS_SESSION, null);
      if (!session) return null;
      var users = read(LS_USERS, []);
      var user = users.filter(function (u) { return matches(u, session.login); })[0];
      return publicUser(user);
    }
  };

  /* =================================================================
     STUDENT — academic profile (mock data)
     ================================================================= */

  // Weekly recurring lessons (JS weekday: 0=Sun .. 6=Sat)
  var WEEKLY = [
    { weekday: 2, time: '17:00', direction: 'Гитара', teacher: 'Антон Шпигоцкий', room: 'Зал 1' },
    { weekday: 4, time: '17:00', direction: 'Гитара', teacher: 'Антон Шпигоцкий', room: 'Зал 1' },
    { weekday: 6, time: '12:00', direction: 'Вокал', teacher: 'Мария Лебедева', room: 'Зал 2' }
  ];
  var WEEKDAY_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

  function nextOccurrence(from) {
    // Find the soonest upcoming lesson from the weekly template.
    var best = null;
    for (var add = 0; add <= 7; add++) {
      var day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + add);
      WEEKLY.forEach(function (slot) {
        if (slot.weekday !== day.getDay()) return;
        var parts = slot.time.split(':');
        var when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +parts[0], +parts[1]);
        if (when > from && (!best || when < best.when)) {
          best = { when: when, slot: slot };
        }
      });
      if (best) break;
    }
    return best;
  }

  var student = {
    profile: function (studentId) {
      var id = studentId || curId();
      var me = auth.current();
      var next = nextOccurrence(new Date());
      var active = activeSubFor(id);
      var pending = read(LS_PAYMENTS, []).some(function (p) {
        return p.studentId === id && p.status === 'pending';
      });
      return delay({
        name: me ? me.name : 'Ученик',
        direction: 'Гитара',
        teacher: 'Антон Шпигоцкий',
        level: 'Базовый уровень · 1 год обучения',
        nextLesson: next ? {
          date: ymd(next.when),
          time: next.slot.time,
          direction: next.slot.direction,
          teacher: next.slot.teacher,
          room: next.slot.room,
          weekday: WEEKDAY_RU[next.when.getDay()]
        } : null,
        subscription: active,
        lessonsLeft: active ? active.lessonsLeft : 0,
        lessonsTotal: active ? active.lessonsTotal : 0,
        subscriptionUntil: active ? active.endDate : null,
        paymentStatus: pending ? 'pending' : 'paid' // paid | pending
      });
    },

    /* Weekly schedule template, rendered as a human list on the dashboard. */
    weekly: function () {
      return delay(WEEKLY.map(function (s) {
        return { weekday: WEEKDAY_RU[s.weekday], time: s.time, direction: s.direction, teacher: s.teacher, room: s.room };
      }));
    }
  };

  /* =================================================================
     SCHEDULE — calendar feed (mock)
     ================================================================= */
  var schedule = {
    /* Concrete lessons for a given month, expanded from the weekly template.
       month is 0-based (JS Date convention). */
    month: function (year, month) {
      var out = [];
      var cursor = new Date(year, month, 1);
      while (cursor.getMonth() === month) {
        WEEKLY.forEach(function (slot) {
          if (slot.weekday === cursor.getDay()) {
            out.push({
              date: ymd(cursor),
              time: slot.time,
              direction: slot.direction,
              teacher: slot.teacher,
              room: slot.room
            });
          }
        });
        cursor = new Date(year, month, cursor.getDate() + 1);
      }
      return delay(out);
    }
  };

  /* =================================================================
     SUBSCRIPTIONS (абонементы)
     ================================================================= */
  function activeSubFor(studentId) {
    var subs = read(LS_SUBS, []).filter(function (s) {
      return s.studentId === studentId && s.status === 'active';
    });
    subs.sort(function (a, b) { return parseYmd(b.endDate) - parseYmd(a.endDate); });
    return subs[0] || null;
  }

  var subscriptions = {
    /* Plans available to buy. */
    plans: function () { return delay(PLANS.slice()); },

    /* A student's subscription history (newest first). */
    list: function (studentId) {
      var id = studentId || curId();
      var subs = read(LS_SUBS, []).filter(function (s) { return s.studentId === id; });
      subs.sort(function (a, b) { return parseYmd(b.purchaseDate) - parseYmd(a.purchaseDate); });
      return delay(subs);
    },

    /* The current active subscription (or null). */
    active: function (studentId) { return delay(activeSubFor(studentId || curId())); },

    /* Buy a plan → creates a subscription + a payment (mock checkout). */
    buy: function (planId, studentId) {
      var id = studentId || curId();
      var plan = PLANS.filter(function (p) { return p.id === planId; })[0];
      if (!plan) return fail('Тариф не найден');
      return processCharge({ type: 'subscription', planId: planId, amount: plan.price }).then(function () {
        var subs = read(LS_SUBS, []);
        var start = new Date();
        var sub = {
          id: uid('sub'), studentId: id, name: plan.name,
          lessonsTotal: plan.lessons, lessonsLeft: plan.lessons, price: plan.price,
          startDate: ymd(start), endDate: ymd(addDays(start, plan.durationDays)),
          purchaseDate: ymd(start), status: 'active'
        };
        subs.push(sub);
        write(LS_SUBS, subs);
        addPayment({ studentId: id, amount: plan.price, purpose: 'Абонемент «' + plan.name + '»', status: 'paid' });
        return sub;
      });
    },

    /* Renew an existing subscription → refills lessons, extends the term. */
    renew: function (subId) {
      var subs = read(LS_SUBS, []);
      var sub = subs.filter(function (s) { return s.id === subId; })[0];
      if (!sub) return fail('Абонемент не найден');
      return processCharge({ type: 'renewal', subscriptionId: subId, amount: sub.price }).then(function () {
        var base = parseYmd(sub.endDate) > new Date() ? parseYmd(sub.endDate) : new Date();
        sub.endDate = ymd(addDays(base, 30));
        sub.lessonsLeft = sub.lessonsTotal;
        sub.status = 'active';
        write(LS_SUBS, subs);
        addPayment({ studentId: sub.studentId, amount: sub.price, purpose: 'Продление абонемента «' + sub.name + '»', status: 'paid' });
        return sub;
      });
    },

    /* ---- admin ---- */
    all: function () {
      var users = read(LS_USERS, []);
      function nameOf(sid) { var u = users.filter(function (x) { return x.id === sid; })[0]; return u ? u.name : '—'; }
      var subs = read(LS_SUBS, []).map(function (s) {
        var c = JSON.parse(JSON.stringify(s)); c.studentName = nameOf(s.studentId); return c;
      });
      subs.sort(function (a, b) { return parseYmd(b.purchaseDate) - parseYmd(a.purchaseDate); });
      return delay(subs);
    },
    create: function (data) {
      var subs = read(LS_SUBS, []);
      var sub = {
        id: uid('sub'),
        studentId: data.studentId,
        name: (data.name || '').trim(),
        lessonsTotal: +data.lessonsTotal || 0,
        lessonsLeft: data.lessonsLeft != null ? +data.lessonsLeft : (+data.lessonsTotal || 0),
        price: +data.price || 0,
        startDate: data.startDate || ymd(new Date()),
        endDate: data.endDate || ymd(addDays(new Date(), 30)),
        purchaseDate: data.purchaseDate || ymd(new Date()),
        status: data.status || 'active'
      };
      if (!sub.name) return fail('Введите название абонемента');
      if (!sub.studentId) return fail('Выберите ученика');
      subs.push(sub);
      write(LS_SUBS, subs);
      return delay(sub);
    },
    update: function (id, data) {
      var subs = read(LS_SUBS, []);
      var sub = subs.filter(function (s) { return s.id === id; })[0];
      if (!sub) return fail('Абонемент не найден');
      ['name', 'studentId', 'startDate', 'endDate', 'status'].forEach(function (k) {
        if (data[k] != null) sub[k] = data[k];
      });
      ['lessonsTotal', 'lessonsLeft', 'price'].forEach(function (k) {
        if (data[k] != null && data[k] !== '') sub[k] = +data[k];
      });
      write(LS_SUBS, subs);
      return delay(sub);
    },
    remove: function (id) {
      var subs = read(LS_SUBS, []).filter(function (s) { return s.id !== id; });
      write(LS_SUBS, subs);
      return delay({ ok: true });
    }
  };

  /* =================================================================
     PAYMENTS (платежи)
     ================================================================= */
  var payments = {
    list: function (studentId) {
      var id = studentId || curId();
      var list = read(LS_PAYMENTS, []).filter(function (p) { return p.studentId === id; });
      list.sort(function (a, b) { return parseYmd(b.date) - parseYmd(a.date); });
      return delay(list);
    },
    /* ---- admin ---- */
    all: function () {
      var users = read(LS_USERS, []);
      function nameOf(sid) { var u = users.filter(function (x) { return x.id === sid; })[0]; return u ? u.name : '—'; }
      var list = read(LS_PAYMENTS, []).map(function (p) {
        var c = JSON.parse(JSON.stringify(p)); c.studentName = nameOf(p.studentId); return c;
      });
      list.sort(function (a, b) { return parseYmd(b.date) - parseYmd(a.date); });
      return delay(list);
    }
  };

  /* =================================================================
     COURSES — online-course catalogue + per-student enrolments
     ================================================================= */
  function courseProgress(c, sid) {
    var en = c.enrollments && c.enrollments[sid];
    var done = en ? (en.lessonsDone || 0) : 0;
    var total = c.lessonsTotal || 0;
    return { lessonsDone: done, lessonsTotal: total, progress: total ? Math.round((done / total) * 100) : 0 };
  }

  var courses = {
    /* Courses the student has bought (drives "Мои курсы"). */
    purchased: function (studentId) {
      var id = studentId || curId();
      var list = read(LS_COURSES, []).filter(function (c) {
        return c.enrollments && c.enrollments[id];
      }).map(function (c) {
        var p = courseProgress(c, id);
        return {
          id: c.id, title: c.title, teacher: c.teacher, gradient: c.gradient,
          lessonsDone: p.lessonsDone, lessonsTotal: p.lessonsTotal, progress: p.progress
        };
      });
      return delay(list);
    },

    /* Full catalogue with an `owned` flag for the current student (shop). */
    catalog: function (studentId) {
      var id = studentId || curId();
      var list = read(LS_COURSES, []).filter(function (c) { return c.published; }).map(function (c) {
        return {
          id: c.id, title: c.title, teacher: c.teacher, price: c.price,
          lessonsTotal: c.lessonsTotal, gradient: c.gradient,
          owned: !!(c.enrollments && c.enrollments[id])
        };
      });
      return delay(list);
    },

    /* Buy a course → enrol the student + create a payment (mock checkout). */
    buy: function (courseId, studentId) {
      var id = studentId || curId();
      var all = read(LS_COURSES, []);
      var course = all.filter(function (c) { return c.id === courseId; })[0];
      if (!course) return fail('Курс не найден');
      if (course.enrollments && course.enrollments[id]) return fail('Курс уже приобретён');
      return processCharge({ type: 'course', courseId: courseId, amount: course.price }).then(function () {
        course.enrollments = course.enrollments || {};
        course.enrollments[id] = { lessonsDone: 0 };
        write(LS_COURSES, all);
        addPayment({ studentId: id, amount: course.price, purpose: 'Онлайн-курс «' + course.title + '»', status: 'paid' });
        return course;
      });
    },

    /* ---- admin ---- */
    all: function () {
      var list = read(LS_COURSES, []).map(function (c) {
        return {
          id: c.id, title: c.title, teacher: c.teacher, price: c.price,
          lessonsTotal: c.lessonsTotal, gradient: c.gradient, published: c.published,
          students: c.enrollments ? Object.keys(c.enrollments).length : 0
        };
      });
      return delay(list);
    },
    create: function (data) {
      var all = read(LS_COURSES, []);
      var course = {
        id: uid('c'),
        title: (data.title || '').trim(),
        teacher: (data.teacher || '').trim(),
        price: +data.price || 0,
        lessonsTotal: +data.lessonsTotal || 0,
        gradient: data.gradient || 'linear-gradient(135deg,#1a0a0a,#3d1010)',
        published: data.published !== false,
        enrollments: {}
      };
      if (!course.title) return fail('Введите название курса');
      all.push(course);
      write(LS_COURSES, all);
      return delay(course);
    },
    update: function (id, data) {
      var all = read(LS_COURSES, []);
      var course = all.filter(function (c) { return c.id === id; })[0];
      if (!course) return fail('Курс не найден');
      ['title', 'teacher', 'gradient'].forEach(function (k) { if (data[k] != null) course[k] = data[k]; });
      ['price', 'lessonsTotal'].forEach(function (k) { if (data[k] != null && data[k] !== '') course[k] = +data[k]; });
      if (data.published != null) course.published = !!data.published;
      write(LS_COURSES, all);
      return delay(course);
    },
    remove: function (id) {
      var all = read(LS_COURSES, []).filter(function (c) { return c.id !== id; });
      write(LS_COURSES, all);
      return delay({ ok: true });
    }
  };

  /* =================================================================
     NOTIFICATIONS — derived in-cabinet alerts (no email/SMS yet)
     ================================================================= */
  var notifications = {
    list: function (studentId) {
      var id = studentId || curId();
      var out = [];
      var active = activeSubFor(id);
      if (active) {
        if (active.lessonsLeft < 3) {
          out.push({
            level: 'warning',
            title: 'Осталось мало занятий',
            text: 'По абонементу «' + active.name + '» осталось ' + active.lessonsLeft +
              ' ' + plural(active.lessonsLeft, 'занятие', 'занятия', 'занятий') + '.',
            action: { label: 'Продлить', href: 'shop.html' }
          });
        }
        var left = daysUntil(active.endDate);
        if (left >= 0 && left < 7) {
          out.push({
            level: 'warning',
            title: 'Абонемент скоро закончится',
            text: 'Срок действия «' + active.name + '» истекает через ' + left +
              ' ' + plural(left, 'день', 'дня', 'дней') + '.',
            action: { label: 'Продлить', href: 'shop.html' }
          });
        }
      }
      var unpaid = read(LS_PAYMENTS, []).filter(function (p) {
        return p.studentId === id && p.status === 'pending';
      });
      if (unpaid.length) {
        out.push({
          level: 'danger',
          title: 'Есть неоплаченные услуги',
          text: 'Ожидают оплаты: ' + unpaid.length + ' ' +
            plural(unpaid.length, 'платёж', 'платежа', 'платежей') + '.',
          action: { label: 'История платежей', href: 'payments.html' }
        });
      }
      return delay(out);
    }
  };

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  /* =================================================================
     ADMIN — students directory
     ================================================================= */
  var admin = {
    students: function (query) {
      var q = norm(query);
      var subs = read(LS_SUBS, []);
      var pays = read(LS_PAYMENTS, []);
      var list = read(LS_USERS, []).filter(function (u) { return u.role === 'student'; }).map(function (u) {
        var active = subs.filter(function (s) { return s.studentId === u.id && s.status === 'active'; })[0];
        var pending = pays.some(function (p) { return p.studentId === u.id && p.status === 'pending'; });
        return {
          id: u.id, name: u.name, email: u.email, phone: u.phone,
          subscription: active ? active.name : null,
          lessonsLeft: active ? active.lessonsLeft : null,
          paymentStatus: pending ? 'pending' : 'paid'
        };
      });
      if (q) {
        list = list.filter(function (s) {
          return norm(s.name).indexOf(q) !== -1 ||
            norm(s.email).indexOf(q) !== -1 ||
            norm(s.phone).indexOf(q) !== -1;
        });
      }
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
      return delay(list);
    },

    /* A single student's full card. */
    student: function (id) {
      var u = read(LS_USERS, []).filter(function (x) { return x.id === id; })[0];
      if (!u) return fail('Ученик не найден');
      var subs = read(LS_SUBS, []).filter(function (s) { return s.studentId === id; });
      subs.sort(function (a, b) { return parseYmd(b.purchaseDate) - parseYmd(a.purchaseDate); });
      var pays = read(LS_PAYMENTS, []).filter(function (p) { return p.studentId === id; });
      pays.sort(function (a, b) { return parseYmd(b.date) - parseYmd(a.date); });
      var crs = read(LS_COURSES, []).filter(function (c) { return c.enrollments && c.enrollments[id]; })
        .map(function (c) {
          var p = courseProgress(c, id);
          return { id: c.id, title: c.title, progress: p.progress, lessonsDone: p.lessonsDone, lessonsTotal: p.lessonsTotal };
        });
      return delay({ user: publicUser(u), subscriptions: subs, payments: pays, courses: crs });
    },

    /* Used by the admin subscription form's student picker. */
    studentOptions: function () {
      var list = read(LS_USERS, []).filter(function (u) { return u.role === 'student'; })
        .map(function (u) { return { id: u.id, name: u.name }; });
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
      return delay(list);
    }
  };

  /* =================================================================
     RESERVED NAMESPACES — scaffolding for future versions.
     Deliberately not implemented yet. Pages must treat these as
     "coming soon". Keeping the shape here documents the intended API.
     ================================================================= */
  var parent = {       // родительский кабинет
    children: function () { return fail('Родительский кабинет появится в следующей версии'); }
  };
  var attendance = {   // посещаемость
    list: function () { return fail('Учёт посещаемости появится в следующей версии'); }
  };
  var homework = {     // домашние задания
    list: function () { return fail('Домашние задания появятся в следующей версии'); }
  };
  var certificates = { // сертификаты
    list: function () { return fail('Сертификаты появятся в следующей версии'); }
  };

  global.API = {
    auth: auth,
    student: student,
    schedule: schedule,
    subscriptions: subscriptions,
    payments: payments,
    courses: courses,
    notifications: notifications,
    admin: admin,
    // reserved (future versions)
    parent: parent,
    attendance: attendance,
    homework: homework,
    certificates: certificates
  };
})(window);
