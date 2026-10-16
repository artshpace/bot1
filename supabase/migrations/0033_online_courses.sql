-- 0033_online_courses.sql — онлайн-курсы для мобильного приложения Art Space
--
-- Курсы, уроки, коды доступа, записи на курс и награды курса. Администратор
-- ведёт всё это в приложении (раздел «Редактор курсов»), ученики видят каталог,
-- открывают курс кодом, полученным после оплаты, и проходят уроки.
-- Плюс хранилище фотографий учеников (bucket avatars).
--
-- Применить: Supabase → SQL Editor → вставить → Run. ПОСЛЕ 0011 (is_staff) и 0026.

-- ── Курсы ─────────────────────────────────────────────────────────────
create table if not exists public.online_courses (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  direction   text check (direction in ('guitar', 'acting', 'vocals', 'dance', 'painting')),
  summary     text,                 -- одна строка для карточки каталога
  description text,                 -- подробное описание
  outcomes    text[] not null default '{}',   -- «чему научитесь»
  cover_url   text,
  price       int,                  -- ₸, null — бесплатно / по запросу
  pay_url     text,                 -- ссылка на оплату (Kaspi и т.п.)
  -- награды курса: [{id,title,desc,icon,rule:{type,n?}}]; type: lessons|complete|quiz_perfect|boss|homework|cards
  awards      jsonb not null default '[]'::jsonb,
  published   boolean not null default false,
  sort        int not null default 0,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Уроки ─────────────────────────────────────────────────────────────
-- content: { yt, desc, theory, practice, skills:{навык:опыт}, quiz:[{q,options,correct}],
--            cards:[{front,back}], boss:bool }
create table if not exists public.online_lessons (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.online_courses (id) on delete cascade,
  sort        int not null default 0,
  title       text not null,
  content     jsonb not null default '{}'::jsonb,
  free        boolean not null default false,   -- открыт без кода (пробный урок)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_online_lessons_course on public.online_lessons (course_id, sort);

-- ── Коды доступа (выдаются после оплаты) ─────────────────────────────
create table if not exists public.course_codes (
  code        text primary key,               -- в верхнем регистре
  course_id   uuid not null references public.online_courses (id) on delete cascade,
  max_uses    int not null default 1,
  used        int not null default 0,
  note        text,                            -- кому выдан
  created_at  timestamptz not null default now()
);

-- ── Записи на курс ───────────────────────────────────────────────────
create table if not exists public.course_enrollments (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  course_id   uuid not null references public.online_courses (id) on delete cascade,
  code        text,
  created_at  timestamptz not null default now(),
  primary key (user_id, course_id)
);

alter table public.online_courses     enable row level security;
alter table public.online_lessons     enable row level security;
alter table public.course_codes       enable row level security;
alter table public.course_enrollments enable row level security;

create or replace function public.is_enrolled(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.course_enrollments e where e.course_id = p_course and e.user_id = auth.uid());
$$;

-- каталог: опубликованные курсы видят все (и без входа)
drop policy if exists "oc_select" on public.online_courses;
create policy "oc_select" on public.online_courses for select
  using ( published or public.is_admin() );
drop policy if exists "oc_write" on public.online_courses;
create policy "oc_write" on public.online_courses for all
  using ( public.is_admin() ) with check ( public.is_admin() );

-- уроки: записанным на курс, бесплатные пробные — всем, админам — все
drop policy if exists "ol_select" on public.online_lessons;
create policy "ol_select" on public.online_lessons for select
  using (
    public.is_admin() or public.is_enrolled(course_id)
    or (free and exists (select 1 from public.online_courses c where c.id = course_id and c.published))
  );
drop policy if exists "ol_write" on public.online_lessons;
create policy "ol_write" on public.online_lessons for all
  using ( public.is_admin() ) with check ( public.is_admin() );

-- коды: только админы (ученик активирует код через функцию redeem_course_code)
drop policy if exists "cc_admin" on public.course_codes;
create policy "cc_admin" on public.course_codes for all
  using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "ce_select" on public.course_enrollments;
create policy "ce_select" on public.course_enrollments for select
  using ( user_id = auth.uid() or public.is_staff() );
drop policy if exists "ce_admin_write" on public.course_enrollments;
create policy "ce_admin_write" on public.course_enrollments for all
  using ( public.is_admin() ) with check ( public.is_admin() );

-- Активировать код: записывает текущего пользователя на курс. Возвращает id курса.
create or replace function public.redeem_course_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_course uuid;
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  select course_id into v_course from public.course_codes
    where code = upper(trim(p_code)) and used < max_uses
    for update;
  if v_course is null then
    -- повторный ввод своего же кода — не ошибка
    select e.course_id into v_course from public.course_enrollments e
      join public.course_codes c on c.course_id = e.course_id and c.code = upper(trim(p_code))
      where e.user_id = auth.uid();
    if v_course is null then raise exception 'Неверный или уже использованный код'; end if;
    return v_course;
  end if;
  insert into public.course_enrollments (user_id, course_id, code)
    values (auth.uid(), v_course, upper(trim(p_code)))
    on conflict (user_id, course_id) do nothing;
  if found then
    update public.course_codes set used = used + 1 where code = upper(trim(p_code));
  end if;
  return v_course;
end;
$$;
revoke all on function public.redeem_course_code(text) from public;
grant execute on function public.redeem_course_code(text) to authenticated;

-- ── Фото учеников ────────────────────────────────────────────────────
-- Файл лежит в avatars/<user_id>/... ; читать могут все, писать — только владелец.
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880)
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using ( bucket_id = 'avatars' );
drop policy if exists "avatars_own_insert" on storage.objects;
create policy "avatars_own_insert" on storage.objects for insert
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update" on storage.objects for update
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete" on storage.objects for delete
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

-- ── Программа курса для каталога ─────────────────────────────────────
-- Названия уроков опубликованного курса видны всем (содержимое — только записанным).
create or replace function public.course_outline(p_course uuid)
returns table (sort int, title text, free boolean)
language sql stable security definer set search_path = public as $$
  select l.sort, l.title, l.free from public.online_lessons l
  join public.online_courses c on c.id = l.course_id
  where l.course_id = p_course and (c.published or public.is_admin())
  order by l.sort, l.created_at;
$$;
grant execute on function public.course_outline(uuid) to anon, authenticated;
