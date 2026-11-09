-- =====================================================================
-- Phase 3 P1 — Задача 9: Карта развития и оценки (с приватностью)
-- ---------------------------------------------------------------------
-- Видимость гейтится в RLS:
--   • «мягкая карта» (навыки/прогресс, БЕЗ чисел) — student_skills:
--       видят персонал, сам ученик (любой возраст) и родитель ребёнка;
--   • числовые ОЦЕНКИ — assessments:
--       видят персонал, родитель ребёнка и сам ученик ТОЛЬКО если ему ≥18.
--       Ребёнку <18 оценки НЕ показываются вовсе (педагогика: без стресса).
--
-- Возраст берётся из students.birth_date (0011). Связь родитель→ребёнок —
-- student_guardians (parent = аккаунт, child = запись ростера).
--
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0012.
-- =====================================================================

-- ── Каталог навыков по направлению ───────────────────────────────────
create table if not exists public.skills (
  id          uuid primary key default gen_random_uuid(),
  direction   text not null,
  name        text not null,
  description text,
  sort        int not null default 0,
  unique (direction, name)
);
alter table public.skills enable row level security;

-- ── Прогресс ученика по навыкам (мягкая карта) ───────────────────────
create table if not exists public.student_skills (
  student_id uuid not null references public.students (id) on delete cascade,
  skill_id   uuid not null references public.skills (id) on delete cascade,
  level      int not null default 0 check (level between 0 and 5),
  teacher_id uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (student_id, skill_id)
);
alter table public.student_skills enable row level security;

-- ── Числовые оценки (гейтятся по возрасту) ───────────────────────────
create table if not exists public.assessments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  date       date not null default current_date,
  score      numeric,
  comment    text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.assessments enable row level security;

-- ── Связь родитель (аккаунт) → ребёнок (ростер) ──────────────────────
create table if not exists public.student_guardians (
  student_id uuid not null references public.students (id) on delete cascade,
  parent_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (student_id, parent_id)
);
alter table public.student_guardians enable row level security;

-- ── Helper: ученик является взрослым (≥18)? ──────────────────────────
create or replace function public.is_self_adult_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student
      and s.user_id = auth.uid()
      and s.birth_date is not null
      and s.birth_date <= (current_date - interval '18 years')
  );
$$;

create or replace function public.is_self_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students s where s.id = p_student and s.user_id = auth.uid());
$$;

create or replace function public.is_guardian(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_guardians g where g.student_id = p_student and g.parent_id = auth.uid());
$$;

-- is the current user the teacher of any group that contains this roster student?
-- (was meant to live in 0011 but was missing — defined here so the write
--  policies below resolve.)
create or replace function public.is_student_teacher(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members gm
    join public.study_groups g on g.id = gm.group_id
    where gm.student_id = p_student and g.teacher_id = auth.uid()
  );
$$;

-- ── RLS: skills (каталог) ────────────────────────────────────────────
drop policy if exists "skills_select" on public.skills;
create policy "skills_select" on public.skills for select using ( auth.uid() is not null );
drop policy if exists "skills_write" on public.skills;
create policy "skills_write" on public.skills for all
  using ( public.is_staff() ) with check ( public.is_staff() );

-- ── RLS: student_skills (мягкая карта — виден всем «своим») ───────────
drop policy if exists "sskills_select" on public.student_skills;
create policy "sskills_select" on public.student_skills for select
  using ( public.is_staff() or public.is_self_student(student_id) or public.is_guardian(student_id) );
drop policy if exists "sskills_write" on public.student_skills;
create policy "sskills_write" on public.student_skills for all
  using ( public.is_admin() or public.is_student_teacher(student_id) )
  with check ( public.is_admin() or public.is_student_teacher(student_id) );

-- ── RLS: assessments (оценки — ребёнку <18 не видны) ─────────────────
drop policy if exists "assess_select" on public.assessments;
create policy "assess_select" on public.assessments for select
  using (
    public.is_staff()
    or public.is_guardian(student_id)
    or public.is_self_adult_student(student_id)
  );
drop policy if exists "assess_write" on public.assessments;
create policy "assess_write" on public.assessments for all
  using ( public.is_admin() or public.is_student_teacher(student_id) )
  with check ( public.is_admin() or public.is_student_teacher(student_id) );

-- ── RLS: student_guardians ───────────────────────────────────────────
drop policy if exists "guardians_select" on public.student_guardians;
create policy "guardians_select" on public.student_guardians for select
  using ( public.is_staff() or parent_id = auth.uid() or public.is_self_student(student_id) );
drop policy if exists "guardians_write" on public.student_guardians;
create policy "guardians_write" on public.student_guardians for all
  using ( public.is_admin() ) with check ( public.is_admin() );

-- ── Индексы ──────────────────────────────────────────────────────────
create index if not exists idx_sskills_student   on public.student_skills (student_id);
create index if not exists idx_assess_student     on public.assessments (student_id);
create index if not exists idx_guardians_parent   on public.student_guardians (parent_id);

-- ── Сид: базовые навыки по направлениям ──────────────────────────────
insert into public.skills (direction, name, sort) values
  ('guitar','Постановка рук',1),('guitar','Чтение табов/нот',2),('guitar','Чувство ритма',3),('guitar','Репертуар',4),
  ('acting','Сценическая речь',1),('acting','Раскрепощённость',2),('acting','Работа с текстом',3),('acting','Импровизация',4),
  ('vocals','Дыхание',1),('vocals','Интонация',2),('vocals','Диапазон',3),('vocals','Артикуляция',4),
  ('dance','Координация',1),('dance','Растяжка',2),('dance','Музыкальность',3),('dance','Хореография',4),
  ('painting','Композиция',1),('painting','Цвет',2),('painting','Техника',3),('painting','Воображение',4)
on conflict (direction, name) do nothing;
