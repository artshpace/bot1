-- =====================================================================
-- Phase 3 P0 — Задача 10 (доработка): Ростер учеников
-- ---------------------------------------------------------------------
-- Реальность детской студии: у большинства учеников (детей) НЕТ аккаунта
-- на сайте — аккаунты есть у родителей. Поэтому состав групп и посещаемость
-- нельзя привязывать жёстко к auth-пользователям (profiles).
--
-- Вводим РОСТЕР: public.students — ученик как запись с именем (аккаунт
-- опционален). group_members и attendance теперь ссылаются на students.
-- Если у ученика есть аккаунт — поле students.user_id связывает его с
-- profiles, и тогда он видит свой журнал.
--
-- В 0010 эти таблицы ещё пустые (нельзя было добавить учеников), поэтому их
-- безопасно пересоздать.
--
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0010.
-- =====================================================================

-- ── Roster ───────────────────────────────────────────────────────────
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  birth_date  date,
  user_id     uuid references public.profiles (id) on delete set null, -- linked account, if any
  created_at  timestamptz not null default now()
);
alter table public.students enable row level security;

-- ── Repoint group_members + attendance to students (they were empty) ──
drop table if exists public.attendance cascade;
drop table if exists public.group_members cascade;

create table public.group_members (
  group_id   uuid not null references public.study_groups (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table public.attendance (
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status     text not null default 'present' check (status in ('present', 'absent', 'excused', 'sick')),
  note       text,
  marked_by  uuid references public.profiles (id) on delete set null,
  marked_at  timestamptz not null default now(),
  primary key (lesson_id, student_id)
);

alter table public.group_members enable row level security;
alter table public.attendance    enable row level security;

-- ── Helpers ──────────────────────────────────────────────────────────
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role in ('admin', 'director', 'teacher'));
$$;

-- Re-define group membership against the roster (student linked to account).
create or replace function public.is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members m
    join public.students s on s.id = m.student_id
    where m.group_id = p_group and s.user_id = auth.uid()
  );
$$;

-- ── RLS: students ────────────────────────────────────────────────────
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students for select
  using ( public.is_staff() or user_id = auth.uid() );

drop policy if exists "students_write" on public.students;
create policy "students_write" on public.students for all
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- ── RLS: group_members ───────────────────────────────────────────────
create policy "members_select" on public.group_members for select
  using (
    public.is_admin() or public.is_group_teacher(group_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
  );
create policy "members_write" on public.group_members for all
  using ( public.is_admin() or public.is_group_teacher(group_id) )
  with check ( public.is_admin() or public.is_group_teacher(group_id) );

-- ── RLS: attendance ──────────────────────────────────────────────────
create policy "attendance_select" on public.attendance for select
  using (
    public.is_admin()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.is_group_teacher(l.group_id))
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
  );
create policy "attendance_write" on public.attendance for all
  using (
    public.is_admin()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.is_group_teacher(l.group_id))
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.is_group_teacher(l.group_id))
  );

-- ── Indexes ──────────────────────────────────────────────────────────
create index if not exists idx_students_user      on public.students (user_id);
create index if not exists idx_members_student2    on public.group_members (student_id);
create index if not exists idx_attendance_student2 on public.attendance (student_id);
