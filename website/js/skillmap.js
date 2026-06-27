/* =====================================================================
   КАРТА РАЗВИТИЯ И ОЦЕНКИ  (Phase 3 P1 — Задача 9)
   ---------------------------------------------------------------------
   Приватность обеспечивает БД (RLS из 0013): этот модуль лишь рисует то,
   что вернулось. Ребёнку <18 оценки не приходят из БД вовсе — UI просто
   показывает мягкую карту навыков без чисел.

   Два режима по точке монтирования:
     • #skillmap-root      (admin-skillmap.html) — персонал: прогресс по
        навыкам, оценки, возраст ученика, привязка родителя.
     • #development-root    (progress.html) — ученик/родитель: своя карта.

   Подключается ПОСЛЕ supa.js и account.js.
   ===================================================================== */
(function () {
  'use strict';

  var DIRECTIONS = [
    { value: 'guitar',   label: 'Гитара / укулеле' },
    { value: 'acting',   label: 'Актёрское / ораторское' },
    { value: 'vocals',   label: 'Вокал' },
    { value: 'dance',    label: 'Современный танец' },
    { value: 'painting', label: 'Живопись' }
  ];
  function dirLabel(v) { for (var i = 0; i < DIRECTIONS.length; i++) if (DIRECTIONS[i].value === v) return DIRECTIONS[i].label; return v || '—'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  var sb = null, me = null;

  function injectStyles() {
    if (document.getElementById('sm-styles')) return;
    var css =
      '.sm-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:20px;}' +
      '.sm-row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;}' +
      '.sm-row label{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin-bottom:4px;}' +
      '.sm-skill{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid var(--border);}' +
      '.sm-skill .sm-name{flex:1;min-width:140px;}' +
      '.sm-dots{display:flex;gap:4px;}' +
      '.sm-dot{width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg,#f4f4f5);cursor:pointer;font-size:.78rem;color:var(--text-muted);}' +
      '.sm-dot.on{background:var(--accent,#C9A84C);color:#1A1A1A;border-color:var(--accent,#C9A84C);font-weight:700;}' +
      '.sm-dot.ro{cursor:default;}' +
      '.sm-bar{flex:1;height:10px;border-radius:6px;background:var(--bg,#eee);overflow:hidden;min-width:120px;}' +
      '.sm-bar i{display:block;height:100%;background:linear-gradient(90deg,#C9A84C,#E30613);}' +
      '.sm-lvl{font-size:.8rem;color:var(--text-muted);min-width:34px;text-align:right;}' +
      '.sm-assess{font-size:.86rem;border-collapse:collapse;width:100%;margin-top:8px;}' +
      '.sm-assess th,.sm-assess td{border:1px solid var(--border);padding:6px 8px;text-align:left;}' +
      '.sm-msg{font-size:.85rem;margin-top:8px;min-height:1.1em;}.sm-msg.ok{color:#2e9e5b;}.sm-msg.err{color:#e53935;}.sm-msg.wait{color:var(--text-muted);}' +
      '.sm-empty{color:var(--text-muted);padding:8px 0;}' +
      '.sm-chip{display:inline-flex;align-items:center;gap:6px;background:var(--bg,#f4f4f5);border:1px solid var(--border);border-radius:999px;padding:3px 6px 3px 10px;font-size:.82rem;margin:0 6px 6px 0;}' +
      '.sm-chip button{border:none;background:none;cursor:pointer;color:#e53935;}' +
      '.sm-soft-note{background:rgba(201,168,76,.10);border:1px solid rgba(201,168,76,.4);border-radius:8px;padding:10px 12px;font-size:.85rem;color:#8a6d1f;margin-top:10px;}';
    var st = document.createElement('style'); st.id = 'sm-styles'; st.textContent = css; document.head.appendChild(st);
  }
  function hideMock() { var el = document.getElementById('admin-skillmap-root'); if (el) el.style.display = 'none'; }

  /* ---- shared data ---- */
  function loadRoster() {
    return sb.from('students').select('id,name,birth_date,user_id').order('name').then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function loadSkills(direction) {
    return sb.from('skills').select('id,name,description,sort').eq('direction', direction).order('sort')
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function loadStudentSkills(studentId) {
    return sb.from('student_skills').select('skill_id,level').eq('student_id', studentId)
      .then(function (r) { if (r.error) throw r.error; var m = {}; (r.data || []).forEach(function (x) { m[x.skill_id] = x.level; }); return m; });
  }
  function loadAssessments(studentId) {
    // RLS decides if these come back at all (child <18 → empty).
    return sb.from('assessments').select('id,date,score,comment').eq('student_id', studentId).order('date', { ascending: false })
      .then(function (r) { if (r.error) return []; return r.data || []; });
  }

  /* ================= STAFF EDITOR ===================================== */
  function staffView(root) {
    var st = { roster: [], studentId: null, direction: 'guitar' };
    root.innerHTML = '<div class="sm-card"><p class="sm-empty">Загрузка…</p></div>';
    loadRoster().then(function (r) {
      st.roster = r;
      if (r.length) st.studentId = r[0].id;
      shell();
    }).catch(function (e) { root.innerHTML = '<div class="sm-card"><p class="sm-msg err">Ошибка: ' + esc(e.message || e) + '</p></div>'; });

    function shell() {
      var stuOpts = st.roster.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === st.studentId ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
      var dirOpts = DIRECTIONS.map(function (d) { return '<option value="' + d.value + '"' + (d.value === st.direction ? ' selected' : '') + '>' + esc(d.label) + '</option>'; }).join('');
      root.innerHTML =
        '<div class="sm-card">' +
          '<div class="sm-row">' +
            '<div><label>Ученик</label>' + (st.roster.length ? '<select class="form-control" id="sm-stu">' + stuOpts + '</select>' : '<span class="sm-empty">Нет учеников — заведите в журнале</span>') + '</div>' +
            '<div><label>Направление</label><select class="form-control" id="sm-dir">' + dirOpts + '</select></div>' +
            '<div id="sm-age"></div>' +
          '</div>' +
        '</div>' +
        '<div class="sm-card"><h3 style="margin:0 0 8px">Навыки</h3><div id="sm-skills"></div>' +
          '<div class="sm-row" style="margin-top:10px"><div><label>Новый навык</label><input class="form-control" id="sm-newskill" placeholder="название навыка"></div>' +
          '<button class="btn btn-ghost btn-sm" id="sm-addskill" type="button">+ в каталог</button></div>' +
          '<div class="sm-msg" id="sm-skmsg"></div>' +
        '</div>' +
        '<div class="sm-card"><h3 style="margin:0 0 8px">Оценки</h3>' +
          '<div class="sm-row"><div><label>Дата</label><input class="form-control" id="sm-adate" type="date"></div>' +
          '<div><label>Оценка</label><input class="form-control" id="sm-ascore" type="number" min="0" max="10" step="1" style="width:90px"></div>' +
          '<div style="flex:1"><label>Комментарий</label><input class="form-control" id="sm-acomment" placeholder="напр. отличный прогресс в ритме"></div>' +
          '<button class="btn btn-primary btn-sm" id="sm-addassess" type="button">Добавить</button></div>' +
          '<div id="sm-assess-list" style="margin-top:10px"></div>' +
        '</div>' +
        '<div class="sm-card"><h3 style="margin:0 0 8px">Родители (доступ к оценкам ребёнка)</h3>' +
          '<div id="sm-guardians"></div>' +
          '<div class="sm-row" style="margin-top:8px"><div><label>Привязать родителя</label><select class="form-control" id="sm-addguard"><option value="">— аккаунт родителя —</option></select></div></div>' +
        '</div>';

      var ssel = document.getElementById('sm-stu');
      if (ssel) ssel.addEventListener('change', function () { st.studentId = ssel.value; refreshAll(); });
      document.getElementById('sm-dir').addEventListener('change', function () { st.direction = this.value; renderSkills(); });
      document.getElementById('sm-addskill').addEventListener('click', addSkill);
      document.getElementById('sm-addassess').addEventListener('click', addAssessment);
      var ad = document.getElementById('sm-adate'); if (ad) ad.value = new Date().toISOString().slice(0, 10);
      refreshAll();
    }

    function refreshAll() { renderAge(); renderSkills(); renderAssessments(); renderGuardians(); }

    function curStudent() { return st.roster.filter(function (s) { return s.id === st.studentId; })[0]; }

    function renderAge() {
      var box = document.getElementById('sm-age'); if (!box) return;
      var s = curStudent(); if (!s) { box.innerHTML = ''; return; }
      box.innerHTML = '<label>Дата рождения</label><div class="sm-row"><input class="form-control" id="sm-bdate" type="date" value="' + (s.birth_date || '') + '">' +
        '<button class="btn btn-ghost btn-sm" id="sm-savebdate" type="button">Сохранить</button></div>';
      document.getElementById('sm-savebdate').addEventListener('click', function () {
        var v = document.getElementById('sm-bdate').value || null;
        sb.from('students').update({ birth_date: v }).eq('id', st.studentId).then(function (r) {
          if (r.error) { skmsg('Ошибка: ' + r.error.message, 'err'); return; }
          s.birth_date = v; skmsg('Дата рождения сохранена. Возраст влияет на видимость оценок ребёнку.', 'ok');
        });
      });
    }
    function skmsg(t, k) { var el = document.getElementById('sm-skmsg'); if (el) { el.textContent = t || ''; el.className = 'sm-msg' + (k ? ' ' + k : ''); } }

    function renderSkills() {
      var box = document.getElementById('sm-skills'); if (!box || !st.studentId) { if (box) box.innerHTML = '<p class="sm-empty">Выберите ученика.</p>'; return; }
      box.innerHTML = '<p class="sm-empty">Загрузка навыков…</p>';
      Promise.all([loadSkills(st.direction), loadStudentSkills(st.studentId)]).then(function (res) {
        var skills = res[0], levels = res[1];
        if (!skills.length) { box.innerHTML = '<p class="sm-empty">Нет навыков для направления. Добавьте ниже.</p>'; return; }
        box.innerHTML = skills.map(function (sk) {
          var lvl = levels[sk.id] || 0;
          var dots = [0,1,2,3,4,5].map(function (n) {
            return '<button type="button" class="sm-dot' + (n <= lvl && n > 0 ? ' on' : (n === 0 && lvl === 0 ? '' : '')) + '" data-skill="' + esc(sk.id) + '" data-lvl="' + n + '">' + n + '</button>';
          }).join('');
          return '<div class="sm-skill"><span class="sm-name">' + esc(sk.name) + '</span><div class="sm-dots">' + dots + '</div></div>';
        }).join('');
        box.querySelectorAll('.sm-dot').forEach(function (b) {
          b.addEventListener('click', function () {
            var skillId = b.getAttribute('data-skill'); var lvl = parseInt(b.getAttribute('data-lvl'), 10);
            sb.from('student_skills').upsert({ student_id: st.studentId, skill_id: skillId, level: lvl, teacher_id: me.id, updated_at: new Date().toISOString() }, { onConflict: 'student_id,skill_id' })
              .then(function (r) { if (r.error) throw r.error; renderSkills(); })
              .catch(function (e) { skmsg('Ошибка: ' + (e.message || e), 'err'); });
          });
        });
      }).catch(function (e) { box.innerHTML = '<p class="sm-msg err">' + esc(e.message || e) + '</p>'; });
    }

    function addSkill() {
      var inp = document.getElementById('sm-newskill'); var name = (inp.value || '').trim();
      if (!name) { skmsg('Введите название навыка.', 'err'); return; }
      sb.from('skills').insert({ direction: st.direction, name: name }).then(function (r) {
        if (r.error) { skmsg('Ошибка: ' + r.error.message, 'err'); return; }
        inp.value = ''; renderSkills();
      });
    }

    function renderAssessments() {
      var box = document.getElementById('sm-assess-list'); if (!box || !st.studentId) return;
      loadAssessments(st.studentId).then(function (list) {
        if (!list.length) { box.innerHTML = '<p class="sm-empty">Оценок пока нет.</p>'; return; }
        box.innerHTML = '<table class="sm-assess"><thead><tr><th>Дата</th><th>Оценка</th><th>Комментарий</th><th></th></tr></thead><tbody>' +
          list.map(function (a) {
            return '<tr><td>' + esc(a.date) + '</td><td>' + (a.score == null ? '—' : esc(a.score)) + '</td><td>' + esc(a.comment || '') + '</td>' +
              '<td><button class="btn btn-ghost btn-sm" data-del="' + esc(a.id) + '">✕</button></td></tr>';
          }).join('') + '</tbody></table>';
        box.querySelectorAll('[data-del]').forEach(function (b) {
          b.addEventListener('click', function () {
            sb.from('assessments').delete().eq('id', b.getAttribute('data-del')).then(function (r) { if (!r.error) renderAssessments(); });
          });
        });
      });
    }

    function addAssessment() {
      var date = document.getElementById('sm-adate').value || new Date().toISOString().slice(0, 10);
      var score = document.getElementById('sm-ascore').value;
      var comment = (document.getElementById('sm-acomment').value || '').trim();
      if (score === '' && !comment) { skmsg('Укажите оценку или комментарий.', 'err'); return; }
      sb.from('assessments').insert({ student_id: st.studentId, date: date, score: score === '' ? null : Number(score), comment: comment || null, created_by: me.id })
        .then(function (r) {
          if (r.error) { skmsg('Ошибка: ' + r.error.message, 'err'); return; }
          document.getElementById('sm-ascore').value = ''; document.getElementById('sm-acomment').value = '';
          renderAssessments();
        });
    }

    function renderGuardians() {
      var box = document.getElementById('sm-guardians'); if (!box || !st.studentId) return;
      box.innerHTML = '<p class="sm-empty">Загрузка…</p>';
      sb.from('student_guardians').select('parent_id').eq('student_id', st.studentId).then(function (r) {
        var ids = (r.data || []).map(function (x) { return x.parent_id; });
        var renderChips = function (names) {
          box.innerHTML = ids.length ? ids.map(function (pid) {
            return '<span class="sm-chip">' + esc(names[pid] || pid) + '<button data-rmg="' + esc(pid) + '">✕</button></span>';
          }).join('') : '<span class="sm-empty">Родители не привязаны.</span>';
          box.querySelectorAll('[data-rmg]').forEach(function (b) {
            b.addEventListener('click', function () {
              sb.from('student_guardians').delete().eq('student_id', st.studentId).eq('parent_id', b.getAttribute('data-rmg'))
                .then(function (x) { if (!x.error) renderGuardians(); });
            });
          });
        };
        if (!ids.length) { renderChips({}); }
        else sb.from('profiles').select('id,name').in('id', ids).then(function (p) {
          var nm = {}; (p.data || []).forEach(function (x) { nm[x.id] = x.name; }); renderChips(nm);
        });
      });
      // populate parent select
      var sel = document.getElementById('sm-addguard');
      if (sel && sel.options.length <= 1) {
        sb.from('profiles').select('id,name,phone').eq('role', 'parent').order('name').then(function (p) {
          (p.data || []).forEach(function (x) {
            var o = document.createElement('option'); o.value = x.id; o.textContent = (x.name || x.id) + (x.phone ? ' · ' + x.phone : ''); sel.appendChild(o);
          });
        });
        sel.addEventListener('change', function () {
          if (!sel.value) return; sel.disabled = true;
          sb.from('student_guardians').insert({ student_id: st.studentId, parent_id: sel.value })
            .then(function (r) { sel.disabled = false; sel.value = ''; if (r.error && r.error.code !== '23505') skmsg('Ошибка: ' + r.error.message, 'err'); renderGuardians(); });
        });
      }
    }
  }

  /* ================= LEARNER VIEW (student / parent) ================== */
  function learnerView(root) {
    root.innerHTML = '<div class="sm-card"><p class="sm-empty">Загрузка карты развития…</p></div>';
    // Which roster students belong to me? self (user_id) OR my children (guardian).
    Promise.all([
      sb.from('students').select('id,name,birth_date,user_id').eq('user_id', me.id),
      sb.from('student_guardians').select('student_id').eq('parent_id', me.id)
    ]).then(function (res) {
      var mine = (res[0].data || []);
      var childIds = (res[1].data || []).map(function (x) { return x.student_id; });
      var extra = childIds.filter(function (id) { return !mine.some(function (s) { return s.id === id; }); });
      var p = extra.length
        ? sb.from('students').select('id,name,birth_date,user_id').in('id', extra).then(function (r) { return mine.concat(r.data || []); })
        : Promise.resolve(mine);
      return p;
    }).then(function (students) {
      if (!students.length) {
        root.innerHTML = '<div class="sm-card"><p class="sm-empty">Карта развития появится, когда преподаватель отметит ваш прогресс. Если вы родитель — попросите администратора привязать вашего ребёнка к аккаунту.</p></div>';
        return;
      }
      var chain = Promise.resolve(); var blocks = [];
      students.forEach(function (s) {
        chain = chain.then(function () { return renderStudentCard(s).then(function (html) { blocks.push(html); }); });
      });
      chain.then(function () { root.innerHTML = blocks.join(''); });
    }).catch(function (e) {
      root.innerHTML = '<div class="sm-card"><p class="sm-msg err">Ошибка: ' + esc(e.message || e) + '</p></div>';
    });

    function renderStudentCard(s) {
      // gather skills across all directions the student has progress in
      return sb.from('student_skills').select('skill_id,level').eq('student_id', s.id).then(function (r) {
        var levels = {}; (r.data || []).forEach(function (x) { levels[x.skill_id] = x.level; });
        var skillIds = Object.keys(levels);
        var skillsP = skillIds.length ? sb.from('skills').select('id,name,direction').in('id', skillIds).then(function (x) { return x.data || []; }) : Promise.resolve([]);
        return Promise.all([skillsP, loadAssessments(s.id)]).then(function (rr) {
          var skills = rr[0], assess = rr[1];
          var bars = skills.length ? skills.map(function (sk) {
            var lvl = levels[sk.id] || 0;
            return '<div class="sm-skill"><span class="sm-name">' + esc(sk.name) + ' <span class="sm-empty" style="font-size:.75rem">· ' + esc(dirLabel(sk.direction)) + '</span></span>' +
              '<div class="sm-bar"><i style="width:' + (lvl * 20) + '%"></i></div><span class="sm-lvl">' + lvl + '/5</span></div>';
          }).join('') : '<p class="sm-empty">Преподаватель ещё не отметил навыки.</p>';

          var assessHtml = '';
          if (assess.length) {
            assessHtml = '<h4 style="margin:14px 0 6px">Оценки</h4><table class="sm-assess"><thead><tr><th>Дата</th><th>Оценка</th><th>Комментарий</th></tr></thead><tbody>' +
              assess.map(function (a) { return '<tr><td>' + esc(a.date) + '</td><td>' + (a.score == null ? '—' : esc(a.score)) + '</td><td>' + esc(a.comment || '') + '</td></tr>'; }).join('') +
              '</tbody></table>';
          } else {
            // No assessments returned — either none exist or hidden by age (<18).
            assessHtml = '<div class="sm-soft-note">Здесь отражается прогресс по навыкам. Числовые оценки в этом разделе не показываются — мы делаем акцент на росте, а не на баллах. 🌱</div>';
          }
          return '<div class="sm-card"><h3 style="margin:0 0 10px">' + esc(s.name) + '</h3>' + bars + assessHtml + '</div>';
        });
      });
    }
  }

  /* ================= mount =========================================== */
  function mount() {
    var staffRoot = document.getElementById('skillmap-root');
    var learnRoot = document.getElementById('skillmap-learner-mount');
    var root = staffRoot || learnRoot;
    if (!root) return;
    if (!window.SUPA || !window.SUPA.enabled || !window.SUPA.enabled()) {
      root.innerHTML = '<div class="sm-card"><p class="sm-empty">Раздел доступен после входа через аккаунт студии.</p></div>';
      return;
    }
    sb = window.SUPA.client;
    injectStyles(); hideMock();
    root.innerHTML = '<div class="sm-card"><p class="sm-empty">Загрузка…</p></div>';
    window.SUPA.myProfile().then(function (p) {
      me = p;
      if (!me) { root.innerHTML = '<div class="sm-card"><p class="sm-empty">Войдите в аккаунт.</p></div>'; return; }
      var staff = (me.role === 'admin' || me.role === 'director' || me.role === 'teacher');
      if (staffRoot && staff) staffView(staffRoot);
      else if (staffRoot) { staffRoot.innerHTML = '<div class="sm-card"><p class="sm-empty">Редактор карты развития доступен только персоналу.</p></div>'; }
      else learnerView(learnRoot);
    }).catch(function (e) { root.innerHTML = '<div class="sm-card"><p class="sm-msg err">Ошибка: ' + esc(e.message || e) + '</p></div>'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
