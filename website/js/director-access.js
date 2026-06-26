/* =====================================================================
   DIRECTOR ACCESS PANEL  (Phase 2 P0)
   ---------------------------------------------------------------------
   Renders a "Управление доступом" table on director.html where the
   director can change any user's role straight from the cabinet — no
   trip to the Supabase dashboard.

   Authority is the DATABASE, not this script: RLS lets only admin/
   director read all profiles, and the prevent_role_change() trigger lets
   only a director grant admin/director. If a non-director somehow calls
   setRole, the DB silently reverts the change and we re-render the real
   role. This file is purely the UI.

   Loaded on director.html AFTER supa.js (for window.SUPA) and account.js.
   Mounts into #director-access-root. No dependency on account.js.
   ===================================================================== */
(function () {
  'use strict';

  var ROOT_ID = 'director-access-root';
  var ROLES = [
    { value: 'student',  label: 'Ученик' },
    { value: 'parent',   label: 'Родитель' },
    { value: 'teacher',  label: 'Преподаватель' },
    { value: 'admin',    label: 'Администратор' },
    { value: 'director', label: 'Директор' }
  ];
  function roleLabel(v) {
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].value === v) return ROLES[i].label;
    return v || '—';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function injectStyles() {
    if (document.getElementById('da-styles')) return;
    var css =
      '.da-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:20px 22px;margin-top:28px;}' +
      '.da-card h2{margin:0 0 4px;font-size:1.2rem;}' +
      '.da-sub{color:var(--text-muted);font-size:.85rem;margin:0 0 16px;}' +
      '.da-table{width:100%;border-collapse:collapse;font-size:.9rem;}' +
      '.da-table th,.da-table td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--border);vertical-align:middle;}' +
      '.da-table th{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);}' +
      '.da-role-now{font-weight:600;}' +
      '.da-actions{display:flex;gap:8px;align-items:center;}' +
      '.da-actions select{min-width:150px;}' +
      '.da-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:600;background:rgba(201,168,76,.16);color:var(--accent,#C9A84C);}' +
      '.da-msg{margin-top:12px;font-size:.85rem;min-height:1.2em;}' +
      '.da-msg.ok{color:#4caf50;}.da-msg.err{color:#e53935;}' +
      '.da-self{color:var(--text-muted);font-size:.78rem;}';
    var st = document.createElement('style');
    st.id = 'da-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'da-msg' + (kind ? ' ' + kind : '');
  }

  function render(root, profiles, myId) {
    var rows = profiles.map(function (p) {
      var isSelf = p.id === myId;
      var opts = ROLES.map(function (r) {
        return '<option value="' + r.value + '"' + (r.value === p.role ? ' selected' : '') + '>' +
          esc(r.label) + '</option>';
      }).join('');
      var action = isSelf
        ? '<span class="da-self">Это вы — роль директора защищена</span>'
        : '<div class="da-actions">' +
            '<select class="form-control" data-id="' + esc(p.id) + '" data-current="' + esc(p.role) + '">' + opts + '</select>' +
            '<button type="button" class="btn btn-primary btn-sm" data-save="' + esc(p.id) + '">Сохранить</button>' +
          '</div>';
      return '<tr data-row="' + esc(p.id) + '">' +
        '<td>' + esc(p.name || '—') + '</td>' +
        '<td>' + esc(p.phone || '—') + '</td>' +
        '<td><span class="da-role-now">' + esc(roleLabel(p.role)) + '</span></td>' +
        '<td>' + action + '</td>' +
      '</tr>';
    }).join('');

    root.innerHTML =
      '<div class="da-card">' +
        '<h2>Управление доступом <span class="da-badge">директор</span></h2>' +
        '<p class="da-sub">Назначайте роли пользователям. Создавать администраторов и директоров может только директор.</p>' +
        '<table class="da-table">' +
          '<thead><tr><th>Имя</th><th>Телефон</th><th>Текущая роль</th><th>Изменить роль</th></tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="4">Пользователей пока нет.</td></tr>') + '</tbody>' +
        '</table>' +
        '<div class="da-msg" id="da-msg"></div>' +
      '</div>';

    var msg = document.getElementById('da-msg');
    root.querySelectorAll('[data-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-save');
        var sel = root.querySelector('select[data-id="' + id + '"]');
        if (!sel) return;
        var newRole = sel.value;
        var current = sel.getAttribute('data-current');
        if (newRole === current) { setMsg(msg, 'Роль не изменилась.', null); return; }
        btn.disabled = true; setMsg(msg, 'Сохраняем…', null);
        window.SUPA.setRole(id, newRole).then(function (res) {
          var actual = (res && res.role) || current;
          // Reflect the role the DB actually kept (guard may have reverted it).
          sel.setAttribute('data-current', actual);
          var row = root.querySelector('tr[data-row="' + id + '"] .da-role-now');
          if (row) row.textContent = roleLabel(actual);
          if (actual === newRole) {
            setMsg(msg, 'Роль обновлена: ' + roleLabel(actual) + '.', 'ok');
          } else {
            sel.value = actual;
            setMsg(msg, 'Недостаточно прав для назначения роли «' + roleLabel(newRole) + '». Роль осталась: ' + roleLabel(actual) + '.', 'err');
          }
        }).catch(function (ex) {
          setMsg(msg, 'Ошибка: ' + (ex && ex.message ? ex.message : 'не удалось сохранить'), 'err');
        }).then(function () { btn.disabled = false; });
      });
    });
  }

  function mount() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    if (!window.SUPA || !window.SUPA.enabled || !window.SUPA.enabled()) {
      // Supabase not configured — panel can't manage real roles. Stay silent.
      return;
    }
    injectStyles();
    root.innerHTML = '<div class="da-card"><p class="da-sub">Загрузка списка пользователей…</p></div>';

    // Gate on the real role: only a director may see/use this panel.
    window.SUPA.myProfile().then(function (me) {
      if (!me || me.role !== 'director') {
        root.innerHTML = '';
        return;
      }
      return window.SUPA.listProfiles().then(function (profiles) {
        render(root, profiles, me.id);
      });
    }).catch(function (ex) {
      root.innerHTML = '<div class="da-card"><p class="da-msg err">Не удалось загрузить пользователей: ' +
        esc(ex && ex.message ? ex.message : '') + '</p></div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
