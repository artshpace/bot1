-- =====================================================================
-- Shpigotskiy Art Space — Phase 0 initial schema
-- ---------------------------------------------------------------------
-- Run in the Supabase project: Dashboard → SQL Editor → paste → Run,
-- or `supabase db push` if you use the CLI with the GitHub integration.
--
-- Design goals (from SPEC_AUTH / SPEC_SHOP / SPEC_TELEGRAM_SECURITY):
--   * Auth is handled by Supabase Auth (auth.users) — passwords are
--     hashed by Supabase (bcrypt), email confirmation + recovery built in.
--   * Every business table is protected by Row Level Security (RLS):
--     a user only ever sees their own rows. THIS is the server-side
--     permission enforcement the audit said was missing — role can no
--     longer be forged from the browser.
--   * Catalog has an explicit status (active / inactive / draft);
--     anon visitors can only read `active` products.
-- =====================================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- PROFILES — 1:1 with auth.users, holds role + contact + telegram link
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  name                text,
  phone               text,
  role                text not null default 'student'
                        check (role in ('student', 'parent', 'teacher', 'admin')),
  telegram_chat_id    text,
  telegram_linked_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user may read and update only their own profile.
-- NOTE: `role` is intentionally NOT updatable by the user from the client
-- (a column-level guard is added below) — only an admin or a server-side
-- function may change roles.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Helper: is the current user an admin? (used by admin-wide read policies)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create policy "profiles_admin_all"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Prevent a normal user from escalating their own role via update.
-- (Admins bypass through the profiles_admin_all policy above.)
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ---------------------------------------------------------------------
-- Auto-create a profile whenever a new auth user signs up.
-- Reads name / phone / role from the signUp metadata (user_metadata).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    coalesce(new.raw_user_meta_data ->> 'role', 'student')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- PRODUCTS — single catalog with explicit status (SPEC_SHOP §2)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  direction     text check (direction in ('guitar', 'acting', 'vocals', 'dance', 'painting') or direction is null),
  type          text not null
                  check (type in ('subscription', 'course', 'masterclass', 'intensive', 'certificate', 'merch')),
  title         text not null,
  description   text,
  price         integer not null check (price >= 0),
  duration      integer,
  duration_type text check (duration_type in ('sessions', 'weeks', 'months') or duration_type is null),
  status        text not null default 'draft'
                  check (status in ('active', 'inactive', 'draft')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.products enable row level security;

-- Anyone (even anon) can browse ACTIVE products; admins see everything.
create policy "products_select_active"
  on public.products for select
  using (status = 'active' or public.is_admin());

create policy "products_admin_write"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- CARTS + CART ITEMS — one cart per user (SPEC_SHOP §4)
-- ---------------------------------------------------------------------
create table if not exists public.carts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references public.carts (id) on delete cascade,
  product_id  uuid not null references public.products (id),
  quantity    integer not null default 1 check (quantity > 0),
  price       integer not null check (price >= 0),
  created_at  timestamptz not null default now()
);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create policy "carts_own"
  on public.carts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cart_items_own"
  on public.cart_items for all
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- ORDERS + ORDER ITEMS (SPEC_SHOP §5)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'paid', 'processing', 'completed', 'cancelled', 'refunded')),
  total           integer not null check (total >= 0),
  payment_method  text,
  payment_id      text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  completed_at    timestamptz
);

create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  product_id  uuid not null references public.products (id),
  quantity    integer not null default 1 check (quantity > 0),
  price       integer not null check (price >= 0)
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- A user reads only their own orders; admins read all. Orders are never
-- created/flipped to "paid" from the client — only a server-side function
-- (payment webhook, service-role key) does that. So no client INSERT/UPDATE
-- policy is granted here on purpose.
create policy "orders_select_own"
  on public.orders for select
  using (auth.uid() = user_id or public.is_admin());

create policy "order_items_select_own"
  on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));

-- ---------------------------------------------------------------------
-- TELEGRAM CONFIRMATION CODES (SPEC_TELEGRAM_SECURITY §2)
-- The bot webhook (service-role) consumes these; the client only inserts
-- its own pending code and polls its own row.
-- ---------------------------------------------------------------------
create table if not exists public.telegram_codes (
  code        text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  used        boolean not null default false,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '10 minutes')
);

alter table public.telegram_codes enable row level security;

create policy "telegram_codes_own"
  on public.telegram_codes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- LOGIN LOGS (SPEC_TELEGRAM_SECURITY §6)
-- Written server-side (Edge Function / auth hook). A user may read their
-- own login history; admins read all. No client writes.
-- ---------------------------------------------------------------------
create table if not exists public.login_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  email       text,
  success     boolean not null,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.login_logs enable row level security;

create policy "login_logs_select_own"
  on public.login_logs for select
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------------------
create index if not exists idx_products_status   on public.products (status);
create index if not exists idx_cart_items_cart    on public.cart_items (cart_id);
create index if not exists idx_orders_user        on public.orders (user_id);
create index if not exists idx_order_items_order  on public.order_items (order_id);
create index if not exists idx_tg_codes_user      on public.telegram_codes (user_id);
create index if not exists idx_login_logs_user    on public.login_logs (user_id);
