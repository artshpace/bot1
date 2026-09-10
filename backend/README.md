# Backend Scaffold — Shpigotskiy Art Space

This directory contains server-side code scaffolds. The frontend (`website/`) runs
as a pure static site with a localStorage mock API. These files show exactly what
the backend needs to implement when you're ready to go live.

## Structure

```
backend/
  routes/
    payments.js      — CloudPayments refund, Freedom Pay create, Kaspi create
    telegram.js      — Internal /api/telegram/confirm-link endpoint
  webhooks/
    cloudpayments.js — CloudPayments payment notifications
    kaspi.js         — Kaspi Pay callbacks
    freedompay.js    — Freedom Pay async notifications
    telegram.js      — Telegram Bot /api/webhooks/telegram endpoint
  README.md
```

## Required Environment Variables

Copy `.env.example` (project root) to `.env` and fill in your credentials.

**Server-only (NEVER send to the browser):**
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `CLOUDPAYMENTS_API_SECRET`
- `FREEDOMPAY_MERCHANT_ID`, `FREEDOMPAY_SECRET_KEY`
- `KASPI_MERCHANT_ID`, `KASPI_SECRET_KEY`
- `META_CAPI_TOKEN`
- `APP_SECRET`

**Client-safe (can appear in frontend config):**
- `CLOUDPAYMENTS_PUBLIC_ID` — used in the browser widget
- `TELEGRAM_BOT_USERNAME` — shown in "send code to @bot" UI
- `META_PIXEL_ID` — embedded in pixel snippet

## Telegram Binding Flow

```
Browser                        Server                    Telegram
  │                               │                          │
  │  generateLinkCode()           │                          │
  │  ← { code: 'TG-AB1234' }     │                          │
  │                               │                          │
  │  Show: "Send TG-AB1234 to    │                          │
  │         @shpigotskiy_art_bot" │                          │
  │                               │                          │
  │  poll checkPendingLink()      │   /bot webhook           │
  │  every 3 s  ←──────────────  │ ←─ msg.text='TG-AB1234' ─┤
  │                               │                          │
  │                               │  verify code in DB       │
  │                               │  update user.telegram    │
  │                               │  → sendMessage(chatId,   │
  │                               │    '✅ Привязан!')        │
  │  ← { linked: true,           │                          │
  │       username: '@user' }     │                          │
  │  Show "Привязан: @user" ─────►│                          │
```

## Payment Flow

```
Browser                        Server                    PSP
  │                               │                       │
  │  Select: "Банковская карта"   │                       │
  │  (CloudPayments widget opens) │                       │
  │  card entered in widget  ─────────────────────────►  │
  │                               │  ◄── webhook notify ──┤
  │                               │  verify HMAC          │
  │                               │  fulfil order in DB   │
  │  poll orders.html / events    │                       │
```

For Kaspi / Freedom Pay the browser calls `/api/payments/{provider}/create` which
proxies the request server-side (credentials never leave the server), then redirects
the user to the PSP hosted page.
