-- =====================================================================
-- Phase 3 P1 — Задача 8: Фактический перерасчёт абонемента
-- ---------------------------------------------------------------------
-- Считает возврат/перенос по фактическим пропускам из журнала (0010/0011).
--   • pricing         — цена занятия по направлению (вводит директор);
--   • recalculations  — история применённых перерасчётов (аудит, деньги).
--
-- Доступ: только admin/director (is_admin()). Преподаватель к деньгам не имеет
-- доступа. Расчёт делается на клиенте из attendance; здесь — справочник цен и
-- журнал применённых перерасчётов.
--
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0011.
-- =====================================================================

-- ── Цена занятия по направлению ──────────────────────────────────────
create table if not exists public.pricing (
  direction        text primary key,           -- guitar | acting | vocals | dance | painting
  price_per_lesson numeric not null default 0,
  updated_at       timestamptz not null default now()
);
alter table public.pricing enable row level security;

drop policy if exists "pricing_select" on public.pricing;
create policy "pricing_select" on public.pricing for select using ( public.is_staff() );

drop policy if exists "pricing_write" on public.pricing;
create policy "pricing_write" on public.pricing for all
  using ( public.is_admin() ) with check ( public.is_admin() );

-- ── История применённых перерасчётов ─────────────────────────────────
create table if not exists public.recalculations (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid references public.students (id) on delete set null,
  student_name     text,                        -- снимок имени на момент перерасчёта
  period           text not null,               -- 'YYYY-MM'
  direction        text,
  planned          int not null default 0,      -- занятий по плану в месяце
  attended         int not null default 0,      -- фактически посещено
  refundable       int not null default 0,      -- пропусков к перерасчёту
  price_per_lesson numeric not null default 0,
  discount         numeric not null default 0,
  amount           numeric not null default 0,  -- итог к возврату/переносу
  applied_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
alter table public.recalculations enable row level security;

drop policy if exists "recalc_select" on public.recalculations;
create policy "recalc_select" on public.recalculations for select using ( public.is_admin() );

drop policy if exists "recalc_write" on public.recalculations;
create policy "recalc_write" on public.recalculations for all
  using ( public.is_admin() ) with check ( public.is_admin() );

create index if not exists idx_recalc_period on public.recalculations (period);
