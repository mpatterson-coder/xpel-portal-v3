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
