# Shpigotskiy Art Space — Project Context

## Студия
Название: Shpigotskiy Art Space  
Тип: детская студия творческого развития, Петропавловск, Казахстан  
Адрес: ул. Интернациональная, 63, 5 этаж  
Студентов: 160+, цель — 300+  
Главный канал привлечения: Instagram реклама (53% лидов)

## Реальные контакты (использовать ВЕЗДЕ — заглушки запрещены)
WhatsApp (студия, основной): +77086366351  
wa.me link: https://wa.me/77086366351  
Телефон руководителя (Антон Шпигоцкий): +77084322371  
Телефон администратора: +77013980019  
Instagram: @artshpace  
Instagram URL: https://instagram.com/artshpace  
Email: artshpace@gmail.com  
Telegram: канала НЕТ; используем бота — https://t.me/artshpacebot (@artshpacebot)  
Телефон: +7 708 636-63-51  
2ГИС: https://2gis.kz/petropavlovsk/firm/70000001085367039  
Яндекс Карты: https://yandex.kz/maps/ru/org/shpigotskiy_art_space/106360488694/  
GitHub Pages (текущий хост): https://artshpace.github.io/bot1/

## Бренд
Красный: #E30613  
Золотой: #C9A84C  
Чёрный: #1A1A1A  
Белый: #FFFFFF  
Шрифты: Playfair Display (заголовки), Inter (тело)

## Преподаватели
- Жуков Виталий — гитара/укулеле
- Захаров Георгий — гитара/укулеле/домбра  
- Шпигоцкий Антон (владелец) — актёрское/ораторское; высшее театральное училище им. М. С. Щепкина (с отличием, 2017–2021), практика в Малом театре (2018–2021), с 2022 актёр Областного русского драматического театра им. Николая Погодина. НЕ преподаёт гитару.
- Черняк Марина — актёрское мастерство  
- Розанова Оксана — актёрское мастерство  
- Ерзакова Наталья Николаевна — вокал; высшая категория, 50+ лет опыта (в документах педагога — «Ерзакова», не «Ержакова»)  
- Клюк Дарья — современный танец; 14+ лет опыта, ансамбль Arabesque, победы на фестивалях

## Направления (активные)
Гитара/укулеле/домбра, Актёрское/ораторское, Вокал, Современный танец, Живопись  
Фокус набора сейчас: гитара и актёрское

## Реальное расписание (июль 2026)
Актёрское мастерство:
- 4–6 лет: Сб, Вс 15:45–16:45 (Черняк)
- 7–10 лет: Пн, Ср 15:00–16:00 (Розанова); Вт, Чт 9:30–10:30 (Черняк); Сб, Вс 14:45–15:45 (Черняк)
- 11–14 лет: Пн, Ср 9:00–10:00 (Розанова); Пн, Ср 16:00–17:00 (Розанова); Сб, Вс 9:00–10:30 (Черняк)
- 14+: Сб, Вс 14:30–16:00 (Шпигоцкий)

Вокал (весь — Ерзакова):
- 7–10 лет: Сб, Вс 12:00–13:00
- 11+: Сб, Вс 13:00–14:00

Гитара:
- разный возраст: Пн, Ср, Пт 09:00–20:00 (открывает Георгий Захаров, далее Виталий Жуков); Вт, Чт, Сб 17:00–18:00 (Георгий Дмитриевич Захаров)
- взрослые 18+: Пн, Ср, Пт 20:00–21:00

Современный танец (Дарья Клюк): 4–6 лет Пн/Ср/Пт 18:30–19:30; 7–10 лет Сб/Вс 13:00–14:30; 11+ Сб/Вс 11:30–13:00
Живопись (Мария Андрюшенко): 4–6 лет Сб 10:00–12:00; 7–10 лет Вс 10:00–12:00

Полное актуальное расписание — `website/schedule.html` (источник истины); оно
зеркалится в `website/js/main.js` (SCHEDULE — слоты записи на пробное) и в таблице
Supabase `bot_groups` (миграция `0022_bot_groups_table.sql` — напоминания бота,
правки без деплоя воркера). Укулеле/домбра — группы формируются.

## Ключевые данные опроса (38 родителей)
- NPS: 9.7
- Решающий фактор выбора: ПРЕПОДАВАТЕЛЬ (74%)
- Боль родителей: стеснительность/неуверенность ребёнка (НЕ навыки)
- Канал: 53% Instagram реклама, 21% сарафан
- 87% детей ходят с удовольствием
- 24% родителей принимают решение дольше месяца
- Ключевой механизм конверсии: пробное занятие

## Архитектура сайта
Репозиторий: artshpace/bot1, ветка: claude/shpigotskiy-art-space-site-2uwim5  
Структура: чистый HTML/CSS/JS, без сборки  
Запуск: `python3 -m http.server 8000` из корня, сайт на http://localhost:8000/website/  
Единая точка данных: `js/api.js` (window.API.*) — mock localStorage  
Стили кабинета: `css/account.css`  
Логика кабинета: `js/account.js` (268KB — не трогать без острой нужды)  
Логика публичного сайта: `js/main.js`

## Что НЕ трогать в этой сессии
- js/api.js (200KB мок-API — целостность данных кабинета)
- js/account.js (268KB — сломает кабинет)
- css/account.css
- website/account/*.html — все файлы кабинета и LMS
- backend/ — скаффолд, не менять

## Правила при работе с кодом
1. Все контакты брать ТОЛЬКО из этого файла — никаких заглушек 77771234567 и т.д.
2. Canonical и og:url — https://artshpace.github.io/bot1/ (до покупки домена)
3. Кнопки WhatsApp: wa.me/77086366351?text=... с предзаполненным текстом
4. При каждом изменении index.html — проверять что modal-form и trial-form консистентны
5. Admin panel сохраняет данные в localStorage с префиксом sas_director_*
6. /compact если контекст > 70%

## Phase 1 — Миграции Supabase (обязательны для новых фич)

Три новых таблицы для расширения платформы (добавлены в июле 2026). Каждая использует стандартный RLS-паттерн из 0001: анон читает только активные (`active=true`), пишут только админы (`is_admin()`).

### Как применить миграции
1. Открыть Supabase → SQL Editor → новая вкладка
2. Скопировать содержимое каждой миграции ниже (или из raw GitHub ссылок)
3. Запустить по очереди: **0023 → 0024 → 0025**
4. Проверить: в таблице должны появиться `studio_values`, `reviews`, `studio_achievements`

---

### 0023_studio_values.sql — Ценности студии
**Для:** публичная страница `website/values.html` + админ-CRUD `account/admin-values.html`  
**Функция:** хранит 5-7 основных ценностей студии (творчество, дружба, развитие и т.д.) с текстом и иконкой  
**Область видимости:** анон видит `active=true`, админ видит все  
**Используется в коде:**
- `js/main.js` — `renderValues()` вызывает `SUPA.values.listActive()`
- `account/admin-values.html` + `js/account.js` — `loadAdminValues()/editValue()` вызывают `SUPA.values.*`

```sql
create table if not exists public.studio_values (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null,
  icon        text,                 -- ключ ('heart', 'star', 'book', etc.)
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.studio_values enable row level security;
drop policy if exists "studio_values_select_active" on public.studio_values;
create policy "studio_values_select_active"
  on public.studio_values for select
  using (active = true or public.is_admin());
drop policy if exists "studio_values_admin_write" on public.studio_values;
create policy "studio_values_admin_write"
  on public.studio_values for all
  using (public.is_admin())
  with check (public.is_admin());
```

---

### 0024_reviews.sql — Отзывы родителей
**Для:** `website/reviews.html` (каталог отзывов) + направления + главная  
**Функция:** заменяет старый `localStorage['sas_director_reviews']` на реальную БД  
**Поля:**
- `author_name` — имя родителя/ученика
- `direction` — направление (guitar/acting/vocals/dance/painting или null)
- `rating` — оценка 1–5
- `review_date` — дата отзыва
- `photo_url` / `video_url` — ссылки на аватар/видеотестимониал
- `body` — текст отзыва
- `status` — 'approved'/'pending'/'rejected' (по умолчанию 'approved' для админ-ввода, готово под будущую публичную форму)

**Модерация:** в `account/admin-director.html`, вкладка "⭐ Отзывы" — админ видит все, может менять статус и деактивировать  
**Видимость:** анон видит только `status='approved' AND active=true`

```sql
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  author_name  text not null,
  direction    text check (direction in ('guitar', 'acting', 'vocals', 'dance', 'painting') or direction is null),
  rating       int not null default 5 check (rating between 1 and 5),
  review_date  date not null default current_date,
  photo_url    text,
  video_url    text,
  body         text not null,
  status       text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  active       boolean not null default true,
  sort         int not null default 0,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.reviews enable row level security;
drop policy if exists "reviews_select_approved" on public.reviews;
create policy "reviews_select_approved"
  on public.reviews for select
  using ((status = 'approved' and active = true) or public.is_admin());
drop policy if exists "reviews_admin_write" on public.reviews;
create policy "reviews_admin_write"
  on public.reviews for all
  using (public.is_admin())
  with check (public.is_admin());
```

---

### 0025_studio_achievements.sql — Достижения студии
**Для:** публичная страница `website/achievements.html` (спектакли, концерты, конкурсы, ученики и преподаватели)  
**Функция:** хранит студийные достижения (отличается от личных достижений ученика в кабинете, которые в mock `api.js`)  
**Категории:** student, teacher, play, concert, exhibition, competition  
**Используется:** фильтры по категориям и направлениям, поиск, админ-CRUD в `account/admin-achievements-public.html`

```sql
create table if not exists public.studio_achievements (
  id               uuid primary key default gen_random_uuid(),
  category         text not null check (category in ('student', 'teacher', 'play', 'concert', 'exhibition', 'competition')),
  title            text not null,
  description      text,
  direction        text check (direction in ('guitar', 'acting', 'vocals', 'dance', 'painting') or direction is null),
  participant_name text,             -- имя ученика/преподавателя/коллектива
  event_date       date not null default current_date,
  photo_url        text,
  diploma_url      text,
  certificate_url  text,
  featured         boolean not null default false,
  active           boolean not null default true,
  sort             int not null default 0,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.studio_achievements enable row level security;
drop policy if exists "studio_ach_select_active" on public.studio_achievements;
create policy "studio_ach_select_active"
  on public.studio_achievements for select
  using (active = true or public.is_admin());
drop policy if exists "studio_ach_admin_write" on public.studio_achievements;
create policy "studio_ach_admin_write"
  on public.studio_achievements for all
  using (public.is_admin())
  with check (public.is_admin());
create index if not exists idx_studio_ach_category  on public.studio_achievements (category);
create index if not exists idx_studio_ach_direction on public.studio_achievements (direction);
```

---

### Зачем они нужны

**0023 — Ценности** дают возможность показать на сайте ядро философии студии (не просто красивый текст, а редактируемый администратором контент). Это повышает доверие родителей — видят настоящие принципы, а не маркетинг.

**0024 — Отзывы** переводят социальное доказательство (родители видят реальные отзывы) в управляемую админом БД вместо ручного списания в localStorage. Админ может модерировать, добавлять фото/видео отзывов, сортировать.

**0025 — Достижения** — витрина успехов: ученики получили награды на конкурсах, спектакли прошли успешно, преподаватели признаны. Это часть стратегии привлечения: потенциальный родитель видит не только программу, но и результаты (конкурсные работы, фотографии выставок, дипломы).

Все три таблицы интегрированы в админ-панель (кабинет руководителя) и публичный сайт. После применения миграций админ может сразу заполнять контент через UI, это будет видно на главной и специальных страницах.

---

## Phase 2 — Медиацентр (загрузка файлов, Supabase Storage)

**Миграция `0026_storage_media.sql`** — bucket `media` (публичное чтение) + RLS на `storage.objects` (загрузка/удаление только `is_admin()`). Применить так же: Supabase → SQL Editor → Run. ПОСЛЕ 0001.

**Что даёт:** единый «Медиацентр» в кабинете (`account/admin-media.html`, пункт сайдбара «Медиацентр») — загрузка фото/PDF/видео/аудио в папки по разделам, копирование публичной ссылки, удаление. Плюс кнопка «Файл…» прямо в редакторах Достижений и Портфолио (`uploadInput()` в `js/account.js`) — грузит файл и подставляет URL в поле.

**Код:** `SUPA.storage.*` в `js/supa.js` (`upload/list/publicUrl/remove/hasSession`).

**ВАЖНО — два условия, чтобы загрузка работала:**
1. Применить миграцию 0026 в Supabase.
2. Войти в кабинет под **реальным** аккаунтом Supabase с ролью `admin`/`director` (email+пароль на login.html). Демо-вход (localStorage-мок) реальной сессии не создаёт → медиацентр покажет предупреждение и оставит только вставку ссылок. Вставка ссылок YouTube/Vimeo/Drive работает всегда, без загрузки и без сессии.

---

## Phase 3 — Медиа-записи сайта (media_items) + управляемая Галерея

**Миграция `0027_media_items.sql`** — таблица `media_items` (универсальные единицы медиа, привязанные к разделу/подразделу) + RLS (анон читает `active`, пишет админ). Применить: Supabase → SQL Editor → Run. ПОСЛЕ 0001.

**Зачем:** решает «загрузил в медиацентр, но на сайте не появилось». Раньше медиацентр клал только файл в Storage. Теперь он создаёт **запись** `media_items` (section + subsection + title + url + kind), а публичные страницы читают эти записи и показывают их.

**Как работает:**
- Медиацентр (`admin-media.html`) → форма: выбрать раздел + подраздел → загрузить файл ИЛИ вставить ссылку (YouTube/Vimeo/URL) → «Опубликовать» → создаётся `media_items`. Ниже — список опубликованного (фильтр, редактирование, удаление).
- `js/supa.js` — `SUPA.media.listBySection/listAll/create/update/remove`.
- Публичный рендер: `website/gallery.html` читает `SUPA.media.listBySection('gallery')` и строит сетку (подразделы = категории chip: concert/exhibition/spectacle/class/masterclass). Пустая БД → остаётся статичная галерея (graceful fallback).

**Разделы `media_items`:** `gallery` (подключён к сайту), плюс заготовки `concerts`, `teachers`, `courses`, `general` — таблица общая, новые публичные страницы подключаются рендером `listBySection('<section>')` без изменения схемы.

**Условия работы те же, что в Phase 2:** применить 0027 + войти под реальным админом Supabase (загрузка/публикация). Вставка ссылок — всегда.

**Новый раздел `home` (подраздел `hero`)** — видео в шапке главной (см. Phase 4).

---

## Phase 4 — Видео на главной + редактируемые тексты (site_texts)

**Миграция `0028_site_texts.sql`** — таблица `site_texts(key, value, updated_at)` + RLS (анон читает ВСЕ записи, пишет админ). Применить: Supabase → SQL Editor → Run. ПОСЛЕ 0001.

### Видео в шапке главной (замена «Студия в цифрах»)
- Правая панель героя (`index.html`, `#hero-media`) — автозапуск видео (muted/loop). По умолчанию встроен смонтированный ролик студии (YouTube). Админ меняет/удаляет его через **Медиацентр → раздел «Главная страница» → «Видео в шапке»** (`media_items` section=`home`, subsection=`hero`).
- Рендер: `js/main.js` → `renderHeroVideo()` читает `SUPA.media.listBySection('home','hero')`; если запись есть — строит плеер (`buildMediaPlayer()` понимает YouTube/Vimeo/mp4/картинку), иначе остаётся встроенный ролик (graceful fallback). Удалил запись в медиацентре → вернулся ролик по умолчанию.
- CSS: `.hero-ed-video` (16:9) в `css/editorial.css`.

### Редактируемые тексты сайта (CMS)
- Любой текст с атрибутом `data-tx="ключ"` на публичной странице можно переопределить из кабинета без правки кода. HTML хранит текст по умолчанию (fallback), поэтому пустая/недоступная БД не ломает страницу.
- Публичный рендер: `js/main.js` → `applyTextOverrides()` читает `SUPA.texts.getAll()` и подставляет значения в `[data-tx]`.
- Админка: **«Тексты сайта»** (`account/admin-texts.html`, `js/account.js` → `loadAdminTexts` + реестр `TEXT_SLOTS`). Сохранение — `SUPA.texts.set(key,value)`, сброс к умолчанию — `SUPA.texts.remove(key)`.
- Подключено: **главная** (заголовок/подзаголовок героя + 10 заголовков разделов, ключи `home.*`); **О школе** — mission/values/reviews/achievements/teachers/parents/contacts (заголовок + lead страницы-героя); **Направления** — обзор + гитара/вокал/актёрское/танцы/живопись (`dir.*`). Всего 38 слотов, сгруппированы в редакторе. **Расширение:** повесить `data-tx="page.slot"` в HTML нужной страницы (+ подключить supabase-js/supa-config/supa перед api.js, если их там ещё нет) и добавить строку в `TEXT_SLOTS` — новые тексты сразу редактируемы.

**Условия работы:** применить 0028 + войти под реальным админом Supabase (сохранение текстов и публикация видео). Просмотр/умолчания работают всегда.
