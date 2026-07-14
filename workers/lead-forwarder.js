// workers/lead-forwarder.js
// -----------------------------------------------------------------------------
// ОДИН Worker — ДВЕ задачи (маршрутизация по пути):
//
//   • POST /bot          → вебхук Telegram-бота: привязка аккаунта по /start <код>
//   • любой другой POST  → пересылка заявки с сайта в чат студии (как раньше)
//
// Так не нужно плодить второй Worker: разверни этот код в уже существующем
// sas-lead-forwarder и просто добавь недостающие переменные.
//
// Env (Cloudflare → Worker → Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN         — токен бота от @BotFather              (Secret)  [уже есть]
//   TELEGRAM_CHAT_ID           — чат/группа студии для лидов           (Plain)   [уже есть]
//   SUPABASE_URL               — https://<ref>.supabase.co            (Plain)   [добавить]
//   SUPABASE_SERVICE_ROLE_KEY  — Supabase service_role key            (Secret)  [добавить]
//   WEBHOOK_SECRET             — случайная строка (защита вебхука)     (Secret)  [добавить]
//   ADMIN_PIN                  — PIN для входа в /admin                (Secret)  [добавить]
//   ADMIN_TG_IDS               — доп. allowlist chat_id через запятую  (Plain)   [опционально]
//
// Регистрация вебхука ОДИН раз после деплоя (подставь токен/URL/секрет):
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker>.workers.dev/bot&secret_token=<WEBHOOK_SECRET>
// -----------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- Telegram bot webhook -------------------------------------------------
    if (url.pathname === '/bot' || url.pathname === '/bot/') {
      return handleBotWebhook(request, env);
    }

    // --- Ручной прогон напоминаний (для теста): GET/POST /run-reminders?key=… -
    if (url.pathname === '/run-reminders') {
      if (env.WEBHOOK_SECRET && url.searchParams.get('key') !== env.WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      const n = await runReminders(env);
      return jsonRes({ ok: true, sent: n }, 200, {});
    }

    // --- Test notification: cabinet → Worker → user's Telegram ---------------
    if (url.pathname === '/notify-test') {
      return handleNotifyTest(request, env);
    }

    // --- Staff notification: remind a group / student in Telegram ------------
    if (url.pathname === '/notify') {
      return handleNotify(request, env);
    }

    // --- Downloadable .ics (for "add to default calendar" buttons) -----------
    if (url.pathname === '/ics') {
      return handleIcs(request);
    }

    // --- Lead forwarding (default, unchanged behaviour) -----------------------
    return handleLead(request, env);
  },

  // Cloudflare Cron Trigger — проверяет расписание и шлёт напоминания за 24ч и 1ч.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  }
};

/* =============================================================================
   LEADS  — site form → Telegram chat of the studio
   ============================================================================= */
async function handleLead(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': 'https://artshpace.github.io',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response('Bad Request', { status: 400 }); }

  const { name, phone, age, direction, slot, utm } = body;

  // Persist the lead to Supabase (service-role) so the CRM/funnel has real
  // data. Best-effort: never block the Telegram notification on it.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && (name || phone)) {
    try {
      const u = utm || {};
      await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/leads', {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          name: name || null, phone: phone || null, email: body.email || null,
          age: age || null, direction: direction || null, slot: slot || null,
          source: body.source || null, comment: body.comment || null,
          utm_source: u.source || null, utm_medium: u.medium || null,
          utm_campaign: u.campaign || null, utm_content: u.content || null, utm_term: u.term || null
        })
      });
    } catch (e) { /* swallow — Telegram still fires below */ }
  }

  // Meta Conversions API — серверное событие Lead (дедуп с браузерным пикселем
  // по одному event_id). Best-effort: никогда не блокирует уведомление.
  if (env.META_CAPI_TOKEN) {
    try { await sendCapiLead(env, body, request); }
    catch (e) { console.error('CAPI error: ' + (e && e.message ? e.message : e)); }
  }

  // Create an event in the director's Google Calendar (Задача 5). Best-effort:
  // we log the outcome (missing env / error / success) so failures are visible
  // in the Worker logs, but never block the lead on it.
  {
    const miss = [];
    if (!env.GOOGLE_SA_EMAIL) miss.push('GOOGLE_SA_EMAIL');
    if (!env.GOOGLE_SA_PRIVATE_KEY) miss.push('GOOGLE_SA_PRIVATE_KEY');
    if (!env.GOOGLE_CALENDAR_ID) miss.push('GOOGLE_CALENDAR_ID');
    if (miss.length) {
      console.log('calendar: skipped — missing env: ' + miss.join(', '));
    } else {
      try {
        await createCalendarEvent(env, { name, phone, direction, slot, slotDate: body.slotDate });
        console.log('calendar: event created (slot: ' + (slot || '—') + ', date: ' + (body.slotDate || '—') + ')');
      } catch (e) {
        console.error('calendar error: ' + (e && e.message ? e.message : e));
      }
    }
  }

  const text = [
    '🎨 *Новая заявка — Shpigotskiy Art Space*',
    '',
    `👤 *Имя:* ${name || '—'}`,
    `📞 *Телефон:* ${phone || '—'}`,
    age ? `🎂 *Возраст:* ${age}` : null,
    direction ? `🎸 *Направление:* ${direction}` : null,
    slot ? `🕐 *Слот:* ${slot}` : null,
    body.comment ? `📝 ${body.comment}` : null,
    utm?.campaign ? `📊 *Кампания:* ${utm.campaign}` : null
  ].filter(Boolean).join('\n');

  // Inline buttons: WhatsApp + "add to calendar" (Google + universal .ics).
  // The .ics works on iPhone/Android/любой календарь — независимо от синка.
  const rows = [];
  const when = parseSlot(slot, body.slotDate);
  if (when) {
    const origin = new URL(request.url).origin;
    const title = 'Пробное — ' + (direction || 'занятие') + (name ? ', ' + name : '');
    const details = ['Телефон: ' + (phone || '—'), direction ? 'Направление: ' + direction : '', slot ? 'Слот: ' + slot : ''].filter(Boolean).join('\n');
    const loc = 'ул. Интернациональная, 63, 5 этаж, Петропавловск';
    rows.push([{ text: '📅 Google Календарь', url: gcalUrl(title, when, details, loc) }]);
    rows.push([{ text: '📲 В календарь телефона (.ics)', url: icsLink(origin, title, when, details, loc) }]);
  }
  rows.push([{ text: '💬 Написать в WhatsApp', url: 'https://wa.me/' + (phone || '').replace(/\D/g, '') }]);

  const tgRes = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: rows },
      }),
    }
  );

  const headers = {
    'Access-Control-Allow-Origin': 'https://artshpace.github.io',
    'Content-Type': 'application/json',
  };

  if (!tgRes.ok) {
    return new Response(JSON.stringify({ ok: false }), { status: 502, headers });
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
}

/* =============================================================================
   BOT WEBHOOK  — Telegram → account binding (/start <code>)
   Flow: cabinet inserts a one-time code into public.telegram_codes and opens
   t.me/<bot>?start=<code>. Here we consume it (service-role) and write
   telegram_chat_id onto the user's profile.
   ============================================================================= */
async function handleBotWebhook(request, env) {
  if (request.method !== 'POST') return new Response('OK', { status: 200 });

  // Only Telegram (knowing the secret) may post here.
  if (env.WEBHOOK_SECRET) {
    const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (got !== env.WEBHOOK_SECRET) {
      console.error('webhook secret mismatch: got=' + JSON.stringify(got) + ' expected_len=' + env.WEBHOOK_SECRET.length);
      return new Response('Forbidden', { status: 403 });
    }
  }

  let update;
  try { update = await request.json(); }
  catch { return ok(); }

  let chatId;
  try {
    // Нажатие inline-кнопки (Да/Нет, выбор направления/группы, меню)
    if (update.callback_query) { await onCallback(env, update.callback_query); return ok(); }

    const msg = update.message || update.edited_message;
    if (!msg || !msg.chat) return ok();
    chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    // /start <код> — привязка аккаунта кабинета (как раньше)
    const m = /^\/start(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
    if (m) {
      const code = (m[1] || '').trim();
      if (code) { await handleBind(env, chatId, code); await setMenuButton(env, chatId); return ok(); }
      await ensureParent(env, chatId, msg.from);
      await setMenuButton(env, chatId);
      await setCommands(env);
      await sendMenu(env, chatId, true);
      return ok();
    }
    if (/^\/(schedule|raspisanie)/i.test(text)) { await sendOpenAppHint(env, chatId, 'Расписание'); return ok(); }
    if (/^\/(directions|napravleniya|dirs)/i.test(text)) { await sendOpenAppHint(env, chatId, 'Направления'); return ok(); }
    if (/^\/(price|prices|ceny|tseny)/i.test(text)) { await sendOpenAppHint(env, chatId, 'Цены'); return ok(); }
    if (/^\/(contacts|kontakty)/i.test(text)) { await sendOpenAppHint(env, chatId, 'Контакты'); return ok(); }
    if (/^\/admin/i.test(text)) { await handleAdminCmd(env, chatId); return ok(); }
    if (/^\/(add|children|deti|menu|app|site|help)/i.test(text)) {
      await ensureParent(env, chatId, msg.from);
      await setMenuButton(env, chatId);
      await sendMenu(env, chatId, false);
      return ok();
    }

    // Иначе — по состоянию диалога
    const st = await getState(env, chatId);
    if (st && st.step === 'reg_name')     { await onRegName(env, chatId, text); return ok(); }
    if (st && st.step === 'await_reason') { await onReason(env, chatId, text, st.data || {}); return ok(); }
    if (st && st.step === 'admin_pin')    { await onAdminPin(env, chatId, text, st.data || {}); return ok(); }

    await sendText(env, chatId, 'Не понял 🙂 Нажмите /start, чтобы открыть меню.');
    return ok();
  } catch (e) {
    console.error('bot webhook error:', e && e.message);
    // Раньше здесь молча возвращали ok() — пользователь не видел вообще
    // никакого ответа на /start (тот самый баг «кнопка работает, а бот
    // молчит»). Теперь, если известен chatId, шлём короткое сообщение —
    // хотя бы понятно, что бот жив и что-то пошло не так, а не тишина.
    if (chatId) { try { await sendText(env, chatId, '⚠️ Что-то пошло не так. Попробуйте /start ещё раз.'); } catch (_) {} }
    return ok();
  }
}

// Привязка аккаунта кабинета по коду (вынесено из /start).
async function handleBind(env, chatId, code) {
  try {
    const r = await bindCode(env, code, chatId);
    if (r === 'ok') {
      await reply(env, chatId, '✅ *Аккаунт привязан.*\nТеперь вы будете получать уведомления о занятиях и заявках здесь.');
    } else if (r === 'expired') {
      await reply(env, chatId, '⌛️ Код истёк. Вернитесь в кабинет и нажмите *«Подключить Telegram»* ещё раз — код действует 10 минут.');
    } else {
      await reply(env, chatId, '⚠️ Код недействителен. Сгенерируйте новый в кабинете: Настройки → «Подключить Telegram».');
    }
  } catch (e) {
    console.error('bindCode error:', e && e.message);
    await reply(env, chatId, '⚠️ Не удалось привязать аккаунт.\n\n_Причина:_ `' + ((e && e.message) || 'неизвестно') + '`');
  }
}

function ok() { return new Response('OK', { status: 200 }); }

/* =============================================================================
   TEST NOTIFICATION  — proves the chain site → Worker → user's Telegram.
   The cabinet calls this with the user's Supabase access token. We validate
   the token (→ user id), read that user's telegram_chat_id (service-role) and
   send them a test message. Token + chat_id never leave the server.
   ============================================================================= */
async function handleNotifyTest(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://artshpace.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return jsonRes({ ok: false, error: 'method' }, 405, cors);

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonRes({ ok: false, error: 'no_token' }, 401, cors);

  const base = env.SUPABASE_URL.replace(/\/+$/, '');

  // Validate the user's token → resolve their id.
  const uRes = await fetch(base + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + token }
  });
  if (!uRes.ok) return jsonRes({ ok: false, error: 'invalid_token' }, 401, cors);
  const user = await uRes.json();
  const uid = user && user.id;
  if (!uid) return jsonRes({ ok: false, error: 'no_user' }, 401, cors);

  // Read their chat id with the service-role key.
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };
  const pRes = await fetch(base + '/rest/v1/profiles?select=telegram_chat_id,name&id=eq.' +
                           encodeURIComponent(uid) + '&limit=1', { headers: svc });
  if (!pRes.ok) return jsonRes({ ok: false, error: 'lookup_failed' }, 502, cors);
  const rows = await pRes.json();
  const row = (Array.isArray(rows) && rows[0]) || {};
  if (!row.telegram_chat_id) return jsonRes({ ok: false, error: 'not_linked' }, 200, cors);

  const firstName = (row.name || '').trim().split(/\s+/)[1] || (row.name || '').trim();
  await reply(env, row.telegram_chat_id,
    '🔔 *Тестовое уведомление*\n' + (firstName ? (firstName + ', ') : '') +
    'связь работает! Бот *Shpigotskiy Art Space* готов присылать вам напоминания о занятиях и статусе заявок.');

  return jsonRes({ ok: true }, 200, cors);
}

function jsonRes(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors || {})
  });
}

/* =============================================================================
   STAFF NOTIFICATION (Задача 3) — преподаватель/админ шлёт напоминание в
   Telegram ученикам группы (и их родителям). Body: { groupId | studentId, text }.
   Авторизация — Supabase-токен сотрудника; рассылка только привязанным чатам.
   ============================================================================= */
async function handleNotify(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://artshpace.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return jsonRes({ ok: false, error: 'method' }, 405, cors);

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonRes({ ok: false, error: 'no_token' }, 401, cors);

  let body; try { body = await request.json(); } catch { return jsonRes({ ok: false, error: 'bad_json' }, 400, cors); }
  const text = (body.text || '').trim();
  if (!text) return jsonRes({ ok: false, error: 'no_text' }, 400, cors);

  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };

  // 1) verify caller + that they are staff
  const uRes = await fetch(base + '/auth/v1/user', { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + token } });
  if (!uRes.ok) return jsonRes({ ok: false, error: 'invalid_token' }, 401, cors);
  const uid = (await uRes.json()).id;
  const roleRes = await fetch(base + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(uid) + '&limit=1', { headers: svc });
  const role = ((await roleRes.json())[0] || {}).role;
  if (['admin', 'director', 'teacher'].indexOf(role) === -1) return jsonRes({ ok: false, error: 'forbidden' }, 403, cors);

  // 2) resolve target roster student ids
  let studentIds = [];
  if (body.studentId) studentIds = [body.studentId];
  else if (body.groupId) {
    const mRes = await fetch(base + '/rest/v1/group_members?select=student_id&group_id=eq.' + encodeURIComponent(body.groupId), { headers: svc });
    studentIds = (await mRes.json()).map(m => m.student_id);
  }
  if (!studentIds.length) return jsonRes({ ok: false, error: 'no_targets' }, 200, cors);

  // 3) collect bound chat ids: student's own account + guardians
  const inList = studentIds.map(encodeURIComponent).join(',');
  const sRes = await fetch(base + '/rest/v1/students?select=user_id&id=in.(' + inList + ')', { headers: svc });
  const userIds = (await sRes.json()).map(s => s.user_id).filter(Boolean);
  const gRes = await fetch(base + '/rest/v1/student_guardians?select=parent_id&student_id=in.(' + inList + ')', { headers: svc });
  (await gRes.json()).forEach(g => { if (g.parent_id) userIds.push(g.parent_id); });

  const uniqUsers = Array.from(new Set(userIds));
  if (!uniqUsers.length) return jsonRes({ ok: true, sent: 0, note: 'no_bound_telegram' }, 200, cors);

  const pRes = await fetch(base + '/rest/v1/profiles?select=telegram_chat_id&id=in.(' + uniqUsers.map(encodeURIComponent).join(',') + ')', { headers: svc });
  const chatIds = Array.from(new Set((await pRes.json()).map(p => p.telegram_chat_id).filter(Boolean)));

  let sent = 0;
  for (const chatId of chatIds) {
    try { await reply(env, chatId, '🔔 *Shpigotskiy Art Space*\n\n' + text); sent++; } catch (e) { /* skip */ }
  }
  return jsonRes({ ok: true, sent: sent }, 200, cors);
}

// Look up + consume a binding code via the service-role key (bypasses RLS).
// Returns 'ok' | 'expired' | 'invalid'.
async function bindCode(env, code, chatId) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  };

  const q = base + '/telegram_codes?select=user_id,used,expires_at&code=eq.' +
            encodeURIComponent(code) + '&limit=1';
  const res = await fetch(q, { headers });
  if (!res.ok) throw new Error('lookup failed: ' + res.status);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return 'invalid';

  const row = rows[0];
  if (row.used) return 'invalid';
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return 'expired';

  const pRes = await fetch(base + '/profiles?id=eq.' + encodeURIComponent(row.user_id), {
    method: 'PATCH',
    headers: Object.assign({ Prefer: 'return=minimal' }, headers),
    body: JSON.stringify({
      telegram_chat_id: String(chatId),
      telegram_linked_at: new Date().toISOString()
    })
  });
  if (!pRes.ok) throw new Error('profile patch failed: ' + pRes.status);

  await fetch(base + '/telegram_codes?code=eq.' + encodeURIComponent(code), {
    method: 'PATCH',
    headers: Object.assign({ Prefer: 'return=minimal' }, headers),
    body: JSON.stringify({ used: true })
  });

  return 'ok';
}

async function reply(env, chatId, text) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

/* =============================================================================
   GOOGLE CALENDAR  — событие в календаре директора на каждый лид (Задача 5)
   Авторизация: сервисный аккаунт (JWT RS256 → access_token). Календарь Антона
   расшарен на email сервисного аккаунта с правом редактирования. Время — в
   Asia/Almaty (UTC+5, без перехода на летнее).
   ============================================================================= */
const ALMATY_TZ = 'Asia/Almaty';
const ALMATY_OFFSET = '+05:00';
const RU_DOW = { 'воскресенье': 0, 'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4, 'пятница': 5, 'суббота': 6 };
const RU_DOW_SHORT = { 'вс': 0, 'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6 };

async function createCalendarEvent(env, lead) {
  const token = await getGoogleAccessToken(env);
  const when = parseSlot(lead.slot, lead.slotDate);
  const dir = lead.direction || 'занятие';
  const summary = 'Пробное — ' + dir + (lead.name ? ', ' + lead.name : '');
  const description = [
    lead.name ? 'Имя: ' + lead.name : null,
    lead.phone ? 'Телефон: ' + lead.phone : null,
    lead.direction ? 'Направление: ' + lead.direction : null,
    lead.slot ? 'Слот: ' + lead.slot : null
  ].filter(Boolean).join('\n');
  const location = 'ул. Интернациональная, 63, 5 этаж';

  let event;
  if (when) {
    event = {
      summary, description, location,
      start: { dateTime: when.startISO, timeZone: ALMATY_TZ },
      end:   { dateTime: when.endISO,   timeZone: ALMATY_TZ }
    };
  } else {
    // Слот не распознан — событие на весь день с пометкой согласовать.
    // Для all-day end.date ДОЛЖЕН быть следующим днём (иначе Google прячет событие).
    const base = (lead.slotDate && /^\d{4}-\d{2}-\d{2}$/.test(lead.slotDate))
      ? new Date(lead.slotDate + 'T00:00:00Z')
      : new Date(Date.now() + 86400000);
    const startDay = base.toISOString().slice(0, 10);
    const endDay = new Date(base.getTime() + 86400000).toISOString().slice(0, 10);
    event = {
      summary: 'Пробное (согласовать время) — ' + (lead.name || dir),
      description, location,
      start: { date: startDay }, end: { date: endDay }
    };
  }

  const calId = encodeURIComponent(env.GOOGLE_CALENDAR_ID);
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + calId + '/events', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  if (!r.ok) throw new Error('calendar insert failed: ' + r.status + ' ' + (await r.text()));
}

// Build the event datetimes. The CONCRETE date picked in the form (slotDate,
// ISO yyyy-mm-dd) is authoritative — we no longer guess from the weekday text.
// Times are parsed from the slot label ("...20:00–21:00 (18+)").
function parseSlot(slot, slotDate) {
  const times = (slot || '').match(/(\d{1,2}):(\d{2})/g);
  if (!times || !times.length) return null;
  const start = times[0];
  const end = times[1] || addHour(start);

  let dayStr = null;
  if (slotDate && /^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
    dayStr = slotDate;                       // exact date from the form
  } else {
    // Fallback: derive the next matching weekday from the label (full OR short).
    const lower = (slot || '').toLowerCase();
    let dow = null;
    for (const k in RU_DOW) { if (lower.indexOf(k) !== -1) { dow = RU_DOW[k]; break; } }
    if (dow === null) for (const k in RU_DOW_SHORT) { if (lower.indexOf(k) !== -1) { dow = RU_DOW_SHORT[k]; break; } }
    if (dow === null) return null;
    const nowAlmaty = new Date(Date.now() + 5 * 3600 * 1000);
    let d = new Date(Date.UTC(nowAlmaty.getUTCFullYear(), nowAlmaty.getUTCMonth(), nowAlmaty.getUTCDate()));
    for (let i = 1; i <= 7; i++) {
      const cand = new Date(d.getTime() + i * 86400000);
      if (cand.getUTCDay() === dow) { d = cand; break; }
    }
    dayStr = d.toISOString().slice(0, 10);
  }

  return {
    startISO: dayStr + 'T' + pad2(start) + ':00' + ALMATY_OFFSET,
    endISO:   dayStr + 'T' + pad2(end) + ':00' + ALMATY_OFFSET
  };
}
function pad2(t) { const p = t.split(':'); return (p[0].length < 2 ? '0' + p[0] : p[0]) + ':' + p[1]; }
function addHour(t) { const p = t.split(':'); let h = (parseInt(p[0], 10) + 1) % 24; return h + ':' + p[1]; }

/* =============================================================================
   "ADD TO CALENDAR" buttons for the Telegram lead message.
   gcalUrl → Google Calendar template; icsLink → our /ics endpoint (universal,
   works on iPhone/Android/любой календарь).
   ============================================================================= */
// "2026-06-29T20:00:00+05:00" → "20260629T200000" (floating local stamp)
function calStampFromISO(iso) { return (iso || '').slice(0, 19).replace(/[-:]/g, ''); }

function gcalUrl(title, when, details, location) {
  const dates = calStampFromISO(when.startISO) + '/' + calStampFromISO(when.endISO);
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: title || 'Пробное занятие', dates: dates,
    details: details || '', location: location || '', ctz: ALMATY_TZ
  });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function icsLink(origin, title, when, details, location) {
  const q = new URLSearchParams({
    t: title || 'Пробное занятие',
    s: calStampFromISO(when.startISO), e: calStampFromISO(when.endISO),
    d: details || '', l: location || ''
  });
  return origin + '/ics?' + q.toString();
}

function icsEsc(s) { return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n'); }

function handleIcs(request) {
  const u = new URL(request.url);
  const t = u.searchParams.get('t') || 'Пробное занятие';
  const s = u.searchParams.get('s');
  const e = u.searchParams.get('e');
  const d = u.searchParams.get('d') || '';
  const l = u.searchParams.get('l') || '';
  if (!s || !e) return new Response('bad request', { status: 400 });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shpigotskiy Art Space//trial//RU',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Almaty',
    'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0500', 'TZOFFSETTO:+0500', 'TZNAME:+05', 'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'UID:' + stamp + '-' + Math.random().toString(36).slice(2) + '@artshpace',
    'DTSTAMP:' + stamp,
    'DTSTART;TZID=Asia/Almaty:' + s,
    'DTEND;TZID=Asia/Almaty:' + e,
    'SUMMARY:' + icsEsc(t),
    'DESCRIPTION:' + icsEsc(d),
    'LOCATION:' + icsEsc(l),
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(t), 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="probnoe.ics"',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// --- Service-account OAuth: signed JWT → access_token ---
async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: env.GOOGLE_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const key = await importPkcs8(env.GOOGLE_SA_PRIVATE_KEY);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + '.' + b64urlBytes(new Uint8Array(sig));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt
  });
  if (!res.ok) throw new Error('token failed: ' + res.status + ' ' + (await res.text()));
  return (await res.json()).access_token;
}

async function importPkcs8(pem) {
  const clean = pem.replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function b64url(str) { return b64urlBytes(new TextEncoder().encode(str)); }
function b64urlBytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* =============================================================================
   ТЕЛЕГРАМ-БОТ ПОСЕЩАЕМОСТИ
   ---------------------------------------------------------------------------
   • Родитель добавляет ребёнка: ФИО → направление → группа (из расписания).
   • Cron за 24ч и 1ч до занятия шлёт напоминание с кнопками «Да/Нет».
   • «Нет» → бот просит причину; ответ пересылается владельцу.
   • Все ответы дублируются владельцу (OWNER_CHAT_ID или TELEGRAM_CHAT_ID).
   Хранилище — Supabase (migration 0019). Время — Asia/Almaty (+5).
   ============================================================================= */
const BOT_TZ_OFFSET = 5 * 3600 * 1000;
const WD_FULL  = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const WD_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
// Направления — используются только для шага "выбрать направление" при
// регистрации ученика на напоминания (reg:dir). Расписание/цены/контакты
// теперь только в приложении (сайте), бот их больше не дублирует.
const BOT_DIRS = ['Гитара','Вокал','Актёрское мастерство','Современный танец','Живопись'];

// Живой сайт студии — он же Telegram Mini App (открывается кнопкой web_app).
// Канонический хост (см. CLAUDE.md, og:url/canonical на всех страницах
// сайта) — artshpace.github.io/bot/, БЕЗ единицы. Раньше здесь было
// .../bot1/ — Telegram грузил несуществующий путь под кнопкой (GitHub
// Pages отдаёт 404, но для Web View это выглядит как «что-то открылось»,
// не как явная ошибка — поэтому кнопка казалась «рабочей», хотя вела не
// туда).
const SITE_URL = 'https://artshpace.github.io/bot/website/index.html';

// Группы — раньше были захардкожены здесь; теперь живут в таблице bot_groups
// (миграция 0022_bot_groups_table.sql), правки не требуют деплоя воркера.
// days: 0=Вс…6=Сб. time: начало занятия (Almaty).
async function loadBotGroups(env){
  return sbSelect(env, '/bot_groups?select=id,dir,age,teacher,days,time&active=eq.true&order=id');
}
async function botGroup(env, id){
  const rows = await sbSelect(env, '/bot_groups?select=id,dir,age,teacher,days,time&id=eq.' + enc(id) + '&limit=1');
  return rows[0] || null;
}
function botGroupLabel(g){ return g.age + ' · ' + g.days.map(d => WD_SHORT[d]).join('/') + ' ' + g.time + ' · ' + g.teacher; }

/* ---------- Telegram ---------- */
async function tgApi(env, method, payload){
  const r = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    console.error('tgApi ' + method + ' failed: ' + r.status + ' ' + errBody);
  }
  return r;
}
function kb(rows){ return { inline_keyboard: rows }; }
async function sendText(env, chatId, text, keyboard, parseMode){
  const p = { chat_id: chatId, text }; if (keyboard) p.reply_markup = keyboard;
  if (parseMode) p.parse_mode = parseMode;
  await tgApi(env, 'sendMessage', p);
}
async function editText(env, chatId, msgId, text){ await tgApi(env,'editMessageText',{ chat_id:chatId, message_id:msgId, text }); }
async function answerCb(env, id){ await tgApi(env,'answerCallbackQuery',{ callback_query_id:id }); }
async function notifyOwner(env, text){ const chat = env.OWNER_CHAT_ID || env.TELEGRAM_CHAT_ID; if (chat) await sendText(env, chat, text); }

/* ---------- Supabase (service-role) ----------
   sbCfg() возвращает null, если SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY не
   заданы в Worker (Settings → Variables and Secrets) — до этой правки
   ensureParent()/getState()/... падали с TypeError на env.SUPABASE_URL.replace
   ещё до того, как бот успевал ответить setMenuButton()/sendMenu(); внешний
   try/catch в handleBotWebhook эту ошибку тихо глотал (console.error без
   ответа пользователю) → бот вообще не отвечал на /start, хотя постоянная
   кнопка-меню (setChatMenuButton, не зависит от бота) продолжала работать.
   Теперь все sb*-хелперы при отсутствующем конфиге — безопасный no-op
   (select → [], записи → ничего не делают), так что бот отвечает и без
   Supabase; просто не сохраняет родителей/состояние для напоминаний. */
function sbCfg(env){
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return {
    base: env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1',
    h: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type':'application/json' }
  };
}
async function sbSelect(env, q){ const cfg=sbCfg(env); if(!cfg) return []; const r=await fetch(cfg.base+q,{headers:cfg.h}); return r.ok ? r.json() : []; }
async function sbInsert(env, table, obj){ const cfg=sbCfg(env); if(!cfg) return; return fetch(cfg.base+'/'+table,{method:'POST',headers:Object.assign({Prefer:'return=minimal'},cfg.h),body:JSON.stringify(obj)}); }
async function sbUpsert(env, table, obj, conflict){ const cfg=sbCfg(env); if(!cfg) return; return fetch(cfg.base+'/'+table+'?on_conflict='+conflict,{method:'POST',headers:Object.assign({Prefer:'resolution=merge-duplicates,return=minimal'},cfg.h),body:JSON.stringify(obj)}); }
async function sbPatch(env, q, obj){ const cfg=sbCfg(env); if(!cfg) return; return fetch(cfg.base+q,{method:'PATCH',headers:Object.assign({Prefer:'return=minimal'},cfg.h),body:JSON.stringify(obj)}); }
async function sbDelete(env, q){ const cfg=sbCfg(env); if(!cfg) return; return fetch(cfg.base+q,{method:'DELETE',headers:cfg.h}); }
const enc = encodeURIComponent;

/* ---------- состояние диалога / родитель ---------- */
async function getState(env, chatId){ const rows=await sbSelect(env,'/bot_state?select=step,data&chat_id=eq.'+enc(String(chatId))+'&limit=1'); return rows[0]||null; }
async function setState(env, chatId, step, data){ await sbUpsert(env,'bot_state',{chat_id:String(chatId),step:step,data:data||{},updated_at:new Date().toISOString()},'chat_id'); }
async function clearState(env, chatId){ await sbDelete(env,'/bot_state?chat_id=eq.'+enc(String(chatId))); }
async function ensureParent(env, chatId, from){
  const name=[from&&from.first_name,from&&from.last_name].filter(Boolean).join(' ')+(from&&from.username?(' (@'+from.username+')'):'');
  await sbUpsert(env,'bot_parents',{chat_id:String(chatId),tg_name:(name.trim()||null)},'chat_id');
}
async function parentName(env, chatId){ const rows=await sbSelect(env,'/bot_parents?select=tg_name&chat_id=eq.'+enc(String(chatId))+'&limit=1'); return (rows[0]&&rows[0].tg_name)||('чат '+chatId); }

/* ---------- меню и регистрация ---------- */
// Расписание/направления/цены/контакты теперь только в приложении (сайте) —
// у него функционал шире, чем можно нативно сделать в чате. Бот отвечает
// за то, чего сайт не может: пуш-напоминания о занятиях и быстрый ввод
// ученика в базу для этих напоминаний.
async function sendMenu(env, chatId, greet){
  const head = greet ? '👋 Это бот студии *Shpigotskiy Art Space*.\nОткрывает сайт как приложение и присылает напоминания о занятиях.\n\n' : '';
  await sendText(env, chatId, head + 'Что хотите сделать?', kb([
    [{ text:'🌐 Открыть приложение (сайт)', web_app:{ url: SITE_URL } }],
    [{ text:'✍️ Записаться на пробное',      web_app:{ url: SITE_URL + '#trial' } }],
    [{ text:'➕ Добавить ученика (для напоминаний)', callback_data:'reg:new' },
     { text:'📋 Мои записи',       callback_data:'my:list' }],
    [{ text:'💬 Написать в WhatsApp', url:'https://wa.me/77086366351?text=' + encodeURIComponent('Здравствуйте! Пишу из Telegram-бота Shpigotskiy Art Space.') }],
    [{ text:'📸 Instagram', url:'https://instagram.com/artshpace' }]
  ]), 'Markdown');
}

// Раньше эти команды показывали расписание/направления/цены/контакты прямо
// в чате — теперь всё это только в приложении, команды просто открывают его.
async function sendOpenAppHint(env, chatId, what){
  await sendText(env, chatId, what + ' — в приложении, там удобнее и полнее.', kb([
    [{ text:'🌐 Открыть приложение', web_app:{ url: SITE_URL } }],
    [{ text:'‹ В меню', callback_data:'nav:menu' }]
  ]));
}

// Постоянная кнопка-меню чата открывает сайт как Mini App (идемпотентно на /start).
async function setMenuButton(env, chatId){
  await tgApi(env, 'setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'web_app', text: 'Приложение', web_app: { url: SITE_URL } }
  });
}
// Синий список команд бота. Идемпотентно.
async function setCommands(env){
  await tgApi(env, 'setMyCommands', { commands: [
    { command:'start',      description:'Меню бота' },
    { command:'add',        description:'➕ Добавить ученика' },
    { command:'children',   description:'📋 Мои записи' },
    { command:'admin',      description:'🔑 Админ-панель' }
  ]});
}

/* ---------- админ-панель (PIN-авторизация) ---------- */
async function isAdmin(env, chatId){
  const rows = await sbSelect(env, '/bot_admins?select=chat_id&chat_id=eq.' + enc(String(chatId)) + '&limit=1');
  return rows.length > 0;
}
// Доп. allowlist (ADMIN_TG_IDS, через запятую) — если задан, /admin молча игнорируется
// для остальных, не раскрывая, что админ-режим вообще существует.
function isAllowedAdminId(env, chatId){
  if (!env.ADMIN_TG_IDS) return true;
  const list = String(env.ADMIN_TG_IDS).split(',').map(s => s.trim()).filter(Boolean);
  return list.indexOf(String(chatId)) !== -1;
}
async function handleAdminCmd(env, chatId){
  if (await isAdmin(env, chatId)) { await sendAdminPanel(env, chatId); return; }
  if (!isAllowedAdminId(env, chatId)) return;
  if (!env.ADMIN_PIN) { await sendText(env, chatId, '🔒 Админ-панель не настроена.'); return; }
  await setState(env, chatId, 'admin_pin', { attempts: 0 });
  await sendText(env, chatId, '🔒 Введите PIN администратора:');
}
async function onAdminPin(env, chatId, text, data){
  const attempts = (data.attempts || 0) + 1;
  if ((text || '').trim() === String(env.ADMIN_PIN)) {
    await sbUpsert(env, 'bot_admins', { chat_id: String(chatId), granted_at: new Date().toISOString() }, 'chat_id');
    await clearState(env, chatId);
    await sendAdminPanel(env, chatId);
    return;
  }
  if (attempts >= 3) {
    await clearState(env, chatId);
    await sendText(env, chatId, '⛔️ Слишком много попыток. Наберите /admin позже.');
    return;
  }
  await setState(env, chatId, 'admin_pin', { attempts });
  await sendText(env, chatId, '❌ Неверный PIN. Осталось попыток: ' + (3 - attempts));
}
// Раздел управления слотами убран вместе с нативным календарём — расписание
// теперь показывает только приложение (сайт). В админке остаётся ростер
// учеников, набранных ботом для напоминаний.
async function sendAdminPanel(env, chatId){
  await sendText(env, chatId, '🔑 *Админ-панель*', kb([
    [{ text: '👥 Ученики', callback_data: 'adm:students' }],
    [{ text: '🚪 Выйти из админки', callback_data: 'adm:logout' }],
    [{ text: '‹ В меню', callback_data: 'nav:menu' }]
  ]), 'Markdown');
}
async function sendAdminStudents(env, chatId){
  const kids = await sbSelect(env, '/bot_students?select=id,child_name,direction,group_id&active=eq.true&order=created_at.desc&limit=30');
  if (!kids.length) { await sendText(env, chatId, 'Учеников пока нет.', kb([[{ text: '‹ Панель', callback_data: 'adm:panel' }]])); return; }
  const lines = [];
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i]; const g = await botGroup(env, k.group_id);
    lines.push((i + 1) + '. ' + k.child_name + ' — ' + k.direction + (g ? (' · ' + botGroupLabel(g)) : ''));
  }
  const rows = kids.map(k => [{ text: '🗑 ' + k.child_name, callback_data: 'adm:stu:del:' + k.id }]);
  rows.push([{ text: '‹ Панель', callback_data: 'adm:panel' }]);
  await sendText(env, chatId, '👥 *Ученики* (последние ' + kids.length + ')\n\n' + lines.join('\n'), kb(rows), 'Markdown');
}

async function onCallback(env, cq){
  const chatId = cq.message && cq.message.chat ? cq.message.chat.id : (cq.from && cq.from.id);
  const msgId  = cq.message && cq.message.message_id;
  const data   = cq.data || '';
  await answerCb(env, cq.id);
  const parts = data.split(':');

  if (data === 'nav:menu'){ await sendMenu(env, chatId, false); return; }

  if (parts[0] === 'adm'){
    const admin = await isAdmin(env, chatId);
    if (!admin){ await sendText(env, chatId, '⛔️ Доступ только для администраторов. Наберите /admin.'); return; }
    if (data === 'adm:panel'){    await sendAdminPanel(env, chatId);    return; }
    if (data === 'adm:students'){ await sendAdminStudents(env, chatId); return; }
    if (parts[1] === 'stu' && parts[2] === 'del'){ await sbDelete(env, '/bot_students?id=eq.' + enc(parts[3])); await sendAdminStudents(env, chatId); return; }
    if (data === 'adm:logout'){ await sbDelete(env, '/bot_admins?chat_id=eq.' + enc(String(chatId))); await sendText(env, chatId, 'Вы вышли из админ-панели.'); return; }
    return;
  }

  if (data === 'reg:new'){
    await ensureParent(env, chatId, cq.from);
    await setState(env, chatId, 'reg_name', {});
    await sendText(env, chatId, 'Введите, пожалуйста, ФИО ученика — ребёнка или взрослого — одним сообщением.',
      kb([[{ text: '‹ Отмена', callback_data: 'reg:cancel' }]]));
    return;
  }
  if (data === 'reg:cancel'){
    await clearState(env, chatId);
    await sendMenu(env, chatId, false);
    return;
  }
  if (parts[0]==='reg' && parts[1]==='dir'){
    const dir = BOT_DIRS[Number(parts[2])]; if(!dir) return;
    const st = await getState(env, chatId); const d = (st&&st.data)||{};
    d.dir = dir; await setState(env, chatId, 'reg_pick', d);
    const groups = (await loadBotGroups(env)).filter(g=>g.dir===dir);
    await sendText(env, chatId, 'Выберите группу по направлению «'+dir+'»:',
      kb(groups.map(g=>[{ text: botGroupLabel(g), callback_data:'reg:grp:'+g.id }]).concat([[{ text: '‹ Отмена', callback_data: 'reg:cancel' }]])));
    return;
  }
  if (parts[0]==='reg' && parts[1]==='grp'){
    const g = await botGroup(env, parts[2]); if(!g) return;
    const st = await getState(env, chatId); const d=(st&&st.data)||{};
    const child = d.child_name || 'Ребёнок';
    const ins = await sbInsert(env,'bot_students',{chat_id:String(chatId),child_name:child,direction:g.dir,group_id:g.id});
    await clearState(env, chatId);
    if(!ins.ok){ await sendText(env, chatId,'⚠️ Не удалось сохранить. Попробуйте ещё раз: /start'); return; }
    await sendText(env, chatId, '✅ Добавлено:\n👤 '+child+'\n🎯 '+g.dir+' — '+g.age+'\n📅 '+g.days.map(x=>WD_SHORT[x]).join('/')+' '+g.time+'\n\nЯ пришлю напоминание за сутки и за час до занятия.');
    await notifyOwner(env, '🆕 Новый ребёнок в боте\n👤 '+child+'\n🎯 '+g.dir+' · '+botGroupLabel(g)+'\n👪 Родитель: '+(await parentName(env,chatId)));
    await sendMenu(env, chatId, false);
    return;
  }
  if (data === 'my:list'){
    const kids = await sbSelect(env,'/bot_students?select=id,child_name,direction,group_id&chat_id=eq.'+enc(String(chatId))+'&active=eq.true&order=created_at');
    if(!kids.length){ await sendText(env, chatId,'Пока нет добавленных учеников.', kb([[{text:'➕ Добавить ученика',callback_data:'reg:new'}]])); return; }
    for(let i=0;i<kids.length;i++){
      const k=kids[i]; const g=await botGroup(env, k.group_id);
      const rows=[[{text:'🗑 Удалить',callback_data:'my:del:'+k.id}]];
      if (i === kids.length - 1) rows.push([{ text:'‹ В меню', callback_data:'nav:menu' }]);
      await sendText(env, chatId, '👤 '+k.child_name+'\n🎯 '+k.direction+(g?(' — '+botGroupLabel(g)):''), kb(rows));
    }
    return;
  }
  if (parts[0]==='my' && parts[1]==='del'){
    await sbDelete(env,'/bot_students?id=eq.'+enc(parts[2])+'&chat_id=eq.'+enc(String(chatId)));
    await sendText(env, chatId,'Удалено.');
    return;
  }
  if (parts[0]==='att'){ await onAttendance(env, chatId, msgId, parts); return; }
}
async function onRegName(env, chatId, text){
  const name=(text||'').trim();
  if(name.length<3 || !/[А-Яа-яЁёA-Za-z]/.test(name)){ await sendText(env, chatId,'Пожалуйста, введите ФИО ученика текстом (например: Иванов Иван).'); return; }
  await setState(env, chatId,'reg_pick',{child_name:name});
  await sendText(env, chatId,'Выберите направление, на котором занимается '+name+':',
    kb(BOT_DIRS.map((d,i)=>[{text:d,callback_data:'reg:dir:'+i}]).concat([[{ text:'‹ Отмена', callback_data:'reg:cancel' }]])));
}

/* ---------- ответ на напоминание ---------- */
async function onAttendance(env, chatId, msgId, parts){
  const sid=parts[1], dateC=parts[2], gid=parts[3], resp=parts[4];
  const lessonDate = dateC.slice(0,4)+'-'+dateC.slice(4,6)+'-'+dateC.slice(6,8);
  const g = await botGroup(env, gid);
  const kids = await sbSelect(env,'/bot_students?select=child_name,direction&id=eq.'+enc(sid)+'&limit=1');
  const child = (kids[0]&&kids[0].child_name)||'Ребёнок';
  const who = await parentName(env, chatId);
  const when = lessonDate.split('-').reverse().join('.')+(g?(' '+g.time):'');

  await sbPatch(env,'/bot_attendance?student_id=eq.'+enc(sid)+'&lesson_date=eq.'+enc(lessonDate)+'&group_id=eq.'+enc(gid),
    { response: (resp==='y'?'yes':'no'), responded_at:new Date().toISOString() });

  if(resp==='y'){
    if(msgId) await editText(env, chatId, msgId, '✅ Спасибо! Отметил, что '+child+' придёт '+when+'. Ждём!');
    await notifyOwner(env, '✅ ПРИДЁТ\n👤 '+child+(g?(' — '+g.dir+' '+g.age):'')+'\n📅 '+when+'\n👪 '+who);
  } else {
    if(msgId) await editText(env, chatId, msgId, '❌ Записал, что '+child+' не придёт '+when+'.\n\nНапишите, пожалуйста, причину пропуска одним сообщением.');
    await setState(env, chatId,'await_reason',{student_id:sid,lesson_date:lessonDate,group_id:gid,child_name:child,when:when});
    await notifyOwner(env, '❌ НЕ ПРИДЁТ\n👤 '+child+(g?(' — '+g.dir+' '+g.age):'')+'\n📅 '+when+'\n👪 '+who+'\n⏳ причину уточняю…');
  }
}
async function onReason(env, chatId, text, data){
  const reason=(text||'').trim();
  await sbPatch(env,'/bot_attendance?student_id=eq.'+enc(data.student_id)+'&lesson_date=eq.'+enc(data.lesson_date)+'&group_id=eq.'+enc(data.group_id),
    { reason: reason });
  await clearState(env, chatId);
  await sendText(env, chatId,'Спасибо, передал причину администратору. Хорошего дня! 🙌');
  await notifyOwner(env, '📝 ПРИЧИНА ПРОПУСКА\n👤 '+(data.child_name||'')+'\n📅 '+(data.when||data.lesson_date)+'\n💬 '+reason+'\n👪 '+(await parentName(env,chatId)));
}

/* ---------- планировщик (24ч и 1ч) ---------- */
function almatyParts(ms){ const d=new Date(ms+BOT_TZ_OFFSET); return { y:d.getUTCFullYear(), mo:d.getUTCMonth(), da:d.getUTCDate(), dow:d.getUTCDay() }; }
function occYmd(ms){ const p=almatyParts(ms); return p.y+'-'+String(p.mo+1).padStart(2,'0')+'-'+String(p.da).padStart(2,'0'); }
function occCompact(ms){ return occYmd(ms).replace(/-/g,''); }
function occDdMm(ms){ const p=almatyParts(ms); return String(p.da).padStart(2,'0')+'.'+String(p.mo+1).padStart(2,'0'); }
function occurrencesWithin(g, now, horizon){
  const out=[]; const hh=Number(g.time.slice(0,2)), mm=Number(g.time.slice(3,5));
  for(let add=0; add<=8; add++){
    const p=almatyParts(now+add*86400000);
    if(g.days.indexOf(p.dow)===-1) continue;
    const occ=Date.UTC(p.y,p.mo,p.da,hh,mm)-BOT_TZ_OFFSET;
    if(occ>=now && occ<=now+horizon) out.push(occ);
  }
  return out;
}
async function runReminders(env){
  const now=Date.now(); const H=25*3600000; let sent=0;
  const kids = await sbSelect(env,'/bot_students?select=id,chat_id,child_name,direction,group_id&active=eq.true');
  for(const k of kids){
    const g=await botGroup(env, k.group_id); if(!g) continue;
    for(const occ of occurrencesWithin(g, now, H)){
      const delta=occ-now;
      let kind=null;
      if(delta>3600000 && delta<=24*3600000) kind='24h';
      else if(delta>0 && delta<=3600000)     kind='1h';
      if(!kind) continue;
      const lessonDate=occYmd(occ);
      const dup=await sbSelect(env,'/bot_attendance?select=id&student_id=eq.'+enc(k.id)+'&lesson_date=eq.'+enc(lessonDate)+'&group_id=eq.'+enc(g.id)+'&kind=eq.'+kind+'&limit=1');
      if(dup.length) continue;
      const ins=await sbInsert(env,'bot_attendance',{student_id:k.id,lesson_date:lessonDate,lesson_time:g.time,group_id:g.id,kind:kind});
      if(!ins.ok) continue; // 409 = уже отправлено (гонка)
      const head = kind==='24h' ? '🔔 Напоминание о занятии (за сутки)' : '🔔 Скоро занятие (примерно через час)';
      await sendText(env, k.chat_id,
        head+'\n\n👤 '+k.child_name+'\n🎯 '+g.dir+' — '+g.age+'\n👨‍🏫 '+g.teacher+'\n📅 '+occDdMm(occ)+' ('+WD_FULL[almatyParts(occ).dow]+') в '+g.time+'\n\nПридёт ли ученик на занятие?',
        kb([[{text:'✅ Да', callback_data:'att:'+k.id+':'+occCompact(occ)+':'+g.id+':y'},
             {text:'❌ Нет',callback_data:'att:'+k.id+':'+occCompact(occ)+':'+g.id+':n'}]]));
      sent++;
    }
  }
  return sent;
}

/* =============================================================================
   META CONVERSIONS API — серверное событие Lead
   ---------------------------------------------------------------------------
   Дедуп с браузерным пикселем по event_id (сайт присылает его же). Телефон/имя
   хешируются SHA-256 (требование Meta). Токен — только в env.META_CAPI_TOKEN.
   ============================================================================= */
const META_PIXEL = '320219384379297';
async function sha256hex(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function capiNormPhone(p){
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);   // 8XXXXXXXXXX → 7…
  if (d.length === 10) d = '7' + d;                             // без кода страны → +7
  return d;
}
async function sendCapiLead(env, body, request){
  const ud = {};
  const ph = capiNormPhone(body.phone);
  if (ph) ud.ph = [await sha256hex(ph)];
  const nm = String(body.name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (nm[0]) ud.fn = [await sha256hex(nm[0])];
  if (nm[1]) ud.ln = [await sha256hex(nm[1])];
  const ip = request.headers.get('CF-Connecting-IP'); if (ip) ud.client_ip_address = ip;
  const ua = request.headers.get('User-Agent');       if (ua) ud.client_user_agent = ua;

  const payload = { data: [{
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: body.pageUrl || request.headers.get('Referer') || 'https://artshpace.github.io/bot/website/',
    event_id: body.eventId || ('lead-' + Date.now()),
    user_data: ud,
    custom_data: { content_name: body.direction || 'Заявка' }
  }]};

  const url = 'https://graph.facebook.com/v21.0/' + META_PIXEL + '/events?access_token=' + encodeURIComponent(env.META_CAPI_TOKEN);
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) console.error('CAPI resp ' + r.status + ': ' + (await r.text()).slice(0, 300));
  else console.log('CAPI Lead sent, event_id=' + payload.data[0].event_id);
}
