-- =====================================================================
-- Телеграм-бот: запоминаем последнее выбранное направление (для
-- ярлыка "⭐ последнее" в разделах "Расписание"/"Направления").
-- Run в Supabase → SQL Editor → Run.
--
-- ВАЖНО: если ниже падает "relation public.bot_parents does not exist" —
-- значит миграция 0019_bot_attendance.sql ещё не выполнялась в этом
-- проекте Supabase. Сначала выполните её целиком (она безопасна для
-- повторного запуска — все create table идут с if not exists), потом
-- эту. На всякий случай таблица создаётся и здесь же, если её нет.
-- =====================================================================
create table if not exists public.bot_parents (
  chat_id     text primary key,
  tg_name     text,
  created_at  timestamptz not null default now()
);
alter table public.bot_parents enable row level security;

alter table public.bot_parents add column if not exists last_direction text;
