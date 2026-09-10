-- =====================================================================
-- Зарплаты — Этап 2: отпускные
-- ---------------------------------------------------------------------
-- По таблице владельца: за период берутся помесячно дни/часы/ЗП (отдельно
-- белые и серые), считается СЧЗ = ЗП ÷ часы, отпускные = СЧЗ × дни отпуска.
-- Дни отпуска (белый и серый) директор вводит вручную. Серый налом = серый
-- отпуск − белый отпуск.
--
-- Доступ — RLS: пишет директор, читает директор + сам сотрудник.
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0017.
-- =====================================================================

create table if not exists public.payroll_vacation (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.payroll_staff (id) on delete cascade,
  label       text,                              -- напр. «Отпуск июль 2026»
  white_rows  jsonb not null default '[]'::jsonb, -- [{m:"Авг", d:1, h:2.5, s:10000}]
  grey_rows   jsonb not null default '[]'::jsonb,
  white_days  numeric not null default 0,        -- дни отпуска (белый)
  grey_days   numeric not null default 0,        -- дни отпуска (серый)
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
alter table public.payroll_vacation enable row level security;

drop policy if exists "payroll_vac_select" on public.payroll_vacation;
create policy "payroll_vac_select" on public.payroll_vacation for select
  using ( public.is_director() or public.is_payroll_self(staff_id) );
drop policy if exists "payroll_vac_write" on public.payroll_vacation;
create policy "payroll_vac_write" on public.payroll_vacation for all
  using ( public.is_director() ) with check ( public.is_director() );

create index if not exists idx_payroll_vac_staff on public.payroll_vacation (staff_id);
