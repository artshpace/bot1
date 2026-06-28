# Cloudflare Worker — Lead Forwarder

Принимает заявки с сайта и пересылает в Telegram.

## Деплой

1. Установить wrangler:
   ```
   npm install -g wrangler
   ```

2. Войти в аккаунт Cloudflare:
   ```
   wrangler login
   ```

3. Добавить секретные переменные (делается один раз):
   ```
   cd workers
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_CHAT_ID
   ```
   - `TELEGRAM_BOT_TOKEN` — токен бота от @BotFather
   - `TELEGRAM_CHAT_ID` — ваш chat_id (можно получить от @userinfobot) или ID группы

4. Задеплоить:
   ```
   cd workers
   wrangler deploy
   ```

5. Скопировать URL воркера вида `https://sas-lead-forwarder.ВАШ_АККАУНТ.workers.dev`

6. Вставить URL в `website/js/main.js` — константа `WORKER_URL` в начале файла.

## Как получить TELEGRAM_CHAT_ID

- Напишите боту @userinfobot — он вернёт ваш ID
- Или создайте группу, добавьте туда бота, затем напишите в группу и проверьте
  `https://api.telegram.org/bot<TOKEN>/getUpdates`

## Проверка работы

После деплоя отправьте тестовый запрос:
```bash
curl -X POST https://sas-lead-forwarder.ВАШ_АККАУНТ.workers.dev/submit-lead \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","phone":"+77086366351","direction":"Гитара"}'
```

Должно прийти сообщение в Telegram и вернуться `{"ok":true}`.
