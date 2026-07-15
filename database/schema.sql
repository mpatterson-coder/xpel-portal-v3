-- =============================================================================
-- XPEL Dealership Portal — Pilot Database Schema
-- =============================================================================
-- Standalone pilot. Does NOT connect to any XPEL-owned system.
-- Run this ONCE in your Supabase project: SQL Editor -> New query -> paste -> Run.
--
-- Roles (formerly "F&I Manager" is now "dealership"):
--   dealership : places orders; sees orders for THEIR OWN location only
--   installer  : fulfills orders; sees orders across THEIR OWN group's locations
--   admin      : XPEL-side oversight; sees EVERYTHING across all groups
--
-- Tenant boundary (the hard wall): dealership_group.
--   A Penske user can never see Lithia's orders, users, or custom pricing,
--   and vice-versa. Enforced at the database level via Row-Level Security (RLS),
--   which is the only place this separation is actually trustworthy.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- 0. Enums
-- ----------------------------------------------------------------------------
create type user_role as enum ('dealership', 'installer', 'admin');

create type order_status as enum (
  'submitted',    -- dealership has placed the order
  'in_review',    -- being reviewed
  'approved',     -- approved for fulfillment
  'in_progress',  -- installer working on it
  'completed',    -- done
  'cancelled'
);


-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

-- The tenant boundary. Each group is walled off from every other group.
create table dealership_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- XPEL Authorized Dealers: the installer BUSINESSES in the network. A dealer
-- services one or more rooftops (possibly across groups); installer users
-- belong to a dealer and see exactly those rooftops' orders.
create table authorized_dealers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  state       text,
  created_at  timestamptz not null default now()
);

-- Individual store locations inside a group.
create table dealerships (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references dealership_groups(id) on delete cascade,
  name        text not null,
  city        text,
  state       text,
  -- Which XPEL Authorized Dealer services this rooftop (assigned by admin).
  authorized_dealer_id uuid references authorized_dealers(id) on delete set null,
  -- program_id added below via ALTER (programs table is created later in this file).
  created_at  timestamptz not null default now()
);

-- User profiles. One row per auth user (mirrors Supabase's auth.users).
-- admin users may have null group_id / dealership_id (they are XPEL-wide).
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  email          text,
  role           user_role not null default 'dealership',
  group_id       uuid references dealership_groups(id) on delete set null,
  dealership_id  uuid references dealerships(id) on delete set null,
  -- For installer users: the XPEL Authorized Dealer they work for.
  authorized_dealer_id uuid references authorized_dealers(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Shared paint-protection-film catalog (base list price is not secret).
create table products (
  id          uuid primary key default gen_random_uuid(),
  sku         text unique not null,
  name        text not null,
  category    text,
  tier        text,                              -- film line/tier (e.g. Ultimate Plus, Stealth)
  description text,
  unit_price  numeric(10,2) not null default 0,
  cost        numeric(10,2) not null default 0,  -- enables the F&I margin display
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- OPTIONAL per-group price overrides. This is what makes pricing private:
-- a group only ever sees its OWN overrides (enforced by RLS below). If a group
-- has no override for a product, the app falls back to products.unit_price.
-- If you want flat pricing for everyone, simply leave this table empty.
create table group_pricing (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references dealership_groups(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  unit_price  numeric(10,2) not null,
  unique (group_id, product_id)
);

-- Human-friendly order numbers like XPL-001000.
create sequence if not exists order_number_seq start 1000;

create table orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text unique not null default ('XPL-' || lpad(nextval('order_number_seq')::text, 6, '0')),
  group_id       uuid not null references dealership_groups(id),
  dealership_id  uuid not null references dealerships(id),
  created_by     uuid not null references profiles(id),
  status         order_status not null default 'submitted',
  customer_name  text,   -- combined "First Last" copy (what every screen displays)
  customer_first_name text,
  customer_last_name  text,
  customer_phone text,
  customer_email text,
  -- Date the vehicle is available for pick-up (chosen by the F&I user).
  pickup_date    date,
  -- Structured vehicle info. DPV1 decodes make/year from the VIN, then the
  -- F&I user confirms model, trim, and the coverage size tier.
  vin            text,
  vehicle_year   integer,
  vehicle_make   text,
  vehicle_model  text,
  vehicle_trim   text,
  vehicle_size   text check (vehicle_size in ('standard','midsize','fullsize')),
  dap_work_order text,   -- DAP work order number
  notes          text,
  total_amount   numeric(12,2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  uuid not null references products(id),
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(10,2) not null,  -- price snapshot at time of order
  line_total  numeric(12,2) generated always as (quantity * unit_price) stored
);

create table order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  status      order_status not null,
  changed_by  uuid references profiles(id),
  note        text,
  created_at  timestamptz not null default now()
);

-- In-app notifications (one row = one notification for one user).
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Helpful indexes for the queries the portal runs most.
create index on dealerships (group_id);
create index on profiles (group_id);
create index on profiles (dealership_id);
create index on profiles (authorized_dealer_id);
create index on dealerships (authorized_dealer_id);
create index on group_pricing (group_id);
create index on orders (group_id);
create index on orders (dealership_id);
create index on orders (created_by);
create index on order_items (order_id);
create index on order_status_history (order_id);
create index on notifications (user_id, read);


-- ----------------------------------------------------------------------------
-- 2. Helper functions
-- ----------------------------------------------------------------------------
-- These run as SECURITY DEFINER so they can read the current user's profile
-- WITHOUT triggering RLS recursion. This is the standard Supabase pattern for
-- role-based access. They answer: "who is the logged-in user?"

create or replace function public.current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.current_user_group_id()
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from profiles where id = auth.uid()
$$;

create or replace function public.current_user_dealership_id()
returns uuid language sql stable security definer set search_path = public as $$
  select dealership_id from profiles where id = auth.uid()
$$;

create or replace function public.current_user_dealer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select authorized_dealer_id from profiles where id = auth.uid()
$$;

create or replace function public.current_user_program_id()
returns uuid language sql stable security definer set search_path = public as $$
  select program_id from dealerships where id = public.current_user_dealership_id()
$$;

create or replace function public.dealership_can_see_product(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from program_products pp
    join dealerships d on d.program_id = pp.program_id
    where pp.product_id = p_id
      and d.id = public.current_user_dealership_id()
  )
  or exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where oi.product_id = p_id
      and o.dealership_id = public.current_user_dealership_id()
  )
$$;

create or replace function public.product_assigned_to_dealership(p_id uuid, d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from program_products pp
    join dealerships d on d.program_id = pp.program_id
    where pp.product_id = p_id and d.id = d_id
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;


-- ----------------------------------------------------------------------------
-- 3. Triggers
-- ----------------------------------------------------------------------------

-- 3a. When someone signs up (or you add them in the Supabase dashboard), create
-- their profile automatically. They start as 'dealership' with NO group, i.e.
-- least privilege, until an admin assigns them. This is intentional and safe.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'dealership');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3b. Prevent privilege escalation. A non-admin must NOT be able to change their
-- own role, group, or dealership. This trigger silently keeps those columns
-- pinned to their old values unless an admin is making the change.
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is NULL only in administrative contexts (the Supabase SQL editor
  -- or the secret service-role key) — never for a logged-in end user, who always
  -- carries a JWT. So we allow those contexts (this is how the FIRST admin gets
  -- created and how admins assign roles) and also allow any existing admin.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.role                 := old.role;
  new.group_id             := old.group_id;
  new.dealership_id        := old.dealership_id;
  new.authorized_dealer_id := old.authorized_dealer_id;
  return new;
end $$;

create trigger guard_profile_privileged_columns
  before update on profiles
  for each row execute function public.guard_profile_privileged_columns();

-- 3c. Keep orders.updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger orders_touch_updated_at
  before update on orders
  for each row execute function public.touch_updated_at();

-- 3d. Log every status change into order_status_history automatically.
create or replace function public.log_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into order_status_history (order_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger orders_log_status
  after insert or update on orders
  for each row execute function public.log_order_status_change();


-- ----------------------------------------------------------------------------
-- 4. Row-Level Security
-- ----------------------------------------------------------------------------
-- Turn RLS ON for every table, then grant exactly the access each role needs.
-- With RLS on and no policy, access is DENIED by default — so we are explicit.

alter table dealership_groups   enable row level security;
alter table authorized_dealers  enable row level security;
alter table programs           enable row level security;
alter table program_products   enable row level security;
alter table dealership_pricing enable row level security;
alter table dealerships         enable row level security;
alter table profiles            enable row level security;
alter table products            enable row level security;
alter table group_pricing       enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table order_status_history enable row level security;
alter table notifications       enable row level security;


-- ---- profiles --------------------------------------------------------------
-- See your own profile; admins see all; group members see each other (so the
-- UI can show "ordered by Jane Doe" within a group).
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or public.is_admin()
  or (group_id is not null and group_id = public.current_user_group_id())
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
);
-- Update your own profile (privileged columns are protected by trigger 3b);
-- admins can update anyone.
create policy profiles_update on profiles for update using (
  id = auth.uid() or public.is_admin()
);
-- Only admins create/delete profile rows directly (normal users get one via 3a).
create policy profiles_admin_insert on profiles for insert with check (public.is_admin());
create policy profiles_admin_delete on profiles for delete using (public.is_admin());


-- ---- dealership_groups ------------------------------------------------------
create policy groups_select on dealership_groups for select using (
  public.is_admin() or id = public.current_user_group_id()
);
create policy groups_admin_write on dealership_groups for all
  using (public.is_admin()) with check (public.is_admin());


-- ---- authorized_dealers ------------------------------------------------------
create policy dealers_select on authorized_dealers for select using (
  public.is_admin()
  or id = public.current_user_dealer_id()
  or id = (select authorized_dealer_id from dealerships where id = public.current_user_dealership_id())
);
create policy dealers_admin_write on authorized_dealers for all
  using (public.is_admin()) with check (public.is_admin());


-- ---- dealerships ------------------------------------------------------------
create policy dealerships_select on dealerships for select using (
  public.is_admin()
  or group_id = public.current_user_group_id()
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
);
create policy dealerships_admin_write on dealerships for all
  using (public.is_admin()) with check (public.is_admin());


-- ---- products (shared catalog) ---------------------------------------------
create policy products_select on products for select using (
  public.is_admin()
  or public.current_user_role() = 'installer'
  or (public.current_user_role() = 'dealership' and public.dealership_can_see_product(id))
);
create policy products_admin_write on products for all
  using (public.is_admin()) with check (public.is_admin());


-- ---- programs & program_products (linked package sets) ------------------------
create policy programs_select on programs for select using (
  public.is_admin() or id = public.current_user_program_id()
);
create policy programs_admin_write on programs for all
  using (public.is_admin()) with check (public.is_admin());

create policy program_products_select on program_products for select using (
  public.is_admin() or program_id = public.current_user_program_id()
);
create policy program_products_admin_write on program_products for all
  using (public.is_admin()) with check (public.is_admin());


-- ---- dealership_pricing (THE pricing wall: each store sees only its own) -------
create policy dealership_pricing_select on dealership_pricing for select using (
  public.is_admin() or dealership_id = public.current_user_dealership_id()
);
create policy dealership_pricing_admin_write on dealership_pricing for all
  using (public.is_admin()) with check (public.is_admin());


-- ---- orders ----------------------------------------------------------------
-- Visibility:
--   admin       -> all orders
--   installer   -> all orders in their group
--   dealership  -> only orders for their own location
create policy orders_select on orders for select using (
  public.is_admin()
  or (public.current_user_role() = 'installer' and exists (
        select 1 from dealerships d
        where d.id = orders.dealership_id
          and d.authorized_dealer_id is not null
          and d.authorized_dealer_id = public.current_user_dealer_id()))
  or (public.current_user_role() = 'dealership' and dealership_id = public.current_user_dealership_id())
);
-- Only a dealership user may place an order, and only for THEIR OWN location.
create policy orders_insert on orders for insert with check (
  public.current_user_role() = 'dealership'
  and group_id      = public.current_user_group_id()
  and dealership_id = public.current_user_dealership_id()
  and created_by    = auth.uid()
);
-- Installers and admins move orders through the fulfillment statuses.
-- (A dealership user can update/cancel their own order before it's worked.)
create policy orders_update on orders for update using (
  public.is_admin()
  or (public.current_user_role() = 'installer' and exists (
        select 1 from dealerships d
        where d.id = orders.dealership_id
          and d.authorized_dealer_id is not null
          and d.authorized_dealer_id = public.current_user_dealer_id()))
  or (public.current_user_role() = 'dealership' and dealership_id = public.current_user_dealership_id())
);


-- ---- order_items -----------------------------------------------------------
-- An item is visible/insertable exactly when its parent order is.
create policy order_items_select on order_items for select using (
  exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and (
        public.is_admin()
        or (public.current_user_role() = 'installer' and exists (
              select 1 from dealerships d
              where d.id = o.dealership_id
                and d.authorized_dealer_id is not null
                and d.authorized_dealer_id = public.current_user_dealer_id()))
        or (public.current_user_role() = 'dealership' and o.dealership_id = public.current_user_dealership_id())
      )
  )
);
create policy order_items_insert on order_items for insert with check (
  exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.created_by = auth.uid()
      and public.current_user_role() = 'dealership'
      and public.product_assigned_to_dealership(order_items.product_id, o.dealership_id)
  )
);


-- ---- order_status_history --------------------------------------------------
create policy status_history_select on order_status_history for select using (
  exists (
    select 1 from orders o
    where o.id = order_status_history.order_id
      and (
        public.is_admin()
        or (public.current_user_role() = 'installer' and exists (
              select 1 from dealerships d
              where d.id = o.dealership_id
                and d.authorized_dealer_id is not null
                and d.authorized_dealer_id = public.current_user_dealer_id()))
        or (public.current_user_role() = 'dealership' and o.dealership_id = public.current_user_dealership_id())
      )
  )
);
-- Rows are written by trigger 3d (which runs as definer), so no INSERT policy
-- is needed for normal operation.


-- ---- notifications ---------------------------------------------------------
create policy notifications_select on notifications for select using (user_id = auth.uid());
create policy notifications_update on notifications for update using (user_id = auth.uid());
create policy notifications_admin_insert on notifications for insert with check (
  public.is_admin() or user_id = auth.uid()
);

-- =============================================================================
-- End of schema. Next: run seed.sql to load sample groups, locations, and the
-- product catalog, then create your first admin user (see SETUP.md).
-- =============================================================================


-- =============================================================================
-- SHOP & STORE SUITE (mirrors migration-5) — titles/managers, installer-owned
-- programs with wholesale, price snapshots, completion tracking, package
-- aliases, delegated retail, and store<->installer chat. Runs last so a fresh
-- install converges to the same state as a migrated one.
-- =============================================================================

-- =============================================================================
-- Migration 5 — The Shop & Store Suite (July 2026)
-- One migration powers portal updates 14, 15, and 16.
--
-- WHAT THIS ADDS
--   1. Staff TITLES on user profiles + the "store manager" rule. Sensitive
--      actions (adding users, editing retail, applying discounts) are limited
--      to management titles — enforced by the database.
--   2. Programs become INSTALLER-OWNED: each XPEL Authorized Dealer owns a
--      program library for the rooftops it services, and each package in a
--      program now carries the installer's WHOLESALE rate.
--   3. PRICE SNAPSHOTS: every order line now freezes wholesale (unit_cost)
--      and pre-discount retail (list_price) at submission, so reports stay
--      true forever no matter how prices change later. Discounts can never
--      go below wholesale, and only managers can apply them.
--   4. orders.completed_at + automatic tracking, powering "average days from
--      submitted to completed".
--   5. Store package DISPLAY NAMES (per-rooftop aliases).
--   6. Store managers can edit their own store's retail prices (floor =
--      wholesale) and claim newly created accounts into their store.
--   7. CHAT tables: store <-> installer messages (general channel + per-order
--      threads) with per-user read tracking. XPEL admin is deliberately
--      excluded from reading conversations.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query -> paste this WHOLE file -> Run.
--   Expect "Success. No rows returned." Safe to run more than once.
--   RUN THIS BEFORE uploading the update-14 code.
-- =============================================================================


-- ============================================================
-- 1) Staff titles & the manager rule
-- ============================================================
alter table profiles add column if not exists title text;

-- The preset management titles. Sales Advisor and Service Advisor are staff
-- (can place orders) but cannot perform sensitive actions.
create or replace function public.is_store_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'dealership'
      and title in (
        'General Manager', 'General Sales Manager', 'Sales Manager',
        'Finance Manager', 'Fixed Operations Manager', 'Service Manager',
        'Used Car Sales Manager'
      )
  )
$$;

-- Managers may update colleagues in their own store, and may CLAIM brand-new
-- unassigned accounts (the store-side "Add User" flow).
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update using (
  id = auth.uid()
  or public.is_admin()
  or (public.is_store_manager() and dealership_id = public.current_user_dealership_id())
  or (public.is_store_manager() and role = 'dealership'
      and group_id is null and dealership_id is null and authorized_dealer_id is null)
);

-- Guard v3: what non-admins can actually CHANGE. Titles and names are free;
-- role/assignment stays pinned — except a manager claiming an unassigned
-- account into their own store.
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mgr_group uuid;
  mgr_store uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if public.is_store_manager()
     and old.role = 'dealership'
     and old.group_id is null and old.dealership_id is null and old.authorized_dealer_id is null
  then
    select group_id, dealership_id into mgr_group, mgr_store
    from profiles where id = auth.uid();
    if new.role = 'dealership'
       and new.group_id is not distinct from mgr_group
       and new.dealership_id is not distinct from mgr_store
       and new.authorized_dealer_id is null
    then
      return new; -- a legitimate claim into the manager's own store
    end if;
  end if;

  new.role                 := old.role;
  new.group_id             := old.group_id;
  new.dealership_id        := old.dealership_id;
  new.authorized_dealer_id := old.authorized_dealer_id;
  return new;
end $$;


-- ============================================================
-- 2) Installer-owned programs + wholesale per package
-- ============================================================
alter table programs add column if not exists authorized_dealer_id uuid references authorized_dealers(id) on delete set null;
create index if not exists programs_owner_idx on programs (authorized_dealer_id);

-- Backfill ownership: a program whose linked rooftops are all serviced by ONE
-- dealer belongs to that dealer. Anything ambiguous stays XPEL-owned (null).
update programs pr
set authorized_dealer_id = sub.owner
from (
  -- min() over a text cast picks "the one" dealer (Postgres 15 has no
  -- min(uuid); the HAVING below guarantees there is exactly one anyway).
  select d.program_id, min(d.authorized_dealer_id::text)::uuid as owner
  from dealerships d
  where d.program_id is not null and d.authorized_dealer_id is not null
  group by d.program_id
  having count(distinct d.authorized_dealer_id) = 1
) sub
where pr.id = sub.program_id
  and pr.authorized_dealer_id is null;

-- The installer's wholesale rate for a package inside a program.
-- Null = fall back to the catalog default cost (products.cost).
alter table program_products add column if not exists wholesale numeric(10,2)
  check (wholesale is null or wholesale >= 0);

create or replace function public.program_owned_by_current_dealer(p_program uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from programs
    where id = p_program
      and authorized_dealer_id is not null
      and authorized_dealer_id = public.current_user_dealer_id()
  )
$$;

drop policy if exists programs_select on programs;
create policy programs_select on programs for select using (
  public.is_admin()
  or id = public.current_user_program_id()
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
);

drop policy if exists programs_admin_write on programs;
drop policy if exists programs_write on programs;
create policy programs_write on programs for all using (
  public.is_admin()
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
) with check (
  public.is_admin()
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
);

drop policy if exists program_products_select on program_products;
create policy program_products_select on program_products for select using (
  public.is_admin()
  or program_id = public.current_user_program_id()
  or public.program_owned_by_current_dealer(program_id)
);

drop policy if exists program_products_admin_write on program_products;
drop policy if exists program_products_write on program_products;
create policy program_products_write on program_products for all using (
  public.is_admin() or public.program_owned_by_current_dealer(program_id)
) with check (
  public.is_admin() or public.program_owned_by_current_dealer(program_id)
);

-- Servicing installers may update rooftops they service...
drop policy if exists dealerships_installer_update on dealerships;
create policy dealerships_installer_update on dealerships for update using (
  authorized_dealer_id is not null
  and authorized_dealer_id = public.current_user_dealer_id()
);

-- ...but the ONLY column they can actually change is program_id, and only to
-- a program their own shop owns (or back to none).
create or replace function public.guard_dealership_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.group_id             := old.group_id;
  new.name                 := old.name;
  new.city                 := old.city;
  new.state                := old.state;
  new.authorized_dealer_id := old.authorized_dealer_id;
  if new.program_id is distinct from old.program_id then
    if new.program_id is not null and not public.program_owned_by_current_dealer(new.program_id) then
      raise exception 'You can only assign programs owned by your shop.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_dealership_columns on dealerships;
create trigger guard_dealership_columns
  before update on dealerships
  for each row execute function public.guard_dealership_columns();


-- ============================================================
-- 3) Price snapshots on every order line
-- ============================================================
alter table order_items add column if not exists unit_cost  numeric(10,2);
alter table order_items add column if not exists list_price numeric(10,2);

-- Backfill history with today's best information, once.
update order_items oi set unit_cost = p.cost
from products p
where p.id = oi.product_id and oi.unit_cost is null;

update order_items set list_price = unit_price where list_price is null;

-- The wholesale a given store pays for a given package right now:
-- its program's rate, else the catalog default.
create or replace function public.effective_wholesale(p_product uuid, p_dealership uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pp.wholesale
       from dealerships d
       join program_products pp
         on pp.program_id = d.program_id and pp.product_id = p_product
      where d.id = p_dealership),
    (select cost from products where id = p_product)
  )
$$;

-- Fill the snapshot on insert, enforce the wholesale floor, and make
-- discounting a manager-only action. Older app code that doesn't send the
-- new columns keeps working — the trigger fills them.
create or replace function public.order_items_fill_and_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d_id uuid;
begin
  select dealership_id into d_id from orders where id = new.order_id;

  if new.unit_cost is null then
    new.unit_cost := coalesce(public.effective_wholesale(new.product_id, d_id), 0);
  end if;
  if new.list_price is null then
    new.list_price := new.unit_price;
  end if;

  if new.unit_price < new.unit_cost then
    raise exception 'Price % is below wholesale % — discounts cannot go below wholesale.',
      round(new.unit_price, 2), round(new.unit_cost, 2);
  end if;

  if new.unit_price < new.list_price
     and not public.is_admin()
     and not public.is_store_manager()
  then
    raise exception 'Only store managers can apply discounts.';
  end if;

  return new;
end $$;

drop trigger if exists order_items_fill_and_guard on order_items;
create trigger order_items_fill_and_guard
  before insert on order_items
  for each row execute function public.order_items_fill_and_guard();


-- ============================================================
-- 4) Completion tracking (avg days from submitted -> completed)
-- ============================================================
alter table orders add column if not exists completed_at timestamptz;

-- Backfill from the status history we already keep.
update orders o
set completed_at = h.done_at
from (
  select order_id, max(created_at) as done_at
  from order_status_history
  where status = 'completed'
  group by order_id
) h
where h.order_id = o.id
  and o.status = 'completed'
  and o.completed_at is null;

create or replace function public.track_order_completed_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists track_order_completed_at on orders;
create trigger track_order_completed_at
  before update of status on orders
  for each row execute function public.track_order_completed_at();


-- ============================================================
-- 5) Store package display names (per-rooftop aliases)
-- ============================================================
create table if not exists dealership_package_names (
  id             uuid primary key default gen_random_uuid(),
  dealership_id  uuid not null references dealerships(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  display_name   text not null check (length(display_name) between 1 and 120),
  created_at     timestamptz not null default now(),
  unique (dealership_id, product_id)
);
create index if not exists dpn_dealership_idx on dealership_package_names (dealership_id);

alter table dealership_package_names enable row level security;

-- The store sees its own aliases; the servicing installer sees them too (so
-- the queue can show "listed at the store as ...").
drop policy if exists dpn_select on dealership_package_names;
create policy dpn_select on dealership_package_names for select using (
  public.is_admin()
  or dealership_id = public.current_user_dealership_id()
  or exists (
    select 1 from dealerships d
    where d.id = dealership_id
      and d.authorized_dealer_id = public.current_user_dealer_id()
  )
);

drop policy if exists dpn_write on dealership_package_names;
create policy dpn_write on dealership_package_names for all using (
  public.is_admin()
  or (public.is_store_manager() and dealership_id = public.current_user_dealership_id())
) with check (
  public.is_admin()
  or (public.is_store_manager() and dealership_id = public.current_user_dealership_id())
);


-- ============================================================
-- 6) Store managers control their own retail (floor = wholesale)
-- ============================================================
drop policy if exists dealership_pricing_admin_write on dealership_pricing;
drop policy if exists dealership_pricing_write on dealership_pricing;
create policy dealership_pricing_write on dealership_pricing for all using (
  public.is_admin()
  or (public.is_store_manager() and dealership_id = public.current_user_dealership_id())
) with check (
  public.is_admin()
  or (public.is_store_manager() and dealership_id = public.current_user_dealership_id())
);

create or replace function public.guard_dealership_pricing_floor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  f_min numeric;
begin
  f_min := public.effective_wholesale(new.product_id, new.dealership_id);
  if f_min is not null and new.unit_price < f_min then
    raise exception 'Retail % is below this store''s wholesale % for the package.',
      round(new.unit_price, 2), round(f_min, 2);
  end if;
  return new;
end $$;

drop trigger if exists guard_dealership_pricing_floor on dealership_pricing;
create trigger guard_dealership_pricing_floor
  before insert or update on dealership_pricing
  for each row execute function public.guard_dealership_pricing_floor();


-- ============================================================
-- 7) Chat: store <-> installer (XPEL admin excluded by design)
-- ============================================================
create table if not exists messages (
  id                    uuid primary key default gen_random_uuid(),
  dealership_id         uuid not null references dealerships(id) on delete cascade,
  authorized_dealer_id  uuid not null references authorized_dealers(id) on delete cascade,
  order_id              uuid references orders(id) on delete cascade, -- null = the general store channel
  sender_id             uuid not null references profiles(id) on delete cascade,
  sender_role           user_role not null,
  sender_name           text,
  body                  text not null check (length(body) between 1 and 4000),
  created_at            timestamptz not null default now()
);
create index if not exists messages_channel_idx on messages (dealership_id, order_id, created_at);
create index if not exists messages_dealer_idx  on messages (authorized_dealer_id, created_at);

alter table messages enable row level security;

-- NOTE: no is_admin() clause below — that is intentional. Conversations are
-- private to the store and its servicing installer.
drop policy if exists messages_select on messages;
create policy messages_select on messages for select using (
  (public.current_user_role() = 'dealership' and dealership_id = public.current_user_dealership_id())
  or (public.current_user_role() = 'installer' and authorized_dealer_id = public.current_user_dealer_id())
);

drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert with check (
  sender_id = auth.uid()
  and sender_role = public.current_user_role()
  and (
    (public.current_user_role() = 'dealership' and dealership_id = public.current_user_dealership_id())
    or (public.current_user_role() = 'installer' and authorized_dealer_id = public.current_user_dealer_id())
  )
);

-- Per-user, per-channel read markers (order_id null = the general channel).
create table if not exists chat_reads (
  user_id        uuid not null references profiles(id) on delete cascade,
  dealership_id  uuid not null references dealerships(id) on delete cascade,
  order_id       uuid references orders(id) on delete cascade,
  last_read_at   timestamptz not null default now(),
  unique nulls not distinct (user_id, dealership_id, order_id)
);

alter table chat_reads enable row level security;
drop policy if exists chat_reads_own on chat_reads;
create policy chat_reads_own on chat_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- Tell Supabase's API layer to pick everything up immediately.
notify pgrst, 'reload schema';
