# HANDOFF — Session 1 (конверсия + панель директора)

Выполнены задачи 1–7 из промпта Сессии 1. Проект уже был сильно развит
(существуют `api.js`, `auth.js`, `account.js`, CRM-лиды, UTM, Pixel-stub,
полный кабинет), поэтому работа велась **с учётом существующей архитектуры,
без дублирования сущностей и с сохранением текущего дизайна**.

## Что сделано

### 1. Контакты-заглушки (sed по всем публичным `*.html`, кроме `account/`)
- `77771234567` → `77086366351` (и форматированный `+7 777 …` → `+7 708 636-63-51`)
- `instagram.com/shpigotskiy_art` → `instagram.com/artshpace`
- canonical `shpigotskiy-art.kz` → `artshpace.github.io/bot` (email `info@…` **сохранён**)
- Telegram `t.me/shpigotskiy_art` **оставлен как есть** — в промпте замены для Telegram не было.

### 2. Маршрутизация на WhatsApp (`js/main.js`)
- `buildWhatsAppLink(direction)` + `buildWhatsAppFromForm(form)` (предзаполняет имя/телефон/возраст/направление/слот).
- Плавающие кнопки `.nav-cta` / `.mob-cta` «Записаться» открывают модалку (`openTrialModal()`).
- После success-экрана форм типа `trial` (modal-form, trial-form) открывается WhatsApp (`window.open`).
- **CRM-лид сохраняется как и раньше** (`API.leads.create`) — поведение не удалено, добавлен только WA-редирект.
- Кнопка «Написать в WhatsApp» в cta-banner и карточки цен ведут на `wa.me/77086366351?text=…`.

### 3. Скрытие «Кабинет» из навигации
- Во всех публичных страницах (вкл. `directions/*.html`) ссылки `account/login.html`
  в `.nav-links` и `.mobile-nav` получили `style="display:none"` (остались в коде).
- Функциональные ссылки (кнопка «Войти в кабинет» в portfolio, текст в miniapp) **не тронуты**.

### 4. Meta Pixel + SEO (`index.html`)
- Добавлены `og:url`, `og:image`, JSON-LD `LocalBusiness` (в конце `<body>`).
- **Pixel НЕ хардкожен** плейсхолдером `XXXX…`: в `main.js` уже есть config-driven
  `bootPixel()`. Он расширен — берёт `pixelId` из `sas_director_contacts`,
  но только если это реальный числовой ID (плейсхолдер игнорируется, dead-pixel не инициализируется).
- og:image указывает на реальный `../media/teachers/shpigotskiy.jpg` (логотип `лого_Ш-01.png` в репозитории отсутствует).

### 5. Главная под конверсию (`index.html` + `css/style.css`)
- Hero: новый заголовок «Помогаем детям раскрепоститься…», `.hero-trust` (NPS/ученики/направления).
- Блок «Преподаватели» **перемещён** сразу после «Направлений», добавлен social-proof подзаголовок.
- Новый блок `#pricing` (3 карточки) перед CTA. `#price-subscription` / `#price-single` читаются из админки.
- Форма: «Удобное время» заменено на чипы-слоты `#slot-chips` (рендерятся из `sas_director_slots`).
- Отзывы: блок получил `#reviews-grid`, рендерится из `sas_director_reviews` (fallback — статические 3 карточки).
- CSS: `.hero-trust`, `.pricing-grid/.pricing-card(--featured)/.pricing-tag/.pricing-price/.pricing-desc` (использованы переменные `--primary`, `--bg-alt` — `--red`/`--paper` в проекте нет).

### 6. Панель директора — `website/account/admin-director.html`
Standalone single-file, **не подключает** `account.js`/`auth.js`. PIN-защита (`sas_director_pin`,
первый вход — установка). Автосохранение + тост «Сохранено ✓». Sidebar + бургер на мобиле.
Разделы: Статистика (дашборд) · Заявки · Расписание пробных · Цены · Отзывы · Преподаватели · Контакты/настройки.
- **Заявки читают существующий `sas_leads`** и используют ту же таблицу статусов, что и `admin-leads.html`
  (new/processing/trial_scheduled/… с русскими подписями) — без отдельной системы статусов.
- Скрытая ссылка в футере `index.html`: `account/admin-director.html`.

### 7. Интеграция сайта с админкой (`js/main.js`, на `DOMContentLoaded`)
- `applyDirectorSlots()` → чипы слотов; `applyDirectorPricing()` → цены;
  `applyDirectorContacts()` → элементы `[data-sas-contact]` на главной + Pixel ID; `renderReviews()` → отзывы.
- Каждый ридер **деградирует к статическому контенту страницы**, если данных в localStorage нет.

## localStorage-ключи
| Ключ | Кто пишет | Кто читает |
|---|---|---|
| `sas_director_pin` | admin-director (PIN-гейт) | admin-director |
| `sas_leads` | `api.js` (формы сайта) | admin-director, admin-leads, main.js |
| `sas_director_slots` | admin-director | main.js (`#slot-chips`) |
| `sas_director_pricing` | admin-director | main.js (`#price-subscription/single`) |
| `sas_director_reviews` | admin-director | main.js (`#reviews-grid`) |
| `sas_director_teachers` | admin-director | (хранится; публичный рендер не подключён — вне scope з.7) |
| `sas_director_contacts` | admin-director | main.js (`[data-sas-contact]`, Pixel ID) |
| `sas_director_lastEdit` | admin-director | admin-director (дашборд) |
| `sas_meta_config` / `sas_utm` | существующие | main.js (Pixel/UTM) |

## Проверка
- `node --check` — `js/main.js` ✓, inline-JS `admin-director.html` ✓.
- Playwright smoke: главная (H1, hero-trust, pricing, 3 отзыва, слоты, порядок секций) ✓;
  панель директора (PIN-гейт, 7 разделов, дашборд, редактор слотов) ✓.
- Сетевые 404 в smoke — это `../media/*` (папка `media` лежит рядом с `website/`,
  путь существовал до изменений), не регрессия.

## Осталось / на будущее
- Заменить плейсхолдеры: реальный Meta Pixel ID (через админку → Контакты), фото преподавателей,
  реальный логотип для og:image/брендинга.
- При желании — публичный рендер `sas_director_teachers` на главной (в scope з.7 не входило).
- Telegram-хэндл: уточнить и при необходимости заменить `t.me/shpigotskiy_art`.
- `data-sas-contact` хуки добавлены только на главной; при необходимости — на остальных страницах.
