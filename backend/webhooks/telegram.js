/**
 * Telegram Bot Webhook Handler
 * POST /api/webhooks/telegram
 *
 * Environment variables required (server-side only):
 *   TELEGRAM_BOT_TOKEN        — from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET   — random string set when registering webhook
 *   APP_SECRET                — signs internal confirmLinkCode calls
 *
 * Register webhook once:
 *   curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
 *        -d "url=https://your-domain.kz/api/webhooks/telegram" \
 *        -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
 */

'use strict';

const crypto = require('crypto');

// In production replace with your actual data store lookup:
// const db = require('../db');

module.exports = async function telegramWebhook(req, res) {
  // 1. Verify Telegram secret header
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const incoming = req.headers['x-telegram-bot-api-secret-token'] || '';
    if (incoming !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const update = req.body;
  if (!update || !update.message) return res.json({ ok: true });

  const msg = update.message;
  const chatId = String(msg.chat.id);
  const username = (msg.from && msg.from.username) ? msg.from.username : '';
  const text = (msg.text || '').trim();

  // 2. Detect TG-XXXXXX link code
  const codeMatch = text.match(/^TG-([A-Z2-9]{6})$/i);
  if (codeMatch) {
    const code = 'TG-' + codeMatch[1].toUpperCase();

    try {
      // 3. Call internal API to confirm the link
      //    This endpoint reads sas_tg_pending_link (or your DB) and
      //    calls API.telegram.confirmLinkCode() equivalent.
      //
      //    For localStorage-based demo, POST to the same origin:
      const internalRes = await fetch(process.env.APP_URL + '/api/telegram/confirm-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-secret': process.env.APP_SECRET || ''
        },
        body: JSON.stringify({ code, chatId, username })
      });
      const result = await internalRes.json();

      if (result.ok) {
        await sendMessage(chatId, '✅ Telegram успешно привязан к вашему аккаунту в Shpigotskiy Art Space!');
      } else {
        await sendMessage(chatId, '❌ ' + (result.error || 'Неверный или истёкший код. Попробуйте снова.'));
      }
    } catch (err) {
      console.error('confirmLinkCode error:', err);
      await sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.');
    }
    return res.json({ ok: true });
  }

  // 4. Default reply
  await sendMessage(chatId, 'Привет! Я бот Shpigotskiy Art Space.\nЧтобы привязать Telegram, зайдите в Настройки личного кабинета и отправьте полученный код.');
  res.json({ ok: true });
};

async function sendMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.warn('TELEGRAM_BOT_TOKEN not set'); return; }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
