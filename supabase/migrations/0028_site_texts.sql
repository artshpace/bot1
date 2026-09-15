-- =====================================================================
-- Редактируемые тексты сайта — site_texts (key/value).
-- ---------------------------------------------------------------------
-- Простое хранилище переопределений текстов публичных страниц. Каждая
-- запись = один текстовый слот, помеченный на странице атрибутом
-- data-tx="<key>". Если для ключа есть запись — main.js подставляет её
-- вместо текста по умолчанию (текст в HTML остаётся как fallback, поэтому
-- пустая/недоступная таблица не ломает страницу).
--
-- Заполняется из админ-панели: account/admin-texts.html
--   (js/account.js → loadAdminTexts / SUPA.texts.set/remove).
-- Читается публично: js/main.js → applyTextOverrides() → SUPA.texts.getAll().
--
-- Отличие RLS от остальных таблиц: анон читает ВСЕ записи (не только
-- active=true) — переопределения должны быть видны всем посетителям.
-- Пишет только админ. Run в Supabase → SQL Editor → Run. ПОСЛЕ 0001.
-- =====================================================================

create table if not exists public.site_texts (
  key        text primary key,          -- напр. 'home.hero.title'
  value      text not null,             -- текст (может содержать простой HTML)
  updated_at timestamptz not null default now()
);

alter table public.site_texts enable row level security;

drop policy if exists "site_texts_select_all" on public.site_texts;
create policy "site_texts_select_all"
  on public.site_texts for select
  using (true);

drop policy if exists "site_texts_admin_write" on public.site_texts;
create policy "site_texts_admin_write"
  on public.site_texts for all
  using (public.is_admin())
  with check (public.is_admin());
