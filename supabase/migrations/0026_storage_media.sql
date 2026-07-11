-- =====================================================================
-- Медиа-хранилище студии — Supabase Storage bucket 'media'.
-- ---------------------------------------------------------------------
-- Для единого «Медиацентра» в кабинете директора/админа
-- (account/admin-media.html): загрузка фото, PDF, видео, аудио в любой
-- раздел (Портфолио / Отзывы / Достижения / Ценности / Галерея).
--
-- Модель доступа (как у остальных таблиц из 0001):
--   • ЧТЕНИЕ файлов — публичное (bucket public = true), чтобы картинки и
--     видео открывались на сайте у анонимных посетителей;
--   • ЗАГРУЗКА / замена / удаление — только админ/директор (is_admin()).
--
-- ВАЖНО: загрузка файла требует РЕАЛЬНОЙ сессии Supabase у админа
-- (вход через email/пароль на login.html, у профиля role = admin|director).
-- Демо-вход (localStorage-мок) реальной сессии не создаёт — тогда медиацентр
-- покажет предупреждение и оставит доступной вставку ссылок (YouTube/Vimeo).
--
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0001 (использует is_admin()).
-- =====================================================================

-- 1) bucket (публичное чтение)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

-- 2) политики на storage.objects (RLS там включён по умолчанию)

-- публичное чтение файлов bucket 'media'
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read"
  on storage.objects for select
  using (bucket_id = 'media');

-- загрузка — только админ
drop policy if exists "media_admin_insert" on storage.objects;
create policy "media_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'media' and public.is_admin());

-- замена — только админ
drop policy if exists "media_admin_update" on storage.objects;
create policy "media_admin_update"
  on storage.objects for update
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

-- удаление — только админ
drop policy if exists "media_admin_delete" on storage.objects;
create policy "media_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'media' and public.is_admin());
