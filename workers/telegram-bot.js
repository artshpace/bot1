// workers/telegram-bot.js
// -----------------------------------------------------------------------------
// Telegram bot webhook for ACCOUNT BINDING (Phase 2 P1 — Задача 4).
//
// Flow (deep-link binding):
//   1. The cabinet (settings.html) inserts a one-time code into
//      public.telegram_codes and opens https://t.me/<bot>?start=<code>.
//   2. Telegram delivers "/start <code>" to this webhook.
//   3. We look up the code with the SERVICE-ROLE key (bypasses RLS), and if it
//      is valid (exists, not used, not expired) we write telegram_chat_id +
//      telegram_linked_at onto that user's profile and mark the code used.
//   4. We reply in the chat: "✅ Аккаунт привязан".
//
// Deploy: wrangler deploy (or paste into a new Worker in the Cloudflare dash).
//
// Env vars (Cloudflare → Workers → Settings → Variables & Secrets):
//   TELEGRAM_BOT_TOKEN          — bot token from @BotFather            (Secret)
//   SUPABASE_URL                — https://<ref>.supabase.co            (Plain)
//   SUPABASE_SERVICE_ROLE_KEY   — Supabase service_role key            (Secret)
//   WEBHOOK_SECRET              — random string; also passed to setWebhook
//                                 as ?secret_token=...  (Secret, optional but
//                                 STRONGLY recommended)
//
// Register the webhook ONCE after deploy (replace <TOKEN>, <WORKER_URL>, <SECRET>):
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>&secret_token=<SECRET>
// -----------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    // Telegram only ever POSTs updates here.
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    // Verify the shared secret (if configured) so only Telegram can call us.
    if (env.WEBHOOK_SECRET) {
      const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (got !== env.WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    let update;
    try { update = await request.json(); }
    catch { return new Response('OK', { status: 200 }); }

    const msg = update.message || update.edited_message;
    const text = msg && msg.text ? msg.text.trim() : '';
    const chatId = msg && msg.chat ? msg.chat.id : null;

    // We only care about the /start command (private chat binding).
    if (chatId && /^\/start(@\w+)?(\s|$)/i.test(text)) {
      const parts = text.split(/\s+/);
      const code = (parts[1] || '').trim();

      if (!code) {
        await reply(env, chatId,
          '👋 Это бот студии *Shpigotskiy Art Space*.\n\n' +
          'Чтобы получать уведомления, откройте раздел *Настройки* в личном кабинете на сайте и нажмите *«Подключить Telegram»* — бот сам передаст код привязки.');
        return ok();
      }

      try {
        const bound = await bindCode(env, code, chatId);
        if (bound === 'ok') {
          await reply(env, chatId, '✅ *Аккаунт привязан.*\nТеперь вы будете получать уведомления о занятиях и заявках здесь.');
        } else if (bound === 'expired') {
          await reply(env, chatId, '⌛️ Код истёк. Вернитесь в личный кабинет и нажмите *«Подключить Telegram»* ещё раз — код действует 10 минут.');
        } else {
          await reply(env, chatId, '⚠️ Код недействителен. Сгенерируйте новый в личном кабинете (Настройки → «Подключить Telegram»).');
        }
      } catch (e) {
        await reply(env, chatId, '⚠️ Не удалось привязать аккаунт. Попробуйте ещё раз чуть позже.');
      }
      return ok();
    }

    // Any other message — gentle nudge.
    if (chatId) {
      await reply(env, chatId, 'Я отправляю уведомления студии *Shpigotskiy Art Space*. Привязать аккаунт можно в личном кабинете: Настройки → «Подключить Telegram».');
    }
    return ok();
  }
};

function ok() { return new Response('OK', { status: 200 }); }

// Look up + consume a binding code using the service-role key (bypasses RLS).
// Returns 'ok' | 'expired' | 'invalid'.
async function bindCode(env, code, chatId) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  };

  // Find the (unused) code regardless of expiry, so we can tell apart
  // "expired" from "never existed / already used".
  const q = base + '/telegram_codes?select=user_id,used,expires_at&code=eq.' +
            encodeURIComponent(code) + '&limit=1';
  const res = await fetch(q, { headers });
  if (!res.ok) throw new Error('lookup failed: ' + res.status);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return 'invalid';

  const row = rows[0];
  if (row.used) return 'invalid';
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return 'expired';

  // Write the chat id onto the user's profile.
  const pRes = await fetch(base + '/profiles?id=eq.' + encodeURIComponent(row.user_id), {
    method: 'PATCH',
    headers: Object.assign({ Prefer: 'return=minimal' }, headers),
    body: JSON.stringify({
      telegram_chat_id: String(chatId),
      telegram_linked_at: new Date().toISOString()
    })
  });
  if (!pRes.ok) throw new Error('profile patch failed: ' + pRes.status);

  // Burn the code so it can't be reused.
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
