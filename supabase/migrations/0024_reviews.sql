-- =====================================================================
-- Отзывы — реальная таблица вместо localStorage['sas_director_reviews'].
-- ---------------------------------------------------------------------
-- Публично видны только approved + active (главная, /reviews.html,
-- страницы направлений). Полный список и модерация — admin-director.html
-- (вкладка «⭐ Отзывы»). status по умолчанию 'approved', т.к. в Phase 1
-- единственный источник вставки — сама админка (владелец добавляет отзыв
-- и он сразу live). Колонка status уже готова под будущую публичную форму
-- самостоятельной отправки отзыва родителем (тогда default сменится на
-- 'pending') — без изменения схемы.
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0001 (использует is_admin()).
-- =====================================================================

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

create policy "reviews_select_approved"
  on public.reviews for select
  using ((status = 'approved' and active = true) or public.is_admin());

create policy "reviews_admin_write"
  on public.reviews for all
  using (public.is_admin())
  with check (public.is_admin());
