-- =====================================================================
-- Телеграм-бот: PIN-админка (управление учениками и слотами расписания).
-- Все таблицы читает/пишет ТОЛЬКО воркер по service_role (он обходит RLS).
-- Run в Supabase → SQL Editor → Run.
-- =====================================================================

-- Кто прошёл PIN-авторизацию в /admin (permanent grant, снимается /admin → Выйти).
create table if not exists public.bot_admins (
  chat_id     text primary key,
  granted_at  timestamptz not null default now()
);

-- Занят ли слот расписания — переключается из админ-панели (✅/❌), без правки текста.
create table if not exists public.bot_group_status (
  group_id    text primary key,       -- id группы из BOT_GROUPS в воркере
  full        boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.bot_admins       enable row level security;
alter table public.bot_group_status enable row level security;
-- Политик нет намеренно: доступ только у воркера (service_role), который RLS обходит.
