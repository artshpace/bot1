-- =====================================================================
-- Phase 2 P1 — Smarter login by full name (ФИО)
-- ---------------------------------------------------------------------
-- The first version of email_by_name() matched the whole name string
-- exactly. That broke for the most common real-world cases:
--   * different word order  ("Антон Шпигоцкий" vs "Шпигоцкий Антон")
--   * double / stray spaces  ("Антон   Шпигоцкий")
--   * mixed case             (handled before, kept here)
--
-- This migration adds a norm_name() helper that:
--   1. lowercases,
--   2. collapses any run of whitespace to a single space,
--   3. trims the ends,
--   4. splits into words, SORTS them, and rejoins.
-- Two names match when they contain the same SET of words in any order.
--
-- email_by_name() is rewritten to compare on norm_name(). The privacy /
-- anti-enumeration rule is unchanged: an email is returned ONLY when
-- EXACTLY ONE profile matches; zero or several → NULL.
--
-- Run in Supabase → SQL Editor → Run. Safe to run repeatedly.
-- =====================================================================

-- Normalised name: lowercase, single-spaced, words sorted alphabetically.
create or replace function public.norm_name(p text)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select string_agg(w, ' ' order by w)
      from regexp_split_to_table(
             trim(regexp_replace(lower(coalesce(p, '')), '\s+', ' ', 'g')),
             ' '
           ) as w
      where w <> ''
    ),
    ''
  );
$$;

create or replace function public.email_by_name(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count int;
  v_norm  text := public.norm_name(p_name);
begin
  if v_norm = '' then
    return null;
  end if;

  select count(*) into v_count
  from public.profiles p
  where public.norm_name(p.name) = v_norm;

  if v_count <> 1 then
    return null; -- not found or ambiguous → don't leak which
  end if;

  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.norm_name(p.name) = v_norm
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.norm_name(text) from public;
revoke all on function public.email_by_name(text) from public;
grant execute on function public.norm_name(text)     to anon, authenticated;
grant execute on function public.email_by_name(text) to anon, authenticated;
