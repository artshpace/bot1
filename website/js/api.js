/* =====================================================================
   MOCK API LAYER — Shpigotskiy Art Space (v0.5)
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

   Payment integration point: processCharge() — replace body with PSP.
   Reserved namespace: tests — scaffolding for a future version.
   Integration stubs (notify): telegram / push / email / sms — see notify.
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
  var LS_ACADEMICS= 'sas_academics';
  var LS_ATTEND   = 'sas_attendance';
  var LS_HOMEWORK = 'sas_homework';
  var LS_CERTS    = 'sas_certificates';
  var LS_ACHIEVE  = 'sas_achievements';
  var LS_TNOTES   = 'sas_teacher_notes';

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
    var out = { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
    if (u.role === 'parent') out.childrenIds = (u.childrenIds || []).slice();
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

  (function ensureSeed() {
    var users = read(LS_USERS, null) || [];
    [DEMO_USER, DEMO_CHILD2, PARENT_USER, ADMIN_USER].forEach(function (seed) {
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

  /* Notification dispatch stub — architecture point for future channels.
     Real impl routes `message` to whichever channels are enabled. No-op now. */
  var notifyChannels = { telegram: false, push: false, email: false, sms: false };
  function notify(audience, message) {
    return { queued: false, audience: audience, message: message };
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
      notify('teacher', 'Новая сдача ДЗ: ' + h.title);
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
      notify('student', 'Новое домашнее задание: ' + h.title);
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
      notify('student', 'Домашнее задание проверено: ' + h.title);
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
     INTEGRATIONS — scaffolding for Telegram / push / email / SMS  [v0.5]
     Not implemented yet; channels disabled. notify() is a no-op.
     ================================================================= */
  var integrations = {
    channels: function () { return delay(clone(notifyChannels)); },
    send: function () {
      return fail('Внешние уведомления (Telegram, push, email, SMS) появятся в следующей версии');
    }
  };

  /* Reserved namespace — future version. */
  var tests = { list: function () { return fail('Тесты появятся в следующей версии'); } };

  global.API = {
    auth: auth, student: student, schedule: schedule,
    subscriptions: subscriptions, payments: payments,
    courses: courses, lms: lms, notifications: notifications, admin: admin,
    parent: parent, attendance: attendance, homework: homework,
    certificates: certificates, achievements: achievements,
    comments: comments, integrations: integrations, tests: tests
  };
})(window);
