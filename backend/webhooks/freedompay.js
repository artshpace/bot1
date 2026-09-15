/**
 * Freedom Pay Webhook Handler
 * POST /api/webhooks/freedompay
 *
 * Freedom Pay (Фридом Банк) sends async payment notifications.
 * Flow:
 *   1. Frontend POSTs to /api/payments/freedompay/create (your backend)
 *   2. Backend calls Freedom Pay API (signed with secret key)
 *   3. Freedom Pay redirects user to success/fail URL
 *   4. Freedom Pay POSTs webhook to this endpoint
 *
 * Environment variables required (server-side only):
 *   FREEDOMPAY_MERCHANT_ID  — your merchant ID
 *   FREEDOMPAY_SECRET_KEY   — signs all API requests
 *   FREEDOMPAY_API_URL      — https://api.freedompay.kz/v1
 *
 * Docs: https://docs.freedompay.kz/
 */

'use strict';

const crypto = require('crypto');

module.exports = async function freedompayWebhook(req, res) {
  const secretKey = process.env.FREEDOMPAY_SECRET_KEY;

  if (!secretKey) {
    console.error('FREEDOMPAY_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Configuration error' });
  }

  const data = req.body;

  // 1. Verify signature per Freedom Pay docs
  const { sign, ...payload } = data;
  const signString = Object.keys(payload).sort()
    .map(function (k) { return payload[k]; })
    .join(';') + ';' + secretKey;
  const expected = crypto.createHash('md5').update(signString).digest('hex');

  if (sign !== expected) {
    console.warn('Freedom Pay signature mismatch');
    return res.status(403).json({ error: 'Bad signature' });
  }

  const orderId = data.order_id;
  const paymentId = data.payment_id;
  const status = data.status; // 'paid', 'failed', 'refunded'

  // 2. Update order
  if (status === 'paid') {
    // await db.orders.markPaid({ orderId, txnId: paymentId, gateway: 'freedompay' });
    // await fulfilOrder(orderId);
    console.log('Freedom Pay payment confirmed:', { orderId, paymentId });
  } else {
    console.warn('Freedom Pay non-paid status:', { orderId, paymentId, status });
  }

  res.json({ ok: true });
};
