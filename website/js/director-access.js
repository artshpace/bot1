/* =====================================================================
   DIRECTOR ACCESS PANEL  (Phase 2 P0)
   ---------------------------------------------------------------------
   Renders a "Управление пользователями" editor on director.html where the
   director can edit any user's ФИО, телефон and роль straight from the
   cabinet — no trip to the Supabase SQL editor.

   Authority is the DATABASE, not this script:
     * RLS (profiles_admin_all) lets only admin/director read & write all
       profiles; a normal user only ever sees/edits their own row.
     * The prevent_role_change() trigger lets only a director grant
       admin/director; an unauthorised role change is silently reverted
       (name/phone still go through), so after every save we re-read the
       row and render exactly what the DB kept.

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
  function attr(s) { return esc(s); }

  function injectStyles() {
    if (document.getElementById('da-styles')) return;
    var css =
      '.da-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:20px 22px;margin-top:28px;}' +
      '.da-card h2{margin:0 0 4px;font-size:1.2rem;}' +
      '.da-sub{color:var(--text-muted);font-size:.85rem;margin:0 0 16px;}' +
      '.da-table{width:100%;border-collapse:collapse;font-size:.9rem;}' +
      '.da-table th,.da-table td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--border);vertical-align:middle;}' +
      '.da-table th{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);}' +
      '.da-table input.form-control,.da-table select.form-control{min-width:0;width:100%;font-size:.88rem;padding:7px 9px;}' +
      '.da-col-name{min-width:180px;}.da-col-phone{min-width:150px;}.da-col-role{min-width:160px;}' +
      '.da-table td.da-save-cell{white-space:nowrap;}' +
      '.da-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:600;background:rgba(201,168,76,.16);color:var(--accent,#C9A84C);}' +
      '.da-you{display:inline-block;margin-left:6px;font-size:.68rem;color:var(--accent,#C9A84C);font-weight:600;vertical-align:middle;}' +
      '.da-msg{margin-top:12px;font-size:.85rem;min-height:1.2em;}' +
      '.da-msg.ok{color:#4caf50;}.da-msg.err{color:#e53935;}' +
      '.da-row-msg{display:block;font-size:.76rem;margin-top:4px;min-height:1em;}' +
      '.da-row-msg.ok{color:#4caf50;}.da-row-msg.err{color:#e53935;}' +
      '@media(max-width:760px){.da-table,.da-table thead,.da-table tbody,.da-table th,.da-table td,.da-table tr{display:block;}' +
        '.da-table thead{display:none;}' +
        '.da-table tr{border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:12px;}' +
        '.da-table td{border:none;padding:6px 0;}' +
        '.da-table td:before{content:attr(data-label);display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin-bottom:3px;}}';
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

  function rowMsg(root, id, text, kind) {
    var el = root.querySelector('.da-row-msg[data-msg="' + cssEsc(id) + '"]');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'da-row-msg' + (kind ? ' ' + kind : '');
  }

  // For querySelector attribute values (UUIDs are safe, but stay defensive).
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function render(root, profiles, myId) {
    var rows = profiles.map(function (p) {
      var isSelf = p.id === myId;
      var opts = ROLES.map(function (r) {
        return '<option value="' + r.value + '"' + (r.value === p.role ? ' selected' : '') + '>' +
          esc(r.label) + '</option>';
      }).join('');
      // The director's own role select is locked so they can't demote
      // themselves by accident; name/phone stay editable.
      var roleField = '<select class="form-control" data-field="role" data-id="' + attr(p.id) + '"' +
        (isSelf ? ' disabled title="Свою роль директора изменить нельзя"' : '') + '>' + opts + '</select>';
      return '<tr data-row="' + attr(p.id) + '">' +
        '<td data-label="Имя (ФИО)" class="da-col-name">' +
          '<input class="form-control" type="text" data-field="name" data-id="' + attr(p.id) + '" ' +
          'value="' + attr(p.name || '') + '" placeholder="Фамилия Имя Отчество">' +
          (isSelf ? '<span class="da-you">это вы</span>' : '') +
        '</td>' +
        '<td data-label="Телефон" class="da-col-phone">' +
          '<input class="form-control" type="tel" data-field="phone" data-id="' + attr(p.id) + '" ' +
          'value="' + attr(p.phone || '') + '" placeholder="+7 7XX XXX-XX-XX">' +
        '</td>' +
        '<td data-label="Роль" class="da-col-role">' + roleField + '</td>' +
        '<td data-label="" class="da-save-cell">' +
          '<button type="button" class="btn btn-primary btn-sm" data-save="' + attr(p.id) + '">Сохранить</button>' +
          '<span class="da-row-msg" data-msg="' + attr(p.id) + '"></span>' +
        '</td>' +
      '</tr>';
    }).join('');

    root.innerHTML =
      '<div class="da-card">' +
        '<h2>Управление пользователями <span class="da-badge">директор</span></h2>' +
        '<p class="da-sub">Редактируйте ФИО, телефон и роль прямо здесь. Назначать администраторов и директоров может только директор. Email — это логин, он меняется самим пользователем.</p>' +
        '<table class="da-table">' +
          '<thead><tr><th>Имя (ФИО)</th><th>Телефон</th><th>Роль</th><th></th></tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="4">Пользователей пока нет.</td></tr>') + '</tbody>' +
        '</table>' +
        '<div class="da-msg" id="da-msg"></div>' +
      '</div>';

    var msg = document.getElementById('da-msg');

    root.querySelectorAll('[data-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-save');
        var isSelf = id === myId;
        var nameEl = root.querySelector('input[data-field="name"][data-id="' + cssEsc(id) + '"]');
        var phoneEl = root.querySelector('input[data-field="phone"][data-id="' + cssEsc(id) + '"]');
        var roleEl = root.querySelector('select[data-field="role"][data-id="' + cssEsc(id) + '"]');
        var fields = {
          name: nameEl ? nameEl.value : undefined,
          phone: phoneEl ? phoneEl.value : undefined
        };
        // Don't send the (disabled) role for the director's own row.
        if (roleEl && !isSelf) fields.role = roleEl.value;

        if (fields.name !== undefined && !String(fields.name).trim()) {
          rowMsg(root, id, 'Имя не может быть пустым.', 'err');
          return;
        }

        btn.disabled = true; setMsg(msg, '', null); rowMsg(root, id, 'Сохраняем…', null);
        window.SUPA.updateProfile(id, fields).then(function (saved) {
          saved = saved || {};
          if (nameEl && saved.name != null) nameEl.value = saved.name;
          if (phoneEl) phoneEl.value = saved.phone || '';
          var roleStuck = true;
          if (roleEl && fields.role !== undefined) {
            roleEl.value = saved.role || fields.role;
            roleStuck = (saved.role === fields.role);
          }
          if (!roleStuck) {
            rowMsg(root, id, 'Сохранено, но роль «' + roleLabel(fields.role) + '» назначить не удалось (нет прав). Осталась: ' + roleLabel(saved.role) + '.', 'err');
          } else {
            rowMsg(root, id, 'Сохранено ✓', 'ok');
          }
        }).catch(function (ex) {
          rowMsg(root, id, 'Ошибка: ' + (ex && ex.message ? ex.message : 'не удалось сохранить'), 'err');
        }).then(function () { btn.disabled = false; });
      });
    });
  }

  function mount() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    if (!window.SUPA || !window.SUPA.enabled || !window.SUPA.enabled()) {
      // Supabase not configured — panel can't manage real profiles. Stay silent.
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
