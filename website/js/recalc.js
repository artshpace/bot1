/* =====================================================================
   ПЕРЕРАСЧЁТ АБОНЕМЕНТА по фактической посещаемости (Phase 3 P1 — Задача 8)
   ---------------------------------------------------------------------
   Берёт пропуски из журнала (0010/0011), цену занятия по направлению
   (таблица pricing) и считает сумму к возврату/переносу за месяц.
   Доступ: только admin/director (RLS режет остальных в любом случае).

   Правило «что считать к возврату» настраивается галочками: по умолчанию
   только «Б» (болел/справка). История применённых перерасчётов пишется в
   public.recalculations.

   Подключается ПОСЛЕ supa.js и account.js. Монтируется в #recalc-root.
   ===================================================================== */
(function () {
  'use strict';

  var ROOT_ID = 'recalc-root';
  var LS_RULE = 'sas_recalc_rule';

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
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function money(n) { return (Math.round(n * 100) / 100).toLocaleString('ru-RU'); }
  function monthTitle(y, m) {
    var names = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    return names[m] + ' ' + y;
  }

  var sb = null, me = null;
  var state = { y: 0, m: 0, pricing: {}, rule: { sick: true, excused: false, absent: false }, rows: [] };

  function getRule() {
    try { var r = JSON.parse(localStorage.getItem(LS_RULE)); if (r) return r; } catch (e) {}
    return { sick: true, excused: false, absent: false };
  }
  function saveRule() { try { localStorage.setItem(LS_RULE, JSON.stringify(state.rule)); } catch (e) {} }
  function isRefundable(status) {
    return (status === 'sick' && state.rule.sick) ||
           (status === 'excused' && state.rule.excused) ||
           (status === 'absent' && state.rule.absent);
  }

  function injectStyles() {
    if (document.getElementById('rc-styles')) return;
    var css =
      '.rc-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:20px;}' +
      '.rc-row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;}' +
      '.rc-row label{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin-bottom:4px;}' +
      '.rc-price{display:flex;flex-wrap:wrap;gap:10px;}' +
      '.rc-price .rc-pcell{display:flex;flex-direction:column;gap:2px;}' +
      '.rc-price input{width:120px;}' +
      '.rc-month{display:flex;align-items:center;gap:8px;}.rc-month b{min-width:130px;text-align:center;}' +
      '.rc-checks{display:flex;gap:14px;flex-wrap:wrap;font-size:.85rem;}' +
      '.rc-checks label{display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:.85rem;color:var(--text);margin:0;}' +
      '.rc-grid-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:8px;}' +
      '.rc-table{border-collapse:collapse;width:100%;font-size:.86rem;}' +
      '.rc-table th,.rc-table td{border:1px solid var(--border);padding:7px 9px;text-align:center;white-space:nowrap;}' +
      '.rc-table th{background:var(--card-bg);font-size:.72rem;color:var(--text-muted);text-transform:uppercase;}' +
      '.rc-table td.rc-name{text-align:left;}' +
      '.rc-table input{width:80px;text-align:right;}' +
      '.rc-amount{font-weight:700;}' +
      '.rc-msg{font-size:.85rem;margin-top:10px;min-height:1.1em;}.rc-msg.ok{color:#2e9e5b;}.rc-msg.err{color:#e53935;}.rc-msg.wait{color:var(--text-muted);}' +
      '.rc-empty{color:var(--text-muted);padding:8px 0;}' +
      '.rc-hist td,.rc-hist th{font-size:.8rem;}';
    var st = document.createElement('style'); st.id = 'rc-styles'; st.textContent = css; document.head.appendChild(st);
  }

  function hideMock() {
    var el = document.getElementById('admin-recalculations-root');
    if (el) el.style.display = 'none';
  }

  function monthBounds(y, m) {
    return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) };
  }

  /* ---- data ---- */
  function loadPricing() {
    return sb.from('pricing').select('direction,price_per_lesson').then(function (r) {
      if (r.error) throw r.error;
      var map = {}; (r.data || []).forEach(function (p) { map[p.direction] = Number(p.price_per_lesson) || 0; });
      return map;
    });
  }
  function savePrice(direction, price) {
    return sb.from('pricing').upsert({ direction: direction, price_per_lesson: price, updated_at: new Date().toISOString() }, { onConflict: 'direction' })
      .then(function (r) { if (r.error) throw r.error; });
  }

  // Aggregate attendance for the month into per-student-per-direction rows.
  function computeRows() {
    var b = monthBounds(state.y, state.m);
    return sb.from('study_groups').select('id,direction,name').eq('active', true).then(function (gr) {
      if (gr.error) throw gr.error;
      var groups = gr.data || [];
      var agg = {}; // key student|direction
      var chain = Promise.resolve();
      groups.forEach(function (g) {
        chain = chain.then(function () {
          return Promise.all([
            sb.from('group_members').select('student_id').eq('group_id', g.id),
            sb.from('lessons').select('id,date').eq('group_id', g.id).gte('date', b.start).lte('date', b.end)
          ]).then(function (res) {
            if (res[0].error) throw res[0].error; if (res[1].error) throw res[1].error;
            var memberIds = (res[0].data || []).map(function (x) { return x.student_id; });
            var lessons = res[1].data || [];
            if (!memberIds.length || !lessons.length) return;
            var lessonIds = lessons.map(function (l) { return l.id; });
            // seed planned counts
            memberIds.forEach(function (sid) {
              var key = sid + '|' + g.direction;
              if (!agg[key]) agg[key] = { student_id: sid, direction: g.direction, planned: 0, attended: 0, refundable: 0 };
              agg[key].planned += lessons.length;
            });
            return sb.from('attendance').select('student_id,status,lesson_id').in('lesson_id', lessonIds).then(function (at) {
              if (at.error) throw at.error;
              (at.data || []).forEach(function (a) {
                var key = a.student_id + '|' + g.direction;
                if (!agg[key]) return;
                if (a.status === 'present') agg[key].attended++;
                if (isRefundable(a.status)) agg[key].refundable++;
              });
            });
          });
        });
      });
      return chain.then(function () {
        var keys = Object.keys(agg);
        var studentIds = {}; keys.forEach(function (k) { studentIds[agg[k].student_id] = 1; });
        var ids = Object.keys(studentIds);
        if (!ids.length) return [];
        return sb.from('students').select('id,name').in('id', ids).then(function (sr) {
          if (sr.error) throw sr.error;
          var names = {}; (sr.data || []).forEach(function (s) { names[s.id] = s.name; });
          return keys.map(function (k) {
            var a = agg[k]; a.name = names[a.student_id] || '—';
            return a;
          }).filter(function (a) { return a.refundable > 0; })  // показываем только тех, у кого есть что пересчитывать
            .sort(function (x, y) { return (x.name || '').localeCompare(y.name || '', 'ru'); });
        });
      });
    });
  }

  /* ---- render ---- */
  function render(root) {
    var priceCells = DIRECTIONS.map(function (d) {
      return '<div class="rc-pcell"><label>' + esc(d.label) + '</label>' +
        '<input class="form-control" type="number" min="0" step="50" data-price="' + d.value + '" value="' + (state.pricing[d.value] || 0) + '"></div>';
    }).join('');

    root.innerHTML =
      '<div class="rc-card">' +
        '<h3 style="margin:0 0 10px">Цена занятия по направлению, ₸</h3>' +
        '<div class="rc-price">' + priceCells + '</div>' +
        '<button class="btn btn-outline btn-sm" id="rc-saveprice" style="margin-top:10px">Сохранить цены</button>' +
        '<div class="rc-msg" id="rc-pmsg"></div>' +
      '</div>' +
      '<div class="rc-card">' +
        '<div class="rc-row" style="justify-content:space-between">' +
          '<div class="rc-month"><button class="btn btn-ghost btn-sm" id="rc-prev">‹</button>' +
            '<b id="rc-mtitle">' + monthTitle(state.y, state.m) + '</b>' +
            '<button class="btn btn-ghost btn-sm" id="rc-next">›</button></div>' +
          '<div class="rc-checks">' +
            '<span style="color:var(--text-muted);font-size:.78rem">К перерасчёту считать:</span>' +
            '<label><input type="checkbox" data-rule="sick"' + (state.rule.sick ? ' checked' : '') + '> Б (болел)</label>' +
            '<label><input type="checkbox" data-rule="excused"' + (state.rule.excused ? ' checked' : '') + '> У (уважит.)</label>' +
            '<label><input type="checkbox" data-rule="absent"' + (state.rule.absent ? ' checked' : '') + '> Н (без причины)</label>' +
          '</div>' +
        '</div>' +
        '<div id="rc-table" style="margin-top:14px"></div>' +
        '<div class="rc-msg" id="rc-msg"></div>' +
      '</div>' +
      '<div class="rc-card"><h3 style="margin:0 0 10px">История перерасчётов</h3><div id="rc-hist"></div></div>';

    // pricing save
    document.getElementById('rc-saveprice').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      var pmsg = document.getElementById('rc-pmsg'); pmsg.textContent = 'Сохраняем…'; pmsg.className = 'rc-msg wait';
      var ops = DIRECTIONS.map(function (d) {
        var v = Number(document.querySelector('[data-price="' + d.value + '"]').value) || 0;
        state.pricing[d.value] = v; return savePrice(d.value, v);
      });
      Promise.all(ops).then(function () { pmsg.textContent = 'Цены сохранены.'; pmsg.className = 'rc-msg ok'; renderTable(); })
        .catch(function (e) { pmsg.textContent = 'Ошибка: ' + (e.message || e); pmsg.className = 'rc-msg err'; })
        .then(function () { btn.disabled = false; });
    });

    document.getElementById('rc-prev').addEventListener('click', function () { stepMonth(-1); });
    document.getElementById('rc-next').addEventListener('click', function () { stepMonth(1); });
    root.querySelectorAll('[data-rule]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        state.rule[cb.getAttribute('data-rule')] = cb.checked; saveRule(); renderTable();
      });
    });

    renderTable();
    renderHistory();
  }

  function stepMonth(d) {
    state.m += d; if (state.m < 0) { state.m = 11; state.y--; } if (state.m > 11) { state.m = 0; state.y++; }
    var t = document.getElementById('rc-mtitle'); if (t) t.textContent = monthTitle(state.y, state.m);
    renderTable(); renderHistory();
  }
  function msg(t, k) { var el = document.getElementById('rc-msg'); if (el) { el.textContent = t || ''; el.className = 'rc-msg' + (k ? ' ' + k : ''); } }

  function renderTable() {
    var box = document.getElementById('rc-table');
    if (!box) return;
    box.innerHTML = '<p class="rc-empty">Считаем…</p>';
    computeRows().then(function (rows) {
      state.rows = rows;
      if (!rows.length) { box.innerHTML = '<p class="rc-empty">За ' + monthTitle(state.y, state.m) + ' пропусков к перерасчёту нет.</p>'; return; }
      var body = rows.map(function (r, i) {
        var price = state.pricing[r.direction] || 0;
        var amount = Math.max(0, price * r.refundable);
        return '<tr data-i="' + i + '">' +
          '<td class="rc-name">' + esc(r.name) + '</td>' +
          '<td>' + esc(dirLabel(r.direction)) + '</td>' +
          '<td>' + r.planned + '</td>' +
          '<td>' + r.attended + '</td>' +
          '<td>' + r.refundable + '</td>' +
          '<td>' + money(price) + '</td>' +
          '<td><input class="form-control" type="number" min="0" step="50" data-discount="' + i + '" value="0"></td>' +
          '<td class="rc-amount" data-amount="' + i + '">' + money(amount) + '</td>' +
          '<td><button class="btn btn-primary btn-sm" data-apply="' + i + '">Применить</button></td>' +
        '</tr>';
      }).join('');
      box.innerHTML =
        '<div class="rc-grid-wrap"><table class="rc-table">' +
          '<thead><tr><th>Ученик</th><th>Направление</th><th>План</th><th>Факт</th><th>К возврату (зан.)</th><th>Цена/зан.</th><th>Скидка ₸</th><th>Итог ₸</th><th></th></tr></thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table></div>' +
        '<p class="rc-empty" style="margin-top:8px">«К возврату» — пропуски по выбранному правилу × цена занятия, минус скидка. Деньги автоматически не списываются — только фиксируется перерасчёт.</p>';

      box.querySelectorAll('[data-discount]').forEach(function (inp) {
        inp.addEventListener('input', function () { recalcAmount(parseInt(inp.getAttribute('data-discount'), 10)); });
      });
      box.querySelectorAll('[data-apply]').forEach(function (btn) {
        btn.addEventListener('click', function () { applyRow(parseInt(btn.getAttribute('data-apply'), 10), btn); });
      });
    }).catch(function (e) { box.innerHTML = '<p class="rc-msg err">Не удалось посчитать: ' + esc(e.message || e) + '</p>'; });
  }

  function rowAmount(i) {
    var r = state.rows[i]; var price = state.pricing[r.direction] || 0;
    var disc = Number((document.querySelector('[data-discount="' + i + '"]') || {}).value) || 0;
    return Math.max(0, price * r.refundable - disc);
  }
  function recalcAmount(i) {
    var cell = document.querySelector('[data-amount="' + i + '"]'); if (cell) cell.textContent = money(rowAmount(i));
  }

  function applyRow(i, btn) {
    var r = state.rows[i]; var price = state.pricing[r.direction] || 0;
    var disc = Number((document.querySelector('[data-discount="' + i + '"]') || {}).value) || 0;
    var amount = rowAmount(i);
    btn.disabled = true; msg('Сохраняем перерасчёт…', 'wait');
    sb.from('recalculations').insert({
      student_id: r.student_id, student_name: r.name,
      period: state.y + '-' + pad(state.m + 1), direction: r.direction,
      planned: r.planned, attended: r.attended, refundable: r.refundable,
      price_per_lesson: price, discount: disc, amount: amount,
      applied_by: me.id
    }).then(function (res) {
      if (res.error) throw res.error;
      msg('Перерасчёт по «' + r.name + '» зафиксирован: ' + money(amount) + ' ₸.', 'ok');
      btn.textContent = 'Готово ✓';
      renderHistory();
    }).catch(function (e) { btn.disabled = false; msg('Ошибка: ' + (e.message || e), 'err'); });
  }

  function renderHistory() {
    var box = document.getElementById('rc-hist');
    if (!box) return;
    var period = state.y + '-' + pad(state.m + 1);
    sb.from('recalculations').select('*').eq('period', period).order('created_at', { ascending: false }).limit(50)
      .then(function (r) {
        if (r.error) throw r.error;
        var rows = r.data || [];
        if (!rows.length) { box.innerHTML = '<p class="rc-empty">За ' + monthTitle(state.y, state.m) + ' применённых перерасчётов нет.</p>'; return; }
        var body = rows.map(function (h) {
          return '<tr><td class="rc-name">' + esc(h.student_name || '—') + '</td><td>' + esc(dirLabel(h.direction)) + '</td>' +
            '<td>' + h.refundable + '</td><td>' + money(h.price_per_lesson) + '</td><td>' + money(h.discount) + '</td>' +
            '<td class="rc-amount">' + money(h.amount) + '</td>' +
            '<td>' + new Date(h.created_at).toLocaleDateString('ru-RU') + '</td></tr>';
        }).join('');
        box.innerHTML = '<div class="rc-grid-wrap"><table class="rc-table rc-hist"><thead><tr>' +
          '<th>Ученик</th><th>Направление</th><th>Зан.</th><th>Цена</th><th>Скидка</th><th>Итог ₸</th><th>Дата</th></tr></thead><tbody>' +
          body + '</tbody></table></div>';
      }).catch(function (e) { box.innerHTML = '<p class="rc-msg err">История не загрузилась: ' + esc(e.message || e) + '</p>'; });
  }

  function mount() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    if (!window.SUPA || !window.SUPA.enabled || !window.SUPA.enabled()) {
      root.innerHTML = '<div class="rc-card"><p class="rc-empty">Раздел доступен после входа через аккаунт студии.</p></div>';
      return;
    }
    sb = window.SUPA.client;
    injectStyles(); hideMock();
    var now = new Date(); state.y = now.getFullYear(); state.m = now.getMonth();
    state.rule = getRule();
    root.innerHTML = '<div class="rc-card"><p class="rc-empty">Загрузка…</p></div>';
    window.SUPA.myProfile().then(function (p) {
      me = p;
      if (!me || (me.role !== 'admin' && me.role !== 'director')) {
        root.innerHTML = '<div class="rc-card"><p class="rc-empty">Перерасчёты доступны только администратору и директору.</p></div>';
        return;
      }
      return loadPricing().then(function (pr) { state.pricing = pr; render(root); });
    }).catch(function (e) {
      root.innerHTML = '<div class="rc-card"><p class="rc-msg err">Ошибка: ' + esc(e.message || e) + '</p></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
