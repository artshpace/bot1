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

## Mini App = сам сайт

Бот больше не показывает отдельные страницы-заглушки: кнопка **web_app**
открывает живой сайт `https://artshpace.github.io/bot1/website/index.html`
как Telegram Mini App. За это отвечают:

- `SITE_URL` в `lead-forwarder.js`;
- строка меню `🌐 Открыть приложение (сайт)` в `sendMenu()`;
- `setMenuButton()` — вешает постоянную кнопку-меню чата на сайт (вызывается на `/start`);
- адаптер `website/js/tg.js` (подключён на всех страницах) — внутри Telegram
  разворачивает окно, красит шапку под бренд и включает системную кнопку «Назад».
  Вне Telegram молчит.

Дополнительно можно задать **дефолтную** кнопку-меню для всех пользователей
(один раз после деплоя):
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d '{"menu_button":{"type":"web_app","text":"Приложение","web_app":{"url":"https://artshpace.github.io/bot1/website/index.html"}}}'
```

## Напоминания о занятиях (24 ч и 1 ч)

- Cron-триггер (`scheduled`) вызывает `runReminders()`; расписание групп —
  `BOT_GROUPS` (зеркало `website/schedule.html`, включая гитару Вт/Чт/Сб
  17:00 — Георгий Захаров).
- Формулировки нейтральные («ученик»), поэтому подходят и для ребёнка
  (отвечает родитель), и для взрослого из взрослой группы (отвечает сам).
- Ответ «Да/Нет» → отметка в `bot_attendance`; «Нет» → бот просит причину и
  пересылает владельцу.

## База родителей/детей и связь с кабинетом сайта

Уже сейчас **общая точка — Supabase**:
- бот пишет `bot_parents` / `bot_students` по `chat_id`;
- кабинет сайта при «Подключить Telegram» (`/start <код>`) записывает тот же
  `chat_id` в `profiles.telegram_chat_id` — то есть аккаунт кабинета и записи
  бота связываются по одному `chat_id`.

Что ещё нужно для полной двусторонней синхронизации учеников (следующий шаг,
требует деплоя, поэтому вынесено отдельно):
1. Миграция: добавить `bot_students.profile_id uuid null references auth.users`
   и/или общий ключ по телефону.
2. Бот: запрашивать контакт (`request_contact`) → сохранять телефон родителя,
   чтобы матчить с лидами/аккаунтами сайта по телефону.
3. Кабинет (`supa.js`): при добавлении ребёнка в кабинете — зеркалить в
   `bot_students` для привязанного `chat_id`, и наоборот при чтении.
