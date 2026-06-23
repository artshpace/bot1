/* =====================================================================
   MOCK API LAYER — Shpigotskiy Art Space (v0.2)
   ---------------------------------------------------------------------
   Centralised data access for the student cabinet. Every page talks to
   this object instead of calling fetch() directly, so when a real
   backend appears only this file changes — page code stays the same.

   All methods return Promises (simulating network latency) so swapping
   in real `fetch(...)` calls later is a drop-in replacement.

   Persistence is mocked with localStorage:
     sas_users   — array of registered users (the "database")
     sas_session — the currently signed-in user

   Namespaces marked "RESERVED" are scaffolding for future versions
   (parent cabinet, homework, certificates). They are intentionally NOT
   implemented yet — see ROADMAP in website/README.md.
   ===================================================================== */
(function (global) {
  'use strict';

  var LS_USERS = 'sas_users';
  var LS_SESSION = 'sas_session';

  /* ---- seed demo account so the cabinet is explorable without signup ---- */
  var DEMO_USER = {
    id: 'stu-demo',
    name: 'Алина Ким',
    email: 'demo@shpigotskiy.art',
    phone: '+7 777 123-45-67',
    password: 'demo1234',
    role: 'student'
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  (function ensureSeed() {
    if (!read(LS_USERS, null)) write(LS_USERS, [DEMO_USER]);
  })();

  /* ---- promise helpers that mimic an async network ---- */
  function delay(value, ms) {
    return new Promise(function (res) { setTimeout(function () { res(value); }, ms || 320); });
  }
  function fail(message, ms) {
    return new Promise(function (_, rej) { setTimeout(function () { rej(new Error(message)); }, ms || 320); });
  }

  function norm(v) { return (v || '').trim().toLowerCase(); }
  function publicUser(u) {
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
  }
  function matches(u, login) { return norm(u.email) === login || norm(u.phone) === login; }

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
        id: 'stu-' + Date.now(),
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

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

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
    profile: function () {
      var me = auth.current();
      var next = nextOccurrence(new Date());
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
        lessonsLeft: 6,
        lessonsTotal: 8,
        subscriptionUntil: '2026-07-15',
        paymentStatus: 'paid' // paid | pending | overdue
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
     COURSES — purchased online courses (mock)
     ================================================================= */
  var courses = {
    purchased: function () {
      return delay([
        {
          id: 'c-guitar-basic',
          title: 'Гитара для начинающих',
          teacher: 'Антон Шпигоцкий',
          lessonsDone: 16, lessonsTotal: 24,
          progress: 67,
          gradient: 'linear-gradient(135deg,#1a0a0a,#3d1010)'
        },
        {
          id: 'c-vocal-voice',
          title: 'Вокал: постановка голоса',
          teacher: 'Мария Лебедева',
          lessonsDone: 5, lessonsTotal: 20,
          progress: 25,
          gradient: 'linear-gradient(135deg,#0d1a0d,#0d3020)'
        },
        {
          id: 'c-watercolor',
          title: 'Акварель с нуля',
          teacher: 'Ольга Светлова',
          lessonsDone: 16, lessonsTotal: 16,
          progress: 100,
          gradient: 'linear-gradient(135deg,#0d0d1a,#151530)'
        }
      ]);
    }
  };

  /* =================================================================
     RESERVED NAMESPACES — scaffolding for future versions.
     Deliberately not implemented in v0.2. Pages must treat these as
     "coming soon". Keeping the shape here documents the intended API.
     ================================================================= */
  var parent = {       // v0.3 — родительский кабинет
    children: function () { return fail('Родительский кабинет появится в следующей версии'); }
  };
  var homework = {     // v0.3 — домашние задания
    list: function () { return fail('Домашние задания появятся в следующей версии'); }
  };
  var certificates = { // v0.3 — сертификаты
    list: function () { return fail('Сертификаты появятся в следующей версии'); }
  };

  global.API = {
    auth: auth,
    student: student,
    schedule: schedule,
    courses: courses,
    // reserved
    parent: parent,
    homework: homework,
    certificates: certificates
  };
})(window);
