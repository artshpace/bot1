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
    if (got !== env.WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 });
  }

  let update;
  try { update = await request.json(); }
  catch { return ok(); }

  try {
    // Нажатие inline-кнопки (Да/Нет, выбор направления/группы, меню)
    if (update.callback_query) { await onCallback(env, update.callback_query); return ok(); }

    const msg = update.message || update.edited_message;
    if (!msg || !msg.chat) return ok();
    const chatId = msg.chat.id;
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
    if (/^\/(schedule|raspisanie)/i.test(text)) { await sendScheduleDirs(env, chatId); return ok(); }
    if (/^\/(directions|napravleniya|dirs)/i.test(text)) { await sendDirsMenu(env, chatId); return ok(); }
    if (/^\/(price|prices|ceny|tseny)/i.test(text)) { await sendPrice(env, chatId); return ok(); }
    if (/^\/(contacts|kontakty)/i.test(text)) { await sendContacts(env, chatId); return ok(); }
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
    if (st && st.step === 'dir_search')   { await onDirSearch(env, chatId, text); return ok(); }

    // Ничего не совпало по состоянию — пробуем угадать направление по слову
    // (набирает «гитара»/«танцы»/… прямо в чат, без входа через кнопку поиска).
    const guess = matchDirByKeyword(text);
    if (guess !== -1) { await sendDirDetail(env, chatId, guess); return ok(); }

    await sendText(env, chatId, 'Не понял 🙂 Нажмите /start, чтобы открыть меню.');
    return ok();
  } catch (e) {
    console.error('bot webhook error:', e && e.message);
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
const BOT_DIRS = ['Гитара','Вокал','Актёрское мастерство','Современный танец','Живопись'];
const DIR_EMOJI = ['🎸','🎤','🎭','💃','🎨'];
const DIR_BLURBS = {
  'Гитара': 'Гитара, укулеле, домбра. Преподаватели Георгий Захаров и Виталий Жуков. Есть группа для взрослых 18+.',
  'Вокал': 'Постановка голоса и дыхания. Наталья Ерзакова — высшая категория, 50+ лет опыта.',
  'Актёрское мастерство': 'Раскрепощение, речь, уверенность на сцене. Педагоги Марина Черняк, Оксана Розанова; группа 14+ — владелец студии Антон Шпигоцкий (Малый театр, драмтеатр им. Н. Погодина).',
  'Современный танец': 'Пластика и координация. Дарья Клюк — 14+ лет опыта, ансамбль Arabesque.',
  'Живопись': 'Рисунок, живопись, творческое мышление. Педагог Мария Андрюшенко.'
};
function dirAgeGroups(dir){ return Array.from(new Set(BOT_GROUPS.filter(g => g.dir === dir).map(g => g.age))).join(', ') || '—'; }
function dirSampleSchedule(dir){
  return BOT_GROUPS.filter(g => g.dir === dir).slice(0, 2)
    .map(g => g.days.map(d => WD_SHORT[d]).join('/') + ' ' + groupTimeRange(g) + ' — ' + g.teacher).join('\n') || '—';
}

// Поиск направления по слову — и явной кнопкой, и опортунистически по любому тексту.
const DIR_KEYWORDS = {
  'Гитара': ['гитар', 'укулеле', 'домбр'],
  'Вокал': ['вокал', 'петь', 'пение', 'голос'],
  'Актёрское мастерство': ['актер', 'актёр', 'сцен', 'театр', 'ораторск'],
  'Современный танец': ['танец', 'танцы', 'танц'],
  'Живопись': ['живопис', 'рисова', 'рисунок', 'художеств']
};
function matchDirByKeyword(text){
  const q = (text || '').trim().toLowerCase();
  if (!q) return -1;
  for (let i = 0; i < BOT_DIRS.length; i++){
    const dir = BOT_DIRS[i].toLowerCase();
    if (dir.indexOf(q) !== -1 || q.indexOf(dir) !== -1) return i;
    const kws = DIR_KEYWORDS[BOT_DIRS[i]] || [];
    for (const kw of kws) if (q.indexOf(kw) !== -1) return i;
  }
  return -1;
}

// Живой сайт студии — он же Telegram Mini App (открывается кнопкой web_app).
const SITE_URL = 'https://artshpace.github.io/bot1/website/index.html';

// Группы — зеркало schedule.html. days: 0=Вс…6=Сб. time: начало занятия (Almaty).
const BOT_GROUPS = [
  { id:'g1', dir:'Гитара', age:'разный возраст', teacher:'Георгий Захаров', days:[1,3,5], time:'09:00' },
  { id:'g2', dir:'Гитара', age:'разный возраст', teacher:'Виталий Жуков',   days:[1,3,5], time:'10:00' },
  { id:'g3', dir:'Гитара', age:'разный возраст', teacher:'Виталий Жуков',   days:[1,3,5], time:'11:00' },
  { id:'g4', dir:'Гитара', age:'разный возраст', teacher:'Виталий Жуков',   days:[1,3,5], time:'16:00' },
  { id:'g5', dir:'Гитара', age:'разный возраст', teacher:'Виталий Жуков',   days:[1,3,5], time:'17:00' },
  { id:'g6', dir:'Гитара', age:'разный возраст', teacher:'Виталий Жуков',   days:[1,3,5], time:'18:00' },
  { id:'g7', dir:'Гитара', age:'разный возраст', teacher:'Виталий Жуков',   days:[1,3,5], time:'19:00' },
  { id:'g8', dir:'Гитара', age:'18+',            teacher:'Виталий Жуков',   days:[1,3,5], time:'20:00' },
  { id:'g9', dir:'Гитара', age:'разный возраст', teacher:'Георгий Захаров', days:[2,4,6], time:'17:00' },
  { id:'v1', dir:'Вокал', age:'7–10 лет', teacher:'Наталья Ерзакова', days:[6,0], time:'12:00' },
  { id:'v2', dir:'Вокал', age:'11+',      teacher:'Наталья Ерзакова', days:[6,0], time:'13:00' },
  { id:'a1', dir:'Актёрское мастерство', age:'4–6 лет',   teacher:'Марина Черняк',   days:[6,0], time:'15:45' },
  { id:'a2', dir:'Актёрское мастерство', age:'7–10 лет',  teacher:'Оксана Розанова', days:[1,3], time:'15:00' },
  { id:'a3', dir:'Актёрское мастерство', age:'7–10 лет',  teacher:'Марина Черняк',   days:[2,4], time:'09:30' },
  { id:'a4', dir:'Актёрское мастерство', age:'7–10 лет',  teacher:'Марина Черняк',   days:[6,0], time:'14:45' },
  { id:'a5', dir:'Актёрское мастерство', age:'11–14 лет', teacher:'Оксана Розанова', days:[1,3], time:'09:00' },
  { id:'a6', dir:'Актёрское мастерство', age:'11–14 лет', teacher:'Оксана Розанова', days:[1,3], time:'16:00' },
  { id:'a7', dir:'Актёрское мастерство', age:'11–14 лет', teacher:'Марина Черняк',   days:[6,0], time:'09:00' },
  { id:'a8', dir:'Актёрское мастерство', age:'14+',       teacher:'Антон Шпигоцкий', days:[6,0], time:'14:30' },
  { id:'d1', dir:'Современный танец', age:'4–6 лет',   teacher:'Дарья Клюк', days:[1,3,5], time:'18:30' },
  { id:'d2', dir:'Современный танец', age:'от 11 лет', teacher:'Дарья Клюк', days:[6,0], time:'11:30' },
  { id:'d3', dir:'Современный танец', age:'7–10 лет',  teacher:'Дарья Клюк', days:[6,0], time:'13:00' },
  { id:'p1', dir:'Живопись', age:'4–6 лет',  teacher:'Мария Андрюшенко', days:[6], time:'10:00' },
  { id:'p2', dir:'Живопись', age:'7–10 лет', teacher:'Мария Андрюшенко', days:[0], time:'10:00' }
];
function botGroup(id){ return BOT_GROUPS.find(g => g.id === id) || null; }
function botGroupLabel(g){ return g.age + ' · ' + g.days.map(d => WD_SHORT[d]).join('/') + ' ' + g.time + ' · ' + g.teacher; }

/* ---------- Telegram ---------- */
async function tgApi(env, method, payload){
  return fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload)
  });
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

/* ---------- Supabase (service-role) ---------- */
function sbCfg(env){
  return {
    base: env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1',
    h: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type':'application/json' }
  };
}
async function sbSelect(env, q){ const {base,h}=sbCfg(env); const r=await fetch(base+q,{headers:h}); return r.ok ? r.json() : []; }
async function sbInsert(env, table, obj){ const {base,h}=sbCfg(env); return fetch(base+'/'+table,{method:'POST',headers:Object.assign({Prefer:'return=minimal'},h),body:JSON.stringify(obj)}); }
async function sbUpsert(env, table, obj, conflict){ const {base,h}=sbCfg(env); return fetch(base+'/'+table+'?on_conflict='+conflict,{method:'POST',headers:Object.assign({Prefer:'resolution=merge-duplicates,return=minimal'},h),body:JSON.stringify(obj)}); }
async function sbPatch(env, q, obj){ const {base,h}=sbCfg(env); return fetch(base+q,{method:'PATCH',headers:Object.assign({Prefer:'return=minimal'},h),body:JSON.stringify(obj)}); }
async function sbDelete(env, q){ const {base,h}=sbCfg(env); return fetch(base+q,{method:'DELETE',headers:h}); }
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

// Предпочтения: последнее направление, на которое смотрел пользователь (ярлык "⭐").
async function setLastDirection(env, chatId, dir){ await sbUpsert(env,'bot_parents',{chat_id:String(chatId),last_direction:dir},'chat_id'); }
async function getLastDirection(env, chatId){ const rows=await sbSelect(env,'/bot_parents?select=last_direction&chat_id=eq.'+enc(String(chatId))+'&limit=1'); return (rows[0]&&rows[0].last_direction)||null; }

/* ---------- меню и регистрация ---------- */
async function sendMenu(env, chatId, greet){
  const head = greet ? '👋 Это бот студии *Shpigotskiy Art Space*.\nВсё как на сайте: расписание, направления, запись на пробное и напоминания о занятиях.\n\n' : '';
  await sendText(env, chatId, head + 'Что хотите сделать?', kb([
    [{ text:'🌐 Открыть приложение (сайт)', web_app:{ url: SITE_URL } }],
    [{ text:'✍️ Записаться на пробное',      web_app:{ url: SITE_URL + '#trial' } }],
    [{ text:'📅 Расписание',   callback_data:'nav:schedule' },
     { text:'🎨 Направления',  callback_data:'nav:dirs' }],
    [{ text:'💰 Цены',         callback_data:'nav:price' },
     { text:'📞 Контакты',     callback_data:'nav:contacts' }],
    [{ text:'➕ Добавить ученика', callback_data:'reg:new' },
     { text:'📋 Мои записи',       callback_data:'my:list' }],
    [{ text:'💬 Написать в WhatsApp', url:'https://wa.me/77086366351?text=' + encodeURIComponent('Здравствуйте! Пишу из Telegram-бота Shpigotskiy Art Space.') }],
    [{ text:'📸 Instagram', url:'https://instagram.com/artshpace' }]
  ]), 'Markdown');
}

/* ---------- нативные разделы «как на сайте» ---------- */
// Формат окончания занятия: старт из BOT_GROUPS + 1 час (везде в расписании студии).
function groupTimeRange(g){
  const [h, m] = g.time.split(':').map(Number);
  const h2 = (h + 1) % 24;
  return g.time + '–' + String(h2).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
// Занятость слотов, переключаемая из админ-панели (✅ Есть места / ❌ Мест нет).
async function allGroupStatus(env){
  const rows = await sbSelect(env, '/bot_group_status?select=group_id,is_full');
  const map = {};
  for (const r of rows) map[r.group_id] = !!r.is_full;
  return map;
}
async function groupFullStatus(env, groupId){
  const rows = await sbSelect(env, '/bot_group_status?select=is_full&group_id=eq.' + enc(groupId) + '&limit=1');
  return rows.length ? !!rows[0].is_full : false;
}

// Шаг 1: выбор направления (5 кнопок) — как на сайте. Сверху — ярлык последнего
// просмотренного направления (запоминаем в bot_parents.last_direction).
async function sendScheduleDirs(env, chatId){
  const last = await getLastDirection(env, chatId);
  const rows = [];
  const lastIdx = last ? BOT_DIRS.indexOf(last) : -1;
  if (lastIdx !== -1) rows.push([{ text: '⭐ ' + last + ' (последнее)', callback_data: 'sch:dir:' + lastIdx }]);
  rows.push(...BOT_DIRS.map((d, i) => [{ text: d, callback_data: 'sch:dir:' + i }]));
  rows.push([{ text: '‹ В меню', callback_data: 'nav:menu' }]);
  await sendText(env, chatId, '📅 *Расписание*\nВыберите направление:', kb(rows), 'Markdown');
}

// Шаг 2: дни недели, в которые есть занятия по направлению (inline-кнопки).
async function sendScheduleDir(env, chatId, dirIdx){
  const dir = BOT_DIRS[dirIdx];
  if (!dir) { await sendScheduleDirs(env, chatId); return; }
  await setLastDirection(env, chatId, dir);
  const gs = BOT_GROUPS.filter(g => g.dir === dir);
  const daysPresent = Array.from(new Set(gs.reduce((a, g) => a.concat(g.days), [])))
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  if (!daysPresent.length) {
    await sendText(env, chatId, '🎯 *' + dir + '*\n\nГруппы формируются — уточните у менеджера.', kb([
      [{ text: '✍️ Записаться на пробное', web_app: { url: SITE_URL + '#trial' } }],
      [{ text: '‹ Направления', callback_data: 'nav:schedule' }, { text: '‹ В меню', callback_data: 'nav:menu' }]
    ]), 'Markdown');
    return;
  }
  const rows = [];
  for (let i = 0; i < daysPresent.length; i += 3) {
    rows.push(daysPresent.slice(i, i + 3).map(d => ({ text: WD_SHORT[d], callback_data: 'sch:day:' + dirIdx + ':' + d })));
  }
  rows.push([{ text: '‹ Направления', callback_data: 'nav:schedule' }, { text: '‹ В меню', callback_data: 'nav:menu' }]);
  await sendText(env, chatId, '🎯 *' + dir + '*\nВыберите день:', kb(rows), 'Markdown');
}

// Шаг 3: развёрнутый список слотов в выбранный день — время · педагог · свободно/занято.
async function sendScheduleDay(env, chatId, dirIdx, dayIdx){
  const dir = BOT_DIRS[dirIdx];
  if (!dir) { await sendScheduleDirs(env, chatId); return; }
  const gs = BOT_GROUPS.filter(g => g.dir === dir && g.days.indexOf(dayIdx) !== -1)
    .sort((a, b) => a.time.localeCompare(b.time));
  const statusMap = await allGroupStatus(env);
  const lines = gs.map(g => {
    const icon = statusMap[g.id] ? '❌ Мест нет' : '✅ Есть места';
    return '*' + groupTimeRange(g) + '*' + ' · ' + g.age + ' · _' + g.teacher + '_ · ' + icon;
  });
  const t = '🎯 *' + dir + '* — ' + WD_SHORT[dayIdx] + '\n\n' + (lines.length ? lines.join('\n') : 'В этот день занятий нет.');
  await sendText(env, chatId, t, kb([
    [{ text: '✍️ Записаться на пробное', web_app: { url: SITE_URL + '#trial' } }],
    [{ text: '‹ Дни', callback_data: 'sch:dir:' + dirIdx }, { text: '‹ Направления', callback_data: 'nav:schedule' }]
  ]), 'Markdown');
}

// Шаг 1: карточки-кнопки направлений (грид) + ярлык последнего просмотренного
// направления + вход в поиск по слову. Шаг 2: развёрнутая карточка.
async function sendDirsMenu(env, chatId){
  const last = await getLastDirection(env, chatId);
  const rows = [];
  const lastIdx = last ? BOT_DIRS.indexOf(last) : -1;
  if (lastIdx !== -1) rows.push([{ text: '⭐ ' + last + ' (последнее)', callback_data: 'dir:show:' + lastIdx }]);
  rows.push(...BOT_DIRS.map((d, i) => [{ text: (DIR_EMOJI[i] || '🎨') + ' ' + d + ' — Подробнее →', callback_data: 'dir:show:' + i }]));
  rows.push([{ text: '🔍 Найти по слову', callback_data: 'dir:search' }]);
  rows.push([{ text: '‹ В меню', callback_data: 'nav:menu' }]);
  await sendText(env, chatId, '🎭 *Направления студии*\nВыберите направление:', kb(rows), 'Markdown');
}
async function sendDirDetail(env, chatId, idx){
  const dir = BOT_DIRS[idx];
  if (!dir) { await sendDirsMenu(env, chatId); return; }
  await setLastDirection(env, chatId, dir);
  const t = (DIR_EMOJI[idx] || '🎨') + ' *' + dir + '*\n\n' + (DIR_BLURBS[dir] || '') +
    '\n\n👶 *Возраст:* ' + dirAgeGroups(dir) +
    '\n\n🗓 *Пример расписания:*\n' + dirSampleSchedule(dir);
  await sendText(env, chatId, t, kb([
    [{ text: '📅 Полное расписание', callback_data: 'sch:dir:' + idx }],
    [{ text: '✍️ Записаться на пробное', web_app: { url: SITE_URL + '#trial' } }],
    [{ text: '‹ Направления', callback_data: 'nav:dirs' }, { text: '‹ В меню', callback_data: 'nav:menu' }]
  ]), 'Markdown');
}

// Карточки по направлениям — без выдуманных цифр (сайт: «уточните у менеджера»);
// у каждой карточки своя кнопка WhatsApp с предзаполненным текстом направления.
async function sendPrice(env, chatId){
  let t = '💰 *Стоимость занятий*\n\n' +
    'Точную стоимость абонемента и разового занятия уточняйте у менеджера — подберём формат под направление и возраст.\n\n' +
    '🎁 *Первое пробное занятие — бесплатно.*\n';
  const rows = [];
  BOT_DIRS.forEach((dir, i) => {
    t += '\n' + (DIR_EMOJI[i] || '🎨') + ' *' + dir + '* — уточните у менеджера';
    rows.push([{ text: '💬 ' + dir + ' — узнать цену', url: 'https://wa.me/77086366351?text=' +
      encodeURIComponent('Здравствуйте! Подскажите, пожалуйста, стоимость занятий по направлению «' + dir + '».') }]);
  });
  rows.push([{ text: '✍️ Записаться на пробное', web_app: { url: SITE_URL + '#trial' } }]);
  rows.push([{ text: '‹ В меню', callback_data: 'nav:menu' }]);
  await sendText(env, chatId, t, kb(rows), 'Markdown');
}

// Контакты — мультивыбор: кому именно написать в WhatsApp (студия / руководитель / администратор).
async function sendContacts(env, chatId){
  const t = '📞 *Контакты — Shpigotskiy Art Space*\n\n' +
    '📍 Петропавловск, ул. Интернациональная, 63, 5 этаж\n' +
    '✉️ Email: artshpace@gmail.com\n' +
    '📸 Instagram: @artshpace\n\n' +
    'Кому написать в WhatsApp?';
  const waText = (who) => encodeURIComponent('Здравствуйте, я из бота Shpigotskiy Art Space. Пишу ' + who + '.');
  await sendText(env, chatId, t, kb([
    [{ text: '💬 Студия (основной)', url: 'https://wa.me/77086366351?text=' + waText('в студию') }],
    [{ text: '👤 Антон Шпигоцкий (руководитель)', url: 'https://wa.me/77084322371?text=' + waText('руководителю') }],
    [{ text: '🗂 Администратор', url: 'https://wa.me/77013980019?text=' + waText('администратору') }],
    [{ text: '📸 Instagram', url: 'https://instagram.com/artshpace' }],
    [{ text: '🗺 2ГИС', url: 'https://2gis.kz/petropavlovsk/firm/70000001085367039' },
     { text: '🗺 Яндекс', url: 'https://yandex.kz/maps/ru/org/shpigotskiy_art_space/106360488694/' }],
    [{ text: '‹ В меню', callback_data: 'nav:menu' }]
  ]), 'Markdown');
}

// Поиск направления по слову (кнопка "🔍 Найти по слову" в sendDirsMenu).
async function onDirSearch(env, chatId, text){
  await clearState(env, chatId);
  const idx = matchDirByKeyword(text);
  if (idx === -1){
    await sendText(env, chatId, 'Не нашёл такое направление. Доступные: ' + BOT_DIRS.join(', ') + '.',
      kb([[{ text: '🎭 Все направления', callback_data: 'nav:dirs' }]]));
    return;
  }
  await sendDirDetail(env, chatId, idx);
}

// Постоянная кнопка-меню чата открывает сайт как Mini App (идемпотентно на /start).
async function setMenuButton(env, chatId){
  await tgApi(env, 'setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'web_app', text: 'Приложение', web_app: { url: SITE_URL } }
  });
}
// Синий список команд бота (как разделы сайта). Идемпотентно.
async function setCommands(env){
  await tgApi(env, 'setMyCommands', { commands: [
    { command:'start',      description:'Меню бота' },
    { command:'schedule',   description:'📅 Расписание занятий' },
    { command:'directions', description:'🎨 Направления студии' },
    { command:'price',      description:'💰 Стоимость занятий' },
    { command:'contacts',   description:'📞 Контакты и адрес' },
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
async function sendAdminPanel(env, chatId){
  await sendText(env, chatId, '🔑 *Админ-панель*', kb([
    [{ text: '👥 Ученики', callback_data: 'adm:students' }],
    [{ text: '📅 Расписание (слоты)', callback_data: 'adm:sched' }],
    [{ text: '🚪 Выйти из админки', callback_data: 'adm:logout' }],
    [{ text: '‹ В меню', callback_data: 'nav:menu' }]
  ]), 'Markdown');
}
async function sendAdminStudents(env, chatId){
  const kids = await sbSelect(env, '/bot_students?select=id,child_name,direction,group_id&active=eq.true&order=created_at.desc&limit=30');
  if (!kids.length) { await sendText(env, chatId, 'Учеников пока нет.', kb([[{ text: '‹ Панель', callback_data: 'adm:panel' }]])); return; }
  const lines = kids.map((k, i) => (i + 1) + '. ' + k.child_name + ' — ' + k.direction + (botGroup(k.group_id) ? (' · ' + botGroupLabel(botGroup(k.group_id))) : ''));
  const rows = kids.map(k => [{ text: '🗑 ' + k.child_name, callback_data: 'adm:stu:del:' + k.id }]);
  rows.push([{ text: '‹ Панель', callback_data: 'adm:panel' }]);
  await sendText(env, chatId, '👥 *Ученики* (последние ' + kids.length + ')\n\n' + lines.join('\n'), kb(rows), 'Markdown');
}
async function sendAdminSchedDirs(env, chatId){
  const rows = BOT_DIRS.map((d, i) => [{ text: d, callback_data: 'adm:sch:dir:' + i }]);
  rows.push([{ text: '‹ Панель', callback_data: 'adm:panel' }]);
  await sendText(env, chatId, '📅 *Расписание — управление слотами*\nВыберите направление:', kb(rows), 'Markdown');
}
async function sendAdminSchedDir(env, chatId, dirIdx){
  const dir = BOT_DIRS[dirIdx];
  if (!dir) { await sendAdminSchedDirs(env, chatId); return; }
  const gs = BOT_GROUPS.filter(g => g.dir === dir);
  const statusMap = await allGroupStatus(env);
  const rows = gs.map(g => {
    const full = !!statusMap[g.id];
    const label = g.days.map(d => WD_SHORT[d]).join('/') + ' ' + groupTimeRange(g) + ' · ' + g.teacher + ' · ' + (full ? '❌ Полная' : '✅ Свободна');
    return [{ text: label, callback_data: 'adm:tog:' + g.id }];
  });
  rows.push([{ text: '‹ Направления', callback_data: 'adm:sched' }, { text: '‹ Панель', callback_data: 'adm:panel' }]);
  await sendText(env, chatId, '🎯 *' + dir + '*\nНажмите на слот, чтобы переключить статус.', kb(rows), 'Markdown');
}
async function toggleGroupStatus(env, chatId, groupId){
  const g = botGroup(groupId);
  if (!g) return;
  const cur = await groupFullStatus(env, groupId);
  await sbUpsert(env, 'bot_group_status', { group_id: groupId, is_full: !cur, updated_at: new Date().toISOString() }, 'group_id');
  await sendAdminSchedDir(env, chatId, BOT_DIRS.indexOf(g.dir));
}

async function onCallback(env, cq){
  const chatId = cq.message && cq.message.chat ? cq.message.chat.id : (cq.from && cq.from.id);
  const msgId  = cq.message && cq.message.message_id;
  const data   = cq.data || '';
  await answerCb(env, cq.id);
  const parts = data.split(':');

  if (parts[0] === 'nav'){
    if (data === 'nav:schedule'){ await sendScheduleDirs(env, chatId); return; }
    if (data === 'nav:dirs'){     await sendDirsMenu(env, chatId);  return; }
    if (data === 'nav:price'){    await sendPrice(env, chatId);    return; }
    if (data === 'nav:contacts'){ await sendContacts(env, chatId); return; }
    if (data === 'nav:menu'){     await sendMenu(env, chatId, false); return; }
  }
  if (parts[0] === 'sch' && parts[1] === 'dir'){ await sendScheduleDir(env, chatId, Number(parts[2])); return; }
  if (parts[0] === 'sch' && parts[1] === 'day'){ await sendScheduleDay(env, chatId, Number(parts[2]), Number(parts[3])); return; }
  if (parts[0] === 'dir' && parts[1] === 'show'){ await sendDirDetail(env, chatId, Number(parts[2])); return; }
  if (data === 'dir:search'){
    await setState(env, chatId, 'dir_search', {});
    await sendText(env, chatId, '🔍 Введите слово — например «гитара», «танцы», «вокал», «актёрское», «живопись».',
      kb([[{ text: '‹ Отмена', callback_data: 'reg:cancel' }]]));
    return;
  }

  if (parts[0] === 'adm'){
    const admin = await isAdmin(env, chatId);
    if (!admin){ await sendText(env, chatId, '⛔️ Доступ только для администраторов. Наберите /admin.'); return; }
    if (data === 'adm:panel'){    await sendAdminPanel(env, chatId);    return; }
    if (data === 'adm:students'){ await sendAdminStudents(env, chatId); return; }
    if (parts[1] === 'stu' && parts[2] === 'del'){ await sbDelete(env, '/bot_students?id=eq.' + enc(parts[3])); await sendAdminStudents(env, chatId); return; }
    if (data === 'adm:sched'){ await sendAdminSchedDirs(env, chatId); return; }
    if (parts[1] === 'sch' && parts[2] === 'dir'){ await sendAdminSchedDir(env, chatId, Number(parts[3])); return; }
    if (parts[1] === 'tog'){ await toggleGroupStatus(env, chatId, parts[2]); return; }
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
    const groups = BOT_GROUPS.filter(g=>g.dir===dir);
    await sendText(env, chatId, 'Выберите группу по направлению «'+dir+'»:',
      kb(groups.map(g=>[{ text: botGroupLabel(g), callback_data:'reg:grp:'+g.id }]).concat([[{ text: '‹ Отмена', callback_data: 'reg:cancel' }]])));
    return;
  }
  if (parts[0]==='reg' && parts[1]==='grp'){
    const g = botGroup(parts[2]); if(!g) return;
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
      const k=kids[i]; const g=botGroup(k.group_id);
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
  const g = botGroup(gid);
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
    const g=botGroup(k.group_id); if(!g) continue;
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
    event_source_url: body.pageUrl || request.headers.get('Referer') || 'https://artshpace.github.io/bot1/website/',
    event_id: body.eventId || ('lead-' + Date.now()),
    user_data: ud,
    custom_data: { content_name: body.direction || 'Заявка' }
  }]};

  const url = 'https://graph.facebook.com/v21.0/' + META_PIXEL + '/events?access_token=' + encodeURIComponent(env.META_CAPI_TOKEN);
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) console.error('CAPI resp ' + r.status + ': ' + (await r.text()).slice(0, 300));
  else console.log('CAPI Lead sent, event_id=' + payload.data[0].event_id);
}
