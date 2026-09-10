-- 0029_reviews_public_submit.sql — публичная отправка отзывов
--
-- Раньше в таблицу reviews (миграция 0024) писать мог только админ
-- (reviews_admin_write). Эта миграция добавляет анонимную ВСТАВКУ, но
-- строго со статусом 'pending' — то есть любой посетитель сайта может
-- ОСТАВИТЬ отзыв, но он попадёт в модерацию и не появится на сайте, пока
-- админ не одобрит его (status='approved') в кабинете руководителя.
--
-- Публичное чтение (0024) по-прежнему отдаёт только approved+active, поэтому
-- неодобренные отзывы посетителям не видны. Админ видит всё и модерирует.
--
-- Применить: Supabase → SQL Editor → Run. ПОСЛЕ 0024.

drop policy if exists "reviews_public_insert_pending" on public.reviews;
create policy "reviews_public_insert_pending"
  on public.reviews for insert
  to anon, authenticated
  with check (status = 'pending');
