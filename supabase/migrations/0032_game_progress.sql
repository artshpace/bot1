-- 0032_game_progress.sql — игровой прогресс мобильного приложения
--
-- Приложение Art Space хранит прогресс онлайн-обучения (опыт навыков, пройденные
-- уроки, тесты, задания дня, награды) на телефоне и, если ученик вошёл в кабинет,
-- дублирует его сюда — чтобы прогресс не терялся при смене телефона и был виден
-- педагогам/администраторам.
--
-- Применить: Supabase → SQL Editor → вставить → Run. ПОСЛЕ 0011 (нужна is_staff()).
-- Пока миграция не применена, приложение просто хранит прогресс на телефоне.

create table if not exists public.game_progress (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_progress enable row level security;

-- читает сам пользователь и персонал студии (педагоги, админы, руководитель)
drop policy if exists "game_progress_select" on public.game_progress;
create policy "game_progress_select" on public.game_progress for select
  using ( user_id = auth.uid() or public.is_staff() );

-- пишет только сам пользователь (свою строку)
drop policy if exists "game_progress_insert" on public.game_progress;
create policy "game_progress_insert" on public.game_progress for insert
  with check ( user_id = auth.uid() );

drop policy if exists "game_progress_update" on public.game_progress;
create policy "game_progress_update" on public.game_progress for update
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );
