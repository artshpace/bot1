-- =====================================================================
-- Phase 2 P0 — Director role + in-cabinet role management
-- ---------------------------------------------------------------------
-- Introduces a `director` role (superuser, the studio owner) above `admin`.
--   * is_admin()    → now TRUE for both 'admin' AND 'director', so every
--                     existing "admin sees all" RLS policy automatically
--                     includes the director — no other policy needs editing.
--   * is_director() → TRUE only for 'director'. Gates the right to GRANT the
--                     elevated roles (admin / director).
--
-- Role-change rules enforced by prevent_role_change():
--   * a non-staff user can't change any role (as before);
--   * an admin can set student / parent / teacher, but CANNOT create
--     admins or directors;
--   * a director can set any role;
--   * the dashboard / SQL editor (auth.uid() IS NULL) can do anything,
--     so the first director can be appointed below.
--
-- Run in Supabase → SQL Editor → Run. Safe to run repeatedly.
-- =====================================================================

-- 1) Allow 'director' in the role check constraint. -------------------
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'parent', 'teacher', 'admin', 'director'));

-- 2) is_admin() now covers director too (director inherits admin rights).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'director')
  );
$$;

-- 3) is_director(): only the director. Used to gate granting elevated roles.
create or replace function public.is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'director'
  );
$$;

-- 4) Role-change guard: admins manage non-elevated roles, only the director
--    may create admins / directors. Dashboard context (auth.uid() IS NULL)
--    is unrestricted so the first director can be appointed.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    if not public.is_admin() then
      -- normal user: no role changes at all
      new.role := old.role;
    elsif new.role in ('admin', 'director') and not public.is_director() then
      -- only a director may grant elevated roles
      new.role := old.role;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 5) Appoint the owner (Антон) as the first director.
--    auth.uid() is NULL in the SQL editor, so the guard above allows it.
update public.profiles
  set role = 'director'
  where id = '77577efc-d518-43e3-8d53-2771a889e4e3';
