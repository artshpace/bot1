-- =====================================================================
-- Зарплаты педагогов (Этап 1: месячная ведомость, КЗ-2026)
-- ---------------------------------------------------------------------
-- Директор вводит часы по дням + ставку (белая и серая отдельно). Налоги и
-- «к выдаче» считаются по формулам ведомости (см. payroll.js). Педагог видит
-- ТОЛЬКО свою зарплату. Деньги чувствительны → писать может только директор,
-- читать — директор и сам сотрудник.
--
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0016.
-- =====================================================================

-- Годовые константы (МРП). Вычет по ИПН = mrp*30 считается в коде.
create table if not exists public.payroll_config (
  year int primary key,
  mrp  numeric not null default 0
);
insert into public.payroll_config (year, mrp) values (2026, 4325) on conflict (year) do nothing;
alter table public.payroll_config enable row level security;

-- Ростер сотрудников для ЗП (педагоги/админ). Аккаунт опционален: при наличии
-- user_id сотрудник видит свою зарплату в кабинете.
create table if not exists public.payroll_staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   text,
  user_id    uuid references public.profiles (id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.payroll_staff enable row level security;

-- Месячный табель: белая и серая ведомости отдельно.
create table if not exists public.payroll_timesheets (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.payroll_staff (id) on delete cascade,
  period      text not null,                 -- 'YYYY-MM'
  kind        text not null check (kind in ('white', 'grey')),
  days        jsonb not null default '{}'::jsonb,  -- { "1": 3.5, "4": 4, ... }
  work_days   int not null default 0,        -- раб.дни
  worked      int not null default 0,        -- отработано
  hourly_rate numeric not null default 0,    -- часовая тарифная ставка
  updated_at  timestamptz not null default now(),
  unique (staff_id, period, kind)
);
alter table public.payroll_timesheets enable row level security;

-- helper: текущий пользователь — это сам сотрудник из ростера?
create or replace function public.is_payroll_self(p_staff uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payroll_staff s where s.id = p_staff and s.user_id = auth.uid());
$$;

-- ── RLS: config (читают все авторизованные, пишет только директор) ────
drop policy if exists "payroll_config_select" on public.payroll_config;
create policy "payroll_config_select" on public.payroll_config for select using ( auth.uid() is not null );
drop policy if exists "payroll_config_write" on public.payroll_config;
create policy "payroll_config_write" on public.payroll_config for all
  using ( public.is_director() ) with check ( public.is_director() );

-- ── RLS: staff (директор — все; сотрудник — свою запись) ─────────────
drop policy if exists "payroll_staff_select" on public.payroll_staff;
create policy "payroll_staff_select" on public.payroll_staff for select
  using ( public.is_director() or user_id = auth.uid() );
drop policy if exists "payroll_staff_write" on public.payroll_staff;
create policy "payroll_staff_write" on public.payroll_staff for all
  using ( public.is_director() ) with check ( public.is_director() );

-- ── RLS: timesheets (директор — все; сотрудник — только свои) ────────
drop policy if exists "payroll_ts_select" on public.payroll_timesheets;
create policy "payroll_ts_select" on public.payroll_timesheets for select
  using ( public.is_director() or public.is_payroll_self(staff_id) );
drop policy if exists "payroll_ts_write" on public.payroll_timesheets;
create policy "payroll_ts_write" on public.payroll_timesheets for all
  using ( public.is_director() ) with check ( public.is_director() );

create index if not exists idx_payroll_ts_staff  on public.payroll_timesheets (staff_id, period);
create index if not exists idx_payroll_staff_user on public.payroll_staff (user_id);
