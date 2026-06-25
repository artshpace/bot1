// workers/lead-forwarder.js
// Deploy: wrangler deploy (or manually via dash.cloudflare.com → Workers)
// Env vars to add in Cloudflare Dashboard → Workers → Settings → Variables:
//   TELEGRAM_BOT_TOKEN = "your_bot_token"
//   TELEGRAM_CHAT_ID   = "your_chat_id or group_id"

export default {
  async fetch(request, env) {
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
};
