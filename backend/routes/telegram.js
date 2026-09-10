/**
 * Internal Telegram routes
 *
 * POST /api/telegram/confirm-link
 *   Called by the webhook handler after verifying a TG-XXXXXX code.
 *   Updates user record in DB and clears the pending link.
 *   Protected by x-app-secret header.
 *
 * In a localStorage-based demo this is mocked by API.telegram.confirmLinkCode()
 * in api.js — no real network call is made.
 */

'use strict';

async function confirmLink(req, res) {
  const appSecret = process.env.APP_SECRET;
  if (appSecret && req.headers['x-app-secret'] !== appSecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { code, chatId, username } = req.body;
  if (!code || !chatId) return res.status(400).json({ error: 'code and chatId required' });

  // In production: look up the pending link by code in your DB
  // const pending = await db.telegramPendingLinks.findByCode(code);
  // if (!pending || pending.expiresAt < Date.now()) return res.status(404).json({ error: 'Код истёк' });
  // await db.users.update(pending.userId, { telegram: { chatId, username, linkedAt: new Date() } });
  // await db.telegramPendingLinks.delete(pending.id);

  // For demo/localStorage mode the frontend API handles this directly.
  // This route exists to be called by the real bot webhook.

  console.log('Telegram link confirmed:', { code, chatId, username });
  res.json({ ok: true });
}

module.exports = { confirmLink };
