/* =====================================================================
   MOCK API LAYER — Shpigotskiy Art Space (v0.4)
   ---------------------------------------------------------------------
   Centralised data access. Every page talks to window.API.* — swap
   methods for real fetch() calls when a backend exists.

   localStorage keys:
     sas_users          — users
     sas_session        — current session
     sas_subscriptions  — subscriptions   [v0.3]
     sas_payments       — payments        [v0.3]
     sas_courses        — course catalogue + enrolments [v0.3]
     sas_lms_modules    — course modules  [v0.4]
     sas_lms_lessons    — lessons         [v0.4]
     sas_lms_progress   — lesson progress [v0.4]

   Payment integration point: processCharge() — replace body with PSP.
   Reserved namespaces: parent, attendance, homework, certificates,
   tests, comments — scaffolding for future versions.
   ===================================================================== */
(function (global) {
  'use strict';

  var LS_USERS    = 'sas_users';
  var LS_SESSION  = 'sas_session';
  var LS_SUBS     = 'sas_subscriptions';
  var LS_PAYMENTS = 'sas_payments';
  var LS_COURSES  = 'sas_courses';
  var LS_MODULES  = 'sas_lms_modules';
  var LS_LESSONS  = 'sas_lms_lessons';
  var LS_PROGRESS = 'sas_lms_progress';

  /* ---- storage ---- */
  function read(key, fallback) {
    try { var r = localStorage.getItem(key); return r == null ? fallback : JSON.parse(r); }
    catch (e) { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ---- async helpers ---- */
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
     SEED DATA
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
      { id: 'sub-demo-1', studentId: 'stu-demo', name: 'Гитара · Безлимит-8',
        lessonsTotal: 8, lessonsLeft: 2, price: 18000,
        startDate: ymd(addDays(now, -25)), endDate: ymd(addDays(now, 5)),
        purchaseDate: ymd(addDays(now, -25)), status: 'active' },
      { id: 'sub-demo-2', studentId: 'stu-demo', name: 'Вокал · 4 занятия',
        lessonsTotal: 4, lessonsLeft: 3, price: 9000,
        startDate: ymd(addDays(now, -10)), endDate: ymd(addDays(now, 35)),
        purchaseDate: ymd(addDays(now, -2)), status: 'frozen' },
      { id: 'sub-demo-3', studentId: 'stu-demo', name: 'Гитара · 8 занятий',
        lessonsTotal: 8, lessonsLeft: 0, price: 16000,
        startDate: ymd(addDays(now, -85)), endDate: ymd(addDays(now, -55)),
        purchaseDate: ymd(addDays(now, -85)), status: 'completed' }
    ];
  }

  function seedPayments() {
    var now = new Date();
    return [
      { id: 'pay-demo-1', studentId: 'stu-demo', date: ymd(addDays(now, -25)),
        amount: 18000, purpose: 'Абонемент «Гитара · Безлимит-8»', status: 'paid' },
      { id: 'pay-demo-2', studentId: 'stu-demo', date: ymd(addDays(now, -40)),
        amount: 12000, purpose: 'Онлайн-курс «Гитара для начинающих»', status: 'paid' },
      { id: 'pay-demo-3', studentId: 'stu-demo', date: ymd(addDays(now, -2)),
        amount: 9000, purpose: 'Абонемент «Вокал · 4 занятия»', status: 'pending' }
    ];
  }

  function seedCourses() {
    return [
      { id: 'c-guitar-basic', title: 'Гитара для начинающих', teacher: 'Антон Шпигоцкий',
        price: 12000, lessonsTotal: 10, gradient: 'linear-gradient(135deg,#1a0a0a,#3d1010)',
        published: true, enrollments: { 'stu-demo': {} } },
      { id: 'c-vocal-voice', title: 'Вокал: постановка голоса', teacher: 'Мария Лебедева',
        price: 14000, lessonsTotal: 7, gradient: 'linear-gradient(135deg,#0d1a0d,#0d3020)',
        published: true, enrollments: { 'stu-demo': {} } },
      { id: 'c-watercolor', title: 'Акварель с нуля', teacher: 'Ольга Светлова',
        price: 10000, lessonsTotal: 6, gradient: 'linear-gradient(135deg,#0d0d1a,#151530)',
        published: true, enrollments: { 'stu-demo': {} } },
      { id: 'c-acting-base', title: 'Актёрское мастерство: старт', teacher: 'Игорь Волков',
        price: 13000, lessonsTotal: 6, gradient: 'linear-gradient(135deg,#1a0a15,#2d0d28)',
        published: true, enrollments: {} }
    ];
  }

  function seedModules() {
    return [
      { id: 'mod-gb-1', courseId: 'c-guitar-basic', title: 'Знакомство с гитарой', order: 1 },
      { id: 'mod-gb-2', courseId: 'c-guitar-basic', title: 'Основные аккорды', order: 2 },
      { id: 'mod-gb-3', courseId: 'c-guitar-basic', title: 'Ритм и бой', order: 3 },
      { id: 'mod-vv-1', courseId: 'c-vocal-voice', title: 'Основы вокала', order: 1 },
      { id: 'mod-vv-2', courseId: 'c-vocal-voice', title: 'Техники и упражнения', order: 2 },
      { id: 'mod-wc-1', courseId: 'c-watercolor', title: 'Материалы и инструменты', order: 1 },
      { id: 'mod-wc-2', courseId: 'c-watercolor', title: 'Первые этюды', order: 2 },
      { id: 'mod-ab-1', courseId: 'c-acting-base', title: 'Основы актёрского мастерства', order: 1 },
      { id: 'mod-ab-2', courseId: 'c-acting-base', title: 'Этюды и импровизация', order: 2 }
    ];
  }

  function seedLessons() {
    var txtGb03 = '<p>Гитару нужно настраивать перед каждой репетицией. Стандартный строй: <strong>E A D G B e</strong> (от 6-й струны к 1-й).</p><p>Используйте хроматический тюнер или приложение. Натягивайте струну снизу вверх — не перетягивайте.</p><h4>Метод квинт:</h4><ol><li>Зажмите 5-й лад 6-й струны → настройте 5-ю открытую.</li><li>5-й лад 5-й струны → 4-я открытая.</li><li>5-й лад 4-й струны → 3-я открытая.</li><li><strong>4-й лад</strong> 3-й струны → 2-я открытая (исключение!).</li><li>5-й лад 2-й струны → 1-я открытая.</li></ol>';
    var txtGb07 = '<p>Главный навык — плавно менять аккорды, не прерывая ритм.</p><h4>Упражнение 1:</h4><p>Am → Em по 4 удара. Темп 60 BPM, 10 повторений без остановки.</p><h4>Упражнение 2:</h4><p>Am → Em → G → Em. Считайте вслух, начинайте медленно.</p><p><strong>Совет:</strong> Переносите все пальцы одновременно, а не по одному.</p>';
    var txtVv01 = '<p>Голосовой аппарат — система органов, работающих вместе.</p><ul><li><strong>Диафрагма</strong> — мышца-двигатель певческого дыхания.</li><li><strong>Голосовые связки</strong> — вибрируют и создают звук.</li><li><strong>Резонаторы</strong> — грудь, рот, нос, голова — усиливают и окрашивают тембр.</li></ul><p>Правильное дыхание диафрагмальное: при вдохе живот движется вперёд, плечи не поднимаются.</p>';
    var txtVv04 = '<p>Регистры — это «слои» голоса:</p><ul><li><strong>Грудной</strong> — низкие и средние ноты, резонанс в груди.</li><li><strong>Микст</strong> — переходная зона.</li><li><strong>Головной (фальцет)</strong> — высокие ноты, лёгкие и воздушные.</li></ul><p>Задача — переходить между регистрами плавно, без «перелома». Используйте глиссандо-упражнения.</p>';
    var txtWc01 = '<p>Качество материалов напрямую влияет на результат.</p><h4>Бумага:</h4><p>Минимум 200 г/м², рекомендуется 300 г/м². Тонкая коробится и мешает работе.</p><h4>Кисти:</h4><ul><li>Круглая №6 — основная</li><li>Круглая №2 — для деталей</li><li>Плоская 25 мм — для заливок</li></ul><p><strong>Совет:</strong> Мойте кисти сразу после работы.</p>';
    var txtAb01 = '<p>В системе Станиславского <strong>действие</strong> — основа всего. Актёр не «показывает» эмоцию, а совершает конкретное физическое действие с целью.</p><p>Три вопроса перед каждой сценой:</p><ol><li><strong>Что я делаю?</strong></li><li><strong>Зачем?</strong></li><li><strong>При каких обстоятельствах?</strong></li></ol><p>Не «я грущу», а «я пытаюсь скрыть слёзы, чтобы не расстроить маму».</p>';
    var txtAb05 = '<p>Импровизация — это умение быстро реагировать в рамках обстоятельств.</p><h4>Правило «Да, и…»:</h4><p>Принимай предложение партнёра и развивай его — никогда не отрицай.</p><h4>Упражнение:</h4><p>Первый начинает фразой, второй отвечает «Да, и...» и добавляет новое. Продолжайте 3–5 минут.</p><p><strong>Пример:</strong> — «Мы опаздываем на поезд!» — «Да, и у меня нет билета!»</p>';

    return [
      /* Гитара — Модуль 1 */
      { id: 'les-gb-01', moduleId: 'mod-gb-1', courseId: 'c-guitar-basic', order: 1, type: 'video',
        title: 'Строение гитары', content: { title: 'Строение гитары — обзор деталей инструмента' } },
      { id: 'les-gb-02', moduleId: 'mod-gb-1', courseId: 'c-guitar-basic', order: 2, type: 'video',
        title: 'Как держать гитару', content: { title: 'Правильная посадка и постановка рук' } },
      { id: 'les-gb-03', moduleId: 'mod-gb-1', courseId: 'c-guitar-basic', order: 3, type: 'text',
        title: 'Настройка инструмента', content: { body: txtGb03 } },
      /* Гитара — Модуль 2 */
      { id: 'les-gb-04', moduleId: 'mod-gb-2', courseId: 'c-guitar-basic', order: 1, type: 'video',
        title: 'Аккорд Am', content: { title: 'Учим аккорд Am — аппликатура и переходы' } },
      { id: 'les-gb-05', moduleId: 'mod-gb-2', courseId: 'c-guitar-basic', order: 2, type: 'video',
        title: 'Аккорд Em', content: { title: 'Аккорд Em — самый простой аккорд для новичка' } },
      { id: 'les-gb-06', moduleId: 'mod-gb-2', courseId: 'c-guitar-basic', order: 3, type: 'image',
        title: 'Аккорд G', content: { caption: 'Аппликатура аккорда G на грифе гитары' } },
      { id: 'les-gb-07', moduleId: 'mod-gb-2', courseId: 'c-guitar-basic', order: 4, type: 'text',
        title: 'Переходы между аккордами', content: { body: txtGb07 } },
      /* Гитара — Модуль 3 */
      { id: 'les-gb-08', moduleId: 'mod-gb-3', courseId: 'c-guitar-basic', order: 1, type: 'video',
        title: 'Удары и ритм', content: { title: 'Базовый ритм — удары вниз и вверх' } },
      { id: 'les-gb-09', moduleId: 'mod-gb-3', courseId: 'c-guitar-basic', order: 2, type: 'video',
        title: 'Простой перебор', content: { title: 'Перебор «1-2-3-2» — классическая техника' } },
      { id: 'les-gb-10', moduleId: 'mod-gb-3', courseId: 'c-guitar-basic', order: 3, type: 'file',
        title: 'Первая песня целиком', content: { filename: 'pervaya-pesnya-tabs.pdf', label: 'Скачать табулатуры (PDF)' } },
      /* Вокал — Модуль 1 */
      { id: 'les-vv-01', moduleId: 'mod-vv-1', courseId: 'c-vocal-voice', order: 1, type: 'text',
        title: 'Анатомия голоса', content: { body: txtVv01 } },
      { id: 'les-vv-02', moduleId: 'mod-vv-1', courseId: 'c-vocal-voice', order: 2, type: 'video',
        title: 'Дыхание певца', content: { title: 'Диафрагмальное дыхание — основа вокала' } },
      { id: 'les-vv-03', moduleId: 'mod-vv-1', courseId: 'c-vocal-voice', order: 3, type: 'video',
        title: 'Распевка и разминка', content: { title: 'Комплекс упражнений для разминки голоса' } },
      /* Вокал — Модуль 2 */
      { id: 'les-vv-04', moduleId: 'mod-vv-2', courseId: 'c-vocal-voice', order: 1, type: 'text',
        title: 'Диапазон и регистры', content: { body: txtVv04 } },
      { id: 'les-vv-05', moduleId: 'mod-vv-2', courseId: 'c-vocal-voice', order: 2, type: 'video',
        title: 'Артикуляция и дикция', content: { title: 'Чёткая дикция — упражнения для артикуляции' } },
      { id: 'les-vv-06', moduleId: 'mod-vv-2', courseId: 'c-vocal-voice', order: 3, type: 'video',
        title: 'Интонирование', content: { title: 'Попадание в ноты — работа над интонацией' } },
      { id: 'les-vv-07', moduleId: 'mod-vv-2', courseId: 'c-vocal-voice', order: 4, type: 'file',
        title: 'Работа с микрофоном', content: { filename: 'vocal-techniques-guide.pdf', label: 'Скачать методичку (PDF)' } },
      /* Акварель — Модуль 1 */
      { id: 'les-wc-01', moduleId: 'mod-wc-1', courseId: 'c-watercolor', order: 1, type: 'text',
        title: 'Бумага и кисти', content: { body: txtWc01 } },
      { id: 'les-wc-02', moduleId: 'mod-wc-1', courseId: 'c-watercolor', order: 2, type: 'image',
        title: 'Разведение красок', content: { caption: 'Шкала разбавления — от насыщенного к прозрачному' } },
      { id: 'les-wc-03', moduleId: 'mod-wc-1', courseId: 'c-watercolor', order: 3, type: 'video',
        title: 'Базовые техники нанесения', content: { title: 'Мокрое по мокрому и мокрое по сухому' } },
      /* Акварель — Модуль 2 */
      { id: 'les-wc-04', moduleId: 'mod-wc-2', courseId: 'c-watercolor', order: 1, type: 'video',
        title: 'Небо и вода', content: { title: 'Пишем небо градиентной заливкой' } },
      { id: 'les-wc-05', moduleId: 'mod-wc-2', courseId: 'c-watercolor', order: 2, type: 'video',
        title: 'Простой пейзаж', content: { title: 'Этюд: закат над горизонтом' } },
      { id: 'les-wc-06', moduleId: 'mod-wc-2', courseId: 'c-watercolor', order: 3, type: 'file',
        title: 'Итоговый натюрморт', content: { filename: 'watercolor-exercises.pdf', label: 'Скачать задания для практики (PDF)' } },
      /* Актёрское — Модуль 1 */
      { id: 'les-ab-01', moduleId: 'mod-ab-1', courseId: 'c-acting-base', order: 1, type: 'text',
        title: 'Что такое действие', content: { body: txtAb01 } },
      { id: 'les-ab-02', moduleId: 'mod-ab-1', courseId: 'c-acting-base', order: 2, type: 'video',
        title: 'Наблюдение за людьми', content: { title: 'Упражнение «Зеркало» — наблюдение и копирование' } },
      { id: 'les-ab-03', moduleId: 'mod-ab-1', courseId: 'c-acting-base', order: 3, type: 'video',
        title: 'Работа с воображением', content: { title: 'Предлагаемые обстоятельства — фантазия актёра' } },
      /* Актёрское — Модуль 2 */
      { id: 'les-ab-04', moduleId: 'mod-ab-2', courseId: 'c-acting-base', order: 1, type: 'video',
        title: 'Первые этюды', content: { title: 'Этюд «Молчание» — действие без слов' } },
      { id: 'les-ab-05', moduleId: 'mod-ab-2', courseId: 'c-acting-base', order: 2, type: 'text',
        title: 'Импровизация', content: { body: txtAb05 } },
      { id: 'les-ab-06', moduleId: 'mod-ab-2', courseId: 'c-acting-base', order: 3, type: 'file',
        title: 'Итоговый этюд', content: { filename: 'acting-exercises.pdf', label: 'Скачать сборник упражнений (PDF)' } }
    ];
  }

  function seedProgress() {
    var now = new Date();
    var items = [];
    /* demo: 8/10 guitar lessons done */
    ['les-gb-01','les-gb-02','les-gb-03','les-gb-04','les-gb-05','les-gb-06','les-gb-07','les-gb-08']
      .forEach(function (id, i) {
        items.push({ id: 'prg-' + id, studentId: 'stu-demo', lessonId: id,
          courseId: 'c-guitar-basic', completedAt: ymd(addDays(now, -(8 - i) * 3)) });
      });
    /* demo: 3/7 vocal lessons done */
    ['les-vv-01','les-vv-02','les-vv-03'].forEach(function (id, i) {
      items.push({ id: 'prg-' + id, studentId: 'stu-demo', lessonId: id,
        courseId: 'c-vocal-voice', completedAt: ymd(addDays(now, -(3 - i) * 7)) });
    });
    /* demo: 6/6 watercolor — completed */
    ['les-wc-01','les-wc-02','les-wc-03','les-wc-04','les-wc-05','les-wc-06']
      .forEach(function (id, i) {
        items.push({ id: 'prg-' + id, studentId: 'stu-demo', lessonId: id,
          courseId: 'c-watercolor', completedAt: ymd(addDays(now, -(6 - i) * 5)) });
      });
    return items;
  }

  (function ensureSeed() {
    var users = read(LS_USERS, null) || [];
    if (!users.some(function (u) { return u.id === DEMO_USER.id; })) users.push(DEMO_USER);
    if (!users.some(function (u) { return u.id === ADMIN_USER.id; })) users.push(ADMIN_USER);
    write(LS_USERS, users);
    if (!read(LS_SUBS, null))     write(LS_SUBS,     seedSubscriptions());
    if (!read(LS_PAYMENTS, null)) write(LS_PAYMENTS, seedPayments());
    if (!read(LS_COURSES, null))  write(LS_COURSES,  seedCourses());
    if (!read(LS_MODULES, null))  write(LS_MODULES,  seedModules());
    if (!read(LS_LESSONS, null))  write(LS_LESSONS,  seedLessons());
    if (!read(LS_PROGRESS, null)) write(LS_PROGRESS, seedProgress());
  })();

  var PLANS = [
    { id: 'plan-g8',    name: 'Гитара · 8 занятий',    direction: 'Гитара',    lessons: 8,  price: 16000, durationDays: 30 },
    { id: 'plan-g12',   name: 'Гитара · 12 занятий',   direction: 'Гитара',    lessons: 12, price: 22000, durationDays: 45 },
    { id: 'plan-v8',    name: 'Вокал · 8 занятий',     direction: 'Вокал',     lessons: 8,  price: 14000, durationDays: 30 },
    { id: 'plan-paint8',name: 'Живопись · 8 занятий',  direction: 'Живопись',  lessons: 8,  price: 12000, durationDays: 30 }
  ];

  /* Payment gateway integration point — replace with real PSP call. */
  function processCharge(order) {
    return delay({ ok: true, provider: 'mock', order: order });
  }

  function addPayment(rec) {
    var payments = read(LS_PAYMENTS, []);
    var payment = { id: uid('pay'), studentId: rec.studentId, date: ymd(new Date()),
      amount: rec.amount, purpose: rec.purpose, status: rec.status || 'paid' };
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
      if (users.some(function (u) { return matches(u, login); }))
        return fail('Пользователь с такими данными уже зарегистрирован');
      var user = { id: uid('stu'), name: (payload.name || '').trim(),
        email: (payload.email || '').trim(), phone: (payload.phone || '').trim(),
        password: payload.password, role: 'student' };
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
    recover: function (loginValue) {
      if (!norm(loginValue)) return fail('Укажите телефон или email');
      return delay({ ok: true });
    },
    logout: function () { localStorage.removeItem(LS_SESSION); return Promise.resolve({ ok: true }); },
    current: function () {
      var session = read(LS_SESSION, null);
      if (!session) return null;
      var users = read(LS_USERS, []);
      var user = users.filter(function (u) { return matches(u, session.login); })[0];
      return publicUser(user);
    }
  };

  /* =================================================================
     STUDENT — academic profile
     ================================================================= */
  var WEEKLY = [
    { weekday: 2, time: '17:00', direction: 'Гитара', teacher: 'Антон Шпигоцкий', room: 'Зал 1' },
    { weekday: 4, time: '17:00', direction: 'Гитара', teacher: 'Антон Шпигоцкий', room: 'Зал 1' },
    { weekday: 6, time: '12:00', direction: 'Вокал',  teacher: 'Мария Лебедева',   room: 'Зал 2' }
  ];
  var WEEKDAY_RU = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

  function nextOccurrence(from) {
    var best = null;
    for (var add = 0; add <= 7; add++) {
      var day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + add);
      WEEKLY.forEach(function (slot) {
        if (slot.weekday !== day.getDay()) return;
        var parts = slot.time.split(':');
        var when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +parts[0], +parts[1]);
        if (when > from && (!best || when < best.when)) best = { when: when, slot: slot };
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
        direction: 'Гитара', teacher: 'Антон Шпигоцкий', level: 'Базовый уровень · 1 год обучения',
        nextLesson: next ? { date: ymd(next.when), time: next.slot.time,
          direction: next.slot.direction, teacher: next.slot.teacher,
          room: next.slot.room, weekday: WEEKDAY_RU[next.when.getDay()] } : null,
        subscription: active,
        lessonsLeft: active ? active.lessonsLeft : 0,
        lessonsTotal: active ? active.lessonsTotal : 0,
        subscriptionUntil: active ? active.endDate : null,
        paymentStatus: pending ? 'pending' : 'paid'
      });
    },
    weekly: function () {
      return delay(WEEKLY.map(function (s) {
        return { weekday: WEEKDAY_RU[s.weekday], time: s.time,
          direction: s.direction, teacher: s.teacher, room: s.room };
      }));
    }
  };

  /* =================================================================
     SCHEDULE
     ================================================================= */
  var schedule = {
    month: function (year, month) {
      var out = [];
      var cursor = new Date(year, month, 1);
      while (cursor.getMonth() === month) {
        WEEKLY.forEach(function (slot) {
          if (slot.weekday === cursor.getDay()) {
            out.push({ date: ymd(cursor), time: slot.time,
              direction: slot.direction, teacher: slot.teacher, room: slot.room });
          }
        });
        cursor = new Date(year, month, cursor.getDate() + 1);
      }
      return delay(out);
    }
  };

  /* =================================================================
     SUBSCRIPTIONS
     ================================================================= */
  function activeSubFor(studentId) {
    var subs = read(LS_SUBS, []).filter(function (s) {
      return s.studentId === studentId && s.status === 'active';
    });
    subs.sort(function (a, b) { return parseYmd(b.endDate) - parseYmd(a.endDate); });
    return subs[0] || null;
  }

  var subscriptions = {
    plans: function () { return delay(PLANS.slice()); },
    list: function (studentId) {
      var id = studentId || curId();
      var subs = read(LS_SUBS, []).filter(function (s) { return s.studentId === id; });
      subs.sort(function (a, b) { return parseYmd(b.purchaseDate) - parseYmd(a.purchaseDate); });
      return delay(subs);
    },
    active: function (studentId) { return delay(activeSubFor(studentId || curId())); },
    buy: function (planId, studentId) {
      var id = studentId || curId();
      var plan = PLANS.filter(function (p) { return p.id === planId; })[0];
      if (!plan) return fail('Тариф не найден');
      return processCharge({ type: 'subscription', planId: planId, amount: plan.price }).then(function () {
        var subs = read(LS_SUBS, []);
        var start = new Date();
        var sub = { id: uid('sub'), studentId: id, name: plan.name,
          lessonsTotal: plan.lessons, lessonsLeft: plan.lessons, price: plan.price,
          startDate: ymd(start), endDate: ymd(addDays(start, plan.durationDays)),
          purchaseDate: ymd(start), status: 'active' };
        subs.push(sub); write(LS_SUBS, subs);
        addPayment({ studentId: id, amount: plan.price, purpose: 'Абонемент «' + plan.name + '»', status: 'paid' });
        return sub;
      });
    },
    renew: function (subId) {
      var subs = read(LS_SUBS, []);
      var sub = subs.filter(function (s) { return s.id === subId; })[0];
      if (!sub) return fail('Абонемент не найден');
      return processCharge({ type: 'renewal', subscriptionId: subId, amount: sub.price }).then(function () {
        var base = parseYmd(sub.endDate) > new Date() ? parseYmd(sub.endDate) : new Date();
        sub.endDate = ymd(addDays(base, 30)); sub.lessonsLeft = sub.lessonsTotal; sub.status = 'active';
        write(LS_SUBS, subs);
        addPayment({ studentId: sub.studentId, amount: sub.price, purpose: 'Продление «' + sub.name + '»', status: 'paid' });
        return sub;
      });
    },
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
      var sub = { id: uid('sub'), studentId: data.studentId, name: (data.name || '').trim(),
        lessonsTotal: +data.lessonsTotal || 0,
        lessonsLeft: data.lessonsLeft != null ? +data.lessonsLeft : (+data.lessonsTotal || 0),
        price: +data.price || 0,
        startDate: data.startDate || ymd(new Date()), endDate: data.endDate || ymd(addDays(new Date(), 30)),
        purchaseDate: data.purchaseDate || ymd(new Date()), status: data.status || 'active' };
      if (!sub.name) return fail('Введите название абонемента');
      if (!sub.studentId) return fail('Выберите ученика');
      subs.push(sub); write(LS_SUBS, subs);
      return delay(sub);
    },
    update: function (id, data) {
      var subs = read(LS_SUBS, []);
      var sub = subs.filter(function (s) { return s.id === id; })[0];
      if (!sub) return fail('Абонемент не найден');
      ['name','studentId','startDate','endDate','status'].forEach(function (k) { if (data[k] != null) sub[k] = data[k]; });
      ['lessonsTotal','lessonsLeft','price'].forEach(function (k) { if (data[k] != null && data[k] !== '') sub[k] = +data[k]; });
      write(LS_SUBS, subs);
      return delay(sub);
    },
    remove: function (id) {
      write(LS_SUBS, read(LS_SUBS, []).filter(function (s) { return s.id !== id; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     PAYMENTS
     ================================================================= */
  var payments = {
    list: function (studentId) {
      var id = studentId || curId();
      var list = read(LS_PAYMENTS, []).filter(function (p) { return p.studentId === id; });
      list.sort(function (a, b) { return parseYmd(b.date) - parseYmd(a.date); });
      return delay(list);
    },
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
     COURSES — catalogue + enrolments + LMS stats  [v0.4 updated]
     ================================================================= */
  function courseLmsStats(courseId, studentId) {
    var allLessons = read(LS_LESSONS, []).filter(function (l) { return l.courseId === courseId; });
    var allModules = read(LS_MODULES, []).filter(function (m) { return m.courseId === courseId; });
    var done = read(LS_PROGRESS, [])
      .filter(function (p) { return p.studentId === studentId && p.courseId === courseId; })
      .map(function (p) { return p.lessonId; });
    var lessonsDone = allLessons.filter(function (l) { return done.indexOf(l.id) !== -1; }).length;
    var lastViewedAt = null;
    read(LS_PROGRESS, []).filter(function (p) { return p.studentId === studentId && p.courseId === courseId; })
      .forEach(function (p) { if (!lastViewedAt || p.completedAt > lastViewedAt) lastViewedAt = p.completedAt; });
    allLessons.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var nextLesson = null;
    for (var i = 0; i < allLessons.length; i++) {
      if (done.indexOf(allLessons[i].id) === -1) { nextLesson = allLessons[i]; break; }
    }
    return {
      lessonsTotal: allLessons.length,
      modulesTotal: allModules.length,
      lessonsDone: lessonsDone,
      progress: allLessons.length ? Math.round((lessonsDone / allLessons.length) * 100) : 0,
      lastViewedAt: lastViewedAt,
      nextLessonId: nextLesson ? nextLesson.id : null
    };
  }

  var courses = {
    purchased: function (studentId) {
      var id = studentId || curId();
      var list = read(LS_COURSES, []).filter(function (c) {
        return c.enrollments && c.enrollments[id];
      }).map(function (c) {
        var s = courseLmsStats(c.id, id);
        return { id: c.id, title: c.title, teacher: c.teacher, gradient: c.gradient,
          lessonsDone: s.lessonsDone,
          lessonsTotal: s.lessonsTotal || c.lessonsTotal || 0,
          modulesTotal: s.modulesTotal,
          progress: s.progress, lastViewedAt: s.lastViewedAt, nextLessonId: s.nextLessonId };
      });
      return delay(list);
    },
    catalog: function (studentId) {
      var id = studentId || curId();
      var allLessons = read(LS_LESSONS, []);
      var list = read(LS_COURSES, []).filter(function (c) { return c.published; }).map(function (c) {
        var n = allLessons.filter(function (l) { return l.courseId === c.id; }).length;
        return { id: c.id, title: c.title, teacher: c.teacher, price: c.price,
          lessonsTotal: n || c.lessonsTotal || 0, gradient: c.gradient,
          owned: !!(c.enrollments && c.enrollments[id]) };
      });
      return delay(list);
    },
    buy: function (courseId, studentId) {
      var id = studentId || curId();
      var all = read(LS_COURSES, []);
      var course = all.filter(function (c) { return c.id === courseId; })[0];
      if (!course) return fail('Курс не найден');
      if (course.enrollments && course.enrollments[id]) return fail('Курс уже приобретён');
      return processCharge({ type: 'course', courseId: courseId, amount: course.price }).then(function () {
        course.enrollments = course.enrollments || {};
        course.enrollments[id] = {};
        write(LS_COURSES, all);
        addPayment({ studentId: id, amount: course.price, purpose: 'Онлайн-курс «' + course.title + '»', status: 'paid' });
        return course;
      });
    },
    courseDetail: function (courseId) {
      var all = read(LS_COURSES, []);
      var course = all.filter(function (c) { return c.id === courseId; })[0];
      if (!course) return fail('Курс не найден');
      var modules = read(LS_MODULES, []).filter(function (m) { return m.courseId === courseId; });
      modules.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var allLessons = read(LS_LESSONS, []).filter(function (l) { return l.courseId === courseId; });
      allLessons.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var result = modules.map(function (m) {
        return { id: m.id, title: m.title, order: m.order,
          lessons: allLessons.filter(function (l) { return l.moduleId === m.id; })
            .map(function (l) { return { id: l.id, title: l.title, order: l.order, type: l.type }; }) };
      });
      return delay({ id: course.id, title: course.title, teacher: course.teacher,
        gradient: course.gradient, modules: result });
    },
    all: function () {
      var allLessons = read(LS_LESSONS, []);
      var allMods = read(LS_MODULES, []);
      var list = read(LS_COURSES, []).map(function (c) {
        var n = allLessons.filter(function (l) { return l.courseId === c.id; }).length;
        var nm = allMods.filter(function (m) { return m.courseId === c.id; }).length;
        return { id: c.id, title: c.title, teacher: c.teacher, price: c.price,
          lessonsTotal: n || c.lessonsTotal || 0, modulesTotal: nm,
          gradient: c.gradient, published: c.published,
          students: c.enrollments ? Object.keys(c.enrollments).length : 0 };
      });
      return delay(list);
    },
    create: function (data) {
      var all = read(LS_COURSES, []);
      var course = { id: uid('c'), title: (data.title || '').trim(), teacher: (data.teacher || '').trim(),
        price: +data.price || 0, lessonsTotal: +data.lessonsTotal || 0,
        gradient: data.gradient || 'linear-gradient(135deg,#1a0a0a,#3d1010)',
        published: data.published !== false, enrollments: {} };
      if (!course.title) return fail('Введите название курса');
      all.push(course); write(LS_COURSES, all);
      return delay(course);
    },
    update: function (id, data) {
      var all = read(LS_COURSES, []);
      var course = all.filter(function (c) { return c.id === id; })[0];
      if (!course) return fail('Курс не найден');
      ['title','teacher','gradient'].forEach(function (k) { if (data[k] != null) course[k] = data[k]; });
      ['price','lessonsTotal'].forEach(function (k) { if (data[k] != null && data[k] !== '') course[k] = +data[k]; });
      if (data.published != null) course.published = !!data.published;
      write(LS_COURSES, all);
      return delay(course);
    },
    remove: function (id) {
      write(LS_COURSES, read(LS_COURSES, []).filter(function (c) { return c.id !== id; }));
      /* also remove related LMS data */
      var lessonIds = read(LS_LESSONS, []).filter(function (l) { return l.courseId === id; }).map(function (l) { return l.id; });
      write(LS_MODULES, read(LS_MODULES, []).filter(function (m) { return m.courseId !== id; }));
      write(LS_LESSONS, read(LS_LESSONS, []).filter(function (l) { return l.courseId !== id; }));
      write(LS_PROGRESS, read(LS_PROGRESS, []).filter(function (p) { return lessonIds.indexOf(p.lessonId) === -1; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     LMS — modules, lessons, progress  [v0.4]
     ================================================================= */
  var lms = {
    modules: {
      list: function (courseId) {
        var mods = read(LS_MODULES, []).filter(function (m) { return m.courseId === courseId; });
        mods.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        return delay(mods.map(function (m) { return JSON.parse(JSON.stringify(m)); }));
      },
      create: function (data) {
        if (!data.courseId) return fail('Укажите курс');
        if (!data.title || !data.title.trim()) return fail('Введите название модуля');
        var mods = read(LS_MODULES, []);
        var maxOrd = mods.filter(function (m) { return m.courseId === data.courseId; })
          .reduce(function (mx, m) { return Math.max(mx, m.order || 0); }, 0);
        var mod = { id: uid('mod'), courseId: data.courseId, title: data.title.trim(),
          order: data.order != null ? +data.order : maxOrd + 1 };
        mods.push(mod); write(LS_MODULES, mods);
        return delay(mod);
      },
      update: function (id, data) {
        var mods = read(LS_MODULES, []);
        var mod = mods.filter(function (m) { return m.id === id; })[0];
        if (!mod) return fail('Модуль не найден');
        if (data.title != null) mod.title = data.title.trim();
        if (data.order != null) mod.order = +data.order;
        write(LS_MODULES, mods);
        return delay(mod);
      },
      remove: function (id) {
        var lessonIds = read(LS_LESSONS, []).filter(function (l) { return l.moduleId === id; }).map(function (l) { return l.id; });
        write(LS_LESSONS, read(LS_LESSONS, []).filter(function (l) { return l.moduleId !== id; }));
        write(LS_PROGRESS, read(LS_PROGRESS, []).filter(function (p) { return lessonIds.indexOf(p.lessonId) === -1; }));
        write(LS_MODULES, read(LS_MODULES, []).filter(function (m) { return m.id !== id; }));
        return delay({ ok: true });
      }
    },
    lessons: {
      list: function (moduleId) {
        var lessons = read(LS_LESSONS, []).filter(function (l) { return l.moduleId === moduleId; });
        lessons.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        return delay(lessons.map(function (l) {
          return { id: l.id, moduleId: l.moduleId, courseId: l.courseId, title: l.title, order: l.order, type: l.type };
        }));
      },
      get: function (id) {
        var lesson = read(LS_LESSONS, []).filter(function (l) { return l.id === id; })[0];
        if (!lesson) return fail('Урок не найден');
        return delay(JSON.parse(JSON.stringify(lesson)));
      },
      create: function (data) {
        if (!data.moduleId) return fail('Укажите модуль');
        if (!data.title || !data.title.trim()) return fail('Введите название урока');
        var lessons = read(LS_LESSONS, []);
        var maxOrd = lessons.filter(function (l) { return l.moduleId === data.moduleId; })
          .reduce(function (mx, l) { return Math.max(mx, l.order || 0); }, 0);
        var mod = read(LS_MODULES, []).filter(function (m) { return m.id === data.moduleId; })[0];
        var lesson = { id: uid('les'), moduleId: data.moduleId,
          courseId: (mod && mod.courseId) || data.courseId || '',
          title: data.title.trim(), order: data.order != null ? +data.order : maxOrd + 1,
          type: data.type || 'text',
          content: { body: data.contentBody || '', title: data.contentTitle || '',
            caption: data.contentCaption || '', filename: data.contentFilename || '',
            label: data.contentLabel || '' },
          description: data.description || '' };
        lessons.push(lesson); write(LS_LESSONS, lessons);
        return delay(lesson);
      },
      update: function (id, data) {
        var lessons = read(LS_LESSONS, []);
        var lesson = lessons.filter(function (l) { return l.id === id; })[0];
        if (!lesson) return fail('Урок не найден');
        ['title','type','description'].forEach(function (k) { if (data[k] != null) lesson[k] = data[k]; });
        if (data.order != null) lesson.order = +data.order;
        if (!lesson.content) lesson.content = {};
        if (data.contentBody     != null) lesson.content.body     = data.contentBody;
        if (data.contentTitle    != null) lesson.content.title    = data.contentTitle;
        if (data.contentCaption  != null) lesson.content.caption  = data.contentCaption;
        if (data.contentFilename != null) lesson.content.filename = data.contentFilename;
        if (data.contentLabel    != null) lesson.content.label    = data.contentLabel;
        write(LS_LESSONS, lessons);
        return delay(lesson);
      },
      remove: function (id) {
        write(LS_LESSONS, read(LS_LESSONS, []).filter(function (l) { return l.id !== id; }));
        write(LS_PROGRESS, read(LS_PROGRESS, []).filter(function (p) { return p.lessonId !== id; }));
        return delay({ ok: true });
      }
    },
    progress: {
      list: function (courseId, studentId) {
        var id = studentId || curId();
        return delay(read(LS_PROGRESS, [])
          .filter(function (p) { return p.studentId === id && p.courseId === courseId; })
          .map(function (p) { return p.lessonId; }));
      },
      mark: function (lessonId) {
        var id = curId();
        if (!id) return fail('Не авторизован');
        var lesson = read(LS_LESSONS, []).filter(function (l) { return l.id === lessonId; })[0];
        if (!lesson) return fail('Урок не найден');
        var progress = read(LS_PROGRESS, []);
        if (progress.some(function (p) { return p.studentId === id && p.lessonId === lessonId; }))
          return delay({ ok: true, already: true });
        progress.push({ id: uid('prg'), studentId: id, lessonId: lessonId,
          courseId: lesson.courseId, completedAt: ymd(new Date()) });
        write(LS_PROGRESS, progress);
        return delay({ ok: true });
      }
    }
  };

  /* =================================================================
     NOTIFICATIONS
     ================================================================= */
  var notifications = {
    list: function (studentId) {
      var id = studentId || curId();
      var out = [];
      var active = activeSubFor(id);
      if (active) {
        if (active.lessonsLeft < 3) {
          out.push({ level: 'warning', title: 'Осталось мало занятий',
            text: 'По абонементу «' + active.name + '» осталось ' + active.lessonsLeft +
              ' ' + plural(active.lessonsLeft, 'занятие', 'занятия', 'занятий') + '.',
            action: { label: 'Продлить', href: 'shop.html' } });
        }
        var left = daysUntil(active.endDate);
        if (left >= 0 && left < 7) {
          out.push({ level: 'warning', title: 'Абонемент скоро закончится',
            text: 'Срок «' + active.name + '» истекает через ' + left +
              ' ' + plural(left, 'день', 'дня', 'дней') + '.',
            action: { label: 'Продлить', href: 'shop.html' } });
        }
      }
      var unpaid = read(LS_PAYMENTS, []).filter(function (p) {
        return p.studentId === id && p.status === 'pending';
      });
      if (unpaid.length) {
        out.push({ level: 'danger', title: 'Есть неоплаченные услуги',
          text: 'Ожидают оплаты: ' + unpaid.length + ' ' +
            plural(unpaid.length, 'платёж', 'платежа', 'платежей') + '.',
          action: { label: 'История платежей', href: 'payments.html' } });
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
     ADMIN
     ================================================================= */
  var admin = {
    students: function (query) {
      var q = norm(query);
      var subs = read(LS_SUBS, []);
      var pays = read(LS_PAYMENTS, []);
      var list = read(LS_USERS, []).filter(function (u) { return u.role === 'student'; }).map(function (u) {
        var active = subs.filter(function (s) { return s.studentId === u.id && s.status === 'active'; })[0];
        var pending = pays.some(function (p) { return p.studentId === u.id && p.status === 'pending'; });
        return { id: u.id, name: u.name, email: u.email, phone: u.phone,
          subscription: active ? active.name : null, lessonsLeft: active ? active.lessonsLeft : null,
          paymentStatus: pending ? 'pending' : 'paid' };
      });
      if (q) {
        list = list.filter(function (s) {
          return norm(s.name).indexOf(q) !== -1 || norm(s.email).indexOf(q) !== -1 || norm(s.phone).indexOf(q) !== -1;
        });
      }
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
      return delay(list);
    },
    student: function (id) {
      var u = read(LS_USERS, []).filter(function (x) { return x.id === id; })[0];
      if (!u) return fail('Ученик не найден');
      var subs = read(LS_SUBS, []).filter(function (s) { return s.studentId === id; });
      subs.sort(function (a, b) { return parseYmd(b.purchaseDate) - parseYmd(a.purchaseDate); });
      var pays = read(LS_PAYMENTS, []).filter(function (p) { return p.studentId === id; });
      pays.sort(function (a, b) { return parseYmd(b.date) - parseYmd(a.date); });
      var crs = read(LS_COURSES, []).filter(function (c) { return c.enrollments && c.enrollments[id]; })
        .map(function (c) {
          var s = courseLmsStats(c.id, id);
          return { id: c.id, title: c.title, progress: s.progress,
            lessonsDone: s.lessonsDone, lessonsTotal: s.lessonsTotal };
        });
      return delay({ user: publicUser(u), subscriptions: subs, payments: pays, courses: crs });
    },
    studentOptions: function () {
      var list = read(LS_USERS, []).filter(function (u) { return u.role === 'student'; })
        .map(function (u) { return { id: u.id, name: u.name }; });
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
      return delay(list);
    }
  };

  /* =================================================================
     RESERVED NAMESPACES — future versions
     ================================================================= */
  var parent      = { children: function () { return fail('Родительский кабинет появится в следующей версии'); } };
  var attendance  = { list:     function () { return fail('Учёт посещаемости появится в следующей версии'); } };
  var homework    = { list:     function () { return fail('Домашние задания появятся в следующей версии'); } };
  var certificates= { list:    function () { return fail('Сертификаты появятся в следующей версии'); } };
  var tests       = { list:    function () { return fail('Тесты появятся в следующей версии'); } };      /* v0.5 */
  var comments    = { list:    function () { return fail('Комментарии появятся в следующей версии'); } }; /* v0.5 */

  global.API = {
    auth: auth, student: student, schedule: schedule,
    subscriptions: subscriptions, payments: payments,
    courses: courses, lms: lms, notifications: notifications, admin: admin,
    parent: parent, attendance: attendance, homework: homework,
    certificates: certificates, tests: tests, comments: comments
  };
})(window);
