/* =====================================================================
   MOCK API LAYER — Shpigotskiy Art Space (v0.6)
   ---------------------------------------------------------------------
   Centralised data access. Every page talks to window.API.* — swap
   methods for real fetch() calls when a backend exists.

   localStorage keys:
     sas_users          — users (student / parent / admin) [v0.5: parent]
     sas_session        — current session
     sas_subscriptions  — subscriptions   [v0.3]
     sas_payments       — payments        [v0.3]
     sas_courses        — course catalogue + enrolments [v0.3]
     sas_lms_modules    — course modules  [v0.4]
     sas_lms_lessons    — lessons         [v0.4]
     sas_lms_progress   — lesson progress [v0.4]
     sas_academics      — per-student direction/teacher/level [v0.5]
     sas_attendance     — attendance records   [v0.5]
     sas_homework       — homework + submissions [v0.5]
     sas_certificates   — certificates     [v0.5]
     sas_achievements   — achievements     [v0.5]
     sas_teacher_notes  — teacher comments about students [v0.5]
     sas_notifications  — notification center feed   [v0.6]
     sas_events         — events / concerts / exhibitions / masterclasses [v0.6]
     sas_portfolio      — student digital portfolio   [v0.6]
     sas_transactions   — payment transaction log      [v0.6]

   Integration points (architecture-ready, not wired to live services):
     payment gateways  — PAYMENT_GATEWAYS + processCharge(): universal
                         layer; add a provider object to plug in a real PSP.
     notify()          — persists an in-app notification AND fans out to the
                         enabled external channels (Telegram / push / email /
                         SMS) via dispatchExternal(); channels are off by
                         default until a real backend is connected.
     auth.telegram*    — Telegram login / account linking scaffolding.
   Reserved namespaces (return "next version"): tests, gamification,
     wallet, ratings, seasons. The shop is live; its catalogue is reserved
     for the future in-app currency.
   ===================================================================== */
(function (global) {
  'use strict';

  var VERSION = '0.9';

  var LS_USERS    = 'sas_users';
  var LS_SESSION  = 'sas_session';
  var LS_SUBS     = 'sas_subscriptions';
  var LS_PAYMENTS = 'sas_payments';
  var LS_COURSES  = 'sas_courses';
  var LS_MODULES  = 'sas_lms_modules';
  var LS_LESSONS  = 'sas_lms_lessons';
  var LS_PROGRESS = 'sas_lms_progress';
  var LS_ACADEMICS= 'sas_academics';
  var LS_ATTEND   = 'sas_attendance';
  var LS_HOMEWORK = 'sas_homework';
  var LS_CERTS    = 'sas_certificates';
  var LS_ACHIEVE  = 'sas_achievements';
  var LS_TNOTES   = 'sas_teacher_notes';
  var LS_NOTICES  = 'sas_notifications';
  var LS_EVENTS   = 'sas_events';
  var LS_PORTFOLIO= 'sas_portfolio';
  var LS_TXN      = 'sas_transactions';
  var LS_CART       = 'sas_cart';
  var LS_ORDERS     = 'sas_orders';
  var LS_LEADS      = 'sas_leads';
  var LS_TRIALS     = 'sas_trials';
  var LS_SKILL_MAP  = 'sas_skill_map';
  var LS_CHURN      = 'sas_churn';
  var LS_BROADCASTS = 'sas_broadcasts';
  var LS_SCHEDULE_SLOTS = 'sas_schedule_slots';

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
  function defaultPrefs() {
    return { lessons: true, homework: true, comments: true, subscription: true, events: true };
  }
  function publicUser(u) {
    if (!u) return null;
    var out = { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
    if (u.role === 'parent') out.childrenIds = (u.childrenIds || []).slice();
    out.telegram = u.telegram ? { linked: true, username: u.telegram.username || '', chatId: u.telegram.chatId || '' }
                              : { linked: false, username: '', chatId: '' };
    out.prefs = Object.assign(defaultPrefs(), u.prefs || {});
    return out;
  }
  function matches(u, login) { return norm(u.email) === login || norm(u.phone) === login; }
  function curId() { var u = auth.current(); return u ? u.id : null; }
  function userName(id) {
    var u = read(LS_USERS, []).filter(function (x) { return x.id === id; })[0];
    return u ? u.name : '—';
  }

  /* =================================================================
     SEED DATA
     ================================================================= */
  var DEMO_USER = {
    id: 'stu-demo', name: 'Алина Ким',
    email: 'demo@shpigotskiy.art', phone: '+7 777 123-45-67',
    password: 'demo1234', role: 'student'
  };
  var DEMO_CHILD2 = {
    id: 'stu-max', name: 'Максим Ким',
    email: 'max@shpigotskiy.art', phone: '+7 777 123-45-68',
    password: 'demo1234', role: 'student'
  };
  var PARENT_USER = {
    id: 'par-demo', name: 'Елена Ким',
    email: 'parent@shpigotskiy.art', phone: '+7 777 222-33-44',
    password: 'parent1234', role: 'parent', childrenIds: ['stu-demo', 'stu-max']
  };
  var ADMIN_USER = {
    id: 'adm-1', name: 'Антон Шпигоцкий',
    email: 'admin@shpigotskiy.art', phone: '+7 777 000-00-00',
    password: 'admin1234', role: 'admin'
  };
  /* Teacher demo accounts — v0.7 */
  var TEACHER_USER = {
    id: 'tch-1', name: 'Антон Шпигоцкий',
    email: 'teacher@shpigotskiy.art', phone: '+7 777 100-00-01',
    password: 'teacher1234', role: 'teacher'
  };
  var TEACHER_USER2 = {
    id: 'tch-2', name: 'Мария Лебедева',
    email: 'teacher2@shpigotskiy.art', phone: '+7 777 100-00-02',
    password: 'teacher1234', role: 'teacher'
  };

  /* Shop catalogue — v0.7 */
  var GIFT_CERTS = [
    { id: 'gc-5000',  name: 'Подарочный сертификат 5 000 ₸',  value: 5000,  price: 5000,
      description: 'Универсальный подарок — на занятия, абонемент или онлайн-курс.' },
    { id: 'gc-10000', name: 'Подарочный сертификат 10 000 ₸', value: 10000, price: 10000,
      description: 'Отличный подарок для любителей музыки, пения или живописи.' },
    { id: 'gc-20000', name: 'Подарочный сертификат 20 000 ₸', value: 20000, price: 20000,
      description: 'Максимальный сертификат — покроет полный онлайн-курс.' }
  ];
  var INTENSIVES = [
    { id: 'int-guitar', name: 'Интенсив «Гитара за 5 дней»',   direction: 'Гитара',
      lessons: 10, durationDays: 5, price: 25000,
      description: '10 занятий за 5 дней — ускоренный старт для начинающих гитаристов.' },
    { id: 'int-vocal',  name: 'Интенсив «Вокал: базовый курс»', direction: 'Вокал',
      lessons: 8,  durationDays: 4, price: 22000,
      description: 'Базовые техники пения и постановка голоса за 4 дня.' },
    { id: 'int-paint',  name: 'Интенсив «Акварель за выходные»', direction: 'Живопись',
      lessons: 6,  durationDays: 2, price: 18000,
      description: 'Быстрый старт в акварели — от нуля до первого этюда за два дня.' }
  ];

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

  /* ---- v0.5 seeds ---- */
  function seedAcademics() {
    return {
      'stu-demo': { direction: 'Гитара', teacher: 'Антон Шпигоцкий', level: 'Базовый уровень · 1 год обучения' },
      'stu-max':  { direction: 'Вокал',  teacher: 'Мария Лебедева',   level: 'Начальный уровень · 4 месяца' }
    };
  }

  function seedAttendance() {
    var now = new Date();
    var rec = [];
    /* stu-demo — Гитара, ~6 недель занятий 2 раза в неделю */
    [-40,-38,-33,-31,-26,-24,-19,-17,-12,-10,-5,-3].forEach(function (d, i) {
      var status = i === 3 ? 'excused' : (i === 8 ? 'unexcused' : 'present');
      rec.push({ id: 'att-demo-' + i, studentId: 'stu-demo', date: ymd(addDays(now, d)),
        direction: 'Гитара', status: status });
    });
    /* stu-max — Вокал */
    [-28,-21,-14,-7,-2].forEach(function (d, i) {
      rec.push({ id: 'att-max-' + i, studentId: 'stu-max', date: ymd(addDays(now, d)),
        direction: 'Вокал', status: i === 2 ? 'unexcused' : 'present' });
    });
    return rec;
  }

  function seedHomework() {
    var now = new Date();
    return [
      { id: 'hw-1', studentId: 'stu-demo', direction: 'Гитара', teacher: 'Антон Шпигоцкий',
        title: 'Отработка перехода Am → Em',
        description: 'Записать видео плавной смены аккордов Am и Em в темпе 60 BPM — не менее 10 повторов без остановки.',
        assignedDate: ymd(addDays(now, -14)), dueDate: ymd(addDays(now, -7)),
        materials: [{ name: 'am-em-shema.pdf' }], status: 'reviewed',
        submission: { comment: 'Записал, местами сбивался ритм.', files: [{ name: 'perehod.mp4' }], submittedAt: ymd(addDays(now, -8)) },
        review: { comment: 'Хорошая работа! Темп держишь увереннее. Поработай над чёткостью последнего удара.', reviewedAt: ymd(addDays(now, -6)) } },
      { id: 'hw-2', studentId: 'stu-demo', direction: 'Гитара', teacher: 'Антон Шпигоцкий',
        title: 'Бой «шестёрка»',
        description: 'Освоить ритмический рисунок «шестёрка» и сыграть его под метроном 70 BPM.',
        assignedDate: ymd(addDays(now, -5)), dueDate: ymd(addDays(now, 2)),
        materials: [{ name: 'boy-shesterka.pdf' }], status: 'submitted',
        submission: { comment: 'Старался держать ровный ритм.', files: [{ name: 'boy.mp4' }], submittedAt: ymd(addDays(now, -1)) },
        review: null },
      { id: 'hw-3', studentId: 'stu-demo', direction: 'Гитара', teacher: 'Антон Шпигоцкий',
        title: 'Разбор первой песни',
        description: 'Разобрать аккорды первой песни по табулатуре из урока и прислать аудиозапись.',
        assignedDate: ymd(addDays(now, -2)), dueDate: ymd(addDays(now, 6)),
        materials: [{ name: 'pervaya-pesnya-tabs.pdf' }], status: 'assigned',
        submission: null, review: null },
      { id: 'hw-4', studentId: 'stu-demo', direction: 'Гитара', teacher: 'Антон Шпигоцкий',
        title: 'Гамма до мажор',
        description: 'Сыграть гамму C-dur в две октавы восходяще и нисходяще под метроном.',
        assignedDate: ymd(addDays(now, -20)), dueDate: ymd(addDays(now, -13)),
        materials: [], status: 'revision',
        submission: { comment: 'Вот моя запись.', files: [{ name: 'gamma.mp4' }], submittedAt: ymd(addDays(now, -15)) },
        review: { comment: 'Пальцы ставишь верно, но нужно ровнее по длительности. Перезапиши под метроном 50 BPM.', reviewedAt: ymd(addDays(now, -13)) } },
      { id: 'hw-5', studentId: 'stu-max', direction: 'Вокал', teacher: 'Мария Лебедева',
        title: 'Дыхательные упражнения',
        description: 'Выполнять комплекс диафрагмального дыхания 10 минут в день. Записать одно занятие.',
        assignedDate: ymd(addDays(now, -3)), dueDate: ymd(addDays(now, 4)),
        materials: [{ name: 'dyhanie.pdf' }], status: 'assigned',
        submission: null, review: null }
    ];
  }

  function seedCertificates() {
    var now = new Date();
    return [
      { id: 'cert-1', studentId: 'stu-demo', title: 'Завершение курса «Акварель с нуля»',
        date: ymd(addDays(now, -12)), description: 'Успешно пройден онлайн-курс, выполнены все практические задания.',
        gradient: 'linear-gradient(135deg,#0d0d1a,#151530)' },
      { id: 'cert-2', studentId: 'stu-demo', title: 'Участник отчётного концерта',
        date: ymd(addDays(now, -45)), description: 'За участие в зимнем отчётном концерте студии.',
        gradient: 'linear-gradient(135deg,#1a0a0a,#3d1010)' },
      { id: 'cert-3', studentId: 'stu-max', title: 'Первое публичное выступление',
        date: ymd(addDays(now, -20)), description: 'За смелость и первый выход на сцену.',
        gradient: 'linear-gradient(135deg,#0d1a0d,#0d3020)' }
    ];
  }

  function seedAchievements() {
    var now = new Date();
    return [
      { id: 'ach-1', studentId: 'stu-demo', icon: 'concert', title: 'Первый концерт',
        date: ymd(addDays(now, -45)), description: 'Первое выступление на сцене студии.' },
      { id: 'ach-2', studentId: 'stu-demo', icon: 'calendar', title: 'Месяц без пропусков',
        date: ymd(addDays(now, -10)), description: '30 дней занятий без единого пропуска.' },
      { id: 'ach-3', studentId: 'stu-demo', icon: 'course', title: 'Курс завершён',
        date: ymd(addDays(now, -12)), description: 'Полностью пройден курс «Акварель с нуля».' },
      { id: 'ach-4', studentId: 'stu-max', icon: 'stage', title: 'Первое выступление',
        date: ymd(addDays(now, -20)), description: 'Дебют на отчётном концерте.' }
    ];
  }

  function seedTeacherNotes() {
    var now = new Date();
    return [
      { id: 'tn-1', studentId: 'stu-demo', type: 'progress', author: 'Антон Шпигоцкий',
        text: 'Заметный прогресс в ритмике за последний месяц — смена аккордов стала увереннее.',
        date: ymd(addDays(now, -6)) },
      { id: 'tn-2', studentId: 'stu-demo', type: 'recommendation', author: 'Антон Шпигоцкий',
        text: 'Рекомендую ежедневно уделять 10 минут упражнению на переходы между аккордами.',
        date: ymd(addDays(now, -6)) },
      { id: 'tn-3', studentId: 'stu-demo', type: 'remark', author: 'Антон Шпигоцкий',
        text: 'Были два пропуска подряд — важно не терять регулярность занятий.',
        date: ymd(addDays(now, -18)) },
      { id: 'tn-4', studentId: 'stu-max', type: 'progress', author: 'Мария Лебедева',
        text: 'Хорошо работает над дыханием, голос звучит свободнее.',
        date: ymd(addDays(now, -9)) }
    ];
  }

  function seedEvents() {
    var now = new Date();
    return [
      { id: 'ev-1', type: 'concert', title: 'Отчётный концерт студии',
        date: ymd(addDays(now, 9)), time: '18:00', place: 'Большой зал',
        description: 'Выступления учеников всех направлений. Вход свободный.' },
      { id: 'ev-2', type: 'exhibition', title: 'Выставка детских работ «Краски весны»',
        date: ymd(addDays(now, 16)), time: '12:00', place: 'Галерея, 1 этаж',
        description: 'Лучшие живописные и графические работы за сезон.' },
      { id: 'ev-3', type: 'masterclass', title: 'Мастер-класс по импровизации на гитаре',
        date: ymd(addDays(now, 4)), time: '19:00', place: 'Зал 1',
        description: 'Открытый мастер-класс Антона Шпигоцкого.' },
      { id: 'ev-4', type: 'performance', title: 'Спектакль театральной студии «Маленький принц»',
        date: ymd(addDays(now, 23)), time: '17:00', place: 'Большой зал',
        description: 'Премьера учебного спектакля.' }
    ];
  }

  function seedPortfolio() {
    var now = new Date();
    return [
      { id: 'pf-1', studentId: 'stu-demo', kind: 'video', title: 'Выступление на концерте',
        note: 'Кавер «Город которого нет», апрель.', addedBy: 'Антон Шпигоцкий',
        date: ymd(addDays(now, -40)) },
      { id: 'pf-2', studentId: 'stu-demo', kind: 'audio', title: 'Запись этюда №3',
        note: 'Домашняя запись, чистое исполнение.', addedBy: 'Антон Шпигоцкий',
        date: ymd(addDays(now, -14)) },
      { id: 'pf-3', studentId: 'stu-demo', kind: 'photo', title: 'Фото с открытого урока',
        note: '', addedBy: 'Администратор', date: ymd(addDays(now, -8)) },
      { id: 'pf-4', studentId: 'stu-demo', kind: 'diploma', title: 'Диплом за участие в конкурсе',
        note: 'Городской конкурс юных исполнителей, 2 место.', addedBy: 'Администратор',
        date: ymd(addDays(now, -30)) },
      { id: 'pf-5', studentId: 'stu-max', kind: 'video', title: 'Дебютное выступление',
        note: 'Отчётный концерт, вокал.', addedBy: 'Мария Лебедева', date: ymd(addDays(now, -20)) }
    ];
  }

  function seedNotices() {
    var now = new Date();
    function rec(o) {
      return { id: o.id, userId: o.userId, type: o.type, title: o.title, text: o.text,
        href: o.href || null, date: o.date, read: !!o.read, archived: false };
    }
    return [
      rec({ id: 'nt-1', userId: 'stu-demo', type: 'homework', title: 'Новое домашнее задание',
        text: 'Этюд №5: отработать переходы между аккордами Am–Dm–E.',
        href: 'homework.html', date: ymd(addDays(now, -1)) }),
      rec({ id: 'nt-2', userId: 'stu-demo', type: 'comment', title: 'Комментарий преподавателя',
        text: 'Антон Шпигоцкий оставил рекомендацию в вашем профиле развития.',
        href: 'progress.html', date: ymd(addDays(now, -3)) }),
      rec({ id: 'nt-3', userId: 'stu-demo', type: 'lesson', title: 'Напоминание о занятии',
        text: 'Завтра в 17:00 — гитара, Зал 1.', href: 'schedule.html', date: ymd(addDays(now, -4)), read: true }),
      rec({ id: 'nt-4', userId: 'stu-demo', type: 'event', title: 'Скоро отчётный концерт',
        text: 'Отчётный концерт студии состоится через неделю. Не пропустите!',
        href: 'schedule.html', date: ymd(addDays(now, -2)) }),
      rec({ id: 'nt-5', userId: 'stu-demo', type: 'subscription', title: 'Абонемент заканчивается',
        text: 'По абонементу «Гитара · Безлимит-8» осталось 2 занятия.',
        href: 'shop.html', date: ymd(addDays(now, -5)), read: true })
    ];
  }

  /* ---- CRM seed data ---- */
  var LEAD_STATUSES = ['new','processing','no_answer','trial_scheduled','trial_done','purchased','active','lost'];
  var LEAD_SOURCES  = ['trial','course','callback','event','store'];
  var TRIAL_STATUSES = ['scheduled','done','cancelled','no_show'];
  var DIRECTIONS    = ['Гитара','Вокал','Живопись','Актёрское мастерство','Современный танец'];

  var SKILL_TEMPLATES = {
    'Гитара':                ['Посадка и постановка','Аккорды','Перебор','Бой','Баррэ','Импровизация','Сценическое выступление'],
    'Вокал':                 ['Дыхание','Интонация','Ритм','Диапазон','Сценическая подача'],
    'Живопись':              ['Композиция','Работа с цветом','Перспектива','Работа с материалами','Детализация'],
    'Актёрское мастерство':  ['Сценическая речь','Пластика','Работа с партнёром','Импровизация','Сценическое присутствие'],
    'Современный танец':     ['Техника движения','Ритм и музыкальность','Пространство','Партнёрство','Хореография']
  };

  function seedLeads() {
    var now = new Date();
    return [
      { id: 'ld-1', name: 'Наталья Иванова', phone: '+7 701 111 2233', email: 'ivanova@example.com',
        source: 'trial', status: 'new', createdAt: ymd(addDays(now, -1)),
        comments: [{ id: 'lc-1', text: 'Интересует гитара для дочери 9 лет', author: 'Система', date: ymd(addDays(now, -1)) }] },
      { id: 'ld-2', name: 'Дмитрий Сейткали', phone: '+7 702 222 3344', email: 'seit@example.com',
        source: 'callback', status: 'processing', createdAt: ymd(addDays(now, -3)),
        comments: [{ id: 'lc-2', text: 'Перезвонить после 18:00', author: 'Администратор', date: ymd(addDays(now, -2)) }] },
      { id: 'ld-3', name: 'Карина Ахметова', phone: '+7 705 333 4455', email: '',
        source: 'event', status: 'trial_scheduled', createdAt: ymd(addDays(now, -5)),
        comments: [] },
      { id: 'ld-4', name: 'Сергей Попов', phone: '+7 707 444 5566', email: 'popov@example.com',
        source: 'course', status: 'trial_done', createdAt: ymd(addDays(now, -8)),
        comments: [{ id: 'lc-3', text: 'Занятие прошло хорошо, думает', author: 'Администратор', date: ymd(addDays(now, -4)) }] },
      { id: 'ld-5', name: 'Алия Жумаева', phone: '+7 708 555 6677', email: 'aliya@example.com',
        source: 'trial', status: 'purchased', createdAt: ymd(addDays(now, -14)),
        comments: [] },
      { id: 'ld-6', name: 'Руслан Бекова', phone: '+7 701 666 7788', email: '',
        source: 'store', status: 'lost', createdAt: ymd(addDays(now, -20)),
        comments: [{ id: 'lc-4', text: 'Сказал что дорого', author: 'Администратор', date: ymd(addDays(now, -15)) }] },
      { id: 'ld-7', name: 'Анна Петрова', phone: '+7 702 777 8899', email: 'anna@example.com',
        source: 'trial', status: 'active', createdAt: ymd(addDays(now, -30)),
        comments: [] },
      { id: 'ld-8', name: 'Тимур Карибаев', phone: '+7 705 888 9900', email: '',
        source: 'callback', status: 'no_answer', createdAt: ymd(addDays(now, -2)),
        comments: [{ id: 'lc-5', text: 'Не берёт трубку, попробовать позже', author: 'Администратор', date: ymd(addDays(now, -1)) }] }
    ];
  }

  function seedTrials() {
    var now = new Date();
    return [
      { id: 'tr-1', leadId: 'ld-3', name: 'Карина Ахметова', phone: '+7 705 333 4455',
        date: ymd(addDays(now, 2)), time: '15:00', teacher: 'Ирина Волошина',
        direction: 'Вокал', adminComment: 'Первый опыт пения', status: 'scheduled',
        result: null, teacherComment: '', recommendation: '' },
      { id: 'tr-2', leadId: 'ld-4', name: 'Сергей Попов', phone: '+7 707 444 5566',
        date: ymd(addDays(now, -4)), time: '17:00', teacher: 'Антон Шпигоцкий',
        direction: 'Гитара', adminComment: '', status: 'done',
        result: 'converted', teacherComment: 'Хороший слух, легко схватывает. Рекомендую записаться.',
        recommendation: 'Абонемент 8 занятий — гитара' },
      { id: 'tr-3', leadId: 'ld-5', name: 'Алия Жумаева', phone: '+7 708 555 6677',
        date: ymd(addDays(now, -12)), time: '11:00', teacher: 'Мария Лебедева',
        direction: 'Современный танец', adminComment: 'Была на мастер-классе', status: 'done',
        result: 'converted', teacherComment: 'Отличная пластика. Купила абонемент на месте.',
        recommendation: 'Абонемент 12 занятий — танец' },
      { id: 'tr-4', leadId: 'ld-2', name: 'Дмитрий Сейткали', phone: '+7 702 222 3344',
        date: ymd(addDays(now, 5)), time: '10:00', teacher: 'Антон Шпигоцкий',
        direction: 'Гитара', adminComment: 'Взрослый, с нуля', status: 'scheduled',
        result: null, teacherComment: '', recommendation: '' }
    ];
  }

  function seedSkillMap() {
    return {
      'stu-demo': {
        'Гитара': { 'Посадка и постановка': 5, 'Аккорды': 4, 'Перебор': 3, 'Бой': 3, 'Баррэ': 2, 'Импровизация': 1, 'Сценическое выступление': 3 }
      },
      'stu-max': {
        'Вокал': { 'Дыхание': 4, 'Интонация': 3, 'Ритм': 4, 'Диапазон': 2, 'Сценическая подача': 3 }
      }
    };
  }

  function seedBroadcasts() {
    var now = new Date();
    return [
      { id: 'bc-1', subject: 'Напоминание о концерте', body: 'Уважаемые ученики и родители! Отчётный концерт состоится 15 июля в 18:00. Просьба подтвердить участие.',
        recipients: 'student', channels: ['in_app'], template: 'custom', sentAt: ymd(addDays(now, -2)), sentBy: 'Администратор', recipientCount: 12 },
      { id: 'bc-2', subject: 'Изменение расписания', body: 'Занятие в четверг 11 июля переносится с 17:00 на 18:00 в связи с ремонтными работами.',
        recipients: 'all', channels: ['in_app', 'telegram'], template: 'custom', sentAt: ymd(addDays(now, -7)), sentBy: 'Администратор', recipientCount: 18 }
    ];
  }

  var BROADCAST_TEMPLATES = [
    { id: 'tpl-homework', name: 'Напоминание о ДЗ', body: 'Уважаемый ученик! Напоминаем о домашнем задании по направлению {{direction}}. Срок сдачи: {{due}}.' },
    { id: 'tpl-payment',  name: 'Напоминание об оплате', body: 'Уважаемый {{name}}! Ваш абонемент заканчивается через {{days}} дней. Пожалуйста, продлите его заблаговременно.' },
    { id: 'tpl-event',    name: 'Анонс мероприятия', body: 'Уважаемые ученики и родители! Приглашаем вас на {{event}} {{date}}. Место: {{place}}.' },
    { id: 'tpl-trial',    name: 'Подтверждение пробного', body: 'Здравствуйте, {{name}}! Подтверждаем запись на пробное занятие {{date}} в {{time}}. Преподаватель: {{teacher}}.' }
  ];

  (function ensureSeed() {
    var users = read(LS_USERS, null) || [];
    [DEMO_USER, DEMO_CHILD2, PARENT_USER, ADMIN_USER, TEACHER_USER, TEACHER_USER2].forEach(function (seed) {
      if (!users.some(function (u) { return u.id === seed.id; })) users.push(seed);
    });
    write(LS_USERS, users);
    if (!read(LS_SUBS, null))     write(LS_SUBS,     seedSubscriptions());
    if (!read(LS_PAYMENTS, null)) write(LS_PAYMENTS, seedPayments());
    if (!read(LS_COURSES, null))  write(LS_COURSES,  seedCourses());
    if (!read(LS_MODULES, null))  write(LS_MODULES,  seedModules());
    if (!read(LS_LESSONS, null))  write(LS_LESSONS,  seedLessons());
    if (!read(LS_PROGRESS, null)) write(LS_PROGRESS, seedProgress());
    if (!read(LS_ACADEMICS, null))write(LS_ACADEMICS,seedAcademics());
    if (!read(LS_ATTEND, null))   write(LS_ATTEND,   seedAttendance());
    if (!read(LS_HOMEWORK, null)) write(LS_HOMEWORK, seedHomework());
    if (!read(LS_CERTS, null))    write(LS_CERTS,    seedCertificates());
    if (!read(LS_ACHIEVE, null))  write(LS_ACHIEVE,  seedAchievements());
    if (!read(LS_TNOTES, null))   write(LS_TNOTES,   seedTeacherNotes());
    if (!read(LS_EVENTS, null))   write(LS_EVENTS,   seedEvents());
    if (!read(LS_PORTFOLIO, null))write(LS_PORTFOLIO,seedPortfolio());
    if (!read(LS_NOTICES, null))  write(LS_NOTICES,  seedNotices());
    if (!read(LS_LEADS, null))      write(LS_LEADS,      seedLeads());
    if (!read(LS_TRIALS, null))     write(LS_TRIALS,     seedTrials());
    if (!read(LS_SKILL_MAP, null))  write(LS_SKILL_MAP,  seedSkillMap());
    if (!read(LS_BROADCASTS, null)) write(LS_BROADCASTS, seedBroadcasts());
    if (!read(LS_CHURN, null))      write(LS_CHURN,      []);
  })();

  var PLANS = [
    { id: 'plan-g8',    name: 'Гитара · 8 занятий',    direction: 'Гитара',    lessons: 8,  price: 16000, durationDays: 30 },
    { id: 'plan-g12',   name: 'Гитара · 12 занятий',   direction: 'Гитара',    lessons: 12, price: 22000, durationDays: 45 },
    { id: 'plan-v8',    name: 'Вокал · 8 занятий',     direction: 'Вокал',     lessons: 8,  price: 14000, durationDays: 30 },
    { id: 'plan-paint8',name: 'Живопись · 8 занятий',  direction: 'Живопись',  lessons: 8,  price: 12000, durationDays: 30 }
  ];

  /* =================================================================
     UNIVERSAL PAYMENT LAYER  [v0.6]
     -----------------------------------------------------------------
     Business logic never talks to a concrete PSP — it calls
     processCharge(order) which routes to the active gateway. To plug a
     real provider (Kaspi, Stripe, CloudPayments, …) add an object to
     PAYMENT_GATEWAYS with a `charge(order) -> Promise` method and flip
     `active`. Transaction statuses and the transaction log below stay
     unchanged, so nothing in the rest of the app needs editing.

     Transaction status flow:
       pending → processing → succeeded
                            ↘ failed   (error captured on the record)
     ================================================================= */
  var TXN_STATUS = ['pending', 'processing', 'succeeded', 'failed'];

  var PAYMENT_GATEWAYS = {
    /* Built-in mock gateway: always succeeds. Real gateways replace this. */
    mock: {
      id: 'mock', title: 'Демо-оплата', live: false,
      charge: function (order) { return delay({ ok: true, providerRef: uid('ref') }); }
    },
    /* Scaffolding for real providers — disabled until a backend is wired. */
    kaspi:        { id: 'kaspi',        title: 'Kaspi Pay',     live: false, charge: gatewayNotReady },
    cloudpayments:{ id: 'cloudpayments',title: 'CloudPayments', live: false, charge: gatewayNotReady },
    stripe:       { id: 'stripe',       title: 'Stripe',        live: false, charge: gatewayNotReady }
  };
  var ACTIVE_GATEWAY = 'mock';

  function gatewayNotReady() {
    return fail('Платёжный шлюз ещё не подключён. Обратитесь к администратору.');
  }

  function logTransaction(rec) {
    var list = read(LS_TXN, []);
    var txn = { id: uid('txn'), studentId: rec.studentId || curId(),
      gateway: rec.gateway || ACTIVE_GATEWAY, amount: rec.amount || 0,
      purpose: rec.purpose || '', status: rec.status || 'pending',
      providerRef: rec.providerRef || null, error: rec.error || null,
      createdAt: new Date().toISOString() };
    list.push(txn); write(LS_TXN, list);
    return txn;
  }
  function setTxnStatus(id, status, extra) {
    var list = read(LS_TXN, []);
    var t = list.filter(function (x) { return x.id === id; })[0];
    if (t) { t.status = status; if (extra) { for (var k in extra) t[k] = extra[k]; } write(LS_TXN, list); }
    return t;
  }

  /* Routes an order through the active gateway, recording a transaction.
     Resolves with { ok, txn } on success; rejects (and marks the txn
     failed) on a declined / errored charge. */
  function processCharge(order) {
    var gw = PAYMENT_GATEWAYS[ACTIVE_GATEWAY] || PAYMENT_GATEWAYS.mock;
    var txn = logTransaction({ studentId: order.studentId, amount: order.amount,
      purpose: order.purpose || order.type, gateway: gw.id, status: 'processing' });
    return gw.charge(order).then(function (res) {
      setTxnStatus(txn.id, 'succeeded', { providerRef: res && res.providerRef });
      return { ok: true, provider: gw.id, order: order, txn: txn.id };
    }, function (err) {
      setTxnStatus(txn.id, 'failed', { error: err && err.message });
      throw err;
    });
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
    },

    /* ---- account settings  [v0.6] ---- */
    updateProfile: function (data) {
      var users = read(LS_USERS, []);
      var u = users.filter(function (x) { return x.id === curId(); })[0];
      if (!u) return fail('Сессия не найдена');
      var newLogin = norm((data.email != null ? data.email : u.email) || (data.phone != null ? data.phone : u.phone));
      if (!newLogin) return fail('Укажите телефон или email');
      var clash = users.some(function (x) { return x.id !== u.id && matches(x, newLogin); });
      if (clash) return fail('Эти контактные данные уже заняты');
      if (data.name != null) {
        if (!data.name.trim()) return fail('Имя не может быть пустым');
        u.name = data.name.trim();
      }
      if (data.email != null) u.email = data.email.trim();
      if (data.phone != null) u.phone = data.phone.trim();
      // keep the session pointed at the (possibly changed) login
      write(LS_SESSION, { login: norm(u.email || u.phone), at: Date.now() });
      write(LS_USERS, users);
      return delay(publicUser(u));
    },
    changePassword: function (current, next) {
      var users = read(LS_USERS, []);
      var u = users.filter(function (x) { return x.id === curId(); })[0];
      if (!u) return fail('Сессия не найдена');
      if (u.password !== current) return fail('Текущий пароль указан неверно');
      if (!next || next.length < 6) return fail('Новый пароль должен быть не короче 6 символов');
      u.password = next; write(LS_USERS, users);
      return delay({ ok: true });
    },
    prefs: function () {
      var u = read(LS_USERS, []).filter(function (x) { return x.id === curId(); })[0];
      return delay(Object.assign(defaultPrefs(), (u && u.prefs) || {}));
    },
    setPrefs: function (prefs) {
      var users = read(LS_USERS, []);
      var u = users.filter(function (x) { return x.id === curId(); })[0];
      if (!u) return fail('Сессия не найдена');
      u.prefs = Object.assign(defaultPrefs(), u.prefs || {}, prefs || {});
      write(LS_USERS, users);
      return delay(clone(u.prefs));
    },

    /* ---- Telegram login & account linking  [v0.6, scaffolding] ----
       In production, verify Telegram `initData` / login-widget hash on a
       backend, then map the Telegram id to a user. Here we link by the
       already-signed-in account (or match by username) and store the ids. */
    telegramAuth: function (tgUser) {
      // tgUser: { id, username, first_name, ... } from Telegram WebApp/login widget
      var users = read(LS_USERS, []);
      var u = users.filter(function (x) { return x.telegram && x.telegram.chatId === String(tgUser && tgUser.id); })[0];
      if (!u) return fail('Telegram-аккаунт не привязан. Войдите обычным способом и привяжите Telegram в настройках.');
      write(LS_SESSION, { login: norm(u.email || u.phone), at: Date.now() });
      return delay(publicUser(u));
    },
    linkTelegram: function (tgUser) {
      var users = read(LS_USERS, []);
      var u = users.filter(function (x) { return x.id === curId(); })[0];
      if (!u) return fail('Сессия не найдена');
      u.telegram = { chatId: String((tgUser && tgUser.id) || uid('tg')),
        username: (tgUser && tgUser.username) || '' };
      write(LS_USERS, users);
      return delay(publicUser(u));
    },
    unlinkTelegram: function () {
      var users = read(LS_USERS, []);
      var u = users.filter(function (x) { return x.id === curId(); })[0];
      if (!u) return fail('Сессия не найдена');
      delete u.telegram; write(LS_USERS, users);
      return delay(publicUser(u));
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

  function academicFor(id) {
    var map = read(LS_ACADEMICS, {}) || {};
    return map[id] || { direction: 'Гитара', teacher: 'Антон Шпигоцкий', level: 'Базовый уровень' };
  }

  function nextOccurrence(from, direction) {
    var best = null;
    for (var add = 0; add <= 7; add++) {
      var day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + add);
      WEEKLY.forEach(function (slot) {
        if (slot.weekday !== day.getDay()) return;
        if (direction && slot.direction !== direction) return;
        var parts = slot.time.split(':');
        var when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +parts[0], +parts[1]);
        if (when > from && (!best || when < best.when)) best = { when: when, slot: slot };
      });
      if (best) break;
    }
    return best;
  }

  function profileFor(id) {
    var acad = academicFor(id);
    var next = nextOccurrence(new Date(), acad.direction);
    var active = activeSubFor(id);
    var pending = read(LS_PAYMENTS, []).some(function (p) {
      return p.studentId === id && p.status === 'pending';
    });
    return {
      id: id, name: userName(id),
      direction: acad.direction, teacher: acad.teacher, level: acad.level,
      nextLesson: next ? { date: ymd(next.when), time: next.slot.time,
        direction: next.slot.direction, teacher: next.slot.teacher,
        room: next.slot.room, weekday: WEEKDAY_RU[next.when.getDay()] } : null,
      subscription: active,
      lessonsLeft: active ? active.lessonsLeft : 0,
      lessonsTotal: active ? active.lessonsTotal : 0,
      subscriptionUntil: active ? active.endDate : null,
      paymentStatus: pending ? 'pending' : 'paid'
    };
  }

  var student = {
    profile: function (studentId) {
      return delay(profileFor(studentId || curId()));
    },
    weekly: function () {
      return delay(WEEKLY.map(function (s) {
        return { weekday: WEEKDAY_RU[s.weekday], time: s.time,
          direction: s.direction, teacher: s.teacher, room: s.room };
      }));
    },
    development: function (studentId) {
      var id = studentId || curId();
      return delay({
        profile: profileFor(id),
        attendance: attendanceStats(id),
        courses: coursesDoneFor(id),
        certificates: certsFor(id),
        achievements: achievementsFor(id),
        notes: notesFor(id)
      });
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
    },
    /* Available payment methods for the UI. `live:false` ⇒ shown disabled. */
    gateways: function () {
      var out = Object.keys(PAYMENT_GATEWAYS).map(function (k) {
        var g = PAYMENT_GATEWAYS[k];
        return { id: g.id, title: g.title, live: g.live, active: g.id === ACTIVE_GATEWAY };
      });
      return delay(out);
    },
    /* Universal entry point: route any order through the active gateway.
       order: { type, amount, purpose, studentId } */
    pay: function (order) {
      var o = order || {};
      if (!o.amount && o.amount !== 0) return fail('Не указана сумма платежа');
      return processCharge(o).then(function (res) {
        addPayment({ studentId: o.studentId || curId(), amount: o.amount,
          purpose: o.purpose || 'Оплата', status: 'paid' });
        return res;
      });
    },
    /* Transaction log (every charge attempt, success or failure). */
    transactions: function (studentId) {
      var id = studentId || curId();
      var list = read(LS_TXN, []).filter(function (t) { return !id || t.studentId === id; });
      list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      return delay(list.map(function (t) { return JSON.parse(JSON.stringify(t)); }));
    },
    allTransactions: function () {
      var users = read(LS_USERS, []);
      function nameOf(sid) { var u = users.filter(function (x) { return x.id === sid; })[0]; return u ? u.name : '—'; }
      var list = read(LS_TXN, []).map(function (t) {
        var c = JSON.parse(JSON.stringify(t)); c.studentName = nameOf(t.studentId); return c;
      });
      list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
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
    },

    /* ---- Notification center (persistent feed)  [v0.6] ----
       Types: lesson · payment · homework · certificate · achievement · event · comment · subscription */
    feed: function (filter, userId) {
      var id = userId || curId();
      var list = read(LS_NOTICES, []).filter(function (n) { return n.userId === id; });
      if (filter === 'unread')   list = list.filter(function (n) { return !n.read && !n.archived; });
      else if (filter === 'archived') list = list.filter(function (n) { return n.archived; });
      else /* inbox */            list = list.filter(function (n) { return !n.archived; });
      list.sort(byDateDesc('date'));
      return delay(list.map(clone));
    },
    unreadCount: function (userId) {
      var id = userId || curId();
      var n = read(LS_NOTICES, []).filter(function (x) { return x.userId === id && !x.read && !x.archived; }).length;
      return delay(n);
    },
    markRead: function (noticeId) { return setNoticeFlag(noticeId, { read: true }); },
    markUnread: function (noticeId) { return setNoticeFlag(noticeId, { read: false }); },
    archive: function (noticeId) { return setNoticeFlag(noticeId, { archived: true, read: true }); },
    unarchive: function (noticeId) { return setNoticeFlag(noticeId, { archived: false }); },
    markAllRead: function (userId) {
      var id = userId || curId();
      var list = read(LS_NOTICES, []);
      list.forEach(function (n) { if (n.userId === id && !n.archived) n.read = true; });
      write(LS_NOTICES, list);
      return delay({ ok: true });
    },
    remove: function (noticeId) {
      write(LS_NOTICES, read(LS_NOTICES, []).filter(function (n) { return n.id !== noticeId; }));
      return delay({ ok: true });
    }
  };
  function setNoticeFlag(noticeId, flags) {
    var list = read(LS_NOTICES, []);
    var n = list.filter(function (x) { return x.id === noticeId; })[0];
    if (!n) return fail('Уведомление не найдено');
    for (var k in flags) n[k] = flags[k];
    write(LS_NOTICES, list);
    return delay(clone(n));
  }

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
      return delay({ user: publicUser(u), subscriptions: subs, payments: pays, courses: crs,
        attendance: attendanceStats(id), certificates: certsFor(id),
        achievements: achievementsFor(id), notes: notesFor(id) });
    },
    studentOptions: function () {
      var list = read(LS_USERS, []).filter(function (u) { return u.role === 'student'; })
        .map(function (u) { return { id: u.id, name: u.name }; });
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
      return delay(list);
    }
  };

  /* =================================================================
     v0.5 SHARED HELPERS — attendance / development aggregates
     ================================================================= */
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function byDateDesc(field) {
    return function (a, b) { return parseYmd(b[field]) - parseYmd(a[field]); };
  }
  function parseMaterials(input) {
    if (Array.isArray(input)) {
      return input.map(function (m) { return typeof m === 'string' ? { name: m } : m; });
    }
    if (!input) return [];
    return String(input).split(/[\n,]+/).map(function (s) { return s.trim(); })
      .filter(Boolean).map(function (n) { return { name: n }; });
  }

  function attendanceList(id) {
    var list = read(LS_ATTEND, []).filter(function (a) { return a.studentId === id; });
    list.sort(byDateDesc('date'));
    return list.map(clone);
  }
  function attendanceStats(id) {
    var list = read(LS_ATTEND, []).filter(function (a) { return a.studentId === id; });
    var c = { present: 0, excused: 0, unexcused: 0, absent: 0 };
    list.forEach(function (a) { if (c[a.status] != null) c[a.status]++; });
    var total = list.length;
    return { total: total, present: c.present, excused: c.excused,
      unexcused: c.unexcused, absent: c.absent, missed: total - c.present,
      rate: total ? Math.round((c.present / total) * 100) : 0 };
  }
  function coursesDoneFor(id) {
    return read(LS_COURSES, []).filter(function (c) { return c.enrollments && c.enrollments[id]; })
      .map(function (c) {
        var s = courseLmsStats(c.id, id);
        return { id: c.id, title: c.title, teacher: c.teacher, progress: s.progress,
          lessonsDone: s.lessonsDone, lessonsTotal: s.lessonsTotal, done: s.progress >= 100 };
      });
  }
  function certsFor(id) {
    var list = read(LS_CERTS, []).filter(function (c) { return c.studentId === id; });
    list.sort(byDateDesc('date'));
    return list.map(clone);
  }
  function achievementsFor(id) {
    var list = read(LS_ACHIEVE, []).filter(function (a) { return a.studentId === id; });
    list.sort(byDateDesc('date'));
    return list.map(clone);
  }
  function notesFor(id) {
    var list = read(LS_TNOTES, []).filter(function (n) { return n.studentId === id; });
    list.sort(byDateDesc('date'));
    return list.map(clone);
  }
  function childSummary(cid) {
    var p = profileFor(cid);
    var hw = read(LS_HOMEWORK, []).filter(function (h) { return h.studentId === cid; });
    hw.sort(byDateDesc('assignedDate'));
    var hwLite = hw.map(function (h) {
      return { id: h.id, title: h.title, status: h.status, dueDate: h.dueDate, direction: h.direction };
    });
    return {
      id: cid, name: p.name, direction: p.direction, teacher: p.teacher, level: p.level,
      nextLesson: p.nextLesson, lessonsLeft: p.lessonsLeft, lessonsTotal: p.lessonsTotal,
      subscriptionUntil: p.subscriptionUntil,
      subscription: p.subscription ? p.subscription.name : null,
      paymentStatus: p.paymentStatus,
      courses: coursesDoneFor(cid), attendance: attendanceStats(cid),
      homework: hwLite,
      homeworkPending: hwLite.filter(function (h) { return h.status === 'assigned' || h.status === 'revision'; }).length,
      achievements: achievementsFor(cid), certificates: certsFor(cid), notes: notesFor(cid)
    };
  }

  /* =================================================================
     NOTIFICATION DISPATCH  [v0.6]
     -----------------------------------------------------------------
     notify() is the single fan-out point used across the API. It:
       1. resolves `target` (a userId, or a role keyword like 'student' /
          'parent' / 'admin' / 'teacher') to concrete recipients;
       2. writes a persistent in-app notification for each recipient
          (respecting their per-type notification preferences);
       3. hands the same payload to every enabled external channel via
          dispatchExternal() — Telegram / push / email / SMS.
     External channels are disabled until a real backend is connected,
     so step 3 is a safe no-op today but the call sites already work. */
  var notifyChannels = { telegram: false, push: false, email: false, sms: false };

  function resolveRecipients(target) {
    var users = read(LS_USERS, []);
    if (!target) return [];
    if (target === 'student' || target === 'parent' || target === 'admin' || target === 'teacher') {
      return users.filter(function (u) { return u.role === target; }).map(function (u) { return u.id; });
    }
    return [target]; // explicit userId
  }

  /* External channel dispatch — architecture point for live integrations. */
  function dispatchExternal(userId, payload) {
    var u = read(LS_USERS, []).filter(function (x) { return x.id === userId; })[0];
    var sent = [];
    if (!u) return sent;
    Object.keys(notifyChannels).forEach(function (ch) {
      if (!notifyChannels[ch]) return;            // channel globally disabled
      if (ch === 'telegram' && !(u.telegram && u.telegram.chatId)) return; // not linked
      // Real impl would POST to the channel here. No-op stub for now.
      sent.push(ch);
    });
    return sent;
  }

  function notify(target, message, opts) {
    opts = opts || {};
    var recipients = resolveRecipients(target);
    var list = read(LS_NOTICES, []);
    var users = read(LS_USERS, []);
    recipients.forEach(function (uid_) {
      var u = users.filter(function (x) { return x.id === uid_; })[0];
      var prefs = Object.assign(defaultPrefs(), (u && u.prefs) || {});
      var prefKey = opts.pref || opts.type; // some types map to a pref toggle
      if (prefKey && prefs[prefKey] === false) return; // user muted this type
      list.push({ id: uid('nt'), userId: uid_, type: opts.type || 'system',
        title: opts.title || 'Уведомление', text: message, href: opts.href || null,
        date: ymd(new Date()), read: false, archived: false });
      dispatchExternal(uid_, { title: opts.title, text: message });
    });
    write(LS_NOTICES, list);
    return { queued: recipients.length, target: target, message: message };
  }

  /* =================================================================
     PARENT — cabinet (children overview)  [v0.5]
     ================================================================= */
  var parent = {
    children: function (parentId) {
      var pid = parentId || curId();
      var pu = read(LS_USERS, []).filter(function (u) { return u.id === pid; })[0];
      var ids = (pu && pu.childrenIds) || [];
      return delay(ids.map(function (cid) { return childSummary(cid); }));
    },
    child: function (childId) { return delay(childSummary(childId)); }
  };

  /* =================================================================
     ATTENDANCE  [v0.5]
     ================================================================= */
  var attendance = {
    list: function (studentId) { return delay(attendanceList(studentId || curId())); },
    stats: function (studentId) { return delay(attendanceStats(studentId || curId())); },
    all: function () {
      var list = read(LS_ATTEND, []).map(function (a) {
        var c = clone(a); c.studentName = userName(a.studentId); return c;
      });
      list.sort(byDateDesc('date'));
      return delay(list);
    },
    create: function (data) {
      if (!data.studentId) return fail('Выберите ученика');
      if (!data.date) return fail('Укажите дату');
      var list = read(LS_ATTEND, []);
      var rec = { id: uid('att'), studentId: data.studentId, date: data.date,
        direction: (data.direction || '').trim() || academicFor(data.studentId).direction,
        status: data.status || 'present' };
      list.push(rec); write(LS_ATTEND, list);
      return delay(rec);
    },
    update: function (id, data) {
      var list = read(LS_ATTEND, []);
      var rec = list.filter(function (a) { return a.id === id; })[0];
      if (!rec) return fail('Запись не найдена');
      ['studentId','date','direction','status'].forEach(function (k) { if (data[k] != null) rec[k] = data[k]; });
      write(LS_ATTEND, list);
      return delay(rec);
    },
    remove: function (id) {
      write(LS_ATTEND, read(LS_ATTEND, []).filter(function (a) { return a.id !== id; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     HOMEWORK + review  [v0.5]
     Status flow: assigned → submitted → reviewed | revision
     ================================================================= */
  var homework = {
    list: function (studentId) {
      var id = studentId || curId();
      var list = read(LS_HOMEWORK, []).filter(function (h) { return h.studentId === id; });
      list.sort(byDateDesc('assignedDate'));
      return delay(list.map(clone));
    },
    get: function (id) {
      var h = read(LS_HOMEWORK, []).filter(function (x) { return x.id === id; })[0];
      if (!h) return fail('Задание не найдено');
      return delay(clone(h));
    },
    submit: function (id, payload) {
      var list = read(LS_HOMEWORK, []);
      var h = list.filter(function (x) { return x.id === id; })[0];
      if (!h) return fail('Задание не найдено');
      if (h.studentId !== curId()) return fail('Нет доступа к заданию');
      h.submission = { comment: (payload && payload.comment) || '',
        files: (payload && payload.files) || [], submittedAt: ymd(new Date()) };
      h.status = 'submitted';
      write(LS_HOMEWORK, list);
      var teacherUser = read(LS_USERS, []).filter(function (u) { return u.name === h.teacher; })[0];
      if (teacherUser) {
        notify(teacherUser.id, 'Ученик сдал работу: ' + h.title,
          { type: 'homework', title: 'Новая сдача ДЗ', href: 'teacher.html' });
      }
      return delay(clone(h));
    },
    all: function () {
      var list = read(LS_HOMEWORK, []).map(function (h) {
        var c = clone(h); c.studentName = userName(h.studentId); return c;
      });
      list.sort(byDateDesc('assignedDate'));
      return delay(list);
    },
    create: function (data) {
      if (!data.studentId) return fail('Выберите ученика');
      if (!data.title || !data.title.trim()) return fail('Введите название задания');
      var list = read(LS_HOMEWORK, []);
      var h = { id: uid('hw'), studentId: data.studentId,
        direction: (data.direction || '').trim() || academicFor(data.studentId).direction,
        teacher: (data.teacher || '').trim() || academicFor(data.studentId).teacher,
        title: data.title.trim(), description: (data.description || '').trim(),
        assignedDate: data.assignedDate || ymd(new Date()),
        dueDate: data.dueDate || ymd(addDays(new Date(), 7)),
        materials: parseMaterials(data.materials),
        status: 'assigned', submission: null, review: null };
      list.push(h); write(LS_HOMEWORK, list);
      notify(h.studentId, 'Новое домашнее задание: ' + h.title,
        { type: 'homework', pref: 'homework', title: 'Новое домашнее задание', href: 'homework.html' });
      return delay(clone(h));
    },
    update: function (id, data) {
      var list = read(LS_HOMEWORK, []);
      var h = list.filter(function (x) { return x.id === id; })[0];
      if (!h) return fail('Задание не найдено');
      ['studentId','direction','teacher','title','description','assignedDate','dueDate','status']
        .forEach(function (k) { if (data[k] != null) h[k] = data[k]; });
      if (data.materials != null) h.materials = parseMaterials(data.materials);
      write(LS_HOMEWORK, list);
      return delay(clone(h));
    },
    review: function (id, payload) {
      var list = read(LS_HOMEWORK, []);
      var h = list.filter(function (x) { return x.id === id; })[0];
      if (!h) return fail('Задание не найдено');
      h.review = { comment: (payload && payload.comment) || '', reviewedAt: ymd(new Date()) };
      h.status = (payload && payload.status) || 'reviewed';
      write(LS_HOMEWORK, list);
      notify(h.studentId, 'Домашнее задание проверено: ' + h.title,
        { type: 'homework', pref: 'homework', title: 'ДЗ проверено', href: 'homework.html' });
      return delay(clone(h));
    },
    remove: function (id) {
      write(LS_HOMEWORK, read(LS_HOMEWORK, []).filter(function (x) { return x.id !== id; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     CERTIFICATES  [v0.5]
     ================================================================= */
  var certificates = {
    list: function (studentId) { return delay(certsFor(studentId || curId())); },
    all: function () {
      var list = read(LS_CERTS, []).map(function (c) {
        var x = clone(c); x.studentName = userName(c.studentId); return x;
      });
      list.sort(byDateDesc('date'));
      return delay(list);
    },
    create: function (data) {
      if (!data.studentId) return fail('Выберите ученика');
      if (!data.title || !data.title.trim()) return fail('Введите название сертификата');
      var list = read(LS_CERTS, []);
      var rec = { id: uid('cert'), studentId: data.studentId, title: data.title.trim(),
        date: data.date || ymd(new Date()), description: (data.description || '').trim(),
        gradient: data.gradient || 'linear-gradient(135deg,#1a0a0a,#3d1010)' };
      list.push(rec); write(LS_CERTS, list);
      notify(rec.studentId, 'Вам выдан сертификат: ' + rec.title,
        { type: 'certificate', title: 'Новый сертификат', href: 'certificates.html' });
      return delay(rec);
    },
    update: function (id, data) {
      var list = read(LS_CERTS, []);
      var rec = list.filter(function (c) { return c.id === id; })[0];
      if (!rec) return fail('Сертификат не найден');
      ['studentId','title','date','description','gradient'].forEach(function (k) { if (data[k] != null) rec[k] = data[k]; });
      write(LS_CERTS, list);
      return delay(rec);
    },
    remove: function (id) {
      write(LS_CERTS, read(LS_CERTS, []).filter(function (c) { return c.id !== id; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     ACHIEVEMENTS  [v0.5]
     ================================================================= */
  var achievements = {
    list: function (studentId) { return delay(achievementsFor(studentId || curId())); },
    all: function () {
      var list = read(LS_ACHIEVE, []).map(function (a) {
        var x = clone(a); x.studentName = userName(a.studentId); return x;
      });
      list.sort(byDateDesc('date'));
      return delay(list);
    },
    create: function (data) {
      if (!data.studentId) return fail('Выберите ученика');
      if (!data.title || !data.title.trim()) return fail('Введите название достижения');
      var list = read(LS_ACHIEVE, []);
      var rec = { id: uid('ach'), studentId: data.studentId, title: data.title.trim(),
        icon: data.icon || 'star', date: data.date || ymd(new Date()),
        description: (data.description || '').trim() };
      list.push(rec); write(LS_ACHIEVE, list);
      notify(rec.studentId, 'Новое достижение: ' + rec.title,
        { type: 'achievement', title: 'Новое достижение', href: 'achievements.html' });
      return delay(rec);
    },
    update: function (id, data) {
      var list = read(LS_ACHIEVE, []);
      var rec = list.filter(function (a) { return a.id === id; })[0];
      if (!rec) return fail('Достижение не найдено');
      ['studentId','title','icon','date','description'].forEach(function (k) { if (data[k] != null) rec[k] = data[k]; });
      write(LS_ACHIEVE, list);
      return delay(rec);
    },
    remove: function (id) {
      write(LS_ACHIEVE, read(LS_ACHIEVE, []).filter(function (a) { return a.id !== id; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     TEACHER COMMENTS (recommendations / remarks / progress)  [v0.5]
     ================================================================= */
  var comments = {
    list: function (studentId) { return delay(notesFor(studentId || curId())); },
    all: function () {
      var list = read(LS_TNOTES, []).map(function (n) {
        var x = clone(n); x.studentName = userName(n.studentId); return x;
      });
      list.sort(byDateDesc('date'));
      return delay(list);
    },
    create: function (data) {
      if (!data.studentId) return fail('Выберите ученика');
      if (!data.text || !data.text.trim()) return fail('Введите текст комментария');
      var me = auth.current();
      var list = read(LS_TNOTES, []);
      var rec = { id: uid('tn'), studentId: data.studentId, type: data.type || 'progress',
        text: data.text.trim(), author: (data.author || '').trim() || (me ? me.name : 'Преподаватель'),
        date: data.date || ymd(new Date()) };
      list.push(rec); write(LS_TNOTES, list);
      notify(rec.studentId, 'Новый комментарий преподавателя в вашем профиле развития.',
        { type: 'comment', pref: 'comments', title: 'Комментарий преподавателя', href: 'progress.html' });
      return delay(rec);
    },
    update: function (id, data) {
      var list = read(LS_TNOTES, []);
      var rec = list.filter(function (n) { return n.id === id; })[0];
      if (!rec) return fail('Комментарий не найден');
      ['studentId','type','text','author','date'].forEach(function (k) { if (data[k] != null) rec[k] = data[k]; });
      write(LS_TNOTES, list);
      return delay(rec);
    },
    remove: function (id) {
      write(LS_TNOTES, read(LS_TNOTES, []).filter(function (n) { return n.id !== id; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     EVENTS — concerts / exhibitions / masterclasses / performances  [v0.6]
     ================================================================= */
  var EVENT_TYPES = ['concert', 'performance', 'exhibition', 'masterclass'];
  var events = {
    list: function () {
      var list = read(LS_EVENTS, []).map(clone);
      list.sort(function (a, b) { return parseYmd(a.date) - parseYmd(b.date); });
      return delay(list);
    },
    upcoming: function (limit) {
      var today = ymd(new Date());
      var list = read(LS_EVENTS, []).filter(function (e) { return e.date >= today; });
      list.sort(function (a, b) { return parseYmd(a.date) - parseYmd(b.date); });
      if (limit) list = list.slice(0, limit);
      return delay(list.map(clone));
    },
    all: function () { return events.list(); },
    create: function (data) {
      if (!data.title || !data.title.trim()) return fail('Введите название мероприятия');
      if (!data.date) return fail('Укажите дату');
      var list = read(LS_EVENTS, []);
      var rec = { id: uid('ev'), type: data.type || 'concert', title: data.title.trim(),
        date: data.date, time: (data.time || '').trim(), place: (data.place || '').trim(),
        description: (data.description || '').trim() };
      list.push(rec); write(LS_EVENTS, list);
      notify('student', 'Новое мероприятие: ' + rec.title,
        { type: 'event', pref: 'events', title: 'Новое мероприятие', href: 'schedule.html' });
      return delay(rec);
    },
    update: function (id, data) {
      var list = read(LS_EVENTS, []);
      var rec = list.filter(function (e) { return e.id === id; })[0];
      if (!rec) return fail('Мероприятие не найдено');
      ['type','title','date','time','place','description'].forEach(function (k) { if (data[k] != null) rec[k] = data[k]; });
      write(LS_EVENTS, list);
      return delay(rec);
    },
    remove: function (id) {
      write(LS_EVENTS, read(LS_EVENTS, []).filter(function (e) { return e.id !== id; }));
      return delay({ ok: true });
    },
    register: function (id) {
      var me = auth.current();
      if (!me) return fail('Необходима авторизация');
      var list = read(LS_EVENTS, []);
      var ev = list.filter(function (e) { return e.id === id; })[0];
      if (!ev) return fail('Мероприятие не найдено');
      ev.registrations = ev.registrations || [];
      if (ev.registrations.indexOf(me.id) !== -1) return fail('Вы уже зарегистрированы');
      ev.registrations.push(me.id);
      write(LS_EVENTS, list);
      notify(me.id, 'Вы зарегистрированы на мероприятие: ' + ev.title,
        { type: 'event', title: 'Регистрация на мероприятие', href: 'schedule.html' });
      return delay({ ok: true, eventId: id });
    },
    unregister: function (id) {
      var me = auth.current();
      if (!me) return fail('Необходима авторизация');
      var list = read(LS_EVENTS, []);
      var ev = list.filter(function (e) { return e.id === id; })[0];
      if (!ev) return fail('Мероприятие не найдено');
      ev.registrations = (ev.registrations || []).filter(function (uid_) { return uid_ !== me.id; });
      write(LS_EVENTS, list);
      return delay({ ok: true });
    },
    myRegistrations: function () {
      var me = auth.current();
      if (!me) return delay([]);
      var list = read(LS_EVENTS, []).filter(function (e) {
        return e.registrations && e.registrations.indexOf(me.id) !== -1;
      });
      list.sort(function (a, b) { return parseYmd(a.date) - parseYmd(b.date); });
      return delay(list.map(clone));
    }
  };

  /* =================================================================
     PORTFOLIO — student digital portfolio  [v0.6]
     Kinds: photo · video · audio · document · diploma · certificate
     Students & parents view; teachers/admins add material.
     ================================================================= */
  var portfolio = {
    list: function (studentId) {
      var id = studentId || curId();
      var list = read(LS_PORTFOLIO, []).filter(function (p) { return p.studentId === id; });
      list.sort(byDateDesc('date'));
      return delay(list.map(clone));
    },
    all: function () {
      var list = read(LS_PORTFOLIO, []).map(function (p) {
        var c = clone(p); c.studentName = userName(p.studentId); return c;
      });
      list.sort(byDateDesc('date'));
      return delay(list);
    },
    create: function (data) {
      if (!data.studentId) return fail('Выберите ученика');
      if (!data.title || !data.title.trim()) return fail('Введите название материала');
      var me = auth.current();
      var list = read(LS_PORTFOLIO, []);
      var rec = { id: uid('pf'), studentId: data.studentId, kind: data.kind || 'photo',
        title: data.title.trim(), note: (data.note || '').trim(),
        addedBy: (data.addedBy || '').trim() || (me ? me.name : 'Преподаватель'),
        date: data.date || ymd(new Date()) };
      list.push(rec); write(LS_PORTFOLIO, list);
      notify(rec.studentId, 'В портфолио добавлен материал: ' + rec.title,
        { type: 'achievement', title: 'Новое в портфолио', href: 'portfolio.html' });
      return delay(rec);
    },
    update: function (id, data) {
      var list = read(LS_PORTFOLIO, []);
      var rec = list.filter(function (p) { return p.id === id; })[0];
      if (!rec) return fail('Материал не найден');
      ['studentId','kind','title','note','addedBy','date'].forEach(function (k) { if (data[k] != null) rec[k] = data[k]; });
      write(LS_PORTFOLIO, list);
      return delay(rec);
    },
    remove: function (id) {
      write(LS_PORTFOLIO, read(LS_PORTFOLIO, []).filter(function (p) { return p.id !== id; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     CALENDAR — unified feed: lessons + events + homework deadlines  [v0.6]
     ================================================================= */
  var calendar = {
    month: function (year, month, studentId) {
      var id = studentId || curId();
      var acad = academicFor(id);
      var out = [];
      // weekly lessons for this student's direction
      var cursor = new Date(year, month, 1);
      while (cursor.getMonth() === month) {
        WEEKLY.forEach(function (slot) {
          if (slot.weekday === cursor.getDay() && slot.direction === acad.direction) {
            out.push({ kind: 'lesson', date: ymd(cursor), time: slot.time,
              title: 'Занятие · ' + slot.direction, place: slot.room, teacher: slot.teacher });
          }
        });
        cursor = new Date(year, month, cursor.getDate() + 1);
      }
      // events in this month
      read(LS_EVENTS, []).forEach(function (e) {
        var d = parseYmd(e.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
          out.push({ kind: 'event', eventType: e.type, date: e.date, time: e.time,
            title: e.title, place: e.place });
        }
      });
      // homework deadlines in this month (for this student)
      read(LS_HOMEWORK, []).filter(function (h) { return h.studentId === id; }).forEach(function (h) {
        if (!h.dueDate) return;
        var d = parseYmd(h.dueDate);
        if (d.getFullYear() === year && d.getMonth() === month) {
          out.push({ kind: 'deadline', date: h.dueDate, time: '',
            title: 'Дедлайн ДЗ: ' + h.title, status: h.status });
        }
      });
      out.sort(function (a, b) { return parseYmd(a.date) - parseYmd(b.date); });
      return delay(out);
    }
  };

  /* =================================================================
     GLOBAL SEARCH — courses / lessons / teachers / homework / events  [v0.6]
     ================================================================= */
  var search = {
    global: function (query, studentId) {
      var q = norm(query);
      if (!q) return delay([]);
      var id = studentId || curId();
      var me = auth.current();
      var isStaff = me && me.role === 'admin';
      var out = [];
      var teachers = {};

      read(LS_COURSES, []).forEach(function (c) {
        var owned = c.enrollments && c.enrollments[id];
        if (!c.published && !owned && !isStaff) return;
        if (norm(c.title).indexOf(q) !== -1) {
          out.push({ type: 'course', title: c.title, subtitle: 'Курс · ' + (c.teacher || ''),
            href: (owned || isStaff) ? 'courses.html' : 'courses.html' });
        }
        if (c.teacher) teachers[c.teacher] = true;
      });

      read(LS_LESSONS, []).forEach(function (l) {
        if (norm(l.title).indexOf(q) !== -1) {
          var course = read(LS_COURSES, []).filter(function (c) { return c.id === l.courseId; })[0];
          var owned = course && course.enrollments && course.enrollments[id];
          if (!owned && !isStaff) return;
          out.push({ type: 'lesson', title: l.title,
            subtitle: 'Урок · ' + (course ? course.title : ''), href: 'lesson.html?id=' + l.id });
        }
      });

      WEEKLY.forEach(function (s) { teachers[s.teacher] = true; });
      Object.keys(teachers).forEach(function (t) {
        if (norm(t).indexOf(q) !== -1) {
          out.push({ type: 'teacher', title: t, subtitle: 'Преподаватель', href: '../teachers.html' });
        }
      });

      var hw = read(LS_HOMEWORK, []).filter(function (h) { return isStaff || h.studentId === id; });
      hw.forEach(function (h) {
        if (norm(h.title).indexOf(q) !== -1) {
          out.push({ type: 'homework', title: h.title, subtitle: 'Домашнее задание',
            href: isStaff ? 'admin-homework.html' : 'homework.html' });
        }
      });

      read(LS_EVENTS, []).forEach(function (e) {
        if (norm(e.title).indexOf(q) !== -1) {
          out.push({ type: 'event', title: e.title, subtitle: 'Мероприятие · ' + e.date,
            href: 'schedule.html' });
        }
      });

      return delay(out.slice(0, 30));
    }
  };

  /* =================================================================
     ADMIN — parent accounts management  [v0.5]
     ================================================================= */
  admin.parents = function () {
    var users = read(LS_USERS, []);
    var list = users.filter(function (u) { return u.role === 'parent'; }).map(function (u) {
      var names = (u.childrenIds || []).map(function (cid) {
        var c = users.filter(function (x) { return x.id === cid; })[0];
        return c ? c.name : null;
      }).filter(Boolean);
      return { id: u.id, name: u.name, email: u.email, phone: u.phone,
        childrenIds: (u.childrenIds || []).slice(), children: names };
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    return delay(list);
  };
  admin.createParent = function (data) {
    var users = read(LS_USERS, []);
    var login = norm(data.email || data.phone);
    if (!data.name || !data.name.trim()) return fail('Введите имя родителя');
    if (!login) return fail('Укажите телефон или email');
    if (users.some(function (u) { return matches(u, login); })) return fail('Пользователь с такими данными уже существует');
    var user = { id: uid('par'), name: data.name.trim(),
      email: (data.email || '').trim(), phone: (data.phone || '').trim(),
      password: data.password || 'parent1234', role: 'parent',
      childrenIds: parseChildren(data.childrenIds) };
    users.push(user); write(LS_USERS, users);
    return delay(publicUser(user));
  };
  admin.updateParent = function (id, data) {
    var users = read(LS_USERS, []);
    var u = users.filter(function (x) { return x.id === id && x.role === 'parent'; })[0];
    if (!u) return fail('Родитель не найден');
    ['name','email','phone'].forEach(function (k) { if (data[k] != null) u[k] = data[k]; });
    if (data.password) u.password = data.password;
    if (data.childrenIds != null) u.childrenIds = parseChildren(data.childrenIds);
    write(LS_USERS, users);
    return delay(publicUser(u));
  };
  admin.removeParent = function (id) {
    write(LS_USERS, read(LS_USERS, []).filter(function (u) { return u.id !== id; }));
    return delay({ ok: true });
  };
  function parseChildren(input) {
    if (Array.isArray(input)) return input.filter(Boolean);
    if (!input) return [];
    return String(input).split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* =================================================================
     INTEGRATIONS — Telegram Bot / Mini App / channels  [v0.6]
     Architecture-ready: notify() already fans out through these channels
     (see dispatchExternal). They stay disabled until a backend is wired.
     ================================================================= */
  var BOT_USERNAME = 'shpigotskiy_art_bot'; // placeholder; set to the real bot
  var integrations = {
    channels: function () { return delay(clone(notifyChannels)); },
    /* Telegram Bot descriptor + the notification topics it will deliver. */
    telegram: function () {
      return delay({
        bot: BOT_USERNAME,
        connected: notifyChannels.telegram,
        topics: [
          { key: 'lessons',      label: 'Уведомления о занятиях' },
          { key: 'homework',     label: 'Новые домашние задания' },
          { key: 'comments',     label: 'Комментарии преподавателя' },
          { key: 'subscription', label: 'Окончание абонемента' },
          { key: 'events',       label: 'Новые курсы и мероприятия' }
        ]
      });
    },
    /* True when the page is opened inside a Telegram Mini App container. */
    isMiniApp: function () {
      return !!(global.Telegram && global.Telegram.WebApp && global.Telegram.WebApp.initData);
    },
    /* Pages the Mini App exposes from its menu (role-aware). */
    miniAppPages: function () {
      var me = auth.current();
      if (me && me.role === 'teacher') {
        return delay([
          { label: 'Мои ученики',         href: 'teacher.html' },
          { label: 'Расписание',          href: 'schedule.html' },
          { label: 'Домашние задания',    href: 'teacher.html?tab=homework' },
          { label: 'Уведомления',         href: 'notifications.html' }
        ]);
      }
      if (me && me.role === 'parent') {
        return delay([
          { label: 'Кабинет родителя',    href: 'parent.html' },
          { label: 'Уведомления',         href: 'notifications.html' }
        ]);
      }
      return delay([
        { label: 'Личный кабинет',   href: 'dashboard.html' },
        { label: 'Расписание',       href: 'schedule.html' },
        { label: 'Домашние задания', href: 'homework.html' },
        { label: 'Онлайн-курсы',    href: 'courses.html' },
        { label: 'Достижения',      href: 'achievements.html' },
        { label: 'Сертификаты',     href: 'certificates.html' },
        { label: 'Магазин',         href: 'shop.html' }
      ]);
    },
    send: function () {
      return fail('Внешняя отправка уведомлений включится после подключения реального backend');
    }
  };

  /* =================================================================
     SHOP — catalogue with categories: subscriptions / courses /
     masterclasses / intensives / gift certificates  [v0.7]
     ================================================================= */
  var shop = {
    giftCertificates: function () { return delay(GIFT_CERTS.map(clone)); },
    intensives: function () { return delay(INTENSIVES.map(clone)); },
    /* Upcoming masterclasses from the events catalogue. */
    masterclasses: function () {
      var today = ymd(new Date());
      var list = read(LS_EVENTS, []).filter(function (e) {
        return e.type === 'masterclass' && e.date >= today;
      });
      list.sort(function (a, b) { return parseYmd(a.date) - parseYmd(b.date); });
      return delay(list.map(function (e) {
        var c = clone(e);
        c.price = c.price || 3000; // default ticket price
        return c;
      }));
    },
    /* All products grouped by category (for the shop overview). */
    all: function () {
      return Promise.all([
        subscriptions.plans(),
        courses.catalog(),
        shop.masterclasses(),
        shop.intensives(),
        shop.giftCertificates()
      ]).then(function (res) {
        return { subscriptions: res[0], courses: res[1],
          masterclasses: res[2], intensives: res[3], giftCerts: res[4] };
      });
    }
  };

  /* =================================================================
     CART — persistent per-session shopping cart  [v0.7]
     Items: { id, type, productId, name, price, qty }
     Types: 'subscription-plan' | 'course' | 'gift-cert' | 'intensive' | 'masterclass'
     ================================================================= */
  var cart = {
    items: function () { return delay(read(LS_CART, []).map(clone)); },
    count: function () {
      var n = read(LS_CART, []).reduce(function (s, x) { return s + (x.qty || 1); }, 0);
      return delay(n);
    },
    total: function () {
      var t = read(LS_CART, []).reduce(function (s, x) { return s + (x.price || 0) * (x.qty || 1); }, 0);
      return delay(t);
    },
    add: function (item) {
      if (!item || !item.name || !item.price) return fail('Неверные данные товара');
      var items = read(LS_CART, []);
      var existing = items.filter(function (x) { return x.productId === item.productId && x.type === item.type; })[0];
      if (existing) {
        existing.qty = (existing.qty || 1) + 1;
      } else {
        items.push({ id: uid('ci'), type: item.type || 'other',
          productId: item.productId || item.id, name: item.name,
          price: +item.price, qty: 1 });
      }
      write(LS_CART, items);
      return delay(items.map(clone));
    },
    remove: function (itemId) {
      write(LS_CART, read(LS_CART, []).filter(function (x) { return x.id !== itemId; }));
      return delay({ ok: true });
    },
    clear: function () { write(LS_CART, []); return delay({ ok: true }); },
    /* Process all cart items via the active payment gateway, create an order record. */
    checkout: function () {
      var items = read(LS_CART, []);
      if (!items.length) return fail('Корзина пуста');
      var total = items.reduce(function (s, x) { return s + (x.price || 0) * (x.qty || 1); }, 0);
      var id = curId();
      var purpose = items.map(function (x) { return x.name; }).join(', ');
      return processCharge({ type: 'order', amount: total, studentId: id, purpose: 'Заказ: ' + purpose })
        .then(function (res) {
          /* Fulfil each item — create subscriptions, enrol in courses, etc. */
          items.forEach(function (item) {
            if (item.type === 'subscription-plan') {
              var plan = PLANS.filter(function (p) { return p.id === item.productId; })[0];
              if (plan) {
                var subs = read(LS_SUBS, []);
                var start = new Date();
                subs.push({ id: uid('sub'), studentId: id, name: plan.name,
                  lessonsTotal: plan.lessons, lessonsLeft: plan.lessons, price: plan.price,
                  startDate: ymd(start), endDate: ymd(addDays(start, plan.durationDays)),
                  purchaseDate: ymd(start), status: 'active' });
                write(LS_SUBS, subs);
              }
            }
            if (item.type === 'course') {
              var all = read(LS_COURSES, []);
              var course = all.filter(function (c) { return c.id === item.productId; })[0];
              if (course && !(course.enrollments && course.enrollments[id])) {
                course.enrollments = course.enrollments || {};
                course.enrollments[id] = {};
                write(LS_COURSES, all);
              }
            }
            if (item.type === 'intensive') {
              /* Intensives create a subscription with intensive format. */
              var intv = INTENSIVES.filter(function (x) { return x.id === item.productId; })[0];
              if (intv) {
                var subs2 = read(LS_SUBS, []);
                var s2 = new Date();
                subs2.push({ id: uid('sub'), studentId: id, name: intv.name,
                  lessonsTotal: intv.lessons, lessonsLeft: intv.lessons, price: intv.price,
                  startDate: ymd(s2), endDate: ymd(addDays(s2, intv.durationDays)),
                  purchaseDate: ymd(s2), status: 'active' });
                write(LS_SUBS, subs2);
              }
            }
            addPayment({ studentId: id, amount: (item.price || 0) * (item.qty || 1),
              purpose: item.name, status: 'paid' });
          });
          var allOrders = read(LS_ORDERS, []);
          var order = { id: uid('ord'), userId: id, items: items.map(clone),
            total: total, status: 'paid', createdAt: new Date().toISOString(), txnId: res.txn };
          allOrders.push(order); write(LS_ORDERS, allOrders);
          write(LS_CART, []);
          notify(id, 'Заказ #' + order.id.split('-').pop() + ' оформлен на сумму ' + total + ' ₸.',
            { type: 'payment', title: 'Заказ оформлен', href: 'payments.html' });
          return order;
        });
    }
  };

  /* =================================================================
     ORDERS — order history  [v0.7]
     ================================================================= */
  var orders = {
    list: function () {
      var id = curId();
      var list = read(LS_ORDERS, []).filter(function (o) { return o.userId === id; });
      list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      return delay(list.map(clone));
    },
    get: function (id) {
      var o = read(LS_ORDERS, []).filter(function (x) { return x.id === id; })[0];
      if (!o) return fail('Заказ не найден');
      return delay(clone(o));
    },
    all: function () {
      var users = read(LS_USERS, []);
      function nameOf (uid_) { var u = users.filter(function (x) { return x.id === uid_; })[0]; return u ? u.name : '—'; }
      var list = read(LS_ORDERS, []).map(function (o) {
        var c = clone(o); c.userName = nameOf(o.userId); return c;
      });
      list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      return delay(list);
    }
  };

  /* =================================================================
     TEACHER — cabinet for role='teacher'  [v0.7]
     Teachers reuse the existing attendance / homework / comments APIs;
     this namespace adds teacher-scoped views on top.
     ================================================================= */
  var teacher = {
    /* Students assigned to the signed-in teacher (matched by name in academics map). */
    myStudents: function (query) {
      var me = auth.current();
      if (!me) return fail('Нет доступа');
      var teacherName = me.name;
      var academics = read(LS_ACADEMICS, {}) || {};
      var q = norm(query);
      var list = read(LS_USERS, []).filter(function (u) {
        if (u.role !== 'student') return false;
        var ac = academics[u.id];
        return ac && ac.teacher === teacherName;
      }).map(function (u) {
        var ac = academics[u.id] || {};
        var s = activeSubFor(u.id);
        var stats = attendanceStats(u.id);
        var hwPending = read(LS_HOMEWORK, []).filter(function (h) {
          return h.studentId === u.id && (h.status === 'assigned' || h.status === 'revision');
        }).length;
        return { id: u.id, name: u.name, email: u.email, phone: u.phone,
          direction: ac.direction || '', level: ac.level || '',
          subscription: s ? s.name : null, lessonsLeft: s ? s.lessonsLeft : null,
          attendance: stats, attendanceRate: stats.rate, homeworkPending: hwPending };
      });
      if (q) {
        list = list.filter(function (s) {
          return norm(s.name).indexOf(q) !== -1 || norm(s.email || '').indexOf(q) !== -1;
        });
      }
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
      return delay(list);
    },
    /* Homework assigned by this teacher, sorted: submitted first. */
    homeworkForReview: function () {
      var me = auth.current();
      if (!me) return delay([]);
      var teacherName = me.name;
      var order = { submitted: 0, revision: 1, assigned: 2, reviewed: 3 };
      var list = read(LS_HOMEWORK, []).filter(function (h) { return h.teacher === teacherName; })
        .map(function (h) { var c = clone(h); c.studentName = userName(h.studentId); return c; });
      list.sort(function (a, b) { return (order[a.status] || 9) - (order[b.status] || 9); });
      return delay(list);
    },
    /* Today's attendance sheet for this teacher's students. */
    todayAttendance: function () {
      var me = auth.current();
      if (!me) return delay([]);
      var teacherName = me.name;
      var today = ymd(new Date());
      var academics = read(LS_ACADEMICS, {}) || {};
      var myIds = read(LS_USERS, []).filter(function (u) {
        if (u.role !== 'student') return false;
        var ac = academics[u.id];
        return ac && ac.teacher === teacherName;
      }).map(function (u) { return u.id; });
      var existing = read(LS_ATTEND, []).filter(function (a) {
        return a.date === today && myIds.indexOf(a.studentId) !== -1;
      });
      return delay(myIds.map(function (sid) {
        var rec = existing.filter(function (a) { return a.studentId === sid; })[0];
        var ac = academics[sid] || {};
        return { studentId: sid, studentName: userName(sid),
          direction: ac.direction || '', date: today,
          status: rec ? rec.status : null, attendanceId: rec ? rec.id : null };
      }));
    },
    /* Delegate write ops to existing namespaces. */
    markAttendance:   function (data)        { return attendance.create(data); },
    updateAttendance: function (id, data)    { return attendance.update(id, data); },
    createHomework:   function (data)        { return homework.create(data); },
    updateHomework:   function (id, data)    { return homework.update(id, data); },
    removeHomework:   function (id)          { return homework.remove(id); },
    reviewHomework:   function (id, payload) { return homework.review(id, payload); },
    addComment:       function (data)        { return comments.create(data); },
    schedule:         function (year, month) { return schedule.month(year, month); }
  };

  /* =================================================================
     LEADS — CRM for incoming leads  [v0.9]
     ================================================================= */
  var leads = {
    list: function (filters) {
      var list = read(LS_LEADS, []);
      filters = filters || {};
      if (filters.status) list = list.filter(function (l) { return l.status === filters.status; });
      if (filters.source) list = list.filter(function (l) { return l.source === filters.source; });
      if (filters.q) {
        var q = norm(filters.q);
        list = list.filter(function (l) {
          return norm(l.name).indexOf(q) !== -1 || norm(l.phone || '').indexOf(q) !== -1 || norm(l.email || '').indexOf(q) !== -1;
        });
      }
      list.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      return delay(list);
    },
    get: function (id) {
      var l = read(LS_LEADS, []).filter(function (x) { return x.id === id; })[0];
      return l ? delay(clone(l)) : fail('Лид не найден');
    },
    create: function (data) {
      if (!data || !data.name || !data.phone) return fail('Имя и телефон обязательны');
      var list = read(LS_LEADS, []);
      var lead = {
        id: uid('ld'), name: (data.name || '').trim(), phone: (data.phone || '').trim(),
        email: (data.email || '').trim(), source: data.source || 'callback',
        status: 'new', createdAt: ymd(new Date()),
        direction: data.direction || '', comment: data.comment || '',
        comments: []
      };
      if (data.comment) lead.comments.push({ id: uid('lc'), text: data.comment, author: 'Система', date: ymd(new Date()) });
      list.push(lead);
      write(LS_LEADS, list);
      return delay(clone(lead));
    },
    update: function (id, data) {
      var list = read(LS_LEADS, []);
      var lead = list.filter(function (x) { return x.id === id; })[0];
      if (!lead) return fail('Лид не найден');
      var allowed = ['name','phone','email','source','status','direction'];
      allowed.forEach(function (k) { if (data[k] !== undefined) lead[k] = data[k]; });
      write(LS_LEADS, list);
      return delay(clone(lead));
    },
    setStatus: function (id, status) {
      if (LEAD_STATUSES.indexOf(status) === -1) return fail('Неверный статус');
      return leads.update(id, { status: status });
    },
    addComment: function (id, text, author) {
      var list = read(LS_LEADS, []);
      var lead = list.filter(function (x) { return x.id === id; })[0];
      if (!lead) return fail('Лид не найден');
      var comment = { id: uid('lc'), text: text, author: author || 'Администратор', date: ymd(new Date()) };
      lead.comments = lead.comments || [];
      lead.comments.push(comment);
      write(LS_LEADS, list);
      return delay(clone(comment));
    },
    remove: function (id) {
      var list = read(LS_LEADS, []).filter(function (x) { return x.id !== id; });
      write(LS_LEADS, list);
      return delay({ ok: true });
    },
    statuses: function () { return delay(LEAD_STATUSES.slice()); },
    sources: function () { return delay(LEAD_SOURCES.slice()); }
  };

  /* =================================================================
     TRIALS — trial lesson management  [v0.9]
     ================================================================= */
  var trials = {
    list: function (filters) {
      var list = read(LS_TRIALS, []);
      filters = filters || {};
      if (filters.status) list = list.filter(function (t) { return t.status === filters.status; });
      if (filters.teacherId) {
        var tname = userName(filters.teacherId);
        list = list.filter(function (t) { return t.teacher === tname; });
      }
      list.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      return delay(list.map(clone));
    },
    get: function (id) {
      var t = read(LS_TRIALS, []).filter(function (x) { return x.id === id; })[0];
      return t ? delay(clone(t)) : fail('Пробное занятие не найдено');
    },
    create: function (data) {
      if (!data || !data.name || !data.date) return fail('Имя и дата обязательны');
      var list = read(LS_TRIALS, []);
      var trial = {
        id: uid('tr'), leadId: data.leadId || null,
        name: (data.name || '').trim(), phone: (data.phone || '').trim(),
        date: data.date, time: data.time || '10:00',
        teacher: data.teacher || '', direction: data.direction || '',
        adminComment: data.adminComment || '', status: 'scheduled',
        result: null, teacherComment: '', recommendation: ''
      };
      list.push(trial);
      write(LS_TRIALS, list);
      /* if linked to a lead, update its status */
      if (trial.leadId) leads.setStatus(trial.leadId, 'trial_scheduled');
      return delay(clone(trial));
    },
    update: function (id, data) {
      var list = read(LS_TRIALS, []);
      var trial = list.filter(function (x) { return x.id === id; })[0];
      if (!trial) return fail('Пробное занятие не найдено');
      var allowed = ['date','time','teacher','direction','adminComment','status','result','teacherComment','recommendation'];
      allowed.forEach(function (k) { if (data[k] !== undefined) trial[k] = data[k]; });
      write(LS_TRIALS, list);
      return delay(clone(trial));
    },
    recordResult: function (id, result, teacherComment, recommendation) {
      var list = read(LS_TRIALS, []);
      var trial = list.filter(function (x) { return x.id === id; })[0];
      if (!trial) return fail('Пробное занятие не найдено');
      trial.status = 'done';
      trial.result = result; /* 'converted' | 'not_converted' | 'reschedule' */
      trial.teacherComment = teacherComment || '';
      trial.recommendation = recommendation || '';
      write(LS_TRIALS, list);
      /* update lead status */
      if (trial.leadId) {
        leads.setStatus(trial.leadId, result === 'converted' ? 'trial_done' : 'trial_done');
      }
      return delay(clone(trial));
    },
    remove: function (id) {
      write(LS_TRIALS, read(LS_TRIALS, []).filter(function (x) { return x.id !== id; }));
      return delay({ ok: true });
    }
  };

  /* =================================================================
     SKILL MAP — per-student skill progress radar  [v0.9]
     ================================================================= */
  var skillMap = {
    /* Returns skill map for a student: { direction: { skill: level } } */
    getForStudent: function (studentId) {
      var map = read(LS_SKILL_MAP, {});
      return delay(clone(map[studentId] || {}));
    },
    /* Returns skill levels for one direction */
    getForDirection: function (studentId, direction) {
      var map = read(LS_SKILL_MAP, {});
      var stu = map[studentId] || {};
      var skills = SKILL_TEMPLATES[direction] || [];
      var levels = stu[direction] || {};
      var result = skills.map(function (s) { return { skill: s, level: levels[s] || 0 }; });
      return delay(result);
    },
    /* Set level for one skill */
    setLevel: function (studentId, direction, skill, level) {
      if (level < 0 || level > 5) return fail('Уровень должен быть 0–5');
      var map = read(LS_SKILL_MAP, {});
      if (!map[studentId]) map[studentId] = {};
      if (!map[studentId][direction]) map[studentId][direction] = {};
      map[studentId][direction][skill] = level;
      write(LS_SKILL_MAP, map);
      return delay({ studentId: studentId, direction: direction, skill: skill, level: level });
    },
    /* Bulk set for a direction */
    setDirection: function (studentId, direction, skillLevels) {
      var map = read(LS_SKILL_MAP, {});
      if (!map[studentId]) map[studentId] = {};
      map[studentId][direction] = skillLevels;
      write(LS_SKILL_MAP, map);
      return delay({ ok: true });
    },
    templates: function () { return delay(clone(SKILL_TEMPLATES)); },
    directions: function () { return delay(DIRECTIONS.slice()); }
  };

  /* =================================================================
     CHURN — student departure reason tracking  [v0.9]
     ================================================================= */
  var CHURN_REASONS = ['expensive','moved','schedule','interest','competitor','other'];
  var churn = {
    list: function () {
      return delay(read(LS_CHURN, []).map(clone));
    },
    record: function (data) {
      if (!data || !data.studentId || !data.reason) return fail('studentId и reason обязательны');
      if (CHURN_REASONS.indexOf(data.reason) === -1) return fail('Неверная причина');
      var list = read(LS_CHURN, []);
      var rec = {
        id: uid('ch'), studentId: data.studentId, studentName: data.studentName || userName(data.studentId),
        reason: data.reason, comment: data.comment || '', date: ymd(new Date()),
        direction: data.direction || ''
      };
      list.push(rec);
      write(LS_CHURN, list);
      return delay(clone(rec));
    },
    stats: function () {
      var list = read(LS_CHURN, []);
      var byReason = {};
      CHURN_REASONS.forEach(function (r) { byReason[r] = 0; });
      list.forEach(function (c) { byReason[c.reason] = (byReason[c.reason] || 0) + 1; });
      return delay({ total: list.length, byReason: byReason, list: list.map(clone) });
    },
    reasons: function () { return delay(CHURN_REASONS.slice()); }
  };

  /* =================================================================
     BROADCAST — mass notification center  [v0.9]
     ================================================================= */
  var broadcast = {
    templates: function () { return delay(BROADCAST_TEMPLATES.map(clone)); },
    history: function () {
      var list = read(LS_BROADCASTS, []);
      list.sort(function (a, b) { return (b.sentAt || '').localeCompare(a.sentAt || ''); });
      return delay(list.map(clone));
    },
    send: function (data) {
      if (!data || !data.subject || !data.body) return fail('Тема и текст обязательны');
      var recipients = data.recipients || 'all'; /* 'all'|'student'|'parent'|'teacher'|array of ids */
      var channels = data.channels || ['in_app'];
      var users = read(LS_USERS, []);
      var targets = [];
      if (Array.isArray(recipients)) {
        targets = recipients;
      } else if (recipients === 'all') {
        targets = users.map(function (u) { return u.id; });
      } else {
        targets = users.filter(function (u) { return u.role === recipients; }).map(function (u) { return u.id; });
      }
      /* Fan out in-app notifications */
      if (channels.indexOf('in_app') !== -1) {
        targets.forEach(function (uid_) {
          notify(uid_, data.subject + ': ' + data.body.slice(0, 120), { type: 'broadcast', read: false });
        });
      }
      /* Record the broadcast */
      var me = auth.current();
      var record = {
        id: uid('bc'), subject: data.subject, body: data.body,
        recipients: recipients, channels: channels,
        template: data.template || 'custom',
        sentAt: ymd(new Date()), sentBy: me ? me.name : 'Администратор',
        recipientCount: targets.length
      };
      var history = read(LS_BROADCASTS, []);
      history.push(record);
      write(LS_BROADCASTS, history);
      return delay(clone(record));
    }
  };

  /* =================================================================
     ANALYTICS — financial + funnel metrics  [v0.9]
     Computed on-the-fly from existing data stores. No new storage.
     ================================================================= */
  var analytics = {
    /* Revenue by period: 'day'|'week'|'month' for past N periods */
    revenue: function (period, count) {
      var payments = read(LS_PAYMENTS, []).filter(function (p) { return p.status === 'paid'; });
      period = period || 'month';
      count = count || 6;
      var now = new Date();
      var result = [];
      for (var i = count - 1; i >= 0; i--) {
        var start, end, label;
        if (period === 'day') {
          start = ymd(addDays(now, -i));
          end = start;
          label = start;
        } else if (period === 'week') {
          var d = addDays(now, -i * 7);
          start = ymd(addDays(d, -6));
          end = ymd(d);
          label = 'Нед. ' + (count - i);
        } else {
          var m = new Date(now.getFullYear(), now.getMonth() - i, 1);
          var mNames = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
          label = mNames[m.getMonth()] + ' ' + m.getFullYear();
          start = ymd(m);
          end = ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0));
        }
        var amount = payments.filter(function (p) {
          return p.date >= start && p.date <= end;
        }).reduce(function (s, p) { return s + (p.amount || 0); }, 0);
        result.push({ label: label, start: start, end: end, amount: amount });
      }
      return delay(result);
    },
    /* Revenue breakdown by category */
    byCategory: function () {
      var payments = read(LS_PAYMENTS, []).filter(function (p) { return p.status === 'paid'; });
      var cats = { subscriptions: 0, courses: 0, store: 0, other: 0 };
      payments.forEach(function (p) {
        var purp = (p.purpose || '').toLowerCase();
        if (purp.indexOf('абонемент') !== -1) cats.subscriptions += p.amount || 0;
        else if (purp.indexOf('курс') !== -1) cats.courses += p.amount || 0;
        else if (purp.indexOf('магазин') !== -1 || purp.indexOf('товар') !== -1 || purp.indexOf('сертификат') !== -1) cats.store += p.amount || 0;
        else cats.other += p.amount || 0;
      });
      var total = cats.subscriptions + cats.courses + cats.store + cats.other;
      return delay({ total: total, categories: cats });
    },
    /* Unpaid services */
    unpaid: function () {
      var payments = read(LS_PAYMENTS, []).filter(function (p) { return p.status === 'pending'; });
      var total = payments.reduce(function (s, p) { return s + (p.amount || 0); }, 0);
      return delay({ count: payments.length, total: total, items: payments.map(clone) });
    },
    /* Sales funnel: leads → trial → purchase → active */
    funnel: function () {
      var allLeads = read(LS_LEADS, []);
      var allTrials = read(LS_TRIALS, []);
      var stages = [
        { id: 'new',             label: 'Новые заявки',      count: 0 },
        { id: 'trial_scheduled', label: 'Записаны на пробное', count: 0 },
        { id: 'trial_done',      label: 'Прошли пробное',    count: 0 },
        { id: 'purchased',       label: 'Купили',            count: 0 },
        { id: 'active',          label: 'Активные ученики',  count: 0 }
      ];
      var stageOrder = ['new','processing','no_answer','trial_scheduled','trial_done','purchased','active','lost'];
      allLeads.forEach(function (l) {
        stages.forEach(function (s) {
          if (stageOrder.indexOf(l.status) >= stageOrder.indexOf(s.id)) s.count++;
        });
      });
      /* Compute conversion rates between stages */
      for (var i = 1; i < stages.length; i++) {
        var prev = stages[i - 1].count || 1;
        stages[i].rate = Math.round(stages[i].count / prev * 100);
      }
      stages[0].rate = 100;
      var trialsScheduled = allTrials.filter(function (t) { return t.status === 'scheduled'; }).length;
      var trialsDone = allTrials.filter(function (t) { return t.status === 'done'; }).length;
      var trialsConverted = allTrials.filter(function (t) { return t.result === 'converted'; }).length;
      return delay({
        stages: stages,
        trials: { scheduled: trialsScheduled, done: trialsDone, converted: trialsConverted,
          conversionRate: trialsDone > 0 ? Math.round(trialsConverted / trialsDone * 100) : 0 }
      });
    },
    /* Director dashboard summary */
    summary: function () {
      var users = read(LS_USERS, []);
      var activeStudents = users.filter(function (u) { return u.role === 'student'; }).length;
      var teachers = users.filter(function (u) { return u.role === 'teacher'; }).length;
      var allLeads = read(LS_LEADS, []);
      var newLeads = allLeads.filter(function (l) { return l.status === 'new'; }).length;
      var scheduledTrials = read(LS_TRIALS, []).filter(function (t) { return t.status === 'scheduled'; }).length;
      var payments = read(LS_PAYMENTS, []);
      var now = new Date();
      var monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      var monthRevenue = payments.filter(function (p) {
        return p.status === 'paid' && p.date >= monthStart;
      }).reduce(function (s, p) { return s + (p.amount || 0); }, 0);
      var unpaidTotal = payments.filter(function (p) { return p.status === 'pending'; })
        .reduce(function (s, p) { return s + (p.amount || 0); }, 0);
      var upcomingEvents = read(LS_EVENTS, []).filter(function (e) {
        return e.date >= ymd(now);
      }).length;
      var academics = read(LS_ACADEMICS, {}) || {};
      var teacherWorkload = {};
      Object.keys(academics).forEach(function (sid) {
        var ac = academics[sid];
        if (ac && ac.teacher) teacherWorkload[ac.teacher] = (teacherWorkload[ac.teacher] || 0) + 1;
      });
      return delay({
        activeStudents: activeStudents, teachers: teachers,
        newLeads: newLeads, scheduledTrials: scheduledTrials,
        monthRevenue: monthRevenue, unpaidTotal: unpaidTotal,
        upcomingEvents: upcomingEvents, teacherWorkload: teacherWorkload
      });
    }
  };

  /* Reserved namespaces — architecture placeholders for future versions.
     They return a friendly "coming soon" so UI can call them safely. */
  function soon(label) { return function () { return fail(label + ' появится в следующей версии'); }; }
  var tests       = { list: soon('Тесты и проверки') };
  var gamification = { profile: soon('Геймификация'), leaderboard: soon('Геймификация') };
  var wallet      = { balance: soon('Внутренняя валюта'), history: soon('Внутренняя валюта') };
  var ratings     = { top: soon('Рейтинги') };
  var seasons     = { current: soon('Сезонные события') };

  global.API = {
    version: VERSION,
    auth: auth, student: student, schedule: schedule, calendar: calendar,
    subscriptions: subscriptions, payments: payments,
    courses: courses, lms: lms, notifications: notifications, admin: admin,
    parent: parent, attendance: attendance, homework: homework,
    certificates: certificates, achievements: achievements,
    comments: comments, events: events, portfolio: portfolio, search: search,
    integrations: integrations,
    shop: shop, cart: cart, orders: orders, teacher: teacher,
    /* CRM v0.9 */
    leads: leads, trials: trials, skillMap: skillMap,
    churn: churn, broadcast: broadcast, analytics: analytics,
    /* reserved (next versions) */
    tests: tests, gamification: gamification, wallet: wallet,
    ratings: ratings, seasons: seasons
  };
})(window);
