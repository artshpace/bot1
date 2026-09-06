/**
 * Kaspi Pay Webhook Handler
 * GET/POST /api/webhooks/kaspi
 *
 * Kaspi uses a polling / callback model:
 *   1. Your backend creates a payment order via Kaspi API
 *   2. Kaspi redirects/calls back with payment result
 *   3. You poll Kaspi API to confirm final status
 *
 * Environment variables required (server-side only):
 *   KASPI_MERCHANT_ID   — your merchant account ID
 *   KASPI_SECRET_KEY    — signs all API requests
 *   KASPI_API_URL       — https://kaspi.kz/online (or sandbox URL)
 *
 * Docs: https://kaspi.kz/merchantapi/
 */

'use strict';

const crypto = require('crypto');

module.exports = async function kaspiWebhook(req, res) {
  const merchantId = process.env.KASPI_MERCHANT_ID;
  const secretKey  = process.env.KASPI_SECRET_KEY;

  if (!merchantId || !secretKey) {
    console.error('Kaspi credentials not configured');
    return res.status(500).json({ error: 'Configuration error' });
  }

  // Kaspi sends status via query params or POST body depending on endpoint
  const orderId  = req.query.OrderId  || req.body.OrderId;
  const txnId    = req.query.TxnId    || req.body.TxnId;
  const status   = req.query.Result   || req.body.Result; // '0' = success

  // Verify signature (exact algorithm per Kaspi docs)
  const rawSign = req.query.Sign || req.body.Sign || '';
  const expected = crypto.createHmac('sha1', secretKey)
    .update(orderId + txnId + (status || '') + merchantId)
    .digest('hex').toUpperCase();

  if (rawSign.toUpperCase() !== expected) {
    console.warn('Kaspi signature mismatch', { rawSign, expected });
    return res.status(403).json({ result: 1, comment: 'Bad signature' });
  }

  if (status === '0') {
    // Payment confirmed
    // await db.orders.markPaid({ orderId, txnId, gateway: 'kaspi' });
    // await fulfilOrder(orderId);
    console.log('Kaspi payment confirmed:', { orderId, txnId });
  } else {
    console.warn('Kaspi payment failed/cancelled:', { orderId, txnId, status });
  }

  // Kaspi expects XML or JSON response with result code
  res.json({ result: 0 });
};
