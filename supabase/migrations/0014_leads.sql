-- =====================================================================
-- Phase 3 P2 — Задача 11: Воронка продаж на фактических данных
-- ---------------------------------------------------------------------
-- Лиды с сайта сохраняются в public.leads (пишет Worker сервис-ролью —
-- прямой вставки с клиента НЕТ, чтобы не спамили базу). Персонал двигает
-- статусы; воронка считает конверсии по фактическим статусам и источникам.
--
-- Статусы: new → contacted → trial_booked → trial_attended → purchased → lost
--
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0013.
-- =====================================================================

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  phone         text,
  email         text,
  age           text,
  direction     text,
  slot          text,
  source        text,                  -- какая форма на сайте (callback/trial/…)
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  status        text not null default 'new'
                  check (status in ('new','contacted','trial_booked','trial_attended','purchased','lost')),
  comment       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.leads enable row level security;

-- Read + update for staff (admin/director/teacher). INSERT only via the
-- service-role key in the Worker (bypasses RLS), so no client insert policy.
drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads for select using ( public.is_staff() );

drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update
  using ( public.is_staff() ) with check ( public.is_staff() );

drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads for delete using ( public.is_admin() );

create index if not exists idx_leads_status  on public.leads (status);
create index if not exists idx_leads_created on public.leads (created_at);
create index if not exists idx_leads_utm     on public.leads (utm_source);
