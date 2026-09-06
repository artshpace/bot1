-- =====================================================================
-- Phase 0 — patch: harden self-registration role
-- ---------------------------------------------------------------------
-- The original handle_new_user() trusted raw_user_meta_data->>'role'.
-- A crafted sign-up could request role='admin' and the trigger would
-- honor it. This patch clamps self-registration to 'student' / 'parent'
-- only. teacher / admin can be granted ONLY by an admin editing the
-- profiles table (or a server-side process), never by self-signup.
--
-- Run in Supabase: SQL Editor → paste → Run.  Safe to run repeatedly.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
begin
  requested := new.raw_user_meta_data ->> 'role';
  if requested is null or requested not in ('student', 'parent') then
    requested := 'student';
  end if;

  insert into public.profiles (id, name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    requested
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Fix prevent_role_change(): the original reverted EVERY role change made
-- without a logged-in admin session — including legitimate edits from the
-- Supabase Table Editor / SQL Editor, where auth.uid() is NULL. That made
-- it impossible to appoint the first admin.
--
-- New rule: only block the change when a REAL browser user (auth.uid() is
-- not null) who is NOT an admin tries to change a role. Dashboard / SQL /
-- service-role contexts (auth.uid() is null) and admins are allowed.
-- ---------------------------------------------------------------------
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    new.role := old.role;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
