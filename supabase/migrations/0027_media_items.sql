-- =====================================================================
-- Медиа-записи сайта — media_items.
-- ---------------------------------------------------------------------
-- Универсальная таблица «единиц медиа», привязанных к разделу и
-- подразделу сайта. Одна запись = одно фото / видео / ссылка, которое
-- должно ПОЯВИТЬСЯ на публичной странице (в отличие от голого файла в
-- Storage — тот только хранит байты и даёт URL).
--
-- Заполняется из Медиацентра (account/admin-media.html): загрузка файла
-- в Storage → URL, ЛИБО вставка ссылки YouTube/Vimeo → сохраняется как
-- media_items со своим section/subsection.
--
-- Публичные страницы читают активные записи своего раздела:
--   • gallery.html   → section='gallery'   (подразделы: concert / exhibition /
--                       spectacle / class / masterclass)
--   • (далее по мере подключения) teachers / courses / concerts …
--
-- RLS-паттерн как у остальных (0001): анон видит active=true, пишет админ.
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0001 (использует is_admin()).
-- =====================================================================

create table if not exists public.media_items (
  id          uuid primary key default gen_random_uuid(),
  section     text not null,                 -- 'gallery', 'teachers', 'courses', 'concerts', …
  subsection  text,                           -- категория внутри раздела (напр. 'concert')
  title       text,
  description text,
  kind        text not null default 'image'
                check (kind in ('image', 'video', 'embed', 'file')),
  url         text not null,                  -- публичный URL (Storage или YouTube/Vimeo)
  thumb_url   text,                           -- превью (опц.; для видео/ссылок)
  sort        int not null default 0,
  active      boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.media_items enable row level security;

drop policy if exists "media_items_select_active" on public.media_items;
create policy "media_items_select_active"
  on public.media_items for select
  using (active = true or public.is_admin());

drop policy if exists "media_items_admin_write" on public.media_items;
create policy "media_items_admin_write"
  on public.media_items for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_media_items_section on public.media_items (section);
create index if not exists idx_media_items_sub     on public.media_items (section, subsection);
