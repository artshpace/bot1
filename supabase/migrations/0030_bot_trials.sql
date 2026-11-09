-- =====================================================================
-- Телеграм-бот: подтверждение записи на ПРОБНОЕ занятие.
-- ---------------------------------------------------------------------
-- Заявка с сайта → воркер создаёт запись bot_trials с одноразовым token.
-- Клиент открывает бота по ссылке t.me/artshpacebot?start=t_<token>
-- (или уже привязан, если записывался внутри Mini App) → бот просит
-- подтвердить, что придёт. Напоминания: за 24ч и за 5ч до занятия,
-- пока не подтвердит (или откажется). Пишет/читает только воркер по
-- service_role (обходит RLS). Run в Supabase → SQL Editor → Run.
-- ПОСЛЕ 0001 и 0019.
-- =====================================================================

create table if not exists public.bot_trials (
  id            uuid primary key default gen_random_uuid(),
  token         text unique not null,        -- одноразовый код для deep-link
  chat_id       text,                          -- Telegram chat id (строкой), null до привязки
  name          text,
  phone         text,
  direction     text,
  slot          text,                          -- текстовый слот («Вт, Чт 15:00–16:00»)
  lesson_at     timestamptz,                   -- разобранное время занятия (Asia/Almaty)
  status        text not null default 'pending'
                  check (status in ('pending', 'linked', 'confirmed', 'declined')),
  reason        text,                          -- причина отказа (если 'declined')
  r24_sent      boolean not null default false, -- напоминание за 24ч отправлено
  r5_sent       boolean not null default false, -- напоминание за 5ч отправлено
  created_at    timestamptz not null default now(),
  linked_at     timestamptz,
  confirmed_at  timestamptz
);
create index if not exists idx_bot_trials_status  on public.bot_trials (status);
create index if not exists idx_bot_trials_chat    on public.bot_trials (chat_id);
create index if not exists idx_bot_trials_lesson  on public.bot_trials (lesson_at);

alter table public.bot_trials enable row level security;
-- Политик нет намеренно: доступ только у воркера (service_role), который RLS обходит.
