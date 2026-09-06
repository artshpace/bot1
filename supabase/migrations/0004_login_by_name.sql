-- =====================================================================
-- Phase 2 P1 — Login by full name (ФИО)
-- ---------------------------------------------------------------------
-- Supabase Auth logs in by email (or phone), not by display name. This
-- helper resolves a full name → email so the client can then call the
-- normal signInWithPassword(email, password).
--
-- Privacy / anti-enumeration: the email is returned ONLY when EXACTLY ONE
-- profile matches the given name (case-insensitive, trimmed). If zero or
-- several profiles share the name, it returns NULL — the UI then asks the
-- user to sign in by email, without revealing whether an account exists.
--
-- SECURITY DEFINER: runs as the function owner so it can read auth.users
-- (the anon role cannot). Execute is granted to anon + authenticated so the
-- login page (anon) can call it.
--
-- Run in Supabase → SQL Editor → Run. Safe to run repeatedly.
-- =====================================================================
create or replace function public.email_by_name(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count int;
  v_name  text := lower(trim(coalesce(p_name, '')));
begin
  if v_name = '' then
    return null;
  end if;

  select count(*) into v_count
  from public.profiles p
  where lower(trim(p.name)) = v_name;

  if v_count <> 1 then
    return null; -- not found or ambiguous → don't leak which
  end if;

  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(trim(p.name)) = v_name
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.email_by_name(text) from public;
grant execute on function public.email_by_name(text) to anon, authenticated;
