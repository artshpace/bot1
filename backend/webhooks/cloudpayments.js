/**
 * CloudPayments Webhook Handler
 * POST /api/webhooks/cloudpayments
 *
 * CloudPayments sends two notification types:
 *   pay       — payment authorised (charge)
 *   fail      — payment failed
 *   recurrent — subscription events
 *   refund    — refund processed
 *
 * Environment variables required (server-side only):
 *   CLOUDPAYMENTS_PUBLIC_ID   — safe to use in browser widget
 *   CLOUDPAYMENTS_API_SECRET  — NEVER send to client; used here only
 *
 * Docs: https://developers.cloudpayments.ru/#uvedomleniya
 */

'use strict';

const crypto = require('crypto');

module.exports = async function cloudpaymentsWebhook(req, res) {
  // 1. Verify HMAC signature (required by CloudPayments)
  const apiSecret = process.env.CLOUDPAYMENTS_API_SECRET;
  if (!apiSecret) {
    console.error('CLOUDPAYMENTS_API_SECRET not configured');
    return res.status(500).send('Configuration error');
  }

  const body = req.rawBody || JSON.stringify(req.body); // rawBody needs express-raw-body middleware
  const hmac = crypto.createHmac('sha256', apiSecret)
    .update(body)
    .digest('base64');

  if (hmac !== req.headers['content-hmac']) {
    return res.status(403).send('Invalid HMAC');
  }

  const data = req.body;
  const orderId   = data.InvoiceId;    // maps to our order.id
  const status    = data.Status;       // 'Completed', 'Declined', etc.
  const txnId     = data.TransactionId;
  const amount    = data.Amount;

  // 2. Update order in your database
  // await db.orders.markPaid({ orderId, txnId, amount, gateway: 'cloudpayments' });

  console.log('CloudPayments webhook:', { orderId, status, txnId, amount });

  // 3. Fulfil if paid
  if (status === 'Completed') {
    // await fulfilOrder(orderId);
    // await notifyUser(orderId, 'Оплата прошла успешно! Доступ открыт.');
  }

  // CloudPayments expects {"code": 0} for success
  res.json({ code: 0 });
};
