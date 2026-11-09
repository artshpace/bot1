/* =====================================================================
   ЛИДЫ + ВОРОНКА на фактических данных  (Phase 3 P2 — Задача 11)
   ---------------------------------------------------------------------
   Реальные лиды из public.leads (их пишет Worker сервис-ролью). Два режима:
     • #leads-mount  (admin-leads.html)  — список лидов, смена статуса.
     • #funnel-mount (admin-funnel.html) — воронка конверсии + источники.
   Доступ: персонал (RLS leads_select = is_staff()).

   Подключается ПОСЛЕ supa.js и account.js.
   ===================================================================== */
(function () {
  'use strict';

  var STATUSES = [
    { value: 'new',            label: 'Новый',            stage: 0 },
    { value: 'contacted',      label: 'Связались',        stage: 1 },
    { value: 'trial_booked',   label: 'Записан на пробное', stage: 2 },
    { value: 'trial_attended', label: 'Пришёл на пробное', stage: 3 },
    { value: 'purchased',      label: 'Купил абонемент',  stage: 4 },
    { value: 'lost',           label: 'Потерян',          stage: -1 }
  ];
  function stLabel(v) { for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].value === v) return STATUSES[i].label; return v; }
  function stStage(v) { for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].value === v) return STATUSES[i].stage; return 0; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dt(iso) { try { return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch (e) { return iso; } }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }

  var sb = null, me = null;

  function injectStyles() {
    if (document.getElementById('crm-styles')) return;
    var css =
      '.crm-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:20px;}' +
      '.crm-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:8px;}' +
      '.crm-table{border-collapse:collapse;width:100%;font-size:.85rem;}' +
      '.crm-table th,.crm-table td{border:1px solid var(--border);padding:7px 9px;text-align:left;white-space:nowrap;}' +
      '.crm-table th{background:var(--card-bg);font-size:.72rem;color:var(--text-muted);text-transform:uppercase;}' +
      '.crm-table select{min-width:150px;}' +
      '.crm-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.74rem;font-weight:600;}' +
      '.crm-s0{background:#eceff1;color:#546e7a;}.crm-s1{background:rgba(34,158,217,.16);color:#1f8fc4;}' +
      '.crm-s2{background:rgba(201,168,76,.18);color:#b58e2e;}.crm-s3{background:rgba(255,152,0,.18);color:#e67e00;}' +
      '.crm-s4{background:rgba(46,158,91,.18);color:#2e9e5b;}.crm-slost{background:rgba(229,57,53,.14);color:#e53935;}' +
      '.crm-funnel{display:flex;flex-direction:column;gap:10px;margin-top:8px;}' +
      '.crm-stage{}' +
      '.crm-stage .crm-stage-top{display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:3px;}' +
      '.crm-stage .crm-bar{height:30px;border-radius:6px;background:var(--bg,#eee);overflow:hidden;}' +
      '.crm-stage .crm-bar i{display:flex;align-items:center;justify-content:flex-end;height:100%;padding-right:8px;color:#fff;font-weight:700;font-size:.8rem;background:linear-gradient(90deg,#C9A84C,#E30613);min-width:28px;}' +
      '.crm-kpis{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px;}' +
      '.crm-kpi{background:var(--bg,#f7f7f8);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:120px;}' +
      '.crm-kpi b{display:block;font-size:1.4rem;}' +
      '.crm-kpi span{font-size:.76rem;color:var(--text-muted);}' +
      '.crm-msg{font-size:.85rem;margin-top:8px;min-height:1.1em;}.crm-msg.ok{color:#2e9e5b;}.crm-msg.err{color:#e53935;}' +
      '.crm-empty{color:var(--text-muted);padding:8px 0;}' +
      '.crm-filter{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap;}';
    var st = document.createElement('style'); st.id = 'crm-styles'; st.textContent = css; document.head.appendChild(st);
  }
  function hideMock(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

  function loadLeads() {
    return sb.from('leads').select('*').order('created_at', { ascending: false }).limit(1000)
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }

  /* ================= LEADS LIST ====================================== */
  function leadsView(root) {
    root.innerHTML = '<div class="crm-card"><p class="crm-empty">Загрузка лидов…</p></div>';
    loadLeads().then(function (leads) {
      render(leads, 'all');
    }).catch(function (e) { root.innerHTML = '<div class="crm-card"><p class="crm-msg err">Не удалось загрузить лиды: ' + esc(e.message || e) + '</p></div>'; });

    function render(allLeads, filter) {
      var leads = filter === 'all' ? allLeads : allLeads.filter(function (l) { return l.status === filter; });
      var filterOpts = '<option value="all">Все статусы (' + allLeads.length + ')</option>' +
        STATUSES.map(function (s) {
          var n = allLeads.filter(function (l) { return l.status === s.value; }).length;
          return '<option value="' + s.value + '"' + (s.value === filter ? ' selected' : '') + '>' + esc(s.label) + ' (' + n + ')</option>';
        }).join('');

      var rows = leads.length ? leads.map(function (l) {
        var stg = stStage(l.status);
        var badgeCls = l.status === 'lost' ? 'crm-slost' : 'crm-s' + stg;
        var src = [l.utm_source, l.utm_campaign].filter(Boolean).join(' / ') || (l.source || '—');
        var opts = STATUSES.map(function (s) { return '<option value="' + s.value + '"' + (s.value === l.status ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('');
        return '<tr data-id="' + esc(l.id) + '">' +
          '<td>' + dt(l.created_at) + '</td>' +
          '<td>' + esc(l.name || '—') + '</td>' +
          '<td>' + esc(l.phone || '—') + '</td>' +
          '<td>' + esc(l.direction || '—') + '</td>' +
          '<td>' + esc(src) + '</td>' +
          '<td><span class="crm-badge ' + badgeCls + '">' + esc(stLabel(l.status)) + '</span></td>' +
          '<td><select class="form-control" data-status="' + esc(l.id) + '">' + opts + '</select></td>' +
          '<td><a href="https://wa.me/' + esc((l.phone || '').replace(/\D/g, '')) + '" target="_blank" class="btn btn-ghost btn-sm">WA</a></td>' +
        '</tr>';
      }).join('') : '<tr><td colspan="8" class="crm-empty">Лидов нет.</td></tr>';

      root.innerHTML =
        '<div class="crm-card">' +
          '<div class="crm-filter"><label style="font-size:.8rem;color:var(--text-muted)">Фильтр:</label>' +
            '<select class="form-control" id="crm-filter" style="max-width:260px">' + filterOpts + '</select>' +
            '<span class="crm-empty" style="margin-left:auto">Лид с сайта появляется здесь автоматически.</span>' +
          '</div>' +
          '<div class="crm-wrap"><table class="crm-table">' +
            '<thead><tr><th>Дата</th><th>Имя</th><th>Телефон</th><th>Направление</th><th>Источник</th><th>Статус</th><th>Изменить</th><th></th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>' +
          '<div class="crm-msg" id="crm-msg"></div>' +
        '</div>';

      document.getElementById('crm-filter').addEventListener('change', function () { render(allLeads, this.value); });
      root.querySelectorAll('[data-status]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var id = sel.getAttribute('data-status'); var ns = sel.value;
          sel.disabled = true; msg('Сохраняем…');
          sb.from('leads').update({ status: ns, updated_at: new Date().toISOString() }).eq('id', id)
            .then(function (r) {
              if (r.error) throw r.error;
              var item = allLeads.filter(function (l) { return l.id === id; })[0]; if (item) item.status = ns;
              msg('Статус обновлён: ' + stLabel(ns), 'ok');
              var badge = root.querySelector('tr[data-id="' + id.replace(/["\\]/g, '\\$&') + '"] .crm-badge');
              if (badge) { badge.className = 'crm-badge ' + (ns === 'lost' ? 'crm-slost' : 'crm-s' + stStage(ns)); badge.textContent = stLabel(ns); }
            })
            .catch(function (e) { msg('Ошибка: ' + (e.message || e), 'err'); })
            .then(function () { sel.disabled = false; });
        });
      });
    }
    function msg(t, k) { var el = document.getElementById('crm-msg'); if (el) { el.textContent = t || ''; el.className = 'crm-msg' + (k ? ' ' + k : ''); } }
  }

  /* ================= FUNNEL ========================================== */
  function funnelView(root) {
    root.innerHTML = '<div class="crm-card"><p class="crm-empty">Считаем воронку…</p></div>';
    loadLeads().then(function (leads) {
      var now = new Date();
      render(leads, 'all', now.getFullYear(), now.getMonth());
    }).catch(function (e) { root.innerHTML = '<div class="crm-card"><p class="crm-msg err">Ошибка: ' + esc(e.message || e) + '</p></div>'; });

    function render(allLeads, period) {
      var leads = allLeads;
      if (period === 'month') {
        var now = new Date(); var y = now.getFullYear(), m = now.getMonth();
        leads = allLeads.filter(function (l) { var d = new Date(l.created_at); return d.getFullYear() === y && d.getMonth() === m; });
      }
      var total = leads.length;
      // "reached" counts (status only moves forward)
      var reached = function (minStage) { return leads.filter(function (l) { return l.status !== 'lost' && stStage(l.status) >= minStage; }).length; };
      var stages = [
        { label: 'Все лиды', n: total },
        { label: 'Связались', n: reached(1) },
        { label: 'Записаны на пробное', n: reached(2) },
        { label: 'Пришли на пробное', n: reached(3) },
        { label: 'Купили абонемент', n: reached(4) }
      ];
      var lost = leads.filter(function (l) { return l.status === 'lost'; }).length;
      var purchased = reached(4);

      var maxN = stages[0].n || 1;
      var bars = stages.map(function (s, i) {
        var w = Math.max(4, pct(s.n, maxN));
        var conv = i === 0 ? '' : ' · ' + pct(s.n, stages[i - 1].n) + '% от пред.';
        return '<div class="crm-stage"><div class="crm-stage-top"><span>' + esc(s.label) + conv + '</span><span>' + s.n + '</span></div>' +
          '<div class="crm-bar"><i style="width:' + w + '%">' + s.n + '</i></div></div>';
      }).join('');

      // source breakdown
      var bySrc = {};
      leads.forEach(function (l) {
        var key = l.utm_source || l.source || 'прямой/нет UTM';
        if (!bySrc[key]) bySrc[key] = { total: 0, purchased: 0 };
        bySrc[key].total++; if (l.status === 'purchased') bySrc[key].purchased++;
      });
      var srcRows = Object.keys(bySrc).sort(function (a, b) { return bySrc[b].total - bySrc[a].total; }).map(function (k) {
        var s = bySrc[k];
        return '<tr><td>' + esc(k) + '</td><td>' + s.total + '</td><td>' + s.purchased + '</td><td>' + pct(s.purchased, s.total) + '%</td></tr>';
      }).join('') || '<tr><td colspan="4" class="crm-empty">Нет данных.</td></tr>';

      root.innerHTML =
        '<div class="crm-card">' +
          '<div class="crm-filter"><label style="font-size:.8rem;color:var(--text-muted)">Период:</label>' +
            '<select class="form-control" id="crm-period" style="max-width:200px">' +
              '<option value="all"' + (period === 'all' ? ' selected' : '') + '>За всё время</option>' +
              '<option value="month"' + (period === 'month' ? ' selected' : '') + '>Текущий месяц</option>' +
            '</select></div>' +
          '<div class="crm-kpis">' +
            '<div class="crm-kpi"><b>' + total + '</b><span>Лидов всего</span></div>' +
            '<div class="crm-kpi"><b>' + purchased + '</b><span>Купили</span></div>' +
            '<div class="crm-kpi"><b>' + pct(purchased, total) + '%</b><span>Итоговая конверсия</span></div>' +
            '<div class="crm-kpi"><b>' + lost + '</b><span>Потеряно</span></div>' +
          '</div>' +
          '<div class="crm-funnel">' + bars + '</div>' +
        '</div>' +
        '<div class="crm-card"><h3 style="margin:0 0 8px">Источники (по UTM)</h3>' +
          '<div class="crm-wrap"><table class="crm-table"><thead><tr><th>Источник</th><th>Лидов</th><th>Купили</th><th>Конверсия</th></tr></thead>' +
          '<tbody>' + srcRows + '</tbody></table></div>' +
          '<p class="crm-empty" style="margin-top:6px">Источник берётся из UTM-меток ссылки, по которой пришёл лид (Instagram-реклама, таргет и т.д.).</p>' +
        '</div>';

      document.getElementById('crm-period').addEventListener('change', function () { render(allLeads, this.value); });
    }
  }

  /* ================= mount =========================================== */
  function mount() {
    var leadsRoot = document.getElementById('leads-mount');
    var funnelRoot = document.getElementById('funnel-mount');
    var root = leadsRoot || funnelRoot;
    if (!root) return;
    if (!window.SUPA || !window.SUPA.enabled || !window.SUPA.enabled()) {
      root.innerHTML = '<div class="crm-card"><p class="crm-empty">Раздел доступен после входа через аккаунт студии.</p></div>';
      return;
    }
    sb = window.SUPA.client;
    injectStyles();
    hideMock('admin-leads-root'); hideMock('admin-funnel-root');
    root.innerHTML = '<div class="crm-card"><p class="crm-empty">Загрузка…</p></div>';
    window.SUPA.myProfile().then(function (p) {
      me = p;
      if (!me || (me.role !== 'admin' && me.role !== 'director' && me.role !== 'teacher')) {
        root.innerHTML = '<div class="crm-card"><p class="crm-empty">Раздел доступен только персоналу студии.</p></div>';
        return;
      }
      if (leadsRoot) leadsView(leadsRoot); else funnelView(funnelRoot);
    }).catch(function (e) { root.innerHTML = '<div class="crm-card"><p class="crm-msg err">Ошибка: ' + esc(e.message || e) + '</p></div>'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
