-- =====================================================================
-- Phase 3 — Задача 4 (доработка): доступ РОДИТЕЛЯ к журналу ребёнка
-- ---------------------------------------------------------------------
-- 0010/0011 давали доступ к журналу персоналу и самому ученику (по
-- students.user_id). Родитель (опекун) видел карту развития (0013), но НЕ
-- посещаемость. Здесь добавляем опекуна в SELECT-политики журнала, чтобы
-- родитель видел группы/занятия/посещаемость своего ребёнка (но не правил).
--
-- Связь родитель→ребёнок — student_guardians (0013). Хелпер is_guardian тоже
-- из 0013.
--
-- Run в Supabase → SQL Editor → Run. ПОСЛЕ 0013.
-- =====================================================================

-- Опекун ребёнка, состоящего в группе?
create or replace function public.is_group_guardian(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members gm
    join public.student_guardians g on g.student_id = gm.student_id
    where gm.group_id = p_group and g.parent_id = auth.uid()
  );
$$;

-- study_groups: + опекун
drop policy if exists "groups_select" on public.study_groups;
create policy "groups_select" on public.study_groups for select
  using ( public.is_admin() or teacher_id = auth.uid()
          or public.is_group_member(id) or public.is_group_guardian(id) );

-- group_members: + опекун
drop policy if exists "members_select" on public.group_members;
create policy "members_select" on public.group_members for select
  using (
    public.is_admin() or public.is_group_teacher(group_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
    or public.is_guardian(student_id)
  );

-- lessons: + опекун
drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons for select
  using (
    public.is_admin() or public.is_group_teacher(group_id)
    or public.is_group_member(group_id) or public.is_group_guardian(group_id)
  );

-- attendance: + опекун (видит отметки своего ребёнка)
drop policy if exists "attendance_select" on public.attendance;
create policy "attendance_select" on public.attendance for select
  using (
    public.is_admin()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.is_group_teacher(l.group_id))
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
    or public.is_guardian(student_id)
  );
