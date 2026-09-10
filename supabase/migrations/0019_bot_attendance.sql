-- =====================================================================
-- Телеграм-бот: самозапись детей родителями + напоминания о занятиях
-- с подтверждением присутствия (Да/Нет) и причиной пропуска.
-- ---------------------------------------------------------------------
-- Все таблицы читает/пишет ТОЛЬКО воркер по service_role (он обходит RLS).
-- Поэтому RLS включаем без единой политики — публичного доступа нет.
-- Run в Supabase → SQL Editor → Run.
-- =====================================================================

-- Родитель = его чат в Telegram
create table if not exists public.bot_parents (
  chat_id     text primary key,          -- Telegram chat id (строкой)
  tg_name     text,                       -- имя/username из Telegram
  created_at  timestamptz not null default now()
);

-- Ребёнок, которого родитель добавил через бота
create table if not exists public.bot_students (
  id          uuid primary key default gen_random_uuid(),
  chat_id     text not null references public.bot_parents (chat_id) on delete cascade,
  child_name  text not null,
  direction   text not null,              -- «Гитара», «Актёрское мастерство» …
  group_id    text not null,              -- id группы из расписания в воркере
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_bot_students_active on public.bot_students (active);

-- Состояние диалога с родителем (пошаговая регистрация / ожидание причины)
create table if not exists public.bot_state (
  chat_id     text primary key,
  step        text,                        -- reg_name | reg_group | await_reason | null
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Отправленные напоминания + ответы (и дедупликация, чтобы не слать дважды)
create table if not exists public.bot_attendance (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.bot_students (id) on delete cascade,
  lesson_date   date not null,
  lesson_time   text,
  group_id      text not null,
  kind          text not null,             -- '24h' | '1h'
  response      text,                       -- 'yes' | 'no' | null
  reason        text,
  sent_at       timestamptz not null default now(),
  responded_at  timestamptz,
  unique (student_id, lesson_date, group_id, kind)
);
create index if not exists idx_bot_att_student on public.bot_attendance (student_id);

alter table public.bot_parents    enable row level security;
alter table public.bot_students   enable row level security;
alter table public.bot_state      enable row level security;
alter table public.bot_attendance enable row level security;
-- Политик нет намеренно: доступ только у воркера (service_role), который RLS обходит.
