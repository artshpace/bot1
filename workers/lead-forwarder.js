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
