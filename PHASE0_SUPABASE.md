# Phase 0 — Supabase: что сделано и что нажать

Цель фазы 0 — поднять **реальную** инфраструктуру для авторизации поверх
статического сайта на GitHub Pages, не ломая существующий кабинет.
Подход — **параллельный слой**: новый `supa.js` берёт на себя вход /
регистрацию / восстановление через Supabase Auth, а старый мок-кабинет
(`api.js` / `account.js`) продолжает работать как раньше (демо-аккаунты тоже).

---

## Что добавлено в репозиторий

| Файл | Назначение |
|---|---|
| `supabase/migrations/0001_init.sql` | Схема БД + RLS: `profiles`, `products`, `carts`/`cart_items`, `orders`/`order_items`, `telegram_codes`, `login_logs`. Триггер создаёт профиль при регистрации. |
| `website/js/supa-config.js` | Публичные `url` + `anonKey` (плейсхолдеры). Сюда вставляешь свои значения. |
| `website/js/supa.js` | Клиент Supabase + вход/регистрация/восстановление + **мост**: после входа пишет мок-сессию, чтобы кабинет «увидел» пользователя. |
| `website/account/reset.html` | Страница установки нового пароля (открывается по ссылке из письма). |
| `website/account/{login,register,recover}.html` | Подключены три скрипта Supabase. |
| `website/js/auth.js` | `reset.html` добавлена в список публичных страниц. |

Пока в `supa-config.js` плейсхолдеры — **сайт работает на старом моке**.
Как только вставишь реальные значения, формы автоматически переключаются на Supabase.

---

## Шаги, которые нужно сделать в дашборде Supabase

### 1. Применить схему БД
Dashboard → **SQL Editor** → New query → вставить содержимое
`supabase/migrations/0001_init.sql` → **Run**.
(Или, если настроена интеграция с GitHub + CLI: `supabase db push`.)

### 2. Вставить ключи в сайт
Dashboard → **Project Settings → API**:
- **Project URL** → в `website/js/supa-config.js` → поле `url`
- **anon public** ключ → поле `anonKey`

> `service_role` ключ сюда НЕ вставлять — он секретный, только для сервера.

### 3. Настроить Auth
Dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://artshpace.github.io/bot/`
- **Redirect URLs** добавить:
  - `https://artshpace.github.io/bot/website/account/login.html`
  - `https://artshpace.github.io/bot/website/account/reset.html`

Dashboard → **Authentication → Providers → Email**:
- Включить **Confirm email** (подтверждение по почте) — это закрывает пункт
  аудита «регистрация без подтверждения».

Dashboard → **Authentication → Email Templates** — при желании перевести
письма (подтверждение / сброс пароля) на русский.

### 4. SMTP для писем (рекомендуется)
Встроенный SMTP Supabase ограничен (несколько писем в час, только для теста).
Для продакшена: **Authentication → Emails → SMTP Settings** → подключить
Resend (3 000 писем/мес бесплатно) или Brevo (300/день).

### 5. Роли (важно)
Новый зарегистрированный пользователь получает роль `student`.
Чтобы выдать роль **admin / teacher / parent**:
- Dashboard → **Table Editor → profiles** → найти пользователя → изменить `role`.
- Обычный пользователь **не может** повысить себе роль — это запрещено
  триггером `prevent_role_change` и RLS.

Свой владельческий аккаунт (`artshpace@gmail.com`) после регистрации
сделай `admin` через Table Editor.

---

## Как это закрывает пункты аудита

| Проблема из аудита | Как закрыто |
|---|---|
| Пароли открытым текстом | Supabase Auth хеширует (bcrypt) |
| Регистрация без подтверждения email | Confirm email в настройках Auth |
| `recover()` — заглушка | Реальное письмо сброса + `reset.html` |
| Роль подделывается через localStorage | RLS + `prevent_role_change` на сервере |
| Корзина общая между пользователями | Корзина по `user_id` (RLS `carts_own`) + фикс в `api.js` |
| Доступ к чужому заказу | RLS `orders_select_own` + проверка в `orders.get` |
| Каталог без статусов | `products.status` (active/inactive/draft), anon видит только active |
| Токены в localStorage | supabase-js хранит сессию сам; JWT не светится в нашем коде |

---

## Что НЕ входит в фазу 0 (следующие шаги)

- Перенос данных кабинета (абонементы, расписание, ДЗ) из мока в Postgres —
  это фаза 3 (магазин/заказы) и далее.
- Telegram-бот webhook (фаза 4) — таблицы `telegram_codes` уже готовы.
- Платёжный шлюз (фаза 3) — нужен договор с Kaspi/CloudPayments (юрлицо).
- Перенос `cart`/`orders` в Postgres — сейчас они в моке; после фазы 0
  логин уже настоящий, данные пока локальные.

---

## Проверка после настройки

1. Вставил `url` + `anonKey`, применил SQL.
2. Открыть `/website/account/register.html`, зарегистрироваться по email.
3. Прийти письмо → подтвердить → войти на `/login.html`.
4. В **Table Editor → profiles** появилась строка с твоим email и `role=student`.
5. «Забыли пароль?» → письмо со ссылкой → `reset.html` → новый пароль работает.
