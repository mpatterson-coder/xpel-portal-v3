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
