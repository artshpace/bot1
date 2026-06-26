/* =====================================================================
   ЭЛЕКТРОННЫЙ ЖУРНАЛ — посещаемость  (Phase 3 P0 — Задача 10)
   ---------------------------------------------------------------------
   Реальные данные из Supabase (таблицы из 0010_journal.sql). Один модуль,
   два режима по data-view у точки монтирования #attendance-journal-root:
     • "staff"   (admin-journal.html) — admin/director/teacher:
        выбор/создание группы, состав, генерация занятий из расписания,
        сетка «ученики × даты» с кликом по ячейке (был/не был/уваж./болел).
     • "student" (journal.html) — ученик видит ТОЛЬКО свои отметки.

   Авторитет — БД (RLS из 0010): UI лишь отражает то, что разрешено.
   Подключается ПОСЛЕ supa.js (window.SUPA) и account.js. Старый мок-журнал
   на этих страницах прячется, чтобы не путать.
   ===================================================================== */
(function () {
  'use strict';

  var ROOT_ID = 'attendance-journal-root';

  var DIRECTIONS = [
    { value: 'guitar',   label: 'Гитара / укулеле' },
    { value: 'acting',   label: 'Актёрское / ораторское' },
    { value: 'vocals',   label: 'Вокал' },
    { value: 'dance',    label: 'Современный танец' },
    { value: 'painting', label: 'Живопись' }
  ];
  function dirLabel(v) {
    for (var i = 0; i < DIRECTIONS.length; i++) if (DIRECTIONS[i].value === v) return DIRECTIONS[i].label;
    return v || '—';
  }
  var DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; // 0..6 (Date.getDay)

  // Attendance status cycle: empty → present → absent → excused → sick → empty
  var CYCLE = [null, 'present', 'absent', 'excused', 'sick'];
  var ST = {
    present: { ch: 'П', cls: 'p', title: 'Был' },
    absent:  { ch: 'Н', cls: 'n', title: 'Не был' },
    excused: { ch: 'У', cls: 'e', title: 'Уважительная' },
    sick:    { ch: 'Б', cls: 's', title: 'Болел' }
  };
  function nextStatus(cur) {
    var i = CYCLE.indexOf(cur || null);
    return CYCLE[(i + 1) % CYCLE.length];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ddmm(iso) { var p = iso.split('-'); return p[2] + '.' + p[1]; }

  var sb = null; // supabase client
  var me = null; // { id, role, name }

  /* ---- styles ---- */
  function injectStyles() {
    if (document.getElementById('jr-styles')) return;
    var css =
      '.jr-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:20px;}' +
      '.jr-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:16px;}' +
      '.jr-controls .form-group{margin:0;}.jr-controls label{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin-bottom:4px;}' +
      '.jr-controls select,.jr-controls input{min-width:150px;}' +
      '.jr-month{display:flex;align-items:center;gap:8px;}' +
      '.jr-month b{min-width:130px;text-align:center;}' +
      '.jr-grid-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:8px;}' +
      '.jr-grid{border-collapse:collapse;font-size:.85rem;min-width:100%;}' +
      '.jr-grid th,.jr-grid td{border:1px solid var(--border);padding:6px 8px;text-align:center;white-space:nowrap;}' +
      '.jr-grid thead th{background:var(--card-bg);font-size:.72rem;color:var(--text-muted);position:sticky;top:0;}' +
      '.jr-grid th.jr-name,.jr-grid td.jr-name{text-align:left;position:sticky;left:0;background:var(--card-bg);min-width:160px;z-index:1;}' +
      '.jr-cell{cursor:pointer;font-weight:700;width:34px;height:30px;user-select:none;}' +
      '.jr-cell:hover{outline:2px solid var(--accent,#C9A84C);outline-offset:-2px;}' +
      '.jr-cell.p{background:rgba(46,158,91,.18);color:#2e9e5b;}' +
      '.jr-cell.n{background:rgba(229,57,53,.16);color:#e53935;}' +
      '.jr-cell.e{background:rgba(201,168,76,.20);color:#b58e2e;}' +
      '.jr-cell.s{background:rgba(34,158,217,.16);color:#1f8fc4;}' +
      '.jr-total{font-weight:700;}' +
      '.jr-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:.8rem;color:var(--text-muted);}' +
      '.jr-legend span b{display:inline-block;width:18px;text-align:center;border-radius:3px;margin-right:4px;}' +
      '.jr-msg{font-size:.85rem;margin-top:10px;min-height:1.1em;}.jr-msg.ok{color:#2e9e5b;}.jr-msg.err{color:#e53935;}.jr-msg.wait{color:var(--text-muted);}' +
      '.jr-empty{color:var(--text-muted);padding:8px 0;}' +
      '.jr-members{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;}' +
      '.jr-chip{display:inline-flex;align-items:center;gap:6px;background:var(--bg,#f4f4f5);border:1px solid var(--border);border-radius:999px;padding:3px 6px 3px 10px;font-size:.82rem;}' +
      '.jr-chip button{border:none;background:none;cursor:pointer;color:#e53935;font-size:1rem;line-height:1;}' +
      '.jr-sched-row{display:flex;gap:6px;align-items:center;margin-bottom:6px;}' +
      '.jr-sched-row select,.jr-sched-row input{min-width:0;}' +
      '.jr-inline{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}';
    var st = document.createElement('style');
    st.id = 'jr-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* Hide the legacy mock journal (topics/homework) on these pages so there
     aren't two journals. The roots exist in the HTML before account.js fills
     them, so we can hide synchronously. */
  function hideMock() {
    ['admin-journal-root', 'journal-root'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var main = document.querySelector('.cab-main');
    if (main) {
      var bar = main.querySelector('.cab-toolbar');
      if (bar && bar.querySelector('[data-add-journal]')) bar.style.display = 'none';
    }
  }

  /* ================= data helpers (direct Supabase, RLS-gated) ========= */
  function loadGroups() {
    return sb.from('study_groups').select('*').eq('active', true)
      .order('created_at', { ascending: true })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function loadTeachers() {
    return sb.from('profiles').select('id,name,role').in('role', ['teacher', 'admin', 'director'])
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function loadStudents() {
    return sb.from('profiles').select('id,name,phone').eq('role', 'student')
      .order('name', { ascending: true })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function loadMembers(gid) {
    return sb.from('group_members').select('student_id').eq('group_id', gid)
      .then(function (r) {
        if (r.error) throw r.error;
        var ids = (r.data || []).map(function (m) { return m.student_id; });
        if (!ids.length) return [];
        return sb.from('profiles').select('id,name').in('id', ids)
          .then(function (p) { if (p.error) throw p.error; return p.data || []; });
      });
  }
  function loadLessons(gid, startIso, endIso) {
    return sb.from('lessons').select('*').eq('group_id', gid)
      .gte('date', startIso).lte('date', endIso)
      .order('date', { ascending: true }).order('start_time', { ascending: true })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function loadAttendance(lessonIds) {
    if (!lessonIds.length) return Promise.resolve([]);
    return sb.from('attendance').select('lesson_id,student_id,status').in('lesson_id', lessonIds)
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }

  /* ================= STAFF VIEW ======================================= */
  function monthBounds(y, m) {
    var start = new Date(y, m, 1);
    var end = new Date(y, m + 1, 0);
    return { start: ymd(start), end: ymd(end), startDate: start, endDate: end };
  }
  function monthTitle(y, m) {
    var names = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    return names[m] + ' ' + y;
  }

  function staffView(root) {
    var state = { groups: [], teachers: [], gid: null, y: 0, m: 0 };
    var now = new Date();
    state.y = now.getFullYear();
    state.m = now.getMonth();
    var canManage = (me.role === 'admin' || me.role === 'director');

    root.innerHTML = '<div class="jr-card"><p class="jr-empty">Загрузка журнала…</p></div>';

    Promise.all([loadGroups(), canManage ? loadTeachers() : Promise.resolve([])]).then(function (res) {
      state.groups = res[0]; state.teachers = res[1];
      if (state.groups.length && !state.gid) state.gid = state.groups[0].id;
      renderShell();
    }).catch(function (e) {
      root.innerHTML = '<div class="jr-card"><p class="jr-msg err">Не удалось загрузить журнал: ' + esc(e.message || e) + '</p></div>';
    });

    function renderShell() {
      var groupOpts = state.groups.map(function (g) {
        return '<option value="' + esc(g.id) + '"' + (g.id === state.gid ? ' selected' : '') + '>' +
          esc(g.name) + ' · ' + esc(dirLabel(g.direction)) + '</option>';
      }).join('');

      root.innerHTML =
        '<div class="jr-card">' +
          '<div class="jr-controls">' +
            '<div class="form-group"><label>Группа</label>' +
              (state.groups.length
                ? '<select class="form-control" id="jr-group">' + groupOpts + '</select>'
                : '<span class="jr-empty">Групп пока нет</span>') +
            '</div>' +
            (canManage ? '<button class="btn btn-outline btn-sm" id="jr-newgroup">+ Новая группа</button>' : '') +
            '<div class="jr-month form-group"><label style="width:100%">Месяц</label>' +
              '<button class="btn btn-ghost btn-sm" id="jr-prev">‹</button>' +
              '<b id="jr-mtitle">' + monthTitle(state.y, state.m) + '</b>' +
              '<button class="btn btn-ghost btn-sm" id="jr-next">›</button>' +
            '</div>' +
          '</div>' +
          '<div id="jr-manage"></div>' +
          '<div id="jr-grid"></div>' +
          '<div class="jr-msg" id="jr-msg"></div>' +
        '</div>';

      bindShell();
      if (state.gid) { renderManage(); renderGrid(); }
      else if (canManage) { renderNewGroupForm(); }
    }

    function bindShell() {
      var gsel = document.getElementById('jr-group');
      if (gsel) gsel.addEventListener('change', function () { state.gid = gsel.value; renderManage(); renderGrid(); });
      var nb = document.getElementById('jr-newgroup');
      if (nb) nb.addEventListener('click', renderNewGroupForm);
      document.getElementById('jr-prev').addEventListener('click', function () { stepMonth(-1); });
      document.getElementById('jr-next').addEventListener('click', function () { stepMonth(1); });
    }
    function stepMonth(d) {
      state.m += d;
      if (state.m < 0) { state.m = 11; state.y--; }
      if (state.m > 11) { state.m = 0; state.y++; }
      document.getElementById('jr-mtitle').textContent = monthTitle(state.y, state.m);
      renderGrid();
    }
    function msg(t, k) { var el = document.getElementById('jr-msg'); if (el) { el.textContent = t || ''; el.className = 'jr-msg' + (k ? ' ' + k : ''); } }

    /* ---- create group (admin/director) ---- */
    function renderNewGroupForm() {
      if (!canManage) return;
      var box = document.getElementById('jr-manage') || root;
      var dirOpts = DIRECTIONS.map(function (d) { return '<option value="' + d.value + '">' + esc(d.label) + '</option>'; }).join('');
      var teachOpts = '<option value="">— преподаватель —</option>' + state.teachers.map(function (t) {
        return '<option value="' + esc(t.id) + '">' + esc(t.name || t.id) + '</option>';
      }).join('');
      box.innerHTML =
        '<div class="jr-card" style="background:rgba(201,168,76,.06)">' +
          '<h3 style="margin:0 0 10px">Новая группа</h3>' +
          '<div class="jr-inline">' +
            '<div class="form-group"><label>Направление</label><select class="form-control" id="ng-dir">' + dirOpts + '</select></div>' +
            '<div class="form-group"><label>Название</label><input class="form-control" id="ng-name" placeholder="напр. Гитара · ср/пт 17:00"></div>' +
            '<div class="form-group"><label>Преподаватель</label><select class="form-control" id="ng-teacher">' + teachOpts + '</select></div>' +
          '</div>' +
          '<label style="display:block;font-size:.72rem;text-transform:uppercase;color:var(--text-muted);margin:10px 0 4px">Расписание</label>' +
          '<div id="ng-sched"></div>' +
          '<button class="btn btn-ghost btn-sm" id="ng-addslot" type="button">+ слот</button>' +
          '<div class="jr-inline" style="margin-top:12px">' +
            '<button class="btn btn-primary btn-sm" id="ng-save" type="button">Создать группу</button>' +
            '<button class="btn btn-ghost btn-sm" id="ng-cancel" type="button">Отмена</button>' +
          '</div>' +
          '<div class="jr-msg" id="ng-msg"></div>' +
        '</div>';

      addSlotRow();
      document.getElementById('ng-addslot').addEventListener('click', addSlotRow);
      document.getElementById('ng-cancel').addEventListener('click', function () { renderManage(); renderGrid(); });
      document.getElementById('ng-save').addEventListener('click', saveGroup);

      function addSlotRow() {
        var wrap = document.getElementById('ng-sched');
        var row = document.createElement('div');
        row.className = 'jr-sched-row';
        var dayOpts = DOW.map(function (d, i) { return '<option value="' + i + '"' + (i === 3 ? ' selected' : '') + '>' + d + '</option>'; }).join('');
        row.innerHTML =
          '<select class="form-control jr-d">' + dayOpts + '</select>' +
          '<input class="form-control jr-s" type="time" value="17:00">' +
          '<span>–</span>' +
          '<input class="form-control jr-e" type="time" value="18:00">' +
          '<button class="btn btn-ghost btn-sm" type="button">✕</button>';
        row.querySelector('button').addEventListener('click', function () { row.remove(); });
        wrap.appendChild(row);
      }

      function saveGroup() {
        var dir = document.getElementById('ng-dir').value;
        var name = document.getElementById('ng-name').value.trim();
        var teacher = document.getElementById('ng-teacher').value || null;
        var sched = [].map.call(document.querySelectorAll('#ng-sched .jr-sched-row'), function (r) {
          return { day: parseInt(r.querySelector('.jr-d').value, 10), start: r.querySelector('.jr-s').value, end: r.querySelector('.jr-e').value };
        }).filter(function (s) { return s.start; });
        var ngMsg = document.getElementById('ng-msg');
        if (!name) { ngMsg.textContent = 'Укажите название группы.'; ngMsg.className = 'jr-msg err'; return; }
        if (!sched.length) { ngMsg.textContent = 'Добавьте хотя бы один слот расписания.'; ngMsg.className = 'jr-msg err'; return; }
        ngMsg.textContent = 'Сохраняем…'; ngMsg.className = 'jr-msg wait';
        sb.from('study_groups').insert({ direction: dir, name: name, teacher_id: teacher, schedule: sched })
          .select('*').single()
          .then(function (r) {
            if (r.error) throw r.error;
            state.groups.push(r.data); state.gid = r.data.id;
            renderShell();
          }).catch(function (e) { ngMsg.textContent = 'Ошибка: ' + (e.message || e); ngMsg.className = 'jr-msg err'; });
      }
    }

    /* ---- members management ---- */
    function renderManage() {
      var box = document.getElementById('jr-manage');
      if (!box || !state.gid) { if (box) box.innerHTML = ''; return; }
      var g = state.groups.filter(function (x) { return x.id === state.gid; })[0];
      box.innerHTML = '<div class="jr-empty">Загрузка состава…</div>';
      loadMembers(state.gid).then(function (members) {
        var chips = members.length ? members.map(function (s) {
          return '<span class="jr-chip">' + esc(s.name || s.id) +
            (canManage ? '<button data-rm="' + esc(s.id) + '" title="Убрать">✕</button>' : '') + '</span>';
        }).join('') : '<span class="jr-empty">В группе пока нет учеников.</span>';
        box.innerHTML =
          '<div style="margin-bottom:10px">' +
            '<div class="jr-inline" style="justify-content:space-between">' +
              '<div><strong>' + esc(g.name) + '</strong> · ' + esc(dirLabel(g.direction)) +
                ' · ' + (g.schedule || []).map(function (s) { return DOW[s.day] + ' ' + s.start; }).join(', ') + '</div>' +
              '<button class="btn btn-outline btn-sm" id="jr-gen">Сгенерировать занятия за месяц</button>' +
            '</div>' +
            '<div class="jr-members">' + chips + '</div>' +
            (canManage ? '<div class="jr-inline"><select class="form-control" id="jr-addstu"><option value="">+ добавить ученика…</option></select></div>' : '') +
          '</div>';
        document.getElementById('jr-gen').addEventListener('click', function () { generateLessons(g); });
        if (canManage) wireAddStudent(members);
        box.querySelectorAll('[data-rm]').forEach(function (b) {
          b.addEventListener('click', function () {
            b.disabled = true;
            sb.from('group_members').delete().eq('group_id', state.gid).eq('student_id', b.getAttribute('data-rm'))
              .then(function (r) { if (r.error) throw r.error; renderManage(); renderGrid(); })
              .catch(function (e) { b.disabled = false; msg('Ошибка: ' + (e.message || e), 'err'); });
          });
        });
      }).catch(function (e) { box.innerHTML = '<p class="jr-msg err">Состав не загрузился: ' + esc(e.message || e) + '</p>'; });
    }

    function wireAddStudent(members) {
      var sel = document.getElementById('jr-addstu');
      if (!sel) return;
      var have = {}; members.forEach(function (m) { have[m.id] = 1; });
      loadStudents().then(function (all) {
        all.filter(function (s) { return !have[s.id]; }).forEach(function (s) {
          var o = document.createElement('option'); o.value = s.id; o.textContent = (s.name || s.id) + (s.phone ? ' · ' + s.phone : '');
          sel.appendChild(o);
        });
      });
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        sel.disabled = true;
        sb.from('group_members').insert({ group_id: state.gid, student_id: sel.value })
          .then(function (r) { if (r.error) throw r.error; renderManage(); renderGrid(); })
          .catch(function (e) { sel.disabled = false; msg('Ошибка: ' + (e.message || e), 'err'); });
      });
    }

    /* ---- generate lessons from the group's schedule for the current month ---- */
    function generateLessons(g) {
      var b = monthBounds(state.y, state.m);
      var sched = g.schedule || [];
      if (!sched.length) { msg('У группы нет расписания.', 'err'); return; }
      var byDay = {};
      sched.forEach(function (s) { (byDay[s.day] = byDay[s.day] || []).push(s); });
      var rows = [];
      var d = new Date(b.startDate);
      while (d <= b.endDate) {
        var slots = byDay[d.getDay()];
        if (slots) slots.forEach(function (s) { rows.push({ group_id: g.id, date: ymd(d), start_time: s.start }); });
        d.setDate(d.getDate() + 1);
      }
      if (!rows.length) { msg('В этом месяце нет дней по расписанию группы.', 'err'); return; }
      msg('Создаём занятия…', 'wait');
      sb.from('lessons').upsert(rows, { onConflict: 'group_id,date,start_time', ignoreDuplicates: true })
        .then(function (r) { if (r.error) throw r.error; msg('Готово: занятий в месяце — ' + rows.length + '.', 'ok'); renderGrid(); })
        .catch(function (e) { msg('Ошибка генерации: ' + (e.message || e), 'err'); });
    }

    /* ---- attendance grid ---- */
    function renderGrid() {
      var box = document.getElementById('jr-grid');
      if (!box || !state.gid) { if (box) box.innerHTML = ''; return; }
      var b = monthBounds(state.y, state.m);
      box.innerHTML = '<div class="jr-empty">Загрузка сетки…</div>';
      Promise.all([loadMembers(state.gid), loadLessons(state.gid, b.start, b.end)]).then(function (res) {
        var members = res[0], lessons = res[1];
        if (!lessons.length) { box.innerHTML = '<p class="jr-empty">За ' + monthTitle(state.y, state.m) + ' занятий нет. Нажмите «Сгенерировать занятия за месяц».</p>'; return; }
        if (!members.length) { box.innerHTML = '<p class="jr-empty">В группе нет учеников — добавьте состав выше.</p>'; return; }
        var lessonIds = lessons.map(function (l) { return l.id; });
        loadAttendance(lessonIds).then(function (att) {
          var amap = {}; att.forEach(function (a) { amap[a.lesson_id + '|' + a.student_id] = a.status; });
          drawGrid(box, members, lessons, amap);
        });
      }).catch(function (e) { box.innerHTML = '<p class="jr-msg err">Сетка не загрузилась: ' + esc(e.message || e) + '</p>'; });
    }

    function drawGrid(box, members, lessons, amap) {
      var head = '<th class="jr-name">Ученик</th>' + lessons.map(function (l) {
        return '<th title="' + esc(l.start_time || '') + '">' + ddmm(l.date) + '</th>';
      }).join('') + '<th>Итог</th>';

      var body = members.map(function (s) {
        var present = 0;
        var cells = lessons.map(function (l) {
          var key = l.id + '|' + s.id;
          var st = amap[key] || null;
          if (st === 'present') present++;
          var meta = st ? ST[st] : null;
          return '<td class="jr-cell ' + (meta ? meta.cls : '') + '" data-lesson="' + esc(l.id) + '" data-student="' + esc(s.id) + '"' +
            (meta ? ' title="' + meta.title + '"' : '') + '>' + (meta ? meta.ch : '') + '</td>';
        }).join('');
        return '<tr><td class="jr-name">' + esc(s.name || s.id) + '</td>' + cells +
          '<td class="jr-total" data-total="' + esc(s.id) + '">' + present + '/' + lessons.length + '</td></tr>';
      }).join('');

      box.innerHTML =
        '<div class="jr-grid-wrap"><table class="jr-grid">' +
          '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody>' +
        '</table></div>' +
        '<div class="jr-legend">' +
          '<span><b class="jr-cell p">П</b>был</span><span><b class="jr-cell n">Н</b>не был</span>' +
          '<span><b class="jr-cell e">У</b>уважительная</span><span><b class="jr-cell s">Б</b>болел</span>' +
          '<span style="color:var(--text-muted)">Клик по ячейке — смена статуса</span>' +
        '</div>';

      box.querySelectorAll('.jr-cell[data-lesson]').forEach(function (cell) {
        cell.addEventListener('click', function () { onCellClick(cell, lessons.length); });
      });
    }

    function onCellClick(cell, totalLessons) {
      var lessonId = cell.getAttribute('data-lesson');
      var studentId = cell.getAttribute('data-student');
      var cur = null;
      ['p', 'n', 'e', 's'].forEach(function (c) { if (cell.classList.contains(c)) {
        cur = { p: 'present', n: 'absent', e: 'excused', s: 'sick' }[c];
      } });
      var next = nextStatus(cur);

      // optimistic UI
      cell.classList.remove('p', 'n', 'e', 's');
      if (next) { cell.classList.add(ST[next].cls); cell.textContent = ST[next].ch; cell.title = ST[next].title; }
      else { cell.textContent = ''; cell.removeAttribute('title'); }
      recountRow(studentId, totalLessons);

      var op;
      if (!next) {
        op = sb.from('attendance').delete().eq('lesson_id', lessonId).eq('student_id', studentId);
      } else {
        op = sb.from('attendance').upsert(
          { lesson_id: lessonId, student_id: studentId, status: next, marked_by: me.id, marked_at: new Date().toISOString() },
          { onConflict: 'lesson_id,student_id' }
        );
      }
      op.then(function (r) { if (r.error) throw r.error; msg('Сохранено', 'ok'); setTimeout(function () { msg(''); }, 1200); })
        .catch(function (e) { msg('Не сохранилось: ' + (e.message || e), 'err'); });
    }

    function recountRow(studentId, totalLessons) {
      var cells = root.querySelectorAll('.jr-cell[data-student="' + cssEsc(studentId) + '"]');
      var present = 0; cells.forEach(function (c) { if (c.classList.contains('p')) present++; });
      var tot = root.querySelector('[data-total="' + cssEsc(studentId) + '"]');
      if (tot) tot.textContent = present + '/' + totalLessons;
    }
  }

  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* ================= STUDENT VIEW (read-only own marks) =============== */
  function studentView(root) {
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    root.innerHTML = '<div class="jr-card"><p class="jr-empty">Загрузка журнала…</p></div>';

    loadGroups().then(function (groups) {
      if (!groups.length) { root.innerHTML = '<div class="jr-card"><p class="jr-empty">Вы пока не записаны в учебную группу. Обратитесь к администратору студии.</p></div>'; return; }
      var b = monthBounds(y, m);
      var blocks = [];
      var chain = Promise.resolve();
      groups.forEach(function (g) {
        chain = chain.then(function () {
          return loadLessons(g.id, b.start, b.end).then(function (lessons) {
            if (!lessons.length) { blocks.push(groupBlock(g, lessons, {})); return; }
            return loadAttendance(lessons.map(function (l) { return l.id; })).then(function (att) {
              var amap = {}; att.forEach(function (a) { if (a.student_id === me.id) amap[a.lesson_id] = a.status; });
              blocks.push(groupBlock(g, lessons, amap));
            });
          });
        });
      });
      chain.then(function () {
        root.innerHTML =
          '<div class="jr-card"><div class="jr-inline" style="justify-content:space-between;margin-bottom:8px">' +
            '<strong>Посещаемость · ' + monthTitle(y, m) + '</strong></div>' +
            blocks.join('') +
          '</div>';
      });
    }).catch(function (e) {
      root.innerHTML = '<div class="jr-card"><p class="jr-msg err">Не удалось загрузить журнал: ' + esc(e.message || e) + '</p></div>';
    });

    function groupBlock(g, lessons, amap) {
      if (!lessons.length) {
        return '<div style="margin:10px 0"><strong>' + esc(g.name) + '</strong> · ' + esc(dirLabel(g.direction)) +
          '<div class="jr-empty">Занятий за месяц нет.</div></div>';
      }
      var present = 0;
      var cells = lessons.map(function (l) {
        var st = amap[l.id] || null; if (st === 'present') present++;
        var meta = st ? ST[st] : null;
        return '<td class="jr-cell ' + (meta ? meta.cls : '') + '" style="cursor:default" title="' + (meta ? meta.title : '') + '">' +
          ddmm(l.date) + (meta ? ' ' + meta.ch : '') + '</td>';
      }).join('');
      return '<div style="margin:12px 0">' +
        '<strong>' + esc(g.name) + '</strong> · ' + esc(dirLabel(g.direction)) +
        ' — посещено <b>' + present + '</b> из ' + lessons.length +
        '<div class="jr-grid-wrap" style="margin-top:6px"><table class="jr-grid"><tbody><tr>' + cells + '</tr></tbody></table></div>' +
        '</div>';
    }
  }

  /* ================= mount ============================================ */
  function mount() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    if (!window.SUPA || !window.SUPA.enabled || !window.SUPA.enabled()) {
      root.innerHTML = '<div class="jr-card"><p class="jr-empty">Журнал доступен после входа через аккаунт студии.</p></div>';
      return;
    }
    sb = window.SUPA.client;
    injectStyles();
    hideMock();
    var view = root.getAttribute('data-view') || 'student';
    root.innerHTML = '<div class="jr-card"><p class="jr-empty">Загрузка…</p></div>';
    window.SUPA.myProfile().then(function (p) {
      me = p;
      if (!me) { root.innerHTML = '<div class="jr-card"><p class="jr-empty">Войдите в аккаунт, чтобы открыть журнал.</p></div>'; return; }
      if (view === 'staff' && (me.role === 'admin' || me.role === 'director' || me.role === 'teacher')) staffView(root);
      else studentView(root);
    }).catch(function (e) {
      root.innerHTML = '<div class="jr-card"><p class="jr-msg err">Ошибка: ' + esc(e.message || e) + '</p></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
