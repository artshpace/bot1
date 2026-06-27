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

    // --- Test notification: cabinet → Worker → user's Telegram ---------------
    if (url.pathname === '/notify-test') {
      return handleNotifyTest(request, env);
    }

    // --- Staff notification: remind a group / student in Telegram ------------
    if (url.pathname === '/notify') {
      return handleNotify(request, env);
    }

    // --- Lead forwarding (default, unchanged behaviour) -----------------------
    return handleLead(request, env);
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
    utm?.campaign ? `📊 *Кампания:* ${utm.campaign}` : null,
    '',
    `[Написать в WA](https://wa.me/${(phone || '').replace(/\D/g, '')})`
  ].filter(Boolean).join('\n');

  const tgRes = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
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
  catch { return new Response('OK', { status: 200 }); }

  const msg = update.message || update.edited_message;
  const text = msg && msg.text ? msg.text.trim() : '';
  const chatId = msg && msg.chat ? msg.chat.id : null;

  if (chatId && /^\/start(@\w+)?(\s|$)/i.test(text)) {
    const code = (text.split(/\s+/)[1] || '').trim();

    if (!code) {
      await reply(env, chatId,
        '👋 Это бот студии *Shpigotskiy Art Space*.\n\n' +
        'Чтобы получать уведомления, откройте раздел *Настройки* в личном кабинете и нажмите *«Подключить Telegram»* — бот сам получит код привязки.');
      return ok();
    }

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
      // Surface the reason (status / message) so misconfig is easy to spot.
      console.error('bindCode error:', e && e.message);
      await reply(env, chatId, '⚠️ Не удалось привязать аккаунт.\n\n_Причина:_ `' + ((e && e.message) || 'неизвестно') + '`\n\nПроверьте переменные SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в Worker.');
    }
    return ok();
  }

  if (chatId) {
    await reply(env, chatId, 'Я присылаю уведомления студии *Shpigotskiy Art Space*. Привязать аккаунт можно в кабинете: Настройки → «Подключить Telegram».');
  }
  return ok();
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
