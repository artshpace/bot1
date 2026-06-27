/* =====================================================================
   SUPABASE AUTH BRIDGE  (Phase 0 — parallel layer)
   ---------------------------------------------------------------------
   Load order on the auth pages (login / register / recover / reset):
       <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
       <script src="../js/supa-config.js"></script>
       <script src="../js/supa.js"></script>
       <script src="../js/api.js"></script>
       <script src="../js/auth.js"></script>
       <script src="../js/account.js"></script>

   What it does:
     * If SUPA_CONFIG is filled in, it takes over the login / register /
       recover / reset forms and talks to real Supabase Auth (hashed
       passwords, email confirmation, real reset emails — JWT in a
       Supabase-managed cookie/localStorage handled by supabase-js).
     * On a successful Supabase sign-in it writes a *mock* session into
       the localStorage keys the existing cabinet (api.js / auth.js /
       account.js) already reads — so the 268 KB cabinet keeps working
       unchanged. This is the "bridge".
     * If SUPA_CONFIG still has placeholders, supa.js does NOTHING and the
       old localStorage flow (incl. demo accounts) handles the forms.

   Roles: a brand-new sign-up is `student`. To make someone an admin /
   teacher / parent, set their `role` in Supabase (profiles table or the
   user's user_metadata) — see PHASE0_SUPABASE.md.
   ===================================================================== */
(function () {
  'use strict';

  var CFG = window.SUPA_CONFIG || {};
  var CONFIGURED = !!(CFG.url && CFG.anonKey &&
    CFG.url.indexOf('YOUR_') === -1 && CFG.anonKey.indexOf('YOUR_') === -1 &&
    window.supabase && typeof window.supabase.createClient === 'function');

  var client = CONFIGURED ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;

  /* ---- mock-session keys (must match api.js) ---- */
  var LS_USERS = 'sas_users';
  var LS_SESSION = 'sas_session';

  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function norm(v) { return (v || '').toString().trim().toLowerCase(); }

  /* Short, unambiguous one-time code for Telegram deep-link binding.
     Excludes look-alike chars (0/O, 1/I/L) so it reads cleanly. */
  function randCode(n) {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var out = '';
    var arr = new Uint32Array(n || 8);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(arr);
    for (var i = 0; i < (n || 8); i++) {
      var x = arr[i] || Math.floor(Math.random() * 0xffffffff);
      out += chars[x % chars.length];
    }
    return out;
  }

  /* Read the authoritative role/name/phone from the `profiles` table (RLS
     lets a signed-in user read their own row). This is the SOURCE OF TRUTH:
     when the owner changes a role in Supabase Table Editor, the next login
     picks it up here — user_metadata is only a fallback. */
  function fetchProfile(userId) {
    if (!client || !userId) return Promise.resolve(null);
    return client.from('profiles').select('role,name,phone').eq('id', userId).maybeSingle()
      .then(function (r) { return (r && r.data) ? r.data : null; })
      .catch(function () { return null; });
  }

  /* Fetch the profile, then write the mock session. Resolves to the mock
     user (with the real role). Use this everywhere instead of the bare sync. */
  function bridge(supaUser) {
    if (!supaUser) return Promise.resolve(null);
    return fetchProfile(supaUser.id).then(function (p) { return syncMockSession(supaUser, p); });
  }

  /* Write the cabinet's expected session/user records for a Supabase user.
     `profile` (from the profiles table) overrides metadata when present. */
  function syncMockSession(supaUser, profile) {
    if (!supaUser) return null;
    var meta = supaUser.user_metadata || {};
    var email = supaUser.email || '';
    var phone = (profile && profile.phone) || meta.phone || supaUser.phone || '';
    var name = (profile && profile.name) || meta.name || '';
    var role = (profile && profile.role) || meta.role || 'student';
    var login = norm(email || phone);

    var users = lsGet(LS_USERS, []);
    var u = users.filter(function (x) {
      return x.supaId === supaUser.id ||
        (email && norm(x.email) === norm(email)) ||
        (phone && x.phone === phone);
    })[0];

    if (u) {
      u.supaId = supaUser.id;
      if (name) u.name = name;
      if (email) u.email = email;
      if (phone) u.phone = phone;
      u.role = role;
    } else {
      u = { id: 'sb-' + supaUser.id.slice(0, 8), supaId: supaUser.id,
        name: name, email: email, phone: phone, role: role };
      users.push(u);
    }
    lsSet(LS_USERS, users);
    lsSet(LS_SESSION, { login: login, at: Date.now(), supa: true });
    return u;
  }

  function home(role) {
    if (role === 'director') return 'director.html';
    if (role === 'admin') return 'admin.html';
    if (role === 'parent') return 'parent.html';
    if (role === 'teacher') return 'teacher.html';
    return 'dashboard.html';
  }

  /* ---- small DOM helpers reused across the auth pages ---- */
  function showError(el, msg) {
    if (!el) return;
    if (msg && typeof msg === 'object') {
      msg = msg.message || msg.error_description || msg.error || JSON.stringify(msg);
    }
    el.textContent = msg || 'Произошла ошибка. Попробуйте ещё раз.';
    el.classList.add('show');
  }
  // Pull a readable string out of any Supabase / fetch error shape.
  function errMsg(e) {
    if (!e) return 'Неизвестная ошибка';
    var raw = e.message || e.msg || e.error_description || e.error || '';
    if (!raw && typeof e === 'object') { try { raw = JSON.stringify(e); } catch (x) { raw = String(e); } }
    if (/sending|smtp|email/i.test(raw)) {
      return 'Не удалось отправить письмо. Проверьте настройки SMTP в Supabase.';
    }
    return translate(raw) || 'Произошла ошибка. Попробуйте ещё раз.';
  }
  function clearError(el) { if (el) el.classList.remove('show'); }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset._label = btn.textContent; btn.disabled = true; btn.textContent = label || 'Подождите…'; }
    else { btn.disabled = false; if (btn.dataset._label) btn.textContent = btn.dataset._label; }
  }

  /* =================================================================
     PUBLIC API  (window.SUPA)
     ================================================================= */
  var SUPA = {
    enabled: function () { return CONFIGURED; },
    client: client,
    syncMockSession: syncMockSession,

    signIn: function (loginValue, password) {
      // Accepts an email OR a full name (ФИО). Phone-only logins are handled
      // by the mock upstream (the form takeover skips them). For a name we
      // first resolve it to an email via the email_by_name RPC, then do the
      // standard Supabase email/password sign-in.
      var v = (loginValue || '').trim();
      var resolveEmail = /\S+@\S+\.\S+/.test(v)
        ? Promise.resolve(v)
        : client.rpc('email_by_name', { p_name: v }).then(function (r) {
            if (r.error) throw new Error(translate(r.error.message));
            if (!r.data) throw new Error('Не нашли уникальный аккаунт по ФИО — войдите по email');
            return r.data;
          });
      return resolveEmail.then(function (email) {
        return client.auth.signInWithPassword({ email: email, password: password })
          .then(function (res) {
            if (res.error) throw new Error(translate(res.error.message));
            return bridge(res.data.user); // resolves to the mock user w/ real role
          });
      });
    },

    signUp: function (payload) {
      payload = payload || {};
      // Self-registration is limited to student/parent. teacher/admin are
      // assigned by the owner in Supabase — and the DB trigger clamps anything
      // else to 'student', so this can't be abused even via a crafted request.
      var wanted = (payload.role === 'parent') ? 'parent' : 'student';
      return client.auth.signUp({
        email: (payload.email || '').trim(),
        password: payload.password,
        options: {
          data: { name: payload.name || '', phone: payload.phone || '', role: wanted },
          emailRedirectTo: location.origin + location.pathname.replace(/register\.html$/, 'login.html')
        }
      }).then(function (res) {
        if (res.error) throw new Error(translate(res.error.message));
        // If email confirmation is ON, res.data.session is null → user must
        // confirm via email. If OFF, a session is returned → bridge it.
        if (res.data.session && res.data.user) {
          return bridge(res.data.user).then(function (mu) {
            return { confirmed: true, user: res.data.user, mockUser: mu };
          });
        }
        return { confirmed: false, user: res.data.user };
      });
    },

    recover: function (email) {
      var redirect = location.origin + location.pathname.replace(/recover\.html$/, 'reset.html');
      // Guard against a hanging request (e.g. SMTP misconfigured on the
      // server): if Supabase doesn't answer within 20s, fail with a clear
      // message instead of leaving the button stuck on "Отправляем…".
      var timeout = new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error('Сервер не отвечает. Похоже, не настроена отправка писем (SMTP) в Supabase.'));
        }, 20000);
      });
      var call = client.auth.resetPasswordForEmail((email || '').trim(), { redirectTo: redirect })
        .then(function (res) {
          if (res.error) {
            // eslint-disable-next-line no-console
            console.error('[recover] Supabase error:', res.error);
            throw new Error(errMsg(res.error));
          }
          return { ok: true };
        });
      return Promise.race([call, timeout]);
    },

    // For reset.html: complete the password change using the recovery token
    // that supabase-js parses out of the URL hash automatically.
    updatePassword: function (newPassword) {
      return client.auth.updateUser({ password: newPassword })
        .then(function (res) {
          if (res.error) throw new Error(translate(res.error.message));
          return { ok: true };
        });
    },

    // ---- Role management (director only; RLS enforces who may read/write) ----
    // Returns every profile. RLS lets only admin/director read all rows; for a
    // normal user this resolves to just their own row.
    listProfiles: function () {
      if (!client) return Promise.resolve([]);
      return client.from('profiles')
        .select('id,name,phone,role,created_at')
        .order('created_at', { ascending: true })
        .then(function (r) {
          if (r.error) throw new Error(translate(r.error.message));
          return r.data || [];
        });
    },

    // Update one profile's role. The DB guard (prevent_role_change) is the real
    // authority: a non-director who tries to grant admin/director is silently
    // reverted, so we re-read the row and report the role that actually stuck.
    setRole: function (userId, role) {
      if (!client) return Promise.reject(new Error('Supabase не настроен'));
      return client.from('profiles').update({ role: role }).eq('id', userId)
        .select('id,role').maybeSingle()
        .then(function (r) {
          if (r.error) throw new Error(translate(r.error.message));
          return r.data; // { id, role } — actual role after the guard
        });
    },

    // Update editable profile fields (name / phone / role) in one shot. RLS
    // (profiles_admin_all) lets only admin/director write other rows; the
    // prevent_role_change guard still clamps an unauthorised role change while
    // letting name/phone through. We re-read the row so the UI shows exactly
    // what the DB kept. `fields` may contain any of: name, phone, role.
    updateProfile: function (userId, fields) {
      if (!client) return Promise.reject(new Error('Supabase не настроен'));
      fields = fields || {};
      var patch = {};
      if (fields.name  !== undefined) patch.name  = (fields.name  == null ? null : String(fields.name).trim());
      if (fields.phone !== undefined) patch.phone = (fields.phone == null ? null : String(fields.phone).trim());
      if (fields.role  !== undefined) patch.role  = fields.role;
      if (!Object.keys(patch).length) return Promise.reject(new Error('Нет изменений'));
      return client.from('profiles').update(patch).eq('id', userId)
        .select('id,name,phone,role').maybeSingle()
        .then(function (r) {
          if (r.error) throw new Error(translate(r.error.message));
          return r.data; // actual row after RLS + guard
        });
    },

    // The signed-in user's own profile (incl. real role) — for gating UI.
    myProfile: function () {
      if (!client) return Promise.resolve(null);
      return client.auth.getUser().then(function (r) {
        var u = r && r.data && r.data.user;
        return u ? fetchProfile(u.id).then(function (p) {
          return p ? { id: u.id, role: p.role, name: p.name, phone: p.phone } : null;
        }) : null;
      });
    },

    // ---- Telegram account binding (settings.html) -------------------------
    // Link status for the signed-in user. The bot writes telegram_chat_id via
    // the service-role key (server side); the client only reads its own row.
    myTelegram: function () {
      if (!client) return Promise.resolve({ linked: false });
      return client.auth.getUser().then(function (r) {
        var u = r && r.data && r.data.user;
        if (!u) return { linked: false };
        return client.from('profiles')
          .select('telegram_chat_id,telegram_linked_at').eq('id', u.id).maybeSingle()
          .then(function (res) {
            if (res.error) throw new Error(translate(res.error.message));
            var d = res.data || {};
            return { linked: !!d.telegram_chat_id, chatId: d.telegram_chat_id || null, linkedAt: d.telegram_linked_at || null };
          });
      });
    },

    // Create a fresh one-time binding code (10-min TTL, set by the DB default)
    // and return it. The user opens t.me/<bot>?start=<code>; the bot consumes it.
    createTelegramCode: function () {
      if (!client) return Promise.reject(new Error('Supabase не настроен'));
      return client.auth.getUser().then(function (r) {
        var u = r && r.data && r.data.user;
        if (!u) throw new Error('Нужно войти в аккаунт');
        var code = randCode(8);
        return client.from('telegram_codes').insert({ code: code, user_id: u.id })
          .then(function (res) {
            if (res.error) throw new Error(translate(res.error.message));
            return code;
          });
      });
    },

    // Unlink Telegram from the signed-in user's own profile (update_own RLS).
    unlinkTelegram: function () {
      if (!client) return Promise.reject(new Error('Supabase не настроен'));
      return client.auth.getUser().then(function (r) {
        var u = r && r.data && r.data.user;
        if (!u) throw new Error('Нужно войти в аккаунт');
        return client.from('profiles')
          .update({ telegram_chat_id: null, telegram_linked_at: null }).eq('id', u.id)
          .then(function (res) {
            if (res.error) throw new Error(translate(res.error.message));
            return { ok: true };
          });
      });
    }
  };

  /* Friendlier RU messages for the common Supabase auth errors. */
  function translate(msg) {
    msg = msg || '';
    if (/Invalid login credentials/i.test(msg)) return 'Неверный email или пароль';
    if (/Email not confirmed/i.test(msg)) return 'Email не подтверждён — проверьте почту';
    if (/User already registered/i.test(msg)) return 'Пользователь с таким email уже зарегистрирован';
    if (/Password should be at least/i.test(msg)) return 'Пароль слишком короткий (минимум 6 символов)';
    if (/rate limit|too many/i.test(msg)) return 'Слишком много попыток. Попробуйте позже';
    return msg;
  }

  window.SUPA = SUPA;

  /* =================================================================
     FORM TAKEOVER  — only when Supabase is configured.
     Attached in the CAPTURE phase + stopImmediatePropagation so we run
     before account.js's own handler and fully own the submit.
     ================================================================= */
  if (!CONFIGURED) return;

  function byId(id) { return document.getElementById(id); }
  var isEmail = function (v) { return /\S+@\S+\.\S+/.test(v || ''); };
  // A phone-ish value is digits/+/()/-/space only — these stay on the mock,
  // because Supabase here is configured for email/name, not phone auth.
  var isPhoneOnly = function (v) { return /^[\d\s+()\-]{5,}$/.test((v || '').trim()); };

  function wire() {
    var loginForm = byId('login-form');
    var registerForm = byId('register-form');
    var recoverForm = byId('recover-form');
    var resetForm = byId('reset-form');

    /* If the visitor already has a live Supabase session, bridge it and
       send them into the cabinet (handles "already logged in"). */
    if ((loginForm || registerForm) && client) {
      client.auth.getSession().then(function (r) {
        var u = r && r.data && r.data.session && r.data.session.user;
        if (u) { bridge(u).then(function (mu) { location.replace(home(mu && mu.role)); }); }
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        var idVal = (byId('login-id') || {}).value || '';
        // Phone-only login → let the mock handle it (Supabase needs email/ФИО).
        // Email and full-name logins are both owned by Supabase here.
        if (isPhoneOnly(idVal)) return;
        e.preventDefault(); e.stopImmediatePropagation();
        var err = byId('login-error');
        var btn = loginForm.querySelector('button[type="submit"]');
        clearError(err); busy(btn, true, 'Входим…');
        SUPA.signIn(idVal, (byId('login-password') || {}).value || '')
          .then(function (mockUser) {
            location.replace(home(mockUser && mockUser.role));
          })
          .catch(function (ex) { busy(btn, false); showError(err, ex.message); });
      }, true);
    }

    if (registerForm) {
      registerForm.addEventListener('submit', function (e) {
        var emailVal = (byId('reg-email') || {}).value || '';
        // Supabase sign-up requires an email. No email → fall back to mock.
        if (!isEmail(emailVal)) return;
        e.preventDefault(); e.stopImmediatePropagation();
        var err = byId('register-error');
        var btn = registerForm.querySelector('button[type="submit"]');
        var pass = (byId('reg-password') || {}).value || '';
        var pass2 = (byId('reg-password2') || {}).value || '';
        clearError(err);
        if (pass.length < 6) { showError(err, 'Пароль должен быть не короче 6 символов'); return; }
        if (pass !== pass2) { showError(err, 'Пароли не совпадают'); return; }
        busy(btn, true, 'Создаём…');
        SUPA.signUp({
          name: (byId('reg-name') || {}).value || '',
          phone: (byId('reg-phone') || {}).value || '',
          email: emailVal, password: pass,
          role: (byId('reg-role') || {}).value || 'student'
        }).then(function (res) {
          if (res.confirmed) {
            location.replace(home(res.mockUser && res.mockUser.role));
          } else {
            // Email confirmation required.
            registerForm.style.display = 'none';
            var wrap = registerForm.parentNode;
            var note = document.createElement('div');
            note.className = 'form-success show';
            note.innerHTML = '<h3>Почти готово!</h3><p style="color:var(--muted);margin-top:8px;">' +
              'Мы отправили письмо на <strong>' + emailVal + '</strong>. ' +
              'Откройте его и подтвердите регистрацию, затем войдите.</p>' +
              '<a href="login.html" class="btn btn-primary" style="margin-top:24px;">Перейти ко входу</a>';
            wrap.appendChild(note);
          }
        }).catch(function (ex) { busy(btn, false); showError(err, ex.message); });
      }, true);
    }

    if (recoverForm) {
      recoverForm.addEventListener('submit', function (e) {
        var idVal = (byId('recover-id') || {}).value || '';
        if (!isEmail(idVal)) return; // mock fallback for phone
        e.preventDefault(); e.stopImmediatePropagation();
        var err = byId('recover-error');
        var btn = recoverForm.querySelector('button[type="submit"]');
        clearError(err); busy(btn, true, 'Отправляем…');
        SUPA.recover(idVal).then(function () {
          var body = byId('recover-body'); var ok = byId('recover-success');
          if (body) body.style.display = 'none';
          if (ok) ok.classList.add('show');
        }).catch(function (ex) { busy(btn, false); showError(err, ex.message); });
      }, true);
    }

    if (resetForm) {
      resetForm.addEventListener('submit', function (e) {
        e.preventDefault(); e.stopImmediatePropagation();
        var err = byId('reset-error');
        var btn = resetForm.querySelector('button[type="submit"]');
        var p1 = (byId('reset-password') || {}).value || '';
        var p2 = (byId('reset-password2') || {}).value || '';
        clearError(err);
        if (p1.length < 6) { showError(err, 'Пароль должен быть не короче 6 символов'); return; }
        if (p1 !== p2) { showError(err, 'Пароли не совпадают'); return; }
        busy(btn, true, 'Сохраняем…');
        SUPA.updatePassword(p1).then(function () {
          var body = byId('reset-body'); var ok = byId('reset-success');
          if (body) body.style.display = 'none';
          if (ok) ok.classList.add('show');
        }).catch(function (ex) { busy(btn, false); showError(err, ex.message); });
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
