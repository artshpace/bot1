-- =====================================================================
-- Достижения студии — публичная страница achievements.html (ученики,
-- преподаватели, спектакли, концерты, выставки, конкурсы).
-- ---------------------------------------------------------------------
-- ВАЖНО: это НЕ то же самое, что личные достижения ученика в кабинете
-- (те остаются в моке js/api.js, таблица account/achievements.html).
-- Таблица намеренно называется studio_achievements, а не achievements,
-- чтобы не путать со старой мок-сущностью в api.js.
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0001 (использует is_admin()).
-- =====================================================================

create table if not exists public.studio_achievements (
  id               uuid primary key default gen_random_uuid(),
  category         text not null
                     check (category in ('student', 'teacher', 'play', 'concert', 'exhibition', 'competition')),
  title            text not null,
  description      text,
  direction        text check (direction in ('guitar', 'acting', 'vocals', 'dance', 'painting') or direction is null),
  participant_name text,             -- имя ученика/преподавателя/название коллектива
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
