-- =====================================================================
-- Phase 3 P0 — Задача 10: Электронный журнал с посещаемостью
-- ---------------------------------------------------------------------
-- Foundation data layer for the LMS: groups, their members, concrete
-- lessons (per date) and attendance marks. Everything is protected by RLS:
--   • admin/director (is_admin())  → полный доступ ко всему;
--   • преподаватель (teacher_id)   → свои группы, их занятия и посещаемость;
--   • ученик                       → только свои группы/занятия и СВОИ отметки.
--
-- Parent → child visibility is added later with the parent_child table
-- (Задача 9). For now a student sees their own attendance.
--
-- Run in Supabase → SQL Editor → Run. Idempotent where practical.
-- =====================================================================

-- ── Groups ───────────────────────────────────────────────────────────
-- ("study_groups", not "groups" — GROUPS is a reserved SQL word.)
create table if not exists public.study_groups (
  id          uuid primary key default gen_random_uuid(),
  direction   text not null,                       -- guitar | acting | vocals | dance | painting
  name        text not null,
  teacher_id  uuid references public.profiles (id) on delete set null,
  -- schedule: [{ "day": 1, "start": "17:00", "end": "18:00" }] (day: 0=Вс … 6=Сб)
  schedule    jsonb not null default '[]'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.study_groups (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.study_groups (id) on delete cascade,
  date        date not null,
  start_time  text,
  topic       text,
  status      text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  created_at  timestamptz not null default now(),
  unique (group_id, date, start_time)
);

create table if not exists public.attendance (
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'present' check (status in ('present', 'absent', 'excused', 'sick')),
  note       text,
  marked_by  uuid references public.profiles (id) on delete set null,
  marked_at  timestamptz not null default now(),
  primary key (lesson_id, student_id)
);

alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.lessons       enable row level security;
alter table public.attendance    enable row level security;

-- ── Helper: is the current user the teacher of this group? ────────────
create or replace function public.is_group_teacher(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.study_groups g
    where g.id = p_group and g.teacher_id = auth.uid()
  );
$$;

-- ── Helper: is the current user a member (student) of this group? ─────
create or replace function public.is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.student_id = auth.uid()
  );
$$;

-- ── RLS: study_groups ────────────────────────────────────────────────
drop policy if exists "groups_select" on public.study_groups;
create policy "groups_select" on public.study_groups for select
  using ( public.is_admin() or teacher_id = auth.uid() or public.is_group_member(id) );

drop policy if exists "groups_write" on public.study_groups;
create policy "groups_write" on public.study_groups for all
  using ( public.is_admin() or teacher_id = auth.uid() )
  with check ( public.is_admin() or teacher_id = auth.uid() );

-- ── RLS: group_members ───────────────────────────────────────────────
drop policy if exists "members_select" on public.group_members;
create policy "members_select" on public.group_members for select
  using ( public.is_admin() or public.is_group_teacher(group_id) or student_id = auth.uid() );

drop policy if exists "members_write" on public.group_members;
create policy "members_write" on public.group_members for all
  using ( public.is_admin() or public.is_group_teacher(group_id) )
  with check ( public.is_admin() or public.is_group_teacher(group_id) );

-- ── RLS: lessons ─────────────────────────────────────────────────────
drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons for select
  using ( public.is_admin() or public.is_group_teacher(group_id) or public.is_group_member(group_id) );

drop policy if exists "lessons_write" on public.lessons;
create policy "lessons_write" on public.lessons for all
  using ( public.is_admin() or public.is_group_teacher(group_id) )
  with check ( public.is_admin() or public.is_group_teacher(group_id) );

-- ── RLS: attendance ──────────────────────────────────────────────────
-- The teacher/admin of the lesson's group may read & write; a student may
-- read only their own marks.
drop policy if exists "attendance_select" on public.attendance;
create policy "attendance_select" on public.attendance for select
  using (
    student_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.is_group_teacher(l.group_id))
  );

drop policy if exists "attendance_write" on public.attendance;
create policy "attendance_write" on public.attendance for all
  using (
    public.is_admin()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.is_group_teacher(l.group_id))
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.is_group_teacher(l.group_id))
  );

-- ── Profiles: let a teacher read the profiles of students in their groups ─
-- (Needed so the teacher sees member names; the base policy only exposes the
--  user's own row + admins.)
drop policy if exists "profiles_teacher_reads_group_students" on public.profiles;
create policy "profiles_teacher_reads_group_students" on public.profiles for select
  using (
    exists (
      select 1 from public.group_members gm
      join public.study_groups g on g.id = gm.group_id
      where gm.student_id = profiles.id and g.teacher_id = auth.uid()
    )
  );

-- ── Indexes ──────────────────────────────────────────────────────────
create index if not exists idx_groups_teacher    on public.study_groups (teacher_id);
create index if not exists idx_members_student    on public.group_members (student_id);
create index if not exists idx_lessons_group_date on public.lessons (group_id, date);
create index if not exists idx_attendance_student on public.attendance (student_id);
