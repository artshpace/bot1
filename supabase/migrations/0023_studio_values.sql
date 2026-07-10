-- =====================================================================
-- Ценности студии — публичная страница values.html + admin CRUD.
-- ---------------------------------------------------------------------
-- Тот же RLS-паттерн, что у public.products (0001_init.sql):
--   • anon читает только active = true;
--   • пишут только admin/director (is_admin()).
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0001 (использует is_admin()).
-- =====================================================================

create table if not exists public.studio_values (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null,
  icon        text,                 -- ключ в маленький набор SVG-иконок на клиенте
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.studio_values enable row level security;

create policy "studio_values_select_active"
  on public.studio_values for select
  using (active = true or public.is_admin());

create policy "studio_values_admin_write"
  on public.studio_values for all
  using (public.is_admin())
  with check (public.is_admin());
