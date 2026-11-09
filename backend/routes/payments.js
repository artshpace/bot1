/**
 * Payment proxy routes
 * Keeps ALL payment secrets on the server.
 *
 * POST /api/payments/cloudpayments/refund
 * POST /api/payments/freedompay/create
 * POST /api/payments/kaspi/create
 */

'use strict';

const crypto = require('crypto');

// ----------------------------------------------------------------
// CloudPayments — refund via server-side REST API
// (charge is done client-side via the CP widget using Public ID)
// ----------------------------------------------------------------
async function cloudpaymentsRefund(req, res) {
  const { transactionId, amount } = req.body;
  const publicId  = process.env.CLOUDPAYMENTS_PUBLIC_ID;
  const apiSecret = process.env.CLOUDPAYMENTS_API_SECRET;

  if (!publicId || !apiSecret) return res.status(500).json({ error: 'CloudPayments not configured' });

  const auth = Buffer.from(publicId + ':' + apiSecret).toString('base64');
  const r = await fetch('https://api.cloudpayments.ru/payments/refund', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ TransactionId: transactionId, Amount: amount })
  });
  const data = await r.json();
  if (data.Success) {
    res.json({ ok: true, refundId: data.Model && data.Model.TransactionId });
  } else {
    res.status(400).json({ error: data.Message || 'Refund failed' });
  }
}

// ----------------------------------------------------------------
// Freedom Pay — create payment order (redirect / hosted page)
// ----------------------------------------------------------------
async function freedompayCreate(req, res) {
  const { orderId, amount, currency, description } = req.body;
  const merchantId = process.env.FREEDOMPAY_MERCHANT_ID;
  const secretKey  = process.env.FREEDOMPAY_SECRET_KEY;
  const apiUrl     = process.env.FREEDOMPAY_API_URL || 'https://api.freedompay.kz/v1';

  if (!merchantId || !secretKey) return res.status(500).json({ error: 'Freedom Pay not configured' });

  const payload = {
    merchant_id: merchantId,
    order_id:    orderId,
    amount:      amount,
    currency:    currency || 'KZT',
    description: description || 'Заказ ' + orderId,
    back_url:    process.env.APP_URL + '/account/orders.html',
    success_url: process.env.APP_URL + '/account/orders.html?paid=1',
    failure_url: process.env.APP_URL + '/account/checkout.html?error=1'
  };

  // Build signature per Freedom Pay docs
  const signString = Object.keys(payload).sort()
    .map(function (k) { return payload[k]; })
    .join(';') + ';' + secretKey;
  payload.sign = crypto.createHash('md5').update(signString).digest('hex');

  const r = await fetch(apiUrl + '/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (data.redirect_url) {
    res.json({ redirectUrl: data.redirect_url, paymentId: data.payment_id });
  } else {
    res.status(400).json({ error: data.message || 'Freedom Pay error' });
  }
}

// ----------------------------------------------------------------
// Kaspi Pay — create payment order
// ----------------------------------------------------------------
async function kaspiCreate(req, res) {
  const { orderId, amount, description } = req.body;
  const merchantId = process.env.KASPI_MERCHANT_ID;
  const secretKey  = process.env.KASPI_SECRET_KEY;
  const apiUrl     = process.env.KASPI_API_URL || 'https://kaspi.kz/online';

  if (!merchantId || !secretKey) return res.status(500).json({ error: 'Kaspi not configured' });

  // Kaspi uses HMAC-SHA1 signatures
  const txnId = orderId;
  const sign = crypto.createHmac('sha1', secretKey)
    .update(merchantId + txnId + amount)
    .digest('hex').toUpperCase();

  const r = await fetch(apiUrl + '/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      MerchantId: merchantId,
      OrderId:    orderId,
      TxnId:      txnId,
      Amount:     amount,
      Comment:    description || 'Заказ ' + orderId,
      Sign:       sign,
      BackUrl:    process.env.APP_URL + '/account/orders.html'
    })
  });
  const data = await r.json();
  if (data.ResultCode === 0 || data.redirectUrl) {
    res.json({ redirectUrl: data.RedirectUrl || data.redirectUrl, paymentId: txnId });
  } else {
    res.status(400).json({ error: data.ResultMessage || 'Kaspi error' });
  }
}

module.exports = { cloudpaymentsRefund, freedompayCreate, kaspiCreate };
